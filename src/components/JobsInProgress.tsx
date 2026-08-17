"use client";
// Jobs in Progress — the pending book read three ways.
//
//   WHEN it lands.  Planned deliveries by month, as a table and a line.
//   WHAT it is.     The book split by product family.
//   WHERE it is.    Every job plotted on kitting against production, sized by
//                   throughput and coloured by family.
//
// The scatter is the one that earns its place. A table can tell you a job is
// 80% built; only the plot tells you that eleven jobs are 80% built and barely
// kitted, which is a different problem from eleven jobs kitted and untouched —
// and the size of the dots says which of those is worth money.
//
// Everything is drawn as inline SVG. No chart library, and no CSS
// approximations of a scale: a dot whose radius means throughput has to be
// laid out against a real axis or it is decoration.
import { useMemo, useState } from "react";
import { fmt, fmtFull, jobNo, otdColor } from "@/lib/schedule";

const C = {
  ink: "#16232F", body: "#22303C", sub: "#5A6672", mute: "#8A94A0", faint: "#B8B5AC",
  line: "#E2E0DA", panel: "#F4F2EC", accent: "#E8600A", navy: "#1B3A5C",
  green: "#0D7A3F", amber: "#D97706", red: "#B3261E", violet: "#7C3AED",
};

/** Only what the charts read, so this never has to track the Job type. */
export interface WipJob {
  id: string;
  tag: string;
  cust: string;
  fam: string;
  tdd: string | null;
  otd: string | null;
  stat: string;
  val: number;
  tpv: number;
  tpp: number;
  kit: number;
  pct: number;
  note: string;
  escalation: string | null;
  amtNeeded: number | null;
  payOnDelivery: number | null;
  ownerInitials: string | null;
  ownerName: string | null;
}

const CR = 1e7;
const cr = (v: number) => (v / CR).toFixed(2);

/**
 * One colour per product family, assigned by rank so the biggest families get
 * the most distinguishable hues. Stable for a given board: the same family is
 * the same colour every time the page is opened.
 */
const PALETTE = [
  "#E8600A", "#1B3A5C", "#0D7A3F", "#7C3AED", "#0D9488",
  "#B3261E", "#D97706", "#5A6672", "#C2185B", "#00838F",
  "#6D4C41", "#2E7D32",
];

const MONTHS_AHEAD = 12;
const monthKey = (iso: string) => iso.slice(0, 7);
const monthLabel = (k: string) =>
  new Date(k + "-01T00:00:00Z").toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });

export default function JobsInProgress({
  jobs, today, V, onOpenPlan,
}: {
  jobs: WipJob[];
  today: string;
  V: (n: number) => string;
  onOpenPlan: (id: string) => void;
}) {
  const [famFilter, setFamFilter] = useState("");
  const [picked, setPicked] = useState<WipJob | null>(null);

  // families, biggest throughput first — that ordering is what fixes the colours
  const families = useMemo(() => {
    const m = new Map<string, { fam: string; nos: number; val: number; tp: number }>();
    for (const j of jobs) {
      const f = j.fam?.trim() || "Unassigned";
      const e = m.get(f) || { fam: f, nos: 0, val: 0, tp: 0 };
      e.nos += 1; e.val += j.val || 0; e.tp += j.tpv || 0;
      m.set(f, e);
    }
    return [...m.values()].sort((a, b) => b.tp - a.tp || b.val - a.val);
  }, [jobs]);

  const colourOf = useMemo(() => {
    const m = new Map<string, string>();
    families.forEach((f, i) => m.set(f.fam, PALETTE[i % PALETTE.length]));
    return (fam: string) => m.get(fam?.trim() || "Unassigned") || C.mute;
  }, [families]);

  const shown = useMemo(
    () => (famFilter ? jobs.filter((j) => (j.fam?.trim() || "Unassigned") === famFilter) : jobs),
    [jobs, famFilter],
  );

  // ---- planned deliveries by month ----
  const months = useMemo(() => {
    const start = new Date(today + "T00:00:00Z");
    const keys: string[] = [];
    for (let i = 0; i < MONTHS_AHEAD; i++)
      keys.push(monthKey(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1)).toISOString().slice(0, 10)));
    const rows = keys.map((k) => ({ key: k, label: monthLabel(k), nos: 0, val: 0, tp: 0 }));
    const idx = new Map(rows.map((r, i) => [r.key, i]));
    const late = { key: "overdue", label: "Overdue", nos: 0, val: 0, tp: 0 };
    const beyond = { key: "beyond", label: "Later", nos: 0, val: 0, tp: 0 };
    const undated = { key: "none", label: "No date", nos: 0, val: 0, tp: 0 };
    for (const j of shown) {
      const into = !j.tdd
        ? undated
        : monthKey(j.tdd) < keys[0]
          ? late
          : idx.has(monthKey(j.tdd))
            ? rows[idx.get(monthKey(j.tdd))!]
            : beyond;
      into.nos += 1; into.val += j.val || 0; into.tp += j.tpv || 0;
    }
    return { rows, late, beyond, undated };
  }, [shown, today]);

  return (
    <div className="p-4">
      <div className="flex items-baseline gap-3 flex-wrap mb-3">
        <div>
          <div className="text-xs font-bold" style={{ color: C.mute, letterSpacing: 1.4 }}>PLANNING SUITE</div>
          <div className="text-lg font-bold" style={{ color: C.ink, lineHeight: 1.2 }}>Jobs in Progress</div>
        </div>
        <div className="flex-1" style={{ minWidth: 10 }} />
        <span className="text-xs" style={{ color: C.sub }}>
          {shown.length} of {jobs.length} jobs · {V(shown.reduce((s, j) => s + j.val, 0))} ·{" "}
          <span style={{ color: C.green }}>{V(shown.reduce((s, j) => s + (j.tpv || 0), 0))} throughput</span>
        </span>
        {famFilter && (
          <button onClick={() => setFamFilter("")} className="text-xs font-bold rounded px-2 py-1"
            style={{ background: C.accent, color: "#fff" }}>
            {famFilter} ✕
          </button>
        )}
      </div>

      <PlannedDeliveries months={months} V={V} />
      <ByFamily families={families} colourOf={colourOf} V={V} onPick={setFamFilter} picked={famFilter} />
      <Scatter jobs={shown} colourOf={colourOf} V={V} onPick={setPicked} />

      {picked && (
        <JobLightbox job={picked} V={V} colour={colourOf(picked.fam)} onClose={() => setPicked(null)}
          onOpenPlan={() => { const id = picked.id; setPicked(null); onOpenPlan(id); }} />
      )}
    </div>
  );
}

// ===========================================================================
interface MonthRow { key: string; label: string; nos: number; val: number; tp: number }

/**
 * The table and the line together.
 *
 * Value and throughput share the left axis because they share a unit and the
 * gap between them IS the material cost — worth seeing. The job count gets its
 * own axis on the right; forcing a count of 9 onto a rupee scale would draw it
 * flat along the bottom and say nothing.
 */
function PlannedDeliveries({
  months, V,
}: {
  months: { rows: MonthRow[]; late: MonthRow; beyond: MonthRow; undated: MonthRow };
  V: (n: number) => string;
}) {
  const rows = months.rows;
  const W = 900, H = 260, L = 46, R = 40, T = 14, B = 34;
  const maxMoney = Math.max(1, ...rows.map((r) => Math.max(r.val, r.tp)));
  const maxNos = Math.max(1, ...rows.map((r) => r.nos));
  const x = (i: number) => L + (i * (W - L - R)) / Math.max(1, rows.length - 1);
  const yM = (v: number) => H - B - ((H - T - B) * v) / maxMoney;
  const yN = (v: number) => H - B - ((H - T - B) * v) / maxNos;
  const path = (pick: (r: MonthRow) => number, y: (v: number) => number) =>
    rows.map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(pick(r)).toFixed(1)}`).join(" ");

  const SERIES = [
    { label: "Value", colour: C.accent, pick: (r: MonthRow) => r.val, y: yM, dash: "" },
    { label: "Throughput", colour: C.green, pick: (r: MonthRow) => r.tp, y: yM, dash: "" },
    { label: "Jobs (right axis)", colour: C.navy, pick: (r: MonthRow) => r.nos, y: yN, dash: "5 4" },
  ];

  return (
    <div className="rounded-lg border bg-white mb-3" style={{ borderColor: C.line, overflow: "hidden" }}>
      <div className="flex items-center gap-3 px-3 py-2 flex-wrap" style={{ background: C.panel, borderBottom: `1px solid ${C.line}` }}>
        <span className="text-xs font-bold" style={{ color: C.mute, letterSpacing: 1.1 }}>PLANNED DELIVERIES · NEXT {MONTHS_AHEAD} MONTHS</span>
        <div className="flex-1" />
        {SERIES.map((s) => (
          <span key={s.label} className="text-xs flex items-center gap-1" style={{ color: C.sub }}>
            <span style={{ width: 14, height: 3, background: s.colour, display: "inline-block", borderRadius: 2 }} />
            {s.label}
          </span>
        ))}
      </div>

      <div style={{ overflowX: "auto" }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", minWidth: 640, display: "block" }} role="img"
          aria-label="Planned deliveries by month">
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <g key={f}>
              <line x1={L} y1={yM(maxMoney * f)} x2={W - R} y2={yM(maxMoney * f)} stroke={C.line} strokeWidth={1} />
              <text x={L - 5} y={yM(maxMoney * f) + 3} textAnchor="end" fontSize={9} fill={C.faint}>
                {cr(maxMoney * f)}
              </text>
              <text x={W - R + 5} y={yN(maxNos * f) + 3} fontSize={9} fill={C.navy} opacity={0.7}>
                {Math.round(maxNos * f)}
              </text>
            </g>
          ))}
          <text x={L - 5} y={T - 3} textAnchor="end" fontSize={9} fontWeight={700} fill={C.mute}>₹ Cr</text>
          <text x={W - R + 5} y={T - 3} fontSize={9} fontWeight={700} fill={C.navy}>nos</text>

          {SERIES.map((s) => (
            <path key={s.label} d={path(s.pick, s.y)} fill="none" stroke={s.colour} strokeWidth={2}
              strokeDasharray={s.dash} strokeLinejoin="round" />
          ))}
          {rows.map((r, i) => (
            <g key={r.key}>
              {SERIES.map((s) => (
                <circle key={s.label} cx={x(i)} cy={s.y(s.pick(r))} r={2.5} fill={s.colour} />
              ))}
              <text x={x(i)} y={H - B + 13} textAnchor="middle" fontSize={9} fill={C.sub}>{r.label}</text>
              <title>{`${r.label}: ${r.nos} job${r.nos === 1 ? "" : "s"} · ${V(r.val)} · ${V(r.tp)} throughput`}</title>
            </g>
          ))}
        </svg>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table className="w-full text-xs" style={{ borderCollapse: "collapse", minWidth: 520 }}>
          <thead>
            <tr style={{ color: C.mute, borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}` }}>
              <th className="text-left px-3 py-1.5" style={{ fontSize: 10, letterSpacing: 0.6 }}>MONTH</th>
              <th className="text-right px-2 py-1.5" style={{ fontSize: 10, letterSpacing: 0.6 }}>JOBS</th>
              <th className="text-right px-2 py-1.5" style={{ fontSize: 10, letterSpacing: 0.6 }}>VALUE ₹ Cr</th>
              <th className="text-right px-2 py-1.5" style={{ fontSize: 10, letterSpacing: 0.6 }}>THROUGHPUT ₹ Cr</th>
            </tr>
          </thead>
          <tbody>
            {/* Overdue leads the table and is deliberately NOT on the line: a
                job whose date has gone is not a future month, and drawing it
                as one would flatter every month after it. */}
            {[months.late, ...rows, months.beyond, months.undated].filter((r) => r.nos > 0 || rows.includes(r)).map((r) => {
              const odd = r.key === "overdue";
              return (
                <tr key={r.key} style={{ borderBottom: `1px solid ${C.line}`, background: odd ? "#FBEDEA" : undefined }}>
                  <td className="px-3 py-1" style={{ color: odd ? C.red : C.body, fontWeight: odd ? 700 : 500 }}>{r.label}</td>
                  <td className="px-2 py-1 text-right tnum" style={{ color: r.nos ? C.body : C.faint }}>{r.nos || "—"}</td>
                  <td className="px-2 py-1 text-right tnum" style={{ color: r.nos ? C.accent : C.faint }}>{r.nos ? cr(r.val) : "—"}</td>
                  <td className="px-2 py-1 text-right tnum" style={{ color: r.nos ? C.green : C.faint }}>{r.nos ? cr(r.tp) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ===========================================================================
function ByFamily({
  families, colourOf, V, onPick, picked,
}: {
  families: { fam: string; nos: number; val: number; tp: number }[];
  colourOf: (f: string) => string;
  V: (n: number) => string;
  onPick: (f: string) => void;
  picked: string;
}) {
  const max = Math.max(1, ...families.map((f) => f.tp || f.val));
  return (
    <div className="rounded-lg border bg-white mb-3" style={{ borderColor: C.line, overflow: "hidden" }}>
      <div className="px-3 py-2" style={{ background: C.panel, borderBottom: `1px solid ${C.line}` }}>
        <span className="text-xs font-bold" style={{ color: C.mute, letterSpacing: 1.1 }}>TYPE OF JOBS</span>
        <span className="text-xs ml-2" style={{ color: C.faint }}>click a family to filter the plot below</span>
      </div>
      <div className="p-3 flex flex-col gap-1">
        {families.map((f) => {
          const on = picked === f.fam;
          return (
            <button key={f.fam} onClick={() => onPick(on ? "" : f.fam)}
              className="flex items-center gap-2 text-left rounded px-1 py-0.5"
              style={{ background: on ? colourOf(f.fam) + "18" : undefined, cursor: "pointer" }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: colourOf(f.fam), flexShrink: 0 }} />
              <span className="text-xs font-semibold" style={{ color: C.body, width: 150, flexShrink: 0 }}>{f.fam}</span>
              <span className="tnum text-xs" style={{ color: C.sub, width: 34, textAlign: "right" }}>{f.nos}</span>
              <div style={{ flex: 1, height: 10, background: "#EFEDE7", borderRadius: 2, minWidth: 60 }}>
                <div style={{ width: `${((f.tp || f.val) / max) * 100}%`, height: 10, background: colourOf(f.fam), borderRadius: 2 }} />
              </div>
              <span className="tnum text-xs" style={{ color: C.accent, width: 74, textAlign: "right" }}>{V(f.val)}</span>
              <span className="tnum text-xs" style={{ color: C.green, width: 74, textAlign: "right" }}>{V(f.tp)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ===========================================================================
/**
 * Every job on kitting against production.
 *
 * Radius is proportional to the SQUARE ROOT of throughput, so it is the AREA
 * of a dot that carries the number. Radius-proportional bubbles overstate the
 * big ones by the square — the eye reads area, and a chart that lies to the
 * eye is worse than a table.
 */
function Scatter({
  jobs, colourOf, V, onPick,
}: {
  jobs: WipJob[];
  colourOf: (f: string) => string;
  V: (n: number) => string;
  onPick: (j: WipJob) => void;
}) {
  const W = 900, H = 520, L = 52, R = 18, T = 18, B = 44;
  const maxTp = Math.max(1, ...jobs.map((j) => j.tpv || 0));
  const x = (pct: number) => L + ((W - L - R) * Math.max(0, Math.min(100, pct || 0))) / 100;
  const y = (pct: number) => H - B - ((H - T - B) * Math.max(0, Math.min(100, pct || 0))) / 100;
  const r = (tp: number) => 4 + 26 * Math.sqrt(Math.max(0, tp || 0) / maxTp);

  // biggest first so the small ones land on top and stay clickable
  const ordered = [...jobs].sort((a, b) => (b.tpv || 0) - (a.tpv || 0));

  return (
    <div className="rounded-lg border bg-white" style={{ borderColor: C.line, overflow: "hidden" }}>
      <div className="px-3 py-2 flex items-baseline gap-2 flex-wrap" style={{ background: C.panel, borderBottom: `1px solid ${C.line}` }}>
        <span className="text-xs font-bold" style={{ color: C.mute, letterSpacing: 1.1 }}>EVERY JOB · KITTING vs PRODUCTION</span>
        <span className="text-xs" style={{ color: C.faint }}>
          dot area = throughput · colour = product family · click one for the job
        </span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", minWidth: 620, display: "block" }} role="img"
          aria-label="Jobs plotted by kitting and production percentage">
          {/* quadrant wash: the top-right is the corner worth finishing */}
          <rect x={x(60)} y={y(100)} width={x(100) - x(60)} height={y(60) - y(100)} fill={C.green} opacity={0.05} />
          <text x={x(100) - 6} y={y(100) + 14} textAnchor="end" fontSize={10} fontWeight={700} fill={C.green} opacity={0.75}>
            kitted and nearly built
          </text>
          <rect x={L} y={y(100)} width={x(40) - L} height={y(60) - y(100)} fill={C.amber} opacity={0.06} />
          <text x={L + 6} y={y(100) + 14} fontSize={10} fontWeight={700} fill={C.amber} opacity={0.8}>
            bought, not started
          </text>

          {[0, 20, 40, 60, 80, 100].map((v) => (
            <g key={v}>
              <line x1={x(v)} y1={T} x2={x(v)} y2={H - B} stroke={C.line} strokeWidth={1} />
              <line x1={L} y1={y(v)} x2={W - R} y2={y(v)} stroke={C.line} strokeWidth={1} />
              <text x={x(v)} y={H - B + 14} textAnchor="middle" fontSize={9} fill={C.sub}>{v}%</text>
              <text x={L - 6} y={y(v) + 3} textAnchor="end" fontSize={9} fill={C.sub}>{v}%</text>
            </g>
          ))}
          <text x={(L + W - R) / 2} y={H - 8} textAnchor="middle" fontSize={11} fontWeight={700} fill={C.mute}>
            PRODUCTION %
          </text>
          <text x={14} y={(T + H - B) / 2} textAnchor="middle" fontSize={11} fontWeight={700} fill={C.mute}
            transform={`rotate(-90 14 ${(T + H - B) / 2})`}>
            KITTING %
          </text>

          {ordered.map((j) => (
            <circle
              key={j.id}
              cx={x(j.pct)} cy={y(j.kit)} r={r(j.tpv)}
              fill={colourOf(j.fam)} fillOpacity={0.5}
              stroke={colourOf(j.fam)} strokeWidth={1.5}
              style={{ cursor: "pointer" }}
              onClick={() => onPick(j)}
            >
              <title>
                {`${j.tag || "JOB " + jobNo(j.id)}\n${j.cust}\n${j.fam}\nProduction ${j.pct || 0}% · Kitting ${j.kit || 0}%\n${V(j.val)} · ${V(j.tpv || 0)} throughput\nTarget ${fmtFull(j.tdd)}`}
              </title>
            </circle>
          ))}
          {jobs.length === 0 && (
            <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={13} fill={C.mute}>No jobs match this filter.</text>
          )}
        </svg>
      </div>
    </div>
  );
}

// ===========================================================================
/**
 * A job, in a lightbox.
 *
 * Clicking outside closes it and leaves the plot exactly as it was — which is
 * the point of a lightbox here rather than a navigation: exploring a scatter
 * means opening six jobs in a row, and losing the chart each time would make
 * that not worth doing.
 */
function JobLightbox({
  job, V, colour, onClose, onOpenPlan,
}: {
  job: WipJob; V: (n: number) => string; colour: string; onClose: () => void; onOpenPlan: () => void;
}) {
  const money: [string, number | null, string][] = [
    ["Value", job.val, C.accent],
    ["Throughput", job.tpv, C.green],
    ["Amount needed next month", job.amtNeeded, C.amber],
    ["Pending payment on delivery", job.payOnDelivery, C.green],
  ];

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(22,35,47,0.55)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg"
        style={{ width: "min(640px, 100%)", maxHeight: "88vh", overflowY: "auto" }}>
        <div className="px-4 py-3 flex items-start gap-3" style={{ background: C.ink }}>
          <div style={{ flex: 1 }}>
            <div className="text-xs font-bold flex items-center gap-2" style={{ color: "#8FA1B3", letterSpacing: 1.2 }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: colour }} />
              JOB {jobNo(job.id)} · {job.fam}
            </div>
            <div className="font-bold text-white" style={{ fontSize: 16, lineHeight: 1.25 }}>{job.tag || "(no tag)"}</div>
            <div className="text-xs" style={{ color: "#8FA1B3" }}>{job.cust}</div>
          </div>
          <button onClick={onClose} className="font-bold" style={{ color: "#8FA1B3", fontSize: 20, lineHeight: 1 }}>✕</button>
        </div>

        <div className="p-4">
          <div className="flex gap-2 flex-wrap mb-3">
            <Bit label="Production" value={`${job.pct || 0}%`} color={C.navy} />
            <Bit label="Kitting" value={`${job.kit || 0}%`} color={(job.kit || 0) >= 80 ? C.green : (job.kit || 0) >= 40 ? C.amber : C.red} />
            <Bit label="Target delivery" value={fmt(job.tdd)} color={job.tdd && job.tdd < new Date().toISOString().slice(0, 10) ? C.red : C.body} />
            <Bit label="OTD date" value={fmt(job.otd)} color={otdColor(job.otd)} />
            <Bit label="Owner" value={job.ownerInitials || "—"} color={C.sub} />
          </div>

          <div className="flex gap-2 flex-wrap mb-3">
            {money.map(([l, v, col]) => (
              <div key={l} className="rounded px-2 py-1" style={{ background: C.panel, flex: "1 1 120px" }}>
                <div style={{ fontSize: 10, color: C.mute, letterSpacing: 0.4 }}>{l.toUpperCase()}</div>
                <div className="tnum font-bold" style={{ fontSize: 15, color: v == null ? C.faint : col }}>
                  {v == null ? "—" : V(v)}
                </div>
              </div>
            ))}
          </div>

          {job.escalation && (
            <div className="rounded p-2 mb-2" style={{ background: "#FBEDEA", borderLeft: `3px solid ${C.red}` }}>
              <div style={{ fontSize: 10, color: C.red, fontWeight: 700, letterSpacing: 0.4 }}>CURRENT PROJECT ESCALATION</div>
              <div className="text-xs" style={{ color: C.body, lineHeight: 1.5 }}>{job.escalation}</div>
            </div>
          )}
          {job.stat && <div className="text-xs mb-1" style={{ color: C.sub }}><b>Status:</b> {job.stat}</div>}
          {job.note && <div className="text-xs" style={{ color: C.sub, lineHeight: 1.55 }}>{job.note}</div>}

          <button onClick={onOpenPlan} className="mt-3 rounded px-4 py-2 text-sm font-bold" style={{ background: C.accent, color: "#fff" }}>
            Open the full job plan →
          </button>
        </div>
      </div>
    </div>
  );
}

function Bit({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded px-2 py-1" style={{ background: C.panel }}>
      <div style={{ fontSize: 10, color: C.mute, letterSpacing: 0.4 }}>{label.toUpperCase()}</div>
      <div className="tnum font-bold" style={{ fontSize: 14, color }}>{value}</div>
    </div>
  );
}
