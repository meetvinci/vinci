# Troubleshooting

Known problems, what they look like, and the fix. Most end with a prompt you can paste to an AI coding agent.

## Every page or call fails with 403

Either the daemon does not accept the team address, or the hub does not know the person.

- The daemon: `ORBS_PUBLIC_HOST` in `/opt/orbs/.env` must be the team address without `https://`. Compose turns it into `DAEMON_PUBLIC_URLS`. After a fix, run `docker compose up -d --wait`.
- The hub: the person's email must be in `/opt/orbs/users.yaml`, and `bun deploy.ts apply` must have run since the last edit.

> On `root@<server>`, in `/opt/orbs`, check that `ORBS_PUBLIC_HOST` in `.env` is `<team>.<domain>`, that `<email>` is in `users.yaml`, and that `hub/users.json` lists it. If not, fix the file and run `bun deploy.ts apply`. Confirm `docker compose logs hub --since 5m` shows "Users loaded" with no error.

## Nobody can get in, and the hub log says the users file is invalid

`/opt/orbs/hub/users.json` is missing or was edited by hand, so the hub lets nobody in. `bun deploy.ts apply` writes it from `users.yaml` and checks the list first.

> On `root@<server>`, in `/opt/orbs`, read the hub's latest log error about `users.json`, then run `bun deploy.ts apply` and confirm `docker compose logs hub --since 5m` shows the users loaded. Don't edit `hub/users.json` by hand.

## A person gets an error page (502) instead of their bots

The hub checks that each person's Orbs has the ID it saw the first time. If the ID changed, it refuses to forward. That happens when someone's Orbs was reset on purpose, or when two people's settings point at the same Orbs.

- If you reset that person's Orbs on purpose: stop the hub (`docker compose stop hub`), delete their line in `/opt/orbs/hub/pins.json`, and start it (`docker compose start hub`). The hub keeps pins in memory and would write the old line back.
- Otherwise: check `hub/users.json` for a copied address. Don't change `pins.json` until you know which Orbs belongs to whom; the hub's log says which check failed.

> On `root@<server>`, the hub returns 502 for Orbs user `<name>`. Compare their `daemonUrl` in `/opt/orbs/hub/users.json` with everyone else's, and report what the hub's log says. Don't change `pins.json` unless I confirm their Orbs was reset on purpose.

## Bots never answer, with no error

A person's `/data/pi` folder is owned by root, so Orbs cannot write its model settings. This happens when a file is mounted into `/data/pi` and the folder did not exist yet.

- Fix: make `/data/pi` and `/data/home` owned by the container user (uid 1000).

> On `root@<server>`, check the owner of `/data/pi` and `/data/home` inside Orbs user `<name>`'s container. If they are owned by root, change them to uid 1000 and restart that container.

## Someone is logged out and sees "replaced" or "revoked"

Their browser's pairing ended. The hub pairs the browser again on its own. If the page still asks for a code, open `https://<team>.<domain>/hub/pair`.

If it happens often, someone may be removing the device in **Settings → Devices**, or the person's Orbs was reset.

## The page reloads by itself now and then

The Cloudflare login expired (24 hours by default). Orbs reloads the page, at most once a minute, so Cloudflare can ask the person to log in again. Unsent messages are kept.

- To make it rarer, run the Cloudflare setup again with a longer session, for example `--session 168h` (a week). A lost or shared device then stays logged in that long; removing the person from `users.yaml` and running `bun deploy.ts apply` still locks them out at once.

> In the Orbs repository, run `bun scripts/deploy.ts cloudflare apply` again with the same arguments as at install and `--session 168h`, with `CLOUDFLARE_API_TOKEN` read from `<where you keep it>` inside the same command. Confirm it prints `updated` only for the Access app.

## Adding to the home screen fails, or the icon is blank

The app's manifest and icons are behind the Cloudflare login.

- Check: `curl -s -o /dev/null -w '%{http_code}\n' https://<team>.<domain>/favicon.ico` must print 200 without a login.
- Fix: run `bun scripts/deploy.ts cloudflare apply` again. It restores the `orbs-<team>-favicon` Access application and the tunnel route for the icons.

> In the Orbs repository, run `bun scripts/deploy.ts cloudflare apply` again with the same arguments as at install, with `CLOUDFLARE_API_TOKEN` read from `<where you keep it>` inside the same command. Then check that `https://<team>.<domain>/favicon.ico` answers 200 without a login.

## One person cannot pair a new browser for a while

Each person's Orbs limits pairing attempts, and too many wrong codes cancel all of that person's pending codes. The hub also makes at most 5 codes per person every 10 minutes. This only affects that one person, not the team.

- Fix: wait 10 minutes and open `https://<team>.<domain>` again.

> On `root@<server>`, read the last 30 minutes of the hub log and Orbs user `<name>`'s log and tell me whether pairing attempts were rejected or throttled.

## A model key change does nothing

Orbs reads `models.json` only when it starts. A key entered in **Settings → Providers** also wins over `models.json`.

- Fix: restart that person's container after editing `models.json`. If they set their own key in Settings, theirs is used.

> Restart only Orbs user `<name>`'s container on `root@<server>` and confirm it is healthy.

## A new skill does not show up

Skills are picked up within about 30 seconds. They must sit in the person's volume, not inside the container's system files.

- Fix: put the skill in `/data/home/.agents/skills/<skill>/`, owned by uid 1000.

> On `root@<server>`, check that `/data/home/.agents/skills/<skill>/SKILL.md` exists in Orbs user `<name>`'s volume and is owned by uid 1000.

## A bot cannot install software, or git and curl are missing

Containers are locked down: no root, read-only system files. `apt`, `npm -g` and `pip` installs fail. The image also ships without git, curl and ffmpeg, so videos get no preview thumbnail. This is on purpose for now.

## Memory runs low

Each person's Orbs is limited to 512 MB. On a 4 GB x86 server, an idle person's Orbs used about 105 MB, the web app 35-55 MB, cloudflared 15-35 MB and the hub 12 MB; the system and Docker about 470 MB. An artifact preview or a heavy tool run adds 100 MB or more. Plan up to 6 people on 4 GB, so that everyone can reach their limit at once, and about 14 on 8 GB. Don't build images on the server: building made Docker itself hold almost 800 MB.

> On `root@<server>`, show memory use per Orbs container with `docker stats --no-stream` and the server's free memory with `free -h`. Suggest whether the server needs more memory.

## The disk fills up

Images are built on your computer, so the server has no build cache. What grows is old image tags after upgrades and backups in `/opt/orbs/backups/`.

- Fix: remove old Orbs image tags by name, `docker rmi orbs-daemon:<old tag> orbs-web:<old tag> orbs-hub:<old tag>`, and old backups by file name. Never run `docker system prune`, `docker volume prune` or `docker image prune`: they act on the whole server and can delete people's data or other services' images.

> On `root@<server>`, show `docker system df`, `docker images` and `ls -la /opt/orbs/backups`. Suggest which old `orbs-*` tags (not the `ORBS_TAG` in `/opt/orbs/.env`) and which backups can go, and remove only the ones I confirm, by name. Never use a prune command.

## What a bot can do

Until the hardening phase, a bot that can run commands has full control of its own person's Orbs: it can read that person's model key and saved secrets, and give itself access as that person. It can also tamper with the folder the hub uses to pair that person's browser. The hub refuses anything there that is not a real socket, but a bot can still swap the socket at the exact moment the hub uses it. What really keeps a bot away from other people's Orbs is that each person's Orbs sits on its own network that only the hub can reach (set up by the deployment files). Only invite people you trust, and give bots the read-only or ask permission mode when they don't need more.
