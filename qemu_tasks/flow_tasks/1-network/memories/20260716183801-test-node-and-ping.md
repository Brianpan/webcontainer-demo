# Memory: node absent on host; full ping test is manual

- Date: 2026-07-16
- Agent: test-agent
- Related phase: test
- Tags: [qemu, network, test, blocker]
- Decision/Observation: The host has no `node`/`nodejs`/`nvm` (apt candidate
  needs sudo). The Test agent installed user-space Node v20.18.1 to
  `~/.local/node` (no sudo, outbound net available) to run the JS unit tests
  and the `server.mjs` smoke test. The full `ping 1.1.1.1` acceptance test can
  NOT run headless: it needs a real browser with SharedArrayBuffer (COOP/COEP)
  AND a live `c2w-net` delegate proxy listening on the entered `ws://` URL.
- Reason: Boot-to-shell requires the wasm VM + a network proxy the page does not
  launch.
- Impact: Task behavior is covered by 36 automated assertions
  (static + logic + server smoke). `ping 1.1.1.1` remains a documented MANUAL
  step (see tests/20260716183700-network-test.md): start c2w-net proxy on
  :8888 -> `node server.mjs` in qemu/ -> open page -> enter ws://localhost:8888
  -> `ping 1.1.1.1`.
- Next agent who should care: anyone running end-to-end qemu network verification.
