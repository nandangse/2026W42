"use client";
// split out of PlanningSuite.tsx (Genie 5.0.1.1) — one file per tab, loaded when opened
import React, { useMemo, useState } from "react";

import { today, fmtFull, jobNo } from "@/lib/schedule";

import JobsInProgress, { type WipJob } from "../JobsInProgress";

import { Board, Job, TODAY } from "./shared";
import { mode, tpOf } from "./DeliveryBoard";

// ============================ Delivery board ============================
/** Jobs in Progress — the pending book as three charts. See JobsInProgress.tsx. */
export function JobsInProgressTab({ board, V, onOpen, canEdit, reload }: { board: Board; V: (n: number) => string; onOpen: (id: string) => void; canEdit: boolean; reload: () => Promise<Board | null> }) {
  const jobs: WipJob[] = board.jobs.map((j) => ({
    id: j.id, tag: j.tag, cust: j.cust, fam: j.fam || "Unassigned",
    tdd: j.tdd, otd: j.otd, stat: j.stat, val: j.val, tpv: j.tpv, tpp: j.tpp,
    kit: j.kit, pct: j.pct, note: j.note, escalation: j.escalation,
    amtNeeded: j.amtNeeded, payOnDelivery: j.payOnDelivery, mandays: j.mandays ?? null,
    ownerInitials: j.ownerInitials, ownerName: j.ownerName,
  }));
  return (
    <>
      <JobsInProgress jobs={jobs} today={TODAY} V={V} onOpenPlan={onOpen} canEdit={canEdit} onSaved={reload} />
      <ProjectsInProgress board={board} V={V} onOpen={onOpen} />
    </>
  );
}

/**
 * The book one level up: projects rather than jobs.
 *
 * A project is several jobs sold together, and it is how the customer thinks
 * about the order — six lifts on one PO is one conversation, not six. The jobs
 * are the unit of work; this is the unit of the promise.
 *
 * Every figure except the project's own name and dates is derived from the
 * jobs on it, because `projects.job_numbers` is empty on every row the ERP has
 * ever sent — the link that actually works is jobs.proj.
 */
export function ProjectsInProgress({
  board,
  V,
  onOpen,
}: {
  board: Board;
  V: (n: number) => string;
  onOpen: (id: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo(() => {
    const byProj = new Map<string, Job[]>();
    for (const j of board.jobs) {
      const p = String(j.proj || "").trim();
      if (!p) continue;                       // a job with no project is just a job
      byProj.set(p, [...(byProj.get(p) || []), j]);
    }
    const meta = new Map<string, Record<string, unknown>>(
      (board.projects || []).map((p: Record<string, unknown>) => [String(p.id), p]),
    );
    return [...byProj.entries()]
      .map(([id, list]) => {
        const p = meta.get(id) || {};
        const tdds = list.map((j) => j.tdd).filter(Boolean).sort() as string[];
        return {
          id,
          // Blank until an upload supplies it (migration 0034) -- deliberately
          // never guessed from a job description.
          name: String(p.name || "").trim(),
          cust: String(p.cust || "").trim() || mode(list.map((j) => j.cust)),
          stage: String(p.stage || "").trim(),
          mgr: String(p.mgr || "").trim(),
          // The ERP's expected end, and what the jobs actually say. Both,
          // because they disagree on most projects and the gap is the point.
          expEnd: (p.exp_end as string) || null,
          lastTdd: tdds.length ? tdds[tdds.length - 1] : null,
          jobs: list.sort((a, b) => String(a.tdd || "9999").localeCompare(String(b.tdd || "9999"))),
          val: list.reduce((s, j) => s + (j.val || 0), 0),
          tp: list.reduce((s, j) => s + tpOf(j), 0),
        };
      })
      // Soonest last delivery first: the project closest to being finished.
      .sort((a, b) => String(a.lastTdd || "9999").localeCompare(String(b.lastTdd || "9999")));
  }, [board.jobs, board.projects]);

  if (!rows.length) return null;
  const noName = rows.filter((r) => !r.name).length;

  return (
    <div className="px-4 pb-6">
      <div className="flex items-baseline gap-2 mb-2 flex-wrap">
        <h2 className="font-bold text-lg" style={{ color: "var(--navy)" }}>Projects in Progress</h2>
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          {rows.length} projects · {rows.reduce((s, r) => s + r.jobs.length, 0)} of the {board.jobs.length} live jobs sit on one
          {noName > 0 && ` · ${noName} carry no project name yet — the next Projects upload fills them`}
        </span>
      </div>

      <div className="bg-white rounded-lg border overflow-x-auto" style={{ borderColor: "var(--line)" }}>
        <table className="w-full text-xs genie-table" style={{ minWidth: 940 }}>
          <thead>
            <tr style={{ background: "var(--ink)", color: "#fff" }}>
              <th className="px-2 py-2 text-left">Project No</th>
              <th className="px-2 py-2 text-left">Project Name</th>
              <th className="px-2 py-2 text-left">Customer</th>
              <th className="px-2 py-2 text-center">Expected completion</th>
              <th className="px-2 py-2 text-center">Last job TDD</th>
              <th className="px-2 py-2 text-center">Jobs</th>
              <th className="px-2 py-2 text-center">Value</th>
              <th className="px-2 py-2 text-center">Throughput</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              // The ERP's expected end has passed on most of these. Saying so
              // is the whole reason the column is here.
              const stale = !!(r.expEnd && r.expEnd < TODAY);
              return (
                <React.Fragment key={r.id}>
                  <tr
                    className="border-t"
                    style={{ borderColor: "var(--line-soft)", background: i % 2 ? "#FAF9F5" : "#fff", cursor: "pointer" }}
                    role="button" tabIndex={0} onClick={() => setOpen(open === r.id ? null : r.id)}
                    title="Show the jobs on this project"
                  >
                    <td className="px-2 py-1.5 font-bold whitespace-nowrap" style={{ color: "var(--blue)" }}>
                      {open === r.id ? "▾ " : "▸ "}{r.id.replace(/^NGSE-PROJ-/, "")}
                    </td>
                    <td className="px-2 py-1.5" style={{ color: r.name ? "var(--ink)" : "#B8B5AC" }}>
                      {r.name || "— not in the export —"}
                      {r.stage && <div style={{ color: "var(--muted)" }}>{r.stage}</div>}
                    </td>
                    <td className="px-2 py-1.5">{r.cust || <span style={{ color: "#B8B5AC" }}>—</span>}</td>
                    <td className="px-2 py-1.5 text-center whitespace-nowrap" style={{ color: stale ? "var(--red)" : "var(--ink)", fontWeight: stale ? 700 : 400 }}>
                      {fmtFull(r.expEnd)}
                      {stale && <div style={{ fontSize: 10 }}>already passed</div>}
                    </td>
                    <td className="px-2 py-1.5 text-center whitespace-nowrap font-bold" style={{ color: r.lastTdd && r.lastTdd < TODAY ? "var(--red)" : "var(--ink)" }}>{fmtFull(r.lastTdd)}</td>
                    <td className="px-2 py-1.5 text-center font-bold tnum">{r.jobs.length}</td>
                    <td className="px-2 py-1.5 text-center whitespace-nowrap tnum">{V(r.val)}</td>
                    <td className="px-2 py-1.5 text-center whitespace-nowrap tnum font-semibold" style={{ color: "var(--green)" }}>{V(r.tp)}</td>
                  </tr>
                  {open === r.id && r.jobs.map((j) => (
                    <tr key={j.id} style={{ background: "#F4F7FB" }}>
                      <td className="px-2 py-1"></td>
                      <td className="px-2 py-1 font-bold" style={{ color: "var(--blue)" }}>
                        <button onClick={() => onOpen(j.id)} style={{ textDecoration: "underline" }} title="Open this job's plan">{jobNo(j.id)}</button>
                      </td>
                      <td className="px-2 py-1" colSpan={2}>{j.tag}</td>
                      <td className="px-2 py-1 text-center whitespace-nowrap" style={{ color: j.tdd && j.tdd < TODAY ? "var(--red)" : "var(--dim)" }}>{fmtFull(j.tdd)}</td>
                      <td className="px-2 py-1 text-center" style={{ color: "var(--muted)" }}>{j.pct}% built</td>
                      <td className="px-2 py-1 text-center whitespace-nowrap tnum">{V(j.val)}</td>
                      <td className="px-2 py-1 text-center whitespace-nowrap tnum" style={{ color: "var(--green)" }}>{V(tpOf(j))}</td>
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}