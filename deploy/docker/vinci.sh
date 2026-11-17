#!/bin/sh
# The vinci CLI in the daemon image, for the entrypoint and `docker exec <container> vinci pair`.
# A bind mount or an existing volume may lack HOME and the Pi directory, so create them first.
set -eu
mkdir -p "$HOME" "$PI_CODING_AGENT_DIR"
# Without arguments this starts a person's daemon, which only `bun deploy.ts apply` runs: it mounts the folder shared
# with the person's sandbox at DAEMON_SANDBOX_DIR, and the daemon starts only once the firewall confines this container.
# A command (`vinci pair`) runs as given.
if [ "$#" -eq 0 ]; then
  if ! awk -v dir="${DAEMON_SANDBOX_DIR:-}" '$5 == dir { found = 1 } END { exit !found }' /proc/self/mountinfo; then
    echo "Vinci's daemon image runs only as a person's daemon in a Docker install (bun deploy.ts apply), with the folder it shares with their sandbox mounted at DAEMON_SANDBOX_DIR (${DAEMON_SANDBOX_DIR:-not set}); no volume is mounted there. To run a command in a running daemon, use docker exec <container> vinci <command>." >&2
    exit 1
  fi
  firewall-wait
fi
exec bun --no-install /app/daemon/entry.native.js "$@"
