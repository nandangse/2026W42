"use client";
import { useState } from "react";
import { api, btn, Card, dmy, Err, H1, input, label, Loading, P, pill, slugOf, useGet, type Boot, type Org } from "./shared";

/**
 * SETTINGS AND ADMIN — "which will only be available to a few people in the
 * organisation". The doors (organisations and the names they go by on the
 * jobmaster), the people and their roles, the locations, and the trail.
 */
type User = { id: string; email: string; name: string; phone: string | null; role: string; org_slug: string | null; locations: string[]; sees_commercials: boolean; active: boolean; must_change: boolean; last_login_at: string | null; login_count: number; invite_expires: string | null };
type Loc = { name: string; sort_order: number; active: boolean };
type Admin = { orgs: Org[]; users: User[]; locations: Loc[]; audit: { email: string | null; action: string; detail: Record<string, unknown> | null; at: string }[]; customers: string[]; suppliers: string[]; me?: { email: string } };
const ROLES: [string, string][] = [["customer", "Customer"], ["supplier", "Supplier"], ["admin", "Admin"], ["national_manager", "National manager"], ["location_manager", "Location manager"], ["location_technician", "Location technician"]];

export default function Settings({ boot, reload }: { boot: Boot; reload: () => void }) {
  const r = useGet<Admin>("/api/portal/admin");
  const [msg, setMsg] = useState<string | null>(null);
  const [section, setSection] = useState<"orgs" | "users" | "locations" | "audit">("orgs");
  const refresh = () => { r.reload(); reload(); };
  if (r.error) return <Err e={r.error} />;
  if (!r.data) return <Loading />;
  const d = r.data;
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <H1 sub="For the portal admin. Everything here is logged.">Settings & admin</H1>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {([["orgs", `Organisations · ${d.orgs.length}`], ["users", `People · ${d.users.length}`], ["locations", `Locations · ${d.locations.length}`], ["audit", "Trail"]] as const).map(([k, l]) =>
          <button key={k} onClick={() => setSection(k)} style={btn("ghost", { background: section === k ? P.navy : "#fff", color: section === k ? "#fff" : P.ink })}>{l}</button>)}
      </div>
      {msg && <div style={{ fontSize: 13, color: /saved|added|made|copied|deleted|sent/i.test(msg) ? P.green : P.red }}>{msg}</div>}
      {section === "orgs" && <Orgs d={d} refresh={refresh} setMsg={setMsg} />}
      {section === "users" && <Users d={d} refresh={refresh} setMsg={setMsg} />}
      {section === "locations" && <Locations d={d} refresh={refresh} setMsg={setMsg} />}
      {section === "audit" && (
        <Card title="The last 200 things done here">
          <div style={{ display: "grid", gap: 3, fontSize: 12 }}>
            {d.audit.map((a, i) => <div key={i} style={{ display: "grid", gridTemplateColumns: "150px 180px 1fr", gap: 8, borderBottom: `1px solid ${P.line}`, padding: "3px 0" }}><span style={{ color: P.muted }}>{new Date(a.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</span><span>{a.email || "—"}</span><span><b>{a.action}</b> {a.detail ? <span style={{ color: P.dim }}>{JSON.stringify(a.detail).slice(0, 140)}</span> : null}</span></div>)}
          </div>
        </Card>
      )}
    </div>
  );
}

/* ----------------------------------------------------------- organisations */
function Orgs({ d, refresh, setMsg }: { d: Admin; refresh: () => void; setMsg: (s: string) => void }) {
  const [edit, setEdit] = useState<Partial<Org> | null>(null);
  /* LIVE CLIENTS ONLY, OR ALL (Dr Raghu, 15 Oct 2026: "a button on top showing Live client only or all") — live = active, with at least one person who can sign in */
  const [live, setLive] = useState(true);
  /* live = the door is open (Dr Raghu, 16 Oct 2026: "Veda is live client" — with nobody invited yet) */
  const isLive = (o: Org) => o.active;
  const shown = d.orgs.filter((o) => !live || isLive(o));
  return (
    <Card title="Organisations — the doors" right={<span style={{ display: "flex", gap: 6, alignItems: "center" }}>
      {([[true, `Live clients · ${d.orgs.filter(isLive).length}`], [false, `All · ${d.orgs.length}`]] as const).map(([v, l]) => <button key={String(v)} onClick={() => setLive(v)} style={btn("ghost", { padding: "3px 9px", fontSize: 12, background: live === v ? P.navy : "#fff", color: live === v ? "#fff" : P.ink })}>{l}</button>)}
      <button onClick={() => setEdit({ slug: "", name: "", kind: "customer", match_names: [], intro: "", active: true })} style={btn("primary", { padding: "4px 10px", fontSize: 12 })}>+ Add a client</button></span>}>
      <p style={{ fontSize: 12, color: P.dim, margin: "0 0 10px" }}>Each organisation has a slug — the word after /portal/ — and the names it goes by on Nandan's jobmaster or purchase orders. The portal matches on those names; nothing else decides what a customer sees.</p>
      {edit && <OrgForm d={d} o={edit} onDone={() => { setEdit(null); refresh(); setMsg("Organisation saved."); }} onCancel={() => setEdit(null)} setMsg={setMsg} />}
      <div style={{ display: "grid", gap: 6 }}>
        {shown.map((o) => (
          <div key={o.slug} style={{ display: "flex", gap: 10, alignItems: "center", border: `1px solid ${P.line}`, borderRadius: 10, padding: "8px 12px", flexWrap: "wrap" }}>
            <b style={{ fontSize: 14 }}>{o.name}</b>
            {isLive(o) && <span style={pill("#0D7A3F")}>live</span>}
            <a href={`/portal/${o.slug}`} style={{ fontSize: 12, color: P.blue }}>/portal/{o.slug}</a>
            <span style={pill(o.kind === "supplier" ? P.blue : P.accent)}>{o.kind}</span>
            {!o.active && <span style={pill(P.red)}>inactive</span>}
            <span style={{ fontSize: 12, color: P.muted, flex: 1 }}>{o.match_names.length ? o.match_names.join(" · ") : "no match names yet — nothing will show"}</span>
            <span style={{ fontSize: 12, color: P.muted }}>{d.users.filter((u) => u.org_slug === o.slug).length} people</span>
            <button onClick={() => setEdit(o)} style={btn("ghost", { padding: "3px 9px", fontSize: 12 })}>Edit</button>
          </div>
        ))}
        {shown.length === 0 && <div style={{ color: P.muted, fontSize: 13 }}>{d.orgs.length ? "No live client yet — a client is live once its door is active." : "No organisations yet. Add Veda Aeronautics, Taj SATS, Vama, Safran… the slug is made from the name; give each the names it goes by on the jobmaster."}</div>}
      </div>
    </Card>
  );
}

function OrgForm({ d, o, onDone, onCancel, setMsg }: { d: Admin; o: Partial<Org>; onDone: () => void; onCancel: () => void; setMsg: (s: string) => void }) {
  const isNew = !d.orgs.some((x) => x.slug === o.slug);
  const [f, setF] = useState({ slug: o.slug || "", name: o.name || "", kind: o.kind || "customer", intro: o.intro || "", active: o.active !== false, ceo_message: (o as Org & { ceo_message?: string | null }).ceo_message || "" });
  const isRaghu = d.me?.email === "raghu@nandan.co.in";
  const [names, setNames] = useState<string[]>(o.match_names || []);
  const [pick, setPick] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const pool = (f.kind === "supplier" ? d.suppliers : d.customers).filter((n) => !names.includes(n.toLowerCase()) && (!pick || n.toLowerCase().includes(pick.toLowerCase()))).slice(0, 12);
  const save = async () => {
    setErr(null);
    try { const { ceo_message, ...rest } = f; await api("/api/portal/admin", { action: "org_save", ...rest, ...(isRaghu ? { ceo_message } : {}), match_names: names }); onDone(); }
    catch (e) { setErr(String((e as Error).message || e)); }
  };
  const del = async () => { if (!confirm(`Remove ${f.name} from the portal?`)) return; try { await api("/api/portal/admin", { action: "org_delete", slug: f.slug }); onDone(); setMsg("Organisation deleted."); } catch (e) { setErr(String((e as Error).message || e)); } };
  return (
    <div style={{ background: P.soft, border: `1px solid ${P.line}`, borderRadius: 10, padding: 12, marginBottom: 12, display: "grid", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 140px", gap: 10 }}>
        <div><label style={label}>Name</label><input style={input} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value, slug: isNew && (!f.slug || f.slug === slugOf(f.name)) ? slugOf(e.target.value) : f.slug })} /></div>
        <div><label style={label}>Slug · /portal/…</label><input style={input} value={f.slug} disabled={!isNew} onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase() })} /></div>
        <div><label style={label}>Kind</label><select style={input} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as Org["kind"] })}><option value="customer">Customer</option><option value="supplier">Supplier</option></select></div>
      </div>
      <div>
        <label style={label}>Names it goes by on the {f.kind === "supplier" ? "purchase orders" : "jobmaster"} · pick from what Genie holds</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
          {names.map((n) => <span key={n} style={{ ...pill(P.navy), display: "inline-flex", gap: 6, alignItems: "center" }}>{n}<button onClick={() => setNames(names.filter((x) => x !== n))} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 0 }}>✕</button></span>)}
        </div>
        <input style={input} value={pick} onChange={(e) => setPick(e.target.value)} placeholder={`Type to search ${f.kind === "supplier" ? d.suppliers.length : d.customers.length} names…`} />
        {pick && <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>{pool.map((n) => <button key={n} onClick={() => { setNames([...names, n.toLowerCase()]); setPick(""); }} style={btn("ghost", { padding: "3px 9px", fontSize: 12 })}>+ {n}</button>)}{pool.length === 0 && <span style={{ fontSize: 12, color: P.muted }}>No such name on record.</span>}</div>}
      </div>
      {f.kind === "customer" && (
        <div><label style={label}>The CEO&apos;s message — on top of their landing page, after &quot;Dear &lt;name&gt;, thank you for &lt;organisation&gt; being our valued clients!&quot; (markdown{isRaghu ? "" : " — Dr Raghu writes this"})</label>
          <textarea style={{ ...input, minHeight: 120 }} value={f.ceo_message} disabled={!isRaghu} onChange={(e) => setF({ ...f, ceo_message: e.target.value })} placeholder="Dr Raghu's words to this customer…" /></div>
      )}
      <div><label style={label}>Their front page — what Nandan writes for them (markdown)</label><textarea style={{ ...input, minHeight: 90 }} value={f.intro} onChange={(e) => setF({ ...f, intro: e.target.value })} placeholder="Welcome to your portal. Your account manager is …" /></div>
      <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> active — the door opens</label>
      {err && <div style={{ color: P.red, fontSize: 13 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8 }}><button onClick={save} style={btn("primary")}>Save</button><button onClick={onCancel} style={btn("ghost")}>Cancel</button><span style={{ flex: 1 }} />{!isNew && <button onClick={del} style={btn("danger")}>Delete</button>}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ people */
function Users({ d, refresh, setMsg }: { d: Admin; refresh: () => void; setMsg: (s: string) => void }) {
  const [edit, setEdit] = useState<Partial<User> | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [mailing, setMailing] = useState(false);
  const invite = async (u: User) => {
    try { const r = await api<{ link: string }>("/api/portal/admin", { action: "user_invite", id: u.id }); setLink(r.link); try { await navigator.clipboard.writeText(r.link); setMsg("Invite link made and copied."); } catch { setMsg("Invite link made."); } refresh(); }
    catch (e) { setMsg(String((e as Error).message || e)); }
  };
  const mail = async (u: User) => {
    if (!confirm(`Mail an invite to ${u.email} from raghu@nandan.co.in?`)) return;
    setMailing(true);
    try { const r = await api<{ results: { result: string }[] }>("/api/portal/mail", { action: "invite", ids: [u.id] }); setMsg(r.results[0]?.result === "sent" ? "Invite sent." : `Mail: ${r.results[0]?.result}`); refresh(); }
    catch (e) { setMsg(String((e as Error).message || e)); }
    setMailing(false);
  };
  const orgName = (s: string | null) => d.orgs.find((o) => o.slug === s)?.name || s || "";
  return (
    <Card title="People — who may sign in" right={<button onClick={() => setEdit({ role: "customer", active: true, locations: [], sees_commercials: false })} style={btn("primary", { padding: "4px 10px", fontSize: 12 })}>+ Add</button>}>
      <p style={{ fontSize: 12, color: P.dim, margin: "0 0 10px" }}>A customer or supplier login belongs to one organisation and sees only it. Nandan's own people: admin (everything, and this page), national manager (everything), location manager and technician (the jobs tagged to their locations). Commercials is a tick of its own. Nandan staff with a Genie admin login walk in without a row here.</p>
      {edit && <UserForm d={d} u={edit} onDone={() => { setEdit(null); refresh(); setMsg("Saved."); }} onCancel={() => setEdit(null)} />}
      {link && <div style={{ fontSize: 12, background: P.soft, padding: 8, borderRadius: 8, marginBottom: 8, wordBreak: "break-all" }}>Invite link (opens once, 72 hours): <b>{link}</b> <button onClick={() => setLink(null)} style={btn("ghost", { padding: "1px 7px", fontSize: 11, marginLeft: 6 })}>hide</button></div>}
      <div style={{ display: "grid", gap: 6 }}>
        {d.users.map((u) => (
          <div key={u.id} style={{ display: "flex", gap: 10, alignItems: "center", border: `1px solid ${P.line}`, borderRadius: 10, padding: "8px 12px", flexWrap: "wrap", opacity: u.active ? 1 : 0.55 }}>
            <div style={{ minWidth: 200 }}><b style={{ fontSize: 14 }}>{u.name}</b><div style={{ fontSize: 12, color: P.muted }}>{u.email}</div></div>
            <span style={pill(["customer", "supplier"].includes(u.role) ? P.accent : P.navy)}>{ROLES.find((r) => r[0] === u.role)?.[1] || u.role}</span>
            {u.org_slug && <span style={{ fontSize: 12 }}>{orgName(u.org_slug)}</span>}
            {u.locations.length > 0 && <span style={{ fontSize: 12, color: P.dim }}>{u.locations.join(", ")}</span>}
            {u.sees_commercials && <span style={pill(P.green)}>commercials</span>}
            {!u.active && <span style={pill(P.red)}>inactive</span>}
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 11, color: P.muted }}>{u.login_count ? `${u.login_count} sign-ins · last ${dmy(u.last_login_at)}` : u.invite_expires && new Date(u.invite_expires) > new Date() ? "invited, not yet in" : "never signed in"}</span>
            <button onClick={() => invite(u)} style={btn("ghost", { padding: "3px 9px", fontSize: 12 })}>Invite link</button>
            <button onClick={() => mail(u)} disabled={mailing} style={btn("ghost", { padding: "3px 9px", fontSize: 12 })}>Mail invite</button>
            <button onClick={() => setEdit(u)} style={btn("ghost", { padding: "3px 9px", fontSize: 12 })}>Edit</button>
          </div>
        ))}
        {d.users.length === 0 && <div style={{ color: P.muted, fontSize: 13 }}>Nobody yet.</div>}
      </div>
    </Card>
  );
}

function UserForm({ d, u, onDone, onCancel }: { d: Admin; u: Partial<User>; onDone: () => void; onCancel: () => void }) {
  const [f, setF] = useState({ id: u.id || "", email: u.email || "", name: u.name || "", phone: u.phone || "", role: u.role || "customer", org_slug: u.org_slug || "", locations: u.locations || [], sees_commercials: !!u.sees_commercials, active: u.active !== false });
  const [err, setErr] = useState<string | null>(null);
  const orgKind = f.role === "supplier" ? "supplier" : "customer";
  const needsOrg = f.role === "customer" || f.role === "supplier";
  const needsLoc = f.role === "location_manager" || f.role === "location_technician";
  const save = async () => { setErr(null); try { await api("/api/portal/admin", { action: "user_save", ...f }); onDone(); } catch (e) { setErr(String((e as Error).message || e)); } };
  return (
    <div style={{ background: P.soft, border: `1px solid ${P.line}`, borderRadius: 10, padding: 12, marginBottom: 12, display: "grid", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
        <div><label style={label}>Name</label><input style={input} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div><label style={label}>E-mail (the login)</label><input style={input} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <div><label style={label}>Phone</label><input style={input} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
        <div><label style={label}>Type of user</label><select style={input} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value, org_slug: "" })}>{ROLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        {needsOrg && <div><label style={label}>Organisation</label><select style={input} value={f.org_slug} onChange={(e) => setF({ ...f, org_slug: e.target.value })}><option value="">— choose —</option>{d.orgs.filter((o) => o.kind === orgKind).map((o) => <option key={o.slug} value={o.slug}>{o.name}</option>)}</select></div>}
      </div>
      {needsLoc && (
        <div><label style={label}>Their locations</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {d.locations.filter((l) => l.active).map((l) => <label key={l.name} style={{ fontSize: 13, display: "flex", gap: 5, alignItems: "center", border: `1px solid ${P.line}`, borderRadius: 8, padding: "4px 8px", background: "#fff" }}><input type="checkbox" checked={f.locations.includes(l.name)} onChange={(e) => setF({ ...f, locations: e.target.checked ? [...f.locations, l.name] : f.locations.filter((x) => x !== l.name) })} />{l.name}</label>)}
            {d.locations.length === 0 && <span style={{ fontSize: 12, color: P.muted }}>Add locations first, under Locations.</span>}
          </div>
        </div>
      )}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={f.sees_commercials} onChange={(e) => setF({ ...f, sees_commercials: e.target.checked })} /> sees Commercials</label>
        <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> active</label>
      </div>
      {err && <div style={{ color: P.red, fontSize: 13 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8 }}><button onClick={save} style={btn("primary")}>{f.id ? "Save" : "Add — then send the invite"}</button><button onClick={onCancel} style={btn("ghost")}>Cancel</button></div>
    </div>
  );
}

/* --------------------------------------------------------------- locations */
function Locations({ d, refresh, setMsg }: { d: Admin; refresh: () => void; setMsg: (s: string) => void }) {
  const [name, setName] = useState("");
  const add = async () => { try { await api("/api/portal/admin", { action: "location_save", name, sort_order: (d.locations.at(-1)?.sort_order || 100) + 10 }); setName(""); refresh(); setMsg("Location added."); } catch (e) { setMsg(String((e as Error).message || e)); } };
  const toggle = async (l: Loc) => { try { await api("/api/portal/admin", { action: "location_save", ...l, active: !l.active }); refresh(); } catch (e) { setMsg(String((e as Error).message || e)); } };
  const del = async (l: Loc) => { if (!confirm(`Remove ${l.name}?`)) return; try { await api("/api/portal/admin", { action: "location_delete", name: l.name }); refresh(); setMsg("Location deleted."); } catch (e) { setMsg(String((e as Error).message || e)); } };
  return (
    <Card title="Locations">
      <p style={{ fontSize: 12, color: P.dim, margin: "0 0 10px" }}>A job is tagged to a location beside the job (open any job → Edit beside the job). A location manager or technician sees only the jobs tagged to their locations, and the tickets raised there.</p>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}><input style={{ ...input, maxWidth: 300 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="Mumbai, Delhi, Bengaluru…" /><button onClick={add} style={btn("primary")}>Add</button></div>
      <div style={{ display: "grid", gap: 4 }}>
        {d.locations.map((l) => <div key={l.name} style={{ display: "flex", gap: 10, alignItems: "center", borderBottom: `1px solid ${P.line}`, padding: "6px 0", fontSize: 13, opacity: l.active ? 1 : 0.5 }}><b style={{ flex: 1 }}>{l.name}</b><span style={{ fontSize: 12, color: P.muted }}>{d.users.filter((u) => u.locations.includes(l.name)).length} people</span><button onClick={() => toggle(l)} style={btn("ghost", { padding: "2px 8px", fontSize: 11 })}>{l.active ? "deactivate" : "activate"}</button><button onClick={() => del(l)} style={btn("ghost", { padding: "2px 8px", fontSize: 11, color: P.red })}>delete</button></div>)}
        {d.locations.length === 0 && <div style={{ color: P.muted, fontSize: 13 }}>No locations yet.</div>}
      </div>
    </Card>
  );
}
