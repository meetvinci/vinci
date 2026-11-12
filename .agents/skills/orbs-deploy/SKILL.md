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
| First admin of the admin panel (need not be one of the people; admins are fully trusted) | `admin@example.com` | `admins:` in `users.yaml`, `HUB_ADMIN_EMAILS` (the same email in both) |
| Model keys: provider and where they are, or none | `ANTHROPIC_API_KEY` from `op://…` | `.env` |
| Optional: SSH through the tunnel, admin emails | `acme-ssh.example.com` | `--ssh-hostname`, `--ssh-email` |
| For a change: the image tag in use | `ORBS_TAG` in `/opt/orbs/.env` | upgrades and teardown |

If the token read fails (1Password prints `authorization timeout`, the script says `CLOUDFLARE_API_TOKEN is unset or empty`), ask the human to unlock their password manager. Never ask them to paste the token or a login code.

## Safety rules

- **Never print secrets.** Not the API token, `TUNNEL_TOKEN`, `PROVISIONER_TOKEN`, model keys, `/opt/orbs/.env`, `auth.json`, `models.json` with keys, or backups. Read tokens inside the command that uses them (`CLOUDFLARE_API_TOKEN="$(op read '…')" bun …`); never export them in a shell profile, write them to a file, or put them on the server. The only Cloudflare secrets the server holds are `TUNNEL_TOKEN` and, only if the human asks for Access sync, a separate narrow `CLOUDFLARE_API_TOKEN`, both in `/opt/orbs/.env` (mode 600). Never put the install token on the server. Hide emails in anything you post publicly.
- **Protect before DNS.** Only `bun scripts/deploy.ts cloudflare apply` creates Cloudflare objects; it creates Access before the DNS record. Never create the DNS record, tunnel routes or Access apps by hand or in the dashboard.
- **Exact-name ownership on Cloudflare.** Every object is `orbs-<team>` or `orbs-<team>-<suffix>`; DNS records carry the comment `orbs deploy orbs-<team>`. Accounts hold unrelated objects with similar names (other tunnels, Access apps, `orbs-…` apps on other hostnames): never change or delete anything by prefix or by hand. Before `cloudflare destroy --yes`, run it without `--yes`, read every listed line, and check each names `orbs-<team>` or `<team>.<domain>` exactly.
- **Never clean Docker host-wide.** No `docker system prune`, `docker volume prune`, `docker image prune`, `docker network prune` or `docker builder prune`. Remove only objects you created, by name: `orbs-daemon:<tag>` images, `orbs_data-<id>` volumes after a confirmed purge, containers you started for tests.
- **Data deletion needs the human's yes.** `bun deploy.ts purge <id>`, `docker volume rm`, deleting backups, `rm -rf /opt/orbs` and `cloudflare destroy --yes` are irreversible: list what goes and wait for confirmation.
- **Linux only.** Isolation between people is Docker Engine's per-network rule. Never run a team on OrbStack or Docker Desktop, and prove isolation on the real server.
- **Build images off the server**, on the admin's computer (`bun run build:images`), and load them over SSH.
- **Don't attach anything to `orbs_user-<id>` or `orbs_provisioner` networks**, and don't pair your own device into a person's Orbs: a device paired there can act as that person. The provisioner holds the Docker socket: never publish its port, give it capabilities, or let anything but the hub reach it.

## Install

Follow `docs/team-workspace/install.md` steps 1 to 8 in order. Stop at the first failed check and report it.

| Step | Proof it worked |
| --- | --- |
| 1. Check the server | `x86_64`, Ubuntu 24.04, `avx2`, at least 3.7 GiB memory, 40 GB free |
| 2. Docker | server version 26 or newer, `docker compose version` works, service `enabled` |
| 3. Images and files | `amd64` for all four images locally; four `Loaded image:` lines; `/opt/orbs` mode 700 with the four files; `.env` mode 600; `bun --version` on the server |
| 4. `users.yaml` | one `<id>: <email>` per person under `users:`; the first admin under `admins:` |
| 5. Cloudflare | `created` or `unchanged` for the tunnel, policies, apps, routes and DNS; the five values printed (`ORBS_PUBLIC_HOST`, `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `CLOUDFLARE_ZONE`, `CLOUDFLARE_NAME`); `cloudflare.env` written (git ignores it) |
| 6. Tunnel token | `600 root` and `6` from the step's check; local `cloudflare.env` deleted |
| 7. Start | `HUB_ADMIN_EMAILS` set and `1` from the `PROVISIONER_TOKEN` check; `Applied <n> users`; every container `(healthy)`, the provisioner included; `Registered tunnel connection` in the cloudflared log |
| 8. Check | `/rpc` and `/admin` 302 to `<team>.cloudflareaccess.com`, `/favicon.ico` and `/img/favicon/site.webmanifest` 200; `ss -tlnp` shows only sshd and 127.0.0.53/54; isolation check all `blocked`, hub lines `200`; `hub/admins.json` lists the first admin and the hub log has `Admins seeded from HUB_ADMIN_EMAILS` and no `Admins file` error |

You cannot pass Cloudflare Access yourself: it emails a one-time code to the person. Finish by telling the human the address, which emails can log in, and that the first admin opens the admin panel at `https://<team>.<domain>/admin` (where they add people and set up their bots). On the first visit each person sees the model-provider step of onboarding unless shared keys are set.

Deeper checks, when asked to verify an install. Only the daemon image has a shell: `docker exec <container> sh` fails on the hub, web, provisioner and cloudflared, so run checks with `docker exec <container> bun -e '…'` (not cloudflared). In `fetch` errors, code `23` is a timeout (packets dropped), `ETIMEOUT` means the name did not resolve, and `FailedToOpenSocket` means no route; all count as blocked.

- **The hub trusts only Cloudflare.** From a throwaway container on the `orbs_tunnel` network, requests to `http://hub:47192/rpc`, `/`, `/admin`, `/admin/api/me` and `/hub/pair` with a self-made JWT (any algorithm, any key, the real `ACCESS_AUD` and a real email) must get 401, as must no JWT; `/favicon.ico` 200; `/img/favicon/` 401. A quick forged token (HS256), with nothing printed but status codes. It reads only the three values it needs from `.env`; never source the whole file into your shell (risk 52 in the reference):

  ```sh
  cd /opt/orbs && get() { sed -n "s/^$1=//p" .env; } && docker run --rm --name orbs-jwt-probe --network orbs_tunnel -e AUD="$(get ACCESS_AUD)" -e ISS="$(get ACCESS_TEAM_DOMAIN)" -e EMAIL=<a user email> --entrypoint bun "orbs-hub:$(get ORBS_TAG)" -e 'const b=(s)=>Buffer.from(s).toString("base64url");const t=Math.floor(Date.now()/1000);const h=b(JSON.stringify({alg:"HS256",typ:"JWT"}))+"."+b(JSON.stringify({aud:[process.env.AUD],iss:process.env.ISS,email:process.env.EMAIL,iat:t,exp:t+600}));const k=await crypto.subtle.importKey("raw",new TextEncoder().encode("x"),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const j=h+"."+Buffer.from(await crypto.subtle.sign("HMAC",k,new TextEncoder().encode(h))).toString("base64url");for(const p of ["/rpc","/","/admin","/admin/api/me","/hub/pair"])for(const x of [null,j]){const r=await fetch("http://hub:47192"+p,{headers:x?{"cf-access-jwt-assertion":x}:{},redirect:"manual"});console.log(p,x?"forged":"none",r.status)}'
  ```
- **Hardening.** `docker inspect` each container: `ReadonlyRootfs` true, `CapDrop [ALL]`, `no-new-privileges`, no `PortBindings`, daemons `User 1000:1000` with memory, CPU and PID limits; each daemon's only network is its `orbs_user-<id>`; its ipc mount has `Subpath <id>`; no Docker socket inside. Only the provisioner has the socket: `User 0:0`, no `CapAdd`, networks `orbs_provisioner` (hub and provisioner only, internal) and `orbs_egress` (provisioner only).
- **The provisioner is reachable only from the hub.** From each daemon and from the web container, `fetch` to `http://provisioner:47193/health` and to the provisioner's IP on both its networks must fail; from the hub, `http://provisioner:47193/health` answers 401 without the token. Linux only (OrbStack lets a daemon reach other bridges).

  ```sh
  cd /opt/orbs && P1=$(docker inspect orbs-provisioner-1 -f '{{(index .NetworkSettings.Networks "orbs_provisioner").IPAddress}}') && P2=$(docker inspect orbs-provisioner-1 -f '{{(index .NetworkSettings.Networks "orbs_egress").IPAddress}}') && for c in $(docker compose ps --format '{{.Name}}' | grep -E 'daemon-|web|hub'); do for u in provisioner $P1 $P2; do printf '%s -> %s: ' $c $u; docker exec $c bun -e "fetch('http://$u:47193/health',{signal:AbortSignal.timeout(3000)}).then(r=>console.log('REACHED',r.status),e=>console.log('blocked',e.code||e.name))"; done; done
  ```

  Expected: every daemon and web line `blocked`; the hub `REACHED 401` for `provisioner` and the first IP, `blocked` for the egress IP.
- **The provisioner works without the panel.** You cannot pass Access, so prove the panel's user changes by calling the provisioner from inside the hub with the hub's own token (never print it). Use a throwaway id and an email nobody uses, then `bun deploy.ts purge <id>` (it restarts the hub for a few seconds):

  ```sh
  prov() { docker exec -e M="$1" -e P="$2" -e B="$3" orbs-hub-1 bun -e 'const r=await fetch("http://provisioner:47193"+process.env.P,{method:process.env.M,headers:{authorization:"Bearer "+process.env.PROVISIONER_TOKEN,"content-type":"application/json"},body:process.env.B||undefined});console.log(r.status,await r.text())'; }
  prov PUT /users/probe '{"name":"Probe","email":"probe@example.com","enabled":true}'   # 200, state running
  prov PUT /users/probe '{"name":"Probe","email":"probe@example.com","enabled":false}'  # 200, state stopped, volume kept
  prov DELETE /users/probe                                                              # 200
  ```

  Each answer carries `access`: `manual` without a server token. Nobody else's container restarts: compare `docker inspect -f '{{.Id}} {{.State.StartedAt}}'` of the hub and the other daemons before and after.
- **Owner socket refusals.** `admin.md`, "Create a bot for someone", with the paths `conversation/submit`, `conversation/list`, `conversation/history`, `conversation/answerQuestion`, `tools/answer` and `pairing/create` and body `{"json":{}}`: each must answer 403 `FORBIDDEN`. `bots/list` answers 200.
- **Testing without model keys.** Run a mock model only as a separate, clearly named container (not in `/opt/orbs`, not in the Compose project), never on an `orbs_user-<id>` network (risk 39 in the reference). One that works: the host network, bound to the docker0 gateway `172.17.0.1`, which every daemon reaches and nothing outside does. Point each person's `/data/pi/models.json` at it (`{"providers":{"anthropic":{"baseUrl":"http://172.17.0.1:<port>","apiKey":"<test key>"}}}`, written as uid 1000 with `docker compose exec`, then restart that daemon). Tell the human what is test-only and how to remove it.
- **Reboot.** `systemctl reboot`; within a minute every container is healthy again (about 40 s on the test server), the hub is still on every `orbs_user-<id>` network, and the step 8 curls answer as before.
- **Resources.** `docker stats --no-stream`, idle on the x86 test server with the admin panel version (November 2026): a daemon 106-136 MiB, web 66-69, cloudflared about 38, hub 14-21, provisioner 14 (about 65 after it ran a few changes); the host about 810 MiB used in all with two people. With the admin panel in use (arm64, local): daemons 110-131, web about 131, hub about 43.
- **Admin panel.** The admin panel's hub rules are covered by `apps/hub` tests; on the server, the forged-JWT check above covers `/admin` and `/admin/api/me`, and from outside both must 302 to the Cloudflare login. The human proves the panel by logging in as the first admin.

## Add a person

Normally the admin panel does this. By hand: `admin.md`, "Add a person": add the line, `bun deploy.ts apply` on the server, then `cloudflare emails` from the admin's computer (skip it if the server has `CLOUDFLARE_API_TOKEN` and the provisioner log says `Access sync on.`; run it anyway after a by-hand change). Proof: `orbs-daemon-<id>-1` healthy; `grep -c daemonUrl /opt/orbs/hub/users.json` equals the number of people; `Access policy orbs-<team>-allow: updated`. The hub's `Users loaded` log line only updates on the next request, so don't wait for it. Nobody else's container or the hub restarts.

Bots for a person are created in the admin panel (or by the person in the app). Without the panel, `admin.md`, "Create a bot for someone", uses the person's owner socket. Never pair a device into their Orbs.

## Disable a person

`admin.md`, "Disable a person": `enabled: false` in the long form, `apply`, then `cloudflare emails`. Proof: no `orbs-daemon-<id>-1`, `orbs_data-<id>` still there, their email gone from `hub/users.json`.

## Remove a person

`admin.md`, "Remove a person": delete the line, `apply`, then `cloudflare emails`. Proof: their container and `orbs_user-<id>` network are gone, `users.json` count dropped, the policy `updated`. Their volume stays. `bun deploy.ts purge <id>` deletes it for good and restarts the hub (a few seconds for everyone): only after a backup and the human's yes.

## Model keys

`admin.md`, "Set model API keys". Write keys into `/opt/orbs/.env` without printing them, then `docker compose up -d --wait`. Proof: every daemon healthy. Every person's bots can read shared keys; say so when setting them. Never use a Claude or ChatGPT subscription login for a team.

## Access sync on the server

`admin.md`, "Let the server update Cloudflare Access", only when the human asks: a separate token with Zone: Zone: Read and Account: Access: Apps and Policies: Edit, never the install token. Proof: provisioner log `Access sync on.`

## Upgrade and roll back

`admin.md`, "Upgrades". The first upgrade to a version with the provisioner and admin panel also needs `admins:` in `users.yaml`, `HUB_ADMIN_EMAILS` and `PROVISIONER_TOKEN` in `.env`, and one `bun deploy.ts apply` afterwards (proof: `stat -c '%u:%g %a' /opt/orbs/hub` prints `1000:0 770`). Order: build and load the new tag, copy the deployment files again (never `.env`), back up every person, set `ORBS_TAG`, `docker compose up -d --wait`. Proof: `docker compose ps` shows the new tag on hub, provisioner, web and every daemon, all healthy; `/rpc` still 302 from outside. Roll back by setting the old tag and running the same command; restore backups only if the new version changed data. Remove old image tags by name once the human is happy.

## Back up and restore

`admin.md`, "Backups". `bun deploy.ts backup <id>` per person; copy files off the server with `scp -p`. Restore with `bun deploy.ts restore <id> <file>`, which first saves the current data. Proof: the backup file exists, mode 600; after a restore, `Restored <id>` and the container healthy.

## Status

`admin.md`, "Status and logs". Read-only; change nothing unless asked.

## Tear down

`admin.md`, "Tear down": `docker compose down` on the server first, then `cloudflare destroy` without `--yes`, check every name, then with `--yes` after the human confirms. Keep volumes and `/opt/orbs` unless the human says to delete the data. Remove any test containers, images and networks you added, by name.

## When something is off

Read `docs/team-workspace/troubleshooting.md`, then `.agents/references/team-workspace.md` (risks and gotchas, with evidence). Report what you saw, what you changed and how you proved it.
