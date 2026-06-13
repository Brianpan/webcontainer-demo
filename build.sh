#!/usr/bin/env bash
# Convert a container image to the WASI .wasm the browser harness loads.
# Requires Docker (BuildKit) and the c2w binary on PATH. See README.
set -euo pipefail

IMAGE="${1:-ubuntu:22.04}"
OUT="htdocs/out.wasm"

if ! command -v c2w >/dev/null 2>&1; then
  echo "error: 'c2w' not found on PATH." >&2
  echo "Install it from https://github.com/container2wasm/container2wasm/releases" >&2
  echo "(extract the tarball and move the c2w binary somewhere on your PATH)." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "error: Docker does not appear to be running. c2w uses BuildKit to build." >&2
  exit 1
fi

echo "Converting ${IMAGE} -> ${OUT} (this pulls the image and can take a few minutes)…"
c2w "${IMAGE}" "${OUT}"
echo "Done. $(du -h "${OUT}" | cut -f1) written to ${OUT}"

# Download c2w-net-proxy.wasm if not already present (needed for ?net=browser).
PROXY="htdocs/c2w-net-proxy.wasm"
if [ ! -f "${PROXY}" ]; then
  echo "Downloading c2w-net-proxy.wasm for browser networking…"
  C2W_VERSION=$(c2w --version 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || echo "0.8.4")
  PROXY_URL="https://github.com/container2wasm/container2wasm/releases/download/v${C2W_VERSION}/c2w-net-proxy.wasm"
  curl -fsSL "${PROXY_URL}" -o "${PROXY}" \
    || { echo "warn: could not download ${PROXY_URL} — browser networking (?net=browser) will not work." >&2; }
fi

echo "Now run:  npm start   (or: node server.mjs)  and open http://localhost:8080"
echo "  plain:       http://localhost:8080/"
echo "  browser net: http://localhost:8080/?net=browser"
echo "  delegate:    http://localhost:8080/?net=delegate=ws://your-relay:port"
