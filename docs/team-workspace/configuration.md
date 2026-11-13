# Configuration

Every setting and file in a team install. "Set by the image" means the container image already has that value. "Set by Compose" means `deploy/compose/` fills it in from `/opt/orbs/.env`. You only edit `.env` and `users.yaml`.

## The server's `.env`

`/opt/orbs/.env`, root only (mode 600). The template with every line is `deploy/.env.example`.

| Setting | Example | What it does |
| --- | --- | --- |
| `COMPOSE_FILE` | `compose.yaml:cloudflared.compose.yaml:users.compose.yaml` | Which Compose files `docker compose` loads in `/opt/orbs`. Keep as is. |
| `ORBS_PUBLIC_HOST` | `acme.example.com` | The team address without `https://`. Becomes `DAEMON_PUBLIC_URLS`, `WEB_PUBLIC_URL` and `HUB_PUBLIC_URL`. |
| `ORBS_TAG` | `v0.2.0` | The tag of the `orbs-daemon`, `orbs-web`, `orbs-hub` and `orbs-provisioner` images. Change it to upgrade or roll back. |
| `DAEMON_MEMORY`, `DAEMON_CPUS`, `DAEMON_PIDS` | `512m`, `1`, `256` | Limits for each person's container. These are the defaults. |
| `LOG_LEVEL` | `info` | Log detail for every container. |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `MISTRAL_API_KEY`, `GROQ_API_KEY`, `XAI_API_KEY`, `DEEPSEEK_API_KEY` | empty | Model keys every person's Orbs gets as environment variables. Every person's bots can read them. |
| `HUB_ADMIN_EMAILS` | `admin@example.com` | The admin panel's first admins, comma separated. The hub uses them only while its own admin list is empty. Required. |
| `PROVISIONER_TOKEN` | 64 hex characters | Secret the hub sends to the provisioner. Made with `openssl rand -hex 32` at install; nobody types it. Required. |
| `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `CLOUDFLARE_ZONE`, `CLOUDFLARE_NAME`, `CLOUDFLARE_ACCESS_DOMAINS`, `TUNNEL_TOKEN` | | The Cloudflare values; see [Cloudflare](#cloudflare). `TUNNEL_TOKEN` is a secret. |
| `BACKUP_TIME` | `03:00` | When the nightly backup runs, in server time. Read by `bun deploy.ts nightly install`; run it again after a change. |
| `BACKUP_KEEP_DAILY`, `BACKUP_KEEP_WEEKLY` | `7`, `4` | How many days and weeks of nightly backups to keep. See [backups](admin.md#nightly-backups). |
| `BACKUP_OFFSITE_SCRIPT` | empty | Optional: a program run after each good nightly backup with the run's folder as its argument, to copy it off the server. See [off-site copy](admin.md#off-site-copy). |
| `CLOUDFLARE_API_TOKEN` | empty | Optional secret: lets the provisioner update the Access allow policy and show the panel whom it lets in. Recommended with a list of emails. See [admin tasks](admin.md#let-the-server-update-cloudflare-access). |

A required value that is missing stops `docker compose` with a message naming it.

## Daemon (one per person)

| Setting | Value in a team install | What it does |
| --- | --- | --- |
| `DATA_DIR` | `/data` (set by the image) | Where the person's database, bots and files live. On their volume. |
| `HOME` | `/data/home` (set by the image) | The person's home folder. Must be on the volume, or skills and tool settings are lost on restart. |
| `PI_CODING_AGENT_DIR` | `/data/pi` (set by the image) | Model provider settings: `models.json`, `auth.json`. Must be writable. |
| `DAEMON_HOST` | `0.0.0.0` (set by the image) | Listen on the container's network. |
| `DAEMON_PORT` | `47191` (set by the image) | Port inside the container. Never published to the internet. |
| `DAEMON_PUBLIC_URLS` | `https://<team>.<domain>` (set by Compose) | The address people reach Orbs at, comma separated if more than one. The daemon tells apps only these addresses and accepts browser calls from them. Without it every browser call gets 403. |
| `DAEMON_TEAM` | `true` (set by Compose) | Marks a team daemon: people's devices cannot change a bot's permission level, approval rules or timeout, how bots use secrets, rate limits, or add an MCP server that runs a command. The admin still can in the panel. Leave it out for a single-owner daemon. |
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
| `ACCESS_TEAM_DOMAIN` | `https://<your-team>.cloudflareaccess.com` | Where the hub fetches Cloudflare's keys to check logins. Required: the hub won't start without it. |
| `ACCESS_AUD` | the AUD tag of the team's Access application | Makes sure a login was for this application. Required. |
| `HUB_HOST` | `0.0.0.0` (set by the image) | Listen on the container's network. Outside the image the default is `127.0.0.1`. |
| `HUB_PORT` | `47192` (set by the image) | The port cloudflared connects to. Internal only. |
| `HUB_DATA_DIR` | `/data` (set by the image) | Holds `users.json`, `admins.json`, `pins.json`, `global.json` and `audit.sqlite`. Compose mounts the server folder `/opt/orbs/hub` there. |
| `HUB_WEB_URL` | `http://web:47190` (set by Compose) | Where the hub sends everything that is not for a daemon. Not the same as the web app's `WEB_HUB_URL`. |
| `HUB_PUBLIC_URL` | `https://<team>.<domain>` (set by Compose) | The team address, so the web app knows it is served over HTTPS at that name. Required. |
| `HUB_ADMIN_EMAILS` | the first admin's email, from `.env` (set by Compose) | Comma-separated emails written to `admins.json` when it is empty, so the first admin can open `/admin`. Ignored once the file lists anyone. Required. |
| `PROVISIONER_URL` | `http://provisioner:47193` (set by Compose) | Where the hub asks for people to be added, changed or removed. Without it (outside Compose) the panel lists people but changes answer 501. |
| `PROVISIONER_TOKEN` | generated into `.env` at install (set by Compose) | Sent to the provisioner on every call. Required with `PROVISIONER_URL`; the hub won't start without it. Secret. |

The hub runs as the same user as the daemons (uid 1000), because it talks to their owner sockets.

## Provisioner (one per team)

Adds, disables and removes people for the admin panel by running `bun deploy.ts apply` in `/opt/orbs`, and updates the Access allow policy when it has a token. It is the only container with the Docker socket.

| Setting | Value in a team install | What it does |
| --- | --- | --- |
| `PROVISIONER_TOKEN` | from `.env` (set by Compose) | Every request must carry it as `Authorization: Bearer <token>`. At least 32 characters, or it won't start. |
| `PROVISIONER_PORT` | `47193` (set by the image) | Port on the `orbs_provisioner` network. Never published. |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE`, `CLOUDFLARE_NAME` | from `.env` (set by Compose) | With a token it updates the policy `<CLOUDFLARE_NAME>-allow` after each change (keeping its domain rule) and reads it for the panel; with a token but no zone or name it won't start. Without a token a change says `manual` unless it only touches emails inside `CLOUDFLARE_ACCESS_DOMAINS`. |
| `CLOUDFLARE_ACCESS_DOMAINS` | from `.env` (set by Compose) | The policy's domain rule, comma separated, as `cloudflare apply --domain` wrote it. Without a token, the provisioner uses it to tell which changes need nothing in Cloudflare and the panel shows its notice from it. |

It runs as root with every Linux capability dropped, a read-only system, no published port, 256 MB of memory, and `/opt/orbs` mounted at the same path so Compose finds the same files as on the server. Root lets it read `.env` and the Docker socket as their owner; without capabilities it can write only files root owns or that are group root, which is why the `hub` folder is owned by uid 1000, group root, mode 770.

## Files

| File | Where | What it holds |
| --- | --- | --- |
| `.env` | `/opt/orbs/` | Every setting above. Secret. |
| `users.yaml` | `/opt/orbs/` | The one list of people (user id, login email, optional name, enabled and advanced) and the admin panel's `admins:`. The admin panel changes it through the provisioner; by hand, edit it and run `bun deploy.ts apply`. Format: [admin tasks](admin.md#the-user-list). |
| `compose.yaml`, `daemon.yaml` | `/opt/orbs/`, copied from `deploy/compose/` | The hub, the provisioner, the web app, the one-off `tools` service, and the container every person gets. |
| `cloudflared.compose.yaml` | `/opt/orbs/`, copied from `deploy/cloudflare/` | The tunnel connector. |
| `deploy.ts` | `/opt/orbs/`, copied from `scripts/deploy.ts` | `apply`, `backup`, `nightly`, `restore` and `purge`. Runs with Bun. The provisioner image has its own copy from the same tag. |
| `hub/` | `/opt/orbs/hub/` | The hub's folder: owned by uid 1000, group root, mode 770. `apply` sets this when run as root. |
| `users.compose.yaml` | `/opt/orbs/` | One container, network and volume per person, plus the same for the template workspace (`daemon-template`). Written by `apply`; do not edit. |
| `hub/users.json` | `/opt/orbs/hub/`, `/data/` in the hub | Each enabled person's email, user id, daemon address (`http://daemon-<id>:47191`), owner socket (`/ipc/<id>/rpc.sock`) and `advanced: true` for an advanced user, and under `template` the template workspace's address and socket (no email). Written by `apply`; do not edit. |
| `hub/global.json` | `/opt/orbs/hub/`, `/data/` in the hub | For each person and settings section: follows global or overridden, and whether the last copy worked. Written by the hub; `purge` removes a person's entry. If it is unreadable or invalid, the panel refuses section changes until it is fixed (reads keep working). |
| `hub/admins.json` | `/opt/orbs/hub/`, `/data/` in the hub | `{"admins": ["<email>", ...]}`: who may open the admin panel at `/admin`. An admin does not need to be a user. Written by the hub when admins change in the panel; seeded from `HUB_ADMIN_EMAILS` while empty. If it is unreadable or invalid nobody is an admin until it is fixed. |
| `hub/pins.json` | `/opt/orbs/hub/`, `/data/` in the hub | The ID of each person's Orbs, saved the first time the hub reaches it. The hub refuses to forward if the ID changes. Written by the hub; `purge` removes a person's line. |
| `hub/audit.sqlite` | `/opt/orbs/hub/`, `/data/` in the hub | The admin panel's audit trail: one row per admin read or change, never content or values. Written by the hub only; kept by upgrades, `apply`, rollbacks and `purge`. See [Activity](admin.md#activity). |
| `backups/<time>/` | `/opt/orbs/backups/` | One nightly run: every person's and the template's volume, the hub folder, the deployment files with `.env`, and `manifest.json` with sizes and checksums. Secret. See [backups](admin.md#nightly-backups). |
| `backups/nightly.json` | `/opt/orbs/backups/` | The last nightly run's time, result and error, for `bun deploy.ts nightly status`. |
| `backups/<id>-<time>.tar.gz` | `/opt/orbs/backups/` | One person's whole volume, from `backup <id>` or the copy `restore` saves first. Secret. Never deleted by retention. |
| `/etc/systemd/system/orbs-backup.service`, `.timer` | the host | The nightly backup timer. Written by `bun deploy.ts nightly install`, removed by `nightly remove`. |
| `models.json` | `/data/pi/` in each person's volume | Model provider settings, such as a different address for a provider. Read only at start. |
| `auth.json` | `/data/pi/` in each person's volume | Keys and logins the person adds in Settings. Plain text. |
| `data/credentials.key` | `/data/` in each person's volume | Encryption key for secrets the person's bots saved. |
| `data/ipc/rpc.sock` | the `orbs_ipc` volume, folder `<id>` | The owner socket: the private door for pairing and admin changes to settings and bots, never chats. The person's container sees only its own folder, at `/data/data/ipc`; the hub sees all of them at `/ipc/<id>`, and nothing else of anyone's volume. |
| `.agents/skills/`, `.agents/AGENTS.md`, `.agents/mcp.json` | `/data/home/` in each person's volume | Skills, instructions and MCP servers for all of the person's bots. |
| tunnel routes | in Cloudflare, not on the server | Send `<team>.<domain>` to the hub, `http://hub:47192`. Set by `bun scripts/deploy.ts cloudflare apply`; don't edit them in the dashboard, the next run puts them back. The tunnel's only credential is `TUNNEL_TOKEN` in `.env`. |

## Networks

Nothing is published on the server's network interfaces. Docker Compose creates:

| Network | Who is on it | Internet |
| --- | --- | --- |
| `orbs_tunnel` | cloudflared and the hub | yes: the tunnel, and the hub's fetch of Cloudflare's login keys |
| `orbs_web` | the hub and the web app | no |
| `orbs_provisioner` | the hub and the provisioner | no |
| `orbs_egress` | the provisioner only | yes: the Cloudflare API, used only with `CLOUDFLARE_API_TOKEN` |
| `orbs_user-<id>` | one person's container and the hub | yes: bots need model providers, MCP servers and the web |

A person's container cannot reach another person's container, the web app, cloudflared or the hub's files, and has no Docker socket. It can reach the internet, and nothing stops it from trying the server's own addresses: on the test server every person's container could open the host's SSH port and read the cloud provider's metadata service (`169.254.169.254`, including the server's user-data). Never put secrets in the server's user-data or cloud-init, and keep host services off `0.0.0.0` unless they need to be public. The hub joins each person's network while running, so adding someone never restarts it. Don't attach other containers to an `orbs_user-<id>` network: it breaks that person's isolation, and removing the person then fails because their network is still in use.

## Container limits

Each person's container runs with:

- a non-root user (uid 1000), no extra Linux privileges, read-only system files, and `tini` to handle stop signals
- 512 MB of memory, 1 CPU, 256 processes (`DAEMON_MEMORY`, `DAEMON_CPUS`, `DAEMON_PIDS`)
- a 256 MB `/tmp` in memory
- restart on crash and on reboot
- its own network, reachable only by the hub

Measured idle on a 2 vCPU, 4 GB x86 server (`docker stats`): each daemon about 105-110 MB after a chat, the web app 35-55 MB, cloudflared 15-35 MB, the hub 12 MB; each under 0.5% CPU. The system and Docker took about 470 MB. On a Mac test a daemon reached about 190 MB after opening an artifact preview. Keep the 512 MB limit.

## Cloudflare

`bun scripts/deploy.ts cloudflare apply` creates these, all named after `--name` (here `orbs-<team>`). It changes and deletes only objects with these exact names.

| Object | Name | Setting |
| --- | --- | --- |
| Tunnel | `orbs-<team>` | one per server, routes kept in Cloudflare. The team name goes to `http://hub:47192`. Only `/img/favicon/<file>` and `/favicon.ico` skip cloudflared's own check of the Access login. |
| Access policy | `orbs-<team>-allow` | allow the enabled users' and the admins' emails in `users.yaml`; with `--domain`, allow everyone whose email ends in `@<domain>` plus the `users.yaml` emails outside it |
| Access policy | `orbs-<team>-bypass` | bypass, everyone |
| Access app | `orbs-<team>` | `<team>.<domain>` with the allow policy; session `--session`, 24 hours by default; cookie HttpOnly on, SameSite Lax, binding cookie off |
| Access app | `orbs-<team>-favicon` | `<team>.<domain>/img/favicon/*` and `<team>.<domain>/favicon.ico` with the bypass policy |
| DNS | comment `orbs deploy orbs-<team>` | `<team>.<domain>`, proxied CNAME to the tunnel; created last |
| Access policy, app and DNS (optional) | `orbs-<team>-ssh-allow`, `orbs-<team>-ssh` | `<team>-ssh.<domain>` to the server's sshd, `--ssh-email` addresses only |

The values the server needs:

| Setting | Example | What it does |
| --- | --- | --- |
| `ORBS_PUBLIC_HOST` | `acme.example.com` | The team address, without `https://`. |
| `ACCESS_TEAM_DOMAIN` | `https://<your-team>.cloudflareaccess.com` | The hub's `ACCESS_TEAM_DOMAIN`. |
| `ACCESS_AUD` | 64 hex characters | The hub's `ACCESS_AUD`: the AUD tag of the `orbs-<team>` application. |
| `CLOUDFLARE_ZONE`, `CLOUDFLARE_NAME` | `example.com`, `orbs-acme` | The `--zone` and `--name` of the install, for the provisioner's Access sync. Not secret. |
| `CLOUDFLARE_ACCESS_DOMAINS` | `example.com`, or empty | The `--domain` values, comma separated. Not secret. |
| `TUNNEL_TOKEN` | secret | Lets cloudflared connect the tunnel. Only in `/opt/orbs/.env`. |

The API token needs Account: Cloudflare Tunnel: Edit, Account: Access: Apps and Policies: Edit, and Zone: DNS: Edit for the domain. The optional token on the server needs only Zone › Zone › Read for the domain and Account › Access: Apps and Policies › Edit (Read is enough to only show whom Access lets in).

Remove everything (only objects with these exact names, after listing them; stop cloudflared first):

```sh
bun scripts/deploy.ts cloudflare destroy --zone <domain> --hostname <team>.<domain> --name orbs-<team> [--ssh-hostname <team>-ssh.<domain>]
# lists what it would delete; add --yes to delete exactly those
```

Login method: one-time PIN by email, or your identity provider.
