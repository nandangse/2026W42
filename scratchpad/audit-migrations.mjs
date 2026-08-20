// Which migrations are actually on the database?
//
// Genie has no migrations table -- files are pasted by hand -- so "did that one
// run" has been answered by waiting for an error. This probes one representative
// object per migration instead. Read-only.
import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.trim().startsWith("#")) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, authorization: `Bearer ${KEY}` };

// migration -> [table, column?] that only exists once it has run
/**
 * Migrations that create only FUNCTIONS have no column to look for, which is
 * why 0004, 0007, 0008, 0011 and 0016 sat unprobed for months while the audit
 * cheerfully reported "everything present".
 *
 * PostgREST exposes a no-argument function as an RPC, so they can simply be
 * called. A missing one comes back as a schema-cache miss; one that exists but
 * refuses (no JWT, so is_owner() is null) still proves it is THERE, which is
 * the only thing this is asking.
 */
const FUNCS = [
  ["0004 jwt_role",           "jwt_role"],
  ["0008 is_reader",          "is_reader"],
  ["0011 is_owner",           "is_owner"],
  ["0011 has_goals_access",   "has_goals_access"],
  ["0016 is_tasker",          "is_tasker"],
];

async function probeFuncs() {
  const out = [];
  for (const [label, fn] of FUNCS) {
    const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { ...H, "content-type": "application/json" },
      body: "{}",
    });
    // 404 / PGRST202 means no such function; anything else means it is there.
    const missing = r.status === 404 || /PGRST202/.test(await r.clone().text());
    out.push([label, !missing]);
  }
  return out;
}

const PROBES = [
  ["0001 profiles",           "profiles", "id"],
  ["0002 erp tables",         "jobs", "id"],
  ["0003 app tables",         "manual_tasks", "id"],
  ["0006 settings",           "settings", "priority_order"],
  ["0010 goals layer",        "swimlanes", "id"],
  ["0012 notifications",      "notifications", "id"],
  ["0013 sales genie",        "sales_access", "person_id"],
  ["0017 app settings",       "app_settings", "app_name"],
  ["0018 brain dump",         "brain_dump", "id"],
  ["0019 goals v2",           "goal_item", "id"],
  ["0020 delivered jobs",     "delivered_jobs", "id"],
  ["0021 department names",   "departments", "name"],
  ["0023 escalation reason",  "manual_tasks", "esc_why"],
  ["0024 employees",          "employees", "dob"],
  ["0025 fy targets",         "fy_targets", "sales_target"],
  ["0026 job money",          "jobs", "pay_on_delivery"],
  ["0026 hint cache",         "job_hint", "job_id"],
  ["0027 lms",                "lms_book", "id"],
  ["0028 escalation column",  "jobs", "escalation"],
  ["0028 goal category",      "goal_item", "swimlane_id"],
  ["0029 day mood",           "day_mood", "mood"],
  ["0029 image quote",        "image_quote", "url"],
  ["0029 quote folder",       "app_settings", "quote_folder"],
  ["0030 material due",       "materials", "due"],
  ["0030 material task link", "materials", "task_id"],
  ["0030 material comments",  "material_comment", "body"],
  ["0031 erp update queue",   "erp_update", "job_id"],
  ["0032 task original due",  "manual_tasks", "original_due"],
  ["0032 erp task original",  "erp_tasks", "original_due"],
  ["0032 date log",           "task_date_log", "new_due"],
  ["0033 batch kind employees","import_batches", "kind"],
  ["0034 groups: lc",         "profiles", "lc"],
  ["0034 groups: stratcom",   "profiles", "stratcom"],
  ["0034 groups: management", "profiles", "management"],
  ["0034 project name",       "projects", "name"],
  ["0034 project customer",   "projects", "cust"],
  ["0035 group rules fix",    "profiles", "stratcom"],
  ["0036 escalation closeout","task_closeout", "body"],
  ["0037 on floor",           "jobs", "on_floor"],
  ["0039 principle doc",      "principle_doc", "raw"],
  ["0040 quality owner",      "jobs", "quality_owner"],
  ["0040 voice notes",        "job_voice_note", "transcript"],
  ["0041 principle files",    "principle_file", "path"],
  ["0042 job photos",         "job_photo", "taken_on"],
  ["0043 floor summary",      "jobs", "floor_summary"],
  ["0044 task proposals",     "task_proposal", "title"],
  ["0045 feature requests",   "feature_request", "want"],
  ["0046 production owner",   "jobs", "production_owner"],
  ["0046 kitting owner",      "jobs", "kitting_owner"],
  ["0046 design owner",       "jobs", "design_owner"],
  // Sales Genie's own tables — 0014 and 0015 were never probed at all.
  ["0014 sales plan",         "sp_companies", "id"],
  ["0014 sales people",       "sp_people", "id"],
  ["0015 sales deals",        "sp_deals", "id"],
  ["0016 sales access",       "sales_access", "person_id"],
];

const missing = [];
for (const [label, table, col] of PROBES) {
  const r = await fetch(`${URL_}/rest/v1/${table}?select=${col}&limit=1`, { headers: H });
  const ok = r.ok;
  if (!ok) missing.push(label);
  let why = "";
  if (!ok) { const b = await r.json().catch(() => ({})); why = "  <- " + (b.message || r.status); }
  console.log(`${ok ? " OK  " : "MISS "} ${label}${why}`);
}
for (const [label, ok] of await probeFuncs()) {
  if (!ok) missing.push(label);
  console.log(`${ok ? " OK  " : "MISS "} ${label}()`);
}

console.log(missing.length ? `\n${missing.length} MISSING: ${missing.join(", ")}` : "\neverything present");
