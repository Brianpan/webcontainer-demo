# Brief: Remove browser mode of network

- Lane: qemu
- Tags: [console, qemu, network, css, plan]
- Source task file: `qemu_tasks/1-network.md`

## Desired user outcome

When a user opens the qemu demo page:

1. A cyberpunk-themed page loads.
2. A pop-up asks the user to key in a delegate proxy WebSocket URL
   (example `ws://localhost:8888`). If the user leaves it empty and confirms,
   the network is disabled and the VM boots with no network.
3. After the pop-up is answered, the wasm module and the xterm terminal load
   and the VM boots.

The old "browser mode" of networking (the in-browser mock stack using
`c2w-net-proxy.wasm` / `Stack.Start`) must be removed from `index.html`.

## Constraints

- Lane is `qemu`; only touch files under `qemu/` (primarily `index.html`).
- Do not regenerate or check in compiled/generated artifacts (`load.js`,
  `out.js`, `*.wasm`, `*.data`, `dist/`).
- Preserve the delegate-mode wiring: `Module['websocket'] = { url }` +
  `genmac()` info line, plus the existing pty / preRun setup.
- Server keeps cross-origin isolation headers (unchanged).
- Keep it framework-free (plain JS, no React/Redux).

## Acceptance criteria

- `index.html` no longer references `browser` mode, `Stack.Start`,
  `stack-worker.js`, `c2w-net-proxy.wasm`, or the `9999`/`192.168.127.253`
  proxy env block.
- On page load a modal prompts for the proxy URL before the VM starts.
- Empty input => network disabled (no `Module['websocket']`, no mac info line).
- Non-empty input => delegate mode with `Module['websocket'].url` set to it.
- Cyberpunk visual theme applied to page + modal + terminal container.
- Manual/automated verification: `ping 1.1.1.1` works in the xterm console
  when a working proxy URL is supplied.
