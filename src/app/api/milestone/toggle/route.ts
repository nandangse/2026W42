import { NextResponse } from "next/server";
import { requirePlanner, errJson } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { today } from "@/lib/schedule";

export const dynamic = "force-dynamic";

// POST /api/milestone/toggle — tick / untick a milestone. planner/admin.
// Body: { job_id, idx, done }  (done_on stamped to today when ticking)
export async function POST(req: Request) {
  try {
    await requirePlanner();
    const supabase = supabaseServer();
    const { job_id, idx, done } = await req.json();
    if (!job_id || idx == null)
      return NextResponse.json({ error: "job_id and idx required" }, { status: 400 });

    const { error } = await supabase
      .from("milestones")
      .update({ done: !!done, done_on: done ? today() : null })
      .eq("job_id", job_id)
      .eq("idx", idx);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errJson(e);
  }
}
