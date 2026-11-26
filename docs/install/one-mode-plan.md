# One way to install: the plan

Status: decided by the owner on 2026-11-14; most pieces are merged. The plan below is kept as written (base: `team-workspace` at `15fe6296`), so its line numbers and "today" describe the code before the work.

## Decided

The owner's answers to the questions in section 5:

1. **Phone and desktop:** later, with the client work. The desktop app becomes a window on the install's address. Mobile logs in once in a web view, gets a device token, then uses native requests. Until then, the PWA. Nothing that this needs is removed now: device tokens, `pairing.bootstrap` and `pairing.redeem` stay.
2. **Login:** Cloudflare Access only, for now. Superseded on 2026-11-26: the Laravel API, with Sanctum sessions, is the only login, and Cloudflare Access is gone; the Cloudflare Tunnel stays an optional transport ([install](install.md#logins)).
3. **Development:** through a local hub with a dev-only identity (piece G). PINs went with G.
4. **Sandbox in development:** yes, against the recommendation. Built as an opt-in flag, `bun run dev:web --sandbox`.
5. **Onboarding flow:** removed.
6. **Hosts:** Linux only for now. Mac and Windows later, if easy (probably through a Linux VM). Nothing is built for them.
7. **Native product surfaces** (`start --detach`, `service`, `backup`, `server.tar.gz`): removed.

The owner also approved the text of section 6 for `AGENTS.md` and `architecture.md`. Piece E applied it, with the development sentence corrected to what piece G built (`bun run dev:web` prints a login link; there is no `dev:pair`).

What is merged into `team-workspace`:

| Piece | Pull request | Note |
| --- | --- | --- |
| A. Daemon product CLI, backup, release tarball | #72 | `vinci pair` stays: the desktop app and the iOS dev app use it |
| B. Image guards | #74 | |
| C. Onboarding removal | #73 | |
| D. Solo install proof | none | No new server proof; the "Just me" section of `install.md` uses the memory numbers already there |
| G. Development through a local hub | #75, #76 | #76 adds `--sandbox` |
| H. Unconditional refusals | #77 | |
| I. One web app | #78 | Partial: pairing a device, Settings → Server and the connect page's PIN form stay for the desktop app until K |
| E. Docs and guidance | this document's pull request | |

Left, with the client work: J (server addresses and PIN UI), K (desktop as a pure client), L (mobile as a team client).


## Summary (read this first)

**The rule.** Vinci installs one way: Docker, with the hub, the admin panel and a sandbox per person. A solo person installs the same thing and is its only admin and only user. The native daemon stays only for development.

**What goes.**
- The daemon's product CLI: `start --detach`, `service register|unregister` (macOS launch agent), `backup create|restore` and the backup service behind it. Team backups already use `tar` in `deploy.ts`.
- The `server.tar.gz` release file ("the daemon and web app for a Mac without the desktop app").
- Server addresses as a product: LAN and Tailscale detection, custom addresses, Settings → Server (web, mobile, `packages/ui`).
- The onboarding flow. The hub already completes onboarding before a person's first visit, so no installed user ever sees it.
- PIN pairing as something a person does: the PIN form, QR codes, Settings → Devices → Pair, mobile scan and pair screens, `pairing.create`.
- Later, with the client work: the desktop app's embedded daemon and web server, and the mobile app's server picker.

**What stays.**
- Device tokens and the pairing service inside the daemon. The hub uses them: on a first visit it asks the owner socket for a grant (`pairing.bootstrap`) and the browser redeems it (`pairing.redeem`). This is invisible to the person.
- The public door (the hub forwards to it) and the owner socket (admin panel, hub grants, global settings).
- Provider logins with subscriptions (OAuth) in a person's own app. Each daemon has one person, so this is not a shared subscription.
- The native daemon for `bun run dev`. It needs a way in for the developer's browser (today `bun run dev:pair`) and runs tools without a sandbox.

**The hard question.** Once PINs go, how does a phone or the desktop app prove who it is? Cloudflare Access is the login, and every request must pass it. A browser handles this by itself. A native app does not. Recommendation: the desktop app becomes a window on the team address and logs in like a browser (no server work). Mobile uses the PWA now; the native iOS app later logs in to Access inside an in-app web view and keeps the cookie. Options and costs are in [The hard question](#the-hard-question-how-native-clients-prove-who-they-are).

**The second hard question.** Cloudflare Access is a hard requirement today: the hub does not start without it. A solo person with no domain has no way in. Options are in [What a solo person does](#what-a-solo-person-does).

**The order.**
1. Now, in parallel: daemon CLI and backup removal (A), image guards (B), onboarding removal (C, after question 5), solo install proof (D), docs (E, last).
2. After the owner answers question 3 (how development runs): dev through a local hub (G), then the refusals and team branches become unconditional (H, I).
3. With the client work: server addresses and PIN UI (J), mobile (L), desktop after the Apple Developer enrollment (K).

## 1. Inventory and verdicts

Verdicts: **remove**; **keep: dev** (development needs it); **keep: team** (the Docker install uses it too); **change**.

### Flags and branches

| Item | Where | Count | Verdict |
| --- | --- | --- | --- |
| `DAEMON_TEAM` env | `packages/env/src/types/env-server.types.ts:17`, default `false`; set `'true'` in `deploy/compose/daemon.yaml:31` and `apps/hub/tests/support/hub.fixture.ts:182` | 1 schema, 2 setters | **change**: remove once dev runs through a hub (G, H). Until then, keep. Flipping the default to `true` is the cheap halfway step (question 3). |
| `isTeam` threaded through | `apps/daemon/src/core/core.native.ts:230,275`; `packages/server/src/types/core.types.ts:31`; `types/rpc.types.ts:49,80`; `core/core.services.ts:42,95`; `packages/runtime/src/types/runtime-bot-tools.types.ts:22`; `runtime-action.register-bot-tools.ts:6,16`; `runtime-bot-tools.extension.ts:99` | 11 lines, 8 files | **change** with H: gone when refusals are unconditional |
| `rpcTeamRefuse` (`TEAM_MANAGED` on the public door) | `packages/server/src/rpc/rpc-team.utils.ts:5`; called in `rpc.bots.ts` (2), `rpc.secrets.ts` (3), `rpc.credentials.ts`, `rpc.limits.ts`, `rpc.mcp.ts`, `rpc.models.ts`, `rpc.tools.ts` (1 each) | 10 call sites, 7 files | **keep: team**, **change** to unconditional (only `isLocal` bypasses). The owner socket keeps every change for the admin. |
| `bot_mcp_add` with a command refused | `runtime-bot-tools.extension.ts:99-100` | 1 | **change**: unconditional with H |
| `TEAM_MANAGED` in the contract | `packages/contracts/src/rpc/rpc.router.ts:151` (`ocTeam`), on 10 procedures; `packages/errors/src/types/errors.types.ts:37`; `packages/client/src/services/query/query.client.ts:12`; i18n `ui_team_managed` | 10 procedures | **keep: team** |
| Web team detection | `apps/web/src/hooks/use-team.ts` (`isTeam: team !== null`), `services/team/team.client.ts` (null without `WEB_HUB_URL`) | `useTeam()`/`teamQuery()` 17 uses in 13 files | **change** with I: the app is always the team app; `useTeam` keeps only `isAdvanced` and `followsGlobal` |
| Single-owner-only UI branches | `settings-dialog.tsx:64,69,121,128,220,227` (lab links footer, secrets mode, pair button); `settings-tools.tsx:48,54,56`; `bot-form-section.tsx:42,44` (permission select); `bot-dialog.tsx:89`; `bot-form-skills.tsx:62`; `bot-mcp.tsx:20`; `rooms-details-bot.tsx:75`; `settings.utils.ts:23-24`; `settings.constants.ts` `SETTINGS_TEAM_HIDDEN` | 17 branches, 9 files | **remove** the `!isTeam` side with I |
| `/lab/avatars`, `/lab/chat` links | settings footer, single-owner only | 2 links | **keep: dev**, **change**: show only in a dev build |
| Sidebar foot: app name and server address | `apps/web/src/components/layout/layout-nav-device.tsx:28,54` | 1 branch | **remove** the address side with I |
| Sandbox optional | `DAEMON_SANDBOX_DIR` optional; `isSandboxed`/`sandboxDir` in 19 files (runtime 12, server 4, secret-proxy 3) | ~40 lines | **keep: dev** (native dev runs tools in the daemon, decision row "Bot tools run in one sandbox container…"). **change** the image: refuse to start without it (B). |
| Firewall wait optional | `deploy/docker/vinci.sh:7` (`VINCI_WAIT_FOR_FIREWALL`) | 1 | **change**: unconditional in the image when no args are given (B) |
| `DAEMON_PUBLIC_URLS` branch of first pairing | `core.native.ts:493-496` ("run `vinci pair` in the container") | 1 | **remove** (A): a daemon image without a hub is not a product any more |

### Pairing, doors and connect

| Item | Where | Verdict |
| --- | --- | --- |
| Auth service: `pair`, `redeem`, `authenticate`, `devices`, `revoke`, `grant` | `packages/server/src/services/auth/` (11 files) | **keep: team**. Device tokens are how the daemon knows a browser the hub already let in. |
| `pairing.bootstrap` (owner socket only) | `rpc.pairing.ts`, `auth-action.bootstrap.ts` | **keep: team** (hub `pairing-action.grant.ts:24`) and **keep: dev** (`dev:pair`) |
| `pairing.redeem` (public) | `rpc.pairing.ts`; web `connection.client.ts:60`; mobile `connection.client.ts:39` | **keep: team** (the browser redeems the hub's grant) |
| `pairing.create` (a paired device issues a PIN) | `rpc.pairing.ts:4`; `packages/client/src/hooks/use-settings-devices.ts:8`; PIN and QR in `packages/ui/src/components/settings/settings-devices.tsx:83,88`; already hidden in team (`canPair`) | **remove** with J, unless question 1 picks "pair a phone from a logged-in browser" |
| Startup PIN and QR | `core.native.ts:484-517` `coreNativeFirstPairing`: team branch, public-URL branch, PIN branch | **keep: dev** the PIN branch until G; **remove** the other two (A, H) |
| `vinci pair` / `bun run dev:pair` | `core.native.ts:520-532`; `apps/daemon/package.json` `dev:pair`; root `dev:pair` | **keep: dev** until G; then **remove** |
| Web connect page | `apps/web/src/routes/connect/connect.tsx`, `components/connect/connect-form.tsx` (171 lines, PIN form plus hub "Opening your workspace") | **change**: keep only the hub path (auto redeem, **Try again**). The PIN form stays only while dev uses PINs. |
| Hub first-visit grant | `apps/hub/src/core/core-pairing.native.ts`, `services/pairing/` | **keep: team** |
| Public door vs owner socket | `rpc.procedures.ts` (`baseRouter`, `ownerRouter`, `localRouter`), `rpc-local.utils.ts` allowlist | **keep: team**. Allowlist entry `server.configure` goes with J. |
| Web server's address picker | `apps/web/src/application/server.bun.ts:17,83-88` (`LOCAL_DAEMON`, `connectionTarget`), `services/connection/connection.utils.ts:52-85`, `rpc.client.ts:17-19` | **change** after K: production web always has a hub, so `/rpc` on the web server is always 404 and SSR always goes to `WEB_HUB_URL` (make it required). Dev uses Vite's proxy (`vite.config.ts:16-28`). Wait for K: the desktop app still embeds this server. |

### Server addresses and settings

| Item | Where | Verdict |
| --- | --- | --- |
| LAN and Tailscale detection | `packages/server/src/services/server/server-network-query.addresses.ts` (56 lines), `SERVER.tailscaleBinaries` | **change** with J: return `DAEMON_PUBLIC_URLS`, else loopback. Waits for L: a real phone on dev today reaches the dev daemon by LAN or Tailscale address. |
| Custom addresses | `server-action.configure.ts`, `server.configure` RPC, contract `serverConfigure`, owner-socket allowlist | **remove** with J |
| Settings → Server | `packages/ui/src/components/settings/settings-server.tsx` (89), `packages/client/src/hooks/use-settings-server.ts`, web section `server` (already hidden in team), mobile `settings-server.tsx` (87), `settings-server-address-screen.tsx` (88), route `app/settings/server/address.tsx`; 13 `settings_server*` keys | **remove** with J (web now, mobile with L) |
| `server.info` | `rpc.server.ts` | **keep: team** (server ID check in `validateConnection`, pairing payload) |
| Limits per device | `rpc.limits.ts`, admin form | **keep: team** (admin sets them) |
| Permission modes, approval rules, secrets mode | server keeps; app hides them in team | **keep: team** (admin panel); app side **remove** with I |

### Onboarding

| Item | Where | Verdict |
| --- | --- | --- |
| Web onboarding | `routes/onboarding/onboarding.$step.tsx`, 7 files in `components/onboarding/`, redirect in `routes/chat.layout.tsx:33-37` | **remove** (C). The hub completes onboarding before the first grant (`pairing-action.grant.ts:28`); provisioned people never see it. |
| Shared onboarding scenes | `packages/ui/src/components/onboarding/` | **remove** (C) |
| Mobile onboarding | `apps/mobile/src/app/onboarding/[step].tsx`, `emoji.tsx`, `hooks/use-onboarding-gate` | **remove** (C) |
| Onboarding RPC | `rpc.onboarding.ts`, `services/onboarding/`, owner-socket allowlist `onboarding.*`, hub's `socket.onboarding.complete()` | **remove** (C), or keep `state` if a client still gates on it |
| Screenshots | `scripts/web.ts screenshots`, `apps/web/public/img/onboarding/`, README image | **remove** (C) |
| Copy | `packages/i18n/messages/en/onboarding.json` (48 keys) | **remove** (C) |

### Provider logins

| Item | Where | Verdict |
| --- | --- | --- |
| OAuth subscription logins in the person's app | `providerAuthType` `['api_key','oauth']`; app shows both; admin panel shows API keys only (`SETTINGS_ADMIN_AUTH_TYPES`) | **keep: team**. A subscription logs in to one person's own daemon; it is not shared (decision row "Models: …each user's own API keys"). Global settings cannot carry OAuth logins (gotcha 69). |
| Env keys for everyone | `deploy/compose/daemon.yaml` `*_API_KEY` | **keep: team** |

### Daemon CLI and native install

| Item | Where | Verdict |
| --- | --- | --- |
| `start --detach` | `core.native.ts:536-570` `coreNativeDetach`, `daemon.log` | **remove** (A) |
| `service register|unregister` (launch agent `bots.daemon.<hash>`) | `core.native.ts:572-619` | **remove** (A) |
| `backup create|restore` | `core.native.ts:621-631`; `packages/server/src/services/backup/` (5 files), `types/backup.types.ts`, export in `entry.native.ts:2`; `apps/daemon/package.json` `backup`; root none | **remove** (A). Team backups are `tar` in `deploy.ts:781-800`. |
| `start` (foreground) | `apps/daemon/package.json` `start`; root `start:daemon` | **keep: team** (image entrypoint runs it) |
| `HELP` text | `core.native.ts:58-70` | **change** (A): `start`, `pair` only |
| systemd units | only `deploy.ts` (disk mounts at boot) | **keep: team** |
| `server.tar.gz` release | `scripts/release.ts:120`, README "Release" | **remove** (A) |
| Server bundle | `scripts/desktop.ts:88-146` `bundle()`, used by `deploy/docker/Dockerfile:19` | **keep: team**, **change** with K: move to `scripts/deploy.ts images` once the desktop app stops shipping a server |

### Desktop app (later, after Apple Developer enrollment)

| Item | Where | Verdict |
| --- | --- | --- |
| Embedded daemon and web server | `apps/desktop/src/desktop-server.ts` (262 lines: start, adopt, leftovers, pair link) | **remove** (K) |
| Ports and data dir | `desktop.constants.ts:12-14` (`port 47190`, `portCount 10`, `daemonPortOffset 100`), `:30` `dataDir ~/.config/vinci/`, `:32` dev entries | **remove** (K) |
| Network: Tailscale, Bonjour find and advertise, probe | `desktop-network.ts` (204 lines), `DESKTOP.find` `_bots._tcp` | **remove** (K); keep a single probe of the team address |
| "This Mac / Another Mac", tray server items, `network: local/lan/tailscale` | `desktop.ts` (746 lines; local branches at 54-88, 170, 409-415, 443-505, 709), `desktop-settings.ts` | **change** (K): one setting, the team address |
| Update flow | `desktop-update.ts` (164), `DESKTOP_UPDATE_URL`, `publish:desktop` | **keep** (client updates) |
| Launch at login, notifications, window | `desktop-launch.ts`, `desktop-notify.ts`, `desktop-window.ts` | **keep** |
| Dev wiring | `apps/desktop/package.json` `dev:app` (`DATA_DIR`, `DESKTOP_WEB_DEV`), `turbo.json` `dev:app` with `@repo/daemon#dev` | **change** (K) |
| Web desktop shell bits | `settings-desktop.tsx` (server status, "Change"), connect auto-submit in the shell, 13 files test `__electrobunSendToHost` | **change** (K): keep update toast and notifications, drop server status |
| Copy | `desktop.json` (70 keys) | about half **remove** (K) |

### Mobile app (later)

The mobile app has no team awareness at all (no `TEAM_MANAGED` handling beyond the shared client, no whoami, no Access). It cannot reach a team install today.

| Item | Where | Verdict |
| --- | --- | --- |
| Connect form and intro | `components/connect/connect-form.tsx` (166), `connect-intro.tsx` (64), `app/connect.tsx` | **change** (L) per question 1 |
| Pair and scan | `settings-devices-pair.tsx` (98), `-pair-screen.tsx` (45), `-scan-screen.tsx` (110), routes `settings/devices/pair.tsx`, `scan.tsx` | **remove** (L) |
| Address learning | `services/connection/connection.client.ts:53-60` (`connectionAddressesMerge`, `Learn`) | **remove** (L) |
| Server settings | see Server addresses | **remove** (L) |

### Docs and guidance

| Item | Verdict |
| --- | --- |
| `README.md`: tagline "Your own bots, on your own Mac", intro, Download, Run it locally step 3, iPhone, Desktop app, The `vinci` command, Release (server tarball), Container images ("pair it with `docker exec … vinci pair`") | **change** (E): product = Docker install; "Run it locally" = development |
| `docs/install/README.md`, `install.md` | **change** (D, E): add the solo case |
| `.agents/references/api.md`: Daemon and storage (CLI), Connection (addresses, PIN), Team daemon refusals ("in a team daemon"), line 163 ("single-owner app") | **change** (E, with each piece) |
| `.agents/references/team-workspace.md`: Design ("unchanged single-owner daemon"), 11 "single-owner" mentions, gotcha 198 | **change** (E): add one decision row at the end |
| `AGENTS.md` (`CLAUDE.md` links to it) | **change**, owner approval; text in section 6 |
| `.agents/references/architecture.md` section 1, System diagram ("Owner's computer", desktop "starts or finds"), entry table (daemon "start, pair, service"; `entry-backup.native.ts` listed but no such file; desktop "local or remote server") | **change**, owner edits it (rule 1 of that file); text in section 6 |
| `docs/desktop-release.md` | **keep** |

### Tests and fixtures

| Item | Verdict |
| --- | --- |
| `apps/hub/tests/support/hub.fixture.ts`: spawns native daemons with `DAEMON_TEAM: 'true'`, a fake Access key server, the hub and web | **keep: dev**. It is the model for G. Drop the flag with H. |
| `hub-relay.test.ts:170`, `hub-global.test.ts:332` expect `TEAM_MANAGED` | **keep** |
| Other test suites | none; only `apps/hub/tests` exists |
| `scripts/web.ts` screenshots (throwaway single-owner daemon) | **remove** with C |

## The hard question: how native clients prove who they are

Today: Cloudflare Access sits in front of the hub. The hub reads `cf-access-jwt-assertion` or the `CF_Authorization` cookie (`apps/hub/src/core/core-server.native.ts:22-23,85`) and maps the email to a daemon. The daemon then wants a device token (`Authorization: Bearer`). A browser gets both by itself. A native app gets neither: Access answers it with a login page.

| Option | How | Cost | Risk |
| --- | --- | --- | --- |
| **A. Desktop is a browser window** (recommended for desktop) | The desktop app opens the team address in its web view. Access logs in there (email code); the hub auto-pairs. | No server work; part of K | The web view must keep cookies across launches; the Access session length is the admin's Access setting |
| **B. Mobile uses the PWA** (recommended now) | Add the team address to the home screen | None | No native app; PWA push is Phase 7 |
| **C. Native app, in-app Access login** (recommended later) | The app opens the team address in a `WKWebView`, Access and the hub run as in a browser; the app reads `CF_Authorization` and the `bots.connection` device token from the web view, then sends both on `fetch` and the WebSocket upgrade | Medium: mobile connection rewrite, re-login on expiry, a cookie native dependency (iOS dev rebuild) | Reading cookies from a web view is fragile across iOS versions |
| D. Cloudflare Managed OAuth (Phase 7 plan) | Proper OAuth for native apps | Larger: Managed OAuth uses `Authorization: Bearer`, so the device token must move to another header in every client, the daemon and the hub first (gotcha 18) | Depends on a Cloudflare feature's maturity |
| E. Access service token per device | Machine credentials | Small code | Decided against: needs "Service Tokens: Edit", and breaks "one list of people" (decision row) |
| F. A bypass hostname with PIN pairing | Native apps skip Access; device token only | Medium: hub must route by device token, not email | Puts PIN redemption and every daemon's public door on the internet without Access. Not recommended. |

Whatever is chosen, the device token stays: Access proves the person, the token proves this device to that person's daemon, and the person can revoke it.

## What a solo person does

**Today, with Cloudflare** (works now, no code):
1. One small Linux server with Docker (Ubuntu 24.04). Guess: 2 GB of memory (template ~240 MiB, one person ~200 MiB, web ~226 MiB, hub ~91 MiB, firewall, provisioner, sandbox; gotcha 89, emulated numbers). Prove it in D.
2. A domain on Cloudflare and Cloudflare Zero Trust's free plan.
3. `users.yaml`: their own email under both `admins:` and `users:` (install.md step 4 allows this).
4. Follow `install.md` as written. They log in with an email code, the hub pairs the browser, `/admin` is theirs.
5. Overhead they carry: the hidden template workspace (global settings), the provisioner, the firewall. All are cheap; removing the template for one person is not worth a second code path.

**Their own computer.** `deploy.ts` needs a Linux host with root: it loop-mounts each sandbox disk (`deploy.ts:342-375`), installs a systemd unit, and the firewall container manages iptables. A Mac can run it only inside a Linux VM (for example an OrbStack machine, or Docker on a Linux VM). Images build for `linux/arm64` with `--platform`. Supporting macOS Docker directly is out of scope (question 6).

**Is Cloudflare a hard requirement?** Yes. The hub refuses to start without `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` and `HUB_PUBLIC_URL` (`apps/hub/src/core/core.native.ts:36`); Compose requires them and `TUNNEL_TOKEN`; keys come from `<team domain>/cdn-cgi/access/certs` (`access.constants.ts`). There is no other way in.

**Login without Cloudflare: options** (none designed here):

| Option | What exists | What to build | Cost and risk |
| --- | --- | --- | --- |
| 1. Keep Cloudflare only (recommended now) | everything | nothing | A domain (~10 USD a year) and a Cloudflare account |
| 2. Any OIDC/JWT gate ("bring your own reverse proxy") | The hub's check is already a generic RS256 JWT check: issuer, audience, expiry, keys from a URL | Env for the keys URL and the header/cookie name; Tunnel optional in Compose; docs for one proxy (for example oauth2-proxy or Pomerium) | Small-medium. The hub must be reachable only through the proxy; today the Tunnel guarantees that, then the user must. |
| 3. Tailscale identity | nothing | Trust `Tailscale-User-Login` from `tailscale serve` on the same host | Small. Header trust: anything else that reaches the hub could forge it. Phones need Tailscale. |
| 4. Local only, one fixed identity | the hub fixture's fake key server | Hub bound to `127.0.0.1` with a fixed email | Small. Every local process is the owner; no phone. Shares code with G. |
| 5. Passwords or passkeys in the hub | nothing | A new auth system | Large; against the rule "no password login". Not recommended. |

## 4. Work breakdown

Each piece owns its files. No two pieces in the same step touch the same file.

### Step 1: safe now, in parallel

**A. Daemon product CLI, backup and release tarball.**
- Scope: remove `start --detach`, `service`, `backup`, the `DAEMON_PUBLIC_URLS` first-pairing branch; shorten `HELP`; remove the backup service; drop `server.tar.gz`.
- Files: `apps/daemon/src/core/core.native.ts`, `apps/daemon/package.json` (`backup`), `packages/server/src/services/backup/*`, `packages/server/src/types/backup.types.ts`, `packages/server/src/entry.native.ts`, `scripts/release.ts`.
- Wins: about 130 lines in the daemon, the backup service, one release file.
- Risks: someone uses `vinci backup` on a dev data dir (copy the folder instead).
- Proof: `bun run check`, `bun run lint`, `bun run lint:dead`, hub suites; `bun run dev:web` still starts and `dev:pair` still prints a PIN.
- Owner first: question 7.

**B. Image guards.**
- Scope: the daemon image refuses to start without `DAEMON_SANDBOX_DIR`; firewall wait always on for the entrypoint without args.
- Files: `deploy/docker/vinci.sh`, `deploy/docker/Dockerfile` (comments), `scripts/deploy.ts` (drop setting `VINCI_WAIT_FOR_FIREWALL` if it becomes default).
- Risks: `docker exec … vinci <cmd>` must stay unblocked (args given).
- Proof: one image build in `docker:dind`, `apply` with one person, daemon healthy; a bare `docker run` of the image exits with a clear message.

**C. Onboarding removal.**
- Scope: everything in the Onboarding table.
- Files: `apps/web/src/routes/onboarding/`, `apps/web/src/components/onboarding/`, `apps/web/src/routes/chat.layout.tsx`, `packages/ui/src/components/onboarding/`, `apps/mobile/src/app/onboarding/`, `apps/mobile/src/hooks/use-onboarding-gate*`, `apps/mobile/src/app/_layout.tsx`, `packages/server/src/rpc/rpc.onboarding.ts`, `packages/server/src/services/onboarding/`, contract `onboarding`, `rpc-local.utils.ts` (`onboarding` line only), `apps/hub/src/services/pairing/pairing-action.grant.ts`, `scripts/web.ts`, `apps/web/public/img/onboarding/`, `packages/i18n/messages/en/onboarding.json`.
- Wins: about 20 files and 48 keys.
- Risks: a fresh dev data dir then has no first-run model step; the developer uses Settings → Providers.
- Proof: check, lint, hub suites (first visit still lands in chat), mobile `tsc`.
- Owner first: question 5.

**D. Solo install proof.**
- Scope: install by `install.md` with one email as admin and user on a fresh small server or a `docker:dind` box; measure memory; write a "Just me" section.
- Files: `docs/install/install.md` only.
- Proof: login, first chat with a mock model, `/admin` reachable, `docker stats` numbers in the doc.
- Owner first: whether to rent a 2 GB server (memory note: test server may be wiped or another opened).

**E. Docs and guidance.** Merge last in step 1.
- Files: `README.md`, `docs/install/README.md`, `.agents/references/api.md`, `.agents/references/team-workspace.md` (one decision row at the end).
- Then `bun run agents:sync`. `AGENTS.md` and `architecture.md` only after the owner approves section 6.

### Step 2: after question 3

**G. Development through a local hub.**
- Scope: `bun run dev:web` starts the native daemon, the native hub and Vite in hub mode, with a dev-only identity: a key server that signs a JWT for one dev email, as `hub.fixture.ts` already does. The browser is paired by the hub like in production. `dev:pair` and the startup PIN go.
- Files: root `package.json`, `turbo.json`, `apps/daemon/package.json`, `apps/hub/package.json`, `apps/web/vite.config.ts`, one new dev script (needs an architecture line: new file kind).
- Risks: the dev identity must never ship: keep it in a dev-only script, not in the hub image.
- Proof: fresh dev data dir, open `http://localhost:47190`, land in chat without a PIN; hub suites.

**H. Unconditional refusals.** After G.
- Scope: remove `DAEMON_TEAM` and `isTeam` (11 lines, 8 files); `rpcTeamRefuse` drops its `isTeam` test (10 call sites keep calling it); the runtime refusal; compose and fixture lines; remove the remaining first-pairing code.
- Files: `packages/env/…/env-server.types.ts`, `apps/daemon/src/core/core.native.ts`, `packages/server/src/{core,types,rpc}/…`, `packages/runtime/src/{types,services/runtime}/…`, `deploy/compose/daemon.yaml`, `apps/hub/tests/support/hub.fixture.ts`.
- Proof: hub suites (`TEAM_MANAGED` tests still pass), check, lint.

**I. One web app.** After G; parallel with H.
- Scope: the always-team app: `useTeam` keeps `isAdvanced`/`followsGlobal`; remove the `!isTeam` branches (17 in 9 files), `SETTINGS_TEAM_HIDDEN`, `settingsIsTeamVisible`; connect page keeps the hub path only; sidebar foot; lab links only in dev.
- Files: `apps/web/src/**` except `application/server.bun.ts` and `services/rpc/rpc.client.ts` (K owns those).
- Proof: check, lint, hub suites (web in hub mode), screenshots of settings, bot dialog, connect page.

### Step 3: with the client work

**J. Server addresses and PIN UI.** With L.
- Files: `packages/server/src/services/server/*`, `rpc.server.ts`, `rpc.pairing.ts` (`create`), contract `server.configure` and `pairing.create`, `rpc-local.utils.ts` (`server.configure`), `packages/ui/src/components/settings/settings-server.tsx`, `settings-devices.tsx` (pair panel), `packages/client/src/hooks/use-settings-server.ts`, `use-settings-devices.ts`, i18n `settings.json` keys.
- Wait: real-phone dev needs LAN addresses until L lands.

**K. Desktop as a pure client.** After the Apple Developer enrollment.
- Files: `apps/desktop/**`, `scripts/desktop.ts` (move `bundle` out), `scripts/deploy.ts images` and `deploy/docker/Dockerfile:19` (take `bundle`), `apps/web/src/application/server.bun.ts`, `apps/web/src/services/rpc/rpc.client.ts`, `apps/web/src/services/connection/connection.utils.ts`, `settings-desktop.tsx`, `desktop.json`.
- Wins: ~470 lines in two desktop files, much of `desktop.ts`, the address picker in the web server.
- Proof: desktop opens the team address, logs in through Access, survives a restart; images still build.

**L. Mobile as a team client.** Per question 1.
- Files: `apps/mobile/src/**`.
- Proof: iOS dev build (native dependency: rebuild), login against a test install.

### Wins at a glance

- `DAEMON_TEAM` and `isTeam`: gone (11 lines, 8 files); refusals unconditional at 10 call sites.
- Web: 17 single-owner branches and one settings section gone.
- Daemon: CLI down to `start` and (until G) `pair`; backup service gone.
- Onboarding: ~20 files and 48 keys gone.
- Desktop: embedded server, Bonjour and Tailscale code gone.
- Image: sandbox and firewall wait always on.
- What stays conditional on purpose: `DAEMON_SANDBOX_DIR` (native dev has no sandbox).

## 5. Questions for the owner

1. **How do phone and desktop log in?** Recommended: desktop is a window on the team address (option A); mobile uses the PWA now and an in-app Access login later (B, then C). Cost: none now; C is a medium mobile piece with a native dependency.
2. **Login without Cloudflare for solo people?** Recommended: Cloudflare only for now; later, if wanted, a generic JWT gate (option 2). Cost: a domain for every solo person now; option 2 is a small-medium hub and docs piece.
3. **How does development run?** Recommended: through a local hub with a dev-only identity (G), so the refusals and the web app have one path and PINs disappear. Cost: one dev script and an architecture line; dev starts three processes instead of two. Cheaper halfway: flip `DAEMON_TEAM` to default `true` and keep PINs in dev (keeps two web paths).
4. **Sandbox in development?** Recommended: no; native dev keeps running tools in the daemon. Cost: the `isSandboxed` branches stay (~40 lines). The alternative needs Docker for every dev run.
5. **Remove the onboarding flow?** Recommended: yes; the hub already skips it. Cost: no first-run model step in a fresh dev data dir.
6. **Which hosts does a solo install support?** Recommended: a Linux server or a Linux VM; no direct macOS Docker. Cost: Mac owners run a VM.
7. **Remove the native product surfaces now (`start --detach`, `service`, `backup`, `server.tar.gz`)?** Recommended: yes (piece A). Cost: anyone with a native install loses those commands; nothing in production uses them.

## 6. Proposed text for `AGENTS.md` (owner approval needed)

`CLAUDE.md` is a link to `AGENTS.md`. Not edited in this task.

Description, replacing the first paragraph:

> A bot backend. Vinci installs one way: Docker, with a hub (`apps/hub`) that takes identity from Cloudflare Access, an admin panel, and per person one daemon and one sandbox. A person on their own installs the same thing and is its only admin and user. Each daemon serves one owner and runs each bot as a persistent Pi Durable agent. The web (`apps/web`), iOS (`apps/mobile`) and macOS and Linux (`apps/desktop`) apps are clients of the install and talk over oRPC through the hub. The native daemon runs only for development.

Rules, replacing the pairing rule:

> - Each daemon has one owner: the person the hub routes to it. No users, organizations, roles or password login inside a daemon. Devices get a token only through a pairing grant the hub issues after login (in development: `bun run dev:pair`). The hub and the admin panel use the owner-only daemon socket. Public transport cannot issue local grants. CLI commands reuse running services; only startup opens stores.
> - Build no product feature for a native install. The native daemon exists for `bun run dev`; keep it working, nothing more.

Read first, replacing the team line:

> - For the install (hub, containers, deployment), read `.agents/references/team-workspace.md`; keep it and `docs/install/` current when that work changes.

If question 3 is answered "through a hub", the `dev:pair` rule changes to: "`bun run dev:web` starts the daemon, the hub and the web app; open `http://localhost:47190` and you are signed in as the dev user."

`architecture.md` section 1 (the owner edits this file), proposed first paragraph:

> Vinci is a bot backend installed with Docker. One hub per install takes identity from Cloudflare Access and routes each person to their own daemon, in its own container next to their sandbox. Each daemon serves one owner and runs each bot as a persistent Pi Durable agent. Web, iOS and macOS apps are clients of the install.

Also in that file: the System diagram's "Owner's computer" and desktop "starts or finds" go; the entry table's daemon row becomes "the `vinci` CLI: start (and pair in development)"; the `entry-backup.native.ts` row goes (no such file exists today); the desktop row becomes "the macOS and Linux app: a window on the install, tray, updates".
