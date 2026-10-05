"use client";
/**
 * MY TASKS — the tasklist (Dr Raghu, 5 Oct 2026: "in this have a tasklist -
 * My Tasks. Show all the open tasks there by default. Show options for By
 * Project, By Goals. In this make provision to add by lightbox tasks. By
 * default assigned to user and date today +3, can change. Keep button
 * below save and add another one; in this keep the previous options
 * selected as default. Next day make the default user as the logged in one.")
 *
 * A plain list, not a board: every open task with my name on it, due date
 * first, late ones red. Flat, by the project it serves, or by the goal it
 * serves. The lightbox remembers what was picked for the rest of the day;
 * tomorrow the person is me again and the date is three days out.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { fmt, jobNo, dueStyle, toISO, TASK_CATS, ESC_LEVELS, escalated } from "@/lib/schedule";
import { assignees, myHandles, taskJobRef, TODAY, type Board, type Job, type Task } from "./shared";
import type { TodayItem } from "./MyWeek";

type Me = { email: string; initials: string | null; displayName: string | null; erpOwner: string | null; role: string };
type GoalPick = { id: string; title: string; kind: string; scope: string; root: string };
type Grouping = "flat" | "project" | "goal";

const DEFAULTS_KEY = "genie.mytasks.defaults";
const GROUP_KEY = "genie.mytasks.group";

/** Three days out, as a date input wants it. */
export const plusDays = (iso: string, n: number) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return toISO(d); };

interface Defaults { date: string; who: string; due: string; job_id: string; project: string; goal_id: string; cat: string; esc: string }

/** What the lightbox opens with: today's remembered picks, or a fresh start with me on it. */
function loadDefaults(meHandle: string): Defaults {
  const fresh: Defaults = { date: TODAY, who: meHandle, due: plusDays(TODAY, 3), job_id: "", project: "", goal_id: "", cat: TASK_CATS[0] as string, esc: "None" };
  try {
    const raw = localStorage.getItem(DEFAULTS_KEY);
    if (!raw) return fresh;
    const d = JSON.parse(raw) as Partial<Defaults>;
    /* a new day: the person is me again, the picks start clean; the category is a habit and stays */
    if (d.date !== TODAY) return { ...fresh, cat: d.cat || fresh.cat };
    return { ...fresh, ...d, who: d.who || meHandle, due: d.due && d.due >= TODAY ? d.due : fresh.due };
  } catch { return fresh; }
}
function saveDefaults(d: Omit<Defaults, "date">) {
  try { localStorage.setItem(DEFAULTS_KEY, JSON.stringify({ ...d, date: TODAY })); } catch { /* private window */ }
}

export function MyTasks({ board, me, reload, onOpen, onOpenTask, onDelete }: {
  board: Board; me: Me; reload: () => Promise<Board | null>;
  onOpen: (jobId: string) => void; onOpenTask: (t: Task) => void; onDelete?: (t: Task) => void;
}) {
  const [group, setGroup] = useState<Grouping>(() => { try { return (localStorage.getItem(GROUP_KEY) as Grouping) || "flat"; } catch { return "flat"; } });
  const [showDone, setShowDone] = useState(false);
  const [adding, setAdding] = useState(false);
  const [goals, setGoals] = useState<GoalPick[] | null>(null);
  const [goalWork, setGoalWork] = useState<TodayItem[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  useEffect(() => { try { localStorage.setItem(GROUP_KEY, group); } catch { /* fine */ } }, [group]);
  useEffect(() => {
    if (goals !== null) return;
    api.get("/api/tasks/goals").then((r) => setGoals(r.goals || [])).catch(() => setGoals([]));
  }, [goals]);
  useEffect(() => {
    if (group !== "goal" || goalWork !== null) return;
    api.get("/api/today").then((r) => setGoalWork((r.items || []).filter((i: TodayItem) => i.source === "goal"))).catch(() => setGoalWork([]));
  }, [group, goalWork]);

  const mine = useMemo(() => myHandles(me), [me]);
  const meHandle = me.initials || me.email.split("@")[0];
  const jobOf = useCallback((t: Task): Job | null => (t.j ? board.jobs.find((j) => j.id === t.j) || board.archived[t.j] || null : null), [board]);
  const goalTitle = useMemo(() => new Map((goals || []).map((g) => [g.id, g.root ? `${g.root} › ${g.title}` : g.title])), [goals]);

  const rows = useMemo(() => {
    const out = board.tasks.filter((t) => mine.has(String(t.who || "").toLowerCase()) && (showDone || !t.done));
    out.sort((a, b) => Number(a.done) - Number(b.done) || ((a.due || "9999") < (b.due || "9999") ? -1 : (a.due || "9999") > (b.due || "9999") ? 1 : 0));
    return out;
  }, [board.tasks, mine, showDone]);
  const open = rows.filter((t) => !t.done);
  const late = open.filter((t) => t.due && t.due < TODAY).length;
  const thisWeek = open.filter((t) => t.due && t.due >= TODAY && t.due <= plusDays(TODAY, 7)).length;

  const keyOf = (t: Task): string => {
    if (group === "project") return (t.project || "").trim() || (jobOf(t)?.proj || "").trim() || "No project";
    if (group === "goal") return t.goal_id ? goalTitle.get(t.goal_id) || "A goal no longer listed" : "Not on a goal";
    return "";
  };
  const groups = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of rows) { const k = keyOf(t); (m.get(k) ?? m.set(k, []).get(k)!).push(t); }
    const keys = [...m.keys()].sort((a, b) => (/^(No project|Not on a goal|A goal)/.test(a) ? 1 : /^(No project|Not on a goal|A goal)/.test(b) ? -1 : a.localeCompare(b)));
    return keys.map((k) => [k, m.get(k)!] as const);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, group, goalTitle, board.jobs]);

  const toggle = async (t: Task) => {
    setBusyId(t.id);
    try { await api.post("/api/tasks", { action: "toggle", id: t.id, kind: t.kind, done: !t.done }); await reload(); }
    catch (e) { alert(e instanceof Error ? e.message : String(e)); }
    finally { setBusyId(null); }
  };

  const Row = ({ t }: { t: Task }) => {
    const j = jobOf(t);
    const ref = taskJobRef(board, t);
    const lateRow = !t.done && !!t.due && t.due < TODAY;
    return (
      <div className="flex items-start gap-2 px-2 py-1.5 border-b group" style={{ borderColor: "var(--line-soft)", background: t.done ? "#F7F6F2" : "#fff" }}>
        <input type="checkbox" checked={t.done} disabled={busyId === t.id} onChange={() => toggle(t)} className="mt-1 cursor-pointer" title={t.done ? "Reopen" : "Done"} />
        <button onClick={() => onOpenTask(t)} className="flex-1 text-left text-sm" style={{ textDecoration: t.done ? "line-through" : "none", color: t.done ? "var(--muted)" : "var(--ink)" }} title="Open the task">
          {t.t}
          {t.esc && t.esc !== "None" && <span className="ml-2 font-bold rounded px-1 text-xs" style={{ background: "var(--red)", color: "#fff", fontSize: 10 }}>⚠ {t.esc}</span>}
          {t.d && <div className="text-xs truncate" style={{ color: "var(--muted)", maxWidth: 640 }}>{t.d}</div>}
        </button>
        <div className="hidden md:block text-xs truncate" style={{ width: 190, color: "var(--dim)" }} title={ref ? ref.label : "No job"}>
          {ref ? <button onClick={() => onOpen(ref.id)} className="underline decoration-dotted text-left truncate" style={{ color: "var(--blue)", maxWidth: 190 }}>{j ? `${jobNo(j.id)} · ${j.tag}` : ref.label}</button> : <span style={{ color: "var(--muted)" }}>—</span>}
        </div>
        {group !== "project" && <div className="hidden lg:block text-xs truncate" style={{ width: 120, color: "var(--dim)" }}>{(t.project || "").trim() || (j?.proj || "").trim() || ""}</div>}
        <div className="hidden sm:block text-xs" style={{ width: 86, color: "var(--dim)" }}>{(t.cat || "").toLowerCase()}</div>
        <div className="text-xs tnum font-semibold rounded px-1.5 py-0.5" style={{ width: 64, textAlign: "center", ...(t.done ? { color: "var(--muted)" } : dueStyle(t.due)), ...(lateRow ? { fontWeight: 800 } : {}) }} title={t.original_due && t.original_due !== t.due ? `First promised ${fmt(t.original_due)} · moved ${t.push_count || 0}×` : undefined}>
          {fmt(t.due) || "—"}
        </div>
        {onDelete && <button onClick={() => onDelete(t)} className="text-xs font-bold opacity-0 group-hover:opacity-100" style={{ color: "var(--red)" }} title="Delete">✕</button>}
      </div>
    );
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex gap-1 rounded p-1 bg-white border" style={{ borderColor: "#D9D6CD" }}>
          {([["flat", "All open"], ["project", "By Project"], ["goal", "By Goals"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setGroup(k)} className="px-3 py-1 rounded text-sm font-semibold" style={group === k ? { background: "var(--ink)", color: "#fff" } : { color: "var(--dim)" }}>{l}</button>
          ))}
        </div>
        <label className="text-xs flex items-center gap-1 px-2 py-1.5 rounded border bg-white cursor-pointer" style={{ borderColor: "#D9D6CD", color: "var(--dim)" }}>
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> show done too
        </label>
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          <b style={{ color: "var(--ink)" }}>{open.length}</b> open{late ? <> · <b style={{ color: "var(--red)" }}>{late} late</b></> : ""}{thisWeek ? ` · ${thisWeek} due this week` : ""}
        </span>
        <div className="flex-1" />
        <button onClick={() => setAdding(true)} className="px-3 py-1.5 rounded text-sm font-bold" style={{ background: "var(--accent)", color: "#fff" }} title="A task for you, due in three days — change anything">+ Add task</button>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-lg border p-6 text-center text-sm" style={{ borderColor: "var(--line)", color: "var(--muted)" }}>
          Nothing open with your name on it{showDone ? "" : " — tick “show done too” for what you have closed"}. Add one with the button above.
        </div>
      ) : (
        <div className="bg-white rounded-lg border overflow-hidden" style={{ borderColor: "var(--line)" }}>
          <div className="hidden sm:flex items-center gap-2 px-2 py-1 text-xs font-bold" style={{ background: "var(--navy)", color: "#fff" }}>
            <span style={{ width: 13 }} /><span className="flex-1">Task</span><span className="hidden md:block" style={{ width: 190 }}>Job</span>{group !== "project" && <span className="hidden lg:block" style={{ width: 120 }}>Project</span>}<span style={{ width: 86 }}>Dept</span><span style={{ width: 64, textAlign: "center" }}>Due</span>{onDelete && <span style={{ width: 14 }} />}
          </div>
          {groups.map(([k, ts]) => (
            <div key={k || "all"}>
              {group !== "flat" && (
                <div className="flex items-center gap-2 px-2 py-1 text-xs font-bold" style={{ background: group === "goal" ? "#F3EEFB" : "#EEF2F6", color: group === "goal" ? "#5B21B6" : "var(--navy)" }}>
                  <span>{k}</span><span style={{ opacity: .6 }}>· {ts.filter((t) => !t.done).length} open</span>
                </div>
              )}
              {ts.map((t) => <Row key={t.id} t={t} />)}
            </div>
          ))}
          {group === "goal" && goalWork && goalWork.length > 0 && (
            <div>
              <div className="px-2 py-1 text-xs font-bold" style={{ background: "#F3EEFB", color: "#5B21B6" }}>Goal work with your name on it <span style={{ opacity: .6 }}>· from the Goals workspace, not tasks</span></div>
              {goalWork.map((g) => (
                <div key={g.id} className="flex items-center gap-2 px-2 py-1.5 border-b text-sm" style={{ borderColor: "var(--line-soft)" }}>
                  <span style={{ width: 13 }} /><span className="flex-1">{g.title}<span className="text-xs ml-2" style={{ color: "var(--muted)" }}>{g.goalName || ""}</span></span>
                  <span className="text-xs" style={{ width: 86, color: "var(--dim)" }}>{g.cat}</span>
                  <span className="text-xs tnum font-semibold rounded px-1.5 py-0.5" style={{ width: 64, textAlign: "center", ...dueStyle(g.due) }}>{fmt(g.due) || "—"}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {adding && <MyTaskBox board={board} meHandle={meHandle} goals={goals || []} onClose={() => setAdding(false)} reload={reload} />}
    </div>
  );
}

/** The lightbox: me, three days out, and whatever was picked last — change anything. */
function MyTaskBox({ board, meHandle, goals, onClose, reload }: { board: Board; meHandle: string; goals: GoalPick[]; onClose: () => void; reload: () => Promise<Board | null> }) {
  const d0 = useMemo(() => loadDefaults(meHandle), [meHandle]);
  const [f, setF] = useState({ t: "", d: "", who: d0.who, due: d0.due, job_id: d0.job_id, project: d0.project, goal_id: d0.goal_id, cat: d0.cat, esc: d0.esc, esc_why: "" });
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [count, setCount] = useState(0);
  const owners = useMemo(() => assignees(board), [board]);
  const projects = useMemo(() => [...new Set(board.jobs.map((j) => (j.proj || "").trim()).filter(Boolean))].sort(), [board.jobs]);
  const needle = q.trim().toLowerCase();
  const jobList = board.jobs.filter((j) => !needle || j.id.includes(needle) || j.tag.toLowerCase().includes(needle) || j.cust.toLowerCase().includes(needle)).slice(0, 300);
  const pickJob = (id: string) => { const j = board.jobs.find((x) => x.id === id); setF({ ...f, job_id: id, project: j && (j.proj || "").trim() ? (j.proj || "").trim() : f.project }); };

  const save = async (again: boolean) => {
    if (!f.t.trim()) { setMsg("What is the task?"); return; }
    if (escalated(f.esc) && !f.esc_why.trim()) { setMsg("Say why it is escalated."); return; }
    setBusy(true); setMsg("");
    try {
      await api.post("/api/tasks", { action: "create", job_id: f.job_id || null, title: f.t.trim(), detail: f.d.trim(), who: f.who || meHandle, due: f.due, cat: f.cat, esc: f.esc, esc_why: f.esc_why, goal_id: f.goal_id || null, project: f.project || null, related_to: f.goal_id ? "goal" : "job" });
      saveDefaults({ who: f.who || meHandle, due: f.due, job_id: f.job_id, project: f.project, goal_id: f.goal_id, cat: f.cat, esc: f.esc });
      await reload();
      if (again) { setCount((n) => n + 1); setF((x) => ({ ...x, t: "", d: "" })); setMsg(`Added ✓ (${count + 1}) — next one, everything else as before`); }
      else onClose();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const label = (s: string) => <div className="text-xs font-bold mb-0.5 mt-2" style={{ color: "var(--muted)" }}>{s}</div>;
  const field = "w-full text-sm border rounded px-2 py-1.5 bg-white";
  const bc = { borderColor: "var(--line)" } as const;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(22,35,47,0.55)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg" style={{ width: "min(600px, 100%)", maxHeight: "90vh", overflowY: "auto" }}>
        <div className="px-4 py-3 flex items-center gap-3" style={{ background: "var(--navy)" }}>
          <div className="font-bold text-white" style={{ fontSize: 15 }}>New task</div>
          <div className="text-xs" style={{ color: "#8FA1B3" }}>yours by default, due in three days — change anything</div>
          <div className="flex-1" />
          <button onClick={onClose} className="font-bold" style={{ color: "#8FA1B3", fontSize: 20, lineHeight: 1 }}>✕</button>
        </div>
        <div className="px-4 pb-4 pt-1">
          {label("TASK")}
          <textarea autoFocus rows={2} value={f.t} onChange={(e) => setF({ ...f, t: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save(false); }} placeholder="What has to happen?" className={field} style={{ ...bc, resize: "vertical" }} />
          <input value={f.d} onChange={(e) => setF({ ...f, d: e.target.value })} placeholder="Detail (optional)" className={field + " mt-1 text-xs"} style={bc} />
          <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div>{label("WHO")}
              <input list="mytask-who" value={f.who} onChange={(e) => setF({ ...f, who: e.target.value })} className={field} style={bc} placeholder="type or pick" />
              <datalist id="mytask-who">{owners.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</datalist>
            </div>
            <div>{label("DUE")}<input type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} className={field} style={bc} /></div>
          </div>
          {label("JOB (optional)")}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 filter by job no, tag or customer" className={field + " text-xs mb-1"} style={bc} />
          <select value={f.job_id} onChange={(e) => pickJob(e.target.value)} className={field} style={bc}>
            <option value="">— no job —</option>
            {f.job_id && !jobList.some((j) => j.id === f.job_id) && <option value={f.job_id}>{jobNo(f.job_id)}</option>}
            {jobList.map((j) => <option key={j.id} value={j.id}>{jobNo(j.id)} · {j.tag} · {j.cust}</option>)}
          </select>
          <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div>{label("PROJECT")}
              <select value={f.project} onChange={(e) => setF({ ...f, project: e.target.value })} className={field} style={bc}>
                <option value="">— none —</option>
                {f.project && !projects.includes(f.project) && <option value={f.project}>{f.project}</option>}
                {projects.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>{label("GOAL")}
              <select value={f.goal_id} onChange={(e) => setF({ ...f, goal_id: e.target.value })} className={field} style={bc}>
                <option value="">— none —</option>
                {goals.map((g) => <option key={g.id} value={g.id}>{g.root ? `${g.root} › ` : ""}{g.title}{g.scope !== "company" ? ` (${g.scope})` : ""}</option>)}
              </select>
            </div>
          </div>
          <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div>{label("DEPARTMENT")}<select value={f.cat} onChange={(e) => setF({ ...f, cat: e.target.value })} className={field} style={bc}>{TASK_CATS.map((c) => <option key={c}>{c}</option>)}</select></div>
            <div>{label("ESCALATION")}<select value={f.esc} onChange={(e) => setF({ ...f, esc: e.target.value })} className={field} style={bc}>{ESC_LEVELS.map((c) => <option key={c}>{c}</option>)}</select></div>
          </div>
          {escalated(f.esc) && <input value={f.esc_why} onChange={(e) => setF({ ...f, esc_why: e.target.value })} placeholder="Why escalated? (required)" className={field + " mt-1"} style={{ borderColor: f.esc_why.trim() ? "var(--line)" : "var(--red)" }} />}

          <div className="flex items-center gap-2 mt-4 flex-wrap">
            <button onClick={() => save(false)} disabled={busy} className="text-sm font-bold rounded px-4 py-1.5" style={{ background: "var(--accent)", color: "#fff", opacity: busy ? 0.5 : 1 }}>{busy ? "Saving…" : "Save"}</button>
            <button onClick={() => save(true)} disabled={busy} className="text-sm font-bold rounded px-3 py-1.5" style={{ background: "#fff", border: "1px solid #22303C", color: "var(--ink)", opacity: busy ? 0.5 : 1 }} title="Keeps the person, date, escalation, job, project, goal and department — clears only the words">Save and add another</button>
            {msg && <span className="text-xs font-semibold" style={{ color: msg.includes("✓") ? "var(--green)" : "var(--red)" }}>{msg}</span>}
          </div>
          <div className="text-xs mt-2" style={{ color: "var(--muted)" }}>The last save&apos;s picks come back for the rest of the day. Tomorrow the task is yours again, three days out.</div>
        </div>
      </div>
    </div>
  );
}
