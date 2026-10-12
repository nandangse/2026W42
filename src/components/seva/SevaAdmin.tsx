"use client";
/**
 * SEVA → ADMIN (Dr Raghu, 12 Oct 2026): Expense claim · OD slip · Ticket
 * booking · Payment to team — what was kept in the Google Sheet, kept here.
 * Aakash enters the person, the date, the amount and what it is for (an AMC,
 * a job, a customer…); ticks and sends; it lands in Kuber → Payment Planning
 * for Suresh's team; their approval and payment come back on their own. By
 * default only what is still to be paid shows; Paid is the audit. The Ledger
 * runs per person from the opening balance on 1 Nov 2026.
 */
import { useEffect, useMemo, useRef, useState } from "react";

type E = { id: string; no: string; kind: string; employee_id: string; person_name: string; on_date: string; amount: number; related_kind: string | null; related_ref: string | null; customer: string | null; description: string; from_place: string | null; to_place: string | null; travel_mode: string | null; return_on: string | null; status: string; paid_on: string | null; sent_at: string | null; files: number };
type Person = { id: string; name: string; designation: string | null };
type L = { employee_id: string; name: string; opening: number; from: string; received: number; spent: number; balance: number; has_opening: boolean };
type D = { installed: boolean; today: string; rows: E[]; team: Person[]; kinds: Record<string, string>; related: string[]; ledgers: L[]; ledger_from: string; mayWrite: boolean };
const NAVY = "var(--navy)", MUTED = "var(--muted)", LINE = "var(--line)", GREEN = "var(--green)", RED = "var(--red)";
const inr = (n: number) => "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");
const dmy = (d?: string | null) => (d ? new Date(d.slice(0, 10) + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" }) : "—");
const inp: React.CSSProperties = { width: "100%", border: `1px solid ${LINE}`, borderRadius: 7, padding: "6px 9px", fontSize: 13, background: "#fff" };
const lbl: React.CSSProperties = { display: "block", fontSize: 10.5, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--dim)", marginBottom: 3 };
const btn = (p?: boolean): React.CSSProperties => ({ borderRadius: 7, padding: "5px 11px", fontSize: 12.5, fontWeight: 700, border: `1px solid ${p ? "var(--accent)" : LINE}`, background: p ? "var(--accent)" : "#fff", color: p ? "#fff" : NAVY });
const ST: Record<string, { l: string; c: string }> = { draft: { l: "Draft", c: "#64748B" }, sent: { l: "In Kuber", c: "#2563EB" }, approved: { l: "Approved", c: "#7C3AED" }, paid: { l: "Paid", c: "#15803D" }, dropped: { l: "Dropped", c: "#9CA3AF" } };
const ICON: Record<string, string> = { expense: "🧾", od: "🚐", ticket: "🎫", payment: "💸" };

async function post(body: unknown) {
  const r = await fetch("/api/seva/admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `Failed (${r.status})`); return j;
}

export default function SevaAdmin() {
  const [d, setD] = useState<D | null>(null);
  const [tab, setTab] = useState<string>("expense");
  const [show, setShow] = useState<"pending" | "paid" | "all">("pending");
  const [q, setQ] = useState(""); const [who, setWho] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [form, setForm] = useState<Partial<E> | null>(null);
  const [msg, setMsg] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const [ledger, setLedger] = useState<string | null>(null);
  const load = () => fetch("/api/seva/admin", { cache: "no-store" }).then((r) => r.json()).then(setD).catch(() => setD(null));
  useEffect(() => { load(); }, []);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (d?.rows || []).filter((r) => r.kind === tab && (!who || r.employee_id === who) && (show === "all" || (show === "paid" ? r.status === "paid" : !["paid", "dropped"].includes(r.status)))
      && (!t || [r.no, r.person_name, r.description, r.related_ref, r.customer, r.from_place, r.to_place].some((v) => String(v || "").toLowerCase().includes(t))));
  }, [d, tab, show, q, who]);
  if (!d) return <div className="text-sm" style={{ color: MUTED }}>Reading…</div>;
  if (!d.installed) return <div className="text-sm font-bold" style={{ color: RED }}>Run migration 0230 first — Admin has nowhere to live yet.</div>;
  const drafts = rows.filter((r) => r.status === "draft");
  const send = async () => { setBusy(true); setMsg(null); try { const r = await post({ action: "send", ids: [...sel] }); setMsg(`${r.sent} sent to Kuber · ${r.mail}`); setSel(new Set()); await load(); } catch (e) { setMsg(String((e as Error).message)); } setBusy(false); };
  const pendingOf = (k: string) => d.rows.filter((r) => r.kind === k && !["paid", "dropped"].includes(r.status));
  return (
    <div>
      <div className="flex items-baseline gap-2 flex-wrap mb-2">
        <h2 className="font-bold" style={{ fontSize: 20, color: NAVY }}>Admin</h2>
        <span className="text-xs" style={{ color: MUTED }}>entered here, paid in Kuber by accounts, read back on its own</span>
        <span className="ml-auto" />
        {msg && <span className="text-xs font-bold" style={{ color: "var(--accent)" }}>{msg}</span>}
      </div>
      <div className="flex gap-2 flex-wrap mb-3">
        {[...Object.entries(d.kinds), ["ledger", "Ledger"] as [string, string]].map(([k, l]) => {
          const p = k === "ledger" ? null : pendingOf(k);
          return (
            <button key={k} onClick={() => { setTab(k); setSel(new Set()); }} className="rounded-lg px-3 py-2 text-left" style={{ background: tab === k ? NAVY : "#fff", color: tab === k ? "#fff" : NAVY, border: `1px solid ${LINE}`, minWidth: 150 }}>
              <div className="font-bold text-sm">{k === "ledger" ? "📒" : ICON[k]} {l}</div>
              <div className="text-xs" style={{ opacity: 0.8 }}>{p ? `${p.length} to be paid · ${inr(p.reduce((s, r) => s + Number(r.amount), 0))}` : `from ${dmy(d.ledger_from)}`}</div>
            </button>
          );
        })}
      </div>

      {tab === "ledger" ? (
        <Ledgers d={d} onOpen={setLedger} onChange={load} />
      ) : (
        <>
          <div className="flex items-center gap-2 flex-wrap mb-2">
            {(["pending", "paid", "all"] as const).map((k) => <button key={k} onClick={() => setShow(k)} style={{ ...btn(show === k), padding: "4px 10px" }}>{k === "pending" ? "To be paid" : k === "paid" ? "Paid — the audit" : "All"}</button>)}
            <select value={who} onChange={(e) => setWho(e.target.value)} style={{ ...inp, width: 210 }}><option value="">Person — all</option>{d.team.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search number, person, what for…" style={{ ...inp, width: 240 }} />
            <span className="text-xs" style={{ color: MUTED }}>{rows.length} · {inr(rows.reduce((s, r) => s + Number(r.amount), 0))}</span>
            <span className="ml-auto" />
            {d.mayWrite && drafts.length > 0 && <button disabled={!sel.size || busy} onClick={send} style={btn(sel.size > 0)}>📤 Send {sel.size || ""} to Kuber</button>}
            {d.mayWrite && <button onClick={() => setForm({ kind: tab, on_date: d.today })} style={btn(true)}>+ {d.kinds[tab]}</button>}
          </div>
          <div className="rounded-lg bg-white" style={{ border: `1px solid ${LINE}`, overflow: "auto", maxHeight: "66vh" }}>
            <table className="genie-table" style={{ minWidth: 1050 }}>
              <thead><tr><th style={{ width: 30 }}>{d.mayWrite && drafts.length > 0 && <input type="checkbox" checked={sel.size === drafts.length && drafts.length > 0} onChange={(e) => setSel(e.target.checked ? new Set(drafts.map((r) => r.id)) : new Set())} />}</th><th>No.</th><th>Date</th><th>Person</th><th style={{ textAlign: "right" }}>Amount</th><th>For</th>{(tab === "ticket" || tab === "od") && <th>From → to</th>}<th>Related to</th><th>Bills</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} onClick={() => setForm(r)} style={{ cursor: "pointer" }}>
                    <td onClick={(e) => e.stopPropagation()}>{r.status === "draft" && d.mayWrite && <input type="checkbox" checked={sel.has(r.id)} onChange={(e) => { const n = new Set(sel); if (e.target.checked) n.add(r.id); else n.delete(r.id); setSel(n); }} />}</td>
                    <td className="tnum font-bold" style={{ color: NAVY }}>{r.no}</td>
                    <td className="tnum text-xs">{dmy(r.on_date)}</td>
                    <td>{r.person_name}</td>
                    <td className="tnum text-right font-bold">{inr(r.amount)}</td>
                    <td className="text-xs" style={{ maxWidth: 260 }}>{r.description}</td>
                    {(tab === "ticket" || tab === "od") && <td className="text-xs">{[r.from_place, r.to_place].filter(Boolean).join(" → ")}{r.travel_mode ? ` · ${r.travel_mode}` : ""}</td>}
                    <td className="text-xs">{[r.related_kind, r.related_ref, r.customer].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="text-xs tnum">{r.files || ""}</td>
                    <td><span className="rounded px-1.5 text-xs font-bold" style={{ background: ST[r.status]?.c, color: "#fff" }}>{ST[r.status]?.l || r.status}</span>{r.paid_on && <div className="text-xs" style={{ color: GREEN }}>{dmy(r.paid_on)}</div>}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={10} style={{ color: MUTED, padding: 16 }}>{show === "pending" ? "Nothing waiting to be paid." : "Nothing here."}</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
      {form && <EntryForm d={d} f={form} onClose={(ch) => { setForm(null); if (ch) load(); }} />}
      {ledger && <LedgerBox id={ledger} onClose={() => setLedger(null)} />}
    </div>
  );
}

function EntryForm({ d, f, onClose }: { d: D; f: Partial<E>; onClose: (changed: boolean) => void }) {
  const kind = String(f.kind || "expense");
  const locked = !!f.id && f.status !== "draft";
  const [x, setX] = useState({ employee_id: f.employee_id || "", on_date: f.on_date || d.today, amount: f.amount ? String(f.amount) : "", description: f.description || "", related_kind: f.related_kind || "", related_ref: f.related_ref || "", customer: f.customer || "", from_place: f.from_place || "", to_place: f.to_place || "", travel_mode: f.travel_mode || "", return_on: f.return_on || "" });
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const save = async (andClose = true) => { setErr(null); setBusy(true); try { const r = await post({ action: "save", id: f.id, kind, ...x }); if (fileRef.current?.files?.length) { for (const file of Array.from(fileRef.current.files)) { const fd = new FormData(); fd.set("entry_id", r.id); fd.set("file", file); const u = await fetch("/api/seva/admin", { method: "POST", body: fd }); if (!u.ok) throw new Error((await u.json()).error); } } if (andClose) onClose(true); } catch (e) { setErr(String((e as Error).message)); } setBusy(false); };
  const travel = kind === "ticket" || kind === "od";
  return (
    <div onClick={() => onClose(false)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="rounded-xl" style={{ width: "min(640px, 100%)", maxHeight: "92vh", overflowY: "auto", background: "var(--paper)", padding: 18 }}>
        <b style={{ fontSize: 17, color: NAVY }}>{ICON[kind]} {d.kinds[kind]}{f.no ? ` · ${f.no}` : ""}</b>
        {locked && <div className="text-xs mt-1" style={{ color: MUTED }}>{ST[String(f.status)]?.l} — sent to Kuber {dmy(f.sent_at)}{f.paid_on ? `, paid ${dmy(f.paid_on)}` : ""}. Changes are made in Kuber now.</div>}
        <fieldset disabled={locked || !d.mayWrite} style={{ border: 0, padding: 0, margin: 0 }}>
          <div className="grid gap-2 mt-3" style={{ gridTemplateColumns: "1.4fr 1fr 1fr" }}>
            <div><label style={lbl}>Person</label><select style={inp} value={x.employee_id} onChange={(e) => setX({ ...x, employee_id: e.target.value })}><option value="">—</option>{d.team.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
            <div><label style={lbl}>{travel ? "Travel date" : "Date"}</label><input type="date" style={inp} value={x.on_date} onChange={(e) => setX({ ...x, on_date: e.target.value })} /></div>
            <div><label style={lbl}>Amount ₹</label><input style={inp} value={x.amount} onChange={(e) => setX({ ...x, amount: e.target.value.replace(/[^0-9.]/g, "") })} /></div>
          </div>
          {travel && (
            <div className="grid gap-2 mt-2" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
              <div><label style={lbl}>From</label><input style={inp} value={x.from_place} onChange={(e) => setX({ ...x, from_place: e.target.value })} /></div>
              <div><label style={lbl}>To</label><input style={inp} value={x.to_place} onChange={(e) => setX({ ...x, to_place: e.target.value })} /></div>
              <div><label style={lbl}>{kind === "ticket" ? "Mode" : "By"}</label><input list="seva-mode" style={inp} value={x.travel_mode} onChange={(e) => setX({ ...x, travel_mode: e.target.value })} /><datalist id="seva-mode">{["Train", "Bus", "Flight", "Cab", "Own vehicle", "Company vehicle"].map((m) => <option key={m} value={m} />)}</datalist></div>
              <div><label style={lbl}>Return</label><input type="date" style={inp} value={x.return_on} onChange={(e) => setX({ ...x, return_on: e.target.value })} /></div>
            </div>
          )}
          <label style={{ ...lbl, marginTop: 8 }}>What it is for</label>
          <input style={inp} value={x.description} onChange={(e) => setX({ ...x, description: e.target.value })} placeholder={kind === "payment" ? "Advance for the Pune visits" : kind === "expense" ? "Local travel and food, Rabale site" : kind === "od" ? "On duty at the customer's site" : "Train to Nagpur for the installation"} />
          <div className="grid gap-2 mt-2" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
            <div><label style={lbl}>Related to</label><select style={inp} value={x.related_kind} onChange={(e) => setX({ ...x, related_kind: e.target.value })}><option value="">—</option>{d.related.map((r) => <option key={r}>{r}</option>)}</select></div>
            <div><label style={lbl}>Its number</label><input style={inp} value={x.related_ref} onChange={(e) => setX({ ...x, related_ref: e.target.value })} placeholder="AMS… / job / ISS-… / NGSE/PO/SER/…" /></div>
            <div><label style={lbl}>Customer</label><input style={inp} value={x.customer} onChange={(e) => setX({ ...x, customer: e.target.value })} /></div>
          </div>
          {!locked && d.mayWrite && <><label style={{ ...lbl, marginTop: 8 }}>Bills, tickets, receipts</label><input ref={fileRef} type="file" multiple accept="application/pdf,image/*" className="text-xs" /></>}
        </fieldset>
        {err && <div className="text-sm font-bold mt-2" style={{ color: RED }}>{err}</div>}
        <div className="flex gap-2 mt-3">
          {!locked && d.mayWrite && <button onClick={() => save()} disabled={busy} style={btn(true)}>{busy ? "Saving…" : "Save as draft"}</button>}
          <button onClick={() => onClose(false)} style={btn()}>Close</button>
          {!locked && f.id && d.mayWrite && <button onClick={async () => { if (confirm("Remove this draft?")) { await post({ action: "remove", id: f.id }); onClose(true); } }} className="ml-auto" style={{ ...btn(), color: RED }}>Remove</button>}
        </div>
        {!locked && <div className="text-xs mt-2" style={{ color: MUTED }}>Saved as a draft; tick it on the list and Send to Kuber.</div>}
      </div>
    </div>
  );
}

function Ledgers({ d, onOpen, onChange }: { d: D; onOpen: (id: string) => void; onChange: () => void }) {
  const [edit, setEdit] = useState<{ employee_id: string; amount: string; note: string } | null>(null);
  const all = [...d.team.map((t) => d.ledgers.find((l) => l.employee_id === t.id) || { employee_id: t.id, name: t.name, opening: 0, from: d.ledger_from, received: 0, spent: 0, balance: 0, has_opening: false })];
  return (
    <div>
      <div className="text-xs mb-2" style={{ color: MUTED }}>Up to 31 Oct the sheet is tallied; from {dmy(d.ledger_from)} each person starts at an opening balance. Received = paid to him in Kuber (advances, and claims reimbursed); spent = expense claims, OD slips and tickets sent. Balance above zero is money still with him; below zero, the company owes him.</div>
      <div className="rounded-lg bg-white" style={{ border: `1px solid ${LINE}`, overflow: "auto", maxHeight: "66vh" }}>
        <table className="genie-table" style={{ minWidth: 860 }}>
          <thead><tr><th>Person</th><th style={{ textAlign: "right" }}>Opening</th><th style={{ textAlign: "right" }}>Received</th><th style={{ textAlign: "right" }}>Spent</th><th style={{ textAlign: "right" }}>Balance</th><th /></tr></thead>
          <tbody>
            {all.map((l) => (
              <tr key={l.employee_id}>
                <td><button onClick={() => onOpen(l.employee_id)} className="font-bold hover:underline" style={{ color: NAVY }}>{l.name}</button></td>
                <td className="tnum text-right">{l.has_opening ? inr(l.opening) : <span style={{ color: MUTED }}>not set</span>}</td>
                <td className="tnum text-right" style={{ color: GREEN }}>{inr(l.received)}</td>
                <td className="tnum text-right" style={{ color: RED }}>{inr(l.spent)}</td>
                <td className="tnum text-right font-bold" style={{ color: l.balance < 0 ? RED : NAVY }}>{inr(l.balance)}</td>
                <td>{d.mayWrite && <button onClick={() => setEdit({ employee_id: l.employee_id, amount: String(l.opening || ""), note: "" })} className="text-xs font-bold" style={{ color: "var(--blue)" }}>Opening</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && (
        <div className="rounded-lg bg-white p-3 mt-2 flex gap-2 items-end flex-wrap" style={{ border: `2px solid var(--accent)` }}>
          <div><label style={lbl}>Opening on {dmy(d.ledger_from)} for {d.team.find((t) => t.id === edit.employee_id)?.name}</label><input style={{ ...inp, width: 160 }} value={edit.amount} onChange={(e) => setEdit({ ...edit, amount: e.target.value.replace(/[^0-9.-]/g, "") })} placeholder="+ with him / − owed" /></div>
          <div style={{ flex: 1, minWidth: 200 }}><label style={lbl}>Note</label><input style={inp} value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} placeholder="As tallied on the sheet, 31 Oct" /></div>
          <button onClick={async () => { try { await post({ action: "opening", ...edit }); setEdit(null); onChange(); } catch (e) { alert(String((e as Error).message)); } }} style={btn(true)}>Save</button>
          <button onClick={() => setEdit(null)} style={btn()}>Cancel</button>
        </div>
      )}
    </div>
  );
}

function LedgerBox({ id, onClose }: { id: string; onClose: () => void }) {
  const [l, setL] = useState<{ person: { name: string }; from: string; opening: number; received: number; spent: number; balance: number; lines: { date: string; no: string; kind: string; text: string; spent: number; received: number; balance: number }[] } | null>(null);
  useEffect(() => { fetch(`/api/seva/admin?ledger=${encodeURIComponent(id)}`, { cache: "no-store" }).then((r) => r.json()).then(setL).catch(() => setL(null)); }, [id]);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 50, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(760px, 100vw)", height: "100vh", overflowY: "auto", background: "var(--paper)", padding: 18 }}>
        {!l ? <div className="text-sm" style={{ color: MUTED }}>Reading…</div> : (
          <>
            <div className="flex items-start mb-2"><div><b style={{ fontSize: 18, color: NAVY }}>{l.person.name}</b><div className="text-sm" style={{ color: MUTED }}>Ledger from {dmy(l.from)} · opening {inr(l.opening)} · received {inr(l.received)} · spent {inr(l.spent)} · <b style={{ color: l.balance < 0 ? RED : NAVY }}>balance {inr(l.balance)}</b></div></div><button onClick={onClose} className="ml-auto font-bold" style={{ color: MUTED }}>✕</button></div>
            <table className="genie-table" style={{ width: "100%" }}>
              <thead><tr><th>Date</th><th>No.</th><th>What</th><th style={{ textAlign: "right" }}>Received</th><th style={{ textAlign: "right" }}>Spent</th><th style={{ textAlign: "right" }}>Balance</th></tr></thead>
              <tbody>
                <tr><td className="tnum text-xs">{dmy(l.from)}</td><td /><td className="text-xs"><b>Opening balance</b></td><td /><td /><td className="tnum text-right font-bold">{inr(l.opening)}</td></tr>
                {l.lines.map((x, i) => <tr key={i}><td className="tnum text-xs">{dmy(x.date)}</td><td className="tnum text-xs">{x.no}</td><td className="text-xs"><b>{x.kind}</b>{x.text ? ` · ${x.text}` : ""}</td><td className="tnum text-right" style={{ color: GREEN }}>{x.received ? inr(x.received) : ""}</td><td className="tnum text-right" style={{ color: RED }}>{x.spent ? inr(x.spent) : ""}</td><td className="tnum text-right font-bold">{inr(x.balance)}</td></tr>)}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
