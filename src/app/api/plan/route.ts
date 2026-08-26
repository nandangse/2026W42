import { NextResponse } from "next/server";
import { requirePlanner, errJson } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { assertJobEditable } from "@/lib/job-state";

export const dynamic = "force-dynamic";

// POST /api/plan — upsert a plan + its milestones. planner/admin.
// The milestones array fully replaces the job's milestone set; done flags &
// dates are carried in the payload so editing crew/days never wipes ✓s.
export async function POST(req: Request) {
  try {
    await requirePlanner();
    const supabase = supabaseServer();
    const body = await req.json();
    const jobId: string = body.job_id;
    if (!jobId) return NextResponse.json({ error: "job_id required" }, { status: 400 });

    // A PROJECT plans for itself on the very same payload (0074): planning is
    // moving up to project level (Dr Raghu, 26 Aug 2026), so the shapes stay
    // identical — twin tables only because plans.job_id is FK'd to jobs.
    if (jobId.startsWith("NGSE-PROJ-")) {
      const { error: ppe } = await supabase.from("project_plans").upsert(
        {
          project_id: jobId,
          start_date: body.start || null,
          baseline_on: body.baseline_on ?? null,
          baseline_end: body.baseline_end ?? null,
        },
        { onConflict: "project_id" },
      );
      if (ppe) {
        throw new Error(/project_plans/.test(ppe.message)
          ? "The project planning tables are missing — run migration 0074 first."
          : ppe.message);
      }
      const pms = (Array.isArray(body.milestones) ? body.milestones : []).map((m: any, i: number) => ({
        project_id: jobId,
        idx: i,
        title: m.name ?? m.title ?? "",
        days: Number(m.days) || 1,
        preds: Array.isArray(m.preds) ? m.preds : [],
        crew: m.crew || {},
        shift: m.shift || "D",
        offset_days: Number(m.offset) || 0,
        done: !!m.done,
        done_on: m.done_on ?? null,
      }));
      const { error: pde } = await supabase.from("project_milestones").delete().eq("project_id", jobId);
      if (pde) throw new Error(pde.message);
      if (pms.length) {
        const { error: pie } = await supabase.from("project_milestones").insert(pms);
        if (pie) throw new Error(pie.message);
      }
      return NextResponse.json({ ok: true });
    }

    // a delivered job's plan is a record, not a plan (see lib/job-state)
    await assertJobEditable(supabase, jobId);

    const { error: pe } = await supabase.from("plans").upsert(
      {
        job_id: jobId,
        start_date: body.start || null,
        baseline_on: body.baseline_on ?? null,
        baseline_end: body.baseline_end ?? null,
      },
      { onConflict: "job_id" },
    );
    if (pe) throw new Error(pe.message);

    const milestones = Array.isArray(body.milestones) ? body.milestones : [];
    const rows = milestones.map((m: any, i: number) => ({
      job_id: jobId,
      idx: i,
      title: m.name ?? m.title ?? "",
      days: Number(m.days) || 1,
      preds: Array.isArray(m.preds) ? m.preds : [],
      crew: m.crew || {},
      shift: m.shift || "D",
      offset_days: Number(m.offset) || 0,
      done: !!m.done,
      done_on: m.done_on ?? null,
    }));

    // replace the milestone set for this job (delete then insert)
    const { error: de } = await supabase.from("milestones").delete().eq("job_id", jobId);
    if (de) throw new Error(de.message);
    if (rows.length) {
      const { error: ie } = await supabase.from("milestones").insert(rows);
      if (ie) throw new Error(ie.message);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errJson(e);
  }
}
