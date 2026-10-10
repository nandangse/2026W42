"use client";
/**
 * KPIs (Dr Raghu, 10 Oct 2026): company-wide, in his five groups — Revenue,
 * Profits, Inventory, Cash, People — one row per KPI, one column per month,
 * the latest month at the right edge, a filter on top, a lightbox on the
 * KPI. "The most discrete point is monthly; while filling anything the
 * previous months should also be seen."
 *
 * A ratio (Throughput % of sales, OE %, Purchase %, Salary / Sales) and the
 * People total carry a FORMULA over the other KPIs' codes and are worked
 * out here, never typed: a month's ratio from that month's figures, a
 * quarter's ratio from the quarter's sums. Anyone on the council enters a
 * figure; the assigned leader is who is expected to.
 */
import { useEffect, useMemo, useState } from "react";
import { api, btn, Empty, Err, input, inr, label, Lightbox, MUTED, NAVY, Who, dmy, leaderOf, type Boot } from "./shared";

interface K { id: string; name: string; group: string | null; code: string | null; formula: string | null; assigned_to: string | null; type: "number" | "currency"; unit: string | null; agg: "sum" | "avg" | "last"; target: number | null; sort: number; active: boolean; created_by: string | null; visibility?: string }
interface V { kpi_id: string; month: string; value: number; note: string | null; entered_by: string | null; updated_at: string }

const GROUPS = ["Revenue", "Profits", "Inventory", "Cash", "People"];
const VIS: { key: string; label: string; short: string }[] = [
  { key: "all", label: "All — everyone on the council", short: "" },
  { key: "mancom", label: "Management committee — JC Kumar, Cdr Tushar, Dr Raghu", short: "ManCom" },
  { key: "stratcom", label: "Stratcom", short: "Stratcom" },
  { key: "lc", label: "Leaders Council", short: "LC" },
  { key: "staff", label: "Staff", short: "Staff" },
];

const fy = (m: string) => { const [y, mo] = m.split("-").map(Number); return mo >= 4 ? `${y}-${String(y + 1).slice(2)}` : `${y - 1}-${String(y).slice(2)}`; };
const qOf = (m: string) => { const mo = Number(m.slice(5, 7)); const q = mo >= 4 ? Math.floor((mo - 4) / 3) + 1 : 4; return `Q${q} FY${fy(m)}`; };
const mon = (m: string) => new Date(m + "T00:00:00").toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
const fmt = (k: K, v: number | null) => v === null || v === undefined || !Number.isFinite(v) ? "" : k.type === "currency" ? inr(v) : `${Number(v).toLocaleString("en-IN", { maximumFractionDigits: k.unit === "%" ? 1 : 2 })}${k.unit ? ` ${k.unit}` : ""}`;

/** A formula is codes joined by + or /: "a+b+c" sums; "a/b" is a percentage. */
function evalFormula(formula: string, get: (code: string) => number | null): number | null {
  const f = formula.replace(/\s+/g, "");
  if (f.includes("/")) {
    const [a, b] = f.split("/"); const x = get(a), y = get(b);
    return x === null || y === null || !y ? null : Math.round((x / y) * 1000) / 10;
  }
  const parts = f.split("+").map(get);
  if (parts.every((p) => p === null)) return null;
  return parts.reduce<number>((s, p) => s + (p || 0), 0);
}

export default function Kpis({ boot }: { boot: Boot | null }) {
  const [d, setD] = useState<{ months: string[]; kpis: K[]; values: V[] } | null>(null);
  const [view, setView] = useState<"month" | "quarter">("month");
  const [span, setSpan] = useState<6 | 12>(6);
  const [to, setTo] = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).slice(0, 7));
  const [group, setGroup] = useState<string>("all");
  /* MINE / ALL (Dr Raghu, 10 Oct 2026: "on top by default should have a
     button - Mine - all toggle"). Mine is the KPIs assigned to me; it is the
     default when any are, All when none is. */
  const [mine, setMine] = useState<boolean | null>(null);
  const me = boot?.me.email.toLowerCase() || "";
  const [who, setWho] = useState<string>("all");
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<K | "new" | null>(null);
  const [openK, setOpenK] = useState<K | null>(null);
  const [cell, setCell] = useState<{ k: K; month: string; v: V | null } | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const load = () => api<{ months: string[]; kpis: K[]; values: V[] }>(`/api/lc/kpis?months=${span}&to=${to}`).then(setD).catch(() => setD({ months: [], kpis: [], values: [] }));
  useEffect(() => { load(); }, [to, span]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (mine === null && d && me) setMine(d.kpis.some((k) => (k.assigned_to || "") === me)); }, [d, me, mine]);
  /* THE LATEST MONTH FIRST, ON THE LEFT, the earlier ones running right
     (Dr Raghu, 10 Oct 2026: "show latest month on the left and the ones
     after on right"). */
  const monthsDesc = useMemo(() => [...(d?.months || [])].reverse(), [d]);

  const byCode = useMemo(() => { const m = new Map<string, K>(); for (const k of d?.kpis || []) if (k.code) m.set(k.code, k); return m; }, [d]);
  const raw = (k: K, m: string): number | null => { const v = d?.values.find((x) => x.kpi_id === k.id && x.month === m); return v ? Number(v.value) : null; };
  const val = (k: K, m: string): number | null => k.formula ? evalFormula(k.formula, (c) => { const kk = byCode.get(c); return kk ? raw(kk, m) : null; }) : raw(k, m);
  const row = (k: K, m: string): V | null => d?.values.find((x) => x.kpi_id === k.id && x.month === m) || null;
  const quarters = d ? [...new Set(monthsDesc.map(qOf))] : [];
  const qRaw = (k: K, qr: string): number | null => {
    const vs = (d?.months || []).filter((m) => qOf(m) === qr).map((m) => raw(k, m)).filter((x): x is number => x !== null);
    if (!vs.length) return null;
    return k.agg === "sum" ? vs.reduce((a, b) => a + b, 0) : k.agg === "avg" ? vs.reduce((a, b) => a + b, 0) / vs.length : vs[vs.length - 1];
  };
  const qv = (k: K, qr: string): number | null => k.formula ? evalFormula(k.formula, (c) => { const kk = byCode.get(c); return kk ? qRaw(kk, qr) : null; }) : qRaw(k, qr);
  const qTarget = (k: K, qr: string) => k.target === null ? null : k.agg === "sum" ? k.target * (d?.months || []).filter((m) => qOf(m) === qr).length : k.target;
  const shift = (n: number) => { const [y, m] = to.split("-").map(Number); const dt = new Date(y, m - 1 + n, 1); setTo(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`); };
  const tone = (v: number | null, t: number | null) => v === null || t === null ? undefined : v >= t ? "#E3F3E8" : v >= t * 0.9 ? "#FFF7E6" : "#FDECEA";

  const needle = q.trim().toLowerCase();
  const kpis = (d?.kpis || []).filter((k) => (showInactive || k.active) && (!mine || (k.assigned_to || "") === me) && (group === "all" || (k.group || "Other") === group) && (who === "all" || (k.assigned_to || "") === who) && (!needle || k.name.toLowerCase().includes(needle)));
  const groups = [...GROUPS, "Other"].filter((g) => kpis.some((k) => (k.group || "Other") === g));
  const owners = [...new Set((d?.kpis || []).map((k) => k.assigned_to).filter((x): x is string => !!x))];
  const cols = view === "month" ? (d?.months.length || 0) : quarters.length;

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setEdit("new")} style={btn("primary")}>+ Add a KPI</button>
        <span className="text-xs" style={{ color: "var(--dim)" }}>Click a figure to enter it; click the KPI for its story. Ratios are worked out, never typed.</span>
        <span className="ml-auto" />
        <button onClick={() => setView("month")} style={btn(view === "month" ? "primary" : "soft", { padding: "5px 10px", fontSize: 12 })}>By month</button>
        <button onClick={() => setView("quarter")} style={btn(view === "quarter" ? "primary" : "soft", { padding: "5px 10px", fontSize: 12 })}>By quarter</button>
        <button onClick={() => setSpan(span === 6 ? 12 : 6)} style={btn("soft", { padding: "5px 10px", fontSize: 12 })} title="How many months are on the board">{span} months</button>
        <span className="text-xs" style={{ color: MUTED }}>latest first</span>
        <button onClick={() => shift(-3)} style={btn("ghost", { padding: "5px 8px", fontSize: 12 })}>‹</button>
        <span className="text-xs tnum font-bold" style={{ color: NAVY }}>to {mon(to + "-01")}</span>
        <button onClick={() => shift(3)} style={btn("ghost", { padding: "5px 8px", fontSize: 12 })}>›</button>
      </div>
      {/* THE FILTER ON TOP */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--accent)" }}>
          <button onClick={() => setMine(true)} style={{ padding: "4px 12px", fontSize: 12, fontWeight: 800, background: mine ? "var(--accent)" : "#fff", color: mine ? "#fff" : "var(--accent)" }} title="The KPIs assigned to me">Mine</button>
          <button onClick={() => setMine(false)} style={{ padding: "4px 12px", fontSize: 12, fontWeight: 800, background: mine === false ? "var(--accent)" : "#fff", color: mine === false ? "#fff" : "var(--accent)" }} title="Every KPI I may see">All</button>
        </span>
        {["all", ...GROUPS].map((g) => <button key={g} onClick={() => setGroup(g)} style={btn(group === g ? "primary" : "soft", { padding: "4px 10px", fontSize: 12 })}>{g === "all" ? "All groups" : g}</button>)}
        <select style={{ ...input, width: "auto", padding: "4px 8px", fontSize: 12 }} value={who} onChange={(e) => setWho(e.target.value)}><option value="all">Anyone</option>{owners.map((e) => <option key={e} value={e}>{leaderOf(boot, e).name}</option>)}</select>
        <input style={{ ...input, width: 200, padding: "4px 8px", fontSize: 12 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a KPI…" />
        <label className="text-xs flex items-center gap-1" style={{ color: MUTED }}><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> retired too</label>
      </div>
      {d === null && <Empty>Opening…</Empty>}
      {d && kpis.length === 0 && <Empty>{mine ? "No KPI is assigned to you yet — press All to see the board." : `Nothing to show${group !== "all" || who !== "all" || needle ? " for this filter" : " — add the first KPI"}.`}</Empty>}
      {d && kpis.length > 0 && (
        <div className="genie-scroll rounded-lg bg-white" style={{ border: "1px solid var(--line)", overflowX: "auto" }}>
          <table className="genie-table lc-kpi">
            <thead>
              <tr>
                <th style={{ position: "sticky", left: 0, background: "var(--navy)", zIndex: 3, width: 220, minWidth: 220, maxWidth: 220 }}>KPI</th>
                <th style={{ position: "sticky", left: 220, background: "var(--navy)", zIndex: 3, width: 120, minWidth: 120, maxWidth: 120, boxShadow: "2px 0 0 rgba(0,0,0,.15)" }}>Assigned to</th>
                <th className="tnum" style={{ minWidth: 90, textAlign: "right" }}>Target / month</th>
                {view === "month" ? monthsDesc.map((m) => <th key={m} className="tnum" style={{ minWidth: 96, textAlign: "right" }}>{mon(m)}</th>) : quarters.map((qr) => <th key={qr} className="tnum" style={{ minWidth: 120, textAlign: "right" }}>{qr}</th>)}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <GroupRows key={g} g={g} rows={kpis.filter((k) => (k.group || "Other") === g)} cols={cols} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="text-xs" style={{ color: MUTED }}>Green: at or above target · amber: within 10% · red: below. A figure in italics is worked out from the others. Later these numbers arrive on their own from the ERP, Kuber and the CRM; for now the council feeds them.</div>
      {edit && <Form boot={boot} k={edit === "new" ? undefined : edit} onDone={() => { setEdit(null); load(); }} />}
      {openK && <KpiView k={openK} boot={boot} months={d?.months || []} val={val} row={row} onEdit={() => { setEdit(openK); setOpenK(null); }} onCell={(m) => { setCell({ k: openK, month: m, v: row(openK, m) }); }} onClose={() => setOpenK(null)} />}
      {cell && <CellForm k={cell.k} month={cell.month} v={cell.v} history={(d?.months || []).filter((m) => m < cell.month).slice(-6).map((m) => ({ month: m, v: row(cell.k, m) }))} onDone={() => { setCell(null); load(); }} />}
    </div>
  );

  function GroupRows({ g, rows, cols: n }: { g: string; rows: K[]; cols: number }) {
    return (
      <>
        <tr style={{ background: "var(--paper)" }}>
          <td style={{ position: "sticky", left: 0, zIndex: 2, background: "var(--paper)", color: NAVY, fontWeight: 800, fontSize: 12, letterSpacing: 0.6, padding: "6px 10px", width: 220, minWidth: 220 }}>{g.toUpperCase()}</td>
          <td style={{ position: "sticky", left: 220, zIndex: 2, background: "var(--paper)", width: 120, minWidth: 120, boxShadow: "2px 0 0 rgba(0,0,0,.06)" }} />
          <td colSpan={1 + n} style={{ background: "var(--paper)" }} />
        </tr>
        {rows.map((k) => (
          <tr key={k.id} style={{ opacity: k.active ? 1 : 0.55 }}>
            <td style={{ position: "sticky", left: 0, background: "#fff", zIndex: 1, borderLeft: `5px solid ${leaderOf(boot, k.assigned_to).colour}`, width: 220, minWidth: 220, maxWidth: 220 }}>
              <button onClick={() => setOpenK(k)} className="text-left font-bold" style={{ color: NAVY, fontSize: 13 }} title="Open the KPI">{k.name}</button>
              <div className="text-xs flex items-center gap-1 flex-wrap" style={{ color: MUTED }}>
                {k.formula ? <i>{k.formula.replace(/_pct/g, "").replace(/\//g, " ÷ ").replace(/\+/g, " + ")}</i> : <>{k.type === "currency" ? "₹" : k.unit || "number"} · quarter = {k.agg === "sum" ? "sum" : k.agg === "avg" ? "average" : "last month"}</>}
                {k.visibility && k.visibility !== "all" && <span className="rounded px-1 font-bold" style={{ fontSize: 10, background: "#FFF1E8", color: "var(--accent)" }} title={VIS.find((v) => v.key === k.visibility)?.label}>👁 {VIS.find((v) => v.key === k.visibility)?.short}</span>}
              </div>
            </td>
            <td style={{ position: "sticky", left: 220, background: "#fff", zIndex: 1, width: 120, minWidth: 120, maxWidth: 120, boxShadow: "2px 0 0 rgba(0,0,0,.06)" }}>{k.assigned_to ? <Who boot={boot} email={k.assigned_to} size={20} /> : <span className="text-xs" style={{ color: MUTED }}>—</span>}</td>
            <td className="tnum" style={{ color: MUTED, textAlign: "right" }}>{fmt(k, k.target)}</td>
            {view === "month" ? monthsDesc.map((m) => { const v = val(k, m); const r = row(k, m); return (
              <td key={m} className="tnum" style={{ textAlign: "right", background: tone(v, k.target), cursor: k.formula ? "default" : "pointer", fontStyle: k.formula ? "italic" : "normal" }} onClick={() => { if (!k.formula) setCell({ k, month: m, v: r }); }} title={k.formula ? "Worked out from the others" : r ? `${r.note || ""} — ${leaderOf(boot, r.entered_by).name}` : "Click to enter"}>
                {v === null ? <span style={{ color: "#D5D1C8" }}>·</span> : fmt(k, v)}
              </td>
            ); }) : quarters.map((qr) => { const v = qv(k, qr); const t = qTarget(k, qr); return (
              <td key={qr} className="tnum font-bold" style={{ textAlign: "right", background: tone(v, t), fontStyle: k.formula ? "italic" : "normal" }} title={t !== null ? `target ${fmt(k, t)}` : ""}>{v === null ? <span style={{ color: "#D5D1C8" }}>·</span> : fmt(k, v)}</td>
            ); })}
          </tr>
        ))}
      </>
    );
  }
}

/** THE KPI'S OWN LIGHTBOX: its months as bars, the figures, who entered, and Edit. */
function KpiView({ k, boot, months, val, row, onEdit, onCell, onClose }: { k: K; boot: Boot | null; months: string[]; val: (k: K, m: string) => number | null; row: (k: K, m: string) => V | null; onEdit: () => void; onCell: (m: string) => void; onClose: () => void }) {
  const vals = months.map((m) => ({ m, v: val(k, m), r: row(k, m) }));
  const max = Math.max(...vals.map((x) => x.v ?? 0), k.target ?? 0, 1);
  const may = !!boot && (boot.me.isOwner || (k.created_by || "").toLowerCase() === boot.me.email.toLowerCase());
  return (
    <Lightbox title={<span>{k.group ? <span style={{ color: MUTED, fontWeight: 600 }}>{k.group} · </span> : null}{k.name}</span>} onClose={onClose}>
      <div className="flex items-center gap-3 flex-wrap text-sm mb-3" style={{ color: "var(--dim)" }}>
        {k.assigned_to ? <span className="inline-flex items-center gap-1">Assigned to <Who boot={boot} email={k.assigned_to} size={20} /></span> : <span>Not assigned</span>}
        <span>· {k.formula ? <i>worked out: {k.formula.replace(/\//g, " ÷ ").replace(/\+/g, " + ")}</i> : `${k.type === "currency" ? "₹" : k.unit || "number"} · quarter = ${k.agg === "sum" ? "sum of months" : k.agg === "avg" ? "average" : "last month"}`}</span>
        {k.target !== null && <span>· target {fmt(k, k.target)} / month</span>}
        {k.visibility && k.visibility !== "all" && <span>· 👁 {VIS.find((v) => v.key === k.visibility)?.label}</span>}
        <span className="ml-auto" />
        {may && <button onClick={onEdit} style={btn("soft", { padding: "5px 12px", fontSize: 12 })}>Edit the KPI</button>}
      </div>
      <div className="flex items-end gap-1.5" style={{ height: 120, padding: "0 4px", borderBottom: "1px solid var(--line)" }}>
        {vals.map((x) => (
          <div key={x.m} className="flex-1 flex flex-col items-center justify-end" style={{ height: "100%" }} title={x.v === null ? "—" : fmt(k, x.v)}>
            <div style={{ width: "70%", height: `${x.v === null ? 0 : Math.max(2, (x.v / max) * 100)}%`, background: x.v === null ? "transparent" : k.target !== null && x.v < k.target ? "var(--red)" : "var(--navy)", borderRadius: "3px 3px 0 0", opacity: k.formula ? 0.7 : 1 }} />
          </div>
        ))}
      </div>
      <div className="grid mt-2" style={{ gridTemplateColumns: "1fr auto auto", gap: "4px 14px", fontSize: 13 }}>
        {vals.map((x) => (
          <div key={x.m} className="contents">
            <span style={{ color: "var(--dim)" }}>{mon(x.m)}</span>
            <button onClick={() => { if (!k.formula) onCell(x.m); }} className="tnum font-bold text-right" style={{ color: x.v === null ? "#C9C4B8" : NAVY, fontStyle: k.formula ? "italic" : "normal", cursor: k.formula ? "default" : "pointer" }} title={k.formula ? "Worked out" : "Click to enter"}>{x.v === null ? "—" : fmt(k, x.v)}</button>
            <span className="text-xs" style={{ color: MUTED }}>{x.r ? `${leaderOf(boot, x.r.entered_by).name} · ${dmy(x.r.updated_at)}${x.r.note ? ` · ${x.r.note}` : ""}` : ""}</span>
          </div>
        ))}
      </div>
    </Lightbox>
  );
}

function Form({ boot, k, onDone }: { boot: Boot | null; k?: K; onDone: () => void }) {
  const [f, setF] = useState({ name: k?.name || "", group: k?.group || "Revenue", assigned_to: k?.assigned_to || "", type: k?.type || "number", unit: k?.unit || "", agg: k?.agg || "sum", target: k?.target ?? "", active: k?.active ?? true, visibility: k?.visibility || "all" });
  const [err, setErr] = useState<string | null>(null);
  const may = !k || !!boot?.me.isOwner || (k.created_by || "").toLowerCase() === boot?.me.email.toLowerCase();
  const save = async () => { setErr(null); try { await api("/api/lc/kpis", { action: k ? "edit" : "create", id: k?.id, ...f }); onDone(); } catch (e) { setErr(String((e as Error).message)); } };
  const remove = async () => { if (!k || !confirm(`Remove "${k.name}" and every value entered for it?`)) return; await api("/api/lc/kpis", { action: "remove", id: k.id }); onDone(); };
  return (
    <Lightbox title={k ? `Edit — ${k.name}` : "A new KPI"} onClose={onDone}>
      {!may && <div className="text-xs mb-2" style={{ color: MUTED }}>Only the one who added this KPI, or Dr Raghu, may change it. Values can be entered by anyone.</div>}
      {k?.formula && <div className="text-xs mb-2" style={{ color: "var(--accent)" }}>Worked out as {k.formula} — the figure is never typed.</div>}
      <label style={label}>KPI</label>
      <input style={input} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Billing" disabled={!may} autoFocus />
      <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div><label style={label}>Group</label><select style={input} value={f.group} onChange={(e) => setF({ ...f, group: e.target.value })} disabled={!may}>{GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}<option value="Other">Other</option></select></div>
        <div><label style={label}>Assigned to</label><select style={input} value={f.assigned_to} onChange={(e) => setF({ ...f, assigned_to: e.target.value })} disabled={!may}><option value="">—</option>{boot?.members.map((m) => <option key={m.email} value={m.email}>{m.name}</option>)}</select></div>
        <div><label style={label}>Type</label><select style={input} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as K["type"] })} disabled={!may || !!k?.formula}><option value="number">Number</option><option value="currency">Currency (₹)</option></select></div>
        <div><label style={label}>Unit (for a number: nos, %, days…)</label><input style={input} value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} disabled={!may || f.type === "currency"} /></div>
        <div><label style={label}>A quarter is the</label><select style={input} value={f.agg} onChange={(e) => setF({ ...f, agg: e.target.value as K["agg"] })} disabled={!may}><option value="sum">sum of its months (billing, purchases)</option><option value="avg">average of its months (a rate)</option><option value="last">last month&apos;s figure (receivables, headcount)</option></select></div>
        <div><label style={label}>Target per month (optional)</label><input style={input} value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} disabled={!may} inputMode="decimal" /></div>
        <div style={{ gridColumn: "span 2" }}><label style={label}>Visibility — who may see this KPI</label><select style={input} value={f.visibility} onChange={(e) => setF({ ...f, visibility: e.target.value })} disabled={!may}>{VIS.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}</select></div>
        {k && <div><label style={label}>Status</label><select style={input} value={f.active ? "1" : "0"} onChange={(e) => setF({ ...f, active: e.target.value === "1" })} disabled={!may}><option value="1">Live</option><option value="0">Retired — kept, hidden</option></select></div>}
      </div>
      <Err e={err} />
      <div className="flex gap-2 mt-3">{may && <button onClick={save} style={btn("primary")}>Save</button>}<button onClick={onDone} style={btn("ghost")}>Close</button>{k && may && !k.code && <button onClick={remove} style={btn("ghost", { marginLeft: "auto", color: MUTED })}>Remove</button>}</div>
    </Lightbox>
  );
}

function CellForm({ k, month, v, history, onDone }: { k: K; month: string; v: V | null; history: { month: string; v: V | null }[]; onDone: () => void }) {
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
      {history.length > 0 && (
        <div className="mt-3 rounded-lg p-2.5" style={{ background: "var(--paper)" }}>
          <div className="text-xs font-bold mb-1" style={{ color: MUTED, letterSpacing: 0.4 }}>THE MONTHS BEFORE</div>
          <div className="grid gap-0.5">
            {history.map((h) => <div key={h.month} className="flex justify-between text-sm tnum"><span style={{ color: "var(--dim)" }}>{mon(h.month)}</span><span className="font-bold" style={{ color: h.v ? NAVY : "#C9C4B8" }}>{h.v ? fmt(k, Number(h.v.value)) : "—"}</span></div>)}
          </div>
        </div>
      )}
      <Err e={err} />
      <div className="flex gap-2 mt-3"><button onClick={save} style={btn("primary")}>Save</button><button onClick={onDone} style={btn("ghost")}>Cancel</button>{v && <button onClick={async () => { await api("/api/lc/kpis", { action: "value", id: k.id, month: month.slice(0, 7), value: "" }); onDone(); }} style={btn("ghost", { marginLeft: "auto", color: MUTED })}>Clear</button>}</div>
    </Lightbox>
  );
}
