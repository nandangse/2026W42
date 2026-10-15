"use client";
/**
 * THE QUERY SOLVER IN NANDAN TASKING (Dr Raghu, 15 Oct 2026): every query in
 * Genie, by project — "Project : project name - Client - QueryNo - Raised date
 * - Query" — with its type (client / ours), whether the client sees it, who
 * it is assigned to, the department, the due date and its state. Open to
 * Dr Raghu, Tushar and Pankaj ("let Tushar and Pankaj and me see it").
 *
 * LIVE CLIENTS below it: the customers who have a portal door — people who
 * can sign in, the last time one did, and the queries shared with them.
 */
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { fmtFull } from "@/lib/schedule";


type QRow = { id: string; kind: "erp" | "manual"; query_no: number | null; query_kind: "client" | "ours" | null; client_shared: boolean; project_id: string | null; client: string | null; job_id: string | null; job_tag: string | null; raised_on: string | null; title: string; detail: string; who: string; cat: string; esc: string; due: string | null; done: boolean };
type Client = { slug: string; name: string; active: boolean; match_names: string[]; people: number; last_login: string | null; open_queries: number; queries: number };
const qn = (n: number | null) => (n ? `Q-${String(n).padStart(4, "0")}` : "—");
const KIND: Record<string, { label: string; bg: string; fg: string }> = { client: { label: "Client", bg: "#FFF3E8", fg: "#B26A00" }, ours: { label: "Ours", bg: "#E8F0F8", fg: "var(--blue)" } };
const TODAY = new Date().toISOString().slice(0, 10);

export function QuerySolverView({ onOpenTask }: { onOpenTask: (id: string, kind: "erp" | "manual") => void }) {
  const [rows, setRows] = useState<QRow[] | null>(null); const [installed, setInstalled] = useState(true); const [err, setErr] = useState("");
  const [kind, setKind] = useState<"all" | "client" | "ours">("all"); const [showDone, setShowDone] = useState(false); const [q, setQ] = useState("");
  useEffect(() => { api.get("/api/query-solver").then((r) => { setInstalled(r.installed !== false); setRows(r.rows || []); }).catch((e) => setErr(String(e.message || e))); }, []);
  if (err) return <div className="text-sm p-4" style={{ color: "var(--red)" }}>{err}</div>;
  if (!rows) return <div className="text-sm p-4" style={{ color: "var(--muted)" }}>Reading the queries…</div>;
  const needle = q.trim().toLowerCase();
  const shown = rows.filter((r) => (kind === "all" || r.query_kind === kind) && (showDone || !r.done) && (!needle || `${r.title} ${r.detail} ${r.client || ""} ${r.project_id || ""} ${r.who}`.toLowerCase().includes(needle)));
  const byProject = new Map<string, QRow[]>();
  for (const r of shown) { const k = r.project_id || "No project"; (byProject.get(k) ?? byProject.set(k, []).get(k)!).push(r); }
  return (
    <div className="grid gap-3">
      {!installed && <div className="rounded-lg border p-3 text-sm" style={{ borderColor: "#F0D9A8", background: "#FFF8EC", color: "#B26A00" }}>Run migration <b>0235_query_solver.sql</b> — until then no task can carry the Query Solver tick.</div>}
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 query, client, project, assignee" className="border rounded px-2 py-1" style={{ borderColor: "var(--line)", minWidth: 260 }} />
        {(["all", "client", "ours"] as const).map((k) => <button key={k} onClick={() => setKind(k)} className="rounded px-2 py-1 font-bold" style={kind === k ? { background: "var(--ink)", color: "#fff" } : { border: "1px solid var(--line)", color: "var(--dim)" }}>{k === "all" ? `All · ${rows.filter((r) => showDone || !r.done).length}` : k === "client" ? `Client's · ${rows.filter((r) => r.query_kind === "client" && (showDone || !r.done)).length}` : `Ours · ${rows.filter((r) => r.query_kind === "ours" && (showDone || !r.done)).length}`}</button>)}
        <label className="flex items-center gap-1"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> show closed</label>
        <span style={{ color: "var(--muted)" }}>· a query is a task with the Query Solver tick — open the task to change it</span>
      </div>
      {[...byProject.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([proj, list]) => (
        <div key={proj} className="bg-white rounded-lg border" style={{ borderColor: "var(--line)" }}>
          <div className="px-3 py-2 flex items-baseline gap-2 flex-wrap" style={{ background: "var(--navy)", color: "#fff", borderRadius: "8px 8px 0 0" }}>
            <b className="text-sm">{proj}</b>
            <span className="text-xs opacity-80">{[...new Set(list.map((r) => r.client).filter(Boolean))].join(" · ") || "—"}</span>
            <span className="text-xs opacity-70 ml-auto">{list.filter((r) => !r.done).length} open · {list.filter((r) => r.client_shared).length} shared with the client</span>
            {proj !== "No project" && <a href={`/project/${encodeURIComponent(proj)}`} target="_blank" rel="noreferrer" className="text-xs font-bold underline" style={{ color: "#FFD9A8" }}>project book ↗</a>}
          </div>
          <table className="w-full text-xs genie-table">
            <thead><tr style={{ background: "#F4F2EC", color: "var(--dim)" }}>
              <th className="px-2 py-1.5 text-left" style={{ width: 70 }}>Query no</th><th className="px-2 py-1.5 text-left" style={{ width: 95 }}>Raised</th><th className="px-2 py-1.5 text-left">Query</th>
              <th className="px-2 py-1.5 text-left" style={{ width: 70 }}>Type</th><th className="px-2 py-1.5 text-left" style={{ width: 90 }}>Client shared</th><th className="px-2 py-1.5 text-left" style={{ width: 110 }}>Assigned</th>
              <th className="px-2 py-1.5 text-left" style={{ width: 100 }}>Department</th><th className="px-2 py-1.5 text-left" style={{ width: 95 }}>Due</th><th className="px-2 py-1.5 text-left" style={{ width: 70 }}>State</th>
            </tr></thead>
            <tbody>
              {list.map((r, i) => (
                <tr key={r.id} onClick={() => onOpenTask(r.id, r.kind)} className="cursor-pointer" title="Open the task" style={{ borderTop: "1px solid #EFEDE7", background: i % 2 ? "#FAF9F5" : "#fff", opacity: r.done ? .55 : 1 }}>
                  <td className="px-2 py-1.5 font-bold tnum" style={{ color: "var(--blue)" }}>{qn(r.query_no)}</td>
                  <td className="px-2 py-1.5 tnum">{r.raised_on ? fmtFull(r.raised_on) : "—"}</td>
                  <td className="px-2 py-1.5"><b style={{ color: "var(--ink)" }}>{r.title}</b>{r.detail && <div style={{ color: "var(--dim)" }}>{r.detail}</div>}{r.job_tag && <div style={{ color: "#B8B5AC" }}>{r.job_id?.slice(-4)} · {r.job_tag}</div>}</td>
                  <td className="px-2 py-1.5">{r.query_kind ? <span className="rounded px-1.5 py-0.5 font-bold" style={{ background: KIND[r.query_kind].bg, color: KIND[r.query_kind].fg }}>{KIND[r.query_kind].label}</span> : "—"}</td>
                  <td className="px-2 py-1.5">{r.client_shared ? <span style={{ color: "var(--green)", fontWeight: 700 }}>✓ Yes</span> : <span style={{ color: "var(--muted)" }}>No</span>}</td>
                  <td className="px-2 py-1.5">{r.who}</td><td className="px-2 py-1.5" style={{ color: "var(--dim)" }}>{r.cat}</td>
                  <td className="px-2 py-1.5 tnum" style={{ color: r.due && !r.done && r.due < TODAY ? "var(--red)" : "var(--ink)", fontWeight: r.due && !r.done && r.due < TODAY ? 700 : 400 }}>{r.due ? fmtFull(r.due) : "—"}</td>
                  <td className="px-2 py-1.5"><span className="rounded px-1.5 py-0.5 font-bold" style={r.done ? { background: "#E8F3E9", color: "var(--green)" } : { background: "#FFF3E8", color: "#B26A00" }}>{r.done ? "Closed" : "Open"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {shown.length === 0 && <div className="bg-white rounded-lg border p-6 text-center text-sm" style={{ borderColor: "var(--line)", color: "var(--muted)" }}>No query yet. Tick <b>Query Solver</b> on any task, or raise one on a project&apos;s Query Solver tab.</div>}
    </div>
  );
}

export function LiveClientsView() {
  const [rows, setRows] = useState<Client[] | null>(null); const [err, setErr] = useState(""); const [live, setLive] = useState(true);
  useEffect(() => { api.get("/api/query-solver?clients=1").then((r) => setRows(r.clients || [])).catch((e) => setErr(String(e.message || e))); }, []);
  if (err) return <div className="text-sm p-4" style={{ color: "var(--red)" }}>{err}</div>;
  if (!rows) return <div className="text-sm p-4" style={{ color: "var(--muted)" }}>Reading the clients…</div>;
  const isLive = (c: Client) => c.active && c.people > 0;
  const shown = rows.filter((c) => !live || isLive(c));
  return (
    <div className="bg-white rounded-lg border" style={{ borderColor: "var(--line)" }}>
      <div className="px-3 py-2 flex items-center gap-2 flex-wrap text-xs">
        <b className="text-sm" style={{ color: "var(--ink)" }}>Clients with a portal door</b>
        {([[true, `Live clients · ${rows.filter(isLive).length}`], [false, `All · ${rows.length}`]] as const).map(([v, l]) => <button key={String(v)} onClick={() => setLive(v)} className="rounded px-2 py-1 font-bold" style={live === v ? { background: "var(--ink)", color: "#fff" } : { border: "1px solid var(--line)", color: "var(--dim)" }}>{l}</button>)}
        <span style={{ color: "var(--muted)" }}>· live = active, with a person who can sign in</span>
        <a href="/portal/all/settings" target="_blank" rel="noreferrer" className="ml-auto font-bold underline" style={{ color: "var(--blue)" }}>+ Create a client&apos;s portal ↗</a>
      </div>
      <table className="w-full text-xs genie-table">
        <thead><tr style={{ background: "var(--ink)", color: "#fff" }}><th className="px-2 py-2 text-left">Client</th><th className="px-2 py-2 text-left">Portal</th><th className="px-2 py-2 text-left">Names on the jobmaster</th><th className="px-2 py-2 text-center">People</th><th className="px-2 py-2 text-left">Last sign-in</th><th className="px-2 py-2 text-center">Queries shared</th><th className="px-2 py-2 text-center">Open</th></tr></thead>
        <tbody>
          {shown.map((c, i) => (
            <tr key={c.slug} style={{ borderTop: "1px solid #EFEDE7", background: i % 2 ? "#FAF9F5" : "#fff", opacity: c.active ? 1 : .55 }}>
              <td className="px-2 py-1.5 font-bold" style={{ color: "var(--ink)" }}>{c.name}{isLive(c) && <span className="ml-1 rounded px-1 text-xs" style={{ background: "#E8F3E9", color: "var(--green)" }}>live</span>}</td>
              <td className="px-2 py-1.5"><a href={`/portal/${c.slug}`} target="_blank" rel="noreferrer" className="underline" style={{ color: "var(--blue)" }}>/portal/{c.slug}</a></td>
              <td className="px-2 py-1.5" style={{ color: "var(--dim)" }}>{c.match_names.join(" · ") || "—"}</td>
              <td className="px-2 py-1.5 text-center tnum">{c.people}</td>
              <td className="px-2 py-1.5 tnum">{c.last_login ? fmtFull(c.last_login.slice(0, 10)) : "never"}</td>
              <td className="px-2 py-1.5 text-center tnum">{c.queries}</td>
              <td className="px-2 py-1.5 text-center tnum font-bold" style={{ color: c.open_queries ? "#B26A00" : "var(--muted)" }}>{c.open_queries}</td>
            </tr>
          ))}
          {shown.length === 0 && <tr><td colSpan={7} className="p-6 text-center" style={{ color: "var(--muted)" }}>{rows.length ? "No live client yet." : "No client has a portal yet — create one from the portal's Settings: the name makes the slug (Veda Aeronautics → veda-aeronautics), then pick the names it goes by on the jobmaster."}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
