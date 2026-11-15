# syntax=docker/dockerfile:1
# MeetVinci container images: one build stage, then the hub, web, daemon, sandbox, provisioner and firewall targets.
# Build from the repo root: bun run build:images (see scripts/deploy.ts).
# Every image runs as uid 1000 under tini and works with a read-only root, a /tmp tmpfs, cap_drop ALL and no-new-privileges.
# Bundles run with --no-install: an unresolved optional import must fail, not download a package from npm at runtime.
ARG BUN_IMAGE=oven/bun:1.4.4
# The Docker CLI and its Compose plugin for the provisioner: static binaries, nothing else from this image.
ARG DOCKER_CLI_IMAGE=docker:29.8.2-cli
# Node with npm and npx, and uv, for the sandbox: the binaries only. Node is the same Debian release as the Bun image.
ARG NODE_IMAGE=node:24.22.0-trixie-slim
ARG UV_IMAGE=ghcr.io/astral-sh/uv:0.13.0

FROM ${BUN_IMAGE}-slim AS build
WORKDIR /src
COPY . .
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile
# The server bundle the desktop app ships: built web app, Bun bundles of the web server and daemon,
# migrations, the Takumi binding, Photon's WebAssembly and its worker, and the prebuilt artifact embed. No other
# node_modules reach the runtime images.
RUN bun scripts/desktop.ts bundle

FROM build AS hub-build
RUN bun build apps/hub/src/entry.native.ts --target=bun --outdir=/out/hub

# pi-env, the small remote-execution program Pi ships prebuilt for every platform: the sandbox needs only this
# machine's. Checked against the SHA-256 of @earendil-works/pi-env 1.4.0's binaries; a new version needs new sums.
FROM build AS pi-env
ARG TARGETARCH
RUN arch=$(echo "$TARGETARCH" | sed s/amd64/x64/) \
 && case "$arch" in \
      x64) sum=46dde0e25b5cf1a327a10ddcb25f746f85b783492f5b225dfaa1a0d84cf5b56a ;; \
      arm64) sum=2a98a5576aed5f24b1b218e3025dcf6a2ea005ecbd8115aef63e443e6e8bffb8 ;; \
      *) sum=unknown ;; \
    esac \
 && cp "packages/runtime/node_modules/@earendil-works/pi-env/bin/pi-env-linux-$arch/pi-env" /pi-env \
 && echo "$sum  /pi-env" | sha256sum -c -

# tini for every image, and an empty /data the distroless hub cannot create itself.
FROM ${BUN_IMAGE}-slim AS tini
RUN apt-get update && apt-get install -y --no-install-recommends tini && rm -rf /var/lib/apt/lists/* \
 && mkdir /data && chown 1000:1000 /data

# The hub: verifies Cloudflare Access and routes each user to their daemon. users.json and pins.json live
# on the /data volume. It reaches daemon owner sockets, so it runs as the same uid as the daemons.
# HUB_PUBLIC_URL, HUB_WEB_URL, ACCESS_TEAM_DOMAIN and ACCESS_AUD come at run time.
FROM ${BUN_IMAGE}-distroless AS hub
COPY --from=tini /usr/bin/tini-static /usr/bin/tini
COPY --from=tini /data /data
COPY --from=hub-build /out/hub /app/hub
USER 1000:1000
ENV HUB_HOST=0.0.0.0 HUB_PORT=47192 HUB_DATA_DIR=/data
EXPOSE 47192
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD ["bun", "-e", "process.exit((await fetch(`http://127.0.0.1:${process.env.HUB_PORT}/hub/health`)).ok ? 0 : 1)"]
ENTRYPOINT ["tini", "--", "bun", "--no-install", "/app/hub/entry.native.js"]

# The web app: SSR and static assets. It stores nothing.
FROM ${BUN_IMAGE}-distroless AS web
COPY --from=tini /usr/bin/tini-static /usr/bin/tini
COPY --from=build /src/apps/desktop/dist/server/web /app/web
USER 1000:1000
ENV WEB_HOST=0.0.0.0 WEB_PORT=47190
EXPOSE 47190
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD ["bun", "-e", "process.exit((await fetch(`http://127.0.0.1:${process.env.WEB_PORT}/favicon.ico`)).ok ? 0 : 1)"]
ENTRYPOINT ["tini", "--", "bun", "--no-install", "/app/web/src/application/server.bun.js"]

# One daemon per user. All state, HOME and the Pi agent directory live on the /data volume.
# Debian slim, not distroless: `deploy.ts` runs its tools service and GnuPG (the off-site backup) from this image. Bot
# tools run in the person's sandbox (below), never here, in a team install.
FROM ${BUN_IMAGE}-slim AS daemon
RUN apt-get update && apt-get install -y --no-install-recommends gpg gpg-agent && rm -rf /var/lib/apt/lists/*
COPY --from=tini /usr/bin/tini-static /usr/bin/tini
COPY --from=build /src/apps/desktop/dist/server/daemon /app/daemon
COPY --chmod=755 deploy/docker/meetvinci.sh /usr/local/bin/meetvinci
COPY --chmod=755 deploy/docker/firewall-wait.sh /usr/local/bin/firewall-wait
# A fresh named volume copies these directories with their owner, so the daemon can write them. data/ipc exists so
# a nested mount of the owner-socket folder there does not make Docker create data/ as root. agents, home/.agents and
# bot-home exist for the sandbox's mounts of those subpaths; /run/sandbox is the folder the daemon shares with its sandbox.
RUN mkdir -p /data/home/.agents /data/agents /data/bot-home /data/pi /data/data/ipc /run/sandbox && chown -R 1000:1000 /data /run/sandbox
USER 1000:1000
WORKDIR /app
# DAEMON_SANDBOX_DIR here, not in daemon.yaml: every container of this image runs bot tools only in its sandbox, even
# under a stale or overridden daemon.yaml. The entry (meetvinci.sh) refuses to start the daemon unless a volume is
# mounted there, and waits for the firewall first; `meetvinci <command>` runs as given.
ENV DATA_DIR=/data HOME=/data/home PI_CODING_AGENT_DIR=/data/pi DAEMON_HOST=0.0.0.0 DAEMON_PORT=47191 DAEMON_SANDBOX_DIR=/run/sandbox
EXPOSE 47191
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD ["bun", "-e", "process.exit((await fetch(`http://127.0.0.1:${process.env.DAEMON_PORT}/health`)).ok ? 0 : 1)"]
ENTRYPOINT ["tini", "--", "meetvinci"]

FROM ${NODE_IMAGE} AS node
FROM ${UV_IMAGE} AS uv

# A person's sandbox: their bots' read, write, edit and bash run here through pi-env, and their command-type MCP servers
# through sandbox.sh's `run`, never in the daemon. No MeetVinci code, no keys, no app database, no owner socket: only
# the bot folders (/data/agents), shared skills (/data/home/.agents, read only) and the bots' home (/home/bot, bot-home
# of the volume) of that person's volume, and /run/sandbox, the daemon's folder, read only. A base for office and coding
# work: Bun, Node with npm, Python with pip, venv and uv, git, curl, wget, jq, ripgrep, sqlite3, zip and the usual text
# tools; no compilers. socat links the sandbox to its daemon (deploy/docker/sandbox.sh). /run/sandbox is owned by uid
# 1000 here too: Docker fills a new shared volume from whichever of the two containers it creates first. No file keeps
# a setuid or setgid bit, and nothing runs as root, so apt and dpkg cannot install anything.
FROM ${BUN_IMAGE}-slim AS sandbox
RUN apt-get update && apt-get install -y --no-install-recommends \
      socat git curl wget ca-certificates jq ripgrep unzip zip xz-utils bzip2 file less patch procps sqlite3 \
      python3 python3-pip python3-venv \
 && rm -rf /var/lib/apt/lists/* \
 && rm /usr/lib/python3.*/EXTERNALLY-MANAGED \
 && find / -xdev -perm /6000 -type f -exec chmod ug-s {} + \
 && git config --file /etc/skel/.gitconfig init.defaultBranch main \
 && mkdir -p /data/agents /data/home/.agents /home/bot /run/sandbox && chown -R 1000:1000 /data /home/bot /run/sandbox
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx
COPY --from=uv /uv /uvx /usr/local/bin/
COPY --from=tini /usr/bin/tini-static /usr/bin/tini
COPY --from=pi-env --chmod=755 /pi-env /usr/local/bin/pi-env
COPY --chmod=755 deploy/docker/sandbox.sh /usr/local/bin/sandbox
COPY --chmod=755 deploy/docker/firewall-wait.sh /usr/local/bin/firewall-wait
USER 1000:1000
WORKDIR /data/agents
# Everything a bot installs goes under its home, which persists: npm i -g, pip install --user, uv tool install and
# bun add -g put programs in ~/.local/bin or ~/.bun/bin, both on PATH. Caches go to ~/.cache, which backups leave out.
# Debian's pip refuses user installs by default (EXTERNALLY-MANAGED, removed above); the system's packages stay
# read-only either way. The Bun image's BUN_INSTALL_BIN is /usr/local/bin, which is read-only here.
ENV HOME=/home/bot \
    XDG_CONFIG_HOME=/home/bot/.config XDG_CACHE_HOME=/home/bot/.cache XDG_DATA_HOME=/home/bot/.local/share XDG_STATE_HOME=/home/bot/.local/state \
    PATH=/home/bot/.local/bin:/home/bot/.bun/bin:/home/bot/.local/share/pnpm:/usr/local/bin:/usr/bin:/bin \
    NPM_CONFIG_PREFIX=/home/bot/.local NPM_CONFIG_CACHE=/home/bot/.cache/npm PNPM_HOME=/home/bot/.local/share/pnpm \
    BUN_INSTALL=/home/bot/.bun BUN_INSTALL_BIN=/home/bot/.bun/bin BUN_INSTALL_CACHE_DIR=/home/bot/.cache/bun
# Healthy while it holds a connection to its daemon's exec.sock; probed every second while starting.
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --start-interval=1s \
  CMD ["/usr/local/bin/sandbox", "health"]
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/sandbox"]

FROM ${DOCKER_CLI_IMAGE} AS docker-cli

# The provisioner: adds and removes people for the hub by running scripts/deploy.ts apply with the Docker CLI and
# Compose, the same code path as by hand. It holds the Docker socket, so it serves nothing but its narrow API.
# Root without capabilities: it reads root's /opt/meetvinci/.env and the Docker socket as their owner.
FROM ${BUN_IMAGE}-distroless AS provisioner
COPY --from=tini /usr/bin/tini-static /usr/bin/tini
COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker-cli /usr/local/libexec/docker/cli-plugins/docker-compose /usr/local/libexec/docker/cli-plugins/docker-compose
COPY scripts/deploy.ts /app/deploy.ts
USER 0:0
WORKDIR /opt/meetvinci
ENV HOME=/tmp PROVISIONER_PORT=47193
EXPOSE 47193
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD ["bun", "-e", "process.exit((await fetch(`http://127.0.0.1:${process.env.PROVISIONER_PORT}/health`, { headers: { authorization: `Bearer ${process.env.PROVISIONER_TOKEN}` } })).ok ? 0 : 1)"]
ENTRYPOINT ["tini", "--", "bun", "--no-install", "/app/deploy.ts", "provisioner"]

# The firewall: keeps bots off the server's internal addresses with iptables rules for every daemon bridge, set by
# scripts/deploy.ts firewall. Its health check puts back missing rules every 2 s and fails when it had to, so Compose
# starts no daemon meanwhile. Runs on the host network with NET_ADMIN only; it serves nothing and holds no secret. It
# uses Debian's iptables-nft, next to Docker's chains.
FROM ${BUN_IMAGE}-slim AS firewall
RUN apt-get update && apt-get install -y --no-install-recommends iptables && rm -rf /var/lib/apt/lists/*
COPY --from=tini /usr/bin/tini-static /usr/bin/tini
COPY scripts/deploy.ts /app/deploy.ts
USER 0:0
ENV HOME=/tmp
HEALTHCHECK --interval=2s --timeout=5s --start-period=10s --start-interval=1s --retries=1 \
  CMD ["bun", "--no-install", "/app/deploy.ts", "firewall", "check"]
ENTRYPOINT ["tini", "--", "bun", "--no-install", "/app/deploy.ts", "firewall"]
