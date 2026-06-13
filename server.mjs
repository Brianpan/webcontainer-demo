// server.mjs — static file server for the harness.
//
// Two things matter here:
//   1. xterm-pty uses SharedArrayBuffer for blocking stdin, which the browser
//      only exposes to cross-origin-isolated pages. That requires the COOP and
//      COEP headers below.
//   2. .wasm must be served as application/wasm for streaming instantiation.
//
// No dependencies: node server.mjs
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const ROOT = join(process.cwd(), "htdocs");
const PORT = process.env.PORT || 8080;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".wasm": "application/wasm",
  ".json": "application/json",
  ".svg": "image/svg+xml",
};

const server = createServer(async (req, res) => {
  // Cross-origin isolation — without these, SharedArrayBuffer is unavailable.
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");

  let urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (urlPath === "/") urlPath = "/index.html";

  // Contain path traversal to ROOT.
  const filePath = normalize(join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end("forbidden");
    return;
  }

  try {
    const info = await stat(filePath);
    if (info.isDirectory()) throw new Error("is dir");
    const body = await readFile(filePath);
    res.setHeader("Content-Type", MIME[extname(filePath)] || "application/octet-stream");
    res.writeHead(200).end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});

server.listen(PORT, () => {
  console.log(`serving ./htdocs on http://localhost:${PORT}  (cross-origin isolated)`);
});
