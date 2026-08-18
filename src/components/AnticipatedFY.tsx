"use client";
// Total Anticipated for the financial year.
//
// A DIFFERENT question from the Required Run Rate sitting under it. The run
// rate asks what we would have to bill from here; this asks what we already
// have on the books to do it with:
//
//     delivered so far  +  everything still due before 31 March
//
// It is an expectation, not a forecast, and the panel says so in those words.
// It assumes every pending job lands on the date it currently carries — which
// is exactly the assumption a delivery board exists to test, so stating it is
// the point rather than a disclaimer.
import { useState } from "react";

const C = {
  ink: "#16232F", body: "#22303C", sub: "#5A6672", mute: "#8A94A0", faint: "#B8B5AC",
  line: "#E2E0DA", panel: "#F4F2EC", accent: "#E8600A", navy: "#1B3A5C",
  green: "#0D7A3F", amber: "#D97706", red: "#B3261E", violet: "#7C3AED",
};

interface Group { sales: number; throughput: number; jobs: number }
export interface Anticipated {
  onDate: Group;
  overdue: Group;
  beyond: Group;
  nodate: Group;
  expected: { sales: number; throughput: number };
}

export default function AnticipatedFY({
  fy, end, anticipated, actuals, targets, hasTarget, V,
}: {
  fy: string;
  end: string;
  anticipated: Anticipated;
  actuals: { sales: number; throughput: number };
  targets: { sales: number; throughput: number };
  hasTarget: boolean;
  V: (n: number) => string;
}) {
  const [open, setOpen] = useState(false);
  const a = anticipated;
  const pct = (v: number, t: number) => (t > 0 ? Math.round((v / t) * 100) : null);
  const salesPct = pct(a.expected.sales, targets.sales);
  const tpPct = pct(a.expected.throughput, targets.throughput);

  // green when the book alone reaches the target, amber when it is close
  const tone = (p: number | null) => (p == null ? C.sub : p >= 100 ? C.green : p >= 85 ? C.amber : C.red);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg text-left"
        style={{ background: C.ink, color: "#fff", padding: "10px 14px", border: `2px solid ${C.accent}`, cursor: "pointer", minWidth: 300 }}
        title="Delivered so far plus everything still due before 31 March — click for the working"
      >
        <div className="text-xs font-bold" style={{ color: "#8FA1B3", letterSpacing: 1.1 }}>
          TOTAL ANTICIPATED · {fy}
        </div>
        <div className="flex items-baseline gap-4 flex-wrap mt-0.5">
          <div>
            <div style={{ fontSize: 10, color: "#8FA1B3" }}>SALES</div>
            <div className="tnum font-bold" style={{ fontSize: 24, lineHeight: 1.1, color: "#F5B32B" }}>
              {V(a.expected.sales)}
            </div>
            {hasTarget && salesPct != null && (
              <div style={{ fontSize: 10, color: tone(salesPct) === C.red ? "#FF8A80" : "#7BC67E" }}>
                {salesPct}% of target
              </div>
            )}
          </div>
          <div>
            <div style={{ fontSize: 10, color: "#8FA1B3" }}>THROUGHPUT</div>
            <div className="tnum font-bold" style={{ fontSize: 24, lineHeight: 1.1, color: "#7BC67E" }}>
              {V(a.expected.throughput)}
            </div>
            {hasTarget && tpPct != null && (
              <div style={{ fontSize: 10, color: tone(tpPct) === C.red ? "#FF8A80" : "#7BC67E" }}>
                {tpPct}% of target
              </div>
            )}
          </div>
        </div>
        <div style={{ fontSize: 10, color: "#8FA1B3", marginTop: 2 }}>
          delivered + the book still due · click for the working
        </div>
      </button>

      {open && (
        <div onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(22,35,47,0.55)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg"
            style={{ width: "min(680px, 100%)", maxHeight: "88vh", overflowY: "auto" }}>
            <div className="px-4 py-3 flex items-start gap-3" style={{ background: C.ink }}>
              <div style={{ flex: 1 }}>
                <div className="text-xs font-bold" style={{ color: "#8FA1B3", letterSpacing: 1.2 }}>TOTAL ANTICIPATED · {fy}</div>
                <div className="font-bold text-white" style={{ fontSize: 16 }}>Where the year finishes, if the board holds</div>
              </div>
              <button onClick={() => setOpen(false)} className="font-bold" style={{ color: "#8FA1B3", fontSize: 20, lineHeight: 1 }}>✕</button>
            </div>

            <div className="p-4">
              <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ color: C.mute, borderBottom: `1px solid ${C.line}` }}>
                    <th className="text-left py-1.5" style={{ fontSize: 10, letterSpacing: 0.6 }}>WHAT</th>
                    <th className="text-right py-1.5" style={{ fontSize: 10, letterSpacing: 0.6 }}>JOBS</th>
                    <th className="text-right py-1.5" style={{ fontSize: 10, letterSpacing: 0.6 }}>SALES</th>
                    <th className="text-right py-1.5" style={{ fontSize: 10, letterSpacing: 0.6 }}>THROUGHPUT</th>
                  </tr>
                </thead>
                <tbody>
                  <Row what="Delivered since 1 April" note="already out of the door" jobs={null}
                    sales={actuals.sales} tp={actuals.throughput} V={V} colour={C.green} />
                  <Row what="Still due before 31 March" note="on the date each job carries" jobs={a.onDate.jobs}
                    sales={a.onDate.sales} tp={a.onDate.throughput} V={V} colour={C.navy} />
                  <Row what="Overdue, not yet delivered" note="counted in the year — the job still exists" jobs={a.overdue.jobs}
                    sales={a.overdue.sales} tp={a.overdue.throughput} V={V} colour={C.red} />
                  <tr style={{ background: C.ink, color: "#fff" }}>
                    <td className="py-2 px-1 font-bold">TOTAL ANTICIPATED</td>
                    <td className="py-2 text-right tnum">—</td>
                    <td className="py-2 text-right tnum font-bold" style={{ color: "#F5B32B" }}>{V(a.expected.sales)}</td>
                    <td className="py-2 text-right tnum font-bold" style={{ color: "#7BC67E" }}>{V(a.expected.throughput)}</td>
                  </tr>
                  {hasTarget && (
                    <>
                      <tr style={{ borderBottom: `1px solid ${C.line}` }}>
                        <td className="py-1.5 px-1" style={{ color: C.sub }}>Target</td>
                        <td />
                        <td className="py-1.5 text-right tnum" style={{ color: C.sub }}>{V(targets.sales)}</td>
                        <td className="py-1.5 text-right tnum" style={{ color: C.sub }}>{V(targets.throughput)}</td>
                      </tr>
                      <tr>
                        <td className="py-1.5 px-1 font-bold" style={{ color: C.body }}>Gap</td>
                        <td />
                        <td className="py-1.5 text-right tnum font-bold" style={{ color: tone(salesPct) }}>
                          {a.expected.sales >= targets.sales ? "+" : "−"}{V(Math.abs(targets.sales - a.expected.sales))}
                        </td>
                        <td className="py-1.5 text-right tnum font-bold" style={{ color: tone(tpPct) }}>
                          {a.expected.throughput >= targets.throughput ? "+" : "−"}{V(Math.abs(targets.throughput - a.expected.throughput))}
                        </td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>

              {/* What is NOT in the number. Left out of a total is not the same
                  as not existing, and a figure this size gets quoted. */}
              {(a.beyond.jobs > 0 || a.nodate.jobs > 0) && (
                <div className="rounded p-2.5 mt-3 text-xs" style={{ background: "#FFF7E6", border: "1px solid #F0D9A8", color: "#8A5A00", lineHeight: 1.55 }}>
                  <b>Not counted above:</b>
                  {a.beyond.jobs > 0 && (
                    <> {a.beyond.jobs} job{a.beyond.jobs === 1 ? "" : "s"} dated after {end.split("-").reverse().join("-")} ({V(a.beyond.sales)}) — they belong to next year.</>
                  )}
                  {a.nodate.jobs > 0 && (
                    <> {a.nodate.jobs} job{a.nodate.jobs === 1 ? "" : "s"} carry no target date ({V(a.nodate.sales)}) and cannot be placed in a year at all.</>
                  )}
                </div>
              )}

              <div className="text-xs mt-3" style={{ color: C.faint, lineHeight: 1.6 }}>
                This is an <b>expectation, not a forecast</b>. It assumes every pending job goes out on the date it
                carries today — including {a.overdue.jobs} already past {a.overdue.jobs === 1 ? "its" : "their"} date.
                Nothing here is weighted by how likely a job is to slip; the Required Run Rate below is what says whether
                the pace to get there is real.
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Row({
  what, note, jobs, sales, tp, V, colour,
}: {
  what: string; note: string; jobs: number | null; sales: number; tp: number; V: (n: number) => string; colour: string;
}) {
  return (
    <tr style={{ borderBottom: `1px solid ${C.line}` }}>
      <td className="py-1.5 px-1">
        <div className="font-semibold" style={{ color: C.ink }}>{what}</div>
        <div style={{ fontSize: 11, color: C.faint }}>{note}</div>
      </td>
      <td className="py-1.5 text-right tnum" style={{ color: C.sub }}>{jobs == null ? "—" : jobs}</td>
      <td className="py-1.5 text-right tnum font-semibold" style={{ color: colour }}>{V(sales)}</td>
      <td className="py-1.5 text-right tnum" style={{ color: C.green }}>{V(tp)}</td>
    </tr>
  );
}
