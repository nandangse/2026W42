import { NextResponse } from "next/server";
import { errJson, HttpError, requireUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { erpIssuedByJob } from "@/lib/wip-kitting";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/job-kit-actual?job=2026272611 — the job's ACTUAL kitting %, as
 * Saamaan sees it (Dr Raghu, 6 Oct 2026: "Next to that, in the bracket,
 * show the actual kitting percentage that is seen in Saamaan for this
 * particular job against that particular WIP warehouse").
 *
 *   actual % = what the store has physically issued to the job (the ERP's
 *              completed transfers carrying its job number) ÷ the job's
 *              material value, value × (1 − throughput %) — the same base
 *              the typed kitting % stands on, so the two read side by side.
 *
 * Display only. The typed figure is still the one the board uses.
 */
export async function GET(req: Request) {
  try {
    await requireUser();
    const id = String(new URL(req.url).searchParams.get("job") || "").trim();
    if (!id) throw new HttpError(400, "Which job?");
    const admin = adminClient();
    const { data: j } = await admin.from("jobs").select("id, val, tpp, kit").eq("id", id).maybeSingle();
    if (!j) throw new HttpError(404, "No such job.");
    const material = (Number(j.val) || 0) * (1 - (Number(j.tpp) || 0) / 100);
    const { byJob, read } = await erpIssuedByJob(admin, [id]);
    const issued = byJob.get(id) ?? 0;
    return NextResponse.json({ ok: true, read, issued, material, pct: read && material > 0 ? (issued / material) * 100 : null });
  } catch (e) {
    return errJson(e);
  }
}
