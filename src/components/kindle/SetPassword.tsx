"use client";
import { useState } from "react";
import KindleLogo from "./KindleLogo";
import { api, btn, input, K, label, serif } from "./shared";

/** First login, or a change later: ten characters, typed twice. Nothing else is shown until this is done. */
export default function SetPassword({ email, onDone, inline = false }: { email: string; onDone: () => void; inline?: boolean }) {
  const [a, setA] = useState(""); const [b, setB] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    if (a !== b) { setErr("The two do not match."); return; }
    setBusy(true);
    try { await api("/api/kindle/auth", { action: "set_password", password: a }); onDone(); }
    catch (x) { setErr(String((x as Error).message || x)); setBusy(false); }
  };
  const form = (
    <form onSubmit={save} style={{ background: "#fff", border: `1px solid ${K.line}`, borderRadius: 18, padding: 24, maxWidth: 420, boxShadow: inline ? "none" : "0 10px 30px rgba(42,36,32,.08)" }}>
      <h1 style={{ ...serif, fontSize: 22, margin: "0 0 4px" }}>{inline ? "Change password" : "Welcome. Set your password."}</h1>
      <p style={{ margin: "0 0 16px", fontSize: 13, color: K.muted }}>{email} · at least ten characters, and not your e-mail name. Every other device is signed out when you change it.</p>
      <label style={label}>New password</label>
      <input style={input} type="password" autoComplete="new-password" value={a} onChange={(e) => setA(e.target.value)} required minLength={10} />
      <div style={{ height: 12 }} />
      <label style={label}>Once more</label>
      <input style={input} type="password" autoComplete="new-password" value={b} onChange={(e) => setB(e.target.value)} required minLength={10} />
      {err && <div style={{ marginTop: 10, color: K.red, fontSize: 13 }}>{err}</div>}
      <button type="submit" disabled={busy} style={{ ...btn("primary", { width: "100%", marginTop: 16, padding: "11px 14px" }), opacity: busy ? 0.6 : 1 }}>{busy ? "Saving…" : "Save and continue"}</button>
    </form>
  );
  if (inline) return form;
  return (
    <main style={{ minHeight: "100vh", background: K.paper, display: "grid", placeItems: "center", padding: 16 }}>
      <div><div style={{ display: "flex", justifyContent: "center", marginBottom: 22 }}><KindleLogo size={44} /></div>{form}</div>
    </main>
  );
}
