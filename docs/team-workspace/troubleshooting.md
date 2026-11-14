# Troubleshooting

Known problems, what they look like, and the fix. Most end with a prompt you can paste to an AI coding agent.

## Every page or call fails with 403

Either the daemon does not accept the team address, or the hub does not know the person.

- The daemon: `MEETVINCI_PUBLIC_HOST` in `/opt/meetvinci/.env` must be the team address without `https://`. Compose turns it into `DAEMON_PUBLIC_URLS`. After a fix, run `docker compose up -d --wait`.
- The hub: the person's email must be in `/opt/meetvinci/users.yaml`, and `bun deploy.ts apply` must have run since the last edit.

> On `root@<server>`, in `/opt/meetvinci`, check that `MEETVINCI_PUBLIC_HOST` in `.env` is `<team>.<domain>`, that `<email>` is in `users.yaml`, and that `hub/users.json` lists it. If not, fix the file and run `bun deploy.ts apply`. Confirm `docker compose logs hub --since 5m` shows "Users loaded" with no error.

## A person sees "No workspace for this email"

They passed the Cloudflare login, but MeetVinci has no user with that email. With a domain rule this is what everyone at the domain who is not on the team sees; it is expected. If they should be on the team, add them in the admin panel. If they signed in with the wrong address, the page's **Sign out** link lets them try another. *This page is for admins* means the same for `/admin`: their email is not on the admin list.

> On `root@<server>`, in `/opt/meetvinci`, check whether `<email>` is in `users.yaml` (and enabled) or in `hub/admins.json`. Report which, without printing the other emails. Change nothing.

## Nobody can get in, and the hub log says the users file is invalid

`/opt/meetvinci/hub/users.json` is missing or was edited by hand, so the hub lets nobody in. `bun deploy.ts apply` writes it from `users.yaml` and checks the list first. After a rollback the log says `unrecognized_keys`: the older hub does not know a newer file. Copy that version's deployment files into `/opt/meetvinci` and run its `bun deploy.ts apply` ([Upgrades](admin.md#upgrades)).

> On `root@<server>`, in `/opt/meetvinci`, read the hub's latest log error about `users.json`, then run `bun deploy.ts apply` and confirm `docker compose logs hub --since 5m` shows the users loaded. Don't edit `hub/users.json` by hand.

## The admin panel answers 403

Your email is not in `/opt/meetvinci/hub/admins.json`, or the file is invalid (the hub log says so, and then nobody is an admin). Admins who are not users get 403 everywhere except `/admin`; that is expected.

> On `root@<server>`, in `/opt/meetvinci`, check that `hub/admins.json` is valid JSON of the form `{"admins": ["<email>"]}` and lists `<email>`. If it is broken, move it aside, set `HUB_ADMIN_EMAILS=<email>` in `.env` and run `docker compose up -d hub`. Confirm `docker compose logs hub --since 5m` shows "Admins seeded" or "Admins loaded" with no error.

## A person gets an error page (502) instead of their bots

When everyone gets it at once, check the firewall first (next section): people's networks let the hub through only while its rules are in place, and people's MeetVinci start only once the firewall is healthy. If the admin panel says `… predate the firewall`, the upgrade's `bun deploy.ts apply` has not run yet: run it on the server.

## The firewall is unhealthy

`bun deploy.ts firewall status` says what its checks found.

- `This server's Docker uses iptables-legacy`, or `No DOCKER-USER chain in iptables-nft`: Docker does not manage iptables through `iptables-nft` (`iptables-legacy`, its nftables backend, or `"iptables": false` in `/etc/docker/daemon.json`). MeetVinci does not run on such a host: `apply` stops before starting anyone's MeetVinci. Use a server whose `iptables --version` ends with `(nf_tables)`.
- `Rules were missing or out of place; restored …`: something deleted or moved the rules (a hand-made `iptables` or `nft` command, another firewall tool reloading). The check put them back and the next check is healthy again. Until then, at most about 2 seconds, bots could reach internal addresses. Find what removed them; ufw or firewalld reloads are a usual cause.
- `Docker's DOCKER-USER chain is gone`: someone emptied the whole firewall (`nft flush ruleset`, `iptables -F` with the wrong options), which removes Docker's own rules too. Within 2 seconds the check closes the server itself to bots again and stops everything they send through it, so containers have no internet until you restart Docker (`systemctl restart docker`); the firewall removes that stop and is healthy again after that.
- `FORWARD does not jump to DOCKER-USER` or `net.bridge.bridge-nf-call-iptables is … not 1`: Docker's own rules or the kernel no longer send people's traffic through the firewall. Restart Docker (`systemctl restart docker`), which puts its rules back; the firewall stays unhealthy until then.

While it is unhealthy, running workspaces keep running, but Compose starts none, so `apply` and the admin panel's changes fail.

> On `root@<server>`, in `/opt/meetvinci`, run `bun deploy.ts firewall status` and report what it says. If it lists restored rules, show `iptables -S INPUT | head -3` and `iptables -S DOCKER-USER | head -3` and look in `journalctl --since -1h` for what changed the firewall around that time. Don't edit the `MEETVINCI-DAEMONS` chains by hand.

When it is one person:

The hub checks that each person's MeetVinci has the ID it saw the first time. If the ID changed, it refuses to forward. That happens when someone's MeetVinci was reset on purpose, or when two people's settings point at the same MeetVinci.

- If you reset that person's MeetVinci on purpose: stop the hub (`docker compose stop hub`), delete their line in `/opt/meetvinci/hub/pins.json`, and start it (`docker compose start hub`). The hub keeps pins in memory and would write the old line back.
- Otherwise: check `hub/users.json` for a copied address. Don't change `pins.json` until you know which MeetVinci belongs to whom; the hub's log says which check failed.

> On `root@<server>`, the hub returns 502 for MeetVinci user `<name>`. Compare their `daemonUrl` in `/opt/meetvinci/hub/users.json` with everyone else's, and report what the hub's log says. Don't change `pins.json` unless I confirm their MeetVinci was reset on purpose.

## The admin panel cannot add, disable or remove people

The panel asks the provisioner, which runs `bun deploy.ts apply`. Its log names the step that failed: `docker compose logs provisioner --since 15m`.

- `EACCES` on `hub/users.json`: the `hub` folder is still owned by group 1000 from an older install. Run `bun deploy.ts apply` once by hand as root; it changes the folder to group root, mode 770.
- `PROVISIONER_TOKEN must be at least 32 random characters` or `CLOUDFLARE_ZONE and CLOUDFLARE_NAME … must be set`: the provisioner did not start. Fix `.env` and run `docker compose up -d --wait provisioner`.
- `docker compose up … failed`: the same failure as `apply` by hand would show; run `bun deploy.ts apply` on the server to see Compose's full message. `cannot start a paused container` means someone paused a container: `docker unpause` it. A failed add was undone, so try again.
- `Another apply or admin panel change is running (users.yaml.lock)`: a by-hand `apply` or another panel change was running. Try again in a minute. If nothing is running, a crash left the lock behind; it is ignored after 10 minutes, or delete `/opt/meetvinci/users.yaml.lock`.
- The panel says to add the email in Cloudflare Access by hand: there is no `CLOUDFLARE_API_TOKEN` on the server, or Cloudflare refused it (the log says `Access sync failed`). Run `cloudflare emails` from your computer ([admin tasks](admin.md#add-a-person), step 2) or [let the server do it](admin.md#let-the-server-update-cloudflare-access).

> On `root@<server>`, in `/opt/meetvinci`, the admin panel failed to change people. Report the errors in `docker compose logs provisioner --since 15m` and `stat -c "%u:%g %a" hub`, without printing secrets. If it does not print `1000:0 770`, run `bun deploy.ts apply` and confirm it ends with `Applied <n> users`. Change nothing else.

## Global settings don't open, or there is no `meetvinci-daemon-template-1`

The template workspace holds the global settings and the suggested bots. `bun deploy.ts apply` starts it; `docker compose up` alone does not, because only `apply` writes it into `users.compose.yaml`. This happens after an upgrade that skipped `apply`: the hub log's `Users loaded` line then says `template: false`.

> On `root@<server>`, in `/opt/meetvinci`, run `bun deploy.ts apply` and confirm it ends with `(and the template workspace)`, that `docker compose ps daemon-template` is healthy, and that the next `Users loaded` line in `docker compose logs hub` says `template: true`. Change nothing else.

## The admin panel says a setting follows global (409)

The person follows the global value for that section, so the panel does not change it for them. Change it under Global settings for everyone, or switch that section to *overridden* for this person first. The hub answers `409` with `SECTION_FOLLOWS_GLOBAL` and the section's name.

## *Back to global* shows no list, or the switch is refused

Before switching a person's section back to global, the panel asks the hub what the switch would remove, replace or add (`GET /admin/api/users/<id>/sections/<section>/preview`), and the switch carries that answer's marker.

- No list and no confirm button: the person's MeetVinci or the template workspace did not answer. Check `docker compose ps daemon-<id> daemon-template`; a turned-off person has no running MeetVinci, so turn them on first.
- The list reloads instead of switching (`409`): something changed in that section, for the person or in Global settings, after the list was shown, or the hub restarted. Read the new list and confirm again.
- `422` from a script calling the API: a switch of an overridden section needs the `marker` of a fresh preview. A section that already follows global takes `{ "mode": "global" }` alone and copies again.

## Global settings show *failed* for someone

The copy to that person did not work, usually because their MeetVinci was restarting. The reason is next to it in `/admin/api/global/status`. Once their container is healthy (`docker compose ps daemon-<id>`), run *Sync now*. A person who is turned off shows *pending* and catches up when turned on.

## Every global change answers 503

`/opt/meetvinci/hub/global.json` is unreadable or invalid, and `docker compose logs hub` says so. The hub refuses section changes rather than guess who follows what. Restore the file from a backup, or fix the JSON by hand; the hub picks it up on the next request.

**Give this to your agent:**

> On `root@<server>`, in `/opt/meetvinci`, the admin panel's global settings fail. Show me `docker compose logs hub --since 1h | grep -i global`, check that `hub/global.json` is valid JSON of the form `{"users": {"<id>": {"<section>": {"mode": ..., "sync": ...}}}}`, and check `docker compose ps daemon-template` is healthy. Don't edit the file without asking me.

## Reading a conversation or file in the admin panel fails with 503

The hub could not record the read in its audit trail, `/opt/meetvinci/hub/audit.sqlite`, so it refused the read. `docker compose logs hub` says `The audit trail could not record a read; the read is refused` with the cause. Usually the disk is full, or the file or the `hub` folder is no longer writable by uid 1000 (for example after a copy as root). If the log says `Audit trail … cannot be opened` instead, the file is damaged: everyone can still use MeetVinci, but the panel refuses reads until it opens. Stop the hub, move the file aside (`mv hub/audit.sqlite backups/`), and start the hub, which creates a new one; keep the old file as the record. Free space, or `chown 1000:1000 hub/audit.sqlite` and run `bun deploy.ts apply` as root to put the folder right. Changes made in the panel meanwhile still happened; the log has a `The audit trail could not record a change` line for each.

**Give this to your agent:**

> On `root@<server>`, in `/opt/meetvinci`, the admin panel refuses to show conversations with 503. Show me the last `audit trail` lines of `docker compose logs hub`, `df -h /opt/meetvinci` and `ls -ln hub`. If `hub/audit.sqlite` is not owned by uid 1000 or the folder is not `1000:0` mode 770, fix that (`chown 1000:1000 hub/audit.sqlite`, `bun deploy.ts apply`). Don't delete or edit the file.

## Bots never answer, with no error

A person's `/data/pi` folder is owned by root, so MeetVinci cannot write its model settings. This happens when a file is mounted into `/data/pi` and the folder did not exist yet.

- Fix: make `/data/pi` and `/data/home` owned by the container user (uid 1000).

> On `root@<server>`, check the owner of `/data/pi` and `/data/home` inside MeetVinci user `<name>`'s container. If they are owned by root, change them to uid 1000 and restart that container.

## Someone is logged out and sees "replaced" or "revoked"

Their browser's pairing ended. The hub pairs the browser again on its own. If the page still asks for a code, open `https://<team>.<domain>/hub/pair`.

If it happens often, someone may be removing the device in **Settings → Devices**, or the person's MeetVinci was reset.

## The page reloads by itself now and then

The Cloudflare login expired (24 hours by default). MeetVinci reloads the page, at most once a minute, so Cloudflare can ask the person to log in again. Unsent messages are kept.

- To make it rarer, run the Cloudflare setup again with a longer session, for example `--session 168h` (a week). A lost or shared device then stays logged in that long; removing the person from `users.yaml` and running `bun deploy.ts apply` still locks them out at once.

> In the MeetVinci repository, run `bun scripts/deploy.ts cloudflare apply` again with the same arguments as at install and `--session 168h`, with `CLOUDFLARE_API_TOKEN` read from `<where you keep it>` inside the same command. Confirm it prints `updated` only for the Access app.

## Adding to the home screen fails, or the icon is blank

The app's manifest and icons are behind the Cloudflare login.

- Check: `curl -s -o /dev/null -w '%{http_code}\n' https://<team>.<domain>/favicon.ico` must print 200 without a login.
- Fix: run `bun scripts/deploy.ts cloudflare apply` again. It restores the `meetvinci-<team>-favicon` Access application and the tunnel route for the icons.

> In the MeetVinci repository, run `bun scripts/deploy.ts cloudflare apply` again with the same arguments as at install, with `CLOUDFLARE_API_TOKEN` read from `<where you keep it>` inside the same command. Then check that `https://<team>.<domain>/favicon.ico` answers 200 without a login.

## One person cannot pair a new browser for a while

Each person's MeetVinci limits pairing attempts, and too many wrong codes cancel all of that person's pending codes. The hub also makes at most 5 codes per person every 10 minutes. This only affects that one person, not the team.

- Fix: wait 10 minutes and open `https://<team>.<domain>` again.

> On `root@<server>`, read the last 30 minutes of the hub log and MeetVinci user `<name>`'s log and tell me whether pairing attempts were rejected or throttled.

## A model key change does nothing

MeetVinci reads `models.json` only when it starts. A key entered in **Settings → Providers** also wins over `models.json`.

- Fix: restart that person's container after editing `models.json`. If they set their own key in Settings, theirs is used.

> Restart only MeetVinci user `<name>`'s container on `root@<server>` and confirm it is healthy.

## A new skill does not show up

Skills are picked up within about 30 seconds. They must sit in the person's volume, not inside the container's system files.

- Fix: put the skill in `/data/home/.agents/skills/<skill>/`, owned by uid 1000. That folder does not exist until the first shared skill; create it then.

> On `root@<server>`, check that `/data/home/.agents/skills/<skill>/SKILL.md` exists in MeetVinci user `<name>`'s volume and is owned by uid 1000.

## A bot cannot install software

Containers are locked down: no root, read-only system files, so `apt` fails and so does installing into the system. Bots' commands run in the sandbox, which has Bun, Node with npm, Python with pip and uv, git, curl and the usual tools ([what a bot can do](admin.md#what-a-bot-can-do-and-reach)). Bots install into their home folder instead: `npm i -g`, `pip install --user`, `uv tool install` and `bun add -g` work and survive restarts. A package that compiles code while installing fails: there is no compiler. If every install fails with a read-only error, `docker compose logs sandbox-<id>` says `is not writable`: run `bun deploy.ts apply`. MeetVinci itself ships without ffmpeg, so videos get no preview thumbnail.

## Memory runs low

Each person's MeetVinci is limited to 512 MB, and so is their sandbox, where bots' commands use their memory (about 3 MB idle, plus about 5 MB in their MeetVinci once a bot has used a tool). On a 4 GB x86 server, an idle person's MeetVinci used 90-135 MB, the template workspace (global settings) about 106 MB, the web app 47-70 MB, cloudflared about 38 MB, the hub 14-21 MB and the provisioner 6-65 MB; the system and Docker about 470 MB. Count the template workspace as one more person. An artifact preview or a heavy tool run adds 100 MB or more. Plan up to 5 people on 4 GB, so that everyone and the template workspace can reach their limit at once, and about 13 on 8 GB. Don't build images on the server: building made Docker itself hold almost 800 MB.

> On `root@<server>`, show memory use per MeetVinci container with `docker stats --no-stream` and the server's free memory with `free -h`. Suggest whether the server needs more memory.

## The disk fills up

Images are built on your computer, so the server has no build cache. What grows is old image tags after upgrades, backups in `/opt/meetvinci/backups/`, and people's sandbox disks in `/opt/meetvinci/disks/` (each at most `SANDBOX_DISK`; `bun deploy.ts status` shows them and the server's free space). `du -sh /opt/meetvinci/disks/*/agents /opt/meetvinci/disks/*/bot-home/.cache` shows what each person's bots keep; a cache folder (`bot-home/.cache`) can be deleted at any time, tools fill it again. Docker's logs are capped at 30 MB per container.

- Fix: remove old MeetVinci image tags by name, `docker rmi meetvinci-daemon:<old tag> meetvinci-sandbox:<old tag> meetvinci-web:<old tag> meetvinci-hub:<old tag> meetvinci-provisioner:<old tag> meetvinci-firewall:<old tag>`, and old backups by file name. Nightly backups delete their own old runs; keep fewer with `BACKUP_KEEP_DAILY` and `BACKUP_KEEP_WEEKLY` in `.env`. Backups made by hand and the copies `restore` saves first (`backups/<id>-<time>.tar.gz`) stay until you delete them. Never run `docker system prune`, `docker volume prune` or `docker image prune`: they act on the whole server and can delete people's data or other services' images.

> On `root@<server>`, show `docker system df`, `docker images` and `ls -la /opt/meetvinci/backups`. Suggest which old `meetvinci-*` tags (not the `MEETVINCI_TAG` in `/opt/meetvinci/.env`) and which backups can go, and remove only the ones I confirm, by name. Never use a prune command.

## A bot cannot reach a service on the server or the private network

On purpose: bots reach the public internet only ([what a bot can reach](admin.md#what-a-bot-can-do-and-reach)). If every person really needs one internal service, add its `<IPv4>:<port>` to `MEETVINCI_INTERNAL_ALLOW` in `/opt/meetvinci/.env` and run `bun deploy.ts apply`; `docker compose logs firewall` then names it after `except`. Name the address the bot connects to: for a service on the server itself, its address on Docker's bridge (`172.17.0.1`) or the person's gateway, and the service must listen there.

> On `root@<server>`, bots must reach `<address>:<port>`. Add it to `MEETVINCI_INTERNAL_ALLOW` in `/opt/meetvinci/.env` (comma separated, keep existing entries), run `bun deploy.ts apply`, and confirm `docker compose logs firewall | tail -1` lists it. Change nothing else.

## Bots say "No space left on device"

The person's sandbox disk is full: `bun deploy.ts status` shows `disk FULL` for them. Their chats and settings keep working; files they send in the app are refused with *Your bots' disk is full*.

- Fix: the person or their bot deletes files in the bot folders they no longer need, or raise `SANDBOX_DISK` in `.env` and run `bun deploy.ts apply`, which grows every disk at once ([disk limits](admin.md#disk-limits)).
- `disk not mounted` instead: the server rebooted without mounting the disks (`systemctl status meetvinci-disks.service`), so that person's MeetVinci did not start. `bun deploy.ts disks mount`, then `docker compose up -d`; if the mount fails, see [a sandbox disk does not mount](#a-sandbox-disk-does-not-mount).

> On `root@<server>`, in `/opt/meetvinci`, bots of user `<id>` say "No space left on device". Report `bun deploy.ts status` and `du -sh disks/<id>.img`, and list the 20 biggest files on their disk, bot folders and bots' home (`du -a disks/<id>/agents disks/<id>/bot-home | sort -n | tail -20`). Delete nothing; tell me what takes the space.

## A sandbox disk does not mount

`bun deploy.ts status` shows `disk not mounted` for one person after a reboot or a crash, `systemctl status meetvinci-disks.service` says `Could not mount disks/<id>.img`, or `apply` stops with *has errors e2fsck -p cannot repair*. The boot unit and `apply` check each disk the way the server checks its own (`e2fsck -p`) and mount everyone else's; this person's MeetVinci stays stopped, so nothing is written outside their disk, until you repair it. In `/opt/meetvinci`:

```sh
e2fsck -fy disks/<id>.img            # repairs; if it says the superblock is bad: e2fsck -fy -b 32768 disks/<id>.img
bun deploy.ts disks mount && docker compose up -d
```

If it cannot be repaired, give the person a new disk and put their bot folders back from the last backup: `mv disks/<id>.img disks/<id>.img.broken`, `bun deploy.ts apply` (a new, empty disk), then `bun deploy.ts restore <id> <their latest backup>` ([backups](admin.md#backups)). Delete `disks/<id>.img.broken` once the person has what they need.

> On `root@<server>`, in `/opt/meetvinci`, the sandbox disk of user `<id>` does not mount. Report `bun deploy.ts status` and `e2fsck -n disks/<id>.img`. Change nothing; tell me whether `e2fsck -fy` can repair it.

## What a bot can do

A bot's commands and file tools run in its person's sandbox, not in their MeetVinci ([what a bot can reach](admin.md#what-a-bot-can-do-and-reach)). With the **Full** permission it can still read, change and delete every file in all of that person's bots' folders, read their shared skills and instructions, use their saved secrets through the proxy (only toward each secret's hosts, never seeing the value), run any program as an ordinary user, install programs into the home folder all of that person's bots share, and reach the public internet, so it can send whatever those folders hold anywhere. It can no longer read the model keys, the secrets' values, the database or the person's devices, nor act as the person through their private door, nor touch the folder the hub uses to pair browsers. Stdio MCP servers set by an admin still run inside the person's MeetVinci for now. Give bots the read-only or ask permission mode when they don't need more.

## Bots say "Bot tools are off"

The person's sandbox is not running, so their MeetVinci refuses every tool call rather than run it itself. Chats and answers without tools still work.

- `bun deploy.ts status` shows `sandbox exited` or `missing` for that person, or `running (unhealthy)` when the sandbox is up but has no connection to their MeetVinci.
- Fix: `bun deploy.ts apply` starts every missing sandbox. `docker compose logs sandbox-<id>` shows why it stopped. A sandbox someone stopped with `docker stop` or `docker kill` stays stopped until then; one that crashed restarts by itself within seconds.
- *The sandbox where bot tools run stopped during this tool call* means it stopped while a command ran: the next call reconnects.

> On `root@<server>`, in `/opt/meetvinci`, bots of MeetVinci user `<id>` say "Bot tools are off". Report `bun deploy.ts status` and the last 20 lines of `docker compose logs sandbox-<id>` and `docker compose logs daemon-<id> | grep -A3 sandbox`, then run `bun deploy.ts apply` and confirm `bun deploy.ts status` exits 0.

## An MCP server shows an error in the bot's MCP tab

MCP servers that run a command run in the person's sandbox (see [What a bot can reach](admin.md#what-a-bot-can-do-and-reach)), never in their MeetVinci.

- *MCP servers that run a command are off: the sandbox … is not running*: the same cause and fix as *Bot tools are off* above. Bots that used the server's tools get the same sentence when they call one. The next message after `apply` starts the server again.
- *The command … is not installed in the sandbox where this MCP server runs*: the sandbox has no such program. `npx`, `uvx`, `node`, `python3` and `bun` are there ([tools](admin.md#what-a-bot-can-do-and-reach)); for anything else, install the package into a folder under the bot's own folder and run its entry file.
- *Cannot connect to MCP server.* for an `npx` server that worked before, with `npm error enoent Could not read package.json … /home/bot/.cache/npm/_npx/…` when the same command runs in the sandbox: an install was cut off (the sandbox restarted during the first download) and left a broken npx cache, which the persistent home keeps. Delete it and connect again: `docker compose exec sandbox-<id> rm -rf /home/bot/.cache/npm/_npx` (a bot can do the same).
- *The MCP server stopped during this call*: the server exited or its sandbox restarted mid-call; the effect of that call is unknown, and the bot's next message starts the server again.
- A server that blocks the person's bot tools (*Resource temporarily unavailable*): it filled the sandbox's process or memory limit. Remove or turn it off in the bot's MCP tab; everything it started stops with it.

> On `root@<server>`, in `/opt/meetvinci`, an MCP server of MeetVinci user `<id>` shows an error. Report `bun deploy.ts status`, the processes in the sandbox (`docker compose exec sandbox-<id> sh -c 'for d in /proc/[0-9]*; do tr "\0" " " < $d/cmdline; echo; done'`) and the MCP lines of `docker compose logs daemon-<id> --tail 200`. Change nothing.
