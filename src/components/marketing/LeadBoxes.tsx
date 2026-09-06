"use client";
/**
 * A company and a person, opened wide (Dr Raghu, 6 Sep 2026: "this is too
 * simplistic. Make a larger box! Also within the company show contacts.
 * Company has to have location, industry, tags, etc.").
 *
 * Tabs: Record (every field editable in place), Contacts (the company's
 * people, add one, tick and add to a list), Tags, My notes, My sends. Not
 * here on purpose: opportunities, deals, the Eva brief — those are the CRM's.
 */
import React, { useCallback, useEffect, useState } from "react";
import { fmtAt } from "@/lib/fmt";
import { swallow } from "@/lib/swallow";

export type Person = { id: string; first_name: string | null; last_name: string | null; full_name: string | null; job_title: string | null; department?: string | null; primary_email: string | null; primary_phone: string | null; whatsapp_number?: string | null; linkedin_url: string | null; city: string | null; country: string | null; company_id: string | null; source: string; assigned_to: string | null; created_by_email: string | null; created_at: string; is_decision_maker?: boolean; company?: { id?: string; name: string } | null };
export type Company = { id: string; name: string; domain_name: string | null; website: string | null; linkedin_url?: string | null; city: string | null; state?: string | null; country: string | null; industry_id?: number | null; employee_count?: number | null; annual_revenue?: number | null; gstin?: string | null; notes?: string | null; source: string; is_lead: boolean; is_customer: boolean; assigned_to: string | null; created_by_email: string | null; created_at: string; industry?: { name: string } | null };
type Tag = { link_id: string; tag_id: string; name: string };
type ListLite = { id: string; name: string; count: number };

const INK = "var(--ink)", MUTED = "var(--muted)", LINE = "var(--line)", NAVY = "var(--navy)", GREEN = "var(--green)", RED = "var(--red)", ACCENT = "var(--accent)";
const inp: React.CSSProperties = { border: `1px solid #E2E0DA`, borderRadius: 6, padding: "6px 8px", fontSize: 13, background: "#fff", color: "#22303C", width: "100%" };
const btn = (bg: string, fg = "#fff"): React.CSSProperties => ({ background: bg, color: fg, borderRadius: 6, padding: "6px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" });

async function api<T = Record<string, unknown>>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j as T;
}

export function Modal({ title, sub, onClose, children, width = 1080 }: { title: React.ReactNode; sub?: React.ReactNode; onClose: () => void; children: React.ReactNode; width?: number }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(22,35,47,.55)", zIndex: 70, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "24px 12px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg genie-modal" style={{ width: `min(${width}px, 100%)`, minHeight: "70vh", maxHeight: "94vh", overflowY: "auto", display: "flex", flexDirection: "column" }}>
        <div className="px-4 py-3 flex items-center gap-3" style={{ background: NAVY, color: "#fff", position: "sticky", top: 0, zIndex: 2 }}>
          <div className="flex-1 min-w-0"><div className="font-bold truncate" style={{ fontSize: 17 }}>{title}</div>{sub && <div className="text-xs truncate" style={{ color: "#8FA1B3" }}>{sub}</div>}</div>
          <button onClick={onClose} style={{ color: "#8FA1B3", fontSize: 22, lineHeight: 1 }}>✕</button>
        </div>
        <div className="p-4 flex-1">{children}</div>
      </div>
    </div>
  );
}

function Tabs<T extends string>({ tabs, tab, setTab }: { tabs: [T, string][]; tab: T; setTab: (t: T) => void }) {
  return (
    <div className="flex gap-1 mb-3 flex-wrap" style={{ borderBottom: `1px solid ${LINE}` }}>
      {tabs.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className="px-3 py-1.5 text-sm font-bold" style={{ color: tab === k ? INK : "#8FA1B3", borderBottom: tab === k ? "2px solid var(--accent)" : "2px solid transparent" }}>{l}</button>)}
    </div>
  );
}

/** One field that saves on blur. */
function F({ label, value, onSave, type = "text", options, disabled, wide }: { label: string; value: string | number | null | undefined; onSave: (v: string) => void; type?: string; options?: { value: string; label: string }[]; disabled?: boolean; wide?: boolean }) {
  const [v, setV] = useState(value == null ? "" : String(value));
  useEffect(() => { setV(value == null ? "" : String(value)); }, [value]);
  return (
    <label className="block text-xs font-semibold" style={{ color: "var(--dim)", gridColumn: wide ? "1 / -1" : undefined }}>{label}
      {options ? (
        <select value={v} disabled={disabled} onChange={(e) => { setV(e.target.value); onSave(e.target.value); }} style={inp}><option value="">—</option>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
      ) : type === "textarea" ? (
        <textarea value={v} disabled={disabled} rows={3} onChange={(e) => setV(e.target.value)} onBlur={() => { if (v !== (value == null ? "" : String(value))) onSave(v); }} style={inp} />
      ) : (
        <input type={type} value={v} disabled={disabled} onChange={(e) => setV(e.target.value)} onBlur={() => { if (v !== (value == null ? "" : String(value))) onSave(v); }} style={inp} />
      )}
    </label>
  );
}

function TagsPane({ entity, id, tags, allTags, onTags }: { entity: "company" | "person"; id: string; tags: Tag[]; allTags: { id: string; name: string }[]; onTags: (t: Tag[]) => void }) {
  const [name, setName] = useState("");
  const add = async (n: string) => { if (!n.trim()) return; const r = await api<{ tags: Tag[] }>("/api/marketing/leads", { action: "tag_add", entity, id, name: n }); onTags(r.tags); setName(""); };
  const remove = async (t: Tag) => { const r = await api<{ tags: Tag[] }>("/api/marketing/leads", { action: "tag_remove", entity, id, tag_id: t.tag_id }); onTags(r.tags); };
  const have = new Set(tags.map((t) => t.name.toLowerCase()));
  return (
    <div>
      <div className="flex gap-1.5 flex-wrap mb-3">
        {tags.length === 0 && <span className="text-xs" style={{ color: MUTED }}>No tags yet.</span>}
        {tags.map((t) => <span key={t.link_id} className="rounded-full px-2.5 py-0.5 text-xs font-bold flex items-center gap-1" style={{ background: "#16232F", color: "#fff" }}>{t.name}<button onClick={() => remove(t)} style={{ color: "#8FA1B3" }} title="remove">✕</button></span>)}
      </div>
      <div className="flex gap-2 items-center">
        <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(name); }} placeholder="new tag, Enter to add" style={{ ...inp, width: 240 }} list="mk-tags" />
        <datalist id="mk-tags">{allTags.map((t) => <option key={t.id} value={t.name} />)}</datalist>
        <button onClick={() => add(name)} style={btn(NAVY)}>+ Tag</button>
      </div>
      <div className="flex gap-1 flex-wrap mt-3">
        {allTags.filter((t) => !have.has(t.name.toLowerCase())).slice(0, 40).map((t) => <button key={t.id} onClick={() => add(t.name)} className="rounded-full px-2 py-0.5 text-xs" style={{ border: `1px solid ${LINE}`, color: "var(--dim)" }}>+ {t.name}</button>)}
      </div>
    </div>
  );
}

function NotesPane({ entity, id, seesAll }: { entity: "company" | "person"; id: string; seesAll: boolean }) {
  const [notes, setNotes] = useState<{ id: string; body: string; created_at: string }[]>([]);
  const [sends, setSends] = useState<{ status: string; sent_at: string | null; open_count: number; campaign: { name: string } | null }[]>([]);
  const [text, setText] = useState("");
  const load = useCallback(() => api<{ notes: typeof notes; sends: typeof sends }>(`/api/marketing/notes?entity=${entity}&id=${id}`).then((j) => { setNotes(j.notes); setSends(j.sends); }).catch((e) => swallow("marketing/notes", e)), [entity, id]);
  useEffect(() => { load(); }, [load]);
  const save = async () => { if (!text.trim()) return; await api("/api/marketing/notes", { entity, entity_id: id, body: text }); setText(""); load(); };
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
      <div>
        <div className="text-xs font-bold mb-1" style={{ color: MUTED }}>MY NOTES — nobody else sees these</div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="what you learnt, what to do next" style={inp} />
        <button onClick={save} className="mt-1" style={btn(NAVY)}>Save note</button>
        {notes.map((n) => <div key={n.id} className="text-sm mt-2 pt-2" style={{ borderTop: `1px solid ${LINE}` }}><div className="text-xs" style={{ color: MUTED }}>{fmtAt(n.created_at)}</div>{n.body}</div>)}
      </div>
      {entity === "person" && (
        <div>
          <div className="text-xs font-bold mb-1" style={{ color: MUTED }}>{seesAll ? "SENDS" : "MY SENDS"}</div>
          {sends.length === 0 && <div className="text-xs" style={{ color: MUTED }}>No campaign mail to this person yet.</div>}
          {sends.map((s, i) => <div key={i} className="text-sm flex gap-3 py-0.5"><span className="flex-1 truncate">{s.campaign?.name || "campaign"}</span><span style={{ color: s.status === "opened" ? GREEN : s.status === "bounced" || s.status === "failed" ? RED : MUTED }}>{s.status}{s.open_count ? ` ×${s.open_count}` : ""}</span><span className="tnum" style={{ color: MUTED }}>{s.sent_at ? fmtAt(s.sent_at) : ""}</span></div>)}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────── the company ───────────────────────────── */

export function CompanyBox({ id, seesAll, lists, onClose, onChanged }: { id: string; seesAll: boolean; lists: ListLite[]; onClose: () => void; onChanged: () => void }) {
  const [d, setD] = useState<{ row: Company; people: Person[]; tags: Tag[]; industries: { id: number; name: string }[]; allTags: { id: string; name: string }[] } | null>(null);
  const [tab, setTab] = useState<"record" | "contacts" | "tags" | "notes">("record");
  const [msg, setMsg] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [openPerson, setOpenPerson] = useState<string | null>(null);
  const load = useCallback(() => api<NonNullable<typeof d>>(`/api/marketing/leads?kind=company&id=${id}`).then(setD).catch((e) => setMsg(e instanceof Error ? e.message : String(e))), [id]);
  useEffect(() => { load(); }, [load]);
  const save = (fields: Record<string, unknown>) => api("/api/marketing/leads", { action: "update", kind: "company", id, fields }).then(() => { setMsg("saved ✓"); load(); onChanged(); }).catch((e) => setMsg(e instanceof Error ? e.message : String(e)));
  if (!d) return <Modal title="…" onClose={onClose}><div className="text-sm" style={{ color: MUTED }}>{msg || "opening…"}</div></Modal>;
  const c = d.row;
  const addToList = async (listId: string) => { if (!listId || !picked.size) return; const r = await api<{ n: number }>("/api/marketing/lists", { action: "add", list_id: listId, person_ids: [...picked] }); setMsg(`${r.n} added to the list ✓`); setPicked(new Set()); };
  return (
    <Modal title={<>{c.name} {c.is_lead && <span className="ml-2 rounded px-1.5 text-xs" style={{ background: "#0F766E" }}>lead</span>}{c.is_customer && <span className="ml-1 rounded px-1.5 text-xs" style={{ background: "#22303C" }}>customer</span>}</>}
      sub={<>{[c.industry?.name, c.city, c.state, c.country].filter(Boolean).join(" · ") || "no location yet"} · {d.people.length} contact{d.people.length === 1 ? "" : "s"} · source {c.source}{c.assigned_to ? ` · assigned ${c.assigned_to.split("@")[0]}` : ""}</>} onClose={onClose}>
      <Tabs tabs={[["record", "🏢 Record"], ["contacts", `👤 Contacts (${d.people.length})`], ["tags", `🏷 Tags (${d.tags.length})`], ["notes", "📝 My notes"]]} tab={tab} setTab={setTab} />
      {msg && <div className="text-xs font-semibold mb-2" style={{ color: msg.includes("✓") ? GREEN : RED }}>{msg}</div>}
      {tab === "record" && (
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
          <F label="Company" value={c.name} onSave={(v) => save({ name: v })} />
          <F label="Industry" value={c.industry_id ?? ""} options={d.industries.map((i) => ({ value: String(i.id), label: i.name }))} onSave={(v) => save({ industry_id: v })} />
          <F label="Domain" value={c.domain_name} onSave={(v) => save({ domain_name: v })} />
          <F label="Website" value={c.website} onSave={(v) => save({ website: v })} />
          <F label="LinkedIn" value={c.linkedin_url} onSave={(v) => save({ linkedin_url: v })} />
          <F label="City" value={c.city} onSave={(v) => save({ city: v })} />
          <F label="State" value={c.state} onSave={(v) => save({ state: v })} />
          <F label="Country" value={c.country} onSave={(v) => save({ country: v })} />
          <F label="Employees" value={c.employee_count} type="number" onSave={(v) => save({ employee_count: v })} />
          <F label="Annual revenue (₹)" value={c.annual_revenue} onSave={(v) => save({ annual_revenue: v })} />
          <F label="GSTIN" value={c.gstin} onSave={(v) => save({ gstin: v })} />
          <F label="Lead" value={c.is_lead ? "1" : "0"} options={[{ value: "1", label: "Yes — a lead" }, { value: "0", label: "No" }]} onSave={(v) => save({ is_lead: v === "1" })} />
          {seesAll && <F label="Assigned to (e-mail)" value={c.assigned_to} onSave={(v) => api("/api/marketing/leads", { action: "assign", kind: "company", id, to: v }).then(() => { load(); onChanged(); })} />}
          <F label="Notes on the company (shared)" value={c.notes} type="textarea" wide onSave={(v) => save({ notes: v })} />
          <div className="text-xs" style={{ color: MUTED, gridColumn: "1 / -1" }}>Made {fmtAt(c.created_at)}{c.created_by_email ? ` by ${c.created_by_email}` : ""}. Fields save when you leave them. Opportunities, deals and the Eva brief live in the CRM.</div>
        </div>
      )}
      {tab === "contacts" && (
        <div>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <button onClick={() => setAdding(true)} style={btn(ACCENT)}>+ Add contact</button>
            {picked.size > 0 && (<><span className="text-xs"><b>{picked.size}</b> ticked → add to list</span>
              <select onChange={(e) => { addToList(e.target.value); e.target.value = ""; }} defaultValue="" style={{ ...inp, width: 220 }}><option value="">choose a list…</option>{lists.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.count})</option>)}</select></>)}
            <span className="ml-auto text-xs" style={{ color: MUTED }}>{d.people.length} people at {c.name}</span>
          </div>
          <div className="genie-scroll" style={{ maxHeight: "55vh" }}>
            <table className="genie-table">
              <thead><tr><th><input type="checkbox" checked={d.people.length > 0 && d.people.every((p) => picked.has(p.id))} onChange={(e) => setPicked(e.target.checked ? new Set(d.people.map((p) => p.id)) : new Set())} /></th><th>Name</th><th>Title</th><th>E-mail</th><th>Phone</th><th>City</th><th>Assigned</th></tr></thead>
              <tbody>
                {d.people.length === 0 && <tr><td colSpan={7} style={{ color: MUTED }}>Nobody yet — add a contact, or import from Apollo with this company's name.</td></tr>}
                {d.people.map((p) => (
                  <tr key={p.id}>
                    <td><input type="checkbox" checked={picked.has(p.id)} onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} /></td>
                    <td><button onClick={() => setOpenPerson(p.id)} className="font-semibold" style={{ color: "var(--blue)", textDecoration: "underline" }}>{p.full_name || "—"}</button>{p.is_decision_maker && <span className="ml-1 text-xs" title="decision maker">★</span>}</td>
                    <td>{p.job_title || "·"}</td><td>{p.primary_email || <span style={{ color: RED }}>none</span>}</td><td>{p.primary_phone || "·"}</td><td>{[p.city, p.country].filter(Boolean).join(", ") || "·"}</td><td>{p.assigned_to?.split("@")[0] || "·"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {adding && <AddContact companyId={id} onClose={() => { setAdding(false); load(); }} />}
          {openPerson && <PersonBox id={openPerson} seesAll={seesAll} lists={lists} onClose={() => { setOpenPerson(null); load(); }} onChanged={load} />}
        </div>
      )}
      {tab === "tags" && <TagsPane entity="company" id={id} tags={d.tags} allTags={d.allTags} onTags={(t) => setD({ ...d, tags: t })} />}
      {tab === "notes" && <NotesPane entity="company" id={id} seesAll={seesAll} />}
    </Modal>
  );
}

function AddContact({ companyId, onClose }: { companyId: string; onClose: () => void }) {
  const [f, setF] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const save = async () => { try { await api("/api/marketing/leads", { action: "create", kind: "person", company_id: companyId, ...f }); onClose(); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } };
  return (
    <div className="rounded border p-3 mt-3 grid gap-2" style={{ borderColor: LINE, background: "#FBFAF7", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
      {[["first_name", "First name"], ["last_name", "Last name"], ["job_title", "Title"], ["department", "Department"], ["primary_email", "E-mail"], ["primary_phone", "Phone"], ["linkedin_url", "LinkedIn"], ["city", "City"], ["country", "Country"]].map(([k, l]) => <label key={k} className="text-xs font-semibold" style={{ color: "var(--dim)" }}>{l}<input value={f[k] || ""} onChange={set(k)} style={inp} /></label>)}
      <div className="flex items-end gap-2"><button onClick={save} style={btn(ACCENT)}>Save contact</button><button onClick={onClose} style={btn("#fff", "var(--dim)")}>cancel</button></div>
      {msg && <div className="text-xs" style={{ color: RED, gridColumn: "1 / -1" }}>{msg}</div>}
    </div>
  );
}

/* ───────────────────────────── the person ───────────────────────────── */

export function PersonBox({ id, seesAll, lists, onClose, onChanged }: { id: string; seesAll: boolean; lists: ListLite[]; onClose: () => void; onChanged: () => void }) {
  const [d, setD] = useState<{ row: Person; tags: Tag[]; allTags: { id: string; name: string }[] } | null>(null);
  const [tab, setTab] = useState<"record" | "tags" | "notes">("record");
  const [msg, setMsg] = useState("");
  const [cq, setCq] = useState(""); const [chits, setChits] = useState<Company[]>([]);
  const load = useCallback(() => api<NonNullable<typeof d>>(`/api/marketing/leads?kind=person&id=${id}`).then(setD).catch((e) => setMsg(e instanceof Error ? e.message : String(e))), [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!cq.trim()) { setChits([]); return; } const t = setTimeout(() => api<{ rows: Company[] }>(`/api/marketing/leads?kind=company&q=${encodeURIComponent(cq)}`).then((j) => setChits(j.rows.slice(0, 8))).catch(() => null), 250); return () => clearTimeout(t); }, [cq]);
  const save = (fields: Record<string, unknown>) => api("/api/marketing/leads", { action: "update", kind: "person", id, fields }).then(() => { setMsg("saved ✓"); load(); onChanged(); }).catch((e) => setMsg(e instanceof Error ? e.message : String(e)));
  if (!d) return <Modal title="…" onClose={onClose} width={900}><div className="text-sm" style={{ color: MUTED }}>{msg || "opening…"}</div></Modal>;
  const p = d.row;
  return (
    <Modal width={900} title={<>{p.full_name || p.primary_email || "—"}{p.is_decision_maker && <span className="ml-2 text-sm" title="decision maker">★</span>}</>}
      sub={<>{[p.job_title, p.company?.name, p.city, p.country].filter(Boolean).join(" · ")} · source {p.source}{p.assigned_to ? ` · assigned ${p.assigned_to.split("@")[0]}` : ""}</>} onClose={onClose}>
      <Tabs tabs={[["record", "👤 Record"], ["tags", `🏷 Tags (${d.tags.length})`], ["notes", "📝 Notes & sends"]]} tab={tab} setTab={setTab} />
      {msg && <div className="text-xs font-semibold mb-2" style={{ color: msg.includes("✓") ? GREEN : RED }}>{msg}</div>}
      {tab === "record" && (
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
          <F label="First name" value={p.first_name} onSave={(v) => save({ first_name: v })} />
          <F label="Last name" value={p.last_name} onSave={(v) => save({ last_name: v })} />
          <F label="Title" value={p.job_title} onSave={(v) => save({ job_title: v })} />
          <F label="Department" value={p.department} onSave={(v) => save({ department: v })} />
          <F label="E-mail" value={p.primary_email} onSave={(v) => save({ primary_email: v })} />
          <F label="Phone" value={p.primary_phone} onSave={(v) => save({ primary_phone: v })} />
          <F label="WhatsApp" value={p.whatsapp_number} onSave={(v) => save({ whatsapp_number: v })} />
          <F label="LinkedIn" value={p.linkedin_url} onSave={(v) => save({ linkedin_url: v })} />
          <F label="City" value={p.city} onSave={(v) => save({ city: v })} />
          <F label="Country" value={p.country} onSave={(v) => save({ country: v })} />
          <F label="Decision maker" value={p.is_decision_maker ? "1" : "0"} options={[{ value: "1", label: "Yes" }, { value: "0", label: "No" }]} onSave={(v) => save({ is_decision_maker: v === "1" })} />
          {seesAll && <F label="Assigned to (e-mail)" value={p.assigned_to} onSave={(v) => api("/api/marketing/leads", { action: "assign", kind: "person", id, to: v }).then(() => { load(); onChanged(); })} />}
          <div style={{ gridColumn: "1 / -1" }}>
            <div className="text-xs font-semibold" style={{ color: "var(--dim)" }}>Company — <b>{p.company?.name || "none"}</b></div>
            <input value={cq} onChange={(e) => setCq(e.target.value)} placeholder="type to move this person to another company…" style={{ ...inp, maxWidth: 420 }} />
            {chits.map((c) => <button key={c.id} onClick={() => { save({ company_id: c.id }); setCq(""); }} className="block text-xs py-0.5" style={{ color: "var(--blue)" }}>→ {c.name}{c.city ? ` · ${c.city}` : ""}</button>)}
          </div>
          <div className="text-xs" style={{ color: MUTED, gridColumn: "1 / -1" }}>Made {fmtAt(p.created_at)}{p.created_by_email ? ` by ${p.created_by_email}` : ""}. Fields save when you leave them.</div>
          {lists.length > 0 && <div style={{ gridColumn: "1 / -1" }} className="text-xs">Add to a list: <select onChange={async (e) => { if (e.target.value) { await api("/api/marketing/lists", { action: "add", list_id: e.target.value, person_ids: [id] }); setMsg("added to the list ✓"); e.target.value = ""; } }} defaultValue="" style={{ ...inp, width: 240, display: "inline-block" }}><option value="">choose…</option>{lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>}
        </div>
      )}
      {tab === "tags" && <TagsPane entity="person" id={id} tags={d.tags} allTags={d.allTags} onTags={(t) => setD({ ...d, tags: t })} />}
      {tab === "notes" && <NotesPane entity="person" id={id} seesAll={seesAll} />}
    </Modal>
  );
}
