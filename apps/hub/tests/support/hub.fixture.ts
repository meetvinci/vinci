import { serverHealth } from '@repo/contracts/universal';
import { Errors } from '@repo/errors/universal';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { createServer, request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { match, P } from 'ts-pattern';
import { z } from 'zod';
import type { ChildProcess } from 'node:child_process';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';

const ROOT = resolve(import.meta.dirname, '../../../..');

function hubFixtureConfig(base: number) {
  const ports = {
    hub: base,
    access: base + 1,
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
    teamDomain: `http://127.0.0.1:${ports.access}`,
    audience: 'hub-test-audience',
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

export const HUB_FIXTURE = hubFixtureConfig(Number(process.env.HUB_TEST_PORT ?? 48690));

export const HUB_ADMIN_FIXTURE = hubFixtureConfig(Number(process.env.HUB_TEST_ADMIN_PORT ?? 48610));

export const HUB_GLOBAL_FIXTURE = hubFixtureConfig(Number(process.env.HUB_TEST_GLOBAL_PORT ?? 48630));

export const HUB_RELAY_FIXTURE = hubFixtureConfig(Number(process.env.HUB_TEST_RELAY_PORT ?? 48650));

export const HUB_AUDIT_FIXTURE = hubFixtureConfig(Number(process.env.HUB_TEST_AUDIT_PORT ?? 48670));

export type HubFixtureConfig = ReturnType<typeof hubFixtureConfig>;

interface HubFixtureAccess {
  domains: string[];
  missing: string[];
  isDown: boolean;
  admins: string[];
}

interface HubFixtureCall {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

const modelRequest = z.object({
  model: z.string(),
  messages: z.array(z.object({
    role: z.string(),
    content: z.union([z.string(), z.array(z.object({ text: z.string().optional() }))]),
  })),
});

export interface HubFixtureUser {
  id: string;
  daemonUrl: string;
  socketPath: string;
}

interface HubFixtureHubOptions {
  port: number;
  data: string;
  extra: Record<string, string>;
}

export interface HubFixtureMintOptions {
  key?: CryptoKey;
  kid?: string;
  alg?: string;
}

export function hubFixtureEncode(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function hubFixtureListen(port: number | string, handler: (request: IncomingMessage, response: ServerResponse, body: string) => void): Promise<Server> {
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];

    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => handler(request, response, Buffer.concat(chunks).toString('utf8')));
  });

  return match(port)
    .with(P.number, (tcp) => new Promise<Server>((ready) => {
      server.listen(tcp, '127.0.0.1', () => ready(server));
    }))
    .otherwise(async (path) => {
      await mkdir(dirname(path), { recursive: true });

      return new Promise<Server>((ready) => {
        server.listen(path, () => ready(server));
      });
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

  const events: [string, object][] = [
    ['message_start', { type: 'message_start', message }],
    ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
    ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: `Mock reply: ${text.slice(-60)}` } }],
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    ['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 3 } }],
    ['message_stop', { type: 'message_stop' }],
  ];

  return events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('');
}

async function hubFixtureWait(label: string, url: string, deadline = Date.now() + 90_000): Promise<void> {
  const response = await fetch(url).catch(() => null);

  if (response?.ok) {
    return;
  }

  if (Date.now() > deadline) {
    throw new Errors.INTERNAL_ERROR({ internal: `Timed out waiting for ${label}` });
  }

  await sleep(250);
  await hubFixtureWait(label, url, deadline);
}

function hubFixtureEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  const kept = Object.entries(process.env).filter(([name]) => !name.endsWith('_API_KEY') && !['DATA_DIR', 'PI_CODING_AGENT_DIR', 'HOME'].includes(name));

  return { ...Object.fromEntries(kept), LOG_LEVEL: 'warn', ...extra };
}

async function hubFixtureDaemon(config: HubFixtureConfig, root: string, name: 'alice' | 'bob' | 'template'): Promise<ChildProcess> {
  const data = join(root, name);
  const pi = join(data, 'pi');

  await mkdir(pi, { recursive: true });
  await writeFile(join(pi, 'models.json'), JSON.stringify({ providers: { anthropic: { baseUrl: `http://127.0.0.1:${config.ports.model}` } } }));
  await writeFile(join(pi, 'auth.json'), JSON.stringify({ anthropic: { type: 'api_key', key: `hub-test-${name}` } }), { mode: 0o600 });

  return spawn('bun', ['src/entry.native.ts'], {
    cwd: join(ROOT, 'apps/daemon'),
    stdio: 'ignore',
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

function hubFixtureProvisioner({ emails, provisionerToken }: HubFixtureConfig) {
  const calls: HubFixtureCall[] = [];

  const userBody = z.object({
    name: z.string(),
    email: z.string(),
    enabled: z.boolean(),
  });

  const users = new Map(Object.entries(emails).map(([id, email]) => [id, {
    id,
    name: id,
    email,
    enabled: true,
    state: 'running',
  }]));

  const access: HubFixtureAccess = { domains: [], missing: [], isDown: false, admins: [] };

  const accessRule = () => ({
    domains: access.domains,
    emails: [...[...users.values()].filter((user) => user.enabled).map((user) => user.email), ...access.admins]
      .filter((email) => !access.missing.includes(email) && !access.domains.some((domain) => email.endsWith(`@${domain}`))),
  });

  const handle = (request: IncomingMessage, response: ServerResponse, body: string) => {
    const [, kind = '', id = ''] = (request.url ?? '').split('/');

    calls.push({
      method: request.method ?? '',
      url: request.url ?? '',
      headers: request.headers,
      body,
    });

    if (request.headers.authorization !== `Bearer ${provisionerToken}`) {
      response.writeHead(401).end();
      return;
    }

    match({ method: request.method, kind })
      .with({ method: 'GET', kind: 'users' }, () => response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ users: [...users.values()] })))
      .with({ method: 'PUT', kind: 'users' }, () => {
        users.set(id, {
          id,
          ...userBody.parse(JSON.parse(body)),
          state: 'running',
        });
        response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ access: 'synced' }));
      })
      .with({ method: 'DELETE', kind: 'users' }, () => {
        users.delete(id);
        response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ access: 'synced' }));
      })
      .with({ method: 'PUT', kind: 'access' }, () => {
        access.admins = z.object({ emails: z.array(z.string()) }).parse(JSON.parse(body)).emails;
        response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ access: 'synced' }));
      })
      .with({ method: 'GET', kind: 'access' }, () => (access.isDown
        ? response.writeHead(500).end()
        : response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(accessRule()))))
      .otherwise(() => response.writeHead(404).end());
  };

  return { calls, access, handle };
}

function hubFixtureHub(config: HubFixtureConfig, { port, data, extra }: HubFixtureHubOptions): ChildProcess {
  return spawn('bun', ['src/entry.native.ts'], {
    cwd: join(ROOT, 'apps/hub'),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: hubFixtureEnv({
      HUB_HOST: '127.0.0.1',
      HUB_PORT: String(port),
      HUB_DATA_DIR: data,
      HUB_WEB_URL: config.web,
      ACCESS_TEAM_DOMAIN: config.teamDomain,
      ACCESS_AUD: config.audience,
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

  const server = await hubFixtureListen(path, (request, response, body) => {
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

export async function hubFixtureStart(config: HubFixtureConfig) {
  const { emails } = config;
  const root = await realpath(await mkdtemp(join(tmpdir(), 'orbs-hub-')));
  const hubData = join(root, 'hub');
  const algorithm = { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };
  const keys = { good: await crypto.subtle.generateKey(algorithm, true, ['sign', 'verify']), rogue: await crypto.subtle.generateKey(algorithm, true, ['sign', 'verify']) };

  const jwk = {
    ...(await crypto.subtle.exportKey('jwk', keys.good.publicKey)),
    kid: 'kid-good',
    alg: 'RS256',
    use: 'sig',
  };

  const users = {
    [emails.alice]: { id: 'alice', daemonUrl: config.daemons.alice, socketPath: join(root, 'alice/data/ipc/rpc.sock') },
    [emails.bob]: { id: 'bob', daemonUrl: config.daemons.bob, socketPath: join(root, 'bob/data/ipc/rpc.sock') },
  } satisfies Record<string, HubFixtureUser>;

  const template = { daemonUrl: config.template, socketPath: join(root, 'template/data/ipc/rpc.sock') };
  const byHandData = join(root, 'by-hand');
  const provisioner = hubFixtureProvisioner(config);

  await Promise.all([hubData, byHandData].map(async (directory) => {
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'users.json'), JSON.stringify({ users, template }));
  }));

  const servers = await Promise.all([
    hubFixtureListen(config.ports.access, (_request, response) => response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ keys: [jwk] }))),
    hubFixtureListen(config.ports.web, (request, response, body) => {
      const relayed = Object.fromEntries(new URL(request.url ?? '/', config.web).searchParams);

      response.writeHead(request.url?.startsWith('/relay') ? 302 : 200, { 'content-type': 'application/json', ...relayed }).end(JSON.stringify({
        web: true,
        path: request.url,
        headers: request.headers,
        body,
      }));
    }),
    hubFixtureListen(config.ports.model, (_request, response, body) => response.writeHead(200, { 'content-type': 'text/event-stream' }).end(hubFixtureModelReply(body))),
    hubFixtureListen(config.ports.provisioner, provisioner.handle),
  ]);

  const daemons = await Promise.all([
    hubFixtureDaemon(config, root, 'alice'),
    hubFixtureDaemon(config, root, 'bob'),
    hubFixtureDaemon(config, root, 'template'),
  ]);

  await Promise.all(Object.entries({ ...config.daemons, template: config.template }).map(([name, url]) => hubFixtureWait(`daemon ${name}`, `${url}/health`)));

  const hubs = [
    hubFixtureHub(config, {
      port: config.ports.hub,
      data: hubData,
      extra: { PROVISIONER_URL: `http://127.0.0.1:${config.ports.provisioner}`, PROVISIONER_TOKEN: config.provisionerToken, LOG_LEVEL: 'info' },
    }),
    hubFixtureHub(config, {
      port: config.ports.byHand,
      data: byHandData,
      extra: {},
    }),
  ];

  const logs: string[] = [];

  hubs.forEach((child, index) => [child.stdout, child.stderr].forEach((stream) => stream?.on('data', (chunk: Buffer) => {
    if (index === 0) {
      logs.push(chunk.toString());
    }
  })));

  await hubFixtureWait('hub', `${config.hub}/hub/health`);
  await hubFixtureWait('by-hand hub', `${config.byHand}/hub/health`);

  const serverIds = { alice: await hubFixtureServerId(config.daemons.alice), bob: await hubFixtureServerId(config.daemons.bob) };

  async function mint(claims: Record<string, string | number | string[]>, { key = keys.good.privateKey, kid = 'kid-good', alg = 'RS256' }: HubFixtureMintOptions = {}): Promise<string> {
    const now = Math.floor(Date.now() / 1000);

    const header = hubFixtureEncode({
      alg,
      kid,
      typ: 'JWT',
    });

    const payload = hubFixtureEncode({
      iss: config.teamDomain,
      aud: [config.audience],
      iat: now,
      nbf: now,
      exp: now + 3600,
      type: 'app',
      ...claims,
    });

    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${payload}`));

    return `${header}.${payload}.${Buffer.from(signature).toString('base64url')}`;
  }

  async function writeUsers(next: Record<string, HubFixtureUser> | null): Promise<void> {
    const path = join(hubData, 'users.json');

    await (next ? writeFile(path, JSON.stringify({ users: next, template })) : rm(path));
    await sleep(1500);
  }

  async function stop(): Promise<void> {
    const children = [...hubs, ...daemons];

    children.forEach((child) => child.kill('SIGTERM'));
    await Promise.all(children.map((child) => new Promise((done) => {
      if (child.exitCode === null) {
        child.once('exit', done);
      } else {
        done(null);
      }
    })));
    await Promise.all(servers.map((server) => new Promise((done) => {
      server.close(done);
    })));
    await rm(root, { recursive: true, force: true });
  }

  return {
    root,
    hubData,
    keys,
    users,
    serverIds,
    provisioner: provisioner.calls,
    access: provisioner.access,
    logs,
    mint,
    writeUsers,
    stop,
  };
}

export type HubFixture = Awaited<ReturnType<typeof hubFixtureStart>>;
