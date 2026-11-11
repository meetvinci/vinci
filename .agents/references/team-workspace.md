# Team workspace

How Orbs serves a small team (3-7 users per installation) without making the daemon multi-user. Human setup guides: [`docs/team-workspace/`](../../docs/team-workspace/README.md). Keep this file and those guides current when the design, phase status or a gotcha changes.

## Design

Each user gets an unchanged single-owner daemon in its own hardened Linux container. One hub per organization is the only front door: Cloudflare Access logs the user in, the hub verifies the Access JWT, maps the email to that user's daemon and forwards. The daemon never learns about users; its owner is whoever the hub routes to it.

```mermaid
flowchart TB
  Browser["browser or PWA"] -->|"https://org.domain"| Access["Cloudflare Access<br/>login, signs JWT"]
  Access --> Tunnel["Cloudflare Tunnel<br/>cloudflared on the host"]
  Tunnel --> Hub["apps/hub<br/>verify JWT, email to daemon"]
  subgraph Host["Ubuntu 24.04 x86 VPS, Docker"]
    Hub -->|"/rpc, /health, /files, /avatars, /embed, /mcp/callback"| DaemonA["daemon: user A<br/>own container and volume"]
    Hub --> DaemonB["daemon: user B"]
    Hub -->|"every other path"| Web["apps/web<br/>one shared web app"]
    Web -->|"SSR with forwarded JWT"| Hub
    Hub -.->|"owner socket: pairing grant"| DaemonA
  end
  DaemonA --> Models["model providers<br/>user's own API key"]
```

- Hub routes by verified identity only. Cookies, `x-bots-server-id`, `Host` and `x-forwarded-*` never choose the daemon. Users come from `HUB_DATA_DIR/users.json` (email to id, `daemonUrl`, `socketPath`); the hub pins each daemon's serverId in `pins.json` on first contact and checks `/health` against it before forwarding. Hub env: `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `HUB_HOST`, `HUB_PORT`, `HUB_DATA_DIR`, `HUB_WEB_URL` `HUB_PUBLIC_URL`. Behaviour and wire details: the Hub section of [`api.md`](api.md).
- First visit: the hub mints a pairing grant over that daemon's owner socket and redirects to `/connect?code=<payload>`; the page redeems it at once with the default device name. No PIN, no device-name form. The device token lives in the web cookie as today.
- Daemon: `DAEMON_PUBLIC_URLS` makes it advertise only those origins and accept them as browser Origins. Web: `WEB_HUB_URL` turns on hub mode; SSR sends every daemon call to the hub with the request's Access JWT and the web server answers 404 on daemon paths. Do not confuse it with the hub's `HUB_WEB_URL` (where the hub sends non-daemon paths).
- Images (`deploy/docker/Dockerfile`): Bun bundles without `node_modules`, the artifact embed prebuilt, uid 1000 under tini, read-only root. All daemon state lives on the user's `/data` volume: `DATA_DIR`, `HOME=/data/home` and `PI_CODING_AGENT_DIR=/data/pi`.

## Decisions

| Decision | Why |
| --- | --- |
| One single-owner daemon per user, one container and volume each; no users table in the daemon | The container is the only isolation between users: a bot's bash sees the whole container. Keeps the daemon's security model intact |
| One public hostname per organization behind a Cloudflare Tunnel; Access is the login | No open inbound ports; Access gives identity, OTP or IdP, and revocation without Orbs accounts |
| The hub routes by the verified `Cf-Access-Jwt-Assertion` (fallback `CF_Authorization` cookie); clients never choose their daemon | Cookie-named addresses made the web server an SSRF and wrong-daemon surface |
| The hub reaches each daemon's owner socket through a mount of only `data/ipc`, as the daemon's uid | The socket serves only pairing bootstrap; the Docker socket would make the internet-facing hub root on the host. The user's bot controls that folder, so the hub must not trust what it finds there (risk 1) |
| No admin device and no impersonation. Admin may audit everything, but only through an admin panel over the owner socket, never as the user | A device paired into a user's daemon steals that user's pushes and can be revoked by them; acting as the user blurs accountability |
| Notifications stay one device per notification, chosen per daemon as today | The daemon only knows its own user's devices once admin devices are gone |
| Models: Pi's provider system unchanged, each user's own API keys. No shared subscription logins, no model gateway yet | Provider terms forbid routing other users through one subscription: Anthropic's "Authentication and credential use" quoted in `ijpatricio/spike-hetzner:spikes/hetzner/FINDINGS.md` Spike 6, section 6; OpenAI forbids sharing account credentials (same section). [`cliproxy.md`](cliproxy.md) is for a single owner's own subscription only |
| Target: x86 Ubuntu 24.04 VPS with Docker; web and PWA first | Proven on Hetzner; native clients need a Cloudflare login first (Phase 7) |
| Sizing: 512 MiB limit per daemon; plan about 5 users on 4 GB and about 12 on 8 GB until measured on the server | With the prebuilt embed a daemon idles at about 120 MiB and sits at about 190 MiB after an artifact preview (PR #4, arm64; to be confirmed on the x86 server). The spike images, which built the embed at runtime, used 180 and 450 MiB. Budget 1 GB for OS, Docker, web and hub |

## Phases

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Spikes: container, multi-daemon, shared models, Hetzner with Tunnel and Access | done |
| 2 | Fleet by hand. Wave 1: (A) daemon, web and hub images, PR #4; (B) hub, PR #3; (C) daemon public-origin env and web hub mode, PR #2; (D) these records, PR #1. Wave 2: Compose deployment, tunnel config, deploy skill | in progress: B and C merged, A and D under review |
| 3 | Hub user management and login polish | planned |
| 4 | Permissions and an admin channel over the owner socket | planned |
| 5 | Admin panel UI with a read-only conversation viewer | planned |
| 6 | Hardening: bot tools in a separate sandbox, outbound limits, backups, optional model gateway with per-user keys | planned |
| 7 | Clients: PWA push, Android build, stores, native login via Cloudflare Managed OAuth | planned |
| 8 | Computer use: headless browser, then a desktop container per user, then a cloud desktop | planned |
| 9 | Templates and per-user model overrides | planned |

## Risks and gotchas

Most important first. Spike sources are on branches, read with `git show <branch>:<path>`: container = `ijpatricio/spike-container:spikes/container/FINDINGS.md`, multi = `ijpatricio/spike-multi-daemon:spikes/multi-daemon/FINDINGS.md`, models = `ijpatricio/spike-shared-models:spikes/shared-models/FINDINGS.md`, hetzner = `ijpatricio/spike-hetzner:spikes/hetzner/FINDINGS.md`. "Review" = the independent Phase 2 wave 1 review of PRs #1-#4.

1. **Until Phase 6 a bot controls its own daemon and its own `data/ipc` folder.** Bash and Pi's in-process `read` run as the daemon uid: bash can call `data/ipc/rpc.sock` and mint an owner device on its own daemon, and both read `credentials.key`, `app.sqlite`, `auth.json` and `models.json`. Env vars reach bash unfiltered. AppArmor exec stacking (`orbs-daemon//&orbs-bot`) blocks bash only; `read` and non-bash children (stdio MCP) stay unconfined. Because the hub mounts that same folder, a bot can try to replace `rpc.sock` with a symlink to another user's socket. The hub refuses a `socketPath` that is not a real socket or sits below a symlinked folder, refuses duplicate `daemonUrl`/`socketPath` entries and a serverId already pinned to another user. One gap remains: the check and the connect are separate steps (fetch cannot connect from a file descriptor), so a bot can swap the socket in between. Per-daemon networks reachable only by the hub (wave 2) are the real boundary. Do not deploy beyond a trusted team before Phase 6. Sources: multi Q2, models Q4, hetzner Q5, review finding 1, the Hub section of `api.md`.
2. **Pairing throttles are per user, not per organization.** Each daemon receives only its own user's traffic through the hub, so its peer-keyed `public` and redeem throttles count that user's devices and hub calls together. Every wrong PIN counts against all live grants of that daemon, so a user's own mistakes (or their bot) can block their own pairing for a while. The hub mints at most 5 grants per user per 10 minutes. Sources: hetzner Q2, multi Q2, PR #3 `api.md` Hub section.
3. **The first redeem on a daemon deletes all other socket-issued grants**, so a hub grant races the startup pairing link. The hub pairs before handing links out. Source: multi Q2, hetzner Q6.
4. **Removing a user cuts access within seconds.** Removing the entry from `users.json` gives 403 within about a second, and open WebSockets are rechecked every 5 s and closed (1008) when the user is gone or the Access token expired. A missing, unreadable or invalid file means zero users: everyone gets 403 and the hub logs an error until it is fixed, including at startup. Source: review finding 2, `api.md` Hub.
5. **`users.json` must give each user a unique daemon.** A copied `daemonUrl` or `socketPath` would route one person to another person's daemon; the hub rejects such a file (zero users), and `pins.json` lets a server ID belong to one user only. Source: review finding 3.
6. **Wrong-daemon routing after container IPs change.** Recreated containers took each other's IPs; stale cookie addresses and a stale name in the long-running Bun web server (2-5.5 min, root cause unknown, `BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS` did not help) sent alice's requests to carol. Server ID and token checks stopped any data crossing, but the web client cleared the session. Hub mode removes cookie-named addresses; keep fixed IPs on the internal network and the hub's serverId pin. Source: hetzner Q3.
7. **Hub mode misconfiguration reopens the old surface.** Without `WEB_HUB_URL` the web server falls back to its cookie-address proxy, which from the web container can reach any internal daemon. `WEB_HUB_URL` (web, points at the hub) and `HUB_WEB_URL` (hub, points at the web app) are easy to swap. The hub answers 400 to paths with empty or dot segments (`//rpc`) before routing. `HUB_PUBLIC_URL` is required: the hub sets `X-Forwarded-Proto` and `X-Forwarded-Host` from it. Unset `DAEMON_PUBLIC_URLS` or `ACCESS_*` fail closed. `vite dev` fronts one fixed daemon; only the built server works with several. Sources: review finding 5, multi Q1, hetzner Q3.
8. **A public origin gets 403 from every daemon** unless it is in `DAEMON_PUBLIC_URLS` or `DAEMON_ALLOWED_ORIGINS`: the hub passes the browser `Origin` through. Origins must be bare (no path), so native clients need host-based routing. Sources: hetzner Q3, PR #2.
9. **After "revoked" or "replaced" the hub re-pairs the browser.** `GET /connect` without `code` mints a grant whenever the request has no `bots.connection` cookie for this user's daemon, including after `?reason=…`; the 5-grants-per-10-minutes limit ends any loop. Source: review finding 4, `api.md` Hub.
10. **`HOME` must live on the volume** (`HOME=/data/home`, set by the image): Pi's global skills (`~/.agents/skills`), `~/.agents/AGENTS.md`, `~/.agents/mcp.json` and bot dotfiles otherwise vanish or are unwritable under `--read-only`. Sources: container 4-5, models risk 9.
11. **Pi needs a writable Pi dir even to read credentials** (lock directory `auth.json.lock`, `models-store.json`). A read-only Pi dir breaks every turn; a file bind mount into a missing `/data/pi` makes Docker create the directory as root and every turn silently stalls (the image pre-creates `/data/home` and `/data/pi` as uid 1000; its wrapper creates them on an empty bind mount). Mount shared files as symlinks or nested read-only mounts inside a writable per-user Pi dir; never bind-mount `auth.json` alone (it disables cross-process locking). Sources: models Q2, Q5; hetzner Q2; PR #4.
12. **Settings → Providers stores API keys and OAuth logins in plaintext `auth.json`**, not the encrypted credentials table, and a stored key beats `models.json` and env. `models.json` is read once at start (restart to apply); skills and instructions are picked up within 30 s. Source: models Q1, Q2.
13. **Images.** PR #4 ships the desktop server bundles (no `node_modules`) with the artifact embed prebuilt: daemon image 89 MB compressed for amd64, web 51 MB, hub 44 MB. All three ran together hardened on OrbStack (arm64): two daemons idled at 140-150 MiB after a turn, web at 100 MiB and hub at 33 MiB. Bundles run with `bun --no-install`, or an optional `require` makes Bun download from npm at runtime and crash with `EROFS` on a read-only root. A daemon run from source still builds the embed at runtime (Bun.build + Tailwind, about 450 MiB). The daemon image has no git, curl or ffmpeg (videos get no poster). Build on CI or a workstation, not the production host (dockerd held 790 MB; the build cache reached 14 GB). Bun on x64 needs AVX2. Sources: PR #4, container 1, hetzner Q1, Q4.
14. **Hub image env** (review finding 6): the image sets `HUB_HOST=0.0.0.0`, `HUB_PORT=47192` and `HUB_DATA_DIR=/data`, exposes 47192 and checks `/hub/health`; `HUB_WEB_URL`, `HUB_PUBLIC_URL`, `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` come at run time. Each user's `data/ipc` is mounted at its `socketPath` with no symlinks on the path. The hub bundle is about 0.5 MB.
15. **Owner socket constraints.** No peer-credential check: any same-uid process can mint a grant. The hub must run as the daemon's uid (socket 0600, directory 0700 with an owner check); every image runs as uid 1000, the hub included. Distinct uids per user would need one hub process per uid. The mount must be read-write and exist before the hub starts. Host uid 1000 equals the container uid, which matters for bind mounts; a high uid or userns-remap is a later hardening option. Unix socket paths are limited (104 bytes on macOS). Sources: multi Q2, hetzner Q5, Q6, PR #4.
16. **Bun as PID 1 ignores SIGTERM**: the images run tini, so stops take about 0.2 s; any other Bun container needs an init. Use `restart: unless-stopped`; routines and alarms run only while the daemon runs, and an overdue routine fires once on start. Sources: hetzner Q7, container 4, PR #4.
17. **PWA behind Access.** The manifest, its icons and `/favicon.ico` 302 to the login unless an Access Bypass covers `/img/favicon/*` and `/favicon.ico` (the hub also lets both through without a JWT). On session expiry the web client sees a redirect on `/health` and reloads at most once a minute so Access can sign the user in; the app session defaults to 24 h. iOS standalone login cookie handoff is untested. Sources: hetzner Q5, PR #2, PR #3.
18. **Native clients and Access.** Managed OAuth sends `Authorization: Bearer`, the header Orbs uses for device tokens, so the device token must move first. React Native's WebSocket needs Access headers on the upgrade. Don't build on cloudflared's undocumented CLI handoff. Source: hetzner Q4.
19. **Hub state must persist** in `HUB_DATA_DIR` (`users.json`, `pins.json`) on a volume. A pin mismatch is a 502 with an admin-facing log line, never a forward; change `pins.json` only after confirming which daemon belongs to whom (for example after a deliberate daemon reset). Sources: hetzner Q6, `api.md` Hub.
20. **Any paired device can revoke every other device and change daemon-wide settings** (providers, addresses). Acceptable while each daemon has only its own user's devices; admin roles are Phase 4. Sources: multi Q4, models Q3.
21. **Push targets one device per daemon and carries no serverId**; each daemon needs outbound access to `exp.host`. Push receipts and `DeviceNotRegistered` are not handled. Source: multi Q5.
22. **`bots.create` rejects the default `thinkingLevel: 'off'` for some models** (Opus 5.5): anything provisioning default bots must send it. Source: container 3.
23. **Keep the 512 MiB limit per daemon** until server measurements exist; a heavy tool run adds to the base, and `orbs pair` runs a second Bun of about 110 MiB in the same cgroup. `apt`, `npm -g` and `pip` by bots fail under a read-only root and no root user. Sources: container 5, hetzner Q4, PR #4.
24. **A `?code=` link pairs automatically in every mode** (PR #2): in single-daemon mode a crafted link can pair an unpaired browser to another server without a click. Source: review finding 7.
