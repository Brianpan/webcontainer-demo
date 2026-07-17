# Grill 2 — Action agent resolution note

- Date: 2026-07-16
- Agent: claude-opus-orchestrator (action)
- Related: grills2/20260716183600-network-grill2.md

## Dispositions

- **G2-1 / G2-3 (risk) FIXED**: `disableGuestNetwork()` now only splices when
  `args[i+2] === '-device'` (the exact `-netdev <val> -device <val>` shape),
  and `console.warn`s loudly otherwise instead of silently booting with a live
  NIC. Removes the brittle-coupling / silent-fallthrough risk in-lane.
- **G2-2 (risk) ACCEPTED -> handed to Test**: air-gapped "cannot hang" is a
  code inference; must be observed. Node is absent on host — Test records the
  blocker + manual steps.
- **G2-4 (nit)**: confirmed `Module['preRun']` is initialized by `load.js:175`
  (classic script, runs before the module). No change needed.
- **G2-6 (nit) ACCEPTED**: port-less `ws://host` passes the modal but SOCKFS
  needs host:port. Left as-is (low value, the placeholder shows the port form);
  noted for future hardening.
- **G2-5 / G2-7 / G2-8 / G2-9 (nits)**: no action; pre-existing (unpkg imports)
  or cosmetic (page title).
