import { createHash, timingSafeEqual } from 'node:crypto';
import { chmodSync, chownSync, closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmSync, statfsSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

// Runs from a repo checkout (images), copied to /opt/vinci on the server, from there (every other command), and in
// the provisioner image (`provisioner`, which runs the same apply for the hub's admin panel).
// It imports only Bun and node builtins, so the server needs Bun and Docker and nothing else.
const root = path.resolve(import.meta.dir, '..');
const dockerfile = path.join(root, 'deploy/docker/Dockerfile');
const targets = ['daemon', 'sandbox', 'web', 'hub', 'provisioner', 'firewall', 'api'];
const usersFile = 'users.yaml';
const lockFile = 'users.yaml.lock';
// The first admin's password, written by cloud-init; the provisioner deletes it once that admin changed theirs.
const firstPasswordFile = 'admin-password';
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
const cloudflareNamePattern = /^vinci-[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const domainPattern = /^(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)+[a-z]{2,63}$/u;
// Only the icon files skip cloudflared's own Access check; a segment cannot contain a slash, so no path climbs out.
const cloudflareFaviconPath = '^/(?:img/favicon/[^/]+|favicon\\.ico)$';
// The hub on the Compose `tunnel` network, and the host's sshd as cloudflared's container sees it.
const cloudflareOrigin = 'http://hub:47192';
const cloudflareSshOrigin = 'ssh://host.docker.internal:22';
// Every daemon's network is a bridge named mv-d<9 hex of its id>, so the firewall's rules match all of them, people added
// later included, by the interface prefix alone. Linux allows 15 characters.
const daemonBridgePrefix = 'mv-d';
const daemonPort = 47191;
// What the firewall service keeps: a chain in Docker's DOCKER-USER (what daemons forward) and one jumped from INPUT
// (what daemons send to the host itself), both only for packets that come in on a daemon bridge.
const firewallChains = { forward: 'VINCI-DAEMONS', host: 'VINCI-DAEMONS-HOST' };
const firewallParents = { forward: 'DOCKER-USER', host: 'INPUT' };
// The port a starting daemon connects to on its gateway until the firewall rejects it (deploy/docker/firewall-wait.sh).
const firewallWaitPort = 9;
// While Docker's chains are gone (`nft flush ruleset`), nothing filters what daemons forward: this drop holds until
// Docker writes its chains again. Without Docker's NAT they have no internet then anyway.
const firewallFlushGuard = ['FORWARD', '-i', `${daemonBridgePrefix}+`, '-j', 'DROP'];
// How a failed health check starts its line in the firewall's log, for `firewall status`.
const firewallProblem = 'Firewall check failed:';
// Addresses no bot reaches unless VINCI_INTERNAL_ALLOW names one: private, shared (CGNAT, Tailscale), link-local
// (cloud metadata), loopback, benchmarking, multicast and reserved ranges.
const internalRanges = ['0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12', '192.0.0.0/24', '192.168.0.0/16', '198.18.0.0/15', '224.0.0.0/3'];
// No leading zeros: iptables reads 010.0.0.1 as octal, 8.0.0.1.
const internalAllowPattern = /^(?<address>(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)):(?<port>\d{1,5})$/u;
const backupsFolder = 'backups';
// One nightly run: backups/<UTC time>/ with each volume, the hub folder, the API's database, the deployment files and
// manifest.json.
const nightlyFolder = /^\d{4}-\d{2}-\d{2}T\d{6}Z$/u;
const nightlyStatusFile = path.join(backupsFolder, 'nightly.json');
const nightlyManifest = 'manifest.json';
const nightlyHubFile = 'hub.tar.gz';
const nightlyDatabaseFile = 'postgres.sql.gz';
const nightlyDeploymentFile = 'deployment.tar.gz';
// What a fresh server needs next to the volumes and the hub folder, with the edge file of VINCI_AUTH; COMPOSE_FILE in
// .env may name more.
const deploymentFiles = ['.env', usersFile, 'users.compose.yaml', 'compose.yaml', 'daemon.yaml', 'sandbox.yaml', 'deploy.ts'];
// How people log in, VINCI_AUTH in .env, and the Compose file of each mode's edge: Cloudflare Access through cloudflared
// (the default), or Vinci accounts in the Laravel API behind Caddy, which publishes 80 and 443 itself.
const authEdges = { access: 'cloudflared.compose.yaml', laravel: 'caddy.compose.yaml' };
const laravelSecretLength = 32;
// `check`: what a production server needs, and the least a test server gets away with (a warning, not a failure).
const serverMemoryGib = 3.7;
const serverDiskGb = { production: 40, test: 30 };
const serverUbuntu = '24.04';
// `check <address>`: what a public response must not carry. Headers that name the software behind the address or
// its version, any header named like a version, and on errors a body with a stack trace or a versioned product name.
// Cloudflare sends `Server: cloudflare` on everything it serves and lets nobody remove it: the one value allowed.
const disclosureHeaders = ['server', 'x-powered-by', 'via', 'x-generator', 'x-runtime', 'x-served-by', 'x-backend-server', 'x-aspnet-version', 'x-aspnetmvc-version'];
const disclosureVersion = /\b[A-Za-z][\w-]*\/v?\d+(?:\.\d+)+/u;
const disclosureBody = /stack ?trace|\bat \S+ \(\S+:\d+:\d+\)|\.php(?: on line |:|\()\d+|\b(?:apache|nginx|caddy|php|laravel|symfony|bun|node)\/?\s?v?\d+\.\d+/iu;
// Each edge's paths: the app, the admin panel, the RPC, the hub's public health and icons, the login pages, and a path
// nothing serves, on the hub and on the login pages.
const disclosurePaths = ['/', '/admin', '/rpc', '/hub/health', '/favicon.ico', '/img/favicon/site.webmanifest', '/vinci-check-404', '/cdn-cgi/access/login', '/cdn-cgi/access/logout', '/cdn-cgi/access/vinci-check-404'];
const disclosureTimeoutMs = 15_000;
// `nightly status` exits non-zero once the last good run is older than this: the timer is meant to run daily.
const nightlyStaleMs = 36 * 60 * 60 * 1000;
// The timer's service is stopped after this long; `nightly status` counts a run still `running` after it as failed.
const nightlyTimeoutMs = 2 * 60 * 60 * 1000;
// A by-hand apply or a panel change may hold the lock when the timer fires; the nightly run waits this long for it.
const nightlyLockWaitMs = 5 * 60 * 1000;
// The off-site copy of a run in the S3 bucket: <prefix><run>.tar.gpg, the run's folder encrypted with BACKUP_PASSPHRASE,
// and <prefix><run>.sha256 with that object's checksum, written last: an object without it is an unfinished upload.
const offsiteObject = /^(?<run>\d{4}-\d{2}-\d{2}T\d{6}Z)\.(?:tar\.gpg|sha256)$/u;
const offsitePrefix = /^(?:[\w.-]+\/)*$/u;
const offsiteStatusFile = path.join(backupsFolder, 'offsite.json');
const offsitePassphraseLength = 20;
// GnuPG's symmetric OpenPGP encryption: AES-256 with an integrity check, the passphrase stretched by its S2K. The
// passphrase reaches gpg on fd 3 from the environment, never on a command line.
const gpgOptions = '--homedir /tmp/gnupg --quiet --batch --no-tty --pinentry-mode loopback --passphrase-fd 3';
const systemdFolder = '/etc/systemd/system';
// Each person's sandbox disk: an ext4 file system in the sparse file disks/<id>.img, mounted at disks/<id> on the host,
// so the kernel stops their bots' writes at SANDBOX_DISK. Only bot-writable folders live there: agents/, the bot
// folders, which both the daemon and the sandbox mount from it, and bot-home/, the bots' home, which only the sandbox
// mounts. The daemon's own data stays in its volume. The marker
// file exists only on a mounted disk: Docker refuses a missing subpath, so a disk that is not mounted fails closed.
const disksFolder = 'disks';
const diskMarker = '.vinci-disk';
const diskSizeDefault = '5g';
const diskSizePattern = /^(?<amount>[1-9]\d{0,5})(?<unit>[mg])$/iu;
// `status` calls a disk full from this share of its bytes or its files (inodes) used: ext4 keeps no room in reserve
// (mkfs -m 0), and makes one inode per 8 KiB (mkfs -i 8192), about 650,000 files on 5 GiB.
const diskFullShare = 0.95;
// `status` calls the server's own disk low below this share free: people's disks, backups and the hub share it.
const serverLowShare = 0.1;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/u;

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

// Builds vinci-<target>:<tag> images into the local Docker image store. linux/amd64 is the server target;
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
    const image = `vinci-${target}:${values.tag}`;

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

// A daemon's or a sandbox's network: its bridge name puts it under the firewall's rules, no traffic between
// containers on it except what the firewall lets through (the hub to the daemon's port), and no IPv6. A sandbox's key
// is `sandbox:<id>`, which no person's id can be.
function daemonNetwork(key: string) {
  return {
    enable_ipv6: false,
    driver_opts: {
      'com.docker.network.bridge.name': `${daemonBridgePrefix}${createHash('sha256').update(key).digest('hex').slice(0, 9)}`,
      'com.docker.network.bridge.enable_icc': 'false',
    },
  };
}

// Compose starts a daemon or sandbox only once the firewall is healthy. Docker ignores that order after a reboot or
// its own restart, so each image's entry first waits until the firewall rejects it (deploy/docker/firewall-wait.sh).
const firewallFirst = { firewall: { condition: 'service_healthy' } };

// Mounts every disk in <folder> that is not mounted, at boot (the systemd unit `apply` installs, before Docker starts
// anyone). Each is checked first as systemd checks its own disks (e2fsck -p: replays the journal after a crash, fixes
// what is safe); a disk it cannot repair stays unmounted, so only that person stays stopped, and the rest still mount.
// nosuid and nodev: a bot's files never gain privileges; exec stays allowed.
const disksMountScript = 'failed=0; for img in "$1"/*.img; do [ -e "$img" ] || continue; mnt="$1/$(basename "$img" .img)"; mkdir -p "$mnt"; if ! mountpoint -q "$mnt"; then { e2fsck -p "$img" || [ $? -lt 4 ]; } && mount -o loop,nosuid,nodev,discard "$img" "$mnt" || { echo "Could not mount $img: see troubleshooting.md, A sandbox disk does not mount." >&2; failed=1; continue; }; fi; fstrim "$mnt" > /dev/null 2>&1 || true; done; exit $failed';

// On the host, for <folder> <bytes> <id>...: creates each missing disk (sparse, so it takes only what is written), mounts
// it, grows it online when SANDBOX_DISK grew, and trims it so space bots freed goes back to the server (`discard` does
// that only in part). Prints `new <id>` for a disk without bot folders yet, `larger <id>` for one bigger than
// SANDBOX_DISK (shrinking is not done: it needs the disk offline). A disk that is not mounted is checked first, as at
// boot; one e2fsck cannot repair stops apply with its name. A disk mounted from another file (an image renamed while
// mounted, as when replacing a broken one) stops apply too: the person would otherwise run on the old file until the
// next boot. Only `new` and `larger` lines go to stdout.
const disksScript = [
  'set -eu',
  'dir=$1; bytes=$2; shift 2',
  'mkdir -p "$dir"; chmod 700 "$dir"',
  'for id in "$@"; do',
  '  img="$dir/$id.img"; mnt="$dir/$id"',
  '  if [ ! -e "$img" ]; then rm -f "$img.new"; truncate -s "$bytes" "$img.new"; chmod 600 "$img.new"; mkfs.ext4 -q -F -m 0 -i 8192 -E lazy_itable_init=1,lazy_journal_init=1 "$img.new"; mv "$img.new" "$img"; fi',
  '  mkdir -p "$mnt"',
  '  if ! mountpoint -q "$mnt"; then',
  '    { e2fsck -p "$img" >&2 || [ $? -lt 4 ]; } || { echo "The sandbox disk of $id has errors e2fsck -p cannot repair: see troubleshooting.md, A sandbox disk does not mount." >&2; exit 1; }',
  '    mount -o loop,nosuid,nodev,discard "$img" "$mnt"',
  '  fi',
  '  dev=$(findmnt -n -o SOURCE --mountpoint "$mnt")',
  '  losetup -j "$img" | grep -q "^$dev:" || { echo "$mnt is mounted from $(losetup -n -O BACK-FILE "$dev"), not $img: stop daemon-$id and sandbox-$id, umount $mnt, then run apply again (troubleshooting.md, A sandbox disk does not mount)." >&2; exit 1; }',
  `  [ -e "$mnt/${diskMarker}" ] || touch "$mnt/${diskMarker}"`,
  '  size=$(stat -c %s "$img")',
  '  if [ "$size" -lt "$bytes" ]; then truncate -s "$bytes" "$img"; losetup -c "$dev"; resize2fs -f "$dev" > /dev/null; fi',
  '  if [ "$size" -gt "$bytes" ]; then echo "larger $id"; fi',
  '  fstrim "$mnt" > /dev/null 2>&1 || true',
  '  if [ ! -d "$mnt/agents" ] || [ ! -d "$mnt/bot-home" ]; then echo "new $id"; fi',
  'done',
].join('\n');

// In the tools service, with a person's volume at /data and their disk at /disk: the first time, moves their bot folders
// (agents) and the bots' home (bot-home) from the volume, where they were before the disk, onto the disk, each through
// <folder>.new so a failed copy leaves both as they were. cp -a keeps sparse files sparse. Run with the person's daemon
// and sandbox stopped.
const disksMoveScript = [
  `[ -e /disk/${diskMarker} ] || { echo "The sandbox disk is not mounted." >&2; exit 1; }`,
  'set -eu',
  'for f in agents bot-home; do',
  '  if [ ! -d "/disk/$f" ]; then',
  '    rm -rf "/disk/$f.new"; mkdir "/disk/$f.new"',
  '    if [ -d "/data/$f" ]; then cp -a "/data/$f/." "/disk/$f.new/"; fi',
  '    chown 1000:1000 "/disk/$f.new"; chmod 755 "/disk/$f.new"; mv "/disk/$f.new" "/disk/$f"',
  '    if [ -d "/data/$f" ]; then find "/data/$f" -mindepth 1 -delete; fi',
  '  fi',
  'done',
].join('\n');

// The per-person part of the stack: a daemon, its network shared only with the hub, and its volume; and the sandbox
// where their bots' tools run, alone on a network of its own (a daemon bridge to the firewall), seeing only the bot
// folders and the bots' home on their disk, the shared skills of that volume and, read only, the folder the daemon
// shares with it. The
// template workspace gets the same, with the id `template`.
function renderCompose(ids: string[]): string {
  const services = Object.fromEntries(ids.flatMap((id) => [[`daemon-${id}`, {
    extends: { file: 'daemon.yaml', service: 'daemon' },
    depends_on: firewallFirst,
    networks: { [`user-${id}`]: {} },
    volumes: [
      `data-${id}:/data`,
      { type: 'volume', source: 'ipc', target: '/data/data/ipc', volume: { subpath: id } },
      { type: 'volume', source: `disk-${id}`, target: '/data/agents', volume: { subpath: 'agents' } },
      `sandbox-${id}:/run/sandbox`,
      // The bots' home is theirs alone: the daemon sees an empty read-only folder there, so it never reads it or
      // follows a link into it.
      { type: 'tmpfs', target: '/data/bot-home', read_only: true, tmpfs: { size: 4096 } },
    ],
  }], [`sandbox-${id}`, {
    extends: { file: 'sandbox.yaml', service: 'sandbox' },
    // The daemon's image fills a new volume first, so home/.agents exists, and it owns the shared folder. agents/ is on
    // the person's disk, which apply creates before anything starts.
    depends_on: { ...firewallFirst, [`daemon-${id}`]: { condition: 'service_started' } },
    networks: { [`sandbox-${id}`]: {} },
    volumes: [
      { type: 'volume', source: `disk-${id}`, target: '/data/agents', volume: { subpath: 'agents' } },
      { type: 'volume', source: `data-${id}`, target: '/data/home/.agents', read_only: true, volume: { subpath: 'home/.agents' } },
      { type: 'volume', source: `disk-${id}`, target: '/home/bot', volume: { subpath: 'bot-home' } },
      { type: 'volume', source: `sandbox-${id}`, target: '/run/sandbox', read_only: true },
    ],
  }]]));

  const hub = { networks: Object.fromEntries(ids.map((id) => [`user-${id}`, {}])) };

  return [
    '# Written by `bun deploy.ts apply` from users.yaml. Do not edit: edit users.yaml and run apply again.',
    Bun.YAML.stringify({
      services: { ...services, hub },
      networks: Object.fromEntries(ids.flatMap((id) => [[`user-${id}`, daemonNetwork(id)], [`sandbox-${id}`, daemonNetwork(`sandbox:${id}`)]])),
      volumes: Object.fromEntries(ids.flatMap((id) => [[`data-${id}`, {}], [`sandbox-${id}`, {}], [`disk-${id}`, diskVolume(id)]])),
    }, null, 2),
  ].join('\n');
}

function renderUsers({ users }: Team, ids: string[]): string {
  const daemon = (id: string) => ({ daemonUrl: `http://daemon-${id}:47191`, socketPath: `/ipc/${id}/rpc.sock` });

  const entries = ids.map((id) => {
    const person = users.get(id);

    return [person?.email, { id, name: person?.name, ...daemon(id), ...(person?.advanced ? { advanced: true } : {}) }];
  });

  // The template has no email: no login routes to it, only the admin panel through the hub.
  return `${JSON.stringify({ users: Object.fromEntries(entries), template: daemon(templateId) }, null, 2)}\n`;
}

// The people this apply gives a new, empty data volume: the hub makes each follow every global section, as if added in
// the panel (admin.md, Global settings), and then deletes the file, so a list never outlives the hub acting on it.
// Someone whose volume already exists (data from before global settings) is never listed. A list the hub has not
// consumed yet (it was down, or the apply failed before it started) is kept, so running apply again after a failure
// still counts the people it created as new. Only apply writes this file; only the hub deletes it.
function newUnread(file: string): string[] {
  try {
    const { users } = JSON.parse(readFileSync(file, 'utf8'));

    return Array.isArray(users) ? users : [];
  } catch {
    return [];
  }
}

async function writeNew(ids: string[]) {
  const file = path.join(hubData, 'new-users.json');
  const unread = newUnread(file);
  const volumes = new Set((await docker(['volume', 'ls', '--quiet'])).split('\n'));
  const prefix = `${await project()}_data-`;
  const users = ids.filter((id) => !volumes.has(`${prefix}${id}`) || unread.includes(id));

  if (users.length === 0) {
    rmSync(file, { force: true });
    return;
  }

  writeAtomic(file, `${JSON.stringify({ users })}\n`, 0o644);
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

// A one-off root job in the tools service (compose.yaml): no network, the ipc volume and the given mounts.
async function tools(script: string, args: string[], { volumes = [], ...options }: DockerOptions & { volumes?: string[] } = {}): Promise<string> {
  const mount = volumes.flatMap((volume) => ['--volume', volume]);

  return docker(['compose', 'run', '--rm', '--no-TTY', '--quiet-pull', ...mount, 'tools', script, 'tools', ...args], { ...options, env: { COMPOSE_IGNORE_ORPHANS: 'true' } });
}

// A person's disk as Docker sees it: a bind of its mount point on the host, so containers get the mounted file system.
function diskVolume(id: string) {
  return { driver: 'local', driver_opts: { type: 'none', o: 'bind', device: path.resolve(disksFolder, id) } };
}

// SANDBOX_DISK in .env, such as 5g or 500m.
function diskBytes(): number {
  const value = envValue('SANDBOX_DISK') ?? diskSizeDefault;
  const { amount = '', unit = '' } = diskSizePattern.exec(value)?.groups ?? {};

  if (amount === '') {
    fail(`SANDBOX_DISK in .env must be a size such as 5g or 500m, not ${value}.`);
  }

  return Number(amount) * 1024 ** (unit.toLowerCase() === 'g' ? 3 : 2);
}

function hasDisk(id: string): boolean {
  return existsSync(path.join(disksFolder, `${id}.img`));
}

// A one-off root job on the host for each person's disk, in the disks service (compose.yaml): Docker's own volume driver
// cannot mount a disk image, and the provisioner has no other way onto the host.
async function disksJob(script: string, args: string[]): Promise<string> {
  return docker(['compose', 'run', '--rm', '--no-TTY', '--quiet-pull', 'disks', script, 'disks', ...args], { env: { COMPOSE_IGNORE_ORPHANS: 'true' } });
}

// Creates, mounts and grows the disks of these people, then moves the bot folders of anyone whose disk is new out of
// their volume (stopping them first: the daemon and the sandbox must not write meanwhile). `up` then starts them on it.
async function disks(ids: string[]) {
  const reported = (await disksJob(disksScript, [path.resolve(disksFolder), String(diskBytes()), ...ids])).split('\n');
  const fresh = reported.filter((line) => line.startsWith('new ')).map((line) => line.slice(4));

  for (const id of reported.filter((line) => line.startsWith('larger ')).map((line) => line.slice(7))) {
    console.log(`The sandbox disk of ${id} stays larger than SANDBOX_DISK: shrinking needs it offline (admin.md, Disk limits).`);
  }

  if (fresh.length === 0) {
    return;
  }

  const prefix = `${await project()}_data-`;
  const volumes = new Set((await docker(['volume', 'ls', '--quiet'])).split('\n'));

  await docker(['compose', 'stop', ...fresh.flatMap((id) => [`daemon-${id}`, `sandbox-${id}`])]);

  await fresh.reduce(async (previous, id) => {
    await previous;

    const data = volumes.has(`${prefix}${id}`) ? [`${prefix}${id}:/data`] : [];

    await tools(disksMoveScript, [], { volumes: [...data, `${path.resolve(disksFolder, id)}:/disk`] }).catch((error: unknown) => {
      fail(`Could not move the bot folders of ${id} onto their sandbox disk (${diskBytes() / 1024 ** 2} MiB): ${errorMessage(error)} Raise SANDBOX_DISK in .env and apply again; nothing was lost.`);
    });

    console.log(`Gave ${id} a sandbox disk of ${diskBytes() / 1024 ** 2} MiB${data.length > 0 ? ' and moved their bot folders onto it' : ''}.`);
  }, Promise.resolve());
}

// Bytes the disks may still take from the server: what they may grow to, less what they already hold.
function disksGrowth(ids: string[]): number {
  return ids.reduce((sum, id) => {
    const held = statSync(path.join(disksFolder, `${id}.img`), { throwIfNoEntry: false })?.blocks ?? 0;

    return sum + Math.max(0, diskBytes() - held * 512);
  }, 0);
}

// People's disks are sparse: together they may promise more than the server has. Warn, so the hub's audit trail and the
// backups never run out of room because people filled their disks.
function disksWarn(ids: string[]) {
  const { bavail, bsize } = statfsSync('.');
  const growth = disksGrowth(ids);

  if (growth > bavail * bsize) {
    console.log(`Warning: ${ids.length} sandbox disks of SANDBOX_DISK may still grow by ${(growth / 1024 ** 3).toFixed(1)} GiB, more than the ${(bavail * bsize / 1024 ** 3).toFixed(1)} GiB this server has free. Lower SANDBOX_DISK or add disk space (admin.md, Disk limits).`);
  }
}

// Each sandbox mounts home/.agents of its person's volume, and the daemon mounts their disk over agents/ (and an empty
// folder over bot-home); Docker refuses a missing subpath or mount point. A new volume gets them from the daemon image,
// which starts first; an older volume may lack them. Docker follows a link inside a subpath, so a link a bot planted
// there before the sandbox (its bash ran in the daemon then, with the whole volume) or that came back with a restore
// would give the sandbox what it points to, such as data/ with the credentials key: such a link is replaced by an empty
// folder, and prints `replaced`. A hard link from those folders to one of the daemon's own files (data/, pi/, the rest
// of home/) shares the file itself, so it is removed: a sandbox can no longer make one (it sees no daemon file), but one
// made before or restored with an old backup would stay readable and live. GNU find deletes by inode inside the bot
// folders, never following a link. This runs before apply and restore move agents/ and bot-home/ onto the person's
// disk, a separate file system no hard link can reach. Run in the volume's root.
const sandboxFoldersScript = [
  'for p in agents home home/.agents bot-home; do if [ -L "$p" ]; then echo "Replaced the link $p -> $(readlink "$p") with an empty folder: the sandbox would have mounted what it points to." >&2; echo replaced; rm "$p"; fi; done',
  'mkdir -p agents home/.agents bot-home',
  'for i in $(find . -xdev \\( -path ./agents -o -path ./home/.agents -o -path ./bot-home \\) -prune -o -type f -links +1 -printf "%i\\n" | sort -u); do find agents home/.agents bot-home -xdev -type f -inum "$i" -printf "Removed %p: a hard link to a daemon file outside the bot folders.\\n" -delete >&2; done',
  'chown 1000:1000 agents home home/.agents bot-home',
].join('; ');

// A running sandbox keeps the folders it mounted at its start, so one whose links were replaced is removed; the
// apply's `up` then starts it on the real folders.
async function sandboxFolders(ids: string[]) {
  const prefix = `${await project()}_data-`;
  const volumes = new Set((await docker(['volume', 'ls', '--quiet'])).split('\n'));
  const existing = ids.filter((id) => volumes.has(`${prefix}${id}`));

  if (existing.length > 0) {
    const replaced = await tools(`for id in "$@"; do cd "/people/$id" && r=$(${sandboxFoldersScript}) || exit 1; [ -z "$r" ] || echo "$id"; done`, existing, {
      volumes: existing.map((id) => `${prefix}${id}:/people/${id}`),
    });

    const sandboxes = replaced.split('\n').filter(Boolean).map((id) => `sandbox-${id}`);

    if (sandboxes.length > 0) {
      await docker(['compose', 'rm', '--stop', '--force', ...sandboxes]);
    }
  }
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

// A daemon network made before the firewall has Docker's own bridge name, and Docker renames a bridge only by
// recreating its network, once nothing is attached to it: with the hub still on it Compose stops every daemon and then
// fails, and with only the hub gone it reconnects the daemon without its alias and the hub answers 502 (gotcha 142).
// So a by-hand apply first removes the hub and those daemons, containers only (volumes and hub/ stay), and the rest of
// apply creates them again on the new networks. The provisioner refuses instead: it would remove the hub that waits
// for its answer. Either refuses, before anything stops, when another container is on such a network.
async function moveOldNetworks(ids: string[], byHand: boolean) {
  const name = await project();
  const prefix = `${name}_user-`;
  const existing = new Set((await docker(['network', 'ls', '--format', '{{.Name}}'])).split('\n'));
  const networks = ids.map((id) => `${prefix}${id}`).filter((network) => existing.has(network));

  if (networks.length === 0) {
    return;
  }

  const states = await docker(['network', 'inspect', '--format', '{{.Name}} {{index .Options "com.docker.network.bridge.name"}} {{range .Containers}}{{.Name}},{{end}}', ...networks]);
  const old = states.split('\n').map((line) => line.split(' ')).filter(([, bridge = '', attached = '']) => attached !== '' && !bridge.startsWith(daemonBridgePrefix));

  if (old.length === 0) {
    return;
  }

  const services = old.map(([network = '']) => `daemon-${network.slice(prefix.length)}`);
  const ours = new Set(['hub', ...services].map((service) => `${name}-${service}-1`));
  const strangers = old.flatMap(([, , attached = '']) => attached.split(',')).filter((container) => container !== '' && !ours.has(container));

  const list = old.map(([network]) => network).join(', ');

  if (strangers.length > 0) {
    fail(`${list} predate the firewall, and ${strangers.join(', ')} is attached to them: disconnect it, then apply again. Nothing was changed.`);
  }

  if (!byHand) {
    fail(`${list} predate the firewall: run bun deploy.ts apply on the server once (admin.md, Upgrades). Nothing was changed.`);
  }

  console.log(`Moving ${services.join(', ')} to the firewall's networks: removing their containers and the hub's, which start again below.`);
  await docker(['compose', 'rm', '--stop', '--force', 'hub', ...services]);
}

// The firewall first: daemons depend on it, and apply refuses to go on without it (legacy iptables, for one).
async function firewallUp() {
  try {
    await docker(['compose', 'up', '--detach', '--wait', '--wait-timeout', '60', 'firewall']);
  } catch {
    const logs = await docker(['compose', 'logs', '--no-log-prefix', '--tail', '1', 'firewall']).catch(() => '');

    fail(`The firewall did not start, so apply stopped before starting or changing anyone's Vinci.${logs.trim() === '' ? '' : ` It said: ${logs.trim()}`}`);
  }
}

// One change at a time between a by-hand apply and the provisioner, which share /opt/vinci. A lock older than ten
// minutes was left by a crash, so a long holder touches it now and then (the nightly backup, between people).
function takeLock(): boolean {
  const held = statSync(lockFile, { throwIfNoEntry: false });

  if (held && Date.now() - held.mtimeMs > lockStaleMs) {
    rmSync(lockFile, { force: true });
  }

  try {
    closeSync(openSync(lockFile, 'wx', 0o600));

    return true;
  } catch {
    return false;
  }
}

async function waitForLock(deadline: number) {
  if (takeLock()) {
    return;
  }

  if (Date.now() >= deadline) {
    fail(`Another apply or admin panel change is running (${lockFile}); try again in a minute.`);
  }

  await Bun.sleep(5000);
  await waitForLock(deadline);
}

async function locked<T>(work: () => Promise<T>, waitMs = 0): Promise<T> {
  await waitForLock(Date.now() + waitMs);

  try {
    return await work();
  } finally {
    rmSync(lockFile, { force: true });
  }
}

async function apply() {
  await locked(() => applyTeam());
}

function authMode(): keyof typeof authEdges {
  const mode = envValue('VINCI_AUTH') ?? 'access';

  if (mode !== 'access' && mode !== 'laravel') {
    fail(`VINCI_AUTH in .env must be access or laravel, not ${mode}.`);
  }

  return mode;
}

// The edge of the other mode would publish a second way in, and laravel mode cannot start without its secrets.
function authCheck() {
  const mode = authMode();
  const listed = new Set((process.env.COMPOSE_FILE ?? '').split(':').map((file) => path.basename(file)));
  const other = mode === 'access' ? authEdges.laravel : authEdges.access;

  if (listed.has(other) || (mode === 'laravel' && !listed.has(authEdges.laravel))) {
    fail(`With VINCI_AUTH=${mode}, COMPOSE_FILE in .env must load ${authEdges[mode]}, not ${other} (configuration.md).`);
  }

  if (mode === 'access') {
    return;
  }

  const missing = [
    ...((envValue('API_INTERNAL_TOKEN') ?? '').length < laravelSecretLength ? ['API_INTERNAL_TOKEN'] : []),
    ...((envValue('API_APP_KEY') ?? '').startsWith('base64:') ? [] : ['API_APP_KEY']),
  ];

  if (missing.length > 0) {
    fail(`With VINCI_AUTH=laravel, .env needs ${missing.join(', ')}: API_INTERNAL_TOKEN ${laravelSecretLength} or more random characters, API_APP_KEY a Laravel base64: key (install.md, Login with Vinci accounts).`);
  }
}

// Brings the stack in line with users.yaml: first start, add, disable or remove a person.
// users.json is written first, so a removed or disabled person loses access before their container stops.
// By hand it waits for every service to be healthy; the provisioner waits only for the person it changed, so another
// person's unhealthy daemon cannot fail a panel change.
async function applyTeam(waitFor?: string[]) {
  const current = team();
  const ids = enabledIds(current);
  const daemons = [templateId, ...ids];

  // A bad value would leave the firewall restarting while apply reports success. Bun reads it from /opt/vinci/.env.
  internalAllow();
  authCheck();
  writeFileSync('users.compose.yaml', renderCompose(daemons));
  await firewallUp();
  await moveOldNetworks(daemons, waitFor === undefined);
  hubFolder();
  writeAtomic(path.join(hubData, 'users.json'), renderUsers(current, ids), 0o644);
  await writeNew(ids);
  await tools('for id in "$@"; do mkdir -p "/ipc/$id" && chown 1000:1000 "/ipc/$id" && chmod 700 "/ipc/$id"; done', daemons);
  await sandboxFolders(daemons);
  await disks(daemons);
  disksWarn(daemons);

  if (waitFor === undefined) {
    await disksUnit();
  }

  const others = (await docker(['compose', 'config', '--services'])).split('\n').filter((service) => !singletons.includes(service));

  const waited = (waitFor ?? []).filter((id) => ids.includes(id)).flatMap((id) => [`daemon-${id}`, `sandbox-${id}`]);

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

function backupsRoot() {
  mkdirSync(backupsFolder, { recursive: true, mode: 0o700 });
}

// A person's containers: their daemon and, once an apply has rendered it, their sandbox, which mounts folders of the
// same volume (a restore replaces them). An upgrade's backup runs before the new apply.
async function personServices(id: string): Promise<string[]> {
  const services = (await docker(['compose', 'config', '--services'])).split('\n');

  return [`daemon-${id}`, `sandbox-${id}`].filter((service) => services.includes(service));
}

// Starts the same containers again: during an upgrade the new deployment files are in place before the new tag is set,
// and recreating here would run the old image under the new daemon.yaml.
async function startDaemon(id: string, person: Person) {
  if (person.enabled) {
    await docker(['compose', 'up', '--detach', '--wait', '--no-recreate', ...await personServices(id)]);
  }
}

// A disabled person has no container to stop.
async function stopDaemon(id: string, person: Person) {
  if (person.enabled) {
    await docker(['compose', 'stop', ...await personServices(id)]);
  }
}

// Copies one person's whole volume (database, credentials key, Pi settings, home) and what is on their disk (bot
// folders, the bots' home), in one archive laid out as the volume was before disks (agents/ and bot-home/ at the top),
// so any backup restores either way. The bots' download caches (bot-home/.cache) are left out: the tools fill them
// again. tar archives a bot's links, FIFOs and devices as entries without following or opening them. Sparse files
// stay sparse: a bot's 1 TB file of holes would otherwise be read whole and come back fully
// written. Their daemon must be stopped, so no SQLite file is copied mid-write. A disk that is not mounted fails the
// copy.
async function copyVolume(id: string, file: string) {
  const volumes = [`${await volumeName(id)}:/data:ro`];
  const volumeOnly = 'tar -C /data --sparse --anchored --exclude=./bot-home/.cache -czf - .';

  if (!hasDisk(id)) {
    await tools(volumeOnly, [], { volumes, output: file });
    return;
  }

  await tools(`[ -e /disk/${diskMarker} ] || { echo "The sandbox disk of ${id} is not mounted: run bun deploy.ts apply." >&2; exit 1; }; if [ -d /disk/agents ] && [ -d /disk/bot-home ]; then tar -C /data --sparse --anchored --exclude=./agents --exclude=./bot-home --exclude=bot-home/.cache -czf - . -C /disk agents bot-home; else ${volumeOnly}; fi`, [], {
    volumes: [...volumes, `${path.resolve(disksFolder, id)}:/disk:ro`],
    output: file,
  });
}

// Stops the daemon for the copy and starts it again even when the stop or the copy failed (a `compose stop` killed
// midway still stops the container). A failed copy fails. A good copy whose person then does not come back healthy (a
// daemon that cannot start, for example) returns the start's error instead, so the nightly still backs up everyone
// after them. Returns how long they were down.
async function backupVolume(id: string, person: Person, file: string): Promise<{ downtimeMs: number; startError: Error | null }> {
  const stopped = Date.now();

  try {
    await stopDaemon(id, person);
    await copyVolume(id, file);
  } catch (error) {
    await startDaemon(id, person).catch(() => undefined);
    throw error;
  }

  const startError = await startDaemon(id, person).then(() => null, (error: unknown) => (error instanceof Error ? error : new Error(String(error))));

  return { downtimeMs: Date.now() - stopped, startError };
}

function backupNotBack(id: string, error: Error) {
  return `The Vinci of ${id} did not come back healthy after its copy (${error.message}). Its backup is complete; bun deploy.ts status and docker compose logs daemon-${id} show why.`;
}

function backupStamp(): string {
  return new Date().toISOString().replaceAll(/[:.]/gu, '-');
}

async function backup() {
  const [id, person] = known(process.argv[3]);
  const file = path.join(backupsFolder, `${id}-${backupStamp()}.tar.gz`);

  backupsRoot();
  const { startError } = await locked(() => backupVolume(id, person, file));
  console.log(`Backed up ${id} to ${file}. It contains their keys: keep it secret.`);

  if (startError) {
    fail(backupNotBack(id, startError));
  }
}

// Unpacks a backup into the person's volume and, when they have a disk, moves its bot folders and bots' home onto the
// disk in place of the ones there. Links at agents, home, home/.agents and bot-home are replaced first, so the move never
// follows one.
async function fillVolume(id: string, file: string) {
  const fill = `find /data -mindepth 1 -delete && tar -C /data -xzpf - && cd /data && { ${sandboxFoldersScript}; } > /dev/null`;

  if (!hasDisk(id)) {
    await tools(fill, [], { volumes: [`${await volumeName(id)}:/data`], input: file });
    return;
  }

  await tools(`[ -e /disk/${diskMarker} ] || exit 1; ${fill} && rm -rf /disk/agents /disk/agents.new /disk/bot-home /disk/bot-home.new && { ${disksMoveScript}\n}`, [], {
    volumes: [`${await volumeName(id)}:/data`, `${path.resolve(disksFolder, id)}:/disk`],
    input: file,
  });
}

// `restore <id> <file or nightly folder>` replaces one person's volume; `restore <nightly folder>` rebuilds a whole
// install on a fresh server.
async function restore() {
  const [first, second] = process.argv.slice(3);

  if (process.argv.length === 4 && statSync(first, { throwIfNoEntry: false })?.isDirectory()) {
    await locked(() => restoreInstall(first));
    return;
  }

  const [id, person] = known(first);

  if (!second || !existsSync(second)) {
    fail('Usage: bun deploy.ts restore <id> <backup file or nightly folder>, or restore <nightly folder> on a fresh server');
  }

  const file = statSync(second).isDirectory() ? await nightlyVerified(second, `${id}.tar.gz`) : second;
  const safety = path.join(backupsFolder, `${id}-${backupStamp()}.tar.gz`);

  // A file must be named for this person (backup's <id>-<time>.tar.gz or a run's <id>.tar.gz), so a mistyped id or
  // path cannot put someone else's data in this volume.
  if (!new RegExp(`^${id}(?:-\\d{4}-\\d{2}-\\d{2}T[\\d-]+Z)?\\.tar\\.gz$`, 'u').test(path.basename(file))) {
    fail(`${file} is not a backup of ${id}: its name must be ${id}.tar.gz or ${id}-<time>.tar.gz.`);
  }

  // The volume is emptied before the unpack: refuse a file that does not unpack while the person is still running.
  await tools('tar -tzf - > /dev/null', [], { input: file }).catch(() => fail(`${file} does not unpack: it is damaged. Use another backup.`));
  backupsRoot();
  // Locked like the nightly run, which would otherwise stop and start the same daemon in between.
  await locked(async () => {
    await stopDaemon(id, person);
    await copyVolume(id, safety);
    console.log(`Saved the current data of ${id} to ${safety}.`);
    await fillVolume(id, file);
    await startDaemon(id, person);
  });
  console.log(`Restored ${id} from ${file}.`);
}

interface NightlyFile {
  bytes: number;
  sha256: string;
}

interface NightlyManifest {
  tag: string;
  project: string;
  startedAt: string;
  finishedAt: string;
  // `back` is false for someone who did not come back healthy after their (complete) copy.
  people: { id: string; enabled: boolean; advanced: boolean; downtimeMs: number; back: boolean }[];
  hubDowntimeMs: number;
  files: Record<string, NightlyFile>;
}

interface NightlyStatus {
  folder: string;
  startedAt: string;
  finishedAt?: string;
  result: 'running' | 'ok' | 'failed';
  error?: string;
  // People of an `ok` run who did not come back healthy after their copy: the run fails and `nightly status` too.
  notBack?: string[];
}

// The last upload to the bucket and the last failure, kept across runs for `nightly status`, with the bucket and
// prefix they were for.
interface OffsiteStatus {
  where?: string;
  uploaded?: { run: string; at: string };
  failed?: { at: string; error: string };
}

interface OffsiteBucket {
  client: Bun.S3Client;
  prefix: string;
  where: string;
}

async function fileDigest(file: string): Promise<NightlyFile> {
  const hash = new Bun.CryptoHasher('sha256');
  let bytes = 0;

  for await (const chunk of Bun.file(file).stream()) {
    hash.update(chunk);
    bytes += chunk.byteLength;
  }

  return { bytes, sha256: hash.digest('hex') };
}

function nightlyManifestRead(folder: string): NightlyManifest {
  const file = path.join(folder, nightlyManifest);

  if (!existsSync(file)) {
    fail(`${folder} has no ${nightlyManifest}: that run did not finish. Use an earlier backup.`);
  }

  return JSON.parse(readFileSync(file, 'utf8'));
}

// The file's path once its size and checksum match the manifest.
async function nightlyVerified(folder: string, name: string): Promise<string> {
  const expected = nightlyManifestRead(folder).files[name] ?? fail(`${folder} has no ${name}.`);
  const file = path.join(folder, name);
  const actual = await fileDigest(file);

  if (actual.sha256 !== expected.sha256 || actual.bytes !== expected.bytes) {
    fail(`${file} does not match its checksum in ${nightlyManifest}: it is damaged. Use another backup.`);
  }

  return file;
}

function nightlyStatusWrite(status: NightlyStatus) {
  writeAtomic(nightlyStatusFile, `${JSON.stringify(status, null, 2)}\n`, 0o600);
}

// A setting from .env; an empty value counts as unset.
function envValue(name: string): string | undefined {
  return process.env[name] === '' ? undefined : process.env[name];
}

function envCount(name: string, fallback: number): number {
  const value = Number(envValue(name) ?? fallback);

  if (!Number.isInteger(value) || value < 1) {
    fail(`${name} in .env must be a whole number of at least 1.`);
  }

  return value;
}

// The deployment files to keep: the usual ones and whatever COMPOSE_FILE in .env loads, as far as they exist.
function nightlyDeploymentFiles(): string[] {
  const listed = (process.env.COMPOSE_FILE ?? '').split(':').filter(Boolean);
  const files = [...deploymentFiles, authEdges[authMode()], ...listed].map((file) => path.relative(process.cwd(), path.resolve(file)));

  return [...new Set(files)].filter((file) => !file.startsWith('..') && existsSync(file));
}

// The API's PostgreSQL database: login accounts and the key that signs logins (encrypted with API_APP_KEY in .env).
// pg_dump reads one consistent snapshot while it runs, so nobody is stopped. Without owners or grants: the restore runs
// as the database's owner, vinci.
async function dumpDatabase(file: string) {
  await docker(['compose', 'exec', '-T', 'postgres', 'sh', '-c', 'set -o pipefail; pg_dump -U postgres -d vinci --no-owner --no-privileges | gzip'], { output: file });
}

// Replaces the database before the API's first start migrates it, in one transaction: a server's PostgreSQL volume may
// outlive /opt/vinci (a cloud-init server emptied for the restore), and its tables would clash with the dump's.
async function restoreDatabase(file: string) {
  await docker(['compose', 'up', '--detach', '--wait', 'postgres']);
  await docker(['compose', 'exec', '-T', 'postgres', 'sh', '-c', 'set -o pipefail; { echo "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"; gunzip; } | PGOPTIONS="-c client_min_messages=warning" psql -U vinci -d vinci -v ON_ERROR_STOP=1 --single-transaction --quiet'], { input: file });
}

// A run that fails takes its folder with it: an unfinished folder is no backup, and a full disk gets its space back.
async function nightlyBackup(folder: string, startedAt: Date, signal: AbortSignal): Promise<NightlyManifest> {
  mkdirSync(folder, { mode: 0o700 });

  try {
    return await nightlyCopy(folder, startedAt, signal);
  } catch (error) {
    rmSync(folder, { recursive: true, force: true });
    throw error;
  }
}

// Everyone one at a time (each person's daemon is down only for their own copy), then the API's database, then the hub
// folder with the hub stopped so audit.sqlite is not torn, then the deployment files. manifest.json is written last and
// whole: a folder without it is an unfinished run. A signal stops the run before the next stop.
async function nightlyCopy(folder: string, startedAt: Date, signal: AbortSignal): Promise<NightlyManifest> {
  const current = team();
  const people: [string, Person][] = [known(templateId), ...current.users];

  const volumes = await people.reduce<Promise<NightlyManifest['people']>>(async (previous, [id, person]) => {
    const done = await previous;

    signal.throwIfAborted();

    const { downtimeMs, startError } = await backupVolume(id, person, path.join(folder, `${id}.tar.gz`));

    console.log(`Backed up ${id}${person.enabled ? `; their Vinci was stopped for ${(downtimeMs / 1000).toFixed(1)} s` : ' (disabled)'}`);

    if (startError) {
      console.error(backupNotBack(id, startError));
    }
    utimesSync(lockFile, new Date(), new Date());

    return [...done, { id, enabled: person.enabled, advanced: person.advanced, downtimeMs, back: startError === null }];
  }, Promise.resolve([]));

  signal.throwIfAborted();
  await dumpDatabase(path.join(folder, nightlyDatabaseFile));
  console.log('Backed up the API database');

  const hubStopped = Date.now();

  try {
    await docker(['compose', 'stop', 'hub']);
    await tools('tar -C /hub -czf - .', [], { volumes: [`${path.resolve(hubData)}:/hub:ro`], output: path.join(folder, nightlyHubFile) });
  } finally {
    await docker(['compose', 'up', '--detach', '--wait', '--no-recreate', 'hub']);
  }

  const hubDowntimeMs = Date.now() - hubStopped;

  console.log(`Backed up the hub folder; the hub was stopped for ${(hubDowntimeMs / 1000).toFixed(1)} s`);
  await tools('tar -C /vinci -czf - "$@"', nightlyDeploymentFiles(), { volumes: [`${process.cwd()}:/vinci:ro`], output: path.join(folder, nightlyDeploymentFile) });

  const names = readdirSync(folder).sort();
  const files = Object.fromEntries(await Promise.all(names.map(async (name) => [name, await fileDigest(path.join(folder, name))] as const)));

  const manifest = {
    tag: process.env.VINCI_TAG ?? '',
    project: await project(),
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    people: volumes,
    hubDowntimeMs,
    files,
  };

  writeAtomic(path.join(folder, nightlyManifest), `${JSON.stringify(manifest, null, 2)}\n`, 0o600);

  return manifest;
}

// Run folders, oldest first.
function nightlyRuns(): string[] {
  return readdirSync(backupsFolder).filter((name) => nightlyFolder.test(name)).sort();
}

function nightlyFinished(name: string): boolean {
  return existsSync(path.join(backupsFolder, name, nightlyManifest));
}

// The runs retention keeps, of `finished` runs (on this server or in the bucket): every run of the newest
// BACKUP_KEEP_DAILY days that have one, so a run made by hand before an upgrade survives a later run on the same day,
// and the newest run of each of the newest BACKUP_KEEP_WEEKLY weeks (weeks start on Monday, UTC).
function nightlyKept(finished: string[]): Set<string> {
  const daily = envCount('BACKUP_KEEP_DAILY', 7);
  const weekly = envCount('BACKUP_KEEP_WEEKLY', 4);
  const newest = finished.toSorted().reverse();
  const days = new Set([...new Set(newest.map((name) => name.slice(0, 10)))].slice(0, daily));
  const weeks = new Map<string, string>();

  for (const name of newest) {
    const day = new Date(`${name.slice(0, 10)}T00:00:00Z`);

    day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));

    // Newest first, so the first run seen for a week is its newest.
    if (!weeks.has(day.toISOString())) {
      weeks.set(day.toISOString(), name);
    }
  }

  return new Set([...newest.filter((name) => days.has(name.slice(0, 10))), ...[...weeks.values()].slice(0, weekly)]);
}

// Deletes every run folder retention does not keep, unfinished ones included. Only called after a run succeeded, so a
// failing backup never deletes one that works.
function nightlyPrune(current: string) {
  const keep = nightlyKept(nightlyRuns().filter(nightlyFinished)).add(current);

  for (const name of nightlyRuns().filter((run) => !keep.has(run))) {
    rmSync(path.join(backupsFolder, name), { recursive: true, force: true });
    console.log(`Deleted ${backupsFolder}/${name} (retention)`);
  }
}

// The bucket from .env, or undefined when no off-site copy is set up. Bun's own S3 client, for any S3-compatible
// storage (Amazon S3, Cloudflare R2, Backblaze B2, MinIO).
function offsiteBucket(): OffsiteBucket | undefined {
  const bucket = envValue('BACKUP_S3_BUCKET');

  if (bucket === undefined) {
    return undefined;
  }

  const prefix = (envValue('BACKUP_S3_PREFIX') ?? '').replace(/(?<=[^/])$/u, '/');

  if (!offsitePrefix.test(prefix)) {
    fail('BACKUP_S3_PREFIX in .env may hold only letters, digits, dots, dashes, underscores and slashes, and not start with a slash.');
  }

  const client = new Bun.S3Client({
    bucket,
    endpoint: envValue('BACKUP_S3_ENDPOINT'),
    region: envValue('BACKUP_S3_REGION'),
    accessKeyId: envValue('BACKUP_S3_ACCESS_KEY_ID'),
    secretAccessKey: envValue('BACKUP_S3_SECRET_ACCESS_KEY'),
  });

  return { client, prefix, where: `${bucket}/${prefix}` };
}

// Never upload in the clear: the copy holds every person's secrets and keys.
function offsitePassphrase() {
  if ((envValue('BACKUP_PASSPHRASE') ?? '').length < offsitePassphraseLength) {
    fail(`BACKUP_PASSPHRASE in .env must be at least ${offsitePassphraseLength} characters: nothing is uploaded unencrypted.`);
  }
}

// The names under the prefix that are ours (<run>.tar.gpg, <run>.sha256); anything else there is never touched.
async function offsiteNames(bucket: OffsiteBucket, after?: string): Promise<string[]> {
  const page = await bucket.client.list({ prefix: bucket.prefix, startAfter: after });
  const keys = (page.contents ?? []).map(({ key }) => key);
  const rest = page.isTruncated && keys.length > 0 ? await offsiteNames(bucket, keys.at(-1)) : [];

  return [...keys.map((key) => key.slice(bucket.prefix.length)).filter((name) => offsiteObject.test(name)), ...rest];
}

function offsiteRun(name: string): string {
  return offsiteObject.exec(name)?.groups?.run ?? fail(`${name} is not an off-site backup.`);
}

// GnuPG in the daemon image, by plain `docker run` rather than the tools service: on a fresh server it decrypts before
// the deployment files are back, with only VINCI_TAG, VINCI_REGISTRY, the bucket and the passphrase in .env.
async function gpg(script: string, volume: string, options: DockerOptions): Promise<string> {
  const tag = envValue('VINCI_TAG') ?? fail('Set VINCI_TAG in .env: the off-site copy is encrypted by GnuPG in the vinci-daemon image of that tag.');

  return docker([
    'run', '--rm', ...(options.input ? ['--interactive'] : []), '--network', 'none', '--read-only', '--tmpfs', '/tmp', '--user', '0:0',
    '--cap-drop', 'ALL', '--cap-add', 'CHOWN', '--cap-add', 'DAC_OVERRIDE', '--cap-add', 'FOWNER', '--security-opt', 'no-new-privileges:true',
    '--env', 'BACKUP_PASSPHRASE', '--volume', volume, '--entrypoint', 'bash', `${envValue('VINCI_REGISTRY') ?? ''}vinci-daemon:${tag}`,
    '-o', 'pipefail', '-c', `mkdir -m 700 /tmp/gnupg && ${script}`,
  ], options);
}

// Checks a finished run against its manifest, encrypts it to backups/<run>.tar.gpg and uploads that, then its checksum.
async function offsitePut(bucket: OffsiteBucket, run: string) {
  const folder = path.join(backupsFolder, run);
  const encrypted = `${folder}.tar.gpg`;

  await Promise.all(Object.keys(nightlyManifestRead(folder).files).map((name) => nightlyVerified(folder, name)));
  rmSync(encrypted, { force: true });

  try {
    await gpg(
      // The run's folder by name, not `.`: unpacking `.` would give backups/ the mount point's mode.
      `tar -C /backup -cf - ${run} | gpg ${gpgOptions} --symmetric --cipher-algo AES256 --s2k-digest-algo SHA512 --s2k-count 65011712 --compress-algo none --output - 3<<<"$BACKUP_PASSPHRASE"`,
      `${path.resolve(folder)}:/backup/${run}:ro`,
      { output: encrypted },
    );

    const { sha256, bytes } = await fileDigest(encrypted);

    await bucket.client.write(`${bucket.prefix}${run}.tar.gpg`, Bun.file(encrypted), { type: 'application/octet-stream' });
    await bucket.client.write(`${bucket.prefix}${run}.sha256`, `${sha256}  ${run}.tar.gpg\n`, { type: 'text/plain' });
    console.log(`Uploaded ${run} to ${bucket.where}, encrypted (${(bytes / 1024 / 1024).toFixed(1)} MiB).`);
  } finally {
    rmSync(encrypted, { force: true });
  }
}

// Uploads every finished run on this server that the bucket lacks, newest first, so a failed upload is retried by the
// next run. Then, only when all of them went up, deletes the bucket's runs that retention no longer keeps.
async function offsiteSync(): Promise<string> {
  const bucket = offsiteBucket() ?? fail('BACKUP_S3_BUCKET is not set in .env.');

  offsitePassphrase();

  const names = await offsiteNames(bucket);
  const uploaded = new Set(names.filter((name) => name.endsWith('.sha256')).map(offsiteRun));
  const missing = nightlyRuns().filter(nightlyFinished).filter((run) => !uploaded.has(run)).reverse();

  // One upload of a large backup on a slow line can outlast lockStaleMs: touch the lock while it runs, or a panel change
  // would take it as left by a crash and run alongside.
  const heartbeat = setInterval(() => {
    if (existsSync(lockFile)) {
      utimesSync(lockFile, new Date(), new Date());
    }
  }, 60_000);

  try {
    await missing.reduce(async (previous, run) => {
      await previous;
      await offsitePut(bucket, run);
    }, Promise.resolve());
  } finally {
    clearInterval(heartbeat);
  }

  const keep = nightlyKept([...uploaded, ...missing]);
  const stale = names.filter((name) => !keep.has(offsiteRun(name)));

  await Promise.all(stale.map((name) => bucket.client.delete(`${bucket.prefix}${name}`)));
  stale.forEach((name) => console.log(`Deleted ${bucket.where}${name} (retention)`));

  return [...uploaded, ...missing].toSorted().at(-1) ?? fail('Nothing to upload.');
}

// Bun's S3 client says only "an unexpected error has occurred" when it cannot connect; its code says why
// (ConnectionRefused, DNSResolveFailed, SignatureDoesNotMatch, …).
function offsiteReason(error: unknown): string {
  const message = errorMessage(error).replace(/\.+$/u, '');
  const { code } = error as { code?: unknown };

  return error instanceof Error && error.name === 'S3Error' && typeof code === 'string' ? `${message} (${code})` : message;
}

// A record made for another bucket or prefix says nothing about this one. A record without `where` predates it and is
// taken as this bucket's until the next run writes one.
function offsiteStatusRead(bucket: OffsiteBucket | undefined): OffsiteStatus {
  if (bucket === undefined || !existsSync(offsiteStatusFile)) {
    return {};
  }

  const status: OffsiteStatus = JSON.parse(readFileSync(offsiteStatusFile, 'utf8'));

  return (status.where ?? bucket.where) === bucket.where ? status : {};
}

// The off-site part of a nightly run: its error, recorded for `nightly status`, or undefined. It never fails the
// run's backup on this server, which is already finished and kept.
async function nightlyOffsite(): Promise<string | undefined> {
  if (envValue('BACKUP_S3_BUCKET') === undefined) {
    return undefined;
  }

  let status: OffsiteStatus = {};

  try {
    const bucket = offsiteBucket() ?? fail('BACKUP_S3_BUCKET is not set in .env.');

    status = { ...offsiteStatusRead(bucket), where: bucket.where };
    status.uploaded = { run: await offsiteSync(), at: new Date().toISOString() };

    return undefined;
  } catch (error) {
    status.failed = { at: new Date().toISOString(), error: offsiteReason(error) };

    return status.failed.error;
  } finally {
    writeAtomic(offsiteStatusFile, `${JSON.stringify(status, null, 2)}\n`, 0o600);
  }
}

// What the systemd timer runs. Fails with a non-zero exit and one `Nightly backup failed:` line, which the journal keeps.
// systemd ends a run that takes too long, or one the server's shutdown catches, with SIGTERM to every process of the
// unit: the docker call in progress fails, whoever it stopped is started again, and the lock and status are written.
// The upload runs under the same lock, so two runs never upload or delete in the bucket at once.
async function nightlyRun() {
  const startedAt = new Date();
  const folder = path.join(backupsFolder, `${startedAt.toISOString().slice(0, 19).replaceAll(':', '')}Z`);
  const status: NightlyStatus = { folder, startedAt: startedAt.toISOString(), result: 'running' };
  const stop = new AbortController();
  const stopped = () => stop.abort(new Error('stopped by a signal (timeout, shutdown or Ctrl-C)'));

  process.once('SIGTERM', stopped);
  process.once('SIGINT', stopped);
  backupsRoot();
  nightlyStatusWrite(status);

  const offsiteError = await locked(async () => {
    const manifest = await nightlyBackup(folder, startedAt, stop.signal);
    const bytes = Object.values(manifest.files).reduce((sum, file) => sum + file.bytes, 0);

    console.log(`Nightly backup ${folder}: ${manifest.people.length} workspaces, ${(bytes / 1024 / 1024).toFixed(1)} MiB. It holds every key: keep it secret.`);
    nightlyPrune(path.basename(folder));
    status.result = 'ok';
    status.notBack = manifest.people.filter(({ back }) => !back).map(({ id }) => id);

    return nightlyOffsite();
  }, nightlyLockWaitMs).catch((error: unknown) => {
    status.result = 'failed';
    status.error = errorMessage(error);

    return fail(`Nightly backup failed: ${status.error}`);
  }).finally(() => {
    status.finishedAt = new Date().toISOString();
    nightlyStatusWrite(status);
  });

  if (offsiteError !== undefined) {
    fail(`Off-site upload failed: ${offsiteError}. The backup on this server is kept; the next run tries again`);
  }

  if (status.notBack?.length) {
    fail(nightlyNotBack(status.notBack));
  }
}

function nightlyNotBack(ids: string[]): string {
  return `The backup is complete and kept, but the Vinci of ${ids.join(', ')} did not come back healthy after the copy: bun deploy.ts status and docker compose logs daemon-<id> show why`;
}

function ago(ms: number): string {
  const minutes = Math.round(ms / 60_000);

  return minutes < 120 ? `${minutes} min ago` : `${(minutes / 60).toFixed(1)} h ago`;
}

// The last run, its age and result; exits non-zero when it failed, never ran or is older than a day and a half.
async function nightlyStatus() {
  if (!existsSync(nightlyStatusFile)) {
    fail('No nightly backup has run yet. Install the timer with `bun deploy.ts nightly install`, or run `bun deploy.ts nightly`.');
  }

  const status: NightlyStatus = JSON.parse(readFileSync(nightlyStatusFile, 'utf8'));
  const age = Date.now() - Date.parse(status.startedAt);
  const kept = nightlyRuns().filter(nightlyFinished);

  console.log(`Last run: ${status.folder}, started ${ago(age)}: ${status.result}${status.error ? ` (${status.error})` : ''}`);

  if (status.result === 'ok') {
    const manifest = nightlyManifestRead(status.folder);
    const bytes = Object.values(manifest.files).reduce((sum, file) => sum + file.bytes, 0);
    const longest = manifest.people.toSorted((a, b) => b.downtimeMs - a.downtimeMs)[0];

    console.log(`Tag ${manifest.tag}, ${manifest.people.length} workspaces, ${(bytes / 1024 / 1024).toFixed(1)} MiB, took ${Math.round((Date.parse(manifest.finishedAt) - Date.parse(manifest.startedAt)) / 1000)} s; longest stop ${longest.id} ${(longest.downtimeMs / 1000).toFixed(1)} s, hub ${(manifest.hubDowntimeMs / 1000).toFixed(1)} s`);
  }

  console.log(`Finished backups on this server: ${kept.length}${kept.length > 0 ? ` (${kept[0]} to ${kept.at(-1)})` : ''}`);

  const bucket = offsiteBucket();
  const { uploaded, failed } = offsiteStatusRead(bucket);
  // Off-site is failing until an upload newer than the last failure went through.
  const offsiteFailing = bucket !== undefined && (uploaded === undefined || Date.parse(failed?.at ?? '') > Date.parse(uploaded.at));

  if (bucket === undefined) {
    console.log('Off-site copy: off (no BACKUP_S3_BUCKET in .env)');
  } else {
    console.log(`Off-site copy to ${bucket.where}: last upload ${uploaded ? `${uploaded.run}, ${ago(Date.now() - Date.parse(uploaded.at))}` : 'none yet'}`);
  }

  if (failed) {
    console.log(`Last off-site failure ${ago(Date.now() - Date.parse(failed.at))}: ${failed.error}`);
  }

  const unit = await nightlyUnit();

  if (Bun.which('systemctl')) {
    Bun.spawnSync(['systemctl', 'list-timers', `${unit}.timer`, '--all', '--no-pager'], { stdout: 'inherit', stderr: 'inherit' });
  }

  // A run still `running` after the unit's timeout was killed (SIGKILL, power loss) before it could say so.
  if (status.result === 'running' && age < nightlyTimeoutMs) {
    return;
  }

  if (status.result !== 'ok' || age > nightlyStaleMs) {
    fail(status.result === 'ok' ? 'The last nightly backup is more than a day and a half old: check the timer.' : 'The last nightly backup did not succeed.');
  }

  if (status.notBack?.length) {
    fail(nightlyNotBack(status.notBack));
  }

  if (offsiteFailing) {
    fail('The off-site copy is not up to date: the last upload failed or none was made yet.');
  }
}

// `nightly fetch` lists the runs in the bucket; `nightly fetch <run>` downloads one, checks its checksum, decrypts it
// into backups/<run>/ and checks every file against its manifest, ready for `restore`. Needs only VINCI_TAG,
// VINCI_REGISTRY, the bucket and the passphrase in .env and the vinci-daemon image, so it works on a fresh server.
async function nightlyFetch() {
  const bucket = offsiteBucket() ?? fail('Set BACKUP_S3_BUCKET and the other BACKUP_S3_ settings in .env (admin.md, Off-site copy).');
  const [run] = process.argv.slice(4);
  const names = await offsiteNames(bucket).catch((error: unknown) => fail(`${bucket.where} cannot be listed: ${offsiteReason(error)}`));
  const runs = names.filter((name) => name.endsWith('.sha256')).map(offsiteRun).sort();

  if (!run) {
    console.log(runs.length > 0 ? `Backups in ${bucket.where}:\n${runs.join('\n')}` : `No finished backups in ${bucket.where}.`);
    return;
  }

  if (!runs.includes(run)) {
    fail(`${run} is not a finished backup in ${bucket.where}; \`bun deploy.ts nightly fetch\` lists them.`);
  }

  const folder = path.join(backupsFolder, run);
  const encrypted = `${folder}.tar.gpg`;
  // Unpacked and checked here first, then moved into place: a fetch cut off midway leaves no half run folder.
  const staging = `${folder}.fetch`;

  if (existsSync(folder)) {
    fail(`${folder} is already on this server: restore from it.`);
  }

  offsitePassphrase();
  backupsRoot();
  rmSync(encrypted, { force: true });
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { mode: 0o700 });

  try {
    await Bun.write(encrypted, bucket.client.file(`${bucket.prefix}${run}.tar.gpg`));

    const expected = (await bucket.client.file(`${bucket.prefix}${run}.sha256`).text()).split(' ')[0];

    if ((await fileDigest(encrypted)).sha256 !== expected) {
      fail(`${run}.tar.gpg does not match its checksum in ${run}.sha256: it is damaged. Fetch another backup.`);
    }

    // Only the run's own folder is unpacked: an archive cannot write elsewhere in backups/.
    await gpg(`gpg ${gpgOptions} --decrypt --output - 3<<<"$BACKUP_PASSPHRASE" | tar -C /out -xpf - ${run}`, `${path.resolve(staging)}:/out`, { input: encrypted })
      .catch(() => fail(`${run}.tar.gpg did not decrypt: BACKUP_PASSPHRASE is not the one it was made with, or the file is damaged.`));

    const unpacked = path.join(staging, run);

    await Promise.all(Object.keys(nightlyManifestRead(unpacked).files).map((name) => nightlyVerified(unpacked, name)));
    renameSync(unpacked, folder);
  } catch (error) {
    fail(offsiteReason(error));
  } finally {
    rmSync(encrypted, { force: true });
    rmSync(staging, { recursive: true, force: true });
  }

  console.log(`Fetched ${run} into ${folder}; every file matches its manifest (tag ${nightlyManifestRead(folder).tag}).`);
}

// vinci-backup for the default project: a second stack on the host (COMPOSE_PROJECT_NAME) gets its own timer.
async function nightlyUnit(): Promise<string> {
  return `${await project()}-backup`;
}

function nightlyUnits(unit: string, at: string): Record<string, string> {
  return {
    [`${unit}.service`]: [
      '# Written by `bun deploy.ts nightly install`. Remove with `bun deploy.ts nightly remove`.',
      '[Unit]',
      `Description=Vinci nightly backup of ${process.cwd()}`,
      'Wants=docker.service',
      'After=docker.service',
      '',
      '[Service]',
      'Type=oneshot',
      `WorkingDirectory=${process.cwd()}`,
      `ExecStart=${process.execPath} ${import.meta.path} nightly`,
      'UMask=0077',
      'Nice=10',
      `TimeoutStartSec=${nightlyTimeoutMs / 1000}`,
      '',
    ].join('\n'),
    [`${unit}.timer`]: [
      '# Written by `bun deploy.ts nightly install`. Remove with `bun deploy.ts nightly remove`.',
      '[Unit]',
      `Description=Vinci nightly backup of ${process.cwd()} at ${at}`,
      '',
      '[Timer]',
      `OnCalendar=*-*-* ${at}:00`,
      // A server that was off at that time backs up once when it starts.
      'Persistent=true',
      '',
      '[Install]',
      'WantedBy=timers.target',
      '',
    ].join('\n'),
  };
}

function systemdRequired() {
  if (!Bun.which('systemctl')) {
    fail('This server has no systemd: run `bun deploy.ts nightly` from its own scheduler instead.');
  }
}

function systemctl(args: string[]) {
  if (!Bun.spawnSync(['systemctl', ...args], { stdout: 'inherit', stderr: 'inherit' }).success) {
    fail(`systemctl ${args.join(' ')} failed.`);
  }
}

// A systemd timer on the host, at BACKUP_TIME (server time, default 03:00).
async function nightlyInstall() {
  const at = envValue('BACKUP_TIME') ?? '03:00';

  if (!timePattern.test(at)) {
    fail('BACKUP_TIME in .env must be a time such as 03:00.');
  }

  systemdRequired();

  // ExecStart and WorkingDirectory take these paths unquoted, where systemd reads spaces, `%` and `$` itself.
  if (![process.execPath, import.meta.path, process.cwd()].every((value) => /^[\w./-]+$/u.test(value))) {
    fail(`Bun (${process.execPath}) and ${import.meta.path} must be on paths of letters, digits, dots, dashes and slashes for the timer.`);
  }

  const unit = await nightlyUnit();

  for (const [name, content] of Object.entries(nightlyUnits(unit, at))) {
    writeFileSync(path.join(systemdFolder, name), content, { mode: 0o644 });
    console.log(`Wrote ${path.join(systemdFolder, name)}`);
  }

  systemctl(['daemon-reload']);
  systemctl(['enable', '--now', `${unit}.timer`]);
  console.log(`The nightly backup runs at ${at} server time into ${path.resolve(backupsFolder)}. Check it with \`bun deploy.ts nightly status\`.`);
}

// Removes the timer; the backups stay.
async function nightlyRemove() {
  systemdRequired();

  const unit = await nightlyUnit();

  Bun.spawnSync(['systemctl', 'disable', '--now', `${unit}.timer`], { stdout: 'inherit', stderr: 'inherit' });

  for (const name of Object.keys(nightlyUnits(unit, '03:00'))) {
    rmSync(path.join(systemdFolder, name), { force: true });
  }

  systemctl(['daemon-reload']);
  console.log(`Removed the ${unit} timer. The backups in ${path.resolve(backupsFolder)} stay.`);
}

// The boot unit for people's disks: it mounts them before Docker starts anyone, since Docker starts containers itself at
// boot and a container whose disk is not mounted cannot start (its subpath is missing). Written by a by-hand `apply`;
// the provisioner cannot reach systemd, and needs no new unit for a person it adds.
async function disksUnit() {
  if (process.getuid?.() !== 0 || !existsSync('/run/systemd/system') || !Bun.which('systemctl')) {
    console.log('This server has no systemd: after a reboot, run `bun deploy.ts disks mount` and then `docker compose up -d`, or people\'s Vinci stay stopped.');
    return;
  }

  if (![process.execPath, import.meta.path, process.cwd()].every((value) => /^[\w./-]+$/u.test(value))) {
    fail(`Bun (${process.execPath}) and ${import.meta.path} must be on paths of letters, digits, dots, dashes and slashes for the disks unit.`);
  }

  const file = path.join(systemdFolder, `${await project()}-disks.service`);

  const content = [
    '# Written by `bun deploy.ts apply`: mounts each person\'s sandbox disk before Docker starts their containers.',
    '[Unit]',
    `Description=Vinci sandbox disks of ${process.cwd()}`,
    'Before=docker.service',
    `RequiresMountsFor=${process.cwd()}`,
    '',
    '[Service]',
    'Type=oneshot',
    'RemainAfterExit=yes',
    `WorkingDirectory=${process.cwd()}`,
    `ExecStart=${process.execPath} ${import.meta.path} disks mount`,
    '',
    '[Install]',
    'WantedBy=docker.service',
    '',
  ].join('\n');

  if (existsSync(file) && readFileSync(file, 'utf8') === content) {
    return;
  }

  writeFileSync(file, content, { mode: 0o644 });
  systemctl(['daemon-reload']);
  systemctl(['enable', path.basename(file)]);
  console.log(`Wrote ${file}: people's sandbox disks are mounted at every boot.`);
}

// `disks mount`, on the host as root (the boot unit runs it): mounts every disk in disks/.
async function disksCommand() {
  if (process.argv[3] !== 'mount') {
    fail('Usage: bun deploy.ts disks mount');
  }

  if (existsSync(disksFolder) && !Bun.spawnSync(['sh', '-c', disksMountScript, 'disks', path.resolve(disksFolder)], { stdout: 'inherit', stderr: 'inherit' }).success) {
    fail('Mounting the sandbox disks failed.');
  }
}

async function nightly() {
  const actions = { run: nightlyRun, status: nightlyStatus, install: nightlyInstall, remove: nightlyRemove, fetch: nightlyFetch };
  const action = process.argv[3] ?? 'run';

  if (!(action in actions)) {
    fail('Usage: bun deploy.ts nightly [run|status|install|remove|fetch [<time>]]');
  }

  await actions[action as keyof typeof actions]();
}

// A whole install from one nightly folder, on a server whose /opt/vinci holds only that run's deployment files. The hub
// folder (admins, pins, global settings modes, audit trail) and every volume go back before anything starts, so the
// hub never meets a fresh daemon and every pinned server ID matches.
async function restoreInstall(folder: string) {
  const manifest = nightlyManifestRead(folder);

  if (existsSync(hubData) && readdirSync(hubData).length > 0) {
    fail(`${hubData}/ is not empty: a whole restore is only for a fresh server. To restore one person, run restore <id> ${folder}.`);
  }

  // The ids name volumes and files: only what users.yaml allows.
  if (!manifest.people.every(({ id }) => userId.test(id))) {
    fail(`${folder}/${nightlyManifest} lists an invalid id.`);
  }

  const files = await Promise.all([nightlyHubFile, ...manifest.people.map(({ id }) => `${id}.tar.gz`)].map((name) => nightlyVerified(folder, name)));

  mkdirSync(hubData, { recursive: true, mode: 0o770 });
  await tools('tar -C /hub -xzpf -', [], { volumes: [`${path.resolve(hubData)}:/hub`], input: files[0] });
  console.log(`Restored the hub folder from ${folder}.`);

  // Compose creates every volume with its own labels, disabled people's too (apply then removes their containers), so
  // enabling someone later does not meet a volume Compose did not create.
  const daemons = manifest.people.map(({ id }) => id);

  writeFileSync('users.compose.yaml', renderCompose(daemons));
  await disksJob(disksScript, [path.resolve(disksFolder), String(diskBytes()), ...daemons]);
  await docker(['compose', 'create', ...daemons.map((id) => `daemon-${id}`)]);

  await manifest.people.reduce(async (previous, { id }) => {
    await previous;
    await fillVolume(id, path.join(folder, `${id}.tar.gz`));
    console.log(`Restored ${id}.`);
  }, Promise.resolve());

  // Runs from before the database was backed up have none: their accounts are made again with vinci:user.
  if (nightlyDatabaseFile in manifest.files) {
    await restoreDatabase(await nightlyVerified(folder, nightlyDatabaseFile));
    console.log('Restored the API database.');
  }

  await applyTeam();
  console.log(`Restored the whole install from ${folder} (tag ${manifest.tag}).`);
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

  await docker(['volume', 'rm', '--force', await volumeName(id), `${await project()}_sandbox-${id}`, `${await project()}_disk-${id}`]);
  await docker(['network', 'rm', '--force', `${await project()}_sandbox-${id}`]);
  await disksJob('set -e; mnt="$1/$2"; if mountpoint -q "$mnt"; then umount "$mnt"; fi; rm -f "$mnt.img"; if [ -d "$mnt" ]; then rmdir "$mnt"; fi', [path.resolve(disksFolder), id]);
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
  console.log(`Purged ${id}: volume, sandbox disk, sandbox volume and network, owner-socket folder, hub pin and global settings modes deleted.`);
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
      'Usage: bun scripts/deploy.ts cloudflare apply|emails|destroy --zone <zone> --hostname <host> --name vinci-<team> [--users <users.yaml|->] [--domain <domain>...] [--session 24h] [--ssh-hostname <host> --ssh-email <email>...] [--env-out <file>] [--yes]',
    );
  }

  const zone = values.zone ?? fail('Pass --zone, the Cloudflare zone, such as example.com.');
  const name = values.name ?? fail('Pass --name, the exact name prefix of the objects, such as vinci-acme.');
  const hostname = values.hostname ?? fail('Pass --hostname, such as acme.example.com.');
  const sshHostname = values['ssh-hostname'];

  if (!cloudflareNamePattern.test(name)) {
    fail('--name must start with vinci- and use lowercase letters, digits and single dashes.');
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
      comment: `vinci deploy ${name}`,
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

// The allow policy's rules, read back. Rules Vinci never writes (groups, everyone, excludes) make it unreadable.
function accessRead(policy: CloudflarePolicy): AccessRule {
  const include = policy.include ?? [];
  const domains = accessRuleValues(policy, 'email_domain', 'domain');
  const emails = accessRuleValues(policy, 'email', 'email');

  if (domains.length + emails.length !== include.length || (policy.exclude?.length ?? 0) > 0 || (policy.require?.length ?? 0) > 0) {
    fail(`The Access policy ${policy.name} has rules Vinci does not manage; run cloudflare apply to reset it.`);
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
    VINCI_PUBLIC_HOST: hostname,
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

interface ComposeRow {
  Service: string;
  State: string;
  Health: string;
}

// Every service's container as `docker compose ps` sees it, one JSON object per line.
async function composeRows(): Promise<ComposeRow[]> {
  const output = await docker(['compose', 'ps', '--all', '--format', 'json']);

  return output.split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

// Each daemon service's state; a user with no container (disabled, or not applied yet) is stopped.
async function userStates(): Promise<Map<string, UserState>> {
  return new Map((await composeRows()).map((row) => [row.Service, containerState(row.State, row.Health)]));
}

function gib(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} GiB`;
}

// A person's sandbox disk as the host sees it: how full, or why it is not there.
function diskShown(id: string): [string, boolean] {
  const mount = path.join(disksFolder, id);

  if (!hasDisk(id)) {
    return ['disk missing', false];
  }

  if (statSync(mount).dev === statSync(disksFolder).dev) {
    return ['disk not mounted', false];
  }

  const { blocks, bavail, bsize, files, ffree } = statfsSync(mount);
  const used = (blocks - bavail) * bsize;
  const isFull = used >= blocks * bsize * diskFullShare || files - ffree >= files * diskFullShare;

  return [`disk ${isFull ? 'FULL ' : ''}${gib(used)} of ${gib(blocks * bsize)}, ${Math.round(((files - ffree) * 100) / files)}% of files`, !isFull];
}

// `status`, on the server: each person's daemon, sandbox and sandbox disk as Docker, their health checks and the host
// see them, and the server's own free space. A sandbox is healthy while it holds a connection to its daemon. Exits
// non-zero unless every one is running and healthy, no disk is full or missing, and the server has room.
async function stackStatus() {
  const rows = new Map((await composeRows()).map((row) => [row.Service, row]));
  const ids = [templateId, ...enabledIds(team())];
  const width = Math.max(...ids.map((id) => id.length));

  const shown = (service: string) => {
    const row = rows.get(service);

    return row === undefined ? 'missing' : `${row.State}${row.Health === '' ? '' : ` (${row.Health})`}`;
  };

  const lines = ids.map((id) => [id, shown(`daemon-${id}`), shown(`sandbox-${id}`), ...diskShown(id)] as const);

  for (const [id, daemon, sandbox, disk] of lines) {
    console.log(`${id.padEnd(width)}  daemon ${daemon.padEnd(19)}  sandbox ${sandbox.padEnd(19)}  ${disk}`);
  }

  const { blocks, bavail, bsize } = statfsSync('.');
  const isLow = bavail < blocks * serverLowShare;

  console.log(`Server disk: ${gib(bavail * bsize)} free of ${gib(blocks * bsize)}${isLow ? ', LOW' : ''}`);

  // In laravel mode nobody logs in without Caddy, the API and its database.
  const edge = authMode() === 'laravel' ? ['caddy', 'api', 'postgres'] : [];

  for (const service of edge) {
    console.log(`${service.padEnd(width)}  ${shown(service)}`);
  }

  const down = [
    ...lines.filter(([, daemon, sandbox]) => daemon !== 'running (healthy)' || sandbox !== 'running (healthy)').map(([id]) => id),
    ...edge.filter((service) => shown(service) !== 'running (healthy)'),
  ];

  const full = lines.filter(([, , , , isOk]) => !isOk).map(([id]) => id);

  if (down.length > 0) {
    fail(`Not healthy: ${down.join(', ')}. Without its sandbox a daemon refuses every bot tool call. docker compose logs daemon-<id> sandbox-<id> (or caddy, api, postgres) shows why; bun deploy.ts apply starts what is missing.`);
  }

  if (full.length > 0) {
    fail(`Sandbox disk full or not there: ${full.join(', ')}. Their bots get "No space left on device"; see admin.md, Disk limits.`);
  }

  if (isLow) {
    fail('The server\'s disk is almost full: the hub\'s audit trail and the backups need room. See troubleshooting.md, The disk fills up.');
  }
}

function checkSystem(id: string | undefined, version: string): 'ok' | 'warning' | 'failed' {
  if (id !== 'ubuntu' || Number.parseFloat(version) < Number.parseFloat(serverUbuntu)) {
    return 'failed';
  }

  return version === serverUbuntu ? 'ok' : 'warning';
}

function checkDisk(freeGb: number): 'ok' | 'warning' | 'failed' {
  if (freeGb < serverDiskGb.test) {
    return 'failed';
  }

  return freeGb >= serverDiskGb.production ? 'ok' : 'warning';
}

// What one response tells about the software behind it, as `name: value` lines; none when it tells nothing.
async function disclosures(response: Response): Promise<string[]> {
  const headers = [...response.headers].filter(([name, value]) => name !== 'set-cookie' && !(name === 'server' && value === 'cloudflare') && (disclosureHeaders.includes(name) || name.includes('version') || disclosureVersion.test(value)));
  const body = response.status >= 400 ? disclosureBody.exec(await response.text())?.[0] : undefined;

  return [...headers.map(([name, value]) => `${name}: ${value}`), ...(body === undefined ? [] : [`body: …${body}…`])];
}

// `check <https://address>`, from any computer: every edge path, without a login and, with VINCI_CHECK_COOKIE (a
// vinci_session value), as that person, so the hub, the web app and the daemon answer too; a method a route does not
// take; and plain HTTP. Fails when any response names its software or a version (install.md, step 8).
async function checkAddress(address: string) {
  const origin = new URL(address);

  if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search !== '') {
    fail(`Pass the public address alone, as https://<host>, not ${address}.`);
  }

  const cookie = process.env.VINCI_CHECK_COOKIE;

  const requests: [string, URL, RequestInit][] = [
    ...disclosurePaths.map((route): [string, URL, RequestInit] => ['GET', new URL(route, origin), {}]),
    ...(cookie ? disclosurePaths.map((route): [string, URL, RequestInit] => ['GET', new URL(route, origin), { headers: { cookie: `vinci_session=${cookie}` } }]) : []),
    ['DELETE', new URL('/cdn-cgi/access/login', origin), {}],
    ['GET', new URL(`http://${origin.host}/`), {}],
  ];

  const results = await Promise.all(requests.map(async ([method, url, init]) => {
    const label = `${method} ${url.href}${init.headers ? ' (logged in)' : ''}`;

    const response = await fetch(url, {
      ...init,
      method,
      redirect: 'manual',
      signal: AbortSignal.timeout(disclosureTimeoutMs),
    }).catch((error: unknown) => fail(`${label}: ${errorMessage(error)}`));

    return { label, status: response.status, found: await disclosures(response) };
  }));

  for (const { label, status, found } of results) {
    console.log(`${status} ${label}: ${found.length === 0 ? 'ok' : found.join('; ')}`);
  }

  if (results.some(({ found }) => found.length > 0)) {
    fail('A response names the software or the version behind the address (install.md, step 8).');
  }
}

// The server requirements of install.md, step 1. A production install needs every line ok. Ubuntu after 24.04 and
// 30 to 40 GB free are warnings, enough for a test server; anything less fails. With an address, its public responses
// instead (checkAddress).
async function check() {
  if (process.argv.length > 3) {
    await checkAddress(process.argv[3]);

    return;
  }

  const os: Partial<Record<string, string>> = Object.fromEntries(readFileSync('/etc/os-release', 'utf8').split('\n').map((line) => line.split('=', 2)).map(([key = '', value = '']) => [key, value.replaceAll('"', '')]));
  const memoryKib = Number(/^MemTotal:\s+(?<kib>\d+)/mu.exec(readFileSync('/proc/meminfo', 'utf8'))?.groups?.kib ?? 0);
  const { bavail, bsize } = statfsSync('/');
  const freeGb = (bavail * bsize) / 1e9;
  const arch = process.arch;
  const version = os.VERSION_ID ?? '';

  const results: [string, 'ok' | 'warning' | 'failed', string][] = [
    ['CPU', arch === 'x64' && !/\bavx2\b/u.test(readFileSync('/proc/cpuinfo', 'utf8')) ? 'failed' : 'ok', `${arch}${arch === 'x64' ? ', AVX2 needed' : ''}`],
    ['System', checkSystem(os.ID, version), `${os.PRETTY_NAME ?? 'unknown'}, ${serverUbuntu} expected`],
    ['Memory', memoryKib / 1024 ** 2 >= serverMemoryGib ? 'ok' : 'failed', `${(memoryKib / 1024 ** 2).toFixed(1)} GiB, at least ${serverMemoryGib} needed`],
    ['Disk', checkDisk(freeGb), `${freeGb.toFixed(0)} GB free on /, ${serverDiskGb.production} needed (${serverDiskGb.test} for a test server)`],
  ];

  for (const [name, result, detail] of results) {
    console.log(`${name.padEnd(7)} ${result.padEnd(8)} ${detail}`);
  }

  if (results.some(([, result]) => result === 'failed')) {
    fail('This server cannot run Vinci (install.md, Before you start).');
  }

  if (results.some(([, result]) => result === 'warning')) {
    console.log('Warnings: fine for a test server, not for a team\'s production install.');
  }
}

function provisionerConfig() {
  const token = process.env.PROVISIONER_TOKEN ?? '';
  const { CLOUDFLARE_API_TOKEN: cloudflareToken, CLOUDFLARE_ZONE: zone, CLOUDFLARE_NAME: name } = process.env;

  if (token.length < provisionerTokenLength) {
    fail(`PROVISIONER_TOKEN must be at least ${provisionerTokenLength} random characters.`);
  }

  if (cloudflareToken && (!zone || !name || !cloudflareNamePattern.test(name))) {
    fail('With CLOUDFLARE_API_TOKEN set, CLOUDFLARE_ZONE and CLOUDFLARE_NAME (vinci-<team>) must be set too.');
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

  // `manual`: the policy needs a change Vinci could not make (no token on the server, or Cloudflare refused); the admin
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
  // is unknown: no token, Cloudflare could not be read, or the policy has rules Vinci does not manage. The domains then
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

    // The first admin changed their own password: cloud-init's copy of the first one goes.
    if (pathname === '/admin-password' && request.method === 'DELETE') {
      const removed = existsSync(firstPasswordFile);

      rmSync(firstPasswordFile, { force: true });

      return reply(200, { removed });
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

function iptables(binary: string, args: string[], input?: string) {
  try {
    const result = Bun.spawnSync([binary, ...args], {
      stdin: input === undefined ? 'ignore' : Buffer.from(input),
      stdout: 'pipe',
      stderr: 'pipe',
    });

    return { ok: result.success, out: result.stdout.toString(), error: result.stderr.toString().trim() };
  } catch (error) {
    return { ok: false, out: '', error: errorMessage(error) };
  }
}

function iptablesOk(binary: string, args: string[], input?: string) {
  const { ok, error } = iptables(binary, args, input);

  if (!ok) {
    fail(`${binary} ${args.join(' ')} failed: ${error}`);
  }
}

// iptables-nft only: it changes rules in kernel transactions and needs no NET_RAW. iptables-legacy rewrites whole
// tables under a lock file this container does not share with the host, so it could undo a rule Docker writes at the
// same moment, at boot for one.
const iptablesNft = 'iptables-nft';

// Docker's own chains must be there, so the rules sit next to Docker's. A host whose Docker uses iptables-legacy has
// legacy tables, listed in /proc/net/ip_tables_names (the host's, on the host network) without touching them.
function iptablesBinary(): string {
  if (iptables(iptablesNft, ['-w', '-S', firewallParents.forward]).ok) {
    return iptablesNft;
  }

  const legacy = (() => {
    try {
      return readFileSync('/proc/net/ip_tables_names', 'utf8').split('\n').includes('filter');
    } catch {
      return false;
    }
  })();

  return fail(legacy
    ? 'This server\'s Docker uses iptables-legacy, so the firewall cannot keep bots off internal addresses. Vinci needs a host on iptables-nft (nf_tables), such as Ubuntu 22.04 or later with its default iptables (install.md, step 2).'
    : `No ${firewallParents.forward} chain in iptables-nft: Docker must manage iptables through iptables-nft (not iptables-legacy, not its nftables backend) before the firewall can start.`);
}

// VINCI_INTERNAL_ALLOW: comma-separated <IPv4>:<port> (TCP) that every daemon may still reach, such as a test model on
// the host. Empty by default.
function internalAllow(): [string, string][] {
  return (process.env.VINCI_INTERNAL_ALLOW ?? '').split(',').map((entry) => entry.trim()).filter(Boolean).map((entry) => {
    const groups = internalAllowPattern.exec(entry)?.groups;
    const port = Number(groups?.port);

    return groups?.address !== undefined && port >= 1 && port <= 65535 ? [groups.address, String(port)] : fail(`VINCI_INTERNAL_ALLOW: "${entry}" is not <IPv4 address>:<port>.`);
  });
}

// Matched only for packets that come in on a daemon bridge. Each rule carries a tag of the whole set, so a missing,
// changed or hand-edited rule shows as a mismatch and the chain is rewritten in one iptables-restore.
function firewallRules(allow: [string, string][]): Record<keyof typeof firewallChains, string[][]> {
  const allowed = allow.map(([address, port]) => ['-d', `${address}/32`, '-p', 'tcp', '-m', 'tcp', '--dport', port, '-j', 'RETURN']);
  const established = ['-m', 'conntrack', '--ctstate', 'RELATED,ESTABLISHED', '-j', 'RETURN'];
  const reject = ['-j', 'REJECT', '--reject-with', 'icmp-admin-prohibited'];

  return {
    forward: [
      // The hub opens the daemon's port on that person's own network; nothing else between containers there, so a
      // daemon cannot open a connection to the hub.
      ['-p', 'tcp', '-m', 'physdev', '--physdev-is-bridged', '-m', 'tcp', '--dport', String(daemonPort), '-m', 'conntrack', '--ctstate', 'NEW', '-j', 'ACCEPT'],
      ['-m', 'physdev', '--physdev-is-bridged', '-m', 'conntrack', '--ctstate', 'NEW', '-j', 'DROP'],
      // DNS needs no rule: Docker's resolver asks the host's resolvers from the host itself, not from the daemon bridge.
      established,
      ...allowed,
      ...internalRanges.map((range) => ['-d', range, ...reject]),
    ],
    // Nothing on the host itself: sshd, Docker's gateways, any other listener. The discard port gets a reject no other
    // firewall sends (ENOPROTOOPT), so a daemon's wait (firewall-wait.sh) cannot mistake a host firewall's for ours.
    host: [established, ...allowed, ['-p', 'tcp', '-m', 'tcp', '--dport', String(firewallWaitPort), '-j', 'REJECT', '--reject-with', 'icmp-proto-unreachable'], reject],
  };
}

type FirewallChain = keyof typeof firewallChains;

// Brings the chains (all, or only `keys`) and their jumps in line and names what had to change. Each jump stays first
// in its parent, ahead of rules such as ufw's that would accept the packet. Never touches a policy or any other rule.
function firewallSync(binary: string, rules: Record<FirewallChain, string[][]>, keys = Object.keys(firewallChains) as FirewallChain[]): string[] {
  const tag = `vinci:${createHash('sha256').update(JSON.stringify(rules)).digest('hex').slice(0, 12)}`;

  const listed = (chain: string) => {
    const { ok, out } = iptables(binary, ['-w', '-S', chain]);

    return ok ? out.split('\n').filter((line) => line.startsWith('-A ')) : undefined;
  };

  const stale = keys.filter((key) => {
    const lines = listed(firewallChains[key]);

    return lines === undefined || lines.length !== rules[key].length || lines.some((line) => !line.includes(tag));
  });

  if (stale.length > 0) {
    const body = stale.flatMap((key) => [
      `:${firewallChains[key]} - [0:0]`,
      ...rules[key].map((rule) => {
        const target = rule.indexOf('-j');

        return ['-A', firewallChains[key], ...rule.slice(0, target), '-m', 'comment', '--comment', tag, ...rule.slice(target)].join(' ');
      }),
    ]);

    iptablesOk(`${binary}-restore`, ['-w', '--noflush'], ['*filter', ...body, 'COMMIT', ''].join('\n'));
  }

  const moved = keys.filter((key) => {
    const jump = ['-i', `${daemonBridgePrefix}+`, '-j', firewallChains[key]];

    if (listed(firewallParents[key])?.[0] === ['-A', firewallParents[key], ...jump].join(' ')) {
      return false;
    }

    while (iptables(binary, ['-w', '-C', firewallParents[key], ...jump]).ok) {
      iptablesOk(binary, ['-w', '-D', firewallParents[key], ...jump]);
    }

    iptablesOk(binary, ['-w', '-I', firewallParents[key], '1', ...jump]);

    return true;
  });

  return [...stale.map((key) => firewallChains[key]), ...moved.map((key) => `the jump to ${firewallChains[key]} in ${firewallParents[key]}`)];
}

// What the firewall cannot put back itself but makes its rules useless: Docker no longer sends forwarded packets
// through DOCKER-USER, or the kernel passes bridged packets (the hub to a daemon, a daemon to the hub) without iptables.
function firewallBypassed(binary: string): string[] {
  const forward = iptables(binary, ['-w', '-S', 'FORWARD']).out.split('\n');

  const bridged = (() => {
    try {
      return readFileSync('/proc/sys/net/bridge/bridge-nf-call-iptables', 'utf8').trim();
    } catch {
      return 'missing';
    }
  })();

  return [
    ...(forward.includes(`-A FORWARD -j ${firewallParents.forward}`) ? [] : [`FORWARD does not jump to ${firewallParents.forward}.`]),
    ...(bridged === '1' ? [] : [`net.bridge.bridge-nf-call-iptables is ${bridged}, not 1: traffic between containers on a bridge skips iptables.`]),
  ];
}

// `firewall status`, as root on the server: the health Docker last saw, and the firewall's last restores and problems
// from its log. Exits non-zero unless healthy.
async function firewallStatus() {
  const id = await docker(['compose', 'ps', '--all', '--quiet', 'firewall']);

  if (id.trim() === '') {
    fail('The firewall service does not exist: run bun deploy.ts apply.');
  }

  const state: { Status: string, Health?: { Status: string, Log?: { Output: string }[] } } = JSON.parse(await docker(['inspect', '--format', '{{json .State}}', id.trim()]));
  const logs = (await docker(['compose', 'logs', '--no-log-prefix', '--timestamps', '--tail', '1000', 'firewall'])).split('\n').filter(Boolean);
  const problems = logs.filter((line) => line.includes(firewallProblem)).slice(-5);
  const health = state.Health?.Status ?? state.Status;

  console.log(`Firewall: ${health}. Last check: ${state.Health?.Log?.at(-1)?.Output.trim() ?? 'none yet'}`);
  console.log(`Last log line: ${logs.at(-1) ?? 'none'}`);
  console.log(problems.length === 0 ? 'No check found a problem since the container started.' : ['Last problems a check found:', ...problems].join('\n'));

  if (health !== 'healthy') {
    fail('The firewall is not healthy: bots may reach internal addresses, and workspaces that stop do not start again. See troubleshooting.md, "The firewall is unhealthy".');
  }
}

// `firewall remove`, as root on the server: stops the service, then deletes the chains and their jumps.
async function firewallRemove() {
  await docker(['compose', 'stop', 'firewall']);

  while (iptables(iptablesNft, ['-w', '-C', ...firewallFlushGuard]).ok) {
    iptablesOk(iptablesNft, ['-w', '-D', ...firewallFlushGuard]);
  }

  for (const key of Object.keys(firewallChains) as (keyof typeof firewallChains)[]) {
    const jump = [firewallParents[key], '-i', `${daemonBridgePrefix}+`, '-j', firewallChains[key]];

    while (iptables(iptablesNft, ['-w', '-C', ...jump]).ok) {
      iptablesOk(iptablesNft, ['-w', '-D', ...jump]);
    }

    if (iptables(iptablesNft, ['-w', '-S', firewallChains[key]]).ok) {
      iptablesOk(iptablesNft, ['-w', '-F', firewallChains[key]]);
      iptablesOk(iptablesNft, ['-w', '-X', firewallChains[key]]);
      console.log(`Removed ${firewallChains[key]} and its jump from ${firewallParents[key]}.`);
    }
  }
}

// The firewall service (compose.yaml): keeps bots off the server's internal addresses. It sets the rules at start (a
// Docker restart or a reboot starts it again); its health check (`firewall check`) puts back a lost rule.
async function firewall() {
  const action = process.argv[3];

  if (action === 'remove') {
    return firewallRemove();
  }

  if (action === 'status') {
    return firewallStatus();
  }

  const allow = internalAllow();
  const rules = firewallRules(allow);

  // A check that finds Docker's chains gone (the whole ruleset flushed) keeps the server itself closed to daemons,
  // which needs no Docker chain, and says what brings the rest back.
  if (action === 'check' && !iptables(iptablesNft, ['-w', '-S', firewallParents.forward]).ok) {
    const restored = firewallSync(iptablesNft, rules, ['host']);

    if (!iptables(iptablesNft, ['-w', '-C', ...firewallFlushGuard]).ok) {
      iptablesOk(iptablesNft, ['-w', '-I', firewallFlushGuard[0] ?? 'FORWARD', '1', ...firewallFlushGuard.slice(1)]);
    }

    return firewallCheck(restored, [`Docker's ${firewallParents.forward} chain is gone, so daemons can reach nothing outside their network: restart Docker (systemctl restart docker), which writes its chains again.`]);
  }

  const binary = iptablesBinary();
  const restored = firewallSync(binary, rules);

  while (iptables(binary, ['-w', '-C', ...firewallFlushGuard]).ok) {
    iptablesOk(binary, ['-w', '-D', ...firewallFlushGuard]);
  }

  if (action === 'check') {
    return firewallCheck(restored, firewallBypassed(binary));
  }

  console.log(`Firewall on (${binary}): daemons reach the internet and DNS, not internal addresses${allow.length > 0 ? `, except ${allow.map((entry) => entry.join(':')).join(', ')}` : ''}.`);
  // The health check keeps the rules from here on; this process only keeps the container up.
  setInterval(() => undefined, 2 ** 31 - 1);
}

// `firewall check`, the image's health check every 2 s: puts back whatever is missing, and fails when it had to or
// when Docker or the kernel bypass the rules, so `docker compose ps` and `firewall status` show it and Compose starts
// no daemon meanwhile. A failure also goes to the container's log (the main process's output, /proc/1/fd/1), which
// keeps it longer than Docker's last five health results.
function firewallCheck(restored: string[], bypassed: string[]) {
  const problems = [...(restored.length > 0 ? [`Rules were missing or out of place; restored ${restored.join(', ')}.`] : []), ...bypassed];

  if (problems.length > 0) {
    writeFileSync('/proc/1/fd/1', `${firewallProblem} ${problems.join(' ')}\n`, { flag: 'a' });
    fail(`${firewallProblem} ${problems.join(' ')}`);
  }

  console.log('Firewall on: rules in place.');
}

const commands = { images, cloudflare, check, apply, status: stackStatus, backup, nightly, restore, purge, provisioner, firewall, disks: disksCommand };
const command = process.argv[2] ?? '';

try {
  if (!(command in commands)) {
    fail([
      'Usage:',
      '  bun scripts/deploy.ts images [daemon|sandbox|web|hub|provisioner|firewall ...] [--platform linux/amd64|linux/arm64] [--tag <tag>]',
      '  bun scripts/deploy.ts cloudflare apply|emails|destroy ...',
      '  bun scripts/deploy.ts check https://<host> no public response names the software or a version behind it',
      'On the server, in /opt/vinci:',
      '  bun deploy.ts check                     the server requirements: memory, disk, CPU and Ubuntu version',
      '  bun deploy.ts apply                     render users.yaml and bring the stack in line',
      '  bun deploy.ts status                    each person\'s daemon and sandbox: running, starting or stopped',
      '  bun deploy.ts backup <id>               copy one person\'s volume to backups/',
      '  bun deploy.ts nightly                   back up everyone, the hub folder and the deployment files to backups/<time>/',
      '  bun deploy.ts nightly status            the last nightly run, its age and result',
      '  bun deploy.ts nightly install|remove    the systemd timer that runs it every night',
      '  bun deploy.ts nightly fetch [<time>]    list the off-site backups, or download and decrypt one into backups/<time>/',
      '  bun deploy.ts restore <id> <file|folder> replace one person\'s volume with a backup',
      '  bun deploy.ts restore <folder>          rebuild a whole install from a nightly folder on a fresh server',
      '  bun deploy.ts purge <id>                delete a removed person\'s data for good',
      '  bun deploy.ts disks mount               mount every person\'s sandbox disk (the boot unit apply installs runs it)',
      '  bun deploy.ts firewall status           the firewall\'s health and the last problems its checks found',
      '  bun deploy.ts firewall remove           stop the firewall service and delete its rules (teardown)',
      'In the provisioner image:',
      '  bun deploy.ts provisioner               serve the hub\'s user API on PROVISIONER_PORT',
      'In the firewall image:',
      '  bun deploy.ts firewall                  keep daemons off internal addresses (VINCI_INTERNAL_ALLOW)',
      '  bun deploy.ts firewall check            the health check: restore missing rules, fail if any were',
    ].join('\n'));
  }

  await commands[command as keyof typeof commands]();
} catch (error) {
  console.error(errorMessage(error));
  process.exit(1);
}
