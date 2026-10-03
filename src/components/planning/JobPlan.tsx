"use client";
// split out of PlanningSuite.tsx (Genie 5.0.1.1) — one file per tab, loaded when opened
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { swallow } from "@/lib/swallow";

import { api } from "@/lib/api";

import { TRADES, zeroCrew, type Crew } from "@/lib/templates";
import { fmt, fmtFull, jobNo, initials, diffDays, addDays, computeSchedule, planEnd, manDays, isoWeek, otdColor, otdDelay, parseISO, escalated, type Plan, type PlanMilestone } from "@/lib/schedule";

import MaterialKitting from "../MaterialKitting";

import { Board, Job, TODAY, Task, assignees, erpJobLink, investedIn, personLabel, redactMoney, taskJobRef, templateMilestones } from "./shared";
import { JobTopRow, PhotoBody, ShopUpdates, ShopUpdatesPanel } from "./OnFloor";
import { Chip, CrewCell } from "./MyWeek";
import { JobManpowerStrip, ManpowerLedger } from "./Manpower";
import { MilestoneSpanner } from "./LoadBoard";
import { AddTaskForm, TaskCard, TaskModal } from "./Tasking";

/** The shape computeSchedule returns — named so the panel above can take one. */
export type ScheduledRow = ReturnType<typeof computeSchedule>[number];

// ============================ Genie Hint ============================
export interface Hint {
  headline: string;
  status: "on_track" | "at_risk" | "late" | "done" | "unknown";
  story: string;
  actions: string[];
  watch: string;
  people: {
    owner: string | null;
    manager: string | null;
    assignees: { handle: string; name: string; open: number }[];
  };
  at: string;
  cached?: boolean;
}

export const HINT_STATUS: Record<Hint["status"], { label: string; bg: string; fg: string }> = {
  on_track: { label: "ON TRACK", bg: "#E6F4EA", fg: "var(--green)" },
  at_risk: { label: "AT RISK", bg: "#FFF4E0", fg: "#B26A00" },
  late: { label: "LATE", bg: "#FBEDEA", fg: "var(--red)" },
  done: { label: "DELIVERED", bg: "#E6F4EA", fg: "var(--green)" },
  unknown: { label: "NOT ENOUGH DATA", bg: "#F4F2EC", fg: "var(--muted)" },
};

/**
 * The written read on the right of the Job Plan header: how the job is being
 * handled, what would actually move it, and who is on it.
 *
 * Deliberately click-to-load. Opening a job should never wait on a model, and
 * plans are edited far more often than they are re-read — so the brief is
 * asked for, not pushed. The server caches each job's brief for 30 minutes.
 */
/**
 * Where the job stands in words and in money — the two things the milestone
 * plan below cannot tell you.
 *
 * Current Status and Client update are what somebody wrote; the three figures
 * are what the job is doing to the bank. They sit together because that is how
 * the decision is actually made: a job with ₹40 L invested and ₹1.2 Cr falling
 * due on delivery is a different job from one with the same dates and neither.
 *
 * Every field is read from the Jobmaster export. A field the export did not
 * carry is left out entirely rather than shown empty — a blank box invites
 * somebody to go looking for a way to fill it in, and there isn't one here.
 */
export function JobStanding({ job, V }: { job: Job; V: (n: number) => string }) {
  const invested = investedIn(job);
  // Escalation first: what is holding a job up outranks what it is worth, and
  // burying it under two paragraphs of status would be the wrong order.
  const text: [string, string | null, string][] = [
    ["Current Project Escalation", job.escalation, "var(--red)"],
    ["Current Status", job.note || null, "var(--ink)"],
    ["Client Update Latest", redactMoney(job.clientUpdate) || job.clientUpdate, "var(--ink)"],
    ["Cash Flow Details", job.cashflow, "var(--ink)"],
  ];
  const shownText = text.filter(([, v]) => v && v.trim());
  // every one of the five absent = the export predates them
  const stale =
    !job.escalation && !job.clientUpdate && !job.cashflow && job.amtNeeded == null && job.payOnDelivery == null;
  const figures: [string, number | null, string, string][] = [
    ["Invested", invested, "#7C3AED", `(1 − ${job.tpp || 0}%) × ${job.kit || 0}% × ${V(job.val)} — material value already drawn`],
    ["Amount needed next month", job.amtNeeded, "var(--warn)", "What this job needs spent on it in the coming month"],
    ["Pending payment on delivery", job.payOnDelivery, "var(--green)", "Falls due the day this job goes out"],
  ];

  return (
    <div className="bg-white rounded-lg p-3 border" style={{ borderColor: "var(--line)", borderLeft: "5px solid #1B3A5C", flex: "1 1 320px", minWidth: 280, maxWidth: 520 }}>
      <div className="text-xs font-bold tracking-widest mb-1.5" style={{ color: "var(--blue)" }}>WHERE IT STANDS</div>

      <div className="flex gap-2 flex-wrap mb-2">
        {figures.map(([label, v, color, tip]) => (
          <div key={label} className="rounded px-2 py-1" style={{ background: "#F4F2EC", flex: "1 1 0", minWidth: 96 }} title={tip}>
            <div style={{ fontSize: 10, color: "var(--muted)", letterSpacing: 0.4 }}>{label.toUpperCase()}</div>
            {/* null is "not in the export", and says so — it is not ₹0 */}
            <div className="tnum font-bold" style={{ fontSize: 15, color: v == null ? "#B8B5AC" : color }}>
              {v == null ? "—" : V(v)}
            </div>
          </div>
        ))}
      </div>

      {/* An empty field here is nearly always ONE thing: the Jobmaster has not
          been uploaded since these columns were added. Saying so is the
          difference between a page that looks broken and a page that tells you
          what to do about it. */}
      {stale && (
        <div className="rounded p-2 mb-2 text-xs" style={{ background: "#FFF7E6", border: "1px solid #F0D9A8", color: "#8A5A00", lineHeight: 1.5 }}>
          <b>Not loaded yet.</b> These five come from the Jobmaster export, and no jobs file has been uploaded since
          Genie learned to read them. Load <b>Job in progress - Jobs</b> on Morning Update and they fill — the summary
          names which column each one matched.
        </div>
      )}
      {shownText.length === 0 && !stale ? (
        <div className="text-xs" style={{ color: "#B8B5AC", lineHeight: 1.5 }}>
          No status or client note came across on this job in the last upload.
        </div>
      ) : (
        <div className="flex flex-col gap-1.5" style={{ maxHeight: 240, overflowY: "auto" }}>
          {shownText.map(([label, v, color]) => (
            <div key={label} style={color === "#B3261E" ? { background: "#FBEDEA", borderLeft: "3px solid #B3261E", padding: "4px 6px", borderRadius: 3 } : undefined}>
              <div style={{ fontSize: 10, color: color === "#B3261E" ? color : "#8A94A0", letterSpacing: 0.4, fontWeight: color === "#B3261E" ? 700 : 400 }}>
                {label.toUpperCase()}
              </div>
              <div className="text-xs" style={{ color: "var(--ink)", lineHeight: 1.5 }}>{v}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function GenieHint({ jobId, jobLabel }: { jobId: string; jobLabel: string }) {
  const [hint, setHint] = useState<Hint | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [meta, setMeta] = useState<{ builtBy: string | null; builtAt: string | null; stale: boolean } | null>(null);
  const [may, setMay] = useState(false);

  const ask = useCallback(async (refresh = false) => {
    setBusy(true);
    setErr("");
    try {
      const r = await api.post("/api/genie-hint", { job_id: jobId, refresh });
      setHint(r);
      setMeta({ builtBy: r.builtBy ?? null, builtAt: r.builtAt ?? null, stale: false });
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }, [jobId]);

  /**
   * PAUSED (28 Aug 2026): opening a job reads the SHARED cache and nothing
   * more — a single free row. Genie never writes a brief on its own any more;
   * only MC and Stratcom see the Generate button, and only their click spends
   * a model call. Whoever generated last, everybody else reads free.
   */
  useEffect(() => {
    let live = true;
    setHint(null);
    setErr("");
    setMeta(null);
    setMay(false);
    (async () => {
      try {
        const r = await api.get(`/api/genie-hint?job_id=${encodeURIComponent(jobId)}`);
        if (!live) return;
        setMay(!!r.may);
        if (r.hint) {
          setHint(r.hint);
          setMeta({ builtBy: r.builtBy ?? null, builtAt: r.builtAt ?? null, stale: !!r.stale });
        }
      } catch (e) { swallow("PlanningSuite", e); /* silent: the brief is a companion to the page, never a gate on it */ }
    })();
    return () => { live = false; };
  }, [jobId]);

  const st = hint ? HINT_STATUS[hint.status] ?? HINT_STATUS.unknown : null;

  return (
    <div
      className="bg-white rounded-lg p-3 border"
      style={{ borderColor: "var(--line)", borderLeft: "5px solid #7C3AED", flex: "1 1 340px", minWidth: 300, maxWidth: 520 }}
    >
      <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
        <div className="text-xs font-bold tracking-widest" style={{ color: "#7C3AED" }}>✨ GENIE HINT</div>
        <div className="flex items-center gap-2">
          {st && <span className="text-xs font-bold rounded px-1.5 py-0.5" style={{ background: st.bg, color: st.fg }}>{st.label}</span>}
          {hint && may && (
            <button onClick={() => ask(true)} disabled={busy} className="text-xs font-bold" style={{ color: "#7C3AED", opacity: busy ? 0.5 : 1 }}
              title={
                (meta?.builtBy ? `Read built by ${meta.builtBy}${meta.builtAt ? " on " + fmtFull(String(meta.builtAt)) : ""}. ` : "") +
                "Re-read the job from scratch — everyone sees the new one."
              }>
              ↻
            </button>
          )}
        </div>
      </div>

      {!hint && !busy && !err && (
        <>
          <div className="text-xs mb-2" style={{ color: "var(--dim)" }}>
            A written read on <b>{jobLabel}</b> — how it has been handled, what would move the delivery date, and who is on it. Built from this job&apos;s own plan, materials and tasks.
          </div>
          {may ? (
            <button onClick={() => ask()} className="rounded px-3 py-1.5 font-bold text-sm" style={{ background: "#7C3AED", color: "#fff" }}>
              Generate with Genie
            </button>
          ) : (
            <div className="text-xs" style={{ color: "var(--muted)" }}>
              Genie is paused — a read appears here once MC or Stratcom generates one.
            </div>
          )}
        </>
      )}

      {busy && (
        <div className="flex items-center gap-2 py-4">
          <div className="animate-spin rounded-full" style={{ width: 18, height: 18, border: "2px solid #EDE7F9", borderTopColor: "#7C3AED" }} />
          <span className="text-sm" style={{ color: "var(--dim)" }}>Reading the plan, materials and tasks…</span>
        </div>
      )}

      {err && !busy && (
        <div className="text-xs" style={{ color: "var(--red)" }}>
          {err}
          {may && <button onClick={() => ask()} className="ml-2 font-bold" style={{ color: "#7C3AED" }}>try again</button>}
        </div>
      )}

      {hint && !busy && (
        <div style={{ maxHeight: 420, overflowY: "auto" }}>
          <div className="text-sm font-bold mb-1" style={{ color: "var(--navy)" }}>{redactMoney(hint.headline)}</div>
          <div className="text-sm" style={{ color: "var(--dim)" }}>{redactMoney(hint.story)}</div>

          {hint.actions.length > 0 && (
            <>
              <div className="text-xs font-bold mt-2 mb-0.5" style={{ color: "var(--muted)" }}>TO DELIVER THIS JOB</div>
              <ul style={{ listStyle: "disc", paddingLeft: 18 }}>
                {hint.actions.map((a, i) => (<li key={i} className="text-sm" style={{ color: "var(--navy)" }}>{redactMoney(a)}</li>))}
              </ul>
            </>
          )}

          {hint.watch && (
            <div className="rounded px-2 py-1.5 mt-2 text-xs" style={{ background: "#FFF4E0", color: "#7A4A00" }}>
              <b>Watch:</b> {redactMoney(hint.watch)}
            </div>
          )}

          <div className="text-xs font-bold mt-2 mb-1" style={{ color: "var(--muted)" }}>WHO IS ON IT</div>
          <div className="text-xs" style={{ color: "var(--dim)" }}>
            <div><b style={{ color: "var(--navy)" }}>Job owner:</b> {hint.people.owner || "not recorded"}</div>
            {hint.people.manager && <div><b style={{ color: "var(--navy)" }}>Project manager:</b> {hint.people.manager}</div>}
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            {hint.people.assignees.length === 0 && (
              <span className="text-xs" style={{ color: "var(--muted)" }}>Nobody is carrying an open task on this job.</span>
            )}
            {hint.people.assignees.map((a) => (
              <span key={a.handle} className="text-xs rounded px-1.5 py-0.5" style={{ background: "#F4F2EC", color: "var(--navy)" }} title={`${a.open} open task${a.open === 1 ? "" : "s"}`}>
                {a.name} <b style={{ color: "var(--accent)" }}>{a.open}</b>
              </span>
            ))}
          </div>

          {/* The sign-off is an instruction, not a disclaimer. "Check before
              acting" told somebody to distrust the panel and stop; this tells
              them what the panel is FOR — move the plan, and escalate to the
              person who can actually clear it. */}
          <div className="text-xs mt-2" style={{ color: "var(--muted)", lineHeight: 1.5 }}>
            Written by Genie based on coaching by Raghu{hint.cached ? " · cached" : ""}
            <div style={{ color: "#B8B5AC" }}>
              Work on the plan, and escalate as needed — to the right person, at the right time.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================ Job Plan ============================
export const MAT_ITEMS = [
  "Chassis / base frame steel", "Structural sections & plates", "Hydraulic powerpack",
  "Hydraulic cylinders & hoses", "Control panel & wiring loom", "Bought-out wheels / castors",
  "Paint & consumables", "Fasteners & hardware",
];

export function JobPlan({
  isAdmin,
  board,
  activeId,
  setActiveId,
  V,
  reload,
  isRaghu,
  canEdit,
  pushERP,
}: {
  board: Board;
  activeId: string | null;
  setActiveId: (id: string) => void;
  V: (v: number) => string;
  reload: () => Promise<Board | null>;
  /** Deleting a task is admin-only — everyone else closes it. */
  isAdmin: boolean;
  isRaghu: boolean;
  /** admin / planner / project_owner. Others see the plan read-only — the
   *  server already rejected their writes, but the UI let them type, which
   *  looked like "changes not saving" rather than "no permission". */
  canEdit: boolean;
  pushERP: (dt: string, id: string, f: string, v: string) => void;
}) {
  // re-sorted on every keystroke before — the job list only changes when the board does
  const byTDD = useMemo(
    () => [...board.jobs].sort((a, b) => ((a.tdd || "9999") < (b.tdd || "9999") ? -1 : 1)),
    [board.jobs],
  );

  // job-picker search + Project Owner filter (in addition to the dropdown)
  const [planQ, setPlanQ] = useState("");
  const [planPO, setPlanPO] = useState("all");
  const pickerJobs = useMemo(() => {
    const needle = planQ.trim().toLowerCase();
    return byTDD.filter((j) => {
      if (planPO !== "all" && j.ownerInitials !== planPO) return false;
      if (!needle) return true;
      return (
        j.id.includes(needle) ||
        jobNo(j.id).includes(needle) ||
        j.tag.toLowerCase().includes(needle) ||
        j.cust.toLowerCase().includes(needle) ||
        j.fam.toLowerCase().includes(needle)
      );
    });
  }, [byTDD, planQ, planPO]);
  const job = useMemo(
    () => board.jobs.find((j) => j.id === activeId) || (activeId ? board.archived[activeId] : undefined),
    [board.jobs, board.archived, activeId],
  );

  const [planView, setPlanView] = useState<"plan" | "mat" | "shop" | "pics" | "mp">("plan");
  const [draft, setDraft] = useState<Plan | null>(null);
  const [applyTplName, setApplyTplName] = useState("");
  const templateNames = useMemo(() => Object.keys(board.templates).sort(), [board.templates]);
  const [dragMi, setDragMi] = useState<number | null>(null);
  const [warned, setWarned] = useState<Set<string>>(new Set());
  const [addingTask, setAddingTask] = useState<string | null>(null);
  const [form, setForm] = useState({ t: "", who: "", due: TODAY, cat: "Production", esc: "None", esc_why: "" });
  const [msForm, setMsForm] = useState<{ open: boolean; name: string; days: number }>({ open: false, name: "", days: 3 });
  const [showPastMs, setShowPastMs] = useState(false);
  const [lightbox, setLightbox] = useState<Task | null>(null);
  const [matForm, setMatForm] = useState({ item: "", qty: "" });
  const dirty = useRef(false);
  const seededMat = useRef<string | null>(null);

  const baseFor = (j: Job): Plan => {
    const saved = board.plans[j.id];
    if (saved && saved.milestones.length)
      return { start: saved.start || j.start || TODAY, milestones: saved.milestones.map((m) => ({ ...m, crew: { ...m.crew }, preds: [...m.preds] })) };
    return { start: j.start && j.start >= TODAY ? j.start : TODAY, milestones: templateMilestones(j.fam, board.templates) };
  };
  useEffect(() => {
    if (!job) { setDraft(null); return; }
    dirty.current = false;
    setDraft(baseFor(job));
  }, [activeId, board]); // eslint-disable-line react-hooks/exhaustive-deps

  // debounced auto-save (only after an actual edit) — persists milestones incl. done flags
  useEffect(() => {
    if (!canEdit) return; // read-only roles never write, so never try
    if (!job || !draft || !dirty.current) return;
    const t = setTimeout(() => {
      api.post("/api/plan", { job_id: job.id, start: draft.start, milestones: draft.milestones }).catch(() => {});
    }, 800);
    return () => clearTimeout(t);
  }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Has the header card scrolled out of view?
   *
   * Watched rather than measured against a scroll position: the card changes
   * height as its chips wrap, so any fixed threshold would be right at one
   * window width and wrong at the next.
   */
  const isAdminHere = isAdmin;
  const hdrCardRef = useRef<HTMLDivElement | null>(null);
  const [hdrGone, setHdrGone] = useState(false);
  /** The shop-update history, in a lightbox. */
  const [shopOpen, setShopOpen] = useState(false);
  useEffect(() => {
    const el = hdrCardRef.current;
    if (!el) return;
    // The sentinel sits directly above the pinned row. It leaving the top of
    // the viewport IS the row becoming stuck -- so the shadow appears exactly
    // when the row starts covering content, and not a pixel before.
    const io = new IntersectionObserver(([e]) => setHdrGone(!e.isIntersecting), {
      rootMargin: "-150px 0px 0px 0px",
      threshold: 0,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const sched = useMemo(() => (draft ? computeSchedule(draft) : []), [draft]);
  const ends = sched.length ? planEnd(sched) : TODAY;
  const successors = useMemo(() => {
    const map: Record<number, number[]> = {};
    sched.forEach((m) => (m.preds || []).forEach((p) => (map[p] = map[p] || []).push(m.idx)));
    return map;
  }, [sched]);
  const tradeTotals = useMemo(() => {
    const t = zeroCrew();
    sched.forEach((m) => TRADES.forEach((tr) => (t[tr.key] += (m.crew[tr.key] || 0) * Math.max(1, m.days))));
    return t;
  }, [sched]);
  const grandTotal = TRADES.reduce((s, t) => s + tradeTotals[t.key], 0);
  const savedPlan = job ? board.plans[job.id] : undefined;
  const baseline = job ? board.baselines[job.id] : undefined;
  const baselineEnd = savedPlan?.baseline_end || null;
  const msDone = sched.filter((m) => m.done).length;
  const allDone = sched.length > 0 && msDone === sched.length;
  const realEnd = allDone ? sched.reduce((mx, m) => (m.done_on && m.done_on > mx ? m.done_on : mx), "") : null;

  // tasks for the open job — memoised here, above the early return, so the hook
  // order stays constant (every hook must run on every render)
  const jobId = job?.id ?? null;
  const jobTasks = useMemo(
    () => (jobId ? board.tasks.filter((t) => t.j === jobId) : []),
    [board.tasks, jobId],
  );
  const jobCats = useMemo(() => [...new Set(jobTasks.map((t) => t.cat))], [jobTasks]);

  if (!job || !draft) return <div className="p-4 text-sm" style={{ color: "var(--muted)" }}>Pick a job.</div>;
  const dj = job;

  // Single chokepoint for every plan mutation. The permission guard lives here
  // so no drag-handler, checkbox or kanban shortcut can slip an edit past the
  // read-only rule — the disabled UI is cosmetics; this is the enforcement.
  const edit = (fn: (pl: Plan) => Plan) => {
    if (!canEdit) return;
    dirty.current = true;
    setDraft((pl) => (pl ? fn(pl) : pl));
  };
  const setMilestone = (mi: number, patch: Partial<PlanMilestone>) => edit((pl) => ({ ...pl, milestones: pl.milestones.map((m, i) => (i === mi ? { ...m, ...patch } : m)) }));
  const setCrewVal = (mi: number, key: keyof Crew, v: number) => edit((pl) => ({ ...pl, milestones: pl.milestones.map((m, i) => (i === mi ? { ...m, crew: { ...m.crew, [key]: v } } : m)) }));
  const togglePred = (mi: number, p: number) => edit((pl) => ({ ...pl, milestones: pl.milestones.map((m, i) => (i === mi ? { ...m, preds: m.preds.includes(p) ? m.preds.filter((x) => x !== p) : [...m.preds, p].sort((a, b) => a - b) } : m)) }));
  const toggleMsDone = (mi: number) => edit((pl) => ({ ...pl, milestones: pl.milestones.map((m, k) => (k === mi ? { ...m, done: !m.done, done_on: !m.done ? TODAY : null } : m)) }));
  const addMilestone = () => edit((pl) => (pl.milestones.length < 50 ? { ...pl, milestones: [...pl.milestones, { name: `Milestone ${pl.milestones.length + 1}`, days: 3, preds: pl.milestones.length ? [pl.milestones.length] : [], crew: zeroCrew(), shift: "D", offset: 0 }] } : pl));
  const addMilestoneNamed = (name: string, days: number) => edit((pl) => (pl.milestones.length < 50 ? { ...pl, milestones: [...pl.milestones, { name: (name || "").trim() || `Milestone ${pl.milestones.length + 1}`, days: Math.max(1, days || 1), preds: pl.milestones.length ? [pl.milestones.length] : [], crew: zeroCrew(), shift: "D", offset: 0 }] } : pl));
  const removeMilestone = (mi: number) => edit((pl) => ({ ...pl, milestones: pl.milestones.filter((_, i) => i !== mi).map((m) => ({ ...m, preds: m.preds.filter((p) => p !== mi + 1).map((p) => (p > mi + 1 ? p - 1 : p)) })) }));
  const moveMilestone = (mi: number, dir: number) => edit((pl) => {
    const j2 = mi + dir; if (j2 < 0 || j2 >= pl.milestones.length) return pl;
    const arr = [...pl.milestones]; [arr[mi], arr[j2]] = [arr[j2], arr[mi]];
    const p1 = mi + 1, p2 = j2 + 1;
    const remapped = arr.map((m) => ({ ...m, preds: m.preds.map((p) => (p === p1 ? p2 : p === p2 ? p1 : p)) }));
    return { ...pl, milestones: remapped.map((m, idx) => ({ ...m, preds: m.preds.filter((p) => p <= idx) })) };
  });
  const moveMilestoneTo = (from: number | null, to: number) => { if (from == null || from === to) return; edit((pl) => {
    const oldArr = pl.milestones; const arr = [...oldArr]; const [mv] = arr.splice(from, 1); arr.splice(to, 0, mv);
    const posMap: Record<number, number> = {}; oldArr.forEach((m, i) => { posMap[i + 1] = arr.indexOf(m) + 1; });
    const remapped = arr.map((m) => ({ ...m, preds: m.preds.map((p) => posMap[p]).filter(Boolean) }));
    return { ...pl, milestones: remapped.map((m, idx) => ({ ...m, preds: m.preds.filter((p) => p <= idx) })) };
  }); };
  const reloadDefault = () => { dirty.current = true; setDraft({ start: dj.start && dj.start >= TODAY ? dj.start : TODAY, milestones: templateMilestones(dj.fam, board.templates) }); };
  const applyTemplate = (name: string) => {
    if (!name) return;
    if (!window.confirm(`Replace this job's milestones with the "${name}" template? Any custom changes to the current plan will be lost.`)) { setApplyTplName(""); return; }
    dirty.current = true;
    setDraft((pl) => (pl ? { ...pl, milestones: templateMilestones(name, board.templates) } : pl));
    setApplyTplName("");
  };

  const savePlanNow = async () => { await api.post("/api/plan", { job_id: dj.id, start: draft.start, milestones: draft.milestones }); await reload(); };
  // ---- mark the job completed once every milestone is done ----
  // "Completed" here means the job's status is at or past Delivered in the
  // ERP's own status ladder; the button sets "D: Delivered".
  const COMPLETED_STATUSES = [
    "D: Delivered",
    "I: Installation Not Started due to Client",
    "I: Installation in progress",
    "I: Installation Completed",
    "C: Job Handed Over",
  ];
  const isCompleted = COMPLETED_STATUSES.includes(dj.stat);
  const markCompleted = async () => {
    if (!window.confirm(`Mark JOB ${jobNo(dj.id)} — ${dj.tag} as COMPLETED?\n\nAll ${sched.length} milestones are done. This sets the job status to "D: Delivered" in Genie.`)) return;
    try {
      await api.post("/api/job-field", { job_id: dj.id, field: "stat", value: "D: Delivered" });
      pushERP("Jobmaster", dj.id, "job_status", "D: Delivered (job completed)");
      await reload();
      // The warning the button exists for: Genie's status is overwritten by
      // tomorrow's file, so the ERP must be told by hand — immediately.
      window.alert(
        `✔ JOB ${jobNo(dj.id)} marked completed in Genie.\n\n` +
        `⚠ NOW UPDATE THE ERP — this change lives only here until you do.\n` +
        `Open the Jobmaster (link on this page and in the Update-to-ERP tab)\n` +
        `and set its Job Status there too. Tomorrow's morning file will\n` +
        `otherwise overwrite this back to the old status.`,
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  const saveBaseline = async () => {
    if (!sched.length) return;
    await api.post("/api/plan", { job_id: dj.id, start: draft.start, milestones: draft.milestones }); // ensure plan persisted first
    const payload = { job_id: dj.id, baseline_end: ends, milestones: sched.map((m) => ({ idx: m.idx, title: m.name, start: m.start, end: m.end })), force: false };
    try {
      const r = await api.post("/api/baseline", payload);
      pushERP("Job Plan Baseline", dj.id, "baseline_end", fmtFull(ends));
      await reload();
      alert("Baseline saved ✓ (" + r.baseline_on + ")");
    } catch (e) {
      if (e instanceof Error && /baseline_exists|409/.test(e.message)) {
        if (window.confirm("A baseline saved earlier already exists. Overwrite with today's planned timeline?")) {
          await api.post("/api/baseline", { ...payload, force: true }); await reload(); alert("Baseline overwritten ✓");
        }
      } else alert(e instanceof Error ? e.message : String(e));
    }
  };

  // ---- materials ----
  /* YET TO RECEIVE ON TOP (Pankaj, 2 Oct 2026, feature request: "In job
     plan, material yet to receive should show on top"). What is still short
     first — earliest receivable date first among those — then QC defective,
     then what has come in. */
  const matRank = (st: string | null | undefined) => (st === "Received" ? 2 : st === "QC Defective" ? 1 : 0);
  const mats = [...(board.materials[dj.id] || [])].sort((x, y) => matRank(x.status) - matRank(y.status) || String(x.due || "9999").localeCompare(String(y.due || "9999")));
  const ensureMats = async () => {
    if (!canEdit) return; // seeding the default checklist is a write
    if (mats.length || seededMat.current === dj.id) return;
    seededMat.current = dj.id;
    const recv = Math.round((MAT_ITEMS.length * (dj.kit || 0)) / 100);
    // one request instead of eight sequential round trips
    await api.post("/api/materials", {
      action: "seed",
      job_id: dj.id,
      items: MAT_ITEMS.map((item, i) => ({ item, qty: "as BOM", status: i < recv ? "Received" : "Pending" })),
    });
    await reload();
  };
  const setMatStatus = async (id: string, status: string, item: string) => { await api.post("/api/materials", { action: "status", id, status }); pushERP("Job Material", dj.id, "status", item + " → " + status); await reload(); };
  const delMat = async (id: string) => { await api.post("/api/materials", { action: "delete", id }); await reload(); };
  const addMat = async () => { if (!matForm.item.trim()) return; await api.post("/api/materials", { action: "add", job_id: dj.id, item: matForm.item.trim(), qty: matForm.qty || "as BOM", custom: true }); setMatForm({ item: "", qty: "" }); await reload(); };

  // ---- tasks for this job (memoised above the guard — see jobTasks/jobCats) ----
  const submitTask = async () => {
    if (!form.t.trim()) return;
    if (escalated(form.esc) && !form.esc_why.trim()) { alert("Say why this is being escalated — whoever it lands on needs to know without ringing you."); return; }
    await api.post("/api/tasks", { action: "create", job_id: dj.id, title: form.t.trim(), who: form.who, due: form.due, cat: form.cat, esc: form.esc, esc_why: form.esc_why }); setForm({ t: "", who: "", due: TODAY, cat: form.cat, esc: "None", esc_why: "" }); setAddingTask(null); await reload(); };
  const deleteJobTask = async (t: Task) => {
    const warn = t.kind === "erp"
      ? "\n\n⚠ From the ERP ToDo list — the next upload will bring it back unless it is closed in the ERP."
      : "";
    if (!window.confirm(`Delete "${t.t}"?${warn}\n\nThis cannot be undone.`)) return;
    try { await api.post("/api/tasks", { action: "delete", id: t.id, kind: t.kind }); await reload(); }
    catch (e) { alert(e instanceof Error ? e.message : String(e)); }
  };

  const matVal = dj.val * (1 - (dj.tpp || 0) / 100);
  const recvN = mats.filter((m) => m.status === "Received").length;

  return (
    <div className="p-4">
      {/* The job picker freezes under the frozen header. Changing job is the
          one thing you do from anywhere on this page, and it used to mean
          scrolling to the top first. --hdr-h is measured by the header itself,
          so this stays right when the nav wraps at narrower widths. */}
      <div
        className="jobplan-picker flex flex-wrap items-center gap-2 mb-3 -mx-4 px-4 py-2"
        style={{ position: "sticky", top: "var(--hdr-h, 92px)", zIndex: 24, background: "var(--paper)", borderBottom: "1px solid #E2E0DA" }}
      >
        {/* search + Project Owner filter narrow the dropdown; the dropdown stays the picker */}
        <div className="relative">
          <input
            value={planQ}
            onChange={(e) => setPlanQ(e.target.value)}
            placeholder="🔍 Search job no, tag, customer…"
            className="px-2 py-1.5 rounded border text-sm"
            style={{ borderColor: planQ ? "var(--accent)" : "#D9D6CD", minWidth: 220 }}
          />
          {planQ && <button onClick={() => setPlanQ("")} className="absolute right-2 top-1.5 font-bold" style={{ color: "var(--accent)" }} title="Clear search">✕</button>}
        </div>
        <select value={planPO} onChange={(e) => setPlanPO(e.target.value)} className="px-2 py-1.5 rounded border text-sm font-semibold" style={{ borderColor: planPO === "all" ? "#D9D6CD" : "var(--accent)", background: planPO === "all" ? "#fff" : "#FFF3E8", color: planPO === "all" ? "var(--ink)" : "var(--accent)" }} title="Only this Planning Owner's jobs in the dropdown">
          <option value="all">All planning owners</option>
          {(board.projectOwners || []).map((p) => (<option key={p.initials!} value={p.initials!}>{personLabel(p)}</option>))}
        </select>
        <select value={dj.id} onChange={(e) => setActiveId(e.target.value)} className="px-2 py-1.5 rounded border bg-white text-sm font-semibold" style={{ borderColor: "#D9D6CD", maxWidth: 420 }}>
          {/* keep the open job selectable even when the filter excludes it, so the select never goes blank */}
          {!pickerJobs.some((j) => j.id === dj.id) && !board.archived[dj.id] && (
            <option value={dj.id}>{jobNo(dj.id)} · {dj.tag} (outside filter)</option>
          )}
          {pickerJobs.map((j) => (<option key={j.id} value={j.id}>{jobNo(j.id)} · {j.tag}</option>))}
          {Object.keys(board.archived).length > 0 && (
            <optgroup label="— delivered / no longer in the export (plans archived) —">
              {Object.values(board.archived).map((j) => (<option key={j.id} value={j.id}>✓ {jobNo(j.id)} · {j.tag}</option>))}
            </optgroup>
          )}
        </select>
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          {(planQ || planPO !== "all") ? `${pickerJobs.length} of ${byTDD.length} jobs match · ` : ""}
          {Object.keys(board.plans).length} of {board.jobs.length} jobs planned{canEdit ? " · edits auto-save" : ""}
        </span>
        {!canEdit && (
          <span className="text-xs font-bold rounded px-2 py-1" style={{ background: "#F4F2EC", color: "var(--muted)", border: "1px solid #D9D6CD" }} title="Only admins, planners and planning owners can change plans">
            👁 View only — plans are edited by admins, planners &amp; planning owners
          </span>
        )}
      </div>

      {/*
        Which job you are looking at, kept on screen.

        The header card scrolls away within a screen and everything below it --
        milestones, tasks, materials -- looks the same from job to job. This
        strip appears only once the card has gone, so nothing is said twice
        while both are visible, and it sits under the frozen header using the
        height that header measures for itself.
      */}
      {/* A 1px sentinel: once THIS leaves the top, the row above is pinned.
          The row cannot detect that itself -- a sticky element never leaves the
          viewport, so watching it would never fire. */}
      <div ref={hdrCardRef} style={{ height: 1 }} />

      {/* header card — facts on the left, Genie's read on the right.
          It follows you down the page: everything below it looks the same from
          job to job, and which job you are editing should not need a scroll
          back up. Capped at 42vh so that on a narrow screen, where the three
          cards stack, it scrolls inside itself instead of eating the page. */}
      {/* The band that follows you down. One line of the things you look up
          while working: which job, who it is for, what it is worth and how far
          in, what is owed, and what the floor last said. The detail card below
          scrolls away as normal. */}
      {/* ON A PHONE, ONLY THIS IS PINNED (Dr Raghu, 23 Aug 2026). The full
          card below wraps four rows deep on a narrow screen, and pinning it
          left a third of the viewport frozen. The phone keeps one thin line —
          which job, whose it is — and everything else scrolls like content.

          FIXED, NOT STICKY, and it appears only once the sentinel says the
          card itself has scrolled away. A sticky strip here kept sliding
          UNDER the frozen header on phones whenever the measured offset ran
          a few pixels short — pinned exactly where nobody could see it. A
          fixed overlay above the header cannot be hidden by it, and while
          the real card is still on screen the strip stays away entirely, so
          nothing is ever said twice. */}
      {/* the floating first line (Dr Raghu, 29 Aug 2026): ONLY the job and
          its customer tag, every screen size — it appears the moment the big
          card scrolls away, and the milestone header keeps floating in its
          own box beneath it. */}
      {/* ONE LINE floats, nothing else (Dr Raghu, 30 Aug 2026): job number
          bold at 14 on dark blue with white text · Customer Tag · OTD · PM */}
      {hdrGone && (() => {
        const pm = (board.projectOwners || []).find((p) => p.email?.toLowerCase() === String(dj.own || "").toLowerCase());
        const pmName = pm ? (pm.name || pm.initials) : (dj.own ? String(dj.own).split("@")[0] : "—");
        return (
          <div className="flex items-baseline px-4 py-1.5"
            style={{ position: "fixed", top: "var(--hdr-h, 92px)", left: 0, right: 0, zIndex: 46, background: "var(--blue)", color: "#fff", minWidth: 0, boxShadow: "0 6px 12px -8px rgba(0,0,0,.5)", gap: 10, whiteSpace: "nowrap", overflow: "hidden" }}>
            <span className="font-bold tnum" style={{ fontSize: 14, flexShrink: 0 }}>JOB {jobNo(dj.id)}</span>
            <span style={{ color: "#8FA1B3" }}>|</span>
            <span className="truncate" style={{ fontSize: 12.5 }} title={dj.tag || ""}>
              <span style={{ color: "#8FA1B3" }}>Customer Tag: </span>{dj.tag || "—"}
            </span>
            <span style={{ color: "#8FA1B3" }}>|</span>
            <span className="tnum" style={{ fontSize: 12.5, flexShrink: 0 }}>
              <span style={{ color: "#8FA1B3" }}>OTD: </span>{fmtFull(dj.otd)}
            </span>
            <span style={{ color: "#8FA1B3" }}>|</span>
            <span style={{ fontSize: 12.5, flexShrink: 0 }}>
              <span style={{ color: "#8FA1B3" }}>PM: </span>{pmName}
            </span>
          </div>
        );
      })()}

      <JobTopRow
        job={dj}
        V={V}
        onShopUpdate={() => setShopOpen(true)}
      />

      <div className="flex gap-3 mb-3 items-stretch" style={{ flexWrap: "wrap" }}>
      <div className="bg-white rounded-lg p-3 border" style={{ borderColor: "var(--line)", borderLeft: "5px solid #E8600A", flex: "1 1 620px", minWidth: 320 }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-2xl font-bold" style={{ color: "var(--navy)" }}>JOB {jobNo(dj.id)}</span>
              <a href={erpJobLink(dj.id)} target="_blank" rel="noreferrer" className="text-xs underline" style={{ color: "var(--muted)" }}>{dj.id} ↗</a>
            </div>
            <div className="text-sm font-semibold" style={{ color: "var(--blue)" }}>{dj.tag}</div>
            <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>{dj.cust} · {dj.fam} · {V(dj.val)} · {dj.stat}</div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Chip label="TARGET DELIVERY (ERP)" value={fmtFull(dj.tdd)} color="var(--red)" />
            <Chip label="OTD DATE (ERP)" value={fmtFull(dj.otd) + (otdDelay(dj) ? ` · +${otdDelay(dj)}d late` : "")} color={otdColor(dj.otd)} />
            <div className="rounded px-2 py-1" style={{ background: isRaghu ? "#F3EEFB" : "#F4F2EC" }}>
              <div className="text-xs" style={{ color: "var(--muted)" }}>MGMT TARGET {isRaghu ? "✎" : "🔒"}</div>
              {isRaghu ? (
                <input type="date" value={dj.mgmt || ""} onChange={async (e) => { await api.post("/api/job-field", { job_id: dj.id, field: "mgmt", value: e.target.value }); pushERP("Jobmaster", dj.id, "mgmt", fmtFull(e.target.value)); await reload(); }} className="text-sm font-bold bg-transparent" style={{ color: "#7C3AED", border: "none" }} />
              ) : (<div className="text-sm font-bold" style={{ color: "#7C3AED" }}>{fmtFull(dj.mgmt)}</div>)}
            </div>
            <Chip label="PLAN END" value={fmtFull(ends)} color={ends > (dj.tdd || "9999") ? "var(--red)" : "var(--green)"} />
            <Chip label="TOTAL MAN-DAYS" value={grandTotal + " md"} color="var(--accent)" />
            <Chip label="MILESTONES DONE" value={msDone + " / " + sched.length} color={allDone ? "var(--green)" : "var(--ink)"} />
            {baseline && baselineEnd && (
              <div className="rounded px-2 py-1" style={{ background: "#EFF6EF", border: "1px dashed #0D7A3F" }}>
                <div className="text-xs" style={{ color: "var(--muted)" }}>📌 BASELINE ({fmt(savedPlan?.baseline_on || null)})</div>
                <div className="text-sm font-bold" style={{ color: "var(--green)" }}>ends {fmtFull(baselineEnd)}{(() => { const d = diffDays(baselineEnd, ends); return d ? <span style={{ color: d > 0 ? "var(--red)" : "var(--green)" }}> · {d > 0 ? "+" : ""}{d}d now</span> : null; })()}</div>
              </div>
            )}
            {baseline && baselineEnd && allDone && (
              <div className="rounded px-2 py-1" style={{ background: "#F3EEFB", border: "1px solid #7C3AED" }}>
                <div className="text-xs font-bold" style={{ color: "#7C3AED" }}>PROPOSED vs REAL</div>
                <div className="text-sm font-bold">{fmt(baselineEnd)} → {fmt(realEnd || TODAY)} {(() => { const d = diffDays(baselineEnd, realEnd || TODAY); return <span style={{ color: d > 0 ? "var(--red)" : "var(--green)" }}>({d > 0 ? "+" : ""}{d}d)</span>; })()}</div>
              </div>
            )}
            {canEdit && (
              <button onClick={saveBaseline} className="rounded px-2 py-1 text-xs font-bold self-start" style={baseline ? { background: "#F4F2EC", color: "var(--green)", border: "1px solid #0D7A3F" } : { background: "var(--green)", color: "#fff" }}>📌 {baseline ? "Re-save Baseline" : "Save as Baseline"}</button>
            )}
            {/* the finish line: only offered once every milestone is ticked */}
            {canEdit && allDone && !isCompleted && (
              <button onClick={markCompleted} className="rounded px-2 py-1 text-xs font-bold self-start" style={{ background: "var(--navy)", color: "#7BC67E", border: "1px solid #0D7A3F" }} title="All milestones are done — mark the whole job completed">
                ✔ Mark job completed
              </button>
            )}
            {isCompleted && (
              <div className="rounded px-2 py-1 self-start" style={{ background: "#E6F4EA", border: "1px solid #0D7A3F" }}>
                <div className="text-xs font-bold" style={{ color: "var(--green)" }}>✔ COMPLETED</div>
                <div style={{ fontSize: 10, color: "var(--dim)" }}>confirm in ERP so tomorrow&apos;s file agrees</div>
              </div>
            )}
          </div>
        </div>
        {dj.tdd && ends > dj.tdd && (
          <div className="mt-2 text-xs font-bold rounded px-2 py-1 inline-block" style={{ background: "var(--red)", color: "#fff" }}>⚠ Plan ends {diffDays(dj.tdd, ends)} days after Target Delivery — compress durations or add crew</div>
        )}
        {/* the way down to the plan itself (Dr Raghu, 29 Aug 2026:
            "See more — this way they can scroll") */}
        <button
          onClick={() => { setPlanView("plan"); window.setTimeout(() => document.getElementById("job-milestone-plan")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60); }}
          className="mt-2 w-full text-xs font-bold rounded py-1.5 border"
          style={{ color: "var(--blue)", borderColor: "#B9C7D4", background: "#F7FAFC" }}>
          See more ↓ · the milestone plan ({sched.length})
        </button>
      </div>

      <JobStanding job={dj} V={V} />

      <GenieHint jobId={dj.id} jobLabel={`JOB ${jobNo(dj.id)} · ${dj.tag}`} />
      </div>

      <JobManpowerStrip jobId={dj.id} canEdit={canEdit} />

      {/* plan / materials sub-tabs — the See more button above lands here */}
      <div id="job-milestone-plan" className="flex gap-1 rounded p-1 bg-white border mb-3" style={{ borderColor: "var(--line)", width: "fit-content", scrollMarginTop: "var(--hdr-h, 90px)" }}>
        {(["plan", "mat", "shop", "pics", "mp"] as const).map((k) => (
          <button key={k} onClick={() => { if (k === "mat") ensureMats(); setPlanView(k); }} className="px-3 py-1 rounded text-sm font-semibold" style={planView === k ? { background: "var(--ink)", color: "#fff" } : { color: "var(--dim)" }}>
            {k === "plan" ? "Milestone Plan" : k === "mat" ? "Material Kitting" : k === "shop" ? "Shop Updates" : k === "pics" ? "Photos" : "Manpower"}
          </button>
        ))}
      </div>

      {/* Shop Updates as a page rather than a lightbox: the same content, for
          somebody who came to READ the history rather than glance at it. */}
      {planView === "shop" && <ShopUpdatesPanel job={dj} />}

      {/* The day-wise work study as a ledger: every day a row, typed or
          carried by the 4 AM rollover, with the labour cost where the rates
          are set and the reader may see money. */}
      {planView === "mp" && <ManpowerLedger jobId={dj.id} V={V} />}

      {/* The build history in pictures, as a page. Same gallery the On Floor
          row opens — one component, so the two cannot disagree about what has
          been taken. */}
      {planView === "pics" && (
        <div className="bg-white rounded-lg border p-3 mb-4" style={{ borderColor: "var(--line)" }}>
          <div className="flex items-baseline gap-2 flex-wrap mb-2">
            <h2 className="font-bold" style={{ color: "var(--navy)" }}>Photos</h2>
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              JOB {jobNo(dj.id)} as it was built — each one keeps the completion it had on the day
            </span>
          </div>
          <PhotoBody job={dj} canEdit={canEdit} />
        </div>
      )}

      {planView === "mat" && (
        <div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
            <Chip label="KITTING %" value={(dj.kit || 0) + "%"} color="#0D9488" />
            <Chip label="MATERIAL VALUE = val × (1−T%)" value={V(matVal)} />
            <Chip label="KITTED VALUE = val × (1−T%) × Kit%" value={V((matVal * (dj.kit || 0)) / 100)} color="var(--green)" />
            <Chip label="YET TO RECEIVE" value={V(matVal * (1 - (dj.kit || 0) / 100))} color="var(--red)" />
          </div>
          <MaterialKitting
            jobId={dj.id}
            mats={mats}
            canEdit={canEdit}
            people={assignees(board).map((a) => ({ value: a.value, label: a.label }))}
            onChanged={reload}
          />
          <div className="text-xs mt-2" style={{ color: "var(--muted)", lineHeight: 1.5 }}>
            {recvN}/{mats.length} kit items received — a checklist, while the boards read the ERP&apos;s own Kitting % in
            Σ val × (1−T%) × Kit%. A line marked <b>QC Defective</b> counts as not received: it is on site and cannot be
            used, which for the job is the same position as not having it.
          </div>
        </div>
      )}

      {planView === "plan" && (
        <>
          <div className="bg-white rounded-lg border" style={{ borderColor: "var(--line)", overflow: "auto", maxHeight: "calc(100vh - 210px)" }}>
            {/* fieldset[disabled] greys every input, select, checkbox and button
                in the table at once for read-only roles; edit() is the actual
                enforcement, this is the honest UI for it */}
            <fieldset disabled={!canEdit} style={{ border: "none", margin: 0, padding: 0, opacity: canEdit ? 1 : 0.75 }}>
            <table className="w-full text-sm genie-table" style={{ minWidth: 1100 }}>
              <thead style={{ position: "sticky", top: 0, zIndex: 30 }}>
                <tr style={{ background: "var(--ink)", color: "#fff" }} className="text-xs">
                  <th className="px-2 py-2 text-center" title="Tick when done on the floor">✓</th>
                  <th className="px-2 py-2 text-left">#</th>
                  <th className="px-2 py-2 text-left" style={{ minWidth: 200 }}>{canEdit ? "Milestone (editable)" : "Milestone"}</th>
                  <th className="px-2 py-2">Pred(s)</th>
                  <th className="px-2 py-2">Succ</th>
                  <th className="px-2 py-2">Start</th>
                  <th className="px-2 py-2">Days</th>
                  <th className="px-2 py-2">End</th>
                  <th className="px-2 py-2">Shift</th>
                  {TRADES.map((t) => (<th key={t.key} className="px-1 py-2" title={t.label + " per day"}><span style={{ color: t.color, filter: "brightness(1.7)" }}>{t.tiny}</span></th>))}
                  <th className="px-2 py-2">MD</th>
                  <th className="px-1 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {sched.map((m, i) => (
                  <tr key={i} className="border-t" onDragOver={(e) => e.preventDefault()} onDrop={() => { moveMilestoneTo(dragMi, i); setDragMi(null); }} style={{ borderColor: "var(--line-soft)", background: dragMi === i ? "#FFF3E8" : i % 2 ? "#FAF9F5" : "#fff" }}>
                    <td className="px-2 py-1 text-center"><input type="checkbox" checked={!!m.done} onChange={() => { toggleMsDone(i); pushERP("Job Plan", dj.id, "milestone_" + m.idx + "_done", !m.done ? "completed " + fmtFull(TODAY) : "re-opened"); }} title={m.done ? "Completed " + fmtFull(m.done_on || "") : "Mark milestone complete"} style={{ accentColor: "var(--green)", width: 15, height: 15, cursor: "pointer" }} /></td>
                    <td className="px-2 py-1 font-bold whitespace-nowrap" style={{ color: "var(--accent)", textDecoration: m.done ? "line-through" : "none", opacity: m.done ? 0.6 : 1 }}><span draggable onDragStart={() => setDragMi(i)} title="Drag to reorder" style={{ cursor: "grab", color: "#B8B5AC" }}>⠿ </span>{m.idx}</td>
                    <td className="px-2 py-1">
                      <div className="flex items-center gap-1">
                        <input value={m.name} onChange={(e) => setMilestone(i, { name: e.target.value })} className="flex-1 px-1 py-0.5 rounded border bg-transparent" style={{ borderColor: "transparent" }} onFocus={(e) => (e.target.style.borderColor = "var(--accent)")} onBlur={(e) => (e.target.style.borderColor = "transparent")} />
                        <MilestoneSpanner m={m} job={dj} preds={sched} succ={successors[m.idx] || []} />
                      </div>
                    </td>
                    <td className="px-1 py-1 text-center">
                      <div className="flex flex-wrap gap-0.5 justify-center items-center" style={{ maxWidth: 92 }}>
                        {(m.preds || []).map((p) => (<button key={p} onClick={() => togglePred(i, p)} title={`Remove predecessor ${p}`} className="text-xs rounded px-1 font-bold" style={{ background: "#DCE8F5", color: "var(--blue)" }}>{p}×</button>))}
                        {i > 0 && (
                          <select value="" onChange={(e) => { const v = parseInt(e.target.value, 10); if (v) togglePred(i, v); }} className="rounded border bg-white text-xs" style={{ borderColor: "var(--line)", width: 30 }} title="Add predecessor">
                            <option value="">+</option>
                            {sched.slice(0, i).filter((p) => !(m.preds || []).includes(p.idx)).map((p) => (<option key={p.idx} value={p.idx}>{p.idx}</option>))}
                          </select>
                        )}
                      </div>
                    </td>
                    <td className="px-1 py-1 text-center text-xs" style={{ color: "var(--muted)" }}>{(successors[m.idx] || []).join(",") || "—"}</td>
                    <td className="px-1 py-1 text-center whitespace-nowrap tnum">{(m.preds || []).length > 0 ? (<span title="Auto: latest predecessor end + 1">{fmt(m.start)}</span>) : (<input type="date" value={m.start} onChange={(e) => setMilestone(i, { offset: diffDays(draft.start, e.target.value) })} className="text-xs border rounded px-1 bg-white" style={{ borderColor: "var(--line)" }} />)}</td>
                    <td className="px-1 py-1 text-center"><input type="number" min={1} value={m.days} onChange={(e) => setMilestone(i, { days: Math.max(1, parseInt(e.target.value || "1", 10)) })} className="w-12 text-center rounded border py-0.5 tnum" style={{ borderColor: "var(--line)" }} /></td>
                    <td className="px-1 py-1 text-center font-semibold whitespace-nowrap tnum" style={{ color: "var(--blue)" }}>{fmt(m.end)}</td>
                    <td className="px-1 py-1 text-center"><select value={m.shift || "D"} onChange={(e) => setMilestone(i, { shift: e.target.value })} className="rounded border bg-white text-xs px-0.5 py-0.5" style={{ borderColor: "var(--line)" }} title="Which shift works this milestone"><option value="D">☀ Day</option><option value="N">☾ Night</option><option value="DN">☀+☾</option></select></td>
                    {TRADES.map((t) => (<td key={t.key} className="px-0.5 py-1 text-center"><CrewCell value={m.crew[t.key] || 0} color={t.color} onChange={(v) => setCrewVal(i, t.key as keyof Crew, v)} /></td>))}
                    <td className="px-2 py-1 text-center font-bold tnum">{manDays(m) || "—"}</td>
                    <td className="px-1 py-1 text-center whitespace-nowrap">
                      <button onClick={() => moveMilestone(i, -1)} title="Move up" className="text-xs px-0.5" style={{ color: i === 0 ? "#D5D2C9" : "var(--blue)" }}>▲</button>
                      <button onClick={() => moveMilestone(i, 1)} title="Move down" className="text-xs px-0.5" style={{ color: i === sched.length - 1 ? "#D5D2C9" : "var(--blue)" }}>▼</button>
                      <button onClick={() => removeMilestone(i)} className="text-xs px-0.5" style={{ color: "var(--red)" }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: "#F2EFE6", borderTop: "2px solid #22303C" }} className="font-bold text-sm">
                  <td colSpan={8} className="px-2 py-2 text-right">Total man-days by trade →</td>
                  {TRADES.map((t) => (<td key={t.key} className="text-center tnum" style={{ color: t.color }}>{tradeTotals[t.key]}</td>))}
                  <td className="text-center" style={{ color: "var(--accent)" }}>{grandTotal}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
            </fieldset>
          </div>
          <div className="flex items-center justify-between mt-2 flex-wrap gap-2">
            {canEdit ? (
              <div className="flex gap-2">
                <button onClick={addMilestone} disabled={draft.milestones.length >= 50} className="px-3 py-1.5 rounded font-semibold text-sm" style={{ background: draft.milestones.length >= 50 ? "#D9D6CD" : "var(--ink)", color: "#fff" }}>+ Add milestone ({draft.milestones.length}/50)</button>
                <button onClick={reloadDefault} className="px-3 py-1.5 rounded font-semibold text-sm border" style={{ borderColor: "var(--ink)", color: "var(--ink)" }}>↺ Reload {dj.fam} default</button>
                <select
                  value={applyTplName}
                  onChange={(e) => { setApplyTplName(e.target.value); applyTemplate(e.target.value); }}
                  className="px-2 py-1.5 rounded font-semibold text-sm border bg-white"
                  style={{ borderColor: "var(--ink)", color: "var(--ink)" }}
                  title="Replace this job's milestones with a saved template, regardless of its product family"
                >
                  <option value="">⇄ Apply template…</option>
                  {templateNames.map((t) => (<option key={t} value={t}>{t}</option>))}
                </select>
                <button onClick={savePlanNow} className="px-3 py-1.5 rounded font-semibold text-sm" style={{ background: "var(--accent)", color: "#fff" }}>💾 Save now</button>
              </div>
            ) : (
              <div className="text-xs font-semibold" style={{ color: "var(--muted)" }}>👁 View only — ask an admin, planner or planning owner to change this plan</div>
            )}
            <div className="text-xs" style={{ color: "var(--muted)" }}>Crew = men per day · MD = crew × duration</div>
          </div>

          {/* mini gantt */}
          <div className="bg-white rounded-lg border mt-3 p-3 overflow-x-auto" style={{ borderColor: "var(--line)" }}>
            <div className="text-xs font-bold mb-1" style={{ color: "var(--muted)" }}>JOB GANTT <span className="font-normal">· week gridlines · red line = Target Delivery</span></div>
            {dj.tdd && draft.start > dj.tdd && (
              <div className="text-xs font-bold rounded px-2 py-1 mb-2 inline-block" style={{ background: "var(--red)", color: "#fff" }}>
                ⚠ Target Delivery {fmtFull(dj.tdd)} is before this plan starts ({fmtFull(draft.start)}) — the red line is pinned to the left edge
              </div>
            )}
            {(() => {
              const gEnd = dj.tdd && dj.tdd > ends ? dj.tdd : ends;
              const total = diffDays(draft.start, gEnd) + 1;
              // Raw position can fall outside 0–100 when the Target Delivery Date
              // is before the plan start (an already-late job). Clamp it to the
              // track, and flag it, so the marker can never escape into the labels.
              const tddRaw = dj.tdd ? (diffDays(draft.start, dj.tdd) / total) * 100 : null;
              const tddPos = tddRaw === null ? null : Math.max(0, Math.min(99.6, tddRaw));
              const tddBefore = tddRaw !== null && tddRaw < 0;
              const ticks: { pct: number; wk: number }[] = [];
              for (let d = 0; d < total; d++) { const iso = addDays(draft.start, d); if (parseISO(iso).getUTCDay() === 1) ticks.push({ pct: (d / total) * 100, wk: isoWeek(iso) }); }
              return (
                <div style={{ width: Math.max(620, total * 5), minWidth: 620 }}>
                  <div className="flex items-center gap-2 mb-1"><div style={{ width: 175 }} /><div className="flex-1 relative" style={{ height: 14 }}>{ticks.map((t, k) => (<span key={k} className="absolute text-xs font-bold" style={{ left: t.pct + "%", color: "#B8B5AC", fontSize: 9, transform: "translateX(2px)" }}>W{t.wk}</span>))}</div></div>
                  {sched.map((m, i) => {
                    const l = (diffDays(draft.start, m.start) / total) * 100;
                    const w = (Math.max(1, m.days) / total) * 100;
                    return (
                      <div key={i} className="flex items-center gap-2 mb-1">
                        <div className="text-xs truncate" style={{ width: 175, color: "var(--dim)" }}>{m.idx}. {m.name}</div>
                        {/* overflow:hidden keeps every marker inside its own track */}
                        <div className="flex-1 h-4 rounded relative" style={{ background: "#F4F2EC", overflow: "hidden" }}>
                          {ticks.map((t, k) => (<div key={k} className="absolute h-4" style={{ left: t.pct + "%", width: 1, background: "#DDDACF" }} />))}
                          <div className="absolute h-4 rounded" title={`${fmt(m.start)} → ${fmt(m.end)}`} style={{ left: Math.max(0, l) + "%", width: Math.max(w, 0.8) + "%", background: manDays(m) ? "var(--blue)" : "#A8B4C0" }} />
                          {tddPos !== null && (
                            <div
                              className="absolute h-4"
                              title={tddBefore ? `Target Delivery ${fmtFull(dj.tdd)} — before the plan even starts` : `Target Delivery ${fmtFull(dj.tdd)}`}
                              style={{ left: tddPos + "%", width: 2, background: "var(--red)", opacity: tddBefore ? 0.55 : 1 }}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* pending tasks & milestones kanban */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <h2 className="font-bold" style={{ color: "var(--navy)" }}>Pending Tasks &amp; Milestones — JOB {jobNo(dj.id)} <span className="font-normal text-xs" style={{ color: "var(--muted)" }}>ERP ToDo + open milestones · headed by Category</span></h2>
              <button onClick={() => { setAddingTask(dj.id); setForm((f) => ({ ...f, cat: jobCats[0] || "Production" })); }} className="px-3 py-1 rounded text-sm font-bold" style={{ background: "var(--accent)", color: "#fff" }}>+ Task</button>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 items-start">
              {(() => {
                const open = sched.filter((m) => !m.done);
                const doneMs = sched.filter((m) => m.done);
                const card = (m: typeof sched[number]) => (
                  <TaskCard key={"ms" + m.idx} onOpen={() => {}} t={{ id: "ms" + m.idx, kind: "manual", done: !!m.done, j: dj.id, t: `M${m.idx} · ${m.name}`, d: `${fmt(m.start)} → ${fmt(m.end)} · ${manDays(m)} man-days`, who: dj.own || "plan", due: m.end, cat: "Milestone", esc: "None", by: null, comments: 0 }} />
                );
                return (
                  <div className="rounded-lg p-2" style={{ background: "#DDE6EE", minWidth: 230, maxWidth: 260, border: "1px solid #B9C7D4" }}>
                    <div className="text-xs font-bold px-1 pb-1.5 flex justify-between" style={{ color: "var(--blue)" }}><span>⚑ MILESTONES</span><span style={{ color: "var(--muted)" }}>{open.length} pending · {doneMs.length} done</span></div>
                    {open.map((m) => card(m))}
                    {open.length === 0 && sched.length > 0 && (<div className="text-xs text-center rounded py-1 my-1 font-bold" style={{ background: "#E6F4EA", color: "var(--green)" }}>All milestones checked off ✓</div>)}
                    {doneMs.length > 0 && (<button onClick={() => setShowPastMs(!showPastMs)} className="w-full text-xs font-bold rounded border border-dashed py-1 my-1" style={{ borderColor: "#8FA1B3", color: "var(--green)" }}>{showPastMs ? "▴ hide" : "▾ show"} {doneMs.length} completed ✓</button>)}
                    {showPastMs && doneMs.map((m) => card(m))}
                    {canEdit && msForm.open && (
                      <div className="rounded border p-2 mt-1 bg-white" style={{ borderColor: "var(--blue)" }}>
                        <input autoFocus placeholder="New milestone…" value={msForm.name} onChange={(e) => setMsForm({ ...msForm, name: e.target.value })} className="w-full text-xs border rounded px-1 py-1 mb-1" style={{ borderColor: "var(--line)" }} />
                        <div className="flex gap-1 items-center">
                          <input type="number" min={1} value={msForm.days} onChange={(e) => setMsForm({ ...msForm, days: parseInt(e.target.value || "1", 10) })} className="w-14 text-xs border rounded px-1 py-1" style={{ borderColor: "var(--line)" }} />
                          <span className="text-xs" style={{ color: "var(--muted)" }}>days</span>
                          <button onClick={() => { addMilestoneNamed(msForm.name, msForm.days); setMsForm({ open: false, name: "", days: 3 }); }} className="text-xs font-bold rounded px-2 py-1" style={{ background: "var(--blue)", color: "#fff" }}>Add</button>
                          <button onClick={() => setMsForm({ open: false, name: "", days: 3 })} className="text-xs rounded px-1" style={{ color: "var(--muted)" }}>✕</button>
                        </div>
                      </div>
                    )}
                    {canEdit && !msForm.open && (<button onClick={() => setMsForm({ open: true, name: "", days: 3 })} className="w-full text-xs font-bold rounded py-1 mt-1" style={{ background: "var(--blue)", color: "#fff" }}>+ Milestone</button>)}
                  </div>
                );
              })()}
              {(jobCats.length ? jobCats : addingTask === dj.id ? [form.cat] : []).map((cat) => (
                <div key={cat} className="rounded-lg p-2" style={{ background: "#E9E6DD", minWidth: 230, maxWidth: 260 }}>
                  <div className="text-xs font-bold px-1 pb-1.5 flex justify-between" style={{ color: "var(--navy)" }}><span>{cat.toUpperCase()}</span><span style={{ color: "var(--muted)" }}>{jobTasks.filter((t) => t.cat === cat && !t.done).length} open</span></div>
                  {jobTasks.filter((t) => t.cat === cat).sort((a, b) => ((a.due || "9999") < (b.due || "9999") ? -1 : 1)).map((t) => (<TaskCard key={t.id} onOpen={setLightbox} onDelete={isAdminHere ? deleteJobTask : undefined} t={t} />))}
                  {addingTask === dj.id && form.cat === cat && (<AddTaskForm owners={assignees(board)} form={form} setForm={setForm} onSubmit={submitTask} onCancel={() => setAddingTask(null)} />)}
                </div>
              ))}
              {addingTask === dj.id && jobCats.length > 0 && !jobCats.includes(form.cat) && (
                <div className="rounded-lg p-2" style={{ background: "#E9E6DD", minWidth: 230 }}>
                  <div className="text-xs font-bold px-1 pb-1.5">{form.cat.toUpperCase()}</div>
                  <AddTaskForm owners={assignees(board)} form={form} setForm={setForm} onSubmit={submitTask} onCancel={() => setAddingTask(null)} />
                </div>
              )}
            </div>
            {jobTasks.length === 0 && (<div className="text-xs mt-1" style={{ color: "var(--muted)" }}>No ERP ToDos linked yet — upload the ToDo Dashboard, or add a manual task with + Task.</div>)}
          </div>
        </>
      )}

      {lightbox && <TaskModal canDelete={isAdminHere} task={lightbox} jobRef={taskJobRef(board, lightbox)} onOpenJob={setActiveId} owners={assignees(board)} onClose={() => setLightbox(null)} onToggle={async (prevention) => { await api.post("/api/tasks", { action: "toggle", id: lightbox.id, kind: lightbox.kind, done: !lightbox.done, prevention }); setLightbox(null); await reload(); }} reload={reload} />}

      {shopOpen && <ShopUpdates job={dj} onClose={() => setShopOpen(false)} />}

      {/* management date breach popup */}
      {dj.mgmt && ends > dj.mgmt && !warned.has(dj.id) && (
        <div className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(13,22,31,0.75)", zIndex: 60 }}>
          <div className="bg-white rounded-lg p-5 w-full" style={{ maxWidth: 460, borderTop: "5px solid #B3261E" }}>
            <div className="text-xs font-bold tracking-widest" style={{ color: "var(--red)" }}>⚠ MANAGEMENT TARGET BREACH</div>
            <div className="font-bold text-lg mt-1" style={{ color: "var(--navy)" }}>JOB {jobNo(dj.id)} · {dj.tag}</div>
            <div className="text-sm mt-2" style={{ color: "var(--dim)" }}>The current milestone plan ends <b style={{ color: "var(--red)" }}>{fmtFull(ends)}</b> — that is <b>{diffDays(dj.mgmt, ends)} days beyond</b> the Management target of <b style={{ color: "#7C3AED" }}>{fmtFull(dj.mgmt)}</b>.</div>
            <div className="text-xs mt-2" style={{ color: "var(--muted)" }}>Compress durations, add crew, run parallel milestones — or escalate to raghu@nandan.co.in for a revised target.</div>
            <div className="flex gap-2 mt-4"><button onClick={() => setWarned((s) => new Set([...s, dj.id]))} className="flex-1 py-2 rounded font-bold text-sm" style={{ background: "var(--ink)", color: "#fff" }}>Acknowledge — I will re-plan</button></div>
          </div>
        </div>
      )}
    </div>
  );
}