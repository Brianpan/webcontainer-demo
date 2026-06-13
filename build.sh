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
echo "Now run:  npm start   (or: node server.mjs)  and open http://localhost:8080"
