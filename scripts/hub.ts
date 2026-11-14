import { timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import type { Server, ServerWebSocket, Subprocess } from 'bun';

// `bun run dev:web`: the dev daemon, a local hub and Vite behind a dev door that plays Cloudflare Access with one
// fixed identity. Development only: the hub image bundles apps/hub alone, and the hub has no switch for this door.
// The hub trusts the door only because ACCESS_TEAM_DOMAIN points at it, which this script sets for its own hub.
const DEV = {
  email: 'dev@example.com',
  user: 'dev',
  name: 'Developer',
  audience: 'meetvinci-dev',
  kid: 'meetvinci-dev',
  port: 47190,
  data: '~/.config/meetvinci-dev',
  tokenSeconds: 3600,
  tokenRenewSeconds: 300,
  loginSeconds: 30 * 24 * 3600,
  certsPath: '/cdn-cgi/access/certs',
  loginPath: '/cdn-cgi/access/login',
  accessHeader: 'cf-access-jwt-assertion',
  accessCookie: 'CF_Authorization',
  loopback: ['127.0.0.1', '::1', '::ffff:127.0.0.1'],
  loopbackHosts: ['localhost', '127.0.0.1', '[::1]'],
  stopSignals: ['SIGINT', 'SIGTERM'],
  stopGraceMs: 3000,
} as const;

const root = path.resolve(import.meta.dir, '..');
const algorithm = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };

interface DevSocket {
  target: string;
  headers: Record<string, string>;
  pending: (string | Uint8Array)[];
  upstream: WebSocket | null;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function encode(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

// One signing key per dev data folder, so a phone's login cookie outlives a restart.
async function devKey(file: string): Promise<{ privateKey: CryptoKey; publicJwk: JsonWebKey }> {
  const stored = existsSync(file) ? JSON.parse(await readFile(file, 'utf8')) as JsonWebKey : null;

  const generated = {
    ...algorithm,
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
  };

  const privateJwk = stored ?? await crypto.subtle.generateKey(generated, true, ['sign', 'verify'])
    .then(({ privateKey }) => crypto.subtle.exportKey('jwk', privateKey));

  if (!stored) {
    await writeFile(file, JSON.stringify(privateJwk), { mode: 0o600 });
  }

  return {
    privateKey: await crypto.subtle.importKey('jwk', privateJwk, algorithm, false, ['sign']),
    publicJwk: { kty: 'RSA', n: privateJwk.n, e: privateJwk.e, alg: 'RS256', use: 'sig', kid: DEV.kid } as JsonWebKey,
  };
}

async function dev() {
  const { values } = parseArgs({
    args: process.argv.slice(3),
    options: {
      url: { type: 'string' },
      port: { type: 'string', default: String(DEV.port) },
      data: { type: 'string', default: DEV.data },
    },
  });

  const base = Number(values.port);

  if (!Number.isInteger(base) || base < 1 || base > 65532) {
    fail(`--port takes the first of four free ports: ${values.port}`);
  }

  const ports = { door: base, daemon: base + 1, hub: base + 2, web: base + 3 };
  const door = `http://127.0.0.1:${ports.door}`;
  const hub = `http://127.0.0.1:${ports.hub}`;
  const publicUrl = values.url ? URL.parse(values.url)?.origin ?? fail(`--url is not an address: ${values.url}`) : `http://localhost:${ports.door}`;
  // A phone or another computer reaches the door only with --url; it then logs in once through the printed link.
  const host = values.url ? '0.0.0.0' : '127.0.0.1';
  const data = path.resolve(values.data.replace(/^~(?=\/|$)/u, homedir()));
  const hubData = path.join(data, 'hub');
  const secret = values.url ? crypto.randomUUID() : null;

  await mkdir(hubData, { recursive: true, mode: 0o700 });
  await writeFile(path.join(hubData, 'users.json'), JSON.stringify({
    users: { [DEV.email]: { id: DEV.user, name: DEV.name, daemonUrl: `http://127.0.0.1:${ports.daemon}`, socketPath: path.join(data, 'data/ipc/rpc.sock') } },
  }));

  const key = await devKey(path.join(hubData, 'dev-access-key.json'));
  let token = { value: '', expiresAt: 0 };

  async function mint(seconds: number): Promise<string> {
    const now = Math.floor(Date.now() / 1000);

    const header = encode({
      alg: 'RS256',
      kid: DEV.kid,
      typ: 'JWT',
    });

    const claims = encode({
      iss: door,
      aud: [DEV.audience],
      email: DEV.email,
      iat: now,
      nbf: now,
      exp: now + seconds,
      type: 'app',
    });

    const signature = await crypto.subtle.sign(algorithm, key.privateKey, new TextEncoder().encode(`${header}.${claims}`));

    return `${header}.${claims}.${Buffer.from(signature).toString('base64url')}`;
  }

  async function loopbackToken(): Promise<string> {
    if (token.expiresAt - Date.now() < DEV.tokenRenewSeconds * 1000) {
      token = { value: await mint(DEV.tokenSeconds), expiresAt: Date.now() + DEV.tokenSeconds * 1000 };
    }

    return token.value;
  }

  async function forward(request: Request, server: Server<DevSocket>): Promise<Response | undefined> {
    const url = new URL(request.url);
    const target = new URL(`${url.pathname}${url.search}`, hub);
    const headers = new Headers(request.headers);

    // The Host check keeps a DNS-rebinding page (evil.example resolving to 127.0.0.1) in this Mac's browser from getting the identity.
    const isLoopback = (DEV.loopback as readonly string[]).includes(server.requestIP(request)?.address ?? '')
      && (DEV.loopbackHosts as readonly string[]).includes(url.hostname);

    headers.delete('host');
    headers.delete(DEV.accessHeader);

    if (isLoopback) {
      headers.set(DEV.accessHeader, await loopbackToken());
    } else if (!request.headers.get('cookie')?.includes(`${DEV.accessCookie}=`)) {
      return new Response('Not logged in: open the login link that `bun run dev:web --url` printed, once on this device.\n', { status: 401 });
    }

    if (request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
      target.protocol = 'ws:';

      const relayed = ['origin', 'cookie', DEV.accessHeader].flatMap((name) => {
        const value = headers.get(name);

        return value ? [[name, value]] : [];
      });

      const socket: DevSocket = {
        target: target.href,
        headers: Object.fromEntries(relayed),
        pending: [],
        upstream: null,
      };

      return server.upgrade(request, { data: socket }) ? undefined : new Response(null, { status: 426 });
    }

    return fetch(target, {
      method: request.method,
      headers,
      body: request.body,
      redirect: 'manual',
      decompress: false,
    });
  }

  async function login(url: URL): Promise<Response> {
    const given = Buffer.from(url.searchParams.get('secret') ?? '');

    if (!secret || given.length !== secret.length || !timingSafeEqual(given, Buffer.from(secret))) {
      return new Response(null, { status: 403 });
    }

    const cookie = `${DEV.accessCookie}=${await mint(DEV.loginSeconds)}; Path=/; Max-Age=${DEV.loginSeconds}; HttpOnly; SameSite=Lax`;

    return new Response(null, { status: 303, headers: { 'Location': '/', 'Set-Cookie': cookie, 'Cache-Control': 'no-store' } });
  }

  const server = Bun.serve<DevSocket>({
    hostname: host,
    port: ports.door,
    idleTimeout: 255,
    fetch: (request, bun) => {
      const url = new URL(request.url);

      if (url.pathname === DEV.certsPath) {
        return Response.json({ keys: [key.publicJwk] });
      }

      if (url.pathname === DEV.loginPath) {
        return login(url);
      }

      return forward(request, bun);
    },
    websocket: {
      open(socket: ServerWebSocket<DevSocket>) {
        const upstream: WebSocket = Reflect.construct(WebSocket, [socket.data.target, { headers: socket.data.headers }]);

        upstream.binaryType = 'arraybuffer';
        upstream.addEventListener('open', () => socket.data.pending.splice(0).forEach((message) => upstream.send(message)));
        upstream.addEventListener('message', (event) => socket.send(event.data as string | ArrayBuffer));
        upstream.addEventListener('close', () => socket.close());
        socket.data.upstream = upstream;
      },
      message(socket, message) {
        const payload = typeof message === 'string' ? message : Uint8Array.from(message);

        if (socket.data.upstream?.readyState === WebSocket.OPEN) {
          socket.data.upstream.send(payload);
        } else {
          socket.data.pending.push(payload);
        }
      },
      close(socket) {
        socket.data.upstream?.close();
      },
    },
  });

  const children: [string, Subprocess][] = [
    ['daemon', Bun.spawn(['bun', '--watch', 'src/entry.native.ts'], {
      cwd: path.join(root, 'apps/daemon'),
      env: {
        ...process.env,
        DATA_DIR: data,
        MOBILE_SCHEME: 'meetvinci-dev',
        DAEMON_HOST: host,
        DAEMON_PORT: String(ports.daemon),
        DAEMON_TEAM: 'true',
        DAEMON_ALLOWED_ORIGINS: publicUrl,
        WEB_PUBLIC_URL: publicUrl,
      },
      stdout: 'inherit',
      stderr: 'inherit',
    })],
    ['hub', Bun.spawn(['bun', '--watch', 'src/entry.native.ts'], {
      cwd: path.join(root, 'apps/hub'),
      env: {
        ...process.env,
        HUB_HOST: '127.0.0.1',
        HUB_PORT: String(ports.hub),
        HUB_DATA_DIR: hubData,
        HUB_WEB_URL: `http://127.0.0.1:${ports.web}`,
        HUB_PUBLIC_URL: publicUrl,
        HUB_ADMIN_EMAILS: DEV.email,
        ACCESS_TEAM_DOMAIN: door,
        ACCESS_AUD: DEV.audience,
      },
      stdout: 'inherit',
      stderr: 'inherit',
    })],
    ['web', Bun.spawn(['bun', 'x', 'vite', 'dev', '--host', host, '--port', String(ports.web), '--strictPort'], {
      cwd: path.join(root, 'apps/web'),
      env: {
        ...process.env,
        DAEMON_PORT: String(ports.daemon),
        WEB_PORT: String(ports.web),
        WEB_HUB_URL: hub,
      },
      stdout: 'inherit',
      stderr: 'inherit',
    })],
  ];

  const opening = secret ? `Log in once on each device: ${publicUrl}${DEV.loginPath}?secret=${secret} (this run only).` : `Open ${publicUrl}`;

  console.log(`\nDev hub: ${opening} You are ${DEV.email}, an admin of this hub; /admin is the admin panel.\n`);

  const exited = await Promise.race([
    new Promise<string>((done) => {
      DEV.stopSignals.forEach((signal) => process.once(signal, () => done(signal)));
    }),
    ...children.map(([name, child]) => child.exited.then((code) => `${name} exited with ${code}`)),
  ]);

  console.log(`\nDev hub stopping: ${exited}`);
  children.forEach(([, child]) => child.kill());
  // `bun --watch` keeps a process whose script has returned (the hub's does on a signal) waiting for file changes.
  await Promise.all(children.map(([, child]) => Promise.race([child.exited, Bun.sleep(DEV.stopGraceMs)]).then(() => child.kill('SIGKILL'))));
  await Promise.all(children.map(([, child]) => child.exited));
  await server.stop(true);
}

const commands = { dev };
const command = process.argv[2] ?? '';

if (!(command in commands)) {
  fail('Usage: bun scripts/hub.ts dev [--url <origin>] [--port <first port>] [--data <directory>]');
}

await commands[command as keyof typeof commands]();
