// ws-delegate.js — main-thread handler for delegate networking mode.
// Based on container2wasm v0.8.4 examples/wasi-browser/htdocs/ws-delegate.js.
// Modified: delegate accepts workerInitExtras to forward uuid/tmpTree in init.

function delegate(worker, workerImageName, address, workerInitExtras) {
    var shared = new SharedArrayBuffer(12 + 4096);
    var streamCtrl   = new Int32Array(shared, 0, 1);
    var streamStatus = new Int32Array(shared, 4, 1);
    var streamLen    = new Int32Array(shared, 8, 1);
    var streamData   = new Uint8Array(shared, 12);
    worker.postMessage(Object.assign(
        { type: "init", buf: shared, imagename: workerImageName },
        workerInitExtras || {}
    ));

    var ongoing = false;
    var opened = false;
    var accepted = false;
    var wsconn;
    var connbuf = new Uint8Array(0);

    return function(msg) {
        const req_ = msg.data;
        if (typeof req_ == "object" && req_.type) {
            switch (req_.type) {
            case "accept":
                if (opened) {
                    streamData[0] = 1; // already open
                    accepted = true;
                } else {
                    streamData[0] = 0;
                    if (!ongoing) {
                        ongoing = true;
                        wsconn = new WebSocket(address, "binary");
                        wsconn.binaryType = "arraybuffer";
                        wsconn.onmessage = (event) => {
                            var buf2 = new Uint8Array(connbuf.length + event.data.byteLength);
                            buf2.set(connbuf, 0);
                            buf2.set(new Uint8Array(event.data), connbuf.length);
                            connbuf = buf2;
                        };
                        wsconn.onclose = () => { opened = false; accepted = false; ongoing = false; };
                        wsconn.onopen  = () => { opened = true; accepted = false; ongoing = false; };
                        wsconn.onerror = () => { opened = false; accepted = false; ongoing = false; };
                    }
                }
                streamStatus[0] = 0;
                break;
            case "send":
                if (!accepted) { streamStatus[0] = -1; break; }
                wsconn.send(req_.buf);
                streamStatus[0] = 0;
                break;
            case "recv":
                if (!accepted) { streamStatus[0] = -1; break; }
                var length = Math.min(req_.len, streamData.length, connbuf.length);
                streamLen[0] = length;
                streamData.set(connbuf.slice(0, length), 0);
                connbuf = connbuf.slice(length);
                streamStatus[0] = 0;
                break;
            case "recv-is-readable":
                if (!accepted) { streamStatus[0] = -1; break; }
                streamData[0] = connbuf.length > 0 ? 1 : 0;
                streamStatus[0] = 0;
                break;
            default:
                console.log("ws-delegate: unknown request: " + req_.type);
                return;
            }
            Atomics.store(streamCtrl, 0, 1);
            Atomics.notify(streamCtrl, 0);
        }
    };
}
