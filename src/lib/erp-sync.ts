import type { SupabaseClient } from "@supabase/supabase-js";
import { swallow } from "@/lib/swallow";

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

const JOB_ACTIVE_STATUS = "Jobs in Process";

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
const ERP_PUSHABLE: Record<string, string> = {
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
/**
 * Fields whose names are inferred and may simply not exist on this ERP.
 * Recorded here when the ERP rejects them, so the sync can SAY so instead of
 * quietly returning rows with three empty columns for ever.
 */
export const droppedFields: string[] = [];

async function erpAll(
  cfg: ErpCfg, doctype: string, fields: string[], filters?: unknown[],
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  let ask = fields;
  for (let start = 0; start < 40000; start += 500) {
    const u = `${cfg.base}/api/resource/${encodeURIComponent(doctype)}`
      + `?fields=${encodeURIComponent(JSON.stringify(ask))}`
      + (filters ? `&filters=${encodeURIComponent(JSON.stringify(filters))}` : "")
      + `&limit_start=${start}&limit_page_length=500`;
    let r = await fetch(u, { headers: cfg.H });
    /**
     * A GUESSED FIELDNAME MUST FAIL OUT LOUD, NOT TAKE THE SYNC WITH IT.
     *
     * The vehicle fields' names are inferred from ERPNext's custom_ habit.
     * If this ERP spells them differently, Frappe refuses the whole request —
     * which would stop every project syncing over three columns. So they are
     * dropped once, the rest of the sync proceeds, and the names that were
     * dropped are reported rather than leaving three columns mysteriously
     * empty for ever.
     */
    if (!r.ok && ask.some((f) => VEHICLE_FIELDS.includes(f))) {
      const why = await r.text().catch(() => "");
      ask = ask.filter((f) => !VEHICLE_FIELDS.includes(f));
      for (const f of VEHICLE_FIELDS) if (!droppedFields.includes(f)) droppedFields.push(f);
      swallow("erp-sync/vehicle-fields", new Error(`${doctype}: ${why.slice(0, 200)}`));
      const again = `${cfg.base}/api/resource/${encodeURIComponent(doctype)}`
        + `?fields=${encodeURIComponent(JSON.stringify(ask))}`
        + (filters ? `&filters=${encodeURIComponent(JSON.stringify(filters))}` : "")
        + `&limit_start=${start}&limit_page_length=500`;
      r = await fetch(again, { headers: cfg.H });
    }
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

/**
 * The three fields the ERP's Project carries about the vehicle.
 *
 * Kept in their own list because they are the only names here that are
 * INFERRED rather than known: ERPNext prefixes a field added through
 * Customise Form with custom_, which is what every other custom field in
 * this ERP does. An inferred name must be able to fail out loud, so these
 * are optional — if the ERP does not know them the request is retried
 * without them and the sync reports which were dropped.
 */
export const VEHICLE_FIELDS = ["custom_vehicle_model", "custom_engine_no", "custom_chassis_no"];

/**
 * CONFIRMED to exist on the Jobmaster — read off a whole document, not
 * guessed. It is the answer to a question I had decided could not be
 * answered: whether a job is built on a vehicle. The ERP has been holding
 * that all along.
 */
export const VEHICLE_FLAG = "custom_is_vehicle_based";

const PROJECT_FIELDS = [
  "name", "custom_project_director", "customer_committed_delivery_",
  "expected_end_date", "project_stage", "sales_order", "jobnumberslist", "status", "modified",
  // Dr Raghu, 2 Sep 2026: "Short Summary Description - ERP / Description -
  // Genie / Projects please mapp for the import and export too." The ERP has
  // carried this all along -- the model, the platform, the max height -- and
  // Genie has had an empty `description` column waiting for it.
  "short_summary_description", "project_name", "customer",

  /**
   * THE COMPACT PROJECT DOCUMENT (Dr Raghu, 9 Sep 2026: "have a compact
   * project document which can have intelligence built in — not flab").
   *
   * A field earns a place here if somebody would sort, filter or chase by it.
   * Target-versus-actual pairs earn theirs twice over: a BOM released date on
   * its own is a fact; beside the date it was DUE it is a question, and
   * questions are what a project document is for.
   *
   * NO COMMERCIALS, on his instruction and on the evidence — the ERP's
   * gross_margin equals minus the purchase cost in 110 of the 145 projects
   * where it is not zero, and equals value-minus-cost in none of them. The
   * margin is rebuilt from Genie's own sources instead.
   */
  "is_active", "priority", "custom_product_family", "custom_quantity", "po_number",
  "expected_start_date", "percent_complete", "on_time_delivery_status",
  "design_stage", "custom_design_completion_",
  "custom_bom_release_target_date", "custom_bom_released_date",
  "custom_manufacturing_drawings_release_target_date", "custom_manufacturing_drawings_released_date",
  "custom_approved_bom", "material_availability_percentage",
  "custom_planning_owner", "custom_design_in_charge", "custom_production_job_owner",
  "custom_purchase_owner", "custom_kitting_owner", "custom_quality_owner", "custom_marketing_owner",
  "aar_to_be_done", "aar_done_and_filed",
  "custom_design_escalations", "custom_design_escalations_solved",

  /* the tick-boxes — forty of them, carried as ONE object below, because
     "14 of 22 gates done" is intelligence and twenty-two booleans is flab */
  "po_on_file", "kick_off_done", "sales_order_generated", "job_file_created",
  "responsible_persons_created", "prep_phase_created_and_sign_off_taken",
  "main_driver_identified", "ga_drawings_on_file", "packing_list",
  "chassis_inspection_checklist", "all_vehicle_document_received", "sop_made",
  "risk_assessment_form_", "custom_pre_design", "custom_approved",
  "updated_with_in_process_inspection_records", "updated_with_qap",
  "commissioning_and_warranty_certificate", "documents_for_dispatch",
  "sop_given", "spare_part_list", "file_kept_ready", "as_built_drawings_completed",
  "critical_review_needed_for_design", "cost_overrun_warning_by_design",
];

/** The ERP writes its long text as Quill HTML; a project document reads words. */
const unhtmlish = (v: unknown) => String(v ?? "")
  .replace(/<\/(p|div|li|br)>/gi, "\n").replace(/<[^>]*>/g, "")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/\n{3,}/g, "\n\n").trim();

/** The tick-boxes, kept together so they can be counted rather than listed. */
/**
 * Everything that earns a column of its own. Anything the ERP sends that is
 * NOT in here falls through to `notes` — kept, and shown to nobody.
 */
const PROJECT_KEEP = new Set<string>([
  "name", "project_name", "customer", "status", "is_active", "priority",
  "custom_project_director", "customer_committed_delivery_", "expected_end_date",
  "expected_start_date", "project_stage", "sales_order", "jobnumberslist",
  "short_summary_description", "modified", "custom_product_family", "custom_quantity",
  "po_number", "percent_complete", "on_time_delivery_status", "design_stage",
  "custom_design_completion_", "custom_bom_release_target_date", "custom_bom_released_date",
  "custom_manufacturing_drawings_release_target_date", "custom_manufacturing_drawings_released_date",
  "custom_approved_bom", "material_availability_percentage",
  "custom_planning_owner", "custom_design_in_charge", "custom_production_job_owner",
  "custom_purchase_owner", "custom_kitting_owner", "custom_quality_owner", "custom_marketing_owner",
  "aar_to_be_done", "aar_done_and_filed",
  "custom_design_escalations", "custom_design_escalations_solved",
  /* the tick-boxes are kept in `gates`, so they must not fall into notes too */
  "po_on_file", "kick_off_done", "sales_order_generated", "job_file_created",
  "responsible_persons_created", "prep_phase_created_and_sign_off_taken",
  "main_driver_identified", "ga_drawings_on_file", "packing_list",
  "chassis_inspection_checklist", "all_vehicle_document_received", "sop_made",
  "risk_assessment_form_", "custom_pre_design", "custom_approved",
  "updated_with_in_process_inspection_records", "updated_with_qap",
  "commissioning_and_warranty_certificate", "documents_for_dispatch",
  "sop_given", "spare_part_list", "file_kept_ready", "as_built_drawings_completed",
]);

const PROJECT_GATES: [string, string][] = [
  ["po_on_file", "PO on file"], ["kick_off_done", "Kick-off done"],
  ["sales_order_generated", "Sales order raised"], ["job_file_created", "Job file created"],
  ["responsible_persons_created", "Responsible people named"],
  ["prep_phase_created_and_sign_off_taken", "Prep phase signed off"],
  ["main_driver_identified", "Main driver identified"], ["ga_drawings_on_file", "GA drawings on file"],
  ["custom_pre_design", "Pre-design"], ["custom_approved", "Approved"],
  ["packing_list", "Packing list"], ["chassis_inspection_checklist", "Chassis inspection checklist"],
  ["all_vehicle_document_received", "Vehicle documents received"], ["sop_made", "SOP made"],
  ["risk_assessment_form_", "Risk assessment form"],
  ["updated_with_in_process_inspection_records", "In-process inspection records"],
  ["updated_with_qap", "QAP updated"],
  ["commissioning_and_warranty_certificate", "Commissioning & warranty certificate"],
  ["documents_for_dispatch", "Dispatch documents"], ["sop_given", "SOP given"],
  ["spare_part_list", "Spare part list"], ["file_kept_ready", "File kept ready"],
  ["as_built_drawings_completed", "As-built drawings"],
];

/**
 * What a project correction can carry BACK to the ERP, and under which name
 * there. Jobs have had this since 29 Aug; projects had nothing, so a
 * description written in Genie stayed in Genie.
 */
const PROJECT_PUSHABLE: Record<string, string> = {
  description: "Short Summary Description",
};

const JOB_FIELDS = [
  "name", "customer_tag", "product_family", "customer", "value",
  "target_delivery_date_current", "custom_otd_date", "job_start_date",
  "project", "job_status", "planning_owner", "status",
  // Dr Raghu, 2 Sep 2026: the GST rate is already on Jobmaster, so nobody
  // types it 112 times.
  "custom_gst_rate",
  /* THE VEHICLE IT IS BUILT ON (Dr Raghu, 29 Sep 2026: "its in ERP ... not
     project this is in jobmaster"). Optional, because these three names are
     inferred from ERPNext's custom_ habit rather than known — see
     VEHICLE_FIELDS. */
  ...VEHICLE_FIELDS,
  VEHICLE_FLAG,
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
const DELIVERED_FIELDS = [
  "name", "customer_tag", "product_family", "customer", "value",
  "actual_delivery_date", "target_delivery_date_current", "custom_otd_date",
  "job_start_date", "project", "job_status", "planning_owner", "status",
];
const JOB_DELIVERED_STATUS = "Delivered";
/**
 * A JOB IS DELIVERED BY ITS job_status, NOT ONLY BY ITS status.
 *
 * Dr Raghu, 9 Sep 2026: "It can also go from Job in process to Installation
 * Stage also, like you know before. But the actual delivery date will be
 * there." Both 8 BRD jobs proved it — the ERP holds
 * actual_delivery_date = 2026-09-09 and job_status = "D: Delivered" on each,
 * while `status` still reads "Installation Stage". This sync asked only for
 * status = "Delivered", so it archived them off the board and never banked
 * them: no longer pending, not yet delivered, counted nowhere.
 *
 * MEASURED BEFORE CHANGING ANYTHING (9 Sep 2026, against the live ERP):
 *
 *   status = "Delivered"              2,721
 *   job_status = "D: Delivered"       2,436
 *   D: Delivered AND status != Delivered   11
 *     of those 11 — Installation Stage 6, Cancelled 5
 *
 * So the second pull adds SIX real deliveries and would have added five
 * CANCELLED jobs with them. Cancelled is excluded by name: migration 0020
 * exists because five cancelled jobs once sat archived looking exactly like
 * deliveries, and this is the same five. A cancellation is not a delivery
 * however it is spelled.
 */
const JOB_DELIVERED_STATUS_2 = "D: Delivered";
const JOB_CANCELLED_STATUS = "Cancelled";

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
  projects: { read: number; written: number; created: number; changed: number; issues?: number };
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
const decisionKey = (kind: string, id: string, field: string) => `${kind}:${id}:${field}`;

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
    // Genie's "entry" on a field is a CORRECTION someone made -- the queue
    // has it, with its time. A row's updated_at is not that: every pull
    // stamps it, so reading it as a touch let Genie keep an EMPTY GST on
    // 73 jobs the last sync had merely written (found 4 Sep 2026). Where
    // there is no correction, the ERP's entry is the only entry.
    const gRaw = genieTouched.get(`${id}:${field}`);
    if (!gRaw) return false;
    return new Date(gRaw).getTime() > erpWhen(next?._erp_modified);
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
    /* The vehicle, straight off the Jobmaster row. keepFilled() below is what
       protects a number somebody typed here from a blank arriving from the
       ERP — an empty field is not later information, it is none. */
    is_vehicle: j[VEHICLE_FLAG] == null ? null : !!Number(j[VEHICLE_FLAG]),
    vehicle_model: S(j.custom_vehicle_model) || null,
    engine_no: S(j.custom_engine_no) || null,
    chassis_no: S(j.custom_chassis_no) || null,
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

      status: S(p.status),
      active: p.is_active === 1 || p.is_active === "Yes" || p.is_active === true,
      priority: S(p.priority),
      product_family: S(p.custom_product_family),
      quantity: N(p.custom_quantity),
      po_number: S(p.po_number),
      exp_start: D(p.expected_start_date),
      pct_complete: N(p.percent_complete),
      otd_status: S(p.on_time_delivery_status),
      design_stage: S(p.design_stage),
      design_pct: N(p.custom_design_completion_),
      bom_target: D(p.custom_bom_release_target_date),
      bom_released: D(p.custom_bom_released_date),
      dwg_target: D(p.custom_manufacturing_drawings_release_target_date),
      dwg_released: D(p.custom_manufacturing_drawings_released_date),
      approved_bom: S(p.custom_approved_bom),
      material_pct: N(p.material_availability_percentage),
      planning_owner: S(p.custom_planning_owner),
      design_owner: S(p.custom_design_in_charge),
      production_owner: S(p.custom_production_job_owner),
      purchase_owner: S(p.custom_purchase_owner),
      kitting_owner: S(p.custom_kitting_owner),
      quality_owner: S(p.custom_quality_owner),
      marketing_owner: S(p.custom_marketing_owner),
      aar_needed: !!Number(p.aar_to_be_done),
      aar_done: !!Number(p.aar_done_and_filed),
      escalations: unhtmlish(p.custom_design_escalations),
      escalations_solved: unhtmlish(p.custom_design_escalations_solved),

      /* counted, not listed */
      gates: Object.fromEntries(PROJECT_GATES.map(([k, label]) => [k, { label, done: !!Number(p[k]) }])),

      /* THE FLAB, KEPT AND NOT SHOWN. ERPNext's own plumbing means nothing in
         this house, but a field nobody thought to name is still there when it
         is wanted. */
      notes: Object.fromEntries(Object.entries(p).filter(([k, v]) =>
        !PROJECT_KEEP.has(k) && v !== null && v !== "" && v !== 0)),

      _erp_modified: S(p.modified),
    }))
    .filter((p) => p.id);

  const missing = [...wanted].filter((w) => !projRows.some((p) => p.id === w));
  if (missing.length) notes.push(`${missing.length} project(s) named by a live job were not returned by the ERP: ${missing.slice(0, 5).join(", ")}`);

  // ---------------- delivered jobs ----------------
  /* Two questions, because the ERP answers "is it delivered?" in two
     places. Merged by name — a job that satisfies both is one delivery. */
  const erpDeliveredA = await erpAll(cfg, "Jobmaster", DELIVERED_FIELDS, [["status", "=", JOB_DELIVERED_STATUS]]);
  const erpDeliveredB = await erpAll(cfg, "Jobmaster", DELIVERED_FIELDS, [
    ["job_status", "=", JOB_DELIVERED_STATUS_2],
    ["status", "!=", JOB_CANCELLED_STATUS],
  ]);
  const byName = new Map<string, Record<string, unknown>>();
  for (const j of erpDeliveredA) byName.set(S(j.name), j);
  let extra = 0;
  for (const j of erpDeliveredB) { if (!byName.has(S(j.name))) { byName.set(S(j.name), j); extra++; } }
  if (extra) notes.push(`${extra} job(s) the ERP calls "D: Delivered" while their stage still reads something else — banked as deliveries.`);

  /**
   * A DATE IS A DELIVERY, WHATEVER THE STAGE SAYS.
   *
   * Dr Raghu, 29 Sep 2026, shown the jobs whose stage read "Installation
   * Stage" or "Cancelled" beside a real Actual Delivery Date: "this is
   * right. Add these status also."
   *
   * SO THE RULE IS THE DATE, NOT A LIST OF STAGES. Enumerating statuses
   * means coming back here every time somebody adds one — and the stage is
   * the thing that has proved unreliable, while an actual_delivery_date is
   * somebody recording that the machine went out. A cancelled job carrying
   * one was delivered and then cancelled; the delivery still happened.
   *
   * A cancelled job with NO date is still not a delivery, which is why this
   * asks for the date rather than for the stage.
   */
  const erpDeliveredC = await erpAll(cfg, "Jobmaster", DELIVERED_FIELDS, [
    ["actual_delivery_date", "is", "set"],
  ]);
  let dated = 0;
  for (const j of erpDeliveredC) { if (!byName.has(S(j.name))) { byName.set(S(j.name), j); dated++; } }
  if (dated) notes.push(`${dated} more job(s) carry an actual delivery date although their stage says otherwise — banked, because a date is a delivery.`);
  const erpDelivered = [...byName.values()];
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

  if (droppedFields.length) {
    /**
     * SAID, AND THEN ANSWERED.
     *
     * Saying "no field named custom_chassis_no" is honest but leaves somebody
     * to go hunting through Customise Form. The ERP already knows the answer:
     * fetching ONE Jobmaster whole returns every field it has, so the names
     * that look like the ones we wanted can simply be read off it and
     * offered. A diagnostic that names the fix is worth ten that name the
     * fault.
     */
    /* BOTH DOCTYPES, because the first answer raised a better question. The
       Jobmaster turned out to carry custom_is_vehicle_based and the chassis
       ORDERED/RECEIVED dates but no numbers — and the ERP screen showing
       Engine No and Chassis No also showed Project Type, which is a Project
       field. So ask the Project too rather than argue about which it is. */
    let found = "";
    const look = async (doctype: string, id: string | undefined) => {
      if (!id) return "";
      try {
        const r = await fetch(`${cfg.base}/api/resource/${doctype}/${encodeURIComponent(id)}`, { headers: cfg.H });
        if (!r.ok) return "";
        const doc = ((await r.json()) as { data?: Record<string, unknown> }).data || {};
        const hits = Object.keys(doc).filter((k) => /chass|engine|vehic/i.test(k));
        return hits.length ? ` — ${doctype} has: ${hits.join(", ")}` : "";
      } catch { return ""; }
    };
    found = (await look("Jobmaster", jobRows[0]?.id))
      + (await look("Project", jobRows.find((j) => j.proj)?.proj));
    if (!found) found = " — and nothing on either looks like chassis, engine or vehicle";
    notes.push(`the ERP has no field named ${droppedFields.join(", ")} — vehicle details not synced${found}`);
  }

  let projWritten = 0;
  const strip = <T extends Record<string, unknown>>(r: T): T => { const o = { ...r } as Record<string, unknown>; delete o._erp_modified; return o as T; };
  const projFinal = projRows.map((p) => strip(keepFilled(p, projPrev.get(p.id), "project")));
  for (let i = 0; i < projFinal.length; i += 200) {
    const slice = projFinal.slice(i, i + 200);
    const { error } = await genie.from("projects").upsert(slice, { onConflict: "id" });
    if (error) throw new Error(`projects: ${error.message}`);
    projWritten += slice.length;
  }

  /**
   * THE ISSUE LOG (Dr Raghu, 9 Sep 2026 — the PMP box).
   *
   * Read through the PARENT with dotted child fields, which is one query
   * rather than 1,693 document fetches. A child table cannot come back from
   * an ordinary list read, and asking for each project in turn would take
   * minutes to collect twenty rows.
   *
   * TWENTY ROWS IS ALL THERE IS. Across every project in the ERP the issue log
   * holds twenty entries, the oldest from 2021, and the risk list holds none
   * at all — which is worth saying plainly rather than shipping an empty
   * register that looks broken. The table is here so the habit has somewhere
   * to go; the ERP is not where that habit currently lives.
   *
   * THE RISK REGISTER IS NOT PULLED. Its child table is empty on every project
   * I could find, so its column names cannot be read off a real row — and a
   * mapping written against guessed field names is a mapping that fails
   * silently the first time somebody uses the feature.
   */
  let issueWritten = 0;
  try {
    const rows = await erpAll(cfg, "Project", [
      "name",
      "issue_log_details.name as row_name", "issue_log_details.idx as row_idx",
      "issue_log_details.issue_log", "issue_log_details.issue",
      "issue_log_details.issue_date", "issue_log_details.customer",
    ]);
    const live = new Set(projRows.map((p) => p.id));
    const up = rows
      .filter((r) => S(r.row_name) && S(r.issue) && live.has(S(r.name)))
      .map((r) => ({
        id: S(r.row_name), project_id: S(r.name), idx: Number(r.row_idx) || 0,
        issue_log: S(r.issue_log) || null, issue: S(r.issue),
        issue_date: D(r.issue_date), customer: S(r.customer) || null,
        pulled_at: new Date().toISOString(),
      }));
    if (up.length) {
      const { error } = await genie.from("project_issue").upsert(up, { onConflict: "id" });
      if (error) notes.push(`issue log: ${error.message}`);
      else issueWritten = up.length;
    }
  } catch (e) { swallow("erp-sync issues", e); }

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
    } catch (e) { swallow("lib/erp-sync", e); /* the board is right either way */ }
    notes.push(queued
      ? `${queued} field(s) Genie kept are queued for the ERP — send them with ⬆ Update to ERP.`
      : "The fields Genie kept were already waiting in the ERP queue.");
  }

  return {
    queuedForErp: queued,
    projects: { read: projRows.length, written: projWritten, created: projCreated, changed: projChanged, issues: issueWritten },
    jobs: { read: jobRows.length, written: jobWritten, archived, created: jobsCreated, changed: jobsChanged },
    delivered: { read: delRows.length, written: delWritten, undated, created: delCreated, changed: delChanged },
    changes,
    notes,
    seconds: (Date.now() - began) / 1000,
  };
}
