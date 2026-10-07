"use client";
/**
 * Run Monthly Payroll — the table of runs (Dr Raghu, 4 Sep 2026): "Month,
 * Year, Date run, run by, approved by. Approval is by Raghu."
 *
 * A run is the month's salary sheet. Finalized Salary Sheets uploads and
 * freezes it; this table is the ledger of runs with the owner's approval
 * against each. A month can be recorded before its file arrives.
 */
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { fmtFull } from "@/lib/schedule";
import { MONTHS } from "@/lib/hrms-template";
import { Pane } from "./Pane";
import { C } from "./RecordFields";
import PayrollRun from "./PayrollRun";

interface Run { id: string; month: number; year: number; status: string; file_name: string | null; uploaded_by: string | null; uploaded_at: string | null; frozen_by: string | null; frozen_at: string | null; approved_by: string | null; approved_at: string | null; run_note: string | null; total_count: number | null; total_salary: number | null; net_payable: number | null; paid_to_bank: number | null; created_at: string }

const who = (s: string | null) => (s ? String(s).split("·")[0].trim() : "—");
const lakh = (n: number | null) => (n == null ? "—" : n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(2)} L` : `₹${Math.round(n).toLocaleString("en-IN")}`);

export default function Payroll({ who: me, isOwner }: { who: string; isOwner: boolean }) {
  const [rows, setRows] = useState<Run[] | null>(null);
  const [needs, setNeeds] = useState(false);
  const [msg, setMsg] = useState("");
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const now = new Date();
  const [nf, setNf] = useState({ month: String(now.getMonth() + 1), year: String(now.getFullYear()), note: "" });

  const load = useCallback(async () => {
    try { const j = await api.get("/api/hrms/payroll"); setRows(j.rows || []); setNeeds(!!j.needsMigration); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); setRows([]); }
  }, []);
  useEffect(() => { load(); }, [load]);
  // #payroll:<run id> — the approval mail's link opens the run itself (7 Oct 2026)
  useEffect(() => {
    const m = /^#payroll:([0-9a-f-]{36})$/i.exec(window.location.hash || "");
    if (m) setOpenId(m[1]);
  }, []);

  const act = async (body: Record<string, unknown>, ok: string) => {
    setMsg("");
    try { await api.post("/api/hrms/payroll", body); setMsg(`${ok} ✓`); await load(); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  };

  if (openId) {
    return (
      <Pane title="Run Monthly Payroll" who={me} blurb="The run as a document: uploads, the attendance muster, the salary register, and every message sent from it.">
        <PayrollRun id={openId} isOwner={isOwner} onBack={() => { setOpenId(null); load(); }} />
      </Pane>
    );
  }

  return (
    <Pane title="Run Monthly Payroll" who={me} print
      blurb="Every month's run on one table: when it was run and by whom, whether the sheet is frozen, and Raghu's approval against it. The sheet itself is under Finalized Salary Sheets."
      tools={<button onClick={() => setAdding((v) => !v)} className="text-xs font-bold rounded px-3 py-1.5" style={{ background: C.orange, color: "#fff" }}>{adding ? "✕ Cancel" : "+ New payroll run"}</button>}>
      {msg && <div className="text-xs font-semibold mb-2" style={{ color: msg.includes("✓") ? C.green : C.red }}>{msg}</div>}
      {needs && <div className="rounded p-2 mb-2" style={{ background: "#FFF7E6", border: "1px solid #F5D9A8", fontSize: 12.5, color: "#8A5B00" }}>Run migration 0132 — approval has nowhere to be kept yet.</div>}

      {adding && (
        <div className="bg-white rounded-lg border p-3 mb-3 flex gap-2 items-end flex-wrap" style={{ borderColor: C.orange }}>
          <label className="text-xs" style={{ color: C.dim }}>Month
            <select value={nf.month} onChange={(e) => setNf({ ...nf, month: e.target.value })} className="block rounded px-2 py-1.5 mt-0.5 bg-white" style={{ border: `1px solid ${C.line}`, fontSize: 13 }}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </label>
          <label className="text-xs" style={{ color: C.dim }}>Year
            <input value={nf.year} onChange={(e) => setNf({ ...nf, year: e.target.value })} className="block rounded px-2 py-1.5 mt-0.5" style={{ border: `1px solid ${C.line}`, fontSize: 13, width: 80 }} />
          </label>
          <label className="text-xs" style={{ color: C.dim, flex: 1, minWidth: 200 }}>Note
            <input value={nf.note} onChange={(e) => setNf({ ...nf, note: e.target.value })} placeholder="e.g. run on Tally, sheet to follow" className="block w-full rounded px-2 py-1.5 mt-0.5" style={{ border: `1px solid ${C.line}`, fontSize: 13 }} />
          </label>
          <button onClick={async () => {
            setMsg("");
            try { const j = await api.post("/api/hrms/payroll", { action: "record", month: Number(nf.month), year: Number(nf.year), note: nf.note }); setAdding(false); await load(); if (j.id) setOpenId(String(j.id)); }
            catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
          }} className="text-xs font-bold rounded px-3 py-1.5" style={{ background: C.green, color: "#fff" }}>Create & open</button>
        </div>
      )}

      <div className="bg-white rounded-lg border" style={{ borderColor: C.line, overflowX: "auto" }}>
        <table className="w-full genie-table" style={{ fontSize: 13, borderCollapse: "collapse", whiteSpace: "nowrap" }}>
          <thead><tr style={{ color: C.faint, fontSize: 11 }}>
            {["Month", "Year", "Date run", "Run by", "Sheet", "People", "Net payable", "Approved by", "Approved on", ""].map((h, i) => (
              <th key={h + i} className="text-left px-2 py-2" style={{ borderBottom: `1px solid ${C.line}`, textAlign: i === 5 || i === 6 ? "right" : "left" }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan={10} className="px-2 py-4" style={{ color: C.faint }}>loading…</td></tr>}
            {rows?.length === 0 && <tr><td colSpan={10} className="px-2 py-4" style={{ color: C.faint }}>No runs yet — upload a sheet under Finalized Salary Sheets, or record one here.</td></tr>}
            {rows?.map((r) => (
              <tr key={r.id} style={{ borderTop: "1px solid #EEECE6" }}>
                <td className="px-2 py-1.5 font-semibold"><button onClick={() => setOpenId(r.id)} style={{ color: "var(--blue)", textDecoration: "underline", textUnderlineOffset: 2 }} title="Open the run">{MONTHS[r.month - 1]}</button></td>
                <td className="px-2 py-1.5">{r.year}</td>
                <td className="px-2 py-1.5">{r.uploaded_at ? fmtFull(String(r.uploaded_at)) : fmtFull(String(r.created_at))}</td>
                <td className="px-2 py-1.5">{who(r.uploaded_by)}</td>
                <td className="px-2 py-1.5">
                  <span className="rounded px-1.5 py-0.5 font-bold" style={{ fontSize: 10, background: r.status === "Frozen" ? "#E6F4EA" : "#FFF3E8", color: r.status === "Frozen" ? C.green : "#8A5B00" }}>{r.status === "Frozen" ? "✓ Frozen" : r.file_name ? "Draft" : "no file yet"}</span>
                  {r.run_note && <span className="ml-1" style={{ color: C.faint, fontSize: 11 }} title={r.run_note}>· {r.run_note.slice(0, 40)}{r.run_note.length > 40 ? "…" : ""}</span>}
                </td>
                <td className="px-2 py-1.5 text-right tnum">{r.total_count ?? "—"}</td>
                <td className="px-2 py-1.5 text-right tnum">{lakh(r.net_payable)}</td>
                <td className="px-2 py-1.5">{r.approved_by ? <span className="font-bold" style={{ color: C.green }}>✓ {who(r.approved_by)}</span> : <span style={{ color: "#8A5B00" }}>awaiting Raghu</span>}</td>
                <td className="px-2 py-1.5" style={{ color: C.faint }}>{r.approved_at ? fmtFull(String(r.approved_at)) : "—"}</td>
                <td className="px-2 py-1.5 text-right whitespace-nowrap">
                  <button onClick={() => setOpenId(r.id)} className="text-xs font-semibold rounded border px-2 py-0.5 bg-white mr-1" style={{ borderColor: C.line, color: "var(--blue)" }}>open</button>
                  {isOwner && (r.approved_by
                    ? <button onClick={() => act({ action: "unapprove", id: r.id }, "Approval withdrawn")} className="text-xs font-semibold rounded border px-2 py-0.5 bg-white" style={{ borderColor: C.line, color: C.dim }}>withdraw</button>
                    : <button onClick={() => { if (window.confirm(`Approve the ${MONTHS[r.month - 1]} ${r.year} payroll run?`)) act({ action: "approve", id: r.id }, `${MONTHS[r.month - 1]} ${r.year} approved`); }} className="text-xs font-bold rounded px-2.5 py-1" style={{ background: C.green, color: "#fff" }}>✓ Approve</button>)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-xs mt-2" style={{ color: C.faint }}>Date run and Run by come from the sheet&apos;s upload. Approval is {isOwner ? "yours" : "Raghu's"}; a run shows &ldquo;awaiting Raghu&rdquo; until then.</div>
    </Pane>
  );
}
