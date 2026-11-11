import { serverHealth } from '@repo/contracts/universal';
import { Errors } from '@repo/errors/universal';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { match, P } from 'ts-pattern';
import { z } from 'zod';
import type { ChildProcess } from 'node:child_process';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';

const ROOT = resolve(import.meta.dirname, '../../../..');

const PORTS = {
  hub: 48690,
  access: 48691,
  web: 48692,
  alice: 48693,
  bob: 48694,
  model: 48695,
};

export const HUB_FIXTURE = {
  hub: `http://127.0.0.1:${PORTS.hub}`,
  teamDomain: `http://127.0.0.1:${PORTS.access}`,
  audience: 'hub-test-audience',
  publicOrigin: 'https://team.example',
  web: `http://127.0.0.1:${PORTS.web}`,
  daemons: { alice: `http://127.0.0.1:${PORTS.alice}`, bob: `http://127.0.0.1:${PORTS.bob}` },
  emails: { alice: 'alice@team.example', bob: 'bob@team.example' },
};

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

export interface HubFixtureMintOptions {
  key?: CryptoKey;
  kid?: string;
  alg?: string;
}

export function hubFixtureEncode(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function hubFixtureListen(port: number, handler: (request: IncomingMessage, response: ServerResponse, body: string) => void): Promise<Server> {
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];

    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => handler(request, response, Buffer.concat(chunks).toString('utf8')));
  });

  return new Promise((ready) => {
    server.listen(port, '127.0.0.1', () => ready(server));
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

async function hubFixtureDaemon(root: string, name: 'alice' | 'bob'): Promise<ChildProcess> {
  const data = join(root, name);
  const pi = join(data, 'pi');

  await mkdir(pi, { recursive: true });
  await writeFile(join(pi, 'models.json'), JSON.stringify({ providers: { anthropic: { baseUrl: `http://127.0.0.1:${PORTS.model}` } } }));
  await writeFile(join(pi, 'auth.json'), JSON.stringify({ anthropic: { type: 'api_key', key: 'hub-test-not-real' } }), { mode: 0o600 });

  return spawn('bun', ['src/entry.native.ts'], {
    cwd: join(ROOT, 'apps/daemon'),
    stdio: 'ignore',
    env: hubFixtureEnv({
      HOME: data,
      DATA_DIR: data,
      PI_CODING_AGENT_DIR: pi,
      DAEMON_HOST: '127.0.0.1',
      DAEMON_PORT: String(PORTS[name]),
      WEB_PUBLIC_URL: HUB_FIXTURE.publicOrigin,
      DAEMON_ALLOWED_ORIGINS: HUB_FIXTURE.publicOrigin,
    }),
  });
}

async function hubFixtureServerId(url: string): Promise<string> {
  return serverHealth.parse(await (await fetch(`${url}/health`)).json()).id;
}

export async function hubFixtureFakeSocket(path: string) {
  const requests: string[] = [];

  const server = createServer((request, response) => {
    requests.push(request.url ?? '');
    response.end();
  });

  await mkdir(dirname(path), { recursive: true });
  await new Promise((done) => {
    server.listen(path, () => done(null));
  });

  return {
    requests,
    close: () => new Promise((done) => {
      server.close(done);
    }),
  };
}

export async function hubFixtureStart(emails: typeof HUB_FIXTURE.emails) {
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
    [emails.alice]: { id: 'alice', daemonUrl: HUB_FIXTURE.daemons.alice, socketPath: join(root, 'alice/data/ipc/rpc.sock') },
    [emails.bob]: { id: 'bob', daemonUrl: HUB_FIXTURE.daemons.bob, socketPath: join(root, 'bob/data/ipc/rpc.sock') },
  } satisfies Record<string, HubFixtureUser>;

  await mkdir(hubData, { recursive: true });
  await writeFile(join(hubData, 'users.json'), JSON.stringify({ users }));

  const servers = await Promise.all([
    hubFixtureListen(PORTS.access, (_request, response) => response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ keys: [jwk] }))),
    hubFixtureListen(PORTS.web, (request, response, body) => {
      const relayed = Object.fromEntries(new URL(request.url ?? '/', HUB_FIXTURE.web).searchParams);

      response.writeHead(request.url?.startsWith('/relay') ? 302 : 200, { 'content-type': 'application/json', ...relayed }).end(JSON.stringify({
        web: true,
        path: request.url,
        headers: request.headers,
        body,
      }));
    }),
    hubFixtureListen(PORTS.model, (_request, response, body) => response.writeHead(200, { 'content-type': 'text/event-stream' }).end(hubFixtureModelReply(body))),
  ]);

  const daemons = await Promise.all([
    hubFixtureDaemon(root, 'alice'),
    hubFixtureDaemon(root, 'bob'),
  ]);

  await Promise.all(Object.entries(HUB_FIXTURE.daemons).map(([name, url]) => hubFixtureWait(`daemon ${name}`, `${url}/health`)));

  const hub = spawn('bun', ['src/entry.native.ts'], {
    cwd: join(ROOT, 'apps/hub'),
    stdio: 'ignore',
    env: hubFixtureEnv({
      HUB_HOST: '127.0.0.1',
      HUB_PORT: String(PORTS.hub),
      HUB_DATA_DIR: hubData,
      HUB_WEB_URL: HUB_FIXTURE.web,
      ACCESS_TEAM_DOMAIN: HUB_FIXTURE.teamDomain,
      ACCESS_AUD: HUB_FIXTURE.audience,
      HUB_PUBLIC_URL: HUB_FIXTURE.publicOrigin,
    }),
  });

  await hubFixtureWait('hub', `${HUB_FIXTURE.hub}/hub/health`);

  const serverIds = { alice: await hubFixtureServerId(HUB_FIXTURE.daemons.alice), bob: await hubFixtureServerId(HUB_FIXTURE.daemons.bob) };

  async function mint(claims: Record<string, string | number | string[]>, { key = keys.good.privateKey, kid = 'kid-good', alg = 'RS256' }: HubFixtureMintOptions = {}): Promise<string> {
    const now = Math.floor(Date.now() / 1000);

    const header = hubFixtureEncode({
      alg,
      kid,
      typ: 'JWT',
    });

    const payload = hubFixtureEncode({
      iss: HUB_FIXTURE.teamDomain,
      aud: [HUB_FIXTURE.audience],
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

    await (next ? writeFile(path, JSON.stringify({ users: next })) : rm(path));
    await sleep(1500);
  }

  async function stop(): Promise<void> {
    const children = [hub, ...daemons];

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

  return { root, hubData, keys, users, serverIds, mint, writeUsers, stop };
}

export type HubFixture = Awaited<ReturnType<typeof hubFixtureStart>>;
