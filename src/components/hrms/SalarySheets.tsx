"use client";
/**
 * Finalized Salary Sheets — one row per month, and what was paid in it.
 *
 * HR uploads the month's sheet; it is parsed once, totalled, and shown as
 * Staff and Labour with counts and value, then the four figures from the
 * file — earned pay, deductions, net payable — beside what actually left the
 * bank. RJ freezes it, and from then on it is a record rather than a
 * working file.
 *
 * The totals are taken AT UPLOAD and never recomputed: April has already
 * been paid, and a person changing type in September must not restate it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { fmtFull } from "@/lib/schedule";
import { MONTHS } from "@/lib/salary-sheet";
import { Pane } from "./Pane";
import { C } from "./RecordFields";

interface Sheet {
  id: string; month: number; year: number;
  file_name: string | null; status: string;
  uploaded_by: string | null; uploaded_at: string | null;
  staff_count: number | null; staff_value: number | null;
  labour_count: number | null; labour_value: number | null;
  total_count: number | null; total_salary: number | null;
  earned_pay: number | null; deductions: number | null; net_payable: number | null;
  paid_to_bank: number | null;
  frozen_by: string | null; frozen_at: string | null;
  mapping: { headerRow: number; columns: Record<string, string>; unmapped: string[]; warnings: string[] } | null;
  note: string | null;
}
interface Line { employee_id: string | null; name: string | null; type: string | null; earned: number; deductions: number; net: number }

const inr = (n: number | null | undefined) => (n == null ? "—" : Math.round(n).toLocaleString("en-IN"));
const lakh = (n: number | null | undefined) => (n == null ? "—" : n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(2)} L` : `₹${inr(n)}`);
const day = (iso: string | null) => (iso ? fmtFull(String(iso).slice(0, 10)) : "—");
const who = (s: string | null) => String(s || "—").split("·")[0].trim();

export default function SalarySheets({ who: me, isOwner }: { who: string; isOwner: boolean }) {
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [needs, setNeeds] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [year, setYear] = useState("");

  const load = useCallback(async () => {
    try { const j = await api.get("/api/hrms/salary-sheets"); setSheets(j.sheets || []); setNeeds(!!j.needsMigration); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); setSheets([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (body: Record<string, unknown>, label: string) => {
    setBusy(true); setMsg("");
    try { await api.post("/api/hrms/salary-sheets", body); setMsg(`${label} ✓`); await load(); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };

  const years = useMemo(() => [...new Set((sheets || []).map((s) => s.year))].sort((a, b) => b - a), [sheets]);
  const shown = (sheets || []).filter((s) => !year || String(s.year) === year);

  const paidYear = shown.reduce((a, s) => a + (s.net_payable || 0), 0);
  const frozenN = shown.filter((s) => s.status === "Frozen").length;

  return (
    <Pane title="Finalized Salary Sheets" who={me} print
      blurb="The month's sheet, once it is closed. Upload it, check what was read, then freeze it — after which it is a record of what was paid, not a working file.">
      {msg && <div className="text-xs font-semibold mb-2" style={{ color: msg.includes("✓") ? C.green : C.red }}>{msg}</div>}
      {needs && <div className="rounded p-2 mb-2" style={{ background: "#FFF7E6", border: "1px solid #F5D9A8", fontSize: 12.5, color: "#8A5B00" }}>Run migration 0066 — a salary sheet has nowhere to live yet.</div>}

      <Upload onDone={(m) => { setMsg(m); load(); }} />

      <div className="flex gap-2 flex-wrap items-center mb-3">
        <Stat n={String(shown.length)} l="Months on record" />
        <Stat n={String(frozenN)} l="Frozen" green={frozenN > 0} />
        <Stat n={lakh(paidYear)} l="Net paid, months shown" />
        <div style={{ flex: 1 }} />
        <select value={year} onChange={(e) => setYear(e.target.value)} className="text-xs rounded px-2 py-1.5 bg-white no-print" style={{ border: `1px solid ${C.line}` }}>
          <option value="">All years</option>
          {years.map((y) => <option key={y} value={String(y)}>{y}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-lg border" style={{ borderColor: C.line, overflowX: "auto" }}>
        <table className="w-full" style={{ fontSize: 12.5, borderCollapse: "collapse", minWidth: 1100 }}>
          <thead>
            <tr style={{ color: C.faint, fontSize: 10.5, background: "#F4F2EC" }}>
              <th className="text-left px-2 py-1.5" style={{ borderBottom: `1px solid ${C.line}` }}>Month</th>
              <th className="text-left px-2 py-1.5" style={{ borderBottom: `1px solid ${C.line}` }}>Year</th>
              <th className="text-left px-2 py-1.5" style={{ borderBottom: `1px solid ${C.line}` }}>File uploaded</th>
              <th className="text-left px-2 py-1.5" style={{ borderBottom: `1px solid ${C.line}` }}>Status</th>
              <th className="text-right px-2 py-1.5" style={{ borderBottom: `1px solid ${C.line}` }}>Staff (nos)</th>
              <th className="text-right px-2 py-1.5" style={{ borderBottom: `1px solid ${C.line}` }}>Staff value</th>
              <th className="text-right px-2 py-1.5" style={{ borderBottom: `1px solid ${C.line}` }}>Labour (nos)</th>
              <th className="text-right px-2 py-1.5" style={{ borderBottom: `1px solid ${C.line}` }}>Labour value</th>
              <th className="text-right px-2 py-1.5" style={{ borderBottom: `1px solid ${C.line}`, background: "#EDEAE1" }}>Total nos</th>
              <th className="text-right px-2 py-1.5" style={{ borderBottom: `1px solid ${C.line}`, background: "#EDEAE1" }}>Total salary</th>
              <th className="text-right px-2 py-1.5" style={{ borderBottom: `1px solid ${C.line}` }}>Earned pay</th>
              <th className="text-right px-2 py-1.5" style={{ borderBottom: `1px solid ${C.line}` }}>Deductions</th>
              <th className="text-right px-2 py-1.5" style={{ borderBottom: `1px solid ${C.line}` }}>Net payable</th>
              <th className="text-right px-2 py-1.5" style={{ borderBottom: `1px solid ${C.line}` }}>Paid to bank</th>
              <th className="text-left px-2 py-1.5" style={{ borderBottom: `1px solid ${C.line}` }}>Frozen by RJ</th>
              <th style={{ borderBottom: `1px solid ${C.line}` }}></th>
            </tr>
          </thead>
          <tbody>
            {sheets === null && <tr><td colSpan={16} className="px-2 py-6 text-center" style={{ color: C.faint }}>loading…</td></tr>}
            {sheets !== null && !shown.length && (
              <tr><td colSpan={16} className="px-2 py-6 text-center" style={{ color: C.faint }}>
                No month has been uploaded yet. Choose a month above and attach its sheet.
              </td></tr>
            )}
            {shown.map((s) => {
              const gap = s.paid_to_bank != null && s.net_payable != null ? s.paid_to_bank - s.net_payable : null;
              const warn = (s.mapping?.warnings || []).length;
              return (
                <tr key={s.id} style={{ borderBottom: "1px solid #F2F0EA" }}>
                  <td className="px-2 py-1.5 font-bold">{MONTHS[s.month - 1]}</td>
                  <td className="px-2 py-1.5 tnum">{s.year}</td>
                  <td className="px-2 py-1.5" style={{ maxWidth: 190 }}>
                    <button onClick={() => setOpen(s.id)} className="text-left block w-full"
                      title={s.file_name || ""}
                      style={{ color: "#1B3A5C", textDecoration: "underline", textUnderlineOffset: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {s.file_name || "(no file)"}
                    </button>
                    <div style={{ fontSize: 10, color: C.faint, whiteSpace: "nowrap" }}>
                      {who(s.uploaded_by)} · {day(s.uploaded_at)}
                      {warn > 0 && <span className="ml-1 rounded px-1 font-bold" style={{ fontSize: 9, background: "#FFF3E8", color: "#8A5B00" }} title="the parser had something to say">!{warn}</span>}
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    <span className="rounded px-1.5 py-0.5 font-bold" style={{ fontSize: 10, background: s.status === "Frozen" ? "#E6F4EA" : "#FFF3E8", color: s.status === "Frozen" ? "#0D7A3F" : "#8A5B00" }}>
                      {s.status === "Frozen" ? "✓ Frozen" : "Draft"}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right tnum">{s.staff_count ?? "—"}</td>
                  <td className="px-2 py-1.5 text-right tnum">{inr(s.staff_value)}</td>
                  <td className="px-2 py-1.5 text-right tnum">{s.labour_count ?? "—"}</td>
                  <td className="px-2 py-1.5 text-right tnum">{inr(s.labour_value)}</td>
                  <td className="px-2 py-1.5 text-right tnum font-bold" style={{ background: "#FAF8F2" }}>{s.total_count ?? "—"}</td>
                  <td className="px-2 py-1.5 text-right tnum font-bold" style={{ background: "#FAF8F2" }}>{inr(s.total_salary)}</td>
                  <td className="px-2 py-1.5 text-right tnum">{inr(s.earned_pay)}</td>
                  <td className="px-2 py-1.5 text-right tnum" style={{ color: C.red }}>{inr(s.deductions)}</td>
                  <td className="px-2 py-1.5 text-right tnum font-bold">{inr(s.net_payable)}</td>
                  <td className="px-2 py-1.5 text-right tnum">
                    {s.status === "Frozen"
                      ? inr(s.paid_to_bank)
                      : <PaidBox value={s.paid_to_bank} onSave={(v) => act({ action: "paid", id: s.id, paid_to_bank: v }, "Saved")} />}
                    {gap != null && Math.abs(gap) >= 1 && (
                      <div style={{ fontSize: 9.5, color: C.red, fontWeight: 700 }}>{gap > 0 ? "+" : "−"}₹{inr(Math.abs(gap))} vs net</div>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    {s.frozen_at ? <><b style={{ color: C.green }}>{day(s.frozen_at)}</b><div style={{ fontSize: 10, color: C.faint }}>{who(s.frozen_by)}</div></> : <span style={{ color: C.faint }}>—</span>}
                  </td>
                  <td className="px-2 py-1.5 no-print" style={{ minWidth: 210 }}>
                    <div className="flex gap-1 flex-wrap items-center">
                    <a href={`/hrms/salary-register/${s.id}/print`} target="_blank" rel="noopener noreferrer"
                      className="rounded px-2 py-1 font-bold inline-block"
                      style={{ background: "#1B3A5C", color: "#fff", fontSize: 10.5 }}
                      title="The month's salary register — MIS summary first, then every line, landscape">
                      📄 Register
                    </a>
                    {s.status === "Frozen" ? (
                      <a href={`/hrms/salary-slips/${s.id}/print`} target="_blank" rel="noopener noreferrer"
                        className="rounded px-2 py-1 font-bold inline-block" style={{ background: "#0D7A3F", color: "#fff", fontSize: 10.5 }}
                        title="Every slip, one A5 page each — the single file that goes to the Drive folders">
                        🧾 Slips
                      </a>
                    ) : (
                      <a href={`/hrms/salary-slips/${s.id}/print?samples=1`} target="_blank" rel="noopener noreferrer"
                        className="rounded px-2 py-1 font-bold inline-block" style={{ background: "#fff", color: "#8A5B00", border: `1px solid ${C.line}`, fontSize: 10.5 }}
                        title="Nine DRAFT samples across the pay bands — eyeball a few before freezing">
                        🧾 Draft samples
                      </a>
                    )}
                    {isOwner && (s.status === "Frozen"
                      ? <button onClick={() => { if (window.confirm(`Unfreeze ${MONTHS[s.month - 1]} ${s.year}? It stops being a closed record until you freeze it again.`)) act({ action: "unfreeze", id: s.id }, "Unfrozen"); }} disabled={busy}
                          className="rounded px-2 py-1 font-bold" style={{ background: "#fff", color: "#8A5B00", border: `1px solid ${C.line}`, fontSize: 10.5 }}>Unfreeze</button>
                      : <button onClick={() => { if (window.confirm(`Freeze ${MONTHS[s.month - 1]} ${s.year} at ₹${inr(s.net_payable)} net? It becomes read-only.`)) act({ action: "freeze", id: s.id }, "Frozen"); }} disabled={busy}
                          className="rounded px-2 py-1 font-bold" style={{ background: C.green, color: "#fff", fontSize: 10.5 }}>❄ Freeze</button>)}
                    </div>
                    {s.status === "Frozen" && (
                      <div className="flex gap-1 flex-wrap mt-1" style={{ fontSize: 10 }}>
                        {(["pf", "pt", "mlwf", "esic", "tds"] as const).map((k) => (
                          <a key={k} href={`/hrms/statutory/${s.id}/print?kind=${k}`} target="_blank" rel="noopener noreferrer"
                            className="rounded px-1.5 py-0.5 font-bold" style={{ background: "#F4F2EC", color: "#1B3A5C" }}>
                            {k.toUpperCase()}
                          </a>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {open && <SheetBox id={open} onClose={() => setOpen(null)} />}
    </Pane>
  );
}

function PaidBox({ value, onSave }: { value: number | null; onSave: (v: string) => void }) {
  const [v, setV] = useState(value == null ? "" : String(Math.round(value)));
  useEffect(() => { setV(value == null ? "" : String(Math.round(value))); }, [value]);
  return (
    <input value={v} inputMode="numeric" placeholder="type it"
      onChange={(e) => setV(e.target.value.replace(/[^0-9]/g, ""))}
      onBlur={() => { if (v !== (value == null ? "" : String(Math.round(value)))) onSave(v); }}
      className="tnum rounded text-right px-1.5 py-1" style={{ border: `1px solid ${C.line}`, width: 100, fontSize: 12.5 }} />
  );
}

function Upload({ onDone }: { onDone: (msg: string) => void }) {
  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth() === 0 ? 12 : now.getMonth()));
  const [year, setYear] = useState(String(now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [read, setRead] = useState<{ lines: number; columns: Record<string, string>; warnings: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const go = async () => {
    const f = fileRef.current?.files?.[0];
    if (!f) { setErr("Choose the month's file first."); return; }
    setBusy(true); setErr(""); setRead(null);
    try {
      const fd = new FormData();
      fd.append("month", month); fd.append("year", year); fd.append("file", f);
      const r = await fetch("/api/hrms/salary-sheets", { method: "POST", body: fd });
      const text = await r.text();
      let j: Record<string, unknown> = {};
      try { j = JSON.parse(text); } catch { throw new Error(`The server replied with ${r.status} and not JSON — the file may be too large.`); }
      if (!r.ok) throw new Error(String(j.error || `Upload failed (${r.status})`));
      const m = j.mapping as { columns: Record<string, string>; warnings: string[] };
      setRead({ lines: Number(j.lines), columns: m.columns, warnings: m.warnings });
      if (fileRef.current) fileRef.current.value = "";
      onDone(`${MONTHS[Number(month) - 1]} ${year} read — ${j.lines} lines`);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };

  return (
    <div className="rounded-lg border p-3 mb-3 no-print" style={{ borderColor: C.line, background: "#FBFAF7" }}>
      <div className="font-bold mb-2" style={{ fontSize: 13 }}>Upload a month&apos;s sheet</div>
      <div className="flex gap-2 flex-wrap items-end">
        <label style={{ fontSize: 11.5, color: C.faint }}>Month
          <select value={month} onChange={(e) => setMonth(e.target.value)} className="rounded px-2 py-1.5 block bg-white" style={{ border: `1px solid ${C.line}`, fontSize: 13, color: C.ink }}>
            {MONTHS.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 11.5, color: C.faint }}>Year
          <input value={year} inputMode="numeric" onChange={(e) => setYear(e.target.value.replace(/[^0-9]/g, ""))}
            className="rounded px-2 py-1.5 block" style={{ border: `1px solid ${C.line}`, width: 80, fontSize: 13 }} />
        </label>
        <label style={{ fontSize: 11.5, color: C.faint }}>The sheet (CSV or Excel)
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,text/csv" className="block" style={{ fontSize: 12, maxWidth: 260 }} />
        </label>
        <button onClick={go} disabled={busy} className="rounded px-3 py-1.5 font-bold" style={{ background: C.green, color: "#fff", fontSize: 12.5 }}>
          {busy ? "Reading…" : "Upload and read"}
        </button>
      </div>
      {err && <div className="text-xs font-semibold mt-2" style={{ color: C.red }}>{err}</div>}
      {read && (
        <div className="mt-2 rounded p-2" style={{ background: "#fff", border: `1px solid ${C.line}`, fontSize: 12 }}>
          <b>{read.lines} lines read.</b> Columns understood:{" "}
          {Object.entries(read.columns).map(([k, v]) => (
            <span key={k} className="rounded px-1.5 py-0.5 mr-1" style={{ background: "#E6F4EA", color: "#0D7A3F", fontSize: 11 }}>{k} ← “{v}”</span>
          ))}
          {read.warnings.map((w, i) => (
            <div key={i} style={{ color: "#8A5B00", marginTop: 4 }}>⚠ {w}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function SheetBox({ id, onClose }: { id: string; onClose: () => void }) {
  const [d, setD] = useState<(Sheet & { rows: Line[]; fileUrl: string | null }) | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api.get(`/api/hrms/salary-sheets?id=${encodeURIComponent(id)}`)
      .then((j) => setD(j.sheet)).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3" style={{ background: "rgba(15,23,32,.55)" }} onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl flex flex-col" style={{ width: "min(940px,96vw)", maxHeight: "92vh" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${C.line}` }}>
          <div>
            <div className="font-bold" style={{ fontSize: 15 }}>{d ? `${MONTHS[d.month - 1]} ${d.year}` : "Salary sheet"}</div>
            <div style={{ fontSize: 11.5, color: C.faint }}>{d?.file_name} · {d?.rows?.length || 0} lines</div>
          </div>
          <div className="flex gap-2 items-center">
            <a href={`/hrms/salary-register/${id}/print`} target="_blank" rel="noopener noreferrer"
              className="rounded px-2 py-1 font-bold" style={{ background: "#1B3A5C", color: "#fff", fontSize: 11.5 }}>📄 Register PDF</a>
            <a href={`/hrms/salary-slips/${id}/print?samples=1`} target="_blank" rel="noopener noreferrer"
              className="rounded px-2 py-1 font-bold" style={{ background: "#0D7A3F", color: "#fff", fontSize: 11.5 }}
              title="Nine A5 samples across the pay bands — eyeball a few each month">🧾 Slip samples (A5)</a>
            {d?.status === "Frozen" && (
              <a href={`/hrms/salary-slips/${id}/print`} target="_blank" rel="noopener noreferrer"
                className="rounded px-2 py-1 font-bold" style={{ background: "#fff", color: C.dim, border: `1px solid ${C.line}`, fontSize: 11.5 }}
                title="Every employee's slip, one A5 page each — the single file for the Drive folders">All slips</a>
            )}
            <ReRead id={id} onDone={() => { setD(null); setErr(""); api.get(`/api/hrms/salary-sheets?id=${encodeURIComponent(id)}`).then((j) => setD(j.sheet)).catch((e) => setErr(e instanceof Error ? e.message : String(e))); }} />
            {d?.fileUrl && <a href={d.fileUrl} target="_blank" rel="noopener noreferrer" className="rounded px-2 py-1 font-bold" style={{ background: "#F4F2EC", color: C.dim, fontSize: 11.5 }}>Open the original file</a>}
            <button onClick={onClose} className="text-sm font-bold px-2 py-1" style={{ color: C.faint }}>✕ Close</button>
          </div>
        </div>
        <div className="overflow-auto px-4 py-3" style={{ flex: 1 }}>
          {err && <div className="text-xs font-semibold" style={{ color: C.red }}>{err}</div>}
          {!d && !err && <div className="text-sm py-6 text-center" style={{ color: C.faint }}>loading…</div>}
          {d && (
            <>
              {(d.mapping?.warnings || []).map((w, i) => (
                <div key={i} className="rounded p-2 mb-2" style={{ background: "#FFF7E6", border: "1px solid #F5D9A8", fontSize: 12.5, color: "#8A5B00" }}>⚠ {w}</div>
              ))}
              <table className="w-full" style={{ fontSize: 12.5, borderCollapse: "collapse" }}>
                <thead><tr style={{ color: C.faint, fontSize: 11, position: "sticky", top: 0, background: "#F4F2EC" }}>
                  {["EmployeeID", "Name", "Type", "Earned", "Deductions", "Net"].map((h, i) => (
                    <th key={h} className={i > 2 ? "text-right px-2 py-1.5" : "text-left px-2 py-1.5"} style={{ borderBottom: `1px solid ${C.line}` }}>{h}</th>))}
                </tr></thead>
                <tbody>
                  {(d.rows || []).map((r, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #F2F0EA" }}>
                      <td className="px-2 py-1 font-semibold">{r.employee_id || "—"}</td>
                      <td className="px-2 py-1">{r.name || "—"}</td>
                      <td className="px-2 py-1">{r.type || ""}</td>
                      <td className="px-2 py-1 text-right tnum">{inr(r.earned)}</td>
                      <td className="px-2 py-1 text-right tnum" style={{ color: C.red }}>{inr(r.deductions)}</td>
                      <td className="px-2 py-1 text-right tnum font-bold">{inr(r.net)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr style={{ background: "#FFF9C4", fontWeight: 700 }}>
                  <td className="px-2 py-1.5" colSpan={3}>Total — {d.total_count} people</td>
                  <td className="px-2 py-1.5 text-right tnum">{inr(d.earned_pay)}</td>
                  <td className="px-2 py-1.5 text-right tnum">{inr(d.deductions)}</td>
                  <td className="px-2 py-1.5 text-right tnum">{inr(d.net_payable)}</td>
                </tr></tfoot>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Re-read the SAME stored file with the current parser. The parser learns
 * columns over time — the register set arrived after July was uploaded — and
 * this brings an old month's stored lines up to what the file always said.
 */
function ReRead({ id, onDone }: { id: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  return (
    <>
      <button
        onClick={async () => {
          setBusy(true); setMsg("");
          try { const j = await api.post("/api/hrms/salary-sheets", { action: "reparse", id }); setMsg(`re-read ✓ ${j.lines} lines`); onDone(); }
          catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
          setBusy(false);
        }}
        disabled={busy}
        className="rounded px-2 py-1 font-bold" style={{ background: "#F4F2EC", color: C.dim, fontSize: 11.5 }}
        title="Parse the stored file again with the current column set — the data still comes from the sheet alone">
        {busy ? "reading…" : "↻ Re-read the file"}
      </button>
      {msg && <span className="text-xs font-semibold" style={{ color: msg.includes("✓") ? C.green : C.red }}>{msg}</span>}
    </>
  );
}

function Stat({ n, l, green }: { n: string; l: string; green?: boolean }) {
  return (
    <div className="bg-white rounded-lg border px-3 py-2" style={{ borderColor: C.line, minWidth: 118 }}>
      <div className="font-bold tnum" style={{ fontSize: 19, lineHeight: 1.15, color: green ? C.green : C.ink }}>{n}</div>
      <div style={{ fontSize: 11, color: C.faint }}>{l}</div>
    </div>
  );
}
