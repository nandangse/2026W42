/**
 * GET /api/crm/pipeline — the Deals screen's numbers.
 *
 * v_pipeline_flow reads both stage histories: per rung, what came in, what
 * went out, and what is sitting there now. The stage's colour rides along so
 * the screen speaks the same palette as the boards.
 *
 * A static segment beside /api/crm/[doctype] — Next.js prefers it, so
 * "pipeline" never resolves as a doctype.
 */
import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { crmDb, crmConfigured, CrmNotConfigured } from "@/crm/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireCrm();
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    const db = crmDb();

    const { data: flow, error } = await db.from("v_pipeline_flow").select("*");
    if (error) throw new HttpError(500, error.message);

    const { data: stages } = await db.from("stage").select("id, colour");
    const colour = new Map((stages ?? []).map((s) => [s.id, s.colour as string | null]));

    return NextResponse.json({
      flow: (flow ?? []).map((r) => ({ ...r, colour: colour.get(r.stage_id) ?? null })),
    });
  } catch (e) {
    return errJson(e);
  }
}
