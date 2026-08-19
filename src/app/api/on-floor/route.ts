import { NextResponse } from "next/server";
import { requireStratcom, errJson } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/on-floor — { job_id, on } — is this job being worked on now?
 *
 * NOT part of /api/job-field, on purpose. Everything that route touches is a
 * correction to a value the ERP owns, and it queues each one for export. This
 * is a Genie fact the ERP has no field for and never will, so pushing it would
 * put a line in Pankaj's export that nothing can receive.
 *
 * Stratcom only. It is a claim about capacity, and a board where anybody can
 * mark anything as being worked on stops meaning anything by the second week.
 */
export async function POST(req: Request) {
  try {
    const user = await requireStratcom();
    const body = await req.json();
    const jobId = String(body.job_id || "");
    if (!jobId) return NextResponse.json({ error: "job_id required" }, { status: 400 });
    const on = !!body.on;

    const { error } = await adminClient()
      .from("jobs")
      .update({
        on_floor: on,
        // When it went on the floor, not just that it did -- a job that has
        // been "on the floor" since March is the thing worth noticing.
        on_floor_at: new Date().toISOString(),
        on_floor_by: user.email,
      })
      .eq("id", jobId);

    if (error) {
      if (/on_floor|column|schema cache/i.test(error.message))
        return NextResponse.json(
          { error: "Run migration 0037 first — On Floor has nowhere to save yet." },
          { status: 503 },
        );
      throw new Error(error.message);
    }
    return NextResponse.json({ ok: true, on });
  } catch (e) {
    return errJson(e);
  }
}
