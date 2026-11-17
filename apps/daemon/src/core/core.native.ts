/* eslint-disable max-lines -- the whole daemon host lives in this one file by design */
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import { OpenAPIHandler } from '@orpc/openapi/fetch';
import { onError } from '@orpc/server';
import { RPCHandler as FetchRPCHandler } from '@orpc/server/fetch';
import { CORSPlugin, RequestHeadersPlugin, ResponseHeadersPlugin } from '@orpc/server/plugins';
import { RPCHandler as WebsocketRPCHandler } from '@orpc/server/websocket';
import { artifactGet, AVATAR, SERVER_PROTOCOL, serverOrigin } from '@repo/contracts/universal';
import { env } from '@repo/env/server';
import { Errors, errorStatusMap, isAppError } from '@repo/errors/universal';
import { log } from '@repo/logger/server';
import { embedFile, embedPage } from '@repo/ui/native';
import { chmod, lstat, mkdir, unlink } from 'node:fs/promises';
import { isIP } from 'node:net';
import { dirname, extname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { match, P } from 'ts-pattern';
import { renderUnicodeCompact } from 'uqr';
import {
  makeAlarmService,
  makeImageService,
  makeInstructionLoaderService,
  makeMcpAuthService,
  makeMcpClientService,
  makePluginLoaderService,
  makeProviderService,
  makeSkillLoaderService,
  makeStorageLockService,
  makeStorageService,
  runtimeEnvNative,
} from '@repo/runtime/native';
import { makeSecretBrokerService, makeSecretProxyService } from '@repo/secret-proxy/native';
import {
  credentialsKeyNative,
  makeAttachmentStorageService,
  makeAvatarImageService,
  makeDatabaseService,
  makeLinkResolverService,
  makeMcpService,
  makeServerNetworkService,
  makeWorkspaceService,
  workspacePathsNative,
  workspacePathsRootNative,
} from '@repo/server/native';
import { coreHandler, makeCredentialsService, makeSecretService, makeServices, makeSettingsService, router } from '@repo/server/server';
import { coreFilesRange } from './core-files.native';
import type * as CoreTypes from '../types/core.types';
import type { RouterClient } from '@orpc/server';
import type { RPCHandlerOptions } from '@orpc/server/fetch';
import type { Server } from 'bun';

const HELP = `Usage:
  vinci start
  vinci pair [--url <origin>]

Without a command, the daemon starts in the foreground.
`;

const ROOT = workspacePathsRootNative(env.DATA_DIR);
const SOCKET = join(ROOT, 'data', 'ipc', 'rpc.sock');
const STOP_SIGNALS = ['SIGINT', 'SIGTERM'] as const;
const OWNER_ONLY = 0o700;
const AVATAR_BOT = /^(?<id>[\da-f-]{36})\.png$/u;
const AVATAR_IMAGE = /^(?<id>[\da-f-]{36})\.webp$/u;
const ALLOWED_ORIGINS = [...env.DAEMON_ALLOWED_ORIGINS, ...env.DAEMON_PUBLIC_URLS];

export async function coreNativeCommand(): Promise<void> {
  const { positionals, values } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      url: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  await match({
    command: positionals,
    url: values.url,
    help: values.help,
  })
    .with({ help: true }, { command: ['help'] }, () => process.stdout.write(HELP))
    .with({ command: [], url: undefined }, { command: ['start'], url: undefined }, () => coreNativeRun())
    .with({ command: ['pair'] }, () => coreNativePair(values.url))
    .otherwise(() => {
      throw new Errors.INTERNAL_ERROR({ internal: HELP });
    });
}

async function coreNativeRun(): Promise<void> {
  await using resources = new AsyncDisposableStack();

  const stopped = new Promise<void>((done) => {
    const stop = (): void => done();

    for (const signal of STOP_SIGNALS) {
      process.once(signal, stop);
    }

    resources.defer(() => {
      for (const signal of STOP_SIGNALS) {
        process.off(signal, stop);
      }
    });
  });

  const services = await coreNativeServices(resources);

  const network = coreNativeNetwork(services);
  resources.defer(() => network.stop(true));

  const local = await coreNativeLocal(services);
  resources.defer(() => local.stop(true));

  log.info({
    tag: 'daemon',
    message: 'Daemon started',
    host: env.DAEMON_HOST,
    port: network.port,
  });

  await stopped;
  log.info({ tag: 'daemon', message: 'Daemon stopped' });
}

async function coreNativeServices(resources: AsyncDisposableStack): Promise<CoreTypes.CoreServices> {
  const paths = await workspacePathsNative(env.DATA_DIR);

  const lock = await makeStorageLockService({ path: paths.lock });
  resources.defer(() => lock.close());
  const alarm = makeAlarmService();
  resources.defer(() => alarm.close());

  const database = makeDatabaseService({ path: paths.database });
  resources.defer(() => database.close());
  await database.migrate();

  const providers = await makeProviderService();
  resources.defer(() => providers.close());
  const credentials = makeCredentialsService({ database, key: await credentialsKeyNative(paths.data) });
  const mcpAuth = makeMcpAuthService({ credentials, appName: env.APP_NAME });
  resources.defer(() => mcpAuth.close());
  const settings = makeSettingsService({ database });
  const secrets = makeSecretService({ credentials, settings });

  const secretsFolder = join(paths.data, 'secrets');

  const secretProxy = makeSecretProxyService({
    source: secrets,
    folder: secretsFolder,
    sandboxDir: env.DAEMON_SANDBOX_DIR,
    internalAllow: env.VINCI_INTERNAL_ALLOW,
  });

  resources.defer(() => secretProxy.actions.stop());

  const executionEnv = runtimeEnvNative({
    root: paths.root,
    sandboxDir: env.DAEMON_SANDBOX_DIR,
    bridge: join(dirname(Bun.main), `entry-sandbox-bridge.native${extname(Bun.main)}`),
  });

  const isSandboxed = env.DAEMON_SANDBOX_DIR !== undefined;
  resources.defer(() => executionEnv.close());

  const mcpClients = makeMcpClientService({
    root: paths.root,
    auth: mcpAuth,
    executionEnv,
  });

  resources.defer(() => mcpClients.close());

  const services = await makeServices({
    database,
    attachmentStorage: makeAttachmentStorageService({ root: paths.root, isSandboxed }),
    avatarImages: makeAvatarImageService({ root: join(paths.data, 'avatars') }),
    credentials,
    secrets,
    settings,
    workspace: makeWorkspaceService({ root: paths.root }),
    skillLoader: makeSkillLoaderService({ root: paths.root, isSandboxed }),
    instructionLoader: makeInstructionLoaderService({ root: paths.root, isSandboxed }),
    pluginLoader: makePluginLoaderService({ root: paths.root, isSandboxed }),
    mcp: makeMcpService({
      root: paths.root,
      isSandboxed,
      settings,
      clients: mcpClients,
      credentials,
      secrets,
    }),
    mcpAuth,
    network: makeServerNetworkService({
      host: env.DAEMON_HOST,
      port: env.DAEMON_PORT,
      publicUrls: env.DAEMON_PUBLIC_URLS,
    }),
    linkResolver: makeLinkResolverService(),
    appScheme: env.MOBILE_SCHEME,
    providers,
    runtime: {
      appName: env.APP_NAME,
      storage: makeStorageService({ root: paths.bots }),
      alarm,
      models: providers.models,
      env: executionEnv.env,
      images: await makeImageService(),
      secrets: makeSecretBrokerService({
        source: secrets,
        proxy: secretProxy,
        folder: secretsFolder,
        varlock: Bun.which('varlock'),
      }),
    },
  });

  resources.defer(() => services.runtime.close());
  resources.defer(await services.notifications.actions.watch());

  return services;
}

function coreNativeRpc(services: CoreTypes.CoreServices, isLocal: boolean) {
  const plugins = [new RequestHeadersPlugin(), new ResponseHeadersPlugin()];
  const cors = new CORSPlugin({ origin: ALLOWED_ORIGINS });

  const interceptors: RPCHandlerOptions<object>['interceptors'] = [onError((error, { path }) => {
    const fields = { tag: 'rpc', message: 'Request failed', path: path.join('.') };

    if (isAppError(error) && !error.reportable) {
      log.warn({
        ...fields,
        code: error.code,
        reason: error.internal,
        data: error.data,
      });
      return;
    }

    log.error({ ...fields, error });
  })];

  return {
    context: { ...services, isLocal, peerAddress: null },
    http: new FetchRPCHandler(router, {
      plugins: [...plugins, cors],
      interceptors,
      errorStatusMap,
    }),
    files: new OpenAPIHandler({ download: router.attachments.download, poster: router.attachments.poster }, {
      plugins: [...plugins, cors],
      interceptors,
      errorStatusMap,
    }),
    websocket: new WebsocketRPCHandler(router, {
      plugins,
      interceptors,
      errorStatusMap,
    }),
  };
}

function coreNativeNetwork(services: CoreTypes.CoreServices) {
  const rpc = coreNativeRpc(services, false);
  const peer = (request: Request, server: Server<undefined>) => server.requestIP(request)?.address ?? null;

  const handleRpc = coreNativeOrigin(services, async (request, server) => coreNativeReply(
    await rpc.http.handle(request, { prefix: '/rpc', context: { ...rpc.context, peerAddress: peer(request, server) } }),
    'no-store',
  ));

  const handleFiles = coreNativeOrigin(services, async (request, server) => coreFilesRange(coreNativeReply(
    await rpc.files.handle(request, { prefix: '/files', context: { ...rpc.context, peerAddress: peer(request, server) } }),
    'private, max-age=31536000, immutable',
  )));

  return Bun.serve({
    hostname: env.DAEMON_HOST,
    port: env.DAEMON_PORT,
    maxRequestBodySize: 12 * 1024 * 1024,
    routes: {
      '/rpc': {
        GET: coreNativeOrigin(services, (request, server) => (server.upgrade(request, { data: undefined }) ? undefined : new Response(null, { status: 426 }))),
        POST: handleRpc,
        OPTIONS: handleRpc,
      },
      '/rpc/*': { POST: handleRpc, OPTIONS: handleRpc },
      '/files/*': { GET: handleFiles, OPTIONS: handleFiles },
      '/avatars/bots/:file': {
        GET: (request, server) => coreNativePublic(services, peer(request, server), async () => {
          const botId = AVATAR_BOT.exec(request.params.file)?.groups?.id;

          return botId
            ? new Response(new Uint8Array(await services.avatars.queries.bot({ botId })), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-cache' } })
            : new Response(null, { status: 404 });
        }),
      },
      '/avatars/:file': {
        GET: (request, server) => coreNativePublic(services, peer(request, server), async () => {
          const imageId = AVATAR_IMAGE.exec(request.params.file)?.groups?.id;

          return imageId
            ? new Response(new Uint8Array(await services.avatars.queries.image({ imageId })), { headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=31536000, immutable' } })
            : new Response(null, { status: 404 });
        }),
      },
      '/embed/artifacts/:botId/:conversationId/:artifactId': {
        GET: (request, server) => coreNativePublic(services, peer(request, server), async () => {
          await services.auth.queries.authenticate({ authorization: request.headers.get('authorization') });

          const { botId, conversationId, artifactId } = request.params;

          const target = artifactGet.safeParse({
            botId,
            conversationId: Number(conversationId),
            artifactId,
          });

          if (!target.success) {
            return new Response(null, { status: 404 });
          }

          const artifact = await services.artifacts.queries.get(target.data);
          const theme = new URL(request.url).searchParams.get('theme') === 'dark' ? 'dark' : 'light';

          return match(artifact.spec)
            .with({ html: P.string }, () => new Response(null, { status: 404 }))
            .otherwise(async (spec) => new Response(await embedPage({ artifact: { title: artifact.title, spec }, theme }), {
              headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'no-store',
                'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src https: data:",
                'Referrer-Policy': 'no-referrer',
              },
            }));
        }),
      },
      '/embed/*': { GET: async (request) => await embedFile(new URL(request.url).pathname) ?? new Response(null, { status: 404 }) },
    },
    fetch: (request) => coreHandler(request, services),
    websocket: {
      maxPayloadLength: 1024 * 1024,
      backpressureLimit: 4 * 1024 * 1024,
      closeOnBackpressureLimit: true,
      async message(socket, message) {
        await rpc.websocket.message(socket, message, { context: { ...rpc.context, peerAddress: socket.remoteAddress } });
      },
      async close(socket) {
        await rpc.websocket.close(socket);
      },
    },
  });
}

async function coreNativeLocal(services: CoreTypes.CoreServices) {
  const directory = dirname(SOCKET);
  await mkdir(directory, { recursive: true, mode: OWNER_ONLY });
  await chmod(directory, OWNER_ONLY);

  const folder = await lstat(directory);

  if (!folder.isDirectory() || (folder.mode & 0o777) !== OWNER_ONLY || folder.uid !== process.getuid?.()) {
    throw new Errors.INTERNAL_ERROR({ internal: 'Local IPC directory must be an owner-only directory' });
  }

  const stale = await lstat(SOCKET).catch(() => null);

  if (stale && !stale.isSocket()) {
    throw new Errors.INTERNAL_ERROR({ internal: 'Local IPC path exists and is not a socket' });
  }

  if (stale) {
    await unlink(SOCKET);
  }

  const rpc = coreNativeRpc(services, true);

  const server = Bun.serve({
    unix: SOCKET,
    maxRequestBodySize: AVATAR.maxBytes + 1024 * 1024,
    routes: {
      '/rpc/*': {
        POST: async (request) => (request.headers.has('origin')
          ? new Response(null, { status: 403 })
          : coreNativeReply(await rpc.http.handle(request, { prefix: '/rpc', context: rpc.context }), 'no-store')),
      },
    },
    fetch: (request) => new Response(null, { status: request.headers.has('origin') ? 403 : 404 }),
  });

  try {
    await chmod(SOCKET, 0o600);
  } catch (error) {
    await server.stop(true);
    throw error;
  }

  return server;
}

function coreNativeOrigin<T extends Request>(services: CoreTypes.CoreServices, handler: CoreTypes.CoreHandler<T>): CoreTypes.CoreHandler<T> {
  return (request, server) => {
    const origin = request.headers.get('origin');
    const parsed = URL.parse(origin ?? '');
    const hostname = parsed?.hostname.replace(/^\[|\]$/gu, '') ?? '';

    const isAllowed = origin === null
      || ALLOWED_ORIGINS.includes(parsed?.origin ?? origin)
      || isIP(hostname) !== 0
      || hostname === 'localhost'
      || hostname.endsWith('.localhost');

    if (isAllowed) {
      return handler(request, server);
    }

    return services.server.queries.info().then(({ addresses }) => (addresses.some(({ url }) => url === parsed?.origin)
      ? handler(request, server)
      : new Response(null, { status: 403 })));
  };
}

function coreNativeReply(result: { matched: true; response: Response } | { matched: false }, cacheControl: string): Response {
  if (!result.matched) {
    return new Response(null, { status: 404 });
  }

  result.response.headers.set('Cache-Control', result.response.ok ? cacheControl : 'no-store');
  result.response.headers.set('X-Content-Type-Options', 'nosniff');

  return result.response;
}

async function coreNativePublic(services: CoreTypes.CoreServices, peer: string | null, respond: () => Promise<Response>): Promise<Response> {
  try {
    await services.limits.throttle({ kind: 'public', peer });

    const response = await respond();
    response.headers.set('X-Content-Type-Options', 'nosniff');

    return response;
  } catch (error) {
    const status = isAppError(error) ? errorStatusMap[error.code] : undefined;

    if (status === undefined) {
      throw error;
    }

    return new Response(null, { status });
  }
}

async function coreNativePair(url = env.WEB_PUBLIC_URL): Promise<void> {
  const client = createORPCClient<RouterClient<typeof router>>(new RPCLink({
    origin: 'http://localhost',
    url: '/rpc',
    headers: { [SERVER_PROTOCOL.versionHeader]: String(SERVER_PROTOCOL.version) },
    fetch: (request, init) => fetch(request, { ...init, unix: SOCKET }),
  }));

  const { pin, qr } = await client.pairing.bootstrap();

  process.stdout.write(`PIN ${pin}\n\n${coreNativePairingText(qr, serverOrigin.parse(url))}`);
}

function coreNativePairingText(qr: CoreTypes.CorePairingCode, serverUrl: string | URL): string {
  const web = new URL(`/connect#code=${encodeURIComponent(qr.payload)}`, serverUrl).href;

  return `Web: ${web}\n\nApp: ${qr.link}\n\n${renderUnicodeCompact(qr.link)}\n`;
}
