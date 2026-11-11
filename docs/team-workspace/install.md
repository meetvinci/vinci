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

One team needs these in Cloudflare:

1. **A tunnel** for this server. Its credentials file goes on the server, readable only by root.
2. **DNS:** `<team>.<domain>` pointing at the tunnel (a proxied CNAME to `<tunnel-id>.cfargotunnel.com`). Optionally `<team>-ssh.<domain>` for SSH through the tunnel.
3. **An Access application** for `<team>.<domain>`, with a policy that allows the team's emails. Login method: one-time PIN by email, or your company's identity provider. Note the application's **AUD** tag: the hub needs it.
4. **Bypass rules** for the app icon files: an Access application for `<team>.<domain>/img/favicon/*` and one for `<team>.<domain>/favicon.ico`, each with a **Bypass, Everyone** policy. Without them, adding Orbs to a phone's home screen fails. These files are public and hold nothing secret.
5. **Optional:** an Access application for `<team>-ssh.<domain>` that allows only the admin's email.

Session length: Access logs people out after 24 hours by default. Consider a week for a home-screen app.

`TODO(wave 2)`: the exact commands or script that create these with the API token.

**Give this to your agent:**

> Using the Cloudflare API token in `<where you keep it>`, create for team `<team>` on domain `<domain>`: a tunnel, a proxied DNS name `<team>.<domain>` to it, an Access application on that name allowing `<emails>` with email one-time PIN login, and Bypass-Everyone Access applications on `<team>.<domain>/img/favicon/*` and `<team>.<domain>/favicon.ico`. Put the tunnel credentials on the server as a root-only file. Tell me the Access team domain and the AUD tag. Do not print the token or the credentials. `TODO(wave 2)`: use the deploy skill.

## 5. Install cloudflared

These commands install Cloudflare's tunnel program from Cloudflare's package repository:

```sh
curl -fsSL https://pkg.cloudflare.com/cloudflare-public-v2.gpg -o /usr/share/keyrings/cloudflare-public-v2.gpg
echo "deb [signed-by=/usr/share/keyrings/cloudflare-public-v2.gpg] https://pkg.cloudflare.com/cloudflared any main" > /etc/apt/sources.list.d/cloudflared.list
apt-get update && apt-get install -y cloudflared
```

`TODO(wave 2)`: the tunnel config file and how it runs (a system service or a container).

**Give this to your agent:**

> SSH to `root@<server>`, install cloudflared from Cloudflare's apt repository, and stop there. `TODO(wave 2)`: configure and start the tunnel.

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

1. Open `https://<team>.<domain>` in a private browser window. You should see the Cloudflare login.
2. Log in with a team email and the code you get by email.
3. Orbs opens and shows that person's bots. The browser pairs itself; there is no PIN and no device name to type.
4. Open `https://<team>.<domain>` from a computer whose email is not on the list. Cloudflare should refuse it.

**Give this to your agent:**

> `TODO(wave 2)`: run the deployment check.

## Next

[Add the team's people and their model keys](admin.md).
