"use client";
import { useEffect, useRef, useState } from "react";
import SetPassword from "./SetPassword";
import { api, Avatar, btn, Card, input, K, label, serif, type Boot } from "./shared";

/**
 * My profile — the onboarding form on first login (Dr Raghu, 1 Oct 2026:
 * "we should have an onboarding form the guys will fill up including their
 * profile pic and family"), and the same page later from the account menu.
 * Birthdays here feed the birthday mails; the legal tick decides whose.
 */
type FamRow = { relation: string; name: string; birthday: string; is_legal: boolean; mail_wishes: boolean };
export default function Profile({ boot, reload, onboarding = false, onDone }: { boot: Boot; reload: () => void; onboarding?: boolean; onDone?: () => void }) {
  const me = boot.members.find((m) => m.id === boot.me.id)!;
  const [f, setF] = useState({ short_name: me.short_name || "", company: me.company || "", sector: me.sector || "", designation: me.designation || "", phone: me.phone || "", linkedin: me.linkedin || "", city: me.city || "Mumbai", birthday: me.birthday || "", stay_at: me.stay_at || "", office_at: me.office_at || "", about: me.about || "" });
  const [fam, setFam] = useState<FamRow[]>(boot.family.filter((x) => x.member_id === me.id).map((x) => ({ relation: x.relation, name: x.name, birthday: x.birthday || "", is_legal: x.is_legal, mail_wishes: x.mail_wishes })));
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null);
  const [pw, setPw] = useState(location.pathname.endsWith("/password"));
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!fam.length && onboarding) setFam([{ relation: "spouse", name: "", birthday: "", is_legal: true, mail_wishes: true }]); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  const save = async (finish: boolean) => {
    setBusy(true); setMsg(null);
    try {
      await api("/api/kindle/members", { action: "profile", fields: f });
      await api("/api/kindle/members", { action: "family", rows: fam });
      if (finish) { await api("/api/kindle/members", { action: "onboarded" }); reload(); onDone?.(); return; }
      setMsg("Saved."); reload();
    } catch (e) { setMsg(String((e as Error).message || e)); }
    setBusy(false);
  };
  const upload = async (fl: File) => {
    const fd = new FormData(); fd.append("file", fl);
    setBusy(true);
    try { const r = await fetch("/api/kindle/photo", { method: "POST", body: fd }); const j = await r.json(); if (!r.ok) throw new Error(j.error); reload(); } catch (e) { setMsg(String((e as Error).message || e)); }
    setBusy(false);
  };
  if (pw) return <div style={{ maxWidth: 440 }}><button onClick={() => setPw(false)} style={{ background: "none", border: "none", color: K.emberDark, fontWeight: 700, cursor: "pointer", padding: 0, fontSize: 13, marginBottom: 10 }}>← Profile</button><SetPassword email={me.email} inline onDone={() => { setPw(false); setMsg("Password changed."); }} /></div>;
  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 820 }}>
      <div>
        <h1 style={{ ...serif, fontSize: 26, margin: 0 }}>{onboarding ? `Welcome to Kindle, ${me.name.split(" ")[0]}.` : "My profile"}</h1>
        <p style={{ color: K.dim, margin: "4px 0 0" }}>{onboarding ? "Two minutes: your picture, how to reach you, and your family's birthdays so the group can wish them. Only the ten of us see any of it." : "What the directory shows, and whose birthdays the group is told about."}</p>
      </div>
      <Card title="Picture and contact">
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ textAlign: "center" }}>
            <Avatar m={me} size={96} />
            <input ref={file} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            <div><button onClick={() => file.current?.click()} style={{ ...btn("ghost", { marginTop: 8, padding: "5px 10px", fontSize: 12 }) }}>{me.photo_path ? "Change picture" : "Add a picture"}</button></div>
          </div>
          <div style={{ flex: 1, minWidth: 260, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
            <Field l="What the room calls you" k="short_name" f={f} set={set} />
            <Field l="Mobile" k="phone" f={f} set={set} />
            <Field l="Company" k="company" f={f} set={set} />
            <Field l="Your role there" k="designation" f={f} set={set} />
            <Field l="Industry" k="sector" f={f} set={set} />
            <Field l="LinkedIn" k="linkedin" f={f} set={set} ph="linkedin.com/in/…" />
            <div><label style={label}>Birthday</label><input style={input} type="date" value={f.birthday} onChange={(e) => set("birthday", e.target.value)} /></div>
            <Field l="City" k="city" f={f} set={set} />
            <Field l="Stay at (area)" k="stay_at" f={f} set={set} />
            <Field l="Office at (area)" k="office_at" f={f} set={set} />
          </div>
        </div>
        <div style={{ marginTop: 10 }}><label style={label}>About you — a few lines the others would like to read</label><textarea style={{ ...input, minHeight: 70 }} value={f.about} onChange={(e) => set("about", e.target.value)} /></div>
        <div style={{ fontSize: 12, color: K.muted, marginTop: 6 }}>Login e-mail: {me.email} — the facilitator changes this if it ever needs to.</div>
      </Card>
      <Card title="Family" right="birthday wishes go to the whole group for the legal spouse and legal children">
        <div style={{ display: "grid", gap: 8 }}>
          {fam.map((r, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "110px 1fr 150px auto auto", gap: 8, alignItems: "center" }} className="kindle-fam">
              <select style={input} value={r.relation} onChange={(e) => setFam(fam.map((x, j) => j === i ? { ...x, relation: e.target.value } : x))}>{["spouse", "child", "parent", "other"].map((o) => <option key={o}>{o}</option>)}</select>
              <input style={input} placeholder="Name" value={r.name} onChange={(e) => setFam(fam.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
              <input style={input} type="date" value={r.birthday} onChange={(e) => setFam(fam.map((x, j) => j === i ? { ...x, birthday: e.target.value } : x))} />
              <label style={{ fontSize: 12, color: K.dim, whiteSpace: "nowrap" }}><input type="checkbox" checked={r.is_legal} onChange={(e) => setFam(fam.map((x, j) => j === i ? { ...x, is_legal: e.target.checked } : x))} /> legal</label>
              <button onClick={() => setFam(fam.filter((_, j) => j !== i))} style={{ ...btn("ghost", { padding: "6px 9px" }) }} title="Remove">✕</button>
            </div>
          ))}
        </div>
        <button onClick={() => setFam([...fam, { relation: fam.length ? "child" : "spouse", name: "", birthday: "", is_legal: true, mail_wishes: true }])} style={{ ...btn("ghost", { marginTop: 10 }) }}>+ Add</button>
      </Card>
      {msg && <div style={{ fontSize: 13, color: msg === "Saved." || msg.includes("changed") ? K.green : K.red }}>{msg}</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {onboarding ? (<>
          <button onClick={() => save(true)} disabled={busy} style={btn("primary", { padding: "11px 18px" })}>{busy ? "Saving…" : "Save and enter Kindle"}</button>
          <button onClick={async () => { await api("/api/kindle/members", { action: "onboarded" }); reload(); onDone?.(); }} style={btn("ghost")}>Later</button>
        </>) : (<>
          <button onClick={() => save(false)} disabled={busy} style={btn("primary")}>{busy ? "Saving…" : "Save"}</button>
          <button onClick={() => setPw(true)} style={btn("ghost")}>Change password</button>
        </>)}
      </div>
      <style>{`@media (max-width: 640px){ .kindle-fam { grid-template-columns: 1fr 1fr !important; } }`}</style>
    </div>
  );
}
function Field({ l, k, f, set, ph }: { l: string; k: string; f: Record<string, string>; set: (k: string, v: string) => void; ph?: string }) {
  return <div><label style={label}>{l}</label><input style={input} value={f[k]} placeholder={ph} onChange={(e) => set(k, e.target.value)} /></div>;
}
