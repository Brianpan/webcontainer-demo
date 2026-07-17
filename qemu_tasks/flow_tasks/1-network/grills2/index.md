# Grills2 Index: Remove browser mode of network

- `20260716183600-network-grill2.md`
  - Status: ready
  - Tags: [qemu, network, grill2, console, risk, nit, state]
  - Summary: Structural review of the rewritten `qemu/index.html` before tests.
    No blockers. `start()` preserved byte-for-byte and Phase-2 ordering matches
    the original, so pty/preRun sequencing is intact; `Module['preRun']` array is
    initialized by `load.js` (classic script runs before the module block).
    Console stays framework-free plain JS. Risks: `disableGuestNetwork()` splice
    is positionally coupled to `arg-module.js` and fails silently if the NIC
    tuple moves (G2-1, G2-3); air-gapped boot is asserted from code but never run
    (node absent) (G2-2). Nits: `normalizeUrl` accepts port-less hosts that die
    inside SOCKFS (G2-6); no NIC + no `n:` line is consistent (G2-7); index.html
    is clean of browser-mode refs except the cosmetic page `<title>` (G2-8);
    cross-origin unpkg xterm imports are a pre-existing hidden dependency (G2-9).
  - Follow-ups: hand air-gapped + `ping` verification to Test; optional
    defensive splice check + memory note if G2-1 accepted.
