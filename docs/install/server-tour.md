---
title: Server tour
description: A tour of a Vinci server, with a terminal open.
---

*Live install · tag b285c406 · read 16 Nov 2026, 15:00 UTC*

Where the containers, images, disks and files are, what starts them, and what to keep open in a second terminal so you can watch things happen. Every command was run read-only on a real install with two people and the template workspace. Names, emails and the hostname are replaced: `alice`, `bob`, `example.com`, `team.example.com`.

```sh title="your computer"
ssh root@<server>
cd /opt/vinci
```

> [!NOTE]
> Every server command below runs as root in `/opt/vinci`. None of them changes anything unless the text says so. The page describes `main`; where an install from 14 November 2026 or older differs, a note says so.

## The picture

One server, one Docker Compose project called `vinci`. Seven containers are shared (eight with the optional tunnel). Each person gets two more: a **daemon** (their own Vinci: bots, chats, keys) and a **sandbox** (where their bots' commands run, with no keys). The **template** is a hidden person that holds Global settings and the suggested bots; nobody logs into it.

```text
   browser ── https://team.example.com   (or through the optional Cloudflare Tunnel)
      │
┌─────┼─────────────────────────────── server ──────────────────────────────┐
│     ▼  :80 :443                                                           │
│  caddy ──/auth/*──▶ api :8080 (login, sessions) ──▶ postgres              │
│     │                     ▲ /internal/session                             │
│     └──────────────▶ hub :47192 ──web──────────▶ web :47190               │
│                          │ └──provisioner──▶ provisioner :47193           │
│                          │                   Docker socket; runs apply    │
│        ┌─────────────────┼───────────────────┐                            │
│        │ user-alice      │ user-bob          │ user-template              │
│        ▼                 ▼                   ▼                            │
│  daemon-alice       daemon-bob        daemon-template   :47191 each       │
│        ▲ exec.sock       ▲                   ▲                            │
│  sandbox-alice      sandbox-bob       sandbox-template  own network each  │
│                                                                           │
│  firewall (host network): iptables rules for every mv-d* bridge           │
└───────────────────────────────────────────────────────────────────────────┘
   daemons and sandboxes reach the public internet and DNS, nothing internal
```

| Container | What it does |
| --- | --- |
| `caddy` | The way in: HTTPS on ports 80 and 443 with a Let's Encrypt certificate (plain HTTP to cloudflared, no ports, with the optional tunnel). Sends `/auth/*` to the API, everything else to the hub, and a visit without the login cookie to the login page. |
| `api`, `postgres` | The Laravel login: the login page, the accounts and each browser's login (a Sanctum token in the `vinci_session` cookie), in PostgreSQL. |
| `hub` | The front door behind Caddy. Checks every request's login with the API, finds the person by email, sends their app's data calls to their daemon and everything else to `web`. Relays the admin panel to each daemon's owner socket and writes the audit trail. |
| `web` | The one web app, the admin panel included. Talks only to the hub. |
| `provisioner` | The only container with the Docker socket. Adds, disables and removes people for the admin panel by running `bun deploy.ts apply`. Answers only the hub. |
| `firewall` | Keeps daemons and sandboxes off the server's internal addresses. Checks its rules every 2 seconds. |
| `daemon-<id>` | One person's Vinci. Makes the model requests. Reachable only by the hub. |
| `sandbox-<id>` | Where that person's bot tools and command MCP servers run. Sees only the bot folders and the bots' home. |

```sh title="what runs"
$ docker compose ps --format "table {{.Service}}\t{{.Image}}\t{{.Status}}"
SERVICE            IMAGE                              STATUS
api                vinci-api:b285c406             Up 12 hours (healthy)
caddy              caddy:2.11.9-alpine            Up 2 days (healthy)
daemon-alice       vinci-daemon:b285c406          Up 12 hours (healthy)
daemon-bob         vinci-daemon:b285c406          Up 12 hours (healthy)
daemon-template    vinci-daemon:b285c406          Up 12 hours (healthy)
firewall           vinci-firewall:b285c406        Up 2 days (healthy)
hub                vinci-hub:b285c406             Up 12 hours (healthy)
postgres           postgres:18-alpine             Up 2 days (healthy)
provisioner        vinci-provisioner:b285c406     Up 2 days (healthy)
sandbox-alice      vinci-sandbox:b285c406         Up 12 hours (healthy)
sandbox-bob        vinci-sandbox:b285c406         Up 12 hours (healthy)
sandbox-template   vinci-sandbox:b285c406         Up 12 hours (healthy)
web                vinci-web:b285c406             Up 2 days (healthy)
```

Healthy looks like this: every line `(healthy)`, two lines per person plus the template's two. "Up 12 hours" on the people and the hub is normal: the nightly backup at 03:00 stops and starts each of them.

### Who can talk to whom

Each person's daemon shares a network only with the hub; each sandbox is alone on its own. People's networks get a bridge named `mv-d…`, which is what the firewall's rules match. `web`, `provisioner`, `api` and the edge networks are internal: no internet. Caddy alone is on `vinci_tunnel`, for its certificates (and cloudflared, with the tunnel).

```sh title="networks and their members"
$ for n in $(docker network ls --format "{{.Name}}" | grep ^vinci_); do printf "%-26s internal=%-5s " $n $(docker network inspect $n -f "{{.Internal}}"); docker network inspect $n -f "{{range .Containers}}{{.Name}} {{end}}"; done
vinci_accounts         internal=true  vinci-api-1 vinci-hub-1
vinci_api              internal=true  vinci-api-1 vinci-postgres-1
vinci_edge             internal=true  vinci-hub-1 vinci-caddy-1
vinci_login            internal=true  vinci-api-1 vinci-caddy-1
vinci_provisioner      internal=true  vinci-provisioner-1 vinci-hub-1
vinci_sandbox-alice    internal=false vinci-sandbox-alice-1
vinci_sandbox-bob      internal=false vinci-sandbox-bob-1
vinci_sandbox-template internal=false vinci-sandbox-template-1
vinci_tunnel           internal=false vinci-caddy-1
vinci_user-alice       internal=false vinci-daemon-alice-1 vinci-hub-1
vinci_user-bob         internal=false vinci-daemon-bob-1 vinci-hub-1
vinci_user-template    internal=false vinci-daemon-template-1 vinci-hub-1
vinci_web              internal=true  vinci-hub-1 vinci-web-1
```

> [!NOTE]
> The daemon and its sandbox share no network. They meet through a socket file, `exec.sock`, in the small volume `vinci_sandbox-<id>`.

### How a request travels

1. **Browser**: team.example.com
2. **Caddy**: HTTPS; no cookie: the login page
3. **hub**: asks the API whose `vinci_session` it is, looks the email up in `hub/users.json`
4. **daemon-\<id>**: `/rpc`, `/files/`, `/avatars/`, `/embed/`, `/health`

Every other path (the pages, scripts and images of the app) goes from the hub to `web`. An admin's change in the panel goes browser → hub → that person's **owner socket** (`/ipc/<id>/rpc.sock`), never as a device of the person. Adding someone goes hub → provisioner → `apply`. A bot's tool call goes daemon → sandbox through `exec.sock`; its model request goes daemon → internet.

```sh title="only Caddy listens on the network"
$ ss -ltnH | awk '{print $4}'
127.0.0.54:53        # the local DNS resolver
127.0.0.53%lo:53
0.0.0.0:22           # sshd
[::]:22
0.0.0.0:80           # Caddy, through Docker; none with the tunnel
0.0.0.0:443
[::]:80
[::]:443
```

## Where everything is on disk

### /opt/vinci

```sh title="the install folder"
$ ls -la /opt/vinci
drwx------ 5 root root   4096 backups
-rw------- 1 root root   6337 caddy.compose.yaml
-rw-r--r-- 1 root root   7277 compose.yaml
-rw-r--r-- 1 root root   1993 daemon.yaml
-rw-r--r-- 1 root root 129637 deploy.ts
drwx------ 5 root root   4096 disks
-rw------- 1 root root   5132 .env
drwxrwx--- 2 1000 root   4096 hub
-rw-r--r-- 1 root root    946 sandbox.yaml
-rw-r--r-- 1 root root   5704 users.compose.yaml
-rw------- 1 root root    366 users.yaml
```

| File | What it is | Who writes it | Secret? |
| --- | --- | --- | --- |
| `.env` | Hostname, the API's secrets (and the tunnel token with the tunnel), image tag (`VINCI_TAG`), shared model keys, provisioner token, limits. Never print it. | You | Yes |
| `users.yaml` | The list of people and admins. | You, the provisioner (panel), the hub (admins) | Emails |
| `compose.yaml` | The shared containers: hub, web, provisioner, firewall, and two one-off job containers (`tools`, `disks`). | Shipped | No |
| `caddy.compose.yaml` | The edge: Caddy with its Caddyfile, and the API's and hub's login settings. (`cloudflared.compose.yaml` too, only with the tunnel.) | Shipped | No |
| `daemon.yaml`, `sandbox.yaml` | The template for every daemon and sandbox: read-only, no privileges, 512 MiB, 1 CPU, 256 processes. | Shipped | No |
| `users.compose.yaml` | Per person: daemon, sandbox, two networks, three volumes. | `apply`. Never by hand | No |
| `deploy.ts` | The script for everything on the server: apply, status, backups, restore, firewall. | Shipped | No |
| `users.yaml.lock` | Exists only while an apply or a panel change runs. | `apply` | No |
| `hub/` | The hub's folder (owner 1000, mode 770): see below. | The hub, `apply` | Emails |
| `disks/` | Each person's sandbox disk, `<id>.img`, mounted at `disks/<id>/`. | `apply`, then the bots | Bot files |
| `backups/` | One folder per nightly run, plus `nightly.json`, the last run's result. | `deploy.ts nightly` | Yes, all of it |

| In hub/ | What it is | Written by |
| --- | --- | --- |
| `users.json` | Email → person id, daemon address, owner socket path. | `apply` |
| `admins.json` | Who may open `/admin`. | The hub |
| `pins.json` | Each daemon's ID, saved on first contact. The hub refuses a daemon whose ID changes. | The hub |
| `global.json` | For each person and settings section: follows global or overridden. | The hub |
| `start-sync.json` | The version whose start already copied Global settings to everyone. | The hub |
| `audit.sqlite` | The admin panel's audit trail (**Activity**). | The hub |
| `new-users.json` | People an `apply` just created, until the hub makes them follow Global settings. Usually absent. | `apply`; the hub deletes it |

> [!NOTE]
> An install from 14 November 2026 or older never writes `new-users.json`: there, people added in `users.yaml` start with every section overridden.

### Docker's part: images, volumes, networks

Docker keeps containers, volumes and networks under `/var/lib/docker`. On this Docker (29, with the containerd image store) the images themselves are under `/var/lib/containerd`. On `main` there are seven Vinci images, `ghcr.io/meetvinci/vinci-*`, plus Caddy and PostgreSQL from Docker Hub. The listing below, read on an older tag, shows the names without the registry and leaves out `vinci-api`:

```sh title="images and space"
$ docker image ls --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}"
REPOSITORY               TAG         SIZE
vinci-firewall       b285c406    289MB
vinci-provisioner    b285c406    296MB
vinci-hub            b285c406    188MB
vinci-web            b285c406    229MB
vinci-sandbox        b285c406    791MB
vinci-daemon         b285c406    367MB
caddy                    2.11.9-alpine  92MB
postgres                 18-alpine      434MB
$ docker system df
TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE
Images          7         7         1.311GB   0B (0%)
Containers      11        11        61.44kB   0B (0%)
Local Volumes   7         7         1.657MB   0B (0%)
```

> [!NOTE]
> Sizes overlap: the images share layers. After an upgrade the old tag's images stay until you remove them by name (`docker rmi ghcr.io/meetvinci/vinci-daemon:<old tag> …`); keep them until the upgrade is checked, they are your rollback.

```sh title="volumes, three per person plus one shared"
$ du -sh /var/lib/docker/volumes/vinci_*/_data
1.1M  /var/lib/docker/volumes/vinci_data-bob/_data
504K  /var/lib/docker/volumes/vinci_data-alice/_data
180K  /var/lib/docker/volumes/vinci_data-template/_data
52K   /var/lib/docker/volumes/vinci_disk-bob/_data
128K  /var/lib/docker/volumes/vinci_disk-alice/_data
44K   /var/lib/docker/volumes/vinci_disk-template/_data
16K   /var/lib/docker/volumes/vinci_ipc/_data
4.0K  /var/lib/docker/volumes/vinci_sandbox-bob/_data
4.0K  /var/lib/docker/volumes/vinci_sandbox-alice/_data
4.0K  /var/lib/docker/volumes/vinci_sandbox-template/_data
```

| Volume | What it holds |
| --- | --- |
| `vinci_data-<id>` | The person's Vinci: database, encryption key, chats, Pi settings and logins, shared skills. Secret. |
| `vinci_disk-<id>` | Not a real volume: a pointer to `disks/<id>/`, so containers can mount the person's sandbox disk. |
| `vinci_sandbox-<id>` | Only `exec.sock`: the line between daemon and sandbox. |
| `vinci_ipc` | One folder per person with their owner socket `rpc.sock`. The hub mounts it all; each daemon only its own folder. |

### The sandbox disks

Each person's bot folders and bots' home live on a disk of their own: a 5 GB sparse file (`SANDBOX_DISK`) that takes only what is written. A full disk stops only that person's bots from writing; chats and settings live in the volume and keep working.

```sh title="the disks, mounted"
$ df -h disks/*/
Filesystem      Size  Used Avail Use% Mounted on
/dev/loop2      4.8G   56K  4.8G   1% /opt/vinci/disks/bob
/dev/loop0      4.8G  132K  4.8G   1% /opt/vinci/disks/alice
/dev/loop1      4.8G   48K  4.8G   1% /opt/vinci/disks/template
$ ls -la disks/alice
drwxr-xr-x 3 1000 1000  4096 agents         # the bot folders, one per bot id
drwxr-xr-x 2 1000 1000  4096 bot-home       # the bots' home, /home/bot in the sandbox
drwx------ 2 root root 16384 lost+found
-rw-r--r-- 1 root root     0 .vinci-disk # marker: the disk is mounted
```

> [!NOTE]
> `ls -l disks/*.img` shows 5.0G each: that is the size they may grow to. `du -sh disks/*.img` shows what they really take.

### The two systemd units

| Unit | What it does | Written by |
| --- | --- | --- |
| `vinci-disks.service` | At boot, before Docker: checks and mounts every `disks/*.img`. | `apply` |
| `vinci-backup.timer` and `.service` | The nightly backup at 03:00 server time (`BACKUP_TIME`). | `nightly install` |

```sh title="both units"
$ systemctl list-unit-files "vinci*" --no-pager
UNIT FILE                STATE   PRESET
vinci-backup.service static  -
vinci-disks.service  enabled enabled
vinci-backup.timer   enabled enabled
$ systemctl list-timers vinci-backup.timer --no-pager
NEXT                        LEFT LAST                        PASSED UNIT
Tue 2026-11-17 03:00:00 UTC  12h Mon 2026-11-16 03:00:05 UTC 11h ago vinci-backup.timer
```

Bun lives at `/usr/local/bin/bun`, copied from the daemon image at install. It is the only thing Vinci puts on the host outside `/opt/vinci`, Docker's folders and the units.

## How it starts

### What `bun deploy.ts apply` does

Apply makes the server match `users.yaml`. It is safe to run again at any time: on a server that already matches, it restarts nobody and takes a few seconds. The admin panel runs the same code through the provisioner. In order:

1. Takes the lock `users.yaml.lock`, so it never runs twice at once.
2. Writes `users.compose.yaml` from `users.yaml`: a daemon and a sandbox for every enabled person and the template.
3. Starts the **firewall** and waits until it is healthy. If it is not, apply stops here and changes nobody.
4. Writes `hub/users.json` (and `hub/new-users.json` for people it creates). A removed person loses access here, before their container stops.
5. Makes each owner-socket folder in the `ipc` volume, and checks the folders the sandbox will mount (it replaces a planted link, removes a planted hard link).
6. Creates, mounts and grows each **sandbox disk**, and the first time moves the person's bot folders onto it. Warns if the disks could outgrow the server.
7. By hand only: writes `vinci-disks.service`.
8. `docker compose up`: Caddy, the API and PostgreSQL, web, every daemon and sandbox; then the hub and the provisioner without recreating them. By hand it waits until everything is healthy.
9. Joins the hub to each person's network and prints `Applied 2 users: alice, bob (and the template workspace)`.

### At a reboot

1. `vinci-disks.service` checks and mounts every sandbox disk.
2. Docker starts, and starts every container at once (`restart: unless-stopped`). Compose's start order does not apply here.
3. The firewall writes its rules, in about 0.2 seconds.
4. Each daemon and sandbox first waits until the firewall confines it, then starts. Its log says `Waiting for the firewall` and `The firewall confines this container after … ms; starting.`
5. Each sandbox connects to its daemon. The hub reaches each daemon again; open browser tabs reconnect on their own.

```sh title="the last boot, in order"
$ journalctl -b -u vinci-disks -u docker --no-pager -o short-iso | grep -E "systemd.*(Starting|Finished|Started)"
15:12:18 systemd[1]: Starting vinci-disks.service - Vinci sandbox disks of /opt/vinci...
15:12:18 systemd[1]: Finished vinci-disks.service - Vinci sandbox disks of /opt/vinci.
15:12:18 systemd[1]: Starting docker.service - Docker Application Container Engine...
15:12:21 systemd[1]: Started docker.service - Docker Application Container Engine.
```

> [!NOTE]
> A container recreated later (by an apply or an upgrade) starts with an empty log, so the firewall lines from the boot are gone once it has been recreated.

### Watching a start live

Open this in a second terminal before an `apply`, an upgrade or a reboot. It prints one line each time a container starts, stops or changes health, and nothing else:

```sh title="container events, live"
$ docker events --filter label=com.docker.compose.project=vinci --filter type=container \
    --filter event=start --filter event=die --filter event=health_status \
    --format '{{.Action}} {{.Actor.Attributes.name}}'
# what an apply that adds a person looks like
start vinci-daemon-carol-1
start vinci-sandbox-carol-1
health_status: healthy vinci-sandbox-carol-1
health_status: healthy vinci-daemon-carol-1
```

> [!NOTE]
> It shows only what happens from the moment you start it. Stop it with Ctrl-C.

## Watching it live

Three terminals are enough during an install or an upgrade: the events above, the logs below, and one where you run commands.

```sh title="every log, live, without the noise"
$ docker compose logs -f --tail 0 --no-color 2>&1 | sed 's/\x1b\[[0-9;]*m//g' \
    | grep --line-buffered -v 'GET /health' \
    | grep --line-buffered -E 'message:|WARN|ERROR|Firewall on|Registered tunnel|Waiting for|confines|onnected to'
hub-1              |   ├─ message: Users loaded
hub-1              |   ├─ message: Admins loaded
hub-1              |   ├─ message: Hub started
hub-1              |   └─ message: The global sync at start already ran for this version
daemon-alice-1     |   └─ message: Daemon stopped
daemon-alice-1     |   ├─ message: Daemon started
```

> [!NOTE]
> The `sed` removes colour codes; the first `grep` drops the provisioner's health checks, which are most of its log. For one person: `docker compose logs -f daemon-alice sandbox-alice`.

```sh title="the state, every few seconds"
$ watch -n 5 'bun deploy.ts status; docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}"'
template  daemon running (healthy)    sandbox running (healthy)    disk 0.0 GiB of 4.8 GiB, 0% of files
alice     daemon running (healthy)    sandbox running (healthy)    disk 0.0 GiB of 4.8 GiB, 0% of files
bob       daemon running (healthy)    sandbox running (healthy)    disk 0.0 GiB of 4.8 GiB, 0% of files
Server disk: 68.3 GiB free of 74.8 GiB
NAME                           MEM USAGE / LIMIT   CPU %
vinci-daemon-alice-1       84.39MiB / 512MiB   0.04%
vinci-daemon-bob-1         65.8MiB / 512MiB    0.04%
vinci-daemon-template-1    60.77MiB / 512MiB   0.02%
vinci-sandbox-alice-1      2.656MiB / 512MiB   0.00%
vinci-web-1                130.5MiB / 256MiB   0.00%
vinci-provisioner-1        61.89MiB / 256MiB   0.00%
vinci-caddy-1              11.34MiB / 256MiB   0.00%
vinci-firewall-1           31.92MiB / 128MiB   0.00%
vinci-hub-1                16.5MiB / 256MiB    0.10%
...
```

`bun deploy.ts status` exits non-zero when someone's daemon or sandbox is not healthy, a disk is full or missing, or the server has less than 10% free. An idle sandbox uses about 3 MiB; it grows while a bot runs commands.

In the browser, the admin panel's **Activity** page shows what admins read and changed, newest first; the hub keeps it in `hub/audit.sqlite`. See [Activity](admin.md#activity).

### Reading the common log lines

| Line | Means |
| --- | --- |
| `Hub started`, `Users loaded` `users: 2`, `template: true` | The hub read `hub/users.json`: two people plus the template. `template: false` after an upgrade means `apply` did not run. |
| `Admin call relayed to a private door` with `by:`, `user:`, `procedure:` | An admin's panel read or change went to that person's owner socket. |
| `Pairing grant issued through the hub` | A person's browser paired after login. |
| `The provisioner did not take the admin list yet; trying again` | Normal once while an apply or the nightly backup holds the lock. A problem only if it goes on for more than a minute. |
| `The global sync at start already ran for this version` | A restart on the same tag. After an upgrade you see a `global/sync` by `hub start` instead. |
| `The global sync at start ended` with `people`, `skipped`, `failed` | The copy after an upgrade is done. `failed: []` is the normal end; `skipped` counts people whose Vinci was stopped (their sections wait for **Sync now**). |
| `Request refused` … `502`, `did not answer /health` | Someone had the app open while their daemon restarted. Only a problem if it repeats once everything is healthy. |
| `Daemon stopped` then `Daemon started` | A restart: the nightly backup, an upgrade or an apply that changed the person. |
| `The sandbox connection closed; the next tool call connects again.` | The sandbox stopped (the nightly backup stops it too). Harmless if the next line is a start. |
| `Waiting for the firewall`, `The firewall confines this container after … ms` | A daemon or sandbox starting after a reboot. Normal. |
| `Firewall on (iptables-nft): …` | The firewall wrote its rules. |
| `Request refused` … `401` | A request without a login, or with one that ended (logged out, password changed or reset, 7 days). The browser goes back to the login page. |
| `Registered tunnel connection` (tunnel only) | cloudflared connected. It keeps 4; the count grows after reconnects. |
| `Could not decode sourcemap`, `The web app is reachable from your network` | Noise at start. `web` sits on an internal network only the hub can reach. |

## A person's world

Everything of one person is in two places on the server: their volume and their sandbox disk. Here is where each thing lives, for `alice`:

| What | On the server | In the daemon | In the sandbox |
| --- | --- | --- | --- |
| Database: bots, devices, settings, encrypted secrets | `vinci_data-alice` → `data/app.sqlite` | `/data/data/` | no |
| The key that decrypts the secrets | same, `data/credentials.key` | `/data/data/` | no |
| Conversations, routines, todos (one file per bot) | same, `data/bots/<botId>/runtime.sql` | `/data/data/bots/` | no |
| A bot's own MCP servers | same, `data/bots/<botId>/mcp.json` | `/data/data/bots/` | no |
| Model logins and keys | same, `pi/auth.json`; shared keys in `.env` | `/data/pi/` | no |
| Shared skills, instructions, MCP file | same, `home/.agents/` | `/data/home/.agents/` | read only |
| Bot folders: instructions file, skills, uploads | `disks/alice/agents/<botId>/` | `/data/agents/` | `/data/agents/` |
| The bots' home: what bots install | `disks/alice/bot-home/` | an empty folder | `/home/bot` |
| The owner socket (private door) | `vinci_ipc` → `alice/rpc.sock` | `/data/data/ipc/` | no |

```sh title="the mounts of a daemon and its sandbox"
$ for c in daemon sandbox; do echo "== $c"; docker inspect vinci-$c-alice-1 --format '{{range .Mounts}}{{.Type}} {{.Name}} -> {{.Destination}} rw={{.RW}}{{println}}{{end}}'; done
== daemon
volume vinci_data-alice -> /data rw=true
volume vinci_disk-alice -> /data/agents rw=true
tmpfs  -> /data/bot-home rw=false
volume vinci_sandbox-alice -> /run/sandbox rw=true
volume vinci_ipc -> /data/data/ipc rw=true
== sandbox
volume vinci_disk-alice -> /data/agents rw=true
volume vinci_disk-alice -> /home/bot rw=true
volume vinci_sandbox-alice -> /run/sandbox rw=false
volume vinci_data-alice -> /data/home/.agents rw=false
```

Both are locked down the same way: read-only system, no capabilities, user 1000, no published ports.

```sh title="hardening, one line each"
$ for c in daemon sandbox; do docker inspect vinci-$c-alice-1 --format "$c readonly={{.HostConfig.ReadonlyRootfs}} capdrop={{.HostConfig.CapDrop}} user={{.Config.User}} memory={{.HostConfig.Memory}} pids={{.HostConfig.PidsLimit}} ports={{json .HostConfig.PortBindings}}"; done
daemon readonly=true capdrop=[ALL] user=1000:1000 memory=536870912 pids=256 ports={}
sandbox readonly=true capdrop=[ALL] user=1000:1000 memory=536870912 pids=256 ports={}
```

### Looking at a bot's files

The safest way is from inside the person's sandbox: you see exactly what their bots see, as their user, and nothing of the database or keys.

```sh title="the bot folders, as the bots see them"
$ docker compose exec -T sandbox-alice sh -c 'id; echo HOME=$HOME; ls -la /data/agents; ls -A /home/bot'
uid=1000(bun) gid=1000(bun) groups=1000(bun)
HOME=/home/bot
drwx------ 2 bun bun 4096 Nov 14 21:55 4a0b93e6-…
drwx------ 2 bun bun 4096 Nov 14 21:51 c7912cef-…
.bash_logout
.bashrc
.gitconfig
.profile
```

> [!NOTE]
> The folder names are bot ids. In the admin panel, a bot's address ends with its id (`/admin/users/alice/bots/<botId>`). To read a person's chats, use the panel's **Conversations** tab: it is recorded in Activity. Never open `runtime.sql` by hand.

### Editing a bot's file by hand

A bot's instructions file (`AGENTS.md`) and its skills (`.pi/skills/<name>/SKILL.md`) are plain files in its folder. Edit them on the host as user 1000, so the daemon can still read them, and keep a copy first:

```sh title="edit one bot's instructions"
$ cd disks/alice/agents/<botId>
$ setpriv --reuid=1000 --regid=1000 --clear-groups cp AGENTS.md AGENTS.md.before
$ setpriv --reuid=1000 --regid=1000 --clear-groups nano AGENTS.md
```

The next message uses the new instructions; a skill shows up within about 30 seconds. Nothing needs a restart. Everything else (name, model, approval mode, secrets, MCP servers) goes through the admin panel. See [Set up bots, skills and tools](admin.md#set-up-bots-skills-and-tools-for-a-person).

> [!WARNING]
> **Do not put plugins or MCP files in a bot's folder.** A bot can write its own folder, so Vinci loads neither from there. Use the shared `home/.agents/` or the panel.
>
> **Do not edit `app.sqlite` or `runtime.sql`.** A hand edit skips the daemon's checks; one invalid value can break a person's whole bot list, and the daemon recovers chats, routines and approvals from `runtime.sql` on every start.
>
> **Do not delete `daemon.lock`.** It does not stop the daemon; it only lets a second process corrupt its files.
>
> **Do not edit `users.compose.yaml` or `hub/users.json`.** Apply rewrites them. Edit `users.yaml`, then run `bun deploy.ts apply`.

If you must change something only a stopped daemon allows, back the person up first: `bun deploy.ts backup alice`.

### What the sandbox can and cannot reach

| From a sandbox or daemon | Reachable |
| --- | --- |
| Public internet and DNS: model providers, web pages, MCP servers over https | Yes |
| The hub, web, provisioner, Caddy, the API, cloudflared | No |
| Other people's daemons and sandboxes, the template | No |
| Its own daemon, from the sandbox (only the shared socket) | No |
| The server itself (SSH, Docker's gateways), the metadata service, private ranges, IPv6 | No |
| An address listed in `VINCI_INTERNAL_ALLOW` | Yes, only that |

The sandbox has no database, no keys, no model keys and no owner socket. It does have every bot folder of that person, and the `env` values of MCP servers that run there. To prove the table on your server, run the two checks in [What a bot can do and reach](admin.md#what-a-bot-can-do-and-reach); healthy is `public: 200` and `blocked` for everything else.

```sh title="the firewall"
$ bun deploy.ts firewall status
Firewall: healthy. Last check: Firewall on: rules in place.
Last log line: 2026-11-14T15:12:20Z Firewall on (iptables-nft): daemons reach the internet and DNS, not internal addresses.
No check found a problem since the container started.
```

## Day to day

| Task | How | Details |
| --- | --- | --- |
| Add a person | Admin panel → **Add user**. By hand: a line in `users.yaml`, then `bun deploy.ts apply`. Watch two containers start in the events. | [Add a person](admin.md#add-a-person) |
| Disable or remove a person | Admin panel. Their container goes; their volume and disk stay until `bun deploy.ts purge <id>`. | [Remove a person](admin.md#remove-a-person) |
| Upgrade | Pull the new images, copy the deployment files, `bun deploy.ts nightly`, set `VINCI_TAG`, `docker compose up -d --wait`, `bun deploy.ts apply`. | [Upgrades](admin.md#upgrades) |
| Roll back | The old version's deployment files and tag, then the same two commands. Some versions need a restore: read the section first. | [Upgrades](admin.md#upgrades), last part |
| Restore one person | `bun deploy.ts restore alice backups/<time>`. It saves their current data first; nobody else stops. | [Restore one person](admin.md#restore-one-person) |
| Read the nightly result | `bun deploy.ts nightly status` | [Nightly backups](admin.md#nightly-backups) |
| A disk filling up | `bun deploy.ts status`; raise `SANDBOX_DISK` and apply. | [Disk limits](admin.md#disk-limits) |
| Something looks wrong | `docker compose ps`, `bun deploy.ts status`, the logs above. | [Troubleshooting](troubleshooting.md) |

```sh title="last night's backup"
$ bun deploy.ts nightly status
Last run: backups/2026-11-16T030005Z, started 12.0 h ago: ok
Tag b285c406, 3 workspaces, 0.3 MiB, took 15 s; longest stop alice 4.1 s, hub 2.2 s
Finished backups on this server: 3 (2026-11-14T151143Z to 2026-11-16T030005Z)
Off-site copy: off (no BACKUP_S3_BUCKET in .env)
$ ls backups/2026-11-16T030005Z
alice.tar.gz  bob.tar.gz  deployment.tar.gz  hub.tar.gz  manifest.json  template.tar.gz
```

> [!NOTE]
> Healthy is `ok` and a run less than a day old. Each backup holds every key of that person; `deployment.tar.gz` holds `.env`.

## Follow along during an install

The nine steps of [install.md](install.md), and what you should see appear on the server at each one. Keep the events and logs from sections 3 and 4 open from step 7 on.

| Step | What appears on the server | Look with |
| --- | --- | --- |
| [1. Check the server](install.md#1-check-the-server) | Nothing yet. `x86_64`, Ubuntu 24.04, `avx2`, 3.7 GiB or more, 40 GB free. | `free -h; df -h /` |
| [2. Install Docker](install.md#2-install-docker) | `/var/lib/docker` and `/var/lib/containerd`, the `docker` service enabled, three default networks (`bridge`, `host`, `none`). | `systemctl is-enabled docker; docker network ls` |
| [3. Get Vinci on](install.md#3-get-vinci-onto-the-server) | Seven `ghcr.io/meetvinci/vinci-*` images with your tag. `/opt/vinci` (mode 700) with the five shipped files and `.env` (mode 600). `/usr/local/bin/bun`. | `docker image ls; ls -la /opt/vinci; bun --version` |
| [4. Write the team list](install.md#4-write-the-team-list) | `users.yaml`. No container yet. | `ls -l users.yaml` (not `cat`: emails) |
| [5. Hostname](install.md#5-point-the-hostname-at-the-server) | Nothing on the server: a DNS record (or, with the tunnel, `cloudflare.env` on your computer, merged into `.env`). | `dig +short <host>` |
| [6. Login secrets](install.md#6-set-the-login-secrets) | `COMPOSE_FILE`, `VINCI_PUBLIC_HOST`, `API_INTERNAL_TOKEN` and `API_APP_KEY` in `.env`, still `600 root`. | `stat -c "%a %U" .env` |
| [7. Start Vinci](install.md#7-start-vinci) | In the events: firewall first, then Caddy, the API and PostgreSQL, web, each daemon and sandbox, then hub and provisioner. On disk: `users.compose.yaml`, `hub/` with `users.json`, `disks/<id>.img` and their mounts, `vinci-disks.service`. The hub then creates `admins.json`, `audit.sqlite`, `pins.json` as it reaches each daemon, and `global.json` once people follow Global settings. The Caddy and PostgreSQL images are pulled from Docker Hub the first time. Then `vinci:user` makes the first admin's login. | `docker compose ps; bun deploy.ts status; ls -la hub disks` |
| [8. Check it works](install.md#8-check-it-works) | On the first login: `Pairing grant issued through the hub` in the hub log. In the panel: Activity rows for each change you make in Global settings, and `Admin call relayed to a private door` lines in the hub log. | The live log filter |
| [9. Nightly backups](install.md#9-turn-on-nightly-backups) | The two backup units, then one run: each person's daemon and sandbox stop and start in turn (watch the events), the hub stops for about 2 seconds, and a folder `backups/<time>/` with `nightly.json` beside it. | `bun deploy.ts nightly status` |

## Cheat sheet

```sh title="on the server, in /opt/vinci"
docker compose ps                                  # every container and its health
bun deploy.ts status                               # each person's daemon, sandbox and disk; free space
docker stats --no-stream                           # memory and CPU
bun deploy.ts firewall status                      # the firewall's health
bun deploy.ts nightly status                       # last night's backup
docker compose logs -f daemon-<id> sandbox-<id>    # one person, live
docker compose logs hub --since 1h                 # logins, pairing, admin actions
df -h disks/*/                                     # how full each sandbox disk is
docker system df                                   # images, containers, volumes
docker compose exec -T sandbox-<id> ls -la /data/agents   # bot folders, as the bots see them
docker inspect vinci-hub-1 --format '{{.Config.Image}}'   # the running tag, without opening .env

bun deploy.ts apply                                # after editing users.yaml or .env
bun deploy.ts backup <id>                          # before any risky change
```

---

Outputs were read on 16 November 2026 between 14:30 and 15:10 UTC from a live install of 14 November 2026 with two people and the template, using read-only commands only. The add-a-person lines in section 3 show the format of those events; no person was added for this page. People's names, emails, bot ids and the hostname are replaced.
