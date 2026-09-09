"use client";
// THE YEAR — three boxes, and nothing else.
// (Dr Raghu, 9 Sep 2026: "Just show one box saying Year upto <August>
// Completed — Jobs, Value, Throughput (Runrate: Jobs, Value,
// Throughput/month). Next to it Plan of <month> Month ... Achieved ...
// Balance Planned. Next to it make Plan of <person> dropdown, show Pankaj by
// default.")
//
// The twelve month cards this replaced were honest and useless: eight of
// them said "nothing due" and the two that mattered were separated by a
// row of them. Three boxes, read left to right, are the whole sentence —
// WHAT THE YEAR HAS DONE, WHAT THIS MONTH IS FOR, WHO BELIEVES IT.
//
// THE THREE ARE DIFFERENT KINDS OF FACT, which is why they are three boxes
// and not one table:
//
//   THE YEAR SO FAR is closed. Every completed month of the financial year,
//   read from the delivered ledger — what went out of the door, not what was
//   promised. Its run rate is what we ACTUALLY ran at, per month, which is
//   the only number the required run rate can be argued against.
//
//   THIS MONTH is open, so it splits three ways: what the month is for,
//   what is already out, and what is still owed. Plan = achieved + balance,
//   always, so the box can never quietly disagree with itself.
//
//   THE PERSON is an opinion. plan_belief carries one row per job per
//   planner from the Month & Qtr Plan; the box is headed with their name
//   because a confidence with no name on it is nobody's.
//
// A JOB NOBODY HAS CALLED IS NOT A CERTAINTY. Jobs with no belief row from
// the chosen planner are counted separately as "not yet called", never
// folded into 100%. Most of the book has never been inside a month window,
// and quietly promoting it to certain would make this panel worse than no
// panel at all.
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { monthKey, monthLabel } from "@/lib/fmt";
import { today, fmt, jobNo } from "@/lib/schedule";

const C = {
  ink: "var(--navy)", body: "var(--ink)", sub: "var(--dim)", mute: "var(--muted)", faint: "#B8B5AC",
  line: "var(--line)", panel: "#F4F2EC", accent: "var(--accent)", navy: "var(--blue)",
  green: "var(--green)", amber: "var(--warn)", red: "var(--red)", violet: "#7C3AED",
};

/** Only the fields this panel reads — so it never has to track the Job type. */
export interface YearJob {
  id: string;
  /** The customer tag — the only label a job needs on a chip. */
  tag: string;
  tdd: string | null;
  val: number;
  tpv: number;
  /** For the hover — where the job actually stands, not just what it is worth. */
  kit: number | null;
  pct: number | null;
}

interface Payload {
  installed: boolean;
  fy: string;
  from: string;
  to: string;
  end: string;
  money: boolean;
  delivered: Record<string, { jobs: number; value: number; tp: number }>;
  deliveredJobs?: { id: string; tag: string; on: string }[];
  beliefs: Record<string, Record<string, number>>;
  planners: { email: string; name: string; jobs: number }[];
}

/**
 * WHOSE VIEW THIS OPENS ON (Dr Raghu, 9 Sep 2026: "Show Pankaj by default").
 * Falls back to whoever has called the most jobs if he has none recorded, so
 * the box is never blank because one person did not type this month.
 */
const DEFAULT_PLANNER = "pankajs@nandan.co.in";

interface Tot { jobs: number; value: number; tp: number }
const zero = (): Tot => ({ jobs: 0, value: 0, tp: 0 });
const add = (t: Tot, j: YearJob) => { t.jobs += 1; t.value += Number(j.val) || 0; t.tp += Number(j.tpv) || 0; };
/** month key → "August". The month spoken, not the month coded. */
const monthWord = (k: string) => monthLabel(k).split(" ")[0];


/*
 * THE FIVE SHAPES, HOISTED OUT OF THE RENDER.
 *
 * A component declared inside another component's body is a NEW component
 * type on every render, so React unmounts and remounts it — which is how a
 * dropdown loses focus the moment it is used. This project has no lint rule
 * for it (react/no-unstable-nested-components is not enabled), so it has to
 * be a habit rather than a check. They take V as a prop instead of closing
 * over it.
 */
/**
 * The three numbers, always in the same shapes (Dr Raghu: "make the jobs
 * number big, the value relatively big, and the throughput in small green
 * letters"). One component, so no two boxes can drift into two
 * typographies for the same three facts.
 */
function Three({ t, V, ink = C.ink, hideMoney = false }: { t: Tot; V: (n: number) => string; ink?: string; hideMoney?: boolean }) {
  return (
  <div className="flex items-baseline gap-2 flex-wrap">
    <span className="font-bold tnum" style={{ color: ink, fontSize: 30, lineHeight: 1.05 }}>{t.jobs}</span>
    <span className="text-xs font-bold" style={{ color: C.faint }}>job{t.jobs === 1 ? "" : "s"}</span>
    {hideMoney
      ? <span className="text-xs" style={{ color: C.faint }}>value not shown at your access</span>
      : <>
          <span className="font-bold tnum" style={{ color: C.navy, fontSize: 18 }}>{V(t.value)}</span>
          <span className="text-xs font-bold tnum" style={{ color: C.green }}>{V(t.tp)} tp</span>
        </>}
  </div>
  );
}

/** A run rate, always spelled the same way: three facts and the word "per month". */
function Rate({ r, V, label, hideMoney = false }: { r: { jobs: number; value: number; tp: number } | null; V: (n: number) => string; label: string; hideMoney?: boolean }) {
  return (
  <div className="text-xs tnum mt-1" style={{ color: C.sub }}>
    {r
      ? <>{label} <b>{r.jobs.toFixed(1)}</b> jobs{hideMoney ? "" : <> · <b>{V(r.value)}</b> · <span style={{ color: C.green }}>{V(r.tp)} tp</span></>} <span style={{ color: C.faint }}>per month</span></>
      : <span style={{ color: C.faint }}>{label} — not enough of the year has run</span>}
  </div>
  );
}

/** One of the two lines under this month's plan. */
function Split({ label, t, V, ink, hideMoney = false }: { label: string; t: Tot; V: (n: number) => string; ink: string; hideMoney?: boolean }) {
  return (
  <div className="flex items-baseline gap-2 flex-wrap py-1" style={{ borderTop: `1px solid ${C.line}` }}>
    <span className="text-xs font-bold" style={{ color: ink, letterSpacing: 0.6, minWidth: 92 }}>{label}</span>
    <span className="font-bold tnum" style={{ color: ink, fontSize: 17 }}>{t.jobs}</span>
    <span className="text-xs" style={{ color: C.faint }}>job{t.jobs === 1 ? "" : "s"}</span>
    {hideMoney
      ? <span className="text-xs" style={{ color: C.faint }}>—</span>
      : <>
          <span className="font-bold tnum" style={{ color: C.navy, fontSize: 14 }}>{V(t.value)}</span>
          <span className="text-xs tnum font-bold" style={{ color: C.green }}>{V(t.tp)} tp</span>
        </>}
  </div>
  );
}

function Box({ head, note, children, tint }: { head: React.ReactNode; note?: React.ReactNode; children: React.ReactNode; tint?: string }) {
  return (
  <div className="rounded-lg border p-3" style={{ borderColor: C.line, background: tint || "#fff" }}>
    <div className="text-xs font-bold mb-1" style={{ color: C.mute, letterSpacing: 1 }}>{head}</div>
    {children}
    {note && <div className="text-xs mt-1.5" style={{ color: C.faint, lineHeight: 1.5 }}>{note}</div>}
  </div>
  );
}

function Block({ label, note, t, V, ink, tint, children }: { label: string; note: string; t: Tot; V: (n: number) => string; ink: string; tint: string; children?: React.ReactNode }) {
  return (
  <div className="rounded px-2.5 py-1.5" style={{ background: tint, borderLeft: `4px solid ${ink}` }}>
    <div className="text-xs font-bold" style={{ color: ink, letterSpacing: 0.6 }}>{label}</div>
    <div className="flex items-baseline gap-2 flex-wrap">
      <span className="font-bold tnum" style={{ color: ink, fontSize: 22, lineHeight: 1.1 }}>{t.jobs}</span>
      <span className="text-xs" style={{ color: C.faint }}>job{t.jobs === 1 ? "" : "s"}</span>
      <span className="font-bold tnum" style={{ color: C.navy, fontSize: 15 }}>{V(t.value)}</span>
      <span className="text-xs font-bold tnum" style={{ color: C.green }}>{V(t.tp)} tp</span>
    </div>
    <div className="text-xs" style={{ color: C.faint }}>{note}</div>
    {children}
  </div>
  );
}

/**
 * A JOB AS A CHIP (Dr Raghu, 9 Sep 2026: "customer tag is enough as a
 * button!", then "mouseover shows the kitting% and production %").
 *
 * The tag and the date on the face; everything else on the hover, because a
 * chip that carries its own dossier stops being a list. The hover is where
 * the job actually STANDS — kitting and production — which is the pair that
 * says whether a belief is worth anything.
 */
function Chips({ list, ink, V, onOpen, today }: {
  list: YearJob[]; ink: string; V: (n: number) => string; onOpen?: (id: string) => void; today: string;
}) {
  if (!list.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {list.map((j) => {
        const late = !!j.tdd && j.tdd < today;
        const k = j.kit == null ? null : Math.round(Number(j.kit));
        const p = j.pct == null ? null : Math.round(Number(j.pct));
        return (
          <button
            key={j.id}
            onClick={() => onOpen?.(j.id)}
            className="rounded px-2 py-0.5 text-xs font-semibold text-left"
            style={{
              border: `1px solid ${late ? C.red : C.line}`,
              background: "#fff",
              color: ink,
              cursor: onOpen ? "pointer" : "default",
              maxWidth: "100%",
            }}
            title={[
              `${jobNo(j.id)} · ${j.tag}`,
              j.tdd ? `TDD ${fmt(j.tdd)}${late ? " — the date has gone" : ""}` : "no target date",
              `Kitting ${k == null ? "not recorded" : k + "%"} · Production ${p == null ? "not recorded" : p + "%"}`,
              `${V(j.val)} · ${V(j.tpv)} throughput`,
              onOpen ? "\nClick to open the job." : "",
            ].filter(Boolean).join("\n")}
          >
            {j.tag || jobNo(j.id)}
            <span style={{ color: C.faint, fontWeight: 400 }}> · {j.tdd ? fmt(j.tdd) : "no date"}</span>
            {k != null && p != null && (
              <span style={{ color: C.faint, fontWeight: 400 }}> · K{k}/P{p}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default function YearPanel({
  jobs,
  V,
  planPerMonth,
  planTpPerMonth,
  onOpen,
}: {
  jobs: YearJob[];
  V: (n: number) => string;
  /** Open a job from its chip — the list is only useful if it goes somewhere. */
  onOpen?: (id: string) => void;
  /** Sales that has to be billed every month to make the year. Null = no target set, or not permitted to see it. */
  planPerMonth: number | null;
  planTpPerMonth: number | null;
}) {
  const [d, setD] = useState<Payload | null>(null);
  const [who, setWho] = useState<string>("");

  useEffect(() => {
    let live = true;
    api.get("/api/board-year")
      .then((r: Payload) => {
        if (!live || !r?.installed) return;
        setD(r);
        const has = new Set(r.planners.map((p) => p.email));
        setWho(has.has(DEFAULT_PLANNER) ? DEFAULT_PLANNER : (r.planners[0]?.email || ""));
      })
      // A companion to the cards above it, not a gate on them.
      .catch(() => { /* the board works without this panel */ });
    return () => { live = false; };
  }, []);

  const TODAY = today();
  const thisMonth = monthKey(TODAY);

  /** The twelve months of the financial year the panel is reporting. */
  const keys = useMemo(() => {
    const start = d?.from || TODAY;
    const dt = new Date(start + "T00:00:00Z");
    return Array.from({ length: 12 }, (_, i) =>
      monthKey(new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + i, 1)).toISOString().slice(0, 10)),
    );
  }, [d?.from, TODAY]);

  /**
   * THE YEAR SO FAR — every COMPLETED month, and only completed months.
   *
   * September is deliberately left out of it. A month three days old
   * dragged into a run rate halves the rate and makes a good year look
   * like a bad one, which is the commonest way an honest average lies.
   */
  const year = useMemo(() => {
    const done = keys.filter((k) => k < thisMonth);
    const t = zero();
    for (const k of done) {
      const del = d?.delivered[k];
      if (!del) continue;
      t.jobs += del.jobs; t.value += del.value; t.tp += del.tp;
    }
    const months = done.length;
    return {
      t, months,
      upto: done.length ? done[done.length - 1] : null,
      rate: months
        ? { jobs: t.jobs / months, value: t.value / months, tp: t.tp / months }
        : null,
    };
  }, [keys, thisMonth, d]);

  /**
   * THIS MONTH — plan, achieved, balance.
   *
   * BALANCE is the pending jobs whose target date falls in this month; it
   * is what the board is still carrying. ACHIEVED is what the ledger says
   * already went out this month. PLAN is the two added, so it is a fact
   * about the month rather than a wish typed into it — and it means plan
   * minus achieved is always exactly the balance.
   */
  const month = useMemo(() => {
    const balance = zero();
    for (const j of jobs) if (j.tdd && monthKey(j.tdd) === thisMonth) add(balance, j);
    const del = d?.delivered[thisMonth];
    const achieved: Tot = { jobs: del?.jobs || 0, value: del?.value || 0, tp: del?.tp || 0 };
    const plan: Tot = {
      jobs: balance.jobs + achieved.jobs,
      value: balance.value + achieved.value,
      tp: balance.tp + achieved.tp,
    };
    return { plan, achieved, balance };
  }, [jobs, thisMonth, d]);

  /**
   * The delivered jobs of the COMPLETED months — the same window box one
   * counts, so the tags and the number can never disagree. September's
   * four are left out for the same reason the run rate leaves them out:
   * this box is the closed year.
   */
  const gone = useMemo(
    () => (d?.deliveredJobs || []).filter((x) => monthKey(x.on) < thisMonth),
    [d, thisMonth],
  );

  /** Pending jobs that fall outside the twelve months, so nothing is silently dropped. */
  const stray = useMemo(() => {
    const before = zero(), after = zero(), nodate = zero();
    const first = keys[0], last = keys[keys.length - 1];
    for (const j of jobs) {
      if (!j.tdd) add(nodate, j);
      else if (monthKey(j.tdd) < first) add(before, j);
      else if (monthKey(j.tdd) > last) add(after, j);
    }
    return { before, after, nodate };
  }, [jobs, keys]);

  /**
   * The book split by one planner's stated belief.
   *
   * The boundaries are written out rather than implied: 100 is its own
   * block, "50 to 100" is strictly above 50 and below 100 (the Month & Qtr
   * Plan offers 75 and 90 there), and "0 to 50" includes 50 itself — a
   * coin-toss belongs with the doubtful half, not the likely one.
   */
  const conf = useMemo(() => {
    const certain = zero(), likely = zero(), risk = zero(), uncalled = zero();
    /**
     * THE CERTAIN ONES, NAMED (Dr Raghu, 9 Sep 2026: "show the 100% certain
     * in the box below plan of Sept. Show the order. Customer tag is enough
     * as a button!").
     *
     * A count of 27 certainties is a number; the twenty-seven tags are a
     * list somebody can work down. IN DATE ORDER, soonest first — a
     * commitment list sorted by anything else is a list nobody can act on.
     * Jobs with no target date sit at the end rather than at the front,
     * where a blank would otherwise sort them.
     */
    const named: YearJob[] = [], likelyJobs: YearJob[] = [], riskJobs: YearJob[] = [];
    if (!d || !who) return { certain, likely, risk, uncalled, named, likelyJobs, riskJobs, any: false };
    for (const j of jobs) {
      const pct = d.beliefs[j.id]?.[who];
      if (pct == null) add(uncalled, j);
      else if (pct >= 100) { add(certain, j); named.push(j); }
      else if (pct > 50) { add(likely, j); likelyJobs.push(j); }
      else { add(risk, j); riskJobs.push(j); }
    }
    const byDate = (a: YearJob, b: YearJob) => (a.tdd || "9999").localeCompare(b.tdd || "9999");
    named.sort(byDate); likelyJobs.sort(byDate); riskJobs.sort(byDate);
    return { certain, likely, risk, uncalled, named, likelyJobs, riskJobs, any: certain.jobs + likely.jobs + risk.jobs > 0 };
  }, [jobs, d, who]);

  if (!d) return null;

  const person = d.planners.find((p) => p.email === who);
  /** Delivered money is behind the Leadership Circle gate; the counts are not. */
  const noMoney = !d.money;

  return (
    <div className="rounded-lg border bg-white mb-3" style={{ borderColor: C.line, overflow: "hidden" }}>
      <div className="flex items-center gap-2 flex-wrap px-3 py-2" style={{ background: C.panel, borderBottom: `1px solid ${C.line}` }}>
        <span className="text-xs font-bold" style={{ color: C.mute, letterSpacing: 1.1 }}>THE YEAR</span>
        <span className="text-xs" style={{ color: C.sub }}>
          {d.fy} · what is closed, what this month is for, and who believes it
        </span>
      </div>

      {/* 20 / 55 / 25, as set (Dr Raghu, 9 Sep 2026). The middle column
          carries the twenty-seven certainties, so it gets the room; the
          year's own tags are short and read fine in a narrow column. */}
      <div className="grid gap-2 p-3 year-cols">

        {/* ---- 1. the year, closed ---- */}
        <Box
          head={<>YEAR UP TO {year.upto ? monthWord(year.upto).toUpperCase() : "—"} · COMPLETED</>}
          note={
            <>
              {year.months} completed month{year.months === 1 ? "" : "s"} of {d.fy}, from the delivered ledger — what went out of the door.
              {" "}{monthWord(thisMonth)} is left out on purpose: a month three days old dragged into an average halves it.
              {planPerMonth != null && year.rate && (
                <> The year needs <b>{V(planPerMonth)}</b> a month
                  {year.rate.value >= planPerMonth
                    ? <span style={{ color: C.green }}> — ahead of it.</span>
                    : <span style={{ color: C.red }}> — running at {Math.round((year.rate.value / planPerMonth) * 100)}% of that.</span>}
                </>
              )}
            </>
          }
        >
          <Three t={year.t} V={V} ink={C.ink} hideMoney={noMoney} />
          <Rate r={year.rate} V={V} label="run rate" hideMoney={noMoney} />

          {/* WHAT ACTUALLY WENT OUT, BY NAME. Latest first: the delivery
              somebody wants to check is almost always the recent one. Not
              clickable — a delivered job has left the pending board, so
              there is no job lightbox behind it to open. */}
          {gone.length > 0 && (
            <div className="mt-2.5 pt-2" style={{ borderTop: `1px solid ${C.line}` }}>
              <div className="text-xs font-bold mb-1" style={{ color: C.green, letterSpacing: .6 }}>
                WENT OUT<span style={{ color: C.faint }}> · {gone.length}, latest first</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {gone.map((g2) => (
                  <span key={g2.id} className="rounded px-2 py-0.5 text-xs font-semibold"
                    style={{ border: `1px solid ${C.line}`, background: "#fff", color: C.body, maxWidth: "100%" }}
                    title={`${g2.tag}\ndelivered ${fmt(g2.on)}`}>
                    {g2.tag || g2.id.slice(-4)}
                    <span style={{ color: C.faint, fontWeight: 400 }}> · {fmt(g2.on)}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </Box>

        {/* ---- 2. this month ---- */}
        <Box
          head={<>PLAN OF {monthWord(thisMonth).toUpperCase()}</>}
          tint="#FFF9F3"
          note={
            <>
              Plan is what the month is for: everything still due on it plus everything already out.
              {" "}Achieved plus balance is the plan, always — so the box cannot disagree with itself.
              {planPerMonth != null && <> The required run rate is <b>{V(planPerMonth)}</b> sales{planTpPerMonth ? <> and <b>{V(planTpPerMonth)}</b> throughput</> : null} a month.</>}
            </>
          }
        >
          <Three t={month.plan} V={V} ink={C.accent} />
          <div className="mt-1.5">
            <Split label="ACHIEVED" t={month.achieved} V={V} ink={C.green} hideMoney={noMoney} />
            <Split label="BALANCE" t={month.balance} V={V} ink={month.balance.jobs ? C.red : C.faint} />
          </div>

          {/* THE CERTAIN ONES, BY NAME — the count on the right made
              actionable. Soonest first; a job already past its date is
              red, because a commitment called certain and overdue is the
              one worth a telephone call this morning. */}
          {conf.named.length > 0 && (
            <div className="mt-2.5 pt-2" style={{ borderTop: `1px solid ${C.line}` }}>
              <div className="text-xs font-bold mb-1" style={{ color: C.green, letterSpacing: .6 }}>
                100% CERTAIN{person ? <span style={{ color: C.faint }}> · {person.name}</span> : null}
                <span style={{ color: C.faint }}> · {conf.named.length} job{conf.named.length === 1 ? "" : "s"}, soonest first</span>
              </div>
              <Chips list={conf.named} ink={C.body} V={V} onOpen={onOpen} today={TODAY} />
            </div>
          )}
        </Box>

        {/* ---- 3. whose plan ---- */}
        <Box
          head={
            <span className="flex items-center gap-2 flex-wrap">
              PLAN OF
              {d.planners.length > 0 ? (
                <select
                  value={who}
                  onChange={(e) => setWho(e.target.value)}
                  className="px-2 py-0.5 rounded border text-xs font-bold"
                  style={{ borderColor: C.line, color: C.body, background: "#fff" }}
                  title="Whose stated belief this is. Set on the Month & Qtr Plan, job by job."
                >
                  {d.planners.map((p) => (
                    <option key={p.email} value={p.email}>{p.name} · {p.jobs} called</option>
                  ))}
                </select>
              ) : (
                <span style={{ color: C.faint }}>— nobody has called a job yet</span>
              )}
            </span>
          }
          note={
            <>
              Confidence is stated on <b>Month &amp; Qtr Plan</b>, one job at a time — this box only reports it.
              {conf.uncalled.jobs > 0 && <> A job nobody has called is <b>not</b> a certainty, so it is counted apart.</>}
            </>
          }
        >
          {conf.any ? (
            <div className="grid gap-1.5">
              <Block label="100% — CERTAIN" note="called at 100" t={conf.certain} V={V} ink={C.green} tint="#F0FAF3" />
              {/* THE ONES THAT ARE NOT CERTAIN, BY NAME AND IN RED
                  (Dr Raghu, 9 Sep 2026). Both lists are red because both are
                  the same kind of fact — money the planner has not committed
                  to — and the block's own bar keeps them apart. */}
              <Block label="50–100% — LIKELY" note="above 50, below 100" t={conf.likely} V={V} ink={C.amber} tint="#FFF8EE">
                <Chips list={conf.likelyJobs} ink={C.red} V={V} onOpen={onOpen} today={TODAY} />
              </Block>
              <Block label="0–50% — AT RISK" note="50 and below — a coin toss counts here" t={conf.risk} V={V} ink={C.red} tint="#FEF3F2">
                <Chips list={conf.riskJobs} ink={C.red} V={V} onOpen={onOpen} today={TODAY} />
              </Block>
              {conf.uncalled.jobs > 0 && (
                <Block label="NOT YET CALLED" note="no belief recorded" t={conf.uncalled} V={V} ink={C.faint} tint="#FAFAF8" />
              )}
            </div>
          ) : (
            <div className="text-xs rounded p-2.5" style={{ color: C.sub, background: C.panel, lineHeight: 1.6 }}>
              {person
                ? <>{person.name} has called {person.jobs} job{person.jobs === 1 ? "" : "s"}, but none of them are in the list this board is showing.</>
                : <>No beliefs have been recorded yet.</>}
            </div>
          )}
        </Box>
      </div>
      <style>{`
        .year-cols { grid-template-columns: 1fr; }
        @media (min-width: 1024px) { .year-cols { grid-template-columns: 20% 55% 25%; } }
      `}</style>

      {(stray.before.jobs > 0 || stray.after.jobs > 0 || stray.nodate.jobs > 0) && (
        <div className="text-xs px-3 pb-2.5" style={{ color: C.faint, lineHeight: 1.5 }}>
          Outside the three boxes:
          {stray.before.jobs > 0 && <> <b>{stray.before.jobs}</b> pending job{stray.before.jobs === 1 ? "" : "s"} ({V(stray.before.value)}) carry a target date from before {d.fy}.</>}
          {stray.after.jobs > 0 && <> <b>{stray.after.jobs}</b> ({V(stray.after.value)}) fall beyond 31 March.</>}
          {stray.nodate.jobs > 0 && <> <b>{stray.nodate.jobs}</b> ({V(stray.nodate.value)}) carry no target date at all and cannot be placed in a month — left out rather than dropped into one.</>}
        </div>
      )}
    </div>
  );
}
