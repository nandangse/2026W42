"use client";
/**
 * SEVA → QUOTATION (Dr Raghu, 12 Oct 2026). "Can we pull quotations from erp
 * and see where its sent by Sarita, Yash, Aakash or the service team and
 * pull here. Updates also made here. Make a sub module called quotation."
 * And: "We can do the same quotation like in CRM so that Sarita can send
 * from here" — approved by the Service Manager first, then mailed with the
 * ERP's own PDF to the customer's remembered To, CC and BCC.
 *
 * The quotation itself is made and edited on the ERP (the number opens it
 * there); what is said about it — the follow-up — is made here.
 */
import { useEffect, useMemo, useState } from "react";

type Q = { erp_name: string; owner: string | null; sales_person: string | null; customer: string | null; quoted_on: string | null; valid_till: string | null; target_order_on: string | null; grand_total: number | null; base_grand_total: number | null; currency: string | null; status: string | null; docstatus: number | null; contact_person: string | null; contact_email: string | null; subject: string | null; last_status: string | null; importance: string | null; product_group: string | null; follow_status: string | null; next_action: string | null; next_on: string | null; updated_by: string | null; updated_at: string | null; erp?: Record<string, unknown> };
type Send = { id: string; erp_name: string; status: string; asked_by: string; asked_at: string; sent_at: string | null; mail_to: string[]; mail_cc?: string[]; mail_bcc?: string[]; subject?: string; print_format?: string | null; decided_by?: string | null; reject_note?: string | null; sent_from?: string | null; error?: string | null };
type Owner = { owner: string; open: number; openValue: number; due: number; total: number };
type List = { installed?: boolean; rows: Q[]; owners: Owner[]; sends: Send[]; today: string; erp_base: string | null; me: string; mayApprove: boolean };

const NAVY = "var(--navy)", MUTED = "var(--muted)", LINE = "var(--line)", ORANGE = "var(--accent)", GREEN = "var(--green)", RED = "var(--red)";
const who = (e?: string | null) => { const s = String(e || "").split("@")[0]; return s ? s.charAt(0).toUpperCase() + s.slice(1) : "—"; };
const dmy = (d?: string | null) => (d ? new Date(d.slice(0, 10) + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" }) : "—");
const inr = (n?: number | null) => (n === null || n === undefined ? "—" : "₹" + Math.round(n).toLocaleString("en-IN"));
const lakh = (n: number) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : `₹${(n / 1e5).toFixed(1)} L`);
const btn = (k: "primary" | "soft" | "ghost" = "soft"): React.CSSProperties => ({ borderRadius: 7, padding: "6px 12px", fontSize: 12.5, fontWeight: 700, border: k === "ghost" ? "none" : `1px solid ${k === "primary" ? "var(--accent)" : LINE}`, background: k === "primary" ? "var(--accent)" : "#fff", color: k === "primary" ? "#fff" : NAVY });
const inp: React.CSSProperties = { width: "100%", border: `1px solid ${LINE}`, borderRadius: 7, padding: "6px 9px", fontSize: 13, background: "#fff" };
const lbl: React.CSSProperties = { display: "block", fontSize: 10.5, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--dim)", marginBottom: 3 };
const statusColour = (s?: string | null) => (s === "Open" ? ORANGE : s === "Ordered" ? GREEN : s === "Lost" || s === "Cancelled" ? RED : MUTED);

async function api<T = Record<string, unknown>>(body: unknown): Promise<T> {
  const r = await fetch("/api/seva/quotes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Failed (${r.status})`);
  return j as T;
}

export default function SevaQuotes() {
  const [d, setD] = useState<List | null>(null);
  const [owner, setOwner] = useState<string>(""); const [show, setShow] = useState<"open" | "all" | "due">("open");
  const [q, setQ] = useState(""); const [open, setOpen] = useState<string | null>(null);
  const [pulling, setPulling] = useState<string | null>(null);
  const load = () => fetch("/api/seva/quotes", { cache: "no-store" }).then((r) => r.json()).then(setD).catch(() => setD({ rows: [], owners: [], sends: [], today: "", erp_base: null, me: "", mayApprove: false }));
  useEffect(() => { load(); }, []);
  const pull = async () => { setPulling("Reading the ERP…"); try { let n = 0; for (let i = 0; i < 6; i++) { const r = await api<{ written: number; done: boolean }>({ action: "pull" }); n += r.written; if (r.done) break; setPulling(`Reading the ERP… ${n}`); } setPulling(`${n} came in`); await load(); } catch (e) { setPulling(String((e as Error).message)); } setTimeout(() => setPulling(null), 4000); };
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase(); const today = d?.today || "";
    return (d?.rows || []).filter((r) => (!owner || r.owner === owner)
      && (show === "all" || (show === "open" ? r.status === "Open" && r.docstatus === 1 : !!r.next_on && r.next_on <= today && r.status === "Open"))
      && (!t || [r.erp_name, r.customer, r.subject, r.contact_person, r.contact_email, r.last_status].some((x) => String(x || "").toLowerCase().includes(t))));
  }, [d, owner, show, q]);
  const waiting = (d?.sends || []).filter((s) => s.status === "awaiting_approval" || s.status === "failed");
  if (!d) return <div className="text-sm" style={{ color: MUTED }}>Reading…</div>;
  if (d.installed === false) return <div className="text-sm font-bold" style={{ color: RED }}>Run migration 0225 first — the quotations have nowhere to live yet.</div>;
  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <h2 className="font-bold" style={{ fontSize: 20, color: NAVY }}>Quotation</h2>
        <span className="text-xs" style={{ color: MUTED }}>the service team&apos;s quotations off the ERP — made there, followed up here</span>
        <span className="ml-auto" />
        {pulling && <span className="text-xs" style={{ color: MUTED }}>{pulling}</span>}
        <button onClick={pull} disabled={!!pulling && pulling.startsWith("Reading")} style={btn()}>⟳ Pull from the ERP</button>
      </div>
      {d.rows.length === 0 && <div className="rounded-lg p-4 mb-3 text-sm" style={{ background: "#FFF7ED", border: "1px solid #FED7AA" }}>Nothing pulled yet — press <b>Pull from the ERP</b> once; after that the hour keeps it fresh.</div>}

      {waiting.length > 0 && (
        <div className="rounded-lg p-3 mb-3" style={{ background: "#FFF7ED", border: "1px solid #FED7AA" }}>
          <div className="font-bold text-sm mb-1" style={{ color: ORANGE }}>Waiting for the Service Manager · {waiting.length}</div>
          {waiting.map((s) => (
            <div key={s.id} className="text-xs flex items-center gap-2 py-0.5 flex-wrap">
              <button onClick={() => setOpen(s.erp_name)} className="font-bold hover:underline" style={{ color: NAVY }}>{s.erp_name}</button>
              <span style={{ color: MUTED }}>{who(s.asked_by)} asked to send to {s.mail_to.join(", ")}{s.status === "failed" ? " · the last try failed" : ""}</span>
            </div>
          ))}
        </div>
      )}

      {/* WAITING ON A PO, BY OWNER */}
      <div className="flex gap-2 flex-wrap mb-3">
        <button onClick={() => setOwner("")} className="rounded-lg px-3 py-2 text-left" style={{ background: owner === "" ? NAVY : "#fff", color: owner === "" ? "#fff" : NAVY, border: `1px solid ${LINE}`, minWidth: 120 }}>
          <div className="text-xs font-bold">Everyone</div>
          <div className="font-bold tnum" style={{ fontSize: 18 }}>{d.owners.reduce((a, o) => a + o.open, 0)} <span className="text-xs font-semibold">open</span></div>
          <div className="text-xs tnum" style={{ opacity: 0.75 }}>{lakh(d.owners.reduce((a, o) => a + o.openValue, 0))}</div>
        </button>
        {d.owners.map((o) => (
          <button key={o.owner} onClick={() => setOwner(o.owner === owner ? "" : o.owner)} className="rounded-lg px-3 py-2 text-left" style={{ background: owner === o.owner ? NAVY : "#fff", color: owner === o.owner ? "#fff" : NAVY, border: `1px solid ${LINE}`, minWidth: 120 }}>
            <div className="text-xs font-bold">{who(o.owner)}</div>
            <div className="font-bold tnum" style={{ fontSize: 18 }}>{o.open} <span className="text-xs font-semibold">waiting on a PO</span></div>
            <div className="text-xs tnum" style={{ opacity: 0.75 }}>{lakh(o.openValue)}{o.due ? <span style={{ color: owner === o.owner ? "#FED7AA" : RED, fontWeight: 800 }}> · {o.due} follow-up due</span> : null}</div>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-2">
        {([["open", "Open on the ERP"], ["due", "Follow-up due"], ["all", "All"]] as const).map(([k, l]) => <button key={k} onClick={() => setShow(k)} style={{ ...btn(show === k ? "primary" : "soft"), padding: "4px 10px" }}>{l}</button>)}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search number, customer, subject, contact…" style={{ ...inp, width: 280 }} />
        <span className="text-xs" style={{ color: MUTED }}>{rows.length} shown</span>
      </div>
      <div className="rounded-lg bg-white" style={{ border: `1px solid ${LINE}`, overflow: "auto", maxHeight: "68vh" }}>
        <table className="genie-table" style={{ minWidth: 1180 }}>
          <thead><tr><th style={{ position: "sticky", left: 0, zIndex: 3 }}>Quotation</th><th>Date</th><th>Customer</th><th>Subject</th><th className="tnum">Value</th><th>Owner</th><th>Sent to</th><th>ERP status</th><th>Last status (ERP)</th><th>Follow-up</th><th>Target order</th></tr></thead>
          <tbody>
            {rows.slice(0, 600).map((r) => (
              <tr key={r.erp_name} onClick={() => setOpen(r.erp_name)} style={{ cursor: "pointer" }}>
                <td className="font-bold" style={{ position: "sticky", left: 0, background: "#fff", color: NAVY, whiteSpace: "nowrap" }}>{r.erp_name.replace("NGSE/QTN/", "")}</td>
                <td className="tnum" style={{ whiteSpace: "nowrap" }}>{dmy(r.quoted_on)}</td>
                <td style={{ maxWidth: 220 }}>{r.customer}</td>
                <td style={{ maxWidth: 260 }} className="text-xs">{r.subject}</td>
                <td className="tnum" style={{ whiteSpace: "nowrap" }}>{inr(r.base_grand_total)}</td>
                <td>{who(r.owner)}</td>
                <td className="text-xs" style={{ maxWidth: 200 }}>{r.contact_person}{r.contact_email ? <div style={{ color: MUTED }}>{r.contact_email}</div> : null}</td>
                <td><span className="font-bold text-xs" style={{ color: statusColour(r.status) }}>{r.docstatus === 0 ? "Draft" : r.status}</span></td>
                <td className="text-xs" style={{ maxWidth: 180, color: MUTED }}>{r.last_status}</td>
                <td className="text-xs" style={{ whiteSpace: "nowrap" }}>{r.follow_status ? <b>{r.follow_status}</b> : <span style={{ color: MUTED }}>—</span>}{r.next_on ? <div style={{ color: r.next_on <= d.today ? RED : MUTED }}>next {dmy(r.next_on)}</div> : null}</td>
                <td className="tnum text-xs">{dmy(r.target_order_on)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={11} className="text-sm" style={{ color: MUTED, padding: 16 }}>Nothing here.</td></tr>}
          </tbody>
        </table>
      </div>
      {rows.length > 600 && <div className="text-xs mt-1" style={{ color: MUTED }}>Showing the newest 600 — search or pick an owner to narrow.</div>}
      {open && <QuoteBox name={open} onClose={() => { setOpen(null); load(); }} />}
    </div>
  );
}

type One = { quote: Q; notes: { id: string; body: string; follow_status: string | null; next_on: string | null; by: string; at: string }[]; sends: Send[]; contact: { mail_to: string[]; mail_cc: string[]; mail_bcc: string[] } | null; formats: string[]; follow: string[]; erp_base: string | null; me: string; mayApprove: boolean; approvers: string[] };

function QuoteBox({ name, onClose }: { name: string; onClose: () => void }) {
  const [d, setD] = useState<One | null>(null); const [err, setErr] = useState<string | null>(null);
  const [u, setU] = useState({ follow_status: "", next_action: "", next_on: "", body: "" });
  const [send, setSend] = useState<{ to: string; cc: string; bcc: string; subject: string; body_html: string; print_format: string } | null>(null);
  const [fmt, setFmt] = useState(""); const [busy, setBusy] = useState(false);
  const load = () => fetch(`/api/seva/quotes?name=${encodeURIComponent(name)}`, { cache: "no-store" }).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setD(j); setU({ follow_status: j.quote.follow_status || "", next_action: j.quote.next_action || "", next_on: j.quote.next_on || "", body: "" }); }).catch((e) => setErr(String(e.message || e)));
  useEffect(() => { load(); }, [name]); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (body: Record<string, unknown>, after?: () => void) => { setErr(null); setBusy(true); try { await api({ ...body, name }); after?.(); await load(); } catch (e) { setErr(String((e as Error).message)); } setBusy(false); };
  const startSend = () => {
    if (!d) return; const c = d.contact; const x = d.quote;
    setSend({
      to: (c?.mail_to?.length ? c.mail_to : x.contact_email ? [x.contact_email] : []).join(", "), cc: (c?.mail_cc || []).join(", "), bcc: (c?.mail_bcc || []).join(", "),
      subject: `Quotation ${x.erp_name}${x.subject ? ` — ${x.subject}` : ""}`,
      body_html: `<p>Dear ${x.contact_person ? x.contact_person.split(" ")[0] : "Sir / Madam"},</p><p>Please find attached our quotation ${x.erp_name}${x.subject ? ` for ${x.subject.replace(/^Quote for /i, "")}` : ""}.</p><p>We look forward to your purchase order. Do call us for anything you need.</p><p>Warm regards,<br/>Service team<br/>Nandan GSE Pvt Ltd</p>`,
      print_format: fmt,
    });
  };
  const x = d?.quote;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 50, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(860px, 100vw)", height: "100vh", overflowY: "auto", background: "var(--paper)", padding: 18, boxShadow: "-8px 0 30px rgba(0,0,0,.2)" }}>
        <div className="flex items-start gap-2 mb-2">
          <div className="flex-1 min-w-0">
            {d?.erp_base ? <a href={`${d.erp_base}/app/quotation/${encodeURIComponent(name)}`} target="_blank" rel="noreferrer" className="font-bold hover:underline" style={{ fontSize: 18, color: "var(--blue)" }} title="Open in the ERP — edits are made there">{name} ↗ <span style={{ fontSize: 13 }}>open in the ERP</span></a> : <b style={{ fontSize: 18 }}>{name}</b>}
            {x && <div className="text-sm" style={{ color: "var(--dim)" }}>{x.customer} · {x.subject}</div>}
          </div>
          <button onClick={onClose} style={btn("ghost")}>✕</button>
        </div>
        {!d && !err && <div className="text-sm" style={{ color: MUTED }}>Opening…</div>}
        {err && <div className="text-sm font-bold mb-2" style={{ color: RED }}>{err}</div>}
        {d && x && (
          <>
            <div className="grid gap-x-4 gap-y-1 text-xs rounded-lg bg-white p-3" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))", border: `1px solid ${LINE}` }}>
              {([["Date", dmy(x.quoted_on)], ["Valid till", dmy(x.valid_till)], ["Target order", dmy(x.target_order_on)], ["Value", `${inr(x.base_grand_total)}${x.currency && x.currency !== "INR" ? ` (${x.currency} ${Math.round(Number(x.grand_total)).toLocaleString("en-IN")})` : ""}`], ["Owner", who(x.owner)], ["Sales person", x.sales_person || "—"], ["Sent to", `${x.contact_person || "—"}${x.contact_email ? ` · ${x.contact_email}` : ""}`], ["ERP status", x.docstatus === 0 ? "Draft" : x.status || "—"], ["Last status (ERP)", x.last_status || "—"], ["Importance", x.importance || "—"], ["Product group", x.product_group || "—"]] as [string, string][]).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2" style={{ borderBottom: `1px dotted ${LINE}`, padding: "2px 0" }}><span style={{ color: MUTED }}>{k}</span><b className="text-right">{v}</b></div>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <select value={fmt} onChange={(e) => setFmt(e.target.value)} style={{ ...inp, width: 220 }}><option value="">Print format — the ERP&apos;s default</option>{d.formats.map((f) => <option key={f}>{f}</option>)}</select>
              <a href={`/api/seva/quotes?pdf=${encodeURIComponent(name)}${fmt ? `&format=${encodeURIComponent(fmt)}` : ""}`} target="_blank" rel="noreferrer" style={{ ...btn(), textDecoration: "none" }}>📄 The PDF</a>
              {x.docstatus === 1 && <button onClick={startSend} style={btn("primary")}>✉ Send to the customer</button>}
              {x.docstatus !== 1 && <span className="text-xs" style={{ color: MUTED }}>Submit it on the ERP before it can be sent.</span>}
            </div>

            {send && (
              <div className="rounded-lg bg-white p-3 mt-3" style={{ border: `2px solid ${ORANGE}` }}>
                <div className="font-bold text-sm mb-2" style={{ color: NAVY }}>Send — the Service Manager approves it, then it goes</div>
                <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                  <div><label style={lbl}>To</label><input style={inp} value={send.to} onChange={(e) => setSend({ ...send, to: e.target.value })} /></div>
                  <div><label style={lbl}>CC</label><input style={inp} value={send.cc} onChange={(e) => setSend({ ...send, cc: e.target.value })} /></div>
                  <div><label style={lbl}>BCC</label><input style={inp} value={send.bcc} onChange={(e) => setSend({ ...send, bcc: e.target.value })} /></div>
                </div>
                <div className="text-xs mt-1" style={{ color: MUTED }}>These are remembered as {x.customer}&apos;s contacts for the next quotation.</div>
                <label style={{ ...lbl, marginTop: 8 }}>Subject</label><input style={inp} value={send.subject} onChange={(e) => setSend({ ...send, subject: e.target.value })} />
                <label style={{ ...lbl, marginTop: 8 }}>The letter</label>
                <div contentEditable suppressContentEditableWarning onBlur={(e) => setSend({ ...send, body_html: (e.target as HTMLDivElement).innerHTML })} dangerouslySetInnerHTML={{ __html: send.body_html }} style={{ ...inp, minHeight: 140, lineHeight: 1.5 }} />
                <label style={{ ...lbl, marginTop: 8 }}>Print format of the attached PDF</label>
                <select value={send.print_format} onChange={(e) => setSend({ ...send, print_format: e.target.value })} style={{ ...inp, width: 260 }}><option value="">The ERP&apos;s default</option>{d.formats.map((f) => <option key={f}>{f}</option>)}</select>
                <div className="flex gap-2 mt-3 items-center">
                  <button disabled={busy} onClick={() => act({ action: "send_request", ...send }, () => setSend(null))} style={btn("primary")}>{busy ? "…" : "Ask the Service Manager to approve"}</button>
                  <button onClick={() => setSend(null)} style={btn("ghost")}>Cancel</button>
                  <span className="text-xs ml-auto" style={{ color: MUTED }}>Goes from your Gmail if connected, else from sales@ with you in CC.</span>
                </div>
              </div>
            )}

            {d.sends.length > 0 && (
              <div className="mt-3">
                <div style={lbl}>Sending</div>
                {d.sends.map((s) => (
                  <div key={s.id} className="rounded-lg bg-white p-2 mb-1.5 text-xs" style={{ border: `1px solid ${LINE}` }}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <b style={{ color: s.status === "sent" ? GREEN : s.status === "rejected" || s.status === "failed" ? RED : ORANGE }}>{s.status === "awaiting_approval" ? "Waiting for approval" : s.status === "sent" ? "Sent" : s.status === "rejected" ? "Not approved" : s.status === "failed" ? "Approved — did not go" : s.status}</b>
                      <span style={{ color: MUTED }}>{who(s.asked_by)} asked {dmy(s.asked_at)} · to {s.mail_to.join(", ")}{s.mail_cc?.length ? ` · cc ${s.mail_cc.join(", ")}` : ""}{s.mail_bcc?.length ? ` · bcc ${s.mail_bcc.join(", ")}` : ""}</span>
                      <span className="ml-auto" />
                      {(s.status === "awaiting_approval" || s.status === "failed") && d.mayApprove && <><button disabled={busy} onClick={() => act({ action: "approve", id: s.id })} style={{ ...btn("primary"), padding: "3px 10px" }}>✓ Approve and send</button><button disabled={busy} onClick={() => { const note = prompt("Why not? (goes to the asker)") ?? ""; act({ action: "reject", id: s.id, note }); }} style={{ ...btn(), padding: "3px 10px" }}>Not now</button></>}
                      {(s.status === "awaiting_approval" || s.status === "failed") && s.asked_by === d.me && <button disabled={busy} onClick={() => act({ action: "withdraw", id: s.id })} style={{ ...btn("ghost"), padding: "3px 8px", color: MUTED }}>Withdraw</button>}
                    </div>
                    {s.status === "sent" && <div style={{ color: MUTED }}>Approved by {who(s.decided_by)} · sent from {s.sent_from} {s.sent_at ? dmy(s.sent_at) : ""}</div>}
                    {s.reject_note && <div style={{ color: RED }}>{s.reject_note}</div>}
                    {s.error && <div style={{ color: RED }}>{s.error}</div>}
                    {s.status === "awaiting_approval" && !d.mayApprove && <div style={{ color: MUTED }}>With {d.approvers.map(who).join(" or ")}.</div>}
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-lg bg-white p-3 mt-3" style={{ border: `1px solid ${LINE}` }}>
              <div className="font-bold text-sm mb-2" style={{ color: NAVY }}>Update</div>
              <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1.4fr 150px" }}>
                <div><label style={lbl}>Follow-up status</label><select style={inp} value={u.follow_status} onChange={(e) => setU({ ...u, follow_status: e.target.value })}><option value="">—</option>{d.follow.map((f) => <option key={f}>{f}</option>)}</select></div>
                <div><label style={lbl}>Next action</label><input style={inp} value={u.next_action} onChange={(e) => setU({ ...u, next_action: e.target.value })} placeholder="Call Mr Shetty for the PO" /></div>
                <div><label style={lbl}>By</label><input type="date" style={inp} value={u.next_on} onChange={(e) => setU({ ...u, next_on: e.target.value })} /></div>
              </div>
              <label style={{ ...lbl, marginTop: 8 }}>What happened</label>
              <textarea style={{ ...inp, minHeight: 60 }} value={u.body} onChange={(e) => setU({ ...u, body: e.target.value })} placeholder="Spoke to the customer — PO expected after their budget meeting on Friday." />
              <button disabled={busy} onClick={() => act({ action: "note", ...u }, () => setU({ ...u, body: "" }))} style={{ ...btn("primary"), marginTop: 8 }}>Save the update</button>
              <div className="mt-3 grid gap-1.5">
                {d.notes.map((n) => <div key={n.id} className="text-xs" style={{ borderLeft: `3px solid ${LINE}`, paddingLeft: 8 }}><b>{who(n.by)}</b> <span style={{ color: MUTED }}>· {new Date(n.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span><div style={{ whiteSpace: "pre-wrap" }}>{n.body}</div></div>)}
                {d.notes.length === 0 && <span className="text-xs" style={{ color: MUTED }}>No update yet.</span>}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
