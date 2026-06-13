// worker.js  (classic Web Worker)
//
// Runs the container2wasm image and mounts a writable directory at the guest's
// /tmp. The directory is seeded from the UUID bucket on startup and posted back
// to the main thread when the container exits, so it can be saved to OPFS.

importScripts("https://cdn.jsdelivr.net/npm/xterm-pty@0.9.4/workerTools.js");
importScripts(location.origin + "/browser_wasi_shim/wasi_defs.js"); // Iovec, Ciovec, WHENCE_SET, OFLAGS_*
importScripts(location.origin + "/browser_wasi_shim/index.js");     // WASI, File, Directory, PreopenDirectory
importScripts(location.origin + "/wasi-util.js");                   // Event, Subscription, EventType

const GUEST_TMP = "/tmp"; // where the container sees the bucket
const TMP_FD = 3;         // preopen fd index the c2w runtime scans for
const NO_CONN = -1;       // we don't do sockets here

let imagename = null;
let uuid = null;
let tmpTree = { files: {}, dirs: {} };
let preopen = null;

onmessage = (msg) => {
  const d = msg.data;
  if (d && typeof d === "object" && d.type === "init") {
    imagename = d.imagename;
    uuid = d.uuid;
    if (d.tmpTree) tmpTree = d.tmpTree;
    return;
  }
  // Any other message is the xterm-pty TtyClient handshake buffers -> run.
  const ttyClient = new TtyClient(d);
  fetch(imagename, { credentials: "same-origin" })
    .then((r) => r.arrayBuffer())
    .then((wasm) => run(wasm, ttyClient));
};

function run(wasm, ttyClient) {
  preopen = buildPreopen(GUEST_TMP, tmpTree);

  const fds = [];
  fds[0] = undefined; // stdin  (handled by wasiHack)
  fds[1] = undefined; // stdout (handled by wasiHack)
  fds[2] = undefined; // stderr (handled by wasiHack)
  fds[TMP_FD] = preopen;

  const wasi = new WASI([], [], fds);
  wasiHack(wasi, ttyClient, NO_CONN);

  WebAssembly.instantiate(wasm, { wasi_snapshot_preview1: wasi.wasiImport })
    .then((inst) => {
      try {
        wasi.start(inst.instance);
      } catch (e) {
        // proc_exit throws by design in browser_wasi_shim; that's our cue to save.
        console.log("container exited:", e);
      }
      flush();
    });
}

// ---- /tmp filesystem: build from tree, then serialize back ----------------

function buildContents(tree) {
  const contents = {};
  for (const [name, data] of Object.entries(tree.files || {})) {
    contents[name] = new File(data); // data is a Uint8Array
  }
  for (const [name, sub] of Object.entries(tree.dirs || {})) {
    contents[name] = new Directory(buildContents(sub));
  }
  return contents;
}

function buildPreopen(guestPath, tree) {
  const dir = new PreopenDirectory(guestPath, buildContents(tree));
  // Linux expects "." to resolve to the dir itself; the upstream cert example
  // does the same. We strip "." / ".." again when serializing.
  dir.dir.contents["."] = dir.dir;
  wrapDirOpen(dir);
  return dir;
}

function serializeContents(contents) {
  const tree = { files: {}, dirs: {} };
  for (const [name, entry] of Object.entries(contents)) {
    if (name === "." || name === "..") continue;
    if (entry && entry.contents) {
      tree.dirs[name] = serializeContents(entry.contents);
    } else if (entry && entry.data) {
      tree.files[name] = new Uint8Array(entry.data); // copy out of the heap
    }
  }
  return tree;
}

function flush() {
  if (!preopen) return;
  const tree = serializeContents(preopen.dir.contents);
  postMessage({ type: "persist", uuid, tree });
}

// browser_wasi_shim's OpenFile lacks fd_pread/fd_pwrite, which the c2w runtime
// uses. Patch any opened file (and recurse into opened subdirs) to add them.
function wrapDirOpen(dirObj) {
  const orig = dirObj.path_open.bind(dirObj);
  dirObj.path_open = (...args) => patchFd(orig(...args));
}

function patchFd(ret) {
  const o = ret && ret.fd_obj;
  if (!o) return ret;
  if (o.file) {
    o.fd_pread = (view8, iovs, offset) =>
      seekDo(o, offset, () => o.fd_read(view8, iovs), "nread");
    o.fd_pwrite = (view8, iovs, offset) =>
      seekDo(o, offset, () => o.fd_write(view8, iovs), "nwritten");
  } else if (o.dir) {
    wrapDirOpen(o);
  }
  return ret;
}

function seekDo(o, offset, fn, key) {
  const old = o.file_pos;
  let r = o.fd_seek(offset, WHENCE_SET);
  if (r.ret !== 0) return { ret: -1, [key]: 0 };
  const res = fn();
  r = o.fd_seek(old, WHENCE_SET);
  if (r.ret !== 0) return { ret: -1, [key]: 0 };
  return res;
}

// ---- stdin/stdout/stderr bridge to xterm-pty (from the upstream example) ---

function wasiHack(wasi, ttyClient, connfd) {
  const ERRNO_INVAL = 28;
  const _fd_read = wasi.wasiImport.fd_read;
  wasi.wasiImport.fd_read = (fd, iovs_ptr, iovs_len, nread_ptr) => {
    if (fd == 0) {
      const buffer = new DataView(wasi.inst.exports.memory.buffer);
      const buffer8 = new Uint8Array(wasi.inst.exports.memory.buffer);
      const iovecs = Iovec.read_bytes_array(buffer, iovs_ptr, iovs_len);
      let nread = 0;
      for (let i = 0; i < iovecs.length; i++) {
        const iovec = iovecs[i];
        if (iovec.buf_len == 0) continue;
        const data = ttyClient.onRead(iovec.buf_len);
        buffer8.set(data, iovec.buf);
        nread += data.length;
      }
      buffer.setUint32(nread_ptr, nread, true);
      return 0;
    }
    return _fd_read.apply(wasi.wasiImport, [fd, iovs_ptr, iovs_len, nread_ptr]);
  };
  const _fd_write = wasi.wasiImport.fd_write;
  wasi.wasiImport.fd_write = (fd, iovs_ptr, iovs_len, nwritten_ptr) => {
    if (fd == 1 || fd == 2) {
      const buffer = new DataView(wasi.inst.exports.memory.buffer);
      const buffer8 = new Uint8Array(wasi.inst.exports.memory.buffer);
      const iovecs = Ciovec.read_bytes_array(buffer, iovs_ptr, iovs_len);
      let wtotal = 0;
      for (let i = 0; i < iovecs.length; i++) {
        const iovec = iovecs[i];
        const buf = buffer8.slice(iovec.buf, iovec.buf + iovec.buf_len);
        if (buf.length == 0) continue;
        ttyClient.onWrite(Array.from(buf));
        wtotal += buf.length;
      }
      buffer.setUint32(nwritten_ptr, wtotal, true);
      return 0;
    }
    return _fd_write.apply(wasi.wasiImport, [fd, iovs_ptr, iovs_len, nwritten_ptr]);
  };
  wasi.wasiImport.poll_oneoff = (in_ptr, out_ptr, nsubscriptions, nevents_ptr) => {
    if (nsubscriptions == 0) return ERRNO_INVAL;
    const buffer = new DataView(wasi.inst.exports.memory.buffer);
    const in_ = Subscription.read_bytes_array(buffer, in_ptr, nsubscriptions);
    let isReadPollStdin = false, isClockPoll = false;
    let pollSubStdin, clockSub, timeout = Number.MAX_VALUE;
    for (const sub of in_) {
      if (sub.u.tag.variant == "fd_read") {
        if (sub.u.data.fd != 0) return ERRNO_INVAL;
        isReadPollStdin = true; pollSubStdin = sub;
      } else if (sub.u.tag.variant == "clock") {
        if (sub.u.data.timeout < timeout) {
          timeout = sub.u.data.timeout; isClockPoll = true; clockSub = sub;
        }
      } else {
        return ERRNO_INVAL;
      }
    }
    const events = [];
    if (isReadPollStdin || isClockPoll) {
      let readable = false;
      if (isReadPollStdin || (isClockPoll && timeout > 0)) {
        readable = ttyClient.onWaitForReadable(timeout / 1000000000);
      }
      if (readable && isReadPollStdin) {
        const event = new Event();
        event.userdata = pollSubStdin.userdata;
        event.error = 0;
        event.type = new EventType("fd_read");
        events.push(event);
      }
      if (isClockPoll) {
        const event = new Event();
        event.userdata = clockSub.userdata;
        event.error = 0;
        event.type = new EventType("clock");
        events.push(event);
      }
    }
    Event.write_bytes_array(buffer, out_ptr, events);
    buffer.setUint32(nevents_ptr, events.length, true);
    return 0;
  };
}
