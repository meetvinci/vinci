# 🤖 Vinci

> Your own bots, on your own server. For a small team, or just for you.

Vinci installs one way: on a Linux server, with Docker. Each person gets their own Vinci in its own container, and their bots' commands run in a second one, their sandbox. Each bot is a persistent [Pi](https://github.com/earendil-works/pi) agent with its own conversation, tools, skills and memory, and it keeps working when you close the app. Everyone uses one web address: Cloudflare Access handles the login, and a hub sends each person to their own bots. An admin panel adds people and sets up their keys, bots and settings. A person on their own installs the same thing and is its only admin and only user.

## ⬇️ Install

Start with the [install overview](docs/team-workspace/README.md), then follow the [install guide](docs/team-workspace/install.md). You need a Linux server with Docker, a domain on Cloudflare and a model API key. On your own? See [Just me](docs/team-workspace/install.md#just-me).

It is a first version, meant for people who trust each other: see the warning in the [overview](docs/team-workspace/README.md).

People open the install's address in a browser, or add it to their phone's home screen and dock: see [Install the app](docs/team-workspace/install-app.md).

The macOS app in this repository's GitHub Releases still runs a daemon of its own. It will become a window on your install; until then, it is not a way to install Vinci.

## ✨ Features

- 💬 **Persistent bots.** Give a bot a name, an avatar, instructions and a model. Its conversation survives restarts, and work in progress resumes on its own.
- 🔌 **Any model Pi can reach.** The admin gives each person an API key for Anthropic, OpenAI or another provider. An advanced user can also log in to their own subscription, such as OpenAI Codex, Claude or Grok, from Settings.
- 🧰 **Skills, MCP and plugins.** Bots inherit your agent skills, instructions and MCP servers, and you can add more per bot. Pick a skill from the composer with `/`.
- 🤝 **Bots talk to each other.** A bot can message another bot, wait for the answer and pass it on, up to three bots deep. Bots can also start subagents in the foreground or background.
- ✅ **Approvals.** The admin gives each bot a permission mode: read-only, ask, auto or full. Auto lets [Jev](https://typesafe.ai) approve safe calls and asks the person about the rest, using plain-language rules.
- 🔑 **Secrets without leaks.** A bot can ask you for an API key. You type it once, it is stored encrypted, and the bot only ever sees a placeholder that a proxy swaps for the real value.
- 📎 **Files, questions and reactions.** Attach files and images, answer a bot's multiple-choice questions, and react to messages.
- ⏰ **Routines.** Schedule a bot to run on its own; results land in its chat.
- 📊 **Artifacts.** Bots build documents, charts and HTML pages you can open and edit from the artifacts page.
- 📱 **On your phone.** Add the install's address to your home screen: it installs as an app with push notifications. Native iOS and macOS apps that log in to the install are planned.
- 🛡️ **Admin panel.** Add and remove people, give them model keys, and set up their bots and shared settings at `/admin`.
- 💾 **Backups.** The admin backs up every person's bots, files and database every night, with an optional encrypted off-site copy.

## 🧰 Built with

[Bun](https://bun.sh) · [Turborepo](https://turborepo.com) · [Pi Durable](https://github.com/earendil-works/pi) · [oRPC](https://orpc.dev) · [TanStack Start](https://tanstack.com/start) · [Expo](https://expo.dev) · [Electrobun](https://electrobun.dev) · SQLite · [Paraglide](https://inlang.com/m/gerre34r/library-inlang-paraglideJs)

## 🚀 Develop locally

This runs Vinci from source for working on it. It is not a way to install it: the native daemon exists only for development.

**You need:** [Bun](https://bun.sh) 1.4 on macOS. The iOS app also needs Xcode.

**1. Install**

```bash
git clone git@github.com:ijpatricio/orbs-bot.git vinci && cd vinci
bun install
cp .env.example .env
```

The defaults in `.env.example` work as they are.

**2. Start Vinci**

```bash
bun run dev:web
```

Development runs like a real install: your daemon behind a local hub. This starts a dev door on http://localhost:47190, the daemon on 47191, the hub on 47192 and the web app (Vite) on 47193. Dev data lives in `~/.config/vinci-dev` (the hub's in its `hub/` folder), apart from a real install in `~/.config/vinci`.

**3. Open it**

Open the login link `bun run dev:web` prints (`http://localhost:47190/cdn-cgi/access/login?secret=…`). The dev door stands in for Cloudflare Access: the link signs this browser in as `dev@example.com` for 30 days, across restarts, and the hub pairs the browser on its own, so you land in chat with no PIN. After that, http://localhost:47190 is enough; a new browser or private window needs the current run's link once. The door gives no identity by address alone: without the login it answers 401, also on localhost, because every container on your Mac reaches it as localhost. You are also the hub's admin: `/admin` is the admin panel. Bot permissions, approval rules, model settings and how bots use secrets are the admin's, as in a team install: change them in `/admin`.

**What changed for developers:** there is no startup PIN and no `bun run dev:pair` any more, and the browser goes through the hub like a team install. Your dev data folder stays the same. `bun scripts/hub.ts dev --port <first port> --data <folder>` runs a second stack next to yours.

**Bot tools in the sandbox:** `bun run dev:web --sandbox` runs bots' `read`, `write`, `edit`, `bash` and command MCP servers in the sandbox container, as in an install (Linux, uid 1000, Node, Python and uv). It needs OrbStack or Docker Desktop and the image, built once and again after a change to `deploy/docker/sandbox.sh` or the sandbox stage: `bun scripts/deploy.ts images sandbox --platform linux/arm64 --tag dev` (`linux/amd64` on an Intel Mac). The container starts in about a second and stops with the dev servers; the daemon still reloads on save. It uses ports 47194 and 47195 on 127.0.0.1, which only a connection that starts with the run's key gets past. Without `--sandbox`, tools run in the daemon, on your Mac.

The dev sandbox is the install's image with its limits (uid 1000, read-only root, no capabilities, no keys in its environment, 512 MB, 1 CPU, 256 processes), but it is not an install's sandbox:

- No firewall: bots reach the internet directly, not only through the secrets proxy, and every port of your Mac through `host.docker.internal`: the dev door answers them 401 (they have no login), but any other service you run on your Mac is open to them.
- No disk quota: bot folders and the bots' home live in your dev data folder (`agents/`, `bot-home/`), where you can open them on the Mac.
- Your `~/.agents` skills are mounted read only.

**4. Connect a model**

Open **Settings → Providers** and log in. If you already use Pi, its saved logins in `~/.pi/agent` work right away.

> [!WARNING]
> Without `--sandbox`, bots run their tools as your user, on your machine. Use the permission modes to decide what a bot may do without asking.

### iPhone

```bash
bun run dev:mobile
```

This boots the iOS Simulator and starts the dev client. `bun run dev:all` starts it together with `dev:web`. The iOS app still pairs with a PIN: run `DATA_DIR=~/.config/vinci-dev bun apps/daemon/src/entry.native.ts pair` while the dev daemon runs, and scan the QR code.

**A real phone or another computer** needs an address it can reach. Start with `bun run dev:web --url http://<LAN or Tailscale address>:47190`: the dev door, daemon and Vite then listen on every interface, and the terminal prints a login link for this run. Open that link once on each device (it keeps you signed in for 30 days, across restarts), then use `http://<address>:47190`. This replaces `dev:pair --url`. Without `--url`, only this Mac can open Vinci.

### Desktop app

```bash
bun run dev:desktop
```

The macOS app starts the daemon and web app if they are not running, then pairs itself. On first launch it asks where Vinci runs: **This Mac** or **Another Mac**.

### The `vinci` command

Run `bun link` in `apps/daemon` once, then:

```bash
vinci start                # Run in the foreground; Ctrl+C stops it
vinci pair                 # Print a new pairing code, link and QR code (the iOS and desktop apps)
```

The native daemon is for development. To back up a development data folder, stop the daemon and copy the folder. See the [API reference](.agents/references/api.md#daemon-and-storage) for details.

### Release

```bash
bun run release patch          # 0.1.6 -> 0.1.7: fixes
bun run release minor          # 0.1.6 -> 0.2.0: new features
bun run release major          # 0.1.6 -> 1.0.0: breaking changes
bun run release minor --draft  # publish the GitHub Release as a draft
```

The bump kind is required: the next version follows semantic versioning from the root `package.json` version, and the script prints `current -> next` before it starts. This releases from a clean `main` that matches `origin/main`. It runs `check` and `lint`, sets the version in every `package.json`, commits and tags it, then builds from a clean checkout of the tag. It pushes `main` and the tag, creates a GitHub Release with one file, and then publishes the app's update to the update bucket, from which installed apps update themselves (see [Desktop releases and updates](docs/desktop-release.md); `--draft` skips that last step):

- `Vinci-<version>-macos-arm64.zip`: the macOS app, signed with your Developer ID and notarized by Apple.

The iOS app ships through EAS and TestFlight, not GitHub: `bun run release:ios` builds it on this Mac and submits it to TestFlight; `bun run release:ios-expo` builds it on EAS instead. `bun run release:desktop` builds only the macOS app, without tagging.

The app looks for updates only at `DESKTOP_UPDATE_URL`, set at build time; a release refuses to start without it and `bun run publish:desktop` uploads a finished release to its bucket. Signing reads `DESKTOP_SIGNING_KEYCHAIN` (a dedicated keychain holding the Developer ID certificate) and `DESKTOP_SIGNING_IDENTITY` (its SHA-1) from `.env`. The keychain password and notary key come from `.env` or from a `credentials.json` next to the keychain; see `.env.example`.

### Container images

```bash
bun run build:images                                 # vinci-daemon, vinci-web and vinci-hub for linux/amd64
bun run build:images daemon --platform linux/arm64   # one image, for a local run on Apple Silicon
```

The images build from `deploy/docker/Dockerfile` and hold the same Bun bundles as the desktop app, without `node_modules`. They run as uid 1000 under `tini` and work with a read-only root, a `/tmp` tmpfs, `cap_drop: ALL` and `no-new-privileges`. The daemon keeps all state, `HOME` and the Pi agent directory on a volume at `/data`. `scripts/deploy.ts` runs the images behind the hub, which pairs each person's browser on their first visit; see the [install guide](docs/team-workspace/install.md).

## 🧪 Development

```bash
bun run check       # TypeScript in every package
bun run lint        # Oxlint, architecture rules and import cycles
bun run lint:dead   # Unused files, exports and dependencies
```

Agent guidance lives in `AGENTS.md` and `.agents/`. Run `bun run agents:sync` after changing it: it links `CLAUDE.md`, `.claude/` and the worktree configs for Paseo, Orca, Conductor and T3 Code from `.agents/orchestrators/`.

[Architecture](.agents/references/architecture.md) shows how the apps and packages fit together and where each kind of file goes. The [API reference](.agents/references/api.md) lists the daemon, RPC and Pi behavior the code does not make obvious.

## 📄 License

MIT. The avatar blob engine in `packages/avatar-blobs/` is by Jérémy Perret, also MIT; see `packages/avatar-blobs/LICENSE`.
