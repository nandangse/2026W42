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
  /** Actual start — the denominator of the per-job OTD %. */
  start_date: string | null;
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
    // Twelve CALENDAR months ending with the current one. Going back 12
    // months from today lands mid-month and so touches 13 months — which is
    // what the monthly table was showing, and what made the average read
    // "over 13 months of data" under a heading saying 12.
    case "m12": return { from: monthStart(monthsBefore(today, 11)), to: today };
    case "all": return { from: earliest || fyStart(today), to: today };
    default: return { from: fyStart(today), to: today };
  }
}

/** Inclusive day count of a range — "how much data is this?" in plain days. */
export function dayCount(from: string, to: string): number {
  return Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 86400000)) + 1;
}

/** Median of a list, 0 when empty. Used to mark the middle on the bar charts. */
export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

// ---------------------------------------------------------------------------
// Per-job delivery performance
// ---------------------------------------------------------------------------

/**
 * Days late against the promise. Negative = early, 0 = on the day.
 *
 *   Delay Days = Actual Delivery Date - OTD Date
 *
 * Null when either date is missing — an unmeasurable job must never read as 0.
 */
export function delayDays(j: DeliveredJob): number | null {
  const promise = j.otd || j.tdd;
  if (!promise || !j.delivered_on) return null;
  return Math.round((Date.parse(j.delivered_on) - Date.parse(promise)) / 86400000);
}

/**
 * Per-job OTD %, as specified by Dr Raghu:
 *
 *   OTD % = (1 - Delay Days / (OTD Date - Actual Start Date)) x 100
 *
 * The denominator is the lead time that was undertaken: from the day the job
 * actually started to the day it was promised. So the slip is charged against
 * the size of the promise, which is the point — 30 days late on a 60-day job
 * is a different failure from 30 days late on a 600-day job.
 *
 * 100% = delivered exactly on the promised date. Above 100 = early. It CAN go
 * negative, and is left negative rather than clamped: a job that took twice
 * its promised lead time should read -100%, not 0%, or the worst cases all
 * flatten into one number.
 *
 * Null when the promise, the delivery or the start date is missing, or when
 * the promised lead time is zero or negative (a job promised before it
 * started tells us nothing about how well it ran).
 */
export function rowOtdPct(j: DeliveredJob): number | null {
  const promise = j.otd || j.tdd;
  const delay = delayDays(j);
  if (delay == null || !promise || !j.start_date) return null;
  const promised = Math.round((Date.parse(promise) - Date.parse(j.start_date)) / 86400000);
  if (promised <= 0) return null;
  return (1 - delay / promised) * 100;
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


/**
 * Period OTD %, aggregated from the per-job formula rather than counted.
 *
 *   per job:  OTD % = (1 - Delay Days / (OTD Date - Actual Start Date)) x 100
 *   period:   the MEAN of that across every job delivered in the window that
 *             can be measured
 *
 * This is deliberately NOT "how many arrived on time". A count answers how
 * often we hit the date; this answers how far off we ran, which is the thing
 * that can be improved. Two jobs a day late and two a year late are the same
 * number under a count, and very different here.
 *
 * The median is carried alongside because the mean is dragged hard by the
 * worst cases — with slips reaching 592 days, one job can move the average
 * several points on its own.
 */
export interface OtdAgg {
  pct: number | null;
  median: number | null;
  measurable: number;
  unjudgeable: number;
  onTimeOrBetter: number;
  worst: number | null;
}

export function otdAggregate(rows: DeliveredJob[], from: string, to: string): OtdAgg {
  const delivered = within(rows, from, to);
  const scored = delivered
    .map((j) => rowOtdPct(j))
    .filter((p): p is number => p != null);
  if (!scored.length)
    return { pct: null, median: null, measurable: 0, unjudgeable: delivered.length, onTimeOrBetter: 0, worst: null };
  return {
    pct: scored.reduce((s, p) => s + p, 0) / scored.length,
    median: median(scored),
    measurable: scored.length,
    unjudgeable: delivered.length - scored.length,
    onTimeOrBetter: scored.filter((p) => p >= 100).length,
    worst: Math.min(...scored),
  };
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
