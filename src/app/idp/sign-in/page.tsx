"use client";
import { useState } from "react";
import { LOGO } from "@/lib/logo";

/**
 * /idp/sign-in — for the people who have no Genie login (Dr Raghu, 7 Sep
 * 2026). Their personal e-mail and the password HR sent them. Deliberately
 * one screen, big type, and nothing else on it: most of the people who use
 * this are standing on a shop floor holding a phone.
 */
export default function IdpSignIn() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/idp/login", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password: pw }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Could not sign you in.");
      window.location.href = "/idp";
    } catch (err) { setMsg(err instanceof Error ? err.message : String(err)); }
    setBusy(false);
  };

  const box: React.CSSProperties = {
    width: "100%", border: "1px solid #D9D6CD", borderRadius: 8,
    padding: "13px 12px", fontSize: 16, marginTop: 6, background: "#fff",
  };
  return (
    <div style={{ minHeight: "100vh", background: "var(--paper, #EFEDE7)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "28px 16px" }}>
      <form onSubmit={go} style={{ width: "min(420px, 100%)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO} alt="Nandan GSE" style={{ height: 34 }} />
        <div style={{ fontSize: 24, fontWeight: 800, marginTop: 18, lineHeight: 1.2 }}>Your IDP page</div>
        <div style={{ fontSize: 14, color: "#5A6B7B", marginTop: 6, lineHeight: 1.6 }}>
          Sign in with your <b>personal e-mail</b> and the password HR sent you.
          If you already have a Nandan Genie login, you do not need this — open <b>genie.nandan.co.in</b> and go to IDP.
        </div>

        <label style={{ display: "block", marginTop: 18, fontSize: 13, fontWeight: 700, color: "#3D566E" }}>
          Personal e-mail
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="username"
            inputMode="email" autoCapitalize="none" spellCheck={false} placeholder="yourname@gmail.com" style={box} />
        </label>
        <label style={{ display: "block", marginTop: 12, fontSize: 13, fontWeight: 700, color: "#3D566E" }}>
          Password
          <input value={pw} onChange={(e) => setPw(e.target.value)} type="password" autoComplete="current-password"
            placeholder="the one in HR's mail" style={box} />
        </label>

        <button type="submit" disabled={busy || !email.trim() || !pw}
          style={{ width: "100%", marginTop: 18, padding: "14px 0", borderRadius: 8, border: "none",
            background: busy || !email.trim() || !pw ? "#B9BEC4" : "var(--accent, #E8600A)",
            color: "#fff", fontWeight: 800, fontSize: 16, cursor: "pointer" }}>
          {busy ? "signing you in…" : "Sign in"}
        </button>

        {msg && <div style={{ marginTop: 14, fontSize: 14, fontWeight: 600, color: "#B3261E", lineHeight: 1.5 }}>{msg}</div>}

        <div style={{ marginTop: 22, fontSize: 12.5, color: "#8B8F87", lineHeight: 1.7 }}>
          Forgotten it, or never received one? Write to <b>hr@nandan.co.in</b> and HR will send it again.<br />
          Use your own personal e-mail — never a shared company one, because your salary slip opens here.
        </div>
      </form>
    </div>
  );
}
