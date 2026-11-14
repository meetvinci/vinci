# 🤖 MeetVinci

> Your own bots, on your own Mac. Chat with them from the web, your iPhone or the desktop app.

MeetVinci runs a small daemon on your computer. Each bot is a persistent [Pi](https://github.com/earendil-works/pi) agent with its own conversation, tools, skills and memory, and it keeps working when you close the app. Your devices pair with the daemon once, then talk to it over your local network or Tailscale. A personal install has no accounts and no cloud service in between. A small team can also share one server: see [Team workspace](#-team-workspace).

## ⬇️ Download

**Download the macOS app** (Apple silicon) from this repository's GitHub Releases. Unzip it, move **MeetVinci** to Applications and open it. Choose **This Mac**, then connect a model provider such as Anthropic or OpenAI. The app runs the daemon for you and lives in the menu bar.

## ✨ Features

- 💬 **Persistent bots.** Give a bot a name, an avatar, instructions and a model. Its conversation survives restarts, and work in progress resumes on its own.
- 🔌 **Any model Pi can reach.** Log in to OpenAI Codex, Claude, Grok and other providers from Settings, or reuse the logins you already have in Pi.
- 🧰 **Skills, MCP and plugins.** Bots inherit your agent skills, instructions and MCP servers, and you can add more per bot. Pick a skill from the composer with `/`.
- 🤝 **Bots talk to each other.** A bot can message another bot, wait for the answer and pass it on, up to three bots deep. Bots can also start subagents in the foreground or background.
- ✅ **Approvals you control.** Each bot has a permission mode: read-only, ask, auto or full. Auto lets [Jev](https://typesafe.ai) approve safe calls and asks you about the rest, using your own plain-language rules.
- 🔑 **Secrets without leaks.** A bot can ask you for an API key. You type it once, it is stored encrypted, and the bot only ever sees a placeholder that a local proxy swaps for the real value.
- 📎 **Files, questions and reactions.** Attach files and images, answer a bot's multiple-choice questions, and react to messages.
- ⏰ **Routines.** Schedule a bot to run on its own; results land in its chat.
- 📊 **Artifacts.** Bots build documents, charts and HTML pages you can open and edit from the artifacts page.
- 📱 **iOS app.** Scan the pairing QR code and chat on the go. Push notifications show the bot's own avatar. Android is planned.
- 🍎 **macOS app.** Starts the daemon for you, pairs itself, and can also open MeetVinci running on another Mac.
- 💾 **Backups.** One command snapshots every bot, its files and the database, and restores them later.

## 👥 Team workspace

MeetVinci can also run on one Linux server for a team of about 3 to 7 people. Each person gets their own MeetVinci in its own container, everyone uses one web address, and Cloudflare Access handles the login. It is work in progress and meant for trusted teams for now.

Start with the [team workspace guide](docs/team-workspace/README.md).

## 🧰 Built with

[Bun](https://bun.sh) · [Turborepo](https://turborepo.com) · [Pi Durable](https://github.com/earendil-works/pi) · [oRPC](https://orpc.dev) · [TanStack Start](https://tanstack.com/start) · [Expo](https://expo.dev) · [Electrobun](https://electrobun.dev) · SQLite · [Paraglide](https://inlang.com/m/gerre34r/library-inlang-paraglideJs)

## 🚀 Run it locally

**You need:** [Bun](https://bun.sh) 1.4 on macOS. The iOS app also needs Xcode.

**1. Install**

```bash
git clone git@github.com:ijpatricio/orbs-bot.git meetvinci && cd meetvinci
bun install
cp .env.example .env
```

The defaults in `.env.example` work as they are.

**2. Start the daemon and the web app**

```bash
bun run dev:web
```

This starts the daemon on port 47191 and the web app on http://localhost:47190. Dev data lives in `~/.config/meetvinci-dev`, apart from a real install in `~/.config/meetvinci`.

**3. Pair your browser**

While no device is paired, the daemon prints a pairing link and a QR code in the terminal. Open the link to pair this browser. To pair another device later, open **Settings → Devices** on a paired one, or run `meetvinci pair`.

**4. Connect a model**

Open **Settings → Providers** and log in. If you already use Pi, its saved logins in `~/.pi/agent` work right away.

> [!WARNING]
> Bots run their tools as your user, on your machine. This is not a sandbox. Use the permission modes to decide what a bot may do without asking.

### iPhone

```bash
bun run dev:mobile
```

This boots the iOS Simulator and starts the dev client. Scan the pairing QR code from **Settings → Devices** in the web app. For a real phone, the daemon must be reachable on your LAN or Tailscale; it listens on every interface by default.

### Desktop app

```bash
bun run dev:desktop
```

The macOS app starts the daemon and web app if they are not running, then pairs itself. On first launch it asks where MeetVinci runs: **This Mac** or **Another Mac**.

### The `meetvinci` command

Run `bun link` in `apps/daemon` once, then:

```bash
meetvinci start                # Run in the foreground; Ctrl+C stops it
meetvinci pair                 # Print a new pairing code, link and QR code
```

The native daemon is for development. To back up a development data folder, stop the daemon and copy the folder. See the [API reference](.agents/references/api.md#daemon-and-storage) for details.

### Release

```bash
bun run release            # next patch: 0.0.1, 0.0.2, ...
bun run release 0.2.0      # a specific version
bun run release --draft    # publish the GitHub Release as a draft
```

This releases from a clean `main` that matches `origin/main`. It runs `check` and `lint`, sets the version in every `package.json`, commits and tags it, then builds from a clean checkout of the tag. It pushes `main` and the tag, creates a GitHub Release with one file, and then publishes the app's update to the update bucket, from which installed apps update themselves (see [Desktop releases and updates](docs/desktop-release.md); `--draft` skips that last step):

- `MeetVinci-<version>-macos-arm64.zip`: the macOS app, signed with your Developer ID and notarized by Apple.

The iOS app ships through EAS and TestFlight, not GitHub: `bun run release:ios` builds it on this Mac and submits it to TestFlight; `bun run release:ios-expo` builds it on EAS instead. `bun run release:desktop` builds only the macOS app, without tagging.

The app looks for updates only at `DESKTOP_UPDATE_URL`, set at build time; a release refuses to start without it and `bun run publish:desktop` uploads a finished release to its bucket. Signing reads `DESKTOP_SIGNING_KEYCHAIN` (a dedicated keychain holding the Developer ID certificate) and `DESKTOP_SIGNING_IDENTITY` (its SHA-1) from `.env`. The keychain password and notary key come from `.env` or from a `credentials.json` next to the keychain; see `.env.example`.

### Container images

```bash
bun run build:images                                 # meetvinci-daemon, meetvinci-web and meetvinci-hub for linux/amd64
bun run build:images daemon --platform linux/arm64   # one image, for a local run on Apple Silicon
```

The images build from `deploy/docker/Dockerfile` and hold the same Bun bundles as the desktop app, without `node_modules`. They run as uid 1000 under `tini` and work with a read-only root, a `/tmp` tmpfs, `cap_drop: ALL` and `no-new-privileges`. The daemon keeps all state, `HOME` and the Pi agent directory on a volume at `/data`; pair it with `docker exec <container> meetvinci pair`.

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
