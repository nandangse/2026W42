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

type RR = Record<string, unknown>;

/** The whole parsed book, paged past the cap — groups, ledgers, vouchers,
 *  lines — with the group tree ready to walk. One load, many statements. */
async function loadWorld(admin: ReturnType<typeof adminClient>) {
  const pageAllW = async (build: (a: number, b: number) => PromiseLike<{ data: RR[] | null; error: { message: string } | null }>) => {
    const out: RR[] = [];
    for (let a = 0; ; a += 1000) {
      const { data, error } = await build(a, a + 999);
      if (error) {
        if (/does not exist|schema cache/i.test(error.message)) return out;
        throw new Error(error.message);
      }
      out.push(...(data || []));
      if ((data || []).length < 1000) break;
    }
    return out;
  };
  const [groups, ledgers, vouchers, lines] = await Promise.all([
    pageAllW((a, b) => admin.from("kuber_group").select("name, parent").order("name").range(a, b)),
    pageAllW((a, b) => admin.from("kuber_ledger").select("name, parent, opening").order("name").range(a, b)),
    pageAllW((a, b) => admin.from("kuber_voucher").select("id, date, vtype").order("id").range(a, b)),
    pageAllW((a, b) => admin.from("kuber_voucher_line").select("voucher_id, ledger, amount").order("id").range(a, b)),
  ]);
  const parentOf = new Map(groups.map((g) => [String(g.name).toLowerCase(), String(g.parent || "")]));
  const properOf = new Map(groups.map((g) => [String(g.name).toLowerCase(), String(g.name)]));
  const rootCache = new Map<string, string>();
  const rootOf = (g: string): string => {
    const k = g.toLowerCase();
    if (rootCache.has(k)) return rootCache.get(k)!;
    let cur = k;
    for (let i = 0; i < 25; i++) {
      const pr = (parentOf.get(cur) || "").toLowerCase();
      if (!pr || pr === cur) break;
      cur = pr;
    }
    const r = properOf.get(cur) || g;
    rootCache.set(k, r);
    return r;
  };
  const ledgerByName = new Map(ledgers.map((l) => [String(l.name), l]));
  const dateOf = new Map(vouchers.map((v) => [String(v.id), String(v.date || "")]));
  return { groups, ledgers, vouchers, lines, rootOf, ledgerByName, dateOf };
}

/** root → group → ledger tree with amounts; every statement wears it. */
function treeOf(entries: { ledger: string; group: string; root: string; amount: number }[]) {
  const roots = new Map<string, { root: string; total: number; groups: Map<string, { total: number; ledgers: Map<string, number> }> }>();
  for (const e of entries) {
    if (!e.amount) continue;
    const r = roots.get(e.root) ?? roots.set(e.root, { root: e.root, total: 0, groups: new Map() }).get(e.root)!;
    r.total += e.amount;
    const g = r.groups.get(e.group) ?? r.groups.set(e.group, { total: 0, ledgers: new Map() }).get(e.group)!;
    g.total += e.amount;
    g.ledgers.set(e.ledger, (g.ledgers.get(e.ledger) || 0) + e.amount);
  }
  return [...roots.values()]
    .map((r) => ({
      root: r.root, total: r.total,
      groups: [...r.groups.entries()]
        .map(([name, g]) => ({
          name, total: g.total,
          ledgers: [...g.ledgers.entries()].map(([ledger, amount]) => ({ name: ledger, amount }))
            .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 300),
        }))
        .filter((g) => g.total !== 0)
        .sort((a, b) => Math.abs(b.total) - Math.abs(a.total)),
    }))
    .filter((r) => r.total !== 0)
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}

const isBankChain = (rootOf: (g: string) => string, parent: string) =>
  /^bank accounts$|^bank od|^cash-in-hand$/i.test(rootOf(parent)) || /^bank|^cash-in-hand$/i.test(parent);

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

    // ---- financials: P&L and Balance Sheet, computed from first principles
    // (Dr Raghu, 28 Aug 2026: "Add above Correspondence P&L and BS").
    // Tally's own arithmetic: each ledger walks its group chain to a PRIMARY
    // group; income/expense roots make the P&L over the period, the rest make
    // the balance sheet as-of (opening + every line to date). Debit is
    // negative throughout — the parser's convention, kept.
    // ---- expenses: the TVC / OE / Expenses registers (Dr Raghu, 28 Aug
    // 2026, the TOC cut): TVC = Truly Variable Cost — RM, process, freight —
    // what rises with every unit; OE = Operating Expenses — every cost that
    // is NOT variable. THROUGHPUT = Sales − TVC; NET ties back to the P&L.
    // Genie seeds the classification; the CFO's flip (kuber_expense_class)
    // always outranks the seed.
    if (view === "expenses") {
      const fyStartE = today.slice(5, 7) >= "04" ? today.slice(0, 4) + "-04-01" : String(Number(today.slice(0, 4)) - 1) + "-04-01";
      const from = url.searchParams.get("from") || fyStartE;
      const to = url.searchParams.get("to") || today;

      const pageAllE = async (build: (a: number, b: number) => PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>) => {
        const out: Record<string, unknown>[] = [];
        for (let a = 0; ; a += 1000) {
          const { data, error } = await build(a, a + 999);
          if (error) {
            if (/does not exist|schema cache/i.test(error.message)) return out;
            throw new Error(error.message);
          }
          out.push(...(data || []));
          if ((data || []).length < 1000) break;
        }
        return out;
      };
      const [groups, ledgers, vouchers, lines, clsRows] = await Promise.all([
        pageAllE((a, b) => admin.from("kuber_group").select("name, parent").order("name").range(a, b)),
        pageAllE((a, b) => admin.from("kuber_ledger").select("name, parent").order("name").range(a, b)),
        pageAllE((a, b) => admin.from("kuber_voucher").select("id, date").order("id").range(a, b)),
        pageAllE((a, b) => admin.from("kuber_voucher_line").select("voucher_id, ledger, amount").order("id").range(a, b)),
        pageAllE((a, b) => admin.from("kuber_expense_class").select("ledger, cls").order("ledger").range(a, b)),
      ]);
      if (!ledgers.length) return NextResponse.json({ empty: true });

      const parentOf = new Map(groups.map((g) => [String(g.name).toLowerCase(), String(g.parent || "")]));
      const properOf = new Map(groups.map((g) => [String(g.name).toLowerCase(), String(g.name)]));
      const rootOf = (g: string): string => {
        let cur = g.toLowerCase();
        for (let i = 0; i < 25; i++) {
          const p = (parentOf.get(cur) || "").toLowerCase();
          if (!p || p === cur) break;
          cur = p;
        }
        return properOf.get(cur) || g;
      };
      const isExpense = (root: string) => /expense|^purchase/i.test(root) && !/asset/i.test(root);
      const isIncome = (root: string) => /income|^sales/i.test(root);

      const dateOf = new Map(vouchers.map((v) => [String(v.id), String(v.date || "")]));
      const period = new Map<string, number>();
      for (const l of lines) {
        const d = dateOf.get(String(l.voucher_id)) || "";
        if (d >= from && d <= to && d) period.set(String(l.ledger), (period.get(String(l.ledger)) || 0) + (Number(l.amount) || 0));
      }

      const flip = new Map(clsRows.map((c) => [String(c.ledger), String(c.cls)]));
      // The TOC seed: purchase heads and the process-like direct expenses
      // rise with the unit — everything else stands whether we build or not.
      const seedCls = (name: string, grp: string, root: string) =>
        /^purchase/i.test(root)
          || (/direct expense/i.test(root) && /job ?work|process|freight|carriage|cartage|consum|raw ?material|\brm\b|packing|loading|octroi|customs|import/i.test(name + " " + grp))
          ? "tvc" : "oe";

      let sales = 0;
      const rows: { ledger: string; group: string; root: string; cls: string; seeded: boolean; amount: number }[] = [];
      for (const l of ledgers) {
        const name = String(l.name);
        const grp = String(l.parent || "");
        if (!grp) continue;
        const root = rootOf(grp);
        const amt = period.get(name) || 0;
        if (isIncome(root)) { sales += amt; continue; }
        if (!isExpense(root) || !amt) continue;
        const cls = flip.get(name) || seedCls(name, grp, root);
        rows.push({ ledger: name, group: grp, root, cls, seeded: !flip.has(name), amount: -amt });
      }
      rows.sort((a, b) => b.amount - a.amount);
      const tvc = rows.filter((r) => r.cls === "tvc").reduce((s2, r) => s2 + r.amount, 0);
      const oe = rows.filter((r) => r.cls === "oe").reduce((s2, r) => s2 + r.amount, 0);
      return NextResponse.json({ from, to, rows, totals: { sales, tvc, oe, throughput: sales - tvc, net: sales - tvc - oe } });
    }

    // ---- drill: one ledger's vouchers in the period — every statement's
    // bottom rung (Dr Raghu, 28 Aug 2026: "make it drill downable").
    if (view === "drill") {
      const ledger = String(url.searchParams.get("ledger") || "");
      if (!ledger) throw new HttpError(400, "ledger required");
      const from = url.searchParams.get("from") || "0000-01-01";
      const to = url.searchParams.get("to") || "9999-12-31";
      const lns: RR[] = [];
      for (let a = 0; ; a += 1000) {
        const { data, error } = await admin.from("kuber_voucher_line")
          .select("voucher_id, amount").eq("ledger", ledger).order("id").range(a, a + 999);
        if (error) break;
        lns.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      const ids = [...new Set(lns.map((l) => String(l.voucher_id)))];
      const vmap = new Map<string, RR>();
      for (let i = 0; i < ids.length; i += 150) {
        const { data } = await admin.from("kuber_voucher")
          .select("id, date, vtype, vno, party, narration").in("id", ids.slice(i, i + 150));
        for (const v of data || []) vmap.set(String(v.id), v);
      }
      const rows = lns
        .map((l) => ({ v: vmap.get(String(l.voucher_id)), amount: Number(l.amount) || 0 }))
        .filter((x) => x.v && String(x.v.date || "") >= from && String(x.v.date || "") <= to)
        .map((x) => ({
          date: String(x.v!.date || ""), vtype: String(x.v!.vtype || ""), vno: String(x.v!.vno || ""),
          party: String(x.v!.party || ""), narration: String(x.v!.narration || "").slice(0, 160), amount: x.amount,
        }))
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 800);
      return NextResponse.json({ ledger, rows, total: rows.reduce((s2, r) => s2 + r.amount, 0) });
    }

    // ---- Actual Cash Flow (Dr Raghu, 28 Aug 2026): what actually moved
    // through bank and cash, group-wise — Tally's own reading. For every
    // voucher touching a bank/cash ledger, the OTHER side names the flow:
    // a credit there is money COMING FROM it (inflow), a debit is money
    // GOING TO it (outflow). Contra (bank↔bank) stands apart as transfers.
    if (view === "cashflow_actual") {
      const fyStartA = today.slice(5, 7) >= "04" ? today.slice(0, 4) + "-04-01" : String(Number(today.slice(0, 4)) - 1) + "-04-01";
      const from = url.searchParams.get("from") || fyStartA;
      const to = url.searchParams.get("to") || today;
      const w = await loadWorld(admin);
      if (!w.ledgers.length) return NextResponse.json({ empty: true });

      const byVoucher = new Map<string, RR[]>();
      for (const l of w.lines) {
        const k = String(l.voucher_id);
        (byVoucher.get(k) ?? byVoucher.set(k, []).get(k)!).push(l);
      }
      const inflows: { ledger: string; group: string; root: string; amount: number }[] = [];
      const outflows: typeof inflows = [];
      let bankMove = 0, contra = 0;
      for (const [vid, lns] of byVoucher) {
        const d = w.dateOf.get(vid) || "";
        if (d < from || d > to || !d) continue;
        const isBank = (name: string) => {
          const led = w.ledgerByName.get(name);
          return led ? isBankChain(w.rootOf, String(led.parent || "")) : false;
        };
        const bankLines = lns.filter((l) => isBank(String(l.ledger)));
        if (!bankLines.length) continue;
        const others = lns.filter((l) => !isBank(String(l.ledger)));
        bankMove += bankLines.reduce((s2, l) => s2 + (Number(l.amount) || 0), 0);
        if (!others.length) { contra += bankLines.filter((l) => (Number(l.amount) || 0) < 0).reduce((s2, l) => s2 - (Number(l.amount) || 0), 0); continue; }
        for (const l of others) {
          const amt = Number(l.amount) || 0;
          if (!amt) continue;
          const led = w.ledgerByName.get(String(l.ledger));
          const grp = String(led?.parent || "(unknown)");
          const root = grp === "(unknown)" ? grp : w.rootOf(grp);
          const e = { ledger: String(l.ledger), group: grp, root, amount: Math.abs(amt) };
          if (amt > 0) inflows.push(e); else outflows.push(e);
        }
      }
      const inn = treeOf(inflows), out = treeOf(outflows);
      const tin = inn.reduce((s2, r) => s2 + r.total, 0), tout = out.reduce((s2, r) => s2 + r.total, 0);
      return NextResponse.json({ from, to, inflows: inn, outflows: out, totalIn: tin, totalOut: tout, net: tin - tout, bankMove: -bankMove, contra });
    }

    // ---- Fund Flow (same ask): where the money CAME FROM and WENT between
    // two balance-sheet dates — each head's closing on date B less date A.
    // Liabilities rising and assets falling are SOURCES; the mirror is
    // APPLICATIONS. The P&L heads' own movement is funds from operations.
    if (view === "fundflow") {
      const fyStartF2 = today.slice(5, 7) >= "04" ? today.slice(0, 4) + "-04-01" : String(Number(today.slice(0, 4)) - 1) + "-04-01";
      const from = url.searchParams.get("from") || fyStartF2;
      const to = url.searchParams.get("to") || today;
      const w = await loadWorld(admin);
      if (!w.ledgers.length) return NextResponse.json({ empty: true });

      const isPnlF = (root: string) => /income|expense|^sales|^purchase/i.test(root) && !/asset/i.test(root);
      const upToA = new Map<string, number>(), upToB = new Map<string, number>();
      for (const l of w.lines) {
        const d = w.dateOf.get(String(l.voucher_id)) || "";
        if (!d) continue;
        const amt = Number(l.amount) || 0;
        const name = String(l.ledger);
        if (d < from) upToA.set(name, (upToA.get(name) || 0) + amt);
        if (d <= to) upToB.set(name, (upToB.get(name) || 0) + amt);
      }
      const sources: { ledger: string; group: string; root: string; amount: number }[] = [];
      const applications: typeof sources = [];
      let operations = 0;
      for (const l of w.ledgers) {
        const name = String(l.name), grp = String(l.parent || "");
        if (!grp) continue;
        const root = w.rootOf(grp);
        const delta = (upToB.get(name) || 0) - (upToA.get(name) || 0);
        if (!delta) continue;
        if (isPnlF(root)) { operations += delta; continue; }
        // credit positive: a rising credit (liability up) or a falling debit
        // (asset released) is money MADE AVAILABLE — a source.
        const e = { ledger: name, group: grp, root, amount: Math.abs(delta) };
        if (delta > 0) sources.push(e); else applications.push(e);
      }
      const src = treeOf(sources), app = treeOf(applications);
      const tsrc = src.reduce((s2, r) => s2 + r.total, 0) + Math.max(0, operations);
      const tapp = app.reduce((s2, r) => s2 + r.total, 0) + Math.max(0, -operations);
      return NextResponse.json({ from, to, sources: src, applications: app, operations, totalSources: tsrc, totalApplications: tapp, gap: tsrc - tapp });
    }

    // ---- the MIS statement (Dr Raghu, 28 Aug 2026, his own sheet's shape):
    // Sales → Revenue → Purchases ± stock → TVC → THROUGHPUT → Manufacturing
    // → GROSS PROFIT → Indirect (operating) → EBITDA → Finance → Depreciation
    // → Net Operating → Other Income → NPBT → Tax → NPAT, each with % of
    // sales and average monthly, every head drillable. Opening/closing stock
    // are TYPED (0092) — the XML carries no stock. The ratio pack rides
    // beside it, every ratio stating its own formula.
    if (view === "mis") {
      const fyStartM = today.slice(5, 7) >= "04" ? today.slice(0, 4) + "-04-01" : String(Number(today.slice(0, 4)) - 1) + "-04-01";
      // his preference: the period ends on LAST MONTH'S LAST DAY
      const lastMonthEnd = (() => {
        const t = new Date(today + "T00:00:00Z");
        t.setUTCDate(0);
        return t.toISOString().slice(0, 10);
      })();
      const from = url.searchParams.get("from") || fyStartM;
      const to = url.searchParams.get("to") || (lastMonthEnd >= fyStartM ? lastMonthEnd : today);
      const w = await loadWorld(admin);
      if (!w.ledgers.length) return NextResponse.json({ empty: true });

      const [inpRes, tgtRes, loanRes] = await Promise.all([
        admin.from("kuber_mis_input").select("key, value"),
        admin.from("kuber_ratio_target").select("key, target"),
        admin.from("kuber_loan").select("outstanding, emi, status").then((r) => ({ data: r.error ? [] : r.data })),
      ]);
      const inputs = new Map(((inpRes.data as RR[]) || []).map((x) => [String(x.key), Number(x.value) || 0]));
      const targets = Object.fromEntries(((tgtRes.data as RR[]) || []).map((x) => [String(x.key), String(x.target)]));

      // period movement and closing-to-date per ledger
      const period = new Map<string, number>();
      const toDate = new Map<string, number>();
      for (const l of w.lines) {
        const d = w.dateOf.get(String(l.voucher_id)) || "";
        if (!d) continue;
        const amt = Number(l.amount) || 0;
        const name = String(l.ledger);
        if (d >= from && d <= to) period.set(name, (period.get(name) || 0) + amt);
        if (d <= to) toDate.set(name, (toDate.get(name) || 0) + amt);
      }

      type Ent = { ledger: string; group: string; root: string; amount: number };
      const ents: Record<string, Ent[]> = { sales: [], purchases: [], manuf: [], indirect: [], finance: [], depreciation: [], tax: [], otherIncome: [] };
      let profitToDate = 0;
      const closingOfRoot = new Map<string, number>();
      for (const l of w.ledgers) {
        const name = String(l.name), grp = String(l.parent || "");
        if (!grp) { profitToDate += 0; continue; }
        const root = w.rootOf(grp);
        const amt = period.get(name) || 0;
        const isPnlM = /income|expense|^\S*\.?\s*sales|purchase|manufacturing/i.test(root) && !/asset/i.test(root);
        if (isPnlM) {
          profitToDate += toDate.get(name) || 0;
          if (!amt) continue;
          const e = { ledger: name, group: grp, root, amount: amt };
          if (/sales|direct income/i.test(root) && !/purchase/i.test(root)) ents.sales.push(e);
          else if (/purchase/i.test(root)) ents.purchases.push({ ...e, amount: -amt });
          else if (/manufacturing|direct expense/i.test(root)) ents.manuf.push({ ...e, amount: -amt });
          else if (/indirect income/i.test(root)) ents.otherIncome.push(e);
          else if (/indirect expense|expense/i.test(root)) {
            // finance, depreciation and tax step out of the indirect lump
            const hay = (grp + " " + name).toLowerCase();
            if (/deprecia/.test(hay)) ents.depreciation.push({ ...e, amount: -amt });
            else if (/finance|interest|bank charg/.test(hay)) ents.finance.push({ ...e, amount: -amt });
            else if (/current tax|deferred tax|income tax/.test(hay)) ents.tax.push({ ...e, amount: -amt });
            else ents.indirect.push({ ...e, amount: -amt });
          }
        } else {
          // balance-sheet closing per root, for the ratio pack
          const closing = (Number(l.opening) || 0) + (toDate.get(name) || 0);
          closingOfRoot.set(root, (closingOfRoot.get(root) || 0) + closing);
          // the debtor/creditor chains, held separately
          const chainHas = (want: RegExp) => {
            let cur = grp.toLowerCase();
            for (let i = 0; i < 25; i++) {
              if (want.test(cur)) return true;
              const nx = (w.groups.find((g) => String(g.name).toLowerCase() === cur) ? String(w.groups.find((g) => String(g.name).toLowerCase() === cur)!.parent || "").toLowerCase() : "");
              if (!nx || nx === cur) return false;
              cur = nx;
            }
            return false;
          };
          if (chainHas(/sundry debtor/)) closingOfRoot.set("__debtors", (closingOfRoot.get("__debtors") || 0) + closing);
          if (chainHas(/sundry creditor/)) closingOfRoot.set("__creditors", (closingOfRoot.get("__creditors") || 0) + closing);
        }
      }

      const sum = (a: Ent[]) => a.reduce((s2, e) => s2 + e.amount, 0);
      const sales = sum(ents.sales);
      const otherIncome = sum(ents.otherIncome);
      const revenue = sales;
      const purchases = sum(ents.purchases);
      const openingStock = inputs.get("opening_stock") ?? 0;
      const closingStock = inputs.get("closing_stock") ?? 0;
      const stocksTyped = inputs.has("opening_stock") || inputs.has("closing_stock");
      const tvc = purchases + openingStock - closingStock;
      const throughput = revenue - tvc;
      const manuf = sum(ents.manuf);
      const grossProfit = throughput - manuf;
      const indirect = sum(ents.indirect);
      const ebitda = grossProfit - indirect;
      const finance = sum(ents.finance);
      const depreciation = sum(ents.depreciation);
      const netOperating = ebitda - finance - depreciation;
      const npbt = netOperating + otherIncome;
      const tax = sum(ents.tax);
      const npat = npbt - tax;

      const months = Math.max(1, (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + (Number(to.slice(5, 7)) - Number(from.slice(5, 7))) + 1);
      const days = Math.max(1, daysBetween(from, to) + 1);

      // ---- the ratio pack — each states its formula; "—" where an input
      // is honestly absent, never a guess ----
      const rootVal = (re: RegExp) => {
        let t2 = 0;
        for (const [r, v] of closingOfRoot) if (re.test(r)) t2 += v;
        return t2;
      };
      const equity = rootVal(/capital/i) + profitToDate;
      const loans = ((loanRes.data as RR[]) || []).filter((x) => String(x.status) !== "closed");
      const loanOut = loans.reduce((s2, x) => s2 + (Number(x.outstanding) || 0), 0);
      const emiMonthly = loans.reduce((s2, x) => s2 + (Number(x.emi) || 0), 0);
      const debtBooks = rootVal(/loans? \(liability\)|^\S*\.?\s*loans|bank od/i);
      const debt = loanOut > 0 ? loanOut : Math.max(0, debtBooks);
      const curLiab = rootVal(/current liabilit/i);
      const curAssets = -rootVal(/current asset/i);
      const debtors = -(closingOfRoot.get("__debtors") || 0);
      const creditors = closingOfRoot.get("__creditors") || 0;
      const ann = 365 / days;
      const R = (key: string, label: string, value: number | null, unit: string, formula: string) =>
        ({ key, label, value: value != null && isFinite(value) ? value : null, unit, formula, target: targets[key] || "" });
      const ratios = [
        R("ebitda_sales", "EBITDA to Sales %", revenue ? (ebitda / revenue) * 100 : null, "%", "EBITDA ÷ revenue"),
        R("pbt_sales", "PBT to Sales %", revenue ? (npbt / revenue) * 100 : null, "%", "net profit before tax ÷ revenue"),
        R("pat_sales", "PAT to Sales %", revenue ? (npat / revenue) * 100 : null, "%", "net profit after tax ÷ revenue"),
        R("int_cover", "Interest Coverage (times)", finance ? ebitda / finance : null, "x", "EBITDA ÷ finance charges"),
        R("debt_equity", "Debt / Equity", equity ? debt / equity : null, "x", loanOut > 0 ? "loan-register outstanding ÷ (capital + P&L to date)" : "loan roots in the books ÷ (capital + P&L to date)"),
        R("current_ratio", "Current Ratio", curLiab ? curAssets / curLiab : null, "x", "current assets ÷ current liabilities, at their book closings"),
        R("quick_ratio", "Quick Ratio", curLiab && stocksTyped ? (curAssets - closingStock) / curLiab : null, "x", stocksTyped ? "(current assets − closing stock) ÷ current liabilities" : "needs the closing stock typed on the P&L"),
        R("debt_service", "Debt Service (period)", emiMonthly ? emiMonthly * months : null, "₹", "loan-register monthly EMI × months in the period"),
        R("dscr", "DSCR", emiMonthly ? ebitda / (emiMonthly * months) : null, "x", "EBITDA ÷ (EMI × months); the loan register is the source"),
        R("gp_cr", "Gross Profit", grossProfit, "₹", "throughput − manufacturing expenses"),
        R("expenses_cr", "Direct + Indirect + Interest", manuf + indirect + finance, "₹", "manufacturing + indirect + finance charges"),
        R("productivity", "Business Productivity (GP ÷ Expenses)", manuf + indirect + finance ? grossProfit / (manuf + indirect + finance) : null, "x", "gross profit ÷ (manufacturing + indirect + finance)"),
        R("tol_tnw", "TOL / TNW", equity ? (debt + curLiab) / equity : null, "x", "(debt + current liabilities) ÷ (capital + P&L to date)"),
        R("roce", "RoCE %", equity + debt ? ((ebitda - depreciation) * ann / (equity + debt)) * 100 : null, "%", "EBIT annualised ÷ (equity + debt)"),
        R("roi", "ROI %", equity ? (npat * ann / equity) * 100 : null, "%", "PAT annualised ÷ equity"),
        R("debtor_days", "Debtors — days to Sales", revenue ? debtors / (revenue / days) : null, "days", "sundry debtors (books) ÷ per-day revenue"),
        R("inventory_days", "Inventory — days to COGS", stocksTyped && tvc ? ((openingStock + closingStock) / 2) / (tvc / days) : null, "days", stocksTyped ? "average stock ÷ per-day TVC" : "needs opening and closing stock typed on the P&L"),
        R("creditor_days", "Creditors — days to Purchases", purchases ? creditors / (purchases / days) : null, "days", "sundry creditors (books) ÷ per-day purchases"),
      ];
      const dD = ratios.find((r) => r.key === "debtor_days")?.value;
      const iD = ratios.find((r) => r.key === "inventory_days")?.value;
      const cD = ratios.find((r) => r.key === "creditor_days")?.value;
      ratios.push(R("ccc", "Cash Conversion Cycle (days)", dD != null && iD != null && cD != null ? dD + iD - cD : null, "days", "debtor days + inventory days − creditor days"));

      const line = (key: string, label: string, amount: number, treeEnts?: Ent[]) => ({
        key, label, amount,
        pct: revenue ? (amount / revenue) * 100 : null,
        avg: amount / months,
        tree: treeEnts ? treeOf(treeEnts) : undefined,
      });
      return NextResponse.json({
        from, to, months, stocksTyped,
        lines: [
          line("sales", "Sales", sales, ents.sales),
          line("revenue", "Revenue", revenue),
          line("purchases", "Purchases during the Period", purchases, ents.purchases),
          line("opening_stock", "Opening Stock (typed)", openingStock),
          line("closing_stock", "Closing Stock (typed)", closingStock),
          line("tvc", "TVC (COGS)", tvc),
          line("throughput", "THROUGHPUT", throughput),
          line("manuf", "Manufacturing Expenses", manuf, ents.manuf),
          line("gross_profit", "GROSS PROFIT for the Period", grossProfit),
          line("indirect", "Indirect Expenses", indirect, ents.indirect),
          line("ebitda", "EBITDA — Operating Profit before Interest, Depreciation & Tax", ebitda),
          line("finance", "Finance Charges", finance, ents.finance),
          line("depreciation", "Depreciation", depreciation, ents.depreciation),
          line("net_operating", "Net Operating Profit", netOperating),
          line("other_income", "Other Income", otherIncome, ents.otherIncome),
          line("npbt", "Net Profit Before Tax", npbt),
          line("tax", "Tax Expense", tax, ents.tax),
          line("npat", "NET PROFIT AFTER TAX", npat),
        ],
        ratios,
      });
    }

    if (view === "financials") {
      const fyStartF = today.slice(5, 7) >= "04" ? today.slice(0, 4) + "-04-01" : String(Number(today.slice(0, 4)) - 1) + "-04-01";
      const from = url.searchParams.get("from") || fyStartF;
      const to = url.searchParams.get("to") || today;
      const asof = url.searchParams.get("asof") || today;

      const pageAllF = async (build: (a: number, b: number) => PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>) => {
        const out: Record<string, unknown>[] = [];
        for (let a = 0; ; a += 1000) {
          const { data, error } = await build(a, a + 999);
          if (error) {
            if (/does not exist|schema cache/i.test(error.message)) return out;
            throw new Error(error.message);
          }
          out.push(...(data || []));
          if ((data || []).length < 1000) break;
        }
        return out;
      };

      const [groups, ledgers, vouchers, lines] = await Promise.all([
        pageAllF((a, b) => admin.from("kuber_group").select("name, parent").order("name").range(a, b)),
        pageAllF((a, b) => admin.from("kuber_ledger").select("name, parent, opening").order("name").range(a, b)),
        pageAllF((a, b) => admin.from("kuber_voucher").select("id, date").order("id").range(a, b)),
        pageAllF((a, b) => admin.from("kuber_voucher_line").select("voucher_id, ledger, amount").order("id").range(a, b)),
      ]);
      if (!ledgers.length) return NextResponse.json({ empty: true });

      const parentOf = new Map(groups.map((g) => [String(g.name).toLowerCase(), String(g.parent || "")]));
      const properOf = new Map(groups.map((g) => [String(g.name).toLowerCase(), String(g.name)]));
      const rootCache = new Map<string, string>();
      const rootOf = (g: string): string => {
        const k = g.toLowerCase();
        if (rootCache.has(k)) return rootCache.get(k)!;
        let cur = k;
        for (let i = 0; i < 25; i++) {
          const p = (parentOf.get(cur) || "").toLowerCase();
          if (!p || p === cur) break;
          cur = p;
        }
        const r = properOf.get(cur) || g;
        rootCache.set(k, r);
        return r;
      };
      // P&L roots: incomes, expenses, sales, purchases — but Tally's
      // "Misc. Expenses (ASSET)" is a balance-sheet head despite its name.
      const isPnl = (root: string) => /income|expense|^sales|^purchase/i.test(root) && !/asset/i.test(root);
      const assetSide = (root: string) => /^fixed assets|^investments|^current assets|^misc/i.test(root) || /\(asset\)/i.test(root);

      const dateOf = new Map(vouchers.map((v) => [String(v.id), String(v.date || "")]));
      // Per ledger: activity in [from, to] (the P&L period) and every line
      // up to `asof` (the balance sheet's closing).
      const period = new Map<string, number>();
      const toAsof = new Map<string, number>();
      for (const l of lines) {
        const d = dateOf.get(String(l.voucher_id)) || "";
        if (!d) continue;
        const amt = Number(l.amount) || 0;
        const name = String(l.ledger);
        if (d >= from && d <= to) period.set(name, (period.get(name) || 0) + amt);
        if (d <= asof) toAsof.set(name, (toAsof.get(name) || 0) + amt);
      }

      type Sec = { root: string; total: number; groups: Map<string, { total: number; ledgers: { name: string; amount: number }[] }> };
      const pnlSecs = new Map<string, Sec>();
      const bsSecs = new Map<string, Sec>();
      let profitToAsof = 0;
      const put = (map: Map<string, Sec>, root: string, grp: string, name: string, amount: number) => {
        if (!amount) return;
        const s = map.get(root) ?? map.set(root, { root, total: 0, groups: new Map() }).get(root)!;
        s.total += amount;
        const g = s.groups.get(grp) ?? s.groups.set(grp, { total: 0, ledgers: [] }).get(grp)!;
        g.total += amount;
        g.ledgers.push({ name, amount });
      };
      for (const l of ledgers) {
        const name = String(l.name);
        const parent = String(l.parent || "");
        const root = parent ? rootOf(parent) : "(primary)";
        const grp = parent || "(primary)";
        if (parent && isPnl(root)) {
          put(pnlSecs, root, grp, name, period.get(name) || 0);
          profitToAsof += toAsof.get(name) || 0;
        } else {
          // Closing = opening + everything to date. A primary "Profit & Loss"
          // ledger (Tally's opening-difference carrier) sits here too.
          put(bsSecs, root, grp, name, (Number(l.opening) || 0) + (toAsof.get(name) || 0));
        }
      }

      const dress = (map: Map<string, Sec>) =>
        [...map.values()]
          .map((s) => ({
            root: s.root,
            total: s.total,
            groups: [...s.groups.entries()]
              .map(([g, v]) => ({ name: g, total: v.total, ledgers: v.ledgers.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 300) }))
              .filter((g) => g.total !== 0)
              .sort((a, b) => Math.abs(b.total) - Math.abs(a.total)),
          }))
          .filter((s) => s.total !== 0)
          .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));

      const pnl = dress(pnlSecs);
      // Tally's two tiers: trading first (sales, purchases, direct), then the
      // indirect heads. Credit positive: income +, expense −.
      const trading = pnl.filter((s) => /^sales|^purchase|direct/i.test(s.root));
      const indirect = pnl.filter((s) => !/^sales|^purchase|direct/i.test(s.root));
      const grossProfit = trading.reduce((a, s) => a + s.total, 0);
      const netProfit = pnl.reduce((a, s) => a + s.total, 0);

      const bs = dress(bsSecs);
      const liabilities = bs.filter((s) => !assetSide(s.root));
      const assets = bs.filter((s) => assetSide(s.root));
      const totalL = liabilities.reduce((a, s) => a + s.total, 0) + profitToAsof;
      const totalA = assets.reduce((a, s) => a + s.total, 0);

      return NextResponse.json({
        from, to, asof,
        pnl: { trading, indirect, grossProfit, netProfit },
        bs: { liabilities, assets, profit: profitToAsof, totalL, totalA, gap: totalL + totalA },
      });
    }

    // ---- the CFO NOTE (Dr Raghu, 28 Aug 2026): "a very compact note that I
    // should review every Saturday about the things I should do to take
    // control of finances" — the trends and the to-do list, computed fresh
    // from the books every time it opens. No model call; the books speak.
    if (view === "cfonote") {
      // six months of the four flows, month by month
      const mkey = (d: string) => d.slice(0, 7);
      const monthsList: string[] = [];
      {
        let y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
        for (let i = 5; i >= 0; i--) {
          let mm = m - i, yy = y;
          while (mm <= 0) { mm += 12; yy -= 1; }
          monthsList.push(`${yy}-${String(mm).padStart(2, "0")}`);
        }
      }
      const FLOWT: Record<string, string> = { "GST Sales": "billing", Receipt: "collections", Purchase: "purchases", "Cap-Ex Purchase": "purchases", "Excise Purchase Import": "purchases", Payment: "payments" };
      const series: Record<string, number[]> = { billing: monthsList.map(() => 0), collections: monthsList.map(() => 0), purchases: monthsList.map(() => 0), payments: monthsList.map(() => 0) };
      const since6 = monthsList[0] + "-01";
      for (let f = 0; ; f += 1000) {
        const { data, error } = await admin.from("kuber_voucher").select("vtype, amount, date").gte("date", since6).order("id").range(f, f + 999);
        if (error) break;
        for (const v of data || []) {
          const k = FLOWT[String(v.vtype)];
          if (!k) continue;
          const idx = monthsList.indexOf(mkey(String(v.date || "")));
          if (idx >= 0) series[k][idx] += Number(v.amount) || 0;
        }
        if (!data || data.length < 1000) break;
      }

      // the bills: who to chase, what hangs untied
      const bills = await allBills(admin);
      const topOver = (kind: string) => {
        const by = new Map<string, number>();
        for (const b of bills) if (b.kind === kind && b.amount > 0 && b.due_date && b.due_date < today)
          by.set(b.party, (by.get(b.party) || 0) + b.amount);
        return [...by.entries()].map(([party, amount]) => ({ party, amount }))
          .sort((a, b) => b.amount - a.amount).slice(0, 5);
      };
      const unadjRec = -bills.filter((b) => b.kind === "receivable" && b.amount < 0).reduce((s2, b) => s2 + b.amount, 0);
      const unadjPay = -bills.filter((b) => b.kind === "payable" && b.amount < 0).reduce((s2, b) => s2 + b.amount, 0);
      const overRec = bills.filter((b) => b.kind === "receivable" && b.amount > 0 && b.due_date && b.due_date < today).reduce((s2, b) => s2 + b.amount, 0);

      // instruments on the clock
      const in60 = addDays(today, 60);
      const { data: bgs } = await admin.from("kuber_bg").select("amount, expiry_date, status").limit(1000);
      const bgSoon = (bgs || []).filter((b) => /^(live|in force|in effect)?$/.test(String(b.status ?? "")) && b.expiry_date && String(b.expiry_date) >= today && String(b.expiry_date) <= in60);
      const { data: fds } = await admin.from("kuber_fd").select("principal, maturity_date, status").limit(1000);
      const fdSoon = (fds || []).filter((b) => String(b.status ?? "live") === "live" && b.maturity_date && String(b.maturity_date) >= today && String(b.maturity_date) <= in60);

      // compliance standing this moment
      let compRed = 0, compAmber = 0;
      try {
        const lastM = mkey(addDays(today.slice(0, 8) + "01", -1));
        const { data: comps } = await admin.from("kuber_compliance").select("id, due_day, frequency").eq("active", true).limit(500);
        const { data: ents } = await admin.from("kuber_compliance_entry").select("compliance_id, month, done_on").eq("month", lastM).limit(1000);
        const eMap = new Map((ents || []).map((e) => [String(e.compliance_id), e]));
        for (const c of (comps || []).filter((c2) => String(c2.frequency) === "Monthly")) {
          const e = eMap.get(String(c.id));
          if (!e?.done_on) { compRed++; continue; }
          if (c.due_day) {
            const [y2, m2] = lastM.split("-").map(Number);
            const ny = m2 === 12 ? y2 + 1 : y2, nm = m2 === 12 ? 1 : m2 + 1;
            const due = `${ny}-${String(nm).padStart(2, "0")}-${String(c.due_day).padStart(2, "0")}`;
            if (String(e.done_on) > due) compAmber++;
          }
        }
      } catch { /* calendar not installed yet */ }

      // the loan clock
      const { data: loans } = await admin.from("kuber_loan").select("outstanding, emi, status").limit(500).then((r) => ({ data: r.error ? [] : r.data }));
      const emiMonthly = (loans || []).filter((x) => String(x.status) !== "closed").reduce((s2, x) => s2 + (Number(x.emi) || 0), 0);

      const last = monthsList.length - 1;
      const collGapThisMonth = series.billing[last] - series.collections[last];
      return NextResponse.json({
        today, months: monthsList, series,
        actions: {
          topOverdueCustomers: topOver("receivable"),
          topOverdueSuppliers: topOver("payable"),
          overdueReceivable: overRec,
          unadjRec, unadjPay,
          collGapThisMonth,
          bgSoon: { count: bgSoon.length, amount: bgSoon.reduce((s2, b) => s2 + (Number(b.amount) || 0), 0) },
          fdSoon: { count: fdSoon.length, amount: fdSoon.reduce((s2, b) => s2 + (Number(b.principal) || 0), 0) },
          compRed, compAmber, emiMonthly,
        },
      });
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
    // the flows of a chosen period, from the vouchers' own values (0083):
    // Billing = GST Sales · Collections = Receipt · Purchases = Purchase
    // family · Payments to suppliers = Payment. YTD = since 1 April.
    const period = url.searchParams.get("period") || "ytd";
    const fyStart = today.slice(5, 7) >= "04" ? today.slice(0, 4) + "-04-01" : String(Number(today.slice(0, 4)) - 1) + "-04-01";
    // MTD from the 1st; QTD from the FY quarter's own 1st (Apr/Jul/Oct/Jan)
    const mtdStart = today.slice(0, 8) + "01";
    const qm = Math.floor(((Number(today.slice(5, 7)) + 8) % 12) / 3) * 3; // months since April, floored to the quarter
    const qMonth = ((3 + qm) % 12) + 1;
    const qYear = qMonth > Number(today.slice(5, 7)) ? Number(today.slice(0, 4)) - 1 : Number(today.slice(0, 4));
    const qtdStart = `${qYear}-${String(qMonth).padStart(2, "0")}-01`;
    // `until` caps the flow window — the dashboard's day ratios prefer LAST
    // MONTH'S LAST DAY (Dr Raghu, 28 Aug 2026) over a moving mid-month cut.
    const until = url.searchParams.get("until") || today;
    const since = period === "ytd" ? fyStart
      : period === "mtd" ? mtdStart
      : period === "qtd" ? qtdStart
      : addDays(until, -Math.max(1, Math.min(365, Number(period) || 30)));
    const FLOW_TYPES: Record<string, string[]> = {
      billing: ["GST Sales"],
      collections: ["Receipt"],
      purchases: ["Purchase", "Cap-Ex Purchase", "Excise Purchase Import"],
      supplier_payments: ["Payment"],
    };
    const flows: Record<string, { value: number; count: number }> = Object.fromEntries(Object.keys(FLOW_TYPES).map((k) => [k, { value: 0, count: 0 }]));
    try {
      for (let f = 0; ; f += 1000) {
        const { data, error } = await admin.from("kuber_voucher").select("vtype, amount, date").gte("date", since).lte("date", until).range(f, f + 999);
        if (error) break;
        for (const vch of data || []) {
          for (const [k, types] of Object.entries(FLOW_TYPES)) {
            if (types.includes(String(vch.vtype))) {
              flows[k].value += Number(vch.amount) || 0;
              flows[k].count += 1;
            }
          }
        }
        if (!data || data.length < 1000) break;
      }
    } catch { /* pre-0083 — the table just stays empty */ }
    const bills = await allBills(admin);

    // BANK & CASH — every ledger whose group chain reaches Bank Accounts,
    // Bank OD or Cash-in-hand, COMPUTED as opening + every voucher line
    // (28 Aug 2026: an evening masters export arrived with every closing
    // zeroed — so the closing column is never trusted again; the books
    // compute their own).
    let bankCash = 0;
    try {
      const { data: gs } = await admin.from("kuber_group").select("name, parent").limit(2000);
      const par = new Map((gs || []).map((g) => [String(g.name).toLowerCase(), String(g.parent || "").toLowerCase()]));
      const isBankRoot = (g: string) => {
        let cur = g.toLowerCase();
        for (let i = 0; i < 25; i++) {
          if (/^bank accounts$|^bank od|^cash-in-hand$/.test(cur)) return true;
          const nxt = par.get(cur) || "";
          if (!nxt || nxt === cur) return false;
          cur = nxt;
        }
        return false;
      };
      const bankNames: string[] = [];
      for (let f2 = 0; ; f2 += 1000) {
        const { data } = await admin.from("kuber_ledger").select("name, parent, opening").order("name").range(f2, f2 + 999);
        for (const l of data || []) if (isBankRoot(String(l.parent || ""))) {
          bankCash += Number(l.opening) || 0;
          bankNames.push(String(l.name));
        }
        if (!data || data.length < 1000) break;
      }
      for (let i = 0; i < bankNames.length; i += 80) {
        const chunk = bankNames.slice(i, i + 80);
        for (let f3 = 0; ; f3 += 1000) {
          const { data } = await admin.from("kuber_voucher_line").select("amount").in("ledger", chunk).order("id").range(f3, f3 + 999);
          for (const l of data || []) bankCash += Number(l.amount) || 0;
          if (!data || data.length < 1000) break;
        }
      }
    } catch { /* books not loaded yet */ }
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
      today, loadedAt, since, period,
      flows,
      receivable: { total: sum(rec), gross: sum(pos(rec)), overdue: sum(overdue(rec)), due30: sum(dueSoon(rec, 30)), parties: new Set(rec.map((b) => b.party)).size, unadjusted: sum(rec.filter((b) => b.amount < 0)) },
      payable: { total: sum(pay), gross: sum(pos(pay)), overdue: sum(overdue(pay)), due30: sum(dueSoon(pay, 30)), parties: new Set(pay.map((b) => b.party)).size, unadjusted: sum(pay.filter((b) => b.amount < 0)) },
      bg, fd, insurance: ins,
    });
  } catch (e) {
    return errJson(e);
  }
}

/** POST { action: "classify", ledger, cls: "tvc" | "oe" } — the CFO's flip;
 *  it outranks the seed from then on. */
export async function POST(req: Request) {
  try {
    const user = await requireKuber();
    const body = await req.json();
    if (String(body.action) === "set_mis_input") {
      const key = String(body.key || "");
      if (!["opening_stock", "closing_stock"].includes(key)) throw new HttpError(400, "key must be opening_stock or closing_stock");
      const { error } = await adminClient().from("kuber_mis_input")
        .upsert({ key, value: Number(body.value) || 0, by: user.email, at: new Date().toISOString() }, { onConflict: "key" });
      if (error) {
        if (/does not exist|schema cache/i.test(error.message))
          throw new HttpError(503, "Run migration 0092 first — the typed inputs have nowhere to live yet.");
        throw new Error(error.message);
      }
      return NextResponse.json({ ok: true });
    }
    if (String(body.action) === "set_ratio_target") {
      const { error } = await adminClient().from("kuber_ratio_target")
        .upsert({ key: String(body.key || ""), target: String(body.target || ""), by: user.email, at: new Date().toISOString() }, { onConflict: "key" });
      if (error) {
        if (/does not exist|schema cache/i.test(error.message))
          throw new HttpError(503, "Run migration 0092 first — the targets have nowhere to live yet.");
        throw new Error(error.message);
      }
      return NextResponse.json({ ok: true });
    }
    if (String(body.action) !== "classify") throw new HttpError(400, "Unknown action.");
    const ledger = String(body.ledger || "").trim();
    const cls = String(body.cls || "");
    if (!ledger || !["tvc", "oe"].includes(cls)) throw new HttpError(400, "ledger and cls (tvc|oe) required");
    const { error } = await adminClient().from("kuber_expense_class")
      .upsert({ ledger, cls, by: user.email, at: new Date().toISOString() }, { onConflict: "ledger" });
    if (error) {
      if (/does not exist|schema cache/i.test(error.message))
        throw new HttpError(503, "Run migration 0087 first — the classification has nowhere to live yet.");
      throw new Error(error.message);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errJson(e);
  }
}
