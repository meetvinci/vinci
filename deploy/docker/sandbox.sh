#!/bin/sh
# The sandbox image's entry, where a person's bots run their tools and command-type MCP servers. /run/sandbox is the
# folder this container shares with the person's daemon, mounted read only here: the daemon owns and creates everything
# in it.
# - exec.sock: the daemon listens; this script keeps one spare connection to it open. The daemon's first line on a
#   connection says what it is for (packages/runtime, runtime-sandbox.utils.ts), and the rest of the connection is
#   that program's stdin and stdout:
#   - `serve --token <hex>`: pi-env, which runs the bots' read, write, edit and bash.
#   - `run <count> <field>...`: a command-type MCP server. Each field is base64 of `v` and a value: the working folder,
#     <count> NAME=value environment entries, the command and its arguments. This script answers `started`, or
#     `missing` when the command is not installed here.
#   As soon as the daemon claims a connection, the script opens the next spare.
# - proxy.sock: the daemon's secrets proxy. Commands here reach it at 127.0.0.1:47195 (SECRET_PROXY.sandboxPort in
#   packages/secret-proxy) with the token the daemon puts in their environment.
# - $HOME (/home/bot): bot-home of the person's volume, shared by their bots; the daemon never mounts it.
# - `sandbox health`, the image's health check: this container holds a connection to its daemon.
set -eu

# The bots' PATH starts with folders of their home, which they write and which persist: a program left there named
# `ls`, `timeout` or `firewall-wait` would run at the next start, before the firewall confines this container. This
# script, firewall-wait and the health check use only the image's programs; pi-env gets the bots' PATH back.
export SANDBOX_BOTS_PATH="${SANDBOX_BOTS_PATH:-$PATH}"
export PATH=/usr/local/bin:/usr/bin:/bin

dir=/run/sandbox
linked=/tmp/.sandbox-linked

refuse() {
  echo "sandbox: refused a connection that is not a pi-env or MCP server start" >&2
  exit 1
}

# One field of a `run` line. The `v` keeps an empty value a field; the `.` keeps a trailing newline.
field() {
  value=$(printf '%s' "$1" | base64 -d 2>/dev/null && echo .) || refuse
  value=${value%.}

  case "$value" in
    v*) value=${value#v} ;;
    *) refuse ;;
  esac
}

run() {
  count=$1
  shift

  case "$count" in
    '' | *[!0-9]*) refuse ;;
  esac

  [ $# -ge $((count + 2)) ] || refuse

  # Decode every field in place: each turn appends one decoded field and drops its encoded one.
  remaining=$#

  while [ "$remaining" -gt 0 ]; do
    field "$1"
    shift
    set -- "$@" "$value"
    remaining=$((remaining - 1))
  done

  cd "$1" || refuse
  shift

  # The environment entries are never set in this script: `env` gives them to the server only, so a name such as PATH
  # cannot change how this script runs. The command is found in the image's PATH set at the top of this script (or in
  # a PATH entry the admin gave the server), never in the bots' PATH: a program a bot leaves in its home named npx, uvx
  # or node does not start an admin's server, and the server and its children run with the image's PATH too.
  search=$PATH
  index=0

  for entry in "$@"; do
    if [ "$index" -eq "$count" ]; then
      program=$entry
      break
    fi

    name=${entry%%=*}

    case "$name" in
      '' | "$entry" | [0-9]* | *[!A-Za-z0-9_]*) refuse ;;
      PATH) search=${entry#PATH=} ;;
    esac

    index=$((index + 1))
  done

  if ! (PATH=$search && command -v "$program") >/dev/null 2>&1; then
    echo missing
    exit 0
  fi

  echo started

  # The server leads its own process group (setsid without a fork: this child is no group leader), so whatever it
  # starts stops with it: when it exits, or when its connection ends and socat sends this script SIGTERM, even if
  # the server ignores its stdin ending. dash's kill takes `-<group>` but not `--`.
  server=
  trap '[ -z "$server" ] || kill -KILL "-$server" 2>/dev/null; exit 0' HUP INT TERM
  exec 3<&0
  setsid env -- "$@" <&3 3<&- &
  server=$!
  exec 3<&-
  status=0
  wait "$server" || status=$?
  kill -KILL "-$server" 2>/dev/null || true
  exit "$status"
}

case "${1:-}" in
  serve)
    touch "$linked"
    IFS= read -r line

    # Claimed: the dial loop opens the next spare connection now.
    kill -USR1 "${SANDBOX_DIALER:-}" 2>/dev/null || true

    case "$line" in
      'run '*)
        set -f
        # shellcheck disable=SC2086 # base64 fields, split on purpose
        run ${line#run }
        ;;
    esac

    token=${line#serve --token }

    # Only `serve --token <hex>`: the prefix must strip off, and what is left must be lowercase hex.
    case "$token" in
      "$line" | '' | *[!0-9a-f]*) refuse ;;
    esac

    exec /usr/bin/env -u SANDBOX_BOTS_PATH PATH="$SANDBOX_BOTS_PATH" /usr/local/bin/pi-env serve --token "$token"
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

# The bots' home persists in the person's volume. An empty one (a new person, or the upgrade that added it) gets the
# image's starting files: Debian's shell files and a git config with no identity. Under a per-person file from before
# the home (an upgrade between `up` and `apply`) it is the image's read-only folder: tools still run, installs fail.
if [ -z "$(ls -A "$HOME")" ] && ! cp -R /etc/skel/. "$HOME"/ 2>/dev/null; then
  echo "sandbox: $HOME is not writable, so bots cannot install anything: run bun deploy.ts apply" >&2
fi

# In a team install no bot command runs before the firewall confines this container (set by deploy.ts apply).
if [ "${MEETVINCI_WAIT_FOR_FIREWALL:-}" = true ]; then
  firewall-wait
fi

socat TCP-LISTEN:47195,bind=127.0.0.1,reuseaddr,fork "UNIX-CONNECT:$dir/proxy.sock" &

# One spare connection at a time: a new one as soon as the daemon claims the last (USR1 from `sandbox serve`), or when
# it ends unclaimed. A refused connect (the daemon is starting or restarting) is tried again every second. Claimed
# connections run on in the background until their program or the daemon ends them.
export SANDBOX_DIALER=$$
claimed=
trap 'claimed=1' USR1

while :; do
  claimed=
  socat "UNIX-CONNECT:$dir/exec.sock" EXEC:"sandbox serve" 2>/dev/null &
  spare=$!
  [ -n "$claimed" ] || wait "$spare" || true

  if [ -z "$claimed" ]; then
    if [ -e "$linked" ]; then
      rm -f "$linked"
    else
      sleep 1
    fi
  fi
done
