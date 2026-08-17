// Delivered Jobs — the period arithmetic behind the analysis workspace.
//
// Kept as pure functions on purpose: every number on that page is an average
// or a share, and averages are exactly where a dashboard quietly lies. Two
// rules run through the whole file:
//
//   1. AN UNDATED DELIVERY IS NOT A ZERO. Rows banked without a delivery date
//      (the report's date column was renamed, or the job predates the column)
//      are excluded from every period and counted separately, so a total that
//      omits them says so rather than reading low.
//
//   2. NEVER DIVIDE BY MONTHS THAT DON'T EXIST. The ledger reaches back to
//      2014, but thinly — 2,728 delivered jobs of which only 1,236 carry a
//      date, and exactly one of those is in 2014. Any window can therefore be
//      wider than the data behind it, and dividing by the months asked for
//      rather than the months held reads as a collapse in output that never
//      happened. coveredMonths() is what stops that, and the UI says
//      "insufficient history" instead of printing the number.

/** The financial year runs 1 April → 31 March. */
export const FY_START_MONTH = 4;

export interface DeliveredJob {
  id: string;
  tag: string;
  fam: string;
  cust: string;
  val: number;
  delivered_on: string | null;
  date_source: string | null;
  tdd: string | null;
  otd: string | null;
  proj: string;
  stat: string;
  own: string;
  /**
   * The two throughput columns, because the two exports carry different ones.
   *
   * The IN-PROGRESS file has "Throughput Expected Value (Auto)" (-> tpv) and
   * leaves the plain "Throughput" column at 0. The DELIVERED export is the
   * other way round: no Auto column at all, and "Throughput" (-> tp) filled on
   * 705 of 2,728 rows, totalling about 160 Cr. Reading only tpv would have
   * shown a flat zero for every delivery ever made.
   *
   * Use throughputOf(), never either field directly.
   */
  tp: number;
  tpv: number;
  tpp: number;
}

/** Whichever throughput column this row actually carries. */
export const throughputOf = (j: Pick<DeliveredJob, "tp" | "tpv">): number =>
  Number(j.tpv) || Number(j.tp) || 0;

export type PeriodKey = "mtd" | "qtd" | "ytd" | "m12" | "all" | "custom";

export const PERIODS: { key: PeriodKey; label: string; note: string }[] = [
  { key: "mtd", label: "MTD", note: "This month so far" },
  { key: "qtd", label: "QTD", note: "This financial quarter so far" },
  { key: "ytd", label: "YTD", note: "Since 1 April" },
  { key: "m12", label: "12 Months", note: "The last 12 months" },
  { key: "all", label: "All", note: "Every delivery on record" },
];

// ---------------------------------------------------------------------------
// Dates. All ISO yyyy-mm-dd, all UTC — the rest of the suite works this way.
// ---------------------------------------------------------------------------
const iso = (d: Date) => d.toISOString().slice(0, 10);
const parse = (s: string) => new Date(s + "T00:00:00Z");

/** 1 April of the financial year containing `on`. */
export function fyStart(on: string): string {
  const d = parse(on);
  const y = d.getUTCFullYear();
  const startYear = d.getUTCMonth() + 1 >= FY_START_MONTH ? y : y - 1;
  return `${startYear}-04-01`;
}

/** e.g. "FY2026-27" — the label the rest of the suite uses. */
export function fyLabel(on: string): string {
  const y = Number(fyStart(on).slice(0, 4));
  return `FY${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

/**
 * 1st of the current financial quarter. Q1 Apr–Jun, Q2 Jul–Sep, Q3 Oct–Dec,
 * Q4 Jan–Mar — the Indian financial year, not the calendar one.
 */
export function fqStart(on: string): string {
  const d = parse(on);
  const m = d.getUTCMonth(); // 0-based
  // months since April, wrapping January–March onto the previous year
  const sinceApril = (m - 3 + 12) % 12;
  const qStartMonth = m - (sinceApril % 3);
  const dd = new Date(Date.UTC(d.getUTCFullYear(), qStartMonth, 1));
  return iso(dd);
}

export function fqLabel(on: string): string {
  const m = parse(on).getUTCMonth();
  return `Q${Math.floor(((m - 3 + 12) % 12) / 3) + 1}`;
}

export const monthStart = (on: string) => on.slice(0, 7) + "-01";

/** `back` whole months before `on`, e.g. 12 months back from 2026-08-17. */
export function monthsBefore(on: string, back: number): string {
  const d = parse(on);
  const dd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - back, d.getUTCDate()));
  return iso(dd);
}

/** The from/to a shortcut resolves to. `all` reaches back to the first row. */
export function rangeFor(key: PeriodKey, today: string, earliest: string | null): { from: string; to: string } {
  switch (key) {
    case "mtd": return { from: monthStart(today), to: today };
    case "qtd": return { from: fqStart(today), to: today };
    case "ytd": return { from: fyStart(today), to: today };
    case "m12": return { from: monthsBefore(today, 12), to: today };
    case "all": return { from: earliest || fyStart(today), to: today };
    default: return { from: fyStart(today), to: today };
  }
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------
export interface Totals {
  nos: number;
  value: number;
  throughput: number;
}

const zero = (): Totals => ({ nos: 0, value: 0, throughput: 0 });

export const inRange = (j: DeliveredJob, from: string, to: string): boolean =>
  !!j.delivered_on && j.delivered_on >= from && j.delivered_on <= to;

export function totalsOf(rows: DeliveredJob[]): Totals {
  const t = zero();
  for (const r of rows) {
    t.nos += 1;
    t.value += Number(r.val) || 0;
    t.throughput += throughputOf(r);
  }
  return t;
}

export const dated = (rows: DeliveredJob[]) => rows.filter((r) => !!r.delivered_on);
export const undated = (rows: DeliveredJob[]) => rows.filter((r) => !r.delivered_on);

export const within = (rows: DeliveredJob[], from: string, to: string) =>
  rows.filter((r) => inRange(r, from, to));

/** Earliest / latest dated delivery on record. */
export function span(rows: DeliveredJob[]): { earliest: string | null; latest: string | null } {
  const ds = dated(rows).map((r) => r.delivered_on as string).sort();
  return { earliest: ds[0] ?? null, latest: ds[ds.length - 1] ?? null };
}

/**
 * How many months of data actually sit behind a window — the denominator that
 * keeps an average honest.
 *
 * Counts calendar months from the later of (window start, first delivery on
 * record) to the window end, inclusive. A window that starts before Genie held
 * any data does NOT get credit for those empty months: dividing by them would
 * report a fall in output that never happened.
 */
export function coveredMonths(from: string, to: string, earliest: string | null): number {
  const start = earliest && earliest > from ? earliest : from;
  if (start > to) return 0;
  const a = parse(start);
  const b = parse(to);
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) + 1;
}

export interface Average {
  /** Total ÷ months actually covered, or null when there is nothing to divide. */
  perMonth: Totals | null;
  /** Months of real data behind the number. */
  months: number;
  /** Months the window asked for. */
  asked: number;
  /** True when the data does not span what was asked — the UI must say so. */
  insufficient: boolean;
}

export function averagePerMonth(
  rows: DeliveredJob[],
  from: string,
  to: string,
  earliest: string | null,
  askedMonths: number,
): Average {
  const months = coveredMonths(from, to, earliest);
  const t = totalsOf(within(rows, from, to));
  if (months <= 0) return { perMonth: null, months: 0, asked: askedMonths, insufficient: true };
  return {
    perMonth: { nos: t.nos / months, value: t.value / months, throughput: t.throughput / months },
    months,
    asked: askedMonths,
    // one month's slack: a window is "covered" if the data reaches all but the
    // current, still-running month
    insufficient: months < askedMonths - 1,
  };
}

// ---------------------------------------------------------------------------
// Cuts
// ---------------------------------------------------------------------------
export interface Bucket extends Totals {
  key: string;
  label: string;
}

/** One bucket per calendar month across the window, including empty months. */
export function byMonth(rows: DeliveredJob[], from: string, to: string): Bucket[] {
  const out: Bucket[] = [];
  const start = parse(monthStart(from));
  const end = parse(monthStart(to));
  const seen = new Map<string, Totals>();
  for (const r of within(rows, from, to)) {
    const k = (r.delivered_on as string).slice(0, 7);
    const t = seen.get(k) || zero();
    t.nos += 1;
    t.value += Number(r.val) || 0;
    t.throughput += throughputOf(r);
    seen.set(k, t);
  }
  const cur = new Date(start.getTime());
  // a month with no deliveries is a fact worth showing, so empty months are
  // emitted rather than skipped
  while (cur <= end && out.length < 240) {
    const k = iso(cur).slice(0, 7);
    const t = seen.get(k) || zero();
    out.push({
      key: k,
      label: cur.toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" }),
      ...t,
    });
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return out;
}

/** One bucket per product family, biggest first. */
export function byFamily(rows: DeliveredJob[], from: string, to: string): Bucket[] {
  const seen = new Map<string, Totals>();
  for (const r of within(rows, from, to)) {
    const k = r.fam?.trim() || "Unclassified";
    const t = seen.get(k) || zero();
    t.nos += 1;
    t.value += Number(r.val) || 0;
    t.throughput += throughputOf(r);
    seen.set(k, t);
  }
  return [...seen.entries()]
    .map(([key, t]) => ({ key, label: key, ...t }))
    .sort((a, b) => b.value - a.value || b.nos - a.nos);
}

/** One bucket per customer, biggest first. */
export function byCustomer(rows: DeliveredJob[], from: string, to: string): Bucket[] {
  const seen = new Map<string, Totals>();
  for (const r of within(rows, from, to)) {
    const k = r.cust?.trim() || "Unknown";
    const t = seen.get(k) || zero();
    t.nos += 1;
    t.value += Number(r.val) || 0;
    t.throughput += throughputOf(r);
    seen.set(k, t);
  }
  return [...seen.entries()]
    .map(([key, t]) => ({ key, label: key, ...t }))
    .sort((a, b) => b.value - a.value || b.nos - a.nos);
}

/**
 * Delivered against the target date it carried at the end.
 * Only rows holding both dates can answer this, so the count is returned too —
 * "62% on time" over 8 of 300 jobs is not a statistic.
 */
export function onTime(rows: DeliveredJob[], from: string, to: string): { onTime: number; measurable: number; pct: number | null } {
  const m = within(rows, from, to).filter((r) => r.tdd && r.delivered_on);
  const ok = m.filter((r) => (r.delivered_on as string) <= (r.tdd as string)).length;
  return { onTime: ok, measurable: m.length, pct: m.length ? (ok / m.length) * 100 : null };
}

/** Which promise a job is being judged against. */
export type OtdBasis = "otd" | "tdd";

export interface Otd {
  /** Delivered on or before the promise. */
  onTime: number;
  /** Delivered after it. */
  late: number;
  /** Jobs carrying BOTH a promise and a delivery date — the denominator. */
  measurable: number;
  /** Delivered in the period but with no promise date to judge against. */
  unjudgeable: number;
  pct: number | null;
  /** Mean days late across the late ones — how badly, not just how often. */
  avgDaysLate: number | null;
  basis: OtdBasis;
}

const days = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);

/**
 * On-Time Delivery for a period.
 *
 *   OTD% = jobs delivered on or before their promised date
 *          ÷ jobs delivered in the period that carry a promised date
 *
 * The promise is the OTD Date — the commitment given to the customer — with
 * the Committed Delivery Date as the fallback where OTD Date is blank.
 *
 * A job with no promise date is NOT counted as late. It is reported separately
 * as unjudgeable, because scoring an unmeasurable job as a miss would drag the
 * figure down for a record-keeping gap rather than a delivery failure. This
 * matters here more than usual: only 305 of 2,728 rows carry an OTD Date.
 */
export function otdFor(rows: DeliveredJob[], from: string, to: string, basis: OtdBasis = "otd"): Otd {
  const delivered = within(rows, from, to);
  const promiseOf = (r: DeliveredJob) => (basis === "otd" ? r.otd || r.tdd : r.tdd || r.otd);

  const m = delivered.filter((r) => promiseOf(r));
  const late = m.filter((r) => (r.delivered_on as string) > (promiseOf(r) as string));
  const ok = m.length - late.length;
  const slip = late.map((r) => days(r.delivered_on as string, promiseOf(r) as string));

  return {
    onTime: ok,
    late: late.length,
    measurable: m.length,
    unjudgeable: delivered.length - m.length,
    pct: m.length ? (ok / m.length) * 100 : null,
    avgDaysLate: slip.length ? Math.round(slip.reduce((s, d) => s + d, 0) / slip.length) : null,
    basis,
  };
}
