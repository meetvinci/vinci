import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const root = path.resolve(import.meta.dir, '..');
const dockerfile = path.join(root, 'deploy/docker/Dockerfile');
const targets = ['daemon', 'web', 'hub'];
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
      'Usage: bun scripts/deploy.ts cloudflare apply|emails|destroy --zone <zone> --hostname <host> --name orbs-<team> [--users <users.json|->] [--session 24h] [--ssh-hostname <host> --ssh-email <email>...] [--env-out <file>] [--yes]',
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

// The hub's users.json is the one source of truth for who may log in; `-` reads it from stdin, for example over ssh.
function cloudflareEmails(file: string | undefined): string[] {
  if (file === undefined || (file !== '-' && !existsSync(file))) {
    fail('Pass --users with the path of the hub users.json, or - to read it from stdin.');
  }

  const text = readFileSync(file === '-' ? 0 : file, 'utf8');
  const users = (JSON.parse(text) as { users?: Record<string, unknown> }).users ?? {};
  const emails = [...new Set(Object.keys(users).map((email) => email.trim().toLowerCase()))].sort();

  if (emails.length === 0 || emails.some((email) => !/^[^\s@]+@[^\s@]+$/u.test(email))) {
    fail('The users file needs at least one user, and every key must be one email address.');
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

// Updates only the allow policy, after a person is added to or removed from the hub's users.json.
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

const commands = { images, cloudflare };
const command = process.argv[2] ?? '';

if (!(command in commands)) {
  fail('Usage: bun scripts/deploy.ts images [daemon|web|hub ...] [--platform linux/amd64|linux/arm64] [--tag <tag>] | cloudflare apply|emails|destroy ...');
}

await commands[command as keyof typeof commands]();
