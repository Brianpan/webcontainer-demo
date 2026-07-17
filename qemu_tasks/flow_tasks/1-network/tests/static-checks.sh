#!/usr/bin/env bash
# static-checks.sh — Acceptance static checks for the 1-network task.
#
# Verifies qemu/index.html removed the old browser-mode networking and contains
# the new startup modal + delegate-mode wiring. Pure grep; no runtime needed.
#
# Usage:  bash static-checks.sh
# Exit:   0 = all pass, 1 = one or more failures.

set -u
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
INDEX="$REPO_ROOT/qemu/index.html"

pass=0
fail=0

if [[ ! -f "$INDEX" ]]; then
  echo "FATAL: index.html not found at $INDEX"
  exit 1
fi

# assert_absent <label> <pattern>  — fixed-string, case-sensitive
assert_absent() {
  local label="$1" pat="$2"
  if grep -qF -- "$pat" "$INDEX"; then
    echo "FAIL  [absent] $label — found forbidden token: '$pat'"
    grep -nF -- "$pat" "$INDEX" | sed 's/^/        /'
    fail=$((fail+1))
  else
    echo "PASS  [absent] $label"
    pass=$((pass+1))
  fi
}

# assert_present <label> <pattern>  — fixed-string, case-sensitive
assert_present() {
  local label="$1" pat="$2"
  if grep -qF -- "$pat" "$INDEX"; then
    echo "PASS  [present] $label"
    pass=$((pass+1))
  else
    echo "FAIL  [present] $label — missing required token: '$pat'"
    fail=$((fail+1))
  fi
}

echo "== Static acceptance checks: $INDEX =="
echo

echo "-- Forbidden (old browser mode) must be ABSENT --"
assert_absent "Stack.Start"          "Stack.Start"
assert_absent "Stack (identifier)"   "Stack"
assert_absent "stack-worker.js"      "stack-worker.js"
assert_absent "c2w-net-proxy"        "c2w-net-proxy"
assert_absent "9999 proxy port"      "9999"
assert_absent "192.168.127.253"      "192.168.127.253"
assert_absent "getNetParam"          "getNetParam"
assert_absent "?net= query gating"   "?net="
assert_absent "dist/stack.js tag"    "dist/stack.js"

echo
echo "-- Required (new modal + delegate wiring) must be PRESENT --"
assert_present "#net-modal element"   "net-modal"
assert_present "#net-url input"       "net-url"
assert_present "bootWithNet()"        "bootWithNet"
assert_present "disableGuestNetwork()" "disableGuestNetwork"
assert_present "normalizeUrl()"       "normalizeUrl"
assert_present "delegate Module.websocket" "Module['websocket']"

echo
echo "== Result: $pass passed, $fail failed =="
[[ $fail -eq 0 ]] && exit 0 || exit 1
