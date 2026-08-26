"use client";

/**
 * THE WHATSAPP LIGHTBOX (Dr Raghu, 26 Aug 2026) — 💬+ opens it: pick a
 * WhatsApp Template, the message forms with {{variables}}, Send logs it into
 * Communication and opens the salesperson's OWN WhatsApp with the text
 * ready. Compact, like the mail lightbox.
 */

import { useEffect, useState } from "react";
import { NAVY, NAVY_DARK, NAVY_SOFT, INK, MUTED, BORDER } from "./palette";

export type WaCtx = {
  phone: string;
  refs: { person_id?: string; company_id?: string; opportunity_id?: string; quotation_id?: string; lead_id?: string };
  chain: string[];
};

type Tpl = { id: string; label: string; body: string; attachments: { name: string; link: string }[] };
const GREEN = "#1FA855";

export default function WaComposer({ ctx, onClose, onSent }: {
  ctx: WaCtx; onClose: () => void; onSent: () => void;
}) {
  const [templates, setTemplates] = useState<Tpl[]>([]);
  const [tpl, setTpl] = useState("");
  const [body, setBody] = useState("Hello,\n\nRegards\n{{sales_person}}");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/crm/wa/templates", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setTemplates(j.templates ?? []))
      .catch(() => {});
  }, []);

  const applyTemplate = (id: string) => {
    setTpl(id);
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    let text = t.body;
    if (t.attachments.length)
      text += "\n\n" + t.attachments.map((a) => `${a.name}: ${a.link}`).join("\n");
    setBody(text);
  };

  const send = async () => {
    setBusy(true); setErr("");
    // the window opens NOW, synchronously — popup blockers spare it that way
    const w = window.open("", "_blank");
    try {
      const r = await fetch("/api/crm/wa/send", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: ctx.phone, body, ...ctx.refs }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not form the message");
      if (w) w.location.href = j.url; else window.location.href = j.url;
      onSent();
    } catch (e) {
      if (w) w.close();
      setErr(e instanceof Error ? e.message : String(e)); setBusy(false);
    }
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 80, background: "rgba(27,45,107,.5)",
      display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "48px 16px", overflowY: "auto",
    }}>
      <div onClick={(e) => e.stopPropagation()} className="rounded" style={{ background: "#fff", width: "min(520px,100%)", boxShadow: "0 12px 40px rgba(27,45,107,.35)" }}>
        <div className="flex items-center justify-between px-4 py-2.5" style={{ background: GREEN, borderRadius: "6px 6px 0 0" }}>
          <div className="text-white font-bold" style={{ fontSize: 14 }}>
            💬 WhatsApp <span style={{ fontWeight: 400, color: "#D9F2E3", fontSize: 12 }}>· to {ctx.phone} · from your own WhatsApp</span>
          </div>
          <button onClick={onClose} className="px-2 py-0.5 rounded text-sm font-semibold" style={{ background: NAVY_DARK, color: "#C8D2DC" }}>✕</button>
        </div>
        <div className="p-3" style={{ display: "grid", gap: 8 }}>
          <select value={tpl} onChange={(e) => applyTemplate(e.target.value)}
            className="rounded border px-2 py-1.5 text-xs font-semibold" style={{ borderColor: BORDER, background: "#fff", color: tpl ? INK : MUTED }}
            title="From Settings → WhatsApp Templates">
            <option value="">Template…</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={7}
            className="w-full rounded border px-2 py-1.5 text-sm" style={{ borderColor: BORDER, lineHeight: 1.5 }}
            placeholder={"Hello {{small_name}},\n\n… — variables render on send."} />
          {ctx.chain.length > 0 && (
            <div className="text-xs" style={{ color: MUTED }}>
              Logs to:{" "}
              {ctx.chain.map((c, i) => (
                <span key={i} className="rounded px-1.5 py-0.5 font-semibold" style={{ background: NAVY_SOFT, color: NAVY, marginRight: 4 }}>{c}</span>
              ))}
            </div>
          )}
          {err && <div className="rounded p-2 text-xs font-semibold" style={{ background: "#FBEAE8", color: "#8E2C20" }}>{err}</div>}
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: MUTED }}>The message is logged in Communication as formed.</span>
            <button onClick={() => void send()} disabled={busy || !body.trim()}
              className="px-5 py-1.5 rounded text-sm font-bold"
              style={{ background: busy || !body.trim() ? "#B9BEC4" : GREEN, color: "#fff" }}>
              {busy ? "Opening…" : "Send via WhatsApp"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
