// logic.test.mjs — Unit tests for the pure logic in qemu/index.html.
//
// normalizeUrl() and disableGuestNetwork() are defined inside the module
// <script> of qemu/index.html and are not exported. To test the REAL source
// (not a hand-copied duplicate that can drift), we read index.html, extract the
// two function bodies verbatim by regex, and eval them into this scope.
//
// Run:  node logic.test.mjs
// Exit: 0 = all pass, non-zero = failures.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const __dirname = dirname(fileURLToPath(import.meta.url));
const INDEX = join(__dirname, "..", "..", "..", "..", "qemu", "index.html");

const html = await readFile(INDEX, "utf8");

// Extract `function normalizeUrl(raw) { ... }` and `function disableGuestNetwork() { ... }`
// verbatim from index.html so the tests exercise the shipped implementation.
function extractFn(name) {
  const re = new RegExp(`function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`, "m");
  const m = re.exec(html);
  if (!m) throw new Error(`could not locate function ${name}() in index.html`);
  // brace-match from the opening { of the function body
  let i = m.index + m[0].length - 1; // index of the '{'
  let depth = 0;
  for (let j = i; j < html.length; j++) {
    const c = html[j];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return html.slice(m.index, j + 1);
    }
  }
  throw new Error(`unbalanced braces extracting ${name}()`);
}

const normalizeUrlSrc = extractFn("normalizeUrl");
const disableGuestNetworkSrc = extractFn("disableGuestNetwork");

// eval into real functions. disableGuestNetwork references `Module` and
// `console`; we provide a controllable Module per call.
const normalizeUrl = eval(`(${normalizeUrlSrc})`);

let failures = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`PASS  ${name}`);
  } catch (e) {
    failures++;
    console.log(`FAIL  ${name}`);
    console.log("        " + (e && e.message ? e.message : e));
  }
}

// ---- normalizeUrl -----------------------------------------------------------
test("normalizeUrl('') === ''", () => {
  assert.equal(normalizeUrl(""), "");
});
test("normalizeUrl(null) === '' (defensive)", () => {
  assert.equal(normalizeUrl(null), "");
});
test("normalizeUrl('   ') === '' (whitespace-only trimmed to empty)", () => {
  assert.equal(normalizeUrl("   "), "");
});
test("normalizeUrl('ws://localhost:8888') unchanged", () => {
  assert.equal(normalizeUrl("ws://localhost:8888"), "ws://localhost:8888");
});
test("normalizeUrl('localhost:8888') === 'ws://localhost:8888'", () => {
  assert.equal(normalizeUrl("localhost:8888"), "ws://localhost:8888");
});
test("normalizeUrl preserves wss://", () => {
  assert.equal(normalizeUrl("wss://example.com:443"), "wss://example.com:443");
});
test("normalizeUrl trims surrounding whitespace", () => {
  assert.equal(normalizeUrl("  ws://localhost:8888  "), "ws://localhost:8888");
});
test("normalizeUrl trims then prepends scheme for bare host", () => {
  assert.equal(normalizeUrl("  localhost:8888 "), "ws://localhost:8888");
});
test("normalizeUrl scheme test is case-insensitive (WS://)", () => {
  assert.equal(normalizeUrl("WS://localhost:8888"), "WS://localhost:8888");
});

// ---- disableGuestNetwork ----------------------------------------------------
// Build a fresh Module + console spy for each scenario, eval the extracted fn
// against them, and assert on the resulting args array.
function runDisable(args) {
  const warnings = [];
  const Module = { arguments: args };
  const console = { warn: (...a) => warnings.push(a) };
  // eval closure that closes over the local Module + console
  const fn = eval(`(function(Module, console){ return (${disableGuestNetworkSrc}); })`)(
    Module,
    console
  );
  fn();
  return { args: Module.arguments, warnings };
}

// The exact 4-tuple that arg-module.js appends today.
const NIC = [
  "-netdev",
  "socket,id=vmnic,connect=127.0.0.1:8888",
  "-device",
  "virtio-net-pci,netdev=vmnic",
];

test("disableGuestNetwork removes exactly the 4 NIC tokens", () => {
  const base = ["-nographic", "-m", "1024M", ...NIC];
  const { args, warnings } = runDisable(base.slice());
  assert.deepEqual(args, ["-nographic", "-m", "1024M"]);
  assert.equal(warnings.length, 0, "should not warn when NIC tuple present");
});

test("disableGuestNetwork removes NIC when it is in the middle of args", () => {
  const base = ["-a", ...NIC, "-z", "end"];
  const { args } = runDisable(base.slice());
  assert.deepEqual(args, ["-a", "-z", "end"]);
});

test("disableGuestNetwork warns and leaves args intact when -netdev absent", () => {
  const base = ["-nographic", "-m", "1024M"];
  const { args, warnings } = runDisable(base.slice());
  assert.deepEqual(args, ["-nographic", "-m", "1024M"], "args must be untouched");
  assert.equal(warnings.length, 1, "should warn exactly once when NIC missing");
});

test("disableGuestNetwork does NOT splice when shape is broken (-netdev not followed by -device at i+2)", () => {
  // -netdev present but the '-device' token is not at index i+2 -> defensive: no splice, warn.
  const base = ["-netdev", "someval", "-notdevice", "x", "-device", "y"];
  const { args, warnings } = runDisable(base.slice());
  assert.deepEqual(args, base, "must not corrupt args when the 4-tuple shape is absent");
  assert.equal(warnings.length, 1, "should warn when the expected shape is not found");
});

test("disableGuestNetwork returns quietly when Module.arguments is not an array", () => {
  const warnings = [];
  const Module = { arguments: undefined };
  const console = { warn: (...a) => warnings.push(a) };
  const fn = eval(
    `(function(Module, console){ return (${disableGuestNetworkSrc}); })`
  )(Module, console);
  fn();
  assert.equal(Module.arguments, undefined);
  // implementation returns early (no warn) when not an array
  assert.equal(warnings.length, 0);
});

console.log("");
if (failures) {
  console.log(`== ${failures} test(s) FAILED ==`);
  process.exit(1);
} else {
  console.log("== all logic tests passed ==");
}
