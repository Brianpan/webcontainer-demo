// opfs-store.js
//
// Persistence for the container's /tmp, keyed by a per-session UUID.
//
// The container's /tmp is backed by an in-memory filesystem inside the WASI
// worker (browser_wasi_shim). OPFS sync access handles only exist *inside* a
// worker, and directory enumeration in OPFS is async — which clashes with the
// synchronous WASI calls the running container makes. So instead of bridging
// OPFS into the worker, we keep all async OPFS work on the main thread:
//
//   start  ->  hydrate(uuid)  reads OPFS  /tmp/<uuid>/  into a plain tree
//              and hands it to the worker, which builds the /tmp preopen.
//   exit   ->  worker posts the final tree back, persist(uuid, tree) writes
//              it to OPFS /tmp/<uuid>/.
//
// Tree format (structured-cloneable):
//   { files: { "name": Uint8Array, ... }, dirs: { "name": <tree>, ... } }

const ROOT = "tmp"; // OPFS top-level folder that holds every <uuid> bucket

async function bucketDir(uuid, create) {
  const root = await navigator.storage.getDirectory();
  const tmp = await root.getDirectoryHandle(ROOT, { create });
  return tmp.getDirectoryHandle(uuid, { create });
}

async function readDirInto(dirHandle) {
  const tree = { files: {}, dirs: {} };
  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind === "file") {
      const file = await handle.getFile();
      tree.files[name] = new Uint8Array(await file.arrayBuffer());
    } else {
      tree.dirs[name] = await readDirInto(handle);
    }
  }
  return tree;
}

// Read OPFS /tmp/<uuid>/ into a serializable tree. Empty tree if it's new.
export async function hydrate(uuid) {
  try {
    const dir = await bucketDir(uuid, true);
    return await readDirInto(dir);
  } catch (err) {
    console.warn("hydrate failed, starting empty:", err);
    return { files: {}, dirs: {} };
  }
}

async function clearDir(dirHandle) {
  const names = [];
  for await (const [name] of dirHandle.entries()) names.push(name);
  await Promise.all(names.map((n) => dirHandle.removeEntry(n, { recursive: true })));
}

async function writeTreeInto(dirHandle, tree) {
  for (const [name, data] of Object.entries(tree.files || {})) {
    const fh = await dirHandle.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(data);
    await w.close();
  }
  for (const [name, sub] of Object.entries(tree.dirs || {})) {
    const sh = await dirHandle.getDirectoryHandle(name, { create: true });
    await writeTreeInto(sh, sub);
  }
}

// Persist a tree back to OPFS /tmp/<uuid>/ (last-write-wins, full rewrite).
export async function persist(uuid, tree) {
  const dir = await bucketDir(uuid, true);
  await clearDir(dir);
  await writeTreeInto(dir, tree);
}

// List existing bucket UUIDs so the user can resume one.
export async function listBuckets() {
  try {
    const root = await navigator.storage.getDirectory();
    const tmp = await root.getDirectoryHandle(ROOT, { create: true });
    const out = [];
    for await (const [name, handle] of tmp.entries()) {
      if (handle.kind === "directory") out.push(name);
    }
    return out;
  } catch {
    return [];
  }
}

export async function deleteBucket(uuid) {
  const root = await navigator.storage.getDirectory();
  const tmp = await root.getDirectoryHandle(ROOT, { create: true });
  await tmp.removeEntry(uuid, { recursive: true });
}
