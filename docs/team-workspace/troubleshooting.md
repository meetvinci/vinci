# Troubleshooting

Known problems, what they look like, and the fix. Most end with a prompt you can paste to an AI coding agent.

## Every page or call fails with 403

Either the daemon does not accept the team address, or the hub does not know the person.

- The daemon: set `DAEMON_PUBLIC_URLS=https://<team>.<domain>` on every daemon and restart them. See [configuration](configuration.md).
- The hub: the person's email must be in `users.json`, and the file must load without errors.

> On `root@<server>`, check that every Orbs daemon container has `DAEMON_PUBLIC_URLS` set to `https://<team>.<domain>`, and that `<email>` is in the hub's `users.json` and the hub's log shows the file loaded after its last edit. Fix and restart only what is wrong.

## Nobody can get in, and the hub log says the users file is invalid

`users.json` is missing or has a mistake, so the hub lets nobody in. Common mistakes: a missing comma, or the same id, address or socket path used twice.

> On `root@<server>`, read the hub's latest log error about `users.json`, fix the file without removing anyone, and confirm the hub's log shows the users loaded.

## A person gets an error page (502) instead of their bots

The hub checks that each person's Orbs has the ID it saw the first time. If the ID changed, it refuses to forward. That happens when someone's Orbs was reset on purpose, or when two people's settings point at the same Orbs.

- If you reset that person's Orbs on purpose: delete their line in the hub's `pins.json`.
- Otherwise: check `users.json` for a copied address. Don't change `pins.json` until you know which Orbs belongs to whom; the hub's log says which check failed.

> On `root@<server>`, the hub returns 502 for Orbs user `<name>`. Compare their `daemonUrl` in `users.json` with everyone else's, and report what the hub's log says. Don't change `pins.json` unless I confirm their Orbs was reset on purpose.

## Bots never answer, with no error

A person's `/data/pi` folder is owned by root, so Orbs cannot write its model settings. This happens when a file is mounted into `/data/pi` and the folder did not exist yet.

- Fix: make `/data/pi` and `/data/home` owned by the container user (uid 1000).

> On `root@<server>`, check the owner of `/data/pi` and `/data/home` inside Orbs user `<name>`'s container. If they are owned by root, change them to uid 1000 and restart that container.

## Someone is logged out and sees "replaced" or "revoked"

Their browser's pairing ended. The hub pairs the browser again on its own. If the page still asks for a code, open `https://<team>.<domain>/hub/pair`.

If it happens often, someone may be removing the device in **Settings → Devices**, or the person's Orbs was reset.

## The page reloads by itself now and then

The Cloudflare login expired (24 hours by default). Orbs reloads the page, at most once a minute, so Cloudflare can ask the person to log in again. Unsent messages are kept.

- To make it rarer, run the Cloudflare setup again with a longer session, for example `--session 168h` (a week). A lost or shared device then stays logged in that long; removing the person from `users.json` still locks them out at once.

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

Each person's Orbs is limited to 512 MB. On a Mac test it used about 120 MB idle and 190 MB after an artifact preview; these numbers are not yet confirmed on a server. Plan about 5 people on 4 GB and 12 on 8 GB. Don't build images on the server: building made Docker itself hold almost 800 MB.

> On `root@<server>`, show memory use per Orbs container with `docker stats --no-stream` and the server's free memory with `free -h`. Suggest whether the server needs more memory.

## The disk fills up

Docker build caches grow fast, about 14 GB after a few builds.

> On `root@<server>`, show Docker disk use with `docker system df` and remove the build cache with `docker builder prune`. Do not remove volumes.

## What a bot can do

Until the hardening phase, a bot that can run commands has full control of its own person's Orbs: it can read that person's model key and saved secrets, and give itself access as that person. It can also tamper with the folder the hub uses to pair that person's browser. The hub refuses anything there that is not a real socket, but a bot can still swap the socket at the exact moment the hub uses it. What really keeps a bot away from other people's Orbs is that each person's Orbs sits on its own network that only the hub can reach (set up by the deployment files). Only invite people you trust, and give bots the read-only or ask permission mode when they don't need more.
