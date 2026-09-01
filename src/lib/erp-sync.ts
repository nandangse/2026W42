import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * THE ERP IMPORT — Projects and Jobmaster, straight off nandanerp
 * (Dr Raghu, 1 Sep 2026: "can we now stop the upload and instead do the API
 * import from erpnext?").
 *
 * THE MAPPING WAS READ OFF THE ERP, NOT GUESSED. Every pair below was checked
 * against records Genie already held from the morning upload, and they agree
 * character for character:
 *
 *   Jobmaster.customer_tag              → jobs.tag
 *   Jobmaster.project                   → jobs.proj
 *   Jobmaster.job_status                → jobs.stat
 *   Jobmaster.target_delivery_date_current → jobs.tdd
 *   Jobmaster.custom_otd_date           → jobs.otd
 *   Jobmaster.customer                  → jobs.cust
 *   Jobmaster.product_family            → jobs.fam
 *   Jobmaster.value                     → jobs.val
 *   Jobmaster.planning_owner            → jobs.own
 *
 *   Project.custom_project_director     → projects.mgr
 *   Project.customer_committed_delivery_→ projects.committed
 *   Project.expected_end_date           → projects.exp_end
 *   Project.project_stage               → projects.stage
 *   Project.sales_order                 → projects.so
 *   Project.jobnumberslist              → projects.job_numbers
 *
 * WHICH JOBS ARE THE BOARD. The ERP holds 3,021 Jobmasters; the board carries
 * 112. status = "Jobs in Process" returns exactly those 112 — the same set,
 * no job on the board missing from it and none of its jobs missing from the
 * board. That is the filter, and it was verified rather than assumed.
 *
 * WHAT THE IMPORT MUST NOT TOUCH. The upload's apply_jobs overwrites every
 * column, which is safe from a sheet that carries every column. It is NOT
 * safe here: Genie owns things the ERP has never heard of — the Management
 * Target Date, kitting and production percentages, the floor note, the
 * escalation, the client update. Those are written by people in Genie, and a
 * pull that blanked them would quietly destroy a day's work every hour. So
 * this writes ERP-OWNED COLUMNS ONLY and leaves the rest exactly as it found
 * them.
 */

export const JOB_ACTIVE_STATUS = "Jobs in Process";

export interface ErpCfg { base: string; H: Record<string, string> }

export async function erpConfig(crm: SupabaseClient): Promise<ErpCfg | { error: string }> {
  const { data } = await crm.from("integration_setting").select("config").eq("key", "erpnext").maybeSingle();
  const cfg = (data?.config || {}) as Record<string, string>;
  if (!cfg.url || !cfg.api_key || !cfg.api_secret)
    return { error: "The ERPNext keys are not saved — CRM → Settings → Integrations." };
  return {
    base: cfg.url.replace(/\/+$/, ""),
    H: { authorization: `token ${cfg.api_key}:${cfg.api_secret}` },
  };
}

/** Every row of a doctype, paged past Frappe's 1000-row habit. */
export async function erpAll(
  cfg: ErpCfg, doctype: string, fields: string[], filters?: unknown[],
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let start = 0; start < 40000; start += 500) {
    const u = `${cfg.base}/api/resource/${encodeURIComponent(doctype)}`
      + `?fields=${encodeURIComponent(JSON.stringify(fields))}`
      + (filters ? `&filters=${encodeURIComponent(JSON.stringify(filters))}` : "")
      + `&limit_start=${start}&limit_page_length=500`;
    const r = await fetch(u, { headers: cfg.H });
    if (!r.ok) throw new Error(`The ERP answered ${r.status} on ${doctype} page ${start}.`);
    const page = ((await r.json()) as { data?: Record<string, unknown>[] }).data ?? [];
    out.push(...page);
    if (page.length < 500) break;
  }
  return out;
}

/**
 * EVERY row of a Genie table, paged.
 *
 * PostgREST answers at most 1000 rows however large a .limit() is written,
 * and it does so SILENTLY — no error, no truncation flag, just a short array.
 * That nearly cost the delivery history: the map guarding banked dates was
 * built with .limit(20000), came back holding 1000 of 2,734 rows, and would
 * have let the import blank the 1,734 it never saw. A safety check built on a
 * silently truncated read is not a safety check.
 */
async function allRows(
  db: SupabaseClient, table: string, columns: string,
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let a = 0; ; a += 1000) {
    const { data, error } = await db.from(table).select(columns).order("id").range(a, a + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as unknown as Record<string, unknown>[]));
    if (!data || data.length < 1000) break;
    if (a > 100000) break;
  }
  return out;
}

const S = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
/** A date the way Postgres wants it, or null — never the empty string. */
const D = (v: unknown) => {
  const s = S(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};
const N = (v: unknown) => {
  const n = Number(S(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export const PROJECT_FIELDS = [
  "name", "custom_project_director", "customer_committed_delivery_",
  "expected_end_date", "project_stage", "sales_order", "jobnumberslist", "status",
];

export const JOB_FIELDS = [
  "name", "customer_tag", "product_family", "customer", "value",
  "target_delivery_date_current", "custom_otd_date", "job_start_date",
  "project", "job_status", "planning_owner", "status",
];

/**
 * DELIVERED JOBS (Dr Raghu, 1 Sep 2026: "the rest of the jobs are the
 * delivered jobs. We need them too … It is for delivered jobs.").
 *
 * The ledger, not the board — 2,717 of them on the ERP. The date that matters
 * is `actual_delivery_date`, and it was confirmed rather than assumed: on job
 * 2025262514 the ERP says 2026-08-30 and Genie's own banked row, carried in by
 * the morning sheet, says 2026-08-30 with date_source "Actual Delivery Date".
 *
 * delivered_jobs ACCUMULATES. Nothing here archives or deletes a row: a
 * delivery is a fact that happened, and a job the ERP later stops returning
 * must not vanish from the history.
 */
export const DELIVERED_FIELDS = [
  "name", "customer_tag", "product_family", "customer", "value",
  "actual_delivery_date", "target_delivery_date_current", "custom_otd_date",
  "job_start_date", "project", "job_status", "planning_owner", "status",
];
export const JOB_DELIVERED_STATUS = "Delivered";

/** One field that moved, in the words the morning needs to read it. */
export interface FieldChange {
  kind: "job" | "project" | "delivered";
  id: string;
  /** The customer tag, so a row reads as a machine rather than a number. */
  label: string;
  /** The column itself — what a radio button decides on. */
  key: string;
  field: string;
  from: string;
  to: string;
}

export interface SyncResult {
  projects: { read: number; written: number; created: number; changed: number };
  jobs: { read: number; written: number; archived: number; created: number; changed: number };
  delivered: { read: number; written: number; undated: number; created: number; changed: number };
  changes: FieldChange[];
  notes: string[];
  seconds: number;
}

/**
 * WHO WINS, FIELD BY FIELD (Dr Raghu, 1 Sep 2026):
 *
 *   "for now show those with a radio button and complete it in that import.
 *    Post that we will say Genie wins!!! For now I will still make them new
 *    records in the ERP. Post end september we will use the Genie fully."
 *
 * So the answer changes with the calendar, and the code should not have to.
 * Today the ERP is where records are born, so its answer is the default and
 * a human overrules it one row at a time on the import screen. After
 * September, Genie is the master and the default flips — a setting, not a
 * deploy.
 *
 * A DECISION IS KEYED BY kind:id:field, and only the differing fields ever
 * appear, because asking somebody to adjudicate two identical values is how
 * a review screen teaches people to click through without reading.
 */
export type Winner = "erp" | "genie";
export const decisionKey = (kind: string, id: string, field: string) => `${kind}:${id}:${field}`;

export interface SyncOptions {
  dry?: boolean;
  /** Per-field overrides from the radio buttons: kind:id:field → who wins. */
  decisions?: Record<string, Winner>;
  /** What happens to a difference nobody adjudicated. "erp" until October. */
  fallback?: Winner;
}

/** The columns worth telling somebody about when they move. */
const WATCHED: Record<string, string> = {
  tag: "Tag", fam: "Family", cust: "Customer", val: "Value",
  tdd: "Target delivery", otd: "OTD", start_date: "Start", proj: "Project",
  stat: "Status", own: "Owner",
  mgr: "Manager", committed: "Committed", exp_end: "Expected end",
  stage: "Stage", so: "Sales order", delivered_on: "Delivered on",
};

/**
 * Pull both doctypes into Genie.
 *
 * `dry` reads the ERP and reports what WOULD change without writing a row —
 * the first run of anything that touches the boards should be a dry one.
 */
export async function erpSync(
  genie: SupabaseClient, cfg: ErpCfg, opts: SyncOptions = {},
): Promise<SyncResult> {
  const notes: string[] = [];
  const dry = !!opts.dry;
  const decisions = opts.decisions ?? {};
  const fallback: Winner = opts.fallback ?? "erp";
  const began = Date.now();
  const changes: FieldChange[] = [];

  /** Genie keeps this field when the radio said so, or when the default does. */
  const genieKeeps = (kind: string, id: string, field: string) =>
    (decisions[decisionKey(kind, id, field)] ?? fallback) === "genie";

  /** Compare what is coming against what is held, and remember the difference. */
  const noteChanges = (
    kind: FieldChange["kind"], next: Record<string, unknown>,
    prev: Record<string, unknown> | undefined, label: string,
  ) => {
    if (!prev) return "created";
    let moved = false;
    for (const [k, v] of Object.entries(next)) {
      if (!(k in WATCHED)) continue;
      const a = prev[k], b = v;
      // A blank arriving where something stands is not a change: the guard
      // below keeps the old value, so reporting it would be a lie.
      const bEmpty = b === null || b === "" || (Array.isArray(b) && b.length === 0);
      const aHas = a !== null && a !== undefined && a !== "";
      if (bEmpty && aHas) continue;
      if (String(a ?? "") === String(b ?? "")) continue;
      moved = true;
      if (changes.length < 2000) {
        changes.push({ kind, id: String(next.id), label, key: k, field: WATCHED[k], from: String(a ?? "—"), to: String(b ?? "—") });
      }
    }
    return moved ? "changed" : "same";
  };

  // ---------------- jobs ----------------
  const erpJobs = await erpAll(cfg, "Jobmaster", JOB_FIELDS, [["status", "=", JOB_ACTIVE_STATUS]]);
  const jobRows = erpJobs.map((j) => ({
    id: S(j.name),
    tag: S(j.customer_tag),
    fam: S(j.product_family),
    cust: S(j.customer),
    val: N(j.value),
    tdd: D(j.target_delivery_date_current),
    otd: D(j.custom_otd_date),
    start_date: D(j.job_start_date),
    proj: S(j.project),
    stat: S(j.job_status),
    own: S(j.planning_owner),
  })).filter((j) => j.id);

  // ---------------- projects ----------------
  // Every project a live job stands on, plus the ones the ERP still calls
  // in process — so no job on the board can point at a project Genie lacks.
  const wanted = new Set(jobRows.map((j) => j.proj).filter(Boolean));
  const erpProjects = await erpAll(cfg, "Project", PROJECT_FIELDS);
  const projRows = erpProjects
    .filter((p) => wanted.has(S(p.name)) || S(p.status) === JOB_ACTIVE_STATUS)
    .map((p) => ({
      id: S(p.name),
      mgr: S(p.custom_project_director),
      committed: D(p.customer_committed_delivery_),
      exp_end: D(p.expected_end_date),
      stage: S(p.project_stage),
      so: S(p.sales_order),
      job_numbers: S(p.jobnumberslist).split(/[,\s]+/).filter(Boolean),
    }))
    .filter((p) => p.id);

  const missing = [...wanted].filter((w) => !projRows.some((p) => p.id === w));
  if (missing.length) notes.push(`${missing.length} project(s) named by a live job were not returned by the ERP: ${missing.slice(0, 5).join(", ")}`);

  // ---------------- delivered jobs ----------------
  const erpDelivered = await erpAll(cfg, "Jobmaster", DELIVERED_FIELDS, [["status", "=", JOB_DELIVERED_STATUS]]);
  const delRows = erpDelivered.map((j) => ({
    id: S(j.name),
    tag: S(j.customer_tag),
    fam: S(j.product_family),
    cust: S(j.customer),
    val: N(j.value),
    delivered_on: D(j.actual_delivery_date),
    // Named so a silent mis-match shows in the data, as the upload's own
    // date_source does — this one came from the ERP field of that name.
    date_source: D(j.actual_delivery_date) ? "actual_delivery_date (ERP)" : "",
    tdd: D(j.target_delivery_date_current),
    otd: D(j.custom_otd_date),
    start_date: D(j.job_start_date),
    proj: S(j.project),
    stat: S(j.job_status),
    own: S(j.planning_owner),
  })).filter((d) => d.id);
  const undated = delRows.filter((d) => !d.delivered_on).length;
  if (undated) notes.push(`${undated} delivered job(s) carry no actual_delivery_date on the ERP — banked, but undated.`);

  // ---------------- what would move ----------------
  // Read first, compare first. A dry run must be able to say exactly what a
  // real one would do, or it is a rehearsal that proves nothing.
  const projBefore = await allRows(genie, "projects", "*");
  const projPrev = new Map(projBefore.map((p) => [String(p.id), p]));
  const jobBefore = await allRows(genie, "jobs", "*");
  const jobPrev = new Map(jobBefore.map((r) => [String(r.id), r]));
  const delBefore = await allRows(genie, "delivered_jobs", "*");
  const delPrev = new Map(delBefore.map((r) => [String(r.id), r]));

  let jobsCreated = 0, jobsChanged = 0;
  for (const j of jobRows) {
    const v = noteChanges("job", j, jobPrev.get(j.id), j.tag);
    if (v === "created") jobsCreated++; else if (v === "changed") jobsChanged++;
  }
  let projCreated = 0, projChanged = 0;
  for (const p of projRows) {
    const v = noteChanges("project", p, projPrev.get(p.id), p.id);
    if (v === "created") projCreated++; else if (v === "changed") projChanged++;
  }
  let delCreated = 0, delChanged = 0;
  for (const d of delRows) {
    const v = noteChanges("delivered", d, delPrev.get(d.id), d.tag);
    if (v === "created") delCreated++; else if (v === "changed") delChanged++;
  }

  const liveIdsEarly = new Set(jobRows.map((j) => j.id));
  const wouldArchive = jobBefore.filter((r) => r.active === true && !liveIdsEarly.has(String(r.id))).length;

  if (dry) {
    return {
      projects: { read: projRows.length, written: 0, created: projCreated, changed: projChanged },
      jobs: { read: jobRows.length, written: 0, archived: wouldArchive, created: jobsCreated, changed: jobsChanged },
      delivered: { read: delRows.length, written: 0, undated, created: delCreated, changed: delChanged },
      changes,
      notes: [...notes, "Dry run — the ERP was read and nothing was written."],
      seconds: (Date.now() - began) / 1000,
    };
  }

  // ---------------- write ----------------
  /**
   * ONE RULE ACROSS ALL THREE TABLES: a BLANK from the ERP never erases a
   * value Genie already holds.
   *
   * It is the difference between "the ERP has a newer answer" and "the ERP
   * has no answer" — and an import that treats the second as the first is an
   * import that empties a column the first time somebody leaves a field
   * unfilled. A real change still lands, because a real change is not blank.
   */
  const keepFilled = <T extends Record<string, unknown>>(
    next: T, prev: Record<string, unknown> | undefined, kind?: string,
  ): T => {
    if (!prev) return next;
    const out: Record<string, unknown> = { ...next };
    for (const [k, v] of Object.entries(next)) {
      // The radio button, or the standing default, wins here: where Genie is
      // to keep a field, the ERP's answer is simply not applied.
      if (kind && k in WATCHED && String(prev[k] ?? "") !== String(v ?? "")
          && genieKeeps(kind, String(next.id), k)) {
        out[k] = prev[k];
        continue;
      }
      const empty = v === null || v === "" || (Array.isArray(v) && v.length === 0);
      const had = prev[k];
      const hadSomething = had !== null && had !== undefined && had !== ""
        && !(Array.isArray(had) && had.length === 0);
      if (empty && hadSomething) out[k] = had;
    }
    return out as T;
  };

  let projWritten = 0;
  const projFinal = projRows.map((p) => keepFilled(p, projPrev.get(p.id), "project"));
  for (let i = 0; i < projFinal.length; i += 200) {
    const slice = projFinal.slice(i, i + 200);
    const { error } = await genie.from("projects").upsert(slice, { onConflict: "id" });
    if (error) throw new Error(`projects: ${error.message}`);
    projWritten += slice.length;
  }

  // Jobs are upserted column by column so the ones Genie owns survive. A new
  // job arrives active; an existing one keeps its mgmt date, its percentages,
  // its floor note and everything else typed on this side.
  let jobWritten = 0;
  for (const j of jobRows) {
    const prev = jobPrev.get(j.id);
    const mapped = keepFilled(j, prev, "job");
    const payload = prev
      ? { ...mapped, active: true, archived_at: null, updated_at: new Date().toISOString() }
      : { ...mapped, active: true, archived_at: null, pct: 0, kit: 0, tp: 0, tpv: 0, tpp: 0, updated_at: new Date().toISOString() };
    const { error } = await genie.from("jobs").upsert(payload, { onConflict: "id" });
    if (!error) jobWritten++;
    else notes.push(`job ${j.id}: ${error.message}`);
  }

  // A job the ERP no longer calls in process leaves the board — archived,
  // never deleted, so its plans and history stay reachable.
  let archived = 0;
  const liveIds = new Set(jobRows.map((j) => j.id));
  const onBoard = jobBefore.filter((r) => r.active === true);
  const leaving = onBoard.map((r) => String(r.id)).filter((id) => !liveIds.has(id));
  if (leaving.length) {
    const { error } = await genie.from("jobs")
      .update({ active: false, archived_at: new Date().toISOString() }).in("id", leaving);
    if (!error) archived = leaving.length;
  }

  /**
   * The ledger: upserted in bulk, never archived, never deleted — AND NEVER
   * UN-DATED.
   *
   * 1,491 of the ERP's 2,717 delivered jobs carry no actual_delivery_date at
   * all, while Genie already holds a date for many of them, carried in years
   * ago by the morning sheet. A plain upsert would write null over every one
   * of those and destroy the delivery history in a single run — the exact
   * shape of quiet data loss that is only noticed months later, when a
   * delivered-on-time number has silently changed.
   *
   * So a blank date from the ERP LEAVES the banked date alone. The ERP may
   * fill a gap; it may not open one.
   */
  const bankedDate = new Map(delBefore.map((r) => [String(r.id), { on: r.delivered_on as string | null, src: r.date_source as string | null }]));
  let delWritten = 0, keptDate = 0;
  const delFinal = delRows.map((d) => {
    if (d.delivered_on) return d;
    const had = bankedDate.get(d.id);
    if (had?.on) {
      keptDate++;
      return { ...d, delivered_on: had.on, date_source: String(had.src || "kept from the earlier upload") };
    }
    return d;
  });
  if (keptDate) notes.push(`${keptDate} delivery date(s) already on record were KEPT — the ERP holds no date for those jobs.`);
  for (let i = 0; i < delFinal.length; i += 200) {
    const slice = delFinal.slice(i, i + 200);
    const { error } = await genie.from("delivered_jobs").upsert(slice, { onConflict: "id" });
    if (error) throw new Error(`delivered_jobs: ${error.message}`);
    delWritten += slice.length;
  }

  return {
    projects: { read: projRows.length, written: projWritten, created: projCreated, changed: projChanged },
    jobs: { read: jobRows.length, written: jobWritten, archived, created: jobsCreated, changed: jobsChanged },
    delivered: { read: delRows.length, written: delWritten, undated, created: delCreated, changed: delChanged },
    changes,
    notes,
    seconds: (Date.now() - began) / 1000,
  };
}
