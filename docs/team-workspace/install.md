# Install

Set up a server for one team, from a fresh Ubuntu server to a logged-in person. Do the steps in order. Each step ends with a prompt you can paste to an AI coding agent that has SSH access to the server and a checkout of this repository.

An agent can also do the whole install at once: see [the whole install in one prompt](#the-whole-install-in-one-prompt) at the end. Agents working in this repository have the `orbs-deploy` skill with the same procedure.

## Before you start

You need:

- **A server.** Ubuntu 24.04 on x86 (amd64), with root SSH access. It must run Docker Engine directly on Linux (step 2). Keeping each person's Orbs away from the others relies on Docker Engine's own network rules; OrbStack and other Mac or Windows Docker apps do not enforce them, so never run a team there.
  - Memory: 4 GB for up to 6 people, 8 GB for up to about 14. A "4 GB" server shows about 3.7 GiB in `free -h`; that is enough.
  - Disk: at least 40 GB.
  - The CPU must support AVX2. Most current servers do.
- **A domain on Cloudflare**, for example `example.com`. The team gets one name under it, for example `acme.example.com`.
- **A Cloudflare API token** with these permissions:
  - Account: Cloudflare Tunnel: Edit
  - Account: Access: Apps and Policies: Edit
  - Zone: DNS: Edit, for your domain

  Nothing else is needed. The setup uses no Access service tokens.
- **Bun, Docker and a checkout of this repository** on the computer you set up from. Images are built there, and the Cloudflare commands run there, not on the server. You don't need `bun install` for the install itself.
- **The team's email addresses.** Only these people can log in.
- **A model API key** per person (Anthropic, OpenAI or another provider), unless people will add their own.

Keep the API token and model keys in a password manager. Never paste them into a chat.

The examples write `ssh root@<server>`. If you reach the server with a key file or other options, use them in every `ssh` and `scp` command, for example `ssh -i ~/.ssh/id_ed25519 -o IdentitiesOnly=yes root@<server>`.

## 1. Check the server

```sh
ssh root@<server> 'uname -m; lsb_release -d; grep -m1 -o avx2 /proc/cpuinfo; free -h | sed -n 2p; df -h / | tail -1'
```

Expected: `x86_64`, `Ubuntu 24.04…`, `avx2`, a total memory of at least 3.7Gi, and at least 40G available. If `avx2` is missing, the images cannot run on this server.

**Give this to your agent:**

> SSH to `root@<server>` and run `uname -m; lsb_release -d; grep -m1 -o avx2 /proc/cpuinfo; free -h; df -h /`. Confirm it is `x86_64`, Ubuntu 24.04, prints `avx2`, has at least 3.7 GiB of memory in total and 40 GB of free disk. Report what you find. Change nothing.

## 2. Install Docker

```sh
ssh root@<server> 'curl -fsSL https://get.docker.com | sh > /root/docker-install.log 2>&1; docker version --format "{{.Server.Version}}"; docker compose version; systemctl is-enabled docker'
```

Expected: a Docker version of 26 or newer, `Docker Compose version v2…` or newer, and `enabled`. Docker starts on boot after this.

**Give this to your agent:**

> SSH to `root@<server>` and install Docker with `curl -fsSL https://get.docker.com | sh`. Confirm `docker version` shows a server version of 26 or newer, `docker compose version` works, and `systemctl is-enabled docker` prints `enabled`.

## 3. Get Orbs onto the server

Build the images on your own computer, not on the server: building needs a lot of memory and disk. In your checkout of the Orbs repository, choose a tag. Any name works; the short commit is a good one:

```sh
TAG=$(git rev-parse --short HEAD)
bun run build:images --tag $TAG
docker image inspect orbs-daemon:$TAG orbs-web:$TAG orbs-hub:$TAG --format '{{.RepoTags}} {{.Architecture}}'
```

The last command must print `amd64` three times. The build makes amd64 images even on an Apple Silicon Mac. Then send them over SSH:

```sh
docker save orbs-daemon:$TAG orbs-web:$TAG orbs-hub:$TAG | gzip | ssh root@<server> 'gunzip | docker load'
```

Expected: three `Loaded image:` lines. It takes about a minute on a home connection (about 180 MB).

Copy the deployment files into `/opt/orbs`. Only the first time, also copy the settings template as `.env`:

```sh
ssh root@<server> 'install -d -m 700 /opt/orbs'
scp deploy/compose/compose.yaml deploy/compose/daemon.yaml deploy/cloudflare/cloudflared.compose.yaml scripts/deploy.ts root@<server>:/opt/orbs/
ssh root@<server> 'test -e /opt/orbs/.env' || { scp deploy/.env.example root@<server>:/opt/orbs/.env && ssh root@<server> 'chmod 600 /opt/orbs/.env'; }
```

The deploy commands need Bun on the server. Take it from the image you just loaded, so it matches:

```sh
ssh root@<server> "docker run --rm --entrypoint cat orbs-daemon:$TAG /usr/local/bin/bun > /usr/local/bin/bun && chmod 755 /usr/local/bin/bun && bun --version"
```

Expected: a Bun version such as `1.4.2`.

**Give this to your agent:**

> In my Orbs checkout, set `TAG=$(git rev-parse --short HEAD)`, run `bun run build:images --tag $TAG`, and confirm `docker image inspect` shows `amd64` for `orbs-daemon:$TAG`, `orbs-web:$TAG` and `orbs-hub:$TAG`. Load them on `root@<server>` with `docker save orbs-daemon:$TAG orbs-web:$TAG orbs-hub:$TAG | gzip | ssh root@<server> 'gunzip | docker load'`. Create `/opt/orbs` (mode 700) and copy `deploy/compose/compose.yaml`, `deploy/compose/daemon.yaml`, `deploy/cloudflare/cloudflared.compose.yaml` and `scripts/deploy.ts` into it. Only if `/opt/orbs/.env` does not exist yet, copy `deploy/.env.example` there as `.env` with mode 600. Install Bun from the image: `docker run --rm --entrypoint cat orbs-daemon:$TAG /usr/local/bin/bun > /usr/local/bin/bun && chmod 755 /usr/local/bin/bun`. Report the tag, `bun --version` on the server, and `docker images`.

## 4. Write the team list

`/opt/orbs/users.yaml` is the one list of people. It decides who can log in at Cloudflare and who gets their own Orbs. One line per person: a short user id and their login email. The id names the person's container and volume and cannot be changed later; use lowercase letters, digits and dashes.

```sh
ssh root@<server> 'cat > /opt/orbs/users.yaml' <<'LIST'
users:
  alice: alice@example.com
  bob: bob@example.com
LIST
```

**Give this to your agent:**

> Write `/opt/orbs/users.yaml` on `root@<server>` with `users:` and one `  <id>: <email>` line for each of `<people>`. Ids are short, lowercase letters, digits and dashes, and each email appears once. Don't print the emails anywhere public.

## 5. Create the Cloudflare objects

One command creates everything the team needs in Cloudflare. Run it on your computer, in the repository. Read the token from your password manager inside the same command, for example with 1Password's `op read`:

```sh
ssh root@<server> cat /opt/orbs/users.yaml | \
  CLOUDFLARE_API_TOKEN="$(op read 'op://<vault>/<item>/credential')" \
  bun scripts/deploy.ts cloudflare apply \
  --zone example.com --hostname acme.example.com --name orbs-acme \
  --users - --env-out cloudflare.env
```

- `--name` must start with `orbs-`. Every object gets this exact name, or this name and a suffix. The script only ever changes or deletes objects with these names.
- `--users -` reads the team list from step 4, piped from the server. Its emails are the people allowed to log in.
- `--env-out` writes the values the server needs, including the secret tunnel token, to a file only you can read. Git ignores `cloudflare.env`.
- `--session 24h` is the default login length. Longer sessions (for example `168h`, a week) mean fewer email codes on phones, but a lost or shared device stays logged in for that long. Removing someone from `users.yaml` still locks them out of Orbs within a second.
- Optional SSH through the tunnel: add `--ssh-hostname acme-ssh.example.com --ssh-email <admin email>` (repeat `--ssh-email` for a second admin).

Expected output on the first run:

```text
Tunnel orbs-acme: created
Access policy orbs-acme-bypass: created
Access policy orbs-acme-allow: created
Access app orbs-acme-favicon: created
Access app orbs-acme: created
Tunnel routes: updated
DNS acme.example.com: created

Tunnel orbs-acme: <tunnel id>
ORBS_PUBLIC_HOST=acme.example.com
ACCESS_TEAM_DOMAIN=https://<your-team>.cloudflareaccess.com
ACCESS_AUD=<64 hex characters>
Wrote these values and TUNNEL_TOKEN to cloudflare.env (mode 600).
```

The lines may come in a different order, and with SSH there are also `orbs-acme-ssh-allow`, `orbs-acme-ssh` and a second DNS line. The DNS record always comes last, so the name is never reachable without the login.

If it differs:

- `CLOUDFLARE_API_TOKEN is unset or empty`: the password manager read failed (for example 1Password is locked and printed `authorization timeout`). Unlock it and run the command again.
- `The token cannot see the zone`: the token lacks Zone: DNS: Edit for this domain.
- `The Access app … already covers …` or `The DNS record … was not created by this script`: something else already uses this hostname. Choose another hostname, or remove that object by hand if you are sure it is unused. The script never touches it.

Running it again is safe: it prints `unchanged` for what is already right and fixes what is not.

**Give this to your agent:**

> In my Orbs repository, run `ssh root@<server> cat /opt/orbs/users.yaml | CLOUDFLARE_API_TOKEN="$(op read '<token reference>')" bun scripts/deploy.ts cloudflare apply --zone <domain> --hostname <team>.<domain> --name orbs-<team> --users - --env-out cloudflare.env`, reading the token inside the same command. Don't print the token and don't save it anywhere. If it says the token is empty, ask me to unlock my password manager and run it again. Show me the output, with the emails hidden.

## 6. Put the tunnel token on the server

The tunnel connector, cloudflared, runs as a container next to the hub; the Compose file starts it. It needs only the values from `cloudflare.env`, in `/opt/orbs/.env`. This command merges them into that file, keeps its other lines, keeps it readable by root only, and then deletes the local copy:

```sh
ssh root@<server> 'umask 077 && cd /opt/orbs && { grep -v -E "^(ORBS_PUBLIC_HOST|ACCESS_TEAM_DOMAIN|ACCESS_AUD|TUNNEL_TOKEN)=" .env 2>/dev/null || true; cat; } > .env.new && mv .env.new .env' < cloudflare.env && rm cloudflare.env
ssh root@<server> 'stat -c "%a %U" /opt/orbs/.env; grep -c -E "^(ORBS_PUBLIC_HOST|ACCESS_TEAM_DOMAIN|ACCESS_AUD|TUNNEL_TOKEN)=." /opt/orbs/.env'
```

Expected: `600 root` and `4`.

The token lets anyone run a connector for this tunnel. Treat it like a password.

**Give this to your agent:**

> Merge `cloudflare.env` into `/opt/orbs/.env` on `root@<server>` with the merge command in step 6 of `docs/team-workspace/install.md`, then delete the local `cloudflare.env`. Confirm `stat -c "%a %U" /opt/orbs/.env` prints `600 root` and that the four Cloudflare lines have values. Don't print the file.

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

Set the image tag from step 3 and the model keys you want to share in `/opt/orbs/.env`. Never print the file: it holds secrets.

```sh
ssh root@<server> "sed -i 's/^ORBS_TAG=.*/ORBS_TAG=$TAG/' /opt/orbs/.env"
```

Write each model key the same way, for example `ANTHROPIC_API_KEY=`, reading it from your password manager inside the command. Leave a key empty to skip that provider. Without any key, people add their own in **Settings → Providers** on their first visit. Every setting is explained in the file and in [configuration](configuration.md).

Start everything:

```sh
ssh root@<server> 'cd /opt/orbs && bun deploy.ts apply'
```

This writes the per-person files from `users.yaml`, then starts the web app, cloudflared and one container per person, then the hub, and waits until all are healthy. It takes about 15 seconds and ends with `Applied 2 users: alice, bob`. Every container restarts on its own after a crash or a reboot. Nothing listens on the server's network: only cloudflared connects out.

Check it:

```sh
ssh root@<server> 'cd /opt/orbs && docker compose ps --format "{{.Name}} {{.Status}}" && docker compose logs cloudflared | grep -c "Registered tunnel connection"'
```

Expected: `orbs-hub-1`, `orbs-web-1`, `orbs-cloudflared-1` and one `orbs-daemon-<id>-1` per person, each `Up … (healthy)`, then `4` or more (cloudflared keeps 4 connections; the count grows after restarts).

If it differs:

- `pull access denied for orbs-daemon`: the tag in `.env` is not loaded on the server. Check `docker images` and step 3.
- `set ACCESS_AUD in .env` or a similar message: step 6 did not merge the Cloudflare values.
- cloudflared unhealthy or no `Registered tunnel connection` line: check `docker compose logs cloudflared` for a token error, and run step 5 and 6 again.

**Give this to your agent:**

> On `root@<server>`, in `/opt/orbs`: set `ORBS_TAG=<tag>` in `.env`, and the model keys from `<where you keep them>` without printing secrets and without touching the Cloudflare block. Run `bun deploy.ts apply`. Confirm `docker compose ps` shows the hub, web, cloudflared and one `orbs-daemon-<id>-1` per person in `users.yaml`, all healthy, and that `docker compose logs cloudflared` has at least 4 `Registered tunnel connection` lines.

## 8. Check it works

From any computer, without logging in:

```sh
curl -s -o /dev/null -w '%{http_code}\n' https://acme.example.com/rpc          # 302: the Cloudflare login
curl -s -o /dev/null -w '%{http_code}\n' https://acme.example.com/favicon.ico  # 200: no login needed
curl -s -o /dev/null -w '%{http_code}\n' https://acme.example.com/img/favicon/site.webmanifest  # 200: the home-screen app manifest
```

On the server, nothing of Orbs or Docker listens on a network address, and one person's Orbs cannot reach another's:

```sh
ssh root@<server> 'ss -tlnp'
ssh root@<server> 'cd /opt/orbs && ids=$(docker compose ps --format "{{.Service}}" | sed -n "s/^daemon-//p"); for a in $ids; do for b in $ids; do [ $a = $b ] && continue; ip=$(docker inspect -f "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}" orbs-daemon-$b-1); printf "%s -> %s: " $a $b; docker exec orbs-daemon-$a-1 bun -e "fetch(\"http://$ip:47191/health\",{signal:AbortSignal.timeout(3000)}).then(()=>console.log(\"REACHABLE: not isolated\"),()=>console.log(\"blocked\"))" 2>/dev/null; done; printf "hub -> %s: " $a; docker exec orbs-hub-1 bun -e "fetch(\"http://daemon-$a:47191/health\").then(r=>console.log(r.status),e=>console.log(\"unreachable\"))" 2>/dev/null; done'
```

Expected: `ss` lists only sshd on port 22 and the local resolver on 127.0.0.53 and 127.0.0.54. Every `a -> b` line says `blocked`, and every `hub -> a` line says `200`. With only one person there is nothing to compare; it prints just the hub line.

Then log in:

1. Open `https://<team>.<domain>` in a private browser window. You should see the Cloudflare login.
2. Log in with a team email and the code you get by email.
3. Orbs opens for that person. The browser pairs itself; there is no PIN and no device name to type. On the first visit Orbs asks the person to set up a model provider unless the admin set a shared key.
4. Try an email that is not on the list. Cloudflare should not send it a code.

**Give this to your agent:**

> Check the Orbs install on `root@<server>`, in `/opt/orbs`: run the three `curl` checks in step 8 of `docs/team-workspace/install.md` from this computer (302, 200, 200), confirm `docker compose ps` shows every container healthy, that `ss -tlnp` shows nothing but sshd and the local resolver, and run the isolation check from step 8: every daemon-to-daemon line must say `blocked` and every hub line `200`. Then tell me to open `https://<team>.<domain>` in a private window and log in.

## The whole install in one prompt

Fill in the angle brackets and paste:

> Install Orbs for my team by following `docs/team-workspace/install.md` in my Orbs checkout, steps 1 to 8 in order, and stop at the first step whose check fails. Server: `root@<server>` (`<ssh options, if any>`). Cloudflare zone `<domain>`, team hostname `<team>.<domain>`, object name `orbs-<team>`. The Cloudflare API token is at `<op://… or where it is>`: read it inside the command that needs it, never print or save it. People (id: email): `<id>: <email>, …`. Model keys: `<where they are, or "none, people add their own">`. Never print secrets or emails in public places. Finish with the step 8 checks and tell me the address to log in at.

## Next

[Admin tasks](admin.md): add and remove people, model keys, backups and upgrades.
