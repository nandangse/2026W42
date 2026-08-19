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
console.log(missing.length ? `\n${missing.length} MISSING: ${missing.join(", ")}` : "\neverything present");
