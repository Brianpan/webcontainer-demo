#!/usr/bin/env bash
# server-smoke.sh — Boot qemu/server.mjs, fetch ONLY "/" (index.html), assert:
#   - HTTP 200
#   - Cross-Origin-Opener-Policy: same-origin
#   - Cross-Origin-Embedder-Policy: require-corp
#   - body contains the network modal (#net-modal / #net-url)
# Does NOT touch the 408MB *.data file. Starts server from qemu/ (server serves
# process.cwd()), on an unused high port, then shuts it down.
#
# Requires: node on PATH.  Usage: bash server-smoke.sh

set -u
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
QEMU_DIR="$REPO_ROOT/qemu"
PORT="${PORT:-8391}"

command -v node >/dev/null 2>&1 || { echo "FATAL: node not on PATH"; exit 2; }

echo "== Server smoke test (port $PORT, cwd $QEMU_DIR) =="
cd "$QEMU_DIR" || { echo "FATAL: cannot cd $QEMU_DIR"; exit 2; }

PORT="$PORT" node server.mjs >/tmp/net-server-smoke.log 2>&1 &
SRV=$!
trap 'kill "$SRV" 2>/dev/null' EXIT

# wait for listen (max ~5s)
for _ in $(seq 1 50); do
  curl -s -o /dev/null "http://localhost:$PORT/" && break
  sleep 0.1
done

fail=0
HDRS="$(curl -s -D - -o /tmp/net-index.html "http://localhost:$PORT/")"
CODE="$(printf '%s' "$HDRS" | awk 'NR==1{print $2}')"
BODY="$(cat /tmp/net-index.html)"

check() { # label, condition-already-evaluated via [[ ]]
  if [[ "$1" == "0" ]]; then echo "PASS  $2"; else echo "FAIL  $2"; fail=$((fail+1)); fi
}

[[ "$CODE" == "200" ]]; check $? "GET / returns 200 (got $CODE)"
printf '%s' "$HDRS" | grep -qi 'Cross-Origin-Opener-Policy: *same-origin'; check $? "COOP: same-origin header present"
printf '%s' "$HDRS" | grep -qi 'Cross-Origin-Embedder-Policy: *require-corp'; check $? "COEP: require-corp header present"
printf '%s' "$HDRS" | grep -qi 'Content-Type: *text/html'; check $? "Content-Type text/html for /"
printf '%s' "$BODY" | grep -qF 'net-modal'; check $? "served body contains #net-modal"
printf '%s' "$BODY" | grep -qF 'net-url'; check $? "served body contains #net-url"
printf '%s' "$BODY" | grep -qF 'bootWithNet'; check $? "served body contains bootWithNet"

echo
echo "== Result: $([[ $fail -eq 0 ]] && echo PASS || echo FAIL) ($fail failure(s)) =="
[[ $fail -eq 0 ]] && exit 0 || exit 1
