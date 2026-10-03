"use client";
import { useState } from "react";
import { LOGO } from "@/lib/logo";
import { api, btn, input, label, P } from "./shared";

/** First login, or a change later: ten characters, typed twice. Nothing else is shown until this is done. */
export default function SetPassword({ email, onDone, inline = false }: { email: string; onDone: () => void; inline?: boolean }) {
  const [a, setA] = useState(""); const [b, setB] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    if (a !== b) { setErr("The two do not match."); return; }
    setBusy(true);
    try { await api("/api/portal/auth", { action: "set_password", password: a }); onDone(); }
    catch (x) { setErr(String((x as Error).message || x)); setBusy(false); }
  };
  const form = (
    <form onSubmit={save} style={{ background: "#fff", border: `1px solid ${P.line}`, borderRadius: 14, padding: 24, maxWidth: 420, boxShadow: inline ? "none" : "0 10px 30px rgba(22,35,47,.10)" }}>
      <h1 style={{ fontSize: 20, margin: "0 0 4px", color: P.navy }}>{inline ? "Change password" : "Welcome. Set your password."}</h1>
      <p style={{ margin: "0 0 16px", fontSize: 13, color: P.muted }}>{email} · at least ten characters, and not your e-mail name. Every other device is signed out when you change it.</p>
      <label style={label}>New password</label>
      <input style={input} type="password" autoComplete="new-password" value={a} onChange={(e) => setA(e.target.value)} required minLength={10} />
      <div style={{ height: 12 }} />
      <label style={label}>Once more</label>
      <input style={input} type="password" autoComplete="new-password" value={b} onChange={(e) => setB(e.target.value)} required minLength={10} />
      {err && <div style={{ marginTop: 10, color: P.red, fontSize: 13 }}>{err}</div>}
      <button type="submit" disabled={busy} style={{ ...btn("primary", { width: "100%", marginTop: 16, padding: "11px 14px" }), opacity: busy ? 0.6 : 1 }}>{busy ? "Saving…" : "Save and continue"}</button>
    </form>
  );
  if (inline) return form;
  return (
    <main style={{ minHeight: "100vh", background: P.paper, display: "grid", placeItems: "center", padding: 16 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <div><div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}><img src={LOGO} alt="Nandan GSE" style={{ height: 40, background: "#fff", padding: "6px 12px", borderRadius: 8 }} /></div>{form}</div>
    </main>
  );
}
