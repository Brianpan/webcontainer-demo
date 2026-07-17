# Grills1 Index: Remove browser mode of network

- `20260716183300-network-grill1.md`
  - Status: ready
  - Tags: [qemu, network, grill1, blocker, risk, state]
  - Summary: Adversary review of the network plan. One blocker: "empty input ==
    network disabled" is unverified/likely false because `arg-module.js`
    unconditionally wires `-netdev socket,connect=127.0.0.1:8888` and SOCKFS in
    `out.js` still attempts `ws://127.0.0.1:8888` when `Module['websocket']` is
    unset — no-network boot may hang/error and is untested. Risks: modal
    `ws://localhost:8888` vs NIC `127.0.0.1:8888` are different layers, `ws://`
    prefix is load-bearing (SOCKFS rejects bare host:port); deferring xterm
    creation to Phase 2 has pty-ordering risk (prefer terminal behind modal).
    Nits: removing `dist/stack.js` tag is safe (Stack unused elsewhere);
    Enter/focus under-specified; COOP/COEP unaffected; empty-input boot has no
    test expectation.
  - Blockers: F1 (empty-input no-network boot unverified vs unconditional NIC).
  - Next phase: Action (after F1 resolved or accepted as risk).
