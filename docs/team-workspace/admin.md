# Admin tasks

Everyday work for the person who runs the server. Each task ends with a prompt you can paste to an AI coding agent that has SSH access to the server.

Every command here runs on the server as root, in `/opt/vinci`:

```sh
cd /opt/vinci
```

## Where each person's data lives

Each person has one Docker volume, mounted at `/data` in their container. Everything of theirs is in it:

| Path in the container | What it holds |
| --- | --- |
| `/data/data/` | the database, the encryption key for saved secrets, each bot's history |
| `/data/agents/<bot>/` | each bot's working folder and uploaded files: on the person's sandbox disk, not in the volume ([disk limits](#disk-limits)) |
| `/data/pi/` | model provider settings: `models.json` and `auth.json` |
| `/data/home/` | the person's home folder: shared skills, instructions and tool settings |
| `/home/bot/` (sandbox only) | the bots' home folder: what their bots install, and download caches. On the person's sandbox disk ([disk limits](#disk-limits)); her Vinci sees an empty folder at `/data/bot-home` |

Treat a volume as secret: it contains the person's keys. The volume of user `alice` is the Docker volume `vinci_data-alice`; her container is `vinci-daemon-alice-1`.

Her bots' tools (reading and writing files, running commands) run in a second container, her sandbox `vinci-sandbox-alice-1`. It mounts only her bot folders (`/data/agents`) and her bots' home (`/home/bot`), both from her sandbox disk, and, read only, `/data/home/.agents` of her volume, plus a small folder her Vinci shares with it (the volume `vinci_sandbox-alice`, read only there). It never sees the database, the keys, `/data/pi` or the rest of her home folder.

## Admins

The admin panel lives at `https://<team>.<domain>/admin`. Only the emails in `/opt/vinci/hub/admins.json` may open it; everyone else gets 403 there. An admin is just an email: they need not be a user and have no bots of their own. An admin who is not a user can open only the panel, nothing else.

- The first admin comes from `HUB_ADMIN_EMAILS` in `.env`, written to `admins.json` the first time the hub starts with an empty list.
- `admins.json` is the list that counts. The hub copies it to `admins:` in `users.yaml` when it starts and after every change, so Cloudflare Access lets the same people in.
- In the panel, admins add and remove other admins. The last admin cannot be removed.
- With Vinci accounts (`VINCI_AUTH=laravel`), **Add admin** also makes a login for someone who has none and shows the password once; give it to them. If it is lost, remove the admin and add them again. **Remove** deletes that login too, unless the email is also a user: their login and workspace stay.
- Each admin must also be allowed by Cloudflare Access. When the server has a Cloudflare token, the panel updates Access itself; otherwise it says so, and you add the email with the `cloudflare emails` command below.
- The panel changes a person's settings and bots through that person's owner socket. It never pairs as a device and cannot send messages or answer questions as them.
- Every change made in the panel is recorded with the admin's email: see [Activity](#activity).

> [!WARNING]
> Admins are fully trusted. Through a bot's MCP servers, plugins and skills an admin can run code inside any person's Vinci, so they can technically read that person's data. The panel only offers no way to chat or answer as someone. Make someone an admin only if you would give them the server.

**Give this to your agent:**

> On `root@<server>`, in `/opt/vinci`, show me `hub/admins.json` and the hub log lines from the last day that start with "Admin". If `admins.json` is missing or invalid, set `HUB_ADMIN_EMAILS=<my email>` in `.env`, move the broken file aside, and run `docker compose up -d hub`; confirm the log says "Admins seeded from HUB_ADMIN_EMAILS".

## The user list

`/opt/vinci/users.yaml` is the one list of people. Each person is a user id and their login email, either on one line or with a display name, whether they are enabled and whether they are an advanced user. `admins:` lists the admin panel's admins:

```yaml
users:
  alice: alice@example.com
  bob:
    name: Bob Example
    email: bob@example.com
    enabled: false
  carol:
    name: Carol Example
    email: carol@example.com
    advanced: true
admins:
  - admin@example.com
```

- The user id is short: lowercase letters, digits and dashes. It names the person's container and volume, so never reuse an id for someone else. `template` is taken: it is the template workspace (see [Global settings and suggested bots](#global-settings-and-suggested-bots)), and `apply` refuses a person with that id.
- Each email appears once under `users:`. It must match the email the person logs in with at Cloudflare.
- `name` is what the admin panel shows; it defaults to the id. `enabled` defaults to `true`. A disabled person cannot log in and has no container; their volume stays.
- `advanced` defaults to `false` (and is left out of the file then). An advanced user sees more settings in their app; see [What people see](#what-people-see). It changes nothing their workspace allows.
- Admins can log in at Cloudflare. An admin has no Vinci of their own unless they are also under `users:`.
- The admin panel changes this file through the provisioner, which rewrites it in the long form and drops comments. Don't edit it by hand while someone is changing people in the admin panel.
- After every edit, run `bun deploy.ts apply`. It writes the hub's `hub/users.json` and `users.compose.yaml` from this list and starts or stops containers to match. Never edit those two files by hand: the next `apply` overwrites them.
- `apply` never restarts the hub or the other people's containers, so nobody else is logged out.
- The hub reads the new list on the next request that reaches it, at most once a second. Its log line `Users loaded` with the new count therefore appears only after someone uses Vinci; to check right after `apply`, count the users in `hub/users.json` instead: `grep -c '"id"' hub/users.json`. It counts people only; the template workspace's entry has no id.
- If the list has a mistake, `apply` stops before changing anything and says what is wrong.

## Add a person

In the admin panel: add them with their name and email, and leave ticked the [suggested bots](#global-settings-and-suggested-bots) they should start with. It creates their Vinci with the global settings and those bots. If their email is inside the team's domain rule, or the server may update Cloudflare Access ([below](#let-the-server-update-cloudflare-access)), they can log in at once. Otherwise the panel says *<email> can't sign in yet*: do step 2 below, or add the email in the Cloudflare dashboard (Zero Trust › Access controls › Policies › `vinci-<team>-allow` › Include › Emails).

By hand:

1. Add a line for them to `users.yaml`, then run:

   ```sh
   bun deploy.ts apply
   ```

   It creates their volume, network and container and waits until the container is healthy.
2. Let them log in at Cloudflare. Skip this if their email is inside the team's domain rule (`CLOUDFLARE_ACCESS_DOMAINS` in `.env`). On your computer, in the Vinci repository, copy the list's emails into the Access policy (the Cloudflare token stays on your computer, so the server cannot do this step):

   ```sh
   ssh root@<server> cat /opt/vinci/users.yaml | CLOUDFLARE_API_TOKEN="$(op read '<token reference>')" bun scripts/deploy.ts cloudflare emails --users - --zone <domain> --hostname <team>.<domain> --name vinci-<team>
   ```

   Expected: `Access policy vinci-<team>-allow: updated` and the list of allowed emails. The command keeps the policy's domain rule as it is.
3. Send them the address, `https://<team>.<domain>`. On their first visit they type their email and enter the code from their inbox. Their browser pairs itself and shows their bots. They see no setup steps: no provider sign-in, no model choice, no bot to create. Add their bots first (in the admin panel, or see [Create a bot by hand](#create-a-bot-by-hand)).

Model keys come from the server's `.env` (see [Set model API keys](#set-model-api-keys)); a new person gets them automatically.

**Give this to your agent:**

> On `root@<server>`, add `<email>` as Vinci user `<id>`: add the line `  <id>: <email>` under `users:` in `/opt/vinci/users.yaml`, and run `bun deploy.ts apply` in `/opt/vinci`. Confirm `docker compose ps` shows `vinci-daemon-<id>-1` healthy and `grep -c '"id"' /opt/vinci/hub/users.json` equals the number of enabled people in `users.yaml`. Then, in my Vinci checkout with `CLOUDFLARE_API_TOKEN` read from `<where you keep it>` inside the same command, run `ssh root@<server> cat /opt/vinci/users.yaml | bun scripts/deploy.ts cloudflare emails --users - --zone <domain> --hostname <team>.<domain> --name vinci-<team>` so they can log in, unless their email ends in one of the domains in `CLOUDFLARE_ACCESS_DOMAINS` in `/opt/vinci/.env`. If it says the token is empty, ask me to unlock my password manager.

## Disable a person

Disabling locks someone out without deleting anything: they cannot log in, their container stops and is removed, and their volume stays. Enabling them again starts a new container on the same volume.

In the admin panel, switch them off. By hand, set `enabled: false` in their entry in `users.yaml` (the long form above), run `bun deploy.ts apply`, then update Cloudflare Access as in [Add a person](#add-a-person), step 2 (not needed with a domain rule: the hub already refuses them).

**Give this to your agent:**

> On `root@<server>`, disable Vinci user `<id>`: in `/opt/vinci/users.yaml` turn their entry into the long form with `name`, `email` and `enabled: false`, run `bun deploy.ts apply` in `/opt/vinci`, and confirm `vinci-daemon-<id>-1` is gone, their volume `vinci_data-<id>` still exists and `hub/users.json` no longer lists their email. Then update the Access policy with `cloudflare emails` as in "Add a person". Don't delete their volume.

## Remove a person

In the admin panel: delete them. Their login goes, their container stops and is removed, their volume stays. By hand:

1. Delete their entry from `users.yaml` (their one line, or in the long form their id line and the lines under it), then run:

   ```sh
   bun deploy.ts apply
   ```

   The hub refuses them within about a second and closes their open connections. `apply` then stops and removes their container and network. Their volume stays.
2. Take their email out of the Access policy with the same command as when adding someone. With a domain rule there is nothing to take out: they can still get a login code, but Vinci refuses them.

   ```sh
   ssh root@<server> cat /opt/vinci/users.yaml | CLOUDFLARE_API_TOKEN="$(op read '<token reference>')" bun scripts/deploy.ts cloudflare emails --users - --zone <domain> --hostname <team>.<domain> --name vinci-<team>
   ```
3. Keep their volume and sandbox disk (a removed or disabled person's disk stays mounted) until you have a backup or are sure it is not needed. To delete it for good:

   ```sh
   bun deploy.ts purge <id>
   ```

   This deletes their volume, their sandbox disk (`disks/<id>.img`), their sandbox's volume and network, their owner-socket folder and the hub's saved ID for them. It restarts the hub, which takes a few seconds; everyone's open chats reconnect on their own. It refuses while the id is still in `users.yaml`.

   It keeps the [audit trail](#activity) rows about them: those are a record of what admins did, not the person's data.

**Give this to your agent:**

> On `root@<server>`, remove Vinci user `<id>` (`<email>`): delete their entry from `/opt/vinci/users.yaml` (one line, or their id and the indented lines under it), run `bun deploy.ts apply` in `/opt/vinci`, and confirm their container is gone and `grep -c '"id"' /opt/vinci/hub/users.json` equals the number of people left. Then, in my Vinci checkout with `CLOUDFLARE_API_TOKEN` read from `<where you keep it>` inside the same command, run `ssh root@<server> cat /opt/vinci/users.yaml | bun scripts/deploy.ts cloudflare emails --users - --zone <domain> --hostname <team>.<domain> --name vinci-<team>`. Keep their volume.

## The admin panel's provisioner

The admin panel adds, disables and removes people through the provisioner, a small service in the stack. It runs exactly the same `bun deploy.ts apply` as you do by hand, one change at a time, and answers only the hub, with the secret `PROVISIONER_TOKEN` from `.env`, on a network only the two share. It cannot do anything else: no other Docker commands, no backups, no purges.

A change waits only for that person's Vinci to start, so another person's broken container does not block it. If a change fails, an add or a switch-on is undone in `users.yaml`, so you can simply try again; a switch-off or removal stays done, so the login stays gone. The panel and `bun deploy.ts apply` by hand never run at once: whichever comes second stops with *Another apply or admin panel change is running* and can be repeated a minute later.

> [!WARNING]
> The provisioner holds the Docker socket, which is full control of the server. A flaw in the provisioner, or anyone who gets `PROVISIONER_TOKEN` and can reach it, could take over the server. Only the hub can reach it, so the hub is now part of what protects the server: keep images current and keep `.env` readable by root only. To turn the panel's user changes off, stop it with `docker compose stop provisioner`; the panel then cannot add or remove people, and `bun deploy.ts apply` by hand still works.

**Give this to your agent:**

> On `root@<server>`, in `/opt/vinci`, check the provisioner: `docker compose ps provisioner` must be healthy, `docker inspect vinci-provisioner-1` must show `ReadonlyRootfs` true, `CapDrop [ALL]`, no `CapAdd`, no `PortBindings`, and only the networks `vinci_provisioner` and `vinci_egress`; `docker network inspect vinci_provisioner` must list only the hub and the provisioner. Report `docker compose logs provisioner --since 1h` without secrets. Change nothing.

## Let the server update Cloudflare Access

Without a Cloudflare token on the server, the admin panel adds and removes people but cannot change who may log in: for anyone outside the team's domain rule it tells you to change the Access policy by hand (step 2 of [Add a person](#add-a-person)). With a list of emails, the install recommends this token. To let the server do it, create a second, smaller Cloudflare API token (My Profile › API Tokens › Create Token › Create Custom Token) with only:

- Account › Access: Apps and Policies › Edit, for your account
- Zone › Zone › Read, for your domain

A token with Access: Apps and Policies › Read instead of Edit only lets the panel show whom Cloudflare lets in; changes then still say *can't sign in yet* for people outside the domain rule.

Don't reuse the install token: it can also change the tunnel and DNS. Store it in `/opt/vinci/.env` as `CLOUDFLARE_API_TOKEN`, then recreate the provisioner:

```sh
ssh root@<server> 'cd /opt/vinci && sed -i "/^CLOUDFLARE_API_TOKEN=/d" .env && cat >> .env && docker compose up -d --wait provisioner' < <(printf 'CLOUDFLARE_API_TOKEN=%s\n' "$(op read '<token reference>')")
ssh root@<server> 'cd /opt/vinci && docker compose logs provisioner | grep listening | tail -1'
```

Expected: `Access sync on.` (followed by `domain rule @<domain>` with a domain rule). It needs `CLOUDFLARE_ZONE` and `CLOUDFLARE_NAME` in `.env` too (install step 6 writes them); without them the provisioner refuses to start and says so. Anyone with root on the server can read the token. With it, the allow policy follows `users.yaml`: enabled users and admins, apart from those inside the domain rule, which only `cloudflare apply --domain` changes. Removing the line and recreating the provisioner turns it off again.

**Give this to your agent:**

> Create nothing in Cloudflare. On `root@<server>`, in `/opt/vinci`, set `CLOUDFLARE_API_TOKEN` in `.env` to the token at `<token reference>` (Zone: Zone: Read and Account: Access: Apps and Policies: Edit only), reading it inside the command and never printing it. Check `CLOUDFLARE_ZONE` and `CLOUDFLARE_NAME` have values, run `docker compose up -d --wait provisioner` and confirm its log says `Access sync on.`

## Set model API keys

The admin sets provider keys once, in `/opt/vinci/.env`. Every person's Vinci gets them:

```sh
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
```

Supported: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `MISTRAL_API_KEY`, `GROQ_API_KEY`, `XAI_API_KEY` and `DEEPSEEK_API_KEY`. Leave a line empty to skip that provider. After a change, restart the daemons:

```sh
docker compose up -d --wait
```

This restarts only the containers whose settings changed: every person's Vinci, not the hub or the web app.

> [!WARNING]
> Every person's bots can read these keys until the hardening phase. A bot that runs commands sees them in its environment. Use keys with a spending limit, and only with people you trust.

An advanced user can also add their own key in Vinci, **Settings → Models** (see [What people see](#what-people-see)); you can do it for anyone in the panel. Theirs wins over the shared one.

Do not use a Claude or ChatGPT subscription login for the team. The providers' terms do not allow one subscription to serve several people.

**Give this to your agent:**

> On `root@<server>`, set the `<provider>` API key for Vinci: read it from `<where you keep it>`, write it as `<VARIABLE>` in `/opt/vinci/.env` without printing it, then run `docker compose up -d --wait` in `/opt/vinci` and confirm every `vinci-daemon-*` container is healthy.

## The admin panel

Open `https://<your team host>/admin` and log in at Cloudflare as usual. Only emails on the admin list see it; an admin does not need to be a user and has no workspace of their own.

- **Users** lists everyone with their workspace state. Add a user with a name and email; open one to manage them.
- For one user, **Bots** and **Settings** show the same forms the user sees in their own app, saved straight to that user's workspace. A person's **Settings** has no *General* tab: notifications, where they go, and appearance are the person's own choices, made in their app. **Devices** lists the browsers and phones they signed in with; revoking one signs it out. Below it, **Rate limits** sets how much that person's Vinci accepts before it answers *too many requests*: requests per minute from each device and in total, pairing attempts per minute, and requests and live updates at the same time. Each field shows its default and its allowed range, and the person's Vinci refuses a value outside it. Limits are per person, not part of global settings; each save is recorded in **Activity**. People can't change their own limits.
- **Advanced user** (a switch on the person's page) shows them the advanced settings in their own app; see [What people see](#what-people-see). Off for everyone until you turn it on, and recorded in **Activity** as `users/advanced` `on` or `off`.
- With password logins (`VINCI_AUTH=laravel`), adding a person also creates their login account, and the panel shows their password once, with **Copy**: give it to them, since it is not shown again. **Reset password** on the person's page asks first, then shows a new one the same way; the old password stops working, browsers already signed in stay signed in. **Remove user** also deletes their login account, except for an admin from the admin list, who keeps it to open the panel. Turning sign-in on for someone who has no login account yet (a person added before the switch to passwords) creates it and shows its password. If the accounts service does not answer, the panel says so and nothing changes. Admins in `HUB_ADMIN_EMAILS` get their account at install, not from the panel; the panel hides the Cloudflare Access states in this mode.
- **Turn off sign-in** stops the person from logging in. **Remove user** removes their login and stops their workspace; their data stays on the server (deleting it is `bun deploy.ts purge <id>` on the server).
- **Global settings** edits the template workspace: the team's default settings and the suggested bots. Each person follows each section or overrides it; see [Global settings and suggested bots](#global-settings-and-suggested-bots).
- **Admins** lists who can open the panel. Add or remove admins there; the last admin cannot be removed.
- Each user and admin shows whether Cloudflare Access lets them in. *Not allowed in Cloudflare* is highlighted for someone who should be able to sign in: they get no login code until their email is in the team's allow policy. Without a Cloudflare token on the server the state is *unknown*, with one line saying why.
- With a domain rule, a notice above the users says that anyone at that domain can request a login code and only the people listed get in.
- When the panel says *<email> can't sign in yet* (or *Remove <email> from Cloudflare Access*), the server could not change the policy: add or remove that email in the Cloudflare dashboard (Zero Trust › Access controls › Policies › `vinci-<team>-allow`), or run the `cloudflare emails` step from [Add a person](#add-a-person) on your computer.

The panel never pairs a device and never acts as the user in a chat. It can read a person's conversations (see [Reading a person's conversations](#reading-a-persons-conversations)) but cannot send messages, answer approvals or questions, react, stop, clear or change anything in a chat.

- **Conversations** shows a person's chat with each of their bots, read only: search (press Enter), older messages as you scroll up, and **Refresh** for anything new. Details below.

- A bot's **Routines** and **Todos** belong to the user. The panel shows them but cannot add, change, run or delete them.
- Provider sign-ins with a Claude or ChatGPT account are left out: they would put the admin's own account in someone else's workspace. Enter an API key instead.
- A bot's **MCP servers** tab has **Edit as JSON**: the servers only that bot uses, in the usual `mcp.json` format (`{ "mcpServers": { … } }`), one or many at once. Each server is a `url` (with `headers`) or a `command` with `args` (and `env`). The `url` is `https`, or plain `http` only for an internal service whose IPv4 address and port are in `VINCI_INTERNAL_ALLOW` (`http://172.17.0.1:48290/mcp`, port 80 when omitted; a name such as `localhost` is refused). A header is sent whole: type `"Authorization": "Bearer <token>"` in `headers`. A secret's hosts are names, never IP addresses, so for an internal service type the value instead of using `secrets.NAME`; names are lowercase letters, numbers and dashes. Values you type in `env` and `headers` are saved encrypted, and the editor then shows a reference (`mcp.…`) in `envCredentials` or `headerCredentials` instead: leave it to keep the value, or type a new one (in `headers`, or right there in place of the reference: anything that is not `secrets.…` or `mcp.…` counts as a typed value). An error names the server and the field to fix. `secrets.NAME` uses a secret the person already has (a header secret only for its allowed hosts). Saving replaces the whole list and reconnects the bot's servers; shared servers from Sources are not in it. Only the panel can save it: the person's own app answers *Your admin manages this*.
- MCP servers that need a browser sign-in can be added, but the sign-in itself is not in the panel: the provider would send the browser back to your own login, not the user's Vinci. The user signs in from their own app.
- The app has no form to add a secret (a bot asks for one in chat), so neither does the panel. Secrets the user added show in **Settings → Secrets**, and you can remove them there.
- A bot's commands see only a placeholder for each secret. The person's Vinci swaps in the value only over HTTPS to the secret's allowed hosts. Whatever those hosts send back has the value replaced by the placeholder again, at any size: in the body (also when compressed with gzip, br, deflate or zstd; another compression is refused), in headers such as a redirect's address, and in the forms a value is usually echoed in (URL-encoded, base64, inside a Basic sign-in). A host that changes the value some other way before sending it back can still hand it to the bot, so give a secret only hosts you trust with it. Uploads and downloads of any size stream through without being held in memory, and the proxy answers only the person's own bots (it listens inside their Vinci, reachable from their sandbox). Images built before the Bun 1.4.4 pin refused every such request with *Proxy authorization required*, so secrets work only after you upgrade to an image from that pin or later.

A user whose sign-in is off shows *This workspace is stopped because sign-in is off*: turning sign-in on starts it again. A workspace that is stopped for any other reason, or still starting, shows *Can't reach this user's workspace*; use **Try again** once it runs.

### Reading a person's conversations

An admin can read every conversation a person has with their bots, read only, in the person's **Conversations** tab. It goes through the same private door as the forms; the admin never pairs a device or uses the person's own address.

**What you can read**

- One chat per bot. Hidden and muted chats are listed too.
- The messages, photos (click to enlarge) and files (click to download), tool calls with the approval asked and its answer, answers to the bot's questions, and silent turns, as they happened. Scroll up for older messages.
- A subagent run: click its card to read what it did. A private conversation between two of the person's bots: click the bot's name in *Messaged …* to read it.
- An artifact: click its card to open it read only, at the version that message made. **Version** lists the other versions the bot keeps; pick one to see it. It looks as in the person's app, but nothing you tick, type or pick is saved, and you can't rename or restore it. Closing the pane forgets what you changed. Outside content is off until you load it (next part).
- What waits for the person: an approval a bot asked for shows as **Waiting for approval** with the command or tool and what it would do; a bot's question shows as **Waiting for an answer** with its text and choices (a secret question names the secret, never a value). Only the person can answer, in their app; the panel has no buttons for it.
- Search: type and press Enter. It searches every chat of that person; a hit opens the chat at that message. Like the app's search, it looks at recent messages first, so an old match may need a more recent word.

**Outside content stays off until you load it**

The viewer loads nothing from outside servers on its own. A picture in an artifact or a message whose address is on another server shows as a grey box with its description, a reaction GIF shows as its emoji, and a page (an HTML artifact, or a page in a message) shows without its scripts, links and inner frames. Where that happened, a line says *Outside content is off here. Loading it can be used for tracking, analytics and spying on who opens this.* with a **Load outside content** button. A picture from outside tells its server your IP address, your browser and when you opened it; a page's script can do the same through a network probe (WebRTC) that no browser setting blocks inside the page, which is why scripts are off too.

Press **Load outside content** only when you need to see it. The hub records the click first (one row, *Loaded outside content*, with the person, the bot and the conversation), then that one artifact or message loads as in the person's app: its pictures load, and a page runs its scripts in the app's sandbox (it still cannot make requests, open windows or post forms; only the WebRTC probe and sending its own frame to an address get out, and the panel then closes the page and says so). Nothing is remembered: closing the pane, picking another version or opening the chat again turns it off. If the hub cannot record the click, nothing loads and the panel shows an error.

Without scripts a page can still be clicked, but a link inside it no longer opens: the app refuses any address in a page's frame, so the panel closes the page instead.

**What leaves no trace**

Reading changes nothing the person sees: nothing is marked read, unread counts, order, pins, hidden and muted flags stay as they were, and no bot runs or notifies anyone. The panel reads when you open a chat, scroll up or press **Refresh**, never in the background.

**The audit trail**

Every read is recorded with your email, the person, the bot and the conversation, never the content: one row when you open a chat, press **Refresh** or load older messages, one per chat searched, one per file opened, one per artifact version opened, one for the waiting approvals and one for the waiting questions when something is waiting (opening a chat with nothing waiting adds no row for them), one each time you press **Load outside content**, and one when the person's Bots tab reads their routines or todos. See them under [Activity](#activity). If the hub cannot record a read, it refuses the read: the panel shows the chat or file as failed, and nothing is shown unrecorded.

**What the panel does not show (known gaps)**

- A reply still being written appears after **Refresh**; so does an approval or question asked after you opened the chat.
- Links show without a preview or a site icon. A preview is fetched live by the person's Vinci each time (it stores none), so showing one would make their workspace fetch an address of your choice, and the preview's picture and the icon would load in your browser from outside sites. Previews were removed in the wave 3 review for that reason, and stay off.
- A page without its scripts may look incomplete (charts drawn by script stay empty and the frame keeps a fixed height; it still gets the panel's colours). The notice shows on every page that has script, since the panel cannot tell what a script would do without running it.
- After **Load outside content**, a picture address can point at the panel's own read addresses, so your browser makes that read as you: it shows nothing to the bot, but a file read through it is recorded as yours.
- **Cleared history is gone.** When the person clears a chat, its messages, files, subagent runs and private conversations are replaced by an empty chat; only the routines, todos and the latest version of each artifact carry over. You then see the same as the person.
- The template workspace has no conversations with anyone.
- There is no export.

**Give this to your agent:**

> On the Vinci team install at `https://<team host>`, I'm an admin. Open `/admin`, add user `<name>` with email `<email>`, then on their page create a bot called `<bot>` with model `<model>` and these instructions: `<text>`. If the panel says they can't sign in yet, run the `cloudflare emails` step from the "Add a person" section of `docs/team-workspace/admin.md` in my checkout. Confirm the bot appears in their Bots tab.

## The app on phones and computers

People install the web app themselves and turn notifications on in **Settings → General → Notifications**; send them [Install the app on your phone and computer](install-app.md). There is nothing to set up: each person's Vinci makes its own Web Push key the first time a browser asks for notifications and keeps it encrypted in its own data, and it sends notifications to the browsers' push services (Google, Apple, Mozilla, Microsoft) over the public internet, which daemons already reach. A backup and restore keeps the key, so installed apps keep their notifications.

## What people see

People whose email is in the admin list see **Admin panel** in the user dropdown at the bottom of the sidebar. It opens `/admin`; the hub checks admin access on every request. **Back to app** in the admin header returns to `/rooms`.

The app a person opens is simpler than the one a single owner gets: it hides what most people never need. Hiding is not a permission; the panel always shows you everything, whatever a person sees.

**Everyone sees:** appearance, the Enter key and notifications; sidebar sections, pin, hide and mute; artifacts and every chat action; a bot's replies without its steps (no tool calls, thinking or *N steps* line), and while it works a plain status line such as *Gathering data* or *Searching the web*, in their app's language, never a tool's name, query or file; approvals while they wait (once answered, or expired, nothing of them stays in the chat). Hiding the steps is the app's: their device still receives them, and the phone app still shows them; answering a bot's questions, a secret included; routines and todos; resetting a chat; removing their own devices and stored secrets; creating and deleting bots; a bot's name, handle, avatar, instructions, *Also read the shared instructions*, skills, *Use shared plugins*, shared MCP servers on and off, adding MCP servers from the presets and removing them, MCP sign-in with their own account; and a bot's main and fallback model and reasoning, from the providers you configured. Each bot's **Tools** tab also lists its [always approved tools](#always-approved-tools), which they can remove.

**Only an advanced user (or an admin) sees:** a bot's steps, the tool calls and thinking behind each reply; **Settings → Chat**'s workspace settings (new messages while a bot works, hiding tool calls and thinking, GIFs); **Settings → Models** (adding a provider key, subscription sign-in, sign-out, *Replace a model across bots*); the Jev key in **Settings → Tools**, only while you have overridden their Tools (to give one person their own key, override their Tools in the panel and set it there); **Settings → Sources**.

**Nobody sees (you set these in the panel):** a bot's permission level; approval rules and the approval timeout; how bots use secrets; **Settings → Server**; the desktop app's connection settings; *Create pairing PIN*; the avatar and chat lab links.

New bots a person creates start at **Ask first**, the app's default.

**A bot's page waits for one click.** An HTML page a bot makes (an artifact or a page in a reply) that has script shows without it, under *This page's code is off until you run it…*, until the person presses **Run page**; that browser then remembers that exact page, and a changed page asks again. Script in a page can tell an outside server that someone opened it (WebRTC and Chrome's early connections, which no content rule stops), and a bot tricked by a web page could write one. Artifacts built from blocks (charts, lists, checklists), pictures and GIFs load as before. On the web and in the desktop app; the phone app's pages still run at once. A page never reaches the app's cookies, storage or the hub, and since this change cannot open any address in its frame either.

**Refused for everyone, advanced or not:** each person's Vinci itself refuses a few security settings from any of their devices, so these hold even in an old browser tab or the phone app: changing a bot's permission level, approval rules and the approval timeout, how bots use secrets, changing or removing a global secret, adding an MCP server that runs a command on the server (the presets are web addresses and work), editing a bot's MCP servers as JSON, and rate limits. They answer *Your admin manages this*. You change all of them in the panel (rate limits on the person's **Devices** page). A bot can't add a command MCP server for them either.

A settings section that follows global shows *Managed by your admin* above the values, which can't be changed there: its add, remove, edit and **Save** buttons are hidden, and Tools shows only whether a Jev key is set. The panel's sections that follow global hide the same buttons; there Tools still shows the approval rules and timeout, with the Jev key's state instead of its field. Where a normal person can't open **Settings → Sources**, a bot's *Also read the shared instructions* and its empty skills list say your admin sets them instead of pointing there. An advanced user also gets **Change it for me** on Models, Chat and Sources (not on Tools or Secrets, which only you override): that section becomes **Overridden** for them (you see it in the panel and in **Activity** as `sections/overridden`, by their email), they can edit it, and later global changes leave it alone until you use **Back to global**. **Settings → Secrets** is the exception: it always lists every secret, global ones marked *From your admin*, and the person can remove their own whether or not the section follows global.

The switch, and a section you switch back to global, reach the person's open app within about a minute, or when they load it again. Phone and desktop apps that don't load the web app still show everything (see the team workspace notes); the security refusals apply to them too.

## Global settings and suggested bots

Besides one Vinci per person, the server runs one more: the **template workspace** (`daemon-template`, volume `vinci_data-template`). Nobody logs into it and it is never in Cloudflare Access. `apply` always keeps it running; you never add it by hand. It holds two things:

- **Global settings.** Its settings are the team's defaults, edited in the admin panel with the same forms as a person's. There are five sections: Models (provider API keys and the model for new bots), Chat (busy mode, hide tool calls, GIFs), Tools (approval rules and timeout, the Jev key), Secrets and Sources (shared skill, instruction, plugin and MCP folders, and the files in its `~/.agents`).
- **Suggested bots.** Its bots are offered when you add a person.

For each person, each section either **follows global** or is **overridden**:

- A new person follows every section, and gets the template's values before *Add user* finishes.
- Saving a section on the template copies it to everyone who follows that section, within seconds.
- While a person follows a section, the panel cannot change that section for them (the hub answers `409 SECTION_FOLLOWS_GLOBAL`). Switch the section to *overridden* to edit it for that person; their current values stay.
- Switching a section back to *global* copies the template's values in again, replacing theirs: for Sources it replaces their `~/.agents` folder, for Models it signs out API keys the template doesn't have. The panel lists exactly this before you confirm, including a stored provider entry with an empty key and a global secret whose value is missing, which the copy also removes. A provider whose key is in the person's own `models.json` is listed as *Global's key will be used instead*: the template's stored key takes over, and the file itself is not changed. Not listed, because global never carries them: account sign-ins (OAuth), which stay unless the template has a key for the same provider; and inside `~/.agents`, `node_modules`, `.git` folders and symlinks, which the replace removes. If the person's `~/.agents` is over 2000 files or 6 MiB, the list shows the Sources settings only and says the folder is too large to list; confirming still replaces the whole folder.
- Overriding a section while a copy to that person is running keeps the override: the copy skips sections that are no longer global.
- A person who is turned off catches up when you turn them on again.
- If a copy fails (for example, the person's Vinci was restarting), the section shows *failed* with the reason. *Sync now* (`POST /admin/api/global/sync`) tries again.
- After an upgrade or a rollback the hub copies every global section again by itself the first time it starts, as *Sync now* does, and **Activity** shows it as `global/sync` by `hub start`. Overridden sections are left alone. A plain restart (the nightly backup, removing a user, a server restart) copies nothing, unless someone was left *failed*. A person whose Vinci does not answer is tried again for about a minute, then shows *failed* until the next *Sync now* or hub start; a person who is turned off catches up when you turn them on. A template file you edit by hand reaches people with *Sync now*.
- Secrets come in two kinds. **Global secrets** come from the template; they show *From your admin*, and the person can't remove or change them. **Their own secrets** are the ones they gave a bot. A sync and **Back to global** never touch them, and the person can remove each one in **Settings → Secrets**, whichever mode the section has. You see them by name on the person's **Settings → Secrets** and can remove them there, even while the section follows global. *How bots use secrets* stays yours alone.
- If the template has a secret with the same name as one of the person's own, the global one wins: the next sync replaces the person's value, and it is gone. The **Back to global** list shows such a secret as *replaced*. If a bot later asks the person for a global secret's name, their answer is not stored; the bot uses the global value.
- If you remove a global secret from a person through the API while the section follows global, the next sync puts it back. To take one away from one person, override their Secrets first.
- A person whose Vinci `apply` creates empty follows every section, like one added in the panel: the people you write in `users.yaml` before the first `apply`, and a line you add later. Within seconds the hub copies Global settings to them, so a key you saved under Models reaches them with no click. People whose Vinci already had data when global settings arrived (an upgrade) start with every section *overridden*: nothing of theirs is replaced until you switch a section to *global*. `apply` writes who it created empty to `hub/new-users.json`, and the hub deletes the file once it has acted on it, so each person is made to follow global once: restoring an older `global.json` or hub folder later never puts anyone back on global.
- A bot form with no model to pick says why: no model provider is set up. In the panel it links to Global settings → Models, or to the person's own Settings → Models when they override Models. A person sees that their admin has not set up a model yet; an advanced person gets a link to Settings → Models.

Suggested bots: tick them in *Add user*, or copy one later from the person's page. A copy is a new bot of that person, with the same name, avatar, instructions, model, fallback, approval mode and the bot's own skill, instruction and MCP files. Conversations, routines and todos are never copied. The copy is independent: changing the template bot later does not change it. A copy does not start the bot: nothing calls a model until the person arrives. The first time the person opens the bot's chat on one of their devices, the bot starts once: it introduces itself and sets up the routines its instructions describe (for example "check the inbox every hour"). Opening the bot or its conversation in the panel does not start it. A copy fails if the person already has a bot with that handle, or if the bot's own files are over 2000 files or 6 MiB; the panel names each bot it couldn't copy, and a failed copy leaves nothing behind, so you can fix it and copy again. Links, FIFOs and hard links in the template bot's folder are never copied; the panel then says *Copied without files that are links or special files, which are never copied:* and names them.

What global settings cannot carry:

- Sign-ins with a Claude or ChatGPT account (OAuth). They are bound to one Vinci and stay where they are; only API keys are copied. A person who follows Models keeps their own sign-ins.
- `models.json` (a provider's address or custom models). A person added in the panel gets none. If your provider needs one (a gateway, a proxy, a local model), write it into each new person's `/data/pi/models.json` as uid 1000 and restart their container, as before. A key stored in Global settings → Models wins over the `apiKey` in a person's `models.json` for the same provider (the file itself is kept), and the *Back to global* list says so for that provider: if each person has their own key in `models.json`, leave that provider out of Global settings or keep their Models overridden.
- Files outside `~/.agents` in the template, and `node_modules` or `.git` folders inside it: a plugin that needs its dependencies must have them installed for each person. A shared folder path pointing elsewhere is copied as a path; the files there are not. After you change template files by hand, run *Sync now* for Sources: editing files does not trigger a copy. A Sources copy reaches each person's sandbox at once, with no restart: their bots' tools and MCP servers that run a command see the new `~/.agents` as soon as the copy ends. During the copy a bot sees each file either old or new, never half written, so a skill folder can briefly mix old and new files.
- Anything of a person's own bots. A global save never changes a bot's settings, skills or files.
- Notification and device settings, the theme and the Enter key: they belong to one person or one browser.
- Sign-ins to MCP servers that use OAuth: like provider sign-ins, each person signs in for themselves.
- Links inside `~/.agents`: a symlinked file or folder is skipped, never followed.

The template workspace is a full Vinci: 90-130 MiB of memory idle, like a person's; plan it as one more person. Back it up like a person: `bun deploy.ts backup template`. It can't be purged.

### In the panel

**Global settings** in the panel's top bar opens the template workspace with the same forms as a person's settings.

- **Settings** has the sections that can be shared: Models, Chat, Tools, Secrets and Sources. Saving one copies it to every person who has not overridden that section. The copy runs in the background.
- On a person's **Settings**, each of those sections says **Global** or **Overridden**. A global section is read-only there. **Override for this person** makes it editable with the person's own values. **Back to global** first shows what that person would lose: what will be removed, what will be replaced with the global value (for Secrets, also their own secret with a global secret's name) and what will be added, by name only (never a secret or key value), or says that nothing will be lost. Confirm replaces the person's values for that section with the global ones. If the person's workspace or the global settings don't answer, the list can't be shown and there is nothing to confirm. If anything changed after the list was shown, the switch is refused and the list reloads. A turned-off person's Vinci is stopped, so their sections can't be switched back to global from the panel until you turn them on again.
- *Copying the global values…* means a copy is running. *Couldn't copy the global values* shows the reason and a **Try again** button.
- **Models → Model for new bots** is the model (with its reasoning level and fallback) that a bot starts with when someone creates one, in their app or in the panel. They can still pick another of the configured models. It travels with the Models section: a person who follows Models gets yours, one who overrides it keeps their own (set in the panel on their **Settings → Models**), and **Back to global** lists it when it would change. With none set, or when the chosen model is not offered to them, the form starts with the newest model, as before. A model is not checked when you pick it, only offered in the form when that person's Vinci has it.
- **Suggested bots** are bots you create in Global settings with the usual bot form. In a team install that form has **Also read the shared instructions** (the bot's Instructions tab) on for a new bot, and so does a bot a person creates: every bot reads the shared instruction files in Sources unless someone turns it off. A copy keeps the switch as the suggested bot has it, so turn it on in each suggested bot made before this change; bots people already have are not changed. Creating or editing a bot in the panel never starts it (no model call): it starts the first time the person opens its chat. **Add user** lists them, all ticked; the ticked ones are copied to the new person. On a person's **Bots**, **Add from suggested bots** copies more later. Copies are independent: changing a suggested bot later does not change anyone's copy.
- **Sync status** shows, per person, which sections they override and whether the last copy failed. A person whose sign-in is off shows *Sign-in off* instead of *Syncing*: their sections catch up when sign-in is turned on. **Sync now** copies every global section again.

**First setup, in this order:** in Global settings add a model provider's API key under Models first (people then need no sign-in of their own, and without one nobody's bot form has a model to pick), set the other sections, create the suggested bots, then add people with the bots each should start with. People from `users.yaml` already follow every section, so whatever you set reaches them too; give them suggested bots with **Add from suggested bots** on their **Bots**.

**Give this to your agent:**

> On the Vinci team install at `https://<team host>`, I'm an admin. Open `/admin`, go to **Global settings → Settings → Tools** and set the approval timeout to `<minutes>`. Then open **Sync status** and confirm no person shows *Sync failed*; for any that does, open them, read the error and use **Try again**. Finally open user `<name>`, confirm their Tools section says Global and shows the new timeout.

## Activity

**Activity** in the admin panel lists what admins read and changed, newest first: when, which admin, what happened, whose workspace (or *Global settings*), and the bot (by name, or the start of its id once deleted) and conversation when there is one. Filter by admin, person and kind (reads or changes); click an admin or a person in a row to filter by them; **Load more** shows older rows. A person's page has an **Activity** button that opens the list for that person. Nobody can edit or delete a row in the panel, and reading the list is not itself recorded.

What is recorded, one row each, never content or values:

- Reads: a conversation list, history or search, a person's routines or todos, a file opened, and **Load outside content** pressed in a conversation.
- Changes: a person added, renamed, their sign-in turned on or off, or removed; an admin added or removed; a settings section switched to global or overridden; a global sync; suggested bots copied; and every save in a person's or the template's settings and bot forms, recorded as the form's action (for example `secrets/save`) and the bot it names. What was typed into the form, an API key or a secret value included, is never stored. A refused attempt is recorded too, with its status.

The rows live in `hub/audit.sqlite`, next to `admins.json`. Restarts, upgrades, `apply` and rollbacks keep it (an older hub leaves the file alone, and what admins do while it runs is only in its log), and the [hub folder backup](#backups) includes it. If the hub cannot write a row, a read is refused, and a change still happens and the hub logs `The audit trail could not record a change; the change stands` (refusing a change that was already made would only make you make it again). The hub also writes each row to its log as a `hub-audit` line, as before; that copy goes with the hub container.

To read the newest rows on the server without the panel (read only, safe while the hub runs; times in UTC):

```sh
bun -e 'const { Database } = require("bun:sqlite"); const db = new Database("hub/audit.sqlite", { readonly: true }); console.table(db.query("SELECT id, created_at, admin, kind, action, detail, user_id, status FROM audit ORDER BY id DESC LIMIT 20").all().map((row) => ({ ...row, created_at: new Date(row.created_at).toISOString() })))'
```

A row takes about 120 bytes: 10,000 rows, a busy month for a small team, are about 1.2 MB, so a year stays well under 20 MB. Nothing is pruned. To remove old rows by hand, stop the hub, delete them, and start it again:

```sh
docker compose stop hub
bun -e 'const { Database } = require("bun:sqlite"); const db = new Database("hub/audit.sqlite"); console.log(db.run("DELETE FROM audit WHERE created_at < ?", [Date.parse("2026-01-01")]).changes, "rows removed"); db.run("VACUUM")'
docker compose start hub
```

## Set up bots, skills and tools for a person

Users can do all of this themselves in the app, and an admin can do it for them in the [admin panel](#the-admin-panel). For files the forms do not cover, edit their volume:

| What | Where, inside the person's volume |
| --- | --- |
| Skills for all their bots | a folder per skill in `/data/home/.agents/skills/` |
| Instructions for all their bots | `/data/home/.agents/AGENTS.md` (a bot only reads it when instruction inheritance is turned on for it) |
| MCP servers for all their bots | `/data/home/.agents/mcp.json` or `/data/pi/mcp.json` |
| Skills for one bot | `/data/agents/<bot>/.pi/skills/` |

Skill and instruction changes show up within about 30 seconds. Files must be owned by the container user.

A bot can write its own folder, so a team install loads no plugins and no MCP files from it (`/data/agents/<bot>/.agents/plugins`, `.pi/plugins`, `.agents/mcp.json`, `.pi/mcp.json`): code there would run inside the person's Vinci, outside the sandbox. Put plugins and MCP servers in the shared places above, or set MCP servers in the panel. Vinci never follows a link out of the bot folders, and never reads a bot's FIFO, socket, hard-linked file, or skill or instruction file over 1 MiB: such a file is skipped and the bot carries on. An instruction file shows in the person's Vinci log as `Skipped a bot instruction file that links outside the bot folders, is not a plain file or is over 1 MiB`. A skill folder whose path leads out of the bot folders logs `Skipped a bot skill folder that links outside the bot folders.` `apply` and `restore` delete any hard link from the bot folders to Vinci's own files and print `Removed <path>: a hard link to a daemon file outside the bot folders.`

A skill whose `SKILL.md` can't be loaded (for example a header value with an unquoted colon) is skipped. **Settings → Sources** then lists it under *Skipped skills*, with the file and the reason, in Global settings and on the person's page. Fix the file; the list clears when you open Sources again.

**Give this to your agent:**

> On `root@<server>`, add the skill in `<local folder>` for all bots of Vinci user `<name>`: copy it to `/data/home/.agents/skills/<skill name>/` in their volume, owned by the container user. Don't restart anything. Confirm the skill appears in their bot's skill list within a minute.

### Always approved tools

When someone answers **Always approve** on a request, that bot stops asking for that tool. A bot's **Tools** tab lists those tools, in the app for the person (on the iPhone app, under **Always approved** in the bot's settings) and under **Users → person → Bots** in the panel for you. **Remove** puts one back to asking, **Remove all** (after a confirmation) all of them; the bot asks again the next time it wants to use one. A removal in the panel is a change in **Activity**, with the bot; opening the list writes nothing.

### Create a bot for someone

Each person's Vinci has a private door: its owner socket, which only the server can reach. It accepts the same settings and bot changes as the app and the conversation viewer's reads, but nothing that sends chat messages, answers approvals or pairs a device. The admin panel uses it; use the panel when you can. Without the panel, call it from inside the person's container:

```sh
docker compose exec daemon-<id> bun -e 'const r = await fetch("http://localhost/rpc/bots/create", { method: "POST", unix: "/data/data/ipc/rpc.sock", headers: { "content-type": "application/json", "x-bots-protocol": "1" }, body: JSON.stringify({ json: { name: "Helper", handle: "helper", modelProvider: "anthropic", modelId: "claude-sonnet-4-5", thinkingLevel: "low" } }) }); console.log(r.status, await r.text())'
```

`200` and the new bot mean it worked. `403` means the door does not serve that action. Some models refuse `thinkingLevel: "off"`, so always send one. The full list of what the door serves is in [`api.md`](../../.agents/references/api.md#owner-socket-private-door).

Don't pair a device of your own into someone's Vinci instead: it can read and act as that person.

**Give this to your agent:**

> On `root@<server>`, in `/opt/vinci`, create a bot named `<name>` with handle `<handle>` and model `<provider>/<model>` for Vinci user `<id>`. Use `docker compose exec daemon-<id> bun -e` with `fetch` to `http://localhost/rpc/bots/create` over the unix socket `/data/data/ipc/rpc.sock`, headers `content-type: application/json` and `x-bots-protocol: 1`, body `{"json": {...}}` with `thinkingLevel` set. Don't pair a device. Confirm the reply is 200 and the bot appears in `bots/list`.

## What a bot can do and reach

A bot's tools (reading, writing and editing files, running commands) run in its person's sandbox, `vinci-sandbox-<id>-1`, never in their Vinci. The sandbox has the person's bot folders (all of their bots', read and write), their shared skills and instructions (read only), and nothing else of their data: no database, no keys, no Pi settings, no owner socket, no model keys in its environment, and it cannot see Vinci's processes. Commands run as an ordinary user. Secrets reach a command only through the secrets proxy, as before.

**Tools.** The sandbox has Bun 1.4.4, Node 24 with npm and npx, Python 3.13 with pip, venv and uv, git, curl, wget, jq, ripgrep, sqlite3, poppler (`pdftotext`, `pdftoppm`), zip, unzip, xz, bzip2, tar, file, less, patch, ps and the usual text tools (sed, awk, grep, find, diff). People attach files up to 10 MB (images, PDF, text, Markdown, CSV, JSON; the app refuses anything else, or bigger, before uploading, and makes large photos smaller first). Bots see images as images (an image over 8.3 megapixels, such as a photo the iOS app sends unchanged, is refused and the bot is told how to shrink it first, since decoding it could crash the person's Vinci) and read a PDF as its text; a scanned PDF has no text, so the bot is told to look at its pages as images, and a password-protected one needs a copy without the password. Word, Excel, zip and audio files cannot be attached. It has no compilers (gcc, make), no `gh`, no ssh client and no GnuPG: a package that must compile code while installing fails, and one with a prebuilt binary or wheel works. No file in it is setuid, and nothing runs as root, so `apt` cannot install anything.

**The bots' home.** `HOME` is `/home/bot`, the folder `bot-home` on the person's sandbox disk, shared by all of that person's bots and kept across restarts, upgrades and backups. Bots install there without root: `npm i -g`, `pip install --user`, `uv tool install` and `bun add -g` put programs in `~/.local/bin` or `~/.bun/bin`, which are on `PATH`, and they keep working after a restart. Download caches go to `~/.cache`, which backups leave out. A new home starts with Debian's shell files and a `~/.gitconfig` with no name or email, so `git commit` asks a bot to set its identity first. Another person's bots never see it, and the person's Vinci sees only an empty read-only folder there, so nothing a bot puts in it (programs, links) is ever read or run by Vinci. `/tmp` is still a 256 MB folder in memory that a restart empties, and programs cannot run from it. The home counts against the person's [disk limit](#disk-limits), together with the bot folders.

With a secret saved, every command's web requests go through the secrets proxy, and each tool trusts its certificate: curl, wget, git, Node (`fetch` and `https`), Bun, Python (`requests`, `httpx`, pip), uv and npm. A secret travels in a header or in the address's query (`?token=$NAME`), never inside a `user:password@` address or Basic login: the proxy does not swap those, so the destination gets the placeholder.

MCP servers that run a command (`"command": …` in an MCP file, or added in the panel) run in the same sandbox too, never in their Vinci: the Vinci starts one there for each bot that has it, when the Vinci starts (after a restart, an upgrade or a reboot) or when the server is added, and talks to it over the folder they share. The server sees exactly what the bot's commands see and nothing more, so it cannot read the person's database, keys or Pi settings. Two things follow, said plainly. First, **the person's bots can read such a server's `env` values, secrets included**: they run as the same user in the same sandbox (Sources → MCP files says so too). Put only keys there you would let that person's bots use; a key for a web service is better given as a secret with hosts, which bots use through the proxy without seeing it. Each bot runs its own copy of the server, and a server in the template's MCP file runs in the sandbox of every person who follows Sources, with the same `env` values: a shared API key put there can be read by the bots of every one of those people (also in plain text in their read-only `~/.agents/mcp.json`). Second, the server shares the sandbox's limits (512 MB, 256 processes). Measured on an x86 server, each bot's copy of `@modelcontextprotocol/server-filesystem` through `npx` takes about 110-190 MiB (`npm exec` stays running next to `node`) and `uvx mcp-server-time` about 70 MiB, so two bots with both servers leave the person's bots about 200-250 MiB of the 512 MB for their own commands; a sandbox peaked at 497 of 512 MiB while a bot installed packages. Raise `SANDBOX_MEMORY` if you give people such servers, and count it in the server's memory ([install](install.md#before-you-start)). A broken or hostile server can slow or block that person's bot tools until it stops, never anyone else's or the Vinci itself (the Vinci cuts off a server that floods it). Removing the server in the panel, or `bun deploy.ts apply` after `docker compose restart sandbox-<id>`, stops it and everything it started. The command must exist in the sandbox: its [tools](#what-a-bot-can-do-and-reach) (`npx`, `uvx`, `node`, `python3`, `bun` and the rest) or anything installed into a bot folder; otherwise the panel's MCP tab says *The command … is not installed in the sandbox where this MCP server runs*. The first start of an `npx` or `uvx` server downloads it into the bots' home (about 10 seconds for the filesystem server, up to a minute is allowed); later starts take about a second. Give an exact version (`@modelcontextprotocol/server-filesystem@2025.8.21`): an unpinned server changes under you. Servers find their command with the image's `PATH`, never a program a bot left in `~/.local/bin`, but the downloaded code stays in the bots' home cache (`~/.cache/npm/_npx`, `~/.cache/uv`), which those bots can change: like `env`, a command server is something the person's bots can tamper with. MCP servers over https are unchanged: their Vinci connects to them. Whatever the transport, a tool's text result reaches the bot cut like any other tool output: the first 2000 lines or 50 KB, then a line saying how much was dropped. A result of any size, even gigabytes, costs the Vinci about the same memory.

The sandbox is always there: `apply` gives every person and the template one, and there is no setting to run without it. If a person's sandbox is not running, their bots' tool calls fail with *Bot tools are off: the sandbox where they run is not running* after about 10 seconds, and nothing runs in their Vinci instead; `bun deploy.ts status` shows which one, and `bun deploy.ts apply` starts it again. If the sandbox stops while a command runs, that call fails at once with *The sandbox where bot tools run stopped during this tool call*; Docker restarts a crashed sandbox within a few seconds and the next call works. A sandbox stopped on purpose (`docker stop`, `docker kill`) stays stopped until `apply`. Plugins and MCP files inside a bot's own folder are not loaded ([set up bots](#set-up-bots-skills-and-tools-for-a-person)).

The Vinci itself still makes the model requests, connections to MCP servers over https and the secrets proxy's requests. From either container, bots reach the public internet (model providers, web pages, MCP servers over https) and DNS, and nothing internal:

| From a person's sandbox or Vinci | Reachable |
| --- | --- |
| Public internet and DNS | yes |
| The hub, on any of its networks | no: the hub opens connections to each person's Vinci, never the other way; the sandbox cannot even look it up |
| The person's own Vinci, from the sandbox | no: they share only a folder the Vinci owns and the sandbox reads |
| The web app, the provisioner, cloudflared | no |
| Other people's Vinci and sandboxes, and the template workspace | no |
| The server itself: SSH, Docker's gateway addresses, its public address, any other service on it | no |
| The cloud metadata service (`169.254.169.254`) | no |
| Private and internal ranges: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `100.64.0.0/10` (Tailscale), link-local, multicast | no |
| IPv6 | no: people's networks have IPv6 off, so only public IPv4 goes out |
| A destination listed in `VINCI_INTERNAL_ALLOW` | yes, that address and port only |

The same holds for a bot's web requests through its Vinci's secrets proxy (what curl, git and Bun `fetch` use): the proxy looks up the name once, refuses with *The proxy does not connect to … : bots cannot reach internal addresses.* when any answer is internal (also a name that points at one, a redirect to one, or a name that changes its answer between lookups), and otherwise connects to exactly the address it checked. It allows the same `VINCI_INTERNAL_ALLOW` destinations.

The `firewall` container keeps this. Each sandbox is alone on its own network, named like a person's (a bridge `mv-d<9 hex>`), so the same rules cover it with no extra rule. It adds two named rule sets for people's networks to the server's firewall, `VINCI-DAEMONS` (in Docker's `DOCKER-USER`) and `VINCI-DAEMONS-HOST` (in `INPUT`); it changes no policy and no other rule, so it cannot lock you out of SSH. Its health check runs every 2 seconds: it puts back anything missing or moved and then reports the firewall unhealthy until the next check, and also when Docker or the kernel no longer send people's traffic through the rules. A person you add gets the same protection with no extra step. The rules stay in place when the container stops or restarts; a reboot clears them until the firewall starts again.

Nobody's Vinci starts without them. `apply` (and the admin panel) start the firewall first and stop with its message if it does not become healthy; Compose starts a person's Vinci only while the firewall is healthy. After a reboot or a Docker restart, when Docker starts every container at once, each person's Vinci first waits until the firewall rejects it (its log then says `Waiting for the firewall` and `The firewall confines this container after … ms`), so no bot runs before the rules exist. If someone deletes the rules while everything runs, bots can reach internal addresses until the next check, at most about 2 seconds; if they emptied the whole firewall, Docker's rules included, that check also stops all traffic out of people's networks until Docker restarts.

Check it with:

```sh
bun deploy.ts firewall status
```

It prints the firewall's health, its last check and the last problems its checks found (missing rules it put back, for example), and exits non-zero unless the firewall is healthy. `docker compose ps firewall` shows `(healthy)` too.

To let every person's Vinci reach one internal service anyway, such as a model server on your private network, name it in `/opt/vinci/.env` as `<IPv4>:<port>` (TCP), comma-separated for more than one, and run `bun deploy.ts apply`:

```sh
VINCI_INTERNAL_ALLOW=10.0.0.5:8080
```

The firewall and every person's Vinci restart (about 10 seconds), since each person's secrets proxy reads it too. It is empty by default. Allow only what every person may use: everything allowed is open to every bot, from the sandboxes too.

To check from inside a person's sandbox, where bots' commands run (it should print `public: 200`, then `blocked` for the metadata service, the server's SSH on the sandbox's gateway address, the hub, the person's own Vinci and a private address). It uses only the image's programs, not ones a bot left in its home:

```sh
docker compose exec -e PATH=/usr/bin:/bin sandbox-<id> /bin/bash -c 'gw=$(awk '\''$2 == "00000000" { print $3; exit }'\'' /proc/net/route); gw=$(printf "%d.%d.%d.%d" 0x${gw:6:2} 0x${gw:4:2} 0x${gw:2:2} 0x${gw:0:2}); curl -sS -o /dev/null -w "public: %{http_code}\n" https://example.com; for t in 169.254.169.254:80 $gw:22 hub:47192 daemon-<id>:47191 10.0.0.1:80; do timeout 4 bash -c "exec 3<>/dev/tcp/${t%:*}/${t##*:}" 2>/dev/null && echo "$t REACHABLE" || echo "$t blocked"; done'
```

And from inside the person's Vinci, which makes the model requests (`public: 200`, then `blocked` for the metadata service, the server's SSH, the hub and a private address):

```sh
docker compose exec daemon-<id> bun -e 'const gw = (await Bun.file("/proc/net/route").text()).split("\n").map((l) => l.split("\t")).find((f) => f[1] === "00000000")[2].match(/../g).reverse().map((h) => parseInt(h, 16)).join("."); const tcp = (host, port) => Promise.race([Bun.connect({ hostname: host, port, socket: { data() {} } }).then((s) => (s.end(), "REACHABLE"), () => "blocked"), Bun.sleep(3000).then(() => "blocked")]); console.log("public:", (await fetch("https://example.com")).status); for (const [host, port] of [["169.254.169.254", 80], [gw, 22], ["hub", 47192], ["10.0.0.1", 80]]) console.log(`${host}:${port}`, await tcp(host, port)); process.exit(0)'
```

`bun deploy.ts firewall remove` stops the firewall and deletes both rule sets and their jumps. Use it only when tearing Vinci down (see [Tear down](#tear-down)): the next `apply` puts them back.

**Give this to your agent:**

> On `root@<server>`, in `/opt/vinci`, check what bots can reach: `bun deploy.ts firewall status` must say `healthy` (report any problem it lists); `iptables -S DOCKER-USER` and `iptables -S INPUT` must each start with a jump to `VINCI-DAEMONS` / `VINCI-DAEMONS-HOST` for `-i mv-d+`, and the `INPUT` policy must be unchanged. From one person's sandbox and from their Vinci, run the two checks in the "What a bot can reach" section of `docs/team-workspace/admin.md`: public 200, everything else blocked. `bun deploy.ts status` must exit 0. Don't change `VINCI_INTERNAL_ALLOW` unless I name an address.

## Disk limits

Each person's bots write only to their own sandbox disk: a file system of `SANDBOX_DISK` (default `5g`) that holds their bot folders (the files people send in chats included) and their bots' home (`/home/bot`: installed tools, virtual environments and download caches). When it is full, bots get *No space left on device* from their commands and file tools, a file sent in the app gets *Your bots' disk is full*, and nothing else notices: the person's chats, settings and Vinci keep working (they live in the volume, not on the disk), and nobody else's data, the hub's [audit trail](#activity) or the backups lose any room. The person (or a bot) frees space by deleting files in the bot folders. Creating a bot for them (in their app, in the panel, a suggested bot copied to them, or a bot creating one) is refused with *No space left on your disk* and leaves nothing behind; try again once there is room. If a bot's folder cannot be made when their Vinci starts, that bot alone is unavailable (logged as `Cannot configure a bot at start`); their Vinci and other bots start. It comes back at the next start, or when its settings are saved. To free space from the server: `rm` in `disks/<id>/agents/…` or `disks/<id>/bot-home/…`.

A disk is the file `disks/<id>.img` in `/opt/vinci`, mounted at `disks/<id>`. It is sparse: it takes only what is written, so a new person's disk costs a few MB. `apply` creates it, mounts it, and on a server with systemd writes `vinci-disks.service`, which mounts every disk at boot before Docker starts anyone. The admin panel's **Add user** creates one the same way.

```sh
bun deploy.ts status       # each person's disk use; FULL at 95%, and the server's own free space
```

`status` exits non-zero when a disk is full or not mounted, or the server has less than 10% free.

- **More room for everyone:** raise `SANDBOX_DISK` in `.env` (for example `10g`; an install upgraded from before disk limits has no such line yet, so add it) and run `bun deploy.ts apply`. It grows every disk without stopping anyone. Shrinking is not automatic: a disk stays at its size, and `apply` says so.
- **What fits on the server:** the disks are promises, not reservations. People times `SANDBOX_DISK` should fit in the server's free space next to the system, images and backups; `apply` warns when they could outgrow it. With the 40 GB minimum and 5 people plus the template workspace, the default of 5 GB fits. Today a person's whole data is a few MB: almost all of it is chat history in the volume, and the bot folders hold what bots and people put there.
- **Files count too:** a disk holds about 650,000 files and folders per 5 GB (one per 8 KB), so millions of tiny files (a big `node_modules`) fill it like bytes do, and `status` shows `% of files`.
- **Freed space goes back to the server** at the next `apply` or boot (both trim the disks); until then it stays inside that person's disk.
- **Backups grow with the disks:** the nightly backup copies every person's bot folders (compressed), and keeps 7 daily and 4 weekly runs. A person adds at most their `SANDBOX_DISK` per run, less in practice. Empty space inside a file (a *sparse* file, such as one made with `truncate -s 1T`) stays empty in the backup and after a restore: it costs neither backup time nor room. Keep `BACKUP_KEEP_DAILY` and `BACKUP_KEEP_WEEKLY` in line with the server's disk ([nightly backups](#nightly-backups)).
- **After a reboot on a server without systemd**, nobody's Vinci starts until you run `bun deploy.ts disks mount` and then `docker compose up -d`: a Vinci never starts without its disk.

Docker keeps at most 30 MB of log per container (`docker compose logs` shows the newest), so nothing a bot prints can fill the server either.

**Give this to your agent:**

> On `root@<server>`, in `/opt/vinci`, run `bun deploy.ts status` and `du -sh disks/*.img`, and tell me whose sandbox disk is full or close and how much the server has free. Change nothing.

## Backups

**Backups hold every secret.** Each person's backup has their encryption key (`credentials.key`), their model keys (`auth.json`), their secrets and their chats; the deployment files have `.env` with the tunnel token, the provisioner token and the shared model keys. Anyone with a backup folder can read all of it. Keep backups readable by root only, and copy them only to a place you trust as much as the server.

### Nightly backups

The server backs itself up every night with a systemd timer. Turn it on once, in `/opt/vinci`:

```sh
bun deploy.ts nightly install
```

Expected: `Wrote /etc/systemd/system/vinci-backup.service`, `Wrote /etc/systemd/system/vinci-backup.timer` and `The nightly backup runs at 03:00 server time into /opt/vinci/backups`. Set `BACKUP_TIME=02:15` in `.env` before `install` for another time. A server that was off at that time backs up once when it starts. `bun deploy.ts nightly remove` turns it off and keeps the backups.

Each run writes one folder, `backups/<time>/` (UTC, such as `2026-11-13T030000Z`), with mode 700 and every file mode 600:

| File | What it holds |
| --- | --- |
| `<id>.tar.gz` | One person's whole volume and sandbox disk except their bots' download caches (`bot-home/.cache`, which npm, pip, uv and Bun fill again on the next install), for everyone in `users.yaml` (disabled people too) and `template.tar.gz` for the template workspace. Someone removed from `users.yaml` is no longer backed up: back them up by hand before you remove them if you may need their data. |
| `postgres.sql.gz` | The API's PostgreSQL database, dumped while it runs (nobody is stopped for it): with [Vinci accounts](install.md#login-with-vinci-accounts-no-cloudflare), every login account and the key that signs logins, encrypted with `API_APP_KEY` from `.env`. |
| `hub.tar.gz` | The hub's folder: `users.json`, `admins.json`, `pins.json`, `global.json` and the audit trail `audit.sqlite`. |
| `deployment.tar.gz` | `.env`, `users.yaml`, `users.compose.yaml`, `compose.yaml`, `daemon.yaml`, `cloudflared.compose.yaml`, `deploy.ts`, and any other file `COMPOSE_FILE` loads. |
| `manifest.json` | The image tag, each person (enabled, advanced, how long they were stopped), and each file's size and SHA-256. Written last: a folder without it is a run that did not finish. |

People are backed up one at a time. Each person's Vinci and sandbox stop for their own copy and start again, so no database is copied half-written: about 7 seconds each on a 2-CPU x86 server (up to about 17 seconds for a person whose bots' home holds many installed packages), and a browser saw 0.5 to 2 seconds without answers. Then the hub stops for about 3 seconds while its folder is copied, so nobody's open app gets an answer for 1 to 2 seconds. Open chats reconnect on their own. A plain hub restart copies no global settings, so a run adds no `global/sync` row to **Activity**. A run waits up to five minutes for an `apply` or an admin panel change that is in progress, and admin panel changes made while it runs ask to try again in a minute. If someone's Vinci does not come back healthy after their copy (for example it cannot start), their backup is still complete and kept, and the run goes on with everyone else. The run then ends failed (the timer's service shows `failed`), the journal has `The Vinci of <id> did not come back healthy after its copy`, `bun deploy.ts nightly status` names them and exits non-zero until a later run brings everyone back, `manifest.json` marks them `"back": false`, and `bun deploy.ts status` shows them.

**Retention.** After a good run, the server keeps every run of the last 7 days that have one, and the newest run of each of the last 4 weeks (weeks start on Monday, UTC), and deletes every other run folder, including unfinished ones. Change the numbers with `BACKUP_KEEP_DAILY` and `BACKUP_KEEP_WEEKLY` in `.env`. A run that fails deletes only its own unfinished folder, never an older run. Backups you made by hand (`backups/<id>-<time>.tar.gz`) are never deleted, nor is anything whose name is not a run's time. A run you start by hand, such as the one before an upgrade, stays like the nightly ones: a later run on the same day does not replace it.

**Check it:**

```sh
bun deploy.ts nightly status
```

```text
Last run: backups/2026-11-13T030000Z, started 5.2 h ago: ok
Tag 3335196, 4 workspaces, 0.1 MiB, took 14 s; longest stop template 2.7 s, hub 2.8 s
Finished backups on this server: 9 (2026-10-25T030000Z to 2026-11-13T030000Z)
Off-site copy to acme-vinci-backups/vinci/: last upload 2026-11-13T030000Z, 5.2 h ago
```

followed by the timer's next run. It exits with an error when the last run failed, when it still says `running` after two hours (the run was killed, for example by a power loss), when the last good run is more than 36 hours old, or when the [off-site copy](#off-site-copy) is on and its last upload failed, so a monitoring check can run it. A failed run also ends the systemd job with an error and writes one line to the journal, `Nightly backup failed: <reason>`: see `journalctl -u vinci-backup.service`. A run stopped by systemd (after two hours, or by a shutdown) or by Ctrl-C starts whoever it had stopped again and counts as failed. Only a hard kill or a power loss in the few seconds someone is stopped can leave their Vinci or the hub stopped: `bun deploy.ts apply` starts it again. To back up right now, run `bun deploy.ts nightly`; it is the same command the timer runs.

### Off-site copy

Backups on the server's own disk are lost with the server. Each nightly run can also upload its backup to a bucket at an S3 provider: Amazon S3, Cloudflare R2, Backblaze B2 or any other S3-compatible storage. Off by default; the backups on the server stay as they are either way. It replaces the earlier `BACKUP_OFFSITE_SCRIPT`, which is no longer run: if your `.env` has it, set up the bucket below and delete that line.

**The copy is encrypted on the server before it leaves**, with GnuPG (OpenPGP, AES-256) and a passphrase you choose. Nothing is uploaded without one. The bucket only ever sees encrypted files and their checksums: no names, no secrets.

> **Losing the passphrase means the off-site copies can never be restored.** Nobody can recover it, not even with access to the server and the bucket. Keep it outside this server, in your password manager, next to the bucket's keys. It is also in `.env`, so the backups on the server hold it, but those are gone with the server.

1. Create a bucket and an access key that can list, read, write and delete in it (and nothing else, if your provider allows). Keep the bucket private.
2. Make a passphrase and save it in your password manager first:

   ```sh
   openssl rand -hex 32
   ```

   Use letters and digits only: `.env` values lose anything written with `$`.
3. Add these to `/opt/vinci/.env`, as in one of the examples below:

   | Setting | What it is |
   | --- | --- |
   | `BACKUP_S3_BUCKET` | The bucket. Setting it turns the off-site copy on. |
   | `BACKUP_S3_ENDPOINT` | The provider's S3 address. Leave empty for Amazon S3. |
   | `BACKUP_S3_REGION` | The bucket's region (`auto` for R2). |
   | `BACKUP_S3_PREFIX` | Optional folder in the bucket, such as `vinci/`. |
   | `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY` | The access key. |
   | `BACKUP_PASSPHRASE` | The passphrase from step 2, at least 20 characters. |

   Amazon S3:

   ```sh
   BACKUP_S3_BUCKET=acme-vinci-backups
   BACKUP_S3_REGION=eu-central-1
   BACKUP_S3_PREFIX=vinci/
   BACKUP_S3_ACCESS_KEY_ID=AKIA...
   BACKUP_S3_SECRET_ACCESS_KEY=...
   BACKUP_PASSPHRASE=<64 hex characters>
   ```

   Cloudflare R2 (an R2 API token with *Object Read & Write* on the bucket gives the key pair; a bucket with an EU jurisdiction uses `https://<account id>.eu.r2.cloudflarestorage.com`):

   ```sh
   BACKUP_S3_ENDPOINT=https://<account id>.r2.cloudflarestorage.com
   BACKUP_S3_REGION=auto
   BACKUP_S3_BUCKET=acme-vinci-backups
   BACKUP_S3_ACCESS_KEY_ID=...
   BACKUP_S3_SECRET_ACCESS_KEY=...
   BACKUP_PASSPHRASE=<64 hex characters>
   ```

   Backblaze B2 (an application key for the bucket: its *keyID* and *applicationKey*; the endpoint is on the bucket's page):

   ```sh
   BACKUP_S3_ENDPOINT=https://s3.us-west-004.backblazeb2.com
   BACKUP_S3_REGION=us-west-004
   BACKUP_S3_BUCKET=acme-vinci-backups
   BACKUP_S3_ACCESS_KEY_ID=...
   BACKUP_S3_SECRET_ACCESS_KEY=...
   BACKUP_PASSPHRASE=<64 hex characters>
   ```

4. Run one backup and check it: `bun deploy.ts nightly`, then `bun deploy.ts nightly status`. Expected: `Uploaded <time> to <bucket>/<prefix>, encrypted (… MiB).` and `Off-site copy to <bucket>/<prefix>: last upload <time>, 0 min ago`.

After each good run on the server, the run checks the backup against its `manifest.json`, encrypts it to one file and uploads `<prefix><time>.tar.gpg`, then `<prefix><time>.sha256` with that file's checksum. It uploads every backup kept on the server that the bucket does not have yet, so the first run uploads all of them, and a backup whose upload failed goes up with the next run. Then the bucket keeps what the server keeps (see Retention above, with the same `BACKUP_KEEP_DAILY` and `BACKUP_KEEP_WEEKLY`): it deletes only objects under the prefix named like a backup (`<time>.tar.gpg`, `<time>.sha256`), so other files in the bucket are never touched, and it deletes nothing when an upload failed. Give each install its own prefix: two installs with the same bucket and prefix delete each other's backups. An upload cut off midway (power loss, a stopped run) can leave hidden parts of a multipart upload that the provider bills but never lists: where your provider allows it, add a lifecycle rule to the bucket that aborts incomplete multipart uploads after a few days (R2 does this after 7 days by itself).

**When the upload fails** (wrong key, the provider unreachable, no passphrase), the backup on the server is kept and counts as good. The run ends with an error and the journal line `Off-site upload failed: <reason>`, and `nightly status` shows the reason and exits with an error until an upload works again:

```text
Off-site copy to acme-vinci-backups/vinci/: last upload 2026-11-12T030000Z, 26.5 h ago
Last off-site failure 2.4 h ago: an unexpected error has occurred (DNSResolveFailed)
The off-site copy is not up to date: the last upload failed or none was made yet.
```

The reason in brackets says what went wrong: `DNSResolveFailed` or `ConnectionRefused` (check `BACKUP_S3_ENDPOINT` and the server's internet access), `SignatureDoesNotMatch` or `InvalidAccessKeyId` (check the key pair), `NoSuchBucket` (check `BACKUP_S3_BUCKET` and the region). Fix `.env` and run `bun deploy.ts nightly` to try again at once.

The last upload and failure that `nightly status` shows belong to the bucket and prefix they were made for: after you change `BACKUP_S3_BUCKET` or `BACKUP_S3_PREFIX`, it says `none yet` (and exits with an error) until the next run uploads to the new place.

The upload holds the same lock as the backup, so admin panel changes made during it ask to try again in a minute. How long it takes depends on the size of the backups and the server's upload speed; the first run uploads every backup the server keeps.

The bucket's own encryption at rest, if your provider offers it, is an extra layer; it does not replace the passphrase, because the provider holds those keys.

To restore from the bucket, see [Restore from the off-site copy](#restore-from-the-off-site-copy). To decrypt one by hand on any computer with GnuPG: `gpg --decrypt <time>.tar.gpg | tar -x` asks for the passphrase and gives the run's folder.

### Back up one person by hand

```sh
bun deploy.ts backup <id>
```

It takes a few seconds and writes `backups/<id>-<time>.tar.gz`, readable only by root. Copy it off the server, keeping it private:

```sh
scp -p root@<server>:/opt/vinci/backups/<id>-<time>.tar.gz <safe folder>/
```

These stay on the server until you delete them by name (`rm /opt/vinci/backups/<file>`).

### Restore one person

From last night's run (the folder) or a backup made by hand (the file):

```sh
bun deploy.ts restore <id> backups/<time>
bun deploy.ts restore <id> backups/<id>-<time>.tar.gz
```

It checks the file against the run's `manifest.json` first and refuses a damaged one, a file that does not unpack, and a file not named for that person (`<id>.tar.gz` or `<id>-<time>.tar.gz`), so a mistyped id cannot put someone else's data in their place. Then it stops that person's Vinci and sandbox, saves what is there now to `backups/<id>-<time>.tar.gz`, replaces their whole volume and starts both again (their bots' home included, without its caches). Expected: `Saved the current data of <id> to backups/…` and `Restored <id> from …`. Other people are not affected.

What the person gets back is exactly what they had at backup time: bots, chats, secrets, keys, settings and devices. Their browsers paired before the backup keep working. A browser or phone they paired after it is refused once and pairs again by itself the next time they open Vinci (no PIN). The hub is not touched:

- **The audit trail keeps everything**, including rows about changes the restore has just undone. The restore itself writes no row; it shows in the shell where you ran it.
- **Section modes stay as they are now.** A section that follows global holds the global values from backup time until the next global change. In the panel, open **Global settings** and press **Sync now** so it gets today's values (`sync status` still says *in sync* until then). A section switched to global after the backup keeps the person's old values until that sync.
- **A purged id added again follows global.** Its new Vinci started empty, so it follows every section like any new person. If you restore their old backup into it, switch the sections they should keep to *overridden* first, or the next global change replaces those values.

### Restore a whole install on a new server

From one run folder alone, for example when the server is lost. Images are not in the backup: you need the same tag as `"tag"` in its `manifest.json`.

1. Prepare the new server with [install](install.md) steps 1 and 2, and pull the images of that tag as in step 3 (or build them from that commit if it was not a release). Install Bun as in step 3.
2. Copy the run folder to the new server and unpack the deployment files from it:

   ```sh
   ssh root@<new server> 'mkdir -p -m 700 /opt/vinci/backups'
   scp -rp <run folder> root@<new server>:/opt/vinci/backups/
   ssh root@<new server> 'cd /opt/vinci && chmod 700 . && tar -xzpf backups/<time>/deployment.tar.gz'
   ```

3. Stop the old server's Vinci if it still runs (`docker compose down` there): it has the same tunnel token, and Cloudflare would share people between both servers.
4. Restore:

   ```sh
   ssh root@<new server> 'cd /opt/vinci && bun deploy.ts restore backups/<time>'
   ```

   It refuses a server whose `hub` folder is not empty, and checks every file against `manifest.json`. It puts back the hub folder (admin list, pins, section modes, audit trail), creates and fills every person's and the template's volume, loads the API's database in place of any already there (login accounts and their signing key; a run from before the database was backed up has none, so make each account again with `vinci:user`), and only then starts everything with `apply`. Expected, after about 20 seconds: `Restored the whole install from backups/<time> (tag <tag>)`.
5. Turn the nightly backup on again: `bun deploy.ts nightly install`. Note that the next run's retention deletes the folder you restored from once it is older than the 7 newest days with a run; copy it under a name that is not a run's time first if you want to keep it.

Nothing changes in Cloudflare: the tunnel token in `.env` connects the new server to the same tunnel, and the hostname, Access and DNS stay. For people, the install is as it was at backup time: browsers paired before the backup open Vinci as usual and chats continue; a browser paired after the backup pairs again by itself; anything done after the backup (chats, settings, panel changes, people added) is gone and needs doing again. Admins, pins and section modes are the backup's, and the audit trail ends at the backup.

### Restore from the off-site copy

When the server is lost, or its disk no longer has the backup you want. You need the bucket settings and the passphrase from your password manager, and the images of the tag the backup was made with.

1. Prepare the new server with [install](install.md) steps 1 and 2, pull the images as in step 3 (the tag you last upgraded to; step 4 tells you the backup's own tag; build them by hand if it was not a release) and install Bun as in step 3.
2. Copy `deploy.ts` from that checkout and write a `.env` that holds only the image tag and the off-site settings:

   ```sh
   ssh root@<new server> 'mkdir -p -m 700 /opt/vinci'
   scp scripts/deploy.ts root@<new server>:/opt/vinci/deploy.ts
   ssh root@<new server> 'cd /opt/vinci && umask 077 && cat > .env'
   ```

   Type or paste `VINCI_TAG=<tag>`, `VINCI_REGISTRY=ghcr.io/meetvinci/` (leave it out for images loaded by hand), every `BACKUP_S3_` line and `BACKUP_PASSPHRASE=<passphrase>`, each on its own line, then press Ctrl-D.
3. List the backups in the bucket and pick one (UTC times, oldest first):

   ```sh
   ssh root@<new server> 'cd /opt/vinci && bun deploy.ts nightly fetch'
   ```

4. Fetch it:

   ```sh
   ssh root@<new server> 'cd /opt/vinci && bun deploy.ts nightly fetch <time>'
   ```

   It downloads `<time>.tar.gpg`, refuses it unless it matches `<time>.sha256`, decrypts it into `backups/<time>/` (refusing a wrong passphrase) and checks every file against the run's `manifest.json`. Expected: `Fetched <time> into backups/<time>; every file matches its manifest (tag <tag>).` If that tag is not the one you loaded, load its images now and set `VINCI_TAG` to it in `.env`.
5. Unpack the deployment files from it. This replaces the short `.env` with the one from the backup, which has the same off-site settings:

   ```sh
   ssh root@<new server> 'cd /opt/vinci && tar -xzpf backups/<time>/deployment.tar.gz'
   ```

6. Go on with [Restore a whole install on a new server](#restore-a-whole-install-on-a-new-server) from step 3: stop the old server's Vinci if it still runs, `bun deploy.ts restore backups/<time>`, then `bun deploy.ts nightly install`.

To restore one person from the bucket on a server that still runs, fetch the backup (step 4) and run `bun deploy.ts restore <id> backups/<time>` as in [Restore one person](#restore-one-person).

### Restore only the hub folder

Stop the hub, unpack `hub.tar.gz` into `hub` as root (it keeps the owners and modes the hub needs), start the hub, and run `apply` so `hub/users.json` matches `users.yaml` again. The admin list and the section modes go back to the backup's, and rows added to the audit trail since that backup are lost, so first copy the current `hub/audit.sqlite` to `backups/` if you want to keep them:

```sh
docker compose stop hub
tar -xzpf backups/<time>/hub.tar.gz -C hub
docker compose start hub
bun deploy.ts apply
```

**Give this to your agent:**

> On `root@<server>`, in `/opt/vinci`, run `bun deploy.ts nightly status` and report the last run, its age, its result and the off-site copy. If it failed or is older than a day, show `journalctl -u vinci-backup.service --since -2d | grep -E "failed|Nightly"` and run `bun deploy.ts nightly` once. Never print `.env` or the content of a backup.

## Upgrades

Before the first upgrade that adds PostgreSQL, run the password generation command in [install, step 7](install.md#7-start-vinci). Set both values in `/opt/vinci/.env` before copying the new Compose file.

New images arrive with a new release tag. Pull the release images (`vinci-daemon`, `vinci-sandbox`, `vinci-web`, `vinci-hub`, `vinci-provisioner`, `vinci-firewall`, `vinci-api`) as in [install, step 3](install.md#3-get-vinci-onto-the-server), and copy the deployment files again from a checkout of that tag (`compose.yaml`, `daemon.yaml`, `sandbox.yaml`, `deploy.ts` and the edge file: `cloudflared.compose.yaml`, or `caddy.compose.yaml` with [Vinci accounts](install.md#login-with-vinci-accounts-no-cloudflare); never `.env`). A server installed with [cloud-init](install.md#install-with-cloud-init) also keeps its version in `/etc/vinci-install.env`: set `VINCI_REF` and `VINCI_TAG` there to the new release too, or a later run of `/usr/local/sbin/vinci-install` copies the old deployment files and sets the old tag again. If `docker run --rm --entrypoint /usr/local/bin/bun ghcr.io/meetvinci/vinci-daemon:<tag> --version` prints a different version than `bun --version` on the server, install Bun from the new image as in step 3; otherwise leave it. Pull the images before changing the tag, so the switch below does not wait on the download. The first upgrade from images loaded by hand, or from the old private registry (`registry.example.com/vinci/`, releases up to `v0.1.7`), also needs `VINCI_REGISTRY=ghcr.io/meetvinci/` in `.env`; the old registry's login can stay, unused (`docker logout registry.example.com` removes it). To switch:

1. Back up everyone, the template workspace and the hub's folder with `bun deploy.ts nightly` ([above](#nightly-backups)), and confirm `bun deploy.ts nightly status` says `ok`. A new version can change the database; the old version may not read it again. The [audit trail](#activity) is a file in the hub's folder, so the upgrade keeps it. A backup restarts each person's Vinci as it was, on the old version, although the new deployment files are already in place; step 2 moves everyone to the new version. On the first upgrade to the version with nightly backups, the hub stops for about 7 seconds instead of 3: the running hub still has the old health check. Note the run's time (`Last run: backups/<time>`): it stays for 7 days like the nightly runs, a later run on the same day included, and is the one to restore if the new version goes wrong.

2. Set the new tag in `/opt/vinci/.env`, for example `VINCI_TAG=v0.2.0`, and run:

   ```sh
   docker compose up -d --wait
   ```

   Every Vinci container restarts, which takes about 10 seconds; cloudflared stays up. Open chats reconnect on their own. Routines that were due during the restart run once when Vinci is back.
3. Then run:

   ```sh
   bun deploy.ts apply
   ```

   It writes the per-person files again from `users.yaml` with the new `deploy.ts`, starts anything the new version adds, and usually restarts nobody (about 4 seconds). When the new `deploy.ts` changes what each person's Vinci is started with, it recreates every person's Vinci and the template once more: the upgrade to the version where people's Vinci wait for the firewall did (about 9 seconds; the hub stays up and logs one `502` for a person's open tab). Skipping it can leave a new version half installed: an upgrade to the version with global settings otherwise runs no template workspace, the hub logs `template: false`, and **Global settings** in the panel cannot work.
4. Check: `docker compose ps` shows the new tag on the hub, the provisioner, web, `vinci-daemon-template-1` and every person's daemon, all healthy. From the version with the firewall on, `vinci-firewall-1` shows `Up` on the new tag and `bun deploy.ts firewall status` says `healthy` (before the version with its health check it showed no health status). From the version with the [audit trail](#activity) on, `ls -ln hub/audit.sqlite` shows the file owned by `1000 1000` with mode `-rw-------`: the hub creates it on its first start. The hub log may show `The provisioner did not take the admin list yet; trying again` once, because the provisioner restarts at the same moment; it is harmless when no error line follows. If someone has Vinci open during the restart, the hub may also log one or two `ERROR … 502` `Request refused` for `/health` with `The daemon of <id> did not answer /health`: their app asked while their Vinci was restarting, and it reconnects on its own. Only the same line again after the containers are healthy means a problem. From the version with the **Advanced user** switch on, every Vinci is marked as part of a team: `for c in $(docker compose ps --format '{{.Name}}' | grep daemon-); do echo "$c $(docker inspect $c -f '{{range .Config.Env}}{{println .}}{{end}}' | grep DAEMON_TEAM)"; done` prints `DAEMON_TEAM=true` for every person and the template (from the version where every Vinci is part of a team by itself, the setting is only kept so that an older version under the new files still is; when you roll back past that version, still put the old `daemon.yaml` back with the old tag), and after the first upgrade to it nobody is advanced until you switch them on (`grep -c advanced users.yaml` prints `0`). From the version with the [sandbox](#what-a-bot-can-do-and-reach), `bun deploy.ts status` prints every person's Vinci and sandbox, and the template's, as `running (healthy)`.
5. Nothing to press afterwards: the new hub copies every global section again as it starts, as **Sync now** would. Check, a minute after step 2: **Activity** has a `global/sync` row by `hub start` (or `docker compose logs hub` has `Admin made a change` with `by: hub start`), the sync status shows no *failed* section, and a person who follows global for Secrets sees the template's secrets marked *From your admin*.

**The first upgrade to the version with [disk limits](#disk-limits) needs no extra step either**: step 3's `apply` gives every person and the template a sandbox disk of `SANDBOX_DISK` (5 GB unless `.env` says otherwise), stops each one for a moment, moves their bot folders and their bots' home (`bot-home`, with whatever bots installed there) onto it and starts them again (about 10 seconds in all for three people; it fails with a clear message, changing nothing, when someone's bot folders and home do not fit). It also writes the boot unit. Check with `bun deploy.ts status`: a `disk … of 4.8 GiB` column for everyone (5 GB less the file system's own space).

**The first upgrade to the version with the [sandbox](#what-a-bot-can-do-and-reach) needs no extra step**, only the new image (`vinci-sandbox`) and file (`sandbox.yaml`) above; `.env` needs nothing (the sandbox limits default to 512 MB, 1 CPU and 256 processes). Between step 2 and step 3 nobody's Vinci runs: under the old per-person file the new Vinci has no shared folder for its sandbox and restarts over and over (`Vinci's daemon image runs only as a person's daemon in a Docker install … no volume is mounted there` in `docker compose logs daemon-<id>`; an image from before that check says `EROFS: read-only file system, rm '/run/sandbox/exec.sock'`), so step 2 ends with `container vinci-daemon-<id>-1 is unhealthy` and exit code 1. That is expected on this one upgrade: go straight on to step 3, which renders the new file and starts everyone (proven on an x86 server from `eddf8ac`; about 20 seconds of downtime in all). Step 3's `apply` creates each person's sandbox, its network and its shared-folder volume, adds the folders the sandbox mounts to older volumes, and recreates everyone's Vinci once more (about 20 seconds; open chats reconnect). Bots keep their folders and files. Plugins and MCP files inside a bot's own folder stop loading from then on; move any you rely on to the shared places ([set up bots](#set-up-bots-skills-and-tools-for-a-person)).

**The first upgrade to the version with the bots' [home folder](#what-a-bot-can-do-and-reach) needs no extra step** either: step 3's `apply` adds `bot-home` to every volume and recreates each sandbox on it, and each sandbox fills its empty home with the starting files as it starts. The sandbox image is about 350 MB bigger (Node, Python, uv and the other tools). Bots' tool calls wait a few seconds while the sandboxes restart. Anything a bot left in its old home in `/tmp` was gone at every restart anyway.

The first upgrade to a version with the [firewall](#what-a-bot-can-do-and-reach) needs a check before step 2. The firewall service starts in step 2 (`up -d --wait`), not in step 3.

- Before step 2: `iptables --version` must end with `(nf_tables)`. If it says `(legacy)`, stop: the firewall refuses such a host, step 2 reports it unhealthy and step 3's `apply` stops with `This server's Docker uses iptables-legacy`. Don't run `iptables-legacy` commands to look: on an nf_tables host they create empty legacy tables and every later `iptables` command warns about them.
- Before step 2, if you upgrade over SSH and want a safety net: `systemd-run --on-active=10m --unit=vinci-fw-undo --working-directory=/opt/vinci /usr/local/bin/bun deploy.ts firewall remove` removes the firewall's rules in 10 minutes unless you cancel it with `systemctl stop vinci-fw-undo.timer` once a new SSH login works, `iptables -S INPUT` shows the policy and rules it had before plus only the jump to `VINCI-DAEMONS-HOST`, step 4's checks pass and a bot answers. The rules only match people's networks (`-i mv-d+`), so SSH is not at risk; if the undo does run after step 3, the hub reaches nobody until you roll back as below.

Step 3's `apply` moves every person's network to the firewall's settings, once. Docker can only do that by recreating the network, so `apply` first removes the hub's and those people's containers (`Moving daemon-… to the firewall's networks` in its output) and then creates them again on the new networks. Nobody's data is at risk: it removes containers, never volumes, and `hub/` stays on disk. The hub and everyone's Vinci are down for about 7 seconds until `apply` ends; cloudflared may log `ERR … lookup hub` for an open tab meanwhile, which is harmless. Only a by-hand `apply` does this: until it has run, the admin panel's add, change and remove refuse with `vinci_user-<id> … predate the firewall: run bun deploy.ts apply on the server once` and change nothing. Before this version the step was a manual `docker compose rm -sf …` between step 2 and step 3; it is no longer needed. `iptables -S DOCKER-USER` must then show the jump to `VINCI-DAEMONS`, and `ip -br link` a bridge `mv-d<9 hex>` per person and the template. If bots use a service on the server or your private network (such as a test model on `172.17.0.1:48290`), set `VINCI_INTERNAL_ALLOW` in `.env` before step 2 ([what a bot can reach](#what-a-bot-can-do-and-reach)), or their turns fail after the upgrade.

The first upgrade to a version with the admin panel needs three more things, once, before step 2: add `admins:` with your email to `users.yaml`, and `HUB_ADMIN_EMAILS` and `PROVISIONER_TOKEN` to `.env` (the two commands in [install, step 7](install.md#7-start-vinci)). The `apply` in step 3 then lets the provisioner write the hub's user list (the `hub` folder becomes group root, mode 770); without it every change in the admin panel fails.

**The first upgrade to a version with global settings changes nobody's settings.** People who were there before start with every section *overridden*: they keep their own keys, secrets, chat and tool settings and `~/.agents` files, and get nothing from Global settings. Before you switch a section of theirs to *global*, set that section in Global settings, and know that the switch replaces their values with the global ones: for Secrets only a secret with a global secret's name, for Sources it replaces their `~/.agents` folder, for Models it signs out API keys the template doesn't have. The panel lists what each switch removes before you confirm. Back them up first. People you add after the upgrade, in the panel or with a new line in `users.yaml`, follow every section.

**After the upgrade to the version where people keep their own secrets**, the secrets an older hub copied get their *global* mark from the copy the new hub makes as it starts (step 5), also after a rollback and a new upgrade. An upgrade straight to the version where people keep their own secrets but before the hub copies at start (`52140c6` to `f145f7e`) still needs **Sync now** once. Nobody loses a secret. A rollback to an older version keeps every secret, but its next sync removes the own secrets of everyone whose Secrets follow global, as before; override their Secrets first if they must keep them.

To roll back, copy the old version's deployment files into `/opt/vinci` again (from a checkout of that version), set the old tag, and run `docker compose up -d --wait` and then `bun deploy.ts apply`, as for an upgrade. Both steps matter: an older hub may refuse the newer `hub/users.json` and let nobody in (a rollback from global settings to the first admin panel version logged `unrecognized_keys` and *Users file … invalid: every request is refused*), and only the old `deploy.ts apply` writes the file it expects. Rolling back past global settings removes the template container and keeps its volume, so a later upgrade finds the global settings and suggested bots again. Rolling back past the **Advanced user** switch works the same way: until the old `apply` runs, the old hub refuses a `hub/users.json` that has `"advanced": true` for anyone (`unrecognized_keys`, *every request is refused*), and the old `apply` writes it without that key. A version from before the switch also drops `advanced` from `users.yaml`: its hub sends the admin list to its provisioner as it starts, and that provisioner rewrites `users.yaml` without the key. So before rolling back past the switch, copy the list: `cp users.yaml users.yaml.before-rollback`. After upgrading again, add `advanced: true` back under each person who has it in that copy and run `bun deploy.ts apply` (or turn their switch on in the panel). A rollback to a version with the switch keeps it, and so does upgrading again from there. Rolling back past the firewall: first, with the new files still in place, run `bun deploy.ts firewall remove`; after copying the old files, run `docker compose rm -sf $(docker compose ps --services | grep -e '^hub$' -e '^daemon-')` before the old `apply`, which puts people's networks back without the firewall's settings (the old `apply` does not do it itself). A rollback to a version with the firewall but before its health check needs none of this. Rolling back past [disk limits](#disk-limits): the bot folders are on the disks, which an older version does not know. Before the old `apply`, with everyone stopped (`docker compose stop`), copy each person's back into their volume: `for d in disks/*/; do id=$(basename $d); for f in agents bot-home; do cp -a $d/$f/. /var/lib/docker/volumes/vinci_data-$id/_data/$f/; done; done` (the volume's `agents` and `bot-home` folders are empty since the upgrade), then `systemctl disable vinci-disks.service`. Keep `disks/` until the rollback is checked; a later upgrade moves only into a new disk, so delete `disks/` (`umount disks/*/` first) before upgrading again, or that person's bot folders on the old disk win. Rolling back past the sandbox: run the old `bun deploy.ts apply` before `docker compose up -d --wait` (the other way round, `up` stops at `No such image: vinci-sandbox:<old tag>`, because the per-person file still lists sandboxes). The old `apply` removes the sandbox containers, and the old Vinci runs bots' tools inside itself again, with everything that reaches. **It also loads every plugin and MCP file bots wrote in their own folders while the sandbox ignored them**: before rolling back, list them with `find /var/lib/docker/volumes/vinci_data-*/_data/agents \( -path '*/.agents/plugins*' -o -path '*/.pi/plugins*' -o -name '*mcp.json' \)` and remove what nobody put there on purpose, or restore each person from the backup made before the upgrade. In the rollback test, a plugin a bot had left there ran in the old Vinci at once, read its model key, and then kept it from starting. Rolling back past the version where the images always wait for the firewall: run the old `bun deploy.ts apply` before `docker compose up -d --wait` too. The other way round, until the old `apply` runs, the old Vinci and sandboxes run under the new per-person file, which no longer asks them to wait, so a reboot between the two steps starts them before the firewall's rules. Rolling back past the bots' home folder needs no step: the old sandbox uses `/tmp` as its home again, and `bot-home` stays in each volume, unused, until a later upgrade. The `vinci_sandbox-<id>` volumes and networks stay unused until a later upgrade or `docker volume rm` / `docker network rm` by name. If the new version changed someone's data, restore their backup from before the upgrade. The version where a copied bot starts on first open changes everyone's data: an older Vinci refuses the newer database and restarts over and over (`corrupted migrations: previously executed migration 0006_bot_start is missing` in `docker compose logs daemon-<id>`). Rolling back past it, restore every person and the template (`template` as the id) from the backup you made before the upgrade, as in [Restore one person](#restore-one-person); what they did since is lost.

**Give this to your agent:**

> On `root@<server>`, upgrade Vinci in `/opt/vinci` to image tag `<tag>`: pull the release images for that tag as in install step 3, confirm `docker images` lists `vinci-daemon`, `vinci-sandbox` (from the version with the sandbox), `vinci-web`, `vinci-hub`, `vinci-provisioner`, plus `vinci-firewall` and `vinci-api` if the release includes them, and that `/opt/vinci` has the deployment files from the same checkout. Back up everyone with `bun deploy.ts nightly`, confirm `bun deploy.ts nightly status` says `ok` and note that run's time: it is the backup to restore if the upgrade goes wrong. On the first upgrade to the version with the firewall, first check that `iptables --version` says `(nf_tables)` (stop if not) and arm the 10-minute `vinci-fw-undo` timer from the Upgrades section. Set `VINCI_TAG=<tag>` in `.env`, run `docker compose up -d --wait`, then `bun deploy.ts apply` (on the first upgrade to the version with the firewall it recreates the hub and everyone's Vinci on new networks itself). Confirm every container is healthy on the new tag, `vinci-daemon-template-1`, the sandboxes and the firewall included, `bun deploy.ts status` exits 0, `bun deploy.ts firewall status` says `healthy`, and the hub log shows no error; with the undo timer armed, cancel it only after a new SSH login works and `iptables -S INPUT` shows only our jump added. Don't switch anyone's settings sections to global. The hub copies the global settings again as it starts; confirm the `global/sync` by `hub start` line in its log a minute after the restart. If anything fails, roll back as the Upgrades section says: the previous version's deployment files, the previous tag, `docker compose up -d --wait`, then `bun deploy.ts apply`.

### Images from CI

GitHub Actions (the **Images** workflow) builds all Vinci images for amd64 and arm64 and publishes them to GitHub Container Registry as `ghcr.io/meetvinci/vinci-<image>`:

| Trigger | Tags |
| --- | --- |
| A release tag `vX.Y.Z` | `vX.Y.Z` |
| A push to `main` | `main` and the full commit |
| A manual run on any branch or tag (`gh workflow run images.yml --ref <branch>`) | the full commit |

There is no `latest`. The workflow pushes with its own `GITHUB_TOKEN`; it needs no secret. A newer push to main cancels a main build still running; release tags and manual runs always finish. GitHub keeps every version, so rolling back to any earlier release or commit only needs its tag.

The packages are public: servers pull them with no `docker login` and no password to keep. GitHub creates each package private the first time the workflow pushes it, so a new image needs an org owner to set it public once: the package's page under the `meetvinci` organization, **Package settings**, **Change visibility**, **Public**. Until then a server's pull fails with `unauthorized` or `denied`.

one client install still runs `v0.1.7` from the old private registry (`registry.example.com/vinci/`, logged in as `vinci-pull`) until it is upgraded; nothing new is published there.

## Status and logs

```sh
docker compose ps                        # every container and its health
bun deploy.ts status                     # each person's Vinci, sandbox and disk, the server's free space; exits non-zero on a problem
docker stats --no-stream                 # memory and CPU per container
docker compose logs hub --since 1h       # the hub: logins refused, users loaded, pairing
docker compose logs hub | grep -B1 -A9 'hub-audit'   # admin reads and changes since the hub container started; the full trail is in Activity
docker compose logs daemon-<id> -f       # one person's Vinci, live
docker compose logs sandbox-<id>         # their sandbox: start, firewall wait
```

**Give this to your agent:**

> On `root@<server>`, in `/opt/vinci`, report `docker compose ps`, `bun deploy.ts status`, `docker stats --no-stream` and any error in `docker compose logs --since 1h`. Change nothing.

## Tear down

Removes the team's Vinci from the server and Cloudflare. Back up everyone first if anything may be needed later. Do the steps in this order: the connector must stop before Cloudflare deletes the tunnel.

1. On the server, stop and remove the containers and networks, then remove the firewall's rules. Volumes stay:

   ```sh
   cd /opt/vinci && docker compose down && bun deploy.ts firewall remove
   ```

   Expected: `Removed VINCI-DAEMONS and its jump from DOCKER-USER` and the same for `VINCI-DAEMONS-HOST` and `INPUT`.

2. On your computer, in the Vinci repository, list what the Cloudflare script would delete. Use the same `--zone`, `--hostname`, `--name` and, if you set up SSH, `--ssh-hostname` as at install:

   ```sh
   CLOUDFLARE_API_TOKEN="$(op read '<token reference>')" bun scripts/deploy.ts cloudflare destroy --zone <domain> --hostname <team>.<domain> --name vinci-<team> [--ssh-hostname <team>-ssh.<domain>]
   ```

   Check that every line names `vinci-<team>` or `<team>.<domain>`. Then run the same command with `--yes` to delete exactly those. Expected: one `Deleted …` line per object.

3. Only when nobody's data is needed any more, delete it on the server, by name:

   ```sh
   docker volume rm vinci_ipc $(docker volume ls -q --filter name=^vinci_data-) $(docker volume ls -q --filter name=^vinci_disk-)
   umount /opt/vinci/disks/*/ ; systemctl disable vinci-disks.service ; rm /etc/systemd/system/vinci-disks.service
   docker rmi vinci-daemon:<tag> vinci-web:<tag> vinci-hub:<tag> vinci-provisioner:<tag> vinci-firewall:<tag> vinci-api:<tag>
   rm -rf /opt/vinci
   ```

   This deletes every person's bots, chats, files and keys, their sandbox disks in `/opt/vinci/disks`, and the backups in `/opt/vinci/backups`. Never use `docker system prune` or `docker volume prune` instead: they act on everything on the server.

**Give this to your agent:**

> Tear down the Vinci team install on `root@<server>`: run `docker compose down`, then `bun deploy.ts firewall remove`, in `/opt/vinci`. Then in my Vinci checkout, with `CLOUDFLARE_API_TOKEN` read from `<where you keep it>` inside the command, run `bun scripts/deploy.ts cloudflare destroy --zone <domain> --hostname <team>.<domain> --name vinci-<team>` (add `--ssh-hostname <team>-ssh.<domain>` if SSH was set up), show me the list, and check that every object carries `vinci-<team>` or `<team>.<domain>`. Run it again with `--yes` only after I confirm. Keep the volumes and `/opt/vinci` unless I say to delete the data.
