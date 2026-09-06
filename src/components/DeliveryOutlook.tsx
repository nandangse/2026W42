"use client";
// The Delivery Outlook — what the pending book says is coming, and whether it
// is enough.
//
// It opens from the PENDING JOBS card on the Job Delivery Board, because that
// card is the question and this is the answer: 105 jobs is a number, "62 Cr of
// them land in a single month and the four after it are empty" is a decision.
//
// Two readings, and they do different jobs:
//
//   THE MONTHS. Every pending job stacked on the month its Target Delivery
//   Date falls in, against the run rate the year's target actually requires.
//   The dotted line is the whole point — a bar chart of what is coming says
//   nothing until you can see the level it has to clear.
//
//   THE GRID. Kitting % against Production %, weighted by throughput. It
//   answers "which jobs should we finish", which is not the same question as
//   "which jobs are late": the top-right corner is money that is nearly earned
//   and only needs finishing, and the top-left is money already spent on jobs
//   that have not started moving.
//
// Everything here is computed from the jobs already on the board — the same
// filtered list the rest of the page is showing, so the owner filter and the
// search box carry into it rather than being quietly ignored.
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { today } from "@/lib/schedule";
import { monthKey, monthLabel } from "@/lib/fmt";

const C = {
  ink: "#16232F", body: "#22303C", sub: "#5A6672", mute: "#8A94A0", faint: "#B8B5AC",
  line: "#E2E0DA", panel: "#F4F2EC", accent: "#E8600A", navy: "#1B3A5C",
  green: "#0D7A3F", amber: "#D97706", red: "#B3261E", violet: "#7C3AED",
};

/** Only the fields the outlook reads — so this never has to track the Job type. */
export interface OutlookJob {
  id: string;
  tag: string;
  cust: string;
  fam: string;
  tdd: string | null;
  val: number;
  tpv: number;
  tpp: number;
  kit: number;
  pct: number;
}

type Metric = "nos" | "value" | "throughput";

const METRICS: { key: Metric; label: string; color: string }[] = [
  { key: "nos", label: "Jobs", color: C.navy },
  { key: "value", label: "Sales billing", color: C.accent },
  { key: "throughput", label: "Throughput", color: C.green },
];

const MONTHS_AHEAD = 12;




interface Bucket {
  key: string;
  label: string;
  nos: number;
  value: number;
  throughput: number;
  /** Already past its target date — a bar that should not exist. */
  overdue?: boolean;
}

/**
 * One bucket per month for the year ahead, plus an OVERDUE bucket at the front.
 *
 * The overdue bucket is not a tidy-up: a pending job whose target date has
 * already gone is the single most useful bar on this chart, and folding it
 * into "this month" would hide it inside a number that looks achievable.
 */
function bucketsOf(jobs: OutlookJob[], from: string): { buckets: Bucket[]; beyond: Bucket; undated: Bucket } {
  const start = monthKey(from);
  const keys: string[] = [];
  const d = new Date(from + "T00:00:00Z");
  for (let i = 0; i < MONTHS_AHEAD; i++) {
    keys.push(monthKey(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + i, 1)).toISOString().slice(0, 10)));
  }
  const last = keys[keys.length - 1];

  const zero = (key: string, label: string, overdue = false): Bucket => ({ key, label, nos: 0, value: 0, throughput: 0, overdue });
  const map = new Map<string, Bucket>(keys.map((k) => [k, zero(k, monthLabel(k))]));
  const overdue = zero("overdue", "Overdue", true);
  const beyond = zero("beyond", "Later");
  const undated = zero("undated", "No date");

  for (const j of jobs) {
    const into = !j.tdd
      ? undated
      : monthKey(j.tdd) < start
        ? overdue
        : monthKey(j.tdd) > last
          ? beyond
          : map.get(monthKey(j.tdd))!;
    into.nos += 1;
    into.value += Number(j.val) || 0;
    into.throughput += Number(j.tpv) || 0;
  }
  return { buckets: [overdue, ...keys.map((k) => map.get(k)!)], beyond, undated };
}

interface RunRatePayload {
  installed: boolean;
  hasTarget: boolean;
  fy: string;
  sales: { perMonth: number | null };
  throughput: { perMonth: number | null };
}

export default function DeliveryOutlook({
  jobs,
  V,
  onOpen,
}: {
  jobs: OutlookJob[];
  V: (n: number) => string;
  onOpen: (id: string) => void;
}) {
  const [metric, setMetric] = useState<Metric>("value");
  const [rate, setRate] = useState<{ value: number | null; throughput: number | null; fy: string } | null>(null);

  // The required run rate comes from the same place the boards' run-rate card
  // reads it, so the dotted line and that card can never disagree.
  useEffect(() => {
    let live = true;
    api
      .get("/api/run-rate")
      .then((r: RunRatePayload & { targets?: unknown }) => {
        if (!live || !r?.installed || !r.hasTarget) return;
        setRate({ value: r.sales?.perMonth ?? null, throughput: r.throughput?.perMonth ?? null, fy: r.fy });
      })
      .catch(() => { /* the line is a companion to the bars, not a gate on them */ });
    return () => { live = false; };
  }, []);

  const TODAY = today();
  const { buckets, beyond, undated } = useMemo(() => bucketsOf(jobs, TODAY), [jobs, TODAY]);

  const m = METRICS.find((x) => x.key === metric)!;
  const valueOf = (b: Bucket) => b[metric];
  const required = metric === "nos" ? null : rate ? rate[metric] : null;

  return (
    <div className="rounded-lg border bg-white mb-3" style={{ borderColor: C.line, overflow: "hidden" }}>
      <div className="flex items-center gap-2 flex-wrap px-3 py-2" style={{ background: C.panel, borderBottom: `1px solid ${C.line}` }}>
        <span className="text-xs font-bold" style={{ color: C.mute, letterSpacing: 1.1 }}>DELIVERY OUTLOOK</span>
        <span className="text-xs" style={{ color: C.sub }}>
          {jobs.length} pending job{jobs.length === 1 ? "" : "s"}, on the month each one is due
        </span>
        <div className="flex-1" style={{ minWidth: 10 }} />
        {METRICS.map((x) => (
          <button key={x.key} onClick={() => setMetric(x.key)} className="text-xs font-bold rounded px-2.5 py-1"
            style={metric === x.key
              ? { background: x.color, color: "#fff" }
              : { background: "#fff", border: `1px solid ${C.line}`, color: C.sub }}>
            {x.label}
          </button>
        ))}
      </div>

      <div className="p-3">
        <MonthBars buckets={buckets} valueOf={valueOf} color={m.color} metric={metric} required={required} V={V} fy={rate?.fy} />

        <div className="text-xs mt-2" style={{ color: C.faint, lineHeight: 1.5 }}>
          {beyond.nos > 0 && <>{beyond.nos} job{beyond.nos === 1 ? "" : "s"} due beyond {MONTHS_AHEAD} months ({V(beyond.value)}). </>}
          {undated.nos > 0 && <>{undated.nos} carr{undated.nos === 1 ? "ies" : "y"} no target date and cannot be placed in a month ({V(undated.value)}) — they are left off the chart rather than dropped into it. </>}
          {required != null && <>The dotted line is what {metric === "value" ? "sales billing" : "throughput"} has to average every month to make the {rate?.fy} target.</>}
        </div>

        <HeatMap jobs={jobs} V={V} onOpen={onOpen} />
      </div>
    </div>
  );
}

// ===========================================================================
/**
 * The bars, with the required run rate across them.
 *
 * Drawn as one SVG rather than divs because of the dotted line: a level that
 * has to sit at a real height against a real scale is the only honest way to
 * show "enough", and a CSS approximation of that is a lie waiting to happen.
 */
function MonthBars({
  buckets, valueOf, color, metric, required, V, fy,
}: {
  buckets: Bucket[];
  valueOf: (b: Bucket) => number;
  color: string;
  metric: Metric;
  required: number | null;
  V: (n: number) => string;
  fy?: string;
}) {
  const W = 900;
  const H = 240;
  const PAD_L = 8;
  const PAD_B = 34;
  const PAD_T = 16;

  const values = buckets.map(valueOf);
  // The scale must clear the run-rate line too, or a month that misses it by a
  // mile would draw the line off the top of the chart and read as no line.
  const max = Math.max(1, ...values, required ?? 0);
  const bw = (W - PAD_L * 2) / buckets.length;
  const h = (v: number) => ((H - PAD_T - PAD_B) * v) / max;
  const y = (v: number) => H - PAD_B - h(v);

  const fmt = (v: number) => (metric === "nos" ? String(Math.round(v)) : V(v));

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", minWidth: 620, height: "auto", display: "block" }} role="img"
        aria-label="Pending jobs by the month they are due">
        {/* baseline */}
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_L} y2={H - PAD_B} stroke={C.line} strokeWidth={1} />

        {buckets.map((b, i) => {
          const v = valueOf(b);
          const x = PAD_L + i * bw;
          const fill = b.overdue ? C.red : color;
          const over = required != null && v > required;
          return (
            <g key={b.key}>
              <title>{`${b.label}: ${b.nos} job${b.nos === 1 ? "" : "s"} · ${V(b.value)} · ${V(b.throughput)} throughput`}</title>
              {v > 0 && (
                <rect x={x + bw * 0.16} y={y(v)} width={bw * 0.68} height={Math.max(1, h(v))} fill={fill}
                  opacity={b.overdue ? 0.9 : over ? 1 : 0.82} rx={2} />
              )}
              {v > 0 && (
                <text x={x + bw / 2} y={y(v) - 4} textAnchor="middle" fontSize={10} fontWeight={700}
                  fill={b.overdue ? C.red : C.body}>
                  {fmt(v)}
                </text>
              )}
              <text x={x + bw / 2} y={H - PAD_B + 13} textAnchor="middle" fontSize={10}
                fontWeight={b.overdue ? 700 : 500} fill={b.overdue ? C.red : C.sub}>
                {b.label}
              </text>
              <text x={x + bw / 2} y={H - PAD_B + 25} textAnchor="middle" fontSize={9} fill={C.faint}>
                {b.nos || ""}
              </text>
            </g>
          );
        })}

        {/* the level the year's target requires */}
        {required != null && required > 0 && (
          <g>
            <line x1={PAD_L} y1={y(required)} x2={W - PAD_L} y2={y(required)}
              stroke={C.violet} strokeWidth={2} strokeDasharray="7 5" />
            <rect x={W - PAD_L - 150} y={y(required) - 15} width={150} height={14} fill="#fff" opacity={0.85} rx={2} />
            <text x={W - PAD_L - 4} y={y(required) - 4} textAnchor="end" fontSize={10} fontWeight={700} fill={C.violet}>
              required {V(required)}/month{fy ? ` · ${fy}` : ""}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

// ===========================================================================
const BANDS = [0, 20, 40, 60, 80, 100];
const bandOf = (pct: number) => {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  for (let i = BANDS.length - 2; i >= 0; i--) if (p >= BANDS[i]) return i;
  return 0;
};
const bandLabel = (i: number) => `${BANDS[i]}–${BANDS[i + 1]}%`;

/**
 * Kitting against Production, weighted by throughput.
 *
 * Read it corner by corner:
 *
 *   top-right    kitted and nearly built — throughput sitting one push from
 *                being earned. This is the corner to work.
 *   top-left     fully kitted and not started. Money spent, nothing moving.
 *   bottom-right built without its material, which normally means the kitting
 *                figure is wrong rather than the job is.
 *   bottom-left  not started and not bought. Fine, as long as the date is far.
 *
 * The cell is shaded by THROUGHPUT, not by job count, because four small jobs
 * and one large one in the same square are not the same decision.
 */
function HeatMap({ jobs, V, onOpen }: { jobs: OutlookJob[]; V: (n: number) => string; onOpen: (id: string) => void }) {
  const [sel, setSel] = useState<string | null>(null);

  const grid = useMemo(() => {
    const g: { nos: number; tp: number; val: number; jobs: OutlookJob[] }[][] = BANDS.slice(0, -1).map(() =>
      BANDS.slice(0, -1).map(() => ({ nos: 0, tp: 0, val: 0, jobs: [] as OutlookJob[] })),
    );
    for (const j of jobs) {
      const cell = g[bandOf(j.kit)][bandOf(j.pct)];
      cell.nos += 1;
      cell.tp += Number(j.tpv) || 0;
      cell.val += Number(j.val) || 0;
      cell.jobs.push(j);
    }
    return g;
  }, [jobs]);

  const maxTp = Math.max(1, ...grid.flat().map((c) => c.tp));
  const totalTp = grid.flat().reduce((s, c) => s + c.tp, 0);
  // the corner worth working: kitted 60%+ and built 60%+
  const ready = grid.slice(3).flatMap((row) => row.slice(3));
  const readyTp = ready.reduce((s, c) => s + c.tp, 0);
  const readyNos = ready.reduce((s, c) => s + c.nos, 0);
  const stalled = grid.slice(3).flatMap((row) => row.slice(0, 2));
  const stalledTp = stalled.reduce((s, c) => s + c.tp, 0);
  const stalledNos = stalled.reduce((s, c) => s + c.nos, 0);

  const selCell = sel ? grid[Number(sel.split(",")[0])][Number(sel.split(",")[1])] : null;

  return (
    <div className="mt-4">
      <div className="flex items-baseline gap-2 flex-wrap mb-1.5">
        <span className="text-xs font-bold" style={{ color: C.mute, letterSpacing: 1.1 }}>
          KITTING × PRODUCTION, BY THROUGHPUT
        </span>
        <span className="text-xs" style={{ color: C.faint }}>
          shaded by throughput expected value — click a square for the jobs in it
        </span>
      </div>

      <div className="flex gap-3 flex-wrap items-start">
        <div>
          <div style={{ display: "flex" }}>
            {/* y axis label */}
            <div style={{ width: 18, position: "relative" }}>
              <div style={{
                position: "absolute", left: -22, top: "50%", width: 120, textAlign: "center",
                transform: "rotate(-90deg) translateX(-50%)", transformOrigin: "left center",
                fontSize: 10, fontWeight: 700, color: C.mute, letterSpacing: 1,
              }}>
                KITTING %
              </div>
            </div>
            <div>
              {/* highest kitting band at the top, so "ready" is the top-right */}
              {[...grid.keys()].reverse().map((ky) => (
                <div key={ky} style={{ display: "flex", alignItems: "stretch" }}>
                  <div style={{ width: 52, fontSize: 10, color: C.sub, display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 6 }}>
                    {bandLabel(ky)}
                  </div>
                  {grid[ky].map((cell, kx) => {
                    const id = `${ky},${kx}`;
                    const share = cell.tp / maxTp;
                    const on = sel === id;
                    return (
                      <button
                        key={kx}
                        onClick={() => setSel(on ? null : id)}
                        title={`Kitting ${bandLabel(ky)} · Production ${bandLabel(kx)}\n${cell.nos} job${cell.nos === 1 ? "" : "s"}\n${V(cell.tp)} throughput\n${V(cell.val)} order value`}
                        style={{
                          width: 74, height: 46, border: on ? `2px solid ${C.ink}` : `1px solid ${C.line}`,
                          // one hue, intensity carrying the number: a rainbow
                          // would invite reading colour as category
                          background: cell.nos ? `rgba(13,122,63,${0.08 + share * 0.82})` : "#FBFAF7",
                          color: share > 0.55 ? "#fff" : cell.nos ? C.body : C.faint,
                          cursor: cell.nos ? "pointer" : "default",
                          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                          lineHeight: 1.2,
                        }}
                      >
                        <span className="tnum" style={{ fontSize: 13, fontWeight: 700 }}>{cell.nos || "·"}</span>
                        {cell.nos > 0 && <span className="tnum" style={{ fontSize: 9 }}>{V(cell.tp)}</span>}
                      </button>
                    );
                  })}
                </div>
              ))}
              <div style={{ display: "flex" }}>
                <div style={{ width: 52 }} />
                {BANDS.slice(0, -1).map((_, i) => (
                  <div key={i} style={{ width: 74, textAlign: "center", fontSize: 10, color: C.sub, paddingTop: 3 }}>
                    {bandLabel(i)}
                  </div>
                ))}
              </div>
              <div style={{ paddingLeft: 52, fontSize: 10, fontWeight: 700, color: C.mute, letterSpacing: 1, textAlign: "center", width: 74 * 5 + 52 }}>
                PRODUCTION %
              </div>
            </div>
          </div>
        </div>

        <div style={{ flex: "1 1 240px", minWidth: 230 }}>
          <div className="rounded-lg p-2.5 mb-2" style={{ background: "#E6F4EA", border: `1px solid ${C.green}` }}>
            <div className="text-xs font-bold" style={{ color: C.green }}>READY TO FINISH</div>
            <div className="tnum font-bold" style={{ fontSize: 20, color: C.green, lineHeight: 1.2 }}>{V(readyTp)}</div>
            <div className="text-xs" style={{ color: C.sub, lineHeight: 1.45 }}>
              {readyNos} job{readyNos === 1 ? "" : "s"} at 60%+ kitted and 60%+ built —{" "}
              {totalTp > 0 ? Math.round((readyTp / totalTp) * 100) : 0}% of all throughput on the board, mostly bought and
              mostly made. This is the corner that turns into billing fastest.
            </div>
          </div>
          <div className="rounded-lg p-2.5" style={{ background: "#FFF7E6", border: `1px solid ${C.amber}` }}>
            <div className="text-xs font-bold" style={{ color: C.amber }}>KITTED, NOT MOVING</div>
            <div className="tnum font-bold" style={{ fontSize: 20, color: C.amber, lineHeight: 1.2 }}>{V(stalledTp)}</div>
            <div className="text-xs" style={{ color: C.sub, lineHeight: 1.45 }}>
              {stalledNos} job{stalledNos === 1 ? "" : "s"} 60%+ kitted but under 40% built. The material is bought and
              sitting; nothing is being earned against it.
            </div>
          </div>
        </div>
      </div>

      {selCell && selCell.jobs.length > 0 && (
        <div className="rounded-lg border mt-2" style={{ borderColor: C.line, overflow: "hidden" }}>
          <div className="px-3 py-1.5 text-xs font-bold" style={{ background: C.panel, color: C.sub }}>
            {selCell.nos} job{selCell.nos === 1 ? "" : "s"} · {V(selCell.tp)} throughput · {V(selCell.val)} value
            <button onClick={() => setSel(null)} className="ml-2 font-bold" style={{ color: C.accent }}>✕ clear</button>
          </div>
          <div style={{ maxHeight: 240, overflowY: "auto" }}>
            <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
              <tbody>
                {[...selCell.jobs].sort((a, b) => b.tpv - a.tpv).map((j) => (
                  <tr key={j.id} style={{ borderTop: `1px solid ${C.line}` }}>
                    <td className="px-3 py-1">
                      <button onClick={() => onOpen(j.id)} className="font-bold underline decoration-dotted" style={{ color: C.navy }}>
                        {j.id.slice(-4)}
                      </button>
                    </td>
                    <td className="px-2 py-1" style={{ color: C.body }}>{j.tag}</td>
                    <td className="px-2 py-1 truncate" style={{ color: C.sub, maxWidth: 200 }}>{j.cust}</td>
                    <td className="px-2 py-1 text-center tnum" style={{ color: C.sub }}>kit {j.kit || 0}%</td>
                    <td className="px-2 py-1 text-center tnum" style={{ color: C.sub }}>built {j.pct || 0}%</td>
                    <td className="px-2 py-1 text-right tnum" style={{ color: C.green }}>{V(j.tpv || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
