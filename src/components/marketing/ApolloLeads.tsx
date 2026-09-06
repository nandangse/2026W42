"use client";
/**
 * APOLLO LEADS — the pool (Dr Raghu, 6 Sep 2026): "make a new table called
 * Apollo lead. Sync it there. We can do a workflow where to import from
 * Apollo to the leads is a click away! We can search with filters and then
 * do select all and then add to leads. Apollo list name will come in as tag
 * on the Apollo lead."
 *
 * Nothing here is in the CRM yet. A pooled row becomes a person and a
 * company only when it is promoted — matched on e-mail, then domain, then
 * name — tagged Apollo and with every Apollo list it came from as a tag.
 * That is what keeps 3.1 million contacts from slowing the CRM down.
 */
import React, { useCallback, useEffect, useState } from "react";
import GenieTable from "@/components/GenieTable";
import { Modal } from "@/components/marketing/LeadBoxes";
import { fmtAt } from "@/lib/fmt";
import { swallow } from "@/lib/swallow";

type Row = { id: string; email: string | null; first_name: string | null; last_name: string | null; title: string | null; seniority: string | null; department: string | null; phone: string | null; linkedin: string | null; city: string | null; state: string | null; country: string | null; company_name: string | null; domain: string | null; website: string | null; industry: string | null; employees: number | null; lists: string[]; promoted_person_id: string | null; promoted_at: string | null; imported_at: string };
type ListCount = { name: string; total: number; promoted: number };
type MailList = { id: string; name: string; count: number };

const INK = "var(--ink)", MUTED = "var(--muted)", LINE = "var(--line)", NAVY = "var(--navy)", GREEN = "var(--green)", RED = "var(--red)", ACCENT = "var(--accent)";
const inp: React.CSSProperties = { border: `1px solid #E2E0DA`, borderRadius: 6, padding: "6px 8px", fontSize: 13, background: "#fff", color: "#22303C", width: "100%" };
const btn = (bg: string, fg = "#fff"): React.CSSProperties => ({ background: bg, color: fg, borderRadius: 6, padding: "6px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" });

async function api<T = Record<string, unknown>>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j as T;
}

/** Apollo's people export, read in the browser — their column names, and the near ones. */
export function parseApolloCsv(text: string): Record<string, string>[] {
  const out: string[][] = []; let cur = ""; let row: string[] = []; let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += ch; }
    else if (ch === '"') inQ = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cur); out.push(row); row = []; cur = ""; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); out.push(row); }
  const head = (out.shift() || []).map((h) => h.trim().toLowerCase().replace(/^﻿/, ""));
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const C = {
    first: col("first name", "first_name"), last: col("last name", "last_name"),
    title: col("title", "job title"), seniority: col("seniority"), department: col("departments", "department"),
    email: col("email", "work email", "email address"),
    phone: col("work direct phone", "mobile phone", "corporate phone", "phone", "company phone"),
    linkedin: col("person linkedin url", "linkedin url", "linkedin"),
    city: col("city"), state: col("state"), country: col("country"),
    company: col("company", "company name for emails", "company name", "account name"),
    domain: col("primary domain", "company domain", "domain", "email domain"),
    website: col("website", "company website"), industry: col("industry"),
    employees: col("# employees", "employees", "company headcount"),
    ccity: col("company city"), ccountry: col("company country"),
  };
  const g = (r: string[], i: number) => (i >= 0 ? (r[i] || "").trim() : "");
  return out.filter((r) => r.some((x) => x.trim())).map((r) => ({
    first_name: g(r, C.first), last_name: g(r, C.last), title: g(r, C.title), seniority: g(r, C.seniority), department: g(r, C.department),
    email: g(r, C.email), phone: g(r, C.phone), linkedin: g(r, C.linkedin), city: g(r, C.city), state: g(r, C.state), country: g(r, C.country),
    company: g(r, C.company), domain: g(r, C.domain) || (g(r, C.email).includes("@") ? g(r, C.email).split("@")[1] : ""),
    website: g(r, C.website), industry: g(r, C.industry), employees: g(r, C.employees), company_city: g(r, C.ccity), company_country: g(r, C.ccountry),
  }));
}

export default function ApolloLeads({ lists, onPromoted }: { lists: MailList[]; onPromoted: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [total, setTotal] = useState(0);
  const [installed, setInstalled] = useState(true);
  const [counts, setCounts] = useState<ListCount[]>([]);
  const [flt, setFlt] = useState<Record<string, string>>({ promoted: "0" });
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const [taking, setTaking] = useState(false);
  const [toList, setToList] = useState("");

  const qs = useCallback(() => {
    const p = new URLSearchParams({ q });
    for (const [k, v] of Object.entries(flt)) if (v) p.set(k, v);
    return p.toString();
  }, [q, flt]);
  const load = useCallback(() => {
    api<{ rows: Row[]; total: number; installed: boolean }>(`/api/marketing/apollo?${qs()}`)
      .then((j) => { setRows(j.rows || []); setTotal(j.total || 0); setInstalled(j.installed !== false); })
      .catch((e) => { swallow("marketing/apollo", e); setRows([]); });
  }, [qs]);
  const loadCounts = useCallback(() => api<{ lists: ListCount[] }>("/api/marketing/apollo?lists=1").then((j) => setCounts(j.lists || [])).catch(() => setCounts([])), []);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  useEffect(() => { loadCounts(); }, [loadCounts]);
  useEffect(() => { setPicked(new Set()); }, [q, flt]);

  const shown = rows ?? [];
  const setF = (k: string, v: string) => setFlt((f) => ({ ...f, [k]: v }));
  const selectAllMatching = async () => {
    try { const j = await api<{ ids: string[]; total: number }>(`/api/marketing/apollo?${qs()}&ids=1`); setPicked(new Set(j.ids)); setMsg(`${j.ids.length.toLocaleString("en-IN")} of ${j.total.toLocaleString("en-IN")} selected ✓`); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  };
  const promote = async () => {
    const ids = [...picked];
    if (!ids.length) return;
    setBusy("promote"); setMsg("");
    const tot = { promoted: 0, new_people: 0, new_companies: 0 };
    try {
      for (let i = 0; i < ids.length; i += 500) {
        const r = await api<typeof tot>("/api/marketing/apollo", { action: "promote", ids: ids.slice(i, i + 500), list_id: toList || undefined });
        for (const k of Object.keys(tot) as (keyof typeof tot)[]) tot[k] += r[k] || 0;
        setMsg(`taking them in… ${Math.min(i + 500, ids.length).toLocaleString("en-IN")} of ${ids.length.toLocaleString("en-IN")}`);
      }
      setMsg(`${tot.promoted.toLocaleString("en-IN")} added to Leads — ${tot.new_people.toLocaleString("en-IN")} new people, ${tot.new_companies.toLocaleString("en-IN")} new companies${toList ? ", and onto the list" : ""} ✓`);
      setPicked(new Set()); load(); loadCounts(); onPromoted();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } finally { setBusy(""); }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <div className="font-bold" style={{ fontSize: 16, color: INK }}>🛰 Apollo Leads</div>
        <span className="text-xs" style={{ color: MUTED }}>the pool — nothing here is in the CRM until you add it to Leads</span>
        <span className="ml-auto" />
        <button onClick={() => setTaking(true)} style={btn(ACCENT)}>⬆ Import an Apollo list</button>
      </div>
      {!installed && <div className="text-xs mb-2" style={{ color: RED }}>Run CRM migration 0057 first — the Apollo pool does not exist yet.</div>}

      {counts.length > 0 && (
        <div className="flex gap-1.5 flex-wrap mb-2 text-xs">
          <span className="font-bold" style={{ color: MUTED }}>LISTS</span>
          <button onClick={() => setF("list", "")} className="rounded-full px-2 py-0.5 font-semibold" style={{ border: `1px solid ${flt.list ? LINE : NAVY}`, background: flt.list ? "#fff" : NAVY, color: flt.list ? "var(--dim)" : "#fff" }}>all</button>
          {counts.map((c) => (
            <button key={c.name} onClick={() => setF("list", flt.list === c.name ? "" : c.name)} className="rounded-full px-2 py-0.5 font-semibold"
              style={{ border: `1px solid ${flt.list === c.name ? "#0F766E" : LINE}`, background: flt.list === c.name ? "#0F766E" : "#fff", color: flt.list === c.name ? "#fff" : INK }}
              title={`${c.total.toLocaleString("en-IN")} in the pool · ${c.promoted.toLocaleString("en-IN")} already in Leads`}>
              {c.name} <span className="tnum" style={{ opacity: 0.75 }}>{c.total.toLocaleString("en-IN")}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1.5 flex-wrap mb-2 text-xs rounded px-2 py-1.5" style={{ background: "#fff", border: `1px solid ${LINE}` }}>
        <span className="font-bold mr-1" style={{ color: MUTED }}>FILTER</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="name, e-mail, title, company" style={{ ...inp, width: 220, padding: "4px 6px", fontSize: 12 }} />
        <input value={flt.title || ""} onChange={(e) => setF("title", e.target.value)} placeholder="title contains" style={{ ...inp, width: 150, padding: "4px 6px", fontSize: 12 }} />
        <input value={flt.company || ""} onChange={(e) => setF("company", e.target.value)} placeholder="company" style={{ ...inp, width: 140, padding: "4px 6px", fontSize: 12 }} />
        <input value={flt.country || ""} onChange={(e) => setF("country", e.target.value)} placeholder="country" style={{ ...inp, width: 110, padding: "4px 6px", fontSize: 12 }} />
        <input value={flt.city || ""} onChange={(e) => setF("city", e.target.value)} placeholder="city" style={{ ...inp, width: 110, padding: "4px 6px", fontSize: 12 }} />
        <select value={flt.has_email ?? ""} onChange={(e) => setF("has_email", e.target.value)} style={{ ...inp, width: "auto", padding: "4px 6px", fontSize: 12 }}>
          <option value="">with or without e-mail</option><option value="1">has e-mail</option><option value="0">no e-mail</option>
        </select>
        <select value={flt.promoted ?? ""} onChange={(e) => setF("promoted", e.target.value)} style={{ ...inp, width: "auto", padding: "4px 6px", fontSize: 12 }}>
          <option value="0">not in Leads yet</option><option value="1">already in Leads</option><option value="">both</option>
        </select>
        {(q || Object.entries(flt).some(([k, v]) => v && k !== "promoted")) && <button onClick={() => { setFlt({ promoted: flt.promoted ?? "0" }); setQ(""); }} className="font-semibold" style={{ color: RED }}>✕ clear</button>}
        <span className="ml-auto tnum" style={{ color: MUTED }}>{total.toLocaleString("en-IN")} match{shown.length < total ? ` · showing ${shown.length}` : ""}</span>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-2 text-xs rounded px-3 py-1.5" style={{ background: picked.size ? "#FFF7E6" : "#FBFAF7", border: `1px solid ${picked.size ? "#F5B32B" : LINE}` }}>
        <button onClick={() => setPicked(new Set(shown.map((r) => r.id)))} className="font-semibold rounded border px-2 py-1 bg-white" style={{ borderColor: LINE, color: "var(--blue)" }}>Select all shown ({shown.length})</button>
        {total > shown.length && <button onClick={selectAllMatching} className="font-semibold rounded border px-2 py-1 bg-white" style={{ borderColor: LINE, color: "var(--blue)" }}>Select all {total.toLocaleString("en-IN")} matching</button>}
        <button onClick={() => setPicked(new Set())} className="font-semibold rounded border px-2 py-1 bg-white" style={{ borderColor: LINE, color: MUTED }}>Deselect</button>
        {picked.size > 0 && <><b>{picked.size.toLocaleString("en-IN")} chosen →</b>
          <select value={toList} onChange={(e) => setToList(e.target.value)} style={{ ...inp, width: 210, padding: "4px 6px" }}><option value="">and onto no list</option>{lists.map((l) => <option key={l.id} value={l.id}>onto “{l.name}”</option>)}</select>
          <button onClick={promote} disabled={!!busy} style={btn(busy ? "#E9ECEF" : "#0F766E", busy ? MUTED : "#fff")}>{busy === "promote" ? "taking them in…" : "→ Add to Leads"}</button></>}
        {msg && <span className="font-semibold" style={{ color: msg.includes("✓") ? GREEN : msg.includes("…") ? INK : RED }}>{msg}</span>}
      </div>

      <GenieTable<Row> rows={rows} minWidth={1020} maxHeight="calc(100vh - 340px)" empty="The pool is empty — import an Apollo list."
        columns={[
          { key: "pick", label: "", render: (r) => <input type="checkbox" checked={picked.has(r.id)} onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} /> },
          { key: "name", label: "Name", sort: (r) => `${r.first_name || ""} ${r.last_name || ""}`, render: (r) => <span className="font-semibold">{[r.first_name, r.last_name].filter(Boolean).join(" ") || "—"}</span> },
          { key: "title", label: "Title", render: (r) => r.title || "·" },
          { key: "company", label: "Company", sort: (r) => r.company_name || "", render: (r) => r.company_name || "·" },
          { key: "email", label: "E-mail", render: (r) => r.email || <span style={{ color: RED }}>none</span> },
          { key: "where", label: "Where", render: (r) => [r.city, r.country].filter(Boolean).join(", ") || "·" },
          { key: "lists", label: "Apollo lists", render: (r) => <span className="flex gap-1 flex-wrap">{(r.lists || []).map((l) => <span key={l} className="rounded-full px-1.5 text-xs" style={{ background: "#EEF2FF", color: INK }}>{l}</span>)}</span> },
          { key: "in", label: "In Leads", render: (r) => r.promoted_person_id ? <span style={{ color: GREEN, fontWeight: 700 }} title={r.promoted_at ? fmtAt(r.promoted_at) : ""}>✓</span> : <span style={{ color: MUTED }}>·</span> },
        ]} />

      {taking && <Intake onClose={() => { setTaking(false); load(); loadCounts(); }} />}
    </div>
  );
}

/** One Apollo list, taken in: the CSV read here, sent 500 rows at a time. */
function Intake({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const [msg, setMsg] = useState("");
  const pick = async (file: File | null) => {
    if (!file) return;
    setDone(""); setMsg("");
    setName((n) => n || file.name.replace(/\.csv$/i, "").replace(/[_-]+/g, " ").trim());
    try { setRows(parseApolloCsv(await file.text())); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  };
  const run = async () => {
    if (!rows.length) return;
    setBusy(true); setMsg("");
    const tot = { new: 0, merged: 0 };
    try {
      for (let i = 0; i < rows.length; i += 500) {
        const r = await api<{ new: number; merged: number }>("/api/marketing/apollo", { action: "import", rows: rows.slice(i, i + 500), list_name: name });
        tot.new += r.new || 0; tot.merged += r.merged || 0;
        setDone(`${Math.min(i + 500, rows.length).toLocaleString("en-IN")} of ${rows.length.toLocaleString("en-IN")}…`);
      }
      setDone(`${tot.new.toLocaleString("en-IN")} new in the pool, ${tot.merged.toLocaleString("en-IN")} already there and now tagged “${name}” ✓`);
      setRows([]);
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  return (
    <Modal title="Import an Apollo list" onClose={onClose} width={680}>
      <div className="text-sm mb-3" style={{ color: "var(--dim)", lineHeight: 1.6 }}>
        In Apollo, open the list, <b>Export</b> to CSV, and drop the file here. Everyone in it is tagged with the list name, so the pool stays searchable by why they are in it. Nobody reaches the CRM until you select them and press <b>Add to Leads</b>.
      </div>
      <label className="text-xs font-semibold block mb-2" style={{ color: "var(--dim)" }}>Apollo list name — this becomes the tag
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Replied to emails" style={inp} />
      </label>
      <input type="file" accept=".csv,text/csv" onChange={(e) => pick(e.target.files?.[0] ?? null)} className="mb-2" />
      {rows.length > 0 && <div className="text-sm mb-2"><b>{rows.length.toLocaleString("en-IN")}</b> rows read · {rows.filter((r) => r.email).length.toLocaleString("en-IN")} with an e-mail · {new Set(rows.map((r) => r.company.toLowerCase()).filter(Boolean)).size.toLocaleString("en-IN")} companies</div>}
      {msg && <div className="text-xs mb-2" style={{ color: RED }}>{msg}</div>}
      {done && <div className="text-sm mb-2 font-semibold" style={{ color: done.includes("✓") ? GREEN : "var(--dim)" }}>{done}</div>}
      <button onClick={run} disabled={busy || !rows.length || !name.trim()} style={btn(rows.length && name.trim() && !busy ? ACCENT : "#E9ECEF", rows.length && name.trim() && !busy ? "#fff" : MUTED)}>
        {busy ? "taking it in…" : `Take in ${rows.length.toLocaleString("en-IN")} rows`}
      </button>
    </Modal>
  );
}
