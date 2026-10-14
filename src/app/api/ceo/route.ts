import { NextResponse } from "next/server";
import { errJson } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { crmDb, crmConfigured } from "@/crm/db";
import { requireCeo } from "@/lib/ceo/auth";
import { oeAndSales, pnlOf } from "@/lib/kuber-oe";
import { ceoFigures, keepSnapshot, weekAgo, DIRECTION } from "@/lib/ceo/figures";
import { OE_HEADS } from "@/lib/kuber-rules";
import { swallow } from "@/lib/swallow";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/ceo[?from&to] — THE CEO COCKPIT (14 Oct 2026). The company on one
 * page, every figure read live from the module that owns it and none typed
 * here: the books (Kuber — sales, OE by head and its share of sales, what is
 * owed both ways), the order book and the open quotations (CRM), the jobs on
 * the floor and delivered (planning), service (Seva) and the people (HRMS).
 * Each part stands alone: one that cannot be read says so and the rest still show.
 */
type R = Record<string, unknown>;
const S = (v: unknown) => String(v ?? "").trim();
const N = (v: unknown) => Number(v) || 0;
const istDay = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const addDays = (d: string, n: number) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

async function all(q: (a: number, b: number) => PromiseLike<{ data: R[] | null; error: { message: string } | null }>): Promise<R[]> {
  const out: R[] = [];
  for (let a = 0; a < 200000; a += 1000) { const { data, error } = await q(a, a + 999); if (error) throw new Error(error.message); out.push(...(data || [])); if (!data || data.length < 1000) break; }
  return out;
}
async function part<T>(name: string, f: () => Promise<T>): Promise<T | { error: string }> {
  try { return await f(); } catch (e) { swallow(`ceo/${name}`, e); return { error: String((e as Error).message).slice(0, 160) }; }
}

export async function GET(req: Request) {
  try {
    const me = await requireCeo();
    const admin = adminClient();
    const sp = new URL(req.url).searchParams;
    const today = istDay();
    const fy = today.slice(5, 7) >= "04" ? `${today.slice(0, 4)}-04-01` : `${Number(today.slice(0, 4)) - 1}-04-01`;
    const isD = (v: string | null) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
    const from = isD(sp.get("from")) ? String(sp.get("from")) : fy;
    const to = isD(sp.get("to")) ? String(sp.get("to")) : today;

    /* THE ROLLING YEAR (Dr Raghu, 14 Oct 2026: "show a graph of the last 12 months rolling always — Sales, Purchase, OE, Salaries … Total, Average/month,
       Mean, Median, Min, Max — 12 months, 6 months, 3 months, YTD … October number show * incomplete"). Always the last twelve COMPLETE months and
       this month to date, whatever dates are picked above; the windows are struck on complete months, YTD runs to date. */
    const thisMonth = today.slice(0, 7);
    const back12 = (() => { const x = new Date(thisMonth + "-01T00:00:00Z"); x.setUTCMonth(x.getUTCMonth() - 12); return x.toISOString().slice(0, 10); })();
    const isYtd = from === fy && to === today;
    const [figs, trend] = await Promise.all([
      ceoFigures(admin, from, to),
      part("trend", async () => {
        const g = await oeAndSales(admin, back12, today);
        if (g.empty) return { empty: true };
        const months: string[] = []; for (let x = new Date(back12 + "T00:00:00Z"); x.toISOString().slice(0, 7) <= thisMonth; x.setUTCMonth(x.getUTCMonth() + 1)) months.push(x.toISOString().slice(0, 7));
        const oeBy: Record<string, number> = {}; for (const r of g.rows) { const m = r.date.slice(0, 7); oeBy[m] = (oeBy[m] || 0) + r.amount; }
        const series = { sales: g.salesByMonth, purchase: g.purchasesByMonth, oe: oeBy, salaries: g.salariesByMonth };
        const round = (o: Record<string, number>) => Object.fromEntries(months.map((m) => [m, Math.round(o[m] || 0)]));
        return { months, current: thisMonth, books_to: g.latest, fy_start: fy.slice(0, 7), series: { sales: round(series.sales), purchase: round(series.purchase), oe: round(series.oe), salaries: round(series.salaries) } };
      }),
    ]);
    /* THE WEEK BEFORE (Dr Raghu, 14 Oct 2026: "show triangles in each box with respect to last week"). Only on the financial year to date — the
       window the snapshots are kept for. Today's figures are kept; a week back is read; if none is there yet, the books are struck for that day so
       their triangles show from the first day, and the rest begin a week later. */
    let prev: { day: string | null; values: Record<string, number> } = { day: null, values: {} };
    if (isYtd) {
      try {
        await keepSnapshot(admin, figs.snap);
        prev = await weekAgo(admin);
        if (!prev.day) {
          const back = (() => { const x = new Date(today + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() - 7); return x.toISOString().slice(0, 10); })();
          const p = await pnlOf(admin, fy, back);
          if (p && p.sales) {
            const pc = (v: number) => Math.round((v / p.sales) * 10000) / 100;
            const vals: Record<string, number> = { sales: Math.round(p.sales), tvc: Math.round(p.tvc), throughput: Math.round(p.throughput), oe: Math.round(p.oe), pbt: Math.round(p.pbt), tvc_pct: pc(p.tvc), throughput_pct: pc(p.throughput), oe_pct: pc(p.oe), pbt_pct: pc(p.pbt) };
            await admin.from("ceo_snapshot").upsert(Object.entries(vals).map(([key, value]) => ({ day: back, key, value })), { onConflict: "day,key" });
            prev = { day: back, values: vals };
          }
        }
      } catch (e) { swallow("ceo/snapshot", e); /* before 0231 — no triangles yet */ }
    }
    return NextResponse.json({ from, to, today, me: me.email, ...figs, trend, prev, direction: DIRECTION, isYtd });
  } catch (e) { return errJson(e); }
}
