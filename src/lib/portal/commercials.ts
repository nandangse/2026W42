import type { SupabaseClient } from "@supabase/supabase-js";
import { loadJobs, norm, type Scope, type PortalJob } from "@/lib/portal/data";

/**
 * COMMERCIALS, THE WHOLE MONEY STORY OF A CUSTOMER (Dr Raghu, 16 Oct 2026):
 * "show total in 12 months — Total order value, Invoiced, Payment received,
 * Payment pending, Advance received, More payment due, Payment due after
 * deliveries — as a table, with % to total order value. On the right another
 * table, Payment anticipated, by age. A tab called Jobs · Invoices · Payments.
 * On top 12 months or from–to. Outstanding invoices always shown."
 *
 * WHERE THE MONEY IS: invoicing and receipts are in Tally, which Kuber holds —
 * Sales vouchers are the invoices, Receipt vouchers the payments, kuber_bill
 * the bills still open (a negative receivable is an advance in hand). The
 * jobmaster gives the orders, the advance expected and the payment due on
 * delivery. Tally's party name is not the jobmaster's ("Veda Aeronautics (P)
 * Ltd" against "Veda Aeronautics Pvt Ltd"), so names are matched on their
 * core — legal tails and punctuation stripped — besides the organisation's
 * own match names.
 */
type R = Record<string, unknown>;
const S = (v: unknown) => (v === null || v === undefined ? "" : String(v)).trim();
const N = (v: unknown) => Number(v) || 0;
/** "Veda Aeronautics (P) Ltd" → "veda aeronautics"; "Taj SATS Air Catering Limited" → "taj sats air catering" */
export const coreName = (s: unknown) => norm(s).replace(/\(p\)|\bpvt\.?\b|\bprivate\b|\blimited\b|\bltd\.?\b|\bllp\b|\binc\.?\b|\bco\.?\b|\bcompany\b|[.,&'’-]/g, " ").replace(/\s+/g, " ").trim();

async function pageAll(q: (a: number, b: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<R[]> {
  const out: R[] = [];
  for (let a = 0; a < 200000; a += 1000) { const { data, error } = await q(a, a + 999); if (error) throw new Error(error.message); const rows = (data || []) as R[]; out.push(...rows); if (rows.length < 1000) break; }
  return out;
}
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

export const AGE_COLS = ["Overdue > 180 days", "Overdue 90–180 days", "Overdue 0–90 days", "Due in next week", "Due 8–30 days", "Due 31–60 days", "Due 61–90 days", "Due after 90 days"] as const;
/** which column a due date falls in, seen from today */
export function ageCol(due: string | null, today: string): number {
  if (!due) return 3;
  const d = days(today, due); // positive = still to come
  if (d < -180) return 0; if (d < -90) return 1; if (d < 0) return 2; if (d <= 7) return 3; if (d <= 30) return 4; if (d <= 60) return 5; if (d <= 90) return 6; return 7;
}

export async function commercials(admin: SupabaseClient, scope: Scope, from: string, to: string, today: string) {
  const wantAll = !scope.org;
  const names = scope.org ? scope.org.match_names.map(norm) : [];
  const cores = new Set(names.map(coreName).filter((c) => c.length >= 4));
  const mine = (party: unknown) => wantAll || names.includes(norm(party)) || cores.has(coreName(party));

  const [open, delivered, vouchers, bills] = await Promise.all([
    loadJobs(scope, "open"),
    loadJobs(scope, "delivered"),
    pageAll((a, b) => admin.from("kuber_voucher").select("id, date, vtype, vno, party, narration, amount").gte("date", from).lte("date", to).or("vtype.ilike.%sales%,vtype.ilike.%receipt%,vtype.ilike.%credit note%").order("date", { ascending: false }).range(a, b)),
    pageAll((a, b) => admin.from("kuber_bill").select("party, bill, bill_date, due_date, amount").eq("kind", "receivable").order("id").range(a, b)),
  ]);
  const isSale = (t: string) => /sales/i.test(t) && !/purchase/i.test(t);
  const isCredit = (t: string) => /credit note/i.test(t);
  const isReceipt = (t: string) => /receipt/i.test(t);
  const inv = vouchers.filter((v) => mine(v.party) && (isSale(S(v.vtype)) || isCredit(S(v.vtype)))).map((v) => ({ id: S(v.id), date: S(v.date), no: S(v.vno), type: S(v.vtype), party: S(v.party), narration: S(v.narration).slice(0, 200), amount: isCredit(S(v.vtype)) ? -Math.abs(N(v.amount)) : Math.abs(N(v.amount)) }));
  const pay = vouchers.filter((v) => mine(v.party) && isReceipt(S(v.vtype))).map((v) => ({ id: S(v.id), date: S(v.date), no: S(v.vno), party: S(v.party), narration: S(v.narration).replace(/\t+/g, " · ").slice(0, 200), amount: Math.abs(N(v.amount)) }));
  const myBills = bills.filter((b) => mine(b.party));
  const outstanding = myBills.filter((b) => N(b.amount) > 0).map((b) => ({ party: S(b.party), bill: S(b.bill), bill_date: S(b.bill_date) || null, due_date: S(b.due_date) || (S(b.bill_date) ? addDays(S(b.bill_date), 45) : null), amount: N(b.amount), age_days: S(b.bill_date) ? days(S(b.bill_date), today) : null })).sort((a, b) => String(a.due_date || "").localeCompare(String(b.due_date || "")));
  const advanceInHand = myBills.filter((b) => N(b.amount) < 0).reduce((s, b) => s - N(b.amount), 0);

  /* the orders: every job whose start (order received), else target, falls in the period — open or delivered */
  const inPeriod = (j: PortalJob) => { const d = S((j as unknown as R).start) || S(j.tdd); return !!d && d >= from && d <= to; };
  const orders = [...open, ...delivered].filter((j) => inPeriod(j));
  const orderValue = orders.reduce((s, j) => s + N(j.commercials?.value), 0);
  const invoiced = inv.reduce((s, v) => s + v.amount, 0);
  const received = pay.reduce((s, v) => s + v.amount, 0);
  const pending = outstanding.reduce((s, b) => s + b.amount, 0);
  const dueOnDelivery = open.reduce((s, j) => s + N(j.commercials?.pay_on_delivery), 0);
  const moreDue = Math.max(0, orderValue - invoiced - advanceInHand);
  const pct = (v: number) => (orderValue ? Math.round((v / orderValue) * 1000) / 10 : null);
  const summary = [
    { key: "order_value", label: "Total order value", amount: orderValue, pct: pct(orderValue), note: `${orders.length} orders with a start date in the period` },
    { key: "invoiced", label: "Invoiced", amount: invoiced, pct: pct(invoiced), note: `${inv.length} invoices and credit notes in the period (Tally)` },
    { key: "received", label: "Payment received", amount: received, pct: pct(received), note: `${pay.length} receipts in the period (Tally)` },
    { key: "pending", label: "Payment pending", amount: pending, pct: pct(pending), note: `${outstanding.length} invoices outstanding today — every one, whatever the period` },
    { key: "advance", label: "Advance received", amount: advanceInHand, pct: pct(advanceInHand), note: "advances in hand today, not yet set against a bill" },
    { key: "more_due", label: "More payment due", amount: moreDue, pct: pct(moreDue), note: "order value less invoiced less advance in hand" },
    { key: "on_delivery", label: "Payment due after deliveries", amount: dueOnDelivery, pct: pct(dueOnDelivery), note: `on ${open.length} open jobs, per the jobmaster's terms` },
  ];

  /* PAYMENT ANTICIPATED — three rows by what brings it, eight columns by when */
  const zero = () => AGE_COLS.map(() => 0);
  const rows = { delivered: zero(), advance: zero(), on_delivery: zero() };
  for (const b of outstanding) rows.delivered[ageCol(b.due_date, today)] += b.amount;
  for (const j of open) {
    const c = j.commercials; if (!c) continue;
    const expectedAdvance = N(c.value) * (N(c.pct_on) / 100) - N(c.advance);
    if (expectedAdvance > 0) rows.advance[3] += expectedAdvance;                     // owed now — this week
    if (N(c.pay_on_delivery) > 0) rows.on_delivery[ageCol(j.tdd, today)] += N(c.pay_on_delivery);
  }
  const anticipated = [
    { key: "delivered", label: "Items delivered", cols: rows.delivered, total: rows.delivered.reduce((s, v) => s + v, 0) },
    { key: "advance", label: "Advance for the order", cols: rows.advance, total: rows.advance.reduce((s, v) => s + v, 0) },
    { key: "on_delivery", label: "On delivery", cols: rows.on_delivery, total: rows.on_delivery.reduce((s, v) => s + v, 0) },
  ];
  const totalRow = { key: "total", label: "TOTAL", cols: AGE_COLS.map((_, i) => anticipated.reduce((s, r) => s + r.cols[i], 0)), total: anticipated.reduce((s, r) => s + r.total, 0) };

  return { from, to, today, columns: AGE_COLS, summary, anticipated: [totalRow, ...anticipated], invoices: inv, payments: pay, outstanding, open_jobs: open, orders_in_period: orders.length, matched_parties: [...new Set([...inv, ...pay, ...outstanding].map((x) => x.party))] };
}
