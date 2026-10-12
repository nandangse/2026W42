"use client";
/**
 * SEVA → JOBS (Dr Raghu, 12 Oct 2026: "show jobs also on the side so that all
 * the jobs which are there can be seen, with the same filters as normal. Only
 * show the jobs with an issue ticket"). Every job — live or delivered back to
 * 2013 — that has at least one ticket: the planning owner and the search as on
 * the planning boards, and customer, family, stage, open tickets; every
 * column sorts. Click a job for its tickets.
 */
import { useEffect, useMemo, useState } from "react";

type J = { id: string; tag: string; fam: string; cust: string; own: string; stat: string; status: string; delivered_on: string | null; live: boolean; known: boolean; tickets: number; open: number; last: string | null; cost: number };
type T = { id: string; erp_name: string; title: string; status: string; type_of_support: string; issue_date: string | null; at: string; cost_spent: number | null; location: string | null; attended_by: string | null; handled_by: string | null; pending_action_status: string | null };
const NAVY = "var(--navy)", MUTED = "var(--muted)", LINE = "var(--line)", RED = "var(--red)";
const dmy = (d?: string | null) => (d ? new Date(d.slice(0, 10) + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" }) : "—");
const inr = (n: number) => (n ? "₹" + n.toLocaleString("en-IN") : "—");
const sel: React.CSSProperties = { border: `1px solid ${LINE}`, borderRadius: 6, padding: "4px 6px", fontSize: 12, background: "#fff", maxWidth: 210 };
const COLS: [keyof J, string][] = [["id", "Job"], ["tag", "Tag"], ["cust", "Customer"], ["fam", "Family"], ["own", "Owner"], ["stat", "Stage"], ["delivered_on", "Delivered"], ["tickets", "Tickets"], ["open", "Open"], ["last", "Last ticket"], ["cost", "Cost"]];

export default function SevaJobs() {
  const [rows, setRows] = useState<J[] | null>(null);
  const [q, setQ] = useState(""); const [own, setOwn] = useState(""); const [cust, setCust] = useState(""); const [fam, setFam] = useState(""); const [stage, setStage] = useState(""); const [openOnly, setOpenOnly] = useState("");
  const [sort, setSort] = useState<{ k: keyof J; dir: 1 | -1 }>({ k: "last", dir: -1 });
  const [open, setOpen] = useState<J | null>(null);
  useEffect(() => { fetch("/api/seva/jobs", { cache: "no-store" }).then((r) => r.json()).then((j) => setRows(j.rows || [])).catch(() => setRows([])); }, []);
  const uniq = (f: (r: J) => string) => [...new Set((rows || []).map(f).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (rows || []).filter((r) => (!own || r.own === own) && (!cust || r.cust === cust) && (!fam || r.fam === fam) && (!stage || (stage === "live" ? r.live : stage === "delivered" ? !r.live : r.stat === stage))
      && (!openOnly || (openOnly === "open" ? r.open > 0 : r.open === 0))
      && (!t || [r.id, r.tag, r.cust, r.fam, r.own, r.stat].some((v) => String(v || "").toLowerCase().includes(t))))
      .sort((a, b) => { const x = a[sort.k] ?? "", y = b[sort.k] ?? ""; return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * sort.dir; });
  }, [rows, q, own, cust, fam, stage, openOnly, sort]);
  const any = !!(q || own || cust || fam || stage || openOnly);
  return (
    <div>
      <div className="flex items-baseline gap-2 flex-wrap mb-2">
        <h2 className="font-bold" style={{ fontSize: 20, color: NAVY }}>Jobs</h2>
        <span className="text-xs" style={{ color: MUTED }}>every job with an issue ticket — live, and delivered back to 2013</span>
      </div>
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search job / tag / customer…" style={{ ...sel, width: 260, maxWidth: 260 }} />
        <select value={own} onChange={(e) => setOwn(e.target.value)} style={sel}><option value="">Planning owner — all</option>{uniq((r) => r.own).map((x) => <option key={x}>{x}</option>)}</select>
        <select value={cust} onChange={(e) => setCust(e.target.value)} style={sel}><option value="">Customer — all</option>{uniq((r) => r.cust).map((x) => <option key={x}>{x}</option>)}</select>
        <select value={fam} onChange={(e) => setFam(e.target.value)} style={sel}><option value="">Family — all</option>{uniq((r) => r.fam).map((x) => <option key={x}>{x}</option>)}</select>
        <select value={stage} onChange={(e) => setStage(e.target.value)} style={sel}><option value="">Stage — all</option><option value="live">Live jobs</option><option value="delivered">Delivered</option>{uniq((r) => r.stat).map((x) => <option key={x} value={x}>{x}</option>)}</select>
        <select value={openOnly} onChange={(e) => setOpenOnly(e.target.value)} style={sel}><option value="">Tickets — all</option><option value="open">With an open ticket</option><option value="closed">All tickets closed</option></select>
        {any && <button onClick={() => { setQ(""); setOwn(""); setCust(""); setFam(""); setStage(""); setOpenOnly(""); }} className="text-xs font-bold" style={{ color: "var(--accent)" }}>✕ clear</button>}
        <span className="text-xs" style={{ color: MUTED }}>{rows ? `${list.length} of ${rows.length} jobs · ${list.reduce((a, r) => a + r.open, 0)} open tickets` : ""}</span>
      </div>
      {!rows && <div className="text-sm" style={{ color: MUTED }}>Reading every job and ticket…</div>}
      {rows && (
        <div className="rounded-lg bg-white" style={{ border: `1px solid ${LINE}`, overflow: "auto", maxHeight: "72vh" }}>
          <table className="genie-table" style={{ minWidth: 1180 }}>
            <thead><tr>{COLS.map(([k, l]) => (
              <th key={k} onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : (k === "tickets" || k === "open" || k === "cost" || k === "last" ? -1 : 1) }))} style={{ cursor: "pointer", whiteSpace: "nowrap", ...(k === "id" ? { position: "sticky", left: 0, zIndex: 3 } : {}) }}>
                {l}<span style={{ opacity: sort.k === k ? 1 : 0.35, marginLeft: 4, fontSize: 10 }}>{sort.k === k ? (sort.dir === 1 ? "▲" : "▼") : "↕"}</span>
              </th>))}</tr></thead>
            <tbody>
              {list.slice(0, 1500).map((r) => (
                <tr key={r.id} onClick={() => setOpen(r)} style={{ cursor: "pointer" }}>
                  <td className="tnum font-bold" style={{ position: "sticky", left: 0, background: "#fff", color: NAVY }}>{r.id}{r.live && <span className="ml-1 text-xs rounded px-1" style={{ background: "#DCFCE7", color: "var(--green)" }}>live</span>}</td>
                  <td className="text-xs" style={{ maxWidth: 240 }}>{r.tag || (r.known ? "" : <span style={{ color: MUTED }}>not on Genie&apos;s job list</span>)}</td>
                  <td style={{ maxWidth: 220 }}>{r.cust}</td>
                  <td className="text-xs">{r.fam}</td>
                  <td className="text-xs">{r.own}</td>
                  <td className="text-xs">{r.stat}</td>
                  <td className="tnum text-xs">{dmy(r.delivered_on)}</td>
                  <td className="tnum font-bold">{r.tickets}</td>
                  <td className="tnum font-bold" style={{ color: r.open ? RED : MUTED }}>{r.open || "—"}</td>
                  <td className="tnum text-xs">{dmy(r.last)}</td>
                  <td className="tnum text-xs">{inr(r.cost)}</td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={11} style={{ color: MUTED, padding: 16 }}>No job matches.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {list.length > 1500 && <div className="text-xs mt-1" style={{ color: MUTED }}>Showing 1,500 — filter to narrow.</div>}
      {open && <JobTickets job={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function JobTickets({ job, onClose }: { job: J; onClose: () => void }) {
  const [t, setT] = useState<T[] | null>(null);
  useEffect(() => { fetch(`/api/seva/jobs?job=${job.id}`, { cache: "no-store" }).then((r) => r.json()).then((j) => setT(j.tickets || [])).catch(() => setT([])); }, [job.id]);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 50, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(820px, 100vw)", height: "100vh", overflowY: "auto", background: "var(--paper)", padding: 18 }}>
        <div className="flex items-start mb-2"><div><b style={{ fontSize: 18, color: NAVY }}>Job {job.id}</b><div className="text-sm" style={{ color: "var(--dim)" }}>{job.cust}{job.tag ? ` · ${job.tag}` : ""}{job.fam ? ` · ${job.fam}` : ""}</div><div className="text-xs" style={{ color: MUTED }}>{job.stat}{job.delivered_on ? ` · delivered ${dmy(job.delivered_on)}` : ""}{job.own ? ` · owner ${job.own}` : ""}</div></div><button onClick={onClose} className="ml-auto font-bold" style={{ color: MUTED }}>✕</button></div>
        {!t && <div className="text-sm" style={{ color: MUTED }}>Reading…</div>}
        {t && (
          <table className="genie-table" style={{ width: "100%" }}>
            <thead><tr><th>Ticket</th><th>Date</th><th>Type</th><th>Status</th><th>Engineer</th><th>Pending action</th><th>Cost</th></tr></thead>
            <tbody>{t.map((x) => (
              <tr key={x.id}>
                <td><a href={`https://nandanerp.in/app/issue/${encodeURIComponent(x.erp_name)}`} target="_blank" rel="noreferrer" className="font-bold hover:underline" style={{ color: "var(--blue)" }}>{x.erp_name} ↗</a><div className="text-xs">{x.title}</div></td>
                <td className="tnum text-xs">{dmy(x.issue_date || x.at)}</td>
                <td className="text-xs">{x.type_of_support}</td>
                <td className="text-xs font-bold" style={{ color: /closed|resolved/i.test(x.status) ? "var(--green)" : RED }}>{x.status}</td>
                <td className="text-xs">{String(x.attended_by || x.handled_by || "").split("@")[0] || "—"}</td>
                <td className="text-xs">{x.pending_action_status || "—"}</td>
                <td className="tnum text-xs">{inr(Number(x.cost_spent) || 0)}</td>
              </tr>))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
