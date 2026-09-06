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
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { runRate } from "@/lib/run-rate";
import AnticipatedFY, { type Anticipated } from "./AnticipatedFY";
import { fmt, fmtFull, jobNo, otdColor } from "@/lib/schedule";
import { monthKey, monthLabel } from "@/lib/fmt";

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
  mandays?: string | null;
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

/**
 * Six months ahead at most — and fewer if the book runs out sooner.
 *
 * The first cut drew twelve, and eight of them were empty: a line that lies
 * flat along zero for two thirds of its width reads as a collapse in orders
 * rather than as the end of the data. Trailing empty months are dropped and
 * the count is stated, so "nothing planned past November" is a sentence rather
 * than a shape.
 */
const MONTHS_AHEAD = 6;



/** The jobs behind one bar of the delivery chart. */
function jobsInBucket(jobs: WipJob[], key: string, today: string, rows: { key: string }[]): WipJob[] {
  const first = rows[0]?.key ?? monthKey(today);
  const last = rows[rows.length - 1]?.key ?? first;
  if (key === "overdue") return jobs.filter((j) => j.tdd && monthKey(j.tdd) < first);
  if (key === "beyond") return jobs.filter((j) => j.tdd && monthKey(j.tdd) > last);
  if (key === "none") return jobs.filter((j) => !j.tdd);
  if (key === "all") return jobs;
  return jobs.filter((j) => j.tdd && monthKey(j.tdd) === key);
}

export default function JobsInProgress({
  jobs, today, V, onOpenPlan, canEdit, onSaved,
}: {
  jobs: WipJob[];
  today: string;
  V: (n: number) => string;
  onOpenPlan: (id: string) => void;
  canEdit: boolean;
  /** re-read the board after a field is corrected */
  onSaved: () => Promise<unknown>;
}) {
  const [famFilter, setFamFilter] = useState("");
  const [picked, setPicked] = useState<WipJob | null>(null);
  /**
   * The open lightbox follows the list (Dr Raghu, 2 Sep 2026: "after edit
   * still old data is seen"). `picked` was a copy taken at click time, so a
   * saved change reloaded the board behind a panel still showing the old
   * number — a confirmation contradicting itself.
   */
  useEffect(() => {
    if (!picked) return;
    const fresh = jobs.find((x) => x.id === picked.id);
    if (fresh && fresh !== picked) setPicked(fresh);
  }, [jobs, picked]);
  /** Targets, what has been billed, and the book still to come. */
  const [rr, setRr] = useState<{
    fy: string; end: string; hasTarget: boolean;
    targets: { sales: number; throughput: number };
    actuals: { sales: number; throughput: number };
    anticipated: Anticipated;
  } | null>(null);
  useEffect(() => {
    api.get("/api/run-rate").then((r) => { if (r?.installed && r.anticipated) setRr(r); }).catch(() => {});
  }, []);
  // a named set of jobs behind whatever total was clicked
  const [list, setList] = useState<{ title: string; jobs: WipJob[] } | null>(null);

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
    // drop the trailing empties; keep at least one so the panel is never blank
    let last = rows.length - 1;
    while (last > 0 && rows[last].nos === 0) last--;
    const trimmed = rows.slice(0, last + 1);
    const totals = [...trimmed, late, beyond, undated].reduce(
      (a, r) => ({ nos: a.nos + r.nos, val: a.val + r.val, tp: a.tp + r.tp }),
      { nos: 0, val: 0, tp: 0 },
    );
    return { rows: trimmed, late, beyond, undated, totals, asked: MONTHS_AHEAD };
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

      {/* The same box as Delivered Jobs. What is on this page is the middle
          line of it — the book still to come — so the total it feeds belongs
          in front of whoever is reading the book. */}
      {rr && (
        <div className="mb-3" style={{ maxWidth: 420 }}>
          <AnticipatedFY
            fy={rr.fy} end={rr.end} anticipated={rr.anticipated} actuals={rr.actuals}
            targets={rr.targets} hasTarget={rr.hasTarget} V={V}
          />
        </div>
      )}

      <PlannedDeliveries months={months} V={V} today={today} rr={rr}
        onOpenMonth={(key, label) => setList({ title: label, jobs: jobsInBucket(shown, key, today, months.rows) })} />
      <ByFamily families={families} colourOf={colourOf} V={V} picked={famFilter}
        onFilter={(f) => setFamFilter(f)}
        onOpen={(f) => setList({ title: f, jobs: jobs.filter((j) => (j.fam?.trim() || "Unassigned") === f) })} />
      <Scatter jobs={shown} colourOf={colourOf} V={V} onPick={setPicked} />

      {list && (
        <JobListBox title={list.title} jobs={list.jobs} V={V} onClose={() => setList(null)}
          onPick={(j) => { setList(null); setPicked(j); }} />
      )}
      {picked && (
        <JobLightbox job={picked} V={V} colour={colourOf(picked.fam)} onClose={() => setPicked(null)}
          canEdit={canEdit} onSaved={onSaved}
          onOpenPlan={() => { const id = picked.id; setPicked(null); onOpenPlan(id); }} />
      )}
    </div>
  );
}

// ===========================================================================
/**
 * The jobs behind a number.
 *
 * Every total on this page is clickable and lands here. A chart that shows a
 * month is worth 8.38 Cr and cannot tell you WHICH eight jobs is a chart you
 * have to leave to act on, and leaving means losing the chart.
 */
function JobListBox({
  title, jobs, V, onClose, onPick,
}: {
  title: string; jobs: WipJob[]; V: (n: number) => string; onClose: () => void; onPick: (j: WipJob) => void;
}) {
  const rows = [...jobs].sort((a, b) => (a.tdd || "9999").localeCompare(b.tdd || "9999"));
  const tot = rows.reduce((a, j) => ({ val: a.val + (j.val || 0), tp: a.tp + (j.tpv || 0) }), { val: 0, tp: 0 });
  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(22,35,47,0.55)", zIndex: 68, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg"
        style={{ width: "min(820px, 100%)", maxHeight: "86vh", display: "flex", flexDirection: "column" }}>
        <div className="px-4 py-3 flex items-center gap-3" style={{ background: C.ink }}>
          <div style={{ flex: 1 }}>
            <div className="text-xs font-bold" style={{ color: "#8FA1B3", letterSpacing: 1.2 }}>{rows.length} JOB{rows.length === 1 ? "" : "S"}</div>
            <div className="font-bold text-white" style={{ fontSize: 16 }}>{title}</div>
          </div>
          <div className="text-right">
            <div className="tnum font-bold" style={{ color: C.accent, fontSize: 15 }}>{V(tot.val)}</div>
            <div className="tnum" style={{ color: "#7BC67E", fontSize: 12 }}>{V(tot.tp)} throughput</div>
          </div>
          <button onClick={onClose} className="font-bold" style={{ color: "#8FA1B3", fontSize: 20, lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ overflowY: "auto" }}>
          <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: C.mute, borderBottom: `1px solid ${C.line}`, position: "sticky", top: 0, background: "#fff" }}>
                <th className="text-left px-3 py-1.5" style={{ fontSize: 10, letterSpacing: 0.6 }}>JOB</th>
                <th className="text-left px-2 py-1.5" style={{ fontSize: 10, letterSpacing: 0.6 }}>CUSTOMER</th>
                <th className="text-left px-2 py-1.5" style={{ fontSize: 10, letterSpacing: 0.6 }}>TAG</th>
                <th className="text-center px-2 py-1.5" style={{ fontSize: 10, letterSpacing: 0.6 }}>TDD</th>
                <th className="text-right px-2 py-1.5" style={{ fontSize: 10, letterSpacing: 0.6 }}>VALUE</th>
                <th className="text-right px-3 py-1.5" style={{ fontSize: 10, letterSpacing: 0.6 }}>THROUGHPUT</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((j) => (
                <tr key={j.id} onClick={() => onPick(j)} style={{ borderBottom: `1px solid ${C.line}`, cursor: "pointer" }}>
                  <td className="px-3 py-1.5 font-bold tnum" style={{ color: C.navy }}>{jobNo(j.id)}</td>
                  <td className="px-2 py-1.5 truncate" style={{ color: C.body, maxWidth: 190 }}>{j.cust}</td>
                  <td className="px-2 py-1.5 truncate" style={{ color: C.sub, maxWidth: 170 }}>{j.tag}</td>
                  <td className="px-2 py-1.5 text-center tnum" style={{ color: j.tdd && j.tdd < new Date().toISOString().slice(0, 10) ? C.red : C.sub }}>{fmtFull(j.tdd)}</td>
                  <td className="px-2 py-1.5 text-right tnum" style={{ color: C.accent }}>{V(j.val)}</td>
                  <td className="px-3 py-1.5 text-right tnum" style={{ color: C.green }}>{V(j.tpv || 0)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-8 text-center" style={{ color: C.mute }}>No jobs here.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-3 py-1.5 text-xs" style={{ background: C.panel, color: C.faint, borderTop: `1px solid ${C.line}` }}>
          Click any row for the job itself.
        </div>
      </div>
    </div>
  );
}

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
  months, V, today, onOpenMonth, rr,
}: {
  months: { rows: MonthRow[]; late: MonthRow; beyond: MonthRow; undated: MonthRow; totals: { nos: number; val: number; tp: number }; asked: number };
  V: (n: number) => string;
  today: string;
  onOpenMonth: (key: string, label: string) => void;
  rr: {
    fy: string; hasTarget: boolean;
    targets: { sales: number; throughput: number };
    actuals: { sales: number; throughput: number };
  } | null;
}) {
  const rows = months.rows;
  // "Without value" must hide THESE numbers too — cr() was painting the month
  // table and the axis raw while every other figure went through V (the leak
  // Dr Raghu caught, 28 Aug 2026).
  const masked = V(0).includes("•");
  const crV = (v: number) => (masked ? "•••" : cr(v));
  const W = 560, H = 250, L = 44, R = 34, T = 16, B = 34;
  const maxMoney = Math.max(1, ...rows.map((r) => Math.max(r.val, r.tp)));
  const maxNos = Math.max(1, ...rows.map((r) => r.nos));
  const x = (i: number) => (rows.length === 1 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (rows.length - 1));
  const yM = (v: number) => H - B - ((H - T - B) * v) / maxMoney;
  const yN = (v: number) => H - B - ((H - T - B) * v) / maxNos;
  const path = (pick: (r: MonthRow) => number, y: (v: number) => number) =>
    rows.map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(pick(r)).toFixed(1)}`).join(" ");

  const SERIES = [
    { label: "Value", colour: C.accent, pick: (r: MonthRow) => r.val, y: yM, dash: "" },
    { label: "Throughput", colour: C.green, pick: (r: MonthRow) => r.tp, y: yM, dash: "" },
    { label: "Jobs", colour: C.navy, pick: (r: MonthRow) => r.nos, y: yN, dash: "5 4" },
  ];

  const extra = [months.late, months.beyond, months.undated].filter((r) => r.nos > 0);

  const Row = ({ r, tone }: { r: MonthRow; tone?: string }) => (
    <tr onClick={() => onOpenMonth(r.key, r.label)} title={`The ${r.nos} job${r.nos === 1 ? "" : "s"} in ${r.label}`}
      style={{ borderBottom: `1px solid ${C.line}`, cursor: r.nos ? "pointer" : "default", background: tone }}>
      <td className="px-2 py-1" style={{ color: tone ? C.red : C.body, fontWeight: tone ? 700 : 500 }}>{r.label}</td>
      <td className="px-2 py-1 text-right tnum" style={{ color: r.nos ? C.body : C.faint }}>{r.nos || "—"}</td>
      <td className="px-2 py-1 text-right tnum" style={{ color: r.nos ? C.accent : C.faint }}>{r.nos ? crV(r.val) : "—"}</td>
      <td className="px-2 py-1 text-right tnum" style={{ color: r.nos ? C.green : C.faint }}>{r.nos ? crV(r.tp) : "—"}</td>
    </tr>
  );

  return (
    <div className="rounded-lg border bg-white mb-3" style={{ borderColor: C.line, overflow: "hidden" }}>
      <div className="flex items-center gap-3 px-3 py-2 flex-wrap" style={{ background: C.panel, borderBottom: `1px solid ${C.line}` }}>
        <span className="text-xs font-bold" style={{ color: C.mute, letterSpacing: 1.1 }}>
          PLANNED DELIVERIES · {rows.length} MONTH{rows.length === 1 ? "" : "S"}
        </span>
        <span className="text-xs" style={{ color: C.faint }}>
          {rows.length < months.asked
            ? `nothing planned past ${rows[rows.length - 1]?.label} — the empty months are left off rather than drawn flat`
            : `next ${months.asked} months`}
        </span>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))" }}>
        {/* ---- left: the line ---- */}
        <div style={{ borderRight: `1px solid ${C.line}` }}>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }} role="img"
            aria-label="Planned deliveries by month">
            {[0, 0.5, 1].map((f) => (
              <g key={f}>
                <line x1={L} y1={yM(maxMoney * f)} x2={W - R} y2={yM(maxMoney * f)} stroke={C.line} strokeWidth={1} />
                <text x={L - 5} y={yM(maxMoney * f) + 3} textAnchor="end" fontSize={9} fill={C.faint}>{crV(maxMoney * f)}</text>
                <text x={W - R + 4} y={yN(maxNos * f) + 3} fontSize={9} fill={C.navy} opacity={0.7}>{Math.round(maxNos * f)}</text>
              </g>
            ))}
            <text x={L - 5} y={T - 4} textAnchor="end" fontSize={9} fontWeight={700} fill={C.mute}>₹ Cr</text>
            <text x={W - R + 4} y={T - 4} fontSize={9} fontWeight={700} fill={C.navy}>nos</text>

            {SERIES.map((sr) => (
              <path key={sr.label} d={path(sr.pick, sr.y)} fill="none" stroke={sr.colour} strokeWidth={2}
                strokeDasharray={sr.dash} strokeLinejoin="round" />
            ))}
            {rows.map((r, i) => (
              <g key={r.key} onClick={() => onOpenMonth(r.key, r.label)} style={{ cursor: "pointer" }}>
                <rect x={x(i) - (W - L - R) / (rows.length * 2 || 1)} y={T} width={(W - L - R) / (rows.length || 1)} height={H - T - B} fill="transparent" />
                {SERIES.map((sr) => <circle key={sr.label} cx={x(i)} cy={sr.y(sr.pick(r))} r={3} fill={sr.colour} />)}
                <text x={x(i)} y={H - B + 14} textAnchor="middle" fontSize={9} fill={C.sub}>{r.label}</text>
                <title>{`${r.label}: ${r.nos} job${r.nos === 1 ? "" : "s"} · ${V(r.val)} · ${V(r.tp)} throughput\nClick for the jobs`}</title>
              </g>
            ))}
          </svg>
          {/* The legend belongs against the lines, not across the panel header
              two feet away — a key you have to look up from the chart to read
              is a key nobody uses. */}
          <div className="flex items-center gap-3 flex-wrap px-3 pb-2" style={{ marginTop: -4 }}>
            {SERIES.map((sr) => (
              <span key={sr.label} className="text-xs flex items-center gap-1" style={{ color: C.sub }}>
                <span style={{ width: 16, height: 3, background: sr.colour, display: "inline-block", borderRadius: 2,
                  ...(sr.dash ? { backgroundImage: `repeating-linear-gradient(90deg, ${sr.colour} 0 4px, transparent 4px 7px)`, background: "none" } : {}) }} />
                {sr.label}
              </span>
            ))}
          </div>
        </div>

        {/* ---- right: the table, totals first ---- */}
        <div style={{ overflowX: "auto" }}>
          <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: C.mute, borderBottom: `1px solid ${C.line}` }}>
                <th className="text-left px-2 py-1.5" style={{ fontSize: 10, letterSpacing: 0.6 }}>MONTH</th>
                <th className="text-right px-2 py-1.5" style={{ fontSize: 10, letterSpacing: 0.6 }}>JOBS</th>
                <th className="text-right px-2 py-1.5" style={{ fontSize: 10, letterSpacing: 0.6 }}>VALUE ₹ Cr</th>
                <th className="text-right px-2 py-1.5" style={{ fontSize: 10, letterSpacing: 0.6 }}>THRUPUT ₹ Cr</th>
              </tr>
            </thead>
            <tbody>
              {/* The total leads. It is the whole book — every month shown,
                  plus overdue, later and undated — so the rows beneath can
                  never add up to more than the line above them. */}
              <tr onClick={() => onOpenMonth("all", "Every pending job")}
                style={{ background: C.ink, cursor: "pointer" }} title="Every pending job">
                <td className="px-2 py-1.5 font-bold" style={{ color: "#fff" }}>TOTAL</td>
                <td className="px-2 py-1.5 text-right tnum font-bold" style={{ color: "#fff" }}>{months.totals.nos}</td>
                <td className="px-2 py-1.5 text-right tnum font-bold" style={{ color: "#F5B32B" }}>{crV(months.totals.val)}</td>
                <td className="px-2 py-1.5 text-right tnum font-bold" style={{ color: "#7BC67E" }}>{crV(months.totals.tp)}</td>
              </tr>
              {months.late.nos > 0 && <Row r={months.late} tone="#FBEDEA" />}
              {rows.map((r) => <Row key={r.key} r={r} />)}
              {extra.filter((r) => r.key !== "overdue").map((r) => <Row key={r.key} r={r} />)}
            </tbody>
          </table>
          <div className="px-2 py-1.5 text-xs" style={{ color: C.faint }}>Click any row for the jobs behind it.</div>
          {/* What the book above has to clear. The table says what is coming;
              this says what is required — and the two sitting apart is how a
              month of orders gets read as good news on its own. */}
          {rr?.hasTarget && (() => {
            const r = runRate(today, rr.targets, rr.actuals);
            return (
              <div className="px-2 py-2 text-xs" style={{ borderTop: `1px solid ${C.line}`, background: C.panel, lineHeight: 1.6 }}>
                <span className="font-bold" style={{ color: C.violet }}>Required run rate</span>{" "}
                <span style={{ color: C.sub }}>to make {rr.fy}:</span>{" "}
                <b className="tnum" style={{ color: C.accent }}>
                  {r.sales.perMonth == null ? "—" : `${(r.sales.perMonth / CR).toFixed(2)} Cr`}
                </b>
                <span style={{ color: C.sub }}> per month in sales, with a throughput of </span>
                <b className="tnum" style={{ color: C.green }}>
                  {r.throughput.perMonth == null ? "—" : `${(r.throughput.perMonth / CR).toFixed(2)} Cr`}
                </b>
                <span style={{ color: C.sub }}> per month</span>
                <span style={{ color: C.faint }}> · {r.left} days left of {r.total}</span>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
function ByFamily({
  families, colourOf, V, onFilter, onOpen, picked,
}: {
  families: { fam: string; nos: number; val: number; tp: number }[];
  colourOf: (f: string) => string;
  V: (n: number) => string;
  /** Narrow the plot below to one family. */
  onFilter: (f: string) => void;
  /** Open the jobs in that family. */
  onOpen: (f: string) => void;
  picked: string;
}) {
  const max = Math.max(1, ...families.map((f) => f.tp || f.val));
  return (
    <div className="rounded-lg border bg-white mb-3" style={{ borderColor: C.line, overflow: "hidden" }}>
      <div className="px-3 py-2" style={{ background: C.panel, borderBottom: `1px solid ${C.line}` }}>
        <span className="text-xs font-bold" style={{ color: C.mute, letterSpacing: 1.1 }}>TYPE OF JOBS</span>
        <span className="text-xs ml-2" style={{ color: C.faint }}>
          click a family for its jobs · the ◧ button filters the plot below instead
        </span>
      </div>
      <div className="p-3 flex flex-col gap-1">
        {families.map((f) => {
          const on = picked === f.fam;
          return (
            <div key={f.fam} className="flex items-center gap-2 rounded px-1"
              style={{ background: on ? colourOf(f.fam) + "18" : undefined }}>
              <button onClick={() => onFilter(on ? "" : f.fam)} title={on ? "Show every family again" : `Show only ${f.fam} on the plot`}
                className="text-xs font-bold rounded"
                style={{ width: 20, height: 20, flexShrink: 0, background: on ? colourOf(f.fam) : "#fff", color: on ? "#fff" : C.faint, border: `1px solid ${on ? colourOf(f.fam) : C.line}` }}>
                ◧
              </button>
              <button onClick={() => onOpen(f.fam)} className="flex items-center gap-2 text-left py-0.5"
                style={{ flex: 1, cursor: "pointer", minWidth: 0 }} title={`The ${f.nos} ${f.fam} job${f.nos === 1 ? "" : "s"}`}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: colourOf(f.fam), flexShrink: 0 }} />
                <span className="text-xs font-semibold truncate" style={{ color: C.body, width: 150, flexShrink: 0 }}>{f.fam}</span>
                <span className="tnum text-xs" style={{ color: C.sub, width: 30, textAlign: "right", flexShrink: 0 }}>{f.nos}</span>
                <span style={{ flex: 1, height: 10, background: "#EFEDE7", borderRadius: 2, minWidth: 40 }}>
                  <span style={{ display: "block", width: `${((f.tp || f.val) / max) * 100}%`, height: 10, background: colourOf(f.fam), borderRadius: 2 }} />
                </span>
                <span className="tnum text-xs" style={{ color: C.accent, width: 72, textAlign: "right", flexShrink: 0 }}>{V(f.val)}</span>
                <span className="tnum text-xs" style={{ color: C.green, width: 72, textAlign: "right", flexShrink: 0 }}>{V(f.tp)}</span>
              </button>
            </div>
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
  // Squarer and shorter than the first cut, and capped in real pixels below:
  // a plot you have to scroll to see the top of is not a plot, it is two
  // half-plots, and the whole value of this one is seeing all four corners at
  // once.
  const W = 760, H = 380, L = 44, R = 16, T = 14, B = 38;
  const maxTp = Math.max(1, ...jobs.map((j) => j.tpv || 0));
  const x = (pct: number) => L + ((W - L - R) * Math.max(0, Math.min(100, pct || 0))) / 100;
  const y = (pct: number) => H - B - ((H - T - B) * Math.max(0, Math.min(100, pct || 0))) / 100;
  const r = (tp: number) => 3 + 19 * Math.sqrt(Math.max(0, tp || 0) / maxTp);

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
      <div>
        <svg viewBox={`0 0 ${W} ${H}`}
          style={{ width: "100%", maxWidth: 760, maxHeight: "58vh", display: "block", margin: "0 auto" }}
          role="img" aria-label="Jobs plotted by kitting and production percentage">
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
export function JobLightbox({
  job, V, colour, onClose, onOpenPlan, canEdit, onSaved,
}: {
  job: WipJob; V: (n: number) => string; colour: string; onClose: () => void; onOpenPlan: () => void;
  canEdit: boolean; onSaved: () => Promise<unknown>;
}) {
  const [msg, setMsg] = useState("");
  const today = new Date().toISOString().slice(0, 10);

  /**
   * Correcting a field here does TWO things: it fixes the board now, and it
   * queues the change for the ERP. Genie is downstream — tomorrow's file
   * redraws everything — so a correction that never reaches the ERP is a
   * correction that un-does itself overnight.
   */
  const save = async (field: string, value: string) => {
    setMsg("");
    try {
      const r = await api.post("/api/job-field", { job_id: job.id, field, value });
      await onSaved();
      setMsg(r.changed ? `Saved ✓ — queued for the ERP as “${r.label}”` : "No change — nothing queued");
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(22,35,47,0.55)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg"
        style={{ width: "min(660px, 100%)", maxHeight: "88vh", overflowY: "auto" }}>
        <div className="px-4 py-3 flex items-start gap-3" style={{ background: C.ink, position: "sticky", top: 0, zIndex: 2 }}>
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
            <EditBit label="Production" value={String(job.pct ?? 0)} suffix="%" kind="number"
              canEdit={canEdit} color={C.navy} onSave={(v) => save("pct", v)} />
            <EditBit label="Kitting" value={String(job.kit ?? 0)} suffix="%" kind="number"
              canEdit={canEdit} color={(job.kit || 0) >= 80 ? C.green : (job.kit || 0) >= 40 ? C.amber : C.red}
              onSave={(v) => save("kit", v)} />
            <EditBit label="Target delivery" value={job.tdd || ""} kind="date"
              canEdit={canEdit} color={job.tdd && job.tdd < today ? C.red : C.body}
              display={fmt(job.tdd)} onSave={(v) => save("tdd", v)} />
            <Bit label="OTD date" value={fmt(job.otd)} color={otdColor(job.otd)} />
            <Bit label="Owner" value={job.ownerInitials || "—"} color={C.sub} />
          </div>

          <div className="flex gap-2 flex-wrap mb-3">
            <Bit label="Value" value={V(job.val)} color={C.accent} />
            <Bit label="Throughput" value={V(job.tpv || 0)} color={C.green} />
            <EditBit label="Amount needed next month" value={job.amtNeeded == null ? "" : String(job.amtNeeded)}
              kind="number" canEdit={canEdit} color={C.amber}
              display={job.amtNeeded == null ? "—" : V(job.amtNeeded)} onSave={(v) => save("amt_needed", v)} />
            <Bit label="Pending payment on delivery" value={job.payOnDelivery == null ? "—" : V(job.payOnDelivery)} color={C.green} />
            {/* Dr Raghu, 2 Sep 2026: "Put it next to Pending Payment". */}
            <PickBit label="Approx Mandays" value={job.mandays || ""} canEdit={canEdit}
              options={MANDAY_BANDS} color={C.navy} onSave={(v) => save("mandays", v)} />
          </div>

          <EditText label="Current Project Escalation" value={job.escalation || ""} canEdit={canEdit}
            tone={C.red} onSave={(v) => save("escalation", v)} />
          <EditText label="Current Update" value={job.note || ""} canEdit={canEdit}
            tone={C.body} onSave={(v) => save("note", v)} hint="The W34-style line the ERP carries as Current Status" />

          {/* STATUS IS EDITABLE TOO (Dr Raghu, 2 Sep 2026, listing what sync
              means: "Production %, Kitting %, TDD, Amount needed next month,
              Current Project Escalation, Current Update, Status — these should
              be editable in the lightbox and then be able to be sync to ERP").
 
              Six of the seven already had a pencil; this one was printed as
              plain text, though the ERP has always been able to receive it as
              job_status. A field the ERP will take and Genie refuses to edit
              is the worst of both — the correction gets made in two places or
              in neither. */}
          {(job.stat || canEdit) && (
            <EditText label="Status" value={job.stat || ""} canEdit={canEdit}
              tone={C.body} onSave={(v) => save("stat", v)}
              hint="The ERP's Job Status — P: Assembly Fabrication, Q: Final Inspection, and the rest" />
          )}

          {msg && (
            <div className="text-xs mt-2 font-semibold" style={{ color: msg.includes("✓") ? C.green : msg.startsWith("No change") ? C.mute : C.red }}>
              {msg}
            </div>
          )}
          {canEdit && (
            <div className="text-xs mt-1" style={{ color: C.faint, lineHeight: 1.5 }}>
              A correction here fixes the board now and joins the <b>ERP Update</b> list, so it can be put back into the
              ERP in one pass. Without that, tomorrow&apos;s file quietly undoes it.
            </div>
          )}

          <button onClick={onOpenPlan} className="mt-3 rounded px-4 py-2 text-sm font-bold" style={{ background: C.accent, color: "#fff" }}>
            Open the full job plan →
          </button>
        </div>
      </div>
    </div>
  );
}

/** A figure with a pencil. Reads as a chip until somebody wants to change it. */
function EditBit({
  label, value, display, suffix, kind, canEdit, color, onSave,
}: {
  label: string; value: string; display?: string; suffix?: string;
  kind: "number" | "date"; canEdit: boolean; color: string; onSave: (v: string) => Promise<void>;
}) {
  const [on, setOn] = useState(false);
  const [v, setV] = useState(value);
  const [busy, setBusy] = useState(false);

  const commit = async () => {
    setBusy(true);
    await onSave(v);
    setBusy(false);
    setOn(false);
  };

  return (
    <div className="rounded px-2 py-1" style={{ background: C.panel, minWidth: 120 }}>
      <div style={{ fontSize: 10, color: C.mute, letterSpacing: 0.4 }}>
        {label.toUpperCase()}
        {canEdit && !on && (
          <button onClick={() => { setV(value); setOn(true); }} className="ml-1" style={{ color: C.accent }} title={`Edit ${label} — it will be queued for the ERP`}>✎</button>
        )}
      </div>
      {on ? (
        <div className="flex items-center gap-1">
          <input
            autoFocus type={kind === "date" ? "date" : "number"} value={v}
            onChange={(e) => setV(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setOn(false); }}
            className="text-sm border rounded px-1 py-0.5 tnum"
            style={{ borderColor: C.accent, width: kind === "date" ? 130 : 74 }}
          />
          <button onClick={commit} disabled={busy} className="text-xs font-bold rounded px-1.5" style={{ background: C.green, color: "#fff" }}>✓</button>
          <button onClick={() => setOn(false)} className="text-xs" style={{ color: C.faint }}>✕</button>
        </div>
      ) : (
        <div className="tnum font-bold" style={{ fontSize: 14, color }}>
          {display ?? (value === "" ? "—" : value)}{display ? "" : suffix || ""}
        </div>
      )}
    </div>
  );
}

/** A paragraph with a pencil — escalation and the running update. */
function EditText({
  label, value, canEdit, tone, onSave, hint,
}: {
  label: string; value: string; canEdit: boolean; tone: string; onSave: (v: string) => Promise<void>; hint?: string;
}) {
  const [on, setOn] = useState(false);
  const [v, setV] = useState(value);
  const [busy, setBusy] = useState(false);
  const red = tone === C.red;

  const commit = async () => {
    setBusy(true);
    await onSave(v);
    setBusy(false);
    setOn(false);
  };

  if (!value && !canEdit) return null;

  return (
    <div className="rounded p-2 mb-2" style={red ? { background: "#FBEDEA", borderLeft: `3px solid ${C.red}` } : { background: C.panel }}>
      <div style={{ fontSize: 10, color: red ? C.red : C.mute, fontWeight: red ? 700 : 400, letterSpacing: 0.4 }}>
        {label.toUpperCase()}
        {canEdit && !on && (
          <button onClick={() => { setV(value); setOn(true); }} className="ml-1" style={{ color: C.accent }} title={`Edit ${label} — it will be queued for the ERP`}>✎</button>
        )}
      </div>
      {on ? (
        <>
          <textarea autoFocus value={v} onChange={(e) => setV(e.target.value)} rows={3}
            className="w-full text-xs border rounded p-1.5 mt-1" style={{ borderColor: C.accent, resize: "vertical" }} />
          {hint && <div style={{ fontSize: 10, color: C.faint }}>{hint}</div>}
          <div className="flex gap-1 mt-1">
            <button onClick={commit} disabled={busy} className="text-xs font-bold rounded px-2 py-0.5" style={{ background: C.green, color: "#fff" }}>{busy ? "…" : "Save"}</button>
            <button onClick={() => setOn(false)} className="text-xs rounded px-2 py-0.5" style={{ color: C.sub }}>Cancel</button>
          </div>
        </>
      ) : (
        <div className="text-xs" style={{ color: C.body, lineHeight: 1.5 }}>{value || <span style={{ color: C.faint }}>— nothing recorded —</span>}</div>
      )}
    </div>
  );
}

/**
 * APPROX MANDAYS (Dr Raghu, 2 Sep 2026). Bands, not a number.
 *
 * Nobody knows a job is 237 mandays; they know it is a two-to-three-hundred
 * job — and a spurious 237 gets planned against as though somebody measured
 * it. B/O is the honest answer for a bought-out job Nandan does not build at
 * all, which is NOT zero mandays and must never average in as though it were.
 */
export const MANDAY_BANDS = ["B/O", "0-50", "51-100", "101-200", "201-300",
  "301-400", "401-500", "501-600", "601-700", "700+"];

/** A Bit whose value is chosen from a list rather than typed. */
function PickBit({ label, value, options, canEdit, color, onSave }: {
  label: string; value: string; options: string[]; canEdit: boolean;
  color: string; onSave: (v: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  if (!canEdit) return <Bit label={label} value={value || "—"} color={value ? color : C.mute} />;
  return (
    <div className="rounded px-2 py-1" style={{ background: C.panel }}>
      <div style={{ fontSize: 10, color: C.mute, letterSpacing: 0.4 }}>{label.toUpperCase()} ✎</div>
      <select
        value={value}
        disabled={busy}
        onChange={async (ev) => { setBusy(true); await onSave(ev.target.value); setBusy(false); }}
        className="bg-transparent"
        style={{ fontSize: 15, fontWeight: 800, color: value ? color : C.mute, border: 0, outline: "none", cursor: "pointer" }}
      >
        {/* Not recorded is a real answer and must stay reachable — otherwise
            the first click can never be taken back. */}
        <option value="">—</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
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
