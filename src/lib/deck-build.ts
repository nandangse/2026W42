/**
 * The review deck's arithmetic, kept away from both the database and the HTML.
 *
 * Pure on purpose: it takes the rows and returns the finished `Deck`. That is
 * what lets the deck be checked without a server and without a session — the
 * QA script in scratchpad/deck fetches the same rows and calls this same
 * function, so what is verified is what ships rather than a second copy of it.
 *
 * The arithmetic for the year itself is NOT done here. Targets, pace, variance
 * and the required run rate all come from runRate(), the function behind the
 * cards on the Job Delivery Board. A deck that quietly disagreed with the app
 * it was made from would be worse than no deck at all.
 */
import { throughputOf } from "./delivered";
import { runRate, fyEnd } from "./run-rate";
import { fyStart, fyLabel } from "./delivered";
import { jobNo, escalated } from "./schedule";
import type { Deck, DeckJob, DeckTask, MonthRow, FamRow } from "./deck";

const CR = 1e7;
const cr = (n: number) => +(n / CR).toFixed(2);
const num = (v: unknown) => Number(v) || 0;
const monthOf = (d: string) => d.slice(0, 7);

/** The family this report looks at in detail. Matched loosely on purpose. */
export const FOCUS = { name: "Hi Lifts", match: /hi\s*lift/i };

/** How many families the chart shows before it starts naming a remainder. */
const FAMS_SHOWN = 13;

/**
 * Tasks people have typed to try the thing out. They are real rows and they
 * belong on the board; they do not belong in front of a room.
 */
const JUNK = /^(test|testing|xxx+|asdf|abc|fill this up|dummy|check)\b/i;

/**
 * The escalation LEVEL of a task — "L1" / "L2" / "L3" — or null.
 *
 * Two traps in one column, and the deck hits both. It holds the full label the
 * ERP shows ("L2 — Production Head"), so grouping on it raw produces a legend
 * of five headings instead of three levels; and it holds the literal string
 * "None" rather than a null, so a plain truthy test counts every unescalated
 * task as escalated — which turns 21 into 41.
 *
 * escalated() in schedule.ts is the answer to "is it escalated at all" and is
 * what the boards use. This narrows that to which level, for counting.
 */
export function escOf(v: string | null | undefined): "L1" | "L2" | "L3" | null {
  if (!escalated(v)) return null;
  const m = /^L([123])\b/i.exec(String(v).trim());
  return m ? (`L${m[1]}` as "L1" | "L2" | "L3") : null;
}

export interface JobRow {
  id: string; tag: string | null; cust: string | null; fam: string | null;
  val: number | null; tp: number | null; tpv: number | null;
  kit: number | null; pct: number | null; tdd: string | null;
  active: boolean | null; escalation: string | null;
}
export interface TaskRow {
  job_id: string | null; title: string | null; who: string | null;
  due: string | null; cat: string | null; esc: string | null; done: boolean | null;
}
export interface DelRow {
  delivered_on: string | null; val: number | null; tp: number | null; tpv: number | null; fam: string | null;
}

export interface DeckInput {
  /** Today, ISO. The report is dated from this and the FY derived from it. */
  on: string;
  /** Every job, active and not — the inactive ones are simply filtered out. */
  jobs: JobRow[];
  /** Deliveries dated inside this financial year. */
  dels: DelRow[];
  /** Open tasks, ERP and manual together. */
  tasks: TaskRow[];
  targets: { sales: number; throughput: number };
}

const tpOf = (j: { tp: number | null; tpv: number | null }) =>
  throughputOf({ tp: num(j.tp), tpv: num(j.tpv) });

/** Job descriptions run long; the column does not. */
const cutTag = (s: string) => (s.length > 46 ? s.slice(0, 45) + "…" : s);

export function buildDeck(I: DeckInput): Deck {
  const T = I.on;
  const from = fyStart(T);
  const end = fyEnd(T);
  const fy = fyLabel(T);

  const jobs = I.jobs.filter((j) => j.active);
  const dels = I.dels.filter((d) => d.delivered_on && d.delivered_on >= from && d.delivered_on <= T);
  const tasks = I.tasks.filter((t) => !t.done && t.title && !JUNK.test(t.title.trim()));

  // ---- the year, from the same function the app's own cards use ----
  const actuals = dels.reduce(
    (a, r) => ({ sales: a.sales + num(r.val), throughput: a.throughput + tpOf(r) }),
    { sales: 0, throughput: 0 },
  );
  const R = runRate(T, I.targets, actuals);

  // ---- delivered, month by month ----
  const doneBy = new Map<string, MonthRow>();
  for (const r of dels) {
    const k = monthOf(r.delivered_on as string);
    const m = doneBy.get(k) || { k, n: 0, v: 0, t: 0 };
    m.n += 1; m.v += num(r.val); m.t += tpOf(r);
    doneBy.set(k, m);
  }
  const done = [...doneBy.values()].sort((a, b) => a.k.localeCompare(b.k)).map((m) => ({ ...m, v: cr(m.v), t: cr(m.t) }));

  // ---- the order book ----
  const book = jobs.reduce(
    (a, j) => ({ sales: a.sales + num(j.val), tp: a.tp + tpOf(j), n: a.n + 1 }),
    { sales: 0, tp: 0, n: 0 },
  );
  const monthsBy = new Map<string, MonthRow>();
  for (const j of jobs) {
    if (!j.tdd) continue;   // a job with no date belongs to no month; it is not month zero
    const k = monthOf(j.tdd);
    const m = monthsBy.get(k) || { k, n: 0, v: 0, t: 0 };
    m.n += 1; m.v += num(j.val); m.t += tpOf(j);
    monthsBy.set(k, m);
  }
  const months = [...monthsBy.values()].sort((a, b) => a.k.localeCompare(b.k)).map((m) => ({ ...m, v: cr(m.v), t: cr(m.t) }));

  // What the year finishes at if every dated job lands: delivered, plus the
  // book that falls inside this FY. Jobs dated past 31 March are somebody
  // else's year and are left out rather than quietly inflating this one.
  const inFy = jobs.filter((j) => j.tdd && j.tdd <= end);
  const anticipated = {
    sales: cr(actuals.sales + inFy.reduce((s, j) => s + num(j.val), 0)),
    tp: cr(actuals.throughput + inFy.reduce((s, j) => s + tpOf(j), 0)),
  };

  // ---- product families ----
  const famBy = new Map<string, FamRow>();
  for (const j of jobs) {
    const f = (j.fam || "Unclassified").trim();
    const row = famBy.get(f) || { f, n: 0, v: 0, t: 0 };
    row.n += 1; row.v += num(j.val); row.t += tpOf(j);
    famBy.set(f, row);
  }
  const famAll = [...famBy.values()].sort((a, b) => b.t - a.t).map((f) => ({ ...f, v: cr(f.v), t: cr(f.t) }));
  const famTotal = famAll.reduce((s, f) => s + f.t, 0);
  // How many families it takes to reach four-fifths — counted, not asserted.
  let run = 0, famTop = 0;
  for (const f of famAll) { run += f.t; famTop += 1; if (run >= famTotal * 0.8) break; }
  const fams = famAll.slice(0, FAMS_SHOWN);
  const famRest = famAll.slice(FAMS_SHOWN).reduce((a, f) => ({ n: a.n + f.n, t: +(a.t + f.t).toFixed(2) }), { n: 0, t: 0 });

  // ---- open tasks, by job ----
  const openBy = new Map<string, TaskRow[]>();
  for (const t of tasks) {
    if (!t.job_id) continue;
    const k = jobNo(t.job_id);
    openBy.set(k, [...(openBy.get(k) || []), t]);
  }
  const asTask = (t: TaskRow): DeckTask => ({
    job: jobNo(t.job_id || ""),
    // ERP categories arrive numbered ("2610 · BOM release"); the number is
    // meaningful in the ERP and noise on a slide.
    cat: (t.cat || "—").replace(/^\d+\s*·?\s*/, "").trim() || "—",
    who: t.who || "unassigned",
    due: t.due,
    esc: escOf(t.esc),
    lvl: escOf(t.esc) || "",
    title: (t.title || "").trim(),
  });
  const byDue = (a: DeckTask, b: DeckTask) => String(a.due || "9999").localeCompare(String(b.due || "9999"));

  const toJob = (j: JobRow): DeckJob => ({
    id: jobNo(j.id),
    tag: (j.tag || "").trim(),
    cust: (j.cust || "").trim(),
    kit: Math.round(num(j.kit)),
    pct: Math.round(num(j.pct)),
    val: cr(num(j.val)),
    tp: cr(tpOf(j)),
    tdd: j.tdd,
    esc: !!(j.escalation && j.escalation.trim()),
    tasks: (openBy.get(jobNo(j.id)) || []).length,
  });

  // ---- the two piles: nearly out, and bought but not moving ----
  //
  // Totalled from the rupee figures and rounded once at the end. Rounding each
  // job to two decimals first and adding those up drifts by a lakh or two
  // across twenty jobs, and a deck that disagrees with the board by a lakh is
  // a deck somebody has to reconcile.
  const readyRows = jobs.filter((j) => num(j.kit) >= 60 && num(j.pct) >= 60);
  const stuckRows = jobs.filter((j) => num(j.kit) >= 60 && num(j.pct) < 40);
  const sumTp = (rows: JobRow[]) => cr(rows.reduce((s, j) => s + tpOf(j), 0));
  const readyJobs = readyRows.map(toJob).sort((a, b) => b.tp - a.tp);
  const stuckJobs = stuckRows.map(toJob).sort((a, b) => b.tp - a.tp);

  const readySet = new Set(readyJobs.map((j) => j.id));
  const readyTasks = tasks.filter((t) => t.job_id && readySet.has(jobNo(t.job_id))).map(asTask).sort(byDue);

  // ---- escalation ----
  const escTaskRows = tasks.filter((t) => escOf(t.esc));
  const escLevels: Record<string, number> = {};
  for (const t of escTaskRows) {
    const l = escOf(t.esc) as string;
    escLevels[l] = (escLevels[l] || 0) + 1;
  }
  const escTop = escTaskRows.map(asTask).sort(byDue).slice(0, 8);
  const escQuotes = jobs
    .filter((j) => j.escalation && j.escalation.trim().length > 25)
    .map((j) => ({ id: jobNo(j.id), tp: cr(tpOf(j)), text: j.escalation!.trim().replace(/\s+/g, " ") }))
    .sort((a, b) => b.tp - a.tp)
    .slice(0, 3)
    .map((q) => ({ ...q, text: q.text.length > 112 ? q.text.slice(0, 111).replace(/[ ,\-]+$/, "") + "…" : q.text }));

  // ---- the family this report looks at properly ----
  const focusRows = jobs.filter((j) => FOCUS.match.test(j.fam || ""));
  const focusJobs = focusRows.map(toJob);
  const custBy = new Map<string, { c: string; n: number; tp: number }>();
  for (const j of focusJobs) {
    const c = j.cust || "—";
    const row = custBy.get(c) || { c, n: 0, tp: 0 };
    row.n += 1;
    row.tp = +(row.tp + j.tp).toFixed(2);
    custBy.set(c, row);
  }
  const fMonths = new Map<string, MonthRow>();
  for (const j of focusJobs) {
    if (!j.tdd) continue;
    const k = monthOf(j.tdd);
    const m = fMonths.get(k) || { k, n: 0, v: 0, t: 0 };
    m.n += 1; m.v += j.val || 0; m.t += j.tp;
    fMonths.set(k, m);
  }
  const fDone = dels.filter((d) => FOCUS.match.test(d.fam || ""));
  const focusSet = new Set(focusJobs.map((j) => j.id));

  return {
    asOf: `${T.slice(8)}-${T.slice(5, 7)}-${T.slice(0, 4)}`,
    asOfLong: longDate(T),
    fy,
    day: R.elapsed,
    total: R.total,
    left: R.left,
    target: { sales: cr(I.targets.sales), tp: cr(I.targets.throughput) },
    delivered: { sales: cr(actuals.sales), tp: cr(actuals.throughput), n: dels.length },
    done,
    book: { sales: cr(book.sales), tp: cr(book.tp), n: book.n },
    anticipated,
    paceBy: cr(R.sales.expected),
    behind: cr(Math.abs(R.sales.variance)),
    pacePct: Math.round(R.sales.pctOfPace ?? 0),
    required: { sales: cr(R.sales.perMonth ?? 0), tp: cr(R.throughput.perMonth ?? 0) },
    months,
    fams,
    famCount: famAll.length,
    famTop,
    famRest,
    ready: { n: readyJobs.length, tp: sumTp(readyRows), jobs: readyJobs.map((j) => ({ ...j, tag: cutTag(j.tag) })) },
    stuck: { n: stuckJobs.length, tp: sumTp(stuckRows), jobs: stuckJobs.map((j) => ({ ...j, tag: cutTag(j.tag) })) },
    readyTasks,
    escJobs: jobs.filter((j) => j.escalation && j.escalation.trim()).length,
    escTasks: escTaskRows.length,
    escLevels,
    escTop,
    escQuotes,
    focus: {
      name: FOCUS.name,
      n: focusJobs.length,
      sales: cr(focusRows.reduce((s, j) => s + num(j.val), 0)),
      tp: sumTp(focusRows),
      jobs: [...focusJobs].sort((a, b) => String(a.tdd || "9999").localeCompare(String(b.tdd || "9999"))),
      custs: [...custBy.values()].sort((a, b) => b.tp - a.tp),
      months: [...fMonths.values()].sort((a, b) => a.k.localeCompare(b.k)).map((m) => ({ ...m, v: +m.v.toFixed(2), t: +m.t.toFixed(2) })),
      done: {
        n: fDone.length,
        sales: cr(fDone.reduce((s, d) => s + num(d.val), 0)),
        tp: cr(fDone.reduce((s, d) => s + tpOf(d), 0)),
      },
      escJobs: focusJobs.filter((j) => j.esc).length,
      // Zero is a value somebody entered; blank is a value nobody has. The
      // deck says which, rather than adding a blank in as nothing.
      novalue: focusJobs.filter((j) => !j.val).map((j) => j.id),
      kitted: focusJobs.filter((j) => j.kit >= 50).length,
      built: focusJobs.filter((j) => j.pct >= 50).length,
      tasks: tasks.filter((t) => t.job_id && focusSet.has(jobNo(t.job_id))).map(asTask).sort(byDue),
    },
  };
}

/**
 * "18 August 2026" — written out, not abbreviated.
 *
 * Built by hand rather than with toLocaleDateString: the server's locale is
 * not the reader's, and a report dated 8/18/2026 for an Indian works is a
 * report that has to be read twice.
 */
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTH_NAMES[m - 1]} ${y}`;
}
