import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

// Rebuilds one of Vinci's Hetzner test servers from deploy/cloud-init/user-data.yaml and checks the install from
// outside, logging in as the admin. Only the servers below, all three disposable: a rebuild wipes the disk.
const SERVERS: Partial<Record<string, string>> = {
  'test-server-1': '203.0.113.1',
  'test-server-2': '203.0.113.2',
  'test-server-3': '203.0.113.3',
};

const HCLOUD = ['hcloud', '--context', 'example'];
const IMAGE = 'ubuntu-26.04';
const REGISTRY = 'ghcr.io/meetvinci/';
const IMAGES = ['daemon', 'sandbox', 'web', 'hub', 'provisioner', 'firewall', 'api'];
// Hetzner keeps user-data in its metadata service and caps it at 32 KiB.
const USER_DATA_LIMIT = 32 * 1024;
const SSH_WAIT_MS = 10 * 60 * 1000;
const HTTPS_WAIT_MS = 3 * 60 * 1000;
const LOGIN = '/cdn-cgi/access/login';
const CERTS = '/cdn-cgi/access/certs';
const ACCESS_COOKIE = 'CF_Authorization';
// The daemon's oRPC protocol (packages/contracts, SERVER_PROTOCOL), as the web app speaks it through the hub.
const RPC_HEADERS = { 'content-type': 'application/json', 'x-bots-protocol': '1' };

const root = path.resolve(import.meta.dir, '..');
const template = path.join(root, 'deploy/cloud-init/user-data.yaml');
const scratch = path.join(tmpdir(), 'vinci-test-server');

// Values go into a shell file and a YAML block: anything outside these patterns is refused, not escaped.
const patterns = {
  host: /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u,
  admin: /^[a-z0-9._%+-]+@(?:[a-z0-9-]+\.)+[a-z]{2,63}$/u,
  ref: /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/u,
  tag: /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/u,
};

interface Install {
  host: string;
  admin: string;
  ref: string;
  tag: string;
  registry: string;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function run(command: string[]) {
  const result = Bun.spawnSync(command, {
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });

  return { ok: result.exitCode === 0, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
}

function serverIp(server: string): string {
  const ip = SERVERS[server];

  if (ip === undefined) {
    fail(`Unknown test server ${server || '(none)'}. Choose from ${Object.keys(SERVERS).join(', ')}.`);
  }

  return ip;
}

// A scratch known_hosts per server: every rebuild changes the host key, and ~/.ssh/known_hosts is never touched.
function knownHosts(server: string) {
  mkdirSync(scratch, { recursive: true, mode: 0o700 });

  return path.join(scratch, `${server}.known_hosts`);
}

function sshCommand(server: string, remote: string) {
  return ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5', '-o', 'StrictHostKeyChecking=accept-new', '-o', `UserKnownHostsFile=${knownHosts(server)}`, `root@${serverIp(server)}`, remote];
}

function ssh(server: string, remote: string) {
  return run(sshCommand(server, remote));
}

function render(install: Install): string {
  for (const [key, pattern] of Object.entries(patterns)) {
    if (!pattern.test(install[key as keyof typeof patterns])) {
      fail(`Invalid --${key}: ${install[key as keyof typeof patterns]}`);
    }
  }

  const userData = readFileSync(template, 'utf8').replace(/\{\{(host|admin|ref|tag|registry)\}\}/gu, (_, key: keyof Install) => install[key]);

  if (Buffer.byteLength(userData) > USER_DATA_LIMIT) {
    fail(`The rendered user-data is ${Buffer.byteLength(userData)} bytes; Hetzner takes at most ${USER_DATA_LIMIT}.`);
  }

  return userData;
}

function options() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(3),
    options: {
      host: { type: 'string' },
      admin: { type: 'string' },
      ref: { type: 'string', default: 'main' },
      tag: { type: 'string', default: 'main' },
      // `local`: the images come from this computer (`bun run build:images --tag <tag>`), sent with docker load.
      images: { type: 'string', default: 'registry' },
    },
    allowPositionals: true,
  });

  if (!['registry', 'local'].includes(values.images)) {
    fail('--images is registry or local.');
  }

  return { values, server: positionals[0] ?? '' };
}

function installOptions(server: string, values: ReturnType<typeof options>['values']): Install {
  if (values.admin === undefined) {
    fail('Pass --admin <email>: the first admin, who gets the login.');
  }

  return {
    // sslip.io resolves <ip with dashes>.sslip.io to that address, so Let's Encrypt works without a DNS record.
    host: values.host ?? `${serverIp(server).replaceAll('.', '-')}.sslip.io`,
    admin: values.admin.toLowerCase(),
    ref: values.ref,
    tag: values.tag,
    registry: values.images === 'local' ? '' : REGISTRY,
  };
}

async function waitFor(what: string, deadline: number, ready: () => boolean | Promise<boolean>) {
  if (await ready()) {
    return;
  }

  if (Date.now() > deadline) {
    fail(`Timed out waiting for ${what}.`);
  }

  await Bun.sleep(5000);
  await waitFor(what, deadline, ready);
}

// The offline path of the install guide: the server's install waits for these, and they arrive over SSH.
async function loadImages(server: string, tag: string) {
  const names = IMAGES.map((image) => `vinci-${image}:${tag}`);
  const missing = names.filter((name) => !run(['docker', 'image', 'inspect', name]).ok);

  if (missing.length > 0) {
    fail(`Build these first (bun run build:images --tag ${tag}): ${missing.join(', ')}`);
  }

  await waitFor('Docker on the server', Date.now() + SSH_WAIT_MS, () => ssh(server, 'docker info --format ok').ok);

  // The names match the tag pattern, so they need no quoting; "$@" is the ssh command.
  const load = Bun.spawnSync(['sh', '-c', `docker save ${names.join(' ')} | gzip -1 | "$@"`, 'sh', ...sshCommand(server, 'gunzip | docker load')], {
    stdout: 'inherit',
    stderr: 'inherit',
  });

  if (!load.success) {
    fail('Sending the images failed.');
  }
}

// Only the step lines of the install log: names and timings, never a value.
function steps(server: string) {
  return ssh(server, 'grep "^== " /var/log/vinci-install.log').stdout.trim();
}

function cookieOf(response: Response, name: string) {
  return response.headers.getSetCookie().map((cookie) => cookie.split(';')[0] ?? '').find((pair) => pair.startsWith(`${name}=`));
}

async function checkPublic(host: string) {
  const origin = `https://${host}`;
  let home: Response | undefined;

  // Caddy gets its certificate on the first requests; give it a moment.
  await waitFor(`HTTPS on ${host}`, Date.now() + HTTPS_WAIT_MS, async () => {
    home = await fetch(`${origin}/`, { redirect: 'manual' }).catch(() => undefined);

    return home !== undefined;
  });

  const location = new URL(home?.headers.get('location') ?? '', origin);

  if (home?.status !== 302 || location.pathname !== LOGIN) {
    fail(`${origin}/ answered ${home?.status} ${location.href}, not 302 to ${LOGIN}.`);
  }

  const certs = await fetch(`${origin}${CERTS}`);
  const keys: unknown = certs.ok ? (await certs.json() as { keys?: unknown }).keys : undefined;

  if (!Array.isArray(keys) || keys.length === 0) {
    fail(`${origin}${CERTS} answered ${certs.status} without keys.`);
  }

  console.log(`${origin}/: 302 to ${LOGIN}; ${CERTS}: 200 with ${keys.length} key(s)`);
}

// Logs in with the admin's password, read over SSH and kept in memory, then reaches the hub as that person.
async function checkLogin(server: string, host: string, admin: string) {
  const origin = `https://${host}`;
  const password = ssh(server, 'cat /opt/vinci/admin-password').stdout.trim();

  if (password === '') {
    fail('No admin password on the server (/opt/vinci/admin-password).');
  }

  const form = await fetch(`${origin}${LOGIN}?redirect_url=/`);
  const html = await form.text();
  const csrf = /name="_token"\s+value="([^"]+)"/u.exec(html)?.[1];
  const cookies = form.headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; ');

  const body = new URLSearchParams({
    email: admin,
    password,
    redirect_url: '/',
    ...(csrf === undefined ? {} : { _token: csrf }),
  });

  const login = await fetch(`${origin}${LOGIN}`, {
    method: 'POST',
    body,
    redirect: 'manual',
    headers: { cookie: cookies },
  });

  const access = cookieOf(login, ACCESS_COOKIE);

  if (login.status !== 302 || access === undefined) {
    fail(`The admin's login answered ${login.status} without ${ACCESS_COOKIE}.`);
  }

  const whoami = await fetch(`${origin}/hub/whoami`, { headers: { cookie: access } });
  const identity = whoami.ok ? await whoami.json() as { email?: string; serverId?: string | null; isAdmin?: boolean } : {};
  // The browser's first visit: the hub has the person's daemon grant a pairing, the connect page redeems it for a
  // device token, and the chat calls the daemon with it.
  const pair = await fetch(`${origin}/hub/pair`, { headers: { cookie: access }, redirect: 'manual' });
  const code = /[?&]code=([^&]+)/u.exec(pair.headers.get('location') ?? '')?.[1];

  if (identity.email !== admin || !identity.serverId || !identity.isAdmin || code === undefined) {
    fail(`After login: /hub/whoami ${whoami.status} (admin ${identity.isAdmin}, daemon ${identity.serverId ?? 'none'}), /hub/pair ${pair.status}.`);
  }

  const { pin } = JSON.parse(Buffer.from(decodeURIComponent(code), 'base64').toString()) as { pin: string };
  const headers = { ...RPC_HEADERS, cookie: access, origin };

  const redeem = await fetch(`${origin}/rpc/pairing/redeem`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ json: { pin, name: 'test-server' } }),
  });

  const { token } = redeem.ok ? (await redeem.json() as { json: { token: string } }).json : { token: '' };

  const bots = await fetch(`${origin}/rpc/bots/list`, {
    method: 'POST',
    headers: { ...headers, 'x-bots-server-id': identity.serverId, 'authorization': `Bearer ${token}` },
    body: JSON.stringify({ json: null }),
  });

  if (!bots.ok) {
    fail(`Pairing: redeem ${redeem.status}, bots.list ${bots.status}.`);
  }

  console.log(`Logged in as the admin: whoami names them as admin, the browser paired with daemon ${identity.serverId}, and the chat's bots.list answers 200`);

  return access.slice(ACCESS_COOKIE.length + 1);
}

// deploy.ts's check of the public address, also logged in as the admin, so the hub, web app and daemon answer too.
function checkDisclosures(host: string, access: string) {
  const result = Bun.spawnSync(['bun', path.join(root, 'scripts/deploy.ts'), 'check', `https://${host}`], {
    env: { ...process.env, VINCI_CHECK_COOKIE: access },
    stdout: 'inherit',
    stderr: 'inherit',
  });

  if (!result.success) {
    fail(`https://${host} names the software or a version behind it.`);
  }
}

async function rebuild() {
  const { values, server } = options();
  const install = installOptions(server, values);
  const file = path.join(scratch, `${server}.user-data.yaml`);
  const started = Date.now();
  const elapsed = () => `${Math.round((Date.now() - started) / 1000)}s`;

  rmSync(knownHosts(server), { force: true });
  writeFileSync(file, render(install), { mode: 0o600 });
  console.log(`Rebuilding ${server} (${serverIp(server)}) as ${install.host}: ref ${install.ref}, images ${install.registry || 'local '}vinci-*:${install.tag}`);

  const rebuilt = run([...HCLOUD, 'server', 'rebuild', server, '--image', IMAGE, '--user-data-from-file', file]);

  if (!rebuilt.ok) {
    fail(`hcloud server rebuild failed: ${rebuilt.stderr.trim()}`);
  }

  console.log(`[${elapsed()}] Rebuilt`);
  await waitFor(`SSH on ${server}`, Date.now() + SSH_WAIT_MS, () => ssh(server, 'true').ok);
  console.log(`[${elapsed()}] SSH up`);

  if (install.registry === '') {
    await loadImages(server, install.tag);
    console.log(`[${elapsed()}] Images loaded`);
  }

  const done = ssh(server, 'cloud-init status --wait > /dev/null; cat /var/log/vinci-install.result');

  console.log(`[${elapsed()}] cloud-init finished`);
  console.log(steps(server));

  if (done.stdout.trim() !== 'ok') {
    fail(`The install failed (${done.stdout.trim() || 'no result'}). End of /var/log/vinci-install.log:\n${ssh(server, 'tail -n 60 /var/log/vinci-install.log').stdout}`);
  }

  await checkPublic(install.host);
  checkDisclosures(install.host, await checkLogin(server, install.host, install.admin));
  console.log(`[${elapsed()}] Done: https://${install.host}/`);
}

async function checkCommand() {
  const { values, server } = options();
  const install = installOptions(server, values);

  await checkPublic(install.host);
  checkDisclosures(install.host, await checkLogin(server, install.host, install.admin));
}

function status() {
  const { server } = options();
  const result = ssh(server, 'cat /var/log/vinci-install.result 2>/dev/null || echo "no result yet"; cloud-init status; grep "^== " /var/log/vinci-install.log; cd /opt/vinci 2>/dev/null && docker compose ps --format "{{.Name}} {{.Status}}"');

  console.log(result.stdout.trim());

  if (!result.ok) {
    fail(result.stderr.trim());
  }
}

// Prints the admin's first password to this terminal only: nothing else of this script shows it.
function passwordCommand() {
  const { server } = options();
  const result = ssh(server, 'cat /opt/vinci/admin-password');

  if (!result.ok) {
    fail(`No admin password on ${server}: ${result.stderr.trim()}`);
  }

  console.log(result.stdout.trim());
}

function renderCommand() {
  const { values, server } = options();

  process.stdout.write(render(installOptions(server, values)));
}

const commands = { rebuild, check: checkCommand, status, password: passwordCommand, render: renderCommand };
const command = process.argv[2] ?? '';

if (!(command in commands)) {
  fail([
    `Usage (servers: ${Object.keys(SERVERS).join(', ')}):`,
    '  bun scripts/test-server.ts rebuild <server> --admin <email> [--host <fqdn>] [--ref <git ref>] [--tag <image tag>] [--images registry|local]',
    '  bun scripts/test-server.ts check <server> --admin <email> [--host <fqdn>]    the HTTPS, login and disclosure checks alone',
    '  bun scripts/test-server.ts status <server>                                  install result, step timings, containers',
    '  bun scripts/test-server.ts password <server>                                print the admin\'s first password',
    '  bun scripts/test-server.ts render [<server>] --admin <email> [...]          print the user-data rebuild would send',
    '--host defaults to <ip with dashes>.sslip.io, --ref and --tag to main. --images local sends vinci-*:<tag> from this',
    `computer (bun run build:images --tag <tag>) instead of pulling from ${REGISTRY}.`,
  ].join('\n'));
}

await commands[command as keyof typeof commands]();
