// Split a migration for pasting into the Supabase SQL editor.
//
// Why this exists: a long paste truncates in transport, and Postgres then
// fails on half a statement — which looks like a broken migration rather than
// a broken paste. So: comments stripped, non-ASCII flagged, and cut ONLY on
// statement boundaries so no chunk can ever be half a statement.
//
//   node scratchpad/split-sql.mjs supabase/migrations/0027_lms.sql [maxBytes]
import { readFileSync } from "node:fs";

const file = process.argv[2];
const MAX = Number(process.argv[3] || 1900);
const raw = readFileSync(file, "utf8");

const bad = [...raw].filter((c) => c.charCodeAt(0) > 127);
if (bad.length) console.error(`WARNING: ${bad.length} non-ASCII character(s): ${[...new Set(bad)].join(" ")}\n`);

// strip -- comments and blank lines, keeping string literals intact
const cleaned = raw
  .split("\n")
  .map((l) => {
    let out = "", q = null;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (q) { out += c; if (c === q) q = null; continue; }
      if (c === "'" || c === '"') { q = c; out += c; continue; }
      if (c === "-" && l[i + 1] === "-") break;
      out += c;
    }
    return out.replace(/\s+$/, "");
  })
  .filter((l) => l.trim())
  .join("\n");

// statements end at a semicolon that is not inside a string
const stmts = [];
let buf = "", q = null;
for (let i = 0; i < cleaned.length; i++) {
  const c = cleaned[i];
  buf += c;
  if (q) { if (c === q) q = null; continue; }
  if (c === "'" || c === '"') { q = c; continue; }
  if (c === ";") { stmts.push(buf.trim()); buf = ""; }
}
if (buf.trim()) stmts.push(buf.trim());

const chunks = [];
let cur = "";
for (const s of stmts) {
  if (cur && Buffer.byteLength(cur + "\n" + s) > MAX) { chunks.push(cur); cur = s; }
  else cur = cur ? cur + "\n" + s : s;
}
if (cur) chunks.push(cur);

chunks.forEach((c, i) => {
  console.log(`\n${"=".repeat(64)}\n-- PART ${i + 1} of ${chunks.length}  (${Buffer.byteLength(c)} bytes)\n${"=".repeat(64)}`);
  console.log(c);
});
console.error(`\n${stmts.length} statements -> ${chunks.length} parts, largest ${Math.max(...chunks.map((c) => Buffer.byteLength(c)))} bytes`);
