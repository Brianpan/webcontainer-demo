# Plans Index — 1-network

- `20260716183139-network-plan.md`
  - Status: ready
  - Tags: [console, qemu, network, css, plan]
  - Summary: Confines work to `qemu/index.html`. Removes browser network mode
    (Stack.Start, stack-worker, c2w-net-proxy, proxy env block, dist/stack.js
    tag). Replaces `?net=` query gating with a startup cyberpunk modal that
    asks for a delegate proxy WS URL; empty disables network, non-empty sets
    `Module['websocket'].url` + mac info line. Terminal + wasm load in Phase 2
    after the modal is answered. Preserves `start()`, `genmac()`, info-blob
    format.
  - Follow-up: explain, then grill1.
