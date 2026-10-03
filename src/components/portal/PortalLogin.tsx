"use client";
import { useEffect, useState } from "react";
import { LOGO } from "@/lib/logo";
import { api, btn, input, label, P } from "./shared";

/**
 * /portal/login — the customers' and suppliers' own door. E-mail and
 * password; or the one-time invite link, which opens the portal and then
 * insists on a password before anything else is shown.
 */
export default function PortalLogin({ invite, next }: { invite?: string; next?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "err" | "ok"; text: string } | null>(null);
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const land = (slug?: string | null) => { window.location.replace(next && next.startsWith("/portal") ? next : slug ? `/portal/${slug}` : "/portal"); };

  useEffect(() => {
    if (!invite) return;
    setBusy(true);
    api<{ org_slug?: string | null }>("/api/portal/auth", { action: "invite", token: invite })
      .then((r) => land(r.org_slug))
      .catch((e) => { setMsg({ kind: "err", text: String(e.message || e) }); setBusy(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invite]);

  const go = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    try {
      if (mode === "forgot") {
        const r = await api<{ note?: string }>("/api/portal/auth", { action: "forgot", email });
        setMsg({ kind: "ok", text: r.note || "Done." });
      } else {
        const r = await api<{ org_slug?: string | null }>("/api/portal/auth", { action: "login", email, password });
        land(r.org_slug); return;
      }
    } catch (err) { setMsg({ kind: "err", text: String((err as Error).message || err) }); }
    setBusy(false);
  };

  return (
    <main style={{ minHeight: "100vh", background: `radial-gradient(1000px 500px at 15% -10%, #fde3cf 0%, ${P.paper} 55%)`, display: "grid", placeItems: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO} alt="Nandan GSE" style={{ height: 44, background: "#fff", padding: "6px 12px", borderRadius: 8 }} />
        </div>
        <form onSubmit={go} style={{ background: "#fff", border: `1px solid ${P.line}`, borderRadius: 14, padding: 24, boxShadow: "0 10px 30px rgba(22,35,47,.10)" }}>
          <h1 style={{ fontSize: 20, margin: "0 0 4px", color: P.navy }}>{mode === "forgot" ? "A fresh link" : "Nandan GSE Portal"}</h1>
          <p style={{ margin: "0 0 16px", fontSize: 13, color: P.muted }}>
            {invite && busy ? "Opening your invitation…" : mode === "forgot" ? "The e-mail your login was made for." : "Your orders, your jobs, your service calls — sign in."}
          </p>
          <label style={label}>E-mail</label>
          <input style={input} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={busy} />
          {mode === "login" && (<>
            <div style={{ height: 12 }} />
            <label style={label}>Password</label>
            <input style={input} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={busy} />
          </>)}
          {msg && <div style={{ marginTop: 12, fontSize: 13, color: msg.kind === "err" ? P.red : P.green }}>{msg.text}</div>}
          <button type="submit" disabled={busy} style={{ ...btn("primary", { width: "100%", marginTop: 16, padding: "11px 14px", fontSize: 14 }), opacity: busy ? 0.6 : 1 }}>
            {busy ? "One moment…" : mode === "forgot" ? "Make me a link" : "Sign in"}
          </button>
          <div style={{ marginTop: 14, textAlign: "center", fontSize: 12 }}>
            <button type="button" onClick={() => { setMode(mode === "login" ? "forgot" : "login"); setMsg(null); }} style={{ background: "none", border: "none", color: P.blue, cursor: "pointer", fontSize: 12 }}>
              {mode === "login" ? "Forgotten your password?" : "Back to sign in"}
            </button>
          </div>
        </form>
        <p style={{ textAlign: "center", fontSize: 11, color: P.muted, marginTop: 16 }}>Nandan GSE Pvt Ltd · Private to our customers and suppliers. Nandan staff: your Genie login works here too.</p>
      </div>
    </main>
  );
}
