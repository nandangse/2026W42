import type { SupabaseClient } from "@supabase/supabase-js";
import { crmDb, crmConfigured } from "@/crm/db";
import { pnlOf } from "@/lib/kuber-oe";
import { erpAuth } from "@/lib/saamaan-stock";
import { OE_HEADS } from "@/lib/kuber-rules";
import { swallow } from "@/lib/swallow";

/**
 * EVERY FIGURE ON THE CEO DASHBOARD, IN ONE PLACE (14 Oct 2026) — the page and
 * the daily snapshot both call this, so the triangles compare like with like.
 *
 *   books    Sales, TVC, Throughput, OE, PBT (and %) — Kuber's P&L arithmetic
 *   owed     receivables (0–90, 90+), payables (0–180, 180+), advances received and paid
 *   erp      supplier bills not received (goods received, not billed), payment on
 *            order execution aged 0–30 / 31–60 / 61–90 / 90+ from delivery
 *   orders   sales orders booked, live quotations (CRM)
 *   floor    live jobs, due in 30 days, late, on the floor, escalated, stages, delivered
 *   service  open tickets, the AMC book
 *   people   the roll, added and left in 90 days, in notice period, FnF pending
 *
 * Each part stands alone: one that cannot be read says so and the rest still show.
 */
type R = Record<string, unknown>;
const S = (v: unknown) => String(v ?? "").trim();
const N = (v: unknown) => Number(v) || 0;
const addDays = (d: string, n: number) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
export const istDay = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
export const fyStartOf = (t: string) => (t.slice(5, 7) >= "04" ? `${t.slice(0, 4)}-04-01` : `${Number(t.slice(0, 4)) - 1}-04-01`);

async function all(q: (a: number, b: number) => PromiseLike<{ data: R[] | null; error: { message: string } | null }>): Promise<R[]> {
  const out: R[] = [];
  for (let a = 0; a < 200000; a += 1000) { const { data, error } = await q(a, a + 999); if (error) throw new Error(error.message); out.push(...(data || [])); if (!data || data.length < 1000) break; }
  return out;
}
async function part<T>(name: string, f: () => Promise<T>): Promise<T | { error: string }> {
  try { return await f(); } catch (e) { swallow(`ceo/${name}`, e); return { error: String((e as Error).message).slice(0, 160) }; }
}

/** for each snapshot key: which way is better — up (1), down (−1), or neither (0); and whether it is a % (compared in points) */
export const DIRECTION: Record<string, { good: 1 | -1 | 0; pct?: boolean }> = {
  sales: { good: 1 }, tvc_pct: { good: -1, pct: true }, throughput_pct: { good: 1, pct: true }, oe_pct: { good: -1, pct: true }, pbt_pct: { good: 1, pct: true },
  tvc: { good: 0 }, throughput: { good: 1 }, oe: { good: 0 }, pbt: { good: 1 },
  receivable: { good: -1 }, rec_0_90: { good: 0 }, rec_90: { good: -1 }, payable: { good: 0 }, pay_0_180: { good: 0 }, pay_180: { good: -1 },
  grn_unbilled: { good: -1 }, adv_received: { good: 1 }, adv_paid: { good: -1 },
  poe_0_30: { good: 0 }, poe_31_60: { good: -1 }, poe_61_90: { good: -1 }, poe_90: { good: -1 }, poe_undelivered: { good: 0 },
  order_value: { good: 1 }, quote_value: { good: 1 },
  live: { good: 0 }, live_value: { good: 0 }, due30: { good: 0 }, late: { good: -1 }, on_floor: { good: 0 }, escalated: { good: -1 }, delivered_value: { good: 1 },
  open_tickets: { good: -1 }, amc_value: { good: 1 },
  headcount: { good: 0 }, added90: { good: 0 }, left90: { good: -1 }, notice: { good: -1 }, fnf_pending: { good: -1 },
};

export async function ceoFigures(admin: SupabaseClient, from: string, to: string) {
  const today = istDay();
  const [books, owed, erp, orders, floor, service, people] = await Promise.all([
    part("books", async () => {
      const p = await pnlOf(admin, from, to);
      if (!p) return { empty: true as const };
      const byHead: Record<string, number> = {}; for (const h of OE_HEADS) byHead[h] = 0;
      for (const r of p.g.rows) byHead[r.head] = (byHead[r.head] || 0) + r.amount;
      return { sales: Math.round(p.sales), purchases: Math.round(p.purchases), openingStock: Math.round(p.openingStock), closingStock: Math.round(p.closingStock), openingAt: p.openingAt, closingAt: p.closingAt, tvc: Math.round(p.tvc), throughput: Math.round(p.throughput), manuf: Math.round(p.manuf), oe: Math.round(p.oe), depreciation: Math.round(p.depreciation), otherIncome: Math.round(p.otherIncome), pbt: Math.round(p.pbt), byHead, books_to: p.g.latest };
    }),
    part("owed", async () => {
      const bills = await all((a, b) => admin.from("kuber_bill").select("kind, amount, bill_date, due_date").order("id").range(a, b));
      const d90 = addDays(today, -90), d180 = addDays(today, -180);
      const rec = bills.filter((b) => b.kind === "receivable" && N(b.amount) > 0), pay = bills.filter((b) => b.kind === "payable" && N(b.amount) < 0);
      const sum = (xs: R[], f: (b: R) => boolean, sign = 1) => Math.round(xs.filter(f).reduce((s, b) => s + sign * N(b.amount), 0));
      return {
        receivable: sum(rec, () => true), rec_0_90: sum(rec, (b) => !S(b.bill_date) || S(b.bill_date) >= d90), rec_90: sum(rec, (b) => !!S(b.bill_date) && S(b.bill_date) < d90),
        receivable_overdue: sum(rec, (b) => !!S(b.due_date) && S(b.due_date) < today),
        payable: sum(pay, () => true, -1), pay_0_180: sum(pay, (b) => !S(b.bill_date) || S(b.bill_date) >= d180, -1), pay_180: sum(pay, (b) => !!S(b.bill_date) && S(b.bill_date) < d180, -1),
        adv_received: sum(bills, (b) => b.kind === "receivable" && N(b.amount) < 0, -1), adv_paid: sum(bills, (b) => b.kind === "payable" && N(b.amount) > 0),
      };
    }),
    part("erp", async () => {
      const a = await erpAuth();
      if (!a) throw new Error("The ERP's URL and token are not saved.");
      const list = async (dt: string, f: string[], fl: unknown[]) => { const r = await fetch(`${a.base}/api/resource/${encodeURIComponent(dt)}?fields=${encodeURIComponent(JSON.stringify(f))}&filters=${encodeURIComponent(JSON.stringify(fl))}&limit_page_length=0`, { headers: a.H, signal: AbortSignal.timeout(45000) }); if (!r.ok) throw new Error(`ERP ${r.status} for ${dt}`); return ((await r.json()) as { data?: R[] }).data || []; };
      const [grn, jm] = await Promise.all([
        list("Purchase Receipt", ["name", "base_grand_total", "per_billed", "status"], [["docstatus", "=", 1], ["per_billed", "<", 100], ["status", "not in", ["Closed", "Return Issued", "Return"]]]),
        list("Jobmaster", ["name", "status", "actual_delivery_date", "custom_pending_payment_on_delivery"], [["custom_pending_payment_on_delivery", ">", 0], ["status", "!=", "Cancelled"]]),
      ]);
      const poe = { poe_0_30: 0, poe_31_60: 0, poe_61_90: 0, poe_90: 0, poe_undelivered: 0 };
      const n = { poe_0_30: 0, poe_31_60: 0, poe_61_90: 0, poe_90: 0, poe_undelivered: 0 };
      for (const j of jm) {
        const amt = N(j.custom_pending_payment_on_delivery); const d = S(j.actual_delivery_date);
        const k = !d || d > today ? "poe_undelivered" : days(d, today) <= 30 ? "poe_0_30" : days(d, today) <= 60 ? "poe_31_60" : days(d, today) <= 90 ? "poe_61_90" : "poe_90";
        poe[k as keyof typeof poe] += amt; n[k as keyof typeof n]++;
      }
      return { grn_unbilled: Math.round(grn.reduce((s, x) => s + N(x.base_grand_total) * (1 - N(x.per_billed) / 100), 0)), grn_count: grn.length, ...Object.fromEntries(Object.entries(poe).map(([k, v]) => [k, Math.round(v)])), poe_counts: n };
    }),
    part("orders", async () => {
      if (!crmConfigured()) throw new Error("The CRM database is not connected.");
      const crm = crmDb();
      const so = (await all((a, b) => crm.from("sales_order").select("amount, ordered_on, erp_status").gte("ordered_on", from).lte("ordered_on", to).order("id").range(a, b))).filter((s) => !/cancel/i.test(S(s.erp_status)));
      /* LIVE MEANS RECENT (14 Oct 2026): the CRM still calls 2,771 quotations live — ₹1,692 Cr, years of them never closed — so only those of the last twelve months count */
      const q = await all((a, b) => crm.from("quotation").select("grand_total").in("status", ["live", "hotlist", "submitted"]).gte("quoted_on", addDays(today, -365)).order("id").range(a, b));
      return { orders: so.length, order_value: Math.round(so.reduce((s, x) => s + N(x.amount), 0)), quotes_live: q.length, quote_value: Math.round(q.reduce((s, x) => s + N(x.grand_total), 0)) };
    }),
    part("floor", async () => {
      const [{ data: jobs }, dj] = await Promise.all([
        admin.from("jobs").select("id, val, tdd, on_floor, escalation, stat, pct").eq("delivered", false).eq("active", true),
        all((a, b) => admin.from("delivered_jobs").select("val, delivered_on").gte("delivered_on", from).lte("delivered_on", to).order("id").range(a, b)),
      ]);
      const j = jobs || []; const in30 = addDays(today, 30);
      const late = j.filter((x) => S(x.tdd) && S(x.tdd) < today);
      const due = j.filter((x) => S(x.tdd) && S(x.tdd) >= today && S(x.tdd) <= in30);
      const stage = (s: string) => /^S:/i.test(s) ? "Order & design" : /^(PPC|D:)/i.test(s) ? "Planning & approval" : /^M:/i.test(s) ? "Material" : /^P:/i.test(s) ? "Production" : /^Q:/i.test(s) ? "Quality" : /instal|^I:/i.test(s) ? "Installation" : "Other";
      const stages: Record<string, number> = {}; for (const x of j) { const k = stage(S(x.stat)); stages[k] = (stages[k] || 0) + 1; }
      const mStart = today.slice(0, 8) + "01";
      return {
        live: j.length, live_value: Math.round(j.reduce((s, x) => s + N(x.val), 0)),
        late: late.length, late_value: Math.round(late.reduce((s, x) => s + N(x.val), 0)), late_avg_days: late.length ? Math.round(late.reduce((s, x) => s + days(S(x.tdd), today), 0) / late.length) : 0,
        due30: due.length, due30_value: Math.round(due.reduce((s, x) => s + N(x.val), 0)),
        on_floor: j.filter((x) => x.on_floor).length, escalated: j.filter((x) => S(x.escalation)).length,
        avg_pct: j.length ? Math.round(j.reduce((s, x) => s + N(x.pct), 0) / j.length) : 0, stages,
        delivered: dj.length, delivered_value: Math.round(dj.reduce((s, x) => s + N(x.val), 0)),
        delivered_month: dj.filter((x) => S(x.delivered_on) >= mStart).length, delivered_month_value: Math.round(dj.filter((x) => S(x.delivered_on) >= mStart).reduce((s, x) => s + N(x.val), 0)),
      };
    }),
    part("service", async () => {
      const [{ count: open }, { data: amc }] = await Promise.all([
        admin.from("seva_issue").select("*", { count: "exact", head: true }).not("status", "ilike", "%closed%").not("status", "ilike", "%resolved%"),
        admin.from("seva_amc").select("value").eq("status", "AMC valid paid"),
      ]);
      return { open_tickets: open || 0, amc_valid: (amc || []).length, amc_value: Math.round((amc || []).reduce((s, x) => s + N(x.value), 0)) };
    }),
    part("people", async () => {
      const d90 = addDays(today, -90);
      const [emps, { data: notice }, { data: fnf }] = await Promise.all([
        all((a, b) => admin.from("hrms_employees").select("id, department, doj, active").order("id").range(a, b)),
        admin.from("hrms_employee_edits").select("employee_id, value").eq("field", "status").ilike("value", "notice%"),
        admin.from("hrms_fnf").select("employee_id, exit_date, status"),
      ]);
      const act = emps.filter((e) => e.active !== false);
      const by: Record<string, number> = {}; for (const e of act) by[S(e.department) || "—"] = (by[S(e.department) || "—"] || 0) + 1;
      const activeIds = new Set(act.map((e) => S(e.id)));
      return {
        headcount: act.length, by_department: by,
        added90: act.filter((e) => S(e.doj) >= d90).length,
        left90: (fnf || []).filter((f) => S(f.exit_date) >= d90 && S(f.exit_date) <= today).length,
        notice: (notice || []).filter((n) => activeIds.has(S(n.employee_id))).length,
        fnf_pending: (fnf || []).filter((f) => S(f.status) !== "Closed" && S(f.exit_date) && S(f.exit_date) <= today).length,
      };
    }),
  ]);
  /* the flat list a snapshot keeps */
  const snap: Record<string, number> = {};
  const ok = <T,>(x: T | { error: string }): x is T => !!x && !(typeof x === "object" && "error" in (x as object));
  if (ok(books) && !("empty" in books)) {
    const pc = (v: number) => (books.sales ? Math.round((v / books.sales) * 10000) / 100 : 0);
    Object.assign(snap, { sales: books.sales, tvc: books.tvc, throughput: books.throughput, oe: books.oe, pbt: books.pbt, tvc_pct: pc(books.tvc), throughput_pct: pc(books.throughput), oe_pct: pc(books.oe), pbt_pct: pc(books.pbt) });
  }
  if (ok(owed)) for (const k of ["receivable", "rec_0_90", "rec_90", "payable", "pay_0_180", "pay_180", "adv_received", "adv_paid"]) snap[k] = (owed as Record<string, number>)[k];
  if (ok(erp)) for (const k of ["grn_unbilled", "poe_0_30", "poe_31_60", "poe_61_90", "poe_90", "poe_undelivered"]) snap[k] = (erp as unknown as Record<string, number>)[k];
  if (ok(orders)) Object.assign(snap, { order_value: orders.order_value, quote_value: orders.quote_value });
  if (ok(floor)) Object.assign(snap, { live: floor.live, live_value: floor.live_value, due30: floor.due30, late: floor.late, on_floor: floor.on_floor, escalated: floor.escalated, delivered_value: floor.delivered_value });
  if (ok(service)) Object.assign(snap, { open_tickets: service.open_tickets, amc_value: service.amc_value });
  if (ok(people)) Object.assign(snap, { headcount: people.headcount, added90: people.added90, left90: people.left90, notice: people.notice, fnf_pending: people.fnf_pending });
  return { books, owed, erp, orders, floor, service, people, snap };
}

/** keep today's figures (the financial year to date) — once a day is enough, a later write the same day replaces it */
export async function keepSnapshot(admin: SupabaseClient, snap: Record<string, number>) {
  const day = istDay();
  const rows = Object.entries(snap).filter(([, v]) => Number.isFinite(v)).map(([key, value]) => ({ day, key, value, at: new Date().toISOString() }));
  if (rows.length) await admin.from("ceo_snapshot").upsert(rows, { onConflict: "day,key" });
}

/** the figures of a week back — the latest snapshot on or before today − 7 */
export async function weekAgo(admin: SupabaseClient): Promise<{ day: string | null; values: Record<string, number> }> {
  const cut = addDays(istDay(), -7);
  const { data: last } = await admin.from("ceo_snapshot").select("day").lte("day", cut).order("day", { ascending: false }).limit(1);
  const day = last?.[0]?.day ? S(last[0].day) : null;
  if (!day) return { day: null, values: {} };
  const { data } = await admin.from("ceo_snapshot").select("key, value").eq("day", day);
  return { day, values: Object.fromEntries((data || []).map((r) => [S(r.key), N(r.value)])) };
}
