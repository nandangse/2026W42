"use client";
/**
 * Full and Final Settlements (Dr Raghu, 4 Sep 2026).
 *
 * PAGE 1 is the table. Add new picks the person and takes the dates and the
 * money HR knows. A row opens as a page with the six papers across the top:
 * Resignation, its acceptance, the relieving letter, the closing checklist
 * with remarks, the calculation, and the settlement letter with the payment
 * — each previewed here and opened on its own page for paper — plus
 * Communication: what HRMS sent, the loans, and the WhatsApp thread on the
 * personal number.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { fmtFull } from "@/lib/schedule";
import { DOCS, FNF_STATUS, STATUS_TONE, computeFnf, defaultTexts, dmy, inr, type CheckItem, type DocKey, type FnfRow, type Line } from "@/lib/fnf";
import { Pane } from "./Pane";
import { C } from "./RecordFields";

interface ListRow {
  id: string; fnf_no: string | null; employee_id: string; name: string; designation: string | null; department: string | null; emp_type: string | null;
  done_on: string | null; resignation_date: string | null; exit_date: string | null; fnf_call_date: string | null;
  loan_closing: number; pending_expenses: number; tds_year: number; advance_paid: number; advance_to_pay: number;
  status: string; paid_amount: number | null; payment_date: string | null; checklist_done: number; checklist_total: number; updated_at: string;
}
interface Person { id: string; name: string; department: string | null; designation: string | null; active: boolean; type: string | null }

const inp: React.CSSProperties = { border: `1px solid ${C.line}`, borderRadius: 6, padding: "5px 8px", fontSize: 13, width: "100%", background: "#fff" };
const day = (s: string | null | undefined) => (s ? fmtFull(String(s)) : "—");

export default function Fnf({ who, isOwner }: { who: string; isOwner: boolean }) {
  const [rows, setRows] = useState<ListRow[] | null>(null);
  const [needs, setNeeds] = useState(false);
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    try { const j = await api.get("/api/hrms/fnf"); setRows(j.rows || []); setNeeds(!!j.needsMigration); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); setRows([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (rows || []).filter((r) => !n || [r.name, r.employee_id, r.department, r.designation, r.status, r.fnf_no].join(" ").toLowerCase().includes(n));
  }, [rows, q]);

  if (open) return <Settlement id={open} who={who} isOwner={isOwner} onBack={() => { setOpen(null); load(); }} />;

  return (
    <Pane title="Full and Final Settlements" who={who} print
      blurb="Every settlement on one table: who, the dates, the money HR entered, how far the checklist has got, and where it stands. Open a row for the six papers."
      tools={<button onClick={() => setAdding(true)} className="text-xs font-bold rounded px-3 py-1.5 no-print" style={{ background: C.orange, color: "#fff" }}>+ Add new</button>}>
      {msg && <div className="text-xs font-semibold mb-2" style={{ color: C.red }}>{msg}</div>}
      {needs && <div className="rounded p-2 mb-2" style={{ background: "#FFF7E6", border: "1px solid #F5D9A8", fontSize: 12.5, color: "#8A5B00" }}>Run migration 0130 — settlements have nowhere to live yet.</div>}
      <div className="flex items-center gap-2 mb-2 no-print">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="search name, ID, department, status…" style={{ ...inp, width: 300 }} />
        <span className="text-xs" style={{ color: C.faint }}>{shown.length} settlement{shown.length === 1 ? "" : "s"}</span>
      </div>
      <div className="bg-white rounded-lg border" style={{ borderColor: C.line, overflowX: "auto" }}>
        <table className="w-full" style={{ fontSize: 12.5, borderCollapse: "collapse", whiteSpace: "nowrap" }}>
          <thead><tr style={{ color: C.faint, fontSize: 11 }}>
            {["No.", "Person", "Done on", "Resignation", "Exit", "Called for F&F", "Loan closing", "Pending exp.", "TDS of year", "Advance paid", "Advance to pay", "Checklist", "Status", ""].map((h, i) => (
              <th key={h + i} className="text-left px-2 py-1.5" style={{ borderBottom: `1px solid ${C.line}`, textAlign: i >= 6 && i <= 10 ? "right" : "left" }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan={14} className="px-2 py-4" style={{ color: C.faint }}>loading…</td></tr>}
            {rows !== null && shown.length === 0 && <tr><td colSpan={14} className="px-2 py-4" style={{ color: C.faint }}>No settlements yet — Add new starts one.</td></tr>}
            {shown.map((r) => {
              const tone = STATUS_TONE[r.status] || STATUS_TONE.Open;
              return (
                <tr key={r.id} style={{ borderTop: "1px solid #EEECE6", cursor: "pointer" }} role="button" tabIndex={0} onClick={() => setOpen(r.id)}>
                  <td className="px-2 py-1.5" style={{ color: C.faint }}>{r.fnf_no || "—"}</td>
                  <td className="px-2 py-1.5"><b style={{ color: "#1B3A5C" }}>{r.name}</b><br /><span style={{ fontSize: 11, color: C.faint }}>{r.employee_id} · {r.designation || "—"} · {r.department || "—"}</span></td>
                  <td className="px-2 py-1.5">{day(r.done_on)}</td>
                  <td className="px-2 py-1.5">{day(r.resignation_date)}</td>
                  <td className="px-2 py-1.5">{day(r.exit_date)}</td>
                  <td className="px-2 py-1.5">{day(r.fnf_call_date)}</td>
                  <td className="px-2 py-1.5 text-right tnum">{inr(r.loan_closing)}</td>
                  <td className="px-2 py-1.5 text-right tnum">{inr(r.pending_expenses)}</td>
                  <td className="px-2 py-1.5 text-right tnum">{inr(r.tds_year)}</td>
                  <td className="px-2 py-1.5 text-right tnum">{inr(r.advance_paid)}</td>
                  <td className="px-2 py-1.5 text-right tnum">{inr(r.advance_to_pay)}</td>
                  <td className="px-2 py-1.5"><span style={{ color: r.checklist_done === r.checklist_total ? C.green : C.dim }}>{r.checklist_done}/{r.checklist_total}</span></td>
                  <td className="px-2 py-1.5"><span className="rounded px-1.5 py-0.5 font-bold" style={{ background: tone.bg, color: tone.fg, fontSize: 10.5 }}>{r.status}</span></td>
                  <td className="px-2 py-1.5"><span style={{ color: "#1B3A5C" }}>open ›</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {adding && <AddNew onClose={() => setAdding(false)} onCreated={(id) => { setAdding(false); load(); setOpen(id); }} />}
    </Pane>
  );
}

/* ───────────────────────── add new ───────────────────────── */

function AddNew({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [people, setPeople] = useState<Person[]>([]);
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<Person | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ done_on: today, resignation_date: "", exit_date: "", fnf_call_date: "", notice_days: "30", loan_closing: "", pending_expenses: "", tds_year: "", advance_paid: "", advance_to_pay: "", reason: "" });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get("/api/hrms/fnf?people=1").then((j) => setPeople(j.people || [])).catch(() => setPeople([])); }, []);
  const hits = useMemo(() => {
    const n = q.trim().toLowerCase();
    return people.filter((p) => p.active).filter((p) => n && (p.name.toLowerCase().includes(n) || p.id.toLowerCase().includes(n))).slice(0, 8);
  }, [people, q]);
  const create = async () => {
    if (!pick) { setMsg("Pick the person first."); return; }
    if (!f.resignation_date || !f.exit_date) { setMsg("The resignation date and the exit date are needed."); return; }
    setBusy(true); setMsg("");
    try { const j = await api.post("/api/hrms/fnf", { action: "create", employee_id: pick.id, ...f }); onCreated(j.id); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); setBusy(false); }
  };
  const F = ({ k, label, type = "text", hint }: { k: keyof typeof f; label: string; type?: string; hint?: string }) => (
    <label className="text-xs" style={{ color: C.dim }} title={hint}>{label}
      <input type={type} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} style={{ ...inp, marginTop: 2 }} />
    </label>
  );
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(22,35,47,0.55)", zIndex: 70, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "32px 16px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg" style={{ width: "min(680px, 100%)" }}>
        <div className="px-4 py-3 flex items-center" style={{ background: "#16232F", color: "#fff" }}>
          <div style={{ flex: 1 }}><div className="font-bold" style={{ fontSize: 16 }}>New settlement</div><div className="text-xs" style={{ color: "#8FA1B3" }}>The person, the dates, and the money HR knows. The rest comes from the record.</div></div>
          <button onClick={onClose} className="font-bold" style={{ color: "#8FA1B3", fontSize: 20 }}>✕</button>
        </div>
        <div className="p-4">
          {msg && <div className="text-xs font-semibold mb-2" style={{ color: C.red }}>{msg}</div>}
          {!pick ? (
            <div className="mb-3">
              <div className="text-xs font-semibold mb-1" style={{ color: C.dim }}>Who is leaving?</div>
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="type a name or employee ID" style={inp} />
              {hits.length > 0 && (
                <div className="rounded border mt-1" style={{ borderColor: C.line }}>
                  {hits.map((p) => (
                    <button key={p.id} onClick={() => setPick(p)} className="block w-full text-left px-2 py-1.5" style={{ borderTop: "1px solid #EEECE6", fontSize: 13 }}>
                      <b>{p.name}</b> <span style={{ color: C.faint, fontSize: 11.5 }}>{p.id} · {p.designation || "—"} · {p.department || "—"} · {p.type || "—"}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded p-2 mb-3 flex items-center gap-2" style={{ background: "#FBFAF7", border: `1px solid ${C.line}` }}>
              <div style={{ flex: 1 }}><b>{pick.name}</b> <span style={{ color: C.faint, fontSize: 12 }}>{pick.id} · {pick.designation || "—"} · {pick.department || "—"} · {pick.type || "—"}</span></div>
              <button onClick={() => setPick(null)} className="text-xs" style={{ color: "#1B3A5C" }}>change</button>
            </div>
          )}
          <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <F k="done_on" label="Done on" type="date" />
            <F k="resignation_date" label="Resignation letter date" type="date" />
            <F k="exit_date" label="Exit date" type="date" />
            <F k="fnf_call_date" label="Calling for F&F date" type="date" />
            <F k="notice_days" label="Notice period (days)" type="number" />
            <F k="loan_closing" label="Loan closing balance ₹" type="number" hint="Blank takes the loan outstanding on the record" />
            <F k="pending_expenses" label="Pending expenses ₹" type="number" />
            <F k="tds_year" label="TDS of the year ₹" type="number" />
            <F k="advance_paid" label="Advance paid ₹" type="number" hint="Already paid — recovered in the settlement" />
            <F k="advance_to_pay" label="Advance to be paid ₹" type="number" hint="Still to be paid — added in the settlement" />
            <div style={{ gridColumn: "1 / -1" }}><F k="reason" label="Reason for leaving" /></div>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <button onClick={onClose} className="text-xs font-semibold rounded border px-3 py-1.5 bg-white" style={{ borderColor: C.line, color: C.dim }}>Cancel</button>
            <button onClick={create} disabled={busy} className="text-xs font-bold rounded px-3 py-1.5" style={{ background: C.orange, color: "#fff", opacity: busy ? 0.6 : 1 }}>{busy ? "Opening…" : "Open the settlement"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── one settlement ───────────────────────── */

interface Detail {
  row: FnfRow; statement: ReturnType<typeof computeFnf>; defaults: ReturnType<typeof defaultTexts>;
  communication: { id: string; channel: string; to_address: string | null; subject: string | null; body: string; status: string; error: string | null; sent_by: string | null; sent_at: string }[];
  loans: { id: string; amount: number; kind: string; reason: string | null; months: number | null; from_month: string | null; status: string; requested_at: string; decided_at: string | null; decision_note: string | null }[];
  person: { phone: string | null; personal_email: string | null; email: string | null; company_mobile: string | null; drive_folder: string | null; drive_folder_name: string | null; bank: string | null; account: string | null; ifsc: string | null } | null;
}
type Tab = "details" | DocKey | "communication";

function Settlement({ id, who, isOwner, onBack }: { id: string; who: string; isOwner: boolean; onBack: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [tab, setTab] = useState<Tab>("details");
  const [msg, setMsg] = useState("");
  const [html, setHtml] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try { const j = await api.get(`/api/hrms/fnf?id=${encodeURIComponent(id)}`); setD(j); setHtml({}); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!DOCS.some((x) => x.key === tab) || html[tab]) return;
    api.get(`/api/hrms/fnf?id=${encodeURIComponent(id)}&doc=${tab}`).then((j) => setHtml((h) => ({ ...h, [tab]: j.html }))).catch(() => {});
  }, [tab, id, html]);

  const save = async (patch: Record<string, unknown>, label = "Saved") => {
    setMsg("");
    try { await api.post("/api/hrms/fnf", { action: "save", id, patch }); await load(); setMsg(`${label} ✓`); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  };
  const setStatus = async (status: string) => {
    if (status === "Closed" && !window.confirm(`Close this settlement?\n\nThe record will be marked Left as of the exit date (an edit awaiting approval).`)) return;
    setMsg("");
    try { await api.post("/api/hrms/fnf", { action: "status", id, status }); await load(); setMsg(`Now ${status} ✓`); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  };

  if (!d) return <Pane title="Full and Final Settlement" who={who}><div className="text-sm py-6 text-center" style={{ color: C.faint }}>{msg || "loading…"}</div></Pane>;
  const r = d.row, st = d.statement;
  const tone = STATUS_TONE[r.status] || STATUS_TONE.Open;
  const done = (r.checklist || []).filter((c) => c.done).length;

  const TabBtn = ({ k, label }: { k: Tab; label: string }) => (
    <button onClick={() => setTab(k)} className="text-xs font-bold rounded px-2.5 py-1.5" style={tab === k ? { background: "#16232F", color: "#fff" } : { color: "#5B6B7A" }}>{label}</button>
  );

  return (
    <Pane title={`F&F — ${r.name}`} who={who} print
      blurb={`${r.fnf_no || ""} · Employee ID ${r.employee_id} · ${r.designation || "—"} · ${r.department || "—"} · ${r.emp_type || "—"} · joined ${day(r.doj)}`}
      tools={<div className="flex items-center gap-2 no-print">
        <span className="rounded px-2 py-1 font-bold text-xs" style={{ background: tone.bg, color: tone.fg }}>{r.status}</span>
        <select value={r.status} onChange={(e) => setStatus(e.target.value)} className="text-xs rounded px-2 py-1.5 bg-white" style={{ border: `1px solid ${C.line}` }}>
          {FNF_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={onBack} className="text-xs font-semibold rounded border px-3 py-1.5 bg-white" style={{ borderColor: C.line, color: C.dim }}>‹ All settlements</button>
      </div>}>
      {msg && <div className="text-xs font-semibold mb-2" style={{ color: msg.includes("✓") ? C.green : C.red }}>{msg}</div>}

      {/* the money at a glance */}
      <div className="flex gap-2 flex-wrap mb-3">
        {[["Earnings", inr(st.totalEarn), C.green], ["Deductions", inr(st.totalDed), C.red], [st.net >= 0 ? "Net payable" : "Net recoverable", inr(Math.abs(st.net)), "#1B3A5C"], ["Checklist", `${done}/${(r.checklist || []).length}`, done === (r.checklist || []).length ? C.green : C.dim], ["Exit", day(r.exit_date), C.ink], ["F&F on", day(r.fnf_call_date), C.ink]].map(([l, v, c]) => (
          <div key={l} className="bg-white rounded-lg border px-3 py-2" style={{ borderColor: C.line, minWidth: 130 }}>
            <div className="font-bold" style={{ fontSize: 18, color: c as string }}>{v}</div><div className="text-xs" style={{ color: C.faint }}>{l}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-1 flex-wrap px-2 pt-2 pb-1 mb-3 rounded no-print" style={{ background: "#EAE7DF" }}>
        <TabBtn k="details" label="Dates & money" />
        {DOCS.map((x) => <TabBtn key={x.key} k={x.key} label={`${x.n} · ${x.label}`} />)}
        <TabBtn k="communication" label="Communication" />
      </div>

      {tab === "details" && <Details r={r} save={save} isOwner={isOwner} person={d.person} />}
      {tab === "checklist" && <Checklist id={id} r={r} reload={load} save={save} html={html.checklist} />}
      {tab === "calculation" && <Calculation r={r} st={st} save={save} html={html.calculation} id={id} />}
      {(tab === "resignation" || tab === "acceptance" || tab === "relieving") && (
        <LetterTab id={id} r={r} which={tab} defaults={d.defaults} save={save} html={html[tab]} />
      )}
      {tab === "letter" && (
        <>
          <div className="bg-white rounded-lg border p-3 mb-3" style={{ borderColor: C.line }}>
            <div className="text-xs font-bold mb-2" style={{ color: C.faint }}>PAYMENT DETAILS — printed on the letter</div>
            <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
              <label className="text-xs" style={{ color: C.dim }}>Paid by
                <select defaultValue={r.payment_mode || ""} onChange={(e) => save({ payment_mode: e.target.value }, "Payment mode")} style={{ ...inp, marginTop: 2 }}>
                  <option value="">—</option><option>Bank transfer (NEFT)</option><option>Bank transfer (RTGS)</option><option>Cheque</option><option>Cash</option><option>UPI</option>
                </select>
              </label>
              <label className="text-xs" style={{ color: C.dim }}>Reference / UTR<input defaultValue={r.payment_ref || ""} onBlur={(e) => e.target.value !== (r.payment_ref || "") && save({ payment_ref: e.target.value }, "Reference")} style={{ ...inp, marginTop: 2 }} /></label>
              <label className="text-xs" style={{ color: C.dim }}>Paid on<input type="date" defaultValue={r.payment_date || ""} onBlur={(e) => e.target.value !== (r.payment_date || "") && save({ payment_date: e.target.value }, "Payment date")} style={{ ...inp, marginTop: 2 }} /></label>
              <label className="text-xs" style={{ color: C.dim }}>Amount paid ₹<input type="number" defaultValue={r.paid_amount ?? Math.abs(st.net)} onBlur={(e) => Number(e.target.value) !== (r.paid_amount ?? -1) && save({ paid_amount: e.target.value }, "Amount")} style={{ ...inp, marginTop: 2 }} /></label>
            </div>
            {d.person && (d.person.bank || d.person.account) && <div className="text-xs mt-2" style={{ color: C.faint }}>On record: {d.person.bank || "—"} · A/c {d.person.account || "—"} · IFSC {d.person.ifsc || "—"}</div>}
          </div>
          <Preview id={id} doc="letter" html={html.letter} />
        </>
      )}
      {tab === "communication" && <Comms id={id} d={d} />}
    </Pane>
  );
}

function Preview({ id, doc, html }: { id: string; doc: DocKey; html?: string }) {
  return (
    <div className="bg-white rounded-lg border" style={{ borderColor: C.line }}>
      <div className="px-3 py-2 flex items-center gap-2 no-print" style={{ borderBottom: `1px solid ${C.line}` }}>
        <span className="text-xs font-bold" style={{ color: C.faint }}>PREVIEW</span><span style={{ flex: 1 }} />
        <a href={`/hrms/fnf/${id}/print?doc=${doc}`} target="_blank" rel="noopener noreferrer" className="text-xs font-bold rounded px-3 py-1.5" style={{ background: "#16232F", color: "#fff" }}>🖨 Open for paper / PDF</a>
      </div>
      <div className="p-4" style={{ overflowX: "auto" }}>
        {html ? <div dangerouslySetInnerHTML={{ __html: html }} /> : <div className="text-xs" style={{ color: C.faint }}>rendering…</div>}
      </div>
    </div>
  );
}

function Details({ r, save, person }: { r: FnfRow; save: (p: Record<string, unknown>, l?: string) => Promise<void>; isOwner: boolean; person: Detail["person"] }) {
  const D = ({ k, label, type = "text", hint }: { k: keyof FnfRow; label: string; type?: string; hint?: string }) => (
    <label className="text-xs" style={{ color: C.dim }} title={hint}>{label}
      <input type={type} defaultValue={r[k] == null ? "" : String(r[k])} onBlur={(e) => { const v = e.target.value; if (v !== (r[k] == null ? "" : String(r[k]))) save({ [k]: v }, label); }} style={{ ...inp, marginTop: 2 }} />
    </label>
  );
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
      <div className="bg-white rounded-lg border p-3" style={{ borderColor: C.line }}>
        <div className="text-xs font-bold mb-2" style={{ color: C.faint }}>DATES</div>
        <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <D k="done_on" label="Done on" type="date" /><D k="resignation_date" label="Resignation letter date" type="date" />
          <D k="exit_date" label="Exit date" type="date" /><D k="fnf_call_date" label="Calling for F&F date" type="date" />
          <D k="notice_days" label="Notice period (days)" type="number" /><D k="paid_days" label="Days paid in exit month" type="number" hint="Blank = the day of the month of the exit date" />
          <div style={{ gridColumn: "1 / -1" }}><D k="reason" label="Reason for leaving" /></div>
        </div>
        <div className="text-xs font-bold mt-3 mb-2" style={{ color: C.faint }}>MONEY HR ENTERS</div>
        <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <D k="loan_closing" label="Loan closing balance ₹" type="number" /><D k="pending_expenses" label="Pending expenses ₹" type="number" />
          <D k="tds_year" label="TDS of the year ₹" type="number" /><D k="advance_paid" label="Advance paid ₹" type="number" hint="Already paid — recovered" />
          <D k="advance_to_pay" label="Advance to be paid ₹" type="number" hint="Still to be paid — added" />
        </div>
      </div>
      <div className="bg-white rounded-lg border p-3" style={{ borderColor: C.line }}>
        <div className="text-xs font-bold mb-2" style={{ color: C.faint }}>FROM THE RECORD — the day the settlement opened; edit if the record was stale</div>
        <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <D k="last_gross" label="Last gross / month ₹" type="number" /><D k="basic_da" label="Basic & DA / month ₹" type="number" />
          <D k="leave_balance" label="Leave balance (days)" type="number" /><D k="gratuity_years" label="Years for gratuity" type="number" />
          <D k="designation" label="Designation" /><D k="department" label="Department" />
          <D k="emp_type" label="Type" hint="Management and contract types carry no PF/PT" />
        </div>
        {person && (
          <div className="text-xs mt-3" style={{ color: C.dim, lineHeight: 1.7 }}>
            <div className="font-bold" style={{ color: C.faint }}>CONTACT ON RECORD</div>
            Personal mobile <b>{person.phone || "—"}</b> · Company mobile <b>{person.company_mobile || "—"}</b><br />
            Personal e-mail <b>{person.personal_email || "—"}</b> · Work e-mail <b>{person.email || "—"}</b><br />
            {person.drive_folder ? <a href={person.drive_folder} target="_blank" rel="noopener noreferrer" style={{ color: "#1B3A5C", textDecoration: "underline" }}>{person.drive_folder_name || "Drive folder"}</a> : "No Drive folder on record"}
            {person.drive_folder_name && /^\s*active/i.test(person.drive_folder_name) && <span style={{ color: C.red }}> — rename to Inactive - … before closing</span>}
          </div>
        )}
        <div className="text-xs mt-3" style={{ color: C.faint }}>Every field saves when you leave it. Opening the settlement put the person on Notice Period with the leaving date, as record edits awaiting approval.</div>
      </div>
    </div>
  );
}

function Checklist({ id, r, reload, save, html }: { id: string; r: FnfRow; reload: () => Promise<void>; save: (p: Record<string, unknown>, l?: string) => Promise<void>; html?: string }) {
  const [msg, setMsg] = useState("");
  const [newItem, setNewItem] = useState("");
  const tick = async (i: number, done: boolean) => { try { await api.post("/api/hrms/fnf", { action: "check", id, i, done }); await reload(); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } };
  const remark = async (i: number, remarks: string) => { try { await api.post("/api/hrms/fnf", { action: "check", id, i, remarks }); await reload(); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } };
  const add = async () => { const item = newItem.trim(); if (!item) return; await save({ checklist: [...(r.checklist || []), { item, done: false, remarks: "" } as CheckItem] }, "Line added"); setNewItem(""); };
  const remove = async (i: number) => { if (!window.confirm("Remove this line?")) return; await save({ checklist: (r.checklist || []).filter((_, k) => k !== i) }, "Line removed"); };
  return (
    <>
      {msg && <div className="text-xs font-semibold mb-2" style={{ color: C.red }}>{msg}</div>}
      <div className="bg-white rounded-lg border mb-3" style={{ borderColor: C.line }}>
        <table className="w-full" style={{ fontSize: 12.5, borderCollapse: "collapse" }}>
          <thead><tr style={{ color: C.faint, fontSize: 11 }}>
            <th className="px-2 py-1.5 text-left" style={{ borderBottom: `1px solid ${C.line}`, width: 28 }}>#</th>
            <th className="px-2 py-1.5 text-left" style={{ borderBottom: `1px solid ${C.line}` }}>Closing activity</th>
            <th className="px-2 py-1.5 text-center" style={{ borderBottom: `1px solid ${C.line}`, width: 60 }}>Done</th>
            <th className="px-2 py-1.5 text-left" style={{ borderBottom: `1px solid ${C.line}`, width: "36%" }}>Remarks</th>
            <th className="px-2 py-1.5 text-left" style={{ borderBottom: `1px solid ${C.line}`, width: 120 }}>By</th>
            <th style={{ borderBottom: `1px solid ${C.line}`, width: 28 }} />
          </tr></thead>
          <tbody>
            {(r.checklist || []).map((c, i) => (
              <tr key={i} style={{ borderTop: "1px solid #EEECE6", background: c.done ? "#F6FBF7" : "#fff" }}>
                <td className="px-2 py-1.5" style={{ color: C.faint }}>{i + 1}</td>
                <td className="px-2 py-1.5" style={{ textDecoration: c.done ? "line-through" : "none", color: c.done ? C.faint : C.ink }}>{c.item}</td>
                <td className="px-2 py-1.5 text-center"><input type="checkbox" checked={!!c.done} onChange={(e) => tick(i, e.target.checked)} style={{ accentColor: C.green, width: 15, height: 15 }} /></td>
                <td className="px-2 py-1.5"><input defaultValue={c.remarks || ""} placeholder="remark…" onBlur={(e) => e.target.value !== (c.remarks || "") && remark(i, e.target.value)} style={{ ...inp, padding: "3px 6px", fontSize: 12 }} /></td>
                <td className="px-2 py-1.5" style={{ fontSize: 11, color: C.faint }}>{c.by ? String(c.by).split("·")[0].trim() : ""}{c.at ? ` · ${dmy(c.at)}` : ""}</td>
                <td className="px-1 py-1.5 text-center"><button onClick={() => remove(i)} style={{ color: "#B8B5AC" }} title="Remove this line">✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-2 py-2 flex gap-2 no-print" style={{ borderTop: `1px solid ${C.line}` }}>
          <input value={newItem} onChange={(e) => setNewItem(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="another closing activity…" style={{ ...inp, flex: 1 }} />
          <button onClick={add} className="text-xs font-bold rounded px-3 py-1.5" style={{ background: "#1B3A5C", color: "#fff" }}>+ Add line</button>
        </div>
      </div>
      <div className="bg-white rounded-lg border p-3 mb-3" style={{ borderColor: C.line }}>
        <div className="text-xs font-bold mb-1" style={{ color: C.faint }}>OVERALL REMARKS</div>
        <textarea defaultValue={r.remarks || ""} rows={3} onBlur={(e) => e.target.value !== (r.remarks || "") && save({ remarks: e.target.value }, "Remarks")} style={{ ...inp, lineHeight: 1.6 }} />
      </div>
      <Preview id={id} doc="checklist" html={html} />
    </>
  );
}

function Calculation({ r, st, save, html, id }: { r: FnfRow; st: ReturnType<typeof computeFnf>; save: (p: Record<string, unknown>, l?: string) => Promise<void>; html?: string; id: string }) {
  const [earn, setEarn] = useState<Line[]>(r.other_earn || []);
  const [ded, setDed] = useState<Line[]>(r.other_ded || []);
  useEffect(() => { setEarn(r.other_earn || []); setDed(r.other_ded || []); }, [r]);
  const override = (key: string, v: string) => save({ overrides: { [key]: v === "" ? null : Number(v) } }, v === "" ? "Back to computed" : "Overridden");
  const Row = ({ l, ov }: { l: { key?: string; label: string; amount: number; basis: string; overridden?: boolean }; ov: boolean }) => (
    <tr style={{ borderTop: "1px solid #EEECE6" }}>
      <td className="px-2 py-1.5">{l.label}{l.overridden && <span className="ml-1 rounded px-1 font-bold" style={{ background: "#FFF3E8", color: C.orange, fontSize: 9.5 }}>AS ENTERED</span>}<br /><span style={{ fontSize: 11, color: C.faint }}>{l.basis}</span></td>
      <td className="px-2 py-1.5 text-right tnum font-semibold">{inr(l.amount)}</td>
      <td className="px-2 py-1.5">{ov && l.key && <input type="number" placeholder="override" defaultValue={l.overridden ? l.amount : ""} onBlur={(e) => { const v = e.target.value; if ((v === "" && l.overridden) || (v !== "" && Number(v) !== l.amount)) override(l.key!, v); }} style={{ ...inp, width: 110, padding: "3px 6px", fontSize: 12 }} title="Type a figure to use instead; clear it to go back to the computed one" />}</td>
    </tr>
  );
  const Extra = ({ list, set, key }: { list: Line[]; set: (l: Line[]) => void; key: "other_earn" | "other_ded" }) => (
    <div className="px-2 py-2" style={{ borderTop: `1px solid ${C.line}` }}>
      {list.map((l, i) => (
        <div key={i} className="flex gap-2 mb-1">
          <input value={l.label} placeholder="what" onChange={(e) => set(list.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} style={{ ...inp, flex: 1, padding: "3px 6px", fontSize: 12 }} />
          <input type="number" value={l.amount || ""} placeholder="₹" onChange={(e) => set(list.map((x, k) => (k === i ? { ...x, amount: Number(e.target.value) } : x)))} style={{ ...inp, width: 120, padding: "3px 6px", fontSize: 12 }} />
          <button onClick={() => set(list.filter((_, k) => k !== i))} style={{ color: "#B8B5AC" }}>✕</button>
        </div>
      ))}
      <div className="flex gap-2">
        <button onClick={() => set([...list, { label: "", amount: 0 }])} className="text-xs font-semibold" style={{ color: "#1B3A5C" }}>+ another line</button>
        {JSON.stringify(list) !== JSON.stringify(r[key] || []) && <button onClick={() => save({ [key]: list.filter((l) => l.label || l.amount) }, "Lines saved")} className="text-xs font-bold rounded px-2 py-0.5" style={{ background: C.green, color: "#fff" }}>Save lines</button>}
      </div>
    </div>
  );
  return (
    <>
      <div className="bg-white rounded-lg border mb-3" style={{ borderColor: C.line }}>
        <table className="w-full" style={{ fontSize: 12.5, borderCollapse: "collapse" }}>
          <thead><tr style={{ background: "#F4F2EC", fontWeight: 700 }}><td className="px-2 py-1.5">Earnings</td><td className="px-2 py-1.5 text-right">₹</td><td className="px-2 py-1.5" style={{ width: 130 }}>Override</td></tr></thead>
          <tbody>{st.earnings.map((l, i) => <Row key={i} l={l} ov />)}</tbody>
        </table>
        <Extra list={earn} set={setEarn} key="other_earn" />
        <table className="w-full" style={{ fontSize: 12.5, borderCollapse: "collapse" }}>
          <thead><tr style={{ background: "#F4F2EC", fontWeight: 700 }}><td className="px-2 py-1.5">Deductions</td><td className="px-2 py-1.5 text-right">₹</td><td className="px-2 py-1.5" style={{ width: 130 }}>Override</td></tr></thead>
          <tbody>{st.deductions.map((l, i) => <Row key={i} l={l} ov />)}</tbody>
        </table>
        <Extra list={ded} set={setDed} key="other_ded" />
        <div className="px-2 py-2 flex gap-4 justify-end font-bold" style={{ borderTop: `2px solid ${C.ink}`, fontSize: 13 }}>
          <span>Earnings {inr(st.totalEarn)}</span><span>Deductions {inr(st.totalDed)}</span>
          <span style={{ color: st.net >= 0 ? C.green : C.red }}>{st.net >= 0 ? "Net payable" : "Net recoverable"} {inr(Math.abs(st.net))}</span>
        </div>
      </div>
      <div className="text-xs mb-3" style={{ color: C.faint }}>Per day is gross ÷ 26 ({inr(st.perDay)}). Notice: {r.notice_days} days, {st.noticeServed ?? "—"} served, {st.noticeShort} short. Service {st.years.toFixed(1)} years.</div>
      <Preview id={id} doc="calculation" html={html} />
    </>
  );
}

function LetterTab({ id, r, which, defaults, save, html }: { id: string; r: FnfRow; which: "resignation" | "acceptance" | "relieving"; defaults: ReturnType<typeof defaultTexts>; save: (p: Record<string, unknown>, l?: string) => Promise<void>; html?: string }) {
  const key = `${which}_text` as const;
  const [v, setV] = useState(r[key] || defaults[which]);
  useEffect(() => { setV(r[key] || defaults[which]); }, [r, key, defaults, which]);
  const dirty = v !== (r[key] || defaults[which]);
  return (
    <>
      <div className="bg-white rounded-lg border p-3 mb-3" style={{ borderColor: C.line }}>
        <div className="text-xs font-bold mb-1" style={{ color: C.faint }}>{which === "resignation" ? "THE RESIGNATION AS RECEIVED — type or paste what the person wrote; the default is a standard wording" : "WORDING — saved as issued; the default is filled from the record"}</div>
        <textarea value={v} rows={14} onChange={(e) => setV(e.target.value)} style={{ ...inp, lineHeight: 1.6, fontFamily: "Georgia, serif" }} />
        <div className="flex gap-2 mt-1">
          <button onClick={() => save({ [key]: v }, "Wording saved")} disabled={!dirty} className="text-xs font-bold rounded px-3 py-1.5" style={{ background: dirty ? C.green : "#E2E0DA", color: dirty ? "#fff" : C.faint }}>Save wording</button>
          {r[key] && <button onClick={() => save({ [key]: "" }, "Back to the default")} className="text-xs font-semibold rounded border px-3 py-1.5 bg-white" style={{ borderColor: C.line, color: C.dim }}>Back to default</button>}
        </div>
      </div>
      <Preview id={id} doc={which} html={html} />
    </>
  );
}

function Comms({ id, d }: { id: string; d: Detail }) {
  const [wa, setWa] = useState<{ messages: { at: string; from_me: boolean; text: string; status: string | null }[]; why?: string; phone?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const pull = async () => {
    setBusy(true);
    try { setWa(await api.get(`/api/hrms/fnf?id=${encodeURIComponent(id)}&wa=1`)); }
    catch (e) { setWa({ messages: [], why: e instanceof Error ? e.message : String(e) }); }
    finally { setBusy(false); }
  };
  const tone = (s: string) => (s === "sent" ? C.green : s === "failed" ? C.red : C.dim);
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
      <div>
        <div className="bg-white rounded-lg border p-3 mb-3" style={{ borderColor: C.line }}>
          <div className="text-xs font-bold mb-2" style={{ color: C.faint }}>WHAT HRMS SENT · personal {d.person?.personal_email || "—"} · work {d.person?.email || "—"}</div>
          {d.communication.length === 0 && <div className="text-xs" style={{ color: C.faint }}>Nothing sent from HRMS yet. The record&apos;s Communication tab writes to the person.</div>}
          {d.communication.map((c) => (
            <div key={c.id} className="py-1.5 text-xs" style={{ borderTop: "1px solid #EEECE6" }}>
              <span className="rounded px-1.5 py-0.5 font-bold" style={{ background: tone(c.status), color: "#fff", fontSize: 10 }}>{c.status}</span>{" "}
              <b>{c.subject || "(no subject)"}</b> <span style={{ color: C.faint }}>→ {c.to_address || c.channel} · {fmtFull(String(c.sent_at))} · {String(c.sent_by || "").split("·")[0].trim()}</span>
              <div style={{ color: C.dim, whiteSpace: "pre-wrap", marginTop: 2 }}>{c.body.replace(/<[^>]+>/g, "").slice(0, 400)}</div>
            </div>
          ))}
        </div>
        <div className="bg-white rounded-lg border p-3" style={{ borderColor: C.line }}>
          <div className="text-xs font-bold mb-2" style={{ color: C.faint }}>LOANS ON RECORD</div>
          {d.loans.length === 0 && <div className="text-xs" style={{ color: C.faint }}>No loan rows in HRMS.</div>}
          {d.loans.map((l) => (
            <div key={l.id} className="py-1 text-xs" style={{ borderTop: "1px solid #EEECE6" }}>
              <b>{inr(l.amount)}</b> {l.kind} · {l.status} · {l.months ? `${l.months} months` : ""} {l.from_month ? `from ${l.from_month}` : ""} <span style={{ color: C.faint }}>· {fmtFull(String(l.requested_at))}</span>
              {l.reason && <div style={{ color: C.dim }}>{l.reason}</div>}
            </div>
          ))}
        </div>
      </div>
      <div className="bg-white rounded-lg border p-3" style={{ borderColor: C.line }}>
        <div className="flex items-center gap-2 mb-2">
          <div className="text-xs font-bold" style={{ color: C.faint }}>WHATSAPP ON THE PERSONAL MOBILE · {d.person?.phone || "none on record"}</div>
          <span style={{ flex: 1 }} />
          <button onClick={pull} disabled={busy || !d.person?.phone} className="text-xs font-bold rounded px-3 py-1.5" style={{ background: "#0F766E", color: "#fff", opacity: busy || !d.person?.phone ? 0.6 : 1 }}>{busy ? "Pulling…" : "⟳ Pull WhatsApp"}</button>
        </div>
        {!wa && <div className="text-xs" style={{ color: C.faint }}>Reads the thread between HR&apos;s WhatsApp number and this person through Periskope. Nothing is stored here; it is read each time.</div>}
        {wa?.why && <div className="text-xs rounded p-2" style={{ background: "#FFF7E6", color: "#8A5B00" }}>{wa.why}</div>}
        {wa && !wa.why && wa.messages.length === 0 && <div className="text-xs" style={{ color: C.faint }}>No messages on {wa.phone}.</div>}
        {wa?.messages.map((m, i) => (
          <div key={i} className="mb-1.5" style={{ display: "flex", justifyContent: m.from_me ? "flex-end" : "flex-start" }}>
            <div className="rounded px-2 py-1" style={{ maxWidth: "85%", background: m.from_me ? "#DCF8C6" : "#F4F2EC", fontSize: 12.5 }}>
              <div style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>
              <div style={{ fontSize: 10, color: C.faint, textAlign: "right" }}>{m.at ? new Date(/^\d+$/.test(m.at) ? Number(m.at) * (m.at.length <= 10 ? 1000 : 1) : m.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: false }) : ""}{m.status ? ` · ${m.status}` : ""}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
