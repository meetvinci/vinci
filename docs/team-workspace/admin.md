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

- The user id is short: lowercase letters, digits and dashes. It names the person's container and volume, so never reuse an id for someone else. `template` is taken: it is the template workspace (see [Global settings and suggested bots](#global-settings-and-suggested-bots)), and `apply` refuses a person with that id.
- Each email appears once under `users:`. It must match the email the person logs in with at Cloudflare.
- `name` is what the admin panel shows; it defaults to the id. `enabled` defaults to `true`. A disabled person cannot log in and has no container; their volume stays.
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

A person can also add their own key in Orbs, **Settings → Providers**. Theirs wins over the shared one.

Do not use a Claude or ChatGPT subscription login for the team. The providers' terms do not allow one subscription to serve several people.

**Give this to your agent:**

> On `root@<server>`, set the `<provider>` API key for Orbs: read it from `<where you keep it>`, write it as `<VARIABLE>` in `/opt/orbs/.env` without printing it, then run `docker compose up -d --wait` in `/opt/orbs` and confirm every `orbs-daemon-*` container is healthy.

## The admin panel

Open `https://<your team host>/admin` and log in at Cloudflare as usual. Only emails on the admin list see it; an admin does not need to be a user and has no workspace of their own.

- **Users** lists everyone with their workspace state. Add a user with a name and email; open one to manage them.
- For one user, **Bots** and **Settings** show the same forms the user sees in their own app, saved straight to that user's workspace. **Devices** lists the browsers and phones they signed in with; revoking one signs it out.
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
- The app has no form to add a secret (a bot asks for one in chat), so neither does the panel. Secrets the user added show in **Settings → Secrets**.

A user whose workspace is stopped or starting shows *Can't reach this user's workspace*; use **Try again** once it runs.

### Reading a person's conversations

An admin can read every conversation a person has with their bots, read only, in the person's **Conversations** tab. It goes through the same private door as the forms; the admin never pairs a device or uses the person's own address.

**What you can read**

- One chat per bot. Hidden and muted chats are listed too.
- The messages, photos (click to enlarge) and files (click to download), tool calls with the approval asked and its answer, answers to the bot's questions, and silent turns, as they happened. Scroll up for older messages.
- A subagent run: click its card to read what it did. A private conversation between two of the person's bots: click the bot's name in *Messaged …* to read it.
- Search: type and press Enter. It searches every chat of that person; a hit opens the chat at that message. Like the app's search, it looks at recent messages first, so an old match may need a more recent word.

**What leaves no trace**

Reading changes nothing the person sees: nothing is marked read, unread counts, order, pins, hidden and muted flags stay as they were, and no bot runs or notifies anyone. The panel reads when you open a chat, scroll up or press **Refresh**, never in the background.

**The audit trail**

Every read is recorded with your email, the person, the bot and the conversation, never the content: one row when you open a chat, press **Refresh** or load older messages, one per chat searched, one per file opened, and one when the person's Bots tab reads their routines or todos. See them under [Activity](#activity). If the hub cannot record a read, it refuses the read: the panel shows the chat or file as failed, and nothing is shown unrecorded.

**What the panel does not show (known gaps)**

- An artifact shows only its title: running its page in the panel would run the person's code with your access.
- An approval or question still waiting shows as an unfinished tool step, without its card. You can never answer it.
- A reply still being written appears after **Refresh**.
- Links show without a preview.
- **Cleared history is gone.** When the person clears a chat, its messages, files, subagent runs and private conversations are replaced by an empty chat; only the routines, todos and the latest version of each artifact carry over. You then see the same as the person.
- The template workspace has no conversations with anyone.
- There is no export.

**Give this to your agent:**

> On the Orbs team install at `https://<team host>`, I'm an admin. Open `/admin`, add user `<name>` with email `<email>`, then on their page create a bot called `<bot>` with model `<model>` and these instructions: `<text>`. If the panel says they can't sign in yet, run the `cloudflare emails` step from the "Add a person" section of `docs/team-workspace/admin.md` in my checkout. Confirm the bot appears in their Bots tab.

## Global settings and suggested bots

Besides one Orbs per person, the server runs one more: the **template workspace** (`daemon-template`, volume `orbs_data-template`). Nobody logs into it and it is never in Cloudflare Access. `apply` always keeps it running; you never add it by hand. It holds two things:

- **Global settings.** Its settings are the team's defaults, edited in the admin panel with the same forms as a person's. There are five sections: Models (provider API keys), Chat (busy mode, hide tool calls, GIFs), Tools (approval rules and timeout, the Jev key), Secrets and Sources (shared skill, instruction, plugin and MCP folders, and the files in its `~/.agents`).
- **Suggested bots.** Its bots are offered when you add a person.

For each person, each section either **follows global** or is **overridden**:

- A new person follows every section, and gets the template's values before *Add user* finishes.
- Saving a section on the template copies it to everyone who follows that section, within seconds.
- While a person follows a section, the panel cannot change that section for them (the hub answers `409 SECTION_FOLLOWS_GLOBAL`). Switch the section to *overridden* to edit it for that person; their current values stay.
- Switching a section back to *global* copies the template's values in again, replacing theirs: for Secrets that removes their own secrets, for Sources it replaces their `~/.agents` folder, for Models it signs out API keys the template doesn't have. The panel lists exactly this before you confirm. Two things are not listed because global never carries them: account sign-ins (OAuth), which stay unless the template has a key for the same provider, and `models.json`; and inside `~/.agents`, `node_modules`, `.git` folders and symlinks are removed by the replace without being listed.
- Overriding a section while a copy to that person is running keeps the override: the copy skips sections that are no longer global.
- A person who is turned off catches up when you turn them on again.
- If a copy fails (for example, the person's Orbs was restarting), the section shows *failed* with the reason. *Sync now* (`POST /admin/api/global/sync`) tries again.
- People added before global settings existed, or added by hand in `users.yaml`, start with every section *overridden*: nothing of theirs is replaced until you switch a section to *global*.

Suggested bots: tick them in *Add user*, or copy one later from the person's page. A copy is a new bot of that person, with the same name, avatar, instructions, model, fallback, approval mode and the bot's own skill, instruction and MCP files. Conversations, routines and todos are never copied. The copy is independent: changing the template bot later does not change it. A copy fails if the person already has a bot with that handle, or if the bot's own files are over 2000 files or 6 MiB; the panel names each bot it couldn't copy, and a failed copy leaves nothing behind, so you can fix it and copy again.

What global settings cannot carry:

- Sign-ins with a Claude or ChatGPT account (OAuth). They are bound to one Orbs and stay where they are; only API keys are copied. A person who follows Models keeps their own sign-ins.
- `models.json` (a provider's address or custom models). A person added in the panel gets none. If your provider needs one (a gateway, a proxy, a local model), write it into each new person's `/data/pi/models.json` as uid 1000 and restart their container, as before. A key stored in Global settings → Models wins over the `apiKey` in a person's `models.json` for the same provider (the file itself is kept), and the *Back to global* list shows that provider as added, not replaced: if each person has their own key in `models.json`, leave that provider out of Global settings or keep their Models overridden.
- Files outside `~/.agents` in the template, and `node_modules` or `.git` folders inside it: a plugin that needs its dependencies must have them installed for each person. A shared folder path pointing elsewhere is copied as a path; the files there are not. After you change template files by hand, run *Sync now* for Sources: editing files does not trigger a copy.
- Anything of a person's own bots. A global save never changes a bot's settings, skills or files.
- Notification and device settings, the theme and the Enter key: they belong to one person or one browser.
- Sign-ins to MCP servers that use OAuth: like provider sign-ins, each person signs in for themselves.
- Links inside `~/.agents`: a symlinked file or folder is skipped, never followed.

The template workspace is a full Orbs: 90-130 MiB of memory idle, like a person's; plan it as one more person. Back it up like a person: `bun deploy.ts backup template`. It can't be purged.

### In the panel

**Global settings** in the panel's top bar opens the template workspace with the same forms as a person's settings.

- **Settings** has the sections that can be shared: Models, Chat, Tools, Secrets and Sources. Saving one copies it to every person who has not overridden that section. The copy runs in the background.
- On a person's **Settings**, each of those sections says **Global** or **Overridden**. A global section is read-only there. **Override for this person** makes it editable with the person's own values. **Back to global** first shows what that person would lose: what will be removed, what will be replaced with the global value and what will be added, by name only (never a secret or key value), or says that nothing will be lost. Confirm replaces the person's values for that section with the global ones. If the person's workspace or the global settings don't answer, the list can't be shown and there is nothing to confirm. If anything changed after the list was shown, the switch is refused and the list reloads. A turned-off person's Orbs is stopped, so their sections can't be switched back to global from the panel until you turn them on again.
- *Copying the global values…* means a copy is running. *Couldn't copy the global values* shows the reason and a **Try again** button.
- **Suggested bots** are bots you create in Global settings with the usual bot form. **Add user** lists them, all ticked; the ticked ones are copied to the new person. On a person's **Bots**, **Add from suggested bots** copies more later. Copies are independent: changing a suggested bot later does not change anyone's copy.
- **Sync status** shows, per person, which sections they override and whether the last copy failed. **Sync now** copies every global section again.

**First setup, in this order:** in Global settings add a model provider's API key under Models (people then need no sign-in of their own), set the other sections, create the suggested bots, then add people with the bots each should start with. People see no onboarding steps, so whatever you set is what they get.

**Give this to your agent:**

> On the Orbs team install at `https://<team host>`, I'm an admin. Open `/admin`, go to **Global settings → Settings → Tools** and set the approval timeout to `<minutes>`. Then open **Sync status** and confirm no person shows *Sync failed*; for any that does, open them, read the error and use **Try again**. Finally open user `<name>`, confirm their Tools section says Global and shows the new timeout.

## Activity

**Activity** in the admin panel lists what admins read and changed, newest first: when, which admin, what happened, whose workspace (or *Global settings*), and the bot and conversation when there is one. Filter by admin, person and kind (reads or changes); click an admin or a person in a row to filter by them; **Load more** shows older rows. A person's page has an **Activity** button that opens the list for that person. Nobody can edit or delete a row in the panel, and reading the list is not itself recorded.

What is recorded, one row each, never content or values:

- Reads: a conversation list, history or search, a person's routines or todos, a file opened.
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

### Create a bot for someone

Each person's Orbs has a private door: its owner socket, which only the server can reach. It accepts the same settings and bot changes as the app and the conversation viewer's reads, but nothing that sends chat messages, answers approvals or pairs a device. The admin panel uses it; use the panel when you can. Without the panel, call it from inside the person's container:

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

The hub's own folder holds the admin list, the pins, the global settings modes and the [audit trail](#activity). Back it up as well, ideally while nobody is using the admin panel:

```sh
tar -czf backups/hub-$(date -u +%Y%m%dT%H%M%SZ).tar.gz hub && chmod 600 backups/hub-*.tar.gz
```

To put a backup back:

```sh
bun deploy.ts restore <id> backups/<id>-<time>.tar.gz
```

This replaces everything in that person's volume. It first takes a fresh backup of what is there, and prints its name. Expected: `Saved the current data of <id> to backups/…` and `Restored <id> from …`, and their container healthy again.

To put the hub's folder back, stop the hub, unpack the backup over `hub` as root (it keeps the owners and modes the hub needs), start the hub, and run `apply` so `hub/users.json` matches `users.yaml` again. The admin list and the section modes go back to the backup's, and rows added to the audit trail since that backup are lost, so first copy the current `hub/audit.sqlite` to `backups/` if you want to keep them:

```sh
docker compose stop hub
tar -xzf backups/hub-<time>.tar.gz
docker compose start hub
bun deploy.ts apply
```

**Give this to your agent:**

> On `root@<server>`, in `/opt/orbs`, run `bun deploy.ts backup <id>` for every user id in `users.yaml` and for `template`, one after the other, and back up the hub's folder with the `tar` command in the Backups section of `docs/team-workspace/admin.md`, then copy the new files in `/opt/orbs/backups/` to `<backup location>` without changing their permissions. Report the file names and sizes.

## Upgrades

New images arrive with a new tag. Build and load all four (`orbs-daemon`, `orbs-web`, `orbs-hub`, `orbs-provisioner`) as in [install, step 3](install.md#3-get-orbs-onto-the-server), and copy the deployment files again (`compose.yaml`, `daemon.yaml`, `cloudflared.compose.yaml`, `deploy.ts`; never `.env`). If `docker run --rm --entrypoint /usr/local/bin/bun orbs-daemon:<tag> --version` prints a different version than `bun --version` on the server, install Bun from the new image as in step 3; otherwise leave it. Load images before changing the tag: Docker Compose otherwise tries to download them and fails with `pull access denied`. To switch:

1. Back up everyone (above), the template workspace too (`bun deploy.ts backup template`), and the hub's folder (above). A new version can change the database; the old version may not read it again. The [audit trail](#activity) is a file in the hub's folder, so the upgrade keeps it.
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
4. Check: `docker compose ps` shows the new tag on the hub, the provisioner, web, `orbs-daemon-template-1` and every person's daemon, all healthy. From the version with the [audit trail](#activity) on, `ls -ln hub/audit.sqlite` shows the file owned by `1000 1000` with mode `-rw-------`: the hub creates it on its first start. The hub log may show `The provisioner did not take the admin list yet; trying again` once, because the provisioner restarts at the same moment; it is harmless when no error line follows. If someone has Orbs open during the restart, the hub may also log one `ERROR … 502` `Request refused` for `/health` with `The daemon of <id> did not answer /health`: their app asked while their Orbs was restarting, and it reconnects on its own. Only the same line again after the containers are healthy means a problem.

The first upgrade to a version with the admin panel needs three more things, once, before step 2: add `admins:` with your email to `users.yaml`, and `HUB_ADMIN_EMAILS` and `PROVISIONER_TOKEN` to `.env` (the two commands in [install, step 7](install.md#7-start-orbs)). The `apply` in step 3 then lets the provisioner write the hub's user list (the `hub` folder becomes group root, mode 770); without it every change in the admin panel fails.

**The first upgrade to a version with global settings changes nobody's settings.** People who were there before start with every section *overridden*: they keep their own keys, secrets, chat and tool settings and `~/.agents` files, and get nothing from Global settings. Before you switch a section of theirs to *global*, set that section in Global settings, and know that the switch replaces their values with the global ones: for Secrets it removes their own secrets, for Sources it replaces their `~/.agents` folder, for Models it signs out API keys the template doesn't have. The panel lists what each switch removes before you confirm. Back them up first. People you add in the panel after the upgrade follow every section.

To roll back, copy the old version's deployment files into `/opt/orbs` again (from a checkout of that version), set the old tag, and run `docker compose up -d --wait` and then `bun deploy.ts apply`, as for an upgrade. Both steps matter: an older hub may refuse the newer `hub/users.json` and let nobody in (a rollback from global settings to the first admin panel version logged `unrecognized_keys` and *Users file … invalid: every request is refused*), and only the old `deploy.ts apply` writes the file it expects. Rolling back past global settings removes the template container and keeps its volume, so a later upgrade finds the global settings and suggested bots again. If the new version changed someone's data, restore their backup from before the upgrade.

**Give this to your agent:**

> On `root@<server>`, upgrade Orbs in `/opt/orbs` to image tag `<tag>`: confirm `docker images` lists `orbs-daemon`, `orbs-web`, `orbs-hub` and `orbs-provisioner` with that tag, and that `/opt/orbs` has the deployment files from the same checkout. Back up every user and the template with `bun deploy.ts backup <id>`, and the hub's folder as the Backups section shows, set `ORBS_TAG=<tag>` in `.env`, run `docker compose up -d --wait`, then `bun deploy.ts apply`. Confirm every container is healthy on the new tag, `orbs-daemon-template-1` included, and the hub log shows no error. Don't switch anyone's settings sections to global. If anything fails, roll back as the Upgrades section says: the previous version's deployment files, the previous tag, `docker compose up -d --wait`, then `bun deploy.ts apply`.

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
