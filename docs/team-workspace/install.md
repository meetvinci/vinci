# Install

Set up a server for one team, or for just you, from a fresh Ubuntu server to a logged-in person. Do the steps in order. Each step ends with a prompt you can paste to an AI coding agent that has SSH access to the server and a checkout of this repository.

An agent can also do the whole install at once: see [the whole install in one prompt](#the-whole-install-in-one-prompt) at the end. Agents working in this repository have the `vinci-deploy` skill with the same procedure.

## Before you start

You need:

- **A server.** Ubuntu 24.04 on x86 (amd64), with root SSH access. It must run Docker Engine directly on Linux (step 2). Keeping each person's Vinci away from the others relies on Docker Engine's own network rules; OrbStack and other Mac or Windows Docker apps do not enforce them, so never run a team there.
  - Memory: 4 GB for up to 5 people, 8 GB for up to about 13. The server also runs one workspace for the global settings, sized like a person. A "4 GB" server shows about 3.7 GiB in `free -h`; that is enough. MCP servers that run a command (`npx`, `uvx`) cost more: each bot runs its own copy from the moment its person's Vinci starts, about 150 MiB per bot for one `npx` and one `uvx` server. With such servers in Global settings, plan 4 GB for about 3 people with two bots each ([what a bot can reach](admin.md#what-a-bot-can-do-and-reach)).
  - Disk: at least 40 GB.
  - The CPU must support AVX2. Most current servers do.
- **A domain on Cloudflare**, for example `example.com`. The team gets one name under it, for example `acme.example.com`.
- **A Cloudflare API token** with these permissions:
  - Account: Cloudflare Tunnel: Edit
  - Account: Access: Apps and Policies: Edit
  - Zone: DNS: Edit, for your domain

  Nothing else is needed. The setup uses no Access service tokens.
- **Bun, Docker and a checkout of this repository** on the computer you set up from. Images are built there, and the Cloudflare commands run there, not on the server. You don't need `bun install` for the install itself.
- **The team's email addresses.** Only these people get into Vinci. If they all have an address at your company's domain, Cloudflare can let in that whole domain (step 5), so adding someone later needs no Cloudflare change.
- **A model API key** per person (Anthropic, OpenAI or another provider), unless you make people advanced users who add their own.

Keep the API token and model keys in a password manager. Never paste them into a chat.

The examples write `ssh root@<server>`. If you reach the server with a key file or other options, put them in `~/.ssh/config` under a `Host` entry and use that name for `<server>` in every `ssh` and `scp` command. Don't keep the options in a shell variable: zsh passes `$SSH` as one word and the command fails with `no such file or directory`.

```text
Host vinci-server
  HostName 203.0.113.10
  User root
  IdentityFile ~/.ssh/id_ed25519
  IdentitiesOnly yes
```

## 1. Check the server

```sh
ssh root@<server> 'uname -m; lsb_release -d; grep -m1 -o avx2 /proc/cpuinfo; free -h | sed -n 2p; df -h / | tail -1'
```

Expected: `x86_64`, `Ubuntu 24.04…`, `avx2`, a total memory of at least 3.7Gi, and at least 40G available. If `avx2` is missing, the images cannot run on this server.

Once Bun is on the server (step 3), `bun deploy.ts check` in `/opt/vinci` runs the same checks and says `ok`, `warning` or `failed` for each. A later Ubuntu than 24.04, or 30 to 40 GB free, is a `warning`: enough for a test server (a 40 GB disk shows about 35 GB free), not for a team's production install. Less memory, less disk, no AVX2 or another system `failed`, and the command exits non-zero.

**Give this to your agent:**

> SSH to `root@<server>` and run `uname -m; lsb_release -d; grep -m1 -o avx2 /proc/cpuinfo; free -h; df -h /`. Confirm it is `x86_64`, Ubuntu 24.04, prints `avx2`, has at least 3.7 GiB of memory in total and 40 GB of free disk. Report what you find. Change nothing.

## 2. Install Docker

```sh
ssh root@<server> 'curl -fsSL https://get.docker.com | sh > /root/docker-install.log 2>&1; docker version --format "{{.Server.Version}}"; docker compose version; systemctl is-enabled docker; iptables --version'
```

Expected: Docker 26 or newer, Compose 2.23.1 or newer, `enabled`, and an `iptables` version ending with `(nf_tables)`, as on Ubuntu 22.04 or later. Docker starts on boot after this. With `(legacy)`, Vinci's firewall cannot work and `apply` refuses to start anyone's Vinci: use another server.

**Give this to your agent:**

> SSH to `root@<server>` and install Docker with `curl -fsSL https://get.docker.com | sh`. Confirm `docker version` shows a server version of 26 or newer, `docker compose version` works, `systemctl is-enabled docker` prints `enabled`, and `iptables --version` ends with `(nf_tables)` (stop and tell me if it says `(legacy)`; don't run `iptables-legacy`).

## 3. Get Vinci onto the server

Vinci's images are public on GitHub Container Registry as `ghcr.io/meetvinci/vinci-<image>`, built for amd64 and arm64 ([images from CI](admin.md#images-from-ci)). The server pulls them without logging in. Choose a tag: a release such as `v0.2.0` (`gh release list` in the Vinci repository lists them; releases before the move to GitHub Container Registry, up to `v0.1.7`, are only in the old private registry), `main` for the latest commit on main, or the full commit of a build:

```sh
TAG=v0.2.0
```

Pull the images:

```sh
ssh root@<server> "for image in daemon sandbox web hub provisioner firewall api; do docker pull -q ghcr.io/meetvinci/vinci-\$image:$TAG; done"
```

Expected: seven lines `ghcr.io/meetvinci/vinci-<image>:<tag>`. It downloads about 600 MB the first time.

Copy the deployment files into `/opt/vinci`, from a checkout of the same tag (`git checkout $TAG`). Only the first time, also copy the settings template as `.env`; it already points `VINCI_REGISTRY` at `ghcr.io/meetvinci/`:

```sh
ssh root@<server> 'install -d -m 700 /opt/vinci'
scp deploy/compose/compose.yaml deploy/compose/daemon.yaml deploy/compose/sandbox.yaml deploy/cloudflare/cloudflared.compose.yaml scripts/deploy.ts root@<server>:/opt/vinci/
ssh root@<server> 'test -e /opt/vinci/.env' || { scp deploy/.env.example root@<server>:/opt/vinci/.env && ssh root@<server> 'chmod 600 /opt/vinci/.env'; }
```

The deploy commands need Bun on the server. Take it from the image you just pulled, so it matches:

```sh
ssh root@<server> "docker run --rm --entrypoint cat ghcr.io/meetvinci/vinci-daemon:$TAG /usr/local/bin/bun > /usr/local/bin/bun.new && chmod 755 /usr/local/bin/bun.new && mv /usr/local/bin/bun.new /usr/local/bin/bun && bun --version"
```

Expected: a Bun version such as `1.4.4`. The copy goes through `bun.new` because writing over a Bun that is running (a nightly backup during an upgrade, for example) fails with `Text file busy`.

**A commit that is not a release** (to test a fix before releasing it): run the **Images** workflow on its branch (`gh workflow run images.yml --ref <branch>`) and use the full commit as the tag; every push to main is already built. Without CI, build the images on your own computer instead, not on the server, which lacks the memory and disk. `bun run build:images --tag $(git rev-parse --short HEAD)` makes amd64 images even on an Apple Silicon Mac; `docker save vinci-daemon:$TAG vinci-sandbox:$TAG vinci-web:$TAG vinci-hub:$TAG vinci-provisioner:$TAG vinci-firewall:$TAG vinci-api:$TAG | gzip | ssh root@<server> 'gunzip | docker load'` sends them (seven `Loaded image:` lines). Set `VINCI_REGISTRY=` (empty) in `/opt/vinci/.env` so Compose uses these images, and take Bun from `vinci-daemon:$TAG`. Put `VINCI_REGISTRY=ghcr.io/meetvinci/` back when you return to a release.

**Give this to your agent:**

> On `root@<server>`, pull `ghcr.io/meetvinci/vinci-daemon`, `vinci-sandbox`, `vinci-web`, `vinci-hub`, `vinci-provisioner`, `vinci-firewall` and `vinci-api` at tag `<tag>`. From a checkout of `<tag>`, create `/opt/vinci` (mode 700) and copy `deploy/compose/compose.yaml`, `deploy/compose/daemon.yaml`, `deploy/compose/sandbox.yaml`, `deploy/cloudflare/cloudflared.compose.yaml` and `scripts/deploy.ts` into it. Only if `/opt/vinci/.env` does not exist yet, copy `deploy/.env.example` there as `.env` with mode 600. Install Bun from the image: `docker run --rm --entrypoint cat ghcr.io/meetvinci/vinci-daemon:<tag> /usr/local/bin/bun > /usr/local/bin/bun.new && chmod 755 /usr/local/bin/bun.new && mv /usr/local/bin/bun.new /usr/local/bin/bun`. Report the tag, `bun --version` on the server, and `docker images`.

## 4. Write the team list

`/opt/vinci/users.yaml` is the one list of people. It decides who can log in at Cloudflare and who gets their own Vinci. One line per person: a short user id and their login email. The id names the person's container and volume and cannot be changed later; use lowercase letters, digits and dashes.

Under `admins:`, list the email of the first admin of the admin panel. An admin can log in at Cloudflare but gets no Vinci of their own unless they are also under `users:`. Later admins are added in the admin panel.

To show a name in the admin panel instead of the id, use the long form for that person (`name:` and `email:` on their own lines, see [the user list](admin.md#the-user-list)). You can also list only yourself now and add everyone else later in the admin panel.

People listed here follow every section of [Global settings](admin.md#global-settings-and-suggested-bots), like people added in the panel: what you set there in step 8 reaches them within seconds. So does a line you add here later, once you run `apply`.

```sh
ssh root@<server> 'cat > /opt/vinci/users.yaml' <<'LIST'
users:
  alice: alice@example.com
  bob: bob@example.com
admins:
  - admin@example.com
LIST
```

**Give this to your agent:**

> Write `/opt/vinci/users.yaml` on `root@<server>` with `users:` and one `  <id>: <email>` line for each of `<people>`, and `admins:` with one `  - <email>` line for `<first admin email>`. Ids are short, lowercase letters, digits and dashes, and each email appears once under `users:`. Don't print the emails anywhere public.

## 5. Create the Cloudflare objects

First choose who Cloudflare Access lets request a login code:

- **Everyone at your company's email domain** (recommended when every person has such an address): add `--domain example.com` (repeat it for a second domain). Adding or removing someone at that domain later never touches Cloudflare: Vinci itself decides who gets in, and anyone else at the domain sees a page saying they have no workspace and should ask an admin. Admins or users with other addresses are still listed one by one.
- **A list of emails**: leave `--domain` out. Every person you add later must also be added in Cloudflare. Let the server do that with a small token (step 6), so adding someone in the admin panel is still one step.

One command creates everything the team needs in Cloudflare. Run it on your computer, in the repository. Read the token from your password manager inside the same command, for example with 1Password's `op read`:

```sh
ssh root@<server> cat /opt/vinci/users.yaml | \
  CLOUDFLARE_API_TOKEN="$(op read 'op://<vault>/<item>/credential')" \
  bun scripts/deploy.ts cloudflare apply \
  --zone example.com --hostname acme.example.com --name vinci-acme \
  --users - --domain example.com --env-out cloudflare.env
```

- `--name` must start with `vinci-`. Every object gets this exact name, or this name and a suffix. The script only ever changes or deletes objects with these names.
- `--users -` reads the team list from step 4, piped from the server. Its emails are the people allowed to log in, apart from those inside `--domain`.
- `--domain` sets the domain rule; leave it out for a list of emails. Run the command the same way every time: running it later without `--domain` turns the rule into a plain list of emails.
- `--env-out` writes the values the server needs, including the secret tunnel token, to a file only you can read. Git ignores `cloudflare.env`.
- `--session 24h` is the default login length. Longer sessions (for example `168h`, a week) mean fewer email codes on phones, but a lost or shared device stays logged in for that long. Removing someone from `users.yaml` still locks them out of Vinci within a second.
- Optional SSH through the tunnel: add `--ssh-hostname acme-ssh.example.com --ssh-email <admin email>` (repeat `--ssh-email` for a second admin).

Expected output on the first run:

```text
Tunnel vinci-acme: created
Access policy vinci-acme-bypass: created
Access policy vinci-acme-allow: created
Access app vinci-acme-favicon: created
Access app vinci-acme: created
Tunnel routes: updated
DNS acme.example.com: created

Tunnel vinci-acme: <tunnel id>
VINCI_PUBLIC_HOST=acme.example.com
ACCESS_TEAM_DOMAIN=https://<your-team>.cloudflareaccess.com
ACCESS_AUD=<64 hex characters>
CLOUDFLARE_ZONE=example.com
CLOUDFLARE_NAME=vinci-acme
CLOUDFLARE_ACCESS_DOMAINS=example.com
Wrote these values and TUNNEL_TOKEN to cloudflare.env (mode 600).
```

The lines may come in a different order, and with SSH there are also `vinci-acme-ssh-allow`, `vinci-acme-ssh` and a second DNS line. The DNS record always comes last, so the name is never reachable without the login.

If it differs:

- `CLOUDFLARE_API_TOKEN is unset or empty`: the password manager read failed (for example 1Password is locked and printed `authorization timeout`). Unlock it and run the command again.
- `The token cannot see the zone`: the token lacks Zone: DNS: Edit for this domain.
- `The Access app … already covers …` or `The DNS record … was not created by this script`: something else already uses this hostname. Choose another hostname, or remove that object by hand if you are sure it is unused. The script never touches it.

Running it again is safe: it prints `unchanged` for what is already right and fixes what is not.

**Give this to your agent:**

> In my Vinci repository, run `ssh root@<server> cat /opt/vinci/users.yaml | CLOUDFLARE_API_TOKEN="$(op read '<token reference>')" bun scripts/deploy.ts cloudflare apply --zone <domain> --hostname <team>.<domain> --name vinci-<team> --users - --env-out cloudflare.env`, with `--domain <company email domain>` added only if I chose to let in everyone at that domain (`<domain, or "a list of emails">`), reading the token inside the same command. Don't print the token and don't save it anywhere. If it says the token is empty, ask me to unlock my password manager and run it again. Show me the output, with the emails hidden.

## 6. Put the tunnel token on the server

The tunnel connector, cloudflared, runs as a container next to the hub; the Compose file starts it. It needs only the values from `cloudflare.env`, in `/opt/vinci/.env`. This command merges them into that file, keeps its other lines, keeps it readable by root only, and then deletes the local copy:

```sh
ssh root@<server> 'umask 077 && cd /opt/vinci && { grep -v -E "^(VINCI_PUBLIC_HOST|ACCESS_TEAM_DOMAIN|ACCESS_AUD|CLOUDFLARE_ZONE|CLOUDFLARE_NAME|CLOUDFLARE_ACCESS_DOMAINS|TUNNEL_TOKEN)=" .env 2>/dev/null || true; cat; } > .env.new && mv .env.new .env' < cloudflare.env && rm cloudflare.env
ssh root@<server> 'stat -c "%a %U" /opt/vinci/.env; grep -c -E "^(VINCI_PUBLIC_HOST|ACCESS_TEAM_DOMAIN|ACCESS_AUD|CLOUDFLARE_ZONE|CLOUDFLARE_NAME|CLOUDFLARE_ACCESS_DOMAINS|TUNNEL_TOKEN)=." /opt/vinci/.env'
```

Expected: `600 root` and `7` with a domain rule, `6` without (the domains line is then empty). `CLOUDFLARE_ZONE`, `CLOUDFLARE_NAME` and `CLOUDFLARE_ACCESS_DOMAINS` are not secret.

The token lets anyone run a connector for this tunnel. Treat it like a password.

**With a list of emails (no `--domain`), also let the server update Cloudflare Access.** Create a second, small Cloudflare API token (My Profile › API Tokens › Create Token › Create Custom Token) with only these permissions, the account limited to yours and the zone to your domain:

- Account › Access: Apps and Policies › Edit
- Zone › Zone › Read

Then put it on the server; the provisioner, which `apply` starts in step 7, picks it up:

```sh
ssh root@<server> 'cd /opt/vinci && sed -i "/^CLOUDFLARE_API_TOKEN=/d" .env && cat >> .env' < <(printf 'CLOUDFLARE_API_TOKEN=%s\n' "$(op read '<small token reference>')")
```

If 1Password is locked, this writes an empty token without an error; step 7 shows it (`Access sync off`). With the token, adding, switching off or removing someone in the admin panel also updates who may log in, and the panel shows for each person whether Cloudflare lets them in. With a domain rule the token is optional: it only lets the panel show that state, and Read instead of Edit is enough for that.

**Give this to your agent:**

> Merge `cloudflare.env` into `/opt/vinci/.env` on `root@<server>` with the merge command in step 6 of `docs/team-workspace/install.md`, then delete the local `cloudflare.env`. Confirm `stat -c "%a %U" /opt/vinci/.env` prints `600 root` and that the Cloudflare lines have values (`CLOUDFLARE_ACCESS_DOMAINS` is empty for a list of emails). If I chose a list of emails, also set `CLOUDFLARE_API_TOKEN` in `/opt/vinci/.env` to the small token at `<small token reference>` (Account › Access: Apps and Policies › Edit and Zone › Zone › Read only) with the command in step 6, reading it inside the command. Don't print the file or the token.

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

## 7. Start Vinci

Set the image tag from step 3 and the model keys you want to share in `/opt/vinci/.env`. Never print the file: it holds secrets.

```sh
ssh root@<server> "sed -i 's/^VINCI_TAG=.*/VINCI_TAG=$TAG/' /opt/vinci/.env"
```

Write each model key the same way, for example `ANTHROPIC_API_KEY=`, reading it from your password manager inside the command. Leave a key empty to skip that provider. Without any key, set one per person in the admin panel (**Settings → Models**), or make them an advanced user so they can add their own. Every setting is explained in the file and in [configuration](configuration.md).

Set the first admin of the admin panel (the same email as under `admins:` in `users.yaml`), and create the secret the hub uses to reach the provisioner, the service that adds and removes people for the admin panel. Nobody types this secret; it never leaves the server:

```sh
ssh root@<server> 'cd /opt/vinci && sed -i "/^HUB_ADMIN_EMAILS=/d" .env && echo "HUB_ADMIN_EMAILS=admin@example.com" >> .env'
ssh root@<server> 'cd /opt/vinci && { grep -q "^PROVISIONER_TOKEN=." .env || { sed -i "/^PROVISIONER_TOKEN=/d" .env && echo "PROVISIONER_TOKEN=$(openssl rand -hex 32)" >> .env; }; } && grep -c "^PROVISIONER_TOKEN=.\{64\}$" .env'
```

Generate the two PostgreSQL passwords once. Compose uses them when it initializes the database volume.

```sh
ssh root@<server> 'set -e; cd /opt/vinci; for key in VINCI_DB_PASSWORD VINCI_POSTGRES_PASSWORD; do if ! grep -q "^$key=." .env; then password=$(openssl rand -hex 32); sed -i "/^$key=/d" .env; printf "%s=%s\n" "$key" "$password" >> .env; fi; done'
```

Expected: `1`.

Start everything:

```sh
ssh root@<server> 'cd /opt/vinci && bun deploy.ts apply'
```

This writes the per-person files from `users.yaml`, then starts the web app, cloudflared, the firewall that keeps bots off the server's internal addresses ([what a bot can reach](admin.md#what-a-bot-can-do-and-reach)), one container per person and one more for the template workspace (`daemon-template`, which holds the admin panel's global settings and suggested bots; nobody logs into it), each with a sandbox and a sandbox disk for their bots' files and home ([disk limits](admin.md#disk-limits): `disks/` and the boot unit `vinci-disks.service`), then the hub and the provisioner, and waits until all are healthy. It takes about 15 seconds and ends with `Applied 2 users: alice, bob (and the template workspace)`. The first time, it also downloads the cloudflared image from Docker Hub, so the server needs to reach Docker Hub. Every container restarts on its own after a crash or a reboot. Nothing listens on the server's network: only cloudflared connects out.

Check it:

```sh
ssh root@<server> 'cd /opt/vinci && docker compose ps --format "{{.Name}} {{.Status}}" && docker compose logs cloudflared | grep -c "Registered tunnel connection"'
```

Expected: `vinci-hub-1`, `vinci-provisioner-1`, `vinci-web-1`, `vinci-api-1`, `vinci-cloudflared-1`, `vinci-firewall-1`, `vinci-daemon-template-1` and `vinci-sandbox-template-1`, and one `vinci-daemon-<id>-1` and one `vinci-sandbox-<id>-1` per person, each `Up … (healthy)`, then `4` or more (cloudflared keeps 4 connections; the count grows after restarts).

The hub creates `hub/audit.sqlite` on its first start: the admin panel's [audit trail](admin.md#activity). `ssh root@<server> 'ls -l /opt/vinci/hub/audit.sqlite'` shows it owned by uid 1000 with mode `-rw-------`.

Then check how the provisioner sees Cloudflare: `ssh root@<server> 'cd /opt/vinci && docker compose logs provisioner | grep listening | tail -1'`. It ends with `Access sync on` when step 6 put a token on the server (`off (manual)` without one), and lists `domain rule @example.com` when you chose a domain.

If it differs:

- `pull access denied` or `manifest unknown` for an image: the server has no image of the tag in `.env`. Check `VINCI_TAG` and `VINCI_REGISTRY` in `.env`, `docker images`, and pull it as in step 3; `unauthorized` or `denied` from `ghcr.io` means that image's package is not public yet ([images from CI](admin.md#images-from-ci)).
- `set ACCESS_AUD in .env` or a similar message: step 6 did not merge the Cloudflare values. `set PROVISIONER_TOKEN in .env` or `set HUB_ADMIN_EMAILS in .env`: the two commands above did not run.
- cloudflared unhealthy or no `Registered tunnel connection` line: check `docker compose logs cloudflared` for a token error, and run step 5 and 6 again.
- The hub log warns `The provisioner did not take the admin list yet; trying again` a few times: normal on the first start, while `apply` still holds its lock. It stops once `docker compose logs provisioner` shows `PUT /access/admins 200`. If it goes on for more than a minute, read the provisioner log.

**Give this to your agent:**

> On `root@<server>`, in `/opt/vinci`: set `VINCI_TAG=<tag>` in `.env`, and the model keys from `<where you keep them>` without printing secrets and without touching the Cloudflare block. Set `HUB_ADMIN_EMAILS=<first admin email>`, and, only if `PROVISIONER_TOKEN` has no value yet, set it to `openssl rand -hex 32` without printing it. Run `bun deploy.ts apply`. Confirm `docker compose ps` shows the hub, the provisioner, web, cloudflared, the firewall, `vinci-daemon-template-1`, `vinci-sandbox-template-1` and one `vinci-daemon-<id>-1` and `vinci-sandbox-<id>-1` per person in `users.yaml`, all healthy (`bun deploy.ts status` exits 0), and that `docker compose logs cloudflared` has at least 4 `Registered tunnel connection` lines. Report the provisioner's `listening` log line: it must say `Access sync on` if I chose a list of emails and gave a small token.

## 8. Check it works

From any computer, without logging in:

```sh
curl -s -o /dev/null -w '%{http_code}\n' https://acme.example.com/rpc          # 302: the Cloudflare login
curl -s -o /dev/null -w '%{http_code}\n' https://acme.example.com/admin        # 302: the admin panel needs the login too
curl -s -o /dev/null -w '%{http_code}\n' https://acme.example.com/favicon.ico  # 200: no login needed
curl -s -o /dev/null -w '%{http_code}\n' https://acme.example.com/img/favicon/site.webmanifest  # 200: the home-screen app manifest
```

On the server, nothing of Vinci or Docker listens on a network address, and one person's Vinci cannot reach another's:

```sh
ssh root@<server> 'ss -tlnp'
ssh root@<server> 'cd /opt/vinci && ids=$(docker compose ps --format "{{.Service}}" | sed -n "s/^daemon-//p"); for a in $ids; do for b in $ids; do [ $a = $b ] && continue; ip=$(docker inspect -f "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}" vinci-daemon-$b-1); printf "%s -> %s: " $a $b; docker exec vinci-daemon-$a-1 bun -e "fetch(\"http://$ip:47191/health\",{signal:AbortSignal.timeout(3000)}).then(()=>console.log(\"REACHABLE: not isolated\"),()=>console.log(\"blocked\"))" 2>/dev/null; done; printf "hub -> %s: " $a; docker exec vinci-hub-1 bun -e "fetch(\"http://daemon-$a:47191/health\").then(r=>console.log(r.status),e=>console.log(\"unreachable\"))" 2>/dev/null; done'
```

Expected: `ss` lists only sshd on port 22 and the local resolver on 127.0.0.53 and 127.0.0.54. Every `a -> b` line says `blocked`, and every `hub -> a` line says `200`. The template workspace is checked like a person, so even one person gives a `template -> <id>` pair. Then run the check in [what a bot can reach](admin.md#what-a-bot-can-do-and-reach) for one person: the internet answers and the server, the hub, the person's own Vinci, the metadata service and private addresses are blocked. `bun deploy.ts status` on the server prints every person's Vinci and sandbox as `running (healthy)`.

Then log in:

1. Open `https://<team>.<domain>` in a private browser window. You should see the Cloudflare login.
2. Log in with a team email and the code you get by email.
3. Vinci opens for that person. The browser pairs itself; there is no PIN and no device name to type. Vinci shows no setup steps: the admin sets up keys and bots.
4. Try an email that is not on the list. With a list of emails, Cloudflare should not send it a code. With a domain rule, an address at that domain gets a code and then a page saying it has no workspace and to ask an admin; an address at another domain gets no code.
5. Log in as the first admin and open `https://<team>.<domain>/admin`. You should see **Users** with everyone from `users.yaml`, **Global settings**, and **Admins** with your email. A person who is not an admin gets 403 there. If you are an admin but not a user, opening `https://<team>.<domain>` takes you to `/admin`.
6. Set up the team before people log in. First, in **Global settings → Models**, add a model provider's API key: until one is there, nobody's bot form has a model to pick, and it says so. Everyone in `users.yaml` follows Global settings, so the key reaches them within seconds, with no other click. Then set Chat, Tools, Secrets and Sources as you want everyone to start, and create the bots you want to offer under **Suggested bots**. Give each person their bots with **Add from suggested bots** on their **Bots** (see [Global settings and suggested bots](admin.md#global-settings-and-suggested-bots)).

**Give this to your agent:**

> Check the Vinci install on `root@<server>`, in `/opt/vinci`: run the four `curl` checks in step 8 of `docs/team-workspace/install.md` from this computer (302, 302, 200, 200), confirm `docker compose ps` shows every container healthy, that `ss -tlnp` shows nothing but sshd and the local resolver, and run the isolation check from step 8: every daemon-to-daemon line must say `blocked` and every hub line `200`; then the check in the "What a bot can reach" section of `docs/team-workspace/admin.md` for one person: public 200, the rest blocked. Confirm `/opt/vinci/hub/admins.json` lists `<first admin email>` and that `docker compose logs hub` has no `Admins file` error. Then tell me to open `https://<team>.<domain>` in a private window and log in, and to open `/admin` as the first admin.

## 9. Turn on nightly backups

The server backs everyone up every night with a systemd timer. Each backup holds every key and secret of the team: see [Backups](admin.md#backups) before copying them anywhere.

```sh
ssh root@<server> 'cd /opt/vinci && bun deploy.ts nightly install && bun deploy.ts nightly && bun deploy.ts nightly status'
```

Expected: the two unit files written, one run of a few seconds per person, and `Last run: backups/<time>, … ok`. Backups stay on the server's disk until you add an [off-site copy](admin.md#off-site-copy).

**Give this to your agent:**

> On `root@<server>`, in `/opt/vinci`, run `bun deploy.ts nightly install`, then `bun deploy.ts nightly` once, then `bun deploy.ts nightly status`, and report its output and `systemctl list-timers vinci-backup.timer`. Never print `.env` or a backup's content.

## Just me

A person on their own installs the same thing as a team. There is no smaller version.

- Follow steps 1 to 9 as written. You still need a Linux server with Docker, a domain on Cloudflare and Cloudflare's free Zero Trust plan. A Mac or Windows computer is not supported, not even with Docker on it ([why](#before-you-start)).
- In step 4, put your own email under both `users:` and `admins:`. In step 7, use the same email for `HUB_ADMIN_EMAILS`. You are the only user and the only admin.
- In step 5, let in only your own email.
- Memory: the smallest server in [Before you start](#before-you-start) is plenty. You are one person, plus the template workspace for global settings.
- You log in with an email code, and the hub pairs your browser. Your bots' security settings, model keys and shared sources live in the admin panel at `/admin`, on your own page. Global settings are there too; you need them only if you add people later.

## Login with Vinci accounts (no Cloudflare)

**For testing for now.** Production installs use Cloudflare Access, steps 1 to 9 above. This mode needs no Cloudflare account and no domain on Cloudflare: people log in with an email and a password that Vinci keeps, and the server answers on ports 80 and 443 itself.

How it works: `VINCI_AUTH=laravel` in `.env` swaps cloudflared for Caddy (`deploy/caddy/caddy.compose.yaml`), which gets a Let's Encrypt certificate for `VINCI_PUBLIC_HOST`. The Laravel API (`apps/api`) shows the login page at `/cdn-cgi/access/login`. A login is a [Laravel Sanctum](https://laravel.com/docs/sanctum) token in the `vinci_session` cookie (HttpOnly, Secure, SameSite=Lax), one per browser, stored in PostgreSQL. The hub asks the API whose login a cookie is on every request (`GET /internal/session`, on the network only the two share, with `API_INTERNAL_TOKEN`), trusts the answer for at most 5 seconds, and checks every open connection again every 5 seconds. So ending a login in the API ends it everywhere at once:

- **Sign out** (`/cdn-cgi/access/logout`) deletes this browser's login, not only its cookie: a copy of the cookie stops working too.
- **Change password** (avatar menu → **Settings** → **General**, or **Change password** in the admin panel's header) asks for the current password and ends the person's other logins; this browser stays signed in.
- **Reset password** in the admin panel, and `vinci:user` for an existing account, end all of that person's logins; so does **Remove**. **Disable** keeps the login but the hub refuses it with *Your sign-in is turned off*.
- A login lasts at most 7 days, then the login page comes back.

A visitor without the cookie, or whose login ended, is sent to the login page and back to where they were after it. Caddy only checks that the cookie is there; it vouches for nobody, and the hub trusts no header for identity. After 5 wrong passwords for one email from one address in a minute, or 20 for one email from any addresses in an hour, the login page answers *Too many attempts* for that email until the time it names; wrong current passwords at **Change password** count toward the same hourly limit. An email with no account is limited the same way, so the page never tells which accounts exist. A real person locked out by someone else's guesses waits out the hour, or an admin lifts every lock with `docker compose exec api php artisan cache:clear` ([Troubleshooting](troubleshooting.md#the-login-page-says-too-many-attempts)). Caddy tells browsers to use only HTTPS for this hostname for a year (`Strict-Transport-Security`, without subdomains), and the login pages cannot be shown inside another site's frame.

What changes from the steps above:

- **Before you start:** no Cloudflare domain or token. You need a DNS name that points at the server (an `A` record) and ports 80 and 443 open to the internet, for the certificate and for people.
- **Step 3:** copy `deploy/caddy/caddy.compose.yaml` instead of `deploy/cloudflare/cloudflared.compose.yaml`.
- **Steps 5 and 6:** skip them. Set these in `/opt/vinci/.env` instead, generating the secrets on the server so they never leave it:

  ```sh
  ssh root@<server> 'set -e; cd /opt/vinci; set_env() { sed -i "/^$1=/d" .env; printf "%s=%s\n" "$1" "$2" >> .env; }
    set_env VINCI_AUTH laravel
    set_env COMPOSE_FILE compose.yaml:caddy.compose.yaml:users.compose.yaml
    set_env VINCI_PUBLIC_HOST vinci.example.com
    grep -q "^API_INTERNAL_TOKEN=." .env || set_env API_INTERNAL_TOKEN "$(openssl rand -hex 32)"
    grep -q "^API_APP_KEY=." .env || set_env API_APP_KEY "base64:$(openssl rand -base64 32)"'
  ```

- **Step 7:** `bun deploy.ts apply` checks these values first and names what is missing. It starts `vinci-caddy-1` and `vinci-api-1` in place of cloudflared, and `bun deploy.ts status` lists them and `postgres`, which must be `running (healthy)`. Then create the first admin's account; the password is printed once, so put it in your password manager:

  ```sh
  ssh root@<server> 'cd /opt/vinci && docker compose exec -T api php artisan vinci:user admin@example.com'
  ```

  The same command gives an existing account a new password. With `--quiet` it prints only the password. Accounts for other people come from the admin panel: **Add user**, and **Add admin** for an admin who is not a user, show the new password once.
- **Step 8:** without logging in, `https://<host>/rpc` answers `302` to `/cdn-cgi/access/login`, and the icons answer `200`. `ss -tlnp` also shows Docker on ports 80 and 443.

Trust: whoever holds `API_INTERNAL_TOKEN` and reaches the API can ask whose login a token is and manage accounts; the `/internal` routes are reachable only from the hub (Caddy answers 404 for them), and only with that token. Logins are random tokens the API stores only as hashes. `API_APP_KEY` encrypts the login form's own session cookie; changing it only makes open login forms start over. An install from before Sanctum sessions still has `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` in `.env`; nothing reads them in this mode any more, and people log in once more after the upgrade.

To go back to Cloudflare, set `VINCI_AUTH=access` (or delete the line), put `cloudflared.compose.yaml` back in `COMPOSE_FILE`, follow steps 5 and 6, and run `docker compose up -d --remove-orphans` and then `bun deploy.ts apply`.

**Give this to your agent:**

> Install Vinci on `root@<server>` for testing with Vinci's own logins, following "Login with Vinci accounts (no Cloudflare)" in `docs/team-workspace/install.md`: steps 1 to 4 and 7 to 9 with its changes, skipping 5 and 6, at `<host>`, which already points at the server. Run `bun deploy.ts check` and report its warnings. Generate the secrets on the server and never print `.env`. Create the account of `<first admin email>` with `vinci:user` and tell me its password is in the output, once, without repeating it in a summary.

## The whole install in one prompt

Fill in the angle brackets and paste:

> Install Vinci for my team by following `docs/team-workspace/install.md` in my Vinci checkout, steps 1 to 9 in order, and stop at the first step whose check fails. Server: `root@<server>` (`<ssh options, if any>`). Cloudflare zone `<domain>`, team hostname `<team>.<domain>`, object name `vinci-<team>`. Cloudflare lets in `<everyone @<company domain>, or "a list of emails" plus the small server token at <op://…>>`. The Cloudflare API token is at `<op://… or where it is>`: read it inside the command that needs it, never print or save it. People (id: email): `<id>: <email>, …`. First admin of the admin panel: `<email>`. Model keys: `<where they are, or "none, people add their own">`. Never print secrets or emails in public places. Finish with the step 8 checks and the nightly backup of step 9 and tell me the address to log in at and the admin panel address (`/admin`), and remind me to set Global settings and the suggested bots there before people log in.

## Install with cloud-init

A new server can install itself on its first boot, with no Cloudflare: [Login with Vinci accounts](#login-with-vinci-accounts-no-cloudflare), done for you. People log in with an email and a password that Vinci keeps, and Caddy serves HTTPS with a Let's Encrypt certificate. You need a server as in [Before you start](#before-you-start), Ubuntu 24.04 or 26.04, and a hostname whose DNS A record points at it.

Fill in [`deploy/cloud-init/user-data.yaml`](../../deploy/cloud-init/user-data.yaml) and give it to your cloud provider as the server's user data (Hetzner: **Cloud config** when you create or rebuild the server). It has five values:

- `{{host}}`: the hostname, for example `acme.example.com`.
- `{{admin}}`: the email of the first admin. They also get a Vinci of their own.
- `{{ref}}`: the Vinci release whose deployment files to use, for example `v0.2.0`.
- `{{tag}}`: the image tag, the same release.
- `{{registry}}`: `ghcr.io/meetvinci/`, where the images come from.

`bun scripts/test-server.ts render --host <hostname> --admin <email> --ref <release> --tag <release>` prints it filled in. The file holds no secret: the server makes every secret itself.

The server installs Docker, the deployment files, `.env` and `users.yaml`, starts everything, creates the admin's login and turns on nightly backups. It takes about two minutes after the server boots, plus the image download. Then:

```sh
ssh root@<server> 'cat /var/log/vinci-install.result; grep "^== " /var/log/vinci-install.log'
ssh root@<server> 'cat /opt/vinci/admin-password'
```

Expected: `ok` and one line per step with its time. If it says `failed: <step>`, `tail -n 60 /var/log/vinci-install.log` shows why; fix the cause and run `/usr/local/sbin/vinci-install` again, which keeps what it already made, the admin's account and password included. A wrong release goes in `/etc/vinci-install.env` (`VINCI_REF`, `VINCI_TAG`) before the new run. The script installs the release named there: after an [upgrade](admin.md#upgrades), update both values, or running it again puts the old version back. The second command prints the admin's password: open `https://<hostname>`, log in with the admin's email and it, then continue with step 8 and the admin panel.

The password file is readable by root only, and it is temporary: change the password right away (avatar menu → **Settings** → **General** → **Change password**), and the hub has the provisioner delete `/opt/vinci/admin-password`. The rule: a password change by an email in `HUB_ADMIN_EMAILS` (the install's first admins, here `{{admin}}`) deletes the file. Until then it holds a working password, so treat the server's root login as that admin's login.

## Next

[Admin tasks](admin.md): global settings and suggested bots, add and remove people, model keys, backups and upgrades.
