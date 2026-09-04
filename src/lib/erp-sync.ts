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

/**
 * KEEPING GENIE'S ANSWER MUST TELL THE ERP (Dr Raghu, 2 Sep 2026, of the
 * conflict screen: "hope this means that it is writing into the erp right?").
 *
 * It did not, and the hope was the right instinct. Choosing "keep Genie" only
 * refused the incoming value — Genie held its answer, nandanerp kept its own,
 * and the two stayed apart until somebody edited the ERP by hand. Worse, the
 * same conflict would be presented again on every sync, for ever.
 *
 * So a decision for Genie on a field the ERP can receive is now QUEUED into
 * erp_update, the same queue the boards' own corrections use, and goes out on
 * the next ⬆ Push to ERP. Deciding once now settles it in both places.
 *
 * Only these fields can be received; a decision on anything else still holds
 * in Genie and is reported as unable to travel, rather than silently pretending.
 */
export const ERP_PUSHABLE: Record<string, string> = {
  tdd: "Target Delivery Date Current",
  stat: "Job Status",
  kit: "Kitting percentage",
  pct: "Production Completion %",
  otd: "OTD Date",
};

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
  "expected_end_date", "project_stage", "sales_order", "jobnumberslist", "status", "modified",
  // Dr Raghu, 2 Sep 2026: "Short Summary Description - ERP / Description -
  // Genie / Projects please mapp for the import and export too." The ERP has
  // carried this all along -- the model, the platform, the max height -- and
  // Genie has had an empty `description` column waiting for it.
  "short_summary_description", "project_name", "customer",
];

/**
 * What a project correction can carry BACK to the ERP, and under which name
 * there. Jobs have had this since 29 Aug; projects had nothing, so a
 * description written in Genie stayed in Genie.
 */
export const PROJECT_PUSHABLE: Record<string, string> = {
  description: "Short Summary Description",
};

export const JOB_FIELDS = [
  "name", "customer_tag", "product_family", "customer", "value",
  "target_delivery_date_current", "custom_otd_date", "job_start_date",
  "project", "job_status", "planning_owner", "status",
  // Dr Raghu, 2 Sep 2026: the GST rate is already on Jobmaster, so nobody
  // types it 112 times.
  "custom_gst_rate",
  // when the ERP last touched the row -- "latest entry wins" needs it
  "modified",
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
  /** Fields Genie kept that are now waiting to go back to the ERP. */
  queuedForErp?: number;
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
/**
 * "latest" (Dr Raghu, 4 Sep 2026: "whichever is a later entry sync it"):
 * the side that touched the field LAST wins it. The ERP's word on when is
 * Jobmaster.modified; Genie's is the correction queue's changed_at for that
 * field, else the row's updated_at.
 */
export type Winner = "erp" | "genie" | "latest";
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
  description: "Short summary description", name: "Project name",
  gst: "GST rate",
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

  /**
   * When Genie last touched each field: the correction queue keeps one line
   * per job and field with its changed_at, whether or not it has travelled.
   * Loaded once; only consulted when the winner is "latest".
   */
  const genieTouched = new Map<string, string>();
  if (fallback === "latest" || Object.values(decisions).includes("latest")) {
    for (let from = 0; ; from += 1000) {
      const { data } = await genie.from("erp_update").select("job_id, field, changed_at").range(from, from + 999);
      for (const r of (data ?? []) as { job_id: string; field: string; changed_at: string }[]) {
        const k = `${r.job_id}:${r.field}`;
        if (!genieTouched.has(k) || genieTouched.get(k)! < r.changed_at) genieTouched.set(k, r.changed_at);
      }
      if ((data ?? []).length < 1000) break;
    }
  }
  /** ERP's "modified" is IST wall-clock without a zone; read it as IST. */
  const erpWhen = (v: unknown) => { const t = S(v).replace(" ", "T"); return t ? new Date(t + "+05:30").getTime() : 0; };

  /** Genie keeps this field when the radio said so, when the default does, or when Genie touched it last. */
  const genieKeeps = (kind: string, id: string, field: string, next?: Record<string, unknown>, prev?: Record<string, unknown>) => {
    const w = decisions[decisionKey(kind, id, field)] ?? fallback;
    if (w !== "latest") return w === "genie";
    const erpT = erpWhen(next?._erp_modified);
    const gT = new Date(genieTouched.get(`${id}:${field}`) ?? S(prev?.updated_at) ?? 0).getTime() || 0;
    return gT > erpT;
  };

  /** Fields Genie kept that the ERP can be told about — queued below. */
  const toQueue: { job_id: string; field: string; label: string; old_value: string; new_value: string }[] = [];

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
    gst: j.custom_gst_rate == null || j.custom_gst_rate === "" ? null : N(j.custom_gst_rate),
    _erp_modified: S(j.modified),
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
      name: S(p.project_name),
      cust: S(p.customer),
      description: S(p.short_summary_description),
      job_numbers: S(p.jobnumberslist).split(/[,\s]+/).filter(Boolean),
      _erp_modified: S(p.modified),
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
      queuedForErp: 0,
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
          && genieKeeps(kind, String(next.id), k, next, prev)) {
        out[k] = prev[k];
        // and tell the ERP, where the ERP can hear it
        const pushLabel = kind === "job" ? ERP_PUSHABLE[k]
          : kind === "project" ? PROJECT_PUSHABLE[k] : undefined;
        if (pushLabel) {
          toQueue.push({
            job_id: String(next.id), field: k, label: pushLabel,
            old_value: String(v ?? ""), new_value: String(prev[k] ?? ""),
          });
        }
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
  const strip = <T extends Record<string, unknown>>(r: T): T => { const o = { ...r } as Record<string, unknown>; delete o._erp_modified; return o as T; };
  const projFinal = projRows.map((p) => strip(keepFilled(p, projPrev.get(p.id), "project")));
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
    const mapped = strip(keepFilled(j, prev, "job"));
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

  /**
   * The queue write, after the board is settled. Deduped against what is
   * already waiting: pressing Synchronise twice must not ask the ERP to make
   * the same change twice.
   */
  let queued = 0;
  if (toQueue.length) {
    try {
      const { data: waiting } = await genie.from("erp_update")
        .select("job_id, field").is("exported_at", null).limit(5000);
      const have = new Set((waiting || []).map((r) => `${r.job_id}:${r.field}`));
      const fresh = toQueue.filter((t) => !have.has(`${t.job_id}:${t.field}`));
      if (fresh.length) {
        const { error } = await genie.from("erp_update").insert(
          fresh.map((t) => ({ ...t, changed_by: "sync (Genie kept)" })),
        );
        if (!error) queued = fresh.length;
      }
    } catch { /* the board is right either way */ }
    notes.push(queued
      ? `${queued} field(s) Genie kept are queued for the ERP — send them with ⬆ Update to ERP.`
      : "The fields Genie kept were already waiting in the ERP queue.");
  }

  return {
    queuedForErp: queued,
    projects: { read: projRows.length, written: projWritten, created: projCreated, changed: projChanged },
    jobs: { read: jobRows.length, written: jobWritten, archived, created: jobsCreated, changed: jobsChanged },
    delivered: { read: delRows.length, written: delWritten, undated, created: delCreated, changed: delChanged },
    changes,
    notes,
    seconds: (Date.now() - began) / 1000,
  };
}
