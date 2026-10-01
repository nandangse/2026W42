"use client";
import { useEffect, useState } from "react";
import KindleLogo from "./KindleLogo";
import { api, btn, input, K, label, serif } from "./shared";

/**
 * /kindle/login — the ten Kindlers' own door. E-mail and password; or the
 * one-time invite link from the welcome mail, which opens the site and then
 * insists on a password before anything else is shown.
 */
export default function KindleLogin({ invite }: { invite?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "err" | "ok"; text: string } | null>(null);
  const [mode, setMode] = useState<"login" | "forgot">("login");

  useEffect(() => {
    if (!invite) return;
    setBusy(true);
    api("/api/kindle/auth", { action: "invite", token: invite })
      .then(() => { window.location.replace("/kindle"); })
      .catch((e) => { setMsg({ kind: "err", text: String(e.message || e) }); setBusy(false); });
  }, [invite]);

  const go = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    try {
      if (mode === "forgot") {
        const r = await api<{ note?: string }>("/api/kindle/auth", { action: "forgot", email });
        setMsg({ kind: "ok", text: r.note || "Done." });
      } else {
        await api("/api/kindle/auth", { action: "login", email, password });
        window.location.replace("/kindle");
        return;
      }
    } catch (err) { setMsg({ kind: "err", text: String((err as Error).message || err) }); }
    setBusy(false);
  };

  return (
    <main style={{ minHeight: "100vh", background: `radial-gradient(1200px 600px at 20% -10%, #fde7cf 0%, ${K.paper} 55%)`, display: "grid", placeItems: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 22 }}><KindleLogo size={48} /></div>
        <form onSubmit={go} style={{ background: "#fff", border: `1px solid ${K.line}`, borderRadius: 18, padding: 24, boxShadow: "0 10px 30px rgba(42,36,32,.08)" }}>
          <h1 style={{ ...serif, fontSize: 22, margin: "0 0 4px", color: K.ink }}>{mode === "forgot" ? "A fresh link" : "Sign in"}</h1>
          <p style={{ margin: "0 0 16px", fontSize: 13, color: K.muted }}>
            {invite && busy ? "Opening your invitation…" : mode === "forgot" ? "Your official e-mail, as it is in the directory." : "The Ascent Kindle Trust Group. Members only."}
          </p>
          <label style={label}>E-mail</label>
          <input style={input} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={busy} />
          {mode === "login" && (<>
            <div style={{ height: 12 }} />
            <label style={label}>Password</label>
            <input style={input} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={busy} />
          </>)}
          {msg && <div style={{ marginTop: 12, fontSize: 13, color: msg.kind === "err" ? K.red : K.green }}>{msg.text}</div>}
          <button type="submit" disabled={busy} style={{ ...btn("primary", { width: "100%", marginTop: 16, padding: "11px 14px", fontSize: 14 }), opacity: busy ? 0.6 : 1 }}>
            {busy ? "One moment…" : mode === "forgot" ? "Make me a link" : "Open Kindle"}
          </button>
          <div style={{ marginTop: 14, textAlign: "center", fontSize: 12 }}>
            <button type="button" onClick={() => { setMode(mode === "login" ? "forgot" : "login"); setMsg(null); }} style={{ background: "none", border: "none", color: K.blue, cursor: "pointer", fontSize: 12 }}>
              {mode === "login" ? "Forgotten your password?" : "Back to sign in"}
            </button>
          </div>
        </form>
        <p style={{ textAlign: "center", fontSize: 11, color: K.muted, marginTop: 16 }}>What is said in the room stays in the room. This site is private to the ten of us.</p>
      </div>
    </main>
  );
}
