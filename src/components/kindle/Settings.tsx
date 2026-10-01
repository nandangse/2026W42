"use client";
import { useState } from "react";
import { KINDLE_UPDATES, KINDLE_VERSION } from "@/lib/kindle/version";
import { api, Avatar, btn, Card, dmy, input, K, label, pill, ROLE_LABEL, serif, type Boot, type Member } from "./shared";

/**
 * The facilitator's gear (Dr Raghu, 1 Oct 2026: "keep an icon so that the
 * facilitator can log in and start changing whatever they want"). Members
 * and roles, invite links, the group's small settings. The constitution is
 * edited on its own page; meetings on theirs.
 */
export default function Settings({ boot, reload }: { boot: Boot; reload: () => void }) {
  const [vals, setVals] = useState({ ...boot.settings });
  const [msg, setMsg] = useState<string | null>(null);
  const [adding, setAdding] = useState(false); const [nm, setNm] = useState(""); const [em, setEm] = useState("");
  const saveSettings = async () => { try { await api("/api/kindle/settings", { values: vals }); setMsg("Settings saved."); reload(); } catch (e) { setMsg(String((e as Error).message || e)); } };
  const [mailing, setMailing] = useState(false); const [mailResult, setMailResult] = useState<{ name: string; email: string; result: string }[] | null>(null);
  const mailAll = async (ids?: string[]) => {
    const who = ids ? boot.members.filter((m) => ids.includes(m.id)).map((m) => m.short_name || m.name).join(", ") : "everyone who has not signed in yet";
    if (!confirm(`Send the welcome mail from raghu@nandan.co.in to ${who}? Each gets a fresh 72-hour link.`)) return;
    setMailing(true); setMailResult(null);
    try { const r = await api<{ results: { name: string; email: string; result: string }[] }>("/api/kindle/mail", { action: "welcome", ids }); setMailResult(r.results); reload(); }
    catch (e) { setMsg(String((e as Error).message || e)); }
    setMailing(false);
  };
  const add = async () => { try { await api("/api/kindle/members", { action: "add", name: nm, email: em }); setAdding(false); setNm(""); setEm(""); reload(); } catch (e) { setMsg(String((e as Error).message || e)); } };
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div><h1 style={{ ...serif, fontSize: 26, margin: 0 }}>Settings</h1><p style={{ color: K.dim, margin: "4px 0 0" }}>For the facilitator, co-facilitator and admin. Everything here is logged.</p></div>
      <Card title="Members" right={<button onClick={() => setAdding(!adding)} style={{ ...btn("ghost", { padding: "4px 10px" }) }}>{adding ? "Close" : "+ Add a member"}</button>}>
        {adding && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, marginBottom: 12, alignItems: "end" }}>
            <div><label style={label}>Name</label><input style={input} value={nm} onChange={(e) => setNm(e.target.value)} /></div>
            <div><label style={label}>Official e-mail</label><input style={input} type="email" value={em} onChange={(e) => setEm(e.target.value)} /></div>
            <button onClick={add} style={btn("primary")}>Add</button>
          </div>
        )}
        <div style={{ display: "grid", gap: 8 }}>
          {boot.members.map((m) => <MemberRow key={m.id} m={m} boot={boot} reload={reload} setMsg={setMsg} mailOne={mailAll} />)}
        </div>
        <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={() => mailAll()} disabled={mailing} style={btn("primary")}>{mailing ? "Sending…" : "Send welcome mails"}</button>
          <span style={{ fontSize: 12, color: K.muted }}>From raghu@nandan.co.in, to every active member who has never signed in; a fresh 72-hour link each. Nothing goes out until this is pressed.</span>
        </div>
        {mailResult && <div style={{ marginTop: 8, fontSize: 12, display: "grid", gap: 2 }}>{mailResult.map((r) => <div key={r.email}><b>{r.name}</b> · {r.email} · <span style={{ color: r.result === "sent" ? K.green : r.result.startsWith("skipped") || r.result === "already" ? K.muted : K.red }}>{r.result}</span></div>)}</div>}
        <div style={{ fontSize: 12, color: K.muted, marginTop: 10 }}>An invite link opens the site once, within 72 hours, and then insists on a password. "Invite link" makes one to copy; "Mail invite" sends it from your Gmail.</div>
      </Card>
      <Card title="The group's settings">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
          <div><label style={label}>WhatsApp group link</label><input style={input} value={vals.whatsapp_link || ""} onChange={(e) => setVals({ ...vals, whatsapp_link: e.target.value })} /></div>
          <div><label style={label}>Meeting venue (default)</label><input style={input} value={vals.meeting_venue || ""} onChange={(e) => setVals({ ...vals, meeting_venue: e.target.value })} /></div>
          <div><label style={label}>Meeting day, in words</label><input style={input} value={vals.meeting_day || ""} onChange={(e) => setVals({ ...vals, meeting_day: e.target.value })} /></div>
          <div><label style={label}>Google Drive folder for photos (id or link)</label><input style={input} value={vals.drive_photos_folder || ""} onChange={(e) => setVals({ ...vals, drive_photos_folder: e.target.value })} placeholder="the gallery seeds from here in phase 4" /></div>
        </div>
        <div style={{ marginTop: 10 }}><button onClick={saveSettings} style={btn("primary")}>Save settings</button></div>
      </Card>
      {msg && <div style={{ fontSize: 13, color: /saved|made|copied/i.test(msg) ? K.green : K.red }}>{msg}</div>}
      <Card title={`Kindle ${KINDLE_VERSION}`} right="what has shipped">
        {KINDLE_UPDATES.map((u) => <div key={u.v} style={{ marginBottom: 8 }}><b>{u.v}</b> <span style={{ color: K.muted, fontSize: 12 }}>· {dmy(u.date)}</span><ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 13, color: K.dim }}>{u.items.map((i, j) => <li key={j}>{i}</li>)}</ul></div>)}
      </Card>
    </div>
  );
}

function MemberRow({ m, boot, reload, setMsg, mailOne }: { m: Member; boot: Boot; reload: () => void; setMsg: (s: string) => void; mailOne: (ids: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: m.name, email: m.email, short_name: m.short_name || "", company: m.company || "", phone: m.phone || "", joined_on: m.joined_on || "", sort_order: String(m.sort_order) });
  const [roles, setRoles] = useState<string[]>(m.roles);
  const [isAdmin, setIsAdmin] = useState(m.is_admin); const [active, setActive] = useState(m.active);
  const [link, setLink] = useState<string | null>(null);
  const isOwner = m.email === "raghu@nandan.co.in";
  const save = async () => { try { await api("/api/kindle/members", { action: "admin_save", id: m.id, fields: { ...f, sort_order: Number(f.sort_order) || 100 }, roles, is_admin: isAdmin, active }); setMsg("Member saved."); setOpen(false); reload(); } catch (e) { setMsg(String((e as Error).message || e)); } };
  const invite = async () => { try { const r = await api<{ link: string }>("/api/kindle/members", { action: "invite", id: m.id }); setLink(r.link); try { await navigator.clipboard.writeText(r.link); setMsg("Invite link made and copied."); } catch { setMsg("Invite link made."); } } catch (e) { setMsg(String((e as Error).message || e)); } };
  return (
    <div style={{ border: `1px solid ${K.line}`, borderRadius: 12, padding: 10, background: m.active ? "#fff" : K.soft }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Avatar m={m} size={34} />
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{m.name} {!m.active && <span style={pill(K.muted)}>left</span>}</div>
          <div style={{ fontSize: 12, color: K.muted }}>{m.email}{m.last_login_at ? ` · last in ${dmy(m.last_login_at)}` : " · never signed in"}{m.onboarded_at ? "" : " · profile not filled"}</div>
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{m.roles.map((r) => <span key={r} style={pill(K.amber, K.ink)}>{ROLE_LABEL[r]}</span>)}{m.is_admin && <span style={pill(K.charcoal, K.amber)}>Admin</span>}</div>
        <button onClick={invite} style={{ ...btn("ghost", { padding: "5px 10px", fontSize: 12 }) }}>Invite link</button>
        <button onClick={() => mailOne([m.id])} style={{ ...btn("ghost", { padding: "5px 10px", fontSize: 12 }) }}>Mail invite</button>
        <button onClick={() => setOpen(!open)} style={{ ...btn("ghost", { padding: "5px 10px", fontSize: 12 }) }}>{open ? "Close" : "Edit"}</button>
      </div>
      {link && <div style={{ marginTop: 8, fontSize: 12, background: K.soft, borderRadius: 8, padding: 8, wordBreak: "break-all" }}>Send to {m.name}: <a href={link} style={{ color: K.blue }}>{link}</a> <span style={{ color: K.muted }}>(valid 72 hours, opens once)</span></div>}
      {open && (
        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 8 }}>
            {(["name", "email", "short_name", "company", "phone", "joined_on", "sort_order"] as const).map((k) => <div key={k}><label style={label}>{k.replace("_", " ")}</label><input style={input} type={k === "joined_on" ? "date" : "text"} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>)}
          </div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13 }}>
            {Object.entries(ROLE_LABEL).map(([k, l]) => <label key={k}><input type="checkbox" checked={roles.includes(k)} onChange={(e) => setRoles(e.target.checked ? [...roles, k] : roles.filter((r) => r !== k))} /> {l}</label>)}
            <label title={isOwner ? "Always" : ""}><input type="checkbox" checked={isAdmin} disabled={isOwner} onChange={(e) => setIsAdmin(e.target.checked)} /> Admin (settings gear)</label>
            <label title={isOwner ? "Always" : ""}><input type="checkbox" checked={active} disabled={isOwner} onChange={(e) => setActive(e.target.checked)} /> Active member</label>
          </div>
          <div><button onClick={save} style={btn("primary")}>Save {m.short_name || m.name}</button></div>
        </div>
      )}
    </div>
  );
}
