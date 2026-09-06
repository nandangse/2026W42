"use client";
// split out of PlanningSuite.tsx (Genie 5.0.1.1) — one file per tab, loaded when opened
import React, { useEffect, useState } from "react";

import { api } from "@/lib/api";

import { supabaseBrowser } from "@/lib/supabase/browser";

import { fmtFull, initials } from "@/lib/schedule";

import { Role } from "./shared";

// ============================ account modals ============================
export function ProfileRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2" style={{ borderBottom: "1px solid #F4F2EC" }}>
      <div className="text-xs font-semibold flex-shrink-0" style={{ color: "var(--muted)" }}>{label}</div>
      <div className="text-sm text-right" style={{ color: "var(--navy)" }}>
        <div className="font-semibold break-words">{value}</div>
        {hint && <div className="text-xs" style={{ color: "var(--muted)" }}>{hint}</div>}
      </div>
    </div>
  );
}

export function ProfileModal({
  me,
  onClose,
  onChangePassword,
}: {
  me: { email: string; initials: string | null; displayName: string | null; erpOwner: string | null; role: Role };
  onClose: () => void;
  onChangePassword: () => void;
}) {
  return (
    <div onClick={onClose} className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(13,22,31,0.75)", zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg w-full" style={{ maxWidth: 400, borderTop: "5px solid #E8600A" }}>
        <div className="flex items-center gap-3 p-5 pb-4">
          <span
            className="rounded-full font-bold flex items-center justify-center flex-shrink-0"
            style={{ width: 46, height: 46, fontSize: 17, background: me.initials ? "var(--accent)" : "var(--red)", color: "#fff" }}
          >
            {me.initials || "??"}
          </span>
          <div className="min-w-0">
            <div className="text-lg font-bold leading-tight truncate" style={{ color: "var(--navy)" }}>{me.displayName || me.email.split("@")[0]}</div>
            <div className="text-xs truncate" style={{ color: "var(--muted)" }}>{me.email}</div>
          </div>
        </div>
        <div className="px-5">
          <ProfileRow label="Role" value={me.role.replace("_", " ")} />
          <ProfileRow
            label="Initials"
            value={me.initials || "not set"}
            hint={me.initials ? "the key your tasks are matched on" : "ask an admin to assign yours"}
          />
          <ProfileRow label="ERP owner name" value={me.erpOwner || "—"} hint={me.erpOwner ? undefined : "used to match ERP-owned jobs"} />
        </div>
        <ProfileSelf />
        <div className="text-xs px-5 pt-3" style={{ color: "var(--muted)" }}>
          Name, initials, role and ERP owner are set by an admin in Admin → User management.
        </div>
        <div className="flex gap-2 p-5 pt-4">
          <button onClick={onChangePassword} className="flex-1 py-2 rounded font-bold text-sm" style={{ background: "#F4F2EC", color: "var(--navy)" }}>
            🔑 Change Password
          </button>
          <button onClick={onClose} className="flex-1 py-2 rounded font-bold text-sm" style={{ background: "var(--ink)", color: "#fff" }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The part of the profile a person keeps current themselves: their WhatsApp
 * number — and, where the admin has marked OAuth Available, the door to the
 * Gmail connection (opened together with an administrator, in the comms
 * build). Everything else on the card stays admin-set.
 */
export function ProfileSelf() {
  const [wa, setWa] = useState("");
  const [oauthOk, setOauthOk] = useState(false);
  const [connectedAt, setConnectedAt] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api.get("/api/me/profile")
      .then((r: { whatsapp_no?: string | null; oauth_available?: boolean; oauth_connected_at?: string | null }) => {
        setWa(r.whatsapp_no || "");
        setOauthOk(!!r.oauth_available);
        setConnectedAt(r.oauth_connected_at || null);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const save = async () => {
    setBusy(true); setMsg("");
    try {
      const r = await api.post("/api/me/profile", { whatsapp_no: wa });
      setWa((r as { whatsapp_no?: string | null }).whatsapp_no || "");
      setMsg("Saved.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  if (!loaded) return null;
  return (
    <div className="px-5 pt-3">
      <div className="text-xs font-bold mb-1" style={{ color: "var(--muted)", letterSpacing: ".04em" }}>WHATSAPP NUMBER</div>
      <div className="flex gap-2">
        <input
          value={wa}
          onChange={(e) => setWa(e.target.value)}
          placeholder="+91 98200 12345"
          className="flex-1 rounded border px-2 py-1.5 text-sm tnum"
          style={{ borderColor: "var(--line)" }}
        />
        <button onClick={save} disabled={busy}
          className="rounded px-3 py-1.5 text-xs font-bold"
          style={{ background: busy ? "#B8B5AC" : "var(--accent)", color: "#fff" }}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
      {msg && <div className="text-xs mt-1 font-semibold" style={{ color: msg === "Saved." ? "var(--green)" : "var(--red)" }}>{msg}</div>}

      <div className="mt-3 rounded p-2.5" style={{ background: "#F4F2EC" }}>
        <div className="text-xs font-bold" style={{ color: "var(--navy)" }}>✉ Gmail connection</div>
        {connectedAt ? (
          <div className="text-xs mt-0.5" style={{ color: "var(--green)", fontWeight: 700 }}>Connected · {fmtFull(String(connectedAt))}</div>
        ) : oauthOk ? (
          <div className="mt-1">
            <a href="/api/crm/gmail/connect"
              className="inline-block rounded px-3 py-1.5 text-xs font-bold"
              style={{ background: "var(--accent)", color: "#fff", textDecoration: "none" }}>
              ✉ Connect Gmail
            </a>
            <div className="text-xs mt-1" style={{ color: "var(--muted)", lineHeight: 1.45 }}>
              Google will ask you to allow reading and sending your @nandan.co.in mail.
              The token lives in the Vault; the CRM never sees your password.
            </div>
          </div>
        ) : (
          <div className="text-xs mt-0.5" style={{ color: "var(--muted)", lineHeight: 1.5 }}>
            Not enabled for you yet — an admin marks <b>OAuth Available</b> on your account first.
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Self-service password change. The current password is verified first (a
 * re-sign-in with the same account), so a walked-away-from session can't be
 * used to lock the real owner out.
 */
export function ChangePasswordModal({ email, onClose }: { email: string; onClose: () => void }) {
  const [cur, setCur] = useState("");
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (pw1.length < 8) return setErr("New password must be at least 8 characters");
    if (pw1 !== pw2) return setErr("The two new passwords don't match");
    if (pw1 === cur) return setErr("New password must be different from the current one");
    setBusy(true);
    const supabase = supabaseBrowser();
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password: cur });
    if (signInErr) {
      setBusy(false);
      return setErr("Current password is incorrect");
    }
    const { error } = await supabase.auth.updateUser({ password: pw1 });
    setBusy(false);
    if (error) return setErr(error.message || "Could not change the password");
    setDone(true);
  };

  const field = (label: string, value: string, set: (v: string) => void, autoComplete: string) => (
    <>
      <label className="block text-xs font-semibold mb-1" style={{ color: "var(--dim)" }}>{label}</label>
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => set(e.target.value)}
        className="w-full border rounded px-2 py-2 mb-3 text-sm"
        style={{ borderColor: "#D9D6CD" }}
        autoComplete={autoComplete}
      />
    </>
  );

  return (
    <div onClick={onClose} className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(13,22,31,0.75)", zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg p-5 w-full" style={{ maxWidth: 380, borderTop: "5px solid #E8600A" }}>
        <div className="text-xs font-bold tracking-widest" style={{ color: "var(--accent)" }}>CHANGE PASSWORD</div>
        <div className="text-xs mb-4 mt-1" style={{ color: "var(--muted)" }}>{email}</div>
        {done ? (
          <>
            <div className="text-sm font-semibold" style={{ color: "#2E7D32" }}>✓ Password changed. Use the new one next time you sign in.</div>
            <button onClick={onClose} className="w-full mt-4 py-2 rounded font-bold text-sm" style={{ background: "var(--ink)", color: "#fff" }}>Done</button>
          </>
        ) : (
          <form onSubmit={submit}>
            {field("Current password", cur, setCur, "current-password")}
            {field("New password", pw1, setPw1, "new-password")}
            {field("Confirm new password", pw2, setPw2, "new-password")}
            <label className="flex items-center gap-2 text-xs mb-3" style={{ color: "var(--dim)" }}>
              <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
              Show passwords
            </label>
            {err && <div className="text-xs mb-3 font-semibold" style={{ color: "var(--red)" }}>{err}</div>}
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="flex-1 py-2 rounded font-bold text-sm" style={{ background: "#F4F2EC", color: "var(--navy)" }}>Cancel</button>
              <button type="submit" disabled={busy} className="flex-1 py-2 rounded font-bold text-sm" style={{ background: "var(--accent)", color: "#fff", opacity: busy ? 0.6 : 1 }}>
                {busy ? "Saving…" : "Change password"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}