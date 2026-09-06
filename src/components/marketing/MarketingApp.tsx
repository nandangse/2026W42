"use client";
/**
 * MARKETING (Dr Raghu, 6 Sep 2026): "lets build a new module called
 * Marketing. The database is the same as CRM ... Leads, Lists, Email
 * Marketing, Sending Channels ... We are basically replicating Apollo
 * internally for ourselves. When I login I can see all of them for sure;
 * in CRM I focus on the ones with a deal."
 *
 * Six sections on a rail: Leads (people and companies, mine or all), Lists,
 * Campaigns (the wizard: campaign → lists & people → check list → message →
 * check message → unsubscribes → speed → send), Templates, Channels,
 * Unsubscribes. Import Apollo sits on Leads. A member sees what they made
 * or were assigned; sales and managers see all.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import GenieShell from "@/components/GenieShell";
import GenieTable from "@/components/GenieTable";
import { swallow } from "@/lib/swallow";
import { fmtAt } from "@/lib/fmt";

type Person = { id: string; first_name: string | null; last_name: string | null; full_name: string | null; job_title: string | null; primary_email: string | null; primary_phone: string | null; linkedin_url: string | null; city: string | null; country: string | null; company_id: string | null; source: string; assigned_to: string | null; created_by_email: string | null; created_at: string; company?: { name: string } | null };
type Company = { id: string; name: string; domain_name: string | null; website: string | null; city: string | null; country: string | null; source: string; is_lead: boolean; is_customer: boolean; assigned_to: string | null; created_by_email: string | null; created_at: string };
type List = { id: string; name: string; description: string | null; created_by_email: string; created_at: string; count: number };
type Campaign = { id: string; name: string; status: string; subject: string | null; body_html?: string | null; list_ids: string[]; person_ids: string[]; channel_ids: string[]; speed_per_hour: number; created_by_email: string; created_at: string; started_at: string | null; done_at: string | null; counts: Record<string, number> | null; checklist?: Record<string, number | string> | null; deliverability?: { score: number; issues: string[] } | null };
type Channel = { id: string; email: string; label: string | null; kind: "gmail" | "resend" | "mailercloud"; daily_limit: number; hourly_limit: number; active: boolean; sent_today: number; sent_this_hour: number; gmail: string | null; api_key: string | null; resendKeyOnDeploy: boolean };
type Template = { id: string; name: string; subject: string | null; body_html: string | null };

const SECTIONS = [
  { key: "leads", label: "Leads", icon: "🎯" }, { key: "lists", label: "Lists", icon: "📋" }, { key: "campaigns", label: "Email Marketing", icon: "✉️" },
  { key: "templates", label: "Templates", icon: "📝" }, { key: "channels", label: "Sending Channels", icon: "📡" }, { key: "unsubscribes", label: "Unsubscribes", icon: "🚫" },
];
const INK = "var(--ink)", MUTED = "var(--muted)", LINE = "var(--line)", ACCENT = "var(--accent)", GREEN = "var(--green)", RED = "var(--red)", NAVY = "var(--navy)";
const inp: React.CSSProperties = { border: `1px solid #E2E0DA`, borderRadius: 6, padding: "6px 8px", fontSize: 13, background: "#fff", color: "#22303C", width: "100%" };
const btn = (bg: string, fg = "#fff"): React.CSSProperties => ({ background: bg, color: fg, borderRadius: 6, padding: "6px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" });

async function api<T = Record<string, unknown>>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j as T;
}

export default function MarketingApp({ email, displayName, initials, role, marketingRole, initialSection }: {
  email: string; displayName: string | null; initials: string | null; role: string; marketingRole: "owner" | "sales" | "manager" | "member"; initialSection: string;
}) {
  const [section, setSection] = useState(SECTIONS.some((s) => s.key === initialSection) ? initialSection : "leads");
  const go = (k: string) => { setSection(k); try { window.history.replaceState(null, "", `/marketing/${k}`); } catch (e) { swallow("marketing", e); } };
  const seesAll = marketingRole !== "member";
  return (
    <GenieShell module="marketing" title="Nandan Marketing" tagline={seesAll ? "Leads, lists, campaigns — everything" : "Leads, lists, campaigns — yours"} user={{ email, displayName, initials, role }}>
      <div className="flex" style={{ alignItems: "flex-start", minHeight: "calc(100vh - 50px)", background: "var(--paper)" }}>
        <nav className="hidden md:block" style={{ width: 208, flexShrink: 0, borderRight: `1px solid ${LINE}`, background: "#fff", minHeight: "calc(100vh - 50px)" }}>
          {SECTIONS.map((s) => (
            <button key={s.key} onClick={() => go(s.key)} className="w-full text-left px-3 py-2.5 text-sm font-bold flex items-center gap-2"
              style={{ background: section === s.key ? NAVY : "transparent", color: section === s.key ? "#fff" : INK }}>
              <span>{s.icon}</span>{s.label}
            </button>
          ))}
          <div className="px-3 py-3 text-xs" style={{ color: MUTED, borderTop: `1px solid ${LINE}` }}>
            You are <b>{marketingRole}</b>. {seesAll ? "You see every record." : "You see what you made or were assigned."}
          </div>
        </nav>
        <div className="flex-1 min-w-0 p-3">
          <div className="md:hidden flex gap-1 mb-2 overflow-x-auto">
            {SECTIONS.map((s) => <button key={s.key} onClick={() => go(s.key)} className="text-xs font-bold rounded px-2 py-1 whitespace-nowrap" style={{ background: section === s.key ? NAVY : "#fff", color: section === s.key ? "#fff" : INK, border: `1px solid ${LINE}` }}>{s.icon} {s.label}</button>)}
          </div>
          {section === "leads" && <Leads me={email} seesAll={seesAll} />}
          {section === "lists" && <Lists />}
          {section === "campaigns" && <Campaigns seesAll={seesAll} />}
          {section === "templates" && <Templates />}
          {section === "channels" && <Channels seesAll={seesAll} />}
          {section === "unsubscribes" && <Unsubscribes seesAll={seesAll} />}
        </div>
      </div>
    </GenieShell>
  );
}

/* ───────────────────────────── Leads ───────────────────────────── */

function Leads({ me, seesAll }: { me: string; seesAll: boolean }) {
  const [kind, setKind] = useState<"person" | "company">("person");
  const [q, setQ] = useState("");
  const [mine, setMine] = useState(!seesAll);
  const [rows, setRows] = useState<(Person | Company)[] | null>(null);
  const [total, setTotal] = useState(0);
  const [installed, setInstalled] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Person | Company | null>(null);
  const [lists, setLists] = useState<List[]>([]);
  const [msg, setMsg] = useState("");
  const [importing, setImporting] = useState(false);
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    api<{ rows: (Person | Company)[]; total: number; installed: boolean }>(`/api/marketing/leads?kind=${kind}&q=${encodeURIComponent(q)}&mine=${mine ? 1 : 0}`)
      .then((j) => { setRows(j.rows); setTotal(j.total); setInstalled(j.installed !== false); }).catch((e) => { swallow("marketing/leads", e); setRows([]); });
  }, [kind, q, mine]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  useEffect(() => { api<{ lists: List[] }>("/api/marketing/lists").then((j) => setLists(j.lists || [])).catch(() => setLists([])); }, []);

  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const addToList = async (listId: string) => {
    if (!picked.size || !listId) return;
    try { const r = await api<{ n: number }>("/api/marketing/lists", { action: "add", list_id: listId, person_ids: [...picked] }); setMsg(`${r.n} added to the list ✓`); setPicked(new Set()); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  };
  const assign = async (id: string, to: string) => { try { await api("/api/marketing/leads", { action: "assign", kind, id, to }); load(); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } };
  const markLead = async (c: Company, lead: boolean) => { try { await api("/api/marketing/leads", { action: "mark_lead", company_id: c.id, lead }); load(); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } };

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <div className="flex rounded overflow-hidden" style={{ border: `1px solid ${LINE}` }}>
          <button onClick={() => { setKind("person"); setPicked(new Set()); }} className="px-3 py-1.5 text-sm font-bold" style={{ background: kind === "person" ? NAVY : "#fff", color: kind === "person" ? "#fff" : INK }}>👤 People</button>
          <button onClick={() => { setKind("company"); setPicked(new Set()); }} className="px-3 py-1.5 text-sm font-bold" style={{ background: kind === "company" ? NAVY : "#fff", color: kind === "company" ? "#fff" : INK }}>🏢 Companies</button>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={kind === "person" ? "search name, e-mail, title…" : "search company, domain, city…"} style={{ ...inp, width: 260 }} />
        {seesAll && <label className="text-xs flex items-center gap-1" style={{ color: MUTED }}><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> only mine</label>}
        <span className="text-xs tnum" style={{ color: MUTED }}>{total.toLocaleString("en-IN")} {kind === "person" ? "people" : "companies"}</span>
        <span className="ml-auto" />
        <button onClick={() => setAdding(true)} style={btn("#fff", INK)} className="border" >+ Add {kind === "person" ? "person" : "company"}</button>
        <button onClick={() => setImporting(true)} style={btn(ACCENT)}>⬆ Import Apollo CSV</button>
      </div>
      {!installed && <div className="text-xs mb-2" style={{ color: RED }}>Run CRM migration 0055 first — the leads fields do not exist yet.</div>}
      {msg && <div className="text-xs font-semibold mb-2" style={{ color: msg.includes("✓") ? GREEN : RED }}>{msg}</div>}
      {kind === "person" && picked.size > 0 && (
        <div className="flex items-center gap-2 mb-2 text-xs rounded px-3 py-2" style={{ background: "#FFF7E6", border: "1px solid #F5B32B" }}>
          <b>{picked.size} chosen</b> → add to list
          <select onChange={(e) => { addToList(e.target.value); e.target.value = ""; }} style={{ ...inp, width: 220 }} defaultValue="">
            <option value="">choose a list…</option>
            {lists.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.count})</option>)}
          </select>
          <button onClick={() => setPicked(new Set())} className="font-semibold" style={{ color: MUTED }}>clear</button>
        </div>
      )}
      {kind === "person" ? (
        <GenieTable<Person> rows={rows as Person[] | null} minWidth={900} maxHeight="calc(100vh - 220px)" empty="No people yet — import from Apollo or add one."
          columns={[
            { key: "pick", label: "", render: (r) => <input type="checkbox" checked={picked.has(r.id)} onChange={() => toggle(r.id)} /> },
            { key: "name", label: "Name", sort: (r) => r.full_name || "", render: (r) => <button onClick={() => setOpen(r)} className="font-semibold text-left" style={{ color: "var(--blue)", textDecoration: "underline" }}>{r.full_name || r.primary_email || "—"}</button> },
            { key: "title", label: "Title", render: (r) => r.job_title || "·" },
            { key: "company", label: "Company", sort: (r) => r.company?.name || "", render: (r) => r.company?.name || "·" },
            { key: "email", label: "E-mail", render: (r) => r.primary_email || <span style={{ color: RED }}>none</span> },
            { key: "city", label: "City", render: (r) => [r.city, r.country].filter(Boolean).join(", ") || "·" },
            { key: "source", label: "Source", render: (r) => <span className="rounded px-1 text-xs font-bold" style={{ background: r.source === "apollo" ? "#EEF2FF" : "#E6F4EA", color: INK }}>{r.source}</span> },
            { key: "who", label: "Assigned", render: (r) => seesAll ? <input defaultValue={r.assigned_to || ""} onBlur={(e) => { if (e.target.value !== (r.assigned_to || "")) assign(r.id, e.target.value); }} placeholder="e-mail" style={{ ...inp, width: 170, padding: "2px 6px", fontSize: 12 }} /> : (r.assigned_to || "·") },
          ]} />
      ) : (
        <GenieTable<Company> rows={rows as Company[] | null} minWidth={900} maxHeight="calc(100vh - 220px)" empty="No companies yet."
          columns={[
            { key: "name", label: "Company", sort: (r) => r.name, render: (r) => <button onClick={() => setOpen(r)} className="font-semibold text-left" style={{ color: "var(--blue)", textDecoration: "underline" }}>{r.name}</button> },
            { key: "domain", label: "Domain", render: (r) => r.domain_name || "·" },
            { key: "city", label: "City", render: (r) => [r.city, r.country].filter(Boolean).join(", ") || "·" },
            { key: "lead", label: "Lead", render: (r) => <button onClick={() => markLead(r, !r.is_lead)} className="rounded px-2 text-xs font-bold" style={{ background: r.is_lead ? "#0F766E" : "#fff", color: r.is_lead ? "#fff" : MUTED, border: `1px solid ${r.is_lead ? "#0F766E" : "#E2E0DA"}` }} title="Mark as lead — or take it off">{r.is_lead ? "✓ lead" : "mark as lead"}</button> },
            { key: "customer", label: "Customer", render: (r) => (r.is_customer ? "✓" : "·") },
            { key: "source", label: "Source", render: (r) => <span className="rounded px-1 text-xs font-bold" style={{ background: r.source === "apollo" ? "#EEF2FF" : "#E6F4EA", color: INK }}>{r.source}</span> },
            { key: "who", label: "Assigned", render: (r) => seesAll ? <input defaultValue={r.assigned_to || ""} onBlur={(e) => { if (e.target.value !== (r.assigned_to || "")) assign(r.id, e.target.value); }} placeholder="e-mail" style={{ ...inp, width: 170, padding: "2px 6px", fontSize: 12 }} /> : (r.assigned_to || "·") },
          ]} />
      )}
      {open && <LeadBox kind={kind} row={open} onClose={() => setOpen(null)} />}
      {importing && <ApolloImport lists={lists} onClose={() => { setImporting(false); load(); }} />}
      {adding && <AddLead kind={kind} onClose={() => { setAdding(false); load(); }} />}
    </div>
  );
}

function Modal({ title, onClose, children, width = 720 }: { title: React.ReactNode; onClose: () => void; children: React.ReactNode; width?: number }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(22,35,47,.55)", zIndex: 70, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "32px 12px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg genie-modal" style={{ width: `min(${width}px, 100%)`, maxHeight: "90vh", overflowY: "auto" }}>
        <div className="px-4 py-3 flex items-center gap-3" style={{ background: NAVY, color: "#fff", position: "sticky", top: 0, zIndex: 2 }}>
          <div className="font-bold flex-1" style={{ fontSize: 15 }}>{title}</div>
          <button onClick={onClose} style={{ color: "#8FA1B3", fontSize: 20, lineHeight: 1 }}>✕</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

/** A lead, opened: the record, my notes, my sends. No opportunities, deals or Eva brief here — those are the CRM's. */
function LeadBox({ kind, row, onClose }: { kind: "person" | "company"; row: Person | Company; onClose: () => void }) {
  const [notes, setNotes] = useState<{ id: string; body: string; created_at: string }[]>([]);
  const [sends, setSends] = useState<{ status: string; sent_at: string | null; opened_at: string | null; open_count: number; campaign: { name: string } | null }[]>([]);
  const [text, setText] = useState("");
  const load = useCallback(() => { api<{ notes: typeof notes; sends: typeof sends }>(`/api/marketing/notes?entity=${kind}&id=${row.id}`).then((j) => { setNotes(j.notes); setSends(j.sends); }).catch((e) => swallow("marketing/notes", e)); }, [kind, row.id]);
  useEffect(() => { load(); }, [load]);
  const p = row as Person, c = row as Company;
  const save = async () => { if (!text.trim()) return; await api("/api/marketing/notes", { entity: kind, entity_id: row.id, body: text }); setText(""); load(); };
  return (
    <Modal title={kind === "person" ? (p.full_name || p.primary_email) : c.name} onClose={onClose}>
      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="rounded border p-3" style={{ borderColor: LINE, background: "#FBFAF7" }}>
          <div className="text-xs font-bold mb-2" style={{ color: MUTED }}>RECORD</div>
          {kind === "person" ? (
            <div className="text-sm" style={{ lineHeight: 1.7 }}>
              <div><b>{p.full_name}</b> {p.job_title ? `· ${p.job_title}` : ""}</div>
              <div>{p.company?.name || "—"}</div>
              <div>{p.primary_email || "no e-mail"}{p.primary_phone ? ` · ${p.primary_phone}` : ""}</div>
              <div>{[p.city, p.country].filter(Boolean).join(", ")}</div>
              {p.linkedin_url && <a href={p.linkedin_url} target="_blank" rel="noreferrer" style={{ color: "var(--blue)" }}>LinkedIn ↗</a>}
              <div className="text-xs mt-1" style={{ color: MUTED }}>source {p.source} · assigned {p.assigned_to || "—"} · by {p.created_by_email || "—"}</div>
            </div>
          ) : (
            <div className="text-sm" style={{ lineHeight: 1.7 }}>
              <div><b>{c.name}</b>{c.is_lead ? " · lead" : ""}{c.is_customer ? " · customer" : ""}</div>
              <div>{c.domain_name || c.website || "—"}</div>
              <div>{[c.city, c.country].filter(Boolean).join(", ")}</div>
              <div className="text-xs mt-1" style={{ color: MUTED }}>source {c.source} · assigned {c.assigned_to || "—"} · by {c.created_by_email || "—"}</div>
            </div>
          )}
        </div>
        <div className="rounded border p-3" style={{ borderColor: LINE }}>
          <div className="text-xs font-bold mb-2" style={{ color: MUTED }}>MY NOTES</div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="a note only you see" style={inp} />
          <button onClick={save} className="mt-1" style={btn(NAVY)}>Save note</button>
          {notes.map((n) => <div key={n.id} className="text-sm mt-2" style={{ borderTop: `1px solid ${LINE}`, paddingTop: 6 }}><div className="text-xs" style={{ color: MUTED }}>{fmtAt(n.created_at)}</div>{n.body}</div>)}
        </div>
      </div>
      {kind === "person" && (
        <div className="rounded border p-3 mt-3" style={{ borderColor: LINE }}>
          <div className="text-xs font-bold mb-2" style={{ color: MUTED }}>MY SENDS</div>
          {sends.length === 0 && <div className="text-xs" style={{ color: MUTED }}>No campaign mail from you to this person yet.</div>}
          {sends.map((s, i) => <div key={i} className="text-sm flex gap-3"><span>{s.campaign?.name || "campaign"}</span><span style={{ color: s.status === "opened" ? GREEN : s.status === "bounced" || s.status === "failed" ? RED : MUTED }}>{s.status}{s.open_count ? ` ×${s.open_count}` : ""}</span><span className="tnum" style={{ color: MUTED }}>{s.sent_at ? fmtAt(s.sent_at) : ""}</span></div>)}
        </div>
      )}
    </Modal>
  );
}

function AddLead({ kind, onClose }: { kind: "person" | "company"; onClose: () => void }) {
  const [f, setF] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const save = async () => { try { await api("/api/marketing/leads", { action: "create", kind, ...f }); onClose(); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } };
  const fields = kind === "person" ? [["first_name", "First name"], ["last_name", "Last name"], ["job_title", "Title"], ["primary_email", "E-mail"], ["primary_phone", "Phone"], ["linkedin_url", "LinkedIn"], ["city", "City"], ["country", "Country"]] : [["name", "Company"], ["domain_name", "Domain"], ["website", "Website"], ["city", "City"], ["country", "Country"]];
  return (
    <Modal title={`Add ${kind}`} onClose={onClose} width={560}>
      <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
        {fields.map(([k, l]) => <label key={k} className="text-xs font-semibold" style={{ color: "var(--dim)" }}>{l}<input value={f[k] || ""} onChange={set(k)} style={inp} /></label>)}
      </div>
      {msg && <div className="text-xs mt-2" style={{ color: RED }}>{msg}</div>}
      <button onClick={save} className="mt-3" style={btn(ACCENT)}>Save</button>
    </Modal>
  );
}

/** Apollo's people CSV, parsed here, sent 200 rows at a time. */
function ApolloImport({ lists, onClose }: { lists: List[]; onClose: () => void }) {
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [listId, setListId] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const [msg, setMsg] = useState("");
  const parse = (text: string) => {
    const out: string[][] = []; let cur = ""; let row: string[] = []; let inQ = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQ) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += ch; }
      else if (ch === '"') inQ = true; else if (ch === ",") { row.push(cur); cur = ""; } else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cur); out.push(row); row = []; cur = ""; } else cur += ch;
    }
    if (cur || row.length) { row.push(cur); out.push(row); }
    const head = (out.shift() || []).map((h) => h.trim().toLowerCase());
    const col = (names: string[]) => head.findIndex((h) => names.includes(h));
    const C = { first: col(["first name", "first_name"]), last: col(["last name", "last_name"]), title: col(["title", "job title"]), email: col(["email", "work email", "email address"]), phone: col(["work direct phone", "mobile phone", "corporate phone", "phone", "company phone"]), linkedin: col(["person linkedin url", "linkedin url", "linkedin"]), city: col(["city"]), country: col(["country"]), company: col(["company", "company name", "company name for emails"]), website: col(["website", "company website"]), industry: col(["industry"]) };
    const g = (r: string[], i: number) => (i >= 0 ? (r[i] || "").trim() : "");
    return out.filter((r) => r.some((x) => x.trim())).map((r) => ({ first_name: g(r, C.first), last_name: g(r, C.last), title: g(r, C.title), email: g(r, C.email), phone: g(r, C.phone), linkedin: g(r, C.linkedin), city: g(r, C.city), country: g(r, C.country), company: g(r, C.company), website: g(r, C.website), industry: g(r, C.industry) }));
  };
  const pick = async (file: File | null) => { if (!file) return; setRows(parse(await file.text())); setDone(""); };
  const run = async () => {
    setBusy(true); setMsg(""); const tot = { companiesNew: 0, companiesMatched: 0, peopleNew: 0, peopleMatched: 0, skipped: 0 };
    try {
      for (let i = 0; i < rows.length; i += 200) {
        const r = await api<typeof tot>("/api/marketing/import", { rows: rows.slice(i, i + 200), list_id: listId || undefined });
        for (const k of Object.keys(tot) as (keyof typeof tot)[]) tot[k] += r[k] || 0;
        setDone(`${Math.min(i + 200, rows.length)} of ${rows.length}…`);
      }
      setDone(`Done: ${tot.peopleNew} people new, ${tot.peopleMatched} already here · ${tot.companiesNew} companies new (tagged Apollo + Leads), ${tot.companiesMatched} matched · ${tot.skipped} skipped ✓`);
      setRows([]);
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  return (
    <Modal title="Import from Apollo" onClose={onClose} width={640}>
      <div className="text-sm mb-3" style={{ color: "var(--dim)", lineHeight: 1.6 }}>Export people from Apollo as CSV and drop it here. People are matched on e-mail, companies on domain then name. New companies come in tagged <b>Apollo</b> and <b>Leads</b> and never show in the CRM's Company list; new people are tagged <b>Apollo</b>.</div>
      <input type="file" accept=".csv,text/csv" onChange={(e) => pick(e.target.files?.[0] ?? null)} className="mb-2" />
      {rows.length > 0 && (
        <div className="text-sm mb-2"><b>{rows.length}</b> rows read · {rows.filter((r) => r.email).length} with an e-mail · {new Set(rows.map((r) => r.company.toLowerCase()).filter(Boolean)).size} companies</div>
      )}
      <label className="text-xs font-semibold block mb-2" style={{ color: "var(--dim)" }}>Also add everyone to a list
        <select value={listId} onChange={(e) => setListId(e.target.value)} style={inp}><option value="">— no list —</option>{lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
      </label>
      {msg && <div className="text-xs mb-2" style={{ color: RED }}>{msg}</div>}
      {done && <div className="text-sm mb-2 font-semibold" style={{ color: done.includes("✓") ? GREEN : "var(--dim)" }}>{done}</div>}
      <button onClick={run} disabled={busy || !rows.length} style={btn(rows.length && !busy ? ACCENT : "#E9ECEF", rows.length && !busy ? "#fff" : MUTED)}>{busy ? "Importing…" : `Import ${rows.length} rows`}</button>
    </Modal>
  );
}

/* ───────────────────────────── Lists ───────────────────────────── */

function Lists() {
  const [lists, setLists] = useState<List[] | null>(null);
  const [open, setOpen] = useState<List | null>(null);
  const [members, setMembers] = useState<{ person_id: string; added_at: string; person: Person | null }[] | null>(null);
  const [name, setName] = useState(""); const [desc, setDesc] = useState("");
  const [msg, setMsg] = useState("");
  const load = useCallback(() => api<{ lists: List[] }>("/api/marketing/lists").then((j) => setLists(j.lists || [])).catch(() => setLists([])), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (open) api<{ members: typeof members }>(`/api/marketing/lists?id=${open.id}`).then((j) => setMembers(j.members)).catch(() => setMembers([])); }, [open]);
  const create = async () => { if (!name.trim()) return; try { await api("/api/marketing/lists", { action: "create", name, description: desc }); setName(""); setDesc(""); load(); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } };
  const remove = async (pid: string) => { if (!open) return; await api("/api/marketing/lists", { action: "remove", list_id: open.id, person_ids: [pid] }); setMembers((m) => (m || []).filter((x) => x.person_id !== pid)); load(); };
  const del = async (l: List) => { if (!window.confirm(`Delete the list "${l.name}"? The people stay; only the list goes.`)) return; await api("/api/marketing/lists", { action: "delete", list_id: l.id }); load(); };
  return (
    <div>
      <div className="flex items-end gap-2 flex-wrap mb-3">
        <label className="text-xs font-semibold" style={{ color: "var(--dim)" }}>New list<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Airport GSE heads — India" style={{ ...inp, width: 260 }} /></label>
        <label className="text-xs font-semibold" style={{ color: "var(--dim)" }}>What it is<input value={desc} onChange={(e) => setDesc(e.target.value)} style={{ ...inp, width: 300 }} /></label>
        <button onClick={create} style={btn(ACCENT)}>+ Create</button>
        {msg && <span className="text-xs" style={{ color: RED }}>{msg}</span>}
      </div>
      <div className="text-xs mb-2" style={{ color: MUTED }}>Add people from Leads: tick them and choose the list. Lists feed campaigns.</div>
      <GenieTable<List> rows={lists} minWidth={640} empty="No lists yet — make one above, then tick people on Leads."
        columns={[
          { key: "name", label: "List", sort: (r) => r.name, render: (r) => <button onClick={() => setOpen(r)} className="font-semibold" style={{ color: "var(--blue)", textDecoration: "underline" }}>{r.name}</button> },
          { key: "desc", label: "What it is", render: (r) => r.description || "·" },
          { key: "count", label: "People", align: "right", sort: (r) => r.count, render: (r) => <span className="tnum">{r.count}</span> },
          { key: "by", label: "Made by", render: (r) => r.created_by_email.split("@")[0] },
          { key: "at", label: "On", render: (r) => fmtAt(r.created_at) },
          { key: "x", label: "", render: (r) => <button onClick={() => del(r)} className="text-xs" style={{ color: RED }}>delete</button> },
        ]} />
      {open && (
        <Modal title={`${open.name} · ${open.count} people`} onClose={() => { setOpen(null); setMembers(null); }} width={820}>
          <GenieTable rows={members} minWidth={600} maxHeight="60vh" empty="Nobody on this list yet."
            columns={[
              { key: "n", label: "Name", render: (r) => r.person?.full_name || "—" },
              { key: "t", label: "Title", render: (r) => r.person?.job_title || "·" },
              { key: "c", label: "Company", render: (r) => r.person?.company?.name || "·" },
              { key: "e", label: "E-mail", render: (r) => r.person?.primary_email || <span style={{ color: RED }}>none</span> },
              { key: "x", label: "", render: (r) => <button onClick={() => remove(r.person_id)} className="text-xs" style={{ color: RED }}>remove</button> },
            ]} />
        </Modal>
      )}
    </div>
  );
}

/* ───────────────────────────── Campaigns ───────────────────────────── */

const STEPS = ["Campaign", "Lists & people", "Check list", "Message", "Check message", "Unsubscribes", "Speed", "Send"];

function Campaigns({ seesAll }: { seesAll: boolean }) {
  const [rows, setRows] = useState<Campaign[] | null>(null);
  const [open, setOpen] = useState<Campaign | "new" | null>(null);
  const load = useCallback(() => api<{ campaigns: Campaign[] }>("/api/marketing/campaigns").then((j) => setRows(j.campaigns || [])).catch(() => setRows([])), []);
  useEffect(() => { load(); }, [load]);
  const colour = (s: string) => (s === "sending" ? "#0F766E" : s === "done" ? "var(--green)" : s === "paused" ? "var(--warn)" : s === "ready" ? "var(--blue)" : MUTED);
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <div className="font-bold" style={{ fontSize: 16, color: INK }}>✉️ Email Marketing</div>
        <span className="ml-auto" />
        <button onClick={() => setOpen("new")} style={btn(ACCENT)}>+ New campaign</button>
      </div>
      <GenieTable<Campaign> rows={rows} minWidth={800} empty="No campaigns yet. New campaign walks you through: lists, the list check, the message, the message check, unsubscribes, speed, send."
        columns={[
          { key: "name", label: "Campaign", sort: (r) => r.name, render: (r) => <button onClick={() => setOpen(r)} className="font-semibold" style={{ color: "var(--blue)", textDecoration: "underline" }}>{r.name}</button> },
          { key: "status", label: "Status", render: (r) => <span className="rounded px-1.5 text-xs font-bold" style={{ background: colour(r.status), color: "#fff" }}>{r.status}</span> },
          { key: "subject", label: "Subject", render: (r) => r.subject || "·" },
          { key: "lists", label: "Lists", align: "right", render: (r) => <span className="tnum">{r.list_ids.length}{r.person_ids.length ? ` +${r.person_ids.length}` : ""}</span> },
          { key: "speed", label: "/hour", align: "right", render: (r) => <span className="tnum">{r.speed_per_hour}</span> },
          { key: "sent", label: "Queued / sent", align: "right", render: (r) => <span className="tnum">{r.counts?.queued ?? "·"}</span> },
          { key: "by", label: "By", render: (r) => r.created_by_email.split("@")[0] },
          { key: "at", label: "Started", render: (r) => (r.started_at ? fmtAt(r.started_at) : "·") },
        ]} />
      {open && <CampaignWizard c={open === "new" ? null : open} seesAll={seesAll} onClose={() => { setOpen(null); load(); }} />}
    </div>
  );
}

function CampaignWizard({ c, seesAll, onClose }: { c: Campaign | null; seesAll: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [id, setId] = useState<string | null>(c?.id ?? null);
  const [f, setF] = useState({ name: c?.name || "", subject: c?.subject || "", body_html: c?.body_html || "", list_ids: c?.list_ids || [], person_ids: c?.person_ids || [], channel_ids: c?.channel_ids || [], speed_per_hour: c?.speed_per_hour || 50 });
  const [lists, setLists] = useState<List[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [variables, setVariables] = useState<{ key: string; description: string }[]>([]);
  const [checklist, setChecklist] = useState<Record<string, number | string> | null>(c?.checklist ?? null);
  const [deliv, setDeliv] = useState<{ score: number; issues: string[] } | null>(c?.deliverability ?? null);
  const [unsubs, setUnsubs] = useState<number | null>(null);
  const [status, setStatus] = useState(c?.status || "draft");
  const [detail, setDetail] = useState<{ counts: Record<string, number>; total: number; recent: { email: string; status: string; sent_at: string | null; open_count: number; error: string | null }[] } | null>(null);
  const [magic, setMagic] = useState<{ subject: string; body_html: string; why: string[]; before: { score: number }; after: { score: number } } | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [pplQ, setPplQ] = useState(""); const [pplHits, setPplHits] = useState<Person[]>([]);

  useEffect(() => {
    api<{ lists: List[] }>("/api/marketing/lists").then((j) => setLists(j.lists || [])).catch(() => null);
    api<{ channels: Channel[] }>("/api/marketing/channels").then((j) => setChannels(j.channels || [])).catch(() => null);
    api<{ templates: Template[]; variables: { key: string; description: string }[] }>("/api/marketing/templates").then((j) => { setTemplates(j.templates || []); setVariables(j.variables || []); }).catch(() => null);
    api<{ rows: unknown[] }>("/api/marketing/unsubscribe").then((j) => setUnsubs((j.rows || []).length)).catch(() => null);
  }, []);
  const loadDetail = useCallback(() => { if (id) api<typeof detail & { campaign: Campaign }>(`/api/marketing/campaigns?id=${id}`).then((j) => { setDetail(j); setStatus(j.campaign.status); }).catch(() => null); }, [id]);
  useEffect(() => { loadDetail(); }, [loadDetail]);
  useEffect(() => { if (!pplQ.trim()) { setPplHits([]); return; } const t = setTimeout(() => api<{ rows: Person[] }>(`/api/marketing/leads?kind=person&q=${encodeURIComponent(pplQ)}`).then((j) => setPplHits(j.rows.slice(0, 12))).catch(() => null), 250); return () => clearTimeout(t); }, [pplQ]);

  const save = async (): Promise<string> => {
    setBusy("save"); setMsg("");
    try { const r = await api<{ id: string }>("/api/marketing/campaigns", { action: "save", id: id || undefined, ...f }); setId(r.id); setStatus("draft"); return r.id; }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); throw e; } finally { setBusy(""); }
  };
  const act = async (action: string, after?: (j: Record<string, unknown>) => void) => {
    setBusy(action); setMsg("");
    try { const cid = id || (await save()); const j = await api<Record<string, unknown>>("/api/marketing/campaigns", { action, id: cid }); after?.(j); loadDetail(); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } finally { setBusy(""); }
  };
  const next = async () => { try { await save(); setStep((s) => Math.min(STEPS.length - 1, s + 1)); } catch { /* shown */ } };
  const doMagic = async () => {
    setBusy("magic"); setMsg("");
    try { setMagic(await api("/api/marketing/magic", { subject: f.subject, body_html: f.body_html, audience: lists.filter((l) => f.list_ids.includes(l.id)).map((l) => l.name).join(", ") })); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } finally { setBusy(""); }
  };
  const reach = useMemo(() => lists.filter((l) => f.list_ids.includes(l.id)).reduce((s, l) => s + l.count, 0) + f.person_ids.length, [lists, f.list_ids, f.person_ids]);
  const sending = status === "sending";

  return (
    <Modal title={<>{c ? c.name : "New campaign"} <span className="ml-2 rounded px-1.5 text-xs" style={{ background: "#22303C", color: "#CBD5E1" }}>{status}</span></>} onClose={onClose} width={900}>
      <div className="flex gap-1 flex-wrap mb-3">
        {STEPS.map((s, i) => <button key={s} onClick={() => setStep(i)} className="text-xs font-bold rounded px-2 py-1" style={{ background: step === i ? NAVY : "#F4F2EC", color: step === i ? "#fff" : "var(--dim)" }}>{i + 1}. {s}</button>)}
      </div>
      {msg && <div className="text-xs font-semibold mb-2" style={{ color: RED }}>{msg}</div>}
      {sending && <div className="text-xs mb-2 rounded px-2 py-1" style={{ background: "#E6F4EA", color: GREEN }}>Sending — the cron takes a pass every ten minutes at {f.speed_per_hour}/hour. Pause before changing anything.</div>}

      {step === 0 && (
        <div>
          <label className="text-xs font-semibold" style={{ color: "var(--dim)" }}>Campaign name<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Sept 2026 — GSE heads, India" style={inp} /></label>
          <div className="text-xs mt-2" style={{ color: MUTED }}>A campaign is one message to one audience through the channels you tick. Name it for the audience and the month.</div>
        </div>
      )}
      {step === 1 && (
        <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div>
            <div className="text-xs font-bold mb-1" style={{ color: MUTED }}>LISTS</div>
            {lists.length === 0 && <div className="text-xs" style={{ color: MUTED }}>No lists yet — make one under Lists.</div>}
            {lists.map((l) => (
              <label key={l.id} className="flex items-center gap-2 text-sm py-0.5"><input type="checkbox" checked={f.list_ids.includes(l.id)} disabled={sending} onChange={(e) => setF({ ...f, list_ids: e.target.checked ? [...f.list_ids, l.id] : f.list_ids.filter((x) => x !== l.id) })} />{l.name} <span className="tnum text-xs" style={{ color: MUTED }}>({l.count})</span></label>
            ))}
          </div>
          <div>
            <div className="text-xs font-bold mb-1" style={{ color: MUTED }}>PEOPLE, ONE BY ONE</div>
            <input value={pplQ} onChange={(e) => setPplQ(e.target.value)} placeholder="search a person…" style={inp} />
            {pplHits.map((p) => <button key={p.id} onClick={() => { if (!f.person_ids.includes(p.id)) setF({ ...f, person_ids: [...f.person_ids, p.id] }); }} className="block text-left text-xs py-0.5" style={{ color: "var(--blue)" }}>+ {p.full_name} · {p.primary_email || "no e-mail"}</button>)}
            <div className="text-xs mt-2" style={{ color: MUTED }}>{f.person_ids.length} added by hand{f.person_ids.length ? <button onClick={() => setF({ ...f, person_ids: [] })} className="ml-2" style={{ color: RED }}>clear</button> : null}</div>
          </div>
          <div className="text-sm" style={{ gridColumn: "1 / -1" }}>Reach before checks: <b className="tnum">{reach}</b></div>
        </div>
      )}
      {step === 2 && (
        <div>
          <button onClick={() => act("check_list", (j) => setChecklist(j.checklist as Record<string, number>))} disabled={!!busy} style={btn(NAVY)}>{busy === "check_list" ? "Checking…" : "Run the list check"}</button>
          {checklist && (
            <div className="grid gap-2 mt-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
              {[["reach", "Will receive", GREEN], ["people", "People on lists", INK], ["noEmail", "No e-mail", "var(--warn)"], ["duplicates", "Duplicates dropped", MUTED], ["unsubscribed", "Unsubscribed, skipped", RED]].map(([k, l, col]) => (
                <div key={k} className="rounded border p-2" style={{ borderColor: LINE }}><div className="text-xs" style={{ color: MUTED }}>{l}</div><div className="tnum font-bold" style={{ fontSize: 22, color: col }}>{checklist[k] ?? 0}</div></div>
              ))}
            </div>
          )}
        </div>
      )}
      {step === 3 && (
        <div>
          <div className="flex gap-2 flex-wrap mb-2 text-xs items-center">
            <span style={{ color: MUTED }}>Template:</span>
            <select onChange={(e) => { const t = templates.find((x) => x.id === e.target.value); if (t) setF({ ...f, subject: t.subject || "", body_html: t.body_html || "" }); }} defaultValue="" style={{ ...inp, width: 240 }}><option value="">— pick one —</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
            <span style={{ color: MUTED }}>Variables:</span>
            {variables.map((v) => <button key={v.key} onClick={() => setF({ ...f, body_html: f.body_html + `{{${v.key}}}` })} className="rounded px-1.5 py-0.5 font-mono" style={{ background: "#F4F2EC", color: INK }} title={v.description}>{`{{${v.key}}}`}</button>)}
          </div>
          <label className="text-xs font-semibold" style={{ color: "var(--dim)" }}>Subject<input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} disabled={sending} style={inp} /></label>
          <label className="text-xs font-semibold block mt-2" style={{ color: "var(--dim)" }}>Body (HTML or plain text; {"{{first_name}}"} and the rest are filled per person)
            <textarea value={f.body_html} onChange={(e) => setF({ ...f, body_html: e.target.value })} rows={12} disabled={sending} style={{ ...inp, fontFamily: "monospace", fontSize: 12.5 }} />
          </label>
          <div className="flex gap-2 mt-2 items-center flex-wrap">
            <button onClick={doMagic} disabled={!!busy || sending} style={btn("#6D28D9")}>{busy === "magic" ? "Genie is thinking…" : "✨ Genie magic — improve subject & message"}</button>
            <span className="text-xs" style={{ color: MUTED }}>Rewrites for the inbox: shorter subject, no trigger words, one ask, variables kept. You choose whether to use it.</span>
          </div>
          {magic && (
            <div className="rounded border p-3 mt-3" style={{ borderColor: "#6D28D9", background: "#FAF5FF" }}>
              <div className="text-xs font-bold mb-1" style={{ color: "#6D28D9" }}>GENIE'S VERSION · deliverability {magic.before.score} → {magic.after.score}</div>
              <div className="text-sm font-semibold">{magic.subject}</div>
              <div className="text-sm mt-1 rounded bg-white p-2" style={{ maxHeight: 220, overflow: "auto" }} dangerouslySetInnerHTML={{ __html: magic.body_html }} />
              <ul className="text-xs mt-2" style={{ color: "var(--dim)", paddingLeft: 18, listStyle: "disc" }}>{magic.why.map((w, i) => <li key={i}>{w}</li>)}</ul>
              <div className="flex gap-2 mt-2"><button onClick={() => { setF({ ...f, subject: magic.subject, body_html: magic.body_html }); setMagic(null); }} style={btn("#6D28D9")}>Use this</button><button onClick={() => setMagic(null)} style={btn("#fff", "var(--dim)")}>Keep mine</button></div>
            </div>
          )}
        </div>
      )}
      {step === 4 && (
        <div>
          <button onClick={() => act("check_message", (j) => setDeliv(j.deliverability as { score: number; issues: string[] }))} disabled={!!busy} style={btn(NAVY)}>{busy === "check_message" ? "Checking…" : "Check the message for deliverability"}</button>
          {deliv && (
            <div className="mt-3">
              <div className="flex items-baseline gap-2"><span className="tnum font-bold" style={{ fontSize: 30, color: deliv.score >= 80 ? GREEN : deliv.score >= 60 ? "var(--warn)" : RED }}>{deliv.score}</span><span className="text-sm" style={{ color: MUTED }}>/ 100 — what a filter sees first: subject length, trigger words, links, images, a name in the mail</span></div>
              {deliv.issues.length === 0 ? <div className="text-sm mt-1" style={{ color: GREEN }}>Nothing a filter would hold against it.</div> : <ul className="text-sm mt-1" style={{ paddingLeft: 18, listStyle: "disc" }}>{deliv.issues.map((x, i) => <li key={i}>{x}</li>)}</ul>}
              <div className="text-xs mt-2" style={{ color: MUTED }}>Under 60, go back to Message and press ✨ Genie magic.</div>
            </div>
          )}
        </div>
      )}
      {step === 5 && (
        <div className="text-sm" style={{ lineHeight: 1.7 }}>
          <div><b className="tnum">{unsubs ?? "…"}</b> addresses on the unsubscribe list. Every one is skipped at send time, whatever list they sit on.</div>
          <div>Every mail carries an unsubscribe link; one click puts the address on the list for good. Bounces and complaints reported by Resend land there on their own. Gmail bounces come back to the mailbox — add them under Unsubscribes.</div>
          <div className="text-xs mt-1" style={{ color: MUTED }}>The list itself is under Unsubscribes on the rail.</div>
        </div>
      )}
      {step === 6 && (
        <div>
          <div className="text-xs font-bold mb-1" style={{ color: MUTED }}>FROM — the addresses ticked carry the mail, round-robin</div>
          {channels.length === 0 && <div className="text-xs" style={{ color: RED }}>No sending channel yet — add one under Sending Channels.</div>}
          {channels.map((ch) => (
            <label key={ch.id} className="flex items-center gap-2 text-sm py-0.5" style={{ opacity: ch.active ? 1 : 0.5 }}>
              <input type="checkbox" checked={f.channel_ids.includes(ch.id)} disabled={sending || !ch.active} onChange={(e) => setF({ ...f, channel_ids: e.target.checked ? [...f.channel_ids, ch.id] : f.channel_ids.filter((x) => x !== ch.id) })} />
              <b>{ch.email}</b> <span className="text-xs" style={{ color: MUTED }}>{ch.kind}{ch.kind === "gmail" ? (ch.gmail ? ` · ${ch.gmail}` : " · not connected") : ""} · {ch.hourly_limit}/h · {ch.daily_limit}/day · today {ch.sent_today}</span>
            </label>
          ))}
          <label className="text-xs font-semibold block mt-3" style={{ color: "var(--dim)" }}>Speed — mails an hour across the ticked channels
            <input type="number" min={1} max={2000} value={f.speed_per_hour} disabled={sending} onChange={(e) => setF({ ...f, speed_per_hour: Number(e.target.value) || 50 })} style={{ ...inp, width: 140 }} />
          </label>
          <div className="text-xs mt-1" style={{ color: MUTED }}>Each channel's own hourly and daily limits cap it further. A new Gmail address should start at 20–30 an hour.</div>
        </div>
      )}
      {step === 7 && (
        <div>
          <div className="text-sm mb-2" style={{ lineHeight: 1.7 }}>
            <div>Reach <b className="tnum">{checklist?.reach ?? reach}</b> · message score <b className="tnum">{deliv?.score ?? "not checked"}</b> · channels <b>{f.channel_ids.length}</b> · <b>{f.speed_per_hour}</b>/hour</div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {!sending && <button onClick={() => act("send_now", (j) => setMsg(`Queued ${j.queued}; first pass sent ${(j.pass as Record<string, number> | null)?.sent ?? 0} ✓`))} disabled={!!busy || !f.channel_ids.length} style={btn(ACCENT)}>{busy === "send_now" ? "Sending…" : "🚀 Send — queue everyone and start now"}</button>}
            {!sending && <button onClick={() => act("queue")} disabled={!!busy || !f.channel_ids.length} style={btn(NAVY)}>Queue and let the cron send</button>}
            {sending && <button onClick={() => act("pause")} disabled={!!busy} style={btn("var(--warn)")}>⏸ Pause</button>}
            {status === "paused" && <button onClick={() => act("resume")} disabled={!!busy} style={btn(GREEN)}>▶ Resume</button>}
            {seesAll && status !== "sending" && id && <button onClick={() => { if (window.confirm("Delete this campaign and its send log?")) act("delete", () => onClose()); }} style={btn("#fff", RED)}>delete</button>}
          </div>
          {detail && detail.total > 0 && (
            <div className="mt-3">
              <div className="flex gap-3 flex-wrap text-sm">{Object.entries(detail.counts).map(([k, v]) => <span key={k}><b className="tnum">{v}</b> {k}</span>)}<span style={{ color: MUTED }}>of {detail.total}</span></div>
              <div className="genie-scroll mt-2" style={{ maxHeight: 240 }}>
                <table className="genie-table"><thead><tr><th>E-mail</th><th>Status</th><th>Sent</th><th className="num">Opens</th><th>Error</th></tr></thead>
                  <tbody>{detail.recent.map((r, i) => <tr key={i}><td>{r.email}</td><td style={{ color: r.status === "opened" ? GREEN : r.status === "failed" || r.status === "bounced" ? RED : INK }}>{r.status}</td><td className="tnum">{r.sent_at ? fmtAt(r.sent_at) : "·"}</td><td className="num tnum">{r.open_count || "·"}</td><td className="text-xs" style={{ color: RED }}>{r.error || ""}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
      <div className="flex gap-2 mt-4 pt-3" style={{ borderTop: `1px solid ${LINE}` }}>
        <button onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} style={btn("#fff", "var(--dim)")}>← Back</button>
        {!sending && <button onClick={save} disabled={!!busy} style={btn("#fff", INK)}>{busy === "save" ? "Saving…" : "Save"}</button>}
        {step < STEPS.length - 1 && <button onClick={next} disabled={!!busy} style={btn(NAVY)}>Save & next →</button>}
      </div>
    </Modal>
  );
}

/* ───────────────────────────── Templates ───────────────────────────── */

function Templates() {
  const [rows, setRows] = useState<Template[] | null>(null);
  const [vars, setVars] = useState<{ key: string; description: string }[]>([]);
  const [open, setOpen] = useState<Template | "new" | null>(null);
  const [f, setF] = useState({ name: "", subject: "", body_html: "" });
  const [msg, setMsg] = useState("");
  const load = useCallback(() => api<{ templates: Template[]; variables: { key: string; description: string }[] }>("/api/marketing/templates").then((j) => { setRows(j.templates || []); setVars(j.variables || []); }).catch(() => setRows([])), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (open && open !== "new") setF({ name: open.name, subject: open.subject || "", body_html: open.body_html || "" }); if (open === "new") setF({ name: "", subject: "", body_html: "" }); }, [open]);
  const save = async () => { try { await api("/api/marketing/templates", { action: "save", id: open && open !== "new" ? open.id : undefined, ...f }); setOpen(null); load(); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } };
  return (
    <div>
      <div className="flex items-center gap-2 mb-2"><div className="font-bold" style={{ fontSize: 16, color: INK }}>📝 Templates</div><span className="ml-auto" /><button onClick={() => setOpen("new")} style={btn(ACCENT)}>+ New template</button></div>
      <div className="text-xs mb-2" style={{ color: MUTED }}>Variables: {vars.map((v) => <code key={v.key} className="mr-1" title={v.description}>{`{{${v.key}}}`}</code>)}</div>
      <GenieTable<Template> rows={rows} minWidth={600} empty="No templates yet."
        columns={[
          { key: "name", label: "Template", render: (r) => <button onClick={() => setOpen(r)} className="font-semibold" style={{ color: "var(--blue)", textDecoration: "underline" }}>{r.name}</button> },
          { key: "subject", label: "Subject", render: (r) => r.subject || "·" },
          { key: "x", label: "", render: (r) => <button onClick={async () => { if (window.confirm(`Delete "${r.name}"?`)) { await api("/api/marketing/templates", { action: "delete", id: r.id }); load(); } }} className="text-xs" style={{ color: RED }}>delete</button> },
        ]} />
      {open && (
        <Modal title={open === "new" ? "New template" : open.name} onClose={() => setOpen(null)} width={760}>
          <label className="text-xs font-semibold" style={{ color: "var(--dim)" }}>Name<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} style={inp} /></label>
          <label className="text-xs font-semibold block mt-2" style={{ color: "var(--dim)" }}>Subject<input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} style={inp} /></label>
          <label className="text-xs font-semibold block mt-2" style={{ color: "var(--dim)" }}>Body<textarea value={f.body_html} onChange={(e) => setF({ ...f, body_html: e.target.value })} rows={12} style={{ ...inp, fontFamily: "monospace", fontSize: 12.5 }} /></label>
          {msg && <div className="text-xs mt-2" style={{ color: RED }}>{msg}</div>}
          <button onClick={save} className="mt-3" style={btn(ACCENT)}>Save</button>
        </Modal>
      )}
    </div>
  );
}

/* ───────────────────────────── Channels ───────────────────────────── */

function Channels({ seesAll }: { seesAll: boolean }) {
  const [rows, setRows] = useState<Channel[] | null>(null);
  const [f, setF] = useState<{ id?: string; email: string; label: string; kind: "gmail" | "resend" | "mailercloud"; api_key: string; daily_limit: number; hourly_limit: number; active: boolean }>({ email: "", label: "", kind: "gmail", api_key: "", daily_limit: 200, hourly_limit: 50, active: true });
  const [msg, setMsg] = useState("");
  const load = useCallback(() => api<{ channels: Channel[] }>("/api/marketing/channels").then((j) => setRows(j.channels || [])).catch(() => setRows([])), []);
  useEffect(() => { load(); }, [load]);
  const save = async () => { try { await api("/api/marketing/channels", { action: "save", ...f }); setF({ email: "", label: "", kind: "gmail", api_key: "", daily_limit: 200, hourly_limit: 50, active: true }); setMsg("saved ✓"); load(); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } };
  return (
    <div>
      <div className="font-bold mb-1" style={{ fontSize: 16, color: INK }}>📡 Sending Channels</div>
      <div className="text-xs mb-3" style={{ color: MUTED, lineHeight: 1.6 }}>Each address is a channel with its own limits and its own API: <b>Gmail</b> sends through the mailbox connected under CRM → Integrations for that address; <b>Resend</b> sends through Resend's API with the key on the channel (or the deploy's); <b>Mailercloud</b> sends through its Email API with the key on the channel — the sender address must be verified there. A campaign ticks the addresses it goes from.</div>
      {seesAll && (
        <div className="rounded border p-3 mb-3 grid gap-2" style={{ borderColor: LINE, background: "#FBFAF7", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
          <label className="text-xs font-semibold" style={{ color: "var(--dim)" }}>E-mail<input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} style={inp} /></label>
          <label className="text-xs font-semibold" style={{ color: "var(--dim)" }}>Sender name<input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="e.g. Raghu at Nandan" style={inp} /></label>
          <label className="text-xs font-semibold" style={{ color: "var(--dim)" }}>Sending API<select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as "gmail" | "resend" | "mailercloud" })} style={inp}><option value="gmail">Gmail (connected mailbox)</option><option value="resend">Resend</option><option value="mailercloud">Mailercloud</option></select></label>
          {f.kind !== "gmail" && <label className="text-xs font-semibold" style={{ color: "var(--dim)" }}>{f.kind === "resend" ? "Resend API key" : "Mailercloud API key"}<input value={f.api_key} onChange={(e) => setF({ ...f, api_key: e.target.value })} placeholder={f.kind === "resend" ? "blank = deploy's key" : "from Mailercloud → Settings → API"} style={inp} /></label>}
          <label className="text-xs font-semibold" style={{ color: "var(--dim)" }}>Per hour<input type="number" value={f.hourly_limit} onChange={(e) => setF({ ...f, hourly_limit: Number(e.target.value) })} style={inp} /></label>
          <label className="text-xs font-semibold" style={{ color: "var(--dim)" }}>Per day<input type="number" value={f.daily_limit} onChange={(e) => setF({ ...f, daily_limit: Number(e.target.value) })} style={inp} /></label>
          <div className="flex items-end gap-2"><button onClick={save} style={btn(ACCENT)}>{f.id ? "Update" : "+ Add channel"}</button>{f.id && <button onClick={() => setF({ email: "", label: "", kind: "gmail", api_key: "", daily_limit: 200, hourly_limit: 50, active: true })} style={btn("#fff", "var(--dim)")}>cancel</button>}</div>
          {msg && <div className="text-xs" style={{ color: msg.includes("✓") ? GREEN : RED, gridColumn: "1 / -1" }}>{msg}</div>}
        </div>
      )}
      <GenieTable<Channel> rows={rows} minWidth={760} empty="No channel yet."
        columns={[
          { key: "email", label: "From", render: (r) => <span><b>{r.email}</b>{r.label ? <span className="text-xs" style={{ color: MUTED }}> · {r.label}</span> : null}</span> },
          { key: "kind", label: "API", render: (r) => r.kind === "gmail" ? `Gmail · ${r.gmail || "not connected"}` : r.kind === "mailercloud" ? `Mailercloud · ${r.api_key ? "key set" : "NO KEY"}` : `Resend · ${r.api_key ? "own key" : r.resendKeyOnDeploy ? "deploy key" : "NO KEY"}` },
          { key: "h", label: "/hour", align: "right", render: (r) => <span className="tnum">{r.sent_this_hour} / {r.hourly_limit}</span> },
          { key: "d", label: "/day", align: "right", render: (r) => <span className="tnum">{r.sent_today} / {r.daily_limit}</span> },
          { key: "active", label: "Active", render: (r) => (r.active ? "✓" : "off") },
          { key: "x", label: "", render: (r) => seesAll ? <span className="flex gap-2"><button onClick={() => setF({ id: r.id, email: r.email, label: r.label || "", kind: r.kind, api_key: "", daily_limit: r.daily_limit, hourly_limit: r.hourly_limit, active: r.active })} className="text-xs" style={{ color: "var(--blue)" }}>edit</button><button onClick={async () => { if (window.confirm(`Remove ${r.email}?`)) { await api("/api/marketing/channels", { action: "delete", id: r.id }); load(); } }} className="text-xs" style={{ color: RED }}>remove</button></span> : null },
        ]} />
    </div>
  );
}

/* ───────────────────────────── Unsubscribes ───────────────────────────── */

function Unsubscribes({ seesAll }: { seesAll: boolean }) {
  const [rows, setRows] = useState<{ email: string; reason: string; note: string | null; at: string }[] | null>(null);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const load = useCallback(() => api<{ rows: NonNullable<typeof rows> }>("/api/marketing/unsubscribe").then((j) => setRows(j.rows || [])).catch(() => setRows([])), []);
  useEffect(() => { load(); }, [load]);
  const add = async (reason: string) => { try { const r = await api<{ n: number }>("/api/marketing/unsubscribe", { action: "add", emails: text, reason }); setMsg(`${r.n} added ✓`); setText(""); load(); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } };
  return (
    <div>
      <div className="font-bold mb-1" style={{ fontSize: 16, color: INK }}>🚫 Unsubscribes</div>
      <div className="text-xs mb-2" style={{ color: MUTED, lineHeight: 1.6 }}>Kept meticulously: every click on an unsubscribe link, every bounce and complaint Resend reports, and whatever you paste here. Every campaign skips these at send time.</div>
      <div className="flex gap-2 items-start mb-3 flex-wrap">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="paste addresses — commas, spaces or lines" style={{ ...inp, width: 420 }} />
        <button onClick={() => add("bounce")} style={btn(RED)}>Add as bounced</button>
        <button onClick={() => add("request")} style={btn(NAVY)}>Add as requested</button>
        {msg && <span className="text-xs" style={{ color: msg.includes("✓") ? GREEN : RED }}>{msg}</span>}
      </div>
      <GenieTable rows={rows} minWidth={600} search={(r, q) => r.email.includes(q)} empty="Nobody has unsubscribed yet."
        columns={[
          { key: "email", label: "E-mail", sort: (r) => r.email, render: (r) => r.email },
          { key: "reason", label: "Why", render: (r) => <span className="rounded px-1 text-xs font-bold" style={{ background: r.reason === "bounce" || r.reason === "complaint" ? "#FBEDEA" : "#F4F2EC", color: INK }}>{r.reason}</span> },
          { key: "note", label: "Note", render: (r) => r.note || "·" },
          { key: "at", label: "When", sort: (r) => r.at, render: (r) => fmtAt(r.at) },
          { key: "x", label: "", render: (r) => seesAll ? <button onClick={async () => { if (window.confirm(`Take ${r.email} off the list? They will get mail again.`)) { await api("/api/marketing/unsubscribe", { action: "remove", email: r.email }); load(); } }} className="text-xs" style={{ color: RED }}>remove</button> : null },
        ]} />
    </div>
  );
}
