"use client";
/**
 * A MAIL DRAFTED BY GENIE, SENT BY A PERSON (7 Oct 2026). The server drafts
 * To / Cc / Subject / Message; the person edits what they like and presses
 * Send; the attachment is made on the server at send time. Used for the bank
 * execution files and for the finalised sheet to management.
 */
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Draft { to: string; cc: string; subject: string; body: string }
export default function MailPopup({ title, draftUrl, sendUrl, sendBody, attachment, onClose, onSent }: {
  title: string; draftUrl: string; sendUrl: string; sendBody: Record<string, unknown>;
  attachment: (d: Record<string, unknown>) => string; onClose: () => void; onSent: (msg: string) => void;
}) {
  const [d, setD] = useState<Record<string, unknown> | null>(null);
  const [f, setF] = useState<Draft>({ to: "", cc: "", subject: "", body: "" });
  const [err, setErr] = useState(""); const [sending, setSending] = useState(false);
  useEffect(() => { api.get(draftUrl).then((j) => { const x = j as Record<string, unknown> & Draft; setD(x); setF({ to: x.to, cc: x.cc, subject: x.subject, body: x.body }); }).catch((e) => setErr(e instanceof Error ? e.message : String(e))); }, [draftUrl]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const send = async () => {
    if (!window.confirm(`Send to ${f.to}?`)) return;
    setSending(true); setErr("");
    try { const j = await api.post(sendUrl, { ...sendBody, ...f }) as { to: string; from: string; note?: string | null }; onSent(`Sent to ${j.to} from ${j.from}${j.note ? ` — ${j.note}` : ""} ✓`); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); setSending(false); }
  };
  const F = { border: "1px solid #E2E0DA", borderRadius: 4, padding: "6px 8px", fontSize: 13, width: "100%", color: "#1F2328", background: "#fff" } as const;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(22,35,47,0.55)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 8, width: "min(760px, 100%)", maxHeight: "92vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.35)", color: "#1F2328", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ background: "#16232F", color: "#fff", padding: "10px 16px", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1, fontWeight: 700, fontSize: 16 }}>✉ {title}</div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.12)", color: "#D7DEE6", border: 0, borderRadius: 4, padding: "4px 8px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ padding: 16, display: "grid", gap: 8 }}>
          {err && <div style={{ fontSize: 12, color: "#8E2C20" }}>{err}</div>}
          {!d && !err && <div style={{ fontSize: 12, color: "#6B7280" }}>Drafting…</div>}
          {d && (
            <>
              <label style={{ fontSize: 12, color: "#6B7280" }}>To<input style={F} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
              <label style={{ fontSize: 12, color: "#6B7280" }}>Cc<input style={F} value={f.cc} onChange={(e) => setF({ ...f, cc: e.target.value })} /></label>
              <label style={{ fontSize: 12, color: "#6B7280" }}>Subject<input style={F} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></label>
              <label style={{ fontSize: 12, color: "#6B7280" }}>Message<textarea style={{ ...F, minHeight: 280, fontFamily: "inherit", lineHeight: 1.5 }} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></label>
              <div style={{ fontSize: 12, background: "#F3F7FB", border: "1px solid #E2E0DA", borderRadius: 4, padding: "8px 12px" }}>📎 {attachment(d)}</div>
              <div style={{ fontSize: 11, color: "#8B8F87" }}>Goes from Vinay&apos;s connected Gmail, as every HRMS mail does. Edit anything above, then send.</div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={onClose} style={{ background: "#F4F2EC", color: "#1F2328", border: 0, borderRadius: 4, padding: "8px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
                <button onClick={send} disabled={sending} style={{ background: "#2A6B39", color: "#fff", border: 0, borderRadius: 4, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{sending ? "Sending…" : "Send with the attachment"}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
