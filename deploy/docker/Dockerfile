# syntax=docker/dockerfile:1
# Orbs container images: one build stage, then the hub, web, daemon, provisioner and firewall targets.
# Build from the repo root: bun run build:images (see scripts/deploy.ts).
# Every image runs as uid 1000 under tini and works with a read-only root, a /tmp tmpfs, cap_drop ALL and no-new-privileges.
# Bundles run with --no-install: an unresolved optional import must fail, not download a package from npm at runtime.
ARG BUN_IMAGE=oven/bun:1.4.4
# The Docker CLI and its Compose plugin for the provisioner: static binaries, nothing else from this image.
ARG DOCKER_CLI_IMAGE=docker:29.8.2-cli

FROM ${BUN_IMAGE}-slim AS build
WORKDIR /src
COPY . .
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile
# The server bundle the desktop app ships: built web app, Bun bundles of the web server and daemon,
# migrations, the Takumi binding and the prebuilt artifact embed. No node_modules reach the runtime images.
RUN bun scripts/desktop.ts bundle

FROM build AS hub-build
RUN bun build apps/hub/src/entry.native.ts --target=bun --outdir=/out/hub

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
# Debian slim, not distroless: bots run their bash tool here. The product needs no other native tools; GnuPG is for
# `deploy.ts`, which encrypts the off-site backup with this image.
FROM ${BUN_IMAGE}-slim AS daemon
RUN apt-get update && apt-get install -y --no-install-recommends gpg gpg-agent && rm -rf /var/lib/apt/lists/*
COPY --from=tini /usr/bin/tini-static /usr/bin/tini
COPY --from=build /src/apps/desktop/dist/server/daemon /app/daemon
COPY --chmod=755 deploy/docker/orbs.sh /usr/local/bin/orbs
COPY --chmod=755 deploy/docker/firewall-wait.sh /usr/local/bin/firewall-wait
# A fresh named volume copies these directories with their owner, so the daemon can write them. data/ipc exists so
# a nested mount of the owner-socket folder there does not make Docker create data/ as root.
RUN mkdir -p /data/home /data/pi /data/data/ipc && chown -R 1000:1000 /data
USER 1000:1000
WORKDIR /app
ENV DATA_DIR=/data HOME=/data/home PI_CODING_AGENT_DIR=/data/pi DAEMON_HOST=0.0.0.0 DAEMON_PORT=47191
EXPOSE 47191
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD ["bun", "-e", "process.exit((await fetch(`http://127.0.0.1:${process.env.DAEMON_PORT}/health`)).ok ? 0 : 1)"]
ENTRYPOINT ["tini", "--", "orbs"]

FROM ${DOCKER_CLI_IMAGE} AS docker-cli

# The provisioner: adds and removes people for the hub by running scripts/deploy.ts apply with the Docker CLI and
# Compose, the same code path as by hand. It holds the Docker socket, so it serves nothing but its narrow API.
# Root without capabilities: it reads root's /opt/orbs/.env and the Docker socket as their owner.
FROM ${BUN_IMAGE}-distroless AS provisioner
COPY --from=tini /usr/bin/tini-static /usr/bin/tini
COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker-cli /usr/local/libexec/docker/cli-plugins/docker-compose /usr/local/libexec/docker/cli-plugins/docker-compose
COPY scripts/deploy.ts /app/deploy.ts
USER 0:0
WORKDIR /opt/orbs
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
