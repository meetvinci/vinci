# Install

Set up a server for one team, or for just you, from a fresh Ubuntu server to a logged-in person. Do the steps in order. Each step ends with a prompt you can paste to an AI coding agent that has SSH access to the server and a checkout of this repository.

An agent can also do the whole install at once: see [the whole install in one prompt](#the-whole-install-in-one-prompt) at the end. Agents working in this repository have the `vinci-deploy` skill with the same procedure.

## Before you start

You need:

- **A server.** Ubuntu 24.04 on x86 (amd64), with root SSH access. It must run Docker Engine directly on Linux (step 2). Keeping each person's Vinci away from the others relies on Docker Engine's own network rules; OrbStack and other Mac or Windows Docker apps do not enforce them, so never run a team there.
  - Memory: 4 GB for up to 5 people, 8 GB for up to about 13. The server also runs one workspace for the global settings, sized like a person. A "4 GB" server shows about 3.7 GiB in `free -h`; that is enough. MCP servers that run a command (`npx`, `uvx`) cost more: each bot runs its own copy from the moment its person's Vinci starts, about 150 MiB per bot for one `npx` and one `uvx` server. With such servers in Global settings, plan 4 GB for about 3 people with two bots each ([what a bot can reach](admin.md#what-a-bot-can-do-and-reach)).
  - Disk: at least 40 GB.
  - The CPU must support AVX2. Most current servers do.
- **A hostname for the team**, for example `acme.example.com`, whose DNS you can change, and ports 80 and 443 of the server open to the internet: Caddy, on the server, gets a Let's Encrypt certificate for it and serves Vinci there. A server without a public address or open ports can use the [Cloudflare Tunnel](#optional-cloudflare-tunnel) instead.
- **Bun and a checkout of this repository** on the computer you set up from. You don't need `bun install` for the install itself.
- **The team's email addresses.** Each person logs in with their email and a password that Vinci keeps: the admin panel makes the password and shows it once, and the person changes it in their settings.
- **A model API key** per person (Anthropic, OpenAI or another provider), unless you make people advanced users who add their own.

Keep model keys and passwords in a password manager. Never paste them into a chat.

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
scp deploy/compose/compose.yaml deploy/compose/daemon.yaml deploy/compose/sandbox.yaml deploy/caddy/caddy.compose.yaml scripts/deploy.ts root@<server>:/opt/vinci/
ssh root@<server> 'test -e /opt/vinci/.env' || { scp deploy/.env.example root@<server>:/opt/vinci/.env && ssh root@<server> 'chmod 600 /opt/vinci/.env'; }
```

The deploy commands need Bun on the server. Take it from the image you just pulled, so it matches:

```sh
ssh root@<server> "docker run --rm --entrypoint cat ghcr.io/meetvinci/vinci-daemon:$TAG /usr/local/bin/bun > /usr/local/bin/bun.new && chmod 755 /usr/local/bin/bun.new && mv /usr/local/bin/bun.new /usr/local/bin/bun && bun --version"
```

Expected: a Bun version such as `1.4.4`. The copy goes through `bun.new` because writing over a Bun that is running (a nightly backup during an upgrade, for example) fails with `Text file busy`.

**A commit that is not a release** (to test a fix before releasing it): run the **Images** workflow on its branch (`gh workflow run images.yml --ref <branch>`) and use the full commit as the tag; every push to main is already built. Without CI, build the images on your own computer instead, not on the server, which lacks the memory and disk. `bun run build:images --tag $(git rev-parse --short HEAD)` makes amd64 images even on an Apple Silicon Mac; `docker save vinci-daemon:$TAG vinci-sandbox:$TAG vinci-web:$TAG vinci-hub:$TAG vinci-provisioner:$TAG vinci-firewall:$TAG vinci-api:$TAG | gzip | ssh root@<server> 'gunzip | docker load'` sends them (seven `Loaded image:` lines). Set `VINCI_REGISTRY=` (empty) in `/opt/vinci/.env` so Compose uses these images, and take Bun from `vinci-daemon:$TAG`. Put `VINCI_REGISTRY=ghcr.io/meetvinci/` back when you return to a release.

**Give this to your agent:**

> On `root@<server>`, pull `ghcr.io/meetvinci/vinci-daemon`, `vinci-sandbox`, `vinci-web`, `vinci-hub`, `vinci-provisioner`, `vinci-firewall` and `vinci-api` at tag `<tag>`. From a checkout of `<tag>`, create `/opt/vinci` (mode 700) and copy `deploy/compose/compose.yaml`, `deploy/compose/daemon.yaml`, `deploy/compose/sandbox.yaml`, `deploy/caddy/caddy.compose.yaml` and `scripts/deploy.ts` into it. Only if `/opt/vinci/.env` does not exist yet, copy `deploy/.env.example` there as `.env` with mode 600. Install Bun from the image: `docker run --rm --entrypoint cat ghcr.io/meetvinci/vinci-daemon:<tag> /usr/local/bin/bun > /usr/local/bin/bun.new && chmod 755 /usr/local/bin/bun.new && mv /usr/local/bin/bun.new /usr/local/bin/bun`. Report the tag, `bun --version` on the server, and `docker images`.

## 4. Write the team list

`/opt/vinci/users.yaml` is the one list of people. It decides who gets their own Vinci. One line per person: a short user id and their login email. The id names the person's container and volume and cannot be changed later; use lowercase letters, digits and dashes.

Under `admins:`, list the email of the first admin of the admin panel. An admin gets no Vinci of their own unless they are also under `users:`. Later admins are added in the admin panel.

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

## 5. Point the hostname at the server

Add a DNS `A` record for the team hostname with the server's address, and an `AAAA` record if the server has IPv6. With Cloudflare as your DNS, leave the record **DNS only** (grey cloud): Caddy needs the visitors' connections for its certificate.

```sh
dig +short acme.example.com
```

Expected: the server's address. Ports 80 and 443 must be open in the server's or the provider's firewall: Caddy answers Let's Encrypt on them, and people use 443.

**Give this to your agent:**

> Check that `<team hostname>` resolves to `<server address>` (`dig +short`) and that ports 80 and 443 of `root@<server>` are open in its firewall and the provider's. Report what you find; change no DNS.

## 6. Set the login secrets

The Laravel API (`apps/api`) is the login, and Caddy (`deploy/caddy/caddy.compose.yaml`) is the one way in. Set the hostname and generate the API's secrets on the server, so they never leave it:

```sh
ssh root@<server> 'set -e; cd /opt/vinci; set_env() { sed -i "/^$1=/d" .env; printf "%s=%s\n" "$1" "$2" >> .env; }
  set_env COMPOSE_FILE compose.yaml:caddy.compose.yaml:users.compose.yaml
  set_env VINCI_PUBLIC_HOST acme.example.com
  grep -q "^API_INTERNAL_TOKEN=." .env || set_env API_INTERNAL_TOKEN "$(openssl rand -hex 32)"
  grep -q "^API_APP_KEY=." .env || set_env API_APP_KEY "base64:$(openssl rand -base64 32)"'
```

`API_INTERNAL_TOKEN` is the secret the hub uses to check logins with the API; `API_APP_KEY` encrypts the login form's own session. Nobody types either. How login works: [Logins](#logins).

**Give this to your agent:**

> On `root@<server>`, in `/opt/vinci/.env`, set `COMPOSE_FILE=compose.yaml:caddy.compose.yaml:users.compose.yaml` and `VINCI_PUBLIC_HOST=<team hostname>`, and, only if they have no value yet, `API_INTERNAL_TOKEN` to `openssl rand -hex 32` and `API_APP_KEY` to `base64:` and `openssl rand -base64 32`, generated on the server. Don't print the file.

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

This checks the login secrets first and names what is missing. Then it writes the per-person files from `users.yaml`, starts Caddy, the Laravel API and PostgreSQL, the web app, the firewall that keeps bots off the server's internal addresses ([what a bot can reach](admin.md#what-a-bot-can-do-and-reach)), one container per person and one more for the template workspace (`daemon-template`, which holds the admin panel's global settings and suggested bots; nobody logs into it), each with a sandbox and a sandbox disk for their bots' files and home ([disk limits](admin.md#disk-limits): `disks/` and the boot unit `vinci-disks.service`), then the hub and the provisioner, and waits until all are healthy. It takes about 15 seconds and ends with `Applied 2 users: alice, bob (and the template workspace)`. The first time, it also downloads the Caddy and PostgreSQL images from Docker Hub, so the server needs to reach Docker Hub. Every container restarts on its own after a crash or a reboot. Only Caddy listens on the server's network, on ports 80 and 443.

Then create the first admin's login. The password is printed once, so put it in your password manager, and change it after your first login (avatar menu → **Settings** → **General** → **Change password**):

```sh
ssh root@<server> 'cd /opt/vinci && docker compose exec -T api php artisan vinci:user admin@example.com'
```

The same command gives an existing account a new password, and ends its logins. With `--quiet` it prints only the password; with `--new` it only creates an account and leaves an existing one alone. Accounts for other people come from the admin panel: **Add user**, and **Add admin** for an admin who is not a user, show the new password once.

Check it:

```sh
ssh root@<server> 'cd /opt/vinci && docker compose ps --format "{{.Name}} {{.Status}}"'
```

Expected: `vinci-hub-1`, `vinci-provisioner-1`, `vinci-web-1`, `vinci-api-1`, `vinci-caddy-1`, `vinci-postgres-1`, `vinci-firewall-1`, `vinci-daemon-template-1` and `vinci-sandbox-template-1`, and one `vinci-daemon-<id>-1` and one `vinci-sandbox-<id>-1` per person, each `Up … (healthy)`.

The hub creates `hub/audit.sqlite` on its first start: the admin panel's [audit trail](admin.md#activity). `ssh root@<server> 'ls -l /opt/vinci/hub/audit.sqlite'` shows it owned by uid 1000 with mode `-rw-------`.

If it differs:

- `pull access denied` or `manifest unknown` for an image: the server has no image of the tag in `.env`. Check `VINCI_TAG` and `VINCI_REGISTRY` in `.env`, `docker images`, and pull it as in step 3; `unauthorized` or `denied` from `ghcr.io` means that image's package is not public yet ([images from CI](admin.md#images-from-ci)).
- `.env needs API_INTERNAL_TOKEN` or `API_APP_KEY`: step 6 did not run. `set VINCI_PUBLIC_HOST in .env`, `set PROVISIONER_TOKEN in .env` or `set HUB_ADMIN_EMAILS in .env`: step 6 or the commands above did not run.
- Caddy healthy but no HTTPS: `docker compose logs caddy` names the certificate error; usually the DNS record of step 5 does not point here yet, or port 80 is closed.
- The hub log warns `The provisioner did not take the admin list yet; trying again` a few times: normal on the first start, while `apply` still holds its lock. It stops once `docker compose logs provisioner` shows `PUT /admins 200`. If it goes on for more than a minute, read the provisioner log.

**Give this to your agent:**

> On `root@<server>`, in `/opt/vinci`: set `VINCI_TAG=<tag>` in `.env`, and the model keys from `<where you keep them>` without printing secrets. Set `HUB_ADMIN_EMAILS=<first admin email>`, and, only if `PROVISIONER_TOKEN`, `VINCI_DB_PASSWORD` or `VINCI_POSTGRES_PASSWORD` have no value yet, generate them with `openssl rand -hex 32` without printing them. Run `bun deploy.ts apply`. Confirm `docker compose ps` shows the hub, the provisioner, web, Caddy, the API, PostgreSQL, the firewall, `vinci-daemon-template-1`, `vinci-sandbox-template-1` and one `vinci-daemon-<id>-1` and `vinci-sandbox-<id>-1` per person in `users.yaml`, all healthy (`bun deploy.ts status` exits 0). Then create the first admin's account with `docker compose exec -T api php artisan vinci:user <first admin email>` and tell me its password is in the output, once, without repeating it in a summary.

## 8. Check it works

From any computer, without logging in:

```sh
curl -s -o /dev/null -w '%{http_code}\n' https://acme.example.com/rpc          # 302: the login page
curl -s -o /dev/null -w '%{http_code}\n' https://acme.example.com/admin        # 302: the admin panel needs the login too
curl -s -o /dev/null -w '%{http_code}\n' https://acme.example.com/favicon.ico  # 200: no login needed
curl -s -o /dev/null -w '%{http_code}\n' https://acme.example.com/img/favicon/site.webmanifest  # 200: the home-screen app manifest
```

On the server, only Caddy listens on a network address, and one person's Vinci cannot reach another's:

```sh
ssh root@<server> 'ss -tlnp'
ssh root@<server> 'cd /opt/vinci && ids=$(docker compose ps --format "{{.Service}}" | sed -n "s/^daemon-//p"); for a in $ids; do for b in $ids; do [ $a = $b ] && continue; ip=$(docker inspect -f "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}" vinci-daemon-$b-1); printf "%s -> %s: " $a $b; docker exec vinci-daemon-$a-1 bun -e "fetch(\"http://$ip:47191/health\",{signal:AbortSignal.timeout(3000)}).then(()=>console.log(\"REACHABLE: not isolated\"),()=>console.log(\"blocked\"))" 2>/dev/null; done; printf "hub -> %s: " $a; docker exec vinci-hub-1 bun -e "fetch(\"http://daemon-$a:47191/health\").then(r=>console.log(r.status),e=>console.log(\"unreachable\"))" 2>/dev/null; done'
```

Expected: `ss` lists only sshd on port 22, Docker on ports 80 and 443 (Caddy), and the local resolver on 127.0.0.53 and 127.0.0.54. Every `a -> b` line says `blocked`, and every `hub -> a` line says `200`. The template workspace is checked like a person, so even one person gives a `template -> <id>` pair. Then run the check in [what a bot can reach](admin.md#what-a-bot-can-do-and-reach) for one person: the internet answers and the server, the hub, the person's own Vinci, the metadata service and private addresses are blocked. `bun deploy.ts status` on the server prints every person's Vinci and sandbox as `running (healthy)`.

Then log in:

1. Open `https://<team>.<domain>` in a private browser window. You should see **Log in to Vinci**.
2. Log in with the first admin's email and the password from step 7, and change it right away (avatar menu → **Settings** → **General** → **Change password**, or **Change password** in the admin panel's header for an admin who is not a user).
3. Add people in the admin panel (**Users** → **Add user**); each gets a password, shown once, to hand over. When one logs in, Vinci opens for them. The browser pairs itself; there is no PIN and no device name to type. Vinci shows no setup steps: the admin sets up keys and bots.
4. A wrong password says *Wrong email or password*; an account whose sign-in is off sees *Your sign-in is turned off*.
5. Log in as the first admin and open `https://<team>.<domain>/admin`. You should see **Users** with everyone from `users.yaml`, **Global settings**, and **Admins** with your email. A person who is not an admin gets 403 there. If you are an admin but not a user, opening `https://<team>.<domain>` takes you to `/admin`.
6. Set up the team before people log in. First, in **Global settings → Models**, add a model provider's API key: until one is there, nobody's bot form has a model to pick, and it says so. Everyone in `users.yaml` follows Global settings, so the key reaches them within seconds, with no other click. Then set Chat, Tools, Secrets and Sources as you want everyone to start, and create the bots you want to offer under **Suggested bots**. Give each person their bots with **Add from suggested bots** on their **Bots** (see [Global settings and suggested bots](admin.md#global-settings-and-suggested-bots)).

**Give this to your agent:**

> Check the Vinci install on `root@<server>`, in `/opt/vinci`: run the four `curl` checks in step 8 of `docs/team-workspace/install.md` from this computer (302, 302, 200, 200), confirm `docker compose ps` shows every container healthy, that `ss -tlnp` shows nothing but sshd, ports 80 and 443 and the local resolver, and run the isolation check from step 8: every daemon-to-daemon line must say `blocked` and every hub line `200`; then the check in the "What a bot can reach" section of `docs/team-workspace/admin.md` for one person: public 200, the rest blocked. Confirm `/opt/vinci/hub/admins.json` lists `<first admin email>` and that `docker compose logs hub` has no `Admins file` error. Then tell me to open `https://<team>.<domain>` in a private window, log in as the first admin, change the password and open `/admin`.

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

- Follow steps 1 to 9 as written, or [install with cloud-init](#install-with-cloud-init). You still need a Linux server with Docker and a hostname. A Mac or Windows computer is not supported, not even with Docker on it ([why](#before-you-start)).
- In step 4, put your own email under both `users:` and `admins:`. In step 7, use the same email for `HUB_ADMIN_EMAILS`. You are the only user and the only admin.
- Memory: the smallest server in [Before you start](#before-you-start) is plenty. You are one person, plus the template workspace for global settings.
- You log in with your email and password, and the hub pairs your browser. Your bots' security settings, model keys and shared sources live in the admin panel at `/admin`, on your own page. Global settings are there too; you need them only if you add people later.

## Logins

Caddy (`deploy/caddy/caddy.compose.yaml`) gets a Let's Encrypt certificate for `VINCI_PUBLIC_HOST`, sends `/auth/*` to the Laravel API (`apps/api`), which shows the login page at `/auth/login`, and everything else to the hub. A login is a [Laravel Sanctum](https://laravel.com/docs/sanctum) token in the `vinci_session` cookie (HttpOnly, Secure, SameSite=Lax), one per browser, stored in PostgreSQL. The hub asks the API whose login a cookie is on every request (`GET /internal/session`, on the network only the two share, with `API_INTERNAL_TOKEN`), trusts the answer for at most 5 seconds, and checks every open connection again every 5 seconds. So ending a login in the API ends it everywhere at once:

- **Sign out** (`/auth/logout`) deletes this browser's login, not only its cookie: a copy of the cookie stops working too.
- **Change password** (avatar menu → **Settings** → **General**, or **Change password** in the admin panel's header) asks for the current password and ends the person's other logins; this browser stays signed in.
- **Reset password** in the admin panel, and `vinci:user` for an existing account, end all of that person's logins; so does **Remove**. **Disable** keeps the login but the hub refuses it with *Your sign-in is turned off*.
- A login lasts at most 7 days, then the login page comes back.

A visitor without the cookie, or whose login ended, is sent to the login page and back to where they were after it. Caddy only checks that the cookie is there; it vouches for nobody, and the hub trusts no header for identity. After 5 wrong passwords for one email from one address in a minute, or 20 for one email from any addresses in an hour, the login page answers *Too many attempts* for that email until the time it names; wrong current passwords at **Change password** count toward the same hourly limit. An email with no account is limited the same way, so the page never tells which accounts exist. A real person locked out by someone else's guesses waits out the hour, or an admin lifts every lock with `docker compose exec api php artisan cache:clear` ([Troubleshooting](troubleshooting.md#the-login-page-says-too-many-attempts)). Caddy tells browsers to use only HTTPS for this hostname for a year (`Strict-Transport-Security`, without subdomains), and the login pages cannot be shown inside another site's frame.

Trust: whoever holds `API_INTERNAL_TOKEN` and reaches the API can ask whose login a token is and manage accounts; the `/internal` routes are reachable only from the hub (Caddy answers 404 for them), and only with that token. Logins are random tokens the API stores only as hashes. `API_APP_KEY` encrypts the login form's own session cookie; changing it only makes open login forms start over.


## Optional: Cloudflare Tunnel

For a server without a public address or open ports (behind a home router, or a provider that blocks inbound traffic), Cloudflare can carry the traffic instead: cloudflared on the server dials out to Cloudflare, and Cloudflare serves the team hostname. The login stays the same Laravel login; Cloudflare only carries HTTPS. You need a domain on Cloudflare and an API token with Account: Cloudflare Tunnel: Edit and Zone: DNS: Edit for that domain.

What changes from the steps above:

- **Step 3:** also copy `deploy/cloudflare/cloudflared.compose.yaml`.
- **Step 5:** instead of an `A` record, run on your computer, in the repository, reading the token inside the command:

  ```sh
  CLOUDFLARE_API_TOKEN="$(op read 'op://<vault>/<item>/credential')" \
    bun scripts/deploy.ts cloudflare apply --zone example.com --hostname acme.example.com --name vinci-acme --env-out cloudflare.env
  ```

  It creates the tunnel `vinci-acme` with one route, the hostname to `http://caddy:80`, and the hostname's DNS record (`CNAME`, proxied), and writes `VINCI_PUBLIC_HOST` and the secret `TUNNEL_TOKEN` to `cloudflare.env` (mode 600; Git ignores it). Running it again prints `unchanged` for what is already right. It refuses a hostname that has a DNS record it did not make. Merge the file into the server's `.env` and delete it:

  ```sh
  ssh root@<server> 'umask 077 && cd /opt/vinci && { grep -v -E "^(VINCI_PUBLIC_HOST|TUNNEL_TOKEN)=" .env 2>/dev/null || true; cat; } > .env.new && mv .env.new .env' < cloudflare.env && rm cloudflare.env
  ```

- **Step 6:** set `COMPOSE_FILE=compose.yaml:caddy.compose.yaml:cloudflared.compose.yaml:users.compose.yaml` and skip `VINCI_PUBLIC_HOST`, which step 5 wrote.
- **Steps 7 and 8:** `docker compose ps` also lists `vinci-cloudflared-1`, and `docker compose logs cloudflared | grep -c "Registered tunnel connection"` shows `4` or more. `ss -tlnp` shows no ports 80 and 443: behind the tunnel Caddy serves plain HTTP to cloudflared only and needs no certificate.

Behind the tunnel every visitor reaches Caddy from cloudflared, so the login page's per-address limit counts them as one address; the per-email limit is unchanged. `bun scripts/deploy.ts cloudflare destroy` with the same `--zone`, `--hostname` and `--name` lists the tunnel and its DNS record, and deletes them with `--yes`. An install that still has the Cloudflare Access app of an older Vinci moves over as [Move from Cloudflare Access](admin.md#move-from-cloudflare-access) says.

## The whole install in one prompt

Fill in the angle brackets and paste:

> Install Vinci for my team by following `docs/team-workspace/install.md` in my Vinci checkout, steps 1 to 9 in order, and stop at the first step whose check fails. Server: `root@<server>` (`<ssh options, if any>`). Team hostname `<team hostname>`, which already points at the server (or: use the optional Cloudflare Tunnel with zone `<domain>`, tunnel name `vinci-<team>` and the API token at `<op://…>`, read inside the command that needs it, never printed or saved). People (id: email): `<id>: <email>, …`. First admin of the admin panel: `<email>`. Model keys: `<where they are, or "none, people add their own">`. Never print secrets or emails in public places. Create the first admin's login with `vinci:user` and tell me its password is in the output, once, without repeating it. Finish with the step 8 checks and the nightly backup of step 9 and tell me the address to log in at and the admin panel address (`/admin`), and remind me to change the password and to set Global settings and the suggested bots there before people log in.

## Install with cloud-init

A new server can install itself on its first boot: steps 1 to 9, done for you. People log in with an email and a password that Vinci keeps, and Caddy serves HTTPS with a Let's Encrypt certificate. You need a server as in [Before you start](#before-you-start), Ubuntu 24.04 or 26.04, and a hostname whose DNS A record points at it.

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
