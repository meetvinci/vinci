# Configuration

Every setting and file in a team install. "Set by the image" means the container image already has that value; you only set the others. Paths and files still marked `TODO(wave 2)` come with the deployment files.

## Daemon (one per person)

| Setting | Value in a team install | What it does |
| --- | --- | --- |
| `DATA_DIR` | `/data` (set by the image) | Where the person's database, bots and files live. On their volume. |
| `HOME` | `/data/home` (set by the image) | The person's home folder. Must be on the volume, or skills and tool settings are lost on restart. |
| `PI_CODING_AGENT_DIR` | `/data/pi` (set by the image) | Model provider settings: `models.json`, `auth.json`. Must be writable. |
| `DAEMON_HOST` | `0.0.0.0` (set by the image) | Listen on the container's network. |
| `DAEMON_PORT` | `47191` (set by the image) | Port inside the container. Never published to the internet. |
| `DAEMON_PUBLIC_URLS` | `https://<team>.<domain>` | The address people reach Orbs at, comma separated if more than one. The daemon tells apps only these addresses and accepts browser calls from them. Without it every browser call gets 403. |
| `DAEMON_ALLOWED_ORIGINS` | empty | Extra browser addresses allowed to call the daemon. Not needed when `DAEMON_PUBLIC_URLS` is set. |
| `WEB_PUBLIC_URL` | `https://<team>.<domain>` | The address pairing links open. |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn` or `error`. |

## Web app (one per team)

| Setting | Value in a team install | What it does |
| --- | --- | --- |
| `WEB_HOST` | `0.0.0.0` (set by the image) | Listen on the container's network. Logs a "reachable from your network" warning; expected here. |
| `WEB_PORT` | `47190` (set by the image) | Port inside the container. |
| `WEB_PUBLIC_URL` | `https://<team>.<domain>` | The team address. |
| `WEB_HUB_URL` | the hub's internal address, for example `http://hub:47192` | Turns on hub mode: the web app sends its own calls to the hub and never straight to a daemon. **Required.** Without it the web app falls back to single-person behaviour. Not the same as the hub's `HUB_WEB_URL`. |

## Hub (one per team)

| Setting | Value in a team install | What it does |
| --- | --- | --- |
| `ACCESS_TEAM_DOMAIN` | `https://<your-team>.cloudflareaccess.com` | Where the hub fetches Cloudflare's keys to check logins. Required: the hub won't start without it. |
| `ACCESS_AUD` | the AUD tag of the team's Access application | Makes sure a login was for this application. Required. |
| `HUB_HOST` | `0.0.0.0` (set by the image) | Listen on the container's network. Outside the image the default is `127.0.0.1`. |
| `HUB_PORT` | `47192` (set by the image) | The port cloudflared connects to. Internal only. |
| `HUB_DATA_DIR` | `/data` (set by the image) | Holds `users.json` and `pins.json`. Mount the hub's own volume there. |
| `HUB_WEB_URL` | the web app's internal address, for example `http://web:47190` | Where the hub sends everything that is not for a daemon. Not the same as the web app's `WEB_HUB_URL`. |
| `HUB_PUBLIC_URL` | `https://<team>.<domain>` | The team address, so the web app knows it is served over HTTPS at that name. Required. |

The hub runs as the same user as the daemons (uid 1000), because it talks to their owner sockets.

## Files

| File | Where | What it holds |
| --- | --- | --- |
| `users.json` | `HUB_DATA_DIR` | Who may use Orbs: each email's user id, the internal address of their Orbs and the path of its owner socket. Format and rules: [admin tasks](admin.md#the-user-list). |
| `pins.json` | `HUB_DATA_DIR` | The ID of each person's Orbs, saved the first time the hub reaches it. The hub refuses to forward if the ID changes. Written by the hub. |
| `models.json` | `/data/pi/` in each person's volume | Model provider settings and, optionally, the person's API key. Read only at start. |
| `auth.json` | `/data/pi/` in each person's volume | Keys and logins the person adds in Settings. Plain text. |
| `data/credentials.key` | `/data/` in each person's volume | Encryption key for secrets the person's bots saved. |
| `data/ipc/rpc.sock` | `/data/` in each person's volume | The owner socket. The hub reaches it through a mount of only the `data/ipc` folder, to pair a person's browser. Mount it at exactly the `socketPath` in `users.json`, with no symlinks on the way: the hub refuses symlinks. |
| `.agents/skills/`, `.agents/AGENTS.md`, `.agents/mcp.json` | `/data/home/` in each person's volume | Skills, instructions and MCP servers for all of the person's bots. |
| `/opt/orbs/.env` | on the server, mode 600, root only | `ORBS_PUBLIC_HOST`, `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` and the secret `TUNNEL_TOKEN`, written by `bun scripts/deploy.ts cloudflare apply --env-out` (see [Cloudflare](#cloudflare)), plus the Compose settings. |
| tunnel routes | in Cloudflare, not on the server | Send `<team>.<domain>` to the hub, `http://hub:47192`. Set by `bun scripts/deploy.ts cloudflare apply`; don't edit them in the dashboard, the next run puts them back. |
| `deploy/cloudflare/cloudflared.compose.yaml` | in the repository | The cloudflared container, included by the Compose file. |
| Compose file | `TODO(wave 2)` | All containers, volumes and networks. |

## Container limits

Each person's container runs with:

- a non-root user (uid 1000), no extra Linux privileges, read-only system files, and `tini` to handle stop signals
- 512 MB of memory, 1 CPU, 256 processes
- restart on crash and on reboot
- its own network, reachable only by the hub (`TODO(wave 2)`)

On a Mac test, a daemon used about 120 MB idle and about 190 MB after opening an artifact preview. Keep the 512 MB limit until the numbers are confirmed on the server.

## Cloudflare

`bun scripts/deploy.ts cloudflare apply` creates these, all named after `--name` (here `orbs-<team>`). It changes and deletes only objects with these exact names.

| Object | Name | Setting |
| --- | --- | --- |
| Tunnel | `orbs-<team>` | one per server, routes kept in Cloudflare. The team name goes to `http://hub:47192`. Only `/img/favicon/<file>` and `/favicon.ico` skip cloudflared's own check of the Access login. |
| Access policy | `orbs-<team>-allow` | allow the emails in the hub's `users.json` |
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
| Login method | one-time PIN by email, or your identity provider |
