import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { requireSaamaan } from "@/lib/saamaan";
import { erpAuth } from "@/lib/saamaan-stock";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/saamaan/pulse — HOW THE STORE AND PURCHASE ARE MOVING, at a
 * glance (Dr Raghu, 6 Oct 2026: "the number of GRNs done today, in the last
 * 7 days, and in the last 15 days … value … quantity … physical inventory
 * or physical reconciliation done numbers today … purchase orders open …
 * GRNs received but invoice is not received … purchase orders overdue for
 * more than 2 months … invoices not received for GRNs more than 7 days").
 *
 * Read live off the ERP, the ERP's own fields only:
 *   GRN          a submitted Purchase Receipt, returns left out; value is
 *                the net total (before tax), quantity its total quantity.
 *   no invoice   a GRN whose status is To Bill or Partly Billed; what is
 *                pending is its value and quantity × (1 − % billed).
 *   open PO      a submitted Purchase Order still short of 100% received;
 *                what is pending is its value × (1 − % received).
 *   overdue      an open PO whose required-by date has passed; beyond two
 *                months is shown on its own.
 * Counts are Genie's: count lines filled in, by day and by person.
 */
type Doc = Record<string, unknown>;
const S = (v: unknown) => (v === null || v === undefined ? "" : String(v)).trim();
const N = (v: unknown) => Number(v) || 0;
const J = (x: unknown) => encodeURIComponent(JSON.stringify(x));
const istDay = (d = new Date()) => new Date(d.getTime() + 330 * 60000).toISOString().slice(0, 10);
const minus = (day: string, n: number) => new Date(new Date(`${day}T00:00:00Z`).getTime() - n * 86400000).toISOString().slice(0, 10);

async function all(base: string, H: Record<string, string>, doctype: string, fields: string[], filters: unknown[]): Promise<Doc[]> {
  const out: Doc[] = [];
  for (let start = 0; start < 200000; start += 5000) {
    const r = await fetch(`${base}/api/resource/${encodeURIComponent(doctype)}?fields=${J(fields)}&filters=${J(filters)}&limit_start=${start}&limit_page_length=5000`, { headers: H, signal: AbortSignal.timeout(45000) });
    if (!r.ok) throw new HttpError(502, `The ERP answered ${r.status} reading ${doctype}.`);
    const page = ((await r.json()) as { data?: Doc[] }).data ?? [];
    out.push(...page);
    if (page.length < 5000) break;
  }
  return out;
}

/* ?list= — the documents behind one tile, for the quick-view lightbox */
const LISTS = ["po_open", "po_overdue", "po_overdue60", "grn_noinv", "grn_noinv7", "grn_today", "grn_7", "grn_15"] as const;
type ListKey = (typeof LISTS)[number];
const days = (from: string, to: string) => Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000);

async function listOf(base: string, H: Record<string, string>, key: ListKey, today: string): Promise<Doc[]> {
  const d7 = minus(today, 6), d15 = minus(today, 14), d60 = minus(today, 60), b7 = minus(today, 7);
  if (key.startsWith("po_")) {
    const rows = await all(base, H, "Purchase Order", ["name", "supplier", "transaction_date", "schedule_date", "base_net_total", "per_received", "per_billed", "status", "total_qty"],
      [["docstatus", "=", 1], ["status", "in", ["To Receive and Bill", "To Receive"]], ["per_received", "<", 100]]);
    return rows
      .filter((r) => key === "po_open" || (S(r.schedule_date) && S(r.schedule_date) < (key === "po_overdue60" ? d60 : today)))
      .map((r) => ({
        doc: S(r.name), doctype: "Purchase Order", supplier: S(r.supplier), date: S(r.transaction_date), due: S(r.schedule_date),
        late: S(r.schedule_date) && S(r.schedule_date) < today ? days(S(r.schedule_date), today) : 0,
        value: N(r.base_net_total), pending: N(r.base_net_total) * (1 - Math.min(100, N(r.per_received)) / 100), received_pct: N(r.per_received), billed_pct: N(r.per_billed), qty: N(r.total_qty), status: S(r.status),
      }));
  }
  if (key === "grn_noinv" || key === "grn_noinv7") {
    const rows = await all(base, H, "Purchase Receipt", ["name", "supplier", "posting_date", "base_net_total", "total_qty", "per_billed", "status"],
      [["docstatus", "=", 1], ["is_return", "=", 0], ["status", "in", ["To Bill", "Partly Billed"]]]);
    return rows.filter((r) => key === "grn_noinv" || S(r.posting_date) < b7).map((r) => {
      const left = 1 - Math.min(100, N(r.per_billed)) / 100;
      return { doc: S(r.name), doctype: "Purchase Receipt", supplier: S(r.supplier), date: S(r.posting_date), age: days(S(r.posting_date), today), value: N(r.base_net_total), pending: N(r.base_net_total) * left, qty: N(r.total_qty), qty_pending: N(r.total_qty) * left, billed_pct: N(r.per_billed), status: S(r.status) };
    });
  }
  const from = key === "grn_today" ? today : key === "grn_7" ? d7 : d15;
  const rows = await all(base, H, "Purchase Receipt", ["name", "supplier", "posting_date", "base_net_total", "total_qty", "per_billed", "status"],
    [["docstatus", "=", 1], ["is_return", "=", 0], ["posting_date", ">=", from]]);
  return rows.map((r) => ({ doc: S(r.name), doctype: "Purchase Receipt", supplier: S(r.supplier), date: S(r.posting_date), age: days(S(r.posting_date), today), value: N(r.base_net_total), pending: 0, qty: N(r.total_qty), qty_pending: 0, billed_pct: N(r.per_billed), status: S(r.status) }));
}

export async function GET(req: Request) {
  try {
    await requireSaamaan();
    const auth = await erpAuth();
    if (!auth) throw new HttpError(503, "The ERP is not connected — CRM → Integrations holds its URL and key.");
    const { base, H } = auth;
    const today = istDay(), d7 = minus(today, 6), d15 = minus(today, 14), d60 = minus(today, 60), b7 = minus(today, 7);
    const list = new URL(req.url).searchParams.get("list") as ListKey | null;
    if (list) {
      if (!LISTS.includes(list)) throw new HttpError(400, "Which list?");
      return NextResponse.json({ ok: true, erpBase: base, today, rows: await listOf(base, H, list, today) });
    }

    const [recent, unbilled, openPo] = await Promise.all([
      all(base, H, "Purchase Receipt", ["posting_date", "total_qty", "base_net_total"], [["docstatus", "=", 1], ["is_return", "=", 0], ["posting_date", ">=", d15]]),
      all(base, H, "Purchase Receipt", ["posting_date", "total_qty", "base_net_total", "per_billed"], [["docstatus", "=", 1], ["is_return", "=", 0], ["status", "in", ["To Bill", "Partly Billed"]]]),
      all(base, H, "Purchase Order", ["schedule_date", "base_net_total", "per_received"], [["docstatus", "=", 1], ["status", "in", ["To Receive and Bill", "To Receive"]], ["per_received", "<", 100]]),
    ]);

    /* GRNs — one bar per day for fifteen days, and the three windows */
    const days: { day: string; n: number; qty: number; value: number }[] = [];
    for (let i = 14; i >= 0; i--) days.push({ day: minus(today, i), n: 0, qty: 0, value: 0 });
    const at = new Map(days.map((d) => [d.day, d]));
    for (const r of recent) { const d = at.get(S(r.posting_date)); if (d) { d.n++; d.qty += N(r.total_qty); d.value += N(r.base_net_total); } }
    const win = (from: string) => days.filter((d) => d.day >= from).reduce((a, d) => ({ n: a.n + d.n, qty: a.qty + d.qty, value: a.value + d.value }), { n: 0, qty: 0, value: 0 });

    /* GRN in, invoice not — all of them, and those older than seven days */
    const pend = (rows: Doc[]) => rows.reduce<{ n: number; qty: number; value: number }>((a, r) => { const left = 1 - Math.min(100, N(r.per_billed)) / 100; return { n: a.n + 1, qty: a.qty + N(r.total_qty) * left, value: a.value + N(r.base_net_total) * left }; }, { n: 0, qty: 0, value: 0 });
    const noInvoice = pend(unbilled), noInvoice7 = pend(unbilled.filter((r) => S(r.posting_date) < b7));

    /* open POs — all, overdue, and overdue more than two months */
    const po = (rows: Doc[]) => rows.reduce<{ n: number; value: number }>((a, r) => ({ n: a.n + 1, value: a.value + N(r.base_net_total) * (1 - Math.min(100, N(r.per_received)) / 100) }), { n: 0, value: 0 });
    const poOpen = po(openPo), poOverdue = po(openPo.filter((r) => S(r.schedule_date) && S(r.schedule_date) < today)), poOverdue60 = po(openPo.filter((r) => S(r.schedule_date) && S(r.schedule_date) < d60));

    /* physical counts — Genie's own: lines counted, per day and per person */
    const admin = adminClient();
    const counts = { today: { lines: 0, items: 0, sheets: 0 }, d7: { lines: 0, items: 0, sheets: 0 }, d15: { lines: 0, items: 0, sheets: 0 }, byPerson: [] as { who: string; lines: number }[], days: days.map((d) => ({ day: d.day, lines: 0 })) };
    try {
      const since = new Date(new Date(`${d15}T00:00:00+05:30`).getTime()).toISOString();
      const rows: Doc[] = [];
      for (let a = 0; ; a += 1000) {
        const { data, error } = await admin.from("material_count_line").select("count_id, item_code, counted_by, counted_at").not("physical_qty", "is", null).gte("counted_at", since).order("counted_at").range(a, a + 999);
        if (error) throw error;
        rows.push(...((data ?? []) as Doc[]));
        if (!data || data.length < 1000) break;
      }
      const cday = new Map(counts.days.map((d) => [d.day, d]));
      const sets = { today: [new Set<string>(), new Set<string>()], d7: [new Set<string>(), new Set<string>()], d15: [new Set<string>(), new Set<string>()] };
      const who = new Map<string, number>();
      for (const r of rows) {
        const day = istDay(new Date(S(r.counted_at)));
        const c = cday.get(day); if (c) c.lines++;
        for (const [k, from] of [["today", today], ["d7", d7], ["d15", d15]] as const) {
          if (day < from) continue;
          counts[k].lines++; sets[k][0].add(S(r.item_code)); sets[k][1].add(S(r.count_id));
        }
        if (day === today) { const w = S(r.counted_by).split("@")[0] || "?"; who.set(w, (who.get(w) ?? 0) + 1); }
      }
      for (const k of ["today", "d7", "d15"] as const) { counts[k].items = sets[k][0].size; counts[k].sheets = sets[k][1].size; }
      counts.byPerson = [...who.entries()].map(([w, lines]) => ({ who: w, lines })).sort((a, b) => b.lines - a.lines);
    } catch { /* before 0201 there are no counts to show */ }

    return NextResponse.json({
      ok: true, readAt: new Date().toISOString(), today,
      grn: { days, today: win(today), d7: win(d7), d15: win(d15) },
      noInvoice, noInvoice7, poOpen, poOverdue, poOverdue60, counts,
    });
  } catch (e) {
    return errJson(e);
  }
}
