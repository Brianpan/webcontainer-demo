# Actions Index — 1-network

- `20260716183500-network-action.md`
  - Status: ready
  - Tags: [console, qemu, network, css, action]
  - Summary: Rewrote `qemu/index.html`. Removed browser mode (Stack.Start,
    stack-worker, c2w-net-proxy, proxy env block, getNetParam, dist/stack.js
    tag). Added Phase-1 cyberpunk modal for the delegate proxy WS URL and a
    Phase-2 `bootWithNet()` that builds the terminal then calls the unchanged
    `start()`. Resolved Grill 1 F1 by stripping the `-netdev`/`-device` NIC
    args from `Module['arguments']` on empty input (true no-network boot), and
    F2 by normalizing the URL scheme. Node absent on host — real test deferred.
  - Follow-up: grill2, then test.
