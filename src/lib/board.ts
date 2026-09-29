// Assembles the single GET /api/board payload from the DB, reshaped into the
// V1.9-flavoured objects the ported UI expects (start_date→start,
// offset_days→offset, milestones grouped into plans, etc.).
import type { SupabaseClient } from "@supabase/supabase-js";

export interface BoardJob {
  id: string;
  tag: string;
  fam: string;
  cust: string;
  val: number;
  tdd: string | null;
  otd: string | null;
  start: string | null;
  proj: string;
  stat: string;
  pct: number;
  note: string;
  own: string;
  mgmt: string | null;
  tp: number;
  tpv: number;
  tpp: number;
  kit: number;
  /** Physically being worked on now. Genie's own fact — the ERP has no such field. */
  onFloor: boolean;
  onFloorAt: string | null;
  /** Who owns QUALITY. jobs.own owns the date; this is a different question. */
  qualityOwner: string | null;
  productionOwner: string | null;
  kittingOwner: string | null;
  designOwner: string | null;
  /** Genie's read of the last three voice notes, rewritten when one is added. */
  floorSummary: string | null;
  floorSummaryAt: string | null;
  active: boolean;
  archived: boolean;
  /** Confirmed delivered by the Delivered Jobs report — plan is now read-only. */
  delivered: boolean;
  /** When it was actually delivered, where the report carried a date. */
  delivered_on: string | null;
  updated_at: string | null;
  /** Resolved Planning Owner account, if the ERP owner text matches one. */
  ownerInitials: string | null;
  ownerName: string | null;
  /**
   * The money side, from the Jobmaster export. Null means NOT RECORDED, which
   * is not zero — a job with no payment figure and a job with nothing left to
   * collect must never sort together.
   */
  clientUpdate: string | null;
  cashflow: string | null;
  escalation: string | null;
  amtNeeded: number | null;
  payOnDelivery: number | null;
  /** Genie's own band — B/O, 0-50 … 700+. See 0115_job_mandays.sql. */
  mandays: string | null;
  /** The vehicle it is built on — Genie's own, see 0173. */
  chassisNo: string | null;
  engineNo: string | null;
  vehicleModel: string | null;
  /** The cash a job throws off, and when — see 0116_job_commercials.sql. */
  advance: number | null;
  invested: number | null;
  wipLabour: number | null;
  payPctOn: number | null;
  payPct30: number | null;
  payPct60: number | null;
  payPct90: number | null;
  gst: number | null;
}

/** A person who can own jobs or be assigned tasks. */
export interface Person {
  id: string;
  email: string;
  role: string;
  initials: string | null;
  name: string | null;
  erpOwner: string | null;
  /** Line manager (profiles.id) — drives Tasking's "people reporting to me". */
  reportsTo: string | null;
}

function mapJob(r: any): BoardJob {
  return {
    id: r.id,
    tag: r.tag || "",
    fam: r.fam || "Unassigned",
    cust: r.cust || "",
    val: Number(r.val || 0),
    tdd: r.tdd,
    otd: r.otd,
    start: r.start_date,
    proj: r.proj || "",
    stat: r.stat || "",
    pct: Number(r.pct || 0),
    note: r.note || "",
    own: r.own || "",
    mgmt: r.mgmt,
    tp: Number(r.tp || 0),
    tpv: Number(r.tpv || 0),
    tpp: Number(r.tpp || 0),
    kit: Number(r.kit || 0),
    onFloor: !!r.on_floor,
    onFloorAt: r.on_floor_at ?? null,
    qualityOwner: r.quality_owner ?? null,
    productionOwner: r.production_owner ?? null,
    kittingOwner: r.kitting_owner ?? null,
    designOwner: r.design_owner ?? null,
    floorSummary: r.floor_summary ?? null,
    floorSummaryAt: r.floor_summary_at ?? null,
    active: !!r.active,
    archived: !r.active,
    delivered: !!r.delivered,
    delivered_on: r.delivered_on ?? null,
    updated_at: r.updated_at ?? null,
    ownerInitials: null, // filled in by resolveOwners() once people are loaded
    ownerName: null,
    clientUpdate: r.client_update ?? null,
    cashflow: r.cashflow ?? null,
    escalation: r.escalation ?? null,
    // Number(null) is 0, which would turn "not recorded" into "nothing due" —
    // the one confusion this column must not make.
    amtNeeded: r.amt_needed == null ? null : Number(r.amt_needed),
    payOnDelivery: r.pay_on_delivery == null ? null : Number(r.pay_on_delivery),
    mandays: (r.mandays as string | null) ?? null,
    chassisNo: (r.chassis_no as string | null) ?? null,
    engineNo: (r.engine_no as string | null) ?? null,
    vehicleModel: (r.vehicle_model as string | null) ?? null,
    // NEVER Number(null) here: 0 would turn "nobody has recorded an advance"
    // into "no advance was taken", and the cash forecast would promise money
    // that is already in the bank -- or was never coming.
    advance:   r.advance     == null ? null : Number(r.advance),
    invested:  r.invested    == null ? null : Number(r.invested),
    wipLabour: r.wip_labour  == null ? null : Number(r.wip_labour),
    payPctOn:  r.pay_pct_on  == null ? null : Number(r.pay_pct_on),
    payPct30:  r.pay_pct_30  == null ? null : Number(r.pay_pct_30),
    payPct60:  r.pay_pct_60  == null ? null : Number(r.pay_pct_60),
    payPct90:  r.pay_pct_90  == null ? null : Number(r.pay_pct_90),
    gst:       r.gst         == null ? null : Number(r.gst),
  };
}

/**
 * Link each job's ERP "Project Owner" text to a real Project Owner account.
 * Every people-picker in the app is driven by accounts, so this is the single
 * bridge between the Jobmaster's free text and the user list. A job whose owner
 * text matches nobody stays unresolved and shows as Unassigned.
 */
function resolveOwners(jobs: BoardJob[], people: Person[]): string[] {
  /**
   * The Jobmaster writes the Planning Owner as an EMAIL — pankajs@nandan.co.in
   * — while accounts are found by initials, display name or erp_owner. So both
   * sides are reduced to the same thing before comparing: lower-cased, and with
   * anything after an @ dropped. pankajs@nandan.co.in, PankajS@nandan.co.in and
   * a profile whose erp_owner is simply "pankajs" all land on one key.
   *
   * Without this the Owner column read "—" on nearly every job, and the boards'
   * owner filter had almost nobody in it.
   */
  const norm = (v: unknown) => String(v ?? "").trim().toLowerCase().split("@")[0].trim();

  const byKey = new Map<string, Person>();
  const add = (k: unknown, p: Person) => {
    const key = norm(k);
    if (key && !byKey.has(key)) byKey.set(key, p);
  };
  for (const p of people) {
    // erp_owner first so an explicitly configured mapping always wins over a
    // coincidence between somebody's initials and another person's login
    add(p.erpOwner, p);
    add(p.email, p);
    add(p.initials, p);
    add(p.name, p);
  }

  const unmatched = new Set<string>();
  for (const j of jobs) {
    const raw = String(j.own || "").trim();
    if (!raw) continue;
    const hit = byKey.get(norm(raw));
    if (hit) {
      j.ownerInitials = hit.initials;
      // the person's real name where we have it; otherwise the part of their
      // login before the @, which is at least a name somebody recognises
      j.ownerName = hit.name || hit.email.split("@")[0];
    } else {
      unmatched.add(raw);
    }
  }
  return [...unmatched].sort();
}

/**
 * Supabase caps every select at 1,000 rows — SILENTLY. On 28 Aug 2026 the
 * milestones table crossed 1,000 and the rows past the cap vanished from the
 * board; a Save-now from that truncated screen would have DELETED them
 * (delete-then-insert). Pankaj caught it within the hour. Every growing
 * table is paged from now on; the cap must never truncate silently again.
 */
async function pageAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<{ data: T[]; error: { message: string } | null }> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) return { data: out, error };
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return { data: out, error: null };
  }
}

export async function buildBoard(supabase: SupabaseClient) {
  const [
    jobsRes,
    projectsRes,
    erpRes,
    manualRes,
    commentsRes,
    plansRes,
    milestonesRes,
    baselineRes,
    materialsRes,
    settingsRes,
    templatesRes,
    batchesRes,
    peopleRes,
  ] = await Promise.all([
    // every page walks a FIXED order — pages of an unordered select can skip
    // or repeat rows, which is the same corruption wearing a new hat
    pageAll((a, b) => supabase.from("jobs").select("*").order("id").range(a, b)),
    pageAll((a, b) => supabase.from("projects").select("*").order("id").range(a, b)),
    pageAll((a, b) => supabase.from("erp_tasks").select("*").order("id").range(a, b)),
    pageAll((a, b) => supabase.from("manual_tasks").select("*").order("id").range(a, b)),
    pageAll((a, b) => supabase.from("task_comments").select("id, task_id, task_kind").order("id").range(a, b)),
    pageAll((a, b) => supabase.from("plans").select("*").order("job_id").range(a, b)),
    pageAll((a, b) => supabase.from("milestones").select("*").order("job_id").order("idx", { ascending: true }).range(a, b)),
    pageAll((a, b) => supabase.from("baseline_milestones").select("*").order("job_id").order("idx", { ascending: true }).range(a, b)),
    pageAll((a, b) => supabase.from("materials").select("*").order("id").range(a, b)),
    supabase.from("settings").select("priority_order").eq("id", 1).maybeSingle(),
    supabase.from("family_templates").select("*"),
    // only recent batches — the header just needs the latest per kind, and this
    // table grows by 3-4 rows every morning forever
    supabase.from("import_batches").select("*").order("uploaded_at", { ascending: false }).limit(24),
    // people — drives the Project Owner filter and the assignee pickers
    supabase
      .from("profiles")
      .select("id, email, role, initials, display_name, erp_owner, reports_to, disabled")
      .eq("disabled", false),
  ]);

  const firstErr =
    jobsRes.error ||
    projectsRes.error ||
    erpRes.error ||
    manualRes.error ||
    commentsRes.error ||
    plansRes.error ||
    milestonesRes.error ||
    baselineRes.error ||
    materialsRes.error ||
    settingsRes.error ||
    templatesRes.error ||
    batchesRes.error ||
    peopleRes.error;
  if (firstErr) throw new Error(firstErr.message);

  const people: Person[] = (peopleRes.data || []).map((p) => ({
    id: p.id,
    email: p.email,
    role: p.role,
    initials: p.initials ?? null,
    name: p.display_name ?? null,
    erpOwner: p.erp_owner ?? null,
    reportsTo: p.reports_to ?? null,
  }));
  // Jobs are filtered by Project Owners only. Tasks, by contrast, can be
  // assigned to ANY account that exists — whatever their role. Both lists come
  // only from real accounts, never from raw ERP text.
  const projectOwners = people.filter((p) => p.role === "project_owner" && p.initials);
  const assignableUsers = people;

  const allJobs = (jobsRes.data || []).map(mapJob);
  // ERP owner text → Project Owner account. Returns the names that matched
  // nobody, which Admin surfaces so they can be linked.
  const unlinkedOwners = resolveOwners(allJobs, people);
  const activeJobs = allJobs.filter((j) => j.active);

  // plans keyed by job_id (+ milestones grouped, reshaped to the UI plan object)
  const milesByJob: Record<string, any[]> = {};
  for (const m of milestonesRes.data || []) {
    (milesByJob[m.job_id] ||= []).push(m);
  }
  const plans: Record<string, any> = {};
  for (const p of plansRes.data || []) {
    const ms = (milesByJob[p.job_id] || [])
      .slice()
      .sort((a, b) => a.idx - b.idx)
      .map((m) => ({
        name: m.title,
        days: m.days,
        preds: m.preds || [],
        crew: m.crew || {},
        shift: m.shift || "D",
        offset: m.offset_days || 0,
        done: !!m.done,
        done_on: m.done_on,
      }));
    plans[p.job_id] = {
      start: p.start_date,
      baseline_on: p.baseline_on,
      baseline_end: p.baseline_end,
      milestones: ms,
    };
  }

  // ---- the project planning layer (0074) ----
  // Projects plan for themselves on the same schema as jobs; their plans ride
  // in the same `plans` record keyed by project id (ids never collide with
  // jobs). Tolerant read: before 0074 runs these tables do not exist, and the
  // board must not fall over for that.
  const [ppRes, pmRes] = await Promise.all([
    supabase.from("project_plans").select("*"),
    supabase.from("project_milestones").select("*").order("idx", { ascending: true }),
  ]);
  if (!ppRes.error && !pmRes.error) {
    const pmByProj: Record<string, any[]> = {};
    for (const m of pmRes.data || []) (pmByProj[m.project_id] ||= []).push(m);
    for (const p of ppRes.data || []) {
      plans[p.project_id] = {
        start: p.start_date,
        baseline_on: p.baseline_on,
        baseline_end: p.baseline_end,
        milestones: (pmByProj[p.project_id] || []).map((m) => ({
          name: m.title,
          days: m.days,
          preds: m.preds || [],
          crew: m.crew || {},
          shift: m.shift || "D",
          offset: m.offset_days || 0,
          done: !!m.done,
          done_on: m.done_on,
        })),
      };
    }
  }

  // Design's own dated stages per project (0088) — drawn on the project
  // timeline in violet. The table may not exist yet; the board must not
  // fall over for that.
  const designPlans: Record<string, { title: string; start: string | null; end: string | null; done: boolean }[]> = {};
  {
    const dpRes = await supabase.from("vishwa_design_plan")
      .select("project_id, idx, title, on_date, start_date, end_date, done").order("project_id").order("idx").limit(1000);
    if (!dpRes.error) {
      for (const m of dpRes.data || []) {
        const end = m.end_date ?? m.on_date ?? null;
        (designPlans[m.project_id] ||= []).push({ title: m.title, start: m.start_date ?? end, end, done: !!m.done });
      }
    }
  }

  // baselines keyed by job_id
  const baselines: Record<string, any[]> = {};
  for (const b of baselineRes.data || []) {
    (baselines[b.job_id] ||= []).push({
      idx: b.idx,
      title: b.title,
      start: b.start_date,
      end: b.end_date,
    });
  }

  // Stubs for jobs that are off the live board but whose work must stay
  // reachable: anything archived that still has a plan (proposed-vs-real), plus
  // every delivered job. A delivered job's milestones, baseline and materials
  // are never deleted — they stop being editable, not readable.
  const archived: Record<string, BoardJob> = {};
  // (a delivered job still in the export — installation stage — stays on the
  // live board and must not be listed twice)
  for (const j of allJobs) {
    if (!j.active && (plans[j.id] || j.delivered)) archived[j.id] = j;
  }

  // comment counts keyed "kind:task_id"
  const commentCounts: Record<string, number> = {};
  for (const c of commentsRes.data || []) {
    const k = c.task_kind + ":" + c.task_id;
    commentCounts[k] = (commentCounts[k] || 0) + 1;
  }

  // merged tasks (erp + manual) in the UI shape
  const tasks = [
    ...(erpRes.data || []).map((t) => ({
      id: t.id,
      kind: "erp" as const,
      j: t.job_id,
      t: t.title,
      d: t.detail,
      who: t.who,
      due: t.due,
      cat: t.cat,
      esc: t.esc,
      // why it was escalated — the Escalations table reads it
      esc_why: (t.esc_why ?? null) as string | null,
      done: !!t.done,
      // the date FIRST promised, and how often it has moved since. Lateness is
      // measured against this, never against the date currently on screen.
      original_due: t.original_due ?? t.due ?? null,
      push_count: t.push_count ?? 0,
      // ERP ToDos have no author inside Genie — they arrive from the export
      by: null as string | null,
      comments: commentCounts["erp:" + t.id] || 0,
    })),
    ...(manualRes.data || []).map((t) => ({
      id: t.id,
      kind: "manual" as const,
      j: t.job_id,
      t: t.title,
      d: t.detail,
      who: t.who,
      due: t.due,
      cat: t.cat,
      esc: t.esc,
      esc_why: (t.esc_why ?? null) as string | null,
      done: !!t.done,
      // who raised it — the key behind Tasking's "tasks I assigned" filter
      by: (t.created_by ?? null) as string | null,
      // when it was raised (0074) — rows older than the column stay blank
      created_at: (t.created_at ?? null) as string | null,
      original_due: t.original_due ?? t.due ?? null,
      push_count: t.push_count ?? 0,
      comments: commentCounts["manual:" + t.id] || 0,
    })),
  ];

  // materials keyed by job_id
  const materials: Record<string, any[]> = {};
  for (const m of materialsRes.data || []) {
    (materials[m.job_id] ||= []).push({
      id: m.id,
      item: m.item,
      qty: m.qty,
      status: m.status,
      custom: !!m.custom,
      due: m.due ?? null,
      who: m.who ?? null,
      note: m.note ?? null,
      // set once the line has been promoted to a task — the two are then held
      // in step by the API, in both directions
      task_id: m.task_id ?? null,
    });
  }

  // family templates map
  const templates: Record<string, any> = {};
  for (const t of templatesRes.data || []) templates[t.family] = t.milestones;

  // latest import batch per kind
  const batches: Record<string, any> = {};
  for (const b of batchesRes.data || []) {
    if (!batches[b.kind]) batches[b.kind] = b;
  }

  // WHO dropdown — project managers + job owners, deduped & sorted
  const owners = Array.from(
    new Set(
      [
        ...(projectsRes.data || []).map((p) => (p.mgr || "").trim()),
        ...allJobs.map((j) => (j.own || "").trim()),
      ].filter(Boolean),
    ),
  ).sort();

  // ---- kitting aggregate (fixed formula, spec §0.4) ----
  // material_value = val × (1 − tpp/100); kitted_value = material_value × kit/100
  // board kitting % = Σ kitted_value ÷ Σ material_value  (active jobs)
  // single pass; identical arithmetic to before
  let matSum = 0;
  let kitSum = 0;
  for (const j of activeJobs) {
    const materialValue = j.val * (1 - j.tpp / 100);
    matSum += materialValue;
    kitSum += materialValue * (j.kit / 100);
  }
  const kittingPct = matSum > 0 ? (kitSum / matSum) * 100 : 0;

  return {
    jobs: activeJobs,
    archived,
    projects: projectsRes.data || [],
    tasks,
    plans,
    designPlans,
    baselines,
    materials,
    priority: settingsRes.data?.priority_order?.length
      ? settingsRes.data.priority_order
      : null,
    templates,
    owners,
    people,
    projectOwners,
    assignableUsers,
    unlinkedOwners,
    // When the morning files last landed — informational, per Dr Raghu: this
    // stamp answers "how fresh is the data", not "when was a job last edited"
    // (per-job edit times still live on each row's updated_at).
    lastUpdated: batchesRes.data?.[0]?.uploaded_at ?? null,
    batches,
    aggregates: {
      kittingPct,
      materialValueSum: matSum,
      kittedValueSum: kitSum,
      activeJobCount: activeJobs.length,
    },
  };
}
