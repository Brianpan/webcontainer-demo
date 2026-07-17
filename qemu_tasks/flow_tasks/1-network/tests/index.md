# Tests — 1-network

Phase artifacts and test scripts for verifying the "remove browser mode of
network" task on `qemu/index.html`.

- `20260716183700-network-test.md`
  - Status: ready
  - Tags: [qemu, network, test, state]
  - Summary: Test report. 36/36 automated assertions pass (static 15, logic 14,
    server smoke 7), 0 fail, no implementation bugs. Confirms browser mode
    removed and modal + delegate/air-gapped wiring present; unit-tests
    `normalizeUrl` and `disableGuestNetwork` (Grill1 F1/F2, Grill2
    G2-1/G2-3/G2-6). Full `ping 1.1.1.1` documented as manual (needs browser +
    live c2w-net proxy; blocked headless). Node was installed user-space to
    `~/.local/node`.

- `static-checks.sh`
  - Status: ready (passing)
  - Tags: [qemu, network, test]
  - Summary: grep acceptance — forbidden browser-mode tokens absent, new modal +
    delegate wiring present in `qemu/index.html`. No runtime needed.
    Run: `bash static-checks.sh`.

- `logic.test.mjs`
  - Status: ready (passing)
  - Tags: [qemu, network, test, state]
  - Summary: extracts `normalizeUrl()` + `disableGuestNetwork()` verbatim from
    `index.html` and asserts behavior (empty/whitespace/scheme normalization;
    NIC-tuple splice shape, defensive no-op + warn on mismatch). Node only.
    Run: `node logic.test.mjs`.

- `server-smoke.sh`
  - Status: ready (passing)
  - Tags: [qemu, network, test]
  - Summary: boots `qemu/server.mjs`, fetches only `/`, asserts 200 + COOP/COEP
    + modal body, then stops. Skips the 390MB `*.data`. Needs node.
    Run: `bash server-smoke.sh`.

## How to run all

```
export PATH="$HOME/.local/node/bin:$PATH"   # user-space node installed by test phase
cd qemu_tasks/flow_tasks/1-network/tests
bash static-checks.sh && node logic.test.mjs && bash server-smoke.sh
```
