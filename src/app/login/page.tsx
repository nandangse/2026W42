"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { LOGO } from "@/lib/logo";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password: pw,
    });
    if (error) {
      setBusy(false);
      setErr("Invalid email or password");
      return;
    }
    // keep the loading overlay up through the redirect — busy stays true
    router.replace("/");
    router.refresh();
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "#16232F" }}
    >
      {busy && (
        <div
          className="fixed inset-0 flex flex-col items-center justify-center gap-4"
          style={{ background: "rgba(13,22,31,0.92)", zIndex: 100 }}
        >
          <div className="rounded bg-white px-3 py-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO} alt="Nandan GSE" style={{ height: 40 }} />
          </div>
          <div
            className="animate-spin rounded-full"
            style={{
              width: 36,
              height: 36,
              border: "3px solid #22303C",
              borderTopColor: "#E8600A",
            }}
          />
          <div className="text-sm font-semibold" style={{ color: "#F5B32B" }}>
            Signing in · loading your boards…
          </div>
        </div>
      )}
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-lg p-6"
        style={{ background: "#fff", borderTop: "4px solid #E8600A" }}
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="rounded bg-white px-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO} alt="Nandan GSE" style={{ height: 36 }} />
          </div>
          <div>
            <div
              className="text-xs tracking-widest font-bold"
              style={{ color: "#E8600A" }}
            >
              GENIE
            </div>
            <div className="text-sm font-bold" style={{ color: "#16232F" }}>
              Milestones · Load · Tasking · Delivery
            </div>
          </div>
        </div>
        <label className="block text-xs font-semibold mb-1" style={{ color: "#5A6672" }}>
          Email
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border rounded px-2 py-2 mb-3 text-sm"
          style={{ borderColor: "#D9D6CD" }}
          autoComplete="username"
        />
        <label className="block text-xs font-semibold mb-1" style={{ color: "#5A6672" }}>
          Password
        </label>
        <div className="relative mb-4">
          <input
            type={showPw ? "text" : "password"}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            className="w-full border rounded px-2 py-2 text-sm"
            style={{ borderColor: "#D9D6CD", paddingRight: 38 }}
            autoComplete="current-password"
          />
          <button
            type="button"
            onClick={() => setShowPw((s) => !s)}
            className="absolute"
            style={{ right: 8, top: "50%", transform: "translateY(-50%)", color: "#8A94A0", fontSize: 15 }}
            title={showPw ? "Hide password" : "Show password"}
            aria-label={showPw ? "Hide password" : "Show password"}
          >
            {showPw ? "🙈" : "👁"}
          </button>
        </div>
        {err && (
          <div className="text-xs mb-3 font-semibold" style={{ color: "#B3261E" }}>
            {err}
          </div>
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded py-2 font-bold text-sm"
          style={{ background: "#E8600A", color: "#fff", opacity: busy ? 0.6 : 1 }}
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <div className="text-xs mt-4 text-center" style={{ color: "#8A94A0" }}>
          🔒 Restricted — authorised planning users only
        </div>
      </form>
    </div>
  );
}
