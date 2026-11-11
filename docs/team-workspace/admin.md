# Admin tasks

Everyday work for the person who runs the server. Each task ends with a prompt you can paste to an AI coding agent that has SSH access to the server.

> [!NOTE]
> Steps marked `TODO(wave 2)` get their exact commands when the deployment files exist.

## Where each person's data lives

Each person has one Docker volume, mounted at `/data` in their container. Everything of theirs is in it:

| Path in the container | What it holds |
| --- | --- |
| `/data/data/` | the database, the encryption key for saved secrets, each bot's history |
| `/data/agents/<bot>/` | each bot's working folder and uploaded files |
| `/data/pi/` | model provider settings: `models.json` and `auth.json` |
| `/data/home/` | the person's home folder: shared skills, instructions and tool settings |

Treat a volume as secret: it contains the person's keys.

## The user list

The hub reads `users.json` in its data folder (`HUB_DATA_DIR`). Each email maps to a short user id, the internal address of that person's Orbs, and the path of its owner socket as the hub sees it:

```json
{
  "users": {
    "alice@example.com": { "id": "alice", "daemonUrl": "http://alice:47191", "socketPath": "/ipc/alice/rpc.sock" },
    "bob@example.com": { "id": "bob", "daemonUrl": "http://bob:47191", "socketPath": "/ipc/bob/rpc.sock" }
  }
}
```

- Each email, id, address and socket path must appear once. A copied address would send one person to another person's Orbs.
- The socket path must be the real place the person's `data/ipc` folder is mounted in the hub, with no symlinks on the way. The hub refuses symlinks.
- The hub notices a saved change within about a second. No restart.
- If the file is missing or has a mistake, the hub lets nobody in until it is fixed, and its log says so. Check the hub's log after every edit, and edit a copy, then move it into place.
- The addresses and paths above are examples; `TODO(wave 2)`: the real ones come from the Compose file.

## Add a person

1. Add their email to the Access policy in Cloudflare, so they can log in.
2. Give them a container and volume, then add them to `users.json`.
3. Give them a model key (next section), or tell them to add their own.
4. Send them the address, `https://<team>.<domain>`. On their first visit they type their email and enter the code from their inbox. Their browser pairs itself and shows their bots.

`TODO(wave 2)`: the command that creates and starts their container.

**Give this to your agent:**

> On `root@<server>`, add `<email>` as Orbs user `<name>`: allow the email in the Cloudflare Access policy for `<team>.<domain>`, create their container and volume and start it, then add them to the hub's `users.json` with a unique id, address and socket path. Confirm their container is healthy and the hub's log shows no error after the edit. `TODO(wave 2)`: use the deploy skill.

## Remove a person

1. Remove their entry from `users.json`. Within about a second the hub refuses them, and within about 5 more seconds it closes the connections they still have open. Check the hub's log: a mistake in the file locks everyone out until it is fixed.
2. Remove their email from the Access policy, so they cannot log in again.
3. Stop their container.
4. Keep their volume until you have a backup or are sure it is not needed. Deleting the volume deletes all their bots and chats for good.

`TODO(wave 2)`: the commands.

**Give this to your agent:**

> On `root@<server>`, remove Orbs user `<name>` (`<email>`): delete their entry from the hub's `users.json` and confirm in the hub's log that the new list loaded, take the email out of the Cloudflare Access policy, and stop their container. Keep their volume. `TODO(wave 2)`: use the deploy skill.

## Set model API keys

Each person uses their own key. There are two ways:

- **The person adds it.** In Orbs, **Settings → Providers**, pick the provider and paste the key. Nothing else to do.
- **The admin adds it.** Write the key into that person's `/data/pi/models.json`, then restart their container. Orbs reads this file only at start. Example for Anthropic:

  ```json
  {
    "providers": {
      "anthropic": { "apiKey": "<the key>" }
    }
  }
  ```

A key the person enters in Settings wins over the one in `models.json`.

Do not use a Claude or ChatGPT subscription login for the team. The providers' terms do not allow one subscription to serve several people.

**Give this to your agent:**

> On `root@<server>`, set the `<provider>` API key for Orbs user `<name>`. Read the key from `<where you keep it>`, write it as `apiKey` under `providers.<provider>` in `/data/pi/models.json` inside their volume, keep the file owned by the container user, and restart only their container. Never print the key.

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

Creating bots for someone is done in the app today. `TODO(wave 2)`: a way for the admin to create default bots.

**Give this to your agent:**

> On `root@<server>`, add the skill in `<local folder>` for all bots of Orbs user `<name>`: copy it to `/data/home/.agents/skills/<skill name>/` in their volume, owned by the container user. Don't restart anything. Confirm the skill appears in their bot's skill list within a minute.

## Backups

Orbs has a backup command that snapshots one person's bots, files and database: `orbs backup create <new folder>` and `orbs backup restore <backup folder>`. It runs while that person's Orbs is stopped. A backup includes their encryption key, so store it like a password.

`TODO(wave 2)`: how to run it for every person on a schedule, and where backups go.

**Give this to your agent:**

> `TODO(wave 2)`: back up every Orbs user on `root@<server>`.

## Upgrades

`TODO(wave 2)`: how to get new images and restart. What is already certain:

- Data lives in the volumes, so new containers pick up where the old ones stopped.
- Restarting takes a few seconds per person. Open chats reconnect on their own.
- Scheduled routines that were due during the restart run once when Orbs is back.

**Give this to your agent:**

> `TODO(wave 2)`: upgrade Orbs on `root@<server>`.
