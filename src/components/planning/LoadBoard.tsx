"use client";
// split out of PlanningSuite.tsx (Genie 5.0.1.1) — one file per tab, loaded when opened
import React, { useEffect, useMemo, useRef, useState } from "react";

import { TRADES } from "@/lib/templates";
import { today, fmt, fmtFull, jobNo, diffDays, addDays, computeSchedule, manDays, isoWeek, parseISO, toISO, type Plan } from "@/lib/schedule";

import { Board, Job, TODAY, templateMilestones } from "./shared";
import { ScheduledRow } from "./JobPlan";
import { ProfileRow } from "./Profile";

// ============================ Load board ============================
export interface Bucket { a: number; b: number; label: string; sub?: string; wk?: number; wkStart?: boolean; today: boolean }

export function LoadBoard({ board, byTDD }: { board: Board; byTDD: Job[] }) {
  const [bucket, setBucket] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(byTDD.map((j) => j.id)));
  const [shiftSplit, setShiftSplit] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const toggleCollapse = (id: string) =>
    setCollapsed((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const plannedJobs = useMemo(
    () => byTDD.map((j) => {
      const saved = board.plans[j.id];
      const pl: Plan = saved && saved.milestones.length
        ? { start: saved.start || (j.start && j.start >= TODAY ? j.start : TODAY), milestones: saved.milestones }
        : { start: j.start && j.start >= TODAY ? j.start : TODAY, milestones: templateMilestones(j.fam, board.templates) };
      return { job: j, plan: pl };
    }),
    [board, byTDD],
  );

  const load = useMemo(() => {
    const perJob = plannedJobs.map(({ job, plan }) => ({ job, sched: computeSchedule(plan) }));
    let min: string | null = null, max: string | null = null;
    perJob.forEach(({ sched }) => sched.forEach((m) => { if (!min || m.start < min) min = m.start; if (!max || m.end > max) max = m.end; }));
    if (!min || !max) return null;
    const lo = min, hi = max;
    const totalDays = diffDays(lo, hi) + 1;
    const dayLoad = perJob.map(({ sched }) => {
      const byTrade: Record<string, number[]> = {};
      TRADES.forEach((t) => (byTrade[t.key] = new Array(totalDays).fill(0)));
      sched.forEach((m) => {
        const a = diffDays(lo, m.start), b = diffDays(lo, m.end);
        TRADES.forEach((t) => { const n = m.crew[t.key] || 0; if (!n) return; for (let d = a; d <= b; d++) byTrade[t.key][d] += n; });
      });
      return byTrade;
    });
    const buckets: Bucket[] = [];
    const hasToday = (a: number, b: number) => addDays(lo, a) <= TODAY && TODAY <= addDays(lo, b);
    if (bucket === "daily") {
      for (let d = 0; d < totalDays; d++) {
        const iso = addDays(lo, d);
        buckets.push({ a: d, b: d, label: fmt(iso), wk: isoWeek(iso), wkStart: parseISO(iso).getUTCDay() === 1 || d === 0, today: iso === TODAY });
      }
    } else if (bucket === "weekly") {
      for (let d = 0; d < totalDays; d += 7) {
        const e = Math.min(d + 6, totalDays - 1);
        buckets.push({ a: d, b: e, label: "W" + isoWeek(addDays(lo, d)), sub: fmt(addDays(lo, d)) + "–" + fmt(addDays(lo, e)), wkStart: true, today: hasToday(d, e) });
      }
    } else {
      let d = 0;
      while (d < totalDays) {
        const dt = parseISO(addDays(lo, d));
        const label = dt.toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });
        const nm = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 1));
        const b = Math.min(diffDays(lo, toISO(nm)) - 1, totalDays - 1);
        buckets.push({ a: d, b, label, today: hasToday(d, b) });
        d = b + 1;
      }
    }
    const cellVal = (arr: number[], a: number, b: number) => { if (bucket === "daily") return arr[a]; let s = 0; for (let x = a; x <= b; x++) s += arr[x]; return s; };
    const rows = perJob.map((pj, ji) => {
      const trades = TRADES.map((t) => ({ trade: t, cells: buckets.map(({ a, b }) => cellVal(dayLoad[ji][t.key], a, b)) }));
      const totals = buckets.map((_, bi) => trades.reduce((s, tr) => s + tr.cells[bi], 0));
      return { job: pj.job, trades, totals };
    });
    const shopTrades = TRADES.map((t, ti) => ({ trade: t, cells: buckets.map((_, bi) => rows.reduce((s, r) => s + r.trades[ti].cells[bi], 0)) }));
    const shopTotal = buckets.map((_, bi) => shopTrades.reduce((s, tr) => s + tr.cells[bi], 0));
    const peak = Math.max(1, ...rows.flatMap((r) => r.trades.flatMap((tr) => tr.cells)));
    const totPeak = Math.max(1, ...rows.flatMap((r) => r.totals));
    return { buckets, rows, shopTrades, shopTotal, peak, totPeak };
  }, [plannedJobs, bucket]);

  // auto-scroll to today
  useEffect(() => {
    const t = setTimeout(() => {
      const c = scrollRef.current;
      const el = c?.querySelector('[data-today="1"]') as HTMLElement | null;
      if (c && el) c.scrollLeft = Math.max(0, el.offsetLeft - c.clientWidth / 2);
    }, 60);
    return () => clearTimeout(t);
  }, [bucket, load]);

  const heat = (v: number, peak: number): React.CSSProperties => {
    if (!v) return { background: "#FFFFFF", color: "#D5D2C9" };
    const r = Math.min(1, v / peak);
    if (r > 0.85) return { background: "var(--red)", color: "#fff" };
    if (r > 0.65) return { background: "var(--accent)", color: "#fff" };
    if (r > 0.4) return { background: "var(--amber)", color: "#3B2A00" };
    return { background: "#DCE8F5", color: "var(--blue)" };
  };
  const SPLIT = (v: number) => { const n = Math.round(v * 0.25); return { d: v - n, n }; };
  const cellTxt = (v: number) => (!v ? "·" : shiftSplit ? (<span>☀︎{SPLIT(v).d}<span style={{ opacity: 0.75 }}> ☾{SPLIT(v).n}</span></span>) : v);
  const colStyle = (b: Bucket): React.CSSProperties => ({ borderLeft: b.wkStart ? "1px solid #C9C6BD" : "1px solid #F1EFE9" });

  const toolBtn = (active: boolean): React.CSSProperties =>
    active ? { background: "var(--ink)", color: "#fff" } : { color: "var(--dim)" };

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="flex gap-1 rounded p-1 bg-white border" style={{ borderColor: "var(--line)" }}>
          {(["daily", "weekly", "monthly"] as const).map((b) => (
            <button key={b} onClick={() => setBucket(b)} className="px-3 py-1 rounded text-sm font-semibold capitalize" style={toolBtn(bucket === b)}>{b}</button>
          ))}
        </div>
        <button onClick={() => setCollapsed(new Set())} className="px-3 py-1.5 rounded text-sm font-semibold border" style={{ background: "#fff", color: "var(--ink)", borderColor: "var(--line)" }}>▾ Expand all</button>
        <button onClick={() => setCollapsed(new Set(byTDD.map((j) => j.id)))} className="px-3 py-1.5 rounded text-sm font-semibold border" style={{ background: "#fff", color: "var(--ink)", borderColor: "var(--line)" }}>▸ Collapse all</button>
        <button onClick={() => setShiftSplit(!shiftSplit)} className="px-3 py-1.5 rounded text-sm font-semibold border" style={shiftSplit ? { background: "var(--navy)", color: "var(--amber)", borderColor: "var(--navy)" } : { background: "#fff", color: "var(--dim)", borderColor: "var(--line)" }}>☀︎/☾ Shift split {shiftSplit ? "ON" : "OFF"}</button>
        <div className="text-xs" style={{ color: "var(--muted)" }}>All {plannedJobs.length} jobs · {bucket === "daily" ? "cells = men that day" : "cells = man-days in period"} · jobs without a saved plan use their family default · view auto-scrolls to today</div>
      </div>

      {!load ? (
        <div className="text-sm" style={{ color: "var(--muted)" }}>No jobs yet — upload the Jobs/PRE export to populate the load.</div>
      ) : (
        <div ref={scrollRef} className="bg-white rounded-lg border overflow-x-auto" style={{ borderColor: "var(--line)" }}>
          <table className="text-xs genie-table" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--ink)", color: "#fff" }}>
                <th className="px-3 py-2 text-left sticky left-0" style={{ background: "var(--ink)", width: 150, minWidth: 150, zIndex: 3 }}>Job</th>
                <th className="px-2 py-2 text-left sticky" style={{ background: "var(--ink)", left: 150, minWidth: 82, zIndex: 3 }}>Trade</th>
                {load.buckets.map((b, i) => (
                  <th key={i} data-today={b.today ? "1" : undefined} className="px-2 py-1 whitespace-nowrap font-medium" style={{ borderLeft: b.wkStart ? "1px solid #3D4E5E" : undefined, background: b.today ? "var(--accent)" : undefined, color: b.today ? "#fff" : undefined }}>
                    {bucket === "daily" && b.wkStart && <div style={{ color: "var(--amber)", fontSize: 9 }}>W{b.wk}</div>}
                    {b.label}
                    {b.sub && <div style={{ fontSize: 9, opacity: 0.7 }}>{b.sub}</div>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {load.rows.map((r, ri) => {
                const isCollapsed = collapsed.has(r.job.id);
                const shownTrades = isCollapsed ? [] : r.trades;
                return (
                  <React.Fragment key={ri}>
                    {shownTrades.map((tr, ti) => (
                      <tr key={`${ri}-${ti}`} style={{ borderTop: ti === 0 ? "2px solid #22303C" : "1px solid #F1EFE9" }}>
                        {ti === 0 && (
                          <td rowSpan={r.trades.length + 1} role="button" tabIndex={0} onClick={() => toggleCollapse(r.job.id)} className="px-3 py-2 font-semibold sticky left-0 bg-white align-top cursor-pointer" style={{ color: "var(--ink)", borderRight: "1px solid #EFEDE7", width: 150, minWidth: 150, zIndex: 2 }}>
                            JOB {jobNo(r.job.id)}
                            <div className="font-normal" style={{ color: "var(--muted)", maxWidth: 140 }}>{r.job.tag.slice(0, 34)}</div>
                            <div className="mt-1" style={{ color: "var(--accent)", fontSize: 10 }}>▾ collapse</div>
                          </td>
                        )}
                        <td className="px-2 py-1 font-bold whitespace-nowrap sticky" style={{ color: tr.trade.color, left: 150, background: "#fff", zIndex: 2, borderRight: "1px solid #EFEDE7" }}>{tr.trade.tiny} <span className="font-normal" style={{ color: "var(--muted)" }}>{tr.trade.label}</span></td>
                        {tr.cells.map((v, ci) => (
                          <td key={ci} className="text-center px-1 py-1 font-bold whitespace-nowrap tnum" style={{ ...heat(v, load.peak), minWidth: 44, ...colStyle(load.buckets[ci]) }} title={`${tr.trade.label}: ${v}`}>{cellTxt(v)}</td>
                        ))}
                      </tr>
                    ))}
                    <tr key={`${ri}-tot`} style={{ background: "#F2EFE6", borderTop: isCollapsed ? "2px solid #22303C" : "1px solid #D9D6CD" }} className="font-bold">
                      {isCollapsed && (
                        <td onClick={() => toggleCollapse(r.job.id)} className="px-3 py-2 sticky left-0 align-top cursor-pointer" style={{ background: "#F2EFE6", color: "var(--ink)", borderRight: "1px solid #EFEDE7", width: 150, minWidth: 150, zIndex: 2 }}>
                          JOB {jobNo(r.job.id)}
                          <div style={{ color: "var(--accent)", fontSize: 10 }} className="font-normal">▸ expand trades</div>
                        </td>
                      )}
                      <td className="px-2 py-1 sticky" style={{ left: 150, background: "#F2EFE6", zIndex: 2, borderRight: "1px solid #E7E4DC" }}>TOTAL</td>
                      {r.totals.map((v, ci) => (
                        <td key={ci} className="text-center px-1 py-1 whitespace-nowrap tnum" style={{ ...heat(v, load.totPeak), ...colStyle(load.buckets[ci]) }}>{cellTxt(v)}</td>
                      ))}
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot>
              {load.shopTrades.map((tr, ti) => (
                <tr key={ti} style={{ background: "var(--navy)", color: "#fff", borderTop: ti === 0 ? "3px solid #E8600A" : "1px solid #22303C" }}>
                  {ti === 0 && (
                    <td rowSpan={load.shopTrades.length + 1} className="px-3 py-2 font-bold sticky left-0 align-top" style={{ background: "var(--navy)", width: 150, minWidth: 150, zIndex: 2 }}>SHOP TOTAL<div className="font-normal opacity-70" style={{ fontSize: 10 }}>all planned jobs</div></td>
                  )}
                  <td className="px-2 py-1 font-bold whitespace-nowrap sticky" style={{ color: "var(--amber)", left: 150, background: "var(--navy)", zIndex: 2 }}>{tr.trade.tiny} <span className="font-normal opacity-70">{tr.trade.label}</span></td>
                  {tr.cells.map((v, ci) => (
                    <td key={ci} className="text-center px-1 py-1 font-bold whitespace-nowrap tnum" style={{ color: v ? "#fff" : "#3A4A5A", borderLeft: "1px solid #22303C" }}>{cellTxt(v)}</td>
                  ))}
                </tr>
              ))}
              <tr style={{ background: "#0D161F", color: "var(--amber)" }} className="font-bold">
                <td className="px-2 py-2 sticky" style={{ left: 150, background: "#0D161F", zIndex: 2 }}>GRAND TOTAL</td>
                {load.shopTotal.map((v, ci) => (
                  <td key={ci} className="text-center px-1 py-2 whitespace-nowrap tnum" style={{ borderLeft: "1px solid #22303C" }}>{cellTxt(v)}</td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <div className="flex flex-wrap gap-3 mt-2 text-xs items-center" style={{ color: "var(--dim)" }}>
        <span className="font-bold">Load key:</span>
        {([["#DCE8F5", "Light"], ["var(--amber)", "Moderate"], ["var(--accent)", "Heavy"], ["var(--red)", "Peak — level or shift"]] as [string, string][]).map(([c, l]) => (
          <span key={l} className="flex items-center gap-1"><span className="w-4 h-4 rounded inline-block" style={{ background: c }} /> {l}</span>
        ))}
        <span className="ml-auto">F=Fitter · H=Helper · W=Welder · P=Painter · E=Electrician · Hd=Hydraulic</span>
      </div>
    </div>
  );
}

// ============================ Milestone details ============================
/**
 * The spanner beside every milestone name. Click it once and the full detail
 * opens; after that a hover is enough — the panel follows the mouse until it is
 * clicked shut again. Read-only: everything here is editable in the row itself,
 * this just puts the whole picture in one place without widening the table.
 */
export function MilestoneSpanner({
  m, job, preds, succ,
}: {
  m: ScheduledRow;
  job: Job;
  preds: ScheduledRow[];
  succ: number[];
}) {
  const [pinned, setPinned] = useState(false);
  const [hover, setHover] = useState(false);
  // hover only reveals it once you've opened it at least once — otherwise the
  // table twitches at every mouse sweep
  const [primed, setPrimed] = useState(false);
  const shown = pinned || (primed && hover);

  const crewList = TRADES.filter((t) => (m.crew[t.key] || 0) > 0);
  const late = !m.done && m.end < TODAY;
  const slipVsTdd = job.tdd ? diffDays(job.tdd, m.end) : null;

  return (
    <span className="relative flex-shrink-0">
      <button
        onClick={() => { setPinned((p) => !p); setPrimed(true); }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className="rounded px-1"
        style={{ color: shown ? "var(--accent)" : "#B8B5AC", fontSize: 12, lineHeight: 1 }}
        title={primed ? "Milestone details — hover to peek, click to pin" : "Milestone details"}
        aria-label="Milestone details"
      >
        🔧
      </button>
      {shown && (
        <>
          {pinned && <div className="fixed inset-0" style={{ zIndex: 58 }} role="button" tabIndex={0} onClick={() => setPinned(false)} />}
          <div
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            className="absolute rounded-lg border bg-white p-3 text-left"
            style={{ top: "calc(100% + 4px)", left: 0, width: 290, borderColor: "var(--line)", boxShadow: "0 12px 30px rgba(0,0,0,.22)", zIndex: 59 }}
          >
            <div className="flex items-baseline justify-between gap-2">
              <div className="font-bold text-sm" style={{ color: "var(--navy)" }}>M{m.idx} · {m.name}</div>
              {pinned && <button onClick={() => setPinned(false)} className="text-xs font-bold" style={{ color: "var(--muted)" }}>✕</button>}
            </div>
            <div className="text-xs mb-2" style={{ color: m.done ? "var(--green)" : late ? "var(--red)" : "var(--muted)" }}>
              {m.done ? `Completed${m.done_on ? " " + fmtFull(m.done_on) : ""}` : late ? `Not done — ${diffDays(m.end, TODAY)} days past its end date` : "Pending"}
            </div>

            <ProfileRow label="Runs" value={`${fmtFull(m.start)} → ${fmtFull(m.end)}`} hint={`${m.days} day${m.days === 1 ? "" : "s"}${m.shift === "N" ? " · night shift" : m.shift === "DN" ? " · day + night" : " · day shift"}`} />
            <ProfileRow
              label="Crew"
              value={crewList.length ? crewList.map((t) => `${m.crew[t.key]} ${t.label.toLowerCase()}`).join(", ") : "none assigned"}
              hint={`${manDays(m)} man-days`}
            />
            <ProfileRow
              label="Depends on"
              value={(m.preds || []).length ? (m.preds || []).map((p) => `M${p} ${preds.find((x) => x.idx === p)?.name ?? ""}`.trim()).join(", ") : "nothing — it can start on day one"}
            />
            <ProfileRow label="Unblocks" value={succ.length ? succ.map((s) => `M${s} ${preds.find((x) => x.idx === s)?.name ?? ""}`.trim()).join(", ") : "nothing downstream"} />
            {slipVsTdd !== null && (
              <ProfileRow
                label="vs Target Delivery"
                value={slipVsTdd > 0 ? `ends ${slipVsTdd} days after` : slipVsTdd === 0 ? "ends on the target date" : `ends ${Math.abs(slipVsTdd)} days before`}
                hint={`Target ${fmtFull(job.tdd)}`}
              />
            )}
            <div className="text-xs mt-2" style={{ color: "var(--muted)" }}>
              Change any of this in the row itself — this panel is a read-only summary.
            </div>
          </div>
        </>
      )}
    </span>
  );
}