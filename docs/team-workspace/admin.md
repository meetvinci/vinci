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

## Admins

The admin panel lives at `https://<team>.<domain>/admin`. Only the emails in `/opt/orbs/hub/admins.json` may open it; everyone else gets 403 there. An admin is just an email: they need not be a user and have no bots of their own. An admin who is not a user can open only the panel, nothing else.

- The first admin comes from `HUB_ADMIN_EMAILS` in `.env`, written to `admins.json` the first time the hub starts with an empty list.
- `admins.json` is the list that counts. The hub copies it to `admins:` in `users.yaml` when it starts and after every change, so Cloudflare Access lets the same people in.
- In the panel, admins add and remove other admins. The last admin cannot be removed.
- Each admin must also be allowed by Cloudflare Access. When the server has a Cloudflare token, the panel updates Access itself; otherwise it says so, and you add the email with the `cloudflare emails` command below.
- The panel changes a person's settings and bots through that person's owner socket. It never pairs as a device and cannot send messages or answer questions as them.
- Every change made in the panel is in the hub log with the admin's email: `docker compose logs hub | grep Admin`.

> [!WARNING]
> Admins are fully trusted. Through a bot's MCP servers, plugins and skills an admin can run code inside any person's Orbs, so they can technically read that person's data. The panel only offers no way to chat or answer as someone. Make someone an admin only if you would give them the server.

**Give this to your agent:**

> On `root@<server>`, in `/opt/orbs`, show me `hub/admins.json` and the hub log lines from the last day that start with "Admin". If `admins.json` is missing or invalid, set `HUB_ADMIN_EMAILS=<my email>` in `.env`, move the broken file aside, and run `docker compose up -d hub`; confirm the log says "Admins seeded from HUB_ADMIN_EMAILS".

## The user list

`/opt/orbs/users.yaml` is the one list of people. Each person is a user id and their login email, either on one line or with a display name and whether they are enabled. `admins:` lists the admin panel's admins:

```yaml
users:
  alice: alice@example.com
  bob:
    name: Bob Example
    email: bob@example.com
    enabled: false
admins:
  - admin@example.com
```

- The user id is short: lowercase letters, digits and dashes. It names the person's container and volume, so never reuse an id for someone else.
- Each email appears once under `users:`. It must match the email the person logs in with at Cloudflare.
- `name` is what the admin panel shows; it defaults to the id. `enabled` defaults to `true`. A disabled person cannot log in and has no container; their volume stays.
- Admins can log in at Cloudflare. An admin has no Orbs of their own unless they are also under `users:`.
- The admin panel changes this file through the provisioner, which rewrites it in the long form and drops comments. Don't edit it by hand while someone is changing people in the admin panel.
- After every edit, run `bun deploy.ts apply`. It writes the hub's `hub/users.json` and `users.compose.yaml` from this list and starts or stops containers to match. Never edit those two files by hand: the next `apply` overwrites them.
- `apply` never restarts the hub or the other people's containers, so nobody else is logged out.
- The hub reads the new list on the next request that reaches it, at most once a second. Its log line `Users loaded` with the new count therefore appears only after someone uses Orbs; to check right after `apply`, count the users in `hub/users.json` instead: `grep -c daemonUrl hub/users.json`.
- If the list has a mistake, `apply` stops before changing anything and says what is wrong.

## Add a person

In the admin panel: add them with their name and email. It creates their Orbs and, if the server may update Cloudflare Access ([below](#let-the-server-update-cloudflare-access)), lets them log in. Otherwise it says so: do step 2 below.

By hand:

1. Add a line for them to `users.yaml`, then run:

   ```sh
   bun deploy.ts apply
   ```

   It creates their volume, network and container and waits until the container is healthy.
2. Let them log in at Cloudflare. On your computer, in the Orbs repository, copy the list's emails into the Access policy (the Cloudflare token stays on your computer, so the server cannot do this step):

   ```sh
   ssh root@<server> cat /opt/orbs/users.yaml | CLOUDFLARE_API_TOKEN="$(op read '<token reference>')" bun scripts/deploy.ts cloudflare emails --users - --zone <domain> --hostname <team>.<domain> --name orbs-<team>
   ```

   Expected: `Access policy orbs-<team>-allow: updated` and the list of allowed emails.
3. Send them the address, `https://<team>.<domain>`. On their first visit they type their email and enter the code from their inbox. Their browser pairs itself and shows their bots.

Model keys come from the server's `.env` (see [Set model API keys](#set-model-api-keys)); a new person gets them automatically.

**Give this to your agent:**

> On `root@<server>`, add `<email>` as Orbs user `<id>`: add the line `  <id>: <email>` under `users:` in `/opt/orbs/users.yaml`, and run `bun deploy.ts apply` in `/opt/orbs`. Confirm `docker compose ps` shows `orbs-daemon-<id>-1` healthy and `grep -c daemonUrl /opt/orbs/hub/users.json` equals the number of people in `users.yaml`. Then, in my Orbs checkout with `CLOUDFLARE_API_TOKEN` read from `<where you keep it>` inside the same command, run `ssh root@<server> cat /opt/orbs/users.yaml | bun scripts/deploy.ts cloudflare emails --users - --zone <domain> --hostname <team>.<domain> --name orbs-<team>` so they can log in. If it says the token is empty, ask me to unlock my password manager.

## Disable a person

Disabling locks someone out without deleting anything: they cannot log in, their container stops and is removed, and their volume stays. Enabling them again starts a new container on the same volume.

In the admin panel, switch them off. By hand, set `enabled: false` in their entry in `users.yaml` (the long form above), run `bun deploy.ts apply`, then update Cloudflare Access as in [Add a person](#add-a-person), step 2.

**Give this to your agent:**

> On `root@<server>`, disable Orbs user `<id>`: in `/opt/orbs/users.yaml` turn their entry into the long form with `name`, `email` and `enabled: false`, run `bun deploy.ts apply` in `/opt/orbs`, and confirm `orbs-daemon-<id>-1` is gone, their volume `orbs_data-<id>` still exists and `hub/users.json` no longer lists their email. Then update the Access policy with `cloudflare emails` as in "Add a person". Don't delete their volume.

## Remove a person

In the admin panel: delete them. Their login goes, their container stops and is removed, their volume stays. By hand:

1. Delete their line from `users.yaml`, then run:

   ```sh
   bun deploy.ts apply
   ```

   The hub refuses them within about a second and closes their open connections. `apply` then stops and removes their container and network. Their volume stays.
2. Take their email out of the Access policy with the same command as when adding someone:

   ```sh
   ssh root@<server> cat /opt/orbs/users.yaml | CLOUDFLARE_API_TOKEN="$(op read '<token reference>')" bun scripts/deploy.ts cloudflare emails --users - --zone <domain> --hostname <team>.<domain> --name orbs-<team>
   ```
3. Keep their volume until you have a backup or are sure it is not needed. To delete it for good:

   ```sh
   bun deploy.ts purge <id>
   ```

   This deletes their volume, their owner-socket folder and the hub's saved ID for them. It restarts the hub, which takes a few seconds; everyone's open chats reconnect on their own. It refuses while the id is still in `users.yaml`.

**Give this to your agent:**

> On `root@<server>`, remove Orbs user `<id>` (`<email>`): delete their line from `/opt/orbs/users.yaml`, run `bun deploy.ts apply` in `/opt/orbs`, and confirm their container is gone and `grep -c daemonUrl /opt/orbs/hub/users.json` equals the number of people left. Then, in my Orbs checkout with `CLOUDFLARE_API_TOKEN` read from `<where you keep it>` inside the same command, run `ssh root@<server> cat /opt/orbs/users.yaml | bun scripts/deploy.ts cloudflare emails --users - --zone <domain> --hostname <team>.<domain> --name orbs-<team>`. Keep their volume.

## The admin panel's provisioner

The admin panel adds, disables and removes people through the provisioner, a small service in the stack. It runs exactly the same `bun deploy.ts apply` as you do by hand, one change at a time, and answers only the hub, with the secret `PROVISIONER_TOKEN` from `.env`, on a network only the two share. It cannot do anything else: no other Docker commands, no backups, no purges.

A change waits only for that person's Orbs to start, so another person's broken container does not block it. If a change fails, an add or a switch-on is undone in `users.yaml`, so you can simply try again; a switch-off or removal stays done, so the login stays gone. The panel and `bun deploy.ts apply` by hand never run at once: whichever comes second stops with *Another apply or admin panel change is running* and can be repeated a minute later.

> [!WARNING]
> The provisioner holds the Docker socket, which is full control of the server. A flaw in the provisioner, or anyone who gets `PROVISIONER_TOKEN` and can reach it, could take over the server. Only the hub can reach it, so the hub is now part of what protects the server: keep images current and keep `.env` readable by root only. To turn the panel's user changes off, stop it with `docker compose stop provisioner`; the panel then cannot add or remove people, and `bun deploy.ts apply` by hand still works.

**Give this to your agent:**

> On `root@<server>`, in `/opt/orbs`, check the provisioner: `docker compose ps provisioner` must be healthy, `docker inspect orbs-provisioner-1` must show `ReadonlyRootfs` true, `CapDrop [ALL]`, no `CapAdd`, no `PortBindings`, and only the networks `orbs_provisioner` and `orbs_egress`; `docker network inspect orbs_provisioner` must list only the hub and the provisioner. Report `docker compose logs provisioner --since 1h` without secrets. Change nothing.

## Let the server update Cloudflare Access

Without a Cloudflare token on the server, the admin panel adds and removes people but cannot change who may log in: it tells you to run `cloudflare emails` from your computer (step 2 of [Add a person](#add-a-person)). To let the server do it, create a second, smaller Cloudflare API token with only:

- Zone: Zone: Read, for your domain
- Account: Access: Apps and Policies: Edit

Don't reuse the install token: it can also change the tunnel and DNS. Store it in `/opt/orbs/.env` as `CLOUDFLARE_API_TOKEN`, then recreate the provisioner:

```sh
ssh root@<server> 'cd /opt/orbs && sed -i "/^CLOUDFLARE_API_TOKEN=/d" .env && cat >> .env && docker compose up -d --wait provisioner' < <(printf 'CLOUDFLARE_API_TOKEN=%s\n' "$(op read '<token reference>')")
ssh root@<server> 'cd /opt/orbs && docker compose logs provisioner | grep listening | tail -1'
```

Expected: `Access sync on.` It needs `CLOUDFLARE_ZONE` and `CLOUDFLARE_NAME` in `.env` too (install step 6 writes them); without them the provisioner refuses to start and says so. Anyone with root on the server can read the token. With it, the allow policy follows `users.yaml`: enabled users and admins. Removing the line and recreating the provisioner turns it off again.

**Give this to your agent:**

> Create nothing in Cloudflare. On `root@<server>`, in `/opt/orbs`, set `CLOUDFLARE_API_TOKEN` in `.env` to the token at `<token reference>` (Zone: Zone: Read and Account: Access: Apps and Policies: Edit only), reading it inside the command and never printing it. Check `CLOUDFLARE_ZONE` and `CLOUDFLARE_NAME` have values, run `docker compose up -d --wait provisioner` and confirm its log says `Access sync on.`

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

## The admin panel

Open `https://<your team host>/admin` and log in at Cloudflare as usual. Only emails on the admin list see it; an admin does not need to be a user and has no workspace of their own.

- **Users** lists everyone with their workspace state. Add a user with a name and email; open one to manage them.
- For one user, **Bots** and **Settings** show the same forms the user sees in their own app, saved straight to that user's workspace. **Devices** lists the browsers and phones they signed in with; revoking one signs it out.
- **Turn off sign-in** stops the person from logging in. **Remove user** removes their login and stops their workspace; their data stays on the server (deleting it is `bun deploy.ts purge <id>` on the server).
- **Admins** lists who can open the panel. Add or remove admins there; the last admin cannot be removed.
- When the panel says *Update Cloudflare Access by hand*, the server has no Cloudflare token: add or remove that email in the team's Access policy yourself, or run the `cloudflare emails` step from [Add a person](#add-a-person) on your computer.

The panel never pairs a device and never acts as the user in a chat. It cannot send messages, answer approvals or read conversations.

- A bot's **Routines** and **Todos** belong to the user. The panel shows them but cannot add, change, run or delete them.
- Provider sign-ins with a Claude or ChatGPT account are left out: they would put the admin's own account in someone else's workspace. Enter an API key instead.
- MCP servers that need a browser sign-in can be added, but the sign-in itself is not in the panel: the provider would send the browser back to your own login, not the user's Orbs. The user signs in from their own app.
- The app has no form to add a secret (a bot asks for one in chat), so neither does the panel. Secrets the user added show in **Settings → Secrets**.

A user whose workspace is stopped or starting shows *Can't reach this user's workspace*; use **Try again** once it runs.

**Give this to your agent:**

> On the Orbs team install at `https://<team host>`, I'm an admin. Open `/admin`, add user `<name>` with email `<email>`, then on their page create a bot called `<bot>` with model `<model>` and these instructions: `<text>`. If the panel asks to update Cloudflare Access by hand, run the `cloudflare emails` step from the "Add a person" section of `docs/team-workspace/admin.md` in my checkout. Confirm the bot appears in their Bots tab.

## Set up bots, skills and tools for a person

Users can do all of this themselves in the app, and an admin can do it for them in the [admin panel](#the-admin-panel). For files the forms do not cover, edit their volume:

| What | Where, inside the person's volume |
| --- | --- |
| Skills for all their bots | a folder per skill in `/data/home/.agents/skills/` |
| Instructions for all their bots | `/data/home/.agents/AGENTS.md` (a bot only reads it when instruction inheritance is turned on for it) |
| MCP servers for all their bots | `/data/home/.agents/mcp.json` or `/data/pi/mcp.json` |
| Skills for one bot | `/data/agents/<bot>/.pi/skills/` |
| MCP servers for one bot | `/data/agents/<bot>/.agents/mcp.json` or `/data/agents/<bot>/.pi/mcp.json` |

Skill and instruction changes show up within about 30 seconds. Files must be owned by the container user.

**Give this to your agent:**

> On `root@<server>`, add the skill in `<local folder>` for all bots of Orbs user `<name>`: copy it to `/data/home/.agents/skills/<skill name>/` in their volume, owned by the container user. Don't restart anything. Confirm the skill appears in their bot's skill list within a minute.

### Create a bot for someone

Each person's Orbs has a private door: its owner socket, which only the server can reach. It accepts the same settings and bot changes as the app, but nothing that reads or sends chat messages, answers approvals or pairs a device. The admin panel uses it; use the panel when you can. Without the panel, call it from inside the person's container:

```sh
docker compose exec daemon-<id> bun -e 'const r = await fetch("http://localhost/rpc/bots/create", { method: "POST", unix: "/data/data/ipc/rpc.sock", headers: { "content-type": "application/json", "x-bots-protocol": "1" }, body: JSON.stringify({ json: { name: "Helper", handle: "helper", modelProvider: "anthropic", modelId: "claude-sonnet-4-5", thinkingLevel: "low" } }) }); console.log(r.status, await r.text())'
```

`200` and the new bot mean it worked. `403` means the door does not serve that action. Some models refuse `thinkingLevel: "off"`, so always send one. The full list of what the door serves is in [`api.md`](../../.agents/references/api.md#owner-socket-private-door).

Don't pair a device of your own into someone's Orbs instead: it can read and act as that person.

**Give this to your agent:**

> On `root@<server>`, in `/opt/orbs`, create a bot named `<name>` with handle `<handle>` and model `<provider>/<model>` for Orbs user `<id>`. Use `docker compose exec daemon-<id> bun -e` with `fetch` to `http://localhost/rpc/bots/create` over the unix socket `/data/data/ipc/rpc.sock`, headers `content-type: application/json` and `x-bots-protocol: 1`, body `{"json": {...}}` with `thinkingLevel` set. Don't pair a device. Confirm the reply is 200 and the bot appears in `bots/list`.

## Backups

A backup is a copy of one person's whole volume: bots, chats, files, database, encryption key, model settings and home folder. Their Orbs stops for the few seconds it takes; other people are not affected.

```sh
bun deploy.ts backup <id>
```

It takes a few seconds and writes `backups/<id>-<time>.tar.gz`, readable only by root. The backup contains the person's keys: store it like a password. Copy it off the server, keeping it private:

```sh
scp -p root@<server>:/opt/orbs/backups/<id>-<time>.tar.gz <safe folder>/
```

Backups stay on the server until you delete them by name (`rm /opt/orbs/backups/<file>`).

To put a backup back:

```sh
bun deploy.ts restore <id> backups/<id>-<time>.tar.gz
```

This replaces everything in that person's volume. It first takes a fresh backup of what is there, and prints its name. Expected: `Saved the current data of <id> to backups/…` and `Restored <id> from …`, and their container healthy again.

**Give this to your agent:**

> On `root@<server>`, in `/opt/orbs`, run `bun deploy.ts backup <id>` for every user id in `users.yaml`, one after the other, then copy the new files in `/opt/orbs/backups/` to `<backup location>` without changing their permissions. Report the file names and sizes.

## Upgrades

New images arrive with a new tag. Build and load all four (`orbs-daemon`, `orbs-web`, `orbs-hub`, `orbs-provisioner`) as in [install, step 3](install.md#3-get-orbs-onto-the-server), and copy the deployment files again (`compose.yaml`, `daemon.yaml`, `cloudflared.compose.yaml`, `deploy.ts`; never `.env`). Load images before changing the tag: Docker Compose otherwise tries to download them and fails with `pull access denied`. To switch:

1. Back up everyone (above). A new version can change the database; the old version may not read it again.
2. Set the new tag in `/opt/orbs/.env`, for example `ORBS_TAG=v0.2.0`, and run:

   ```sh
   docker compose up -d --wait
   ```

   Every Orbs container restarts, which takes about 10 seconds; cloudflared stays up. Open chats reconnect on their own. Routines that were due during the restart run once when Orbs is back. `docker compose ps` should show the new tag on the hub, the provisioner, web and every daemon.

The first upgrade to a version with the admin panel needs three more things, once: add `admins:` with your email to `users.yaml`, and `HUB_ADMIN_EMAILS` and `PROVISIONER_TOKEN` to `.env` (the two commands in [install, step 7](install.md#7-start-orbs)); after `docker compose up -d --wait`, run `bun deploy.ts apply` once. It lets the provisioner write the hub's user list (the `hub` folder becomes group root, mode 770); until then every change in the admin panel fails.

To roll back, set the old tag again and run the same command. If the new version changed someone's data, restore their backup from before the upgrade.

**Give this to your agent:**

> On `root@<server>`, upgrade Orbs in `/opt/orbs` to image tag `<tag>`: confirm `docker images` lists `orbs-daemon`, `orbs-web`, `orbs-hub` and `orbs-provisioner` with that tag, back up every user with `bun deploy.ts backup <id>`, set `ORBS_TAG=<tag>` in `.env`, run `docker compose up -d --wait`, and confirm every container is healthy and the hub log shows no error. If anything fails, set the previous tag back and run the same command.

## Status and logs

```sh
docker compose ps                        # every container and its health
docker stats --no-stream                 # memory and CPU per container
docker compose logs hub --since 1h       # the hub: logins refused, users loaded, pairing
docker compose logs daemon-<id> -f       # one person's Orbs, live
```

**Give this to your agent:**

> On `root@<server>`, in `/opt/orbs`, report `docker compose ps`, `docker stats --no-stream` and any error in `docker compose logs --since 1h`. Change nothing.

## Tear down

Removes the team's Orbs from the server and Cloudflare. Back up everyone first if anything may be needed later. Do the steps in this order: the connector must stop before Cloudflare deletes the tunnel.

1. On the server, stop and remove the containers and networks. Volumes stay:

   ```sh
   cd /opt/orbs && docker compose down
   ```

2. On your computer, in the Orbs repository, list what the Cloudflare script would delete. Use the same `--zone`, `--hostname`, `--name` and, if you set up SSH, `--ssh-hostname` as at install:

   ```sh
   CLOUDFLARE_API_TOKEN="$(op read '<token reference>')" bun scripts/deploy.ts cloudflare destroy --zone <domain> --hostname <team>.<domain> --name orbs-<team> [--ssh-hostname <team>-ssh.<domain>]
   ```

   Check that every line names `orbs-<team>` or `<team>.<domain>`. Then run the same command with `--yes` to delete exactly those. Expected: one `Deleted …` line per object.

3. Only when nobody's data is needed any more, delete it on the server, by name:

   ```sh
   docker volume rm orbs_ipc $(docker volume ls -q --filter name=^orbs_data-)
   docker rmi orbs-daemon:<tag> orbs-web:<tag> orbs-hub:<tag> orbs-provisioner:<tag>
   rm -rf /opt/orbs
   ```

   This deletes every person's bots, chats, files and keys, and the backups in `/opt/orbs/backups`. Never use `docker system prune` or `docker volume prune` instead: they act on everything on the server.

**Give this to your agent:**

> Tear down the Orbs team install on `root@<server>`: run `docker compose down` in `/opt/orbs`. Then in my Orbs checkout, with `CLOUDFLARE_API_TOKEN` read from `<where you keep it>` inside the command, run `bun scripts/deploy.ts cloudflare destroy --zone <domain> --hostname <team>.<domain> --name orbs-<team>` (add `--ssh-hostname <team>-ssh.<domain>` if SSH was set up), show me the list, and check that every object carries `orbs-<team>` or `<team>.<domain>`. Run it again with `--yes` only after I confirm. Keep the volumes and `/opt/orbs` unless I say to delete the data.
