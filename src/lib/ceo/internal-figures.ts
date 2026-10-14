import type { SupabaseClient } from "@supabase/supabase-js";
import { ceoFigures, istDay, fyStartOf, lastMonthEnd } from "@/lib/ceo/figures";
import { pnlOf } from "@/lib/kuber-oe";
import { WASTE, wasteOf, CARRY_RATE, STOCK_DAYS_TARGET } from "@/lib/ceo/internal";

/**
 * INTERNAL KUBER — the figures (Dr Raghu, 14 Oct 2026). Two halves:
 *   GENERATE  cash already earned or already spent that can be brought home
 *             without a new order — old receivables, payment due on delivery,
 *             supplier advances to adjust, stock above a sensible level, AMC
 *             renewals coming due
 *   WASTAGE   where money leaks — from the books by ledger (interest, charges,
 *             freight, exchange, penalties, write-offs, rework), from service
 *             (warranty and free calls), and what the waiting money costs
 * The books are struck to the last month-end, as everywhere on the CEO page.
 */
type R = Record<string, unknown>;
const S = (v: unknown) => String(v ?? "").trim();
const N = (v: unknown) => Number(v) || 0;
const crs = (n: number) => (Math.abs(n) >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : `₹${(n / 1e5).toFixed(1)} L`);

export type Lever = { key: string; label: string; amount: number; drill: string | null; lever: string; sub?: string; top?: { ledger: string; amount: number }[] };

export async function internalKuber(admin: SupabaseClient) {
  const today = istDay(); const fy = fyStartOf(today); const pnlTo = lastMonthEnd(today);
  const months = Math.max(1, (Number(pnlTo.slice(0, 4)) - Number(fy.slice(0, 4))) * 12 + Number(pnlTo.slice(5, 7)) - Number(fy.slice(5, 7)) + 1);
  const t60 = new Date(Date.parse(today) + 60 * 864e5).toISOString().slice(0, 10);
  const [figs, p, amc, issues] = await Promise.all([
    ceoFigures(admin, fy, today),
    pnlOf(admin, fy, today, pnlTo),
    admin.from("seva_amc").select("value").eq("status", "AMC valid paid").gte("end_date", today).lte("end_date", t60),
    admin.from("seva_issue").select("type_of_support, cost_spent, issue_date").gte("issue_date", fy).lte("issue_date", pnlTo).limit(10000),
  ]);
  const has = (x: unknown): x is R => !!x && typeof x === "object" && !("error" in (x as object));
  const owed: R = has(figs.owed) ? figs.owed : {}; const erp: R = has(figs.erp) ? (figs.erp as unknown as R) : {};

  /* GENERATE */
  const days = (Date.parse(pnlTo) - Date.parse(fy)) / 864e5 + 1;
  const tvcPerDay = p && p.tvc > 0 ? p.tvc / days : 0;
  const stockExcess = p && tvcPerDay ? Math.max(0, p.closingStock - tvcPerDay * STOCK_DAYS_TARGET) : 0;
  const amcRows = amc.data || [];
  const generate: Lever[] = [
    { key: "receivable_90", label: "Receivables over 90 days", amount: Math.round(N(owed.rec_90)), drill: "receivable_90", lever: "a named collector and a date against each bill — the oldest first" },
    { key: "poe", label: "Payment due on delivery, not collected", amount: Math.round(N(erp.poe_0_30) + N(erp.poe_31_60) + N(erp.poe_61_90) + N(erp.poe_90)), drill: "poe:90", lever: "no dispatch without the payment; chase the 90+ days first", sub: `of which 90+ days ${crs(N(erp.poe_90))}` },
    { key: "advances_paid", label: "Supplier advances not yet adjusted", amount: Math.round(N(owed.adv_paid)), drill: "advances_paid", lever: "the material or the bill against every advance; close the old ones" },
    { key: "stock", label: `Stock above ${STOCK_DAYS_TARGET} days of TVC`, amount: Math.round(stockExcess), drill: null, lever: "use or sell what has not moved; buy to the plan, not to the minimum order", sub: p && tvcPerDay ? `stock ${crs(p.closingStock)} on ${p.closingAt || pnlTo} = ${Math.round(p.closingStock / tvcPerDay)} days of TVC` : "no stock figure in the books" },
    { key: "amc_due", label: "AMC renewals due in 60 days", amount: Math.round(amcRows.reduce((s, a) => s + N(a.value), 0)), drill: "amc_due", lever: "the renewal quotation out 30 days before the end", sub: `${amcRows.length} contracts` },
  ];

  /* WASTAGE — from the books, a ledger at a time */
  const byKey: Record<string, { amount: number; ledgers: Record<string, number> }> = {};
  for (const l of p?.g.lines || []) {
    if (l.kind === "sales" || l.date > pnlTo) continue;
    const w = wasteOf(l.ledger, l.group); if (!w) continue;
    const x = (byKey[w.key] ||= { amount: 0, ledgers: {} }); x.amount += l.amount; x.ledgers[l.ledger] = (x.ledgers[l.ledger] || 0) + l.amount;
  }
  const service = (rx: RegExp) => (issues.data || []).filter((i) => rx.test(S(i.type_of_support))).reduce((s, i) => s + N(i.cost_spent), 0);
  const stuck = N(owed.rec_90) + N(erp.poe_31_60) + N(erp.poe_61_90) + N(erp.poe_90) + N(owed.adv_paid) + stockExcess;
  const wastage: Lever[] = [
    ...WASTE.map((w) => ({ key: w.key, label: w.label, amount: Math.round(byKey[w.key]?.amount || 0), drill: `waste:${w.key}`, lever: w.lever, top: Object.entries(byKey[w.key]?.ledgers || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([ledger, v]) => ({ ledger, amount: Math.round(v) })) })),
    { key: "warranty", label: "Warranty service cost", amount: Math.round(service(/warrant/i)), drill: "service:warranty", lever: "fix the cause — the same faults come back; charge what is out of warranty" },
    { key: "complimentary", label: "Free (complimentary) service cost", amount: Math.round(service(/complimentar/i)), drill: "service:complimentary", lever: "every free visit agreed in writing by a manager, and counted" },
  ].filter((w) => w.amount > 0);
  const wasteTotal = wastage.reduce((s, w) => s + w.amount, 0);
  return {
    today, from: fy, pnl_to: pnlTo, months, rate: CARRY_RATE, stock_days: STOCK_DAYS_TARGET,
    sales: p ? Math.round(p.sales) : 0, oe: p ? Math.round(p.oe) : 0, pbt: p ? Math.round(p.pbt) : 0,
    generate, generate_total: generate.reduce((s, g) => s + g.amount, 0),
    wastage, wastage_total: wasteTotal, wastage_per_month: Math.round(wasteTotal / months),
    carry: { stuck: Math.round(stuck), per_month: Math.round((stuck * CARRY_RATE) / 12), per_year: Math.round(stuck * CARRY_RATE) },
  };
}
