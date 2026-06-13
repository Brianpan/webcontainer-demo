// worker.js — Classic Web Worker running the container WASM.
// Supports optional browser/delegate networking (see ?net= URL param).
// Mounts a writable /tmp preopened directory backed by OPFS via the main thread.

importScripts("https://cdn.jsdelivr.net/npm/xterm-pty@0.9.4/workerTools.js");
importScripts(location.origin + "/browser_wasi_shim/wasi_defs.js");
importScripts(location.origin + "/browser_wasi_shim/index.js");
importScripts(location.origin + "/wasi-util.js");
importScripts(location.origin + "/worker-util.js");

const GUEST_TMP = "/tmp";

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
        if (d.buf) registerSocketBuffer(d.buf);
        return;
    }
    // Any other message is the xterm-pty TtyClient handshake buffers → run.
    const ttyClient = new TtyClient(d);
    fetch(imagename, { credentials: "same-origin" })
        .then(r => r.arrayBuffer())
        .then(wasm => run(wasm, ttyClient));
};

function run(wasm, ttyClient) {
    preopen = buildPreopen(GUEST_TMP, tmpTree);
    const netParam = getNetParam();

    if (netParam && netParam.mode === "browser") {
        // Wait for TLS certificate from c2w-net-proxy before starting the kernel.
        recvCert().then(cert => {
            const certDir = getCertDir(cert);
            const fds = [
                undefined, undefined, undefined, // 0-2: stdio (patched by wasiHack)
                preopen,                          // 3: /tmp
                certDir,                          // 4: /.wasmenv (proxy TLS cert)
                undefined,                        // 5: socket listenfd
                undefined,                        // 6: accepted connfd
            ];
            const args = ["arg0", "--net=socket=listenfd=5", "--mac", genmac()];
            const env = [
                "SSL_CERT_FILE=/.wasmenv/proxy.crt",
                "https_proxy=http://192.168.127.253:80",
                "http_proxy=http://192.168.127.253:80",
                "HTTPS_PROXY=http://192.168.127.253:80",
                "HTTP_PROXY=http://192.168.127.253:80",
            ];
            startWasi(wasm, ttyClient, args, env, fds, 5, 6);
        });
        return;
    }

    if (netParam && netParam.mode === "delegate") {
        const fds = [
            undefined, undefined, undefined, // 0-2: stdio
            preopen,                          // 3: /tmp
            undefined,                        // 4: socket listenfd
            undefined,                        // 5: accepted connfd
        ];
        const args = ["arg0", "--net=socket=listenfd=4", "--mac", genmac()];
        startWasi(wasm, ttyClient, args, [], fds, 4, 5);
        return;
    }

    // No networking.
    const fds = [undefined, undefined, undefined, preopen];
    startWasi(wasm, ttyClient, [], [], fds, -1, -1);
}

function startWasi(wasm, ttyClient, args, env, fds, listenfd, connfd) {
    const wasi = new WASI(args, env, fds);
    wasiHack(wasi, ttyClient, connfd);
    if (listenfd >= 0) {
        wasiHackSocket(wasi, listenfd, connfd);
    } else {
        // WASM imports these symbols even without networking; provide stubs.
        const ERRNO_NOTSUP = 73;
        wasi.wasiImport.sock_accept = () => ERRNO_NOTSUP;
        wasi.wasiImport.sock_recv   = () => ERRNO_NOTSUP;
        wasi.wasiImport.sock_send   = () => ERRNO_NOTSUP;
    }
    WebAssembly.instantiate(wasm, { wasi_snapshot_preview1: wasi.wasiImport })
        .then(inst => {
            try {
                wasi.start(inst.instance);
            } catch (e) {
                // proc_exit throws by design in browser_wasi_shim; save /tmp.
                console.log("container exited:", e);
            }
            flush();
        });
}

// ---- TTY + socket bridge to xterm-pty -----------------------------------------

function wasiHack(wasi, ttyClient, connfd) {
    const ERRNO_INVAL = 28;

    const _fd_read = wasi.wasiImport.fd_read;
    wasi.wasiImport.fd_read = (fd, iovs_ptr, iovs_len, nread_ptr) => {
        if (fd == 0) {
            const buffer  = new DataView(wasi.inst.exports.memory.buffer);
            const buffer8 = new Uint8Array(wasi.inst.exports.memory.buffer);
            const iovecs  = Iovec.read_bytes_array(buffer, iovs_ptr, iovs_len);
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
            const buffer  = new DataView(wasi.inst.exports.memory.buffer);
            const buffer8 = new Uint8Array(wasi.inst.exports.memory.buffer);
            const iovecs  = Ciovec.read_bytes_array(buffer, iovs_ptr, iovs_len);
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
        let isReadPollStdin = false, isReadPollConn = false, isClockPoll = false;
        let pollSubStdin, pollSubConn, clockSub;
        let timeout = Number.MAX_VALUE;
        for (const sub of in_) {
            if (sub.u.tag.variant == "fd_read") {
                if (sub.u.data.fd == 0) {
                    isReadPollStdin = true; pollSubStdin = sub;
                } else if (connfd >= 0 && sub.u.data.fd == connfd) {
                    isReadPollConn = true; pollSubConn = sub;
                } else {
                    return ERRNO_INVAL;
                }
            } else if (sub.u.tag.variant == "clock") {
                if (sub.u.data.timeout < timeout) {
                    timeout = sub.u.data.timeout; isClockPoll = true; clockSub = sub;
                }
            } else {
                return ERRNO_INVAL;
            }
        }
        const events = [];
        if (isReadPollStdin || isReadPollConn || isClockPoll) {
            let readable = false;
            if (isReadPollStdin || (isClockPoll && timeout > 0)) {
                readable = ttyClient.onWaitForReadable(timeout / 1000000000);
            }
            if (readable && isReadPollStdin) {
                const ev = new Event();
                ev.userdata = pollSubStdin.userdata; ev.error = 0;
                ev.type = new EventType("fd_read");
                events.push(ev);
            }
            if (isReadPollConn) {
                const sockreadable = sockWaitForReadable();
                if (sockreadable == errStatus) return ERRNO_INVAL;
                if (sockreadable) {
                    const ev = new Event();
                    ev.userdata = pollSubConn.userdata; ev.error = 0;
                    ev.type = new EventType("fd_read");
                    events.push(ev);
                }
            }
            if (isClockPoll) {
                const ev = new Event();
                ev.userdata = clockSub.userdata; ev.error = 0;
                ev.type = new EventType("clock");
                events.push(ev);
            }
        }
        Event.write_bytes_array(buffer, out_ptr, events);
        buffer.setUint32(nevents_ptr, events.length, true);
        return 0;
    };
}

// ---- networking helpers -------------------------------------------------------

function getNetParam() {
    const vars = location.search.substring(1).split("&");
    for (const kv of vars) {
        const parts = kv.split("=");
        if (decodeURIComponent(parts[0]) == "net") {
            return { mode: parts[1], param: parts.slice(2).join("=") };
        }
    }
    return null;
}

function genmac() {
    return "02:XX:XX:XX:XX:XX".replace(/X/g, () =>
        "0123456789ABCDEF"[Math.floor(Math.random() * 16)]
    );
}

// ---- /tmp filesystem (OPFS persistence via main thread) -----------------------

function buildContents(tree) {
    const contents = {};
    for (const [name, data] of Object.entries(tree.files || {}))
        contents[name] = new File(data);
    for (const [name, sub] of Object.entries(tree.dirs || {}))
        contents[name] = new Directory(buildContents(sub));
    return contents;
}

function buildPreopen(guestPath, tree) {
    const dir = new PreopenDirectory(guestPath, buildContents(tree));
    dir.dir.contents["."] = dir.dir;
    wrapDirOpen(dir);
    return dir;
}

function serializeContents(contents) {
    const tree = { files: {}, dirs: {} };
    for (const [name, entry] of Object.entries(contents)) {
        if (name === "." || name === "..") continue;
        if (entry && entry.contents)
            tree.dirs[name] = serializeContents(entry.contents);
        else if (entry && entry.data)
            tree.files[name] = new Uint8Array(entry.data);
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
        o.fd_pread  = (view8, iovs, offset) => seekDo(o, offset, () => o.fd_read(view8, iovs),  "nread");
        o.fd_pwrite = (view8, iovs, offset) => seekDo(o, offset, () => o.fd_write(view8, iovs), "nwritten");
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
