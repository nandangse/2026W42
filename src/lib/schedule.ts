// Date / schedule / formatting helpers — ported verbatim from V1.9.
// Pure functions shared by the ported UI (and safe on the server). `today()`
// is a function rather than a frozen module constant so server code that lives
// longer than a day still computes the correct value.
import { TRADES, templateFor, type Crew } from "./templates";

export const DAY = 86400000;

export const today = (): string => {
  // pinned to IST, not the machine's clock — a Vercel server lives on UTC
  // and would otherwise say yesterday until 5:30 am (Dr Raghu, 29 Aug 2026:
  // every timing in Genie speaks IST)
  return new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
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
/** Every timing in Genie speaks IST (Dr Raghu, 29 Aug 2026). A full
 *  timestamp that carries its zone is shifted to IST before the date is
 *  read — a 00:30 IST save must not wear yesterday's UTC date. A bare
 *  calendar date passes through untouched. */
const istDay = (iso: string): string => {
  if (iso.length > 10 && /[zZ]$|[+-]\d\d:?\d\d$/.test(iso)) {
    const t = new Date(iso);
    if (!isNaN(t.getTime())) return new Date(t.getTime() + 330 * 60000).toISOString().slice(0, 10);
  }
  return iso.slice(0, 10);
};
export const fmt = (iso: string | null): string => {
  if (!iso) return "—";
  const [y, m, d] = istDay(iso).split("-");
  return `${d}-${m}`;
};
export const fmtFull = (iso: string | null): string => {
  if (!iso) return "—";
  const [y, m, d] = istDay(iso).split("-");
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
/** the last four of a job id — and "—" for a task that has no job (a dump line, a goal task), instead of a crash (8 Oct 2026: the Escalations tab died on one) */
export const jobNo = (id: string | null | undefined): string => (id ? String(id).slice(-4) : "—");

/**
 * Two or three characters for whoever is carrying something.
 *
 * initials() takes the first letter of each word, which is right for "Mukesh
 * Tiwari" and wrong for everything else: it turns "MT" into "M" and "anils"
 * into "A". A one-letter tag on a calendar chip identifies nobody in a company
 * with two Anils.
 *
 *   Mukesh Tiwari -> MT     MT    -> MT
 *   mukesh.tiwari -> MT     anils -> ANI
 */
export const whoTag = (s: string | null | undefined): string => {
  const raw = String(s || "").trim();
  if (!raw) return "—";
  // An email is tagged by its LOCAL part alone. Splitting the whole address
  // used to spell raghu@nandan.co.in as "RCI" — R from raghu, C and I from
  // co.in — which named nobody (Dr Raghu caught his own comment wearing it).
  const base = raw.includes("@") ? raw.split("@")[0] : raw;
  const parts = base.split(/[._\s-]+/).filter(Boolean);
  if (parts.length > 1) return parts.map((p) => p[0]).join("").slice(0, 3).toUpperCase();
  // one word: a short one is already a handle, a long one gets its first three
  return (parts[0].length <= 4 ? parts[0] : parts[0].slice(0, 3)).toUpperCase();
};

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

/**
 * A pastel per task category, plus the ink to write on it.
 *
 * Pastel on purpose. The chips are what a month of the calendar is MADE of,
 * and eight saturated blocks per day is a stained-glass window nobody can read
 * a job number off. The colour says what KIND of work it is; lateness is said
 * separately, by the job number going red, so a late Quality job still reads
 * as quality work rather than becoming one more identical red box.
 */
export const CAT_COLOUR: Record<string, { bg: string; ink: string; edge: string }> = {
  Projects:   { bg: "#E7EDF6", ink: "#1B3A5C", edge: "#B9CBE2" },
  Production: { bg: "#FDEBDD", ink: "#8A3D00", edge: "#F2C9A6" },
  Quality:    { bg: "#E4F2E8", ink: "#0D5A32", edge: "#B6DCC4" },
  Material:   { bg: "#F5E9F7", ink: "#6B2C77", edge: "#DFC3E5" },
  Design:     { bg: "#E6F1F4", ink: "#0B5563", edge: "#B8D9E0" },
  Electrical: { bg: "#FBF0D8", ink: "#7A5600", edge: "#EBD69B" },
  Hydraulic:  { bg: "#E9ECF7", ink: "#2E3B7A", edge: "#C2C9E6" },
  Dispatch:   { bg: "#FCE7E7", ink: "#8A2020", edge: "#EFC2C2" },
};

/** The pastel for a category, falling back to a neutral for anything unlisted. */
export const catColour = (cat: string | null | undefined) =>
  CAT_COLOUR[String(cat || "").trim()] ?? { bg: "#EFEDE7", ink: "#5A6672", edge: "#DAD7CF" };

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

/**
 * Good Morning / Afternoon / Evening / Night, by the clock in India.
 *
 * Pinned to Asia/Kolkata rather than the browser: the boards are read from
 * the shop floor, and a laptop left on UTC should not wish someone good
 * morning at nine at night.
 */
export const greeting = (now: Date = new Date()): string => {
  const h = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }).format(now),
  );
  if (h < 12) return "Good Morning";
  if (h < 17) return "Good Afternoon";
  if (h < 21) return "Good Evening";
  return "Good Night";
};

export const ESC_LEVELS = [
  "None",
  "L1 — Supervisor",
  "L2 — Leaders",
  "L3 — Management",
];
