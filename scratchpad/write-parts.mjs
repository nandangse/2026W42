// Write each part of a split migration to its own .sql file, so there is a
// file to open and copy rather than terminal output to select around.
import { writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { basename } from "node:path";

const file = process.argv[2];
const out = "scratchpad/paste";
mkdirSync(out, { recursive: true });

const text = execFileSync("node", ["scratchpad/split-sql.mjs", file], { encoding: "utf8" });
const stem = basename(file, ".sql");

// The header line is the only reliable divider; the rule lines above and below
// it are decoration and get stripped with everything else that is not SQL.
const lines = text.split("\n");
let cur = null;
const parts = [];
for (const l of lines) {
  const h = l.match(/^-- PART (\d+) of (\d+)/);
  if (h) { cur = { n: h[1], of: h[2], body: [] }; parts.push(cur); continue; }
  if (!cur) continue;
  if (/^={10,}$/.test(l)) continue;
  cur.body.push(l);
}

const files = [];
for (const p of parts) {
  const sql = p.body.join("\n").trim();
  if (!sql) continue;
  if (/^\s*\$?\s*(cd|node|npm)\s/.test(sql)) throw new Error("refusing to write a shell command as SQL");
  const name = `${out}/${stem}_part${p.n}of${p.of}.sql`;
  writeFileSync(name, sql + "\n");
  files.push(name);
}
console.log(files.join("\n"));
