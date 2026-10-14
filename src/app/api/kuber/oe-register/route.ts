import { NextResponse } from "next/server";
import { errJson } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { requireKuber } from "@/lib/accounts";
import { OE_HEADS, OE_RULES } from "@/lib/kuber-rules";
import { oeAndSales } from "@/lib/kuber-oe";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/kuber/oe-register?from=&to= — THE OE REGISTER (Dr Raghu, 13 Oct
 * 2026: "make an OE Register. This will help to know the OE").
 *
 * Every voucher line that the P&L counts as operating expense — a ledger the
 * one ladder (kuber-rules.ts) puts under Indirect or Finance — line by line,
 * with the voucher, the party, the narration, the ledger, its group and the
 * OE head it lands in. Struck by the same rules and the same sign as the P&L,
 * so the register adds back to the P&L's OE for the same dates to the paisa;
 * the sales over the same dates give OE as a share of sales.
 */
const istDay = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

export async function GET(req: Request) {
  try {
    await requireKuber();
    const admin = adminClient();
    const sp = new URL(req.url).searchParams;
    const today = istDay();
    const fy = today.slice(5, 7) >= "04" ? `${today.slice(0, 4)}-04-01` : `${Number(today.slice(0, 4)) - 1}-04-01`;
    const isD = (v: string | null) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
    const from = isD(sp.get("from")) ? String(sp.get("from")) : fy;
    const to = isD(sp.get("to")) ? String(sp.get("to")) : today;

    let got: Awaited<ReturnType<typeof oeAndSales>>;
    try { got = await oeAndSales(admin, from, to); }
    catch (e) { if (/does not exist|schema cache/i.test(String((e as Error).message))) return NextResponse.json({ empty: true }); throw e; }
    if (got.empty) return NextResponse.json({ empty: true });
    const rows = got.rows.sort((a, b) => b.date.localeCompare(a.date) || b.amount - a.amount);
    const sales = got.sales;
    /* head × month, the latest month first */
    const months = [...new Set(rows.map((r) => r.date.slice(0, 7)))].sort().reverse();
    const byHead: Record<string, Record<string, number>> = {};
    for (const h of OE_HEADS) byHead[h] = {};
    for (const r of rows) { const m = r.date.slice(0, 7); byHead[r.head][m] = (byHead[r.head][m] || 0) + r.amount; }
    const salesByMonth = got.salesByMonth;
    const total = rows.reduce((s, r) => s + r.amount, 0);
    return NextResponse.json({
      from, to, total: Math.round(total), sales: Math.round(sales), heads: OE_HEADS, months, byHead, salesByMonth,
      says: Object.fromEntries(OE_RULES.map((r) => [r.head, r.says])), rows,
    });
  } catch (e) { return errJson(e); }
}
