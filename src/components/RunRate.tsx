"use client";
// Required Run Rate — the same card on the Job Delivery Board and on Delivered
// Jobs.
//
// It answers the question a total never can: not "how much have we billed",
// but "are we going to make it, and what would it take from here". So every
// line is a comparison —
//
//   what is left      against  the days left to do it in
//   what is billed    against  what the calendar says should be billed by now
//
// The bar carries both: the fill is where we are, the tick is where the pace
// says we should be. A fill short of the tick is the whole message, and it
// reads in one glance without anyone doing arithmetic in their head.
//
// One component, fetched once per mount, shared by both pages — because a
// target shown in two places must never be two different numbers.
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { runRate, type Pace, type RunRate as Rate } from "@/lib/run-rate";
import { today } from "@/lib/schedule";

const C = {
  ink: "#16232F", body: "#22303C", sub: "#5A6672", mute: "#8A94A0", faint: "#B8B5AC",
  line: "#E2E0DA", panel: "#F4F2EC", accent: "#E8600A", navy: "#1B3A5C",
  green: "#0D7A3F", amber: "#D97706", red: "#B3261E",
};

const PACE_FORMULA = [
  "Required Run Rate",
  "",
  "  To go        = target - billed so far this financial year",
  "  Per month    = to go / months left in the year",
  "",
  "Pace",
  "",
  "  Should be at = target x (days elapsed / days in the FY)",
  "  Ahead/behind = billed - should be at",
  "",
  "A straight-line pace. It claims nothing about seasonality, only about the",
  "calendar — which is the honest default until a month-by-month plan is set.",
  "",
  "Billed means DELIVERED. A job is counted on the day it went out of the",
  "door, not the day it was promised, so jobs still on the board are not in",
  "these figures.",
].join("\n");

export interface Payload {
  installed: boolean;
  fy: string;
  /** The date the actuals were summed up to. Days elapsed is counted to the
   *  same day, so the pace can never be measured over a window the totals
   *  were not taken from. */
  to: string;
  hasTarget: boolean;
  targets: { sales: number; throughput: number };
  actuals: { sales: number; throughput: number };
  undated: number;
  deliveries: number;
  updatedBy: string | null;
  editable: boolean;
  ownerEmail: string;
  /**
   * Delivered so far PLUS every pending job dated inside this financial year.
   * `expected` is where the year finishes if the book lands on its dates.
   */
  anticipated?: {
    expected: { sales: number; throughput: number };
    onDate: { sales: number; throughput: number; jobs: number };
    overdue: { sales: number; throughput: number; jobs: number };
    beyond: { sales: number; throughput: number; jobs: number };
    nodate: { sales: number; throughput: number; jobs: number };
  };
}

/**
 * The run-rate payload on its own, for a caller that wants the figures
 * without the card.
 *
 * Shared so the number cards on the Job Delivery Board and the card below them
 * cannot disagree: same endpoint, same arithmetic, one definition of the
 * target. It fails quietly -- every page that uses it works without it.
 */
export function useRunRatePayload(): Payload | null {
  const [d, setD] = useState<Payload | null>(null);
  useEffect(() => {
    let live = true;
    api.get("/api/run-rate")
      .then((r: Payload) => { if (live && r.installed) setD(r); })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  return d;
}

export default function RunRate({ V, compact = false }: { V: (rupees: number) => string; compact?: boolean }) {
  const [d, setD] = useState<Payload | null>(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    let live = true;
    api
      .get("/api/run-rate")
      .then((r: Payload) => { if (live) { if (r.installed) setD(r); else setGone(true); } })
      // The run rate is a companion to two pages that work perfectly well
      // without it. It fails quietly rather than putting an error banner on
      // top of a working board.
      .catch(() => { if (live) setGone(true); });
    return () => { live = false; };
  }, []);

  if (gone || !d) return null;

  const r = runRate(d.to || today(), d.targets, d.actuals);

  if (!d.hasTarget)
    return (
      <div className="rounded-lg border bg-white p-3 mb-3" style={{ borderColor: C.line }}>
        <Head r={r} updatedBy={null} />
        <div className="text-xs mt-1" style={{ color: C.sub, lineHeight: 1.5 }}>
          No target is set for {r.fy}, so there is nothing to measure the year against yet.
          {d.editable
            ? " Set it in Admin → Targets."
            : ` Only ${d.ownerEmail} can set it — ask, rather than assuming last year's still applies.`}
        </div>
      </div>
    );

  return (
    <div className="rounded-lg border bg-white p-3 mb-3" style={{ borderColor: C.line }}>
      <Head r={r} updatedBy={d.updatedBy} />
      <div className={compact ? "" : "flex gap-4 flex-wrap"} style={compact ? undefined : { marginTop: 6 }}>
        <Line label="Sales Billing" p={r.sales} r={r} V={V} color={C.accent} />
        <Line label="Throughput" p={r.throughput} r={r} V={V} color={C.green} />
      </div>
      {d.undated > 0 && (
        <div className="text-xs mt-2" style={{ color: C.faint, lineHeight: 1.45 }}>
          {d.deliveries.toLocaleString("en-IN")} deliveries counted this year. A further{" "}
          {d.undated.toLocaleString("en-IN")} on record carry no delivery date and cannot be placed in a financial
          year, so they are missing from these totals rather than folded into them.
        </div>
      )}
    </div>
  );
}

function Head({ r, updatedBy }: { r: Rate; updatedBy: string | null }) {
  return (
    <div className="flex items-baseline gap-2 flex-wrap">
      <span className="text-xs font-bold" style={{ color: C.mute, letterSpacing: 1.2 }}>
        REQUIRED RUN RATE · {r.fy}{" "}
        <span style={{ cursor: "help", color: C.navy }} title={PACE_FORMULA}>ⓘ</span>
      </span>
      <span className="text-xs" style={{ color: C.sub }}>
        day <b className="tnum" style={{ color: C.body }}>{r.elapsed}</b> of{" "}
        <span className="tnum">{r.total}</span> ·{" "}
        <b className="tnum" style={{ color: C.body }}>{r.left}</b> day{r.left === 1 ? "" : "s"} left
      </span>
      <div className="flex-1" style={{ minWidth: 10 }} />
      {updatedBy && (
        <span className="text-xs" style={{ color: C.faint }}>target set by {updatedBy}</span>
      )}
    </div>
  );
}

/**
 * One target: what is left, at what rate, and whether we are ahead of the
 * calendar or behind it.
 */
function Line({ label, p, r, V, color }: { label: string; p: Pace; r: Rate; V: (n: number) => string; color: string }) {
  const behind = p.variance < 0;
  // Judged against the pace, not against the target: 40% of a target in month
  // five is on track, and colouring it red because it is not 100% would make
  // the card cry wolf all year. The 5% band stops a rounding-width gap
  // reading as a failure.
  const tone = p.pctOfPace == null ? C.mute : p.pctOfPace >= 100 ? C.green : p.pctOfPace >= 95 ? C.amber : C.red;

  const fill = p.target > 0 ? Math.max(0, Math.min(100, (p.actual / p.target) * 100)) : 0;
  const tick = Math.max(0, Math.min(100, r.pctElapsed));

  return (
    <div style={{ flex: "1 1 0", minWidth: 290 }}>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-xs font-bold" style={{ color: C.body, letterSpacing: 0.4 }}>{label}</span>
        <span className="text-xs" style={{ color: C.faint }}>target <span className="tnum">{V(p.target)}</span></span>
      </div>

      <div className="flex items-baseline gap-1.5 flex-wrap">
        <span className="tnum font-bold" style={{ fontSize: 20, color, lineHeight: 1.25 }}>{V(p.remaining)}</span>
        <span className="text-xs" style={{ color: C.sub }}>
          in <b className="tnum" style={{ color: C.body }}>{r.left}</b> day{r.left === 1 ? "" : "s"}
        </span>
        {p.perMonth != null ? (
          <span className="text-xs" style={{ color: C.sub }}>
            — <b className="tnum" style={{ color: C.body }}>{V(p.perMonth)}</b> per month
          </span>
        ) : (
          <span className="text-xs" style={{ color: C.mute }}>— the year is over</span>
        )}
      </div>

      {/* fill = where we are · tick = where the calendar says we should be */}
      <div
        className="relative mt-1"
        style={{ height: 9, background: "#EFEDE7", borderRadius: 2 }}
        title={`${V(p.actual)} billed · pace says ${V(p.expected)} by today`}
      >
        <div style={{ width: `${fill}%`, height: 9, background: color, borderRadius: 2 }} />
        <div
          title={`pace — ${Math.round(r.pctElapsed)}% of the year gone`}
          style={{ position: "absolute", left: `calc(${tick}% - 1px)`, top: -2, width: 2, height: 13, background: C.ink, opacity: 0.8 }}
        />
      </div>

      <div className="text-xs mt-1" style={{ color: C.sub, lineHeight: 1.5 }}>
        <b className="tnum" style={{ color: C.body }}>{V(p.actual)}</b> billed
        {p.pctOfTarget != null && <> — <span className="tnum">{Math.round(p.pctOfTarget)}%</span> of target</>} · pace
        says <span className="tnum">{V(p.expected)}</span> by today
      </div>
      <div className="text-xs font-bold" style={{ color: tone, lineHeight: 1.5 }}>
        {behind ? "BEHIND" : "AHEAD"} by <span className="tnum">{V(Math.abs(p.variance))}</span>
        {p.pctOfPace != null && (
          <span className="font-normal" style={{ color: C.mute }}> · running at {Math.round(p.pctOfPace)}% of pace</span>
        )}
      </div>
    </div>
  );
}
