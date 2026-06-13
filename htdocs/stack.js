// stack.js — main-thread networking stack for browser mode.
// Based on container2wasm v0.8.4 examples/wasi-browser/htdocs/stack.js.
// Modified: newStack accepts workerInitExtras to forward uuid/tmpTree in init.

function newStack(worker, workerImageName, stackWorker, stackImageName, workerInitExtras) {
    let p2vbuf = { buf: new Uint8Array(0) }; // proxy → vm
    let v2pbuf = { buf: new Uint8Array(0) }; // vm → proxy
    var proxyConn = { sendbuf: p2vbuf, recvbuf: v2pbuf };
    var vmConn    = { sendbuf: v2pbuf, recvbuf: p2vbuf };
    var proxyShared = new SharedArrayBuffer(12 + 4096);
    var certbuf = { buf: new Uint8Array(0), done: false };
    stackWorker.onmessage = connect("proxy", proxyShared, proxyConn, certbuf);
    stackWorker.postMessage({ type: "init", buf: proxyShared, imagename: stackImageName });

    var vmShared = new SharedArrayBuffer(12 + 4096);
    worker.postMessage(Object.assign(
        { type: "init", buf: vmShared, imagename: workerImageName },
        workerInitExtras || {}
    ));
    return connect("vm", vmShared, vmConn, certbuf);
}

function connect(name, shared, conn, certbuf) {
    var streamCtrl   = new Int32Array(shared, 0, 1);
    var streamStatus = new Int32Array(shared, 4, 1);
    var streamLen    = new Int32Array(shared, 8, 1);
    var streamData   = new Uint8Array(shared, 12);
    var sendbuf = conn.sendbuf;
    var recvbuf = conn.recvbuf;
    let accepted = false;
    var httpConnections = {};
    var curID = 0;
    var maxID = 0x7FFFFFFF;
    function getID() {
        var startID = curID;
        while (true) {
            if (httpConnections[curID] == undefined) return curID;
            curID = (curID >= maxID) ? 0 : curID + 1;
            if (curID == startID) return -1;
        }
    }
    function serveData(data, len) {
        var length = Math.min(len, streamData.byteLength, data.byteLength);
        var buf = data.slice(0, length);
        streamLen[0] = buf.byteLength;
        streamData.set(buf, 0);
        return data.slice(length);
    }
    return function(msg) {
        const req_ = msg.data;
        if (typeof req_ == "object" && req_.type) {
            switch (req_.type) {
            case "accept":
                accepted = true;
                streamData[0] = 1;
                streamStatus[0] = 0;
                break;
            case "send":
                if (!accepted) { streamStatus[0] = -1; break; }
                sendbuf.buf = appendData(sendbuf.buf, req_.buf);
                streamStatus[0] = 0;
                break;
            case "recv":
                if (!accepted) { streamStatus[0] = -1; break; }
                recvbuf.buf = serveData(recvbuf.buf, req_.len);
                streamStatus[0] = 0;
                break;
            case "recv-is-readable":
                if (recvbuf.buf.byteLength > 0) {
                    streamData[0] = 1;
                } else if ((req_.timeout != undefined) && (req_.timeout > 0)) {
                    if (this.timeoutHandler) {
                        clearTimeout(this.timeoutHandler);
                        this.timeoutHandler = null;
                    }
                    this.timeoutHandler = setTimeout(() => {
                        this.timeoutHandler = null;
                        streamData[0] = recvbuf.buf.byteLength > 0 ? 1 : 0;
                        streamStatus[0] = 0;
                        Atomics.store(streamCtrl, 0, 1);
                        Atomics.notify(streamCtrl, 0);
                    }, req_.timeout * 1000);
                    return; // reply deferred
                } else {
                    streamData[0] = 0;
                }
                streamStatus[0] = 0;
                break;
            case "http_send": {
                var reqObj = JSON.parse(new TextDecoder().decode(req_.req));
                reqObj.mode = "cors";
                reqObj.credentials = "omit";
                if (reqObj.headers && reqObj.headers["User-Agent"] != "")
                    delete reqObj.headers["User-Agent"];
                var reqID = getID();
                if (reqID < 0) { streamStatus[0] = -1; break; }
                httpConnections[reqID] = {
                    address: new TextDecoder().decode(req_.address),
                    request: reqObj,
                    requestSent: false,
                    reqBodybuf: new Uint8Array(0),
                    reqBodyEOF: false,
                };
                streamStatus[0] = reqID;
                break;
            }
            case "http_writebody": {
                var c = httpConnections[req_.id];
                c.reqBodybuf = appendData(c.reqBodybuf, req_.body);
                c.reqBodyEOF = req_.isEOF;
                streamStatus[0] = 0;
                if (req_.isEOF && !c.requestSent) {
                    c.requestSent = true;
                    if (c.request.method != "HEAD" && c.request.method != "GET")
                        c.request.body = c.reqBodybuf;
                    fetch(c.address, c.request).then(resp => {
                        c.response = new TextEncoder().encode(JSON.stringify({
                            bodyUsed: resp.bodyUsed, headers: resp.headers,
                            redirected: resp.redirected, status: resp.status,
                            statusText: resp.statusText, type: resp.type, url: resp.url
                        }));
                        c.done = false;
                        c.respBodybuf = new Uint8Array(0);
                        if (resp.ok) {
                            resp.arrayBuffer().then(data => {
                                c.respBodybuf = new Uint8Array(data);
                                c.done = true;
                            }).catch(() => { c.done = true; });
                        } else {
                            c.done = true;
                        }
                    }).catch(() => {
                        c.response = new TextEncoder().encode(JSON.stringify({ status: 503, statusText: "Service Unavailable" }));
                        c.respBodybuf = new Uint8Array(0);
                        c.done = true;
                    });
                }
                break;
            }
            case "http_isreadable":
                streamData[0] = (httpConnections[req_.id] && httpConnections[req_.id].response != undefined) ? 1 : 0;
                streamStatus[0] = 0;
                break;
            case "http_recv": {
                var c = httpConnections[req_.id];
                if (!c || c.response == undefined) { streamStatus[0] = -1; break; }
                c.response = serveData(c.response, req_.len);
                streamStatus[0] = c.response.byteLength == 0 ? 1 : 0;
                break;
            }
            case "http_readbody": {
                var c = httpConnections[req_.id];
                if (!c || c.response == undefined) { streamStatus[0] = -1; break; }
                c.respBodybuf = serveData(c.respBodybuf, req_.len);
                streamStatus[0] = 0;
                if (c.done && c.respBodybuf.byteLength == 0) {
                    streamStatus[0] = 1;
                    delete httpConnections[req_.id];
                }
                break;
            }
            case "send_cert":
                certbuf.buf = appendData(certbuf.buf, req_.buf);
                certbuf.done = true;
                streamStatus[0] = 0;
                break;
            case "recv_cert":
                if (!certbuf.done) { streamStatus[0] = -1; break; }
                certbuf.buf = serveData(certbuf.buf, req_.len);
                streamStatus[0] = certbuf.buf.byteLength == 0 ? 0 : 1;
                break;
            default:
                console.log(name + ": unknown request: " + req_.type);
                return;
            }
            Atomics.store(streamCtrl, 0, 1);
            Atomics.notify(streamCtrl, 0);
        } else {
            console.log("UNKNOWN MSG " + msg);
        }
    };
}

function appendData(data1, data2) {
    var buf2 = new Uint8Array(data1.byteLength + data2.byteLength);
    buf2.set(new Uint8Array(data1), 0);
    buf2.set(new Uint8Array(data2), data1.byteLength);
    return buf2;
}
