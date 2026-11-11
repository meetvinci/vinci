import { chmodSync, chownSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

// Runs from a repo checkout (images) and, copied to /opt/orbs on the server, from there (every other command).
// It imports only Bun and node builtins, so the server needs Bun and Docker and nothing else.
const root = path.resolve(import.meta.dir, '..');
const dockerfile = path.join(root, 'deploy/docker/Dockerfile');
const targets = ['daemon', 'web', 'hub'];
const project = 'orbs';
const hubData = 'hub';
const userId = /^[a-z\d][a-z\d-]{0,62}$/u;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const daemonUid = 1000;
const cloudflareApi = 'https://api.cloudflare.com/client/v4';
// Objects are found by exact names built from --name: the account may hold unrelated objects that share a prefix.
const cloudflareNamePattern = /^orbs-[a-z0-9]+(?:-[a-z0-9]+)*$/u;
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

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

interface DockerOptions {
  input?: string;
  output?: string;
  env?: Record<string, string>;
}

function docker(args: string[], { input, output, env }: DockerOptions = {}): string {
  const out = output ? openSync(output, 'wx', 0o600) : 'pipe';

  const result = Bun.spawnSync(['docker', ...args], {
    env: { ...process.env, ...env },
    stdin: input ? Bun.file(input) : 'inherit',
    stdout: out,
    stderr: 'inherit',
  });

  if (typeof out === 'number') {
    closeSync(out);
  }

  if (!result.success) {
    fail(`docker ${args.slice(0, 3).join(' ')} failed.`);
  }

  return result.stdout?.toString().trim() ?? '';
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

// users.yaml is the one list of people: `users: { <id>: <email> }`. `-` reads it from stdin, for example over ssh.
function users(file = 'users.yaml'): Map<string, string> {
  if (file !== '-' && !existsSync(file)) {
    fail(`${file} not found: pass the team's users.yaml, or - to read it from stdin.`);
  }

  const parsed: unknown = Bun.YAML.parse(readFileSync(file === '-' ? 0 : file, 'utf8'));
  const list = parsed && typeof parsed === 'object' && 'users' in parsed ? parsed.users ?? {} : null;

  if (!list || typeof list !== 'object' || Array.isArray(list)) {
    fail('users.yaml must hold a `users:` map of user id to email.');
  }

  const entries = Object.entries(list).map(([id, address]) => [id, String(address).toLowerCase()] as const);
  const invalid = entries.filter(([id, address]) => !userId.test(id) || !emailPattern.test(address));

  if (invalid.length > 0) {
    fail(`users.yaml: each id must be lowercase letters, digits and dashes, each value an email: ${invalid.map(([id]) => id).join(', ')}`);
  }

  if (new Set(entries.map(([, address]) => address)).size !== entries.length) {
    fail('users.yaml: each email must appear once.');
  }

  return new Map(entries);
}

function volumeName(id: string): string {
  return `${project}_data-${id}`;
}

function writeAtomic(file: string, content: string, mode: number) {
  writeFileSync(`${file}.tmp`, content, { mode });
  renameSync(`${file}.tmp`, file);
}

// The per-person part of the stack: a daemon, its network shared only with the hub, and its volume.
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

function renderUsers(list: Map<string, string>): string {
  const entries = [...list].map(([id, address]) => [address, { id, daemonUrl: `http://daemon-${id}:47191`, socketPath: `/ipc/${id}/rpc.sock` }]);

  return `${JSON.stringify({ users: Object.fromEntries(entries) }, null, 2)}\n`;
}

// A one-off root job in the tools service (compose.yaml): no network, the ipc volume and at most one person's volume.
function tools(script: string, args: string[], { volume, ...options }: DockerOptions & { volume?: string } = {}): string {
  const mount = volume ? ['--volume', volume] : [];

  return docker(['compose', 'run', '--rm', '--no-TTY', '--quiet-pull', ...mount, 'tools', script, 'tools', ...args], { ...options, env: { COMPOSE_IGNORE_ORPHANS: 'true' } });
}

// The hub joins each person's network without being recreated, so adding or removing someone keeps everyone else's
// connections open. A full `docker compose up` recreates it with the same networks from users.compose.yaml.
function connectHub(ids: string[]) {
  const hub = docker(['compose', 'ps', '--all', '--quiet', 'hub']);
  const wanted = new Set(ids.map((id) => `${project}_user-${id}`));
  const attached = Object.keys(JSON.parse(docker(['inspect', '--format', '{{json .NetworkSettings.Networks}}', hub])));
  const stale = attached.filter((network) => network.startsWith(`${project}_user-`) && !wanted.has(network));

  for (const network of wanted) {
    if (!attached.includes(network)) {
      docker(['network', 'connect', network, hub]);
    }
  }

  for (const network of stale) {
    docker(['network', 'disconnect', network, hub]);
    docker(['network', 'rm', network]);
  }
}

// Brings the stack in line with users.yaml: first start, add a person, remove a person.
// users.json is written first, so a removed person loses access before their container stops.
function apply() {
  const list = users();
  const ids = [...list.keys()];

  writeFileSync('users.compose.yaml', renderCompose(ids));

  if (!existsSync(hubData)) {
    mkdirSync(hubData, { mode: 0o700 });

    if (process.getuid?.() === 0) {
      chownSync(hubData, daemonUid, daemonUid);
    }
  }

  writeAtomic(path.join(hubData, 'users.json'), renderUsers(list), 0o644);

  if (ids.length > 0) {
    tools('for id in "$@"; do mkdir -p "/ipc/$id" && chown 1000:1000 "/ipc/$id" && chmod 700 "/ipc/$id"; done', ids);
  }

  const others = docker(['compose', 'config', '--services']).split('\n').filter((service) => service !== 'hub');

  docker(['compose', 'up', '--detach', '--wait', '--remove-orphans', ...others]);
  docker(['compose', 'up', '--detach', '--wait', '--no-recreate', 'hub']);
  connectHub(ids);
  console.log(`Applied ${ids.length} users: ${ids.join(', ')}`);
}

function known(id: string | undefined): string {
  if (!id || !users().has(id)) {
    fail(`${id ?? '<id>'} is not in users.yaml.`);
  }

  return id;
}

// Copies one person's whole volume (database, credentials key, bots, Pi settings, home) with their daemon stopped.
function backupVolume(id: string): string {
  const folder = 'backups';
  const file = path.join(folder, `${id}-${new Date().toISOString().replaceAll(/[:.]/gu, '-')}.tar.gz`);

  mkdirSync(folder, { recursive: true, mode: 0o700 });
  docker(['compose', 'stop', `daemon-${id}`]);
  tools('tar -C /data -czf - .', [], { volume: `${volumeName(id)}:/data:ro`, output: file });

  return file;
}

function backup() {
  const id = known(process.argv[3]);
  const file = backupVolume(id);

  docker(['compose', 'up', '--detach', '--wait', `daemon-${id}`]);
  console.log(`Backed up ${id} to ${file}. It contains their keys: keep it secret.`);
}

// Replaces one person's volume with a backup. Takes a fresh backup of the current data first.
function restore() {
  const id = known(process.argv[3]);
  const file = process.argv[4];

  if (!file || !existsSync(file)) {
    fail('Usage: bun deploy.ts restore <id> <backup file>');
  }

  const safety = backupVolume(id);

  console.log(`Saved the current data of ${id} to ${safety}.`);
  tools('find /data -mindepth 1 -delete && tar -C /data -xzpf -', [], { volume: `${volumeName(id)}:/data`, input: file });
  docker(['compose', 'up', '--detach', '--wait', `daemon-${id}`]);
  console.log(`Restored ${id} from ${file}.`);
}

// Deletes a removed person's volume, owner-socket folder and hub pin for good. Restarts the hub (it keeps pins in memory).
function purge() {
  const id = process.argv[3];

  if (!id || !userId.test(id)) {
    fail('Usage: bun deploy.ts purge <id>');
  }

  if (users().has(id)) {
    fail(`${id} is still in users.yaml: remove them and run apply first.`);
  }

  docker(['volume', 'rm', '--force', volumeName(id)]);
  tools('rm -rf "/ipc/$1"', [id]);

  const pinsFile = path.join(hubData, 'pins.json');

  docker(['compose', 'stop', 'hub']);

  if (existsSync(pinsFile)) {
    const { [id]: _removed, ...pins } = JSON.parse(readFileSync(pinsFile, 'utf8'));

    writeAtomic(pinsFile, `${JSON.stringify(pins, null, 2)}\n`, 0o600);

    if (process.getuid?.() === 0) {
      chownSync(pinsFile, daemonUid, daemonUid);
    }
  }

  docker(['compose', 'start', 'hub']);
  console.log(`Purged ${id}: volume, owner-socket folder and hub pin deleted.`);
}

async function cloudflareCall<T>(method: string, route: string, body?: unknown): Promise<CloudflareResponse<T>> {
  const token = process.env.CLOUDFLARE_API_TOKEN ?? fail('Set CLOUDFLARE_API_TOKEN.');

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
      'Usage: bun scripts/deploy.ts cloudflare apply|emails|destroy --zone <zone> --hostname <host> --name orbs-<team> [--users <users.yaml|->] [--session 24h] [--ssh-hostname <host> --ssh-email <email>...] [--env-out <file>] [--yes]',
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

  return {
    action,
    zone,
    name,
    hostname,
    sshHostname,
    users: values.users,
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

// users.yaml decides who may log in, as it decides who gets a daemon.
function cloudflareEmails(file: string | undefined): string[] {
  const emails = [...users(file ?? fail('Pass --users with the path of users.yaml, or - to read it from stdin.')).values()].sort();

  if (emails.length === 0) {
    fail('users.yaml needs at least one user.');
  }

  return emails;
}

async function cloudflareContext(zone: string): Promise<CloudflareContext> {
  const zones = await cloudflareRequest<{ id: string; account: { id: string } }[]>('GET', `/zones?name=${encodeURIComponent(zone)}`);
  const found = zones[0] ?? fail(`The token cannot see the zone ${zone}.`);

  return { account: found.account.id, zone: found.id };
}

function cloudflareAllowPolicy(name: string, emails: string[]) {
  return { name, decision: 'allow', include: emails.map((email) => ({ email: { email } })) };
}

// The desired Access policies and apps. Each app names its one policy; the IDs are filled in once the policies exist.
function cloudflareAccessPlan(options: CloudflareOptions, emails: string[]) {
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

  const policies = [cloudflareAllowPolicy(names.allow, emails), { name: names.bypass, decision: 'bypass', include: [{ everyone: {} }] }];

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

    policies.push(cloudflareAllowPolicy(names.sshAllow, sshEmails));
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
  const emails = cloudflareEmails(options.users);
  const context = await cloudflareContext(options.zone);
  const plan = cloudflareAccessPlan(options, emails);
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

  const values = { ORBS_PUBLIC_HOST: hostname, ACCESS_TEAM_DOMAIN: `https://${organization.auth_domain}`, ACCESS_AUD: aud };

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

// Updates only the allow policy, after a person is added to or removed from users.yaml.
async function cloudflareSync(options: CloudflareOptions) {
  const emails = cloudflareEmails(options.users);
  const context = await cloudflareContext(options.zone);
  const policies = await cloudflareList<CloudflareNamed>(`/accounts/${context.account}/access/policies`);

  if (!policies.some((policy) => policy.name === options.names.allow)) {
    fail(`The Access policy ${options.names.allow} does not exist. Run apply first.`);
  }

  await cloudflarePolicy(context, policies, cloudflareAllowPolicy(options.names.allow, emails));
  console.log(`Allowed: ${emails.join(', ')}`);
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

const commands = { images, cloudflare, apply, backup, restore, purge };
const command = process.argv[2] ?? '';

if (!(command in commands)) {
  fail([
    'Usage:',
    '  bun scripts/deploy.ts images [daemon|web|hub ...] [--platform linux/amd64|linux/arm64] [--tag <tag>]',
    '  bun scripts/deploy.ts cloudflare apply|emails|destroy ...',
    'On the server, in /opt/orbs:',
    '  bun deploy.ts apply                     render users.yaml and bring the stack in line',
    '  bun deploy.ts backup <id>               copy one person\'s volume to backups/',
    '  bun deploy.ts restore <id> <file>       replace one person\'s volume with a backup',
    '  bun deploy.ts purge <id>                delete a removed person\'s data for good',
  ].join('\n'));
}

await commands[command as keyof typeof commands]();
