---
title: Configuration
description: Every setting and file in an install.
---

Every setting and file in a team install. "Set by the image" means the container image already has that value. "Set by Compose" means `deploy/compose/` fills it in from `/opt/vinci/.env`. You only edit `.env` and `users.yaml`.

## The server's `.env`

`/opt/vinci/.env`, root only (mode 600). The template with every line is `deploy/.env.example`.

| Setting | Example | What it does |
| --- | --- | --- |
| `COMPOSE_FILE` | `compose.yaml:caddy.compose.yaml:users.compose.yaml` | Which Compose files `docker compose` loads in `/opt/vinci`. Keep as is; with the [Cloudflare Tunnel](install.md#optional-cloudflare-tunnel), add `cloudflared.compose.yaml` after `caddy.compose.yaml`. `apply` refuses a list without `caddy.compose.yaml`, and stops on a leftover `VINCI_AUTH=access` ([Move from Cloudflare Access](admin.md#move-from-cloudflare-access)). |
| `VINCI_PUBLIC_HOST` | `acme.example.com` | The team address without `https://`. Becomes `DAEMON_PUBLIC_URLS`, `WEB_PUBLIC_URL` and `HUB_PUBLIC_URL`. |
| `VINCI_TAG` | `v0.2.0` | The tag of the `vinci-daemon`, `vinci-sandbox`, `vinci-web`, `vinci-hub`, `vinci-provisioner`, `vinci-firewall` and `vinci-api` images. Change it to upgrade or roll back. CI builds them from each release tag ([images from CI](admin.md#images-from-ci)). |
| `VINCI_REGISTRY` | `ghcr.io/meetvinci/` | Where Compose takes the images from, ending in `/`. The images on GitHub Container Registry are public: the server pulls them without logging in. Empty uses images loaded by hand with `docker load` ([install, step 3](install.md#3-get-vinci-onto-the-server)). |
| `DAEMON_MEMORY`, `DAEMON_CPUS`, `DAEMON_PIDS` | `512m`, `1`, `256` | Limits for each person's container. These are the defaults. |
| `SANDBOX_MEMORY`, `SANDBOX_CPUS`, `SANDBOX_PIDS` | `512m`, `1`, `256` | Limits for each person's sandbox, where their bots' tools run. These are the defaults; idle it uses about 3 MB. A runaway command hits this limit, not their Vinci's. |
| `SANDBOX_DISK` | `5g` | The disk of each person's bots: their bot folders and the files sent in chats, `m` or `g`. Bots get *No space left on device* at this size; nobody else notices. Raise it and run `bun deploy.ts apply` to grow every disk; shrinking is not automatic. See [disk limits](admin.md#disk-limits). |
| `LOG_LEVEL` | `info` | Log detail for every container. |
| `VINCI_INTERNAL_ALLOW` | empty | Internal destinations every person's Vinci and sandbox may still reach, `<IPv4>:<port>` (TCP), comma separated, such as `172.17.0.1:48290`. Empty: none. The firewall and each person's secrets proxy both read it, and an MCP server over plain `http` is accepted only at one of these (written as the IPv4 address, port 80 when omitted). See [what a bot can reach](admin.md#what-a-bot-can-do-and-reach). |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `MISTRAL_API_KEY`, `GROQ_API_KEY`, `XAI_API_KEY`, `DEEPSEEK_API_KEY` | empty | Model keys every person's Vinci gets as environment variables. Bots cannot read them: their tools run in the sandbox, which does not have them. |
| `HUB_ADMIN_EMAILS` | `admin@example.com` | The admin panel's first admins, comma separated. The hub uses them only while its own admin list is empty. Required. |
| `PROVISIONER_TOKEN` | 64 hex characters | Secret the hub sends to the provisioner. Made with `openssl rand -hex 32` at install; nobody types it. Required. |
| `VINCI_DB_PASSWORD`, `VINCI_POSTGRES_PASSWORD` | 64 hex characters each | PostgreSQL passwords for Laravel's database owner and the PostgreSQL administrator. Generate once in [install, step 7](install.md#7-start-vinci). Required. |
| `TUNNEL_TOKEN` | | Only with the optional Cloudflare Tunnel: lets cloudflared connect it. Written by `cloudflare apply --env-out`. Secret. |
| `API_APP_KEY` | `base64:` and 32 random bytes | Laravel's `APP_KEY`. Encrypts the login form's own session cookie; changing it only makes open login forms start over. Required. Secret. |
| `API_INTERNAL_TOKEN` | 64 hex characters | The secret the hub sends to the API's `/internal` routes: `/internal/session` to check each login and change a person's own password, `/internal/users` to add, reset and remove accounts for the admin panel. Required. Secret. |
| `BACKUP_TIME` | `03:00` | When the nightly backup runs, in server time. Read by `bun deploy.ts nightly install`; run it again after a change. |
| `BACKUP_KEEP_DAILY`, `BACKUP_KEEP_WEEKLY` | `7`, `4` | How many days and weeks of nightly backups to keep. See [backups](admin.md#nightly-backups). |
| `BACKUP_S3_BUCKET` | empty | Optional: an S3-compatible bucket that receives an encrypted copy of each good nightly backup. See [off-site copy](admin.md#off-site-copy). |
| `BACKUP_S3_ENDPOINT`, `BACKUP_S3_REGION`, `BACKUP_S3_PREFIX` | empty | The provider's S3 address (empty for Amazon S3), the bucket's region (`auto` for R2) and an optional folder in the bucket. |
| `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY` | empty | The bucket's access key: list, read, write and delete. |
| `BACKUP_PASSPHRASE` | empty | Encrypts every off-site upload, at least 20 characters, letters and digits. Required with `BACKUP_S3_BUCKET`. Without it the off-site copies cannot be restored: keep it in a password manager too. |

A required value that is missing stops `docker compose` with a message naming it.

## Daemon (one per person)

| Setting | Value in a team install | What it does |
| --- | --- | --- |
| `DATA_DIR` | `/data` (set by the image) | Where the person's database, bots and files live. On their volume. |
| `HOME` | `/data/home` (set by the image) | The person's home folder. Must be on the volume, or skills and tool settings are lost on restart. |
| `PI_CODING_AGENT_DIR` | `/data/pi` (set by the image) | Model provider settings: `models.json`, `auth.json`. Must be writable. |
| `DAEMON_HOST` | `0.0.0.0` (set by the image) | Listen on the container's network. |
| `DAEMON_PORT` | `47191` (set by the image) | Port inside the container. Never published to the internet. |
| `DAEMON_PUBLIC_URLS` | `https://<team>.<domain>` (set by Compose) | The address people reach Vinci at, comma separated if more than one. The daemon tells apps only these addresses and accepts browser calls from them. Without it every browser call gets 403. |
| `DAEMON_SANDBOX_DIR` | `/run/sandbox` (set by the image) | The folder this Vinci shares with the person's sandbox. Set in the daemon image itself, so no Compose file can leave it out; the image refuses to start the daemon unless a volume is mounted there, so a bare `docker run` of it exits with a message. With it, bots' tools run only in the sandbox, MCP servers that run a command start only in the sandbox, every tool call and such server start is refused while no sandbox is connected, and plugins and MCP files inside a bot's folder are not loaded. Leave it out only for a Vinci outside Docker (development), where tools run inside it. |
| `VINCI_INTERNAL_ALLOW` | from `.env` (set by Compose) | The firewall's exceptions, `<IPv4>:<port>` comma separated. The secrets proxy refuses every internal address but these, and MCP servers over `http` must be one of them; a daemon does not start with a value that is not `<IPv4>:<port>`. Empty outside Docker, so a daemon run by hand refuses all internal addresses through the proxy. |
| `DAEMON_ALLOWED_ORIGINS` | empty | Extra browser addresses allowed to call the daemon. Not needed when `DAEMON_PUBLIC_URLS` is set. |
| `WEB_PUBLIC_URL` | `https://<team>.<domain>` (set by Compose) | The address pairing links open. |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn` or `error`. |

## Web app (one per team)

| Setting | Value in a team install | What it does |
| --- | --- | --- |
| `WEB_HOST` | `0.0.0.0` (set by the image) | Listen on the container's network. Logs a "reachable from your network" warning; expected here. |
| `WEB_PORT` | `47190` (set by the image) | Port inside the container. |
| `WEB_PUBLIC_URL` | `https://<team>.<domain>` (set by Compose) | The team address. |
| `WEB_HUB_URL` | `http://hub:47192` (set by Compose) | Turns on hub mode: the web app sends its own calls to the hub and never straight to a daemon. **Required.** Without it the web app falls back to single-person behaviour. Not the same as the hub's `HUB_WEB_URL`. |

## Hub (one per team)

| Setting | Value in a team install | What it does |
| --- | --- | --- |
| `HUB_HOST` | `0.0.0.0` (set by the image) | Listen on the container's network. Outside the image the default is `127.0.0.1`. |
| `HUB_PORT` | `47192` (set by the image) | The port Caddy connects to. Internal only. |
| `HUB_DATA_DIR` | `/data` (set by the image) | Holds `users.json`, `admins.json`, `pins.json`, `global.json` and `audit.sqlite`. Compose mounts the server folder `/opt/vinci/hub` there. |
| `HUB_WEB_URL` | `http://web:47190` (set by Compose) | Where the hub sends everything that is not for a daemon. Not the same as the web app's `WEB_HUB_URL`. |
| `HUB_PUBLIC_URL` | `https://<team>.<domain>` (set by Compose) | The team address, so the web app knows it is served over HTTPS at that name. Required. |
| `HUB_ADMIN_EMAILS` | the first admin's email, from `.env` (set by Compose) | Comma-separated emails written to `admins.json` when it is empty, so the first admin can open `/admin`. Ignored once the file lists anyone. Required. |
| `HUB_VERSION` | the image tag, `VINCI_TAG` from `.env` (set by Compose) | The version whose start the hub copies the global settings on. A restart on the same version copies nothing (`hub/start-sync.json`). Without it every start copies them. Give each upgrade its own tag: new images under the same tag (such as `latest`) count as the same version, so press *Sync now* after such an upgrade. |
| `PROVISIONER_URL` | `http://provisioner:47193` (set by Compose) | Where the hub asks for people to be added, changed or removed. Without it (outside Compose) the panel lists people but changes answer 501. |
| `PROVISIONER_TOKEN` | generated into `.env` at install (set by Compose) | Sent to the provisioner on every call. Required with `PROVISIONER_URL`; the hub won't start without it. Secret. |
| `HUB_ACCOUNTS_URL`, `HUB_ACCOUNTS_TOKEN` | `http://api:8080` and `API_INTERNAL_TOKEN` (set by `caddy.compose.yaml`) | Where the hub checks every login (the `vinci_session` cookie, trusted for 5 seconds) and manages login accounts, and its secret. Required: the hub won't start without them. |

The hub runs as the same user as the daemons (uid 1000), because it talks to their owner sockets.

## Provisioner (one per team)

Adds, disables and removes people for the admin panel by running `bun deploy.ts apply` in `/opt/vinci`, and deletes `/opt/vinci/admin-password` once the first admin changed their password. It is the only container with the Docker socket.

| Setting | Value in a team install | What it does |
| --- | --- | --- |
| `PROVISIONER_TOKEN` | from `.env` (set by Compose) | Every request must carry it as `Authorization: Bearer <token>`. At least 32 characters, or it won't start. |
| `PROVISIONER_PORT` | `47193` (set by the image) | Port on the `vinci_provisioner` network. Never published. |

It runs as root with every Linux capability dropped, a read-only system, no published port, 256 MB of memory, and `/opt/vinci` mounted at the same path so Compose finds the same files as on the server. Root lets it read `.env` and the Docker socket as their owner; without capabilities it can write only files root owns or that are group root, which is why the `hub` folder is owned by uid 1000, group root, mode 770.

## Firewall (one per server)

Keeps bots off the server's internal addresses ([what a bot can reach](admin.md#what-a-bot-can-do-and-reach)) with two named iptables chains for people's networks (bridges named `mv-d<9 hex>`): `VINCI-DAEMONS`, jumped from the first rule of Docker's `DOCKER-USER`, and `VINCI-DAEMONS-HOST`, jumped from the first rule of `INPUT`. It lets the hub open each person's port 47191, rejects the rest between containers on a person's network, and rejects private, link-local, shared (`100.64.0.0/10`), loopback, multicast and reserved addresses and anything on the server itself, except `VINCI_INTERNAL_ALLOW`. It changes no policy and no other rule. Its health check runs every 2 seconds, rewrites the chains when they are missing or different, and fails when it had to or when Docker or the kernel bypass them. People's daemons depend on it: Compose starts them only while it is healthy, and each one waits at start until the firewall rejects it (the daemon and sandbox images always do).

| Setting | Value in a team install | What it does |
| --- | --- | --- |
| `VINCI_INTERNAL_ALLOW` | from `.env` (set by Compose) | Destinations let through before the rejects. `apply` refuses a value that is not `<IPv4>:<port>` (no hostnames, ranges or leading zeros) before the firewall sees it. |

It runs on the host network as root with only `NET_ADMIN`, a read-only system, no port and 128 MB of memory. It uses `iptables-nft` only, and refuses to start when Docker's `DOCKER-USER` chain is not there (Docker on `iptables-legacy`, its nftables backend, or `"iptables": false`); `apply` then stops before starting anyone's Vinci. `bun deploy.ts firewall status`, on the server, shows its health and the last problems its checks found; `bun deploy.ts firewall remove` stops it and deletes the chains and jumps.

## Files

| File | Where | What it holds |
| --- | --- | --- |
| `.env` | `/opt/vinci/` | Every setting above. Secret. |
| `users.yaml` | `/opt/vinci/` | The one list of people (user id, login email, optional name, enabled and advanced) and the admin panel's `admins:`. The admin panel changes it through the provisioner; by hand, edit it and run `bun deploy.ts apply`. Format: [admin tasks](admin.md#the-user-list). |
| `compose.yaml`, `daemon.yaml`, `sandbox.yaml` | `/opt/vinci/`, copied from `deploy/compose/` | The hub, the provisioner, the web app, the API, the one-off `tools` service, and the two containers every person gets: their Vinci and the sandbox where their bots' tools run. |
| `caddy.compose.yaml` | `/opt/vinci/`, copied from `deploy/caddy/` | The edge: Caddy with its Caddyfile inline, and the API's and hub's extra settings and networks for the login. |
| `cloudflared.compose.yaml` | `/opt/vinci/`, copied from `deploy/cloudflare/` | Only with the optional Cloudflare Tunnel: the tunnel connector, and Caddy on plain HTTP without published ports. |
| `deploy.ts` | `/opt/vinci/`, copied from `scripts/deploy.ts` | `apply`, `status`, `backup`, `nightly`, `restore` and `purge`. Runs with Bun. The provisioner image has its own copy from the same tag. |
| `hub/` | `/opt/vinci/hub/` | The hub's folder: owned by uid 1000, group root, mode 770. `apply` sets this when run as root. |
| `users.compose.yaml` | `/opt/vinci/` | Per person, plus the same for the template workspace (`daemon-template`, `sandbox-template`): their container, network and volume, and their sandbox with its own network and shared-folder volume (`sandbox-<id>`). Written by `apply`; do not edit. |
| `hub/users.json` | `/opt/vinci/hub/`, `/data/` in the hub | Each enabled person's email, user id, daemon address (`http://daemon-<id>:47191`), owner socket (`/ipc/<id>/rpc.sock`) and `advanced: true` for an advanced user, and under `template` the template workspace's address and socket (no email). Written by `apply`; do not edit. |
| `hub/global.json` | `/opt/vinci/hub/`, `/data/` in the hub | For each person and settings section: follows global or overridden, and whether the last copy worked. Written by the hub; `purge` removes a person's entry. If it is unreadable or invalid, the panel refuses section changes until it is fixed (reads keep working). |
| `hub/new-users.json` | `/opt/vinci/hub/`, `/data/` in the hub | The people an `apply` created with an empty Vinci, until the hub acts on them. Written only by `apply`; the hub makes each of them who has no entry in `global.json` follow every section, then deletes the file. Usually absent. If it is unreadable or invalid, the hub logs it and makes nobody follow; the next `apply` replaces or removes it. |
| `hub/admins.json` | `/opt/vinci/hub/`, `/data/` in the hub | `{"admins": ["<email>", ...]}`: who may open the admin panel at `/admin`. An admin does not need to be a user. Written by the hub when admins change in the panel; seeded from `HUB_ADMIN_EMAILS` while empty. If it is unreadable or invalid nobody is an admin until it is fixed. |
| `hub/pins.json` | `/opt/vinci/hub/`, `/data/` in the hub | The ID of each person's Vinci, saved the first time the hub reaches it. The hub refuses to forward if the ID changes. Written by the hub; `purge` removes a person's line. |
| `hub/audit.sqlite` | `/opt/vinci/hub/`, `/data/` in the hub | The admin panel's audit trail: one row per admin read or change, never content or values. Written by the hub only; kept by upgrades, `apply`, rollbacks and `purge`. See [Activity](admin.md#activity). |
| `hub/start-sync.json` | `/opt/vinci/hub/`, `/data/` in the hub | The version (`HUB_VERSION`) whose start copied the global settings to everyone, and that copy's row in the audit trail. Written by the hub; delete it to make the next start copy again. |
| `backups/<time>/` | `/opt/vinci/backups/` | One nightly run: every person's and the template's volume, the hub folder, the deployment files with `.env`, and `manifest.json` with sizes and checksums. Secret. See [backups](admin.md#nightly-backups). |
| `backups/nightly.json` | `/opt/vinci/backups/` | The last nightly run's time, result and error, for `bun deploy.ts nightly status`. |
| `backups/offsite.json` | `/opt/vinci/backups/` | The last off-site upload and the last off-site failure with its reason, and the bucket and prefix they were for, for `bun deploy.ts nightly status`. |
| `backups/<id>-<time>.tar.gz` | `/opt/vinci/backups/` | One person's whole volume, from `backup <id>` or the copy `restore` saves first. Secret. Never deleted by retention. |
| `/etc/systemd/system/vinci-backup.service`, `.timer` | the host | The nightly backup timer. Written by `bun deploy.ts nightly install`, removed by `nightly remove`. |
| `models.json` | `/data/pi/` in each person's volume | Model provider settings, such as a different address for a provider. Read only at start. |
| `auth.json` | `/data/pi/` in each person's volume | Keys and logins the person adds in Settings. Plain text. |
| `data/credentials.key` | `/data/` in each person's volume | Encryption key for secrets the person's bots saved. |
| `data/ipc/rpc.sock` | the `vinci_ipc` volume, folder `<id>` | The owner socket: the private door for pairing and admin changes to settings and bots, never chats. The person's container sees only its own folder, at `/data/data/ipc`; the hub sees all of them at `/ipc/<id>`, and nothing else of anyone's volume. |
| `.agents/skills/`, `.agents/AGENTS.md`, `.agents/mcp.json` | `/data/home/` in each person's volume | Skills, instructions and MCP servers for all of the person's bots. |
| tunnel route | in Cloudflare, not on the server | Only with the tunnel: sends `<team>.<domain>` to Caddy, `http://caddy:80`. Set by `bun scripts/deploy.ts cloudflare apply`; don't edit it in the dashboard, the next run puts it back. The tunnel's only credential is `TUNNEL_TOKEN` in `.env`. |

## Networks

Nothing is published on the server's network interfaces except ports 80 and 443 by Caddy (nothing at all with the tunnel). Docker Compose creates:

| Network | Who is on it | Internet |
| --- | --- | --- |
| `vinci_tunnel` | Caddy, and cloudflared with the tunnel | yes: Caddy's certificates; the tunnel |
| `vinci_edge` | Caddy and the hub | no |
| `vinci_login` | Caddy and the API | no |
| `vinci_accounts` | the hub and the API: login checks, password changes and the accounts of the admin panel | no |
| `vinci_web` | the hub and the web app | no |
| `vinci_api` | the Laravel API and PostgreSQL | no |
| `vinci_provisioner` | the hub and the provisioner | no |
| `vinci_user-<id>` | one person's container and the hub; bridge `mv-d<9 hex>`, no traffic between containers but the hub to port 47191, no IPv6 | yes, public addresses only: bots need model providers, MCP servers and the web |
| `vinci_sandbox-<id>` | one person's sandbox only; a bridge `mv-d<9 hex>` like theirs, so the firewall treats it the same, no IPv6 | yes, public addresses only: bots' commands need the web |

A person's container cannot reach another person's container, the web app, cloudflared or the hub's files, and has no Docker socket. It reaches the internet and nothing internal: not the hub, the server itself or its SSH, the cloud provider's metadata service (`169.254.169.254`) or private addresses, unless `VINCI_INTERNAL_ALLOW` names one ([what a bot can reach](admin.md#what-a-bot-can-do-and-reach)). Still never put secrets in the server's user-data or cloud-init. The hub joins each person's network while running, so adding someone never restarts it. Don't attach other containers to a `vinci_user-<id>` or `vinci_sandbox-<id>` network: it breaks that person's isolation, and removing the person then fails because their network is still in use.

## Container limits

Each person's container runs with:

- a non-root user (uid 1000), no extra Linux privileges, read-only system files, and `tini` to handle stop signals
- 512 MB of memory, 1 CPU, 256 processes (`DAEMON_MEMORY`, `DAEMON_CPUS`, `DAEMON_PIDS`)
- a 256 MB `/tmp` in memory
- restart on crash and on reboot
- its own network, reachable only by the hub

Each person's sandbox runs the same way (`SANDBOX_MEMORY`, `SANDBOX_CPUS`, `SANDBOX_PIDS`), on a network of its own that nothing else joins. It sees only the person's bot folders and their bots' home folder (`/home/bot`, both on their sandbox disk of `SANDBOX_DISK`; where `HOME`, `XDG_*`, npm's prefix and cache, Bun's install folders and pip's user folder point), their shared skills and instructions (read only) and the folder their Vinci shares with it (read only); their Vinci has an empty read-only folder over `/data/bot-home`. It holds no Vinci code: pi-env, the small program that runs the tools for Vinci, and the tools bots use ([what a bot can do](admin.md#what-a-bot-can-do-and-reach)). The image is about 800 MB unpacked (arm64), 450 MB before the tools. Measured idle on an arm64 test machine: about 3 MB per sandbox; their Vinci holds a small link process of about 5 MB once a bot has used a tool.

Measured idle on a 2 vCPU, 4 GB x86 server (`docker stats`): each daemon about 105-110 MB after a chat, the web app 35-55 MB, cloudflared (with the tunnel) 15-35 MB, the hub 12 MB; each under 0.5% CPU. The system and Docker took about 470 MB. On a Mac test a daemon reached about 190 MB after opening an artifact preview. Keep the 512 MB limit.

## Cloudflare Tunnel (optional)

`bun scripts/deploy.ts cloudflare apply --zone <domain> --hostname <team>.<domain> --name vinci-<team>` creates these and changes or deletes only them:

| Object | Name | Setting |
| --- | --- | --- |
| Tunnel | `vinci-<team>` | one per server, remotely managed: its one route sends `<team>.<domain>` to `http://caddy:80`, anything else answers 404 |
| DNS | comment `vinci deploy vinci-<team>` | `<team>.<domain>`, proxied CNAME to the tunnel |

With `--env-out <file>` it writes `VINCI_PUBLIC_HOST` and `TUNNEL_TOKEN` (secret) for the server's `.env`. The API token needs Account: Cloudflare Tunnel: Edit and Zone: DNS: Edit for the domain. Remove both (after listing them; stop cloudflared first):

```sh
bun scripts/deploy.ts cloudflare destroy --zone <domain> --hostname <team>.<domain> --name vinci-<team>
# lists what it would delete; add --yes to delete exactly those
```
