import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { requireVishwakarma } from "@/lib/vishwakarma";

export const dynamic = "force-dynamic";

/**
 * The Design Plans PROJECT grid (Dr Raghu, 28 Aug 2026): one row per live
 * project — its design stage and owner (design's own facts, vishwa_project),
 * its jobs, the project plan and next milestone (read from the planning
 * layer), and the problems register's open count against it.
 *
 * A project is "live" here when at least one active job stands on it.
 */
const DESIGN_STAGES = ["Design Kickoff", "Design GAD", "Design TBOM", "Design Manuf Drawings", "Design Full BOM", "As Built Checks", "Design Complete"];

type R = Record<string, unknown>;

// Problems and deliverables carry the job as typed text ("2596 · Ambulift").
// A row belongs to a job when the text carries the job's last four or its tag.
function matcher(jobs: { id: string; tag: string }[]) {
  const keys = jobs.flatMap((j) => [j.id.slice(-4), j.tag.trim().toLowerCase()].filter((k) => k.length >= 3));
  return (txt: unknown) => {
    const t = String(txt || "").toLowerCase();
    return t !== "" && keys.some((k) => t.includes(k));
  };
}

export async function GET(req: Request) {
  try {
    await requireVishwakarma();
    const admin = adminClient();

    // ?plan=<project id> — the DESIGN plan (Dr Raghu, 28 Aug 2026): design's
    // own dated stages, bracketed by the project's start and completion —
    // which are the planning layer's dates and NOT design's to change.
    const want = new URL(req.url).searchParams.get("plan");
    if (want) {
      const [{ data: proj }, { data: pp }, { data: js }, dpRes] = await Promise.all([
        admin.from("projects").select("id, exp_end, committed").eq("id", want).maybeSingle(),
        admin.from("project_plans").select("start_date").eq("project_id", want).maybeSingle(),
        admin.from("jobs").select("start_date").eq("active", true).eq("proj", want).order("start_date").limit(1),
        admin.from("vishwa_design_plan").select("idx, title, on_date, done").eq("project_id", want).order("idx").limit(500),
      ]);
      if (dpRes.error && /does not exist|schema cache/i.test(dpRes.error.message))
        return NextResponse.json({ installed: false });
      return NextResponse.json({
        installed: true,
        start: pp?.start_date ?? js?.[0]?.start_date ?? null,
        completion: proj?.exp_end ?? proj?.committed ?? null,
        stages: (dpRes.data || []).map((m) => ({ title: String(m.title), on_date: m.on_date ? String(m.on_date).slice(0, 10) : "", done: !!m.done })),
      });
    }

    // Everything the grid reads, in one round of pages. Growing tables walk
    // a stable order past the 1,000-row cap (the Pankaj rule).
    const pageAll = async (build: (a: number, b: number) => PromiseLike<{ data: R[] | null; error: { message: string } | null }>) => {
      const out: R[] = [];
      for (let a = 0; ; a += 1000) {
        const { data, error } = await build(a, a + 999);
        if (error) throw new Error(error.message);
        out.push(...(data || []));
        if ((data || []).length < 1000) break;
      }
      return out;
    };

    const [projects, jobs, pms, jms, dps, metaRes, problems, mtasks, etasks, weekRes, plans, profiles] = await Promise.all([
      pageAll((a, b) => admin.from("projects").select("id, mgr, stage, exp_end, job_numbers, description").order("id").range(a, b)),
      pageAll((a, b) => admin.from("jobs").select("id, tag, proj, active").eq("active", true).order("id").range(a, b)),
      pageAll((a, b) => admin.from("project_milestones").select("project_id, idx, title, done, done_on").order("project_id").order("idx").range(a, b)),
      pageAll((a, b) => admin.from("milestones").select("job_id, idx, title, done").order("job_id").order("idx").range(a, b)),
      admin.from("vishwa_design_plan").select("project_id, idx, title, on_date, done").order("project_id").order("idx").limit(1000).then((r) => ({ data: r.error ? [] : r.data, error: null })),
      admin.from("vishwa_project").select("*"),
      admin.from("vishwa_problem").select("id, title, job, status").limit(1000),
      admin.from("manual_tasks").select("id, job_id, title, who, due, esc, cat").eq("done", false).ilike("cat", "%design%").limit(1000),
      admin.from("erp_tasks").select("id, job_id, title, who, due, esc, cat").eq("done", false).ilike("cat", "%design%").limit(1000),
      admin.from("vishwa_week_work").select("id, on_date, designer, work, by").order("on_date").limit(500).then((r) => ({ data: r.error ? null : r.data, error: null })),
      admin.from("vishwa_plan").select("id, job, deliverable, owner, target, status").limit(1000),
      admin.from("profiles").select("display_name, email, disabled").order("display_name"),
    ]);

    if (metaRes.error && /does not exist|schema cache/i.test(metaRes.error.message))
      return NextResponse.json({ installed: false, rows: [], stages: DESIGN_STAGES, owners: [] });
    const meta = new Map((metaRes.data || []).map((m) => [String(m.project_id), m]));

    const jobsByProj = new Map<string, { id: string; tag: string }[]>();
    for (const j of jobs) {
      const p = String(j.proj || "").trim();
      if (!p) continue;
      (jobsByProj.get(p) ?? jobsByProj.set(p, []).get(p)!).push({ id: String(j.id), tag: String(j.tag || "") });
    }
    const jobById = new Map(jobs.map((j) => [String(j.id), { id: String(j.id), tag: String(j.tag || "") }]));

    const pmByProj = new Map<string, R[]>();
    for (const m of pms) {
      const k = String(m.project_id);
      (pmByProj.get(k) ?? pmByProj.set(k, []).get(k)!).push(m);
    }
    const dpByProj = new Map<string, R[]>();
    for (const m of (dps.data as R[]) || []) {
      const k = String(m.project_id);
      (dpByProj.get(k) ?? dpByProj.set(k, []).get(k)!).push(m);
    }
    const jmByJob = new Map<string, R[]>();
    for (const m of jms) {
      const k = String(m.job_id);
      (jmByJob.get(k) ?? jmByJob.set(k, []).get(k)!).push(m);
    }

    const openish = (st: unknown) => !["closed"].includes(String(st || ""));

    const rows = projects.map((p) => {
      const pid = String(p.id);
      // The project's jobs: active jobs pointing at it, plus any active job
      // the ERP lists in job_numbers.
      const set = new Map<string, { id: string; tag: string }>();
      for (const j of jobsByProj.get(pid) || []) set.set(j.id, j);
      for (const n of (Array.isArray(p.job_numbers) ? p.job_numbers : []) as string[]) {
        const j = jobById.get(String(n));
        if (j) set.set(j.id, j);
      }
      const pjobs = [...set.values()].sort((a, b) => a.id.localeCompare(b.id));
      if (!pjobs.length) return null;

      // Next milestone: the MAIN plan's view (Dr Raghu, 28 Aug 2026 — "from
      // the main Project/job") — design's own ladder lives in the lightbox.
      const pm = pmByProj.get(pid) || [];
      const dp = dpByProj.get(pid) || [];
      const designDone = dp.filter((m) => m.done).length;
      let next: { title: string; job: string | null } | null = null;
      let done = 0, total = 0;
      if (pm.length) {
        total = pm.length; done = pm.filter((m) => m.done).length;
        const n = pm.find((m) => !m.done);
        if (n) next = { title: String(n.title || `Milestone ${n.idx}`), job: null };
      } else {
        for (const j of pjobs) {
          const ms = jmByJob.get(j.id) || [];
          total += ms.length; done += ms.filter((m) => m.done).length;
          if (!next) {
            const n = ms.find((m) => !m.done);
            if (n) next = { title: String(n.title || `Milestone ${n.idx}`), job: j.id.slice(-4) };
          }
        }
      }

      const mine = matcher(pjobs);
      const jobSet = new Set(pjobs.map((j) => j.id));
      // Issues to Design (his words, 28 Aug 2026): from the TASKING — every
      // open task on this project's jobs whose category carries design.
      const issues = ([
        ...((mtasks.data as R[]) || []),
        ...((etasks.data as R[]) || []),
      ] as R[])
        .filter((t) => jobSet.has(String(t.job_id || "")))
        .map((t) => ({ id: String(t.id), title: String(t.title || ""), who: String(t.who || ""), due: t.due ? String(t.due).slice(0, 10) : null, esc: String(t.esc || "None"), open: true }));
      // problems-register hits still count against design, quietly appended
      for (const x of (problems.data || []).filter((x2) => mine(x2.job) && openish(x2.status)))
        issues.push({ id: String(x.id), title: String(x.title) + " (problem register)", who: "", due: null, esc: "None", open: true });
      const deliverables = plans.data ? plans.data.filter((x) => mine(x.job)) : [];
      const m = meta.get(pid);

      return {
        id: pid,
        mgr: String(p.mgr || ""),
        erp_stage: String(p.stage || ""),
        exp_end: p.exp_end ?? null,
        description: String(p.description || ""),
        design_stage: String(m?.design_stage || ""),
        bom_pct: m?.bom_pct == null ? null : Number(m.bom_pct),
        manuf_pct: m?.manuf_pct == null ? null : Number(m.manuf_pct),
        sort_order: m?.sort_order == null ? null : Number(m.sort_order),
        design_total: dp.length, design_done: designDone,
        design_owner: String(m?.design_owner || ""),
        support_needed: String(m?.support_needed || ""),
        jobs: pjobs,
        next, done, total,
        issues,
        deliverables,
      };
    }).filter(Boolean);

    const owners = (profiles.data || []).filter((x) => !x.disabled && x.display_name).map((x) => String(x.display_name));
    type GridRow = { id: string; sort_order: number | null };
    (rows as GridRow[]).sort((a, b) =>
      (a.sort_order ?? 1e9) - (b.sort_order ?? 1e9) || a.id.localeCompare(b.id));
    return NextResponse.json({ installed: true, stages: DESIGN_STAGES, owners, rows, week: weekRes.data || [] });
  } catch (e) {
    return errJson(e);
  }
}

/** POST { project_id, patch } saves the grid's three words; POST
 *  { action: "design_plan", project_id, stages: [{title, on_date, done}] }
 *  saves design's ladder — start and completion stay the planning layer's. */
export async function POST(req: Request) {
  try {
    const user = await requireVishwakarma();
    const admin = adminClient();
    const body = await req.json();
    const action = String(body.action || "");

    // THIS WEEK'S WORKING — the design room's own week list.
    if (action === "week_add") {
      const { error } = await admin.from("vishwa_week_work").insert({
        on_date: String(body.on_date || "").slice(0, 10) || new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
        designer: String(body.designer || "").trim(),
        work: String(body.work || "").trim(),
        by: user.email,
      });
      if (error) {
        if (/does not exist|schema cache/i.test(error.message))
          throw new HttpError(503, "Run migration 0089 first — the week list has nowhere to live yet.");
        throw new Error(error.message);
      }
      return NextResponse.json({ ok: true });
    }
    if (action === "week_delete") {
      if (!body.id) throw new HttpError(400, "id required");
      const { error } = await admin.from("vishwa_week_work").delete().eq("id", body.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    const pid = String(body.project_id || "");
    if (!pid) throw new HttpError(400, "project_id required");

    // Manual order only (his rule): the arrows swap neighbours; nothing
    // else reorders this grid.
    if (action === "move") {
      const dir = Number(body.dir) === -1 ? -1 : 1;
      const order: string[] = Array.isArray(body.order) ? body.order.map(String) : [];
      const i = order.indexOf(pid);
      if (i < 0 || i + dir < 0 || i + dir >= order.length) return NextResponse.json({ ok: true });
      [order[i], order[i + dir]] = [order[i + dir], order[i]];
      for (let k = 0; k < order.length; k++) {
        const { error } = await admin.from("vishwa_project")
          .upsert({ project_id: order[k], sort_order: k, by: user.email }, { onConflict: "project_id" });
        if (error) {
          if (/sort_order/.test(error.message))
            throw new HttpError(503, "Run migration 0089 first — the manual order has nowhere to live yet.");
          throw new Error(error.message);
        }
      }
      return NextResponse.json({ ok: true });
    }

    // DESIGN SUPPORT NEEDED becomes a real task (his defaults, 28 Aug 2026):
    // to RJ, escalation L2, due in three days — filed into the main Tasking
    // so it lands where he correlates.
    if (action === "support_task") {
      const title = String(body.title || "").trim();
      if (!title) throw new HttpError(400, "Say what support is needed.");
      const due = String(body.due || "").slice(0, 10)
        || new Date(Date.now() + 3 * 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
      const { error } = await admin.from("manual_tasks").insert({
        job_id: String(body.job_id || "") || null,
        title: `[${pid}] ${title}`,
        detail: String(body.detail || ""),
        who: "RJ",
        due,
        cat: "Design",
        esc: "L2",
        created_by: user.email,
      });
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, due });
    }

    if (action === "design_plan") {
      const stages = (Array.isArray(body.stages) ? body.stages : [])
        .map((x: R, i: number) => ({
          project_id: pid, idx: i,
          title: String(x.title || "").trim(),
          on_date: String(x.on_date || "").slice(0, 10) || null,
          done: !!x.done, by: user.email,
        }))
        .filter((x: { title: string }) => x.title);
      const del = await admin.from("vishwa_design_plan").delete().eq("project_id", pid);
      if (del.error) {
        if (/does not exist|schema cache/i.test(del.error.message))
          throw new HttpError(503, "Run migration 0088 first — the design plan has nowhere to live yet.");
        throw new Error(del.error.message);
      }
      if (stages.length) {
        const ins = await admin.from("vishwa_design_plan").insert(stages);
        if (ins.error) throw new Error(ins.error.message);
      }
      return NextResponse.json({ ok: true });
    }

    const patch: R = {};
    for (const k of ["design_stage", "design_owner", "support_needed"])
      if (body.patch && k in body.patch) patch[k] = String(body.patch[k] ?? "");
    for (const k of ["bom_pct", "manuf_pct"])
      if (body.patch && k in body.patch)
        patch[k] = body.patch[k] === "" || body.patch[k] == null ? null : Math.max(0, Math.min(100, Number(body.patch[k]) || 0));
    if (!Object.keys(patch).length) throw new HttpError(400, "Nothing to save.");
    const { error } = await admin.from("vishwa_project")
      .upsert({ project_id: pid, ...patch, by: user.email, at: new Date().toISOString() }, { onConflict: "project_id" });
    if (error) {
      if (/does not exist|schema cache/i.test(error.message))
        throw new HttpError(503, "Run migration 0085 first — the project grid's table doesn't exist yet.");
      throw new Error(error.message);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errJson(e);
  }
}
