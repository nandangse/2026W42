"use client";
// split out of PlanningSuite.tsx (Genie 5.0.1.1) — one file per tab, loaded when opened
import React, { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "@/lib/api";

import { TRADES, type Crew } from "@/lib/templates";
import { today, fmtFull, jobNo, whoTag, addDays, escalated } from "@/lib/schedule";

import { MatBox, type Mat } from "../MaterialKitting";

import { Board, Job, TODAY, Task, assignees, taskJobRef, taskLate } from "./shared";
import { TaskModal } from "./Tasking";

/**
 * The walk sheet's crew table, on screen: PLAN — the current stage's crew
 * from the milestone plan — over TODAY, what the floor recorded, in bold.
 * Below the job number on On Floor, exactly where the print puts it.
 */
export function FloorCrewTable({ plan, today: rec }: { plan: Partial<Crew> | null; today: Crew | null }) {
  return (
    <CrewRowsTable rows={[
      { label: "plan", crew: plan },
      { label: "today", crew: rec && Object.values(rec).some((n) => Number(n) > 0) ? rec : null, bold: true },
    ]} />
  );
}

/** The crew table itself — any rows, walk-sheet styling. */
export function CrewRowsTable({ rows }: { rows: { label: string; crew: Partial<Crew> | null; bold?: boolean }[] }) {
  const cell: React.CSSProperties = {
    border: "1px solid #E2E0DA", padding: "1px 6px", textAlign: "right", fontVariantNumeric: "tabular-nums",
  };
  return (
    <table className="genie-table" style={{ borderCollapse: "collapse", fontSize: 11, display: "inline-table", background: "#fff" }}>
      <thead>
        <tr style={{ background: "#F4F2EC" }}>
          <th style={{ ...cell, textAlign: "left", fontSize: 9 }}></th>
          {TRADES.map((t) => (
            <th key={t.key} style={{ ...cell, color: t.color, fontSize: 10 }}>{t.tiny}</th>
          ))}
          <th style={{ ...cell, fontSize: 10 }}>Tot</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const tot = r.crew ? TRADES.reduce((n, t) => n + (Number(r.crew?.[t.key]) || 0), 0) : 0;
          return (
            <tr key={r.label} style={r.bold ? { fontWeight: 700 } : undefined}>
              <td style={{ ...cell, textAlign: "left", color: "var(--muted)", fontSize: 9 }}>{r.label}</td>
              {TRADES.map((t) => (
                <td key={t.key} style={{ ...cell, color: r.crew && Number(r.crew[t.key]) ? "var(--ink)" : "#C9C6BD" }}>
                  {r.crew ? Number(r.crew[t.key]) || 0 : "—"}
                </td>
              ))}
              <td style={cell}>{r.crew ? <b>{tot}</b> : "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function StatCard({ label, value, sub, color = "var(--ink)" }: { label: string; value: string; sub?: string; color?: string }) {
  // Slimmed 25 Aug 2026 — seven of these stand in one row on On Floor now.
  return (
    <div className="bg-white rounded-lg border px-2.5 py-1.5" style={{ borderColor: "var(--line)", borderTop: `3px solid ${color}` }}>
      <div className="font-bold" style={{ color: "var(--muted)", fontSize: 10, letterSpacing: ".03em" }}>{label}</div>
      <div className="text-lg font-bold tnum" style={{ color, lineHeight: 1.25 }}>{value}</div>
      {sub && <div style={{ color: "var(--muted)", fontSize: 10.5, lineHeight: 1.35 }}>{sub}</div>}
    </div>
  );
}

/**
 * Every kitting line still outstanding, across every job, in one table.
 *
 * The job page already shows a job's own material. This answers the other
 * question — "what is holding up the next month of deliveries" — which nobody
 * could ask without opening forty jobs one at a time.
 *
 * It opens on the next THIRTY DAYS rather than everything. The whole book is
 * 150 lines and most of it is not urgent; a list that opens with all of it is
 * a list that gets skimmed. The horizon is a dropdown, and "All" is in it.
 */
export function PendingMaterial({
  board,
  onOpen,
  reload,
  canEdit,
}: {
  board: Board;
  onOpen: (id: string) => void;
  reload: () => Promise<Board | null>;
  canEdit: boolean;
}) {
  const HORIZONS: [string, string][] = [
    ["30", "Delivery within 30 days"],
    ["60", "Delivery within 60 days"],
    ["90", "Delivery within 90 days"],
    ["all", "All jobs"],
  ];
  const [horizon, setHorizon] = useState("30");
  const [q, setQ] = useState("");
  /**
   * The filters Dr Raghu asked for (28 Aug 2026): project, job, assigned-to
   * and status. Status defaults to the two states that mean "still short" —
   * Yet to receive and QC Defective — which is what this board has always
   * shown; the filter just makes the default visible and changeable.
   */
  const [fProj, setFProj] = useState("all");
  const [fJob, setFJob] = useState("all");
  const [fWho, setFWho] = useState("all");
  const [fStatus, setFStatus] = useState("open"); // open = Yet to receive + QC Defective
  const [sortKey, setSortKey] = useState<"" | "job" | "tdd" | "item" | "due" | "status" | "who">("");
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  /** The line whose own box is open. Same box the job page uses. */
  const [picked, setPicked] = useState<{ jobId: string; mat: Mat } | null>(null);

  const jobById = useMemo(() => new Map(board.jobs.map((j) => [j.id, j])), [board.jobs]);

  /** Every line in the horizon BEFORE the narrower filters — the option lists
      come off this so a filter never hides its own choices. */
  const pool = useMemo(() => {
    const cutoff = horizon === "all" ? null : addDays(TODAY, Number(horizon));
    const out: { job: Job; m: Board["materials"][string][number] }[] = [];
    for (const [jobId, list] of Object.entries(board.materials || {})) {
      const job = jobById.get(jobId);
      if (!job) continue;                       // delivered or archived
      if (cutoff && (!job.tdd || job.tdd > cutoff)) continue;
      for (const m of list) out.push({ job, m });
    }
    return out;
  }, [board.materials, jobById, horizon]);

  const projOptions = useMemo(() => [...new Set(pool.map((r) => (r.job.proj || "").trim()).filter(Boolean))].sort(), [pool]);
  const jobOptions = useMemo(() => [...new Map(pool.map((r) => [r.job.id, r.job])).values()].sort((a, b) => a.id.localeCompare(b.id)), [pool]);
  const whoOptions = useMemo(() => [...new Set(pool.map((r) => String(r.m.who || "").trim()).filter(Boolean))].sort(), [pool]);

  const rows = useMemo(() => {
    const st = (m: { status?: string | null }) => String(m.status || "Yet to receive").toLowerCase();
    let out = pool.filter(({ job, m }) => {
      if (fStatus === "open") { if (st(m) === "received") return false; }
      else if (fStatus === "yet" && st(m) !== "yet to receive") return false;
      else if (fStatus === "defect" && !st(m).includes("defect")) return false;
      else if (fStatus === "received" && st(m) !== "received") return false;
      if (fProj !== "all" && (job.proj || "").trim() !== fProj) return false;
      if (fJob !== "all" && job.id !== fJob) return false;
      if (fWho !== "all" && String(m.who || "").trim() !== fWho) return false;
      return true;
    });
    const needle = q.trim().toLowerCase();
    if (needle)
      out = out.filter((r) =>
        jobNo(r.job.id).includes(needle) ||
        r.job.tag.toLowerCase().includes(needle) ||
        String(r.m.item || "").toLowerCase().includes(needle));
    // Soonest delivery first is the resting order — this is a list you work
    // down. A clicked header re-orders it until cleared.
    const base = (a: (typeof out)[number], b: (typeof out)[number]) =>
      String(a.job.tdd || "9999").localeCompare(String(b.job.tdd || "9999"));
    if (!sortKey) return out.sort(base);
    const key = (r: (typeof out)[number]): string => {
      switch (sortKey) {
        case "job": return jobNo(r.job.id);
        case "tdd": return r.job.tdd || "9999";
        case "item": return String(r.m.item || "").toLowerCase();
        case "due": return r.m.due || "9999";
        case "status": return String(r.m.status || "Yet to receive").toLowerCase();
        case "who": return String(r.m.who || "").toLowerCase();
        default: return "";
      }
    };
    return out.sort((a, b) => sortDir * key(a).localeCompare(key(b)) || base(a, b));
  }, [pool, fProj, fJob, fWho, fStatus, q, sortKey, sortDir]);

  const clickSort = (k: typeof sortKey) => {
    if (sortKey === k) { if (sortDir === 1) setSortDir(-1); else { setSortKey(""); setSortDir(1); } }
    else { setSortKey(k); setSortDir(1); }
  };
  const MTh = ({ k, label, align = "left" }: { k: typeof sortKey; label: string; align?: string }) => (
    <th className={`px-2 py-2 text-${align}`} style={{ position: "sticky", top: 0, zIndex: 3, background: "var(--ink)", cursor: k ? "pointer" : "default", whiteSpace: "nowrap" }}
      onClick={k ? () => clickSort(k) : undefined}
      title={k ? "Click to sort — again to flip, a third time to clear" : undefined}>
      {label}{sortKey === k && k ? (sortDir === 1 ? " ▲" : " ▼") : ""}
    </th>
  );

  const save = async (m: { id: string }, patch: Record<string, unknown>) => {
    setBusy(m.id); setMsg("");
    try {
      await api.post("/api/materials", { action: "update", id: m.id, ...patch });
      await reload();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    setBusy(null);
  };

  /**
   * PRINT WHAT IS ON THE SCREEN (Dr Raghu, 7 Sep 2026: "give a download
   * button to download as PDF the filtered view as its seen on screen in
   * the sort order and filter order").
   *
   * It walks `rows` — the same array the table renders, already filtered and
   * already sorted — so the sheet cannot disagree with the screen. The
   * filters in force are printed at the top, because a list of shortages
   * with no statement of what it excludes is a dangerous thing to carry into
   * a meeting.
   */
  const printPdf = () => {
    const esc = (v: unknown) => String(v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
    const horizonLabel = HORIZONS.find(([k]) => k === horizon)?.[1] || horizon;
    const statusLabel = ({ open: "Yet to receive + QC Defective", yet: "Yet to receive only", defect: "QC Defective only", received: "Received", all: "Every status" } as Record<string, string>)[fStatus] || fStatus;
    const bits = [horizonLabel, `status: ${statusLabel}`];
    if (q.trim()) bits.push(`search: "${q.trim()}"`);
    if (fProj !== "all") bits.push(`project: ${fProj}`);
    if (fJob !== "all") bits.push(`job: ${jobNo(fJob)}`);
    if (fWho !== "all") bits.push(`with: ${fWho}`);
    if (sortKey) bits.push(`sorted by ${sortKey}${sortDir === -1 ? " (descending)" : ""}`);
    const body = rows.map((r) => {
      const overdue = !!r.m.due && r.m.due < TODAY;
      return `<tr${overdue ? ' class="late"' : ""}>
<td class="mono">${esc(jobNo(r.job.id))}</td>
<td class="tag">${esc(r.job.tag)}</td>
<td class="c">${esc(fmtFull(r.job.tdd || null))}</td>
<td>${esc(r.m.item)}</td>
<td class="c">${esc(r.m.qty ?? "")}</td>
<td class="c">${esc(fmtFull(r.m.due || null))}</td>
<td>${esc(r.m.note || "")}</td>
<td class="c">${esc(r.m.status || "Yet to receive")}</td>
<td class="c">${esc(r.m.who || "")}</td></tr>`;
    }).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Materials still short — ${new Date().toLocaleDateString("en-IN")}</title><style>
@page { size: A4 landscape; margin: 10mm; }
body { font-family: Arial, Helvetica, sans-serif; color: #22303C; }
h1 { font-size: 16px; margin: 0 0 2px; }
.sub { font-size: 10.5px; color: #5A6B7B; margin-bottom: 8px; line-height: 1.5; }
table { border-collapse: collapse; width: 100%; font-size: 9.5px; }
th { background: #22303C; color: #fff; padding: 4px 5px; text-align: left; }
td { border-bottom: 1px solid #E7E4DC; padding: 3px 5px; vertical-align: top; }
td.c { text-align: center; white-space: nowrap; }
td.mono { font-weight: bold; white-space: nowrap; }
td.tag { color: #5A6B7B; max-width: 210px; }
tr.late td { background: #FBE9E7; }
tr.late td.c { font-weight: bold; color: #B3261E; }
.foot { margin-top: 8px; font-size: 10px; color: #5A6B7B; }
thead { display: table-header-group; }
</style></head><body>
<h1>Materials still short</h1>
<div class="sub">Nandan GSE &middot; ${rows.length} line${rows.length === 1 ? "" : "s"} across ${jobsAffected} job${jobsAffected === 1 ? "" : "s"} &middot; printed ${new Date().toLocaleString("en-IN")}<br>
Showing: ${esc(bits.join(" &middot; "))}</div>
<table><thead><tr><th>Job</th><th>Tag</th><th>TDD</th><th>Material / kit item</th><th>Qty</th><th>Receivable</th><th>Update</th><th>Status</th><th>With</th></tr></thead>
<tbody>${body}</tbody></table>
<div class="foot"><b>${late}</b> past their receivable date (shaded) &middot; <b>${defective}</b> QC defective. This is the screen as it was filtered and sorted, nothing more and nothing less.</div>
</body></html>`;
    const w = window.open("", "_blank");
    if (!w) { window.alert("Your browser blocked the print window. Allow pop-ups for this site and press PDF again."); return; }
    w.document.write(html); w.document.close(); w.focus();
    // let it lay out before the dialogue opens, or Chrome measures a blank page
    w.setTimeout(() => w.print(), 350);
  };

  const late = rows.filter((r) => r.m.due && r.m.due < TODAY).length;
  const defective = rows.filter((r) => String(r.m.status || "").toLowerCase().includes("defect")).length;
  const jobsAffected = new Set(rows.map((r) => r.job.id)).size;

  return (
    <div className="p-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <StatCard label="LINES OUTSTANDING" value={String(rows.length)} color="var(--navy)" />
        <StatCard label="JOBS WAITING" value={String(jobsAffected)} sub="jobs with at least one line open" color="var(--blue)" />
        <StatCard label="PAST THEIR RECEIVABLE DATE" value={String(late)} sub={late ? "already overdue from the supplier" : "none overdue"} color={late ? "var(--red)" : "var(--green)"} />
        <StatCard label="QC DEFECTIVE" value={String(defective)} sub={defective ? "received and rejected — still short" : "none rejected"} color={defective ? "var(--warn)" : "var(--green)"} />
      </div>

      <div className="flex gap-2 mb-3 flex-wrap items-center">
        <select
          value={horizon}
          onChange={(e) => setHorizon(e.target.value)}
          className="px-2 py-1 rounded border text-sm font-semibold"
          style={{ borderColor: horizon === "all" ? "var(--accent)" : "#D9D6CD", background: horizon === "all" ? "#FFF3E8" : "#fff" }}
          title="Which jobs to show, by how soon they are due to be delivered"
        >
          {HORIZONS.map(([k, l]) => (<option key={k} value={k}>{l}</option>))}
        </select>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="🔍 Search job no, tag or material"
          className="px-2 py-1 rounded border text-sm"
          style={{ borderColor: "#D9D6CD", minWidth: 260 }}
        />
        <select value={fProj} onChange={(e) => setFProj(e.target.value)} className="px-2 py-1 rounded border text-sm" style={{ borderColor: fProj === "all" ? "#D9D6CD" : "var(--accent)" }} title="Only lines on jobs of this project">
          <option value="all">All projects</option>
          {projOptions.map((pj) => (<option key={pj} value={pj}>{pj}</option>))}
        </select>
        <select value={fJob} onChange={(e) => setFJob(e.target.value)} className="px-2 py-1 rounded border text-sm" style={{ borderColor: fJob === "all" ? "#D9D6CD" : "var(--accent)" }} title="Only this job's lines">
          <option value="all">All jobs</option>
          {jobOptions.map((jb) => (<option key={jb.id} value={jb.id}>{jobNo(jb.id)} · {jb.tag.slice(0, 28)}</option>))}
        </select>
        <select value={fWho} onChange={(e) => setFWho(e.target.value)} className="px-2 py-1 rounded border text-sm" style={{ borderColor: fWho === "all" ? "#D9D6CD" : "var(--accent)" }} title="Only lines assigned to this person">
          <option value="all">Anyone</option>
          {whoOptions.map((w) => (<option key={w} value={w}>{w}</option>))}
        </select>
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="px-2 py-1 rounded border text-sm font-semibold" style={{ borderColor: fStatus === "open" ? "#D9D6CD" : "var(--accent)" }} title="Which statuses to show — the default is everything still short">
          <option value="open">Yet to receive + QC Defective</option>
          <option value="yet">Yet to receive only</option>
          <option value="defect">QC Defective only</option>
          <option value="received">Received</option>
          <option value="all">Every status</option>
        </select>
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          {fStatus === "open" ? "Received lines are not shown — this is what is still short." : ""}
        </span>
        <span style={{ flex: 1 }} />
        <button onClick={printPdf} disabled={!rows.length}
          className="px-2.5 py-1 rounded text-sm font-bold"
          style={{ background: rows.length ? "var(--ink)" : "#D9D6CD", color: "#fff", whiteSpace: "nowrap" }}
          title="Print what is on the screen — the same filters, the same sort order">
          ⎙ PDF of this view
        </button>
        {msg && <span className="text-xs font-bold" style={{ color: "var(--red)" }}>{msg}</span>}
      </div>

      <div className="bg-white rounded-lg border overflow-auto" style={{ borderColor: "var(--line)", maxHeight: "70vh" }}>
        <table className="w-full text-xs genie-table" style={{ minWidth: 1040, borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr style={{ background: "var(--ink)", color: "#fff" }}>
              <MTh k="job" label="Job" />
              <MTh k="tdd" label="TDD" align="center" />
              <MTh k="item" label="Material / kit item" />
              <MTh k="" label="Qty" align="center" />
              <MTh k="due" label="Receivable" align="center" />
              <MTh k="" label="Task" align="center" />
              <MTh k="" label="Update" />
              <MTh k="status" label="Status" align="center" />
              <MTh k="" label="Open" align="center" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-6 text-center" style={{ color: "var(--muted)" }}>
                Nothing outstanding for jobs delivering in this window.
              </td></tr>
            )}
            {rows.map(({ job, m }, i) => {
              const overdue = !!(m.due && m.due < TODAY);
              const linked = m.task_id ? board.tasks.find((t) => t.id === m.task_id) : undefined;
              return (
                <tr key={m.id} className="border-t align-top" style={{ borderColor: "var(--line-soft)", background: i % 2 ? "#FAF9F5" : "#fff" }}>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <button
                      onClick={() => onOpen(job.id)}
                      className="font-bold"
                      style={{ color: "var(--blue)", textDecoration: "underline" }}
                      title="Open this job's board"
                    >
                      {jobNo(job.id)}
                    </button>
                    <div className="truncate" style={{ color: "var(--muted)", maxWidth: 190 }} title={job.tag}>{job.tag}</div>
                  </td>
                  <td className="px-2 py-1.5 text-center whitespace-nowrap font-bold" style={{ color: job.tdd && job.tdd < TODAY ? "var(--red)" : "var(--ink)" }}>{fmtFull(job.tdd)}</td>
                  <td className="px-2 py-1.5" style={{ minWidth: 190 }}>{m.item}</td>
                  <td className="px-2 py-1.5 text-center tnum">{m.qty || "—"}</td>
                  <td className="px-2 py-1.5 text-center whitespace-nowrap">
                    {canEdit ? (
                      <input
                        type="date"
                        value={m.due || ""}
                        onChange={(e) => save(m, { due: e.target.value || null })}
                        className="text-xs bg-transparent border rounded px-1"
                        style={{ borderColor: overdue ? "var(--red)" : "var(--line)", color: overdue ? "var(--red)" : "var(--ink)", fontWeight: overdue ? 700 : 400 }}
                        title={overdue ? "This date has passed and the material is still not in" : "When the supplier is due to deliver"}
                      />
                    ) : (
                      <span style={{ color: overdue ? "var(--red)" : "var(--ink)", fontWeight: overdue ? 700 : 400 }}>{fmtFull(m.due || null)}</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-center whitespace-nowrap">
                    {linked ? (
                      <span
                        className="rounded px-1.5 py-0.5 font-semibold"
                        style={{ background: linked.done ? "#E6F4EA" : "#DCE8F5", color: linked.done ? "var(--green)" : "var(--blue)" }}
                        title={`${linked.t} · ${linked.who || "unassigned"}${linked.due ? " · due " + fmtFull(linked.due) : ""}`}
                      >
                        {linked.done ? "✓ task" : "task"} {linked.who ? whoTag(linked.who) : ""}
                      </span>
                    ) : (
                      <span style={{ color: "#B8B5AC" }}>—</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5" style={{ minWidth: 200 }}>
                    {canEdit ? (
                      <input
                        defaultValue={m.note || ""}
                        onBlur={(e) => { if (e.target.value !== (m.note || "")) save(m, { note: e.target.value }); }}
                        placeholder="latest word from the supplier…"
                        className="w-full text-xs border rounded px-1 py-0.5"
                        style={{ borderColor: "var(--line)" }}
                      />
                    ) : (m.note || <span style={{ color: "#B8B5AC" }}>—</span>)}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {canEdit ? (
                      <select
                        value={m.status || "Yet to receive"}
                        onChange={(e) => save(m, { status: e.target.value })}
                        disabled={busy === m.id}
                        className="text-xs border rounded px-1 py-0.5 font-semibold"
                        style={{ borderColor: "var(--line)", color: statusColour(m.status) }}
                      >
                        <option>Yet to receive</option>
                        <option>Received</option>
                        <option>QC Defective</option>
                      </select>
                    ) : (
                      <span className="font-semibold" style={{ color: statusColour(m.status) }}>{m.status || "Yet to receive"}</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <button
                      onClick={() => setPicked({ jobId: job.id, mat: m })}
                      className="rounded px-2 py-0.5 font-bold"
                      style={{ background: "#DCE8F5", color: "var(--blue)" }}
                      title="Open this material line — edit it, raise a task, read the comments"
                    >
                      ✎
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {picked && (
        <MatBox
          jobId={picked.jobId}
          mat={picked.mat}
          canEdit={canEdit}
          people={assignees(board).map((a) => ({ value: a.value, label: a.label }))}
          onClose={() => setPicked(null)}
          onChanged={reload}
        />
      )}
    </div>
  );
}

/** Yet to receive / Received / QC Defective, in the colours used everywhere. */
export function statusColour(s: string | null | undefined): string {
  const v = String(s || "").toLowerCase();
  if (v.includes("defect")) return "var(--warn)";
  if (v.includes("receiv") && !v.includes("yet")) return "var(--green)";
  return "var(--red)";
}

// ============================ Escalations ============================

/**
 * Every escalated task in the works, in one table.
 *
 * The point of this page is the last two columns. "Genie Solution" is a
 * suggestion asked for on demand; "Prevented by" is the answer somebody
 * actually gave when they closed one. Read down that column and the same
 * three causes appear over and over — which is the only way a pile of
 * escalations turns into a decision.
 *
 * Open ones first, because those are the ones somebody can still act on.
 */
export function Escalations({
  board,
  onOpen,
  reload,
  isAdmin,
}: {
  board: Board;
  V: (v: number) => string;
  onOpen: (id: string) => void;
  reload: () => Promise<Board | null>;
  isAdmin: boolean;
}) {
  const [showDone, setShowDone] = useState(false);
  const [lvl, setLvl] = useState("all");
  const [lightbox, setLightbox] = useState<Task | null>(null);
  const [notes, setNotes] = useState<Record<string, { body: string; by: string | null; at: string }>>({});
  const [hint, setHint] = useState<Record<string, string>>({});
  const [hinting, setHinting] = useState<string | null>(null);

  const jobById = useMemo(() => new Map(board.jobs.map((j) => [j.id, j])), [board.jobs]);

  // The close-out notes. Keyed the way the table is: kind + id.
  const loadNotes = useCallback(() => {
    api.get("/api/closeouts")
      .then((r: { notes?: { task_id: string; task_kind: string; body: string; by: string | null; at: string }[] }) => {
        const m: Record<string, { body: string; by: string | null; at: string }> = {};
        for (const n of r.notes || []) m[`${n.task_kind}:${n.task_id}`] = { body: n.body, by: n.by, at: n.at };
        setNotes(m);
      })
      // Before 0036 there is nothing to read. The column shows empty.
      .catch(() => {});
  }, []);
  useEffect(() => { loadNotes(); }, [loadNotes]);

  const rows = useMemo(() => {
    const out = board.tasks
      .filter((t) => escalated(t.esc))
      .filter((t) => showDone || !t.done)
      .filter((t) => lvl === "all" || (t.esc || "").startsWith(lvl));
    // Open first, then oldest-due first — the order you would work them in.
    return out.sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return String(a.due || "9999").localeCompare(String(b.due || "9999"));
    });
  }, [board.tasks, showDone, lvl]);

  const counts = useMemo(() => {
    const open = board.tasks.filter((t) => escalated(t.esc) && !t.done);
    const c = { L1: 0, L2: 0, L3: 0 } as Record<"L1" | "L2" | "L3", number>;
    for (const t of open) {
      const k = (t.esc || "").slice(0, 2) as "L1" | "L2" | "L3";
      if (k in c) c[k]++;
    }
    return { open: open.length, L1: c.L1, L2: c.L2, L3: c.L3 };
  }, [board.tasks]);

  const askGenie = async (t: Task) => {
    const job = jobById.get(t.j);
    setHinting(t.id);
    try {
      const r = await api.post("/api/genie-hint", {
        job_id: t.j,
        job_label: job ? `JOB ${jobNo(job.id)} · ${job.tag}` : t.j,
        question:
          `An escalated task (${t.esc}) is open on this job: "${t.t}".` +
          (t.esc_why ? ` It was escalated because: "${t.esc_why}".` : "") +
          (t.due ? ` It was due ${fmtFull(t.due)}.` : "") +
          " In two or three sentences, suggest the most likely way to clear it and what would stop it recurring. Be specific to this job.",
      });
      setHint((h) => ({ ...h, [t.id]: String(r.hint || r.text || "").trim() || "No suggestion came back." }));
    } catch (e) {
      setHint((h) => ({ ...h, [t.id]: e instanceof Error ? e.message : String(e) }));
    }
    setHinting(null);
  };

  const LvlBtn = ({ k, l }: { k: string; l: string }) => (
    <button onClick={() => setLvl(k)} className="px-2.5 py-1 rounded text-xs font-bold"
      style={lvl === k ? { background: "var(--ink)", color: "#fff" } : { color: "var(--dim)", background: "#F4F2EC" }}>{l}</button>
  );

  return (
    <div className="p-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <StatCard label="OPEN ESCALATIONS" value={String(counts.open)} color="var(--red)" />
        <StatCard label="L1 — SUPERVISOR" value={String(counts.L1)} color="var(--warn)" />
        <StatCard label="L2 — PRODUCTION / LEADERS" value={String(counts.L2)} color="var(--accent)" />
        <StatCard label="L3 — MANAGEMENT" value={String(counts.L3)} sub={counts.L3 ? "these are yours" : "none at your level"} color="var(--red)" />
      </div>

      <div className="flex gap-2 mb-3 flex-wrap items-center">
        <LvlBtn k="all" l="All levels" /><LvlBtn k="L1" l="L1" /><LvlBtn k="L2" l="L2" /><LvlBtn k="L3" l="L3" />
        <label className="flex items-center gap-1 text-xs font-semibold ml-2" style={{ color: "var(--dim)", cursor: "pointer" }}>
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} style={{ accentColor: "var(--green)" }} />
          Include closed — and what was done about them
        </label>
        <span className="text-xs ml-auto" style={{ color: "var(--muted)" }}>{rows.length} shown</span>
      </div>

      <div className="bg-white rounded-lg border overflow-x-auto" style={{ borderColor: "var(--line)" }}>
        <table className="w-full text-xs genie-table" style={{ minWidth: 1280 }}>
          <thead>
            <tr style={{ background: "var(--ink)", color: "#fff" }}>
              <th className="px-2 py-2 text-center">Level</th>
              <th className="px-2 py-2 text-left">Job</th>
              <th className="px-2 py-2 text-center">TDD</th>
              <th className="px-2 py-2 text-center">Task date</th>
              <th className="px-2 py-2 text-center">Assigned</th>
              <th className="px-2 py-2 text-left">Task</th>
              <th className="px-2 py-2 text-left">Why it was escalated</th>
              <th className="px-2 py-2 text-center">Dates moved</th>
              <th className="px-2 py-2 text-left">Genie solution · Prevented by</th>
              <th className="px-2 py-2 text-center">Edit</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={10} className="px-3 py-6 text-center" style={{ color: "var(--muted)" }}>
                Nothing escalated at this level. 🙂
              </td></tr>
            )}
            {rows.map((t, i) => {
              const job = jobById.get(t.j);
              const note = notes[`${t.kind}:${t.id}`];
              const moved = t.push_count || 0;
              return (
                <tr key={t.kind + t.id} className="border-t align-top" style={{ borderColor: "var(--line-soft)", background: t.done ? "#F4F7F4" : i % 2 ? "#FAF9F5" : "#fff" }}>
                  <td className="px-2 py-1.5 text-center whitespace-nowrap">
                    <span className="rounded px-1.5 py-0.5 font-bold" style={{ background: t.done ? "#E7E4DC" : "var(--red)", color: t.done ? "var(--dim)" : "#fff" }}>
                      {(t.esc || "").slice(0, 2)}
                    </span>
                    {t.done && <div style={{ color: "var(--green)", fontWeight: 700, fontSize: 10 }}>closed</div>}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <span className="font-bold" style={{ color: "var(--blue)" }}>{job ? jobNo(job.id) : jobNo(t.j)}</span>
                    {job && <div className="truncate" style={{ color: "var(--muted)", maxWidth: 170 }} title={job.tag}>{job.tag}</div>}
                  </td>
                  <td className="px-2 py-1.5 text-center whitespace-nowrap font-bold" style={{ color: job?.tdd && job.tdd < TODAY ? "var(--red)" : "var(--ink)" }}>{fmtFull(job?.tdd || null)}</td>
                  <td className="px-2 py-1.5 text-center whitespace-nowrap" style={{ color: taskLate(t, TODAY) ? "var(--red)" : "var(--ink)", fontWeight: taskLate(t, TODAY) ? 700 : 400 }}>{fmtFull(t.due)}</td>
                  <td className="px-2 py-1.5 text-center whitespace-nowrap" title={t.who || "unassigned"}>{t.who ? whoTag(t.who) : "—"}</td>
                  <td className="px-2 py-1.5" style={{ minWidth: 200 }}>
                    <div style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }} title={t.t}>{t.t}</div>
                    <div style={{ color: "var(--muted)" }}>{t.cat}</div>
                  </td>
                  <td className="px-2 py-1.5" style={{ minWidth: 170, color: t.esc_why ? "var(--ink)" : "#B8B5AC" }}>
                    {t.esc_why || "— not given —"}
                  </td>
                  <td className="px-2 py-1.5 text-center whitespace-nowrap">
                    {moved > 0 ? (
                      <span title={t.original_due ? `First promised ${fmtFull(t.original_due)}` : undefined} style={{ color: "var(--red)", fontWeight: 700 }}>
                        {moved}×<div style={{ fontSize: 10, fontWeight: 400 }}>from {fmtFull(t.original_due || null)}</div>
                      </span>
                    ) : (<span style={{ color: "#B8B5AC" }}>never</span>)}
                  </td>
                  <td className="px-2 py-1.5" style={{ minWidth: 260 }}>
                    {note ? (
                      <div className="rounded p-1.5 mb-1" style={{ background: "#E6F4EA", border: "1px solid #0D7A3F" }}>
                        <div className="font-bold" style={{ color: "var(--green)", fontSize: 10 }}>PREVENTED BY — {note.by || "—"}</div>
                        <div style={{ color: "var(--ink)" }}>{note.body}</div>
                      </div>
                    ) : t.done ? (
                      <div style={{ color: "#B8B5AC" }}>closed before this was asked for</div>
                    ) : null}
                    {hint[t.id] ? (
                      <div className="rounded p-1.5" style={{ background: "#F3EEFB", border: "1px solid #7C3AED" }}>
                        <div className="font-bold" style={{ color: "#7C3AED", fontSize: 10 }}>GENIE</div>
                        <div style={{ color: "var(--ink)" }}>{hint[t.id]}</div>
                      </div>
                    ) : !t.done ? (
                      <button
                        onClick={() => askGenie(t)}
                        disabled={hinting === t.id}
                        className="rounded px-2 py-0.5 font-bold"
                        style={{ background: "#F3EEFB", color: "#7C3AED", opacity: hinting === t.id ? 0.6 : 1 }}
                        title="Ask Genie what would most likely clear this, and what would stop it recurring"
                      >
                        {hinting === t.id ? "thinking…" : "✨ Ask Genie"}
                      </button>
                    ) : null}
                  </td>
                  <td className="px-2 py-1.5 text-center whitespace-nowrap">
                    <button onClick={() => setLightbox(t)} className="rounded px-2 py-0.5 font-bold" style={{ background: "#DCE8F5", color: "var(--blue)" }} title="Open the task">✎</button>
                    <button onClick={() => onOpen(t.j)} className="rounded px-2 py-0.5 font-bold ml-1" style={{ background: "#F4F2EC", color: "var(--dim)" }} title="Open the job plan">JOB</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {lightbox && (
        <TaskModal
          canDelete={isAdmin}
          task={lightbox}
          jobRef={taskJobRef(board, lightbox)}
          owners={assignees(board)}
          onClose={() => setLightbox(null)}
          onToggle={async (prevention) => {
            await api.post("/api/tasks", { action: "toggle", id: lightbox.id, kind: lightbox.kind, done: !lightbox.done, prevention });
            setLightbox(null);
            await reload();
            loadNotes();   // the answer they just typed belongs in the table
          }}
          reload={reload}
        />
      )}
    </div>
  );
}