# Desktop app releases and updates

The macOS app updates itself from one address that is set when the app is built. It never looks anywhere else: a build without the address has updates off.

For now the address is a public bucket (Cloudflare R2 with a public address). Later the same files can sit behind a small gateway that checks a customer key in the path, such as `https://updates.example.com/<key>/`. Only the address changes, not the code: build with the new address and every app built after it uses it.

## Settings

Put these in `.env` on the Mac that builds releases.

| Setting | What it is |
|---|---|
| `DESKTOP_UPDATE_URL` | The address installed apps read updates from. `https://` only, no `?query` (the updater adds its own), so a key goes in the path. A release refuses to start without it. |
| `DESKTOP_UPDATE_S3_BUCKET` | The bucket behind that address. |
| `DESKTOP_UPDATE_S3_ENDPOINT` | The provider's S3 address, for R2 `https://<account id>.r2.cloudflarestorage.com`. Empty for Amazon S3. |
| `DESKTOP_UPDATE_S3_REGION` | `auto` for R2. |
| `DESKTOP_UPDATE_S3_ACCESS_KEY_ID`, `DESKTOP_UPDATE_S3_SECRET_ACCESS_KEY` | A key that can write to that bucket only. |

The address must serve the bucket's top level: `<DESKTOP_UPDATE_URL>/stable-macos-arm64-update.json` is the file `stable-macos-arm64-update.json` in the bucket. With R2, turn on the bucket's public `r2.dev` address or connect a custom domain, and use that.

The signing settings (`DESKTOP_SIGNING_KEYCHAIN` and the others) are in `.env.example` and the README.

## A test build beside dev servers

A packaged app gets no environment when it is opened from Finder, so its name, bundle ID, data folder and ports are fixed when it is built. A test build that must not share anything with the dev servers (ports 47190 and 47191, `~/.config/meetvinci-dev`) or with another build sets all four:

| Setting | Test build example | Empty |
|---|---|---|
| `APP_NAME` | `MeetVinci Test` | `MeetVinci` |
| `DESKTOP_BUNDLE_ID` | `pt.entrypoint.meetvinci.desktop.test` | `pt.entrypoint.meetvinci.desktop` |
| `DESKTOP_DATA_DIR` | `~/.config/meetvinci-desktop-test/` | `~/.config/meetvinci/` |
| `DESKTOP_PORT` | `47390` | `47190` |

The app tries ten ports from `DESKTOP_PORT` and runs its daemon 100 higher, so a default build uses 47190-47199 and 47290-47299; `47390` keeps a test build clear of both. It reuses a running daemon only when that daemon's socket is in its own data folder.

The build fails when `DESKTOP_DATA_DIR` is neither absolute nor starts with `~/`, or `DESKTOP_PORT` is not a whole number from 1024 to 65000. A built-in data folder wins over a `DATA_DIR` in the environment; with none built in, the app uses `DATA_DIR` and then `~/.config/meetvinci/` as before. `bun run dev:app` ignores both settings, so its `DATA_DIR` and the dev servers' ports keep working whatever `.env` holds.

Before opening a test build, check the `runtime` block of the app's `Contents/Resources/build.json` (in a stable build, the app inside the `.tar.zst` in `Resources`): it must name the test name, bundle ID, data folder and port.

Delete the app and its data folder when done.

## Publish version N

```bash
bun run release N        # for example: bun run release 0.2.0
```

From a clean `main` that matches `origin/main`, this checks, tags, builds the app for `DESKTOP_UPDATE_URL`, signs it with the Developer ID, has Apple notarize it, staples the ticket, pushes the tag, creates the GitHub Release, and finally publishes the update to the bucket. With `--draft` it stops before the bucket and prints the command that publishes it.

To publish a release that is already built (for example after the bucket step failed):

```bash
bun run publish:desktop                  # apps/desktop/artifacts
bun run publish:desktop <artifacts folder>
```

Publishing first checks the exact bundle it will upload. It stops before the first upload unless the app inside is signed with a Developer ID (`codesign --verify --deep --strict`), notarized with the ticket stapled (`stapler validate`), accepted by Gatekeeper (`spctl`), is the build the manifest names, and was built for `DESKTOP_UPDATE_URL`. It runs only on a Mac.

It uploads two files, the bundle first and the manifest last, so no app sees a new manifest before its bundle:

| File in the bucket | What it is |
|---|---|
| `stable-macos-arm64-MeetVinci.app.tar.zst` | The signed, stapled app, as a zstd tar. Replaced on every release. |
| `stable-macos-arm64-update.json` | The manifest: bundle ID, channel, version, build hash and the bundle's file name. |

Then it downloads the manifest from `DESKTOP_UPDATE_URL` and fails if the address does not serve what was just uploaded. Only stable Apple silicon builds update; there is no Linux or canary update.

## What an installed app does

1. 30 seconds after start, then every 6 hours, or from **Check for Updates…**, it downloads `<address>/stable-macos-arm64-update.json`.
2. When the manifest is for this app (bundle ID, channel, platform and architecture) and its build hash differs from the running one, it downloads the bundle from `<address>/<file name>`.
3. It unpacks the bundle and checks that it holds exactly one app, signed through Apple with the same bundle ID and Developer ID team as the running app (checked by `codesign` itself, so it holds even with Gatekeeper turned off), that Gatekeeper accepts it (so Apple notarized it), and that its version is newer than the running one. Anything else is dropped and nothing is installed (a manual check says the check failed). The downloaded file is then replaced by a fresh tar of exactly the app that was checked, which is what gets installed.
4. The tray menu and the app offer **Restart to Update**. Choosing it stops the local server, swaps the app and opens it again.

### Settings it cannot change for now

Every MeetVinci now leaves some settings to an admin, and the app's own local server has no admin. Until the app becomes a window on an installation, it hides those controls, as for a person in a team: a bot's permission level (new bots are on **Ask**), approval rules and the approval timeout, and how bots use secrets. The default model and rate limits were never in the app. Its bots cannot add an MCP server that runs a command. Pairing (including **Pair a device** for a phone), **Settings → Server**, chat, secrets, web MCP servers, models, sources and the Jev key work as before.

## What the check protects against

The bucket is public, so anyone can read it. Only the bucket key can change it.

It protects against a changed or replaced bundle from anyone without the owner's Developer ID and Apple's notarization: a bundle that is unsigned, ad hoc signed, signed by another team, a different app of the same team, not notarized, or an older or equal version (a rollback) is refused. To undo a bad release, publish a fix with a higher version. That holds for a leaked bucket key, a hijacked address or a man in the middle.

It does not protect against:

- **Holding back updates.** Someone with the bucket key could keep serving the current release, or delete or break the files; apps keep their version and a manual check reports a failure.
- **A compromised signing key or build Mac.** Whatever the owner's Developer ID signs and Apple notarizes passes.
- **Reading.** Anyone with the address can download the app. A key in the path (the later gateway) is what limits that.

Electrobun itself checks no checksum or signature of the bundle; this app's own check above is the protection. Electrobun 2.0.6 changes the prepared-update format and that check would stop working, so the app stays on 2.0.5 (see gotcha 155 in `.agents/references/team-workspace.md`).
