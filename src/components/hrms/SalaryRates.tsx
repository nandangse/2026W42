"use client";
/**
 * HRIS → Salary Rate List (Dr Raghu, 4 Sep 2026): dated sheets of rates,
 * one Live, the earlier ones Overwritten. Each sheet: Employee ID, Name,
 * Type, Department, Designation, Reporting manager, Basic and DA, HRA, Fixed
 * Allowance, Conveyance, Medical Allowance, Gross Salary, Per Day Rate.
 * Edit a cell and it saves; gross and per day are worked out. The payroll
 * run's Generate reads the Live sheet.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { fmtFull } from "@/lib/schedule";
import { Pane } from "./Pane";
import { C } from "./RecordFields";
import { inr } from "@/lib/fmt";

interface Structure { id: string; code: string; title: string; status: string; effective_from: string | null; note: string | null; created_by: string | null; created_at: string; updated_at: string; lines: number;
  /** Signed and closed — see the FREEZE button (Dr Raghu, 7 Sep 2026). */
  frozen_at?: string | null; frozen_by?: string | null; signed_as?: string | null }
interface Rate { id: string; employee_id: string; name: string | null; type: string | null; department: string | null; designation: string | null; reporting_manager: string | null; basic_da: number; hra: number; fixed_allowance: number; conveyance: number; medical_allowance: number; gross: number; per_day: number; note: string | null; updated_by: string | null; updated_at: string }


const MONEY: (keyof Rate)[] = ["basic_da", "hra", "fixed_allowance", "conveyance", "medical_allowance"];
const TEXT: (keyof Rate)[] = ["name", "type", "department", "designation", "reporting_manager"];
const tone = (s: string) => (s === "Live" ? { bg: "#E6F4EA", c: C.green } : s === "Overwritten" ? { bg: "#F4F2EC", c: C.faint } : { bg: "#FFF3E8", c: "#8A5B00" });

export default function SalaryRates({ who, isOwner }: { who: string; isOwner: boolean }) {
  const [st, setSt] = useState<{ structures: Structure[]; current: string | null; rates: Rate[]; needsMigration?: boolean } | null>(null);
  const [cur, setCur] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [nf, setNf] = useState({ code: "", title: "", from: "" });
  const [newLine, setNewLine] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (id?: string | null) => {
    try { const j = await api.get(`/api/hrms/rates${id ? `?structure=${encodeURIComponent(id)}` : ""}`); setSt(j); setCur(j.current); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (body: Record<string, unknown>, ok: string, keep = true) => {
    setBusy(true); setMsg("");
    try { const j = await api.post("/api/hrms/rates", body); setMsg(`${ok} ✓`); await load(keep ? cur : j.id || cur); return j; }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const s = st?.structures.find((x) => x.id === cur) || null;
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "employee_id", dir: "asc" });
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    const list = (st?.rates || []).filter((r) => !n || `${r.employee_id} ${r.name || ""} ${r.type || ""} ${r.department || ""} ${r.designation || ""}`.toLowerCase().includes(n));
    /* Money sorts as money and text as text — a string sort would put a
       gross of 9,000 above one of 80,000, which is how a sortable column
       ends up trusted less than no sort at all. */
    const numeric = new Set(["employee_id", "basic_da", "hra", "fixed_allowance", "conveyance", "medical_allowance", "gross", "per_day"]);
    const k = sort.key, sign = sort.dir === "asc" ? 1 : -1;
    const val = (r: Rate) => (r as unknown as Record<string, unknown>)[k];
    return [...list].sort((a, b) => {
      const x = val(a), y = val(b);
      if (numeric.has(k)) return sign * ((Number(x) || 0) - (Number(y) || 0));
      return sign * String(x ?? "").localeCompare(String(y ?? ""), "en", { sensitivity: "base" });
    });
  }, [st, q, sort]);
  const totals = useMemo(() => rows.reduce((a, r) => ({ gross: a.gross + Number(r.gross || 0), basic: a.basic + Number(r.basic_da || 0) }), { gross: 0, basic: 0 }), [rows]);
  const byType = useMemo(() => { const m: Record<string, number> = {}; for (const r of rows) m[r.type || "?"] = (m[r.type || "?"] || 0) + 1; return m; }, [rows]);

  const upload = async () => {
    const f = fileRef.current?.files?.[0]; if (!f || !s) { setMsg("Choose a file."); return; }
    setBusy(true); setMsg("");
    try { const fd = new FormData(); fd.append("structure_id", s.id); fd.append("file", f); const r = await fetch("/api/hrms/rates", { method: "POST", body: fd }); const j = await r.json(); if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`); setMsg(`${j.lines} lines read into ${s.title} ✓`); if (fileRef.current) fileRef.current.value = ""; await load(cur); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <Pane title="Salary Rate List" who={who} print blurb="Dated sheets of rates for the whole roll. One is Live and the payroll run reads it; the earlier ones stay, Overwritten. Edit a cell and it saves; gross and per day are worked out."
      tools={<button onClick={() => setAdding((v) => !v)} className="text-xs font-bold rounded px-3 py-1.5" style={{ background: C.orange, color: "#fff" }}>{adding ? "✕ Cancel" : "+ New structure"}</button>}>
      {msg && <div className="text-xs font-semibold mb-2" style={{ color: msg.includes("✓") ? C.green : C.red }}>{msg}</div>}
      {st?.needsMigration && <div className="rounded p-2 mb-2" style={{ background: "#FFF7E6", border: "1px solid #F5D9A8", fontSize: 12.5, color: "#8A5B00" }}>Run migration 0135 — the rate list has nowhere to live yet.</div>}

      {adding && (
        <div className="bg-white rounded-lg border p-3 mb-3 flex gap-2 items-end flex-wrap" style={{ borderColor: C.orange }}>
          <label className="text-xs" style={{ color: C.dim }}>Code (YYYY-MM)<input value={nf.code} onChange={(e) => setNf({ ...nf, code: e.target.value })} placeholder="2026-09" className="block rounded px-2 py-1.5 mt-0.5" style={{ border: `1px solid ${C.line}`, fontSize: 13, width: 110 }} /></label>
          <label className="text-xs" style={{ color: C.dim, flex: 1, minWidth: 200 }}>Title<input value={nf.title} onChange={(e) => setNf({ ...nf, title: e.target.value })} placeholder={`Salary Structure ${nf.code || "YYYY-MM"}`} className="block w-full rounded px-2 py-1.5 mt-0.5" style={{ border: `1px solid ${C.line}`, fontSize: 13 }} /></label>
          <label className="text-xs" style={{ color: C.dim }}>Start from<select value={nf.from} onChange={(e) => setNf({ ...nf, from: e.target.value })} className="block rounded px-2 py-1.5 mt-0.5 bg-white" style={{ border: `1px solid ${C.line}`, fontSize: 13 }}><option value="">— empty —</option>{(st?.structures || []).map((x) => <option key={x.id} value={x.id}>copy of {x.title}</option>)}</select></label>
          <button onClick={async () => { const j = await act({ action: "create", code: nf.code.trim(), title: nf.title.trim() || `Salary Structure ${nf.code.trim()}`, from: nf.from || null }, "Structure created", false); if (j?.id) { setAdding(false); setNf({ code: "", title: "", from: "" }); } }} disabled={busy} className="text-xs font-bold rounded px-3 py-1.5" style={{ background: C.green, color: "#fff" }}>Create</button>
        </div>
      )}

      {/* ── the sheets ── */}
      <div className="flex gap-1.5 mb-2 flex-wrap items-center">
        {(st?.structures || []).map((x) => { const t = tone(x.status); return (
          <button key={x.id} onClick={() => load(x.id)} className="rounded px-3 py-1.5 text-xs font-bold" style={{ background: cur === x.id ? "var(--navy)" : "#fff", color: cur === x.id ? "#fff" : C.ink, border: `1px solid ${cur === x.id ? "var(--navy)" : C.line}` }}>
            {x.title} <span className="rounded px-1.5 ml-1" style={{ fontSize: 9.5, background: cur === x.id ? "rgba(255,255,255,0.15)" : t.bg, color: cur === x.id ? "#fff" : t.c }}>{x.status}</span> <span style={{ color: cur === x.id ? "#8FA1B3" : C.faint, fontSize: 10.5 }}>{x.lines}</span>
          </button>); })}
        {st && !st.structures.some((x) => x.code === "2025-06") && <button onClick={() => act({ action: "seed_old" }, "Salary Structure 2025-06 filled from the records", false)} disabled={busy} className="rounded px-3 py-1.5 text-xs font-semibold border bg-white" style={{ borderColor: C.line, color: "var(--blue)" }}>Fill 2025-06 from the records</button>}
      </div>

      {s && (
        <>
          <div className="bg-white rounded-lg border px-3 py-2 mb-2 flex gap-3 items-center flex-wrap text-xs" style={{ borderColor: C.line }}>
            <span className="rounded px-2 py-0.5 font-bold" style={{ background: tone(s.status).bg, color: tone(s.status).c }}>{s.status}</span>
            {s.frozen_at && (
              <span className="rounded px-2 py-0.5 font-bold" style={{ background: "#E6F0FA", color: "var(--blue)" }}
                title={`Frozen by ${s.frozen_by || "—"}`}>
                🔒 Frozen · signed <i>{s.signed_as}</i> on {String(s.frozen_at).slice(8, 10)}-{String(s.frozen_at).slice(5, 7)}-{String(s.frozen_at).slice(0, 4)}
              </span>
            )}
            <span style={{ color: C.dim }}>from {s.effective_from || "—"} · {s.lines} lines · {Object.entries(byType).map(([k, v]) => `${v} ${k}`).join(", ")} · gross ₹{inr(totals.gross)}/month</span>
            {s.note && <span style={{ color: C.faint }}>· {s.note}</span>}
            <span style={{ flex: 1 }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="find a person" className="rounded px-2 py-1" style={{ border: `1px solid ${C.line}`, width: 180 }} />
            {isOwner && s.status !== "Live" && !s.frozen_at && <button onClick={() => { if (window.confirm(`Make ${s.title} the Live structure?\n\nThe Live one becomes Overwritten and the payroll run reads this one from now.`)) act({ action: "set_live", id: s.id }, `${s.title} is Live`); }} disabled={busy} className="font-bold rounded px-3 py-1.5" style={{ background: C.green, color: "#fff" }}>✓ Make Live</button>}
            {/* FREEZE AND SIGN (Dr Raghu, 7 Sep 2026: "after uploading, give
                a facility to freeze it by Raghu. Let me sign my name on it").
                A signed list stops taking edits — refused on the server too,
                not merely hidden here. */}
            {isOwner && !s.frozen_at && (
              <button onClick={() => {
                const signed = window.prompt(`Freeze ${s.title} and sign it?\n\nNo cell can be edited afterwards until the freeze is taken off.\n\nType your name to sign:`, "Raghunandan Jagdish");
                if (signed && signed.trim().length >= 3) act({ action: "freeze", structure_id: s.id, signed_as: signed.trim() }, `${s.title} frozen and signed`);
              }} disabled={busy} className="font-bold rounded px-3 py-1.5" style={{ background: "var(--navy)", color: "#fff" }}>🔒 Freeze &amp; sign</button>
            )}
            {isOwner && s.frozen_at && (
              <button onClick={() => { if (window.confirm(`Take the freeze off ${s.title}?\n\nThe signature is removed with it, and the cells open again.`)) act({ action: "unfreeze", structure_id: s.id }, "Freeze taken off"); }}
                disabled={busy} className="font-semibold rounded px-2.5 py-1.5" style={{ border: `1px solid ${C.line}`, background: "#fff", color: C.dim }}>unfreeze</button>
            )}
            {/* PULL THE TYPES AND WORK THE PER-DAY OUT AGAIN (Dr Raghu, 7
                Sep 2026: "check it and update it"). A pressed button, not a
                quiet background fix: it rewrites every rate on the list, and
                every rate change carries who made it and when. */}
            {isOwner && !s.frozen_at && (
              <button onClick={async () => {
                if (!window.confirm(`Pull every Type from the HRIS and work the per-day rates out again?\n\nPer day = Gross ÷ 26 for Labour and Labour - Contract, ÷ 31 for the rest — the displayed rate. Lines already right are left alone.`)) return;
                try {
                  const j = await api.post("/api/hrms/rates", { action: "sync_types", structure_id: s.id }) as { checked: number; changed: number; noType: number };
                  setMsg(`${j.changed} of ${j.checked} lines updated${j.noType ? `; ${j.noType} have no Type on their HRIS record` : ""}.`);
                  load(cur);
                } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
              }} disabled={busy} className="font-semibold rounded border px-2 py-1 bg-white" style={{ borderColor: C.line, color: "var(--blue)" }}
                title="Types come from the HRIS; the per-day divisor follows the Type">⟳ Types &amp; per day</button>
            )}
            {/* SYNC FROM APPROVALS (Dr Raghu, 7 Oct 2026: "6981 Sanju's approval was done by me
                … even in the HRIS, it is showing the same thing"). Every approved appraisal's
                gross and split onto the Live list — approvals now write through on their own;
                this catches up anything made before 7 Oct. */}
            {/* BACKFLUSH TO HRIS (Dr Raghu, 7 Oct 2026: "it has to take from latest salary structure … it has
                to get backflushed into the HRIS"). Signing the Live list does this on its own; the button
                does it again on demand. */}
            {isOwner && s.status === "Live" && (
              <button onClick={async () => {
                if (!window.confirm(`Backflush ${s.title} into the HRIS records?\n\nEvery line's Basic and DA, HRA, Fixed, Conveyance, Medical, Gross and Per day rate is written onto the person's record as an approved edit (changes logged), and the gross into the financial year's salary history. Payroll reads this list.`)) return;
                try {
                  const j = await api.post("/api/hrms/rates", { action: "backflush", structure_id: s.id }) as { records: number; changed: number; fy: string };
                  setMsg(`${j.records} records backflushed from ${s.title}; ${j.changed} field${j.changed === 1 ? "" : "s"} moved; ${j.fy} history written.`);
                  load(cur);
                } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
              }} disabled={busy} className="font-semibold rounded border px-2 py-1 bg-white" style={{ borderColor: C.line, color: "var(--blue)" }}
                title="This list's every line onto the HRIS records' Pay fields and the FY salary history">⇩ Backflush to HRIS</button>
            )}
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="block" style={{ fontSize: 11, maxWidth: 200 }} />
            <button onClick={upload} disabled={busy} className="font-semibold rounded border px-2 py-1 bg-white" style={{ borderColor: C.line, color: "var(--blue)" }} title="Rows from a CSV or Excel, matched on Employee ID">⬆ Import</button>
            {isOwner && s.status !== "Live" && <button onClick={() => { if (window.confirm(`Remove ${s.title} and its ${s.lines} lines?`)) act({ action: "remove_structure", id: s.id }, "Removed", false); }} disabled={busy} className="font-semibold rounded px-2 py-1" style={{ background: "#FBEDEA", color: C.red }}>✕</button>}
          </div>

          <div className="bg-white rounded-lg border" style={{ borderColor: C.line, overflow: "auto", maxHeight: "calc(100vh - 290px)" }}>
            <table className="genie-table" style={{ fontSize: 12.5, borderCollapse: "collapse", whiteSpace: "nowrap", minWidth: 1140 }}>
              {/* A SOLID GROUND UNDER THE HEADING (Dr Raghu, 7 Sep 2026: "on
                  salary rate list the header is white font — change the
                  background colour"). It was muted grey on white and read as
                  nothing at all; the muster's header was given the same
                  treatment this morning, so the two now match. */}
              {/* EVERY COLUMN SORTS (Dr Raghu, 7 Sep 2026: "make provision to
                  sort also"). Click to sort, click again to reverse. Text
                  sorts as text and money as money, so Gross does not put
                  9,000 above 80,000 the way a string comparison would. */}
              <thead><tr style={{ fontSize: 10.5 }}>
                {COLS.map(([key, label], i) => (
                  <th key={key || label} onClick={() => key && setSort((p) => ({ key, dir: p.key === key && p.dir === "asc" ? "desc" : "asc" }))}
                    className="px-2 py-1.5" title={key ? "Sort by this column" : undefined}
                    style={{ position: "sticky", top: 0, background: "#F4F2EC", color: C.ink, fontWeight: 700, borderBottom: `2px solid ${C.line}`, zIndex: i < 2 ? 3 : 2, textAlign: i >= 3 && i <= 9 ? "right" : "left", whiteSpace: "nowrap", cursor: key ? "pointer" : "default", userSelect: "none", ...(i === 0 ? { left: 0, minWidth: 80 } : i === 1 ? { left: 80, minWidth: 200 } : {}) }}>
                    {label}{sort.key === key ? <span style={{ marginLeft: 3 }}>{sort.dir === "asc" ? "▲" : "▼"}</span> : null}
                  </th>
                ))}
              </tr></thead>
              <tbody>
                {rows.map((r) => <RateRow key={r.id} r={r} sid={s.id} busy={busy} onSaved={() => load(cur)} onMsg={setMsg} />)}
                <tr style={{ borderTop: `2px solid ${C.line}`, background: "#FBFAF7" }}>
                  <td className="px-2 py-1.5" style={{ position: "sticky", left: 0, background: "#FBFAF7" }}><input value={newLine} onChange={(e) => setNewLine(e.target.value)} placeholder="new ID" className="rounded px-1.5 py-0.5 tnum" style={{ border: `1px solid ${C.line}`, width: 64, fontSize: 12 }} /></td>
                  <td className="px-2 py-1.5" colSpan={9} style={{ color: C.faint, fontSize: 11.5 }}>Type a four-digit Employee ID and press Add; then fill the line in place.</td>
                  <td className="px-2 py-1.5"><button onClick={async () => { if (/^\d{4}$/.test(newLine.trim())) { await act({ action: "save_rate", structure_id: s.id, employee_id: newLine.trim(), basic_da: 0 }, "Line added"); setNewLine(""); } }} disabled={busy || !/^\d{4}$/.test(newLine.trim())} className="text-xs font-bold rounded px-2 py-0.5" style={{ background: "var(--blue)", color: "#fff" }}>Add</button></td>
                </tr>
              </tbody>
              <tfoot><tr style={{ fontWeight: 700, borderTop: `2px solid ${C.line}` }}>
                <td className="px-2 py-1.5" colSpan={3} style={{ position: "sticky", left: 0, background: "#fff" }}>{rows.length} people</td>
                <td className="px-2 py-1.5 text-right tnum">{inr(totals.basic)}</td>
                {["hra", "fixed_allowance", "conveyance", "medical_allowance", "gross", "per_day"].map((k) => <td key={k} className="px-2 py-1.5 text-right tnum">{k === "per_day" ? "" : inr(rows.reduce((a, r) => a + Number((r as unknown as Record<string, unknown>)[k] || 0), 0))}</td>)}
                <td />
              </tr></tfoot>
            </table>
          </div>
          <div className="text-xs mt-2" style={{ color: C.faint }}>Gross = Basic and DA + HRA + Fixed + Conveyance + Medical. Per day = Gross ÷ 26 for Labour and Labour - Contract, ÷ 31 for everybody else (the displayed rate; payroll works on the month's own days) — the Type decides it, and the Type comes from the HRIS. Last change {fmtFull(String(s.updated_at))}.</div>
        </>
      )}
    </Pane>
  );
}

/** The columns, in order: [sort key, heading]. An empty key does not sort. */
const COLS: [string, string][] = [
  ["employee_id", "Employee ID"], ["name", "Name"],
  /* TYPE IS SHOWN BUT NOT EDITED HERE (Dr Raghu, 7 Sep 2026: "pull it from
     the masters HRIS"). It decides the per-day divisor — 26 for Labour and
     Labour - Contract, 31 for the rest — so it has to be visible; and it is
     the HRIS's to change, so it is not a field on this screen. */
  ["type", "Type"],
  ["basic_da", "Basic and DA"], ["hra", "HRA"], ["fixed_allowance", "Fixed Allowance"],
  ["conveyance", "Conveyance"], ["medical_allowance", "Medical Allowance"],
  ["gross", "Gross Salary"], ["per_day", "Per Day Rate"], ["", ""],
];

function RateRow({ r, sid, busy, onSaved, onMsg }: { r: Rate; sid: string; busy: boolean; onSaved: () => void; onMsg: (m: string) => void }) {
  const [v, setV] = useState<Record<string, string>>({});
  useEffect(() => { setV({}); }, [r]);
  const val = (k: keyof Rate) => (k in v ? v[k] : r[k] == null ? "" : String(r[k]));
  const save = async (k: keyof Rate) => {
    const next = val(k); const prev = r[k] == null ? "" : String(r[k]);
    if (next === prev) return;
    try {
      const body: Record<string, unknown> = { action: "save_rate", structure_id: sid, employee_id: r.employee_id };
      for (const key of [...TEXT, ...MONEY, "note"] as (keyof Rate)[]) body[key] = key === k ? next : r[key];
      await api.post("/api/hrms/rates", body); onSaved();
    } catch (e) { onMsg(e instanceof Error ? e.message : String(e)); }
  };
  const cell = (k: keyof Rate, money = false, w = 110) => (
    <td key={k} className="px-1 py-0.5" style={{ textAlign: money ? "right" : "left" }}>
      <input value={val(k)} disabled={busy} onChange={(e) => setV({ ...v, [k]: e.target.value })} onBlur={() => save(k)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className={`rounded px-1.5 py-0.5 ${money ? "text-right tnum" : ""}`} style={{ border: `1px solid ${k in v ? C.orange : "transparent"}`, background: k in v ? "#FFF3E8" : "transparent", width: w, fontSize: 12.5 }} />
    </td>
  );
  return (
    <tr style={{ borderTop: "1px solid #EEECE6" }}>
      <td className="px-2 py-0.5 tnum font-semibold" style={{ position: "sticky", left: 0, background: "#fff", minWidth: 80 }}>{r.employee_id}</td>
      <td className="px-1 py-0.5" style={{ position: "sticky", left: 80, background: "#fff", minWidth: 200 }}>{cell("name", false, 190)}</td>
      {/* the HRIS's word, shown so the per-day divisor is never a mystery */}
      <td className="px-2 py-0.5" style={{ color: C.dim, whiteSpace: "nowrap" }}>
        {r.type || <span style={{ color: C.faint }}>—</span>}
      </td>
      {/* NO Department, Designation or Reporting manager here (Dr
          Raghu, 7 Sep 2026: "these are not needed — they will be updated in
          the HRIS"). They were editable in two places at once, and this was
          the copy nobody filled in: four empty columns across the whole
          list, inviting a correction that the employee record would not
          learn about. This list is rates. The HRIS owns who a man is. */}
      {MONEY.map((k) => cell(k, true, 96))}
      <td className="px-2 py-0.5 text-right tnum font-bold">{inr(r.gross)}</td>
      <td className="px-2 py-0.5 text-right tnum" style={{ color: C.dim }}>{inr(r.per_day)}</td>
      <td className="px-2 py-0.5 text-xs" style={{ color: C.faint }} title={`${r.note || ""} · ${r.updated_by ? String(r.updated_by).split("·")[0].trim() : ""} ${r.updated_at ? fmtFull(String(r.updated_at)) : ""}`}>{r.note ? r.note.slice(0, 18) : ""}</td>
    </tr>
  );
}
