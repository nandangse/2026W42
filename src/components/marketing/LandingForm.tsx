"use client";
/** The ask on a landing page. Public: a stranger fills it, and it becomes a lead. */
import { useState } from "react";

const LABEL: Record<string, string> = { name: "Your name", email: "E-mail", phone: "Phone", company: "Company", message: "What do you need?" };
const TYPE: Record<string, string> = { email: "email", phone: "tel" };

export default function LandingForm({ slug, fields, cta, accent }: { slug: string; fields: string[]; cta: string; accent: string }) {
  const [v, setV] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const [err, setErr] = useState("");
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/marketing/lp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...v, slug }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "That did not go through.");
      setDone(j.thank_you || "Thank you — we have it.");
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2));
    } finally { setBusy(false); }
  };

  const inp: React.CSSProperties = { width: "100%", border: "1px solid #D9D6CD", borderRadius: 7, padding: "10px 11px", fontSize: 16, marginBottom: 10, background: "#fff", color: "#22303C" };

  if (done) return (
    <div style={{ textAlign: "center", padding: "18px 4px" }}>
      <div style={{ fontSize: 34 }}>✓</div>
      <div style={{ fontSize: 17, fontWeight: 700, margin: "8px 0" }}>{done}</div>
      <div style={{ fontSize: 13, color: "#8A94A0" }}>Nandan GSE</div>
    </div>
  );

  return (
    <form onSubmit={submit}>
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>Tell us what you need</div>
      {fields.map((f) => (
        <label key={f} style={{ display: "block" }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "#5A6672" }}>{LABEL[f] || f}</span>
          {f === "message"
            ? <textarea value={v[f] || ""} onChange={set(f)} rows={3} style={inp} />
            : <input type={TYPE[f] || "text"} value={v[f] || ""} onChange={set(f)} style={inp} autoComplete={f === "email" ? "email" : f === "phone" ? "tel" : f === "name" ? "name" : "organization"} />}
        </label>
      ))}
      {/* the honeypot: people never see it, bots fill it */}
      <input name="website_url" value={v.website_url || ""} onChange={set("website_url")} tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }} />
      {err && <div style={{ color: "#B3261E", fontSize: 13, marginBottom: 8 }}>{err}</div>}
      <button type="submit" disabled={busy} style={{ width: "100%", background: accent, color: "#fff", border: 0, borderRadius: 7, padding: "12px 14px", fontSize: 16, fontWeight: 700, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>
        {busy ? "Sending…" : cta}
      </button>
      <div style={{ fontSize: 11.5, color: "#8A94A0", marginTop: 8, lineHeight: 1.5 }}>We use this only to reply to you. No lists, no sharing.</div>
    </form>
  );
}
