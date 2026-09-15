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
import { CompanyBox, PersonBox, Modal, type Person, type Company } from "@/components/marketing/LeadBoxes";
import RichTextEditor from "@/components/RichTextEditor";
import ApolloLeads from "@/components/marketing/ApolloLeads";
import LandingPages, { uploadPublic } from "@/components/marketing/LandingPages";

type List = { id: string; name: string; description: string | null; created_by_email: string; created_at: string; count: number };
type Stat = { contacts: number; queued: number; sent: number; delivered: number; opened: number; bounced: number; unsubscribed: number; failed: number; skipped: number };
type Campaign = { id: string; name: string; status: string; subject: string | null; body_html?: string | null; show_unsub_link?: boolean; stat?: Stat | null; list_ids: string[]; person_ids: string[]; channel_ids: string[]; speed_per_hour: number; created_by_email: string; created_at: string; started_at: string | null; done_at: string | null; counts: Record<string, number> | null; checklist?: Record<string, number | string> | null; deliverability?: { score: number; issues: string[] } | null };
type Channel = { id: string; email: string; label: string | null; kind: "gmail" | "resend" | "mailercloud"; reply_to: string | null; daily_limit: number; hourly_limit: number; active: boolean; sent_today: number; sent_this_hour: number; gmail: string | null; api_key: string | null; resendKeyOnDeploy: boolean };
type Template = { id: string; name: string; subject: string | null; body_html: string | null };

const SECTIONS = [
  { key: "leads", label: "Leads", icon: "🎯" }, { key: "apollo", label: "Apollo Leads", icon: "🛰" }, { key: "lists", label: "Lists", icon: "📋" }, { key: "campaigns", label: "Email Marketing", icon: "✉️" },
  { key: "templates", label: "Templates", icon: "📝" }, { key: "landing", label: "Landing pages", icon: "🌐" }, { key: "channels", label: "Sending Channels", icon: "📡" }, { key: "unsubscribes", label: "Unsubscribes", icon: "🚫" },
];
const INK = "var(--ink)", MUTED = "var(--muted)", LINE = "var(--line)", ACCENT = "var(--accent)", GREEN = "var(--green)", RED = "var(--red)", NAVY = "var(--navy)";
const inp: React.CSSProperties = { border: `1px solid #E2E0DA`, borderRadius: 6, padding: "6px 8px", fontSize: 13, background: "#fff", color: "#22303C", width: "100%" };
const btn = (bg: string, fg = "#fff"): React.CSSProperties => ({ background: bg, color: fg, borderRadius: 6, padding: "6px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" });

/**
 * A REPLY THAT IS NOT JSON MUST SAY WHAT IT IS.
 *
 * Dr Raghu, 14 Sep 2026, on the message editor: "Unterminated string in JSON
 * at position 2451 (line 3 column 2386)". That sentence tells the reader
 * nothing they can act on — it is the browser's parser complaining, not
 * Genie speaking. The campaign had in fact saved perfectly; something else on
 * the screen had been answered by a gateway rather than by the app.
 *
 * So the body is read as TEXT first and parsed second. When it will not
 * parse, the error names the route, the HTTP status and the first words of
 * what actually came back — which is usually enough to see at a glance
 * whether it was a timeout, a redirect to the login page, or a truncated
 * reply — and it says plainly that the failure was in reading the answer,
 * not necessarily in the work.
 */
async function api<T = Record<string, unknown>>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const text = await r.text();
  let j: Record<string, unknown>;
  try { j = text ? JSON.parse(text) : {}; }
  catch {
    const head = text.replace(/\s+/g, " ").trim().slice(0, 90);
    throw new Error(
      `${path} answered with something that is not JSON (HTTP ${r.status})` +
      (head ? ` — it began “${head}…”` : " — it sent nothing at all") +
      ". The reply could not be read; the work itself may well have gone through.",
    );
  }
  if (!r.ok) throw new Error(String(j.error || `HTTP ${r.status} from ${path}`));
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
          {section === "apollo" && <ApolloSection />}
          {section === "lists" && <Lists />}
          {section === "campaigns" && <Campaigns seesAll={seesAll} />}
          {section === "templates" && <Templates />}
          {section === "landing" && <LandingSection />}
          {section === "channels" && <Channels seesAll={seesAll} />}
          {section === "unsubscribes" && <Unsubscribes seesAll={seesAll} />}
        </div>
      </div>
    </GenieShell>
  );
}

/** The landing pages need the mailing lists, so a lead can join one. */
function LandingSection() {
  const [lists, setLists] = useState<List[]>([]);
  useEffect(() => { api<{ lists: List[] }>("/api/marketing/lists").then((j) => setLists(j.lists || [])).catch(() => setLists([])); }, []);
  return <LandingPages lists={lists} />;
}

/** Apollo Leads needs the mailing lists, so a promotion can land on one. */
function ApolloSection() {
  const [lists, setLists] = useState<List[]>([]);
  const load = useCallback(() => api<{ lists: List[] }>("/api/marketing/lists").then((j) => setLists(j.lists || [])).catch(() => setLists([])), []);
  useEffect(() => { load(); }, [load]);
  return <ApolloLeads lists={lists} onPromoted={load} />;
}

/* ───────────────────────────── Leads ───────────────────────────── */

function Leads({ me, seesAll }: { me: string; seesAll: boolean }) {
  const [kind, setKind] = useState<"person" | "company">("person");
  const [q, setQ] = useState("");
  const [mine, setMine] = useState(!seesAll);
  const [flt, setFlt] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<(Person | Company)[] | null>(null);
  const [total, setTotal] = useState(0);
  const [installed, setInstalled] = useState(true);
  const [industries, setIndustries] = useState<{ id: number; name: string }[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [lists, setLists] = useState<List[]>([]);
  const [msg, setMsg] = useState("");
  const [adding, setAdding] = useState(false);
  const [bulkTo, setBulkTo] = useState("");

  const qs = useCallback(() => {
    const p = new URLSearchParams({ kind, q, mine: mine ? "1" : "0" });
    for (const [k, v] of Object.entries(flt)) if (v) p.set(k, v);
    return p.toString();
  }, [kind, q, mine, flt]);
  const load = useCallback(() => {
    api<{ rows: (Person | Company)[]; total: number; installed: boolean; industries: { id: number; name: string }[] }>(`/api/marketing/leads?${qs()}`)
      .then((j) => { setRows(j.rows); setTotal(j.total); setInstalled(j.installed !== false); if (j.industries?.length) setIndustries(j.industries); }).catch((e) => { swallow("marketing/leads", e); setRows([]); });
  }, [qs]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  const loadLists = useCallback(() => api<{ lists: List[] }>("/api/marketing/lists").then((j) => setLists(j.lists || [])).catch(() => setLists([])), []);
  useEffect(() => { loadLists(); }, [loadLists]);
  useEffect(() => { setPicked(new Set()); }, [kind, q, flt, mine]);

  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const shown = rows ?? [];
  const allShown = shown.length > 0 && shown.every((r) => picked.has(r.id));
  const selectShown = () => setPicked(new Set(shown.map((r) => r.id)));
  const selectAllMatching = async () => { try { const j = await api<{ ids: string[]; total: number }>(`/api/marketing/leads?${qs()}&ids=1`); setPicked(new Set(j.ids)); setMsg(`${j.ids.length} of ${j.total} selected ✓`); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } };
  const addToList = async (listId: string) => {
    if (!picked.size || !listId) return;
    try { const r = await api<{ n: number }>("/api/marketing/lists", { action: "add", list_id: listId, person_ids: [...picked] }); setMsg(`${r.n} added to the list ✓`); setPicked(new Set()); loadLists(); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  };
  const bulk = async (set: Record<string, unknown>, label: string) => {
    if (!picked.size) return;
    try { const r = await api<{ n: number }>("/api/marketing/leads", { action: "bulk", kind, ids: [...picked], set }); setMsg(`${label} on ${r.n} ✓`); setPicked(new Set()); load(); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  };
  const assign = async (id: string, to: string) => { try { await api("/api/marketing/leads", { action: "assign", kind, id, to }); load(); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } };
  const markLead = async (c: Company, lead: boolean) => { try { await api("/api/marketing/leads", { action: "mark_lead", company_id: c.id, lead }); load(); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } };
  const setF = (k: string, v: string) => setFlt((f) => ({ ...f, [k]: v }));
  const sel = (k: string, opts: [string, string][], title: string) => (
    <select value={flt[k] || ""} onChange={(e) => setF(k, e.target.value)} title={title} style={{ ...inp, width: "auto", padding: "4px 6px", fontSize: 12 }}>
      {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <div className="flex rounded overflow-hidden" style={{ border: `1px solid ${LINE}` }}>
          <button onClick={() => setKind("person")} className="px-3 py-1.5 text-sm font-bold" style={{ background: kind === "person" ? NAVY : "#fff", color: kind === "person" ? "#fff" : INK }}>👤 People</button>
          <button onClick={() => setKind("company")} className="px-3 py-1.5 text-sm font-bold" style={{ background: kind === "company" ? NAVY : "#fff", color: kind === "company" ? "#fff" : INK }}>🏢 Companies</button>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={kind === "person" ? "search name, e-mail, title…" : "search company, domain, city…"} style={{ ...inp, width: 240 }} />
        <span className="ml-auto" />
        <button onClick={() => setAdding(true)} style={btn("#fff", INK)} className="border">+ Add {kind === "person" ? "person" : "company"}</button>
        <a href="/marketing/apollo" style={{ ...btn(ACCENT), textDecoration: "none" }} title="Apollo lists land in the pool first; you pick who joins the CRM">🛰 Apollo Leads →</a>
      </div>
      {/* ---- the filters (Dr Raghu, 6 Sep 2026: "also have a filter on the top") ---- */}
      <div className="flex items-center gap-1.5 flex-wrap mb-2 text-xs rounded px-2 py-1.5" style={{ background: "#fff", border: `1px solid ${LINE}` }}>
        <span className="font-bold mr-1" style={{ color: MUTED }}>FILTER</span>
        {sel("source", [["", "any source"], ["crm", "CRM"], ["apollo", "Apollo"]], "where the record came from")}
        {kind === "company" && sel("lead", [["", "leads & others"], ["1", "leads only"]], "marked as lead")}
        {kind === "company" && sel("customer", [["", "customers & others"], ["1", "customers only"]], "already a customer")}
        {kind === "company" && industries.length > 0 && sel("industry", [["", "any industry"], ...industries.map((i) => [String(i.id), i.name] as [string, string])], "industry")}
        {kind === "person" && sel("has_email", [["", "with or without e-mail"], ["1", "has e-mail"], ["0", "no e-mail"]], "e-mail on the record")}
        <input value={flt.country || ""} onChange={(e) => setF("country", e.target.value)} placeholder="country" style={{ ...inp, width: 110, padding: "4px 6px", fontSize: 12 }} />
        <input value={flt.city || ""} onChange={(e) => setF("city", e.target.value)} placeholder="city" style={{ ...inp, width: 110, padding: "4px 6px", fontSize: 12 }} />
        {seesAll && <input value={flt.assigned || ""} onChange={(e) => setF("assigned", e.target.value)} placeholder="assigned to (e-mail, or none)" style={{ ...inp, width: 200, padding: "4px 6px", fontSize: 12 }} />}
        {seesAll && <label className="flex items-center gap-1" style={{ color: MUTED }}><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> only mine</label>}
        {(Object.values(flt).some(Boolean) || q) && <button onClick={() => { setFlt({}); setQ(""); }} className="font-semibold" style={{ color: RED }}>✕ clear</button>}
        <span className="ml-auto tnum" style={{ color: MUTED }}>{total.toLocaleString("en-IN")} {kind === "person" ? "people" : "companies"}{shown.length < total ? ` · showing ${shown.length}` : ""}</span>
      </div>
      {!installed && <div className="text-xs mb-2" style={{ color: RED }}>Run CRM migration 0055 first — the leads fields do not exist yet.</div>}
      {msg && <div className="text-xs font-semibold mb-2" style={{ color: msg.includes("✓") ? GREEN : RED }}>{msg}</div>}
      {/* ---- select all + what to do with the selection ---- */}
      <div className="flex items-center gap-2 flex-wrap mb-2 text-xs rounded px-3 py-1.5" style={{ background: picked.size ? "#FFF7E6" : "#FBFAF7", border: `1px solid ${picked.size ? "#F5B32B" : LINE}` }}>
        <button onClick={selectShown} className="font-semibold rounded border px-2 py-1 bg-white" style={{ borderColor: LINE, color: "var(--blue)" }}>Select all shown ({shown.length})</button>
        {total > shown.length && <button onClick={selectAllMatching} className="font-semibold rounded border px-2 py-1 bg-white" style={{ borderColor: LINE, color: "var(--blue)" }}>Select all {total.toLocaleString("en-IN")} matching</button>}
        <button onClick={() => setPicked(new Set())} className="font-semibold rounded border px-2 py-1 bg-white" style={{ borderColor: LINE, color: MUTED }}>Deselect</button>
        {picked.size > 0 && <b>{picked.size} chosen →</b>}
        {picked.size > 0 && kind === "person" && (
          <select onChange={(e) => { addToList(e.target.value); e.target.value = ""; }} style={{ ...inp, width: 220, padding: "4px 6px" }} defaultValue=""><option value="">add to list…</option>{lists.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.count})</option>)}</select>
        )}
        {picked.size > 0 && kind === "company" && <><button onClick={() => bulk({ is_lead: true }, "Marked as lead")} style={btn("#0F766E")}>mark as lead</button><button onClick={() => bulk({ is_lead: false }, "Lead mark taken off")} style={btn("#fff", "var(--dim)")}>not a lead</button></>}
        {picked.size > 0 && seesAll && <><input value={bulkTo} onChange={(e) => setBulkTo(e.target.value)} placeholder="assign to e-mail" style={{ ...inp, width: 190, padding: "4px 6px" }} /><button onClick={() => bulk({ assigned_to: bulkTo }, bulkTo ? `Assigned to ${bulkTo}` : "Unassigned")} style={btn(NAVY)}>assign</button></>}
      </div>
      {kind === "person" ? (
        <GenieTable<Person> rows={rows as Person[] | null} minWidth={980} maxHeight="calc(100vh - 300px)" empty="No people match — import from Apollo or add one."
          columns={[
            { key: "pick", label: "", render: (r) => <input type="checkbox" checked={picked.has(r.id)} onChange={() => toggle(r.id)} /> },
            { key: "name", label: "Name", sort: (r) => r.full_name || "", render: (r) => <button onClick={() => setOpen(r.id)} className="font-semibold text-left" style={{ color: "var(--blue)", textDecoration: "underline" }}>{r.full_name || r.primary_email || "—"}</button> },
            { key: "title", label: "Title", render: (r) => r.job_title || "·" },
            { key: "company", label: "Company", sort: (r) => r.company?.name || "", render: (r) => r.company?.name || "·" },
            { key: "email", label: "E-mail", render: (r) => r.primary_email || <span style={{ color: RED }}>none</span> },
            { key: "phone", label: "Phone", render: (r) => r.primary_phone || "·" },
            { key: "city", label: "City", render: (r) => [r.city, r.country].filter(Boolean).join(", ") || "·" },
            { key: "source", label: "Source", render: (r) => <span className="rounded px-1 text-xs font-bold" style={{ background: r.source === "apollo" ? "#EEF2FF" : "#E6F4EA", color: INK }}>{r.source}</span> },
            { key: "who", label: "Assigned", render: (r) => seesAll ? <input defaultValue={r.assigned_to || ""} onBlur={(e) => { if (e.target.value !== (r.assigned_to || "")) assign(r.id, e.target.value); }} placeholder="e-mail" style={{ ...inp, width: 160, padding: "2px 6px", fontSize: 12 }} /> : (r.assigned_to || "·") },
          ]} />
      ) : (
        <GenieTable<Company> rows={rows as Company[] | null} minWidth={980} maxHeight="calc(100vh - 300px)" empty="No companies match."
          columns={[
            { key: "pick", label: "", render: (r) => <input type="checkbox" checked={picked.has(r.id)} onChange={() => toggle(r.id)} /> },
            { key: "name", label: "Company", sort: (r) => r.name, render: (r) => <button onClick={() => setOpen(r.id)} className="font-semibold text-left" style={{ color: "var(--blue)", textDecoration: "underline" }}>{r.name}</button> },
            { key: "industry", label: "Industry", sort: (r) => r.industry?.name || "", render: (r) => r.industry?.name || "·" },
            { key: "domain", label: "Domain", render: (r) => r.domain_name || "·" },
            { key: "city", label: "Location", render: (r) => [r.city, r.state, r.country].filter(Boolean).join(", ") || "·" },
            { key: "lead", label: "Lead", render: (r) => <button onClick={() => markLead(r, !r.is_lead)} className="rounded px-2 text-xs font-bold" style={{ background: r.is_lead ? "#0F766E" : "#fff", color: r.is_lead ? "#fff" : MUTED, border: `1px solid ${r.is_lead ? "#0F766E" : "#E2E0DA"}`, whiteSpace: "nowrap" }}>{r.is_lead ? "✓ lead" : "mark as lead"}</button> },
            { key: "customer", label: "Customer", render: (r) => (r.is_customer ? "✓" : "·") },
            { key: "source", label: "Source", render: (r) => <span className="rounded px-1 text-xs font-bold" style={{ background: r.source === "apollo" ? "#EEF2FF" : "#E6F4EA", color: INK }}>{r.source}</span> },
            { key: "who", label: "Assigned", render: (r) => seesAll ? <input defaultValue={r.assigned_to || ""} onBlur={(e) => { if (e.target.value !== (r.assigned_to || "")) assign(r.id, e.target.value); }} placeholder="e-mail" style={{ ...inp, width: 160, padding: "2px 6px", fontSize: 12 }} /> : (r.assigned_to || "·") },
          ]} />
      )}
      {open && kind === "company" && <CompanyBox id={open} seesAll={seesAll} lists={lists} onClose={() => setOpen(null)} onChanged={load} />}
      {open && kind === "person" && <PersonBox id={open} seesAll={seesAll} lists={lists} onClose={() => setOpen(null)} onChanged={load} />}
      {adding && <AddLead kind={kind} onClose={() => { setAdding(false); load(); }} />}
    </div>
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

/* ───────────────────────────── Lists ───────────────────────────── */

function Lists() {
  const [lists, setLists] = useState<List[] | null>(null);
  const [open, setOpen] = useState<List | null>(null);
  const [name, setName] = useState(""); const [desc, setDesc] = useState("");
  const [msg, setMsg] = useState("");
  /**
   * UPLOAD INTO A LIST (Dr Raghu, 14 Sep 2026: "can we have lists and then
   * upload a csv or excel which will add it to the list and also to the
   * leads. It will add records and also map them, not overwrite it for
   * now"). Which list the file is going into, and the preview it must pass
   * through first — a bulk write into 139,000 people is not a one-click act.
   */
  const [upTo, setUpTo] = useState<List | null>(null);
  const load = useCallback(() => api<{ lists: List[] }>("/api/marketing/lists").then((j) => setLists(j.lists || [])).catch(() => setLists([])), []);
  useEffect(() => { load(); }, [load]);
  const create = async () => { if (!name.trim()) return; try { await api("/api/marketing/lists", { action: "create", name, description: desc }); setName(""); setDesc(""); load(); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } };
  const del = async (l: List) => { if (!window.confirm(`Delete the list "${l.name}"? The people stay; only the list goes.`)) return; await api("/api/marketing/lists", { action: "delete", list_id: l.id }); load(); };
  return (
    <div>
      <div className="flex items-end gap-2 flex-wrap mb-3">
        <label className="text-xs font-semibold" style={{ color: "var(--dim)" }}>New list<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Airport GSE heads — India" style={{ ...inp, width: 260 }} /></label>
        <label className="text-xs font-semibold" style={{ color: "var(--dim)" }}>What it is<input value={desc} onChange={(e) => setDesc(e.target.value)} style={{ ...inp, width: 300 }} /></label>
        <button onClick={create} style={btn(ACCENT)}>+ Create</button>
        {msg && <span className="text-xs" style={{ color: RED }}>{msg}</span>}
      </div>
      <div className="text-xs mb-2" style={{ color: MUTED }}>Add people from Leads: tick them and choose the list — or press <b>⬆ upload</b> on a list to bring in a CSV or Excel file. Lists feed campaigns.</div>
      <GenieTable<List> rows={lists} minWidth={640} empty="No lists yet — make one above, then tick people on Leads."
        columns={[
          { key: "name", label: "List", sort: (r) => r.name, render: (r) => <button onClick={() => setOpen(r)} className="font-semibold" style={{ color: "var(--blue)", textDecoration: "underline" }}>{r.name}</button> },
          { key: "desc", label: "What it is", render: (r) => r.description || "·" },
          { key: "count", label: "People", align: "right", sort: (r) => r.count, render: (r) => <span className="tnum">{r.count}</span> },
          { key: "by", label: "Made by", render: (r) => r.created_by_email.split("@")[0] },
          { key: "at", label: "On", render: (r) => fmtAt(r.created_at) },
          { key: "up", label: "", render: (r) => <button onClick={() => setUpTo(r)} className="text-xs font-semibold" style={{ color: "var(--blue)" }}>⬆ upload</button> },
          { key: "x", label: "", render: (r) => <button onClick={() => del(r)} className="text-xs" style={{ color: RED }}>delete</button> },
        ]} />
      {upTo && <ListUpload list={upTo} onClose={() => setUpTo(null)} onDone={() => { setUpTo(null); load(); }} />}
      {open && (
        <ListBox
          list={open}
          onClose={() => { setOpen(null); load(); }}
          onChanged={load}
        />
      )}
    </div>
  );
}

/* ───────────────────────────── Campaigns ───────────────────────────── */

const STEPS = ["Campaign", "Lists & people", "Check list", "Message", "Check message", "Unsubscribes", "Speed", "Send"];

/* ══════════════════════════════════════════════════════════════════════════
   EMAIL MARKETING — WHAT EVERY CAMPAIGN DID, AND WHAT THE FILTERED SET DID

   Dr Raghu, 15 Sep 2026: "Date - Campaign - Subject - Lists - Contacts -
   Sent - Delivered (%) - Opened (%) - Replied (%) - By - Bounced - U/s. At
   the end put View, Edit, Duplicate, Delete icons. Delete will work only if
   in draft. After send it can't." And the same figures as small cards on
   top, obeying the filters.

   TWO OF THOSE COLUMNS CANNOT SPEAK YET AND SAY SO.

     DELIVERED is real the moment the email.delivered event is added to the
     Resend webhook — Resend has always known it, Genie was not listening.
     Until something has actually been recorded the column reads "—", not 0%,
     because nought deliveries across every campaign means nobody is
     listening, not that nothing arrived.

     REPLIED is not measured at all. Nothing in Genie sees an answer; replies
     go to the Reply-To mailbox and matching them back to a campaign is
     inbound-mail work nobody has built. A nought there would say "nobody
     answered", which is a different and much worse claim than "we are not
     counting".

   Every percentage follows the rule set on 14 Sep: what went OUT is a share
   of the audience; what people DID with it is a share of what went out.
   ══════════════════════════════════════════════════════════════════════ */

const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 1000) / 10}%` : "—");

/** One small figure on the summary strip. */
function Card({ label, v, sub, ink }: { label: string; v: string | number; sub?: string; ink?: string }) {
  return (
    <div style={{ flex: "1 1 88px", minWidth: 84, padding: "2px 10px", borderLeft: "1px solid var(--line)" }}>
      <div style={{ fontSize: 10, color: MUTED, letterSpacing: .4, textTransform: "uppercase", whiteSpace: "nowrap" }}>{label}</div>
      <div className="tnum" style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.2, color: ink || INK }}>{v}</div>
      {sub !== undefined && <div className="tnum" style={{ fontSize: 11, color: MUTED }}>{sub}</div>}
    </div>
  );
}

type Totals = { campaigns: number; lists: number; contacts: number; sent: number; delivered: number; opened: number; bounced: number; unsubscribed: number; queued: number; failed: number };

function Campaigns({ seesAll }: { seesAll: boolean }) {
  const [rows, setRows] = useState<Campaign[] | null>(null);
  const [open, setOpen] = useState<Campaign | "new" | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [senders, setSenders] = useState<string[]>([]);
  const [measured, setMeasured] = useState<{ delivered: boolean; replied: boolean; bounced: boolean }>({ delivered: false, replied: false, bounced: false });
  const [why, setWhy] = useState<{ delivered?: string; replied?: string; bounced?: string }>({});
  const [statsReady, setStatsReady] = useState(true);
  const [statAt, setStatAt] = useState<string | null>(null);
  const [cacheReady, setCacheReady] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  /**
   * THE DATES OPEN ON THE FINANCIAL YEAR (Dr Raghu, 15 Sep 2026: "from and
   * to keep default of 1/4/2026 and today"). India's year begins on 1 April,
   * so that is the span anybody here means by "so far" — and it rolls on its
   * own rather than being a date typed once and left to go stale.
   */
  const fyStart = (() => { const n = new Date(); const y = n.getMonth() >= 3 ? n.getFullYear() : n.getFullYear() - 1; return `${y}-04-01`; })();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const [by, setBy] = useState(""); const [from, setFrom] = useState(fyStart); const [to, setTo] = useState(today);
  const [q, setQ] = useState(""); const [status, setStatus] = useState("");

  const load = useCallback(() => {
    const p = new URLSearchParams();
    if (by) p.set("by", by); if (from) p.set("from", from); if (to) p.set("to", to);
    if (q) p.set("q", q); if (status) p.set("status", status);
    return api<{ campaigns: Campaign[]; totals: Totals; senders: string[]; statsReady: boolean; cacheReady: boolean; statAt: string | null; measured: typeof measured; notMeasured: typeof why }>(`/api/marketing/campaigns?${p.toString()}`)
      .then((j) => { setRows(j.campaigns || []); setTotals(j.totals || null); setSenders(j.senders || []); setStatsReady(j.statsReady !== false); setCacheReady(j.cacheReady !== false); setStatAt(j.statAt ?? null); if (j.measured) setMeasured(j.measured); if (j.notMeasured) setWhy(j.notMeasured); setErr(""); })
      .catch((e) => { setErr(e instanceof Error ? e.message : String(e)); });
  }, [by, from, to, q, status]);
  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);

  const act = async (body: Record<string, unknown>, ok?: () => void) => {
    setBusy(true); setErr("");
    try { await api("/api/marketing/campaigns", body); await load(); ok?.(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };

  const colour = (s: string) => (s === "sending" ? "#0F766E" : s === "done" ? "var(--green)" : s === "paused" ? "var(--warn)" : s === "ready" ? "var(--blue)" : MUTED);
  const icon = (title: string, glyph: string, on: () => void, dead?: string) => (
    <button title={dead || title} disabled={!!dead || busy} onClick={on}
      style={{ fontSize: 14, padding: "1px 4px", cursor: dead ? "not-allowed" : "pointer", opacity: dead ? .3 : 1, background: "none", border: "none" }}>{glyph}</button>
  );
  const day = (c: Campaign) => (c.started_at || c.created_at || "").slice(0, 10).split("-").reverse().join("/");

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <div className="font-bold" style={{ fontSize: 16, color: INK }}>✉️ Email Marketing</div>
        <span className="ml-auto" />
        <button onClick={() => setOpen("new")} style={btn(ACCENT)}>+ New campaign</button>
      </div>

      {/* FILTERS — every one of them narrows the cards as well as the table. */}
      <div className="rounded border p-2 mb-2 flex flex-wrap items-end gap-2" style={{ borderColor: LINE, background: "#FBFAF7" }}>
        <label className="text-xs font-semibold" style={{ color: "var(--dim)" }}>Sent by
          <select value={by} onChange={(e) => setBy(e.target.value)} style={{ ...inp, width: 170 }}>
            <option value="">anybody</option>
            {senders.map((x) => <option key={x} value={x}>{x.split("@")[0]}</option>)}
          </select></label>
        <label className="text-xs font-semibold" style={{ color: "var(--dim)" }}>From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ ...inp, width: 150 }} /></label>
        <label className="text-xs font-semibold" style={{ color: "var(--dim)" }}>To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ ...inp, width: 150 }} /></label>
        <label className="text-xs font-semibold" style={{ color: "var(--dim)" }}>Status
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ ...inp, width: 120 }}>
            <option value="">any</option>
            {["draft", "ready", "sending", "paused", "done"].map((x) => <option key={x} value={x}>{x}</option>)}
          </select></label>
        <label className="text-xs font-semibold flex-1" style={{ color: "var(--dim)", minWidth: 180 }}>Search name or subject
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ganpati, Lisbon, expo…" style={inp} /></label>
        <button onClick={() => { setBy(""); setFrom(fyStart); setTo(today); setQ(""); setStatus(""); }} style={btn("#fff", "var(--dim)")}>reset</button>
        <button onClick={() => { setFrom(""); setTo(""); }} style={btn("#fff", "var(--dim)")} title="Ignore the dates and show every campaign ever">all time</button>
        <span className="text-xs" style={{ color: MUTED }}>the cards and the table both obey these · opens on the financial year to date</span>
      </div>

      {err && <div className="rounded border p-2 mb-2 text-xs font-semibold" style={{ borderColor: RED, color: RED, background: "#FDF3F2" }}>{err}</div>}
      {!statsReady && <div className="rounded border p-2 mb-2 text-xs" style={{ borderColor: "#E0C88A", background: "#FDF8EC", color: "#7A5B00" }}>
        <b>The counts are not available.</b> Run CRM migration <b>0069</b> — it adds the per-campaign tally the database does in one query. The campaigns themselves are all here.
      </div>}

      {/* THE CARDS — the filtered set, totalled. */}
      {totals && (
        <div className="rounded border p-2 mb-3" style={{ borderColor: LINE, background: "#FAFAF8" }}>
          <div className="flex flex-wrap" style={{ rowGap: 8 }}>
            <Card label="Campaigns" v={totals.campaigns} />
            <Card label="Lists" v={totals.lists} />
            <Card label="Contacts" v={totals.contacts} />
            <Card label="Sent" v={totals.sent} sub={pct(totals.sent, totals.contacts)} ink={GREEN} />
            <Card label="Delivered" v={measured.delivered ? totals.delivered : "—"} sub={measured.delivered ? pct(totals.delivered, totals.sent) : "not measured"} />
            <Card label="Opened" v={totals.opened} sub={pct(totals.opened, measured.delivered ? totals.delivered : totals.sent)} ink={totals.opened ? GREEN : undefined} />
            <Card label="Replied" v="—" sub="not measured" />
            <Card label="Bounced" v={measured.bounced ? totals.bounced : "—"} sub={measured.bounced ? pct(totals.bounced, totals.sent) : "not measured"} ink={measured.bounced && totals.bounced ? RED : undefined} />
            <Card label="U/s" v={totals.unsubscribed} sub={pct(totals.unsubscribed, totals.sent)} ink={totals.unsubscribed ? "var(--warn)" : undefined} />
          </div>
          <div className="text-xs mt-2" style={{ color: MUTED, lineHeight: 1.5 }}>
            Sent is a share of <b>contacts</b>; opened, bounced and unsubscribed are shares of what actually went out.
            {statAt && <> · <b>Figures as of {fmtAt(statAt)}</b> — refreshed every 30 minutes for the first two days, hourly for a week, then daily. A campaign&rsquo;s own page always counts live.</>}
            {!cacheReady && <> · <b>Counted live</b> — run CRM migration 0070 to have the cron keep them.</>}
            {!measured.delivered && <> · <b>Delivered</b>: {why.delivered}</>}
            {!measured.bounced && <> · <b>Bounced</b>: {why.bounced}</>}
            <> · <b>Replied</b>: {why.replied}</>
          </div>
        </div>
      )}

      <GenieTable<Campaign> rows={rows} minWidth={1180} empty="No campaign matches. New campaign walks you through: lists, the list check, the message, the message check, unsubscribes, speed, send."
        columns={[
          { key: "at", label: "Date", sort: (r) => r.started_at || r.created_at, render: (r) => <span className="tnum">{day(r)}</span> },
          { key: "name", label: "Campaign", sort: (r) => r.name, render: (r) => (
            <span><button onClick={() => setOpen(r)} className="font-semibold" style={{ color: "var(--blue)", textDecoration: "underline" }}>{r.name}</button>
              <span className="rounded px-1.5 text-xs font-bold ml-1" style={{ background: colour(r.status), color: "#fff" }}>{r.status}</span></span>) },
          { key: "subject", label: "Subject", render: (r) => <span title={r.subject || ""}>{(r.subject || "·").slice(0, 46)}{(r.subject || "").length > 46 ? "…" : ""}</span> },
          { key: "lists", label: "Lists", align: "right", render: (r) => <span className="tnum">{r.list_ids.length}{r.person_ids.length ? ` +${r.person_ids.length}` : ""}</span> },
          { key: "contacts", label: "Contacts", align: "right", render: (r) => <span className="tnum">{r.stat ? r.stat.contacts : "·"}</span> },
          { key: "sent", label: "Sent", align: "right", render: (r) => r.stat ? <span className="tnum" style={{ color: GREEN, fontWeight: 600 }}>{r.stat.sent}<span style={{ color: MUTED, fontWeight: 400 }}> {pct(r.stat.sent, r.stat.contacts)}</span></span> : "·" },
          { key: "deliv", label: "Delivered", align: "right", render: (r) => !r.stat ? "·" : !measured.delivered ? <span title={why.delivered} style={{ color: MUTED }}>—</span>
            : <span className="tnum">{r.stat.delivered}<span style={{ color: MUTED }}> {pct(r.stat.delivered, r.stat.sent)}</span></span> },
          { key: "open", label: "Opened", align: "right", render: (r) => r.stat ? <span className="tnum" style={{ color: r.stat.opened ? GREEN : undefined }}>{r.stat.opened}<span style={{ color: MUTED }}> {pct(r.stat.opened, measured.delivered ? r.stat.delivered : r.stat.sent)}</span></span> : "·" },
          { key: "rep", label: "Replied", align: "right", render: () => <span title={why.replied} style={{ color: MUTED }}>—</span> },
          { key: "by", label: "By", render: (r) => r.created_by_email.split("@")[0] },
          { key: "bounce", label: "Bounced", align: "right", render: (r) => !r.stat ? "·" : !measured.bounced ? <span title={why.bounced} style={{ color: MUTED }}>—</span>
            : <span className="tnum" style={{ color: r.stat.bounced ? RED : undefined }}>{r.stat.bounced}<span style={{ color: MUTED }}> {pct(r.stat.bounced, r.stat.sent)}</span></span> },
          { key: "uns", label: "U/s", align: "right", render: (r) => r.stat ? <span className="tnum" style={{ color: r.stat.unsubscribed ? "var(--warn)" : undefined }}>{r.stat.unsubscribed}<span style={{ color: MUTED }}> {pct(r.stat.unsubscribed, r.stat.sent)}</span></span> : "·" },
          { key: "x", label: "", render: (r) => (
            <span className="flex" style={{ gap: 1 }}>
              {icon("View", "👁", () => setOpen(r))}
              {icon("Edit", "✏️", () => setOpen(r), r.status === "sending" ? "Pause it before changing anything" : undefined)}
              {icon("Duplicate — a fresh draft with the same message and audience", "⧉", () => act({ action: "duplicate", id: r.id }))}
              {icon("Delete", "🗑", () => { if (window.confirm(`Delete the draft “${r.name}”?`)) act({ action: "delete", id: r.id }); },
                r.status !== "draft" ? `Only a draft can be deleted — this one is ${r.status}. What went out is a record of what people were sent.` : undefined)}
            </span>) },
        ]} />
      {open && <CampaignWizard c={open === "new" ? null : open} seesAll={seesAll} onClose={() => { setOpen(null); load(); }} />}
    </div>
  );
}

function CampaignWizard({ c, seesAll, onClose }: { c: Campaign | null; seesAll: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [id, setId] = useState<string | null>(c?.id ?? null);
  const [f, setF] = useState({ name: c?.name || "", subject: c?.subject || "", body_html: c?.body_html || "", list_ids: c?.list_ids || [], person_ids: c?.person_ids || [], channel_ids: c?.channel_ids || [], speed_per_hour: c?.speed_per_hour || 50, show_unsub_link: c?.show_unsub_link !== false });
  const [lists, setLists] = useState<List[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [variables, setVariables] = useState<{ key: string; description: string }[]>([]);
  const [checklist, setChecklist] = useState<Record<string, number | string> | null>(c?.checklist ?? null);
  const [deliv, setDeliv] = useState<{ score: number; issues: string[] } | null>(c?.deliverability ?? null);
  const [unsubs, setUnsubs] = useState<number | null>(null);
  const [status, setStatus] = useState(c?.status || "draft");
  const [detail, setDetail] = useState<{ counts: Record<string, number>; total: number; recent: { email: string; status: string; sent_at: string | null; open_count: number; error: string | null }[]; result?: Result; cron?: Cron } | null>(null);
  const [magic, setMagic] = useState<{ subject: string; body_html: string; why: string[]; before: { score: number }; after: { score: number } } | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [pplQ, setPplQ] = useState(""); const [pplHits, setPplHits] = useState<Person[]>([]);
  const [editorKey, setEditorKey] = useState(0); // remounts the editor when a template or Genie replaces the body

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
            <span style={{ color: MUTED }}>Start from a template:</span>
            <select onChange={(e) => { const t = templates.find((x) => x.id === e.target.value); if (t) { setF({ ...f, subject: t.subject || "", body_html: t.body_html || "" }); setEditorKey((k) => k + 1); } }} defaultValue="" style={{ ...inp, width: 260 }}><option value="">— pick one —</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          </div>
          <div key={editorKey}>
            <MessageEditor subject={f.subject} body={f.body_html} onSubject={(v) => setF((x) => ({ ...x, subject: v }))} onBody={(h) => setF((x) => ({ ...x, body_html: h }))} variables={variables} disabled={sending} minHeight={280} />
          </div>
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
              <div className="flex gap-2 mt-2"><button onClick={() => { setF({ ...f, subject: magic.subject, body_html: magic.body_html }); setMagic(null); setEditorKey((k) => k + 1); }} style={btn("#6D28D9")}>Use this</button><button onClick={() => setMagic(null)} style={btn("#fff", "var(--dim)")}>Keep mine</button></div>
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
          <div><b>Every mail carries the one-click header</b> — the mail client draws its own Unsubscribe button beside your name, and that always unsubscribes outright. Google has required it of anybody sending over 5,000 a day to Gmail since 2024, and it cannot be turned off here.</div>
          <div>Bounces and complaints reported by Resend land on the list on their own. Gmail bounces come back to the mailbox — add those under Unsubscribes.</div>

          {/* THE VISIBLE LINK is a separate obligation from the header, and a
              separate decision. It opens a choice — three months' quiet, or
              stop for good — because somebody handed an easy way out does not
              press "report spam" instead, and a complaint costs far more than
              an opt-out. */}
          <label className="flex items-start gap-2 mt-3 rounded border p-2" style={{ borderColor: f.show_unsub_link ? "var(--line)" : "#E0C88A", background: f.show_unsub_link ? "#FBFAF7" : "#FDF8EC", cursor: sending ? "default" : "pointer" }}>
            <input type="checkbox" checked={f.show_unsub_link} disabled={sending} onChange={(e) => setF({ ...f, show_unsub_link: e.target.checked })} style={{ marginTop: 3 }} />
            <span>
              <b>Show the unsubscribe link at the bottom of this mail</b>
              <div className="text-xs" style={{ color: MUTED, lineHeight: 1.6 }}>
                It opens a choice rather than a trapdoor — <i>pause for three months</i> or <i>stop all marketing e-mail</i>.
                {!f.show_unsub_link && <span style={{ color: "#8A5B00" }}><br /><b>Turned off.</b> The one-click header still goes, but a visible opt-out inside the message is what CAN-SPAM asks for. Leave it on unless you have a reason.</span>}
              </div>
            </span>
          </label>
          <div className="text-xs mt-2" style={{ color: MUTED }}>The list itself is under Unsubscribes on the rail.</div>
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
          {/* THE RESULT — the eight figures he asked for, read across in one
              line, and the two we do not measure saying so rather than nought. */}
          {detail?.cron && sending && <CronPanel c={detail.cron} onRefresh={loadDetail} />}
          {detail?.result && detail.total > 0 && <ResultPanel r={detail.result} />}
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


/* ───────────────────────────── the message editor ─────────────────────────────
   Rich text for the body, the subject above it, and the variables down the
   side to click straight into wherever the caret is (Dr Raghu, 6 Sep 2026:
   "template to be rich text; should show variables in the side to copy
   paste"). */
function MessageEditor({ subject, body, onSubject, onBody, variables, disabled, minHeight = 320 }: {
  subject: string; body: string; onSubject: (s: string) => void; onBody: (h: string) => void;
  variables: { key: string; description: string }[]; disabled?: boolean; minHeight?: number;
}) {
  const boxRef = React.useRef<HTMLDivElement | null>(null);
  const subjRef = React.useRef<HTMLInputElement | null>(null);
  const last = React.useRef<"subject" | "body">("body");
  const insert = (key: string) => {
    const token = `{{${key}}}`;
    if (last.current === "subject" && subjRef.current) {
      const el = subjRef.current; const a = el.selectionStart ?? el.value.length, b = el.selectionEnd ?? a;
      const next = el.value.slice(0, a) + token + el.value.slice(b); onSubject(next);
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + token.length, a + token.length); });
      return;
    }
    const ed = boxRef.current?.querySelector('[contenteditable="true"]') as HTMLElement | null;
    if (!ed) return;
    if (document.activeElement !== ed) { ed.focus(); const r = document.createRange(); r.selectNodeContents(ed); r.collapse(false); const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(r); }
    document.execCommand("insertText", false, token);
  };
  const copy = (key: string) => { try { navigator.clipboard.writeText(`{{${key}}}`); } catch (e) { swallow("marketing/copy", e); } };
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: "minmax(0, 1fr) 230px" }}>
      <div className="min-w-0">
        <label className="text-xs font-semibold" style={{ color: "var(--dim)" }}>Subject
          <input ref={subjRef} value={subject} disabled={disabled} onFocus={() => { last.current = "subject"; }} onChange={(e) => onSubject(e.target.value)} style={{ ...inp, fontSize: 14 }} />
        </label>
        <div className="text-xs font-semibold mt-2 mb-1" style={{ color: "var(--dim)" }}>Body</div>
        <div ref={boxRef} onFocusCapture={() => { last.current = "body"; }} style={{ opacity: disabled ? 0.6 : 1, pointerEvents: disabled ? "none" : "auto" }}>
          <RichTextEditor initial={body} live onChangeHtml={onBody} onUploadImage={uploadPublic} minHeight={minHeight} placeholder="Write the mail. Click a variable on the right to drop it where the cursor is; a picture you paste is hosted by Genie." />
        </div>
      </div>
      <div className="rounded border p-2" style={{ borderColor: LINE, background: "#FBFAF7", alignSelf: "start", position: "sticky", top: 60 }}>
        <div className="text-xs font-bold mb-1" style={{ color: MUTED }}>VARIABLES — click to insert, ⧉ to copy</div>
        <div style={{ maxHeight: minHeight + 60, overflowY: "auto" }}>
          {variables.map((v) => (
            <div key={v.key} className="flex items-center gap-1 py-0.5">
              <button onMouseDown={(e) => e.preventDefault()} onClick={() => insert(v.key)} className="flex-1 text-left rounded px-1.5 py-0.5 font-mono text-xs" style={{ background: "#fff", border: `1px solid ${LINE}`, color: INK }} title={v.description}>{`{{${v.key}}}`}</button>
              <button onClick={() => copy(v.key)} className="text-xs" style={{ color: MUTED }} title="copy">⧉</button>
            </div>
          ))}
        </div>
        <div className="text-xs mt-2" style={{ color: MUTED, lineHeight: 1.5 }}>Filled per person at send: name, title, company, city from the record; the rest from the CRM's variables.</div>
      </div>
    </div>
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
        <Modal title={open === "new" ? "New template" : open.name} onClose={() => setOpen(null)} width={1100}>
          <label className="text-xs font-semibold block mb-2" style={{ color: "var(--dim)", maxWidth: 480 }}>Template name<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Intro — GSE for airports" style={inp} /></label>
          <MessageEditor subject={f.subject} body={f.body_html} onSubject={(v) => setF((x) => ({ ...x, subject: v }))} onBody={(h) => setF((x) => ({ ...x, body_html: h }))} variables={vars} />
          {msg && <div className="text-xs mt-2" style={{ color: RED }}>{msg}</div>}
          <button onClick={save} className="mt-3" style={btn(ACCENT)}>Save template</button>
        </Modal>
      )}
    </div>
  );
}

/* ───────────────────────────── Channels ───────────────────────────── */

function Channels({ seesAll }: { seesAll: boolean }) {
  const [rows, setRows] = useState<Channel[] | null>(null);
  const [f, setF] = useState<{ id?: string; email: string; label: string; kind: "gmail" | "resend" | "mailercloud"; reply_to: string; api_key: string; daily_limit: number; hourly_limit: number; active: boolean }>({ email: "", label: "", kind: "gmail", reply_to: "", api_key: "", daily_limit: 200, hourly_limit: 50, active: true });
  const [msg, setMsg] = useState("");
  const [replyToReady, setReplyToReady] = useState(true);
  /* A failed load must NOT render as "no channel yet" — that is how a pending
     migration came to look like deleted data. An error stays an error. */
  const [loadErr, setLoadErr] = useState("");
  const load = useCallback(() => api<{ channels: Channel[]; replyToReady?: boolean }>("/api/marketing/channels")
    .then((j) => { setRows(j.channels || []); setReplyToReady(j.replyToReady !== false); setLoadErr(""); })
    .catch((e) => { setLoadErr(e instanceof Error ? e.message : String(e)); }), []);
  useEffect(() => { load(); }, [load]);
  const save = async () => { try { await api("/api/marketing/channels", { action: "save", ...f }); setF({ email: "", label: "", kind: "gmail", reply_to: "", api_key: "", daily_limit: 200, hourly_limit: 50, active: true }); setMsg("saved ✓"); load(); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } };
  return (
    <div>
      <div className="font-bold mb-1" style={{ fontSize: 16, color: INK }}>📡 Sending Channels</div>
      <div className="text-xs mb-3" style={{ color: MUTED, lineHeight: 1.6 }}>Each address is a channel with its own limits and its own API: <b>Gmail</b> sends through the mailbox connected under CRM → Integrations for that address; <b>Resend</b> sends through Resend's API with the key on the channel (or the deploy's); <b>Mailercloud</b> sends through its Email API with the key on the channel — the sender address must be verified there. A campaign ticks the addresses it goes from.</div>
      {loadErr && <div className="rounded border p-2 mb-3 text-xs font-semibold" style={{ borderColor: RED, color: RED, background: "#FDF3F2" }}>
        The channels could not be read — <b>they have not been deleted</b>. {loadErr}
      </div>}
      {!replyToReady && <div className="rounded border p-2 mb-3 text-xs" style={{ borderColor: "#E0C88A", background: "#FDF8EC", color: "#7A5B00", lineHeight: 1.6 }}>
        <b>Replies still go to the sending address.</b> Run CRM migration <b>0067</b> to give each channel its own “Replies go to”. Everything else works as normal.
      </div>}
      {seesAll && (
        <div className="rounded border p-3 mb-3 grid gap-2" style={{ borderColor: LINE, background: "#FBFAF7", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
          <label className="text-xs font-semibold" style={{ color: "var(--dim)" }}>E-mail<input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} style={inp} /></label>
          <label className="text-xs font-semibold" style={{ color: "var(--dim)" }}>Sender name<input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="e.g. Raghu at Nandan" style={inp} /></label>
          {/* WHERE AN ANSWER GOES. The sending domain is not always a
              mailbox anybody reads — Resend sends from nandangse.com, whose
              MX is Zoho, while the inbox that is actually watched is on
              Google. Blank means sales@, never "back to the sender". */}
          {replyToReady && <label className="text-xs font-semibold" style={{ color: "var(--dim)" }}>Replies go to<input value={f.reply_to} onChange={(e) => setF({ ...f, reply_to: e.target.value })} placeholder="sales@nandan.co.in" style={inp} /></label>}
          <label className="text-xs font-semibold" style={{ color: "var(--dim)" }}>Sending API<select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as "gmail" | "resend" | "mailercloud" })} style={inp}><option value="gmail">Gmail (connected mailbox)</option><option value="resend">Resend</option><option value="mailercloud">Mailercloud</option></select></label>
          {f.kind !== "gmail" && <label className="text-xs font-semibold" style={{ color: "var(--dim)" }}>{f.kind === "resend" ? "Resend API key" : "Mailercloud API key"}<input value={f.api_key} onChange={(e) => setF({ ...f, api_key: e.target.value })} placeholder={f.kind === "resend" ? "blank = deploy's key" : "from Mailercloud → Settings → API"} style={inp} /></label>}
          <label className="text-xs font-semibold" style={{ color: "var(--dim)" }}>Per hour<input type="number" value={f.hourly_limit} onChange={(e) => setF({ ...f, hourly_limit: Number(e.target.value) })} style={inp} /></label>
          <label className="text-xs font-semibold" style={{ color: "var(--dim)" }}>Per day<input type="number" value={f.daily_limit} onChange={(e) => setF({ ...f, daily_limit: Number(e.target.value) })} style={inp} /></label>
          <div className="flex items-end gap-2"><button onClick={save} style={btn(ACCENT)}>{f.id ? "Update" : "+ Add channel"}</button>{f.id && <button onClick={() => setF({ email: "", label: "", kind: "gmail", reply_to: "", api_key: "", daily_limit: 200, hourly_limit: 50, active: true })} style={btn("#fff", "var(--dim)")}>cancel</button>}</div>
          {msg && <div className="text-xs" style={{ color: msg.includes("✓") ? GREEN : RED, gridColumn: "1 / -1" }}>{msg}</div>}
        </div>
      )}
      <GenieTable<Channel> rows={rows} minWidth={760} empty="No channel yet."
        columns={[
          { key: "email", label: "From", render: (r) => <span><b>{r.email}</b>{r.label ? <span className="text-xs" style={{ color: MUTED }}> · {r.label}</span> : null}{replyToReady && <span className="text-xs block" style={{ color: MUTED }}>replies → {r.reply_to || "sales@nandan.co.in"}</span>}</span> },
          { key: "kind", label: "API", render: (r) => r.kind === "gmail" ? `Gmail · ${r.gmail || "not connected"}` : r.kind === "mailercloud" ? `Mailercloud · ${r.api_key ? "key set" : "NO KEY"}` : `Resend · ${r.api_key ? "own key" : r.resendKeyOnDeploy ? "deploy key" : "NO KEY"}` },
          { key: "h", label: "/hour", align: "right", render: (r) => <span className="tnum">{r.sent_this_hour} / {r.hourly_limit}</span> },
          { key: "d", label: "/day", align: "right", render: (r) => <span className="tnum">{r.sent_today} / {r.daily_limit}</span> },
          { key: "active", label: "Active", render: (r) => (r.active ? "✓" : "off") },
          { key: "x", label: "", render: (r) => seesAll ? <span className="flex gap-2"><button onClick={() => setF({ id: r.id, email: r.email, label: r.label || "", kind: r.kind, reply_to: r.reply_to || "", api_key: "", daily_limit: r.daily_limit, hourly_limit: r.hourly_limit, active: r.active })} className="text-xs" style={{ color: "var(--blue)" }}>edit</button><button onClick={async () => { if (window.confirm(`Remove ${r.email}?`)) { await api("/api/marketing/channels", { action: "delete", id: r.id }); load(); } }} className="text-xs" style={{ color: RED }}>remove</button></span> : null },
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

/* ══════════════════════════════════════════════════════════════════════════
   UPLOAD A CSV OR EXCEL INTO A LIST

   Dr Raghu, 14 Sep 2026: "upload a csv or excel which will add it to the
   list and also to the leads. It will add records and also map them, not
   overwrite it for now."

   TWO PRESSES, NOT ONE. The first reads the file and reports what WOULD
   happen — how many are already here, how many are new, which columns it
   recognised and which it did not. Only the second writes. A bulk import
   into a hundred and thirty-nine thousand people is not a thing to set off
   with a single click on a file somebody has not looked at.

   NOTHING IS OVERWRITTEN, and the preview says so where it can be read.
   The file fills blanks on people already here; it never replaces a value
   somebody in this office typed.
   ══════════════════════════════════════════════════════════════════════ */
type Preview = {
  file: string; rows: number; headers: string[]; mapping: Record<string, string>; unmapped: string[];
  matched: number; willInsert: number; willFill: number;
  blankEmail: number; sharedAddresses: number; emptyRows: number;
  sample?: Record<string, unknown>[]; listed?: number; committed?: boolean; notesCarried?: boolean; note?: string;
  /* Where a sliced commit reached, and whether the file is finished. */
  from?: number; to?: number; total?: number; done?: boolean; fileRows?: number;
};

function ListUpload({ list, onClose, onDone, inline }: { list: List; onClose: () => void; onDone: () => void; inline?: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [prev, setPrev] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [prog, setProg] = useState<{ done: number; total: number } | null>(null);

  /**
   * A BIG FILE IS COMMITTED IN SLICES (Dr Raghu, 14 Sep 2026: "problem!").
   *
   * A 10,505-row import died on commit with "Unexpected token 'A'" — the
   * reply was not JSON at all, it was Vercel's own timeout page, because one
   * serverless invocation had been asked to carry the whole file. So the
   * browser walks it now: each request does a bounded slice and says where
   * to carry on from, and the bar shows how far it has got.
   *
   * REPEATING A SLICE IS SAFE. A person the previous slice created is found
   * on the next run, not inserted again — matching is by e-mail and the rule
   * is still fill-blanks-only. So a slice that fails can simply be retried.
   */
  const send = async (action: "preview" | "commit") => {
    if (!file) return;
    setBusy(true); setErr(""); setProg(null);
    try {
      const post = async (from: number) => {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("list_id", list.id);
        fd.append("action", action);
        if (action === "commit") { fd.append("from", String(from)); fd.append("size", "1500"); }
        const r = await fetch("/api/marketing/import", { method: "POST", body: fd });
        const text = await r.text();
        let j: Record<string, unknown>;
        try { j = JSON.parse(text); }
        catch {
          /* Not JSON means the reply did not come from Genie — a gateway
             timeout page, almost always. Say that, rather than showing the
             reader a parser error about the letter A. */
          throw new Error(r.status === 413
            ? "That file is too large to upload in one piece."
            : `The server did not answer properly (HTTP ${r.status}). The slice was too big or took too long — nothing before this point was lost.`);
        }
        if (!r.ok) throw new Error(String(j.error || r.status));
        return j as unknown as Preview;
      };

      if (action === "preview") { setPrev(await post(0)); setBusy(false); return; }

      /* Commit: walk the file, accumulating the totals as we go. */
      let at = 0, guard = 0;
      const tally = { willInsert: 0, matched: 0, willFill: 0, listed: 0, blankEmail: 0, sharedAddresses: 0, emptyRows: 0 };
      let last: Preview | null = null;
      for (;;) {
        const j = await post(at);
        last = j;
        tally.willInsert += j.willInsert || 0; tally.matched += j.matched || 0;
        tally.willFill += j.willFill || 0; tally.listed += j.listed || 0;
        tally.blankEmail += j.blankEmail || 0; tally.sharedAddresses += j.sharedAddresses || 0;
        tally.emptyRows += j.emptyRows || 0;
        const to = Number(j.to ?? 0), total = Number(j.total ?? 0);
        setProg({ done: to, total });
        setPrev({ ...j, ...tally, rows: to });
        if (j.done || !to || to <= at || ++guard > 200) break;
        at = to;
      }
      setPrev({ ...(last as Preview), ...tally, rows: Number(last?.total ?? tally.willInsert) });
      setTimeout(onDone, 1800);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };

  const inner = (
        <div className={inline ? "" : "p-4"}>
          <div className="text-xs mb-3" style={{ color: MUTED, lineHeight: 1.6 }}>
            A CSV or Excel file. Every row becomes a person in <b>Leads</b> and a member of <b>{list.name}</b>.
            Columns are matched by their headings — name, e-mail, phone, job title, company and the rest —
            and <b>anything not recognised is kept as a note on the person</b> rather than thrown away.
            {" "}<b>Nothing is overwritten:</b> where somebody is already here, the file may fill a blank field and nothing more.
          </div>

          <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => { setFile(e.target.files?.[0] || null); setPrev(null); }}
            className="text-sm mb-3" />

          {err && <div className="text-xs font-semibold mb-2" style={{ color: RED }}>{err}</div>}

          {prev && (
            <div className="rounded border p-3 mb-3" style={{ borderColor: prev.committed ? GREEN : "var(--line)", background: prev.committed ? "#F0FAF3" : "#FAFAF8" }}>
              <div className="text-xs font-bold mb-1" style={{ color: prev.committed ? GREEN : "var(--dim)", letterSpacing: .6 }}>
                {prev.committed ? "DONE" : "WHAT THIS WOULD DO"} · {prev.file} · {prev.rows} rows
              </div>
              <div className="flex gap-4 flex-wrap text-sm mb-2">
                <span><b className="tnum" style={{ fontSize: 17 }}>{prev.willInsert}</b> <span style={{ color: MUTED }}>new people</span></span>
                <span><b className="tnum" style={{ fontSize: 17 }}>{prev.matched}</b> <span style={{ color: MUTED }}>already here</span></span>
                <span><b className="tnum" style={{ fontSize: 17 }}>{prev.willFill}</b> <span style={{ color: MUTED }}>gain a blank field</span></span>
                {prev.committed && <span><b className="tnum" style={{ fontSize: 17, color: GREEN }}>{prev.listed}</b> <span style={{ color: MUTED }}>in the list</span></span>}
              </div>
              <div className="text-xs" style={{ color: MUTED, lineHeight: 1.6 }}>
                <b>Recognised:</b> {Object.entries(prev.mapping).map(([h, k]) => `${h} → ${k}`).join(" · ") || "nothing"}<br />
                {prev.unmapped.length > 0 && <><b>Kept as a note:</b> {prev.unmapped.join(" · ")}<br /></>}
                {prev.blankEmail > 0 && <><b>{prev.blankEmail}</b> rows carry no e-mail — added anyway, they can still be telephoned.<br /></>}
                {prev.sharedAddresses > 0 && <><b>{prev.sharedAddresses}</b> rows share an e-mail with another row in this file — kept as separate people, not merged, because one address used twice identifies nobody.<br /></>}
                {prev.emptyRows > 0 && <><b>{prev.emptyRows}</b> rows had no name and no e-mail and were skipped.<br /></>}
                {prev.note && <span style={{ color: prev.notesCarried === false ? "#8A5B00" : MUTED }}>{prev.note}</span>}
              </div>
            </div>
          )}

          {prog && prog.total > 0 && (
            <div className="mb-3">
              <div className="text-xs mb-1" style={{ color: MUTED }}>
                <b className="tnum">{prog.done}</b> of <b className="tnum">{prog.total}</b> rows written
                {prog.done < prog.total && " — leave this open until it finishes"}
              </div>
              <div style={{ height: 6, background: "var(--line-soft)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.round((prog.done / prog.total) * 100)}%`, background: GREEN, transition: "width .3s" }} />
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button onClick={() => send("preview")} disabled={!file || busy} style={btn(prev ? "var(--line-soft)" : ACCENT)}>
              {busy ? "Reading…" : prev ? "Read it again" : "Read the file"}
            </button>
            {prev && !prev.committed && (
              <button onClick={() => send("commit")} disabled={busy} style={btn(GREEN)}>
                {busy ? "Importing…" : `Import ${prev.willInsert + prev.matched} into ${list.name}`}
              </button>
            )}
            <button onClick={onClose} style={btn("var(--line-soft)")}>Close</button>
          </div>
        </div>
  );
  /* Inside the list lightbox it is a panel; on its own it is a lightbox. */
  if (inline) return <div className="rounded border p-3 mb-3" style={{ borderColor: "var(--line)", background: "#FAFAF8" }}>{inner}</div>;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(22,35,47,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="rounded-lg bg-white"
        style={{ width: "min(760px, 100%)", maxHeight: "calc(100vh - 40px)", overflowY: "auto", boxShadow: "0 12px 40px rgba(27,45,107,.35)" }}>
        <div className="flex items-center justify-between px-4 py-2.5" style={{ background: "var(--navy)", borderRadius: "8px 8px 0 0" }}>
          <b className="text-white text-sm">⬆ Upload into “{list.name}”</b>
          <button onClick={onClose} className="text-white font-bold px-2">✕</button>
        </div>
        {inner}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   ONE LIST, OPENED

   Dr Raghu, 14 Sep 2026: "after clicking and opening on lightbox — have a
   search; remove from list should be an option; import csv/excel; add
   contact. It's understood it will add to lead and to this list too. A
   contact can be part of multiple lists."

   The last sentence is the one that shapes the code. A list is a MEMBERSHIP,
   not a home: the same person can sit on the aviation list, the employees
   list and three campaign lists at once, and removing them from one must
   never touch the person or their place on the others. So REMOVE deletes a
   membership row and says so on the button — "remove from list", never
   "delete" — because a person deleted by somebody who meant to tidy a list
   is not recoverable from a screen.

   ADD and IMPORT both do the same two things, which is what he means by "it
   is understood": the person is created in Leads if they are not there, and
   joined to this list either way. Neither is a separate act to remember.
   ══════════════════════════════════════════════════════════════════════ */
type Member = { person_id: string; added_at: string; person: Person | null };

function ListBox({ list, onClose, onChanged }: { list: List; onClose: () => void; onChanged: () => void }) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [upload, setUpload] = useState(false);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ first_name: "", last_name: "", primary_email: "", primary_phone: "", job_title: "", company_name: "", country: "" });

  const load = useCallback(() => {
    api<{ members: Member[] }>(`/api/marketing/lists?id=${list.id}`)
      .then((j) => setMembers(j.members || [])).catch(() => setMembers([]));
  }, [list.id]);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!k || !members) return members;
    return members.filter((m) => [m.person?.full_name, m.person?.primary_email, m.person?.job_title, m.person?.company?.name, m.person?.primary_phone]
      .some((v) => String(v || "").toLowerCase().includes(k)));
  }, [members, q]);

  /** Removes the MEMBERSHIP. The person stays, and so do their other lists. */
  const remove = async (pid: string, who: string) => {
    if (!window.confirm(`Take ${who} off "${list.name}"?\n\nThe person stays in Leads, and stays on any other list they are on. Only this membership goes.`)) return;
    setBusy(pid);
    try {
      await api("/api/marketing/lists", { action: "remove", list_id: list.id, person_ids: [pid] });
      setMembers((m) => (m || []).filter((x) => x.person_id !== pid));
      onChanged();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    setBusy("");
  };

  const addOne = async () => {
    if (!f.first_name.trim() && !f.primary_email.trim()) { setMsg("A name or an e-mail, at least."); return; }
    setBusy("add"); setMsg("");
    try {
      const j = await api<{ id: string }>("/api/marketing/leads", { action: "create", kind: "person", ...f });
      await api("/api/marketing/lists", { action: "add", list_id: list.id, person_ids: [j.id] });
      setF({ first_name: "", last_name: "", primary_email: "", primary_phone: "", job_title: "", company_name: "", country: "" });
      setAdding(false); setMsg("Added to Leads and to this list ✓");
      load(); onChanged();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    setBusy("");
  };

  const n = members?.length ?? 0;
  return (
    <Modal title={`${list.name} · ${n} ${n === 1 ? "person" : "people"}`} onClose={onClose} width={920}>
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 search this list — name, e-mail, title, company, phone"
          style={{ ...inp, width: 330 }} />
        {q && <button onClick={() => setQ("")} className="text-xs font-bold" style={{ color: ACCENT }}>clear ✕</button>}
        <div className="flex-1" />
        <button onClick={() => { setAdding((v) => !v); setUpload(false); }} style={btn(adding ? "var(--line-soft)" : ACCENT)}>+ Add contact</button>
        <button onClick={() => { setUpload((v) => !v); setAdding(false); }} style={btn(upload ? "var(--line-soft)" : "var(--navy)")}>⬆ Import CSV / Excel</button>
      </div>
      <div className="text-xs mb-2" style={{ color: MUTED, lineHeight: 1.5 }}>
        Adding or importing puts the person in <b>Leads</b> and on <b>this list</b> — both, always.
        A person can sit on as many lists as you like; <b>remove</b> takes them off this one only and leaves the person alone.
      </div>

      {adding && (
        <div className="rounded border p-3 mb-3" style={{ borderColor: "var(--line)", background: "#FAFAF8" }}>
          <div className="flex gap-2 flex-wrap">
            <input value={f.first_name} onChange={(e) => setF({ ...f, first_name: e.target.value })} placeholder="first name" style={{ ...inp, width: 150 }} />
            <input value={f.last_name} onChange={(e) => setF({ ...f, last_name: e.target.value })} placeholder="last name" style={{ ...inp, width: 150 }} />
            <input value={f.primary_email} onChange={(e) => setF({ ...f, primary_email: e.target.value })} placeholder="e-mail" style={{ ...inp, width: 210 }} />
            <input value={f.primary_phone} onChange={(e) => setF({ ...f, primary_phone: e.target.value })} placeholder="phone" style={{ ...inp, width: 140 }} />
            <input value={f.job_title} onChange={(e) => setF({ ...f, job_title: e.target.value })} placeholder="job title" style={{ ...inp, width: 180 }} />
            <input value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })} placeholder="country" style={{ ...inp, width: 130 }} />
            <button onClick={addOne} disabled={busy === "add"} style={btn(GREEN)}>{busy === "add" ? "Adding…" : "Add"}</button>
          </div>
        </div>
      )}

      {upload && <ListUpload list={list} inline onClose={() => setUpload(false)} onDone={() => { setUpload(false); load(); onChanged(); }} />}

      {msg && <div className="text-xs font-semibold mb-2" style={{ color: msg.includes("✓") ? GREEN : RED }}>{msg}</div>}
      {q && members && <div className="text-xs mb-1" style={{ color: MUTED }}>{shown?.length ?? 0} of {members.length} match “{q}”.</div>}

      <GenieTable<Member> rows={shown} minWidth={640} maxHeight="52vh"
        empty={q ? "Nobody on this list matches that." : "Nobody on this list yet — add a contact or import a file."}
        columns={[
          { key: "n", label: "Name", sort: (r) => r.person?.full_name || "", render: (r) => r.person?.full_name || "—" },
          { key: "t", label: "Title", sort: (r) => r.person?.job_title || "", render: (r) => r.person?.job_title || "·" },
          { key: "c", label: "Company", sort: (r) => r.person?.company?.name || "", render: (r) => r.person?.company?.name || "·" },
          { key: "e", label: "E-mail", sort: (r) => r.person?.primary_email || "", render: (r) => r.person?.primary_email || <span style={{ color: RED }}>none</span> },
          { key: "p", label: "Phone", render: (r) => r.person?.primary_phone || "·" },
          { key: "x", label: "", render: (r) => (
            <button onClick={() => remove(r.person_id, r.person?.full_name || "this person")} disabled={busy === r.person_id}
              className="text-xs" style={{ color: RED }} title="Take them off this list. The person and their other lists are untouched.">
              {busy === r.person_id ? "…" : "remove from list"}
            </button>
          ) },
        ]} />
    </Modal>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   THE RESULT OF A CAMPAIGN

   Dr Raghu, 14 Sep 2026: "in this have — List, Qued, Sent (100%), Delivered
   (%), Opened (%), Clicked (%), Bounced (%), Unsubscribed (%)" — then, the
   same day: "this should be in a nice display on one line, show the number
   on top and the % below that."

   So it is a strip, not a table. Eight figures read left to right in one
   glance instead of down a column; the number is the thing, the percentage
   sits under it as the smaller fact that qualifies it.

   WHAT EACH PERCENTAGE IS OF — his correction, and it matters:

     of the AUDIENCE   queued · sent · delivered · failed · skipped
     of what WENT OUT  opened · clicked · bounced · unsubscribed

   An open rate against a list you have only half-sent to is a number that
   flatters and means nothing. The honest base is delivered; until Resend's
   webhook arrives it is sent, and the footnote names which — never silently.

   TWO CELLS SAY "not measured" RATHER THAN NOUGHT. Delivered is Resend's
   word, not ours: we know the message was handed over, not that it arrived.
   Clicked needs the links rewritten to count, and nothing rewrites them. A
   nought would read as "nobody opened it", which is a different fact from
   "we are not counting", and on a page that decides whether a campaign
   worked, that difference is the whole point.
   ══════════════════════════════════════════════════════════════════════ */
type Result = {
  lists: string[]; audience: number;
  queued: number; queuedPc: number;
  sent: number; sentPc: number;
  delivered: number | null; deliveredPc: number | null;
  opened: number; openedPc: number;
  clicked: number | null;
  bounced: number; bouncedPc: number;
  unsubscribed: number; unsubscribedPc: number;
  failed: number; failedPc: number;
  skipped: number; skippedPc?: number;
  reach?: number; reachLabel?: string;
};

/** One figure in the strip: what it is, the number, and the share beneath it. */
function Stat({ label, v, pc, ink, why }: { label: string; v: number | null; pc?: number | null; ink?: string; why?: string }) {
  return (
    <div title={why || undefined} style={{ flex: "1 1 92px", minWidth: 84, padding: "2px 10px", borderLeft: "1px solid var(--line)" }}>
      <div style={{ fontSize: 10.5, color: MUTED, letterSpacing: .4, textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
      {v === null ? (
        <div style={{ fontSize: 12, color: MUTED, marginTop: 4, lineHeight: 1.2 }}>not<br />measured</div>
      ) : (
        <>
          <div className="tnum" style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.15, color: ink || INK }}>{v}</div>
          <div className="tnum" style={{ fontSize: 11.5, color: MUTED }}>{pc === null || pc === undefined ? "" : `${pc}%`}</div>
        </>
      )}
    </div>
  );
}

function ResultPanel({ r }: { r: Result }) {
  const base = r.reachLabel || "sent";
  const reach = r.reach ?? r.sent;
  return (
    <div className="rounded border p-3 mt-3" style={{ borderColor: "var(--line)", background: "#FAFAF8" }}>
      <div className="text-xs font-bold mb-2" style={{ color: MUTED, letterSpacing: .8 }}>THE RESULT</div>
      <div className="text-sm mb-2">
        <span style={{ color: MUTED }}>List </span>
        <b>{r.lists.length ? r.lists.join(", ") : "chosen people only"}</b>
        <span style={{ color: MUTED }}> · audience </span><b className="tnum">{r.audience}</b>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", rowGap: 10, borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)", padding: "8px 0" }}>
        <Stat label="Queued" v={r.queued} pc={r.queuedPc} why="still to go — share of the audience" />
        <Stat label="Sent" v={r.sent} pc={r.sentPc} ink={GREEN} why="handed to the channel — share of the audience" />
        <Stat label="Delivered" v={r.delivered} pc={r.deliveredPc} why="needs Resend's email.delivered webhook; would be a share of the audience" />
        <Stat label="Opened" v={r.opened} pc={r.openedPc} ink={r.opened ? GREEN : undefined} why={`share of ${base} (${reach}) — images-off readers never count`} />
        <Stat label="Clicked" v={r.clicked} why="links are not rewritten, so clicks are not counted" />
        <Stat label="Bounced" v={r.bounced} pc={r.bouncedPc} ink={r.bounced ? RED : undefined} why={`share of ${base} (${reach}) — arrives on the webhook, goes straight onto the unsubscribe list`} />
        <Stat label="Unsub" v={r.unsubscribed} pc={r.unsubscribedPc} ink={r.unsubscribed ? "var(--warn)" : undefined} why={`share of ${base} (${reach})`} />
        {r.failed > 0 && <Stat label="Failed" v={r.failed} pc={r.failedPc} ink={RED} why="refused outright — see the rows below" />}
        {r.skipped > 0 && <Stat label="Skipped" v={r.skipped} pc={r.skippedPc} why="already unsubscribed when their turn came" />}
      </div>
      <div className="text-xs mt-2" style={{ color: MUTED, lineHeight: 1.5 }}>
        Queued, sent and delivered are shares of the <b>audience</b> ({r.audience}).
        Opened, bounced and unsubscribed are shares of <b>{base}</b> ({reach})
        {base === "sent" && <> — they move onto delivered once Resend&rsquo;s webhook is on</>}.
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   IS THE CRON RUNNING?

   Dr Raghu, 14 Sep 2026: "can u also let me know how many crons completed
   and how much time to the next cron?"

   A fair question, and today the only way to answer it was to watch the
   number and see whether it moved. A campaign can sit at "sending" for ever
   if the cron is not picking it up, and nothing on the screen would say so.

   The countdown runs in the browser off a server timestamp, so it keeps
   ticking without asking the server every second — and when it reaches zero
   it refetches once, which is the moment the numbers will have changed.
   ══════════════════════════════════════════════════════════════════════ */
type Cron = {
  passesSinceStart: number; lastPassAt: string | null; sentByCron: number;
  nextAt: string; secondsToNext: number;
  recent: { at: string; sent: number; failed: number; retrying: number }[];
};

function CronPanel({ c, onRefresh }: { c: Cron; onRefresh: () => void }) {
  const [left, setLeft] = useState(c.secondsToNext);
  useEffect(() => { setLeft(c.secondsToNext); }, [c.secondsToNext, c.nextAt]);
  useEffect(() => {
    const t = setInterval(() => {
      setLeft((s) => {
        if (s <= 1) { onRefresh(); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [onRefresh]);
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  /* No pass since the campaign started is the thing worth shouting about. */
  const stalled = c.passesSinceStart === 0;
  return (
    <div className="rounded border p-3 mt-3" style={{ borderColor: stalled ? "var(--warn)" : "var(--line)", background: stalled ? "#FFF7E6" : "#FAFAF8" }}>
      <div className="flex gap-4 flex-wrap items-baseline text-sm">
        <span><b className="tnum" style={{ fontSize: 17 }}>{c.passesSinceStart}</b> <span style={{ color: MUTED }}>cron passes since this started</span></span>
        <span><b className="tnum" style={{ fontSize: 17, color: GREEN }}>{c.sentByCron}</b> <span style={{ color: MUTED }}>sent by them</span></span>
        <span style={{ color: MUTED }}>next pass in <b className="tnum" style={{ color: INK, fontSize: 16 }}>{mm}:{ss}</b></span>
        <button onClick={onRefresh} className="text-xs font-semibold" style={{ color: "var(--blue)" }}>refresh now</button>
      </div>
      {stalled && (
        <div className="text-xs mt-1.5" style={{ color: "#8A5B00", lineHeight: 1.5 }}>
          <b>No pass has picked this campaign up yet.</b> If this is still nought after the countdown reaches zero, the
          queue is not draining — press <b>Pause</b> then <b>Resume</b>, and if it stays nought, say so.
        </div>
      )}
      {c.recent.length > 0 && (
        <div className="text-xs mt-1.5" style={{ color: MUTED }}>
          Last passes: {c.recent.map((p) => `${fmtAt(p.at)} — ${p.sent} sent${p.failed ? `, ${p.failed} failed` : ""}${p.retrying ? `, ${p.retrying} retrying` : ""}`).join(" · ")}
        </div>
      )}
    </div>
  );
}
