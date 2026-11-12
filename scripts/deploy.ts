import { createHash, timingSafeEqual } from 'node:crypto';
import { chmodSync, chownSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

// Runs from a repo checkout (images), copied to /opt/orbs on the server, from there (every other command), and in
// the provisioner image (`provisioner`, which runs the same apply for the hub's admin panel).
// It imports only Bun and node builtins, so the server needs Bun and Docker and nothing else.
const root = path.resolve(import.meta.dir, '..');
const dockerfile = path.join(root, 'deploy/docker/Dockerfile');
const targets = ['daemon', 'web', 'hub', 'provisioner'];
const usersFile = 'users.yaml';
const lockFile = 'users.yaml.lock';
const lockStaleMs = 10 * 60 * 1000;
const hubData = 'hub';
// Created once and never recreated by apply: recreating the hub drops every WebSocket, and the provisioner runs apply.
const singletons = ['hub', 'provisioner'];
const userId = /^[a-z\d][a-z\d-]{0,62}$/u;
// The hidden template workspace (global settings and suggested bots): a daemon like a person's that no one logs into.
// Apply always keeps it; no person may have its id.
const templateId = 'template';
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const namePattern = /^[^\p{Cc}]{1,100}$/u;
const daemonUid = 1000;
const provisionerTokenLength = 32;
const provisionerBodyLimit = 64 * 1024;
// Overridable only so the provisioner's Access sync can be proven against a local stub.
const cloudflareApi = process.env.CLOUDFLARE_API_URL ?? 'https://api.cloudflare.com/client/v4';
// Objects are found by exact names built from --name: the account may hold unrelated objects that share a prefix.
const cloudflareNamePattern = /^orbs-[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const domainPattern = /^(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)+[a-z]{2,63}$/u;
// Only the icon files skip cloudflared's own Access check; a segment cannot contain a slash, so no path climbs out.
const cloudflareFaviconPath = '^/(?:img/favicon/[^/]+|favicon\\.ico)$';
// The hub on the Compose `tunnel` network, and the host's sshd as cloudflared's container sees it.
const cloudflareOrigin = 'http://hub:47192';
const cloudflareSshOrigin = 'ssh://host.docker.internal:22';

interface CloudflareResponse<T> {
  success: boolean;
  errors: { code: number; message: string }[];
  result: T;
  result_info?: { total_pages: number };
}

interface CloudflareNamed {
  id: string;
  name: string;
}

interface CloudflarePolicy extends CloudflareNamed {
  include?: Record<string, unknown>[];
  exclude?: unknown[];
  require?: unknown[];
}

// Who the allow policy lets through: everyone at these domains, and these other emails.
interface AccessRule {
  domains: string[];
  emails: string[];
}

interface CloudflareApp extends CloudflareNamed {
  domain: string;
  aud: string;
  destinations?: { uri?: string }[];
  policies?: { id: string }[];
}

interface CloudflareTunnel extends CloudflareNamed {
  config_src?: string;
}

interface CloudflareRecord extends CloudflareNamed {
  type: string;
  content: string;
  comment: string | null;
}

interface CloudflareContext {
  account: string;
  zone: string;
}

interface CloudflareDeletion {
  label: string;
  name: string;
  route: string;
}

interface Person {
  name: string;
  email: string;
  enabled: boolean;
  advanced: boolean;
}

interface Team {
  users: Map<string, Person>;
  admins: string[];
}

type UserState = 'running' | 'starting' | 'stopped' | 'unknown';

// Throws instead of exiting: the provisioner answers the request with the message and keeps serving.
function fail(message: string): never {
  throw new Error(message);
}

interface DockerOptions {
  input?: string;
  output?: string;
  env?: Record<string, string>;
}

// Never through a shell: every argument, user ids included, reaches docker as its own argv entry.
async function docker(args: string[], { input, output, env }: DockerOptions = {}): Promise<string> {
  const out = output ? openSync(output, 'wx', 0o600) : 'pipe';

  const child = Bun.spawn(['docker', ...args], {
    env: { ...process.env, ...env },
    stdin: input ? Bun.file(input) : 'inherit',
    stdout: out,
    stderr: 'inherit',
  });

  const [stdout, code] = await Promise.all([
    child.stdout instanceof ReadableStream ? new Response(child.stdout).text() : '',
    child.exited,
  ]);

  if (typeof out === 'number') {
    closeSync(out);
  }

  if (code !== 0) {
    fail(`docker ${args.slice(0, 3).join(' ')} failed.`);
  }

  return stdout.trim();
}

// Builds orbs-<target>:<tag> images into the local Docker image store. linux/amd64 is the server target;
// pass --platform linux/arm64 for local runs on Apple Silicon.
function images() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(3),
    options: {
      platform: { type: 'string', default: 'linux/amd64' },
      tag: { type: 'string', default: 'latest' },
    },
    allowPositionals: true,
  });

  const selected = positionals.length > 0 ? positionals : targets;
  const unknown = selected.filter((target) => !targets.includes(target));

  if (unknown.length > 0) {
    fail(`Unknown image target: ${unknown.join(', ')}. Choose from ${targets.join(', ')}.`);
  }

  for (const target of selected) {
    const image = `orbs-${target}:${values.tag}`;

    console.log(`Building ${image} for ${values.platform}`);

    const result = Bun.spawnSync(['docker', 'buildx', 'build', '--platform', values.platform, '--file', dockerfile, '--target', target, '--tag', image, '--load', root], {
      stdout: 'inherit',
      stderr: 'inherit',
    });

    if (!result.success) {
      fail(`Building ${image} failed.`);
    }
  }
}

function isEmail(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 254 && emailPattern.test(value);
}

function isValidPerson(person: Person): boolean {
  return isEmail(person.email) && namePattern.test(person.name) && person.name.trim() === person.name && typeof person.enabled === 'boolean'
    && typeof person.advanced === 'boolean';
}

// An entry is an email (name = id, enabled, not advanced) or { email, name?, enabled?, advanced? }. `advanced` only
// shows that person the app's advanced settings; it changes nothing the daemon allows.
function readPerson(id: string, value: unknown): Person {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const { email, name = id, enabled = true, advanced = false } = value as Record<string, unknown>;

    return { name: String(name), email: String(email).toLowerCase(), enabled: enabled as boolean, advanced: advanced as boolean };
  }

  return { name: id, email: String(value).toLowerCase(), enabled: true, advanced: false };
}

// users.yaml is the one list of people: `users: { <id>: <email> | { email, name, enabled, advanced } }`, and the admin panel's
// `admins: [<email>]`, who may log in at Cloudflare too. `-` reads it from stdin, for example over ssh.
function team(file = usersFile): Team {
  if (file !== '-' && !existsSync(file)) {
    fail(`${file} not found: pass the team's users.yaml, or - to read it from stdin.`);
  }

  const parsed: unknown = Bun.YAML.parse(readFileSync(file === '-' ? 0 : file, 'utf8'));
  const document = parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  const list = 'users' in document ? document.users ?? {} : null;
  const admins = document.admins ?? [];

  if (!list || typeof list !== 'object' || Array.isArray(list)) {
    fail('users.yaml must hold a `users:` map of user id to email.');
  }

  const entries = Object.entries(list).map(([id, value]) => [id, readPerson(id, value)] as const);
  const invalid = entries.filter(([id, person]) => !userId.test(id) || id === templateId || !isValidPerson(person));

  if (invalid.length > 0) {
    fail(`users.yaml: each id must be lowercase letters, digits and dashes (not ${templateId}, which the template workspace has), each user an email, an optional name, and enabled and advanced true or false: ${invalid.map(([id]) => id).join(', ')}`);
  }

  if (new Set(entries.map(([, person]) => person.email)).size !== entries.length) {
    fail('users.yaml: each email must appear once.');
  }

  if (!Array.isArray(admins) || !admins.every(isEmail)) {
    fail('users.yaml: `admins:` must be a list of emails.');
  }

  return { users: new Map(entries), admins: [...new Set(admins.map((email: string) => email.toLowerCase()))] };
}

function writeTeam({ users, admins }: Team) {
  const people = [...users].map(([id, { advanced, ...person }]) => [id, advanced ? { ...person, advanced } : person]);
  const content = Bun.YAML.stringify({ users: Object.fromEntries(people), admins }, null, 2);

  writeAtomic(usersFile, `# The team's people and the admin panel's admins. The provisioner rewrites this file; comments do not survive.\n${content}\n`, 0o600);
}

// Users with a daemon and a login; a disabled user keeps only their volume and owner-socket folder.
function enabledIds({ users }: Team): string[] {
  return [...users].filter(([, person]) => person.enabled).map(([id]) => id);
}

// Compose's own project name, so volume and network names follow COMPOSE_PROJECT_NAME when it is set.
async function project(): Promise<string> {
  return JSON.parse(await docker(['compose', 'config', '--format', 'json'])).name;
}

async function volumeName(id: string): Promise<string> {
  return `${await project()}_data-${id}`;
}

function writeAtomic(file: string, content: string, mode: number) {
  writeFileSync(`${file}.tmp`, content, { mode });
  renameSync(`${file}.tmp`, file);
}

// The per-person part of the stack: a daemon, its network shared only with the hub, and its volume. The template
// workspace gets the same, with the id `template`.
function renderCompose(ids: string[]): string {
  const services = Object.fromEntries(ids.map((id) => [`daemon-${id}`, {
    extends: { file: 'daemon.yaml', service: 'daemon' },
    networks: { [`user-${id}`]: {} },
    volumes: [
      `data-${id}:/data`,
      { type: 'volume', source: 'ipc', target: '/data/data/ipc', volume: { subpath: id } },
    ],
  }]));

  const hub = { networks: Object.fromEntries(ids.map((id) => [`user-${id}`, {}])) };

  return [
    '# Written by `bun deploy.ts apply` from users.yaml. Do not edit: edit users.yaml and run apply again.',
    Bun.YAML.stringify({
      services: { ...services, hub },
      networks: Object.fromEntries(ids.map((id) => [`user-${id}`, {}])),
      volumes: Object.fromEntries(ids.map((id) => [`data-${id}`, {}])),
    }, null, 2),
  ].join('\n');
}

function renderUsers({ users }: Team, ids: string[]): string {
  const daemon = (id: string) => ({ daemonUrl: `http://daemon-${id}:47191`, socketPath: `/ipc/${id}/rpc.sock` });
  const entries = ids.map((id) => [users.get(id)?.email, { id, ...daemon(id), ...(users.get(id)?.advanced ? { advanced: true } : {}) }]);

  // The template has no email: no login routes to it, only the admin panel through the hub.
  return `${JSON.stringify({ users: Object.fromEntries(entries), template: daemon(templateId) }, null, 2)}\n`;
}

// The hub (uid 1000) owns its folder. Group root lets the provisioner, root without capabilities, replace users.json.
function hubFolder() {
  if (!existsSync(hubData)) {
    mkdirSync(hubData, { mode: 0o770 });
  }

  const { uid, gid, mode } = statSync(hubData);

  if (process.getuid?.() === 0 && (uid !== daemonUid || gid !== 0 || (mode & 0o777) !== 0o770)) {
    chownSync(hubData, daemonUid, 0);
    chmodSync(hubData, 0o770);
  }
}

// A one-off root job in the tools service (compose.yaml): no network, the ipc volume and at most one person's volume.
async function tools(script: string, args: string[], { volume, ...options }: DockerOptions & { volume?: string } = {}): Promise<string> {
  const mount = volume ? ['--volume', volume] : [];

  return docker(['compose', 'run', '--rm', '--no-TTY', '--quiet-pull', ...mount, 'tools', script, 'tools', ...args], { ...options, env: { COMPOSE_IGNORE_ORPHANS: 'true' } });
}

// The hub joins each person's network without being recreated, so adding or removing someone keeps everyone else's
// connections open. A full `docker compose up` recreates it with the same networks from users.compose.yaml.
async function connectHub(ids: string[]) {
  const prefix = `${await project()}_user-`;
  const hub = await docker(['compose', 'ps', '--all', '--quiet', 'hub']);
  const wanted = new Set(ids.map((id) => `${prefix}${id}`));
  const attached = Object.keys(JSON.parse(await docker(['inspect', '--format', '{{json .NetworkSettings.Networks}}', hub])));
  const stale = attached.filter((network) => network.startsWith(prefix) && !wanted.has(network));

  await Promise.all([...wanted].filter((network) => !attached.includes(network)).map((network) => docker(['network', 'connect', network, hub])));

  await Promise.all(stale.map(async (network) => {
    await docker(['network', 'disconnect', network, hub]);
    await docker(['network', 'rm', network]);
  }));
}

// One change at a time between a by-hand apply and the provisioner, which share /opt/orbs. A lock older than ten
// minutes was left by a crash.
async function locked<T>(work: () => Promise<T>): Promise<T> {
  const held = statSync(lockFile, { throwIfNoEntry: false });

  if (held && Date.now() - held.mtimeMs > lockStaleMs) {
    rmSync(lockFile, { force: true });
  }

  try {
    closeSync(openSync(lockFile, 'wx', 0o600));
  } catch {
    fail(`Another apply or admin panel change is running (${lockFile}); try again in a minute.`);
  }

  try {
    return await work();
  } finally {
    rmSync(lockFile, { force: true });
  }
}

async function apply() {
  await locked(() => applyTeam());
}

// Brings the stack in line with users.yaml: first start, add, disable or remove a person.
// users.json is written first, so a removed or disabled person loses access before their container stops.
// By hand it waits for every service to be healthy; the provisioner waits only for the person it changed, so another
// person's unhealthy daemon cannot fail a panel change.
async function applyTeam(waitFor?: string[]) {
  const current = team();
  const ids = enabledIds(current);
  const daemons = [templateId, ...ids];

  writeFileSync('users.compose.yaml', renderCompose(daemons));
  hubFolder();
  writeAtomic(path.join(hubData, 'users.json'), renderUsers(current, ids), 0o644);
  await tools('for id in "$@"; do mkdir -p "/ipc/$id" && chown 1000:1000 "/ipc/$id" && chmod 700 "/ipc/$id"; done', daemons);

  const others = (await docker(['compose', 'config', '--services'])).split('\n').filter((service) => !singletons.includes(service));

  const waited = (waitFor ?? []).filter((id) => ids.includes(id)).map((id) => `daemon-${id}`);

  await docker(['compose', 'up', '--detach', ...(waitFor === undefined ? ['--wait'] : []), '--remove-orphans', ...others]);
  await docker(['compose', 'up', '--detach', '--wait', '--no-recreate', ...singletons]);

  if (waited.length > 0) {
    await docker(['compose', 'up', '--detach', '--wait', '--no-recreate', ...waited]);
  }

  await connectHub(daemons);
  console.log(`Applied ${ids.length} users: ${ids.join(', ')} (and the template workspace)`);
}

// A person in users.yaml, or the template workspace (always enabled), for backup and restore.
function known(id: string | undefined): [string, Person] {
  if (id === templateId) {
    return [id, { name: 'Template', email: '', enabled: true, advanced: false }];
  }

  const person = id === undefined ? undefined : team().users.get(id);

  if (id === undefined || person === undefined) {
    fail(`${id ?? '<id>'} is not in users.yaml.`);
  }

  return [id, person];
}

// Copies one person's whole volume (database, credentials key, bots, Pi settings, home) with their daemon stopped.
async function backupVolume(id: string, person: Person): Promise<string> {
  const folder = 'backups';
  const file = path.join(folder, `${id}-${new Date().toISOString().replaceAll(/[:.]/gu, '-')}.tar.gz`);

  mkdirSync(folder, { recursive: true, mode: 0o700 });

  // A disabled person has no container to stop.
  if (person.enabled) {
    await docker(['compose', 'stop', `daemon-${id}`]);
  }

  await tools('tar -C /data -czf - .', [], { volume: `${await volumeName(id)}:/data:ro`, output: file });

  return file;
}

async function startDaemon(id: string, person: Person) {
  if (person.enabled) {
    await docker(['compose', 'up', '--detach', '--wait', `daemon-${id}`]);
  }
}

async function backup() {
  const [id, person] = known(process.argv[3]);
  const file = await backupVolume(id, person);

  await startDaemon(id, person);
  console.log(`Backed up ${id} to ${file}. It contains their keys: keep it secret.`);
}

// Replaces one person's volume with a backup. Takes a fresh backup of the current data first.
async function restore() {
  const [id, person] = known(process.argv[3]);
  const file = process.argv[4];

  if (!file || !existsSync(file)) {
    fail('Usage: bun deploy.ts restore <id> <backup file>');
  }

  const safety = await backupVolume(id, person);

  console.log(`Saved the current data of ${id} to ${safety}.`);
  await tools('find /data -mindepth 1 -delete && tar -C /data -xzpf -', [], { volume: `${await volumeName(id)}:/data`, input: file });
  await startDaemon(id, person);
  console.log(`Restored ${id} from ${file}.`);
}

// A file in the hub's folder, owned by the hub's uid as the hub writes it.
function writeHubFile(file: string, content: object) {
  writeAtomic(file, `${JSON.stringify(content, null, 2)}\n`, 0o600);

  if (process.getuid?.() === 0) {
    chownSync(file, daemonUid, daemonUid);
  }
}

// Deletes a removed person's volume, owner-socket folder and hub pin for good. Restarts the hub (it keeps pins in memory).
async function purge() {
  const id = process.argv[3];

  if (!id || !userId.test(id)) {
    fail('Usage: bun deploy.ts purge <id>');
  }

  if (id === templateId) {
    fail('The template workspace holds the global settings and suggested bots; it is never purged.');
  }

  if (team().users.has(id)) {
    fail(`${id} is still in users.yaml: remove them and run apply first.`);
  }

  await docker(['volume', 'rm', '--force', await volumeName(id)]);
  await tools('rm -rf "/ipc/$1"', [id]);

  const pinsFile = path.join(hubData, 'pins.json');
  const globalFile = path.join(hubData, 'global.json');

  await docker(['compose', 'stop', 'hub']);

  // The pin, and whether each settings section followed global, belong to that person only: a re-added id starts clean.
  if (existsSync(pinsFile)) {
    const { [id]: _removed, ...pins } = JSON.parse(readFileSync(pinsFile, 'utf8'));

    writeHubFile(pinsFile, pins);
  }

  if (existsSync(globalFile)) {
    const { users: { [id]: _removed, ...users } } = JSON.parse(readFileSync(globalFile, 'utf8'));

    writeHubFile(globalFile, { users });
  }

  await docker(['compose', 'start', 'hub']);
  console.log(`Purged ${id}: volume, owner-socket folder, hub pin and global settings modes deleted.`);
}

async function cloudflareCall<T>(method: string, route: string, body?: unknown): Promise<CloudflareResponse<T>> {
  const token = process.env.CLOUDFLARE_API_TOKEN;

  // An empty token usually means the password manager read failed; Cloudflare would only answer "Invalid request headers".
  if (!token) {
    fail('CLOUDFLARE_API_TOKEN is unset or empty: check that reading it from your password manager worked.');
  }

  const response = await fetch(`${cloudflareApi}${route}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => fail(`Cloudflare ${method} ${route.split('?')[0]} answered ${response.status} without JSON.`))) as CloudflareResponse<T>;

  if (!payload.success) {
    fail(`Cloudflare ${method} ${route.split('?')[0]} failed: ${payload.errors.map((error) => `${error.code} ${error.message}`).join('; ')}`);
  }

  return payload;
}

async function cloudflareRequest<T>(method: string, route: string, body?: unknown): Promise<T> {
  return (await cloudflareCall<T>(method, route, body)).result;
}

async function cloudflareList<T>(route: string): Promise<T[]> {
  const pageRoute = (page: number) => `${route}${route.includes('?') ? '&' : '?'}page=${page}&per_page=100`;
  const first = await cloudflareCall<T[]>('GET', pageRoute(1));
  const pages = Array.from({ length: Math.max((first.result_info?.total_pages ?? 1) - 1, 0) }, (_, index) => cloudflareRequest<T[]>('GET', pageRoute(index + 2)));

  return [...first.result, ...(await Promise.all(pages)).flat()];
}

async function cloudflareSerial<Value>(values: readonly Value[], each: (value: Value) => Promise<void>) {
  await values.reduce(async (previous, value) => {
    await previous;
    await each(value);
  }, Promise.resolve());
}

// True when every field the script sets has that value in Cloudflare's copy; Cloudflare adds fields of its own.
function cloudflareMatches(current: unknown, desired: unknown): boolean {
  if (Array.isArray(desired)) {
    return Array.isArray(current) && current.length === desired.length && desired.every((item, index) => cloudflareMatches(current[index], item));
  }

  if (desired !== null && typeof desired === 'object') {
    return current !== null && typeof current === 'object' && Object.entries(desired).every(([key, value]) => cloudflareMatches((current as Record<string, unknown>)[key], value));
  }

  return current === desired;
}

function cloudflareOptions() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(3),
    options: {
      zone: { type: 'string' },
      hostname: { type: 'string' },
      name: { type: 'string' },
      users: { type: 'string' },
      domain: { type: 'string', multiple: true, default: [] },
      session: { type: 'string', default: '24h' },
      'ssh-hostname': { type: 'string' },
      'ssh-email': { type: 'string', multiple: true, default: [] },
      'env-out': { type: 'string' },
      yes: { type: 'boolean', default: false },
    },
    allowPositionals: true,
  });

  const action = positionals[0] ?? '';

  if (!['apply', 'emails', 'destroy'].includes(action)) {
    fail(
      'Usage: bun scripts/deploy.ts cloudflare apply|emails|destroy --zone <zone> --hostname <host> --name orbs-<team> [--users <users.yaml|->] [--domain <domain>...] [--session 24h] [--ssh-hostname <host> --ssh-email <email>...] [--env-out <file>] [--yes]',
    );
  }

  const zone = values.zone ?? fail('Pass --zone, the Cloudflare zone, such as example.com.');
  const name = values.name ?? fail('Pass --name, the exact name prefix of the objects, such as orbs-acme.');
  const hostname = values.hostname ?? fail('Pass --hostname, such as acme.example.com.');
  const sshHostname = values['ssh-hostname'];

  if (!cloudflareNamePattern.test(name)) {
    fail('--name must start with orbs- and use lowercase letters, digits and single dashes.');
  }

  for (const host of [hostname, sshHostname]) {
    if (host !== undefined && !host.endsWith(`.${zone}`)) {
      fail(`${host} is not a name inside the zone ${zone}.`);
    }
  }

  const domains = accessDomains(values.domain);

  return {
    action,
    zone,
    name,
    hostname,
    sshHostname,
    users: values.users,
    domains,
    session: values.session,
    sshEmails: values['ssh-email'],
    envOut: values['env-out'],
    yes: values.yes,
    names: {
      app: name,
      faviconApp: `${name}-favicon`,
      sshApp: `${name}-ssh`,
      allow: `${name}-allow`,
      bypass: `${name}-bypass`,
      sshAllow: `${name}-ssh-allow`,
      // DNS records have no name of their own; this exact comment marks the ones the script owns.
      comment: `orbs deploy ${name}`,
    },
  };
}

type CloudflareOptions = ReturnType<typeof cloudflareOptions>;

// users.yaml decides who may log in, as it decides who gets a daemon: enabled users and the admin panel's admins.
function accessEmails(current: Team): string[] {
  const enabled = [...current.users.values()].filter((person) => person.enabled).map((person) => person.email);

  return [...new Set([...enabled, ...current.admins])].sort();
}

function cloudflareEmails(file: string | undefined): string[] {
  return accessEmails(team(file ?? fail('Pass --users with the path of users.yaml, or - to read it from stdin.')));
}

// `--domain` and CLOUDFLARE_ACCESS_DOMAINS: lowercase domains, each once.
function accessDomains(values: string[]): string[] {
  const domains = [...new Set(values.map((value) => value.trim().toLowerCase().replace(/^@/u, '')))].sort();
  const invalid = domains.find((domain) => !domainPattern.test(domain));

  if (invalid !== undefined) {
    fail(`${invalid} is not a domain such as example.com.`);
  }

  return domains;
}

function accessCovers(domains: string[], email: string): boolean {
  return domains.some((domain) => email.endsWith(`@${domain}`));
}

// With a domain rule, only the emails outside those domains (outside admins, for example) are listed one by one.
function accessRule(domains: string[], emails: string[]): AccessRule {
  return { domains, emails: emails.filter((email) => !accessCovers(domains, email)) };
}

function accessRuleValues(policy: CloudflarePolicy, kind: 'email' | 'email_domain', field: 'email' | 'domain'): string[] {
  return (policy.include ?? []).flatMap((rule) => (kind in rule ? [String((rule[kind] as Record<string, unknown>)[field]).toLowerCase()] : [])).sort();
}

// The allow policy's rules, read back. Rules Orbs never writes (groups, everyone, excludes) make it unreadable.
function accessRead(policy: CloudflarePolicy): AccessRule {
  const include = policy.include ?? [];
  const domains = accessRuleValues(policy, 'email_domain', 'domain');
  const emails = accessRuleValues(policy, 'email', 'email');

  if (domains.length + emails.length !== include.length || (policy.exclude?.length ?? 0) > 0 || (policy.require?.length ?? 0) > 0) {
    fail(`The Access policy ${policy.name} has rules Orbs does not manage; run cloudflare apply to reset it.`);
  }

  return { domains, emails };
}

async function cloudflareContext(zone: string): Promise<CloudflareContext> {
  const zones = await cloudflareRequest<{ id: string; account: { id: string } }[]>('GET', `/zones?name=${encodeURIComponent(zone)}`);
  const found = zones[0] ?? fail(`The token cannot see the zone ${zone}.`);

  return { account: found.account.id, zone: found.id };
}

function cloudflareAllowPolicy(name: string, { domains, emails }: AccessRule) {
  const include = [...domains.map((domain) => ({ email_domain: { domain } })), ...emails.map((email) => ({ email: { email } }))];

  if (include.length === 0) {
    fail('Access would let nobody in: users.yaml needs an enabled user or an admin, or pass --domain.');
  }

  return { name, decision: 'allow', include };
}

// The desired Access policies and apps. Each app names its one policy; the IDs are filled in once the policies exist.
function cloudflareAccessPlan(options: CloudflareOptions, rule: AccessRule) {
  const { names, hostname, sshHostname, session } = options;

  const app = (name: string, uris: string[], policy: string, extra: Record<string, unknown>) => ({
    name,
    type: 'self_hosted',
    domain: uris[0],
    destinations: uris.map((uri) => ({ type: 'public', uri })),
    app_launcher_visible: false,
    policy,
    ...extra,
  });

  const policies = [cloudflareAllowPolicy(names.allow, rule), { name: names.bypass, decision: 'bypass', include: [{ everyone: {} }] }];

  const apps = [
    app(names.app, [hostname], names.allow, {
      session_duration: session,
      http_only_cookie_attribute: true,
      same_site_cookie_attribute: 'lax',
      enable_binding_cookie: false,
    }),
    app(names.faviconApp, [`${hostname}/img/favicon/*`, `${hostname}/favicon.ico`], names.bypass, {}),
  ];

  if (sshHostname !== undefined) {
    const sshEmails = options.sshEmails.map((email) => email.trim().toLowerCase()).sort();

    if (sshEmails.length === 0) {
      fail('Pass --ssh-email for every admin allowed to use SSH.');
    }

    policies.push(cloudflareAllowPolicy(names.sshAllow, { domains: [], emails: sshEmails }));
    apps.push(app(names.sshApp, [sshHostname], names.sshAllow, { session_duration: session }));
  }

  return { policies, apps };
}

async function cloudflareRecords(context: CloudflareContext, hosts: string[]): Promise<CloudflareRecord[]> {
  const records = await Promise.all(hosts.map((host) => cloudflareList<CloudflareRecord>(`/zones/${context.zone}/dns_records?name=${encodeURIComponent(host)}`)));

  return records.flat();
}

async function cloudflareFindTunnel(context: CloudflareContext, name: string): Promise<CloudflareTunnel | undefined> {
  const tunnels = await cloudflareList<CloudflareTunnel>(`/accounts/${context.account}/cfd_tunnel?is_deleted=false&name=${encodeURIComponent(name)}`);

  return tunnels.find((tunnel) => tunnel.name === name);
}

// A remotely managed tunnel: its routes live in Cloudflare and the connector needs only the tunnel token.
async function cloudflareTunnel(context: CloudflareContext, name: string): Promise<CloudflareTunnel> {
  const found = await cloudflareFindTunnel(context, name);

  if (found === undefined) {
    const created = await cloudflareRequest<CloudflareTunnel>('POST', `/accounts/${context.account}/cfd_tunnel`, { name, config_src: 'cloudflare' });

    console.log(`Tunnel ${name}: created`);

    return created;
  }

  if (found.config_src !== 'cloudflare') {
    fail(`The tunnel ${name} uses a local config file; this script manages only tunnels it created.`);
  }

  console.log(`Tunnel ${name}: unchanged`);

  return found;
}

async function cloudflarePolicy(context: CloudflareContext, existing: CloudflareNamed[], policy: { name: string }): Promise<[string, string]> {
  const found = existing.find((item) => item.name === policy.name);
  const body = { ...policy, exclude: [], require: [] };

  if (found === undefined) {
    const created = await cloudflareRequest<CloudflareNamed>('POST', `/accounts/${context.account}/access/policies`, body);

    console.log(`Access policy ${policy.name}: created`);

    return [policy.name, created.id];
  }

  if (cloudflareMatches(found, body)) {
    console.log(`Access policy ${policy.name}: unchanged`);
  } else {
    await cloudflareRequest('PUT', `/accounts/${context.account}/access/policies/${found.id}`, body);
    console.log(`Access policy ${policy.name}: updated`);
  }

  return [policy.name, found.id];
}

async function cloudflareApp(context: CloudflareContext, existing: CloudflareApp[], desired: ReturnType<typeof cloudflareAccessPlan>['apps'][number], policyId: string): Promise<[string, string]> {
  const { policy: _policy, ...fields } = desired;
  const body = { ...fields, policies: [{ id: policyId, precedence: 1 }] };
  const found = existing.find((app) => app.name === desired.name);

  if (found === undefined) {
    const created = await cloudflareRequest<CloudflareApp>('POST', `/accounts/${context.account}/access/apps`, body);

    console.log(`Access app ${desired.name}: created`);

    return [desired.name, created.aud];
  }

  if (cloudflareMatches(found, fields) && cloudflareMatches(found.policies?.map((policy) => policy.id), [policyId])) {
    console.log(`Access app ${desired.name}: unchanged`);
  } else {
    await cloudflareRequest('PUT', `/accounts/${context.account}/access/apps/${found.id}`, body);
    console.log(`Access app ${desired.name}: updated`);
  }

  return [desired.name, found.aud];
}

async function cloudflareRecord(context: CloudflareContext, existing: CloudflareRecord[], body: { name: string }) {
  const found = existing.find((record) => record.name === body.name);

  if (found === undefined) {
    await cloudflareRequest('POST', `/zones/${context.zone}/dns_records`, body);
    console.log(`DNS ${body.name}: created`);
  } else if (cloudflareMatches(found, body)) {
    console.log(`DNS ${body.name}: unchanged`);
  } else {
    await cloudflareRequest('PUT', `/zones/${context.zone}/dns_records/${found.id}`, body);
    console.log(`DNS ${body.name}: updated`);
  }
}

// Creates or updates the tunnel, Access and DNS for one hostname. Order matters: Access protects the hostname
// before its DNS record exists, so it is never reachable unprotected.
async function cloudflareApply(options: CloudflareOptions) {
  const { names, hostname, sshHostname } = options;
  const rule = accessRule(options.domains, cloudflareEmails(options.users));
  const context = await cloudflareContext(options.zone);
  const plan = cloudflareAccessPlan(options, rule);
  const hosts = sshHostname === undefined ? [hostname] : [hostname, sshHostname];

  const [apps, records, existingPolicies, organization] = await Promise.all([
    cloudflareList<CloudflareApp>(`/accounts/${context.account}/access/apps`),
    cloudflareRecords(context, hosts),
    cloudflareList<CloudflareNamed>(`/accounts/${context.account}/access/policies`),
    cloudflareRequest<{ auth_domain: string }>('GET', `/accounts/${context.account}/access/organizations`),
  ]);

  // Refuse before any write: objects on these hostnames that the script did not create stay untouched.
  for (const app of apps) {
    const own = plan.apps.find((item) => item.name === app.name);
    const uris = [app.domain, ...(app.destinations ?? []).map((destination) => destination.uri)];

    if (own === undefined && uris.some((uri) => hosts.some((host) => uri === host || uri?.startsWith(`${host}/`)))) {
      fail(`The Access app ${app.name} already covers ${hostname}. Remove it by hand or choose another hostname.`);
    }

    if (own !== undefined && app.domain !== own.domain) {
      fail(`The Access app ${app.name} exists for ${app.domain}, not ${own.domain}. Choose another --name.`);
    }
  }

  const foreign = records.find((record) => record.comment !== names.comment || record.type !== 'CNAME');

  if (foreign !== undefined) {
    fail(`The DNS record ${foreign.type} ${foreign.name} was not created by this script. Remove it by hand or choose another hostname.`);
  }

  const tunnel = await cloudflareTunnel(context, options.name);
  const policyIds = new Map(await Promise.all(plan.policies.map((policy) => cloudflarePolicy(context, existingPolicies, policy))));
  const auds = new Map(await Promise.all(plan.apps.map((app) => cloudflareApp(context, apps, app, policyIds.get(app.policy) ?? fail(`No policy ${app.policy}.`)))));
  const aud = auds.get(names.app) ?? fail('The Access app has no AUD tag.');
  const teamName = organization.auth_domain.split('.')[0];

  const ingress = [
    { hostname, path: cloudflareFaviconPath, service: cloudflareOrigin },
    { hostname, service: cloudflareOrigin, originRequest: { access: { required: true, teamName, audTag: [aud] } } },
    ...(sshHostname === undefined ? [] : [{ hostname: sshHostname, service: cloudflareSshOrigin }]),
    { service: 'http_status:404' },
  ];

  const configRoute = `/accounts/${context.account}/cfd_tunnel/${tunnel.id}/configurations`;
  const configuration = await cloudflareRequest<{ config: { ingress?: unknown } | null }>('GET', configRoute);

  if (cloudflareMatches(configuration.config?.ingress, ingress)) {
    console.log('Tunnel routes: unchanged');
  } else {
    await cloudflareRequest('PUT', configRoute, { config: { ingress } });
    console.log('Tunnel routes: updated');
  }

  const record = { type: 'CNAME', content: `${tunnel.id}.cfargotunnel.com`, proxied: true, comment: names.comment };

  await Promise.all(hosts.map((host) => cloudflareRecord(context, records, { ...record, name: host })));

  // The zone and name let the provisioner update the allow policy, once a token is added to the server's .env; the
  // domains tell it which people the policy already lets in, with or without a token.
  const values = {
    ORBS_PUBLIC_HOST: hostname,
    ACCESS_TEAM_DOMAIN: `https://${organization.auth_domain}`,
    ACCESS_AUD: aud,
    CLOUDFLARE_ZONE: options.zone,
    CLOUDFLARE_NAME: options.name,
    CLOUDFLARE_ACCESS_DOMAINS: options.domains.join(','),
  };

  console.log(`\nTunnel ${tunnel.name}: ${tunnel.id}`);
  console.log(Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n'));

  if (options.envOut === undefined) {
    console.log('TUNNEL_TOKEN not written: pass --env-out <file> to write it with the values above.');
    return;
  }

  const token = await cloudflareRequest<string>('GET', `/accounts/${context.account}/cfd_tunnel/${tunnel.id}/token`);
  const lines = Object.entries({ ...values, TUNNEL_TOKEN: token }).map(([key, value]) => `${key}=${value}\n`);

  // The token is secret: make an existing file private before writing to it.
  if (existsSync(options.envOut)) {
    chmodSync(options.envOut, 0o600);
  }

  writeFileSync(options.envOut, lines.join(''), { mode: 0o600 });
  console.log(`Wrote these values and TUNNEL_TOKEN to ${options.envOut} (mode 600).`);
}

async function cloudflareFindAllow(zone: string, allow: string): Promise<[CloudflareContext, CloudflarePolicy[], CloudflarePolicy]> {
  const context = await cloudflareContext(zone);
  const policies = await cloudflareList<CloudflarePolicy>(`/accounts/${context.account}/access/policies`);
  const found = policies.find((policy) => policy.name === allow) ?? fail(`The Access policy ${allow} does not exist. Run apply first.`);

  return [context, policies, found];
}

// Updates only the allow policy: by hand with `cloudflare emails`, and from the provisioner after each change.
// Without domains it keeps the policy's own domain rules, which only `apply` sets.
async function cloudflareAllow(zone: string, allow: string, emails: string[], domains?: string[]): Promise<AccessRule> {
  const [context, policies, found] = await cloudflareFindAllow(zone, allow);
  const rule = accessRule(domains ?? accessRuleValues(found, 'email_domain', 'domain'), emails);

  await cloudflarePolicy(context, policies, cloudflareAllowPolicy(allow, rule));

  return rule;
}

// After a person is added to, disabled in or removed from users.yaml, or the admins changed.
async function cloudflareSync(options: CloudflareOptions) {
  const domains = options.domains.length > 0 ? options.domains : undefined;
  const rule = await cloudflareAllow(options.zone, options.names.allow, cloudflareEmails(options.users), domains);

  console.log(`Allowed: ${[...rule.domains.map((domain) => `anyone @${domain}`), ...rule.emails].join(', ')}`);
}

// Lists what it would delete: only objects with this run's exact names and hostnames. Deletes them only with --yes.
async function cloudflareDestroy(options: CloudflareOptions) {
  const { names, hostname, sshHostname } = options;
  const context = await cloudflareContext(options.zone);
  // Without --ssh-hostname the SSH app stays, so its policy must stay too.
  const policyNames = new Set(sshHostname === undefined ? [names.allow, names.bypass] : [names.allow, names.bypass, names.sshAllow]);

  const domains = new Map([
    [names.app, hostname],
    [names.faviconApp, `${hostname}/img/favicon/*`],
    [names.sshApp, sshHostname],
  ]);

  const [tunnel, records, apps, policies] = await Promise.all([
    cloudflareFindTunnel(context, options.name),
    cloudflareRecords(context, sshHostname === undefined ? [hostname] : [hostname, sshHostname]),
    cloudflareList<CloudflareApp>(`/accounts/${context.account}/access/apps`),
    cloudflareList<CloudflareNamed>(`/accounts/${context.account}/access/policies`),
  ]);

  const target = tunnel === undefined ? null : `${tunnel.id}.cfargotunnel.com`;
  const ownRecords = records.filter((record) => record.comment === names.comment && record.type === 'CNAME' && (target === null ? record.content.endsWith('.cfargotunnel.com') : record.content === target));
  const account = `/accounts/${context.account}`;

  // DNS goes first, so the hostname stops resolving while Access still protects it; policies go after the apps that use them.
  const stages: CloudflareDeletion[][] = [
    ownRecords.map((record) => ({ label: `DNS ${record.type} ${record.name} -> ${record.content}`, name: options.name, route: `/zones/${context.zone}/dns_records/${record.id}` })),
    tunnel === undefined ? [] : [{ label: `Tunnel ${tunnel.name} ${tunnel.id}`, name: tunnel.name, route: `${account}/cfd_tunnel/${tunnel.id}` }],
    apps.filter((app) => domains.get(app.name) === app.domain).map((app) => ({ label: `Access app ${app.name} (${app.domain})`, name: app.name, route: `${account}/access/apps/${app.id}` })),
    policies.filter((policy) => policyNames.has(policy.name)).map((policy) => ({ label: `Access policy ${policy.name}`, name: policy.name, route: `${account}/access/policies/${policy.id}` })),
  ];

  const deletions = stages.flat();

  if (deletions.some((item) => item.name !== options.name && !item.name.startsWith(`${options.name}-`))) {
    fail('Refusing: an object to delete does not carry the exact name prefix.');
  }

  if (deletions.length === 0) {
    console.log('Nothing to delete.');
    return;
  }

  console.log(deletions.map((item) => `- ${item.label}`).join('\n'));

  if (!options.yes) {
    console.log('Nothing deleted. Stop the connector, then run again with --yes to delete exactly these.');
    return;
  }

  await cloudflareSerial(stages, async (stage) => {
    await Promise.all(
      stage.map(async (item) => {
        // A tunnel can only be deleted once its connector connections are cleaned up.
        if (item.route.includes('/cfd_tunnel/')) {
          await cloudflareRequest('DELETE', `${item.route}/connections`);
        }

        await cloudflareRequest('DELETE', item.route);
        console.log(`Deleted ${item.label}`);
      }),
    );
  });
}

async function cloudflare() {
  const options = cloudflareOptions();
  const actions = { apply: cloudflareApply, emails: cloudflareSync, destroy: cloudflareDestroy };

  await actions[options.action as keyof typeof actions](options);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function reply(status: number, body: unknown): Response {
  return Response.json(body, { status });
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

// A JSON object with only the given keys, or undefined.
async function readBody(request: Request, keys: string[]): Promise<Record<string, unknown> | undefined> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return undefined;
  }

  const body: unknown = await request.json().catch(() => undefined);

  if (body === null || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => !keys.includes(key))) {
    return undefined;
  }

  return body as Record<string, unknown>;
}

function bodyPerson({ name, email, enabled, advanced = false }: Record<string, unknown>): Person | undefined {
  if (typeof name !== 'string' || typeof email !== 'string' || typeof enabled !== 'boolean' || typeof advanced !== 'boolean') {
    return undefined;
  }

  const person = { name, email: email.toLowerCase(), enabled, advanced };

  return isValidPerson(person) ? person : undefined;
}

function containerState(state: string, health: string): UserState {
  if (state === 'running' && (health === '' || health === 'healthy')) {
    return 'running';
  }

  if (state === 'restarting' || (state === 'running' && health === 'starting')) {
    return 'starting';
  }

  return ['created', 'exited', 'dead', 'paused', 'removing'].includes(state) ? 'stopped' : 'unknown';
}

// Each daemon service's state; a user with no container (disabled, or not applied yet) is stopped.
async function userStates(): Promise<Map<string, UserState>> {
  // One JSON object per line.
  const output = await docker(['compose', 'ps', '--all', '--format', 'json']);
  const rows: { Service: string; State: string; Health: string }[] = output.split('\n').filter(Boolean).map((line) => JSON.parse(line));

  return new Map(rows.map((row) => [row.Service, containerState(row.State, row.Health)]));
}

function provisionerConfig() {
  const token = process.env.PROVISIONER_TOKEN ?? '';
  const { CLOUDFLARE_API_TOKEN: cloudflareToken, CLOUDFLARE_ZONE: zone, CLOUDFLARE_NAME: name } = process.env;

  if (token.length < provisionerTokenLength) {
    fail(`PROVISIONER_TOKEN must be at least ${provisionerTokenLength} random characters.`);
  }

  if (cloudflareToken && (!zone || !name || !cloudflareNamePattern.test(name))) {
    fail('With CLOUDFLARE_API_TOKEN set, CLOUDFLARE_ZONE and CLOUDFLARE_NAME (orbs-<team>) must be set too.');
  }

  return {
    tokenHash: digest(`Bearer ${token}`),
    access: cloudflareToken && zone && name ? { zone, allow: `${name}-allow` } : undefined,
    // Written by `cloudflare apply --domain`; without a token, the only way to know whom the policy already lets in.
    domains: accessDomains((process.env.CLOUDFLARE_ACCESS_DOMAINS ?? '').split(',').filter(Boolean)),
  };
}

// The hub's only way to change the stack. It holds the Docker socket, so it answers a fixed set of requests, only with
// the hub's token, runs one change at a time, and changes the stack only through the same apply as by hand.
async function provisioner() {
  const config = provisionerConfig();
  let queue: Promise<unknown> = Promise.resolve();

  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const run = queue.then(work);

    queue = run.catch(() => undefined);

    return run;
  };

  // `manual`: the policy needs a change Orbs could not make (no token on the server, or Cloudflare refused); the admin
  // makes it by hand. Without a token, a change that only touches emails inside the domain rule needs nothing.
  const syncAccess = async (previous: Team, next: Team): Promise<'synced' | 'manual'> => {
    if (config.access === undefined) {
      const before = new Set(accessEmails(previous));
      const after = new Set(accessEmails(next));
      const changed = [...before.symmetricDifference(after)].filter((email) => !accessCovers(config.domains, email));

      return changed.length === 0 ? 'synced' : 'manual';
    }

    try {
      await cloudflareAllow(config.access.zone, config.access.allow, accessEmails(next));

      return 'synced';
    } catch (error) {
      console.error(`Access sync failed; the allow policy needs the change by hand: ${errorMessage(error)}`);

      return 'manual';
    }
  };

  const listUsers = async () => {
    const current = team();
    const states = await userStates().catch(() => undefined);

    return [...current.users].map(([id, person]) => ({ id, ...person, state: states === undefined ? 'unknown' : (states.get(`daemon-${id}`) ?? 'stopped') }));
  };

  // Writes users.yaml and applies it for one person. When apply fails, a change that leaves the person enabled is
  // rolled back so a retry starts clean; a disable or removal is kept, so the login stays gone. Access follows
  // whichever list stands, and the reply says what happened.
  const change = async (previous: Team, next: Team, id: string, isGranting: boolean): Promise<Response | undefined> => {
    writeTeam(next);

    try {
      await applyTeam([id]);

      return undefined;
    } catch (error) {
      if (isGranting) {
        writeTeam(previous);
        await applyTeam([]).catch((rollback: unknown) => console.error(`Rolling back ${id} failed: ${errorMessage(rollback)}`));
      }

      return reply(500, {
        error: errorMessage(error),
        rolledBack: isGranting,
        access: await syncAccess(previous, isGranting ? previous : next),
      });
    }
  };

  const putUser = (id: string, person: Person) => serial(() => locked(async () => {
    const previous = team();

    if ([...previous.users].some(([other, existing]) => other !== id && existing.email === person.email)) {
      return reply(409, { error: 'Another user has this email.' });
    }

    const next = { users: new Map(previous.users).set(id, person), admins: previous.admins };
    const failed = await change(previous, next, id, person.enabled);

    if (failed) {
      return failed;
    }

    const state = (await userStates()).get(`daemon-${id}`) ?? 'stopped';

    return reply(200, {
      id,
      ...person,
      state,
      access: await syncAccess(previous, next),
    });
  }));

  const deleteUser = (id: string) => serial(() => locked(async () => {
    const previous = team();
    const users = new Map(previous.users);

    if (!users.delete(id)) {
      return reply(404, { error: 'No such user.' });
    }

    const next = { users, admins: previous.admins };

    return await change(previous, next, id, false) ?? reply(200, { id, access: await syncAccess(previous, next) });
  }));

  const putAdmins = (emails: string[]) => serial(() => locked(async () => {
    const previous = team();
    const next = { users: previous.users, admins: [...new Set(emails.map((email) => email.toLowerCase()))] };

    writeTeam(next);

    return reply(200, { emails: next.admins, access: await syncAccess(previous, next) });
  }));

  // What the allow policy lets in, for the panel; needs only Access: Apps and Policies: Read. `emails: null` when that
  // is unknown: no token, Cloudflare could not be read, or the policy has rules Orbs does not manage. The domains then
  // come from the server's config.
  const readAccess = async () => {
    const unknown = { domains: config.domains, emails: null };

    if (config.access === undefined) {
      return unknown;
    }

    return cloudflareFindAllow(config.access.zone, config.access.allow).then(([, , found]) => accessRead(found)).catch((error: unknown) => {
      console.error(`Reading the Access policy failed: ${errorMessage(error)}`);

      return unknown;
    });
  };

  const route = async (request: Request, pathname: string): Promise<Response> => {
    if (!timingSafeEqual(digest(request.headers.get('authorization') ?? ''), config.tokenHash)) {
      return reply(401, { error: 'Unauthorized.' });
    }

    const userPath = /^\/users\/(?<id>[^/]+)$/u.exec(pathname)?.groups?.id;

    if (pathname === '/health' && request.method === 'GET') {
      return reply(200, { ok: true });
    }

    if (pathname === '/users' && request.method === 'GET') {
      return reply(200, { users: await listUsers() });
    }

    if (pathname === '/access' && request.method === 'GET') {
      return reply(200, await readAccess());
    }

    if (pathname === '/access/admins' && request.method === 'PUT') {
      const emails = (await readBody(request, ['emails']))?.emails;

      return Array.isArray(emails) && emails.length <= 100 && emails.every(isEmail) ? putAdmins(emails) : reply(400, { error: 'Send { emails: [<email>] }.' });
    }

    if (userPath === undefined || !['PUT', 'DELETE'].includes(request.method)) {
      return reply(404, { error: 'Not found.' });
    }

    if (!userId.test(userPath) || userPath === templateId) {
      return reply(400, { error: `A user id is lowercase letters, digits and dashes, and never ${templateId}.` });
    }

    if (request.method === 'DELETE') {
      return deleteUser(userPath);
    }

    const body = await readBody(request, ['name', 'email', 'enabled', 'advanced']);
    const person = body === undefined ? undefined : bodyPerson(body);

    return person === undefined ? reply(400, { error: 'Send { name, email, enabled, advanced? }.' }) : putUser(userPath, person);
  };

  const server = Bun.serve({
    hostname: '0.0.0.0',
    port: Number(process.env.PROVISIONER_PORT),
    maxRequestBodySize: provisionerBodyLimit,
    // A change waits for daemons to become healthy; Bun's default 10 s would cut the reply off.
    idleTimeout: 240,
    async fetch(request) {
      const { pathname } = new URL(request.url);

      const response = await route(request, pathname).catch((error: unknown) => {
        console.error(`${request.method} ${pathname} failed: ${errorMessage(error)}`);

        return reply(500, { error: errorMessage(error) });
      });

      console.log(`${request.method} ${pathname} ${response.status}`);

      return response;
    },
  });

  const rule = config.domains.length === 0 ? '' : `; domain rule ${config.domains.map((domain) => `@${domain}`).join(', ')}`;

  console.log(`Provisioner listening on ${server.port}; Access sync ${config.access === undefined ? 'off (manual)' : 'on'}${rule}.`);
}

const commands = { images, cloudflare, apply, backup, restore, purge, provisioner };
const command = process.argv[2] ?? '';

try {
  if (!(command in commands)) {
    fail([
      'Usage:',
      '  bun scripts/deploy.ts images [daemon|web|hub|provisioner ...] [--platform linux/amd64|linux/arm64] [--tag <tag>]',
      '  bun scripts/deploy.ts cloudflare apply|emails|destroy ...',
      'On the server, in /opt/orbs:',
      '  bun deploy.ts apply                     render users.yaml and bring the stack in line',
      '  bun deploy.ts backup <id>               copy one person\'s volume to backups/',
      '  bun deploy.ts restore <id> <file>       replace one person\'s volume with a backup',
      '  bun deploy.ts purge <id>                delete a removed person\'s data for good',
      'In the provisioner image:',
      '  bun deploy.ts provisioner               serve the hub\'s user API on PROVISIONER_PORT',
    ].join('\n'));
  }

  await commands[command as keyof typeof commands]();
} catch (error) {
  console.error(errorMessage(error));
  process.exit(1);
}
