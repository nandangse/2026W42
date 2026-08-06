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
  active: boolean;
  archived: boolean;
  updated_at: string | null;
  /** Resolved Project Owner account, if the ERP owner text matches one. */
  ownerInitials: string | null;
  ownerName: string | null;
}

/** A person who can own jobs or be assigned tasks. */
export interface Person {
  id: string;
  email: string;
  role: string;
  initials: string | null;
  name: string | null;
  erpOwner: string | null;
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
    active: !!r.active,
    archived: !r.active,
    updated_at: r.updated_at ?? null,
    ownerInitials: null, // filled in by resolveOwners() once people are loaded
    ownerName: null,
  };
}

/**
 * Link each job's ERP "Project Owner" text to a real Project Owner account.
 * Every people-picker in the app is driven by accounts, so this is the single
 * bridge between the Jobmaster's free text and the user list. A job whose owner
 * text matches nobody stays unresolved and shows as Unassigned.
 */
function resolveOwners(jobs: BoardJob[], people: Person[]): string[] {
  const byKey = new Map<string, Person>();
  for (const p of people) {
    for (const k of [p.erpOwner, p.initials, p.name, p.email, p.email.split("@")[0]]) {
      const key = String(k ?? "").trim().toLowerCase();
      if (key && !byKey.has(key)) byKey.set(key, p);
    }
  }
  const unmatched = new Set<string>();
  for (const j of jobs) {
    const raw = String(j.own || "").trim();
    if (!raw) continue;
    const hit = byKey.get(raw.toLowerCase());
    if (hit) {
      j.ownerInitials = hit.initials;
      j.ownerName = hit.name || hit.email.split("@")[0];
    } else {
      unmatched.add(raw);
    }
  }
  return [...unmatched].sort();
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
    supabase.from("jobs").select("*"),
    supabase.from("projects").select("*"),
    supabase.from("erp_tasks").select("*"),
    supabase.from("manual_tasks").select("*"),
    supabase.from("task_comments").select("task_id, task_kind"),
    supabase.from("plans").select("*"),
    supabase.from("milestones").select("*").order("idx", { ascending: true }),
    supabase.from("baseline_milestones").select("*").order("idx", { ascending: true }),
    supabase.from("materials").select("*"),
    supabase.from("settings").select("priority_order").eq("id", 1).maybeSingle(),
    supabase.from("family_templates").select("*"),
    // only recent batches — the header just needs the latest per kind, and this
    // table grows by 3-4 rows every morning forever
    supabase.from("import_batches").select("*").order("uploaded_at", { ascending: false }).limit(24),
    // people — drives the Project Owner filter and the assignee pickers
    supabase
      .from("profiles")
      .select("id, email, role, initials, display_name, erp_owner, disabled")
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

  // archived stubs that still have a plan (so proposed-vs-real stays reachable)
  const archived: Record<string, BoardJob> = {};
  for (const j of allJobs) {
    if (!j.active && plans[j.id]) archived[j.id] = j;
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
      done: !!t.done,
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
      done: !!t.done,
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
