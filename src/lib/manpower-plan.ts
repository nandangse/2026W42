import { TRADES } from "./templates";

/**
 * Manpower planning — the vocabulary, kept out of the route and the screen so
 * both agree on every rule.
 */

/**
 * A PERSON'S TRADE, READ OFF THEIR DESIGNATION (Dr Raghu, 28 Sep 2026: "trade
 * comes from the designation where it maps ... this will also ensure we put
 * properly").
 *
 * The designations are already clean: "Prod - Fitter", "Prod - Helper",
 * "Prod - Hydraulic Technician". So this is a reading, not a guess — and
 * where it does not read, it returns nothing rather than picking the nearest
 * trade. A supervisor filed as a welder is a wrong man-day in somebody's
 * costing, and "unset" is the honest answer that makes the gap visible.
 */
const TRADE_WORDS: { has: RegExp; trade: string }[] = [
  { has: /hydraulic/i, trade: "hydraulic" },
  { has: /electric/i, trade: "electrician" },
  { has: /paint/i, trade: "painter" },
  { has: /weld/i, trade: "welder" },
  { has: /fitter|turner|machinist/i, trade: "fitter" },
  { has: /helper|khalasi/i, trade: "helper" },
];

export function tradeOf(designation: string | null | undefined): string | null {
  const d = String(designation || "");
  if (!d.trim()) return null;
  /* Supervisors and managers are not a trade. Checked first, because
     "Production Supervisor" contains none of the trade words and
     "Painting Foreman" contains one. */
  if (/supervisor|manager|head|engineer|executive|officer|director|president/i.test(d)
      && !/foreman/i.test(d)) return null;
  for (const t of TRADE_WORDS) if (t.has.test(d)) return t.trade;
  return null;
}

export const TRADE_BY_KEY = Object.fromEntries(TRADES.map((t) => [t.key, t]));

export interface Assignment {
  id: string; job_id: string; day: string;
  emp_id: string; emp_name: string; trade: string | null;
  note: string | null;
  /** rollover@genie when the day's carry put them here, not a person (6 Oct 2026) */
  noted_by?: string | null;
}
export interface Person {
  id: string; name: string; designation: string | null; department: string | null;
  trade: string | null;
}

/**
 * HOW MUCH OF A DAY EACH ASSIGNMENT IS WORTH (Dr Raghu, 28 Sep 2026: "if he
 * is in two jobs, show red and add half to tally").
 *
 * A man is one man. Put him on two jobs and each job may claim half of him,
 * or the day quietly becomes two man-days and every costing downstream is
 * inflated by however sloppy the planning was.
 *
 * It divides by however many jobs he is on, so three jobs is a third each —
 * the rule is "one man, one day", not "two is the most it can be".
 */
export function shareOf(assignments: Assignment[], day: string, empId: string): number {
  const n = assignments.filter((a) => a.day === day && a.emp_id === empId).length;
  return n > 0 ? 1 / n : 0;
}

/** Everybody who is on more than one job that day. */
export function doubleBooked(assignments: Assignment[], day: string): Set<string> {
  const count = new Map<string, number>();
  for (const a of assignments) {
    if (a.day !== day) continue;
    count.set(a.emp_id, (count.get(a.emp_id) || 0) + 1);
  }
  return new Set([...count.entries()].filter(([, n]) => n > 1).map(([id]) => id));
}

/** Man-days on a job on a day, counting a shared man as his fraction. */
export function manDaysOn(assignments: Assignment[], jobId: string, day: string): number {
  return assignments
    .filter((a) => a.job_id === jobId && a.day === day)
    .reduce((n, a) => n + shareOf(assignments, day, a.emp_id), 0);
}

/** "2.5" but "2" — a fraction only when there is one. */
export const tidy = (n: number) => (Math.abs(n - Math.round(n)) < 0.01 ? String(Math.round(n)) : n.toFixed(1));
