"use client";
/**
 * The record's Communication tab (Dr Raghu, 4 Sep 2026): "in this put
 * another tab communication".
 *
 * Two halves. Below, every message HRMS has sent this person — the address
 * it went to, what it said with the variables filled in, who sent it and
 * what the mail server answered. Above, a composer: pick an e-mail template
 * from Masters → Standard Texts or write from scratch, choose the personal
 * or the work address, see it rendered for THIS person, and send. The mail
 * goes from the sender's own connected Gmail with their name on it; without
 * a mailbox one can still preview, or log a message sent another way.
 */
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { fmtFull } from "@/lib/schedule";
import { C } from "./RecordFields";

interface Row { id: string; channel: string; to_address: string | null; subject: string | null; body: string; template_key: string | null; status: string; error: string | null; sent_by: string | null; sent_at: string }
interface Tpl { key: string; title: string; body: string; kind?: string | null; subject?: string | null }

export function Communication({ employeeId, name, personalEmail, workEmail }: {
  employeeId: string; name: string; personalEmail: string | null; workEmail: string | null; isOwner: boolean;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [needs, setNeeds] = useState(false);
  const [tpls, setTpls] = useState<Tpl[]>([]);
  const [tpl, setTpl] = useState("");
  const [to, setTo] = useState<"personal" | "work">(personalEmail ? "personal" : "work");
  const [channel, setChannel] = useState<"email" | "whatsapp">("email");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState<{ subject: string; body: string; to: string } | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [openRow, setOpenRow] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { const j = await api.get(`/api/hrms/communication?id=${encodeURIComponent(employeeId)}`); setRows(j.rows || []); setNeeds(!!j.needsMigration); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); setRows([]); }
  }, [employeeId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get("/api/hrms/texts").then((j) => setTpls((j.texts || []).filter((t: Tpl) => t.kind === "email" || t.kind === "whatsapp"))).catch(() => setTpls([]));
  }, []);

  const pick = (key: string) => {
    setTpl(key); setPreview(null);
    const t = tpls.find((x) => x.key === key);
    if (t) { setSubject(t.subject || ""); setBody(t.body || ""); }
  };

  const address = to === "personal" ? personalEmail : workEmail;

  const doPreview = async () => {
    setMsg(""); setBusy(true);
    try {
      const j = await api.post("/api/hrms/communication", { employee_ids: [employeeId], subject, body, to, preview: true });
      const p = (j.people || [])[0];
      setPreview(p ? { subject: p.subject, body: p.body, to: p.to } : null);
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const send = async (logOnly: boolean) => {
    if (!body.trim()) { setMsg("Nothing to send."); return; }
    if (!logOnly && channel === "email" && !address) { setMsg(`No ${to} email on the record.`); return; }
    if (!logOnly && channel === "email" && !window.confirm(`Send this to ${name} at ${address}, from your Gmail?`)) return;
    if (!logOnly && channel === "whatsapp" && !window.confirm(`Queue this WhatsApp for ${name}?\n\nIt goes out from the WhatsApp queue (HRMS → WhatsApp — send to all → Send) through Periskope's default number.`)) return;
    setMsg(""); setBusy(true);
    try {
      const j = await api.post("/api/hrms/communication", { employee_ids: [employeeId], subject, body, to, template_key: tpl || null, log_only: logOnly, channel: logOnly ? "note" : channel });
      const r = (j.results || [])[0];
      if (r?.ok) { setMsg(logOnly ? "Logged ✓" : channel === "whatsapp" ? `Queued for WhatsApp ✓ — release it from WhatsApp — send to all` : `Sent to ${r.to} ✓`); setPreview(null); if (!logOnly) { setBody(""); setSubject(""); setTpl(""); } }
      else setMsg(r?.error || "Not sent.");
      await load();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const tone = (s: string) => (s === "sent" ? C.green : s === "failed" ? C.red : C.dim);

  return (
    <>
      <div className="rounded p-2 mb-2" style={{ background: "#F4F2EC", fontSize: 11, color: C.dim, lineHeight: 1.6 }}>
        Every mail HRMS has sent {name.split(" ")[0] || "this person"}, and a place to write the next one. Templates come from
        Masters → Standard Texts; {"{{name}}"}, {"{{designation}}"} and the other variables are filled from this record.
        {" Mail goes out from your own connected Gmail, with your name on it."}
      </div>
      {needs && <div className="rounded p-2 mb-2" style={{ background: "#FFF7E6", border: "1px solid #F5D9A8", fontSize: 12, color: "#8A5B00" }}>Run migration 0129 — messages have nowhere to be kept yet. Sending still works; the record of it does not.</div>}
      {msg && <div className="text-xs font-semibold mb-2" style={{ color: msg.includes("✓") ? C.green : C.red }}>{msg}</div>}

      {/* ── composer ── */}
      <div className="bg-white rounded-lg border p-3 mb-3" style={{ borderColor: C.line }}>
        <div className="flex gap-1.5 mb-2">
          {(["email", "whatsapp"] as const).map((c) => (
            <button key={c} onClick={() => { setChannel(c); setPreview(null); }} className="rounded px-3 py-1 text-xs font-bold" style={{ background: channel === c ? "var(--navy)" : "#fff", color: channel === c ? "#fff" : C.dim, border: `1px solid ${channel === c ? "var(--navy)" : C.line}` }}>
              {c === "email" ? "✉ E-mail" : "💬 WhatsApp"}
            </button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap items-end mb-2">
          <label className="text-xs" style={{ color: C.dim, flex: "1 1 220px" }}>Template
            <select value={tpl} onChange={(e) => pick(e.target.value)} className="w-full rounded px-2 py-1.5 mt-0.5 bg-white" style={{ border: `1px solid ${C.line}`, fontSize: 13 }}>
              <option value="">— write from scratch —</option>
              {tpls.map((t) => <option key={t.key} value={t.key}>{t.title}</option>)}
            </select>
          </label>
          {channel === "email" && <label className="text-xs" style={{ color: C.dim, flex: "1 1 260px" }}>To
            <select value={to} onChange={(e) => { setTo(e.target.value as "personal" | "work"); setPreview(null); }} className="w-full rounded px-2 py-1.5 mt-0.5 bg-white" style={{ border: `1px solid ${C.line}`, fontSize: 13 }}>
              <option value="personal">Personal — {personalEmail || "none on record"}</option>
              <option value="work">Work — {workEmail || "none on record"}</option>
            </select>
          </label>}
          {channel === "whatsapp" && <div className="text-xs" style={{ color: C.dim, flex: "1 1 260px" }}>To the personal mobile on the record, through the WhatsApp queue.</div>}
        </div>
        {channel === "email" && <input value={subject} onChange={(e) => { setSubject(e.target.value); setPreview(null); }} placeholder="Subject" className="w-full rounded px-2 py-1.5 mb-1 font-semibold" style={{ border: `1px solid ${C.line}`, fontSize: 13 }} />}
        <textarea value={body} rows={8} onChange={(e) => { setBody(e.target.value); setPreview(null); }} placeholder={"Dear {{first_name}},\n\n…\n\nRaghu"} className="w-full rounded px-2 py-1.5" style={{ border: `1px solid ${C.line}`, fontSize: 13, lineHeight: 1.6 }} />
        {preview && (
          <div className="rounded p-2 mt-2" style={{ background: "#FBFAF7", border: `1px dashed ${C.line}`, fontSize: 12.5 }}>
            <div className="text-xs font-bold mb-1" style={{ color: C.faint }}>AS IT WILL READ · to {preview.to || <span style={{ color: C.red }}>nobody — no {to} address</span>}</div>
            {preview.subject && <div className="font-semibold mb-1">{preview.subject}</div>}
            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{preview.body}</div>
          </div>
        )}
        <div className="flex gap-2 mt-2 flex-wrap">
          <button onClick={doPreview} disabled={busy || !body.trim()} className="text-xs font-semibold rounded border px-3 py-1.5 bg-white" style={{ borderColor: C.line, color: "var(--blue)" }}>👁 Preview for {name.split(" ")[0]}</button>
          <button onClick={() => send(false)} disabled={busy || !body.trim()} className="text-xs font-bold rounded px-3 py-1.5" style={{ background: channel === "whatsapp" ? C.green : C.orange, color: "#fff", opacity: busy ? 0.6 : 1 }}>{channel === "whatsapp" ? "💬 Queue WhatsApp" : "✉ Send from my Gmail"}</button>
          <button onClick={() => send(true)} disabled={busy || !body.trim()} className="text-xs font-semibold rounded border px-3 py-1.5 bg-white" style={{ borderColor: C.line, color: C.dim }} title="Keep a record of something said by phone, WhatsApp or in person">📝 Log only</button>
        </div>
      </div>

      {/* ── what has been sent ── */}
      {rows === null && <div className="text-xs" style={{ color: C.faint }}>loading…</div>}
      {rows?.length === 0 && <div className="text-xs" style={{ color: C.faint }}>Nothing has been sent to this person from HRMS yet.</div>}
      {!!rows?.length && (
        <div className="bg-white rounded-lg border" style={{ borderColor: C.line }}>
          {rows.map((r, i) => (
            <div key={r.id} className="px-3 py-2" style={{ borderTop: i ? "1px solid #EEECE6" : undefined }}>
              <button onClick={() => setOpenRow(openRow === r.id ? null : r.id)} className="w-full text-left">
                <div className="text-xs flex gap-2 items-baseline flex-wrap" style={{ lineHeight: 1.6 }}>
                  <span className="rounded px-1.5 py-0.5 font-bold" style={{ background: tone(r.status), color: "#fff", fontSize: 10 }}>{r.status}</span>
                  <span className="font-semibold" style={{ color: C.ink }}>{r.subject || "(no subject)"}</span>
                  <span style={{ color: C.faint }}>{r.channel === "email" ? `→ ${r.to_address || "?"}` : r.channel === "whatsapp" ? `💬 → ${r.to_address || "?"}` : r.channel}</span>
                  <span style={{ flex: 1 }} />
                  <span style={{ color: C.faint }}>{fmtFull(String(r.sent_at))} · {String(r.sent_by || "").split("·")[0].trim() || "—"}</span>
                  <span style={{ color: C.faint }}>{openRow === r.id ? "▲" : "▼"}</span>
                </div>
              </button>
              {r.error && <div className="text-xs" style={{ color: C.red }}>{r.error}</div>}
              {openRow === r.id && (
                /<\/?(p|br|b|strong|i|em|ul|ol|li|div)\b/i.test(r.body)
                  ? <div className="mt-1" style={{ fontSize: 12.5, lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: r.body }} />
                  : <div className="mt-1" style={{ fontSize: 12.5, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{r.body}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
