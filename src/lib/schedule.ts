// Date / schedule / formatting helpers — ported verbatim from V1.9.
// Pure functions shared by the ported UI (and safe on the server). `today()`
// is a function rather than a frozen module constant so server code that lives
// longer than a day still computes the correct value.
import { TRADES, templateFor, type Crew } from "./templates";

export const DAY = 86400000;

export const today = (): string => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
};

export const toISO = (d: Date): string => d.toISOString().slice(0, 10);
export const parseISO = (s: string): Date => new Date(s + "T00:00:00Z");
export const addDays = (iso: string, n: number): string =>
  toISO(new Date(parseISO(iso).getTime() + n * DAY));
export const diffDays = (a: string, b: string): number =>
  Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / DAY);

/**
 * Dates read dd-mm-yyyy across the whole suite. One format, everywhere, so a
 * date is never ambiguous between the app, the ERP and a printed report —
 * 03-04-2026 is 3 April, not 4 March, wherever you see it.
 *
 * fmt() drops the year for compactness inside a table that is already scoped
 * to a period; fmtFull() always carries it.
 */
export const fmt = (iso: string | null): string => {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}-${m}`;
};
export const fmtFull = (iso: string | null): string => {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}-${m}-${y}`;
};
export const lakh = (v: number): string =>
  v >= 10000000
    ? (v / 10000000).toFixed(2) + " Cr"
    : (v / 100000).toFixed(1) + " L";
export const initials = (s: string): string =>
  (s || "?")
    .split(/[._\s]/)
    .map((x) => x[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
export const jobNo = (id: string): string => id.slice(-4);

export interface PlanMilestone {
  name: string;
  days: number;
  preds: number[];
  crew: Crew;
  shift: string;
  offset: number;
  done?: boolean;
  done_on?: string | null;
}
export interface Plan {
  start: string;
  milestones: PlanMilestone[];
}
export interface ScheduledMilestone extends PlanMilestone {
  idx: number;
  start: string;
  end: string;
}

export const newPlan = (job: { start?: string | null; fam: string }): Plan => ({
  start: job.start || today(),
  milestones: templateFor(job.fam).map((m) => ({
    name: m.name,
    days: m.days,
    crew: { ...m.crew },
    offset: m.offset,
    preds: m.pred ? [m.pred] : [],
    shift: "D",
  })),
});

// schedule (multiple predecessors: start = latest pred end + 1)
export function computeSchedule(plan: Plan): ScheduledMilestone[] {
  const rows: ScheduledMilestone[] = [];
  plan.milestones.forEach((m, i) => {
    const preds = (m.preds || []).filter((p) => p > 0 && p <= i);
    let start: string;
    if (preds.length) {
      let latest: string | null = null;
      preds.forEach((p) => {
        const e = rows[p - 1].end;
        if (!latest || e > latest) latest = e;
      });
      start = addDays(latest!, 1);
    } else start = addDays(plan.start, m.offset || 0);
    const end = addDays(start, Math.max(1, m.days) - 1);
    rows.push({ ...m, idx: i + 1, start, end });
  });
  return rows;
}

export const isoWeek = (iso: string): number => {
  const d = parseISO(iso);
  const t = new Date(d);
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - y0.getTime()) / DAY + 1) / 7);
};

export const otdDelay = (j: { otd: string | null; tdd: string | null }): number | null => {
  const T = today();
  return j.otd && j.otd < T && j.tdd && j.tdd > j.otd
    ? diffDays(j.otd, j.tdd)
    : null;
};
export const otdColor = (otd: string | null): string => {
  const T = today();
  return !otd
    ? "#8A94A0"
    : otd < T
      ? "#B3261E"
      : diffDays(T, otd) <= 14
        ? "#D97706"
        : "#0D7A3F";
};
export const planEnd = (s: ScheduledMilestone[]): string =>
  s.reduce((mx, r) => (r.end > mx ? r.end : mx), s[0] ? s[0].end : today());
export const manDays = (m: PlanMilestone): number =>
  TRADES.reduce((sum, t) => sum + (m.crew[t.key] || 0), 0) * Math.max(1, m.days);

export type StyleObj = Record<string, string | number>;
export const dueStyle = (due: string | null): StyleObj => {
  const T = today();
  if (!due) return { background: "#F4F2EC", color: "#5A6672" };
  if (due < T) return { background: "#B3261E", color: "#fff" };
  if (due === T)
    return { background: "#FFFFFF", color: "#22303C", border: "1px solid #22303C" };
  if (due === addDays(T, 1)) return { background: "#F5B32B", color: "#3B2A00" };
  return { background: "#DCE8F5", color: "#1B3A5C" };
};

export const TASK_CATS = [
  "Projects",
  "Production",
  "Quality",
  "Material",
  "Design",
  "Electrical",
  "Hydraulic",
  "Dispatch",
];
/** True for any level above None — what makes a reason compulsory. */
export const escalated = (esc: string | null | undefined): boolean =>
  !!esc && esc !== "None";

export const ESC_LEVELS = [
  "None",
  "L1 — Supervisor",
  "L2 — Leaders",
  "L3 — Management",
];
