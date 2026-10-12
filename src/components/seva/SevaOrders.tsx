"use client";
/**
 * SEVA → SERVICE ORDER (Dr Raghu, 12 Oct 2026). The customer's order — a
 * formal PO, or on the word: verbal, WhatsApp, mail, a PO to follow after the
 * work — numbered NGSE/PO/SER/…, tagged to a quotation, an AMC, a customer, a
 * job; its lines split SPARES and SERVICE with both amounts shown; assigned to
 * a manager to execute; sent to accounts for billing with a button; the
 * invoice noted when it comes.
 */
import { useEffect, useMemo, useRef, useState } from "react";

type SO = { id: string; so_no: string; so_date: string; customer: string; po_mode: string; customer_po_no: string | null; customer_po_date: string | null; quotation: string | null; amc: string | null; job_id: string | null; issue: string | null; manager_id: string | null; manager_name: string | null; status: string; spares_amount: number; service_amount: number; notes: string; sent_to_accounts_at: string | null; invoice_no: string | null; invoice_date: string | null; created_by: string | null; created_at: string };
type Line = { kind: "spares" | "service"; item_code: string | null; description: string; qty: number; uom: string | null; rate: number; amount: number };
type File_ = { id: string; kind: string; name: string; mime: string | null; bytes: number | null; url: string | null; uploaded_by: string; uploaded_at: string };
type Person = { id: string; name: string; designation: string | null };
type Opts = { quotations: { erp_name: string; customer: string; subject: string | null }[]; amcs: { erp_name: string; customer: string; status: string }[]; jobs: { id: string; cust: string; tag: string }[]; customers: string[] };

const NAVY = "var(--navy)", MUTED = "var(--muted)", LINE = "var(--line)", ORANGE = "var(--accent)", GREEN = "var(--green)", RED = "var(--red)";
const inr = (n: number) => "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");
const dmy = (d?: string | null) => (d ? new Date(d.slice(0, 10) + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" }) : "—");
const inp: React.CSSProperties = { width: "100%", border: `1px solid ${LINE}`, borderRadius: 7, padding: "6px 9px", fontSize: 13, background: "#fff" };
const lbl: React.CSSProperties = { display: "block", fontSize: 10.5, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--dim)", marginBottom: 3 };
const btn = (k: "p" | "s" | "g" = "s"): React.CSSProperties => ({ borderRadius: 7, padding: "6px 12px", fontSize: 12.5, fontWeight: 700, border: k === "g" ? "none" : `1px solid ${k === "p" ? "var(--accent)" : LINE}`, background: k === "p" ? "var(--accent)" : k === "g" ? "transparent" : "#fff", color: k === "p" ? "#fff" : NAVY });
const STATUS_INK: Record<string, string> = { New: "#2563EB", Executing: "#C2410C", "Work done": "#7C3AED", "Sent to accounts": "#0E7490", Invoiced: "#15803D", Closed: "#475569", Cancelled: "#9CA3AF" };

async function post<T = Record<string, unknown>>(body: unknown): Promise<T> {
  const r = await fetch("/api/seva/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `Failed (${r.status})`); return j as T;
}

export default function SevaOrders({ openId, onOpened }: { openId?: string | null; onOpened?: () => void }) {
  const [d, setD] = useState<{ installed: boolean; rows: SO[]; team: Person[]; modes: string[]; statuses: string[] } | null>(null);
  const [q, setQ] = useState(""); const [st, setSt] = useState(""); const [mgr, setMgr] = useState(""); const [cust, setCust] = useState("");
  const [sort, setSort] = useState<{ k: keyof SO | "total"; dir: 1 | -1 }>({ k: "so_no", dir: -1 });
  const [open, setOpen] = useState<string | null>(openId || null); const [making, setMaking] = useState(false);
  const load = () => fetch("/api/seva/orders", { cache: "no-store" }).then((r) => r.json()).then(setD).catch(() => setD({ installed: true, rows: [], team: [], modes: [], statuses: [] }));
  useEffect(() => { load(); }, []);
  useEffect(() => { if (openId) { setOpen(openId); onOpened?.(); } }, [openId]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const val = (r: SO, k: keyof SO | "total") => (k === "total" ? Number(r.spares_amount) + Number(r.service_amount) : (r[k] as unknown));
    return (d?.rows || []).filter((r) => (!st || r.status === st) && (!mgr || r.manager_id === mgr) && (!cust || r.customer === cust)
      && (!t || [r.so_no, r.customer, r.customer_po_no, r.quotation, r.amc, r.job_id, r.issue, r.manager_name, r.invoice_no].some((v) => String(v || "").toLowerCase().includes(t))))
      .sort((a, b) => { const x = val(a, sort.k) ?? "", y = val(b, sort.k) ?? ""; return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * sort.dir; });
  }, [d, q, st, mgr, cust, sort]);
  if (!d) return <div className="text-sm" style={{ color: MUTED }}>Reading…</div>;
  if (!d.installed) return <div className="text-sm font-bold" style={{ color: RED }}>Run migration 0227 first — service orders have nowhere to live yet.</div>;
  const sum = (k: "spares_amount" | "service_amount") => rows.reduce((s, r) => s + Number(r[k] || 0), 0);
  const COLS: [keyof SO | "total", string, boolean?][] = [["so_no", "Service order"], ["so_date", "Date"], ["customer", "Customer"], ["customer_po_no", "Customer PO"], ["quotation", "Quotation"], ["amc", "AMC"], ["job_id", "Job"], ["spares_amount", "Spares", true], ["service_amount", "Service", true], ["total", "Total", true], ["manager_name", "Manager"], ["status", "Status"]];
  return (
    <div>
      <div className="flex items-baseline gap-2 flex-wrap mb-2">
        <h2 className="font-bold" style={{ fontSize: 20, color: NAVY }}>Service Order</h2>
        <span className="text-xs" style={{ color: MUTED }}>the customer&apos;s order — on paper or on the word — split spares and service, executed, billed</span>
        <span className="ml-auto" />
        <button onClick={() => setMaking(true)} style={btn("p")}>+ New service order</button>
      </div>
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search number, customer, PO, quotation, job…" style={{ ...inp, width: 280 }} />
        <select value={st} onChange={(e) => setSt(e.target.value)} style={{ ...inp, width: 170 }}><option value="">Status — all</option>{d.statuses.map((s) => <option key={s}>{s}</option>)}</select>
        <select value={mgr} onChange={(e) => setMgr(e.target.value)} style={{ ...inp, width: 200 }}><option value="">Manager — all</option>{d.team.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <select value={cust} onChange={(e) => setCust(e.target.value)} style={{ ...inp, width: 220 }}><option value="">Customer — all</option>{[...new Set(d.rows.map((r) => r.customer).filter(Boolean))].sort().map((c) => <option key={c}>{c}</option>)}</select>
        <span className="text-xs" style={{ color: MUTED }}>{rows.length} orders · spares {inr(sum("spares_amount"))} · service {inr(sum("service_amount"))} · total {inr(sum("spares_amount") + sum("service_amount"))}</span>
      </div>
      <div className="rounded-lg bg-white" style={{ border: `1px solid ${LINE}`, overflow: "auto", maxHeight: "70vh" }}>
        <table className="genie-table" style={{ minWidth: 1250 }}>
          <thead><tr>{COLS.map(([k, l, num]) => <th key={k} onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : num ? -1 : 1 }))} style={{ cursor: "pointer", whiteSpace: "nowrap", textAlign: num ? "right" : "left", ...(k === "so_no" ? { position: "sticky", left: 0, zIndex: 3 } : {}) }}>{l}<span style={{ opacity: sort.k === k ? 1 : 0.35, marginLeft: 4, fontSize: 10 }}>{sort.k === k ? (sort.dir === 1 ? "▲" : "▼") : "↕"}</span></th>)}</tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} onClick={() => setOpen(r.id)} style={{ cursor: "pointer" }}>
                <td className="font-bold tnum" style={{ position: "sticky", left: 0, background: "#fff", color: NAVY, whiteSpace: "nowrap" }}>{r.so_no}</td>
                <td className="tnum text-xs">{dmy(r.so_date)}</td>
                <td style={{ maxWidth: 220 }}>{r.customer}</td>
                <td className="text-xs">{r.customer_po_no || <span style={{ color: MUTED }}>{r.po_mode}</span>}</td>
                <td className="text-xs tnum">{r.quotation?.replace("NGSE/QTN/", "") || "—"}</td>
                <td className="text-xs">{r.amc || "—"}</td>
                <td className="text-xs tnum">{r.job_id || "—"}</td>
                <td className="tnum text-right">{inr(r.spares_amount)}</td>
                <td className="tnum text-right">{inr(r.service_amount)}</td>
                <td className="tnum text-right font-bold">{inr(Number(r.spares_amount) + Number(r.service_amount))}</td>
                <td className="text-xs">{r.manager_name || <span style={{ color: RED }}>not assigned</span>}</td>
                <td><span className="rounded px-1.5 text-xs font-bold" style={{ background: STATUS_INK[r.status] || NAVY, color: "#fff" }}>{r.status}</span>{r.invoice_no ? <div className="text-xs" style={{ color: MUTED }}>{r.invoice_no}</div> : null}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={COLS.length} style={{ color: MUTED, padding: 16 }}>No service order yet — + New service order, or Create a service order from a quotation.</td></tr>}
          </tbody>
        </table>
      </div>
      {making && <NewOrder team={d.team} modes={d.modes} onDone={(id) => { setMaking(false); load(); if (id) setOpen(id); }} />}
      {open && <OrderBox id={open} team={d.team} onClose={() => { setOpen(null); load(); }} />}
    </div>
  );
}

function useOpts() {
  const [o, setO] = useState<Opts | null>(null);
  useEffect(() => { fetch("/api/seva/orders?options=1", { cache: "no-store" }).then((r) => r.json()).then(setO).catch(() => setO({ quotations: [], amcs: [], jobs: [], customers: [] })); }, []);
  return o;
}

/** THE TAGS — customer, quotation, AMC, job — each a search box over what Genie holds */
function Tags({ f, set, o }: { f: Record<string, string>; set: (p: Record<string, string>) => void; o: Opts | null }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
      <div><label style={lbl}>Customer</label><input list="so-cust" style={inp} value={f.customer} onChange={(e) => set({ customer: e.target.value })} /><datalist id="so-cust">{(o?.customers || []).map((c) => <option key={c} value={c} />)}</datalist></div>
      <div><label style={lbl}>Quotation</label><input list="so-q" style={inp} value={f.quotation} onChange={(e) => { const v = e.target.value; const q = o?.quotations.find((x) => x.erp_name === v); set({ quotation: v, ...(q && !f.customer ? { customer: q.customer } : {}) }); }} placeholder="NGSE/QTN/…" /><datalist id="so-q">{(o?.quotations || []).map((q) => <option key={q.erp_name} value={q.erp_name}>{q.customer} · {q.subject}</option>)}</datalist></div>
      <div><label style={lbl}>AMC</label><input list="so-a" style={inp} value={f.amc} onChange={(e) => { const v = e.target.value; const a = o?.amcs.find((x) => x.erp_name === v); set({ amc: v, ...(a && !f.customer ? { customer: a.customer } : {}) }); }} placeholder="AMS000…" /><datalist id="so-a">{(o?.amcs || []).map((a) => <option key={a.erp_name} value={a.erp_name}>{a.customer} · {a.status}</option>)}</datalist></div>
      <div><label style={lbl}>Job</label><input list="so-j" style={inp} value={f.job_id} onChange={(e) => { const v = e.target.value; const j = o?.jobs.find((x) => x.id === v); set({ job_id: v, ...(j && !f.customer ? { customer: j.cust } : {}) }); }} /><datalist id="so-j">{(o?.jobs || []).map((j) => <option key={j.id} value={j.id}>{j.cust} · {j.tag}</option>)}</datalist></div>
    </div>
  );
}

function NewOrder({ team, modes, onDone }: { team: Person[]; modes: string[]; onDone: (id?: string) => void }) {
  const o = useOpts();
  const [f, setF] = useState<Record<string, string>>({ customer: "", quotation: "", amc: "", job_id: "", issue: "", po_mode: "Purchase order", customer_po_no: "", customer_po_date: "", manager_id: "", notes: "" });
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const set = (p: Record<string, string>) => setF({ ...f, ...p });
  const save = async () => { setErr(null); setBusy(true); try { const r = await post<{ id: string }>({ action: "create", ...f }); onDone(r.id); } catch (e) { setErr(String((e as Error).message)); } setBusy(false); };
  const fromQuote = async () => { if (!f.quotation) { setErr("Pick the quotation first."); return; } setErr(null); setBusy(true); try { const r = await post<{ id: string }>({ action: "create_from_quote", name: f.quotation, po_mode: f.po_mode }); onDone(r.id); } catch (e) { setErr(String((e as Error).message)); } setBusy(false); };
  return (
    <Overlay onClose={() => onDone()} title="New service order">
      <Tags f={f} set={set} o={o} />
      <div className="grid gap-2 mt-2" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
        <div><label style={lbl}>How it came</label><select style={inp} value={f.po_mode} onChange={(e) => set({ po_mode: e.target.value })}>{modes.map((m) => <option key={m}>{m}</option>)}</select></div>
        <div><label style={lbl}>Customer PO no.</label><input style={inp} value={f.customer_po_no} onChange={(e) => set({ customer_po_no: e.target.value })} placeholder={f.po_mode === "Purchase order" ? "" : "when it comes"} /></div>
        <div><label style={lbl}>PO date</label><input type="date" style={inp} value={f.customer_po_date} onChange={(e) => set({ customer_po_date: e.target.value })} /></div>
      </div>
      <div className="grid gap-2 mt-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div><label style={lbl}>Manager — who executes it</label><select style={inp} value={f.manager_id} onChange={(e) => set({ manager_id: e.target.value })}><option value="">—</option>{team.map((p) => <option key={p.id} value={p.id}>{p.name}{p.designation ? ` · ${p.designation}` : ""}</option>)}</select></div>
        <div><label style={lbl}>Ticket (ISS-…)</label><input style={inp} value={f.issue} onChange={(e) => set({ issue: e.target.value })} /></div>
      </div>
      <label style={{ ...lbl, marginTop: 8 }}>Notes</label><textarea style={{ ...inp, minHeight: 50 }} value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
      {err && <div className="text-sm font-bold mt-2" style={{ color: RED }}>{err}</div>}
      <div className="flex gap-2 mt-3 flex-wrap">
        <button onClick={save} disabled={busy} style={btn("p")}>{busy ? "…" : "Make the service order"}</button>
        {f.quotation && <button onClick={fromQuote} disabled={busy} style={btn()}>Make it with the quotation&apos;s lines</button>}
        <button onClick={() => onDone()} style={btn("g")}>Cancel</button>
      </div>
      <div className="text-xs mt-2" style={{ color: MUTED }}>The number — NGSE/PO/SER/… — is given when it is made. Attach the PO, the WhatsApp or the mail after; Genie can read it in to lines.</div>
    </Overlay>
  );
}

function Overlay({ title, onClose, children, wide }: { title: React.ReactNode; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 50, display: "flex", justifyContent: wide ? "flex-end" : "center", alignItems: wide ? "stretch" : "center", padding: wide ? 0 : 16 }}>
      <div onClick={(e) => e.stopPropagation()} className={wide ? "" : "rounded-xl"} style={{ width: wide ? "min(980px, 100vw)" : "min(720px, 100%)", maxHeight: wide ? "100vh" : "92vh", height: wide ? "100vh" : undefined, overflowY: "auto", background: "var(--paper)", padding: 18 }}>
        <div className="flex items-start mb-3"><div style={{ fontSize: 17, fontWeight: 800, color: NAVY, flex: 1 }}>{title}</div><button onClick={onClose} style={btn("g")}>✕</button></div>
        {children}
      </div>
    </div>
  );
}

function OrderBox({ id, team, onClose }: { id: string; team: Person[]; onClose: () => void }) {
  const [d, setD] = useState<{ so: SO; lines: Line[]; files: File_[]; log: { id: string; body: string; by: string; at: string }[]; modes: string[]; statuses: string[]; billing: string[] } | null>(null);
  const [f, setF] = useState<Record<string, string> | null>(null);
  const [lines, setLines] = useState<Line[]>([]); const [dirty, setDirty] = useState(false);
  const [proposal, setProposal] = useState<{ lines: Line[]; customer: string | null; po_no: string | null; po_date: string | null } | null>(null);
  const [busy, setBusy] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
  const [acc, setAcc] = useState<{ to: string; cc: string; note: string } | null>(null);
  const [inv, setInv] = useState({ invoice_no: "", invoice_date: "" });
  const fileRef = useRef<HTMLInputElement>(null);
  const o = useOpts();
  const load = () => fetch(`/api/seva/orders?id=${id}`, { cache: "no-store" }).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setD(j); const s = j.so as SO; setF({ customer: s.customer, quotation: s.quotation || "", amc: s.amc || "", job_id: s.job_id || "", issue: s.issue || "", po_mode: s.po_mode, customer_po_no: s.customer_po_no || "", customer_po_date: s.customer_po_date || "", manager_id: s.manager_id || "", notes: s.notes, so_date: s.so_date }); setLines(j.lines); setDirty(false); setInv({ invoice_no: s.invoice_no || "", invoice_date: s.invoice_date || "" }); }).catch((e) => setErr(String(e.message || e)));
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = async (label: string, body: Record<string, unknown>, after?: (j: Record<string, unknown>) => void) => { setErr(null); setBusy(label); try { const j = await post({ ...body, id }); after?.(j); await load(); } catch (e) { setErr(String((e as Error).message)); } setBusy(null); };
  const upload = async (files: FileList | null) => { if (!files?.length) return; setBusy("Attaching…"); setErr(null); try { for (const file of Array.from(files)) { const fd = new FormData(); fd.set("so_id", id); fd.set("file", file); fd.set("kind", /pdf/i.test(file.type) ? "Purchase order" : "WhatsApp / mail"); const r = await fetch("/api/seva/orders", { method: "POST", body: fd }); if (!r.ok) throw new Error((await r.json()).error); } await load(); } catch (e) { setErr(String((e as Error).message)); } setBusy(null); if (fileRef.current) fileRef.current.value = ""; };
  const setLine = (i: number, p: Partial<Line>) => { setLines(lines.map((l, j) => { if (j !== i) return l; const n = { ...l, ...p }; if (p.qty !== undefined || p.rate !== undefined) n.amount = Math.round((Number(n.qty) || 0) * (Number(n.rate) || 0) * 100) / 100; return n; })); setDirty(true); };
  if (!d || !f) return <Overlay wide title="Service order" onClose={onClose}>{err ? <div style={{ color: RED }}>{err}</div> : <div className="text-sm" style={{ color: MUTED }}>Opening…</div>}</Overlay>;
  const so = d.so;
  const part = (k: "spares" | "service") => lines.map((l, i) => ({ l, i })).filter((x) => x.l.kind === k);
  const total = (k: "spares" | "service") => part(k).reduce((s, x) => s + (Number(x.l.amount) || 0), 0);
  /* a render function, not a component — a component made inside would remount on every keystroke and drop the cursor */
  const lineTable = (k: "spares" | "service", title: string) => (
    <div className="mt-3">
      <div className="flex items-center mb-1"><b style={{ color: NAVY }}>{title}</b><span className="ml-2 text-sm tnum font-bold">{inr(total(k))}</span><button onClick={() => { setLines([...lines, { kind: k, item_code: null, description: "", qty: 1, uom: "Nos", rate: 0, amount: 0 }]); setDirty(true); }} className="ml-auto" style={{ ...btn(), padding: "3px 10px" }}>+ {k === "spares" ? "Spare" : "Service"} line</button></div>
      <table className="genie-table" style={{ width: "100%" }}>
        <thead><tr><th style={{ width: 110 }}>Item</th><th>Description</th><th style={{ width: 70, textAlign: "right" }}>Qty</th><th style={{ width: 60 }}>Unit</th><th style={{ width: 110, textAlign: "right" }}>Rate ₹</th><th style={{ width: 120, textAlign: "right" }}>Amount ₹</th><th style={{ width: 70 }} /></tr></thead>
        <tbody>
          {part(k).map(({ l, i }) => (
            <tr key={i}>
              <td><input style={{ ...inp, padding: "3px 6px" }} value={l.item_code || ""} onChange={(e) => setLine(i, { item_code: e.target.value })} /></td>
              <td><input style={{ ...inp, padding: "3px 6px" }} value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} /></td>
              <td><input style={{ ...inp, padding: "3px 6px", textAlign: "right" }} value={l.qty} onChange={(e) => setLine(i, { qty: Number(e.target.value.replace(/[^0-9.]/g, "")) || 0 })} /></td>
              <td><input style={{ ...inp, padding: "3px 6px" }} value={l.uom || ""} onChange={(e) => setLine(i, { uom: e.target.value })} /></td>
              <td><input style={{ ...inp, padding: "3px 6px", textAlign: "right" }} value={l.rate} onChange={(e) => setLine(i, { rate: Number(e.target.value.replace(/[^0-9.]/g, "")) || 0 })} /></td>
              <td><input style={{ ...inp, padding: "3px 6px", textAlign: "right" }} value={l.amount} onChange={(e) => { setLines(lines.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value.replace(/[^0-9.]/g, "")) || 0 } : x))); setDirty(true); }} /></td>
              <td className="whitespace-nowrap"><button title={`Move to ${k === "spares" ? "service" : "spares"}`} onClick={() => setLine(i, { kind: k === "spares" ? "service" : "spares" })} style={{ color: MUTED, fontSize: 12 }}>⇅</button> <button title="Remove" onClick={() => { setLines(lines.filter((_, j) => j !== i)); setDirty(true); }} style={{ color: RED, fontSize: 12 }}>✕</button></td>
            </tr>
          ))}
          {part(k).length === 0 && <tr><td colSpan={7} className="text-xs" style={{ color: MUTED }}>No {k} line.</td></tr>}
        </tbody>
      </table>
    </div>
  );
  return (
    <Overlay wide onClose={onClose} title={<span>{so.so_no} <span className="rounded px-1.5 text-xs font-bold align-middle" style={{ background: STATUS_INK[so.status], color: "#fff" }}>{so.status}</span><div className="text-sm font-semibold" style={{ color: "var(--dim)" }}>{so.customer} · {dmy(so.so_date)}{so.manager_name ? ` · ${so.manager_name}` : ""}</div></span>}>
      {err && <div className="text-sm font-bold mb-2" style={{ color: RED }}>{err}</div>}
      <div className="flex gap-1.5 flex-wrap mb-3">
        {d.statuses.filter((s) => s !== so.status && !["Sent to accounts", "Invoiced"].includes(s)).map((s) => <button key={s} disabled={!!busy} onClick={() => run(s, { action: "status", status: s })} style={{ ...btn(), padding: "3px 10px", color: STATUS_INK[s] }}>→ {s}</button>)}
        <span className="ml-auto" />
        {so.quotation && <a href={`https://nandanerp.in/app/quotation/${encodeURIComponent(so.quotation)}`} target="_blank" rel="noreferrer" style={{ ...btn(), textDecoration: "none" }}>Quotation ↗</a>}
        {so.amc && <a href={`https://nandanerp.in/app/annual-maintenance-contract/${encodeURIComponent(so.amc)}`} target="_blank" rel="noreferrer" style={{ ...btn(), textDecoration: "none" }}>AMC ↗</a>}
        {so.job_id && <a href={`https://nandanerp.in/app/jobmaster/${encodeURIComponent(so.job_id)}`} target="_blank" rel="noreferrer" style={{ ...btn(), textDecoration: "none" }}>Job ↗</a>}
      </div>

      <div className="rounded-lg bg-white p-3" style={{ border: `1px solid ${LINE}` }}>
        <Tags f={f} set={(p) => setF({ ...f, ...p })} o={o} />
        <div className="grid gap-2 mt-2" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
          <div><label style={lbl}>How it came</label><select style={inp} value={f.po_mode} onChange={(e) => setF({ ...f, po_mode: e.target.value })}>{d.modes.map((m) => <option key={m}>{m}</option>)}</select></div>
          <div><label style={lbl}>Customer PO no.</label><input style={inp} value={f.customer_po_no} onChange={(e) => setF({ ...f, customer_po_no: e.target.value })} /></div>
          <div><label style={lbl}>PO date</label><input type="date" style={inp} value={f.customer_po_date} onChange={(e) => setF({ ...f, customer_po_date: e.target.value })} /></div>
          <div><label style={lbl}>Order date</label><input type="date" style={inp} value={f.so_date} onChange={(e) => setF({ ...f, so_date: e.target.value })} /></div>
        </div>
        <div className="grid gap-2 mt-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div><label style={lbl}>Manager — who executes it</label><select style={inp} value={f.manager_id} onChange={(e) => setF({ ...f, manager_id: e.target.value })}><option value="">—</option>{team.map((p) => <option key={p.id} value={p.id}>{p.name}{p.designation ? ` · ${p.designation}` : ""}</option>)}</select></div>
          <div><label style={lbl}>Ticket (ISS-…)</label><input style={inp} value={f.issue} onChange={(e) => setF({ ...f, issue: e.target.value })} /></div>
        </div>
        <label style={{ ...lbl, marginTop: 8 }}>Notes</label><textarea style={{ ...inp, minHeight: 44 }} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        <button onClick={() => run("Saving…", { action: "save", ...f })} disabled={!!busy} style={{ ...btn("p"), marginTop: 8 }}>Save the details</button>
      </div>

      {/* THE PAPERS, AND GENIE READING THEM */}
      <div className="rounded-lg bg-white p-3 mt-3" style={{ border: `1px solid ${LINE}` }}>
        <div className="flex items-center mb-1"><b style={{ color: NAVY }}>The PO and the papers</b><button onClick={() => fileRef.current?.click()} className="ml-auto" style={btn()}>📎 Attach the PO / WhatsApp / mail</button><input ref={fileRef} type="file" multiple accept="application/pdf,image/*,.eml,.msg,.doc,.docx,.xls,.xlsx" style={{ display: "none" }} onChange={(e) => upload(e.target.files)} /></div>
        {d.files.length === 0 && <div className="text-xs" style={{ color: MUTED }}>Nothing attached — the work can still go ahead; the PO can follow.</div>}
        {d.files.map((x) => (
          <div key={x.id} className="flex items-center gap-2 text-sm py-1" style={{ borderBottom: `1px dotted ${LINE}` }}>
            <a href={x.url || "#"} target="_blank" rel="noreferrer" className="font-semibold hover:underline" style={{ color: "var(--blue)" }}>📄 {x.name}</a>
            <span className="text-xs" style={{ color: MUTED }}>{x.kind} · {x.bytes ? `${Math.round(x.bytes / 1024)} KB` : ""}</span>
            <span className="ml-auto" />
            {(/pdf/i.test(x.mime || "") || /^image\//i.test(x.mime || "")) && <button disabled={!!busy} onClick={() => run("Genie is reading…", { action: "read_po", file_id: x.id }, (j) => setProposal(j as unknown as typeof proposal))} style={{ ...btn(), padding: "3px 10px" }}>🧞 Read it in to lines</button>}
            <button onClick={() => { if (confirm(`Remove ${x.name}?`)) void run("…", { action: "remove_file", file_id: x.id }); }} style={{ color: RED, fontSize: 12 }}>✕</button>
          </div>
        ))}
        {proposal && (
          <div className="rounded-lg p-2 mt-2" style={{ background: "#F5F3FF", border: "1px solid #DDD6FE" }}>
            <div className="text-sm font-bold" style={{ color: "#6D28D9" }}>Genie read {proposal.lines.length} line{proposal.lines.length === 1 ? "" : "s"}{proposal.po_no ? ` · PO ${proposal.po_no}` : ""}{proposal.po_date ? ` of ${proposal.po_date}` : ""}{proposal.customer ? ` · ${proposal.customer}` : ""}</div>
            {proposal.lines.map((l, i) => <div key={i} className="text-xs"><b style={{ color: l.kind === "service" ? "#0E7490" : "#B45309" }}>{l.kind}</b> · {l.description} · {l.qty} × {inr(l.rate)} = {inr(l.amount)}</div>)}
            <div className="flex gap-2 mt-2">
              <button onClick={() => { setLines(proposal.lines); setDirty(true); if (proposal.po_no && !f.customer_po_no) setF({ ...f, customer_po_no: proposal.po_no, customer_po_date: proposal.po_date && /^\d{4}-\d{2}-\d{2}$/.test(proposal.po_date) ? proposal.po_date : f.customer_po_date }); setProposal(null); }} style={btn("p")}>Use these lines</button>
              <button onClick={() => { setLines([...lines, ...proposal.lines]); setDirty(true); setProposal(null); }} style={btn()}>Add them to the lines</button>
              <button onClick={() => setProposal(null)} style={btn("g")}>Drop</button>
            </div>
          </div>
        )}
      </div>

      {/* SPARES AND SERVICE */}
      <div className="rounded-lg bg-white p-3 mt-3" style={{ border: `1px solid ${dirty ? ORANGE : LINE}` }}>
        <div className="flex items-center flex-wrap gap-2">
          <b style={{ color: NAVY, fontSize: 15 }}>Lines</b>
          <span className="text-sm tnum">Spares <b>{inr(total("spares"))}</b> · Service <b>{inr(total("service"))}</b> · Total <b>{inr(total("spares") + total("service"))}</b> <span style={{ color: MUTED }}>(before tax)</span></span>
          <span className="ml-auto" />
          {dirty && <button onClick={() => run("Saving lines…", { action: "lines", lines })} disabled={!!busy} style={btn("p")}>Save the lines</button>}
        </div>
        {lineTable("spares", "Spares")}
        {lineTable("service", "Service")}
      </div>

      {/* BILLING */}
      <div className="rounded-lg bg-white p-3 mt-3" style={{ border: `1px solid ${LINE}` }}>
        <div className="flex items-center gap-2 flex-wrap">
          <b style={{ color: NAVY }}>Billing</b>
          {so.sent_to_accounts_at && <span className="text-xs" style={{ color: GREEN }}>sent to accounts {dmy(so.sent_to_accounts_at)}</span>}
          <span className="ml-auto" />
          <button onClick={() => setAcc({ to: d.billing.join(", "), cc: "", note: "" })} disabled={!!busy || dirty} title={dirty ? "Save the lines first" : ""} style={btn("p")}>✉ Send to accounts for billing</button>
        </div>
        {acc && (
          <div className="mt-2 grid gap-2">
            <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div><label style={lbl}>To</label><input style={inp} value={acc.to} onChange={(e) => setAcc({ ...acc, to: e.target.value })} /></div>
              <div><label style={lbl}>CC</label><input style={inp} value={acc.cc} onChange={(e) => setAcc({ ...acc, cc: e.target.value })} /></div>
            </div>
            <div><label style={lbl}>A word for accounts</label><input style={inp} value={acc.note} onChange={(e) => setAcc({ ...acc, note: e.target.value })} placeholder="Bill on completion of the visit on 14 Oct" /></div>
            <div className="flex gap-2"><button onClick={() => run("Sending…", { action: "send_accounts", ...acc }, () => setAcc(null))} disabled={!!busy} style={btn("p")}>Send it</button><button onClick={() => setAcc(null)} style={btn("g")}>Cancel</button><span className="text-xs" style={{ color: MUTED }}>The order, both parts with their amounts, the PO and the quotation PDF go attached.</span></div>
          </div>
        )}
        <div className="grid gap-2 mt-2 items-end" style={{ gridTemplateColumns: "1fr 1fr auto" }}>
          <div><label style={lbl}>Invoice no.</label><input style={inp} value={inv.invoice_no} onChange={(e) => setInv({ ...inv, invoice_no: e.target.value })} /></div>
          <div><label style={lbl}>Invoice date</label><input type="date" style={inp} value={inv.invoice_date} onChange={(e) => setInv({ ...inv, invoice_date: e.target.value })} /></div>
          <button onClick={() => run("…", { action: "invoice", ...inv })} disabled={!!busy} style={btn()}>Save the invoice</button>
        </div>
      </div>

      {busy && <div className="text-sm mt-2 font-bold" style={{ color: ORANGE }}>{busy}</div>}
      <div className="mt-3">
        <div style={lbl}>What happened</div>
        {d.log.map((x) => <div key={x.id} className="text-xs py-0.5"><span style={{ color: MUTED }}>{new Date(x.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {String(x.by || "").split("@")[0]}</span> — {x.body}</div>)}
      </div>
      {(so.status === "New" || so.status === "Cancelled") && <button onClick={() => { if (confirm(`Remove ${so.so_no}? Its number is not given again.`)) void post({ action: "delete", id }).then(onClose).catch((e) => setErr(String(e.message))); }} className="mt-3 text-xs font-bold" style={{ color: RED }}>Remove this order</button>}
    </Overlay>
  );
}
