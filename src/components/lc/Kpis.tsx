"use client";
/**
 * KPIs (Dr Raghu, 10 Oct 2026): "a KPI on the left, Assigned To, and Type —
 * number or currency … design a KPI board … crowdsourced to all the leaders
 * to feed it in for now … seen by month or by quarter … company-wide."
 *
 * THE BOARD: one row per KPI, one column per month; click a cell to enter.
 * Quarter view folds the months by the KPI's own rule — sum for a flow,
 * average for a rate, last for a level — and shows the quarter against its
 * target. The assigned leader's colour sits on the row; anyone may enter,
 * which is the crowdsourcing. The rule and the target are set when the KPI
 * is added, so a number means the same thing every month.
 */
import { useEffect, useState } from "react";
import { api, btn, Card, Empty, Err, input, inr, label, Lightbox, MUTED, NAVY, Who, leaderOf, type Boot } from "./shared";

interface K { id: string; name: string; assigned_to: string | null; type: "number" | "currency"; unit: string | null; agg: "sum" | "avg" | "last"; target: number | null; sort: number; active: boolean; created_by: string | null }
interface V { kpi_id: string; month: string; value: number; note: string | null; entered_by: string | null; updated_at: string }

const fy = (m: string) => { const [y, mo] = m.split("-").map(Number); return mo >= 4 ? `${y}-${String(y + 1).slice(2)}` : `${y - 1}-${String(y).slice(2)}`; };
const qOf = (m: string) => { const mo = Number(m.slice(5, 7)); const q = mo >= 4 ? Math.floor((mo - 4) / 3) + 1 : 4; return `Q${q} FY${fy(m)}`; };
const mon = (m: string) => new Date(m + "T00:00:00").toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
const fmt = (k: K, v: number | null) => v === null || v === undefined ? "" : k.type === "currency" ? inr(v) : `${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 })}${k.unit ? ` ${k.unit}` : ""}`;

export default function Kpis({ boot }: { boot: Boot | null }) {
  const [d, setD] = useState<{ months: string[]; kpis: K[]; values: V[] } | null>(null);
  const [view, setView] = useState<"month" | "quarter">("month");
  const [to, setTo] = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).slice(0, 7));
  const [edit, setEdit] = useState<K | "new" | null>(null);
  const [cell, setCell] = useState<{ k: K; month: string; v: V | null } | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const load = () => api<{ months: string[]; kpis: K[]; values: V[] }>(`/api/lc/kpis?months=12&to=${to}`).then(setD).catch(() => setD({ months: [], kpis: [], values: [] }));
  useEffect(() => { load(); }, [to]); // eslint-disable-line react-hooks/exhaustive-deps
  const val = (k: K, m: string) => d?.values.find((v) => v.kpi_id === k.id && v.month === m) || null;
  const quarters = d ? [...new Set(d.months.map(qOf))] : [];
  const qv = (k: K, q: string): number | null => {
    const vs = (d?.months || []).filter((m) => qOf(m) === q).map((m) => val(k, m)?.value).filter((x): x is number => typeof x === "number");
    if (!vs.length) return null;
    return k.agg === "sum" ? vs.reduce((a, b) => a + b, 0) : k.agg === "avg" ? vs.reduce((a, b) => a + b, 0) / vs.length : vs[vs.length - 1];
  };
  const qTarget = (k: K, q: string) => k.target === null ? null : k.agg === "sum" ? k.target * (d?.months || []).filter((m) => qOf(m) === q).length : k.target;
  const shift = (n: number) => { const [y, m] = to.split("-").map(Number); const dt = new Date(y, m - 1 + n, 1); setTo(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`); };
  const kpis = (d?.kpis || []).filter((k) => showInactive || k.active);
  const tone = (v: number | null, t: number | null) => v === null || t === null ? undefined : v >= t ? "#E3F3E8" : v >= t * 0.9 ? "#FFF7E6" : "#FDECEA";

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setEdit("new")} style={btn("primary")}>+ Add a KPI</button>
        <span className="text-xs" style={{ color: "var(--dim)" }}>Company-wide. Click a cell to enter the month's number; anyone on the council may.</span>
        <span className="ml-auto" />
        <button onClick={() => setView("month")} style={btn(view === "month" ? "primary" : "soft", { padding: "5px 10px", fontSize: 12 })}>By month</button>
        <button onClick={() => setView("quarter")} style={btn(view === "quarter" ? "primary" : "soft", { padding: "5px 10px", fontSize: 12 })}>By quarter</button>
        <button onClick={() => shift(-3)} style={btn("ghost", { padding: "5px 8px", fontSize: 12 })}>‹</button>
        <span className="text-xs tnum font-bold" style={{ color: NAVY }}>to {mon(to + "-01")}</span>
        <button onClick={() => shift(3)} style={btn("ghost", { padding: "5px 8px", fontSize: 12 })}>›</button>
        <label className="text-xs flex items-center gap-1" style={{ color: MUTED }}><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> retired too</label>
      </div>
      {d === null && <Empty>Opening…</Empty>}
      {d && kpis.length === 0 && <Empty>No KPIs yet. Add the first — sales booked, OTD %, enquiries, cash in bank…</Empty>}
      {d && kpis.length > 0 && (
        <div className="genie-scroll rounded-lg bg-white" style={{ border: "1px solid var(--line)", overflowX: "auto" }}>
          <table className="genie-table lc-kpi">
            <thead>
              <tr>
                <th style={{ position: "sticky", left: 0, background: "#fff", zIndex: 2, minWidth: 220 }}>KPI</th>
                <th style={{ minWidth: 120 }}>Assigned to</th>
                <th className="tnum" style={{ minWidth: 90 }}>Target / month</th>
                {view === "month" ? d.months.map((m) => <th key={m} className="tnum" style={{ minWidth: 92, textAlign: "right" }}>{mon(m)}</th>) : quarters.map((q) => <th key={q} className="tnum" style={{ minWidth: 120, textAlign: "right" }}>{q}</th>)}
              </tr>
            </thead>
            <tbody>
              {kpis.map((k) => (
                <tr key={k.id} style={{ opacity: k.active ? 1 : 0.55 }}>
                  <td style={{ position: "sticky", left: 0, background: "#fff", zIndex: 1, borderLeft: `5px solid ${leaderOf(boot, k.assigned_to).colour}` }}>
                    <button onClick={() => setEdit(k)} className="text-left font-bold" style={{ color: NAVY, fontSize: 13 }} title="Edit the KPI">{k.name}</button>
                    <div className="text-xs" style={{ color: MUTED }}>{k.type === "currency" ? "₹" : k.unit || "number"} · quarter = {k.agg === "sum" ? "sum of months" : k.agg === "avg" ? "average of months" : "last month"}</div>
                  </td>
                  <td>{k.assigned_to ? <Who boot={boot} email={k.assigned_to} size={20} /> : <span className="text-xs" style={{ color: MUTED }}>—</span>}</td>
                  <td className="tnum" style={{ color: MUTED }}>{fmt(k, k.target)}</td>
                  {view === "month" ? d.months.map((m) => { const v = val(k, m); return (
                    <td key={m} className="tnum" style={{ textAlign: "right", background: tone(v?.value ?? null, k.target), cursor: "pointer" }} onClick={() => setCell({ k, month: m, v })} title={v ? `${v.note || ""} — ${leaderOf(boot, v.entered_by).name}` : "Click to enter"}>
                      {v ? fmt(k, v.value) : <span style={{ color: "#D5D1C8" }}>·</span>}
                    </td>
                  ); }) : quarters.map((q) => { const v = qv(k, q); const t = qTarget(k, q); return (
                    <td key={q} className="tnum font-bold" style={{ textAlign: "right", background: tone(v, t) }} title={t !== null ? `target ${fmt(k, t)}` : ""}>{v === null ? <span style={{ color: "#D5D1C8" }}>·</span> : fmt(k, v)}</td>
                  ); })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="text-xs" style={{ color: MUTED }}>Green: at or above target · amber: within 10% · red: below. Later these numbers arrive on their own from the ERP, Kuber and the CRM; for now the council feeds them.</div>
      {edit && <Form boot={boot} k={edit === "new" ? undefined : edit} onDone={() => { setEdit(null); load(); }} />}
      {cell && <CellForm k={cell.k} month={cell.month} v={cell.v} onDone={() => { setCell(null); load(); }} />}
    </div>
  );
}

function Form({ boot, k, onDone }: { boot: Boot | null; k?: K; onDone: () => void }) {
  const [f, setF] = useState({ name: k?.name || "", assigned_to: k?.assigned_to || "", type: k?.type || "number", unit: k?.unit || "", agg: k?.agg || "sum", target: k?.target ?? "", active: k?.active ?? true });
  const [err, setErr] = useState<string | null>(null);
  const may = !k || !!boot?.me.isOwner || (k.created_by || "").toLowerCase() === boot?.me.email.toLowerCase();
  const save = async () => { setErr(null); try { await api("/api/lc/kpis", { action: k ? "edit" : "create", id: k?.id, ...f }); onDone(); } catch (e) { setErr(String((e as Error).message)); } };
  const remove = async () => { if (!k || !confirm(`Remove "${k.name}" and every value entered for it?`)) return; await api("/api/lc/kpis", { action: "remove", id: k.id }); onDone(); };
  return (
    <Lightbox title={k ? `Edit — ${k.name}` : "A new KPI"} onClose={onDone}>
      {!may && <div className="text-xs mb-2" style={{ color: MUTED }}>Only the one who added this KPI, or Dr Raghu, may change it. Values can be entered by anyone.</div>}
      <label style={label}>KPI</label>
      <input style={input} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Sales booked" disabled={!may} autoFocus />
      <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div><label style={label}>Assigned to</label><select style={input} value={f.assigned_to} onChange={(e) => setF({ ...f, assigned_to: e.target.value })} disabled={!may}><option value="">—</option>{boot?.members.map((m) => <option key={m.email} value={m.email}>{m.name}</option>)}</select></div>
        <div><label style={label}>Type</label><select style={input} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as K["type"] })} disabled={!may}><option value="number">Number</option><option value="currency">Currency (₹)</option></select></div>
        <div><label style={label}>Unit (for a number: nos, %, days…)</label><input style={input} value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} disabled={!may || f.type === "currency"} /></div>
        <div><label style={label}>A quarter is the</label><select style={input} value={f.agg} onChange={(e) => setF({ ...f, agg: e.target.value as K["agg"] })} disabled={!may}><option value="sum">sum of its months (sales, enquiries)</option><option value="avg">average of its months (OTD %, a rate)</option><option value="last">last month's figure (headcount, cash)</option></select></div>
        <div><label style={label}>Target per month (optional)</label><input style={input} value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} disabled={!may} inputMode="decimal" /></div>
        {k && <div><label style={label}>Status</label><select style={input} value={f.active ? "1" : "0"} onChange={(e) => setF({ ...f, active: e.target.value === "1" })} disabled={!may}><option value="1">Live</option><option value="0">Retired — kept, hidden</option></select></div>}
      </div>
      <Err e={err} />
      <div className="flex gap-2 mt-3">{may && <button onClick={save} style={btn("primary")}>Save</button>}<button onClick={onDone} style={btn("ghost")}>Close</button>{k && may && <button onClick={remove} style={btn("ghost", { marginLeft: "auto", color: MUTED })}>Remove</button>}</div>
    </Lightbox>
  );
}

function CellForm({ k, month, v, onDone }: { k: K; month: string; v: V | null; onDone: () => void }) {
  const [value, setValue] = useState(v ? String(v.value) : ""); const [note, setNote] = useState(v?.note || "");
  const [err, setErr] = useState<string | null>(null);
  const save = async () => { setErr(null); try { await api("/api/lc/kpis", { action: "value", id: k.id, month: month.slice(0, 7), value, note }); onDone(); } catch (e) { setErr(String((e as Error).message)); } };
  return (
    <Lightbox title={`${k.name} — ${mon(month)}`} onClose={onDone}>
      <label style={label}>{k.type === "currency" ? "Amount, ₹" : `Value${k.unit ? `, ${k.unit}` : ""}`}</label>
      <input style={{ ...input, fontSize: 20 }} className="tnum" value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" autoFocus onKeyDown={(e) => { if (e.key === "Enter") save(); }} />
      <label style={{ ...label, marginTop: 12 }}>A note — where the number came from (optional)</label>
      <input style={input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Tally sales register, 30 Sep" />
      {k.target !== null && <div className="text-xs mt-2" style={{ color: MUTED }}>Target for the month: {fmt(k, k.target)}</div>}
      <Err e={err} />
      <div className="flex gap-2 mt-3"><button onClick={save} style={btn("primary")}>Save</button><button onClick={onDone} style={btn("ghost")}>Cancel</button>{v && <button onClick={async () => { await api("/api/lc/kpis", { action: "value", id: k.id, month: month.slice(0, 7), value: "" }); onDone(); }} style={btn("ghost", { marginLeft: "auto", color: MUTED })}>Clear</button>}</div>
    </Lightbox>
  );
}
