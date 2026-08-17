import { NextResponse } from "next/server";
import { requirePlanner, errJson } from "@/lib/auth";
import { assertJobEditable } from "@/lib/job-state";
import { supabaseServer } from "@/lib/supabase/server";
import { today } from "@/lib/schedule";

export const dynamic = "force-dynamic";

// POST /api/baseline — save the current schedule as the baseline. planner/admin.
// Refuses to overwrite an existing baseline unless { force: true } (spec §5).
// Body: { job_id, baseline_end, milestones:[{idx,title,start,end}], force? }
export async function POST(req: Request) {
  try {
    await requirePlanner();
    const supabase = supabaseServer();
    const body = await req.json();
    const jobId: string = body.job_id;
    if (!jobId) return NextResponse.json({ error: "job_id required" }, { status: 400 });
    await assertJobEditable(supabase, jobId);

    const { data: plan } = await supabase
      .from("plans")
      .select("baseline_on")
      .eq("job_id", jobId)
      .maybeSingle();

    if (plan?.baseline_on && !body.force) {
      return NextResponse.json(
        { error: "baseline_exists", baseline_on: plan.baseline_on },
        { status: 409 },
      );
    }

    const rows = (Array.isArray(body.milestones) ? body.milestones : []).map(
      (m: any) => ({
        job_id: jobId,
        idx: Number(m.idx),
        title: m.title ?? m.name ?? "",
        start_date: m.start ?? null,
        end_date: m.end ?? null,
      }),
    );

    const { error: de } = await supabase
      .from("baseline_milestones")
      .delete()
      .eq("job_id", jobId);
    if (de) throw new Error(de.message);
    if (rows.length) {
      const { error: ie } = await supabase.from("baseline_milestones").insert(rows);
      if (ie) throw new Error(ie.message);
    }

    const { error: ue } = await supabase
      .from("plans")
      .upsert(
        { job_id: jobId, baseline_on: today(), baseline_end: body.baseline_end ?? null },
        { onConflict: "job_id" },
      );
    if (ue) throw new Error(ue.message);

    return NextResponse.json({ ok: true, baseline_on: today() });
  } catch (e) {
    return errJson(e);
  }
}
