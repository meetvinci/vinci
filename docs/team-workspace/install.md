# Install

Set up a server for one team, from a fresh Ubuntu server to a logged-in person. Do the steps in order. Each step ends with a prompt you can paste to an AI coding agent that has SSH access to the server.

## Before you start

You need:

- **A server.** Ubuntu 24.04 on x86 (amd64), with root SSH access. It must run Docker Engine directly on Linux (step 2). Keeping each person's Orbs away from the others relies on Docker Engine's own network rules; OrbStack and other Mac or Windows Docker apps do not enforce them, so never run a team there.
  - Memory: 4 GB for up to about 5 people, 8 GB for up to about 12.
  - Disk: at least 40 GB. Docker images and build caches grow quickly.
  - The CPU must support AVX2. Most current servers do.
- **A domain on Cloudflare**, for example `example.com`. The team gets one name under it, for example `acme.example.com`.
- **A Cloudflare API token** with these permissions:
  - Account: Cloudflare Tunnel: Edit
  - Account: Access: Apps and Policies: Edit
  - Zone: DNS: Edit, for your domain

  Nothing else is needed. The setup uses no Access service tokens.
- **Bun, Docker and a checkout of this repository** on the computer you set up from. Images are built there, and the Cloudflare commands run there, not on the server.
- **The team's email addresses.** Only these people can log in.
- **A model API key** per person (Anthropic, OpenAI or another provider), unless people will add their own.

Keep the API token and model keys in a password manager. Never paste them into a chat.

## 1. Check the server

```sh
grep -m1 -o avx2 /proc/cpuinfo    # must print: avx2
lsb_release -d                    # Ubuntu 24.04
free -h                           # memory
```

**Give this to your agent:**

> SSH to `root@<server>` and check that it is Ubuntu 24.04 on x86 with AVX2, at least 4 GB of memory and 40 GB of free disk. Report what you find. Change nothing.

## 2. Install Docker

```sh
curl -fsSL https://get.docker.com | sh
docker version    # Docker 26 or newer
```

Docker starts on boot after this.

**Give this to your agent:**

> SSH to `root@<server>`, install Docker with the official script from get.docker.com, and confirm `docker version` shows 26 or newer and that the docker service is enabled at boot.

## 3. Get Orbs onto the server

Build the images on your own computer, not on the server: building needs a lot of memory and disk. From a checkout of the Orbs repository, pick a tag (for example the release version) and send the images over SSH:

```sh
bun run build:images --tag v0.2.0
docker save orbs-daemon:v0.2.0 orbs-web:v0.2.0 orbs-hub:v0.2.0 | gzip | ssh root@<server> 'gunzip | docker load'
```

Then copy the deployment files into `/opt/orbs`. Only the first time, also copy the settings template as `.env`:

```sh
ssh root@<server> 'install -d -m 700 /opt/orbs'
scp deploy/compose/compose.yaml deploy/compose/daemon.yaml deploy/cloudflare/cloudflared.compose.yaml scripts/deploy.ts root@<server>:/opt/orbs/
scp deploy/.env.example root@<server>:/opt/orbs/.env
ssh root@<server> 'chmod 600 /opt/orbs/.env'
```

The deploy commands need Bun on the server. Take it from the image you just loaded, so it matches:

```sh
ssh root@<server> 'docker run --rm --entrypoint cat orbs-daemon:v0.2.0 /usr/local/bin/bun > /usr/local/bin/bun && chmod 755 /usr/local/bin/bun && bun --version'
```

**Give this to your agent:**

> From my Orbs checkout, build the images with `bun run build:images --tag <tag>` and load them on `root@<server>` with `docker save orbs-daemon:<tag> orbs-web:<tag> orbs-hub:<tag> | gzip | ssh root@<server> 'gunzip | docker load'`. Create `/opt/orbs` (mode 700), copy `deploy/compose/compose.yaml`, `deploy/compose/daemon.yaml`, `deploy/cloudflare/cloudflared.compose.yaml` and `scripts/deploy.ts` into it, and, only if `/opt/orbs/.env` does not exist yet, copy `deploy/.env.example` there as `.env` with mode 600. Install Bun from the image: `docker run --rm --entrypoint cat orbs-daemon:<tag> /usr/local/bin/bun > /usr/local/bin/bun && chmod 755 /usr/local/bin/bun`. Confirm `docker images` shows the three images.

## 4. Write the team list

`/opt/orbs/users.yaml` is the one list of people. It decides who can log in at Cloudflare and who gets their own Orbs. One line per person: a short user id (lowercase letters, digits and dashes) and their login email.

```sh
ssh root@<server> 'cat > /opt/orbs/users.yaml' <<'LIST'
users:
  alice: alice@example.com
  bob: bob@example.com
LIST
```

**Give this to your agent:**

> Write `/opt/orbs/users.yaml` on `root@<server>` with `users:` and one `<id>: <email>` line for each of `<people>`. Ids are short, lowercase letters, digits and dashes, and each email appears once.

## 5. Create the Cloudflare objects

One command creates everything the team needs in Cloudflare. Run it on your computer, in the repository:

```sh
ssh root@<server> cat /opt/orbs/users.yaml | \
  CLOUDFLARE_API_TOKEN="$(op read 'op://<vault>/<item>/credential')" \
  bun scripts/deploy.ts cloudflare apply \
  --zone example.com --hostname acme.example.com --name orbs-acme \
  --users - --env-out cloudflare.env
```

- `--name` must start with `orbs-`. Every object gets this exact name, or this name and a suffix. The script only ever changes or deletes objects with these names.
- `--users -` reads the team list from step 4, piped from the server. Its emails are the people allowed to log in. A local copy of `users.yaml` works too.
- `--env-out` writes the values the server needs, including the secret tunnel token, to a file only you can read.
- `--session 24h` is the default login length. Longer sessions (for example `168h`, a week) mean fewer email codes on phones, but a lost or shared device stays logged in for that long. Removing someone from `users.yaml` still locks them out of Orbs within a second.
- Optional SSH through the tunnel: add `--ssh-hostname acme-ssh.example.com --ssh-email <admin email>` (repeat `--ssh-email` for a second admin).

What it creates, in this order:

1. **A tunnel** `orbs-acme`. Its routes live in Cloudflare: the team name goes to the hub, `http://hub:47192`.
2. **Access policies:** `orbs-acme-allow` (the team's emails) and `orbs-acme-bypass` (everyone).
3. **Access applications:** `orbs-acme` on `acme.example.com` with the allow policy, and `orbs-acme-favicon` on `/img/favicon/*` and `/favicon.ico` with the bypass policy, so adding Orbs to a home screen works. These files hold nothing secret.
4. **DNS:** `acme.example.com`, proxied, to the tunnel. It comes last, so the name is never reachable without the login.

It prints the values for the server:

```text
ORBS_PUBLIC_HOST=acme.example.com
ACCESS_TEAM_DOMAIN=https://<your-team>.cloudflareaccess.com
ACCESS_AUD=<64 hex characters>
Wrote these values and TUNNEL_TOKEN to cloudflare.env (mode 600).
```

Running it again is safe: it prints `unchanged` for what is already right and fixes what is not. It refuses to touch an Access application or DNS record on these names that it did not create.

**Give this to your agent:**

> In the Orbs repository, run `ssh root@<server> cat /opt/orbs/users.yaml | bun scripts/deploy.ts cloudflare apply --zone <domain> --hostname <team>.<domain> --name orbs-<team> --users - --env-out cloudflare.env` with `CLOUDFLARE_API_TOKEN` read from `<where you keep it>` inside the same command. Don't print the token and don't save it anywhere. Show me the output, except the token.

## 6. Put the tunnel token on the server

The tunnel connector, cloudflared, runs as a container next to the hub; the Compose file starts it. It needs only the values from `cloudflare.env`, in `/opt/orbs/.env`. This command merges them into that file, keeps its other lines, keeps it readable by root only, and then deletes the local copy:

```sh
ssh root@<server> 'umask 077 && cd /opt/orbs && { grep -v -E "^(ORBS_PUBLIC_HOST|ACCESS_TEAM_DOMAIN|ACCESS_AUD|TUNNEL_TOKEN)=" .env 2>/dev/null || true; cat; } > .env.new && mv .env.new .env' < cloudflare.env && rm cloudflare.env
```

The token lets anyone run a connector for this tunnel. Treat it like a password.

After Orbs starts (next step), `docker compose logs cloudflared` shows four `Registered tunnel connection` lines.

**Give this to your agent:**

> Merge `cloudflare.env` into `/opt/orbs/.env` on `root@<server>` with the command in step 6 of the install guide, then delete `cloudflare.env`. Confirm `/opt/orbs/.env` is mode 600 and owned by root. Don't print the file.

### Optional: SSH through the tunnel

If you used `--ssh-hostname`, you can close port 22 in the server's firewall and still reach the server. On your computer:

```sh
brew install cloudflared
printf 'Host acme-ssh.example.com\n  User root\n  ProxyCommand %s access ssh --hostname %%h\n' "$(command -v cloudflared)" >> ~/.ssh/config
ssh acme-ssh.example.com
```

The first time, a browser opens for the Cloudflare login. Keep another way in before closing port 22, such as your provider's web console.

**Give this to your agent:**

> Add an SSH config entry on this computer for `<team>-ssh.<domain>` that uses `cloudflared access ssh` as its ProxyCommand, and tell me to run `ssh <team>-ssh.<domain>` so I can log in in the browser. Don't change the server's firewall.

## 7. Start Orbs

Fill in the rest of `/opt/orbs/.env` on the server: `ORBS_TAG` (the tag from step 3) and the model keys you want to share. Step 6 already filled in the Cloudflare block at the end. Every setting is explained in the file and in [configuration](configuration.md).

Start everything:

```sh
cd /opt/orbs
bun deploy.ts apply
```

This writes the per-person files from `users.yaml`, then starts the hub, the web app, cloudflared and one container per person, and waits until all are healthy. Every container restarts on its own after a crash or a reboot. Nothing listens on the server's network: only cloudflared connects out.

```sh
docker compose ps
```

should list `orbs-hub-1`, `orbs-web-1`, `orbs-cloudflared-1` and one `orbs-daemon-<id>-1` per person, all healthy.

**Give this to your agent:**

> On `root@<server>`, in `/opt/orbs`: set `ORBS_TAG=<tag>` and the model keys from `<where you keep them>` in `.env`, without printing secrets and without touching the Cloudflare block. Run `bun deploy.ts apply`, then confirm with `docker compose ps` that every container is healthy, that `docker compose logs hub` shows "Users loaded" with the right count and no error, and that `docker compose logs cloudflared` shows `Registered tunnel connection`.

## 8. Check it works

From any computer, without logging in:

```sh
curl -s -o /dev/null -w '%{http_code}\n' https://acme.example.com/rpc          # 302: the Cloudflare login
curl -s -o /dev/null -w '%{http_code}\n' https://acme.example.com/favicon.ico  # 200: no login needed
```

1. Open `https://<team>.<domain>` in a private browser window. You should see the Cloudflare login.
2. Log in with a team email and the code you get by email.
3. Orbs opens and shows that person's bots. The browser pairs itself; there is no PIN and no device name to type.
4. Open `https://<team>.<domain>` from a computer whose email is not on the list. Cloudflare should refuse it.

**Give this to your agent:**

> On `root@<server>`, in `/opt/orbs`, check the Orbs install: `docker compose ps` shows every container healthy, `docker compose logs hub --since 10m` has no error, and `ss -tlnp` shows no Orbs or Docker port listening on a public address. Then tell me to open `https://<team>.<domain>` in a private window and log in.

## Next

[Admin tasks](admin.md): add and remove people, model keys, backups and upgrades.
