/**
 * kuber-upload.mjs — the background door for Tally XMLs too big for the
 * browser (Dr Raghu, 28 Aug 2026: Master.xml runs 407 MB, Transactions 94 MB;
 * Vercel accepts ~4.5 MB, so files that size walk in HERE).
 *
 *   node scripts/kuber-upload.mjs \
 *     --masters "/path/to/Master.xml" \
 *     --transactions "/path/to/Transactions.xml" \
 *     [--date 2026-08-28] [--initials RJ]
 *
 * Either file may be given alone. What it does, per file:
 *   1. Copies it into the Drive Tally folder under "<date> - <INITIALS>/"
 *      (KUBER_TALLY_DIR, else "Uploaded Files/Tally XML from Genie") — the
 *      audit folder, already synced to Google Drive by the mount.
 *   2. Writes the kuber_upload row so Kuber's Upload Files ledger shows it,
 *      stamped drive_synced_at because the copy IS the filing.
 * The XML itself is not pushed to Supabase storage — at these sizes the Drive
 * copy is the store, and the parser reads it from the very same mount.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, copyFileSync } from "fs";
import { join, dirname, basename } from "path";
import { fileURLToPath } from "url";

const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const env = Object.fromEntries(
  readFileSync(join(repo, ".env.local"), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const URL0 = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const BY = env.RAGHU_EMAIL || "raghu@nandan.co.in";

const args = process.argv.slice(2);
const get = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const forDate = get("--date") || today;
const initials = (get("--initials") || "RJ").toUpperCase();
const files = [
  ["masters", get("--masters")],
  ["transactions", get("--transactions")],
].filter(([, p]) => p);
if (!files.length) {
  console.log("Nothing to do — pass --masters and/or --transactions with file paths.");
  process.exit(1);
}

const TALLY = process.env.KUBER_TALLY_DIR || join(repo, "..", "Uploaded Files", "Tally XML from Genie");
const sub = join(TALLY, `${forDate} - ${initials}`);
mkdirSync(sub, { recursive: true });

for (const [kind, src] of files) {
  if (!existsSync(src)) { console.log(`!! ${kind}: no file at ${src}`); continue; }
  const bytes = statSync(src).size;
  const label = kind === "masters" ? "Tally XML Masters" : "Tally XML Transactions";
  const destName = `${label} - ${basename(src)}`;
  const dest = join(sub, destName);
  copyFileSync(src, dest);
  console.log(`→ ${forDate} - ${initials}/${destName}  (${(bytes / 1024 / 1024).toFixed(0)} MB)`);

  const r = await fetch(`${URL0}/rest/v1/kuber_upload`, {
    method: "POST",
    headers: { apikey: KEY, authorization: `Bearer ${KEY}`, "content-type": "application/json", prefer: "return=minimal" },
    body: JSON.stringify({
      kind, for_date: forDate, name: destName,
      path: `drive/${forDate} - ${initials}/${destName}`,
      bytes, by: BY, initials,
      drive_synced_at: new Date().toISOString(),
    }),
  });
  console.log(r.ok ? `   ledger row written (${kind})` : `!! ledger refused: ${r.status} ${await r.text()}`);
}
console.log(`Filed under: ${sub}`);
