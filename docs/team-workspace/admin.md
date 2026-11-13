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
- Every change made in the panel is recorded with the admin's email: see [Activity](#activity).

> [!WARNING]
> Admins are fully trusted. Through a bot's MCP servers, plugins and skills an admin can run code inside any person's Orbs, so they can technically read that person's data. The panel only offers no way to chat or answer as someone. Make someone an admin only if you would give them the server.

**Give this to your agent:**

> On `root@<server>`, in `/opt/orbs`, show me `hub/admins.json` and the hub log lines from the last day that start with "Admin". If `admins.json` is missing or invalid, set `HUB_ADMIN_EMAILS=<my email>` in `.env`, move the broken file aside, and run `docker compose up -d hub`; confirm the log says "Admins seeded from HUB_ADMIN_EMAILS".

## The user list

`/opt/orbs/users.yaml` is the one list of people. Each person is a user id and their login email, either on one line or with a display name, whether they are enabled and whether they are an advanced user. `admins:` lists the admin panel's admins:

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
- Admins can log in at Cloudflare. An admin has no Orbs of their own unless they are also under `users:`.
- The admin panel changes this file through the provisioner, which rewrites it in the long form and drops comments. Don't edit it by hand while someone is changing people in the admin panel.
- After every edit, run `bun deploy.ts apply`. It writes the hub's `hub/users.json` and `users.compose.yaml` from this list and starts or stops containers to match. Never edit those two files by hand: the next `apply` overwrites them.
- `apply` never restarts the hub or the other people's containers, so nobody else is logged out.
- The hub reads the new list on the next request that reaches it, at most once a second. Its log line `Users loaded` with the new count therefore appears only after someone uses Orbs; to check right after `apply`, count the users in `hub/users.json` instead: `grep -c '"id"' hub/users.json`. It counts people only; the template workspace's entry has no id.
- If the list has a mistake, `apply` stops before changing anything and says what is wrong.

## Add a person

In the admin panel: add them with their name and email, and leave ticked the [suggested bots](#global-settings-and-suggested-bots) they should start with. It creates their Orbs with the global settings and those bots. If their email is inside the team's domain rule, or the server may update Cloudflare Access ([below](#let-the-server-update-cloudflare-access)), they can log in at once. Otherwise the panel says *<email> can't sign in yet*: do step 2 below, or add the email in the Cloudflare dashboard (Zero Trust › Access controls › Policies › `orbs-<team>-allow` › Include › Emails).

By hand:

1. Add a line for them to `users.yaml`, then run:

   ```sh
   bun deploy.ts apply
   ```

   It creates their volume, network and container and waits until the container is healthy.
2. Let them log in at Cloudflare. Skip this if their email is inside the team's domain rule (`CLOUDFLARE_ACCESS_DOMAINS` in `.env`). On your computer, in the Orbs repository, copy the list's emails into the Access policy (the Cloudflare token stays on your computer, so the server cannot do this step):

   ```sh
   ssh root@<server> cat /opt/orbs/users.yaml | CLOUDFLARE_API_TOKEN="$(op read '<token reference>')" bun scripts/deploy.ts cloudflare emails --users - --zone <domain> --hostname <team>.<domain> --name orbs-<team>
   ```

   Expected: `Access policy orbs-<team>-allow: updated` and the list of allowed emails. The command keeps the policy's domain rule as it is.
3. Send them the address, `https://<team>.<domain>`. On their first visit they type their email and enter the code from their inbox. Their browser pairs itself and shows their bots. They see no setup steps: no provider sign-in, no model choice, no bot to create. Add their bots first (in the admin panel, or see [Create a bot by hand](#create-a-bot-by-hand)).

Model keys come from the server's `.env` (see [Set model API keys](#set-model-api-keys)); a new person gets them automatically.

**Give this to your agent:**

> On `root@<server>`, add `<email>` as Orbs user `<id>`: add the line `  <id>: <email>` under `users:` in `/opt/orbs/users.yaml`, and run `bun deploy.ts apply` in `/opt/orbs`. Confirm `docker compose ps` shows `orbs-daemon-<id>-1` healthy and `grep -c '"id"' /opt/orbs/hub/users.json` equals the number of enabled people in `users.yaml`. Then, in my Orbs checkout with `CLOUDFLARE_API_TOKEN` read from `<where you keep it>` inside the same command, run `ssh root@<server> cat /opt/orbs/users.yaml | bun scripts/deploy.ts cloudflare emails --users - --zone <domain> --hostname <team>.<domain> --name orbs-<team>` so they can log in, unless their email ends in one of the domains in `CLOUDFLARE_ACCESS_DOMAINS` in `/opt/orbs/.env`. If it says the token is empty, ask me to unlock my password manager.

## Disable a person

Disabling locks someone out without deleting anything: they cannot log in, their container stops and is removed, and their volume stays. Enabling them again starts a new container on the same volume.

In the admin panel, switch them off. By hand, set `enabled: false` in their entry in `users.yaml` (the long form above), run `bun deploy.ts apply`, then update Cloudflare Access as in [Add a person](#add-a-person), step 2 (not needed with a domain rule: the hub already refuses them).

**Give this to your agent:**

> On `root@<server>`, disable Orbs user `<id>`: in `/opt/orbs/users.yaml` turn their entry into the long form with `name`, `email` and `enabled: false`, run `bun deploy.ts apply` in `/opt/orbs`, and confirm `orbs-daemon-<id>-1` is gone, their volume `orbs_data-<id>` still exists and `hub/users.json` no longer lists their email. Then update the Access policy with `cloudflare emails` as in "Add a person". Don't delete their volume.

## Remove a person

In the admin panel: delete them. Their login goes, their container stops and is removed, their volume stays. By hand:

1. Delete their entry from `users.yaml` (their one line, or in the long form their id line and the lines under it), then run:

   ```sh
   bun deploy.ts apply
   ```

   The hub refuses them within about a second and closes their open connections. `apply` then stops and removes their container and network. Their volume stays.
2. Take their email out of the Access policy with the same command as when adding someone. With a domain rule there is nothing to take out: they can still get a login code, but Orbs refuses them.

   ```sh
   ssh root@<server> cat /opt/orbs/users.yaml | CLOUDFLARE_API_TOKEN="$(op read '<token reference>')" bun scripts/deploy.ts cloudflare emails --users - --zone <domain> --hostname <team>.<domain> --name orbs-<team>
   ```
3. Keep their volume until you have a backup or are sure it is not needed. To delete it for good:

   ```sh
   bun deploy.ts purge <id>
   ```

   This deletes their volume, their owner-socket folder and the hub's saved ID for them. It restarts the hub, which takes a few seconds; everyone's open chats reconnect on their own. It refuses while the id is still in `users.yaml`.

   It keeps the [audit trail](#activity) rows about them: those are a record of what admins did, not the person's data.

**Give this to your agent:**

> On `root@<server>`, remove Orbs user `<id>` (`<email>`): delete their entry from `/opt/orbs/users.yaml` (one line, or their id and the indented lines under it), run `bun deploy.ts apply` in `/opt/orbs`, and confirm their container is gone and `grep -c '"id"' /opt/orbs/hub/users.json` equals the number of people left. Then, in my Orbs checkout with `CLOUDFLARE_API_TOKEN` read from `<where you keep it>` inside the same command, run `ssh root@<server> cat /opt/orbs/users.yaml | bun scripts/deploy.ts cloudflare emails --users - --zone <domain> --hostname <team>.<domain> --name orbs-<team>`. Keep their volume.

## The admin panel's provisioner

The admin panel adds, disables and removes people through the provisioner, a small service in the stack. It runs exactly the same `bun deploy.ts apply` as you do by hand, one change at a time, and answers only the hub, with the secret `PROVISIONER_TOKEN` from `.env`, on a network only the two share. It cannot do anything else: no other Docker commands, no backups, no purges.

A change waits only for that person's Orbs to start, so another person's broken container does not block it. If a change fails, an add or a switch-on is undone in `users.yaml`, so you can simply try again; a switch-off or removal stays done, so the login stays gone. The panel and `bun deploy.ts apply` by hand never run at once: whichever comes second stops with *Another apply or admin panel change is running* and can be repeated a minute later.

> [!WARNING]
> The provisioner holds the Docker socket, which is full control of the server. A flaw in the provisioner, or anyone who gets `PROVISIONER_TOKEN` and can reach it, could take over the server. Only the hub can reach it, so the hub is now part of what protects the server: keep images current and keep `.env` readable by root only. To turn the panel's user changes off, stop it with `docker compose stop provisioner`; the panel then cannot add or remove people, and `bun deploy.ts apply` by hand still works.

**Give this to your agent:**

> On `root@<server>`, in `/opt/orbs`, check the provisioner: `docker compose ps provisioner` must be healthy, `docker inspect orbs-provisioner-1` must show `ReadonlyRootfs` true, `CapDrop [ALL]`, no `CapAdd`, no `PortBindings`, and only the networks `orbs_provisioner` and `orbs_egress`; `docker network inspect orbs_provisioner` must list only the hub and the provisioner. Report `docker compose logs provisioner --since 1h` without secrets. Change nothing.

## Let the server update Cloudflare Access

Without a Cloudflare token on the server, the admin panel adds and removes people but cannot change who may log in: for anyone outside the team's domain rule it tells you to change the Access policy by hand (step 2 of [Add a person](#add-a-person)). With a list of emails, the install recommends this token. To let the server do it, create a second, smaller Cloudflare API token (My Profile › API Tokens › Create Token › Create Custom Token) with only:

- Account › Access: Apps and Policies › Edit, for your account
- Zone › Zone › Read, for your domain

A token with Access: Apps and Policies › Read instead of Edit only lets the panel show whom Cloudflare lets in; changes then still say *can't sign in yet* for people outside the domain rule.

Don't reuse the install token: it can also change the tunnel and DNS. Store it in `/opt/orbs/.env` as `CLOUDFLARE_API_TOKEN`, then recreate the provisioner:

```sh
ssh root@<server> 'cd /opt/orbs && sed -i "/^CLOUDFLARE_API_TOKEN=/d" .env && cat >> .env && docker compose up -d --wait provisioner' < <(printf 'CLOUDFLARE_API_TOKEN=%s\n' "$(op read '<token reference>')")
ssh root@<server> 'cd /opt/orbs && docker compose logs provisioner | grep listening | tail -1'
```

Expected: `Access sync on.` (followed by `domain rule @<domain>` with a domain rule). It needs `CLOUDFLARE_ZONE` and `CLOUDFLARE_NAME` in `.env` too (install step 6 writes them); without them the provisioner refuses to start and says so. Anyone with root on the server can read the token. With it, the allow policy follows `users.yaml`: enabled users and admins, apart from those inside the domain rule, which only `cloudflare apply --domain` changes. Removing the line and recreating the provisioner turns it off again.

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

An advanced user can also add their own key in Orbs, **Settings → Models** (see [What people see](#what-people-see)); you can do it for anyone in the panel. Theirs wins over the shared one.

Do not use a Claude or ChatGPT subscription login for the team. The providers' terms do not allow one subscription to serve several people.

**Give this to your agent:**

> On `root@<server>`, set the `<provider>` API key for Orbs: read it from `<where you keep it>`, write it as `<VARIABLE>` in `/opt/orbs/.env` without printing it, then run `docker compose up -d --wait` in `/opt/orbs` and confirm every `orbs-daemon-*` container is healthy.

## The admin panel

Open `https://<your team host>/admin` and log in at Cloudflare as usual. Only emails on the admin list see it; an admin does not need to be a user and has no workspace of their own.

- **Users** lists everyone with their workspace state. Add a user with a name and email; open one to manage them.
- For one user, **Bots** and **Settings** show the same forms the user sees in their own app, saved straight to that user's workspace. **Devices** lists the browsers and phones they signed in with; revoking one signs it out. Below it, **Rate limits** sets how much that person's Orbs accepts before it answers *too many requests*: requests per minute from each device and in total, pairing attempts per minute, and requests and live updates at the same time. Each field shows its default and its allowed range, and the person's Orbs refuses a value outside it. Limits are per person, not part of global settings; each save is recorded in **Activity**. People can't change their own limits.
- **Advanced user** (a switch on the person's page) shows them the advanced settings in their own app; see [What people see](#what-people-see). Off for everyone until you turn it on, and recorded in **Activity** as `users/advanced` `on` or `off`.
- **Turn off sign-in** stops the person from logging in. **Remove user** removes their login and stops their workspace; their data stays on the server (deleting it is `bun deploy.ts purge <id>` on the server).
- **Global settings** edits the template workspace: the team's default settings and the suggested bots. Each person follows each section or overrides it; see [Global settings and suggested bots](#global-settings-and-suggested-bots).
- **Admins** lists who can open the panel. Add or remove admins there; the last admin cannot be removed.
- Each user and admin shows whether Cloudflare Access lets them in. *Not allowed in Cloudflare* is highlighted for someone who should be able to sign in: they get no login code until their email is in the team's allow policy. Without a Cloudflare token on the server the state is *unknown*, with one line saying why.
- With a domain rule, a notice above the users says that anyone at that domain can request a login code and only the people listed get in.
- When the panel says *<email> can't sign in yet* (or *Remove <email> from Cloudflare Access*), the server could not change the policy: add or remove that email in the Cloudflare dashboard (Zero Trust › Access controls › Policies › `orbs-<team>-allow`), or run the `cloudflare emails` step from [Add a person](#add-a-person) on your computer.

The panel never pairs a device and never acts as the user in a chat. It can read a person's conversations (see [Reading a person's conversations](#reading-a-persons-conversations)) but cannot send messages, answer approvals or questions, react, stop, clear or change anything in a chat.

- **Conversations** shows a person's chat with each of their bots, read only: search (press Enter), older messages as you scroll up, and **Refresh** for anything new. Details below.

- A bot's **Routines** and **Todos** belong to the user. The panel shows them but cannot add, change, run or delete them.
- Provider sign-ins with a Claude or ChatGPT account are left out: they would put the admin's own account in someone else's workspace. Enter an API key instead.
- MCP servers that need a browser sign-in can be added, but the sign-in itself is not in the panel: the provider would send the browser back to your own login, not the user's Orbs. The user signs in from their own app.
- The app has no form to add a secret (a bot asks for one in chat), so neither does the panel. Secrets the user added show in **Settings → Secrets**, and you can remove them there.
- A bot's commands see only a placeholder for each secret. The person's Orbs swaps in the value only over HTTPS to the secret's allowed hosts. Images built before the Bun 1.4.4 pin refused every such request with *Proxy authorization required*, so secrets work only after you upgrade to an image from that pin or later.

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

Without scripts a page can still be clicked: a plain link inside it opens in its frame, which is you choosing to visit that address (the panel then closes the page).

**What leaves no trace**

Reading changes nothing the person sees: nothing is marked read, unread counts, order, pins, hidden and muted flags stay as they were, and no bot runs or notifies anyone. The panel reads when you open a chat, scroll up or press **Refresh**, never in the background.

**The audit trail**

Every read is recorded with your email, the person, the bot and the conversation, never the content: one row when you open a chat, press **Refresh** or load older messages, one per chat searched, one per file opened, one per artifact version opened, one for the waiting approvals and one for the waiting questions when something is waiting (opening a chat with nothing waiting adds no row for them), one each time you press **Load outside content**, and one when the person's Bots tab reads their routines or todos. See them under [Activity](#activity). If the hub cannot record a read, it refuses the read: the panel shows the chat or file as failed, and nothing is shown unrecorded.

**What the panel does not show (known gaps)**

- A reply still being written appears after **Refresh**; so does an approval or question asked after you opened the chat.
- Links show without a preview or a site icon. A preview is fetched live by the person's Orbs each time (it stores none), so showing one would make their workspace fetch an address of your choice, and the preview's picture and the icon would load in your browser from outside sites. Previews were removed in the wave 3 review for that reason, and stay off.
- A page without its scripts may look incomplete (charts drawn by script stay empty and the frame keeps a fixed height; it still gets the panel's colours). The notice shows on every page that has script, since the panel cannot tell what a script would do without running it.
- After **Load outside content**, a picture address can point at the panel's own read addresses, so your browser makes that read as you: it shows nothing to the bot, but a file read through it is recorded as yours.
- **Cleared history is gone.** When the person clears a chat, its messages, files, subagent runs and private conversations are replaced by an empty chat; only the routines, todos and the latest version of each artifact carry over. You then see the same as the person.
- The template workspace has no conversations with anyone.
- There is no export.

**Give this to your agent:**

> On the Orbs team install at `https://<team host>`, I'm an admin. Open `/admin`, add user `<name>` with email `<email>`, then on their page create a bot called `<bot>` with model `<model>` and these instructions: `<text>`. If the panel says they can't sign in yet, run the `cloudflare emails` step from the "Add a person" section of `docs/team-workspace/admin.md` in my checkout. Confirm the bot appears in their Bots tab.

## What people see

The app a person opens is simpler than the one a single owner gets: it hides what most people never need. Hiding is not a permission; the panel always shows you everything, whatever a person sees.

**Everyone sees:** appearance, the Enter key and notifications; sidebar sections, pin, hide and mute; artifacts and every chat action; approvals; answering a bot's questions, a secret included; routines and todos; resetting a chat; removing their own devices and stored secrets; creating and deleting bots; a bot's name, handle, avatar, instructions, *Also read the shared instructions*, skills, *Use shared plugins*, shared MCP servers on and off, adding MCP servers from the presets and removing them, MCP sign-in with their own account; and a bot's main and fallback model and reasoning, from the providers you configured. Each bot's **Tools** tab also lists its [always approved tools](#always-approved-tools), which they can remove.

**Only an advanced user sees:** **Settings → Chat**'s workspace settings (new messages while a bot works, hiding tool calls and thinking, GIFs); **Settings → Models** (adding a provider key, subscription sign-in, sign-out, *Replace a model across bots*); the Jev key in **Settings → Tools**, only while you have overridden their Tools (to give one person their own key, override their Tools in the panel and set it there); **Settings → Sources**.

**Nobody sees (you set these in the panel):** a bot's permission level; approval rules and the approval timeout; how bots use secrets; **Settings → Server**; the desktop app's connection settings; onboarding; *Create pairing PIN*; the avatar and chat lab links.

New bots a person creates start at **Ask first**, the app's default.

**Refused for everyone, advanced or not:** each person's Orbs itself refuses a few security settings from any of their devices, so these hold even in an old browser tab or the phone app: changing a bot's permission level, approval rules and the approval timeout, how bots use secrets, changing or removing a global secret, adding an MCP server that runs a command on the server (the presets are web addresses and work), and rate limits. They answer *Your admin manages this*. You change all of them in the panel (rate limits on the person's **Devices** page). A bot can't add a command MCP server for them either.

A settings section that follows global shows *Managed by your admin* above the values, which can't be changed there: its add, remove, edit and **Save** buttons are hidden, and Tools shows only whether a Jev key is set. The panel's sections that follow global hide the same buttons; there Tools still shows the approval rules and timeout, with the Jev key's state instead of its field. Where a normal person can't open **Settings → Sources**, a bot's *Also read the shared instructions* and its empty skills list say your admin sets them instead of pointing there. An advanced user also gets **Change it for me** on Models, Chat and Sources (not on Tools or Secrets, which only you override): that section becomes **Overridden** for them (you see it in the panel and in **Activity** as `sections/overridden`, by their email), they can edit it, and later global changes leave it alone until you use **Back to global**. **Settings → Secrets** is the exception: it always lists every secret, global ones marked *From your admin*, and the person can remove their own whether or not the section follows global.

The switch, and a section you switch back to global, reach the person's open app within about a minute, or when they load it again. Phone and desktop apps that don't load the web app still show everything (see the team workspace notes); the security refusals apply to them too.

## Global settings and suggested bots

Besides one Orbs per person, the server runs one more: the **template workspace** (`daemon-template`, volume `orbs_data-template`). Nobody logs into it and it is never in Cloudflare Access. `apply` always keeps it running; you never add it by hand. It holds two things:

- **Global settings.** Its settings are the team's defaults, edited in the admin panel with the same forms as a person's. There are five sections: Models (provider API keys and the model for new bots), Chat (busy mode, hide tool calls, GIFs), Tools (approval rules and timeout, the Jev key), Secrets and Sources (shared skill, instruction, plugin and MCP folders, and the files in its `~/.agents`).
- **Suggested bots.** Its bots are offered when you add a person.

For each person, each section either **follows global** or is **overridden**:

- A new person follows every section, and gets the template's values before *Add user* finishes.
- Saving a section on the template copies it to everyone who follows that section, within seconds.
- While a person follows a section, the panel cannot change that section for them (the hub answers `409 SECTION_FOLLOWS_GLOBAL`). Switch the section to *overridden* to edit it for that person; their current values stay.
- Switching a section back to *global* copies the template's values in again, replacing theirs: for Sources it replaces their `~/.agents` folder, for Models it signs out API keys the template doesn't have. The panel lists exactly this before you confirm, including a stored provider entry with an empty key and a global secret whose value is missing, which the copy also removes. A provider whose key is in the person's own `models.json` is listed as *Global's key will be used instead*: the template's stored key takes over, and the file itself is not changed. Not listed, because global never carries them: account sign-ins (OAuth), which stay unless the template has a key for the same provider; and inside `~/.agents`, `node_modules`, `.git` folders and symlinks, which the replace removes. If the person's `~/.agents` is over 2000 files or 6 MiB, the list shows the Sources settings only and says the folder is too large to list; confirming still replaces the whole folder.
- Overriding a section while a copy to that person is running keeps the override: the copy skips sections that are no longer global.
- A person who is turned off catches up when you turn them on again.
- If a copy fails (for example, the person's Orbs was restarting), the section shows *failed* with the reason. *Sync now* (`POST /admin/api/global/sync`) tries again.
- Every time the hub starts (an upgrade, a rollback, a server restart) it copies every global section again by itself, as *Sync now* does, and **Activity** shows it as `global/sync` by `hub start`. Overridden sections are left alone. A person whose Orbs does not answer is tried again for about a minute, then shows *failed* until the next *Sync now*; a person who is turned off catches up when you turn them on.
- Secrets come in two kinds. **Global secrets** come from the template; they show *From your admin*, and the person can't remove or change them. **Their own secrets** are the ones they gave a bot. A sync and **Back to global** never touch them, and the person can remove each one in **Settings → Secrets**, whichever mode the section has. You see them by name on the person's **Settings → Secrets** and can remove them there, even while the section follows global. *How bots use secrets* stays yours alone.
- If the template has a secret with the same name as one of the person's own, the global one wins: the next sync replaces the person's value, and it is gone. The **Back to global** list shows such a secret as *replaced*. If a bot later asks the person for a global secret's name, their answer is not stored; the bot uses the global value.
- If you remove a global secret from a person through the API while the section follows global, the next sync puts it back. To take one away from one person, override their Secrets first.
- People added before global settings existed, or added by hand in `users.yaml`, start with every section *overridden*: nothing of theirs is replaced until you switch a section to *global*.

Suggested bots: tick them in *Add user*, or copy one later from the person's page. A copy is a new bot of that person, with the same name, avatar, instructions, model, fallback, approval mode and the bot's own skill, instruction and MCP files. Conversations, routines and todos are never copied. The copy is independent: changing the template bot later does not change it. A copy does not start the bot: nothing calls a model until the person writes to it, and the person's first message is the bot's first turn (no introduction). Nor does a copy set up the routines its instructions describe (for example "check the inbox every hour"): it creates one only when the person asks it to, so say so in the bot's instructions or tell people to ask. A copy fails if the person already has a bot with that handle, or if the bot's own files are over 2000 files or 6 MiB; the panel names each bot it couldn't copy, and a failed copy leaves nothing behind, so you can fix it and copy again.

What global settings cannot carry:

- Sign-ins with a Claude or ChatGPT account (OAuth). They are bound to one Orbs and stay where they are; only API keys are copied. A person who follows Models keeps their own sign-ins.
- `models.json` (a provider's address or custom models). A person added in the panel gets none. If your provider needs one (a gateway, a proxy, a local model), write it into each new person's `/data/pi/models.json` as uid 1000 and restart their container, as before. A key stored in Global settings → Models wins over the `apiKey` in a person's `models.json` for the same provider (the file itself is kept), and the *Back to global* list says so for that provider: if each person has their own key in `models.json`, leave that provider out of Global settings or keep their Models overridden.
- Files outside `~/.agents` in the template, and `node_modules` or `.git` folders inside it: a plugin that needs its dependencies must have them installed for each person. A shared folder path pointing elsewhere is copied as a path; the files there are not. After you change template files by hand, run *Sync now* for Sources: editing files does not trigger a copy.
- Anything of a person's own bots. A global save never changes a bot's settings, skills or files.
- Notification and device settings, the theme and the Enter key: they belong to one person or one browser.
- Sign-ins to MCP servers that use OAuth: like provider sign-ins, each person signs in for themselves.
- Links inside `~/.agents`: a symlinked file or folder is skipped, never followed.

The template workspace is a full Orbs: 90-130 MiB of memory idle, like a person's; plan it as one more person. Back it up like a person: `bun deploy.ts backup template`. It can't be purged.

### In the panel

**Global settings** in the panel's top bar opens the template workspace with the same forms as a person's settings.

- **Settings** has the sections that can be shared: Models, Chat, Tools, Secrets and Sources. Saving one copies it to every person who has not overridden that section. The copy runs in the background.
- On a person's **Settings**, each of those sections says **Global** or **Overridden**. A global section is read-only there. **Override for this person** makes it editable with the person's own values. **Back to global** first shows what that person would lose: what will be removed, what will be replaced with the global value (for Secrets, also their own secret with a global secret's name) and what will be added, by name only (never a secret or key value), or says that nothing will be lost. Confirm replaces the person's values for that section with the global ones. If the person's workspace or the global settings don't answer, the list can't be shown and there is nothing to confirm. If anything changed after the list was shown, the switch is refused and the list reloads. A turned-off person's Orbs is stopped, so their sections can't be switched back to global from the panel until you turn them on again.
- *Copying the global values…* means a copy is running. *Couldn't copy the global values* shows the reason and a **Try again** button.
- **Models → Model for new bots** is the model (with its reasoning level and fallback) that a bot starts with when someone creates one, in their app or in the panel. They can still pick another of the configured models. It travels with the Models section: a person who follows Models gets yours, one who overrides it keeps their own (set in the panel on their **Settings → Models**), and **Back to global** lists it when it would change. With none set, or when the chosen model is not offered to them, the form starts with the newest model, as before. A model is not checked when you pick it, only offered in the form when that person's Orbs has it.
- **Suggested bots** are bots you create in Global settings with the usual bot form. In a team install that form has **Also read the shared instructions** (the bot's Instructions tab) on for a new bot, and so does a bot a person creates: every bot reads the shared instruction files in Sources unless someone turns it off. A copy keeps the switch as the suggested bot has it, so turn it on in each suggested bot made before this change; bots people already have are not changed. Creating or editing a bot in the panel never starts it (no model call): the bot's first turn is the person's first message. **Add user** lists them, all ticked; the ticked ones are copied to the new person. On a person's **Bots**, **Add from suggested bots** copies more later. Copies are independent: changing a suggested bot later does not change anyone's copy.
- **Sync status** shows, per person, which sections they override and whether the last copy failed. A person whose sign-in is off shows *Sign-in off* instead of *Syncing*: their sections catch up when sign-in is turned on. **Sync now** copies every global section again.

**First setup, in this order:** in Global settings add a model provider's API key under Models (people then need no sign-in of their own), set the other sections, create the suggested bots, then add people with the bots each should start with. People see no onboarding steps, so whatever you set is what they get.

**Give this to your agent:**

> On the Orbs team install at `https://<team host>`, I'm an admin. Open `/admin`, go to **Global settings → Settings → Tools** and set the approval timeout to `<minutes>`. Then open **Sync status** and confirm no person shows *Sync failed*; for any that does, open them, read the error and use **Try again**. Finally open user `<name>`, confirm their Tools section says Global and shows the new timeout.

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
| MCP servers for one bot | `/data/agents/<bot>/.agents/mcp.json` or `/data/agents/<bot>/.pi/mcp.json` |

Skill and instruction changes show up within about 30 seconds. Files must be owned by the container user.

**Give this to your agent:**

> On `root@<server>`, add the skill in `<local folder>` for all bots of Orbs user `<name>`: copy it to `/data/home/.agents/skills/<skill name>/` in their volume, owned by the container user. Don't restart anything. Confirm the skill appears in their bot's skill list within a minute.

### Always approved tools

When someone answers **Always approve** on a request, that bot stops asking for that tool. A bot's **Tools** tab lists those tools, in the app for the person (on the iPhone app, under **Always approved** in the bot's settings) and under **Users → person → Bots** in the panel for you. **Remove** puts one back to asking, **Remove all** (after a confirmation) all of them; the bot asks again the next time it wants to use one. A removal in the panel is a change in **Activity**, with the bot; opening the list writes nothing.

### Create a bot for someone

Each person's Orbs has a private door: its owner socket, which only the server can reach. It accepts the same settings and bot changes as the app and the conversation viewer's reads, but nothing that sends chat messages, answers approvals or pairs a device. The admin panel uses it; use the panel when you can. Without the panel, call it from inside the person's container:

```sh
docker compose exec daemon-<id> bun -e 'const r = await fetch("http://localhost/rpc/bots/create", { method: "POST", unix: "/data/data/ipc/rpc.sock", headers: { "content-type": "application/json", "x-bots-protocol": "1" }, body: JSON.stringify({ json: { name: "Helper", handle: "helper", modelProvider: "anthropic", modelId: "claude-sonnet-4-5", thinkingLevel: "low" } }) }); console.log(r.status, await r.text())'
```

`200` and the new bot mean it worked. `403` means the door does not serve that action. Some models refuse `thinkingLevel: "off"`, so always send one. The full list of what the door serves is in [`api.md`](../../.agents/references/api.md#owner-socket-private-door).

Don't pair a device of your own into someone's Orbs instead: it can read and act as that person.

**Give this to your agent:**

> On `root@<server>`, in `/opt/orbs`, create a bot named `<name>` with handle `<handle>` and model `<provider>/<model>` for Orbs user `<id>`. Use `docker compose exec daemon-<id> bun -e` with `fetch` to `http://localhost/rpc/bots/create` over the unix socket `/data/data/ipc/rpc.sock`, headers `content-type: application/json` and `x-bots-protocol: 1`, body `{"json": {...}}` with `thinkingLevel` set. Don't pair a device. Confirm the reply is 200 and the bot appears in `bots/list`.

## What a bot can reach

A bot runs its commands and web requests inside its person's Orbs. From there it reaches the public internet (model providers, web pages, MCP servers over https) and DNS, and nothing internal:

| From a person's Orbs | Reachable |
| --- | --- |
| Public internet and DNS | yes |
| The hub, on any of its networks | no: the hub opens connections to each person's Orbs, never the other way |
| The web app, the provisioner, cloudflared | no |
| Other people's Orbs and the template workspace | no |
| The server itself: SSH, Docker's gateway addresses, its public address, any other service on it | no |
| The cloud metadata service (`169.254.169.254`) | no |
| Private and internal ranges: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `100.64.0.0/10` (Tailscale), link-local, multicast | no |
| IPv6 | no: people's networks have IPv6 off, so only public IPv4 goes out |
| A destination listed in `ORBS_INTERNAL_ALLOW` | yes, that address and port only |

The `firewall` container keeps this. It adds two named rule sets for people's networks to the server's firewall, `ORBS-DAEMONS` (in Docker's `DOCKER-USER`) and `ORBS-DAEMONS-HOST` (in `INPUT`); it changes no policy and no other rule, so it cannot lock you out of SSH. Its health check runs every 2 seconds: it puts back anything missing or moved and then reports the firewall unhealthy until the next check, and also when Docker or the kernel no longer send people's traffic through the rules. A person you add gets the same protection with no extra step. The rules stay in place when the container stops or restarts; a reboot clears them until the firewall starts again.

Nobody's Orbs starts without them. `apply` (and the admin panel) start the firewall first and stop with its message if it does not become healthy; Compose starts a person's Orbs only while the firewall is healthy. After a reboot or a Docker restart, when Docker starts every container at once, each person's Orbs first waits until the firewall rejects it (its log then says `Waiting for the firewall` and `The firewall confines this container after … ms`), so no bot runs before the rules exist. If someone deletes the rules while everything runs, bots can reach internal addresses until the next check, at most about 2 seconds; if they emptied the whole firewall, Docker's rules included, that check also stops all traffic out of people's networks until Docker restarts.

Check it with:

```sh
bun deploy.ts firewall status
```

It prints the firewall's health, its last check and the last problems its checks found (missing rules it put back, for example), and exits non-zero unless the firewall is healthy. `docker compose ps firewall` shows `(healthy)` too.

To let every person's Orbs reach one internal service anyway, such as a model server on your private network, name it in `/opt/orbs/.env` as `<IPv4>:<port>` (TCP), comma-separated for more than one, and run `bun deploy.ts apply`:

```sh
ORBS_INTERNAL_ALLOW=10.0.0.5:8080
```

Only the firewall restarts. It is empty by default. Allow only what every person may use: everything allowed is open to every bot.

To check from inside a person's Orbs (it should print `public: 200`, then `blocked` for the metadata service, the server's SSH on the person's gateway address, the hub and a private address):

```sh
docker compose exec daemon-<id> bun -e 'const gw = (await Bun.file("/proc/net/route").text()).split("\n").map((l) => l.split("\t")).find((f) => f[1] === "00000000")[2].match(/../g).reverse().map((h) => parseInt(h, 16)).join("."); const tcp = (host, port) => Promise.race([Bun.connect({ hostname: host, port, socket: { data() {} } }).then((s) => (s.end(), "REACHABLE"), () => "blocked"), Bun.sleep(3000).then(() => "blocked")]); console.log("public:", (await fetch("https://example.com")).status); for (const [host, port] of [["169.254.169.254", 80], [gw, 22], ["hub", 47192], ["10.0.0.1", 80]]) console.log(`${host}:${port}`, await tcp(host, port)); process.exit(0)'
```

`bun deploy.ts firewall remove` stops the firewall and deletes both rule sets and their jumps. Use it only when tearing Orbs down (see [Tear down](#tear-down)): the next `apply` puts them back.

**Give this to your agent:**

> On `root@<server>`, in `/opt/orbs`, check what bots can reach: `bun deploy.ts firewall status` must say `healthy` (report any problem it lists); `iptables -S DOCKER-USER` and `iptables -S INPUT` must each start with a jump to `ORBS-DAEMONS` / `ORBS-DAEMONS-HOST` for `-i orbs-d+`, and the `INPUT` policy must be unchanged. From one person's container, run the check in the "What a bot can reach" section of `docs/team-workspace/admin.md`: public 200, everything else blocked. Don't change `ORBS_INTERNAL_ALLOW` unless I name an address.

## Backups

**Backups hold every secret.** Each person's backup has their encryption key (`credentials.key`), their model keys (`auth.json`), their secrets and their chats; the deployment files have `.env` with the tunnel token, the provisioner token and the shared model keys. Anyone with a backup folder can read all of it. Keep backups readable by root only, and copy them only to a place you trust as much as the server.

### Nightly backups

The server backs itself up every night with a systemd timer. Turn it on once, in `/opt/orbs`:

```sh
bun deploy.ts nightly install
```

Expected: `Wrote /etc/systemd/system/orbs-backup.service`, `Wrote /etc/systemd/system/orbs-backup.timer` and `The nightly backup runs at 03:00 server time into /opt/orbs/backups`. Set `BACKUP_TIME=02:15` in `.env` before `install` for another time. A server that was off at that time backs up once when it starts. `bun deploy.ts nightly remove` turns it off and keeps the backups.

Each run writes one folder, `backups/<time>/` (UTC, such as `2026-11-13T030000Z`), with mode 700 and every file mode 600:

| File | What it holds |
| --- | --- |
| `<id>.tar.gz` | One person's whole volume, for everyone in `users.yaml` (disabled people too) and `template.tar.gz` for the template workspace. Someone removed from `users.yaml` is no longer backed up: back them up by hand before you remove them if you may need their data. |
| `hub.tar.gz` | The hub's folder: `users.json`, `admins.json`, `pins.json`, `global.json` and the audit trail `audit.sqlite`. |
| `deployment.tar.gz` | `.env`, `users.yaml`, `users.compose.yaml`, `compose.yaml`, `daemon.yaml`, `cloudflared.compose.yaml`, `deploy.ts`, and any other file `COMPOSE_FILE` loads. |
| `manifest.json` | The image tag, each person (enabled, advanced, how long they were stopped), and each file's size and SHA-256. Written last: a folder without it is a run that did not finish. |

People are backed up one at a time. Each person's Orbs stops for their own copy and starts again, so no database is copied half-written: about 2.5 seconds each on a test server, and a browser saw 0.5 to 2 seconds without answers. Then the hub stops for about 3 seconds while its folder is copied, so nobody's open app gets an answer for 1 to 2 seconds. Open chats reconnect on their own. A run waits up to five minutes for an `apply` or an admin panel change that is in progress, and admin panel changes made while it runs ask to try again in a minute.

**Retention.** After a good run, the server keeps every run of the last 7 days that have one, and the newest run of each of the last 4 weeks (weeks start on Monday, UTC), and deletes every other run folder, including unfinished ones. Change the numbers with `BACKUP_KEEP_DAILY` and `BACKUP_KEEP_WEEKLY` in `.env`. A run that fails deletes only its own unfinished folder, never an older run. Backups you made by hand (`backups/<id>-<time>.tar.gz`) are never deleted, nor is anything whose name is not a run's time. A run you start by hand, such as the one before an upgrade, stays like the nightly ones: a later run on the same day does not replace it.

**Check it:**

```sh
bun deploy.ts nightly status
```

```text
Last run: backups/2026-11-13T030000Z, started 5.2 h ago: ok
Tag 3335196, 4 workspaces, 0.1 MiB, took 14 s; longest stop template 2.7 s, hub 2.8 s
Finished backups on this server: 9 (2026-10-25T030000Z to 2026-11-13T030000Z)
Off-site copy to acme-orbs-backups/orbs/: last upload 2026-11-13T030000Z, 5.2 h ago
```

followed by the timer's next run. It exits with an error when the last run failed, when it still says `running` after two hours (the run was killed, for example by a power loss), when the last good run is more than 36 hours old, or when the [off-site copy](#off-site-copy) is on and its last upload failed, so a monitoring check can run it. A failed run also ends the systemd job with an error and writes one line to the journal, `Nightly backup failed: <reason>`: see `journalctl -u orbs-backup.service`. A run stopped by systemd (after two hours, or by a shutdown) or by Ctrl-C starts whoever it had stopped again and counts as failed. Only a hard kill or a power loss in the few seconds someone is stopped can leave their Orbs or the hub stopped: `bun deploy.ts apply` starts it again. To back up right now, run `bun deploy.ts nightly`; it is the same command the timer runs.

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
3. Add these to `/opt/orbs/.env`, as in one of the examples below:

   | Setting | What it is |
   | --- | --- |
   | `BACKUP_S3_BUCKET` | The bucket. Setting it turns the off-site copy on. |
   | `BACKUP_S3_ENDPOINT` | The provider's S3 address. Leave empty for Amazon S3. |
   | `BACKUP_S3_REGION` | The bucket's region (`auto` for R2). |
   | `BACKUP_S3_PREFIX` | Optional folder in the bucket, such as `orbs/`. |
   | `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY` | The access key. |
   | `BACKUP_PASSPHRASE` | The passphrase from step 2, at least 20 characters. |

   Amazon S3:

   ```sh
   BACKUP_S3_BUCKET=acme-orbs-backups
   BACKUP_S3_REGION=eu-central-1
   BACKUP_S3_PREFIX=orbs/
   BACKUP_S3_ACCESS_KEY_ID=AKIA...
   BACKUP_S3_SECRET_ACCESS_KEY=...
   BACKUP_PASSPHRASE=<64 hex characters>
   ```

   Cloudflare R2 (an R2 API token with *Object Read & Write* on the bucket gives the key pair; a bucket with an EU jurisdiction uses `https://<account id>.eu.r2.cloudflarestorage.com`):

   ```sh
   BACKUP_S3_ENDPOINT=https://<account id>.r2.cloudflarestorage.com
   BACKUP_S3_REGION=auto
   BACKUP_S3_BUCKET=acme-orbs-backups
   BACKUP_S3_ACCESS_KEY_ID=...
   BACKUP_S3_SECRET_ACCESS_KEY=...
   BACKUP_PASSPHRASE=<64 hex characters>
   ```

   Backblaze B2 (an application key for the bucket: its *keyID* and *applicationKey*; the endpoint is on the bucket's page):

   ```sh
   BACKUP_S3_ENDPOINT=https://s3.us-west-004.backblazeb2.com
   BACKUP_S3_REGION=us-west-004
   BACKUP_S3_BUCKET=acme-orbs-backups
   BACKUP_S3_ACCESS_KEY_ID=...
   BACKUP_S3_SECRET_ACCESS_KEY=...
   BACKUP_PASSPHRASE=<64 hex characters>
   ```

4. Run one backup and check it: `bun deploy.ts nightly`, then `bun deploy.ts nightly status`. Expected: `Uploaded <time> to <bucket>/<prefix>, encrypted (… MiB).` and `Off-site copy to <bucket>/<prefix>: last upload <time>, 0 min ago`.

After each good run on the server, the run checks the backup against its `manifest.json`, encrypts it to one file and uploads `<prefix><time>.tar.gpg`, then `<prefix><time>.sha256` with that file's checksum. It uploads every backup kept on the server that the bucket does not have yet, so the first run uploads all of them, and a backup whose upload failed goes up with the next run. Then the bucket keeps what the server keeps (see Retention above, with the same `BACKUP_KEEP_DAILY` and `BACKUP_KEEP_WEEKLY`): it deletes only objects under the prefix named like a backup (`<time>.tar.gpg`, `<time>.sha256`), so other files in the bucket are never touched, and it deletes nothing when an upload failed. Give each install its own prefix: two installs with the same bucket and prefix delete each other's backups. An upload cut off midway (power loss, a stopped run) can leave hidden parts of a multipart upload that the provider bills but never lists: where your provider allows it, add a lifecycle rule to the bucket that aborts incomplete multipart uploads after a few days (R2 does this after 7 days by itself).

**When the upload fails** (wrong key, the provider unreachable, no passphrase), the backup on the server is kept and counts as good. The run ends with an error and the journal line `Off-site upload failed: <reason>`, and `nightly status` shows the reason and exits with an error until an upload works again:

```text
Off-site copy to acme-orbs-backups/orbs/: last upload 2026-11-12T030000Z, 26.5 h ago
Last off-site failure 2.4 h ago: an unexpected error has occurred (DNSResolveFailed)
The off-site copy is not up to date: the last upload failed or none was made yet.
```

The reason in brackets says what went wrong: `DNSResolveFailed` or `ConnectionRefused` (check `BACKUP_S3_ENDPOINT` and the server's internet access), `SignatureDoesNotMatch` or `InvalidAccessKeyId` (check the key pair), `NoSuchBucket` (check `BACKUP_S3_BUCKET` and the region). Fix `.env` and run `bun deploy.ts nightly` to try again at once.

The upload holds the same lock as the backup, so admin panel changes made during it ask to try again in a minute. How long it takes depends on the size of the backups and the server's upload speed; the first run uploads every backup the server keeps.

The bucket's own encryption at rest, if your provider offers it, is an extra layer; it does not replace the passphrase, because the provider holds those keys.

To restore from the bucket, see [Restore from the off-site copy](#restore-from-the-off-site-copy). To decrypt one by hand on any computer with GnuPG: `gpg --decrypt <time>.tar.gpg | tar -x` asks for the passphrase and gives the run's folder.

### Back up one person by hand

```sh
bun deploy.ts backup <id>
```

It takes a few seconds and writes `backups/<id>-<time>.tar.gz`, readable only by root. Copy it off the server, keeping it private:

```sh
scp -p root@<server>:/opt/orbs/backups/<id>-<time>.tar.gz <safe folder>/
```

These stay on the server until you delete them by name (`rm /opt/orbs/backups/<file>`).

### Restore one person

From last night's run (the folder) or a backup made by hand (the file):

```sh
bun deploy.ts restore <id> backups/<time>
bun deploy.ts restore <id> backups/<id>-<time>.tar.gz
```

It checks the file against the run's `manifest.json` first and refuses a damaged one, a file that does not unpack, and a file not named for that person (`<id>.tar.gz` or `<id>-<time>.tar.gz`), so a mistyped id cannot put someone else's data in their place. Then it stops that person's Orbs, saves what is there now to `backups/<id>-<time>.tar.gz`, replaces their whole volume and starts it again. Expected: `Saved the current data of <id> to backups/…` and `Restored <id> from …`. Other people are not affected.

What the person gets back is exactly what they had at backup time: bots, chats, secrets, keys, settings and devices. Their browsers paired before the backup keep working. A browser or phone they paired after it is refused once and pairs again by itself the next time they open Orbs (no PIN). The hub is not touched:

- **The audit trail keeps everything**, including rows about changes the restore has just undone. The restore itself writes no row; it shows in the shell where you ran it.
- **Section modes stay as they are now.** A section that follows global holds the global values from backup time until the next global change. In the panel, open **Global settings** and press **Sync now** so it gets today's values (`sync status` still says *in sync* until then). A section switched to global after the backup keeps the person's old values until that sync.

### Restore a whole install on a new server

From one run folder alone, for example when the server is lost. Images are not in the backup: you need the same tag as `"tag"` in its `manifest.json`.

1. Prepare the new server with [install](install.md) steps 1 and 2, and load the images of that tag as in step 3 (build them from that commit of the repository). Install Bun as in step 3.
2. Copy the run folder to the new server and unpack the deployment files from it:

   ```sh
   ssh root@<new server> 'mkdir -p -m 700 /opt/orbs/backups'
   scp -rp <run folder> root@<new server>:/opt/orbs/backups/
   ssh root@<new server> 'cd /opt/orbs && chmod 700 . && tar -xzpf backups/<time>/deployment.tar.gz'
   ```

3. Stop the old server's Orbs if it still runs (`docker compose down` there): it has the same tunnel token, and Cloudflare would share people between both servers.
4. Restore:

   ```sh
   ssh root@<new server> 'cd /opt/orbs && bun deploy.ts restore backups/<time>'
   ```

   It refuses a server whose `hub` folder is not empty, and checks every file against `manifest.json`. It puts back the hub folder (admin list, pins, section modes, audit trail), creates and fills every person's and the template's volume, and only then starts everything with `apply`. Expected, after about 20 seconds: `Restored the whole install from backups/<time> (tag <tag>)`.
5. Turn the nightly backup on again: `bun deploy.ts nightly install`. Note that the next run's retention deletes the folder you restored from once it is older than the 7 newest days with a run; copy it under a name that is not a run's time first if you want to keep it.

Nothing changes in Cloudflare: the tunnel token in `.env` connects the new server to the same tunnel, and the hostname, Access and DNS stay. For people, the install is as it was at backup time: browsers paired before the backup open Orbs as usual and chats continue; a browser paired after the backup pairs again by itself; anything done after the backup (chats, settings, panel changes, people added) is gone and needs doing again. Admins, pins and section modes are the backup's, and the audit trail ends at the backup.

### Restore from the off-site copy

When the server is lost, or its disk no longer has the backup you want. You need the bucket settings and the passphrase from your password manager, and the images of the tag the backup was made with.

1. Prepare the new server with [install](install.md) steps 1 and 2, load the images as in step 3 (build them from the tag you last upgraded to; step 4 tells you the backup's own tag) and install Bun as in step 3.
2. Copy `deploy.ts` from that checkout and write a `.env` that holds only the image tag and the off-site settings:

   ```sh
   ssh root@<new server> 'mkdir -p -m 700 /opt/orbs'
   scp scripts/deploy.ts root@<new server>:/opt/orbs/deploy.ts
   ssh root@<new server> 'cd /opt/orbs && umask 077 && cat > .env'
   ```

   Type or paste `ORBS_TAG=<tag>`, every `BACKUP_S3_` line and `BACKUP_PASSPHRASE=<passphrase>`, each on its own line, then press Ctrl-D.
3. List the backups in the bucket and pick one (UTC times, oldest first):

   ```sh
   ssh root@<new server> 'cd /opt/orbs && bun deploy.ts nightly fetch'
   ```

4. Fetch it:

   ```sh
   ssh root@<new server> 'cd /opt/orbs && bun deploy.ts nightly fetch <time>'
   ```

   It downloads `<time>.tar.gpg`, refuses it unless it matches `<time>.sha256`, decrypts it into `backups/<time>/` (refusing a wrong passphrase) and checks every file against the run's `manifest.json`. Expected: `Fetched <time> into backups/<time>; every file matches its manifest (tag <tag>).` If that tag is not the one you loaded, load its images now and set `ORBS_TAG` to it in `.env`.
5. Unpack the deployment files from it. This replaces the short `.env` with the one from the backup, which has the same off-site settings:

   ```sh
   ssh root@<new server> 'cd /opt/orbs && tar -xzpf backups/<time>/deployment.tar.gz'
   ```

6. Go on with [Restore a whole install on a new server](#restore-a-whole-install-on-a-new-server) from step 3: stop the old server's Orbs if it still runs, `bun deploy.ts restore backups/<time>`, then `bun deploy.ts nightly install`.

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

> On `root@<server>`, in `/opt/orbs`, run `bun deploy.ts nightly status` and report the last run, its age, its result and the off-site copy. If it failed or is older than a day, show `journalctl -u orbs-backup.service --since -2d | grep -E "failed|Nightly"` and run `bun deploy.ts nightly` once. Never print `.env` or the content of a backup.

## Upgrades

New images arrive with a new tag. Build and load all five (`orbs-daemon`, `orbs-web`, `orbs-hub`, `orbs-provisioner`, `orbs-firewall`) as in [install, step 3](install.md#3-get-orbs-onto-the-server), and copy the deployment files again (`compose.yaml`, `daemon.yaml`, `cloudflared.compose.yaml`, `deploy.ts`; never `.env`). If `docker run --rm --entrypoint /usr/local/bin/bun orbs-daemon:<tag> --version` prints a different version than `bun --version` on the server, install Bun from the new image as in step 3; otherwise leave it. Load images before changing the tag: Docker Compose otherwise tries to download them and fails with `pull access denied`. To switch:

1. Back up everyone, the template workspace and the hub's folder with `bun deploy.ts nightly` ([above](#nightly-backups)), and confirm `bun deploy.ts nightly status` says `ok`. A new version can change the database; the old version may not read it again. The [audit trail](#activity) is a file in the hub's folder, so the upgrade keeps it. A backup restarts each person's Orbs as it was, on the old version, although the new deployment files are already in place; step 2 moves everyone to the new version. On the first upgrade to the version with nightly backups, the hub stops for about 7 seconds instead of 3: the running hub still has the old health check. Note the run's time (`Last run: backups/<time>`): it stays for 7 days like the nightly runs, a later run on the same day included, and is the one to restore if the new version goes wrong.

2. Set the new tag in `/opt/orbs/.env`, for example `ORBS_TAG=v0.2.0`, and run:

   ```sh
   docker compose up -d --wait
   ```

   Every Orbs container restarts, which takes about 10 seconds; cloudflared stays up. Open chats reconnect on their own. Routines that were due during the restart run once when Orbs is back.
3. Then run:

   ```sh
   bun deploy.ts apply
   ```

   It writes the per-person files again from `users.yaml` with the new `deploy.ts`, starts anything the new version adds, and restarts nobody (about 4 seconds). Skipping it can leave a new version half installed: an upgrade to the version with global settings otherwise runs no template workspace, the hub logs `template: false`, and **Global settings** in the panel cannot work.
4. Check: `docker compose ps` shows the new tag on the hub, the provisioner, web, `orbs-daemon-template-1` and every person's daemon, all healthy. From the version with the firewall on, `orbs-firewall-1` shows `Up` on the new tag and `bun deploy.ts firewall status` says `healthy` (before the version with its health check it showed no health status). From the version with the [audit trail](#activity) on, `ls -ln hub/audit.sqlite` shows the file owned by `1000 1000` with mode `-rw-------`: the hub creates it on its first start. The hub log may show `The provisioner did not take the admin list yet; trying again` once, because the provisioner restarts at the same moment; it is harmless when no error line follows. If someone has Orbs open during the restart, the hub may also log one or two `ERROR … 502` `Request refused` for `/health` with `The daemon of <id> did not answer /health`: their app asked while their Orbs was restarting, and it reconnects on its own. Only the same line again after the containers are healthy means a problem. From the version with the **Advanced user** switch on, every Orbs is marked as part of a team: `for c in $(docker compose ps --format '{{.Name}}' | grep daemon-); do echo "$c $(docker inspect $c -f '{{range .Config.Env}}{{println .}}{{end}}' | grep DAEMON_TEAM)"; done` prints `DAEMON_TEAM=true` for every person and the template, and after the first upgrade to it nobody is advanced until you switch them on (`grep -c advanced users.yaml` prints `0`).
5. Nothing to press afterwards: the new hub copies every global section again as it starts, as **Sync now** would. Check, a minute after step 2: **Activity** has a `global/sync` row by `hub start` (or `docker compose logs hub` has `Admin made a change` with `by: hub start`), the sync status shows no *failed* section, and a person who follows global for Secrets sees the template's secrets marked *From your admin*.

The first upgrade to a version with the [firewall](#what-a-bot-can-reach) needs a check before step 2. The firewall service starts in step 2 (`up -d --wait`), not in step 3.

- Before step 2: `iptables --version` must end with `(nf_tables)`. If it says `(legacy)`, stop: the firewall refuses such a host, step 2 reports it unhealthy and step 3's `apply` stops with `This server's Docker uses iptables-legacy`. Don't run `iptables-legacy` commands to look: on an nf_tables host they create empty legacy tables and every later `iptables` command warns about them.
- Before step 2, if you upgrade over SSH and want a safety net: `systemd-run --on-active=10m --unit=orbs-fw-undo --working-directory=/opt/orbs /usr/local/bin/bun deploy.ts firewall remove` removes the firewall's rules in 10 minutes unless you cancel it with `systemctl stop orbs-fw-undo.timer` once a new SSH login works, `iptables -S INPUT` shows the policy and rules it had before plus only the jump to `ORBS-DAEMONS-HOST`, step 4's checks pass and a bot answers. The rules only match people's networks (`-i orbs-d+`), so SSH is not at risk; if the undo does run after step 3, the hub reaches nobody until you roll back as below.

Step 3's `apply` moves every person's network to the firewall's settings, once. Docker can only do that by recreating the network, so `apply` first removes the hub's and those people's containers (`Moving daemon-… to the firewall's networks` in its output) and then creates them again on the new networks. Nobody's data is at risk: it removes containers, never volumes, and `hub/` stays on disk. The hub and everyone's Orbs are down for about 7 seconds until `apply` ends; cloudflared may log `ERR … lookup hub` for an open tab meanwhile, which is harmless. Only a by-hand `apply` does this: until it has run, the admin panel's add, change and remove refuse with `orbs_user-<id> … predate the firewall: run bun deploy.ts apply on the server once` and change nothing. Before this version the step was a manual `docker compose rm -sf …` between step 2 and step 3; it is no longer needed. `iptables -S DOCKER-USER` must then show the jump to `ORBS-DAEMONS`, and `ip -br link` a bridge `orbs-d<9 hex>` per person and the template. If bots use a service on the server or your private network (such as a test model on `172.17.0.1:48290`), set `ORBS_INTERNAL_ALLOW` in `.env` before step 2 ([what a bot can reach](#what-a-bot-can-reach)), or their turns fail after the upgrade.

The first upgrade to a version with the admin panel needs three more things, once, before step 2: add `admins:` with your email to `users.yaml`, and `HUB_ADMIN_EMAILS` and `PROVISIONER_TOKEN` to `.env` (the two commands in [install, step 7](install.md#7-start-orbs)). The `apply` in step 3 then lets the provisioner write the hub's user list (the `hub` folder becomes group root, mode 770); without it every change in the admin panel fails.

**The first upgrade to a version with global settings changes nobody's settings.** People who were there before start with every section *overridden*: they keep their own keys, secrets, chat and tool settings and `~/.agents` files, and get nothing from Global settings. Before you switch a section of theirs to *global*, set that section in Global settings, and know that the switch replaces their values with the global ones: for Secrets only a secret with a global secret's name, for Sources it replaces their `~/.agents` folder, for Models it signs out API keys the template doesn't have. The panel lists what each switch removes before you confirm. Back them up first. People you add in the panel after the upgrade follow every section.

**After the upgrade to the version where people keep their own secrets**, the secrets an older hub copied get their *global* mark from the copy the new hub makes as it starts (step 5), also after a rollback and a new upgrade. An upgrade straight to the version where people keep their own secrets but before the hub copies at start (`52140c6` to `f145f7e`) still needs **Sync now** once. Nobody loses a secret. A rollback to an older version keeps every secret, but its next sync removes the own secrets of everyone whose Secrets follow global, as before; override their Secrets first if they must keep them.

To roll back, copy the old version's deployment files into `/opt/orbs` again (from a checkout of that version), set the old tag, and run `docker compose up -d --wait` and then `bun deploy.ts apply`, as for an upgrade. Both steps matter: an older hub may refuse the newer `hub/users.json` and let nobody in (a rollback from global settings to the first admin panel version logged `unrecognized_keys` and *Users file … invalid: every request is refused*), and only the old `deploy.ts apply` writes the file it expects. Rolling back past global settings removes the template container and keeps its volume, so a later upgrade finds the global settings and suggested bots again. Rolling back past the **Advanced user** switch works the same way: until the old `apply` runs, the old hub refuses a `hub/users.json` that has `"advanced": true` for anyone (`unrecognized_keys`, *every request is refused*), and the old `apply` writes it without that key. A version from before the switch also drops `advanced` from `users.yaml`: its hub sends the admin list to its provisioner as it starts, and that provisioner rewrites `users.yaml` without the key. So before rolling back past the switch, copy the list: `cp users.yaml users.yaml.before-rollback`. After upgrading again, add `advanced: true` back under each person who has it in that copy and run `bun deploy.ts apply` (or turn their switch on in the panel). A rollback to a version with the switch keeps it, and so does upgrading again from there. Rolling back past the firewall: first, with the new files still in place, run `bun deploy.ts firewall remove`; after copying the old files, run `docker compose rm -sf $(docker compose ps --services | grep -e '^hub$' -e '^daemon-')` before the old `apply`, which puts people's networks back without the firewall's settings (the old `apply` does not do it itself). A rollback to a version with the firewall but before its health check needs none of this. If the new version changed someone's data, restore their backup from before the upgrade.

**Give this to your agent:**

> On `root@<server>`, upgrade Orbs in `/opt/orbs` to image tag `<tag>`: confirm `docker images` lists `orbs-daemon`, `orbs-web`, `orbs-hub`, `orbs-provisioner` and (from the version with the firewall) `orbs-firewall` with that tag, and that `/opt/orbs` has the deployment files from the same checkout. Back up everyone with `bun deploy.ts nightly`, confirm `bun deploy.ts nightly status` says `ok` and note that run's time: it is the backup to restore if the upgrade goes wrong. On the first upgrade to the version with the firewall, first check that `iptables --version` says `(nf_tables)` (stop if not) and arm the 10-minute `orbs-fw-undo` timer from the Upgrades section. Set `ORBS_TAG=<tag>` in `.env`, run `docker compose up -d --wait`, then `bun deploy.ts apply` (on the first upgrade to the version with the firewall it recreates the hub and everyone's Orbs on new networks itself). Confirm every container is healthy on the new tag, `orbs-daemon-template-1` and the firewall included, `bun deploy.ts firewall status` says `healthy`, and the hub log shows no error; with the undo timer armed, cancel it only after a new SSH login works and `iptables -S INPUT` shows only our jump added. Don't switch anyone's settings sections to global. The hub copies the global settings again as it starts; confirm the `global/sync` by `hub start` line in its log a minute after the restart. If anything fails, roll back as the Upgrades section says: the previous version's deployment files, the previous tag, `docker compose up -d --wait`, then `bun deploy.ts apply`.

## Status and logs

```sh
docker compose ps                        # every container and its health
docker stats --no-stream                 # memory and CPU per container
docker compose logs hub --since 1h       # the hub: logins refused, users loaded, pairing
docker compose logs hub | grep -B1 -A9 'hub-audit'   # admin reads and changes since the hub container started; the full trail is in Activity
docker compose logs daemon-<id> -f       # one person's Orbs, live
```

**Give this to your agent:**

> On `root@<server>`, in `/opt/orbs`, report `docker compose ps`, `docker stats --no-stream` and any error in `docker compose logs --since 1h`. Change nothing.

## Tear down

Removes the team's Orbs from the server and Cloudflare. Back up everyone first if anything may be needed later. Do the steps in this order: the connector must stop before Cloudflare deletes the tunnel.

1. On the server, stop and remove the containers and networks, then remove the firewall's rules. Volumes stay:

   ```sh
   cd /opt/orbs && docker compose down && bun deploy.ts firewall remove
   ```

   Expected: `Removed ORBS-DAEMONS and its jump from DOCKER-USER` and the same for `ORBS-DAEMONS-HOST` and `INPUT`.

2. On your computer, in the Orbs repository, list what the Cloudflare script would delete. Use the same `--zone`, `--hostname`, `--name` and, if you set up SSH, `--ssh-hostname` as at install:

   ```sh
   CLOUDFLARE_API_TOKEN="$(op read '<token reference>')" bun scripts/deploy.ts cloudflare destroy --zone <domain> --hostname <team>.<domain> --name orbs-<team> [--ssh-hostname <team>-ssh.<domain>]
   ```

   Check that every line names `orbs-<team>` or `<team>.<domain>`. Then run the same command with `--yes` to delete exactly those. Expected: one `Deleted …` line per object.

3. Only when nobody's data is needed any more, delete it on the server, by name:

   ```sh
   docker volume rm orbs_ipc $(docker volume ls -q --filter name=^orbs_data-)
   docker rmi orbs-daemon:<tag> orbs-web:<tag> orbs-hub:<tag> orbs-provisioner:<tag> orbs-firewall:<tag>
   rm -rf /opt/orbs
   ```

   This deletes every person's bots, chats, files and keys, and the backups in `/opt/orbs/backups`. Never use `docker system prune` or `docker volume prune` instead: they act on everything on the server.

**Give this to your agent:**

> Tear down the Orbs team install on `root@<server>`: run `docker compose down`, then `bun deploy.ts firewall remove`, in `/opt/orbs`. Then in my Orbs checkout, with `CLOUDFLARE_API_TOKEN` read from `<where you keep it>` inside the command, run `bun scripts/deploy.ts cloudflare destroy --zone <domain> --hostname <team>.<domain> --name orbs-<team>` (add `--ssh-hostname <team>-ssh.<domain>` if SSH was set up), show me the list, and check that every object carries `orbs-<team>` or `<team>.<domain>`. Run it again with `--yes` only after I confirm. Keep the volumes and `/opt/orbs` unless I say to delete the data.
