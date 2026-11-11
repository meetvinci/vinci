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
| `HUB_HOST` | `0.0.0.0` | Listen on the container's network. The default, `127.0.0.1`, is unreachable from outside the container. |
| `HUB_PORT` | `47192` (default) | The port cloudflared connects to. Internal only. |
| `HUB_DATA_DIR` | a folder on the hub's own volume, for example `/data` | Holds `users.json` and `pins.json`. The default is in the home folder, which is read-only in the container. |
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
| tunnel credentials | on the server, root only | `TODO(wave 2)`: final path. Lets cloudflared connect the tunnel. Secret. |
| tunnel config | `TODO(wave 2)` | Sends `<team>.<domain>` to the hub. |
| Compose file | `TODO(wave 2)` | All containers, volumes and networks. |

## Container limits

Each person's container runs with:

- a non-root user (uid 1000), no extra Linux privileges, read-only system files, and `tini` to handle stop signals
- 512 MB of memory, 1 CPU, 256 processes
- restart on crash and on reboot
- its own network, reachable only by the hub (`TODO(wave 2)`)

On a Mac test, a daemon used about 120 MB idle and about 190 MB after opening an artifact preview. Keep the 512 MB limit until the numbers are confirmed on the server.

## Cloudflare

| Object | Setting |
| --- | --- |
| Tunnel | one per server |
| DNS | `<team>.<domain>`, proxied, to the tunnel |
| Access app | `<team>.<domain>`: allow the team's emails; session 24 hours by default, longer is fine for a home-screen app; cookie HttpOnly on, SameSite Lax, binding cookie off |
| Access apps | `<team>.<domain>/img/favicon/*` and `<team>.<domain>/favicon.ico`: Bypass, Everyone |
| Access app (optional) | `<team>-ssh.<domain>`: admin email only |
| Login method | one-time PIN by email, or your identity provider |
