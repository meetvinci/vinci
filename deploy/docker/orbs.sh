#!/bin/sh
# The orbs CLI in the daemon image, for the entrypoint and `docker exec <container> orbs pair`.
# A bind mount or an existing volume may lack HOME and the Pi directory, so create them first.
set -eu
mkdir -p "$HOME" "$PI_CODING_AGENT_DIR"
# In a team install the daemon starts only once the firewall confines this container (set by deploy.ts apply).
if [ "$#" -eq 0 ] && [ "${ORBS_WAIT_FOR_FIREWALL:-}" = true ]; then
  firewall-wait
fi
exec bun --no-install /app/daemon/entry.native.js "$@"
