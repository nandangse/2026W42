"use client";
// THE YEAR — the month spine, and whose confidence sits behind it.
// (Dr Raghu, 9 Sep 2026: "show months, plan, how many jobs, what value, what
// throughput, how many delivered ... next to that one big large window ...
// jobs at 100% confidence, 0 to 50, 50 to 100 ... dependent upon Pankaj's
// view of the quarter and month view.")
//
// It sits under the number cards on the Job Delivery Board and folds away
// with them, because it answers the question those cards raise and cannot
// settle: ₹39 Cr pending is a total, "₹12 Cr of it lands in one month and
// only ₹4 Cr of that is called certain by the man who plans it" is a
// decision.
//
// TWO HALVES, DELIBERATELY DIFFERENT KINDS OF FACT.
//
//   THE MONTHS are arithmetic — every pending job stacked on the month its
//   Target Delivery Date falls in, against what the year's target requires
//   per month, beside what actually went out of the door that month. Nobody
//   has an opinion in this half.
//
//   THE CONFIDENCE is a person. plan_belief carries one row per job per
//   planner from the Month & Qtr Plan, so the three blocks on the right are
//   somebody's stated read and are labelled with their name. Change the
//   name at the top and the three blocks change with it.
//
// A JOB NOBODY HAS CALLED IS NOT A CERTAINTY. Jobs with no belief row from
// the chosen planner are counted separately as "not yet called", never
// folded into 100%. Most of the book has never been inside a month window,
// and quietly promoting it to certain would make this panel worse than no
// panel at all.
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { monthKey, monthLabel } from "@/lib/fmt";
import { today } from "@/lib/schedule";

const C = {
  ink: "var(--navy)", body: "var(--ink)", sub: "var(--dim)", mute: "var(--muted)", faint: "#B8B5AC",
  line: "var(--line)", panel: "#F4F2EC", accent: "var(--accent)", navy: "var(--blue)",
  green: "var(--green)", amber: "var(--warn)", red: "var(--red)", violet: "#7C3AED",
};

/** Only the fields this panel reads — so it never has to track the Job type. */
export interface YearJob {
  id: string;
  tdd: string | null;
  val: number;
  tpv: number;
}

interface Payload {
  installed: boolean;
  fy: string;
  from: string;
  to: string;
  end: string;
  money: boolean;
  delivered: Record<string, { jobs: number; value: number; tp: number }>;
  beliefs: Record<string, Record<string, number>>;
  planners: { email: string; name: string; jobs: number }[];
}

/**
 * WHOSE VIEW THIS OPENS ON (Dr Raghu, 9 Sep 2026: "dependent upon Pankaj's
 * view of the quarter and month view"). Falls back to whoever has called the
 * most jobs if he has none recorded, so the panel is never blank because one
 * person did not type this month.
 */
const DEFAULT_PLANNER = "pankajs@nandan.co.in";

interface Tot { jobs: number; value: number; tp: number }
const zero = (): Tot => ({ jobs: 0, value: 0, tp: 0 });
const add = (t: Tot, j: YearJob) => { t.jobs += 1; t.value += Number(j.val) || 0; t.tp += Number(j.tpv) || 0; };

/**
 * The three numbers, always in the same shapes (Dr Raghu: "make the jobs
 * number big, the value relatively big, and the throughput in small green
 * letters"). One component so the month cards and the confidence blocks can
 * never drift into two different typographies for the same three facts.
 */
function Three({ t, V, ink }: { t: Tot; V: (n: number) => string; ink: string }) {
  return (
    <div className="flex items-baseline gap-2 flex-wrap">
      <span className="font-bold tnum" style={{ color: ink, fontSize: 28, lineHeight: 1.05 }}>{t.jobs}</span>
      <span className="text-xs font-bold" style={{ color: C.faint }}>job{t.jobs === 1 ? "" : "s"}</span>
      <span className="font-bold tnum" style={{ color: C.navy, fontSize: 17 }}>{V(t.value)}</span>
      <span className="text-xs font-bold tnum" style={{ color: C.green }}>{V(t.tp)} tp</span>
    </div>
  );
}

export default function YearPanel({
  jobs,
  V,
  planPerMonth,
  planTpPerMonth,
}: {
  jobs: YearJob[];
  V: (n: number) => string;
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

  const { byMonth, before, after, nodate } = useMemo(() => {
    const map = new Map<string, Tot>(keys.map((k) => [k, zero()]));
    const b = zero(), a = zero(), n = zero();
    const first = keys[0], last = keys[keys.length - 1];
    for (const j of jobs) {
      if (!j.tdd) { add(n, j); continue; }
      const k = monthKey(j.tdd);
      if (k < first) add(b, j);
      else if (k > last) add(a, j);
      else add(map.get(k)!, j);
    }
    return { byMonth: map, before: b, after: a, nodate: n };
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
    if (!d || !who) return { certain, likely, risk, uncalled, any: false };
    for (const j of jobs) {
      const pct = d.beliefs[j.id]?.[who];
      if (pct == null) add(uncalled, j);
      else if (pct >= 100) add(certain, j);
      else if (pct > 50) add(likely, j);
      else add(risk, j);
    }
    return { certain, likely, risk, uncalled, any: certain.jobs + likely.jobs + risk.jobs > 0 };
  }, [jobs, d, who]);

  if (!d) return null;

  const person = d.planners.find((p) => p.email === who);

  const MonthCard = ({ k }: { k: string }) => {
    const t = byMonth.get(k) || zero();
    const del = d.delivered[k];
    const past = k < thisMonth;
    const now = k === thisMonth;
    return (
      <div
        className="rounded-lg border px-2.5 py-2"
        style={{
          borderColor: now ? C.accent : C.line,
          background: now ? "#FFF9F3" : past ? "#FAFAF8" : "#fff",
          boxShadow: now ? `0 0 0 1px ${C.accent}` : undefined,
        }}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-bold" style={{ color: now ? C.accent : C.body }}>
            {monthLabel(k)}{now ? " · now" : ""}
          </span>
          {planPerMonth != null && (
            <span className="text-xs tnum" style={{ color: C.faint }} title="What sales billing has to average every month to make the year's target">
              plan {V(planPerMonth)}
            </span>
          )}
        </div>
        {t.jobs > 0
          ? <Three t={t} V={V} ink={past ? C.red : C.ink} />
          : <div className="text-xs py-1.5" style={{ color: C.faint }}>nothing due</div>}
        <div className="text-xs mt-0.5" style={{ color: del ? C.green : C.faint }}>
          {del
            ? <>▲ {del.jobs} delivered{d.money && del.value ? ` · ${V(del.value)}` : ""}</>
            : past ? "none delivered" : "—"}
        </div>
        {past && t.jobs > 0 && (
          <div className="text-xs" style={{ color: C.red }}>still open — the date has gone</div>
        )}
      </div>
    );
  };

  const Block = ({ label, note, t, ink, tint }: { label: string; note: string; t: Tot; ink: string; tint: string }) => (
    <div className="rounded-lg px-3 py-2.5" style={{ background: tint, borderLeft: `4px solid ${ink}` }}>
      <div className="text-xs font-bold" style={{ color: ink, letterSpacing: 0.8 }}>{label}</div>
      <Three t={t} V={V} ink={ink} />
      <div className="text-xs" style={{ color: C.faint }}>{note}</div>
    </div>
  );

  return (
    <div className="rounded-lg border bg-white mb-3" style={{ borderColor: C.line, overflow: "hidden" }}>
      <div className="flex items-center gap-2 flex-wrap px-3 py-2" style={{ background: C.panel, borderBottom: `1px solid ${C.line}` }}>
        <span className="text-xs font-bold" style={{ color: C.mute, letterSpacing: 1.1 }}>THE YEAR</span>
        <span className="text-xs" style={{ color: C.sub }}>
          {d.fy} · {jobs.length} pending job{jobs.length === 1 ? "" : "s"} on the month each one is due, and what actually went out
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr]">
        {/* ---- the months ---- */}
        <div className="p-3" style={{ borderRight: `1px solid ${C.line}` }}>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {keys.map((k) => <MonthCard key={k} k={k} />)}
          </div>
          <div className="text-xs mt-2" style={{ color: C.faint, lineHeight: 1.5 }}>
            {before.jobs > 0 && <>{before.jobs} job{before.jobs === 1 ? "" : "s"} ({V(before.value)}) carry a target date from before this financial year. </>}
            {after.jobs > 0 && <>{after.jobs} ({V(after.value)}) fall beyond 31 March. </>}
            {nodate.jobs > 0 && <>{nodate.jobs} ({V(nodate.value)}) carry no target date at all and cannot be placed in a month — left off rather than dropped into one. </>}
            {planPerMonth != null && <>The plan on each card is the run rate the {d.fy} target requires{planTpPerMonth ? ` (${V(planTpPerMonth)} throughput)` : ""} — a straight line, until a month-by-month plan is set.</>}
            {!d.money && <> Delivered value is not shown at your access; the counts are.</>}
          </div>
        </div>

        {/* ---- whose confidence ---- */}
        <div className="p-3">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="text-xs font-bold" style={{ color: C.mute, letterSpacing: 1.1 }}>CONFIDENCE</span>
            {d.planners.length > 0 ? (
              <select
                value={who}
                onChange={(e) => setWho(e.target.value)}
                className="px-2 py-0.5 rounded border text-xs font-bold"
                style={{ borderColor: C.line, color: C.body }}
                title="Whose stated belief this is. Set on the Month & Qtr Plan, job by job."
              >
                {d.planners.map((p) => (
                  <option key={p.email} value={p.email}>{p.name} · {p.jobs} called</option>
                ))}
              </select>
            ) : (
              <span className="text-xs" style={{ color: C.faint }}>nobody has called a job yet</span>
            )}
          </div>

          {conf.any ? (
            <div className="grid gap-2">
              <Block label="100% — CERTAIN" note="called at 100 on the Month & Qtr Plan" t={conf.certain} ink={C.green} tint="#F0FAF3" />
              <Block label="50–100% — LIKELY" note="above 50, below 100 (75 or 90)" t={conf.likely} ink={C.amber} tint="#FFF8EE" />
              <Block label="0–50% — AT RISK" note="50 and below — a coin toss counts here" t={conf.risk} ink={C.red} tint="#FEF3F2" />
              {conf.uncalled.jobs > 0 && (
                <Block label="NOT YET CALLED" note="no belief recorded — NOT counted as certain" t={conf.uncalled} ink={C.faint} tint="#FAFAF8" />
              )}
            </div>
          ) : (
            <div className="text-xs rounded p-3" style={{ color: C.sub, background: C.panel, lineHeight: 1.6 }}>
              {person ? <>{person.name} has called {person.jobs} job{person.jobs === 1 ? "" : "s"}, but none of them are in the list this board is showing.</> : <>No beliefs have been recorded yet.</>}
              {" "}Confidence is stated on <b>Month &amp; Qtr Plan</b>, one job at a time — this panel only reports it.
            </div>
          )}

          <div className="text-xs mt-2" style={{ color: C.faint, lineHeight: 1.5 }}>
            {person && conf.any && <>{person.name}&rsquo;s read of the month and quarter, carried onto the whole pending book. </>}
            Change the name to see another planner&rsquo;s.
          </div>
        </div>
      </div>
    </div>
  );
}
