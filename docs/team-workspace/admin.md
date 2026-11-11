# Admin tasks

Everyday work for the person who runs the server. Each task ends with a prompt you can paste to an AI coding agent that has SSH access to the server.

Every command here runs on the server as root, in `/opt/orbs`:

```sh
cd /opt/orbs
```

## Where each person's data lives

Each person has one Docker volume, mounted at `/data` in their container. Everything of theirs is in it:

| Path in the container | What it holds |
| --- | --- |
| `/data/data/` | the database, the encryption key for saved secrets, each bot's history |
| `/data/agents/<bot>/` | each bot's working folder and uploaded files |
| `/data/pi/` | model provider settings: `models.json` and `auth.json` |
| `/data/home/` | the person's home folder: shared skills, instructions and tool settings |

Treat a volume as secret: it contains the person's keys. The volume of user `alice` is the Docker volume `orbs_data-alice`; her container is `orbs-daemon-alice-1`.

## The user list

`/opt/orbs/users.yaml` is the one list of people. Each line is a user id and that person's login email:

```yaml
users:
  alice: alice@example.com
  bob: bob@example.com
```

- The user id is short: lowercase letters, digits and dashes. It names the person's container and volume, so never reuse an id for someone else.
- Each email appears once. It must match the email the person logs in with at Cloudflare.
- After every edit, run `bun deploy.ts apply`. It writes the hub's `hub/users.json` and `users.compose.yaml` from this list and starts or stops containers to match. Never edit those two files by hand: the next `apply` overwrites them.
- `apply` never restarts the hub or the other people's containers, so nobody else is logged out.
- The hub reads the new list within about a second. If the list has a mistake, `apply` stops before changing anything and says what is wrong.

## Add a person

1. Add a line for them to `users.yaml`, then run:

   ```sh
   bun deploy.ts apply
   ```

   It creates their volume, network and container and waits until the container is healthy.
2. Let them log in at Cloudflare. On your computer, in the Orbs repository, copy the list's emails into the Access policy (the Cloudflare token stays on your computer, so the server cannot do this step):

   ```sh
   ssh root@<server> cat /opt/orbs/users.yaml | CLOUDFLARE_API_TOKEN=… bun scripts/deploy.ts cloudflare emails --users - --zone <domain> --hostname <team>.<domain> --name orbs-<team>
   ```
3. Send them the address, `https://<team>.<domain>`. On their first visit they type their email and enter the code from their inbox. Their browser pairs itself and shows their bots.

Model keys come from the server's `.env` (see [Set model API keys](#set-model-api-keys)); a new person gets them automatically.

**Give this to your agent:**

> On `root@<server>`, add `<email>` as Orbs user `<id>`: add the line `<id>: <email>` under `users:` in `/opt/orbs/users.yaml`, and run `bun deploy.ts apply` in `/opt/orbs`. Confirm `docker compose ps` shows `orbs-daemon-<id>-1` healthy and `docker compose logs hub --since 2m` shows "Users loaded" with no error. Then, in my Orbs checkout with `CLOUDFLARE_API_TOKEN` read from `<where you keep it>` inside the same command, run `ssh root@<server> cat /opt/orbs/users.yaml | bun scripts/deploy.ts cloudflare emails --users - --zone <domain> --hostname <team>.<domain> --name orbs-<team>` so they can log in.

## Remove a person

1. Delete their line from `users.yaml`, then run:

   ```sh
   bun deploy.ts apply
   ```

   The hub refuses them within about a second and closes their open connections. `apply` then stops and removes their container and network. Their volume stays.
2. Take their email out of the Access policy with the same command as when adding someone:

   ```sh
   ssh root@<server> cat /opt/orbs/users.yaml | CLOUDFLARE_API_TOKEN=… bun scripts/deploy.ts cloudflare emails --users - --zone <domain> --hostname <team>.<domain> --name orbs-<team>
   ```
3. Keep their volume until you have a backup or are sure it is not needed. To delete it for good:

   ```sh
   bun deploy.ts purge <id>
   ```

   This deletes their volume, their owner-socket folder and the hub's saved ID for them. It restarts the hub, which takes a few seconds; everyone's open chats reconnect on their own. It refuses while the id is still in `users.yaml`.

**Give this to your agent:**

> On `root@<server>`, remove Orbs user `<id>` (`<email>`): delete their line from `/opt/orbs/users.yaml`, run `bun deploy.ts apply` in `/opt/orbs`, and confirm their container is gone and `docker compose logs hub --since 2m` shows "Users loaded" with no error. Then, in my Orbs checkout with `CLOUDFLARE_API_TOKEN` read from `<where you keep it>` inside the same command, run `ssh root@<server> cat /opt/orbs/users.yaml | bun scripts/deploy.ts cloudflare emails --users - --zone <domain> --hostname <team>.<domain> --name orbs-<team>`. Keep their volume.

## Set model API keys

The admin sets provider keys once, in `/opt/orbs/.env`. Every person's Orbs gets them:

```sh
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
```

Supported: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `MISTRAL_API_KEY`, `GROQ_API_KEY`, `XAI_API_KEY` and `DEEPSEEK_API_KEY`. Leave a line empty to skip that provider. After a change, restart the daemons:

```sh
docker compose up -d --wait
```

This restarts only the containers whose settings changed: every person's Orbs, not the hub or the web app.

> [!WARNING]
> Every person's bots can read these keys until the hardening phase. A bot that runs commands sees them in its environment. Use keys with a spending limit, and only with people you trust.

A person can also add their own key in Orbs, **Settings → Providers**. Theirs wins over the shared one.

Do not use a Claude or ChatGPT subscription login for the team. The providers' terms do not allow one subscription to serve several people.

**Give this to your agent:**

> On `root@<server>`, set the `<provider>` API key for Orbs: read it from `<where you keep it>`, write it as `<VARIABLE>` in `/opt/orbs/.env` without printing it, then run `docker compose up -d --wait` in `/opt/orbs` and confirm every `orbs-daemon-*` container is healthy.

## Set up bots, skills and tools for a person

Users can do all of this themselves in the app. To do it for them, edit files in their volume:

| What | Where, inside the person's volume |
| --- | --- |
| Skills for all their bots | a folder per skill in `/data/home/.agents/skills/` |
| Instructions for all their bots | `/data/home/.agents/AGENTS.md` (a bot only reads it when instruction inheritance is turned on for it) |
| MCP servers for all their bots | `/data/home/.agents/mcp.json` or `/data/pi/mcp.json` |
| Skills for one bot | `/data/agents/<bot>/.pi/skills/` |
| MCP servers for one bot | `/data/agents/<bot>/.agents/mcp.json` or `/data/agents/<bot>/.pi/mcp.json` |

Skill and instruction changes show up within about 30 seconds. Files must be owned by the container user.

Creating bots for someone is done in the app today. Default bots for new people come with templates (Phase 9).

**Give this to your agent:**

> On `root@<server>`, add the skill in `<local folder>` for all bots of Orbs user `<name>`: copy it to `/data/home/.agents/skills/<skill name>/` in their volume, owned by the container user. Don't restart anything. Confirm the skill appears in their bot's skill list within a minute.

## Backups

A backup is a copy of one person's whole volume: bots, chats, files, database, encryption key, model settings and home folder. Their Orbs stops for the few seconds it takes; other people are not affected.

```sh
bun deploy.ts backup <id>
```

It writes `backups/<id>-<time>.tar.gz`, readable only by root. The backup contains the person's keys: store it like a password.

To put a backup back:

```sh
bun deploy.ts restore <id> backups/<id>-<time>.tar.gz
```

This replaces everything in that person's volume. It first takes a fresh backup of what is there, and prints its name.

**Give this to your agent:**

> On `root@<server>`, in `/opt/orbs`, run `bun deploy.ts backup <id>` for every user id in `users.yaml`, one after the other, then copy the new files in `/opt/orbs/backups/` to `<backup location>` without changing their permissions. Report the file names and sizes.

## Upgrades

New images arrive with a new tag (see [install, step 3](install.md#3-get-orbs-onto-the-server)). To switch:

1. Back up everyone (above). A new version can change the database; the old version may not read it again.
2. Set the new tag in `/opt/orbs/.env`, for example `ORBS_TAG=v0.2.0`, and run:

   ```sh
   docker compose up -d --wait
   ```

   Every container restarts, which takes a few seconds. Open chats reconnect on their own. Routines that were due during the restart run once when Orbs is back.

To roll back, set the old tag again and run the same command. If the new version changed someone's data, restore their backup from before the upgrade.

**Give this to your agent:**

> On `root@<server>`, upgrade Orbs in `/opt/orbs` to image tag `<tag>`: confirm `docker images` lists `orbs-daemon`, `orbs-web` and `orbs-hub` with that tag, back up every user with `bun deploy.ts backup <id>`, set `ORBS_TAG=<tag>` in `.env`, run `docker compose up -d --wait`, and confirm every container is healthy and the hub log shows no error. If anything fails, set the previous tag back and run the same command.

## Status and logs

```sh
docker compose ps                        # every container and its health
docker stats --no-stream                 # memory and CPU per container
docker compose logs hub --since 1h       # the hub: logins refused, users loaded, pairing
docker compose logs daemon-<id> -f       # one person's Orbs, live
```

**Give this to your agent:**

> On `root@<server>`, in `/opt/orbs`, report `docker compose ps`, `docker stats --no-stream` and any error in `docker compose logs --since 1h`. Change nothing.
