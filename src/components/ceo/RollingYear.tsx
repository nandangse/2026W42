"use client";
/**
 * THE ROLLING YEAR (Dr Raghu, 14 Oct 2026): "show a graph of the last 12 months
 * rolling always — Sales, Purchase, OE, Salaries — a line graph with legend.
 * Also show Total, Average/month, Mean, Median, Min, Max for 12 months, 6
 * months, 3 months, YTD … by month table only show this … October number show
 * * — incomplete."
 *
 * Always the last twelve complete months and this month to date, whatever
 * dates are picked above. The 12-, 6- and 3-month figures are struck on
 * complete months only — a half month would be the minimum every time; YTD
 * runs to date, as its name says. This month carries a * everywhere.
 */
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Num, monthRange } from "@/components/ceo/Drill";

export type Trend = { months: string[]; current: string; books_to: string | null; fy_start: string; series: Record<"sales" | "purchase" | "oe" | "salaries", Record<string, number>> };
const SERIES: { key: keyof Trend["series"]; label: string; color: string }[] = [
  { key: "sales", label: "Sales", color: "#15803D" },
  { key: "purchase", label: "Purchase", color: "#2563EB" },
  { key: "oe", label: "OE", color: "#C2410C" },
  { key: "salaries", label: "Salaries", color: "#7C3AED" },
];
const NAVY = "var(--navy)", MUTED = "var(--muted)", LINE = "var(--line)";
const cr = (n: number) => { const v = Math.abs(n); const s = v >= 1e7 ? `${(v / 1e7).toFixed(2)} Cr` : v >= 1e5 ? `${(v / 1e5).toFixed(1)} L` : Math.round(v).toLocaleString("en-IN"); return `${n < 0 ? "−" : ""}₹${s}`; };
const axis = (n: number) => (Math.abs(n) >= 1e7 ? `${(n / 1e7).toFixed(1)} Cr` : `${Math.round(n / 1e5)} L`);
const mon = (m: string) => new Date(m + "-01T00:00:00").toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
const dmy = (d?: string | null) => (d ? new Date(d.slice(0, 10) + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "");

function stats(vals: number[]) {
  const n = vals.length; if (!n) return null;
  const total = vals.reduce((s, v) => s + v, 0);
  const nz = vals.filter((v) => v !== 0);
  const sorted = [...vals].sort((a, b) => a - b);
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  return { total, avg: total / n, mean: nz.length ? nz.reduce((s, v) => s + v, 0) / nz.length : 0, median, min: sorted[0], max: sorted[n - 1], n };
}

export default function RollingYear({ t }: { t: Trend }) {
  const label = (m: string) => `${mon(m)}${m === t.current ? "*" : ""}`;
  const data = t.months.map((m) => ({ m: label(m), ...Object.fromEntries(SERIES.map((s) => [s.key, t.series[s.key][m] || 0])) }));
  const complete = t.months.filter((m) => m !== t.current);
  const WIN: { key: string; label: string; months: string[] }[] = [
    { key: "12", label: "12 months", months: complete.slice(-12) },
    { key: "6", label: "6 months", months: complete.slice(-6) },
    { key: "3", label: "3 months", months: complete.slice(-3) },
    { key: "ytd", label: "YTD*", months: t.months.filter((m) => m >= t.fy_start) },
  ];
  const ROWS: { key: "total" | "avg" | "mean" | "median" | "min" | "max"; label: string; hint?: string }[] = [
    { key: "total", label: "Total" }, { key: "avg", label: "Average / month", hint: "the total over the months in the window" },
    { key: "mean", label: "Mean", hint: "over the months that had any entry — differs from the average only where a month is empty" },
    { key: "median", label: "Median" }, { key: "min", label: "Min" }, { key: "max", label: "Max" },
  ];
  const latestFirst = [...t.months].reverse();
  return (
    <div className="mb-4">
      <div className="flex items-baseline gap-2 mb-1.5">
        <div className="text-xs font-bold" style={{ color: NAVY, letterSpacing: 1 }}>THE LAST 12 MONTHS — ROLLING</div>
        <span className="text-xs" style={{ color: MUTED }}>* {mon(t.current)} is incomplete — books to {dmy(t.books_to)}</span>
      </div>
      <div className="rounded-lg bg-white p-3 mb-3" style={{ border: `1px solid ${LINE}`, height: 340 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis dataKey="m" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={axis} tick={{ fontSize: 11 }} width={64} />
            <Tooltip formatter={(v) => cr(Number(v))} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {SERIES.map((s) => <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2.2} dot={{ r: 3 }} activeDot={{ r: 5 }} />)}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {/* BY MONTH — only these four, the latest on the left */}
      <div className="rounded-lg bg-white mb-3" style={{ border: `1px solid ${LINE}`, overflow: "auto" }}>
        <table className="genie-table" style={{ minWidth: 900 }}>
          <thead><tr><th style={{ position: "sticky", left: 0, zIndex: 3 }}>By month</th>{latestFirst.map((m) => <th key={m} style={{ textAlign: "right" }}>{label(m)}</th>)}</tr></thead>
          <tbody>{SERIES.map((s) => (
            <tr key={s.key}><td className="font-bold" style={{ position: "sticky", left: 0, background: "#fff", borderLeft: `4px solid ${s.color}` }}>{s.label}</td>{latestFirst.map((m) => { const [a, b] = monthRange(m); return <td key={m} className="tnum text-right" style={m === t.current ? { color: MUTED, fontStyle: "italic" } : undefined}><Num ask={{ what: s.key, from: a, to: b, label: `${s.label} — ${label(m)}` }}>{cr(t.series[s.key][m] || 0)}</Num></td>; })}</tr>
          ))}</tbody>
        </table>
      </div>
      {/* THE FIGURES — each line, four windows */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(420px, 1fr))" }}>
        {SERIES.map((s) => (
          <div key={s.key} className="rounded-lg bg-white" style={{ border: `1px solid ${LINE}`, borderTop: `3px solid ${s.color}`, overflow: "auto" }}>
            <table className="genie-table" style={{ width: "100%" }}>
              <thead><tr><th>{s.label}</th>{WIN.map((w) => <th key={w.key} style={{ textAlign: "right" }} title={`${mon(w.months[0])} – ${mon(w.months[w.months.length - 1])}`}>{w.label}</th>)}</tr></thead>
              <tbody>{ROWS.map((r) => (
                <tr key={r.key}><td className="text-xs font-semibold" title={r.hint}>{r.label}</td>{WIN.map((w) => { const st = stats(w.months.map((m) => t.series[s.key][m] || 0)); const a = monthRange(w.months[0])[0], b = monthRange(w.months[w.months.length - 1])[1]; return <td key={w.key} className="tnum text-right text-xs" style={r.key === "total" ? { fontWeight: 700 } : undefined}>{st ? <Num ask={{ what: s.key, from: a, to: b, label: `${s.label} — ${w.label}, ${mon(w.months[0])} – ${label(w.months[w.months.length - 1])}` }}>{cr(st[r.key])}</Num> : "—"}</td>; })}</tr>
              ))}</tbody>
            </table>
          </div>
        ))}
      </div>
      <div className="text-xs mt-1" style={{ color: MUTED }}>12, 6 and 3 months are complete months, ending {mon(complete[complete.length - 1] || t.current)}; YTD* runs from April to date. Salaries are wages on the floor and the staff, labour and consultant salaries in OE; directors&apos; remuneration stays in OE on its own.</div>
    </div>
  );
}
