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
      const bills = (await allBills(admin)).filter((b) => b.kind === kind);
      const parties = new Map<string, { party: string; group: string | null; total: number; not_due: number; d0_30: number; d31_90: number; d91_180: number; d180p: number; bills: Bill[] }>();
      for (const b of bills) {
        const p = parties.get(b.party) || { party: b.party, group: b.party_group, total: 0, not_due: 0, d0_30: 0, d31_90: 0, d91_180: 0, d180p: 0, bills: [] };
        p.total += b.amount;
        (p as unknown as Record<string, number>)[bucketOf(b.due_date, today)] += b.amount;
        p.bills.push(b);
        parties.set(b.party, p);
      }
      const rows = [...parties.values()]
        .map((p) => ({ ...p, bills: p.bills.sort((a, b2) => String(a.due_date || "9999").localeCompare(String(b2.due_date || "9999"))) }))
        .sort((a, b2) => b2.total - a.total);
      const tot = rows.reduce((s, p) => s + p.total, 0);
      const overdue = rows.reduce((s, p) => s + p.d0_30 + p.d31_90 + p.d91_180 + p.d180p, 0);
      return NextResponse.json({ rows, total: tot, overdue, count: bills.length, today });
    }

    if (view === "reportcard") {
      // The supplier's story: what they carry, how late we are with them, and
      // how late THEY leave us to run — the card reads both directions.
      const bills = (await allBills(admin)).filter((b) => b.kind === "payable");
      const byParty = new Map<string, { party: string; group: string | null; outstanding: number; overdue: number; oldest: string | null; nbills: number; wsum: number }>();
      for (const b of bills) {
        const p = byParty.get(b.party) || { party: b.party, group: b.party_group, outstanding: 0, overdue: 0, oldest: null, nbills: 0, wsum: 0 };
        p.outstanding += b.amount;
        p.nbills += 1;
        if (b.due_date && b.due_date < today) {
          p.overdue += b.amount;
          p.wsum += daysBetween(b.due_date, today) * b.amount;
          if (!p.oldest || b.due_date < p.oldest) p.oldest = b.due_date;
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
      const rows = [...byParty.values()].map((p) => {
        const avgDelay = p.overdue > 0 ? Math.round(p.wsum / p.overdue) : 0;
        const overduePct = p.outstanding > 0 ? p.overdue / p.outstanding : 0;
        // Our grade of the RELATIONSHIP's health, not of the supplier's soul:
        // A = current, D = mostly overdue and old.
        const grade = overduePct < 0.1 ? "A" : overduePct < 0.35 ? "B" : avgDelay <= 60 ? "C" : "D";
        return { ...p, vouchers: vol.get(p.party)?.n || 0, avg_delay_days: avgDelay, overdue_pct: Math.round(overduePct * 100), grade };
      }).sort((a, b2) => b2.outstanding - a.outstanding);
      return NextResponse.json({ rows, today });
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
      for (const b of bills.filter((x) => x.kind === "receivable")) {
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
      for (const b of bills.filter((x) => x.kind === "payable")) {
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
    const overdue = (xs: Bill[]) => xs.filter((b) => b.due_date && b.due_date < today);
    const dueSoon = (xs: Bill[], days: number) => xs.filter((b) => b.due_date && b.due_date >= today && b.due_date <= addDays(today, days));
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
      receivable: { total: sum(rec), overdue: sum(overdue(rec)), due30: sum(dueSoon(rec, 30)), parties: new Set(rec.map((b) => b.party)).size },
      payable: { total: sum(pay), overdue: sum(overdue(pay)), due30: sum(dueSoon(pay, 30)), parties: new Set(pay.map((b) => b.party)).size },
      bg, fd, insurance: ins,
    });
  } catch (e) {
    return errJson(e);
  }
}
