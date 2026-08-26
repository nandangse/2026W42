"use client";

/**
 * THE MAIL LIGHTBOX (Dr Raghu, 26 Aug 2026) — compact by order.
 * To / CC / BCC · Subject · Template · Message · Attachments (straight into
 * the Drive mail folder, anyone-with-link, only the link travels) · the
 * record chain it will hang on · Send — from the connected mailbox.
 */

import { useEffect, useState } from "react";
import { NAVY, NAVY_DARK, NAVY_SOFT, INK, MUTED, BORDER, ORANGE } from "./palette";

export type ComposeCtx = {
  to?: string | null;
  refs: { person_id?: string; company_id?: string; opportunity_id?: string; quotation_id?: string; lead_id?: string };
  chain: string[];             // "Opportunity ENQ-…", "Company X", "Contact Y"
  /** Replying: the subject gains its Re:, the original is quoted below, and
   *  Gmail threads it under the same conversation. */
  reply?: { subject: string | null; threadKey: string | null; rfcMessageId: string | null; quoted: string | null; quotedFrom: string | null; quotedAt: string | null };
};

type Attachment = { id: string; name: string; link: string };
type Template = { id: string; label: string; subject: string | null; cc: string | null; body: string; attachments: { name: string; link: string }[] };

export default function MailComposer({ ctx, onClose, onSent }: {
  ctx: ComposeCtx; onClose: () => void; onSent: () => void;
}) {
  const [gmail, setGmail] = useState<{ connected: boolean; email: string | null; templates: Template[] } | null>(null);
  const [to, setTo] = useState(ctx.to ?? "");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState(() => {
    const s0 = ctx.reply?.subject ?? "";
    return ctx.reply ? (/^re:/i.test(s0) ? s0 : `Re: ${s0}`) : "";
  });
  const [bodyText, setBodyText] = useState(() => ctx.reply?.quoted
    ? `\n\nOn ${ctx.reply.quotedAt ?? ""}, ${ctx.reply.quotedFrom ?? ""} wrote:\n` +
      ctx.reply.quoted.split("\n").map((l) => "> " + l).join("\n")
    : "");
  const [tpl, setTpl] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/crm/gmail/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setGmail({ connected: !!j.connected, email: j.email ?? null, templates: j.templates ?? [] }))
      .catch(() => setGmail({ connected: false, email: null, templates: [] }));
  }, []);

  // A template is the fixed set — subject, cc, body, attachments — applied
  // whole. Everything stays editable before Send.
  const applyTemplate = (id: string) => {
    setTpl(id);
    const t = gmail?.templates.find((x) => x.id === id);
    if (!t) return;
    setBodyText(t.body);
    if (t.subject) setSubject(t.subject);
    if (t.cc) { setCc(t.cc); setShowCc(true); }
    if (t.attachments.length) {
      setFiles((cur) => [
        ...cur.filter((f) => !t.attachments.some((a) => a.link === f.link)),
        ...t.attachments.map((a) => ({ id: a.link, name: a.name, link: a.link })),
      ]);
    }
  };

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setUploading(true); setErr("");
    try {
      for (const f of Array.from(list)) {
        const fd = new FormData();
        fd.append("file", f);
        const r = await fetch("/api/crm/gmail/attach", { method: "POST", body: fd });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || `${f.name} did not upload`);
        setFiles((cur) => [...cur, j]);
      }
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setUploading(false); }
  };

  const send = async () => {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/crm/gmail/send", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          to, cc, bcc, subject, body: bodyText, attachments: files, ...ctx.refs,
          thread_key: ctx.reply?.threadKey ?? null, in_reply_to: ctx.reply?.rfcMessageId ?? null,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not send");
      onSent();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  };

  const inputCss = { borderColor: BORDER } as const;

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 80, background: "rgba(27,45,107,.5)",
      display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflowY: "auto",
    }}>
      <div onClick={(e) => e.stopPropagation()} className="rounded" style={{ background: "#fff", width: "min(640px,100%)", boxShadow: "0 12px 40px rgba(27,45,107,.35)" }}>
        <div className="flex items-center justify-between px-4 py-2.5" style={{ background: NAVY, borderRadius: "6px 6px 0 0" }}>
          <div className="text-white font-bold" style={{ fontSize: 14 }}>
            {ctx.reply ? "↩ Reply" : "✉ New mail"} {gmail?.email && <span style={{ fontWeight: 400, color: "#C8D2EC", fontSize: 12 }}>· as {gmail.email}</span>}
          </div>
          <button onClick={onClose} className="px-2 py-0.5 rounded text-sm font-semibold" style={{ background: NAVY_DARK, color: "#C8D2DC" }}>✕</button>
        </div>

        <div className="p-3" style={{ display: "grid", gap: 8 }}>
          {gmail && !gmail.connected && (
            <div className="rounded p-2 text-xs font-semibold" style={{ background: "#FDF3E1", color: "#B45309" }}>
              Gmail is not connected — Profile → ✉ Connect Gmail first.
            </div>
          )}
          <div className="flex gap-2 items-center">
            <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="To"
              className="flex-1 rounded border px-2 py-1.5 text-sm" style={inputCss} />
            <button onClick={() => setShowCc((v) => !v)} className="text-xs font-bold" style={{ color: NAVY }}>
              {showCc ? "− cc/bcc" : "+ cc/bcc"}
            </button>
          </div>
          {showCc && (
            <div className="flex gap-2">
              <input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="Cc"
                className="flex-1 rounded border px-2 py-1.5 text-sm" style={inputCss} />
              <input value={bcc} onChange={(e) => setBcc(e.target.value)} placeholder="Bcc"
                className="flex-1 rounded border px-2 py-1.5 text-sm" style={inputCss} />
            </div>
          )}
          <div className="flex gap-2">
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject — {{variables}} render on send"
              className="flex-1 rounded border px-2 py-1.5 text-sm" style={inputCss} />
            <select value={tpl} onChange={(e) => applyTemplate(e.target.value)}
              className="rounded border px-2 py-1.5 text-xs font-semibold" style={{ ...inputCss, maxWidth: 180, background: "#fff", color: tpl ? INK : MUTED }}
              title="From Settings → Email Templates — subject, cc, body and attachments come fixed">
              <option value="">Template…</option>
              {(gmail?.templates ?? []).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <textarea value={bodyText} onChange={(e) => setBodyText(e.target.value)} rows={7}
            placeholder={"Dear {{name}},\n\n… {{qtn_no}}, {{next_monday}}, {{khalapur_address}} — all variables render on send."}
            className="w-full rounded border px-2 py-1.5 text-sm" style={inputCss} />

          <div className="flex items-center gap-2 flex-wrap">
            <label className="rounded px-2.5 py-1 text-xs font-bold cursor-pointer" style={{ background: NAVY_SOFT, color: NAVY }}>
              {uploading ? "Uploading…" : "📎 Attach"}
              <input type="file" multiple hidden disabled={uploading}
                onChange={(e) => { void upload(e.target.files); e.currentTarget.value = ""; }} />
            </label>
            <span className="text-xs" style={{ color: MUTED }}>→ your Drive mail folder, anyone-with-link · ~4 MB/file</span>
          </div>
          {files.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {files.map((f) => (
                <span key={f.id} className="rounded-full border px-2 py-0.5 text-xs font-semibold flex items-center gap-1" style={{ borderColor: BORDER }}>
                  <a href={f.link} target="_blank" rel="noreferrer" style={{ color: NAVY }}>{f.name}</a>
                  <button onClick={() => setFiles((cur) => cur.filter((x) => x.id !== f.id))} style={{ color: MUTED }}>✕</button>
                </span>
              ))}
            </div>
          )}

          {ctx.chain.length > 0 && (
            <div className="text-xs" style={{ color: MUTED }}>
              Links to:{" "}
              {ctx.chain.map((c, i) => (
                <span key={i} className="rounded px-1.5 py-0.5 font-semibold" style={{ background: NAVY_SOFT, color: NAVY, marginRight: 4 }}>{c}</span>
              ))}
            </div>
          )}

          {err && <div className="rounded p-2 text-xs font-semibold" style={{ background: "#FBEAE8", color: "#8E2C20" }}>{err}</div>}
          <div className="flex justify-end">
            <button onClick={() => void send()} disabled={busy || uploading || !gmail?.connected}
              className="px-5 py-1.5 rounded text-sm font-bold"
              style={{ background: busy || !gmail?.connected ? "#B9BEC4" : ORANGE, color: "#fff" }}>
              {busy ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
