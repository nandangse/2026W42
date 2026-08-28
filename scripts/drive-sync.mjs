/**
 * drive-sync.mjs — carry Genie's photos and files into the Google Drive
 * folders (Dr Raghu, 28 Aug 2026).
 *
 * Vercel cannot write to Drive (no Google credential holds those folders),
 * but this Mac mounts the Drive itself — so the sync runs HERE, the same
 * arrangement as the old salary-sheet automation. It reads every attachment
 * not yet stamped drive_synced_at, writes photos into "Photos from Genie"
 * and everything else into "Files from Genie", and stamps the row so the
 * next run skips it. Re-running is always safe.
 *
 *   node scripts/drive-sync.mjs
 *
 * Covers task attachments (task_file, 0074) and job photos (job_photo, 0042
 * — whose migration promised exactly this move). Run it by hand or on a
 * schedule; each run prints what it carried.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname, extname } from "path";
import { fileURLToPath } from "url";

const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const env = Object.fromEntries(
  readFileSync(join(repo, ".env.local"), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const URL0 = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, authorization: `Bearer ${KEY}` };

const DRIVE = join(repo, "..", "Uploaded Files");
const PHOTOS = join(DRIVE, "Photos from Genie");
const FILES = join(DRIVE, "Files from Genie");
for (const d of [PHOTOS, FILES]) if (!existsSync(d)) mkdirSync(d, { recursive: true });

const day = (iso) => String(iso || "").slice(0, 10) || "undated";
const clean = (s) => String(s || "").replace(/[\\/:*?"<>|]+/g, "-").trim().slice(0, 80);

async function rows(table, cols) {
  const r = await fetch(`${URL0}/rest/v1/${table}?select=${cols}&drive_synced_at=is.null&limit=200`, { headers: H });
  if (!r.ok) { console.log(`${table}: skipped (${r.status}) — run migration 0074 first?`); return []; }
  return r.json();
}
async function download(bucket, path) {
  const r = await fetch(`${URL0}/storage/v1/object/${bucket}/${path}`, { headers: H });
  if (!r.ok) throw new Error(`download ${bucket}/${path}: ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}
async function stamp(table, id) {
  await fetch(`${URL0}/rest/v1/${table}?id=eq.${id}`, {
    method: "PATCH", headers: { ...H, "content-type": "application/json", prefer: "return=minimal" },
    body: JSON.stringify({ drive_synced_at: new Date().toISOString() }),
  });
}

let carried = 0;

for (const f of await rows("task_file", "id,task_id,task_kind,name,path,is_photo,at,by")) {
  try {
    const buf = await download("task-files", f.path);
    const dest = join(f.is_photo ? PHOTOS : FILES, `${day(f.at)} - Task ${f.task_id.slice(0, 8)} - ${clean(f.name)}`);
    writeFileSync(dest, buf);
    await stamp("task_file", f.id);
    console.log("→", dest.replace(DRIVE + "/", ""));
    carried++;
  } catch (e) { console.log("!! task_file", f.id, String(e.message || e)); }
}

for (const p of await rows("job_photo", "id,job_id,path,caption,taken_on,mime")) {
  try {
    const buf = await download("job-photos", p.path);
    const ext = extname(p.path) || ".jpg";
    const cap = clean(p.caption) || "photo";
    const dest = join(PHOTOS, `${day(p.taken_on)} - Job ${String(p.job_id).slice(-4)} - ${cap}${ext}`);
    writeFileSync(dest, buf);
    await stamp("job_photo", p.id);
    console.log("→", dest.replace(DRIVE + "/", ""));
    carried++;
  } catch (e) { console.log("!! job_photo", p.id, String(e.message || e)); }
}

/**
 * Kuber's Tally XML uploads (0075) — filed as "<date> - <INITIALS>/<kind>.xml"
 * so the Drive folder alone answers who uploaded what and when.
 *
 * The destination: set KUBER_TALLY_DIR to the mounted path of the Drive
 * folder Dr Raghu linked; until then they land in
 * "Uploaded Files/Tally XML from Genie", which syncs to Drive all the same
 * and can be moved or re-pointed without touching the rows.
 */
const TALLY = process.env.KUBER_TALLY_DIR || join(DRIVE, "Tally XML from Genie");
let tallyCarried = 0;
for (const u of await rows("kuber_upload", "id,kind,for_date,name,path,initials")) {
  try {
    if (!existsSync(TALLY)) mkdirSync(TALLY, { recursive: true });
    const sub = join(TALLY, `${u.for_date} - ${u.initials || "??"}`);
    if (!existsSync(sub)) mkdirSync(sub, { recursive: true });
    const buf = await download("kuber-uploads", u.path);
    const label = u.kind === "masters" ? "Tally XML Masters" : "Tally XML Transactions";
    const dest = join(sub, `${label} - ${u.name}`);
    writeFileSync(dest, buf);
    await stamp("kuber_upload", u.id);
    console.log("→", dest.replace(dirname(TALLY) + "/", ""));
    carried++; tallyCarried++;
  } catch (e) { console.log("!! kuber_upload", u.id, String(e.message || e)); }
}
if (tallyCarried) console.log(`Tally folder: ${TALLY}`);

console.log(carried ? `${carried} carried to Drive.` : "Nothing new to carry.");
