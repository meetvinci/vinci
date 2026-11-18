# Vinci

A bot backend. Vinci installs one way: Docker, with a hub (`apps/hub`) that takes identity from Cloudflare Access, an admin panel, and per person one daemon and one sandbox. A person on their own installs the same thing and is its only admin and user. Each daemon serves one owner and runs each bot as a persistent Pi Durable agent. The web (`apps/web`), iOS (`apps/mobile`) and macOS and Linux (`apps/desktop`) apps are clients of the install and talk over oRPC through the hub. The native daemon runs only for development.

## Read first

- Before code changes, read `.agents/references/architecture.md` for structure and module conventions.
- For daemon, RPC, storage and Pi behavior, read `.agents/references/api.md`.
- Before UI changes, read `DESIGN.md`.
- For the install (hub, containers, deployment), read `.agents/references/team-workspace.md`; keep it and `docs/team-workspace/` current when that work changes.
- To install, operate or tear down a team installation on a server, use the `vinci-deploy` skill.
- For Pi Durable work, read `packages/runtime/node_modules/@earendil-works/pi-durable/README.md` first.

## Rules

- Follow nearby code. Keep changes direct; add no compatibility shims or speculative abstractions.
- Prefer library features to custom infrastructure. For Pi Durable, check its tools, extensions, hooks, documents, tasks, watches and recovery before adding app tables, queues, registries or wait mechanisms. Name the concrete API gap before writing a replacement; Vinci keeps only product policy and host integration.
- Store application secrets as encrypted entries in the shared `credentials` table through the credentials service. Pi provider authentication stays in Pi's own auth store.
- Each daemon has one owner: the person the hub routes to it. No users, organizations, roles or password login inside a daemon. Devices get a token only through a pairing grant the hub issues after login. The hub and the admin panel use the owner-only daemon socket. Public transport cannot issue local grants. CLI commands reuse running services; only startup opens stores.
- Build no product feature for a native install. The native daemon exists for `bun run dev`; keep it working, nothing more.
- `apps/daemon` is startup, composition, transport and shutdown only. Product logic belongs in server, Pi integration in runtime, and native implementations in their owning package. Follow the ownership table in the architecture reference; fix conflicting code rather than the rules.
- Services own one concrete domain and receive whole service dependencies. A combined response does not justify a catchall service.
- User-facing copy uses English keys in `packages/i18n/messages/en/`. Add each new or changed key to every other locale folder (`pt-PT`, `de`, `es`, `fr`) with a translation in the same change.
- Architecture, lint, TypeScript and Fallow rules change only on the user's explicit request; fix the code to pass a check.
- Keep development data and credentials separate from production. The user owns the dev servers: ask before stopping or starting one. If a dev terminal has crashed, restart it in the same Paseo terminal and say so.
- `bun run dev:web` starts the daemon, the hub and the web app and prints a login link; open it once and you are signed in as the dev user. Pass `--url <origin>` for another origin, and `--sandbox` to run bot tools in the Linux sandbox.
- A new native dependency on mobile needs a rebuild of the iOS dev app before its JavaScript can load; say so when you add one.
- Add tests only when the user asks.
- After a substantial set of code changes, run the `vinci-review` skill in full (simplify, code, blast), fix its findings within the task, and rerun the affected checks before reporting completion.

## Validation

Run `bun run check` and `bun run lint`; use `.agents/references/quality-gate.md` when reviewing. After changing agent guidance, run `bun run agents:sync`.
