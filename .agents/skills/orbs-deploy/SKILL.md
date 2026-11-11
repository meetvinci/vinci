---
name: orbs-deploy
description: "Install and run an Orbs team install: one daemon per person in Docker on an Ubuntu server, the hub behind a Cloudflare Tunnel with Cloudflare Access. Use to install from scratch, add or remove a person, set model keys, upgrade or roll back, back up or restore, check health and isolation, or tear down. Not for changing the deploy code itself (read .agents/references/team-workspace.md for that)."
---

# Deploy a team install

The human guides in `docs/team-workspace/` are the single source of truth for commands. This skill says what to ask, in what order to work, what never to do, and how to prove each step. Read the guide section named in each step and run its commands as written; when a command fails or its output differs, use the "If it differs" notes there and `troubleshooting.md` before improvising. When you fix a guide's command, fix the guide too.

## Ask first

Ask the human for everything below before touching anything, in one message. Don't guess any of it.

| What | Example | Used for |
| --- | --- | --- |
| Server address and how to reach it | `root@203.0.113.10`, key file or SSH options | every server step |
| Cloudflare zone, team hostname, object name | `example.com`, `acme.example.com`, `orbs-acme` | Cloudflare steps; the name must start with `orbs-` |
| Where the Cloudflare API token is | `op://<vault>/<item>/credential` | read inside each command that needs it |
| People: id and email each | `alice: alice@example.com` | `users.yaml` |
| Model keys: provider and where they are, or none | `ANTHROPIC_API_KEY` from `op://…` | `.env` |
| Optional: SSH through the tunnel, admin emails | `acme-ssh.example.com` | `--ssh-hostname`, `--ssh-email` |
| For a change: the image tag in use | `ORBS_TAG` in `/opt/orbs/.env` | upgrades and teardown |

If the token read fails (1Password prints `authorization timeout`, the script says `CLOUDFLARE_API_TOKEN is unset or empty`), ask the human to unlock their password manager. Never ask them to paste the token or a login code.

## Safety rules

- **Never print secrets.** Not the API token, `TUNNEL_TOKEN`, model keys, `/opt/orbs/.env`, `auth.json`, `models.json` with keys, or backups. Read tokens inside the command that uses them (`CLOUDFLARE_API_TOKEN="$(op read '…')" bun …`); never export them in a shell profile, write them to a file, or put them on the server. The only Cloudflare value the server holds is `TUNNEL_TOKEN` in `/opt/orbs/.env` (mode 600). Hide emails in anything you post publicly.
- **Protect before DNS.** Only `bun scripts/deploy.ts cloudflare apply` creates Cloudflare objects; it creates Access before the DNS record. Never create the DNS record, tunnel routes or Access apps by hand or in the dashboard.
- **Exact-name ownership on Cloudflare.** Every object is `orbs-<team>` or `orbs-<team>-<suffix>`; DNS records carry the comment `orbs deploy orbs-<team>`. Accounts hold unrelated objects with similar names (other tunnels, Access apps, `orbs-…` apps on other hostnames): never change or delete anything by prefix or by hand. Before `cloudflare destroy --yes`, run it without `--yes`, read every listed line, and check each names `orbs-<team>` or `<team>.<domain>` exactly.
- **Never clean Docker host-wide.** No `docker system prune`, `docker volume prune`, `docker image prune`, `docker network prune` or `docker builder prune`. Remove only objects you created, by name: `orbs-daemon:<tag>` images, `orbs_data-<id>` volumes after a confirmed purge, containers you started for tests.
- **Data deletion needs the human's yes.** `bun deploy.ts purge <id>`, `docker volume rm`, deleting backups, `rm -rf /opt/orbs` and `cloudflare destroy --yes` are irreversible: list what goes and wait for confirmation.
- **Linux only.** Isolation between people is Docker Engine's per-network rule. Never run a team on OrbStack or Docker Desktop, and prove isolation on the real server.
- **Build images off the server**, on the admin's computer (`bun run build:images`), and load them over SSH.
- **Don't attach anything to `orbs_user-<id>` networks**, and don't pair your own device into a person's Orbs: a device paired there can act as that person.

## Install

Follow `docs/team-workspace/install.md` steps 1 to 8 in order. Stop at the first failed check and report it.

| Step | Proof it worked |
| --- | --- |
| 1. Check the server | `x86_64`, Ubuntu 24.04, `avx2`, at least 3.7 GiB memory, 40 GB free |
| 2. Docker | server version 26 or newer, `docker compose version` works, service `enabled` |
| 3. Images and files | `amd64` for all three images locally; three `Loaded image:` lines; `/opt/orbs` mode 700 with the four files; `.env` mode 600; `bun --version` on the server |
| 4. `users.yaml` | one `<id>: <email>` per person under `users:` |
| 5. Cloudflare | `created` or `unchanged` for the tunnel, policies, apps, routes and DNS; the three values printed; `cloudflare.env` written (git ignores it) |
| 6. Tunnel token | `600 root` and `4` from the step's check; local `cloudflare.env` deleted |
| 7. Start | `Applied <n> users`; every container `(healthy)`; `Registered tunnel connection` in the cloudflared log |
| 8. Check | `/rpc` 302 to `<team>.cloudflareaccess.com`, `/favicon.ico` and `/img/favicon/site.webmanifest` 200; `ss -tlnp` shows only sshd and 127.0.0.53/54; isolation check all `blocked`, hub lines `200` |

You cannot pass Cloudflare Access yourself: it emails a one-time code to the person. Finish by telling the human the address and which emails can log in. On the first visit each person sees the model-provider step of onboarding unless shared keys are set.

Deeper checks, when asked to verify an install:

- **The hub trusts only Cloudflare.** From a throwaway container on the `orbs_tunnel` network, requests to `http://hub:47192/rpc` with a self-made JWT (any algorithm, any key, the real `ACCESS_AUD` and a real email) must get 401, as must no JWT; `/favicon.ico` 200; `/img/favicon/` 401. Remove the container by name afterwards.
- **Hardening.** `docker inspect` each container: `ReadonlyRootfs` true, `CapDrop [ALL]`, `no-new-privileges`, no `PortBindings`, daemons `User 1000:1000` with memory, CPU and PID limits; each daemon's only network is its `orbs_user-<id>`; its ipc mount has `Subpath <id>`; no Docker socket inside.
- **Reboot.** `systemctl reboot`; within a minute every container is healthy again, the hub is still on every `orbs_user-<id>` network, and the step 8 curls answer as before.
- **Resources.** `docker stats --no-stream`: an idle daemon about 105-110 MiB, web 35-55, cloudflared 15-35, hub about 12 (x86, November 2026).

## Add a person

`admin.md`, "Add a person": add the line, `bun deploy.ts apply` on the server, then `cloudflare emails` from the admin's computer. Proof: `orbs-daemon-<id>-1` healthy; `grep -c daemonUrl /opt/orbs/hub/users.json` equals the number of people; `Access policy orbs-<team>-allow: updated`. The hub's `Users loaded` log line only updates on the next request, so don't wait for it. Nobody else's container or the hub restarts.

There is no command to create bots for a person; they do it in the app.

## Remove a person

`admin.md`, "Remove a person": delete the line, `apply`, then `cloudflare emails`. Proof: their container and `orbs_user-<id>` network are gone, `users.json` count dropped, the policy `updated`. Their volume stays. `bun deploy.ts purge <id>` deletes it for good and restarts the hub (a few seconds for everyone): only after a backup and the human's yes.

## Model keys

`admin.md`, "Set model API keys". Write keys into `/opt/orbs/.env` without printing them, then `docker compose up -d --wait`. Proof: every daemon healthy. Every person's bots can read shared keys; say so when setting them. Never use a Claude or ChatGPT subscription login for a team.

## Upgrade and roll back

`admin.md`, "Upgrades". Order: build and load the new tag, copy the deployment files again (never `.env`), back up every person, set `ORBS_TAG`, `docker compose up -d --wait`. Proof: `docker compose ps` shows the new tag on hub, web and every daemon, all healthy; `/rpc` still 302 from outside. Roll back by setting the old tag and running the same command; restore backups only if the new version changed data. Remove old image tags by name once the human is happy.

## Back up and restore

`admin.md`, "Backups". `bun deploy.ts backup <id>` per person; copy files off the server with `scp -p`. Restore with `bun deploy.ts restore <id> <file>`, which first saves the current data. Proof: the backup file exists, mode 600; after a restore, `Restored <id>` and the container healthy.

## Status

`admin.md`, "Status and logs". Read-only; change nothing unless asked.

## Tear down

`admin.md`, "Tear down": `docker compose down` on the server first, then `cloudflare destroy` without `--yes`, check every name, then with `--yes` after the human confirms. Keep volumes and `/opt/orbs` unless the human says to delete the data. Remove any test containers, images and networks you added, by name.

## When something is off

Read `docs/team-workspace/troubleshooting.md`, then `.agents/references/team-workspace.md` (risks and gotchas, with evidence). Report what you saw, what you changed and how you proved it.
