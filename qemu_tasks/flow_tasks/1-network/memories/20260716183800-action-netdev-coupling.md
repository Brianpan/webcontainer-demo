# Memory: index.html depends on arg-module.js NIC arg shape

- Date: 2026-07-16
- Agent: claude-opus-orchestrator
- Related phase: action / grill1 / grill2 / test
- Tags: [qemu, network, action, state, risk]
- Decision/Observation: Disabling the guest network on empty modal input is NOT
  achieved by omitting `Module['websocket']`. `qemu/arg-module.js` wires
  `-netdev socket,...connect=127.0.0.1:8888 -device virtio-net-pci` UNCONDITIONALLY,
  and `qemu/out.js` SOCKFS (~L3730) falls back to `ws://127.0.0.1:8888` derived
  from the socket target when no url is set. So `index.html`'s
  `disableGuestNetwork()` splices the exact `-netdev <val> -device <val>` 4-tuple
  out of `Module['arguments']` to get a true air-gapped boot.
- Reason: Without stripping the NIC, an "empty = no network" boot still dials a
  dead proxy (Grill1 F1). The splice is positional and coupled to arg-module.js.
- Impact: If `arg-module.js` reorders/adds NIC args, `disableGuestNetwork()` must
  be updated. It now guards on `args[i+2]==='-device'` and warns if the shape
  changes. `tests/logic.test.mjs` pins this behavior.
- Next agent who should care: anyone editing `qemu/arg-module.js` network args
  or the modal's no-network path.
