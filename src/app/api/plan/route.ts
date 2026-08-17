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
