/**
 * GET /api/crm/pipeline?from=YYYY-MM-DD&to=YYYY-MM-DD — the Deals screen.
 *
 * Per rung of both ladders: what CAME IN during the range (history rows that
 * entered), what WENT OUT during the range (rows that exited), and what is
 * SITTING there now (rows never exited — as of today, whatever the range).
 * Aggregated here from the two stage histories the triggers write.
 *
 * A static segment beside /api/crm/[doctype] — Next.js prefers it, so
 * "pipeline" never resolves as a doctype.
 */
import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { crmDb, crmConfigured, CrmNotConfigured } from "@/crm/db";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

async function pageAll(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new HttpError(500, error.message);
    const rows = (data ?? []) as Row[];
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

export async function GET(req: Request) {
  try {
    await requireCrm();
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    const db = crmDb();

    const u = new URL(req.url);
    const from = u.searchParams.get("from") ?? "1900-01-01";
    const to = (u.searchParams.get("to") ?? "2999-12-31") + "T23:59:59+05:30";

    const stages = await pageAll((a, b) =>
      db.from("stage").select("id, code, name, colour, sort_order, entity, active").range(a, b));

    const cameIn = new Map<number, number>();
    const wentOut = new Map<number, number>();
    const sitting = new Map<number, number>();
    const bump = (m: Map<number, number>, id: number) => m.set(id, (m.get(id) ?? 0) + 1);

    for (const table of ["opportunity_stage_history", "quotation_stage_history"]) {
      const entered = await pageAll((a, b) =>
        db.from(table).select("stage_id").gte("entered_at", from).lte("entered_at", to).range(a, b));
      for (const r of entered) bump(cameIn, r.stage_id as number);

      const exited = await pageAll((a, b) =>
        db.from(table).select("stage_id").gte("exited_at", from).lte("exited_at", to).range(a, b));
      for (const r of exited) bump(wentOut, r.stage_id as number);

      const open = await pageAll((a, b) =>
        db.from(table).select("stage_id").is("exited_at", null).range(a, b));
      for (const r of open) bump(sitting, r.stage_id as number);
    }

    const flow = stages
      .filter((s) => s.active)
      .sort((a, b) =>
        String(a.entity).localeCompare(String(b.entity)) || Number(a.sort_order) - Number(b.sort_order))
      .map((s) => ({
        entity: s.entity, stage_id: s.id, code: s.code, name: s.name, sort_order: s.sort_order,
        colour: (s.colour as string) ?? null,
        came_in: cameIn.get(s.id as number) ?? 0,
        went_out: wentOut.get(s.id as number) ?? 0,
        sitting: sitting.get(s.id as number) ?? 0,
      }));

    return NextResponse.json({ flow });
  } catch (e) {
    return errJson(e);
  }
}
