"use client";
/**
 * The front door (Dr Raghu, 6 Sep 2026: "change the login page to Nandan
 * Genie. Also the planning reference is also wrong ... Each user can login
 * by OTP from their mail ID or by password or whatsapp (when we make it)").
 *
 * Two ways in, one form: a password, or a six-digit code mailed to the
 * address. The code needs no password to exist, which is how the labour
 * logins made from the HRMS master sign in the first time. Forgot password
 * mails a reset link. WhatsApp waits for the Meta route.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { LOGO } from "@/lib/logo";

type Mode = "password" | "code";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const addr = () => email.trim().toLowerCase();
  const done = () => { router.replace("/"); router.refresh(); };

  const submitPassword = async () => {
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email: addr(), password: pw });
    if (error) { setBusy(false); setErr("That email and password do not match."); return; }
    done();
  };
  const sendCode = async () => {
    const { error } = await supabaseBrowser().auth.signInWithOtp({ email: addr(), options: { shouldCreateUser: false } });
    setBusy(false);
    if (error) { setErr(/signups not allowed|not found|user/i.test(error.message) ? "No Genie login has that email. Ask HR." : error.message); return; }
    setSent(true); setNote(`A six-digit code is on its way to ${addr()}. It lasts a few minutes.`);
  };
  /**
   * THE CODE, AND WHY IT WAS REFUSED (Dr Raghu, 8 Sep 2026: "the supabase
   * login code doesnt work").
   *
   * Two faults, both here. First, this said "wrong or expired" whatever
   * Supabase actually answered — a rate limit, a disabled account and a
   * genuinely stale code all read the same, so there was no way to tell what
   * to do next. Their words are shown now, under ours.
   *
   * Second, a project whose e-mail template is built on {{ .ConfirmationURL }}
   * issues a MAGIC-LINK token, and one built on {{ .Token }} issues an e-mail
   * token; the two verify under different `type`s and only one was tried. So
   * a perfectly good code was refused because it was the other kind. Both are
   * tried now, in the order most projects are set up.
   */
  const verifyCode = async () => {
    const sb = supabaseBrowser();
    const token = code.trim().replace(/\s+/g, "");
    let error = (await sb.auth.verifyOtp({ email: addr(), token, type: "email" })).error;
    if (error) error = (await sb.auth.verifyOtp({ email: addr(), token, type: "magiclink" })).error;
    if (error) {
      setBusy(false);
      const said = String(error.message || "").trim();
      setErr(/expired|invalid/i.test(said)
        ? `That code is wrong or has expired — send a new one. (${said})`
        : `Supabase refused it: ${said}`);
      return;
    }
    done();
  };
  const forgot = async () => {
    if (!addr()) { setErr("Type your email first."); return; }
    setErr(""); setBusy(true);
    const { error } = await supabaseBrowser().auth.resetPasswordForEmail(addr(), { redirectTo: `${window.location.origin}/` });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setNote(`A reset link is on its way to ${addr()}.`);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(""); setNote(""); setBusy(true);
    if (!addr()) { setBusy(false); setErr("Type your email."); return; }
    if (mode === "password") return submitPassword();
    if (!sent) return sendCode();
    return verifyCode();
  };

  const tab = (m: Mode, label: string) => (
    <button type="button" onClick={() => { setMode(m); setErr(""); setNote(""); setSent(false); }}
      className="flex-1 py-1.5 text-xs font-bold rounded"
      style={{ background: mode === m ? "var(--navy)" : "transparent", color: mode === m ? "#fff" : "var(--dim)" }}>
      {label}
    </button>
  );

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "var(--navy)" }}>
      {busy && mode === "password" && (
        <div className="fixed inset-0 flex flex-col items-center justify-center gap-4" style={{ background: "rgba(13,22,31,0.92)", zIndex: 100 }}>
          <div className="rounded bg-white px-3 py-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO} alt="Nandan GSE" style={{ height: 40 }} />
          </div>
          <div className="animate-spin rounded-full" style={{ width: 36, height: 36, border: "3px solid #22303C", borderTopColor: "var(--accent)" }} />
          <div className="text-sm font-semibold" style={{ color: "var(--amber)" }}>Signing in · opening Genie…</div>
        </div>
      )}
      <form onSubmit={submit} className="w-full max-w-sm rounded-lg p-6" style={{ background: "#fff", borderTop: "4px solid #E8600A" }}>
        <div className="flex items-center gap-3 mb-5">
          <div className="rounded bg-white px-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO} alt="Nandan GSE" style={{ height: 36 }} />
          </div>
          <div>
            <div className="text-xs tracking-widest font-bold" style={{ color: "var(--accent)" }}>NANDAN GENIE</div>
            <div className="text-sm font-bold" style={{ color: "var(--navy)" }}>One login for every door</div>
          </div>
        </div>

        <div className="flex gap-1 rounded p-1 mb-4" style={{ background: "#F4F2EC" }}>
          {tab("password", "🔑 Password")}
          {tab("code", "✉ Code by email")}
          <button type="button" disabled className="flex-1 py-1.5 text-xs font-bold rounded" style={{ color: "#B8B5AC" }} title="Coming — sign in from WhatsApp">💬 WhatsApp</button>
        </div>

        <label className="block text-xs font-semibold mb-1" style={{ color: "var(--dim)" }}>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={sent}
          className="w-full border rounded px-2 py-2 mb-3 text-sm" style={{ borderColor: "#D9D6CD", fontSize: 16 }} autoComplete="username" inputMode="email" />

        {mode === "password" && (
          <>
            <label className="block text-xs font-semibold mb-1" style={{ color: "var(--dim)" }}>Password</label>
            <div className="relative mb-2">
              <input type={showPw ? "text" : "password"} value={pw} onChange={(e) => setPw(e.target.value)}
                className="w-full border rounded px-2 py-2 text-sm" style={{ borderColor: "#D9D6CD", paddingRight: 38, fontSize: 16 }} autoComplete="current-password" />
              <button type="button" onClick={() => setShowPw((s) => !s)} className="absolute" style={{ right: 8, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", fontSize: 15 }}
                aria-label={showPw ? "Hide password" : "Show password"}>{showPw ? "🙈" : "👁"}</button>
            </div>
            <div className="text-right mb-3">
              <button type="button" onClick={forgot} className="text-xs font-semibold" style={{ color: "var(--blue)" }}>Forgot password?</button>
            </div>
          </>
        )}

        {mode === "code" && sent && (
          <>
            <label className="block text-xs font-semibold mb-1" style={{ color: "var(--dim)" }}>The six-digit code from the mail</label>
            <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" autoComplete="one-time-code"
              className="w-full border rounded px-2 py-2 mb-3 text-sm tnum" style={{ borderColor: "#D9D6CD", fontSize: 20, letterSpacing: 6, textAlign: "center" }} />
          </>
        )}

        {err && <div className="text-xs mb-3 font-semibold" style={{ color: "var(--red)" }}>{err}</div>}
        {note && <div className="text-xs mb-3 font-semibold" style={{ color: "var(--green)" }}>{note}</div>}

        <button type="submit" disabled={busy} className="w-full rounded py-2.5 font-bold text-sm" style={{ background: "var(--accent)", color: "#fff", opacity: busy ? 0.6 : 1 }}>
          {busy ? "One moment…" : mode === "password" ? "Sign in" : sent ? "Sign in with the code" : "Send me a code"}
        </button>
        {mode === "code" && sent && (
          <button type="button" onClick={() => { setSent(false); setCode(""); setNote(""); }} className="w-full mt-2 text-xs font-semibold" style={{ color: "var(--dim)" }}>Send a new code</button>
        )}
        <div className="text-xs mt-4 text-center" style={{ color: "var(--muted)" }}>🔒 Nandan GSE people only</div>
      </form>
    </div>
  );
}
