# Install

Set up a server for one team. Do the steps in order. Each step ends with a prompt you can paste to an AI coding agent that has SSH access to the server.

> [!NOTE]
> The deployment files are not written yet. Steps marked `TODO(wave 2)` will get their exact commands then. Everything else here is already certain.

## Before you start

You need:

- **A server.** Ubuntu 24.04 on x86 (amd64), with root SSH access.
  - Memory: 4 GB for up to about 5 people, 8 GB for up to about 12.
  - Disk: at least 40 GB. Docker images and build caches grow quickly.
  - The CPU must support AVX2. Most current servers do.
- **A domain on Cloudflare**, for example `example.com`. The team gets one name under it, for example `acme.example.com`.
- **A Cloudflare API token** with these permissions:
  - Account: Cloudflare Tunnel: Edit
  - Account: Access: Apps and Policies: Edit
  - Zone: DNS: Edit, for your domain

  Nothing else is needed. The setup uses no Access service tokens.
- **Bun and a checkout of this repository** on the computer you set up from. The Cloudflare step runs there, not on the server.
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

`TODO(wave 2)`: how the images reach the server (built in CI and pulled, or built from a checkout). Don't build images on a small production server: it uses a lot of memory and disk.

**Give this to your agent:**

> `TODO(wave 2)`

## 4. Create the Cloudflare objects

One command creates everything the team needs in Cloudflare. Run it on your computer, in the repository:

```sh
CLOUDFLARE_API_TOKEN="$(op read 'op://<vault>/<item>/credential')" \
  bun scripts/deploy.ts cloudflare apply \
  --zone example.com --hostname acme.example.com --name orbs-acme \
  --users users.json --env-out cloudflare.env
```

- `--name` must start with `orbs-`. Every object gets this exact name, or this name and a suffix. The script only ever changes or deletes objects with these names.
- `--users` is the hub's `users.json` (see [admin tasks](admin.md#the-user-list)). Its emails are the people allowed to log in. Use `--users -` to read it from the server: `ssh root@<server> cat <users.json> | bun scripts/deploy.ts cloudflare apply … --users -`.
- `--env-out` writes the values the server needs, including the secret tunnel token, to a file only you can read.
- `--session 24h` is the default login length. Longer sessions (for example `168h`, a week) mean fewer email codes on phones, but a lost or shared device stays logged in for that long. Removing someone from `users.json` still locks them out within a second.
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

> In the Orbs repository, run `bun scripts/deploy.ts cloudflare apply --zone <domain> --hostname <team>.<domain> --name orbs-<team> --users <users.json> --env-out cloudflare.env` with `CLOUDFLARE_API_TOKEN` read from `<where you keep it>` inside the same command. Don't print the token and don't save it anywhere. Show me the output, except the token.

## 5. Put the tunnel token on the server

The tunnel connector, cloudflared, runs as a container next to the hub; the Compose file starts it. It needs only the values from `cloudflare.env`, in `/opt/orbs/.env`. This command merges them into that file, keeps its other lines, keeps it readable by root only, and then deletes the local copy:

```sh
ssh root@<server> 'umask 077 && cd /opt/orbs && { grep -v -E "^(ORBS_PUBLIC_HOST|ACCESS_TEAM_DOMAIN|ACCESS_AUD|TUNNEL_TOKEN)=" .env 2>/dev/null || true; cat; } > .env.new && mv .env.new .env' < cloudflare.env && rm cloudflare.env
```

The token lets anyone run a connector for this tunnel. Treat it like a password.

After Orbs starts (next step), `docker logs` of the cloudflared container shows four `Registered tunnel connection` lines.

**Give this to your agent:**

> Merge `cloudflare.env` into `/opt/orbs/.env` on `root@<server>` with the command in step 5 of the install guide, then delete `cloudflare.env`. Confirm `/opt/orbs/.env` is mode 600 and owned by root. Don't print the file.

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

## 6. Start Orbs

`TODO(wave 2)`: the Compose file, the hub's user list, and the start command. What is already certain:

- one container per person, each with its own data volume, on its own network that only the hub can reach
- one web app container and one hub container
- the hub reads the team's user list from `users.json` (see [configuration](configuration.md))
- containers restart on their own after a crash or reboot

The images are built by `bun run build:images` from the repository (`deploy/docker/Dockerfile`); `TODO(wave 2)`: where they are built and how they reach the server.

**Give this to your agent:**

> `TODO(wave 2)`

## 7. Check it works

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

> `TODO(wave 2)`: run the deployment check.

## Next

[Add the team's people and their model keys](admin.md).
