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

/**
 * Strip comments, keeping string literals and dollar-quoted bodies intact.
 *
 * ONE PASS, not a line filter. The line-by-line version knew about `--` and
 * about quotes but nothing about block comments -- so a `--` written INSIDE a
 * /* ... *\/ comment ended the line early and took the closing delimiter with
 * it, handing Postgres an unterminated comment. That is not a hypothetical: it
 * is how migration 0038 failed to paste.
 *
 * Dollar-quoted bodies are copied verbatim. A plpgsql function may legitimately
 * contain anything at all, and "cleaning" inside one would corrupt it.
 */
function stripComments(src) {
  let out = "";
  for (let i = 0; i < src.length; i++) {
    const c = src[i], two = src.slice(i, i + 2);

    // dollar-quote: copy through to the matching tag, untouched
    const dq = /^\$[A-Za-z_]*\$/.exec(src.slice(i));
    if (dq) {
      const tag = dq[0];
      const end = src.indexOf(tag, i + tag.length);
      const stop = end === -1 ? src.length : end + tag.length;
      out += src.slice(i, stop);
      i = stop - 1;
      continue;
    }

    if (c === "'" || c === '"') {
      const q = c;
      let j = i + 1;
      // '' inside a literal is an escaped quote, not the end of it
      while (j < src.length) {
        if (src[j] === q && src[j + 1] === q) { j += 2; continue; }
        if (src[j] === q) break;
        j++;
      }
      out += src.slice(i, j + 1);
      i = j;
      continue;
    }

    if (two === "--") { while (i < src.length && src[i] !== "\n") i++; out += "\n"; continue; }
    if (two === "/*") {
      const end = src.indexOf("*/", i + 2);
      i = (end === -1 ? src.length : end + 1);
      continue;
    }
    out += c;
  }
  return out;
}

const cleaned = stripComments(raw)
  .split("\n")
  .map((l) => l.replace(/\s+$/, ""))
  .filter((l) => l.trim())
  .join("\n");

// Statements end at a semicolon that is not inside a string OR inside a
// dollar-quoted body. The dollar-quote case is the one that matters: a plpgsql
// function is FULL of semicolons, and cutting on them would hand Postgres half
// a function — the exact failure this script exists to prevent.
const stmts = [];
let buf = "", q = null, dollar = null;
for (let i = 0; i < cleaned.length; i++) {
  const c = cleaned[i];

  if (dollar) {
    buf += c;
    if (c === "$" && cleaned.startsWith(dollar, i)) {
      buf += cleaned.slice(i + 1, i + dollar.length);
      i += dollar.length - 1;
      dollar = null;
    }
    continue;
  }
  if (q) { buf += c; if (c === q) q = null; continue; }

  // $$ or $tag$ opens a body that runs to the matching closer
  if (c === "$") {
    const m = cleaned.slice(i).match(/^\$[A-Za-z_]*\$/);
    if (m) { dollar = m[0]; buf += m[0]; i += m[0].length - 1; continue; }
  }

  buf += c;
  if (c === "'" || c === '"') { q = c; continue; }
  if (c === ";") { stmts.push(buf.trim()); buf = ""; }
}
if (buf.trim()) stmts.push(buf.trim());

// A single statement bigger than the budget cannot be cut — say so rather than
// splitting it and producing something that will not run.
for (const s of stmts)
  if (Buffer.byteLength(s) > MAX)
    console.error(`NOTE: one statement is ${Buffer.byteLength(s)} bytes and cannot be split — paste that part on its own.`);

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
