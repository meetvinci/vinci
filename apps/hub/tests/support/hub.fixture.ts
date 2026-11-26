import { serverHealth } from '@repo/contracts/universal';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { createServer, request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { match, P } from 'ts-pattern';
import { assert, inject } from 'vitest';
import { z } from 'zod';
import { hubFixtureEnv, hubFixtureExit, hubFixtureReady, hubFixtureSpawn } from './hub-process.fixture';
import { hubFixtureProvisioner } from './hub-provisioner.fixture';
import type { HubFixtureChild } from './hub-process.fixture';
import type { HubFixtureCall } from './hub-provisioner.fixture';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';

function hubFixtureConfig(base: number) {
  const ports = {
    hub: base,
    accounts: base + 1,
    web: base + 2,
    alice: base + 3,
    bob: base + 4,
    model: base + 5,
    provisioner: base + 6,
    byHand: base + 7,
    template: base + 9,
  };

  return {
    ports,
    hub: `http://127.0.0.1:${ports.hub}`,
    accounts: `http://127.0.0.1:${ports.accounts}`,
    accountsToken: 'hub-test-accounts-token',
    publicOrigin: 'https://team.example',
    web: `http://127.0.0.1:${ports.web}`,
    daemons: { alice: `http://127.0.0.1:${ports.alice}`, bob: `http://127.0.0.1:${ports.bob}` },
    template: `http://127.0.0.1:${ports.template}`,
    emails: { alice: 'alice@team.example', bob: 'bob@team.example' },
    admin: 'root@team.example',
    byHand: `http://127.0.0.1:${ports.byHand}`,
    provisionerToken: 'hub-test-provisioner-token',
  };
}

// Each suite takes its own ten ports from the free block the global setup chose for this run (hub-ports.setup.ts).
const HUB_PORT_BASE = inject('hubPortBase');

export const HUB_FIXTURE = hubFixtureConfig(HUB_PORT_BASE);

export const HUB_ADMIN_FIXTURE = hubFixtureConfig(HUB_PORT_BASE + 10);

export const HUB_GLOBAL_FIXTURE = hubFixtureConfig(HUB_PORT_BASE + 20);

export const HUB_RELAY_FIXTURE = hubFixtureConfig(HUB_PORT_BASE + 30);

export const HUB_AUDIT_FIXTURE = hubFixtureConfig(HUB_PORT_BASE + 40);

export type HubFixtureConfig = ReturnType<typeof hubFixtureConfig>;

const modelRequest = z.object({
  model: z.string(),
  messages: z.array(z.object({
    role: z.string(),
    content: z.union([z.string(), z.array(z.object({ text: z.string().optional() }))]),
  })),
});

export interface HubFixtureUser {
  id: string;
  name?: string;
  daemonUrl: string;
  socketPath: string;
  advanced?: true;
}

interface HubFixtureHubOptions {
  label: string;
  port: number;
  data: string;
  extra: Record<string, string>;
}

export interface HubFixtureMintClaims {
  email: string;
  // When the login ends, in seconds since the epoch: an hour from now by default.
  exp?: number;
}

// The browser's login cookie for a token from `mint`.
export function hubFixtureCookie(token: string): string {
  return `vinci_session=${token}`;
}

type HubFixtureHandler = (request: IncomingMessage, response: ServerResponse, body: string) => void;

function hubFixtureListen(label: string, port: number | string, handler: HubFixtureHandler): Promise<Server> {
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];

    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => handler(request, response, Buffer.concat(chunks).toString('utf8')));
  });

  // assert.fail, because vitest prints its message in full and the message of an app error not at all.
  const listen = (address: string, start: (ready: () => void) => void) => new Promise<Server>((ready, fail) => {
    server.once('error', fail);
    start(() => ready(server));
  }).catch((error: unknown) => assert.fail(`The ${label} stub could not listen on ${address}: ${String(error)}`));

  return match(port)
    .with(P.number, (tcp) => listen(`127.0.0.1:${tcp}`, (ready) => server.listen(tcp, '127.0.0.1', ready)))
    .otherwise(async (path) => {
      await mkdir(dirname(path), { recursive: true });

      return listen(path, (ready) => server.listen(path, ready));
    });
}

function hubFixtureModelReply(body: string): string {
  const { model, messages } = modelRequest.parse(JSON.parse(body));
  const content = messages.filter((message) => message.role === 'user').at(-1)?.content ?? '';

  const text = match(content)
    .with(P.string, (plain) => plain)
    .otherwise((blocks) => blocks.map((block) => block.text ?? '').join(' '))
    .trim();

  const message = {
    id: 'msg_hub',
    type: 'message',
    role: 'assistant',
    model,
    content: [],
    stop_reason: null,
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  };

  const tool = /MOCK-TOOL (\w+) (\{.*\})$/u.exec(text);

  const [start, delta] = match(tool)
    .with(P.nonNullable, ([, name, input]) => [{ type: 'tool_use', id: `toolu_${crypto.randomUUID().replaceAll('-', '')}`, name, input: {} }, { type: 'input_json_delta', partial_json: input }])
    .otherwise(() => [{ type: 'text', text: '' }, { type: 'text_delta', text: `Mock reply: ${text.slice(-60)}` }]);

  const events: [string, object][] = [
    ['message_start', { type: 'message_start', message }],
    ['content_block_start', { type: 'content_block_start', index: 0, content_block: start }],
    ['content_block_delta', { type: 'content_block_delta', index: 0, delta }],
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    ['message_delta', { type: 'message_delta', delta: { stop_reason: tool ? 'tool_use' : 'end_turn', stop_sequence: null }, usage: { output_tokens: 3 } }],
    ['message_stop', { type: 'message_stop' }],
  ];

  return events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('');
}

async function hubFixtureDaemon(config: HubFixtureConfig, root: string, name: 'alice' | 'bob' | 'template'): Promise<HubFixtureChild> {
  const data = join(root, name);
  const pi = join(data, 'pi');

  // Bob also has a hand-edited models.json key and a stored entry with an empty key, read once at start (gotchas 12 and 120).
  const extra = match(name)
    .with('bob', () => ({ providers: { mistral: { apiKey: 'dummy-bob-models-json-key' } }, auth: { xai: { type: 'api_key', key: '' } } }))
    .otherwise(() => ({ providers: {}, auth: {} }));

  await mkdir(pi, { recursive: true });
  await writeFile(join(pi, 'models.json'), JSON.stringify({ providers: { anthropic: { baseUrl: `http://127.0.0.1:${config.ports.model}` }, ...extra.providers } }));
  await writeFile(join(pi, 'auth.json'), JSON.stringify({ anthropic: { type: 'api_key', key: `hub-test-${name}` }, ...extra.auth }), { mode: 0o600 });

  // A team daemon prints no pairing PIN, and its keys are dummies; hubFixtureReport still redacts both.
  return hubFixtureSpawn({
    label: `daemon ${name}`,
    app: 'daemon',
    health: `http://127.0.0.1:${config.ports[name]}/health`,
    env: hubFixtureEnv({
      HOME: data,
      DATA_DIR: data,
      PI_CODING_AGENT_DIR: pi,
      DAEMON_HOST: '127.0.0.1',
      DAEMON_PORT: String(config.ports[name]),
      WEB_PUBLIC_URL: config.publicOrigin,
      DAEMON_ALLOWED_ORIGINS: config.publicOrigin,
    }),
  });
}

function hubFixtureHub(config: HubFixtureConfig, { label, port, data, extra }: HubFixtureHubOptions): HubFixtureChild {
  return hubFixtureSpawn({
    label,
    app: 'hub',
    health: `http://127.0.0.1:${port}/hub/health`,
    env: hubFixtureEnv({
      HUB_HOST: '127.0.0.1',
      HUB_PORT: String(port),
      HUB_DATA_DIR: data,
      HUB_WEB_URL: config.web,
      HUB_ACCOUNTS_URL: config.accounts,
      HUB_ACCOUNTS_TOKEN: config.accountsToken,
      HUB_PUBLIC_URL: config.publicOrigin,
      HUB_ADMIN_EMAILS: `${config.admin},${config.emails.alice}`,
      ...extra,
    }),
  });
}

async function hubFixtureServerId(url: string): Promise<string> {
  return serverHealth.parse(await (await fetch(`${url}/health`)).json()).id;
}

export function hubFixtureOwner(socketPath: string, path: string, headers: Record<string, string>): Promise<number | undefined> {
  return new Promise((done, fail) => {
    httpRequest({
      socketPath,
      path: `/rpc/${path}`,
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-bots-protocol': '1', ...headers },
    }, (response) => {
      response.resume();
      response.on('end', () => done(response.statusCode));
    }).on('error', fail).end('{}');
  });
}

export async function hubFixtureFakeSocket(path: string) {
  const requests: HubFixtureCall[] = [];

  const server = await hubFixtureListen('fake owner socket', path, (request, response, body) => {
    requests.push({
      method: request.method ?? '',
      url: request.url ?? '',
      headers: request.headers,
      body,
    });
    response.writeHead(200, { 'content-type': 'application/json', 'set-cookie': 'door=1' }).end(JSON.stringify({ json: { relayed: true } }));
  });

  return {
    requests,
    close: () => new Promise((done) => {
      server.close(done);
    }),
  };
}

// The Laravel API's /internal routes as the hub calls them, with the hub's token only.
function hubFixtureAccounts(
  config: HubFixtureConfig,
  sessions: Map<string, { email: string; exp: number }>,
  request: IncomingMessage,
  response: ServerResponse,
): void {
  const reply = (status: number, body: object) => response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));

  if (request.headers.authorization !== `Bearer ${config.accountsToken}`) {
    reply(401, { message: 'Unauthenticated.' });
    return;
  }

  const token = /(?:^|;\s*)vinci_session=([^;]*)/u.exec(request.headers.cookie ?? '')?.[1] ?? '';
  const session = sessions.get(token);
  const isLive = session !== undefined && session.exp > Date.now() / 1000;
  const url = request.url ?? '';

  match({ method: request.method, url })
    .with({ method: 'GET', url: '/internal/session' }, () => (isLive ? reply(200, { email: session.email, expires_at: session.exp }) : reply(401, { message: 'Unauthenticated.' })))
    .with({ method: 'POST', url: '/internal/session/password' }, () => (isLive ? reply(200, { changed: true }) : reply(401, { message: 'Unauthenticated.' })))
    .with({ method: 'PUT' }, () => reply(200, { created: false }))
    .with({ method: 'POST' }, () => reply(200, { password: 'hub-test-new-password' }))
    .with({ method: 'DELETE' }, () => reply(200, { deleted: true }))
    .otherwise(() => reply(404, { message: 'Not found.' }));
}

export async function hubFixtureStart(config: HubFixtureConfig) {
  const { emails } = config;
  const root = await realpath(await mkdtemp(join(tmpdir(), 'vinci-hub-')));
  const hubData = join(root, 'hub');
  // The Laravel API's logins, as the hub asks for them: token to email and end.
  const sessions = new Map<string, { email: string; exp: number }>();

  const users = {
    [emails.alice]: { id: 'alice', name: 'Alice Example', daemonUrl: config.daemons.alice, socketPath: join(root, 'alice/data/ipc/rpc.sock') },
    [emails.bob]: { id: 'bob', daemonUrl: config.daemons.bob, socketPath: join(root, 'bob/data/ipc/rpc.sock') },
  } satisfies Record<string, HubFixtureUser>;

  const template = { daemonUrl: config.template, socketPath: join(root, 'template/data/ipc/rpc.sock') };
  const byHandData = join(root, 'by-hand');
  const provisioner = hubFixtureProvisioner(config);

  await Promise.all([hubData, byHandData].map(async (directory) => {
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'users.json'), JSON.stringify({ users, template }));
  }));

  const children: HubFixtureChild[] = [];
  const servers: Server[] = [];
  const logs: string[] = [];
  const hubExtra = { PROVISIONER_URL: `http://127.0.0.1:${config.ports.provisioner}`, PROVISIONER_TOKEN: config.provisionerToken, LOG_LEVEL: 'info' };

  // The main hub's output also goes to `logs`, which tests read.
  const startHub = (extra: Record<string, string>) => {
    const hub = hubFixtureHub(config, {
      label: 'hub',
      port: config.ports.hub,
      data: hubData,
      extra,
    });

    children.push(hub);
    [hub.process.stdout, hub.process.stderr].forEach((stream) => stream?.on('data', (chunk: Buffer) => {
      logs.push(chunk.toString());
    }));

    return hubFixtureReady(hub);
  };

  async function boot() {
    const listened = await Promise.allSettled([
      hubFixtureListen('accounts', config.ports.accounts, (request, response) => hubFixtureAccounts(config, sessions, request, response)),
      hubFixtureListen('web app', config.ports.web, (request, response, body) => {
        const relayed = Object.fromEntries(new URL(request.url ?? '/', config.web).searchParams);

        response.writeHead(request.url?.startsWith('/relay') ? 302 : 200, { 'content-type': 'application/json', ...relayed }).end(JSON.stringify({
          web: true,
          path: request.url,
          headers: request.headers,
          body,
        }));
      }),
      hubFixtureListen('model', config.ports.model, (_request, response, body) => response.writeHead(200, { 'content-type': 'text/event-stream' }).end(hubFixtureModelReply(body))),
      hubFixtureListen('provisioner', config.ports.provisioner, provisioner.handle),
    ]);

    servers.push(...listened.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : [])));

    const refused = listened.find((result) => result.status === 'rejected');

    if (refused) {
      throw refused.reason;
    }

    const daemons = await Promise.all((['alice', 'bob', 'template'] as const).map((name) => hubFixtureDaemon(config, root, name)));

    children.push(...daemons);
    await Promise.all(daemons.map((daemon) => hubFixtureReady(daemon)));

    const byHand = hubFixtureHub(config, {
      label: 'by-hand hub',
      port: config.ports.byHand,
      data: byHandData,
      extra: {},
    });

    children.push(byHand);

    const [hub] = await Promise.all([
      startHub(hubExtra),
      hubFixtureReady(byHand),
    ]);

    return { hub, serverIds: { alice: await hubFixtureServerId(config.daemons.alice), bob: await hubFixtureServerId(config.daemons.bob) } };
  }

  async function stop(): Promise<void> {
    await Promise.all(children.map(hubFixtureExit));
    await Promise.all(servers.map((server) => new Promise((done) => {
      server.close(done);
    })));
    await rm(root, { recursive: true, force: true });
  }

  // A setup that fails stops whatever it started, so no daemon outlives the run.
  const booted = await boot().catch(async (error: unknown) => {
    await stop();
    throw error;
  });

  // A login as the API would make it, for the hub to check with the accounts stub.
  async function mint({ email, exp = Math.floor(Date.now() / 1000) + 3600 }: HubFixtureMintClaims): Promise<string> {
    const token = `${sessions.size + 1}|${crypto.randomUUID().replaceAll('-', '')}`;

    sessions.set(token, { email, exp });

    return Promise.resolve(token);
  }

  // Logging out, a password change or a removal: the API forgets the token.
  function revoke(token: string): void {
    sessions.delete(token);
  }

  async function writeUsers(next: Record<string, HubFixtureUser> | null): Promise<void> {
    const path = join(hubData, 'users.json');

    await (next ? writeFile(path, JSON.stringify({ users: next, template })) : rm(path));
    await sleep(1500);
  }

  async function restartHub(extra: Record<string, string>): Promise<void> {
    await hubFixtureExit(booted.hub);
    booted.hub = await startHub({ ...hubExtra, ...extra });
  }

  return {
    root,
    hubData,
    users,
    serverIds: booted.serverIds,
    provisioner: provisioner.calls,
    logs,
    mint,
    revoke,
    writeUsers,
    restartHub,
    stop,
  };
}

export type HubFixture = Awaited<ReturnType<typeof hubFixtureStart>>;
