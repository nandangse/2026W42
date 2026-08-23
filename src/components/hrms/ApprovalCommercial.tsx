"use client";
/**
 * Approvals → RJ Approval - Commercial. The money desk.
 *
 * Two things carry money and are not real until the owner says so: what a
 * person will be PAID (the appraisal decision, proposed by HR on the Report
 * Card) and what the company LENDS them. Both are here, waiting on one side
 * and settled on the other — because an empty queue tells you nothing about
 * what was agreed, and "when was it asked, when was it approved" is what
 * this screen gets asked a month later.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { fmtFull } from "@/lib/schedule";
import { Pane } from "./Pane";
import { C } from "./RecordFields";

interface SalaryRow { id: string; name: string; department: string | null; prev: number | null; next: number | null; asked: string | null; approved: string | null; by: string | null; approvedBy: string | null; note: string | null }
interface LoanRow { id: string; employee_id: string; name: string; department: string | null; amount: number | null; kind: string; reason: string | null; months: number | null; from_month: string | null; status: string; asked: string | null; approved: string | null; by: string | null; approvedBy: string | null; note: string | null }

const inr = (n: number | null | undefined) => (n == null ? "—" : Math.round(n).toLocaleString("en-IN"));
const day = (iso: string | null) => (iso ? fmtFull(String(iso).slice(0, 10)) : "—");
const who = (s: string | null) => String(s || "—").split("·")[0].trim();

export default function ApprovalCommercial({ who: me, isOwner }: { who: string; isOwner: boolean }) {
  const [d, setD] = useState<{ salaryWaiting: SalaryRow[]; salaryDone: SalaryRow[]; loansWaiting: LoanRow[]; loansDone: LoanRow[]; needsMigration?: boolean; needsLoanMigration?: boolean } | null>(null);
  const [tab, setTab] = useState<"waiting" | "done">("waiting");
  const [pickS, setPickS] = useState<Record<string, boolean>>({});
  const [pickL, setPickL] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [raise, setRaise] = useState(false);

  const load = useCallback(async () => {
    try { setD(await api.get("/api/hrms/commercial")); setPickS({}); setPickL({}); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (body: Record<string, unknown>, label: string) => {
    setBusy(true); setMsg("");
    try { const j = await api.post("/api/hrms/commercial", body); setMsg(`${label} — ${j.n ?? ""} done ✓`); await load(); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };

  const sChosen = useMemo(() => Object.keys(pickS).filter((k) => pickS[k]), [pickS]);
  const lChosen = useMemo(() => Object.keys(pickL).filter((k) => pickL[k]), [pickL]);
  const waitingN = (d?.salaryWaiting.length || 0) + (d?.loansWaiting.length || 0);

  return (
    <Pane title="RJ Approval - Commercial" who={me} print
      blurb="Anything with money attached that needs the owner's word: what a person will be paid, and what the company lends them.">
      {msg && <div className="text-xs font-semibold mb-2" style={{ color: msg.includes("✓") ? C.green : C.red }}>{msg}</div>}
      {d?.needsMigration && <Warn t="Run migrations 0061–0063 — salary decisions have nowhere to live yet." />}
      {d?.needsLoanMigration && <Warn t="Run migration 0064 — loan requests have nowhere to live yet." />}

      <div className="flex gap-1.5 mb-3 no-print">
        {(["waiting", "done"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className="rounded px-3 py-1.5 font-bold" style={{ fontSize: 12.5, background: tab === t ? C.orange : "#fff", color: tab === t ? "#fff" : C.dim, border: `1px solid ${tab === t ? C.orange : C.line}` }}>
            {t === "waiting" ? `Waiting${waitingN ? ` (${waitingN})` : ""}` : `Completed (${(d?.salaryDone.length || 0) + (d?.loansDone.length || 0)})`}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={() => setRaise((v) => !v)} className="rounded px-3 py-1.5 font-bold"
          style={{ fontSize: 12.5, background: "#fff", color: C.dim, border: `1px solid ${C.line}` }}>
          {raise ? "✕ Close" : "+ Raise a loan request"}
        </button>
      </div>

      {raise && <RaiseLoan onDone={() => { setRaise(false); load(); }} />}

      {tab === "waiting" ? (
        <>
          <Block title={`Salary decisions waiting (${d?.salaryWaiting.length || 0})`}
            note="Proposed by HR on the Individual Report Card. The number is already in the record; approving is what makes it the agreed figure.">
            {!d?.salaryWaiting.length ? <Empty t="No salary decision is waiting." /> : (
              <>
                <table className="w-full" style={{ fontSize: 12.5, borderCollapse: "collapse" }}>
                  <thead><tr style={{ color: C.faint, fontSize: 11 }}>
                    {["", "Person", "Department", "Previous", "New", "Increase", "Asked date", "By", ""].map((h, i) => (
                      <th key={i} className="text-left px-1.5 py-1" style={{ borderBottom: `1px solid ${C.line}` }}>{h}</th>))}
                  </tr></thead>
                  <tbody>{d.salaryWaiting.map((r) => {
                    const inc = r.prev != null && r.next != null ? r.next - r.prev : null;
                    return (
                      <tr key={r.id} style={{ borderBottom: "1px solid #F2F0EA" }}>
                        <td className="px-1.5 py-1"><input type="checkbox" checked={!!pickS[r.id]} onChange={(e) => setPickS((p) => ({ ...p, [r.id]: e.target.checked }))} /></td>
                        <td className="px-1.5 py-1 font-semibold">{r.id} · {r.name}</td>
                        <td className="px-1.5 py-1">{r.department}</td>
                        <td className="px-1.5 py-1 tnum">₹{inr(r.prev)}</td>
                        <td className="px-1.5 py-1 tnum font-bold" style={{ color: C.green }}>₹{inr(r.next)}</td>
                        <td className="px-1.5 py-1 tnum">{inc == null ? "—" : <span style={{ color: inc >= 0 ? C.green : C.red }}>{inc >= 0 ? "+" : "−"}₹{inr(Math.abs(inc))}{r.prev ? ` (${((inc / r.prev) * 100).toFixed(1)}%)` : ""}</span>}</td>
                        <td className="px-1.5 py-1">{day(r.asked)}</td>
                        <td className="px-1.5 py-1">{who(r.by)}</td>
                        <td className="px-1.5 py-1">
                          {isOwner && <button onClick={() => act({ action: "salary-approve", ids: [r.id] }, `${r.name} finalised`)} disabled={busy}
                            className="rounded px-2 py-1 font-bold" style={{ background: C.green, color: "#fff", fontSize: 11 }}>✓ Finalise</button>}
                        </td>
                      </tr>
                    );
                  })}</tbody>
                </table>
                {isOwner && (
                  <div className="flex gap-2 mt-2 no-print">
                    <button onClick={() => act({ action: "salary-approve", ids: sChosen }, "Finalised")} disabled={busy || !sChosen.length}
                      className="rounded px-3 py-1.5 font-bold" style={{ background: sChosen.length ? C.green : "#E2E0DA", color: sChosen.length ? "#fff" : "#8A94A0", fontSize: 12.5 }}>
                      ✓ Finalise ticked ({sChosen.length})
                    </button>
                    <button onClick={() => { if (window.confirm(`Finalise every waiting salary decision — ${d.salaryWaiting.length}?`)) act({ action: "salary-approve", all: true }, "Finalised everything"); }} disabled={busy}
                      className="rounded px-3 py-1.5 font-bold" style={{ background: "#fff", color: C.dim, border: `1px solid ${C.line}`, fontSize: 12.5 }}>
                      Select all & finalise
                    </button>
                  </div>
                )}
              </>
            )}
          </Block>

          <Block title={`Loan requests waiting (${d?.loansWaiting.length || 0})`}
            note="A loan or salary advance asked for by, or on behalf of, one person. Approving fixes the amount and the repayment.">
            {!d?.loansWaiting.length ? <Empty t="No loan request is waiting." /> : (
              <>
                <table className="w-full" style={{ fontSize: 12.5, borderCollapse: "collapse" }}>
                  <thead><tr style={{ color: C.faint, fontSize: 11 }}>
                    {["", "Person", "Kind", "Amount", "Repay over", "From", "Reason", "Asked date", "By", ""].map((h, i) => (
                      <th key={i} className="text-left px-1.5 py-1" style={{ borderBottom: `1px solid ${C.line}` }}>{h}</th>))}
                  </tr></thead>
                  <tbody>{d.loansWaiting.map((r) => (
                    <tr key={r.id} style={{ borderBottom: "1px solid #F2F0EA" }}>
                      <td className="px-1.5 py-1"><input type="checkbox" checked={!!pickL[r.id]} onChange={(e) => setPickL((p) => ({ ...p, [r.id]: e.target.checked }))} /></td>
                      <td className="px-1.5 py-1 font-semibold">{r.employee_id} · {r.name}</td>
                      <td className="px-1.5 py-1">{r.kind}</td>
                      <td className="px-1.5 py-1 tnum font-bold">₹{inr(r.amount)}</td>
                      <td className="px-1.5 py-1 tnum">{r.months ? `${r.months} months (₹${inr((r.amount || 0) / r.months)}/mo)` : "—"}</td>
                      <td className="px-1.5 py-1">{r.from_month || "—"}</td>
                      <td className="px-1.5 py-1" style={{ maxWidth: 220 }}>{r.reason || "—"}</td>
                      <td className="px-1.5 py-1">{day(r.asked)}</td>
                      <td className="px-1.5 py-1">{who(r.by)}</td>
                      <td className="px-1.5 py-1 whitespace-nowrap">
                        {isOwner && <>
                          <button onClick={() => act({ action: "loan-decide", ids: [r.id], decision: "Approved" }, "Approved")} disabled={busy}
                            className="rounded px-2 py-1 font-bold mr-1" style={{ background: C.green, color: "#fff", fontSize: 11 }}>✓ Approve</button>
                          <button onClick={() => { if (window.confirm(`Decline ${r.name}'s request for ₹${inr(r.amount)}?`)) act({ action: "loan-decide", ids: [r.id], decision: "Declined" }, "Declined"); }} disabled={busy}
                            className="rounded px-2 py-1 font-bold" style={{ background: "#fff", color: C.red, border: `1px solid ${C.line}`, fontSize: 11 }}>Decline</button>
                        </>}
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
                {isOwner && lChosen.length > 0 && (
                  <button onClick={() => act({ action: "loan-decide", ids: lChosen, decision: "Approved" }, "Approved")} disabled={busy}
                    className="rounded px-3 py-1.5 font-bold mt-2 no-print" style={{ background: C.green, color: "#fff", fontSize: 12.5 }}>
                    ✓ Approve ticked ({lChosen.length})
                  </button>
                )}
              </>
            )}
          </Block>
        </>
      ) : (
        <Block title="Completed" note="What was decided, when it was asked, and when it was agreed.">
          {!(d?.salaryDone.length || d?.loansDone.length) ? <Empty t="Nothing has been decided on this desk yet." /> : (
            <table className="w-full" style={{ fontSize: 12.5, borderCollapse: "collapse" }}>
              <thead><tr style={{ color: C.faint, fontSize: 11 }}>
                {["What", "Person", "Amount", "Asked date", "Approved date", "Raised by", "Approved by"].map((h) => (
                  <th key={h} className="text-left px-1.5 py-1" style={{ borderBottom: `1px solid ${C.line}` }}>{h}</th>))}
              </tr></thead>
              <tbody>
                {(d?.salaryDone || []).map((r) => (
                  <tr key={`s${r.id}`} style={{ borderBottom: "1px solid #F2F0EA" }}>
                    <td className="px-1.5 py-1"><Chip t="Salary" c="#1B3A5C" /></td>
                    <td className="px-1.5 py-1 font-semibold">{r.id} · {r.name}</td>
                    <td className="px-1.5 py-1 tnum">₹{inr(r.prev)} → <b style={{ color: C.green }}>₹{inr(r.next)}</b></td>
                    <td className="px-1.5 py-1">{day(r.asked)}</td>
                    <td className="px-1.5 py-1 font-semibold" style={{ color: C.green }}>{day(r.approved)}</td>
                    <td className="px-1.5 py-1">{who(r.by)}</td>
                    <td className="px-1.5 py-1">{who(r.approvedBy)}</td>
                  </tr>
                ))}
                {(d?.loansDone || []).map((r) => (
                  <tr key={`l${r.id}`} style={{ borderBottom: "1px solid #F2F0EA" }}>
                    <td className="px-1.5 py-1"><Chip t={r.status === "Declined" ? "Loan · declined" : "Loan"} c={r.status === "Declined" ? "#B3392E" : "#8A5B00"} /></td>
                    <td className="px-1.5 py-1 font-semibold">{r.employee_id} · {r.name}</td>
                    <td className="px-1.5 py-1 tnum">₹{inr(r.amount)}{r.months ? ` over ${r.months} mo` : ""}</td>
                    <td className="px-1.5 py-1">{day(r.asked)}</td>
                    <td className="px-1.5 py-1 font-semibold" style={{ color: r.status === "Declined" ? C.red : C.green }}>{day(r.approved)}</td>
                    <td className="px-1.5 py-1">{who(r.by)}</td>
                    <td className="px-1.5 py-1">{who(r.approvedBy)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Block>
      )}
    </Pane>
  );
}

function RaiseLoan({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ employee_id: "", amount: "", kind: "Salary Advance", months: "", from_month: "", reason: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const go = async () => {
    setBusy(true); setErr("");
    try { await api.post("/api/hrms/commercial", { action: "loan-raise", ...f }); onDone(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };
  const I = (k: keyof typeof f, label: string, w = 130, ph = "") => (
    <label style={{ fontSize: 11.5, color: C.faint }}>
      {label}
      <input value={f[k]} placeholder={ph} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))}
        className="rounded px-2 py-1.5 block" style={{ border: `1px solid ${C.line}`, width: w, fontSize: 13, color: C.ink }} />
    </label>
  );
  return (
    <div className="rounded-lg border p-3 mb-3" style={{ borderColor: C.line, background: "#FBFAF7" }}>
      <div className="font-bold mb-2" style={{ fontSize: 13 }}>Raise a loan request</div>
      <div className="flex gap-2 flex-wrap items-end">
        {I("employee_id", "EmployeeID", 100, "6001")}
        <label style={{ fontSize: 11.5, color: C.faint }}>Kind
          <select value={f.kind} onChange={(e) => setF((x) => ({ ...x, kind: e.target.value }))}
            className="rounded px-2 py-1.5 block bg-white" style={{ border: `1px solid ${C.line}`, fontSize: 13, color: C.ink }}>
            {["Salary Advance", "Personal Loan", "Medical", "Festival", "Other"].map((k) => <option key={k}>{k}</option>)}
          </select>
        </label>
        {I("amount", "Amount (Rs)", 110)}
        {I("months", "Repay over (months)", 110)}
        {I("from_month", "From", 110, "Sep 2026")}
        {I("reason", "Reason", 240)}
        <button onClick={go} disabled={busy} className="rounded px-3 py-1.5 font-bold"
          style={{ background: C.green, color: "#fff", fontSize: 12.5 }}>{busy ? "Saving…" : "Send to RJ"}</button>
      </div>
      {err && <div className="text-xs font-semibold mt-2" style={{ color: C.red }}>{err}</div>}
    </div>
  );
}

const Block = ({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) => (
  <div className="bg-white rounded-lg border mb-3" style={{ borderColor: C.line, borderTop: "3px solid #16232F" }}>
    <div className="px-3 pt-2.5 pb-1.5">
      <div className="font-bold" style={{ fontSize: 13.5 }}>{title}</div>
      {note && <div style={{ fontSize: 11, color: C.faint, lineHeight: 1.5 }}>{note}</div>}
    </div>
    <div className="px-3 pb-3" style={{ overflowX: "auto" }}>{children}</div>
  </div>
);
const Empty = ({ t }: { t: string }) => <div className="text-sm py-1" style={{ color: C.faint }}>{t}</div>;
const Warn = ({ t }: { t: string }) => <div className="rounded p-2 mb-2" style={{ background: "#FFF7E6", border: "1px solid #F5D9A8", fontSize: 12.5, color: "#8A5B00" }}>{t}</div>;
const Chip = ({ t, c }: { t: string; c: string }) => <span className="rounded px-1.5 py-0.5 font-bold" style={{ fontSize: 10, background: `${c}18`, color: c }}>{t}</span>;
