# Configuration

Every setting and file in a team install. "Set by the image" means the container image already has that value. "Set by Compose" means `deploy/compose/` fills it in from `/opt/orbs/.env`. You only edit `.env` and `users.yaml`.

## The server's `.env`

`/opt/orbs/.env`, root only (mode 600). The template with every line is `deploy/.env.example`.

| Setting | Example | What it does |
| --- | --- | --- |
| `COMPOSE_FILE` | `compose.yaml:cloudflared.compose.yaml:users.compose.yaml` | Which Compose files `docker compose` loads in `/opt/orbs`. Keep as is. |
| `ORBS_PUBLIC_HOST` | `acme.example.com` | The team address without `https://`. Becomes `DAEMON_PUBLIC_URLS`, `WEB_PUBLIC_URL` and `HUB_PUBLIC_URL`. |
| `ORBS_TAG` | `v0.2.0` | The tag of the `orbs-daemon`, `orbs-web` and `orbs-hub` images. Change it to upgrade or roll back. |
| `DAEMON_MEMORY`, `DAEMON_CPUS`, `DAEMON_PIDS` | `512m`, `1`, `256` | Limits for each person's container. These are the defaults. |
| `LOG_LEVEL` | `info` | Log detail for every container. |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `MISTRAL_API_KEY`, `GROQ_API_KEY`, `XAI_API_KEY`, `DEEPSEEK_API_KEY` | empty | Model keys every person's Orbs gets as environment variables. Every person's bots can read them. |
| `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `TUNNEL_TOKEN` | | The Cloudflare values; see [Cloudflare](#cloudflare). `TUNNEL_TOKEN` is a secret. |

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
| `HUB_DATA_DIR` | `/data` (set by the image) | Holds `users.json` and `pins.json`. Compose mounts the server folder `/opt/orbs/hub` there. |
| `HUB_WEB_URL` | `http://web:47190` (set by Compose) | Where the hub sends everything that is not for a daemon. Not the same as the web app's `WEB_HUB_URL`. |
| `HUB_PUBLIC_URL` | `https://<team>.<domain>` (set by Compose) | The team address, so the web app knows it is served over HTTPS at that name. Required. |

The hub runs as the same user as the daemons (uid 1000), because it talks to their owner sockets.

## Files

| File | Where | What it holds |
| --- | --- | --- |
| `.env` | `/opt/orbs/` | Every setting above. Secret. |
| `users.yaml` | `/opt/orbs/` | The one list of people: user id and login email. The admin edits it, then runs `bun deploy.ts apply`. Format: [admin tasks](admin.md#the-user-list). |
| `compose.yaml`, `daemon.yaml` | `/opt/orbs/`, copied from `deploy/compose/` | The hub, the web app, the one-off `tools` service, and the container every person gets. |
| `cloudflared.compose.yaml` | `/opt/orbs/`, copied from `deploy/cloudflare/` | The tunnel connector. |
| `deploy.ts` | `/opt/orbs/`, copied from `scripts/deploy.ts` | `apply`, `backup`, `restore` and `purge`. Runs with Bun. |
| `users.compose.yaml` | `/opt/orbs/` | One container, network and volume per person. Written by `apply`; do not edit. |
| `hub/users.json` | `/opt/orbs/hub/`, `/data/` in the hub | Each email's user id, daemon address (`http://daemon-<id>:47191`) and owner socket (`/ipc/<id>/rpc.sock`). Written by `apply`; do not edit. |
| `hub/pins.json` | `/opt/orbs/hub/`, `/data/` in the hub | The ID of each person's Orbs, saved the first time the hub reaches it. The hub refuses to forward if the ID changes. Written by the hub; `purge` removes a person's line. |
| `backups/<id>-<time>.tar.gz` | `/opt/orbs/backups/` | One person's whole volume. Secret. |
| `models.json` | `/data/pi/` in each person's volume | Model provider settings, such as a different address for a provider. Read only at start. |
| `auth.json` | `/data/pi/` in each person's volume | Keys and logins the person adds in Settings. Plain text. |
| `data/credentials.key` | `/data/` in each person's volume | Encryption key for secrets the person's bots saved. |
| `data/ipc/rpc.sock` | the `orbs_ipc` volume, folder `<id>` | The owner socket. The person's container sees only its own folder, at `/data/data/ipc`; the hub sees all of them at `/ipc/<id>`, and nothing else of anyone's volume. |
| `.agents/skills/`, `.agents/AGENTS.md`, `.agents/mcp.json` | `/data/home/` in each person's volume | Skills, instructions and MCP servers for all of the person's bots. |
| tunnel routes | in Cloudflare, not on the server | Send `<team>.<domain>` to the hub, `http://hub:47192`. Set by `bun scripts/deploy.ts cloudflare apply`; don't edit them in the dashboard, the next run puts them back. The tunnel's only credential is `TUNNEL_TOKEN` in `.env`. |

## Networks

Nothing is published on the server's network interfaces. Docker Compose creates:

| Network | Who is on it | Internet |
| --- | --- | --- |
| `orbs_tunnel` | cloudflared and the hub | yes: the tunnel, and the hub's fetch of Cloudflare's login keys |
| `orbs_web` | the hub and the web app | no |
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
| Access policy | `orbs-<team>-allow` | allow the emails in `users.yaml` |
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
| `TUNNEL_TOKEN` | secret | Lets cloudflared connect the tunnel. Only in `/opt/orbs/.env`. |

The API token needs Account: Cloudflare Tunnel: Edit, Account: Access: Apps and Policies: Edit, and Zone: DNS: Edit for the domain.

Remove everything (only objects with these exact names, after listing them; stop cloudflared first):

```sh
bun scripts/deploy.ts cloudflare destroy --zone <domain> --hostname <team>.<domain> --name orbs-<team> [--ssh-hostname <team>-ssh.<domain>]
# lists what it would delete; add --yes to delete exactly those
```

Login method: one-time PIN by email, or your identity provider.
