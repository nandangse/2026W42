/**
 * POPULATE MARKETING'S LEADS — the aviation list, and the employees.
 *
 * Dr Raghu, 14 Sep 2026: "I want to populate leads in the genie marketing.
 * list = all aviation people. collect as much data as you can and put in
 * leads, other data pour in the notes." And separately: the employee contact
 * list, into the Employees list he had already made.
 *
 * WHY IT MATCHES BEFORE IT INSERTS. Measured first: of the 2,329 people on
 * the aviation tab who carry an e-mail, 2,231 — ninety-six per cent — are
 * ALREADY in the CRM's 139,645. Only 98 are new. A blind import would have
 * added thousands of duplicates to gain ninety-eight contactable people, and
 * a duplicate in a marketing list is a person who gets the same mail twice.
 *
 * So the aviation half is mostly ENRICHMENT, not acquisition: fill the gaps
 * on records already held — 540 LinkedIn addresses, 2,090 countries, 298
 * phones — and pour everything with no column of its own into person.notes.
 *
 * NOTHING IS EVER OVERWRITTEN. A field already holding a value is left
 * exactly as it is; the sheet fills blanks and nothing else. What the CRM
 * knows was typed by somebody here; what the sheet knows was scraped.
 *
 * Run with --live to write. Without it, it reports and touches nothing.
 */
import fs from "node:fs";
import { createSign } from "node:crypto";

const LIVE = process.argv.includes("--live");
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) || "").split("=")[1] || "both";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const U = env.CRM_SUPABASE_URL, K = env.CRM_SUPABASE_SERVICE_KEY;
const H = { apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json" };

const api = async (path, init = {}) => {
  const r = await fetch(`${U}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  const text = await r.text();
  let body = null; try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!r.ok) throw new Error(`${r.status} ${path} :: ${String(text).slice(0, 220)}`);
  return body;
};

/** Every row of a table, a thousand at a time — PostgREST truncates silently. */
async function allRows(path, select) {
  const out = []; let off = 0;
  for (;;) {
    const b = await api(`${path}?select=${select}&offset=${off}&limit=1000`);
    if (!Array.isArray(b) || !b.length) break;
    out.push(...b); off += b.length;
    if (b.length < 1000) break;
  }
  return out;
}

const norm = (s) => String(s || "").trim();
const lower = (s) => norm(s).toLowerCase();
/**
 * person.full_name is a GENERATED column — first_name + last_name. Inserting
 * it is refused outright (428C9), which is how the first employee run failed.
 * So a name is SPLIT so that the generated value reproduces it exactly:
 * everything up to the final space is the first name, the final token is the
 * last. "Dr Raghunandan Jagdish" → "Dr Raghunandan" + "Jagdish".
 */
const splitName = (full) => {
  const n = String(full || "").trim().replace(/\s+/g, " ");
  if (!n) return { first: null, last: null };
  const i = n.lastIndexOf(" ");
  return i < 0 ? { first: n, last: null } : { first: n.slice(0, i), last: n.slice(i + 1) };
};

const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

// ─── the sheet ──────────────────────────────────────────────────────────────
async function sheetRows() {
  const sa = JSON.parse(fs.readFileSync(process.env.SA_KEY_PATH, "utf8"));
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const h = b64({ alg: "RS256", typ: "JWT" });
  const p = b64({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/spreadsheets", aud: sa.token_uri, exp: now + 3600, iat: now });
  const sig = createSign("RSA-SHA256").update(`${h}.${p}`).sign(sa.private_key, "base64url");
  const tok = await (await fetch(sa.token_uri, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${h}.${p}.${sig}` }) })).json();
  const ID = "1LtKhi1gLRhQvqlGJiQlt0ZdHr7OtxCjiOgel0xTorW4";
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${ID}/values/${encodeURIComponent("'Other Aviation People'!A3:AK20000")}`,
    { headers: { authorization: `Bearer ${tok.access_token}` } });
  return (await res.json()).values || [];
}

/** The sheet's columns, by the header row on line 2. */
const COL = {
  full: 0, first: 1, last: 2, knows: 3, meet: 4, title: 5, company: 6, country: 7, region: 8,
  category: 9, email1: 10, email2: 11, email3: 12, phone1: 13, phone2: 14, phone3: 15,
  linkedin: 16, website: 17, apollo: 18, bio: 19, events: 20, altTitles: 21, altCompanies: 22,
  sourceTabs: 23, nSources: 24, merged: 25, basis: 26, sameName: 27, profileUrl: 28,
  enriched: 29, priority: 30, owner: 31, remarks: 32, dbNotes: 33, conflicts: 34, lisbon: 35,
};

/** Everything the CRM has no column for, as one readable block. */
function notesFrom(r) {
  const bits = [];
  const add = (label, i) => { const v = norm(r[i]); if (v) bits.push(`${label}: ${v}`); };
  add("Biography", COL.bio);
  add("Events / dates", COL.events);
  add("Category", COL.category);
  add("Region", COL.region);
  add("Website", COL.website);
  add("Alternative titles", COL.altTitles);
  add("Alternative companies", COL.altCompanies);
  add("Email 2", COL.email2);
  add("Email 3", COL.email3);
  add("Phone 2", COL.phone2);
  add("Phone 3", COL.phone3);
  add("Apollo link", COL.apollo);
  add("Expo 2026 profile", COL.profileUrl);
  add("Priority", COL.priority);
  add("Remarks", COL.remarks);
  add("Notes (from the old database)", COL.dbNotes);
  add("Conflicts flagged", COL.conflicts);
  add("Source tabs", COL.sourceTabs);
  if (norm(r[COL.lisbon]).toUpperCase() === "TRUE") bits.push("At GSE Expo Lisbon 2026");
  if (!bits.length) return null;
  return `— From the Aviation list, ${new Date().toISOString().slice(0, 10)} —\n${bits.join("\n")}`;
}

// ─── lists and tags ─────────────────────────────────────────────────────────
async function listId(name, description) {
  const found = await api(`mk_list?select=id,name&name=eq.${encodeURIComponent(name)}&limit=1`);
  if (found.length) return String(found[0].id);
  if (!LIVE) return "(would create)";
  const made = await api("mk_list", { method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ name, description, created_by_email: "raghu@nandan.co.in" }) });
  return String(made[0].id);
}
async function tagId(name) {
  const found = await api(`crm_tag?select=id&name=eq.${encodeURIComponent(name)}&limit=1`);
  if (found.length) return String(found[0].id);
  if (!LIVE) return null;
  const made = await api("crm_tag", { method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ name, owner_id: null }) });
  return String(made[0].id);
}

// ─── the run ────────────────────────────────────────────────────────────────
/**
 * DOES person.notes EXIST YET? Migration 0065 adds it. Until it is run the
 * import still works — it simply cannot carry the biographies, and says so
 * rather than failing at the first read.
 */
let HAS_NOTES = true;
async function probeNotes() {
  try { await api("person?select=notes&limit=1"); HAS_NOTES = true; }
  catch { HAS_NOTES = false; console.log("\n!! person.notes does not exist — run CRM migration 0065.\n   Everything else proceeds; 1,301 biographies have nowhere to go until it is run.\n"); }
}

const R = { enriched: 0, inserted: 0, unchanged: 0, noted: 0, listed: 0, skipped: 0, errors: [] };

async function aviation() {
  const rows = await sheetRows();
  const people = await allRows("person", `id,primary_email,primary_phone,linkedin_url,job_title,country,city${HAS_NOTES ? ",notes" : ""}`);
  const byEmail = new Map();
  for (const p of people) if (p.primary_email) byEmail.set(lower(p.primary_email), p);

  const list = await listId("All aviation people", "Every person on the aviation master tab who carries an e-mail address. Imported 14 Sep 2026.");
  const tag = await tagId("Aviation DB");

  const updates = [], inserts = [], members = [];
  for (const r of rows) {
    const em = lower(r[COL.email1]);
    if (!em || !em.includes("@")) { R.skipped++; continue; }
    const note = notesFrom(r);
    const hit = byEmail.get(em);
    if (hit) {
      const patch = {};
      if (norm(r[COL.phone1]) && !hit.primary_phone) patch.primary_phone = norm(r[COL.phone1]);
      if (norm(r[COL.linkedin]) && !hit.linkedin_url) patch.linkedin_url = norm(r[COL.linkedin]);
      if (norm(r[COL.title]) && !hit.job_title) patch.job_title = norm(r[COL.title]);
      if (norm(r[COL.country]) && !hit.country) patch.country = norm(r[COL.country]);
      if (HAS_NOTES && note && !hit.notes) { patch.notes = note; R.noted++; }
      if (Object.keys(patch).length) { updates.push({ id: hit.id, patch }); R.enriched++; }
      else R.unchanged++;
      members.push(hit.id);
    } else {
      inserts.push({
        ...(() => { const nm = splitName(r[COL.full]);
          return { first_name: norm(r[COL.first]) || nm.first, last_name: norm(r[COL.last]) || nm.last }; })(),
        job_title: norm(r[COL.title]) || null,
        primary_email: em,
        primary_phone: norm(r[COL.phone1]) || null,
        linkedin_url: norm(r[COL.linkedin]) || null,
        country: norm(r[COL.country]) || null,
        ...(HAS_NOTES ? { notes: note } : {}),
        source: "crm",
        created_by_email: "raghu@nandan.co.in",
      });
      R.inserted++;
    }
  }

  console.log(`\nAVIATION  — ${rows.length} rows read`);
  console.log(`   enrich   ${R.enriched}  (of which ${R.noted} gain a note)`);
  console.log(`   insert   ${R.inserted}`);
  console.log(`   already complete ${R.unchanged}`);
  console.log(`   no e-mail, skipped ${R.skipped}`);
  console.log(`   list "All aviation people" → ${list}  · tag → ${tag || "(would create)"}`);

  if (!LIVE) {
    console.log("\n   sample update:", JSON.stringify(updates[0], null, 1).slice(0, 420));
    console.log("\n   sample insert:", JSON.stringify(inserts[0], null, 1).slice(0, 420));
    return;
  }
  for (const u of updates) {
    try { await api(`person?id=eq.${u.id}`, { method: "PATCH", body: JSON.stringify(u.patch) }); }
    catch (e) { R.errors.push(String(e.message).slice(0, 120)); }
  }
  for (const c of chunk(inserts, 200)) {
    try {
      const made = await api("person", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(c) });
      for (const m of made) members.push(String(m.id));
    } catch (e) { R.errors.push(String(e.message).slice(0, 200)); }
  }
  for (const c of chunk([...new Set(members)], 500)) {
    try {
      await api("mk_list_member?on_conflict=list_id,person_id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
        body: JSON.stringify(c.map((pid) => ({ list_id: list, person_id: pid, added_by_email: "raghu@nandan.co.in" }))) });
      R.listed += c.length;
    } catch (e) { R.errors.push(String(e.message).slice(0, 200)); }
  }
  if (tag) for (const c of chunk([...new Set(members)], 500)) {
    try {
      await api("crm_tag_link?on_conflict=tag_id,entity,entity_id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
        body: JSON.stringify(c.map((pid) => ({ tag_id: tag, entity: "person", entity_id: pid }))) });
    } catch (e) { R.errors.push(String(e.message).slice(0, 160)); }
  }
}

async function employees() {
  /**
   * THE EMPLOYEE LIST HAS THREE TRAPS, all found before writing anything.
   *
   *   A TOTAL ROW at the foot — "TOTAL, 202 people" — which a naive import
   *   turns into a person called "202 people".
   *
   *   SIX PEOPLE WITH NO E-MAIL. Keyed on e-mail they vanish silently. They
   *   are staff with a mobile number, and a mobile is reachable.
   *
   *   ONE ADDRESS SHARED BY THREE PEOPLE — hr@nandan.co.in belongs to Tushar
   *   Giri, Pappu lal and Sunil Gayakwad on this sheet. Match on e-mail and
   *   two of the three are quietly discarded as duplicates of the first.
   *
   * So an employee is identified by EMPLOYEE ID, which is what actually
   * identifies them, and the id is written into the note. An existing CRM
   * record is matched by e-mail ONLY where that address belongs to one
   * person in the file.
   */
  const text = fs.readFileSync(process.env.EMP_CSV, "utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const rows = lines.slice(1).map((l) => l.split(",").map((s) => s.trim()))
    .filter((c) => /^\d+$/.test(c[0] || ""));          // the TOTAL row is not an employee

  const shared = new Set();
  const seen = new Map();
  for (const [, , , email] of rows) {
    const e = lower(email);
    if (!e) continue;
    if (seen.has(e)) shared.add(e);
    seen.set(e, true);
  }

  const people = await allRows("person", `id,primary_email,primary_phone,full_name${HAS_NOTES ? ",notes" : ""}`);
  const byEmail = new Map(), byName = new Map();
  for (const p of people) {
    if (p.primary_email) byEmail.set(lower(p.primary_email), p);
    if (p.full_name && !byName.has(lower(p.full_name))) byName.set(lower(p.full_name), p);
  }

  const list = await listId("Employees", "list of employees");
  const tag = await tagId("Employee");

  const inserts = [], members = [], patches = [];
  let had = 0, noEmail = 0, sharedRows = 0;
  for (const [empId, name, mobile, email] of rows) {
    const em = lower(email);
    const note = [
      "— Nandan GSE employee —",
      `Employee ID: ${empId}`,
      "Personal contact, from the employee contact list of 7 Sep 2026.",
      "NOT a market lead — do not include in customer campaigns.",
      shared.has(em) ? `NOTE: ${em} is shared by more than one employee on the source list.` : "",
    ].filter(Boolean).join("\n");

    if (!em) noEmail++;
    if (shared.has(em)) sharedRows++;

    /**
     * IDEMPOTENCE FOR THE ROWS E-MAIL CANNOT IDENTIFY.
     *
     * Running this twice inserted nine people a second time — the six with
     * no address and the three sharing hr@nandan.co.in, none of which an
     * e-mail can match. Inside one company's own 202-row staff list a full
     * name is a reliable enough key, and it is the only one left.
     */
    const hit = (em && !shared.has(em) ? byEmail.get(em) : null)
      || (!em || shared.has(em) ? byName.get(lower(name)) : null);
    if (hit) {
      had++; members.push(hit.id);
      const patch = {};
      if (norm(mobile) && !hit.primary_phone) patch.primary_phone = norm(mobile);
      if (HAS_NOTES && !hit.notes) patch.notes = note;
      if (Object.keys(patch).length) patches.push({ id: hit.id, patch });
    } else {
      const nm = splitName(name);
      inserts.push({
        first_name: nm.first,
        last_name: nm.last,
        primary_email: em || null,
        primary_phone: norm(mobile) || null,
        ...(HAS_NOTES ? { notes: note } : {}),
        source: "crm",
        created_by_email: "raghu@nandan.co.in",
      });
    }
  }

  console.log(`\nEMPLOYEES — ${rows.length} employees (TOTAL row dropped)`);
  console.log(`   already in the CRM ${had}   insert ${inserts.length}   patch ${patches.length}`);
  console.log(`   carried with no e-mail ${noEmail}  ·  on a shared address ${sharedRows} (kept apart, not merged)`);
  console.log(`   list "Employees" → ${list}  · tag → ${tag || "(would create)"}`);
  if (!LIVE) { console.log("\n   sample insert:", JSON.stringify(inserts[0], null, 1).slice(0, 420)); return; }

  for (const u of patches) {
    try { await api(`person?id=eq.${u.id}`, { method: "PATCH", body: JSON.stringify(u.patch) }); }
    catch (e) { R.errors.push(String(e.message).slice(0, 140)); }
  }
  for (const c of chunk(inserts, 100)) {
    try {
      const made = await api("person", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(c) });
      for (const m of made) members.push(String(m.id));
    } catch (e) { R.errors.push(String(e.message).slice(0, 220)); }
  }
  for (const c of chunk([...new Set(members)], 500)) {
    try {
      await api("mk_list_member?on_conflict=list_id,person_id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
        body: JSON.stringify(c.map((pid) => ({ list_id: list, person_id: pid, added_by_email: "raghu@nandan.co.in" }))) });
      R.listed += c.length;
    } catch (e) { R.errors.push(String(e.message).slice(0, 220)); }
  }
  if (tag) for (const c of chunk([...new Set(members)], 500)) {
    try {
      await api("crm_tag_link?on_conflict=tag_id,entity,entity_id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
        body: JSON.stringify(c.map((pid) => ({ tag_id: tag, entity: "person", entity_id: pid }))) });
    } catch (e) { R.errors.push(String(e.message).slice(0, 160)); }
  }
}

await probeNotes();
console.log(LIVE ? "=== LIVE — writing to the CRM ===" : "=== DRY RUN — nothing will be written ===");
if (ONLY === "both" || ONLY === "aviation") await aviation();
if (ONLY === "both" || ONLY === "employees") await employees();
if (R.errors.length) { console.log("\nERRORS:"); for (const e of [...new Set(R.errors)].slice(0, 8)) console.log("   ", e); }
else if (LIVE) console.log("\nno errors.");
