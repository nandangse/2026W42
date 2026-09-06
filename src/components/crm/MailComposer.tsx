"use client";

/**
 * THE MAIL COMPOSER — the OnePageCRM view, by order (Dr Raghu, 28 Aug 2026,
 * with screenshots): a dark New Message header, labelled To / From / Subject
 * rows, To searching the CRM's own contacts, a Variable picker that drops
 * {{…}} at the cursor, the Template picker, and a TRACKING toggle whose
 * pixel stamps the message when it is opened.
 *
 * Everything the compact box could do still works: reply threading, Drive
 * attachments, save-as-template, the record chain.
 */

import { useEffect, useRef, useState } from "react";
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

/** The variables everyone has, before the masters add their own. */
const BUILTIN_VARS = ["name", "first_name", "company", "sales_person", "qtn_no", "next_monday"];

export default function MailComposer({ ctx, onClose, onSent }: {
  ctx: ComposeCtx; onClose: () => void; onSent: () => void;
}) {
  const [gmail, setGmail] = useState<{ connected: boolean; email: string | null; templates: Template[] } | null>(null);
  const [to, setTo] = useState(ctx.to ?? "");
  const [toQuery, setToQuery] = useState("");
  const [toOpts, setToOpts] = useState<{ id: string; label: string; email: string }[]>([]);
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
  const [track, setTrack] = useState(true);
  const [varOpen, setVarOpen] = useState(false);
  const [vars, setVars] = useState<string[]>(BUILTIN_VARS);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  const loadStatus = () => {
    fetch("/api/crm/gmail/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setGmail({ connected: !!j.connected, email: j.email ?? null, templates: j.templates ?? [] }))
      .catch(() => setGmail({ connected: false, email: null, templates: [] }));
  };
  useEffect(loadStatus, []);
  useEffect(() => {
    fetch("/api/crm/message_variable", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const names = (j.rows || []).map((r: { name?: string }) => String(r.name || "")).filter(Boolean);
        if (names.length) setVars([...new Set([...BUILTIN_VARS, ...names])]);
      })
      .catch(() => { /* the built-ins stand */ });
  }, []);

  // The To-picker: three letters in, the CRM's contacts answer.
  useEffect(() => {
    if (toQuery.trim().length < 2) { setToOpts([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/crm/person?pick=${encodeURIComponent(toQuery.trim())}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => setToOpts(((j.options || []) as { id: string; label: string; email?: string }[])
          .map((p) => ({ id: p.id, label: p.label, email: String(p.email ?? "") }))
          .filter((p) => p.email)))
        .catch(() => setToOpts([]));
    }, 250);
    return () => clearTimeout(t);
  }, [toQuery]);

  const insertVar = (v: string) => {
    const tag = `{{${v}}}`;
    const el = bodyRef.current;
    if (!el) { setBodyText((b) => b + tag); return; }
    const start = el.selectionStart ?? bodyText.length;
    const end = el.selectionEnd ?? start;
    setBodyText(bodyText.slice(0, start) + tag + bodyText.slice(end));
    setVarOpen(false);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + tag.length, start + tag.length); });
  };

  // Save what is written as a NEW template, right from here.
  const [tplSaveOpen, setTplSaveOpen] = useState(false);
  const [tplModule, setTplModule] = useState("Enquiry");
  const [tplName, setTplName] = useState("");
  const [tplMsg, setTplMsg] = useState("");
  const saveTemplate = async () => {
    setTplMsg("");
    try {
      const r = await fetch("/api/crm/email_template", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          module: tplModule, name: tplName.trim(), subject, cc,
          body: bodyText,
          attachments: files.map((f) => `${f.name} | ${f.link}`).join("\n"),
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not save the template");
      setTplMsg("Saved ✓"); setTplSaveOpen(false); setTplName("");
      loadStatus();
    } catch (e) { setTplMsg(e instanceof Error ? e.message : String(e)); }
  };

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
          to, cc, bcc, subject, body: bodyText, attachments: files, track, ...ctx.refs,
          thread_key: ctx.reply?.threadKey ?? null, in_reply_to: ctx.reply?.rfcMessageId ?? null,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not send");
      onSent();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  };

  const RowLabel = ({ children }: { children: React.ReactNode }) => (
    <span className="text-sm" style={{ color: MUTED, width: 64, flexShrink: 0 }}>{children}</span>
  );
  const rowCss = { borderBottom: `1px solid #EDF0F6`, padding: "10px 0" } as const;

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 80, background: "rgba(27,45,107,.5)",
      display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "28px 16px", overflowY: "auto",
    }}>
      <div onClick={(e) => e.stopPropagation()} className="rounded" style={{ background: "#fff", width: "min(880px,100%)", boxShadow: "0 12px 40px rgba(27,45,107,.35)" }}>
        {/* ── the dark OnePage header ─────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-3" style={{ background: "#1E2D3D", borderRadius: "6px 6px 0 0" }}>
          <div className="text-white font-bold" style={{ fontSize: 18 }}>
            {ctx.reply ? "Reply" : "New Message"}
          </div>
          <button onClick={onClose} className="px-2 py-0.5 rounded text-lg font-semibold" style={{ color: "#C8D2DC" }}>✕</button>
        </div>

        <div className="px-5 pt-1 pb-4">
          {gmail && !gmail.connected && (
            <div className="rounded p-2 mt-2 text-xs font-semibold" style={{ background: "#FDF3E1", color: "#B45309" }}>
              Gmail is not connected — Profile → ✉ Connect Gmail first.
            </div>
          )}

          {/* To — searching the CRM's contacts */}
          <div className="flex items-center relative" style={rowCss}>
            <RowLabel>To</RowLabel>
            {to ? (
              <span className="rounded-full px-3 py-1 text-sm font-semibold flex items-center gap-2" style={{ background: "#EEF1FA", color: NAVY }}>
                {to}
                <button onClick={() => { setTo(""); setToQuery(""); }} style={{ color: MUTED }}>✕</button>
              </span>
            ) : (
              <input value={toQuery} onChange={(e) => setToQuery(e.target.value)} placeholder="Search contacts… or type an address"
                onBlur={() => { if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toQuery.trim())) { setTo(toQuery.trim()); setToQuery(""); } }}
                className="flex-1 text-sm outline-none" style={{ color: INK }} />
            )}
            <button onClick={() => setShowCc((v) => !v)} className="text-sm font-semibold ml-auto" style={{ color: NAVY }}>
              Cc Bcc
            </button>
            {toOpts.length > 0 && !to && (
              <div className="absolute rounded border bg-white" style={{ top: "100%", left: 64, right: 0, zIndex: 5, borderColor: BORDER, boxShadow: "0 8px 24px rgba(0,0,0,.15)", maxHeight: 220, overflow: "auto" }}>
                {toOpts.map((o) => (
                  <button key={o.id} onClick={() => { setTo(o.email); setToQuery(""); setToOpts([]); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">
                    <b style={{ color: INK }}>{o.label}</b> <span style={{ color: MUTED }}>{o.email}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* From — the connected mailbox, worn as a chip */}
          <div className="flex items-center" style={rowCss}>
            <RowLabel>From</RowLabel>
            <span className="rounded-full px-3 py-1 text-sm font-semibold" style={{ background: "#F1F3F7", color: INK }}>
              {gmail?.email ?? "…"}
            </span>
          </div>

          {showCc && (
            <div className="flex items-center gap-3" style={rowCss}>
              <RowLabel>Cc / Bcc</RowLabel>
              <input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="Cc" className="flex-1 text-sm outline-none rounded border px-2 py-1" style={{ borderColor: BORDER }} />
              <input value={bcc} onChange={(e) => setBcc(e.target.value)} placeholder="Bcc" className="flex-1 text-sm outline-none rounded border px-2 py-1" style={{ borderColor: BORDER }} />
            </div>
          )}

          {/* Subject */}
          <div className="flex items-center" style={rowCss}>
            <RowLabel>Subject</RowLabel>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Add subject…"
              className="flex-1 text-sm outline-none font-semibold" style={{ color: INK }} />
          </div>

          {/* the words */}
          <textarea ref={bodyRef} value={bodyText} onChange={(e) => setBodyText(e.target.value)} rows={12}
            placeholder={"Write here — {{variables}} render on send."}
            className="w-full text-sm outline-none mt-3" style={{ color: INK, lineHeight: 1.6, resize: "vertical", minHeight: 180 }} />

          {files.length > 0 && (
            <div className="flex gap-1.5 flex-wrap mb-2">
              {files.map((f) => (
                <span key={f.id} className="rounded-full border px-2 py-0.5 text-xs font-semibold flex items-center gap-1" style={{ borderColor: BORDER }}>
                  <a href={f.link} target="_blank" rel="noreferrer" style={{ color: NAVY }}>{f.name}</a>
                  <button onClick={() => setFiles((cur) => cur.filter((x) => x.id !== f.id))} style={{ color: MUTED }}>✕</button>
                </span>
              ))}
            </div>
          )}
          {ctx.chain.length > 0 && (
            <div className="text-xs mb-1" style={{ color: MUTED }}>
              Links to:{" "}
              {ctx.chain.map((c, i) => (
                <span key={i} className="rounded px-1.5 py-0.5 font-semibold" style={{ background: NAVY_SOFT, color: NAVY, marginRight: 4 }}>{c}</span>
              ))}
            </div>
          )}
          {tplSaveOpen && (
            <div className="flex items-center gap-2 flex-wrap rounded border p-2 mb-2" style={{ borderColor: BORDER, background: "#FBFAF7" }}>
              <select value={tplModule} onChange={(e) => setTplModule(e.target.value)}
                className="rounded border px-2 py-1 text-xs font-semibold" style={{ borderColor: BORDER, background: "#fff" }}>
                <option>Enquiry</option><option>Quotation</option>
              </select>
              <input value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="Template name"
                className="flex-1 rounded border px-2 py-1 text-xs" style={{ borderColor: BORDER, minWidth: 140 }} />
              <button onClick={() => void saveTemplate()} disabled={!tplName.trim()}
                className="rounded px-2.5 py-1 text-xs font-bold"
                style={{ background: tplName.trim() ? ORANGE : "#B9BEC4", color: "#fff" }}>
                Save as template
              </button>
            </div>
          )}
          {tplMsg && <div className="text-xs font-semibold mb-1" style={{ color: tplMsg.startsWith("Saved") ? "#0D7A3F" : "#8E2C20" }}>{tplMsg}</div>}
          {err && <div className="rounded p-2 mb-2 text-xs font-semibold" style={{ background: "#FBEAE8", color: "#8E2C20" }}>{err}</div>}
        </div>

        {/* ── the OnePage bottom bar ──────────────────────────────────── */}
        <div className="flex items-center gap-3 px-5 py-3 flex-wrap" style={{ borderTop: `1px solid ${BORDER}` }}>
          <button onClick={() => void send()} disabled={busy || uploading || !gmail?.connected}
            className="px-7 py-2 rounded-full text-sm font-bold"
            style={{ background: busy || !gmail?.connected ? "#B9BEC4" : ORANGE, color: "#fff" }}>
            {busy ? "Sending…" : "Send"}
          </button>
          <label className="text-lg cursor-pointer" title={uploading ? "Uploading…" : "Attach — goes to your Drive mail folder, the link travels"}>
            📎
            <input type="file" multiple hidden disabled={uploading}
              onChange={(e) => { void upload(e.target.files); e.currentTarget.value = ""; }} />
          </label>
          <button onClick={() => setTplSaveOpen((v) => !v)} className="text-lg" title="Save what is written as a template">💾</button>

          <span className="ml-auto" />
          <button onClick={() => setTrack((v) => !v)}
            className="rounded-full px-3 py-1 text-xs font-bold border flex items-center gap-1"
            title="A hidden pixel stamps the mail when it is opened. Gmail's proxy can fire it without a human — a signal, not a court record."
            style={track ? { background: "#E9F5EC", borderColor: "#0D7A3F", color: "#0D7A3F" } : { background: "#fff", borderColor: BORDER, color: MUTED }}>
            ◉ Tracking {track ? "on" : "off"}
          </button>
          <div className="relative">
            <button onClick={() => setVarOpen((v) => !v)} className="text-sm font-bold" style={{ color: NAVY }}>
              Variable ▾
            </button>
            {varOpen && (
              <>
                <div className="fixed inset-0" style={{ zIndex: 4 }} role="button" tabIndex={0} onClick={() => setVarOpen(false)} />
                <div className="absolute rounded border bg-white" style={{ bottom: "calc(100% + 6px)", right: 0, zIndex: 5, borderColor: BORDER, boxShadow: "0 8px 24px rgba(0,0,0,.15)", maxHeight: 240, overflow: "auto", minWidth: 180 }}>
                  {vars.map((v) => (
                    <button key={v} onClick={() => insertVar(v)} className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50" style={{ color: INK }}>
                      {v.replace(/_/g, " ")}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <select value={tpl} onChange={(e) => applyTemplate(e.target.value)}
            className="text-sm font-bold bg-white outline-none" style={{ color: NAVY, maxWidth: 160 }}
            title="From Settings → Email Templates — subject, cc, body and attachments come fixed">
            <option value="">Template ▾</option>
            {(gmail?.templates ?? []).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}
