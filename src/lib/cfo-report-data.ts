import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyLedger, oeHead, type Bucket } from "@/lib/kuber-rules";
import { newestByName } from "@/lib/kuber-fy";

/**
 * EVERYTHING THE CFO MONTHLY REPORT STANDS ON, GATHERED ONCE.
 *
 * Dr Raghu, 30 Sep 2026, on "Final report for May 2026.xlsx": "This is level
 * 1. Now make it Level 10 ... All based on tally data and the data that's
 * within the Genie. Idea is to see whether just uploading the XML shall be
 * enough for this."
 *
 * The sheet has sixteen tabs. This module produces every one of them from
 * the books, FOR A CHOSEN MONTH, with the same month a year back beside it
 * and the year to date under it. Where the XML cannot support a figure the
 * field carries a `why` instead of a number, and the page prints the why.
 * A report that quietly averages over a hole is worse than one that points
 * at it.
 *
 * THE THREE THINGS THAT ARE NOT IN THE XML (see 0186): depreciation rates,
 * the budget, and the archive itself. The first two are typed once; the
 * report reads them and says when they are missing.
 *
 * THE RULES THAT HAVE BITTEN BEFORE ARE ALL HERE, ON PURPOSE:
 *   a proforma is not an invoice; one ledger is one row whatever the year
 *   loaded (newestByName); an overdraft is not cash; a party is netted
 *   against itself and never another; the ladder in kuber-rules decides
 *   which line a ledger lands on, and nothing here classifies on its own.
 */

const S = (v: unknown) => (v == null ? "" : String(v).trim());
const stripNo = (r: string) => String(r || "").replace(/^\s*[\dA-Z]{0,3}[.)]?\s*/, "");
const isProforma = (vtype: unknown, vno: unknown) => S(vtype) === "Proforma Invoice" || /^PI[-/]/i.test(S(vno));
const isProformaBill = (bill: unknown) => /^PI[-/]/i.test(S(bill)) || /proforma/i.test(S(bill));
const addDays = (iso: string, n: number) => { const t = new Date(iso + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const monthEnd = (ym: string) => { const [y, m] = ym.split("-").map(Number); return `${y}-${String(m).padStart(2, "0")}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`; };
const shiftMonth = (ym: string, n: number) => { const [y, m] = ym.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
const fyStartOf = (ym: string) => (ym.slice(5, 7) >= "04" ? ym.slice(0, 4) + "-04-01" : String(Number(ym.slice(0, 4)) - 1) + "-04-01");
const fyLabelOf = (ym: string) => { const a = fyStartOf(ym).slice(0, 4); return `${a}-${String(Number(a) + 1).slice(2)}`; };
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const monthLabel = (ym: string) => new Date(`${ym}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
const monthShort = (ym: string) => new Date(`${ym}-01T00:00:00`).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });

type RR = Record<string, unknown>;
const page = async <T,>(run: (a: number, b: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) => {
  const out: T[] = [];
  for (let a = 0; ; a += 1000) {
    const { data, error } = await run(a, a + 999);
    if (error) return out;
    out.push(...((data || []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
};

/* ---------------------------------------------------------------- shapes */

export interface Line { label: string; cur: number; ly: number; ytd: number; ytdLy: number; pct?: number | null; pctLy?: number | null; kids?: Line[] }
export interface Section { title: string; lines: Line[]; total: Line }
export interface AgeRow { party: string; dr: number; cr: number; b1: number; b2: number; b3: number; b4: number; oldest: string | null }
export interface DepRow { cls: string; label: string; rate: number | null; grossOpen: number; additions: number; deductions: number; grossClose: number; accOpen: number; charge: number; accClose: number; netOpen: number; netClose: number; ledgers: number }
export interface BsRoot { root: string; total: number; groups: { name: string; amount: number }[] }
export interface CashRoot { root: string; total: number; groups: { name: string; amount: number }[] }
export interface LoanRow { name: string; group: string; books: number; statement: number | null; diff: number | null; status: "match" | "mismatch" | "unverified" }
export interface CfoData {
  month: string; monthLabel: string; monthEnd: string; fy: string; fyStart: string; lyMonth: string;
  booksTo: string; vouchers: number; lines: number;
  monthPosted: { purchaseVouchers: number; norm: number; partPosted: boolean };
  /* 1. summary dashboard */
  kpi: { key: string; label: string; value: number | null; unit: "rs" | "%" | "x" | "days"; formula: string; ly?: number | null }[];
  /* 2. detailed P&L */
  pnl: {
    sales: Section; cogs: { opening: Line; purchases: Line; closing: Line; total: Line; stockNote: string };
    manuf: Section; grossProfit: Line; otherIncome: Section;
    indirect: { admin: Section; finance: Section; employee: Section; selling: Section; total: Line };
    depreciation: Line; netProfit: Line;
  };
  /* 3. depreciation schedule */
  dep: { rows: DepRow[]; monthsElapsed: number; posted: number; postedOn: string | null; ratesFrom: "typed" | "missing"; note: string };
  /* 4. monthly P&L, 12 months */
  monthly: { cols: { key: string; label: string }[]; rows: { key: string; label: string; vals: number[]; bold?: boolean }[] };
  /* 5. budget / variance */
  variance: { basis: "budget" | "breakeven"; rows: { key: string; label: string; actual: number; budget: number; py: number }[]; note: string };
  /* 6. balance sheet */
  bs: { sources: BsRoot[]; applications: BsRoot[]; totalS: number; totalA: number; pnlToDate: number; pnlOpening: number };
  /* 7. receipts and payments */
  cash: { opening: { bank: number; cash: number; od: number }; closing: { bank: number; cash: number; od: number }; receipts: CashRoot[]; payments: CashRoot[]; totalIn: number; totalOut: number };
  /* 8-10. ageing and advances */
  debtors: { rows: AgeRow[]; totDr: number; totCr: number; days: number | null; caveat: string | null };
  creditors: { rows: AgeRow[]; totDr: number; totCr: number; days: number | null; caveat: string | null };
  creditorDr: { party: string; amount: number }[];
  /* 11. inventory */
  inventory: { stockAt: string | null; stock: number; days: number | null; byItem: { item: string; amount: number; qty: string }[]; note: string };
  /* 12. working capital cycle */
  wcc: { debtorDays: number | null; inventoryDays: number | null; creditorDays: number | null; cycle: number | null; workingCapital: number };
  /* 13. loans */
  loans: { rows: LoanRow[]; total: number; verified: number; note: string };
  /* the sheet's last two tabs */
  bankReco: { note: string };
}

/* ---------------------------------------------------------------- the world */

async function world(admin: SupabaseClient) {
  const [groups, ledgersAll, vouchersAll, linesAll] = await Promise.all([
    page<RR>((a, b) => admin.from("kuber_group").select("name, parent").range(a, b)),
    page<RR>((a, b) => admin.from("kuber_ledger").select("name, parent, opening, fy").range(a, b)),
    page<RR>((a, b) => admin.from("kuber_voucher").select("id, date, vtype, vno, party, amount").range(a, b)),
    page<RR>((a, b) => admin.from("kuber_voucher_line").select("voucher_id, ledger, amount").range(a, b)),
  ]);
  const ledgers = newestByName(ledgersAll as { name?: unknown; fy?: unknown }[]) as RR[];
  const vouchers = vouchersAll.filter((v) => !isProforma(v.vtype, v.vno));
  const kept = new Set(vouchers.map((v) => S(v.id)));
  const lines = linesAll.filter((l) => kept.has(S(l.voucher_id)));
  const parentOf = new Map(groups.map((g) => [S(g.name).toLowerCase(), S(g.parent)]));
  const properOf = new Map(groups.map((g) => [S(g.name).toLowerCase(), S(g.name)]));
  const rootCache = new Map<string, string>();
  const rootOf = (g: string) => {
    const k = g.toLowerCase();
    if (rootCache.has(k)) return rootCache.get(k)!;
    let cur = k;
    for (let i = 0; i < 25; i++) { const p = (parentOf.get(cur) || "").toLowerCase(); if (!p || p === cur) break; cur = p; }
    const r = properOf.get(cur) || g; rootCache.set(k, r); return r;
  };
  const chainHas = (parent: string, re: RegExp) => {
    let cur = S(parent).toLowerCase();
    for (let i = 0; i < 25; i++) { if (re.test(stripNo(cur))) return true; const p = (parentOf.get(cur) || "").toLowerCase(); if (!p || p === cur) return false; cur = p; }
    return false;
  };
  const vById = new Map(vouchers.map((v) => [S(v.id), v]));
  const dateOf = (id: string) => S(vById.get(id)?.date);
  const ledgerByName = new Map(ledgers.map((l) => [S(l.name), l]));
  const anchorFy = ledgers.reduce((a, r) => { const f = S(r.fy); return f > a ? f : a; }, "");
  const anchor = anchorFy ? `${anchorFy.slice(0, 4)}-04-01` : "";
  return { groups, ledgers, vouchers, lines, rootOf, chainHas, vById, dateOf, ledgerByName, anchor };
}
type World = Awaited<ReturnType<typeof world>>;

/** every ledger's movement inside [a, b] */
function movement(w: World, a: string, b: string) {
  const m = new Map<string, number>();
  for (const l of w.lines) {
    const d = w.dateOf(S(l.voucher_id));
    if (!d || d < a || d > b) continue;
    const n = S(l.ledger);
    m.set(n, (m.get(n) || 0) + (Number(l.amount) || 0));
  }
  return m;
}

/**
 * every ledger's CLOSING as at a date. Tally exported one opening (1 April of
 * the newest year); the walk goes forward to a later date and BACKWARD out
 * of the anchor to an earlier one, so a closing before the anchor is exact.
 */
function closings(w: World, asOf: string) {
  const delta = new Map<string, number>();
  const anchor = w.anchor || asOf;
  for (const l of w.lines) {
    const d = w.dateOf(S(l.voucher_id));
    if (!d) continue;
    const fwd = d >= anchor && d <= asOf, back = d > asOf && d < anchor;
    if (!fwd && !back) continue;
    const n = S(l.ledger);
    delta.set(n, (delta.get(n) || 0) + (Number(l.amount) || 0) * (fwd ? 1 : -1));
  }
  const out = new Map<string, number>();
  for (const l of w.ledgers) out.set(S(l.name), (Number(l.opening) || 0) + (delta.get(S(l.name)) || 0));
  return out;
}

/* ------------------------------------------------ the P&L for one window */

type Ent = { ledger: string; group: string; root: string; amount: number; bucket: Bucket; head: string };
function pnlEntries(w: World, mv: Map<string, number>): Ent[] {
  const out: Ent[] = [];
  for (const l of w.ledgers) {
    const name = S(l.name), grp = S(l.parent);
    if (!grp) continue;
    const amt = mv.get(name) || 0;
    if (!amt) continue;
    const root = w.rootOf(grp);
    const { bucket, rule } = classifyLedger({ ledger: name, group: grp, root, rootN: stripNo(root) });
    if (bucket === "balance") continue;
    const head = bucket === "indirect" || bucket === "finance" ? oeHead(grp, name) : "";
    out.push({ ledger: name, group: grp, root, amount: amt * rule.sign, bucket, head });
  }
  return out;
}
const sum = (xs: { amount: number }[]) => xs.reduce((a, x) => a + x.amount, 0);

/** the sheet's four indirect heads, from the twelve OE heads */
const SHEET_HEAD = (e: Ent): "admin" | "finance" | "employee" | "selling" => {
  if (e.bucket === "finance" || /finance|bank charges/i.test(e.head)) return "finance";
  if (/salar|directors|consultant salaries/i.test(e.head)) return "employee";
  if (/marketing|promotion/i.test(e.head)) return "selling";
  return "admin";
};

function pick(mv: Map<string, number>, w: World) {
  const ents = pnlEntries(w, mv);
  const by = (b: Bucket) => ents.filter((e) => e.bucket === b);
  const ind = [...by("indirect"), ...by("finance")];
  return {
    ents,
    sales: sum(by("sales")), purchases: sum(by("purchases")), manuf: sum(by("manuf")),
    otherIncome: sum(by("otherIncome")), depreciation: sum(by("depreciation")), tax: sum(by("tax")),
    admin: sum(ind.filter((e) => SHEET_HEAD(e) === "admin")),
    finance: sum(ind.filter((e) => SHEET_HEAD(e) === "finance")),
    employee: sum(ind.filter((e) => SHEET_HEAD(e) === "employee")),
    selling: sum(ind.filter((e) => SHEET_HEAD(e) === "selling")),
  };
}
type Pick = ReturnType<typeof pick>;

/* ------------------------------------------------------------- the report */

export async function cfoReportData(admin: SupabaseClient, month: string, today: string): Promise<CfoData> {
  const w = await world(admin);
  const mEnd = monthEnd(month), mStart = `${month}-01`;
  const fyStart = fyStartOf(month), fy = fyLabelOf(month);
  const lyMonth = shiftMonth(month, -12);
  const lyStart = `${lyMonth}-01`, lyEnd = monthEnd(lyMonth), lyFyStart = fyStartOf(lyMonth);
  const booksTo = w.vouchers.reduce((a, v) => { const d = S(v.date); return d > a && d <= today ? d : a; }, "");

  /* the four windows the sheet reads across: this month, the same month last
     year, the year to date, and last year to the same date */
  const P = { cur: pick(movement(w, mStart, mEnd), w), ly: pick(movement(w, lyStart, lyEnd), w),
              ytd: pick(movement(w, fyStart, mEnd), w), ytdLy: pick(movement(w, lyFyStart, lyEnd), w) };

  /* ---- stock, from the dated register ---- */
  const stockRows = await page<{ as_on: string; amount: number }>((a, b) => admin.from("kuber_stock").select("as_on, amount").order("as_on").range(a, b));
  const stockAt = (d: string) => { const r = stockRows.filter((x) => S(x.as_on) <= d).pop(); return r ? { at: S(r.as_on), v: Number(r.amount) || 0 } : null; };
  const stOpen = stockAt(addDays(mStart, -1)), stClose = stockAt(mEnd);
  const stOpenFy = stockAt(addDays(fyStart, -1));
  const stOpenLy = stockAt(addDays(lyStart, -1)), stCloseLy = stockAt(lyEnd), stOpenFyLy = stockAt(addDays(lyFyStart, -1));
  const V = (x: { v: number } | null) => (x ? x.v : 0);
  const stockNote = !stockRows.length ? "No stock valuation is in the register — the cost of sales below is purchases alone and the gross profit is not struck."
    : stClose && stClose.at < mEnd ? `Closing stock is the register's ${stClose.at.split("-").reverse().join("-")} valuation — the latest on or before the month end.`
    : "Opening and closing stock are the register's own month-end valuations.";

  const L = (label: string, f: (p: Pick) => number, base?: (p: Pick) => number): Line => {
    const cur = f(P.cur), ly = f(P.ly), ytd = f(P.ytd), ytdLy = f(P.ytdLy);
    const b = base || ((p) => p.sales);
    return { label, cur, ly, ytd, ytdLy, pct: b(P.ytd) ? (ytd / b(P.ytd)) * 100 : null, pctLy: b(P.ytdLy) ? (ytdLy / b(P.ytdLy)) * 100 : null };
  };
  /* a section: the head's ledgers, each a line, and the head's total */
  const section = (title: string, sel: (e: Ent) => boolean, byGroup = false): Section => {
    const keyOf = (e: Ent) => (byGroup ? e.group : e.ledger);
    const keys = new Set<string>();
    for (const k of ["cur", "ly", "ytd", "ytdLy"] as const) for (const e of P[k].ents) if (sel(e)) keys.add(keyOf(e));
    const val = (p: Pick, k: string) => sum(p.ents.filter((e) => sel(e) && keyOf(e) === k));
    const lines = [...keys].map((k) => L(k, (p) => val(p, k))).sort((a, b) => Math.abs(b.ytd) - Math.abs(a.ytd));
    const total = L(title, (p) => sum(p.ents.filter(sel)));
    return { title, lines, total };
  };

  const cogsTotal = (p: Pick, o: number, c: number) => p.purchases + o - c;
  const cogsLine: Line = {
    label: "Cost of Sales",
    cur: cogsTotal(P.cur, V(stOpen), V(stClose)), ly: cogsTotal(P.ly, V(stOpenLy), V(stCloseLy)),
    ytd: cogsTotal(P.ytd, V(stOpenFy), V(stClose)), ytdLy: cogsTotal(P.ytdLy, V(stOpenFyLy), V(stCloseLy)),
  };
  cogsLine.pct = P.ytd.sales ? (cogsLine.ytd / P.ytd.sales) * 100 : null;
  cogsLine.pctLy = P.ytdLy.sales ? (cogsLine.ytdLy / P.ytdLy.sales) * 100 : null;
  const manufSec = section("Manufacturing Expenses", (e) => e.bucket === "manuf", true);
  const gp: Line = {
    label: "Gross Profit",
    cur: P.cur.sales - cogsLine.cur - P.cur.manuf, ly: P.ly.sales - cogsLine.ly - P.ly.manuf,
    ytd: P.ytd.sales - cogsLine.ytd - P.ytd.manuf, ytdLy: P.ytdLy.sales - cogsLine.ytdLy - P.ytdLy.manuf,
  };
  gp.pct = P.ytd.sales ? (gp.ytd / P.ytd.sales) * 100 : null; gp.pctLy = P.ytdLy.sales ? (gp.ytdLy / P.ytdLy.sales) * 100 : null;
  const indirectSec = (h: "admin" | "finance" | "employee" | "selling", title: string) =>
    section(title, (e) => (e.bucket === "indirect" || e.bucket === "finance") && SHEET_HEAD(e) === h, true);
  const indTotal = L("Indirect Expenses", (p) => p.admin + p.finance + p.employee + p.selling);

  /* ---- depreciation: the schedule Tally never strikes monthly ---- */
  const rates = await page<{ cls: string; label: string; rate: number }>((a, b) => admin.from("kuber_dep_rate").select("cls, label, rate").range(a, b));
  const rateOf = new Map(rates.map((r) => [S(r.cls), Number(r.rate) || 0]));
  const labelOf = new Map(rates.map((r) => [S(r.cls), S(r.label)]));
  const closeNow = closings(w, mEnd);
  const closeFy0 = closings(w, addDays(fyStart, -1));
  const mvFy = movement(w, fyStart, mEnd);
  const clsOf = (grp: string) => { const m = S(grp).match(/^\s*(\d)/); return m ? m[1] : ""; };
  const isAccDep = (name: string, grp: string) => /accumulated dep/i.test(name) || /^\s*\d+a\b/i.test(grp);
  const depMap = new Map<string, DepRow>();
  for (const l of w.ledgers) {
    const name = S(l.name), grp = S(l.parent);
    if (!w.chainHas(grp, /^fixed assets/)) continue;
    const cls = clsOf(grp);
    if (!cls) continue;
    const r = depMap.get(cls) || { cls, label: labelOf.get(cls) || stripNo(grp).replace(/\s*-.*$/, ""), rate: rateOf.get(cls) ?? null,
      grossOpen: 0, additions: 0, deductions: 0, grossClose: 0, accOpen: 0, charge: 0, accClose: 0, netOpen: 0, netClose: 0, ledgers: 0 };
    const o = closeFy0.get(name) || 0, c = closeNow.get(name) || 0, mv = mvFy.get(name) || 0;
    if (isAccDep(name, grp)) { r.accOpen += o; }                    // credit positive
    else {
      r.ledgers += 1;
      r.grossOpen += -o; r.grossClose += -c;                          // an asset is a debit
      if (mv < 0) r.additions += -mv; else r.deductions += mv;
    }
    depMap.set(cls, r);
  }
  const monthsElapsed = Math.max(1, (Number(month.slice(0, 4)) - Number(fyStart.slice(0, 4))) * 12 + (Number(month.slice(5, 7)) - 4) + 1);
  for (const r of depMap.values()) {
    r.netOpen = r.grossOpen - r.accOpen;
    /* WDV: the year's charge on the opening net block, plus the additions
       for the months they have been in, struck pro rata to the month */
    r.charge = r.rate == null ? 0 : ((r.netOpen * r.rate) / 100) * (monthsElapsed / 12) + ((r.additions * r.rate) / 100) * (monthsElapsed / 24);
    r.accClose = r.accOpen + r.charge;
    r.netClose = r.grossClose - r.accClose;
  }
  const depRows = [...depMap.values()].sort((a, b) => a.cls.localeCompare(b.cls));
  const depPostedFy = P.ytd.depreciation;
  const depPostedOn = (() => { let last = ""; for (const l of w.lines) { if (!/^depreciation$/i.test(S(l.ledger))) continue; const d = w.dateOf(S(l.voucher_id)); if (d > last && d <= mEnd) last = d; } return last || null; })();
  const depCharge = depRows.reduce((a, r) => a + r.charge, 0);
  const depMonth = depRows.reduce((a, r) => a + (r.rate == null ? 0 : ((r.netOpen * r.rate) / 100) / 12 + ((r.additions * r.rate) / 100) / 24), 0);

  const depLine: Line = { label: "Depreciation (struck monthly on WDV)", cur: depMonth, ly: depMonth, ytd: depCharge, ytdLy: 0,
    pct: P.ytd.sales ? (depCharge / P.ytd.sales) * 100 : null, pctLy: null };
  const npbt = (p: Pick, g: number, d: number) => g + p.otherIncome - (p.admin + p.finance + p.employee + p.selling) - d;
  const np: Line = { label: "Net Profit", cur: npbt(P.cur, gp.cur, depMonth), ly: npbt(P.ly, gp.ly, P.ly.depreciation), ytd: npbt(P.ytd, gp.ytd, depCharge), ytdLy: npbt(P.ytdLy, gp.ytdLy, P.ytdLy.depreciation) };
  np.pct = P.ytd.sales ? (np.ytd / P.ytd.sales) * 100 : null; np.pctLy = P.ytdLy.sales ? (np.ytdLy / P.ytdLy.sales) * 100 : null;

  /* ---- the twelve months across ---- */
  const cols = Array.from({ length: 12 }, (_, i) => shiftMonth(month, i - 11)).map((k) => ({ key: k, label: monthShort(k) }));
  const perMonth = cols.map((c) => pick(movement(w, `${c.key}-01`, monthEnd(c.key)), w));
  const mRow = (key: string, label: string, f: (p: Pick, i: number) => number, bold?: boolean) => ({ key, label, vals: perMonth.map(f), bold });
  const cogsM = (p: Pick, i: number) => { const k = cols[i].key; return p.purchases + V(stockAt(addDays(`${k}-01`, -1))) - V(stockAt(monthEnd(k))); };
  const gpM = (p: Pick, i: number) => p.sales - cogsM(p, i) - p.manuf;
  const monthly = { cols, rows: [
    mRow("sales", "Sales", (p) => p.sales, true),
    mRow("cogs", "Cost of Sales", cogsM),
    mRow("manuf", "Manufacturing Expenses", (p) => p.manuf),
    mRow("gp", "Gross Profit", gpM, true),
    mRow("oi", "Indirect Incomes", (p) => p.otherIncome),
    mRow("admin", "Administrative Expenses", (p) => p.admin),
    mRow("finance", "Finance Charges", (p) => p.finance),
    mRow("employee", "Employee Benefit Expenses", (p) => p.employee),
    mRow("selling", "Selling & Distribution", (p) => p.selling),
    mRow("dep", "Depreciation (monthly WDV)", () => depMonth),
    mRow("np", "Net Profit", (p, i) => gpM(p, i) + p.otherIncome - (p.admin + p.finance + p.employee + p.selling) - depMonth, true),
  ] };

  /* ---- budget, or break-even when nothing is typed ---- */
  const budget = await page<{ head: string; annual: number }>((a, b) => admin.from("kuber_budget").select("head, annual").eq("fy", fy).range(a, b));
  const bud = new Map(budget.map((r) => [S(r.head), Number(r.annual) || 0]));
  const frac = monthsElapsed / 12;
  const fixedYtd = P.ytd.manuf + P.ytd.admin + P.ytd.finance + P.ytd.employee + P.ytd.selling + depCharge;
  const tpMargin = P.ytd.sales ? (P.ytd.sales - cogsLine.ytd) / P.ytd.sales : 0;
  const breakEvenSales = tpMargin > 0 ? fixedYtd / tpMargin : 0;
  const B = (head: string, actual: number, be: number, py: number) => ({ key: head, label: "", actual, budget: bud.size ? (bud.get(head) || 0) * frac : be, py });
  const scale = breakEvenSales && P.ytd.sales ? breakEvenSales / P.ytd.sales : 1;
  const varianceRows = [
    { ...B("revenue", P.ytd.sales, breakEvenSales, P.ytdLy.sales), label: "Revenue" },
    { ...B("other_income", P.ytd.otherIncome, P.ytd.otherIncome, P.ytdLy.otherIncome), label: "Other Income" },
    { ...B("cogs", cogsLine.ytd, cogsLine.ytd * scale, cogsLine.ytdLy), label: "COGS / RM Consumed" },
    { ...B("manuf", P.ytd.manuf, P.ytd.manuf, P.ytdLy.manuf), label: "Manufacturing Expenses" },
    { ...B("admin", P.ytd.admin, P.ytd.admin, P.ytdLy.admin), label: "Administrative Expenses" },
    { ...B("finance", P.ytd.finance, P.ytd.finance, P.ytdLy.finance), label: "Finance Charges" },
    { ...B("employee", P.ytd.employee, P.ytd.employee, P.ytdLy.employee), label: "Employee Benefit Expenses" },
    { ...B("selling", P.ytd.selling, P.ytd.selling, P.ytdLy.selling), label: "Selling & Distribution" },
    { ...B("depreciation", depCharge, depCharge, P.ytdLy.depreciation), label: "Depreciation" },
  ];
  const variance = {
    basis: (bud.size ? "budget" : "breakeven") as "budget" | "breakeven", rows: varianceRows,
    note: bud.size ? `Budget typed for ${fy}, pro-rated ${monthsElapsed}/12.` :
      `No budget is typed for ${fy}, so the column is BREAK-EVEN struck from the books: the year's fixed costs to date (manufacturing, indirect, depreciation) divided by the throughput margin. Revenue at break-even is what sales would have had to be for the same costs to leave nothing.`,
  };

  /* ---- balance sheet at the month end ---- */
  const isPnlLedger = (name: string, grp: string) => classifyLedger({ ledger: name, group: grp, root: w.rootOf(grp), rootN: stripNo(w.rootOf(grp)) }).bucket !== "balance";
  const bsRoots = new Map<string, { root: string; total: number; groups: Map<string, number> }>();
  let pnlToDate = 0, pnlOpening = 0;
  for (const l of w.ledgers) {
    const name = S(l.name), grp = S(l.parent);
    if (!grp) continue;
    const c = closeNow.get(name) || 0;
    if (isPnlLedger(name, grp)) { pnlToDate += c; pnlOpening += Number(l.opening) || 0; continue; }
    if (!c) continue;
    const root = w.rootOf(grp);
    const r = bsRoots.get(root) || { root, total: 0, groups: new Map() };
    r.total += c; r.groups.set(grp, (r.groups.get(grp) || 0) + c);
    bsRoots.set(root, r);
  }
  const assetSide = (root: string) => /^fixed assets|^investments|^current assets|^misc|^loans & advances \(asset|^deposits \(asset|\(asset\)/i.test(stripNo(root));
  const bsPack = (pred: (root: string) => boolean, sign: 1 | -1) => [...bsRoots.values()].filter((r) => pred(r.root))
    .map((r) => ({ root: r.root, total: r.total * sign, groups: [...r.groups.entries()].map(([name, amount]) => ({ name, amount: amount * sign })).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)) }))
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  const sources = bsPack((r) => !assetSide(r), 1), applications = bsPack(assetSide, -1);
  const totalS = sources.reduce((a, r) => a + r.total, 0) + pnlToDate;
  const totalA = applications.reduce((a, r) => a + r.total, 0);

  /* ---- receipts and payments for the month ---- */
  const isCash = (p: string) => w.chainHas(p, /^bank accounts$|^cash-in-hand$/);
  const isOd = (p: string) => w.chainHas(p, /^bank od/);
  const bankOf = (asOf: string) => {
    const c = closings(w, asOf); let bank = 0, cash = 0, od = 0;
    for (const l of w.ledgers) { const p = S(l.parent), v = c.get(S(l.name)) || 0; if (w.chainHas(p, /^cash-in-hand$/)) cash += v; else if (isCash(p)) bank += v; else if (isOd(p)) od += v; }
    return { bank, cash, od };
  };
  const rec = new Map<string, Map<string, number>>(), pay = new Map<string, Map<string, number>>();
  let totalIn = 0, totalOut = 0;
  for (const v of w.vouchers) {
    const d = S(v.date); if (d < mStart || d > mEnd) continue;
    if (!/^(receipt|payment)$/i.test(S(v.vtype))) continue;
    const vl = w.lines.filter((l) => S(l.voucher_id) === S(v.id));
    for (const l of vl) {
      const p = S(w.ledgerByName.get(S(l.ledger))?.parent);
      if (isCash(p) || isOd(p)) continue;
      const amt = Number(l.amount) || 0; if (!amt) continue;
      const root = w.rootOf(p), grp = p;
      const tgt = amt > 0 ? rec : pay;                    // a credit on the other side is money IN
      const r = tgt.get(root) || new Map(); r.set(grp, (r.get(grp) || 0) + Math.abs(amt)); tgt.set(root, r);
      if (amt > 0) totalIn += amt; else totalOut += -amt;
    }
  }
  const cashPack = (m: Map<string, Map<string, number>>) => [...m.entries()].map(([root, g]) => ({ root, total: [...g.values()].reduce((a, x) => a + x, 0), groups: [...g.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount) })).sort((a, b) => b.total - a.total);

  /* ---- ageing, the sheet's bands, at the month end ---- */
  const bills = await page<{ party: string; bill: string; bill_date: string | null; due_date: string | null; kind: string; amount: number }>((a, b) => admin.from("kuber_bill").select("party, bill, bill_date, due_date, kind, amount").range(a, b));
  const dated = mEnd < today;
  const ageing = (kind: "receivable" | "payable") => {
    const by = new Map<string, AgeRow>();
    for (const b of bills) {
      if (b.kind !== kind || isProformaBill(b.bill)) continue;
      if (dated && b.bill_date && b.bill_date > mEnd) continue;
      const r = by.get(b.party) || { party: b.party, dr: 0, cr: 0, b1: 0, b2: 0, b3: 0, b4: 0, oldest: null };
      const amt = Number(b.amount) || 0;
      if (amt < 0) { r.cr += -amt; by.set(b.party, r); continue; }
      r.dr += amt;
      const age = b.bill_date ? daysBetween(b.bill_date, mEnd) : 999;
      if (age < 60) r.b1 += amt; else if (age < 90) r.b2 += amt; else if (age < 120) r.b3 += amt; else r.b4 += amt;
      if (b.bill_date && (!r.oldest || b.bill_date < r.oldest)) r.oldest = b.bill_date;
      by.set(b.party, r);
    }
    const rows = [...by.values()].sort((a, b) => (b.dr - b.cr) - (a.dr - a.cr));
    return { rows, totDr: rows.reduce((a, r) => a + r.dr, 0), totCr: rows.reduce((a, r) => a + r.cr, 0) };
  };
  const deb = ageing("receivable"), cre = ageing("payable");
  const daysFy = Math.max(1, daysBetween(fyStart, mEnd) + 1);
  const debtorDays = P.ytd.sales ? ((deb.totDr - deb.totCr) / (P.ytd.sales / daysFy)) : null;
  const creditorDays = P.ytd.purchases ? ((cre.totDr - cre.totCr) / (P.ytd.purchases / daysFy)) : null;
  const inventoryDays = cogsLine.ytd > 0 && stClose ? (stClose.v / (cogsLine.ytd / daysFy)) : null;
  const caveat = dated ? "Drawn at a later date than the month: bills settled since have left Tally's bill-wise list, so this ageing covers what was open then AND is still open now." : null;

  /* ---- inventory: what the XML carries, and what it does not ---- */
  const items = await page<{ voucher_id: string; item: string; qty: string; amount: number }>((a, b) => admin.from("kuber_voucher_item").select("voucher_id, item, qty, amount").range(a, b));
  const byItem = new Map<string, { amount: number; qty: string }>();
  for (const it of items) {
    const d = w.dateOf(S(it.voucher_id)); if (!d || d < fyStart || d > mEnd) continue;
    const v = w.vById.get(S(it.voucher_id)); if (!v || !/purchase/i.test(S(v.vtype))) continue;
    const r = byItem.get(S(it.item)) || { amount: 0, qty: "" };
    r.amount += Math.abs(Number(it.amount) || 0); r.qty = S(it.qty) || r.qty;
    byItem.set(S(it.item), r);
  }
  const inventory = {
    stockAt: stClose?.at || null, stock: V(stClose), days: inventoryDays,
    byItem: [...byItem.entries()].map(([item, r]) => ({ item, ...r })).sort((a, b) => b.amount - a.amount).slice(0, 30),
    note: "The sheet's item-wise stock comes from Tally's stock summary, which the XML export does not carry — only the month-end valuation typed in the Stock register does. What is shown by item is the year's PURCHASES, which is the best the books can say about where the inventory went.",
  };

  /* ---- loans: the books against the statement ---- */
  const loanReg = await page<{ bank: string; loan_ac_no: string; outstanding: number; status: string }>((a, b) => admin.from("kuber_loan").select("bank, loan_ac_no, outstanding, status").range(a, b));
  const loanRows: LoanRow[] = [];
  for (const l of w.ledgers) {
    const name = S(l.name), grp = S(l.parent);
    if (!w.chainHas(grp, /loans? \(liability\)|^secured loans?|^unsecured loans?|^bank od/)) continue;
    const books = closeNow.get(name) || 0;
    if (Math.abs(books) < 1) continue;
    const reg = loanReg.find((r) => r.loan_ac_no && name.includes(S(r.loan_ac_no))) || loanReg.find((r) => r.bank && name.toLowerCase().includes(S(r.bank).toLowerCase()));
    const st = reg ? Number(reg.outstanding) || 0 : null;
    const diff = st == null ? null : books - st;
    loanRows.push({ name, group: grp, books, statement: st, diff, status: st == null ? "unverified" : Math.abs(diff!) < 1000 ? "match" : "mismatch" });
  }
  loanRows.sort((a, b) => b.books - a.books);

  /* ---- the part-posted check, so a thin month is marked ---- */
  const purchCount = (k: string) => w.vouchers.filter((v) => /^(purchase|cap-ex purchase|excise purchase import)$/i.test(S(v.vtype)) && S(v.date).slice(0, 7) === k).length;
  const prior = cols.slice(0, 11).map((c) => purchCount(c.key)).filter((n) => n > 0).sort((a, b) => a - b);
  const norm = prior.length ? prior[Math.floor(prior.length / 2)] : 0;
  const thisCount = purchCount(month);

  /* ---- KPIs, the sheet's dashboard, each with its arithmetic ---- */
  const wc = (() => { let ca = 0, cl = 0; for (const r of bsRoots.values()) { const n = stripNo(r.root); if (/^current assets/i.test(n)) ca += -r.total; if (/^current liabilit/i.test(n)) cl += r.total; } return { ca, cl }; })();
  const equity = [...bsRoots.values()].filter((r) => /capital/i.test(stripNo(r.root))).reduce((a, r) => a + r.total, 0) + pnlToDate;
  const debt = loanRows.reduce((a, r) => a + r.books, 0);
  const K = (key: string, label: string, value: number | null, unit: "rs" | "%" | "x" | "days", formula: string, ly?: number | null) => ({ key, label, value: value != null && isFinite(value) ? value : null, unit, formula, ly });
  const kpi = [
    K("revenue", "Revenue (YTD)", P.ytd.sales, "rs", "GST Sales, proformas excluded, 1 April to month end", P.ytdLy.sales),
    K("gm", "Gross Margin (YTD)", gp.ytd, "rs", "revenue − cost of sales − manufacturing", gp.ytdLy),
    K("gm_pct", "Gross Margin %", gp.pct ?? null, "%", "gross margin ÷ revenue", gp.pctLy ?? null),
    K("np", "Net Profit (YTD)", np.ytd, "rs", "after indirect expenses and monthly-struck depreciation", np.ytdLy),
    K("np_pct", "Net Profit %", np.pct ?? null, "%", "net profit ÷ revenue", np.pctLy ?? null),
    K("cogs_ratio", "COGS ratio", P.ytd.sales ? cogsLine.ytd / P.ytd.sales : null, "x", "cost of sales ÷ revenue"),
    K("direct_ratio", "Direct expense ratio", P.ytd.sales ? (cogsLine.ytd + P.ytd.manuf) / P.ytd.sales : null, "x", "(cost of sales + manufacturing) ÷ revenue"),
    K("indirect_ratio", "Indirect expense ratio", P.ytd.sales ? indTotal.ytd / P.ytd.sales : null, "x", "indirect expenses ÷ revenue"),
    K("employee_ratio", "Employee benefit ratio", P.ytd.sales ? P.ytd.employee / P.ytd.sales : null, "x", "employee benefit expenses ÷ revenue"),
    K("debtor_days", "Debtor days", debtorDays, "days", "net debtors ÷ per-day revenue"),
    K("inventory_days", "Inventory days", inventoryDays, "days", "closing stock ÷ per-day cost of sales"),
    K("creditor_days", "Creditor days", creditorDays, "days", "net creditors ÷ per-day purchases"),
    K("wcc", "Working capital cycle", debtorDays != null && inventoryDays != null && creditorDays != null ? debtorDays + inventoryDays - creditorDays : null, "days", "debtor + inventory − creditor days"),
    K("wc", "Working capital", wc.ca - wc.cl, "rs", "current assets − current liabilities, at book closings"),
    K("wc_turn", "Working capital turnover", wc.ca - wc.cl ? P.ytd.sales / (wc.ca - wc.cl) : null, "x", "revenue ÷ working capital"),
    K("inv_turn", "Inventory turnover", stClose?.v ? P.ytd.sales / stClose.v : null, "x", "revenue ÷ closing stock"),
    K("current_ratio", "Current ratio", wc.cl ? wc.ca / wc.cl : null, "x", "current assets ÷ current liabilities"),
    K("quick_ratio", "Quick ratio", wc.cl ? (wc.ca - V(stClose)) / wc.cl : null, "x", "(current assets − stock) ÷ current liabilities"),
    K("de", "Debt / Equity", equity ? debt / equity : null, "x", "loans ÷ (capital + P&L to date)"),
    K("roi", "Return on investment %", equity ? (np.ytd * (365 / daysFy) / equity) * 100 : null, "%", "net profit annualised ÷ equity"),
    K("rowc", "Return on working capital %", wc.ca - wc.cl ? (np.ytd * (365 / daysFy) / (wc.ca - wc.cl)) * 100 : null, "%", "net profit annualised ÷ working capital"),
  ];

  return {
    month, monthLabel: monthLabel(month), monthEnd: mEnd, fy, fyStart, lyMonth,
    booksTo, vouchers: w.vouchers.length, lines: w.lines.length,
    monthPosted: { purchaseVouchers: thisCount, norm, partPosted: norm > 0 && thisCount < norm * 0.4 },
    kpi,
    pnl: {
      sales: section("Sales", (e) => e.bucket === "sales"),
      cogs: { opening: { label: `Opening Stock${stOpen ? ` — ${stOpen.at.split("-").reverse().join("-")}` : ""}`, cur: V(stOpen), ly: V(stOpenLy), ytd: V(stOpenFy), ytdLy: V(stOpenFyLy) },
              purchases: L("Add: Purchases", (p) => p.purchases),
              closing: { label: `Less: Closing Stock${stClose ? ` — ${stClose.at.split("-").reverse().join("-")}` : ""}`, cur: V(stClose), ly: V(stCloseLy), ytd: V(stClose), ytdLy: V(stCloseLy) },
              total: cogsLine, stockNote },
      manuf: manufSec, grossProfit: gp,
      otherIncome: section("Indirect Incomes", (e) => e.bucket === "otherIncome"),
      indirect: { admin: indirectSec("admin", "Administrative Expenses"), finance: indirectSec("finance", "Finance Charges"),
                  employee: indirectSec("employee", "Employee Benefit Expenses"), selling: indirectSec("selling", "Selling & Distribution Expenses"), total: indTotal },
      depreciation: depLine, netProfit: np,
    },
    dep: { rows: depRows, monthsElapsed, posted: depPostedFy, postedOn: depPostedOn, ratesFrom: rates.length ? "typed" : "missing",
      note: rates.length
        ? `Struck on WDV at the rates in the register, ${monthsElapsed} of 12 months. Tally has posted ${depPostedFy ? "one journal" : "nothing"} this year${depPostedOn ? ` (last on ${depPostedOn.split("-").reverse().join("-")})` : ""}; the P&L above uses the monthly figure so no month reads flattered.`
        : "No depreciation rates are typed (migration 0186 seeds them) — the schedule shows the blocks but strikes no charge." },
    monthly, variance,
    bs: { sources, applications, totalS, totalA, pnlToDate, pnlOpening },
    cash: { opening: bankOf(addDays(mStart, -1)), closing: bankOf(mEnd), receipts: cashPack(rec), payments: cashPack(pay), totalIn, totalOut },
    debtors: { ...deb, days: debtorDays, caveat }, creditors: { ...cre, days: creditorDays, caveat },
    creditorDr: cre.rows.filter((r) => r.cr - r.dr > 0).map((r) => ({ party: r.party, amount: r.cr - r.dr })).sort((a, b) => b.amount - a.amount),
    inventory,
    wcc: { debtorDays, inventoryDays, creditorDays, cycle: debtorDays != null && inventoryDays != null && creditorDays != null ? debtorDays + inventoryDays - creditorDays : null, workingCapital: wc.ca - wc.cl },
    loans: { rows: loanRows, total: debt, verified: loanRows.filter((r) => r.status !== "unverified").length,
      note: loanReg.length ? "Statement balances from the Bank Loan Register; a difference over Rs 1,000 reads as a mismatch." : "The Bank Loan Register is empty, so no loan is verified against its statement yet — the books' balance stands alone." },
    bankReco: { note: "The bank statement is not in Genie; the reconciliation tab of the sheet cannot be produced from the XML. Bank Reconciliation is built the day the statement export is named." },
  };
}
