"use client";
// split out of PlanningSuite.tsx (Genie 5.0.1.1) — one file per tab, loaded when opened
import React, { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "@/lib/api";

import { taskSheetHtml, type SheetJob } from "@/lib/task-sheet";
import { taskJpg } from "@/lib/task-jpg";
import { fmt, fmtFull, jobNo, initials, whoTag, computeSchedule, manDays, isoWeek, dueStyle, toISO, TASK_CATS, catColour, ESC_LEVELS, escalated } from "@/lib/schedule";

import { Board, GROUP_ORDER, Job, Person, TODAY, Task, assignees, myHandles, personLabel, taskJobRef, taskLate } from "./shared";
import { TodayItem } from "./MyWeek";
import { MyTasks } from "./MyTasks";

// task card used in the Job Plan kanban + Tasking board
export function TaskCard({ t, onOpen, onDelete }: { t: Task; onOpen: (t: Task) => void; onDelete?: (t: Task) => void }) {
  return (
    <div onClick={() => onOpen(t)} className="rounded p-2 mb-1.5 cursor-pointer border relative group" style={{ ...dueStyle(t.done ? null : t.due), borderColor: "rgba(0,0,0,0.08)", opacity: t.done ? 0.45 : 1 }}>
      {onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(t); }}
          className="absolute rounded font-bold"
          style={{ top: 2, right: 3, width: 16, height: 16, lineHeight: "14px", fontSize: 11, background: "rgba(0,0,0,0.10)", color: "var(--red)" }}
          title="Delete this task"
        >
          ✕
        </button>
      )}
      <div className="text-xs font-semibold" style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden", textDecoration: t.done ? "line-through" : "none", paddingRight: onDelete ? 16 : 0 }}>{t.t}</div>
      <div className="flex items-center justify-between mt-1 text-xs" style={{ opacity: 0.85 }}>
        <span className="font-bold rounded px-1" style={{ background: "rgba(0,0,0,0.12)" }}>{t.who ? (t.who.length <= 3 ? t.who.toUpperCase() : initials(t.who)) : "—"}</span>
        {t.esc && t.esc !== "None" && (<span className="font-bold rounded px-1" style={{ background: "var(--red)", color: "#fff", fontSize: 9 }}>⚠ {t.esc.slice(0, 2)}</span>)}
        <span style={{ fontSize: 10 }}>{(t.cat || "").toLowerCase()}</span>
        <span className="tnum">{fmt(t.due)}</span>
      </div>
    </div>
  );
}

// ============================ Tasking ============================
/** The six ways of looking at the same task list. */
export const TASKING_VIEWS = [
  /* MY TASKS FIRST (Dr Raghu, 5 Oct 2026): the list a person opens for, before the board */
  ["my", "✅ My Tasks"],
  ["jobs", "By Jobs"],
  ["projects", "By Projects"],
  ["dept", "By Department"],
  ["goals", "By Goals"],
  ["esc", "By Escalations"],
  ["dump", "🧠 Brain Dump"],
] as const;

export type TaskingView = (typeof TASKING_VIEWS)[number][0];

export function Tasking({
  board,
  onOpen,
  reload,
  me,
  people,
  seesAll = false,
}: {
  board: Board;
  onOpen: (id: string) => void;
  reload: () => Promise<Board | null>;
  me: { email: string; initials: string | null; displayName: string | null; erpOwner: string | null; role: string };
  people: Person[];
  /**
   * EVERYBODY'S TASKS ARE STRATCOM'S AND THE OWNER'S (Dr Raghu, 5 Oct 2026:
   * "the Stratcom can see everybody's. I can see, of course, also everybody.
   * Others can only see their own tasks"). Everyone else is held to their
   * own three views, and an empty set of ticks no longer means "everybody".
   */
  seesAll?: boolean;
}) {
  /** Deleting a task is admin-only; everyone else closes it. */
  const isAdminHere = me.role === "admin";
  /* My Tasks is where Tasking opens; the last view chosen comes back on reload */
  const [view, setViewState] = useState<TaskingView>(() => {
    try { const v = localStorage.getItem("genie.tasking.view"); if (v && TASKING_VIEWS.some(([k]) => k === v)) return v as TaskingView; } catch { /* fine */ }
    return "my";
  });
  const setView = (v: TaskingView) => { setViewState(v); try { localStorage.setItem("genie.tasking.view", v); } catch { /* fine */ } };
  const [filterCust, setFilterCust] = useState("all");
  const [filterFam, setFilterFam] = useState("all");
  const [filterOwn, setFilterOwn] = useState("all");
  const [taskAll, setTaskAll] = useState(false);
  // SHOW COMPLETED, OFF BY DEFAULT (Dr Raghu, 8 Oct 2026: "by default only the open tasks will be seen")
  const [showDone, setShowDone] = useState(false);
  const [taskView, setTaskView] = useState<"board" | "cal">("board");
  const [calMonth, setCalMonth] = useState(TODAY.slice(0, 7));
  /**
   * Dragging a chip to another day.
   *
   * The date is written straight away and the board re-read — no confirm. A
   * drag is already a deliberate act, and a dialog after every one would make
   * re-planning a week slower than typing the dates in, which is the thing
   * this replaces. Getting it wrong costs one drag back.
   */
  const [dragTask, setDragTask] = useState<Task | null>(null);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const moveTaskTo = async (day: string) => {
    const t = dragTask;
    setDragTask(null);
    if (!t || t.due === day) return;
    try {
      await api.post("/api/tasks", { action: "update", id: t.id, kind: t.kind, due: day });
      await reload();
    } catch (e) { alert(e instanceof Error ? e.message : String(e)); }
  };
  const [adding, setAdding] = useState<string | null>(null);
  const [form, setForm] = useState({ t: "", who: "", due: TODAY, cat: "Production", esc: "None", esc_why: "" });
  const [lightbox, setLightbox] = useState<Task | null>(null);

  const [dueUpTo, setDueUpTo] = useState("");

  // ---- whose tasks: all three on by default, so the board opens complete ----
  const [scope, setScope] = useState({ mine: true, byMe: true, reports: true });

  /** My own account row — the anchor for "who reports to me". */
  const myProfile = useMemo(
    () => people.find((p) => p.email.toLowerCase() === me.email.toLowerCase()) || null,
    [people, me.email],
  );
  /** Every string a direct report's task might be filed under. */
  const reportHandles = useMemo(() => {
    if (!myProfile) return new Set<string>();
    const s = new Set<string>();
    for (const p of people) {
      if (p.reportsTo !== myProfile.id) continue;
      for (const v of [p.initials, p.name, p.erpOwner, p.email, p.email.split("@")[0]])
        if (v) s.add(String(v).toLowerCase());
    }
    return s;
  }, [people, myProfile]);
  const reportCount = useMemo(
    () => (myProfile ? people.filter((p) => p.reportsTo === myProfile.id).length : 0),
    [people, myProfile],
  );
  const mineHandles = useMemo(() => myHandles(me), [me]);

  const anyScope = scope.mine || scope.byMe || scope.reports;
  const inScope = useCallback(
    (t: Task) => {
      if (!anyScope) {
        if (seesAll) return true; // nothing ticked reads as "show me everything" — Stratcom and the owner only
        return mineHandles.has(String(t.who || "").toLowerCase()) || (!!t.by && t.by.toLowerCase() === me.email.toLowerCase());
      }
      const who = String(t.who || "").toLowerCase();
      if (scope.mine && mineHandles.has(who)) return true;
      if (scope.byMe && t.by && t.by.toLowerCase() === me.email.toLowerCase()) return true;
      if (scope.reports && reportHandles.has(who)) return true;
      return false;
    },
    [anyScope, scope, mineHandles, reportHandles, me.email, seesAll],
  );

  const custs = useMemo(() => [...new Set(board.jobs.map((j) => j.cust))].sort(), [board]);
  const fams = useMemo(() => [...new Set(board.jobs.map((j) => j.fam))].sort(), [board]);
  const owners = board.owners;
  // "up to date" filter: only tasks due on/before the chosen date (blank = all),
  // then the who-filter above it
  const filteredTasks = useMemo(
    () => board.tasks.filter((t) => (showDone || !t.done) && (!dueUpTo || (t.due || "9999-12-31") <= dueUpTo) && inScope(t)),
    [board, dueUpTo, inScope, showDone],
  );
  // group tasks by job once instead of scanning the whole task list per job
  const tasksByJob = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of filteredTasks) {
      const arr = m.get(t.j);
      if (arr) arr.push(t);
      else m.set(t.j, [t]);
    }
    // pre-sort each bucket by due date — the render used to sort on every pass
    for (const arr of m.values()) arr.sort((a, b) => ((a.due || "9999") < (b.due || "9999") ? -1 : 1));
    return m;
  }, [filteredTasks]);

  const taskingJobs = useMemo(() => {
    const withTasks = taskAll ? board.jobs : board.jobs.filter((j) => tasksByJob.has(j.id));
    return withTasks
      .filter((j) => (filterCust === "all" || j.cust === filterCust) && (filterFam === "all" || j.fam === filterFam) && (filterOwn === "all" || j.ownerInitials === filterOwn))
      .sort((a, b) => ((a.tdd || "9999") < (b.tdd || "9999") ? -1 : 1));
  }, [board.jobs, tasksByJob, filterCust, filterFam, filterOwn, taskAll]);

  /**
   * THE PENDING-TASK SHEET — one job to a page.
   *
   * Dr Raghu, 30 Sep 2026: "pending tasks for every job in an A4 portrait ...
   * sorted by the assigned person ... a page break for every job and also
   * sort by the TDD of the job."
   *
   * Both buttons read the SAME filtered set the board is showing, so what is
   * downloaded is what is on screen. A pack that quietly includes jobs the
   * filter excluded is a pack nobody trusts twice.
   */
  const sheetFor = useCallback((j: typeof board.jobs[number]): SheetJob => ({
    id: j.id, tag: j.tag || "", fam: j.fam || "", cust: j.cust || "",
    tdd: j.tdd ?? null, otd: j.otd ?? null,
    owner: j.own || j.ownerInitials || null,
    kit: Math.round(Number(j.kit) || 0), pct: Math.round(Number(j.pct) || 0),
    stat: j.stat ?? null,
    tasks: (tasksByJob.get(j.id) ?? []).filter((t) => !t.done).map((t) => ({
      t: t.t, who: t.who ?? null, due: t.due ?? null, cat: t.cat ?? null,
      esc: t.esc ?? null, original_due: t.original_due ?? null, push_count: t.push_count ?? null,
    })),
  }), [tasksByJob]);

  /** The whole filtered board as one A4 pack, a page per job, TDD order. */
  const openTaskPack = useCallback(() => {
    const jobs = taskingJobs.map(sheetFor);
    const html = taskSheetHtml(jobs, TODAY, `Pending tasks — ${jobs.length} job${jobs.length === 1 ? "" : "s"}`);
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    /* The print dialog is opened for them — "Save as PDF" is a destination in
       it on every platform this runs on, so this needs no library. */
    setTimeout(() => w.print(), 400);
  }, [taskingJobs, sheetFor]);

  /** One job, as a picture that can go into a chat. */
  const downloadTaskJpg = useCallback((j: typeof board.jobs[number]) => {
    const url = taskJpg(sheetFor(j), TODAY);
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `pending-${jobNo(j.id)}-${TODAY}.jpg`;
    a.click();
  }, [sheetFor]);

  // next upcoming crewed milestone per job — computeSchedule ran for every job
  // on every render (including every keystroke in a filter); now once per plan change
  const nextMilestone = useMemo(() => {
    const m = new Map<string, { idx: number; name: string; end: string }>();
    for (const [jobId, plan] of Object.entries(board.plans)) {
      if (!plan?.milestones?.length) continue;
      const nx = computeSchedule({ start: plan.start || TODAY, milestones: plan.milestones })
        .find((s) => s.end >= TODAY && manDays(s) > 0);
      if (nx) m.set(jobId, { idx: nx.idx, name: nx.name, end: nx.end });
    }
    return m;
  }, [board.plans]);

  const submit = async (jid: string) => {
    if (!form.t.trim()) return;
    await api.post("/api/tasks", { action: "create", job_id: jid, title: form.t.trim(), who: form.who, due: form.due, cat: form.cat, esc: form.esc });
    setForm({ t: "", who: "", due: TODAY, cat: form.cat, esc: "None", esc_why: "" });
    setAdding(null);
    await reload();
  };
  const deleteTask = async (t: Task) => {
    const warn = t.kind === "erp"
      ? "\n\n⚠ From the ERP ToDo list — the next upload will bring it back unless it is closed in the ERP."
      : "";
    if (!window.confirm(`Delete "${t.t}"?${warn}\n\nThis cannot be undone.`)) return;
    try { await api.post("/api/tasks", { action: "delete", id: t.id, kind: t.kind }); await reload(); }
    catch (e) { alert(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <div className="p-4">
      {/* ---- the six ways of reading the same list ---- */}
      <div className="flex gap-1 rounded p-1 bg-white border mb-2" style={{ borderColor: "#D9D6CD", width: "fit-content", overflowX: "auto" }}>
        {TASKING_VIEWS.map(([k, l]) => (
          <button
            key={k}
            onClick={() => setView(k)}
            className="px-3 py-1 rounded text-sm font-semibold whitespace-nowrap"
            style={view === k ? { background: "var(--accent)", color: "#fff" } : { color: "var(--dim)" }}
          >
            {l}
          </button>
        ))}
      </div>

      {/* ---- whose tasks: all three on by default ---- */}
      {view !== "dump" && view !== "my" && (
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="text-xs font-bold" style={{ color: "var(--muted)" }}>SHOW</span>
          {([
            ["mine", "My tasks", "Tasks assigned to you"],
            ["byMe", "Tasks assigned by me", "Tasks you raised, whoever is carrying them"],
            ["reports", `Tasks of people reporting to me${reportCount ? ` (${reportCount})` : ""}`, reportCount ? "Direct reports, set in Admin → User management" : "Nobody reports to you yet — set it in Admin → User management"],
          ] as const).map(([k, label, hint]) => (
            <label
              key={k}
              className="text-xs flex items-center gap-1 px-2 py-1.5 rounded border cursor-pointer font-semibold"
              style={{
                borderColor: scope[k] ? "var(--accent)" : "#D9D6CD",
                background: scope[k] ? "#FFF3E8" : "#fff",
                color: scope[k] ? "var(--accent)" : "var(--muted)",
              }}
              title={hint}
            >
              <input type="checkbox" checked={scope[k]} onChange={(e) => setScope({ ...scope, [k]: e.target.checked })} />
              {label}
            </label>
          ))}
          {/* Everybody's tasks, in one click.
              It was always possible — clearing all three tick-boxes has always
              read as "show me everything" — but nobody could be expected to
              guess that, and "nothing ticked" looks like "nothing shown". This
              is the same state with a name on it. Pressing it again puts the
              three back, because the way out of a filter has to be as obvious
              as the way in. */}
          {seesAll && <button
            onClick={() => setScope(anyScope ? { mine: false, byMe: false, reports: false } : { mine: true, byMe: true, reports: true })}
            className="text-xs px-2 py-1.5 rounded border font-semibold"
            style={anyScope
              ? { borderColor: "#D9D6CD", background: "#fff", color: "var(--dim)" }
              : { borderColor: "var(--ink)", background: "var(--ink)", color: "#fff" }}
            title={anyScope
              ? "Everybody's tasks, whoever they are assigned to and whoever raised them"
              : "Back to your own three views"}
          >
            {anyScope ? "All tasks" : "◉ All tasks"}
          </button>}
          {!anyScope && seesAll && (
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              everybody&apos;s tasks — the three filters above are off
            </span>
          )}
        </div>
      )}

      {view === "my" ? (
        <MyTasks board={board} me={me} reload={reload} onOpen={onOpen} onOpenTask={setLightbox} onDelete={isAdminHere ? deleteTask : undefined} />
      ) : view === "dump" ? (
        <BrainDump board={board} reload={reload} />
      ) : (
      <>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select value={filterCust} onChange={(e) => setFilterCust(e.target.value)} className="px-2 py-1.5 rounded border bg-white text-sm" style={{ borderColor: "#D9D6CD", maxWidth: 240 }}>
          <option value="all">All customers</option>{custs.map((c) => (<option key={c}>{c}</option>))}
        </select>
        <select value={filterOwn} onChange={(e) => setFilterOwn(e.target.value)} className="px-2 py-1.5 rounded border bg-white text-sm" style={{ borderColor: "#D9D6CD" }} title="Filter by the job's Planning Owner">
          <option value="all">All planning owners</option>
          {(board.projectOwners || []).map((p) => (<option key={p.initials!} value={p.initials!}>{personLabel(p)}</option>))}
        </select>
        <select value={filterFam} onChange={(e) => setFilterFam(e.target.value)} className="px-2 py-1.5 rounded border bg-white text-sm" style={{ borderColor: "#D9D6CD" }}>
          <option value="all">All products</option>{fams.map((f) => (<option key={f}>{f}</option>))}
        </select>
        <label className="text-xs flex items-center gap-1 px-2 py-1.5 rounded border bg-white cursor-pointer" style={{ borderColor: "#D9D6CD", color: "var(--dim)" }}>
          <input type="checkbox" checked={taskAll} onChange={(e) => setTaskAll(e.target.checked)} /> include jobs without tasks
        </label>
        <label className="text-xs flex items-center gap-1 px-2 py-1.5 rounded border cursor-pointer" style={{ borderColor: showDone ? "var(--accent)" : "#D9D6CD", color: showDone ? "var(--accent)" : "var(--dim)", background: "#fff", fontWeight: showDone ? 700 : 400 }} title="Completed tasks are hidden unless this is on">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Show completed
        </label>
        <label className="text-xs flex items-center gap-1 px-2 py-1.5 rounded border bg-white" style={{ borderColor: "#D9D6CD", color: "var(--dim)" }} title="Only show tasks due on or before this date">
          due up to
          <input type="date" value={dueUpTo} onChange={(e) => setDueUpTo(e.target.value)} className="text-xs border rounded px-1 py-0.5" style={{ borderColor: "var(--line)" }} />
          {dueUpTo && (<button onClick={() => setDueUpTo("")} className="font-bold" style={{ color: "var(--accent)" }} title="Clear">✕</button>)}
        </label>
        {view === "jobs" && (
          <div className="flex gap-1 rounded p-1 bg-white border" style={{ borderColor: "#D9D6CD" }}>
            {(["board", "cal"] as const).map((k) => (<button key={k} onClick={() => setTaskView(k)} className="px-3 py-1 rounded text-sm font-semibold" style={taskView === k ? { background: "var(--ink)", color: "#fff" } : { color: "var(--dim)" }}>{k === "board" ? "Board" : "📅 Calendar (ISO weeks)"}</button>))}
            {/* THE WHOLE FILTERED BOARD AS A PACK — a page per job, in the
                order the work has to leave the gate. */}
            <button onClick={openTaskPack} disabled={!taskingJobs.length}
              className="px-3 py-1 rounded text-sm font-bold"
              style={{ background: "#fff", border: "1px solid var(--navy)", color: "var(--navy)", opacity: taskingJobs.length ? 1 : .45 }}
              title="A4 portrait, one page per job, sorted by target delivery — opens the print dialog where Save as PDF is a destination">
              ⬇ PDF — pending by job ({taskingJobs.length})
            </button>
          </div>
        )}
      </div>

      {view !== "jobs" && (
        <GroupedTasks
          view={view}
          board={board}
          reload={reload}
          jobs={taskingJobs}
          tasksByJob={tasksByJob}
          onOpen={onOpen}
          onOpenTask={setLightbox}
          onDelete={isAdminHere ? deleteTask : undefined}
        />
      )}

      {view === "jobs" && taskView === "board" && taskingJobs.length === 0 && (
        <div className="bg-white border rounded-lg p-6 text-center text-sm" style={{ borderColor: "var(--line)", color: "var(--muted)" }}>No jobs with open tasks match this filter — tick &quot;include jobs without tasks&quot; to board every job and add their first tasks here.</div>
      )}

      {view === "jobs" && taskView === "board" && (
        <div className="space-y-3">
          {taskingJobs.map((j) => {
            const jt = tasksByJob.get(j.id) ?? [];
            let open = 0;
            for (const t of jt) if (!t.done) open++;
            const nx = nextMilestone.get(j.id) ?? null;
            return (
              <div key={j.id} className="flex gap-2 items-stretch">
                {/* job card — fixed on the left */}
                <div className="rounded-lg p-2 flex-shrink-0" style={{ width: 250, background: "var(--navy)", color: "#fff", borderLeft: "4px solid #E8600A" }}>
                  {/* the customer tag is the identity people recognise; job no is the fine print */}
                  <div className="flex justify-between items-baseline gap-2">
                    <button onClick={() => onOpen(j.id)} className="font-bold text-sm underline decoration-dotted truncate text-left" style={{ color: "var(--amber)", maxWidth: 175 }} title={`${j.tag} · JOB ${jobNo(j.id)}`}>{j.tag}</button>
                    <span className="text-xs font-bold flex-shrink-0" style={{ color: open ? "var(--amber)" : "#7BC67E" }}>{open} open</span>
                  </div>
                  <div className="text-xs opacity-70">JOB {jobNo(j.id)} · TDD {fmt(j.tdd)}{j.own ? " · " + j.own : ""}</div>
                  <div className="text-xs opacity-70 truncate">{j.cust}</div>
                  {/* THE SHEET FOR THIS ONE JOB, as a picture that can be sent
                      (Dr Raghu, 30 Sep 2026). A4 proportions, so it sits beside
                      the printed pack without looking like a different document. */}
                  <button onClick={() => downloadTaskJpg(j)} disabled={!open}
                    className="mt-1.5 w-full rounded py-1 text-xs font-bold"
                    style={{ background: open ? "rgba(255,255,255,.14)" : "rgba(255,255,255,.06)",
                             color: open ? "#fff" : "rgba(255,255,255,.35)", border: "1px solid rgba(255,255,255,.25)" }}
                    title={open ? "Download this job's pending tasks as a JPG — sorted by person, one A4" : "Nothing open on this job"}>
                    ⬇ Pending JPG
                  </button>
                </div>
                {/* tasks — flow horizontally across the screen */}
                <div className="flex flex-wrap gap-1.5 flex-1 items-start rounded-lg p-2" style={{ background: "#E9E6DD" }}>
                  {nx && (
                    <div onClick={() => onOpen(j.id)} className="rounded p-2 cursor-pointer border" style={{ background: "#DDE6EE", borderColor: "#B9C7D4", width: 210 }}>
                      <div className="text-xs font-bold" style={{ color: "var(--blue)" }}>⚑ Next milestone: M{nx.idx} {nx.name}</div>
                      <div className="text-xs flex justify-between mt-0.5" style={{ color: "var(--dim)" }}><span>from the job plan</span><span className="tnum">{fmt(nx.end)}</span></div>
                    </div>
                  )}
                  {jt.map((t) => (<div key={t.id} style={{ width: 210 }}><TaskCard onOpen={setLightbox} onDelete={isAdminHere ? deleteTask : undefined} t={t} /></div>))}
                  {adding === j.id ? (
                    <div style={{ width: 240 }}><AddTaskForm form={form} setForm={setForm} owners={assignees(board)} onSubmit={() => submit(j.id)} onCancel={() => setAdding(null)} /></div>
                  ) : (
                    <button onClick={() => setAdding(j.id)} className="text-xs font-bold rounded border border-dashed px-3 self-stretch" style={{ borderColor: "var(--accent)", color: "var(--accent)", minHeight: 40 }}>+ Add task</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view === "jobs" && taskView === "cal" && (() => {
        const [yy, mm] = calMonth.split("-").map(Number);
        const first = new Date(Date.UTC(yy, mm - 1, 1));
        const monStart = new Date(first); monStart.setUTCDate(monStart.getUTCDate() - ((monStart.getUTCDay() + 6) % 7));
        const lastD = new Date(Date.UTC(yy, mm, 0)); const sunEnd = new Date(lastD); sunEnd.setUTCDate(sunEnd.getUTCDate() + (6 - ((sunEnd.getUTCDay() + 6) % 7)));
        const days: string[] = []; for (let d = new Date(monStart); d <= sunEnd; d.setUTCDate(d.getUTCDate() + 1)) days.push(toISO(new Date(d)));
        const weeks: string[][] = []; for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
        const jset = new Set(taskingJobs.map((j) => j.id));
        const openT = filteredTasks.filter((t) => !t.done && t.due && jset.has(t.j));
        const byDay: Record<string, Task[]> = {}; openT.forEach((t) => (byDay[t.due!] = byDay[t.due!] || []).push(t));
        const overdue = openT.filter((t) => taskLate(t, TODAY));
        const monthLabel = first.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
        // the customer tag says which machine this is; the job number alone does not
        const tagOf = new Map(board.jobs.map((j) => [j.id, j.tag]));
        const jobTag = (id: string) => tagOf.get(id) || "";
        const shiftMonth = (d: number) => setCalMonth(toISO(new Date(Date.UTC(yy, mm - 1 + d, 1))).slice(0, 7));
        return (
          <div className="bg-white rounded-lg border p-3" style={{ borderColor: "var(--line)" }}>
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <button onClick={() => shiftMonth(-1)} className="px-3 py-1 rounded font-bold text-sm" style={{ background: "#F4F2EC", color: "var(--ink)" }}>◀</button>
              <div className="font-bold text-center" style={{ color: "var(--navy)" }}>{monthLabel} <span className="text-xs font-normal" style={{ color: "var(--muted)" }}>· open tasks on their due dates · respects the filters above</span></div>
              <div className="flex gap-1 items-center">
                <button onClick={() => makePdf(weeks, byDay, monthLabel, overdue.length, jobTag)} className="px-3 py-1 rounded text-xs font-bold"
                  style={{ background: "#fff", border: "1px solid #22303C", color: "var(--ink)" }}
                  title="A printable month — opens your browser's print dialog, where Save as PDF is the destination">
                  🖨 Make PDF
                </button>
                <button onClick={() => setNewTaskOpen(true)} className="px-3 py-1 rounded text-xs font-bold" style={{ background: "var(--ink)", color: "#fff" }} title="Raise a task without leaving the calendar">+ Add Task</button>
                <button onClick={() => setCalMonth(TODAY.slice(0, 7))} className="px-2 py-1 rounded text-xs font-bold" style={{ background: "var(--accent)", color: "#fff" }}>Today</button>
                <button onClick={() => shiftMonth(1)} className="px-3 py-1 rounded font-bold text-sm" style={{ background: "#F4F2EC", color: "var(--ink)" }}>▶</button>
              </div>
            </div>
            {overdue.length > 0 && (<div className="text-xs font-bold rounded px-2 py-1 mb-2 inline-block" style={{ background: "var(--red)", color: "#fff" }}>⚠ {overdue.length} overdue task{overdue.length === 1 ? "" : "s"} — counted against the date FIRST promised, so moving one does not clear it</div>)}
            <table className="w-full text-xs genie-table" style={{ borderCollapse: "collapse", tableLayout: "fixed" }}>
              <thead><tr style={{ background: "var(--ink)", color: "#fff" }}><th className="px-1 py-1.5" style={{ width: 58 }}>ISO Wk</th>{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (<th key={d} className="px-1 py-1.5">{d}</th>))}</tr></thead>
              <tbody>
                {weeks.map((wk) => {
                  const wkCount = wk.reduce((n, d) => n + (byDay[d] || []).length, 0);
                  return (
                    <tr key={wk[0]} className="border-t align-top" style={{ borderColor: "var(--line-soft)" }}>
                      <td className="px-1 py-1 font-bold text-center" style={{ background: wk[0] <= TODAY && TODAY <= wk[6] ? "#FFF3E8" : "#F4F2EC", color: "var(--blue)" }}>W{isoWeek(wk[0])}{wkCount > 0 && (<div className="font-normal" style={{ color: "var(--muted)", fontSize: 9 }}>{wkCount} task{wkCount === 1 ? "" : "s"}</div>)}</td>
                      {wk.map((d) => {
                        const inM = d.slice(0, 7) === calMonth;
                        const list = byDay[d] || [];
                        return (
                          <td
                            key={d}
                            onDragOver={(e) => { if (dragTask) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } }}
                            onDrop={(e) => { e.preventDefault(); moveTaskTo(d); }}
                            className="px-1 py-1 border-l"
                            style={{
                              borderColor: "var(--line-soft)",
                              background: dragTask && dragTask.due !== d ? "#EFF6FF" : d === TODAY ? "#FFF3E8" : inM ? "#fff" : "#FAF9F5",
                              opacity: inM ? 1 : 0.55, height: 64,
                            }}
                          >
                            <div className="font-bold tnum" style={{ color: d === TODAY ? "var(--accent)" : "var(--muted)" }}>{parseInt(d.slice(8), 10)}{d === TODAY ? " · today" : ""}</div>
                            {list.map((t) => {
                              const c = catColour(t.cat);
                              // red on the ORIGINAL promise: a chip dragged
                              // forward keeps saying it was late, because it was
                              const late = taskLate(t, TODAY);
                              const pushed = (t.push_count ?? 0) > 0;
                              return (
                                <div
                                  key={t.id}
                                  draggable
                                  onDragStart={(e) => { setDragTask(t); e.dataTransfer.effectAllowed = "move"; }}
                                  onDragEnd={() => setDragTask(null)}
                                  onClick={() => setLightbox(t)}
                                  title={`JOB ${jobNo(t.j)} · ${t.cat || "General"} · ${t.t}\n${t.who || "unassigned"} · due ${fmtFull(t.due)}${late ? " — OVERDUE" : ""}${pushed ? `\nFirst promised ${fmtFull(t.original_due!)} · moved ${t.push_count} time${t.push_count === 1 ? "" : "s"}` : ""}\nDrag to another day to move the date.`}
                                  className="rounded px-1 py-0.5 mb-0.5 cursor-grab"
                                  style={{
                                    background: c.bg, color: c.ink,
                                    border: `1px solid ${t.due === TODAY ? "var(--ink)" : c.edge}`,
                                    fontSize: 9, lineHeight: 1.25, overflow: "hidden",
                                  }}
                                >
                                  {/* line one: who it belongs to. The job number
                                      goes red when the date has gone — lateness is
                                      said HERE so the chip can keep saying what
                                      kind of work it is. */}
                                  {/* Job · who · escalation · customer tag.
                                      The CATEGORY is not written out: the chip
                                      is already coloured by it and the legend
                                      names the colours, so the word only ate
                                      the room the customer needed. */}
                                  <div className="flex items-baseline gap-1" style={{ whiteSpace: "nowrap" }}>
                                    <span className="font-bold" style={late ? { background: "var(--red)", color: "#fff", borderRadius: 2, padding: "0 3px" } : undefined}>
                                      {jobNo(t.j)}
                                    </span>
                                    <span className="font-bold">{whoTag(t.who)}</span>
                                    {t.esc && t.esc !== "None" && <span style={{ color: "var(--red)", fontWeight: 700 }} title={t.esc}>⚠</span>}
                                    {pushed && <span style={{ color: "var(--red)", fontWeight: 700 }} title={`Moved ${t.push_count} time${t.push_count === 1 ? "" : "s"} — first promised ${fmtFull(t.original_due!)}`}>↻{t.push_count}</span>}
                                    <span style={{ opacity: 0.7, overflow: "hidden", textOverflow: "ellipsis" }} title={jobTag(t.j)}>{jobTag(t.j)}</span>
                                  </div>
                                  {/* line two: what it actually is, wrapped to two
                                      lines rather than cut at the first word */}
                                  <div style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", fontWeight: 600 }}>
                                    {t.t}
                                  </div>
                                </div>
                              );
                            })}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex items-center gap-2 flex-wrap mt-2">
              <span className="text-xs" style={{ color: "var(--muted)" }}>Drag a chip to another day to move its due date · tap it to open the task</span>
              <div className="flex-1" />
              {TASK_CATS.map((c) => {
                const k = catColour(c);
                return (
                  <span key={c} className="text-xs rounded px-1.5" style={{ background: k.bg, color: k.ink, border: `1px solid ${k.edge}` }}>{c}</span>
                );
              })}
              <span className="text-xs rounded px-1.5 font-bold" style={{ background: "var(--red)", color: "#fff" }}>0000</span>
              <span className="text-xs" style={{ color: "var(--muted)" }}>= overdue</span>
            </div>
          </div>
        );
      })()}

      </>
      )}

      {newTaskOpen && (
        <NewTaskBox
          jobs={board.jobs}
          owners={assignees(board)}
          onClose={() => setNewTaskOpen(false)}
          reload={reload}
        />
      )}
      {lightbox && <TaskModal canDelete={isAdminHere} task={lightbox} jobRef={taskJobRef(board, lightbox)} onOpenJob={onOpen} owners={assignees(board)} onClose={() => setLightbox(null)} onToggle={async (prevention) => { await api.post("/api/tasks", { action: "toggle", id: lightbox.id, kind: lightbox.kind, done: !lightbox.done, prevention }); setLightbox(null); await reload(); }} reload={reload} />}
    </div>
  );
}

/**
 * The month as a printable page.
 *
 * A new window with its own stylesheet rather than print rules on the app:
 * printing the live page would carry the header, the nav and the filter bar
 * onto the paper, and a wall chart with a navigation menu across the top is
 * not a wall chart. Landscape, because a week is seven columns wide.
 *
 * Browsers offer "Save as PDF" as a print destination on every platform this
 * runs on, so this needs no library and produces a real PDF.
 */
export function makePdf(
  weeks: string[][],
  byDay: Record<string, Task[]>,
  monthLabel: string,
  overdueCount: number,
  jobTag: (id: string) => string,
) {
  const esc = (v: unknown) =>
    String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

  const cell = (d: string) => {
    const list = byDay[d] || [];
    const chips = list
      .map((t) => {
        const c = catColour(t.cat);
        const late = taskLate(t, TODAY);
        return `<div class="chip" style="background:${c.bg};color:${c.ink};border-color:${c.edge}">
          <div class="l1">
            <b class="${late ? "late" : ""}">${esc(jobNo(t.j))}</b>
            <b>${esc(whoTag(t.who))}</b>
            ${t.esc && t.esc !== "None" ? '<span class="esc">&#9888;</span>' : ""}
            <span class="tag">${esc(jobTag(t.j))}</span>
          </div>
          <div class="l2">${esc(t.t)}</div>
        </div>`;
      })
      .join("");
    const day = parseInt(d.slice(8), 10);
    return `<td class="${d === TODAY ? "today" : ""}"><div class="dn">${day}</div>${chips}</td>`;
  };

  const body = weeks
    .map((wk) => `<tr><td class="wk">W${isoWeek(wk[0])}</td>${wk.map(cell).join("")}</tr>`)
    .join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(monthLabel)} — Nandan Tasking</title>
<style>
  @page { size: A3 landscape; margin: 10mm; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; color: #16232F; margin: 0; }
  h1 { font-size: 16pt; margin: 0 0 2mm; }
  .sub { font-size: 9pt; color: #5A6672; margin-bottom: 3mm; }
  .warn { display: inline-block; background: #B3261E; color: #fff; font-size: 8pt; font-weight: 700; padding: 1mm 2mm; border-radius: 2px; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th { background: #22303C; color: #fff; font-size: 8pt; padding: 1.5mm; }
  td { border: 0.4pt solid #E2E0DA; vertical-align: top; padding: 1mm; height: 34mm; }
  td.wk { width: 12mm; background: #F4F2EC; text-align: center; font-weight: 700; font-size: 8pt; color: #1B3A5C; }
  td.today { background: #FFF3E8; }
  .dn { font-size: 8pt; font-weight: 700; color: #8A94A0; margin-bottom: 0.8mm; }
  .chip { border: 0.4pt solid; border-radius: 2px; padding: 0.7mm 1.2mm; margin-bottom: 0.8mm; font-size: 6.5pt; line-height: 1.25; }
  .l1 { white-space: nowrap; overflow: hidden; }
  .l1 b { margin-right: 1mm; }
  .l1 .tag { opacity: .7; }
  .l1 .late { background: #B3261E; color: #fff; border-radius: 2px; padding: 0 1mm; }
  .l1 .esc { color: #B3261E; font-weight: 700; }
  .l2 { font-weight: 600; }
</style></head><body>
<h1>${esc(monthLabel)} &middot; Nandan Tasking</h1>
<div class="sub">Open tasks on their due dates &middot; printed ${esc(fmtFull(TODAY))}
${overdueCount > 0 ? ` &middot; <span class="warn">${overdueCount} overdue, against the date first promised</span>` : ""}</div>
<table className="genie-table"><thead><tr><th>ISO</th>${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => `<th>${d}</th>`).join("")}</tr></thead>
<tbody>${body}</tbody></table>
</body></html>`;

  const w = window.open("", "_blank");
  if (!w) {
    alert("Your browser blocked the print window. Allow pop-ups for Genie and press Make PDF again.");
    return;
  }
  w.document.write(html);
  w.document.close();
  // let the styles land before the dialog opens, or the first page prints bare
  w.onload = () => setTimeout(() => w.print(), 120);
}

/**
 * Raise a task from the calendar.
 *
 * The same fields as everywhere else, plus the one the inline form never needs
 * and this one always does: WHICH JOB. Everywhere else the form is already
 * sitting inside a job; here it is sitting on a month.
 *
 * "Save and add another" keeps the job, the person, the date and the category
 * and clears only the text — because tasks are raised in runs, and re-picking
 * the same job six times is how somebody stops using the button and goes back
 * to a notebook.
 */
export function NewTaskBox({
  jobs, owners, onClose, reload,
}: {
  jobs: Job[]; owners: Assignee[]; onClose: () => void; reload: () => Promise<Board | null>;
}) {
  const [form, setForm] = useState({ t: "", who: "", due: TODAY, cat: TASK_CATS[0] as string, esc: "None", esc_why: "" });
  const [jobId, setJobId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");

  const needle = q.trim().toLowerCase();
  const list = jobs
    .filter((j) => !needle || j.id.includes(needle) || j.tag.toLowerCase().includes(needle) || j.cust.toLowerCase().includes(needle))
    .slice(0, 400);

  const save = async (again: boolean) => {
    if (!form.t.trim()) { setMsg("What is the task?"); return; }
    if (escalated(form.esc) && !form.esc_why.trim()) { setMsg("Say why it is escalated — whoever it lands on needs to know without ringing you."); return; }
    setBusy(true); setMsg("");
    try {
      await api.post("/api/tasks", {
        action: "create", job_id: jobId || null, title: form.t.trim(),
        who: form.who, due: form.due, cat: form.cat, esc: form.esc, esc_why: form.esc_why,
      });
      await reload();
      if (again) {
        // job, person, date and category survive; only the words clear
        setForm((f) => ({ ...f, t: "", esc: "None", esc_why: "" }));
        setMsg("Added ✓ — next one");
      } else onClose();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(22,35,47,0.55)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg" style={{ width: "min(540px, 100%)", maxHeight: "88vh", overflowY: "auto" }}>
        <div className="px-4 py-3 flex items-center gap-3" style={{ background: "var(--navy)" }}>
          <div className="font-bold text-white" style={{ fontSize: 15 }}>New task</div>
          <div className="flex-1" />
          <button onClick={onClose} className="font-bold" style={{ color: "#8FA1B3", fontSize: 20, lineHeight: 1 }}>✕</button>
        </div>
        <div className="p-4">
          <div className="text-xs font-bold mb-0.5" style={{ color: "var(--muted)" }}>JOB</div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 filter by job no, tag or customer"
            className="w-full text-xs border rounded px-2 py-1.5 mb-1" style={{ borderColor: "var(--line)" }} />
          <select value={jobId} onChange={(e) => setJobId(e.target.value)}
            className="w-full text-sm border rounded px-2 py-1.5 bg-white mb-3" style={{ borderColor: jobId ? "var(--line)" : "var(--accent)" }}>
            <option value="">— no job (a general task) —</option>
            {list.map((j) => <option key={j.id} value={j.id}>{jobNo(j.id)} · {j.tag} · {j.cust}</option>)}
          </select>

          <AddTaskForm form={form} setForm={setForm} owners={owners} onSubmit={() => save(false)} onCancel={onClose} hideActions />

          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <button onClick={() => save(false)} disabled={busy} className="text-sm font-bold rounded px-4 py-1.5" style={{ background: "var(--accent)", color: "#fff", opacity: busy ? 0.5 : 1 }}>
              {busy ? "Saving…" : "Save"}
            </button>
            <button onClick={() => save(true)} disabled={busy} className="text-sm font-bold rounded px-3 py-1.5"
              style={{ background: "#fff", border: "1px solid #22303C", color: "var(--ink)", opacity: busy ? 0.5 : 1 }}
              title="Keeps the job, the person, the date and the category — clears only the words">
              Save &amp; add another
            </button>
            {msg && <span className="text-xs font-semibold" style={{ color: msg.includes("✓") ? "var(--green)" : "var(--red)" }}>{msg}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Projects / Department / Goals / Escalations all show the SAME tasks the Jobs
 * view shows — only the bucket changes. One renderer, one grouping function,
 * so a filter change can never mean four different answers.
 */
export function GroupedTasks({
  view,
  board,
  reload,
  jobs,
  tasksByJob,
  onOpen,
  onOpenTask,
  onDelete,
}: {
  view: TaskingView;
  board: Board;
  reload: () => Promise<Board | null>;
  jobs: Job[];
  tasksByJob: Map<string, Task[]>;
  onOpen: (id: string) => void;
  onOpenTask: (t: Task) => void;
  /** Absent when the viewer is not an admin — the card then shows no ×. */
  onDelete?: (t: Task) => void;
}) {
  // ---- adding a task straight onto a project (By Projects only) ----
  const [addingProj, setAddingProj] = useState<string | null>(null);
  const [projForm, setProjForm] = useState({ job_id: "", t: "", who: "", due: TODAY, cat: "Production", esc: "None" });

  /**
   * Every job in a project, latest deliverable first. A task raised against a
   * project almost always concerns the work still ahead, so the job that
   * delivers LAST is the sensible default — the whole project list is right
   * there in the dropdown when it isn't.
   */
  const projectJobs = useCallback(
    (proj: string) =>
      board.jobs
        .filter((j) => ((j.proj || "").trim() || "No project on the job") === proj)
        .sort((a, b) => ((a.tdd || "0000") > (b.tdd || "0000") ? -1 : 1)),
    [board.jobs],
  );

  const openProjForm = (proj: string) => {
    const last = projectJobs(proj)[0];
    setProjForm({ job_id: last?.id ?? "", t: "", who: "", due: TODAY, cat: "Production", esc: "None" });
    setAddingProj(proj);
  };
  const submitProjTask = async () => {
    if (!projForm.t.trim() || !projForm.job_id) return;
    await api.post("/api/tasks", {
      action: "create",
      job_id: projForm.job_id,
      title: projForm.t.trim(),
      who: projForm.who,
      due: projForm.due,
      cat: projForm.cat,
      esc: projForm.esc,
    });
    setAddingProj(null);
    await reload();
  };

  const rows = useMemo(() => {
    const out: { t: Task; job: Job }[] = [];
    for (const j of jobs) for (const t of tasksByJob.get(j.id) ?? []) out.push({ t, job: j });
    return out;
  }, [jobs, tasksByJob]);

  // "By Goals" is the odd one out — the goals layer keeps its own to-do engine,
  // so its items come from /api/today rather than the task board.
  const [goalItems, setGoalItems] = useState<TodayItem[] | null>(null);
  useEffect(() => {
    if (view !== "goals") return;
    api.get("/api/today").then((r) => setGoalItems((r.items || []).filter((i: TodayItem) => i.source === "goal"))).catch(() => setGoalItems([]));
  }, [view]);

  if (view === "goals") {
    if (goalItems === null)
      return <div className="bg-white rounded-lg border p-6 text-center text-sm" style={{ borderColor: "var(--line)", color: "var(--muted)" }}>Loading your goal work…</div>;
    if (!goalItems.length)
      return (
        <div className="bg-white rounded-lg border p-6 text-center text-sm" style={{ borderColor: "var(--line)", color: "var(--muted)" }}>
          No open goal work is assigned to you. Goals, sub goals and initiatives with your name on appear here once their start date arrives — the tree itself lives in the Goals workspace.
        </div>
      );
    const byGoal = new Map<string, TodayItem[]>();
    for (const g of goalItems) {
      const k = g.goalName || "Unlinked goal work";
      (byGoal.get(k) ?? byGoal.set(k, []).get(k)!).push(g);
    }
    return (
      <div className="space-y-3">
        <div className="text-xs" style={{ color: "var(--muted)" }}>
          Your own goals, sub goals and initiatives, grouped by the goal they hang off. The Show filters above apply to jobs tasks — goal work is always your own.
        </div>
        {[...byGoal.entries()].map(([goal, items]) => (
          <GroupBlock key={goal} label={goal} count={items.length} color="#7C3AED">
            {items.map((g) => (
              <div key={g.id} className="rounded p-2 border" style={{ width: 230, background: g.late ? "#FBEDEA" : "#F3EEFB", borderColor: g.late ? "var(--red)" : "#D7CBF0" }}>
                <div className="text-xs font-semibold" style={{ color: "var(--navy)" }}>{g.title}</div>
                <div className="flex justify-between text-xs mt-1" style={{ color: "var(--dim)" }}>
                  <span>{g.cat}</span>
                  <span className="tnum">{fmt(g.due)}{g.late ? " · late" : ""}</span>
                </div>
              </div>
            ))}
          </GroupBlock>
        ))}
      </div>
    );
  }

  // the grouping key for the other three views
  const keyOf = (r: { t: Task; job: Job }) =>
    view === "projects"
      ? (r.job.proj || "").trim() || "No project on the job"
      : view === "dept"
        ? (r.t.cat || "").trim() || "Uncategorised"
        : (r.t.esc || "None").trim();

  const visible = view === "esc" ? rows.filter((r) => (r.t.esc || "None") !== "None" && !r.t.done) : rows;
  const hiddenCount = view === "esc" ? rows.filter((r) => !r.t.done).length - visible.length : 0;

  const groups = new Map<string, { t: Task; job: Job }[]>();
  // A project with no tasks yet still deserves a row — otherwise there is
  // nowhere to add its first one. Only reachable with "include jobs without
  // tasks" ticked, which is exactly when someone is looking for that.
  if (view === "projects")
    for (const j of jobs) {
      const k = (j.proj || "").trim() || "No project on the job";
      if (!groups.has(k)) groups.set(k, []);
    }
  for (const r of visible) {
    const k = keyOf(r);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
  }
  // escalations read worst-first; the rest read alphabetically
  const ordered = [...groups.entries()].sort((a, b) =>
    view === "esc" ? (b[0] < a[0] ? -1 : 1) : a[0].localeCompare(b[0]),
  );

  if (!ordered.length)
    return (
      <div className="bg-white rounded-lg border p-6 text-center text-sm" style={{ borderColor: "var(--line)", color: "var(--muted)" }}>
        {view === "esc"
          ? "Nothing is escalated right now. Raise the escalation level on a task and it appears here."
          : "No tasks match the filters above."}
      </div>
    );

  /* DOWNLOAD AS PDF (Dr Raghu, 8 Oct 2026: "Make a button at the top saying Download as PDF. Just
     keep the tasks in a way that they can be read comfortably. Make it by department on a separate
     page and showcase escalations and tasks of each job together, aggregated"). Exactly what is on
     the screen — same filters, same scope — laid out for paper: one department a page, each job
     once with its escalations first and its tasks under them, 11-point type. The browser's own
     Save as PDF does the rest. */
  const printPdf = () => {
    const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
    const byDept = new Map<string, { t: Task; job: Job }[]>();
    for (const r of visible) { const k = (r.t.cat || "").trim() || "Uncategorised"; (byDept.get(k) ?? byDept.set(k, []).get(k)!).push(r); }
    const today = new Date().toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });
    const line = (t: Task) => `<li class="${escalated(t.esc) ? "esc" : "task"}${t.done ? " done" : ""}"><span class="meta">${escalated(t.esc) ? `<b class="lvl">▲ ${esc(t.esc)}</b> · ` : ""}${t.due ? `due ${esc(fmt(t.due))}` : "no date"}${t.who ? ` · ${esc(initials(t.who))}` : ""}</span><div class="txt">${esc(t.t)}${t.esc_why && escalated(t.esc) ? `<div class="why">Why: ${esc(t.esc_why)}</div>` : ""}</div></li>`;
    const pages = [...byDept.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([dept, items]) => {
      const jobsIn = new Map<string, { job: Job; esc: Task[]; rest: Task[] }>();
      for (const { t, job } of items) { const g = jobsIn.get(job.id) ?? jobsIn.set(job.id, { job, esc: [], rest: [] }).get(job.id)!; (escalated(t.esc) ? g.esc : g.rest).push(t); }
      const escN = items.filter((r) => escalated(r.t.esc) && !r.t.done).length, openN = items.filter((r) => !r.t.done).length;
      const jobsHtml = [...jobsIn.values()].sort((a, b) => (b.esc.length - a.esc.length) || jobNo(a.job.id).localeCompare(jobNo(b.job.id))).map(({ job, esc: e, rest }) => {
        e.sort((a, b) => String(b.esc).localeCompare(String(a.esc)) || ((a.due || "9999") < (b.due || "9999") ? -1 : 1));
        rest.sort((a, b) => ((a.due || "9999") < (b.due || "9999") ? -1 : 1));
        return `<section class="job"><h2>${esc(jobNo(job.id))} · ${esc(job.tag)} <span class="cust">${esc(job.cust)}${job.own ? ` · ${esc(job.own)}` : ""}${job.tdd ? ` · TDD ${esc(fmt(job.tdd))}` : ""}</span></h2>${e.length ? `<ul class="list">${e.map(line).join("")}</ul>` : ""}${rest.length ? `<ul class="list">${rest.map(line).join("")}</ul>` : ""}</section>`;
      }).join("");
      return `<div class="dept"><h1>${esc(dept)} <span class="sub">${openN} open task${openN === 1 ? "" : "s"} · ${escN} escalation${escN === 1 ? "" : "s"} · ${jobsIn.size} job${jobsIn.size === 1 ? "" : "s"}</span></h1>${jobsHtml}</div>`;
    }).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Nandan Tasking — by department — ${esc(today)}</title><style>
@page { size: A4; margin: 14mm 14mm 16mm; }
body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #16232F; font-size: 11pt; line-height: 1.4; margin: 0; }
.dept { break-before: page; page-break-before: always; }
.dept:first-child { break-before: auto; page-break-before: auto; }
h1 { font-size: 18pt; margin: 0 0 8px; padding-bottom: 6px; border-bottom: 2px solid #16232F; }
h1 .sub { font-size: 10pt; font-weight: 400; color: #5B6470; margin-left: 10px; }
.job { break-inside: avoid; page-break-inside: avoid; margin: 10px 0 14px; }
h2 { font-size: 12pt; margin: 0 0 4px; color: #1B3A5C; }
h2 .cust { font-size: 9.5pt; font-weight: 400; color: #5B6470; }
ul.list { list-style: none; margin: 0; padding: 0; }
li { display: flex; gap: 10px; padding: 4px 8px; border-left: 4px solid #D9D6CD; margin: 0 0 4px; break-inside: avoid; }
li.esc { border-left-color: #B3392E; background: #FBEDEA; }
li.done { opacity: .55; text-decoration: line-through; }
.meta { flex: 0 0 150px; font-size: 9.5pt; color: #5B6470; font-variant-numeric: tabular-nums; }
.lvl { color: #B3392E; }
.txt { flex: 1; white-space: pre-wrap; }
.why { font-size: 9.5pt; color: #8A4520; margin-top: 2px; }
.foot { position: fixed; bottom: 0; left: 0; right: 0; font-size: 8.5pt; color: #8B8F87; text-align: right; }
</style></head><body>${pages || "<p>No tasks match the filters.</p>"}<div class="foot">Nandan Tasking · by department · ${esc(today)} · ${visible.filter((r) => !r.t.done).length} open tasks</div><script>window.addEventListener("load",()=>setTimeout(()=>window.print(),300))</script></body></html>`;
    const w = window.open("", "_blank");
    if (!w) { alert("The browser blocked the new tab — allow pop-ups for genie.nandan.co.in and try again."); return; }
    w.document.open(); w.document.write(html); w.document.close();
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={printPdf} className="text-xs font-bold rounded px-3 py-1.5" style={{ background: "var(--navy)", color: "#fff" }}
          title="Exactly what is on this screen — one department a page, each job once, its escalations first, then its tasks — as a PDF through the browser's Save as PDF">⬇ Download as PDF</button>
      </div>
      {view === "esc" && hiddenCount > 0 && (
        <div className="text-xs" style={{ color: "var(--muted)" }}>{hiddenCount} open task{hiddenCount === 1 ? "" : "s"} with no escalation are hidden in this view.</div>
      )}
      {ordered.map(([label, items]) => (
        <GroupBlock
          key={label}
          label={label}
          count={items.length}
          color={view === "esc" ? "var(--red)" : view === "dept" ? "#0D9488" : "var(--blue)"}
          openCount={items.filter((r) => !r.t.done).length}
        >
          {/* ESCALATIONS FIRST, IN THEIR OWN TWO COLUMNS (Dr Raghu, 8 Oct 2026: "Give two columns
              for escalations, and the rest will all be the regular tasks. This way, when it is
              split, it is there"). Worst level first on the left; everything else flows on the right. */}
          {(() => {
            const card = ({ t, job }: { t: Task; job: Job }) => (
              <div key={t.kind + t.id} style={{ width: 220 }}>
                <button
                  onClick={() => onOpen(job.id)}
                  className="text-xs font-bold underline decoration-dotted truncate block text-left w-full"
                  style={{ color: "var(--blue)" }}
                  title={`${job.tag} · JOB ${jobNo(job.id)} · ${job.cust}`}
                >
                  {jobNo(job.id)} · {job.tag}
                </button>
                <TaskCard t={t} onOpen={onOpenTask} onDelete={onDelete} />
              </div>
            );
            if (view === "esc") return items.map(card);
            const esc = items.filter((r) => escalated(r.t.esc)).sort((a, b) => String(b.t.esc).localeCompare(String(a.t.esc)) || ((a.t.due || "9999") < (b.t.due || "9999") ? -1 : 1));
            const rest = items.filter((r) => !escalated(r.t.esc));
            return (
              <div className="flex gap-2 items-start w-full">
                {/* a true two-column grid: the flex version was two pixels short and stacked them in one (8 Oct 2026, "two will need to be done") */}
                <div className="flex-shrink-0 rounded p-1.5" style={{ display: "grid", gridTemplateColumns: "220px 220px", gap: 6, alignContent: "start", minHeight: 60, background: esc.length ? "rgba(179,57,46,0.08)" : "transparent", border: `1px dashed ${esc.length ? "rgba(179,57,46,0.45)" : "#D9D6CD"}` }} title="Escalations — worst first">
                  {esc.length ? esc.map(card) : <div className="text-xs text-center" style={{ color: "var(--muted)", gridColumn: "1 / -1", alignSelf: "center" }}>no escalations</div>}
                </div>
                <div className="flex flex-wrap gap-1.5 items-start flex-1 min-w-0">
                  {rest.map(card)}
                </div>
              </div>
            );
          })()}
          {view === "projects" && (
            addingProj === label ? (
              <div style={{ width: 250 }}>
                <div className="rounded border px-2 pt-2 bg-white" style={{ borderColor: "var(--accent)", borderBottom: "none" }}>
                  <div className="text-xs mb-0.5" style={{ color: "var(--muted)" }}>Job — defaults to the last one to deliver</div>
                  <select
                    value={projForm.job_id}
                    onChange={(e) => setProjForm({ ...projForm, job_id: e.target.value })}
                    className="w-full text-xs border rounded px-1 py-1 bg-white"
                    style={{ borderColor: "var(--line)" }}
                  >
                    {projectJobs(label).map((j) => (
                      <option key={j.id} value={j.id}>{jobNo(j.id)} · {j.tag} · TDD {fmt(j.tdd)}</option>
                    ))}
                  </select>
                </div>
                <AddTaskForm
                  form={projForm}
                  setForm={setProjForm}
                  owners={assignees(board)}
                  onSubmit={submitProjTask}
                  onCancel={() => setAddingProj(null)}
                />
              </div>
            ) : (
              <button
                onClick={() => openProjForm(label)}
                className="text-xs font-bold rounded border border-dashed px-3 self-stretch"
                style={{ borderColor: "var(--accent)", color: "var(--accent)", minHeight: 40 }}
                title={`Add a task on ${label} — it lands on the job that delivers last unless you pick another`}
              >
                + Add task
              </button>
            )
          )}
        </GroupBlock>
      ))}
    </div>
  );
}

// ============================ Brain Dump ============================
export interface DumpRow {
  id: string;
  title: string;
  detail: string | null;
  who: string | null;
  due: string | null;
  cat: string;
  esc: string | null;
  job_id: string | null;
  project: string | null;
  goal_id: string | null;
  done: boolean;
  promoted_task_id: string | null;
  created_at: string;
}

export const EMPTY_DUMP = { title: "", detail: "", who: "", due: "", cat: "Production", esc: "None", job_id: "", project: "", goal_id: "" };
const DUMP_LAST_KEY = "genie.braindump.last";

/**
 * The capture pad. Type the thought at the top, add whatever context you have,
 * and it drops below the line into its category. From there each line is either
 * ticked DONE or pushed onto the Tasking board as a real task.
 *
 * Lines are private to you — nothing here is visible to anyone else until it is
 * added to the board.
 */
export function BrainDump({ board, reload }: { board: Board; reload: () => Promise<Board | null> }) {
  const [rows, setRows] = useState<DumpRow[] | null>(null);
  const [installed, setInstalled] = useState(true);
  /* EVERY PICK CARRIES OVER FROM THE LAST SAVE (Dr Raghu, 5 Oct 2026:
     "this assignee and due date and escalation/ project/ job/goal will carry
     over from the last saved!") — only the words clear, and the picks survive
     a reload. A due date already past comes back blank, never as a late task. */
  const [form, setForm] = useState(() => {
    try {
      const raw = localStorage.getItem(DUMP_LAST_KEY);
      if (raw) { const d = JSON.parse(raw); return { ...EMPTY_DUMP, ...d, title: "", detail: "", due: d.due && d.due >= TODAY ? d.due : "" }; }
    } catch { /* private window */ }
    return { ...EMPTY_DUMP };
  });
  const [goals, setGoals] = useState<{ id: string; title: string; root: string; scope: string }[]>([]);
  useEffect(() => { api.get("/api/tasks/goals").then((r) => setGoals(r.goals || [])).catch(() => setGoals([])); }, []);
  const goalName = useMemo(() => new Map(goals.map((g) => [g.id, g.root ? `${g.root} › ${g.title}` : g.title])), [goals]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get("/api/brain-dump");
      setInstalled(r.installed !== false);
      setRows(r.items || []);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
      setRows([]);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const jobsByTdd = useMemo(
    () => [...board.jobs].sort((a, b) => ((a.tdd || "9999") < (b.tdd || "9999") ? -1 : 1)),
    [board.jobs],
  );
  const projects = useMemo(
    () => [...new Set(board.jobs.map((j) => (j.proj || "").trim()).filter(Boolean))].sort(),
    [board.jobs],
  );

  const add = async () => {
    if (!form.title.trim()) return;
    setBusy(true);
    setMsg("");
    try {
      await api.post("/api/brain-dump", { action: "create", ...form, due: form.due || null, job_id: form.job_id || null, goal_id: form.goal_id || null });
      // everything but the words stays for the next line, and for the next visit
      const { title: _t, detail: _d, ...picks } = form;
      try { localStorage.setItem(DUMP_LAST_KEY, JSON.stringify(picks)); } catch { /* fine */ }
      setForm({ ...form, title: "", detail: "" });
      await load();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const act = async (body: Record<string, unknown>, after?: () => Promise<unknown>) => {
    setMsg("");
    try { await api.post("/api/brain-dump", body); await load(); if (after) await after(); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  };

  const open = (rows || []).filter((r) => !r.done && !r.promoted_task_id);
  const closed = (rows || []).filter((r) => r.done || r.promoted_task_id);
  const byCat = new Map<string, DumpRow[]>();
  for (const r of open) {
    const k = r.cat || "Uncategorised";
    (byCat.get(k) ?? byCat.set(k, []).get(k)!).push(r);
  }

  const field = "text-xs border rounded px-2 py-1.5 bg-white";
  const label = (t: string) => <div className="text-xs font-semibold mb-1" style={{ color: "var(--muted)" }}>{t}</div>;

  return (
    <div className="space-y-3">
      {!installed && (
        <div className="rounded px-3 py-2 text-xs font-semibold" style={{ background: "#FBEDEA", color: "var(--red)" }}>
          The brain_dump table doesn&apos;t exist yet — run migration 0018 in Supabase, then reload.
        </div>
      )}

      {/* ---- the dump box ---- */}
      <div className="bg-white rounded-lg border p-3" style={{ borderColor: "var(--line)", borderTop: "4px solid #E8600A" }}>
        <div className="font-bold text-sm mb-2">
          Dump it here
          <span className="font-normal text-xs ml-2" style={{ color: "var(--muted)" }}>
            — only the task is required. Everything else can wait until you come back to it. Private to you.
          </span>
        </div>
        <div className="mb-2">
          {label("Task — what")}
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) add(); }}
            placeholder="e.g. Chase the hydraulic powerpack delivery date"
            className="w-full border rounded px-2 py-2 text-sm"
            style={{ borderColor: form.title ? "var(--accent)" : "#D9D6CD" }}
          />
        </div>
        <div className="flex flex-wrap gap-2 mb-2">
          <div>
            {label("Assignee")}
            <select value={form.who} onChange={(e) => setForm({ ...form, who: e.target.value })} className={field} style={{ borderColor: "#D9D6CD", width: 150 }}>
              <option value="">— nobody yet —</option>
              <AssigneeOptions owners={assignees(board)} current={form.who} />
            </select>
          </div>
          <div>
            {label("Due date")}
            <input type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} className={field} style={{ borderColor: "#D9D6CD" }} />
          </div>
          <div>
            {label("Category")}
            <select value={form.cat} onChange={(e) => setForm({ ...form, cat: e.target.value })} className={field} style={{ borderColor: "#D9D6CD" }}>
              {TASK_CATS.map((c) => (<option key={c}>{c}</option>))}
            </select>
          </div>
          <div>
            {label("Escalation")}
            <select value={form.esc} onChange={(e) => setForm({ ...form, esc: e.target.value })} className={field} style={{ borderColor: "#D9D6CD" }}>
              {ESC_LEVELS.map((c) => (<option key={c}>{c}</option>))}
            </select>
          </div>
          <div>
            {label("Project")}
            <input list="bd-projects" value={form.project} onChange={(e) => setForm({ ...form, project: e.target.value })} placeholder="—" className={field} style={{ borderColor: "#D9D6CD", width: 150 }} />
            <datalist id="bd-projects">{projects.map((p) => (<option key={p} value={p} />))}</datalist>
          </div>
          <div>
            {label("Job")}
            <select value={form.job_id} onChange={(e) => setForm({ ...form, job_id: e.target.value })} className={field} style={{ borderColor: "#D9D6CD", maxWidth: 240 }} title="Needed before a line can be added to the board — the board is organised by job">
              <option value="">— no job —</option>
              {jobsByTdd.map((j) => (<option key={j.id} value={j.id}>{jobNo(j.id)} · {j.tag}</option>))}
            </select>
          </div>
          <div>
            {label("Goal")}
            <select value={form.goal_id} onChange={(e) => setForm({ ...form, goal_id: e.target.value })} className={field} style={{ borderColor: "#D9D6CD", maxWidth: 260 }} title="The goal or sub goal this serves">
              <option value="">— none —</option>
              {form.goal_id && !goalName.has(form.goal_id) && <option value={form.goal_id}>(a goal no longer listed)</option>}
              {goals.map((g) => (<option key={g.id} value={g.id}>{g.root ? `${g.root} › ` : ""}{g.title}</option>))}
            </select>
          </div>
        </div>
        <div className="mb-2">
          {label("Details — how")}
          <textarea
            value={form.detail}
            onChange={(e) => setForm({ ...form, detail: e.target.value })}
            rows={2}
            placeholder="How it should be handled, who to speak to, what good looks like…"
            className="w-full border rounded px-2 py-1.5 text-sm"
            style={{ borderColor: "#D9D6CD" }}
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={add} disabled={busy || !form.title.trim()} className="rounded px-4 py-1.5 font-bold text-sm" style={{ background: "var(--accent)", color: "#fff", opacity: busy || !form.title.trim() ? 0.5 : 1 }}>
            {busy ? "Adding…" : "+ Add"}
          </button>
          <span className="text-xs" style={{ color: "var(--muted)" }}>⌘/Ctrl + Enter also adds it</span>
          {msg && <span className="text-xs font-semibold" style={{ color: "var(--red)" }}>{msg}</span>}
        </div>
      </div>

      {/* ---- below the line, grouped by category ---- */}
      {rows === null && <div className="text-sm" style={{ color: "var(--muted)" }}>Loading your pad…</div>}
      {rows !== null && open.length === 0 && (
        <div className="bg-white rounded-lg border p-6 text-center text-sm" style={{ borderColor: "var(--line)", color: "var(--muted)" }}>
          Nothing on the pad. Whatever you dump above lands here, grouped by category.
        </div>
      )}
      {[...byCat.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([cat, items]) => (
        <div key={cat} className="bg-white rounded-lg border" style={{ borderColor: "var(--line)" }}>
          <div className="px-3 py-1.5 font-bold text-sm flex justify-between" style={{ background: "#F4F2EC", color: "var(--navy)" }}>
            <span>{cat}</span>
            <span className="font-normal text-xs" style={{ color: "var(--muted)" }}>{items.length} line{items.length === 1 ? "" : "s"}</span>
          </div>
          {items.map((r) => {
            const job = board.jobs.find((j) => j.id === r.job_id);
            return (
              <div key={r.id} className="px-3 py-2 flex items-start justify-between gap-3" style={{ borderTop: "1px solid #F4F2EC" }}>
                <div className="min-w-0">
                  <div className="text-sm font-semibold" style={{ color: "var(--navy)" }}>{r.title}</div>
                  {r.detail && <div className="text-xs mt-0.5" style={{ color: "var(--dim)", whiteSpace: "pre-wrap" }}>{r.detail}</div>}
                  <div className="text-xs mt-1 flex flex-wrap gap-2" style={{ color: "var(--muted)" }}>
                    {r.who && <span className="font-bold rounded px-1" style={{ background: "var(--accent)", color: "#fff" }}>{r.who}</span>}
                    {r.due && <span className="tnum" style={{ color: r.due < TODAY ? "var(--red)" : "var(--muted)" }}>due {fmt(r.due)}</span>}
                    {job && <span>JOB {jobNo(job.id)} · {job.tag}</span>}
                    {r.project && <span>{r.project}</span>}
                    {r.goal_id && <span style={{ color: "#5B21B6" }}>◎ {goalName.get(r.goal_id) || "goal"}</span>}
                    {r.esc && r.esc !== "None" && <span className="font-bold" style={{ color: "var(--red)" }}>⚠ {r.esc}</span>}
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    onClick={() => act({ action: "done", id: r.id, done: true })}
                    className="rounded px-2 py-1 text-xs font-bold"
                    style={{ background: "#E6F4EA", color: "var(--green)" }}
                    title="Handled — file it away"
                  >
                    ✓ Done
                  </button>
                  <button
                    onClick={() => act({ action: "promote", id: r.id }, reload)}
                    className="rounded px-2 py-1 text-xs font-bold"
                    style={{ background: "var(--navy)", color: "#fff", cursor: "pointer" }}
                    title={r.job_id ? "Make this a real task on the Tasking board, on its job" : "Make this a real task — with no job it lands as a general task, and in My Tasks"}
                  >
                    ↗ Add to board
                  </button>
                  <button onClick={() => act({ action: "delete", id: r.id })} className="rounded px-2 py-1 text-xs font-bold" style={{ background: "#FBEDEA", color: "var(--red)" }} title="Delete this line">✕</button>
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {closed.length > 0 && (
        <div>
          <button onClick={() => setShowDone((s) => !s)} className="text-xs font-bold" style={{ color: "var(--accent)" }}>
            {showDone ? "▾" : "▸"} {closed.length} line{closed.length === 1 ? "" : "s"} cleared
          </button>
          {showDone && (
            <div className="bg-white rounded-lg border mt-1" style={{ borderColor: "var(--line)" }}>
              {closed.map((r) => (
                <div key={r.id} className="px-3 py-1.5 flex items-center justify-between text-xs" style={{ borderTop: "1px solid #F4F2EC", color: "var(--muted)" }}>
                  <span style={{ textDecoration: r.done ? "line-through" : "none" }}>
                    {r.title}
                    <span className="ml-2 rounded px-1 font-bold" style={{ background: r.promoted_task_id ? "#DCE8F5" : "#E6F4EA", color: r.promoted_task_id ? "var(--blue)" : "var(--green)" }}>
                      {r.promoted_task_id ? "on the board" : "done"}
                    </span>
                  </span>
                  <span className="flex gap-1">
                    {r.done && !r.promoted_task_id && (
                      <button onClick={() => act({ action: "done", id: r.id, done: false })} className="font-bold" style={{ color: "var(--accent)" }}>reopen</button>
                    )}
                    <button onClick={() => act({ action: "delete", id: r.id })} className="font-bold" style={{ color: "var(--red)" }}>✕</button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** One labelled bucket of cards — the shared frame for every grouped view. */
export function GroupBlock({
  label, count, color, openCount, children,
}: {
  label: string; count: number; color: string; openCount?: number; children: React.ReactNode;
}) {
  return (
    <div className="flex gap-2 items-stretch">
      {/* narrower since 8 Oct 2026 ("reduce the width of that and utilise more space to the right") */}
      <div className="rounded-lg p-2 flex-shrink-0" style={{ width: 120, background: "var(--navy)", color: "#fff", borderLeft: `4px solid ${color}` }}>
        <div className="font-bold text-xs break-words leading-tight">{label}</div>
        <div className="text-xs opacity-70">
          {count} task{count === 1 ? "" : "s"}
          {openCount !== undefined && openCount !== count ? ` · ${openCount} open` : ""}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 flex-1 items-start rounded-lg p-2" style={{ background: "#E9E6DD" }}>
        {children}
      </div>
    </div>
  );
}

export type Assignee = { value: string; label: string; group: string };

/** <option>s grouped by Users / Project Owners, plus the current value if it's
 *  an orphan (e.g. legacy ERP text on an imported task). */
export function AssigneeOptions({ owners, current }: { owners: Assignee[]; current?: string }) {
  const orphan = current && !owners.some((o) => o.value === current);
  // keep the declared order, but never drop a group we don't know about
  const groups = [...new Set([...GROUP_ORDER, ...owners.map((o) => o.group)])];
  return (
    <>
      {orphan && <option value={current}>{current} (not a user)</option>}
      {groups.map((g) => {
        const items = owners.filter((o) => o.group === g);
        if (!items.length) return null;
        return (
          <optgroup key={g} label={g}>
            {items.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
          </optgroup>
        );
      })}
    </>
  );
}

export function AddTaskForm({ form, setForm, owners, onSubmit, onCancel, hideActions }: { form: any; setForm: (f: any) => void; owners: Assignee[]; onSubmit: () => void; onCancel: () => void; hideActions?: boolean }) {
  return (
    <div className="rounded border p-2 mt-1 bg-white" style={{ borderColor: "var(--accent)" }}>
      <datalist id="who-options">
        <AssigneeOptions owners={owners} current={form.who} />
      </datalist>
      {/* two lines, not one: a task worth raising rarely fits in a single
          line of a narrow box, and typing blind past the right-hand edge is
          how tasks end up named "Chassis spares parts list costing pend" */}
      <textarea
        autoFocus
        rows={2}
        placeholder="Task…"
        value={form.t}
        onChange={(e) => setForm({ ...form, t: e.target.value })}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSubmit(); }}
        className="w-full text-xs border rounded px-1 py-1 mb-1"
        style={{ borderColor: "var(--line)", resize: "vertical", lineHeight: 1.45 }}
      />
      <div className="flex gap-1 mb-1">
        {/* Typeable as well as pickable. Scrolling a dropdown for a name you
            already know is the slowest part of raising a task, and the list
            only grows. The datalist keeps every account one keystroke away
            while still accepting free text for an ERP handle we don't hold. */}
        <input
          list="who-options"
          value={form.who}
          onChange={(e) => setForm({ ...form, who: e.target.value })}
          placeholder="Who? — type or pick"
          className="w-1/2 text-xs border rounded px-1 py-1"
          style={{ borderColor: "var(--line)" }}
          title="Type a name or initials, or pick from the list"
        />
        <input type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} className="w-1/2 text-xs border rounded px-1 py-1" style={{ borderColor: "var(--line)" }} />
      </div>
      <div className="mb-1">
        <div className="text-xs mb-0.5" style={{ color: "var(--muted)" }}>Escalation Log</div>
        <select value={form.esc} onChange={(e) => setForm({ ...form, esc: e.target.value })} className="w-full text-xs border rounded px-1 py-1 bg-white" style={{ borderColor: "var(--line)" }}>
          {ESC_LEVELS.map((c) => (<option key={c}>{c}</option>))}
        </select>
        {escalated(form.esc) && (
          <input
            autoFocus
            value={form.esc_why || ""}
            onChange={(e) => setForm({ ...form, esc_why: e.target.value })}
            placeholder="Why escalated? (required)"
            className="w-full text-xs border rounded px-1 py-1 mt-1"
            style={{ borderColor: (form.esc_why || "").trim() ? "var(--line)" : "var(--red)" }}
            title="Whoever this lands on needs to know why without having to ring you"
          />
        )}
      </div>
      <div className="flex gap-1">
        <select value={form.cat} onChange={(e) => setForm({ ...form, cat: e.target.value })} className="flex-1 text-xs border rounded px-1 py-1 bg-white" style={{ borderColor: "var(--line)" }}>
          {TASK_CATS.map((c) => (<option key={c}>{c}</option>))}
        </select>
        {/* the modal draws its own Save / Save & add another, so the inline
            pair would be a second Add button saying the same thing */}
        {!hideActions && <button onClick={onSubmit} className="text-xs font-bold rounded px-2" style={{ background: "var(--accent)", color: "#fff" }}>Add</button>}
        {!hideActions && <button onClick={onCancel} className="text-xs rounded px-1" style={{ color: "var(--muted)" }}>✕</button>}
      </div>
    </div>
  );
}

export function TaskModal({ task, owners = [], onClose, onToggle, reload, canDelete = false, jobRef = null, onOpenJob }: { task: Task; owners?: Assignee[]; onClose: () => void; onToggle: (prevention?: string) => Promise<void> | void; reload: () => Promise<Board | null>; canDelete?: boolean; jobRef?: { id: string; label: string; project: string } | null; onOpenJob?: (jobId: string) => void }) {
  const [comments, setComments] = useState<{ by: string; at: string; body: string }[]>([]);
  // every time this task's due date has moved
  const [dateLog, setDateLog] = useState<{ id: string; old_due: string | null; new_due: string | null; by: string | null; at: string }[]>([]);
  const [cmt, setCmt] = useState("");
  const [editing, setEditing] = useState(false);
  /**
   * Closing an ESCALATED task asks what stops it happening again -- every
   * level, set by Dr Raghu. The server refuses without it and so does the
   * table's own check; this is just the place it gets typed.
   */
  const [closing, setClosing] = useState(false);
  const [prevent, setPrevent] = useState("");
  const [closeErr, setCloseErr] = useState("");
  const [ef, setEf] = useState({ t: task.t || "", d: task.d || "", who: task.who || "", due: task.due || "", cat: task.cat || "Production", esc: task.esc || "None" });
  /** Photos and files on the task (0074) — stored in Genie, mirrored to Drive. */
  const [files, setFiles] = useState<{ id: string; name: string; url: string | null; is_photo: boolean; by: string | null; at: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const isMs = String(task.id).startsWith("ms"); // milestone pseudo-card from the Job Plan kanban
  const loadFiles = useCallback(() => {
    api.get(`/api/task-file?task_id=${task.id}&kind=${task.kind}`).then((r) => setFiles(r.files || [])).catch(() => {});
  }, [task.id, task.kind]);
  useEffect(() => {
    if (isMs) return;
    api.get(`/api/comments?task_id=${task.id}&task_kind=${task.kind}`).then((r) => setComments(r.comments)).catch(() => {});
    api.get(`/api/task-dates?task_id=${task.id}&task_kind=${task.kind}`)
      .then((r) => setDateLog(r.moves || []))
      .catch(() => setDateLog([]));
    loadFiles();
  }, [task, isMs, loadFiles]);
  const attach = async (f: File | null) => {
    if (!f) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("task_id", task.id);
      fd.append("kind", task.kind);
      const res = await fetch("/api/task-file", { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.json()).error || "The upload failed");
      loadFiles();
    } catch (e) { alert(e instanceof Error ? e.message : String(e)); }
    setUploading(false);
  };
  /** "raghu@nandan.co.in · 28 Aug, 07:04 am" without the address when a name would do. */
  const whoMade = task.by ? task.by.split("@")[0] : task.kind === "erp" ? "the ERP ToDo upload" : null;
  const madeAt = task.created_at
    ? new Date(task.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;
  const add = async () => {
    if (!cmt.trim()) return;
    await api.post("/api/comments", { task_id: task.id, task_kind: task.kind, body: cmt.trim() });
    setCmt("");
    const r = await api.get(`/api/comments?task_id=${task.id}&task_kind=${task.kind}`);
    setComments(r.comments);
    await reload();
  };
  const saveEdit = async () => {
    if (!ef.t.trim()) return;
    await api.post("/api/tasks", { action: "update", id: task.id, kind: task.kind, title: ef.t.trim(), detail: ef.d, who: ef.who, due: ef.due || null, cat: ef.cat, esc: ef.esc });
    await reload();
    onClose();
  };
  const remove = async () => {
    const warn =
      task.kind === "erp"
        ? "\n\n⚠ This task came from the ERP ToDo list. Deleting it here removes it now, but the next ToDo upload will bring it back unless it is also closed in the ERP."
        : "";
    if (!window.confirm(`Delete this task?\n\n"${task.t}"${warn}\n\nIts comments are deleted too. This cannot be undone.`)) return;
    try {
      await api.post("/api/tasks", { action: "delete", id: task.id, kind: task.kind });
      await reload();
      onClose();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <div onClick={onClose} className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)", zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg p-4 w-full max-w-md" style={{ maxHeight: "80vh", overflow: "auto" }}>
        <div className="flex items-start justify-between gap-2">
          {editing ? (
            <input autoFocus value={ef.t} onChange={(e) => setEf({ ...ef, t: e.target.value })} className="flex-1 text-sm font-bold border rounded px-2 py-1" style={{ borderColor: "var(--accent)" }} />
          ) : (
            /* Three lines, then an ellipsis. A pasted paragraph of a task
               title used to push the Escalation chip, the buttons and the
               comments off the bottom of the modal; the full text is on hover
               and in Edit. */
            <div
              className="font-bold text-sm"
              title={task.t}
              style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}
            >
              {task.t}
            </div>
          )}
          <button onClick={onClose} style={{ color: "var(--muted)" }}>✕</button>
        </div>

        {/* Who raised it, and what it hangs off — first, before anything else
            (Dr Raghu, 28 Aug 2026: neither was clear from the box). */}
        {!isMs && (
          <div className="mt-1.5 space-y-1">
            <div className="text-xs" style={{ color: "var(--muted)" }}>
              Created by <b style={{ color: "var(--dim)" }}>{whoMade ?? "—"}</b>
              {madeAt && <> on <span className="tnum">{madeAt}</span></>}
            </div>
            <div className="text-xs flex items-center gap-1.5 flex-wrap">
              {jobRef ? (
                <>
                  {jobRef.project && (
                    <span className="rounded px-1.5 py-0.5 font-bold" style={{ background: "#DDE6EE", color: "var(--blue)" }}>
                      Project · {jobRef.project}
                    </span>
                  )}
                  <span className="rounded px-1.5 py-0.5 font-bold" style={{ background: "#F4EFE4", color: "#7A5E1E" }}>
                    Job · {jobRef.label}
                  </span>
                  {onOpenJob && (
                    <button onClick={() => { onClose(); onOpenJob(jobRef.id); }} className="font-bold" style={{ color: "var(--accent)" }}>
                      Open the job ↗
                    </button>
                  )}
                </>
              ) : (
                <span className="rounded px-1.5 py-0.5 font-bold" style={{ background: "#EDE7F9", color: "#5B21B6" }}
                  title="Raised straight in Tasking — it hangs off no job, the Brain Dump way">
                  🧠 Standalone — no job attached (Brain Dump style)
                </span>
              )}
            </div>
          </div>
        )}

        {isMs ? (
          <>
            {task.d && <div className="text-xs mt-2" style={{ color: "var(--dim)" }}>{task.d}</div>}
            <div className="text-xs mt-3 rounded p-2" style={{ background: "#DDE6EE", color: "var(--blue)" }}>⚑ This is a plan milestone — edit its name, dates, crew or tick it done in the Milestone table above.</div>
          </>
        ) : editing ? (
          <div className="mt-2 space-y-1.5">
            <textarea value={ef.d} onChange={(e) => setEf({ ...ef, d: e.target.value })} placeholder="Details…" rows={2} className="w-full text-xs border rounded px-2 py-1" style={{ borderColor: "var(--line)" }} />
            <div className="flex gap-1">
              <select value={ef.who} onChange={(e) => setEf({ ...ef, who: e.target.value })} className="w-1/2 text-xs border rounded px-1 py-1 bg-white" style={{ borderColor: "var(--line)" }} title="Assign to a user — the list comes from created accounts">
                <option value="">Who?</option>
                <AssigneeOptions owners={owners} current={ef.who} />
              </select>
              <input type="date" value={ef.due} onChange={(e) => setEf({ ...ef, due: e.target.value })} className="w-1/2 text-xs border rounded px-1 py-1" style={{ borderColor: "var(--line)" }} />
            </div>
            <div className="flex gap-1">
              <select value={ef.cat} onChange={(e) => setEf({ ...ef, cat: e.target.value })} className="w-1/2 text-xs border rounded px-1 py-1 bg-white" style={{ borderColor: "var(--line)" }}>
                {!TASK_CATS.includes(ef.cat) && ef.cat && <option value={ef.cat}>{ef.cat}</option>}
                {TASK_CATS.map((c) => (<option key={c}>{c}</option>))}
              </select>
              <select value={ef.esc} onChange={(e) => setEf({ ...ef, esc: e.target.value })} className="w-1/2 text-xs border rounded px-1 py-1 bg-white" style={{ borderColor: "var(--line)" }} title="Escalation Log">
                {ESC_LEVELS.map((c) => (<option key={c}>{c}</option>))}
              </select>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={saveEdit} className="flex-1 text-xs font-bold rounded py-1.5" style={{ background: "var(--accent)", color: "#fff" }}>💾 Save changes</button>
              <button onClick={() => setEditing(false)} className="text-xs rounded px-3" style={{ color: "var(--muted)" }}>Cancel</button>
            </div>
            <div className="text-xs pt-0.5" style={{ color: "var(--muted)" }}>
              Created by <b>{whoMade ?? "—"}</b>{madeAt ? ` on ${madeAt.split(",")[0]} at${madeAt.split(",")[1] ?? ""}` : ""}
            </div>
          </div>
        ) : (
          <>
            {task.d && <div className="text-xs mt-2" style={{ color: "var(--dim)" }}>{task.d}</div>}
            {task.esc && task.esc !== "None" && (
              <div className="text-xs mt-2 font-bold rounded px-2 py-1 inline-block" style={{ background: "var(--red)", color: "#fff" }}>⚠ Escalation: {task.esc}</div>
            )}
            <div className="flex items-center gap-2 mt-2 text-xs" style={{ color: "var(--muted)" }}>
              <span>{initials(task.who)}</span><span>{task.cat}</span><span className="tnum">{fmt(task.due)}</span>
              <button onClick={() => setEditing(true)} className="ml-auto rounded px-2 py-1 font-bold" style={{ background: "#DCE8F5", color: "var(--blue)" }}>✎ Edit</button>
              <button
                onClick={() => {
                  // Re-opening asks nothing. Only the way IN to done costs a sentence.
                  if (!task.done && escalated(task.esc)) { setCloseErr(""); setClosing(true); return; }
                  onToggle();
                }}
                className="rounded px-2 py-1 font-bold"
                style={{ background: task.done ? "#E7E4DC" : "var(--green)", color: task.done ? "var(--dim)" : "#fff" }}
              >
                {task.done ? "Reopen" : escalated(task.esc) ? "✓ Done…" : "✓ Done"}
              </button>
              {/* Admins only. Everyone else closes it — Done keeps the comments
                  and the date history that deleting throws away. */}
              {canDelete && (
                <button onClick={remove} className="rounded px-2 py-1 font-bold" style={{ background: "#FBEDEA", color: "var(--red)" }} title="Delete this task (admin)">🗑</button>
              )}
            </div>
          </>
        )}

        {!isMs && (
          <div className="mt-3 border-t pt-2" style={{ borderColor: "#EEECE6" }}>
            {/* Photos and files — kept in Genie, mirrored to the Drive folders
                ("Photos from Genie" / "Files from Genie") by the Mac sync. */}
            <div className="flex items-center gap-2 mb-1">
              <div className="text-xs font-bold" style={{ color: "var(--dim)" }}>📎 Photos & files</div>
              <label className="text-xs font-bold rounded px-2 py-0.5 cursor-pointer" style={{ background: "#DCE8F5", color: "var(--blue)" }}>
                {uploading ? "Uploading…" : "+ Add photo or file"}
                <input type="file" className="hidden" disabled={uploading}
                  onChange={(e) => { attach(e.target.files?.[0] ?? null); e.target.value = ""; }} />
              </label>
            </div>
            {files.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {files.map((f) => (
                  <a key={f.id} href={f.url ?? "#"} target="_blank" rel="noreferrer"
                    className="text-xs rounded px-2 py-1 font-semibold border"
                    style={{ borderColor: "var(--line)", color: "var(--blue)", textDecoration: "none", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    title={`${f.name} — ${f.by ?? ""}`}>
                    {f.is_photo ? "📷" : "📄"} {f.name}
                  </a>
                ))}
              </div>
            )}
            {/* The date history sits ABOVE the comments and reads like one.
                A due date that has moved four times IS the story of the task,
                and burying it in a field somebody has to compare by memory is
                how a task quietly slips a month one week at a time. */}
            {(dateLog.length > 0 || (task.push_count ?? 0) > 0) && (
              <div className="rounded p-2 mb-2" style={{ background: "#FBEDEA", border: "1px solid #F0C9C4" }}>
                <div className="text-xs font-bold mb-1" style={{ color: "var(--red)" }}>
                  Date moved {task.push_count ?? dateLog.length} time{(task.push_count ?? dateLog.length) === 1 ? "" : "s"}
                  {task.original_due && <span className="font-normal" style={{ color: "#8A5A00" }}> · first promised {fmtFull(task.original_due)}</span>}
                </div>
                {dateLog.map((m) => (
                  <div key={m.id} className="text-xs" style={{ color: "var(--dim)", lineHeight: 1.5 }}>
                    <b style={{ color: "var(--ink)" }}>{m.by || "someone"}</b> moved it{" "}
                    {m.old_due ? fmtFull(m.old_due) : "no date"} → <b style={{ color: "var(--red)" }}>{m.new_due ? fmtFull(m.new_due) : "no date"}</b>
                    <span style={{ color: "#B8B5AC" }}> · {String(m.at).slice(0, 10).split("-").reverse().join("-")}</span>
                  </div>
                ))}
                {dateLog.length === 0 && (
                  <div className="text-xs" style={{ color: "var(--muted)" }}>Moved before Genie started recording who moved it.</div>
                )}
              </div>
            )}
            {closing && (
              <div className="rounded p-2.5 mb-2" style={{ background: "#FBEDEA", border: "1px solid #B3261E" }}>
                <div className="text-xs font-bold mb-1" style={{ color: "var(--red)" }}>
                  ⚠ Closing an escalated task ({task.esc})
                </div>
                <div className="text-xs mb-1.5" style={{ color: "var(--dim)", lineHeight: 1.5 }}>
                  What is being done so this does not happen again? Not what was done to fix this one —
                  what changes so the next job does not hit it.
                </div>
                <textarea
                  autoFocus
                  rows={3}
                  value={prevent}
                  onChange={(e) => { setPrevent(e.target.value); if (closeErr) setCloseErr(""); }}
                  placeholder="e.g. BOM now frozen before drawings release — added as a gate on the Design milestone"
                  className="w-full text-xs border rounded px-2 py-1"
                  style={{ borderColor: "#D9A9A2" }}
                />
                {closeErr && <div className="text-xs font-bold mt-1" style={{ color: "var(--red)" }}>{closeErr}</div>}
                <div className="flex items-center gap-2 mt-1.5">
                  <button
                    onClick={async () => {
                      const note = prevent.trim();
                      if (note.length < 15) { setCloseErr("A sentence, please — at least 15 characters."); return; }
                      try {
                        await onToggle(note);
                      } catch (e) {
                        setCloseErr(e instanceof Error ? e.message : String(e));
                      }
                    }}
                    className="rounded px-3 py-1 text-xs font-bold text-white"
                    style={{ background: "var(--green)" }}
                  >
                    ✓ Save and close the task
                  </button>
                  <button onClick={() => { setClosing(false); setPrevent(""); setCloseErr(""); }} className="text-xs font-semibold" style={{ color: "var(--muted)" }}>Cancel</button>
                  <span className="text-xs ml-auto tnum" style={{ color: prevent.trim().length < 15 ? "var(--red)" : "var(--green)" }}>
                    {prevent.trim().length}/15
                  </span>
                </div>
              </div>
            )}
            <div className="text-xs font-bold mb-1" style={{ color: "var(--dim)" }}>Comments</div>
            {comments.map((c, i) => (
              <div key={i} className="text-xs mb-1"><span className="font-bold">{c.by}</span> <span style={{ color: "var(--muted)" }}>{new Date(c.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span><div>{c.body}</div></div>
            ))}
            <div className="flex gap-1 mt-2">
              <input value={cmt} onChange={(e) => setCmt(e.target.value)} placeholder="Add a comment…" className="flex-1 text-xs border rounded px-2 py-1" style={{ borderColor: "var(--line)" }} />
              <button onClick={add} className="text-xs font-bold rounded px-2" style={{ background: "var(--accent)", color: "#fff" }}>Post</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}