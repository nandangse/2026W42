"use client";
/**
 * SEVA → INSTALLATION (Dr Raghu, 12 Oct 2026: "make a sub module called
 * Installation. Show jobs in installation. Deploy people there.")
 *
 * The jobs the ERP has at installation; who is deployed on each — today, coming,
 * done — and Deploy: the people, from and to, the site. Each day of each
 * person is a line on the Team Plan Deployment roster, kind Installation.
 */
import { useEffect, useState } from "react";

type Cost = { mandays_at_site: number | null; transport_cost: number | null; site_expense: number | null; total_site_expense: number | null; install_started_on: string | null; installed_on: string | null; delivery_location: string | null; installation_engineer: string | null };
type Job = { id: string; tag: string; fam: string; cust: string; own: string; stat: string; status: string; delivered_on: string | null; tickets: number; open: number; cost: Cost | null };
const rs = (n?: number | null) => (n ? "₹" + Math.round(n).toLocaleString("en-IN") : "—");
const costOf = (c: Cost | null) => (c ? Number(c.total_site_expense) || (Number(c.transport_cost) || 0) + (Number(c.site_expense) || 0) : 0);
type Plan = { id: string; on_date: string; employee_id: string; person_name: string; status: string; site: string; notes: string; job_id: string };
type Person = { id: string; name: string; designation: string | null };
type D = { installed: boolean; today: string; jobs: Job[]; plans: Plan[]; team: Person[]; mayPlan: boolean };
const NAVY = "var(--navy)", MUTED = "var(--muted)", LINE = "var(--line)", GREEN = "var(--green)", RED = "var(--red)", ORANGE = "var(--accent)";
const dmy = (d?: string | null) => (d ? new Date(d.slice(0, 10) + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—");
const inp: React.CSSProperties = { width: "100%", border: `1px solid ${LINE}`, borderRadius: 7, padding: "6px 9px", fontSize: 13, background: "#fff" };
const lbl: React.CSSProperties = { display: "block", fontSize: 10.5, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--dim)", marginBottom: 3 };
const btn = (p?: boolean): React.CSSProperties => ({ borderRadius: 7, padding: "5px 11px", fontSize: 12.5, fontWeight: 700, border: `1px solid ${p ? "var(--accent)" : LINE}`, background: p ? "var(--accent)" : "#fff", color: p ? "#fff" : NAVY });

async function post(body: unknown) {
  const r = await fetch("/api/seva/installation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `Failed (${r.status})`); return j;
}

export default function SevaInstallation() {
  const [d, setD] = useState<D | null>(null);
  const [q, setQ] = useState("");
  const [deploy, setDeploy] = useState<Job | null>(null);
  const load = () => fetch("/api/seva/installation", { cache: "no-store" }).then((r) => r.json()).then(setD).catch(() => setD(null));
  useEffect(() => { load(); }, []);
  if (!d) return <div className="text-sm" style={{ color: MUTED }}>Reading…</div>;
  const t = q.trim().toLowerCase();
  const jobs = d.jobs.filter((j) => !t || [j.id, j.tag, j.cust, j.fam, j.stat].some((v) => String(v || "").toLowerCase().includes(t)));
  const of = (id: string) => d.plans.filter((p) => p.job_id === id);
  const people = (ps: Plan[]) => [...new Map(ps.map((p) => [p.employee_id, p.person_name])).values()];
  return (
    <div>
      <div className="flex items-baseline gap-2 flex-wrap mb-2">
        <h2 className="font-bold" style={{ fontSize: 20, color: NAVY }}>Installation</h2>
        <span className="text-xs" style={{ color: MUTED }}>the jobs the ERP has at installation, and who is deployed on them</span>
        <span className="ml-auto" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search job / customer…" style={{ ...inp, width: 240 }} />
      </div>
      {!d.installed && <div className="text-sm font-bold mb-2" style={{ color: RED }}>Run migration 0226 first — deploying needs it. The jobs show below meanwhile.</div>}
      <div className="text-xs mb-2" style={{ color: MUTED }}>{jobs.length} job{jobs.length === 1 ? "" : "s"} at installation · <b style={{ color: NAVY }}>cost so far {rs(jobs.reduce((s, j) => s + costOf(j.cost), 0))}</b> on the ERP · {jobs.filter((j) => of(j.id).some((p) => p.on_date >= d.today && p.status === "planned")).length} with people deployed now or coming</div>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))" }}>
        {jobs.map((j) => {
          const ps = of(j.id); const now = ps.filter((p) => p.on_date === d.today); const coming = ps.filter((p) => p.on_date > d.today && p.status !== "cancelled"); const past = ps.filter((p) => p.on_date < d.today);
          return (
            <div key={j.id} className="rounded-lg bg-white p-3" style={{ border: `1px solid ${LINE}`, borderLeft: `4px solid ${now.length ? GREEN : coming.length ? ORANGE : RED}` }}>
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <a href={`https://nandanerp.in/app/jobmaster/${j.id}`} target="_blank" rel="noreferrer" className="font-bold tnum hover:underline" style={{ color: "var(--blue)" }}>{j.id} ↗</a>
                  <div className="font-bold" style={{ color: NAVY }}>{j.cust}</div>
                  <div className="text-xs" style={{ color: MUTED }}>{j.tag}{j.fam ? ` · ${j.fam}` : ""}</div>
                  <div className="text-xs mt-0.5"><span className="rounded px-1.5 font-bold" style={{ background: "#FFF7ED", color: "#9A3412" }}>{j.stat || j.status}</span>{j.delivered_on ? <span style={{ color: MUTED }}> · delivered {dmy(j.delivered_on)}</span> : null}{j.tickets ? <span style={{ color: j.open ? RED : MUTED }}> · {j.tickets} ticket{j.tickets === 1 ? "" : "s"}{j.open ? `, ${j.open} open` : ""}</span> : null}</div>
                </div>
                {d.mayPlan && d.installed && <button onClick={() => setDeploy(j)} style={btn(true)}>+ Deploy</button>}
              </div>
              <div className="mt-2 text-xs grid gap-0.5">
                <div><b style={{ color: GREEN }}>Today:</b> {now.length ? people(now).join(", ") : <span style={{ color: MUTED }}>nobody</span>}</div>
                {coming.length > 0 && <div><b style={{ color: ORANGE }}>Coming:</b> {people(coming).join(", ")} <span style={{ color: MUTED }}>· {dmy(coming[0].on_date)} – {dmy(coming[coming.length - 1].on_date)}</span></div>}
                {past.length > 0 && <div style={{ color: MUTED }}>Done so far: {past.length} man-day{past.length === 1 ? "" : "s"} by {people(past).join(", ")}</div>}
                {(now[0]?.site || coming[0]?.site || j.cost?.delivery_location) && <div style={{ color: MUTED }}>📍 {now[0]?.site || coming[0]?.site || j.cost?.delivery_location}</div>}
                {/* the cost incurred, as the ERP's Jobmaster has it */}
                <div className="mt-1 rounded px-2 py-1" style={{ background: "#F8FAFC", border: `1px solid ${LINE}` }}>
                  <b style={{ color: NAVY }}>Cost {rs(costOf(j.cost))}</b>
                  <span style={{ color: MUTED }}> · transport {rs(j.cost?.transport_cost)} · site {rs(j.cost?.site_expense)} · {j.cost?.mandays_at_site ? `${j.cost.mandays_at_site} man-days at site (ERP)` : "man-days not on the ERP"}{past.length ? ` · ${past.length} planned here` : ""}</span>
                  {(j.cost?.install_started_on || j.cost?.installation_engineer) && <div style={{ color: MUTED }}>{j.cost?.install_started_on ? `started ${dmy(j.cost.install_started_on)}` : ""}{j.cost?.installation_engineer ? ` · ${j.cost.installation_engineer}` : ""}</div>}
                </div>
              </div>
            </div>
          );
        })}
        {jobs.length === 0 && <div className="text-sm" style={{ color: MUTED }}>No job is at installation on the ERP.</div>}
      </div>
      {deploy && <Deploy d={d} job={deploy} onClose={(ch) => { setDeploy(null); if (ch) load(); }} />}
    </div>
  );
}

function Deploy({ d, job, onClose }: { d: D; job: Job; onClose: (changed: boolean) => void }) {
  const [x, setX] = useState({ employee_ids: [] as string[], from: d.today, to: d.today, site: "", notes: "" });
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const days = Math.max(1, Math.round((Date.parse(x.to) - Date.parse(x.from)) / 864e5) + 1);
  const save = async () => { setErr(null); setBusy(true); try { await post({ action: "deploy", job_id: job.id, ...x }); onClose(true); } catch (e) { setErr(String((e as Error).message)); } setBusy(false); };
  return (
    <div onClick={() => onClose(false)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="rounded-xl" style={{ width: "min(640px, 100%)", maxHeight: "92vh", overflowY: "auto", background: "var(--paper)", padding: 18 }}>
        <b style={{ fontSize: 17, color: NAVY }}>Deploy on job {job.id}</b>
        <div className="text-sm mb-3" style={{ color: MUTED }}>{job.cust}{job.tag ? ` · ${job.tag}` : ""}</div>
        <label style={lbl}>Who goes</label>
        <div className="flex gap-1 flex-wrap">{d.team.map((p) => <button key={p.id} onClick={() => setX({ ...x, employee_ids: x.employee_ids.includes(p.id) ? x.employee_ids.filter((i) => i !== p.id) : [...x.employee_ids, p.id] })} title={p.designation || ""} className="rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: x.employee_ids.includes(p.id) ? NAVY : "#fff", color: x.employee_ids.includes(p.id) ? "#fff" : NAVY, border: `1px solid ${LINE}` }}>{p.name}</button>)}</div>
        <div className="grid gap-2 mt-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div><label style={lbl}>From</label><input type="date" style={inp} value={x.from} onChange={(e) => setX({ ...x, from: e.target.value, to: e.target.value > x.to ? e.target.value : x.to })} /></div>
          <div><label style={lbl}>To</label><input type="date" style={inp} value={x.to} min={x.from} onChange={(e) => setX({ ...x, to: e.target.value })} /></div>
        </div>
        <label style={{ ...lbl, marginTop: 10 }}>Site</label><input style={inp} value={x.site} onChange={(e) => setX({ ...x, site: e.target.value })} placeholder="Where the machine is being put up" />
        <label style={{ ...lbl, marginTop: 10 }}>Notes</label><textarea style={{ ...inp, minHeight: 56 }} value={x.notes} onChange={(e) => setX({ ...x, notes: e.target.value })} />
        {err && <div className="text-sm font-bold mt-2" style={{ color: RED }}>{err}</div>}
        <div className="flex gap-2 mt-3 items-center">
          <button onClick={save} disabled={busy || !x.employee_ids.length} style={btn(true)}>{busy ? "Deploying…" : `Deploy ${x.employee_ids.length || ""} for ${days} day${days === 1 ? "" : "s"}`}</button>
          <button onClick={() => onClose(false)} style={btn()}>Cancel</button>
          <span className="text-xs ml-auto" style={{ color: MUTED }}>Shows on Team Plan Deployment too.</span>
        </div>
      </div>
    </div>
  );
}
