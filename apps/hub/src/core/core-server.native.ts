import { adminPersonSection, adminSectionId, SERVER_PROTOCOL } from '@repo/contracts/universal';
import { env } from '@repo/env/server';
import { Errors, isAppError } from '@repo/errors/universal';
import { log } from '@repo/logger/server';
import { parse } from 'cookie-es';
import { match, P } from 'ts-pattern';
import { coreAdminApi } from './core-admin.native';
import { coreAuditChange, coreAuditStatus } from './core-audit.native';
import { corePairingConnect, corePairingFileHeaders, corePairingRespond } from './core-pairing.native';
import { coreRefusalPage, coreRefusalWanted } from './core-refusal.native';
import { makeCoreRelay } from './core-relay.native';
import type * as CoreTypes from '../types/core.types';
import type { Server } from 'bun';

const DAEMON_PATHS = [/^\/rpc(?:\/|$)/u, /^\/health$/u, /^\/files\//u, /^\/avatars\//u, /^\/embed\//u, /^\/mcp\/callback$/u];
const PUBLIC_PATHS = [/^\/img\/favicon\/[^/]+$/u, /^\/favicon\.ico$/u];
const ADMIN_PAGES = /^\/admin(?:\/|$)/u;
const ADMIN_API = /^\/admin\/api(?:\/|$)/u;
const ADMIN_WEB_FILES = [/^\/assets\//u];
const URL_HEADERS = ['location', 'content-location'];
const REFRESH_URL = /(?<prefix>url\s*=\s*)(?<url>\S+)/iu;
const ACCESS_HEADER = 'cf-access-jwt-assertion';
const ACCESS_COOKIE = 'CF_Authorization';

const STRIPPED_HEADERS = new Set([
  'host',
  'connection',
  'keep-alive',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-length',
  'forwarded',
  'x-real-ip',
  'cf-access-authenticated-user-email',
  'cf-access-client-id',
  'cf-access-client-secret',
  'cf-access-token',
  ACCESS_HEADER,
]);

export function coreServer(services: CoreTypes.CoreServices, publicUrl: URL): Server<CoreTypes.CoreSocket> {
  return Bun.serve<CoreTypes.CoreSocket>({
    hostname: env.HUB_HOST,
    port: env.HUB_PORT,
    idleTimeout: 255,
    routes: { '/hub/health': () => Response.json({ status: 'ok' }) },
    fetch: (request, server) => coreServerHandle(services, { request, publicUrl }, server),
    websocket: makeCoreRelay(services),
    error: (error) => {
      log.error({
        tag: 'hub',
        message: 'Uncaught hub error',
        error,
      });

      return new Response(null, { status: 500 });
    },
  });
}

async function coreServerHandle(
  services: CoreTypes.CoreServices,
  { request, publicUrl }: CoreTypes.CoreIncoming,
  server: Server<CoreTypes.CoreSocket>,
): Promise<Response | undefined> {
  const url = new URL(request.url);
  const segments = url.pathname.slice(1).replace(/\/$/u, '').split('/');

  if (url.pathname !== '/' && segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    return new Response(null, { status: 400 });
  }

  if ((request.method === 'GET' || request.method === 'HEAD') && PUBLIC_PATHS.some((pattern) => pattern.test(url.pathname))) {
    return coreServerWeb({
      request,
      url,
      publicUrl,
    }, null).catch(() => new Response(null, { status: 502 }));
  }

  try {
    const token = request.headers.get(ACCESS_HEADER) ?? parse(request.headers.get('cookie') ?? '')[ACCESS_COOKIE] ?? '';
    const identity = await services.access.queries.verify({ token });
    const isAdminPath = url.pathname.startsWith('/admin');
    const user = isAdminPath ? null : await services.users.queries.find({ email: identity.email });

    if (!user) {
      return await coreServerAdmin(services, {
        request,
        url,
        identity,
        publicUrl,
      });
    }

    return await coreServerRoute(services, {
      request,
      url,
      identity,
      user,
      publicUrl,
    }, server);
  } catch (error) {
    const failure = match(error)
      .when(isAppError, (appError) => appError)
      .otherwise(() => null);

    const status = coreAuditStatus(failure?.code);

    const fields = {
      tag: 'hub',
      message: 'Request refused',
      status,
      path: url.pathname,
      reason: failure?.internal,
    };

    match(status)
      .with(502, () => log.error({ ...fields, error }))
      .otherwise(() => log.warn(fields));

    return new Response(null, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}

async function coreServerAdmin(services: CoreTypes.CoreServices, context: CoreTypes.CoreAdminContext): Promise<Response> {
  const { request, url, identity } = context;

  if (!await services.admins.queries.has({ email: identity.email })) {
    if (coreRefusalWanted(request)) {
      return coreServerRefusal(context, url.pathname.startsWith('/admin') ? 'not-admin' : 'no-user');
    }

    throw new Errors.FORBIDDEN({ internal: url.pathname.startsWith('/admin') ? 'This Access identity is not an admin' : 'No hub user has this Access identity' });
  }

  const isRead = request.method === 'GET' || request.method === 'HEAD';

  return match(url.pathname)
    .when((path) => ADMIN_API.test(path), () => coreAdminApi(services, context))
    .when((path) => ADMIN_PAGES.test(path), () => coreServerWeb(context, identity.token))
    .when((path) => isRead && ADMIN_WEB_FILES.some((pattern) => pattern.test(path)), () => coreServerWeb(context, identity.token))
    .when((path) => path.startsWith('/admin'), async () => new Response(null, { status: 404 }))
    .when(() => coreRefusalWanted(request), async () => new Response(null, { status: 303, headers: { 'Location': '/admin', 'Cache-Control': 'no-store' } }))
    .otherwise(() => {
      throw new Errors.FORBIDDEN({ internal: 'An admin without a hub user reaches only the admin panel' });
    });
}

async function coreServerRefusal({ url, identity }: CoreTypes.CoreAdminContext, reason: CoreTypes.CoreRefusal['reason']): Promise<Response> {
  log.warn({
    tag: 'hub',
    message: 'Request refused with the no-access page',
    status: 403,
    path: url.pathname,
    reason,
  });

  return coreRefusalPage({ email: identity.email, reason });
}

function coreServerRoute(services: CoreTypes.CoreServices, context: CoreTypes.CoreContext, server: Server<CoreTypes.CoreSocket>) {
  const { request, url, identity } = context;

  return match({
    method: request.method,
    path: url.pathname,
    isConnect: request.method === 'GET' && url.pathname === '/connect' && !url.searchParams.has('code'),
  })
    .with({ method: 'GET', path: '/hub/whoami' }, () => coreServerWhoami(services, context))
    .with({ method: 'GET', path: '/hub/pair' }, () => corePairingRespond(services, context))
    .with({ method: 'POST', path: P.string.regex(/^\/hub\/sections\/[a-z]+\/override$/u) }, ({ path }) => coreServerOverride(services, context, path.split('/')[3] ?? ''))
    .with({ path: P.string.startsWith('/hub/') }, () => new Response(null, { status: 404 }))
    .with({ isConnect: true }, async () => {
      const handoff = await corePairingConnect(services, context).catch((error: unknown) => {
        log.warn({
          tag: 'hub',
          message: 'Pairing hand-off failed; showing the connect page',
          user: context.user.id,
          error,
        });

        return null;
      });

      return handoff ?? coreServerWeb(context, identity.token);
    })
    .when(({ path }) => DAEMON_PATHS.some((pattern) => pattern.test(path)), () => coreServerDaemon(services, context, server))
    .otherwise(() => coreServerWeb(context, identity.token));
}

async function coreServerWhoami(services: CoreTypes.CoreServices, { identity, user }: CoreTypes.CoreContext): Promise<Response> {
  const daemon = await services.daemons.actions.resolve({ user }).catch(() => null);

  return Response.json({
    email: identity.email,
    name: user.name ?? null,
    user: user.id,
    serverId: daemon?.serverId ?? null,
    isAdvanced: user.advanced === true,
    sections: services.global.queries.sections({ id: user.id }).map(({ id, mode }) => ({ id, mode })),
  }, { headers: { 'Cache-Control': 'no-store' } });
}

async function coreServerOverride(services: CoreTypes.CoreServices, context: CoreTypes.CoreContext, encoded: string): Promise<Response> {
  const { request, publicUrl, user } = context;
  const isJson = /^application\/json(?:;|$)/iu.test(request.headers.get('content-type') ?? '');

  if (request.headers.get('origin') !== publicUrl.origin || !(isJson || request.headers.has(SERVER_PROTOCOL.versionHeader))) {
    throw new Errors.FORBIDDEN({ internal: 'A section override without a same-origin Origin and a JSON or MeetVinci header' });
  }

  const section = adminSectionId.safeParse(encoded);

  if (!section.success) {
    return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }

  if (user.advanced !== true) {
    throw new Errors.FORBIDDEN({ internal: `${user.id} is not an advanced user and cannot override ${section.data}` });
  }

  if (!adminPersonSection.safeParse(section.data).success) {
    throw new Errors.FORBIDDEN({ internal: `Only the admin overrides ${section.data} for ${user.id}` });
  }

  return coreAuditChange(services, context, {
    action: 'sections/overridden',
    detail: section.data,
    userId: user.id,
  }, async () => {
    if (await services.global.queries.isBroken()) {
      return Response.json({ error: 'global_state_unreadable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }

    const changed = await services.global.actions.mode({
      id: user.id,
      section: section.data,
      mode: 'overridden',
      by: context.identity.email,
    });

    return Response.json({ id: changed.id, mode: changed.mode }, { headers: { 'Cache-Control': 'no-store' } });
  });
}

async function coreServerDaemon(
  services: CoreTypes.CoreServices,
  context: CoreTypes.CoreContext,
  server: Server<CoreTypes.CoreSocket>,
): Promise<Response | undefined> {
  const { request, url, user } = context;
  const daemon = await services.daemons.actions.resolve({ user });
  const target = coreServerTarget(daemon.url, url);

  if (request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
    target.protocol = target.protocol === 'https:' ? 'wss:' : 'ws:';

    const data: CoreTypes.CoreSocket = {
      email: context.identity.email,
      userId: user.id,
      expiresAt: context.identity.expiresAt,
      checker: null,
      target: target.href,
      origin: request.headers.get('origin'),
      pending: [],
      pendingBytes: 0,
      upstream: null,
    };

    return server.upgrade(request, { data }) ? undefined : new Response(null, { status: 426 });
  }

  const headers = coreServerHeaders(context, context.identity.token);

  if (url.pathname.startsWith('/files/') && !headers.has('authorization')) {
    Object.entries(corePairingFileHeaders(request)).forEach(([name, value]) => headers.set(name, value));
  }

  return coreServerForward(context, target, headers).catch((error: unknown) => {
    services.daemons.actions.forget({ user });
    throw new Errors.SERVER_UNREACHABLE({ internal: `The daemon of ${user.id} failed the request`, cause: error });
  });
}

async function coreServerWeb(context: CoreTypes.CoreForward, token: string | null): Promise<Response> {
  const { request, url } = context;

  if (request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
    return new Response(null, { status: 404 });
  }

  const target = coreServerTarget(env.HUB_WEB_URL, url);

  return coreServerForward(context, target, coreServerHeaders(context, token)).catch((error: unknown) => {
    throw new Errors.SERVER_UNREACHABLE({ internal: 'The web app failed the request', cause: error });
  });
}

async function coreServerForward({ request, publicUrl }: CoreTypes.CoreIncoming, target: URL, headers: Headers): Promise<Response> {
  const response = await fetch(target, {
    method: request.method,
    headers,
    body: request.body,
    redirect: 'manual',
    decompress: false,
  });

  const relayed = new Headers(response.headers);
  const internal = [new URL(env.HUB_WEB_URL).origin, target.origin];

  const toPublic = (value: string) => {
    const resolved = URL.parse(value, target);

    return resolved && internal.includes(resolved.origin) ? new URL(`${resolved.pathname}${resolved.search}${resolved.hash}`, publicUrl).href : value;
  };

  URL_HEADERS.forEach((name) => match(relayed.get(name))
    .with(P.string, (value) => relayed.set(name, toPublic(value)))
    .otherwise(() => undefined));
  match(relayed.get('refresh'))
    .with(P.string, (value) => relayed.set('refresh', value.replace(REFRESH_URL, (_all, prefix: string, url: string) => `${prefix}${toPublic(url)}`)))
    .otherwise(() => undefined);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: relayed,
  });
}

function coreServerTarget(base: string, url: URL): URL {
  const target = new URL(base);
  target.pathname = url.pathname;
  target.search = url.search;

  return target;
}

function coreServerHeaders({ request, publicUrl }: CoreTypes.CoreForward, token: string | null): Headers {
  const headers = new Headers(request.headers);

  [...headers.keys()]
    .filter((name) => STRIPPED_HEADERS.has(name) || name.startsWith('x-forwarded-'))
    .forEach((name) => headers.delete(name));
  headers.set('x-forwarded-proto', publicUrl.protocol.slice(0, -1));
  headers.set('x-forwarded-host', publicUrl.host);

  match(token)
    .with(P.string, (verified) => headers.set(ACCESS_HEADER, verified))
    .otherwise(() => headers.delete('cookie'));

  return headers;
}
