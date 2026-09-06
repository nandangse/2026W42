"use client";

/**
 * The COMPLIANCE CALENDAR (Dr Raghu, 28 Aug 2026, from his sheet):
 * compliances down the side, the FY's months across. Each cell says WHEN it
 * was done, carries THE LINK to the proof (openable), and both are editable
 * in a click. THE COLOUR IS JUDGED FROM THE DATE — green done by the due
 * day, amber late, red when a past month stands empty — never typed.
 */

import { useCallback, useEffect, useState } from "react";
import { dmy as fmtD } from "@/lib/fmt";

const INK = "var(--navy)", MUTED = "var(--muted)", BORDER = "var(--line)", ORANGE = "var(--accent)", RED = "var(--red)", GREEN = "var(--green)";


interface CRow { id: string; name: string; grp: string; frequency: string; due_day: number | null; due_note: string }
interface CEntry { compliance_id: string; month: string; done_on: string | null; link: string; note: string }
interface CData { installed: boolean; fy: number; months: string[]; rows: CRow[]; entries: CEntry[] }

/** The due date a month's cell answers to: the rule's day of the NEXT month. */
const dueOf = (month: string, dueDay: number | null) => {
  if (!dueDay) return null;
  const [y, m] = month.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(dueDay, last)).padStart(2, "0")}`;
};

export default function ComplianceCalendar() {
  const thisFy = (() => {
    const t = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    return Number(t.slice(5, 7)) >= 4 ? Number(t.slice(0, 4)) : Number(t.slice(0, 4)) - 1;
  })();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const [fy, setFy] = useState(thisFy);
  const [data, setData] = useState<CData | null>(null);
  const [edit, setEdit] = useState<{ row: CRow; month: string; e: CEntry | null } | null>(null);
  const [master, setMaster] = useState<CRow | "new" | null>(null);

  const load = useCallback(() => {
    fetch(`/api/kuber/compliance?fy=${fy}`, { cache: "no-store" })
      .then((r) => r.json()).then(setData).catch(() => setData(null));
  }, [fy]);
  useEffect(() => { load(); }, [load]);

  if (data && data.installed === false) return (
    <div className="rounded p-3 text-sm font-semibold" style={{ background: "#FCF6E8", color: "#8A6D1A", maxWidth: 560 }}>
      Run migration 0093 first — the calendar has nowhere to live yet.
    </div>
  );

  const entryOf = (rid: string, m: string) => data?.entries.find((e) => e.compliance_id === rid && e.month === m) || null;
  // the colour, judged from the date (his sheet's legend: Verified green,
  // Late-and-Risk amber, Not Done red)
  const cellStyle = (row: CRow, m: string, e: CEntry | null): React.CSSProperties => {
    const due = dueOf(m, row.due_day);
    const monthPast = m < today.slice(0, 7);
    if (e?.done_on) {
      if (due && e.done_on > due) return { background: "#FCF0CE" };
      return { background: "#CDEFCF" };
    }
    if (monthPast && (due ? due < today : true)) return { background: "#F7C6C0" };
    return { background: "#fff" };
  };

  const mLabel = (m: string) => new Date(m + "-01T00:00:00Z").toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });
  const grps = [...new Set((data?.rows || []).map((r) => r.grp))];

  return (
    <div>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <div>
          <div className="text-lg font-bold" style={{ color: INK }}>Compliance Calendar</div>
          <div className="text-sm" style={{ color: "var(--dim)", maxWidth: 680 }}>
            The colour is judged from the date, never typed: <span className="rounded px-1.5 font-bold" style={{ background: "#CDEFCF" }}>done by the due day</span>{" "}
            <span className="rounded px-1.5 font-bold" style={{ background: "#FCF0CE" }}>done late</span>{" "}
            <span className="rounded px-1.5 font-bold" style={{ background: "#F7C6C0" }}>past and not done</span>.
            A cell opens to its date, link and note; the link opens the proof.
          </div>
        </div>
        <span className="ml-auto" />
        <select value={fy} onChange={(e) => setFy(Number(e.target.value))} className="border rounded px-2 py-1 text-sm bg-white font-bold" style={{ borderColor: BORDER }}>
          {[thisFy + 1, thisFy, thisFy - 1, thisFy - 2].map((y) => (<option key={y} value={y}>FY {y}-{String(y + 1).slice(2)}</option>))}
        </select>
        <button onClick={() => setMaster("new")} className="rounded px-3 py-1.5 text-sm font-bold text-white" style={{ background: ORANGE }}>＋ Add a compliance</button>
      </div>

      <div className="bg-white rounded-lg border overflow-auto" style={{ borderColor: BORDER, maxHeight: "74vh" }}>
        <table className="text-xs genie-table" style={{ minWidth: 1250, borderCollapse: "separate", borderSpacing: 0 }}>
          <thead><tr style={{ background: "var(--ink)", color: "#fff" }}>
            <th className="px-2 py-2 text-left" style={{ position: "sticky", top: 0, left: 0, background: "var(--ink)", zIndex: 3, minWidth: 210 }}>Compliance</th>
            <th className="px-2 py-2 text-left whitespace-nowrap" style={{ position: "sticky", top: 0, background: "var(--ink)", zIndex: 2 }}>Due</th>
            {(data?.months || []).map((m) => (
              <th key={m} className="px-2 py-2 text-center whitespace-nowrap" style={{ position: "sticky", top: 0, background: "var(--ink)", zIndex: 2, minWidth: 92 }}>{mLabel(m)}</th>
            ))}
          </tr></thead>
          <tbody>
            {!data && (<tr><td colSpan={14} className="px-3 py-5 text-center" style={{ color: MUTED }}>loading…</td></tr>)}
            {grps.map((g) => (
              <FragK key={g || "misc"}>
                {g && (
                  <tr style={{ background: "#F3F1EB" }}>
                    <td colSpan={14} className="px-2 py-1 font-bold" style={{ color: "var(--dim)", position: "sticky", left: 0, letterSpacing: 0.6 }}>{g}</td>
                  </tr>
                )}
                {(data?.rows || []).filter((r) => r.grp === g).map((row) => (
                  <tr key={row.id} className="border-t" style={{ borderColor: "var(--line-soft)" }}>
                    <td className="px-2 py-1.5 font-semibold" role="button" tabIndex={0} onClick={() => setMaster(row)}
                      style={{ position: "sticky", left: 0, background: "#fff", zIndex: 1, cursor: "pointer", boxShadow: "2px 0 4px rgba(22,35,47,0.05)" }}
                      title="Edit this compliance">
                      {row.name}
                      <div style={{ color: MUTED, fontWeight: 400, fontSize: 10 }}>{row.frequency}</div>
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap" style={{ color: MUTED }}>{row.due_note || (row.due_day ? `${row.due_day}th of next month` : "—")}</td>
                    {(data?.months || []).map((m) => {
                      const e = entryOf(row.id, m);
                      return (
                        <td key={m} role="button" tabIndex={0} onClick={() => setEdit({ row, month: m, e })}
                          className="px-1.5 py-1.5 text-center" style={{ ...cellStyle(row, m, e), cursor: "pointer", borderLeft: "1px solid #EFEDE7" }}>
                          {e?.done_on ? (
                            e.link
                              ? <a href={e.link} target="_blank" rel="noreferrer" onClick={(ev) => ev.stopPropagation()}
                                  style={{ color: "#1B5E20", fontWeight: 700, textDecoration: "underline" }} title="Open the proof">{fmtD(e.done_on)}</a>
                              : <b style={{ color: "#1B5E20" }}>{fmtD(e.done_on)}</b>
                          ) : e?.note ? <span style={{ color: MUTED }}>{e.note.slice(0, 10)}</span> : <span style={{ color: "#C9C5BB" }}>·</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </FragK>
            ))}
          </tbody>
        </table>
      </div>

      {edit && <CellBox row={edit.row} month={edit.month} e={edit.e} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
      {master && <MasterBox row={master === "new" ? null : master} onClose={() => setMaster(null)} onSaved={() => { setMaster(null); load(); }} />}
    </div>
  );
}
const FragK = ({ children }: { children: React.ReactNode }) => <>{children}</>;

function CellBox({ row, month, e, onClose, onSaved }: { row: CRow; month: string; e: CEntry | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ done_on: e?.done_on || "", link: e?.link || "", note: e?.note || "" });
  const [busy, setBusy] = useState(false);
  const due = dueOf(month, row.due_day);
  const save = async () => {
    setBusy(true);
    await fetch("/api/kuber/compliance", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "entry", compliance_id: row.id, month, ...f }),
    });
    setBusy(false); onSaved();
  };
  return (
    <div onClick={onClose} className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.45)", zIndex: 60 }}>
      <div onClick={(ev) => ev.stopPropagation()} className="bg-white rounded-lg p-4 w-full" style={{ maxWidth: 440 }}>
        <div className="flex items-center justify-between mb-2">
          <div className="font-bold text-sm" style={{ color: INK }}>{row.name} — {new Date(month + "-01T00:00:00Z").toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })}</div>
          <button onClick={onClose} style={{ color: MUTED }}>✕</button>
        </div>
        {due && <div className="text-xs mb-2" style={{ color: MUTED }}>Due {fmtD(due)} — the colour judges the done-date against this.</div>}
        <div className="space-y-2 text-sm">
          <div><span className="block text-xs font-bold mb-0.5" style={{ color: MUTED }}>Done on</span>
            <input type="date" value={f.done_on} onChange={(ev) => setF({ ...f, done_on: ev.target.value })} className="border rounded px-2 py-1.5 tnum" style={{ borderColor: BORDER }} /></div>
          <div><span className="block text-xs font-bold mb-0.5" style={{ color: MUTED }}>Link — the challan / filing proof; opens from the cell</span>
            <input value={f.link} onChange={(ev) => setF({ ...f, link: ev.target.value })} placeholder="https://…" className="w-full border rounded px-2 py-1.5" style={{ borderColor: BORDER }} /></div>
          <div><span className="block text-xs font-bold mb-0.5" style={{ color: MUTED }}>Note</span>
            <input value={f.note} onChange={(ev) => setF({ ...f, note: ev.target.value })} placeholder="Nil · NA · challan no…" className="w-full border rounded px-2 py-1.5" style={{ borderColor: BORDER }} /></div>
          <div className="flex gap-2 pt-1">
            <button onClick={save} disabled={busy} className="flex-1 rounded py-1.5 font-bold text-white" style={{ background: busy ? "#B9BEC4" : ORANGE }}>💾 Save</button>
            {e && <button onClick={async () => { setF({ done_on: "", link: "", note: "" }); await fetch("/api/kuber/compliance", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "entry", compliance_id: row.id, month, done_on: "", link: "", note: "" }) }); onSaved(); }}
              className="rounded px-3 font-bold" style={{ color: RED }} title="Clear this cell">🗑</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

function MasterBox({ row, onClose, onSaved }: { row: CRow | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: row?.name || "", grp: row?.grp || "", frequency: row?.frequency || "Monthly", due_day: row?.due_day == null ? "" : String(row.due_day), due_note: row?.due_note || "" });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    await fetch("/api/kuber/compliance", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: row ? "edit" : "add", id: row?.id, ...f }),
    });
    setBusy(false); onSaved();
  };
  return (
    <div onClick={onClose} className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.45)", zIndex: 60 }}>
      <div onClick={(ev) => ev.stopPropagation()} className="bg-white rounded-lg p-4 w-full" style={{ maxWidth: 460 }}>
        <div className="flex items-center justify-between mb-2">
          <div className="font-bold text-sm" style={{ color: INK }}>{row ? "Edit compliance" : "Add a compliance"}</div>
          <button onClick={onClose} style={{ color: MUTED }}>✕</button>
        </div>
        <div className="space-y-2 text-sm">
          <div><span className="block text-xs font-bold mb-0.5" style={{ color: MUTED }}>Name</span>
            <input value={f.name} onChange={(ev) => setF({ ...f, name: ev.target.value })} className="w-full border rounded px-2 py-1.5" style={{ borderColor: BORDER }} /></div>
          <div className="flex gap-2">
            <div className="flex-1"><span className="block text-xs font-bold mb-0.5" style={{ color: MUTED }}>Group</span>
              <input value={f.grp} onChange={(ev) => setF({ ...f, grp: ev.target.value })} placeholder="TDS · GST · PF…" className="w-full border rounded px-2 py-1.5" style={{ borderColor: BORDER }} /></div>
            <div><span className="block text-xs font-bold mb-0.5" style={{ color: MUTED }}>Frequency</span>
              <select value={f.frequency} onChange={(ev) => setF({ ...f, frequency: ev.target.value })} className="border rounded px-2 py-1.5 bg-white" style={{ borderColor: BORDER }}>
                {["Monthly", "Quarterly", "Half yearly", "Yearly"].map((x) => (<option key={x}>{x}</option>))}
              </select></div>
          </div>
          <div className="flex gap-2">
            <div><span className="block text-xs font-bold mb-0.5" style={{ color: MUTED }}>Due day (of next month)</span>
              <input value={f.due_day} onChange={(ev) => setF({ ...f, due_day: ev.target.value.replace(/[^0-9]/g, "") })} className="border rounded px-2 py-1.5 tnum text-right" style={{ borderColor: BORDER, width: 90 }} placeholder="7" /></div>
            <div className="flex-1"><span className="block text-xs font-bold mb-0.5" style={{ color: MUTED }}>Due note (when the day rule doesn&apos;t fit)</span>
              <input value={f.due_note} onChange={(ev) => setF({ ...f, due_note: ev.target.value })} placeholder="30 Nov · month end…" className="w-full border rounded px-2 py-1.5" style={{ borderColor: BORDER }} /></div>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={save} disabled={busy || !f.name.trim()} className="flex-1 rounded py-1.5 font-bold text-white" style={{ background: busy || !f.name.trim() ? "#B9BEC4" : ORANGE }}>💾 Save</button>
            {row && <button onClick={async () => {
              if (!window.confirm("Retire this compliance? Its history stays.")) return;
              await fetch("/api/kuber/compliance", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "remove", id: row.id }) });
              onSaved();
            }} className="rounded px-3 font-bold" style={{ color: RED }}>Retire</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
