# Orbs backend reference

Only behavior the code does not make obvious. RPC names and inputs: `packages/contracts/src/rpc/rpc.router.ts`. Services: `packages/server/src/services/<domain>/` (product) and `packages/runtime/src/services/<domain>/` (Pi).

## Daemon and storage

```text
DATA_DIR/                     default ~/.config/orbs/
  agents/<botId>/             bot working folder, uploads in .attachments/ (not a sandbox)
  data/app.sqlite             app database
  data/credentials.key        key for the encrypted credentials table
  data/daemon.lock            one lock for every store
  data/ipc/rpc.sock           owner-only socket, used by `orbs pair`
  data/bots/<botId>/runtime.sql   that bot's Pi store; the file is the unit of erasure
  data/bots/<botId>/mcp.json      MCP servers the owner or the bot added for that bot only
  data/bots/<botId>/telemetry.sql model and tool spans, kept 14 days; reset with the store, not backed up
```

- Startup opens and migrates SQL, restores every bot, then resumes Pi. A failing store closes only its bot.
- Backup runs offline with `VACUUM INTO` (`server/src/services/backup/`). A bundle includes the encryption key: treat it as a secret.

## Connection

- Clients probe every address from `server.info()` and use the first, in list order, whose `/health` reports the paired server ID (`server/src/services/server/`). The web server's probes of cookie addresses never follow redirects; native clients' probes do.
- `DAEMON_PUBLIC_URLS` replaces the detected loopback, LAN and Tailscale addresses with those origins (kind `public`); owner-added custom addresses still follow. Public origins are allowed browser Origins and CORS origins.
- Every call sends `x-bots-protocol`; `serverId` pins a client to one daemon. Mismatches return `PROTOCOL_MISMATCH` or `SERVER_MISMATCH` and are never retried.
- Pairing uses a six-digit PIN that lives five minutes; the QR code and link are Base64 of `{ serverId, addresses, pin }` (`authPairEntry` in `contracts/src/types/auth.types.ts`). Redeem returns the server ID and addresses, so a bare PIN works against a known address. Every wrong PIN counts against all live grants, which die after five misses. Public transport can never bootstrap; only the owner socket can.
- The web proxy only forwards to an address that reports the paired server ID, so a forged cookie cannot redirect it.
- Hub mode (`WEB_HUB_URL`): the hub routes daemon paths by the Access identity, so the web server answers 404 for `/rpc`, `/health`, `/files`, `/avatars` and `/mcp/callback` and never reads cookie addresses. It also answers 404 to those paths for any request carrying `Cf-Access-Jwt-Assertion`, so a hub in front of a web server without `WEB_HUB_URL` fails closed. SSR sends RPC to the hub with the request's `Cf-Access-Jwt-Assertion` header, or its `CF_Authorization` cookie. The browser keeps same-origin `/rpc`.
- A hub hands a code it issued to `/connect?code=<pairing payload>` (`connectionSearch`); the page drops it from the URL. A link code (`?code=` or `#code=`) is redeemed at once with the default device name only when every address in it is the page's own origin, or in the desktop shell; any other code is only prefilled for the user to confirm, so a crafted link cannot pair a browser to a foreign server.
- A redirect answering the web client's `/health` check means a login gate's session expired: the page reloads at most once a minute so the gate can sign the user in; unsent drafts live in `localStorage`. The PWA manifest and its icons stay under `/img/favicon/` (plus `/favicon.ico`) so a gate can exempt them.
- Web sends every chat route to `/onboarding/$step` until `onboarding.complete()` stores `onboarding.completedAt` in settings. It is stored per daemon, so devices paired later skip it.

## Retries and dedupe

- `conversation.submit` dedupes by `requestId`: a reused ID returns the same submission even with new content. Clients never retry commands or submissions on their own.
- Peer delivery submits with `bots.delivery:<senderStoreId>:<taskId>`, so a rerun after a crash delivers once (`runtime/src/services/collaboration/collaboration-delivery.task.ts`).
- Tools that mutate use `replay: 'unsafe'`: after a crash, read state before retrying.

## Busy modes (`whenBusy`)

`followUp` queues after the reply, `steer` joins after the current tool round, `interrupt` aborts the run and goes first (`CONFLICT` if a newer run started), `reject` fails when busy. When omitted: the chat's mode, then the daemon default, then `followUp`.

## Model fallback

One retry on the bot's `fallbackModel` only when a request fails before any output with an auth, quota or transient provider error (`runtimeModelCanFallback` in `runtime/src/services/runtime/runtime-model-stream.utils.ts`).

## Approvals

Read-only, Ask, Auto and Full. Auto asks Jev and approves only with a safe score of at least 0.9 and an ask-first score of at most 0.1 (`server/src/services/tool/tool.constants.ts`); otherwise it asks the owner. Only exact trusted registrations count as reads. Approval state lives in Pi task documents and survives restart.

## Secrets

`bot_secret` stores values encrypted as `secrets.<NAME>` with allowed hosts. Bash reads `$NAME`. Mode `proxy` (default) keeps a placeholder in the command and swaps in the value only over HTTPS to allowed hosts (`packages/secret-proxy`); `varlock` uses the Varlock CLI; `env` exposes the value. Tool results always show placeholders.

## Skills, instructions, plugins and MCP

Bot-local sources win, then configured shared sources, then Pi's global ones; shared sources need the bot's inheritance flag. A bot-local skill named in the bot's `disabledSkills` is left out of the prompt, the `$` list and expansion, and its files stay untouched. Order and file names: `runtime/src/services/skill/`, `runtime/src/services/instruction/instruction.constants.ts`, `server/src/services/mcp/mcp-files.utils.ts`.

- MCP credentials are referenced by name (`envCredentials`, `headerCredentials`), only from shared sources; bot-local definitions that use them are skipped.
- `mcp.add` and the `bot_mcp_add` tool write `data/bots/<botId>/mcp.json`, which may use credentials: a header secret must be allowed for the server's host, and only the owner can pass env secrets to a command server. `bot_mcp_add` and `bot_note` always ask the owner, except under Full.
- MCP OAuth (`runtime/src/services/mcp-auth/`): the server URL always comes from bot config, the one-time `state` authorizes the callback browser, and `returnUrl` must be an app link or the redirect's own origin.
- Plugins are trusted native code; approval gates their tool calls, not their imports.

## Peers and subagents

Peers talk in one persistent private conversation per sender and recipient by default (`context: 'private'`; a new one starts after the sender's history is cleared); `context: 'existing'` posts into the recipient's main chat instead. Forwarding stops after three bots. Subagents cannot spawn children or contact peers. Silent answers are dropped before reaching the asking bot.

## Routines

One Pi task per routine ends each wait in a stored sleep, with no model calls (`runtime/src/services/routine/routine.task.ts`). Pi cannot wake a sleeping task early, so run-now and edits replace the routine's task in the same commit and abort the old one; a task that is delivering is left alone. A task that is no longer its routine's task ends itself. Opening a bot retries routine tasks Pi parked at its restart limit. After downtime an overdue run happens once; missed repetitions are skipped. Each store arms one host alarm at its earliest deadline, so the daemon must stay running.

## Silent replies

Assistant text that is only `NO_REPLY` or `<|eos|>` (`replySilent` in `contracts/src/types/reply.types.ts`) is hidden in chat, ignored by the chat-list preview and notifications, and dropped from peer and subagent answers. The reactions prompt asks bots to reply `NO_REPLY`.

## History clear

`conversation.clear` saves routines, todos and the latest artifact versions to `data/bots/<botId>/carry.json`, replaces the store and recreates them with the same IDs; a crash mid-way finishes on the next start.

## Hub (team installs)

`apps/hub` is the only public origin, behind Cloudflare Access. Every request needs a valid Access JWT (`Cf-Access-Jwt-Assertion`, else the `CF_Authorization` cookie): RS256 against `ACCESS_TEAM_DOMAIN/cdn-cgi/access/certs`, issuer, `ACCESS_AUD`, expiry with 60 s leeway, and an `email` claim. Failures are empty 401s; a valid identity without a user is an empty 403. Only `/hub/health` and the icon files `/favicon.ico` and `/img/favicon/<file>` (GET or HEAD, one segment) skip it; the icon files reach the web app without cookies or token, and anything else under `/img/favicon/` needs identity. A path with an empty or dot segment (`//rpc`, `/a//b`) is a 400 before routing.

```text
HUB_DATA_DIR/
  users.json   {"users": {"<email>": {"id", "daemonUrl", "socketPath"}}}; email, id, daemonUrl and socketPath each unique; reread within a second of a change
  pins.json    user id -> daemon server ID, written on first contact; a server ID belongs to one user only
```

- A missing, unreadable or invalid users.json means zero users: every identity gets 403 and the hub logs an error until the file is fixed. Fail closed, never the last good file.
- `/rpc*`, `/health`, `/files/*`, `/avatars/*`, `/embed/*` and `/mcp/callback` (HTTP and WebSocket) go to the user's `daemonUrl`; everything else goes to `HUB_WEB_URL` with the verified token in `Cf-Access-Jwt-Assertion`. Client identity and forwarding headers are stripped; `X-Forwarded-Proto` and `X-Forwarded-Host` come from `HUB_PUBLIC_URL`; `Origin` passes through. A relayed `Location`, `Content-Location` or `Refresh` URL that resolves to `HUB_WEB_URL` or the daemon URL is rewritten onto `HUB_PUBLIC_URL`, so no internal address reaches the client. `/files/*` without `Authorization` gets the device token from the `bots.connection` cookie.
- An open WebSocket is rechecked every 5 s and closed (1008) once its Access token has expired or its user is gone from users.json.
- Before forwarding, the daemon's `/health` must report the pinned server ID (checked at most every 5 s and on every address change), and a new pin may not equal another user's. A mismatch is a 502 and an admin-facing log line; nobody changes `pins.json` until the admin has confirmed which daemon belongs to whom.
- `socketPath` must be the real path: the hub refuses a socket that is a symlink or sits below a symlinked folder, before connecting.
- `GET /connect` without `code` mints a grant whenever the request has no `bots.connection` cookie for this user's daemon, including after `?reason=revoked|replaced`: it checks the grant's server ID against the pin and redirects to `/connect?code=<payload>`. `/hub/pair` does the same on demand. At most 5 grants per user per 10 minutes, which also ends any redirect loop. `/hub/whoami` returns the email, user id and pinned server ID.
- Each daemon only receives its own user's traffic, so its peer-keyed throttles count one user's devices and hub calls together, never the whole organization.
