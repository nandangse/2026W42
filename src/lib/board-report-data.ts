import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * EVERYTHING THE BOARD REPORT STANDS ON, GATHERED ONCE.
 *
 * Dr Raghu, 30 Sep 2026: "then pdf u made put it here in the CFO note."
 *
 * The report was first built as a script run against the database. This is
 * the same arithmetic moved into the app so it can be produced on any
 * Saturday from whatever the books then say — the point of a management
 * report being that it is current, not that it exists.
 *
 * THE RULES THAT MADE THE FIRST DRAFT WRONG ARE ALL HERE, ON PURPOSE.
 *
 *   A PROFORMA IS NOT AN INVOICE. Excluded from sales and from the bills.
 *   Twenty-three proforma bills carrying Rs 18.97 Cr rode into the first
 *   draft as receivables and overstated the net by Rs 16.75 Cr.
 *
 *   AN ADVANCE COMES OFF THAT PARTY'S OWN BILLS and nobody else's, so the
 *   collectable figure is the party's net, not the sum of its bills.
 *
 *   A PART-POSTED MONTH FLATTERS EVERY RATIO. The month whose purchase
 *   vouchers are a fraction of the norm is found and marked, and the ratios
 *   are struck without it.
 */

const S = (v: unknown) => (v == null ? "" : String(v).trim());
const stripNo = (r: string) => String(r || "").replace(/^\s*\d+\s*[.)-]*\s*/, "");
const isProformaV = (vtype: unknown, vno: unknown) =>
  S(vtype) === "Proforma Invoice" || /^PI[-/]/i.test(S(vno));
const isProformaBill = (bill: unknown) =>
  /^PI[-/]/i.test(S(bill)) || /proforma/i.test(S(bill));

export interface MonthCol { key: string; label: string; short: string; partPosted: boolean }
export interface BoardData {
  on: string; fyLabel: string;
  months: MonthCol[];
  salesBasic: Record<string, number>; salesGst: Record<string, number>;
  purch: Record<string, number>; manuf: Record<string, number>;
  indirect: Record<string, number>; indInc: Record<string, number>;
  overheadByHead: { head: string; per: Record<string, number>; total: number }[];
  proformaBasic: number;
  vouchers: number; lines: number; booksTo: string;
  stock: { openingAt: string | null; opening: number; closingAt: string | null; closing: number; dated: boolean };
  jobs: BoardJobRow[];
  bills: { party: string; kind: "receivable" | "payable"; gross: number; adv: number; net: number; n: number; oldest: string | null }[];
}
export interface BoardJobRow {
  id: string; tag: string; fam: string; cust: string;
  tdd: string | null; otd: string | null; val: number; tp: number; kit: number; pct: number;
}

const page = async <T>(run: (a: number, b: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) => {
  const out: T[] = [];
  for (let a = 0; ; a += 1000) {
    const { data, error } = await run(a, a + 999);
    if (error) return out;
    out.push(...((data || []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
};

export async function boardData(admin: SupabaseClient, today: string): Promise<BoardData> {
  /* The financial year this report is about — 1 April to today. */
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  const fyY = m >= 4 ? y : y - 1;
  const from = `${fyY}-04-01`;
  const fyLabel = `${fyY}-${String(fyY + 1).slice(2)}`;

  const [groups, ledgers, vouchersAll, linesAll, billsAll, jobRows, stockRows, misRows] = await Promise.all([
    page<{ name: string; parent: string }>((a, b) => admin.from("kuber_group").select("name, parent").order("name").range(a, b)),
    page<{ name: string; parent: string }>((a, b) => admin.from("kuber_ledger").select("name, parent").order("name").range(a, b)),
    page<{ id: string; date: string; vtype: string; vno: string }>((a, b) => admin.from("kuber_voucher").select("id, date, vtype, vno").order("id").range(a, b)),
    page<{ voucher_id: string; ledger: string; amount: number }>((a, b) => admin.from("kuber_voucher_line").select("voucher_id, ledger, amount").order("id").range(a, b)),
    page<{ party: string; bill: string; due_date: string | null; kind: string; amount: number }>((a, b) => admin.from("kuber_bill").select("party, bill, due_date, kind, amount").range(a, b)),
    page<Record<string, unknown>>((a, b) => admin.from("jobs").select("id, tag, fam, cust, tdd, otd, val, tpv, kit, pct, active, delivered").order("id").range(a, b)),
    admin.from("kuber_stock").select("as_on, amount").order("as_on").then((r) => r.data || [], () => []),
    admin.from("kuber_mis_input").select("key, value").then((r) => r.data || [], () => []),
  ]);

  const gp = new Map(groups.map((g) => [g.name, g.parent]));
  const rootOf = (n0: string) => { let n = n0, s = 0; while (gp.get(n) && s++ < 30) n = gp.get(n)!; return n; };
  const ledRoot = new Map(ledgers.map((l) => [l.name, stripNo(rootOf(l.parent))]));
  const ledParent = new Map(ledgers.map((l) => [l.name, stripNo(l.parent)]));

  /* Months of the year so far. */
  const months: MonthCol[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(fyY, 3 + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (key > today.slice(0, 7)) break;
    months.push({
      key,
      label: d.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
      short: d.toLocaleDateString("en-GB", { month: "short" }),
      partPosted: false,
    });
  }
  const zero = () => Object.fromEntries(months.map((x) => [x.key, 0])) as Record<string, number>;

  const V = new Map(vouchersAll.map((v) => [String(v.id), v]));
  const salesBasic = zero(), salesGst = zero(), purch = zero(), manuf = zero(), indirect = zero(), indInc = zero();
  const heads: Record<string, Record<string, number>> = {};
  let proformaBasic = 0;
  const purchCount: Record<string, number> = zero();

  for (const v of vouchersAll) {
    const k = S(v.date).slice(0, 7);
    if (k in purchCount && /purchase/i.test(S(v.vtype)) && !isProformaV(v.vtype, v.vno)) purchCount[k] += 1;
  }
  for (const l of linesAll) {
    const v = V.get(String(l.voucher_id));
    if (!v) continue;
    const k = S(v.date).slice(0, 7);
    if (!(k in salesBasic)) continue;
    const root = ledRoot.get(l.ledger) || "";
    const a = Number(l.amount) || 0;
    if (isProformaV(v.vtype, v.vno)) { if (root === "Sales Accounts") proformaBasic += a; continue; }
    if (root === "Sales Accounts" || root === "Direct Incomes") salesBasic[k] += a;
    else if (root === "Purchase Accounts") purch[k] += -a;
    else if (root === "Manufacturing Expenses") manuf[k] += -a;
    else if (root === "Indirect Expenses") {
      indirect[k] += -a;
      const h = ledParent.get(l.ledger) || l.ledger;
      (heads[h] ||= zero())[k] += -a;
    } else if (root === "Indirect Incomes") indInc[k] += a;
    else if (root === "Current Liabilities" && /^output (c|s|i)gst/i.test(l.ledger)) salesGst[k] += a;
  }

  /**
   * WHICH MONTH IS ONLY HALF POSTED.
   *
   * Found, not assumed: a month whose purchase vouchers are under 40% of the
   * median of the others has bills still to be entered, whatever its sales
   * say. In September 2026 it was 21 against a norm of 250-316, which made
   * material look like 9.7% of sales.
   */
  const counts = months.map((x) => purchCount[x.key]).filter((n) => n > 0).sort((a, b) => a - b);
  const med = counts.length ? counts[Math.floor(counts.length / 2)] : 0;
  for (const x of months) x.partPosted = med > 0 && purchCount[x.key] < med * 0.4;

  const overheadByHead = Object.entries(heads)
    .map(([head, per]) => ({ head, per, total: months.reduce((a, x) => a + per[x.key], 0) }))
    .filter((r) => Math.abs(r.total) > 20000)
    .sort((a, b) => b.total - a.total);

  /* ---- stock: the dated register first, the old typed pair as a fallback ---- */
  const st = (stockRows as { as_on: string; amount: number }[]);
  const mis = new Map((misRows as { key: string; value: number }[]).map((r) => [r.key, Number(r.value) || 0]));
  let stock = { openingAt: null as string | null, opening: 0, closingAt: null as string | null, closing: 0, dated: false };
  if (st.length) {
    const open = [...st].filter((r) => String(r.as_on) <= from).pop() ?? st[0];
    const close = [...st].filter((r) => String(r.as_on) <= today).pop();
    stock = {
      openingAt: open ? String(open.as_on) : null, opening: open ? Number(open.amount) : 0,
      closingAt: close ? String(close.as_on) : null, closing: close ? Number(close.amount) : 0,
      dated: true,
    };
  } else if (mis.size) {
    stock = { openingAt: null, opening: mis.get("opening_stock") || 0, closingAt: null, closing: mis.get("closing_stock") || 0, dated: false };
  }

  /* ---- the order book ---- */
  const jobs: BoardJobRow[] = jobRows
    .filter((j) => j.active && !j.delivered)
    .map((j) => ({
      id: String(j.id), tag: S(j.tag), fam: S(j.fam), cust: S(j.cust),
      tdd: (j.tdd as string) || null, otd: (j.otd as string) || null,
      val: Number(j.val) || 0, tp: Number(j.tpv) || 0,
      kit: Math.round(Number(j.kit) || 0), pct: Math.round(Number(j.pct) || 0),
    }));

  /* ---- bills, per party, proformas out, each party's own advance applied ---- */
  const byParty = new Map<string, { party: string; kind: "receivable" | "payable"; gross: number; adv: number; net: number; n: number; oldest: string | null }>();
  for (const b of billsAll) {
    if (isProformaBill(b.bill)) continue;
    if (b.kind !== "receivable" && b.kind !== "payable") continue;
    const k = `${b.kind}||${b.party}`;
    const r = byParty.get(k) || { party: S(b.party), kind: b.kind as "receivable" | "payable", gross: 0, adv: 0, net: 0, n: 0, oldest: null };
    const v = Number(b.amount) || 0;
    r.net += v;
    if (v > 0) { r.gross += v; r.n += 1; if (b.due_date && (!r.oldest || b.due_date < r.oldest)) r.oldest = b.due_date; }
    else r.adv += v;
    byParty.set(k, r);
  }

  const booksTo = vouchersAll.map((v) => S(v.date)).filter(Boolean).sort().pop() || today;
  return {
    on: today, fyLabel, months,
    salesBasic, salesGst, purch, manuf, indirect, indInc,
    overheadByHead, proformaBasic,
    vouchers: vouchersAll.length, lines: linesAll.length, booksTo,
    stock, jobs,
    bills: [...byParty.values()].filter((r) => Math.abs(r.net) > 0.5 || r.gross > 0.5),
  };
}
