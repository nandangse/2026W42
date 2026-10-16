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
import type { MusterView, MusterLine, PersonView } from "@/lib/attendance-muster";
import { Pane } from "./Pane";
import DataTable, { type Column } from "./DataTable";
import { C } from "./RecordFields";

const MARK: Record<string, { bg: string; fg: string }> = {
  P: { bg: "", fg: "#16232F" }, A: { bg: "#FBEDEA", fg: "#B3392E" }, WO: { bg: "#F1F0EC", fg: "#8B8F87" }, MO: { bg: "#F1F0EC", fg: "#8B8F87" }, ST: { bg: "#F1F0EC", fg: "#8B8F87" },
  S: { bg: "#FFF4D6", fg: "#8A5B00" }, C: { bg: "#E6F2EA", fg: "#0D6E39" }, HD: { bg: "#FFF4D6", fg: "#8A5B00" },
};
const pc = (v: number | null) => (v == null ? "—" : `${v.toFixed(1)}%`);
const tone = (v: number | null, good: number, bad: number, invert = false) => { if (v == null) return C.faint; const g = invert ? v <= good : v >= good; const b = invert ? v >= bad : v <= bad; return g ? "#0D6E39" : b ? "#B3392E" : "#8A5B00"; };

type Person = { employee_id: string; name: string; department: string | null; category: string; months: number; last: string };
type Imp = { sa_email: string | null; sheet_id: string; imports: { year: number; month: number; tab: string; people: number; days: number; imported_at: string }[] };

export default function AttendanceMuster({ who }: { who: string }) {
  const [mode, setMode] = useState<"month" | "person">("month");
  const [pick, setPick] = useState<string | null>(null);
  if (mode === "person") return <ByPerson who={who} initial={pick} onMonths={() => setMode("month")} />;
  return <ByMonth who={who} onPerson={(id) => { setPick(id); setMode("person"); }} />;
}

function Switch({ mode, onMode }: { mode: "month" | "person"; onMode: (m: "month" | "person") => void }) {
  return (
    <div className="flex gap-1 rounded p-1 bg-white border" style={{ borderColor: "var(--line)", width: "fit-content" }}>
      {(["month", "person"] as const).map((k) => <button key={k} onClick={() => onMode(k)} className="px-3 py-1 rounded text-sm font-semibold" style={mode === k ? { background: "var(--ink)", color: "#fff" } : { color: "var(--dim)" }}>{k === "month" ? "📅 By month" : "👤 By person"}</button>)}
    </div>
  );
}

function PullMonths({ months }: { months: number }) {
  const [imp, setImp] = useState<Imp | null>(null); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState("");
  useEffect(() => { api.get("/api/hrms/muster/import").then(setImp).catch(() => setImp(null)); }, []);
  const pull = async () => {
    setBusy(true); setMsg("");
    try { const r = await api.post("/api/hrms/muster/import", {}); setMsg(`Pulled ${r.imported.length} month${r.imported.length === 1 ? "" : "s"}${r.imported.length ? ": " + r.imported.map((x: { month: number; year: number; people: number }) => `${MONTHS[x.month - 1].slice(0, 3)} ${x.year} (${x.people})`).join(", ") : ""}${r.skipped?.length ? ` · ${r.skipped.length} tab${r.skipped.length === 1 ? "" : "s"} skipped` : ""}. Reload to see them.`); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };
  if (!imp) return null;
  return (
    <div className="text-xs mt-2 flex items-center gap-2 flex-wrap" style={{ color: C.faint }}>
      <span>{months} month{months === 1 ? "" : "s"} in Genie · {imp.imports.length} pulled from the HR sheet.</span>
      <button onClick={pull} disabled={busy} className="font-bold rounded px-2 py-1" style={{ border: `1px solid ${C.line}`, color: "var(--blue)", background: "#fff" }}>{busy ? "Pulling…" : "⤓ Pull the earlier months from the HR sheet"}</button>
      {imp.sa_email && <span>The sheet must be shared (Viewer) with <b>{imp.sa_email}</b>.</span>}
      {msg && <span className="font-semibold" style={{ color: /^Pulled/.test(msg) ? "#0D6E39" : C.red }}>{msg}</span>}
    </div>
  );
}

function ByMonth({ who, onPerson }: { who: string; onPerson: (id: string) => void }) {
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
          {(d?.months || []).map((x) => <option key={x.id} value={x.id}>{MONTHS[x.month - 1]} {x.year} · {x.people} people{x.source === "payroll" ? (x.status === "Frozen" ? " · ❄" : "") : x.source === "sheet" ? " · HR sheet" : " · salary sheet"}</option>)}
        </select>
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="text-xs border rounded px-2 py-1.5" style={{ borderColor: C.line }}>
          <option value="all">All categories</option>{(d?.byCategory || []).map((c) => <option key={c.category} value={c.category}>{c.category} · {c.people}</option>)}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a person…" className="text-xs border rounded px-2 py-1.5" style={{ borderColor: C.line, width: 160 }} />
        <div className="flex rounded border overflow-hidden" style={{ borderColor: C.line }}>
          {(["summary", "days"] as const).map((v) => <button key={v} onClick={() => setView(v)} className="text-xs font-bold px-2.5 py-1.5" style={view === v ? { background: "var(--ink)", color: "#fff" } : { color: C.dim, background: "#fff" }}>{v === "summary" ? "Summary" : "Day by day"}</button>)}
        </div>
      </>}>
      <div className="flex items-center gap-3 flex-wrap mb-3"><Switch mode="month" onMode={(k) => k === "person" && onPerson("")} />{d && <PullMonths months={d.months.length} />}</div>
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
              {m.source === "sheet" && <> This month was pulled from the HR sheet{m.tab ? ` (tab "${m.tab}")` : ""}, not a payroll run in Genie.</>}{m.source === "salary" && <> This month is built from the uploaded salary sheet: present = its Attendance, days paid = its Paid Days, absent = days in month − days paid, week-offs and holidays undivided under WO. No day marks, no late figure.</>}
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
            ? <DataTable columns={summaryCols} rows={rows} rowKey={(r) => r.employee_id} initialFrozen={2} empty="Nobody matches." onRowClick={(r) => onPerson(r.employee_id)} />
            : <DataTable columns={dayCols} rows={rows} rowKey={(r) => r.employee_id} initialFrozen={2} empty="Nobody matches." onRowClick={(r) => onPerson(r.employee_id)} />}
          <div className="text-xs mt-2" style={{ color: C.faint }}>Click a person for their months. {view === "days" && <>P present · A absent · WO week-off · MO monthly off · ST statutory holiday · S sick/special (paid) · C comp-off · Sundays shaded.</>}</div>
        </>
      )}
      {!d && !msg && <div className="text-sm py-6 text-center" style={{ color: C.faint }}>loading…</div>}
    </Pane>
  );
}


const MarkRow = ({ days, sundays }: { days: string[]; sundays: number[] }) => {
  const sun = new Set(sundays);
  return <div className="flex flex-wrap" style={{ gap: 2 }}>{days.map((d, i) => { const m = String(d || "").toUpperCase(); const st = MARK[m] || { bg: "", fg: "#16232F" }; return <span key={i} title={`${i + 1}${sun.has(i + 1) ? " · Sunday" : ""}`} style={{ width: 24, height: 20, lineHeight: "20px", textAlign: "center", fontSize: 10, fontWeight: m === "A" ? 700 : 500, borderRadius: 3, background: st.bg || (sun.has(i + 1) ? "#F7F6F2" : "#FBFAF7"), color: st.fg, border: "1px solid #EFEDE7" }}>{m || "·"}</span>; })}</div>;
};

function ByPerson({ who, initial, onMonths }: { who: string; initial: string | null; onMonths: () => void }) {
  const [people, setPeople] = useState<Person[] | null>(null); const [q, setQ] = useState(""); const [id, setId] = useState<string | null>(initial || null);
  const [pv, setPv] = useState<PersonView | null>(null); const [msg, setMsg] = useState("");
  useEffect(() => { api.get("/api/hrms/muster?people=1").then((j) => setPeople(j.people || [])).catch((e) => setMsg(e instanceof Error ? e.message : String(e))); }, []);
  useEffect(() => { if (!id) { setPv(null); return; } setPv(null); api.get(`/api/hrms/muster?person=${encodeURIComponent(id)}`).then(setPv).catch((e) => setMsg(e instanceof Error ? e.message : String(e))); }, [id]);
  const list = useMemo(() => (people || []).filter((p) => !q.trim() || `${p.employee_id} ${p.name} ${p.department || ""}`.toLowerCase().includes(q.trim().toLowerCase())), [people, q]);
  const A = pv?.averages; const P = pv?.person;
  const cols: Column<PersonView["months"][number]>[] = [
    { key: "month", label: "Month", width: 120, value: (r) => r.month.year * 100 + r.month.month, numeric: true, render: (r) => <b>{MONTHS[r.month.month - 1]} {r.month.year}</b> },
    { key: "src", label: "From", width: 90, value: (r) => (r.month.source === "payroll" ? "Payroll run" : r.month.source === "sheet" ? "HR sheet" : "Salary sheet") },
    { key: "pay", label: "Days paid", width: 80, align: "right", numeric: true, value: (r) => r.line.pay_days },
    { key: "present", label: "Present", width: 70, align: "right", numeric: true, value: (r) => r.line.present },
    { key: "absent", label: "Absent", width: 70, align: "right", numeric: true, value: (r) => r.line.absent, render: (r) => <span style={{ color: r.line.absent ? "#B3392E" : C.faint, fontWeight: r.line.absent ? 700 : 400 }}>{r.line.absent}</span> },
    { key: "wo", label: "WO", width: 50, align: "right", numeric: true, value: (r) => r.line.wo },
    { key: "mo", label: "MO/ST", width: 60, align: "right", numeric: true, value: (r) => r.line.mo_st },
    { key: "att", label: "Attendance %", width: 100, align: "right", numeric: true, value: (r) => r.line.attendance_pct, render: (r) => <b style={{ color: tone(r.line.attendance_pct, 95, 80) }}>{pc(r.line.attendance_pct)}</b> },
    { key: "late", label: "Late (days)", width: 80, align: "right", numeric: true, value: (r) => r.line.late },
    { key: "latepct", label: "Late coming %", width: 100, align: "right", numeric: true, value: (r) => r.line.late_pct, render: (r) => <b style={{ color: tone(r.line.late_pct, 5, 20, true) }}>{pc(r.line.late_pct)}</b> },
    { key: "compoff", label: "Comp off", width: 70, align: "right", numeric: true, value: (r) => r.line.compoff },
    { key: "et", label: "ET", width: 60, align: "right", numeric: true, value: (r) => r.line.et },
    { key: "marks", label: "Day by day", width: 820, value: (r) => r.line.days.join(" "), render: (r) => (r.line.days.length ? <MarkRow days={r.line.days} sundays={r.sundays} /> : <span style={{ color: C.faint }}>no day marks in this source</span>) },
  ];
  const Stat = ({ k, v, c }: { k: string; v: string; c?: string }) => <div><div style={{ fontSize: 10, color: C.faint, fontWeight: 700, letterSpacing: .6 }}>{k}</div><div className="tnum" style={{ fontSize: 17, fontWeight: 800, color: c || "#16232F" }}>{v}</div></div>;
  return (
    <Pane title="Attendance Muster" who={who} blurb="One person across every month Genie holds a muster for."
      tools={<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a person by name, id or department…" className="text-xs border rounded px-2 py-1.5" style={{ borderColor: C.line, width: 280 }} autoFocus />}>
      <div className="mb-3"><Switch mode="person" onMode={(k) => k === "month" && onMonths()} /></div>
      {msg && <div className="text-xs font-semibold mb-2" style={{ color: C.red }}>{msg}</div>}
      <div className="grid gap-3" style={{ gridTemplateColumns: id ? "260px 1fr" : "1fr" }}>
        <div className="bg-white rounded-lg border" style={{ borderColor: C.line, maxHeight: "calc(100vh - 260px)", overflow: "auto" }}>
          {people === null ? <div className="text-sm p-3" style={{ color: C.faint }}>loading…</div> : list.length === 0 ? <div className="text-sm p-3" style={{ color: C.faint }}>Nobody matches.</div> : list.map((p) => (
            <button key={p.employee_id} onClick={() => setId(p.employee_id)} className="block w-full text-left px-3 py-2" style={{ borderBottom: `1px solid ${C.line}`, background: id === p.employee_id ? "#F4F2EC" : "#fff" }}>
              <div className="text-sm font-semibold" style={{ color: "#16232F" }}>{p.name} <span style={{ color: C.faint, fontWeight: 400 }}>· {p.employee_id}</span></div>
              <div className="text-xs" style={{ color: C.faint }}>{p.department || "—"} · {p.category} · {p.months} month{p.months === 1 ? "" : "s"}</div>
            </button>
          ))}
          {people && <div className="text-xs p-2" style={{ color: C.faint }}>{list.length === people.length ? `${people.length} people` : `${list.length} of ${people.length} people`}.</div>}
        </div>
        {id && (
          <div style={{ minWidth: 0 }}>
            {!pv ? <div className="text-sm p-3" style={{ color: C.faint }}>loading…</div> : !P ? <div className="text-sm p-3" style={{ color: C.faint }}>No muster carries {id}.</div> : (
              <>
                <div className="bg-white rounded-lg border px-4 py-3 mb-3 flex gap-6 flex-wrap items-end" style={{ borderColor: C.line }}>
                  <div><div className="font-bold" style={{ fontSize: 16 }}>{P.name} <span style={{ color: C.faint, fontWeight: 400, fontSize: 12 }}>· {P.employee_id}</span></div><div className="text-xs" style={{ color: C.dim }}>{P.designation || "—"} · {P.department || "—"} · {P.category} · {P.location || "—"}</div></div>
                  {A && <>
                    <Stat k="MONTHS" v={String(A.months)} />
                    <Stat k="DAYS PAID" v={A.pay_days.toLocaleString("en-IN")} />
                    <Stat k="PRESENT" v={A.present.toLocaleString("en-IN")} />
                    <Stat k="ABSENT" v={String(A.absent)} c={A.absent ? "#B3392E" : undefined} />
                    <Stat k="ATTENDANCE %" v={pc(A.attendance_pct)} c={tone(A.attendance_pct, 95, 80)} />
                    <Stat k="LATE COMING %" v={pc(A.late_pct)} c={tone(A.late_pct, 5, 20, true)} />
                  </>}
                </div>
                <DataTable columns={cols} rows={pv.months} rowKey={(r) => r.month.id} initialFrozen={1} maxHeight="calc(100vh - 380px)" />
              </>
            )}
          </div>
        )}
      </div>
    </Pane>
  );
}
