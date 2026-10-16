"use client";
/**
 * ATTENDANCE MUSTER (Dr Raghu, 16 Oct 2026: "build the attendance muster
 * here"). Days paid, attendance %, late coming % — per person, per month,
 * read from the muster each payroll run was computed from. Summary view and
 * the day-by-day grid; the signed paper copy is the existing muster print.
 */
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { MONTHS } from "@/lib/salary-sheet";
import type { MusterView, MusterLine } from "@/lib/attendance-muster";
import { Pane } from "./Pane";
import DataTable, { type Column } from "./DataTable";
import { C } from "./RecordFields";

const MARK: Record<string, { bg: string; fg: string }> = {
  P: { bg: "", fg: "#16232F" }, A: { bg: "#FBEDEA", fg: "#B3392E" }, WO: { bg: "#F1F0EC", fg: "#8B8F87" }, MO: { bg: "#F1F0EC", fg: "#8B8F87" }, ST: { bg: "#F1F0EC", fg: "#8B8F87" },
  S: { bg: "#FFF4D6", fg: "#8A5B00" }, C: { bg: "#E6F2EA", fg: "#0D6E39" }, HD: { bg: "#FFF4D6", fg: "#8A5B00" },
};
const pc = (v: number | null) => (v == null ? "—" : `${v.toFixed(1)}%`);
const tone = (v: number | null, good: number, bad: number, invert = false) => { if (v == null) return C.faint; const g = invert ? v <= good : v >= good; const b = invert ? v >= bad : v <= bad; return g ? "#0D6E39" : b ? "#B3392E" : "#8A5B00"; };

export default function AttendanceMuster({ who }: { who: string }) {
  const [d, setD] = useState<MusterView | null>(null); const [sheet, setSheet] = useState<string | null>(null);
  const [view, setView] = useState<"summary" | "days">("summary"); const [cat, setCat] = useState("all"); const [q, setQ] = useState(""); const [msg, setMsg] = useState("");
  useEffect(() => { api.get(`/api/hrms/muster${sheet ? `?sheet=${sheet}` : ""}`).then(setD).catch((e) => setMsg(e instanceof Error ? e.message : String(e))); }, [sheet]);

  const rows = useMemo(() => (d?.rows || []).filter((r) => (cat === "all" || r.category === cat) && (!q.trim() || `${r.employee_id} ${r.name} ${r.department || ""} ${r.designation || ""}`.toLowerCase().includes(q.trim().toLowerCase()))), [d, cat, q]);
  const days = d?.month?.days || 0; const sun = new Set(d?.sundays || []);

  const summaryCols: Column<MusterLine>[] = [
    { key: "id", label: "Emp Id", width: 70, value: (r) => r.employee_id, numeric: true },
    { key: "name", label: "Name", width: 190, value: (r) => r.name },
    { key: "cat", label: "Category", width: 110, value: (r) => r.category },
    { key: "dept", label: "Department", width: 120, value: (r) => r.department },
    { key: "pay", label: "Days paid", width: 80, align: "right", numeric: true, value: (r) => r.pay_days, title: "The sheet's Total Pay Days" },
    { key: "present", label: "Present", width: 70, align: "right", numeric: true, value: (r) => r.present },
    { key: "absent", label: "Absent", width: 70, align: "right", numeric: true, value: (r) => r.absent, render: (r) => <span style={{ color: r.absent ? "#B3392E" : C.faint, fontWeight: r.absent ? 700 : 400 }}>{r.absent}</span> },
    { key: "wo", label: "WO", width: 50, align: "right", numeric: true, value: (r) => r.wo, title: "Week-offs" },
    { key: "mo", label: "MO/ST", width: 60, align: "right", numeric: true, value: (r) => r.mo_st, title: "Monthly off / statutory holidays" },
    { key: "att", label: "Attendance %", width: 100, align: "right", numeric: true, value: (r) => r.attendance_pct, title: "Present ÷ (present + absent)", render: (r) => <b style={{ color: tone(r.attendance_pct, 95, 80) }}>{pc(r.attendance_pct)}</b> },
    { key: "late", label: "Late (days)", width: 80, align: "right", numeric: true, value: (r) => r.late, title: "The sheet's own Late column — days deducted for late coming, in quarter days", render: (r) => <span style={{ color: r.late ? "#8A5B00" : C.faint }}>{r.late ?? "—"}</span> },
    { key: "latepct", label: "Late coming %", width: 100, align: "right", numeric: true, value: (r) => r.late_pct, title: "Late days ÷ present days", render: (r) => <b style={{ color: tone(r.late_pct, 5, 20, true) }}>{pc(r.late_pct)}</b> },
    { key: "compoff", label: "Comp off", width: 70, align: "right", numeric: true, value: (r) => r.compoff },
    { key: "et", label: "ET", width: 60, align: "right", numeric: true, value: (r) => r.et, title: "Extra time — the sheet's own column" },
    { key: "loc", label: "Location", width: 100, value: (r) => r.location },
    { key: "status", label: "Status", width: 80, value: (r) => r.status },
  ];
  const dayCols: Column<MusterLine>[] = [
    { key: "id", label: "Emp Id", width: 70, value: (r) => r.employee_id, numeric: true },
    { key: "name", label: "Name", width: 190, value: (r) => r.name },
    ...Array.from({ length: days }, (_, i) => ({
      key: `d${i + 1}`, label: String(i + 1), width: 30, align: "center" as const, value: (r: MusterLine) => r.days[i] || "",
      title: sun.has(i + 1) ? "Sunday" : undefined,
      render: (r: MusterLine) => { const m = String(r.days[i] || "").toUpperCase(); const s = MARK[m] || { bg: "", fg: "#16232F" }; return <span style={{ display: "block", background: sun.has(i + 1) && !s.bg ? "#F7F6F2" : s.bg, color: s.fg, fontSize: 10.5, fontWeight: m === "A" ? 700 : 500, borderRadius: 3 }}>{m}</span>; },
    })),
    { key: "present", label: "P", width: 44, align: "right", numeric: true, value: (r) => r.present },
    { key: "absent", label: "A", width: 44, align: "right", numeric: true, value: (r) => r.absent },
    { key: "pay", label: "Paid", width: 54, align: "right", numeric: true, value: (r) => r.pay_days },
  ];

  const T = d?.totals; const m = d?.month;
  const Stat = ({ k, v, c }: { k: string; v: string; c?: string }) => <div><div style={{ fontSize: 10, color: C.faint, fontWeight: 700, letterSpacing: .6 }}>{k}</div><div className="tnum" style={{ fontSize: 17, fontWeight: 800, color: c || "#16232F" }}>{v}</div></div>;

  return (
    <Pane title="Attendance Muster" who={who} print={!!m} onPrint={() => m && window.open(`/hrms/muster/${m.id}/print`, "_blank", "noopener")}
      blurb="Days paid, attendance % and late coming %, per person and per month — read from the muster each payroll run was computed from, never a second copy."
      tools={<>
        <select value={m?.id || ""} onChange={(e) => setSheet(e.target.value)} className="text-xs border rounded px-2 py-1.5" style={{ borderColor: C.line }}>
          {(d?.months || []).map((x) => <option key={x.id} value={x.id}>{MONTHS[x.month - 1]} {x.year} · {x.people} people{x.status === "Frozen" ? " · ❄" : ""}</option>)}
        </select>
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="text-xs border rounded px-2 py-1.5" style={{ borderColor: C.line }}>
          <option value="all">All categories</option>{(d?.byCategory || []).map((c) => <option key={c.category} value={c.category}>{c.category} · {c.people}</option>)}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a person…" className="text-xs border rounded px-2 py-1.5" style={{ borderColor: C.line, width: 160 }} />
        <div className="flex rounded border overflow-hidden" style={{ borderColor: C.line }}>
          {(["summary", "days"] as const).map((v) => <button key={v} onClick={() => setView(v)} className="text-xs font-bold px-2.5 py-1.5" style={view === v ? { background: "var(--ink)", color: "#fff" } : { color: C.dim, background: "#fff" }}>{v === "summary" ? "Summary" : "Day by day"}</button>)}
        </div>
      </>}>
      {msg && <div className="text-xs font-semibold mb-2" style={{ color: C.red }}>{msg}</div>}
      {d && !m && (
        <div className="bg-white rounded-lg border p-4" style={{ borderColor: C.line, maxWidth: 640 }}>
          <div className="font-bold" style={{ fontSize: 14 }}>No muster in Genie yet.</div>
          <div className="text-sm mt-1" style={{ color: C.dim, lineHeight: 1.6 }}>A month&apos;s muster arrives with its payroll run — upload it on the run&apos;s Uploads tab and it appears here.</div>
        </div>
      )}
      {d && m && T && (
        <>
          <div className="bg-white rounded-lg border px-4 py-3 mb-3 flex gap-6 flex-wrap items-end" style={{ borderColor: C.line }}>
            <Stat k={`${MONTHS[m.month - 1].toUpperCase()} ${m.year}`} v={`${T.people} people`} />
            <Stat k="DAYS PAID" v={T.pay_days.toLocaleString("en-IN")} />
            <Stat k="PRESENT" v={T.present.toLocaleString("en-IN")} />
            <Stat k="ABSENT" v={T.absent.toLocaleString("en-IN")} c={T.absent ? "#B3392E" : undefined} />
            <Stat k="ATTENDANCE %" v={pc(T.attendance_pct)} c={tone(T.attendance_pct, 95, 80)} />
            <Stat k="LATE (DAYS)" v={String(T.late)} />
            <Stat k="LATE COMING %" v={pc(T.late_pct)} c={tone(T.late_pct, 5, 20, true)} />
            <div className="ml-auto text-xs" style={{ color: C.faint, maxWidth: 360, lineHeight: 1.5 }}>
              Attendance % = present ÷ (present + absent). Late coming % = late days (the sheet's deduction, in quarter days) ÷ present days. Week-offs and holidays count in neither.
              {d.months.length < 3 && <> Months before {MONTHS[d.months[d.months.length - 1].month - 1]} {d.months[d.months.length - 1].year} and the 2025 muster are still only in the HR sheet (tab 15).</>}
            </div>
          </div>
          {cat === "all" && !q && d.byCategory.length > 1 && (
            <div className="bg-white rounded-lg border mb-3 overflow-auto" style={{ borderColor: C.line }}>
              <table className="text-xs" style={{ borderCollapse: "collapse", minWidth: 640 }}>
                <thead><tr style={{ background: "#F4F2EC" }}>{["Category", "People", "Days paid", "Present", "Absent", "Attendance %", "Late (days)", "Late coming %"].map((h, i) => <th key={h} className="px-3 py-1.5 font-bold" style={{ textAlign: i ? "right" : "left", color: C.dim }}>{h}</th>)}</tr></thead>
                <tbody>{d.byCategory.map((c) => <tr key={c.category} style={{ borderTop: `1px solid ${C.line}` }}><td className="px-3 py-1.5 font-semibold">{c.category}</td><td className="px-3 py-1.5 text-right tnum">{c.people}</td><td className="px-3 py-1.5 text-right tnum">{c.pay_days}</td><td className="px-3 py-1.5 text-right tnum">{c.present}</td><td className="px-3 py-1.5 text-right tnum" style={{ color: c.absent ? "#B3392E" : undefined }}>{c.absent}</td><td className="px-3 py-1.5 text-right tnum font-bold" style={{ color: tone(c.attendance_pct, 95, 80) }}>{pc(c.attendance_pct)}</td><td className="px-3 py-1.5 text-right tnum">{c.late}</td><td className="px-3 py-1.5 text-right tnum font-bold" style={{ color: tone(c.late_pct, 5, 20, true) }}>{pc(c.late_pct)}</td></tr>)}</tbody>
              </table>
            </div>
          )}
          {view === "summary"
            ? <DataTable columns={summaryCols} rows={rows} rowKey={(r) => r.employee_id} initialFrozen={2} empty="Nobody matches." />
            : <DataTable columns={dayCols} rows={rows} rowKey={(r) => r.employee_id} initialFrozen={2} empty="Nobody matches." />}
          {view === "days" && <div className="text-xs mt-2" style={{ color: C.faint }}>P present · A absent · WO week-off · MO monthly off · ST statutory holiday · S sick/special (paid) · C comp-off · Sundays shaded.</div>}
        </>
      )}
      {!d && !msg && <div className="text-sm py-6 text-center" style={{ color: C.faint }}>loading…</div>}
    </Pane>
  );
}
