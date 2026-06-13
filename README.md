# ubuntu:22.04 in the browser, with a persistent `/tmp`

Runs an unmodified `ubuntu:22.04` container entirely in the browser via
[container2wasm](https://github.com/container2wasm/container2wasm), and backs the
container's `/tmp` with a per-session directory keyed by a UUID. Each session gets
its own bucket (`/tmp/<uuid>` on the storage side); files written to `/tmp` inside
the container are saved to that bucket in the browser's
[OPFS](https://developer.mozilla.org/docs/Web/API/File_System_API/Origin_private_file_system)
and reloaded when you resume the same UUID.

There is no server doing the work — the container, the Linux kernel, and the
emulated CPU all run client-side in WebAssembly.

## Layout

```
c2w-ubuntu-tmp/
  build.sh            # c2w ubuntu:22.04 -> htdocs/out.wasm   (needs Docker)
  server.mjs          # static server with COOP/COEP + wasm MIME (no deps)
  package.json
  htdocs/
    index.html        # terminal UI; picks the UUID, hydrates /tmp, runs the worker
    opfs-store.js     # main thread: OPFS <-> serializable tree (hydrate / persist)
    worker.js         # WASI worker: runs out.wasm, mounts /tmp from the bucket
    wasi-util.js      # vendored poll_oneoff event classes (from the c2w example)
    browser_wasi_shim/
      index.js        # vendored bjorn3/browser_wasi_shim bundle (in-memory FS + WASI)
      wasi_defs.js
```

## Prerequisites

Building `out.wasm` needs **Docker 18.09+** (with BuildKit) and the **`c2w`**
binary on your `PATH`. The conversion runs the build steps through BuildKit, so
Docker is required for this step only — see "Can I avoid Docker?" below. Grab
`c2w` from the
[releases page](https://github.com/container2wasm/container2wasm/releases).

Running the result needs only **Node** (for the dev server) and a recent
**Chrome** (it relies on OPFS and cross-origin isolation).

## Build and run

```bash
# 1. Convert the image (pulls ubuntu:22.04, takes a few minutes; out.wasm is tens of MB)
npm run build            # == bash build.sh ubuntu:22.04

# 2. Serve with the isolation headers and open it
npm start                # == node server.mjs
#   -> http://localhost:8080
```

Inside the terminal:

```sh
echo "hello" > /tmp/note.txt    # write something to /tmp
exit                            # exit the shell -> /tmp is saved to the bucket
```

Reload with the same bucket (the **resume** dropdown, or `?uuid=<id>` in the URL)
and `/tmp/note.txt` is back. "New session" mints a fresh UUID with an empty `/tmp`.

## How it works

The container's `/tmp` is a WASI **preopened directory** named `/tmp`, handed to
the `out.wasm` runtime at fd 3. The c2w runtime mounts it into the guest Linux
over virtio-9p — the same mechanism the upstream example uses to inject a TLS
cert directory.

The directory itself lives in memory inside the worker (browser_wasi_shim's
in-memory `File`/`Directory`). The async OPFS work happens on the **main thread**,
because OPFS directory enumeration is async and would clash with the synchronous
filesystem calls the running container makes:

```
load:  OPFS /tmp/<uuid>/  --hydrate-->  tree  --postMessage-->  worker builds /tmp preopen
exit:  worker serializes /tmp  --postMessage-->  main thread  --persist-->  OPFS /tmp/<uuid>/
```

## Important caveats

**Persistence happens when the container exits.** Because WASI calls are
synchronous and the worker thread blocks on `Atomics.wait` while waiting for
input, there is no safe moment to flush mid-session from the same worker. So
`/tmp` is saved when the container's process exits — type `exit` (or `Ctrl-D`) in
the shell, or run a non-interactive command image that exits on its own. An
interactive shell left open will not have saved yet. (See the upgrade path for
live persistence.)

**Mounting at `/tmp` vs. the guest's own tmpfs.** The guest already has a `/tmp`.
Mounting the 9p share at `/tmp` overlays it, which is what we want. If your build
of c2w ends up shadowing the share instead, mount the preopen at a fresh path and
bind it: change `GUEST_TMP` in `worker.js` to e.g. `/mnt/scratch`, then build the
image with an entrypoint that runs `mount --bind /mnt/scratch /tmp` before the
shell (runc gives the container enough privilege for a bind mount).

**`path_rename` is unimplemented** in this vendored shim — tools that rename
files across `/tmp` will get an error. Reads, writes, creates, deletes, and
`readdir` all work.

## Upgrade path: live persistence

To persist without waiting for exit, replace the in-memory filesystem with a
dedicated **OPFS worker** that holds `FileSystemSyncAccessHandle`s, and have the
WASI worker call it synchronously over a `SharedArrayBuffer` + `Atomics`
request/response channel. That turns every `fd_write` into a synchronous,
durable write. It's more code (effectively a small 9p-style backend over OPFS),
which is why this scaffold ships the simpler hydrate-on-start / save-on-exit
model. The `opfs-store.js` boundary (`hydrate` / `persist`) is where that swap
goes.

## Can I avoid Docker?

For **running** the finished `out.wasm`: yes, entirely — no Docker, just the
static server and a browser. For **building** it: `c2w` uses BuildKit, so Docker
(or a BuildKit-compatible builder via `c2w --builder`) is effectively required.
You bake the cake with Docker, but you don't need it to eat it.

## Deploying

`out.wasm` is large, so host it on object storage and serve the page with the
same two isolation headers. On Cloudflare, put `out.wasm` in R2 and set on every
response:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

without those, `SharedArrayBuffer` is unavailable and the terminal's stdin
won't work.
