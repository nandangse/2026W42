// Required Run Rate — the arithmetic between a financial-year target and what
// has actually been billed.
//
// Kept pure and separate from the two pages that show it (the Job Delivery
// Board and Delivered Jobs) for one reason: the same target must produce the
// same number on both. A card computed twice is a card that disagrees with
// itself the first time one copy is edited.
//
// The rule running through this file: A TOTAL IS NOT A VERDICT. "62 Cr billed
// against a 100 Cr target" says nothing on its own — 62 Cr in April is
// extraordinary and 62 Cr in March is a miss. Every figure here is therefore
// paired with the pace it should have kept by today, so ahead/behind is what
// reads off the page rather than a running total that always looks like
// progress.

import { dayCount, fyStart, fyLabel } from "./delivered";

/** 31 March of the financial year containing `on` — the last day of the FY. */
export function fyEnd(on: string): string {
  const y = Number(fyStart(on).slice(0, 4));
  return `${y + 1}-03-31`;
}

export interface Targets {
  /** Order value to be billed across the whole FY, in rupees. */
  sales: number;
  /** Throughput to be earned across the whole FY, in rupees. */
  throughput: number;
}

/** What has actually been delivered so far this FY, in rupees. */
export interface Actuals {
  sales: number;
  throughput: number;
}

export interface Pace {
  target: number;
  /** Billed so far this financial year. */
  actual: number;
  /**
   * What should have been billed by today: target x (days elapsed / days in
   * the FY). A straight-line pace — it makes no claim about seasonality, only
   * about the calendar, and that is the honest default when nobody has stated
   * a month-by-month plan.
   */
  expected: number;
  /** actual - expected. Negative is behind. */
  variance: number;
  /** actual as a % of the full-year target. */
  pctOfTarget: number | null;
  /** actual as a % of where the pace says we should be. 100 = dead on pace. */
  pctOfPace: number | null;
  /** What is left to bill. Never negative — a target beaten is not a debt. */
  remaining: number;
  /** The rate that clears `remaining` in the days left. Null once the FY ends. */
  perMonth: number | null;
  perDay: number | null;
}

export interface RunRate {
  /** e.g. "FY2026-27". */
  fy: string;
  /** 1 April. */
  from: string;
  /** Today. */
  to: string;
  /** 31 March. */
  end: string;
  /** Days of the FY gone, inclusive of today. 1 on 1 April. */
  elapsed: number;
  /** Days in the whole FY — 365, or 366 when February has 29. */
  total: number;
  /** Days still to run, today excluded. 0 on 31 March. */
  left: number;
  /** `left` expressed in months of the same average length. */
  monthsLeft: number;
  /** Share of the year gone, 0–100. */
  pctElapsed: number;
  sales: Pace;
  throughput: Pace;
}

function pace(target: number, actual: number, elapsed: number, total: number, monthsLeft: number, left: number): Pace {
  const expected = total > 0 ? target * (elapsed / total) : 0;
  const remaining = Math.max(0, target - actual);
  return {
    target,
    actual,
    expected,
    variance: actual - expected,
    pctOfTarget: target > 0 ? (actual / target) * 100 : null,
    // Guarded rather than clamped: on 1 April the expected figure is one day's
    // worth, and dividing by it would print a percentage in the thousands.
    pctOfPace: expected > 0 ? (actual / expected) * 100 : null,
    remaining,
    perMonth: monthsLeft > 0 ? remaining / monthsLeft : null,
    perDay: left > 0 ? remaining / left : null,
  };
}

/**
 * The whole card, from a date, the targets and what has been billed.
 *
 * `on` is normally today. The FY is derived from it, so this needs no
 * configuration on 1 April — it rolls over on its own.
 */
export function runRate(on: string, targets: Targets, actuals: Actuals): RunRate {
  const from = fyStart(on);
  const end = fyEnd(on);
  const total = dayCount(from, end);
  // Inclusive of today, capped at the year: a date past 31 March (an old
  // snapshot, a clock skew) must not report 370 days of a 365-day year.
  const elapsed = Math.min(total, dayCount(from, on));
  const left = Math.max(0, total - elapsed);
  const monthsLeft = total > 0 ? left / (total / 12) : 0;

  return {
    fy: fyLabel(on),
    from,
    to: on,
    end,
    elapsed,
    total,
    left,
    monthsLeft,
    pctElapsed: total > 0 ? (elapsed / total) * 100 : 0,
    sales: pace(targets.sales, actuals.sales, elapsed, total, monthsLeft, left),
    throughput: pace(targets.throughput, actuals.throughput, elapsed, total, monthsLeft, left),
  };
}
