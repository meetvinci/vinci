#!/bin/sh
# The sandbox image's entry, where a person's bots run their tools. /run/sandbox is the folder this container shares
# with the person's daemon, mounted read only here: the daemon owns and creates everything in it.
# - exec.sock: the daemon listens; this script keeps one connection to it open. When the daemon starts pi-env on it,
#   the first line is `serve --token <hex>` (packages/runtime, runtime-sandbox.constants.ts) and the rest of the
#   connection is pi-env's stdin and stdout. When it ends, the script connects again.
# - proxy.sock: the daemon's secrets proxy. Commands here reach it at 127.0.0.1:47195 (SECRET_PROXY.sandboxPort in
#   packages/secret-proxy) with the token the daemon puts in their environment.
# - `sandbox health`, the image's health check: this container holds a connection to its daemon.
set -eu

dir=/run/sandbox
linked=/tmp/.sandbox-linked

case "${1:-}" in
  serve)
    touch "$linked"
    IFS= read -r line
    token=${line#serve --token }

    # Only `serve --token <hex>`: the prefix must strip off, and what is left must be lowercase hex.
    case "$token" in
      "$line" | '' | *[!0-9a-f]*)
        echo "sandbox: refused a connection that is not a pi-env start" >&2
        exit 1
        ;;
    esac

    exec pi-env serve --token "$token"
    ;;
  health)
    if [ -e "$linked" ]; then
      echo "Connected to the daemon."
      exit 0
    fi

    echo "Not connected to the daemon: is its daemon running?"
    exit 1
    ;;
esac

# In a team install no bot command runs before the firewall confines this container (set by deploy.ts apply).
if [ "${MEETVINCI_WAIT_FOR_FIREWALL:-}" = true ]; then
  firewall-wait
fi

socat TCP-LISTEN:47195,bind=127.0.0.1,reuseaddr,fork "UNIX-CONNECT:$dir/proxy.sock" &

# One connection at a time, again as soon as one ends. A refused connect (the daemon is starting or restarting) is
# tried again every second.
while :; do
  socat "UNIX-CONNECT:$dir/exec.sock" EXEC:"sandbox serve" 2>/dev/null || true

  if [ -e "$linked" ]; then
    rm -f "$linked"
  else
    sleep 1
  fi
done
