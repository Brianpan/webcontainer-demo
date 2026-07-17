# Memories Index — 1-network

- `20260716183800-action-netdev-coupling.md`
  - Tags: [qemu, network, action, state, risk]
  - Summary: Empty-input "no network" requires splicing the `-netdev <v>
    -device <v>` tuple from `Module['arguments']`, because arg-module.js wires
    the NIC unconditionally and out.js SOCKFS falls back to ws://127.0.0.1:8888.
    Positional coupling to arg-module.js; guarded + pinned by logic tests.
- `20260716183801-test-node-and-ping.md`
  - Tags: [qemu, network, test, blocker]
  - Summary: Host lacks node; test agent used user-space Node v20. Automated
    coverage = 36 assertions (static + logic + server smoke). Full `ping
    1.1.1.1` is a documented manual step (needs browser + live c2w-net proxy).
