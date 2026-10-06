"use client";
/**
 * MANPOWER PLANNING — the week, by name.
 *
 * Dr Raghu, 28 Sep 2026: "in the Planning add a new module called Manpower
 * Planning ... show on the left column Job no and cust tag with the usual
 * click and lightbox ... next column YESTERDAY, then TODAY and date, then
 * the next 7 days ... the guy should be able to TYPE the workers name ...
 * they can also drag and drop ... a + on the right column top which means
 * copy over ... a + in the cell which means carry over ... in today, have a
 * place where the production guy can write what happened ... it will also
 * show milestones."
 *
 * THE SHAPE OF THE SCREEN IS THE SHAPE OF THE DECISION. Manpower is not
 * decided a day at a time: taking two fitters off Thursday means putting
 * them somewhere, and that somewhere has to be visible while you take them.
 * So the days sit beside each other and a person is dragged between them.
 *
 * YESTERDAY EARNS ITS COLUMN by being the only one that is a fact rather
 * than an intention. A job with four men yesterday and nobody today is
 * either finished or forgotten, and the pair of cells is what says which.
 *
 * NOBODY IS COUNTED TWICE. A man on two jobs is half a man-day on each (Dr
 * Raghu's rule) and both cells go red — a plan that lets one man be two is
 * a plan that promises work nobody can do.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { TRADES } from "@/lib/templates";
import { fmt, fmtFull, jobNo, addDays, computeSchedule, type Plan } from "@/lib/schedule";
import { Board, Job, TODAY } from "./shared";
import { doubleBooked, manDaysOn, tidy, type Assignment, type Person } from "@/lib/manpower-plan";

const C = {
  ink: "var(--ink)", navy: "var(--navy)", sub: "var(--dim)", mute: "var(--muted)",
  line: "var(--line)", soft: "var(--line-soft)", accent: "var(--accent)",
  green: "var(--green)", red: "var(--red)", amber: "#B45309", faint: "#B8B5AC",
};
const DAYS3 = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dayName = (iso: string) => DAYS3[new Date(`${iso}T00:00:00`).getDay()];
const tradeOfKey = (k: string | null) => TRADES.find((t) => t.key === k);

export default function ManpowerPlan({
  board, canEdit, onOpenJob,
}: {
  board: Board; canEdit: boolean; onOpenJob: (j: Job) => void;
}) {
  const [people, setPeople] = useState<Person[]>([]);
  const [rows, setRows] = useState<Assignment[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [installed, setInstalled] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [pick, setPick] = useState<{ job: string; day: string } | null>(null);
  const [noteBox, setNoteBox] = useState<{ job: string; day: string } | null>(null);
  const [q, setQ] = useState("");
  const [drag, setDrag] = useState<{ emp: Person; from?: { job: string; day: string } } | null>(null);

  const days = useMemo(() => {
    const out: string[] = [];
    for (let i = -1; i <= 7; i++) out.push(addDays(TODAY, i));
    return out;
  }, []);
  const from = days[0], to = days[days.length - 1];

  const load = useCallback(() => {
    api.get(`/api/manpower-plan?from=${from}&to=${to}`)
      .then((r: { installed?: boolean; people?: Person[]; assignments?: Assignment[]; notes?: { job_id: string; day: string; text: string }[] }) => {
        setInstalled(r.installed !== false);
        setPeople(r.people || []);
        setRows(r.assignments || []);
        const n: Record<string, string> = {};
        for (const x of r.notes || []) n[`${x.job_id}|${x.day}`] = x.text;
        setNotes(n);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [from, to]);
  useEffect(() => { load(); }, [load]);

  const post = async (body: Record<string, unknown>, tag = "") => {
    setBusy(tag); setErr("");
    try { await api.post("/api/manpower-plan", body); load(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy("");
  };

  /* Only jobs that are live and being built — the board's whole list would
     be a hundred rows of things nobody is putting a man on. */
  const jobs = useMemo(
    () => board.jobs
      .filter((j) => !j.delivered && (j.onFloor || j.pct > 0 || rows.some((a) => a.job_id === j.id)))
      .sort((a, b) => String(a.tdd || "9999").localeCompare(String(b.tdd || "9999"))),
    [board.jobs, rows],
  );
  const needle = q.trim().toLowerCase();
  const shown = jobs.filter((j) => !needle || j.tag.toLowerCase().includes(needle) || jobNo(j.id).includes(needle));

  const onDay = (job: string, day: string) => rows.filter((a) => a.job_id === job && a.day === day);
  const clash = useMemo(() => Object.fromEntries(days.map((d) => [d, doubleBooked(rows, d)])), [rows, days]);

  /** Who has nothing anywhere on that day — the pool at the top. */
  const freeOn = (day: string) => {
    const taken = new Set(rows.filter((a) => a.day === day).map((a) => a.emp_id));
    return people.filter((p) => !taken.has(p.id));
  };

  /** Milestones landing on a day, from the job's own plan. */
  const milestonesOn = (j: Job, day: string): string[] => {
    const pl = (board.plans as Record<string, Plan>)[j.id];
    if (!pl?.milestones?.length) return [];
    try {
      return computeSchedule({ start: pl.start || TODAY, milestones: pl.milestones })
        .filter((m) => !m.done && m.end === day).map((m) => m.name);
    } catch { return []; }
  };

  const drop = (job: string, day: string) => {
    if (!drag || !canEdit) return;
    const p = drag.emp;
    post({
      action: drag.from ? "move" : "assign",
      job_id: job, day, emp_id: p.id, emp_name: p.name, trade: p.trade,
      ...(drag.from ? { from_job: drag.from.job, from_day: drag.from.day } : {}),
    }, `${job}|${day}`);
    setDrag(null);
  };

  if (!installed) {
    return (
      <div className="rounded-lg border p-4" style={{ borderColor: C.line, background: "#FFF7E6", color: "#8A5A00", lineHeight: 1.6 }}>
        <b>Manpower planning is not installed yet.</b><br />
        Run migration <b>0171_manpower_plan.sql</b> on the Genie database and this screen comes alive.
        Nothing is lost in the meantime — the crew counts already recorded are untouched by it.
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-baseline gap-2 flex-wrap mb-2">
        <div className="font-bold" style={{ fontSize: 15 }}>Manpower planning</div>
        <div className="text-xs" style={{ color: C.mute }}>
          yesterday, today, and the seven days after · {people.length} people on the rolls · names carry to the next working day until changed (↻) · the count is the names
        </div>
        <div className="flex-1" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 job or tag"
          className="text-xs border rounded px-2 py-1" style={{ borderColor: C.line, width: 160 }} />
      </div>
      {err && <div className="text-xs font-bold mb-2" style={{ color: C.red }}>{err}</div>}

      {/* ---- the pool: who is spare today ---- */}
      <FreePool people={freeOn(TODAY)} canEdit={canEdit} onDragStart={(p) => setDrag({ emp: p })} />

      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 0, fontSize: 12, width: "100%" }}>
          <thead>
            <tr>
              <th style={{ ...hc, textAlign: "left", position: "sticky", left: 0, zIndex: 3, minWidth: 190 }}>Job</th>
              {days.map((d, i) => {
                const isToday = d === TODAY, isYest = i === 0;
                const next = days[i + 1];
                return (
                  <th key={d} style={{ ...hc, minWidth: 148, background: isToday ? C.accent : isYest ? "#46545F" : C.navy }}>
                    <div className="flex items-center justify-center gap-1">
                      <span style={{ fontSize: 11, fontWeight: 800 }}>
                        {isYest ? "YESTERDAY" : isToday ? "TODAY" : dayName(d).toUpperCase()}
                      </span>
                      {/* COPY THE WHOLE DAY FORWARD. Most days are yesterday
                          repeated; retyping it is how a plan stops being kept. */}
                      {canEdit && next && (
                        <button
                          onClick={() => {
                            if (!window.confirm(`Copy everybody on ${fmtFull(d)} forward to ${fmtFull(next)}?\n\nIt ADDS — anyone already planned on ${fmt(next)} stays.`)) return;
                            post({ action: "copy_day", day: d, to_day: next }, `copy|${d}`);
                          }}
                          title={`Copy this whole day forward to ${fmt(next)}`}
                          style={{ background: "rgba(255,255,255,.22)", color: "#fff", borderRadius: 4, width: 17, height: 17, lineHeight: "15px", fontWeight: 800 }}>
                          +
                        </button>
                      )}
                    </div>
                    <div style={{ fontSize: 10, opacity: .9 }}>{fmt(d)}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {shown.map((j) => (
              <tr key={j.id}>
                <td style={{ ...tc, position: "sticky", left: 0, zIndex: 2, background: "#fff", textAlign: "left", minWidth: 190 }}>
                  <button onClick={() => onOpenJob(j)} className="text-left">
                    <span className="font-bold tnum" style={{ color: "var(--blue)" }}>{jobNo(j.id)}</span>
                    <div style={{ fontSize: 11, color: C.ink, lineHeight: 1.3 }}>{j.tag}</div>
                  </button>
                  <div style={{ fontSize: 10, color: C.faint }}>
                    TDD {fmt(j.tdd)} · {j.pct}%
                  </div>
                </td>
                {days.map((d, i) => {
                  const here = onDay(j.id, d);
                  const md = manDaysOn(rows, j.id, d);
                  const ms = i >= 1 ? milestonesOn(j, d) : [];
                  const isToday = d === TODAY;
                  const next = days[i + 1];
                  const noteKey = `${j.id}|${d}`;
                  return (
                    <td key={d}
                      onDragOver={(e) => { if (drag && canEdit) e.preventDefault(); }}
                      onDrop={() => drop(j.id, d)}
                      style={{
                        ...tc, verticalAlign: "top", minWidth: 148,
                        background: isToday ? "#FFF7EF" : i === 0 ? "#FAFBFD" : "#fff",
                        outline: drag && canEdit ? `1px dashed ${C.accent}55` : undefined,
                      }}>
                      {/* milestones land here, above the people */}
                      {ms.map((m) => (
                        <div key={m} className="rounded px-1 mb-0.5" style={{ fontSize: 9.5, background: "#EDE9FE", color: "#5B21B6", fontWeight: 700 }}>
                          ◆ {m}
                        </div>
                      ))}
                      <div className="flex flex-wrap gap-1">
                        {here.map((a) => {
                          const t = tradeOfKey(a.trade);
                          const clashing = clash[d]?.has(a.emp_id);
                          return (
                            <span key={a.emp_id}
                              draggable={canEdit}
                              onDragStart={() => setDrag({ emp: { id: a.emp_id, name: a.emp_name, designation: null, department: null, trade: a.trade }, from: { job: j.id, day: d } })}
                              title={clashing ? `${a.emp_name} is on more than one job on ${fmt(d)} — counted as a share of a day` : a.noted_by === "rollover@genie" ? `${a.emp_name} — carried from the last working day; nobody changed this job` : a.emp_name}
                              className="rounded px-1 flex items-center gap-1"
                              style={{
                                fontSize: 10, fontWeight: 600, cursor: canEdit ? "grab" : "default",
                                background: clashing ? "#FBEAE8" : (t ? `${t.color}14` : "#F2F2EE"),
                                color: clashing ? C.red : (t?.color || C.sub),
                                border: clashing ? `1px solid ${C.red}55` : "1px solid transparent",
                              }}>
                              {t && <b>{t.tiny}</b>}
                              {shortName(a.emp_name)}
                              {a.noted_by === "rollover@genie" && <span style={{ opacity: .55, fontSize: 9 }} aria-label="carried">↻</span>}
                              {canEdit && (
                                <button onClick={() => post({ action: "unassign", job_id: j.id, day: d, emp_id: a.emp_id }, noteKey)}
                                  title="Take them off" style={{ color: C.faint, fontWeight: 800 }}>×</button>
                              )}
                            </span>
                          );
                        })}
                      </div>

                      <div className="flex items-center gap-1 mt-1">
                        {md > 0 && <span className="tnum" style={{ fontSize: 9.5, color: C.mute }}>{tidy(md)} md</span>}
                        <div className="flex-1" />
                        {canEdit && (
                          <button onClick={() => setPick({ job: j.id, day: d })}
                            title="Add somebody to this cell"
                            style={{ fontSize: 10, color: C.accent, fontWeight: 800 }}>+ name</button>
                        )}
                        {/* CARRY JUST THIS JOB'S CREW FORWARD. */}
                        {canEdit && next && here.length > 0 && (
                          <button onClick={() => post({ action: "carry_cell", job_id: j.id, day: d, to_day: next }, noteKey)}
                            title={`Carry this crew forward to ${fmt(next)}`}
                            style={{ fontSize: 10, color: C.green, fontWeight: 800 }}>+→</button>
                        )}
                      </div>

                      {/* WHAT HAPPENED — today, and any day behind it. A note
                          about tomorrow would be a plan, and the cell above
                          is already the plan. */}
                      {d <= TODAY && (
                        <button onClick={() => canEdit && setNoteBox({ job: j.id, day: d })}
                          className="w-full text-left rounded px-1 mt-1"
                          style={{ fontSize: 9.5, lineHeight: 1.35, background: notes[noteKey] ? "#EAF3EC" : "transparent",
                            color: notes[noteKey] ? "#1A5B32" : C.faint, border: `1px dashed ${notes[noteKey] ? "#B7D9C2" : C.soft}` }}>
                          {notes[noteKey] || (canEdit ? "what happened?" : "—")}
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {shown.length === 0 && (
              <tr><td colSpan={days.length + 1} style={{ ...tc, padding: 16, color: C.mute }}>
                No live jobs match. This screen lists jobs on the floor, jobs started, and anything already planned.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="text-xs mt-2" style={{ color: C.faint, lineHeight: 1.6 }}>
        Drag a name from the pool or from one cell to another. <b>+</b> on a day copies that whole day forward;
        <b> +→</b> in a cell carries just that job&apos;s crew. A name in <span style={{ color: C.red, fontWeight: 700 }}>red</span> is
        on more than one job that day — he is counted as a share of a day on each, never twice.
        {busy && <span> · saving…</span>}
      </div>

      {pick && (
        <PickPerson people={people} rows={rows} day={pick.day}
          onClose={() => setPick(null)}
          onPick={(p) => { post({ action: "assign", job_id: pick.job, day: pick.day, emp_id: p.id, emp_name: p.name, trade: p.trade }); setPick(null); }} />
      )}
      {noteBox && (
        <NoteBox jobId={noteBox.job} day={noteBox.day} value={notes[`${noteBox.job}|${noteBox.day}`] || ""}
          onClose={() => setNoteBox(null)}
          onSave={(t) => { post({ action: "note", job_id: noteBox.job, day: noteBox.day, text: t }); setNoteBox(null); }} />
      )}
    </div>
  );
}

/** "Ulhas Bhau Deshmukh" → "Ulhas D." — a cell is 148 points wide. */
function shortName(n: string): string {
  const parts = String(n || "").trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 12);
  return `${parts[0].slice(0, 10)} ${parts[parts.length - 1][0]}.`;
}

/**
 * WHO IS SPARE TODAY. It is the first question a production man asks and the
 * hardest one to answer from a grid: the grid shows where everybody IS, and
 * the person he needs is the one who is nowhere.
 */
function FreePool({ people, canEdit, onDragStart }: {
  people: Person[]; canEdit: boolean; onDragStart: (p: Person) => void;
}) {
  const [open, setOpen] = useState(true);
  const [q, setQ] = useState("");
  const n = q.trim().toLowerCase();
  const shown = people.filter((p) => !n || p.name.toLowerCase().includes(n));
  const byTrade = TRADES.map((t) => ({ t, n: people.filter((p) => p.trade === t.key).length })).filter((x) => x.n);
  return (
    <div className="rounded-lg border mb-2" style={{ borderColor: C.line, background: "#FAFBFD" }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-3 py-1.5 text-left">
        <b className="text-xs" style={{ color: C.mute, letterSpacing: .8 }}>UNASSIGNED TODAY · {people.length}</b>
        <span className="flex gap-1.5 flex-wrap" style={{ fontSize: 10.5 }}>
          {byTrade.map(({ t, n: k }) => <span key={t.key} style={{ color: t.color, fontWeight: 700 }}>{t.tiny}{k}</span>)}
        </span>
        <div className="flex-1" />
        <span style={{ color: C.sub }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-3 pb-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 type a name"
            className="text-xs border rounded px-2 py-1 mb-1.5" style={{ borderColor: C.line, width: 190 }} />
          <div className="flex flex-wrap gap-1" style={{ maxHeight: 120, overflowY: "auto" }}>
            {shown.slice(0, 200).map((p) => {
              const t = tradeOfKey(p.trade);
              return (
                <span key={p.id} draggable={canEdit} onDragStart={() => onDragStart(p)}
                  title={`${p.name}${p.designation ? ` · ${p.designation}` : ""}`}
                  className="rounded px-1.5 py-0.5"
                  style={{ fontSize: 10.5, fontWeight: 600, cursor: canEdit ? "grab" : "default",
                    background: t ? `${t.color}14` : "#F2F2EE", color: t?.color || C.sub }}>
                  {t ? <b>{t.tiny} </b> : null}{shortName(p.name)}
                </span>
              );
            })}
            {shown.length === 0 && <span className="text-xs" style={{ color: C.faint }}>Everybody is on something.</span>}
          </div>
        </div>
      )}
    </div>
  );
}

/** Type a name. The list is HRMS, so a name that is not on the rolls cannot be put on a job. */
function PickPerson({ people, rows, day, onClose, onPick }: {
  people: Person[]; rows: Assignment[]; day: string; onClose: () => void; onPick: (p: Person) => void;
}) {
  const [q, setQ] = useState("");
  const n = q.trim().toLowerCase();
  const busyToday = new Set(rows.filter((a) => a.day === day).map((a) => a.emp_id));
  const shown = people
    .filter((p) => !n || p.name.toLowerCase().includes(n) || (p.designation || "").toLowerCase().includes(n))
    .slice(0, 60);
  return (
    <div onClick={onClose} role="button" tabIndex={0}
      style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(22,35,47,.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} role="button" tabIndex={0} className="rounded-lg bg-white p-3" style={{ width: "min(460px,100%)", maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
        <div className="font-bold mb-1" style={{ fontSize: 14 }}>Who is on this, on {fmtFull(day)}?</div>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a name or a trade"
          className="rounded border px-2 py-1.5 mb-2" style={{ borderColor: C.line, fontSize: 13.5 }} />
        <div style={{ overflowY: "auto", flex: 1 }}>
          {shown.map((p) => {
            const t = tradeOfKey(p.trade);
            return (
              <button key={p.id} onClick={() => onPick(p)}
                className="w-full text-left px-2 py-1.5 flex items-center gap-2"
                style={{ borderBottom: `1px solid ${C.soft}` }}>
                {t ? <b style={{ color: t.color, width: 22 }}>{t.tiny}</b> : <span style={{ width: 22, color: C.faint }}>—</span>}
                <span style={{ flex: 1 }}>
                  <span style={{ fontSize: 13, color: C.ink }}>{p.name}</span>
                  <span style={{ fontSize: 11, color: C.faint }}> · {p.designation || "no designation"}</span>
                </span>
                {/* Said, not prevented — he may genuinely be on two. */}
                {busyToday.has(p.id) && <span style={{ fontSize: 10, color: C.red, fontWeight: 700 }}>already on a job</span>}
              </button>
            );
          })}
          {shown.length === 0 && <div className="text-xs p-3" style={{ color: C.faint }}>Nobody on the rolls by that name.</div>}
        </div>
        <div className="text-xs mt-2" style={{ color: C.faint }}>
          The list is HRMS. Somebody who is not on the rolls cannot be put on a job.
        </div>
      </div>
    </div>
  );
}

function NoteBox({ jobId, day, value, onClose, onSave }: {
  jobId: string; day: string; value: string; onClose: () => void; onSave: (t: string) => void;
}) {
  const [t, setT] = useState(value);
  return (
    <div onClick={onClose} role="button" tabIndex={0}
      style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(22,35,47,.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} role="button" tabIndex={0} className="rounded-lg bg-white p-3" style={{ width: "min(520px,100%)" }}>
        <div className="font-bold" style={{ fontSize: 14 }}>What happened · job {jobNo(jobId)}</div>
        <div className="text-xs mb-2" style={{ color: C.mute }}>{fmtFull(day)}{day === TODAY ? " · today" : ""}</div>
        <textarea autoFocus value={t} onChange={(e) => setT(e.target.value)} rows={5}
          placeholder="What was done, what stopped, what is needed tomorrow."
          className="w-full rounded border px-2 py-1.5" style={{ borderColor: C.line, fontSize: 13.5, lineHeight: 1.6 }} />
        <div className="flex gap-2 mt-2">
          <button onClick={() => onSave(t)} className="rounded px-3 py-1.5 font-bold" style={{ background: C.green, color: "#fff", fontSize: 12.5 }}>Save</button>
          <div className="flex-1" />
          <button onClick={onClose} className="rounded px-3 py-1.5" style={{ color: C.mute, fontSize: 12.5 }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

const hc: React.CSSProperties = {
  background: "var(--navy)", color: "#fff", padding: "4px 6px", textAlign: "center",
  border: "1px solid rgba(255,255,255,.12)", position: "sticky", top: 0, zIndex: 2,
};
const tc: React.CSSProperties = {
  padding: "4px 5px", textAlign: "left", border: `1px solid var(--line-soft)`, verticalAlign: "top",
};
