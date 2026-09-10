import { NextResponse } from "next/server";
import { requireReader, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** PostgREST truncates at 1,000 rows and ignores a larger limit. */
const PAGE = 1000;
const MAX = 50000;

/**
 * GET /api/job-labour — what the floor's own manpower entries come to, in
 * rupees, per job.
 *
 * Dr Raghu, 10 Sep 2026: "the WIP is showing zero. Please see the labour
 * rates that are being taken from the system that they are doing on the
 * floor. Whatever labour is there, multiply that by the rates that are put
 * into admin, and put that value here."
 *
 * WIP LABOUR WAS A BOX, AND THE BOX WAS EMPTY. `jobs.wip_labour` is typed by
 * hand and stands at zero on every one of 114 jobs — measured, not assumed.
 * Meanwhile the floor has been recording crew every day since August:
 * `job_manpower` holds 585 days across 44 jobs, and `labour_rate` holds a
 * day rate per trade, set in Admin. The number existed the whole time; it
 * was simply never multiplied out.
 *
 * So this is DERIVED, not typed:
 *
 *     labour = Σ over days  Σ over trades  ( heads × the trade's day rate )
 *
 * A DERIVED FIGURE MUST SAY WHERE IT CAME FROM, so each job comes back with
 * its man-days and the number of days recorded as well as the money — a
 * labour cost with no man-days behind it is a number nobody can check.
 *
 * A TRADE WITH NO RATE CONTRIBUTES NOTHING AND IS NAMED. If somebody records
 * a trade Admin has no rate for, the heads are still counted and the money
 * is not invented; the trade is reported in `unratedTrades` so the gap is
 * visible rather than silently costing zero.
 */
export async function GET() {
  try {
    await requireReader();
    const db = adminClient();

    const { data: rateRows, error: re } = await db.from("labour_rate").select("trade, day_rate");
    if (re) throw new HttpError(500, re.message);
    const rates: Record<string, number> = {};
    for (const r of rateRows || []) rates[String(r.trade)] = Number(r.day_rate) || 0;

    const per: Record<string, { cost: number; mandays: number; days: number }> = {};
    const unrated = new Set<string>();
    let rows = 0;

    for (let off = 0; off < MAX; off += PAGE) {
      const { data, error } = await db.from("job_manpower")
        .select("job_id, day, crew")
        .range(off, off + PAGE - 1);
      if (error) {
        // Before migration 0087 there is no such table. The column shows a
        // dash rather than failing the whole screen.
        if (/job_manpower|labour_rate|does not exist|schema cache/i.test(error.message))
          return NextResponse.json({ installed: false, rates, jobs: {} });
        throw new HttpError(500, error.message);
      }
      for (const r of data || []) {
        const id = String(r.job_id);
        const crew = (r.crew || {}) as Record<string, unknown>;
        const j = (per[id] ||= { cost: 0, mandays: 0, days: 0 });
        let anyone = false;
        for (const [trade, heads] of Object.entries(crew)) {
          const n = Number(heads) || 0;
          if (n <= 0) continue;
          anyone = true;
          j.mandays += n;
          if (rates[trade] === undefined) unrated.add(trade);
          else j.cost += n * rates[trade];
        }
        // A day somebody opened and left empty is not a day worked.
        if (anyone) j.days += 1;
      }
      rows += (data || []).length;
      if (!data || data.length < PAGE) break;
    }

    const total = Object.values(per).reduce((a, x) => a + x.cost, 0);
    const mandays = Object.values(per).reduce((a, x) => a + x.mandays, 0);

    return NextResponse.json({
      installed: true,
      rates,
      unratedTrades: [...unrated],
      entries: rows,
      jobs: per,
      total,
      mandays,
    });
  } catch (e) { return errJson(e); }
}
