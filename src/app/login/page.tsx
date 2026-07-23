"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { LOGO } from "@/lib/logo";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("raghu@nandan.co.in");
  const [pw, setPw] = useState("");
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
    setBusy(false);
    if (error) {
      setErr("Invalid email or password");
      return;
    }
    router.replace("/");
    router.refresh();
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "#16232F" }}
    >
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
              WORKS PLANNING SUITE
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
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          className="w-full border rounded px-2 py-2 mb-4 text-sm"
          style={{ borderColor: "#D9D6CD" }}
          autoComplete="current-password"
        />
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
