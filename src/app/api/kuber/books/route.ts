import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { requireKuber } from "@/lib/accounts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Kuber reads the books (Dr Raghu, 28 Aug 2026: "this data should be used for
 * management decisions"). Everything here is COMPUTED from the parsed Tally
 * snapshot plus the CFO registers — nothing is typed twice.
 *
 *   ?view=summary      — the dashboard numbers
 *   ?view=ageing&kind=receivable|payable — party-wise ageing with the bills
 *   ?view=reportcard   — the supplier report card
 *   ?view=cashflow     — the 13-week cash flow
 *   ?view=ledgers&q=   — the parsed ledger list
 *   ?view=vouchers&q=  — the parsed voucher list
 */

const IST_TODAY = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const addDays = (iso: string, d: number) => {
  const t = new Date(iso + "T00:00:00Z");
  t.setUTCDate(t.getUTCDate() + d);
  return t.toISOString().slice(0, 10);
};
/** Monday of the week holding `iso`. */
const mondayOf = (iso: string) => {
  const t = new Date(iso + "T00:00:00Z");
  const dow = (t.getUTCDay() + 6) % 7;
  return addDays(iso, -dow);
};
const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) / 86400000);

type Bill = { party: string; party_group: string | null; bill: string; bill_date: string | null; due_date: string | null; kind: string; amount: number };

async function allBills(admin: ReturnType<typeof adminClient>): Promise<Bill[]> {
  const out: Bill[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from("kuber_bill")
      .select("party, party_group, bill, bill_date, due_date, kind, amount")
      .range(from, from + 999);
    if (error) {
      if (/does not exist|schema cache/i.test(error.message)) return [];
      throw new Error(error.message);
    }
    out.push(...((data || []) as Bill[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/**
 * Ageing buckets exactly as the MANAGEMENT REVIEW sheet cuts them —
 * AGE <30 / 31-90 / 91-180 / >180 days — so Kuber's numbers land on the
 * same lines Dr Raghu already reads.
 */
const bucketOf = (due: string | null, today: string) => {
  if (!due || due >= today) return "not_due";
  const d = daysBetween(due, today);
  return d < 30 ? "d0_30" : d <= 90 ? "d31_90" : d <= 180 ? "d91_180" : "d180p";
};

export async function GET(req: Request) {
  try {
    await requireKuber();
    const admin = adminClient();
    const url = new URL(req.url);
    const view = url.searchParams.get("view") || "summary";
    const today = IST_TODAY();

    if (view === "ageing") {
      const kind = url.searchParams.get("kind");
      if (kind !== "receivable" && kind !== "payable") throw new HttpError(400, "kind must be receivable or payable");
      // amounts are SIGNED (0079): positive = owed in the party's direction,
      // negative = an unadjusted opposite entry. The party total is the NET —
      // the sheet's own number — with the unadjusted lump shown, not hidden.
      const bills = (await allBills(admin)).filter((b) => b.kind === kind);
      // each bill's own arithmetic — ORIGINAL billed, RECEIVED against it,
      // PENDING — rebuilt from the opening bills and the settlement records
      // (Dr Raghu, 28 Aug 2026). Tally signs: debit negative; a receivable
      // bill's original is its debit side, its receipts the credit side.
      const hist = new Map<string, { neg: number; pos: number }>();
      const feed = async (table: string, amountCol: string) => {
        for (let f = 0; ; f += 1000) {
          const { data, error } = await admin.from(table).select(`ledger, bill, ${amountCol}`).range(f, f + 999);
          if (error) return;
          for (const r of (data || []) as unknown as Record<string, unknown>[]) {
            const k = String(r.ledger) + "||" + String(r.bill);
            const h = hist.get(k) || { neg: 0, pos: 0 };
            const v = Number(r[amountCol]) || 0;
            if (v < 0) h.neg += v; else h.pos += v;
            hist.set(k, h);
          }
          if (!data || data.length < 1000) break;
        }
      };
      await feed("kuber_opening_bill", "amount");
      await feed("kuber_bill_alloc", "amount");
      type BillOut = Bill & { original: number; received: number };
      const dress = (b: Bill): BillOut => {
        const h = hist.get(b.party + "||" + b.bill) || { neg: 0, pos: 0 };
        const original = kind === "receivable" ? -h.neg : h.pos;
        const received = kind === "receivable" ? h.pos : -h.neg;
        return { ...b, original, received };
      };
      const parties = new Map<string, { party: string; group: string | null; total: number; gross: number; unadjusted: number; not_due: number; d0_30: number; d31_90: number; d91_180: number; d180p: number; bills: BillOut[] }>();
      for (const b of bills) {
        const p = parties.get(b.party) || { party: b.party, group: b.party_group, total: 0, gross: 0, unadjusted: 0, not_due: 0, d0_30: 0, d31_90: 0, d91_180: 0, d180p: 0, bills: [] };
        p.total += b.amount;
        if (b.amount > 0) {
          p.gross += b.amount;
          (p as unknown as Record<string, number>)[bucketOf(b.due_date, today)] += b.amount;
        } else p.unadjusted += b.amount;
        p.bills.push(dress(b));
        parties.set(b.party, p);
      }
      const rows = [...parties.values()]
        .filter((p) => Math.abs(p.total) > 0.5)
        .map((p) => ({ ...p, bills: p.bills.sort((a, b2) => String(a.due_date || "9999").localeCompare(String(b2.due_date || "9999"))) }))
        .sort((a, b2) => b2.total - a.total);
      // ONE arithmetic with the report card (Dr Raghu caught the two screens
      // disagreeing, 28 Aug 2026): totals over ALL bills, count = the open
      // bills proper (positives) — an untied advance is not a bill.
      const pos = bills.filter((b) => b.amount > 0);
      const gross = pos.reduce((s2, b) => s2 + b.amount, 0);
      const unadjusted = bills.filter((b) => b.amount < 0).reduce((s2, b) => s2 + b.amount, 0);
      const overdue = pos.filter((b) => b.due_date && b.due_date < today).reduce((s2, b) => s2 + b.amount, 0);
      return NextResponse.json({ rows, total: gross + unadjusted, gross, overdue, unadjusted, count: pos.length, today });
    }

    if (view === "reportcard") {
      // The supplier's story: what they carry, how late we are with them, and
      // how late THEY leave us to run — the card reads both directions.
      const bills = (await allBills(admin)).filter((b) => b.kind === "payable");
      const byParty = new Map<string, { party: string; group: string | null; outstanding: number; gross: number; overdue: number; oldest: string | null; nbills: number; wsum: number }>();
      for (const b of bills) {
        const p = byParty.get(b.party) || { party: b.party, group: b.party_group, outstanding: 0, gross: 0, overdue: 0, oldest: null, nbills: 0, wsum: 0 };
        p.outstanding += b.amount; // net — the sheet's own Tally OS
        if (b.amount > 0) {
          p.gross += b.amount;
          p.nbills += 1;
          if (b.due_date && b.due_date < today) {
            p.overdue += b.amount;
            p.wsum += daysBetween(b.due_date, today) * b.amount;
            if (!p.oldest || b.due_date < p.oldest) p.oldest = b.due_date;
          }
        }
        byParty.set(b.party, p);
      }
      // purchase volume from the vouchers, so a big steady supplier outranks
      // a one-bill stranger even at the same outstanding
      const vol = new Map<string, { n: number }>();
      try {
        const { data } = await admin.from("kuber_voucher").select("party, vtype").in("vtype", ["Purchase", "Cap-Ex Purchase", "Outside Labour", "Expenses", "Site Exps"]).limit(20000);
        for (const v of data || []) {
          if (!v.party) continue;
          const r = vol.get(v.party) || { n: 0 };
          r.n += 1;
          vol.set(v.party, r);
        }
      } catch { /* vouchers not loaded yet */ }
      // the headline stats Dr Raghu asked for (28 Aug 2026): total O/S in
      // numbers and value, the rupee-weighted average AGE of what is open,
      // and how much stands beyond its credit period (= overdue, since the
      // due date IS bill date + credit period).
      let ageWsum = 0, grossAll = 0, nbillsAll = 0, overdueAll = 0, netAll = 0;
      for (const b of bills) {
        netAll += b.amount;
        if (b.amount > 0) {
          grossAll += b.amount;
          nbillsAll += 1;
          if (b.bill_date) ageWsum += daysBetween(b.bill_date, today) * b.amount;
          if (b.due_date && b.due_date < today) overdueAll += b.amount;
        }
      }
      const stats = {
        net: netAll, gross: grossAll, nbills: nbillsAll,
        parties: byParty.size,
        avg_age_days: grossAll > 0 ? Math.round(ageWsum / grossAll) : 0,
        overdue: overdueAll,
        overdue_pct: grossAll > 0 ? Math.round((overdueAll / grossAll) * 100) : 0,
      };
      const rows = [...byParty.values()].filter((p) => Math.abs(p.outstanding) > 0.5).map((p) => {
        const avgDelay = p.overdue > 0 ? Math.round(p.wsum / p.overdue) : 0;
        // % of GROSS open bills, so unadjusted credits can never push it past 100
        const overduePct = p.gross > 0 ? p.overdue / p.gross : 0;
        // Our grade of the RELATIONSHIP's health, not of the supplier's soul:
        // A = current, D = mostly overdue and old.
        const grade = overduePct < 0.1 ? "A" : overduePct < 0.35 ? "B" : avgDelay <= 60 ? "C" : "D";
        return { ...p, vouchers: vol.get(p.party)?.n || 0, avg_delay_days: avgDelay, overdue_pct: Math.round(overduePct * 100), grade };
      }).sort((a, b2) => b2.outstanding - a.outstanding);
      return NextResponse.json({ rows, stats, today });
    }

    if (view === "supplier") {
      // one supplier's own report card (the sheet's tab-B3 drilldown):
      // the open bills, the ageing, and what was actually PAID in the last
      // 7 / 30 / 45 / 90 days from the settlement allocations.
      const party = url.searchParams.get("party") || "";
      if (!party) throw new HttpError(400, "party required");
      const bills = (await allBills(admin)).filter((b) => b.kind === "payable" && b.party === party);
      const posB = bills.filter((b) => b.amount > 0);
      const net = bills.reduce((s, b) => s + b.amount, 0);
      const gross = posB.reduce((s, b) => s + b.amount, 0);
      const unadjusted = bills.filter((b) => b.amount < 0).reduce((s, b) => s + b.amount, 0);
      const overdueB = posB.filter((b) => b.due_date && b.due_date < today);
      const overdue = overdueB.reduce((s, b) => s + b.amount, 0);
      const wsum = overdueB.reduce((s, b) => s + daysBetween(b.due_date as string, today) * b.amount, 0);
      // the fine ageing HE specified: 0-15 · 16-30 · 31-60 · 61-90 · 91-120 ·
      // 121-180 · 181-240 · 241-360 · 360+ — days since the BILL date.
      const FINE: [string, number, number][] = [
        ["d0_15", 0, 15], ["d16_30", 16, 30], ["d31_60", 31, 60], ["d61_90", 61, 90],
        ["d91_120", 91, 120], ["d121_180", 121, 180], ["d181_240", 181, 240],
        ["d241_360", 241, 360], ["d360p", 361, 1e9],
      ];
      const buckets: Record<string, number> = Object.fromEntries(FINE.map(([k]) => [k, 0]));
      buckets.undated = 0;
      for (const b of posB) {
        if (!b.bill_date) { buckets.undated += b.amount; continue; }
        const d = daysBetween(b.bill_date, today);
        const f = FINE.find(([, lo, hi]) => d >= lo && d <= hi);
        buckets[f ? f[0] : "d360p"] += b.amount;
      }
      // credit period as the bills themselves wear it (due − bill date)
      const periods = posB.filter((b) => b.bill_date && b.due_date).map((b) => daysBetween(b.bill_date as string, b.due_date as string));
      const creditDays = periods.length ? Math.round(periods.reduce((a, b) => a + b, 0) / periods.length) : null;
      // the movement ledgers: negative allocations = payments OUT to the
      // supplier; positive New Refs = invoices booked IN from him.
      const paid = { d7: 0, d30: 0, d45: 0, d90: 0 };
      const invoiced = { d7: 0, d30: 0, d45: 0, d90: 0 };
      const payments: { date: string | null; amount: number; bill: string; vtype: string; vno: string }[] = [];
      const invoices: { date: string | null; amount: number; bill: string; vtype: string; vno: string }[] = [];
      try {
        const { data: al } = await admin.from("kuber_bill_alloc").select("amount, date, bill, billtype, voucher_id").eq("ledger", party).limit(5000);
        const vids = [...new Set((al || []).map((a) => String(a.voucher_id)).filter(Boolean))];
        const vinfo = new Map<string, { vtype: string; vno: string }>();
        for (let i = 0; i < vids.length; i += 200) {
          const { data: vs } = await admin.from("kuber_voucher").select("id, vtype, vno").in("id", vids.slice(i, i + 200));
          for (const vv of vs || []) vinfo.set(String(vv.id), { vtype: String(vv.vtype), vno: String(vv.vno) });
        }
        for (const a of al || []) {
          const amt = Number(a.amount) || 0;
          const vi = vinfo.get(String(a.voucher_id)) || { vtype: "", vno: "" };
          const rec = { date: (a.date as string) ?? null, bill: String(a.bill || ""), vtype: vi.vtype, vno: vi.vno };
          if (amt < 0) {
            payments.push({ ...rec, amount: -amt });
            if (a.date) {
              const d = daysBetween(String(a.date), today);
              if (d <= 7) paid.d7 -= amt;
              if (d <= 30) paid.d30 -= amt;
              if (d <= 45) paid.d45 -= amt;
              if (d <= 90) paid.d90 -= amt;
            }
          } else if (amt > 0 && /new ref/i.test(String(a.billtype))) {
            invoices.push({ ...rec, amount: amt });
            if (a.date) {
              const d = daysBetween(String(a.date), today);
              if (d <= 7) invoiced.d7 += amt;
              if (d <= 30) invoiced.d30 += amt;
              if (d <= 45) invoiced.d45 += amt;
              if (d <= 90) invoiced.d90 += amt;
            }
          }
        }
        payments.sort((x, y) => String(y.date || "").localeCompare(String(x.date || "")));
        invoices.sort((x, y) => String(y.date || "").localeCompare(String(x.date || "")));
      } catch { /* allocs absent — the card stands without them */ }
      // planned payments for this party — the cash flow's own decisions
      let plans: { plan_date: string; amount: number; status: string; purpose: string; bill_ref: string }[] = [];
      try {
        const { data: pl } = await admin.from("kuber_payment_plan").select("plan_date, amount, status, purpose, bill_ref").eq("party", party).neq("status", "dropped").order("plan_date");
        plans = (pl || []) as typeof plans;
      } catch { /* pre-0076 */ }
      // items supplied — the goods on this party's vouchers (0081)
      let items: { item: string; times: number; total: number; qty: string; last: string | null }[] = [];
      try {
        const { data: pv } = await admin.from("kuber_voucher").select("id, date").eq("party", party).limit(2000);
        const vdate = new Map((pv || []).map((x) => [String(x.id), (x.date as string) ?? null]));
        const ids = [...vdate.keys()];
        const byItem = new Map<string, { times: number; total: number; qtys: string[]; last: string | null }>();
        for (let i = 0; i < ids.length; i += 200) {
          const { data: it } = await admin.from("kuber_voucher_item").select("voucher_id, item, qty, amount").in("voucher_id", ids.slice(i, i + 200));
          for (const x of it || []) {
            const r = byItem.get(String(x.item)) || { times: 0, total: 0, qtys: [], last: null };
            r.times += 1;
            r.total += Math.abs(Number(x.amount) || 0);
            if (x.qty) r.qtys.push(String(x.qty));
            const dte = vdate.get(String(x.voucher_id)) ?? null;
            if (dte && (!r.last || dte > r.last)) r.last = dte;
            byItem.set(String(x.item), r);
          }
        }
        items = [...byItem.entries()]
          .map(([item, r]) => ({ item, times: r.times, total: r.total, qty: r.qtys.slice(-1)[0] || "", last: r.last }))
          .sort((a, b2) => b2.total - a.total);
      } catch { /* pre-0081 or masters-only */ }
      let vouchers = 0;
      try {
        const { count } = await admin.from("kuber_voucher").select("id", { count: "exact", head: true }).eq("party", party);
        vouchers = count ?? 0;
      } catch { /* fine */ }
      const oldest = overdueB.reduce<string | null>((s, b) => (!s || (b.due_date as string) < s ? (b.due_date as string) : s), null);
      return NextResponse.json({
        party, today, net, gross, unadjusted, overdue,
        overdue_pct: gross > 0 ? Math.round((overdue / gross) * 100) : 0,
        weighted_delay: overdue > 0 ? Math.round(wsum / overdue) : 0,
        oldest_due: oldest, credit_days: creditDays, buckets, paid, invoiced, vouchers,
        payments: payments.slice(0, 200), invoices: invoices.slice(0, 200), plans, items: items.slice(0, 100),
        bills: bills.sort((a, b2) => String(a.due_date || "9999").localeCompare(String(b2.due_date || "9999"))),
      });
    }

    if (view === "cashflow") {
      // THIRTEEN WEEKS, Monday to Monday. Inflows: receivable bills by due
      // week, FD maturities, manual "in" items. Outflows: payment plans by
      // plan week, manual "out" items (weekly ones repeat), payable bills by
      // due week SHOWN for reference but only counted when no plan exists —
      // the plan is the decision, the bill is the obligation.
      const start = mondayOf(today);
      const weeks = Array.from({ length: 13 }, (_, i) => addDays(start, i * 7));
      const weekIdx = (d: string | null) => {
        if (!d) return -1;
        if (d < start) return 0; // overdue money lands in the current week
        const i = Math.floor(daysBetween(start, d) / 7);
        return i >= 0 && i < 13 ? i : -1;
      };
      const zero = () => Array.from({ length: 13 }, () => 0);
      const flows = {
        collections: zero(), fd_maturity: zero(), other_in: zero(),
        planned_payments: zero(), unplanned_bills: zero(), other_out: zero(),
      };
      const bills = await allBills(admin);
      for (const b of bills.filter((x) => x.kind === "receivable" && x.amount > 0)) {
        const i = weekIdx(b.due_date);
        if (i >= 0) flows.collections[i] += b.amount;
      }
      let plans: { plan_date: string; party: string; amount: number; status: string }[] = [];
      try {
        const { data } = await admin.from("kuber_payment_plan").select("plan_date, party, amount, status").neq("status", "dropped").neq("status", "paid");
        plans = (data || []) as typeof plans;
      } catch { /* pre-0076 */ }
      const plannedParties = new Set(plans.map((p) => p.party));
      for (const p of plans) {
        const i = weekIdx(p.plan_date);
        if (i >= 0) flows.planned_payments[i] += p.amount;
      }
      for (const b of bills.filter((x) => x.kind === "payable" && x.amount > 0)) {
        if (plannedParties.has(b.party)) continue; // the plan overrides the bill
        const i = weekIdx(b.due_date);
        if (i >= 0) flows.unplanned_bills[i] += b.amount;
      }
      try {
        const { data: fds } = await admin.from("kuber_fd").select("maturity_date, maturity_amount, principal, status").eq("status", "live");
        for (const f of fds || []) {
          const i = weekIdx(f.maturity_date);
          if (i >= 0) flows.fd_maturity[i] += Number(f.maturity_amount ?? f.principal) || 0;
        }
        const { data: items } = await admin.from("kuber_cash_item").select("date, direction, amount, weekly, label");
        for (const it of items || []) {
          if (it.weekly) {
            for (let i = 0; i < 13; i++) (it.direction === "in" ? flows.other_in : flows.other_out)[i] += Number(it.amount) || 0;
          } else {
            const i = weekIdx(it.date);
            if (i >= 0) (it.direction === "in" ? flows.other_in : flows.other_out)[i] += Number(it.amount) || 0;
          }
        }
      } catch { /* pre-0076 */ }
      const net = zero(), cumulative = zero();
      let run = 0;
      for (let i = 0; i < 13; i++) {
        net[i] = flows.collections[i] + flows.fd_maturity[i] + flows.other_in[i]
          - flows.planned_payments[i] - flows.unplanned_bills[i] - flows.other_out[i];
        run += net[i];
        cumulative[i] = run;
      }
      return NextResponse.json({ start, weeks, flows, net, cumulative, today });
    }

    if (view === "ledgers") {
      const q = (url.searchParams.get("q") || "").trim();
      let query = admin.from("kuber_ledger").select("name, parent, opening, closing, loaded_at").order("name").limit(500);
      if (q) query = query.ilike("name", `%${q}%`);
      const { data, error } = await query;
      if (error) return NextResponse.json({ rows: [] });
      return NextResponse.json({ rows: data || [] });
    }

    if (view === "vouchers") {
      const q = (url.searchParams.get("q") || "").trim();
      let query = admin.from("kuber_voucher").select("id, date, vtype, vno, party, narration").order("date", { ascending: false }).limit(500);
      if (q) query = query.or(`party.ilike.%${q}%,narration.ilike.%${q}%,vno.ilike.%${q}%,vtype.ilike.%${q}%`);
      const { data, error } = await query;
      if (error) return NextResponse.json({ rows: [] });
      return NextResponse.json({ rows: data || [] });
    }

    // ---- summary: the dashboard ----
    const bills = await allBills(admin);
    const rec = bills.filter((b) => b.kind === "receivable");
    const pay = bills.filter((b) => b.kind === "payable");
    const sum = (xs: Bill[]) => xs.reduce((s, b) => s + b.amount, 0);
    const pos = (xs: Bill[]) => xs.filter((b) => b.amount > 0);
    const overdue = (xs: Bill[]) => pos(xs).filter((b) => b.due_date && b.due_date < today);
    const dueSoon = (xs: Bill[], days: number) => pos(xs).filter((b) => b.due_date && b.due_date >= today && b.due_date <= addDays(today, days));
    let loadedAt: string | null = null;
    try {
      const { data } = await admin.from("kuber_bill").select("loaded_at").limit(1);
      loadedAt = data?.[0]?.loaded_at ?? null;
    } catch { /* absent */ }
    const reg = async (table: string, dateCol: string, amountCol: string, days: number) => {
      try {
        const { data } = await admin.from(table).select("*").limit(1000);
        const live = (data || []).filter((r) => String(r.status || "live") === "live");
        return {
          count: live.length,
          amount: live.reduce((s, r) => s + (Number(r[amountCol]) || 0), 0),
          expiring: live.filter((r) => r[dateCol] && String(r[dateCol]) <= addDays(today, days)).length,
        };
      } catch { return { count: 0, amount: 0, expiring: 0 }; }
    };
    const [bg, fd, ins] = await Promise.all([
      reg("kuber_bg", "expiry_date", "amount", 60),
      reg("kuber_fd", "maturity_date", "principal", 60),
      reg("kuber_insurance", "expiry_date", "sum_insured", 60),
    ]);
    return NextResponse.json({
      today, loadedAt,
      receivable: { total: sum(rec), overdue: sum(overdue(rec)), due30: sum(dueSoon(rec, 30)), parties: new Set(rec.map((b) => b.party)).size, unadjusted: sum(rec.filter((b) => b.amount < 0)) },
      payable: { total: sum(pay), overdue: sum(overdue(pay)), due30: sum(dueSoon(pay, 30)), parties: new Set(pay.map((b) => b.party)).size, unadjusted: sum(pay.filter((b) => b.amount < 0)) },
      bg, fd, insurance: ins,
    });
  } catch (e) {
    return errJson(e);
  }
}
