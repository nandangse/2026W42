/**
 * GET /api/crm/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Opportunities → Quotations → Sales Orders inside the date range, as one
 * lane per sector plus the whole business. A quotation takes its sector from
 * its opportunity; a sales order carries its own and falls back the same way.
 * Counting is by date of birth — opportunity created, quote created, order
 * ordered — inside the range.
 */
import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { crmDb, crmConfigured, CrmNotConfigured } from "@/crm/db";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

/** supabase caps a select at 1000 rows; walk the pages. */
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

    const sectors = await pageAll((a, b) =>
      db.from("sector").select("id, code, name, sort_order").order("sort_order").range(a, b));
    const stages = await pageAll((a, b) =>
      db.from("stage").select("id, name, colour, sort_order, entity").range(a, b));

    // Sector resolution needs every opportunity, not only the in-range ones —
    // a quote made today may answer an enquiry from last year.
    const allOpps = await pageAll((a, b) =>
      db.from("opportunity").select("id, sector_id").range(a, b));
    const oppSector = new Map(allOpps.map((o) => [String(o.id), o.sector_id as number | null]));

    const opps = await pageAll((a, b) =>
      db.from("opportunity").select("id, sector_id")
        .gte("created_at", from).lte("created_at", to).range(a, b));
    const quotes = await pageAll((a, b) =>
      db.from("quotation").select("id, stage_id, opportunity_id")
        .gte("created_at", from).lte("created_at", to).range(a, b));
    const sos = await pageAll((a, b) =>
      db.from("sales_order").select("id, sector_id, opportunity_id")
        .gte("ordered_on", from.slice(0, 10)).lte("ordered_on", to.slice(0, 10)).range(a, b));

    type LaneAcc = { opps: number; quotes: number; sos: number; stageCounts: Map<number, number> };
    const mk = (): LaneAcc => ({ opps: 0, quotes: 0, sos: 0, stageCounts: new Map() });
    const bySector = new Map<number | null, LaneAcc>();
    const all = mk();
    const lane = (sid: number | null) => {
      if (!bySector.has(sid)) bySector.set(sid, mk());
      return bySector.get(sid) as LaneAcc;
    };

    for (const o of opps) {
      lane((o.sector_id as number | null) ?? null).opps++; all.opps++;
    }
    for (const q of quotes) {
      const sid = oppSector.get(String(q.opportunity_id)) ?? null;
      const l = lane(sid);
      l.quotes++; all.quotes++;
      const st = q.stage_id as number | null;
      if (st !== null) {
        l.stageCounts.set(st, (l.stageCounts.get(st) ?? 0) + 1);
        all.stageCounts.set(st, (all.stageCounts.get(st) ?? 0) + 1);
      }
    }
    for (const s of sos) {
      const sid = (s.sector_id as number | null) ?? oppSector.get(String(s.opportunity_id)) ?? null;
      lane(sid).sos++; all.sos++;
    }

    const qStages = stages
      .filter((s) => s.entity === "quotation")
      .sort((a, b) => Number(a.sort_order) - Number(b.sort_order));
    const breakdown = (acc: LaneAcc) =>
      qStages
        .map((s) => ({ name: String(s.name), colour: (s.colour as string) ?? null, count: acc.stageCounts.get(s.id as number) ?? 0 }))
        .filter((s) => s.count > 0);

    const lanes = [
      ...sectors.map((s) => {
        const acc = bySector.get(s.id as number) ?? mk();
        return { key: String(s.code), name: String(s.name), opps: acc.opps, quotes: acc.quotes, sos: acc.sos, quoteStages: breakdown(acc) };
      }),
      ...(bySector.has(null)
        ? [{ key: "none", name: "No sector", ...(() => { const a = bySector.get(null) as LaneAcc; return { opps: a.opps, quotes: a.quotes, sos: a.sos, quoteStages: breakdown(a) }; })() }]
        : []),
    ];

    return NextResponse.json({
      lanes,
      all: { key: "all", name: "All sectors", opps: all.opps, quotes: all.quotes, sos: all.sos, quoteStages: breakdown(all) },
    });
  } catch (e) {
    return errJson(e);
  }
}
