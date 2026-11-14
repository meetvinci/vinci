#!/bin/bash
# The first step of every daemon and sandbox (meetvinci.sh without arguments, sandbox.sh): waits until the firewall
# confines this container, so no bot runs before the rules exist. Compose starts daemons after the firewall, but after a
# reboot or a Docker restart Docker starts every container at once.
# The test: a TCP connection to the network's gateway (the server itself) on the discard port. Without the firewall
# the server refuses it (Connection refused), answers, or another host firewall drops or rejects it; MEETVINCI-DAEMONS-HOST
# alone rejects it with ICMP "protocol unreachable", which the kernel reports as ENOPROTOOPT (Protocol not available).
# The firewall adds that jump after the one in DOCKER-USER, in the same pass. Bash, not Bun: Bun reports every failed
# connect as ECONNREFUSED.
# The error comes with the SYN sent again after 1 s, not the first one, so each try waits up to 3 s.
set -eu

# The default route's gateway from /proc/net/route, where addresses are little-endian hex.
hex=$(awk '$2 == "00000000" { print $3; exit }' /proc/net/route)
gateway=$(printf '%d.%d.%d.%d' "0x${hex:6:2}" "0x${hex:4:2}" "0x${hex:2:2}" "0x${hex:0:2}")

rejected() {
  case "$(timeout 3 bash -c "exec 3<>/dev/tcp/$gateway/9" 2>&1)" in
    *'Protocol not available'*) return 0 ;;
    *) return 1 ;;
  esac
}

started=$(date +%s%N)

if ! rejected; then
  echo "Waiting for the firewall: the server ($gateway) does not reject this container yet."

  until rejected; do
    sleep 0.1
  done

  echo "The firewall confines this container after $(( ($(date +%s%N) - started) / 1000000 )) ms; starting."
fi
