"use client";
/**
 * SEVA → CRM (Dr Raghu, 12 Oct 2026). "Jobs that did not have an AMC or are
 * under warranty, so that they know what jobs are under warranty today … 12
 * months by default; whichever is 24 months will get extended … contact the
 * customer for taking AMC … all the customers and sites, and what jobs are
 * there within that site … a call or an email … the more visibility we show,
 * the more Sarita can work on it … an email to all of them."
 */
import { Fragment, useEffect, useMemo, useState } from "react";

type Job = { job_id: string; customer: string; site: string; tag: string; fam: string; status: string; delivered_on: string | null; installed_on: string | null; from: string | null; months: number; till: string | null; warranty_note: string | null; amc: string | null; customer_amcs: string[]; state: string };
type Touch = { id: string; customer: string; kind: string; note: string; outcome: string | null; next_on: string | null; by: string; at: string };
type Cust = { customer: string; jobs: number; prospects: number; ending: number; warranty: number; amc: number; sites: string[]; contact: { to: string[]; cc: string[]; from: string } | null; last: Touch | null; touches: number; customer_amcs: string[] };
type D = { installed: boolean; today: string; rows: Job[]; customers: Cust[]; kinds: string[] };
type Tab = "prospects" | "warranty" | "covered" | "all";

const NAVY = "var(--navy)", MUTED = "var(--muted)", LINE = "var(--line)", ORANGE = "var(--accent)", GREEN = "var(--green)", RED = "var(--red)";
const dmy = (d?: string | null) => (d ? new Date(d.slice(0, 10) + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" }) : "—");
const inp: React.CSSProperties = { border: `1px solid ${LINE}`, borderRadius: 7, padding: "5px 8px", fontSize: 12.5, background: "#fff" };
const lbl: React.CSSProperties = { display: "block", fontSize: 10.5, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--dim)", marginBottom: 3 };
const btn = (k: "p" | "s" | "g" = "s"): React.CSSProperties => ({ borderRadius: 7, padding: "5px 11px", fontSize: 12.5, fontWeight: 700, border: k === "g" ? "none" : `1px solid ${k === "p" ? "var(--accent)" : LINE}`, background: k === "p" ? "var(--accent)" : k === "g" ? "transparent" : "#fff", color: k === "p" ? "#fff" : NAVY });
const STATE: Record<string, { l: string; c: string }> = { warranty: { l: "Under warranty", c: GREEN }, ending: { l: "Warranty ending", c: "#B45309" }, prospect: { l: "No AMC — out of warranty", c: RED }, amc: { l: "AMC", c: "#2563EB" }, "customer amc": { l: "Customer has an AMC", c: "#0E7490" }, "no date": { l: "No delivery date", c: MUTED } };
const DEFAULT_LETTER = `<p>Dear Sir / Madam,</p><p>Greetings from Nandan GSE. Our records show the following machines with you at {sites}:</p>{machines}<p>To keep them safe, compliant and running without breakdowns, we would like to offer you an Annual Maintenance Contract — scheduled preventive visits by our trained engineers, priority breakdown support and genuine spares.</p><p>May we send you a quotation? A reply to this mail or a call is all it takes.</p><p>Warm regards,<br/>Service team, Nandan GSE Pvt Ltd</p>`;

async function post(body: unknown) {
  const r = await fetch("/api/seva/crm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `Failed (${r.status})`); return j;
}

export default function SevaCrm() {
  const [d, setD] = useState<D | null>(null);
  const [tab, setTab] = useState<Tab>("prospects");
  const [q, setQ] = useState(""); const [fam, setFam] = useState(""); const [site, setSite] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set()); const [open, setOpen] = useState<string | null>(null);
  const [mail, setMail] = useState<{ subject: string; body_html: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 }>({ k: "till", dir: 1 });
  const load = () => fetch("/api/seva/crm", { cache: "no-store" }).then((r) => r.json()).then(setD).catch(() => setD(null));
  useEffect(() => { load(); }, []);
  const t = q.trim().toLowerCase();
  const jobs = useMemo(() => (d?.rows || []).filter((r) => (!fam || r.fam === fam) && (!site || r.site === site) && (!t || [r.job_id, r.customer, r.site, r.tag, r.fam].some((v) => String(v || "").toLowerCase().includes(t)))), [d, fam, site, t]);
  const custs = useMemo(() => (d?.customers || []).filter((c) => c.prospects + c.ending > 0 && (!t || c.customer.toLowerCase().includes(t) || c.sites.some((s) => s.toLowerCase().includes(t))) && (!site || c.sites.includes(site)) && (!fam || jobs.some((j) => j.customer === c.customer))).sort((a, b) => b.prospects + b.ending - (a.prospects + a.ending)), [d, t, site, fam, jobs]);
  if (!d) return <div className="text-sm" style={{ color: MUTED }}>Reading every job…</div>;
  if (!d.installed) return <div className="text-sm font-bold" style={{ color: RED }}>Run migration 0228 first — then Pull from the ERP.</div>;
  const count = (s: string[]) => jobs.filter((r) => s.includes(r.state)).length;
  const pull = async () => { setBusy(true); setMsg("Reading every job on the ERP…"); try { const r = await post({ action: "pull" }); setMsg(`${r.found} jobs read`); await load(); } catch (e) { setMsg(String((e as Error).message)); } setBusy(false); };
  const sendAll = async () => { if (!mail) return; setBusy(true); setMsg(`Sending to ${sel.size}…`); try { const r = await post({ action: "email", customers: [...sel], ...mail }); setMsg(`${r.sent} sent${r.failed.length ? ` · not sent: ${r.failed.map((f: { customer: string; why: string }) => `${f.customer} (${f.why})`).join("; ")}` : ""}`); setMail(null); setSel(new Set()); await load(); } catch (e) { setMsg(String((e as Error).message)); } setBusy(false); };
  const listFor: Record<Tab, string[]> = { prospects: ["prospect", "ending"], warranty: ["warranty", "ending"], covered: ["amc", "customer amc"], all: Object.keys(STATE) };
  const tableRows = jobs.filter((r) => listFor[tab].includes(r.state)).sort((a, b) => { const x = (a as unknown as Record<string, unknown>)[sort.k] ?? "", y = (b as unknown as Record<string, unknown>)[sort.k] ?? ""; return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * sort.dir; });
  const Th = ({ k, l }: { k: string; l: string }) => <th onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : 1 }))} style={{ cursor: "pointer", whiteSpace: "nowrap" }}>{l}<span style={{ opacity: sort.k === k ? 1 : 0.35, marginLeft: 4, fontSize: 10 }}>{sort.k === k ? (sort.dir === 1 ? "▲" : "▼") : "↕"}</span></th>;
  return (
    <div>
      <div className="flex items-baseline gap-2 flex-wrap mb-2">
        <h2 className="font-bold" style={{ fontSize: 20, color: NAVY }}>CRM</h2>
        <span className="text-xs" style={{ color: MUTED }}>every delivered machine — under warranty, covered by an AMC, or one to call about</span>
        <span className="ml-auto" />
        {msg && <span className="text-xs font-bold" style={{ color: ORANGE }}>{msg}</span>}
        <button onClick={pull} disabled={busy} style={btn()}>⟳ Pull jobs from the ERP</button>
      </div>
      {d.rows.length === 0 && <div className="rounded-lg p-3 mb-2 text-sm" style={{ background: "#FFF7ED", border: "1px solid #FED7AA" }}>Nothing yet — press <b>Pull jobs from the ERP</b> once; the hour keeps it fresh after.</div>}
      <div className="flex gap-2 flex-wrap mb-2">
        {([["prospects", "AMC prospects", count(["prospect", "ending"]), RED], ["warranty", "Under warranty today", count(["warranty", "ending"]), GREEN], ["covered", "Covered by an AMC", count(["amc", "customer amc"]), "#2563EB"], ["all", "All delivered", jobs.length, NAVY]] as [Tab, string, number, string][]).map(([k, l, n, c]) => (
          <button key={k} onClick={() => setTab(k)} className="rounded-lg px-3 py-2 text-left" style={{ background: tab === k ? NAVY : "#fff", color: tab === k ? "#fff" : NAVY, border: `1px solid ${LINE}`, borderTop: `4px solid ${c}`, minWidth: 150 }}>
            <div className="font-bold tnum" style={{ fontSize: 20 }}>{n.toLocaleString("en-IN")}</div><div className="text-xs">{l}</div>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer, site, job, machine…" style={{ ...inp, width: 260 }} />
        <select value={site} onChange={(e) => setSite(e.target.value)} style={{ ...inp, maxWidth: 200 }}><option value="">Site — all</option>{[...new Set(d.rows.map((r) => r.site).filter(Boolean))].sort().map((s) => <option key={s}>{s}</option>)}</select>
        <select value={fam} onChange={(e) => setFam(e.target.value)} style={{ ...inp, maxWidth: 220 }}><option value="">Family — all</option>{[...new Set(d.rows.map((r) => r.fam).filter(Boolean))].sort().map((s) => <option key={s}>{s}</option>)}</select>
        {tab === "prospects" && <><span className="text-xs" style={{ color: MUTED }}>{sel.size} ticked</span><button disabled={!sel.size} onClick={() => setMail({ subject: "Annual Maintenance Contract for your Nandan machines — {customer}", body_html: DEFAULT_LETTER })} style={btn(sel.size ? "p" : "s")}>✉ Mail the ticked customers</button></>}
      </div>

      {tab === "prospects" ? (
        <div className="rounded-lg bg-white" style={{ border: `1px solid ${LINE}`, overflow: "auto", maxHeight: "68vh" }}>
          <table className="genie-table" style={{ minWidth: 1100 }}>
            <thead><tr><th style={{ width: 30 }}><input type="checkbox" checked={sel.size > 0 && sel.size === custs.length} onChange={(e) => setSel(e.target.checked ? new Set(custs.map((c) => c.customer)) : new Set())} /></th><th>Customer</th><th>Sites</th><th>No AMC</th><th>Warranty ending</th><th>Under warranty</th><th>Contact</th><th>Last touch</th><th>Next</th><th /></tr></thead>
            <tbody>
              {custs.map((c) => (
                <Fragment key={c.customer}>
                  <tr>
                    <td><input type="checkbox" checked={sel.has(c.customer)} onChange={(e) => { const n = new Set(sel); if (e.target.checked) n.add(c.customer); else n.delete(c.customer); setSel(n); }} /></td>
                    <td><button onClick={() => setOpen(open === c.customer ? null : c.customer)} className="font-bold text-left hover:underline" style={{ color: NAVY }}>{open === c.customer ? "▾" : "▸"} {c.customer}</button>{c.customer_amcs.length > 0 && <div className="text-xs" style={{ color: "#0E7490" }}>holds AMC {c.customer_amcs.join(", ")}</div>}</td>
                    <td className="text-xs" style={{ maxWidth: 200 }}>{c.sites.join(", ") || "—"}</td>
                    <td className="tnum font-bold" style={{ color: RED }}>{c.prospects || "—"}</td>
                    <td className="tnum" style={{ color: "#B45309" }}>{c.ending || "—"}</td>
                    <td className="tnum" style={{ color: GREEN }}>{c.warranty || "—"}</td>
                    <td className="text-xs" style={{ maxWidth: 200 }}>{c.contact?.to.join(", ") || <span style={{ color: RED }}>no e-mail</span>}{c.contact && c.contact.from !== "saved" && <div style={{ color: MUTED }}>from the {c.contact.from}</div>}</td>
                    <td className="text-xs">{c.last ? <><b>{c.last.kind}</b> {dmy(c.last.at)} · {String(c.last.by).split("@")[0]}<div style={{ color: MUTED, maxWidth: 220 }} className="truncate">{c.last.note}</div></> : <span style={{ color: MUTED }}>never</span>}</td>
                    <td className="text-xs tnum" style={{ color: c.last?.next_on && c.last.next_on <= d.today ? RED : undefined }}>{dmy(c.last?.next_on)}</td>
                    <td className="whitespace-nowrap"><button onClick={() => setOpen(c.customer)} style={{ ...btn(), padding: "3px 8px" }}>📞 Log</button></td>
                  </tr>
                  {open === c.customer && <tr><td colSpan={10} style={{ background: "#FAFAF7" }}><CustomerPanel c={c} jobs={d.rows.filter((r) => r.customer === c.customer)} kinds={d.kinds} onChange={load} /></td></tr>}
                </Fragment>
              ))}
              {custs.length === 0 && <tr><td colSpan={10} style={{ color: MUTED, padding: 16 }}>No customer to call.</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-lg bg-white" style={{ border: `1px solid ${LINE}`, overflow: "auto", maxHeight: "68vh" }}>
          <table className="genie-table" style={{ minWidth: 1100 }}>
            <thead><tr><Th k="job_id" l="Job" /><Th k="customer" l="Customer" /><Th k="site" l="Site" /><Th k="tag" l="Machine" /><Th k="delivered_on" l="Delivered" /><Th k="installed_on" l="Installed" /><Th k="months" l="Warranty" /><Th k="till" l="Till" /><Th k="state" l="Now" /></tr></thead>
            <tbody>
              {tableRows.slice(0, 1500).map((r) => (
                <tr key={r.job_id}>
                  <td className="tnum font-bold"><a href={`https://nandanerp.in/app/jobmaster/${r.job_id}`} target="_blank" rel="noreferrer" className="hover:underline" style={{ color: "var(--blue)" }}>{r.job_id}</a></td>
                  <td style={{ maxWidth: 220 }}>{r.customer}</td>
                  <td className="text-xs">{r.site || "—"}</td>
                  <td className="text-xs" style={{ maxWidth: 220 }}>{r.tag || r.fam}</td>
                  <td className="tnum text-xs">{dmy(r.delivered_on)}</td>
                  <td className="tnum text-xs">{dmy(r.installed_on)}</td>
                  <td><Months r={r} onChange={load} /></td>
                  <td className="tnum text-xs" style={{ color: r.till && r.till < d.today ? RED : undefined }}>{dmy(r.till)}</td>
                  <td className="text-xs font-bold" style={{ color: STATE[r.state]?.c }}>{STATE[r.state]?.l || r.state}{r.amc ? ` ${r.amc}` : ""}</td>
                </tr>
              ))}
              {tableRows.length === 0 && <tr><td colSpan={9} style={{ color: MUTED, padding: 16 }}>None.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <div className="text-xs mt-1" style={{ color: MUTED }}>Warranty runs from the installation&apos;s completion (else the delivery) for 12 months unless set — change it on the job. A job is covered when a valid AMC names it.</div>

      {mail && (
        <div onClick={() => setMail(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} className="rounded-xl" style={{ width: "min(760px, 100%)", maxHeight: "92vh", overflowY: "auto", background: "var(--paper)", padding: 18 }}>
            <b style={{ fontSize: 17, color: NAVY }}>Mail {sel.size} customer{sel.size === 1 ? "" : "s"}</b>
            <div className="text-xs mb-2" style={{ color: MUTED }}>One mail each, to each customer&apos;s contact — their own machines listed where {"{machines}"} stands, {"{customer}"} and {"{sites}"} filled in. From your Gmail, else sales@ with you in CC. Each is logged against the customer.</div>
            <label style={lbl}>Subject</label><input style={{ ...inp, width: "100%" }} value={mail.subject} onChange={(e) => setMail({ ...mail, subject: e.target.value })} />
            <label style={{ ...lbl, marginTop: 8 }}>The letter</label>
            <div contentEditable suppressContentEditableWarning onBlur={(e) => setMail({ ...mail, body_html: (e.target as HTMLDivElement).innerHTML })} dangerouslySetInnerHTML={{ __html: mail.body_html }} style={{ ...inp, width: "100%", minHeight: 220, lineHeight: 1.5 }} />
            <div className="text-xs mt-1" style={{ color: MUTED }}>Going to: {[...sel].map((s) => `${s}${d.customers.find((c) => c.customer === s)?.contact?.to.length ? "" : " (no e-mail — skipped)"}`).join(" · ")}</div>
            <div className="flex gap-2 mt-3"><button onClick={sendAll} disabled={busy} style={btn("p")}>{busy ? "Sending…" : `Send ${sel.size}`}</button><button onClick={() => setMail(null)} style={btn("g")}>Cancel</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

function Months({ r, onChange }: { r: Job; onChange: () => void }) {
  const [v, setV] = useState(String(r.months));
  return (
    <select value={v} title={r.warranty_note || "Warranty months — 12 unless set"} onChange={async (e) => { setV(e.target.value); try { await post({ action: "warranty", job_id: r.job_id, months: Number(e.target.value) }); onChange(); } catch (x) { alert(String((x as Error).message)); } }} style={{ ...inp, padding: "2px 4px", fontWeight: r.months !== 12 ? 800 : 400 }}>
      {[0, 6, 12, 18, 24, 36, 48, 60].map((m) => <option key={m} value={m}>{m} months</option>)}
    </select>
  );
}

function CustomerPanel({ c, jobs, kinds, onChange }: { c: Cust; jobs: Job[]; kinds: string[]; onChange: () => void }) {
  const [t, setT] = useState({ kind: "Call", note: "", outcome: "", next_on: "" });
  const [ct, setCt] = useState({ to: (c.contact?.to || []).join(", "), cc: (c.contact?.cc || []).join(", ") });
  const [touches, setTouches] = useState<Touch[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetch(`/api/seva/crm?touches=${encodeURIComponent(c.customer)}`).then((r) => r.json()).then((j) => setTouches(j.touches || [])).catch(() => setTouches([])); }, [c.customer]);
  const bySite = new Map<string, Job[]>(); for (const j of jobs) bySite.set(j.site || "Site not recorded", [...(bySite.get(j.site || "Site not recorded") || []), j]);
  const save = async (body: Record<string, unknown>) => { setBusy(true); try { await post(body); onChange(); } catch (e) { alert(String((e as Error).message)); } setBusy(false); };
  return (
    <div className="grid gap-3 p-2" style={{ gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr)" }}>
      <div>
        {[...bySite.entries()].map(([s, js]) => (
          <div key={s} className="mb-2">
            <div className="text-xs font-bold" style={{ color: NAVY }}>📍 {s} · {js.length}</div>
            {js.map((j) => <div key={j.job_id} className="text-xs flex gap-2"><a href={`https://nandanerp.in/app/jobmaster/${j.job_id}`} target="_blank" rel="noreferrer" className="tnum" style={{ color: "var(--blue)" }}>{j.job_id}</a><span className="truncate" style={{ maxWidth: 240 }}>{j.tag || j.fam}</span><span style={{ color: STATE[j.state]?.c, fontWeight: 700 }}>{STATE[j.state]?.l}{j.till ? ` · ${dmy(j.till)}` : ""}</span></div>)}
          </div>
        ))}
      </div>
      <div className="grid gap-2" style={{ alignContent: "start" }}>
        <div className="rounded-lg bg-white p-2" style={{ border: `1px solid ${LINE}` }}>
          <div className="text-xs font-bold mb-1">Log a call, a mail, a visit</div>
          <div className="flex gap-1 flex-wrap mb-1">{kinds.map((k) => <button key={k} onClick={() => setT({ ...t, kind: k })} style={{ ...btn(t.kind === k ? "p" : "s"), padding: "2px 8px", fontSize: 11.5 }}>{k}</button>)}</div>
          <textarea style={{ ...inp, width: "100%", minHeight: 50 }} value={t.note} onChange={(e) => setT({ ...t, note: e.target.value })} placeholder="Spoke to the maintenance head — wants a quote for 2 lifts" />
          <div className="flex gap-1 mt-1 items-center"><input style={{ ...inp, flex: 1 }} value={t.outcome} onChange={(e) => setT({ ...t, outcome: e.target.value })} placeholder="Outcome" /><input type="date" style={inp} value={t.next_on} onChange={(e) => setT({ ...t, next_on: e.target.value })} title="Next follow-up" /></div>
          <div className="flex gap-2 mt-1"><button disabled={busy || !t.note.trim()} onClick={() => save({ action: "touch", customer: c.customer, ...t, job_ids: jobs.filter((j) => j.state === "prospect" || j.state === "ending").map((j) => j.job_id) }).then(() => setT({ kind: "Call", note: "", outcome: "", next_on: "" }))} style={btn("p")}>Log it</button>
            <a href="https://nandanerp.in/app/quotation/new" target="_blank" rel="noreferrer" style={{ ...btn(), textDecoration: "none" }} title="Make the AMC quotation on the ERP; it comes back to Seva → Quotation within the hour">🧾 Make a quotation ↗</a></div>
        </div>
        <div className="rounded-lg bg-white p-2" style={{ border: `1px solid ${LINE}` }}>
          <div className="text-xs font-bold mb-1">Contact — the mail goes here</div>
          <input style={{ ...inp, width: "100%" }} value={ct.to} onChange={(e) => setCt({ ...ct, to: e.target.value })} placeholder="To" />
          <input style={{ ...inp, width: "100%", marginTop: 4 }} value={ct.cc} onChange={(e) => setCt({ ...ct, cc: e.target.value })} placeholder="CC" />
          <button disabled={busy} onClick={() => save({ action: "contacts", customer: c.customer, ...ct })} style={{ ...btn(), marginTop: 4 }}>Save the contact</button>
        </div>
        <div className="text-xs">
          {touches === null ? "…" : touches.length === 0 ? <span style={{ color: MUTED }}>Nothing logged yet.</span> : touches.map((x) => <div key={x.id} className="py-0.5" style={{ borderBottom: `1px dotted ${LINE}` }}><b>{x.kind}</b> <span style={{ color: MUTED }}>{dmy(x.at)} · {x.by.split("@")[0]}</span> — {x.note}{x.outcome ? ` → ${x.outcome}` : ""}{x.next_on ? <span style={{ color: ORANGE }}> · next {dmy(x.next_on)}</span> : null}</div>)}
        </div>
      </div>
    </div>
  );
}
