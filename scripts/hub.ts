import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { connect, createServer } from 'node:net';
import { homedir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import type { Server, ServerWebSocket, Subprocess } from 'bun';

// `bun run dev:web`: the dev daemon, a local hub and Vite behind a dev door that plays Cloudflare Access with one
// fixed identity. Development only: the hub image bundles apps/hub alone, and the hub has no switch for this door.
// The hub trusts the door only because ACCESS_TEAM_DOMAIN points at it, which this script sets for its own hub.
// The identity comes only from the login cookie that the run's printed link sets, never from where a request comes
// from: every container on the Mac (a bot in the dev sandbox too) reaches this Mac's loopback ports through
// host.docker.internal and arrives as 127.0.0.1.
const DEV = {
  email: 'dev@example.com',
  user: 'dev',
  name: 'Developer',
  audience: 'vinci-dev',
  kid: 'vinci-dev',
  port: 47190,
  data: '~/.config/vinci-dev',
  loginSeconds: 30 * 24 * 3600,
  certsPath: '/cdn-cgi/access/certs',
  loginPath: '/cdn-cgi/access/login',
  accessHeader: 'cf-access-jwt-assertion',
  accessCookie: 'CF_Authorization',
  stopSignals: ['SIGINT', 'SIGTERM'],
  stopGraceMs: 3000,
} as const;

// `--sandbox`: bot tools run in the sandbox image, as in an install. A Unix socket does not cross the macOS-Linux VM
// boundary of OrbStack or Docker Desktop, so the container makes its own exec.sock and proxy.sock in /run/sandbox and
// relays them over TCP to loopback bridges here, which connect to the daemon's sockets. Every container on the Mac
// reaches those ports through host.docker.internal, so each connection first sends this run's key: a connection
// without it never reaches the daemon (exec.sock has no other check, and whoever holds it gets the bots' tool calls).
// Development only.
const SANDBOX = {
  image: 'vinci-sandbox:dev',
  sockets: ['exec.sock', 'proxy.sock'],
  keyEnv: 'VINCI_DEV_RELAY_KEY',
  keyWaitMs: 5000,
  // The container's relay: each connection to a socket in /run/sandbox becomes a TCP connection that starts with the key.
  relay: `const net = require('net');
for (const [socket, port] of JSON.parse(process.argv[1])) {
  net.createServer((unix) => {
    const tcp = net.connect(port, 'host.docker.internal');
    const end = () => { unix.destroy(); tcp.destroy(); };
    [unix, tcp].forEach((side) => side.on('error', end).on('close', end));
    tcp.write(process.env.VINCI_DEV_RELAY_KEY + '\\n');
    unix.pipe(tcp).pipe(unix);
  }).listen('/run/sandbox/' + socket);
}`,
  // No firewall confines a dev sandbox, so the image's firewall-wait would wait forever: this stands in for it.
  firewallWait: '#!/bin/sh\n# Development (scripts/hub.ts --sandbox): no firewall confines this sandbox.\nexit 0\n',
} as const;

const root = path.resolve(import.meta.dir, '..');

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

// Each TCP connection from the sandbox that starts with this run's key becomes one connection to the daemon's socket;
// any other is closed before the daemon sees it.
function sandboxBridge(port: number, socketPath: string, key: Buffer) {
  return createServer((tcp) => {
    let head = Buffer.alloc(0);
    const timer = setTimeout(() => tcp.destroy(), SANDBOX.keyWaitMs);

    const sandboxBridgeKey = (chunk: Buffer) => {
      head = Buffer.concat([head, chunk]);
      const newline = head.indexOf(0x0a);

      if (newline < 0) {
        if (head.length > key.length) {
          tcp.destroy();
        }

        return;
      }

      clearTimeout(timer);
      tcp.off('data', sandboxBridgeKey);
      const given = head.subarray(0, newline);

      if (given.length !== key.length || !timingSafeEqual(given, key)) {
        tcp.destroy();
        return;
      }

      const unix = connect(socketPath);

      const end = () => {
        tcp.destroy();
        unix.destroy();
      };

      unix.on('error', end).on('close', end);
      tcp.on('close', end);
      unix.write(head.subarray(newline + 1));
      tcp.pipe(unix).pipe(tcp);
    };

    tcp.on('error', () => tcp.destroy()).on('close', () => clearTimeout(timer));
    tcp.on('data', sandboxBridgeKey);
  }).listen(port, '127.0.0.1');
}

// One login token per dev data folder, in the shape of a Sanctum token, so a phone's login cookie outlives a restart.
async function devSession(file: string): Promise<string> {
  const stored = existsSync(file) ? (await readFile(file, 'utf8')).trim() : '';

  if (stored !== '') {
    return stored;
  }

  const token = `1|${randomBytes(30).toString('hex')}`;

  await writeFile(file, token, { mode: 0o600 });

  return token;
}

// The door's stand-in for the API's /internal routes, only with this run's token: the dev identity's login, and
// accounts that the dev install does not have (its one person comes from users.json).
function devInternal(request: Request, url: URL, { session, token }: { session: string; token: string }): Response {
  const given = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${token}`);

  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return Response.json({ message: 'Unauthenticated.' }, { status: 401 });
  }

  const cookie = request.headers.get('cookie') ?? '';
  const isLoggedIn = cookie.split(';').some((part) => part.trim() === `${DEV.sessionCookie}=${session}`);

  if (url.pathname === '/internal/session' && request.method === 'GET') {
    return isLoggedIn
      ? Response.json({ email: DEV.email, expires_at: Math.floor(Date.now() / 1000) + DEV.loginSeconds })
      : Response.json({ message: 'Unauthenticated.' }, { status: 401 });
  }

  if (url.pathname === '/internal/session/password') {
    return Response.json({ error: 'wrong_password' }, { status: 403 });
  }

  return request.method === 'PUT' ? Response.json({ created: false }) : Response.json({ message: 'The dev install has no login accounts.' }, { status: 404 });
}

async function dev() {
  const { values } = parseArgs({
    args: process.argv.slice(3),
    options: {
      url: { type: 'string' },
      port: { type: 'string', default: String(DEV.port) },
      data: { type: 'string', default: DEV.data },
      sandbox: { type: 'boolean', default: false },
    },
  });

  const base = Number(values.port);

  if (!Number.isInteger(base) || base < 1 || base > 65530) {
    fail(`--port takes the first of six free ports: ${values.port}`);
  }

  const image = values.sandbox ? Bun.spawnSync(['docker', 'image', 'inspect', SANDBOX.image], { stdout: 'ignore', stderr: 'pipe' }) : null;

  if (image && !image.success) {
    const platform = process.arch === 'arm64' ? 'linux/arm64' : 'linux/amd64';

    fail(image.stderr.toString().includes('No such image')
      ? `--sandbox needs the ${SANDBOX.image} image: bun scripts/deploy.ts images sandbox --platform ${platform} --tag dev`
      : `--sandbox needs Docker (OrbStack or Docker Desktop) running: ${image.stderr.toString().trim()}`);
  }

  const ports = { door: base, daemon: base + 1, hub: base + 2, web: base + 3, sandbox: [base + 4, base + 5] };
  const door = `http://127.0.0.1:${ports.door}`;
  const hub = `http://127.0.0.1:${ports.hub}`;
  const publicUrl = values.url ? URL.parse(values.url)?.origin ?? fail(`--url is not an address: ${values.url}`) : `http://localhost:${ports.door}`;
  // A phone or another computer reaches the door only with --url. Every browser logs in once through the printed link.
  const host = values.url ? '0.0.0.0' : '127.0.0.1';
  const requested = path.resolve(values.data.replace(/^~(?=\/|$)/u, homedir()));

  await mkdir(path.join(requested, 'hub'), { recursive: true, mode: 0o700 });

  // The hub refuses an owner socket below a symlinked folder (/tmp on macOS is one), so every path uses the real one.
  const data = await realpath(requested);
  const hubData = path.join(data, 'hub');
  const secret = crypto.randomUUID();
  const sandboxDir = values.sandbox ? path.join(data, 'sandbox') : undefined;

  await writeFile(path.join(hubData, 'users.json'), JSON.stringify({
    users: { [DEV.email]: { id: DEV.user, name: DEV.name, daemonUrl: `http://127.0.0.1:${ports.daemon}`, socketPath: path.join(data, 'data/ipc/rpc.sock') } },
  }));

  const session = await devSession(path.join(hubData, 'dev-session'));
  const accountsToken = randomBytes(32).toString('hex');

  async function forward(request: Request, server: Server<DevSocket>): Promise<Response | undefined> {
    const url = new URL(request.url);
    const target = new URL(`${url.pathname}${url.search}`, hub);
    const headers = new Headers(request.headers);

    headers.delete('host');

    // The hub checks the login with the door's /internal/session; without a cookie there is nothing to check.
    if (!request.headers.get('cookie')?.includes(`${DEV.sessionCookie}=`)) {
      return new Response('Not logged in: open the login link that `bun run dev:web` printed, once in this browser.\n', { status: 401 });
    }

    if (request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
      target.protocol = 'ws:';

      const relayed = ['origin', 'cookie'].flatMap((name) => {
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

  function login(url: URL): Response {
    const given = Buffer.from(url.searchParams.get('secret') ?? '');

    if (given.length !== secret.length || !timingSafeEqual(given, Buffer.from(secret))) {
      return new Response(null, { status: 403 });
    }

    const cookie = `${DEV.sessionCookie}=${session}; Path=/; Max-Age=${DEV.loginSeconds}; HttpOnly; SameSite=Lax`;

    return new Response(null, { status: 303, headers: { 'Location': '/', 'Set-Cookie': cookie, 'Cache-Control': 'no-store' } });
  }

  const server = Bun.serve<DevSocket>({
    hostname: host,
    port: ports.door,
    idleTimeout: 255,
    fetch: (request, bun) => {
      const url = new URL(request.url);

      if (url.pathname.startsWith(DEV.internalPath)) {
        return devInternal(request, url, { session, token: accountsToken });
      }

      if (url.pathname === DEV.logoutPath) {
        return new Response('Logged out of the dev install: open the login link that `bun run dev:web` printed to log in again.\n', {
          headers: { 'Set-Cookie': `${DEV.sessionCookie}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`, 'Cache-Control': 'no-store' },
        });
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
        MOBILE_SCHEME: 'vinci-dev',
        DAEMON_HOST: host,
        DAEMON_PORT: String(ports.daemon),
        DAEMON_SANDBOX_DIR: sandboxDir,
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
        HUB_ACCOUNTS_URL: door,
        HUB_ACCOUNTS_TOKEN: accountsToken,
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

  const sandboxName = `vinci-dev-sandbox-${ports.door}`;
  const relayKey = randomBytes(32).toString('hex');
  const relayPorts = SANDBOX.sockets.map((socket, index) => [socket, ports.sandbox[index]] as const);
  const bridges = sandboxDir ? relayPorts.map(([socket, port]) => sandboxBridge(port, path.join(sandboxDir, socket), Buffer.from(relayKey))) : [];

  if (sandboxDir) {
    const skills = path.join(homedir(), '.agents');
    const firewallWait = path.join(data, 'dev-firewall-wait');
    const folders = [path.join(data, 'agents'), path.join(data, 'bot-home'), sandboxDir];

    await Promise.all(folders.map((folder) => mkdir(folder, { recursive: true, mode: 0o700 })));
    await writeFile(firewallWait, SANDBOX.firewallWait, { mode: 0o755 });
    // A run killed before it could stop its container leaves it behind under this run's name.
    Bun.spawnSync(['docker', 'rm', '--force', sandboxName], { stdout: 'ignore', stderr: 'ignore' });

    // Like deploy/compose/sandbox.yaml, without the firewall and the disk: the bot folders and the daemon's folder at
    // the daemon's own paths (pi-env and the secrets proxy's files use them), the bots' home, shared skills read only.
    // Only the relay gets the key in its environment. A bot could still read it from /proc (same uid), which gives it
    // nothing: it reaches /run/sandbox/exec.sock directly, as in an install.
    children.push(['sandbox', Bun.spawn([
      'docker', 'run', '--rm', '--name', sandboxName, '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
      '--memory', '512m', '--memory-swap', '512m', '--cpus', '1', '--pids-limit', '256',
      '--tmpfs', '/tmp:rw,nosuid,nodev,size=256m', '--tmpfs', '/run/sandbox:uid=1000,gid=1000,mode=0700',
      '--volume', `${folders[0]}:${folders[0]}`, '--volume', `${folders[1]}:/home/bot`, '--volume', `${sandboxDir}:${sandboxDir}:ro`,
      '--volume', `${firewallWait}:/usr/local/bin/firewall-wait:ro`, ...(existsSync(skills) ? ['--volume', `${skills}:${skills}:ro`] : []),
      '--env', SANDBOX.keyEnv, '--entrypoint', '/usr/bin/tini', SANDBOX.image, '--', '/bin/sh', '-c',
      `node -e "$1" "$2" & unset ${SANDBOX.keyEnv}; exec /usr/local/bin/sandbox`, 'relay', SANDBOX.relay, JSON.stringify(relayPorts),
    ], {
      env: { ...process.env, [SANDBOX.keyEnv]: relayKey },
      stdout: 'inherit',
      stderr: 'inherit',
    })]);
  }

  console.log(`\nDev hub: ${publicUrl}. Log in once in each browser with ${publicUrl}${DEV.loginPath}?secret=${secret} (this run's link; the`
    + ` login lasts 30 days, across restarts). You are ${DEV.email}, an admin of this hub; /admin is the admin panel.\n`);

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
  bridges.forEach((bridge) => bridge.close());

  if (sandboxDir) {
    Bun.spawnSync(['docker', 'rm', '--force', sandboxName], { stdout: 'ignore', stderr: 'ignore' });
  }
  await server.stop(true);
}

const commands = { dev };
const command = process.argv[2] ?? '';

if (!(command in commands)) {
  fail('Usage: bun scripts/hub.ts dev [--url <origin>] [--port <first port>] [--data <directory>] [--sandbox]');
}

await commands[command as keyof typeof commands]();
