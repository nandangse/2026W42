import { NextResponse } from "next/server";
import { errJson } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { crmDb, crmConfigured } from "@/crm/db";
import { requireCeo } from "@/lib/ceo/auth";
import { oeAndSales } from "@/lib/kuber-oe";
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

    const [books, owed, orders, floor, service, people] = await Promise.all([
      /* THE BOOKS — sales and OE by the P&L's own rules */
      part("books", async () => {
        const g = await oeAndSales(admin, from, to);
        if (g.empty) return { empty: true };
        const byHead: Record<string, number> = {}; for (const h of OE_HEADS) byHead[h] = 0;
        for (const r of g.rows) byHead[r.head] = (byHead[r.head] || 0) + r.amount;
        const oe = g.rows.reduce((s, r) => s + r.amount, 0);
        const months = [...new Set([...Object.keys(g.salesByMonth), ...g.rows.map((r) => r.date.slice(0, 7))])].sort().reverse();
        const oeByMonth: Record<string, number> = {}; for (const r of g.rows) { const m = r.date.slice(0, 7); oeByMonth[m] = (oeByMonth[m] || 0) + r.amount; }
        return { sales: Math.round(g.sales), oe: Math.round(oe), byHead, months, salesByMonth: g.salesByMonth, oeByMonth, books_to: g.latest };
      }),
      /* WHAT IS OWED — Tally's open bills: receivables positive, payables negative */
      part("owed", async () => {
        const bills = await all((a, b) => admin.from("kuber_bill").select("kind, amount, bill_date, due_date").order("id").range(a, b));
        const rec = bills.filter((b) => b.kind === "receivable" && N(b.amount) > 0);
        const pay = bills.filter((b) => b.kind === "payable" && N(b.amount) < 0);
        const old = addDays(today, -180);
        return {
          receivable: Math.round(rec.reduce((s, b) => s + N(b.amount), 0)),
          receivable_overdue: Math.round(rec.filter((b) => S(b.due_date) && S(b.due_date) < today).reduce((s, b) => s + N(b.amount), 0)),
          receivable_180: Math.round(rec.filter((b) => S(b.bill_date) && S(b.bill_date) < old).reduce((s, b) => s + N(b.amount), 0)),
          advances: Math.round(-bills.filter((b) => b.kind === "receivable" && N(b.amount) < 0).reduce((s, b) => s + N(b.amount), 0)),
          payable: Math.round(-pay.reduce((s, b) => s + N(b.amount), 0)),
          payable_180: Math.round(-pay.filter((b) => S(b.bill_date) && S(b.bill_date) < old).reduce((s, b) => s + N(b.amount), 0)),
        };
      }),
      /* THE ORDER BOOK — the CRM's sales orders and live quotations */
      part("orders", async () => {
        if (!crmConfigured()) return { error: "The CRM database is not connected." };
        const crm = crmDb();
        const so = await all((a, b) => crm.from("sales_order").select("amount, ordered_on, erp_status").gte("ordered_on", from).lte("ordered_on", to).order("id").range(a, b));
        const live = so.filter((s) => !/cancel/i.test(S(s.erp_status)));
        const q = await all((a, b) => crm.from("quotation").select("grand_total, status").in("status", ["live", "hotlist", "submitted"]).order("id").range(a, b));
        return { orders: live.length, order_value: Math.round(live.reduce((s, x) => s + N(x.amount), 0)), quotes_live: q.length, quote_value: Math.round(q.reduce((s, x) => s + N(x.grand_total), 0)) };
      }),
      /* THE FLOOR — live jobs and what was delivered in the window */
      part("floor", async () => {
        const [{ data: jobs }, dj] = await Promise.all([
          admin.from("jobs").select("id, val, tdd").eq("delivered", false).eq("active", true),
          all((a, b) => admin.from("delivered_jobs").select("val, delivered_on").gte("delivered_on", from).lte("delivered_on", to).order("id").range(a, b)),
        ]);
        const j = jobs || [];
        return { live: j.length, live_value: Math.round(j.reduce((s, x) => s + N(x.val), 0)), late: j.filter((x) => S(x.tdd) && S(x.tdd) < today).length, delivered: dj.length, delivered_value: Math.round(dj.reduce((s, x) => s + N(x.val), 0)) };
      }),
      /* SERVICE — open tickets and the AMC book */
      part("service", async () => {
        const [{ count: open }, { data: amc }] = await Promise.all([
          admin.from("seva_issue").select("*", { count: "exact", head: true }).not("status", "ilike", "%closed%").not("status", "ilike", "%resolved%"),
          admin.from("seva_amc").select("value").eq("status", "AMC valid paid"),
        ]);
        return { open_tickets: open || 0, amc_valid: (amc || []).length, amc_value: Math.round((amc || []).reduce((s, x) => s + N(x.value), 0)) };
      }),
      /* PEOPLE — the active roll */
      part("people", async () => {
        const { data } = await admin.from("hrms_employees").select("department, active").eq("active", true);
        const by: Record<string, number> = {}; for (const e of data || []) by[S(e.department) || "—"] = (by[S(e.department) || "—"] || 0) + 1;
        return { headcount: (data || []).length, by_department: by };
      }),
    ]);
    return NextResponse.json({ from, to, today, me: me.email, books, owed, orders, floor, service, people });
  } catch (e) { return errJson(e); }
}
