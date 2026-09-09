"use client";
// split out of PlanningSuite.tsx (Genie 5.0.1.1) — one file per tab, loaded when opened
import React, { useMemo, useState } from "react";

import { api } from "@/lib/api";

import { fmt, fmtFull, jobNo, diffDays, addDays, computeSchedule, type Plan, type PlanMilestone } from "@/lib/schedule";

import { JobLightbox } from "../JobsInProgress";

import ProjectPeek from "../ProjectPeek";

import { Board, Job, TODAY, redactMoney } from "./shared";
import { jobMoney, toWip } from "./OnFloor";

// ============================ Live Projects ============================

/** The projects row a job's proj id points at, plus Genie's own description. */
export type ProjMeta = { id: string; name?: string; mgr?: string; stage?: string; committed?: string; exp_end?: string; so?: string; cust?: string | null; description?: string | null };

export type ProjGroup = {
  id: string; meta: ProjMeta | undefined; jobs: Job[]; firstTdd: string;
  /** The project's money: Original counts its past jobs too; invested and
   *  WIP are jobMoney() summed over what is still live. */
  money: { origVal: number; delVal: number; pendVal: number; invested: number; wip: number; kitPct: number };
  deliveredCount: number;
};

/**
 * Every project that still has a live job on the board, with what is open
 * against each job — the project-level answer to "where do we stand".
 * Projects sort by the TDD of their first job; a job opens its lightbox, the
 * PROJ number opens the project's own — description, combined GANTT, and the
 * project plan the planner keeps (Dr Raghu, 26 Aug 2026: planning moves up
 * to project level, so the plan uses the job schema exactly).
 */
export function LiveProjects({
  board, V, canEdit, reload,
}: {
  board: Board;
  V: (n: number) => string;
  canEdit: boolean;
  reload: () => Promise<Board | null>;
}) {
  const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState<"tdd" | "value" | "kit" | "wip">("tdd");
  const [closed, setClosed] = useState<Set<string>>(new Set());
  /** Job rows whose On Floor-style detail is unfolded. */
  const [openJobs, setOpenJobs] = useState<Set<string>>(new Set());
  const [pickedJob, setPickedJob] = useState<Job | null>(null);
  const [openProj, setOpenProj] = useState<string | null>(null);
  /**
   * THE LOOK BEFORE THE TAB (Dr Raghu, 9 Sep 2026: "in this the project plan
   * should open up which is same as the lightbox in projects!").
   *
   * The PROJ number used to go straight to the GANTT-and-plan panel. It now
   * opens the SAME lightbox Projects opens — the shared one in
   * ProjectPeek.tsx — and that panel is offered from inside it, so nothing
   * that was reachable stopped being reachable.
   */
  const [peek, setPeek] = useState<string | null>(null);

  // what is open against a job, counted the same way the other tabs count it:
  // materials — every kitting line not yet Received (QC Defective is pending);
  // design — open tasks in the Design category; tasks — every other open task.
  const openByJob = useMemo(() => {
    const m = new Map<string, { mat: number; design: number; tasks: number }>();
    const at = (id: string) => {
      let v = m.get(id);
      if (!v) { v = { mat: 0, design: 0, tasks: 0 }; m.set(id, v); }
      return v;
    };
    for (const [jobId, list] of Object.entries(board.materials || {})) {
      at(jobId).mat = list.filter((x) => String(x.status || "").toLowerCase() !== "received").length;
    }
    for (const t of board.tasks) {
      if (t.done) continue;
      if (t.cat === "Design") at(t.j).design += 1;
      else at(t.j).tasks += 1;
    }
    return m;
  }, [board.materials, board.tasks]);

  const projById = useMemo(
    () => new Map((board.projects as ProjMeta[]).map((p) => [String(p.id), p])),
    [board.projects],
  );

  // every project carrying a live job, soonest first — before any search
  const groupsAll = useMemo(() => {
    const byProj = new Map<string, Job[]>();
    for (const j of board.jobs) {
      const key = String(j.proj || "").trim();
      if (!key) continue; // a job with no project is not a project
      (byProj.get(key) || byProj.set(key, []).get(key)!).push(j);
    }
    // the project's past — delivered and archived jobs still count in Original
    const pastByProj = new Map<string, Job[]>();
    for (const a of Object.values(board.archived || {})) {
      const key = String(a.proj || "").trim();
      if (!key || !byProj.has(key)) continue;
      (pastByProj.get(key) || pastByProj.set(key, []).get(key)!).push(a);
    }
    const out: ProjGroup[] = [...byProj.entries()].map(([id, js]) => {
      const jobs = [...js].sort((a, b) => String(a.tdd || "9999").localeCompare(String(b.tdd || "9999")));
      const past = pastByProj.get(id) || [];
      const delivered = past.filter((x) => x.delivered);
      const pendVal = jobs.reduce((a, j) => a + (j.val || 0), 0);
      const delVal = delivered.reduce((a, j) => a + (j.val || 0), 0);
      const origVal = pendVal + past.reduce((a, j) => a + (j.val || 0), 0);
      let matSum = 0, kitSum = 0, wip = 0;
      for (const j of jobs) {
        const m = jobMoney(j);
        matSum += m.material; kitSum += m.kitted; wip += m.wip;
      }
      return {
        id, meta: projById.get(id), jobs, firstTdd: jobs[0].tdd || "9999",
        money: { origVal, delVal, pendVal, invested: kitSum, wip, kitPct: matSum > 0 ? (kitSum / matSum) * 100 : 0 },
        deliveredCount: delivered.length,
      };
    });
    // by the TDD of the first job within each project — the default order
    out.sort((a, b) => a.firstTdd.localeCompare(b.firstTdd));
    return out;
  }, [board.jobs, board.archived, projById]);

  const groups = useMemo(() => {
    const base = [...groupsAll];
    // Value and WIP: biggest first. Kitting: LEAST kitted first — that is the
    // project needing the chase, and a sort that buries it helps nobody.
    if (sortBy === "value") base.sort((a, b) => b.money.pendVal - a.money.pendVal);
    else if (sortBy === "wip") base.sort((a, b) => b.money.wip - a.money.wip);
    else if (sortBy === "kit") base.sort((a, b) => a.money.kitPct - b.money.kitPct);
    const needle = q.trim().toLowerCase();
    return needle
      ? base.filter((g) =>
          g.id.toLowerCase().includes(needle) ||
          String(g.meta?.name || "").toLowerCase().includes(needle) ||
          String(g.meta?.mgr || "").toLowerCase().includes(needle) ||
          g.jobs.some((j) => jobNo(j.id).includes(needle) || j.tag.toLowerCase().includes(needle) || j.cust.toLowerCase().includes(needle)))
      : base;
  }, [groupsAll, q, sortBy]);

  const tot = useMemo(() => {
    const t = { jobs: 0, mat: 0, design: 0, tasks: 0, val: 0, wip: 0 };
    for (const g of groups) {
      t.wip += g.money.wip;
      for (const j of g.jobs) {
        const o = openByJob.get(j.id);
        t.jobs += 1; t.val += j.val;
        if (o) { t.mat += o.mat; t.design += o.design; t.tasks += o.tasks; }
      }
    }
    return t;
  }, [groups, openByJob]);

  const num = (n: number, hot: string) => (
    <b className="tnum" style={{ color: n ? hot : "#C9C6BD", fontSize: 14 }}>{n || "—"}</b>
  );
  const toggle = (id: string) => setClosed((c) => {
    const n = new Set(c);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const toggleJob = (id: string) => setOpenJobs((c) => {
    const n = new Set(c);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const openGroup = openProj ? groupsAll.find((g) => g.id === openProj) : null;

  return (
    <div className="max-w-[1200px] mx-auto px-4 pb-4">
      {/* the top row floats under the frozen header, like the Job Plan's */}
      <div className="flex items-baseline gap-x-3 gap-y-1 flex-wrap py-2.5 mb-3"
        style={{ position: "sticky", top: "var(--hdr-h, 92px)", zIndex: 24, background: "var(--paper)", borderBottom: "1px solid #E2E0DA" }}>
        <h2 className="text-lg font-bold" style={{ color: "var(--navy)" }}>Live Projects</h2>
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          {groups.length} project{groups.length === 1 ? "" : "s"} · {tot.jobs} live job{tot.jobs === 1 ? "" : "s"} · {V(tot.val)} pending · {V(tot.wip)} WIP ·
          open: <b style={{ color: "#8A5A00" }}>{tot.mat}</b> material · <b style={{ color: "#7C3AED" }}>{tot.design}</b> design · <b style={{ color: "var(--blue)" }}>{tot.tasks}</b> tasks
        </span>
        <span className="flex items-center gap-1.5 ml-auto flex-wrap">
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="text-xs font-bold border rounded px-2 py-1.5" style={{ borderColor: "var(--line)", background: "#fff", color: "var(--ink)" }}
            title="How the projects order themselves">
            <option value="tdd">Sort: First TDD</option>
            <option value="value">Sort: Pending value</option>
            <option value="kit">Sort: Kitting % (least first)</option>
            <option value="wip">Sort: WIP</option>
          </select>
          <button onClick={() => { setClosed(new Set(groupsAll.map((g) => g.id))); setOpenJobs(new Set()); }} className="text-xs font-bold rounded px-2 py-1.5 border" style={{ borderColor: "var(--line)", background: "#fff", color: "var(--dim)" }}>Collapse all</button>
          <button onClick={() => setClosed(new Set())} className="text-xs font-bold rounded px-2 py-1.5 border" style={{ borderColor: "var(--line)", background: "#fff", color: "var(--dim)" }}>Expand all</button>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search project / job / customer…"
            className="text-xs border rounded px-2 py-1.5"
            style={{ borderColor: "var(--line)", background: "#fff", minWidth: 200 }}
          />
        </span>
      </div>

      {groups.length === 0 && (
        <div className="bg-white rounded-lg border p-6 text-sm" style={{ borderColor: "var(--line)", color: "var(--muted)" }}>
          No project carries a live job{q ? " matching that search" : ""}.
        </div>
      )}

      {groups.map((g) => {
        const late = g.jobs.filter((j) => j.tdd && j.tdd < TODAY).length;
        const shut = closed.has(g.id);
        return (
          <div key={g.id} className="bg-white rounded-lg border mb-3 overflow-hidden" style={{ borderColor: "var(--line)" }}>
            {/* the project band — its details lead, its jobs fold beneath */}
            <div className="px-3 py-2" style={{ background: "var(--navy)" }}>
              <div className="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap">
                <button onClick={() => toggle(g.id)} className="font-bold" title={shut ? "Expand the jobs" : "Collapse the jobs"} style={{ color: "#8FA1B3", fontSize: 13, width: 16 }}>{shut ? "▸" : "▾"}</button>
                <b className="text-sm cursor-pointer" style={{ color: "#fff" }} onClick={() => toggle(g.id)}>{g.meta?.name || g.id}</b>
                <button onClick={() => setPeek(g.id)} className="text-xs font-bold rounded px-1.5 py-0.5" title="A look at the project first — then the tab, or its plan and GANTT" style={{ background: "var(--accent)", color: "#fff" }}>
                  {g.id.replace(/^NGSE-PROJ-/, "PROJ ")}
                </button>
                {g.meta?.mgr && <span className="text-xs" style={{ color: "#8FA1B3" }}>PM <b style={{ color: "#D7DEE6" }}>{g.meta.mgr}</b></span>}
                {g.meta?.stage && <span className="text-xs" style={{ color: "#8FA1B3" }}>stage <b style={{ color: "#D7DEE6" }}>{g.meta.stage}</b></span>}
                {g.meta?.committed && <span className="text-xs" style={{ color: "#8FA1B3" }}>committed <b style={{ color: "#D7DEE6" }}>{fmt(g.meta.committed)}</b></span>}
                {g.meta?.so && <span className="text-xs" style={{ color: "#8FA1B3" }}>{g.meta.so}</span>}
                <span className="text-xs ml-auto" style={{ color: "#8FA1B3" }}>
                  {g.jobs.length} live job{g.jobs.length === 1 ? "" : "s"}
                  {g.deliveredCount > 0 && <> · {g.deliveredCount} delivered</>}
                  {late > 0 && <b style={{ color: "var(--amber)" }}> · {late} past TDD</b>}
                </span>
              </div>
              {/* the money line: what the project was, what has landed, what remains */}
              <div className="text-xs mt-1 flex gap-x-3.5 gap-y-0.5 flex-wrap tnum" style={{ paddingLeft: 22, color: "#8FA1B3" }}>
                <span>Value <b style={{ color: "#D7DEE6" }}>{V(g.money.origVal)}</b></span>
                <span>Delivered <b style={{ color: "#7BC98A" }}>{V(g.money.delVal)}</b></span>
                <span>Pending <b style={{ color: "var(--amber)" }}>{V(g.money.pendVal)}</b></span>
                <span title="Kitted material value across the live jobs — (1 − T%) × Kitting% × Value">Material invested <b style={{ color: "#D7DEE6" }}>{V(g.money.invested)}</b></span>
                <span title="Kitted material + throughput earned by production">WIP <b style={{ color: "#C9A9F0" }}>{V(g.money.wip)}</b></span>
                <span>Kitting <b style={{ color: "#D7DEE6" }}>{Math.round(g.money.kitPct)}%</b></span>
              </div>
              {g.meta?.description && (
                <div className="text-xs mt-1" style={{ color: "#B9C4CF", paddingLeft: 22, whiteSpace: "pre-wrap" }}>
                  {g.meta.description}
                </div>
              )}
            </div>
            {!shut && (
            <table className="w-full text-sm genie-table" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr className="text-xs" style={{ color: "var(--muted)", background: "#F7F5F0" }}>
                  <th className="text-left px-3 py-1.5 font-bold">JOB</th>
                  <th className="text-left px-2 py-1.5 font-bold">OTD</th>
                  <th className="text-left px-2 py-1.5 font-bold" title="Target Delivery Date — the date the board runs on">TDD</th>
                  <th className="text-right px-2 py-1.5 font-bold" title="Kitting lines not yet Received">PENDING MATERIAL</th>
                  <th className="text-right px-2 py-1.5 font-bold" title="Open tasks in the Design category">PENDING DESIGN</th>
                  <th className="text-right px-3 py-1.5 font-bold" title="Every other open task on the job">PENDING TASKS</th>
                </tr>
              </thead>
              <tbody>
                {g.jobs.map((j) => {
                  const o = openByJob.get(j.id) || { mat: 0, design: 0, tasks: 0 };
                  const lateJob = j.tdd && j.tdd < TODAY;
                  const openJ = openJobs.has(j.id);
                  const m = jobMoney(j);
                  return (
                    <React.Fragment key={j.id}>
                    <tr onClick={() => setPickedJob(j)} className="cursor-pointer hover:bg-[#F7F5F0]" style={{ borderTop: "1px solid #F0EEE8" }} title="Open the job — ▸ unfolds its details">
                      <td className="px-3 py-1.5">
                        <button onClick={(e) => { e.stopPropagation(); toggleJob(j.id); }} className="font-bold mr-1" title={openJ ? "Fold the details" : "Unfold the details"} style={{ color: "#B8B5AC", fontSize: 12, width: 14 }}>{openJ ? "▾" : "▸"}</button>
                        <b className="tnum" style={{ color: "var(--blue)" }}>{jobNo(j.id)}</b>{" "}
                        <span style={{ color: "var(--ink)" }}>{j.tag}</span>
                        {j.onFloor && <span className="text-xs font-bold ml-1" title="On Floor now" style={{ color: "var(--green)" }}>● floor</span>}
                        <span className="text-xs ml-1" style={{ color: "var(--muted)" }}>{j.cust}</span>
                      </td>
                      <td className="px-2 py-1.5 tnum text-xs" style={{ color: "var(--dim)" }}>{fmt(j.otd)}</td>
                      <td className="px-2 py-1.5 tnum text-xs font-bold" style={{ color: lateJob ? "var(--red)" : "var(--ink)" }}>{fmt(j.tdd)}</td>
                      <td className="px-2 py-1.5 text-right">{num(o.mat, "#8A5A00")}</td>
                      <td className="px-2 py-1.5 text-right">{num(o.design, "#7C3AED")}</td>
                      <td className="px-3 py-1.5 text-right">{num(o.tasks, "var(--blue)")}</td>
                    </tr>
                    {openJ && (
                      <tr>
                        <td colSpan={6} style={{ background: "#FBFAF7", borderTop: "1px dashed #E2E0DA", padding: "8px 14px 9px 32px" }}>
                          {/* the On Floor read of this job, folded under its row */}
                          <div className="flex gap-x-4 gap-y-1 flex-wrap text-xs" style={{ color: "var(--dim)" }}>
                            <span>Status <b style={{ color: "var(--ink)" }}>{j.stat || "—"}</b></span>
                            <span>Production <b style={{ color: "var(--blue)" }}>{j.pct || 0}%</b></span>
                            <span>Kitting <b style={{ color: (j.kit || 0) >= 80 ? "var(--green)" : (j.kit || 0) >= 40 ? "#8A5A00" : "var(--red)" }}>{j.kit || 0}%</b></span>
                            <span>Value <b style={{ color: "var(--ink)" }}>{V(j.val)}</b></span>
                            <span title="Kitted material value — money already in steel and parts">Material invested <b style={{ color: "var(--ink)" }}>{V(m.kitted)}</b></span>
                            <span title="Kitted material + throughput earned by production">WIP <b style={{ color: "#7C3AED" }}>{V(m.wip)}</b></span>
                            {j.start && <span>Started <b style={{ color: "var(--ink)" }}>{fmt(j.start)}</b></span>}
                            <span>Owner <b style={{ color: "var(--ink)" }}>{j.ownerInitials || j.own || "—"}</b></span>
                          </div>
                          <div className="flex gap-x-4 gap-y-1 flex-wrap text-xs mt-1" style={{ color: "var(--muted)" }}>
                            <span>Quality <b style={{ color: j.qualityOwner ? "var(--ink)" : "#B8B5AC" }}>{j.qualityOwner || "not set"}</b></span>
                            <span>Production <b style={{ color: j.productionOwner ? "var(--ink)" : "#B8B5AC" }}>{j.productionOwner || "not set"}</b></span>
                            <span>Kitting <b style={{ color: j.kittingOwner ? "var(--ink)" : "#B8B5AC" }}>{j.kittingOwner || "not set"}</b></span>
                            <span>Design <b style={{ color: j.designOwner ? "var(--ink)" : "#B8B5AC" }}>{j.designOwner || "not set"}</b></span>
                          </div>
                          {j.floorSummary && (
                            <div className="text-xs mt-1" style={{ color: "var(--ink)" }}>
                              <b style={{ color: "var(--muted)" }}>FROM THE FLOOR</b> {redactMoney(j.floorSummary)}
                              {j.floorSummaryAt && <span style={{ color: "#B8B5AC" }}> · {fmt(String(j.floorSummaryAt))}</span>}
                            </div>
                          )}
                          {j.note && (
                            <div className="text-xs mt-1" style={{ color: "var(--dim)" }}>
                              <b style={{ color: "var(--muted)" }}>ERP STATUS</b> {redactMoney(j.note)}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
            )}
          </div>
        );
      })}

      {pickedJob && (
        <JobLightbox
          job={toWip(pickedJob)}
          V={V}
          colour="var(--blue)"
          onClose={() => setPickedJob(null)}
          // Edit opens the plan in a NEW TAB — the project view stays put.
          onOpenPlan={() => window.open(`/?job=${encodeURIComponent(pickedJob.id)}`, "_blank")}
          canEdit={canEdit}
          onSaved={reload}
        />
      )}

      {peek && (() => {
        const pg = groupsAll.find((x) => x.id === peek);
        return (
          <ProjectPeek
            id={peek}
            /* Seeded from what the band already shows, so the card is
               readable in the same instant it opens; the ERP record fills
               the rest in behind it. */
            row={{
              name: peek,
              project_name: pg?.meta?.name || "",
              customer: pg?.meta?.cust || "",
              project_stage: pg?.meta?.stage || "",
              custom_project_director: pg?.meta?.mgr || "",
              sales_order: pg?.meta?.so || "",
              customer_committed_delivery_: pg?.meta?.committed || "",
              expected_end_date: pg?.meta?.exp_end || "",
              short_summary_description: pg?.meta?.description || "",
            }}
            onClose={() => setPeek(null)}
            extra={
              <button
                onClick={() => { setOpenProj(peek); setPeek(null); }}
                className="rounded px-4 py-2 text-sm font-bold"
                style={{ background: "var(--navy)", color: "#fff" }}
                title="The combined GANTT across its jobs, and the project plan kept here"
              >
                Plan &amp; GANTT
              </button>
            }
          />
        );
      })()}

      {openGroup && (
        <ProjectLightbox
          g={openGroup}
          board={board}
          V={V}
          canEdit={canEdit}
          reload={reload}
          onClose={() => setOpenProj(null)}
          onOpenJob={(j) => setPickedJob(j)}
        />
      )}
    </div>
  );
}

/**
 * The project's own lightbox: description, the details the band shows, the
 * COMBINED GANTT across its jobs, and the project plan — same schema as a
 * job plan, kept in project_plans/project_milestones (0074).
 */
export function ProjectLightbox({
  g, board, V, canEdit, reload, onClose, onOpenJob,
}: {
  g: ProjGroup; board: Board; V: (n: number) => string; canEdit: boolean;
  reload: () => Promise<Board | null>; onClose: () => void; onOpenJob: (j: Job) => void;
}) {
  const plan = board.plans[g.id];
  const [desc, setDesc] = useState(String(g.meta?.description || ""));
  const [descOpen, setDescOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [editingPlan, setEditingPlan] = useState(false);

  const saveDesc = async () => {
    setMsg("");
    try {
      await api.post("/api/project-field", { id: g.id, description: desc });
      await reload();
      setMsg("Saved ✓"); setDescOpen(false);
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(22,35,47,0.55)", zIndex: 70, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "32px 16px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg" style={{ width: "min(1020px, 100%)", maxHeight: "90vh", overflowY: "auto" }}>
        <div className="px-4 py-3 flex items-start gap-3" style={{ background: "var(--navy)", position: "sticky", top: 0, zIndex: 2 }}>
          <div style={{ flex: 1 }}>
            <div className="text-xs font-bold" style={{ color: "var(--accent)", letterSpacing: 1.2 }}>{g.id.replace(/^NGSE-PROJ-/, "PROJ ")}</div>
            <div className="font-bold text-white" style={{ fontSize: 16, lineHeight: 1.25 }}>{g.meta?.name || g.id}</div>
            <div className="text-xs" style={{ color: "#8FA1B3" }}>
              {g.meta?.mgr && <>PM <b style={{ color: "#D7DEE6" }}>{g.meta.mgr}</b> · </>}
              {g.meta?.stage && <>stage <b style={{ color: "#D7DEE6" }}>{g.meta.stage}</b> · </>}
              committed <b style={{ color: "#D7DEE6" }}>{fmtFull(g.meta?.committed || null)}</b> ·
              expected <b style={{ color: "#D7DEE6" }}>{fmtFull(g.meta?.exp_end || null)}</b>
              {g.meta?.so && <> · {g.meta.so}</>}
              {" · "}{g.jobs.length} job{g.jobs.length === 1 ? "" : "s"} · {V(g.jobs.reduce((a, j) => a + j.val, 0))}
            </div>
          </div>
          <button onClick={onClose} className="font-bold" style={{ color: "#8FA1B3", fontSize: 20, lineHeight: 1 }}>✕</button>
        </div>

        <div className="p-4">
          {/* description — the written read on what this project is */}
          <div className="rounded border p-2.5 mb-3" style={{ borderColor: "var(--line)", background: "#FBFAF7" }}>
            <div className="text-xs font-bold mb-1 flex items-center gap-2" style={{ color: "var(--muted)" }}>
              DESCRIPTION
              {canEdit && !descOpen && <button onClick={() => setDescOpen(true)} className="font-bold" style={{ color: "var(--blue)" }}>✎ edit</button>}
              {msg && <span style={{ color: msg.startsWith("Saved") ? "var(--green)" : "var(--red)" }}>{msg}</span>}
            </div>
            {descOpen ? (
              <div>
                <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} autoFocus
                  placeholder="What this project is, in the words the next person needs…"
                  className="w-full text-sm border rounded px-2 py-1.5" style={{ borderColor: "var(--line)", background: "#fff" }} />
                <div className="flex gap-2 mt-1">
                  <button onClick={() => void saveDesc()} className="text-xs font-bold rounded px-3 py-1" style={{ background: "var(--accent)", color: "#fff" }}>Save</button>
                  <button onClick={() => { setDescOpen(false); setDesc(String(g.meta?.description || "")); }} className="text-xs font-bold rounded px-3 py-1 border" style={{ borderColor: "var(--line)", color: "var(--dim)" }}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="text-sm" style={{ color: g.meta?.description ? "var(--ink)" : "#B8B5AC", whiteSpace: "pre-wrap" }}>
                {g.meta?.description || "No description yet" + (canEdit ? " — write the read on this project." : ".")}
              </div>
            )}
          </div>

          {/* the combined GANTT — the project plan on top, every job beneath */}
          <div className="flex items-baseline gap-2 mb-1">
            <div className="text-xs font-bold" style={{ color: "var(--muted)" }}>PROJECT GANTT — combined across the jobs</div>
            {canEdit && (
              <button onClick={() => setEditingPlan((v) => !v)} className="text-xs font-bold rounded px-2 py-0.5" style={{ background: editingPlan ? "#F4F2EC" : "#DCE8F5", color: "var(--blue)" }}>
                {editingPlan ? "✕ close the editor" : plan?.milestones?.length ? "✎ Edit the project plan" : "＋ Start the project plan"}
              </button>
            )}
          </div>
          {editingPlan && (
            <ProjectPlanEditor
              id={g.id}
              plan={plan}
              onDone={async () => { setEditingPlan(false); await reload(); }}
            />
          )}
          <ProjectGantt g={g} board={board} onOpenJob={onOpenJob} />
        </div>
      </div>
    </div>
  );
}

/**
 * One timeline for the whole project: the project's own milestones lead in
 * orange, then each job's scheduled milestones from its Job Plan. A job with
 * no plan yet shows as a single quiet span from its start to its TDD.
 */
export function ProjectGantt({ g, board, onOpenJob }: { g: ProjGroup; board: Board; onOpenJob: (j: Job) => void }) {
  type BarRow = { label: string; start: string; end: string; colour: string; hollow?: boolean; header?: false } | { header: true; label: string; tdd: string | null; job: Job };
  const rows: BarRow[] = [];
  const dates: string[] = [];

  const projPlan = board.plans[g.id];
  if (projPlan?.milestones?.length) {
    for (const m of computeSchedule({ start: projPlan.start || TODAY, milestones: projPlan.milestones })) {
      rows.push({ label: `P · ${m.name}`, start: m.start, end: m.end, colour: m.done ? "var(--green)" : "var(--accent)" });
      dates.push(m.start, m.end);
    }
  }
  // Design's ladder from Vishwakarma (0088) — dated stages as violet marks:
  // made THERE by design, shown HERE with the project, as asked.
  for (const d of board.designPlans?.[g.id] || []) {
    const a = d.start || d.end, b = d.end || d.start;
    if (!a || !b) continue;
    rows.push({ label: `D · ${d.title}`, start: a, end: b, colour: d.done ? "var(--green)" : "#7C3AED" });
    dates.push(a, b);
  }
  for (const j of g.jobs) {
    rows.push({ header: true, label: `${jobNo(j.id)} · ${j.tag}`, tdd: j.tdd, job: j });
    if (j.tdd) dates.push(j.tdd);
    const jp = board.plans[j.id];
    if (jp?.milestones?.length) {
      for (const m of computeSchedule({ start: jp.start || j.start || TODAY, milestones: jp.milestones })) {
        rows.push({ label: m.name, start: m.start, end: m.end, colour: m.done ? "var(--green)" : "var(--blue)" });
        dates.push(m.start, m.end);
      }
    } else {
      const a = j.start || TODAY;
      const b = j.tdd && j.tdd > a ? j.tdd : addDays(a, 7);
      rows.push({ label: "no plan yet — span to TDD", start: a, end: b, colour: "#8FA1B3", hollow: true });
      dates.push(a, b);
    }
  }

  if (!dates.length) return null;
  dates.push(TODAY);
  const min = addDays(dates.reduce((a, b) => (a < b ? a : b)), -3);
  const max = addDays(dates.reduce((a, b) => (a > b ? a : b)), 3);
  const span = Math.max(1, diffDays(min, max));
  const pct = (d: string) => (diffDays(min, d) / span) * 100;

  // month lines: every first-of-month inside the range
  const months: { at: string; label: string }[] = [];
  for (let d = min.slice(0, 7) + "-01"; d <= max; ) {
    if (d >= min) months.push({ at: d, label: new Date(d + "T00:00:00Z").toLocaleString("en-IN", { timeZone: "Asia/Kolkata", month: "short" }) });
    const [y, m] = d.split("-").map(Number);
    d = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`;
  }

  return (
    <div className="rounded border overflow-x-auto" style={{ borderColor: "var(--line)", background: "#fff" }}>
      <div style={{ minWidth: 640, padding: "8px 10px" }}>
        {/* month ruler */}
        <div className="relative" style={{ height: 16, marginLeft: 200 }}>
          {months.map((m) => (
            <span key={m.at} className="absolute text-xs font-bold" style={{ left: pct(m.at) + "%", color: "#B8B5AC" }}>{m.label}</span>
          ))}
        </div>
        {rows.map((r, i) =>
          "header" in r && r.header ? (
            <div key={i} className="flex items-center" style={{ height: 22, borderTop: "1px solid #F0EEE8" }}>
              <button onClick={() => onOpenJob(r.job)} className="text-left text-xs font-bold" title="Open the job" style={{ width: 200, flexShrink: 0, color: "var(--blue)", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                {r.label}
              </button>
              <div className="relative" style={{ flex: 1, height: "100%" }}>
                {months.map((m) => <span key={m.at} className="absolute" style={{ left: m.at >= min ? pct(m.at) + "%" : 0, top: 0, bottom: 0, borderLeft: "1px solid #F0EEE8" }} />)}
                {TODAY >= min && TODAY <= max && <span className="absolute" style={{ left: pct(TODAY) + "%", top: 0, bottom: 0, borderLeft: "2px solid #B3261E" }} />}
                {r.tdd && r.tdd >= min && r.tdd <= max && (
                  <span className="absolute text-xs" title={`TDD ${fmtFull(r.tdd)}`} style={{ left: `calc(${pct(r.tdd)}% - 5px)`, top: 3, color: r.tdd < TODAY ? "var(--red)" : "var(--accent)" }}>◆</span>
                )}
              </div>
            </div>
          ) : "header" in r ? null : (
            <div key={i} className="flex items-center" style={{ height: 20 }}>
              <span className="text-xs" title={`${r.label} · ${fmtFull(r.start)} → ${fmtFull(r.end)}`} style={{ width: 200, flexShrink: 0, paddingLeft: 10, color: "var(--dim)", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                {r.label}
              </span>
              <div className="relative" style={{ flex: 1, height: "100%" }}>
                {months.map((m) => <span key={m.at} className="absolute" style={{ left: pct(m.at) + "%", top: 0, bottom: 0, borderLeft: "1px solid #F0EEE8" }} />)}
                {TODAY >= min && TODAY <= max && <span className="absolute" style={{ left: pct(TODAY) + "%", top: 0, bottom: 0, borderLeft: "2px solid #B3261E" }} />}
                <span
                  className="absolute rounded"
                  title={`${r.label} · ${fmtFull(r.start)} → ${fmtFull(r.end)}`}
                  style={{
                    left: pct(r.start) + "%",
                    width: Math.max(0.7, pct(addDays(r.end, 1)) - pct(r.start)) + "%",
                    top: 4, height: 11,
                    background: r.hollow ? "transparent" : r.colour,
                    border: r.hollow ? `1.5px dashed ${r.colour}` : "none",
                  }}
                />
              </div>
            </div>
          ),
        )}
        <div className="text-xs mt-1.5" style={{ color: "#B8B5AC" }}>
          <span style={{ color: "var(--accent)" }}>■</span> project plan · <span style={{ color: "var(--blue)" }}>■</span> job milestones · <span style={{ color: "var(--green)" }}>■</span> done · ◆ TDD · <span style={{ color: "var(--red)" }}>│</span> today
        </div>
      </div>
    </div>
  );
}

/**
 * The project plan, edited in place — the main items till delivery. The exact
 * job-plan payload goes to the exact same API; only the tables beneath differ.
 */
export function ProjectPlanEditor({
  id, plan, onDone,
}: {
  id: string;
  plan?: (Plan & { baseline_on?: string | null; baseline_end?: string | null }) | undefined;
  onDone: () => Promise<void>;
}) {
  const seed: PlanMilestone[] = plan?.milestones?.length
    ? plan.milestones.map((m) => ({ ...m }))
    : [
        { name: "Design & GA approval", days: 7, preds: [], crew: {} as PlanMilestone["crew"], shift: "D", offset: 0 },
        { name: "Procurement & kitting", days: 14, preds: [1], crew: {} as PlanMilestone["crew"], shift: "D", offset: 0 },
        { name: "Fabrication", days: 21, preds: [2], crew: {} as PlanMilestone["crew"], shift: "D", offset: 0 },
        { name: "Assembly & trials", days: 10, preds: [3], crew: {} as PlanMilestone["crew"], shift: "D", offset: 0 },
        { name: "Dispatch & delivery", days: 3, preds: [4], crew: {} as PlanMilestone["crew"], shift: "D", offset: 0 },
      ];
  const [start, setStart] = useState(plan?.start || TODAY);
  const [rows, setRows] = useState<PlanMilestone[]>(seed);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const upd = (i: number, patch: Partial<PlanMilestone>) =>
    setRows((r) => r.map((m, x) => (x === i ? { ...m, ...patch } : m)));
  const sched = computeSchedule({ start, milestones: rows });
  const delivery = sched.length ? sched.reduce((a, m) => (m.end > a ? m.end : a), sched[0].end) : null;

  const save = async () => {
    setBusy(true); setMsg("");
    try {
      await api.post("/api/plan", { job_id: id, start, milestones: rows });
      await onDone();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); setBusy(false); }
  };

  return (
    <div className="rounded border p-2.5 mb-2" style={{ borderColor: "var(--line)", background: "#FBFAF7" }}>
      <div className="flex items-center gap-2 flex-wrap mb-1.5 text-xs">
        <span className="font-bold" style={{ color: "var(--muted)" }}>Start</span>
        <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="border rounded px-1.5 py-0.5" style={{ borderColor: "var(--line)", background: "#fff" }} />
        {delivery && <span style={{ color: "var(--dim)" }}>→ delivery by <b style={{ color: "var(--green)" }}>{fmtFull(delivery)}</b></span>}
        {msg && <span style={{ color: "var(--red)" }}>{msg}</span>}
      </div>
      <table className="w-full text-xs genie-table" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ color: "var(--muted)" }}>
            <th className="text-left px-1 py-0.5">#</th>
            <th className="text-left px-1 py-0.5">MAIN ITEM</th>
            <th className="text-left px-1 py-0.5" title="Working days">DAYS</th>
            <th className="text-left px-1 py-0.5" title="Runs after milestone number(s), e.g. 1,2">AFTER</th>
            <th className="text-left px-1 py-0.5">RUNS</th>
            <th className="text-left px-1 py-0.5" title="Done">✓</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((m, i) => {
            const sm = sched[i];
            return (
              <tr key={i} style={{ borderTop: "1px solid #F0EEE8" }}>
                <td className="px-1 py-0.5 tnum" style={{ color: "var(--muted)" }}>{i + 1}</td>
                <td className="px-1 py-0.5" style={{ minWidth: 180 }}>
                  <input value={m.name} onChange={(e) => upd(i, { name: e.target.value })} className="w-full border rounded px-1.5 py-0.5" style={{ borderColor: "var(--line)", background: "#fff" }} />
                </td>
                <td className="px-1 py-0.5">
                  <input type="number" min={1} value={m.days} onChange={(e) => upd(i, { days: Number(e.target.value) || 1 })} className="border rounded px-1.5 py-0.5 tnum" style={{ borderColor: "var(--line)", background: "#fff", width: 52 }} />
                </td>
                <td className="px-1 py-0.5">
                  <input value={(m.preds || []).join(",")} onChange={(e) => upd(i, { preds: e.target.value.split(",").map((x) => parseInt(x.trim(), 10)).filter((n) => n > 0) })} placeholder="—" className="border rounded px-1.5 py-0.5 tnum" style={{ borderColor: "var(--line)", background: "#fff", width: 56 }} />
                </td>
                <td className="px-1 py-0.5 tnum" style={{ color: "var(--dim)", whiteSpace: "nowrap" }}>{sm ? `${fmt(sm.start)} → ${fmt(sm.end)}` : "—"}</td>
                <td className="px-1 py-0.5">
                  <input type="checkbox" checked={!!m.done} onChange={() => upd(i, { done: !m.done, done_on: !m.done ? TODAY : null })} style={{ accentColor: "var(--green)" }} />
                </td>
                <td className="px-1 py-0.5">
                  <button onClick={() => setRows((r) => r.filter((_, x) => x !== i))} title="Remove" style={{ color: "#B8B5AC" }}>✕</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex gap-2 mt-1.5">
        <button onClick={() => setRows((r) => [...r, { name: "", days: 5, preds: r.length ? [r.length] : [], crew: {} as PlanMilestone["crew"], shift: "D", offset: 0 }])} className="text-xs font-bold rounded px-2 py-1 border" style={{ borderColor: "var(--line)", color: "var(--blue)", background: "#fff" }}>＋ main item</button>
        <button onClick={() => void save()} disabled={busy} className="text-xs font-bold rounded px-3 py-1" style={{ background: busy ? "#B9BEC4" : "var(--accent)", color: "#fff" }}>{busy ? "Saving…" : "Save the project plan"}</button>
      </div>
    </div>
  );
}