"use client";

/**
 * Kuber's Tasking — the main Genie's tasks in a WEEK CALENDAR with swimlanes
 * (Dr Raghu, 28 Aug 2026): Jobs · Goals · Quarterly Rocks · Audit ·
 * Strategic Actions, all lanes shown by default, an Assigned-to filter of
 * checkboxes, and Add New for Strategic Actions — RELATED TO rides the task
 * so the same tag tracks in the main Tasking too.
 */

import { useCallback, useEffect, useState } from "react";

const INK = "#16232F", MUTED = "#8A94A0", BORDER = "#E2E0DA", ORANGE = "#E8600A", RED = "#B3261E", GREEN = "#0D7A3F";

const LANES: { key: string; label: string; colour: string }[] = [
  { key: "job", label: "Jobs", colour: "#1B3A5C" },
  { key: "goal", label: "Goals", colour: "#0D7A3F" },
  { key: "rock", label: "Quarterly Rocks", colour: "#7A5E1E" },
  { key: "audit", label: "Audit", colour: "#7C3AED" },
  { key: "strategic", label: "Strategic Actions", colour: "#C2410C" },
  { key: "other", label: "Other", colour: "#5A6672" },
];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const istToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const addDays = (iso: string, d: number) => {
  const t = new Date(iso + "T00:00:00Z");
  t.setUTCDate(t.getUTCDate() + d);
  return t.toISOString().slice(0, 10);
};
const mondayOf = (iso: string) => {
  const t = new Date(iso + "T00:00:00Z");
  return addDays(iso, -((t.getUTCDay() + 6) % 7));
};
const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

interface KTask { id: string; kind: string; title: string; who: string; due: string | null; cat: string; esc: string; done: boolean; lane: string; job: string | null }

export default function KuberTasking() {
  const today = istToday();
  const [monday, setMonday] = useState(mondayOf(today));
  const [tasks, setTasks] = useState<KTask[] | null>(null);
  const [assignees, setAssignees] = useState<string[]>([]);
  const [checked, setChecked] = useState<Set<string> | null>(null); // null = everyone
  const [needs, setNeeds] = useState(false);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<KTask | null>(null);

  const load = useCallback(() => {
    setTasks(null);
    fetch(`/api/kuber/tasking?from=${monday}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { setTasks(j.tasks || []); setAssignees(j.assignees || []); setNeeds(!!j.needsMigration); })
      .catch(() => setTasks([]));
  }, [monday]);
  useEffect(() => { load(); }, [load]);

  const isChecked = (w: string) => checked === null || checked.has(w);
  const toggleWho = (w: string) => {
    setChecked((c) => {
      const base = c === null ? new Set(assignees) : new Set(c);
      if (base.has(w)) base.delete(w); else base.add(w);
      return base.size === assignees.length ? null : base;
    });
  };

  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const isCurrentWeek = monday === mondayOf(today);
  const shown = (tasks || []).filter((t) => isChecked(t.who));
  const cell = (lane: string, day: string) =>
    shown.filter((t) => t.lane === lane && t.due === day);
  const overdue = (lane: string) =>
    isCurrentWeek ? shown.filter((t) => t.lane === lane && !t.done && t.due && t.due < monday) : [];
  const undated = (lane: string) =>
    isCurrentWeek ? shown.filter((t) => t.lane === lane && !t.done && !t.due) : [];

  const Chip = ({ t }: { t: KTask }) => (
    <button onClick={() => setOpen(t)}
      className="block w-full text-left rounded px-1.5 py-1 mb-1 text-xs"
      style={{
        background: t.done ? "#EFEDE7" : t.esc !== "None" ? "#FBEDEA" : "#fff",
        border: `1px solid ${t.done ? "#E2E0DA" : t.esc !== "None" ? "#F0C9C4" : BORDER}`,
        color: t.done ? MUTED : INK, textDecoration: t.done ? "line-through" : "none",
      }}
      title={`${t.title}${t.job ? `\n${t.job}` : ""}\n${t.who}`}>
      <b>{t.who ? t.who.split(" ")[0] : "—"}</b> · {t.title.length > 40 ? t.title.slice(0, 40) + "…" : t.title}
    </button>
  );

  return (
    <div>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <div className="text-lg font-bold" style={{ color: INK }}>Tasking</div>
        <span className="text-xs" style={{ color: MUTED }}>the main Genie&apos;s tasks, the week at a glance</span>
        <span className="ml-auto" />
        <button onClick={() => setMonday(addDays(monday, -7))} className="rounded border px-2 py-1 text-sm font-bold" style={{ borderColor: BORDER, color: "#1B3A5C" }}>‹</button>
        <span className="text-sm font-bold tnum" style={{ color: INK }}>{dmy(monday)} – {dmy(addDays(monday, 6))}{isCurrentWeek ? " · this week" : ""}</span>
        <button onClick={() => setMonday(addDays(monday, 7))} className="rounded border px-2 py-1 text-sm font-bold" style={{ borderColor: BORDER, color: "#1B3A5C" }}>›</button>
        {!isCurrentWeek && <button onClick={() => setMonday(mondayOf(today))} className="text-xs font-bold" style={{ color: ORANGE }}>today</button>}
        <button onClick={() => setAdding(true)} className="rounded px-3 py-1.5 text-sm font-bold text-white" style={{ background: ORANGE }}>+ Add New</button>
      </div>

      {needs && (
        <div className="rounded p-3 text-sm font-semibold mb-2" style={{ background: "#FCF6E8", color: "#8A6D1A" }}>
          Run migration 0082 first — the Related To tag has nowhere to live yet.
        </div>
      )}

      {/* assigned-to: checkboxes, everyone ticked by default */}
      {assignees.length > 0 && (
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="text-xs font-bold" style={{ color: MUTED }}>ASSIGNED TO</span>
          {assignees.map((w) => (
            <label key={w} className="flex items-center gap-1 text-xs font-semibold rounded border px-2 py-0.5"
              style={{ borderColor: isChecked(w) ? "#1B3A5C" : BORDER, color: isChecked(w) ? "#1B3A5C" : MUTED, cursor: "pointer", background: "#fff" }}>
              <input type="checkbox" checked={isChecked(w)} onChange={() => toggleWho(w)} style={{ accentColor: "#1B3A5C" }} />
              {w}
            </label>
          ))}
          {checked !== null && (
            <button onClick={() => setChecked(null)} className="text-xs font-bold" style={{ color: ORANGE }}>everyone</button>
          )}
        </div>
      )}

      <div className="bg-white rounded-lg border overflow-auto" style={{ borderColor: BORDER, maxHeight: "72vh" }}>
        <table style={{ minWidth: 1150, borderCollapse: "separate", borderSpacing: 0, width: "100%" }}>
          <thead>
            <tr style={{ background: "#22303C", color: "#fff" }}>
              <th className="px-2 py-2 text-left text-xs" style={{ position: "sticky", left: 0, top: 0, background: "#22303C", minWidth: 150, zIndex: 4 }}>Swimlane</th>
              {isCurrentWeek && <th className="px-2 py-2 text-left text-xs" style={{ position: "sticky", top: 0, background: "#3A1F1C", minWidth: 130 }}>Overdue</th>}
              {days.map((d, i) => (
                <th key={d} className="px-2 py-2 text-left text-xs" style={{ position: "sticky", top: 0, background: d === today ? "#1B3A5C" : "#22303C", minWidth: 130 }}>
                  {DAYS[i]} <span style={{ color: "#8FA1B3", fontWeight: 400 }}>{dmy(d)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tasks === null && (<tr><td colSpan={9} className="px-3 py-4 text-xs" style={{ color: MUTED }}>Loading the week…</td></tr>)}
            {tasks !== null && LANES.map((l) => (
              <tr key={l.key} className="border-t align-top" style={{ borderColor: "#EFEDE7" }}>
                <td className="px-2 py-2" style={{ position: "sticky", left: 0, background: "#fff", zIndex: 2, borderRight: `1px solid #EFEDE7` }}>
                  <span className="text-xs font-bold" style={{ color: l.colour }}>{l.label}</span>
                  {undated(l.key).length > 0 && (
                    <div className="mt-1">{undated(l.key).map((t) => (<Chip key={t.kind + t.id} t={t} />))}</div>
                  )}
                </td>
                {isCurrentWeek && (
                  <td className="px-1.5 py-2" style={{ background: "#FDF7F6" }}>
                    {overdue(l.key).map((t) => (<Chip key={t.kind + t.id} t={t} />))}
                  </td>
                )}
                {days.map((d) => (
                  <td key={d} className="px-1.5 py-2" style={{ background: d === today ? "#F4F7FB" : undefined, borderLeft: "1px solid #F4F2EC" }}>
                    {cell(l.key, d).map((t) => (<Chip key={t.kind + t.id} t={t} />))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-xs mt-1" style={{ color: MUTED }}>
        A task with a job sits in Jobs; the rest follow their Related To tag. Undated tasks wait under their lane&apos;s name; done tasks stay struck through for the week they closed.
      </div>

      {adding && <AddTask onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} assignees={assignees} />}
      {open && <TaskPeek t={open} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); load(); }} today={today} />}
    </div>
  );
}

/** Add New — a Strategic Action by default; Related To choosable. */
function AddTask({ onClose, onSaved, assignees }: { onClose: () => void; onSaved: () => void; assignees: string[] }) {
  const [f, setF] = useState({ title: "", detail: "", who: "", due: istToday(), related_to: "strategic" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const save = async () => {
    if (!f.title.trim()) { setErr("A task needs words."); return; }
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/tasks", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "create", title: f.title.trim(), detail: f.detail, who: f.who, due: f.due || null, cat: "Strategic", related_to: f.related_to }),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Could not save");
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  };
  return (
    <div onClick={onClose} className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)", zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg p-4 w-full" style={{ maxWidth: 480 }}>
        <div className="font-bold text-sm mb-2" style={{ color: INK }}>+ New task</div>
        <input autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="What is to be done"
          className="w-full border rounded px-2 py-1.5 text-sm mb-2" style={{ borderColor: BORDER }} />
        <textarea value={f.detail} onChange={(e) => setF({ ...f, detail: e.target.value })} placeholder="Details…" rows={2}
          className="w-full border rounded px-2 py-1.5 text-xs mb-2" style={{ borderColor: BORDER }} />
        <div className="flex gap-2 mb-2">
          <input list="kuber-task-who" value={f.who} onChange={(e) => setF({ ...f, who: e.target.value })} placeholder="Assigned to"
            className="flex-1 border rounded px-2 py-1.5 text-sm" style={{ borderColor: BORDER }} />
          <datalist id="kuber-task-who">{assignees.map((a) => (<option key={a} value={a} />))}</datalist>
          <input type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })}
            className="border rounded px-2 py-1.5 text-sm" style={{ borderColor: BORDER }} />
        </div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-bold" style={{ color: MUTED }}>RELATED TO</span>
          <select value={f.related_to} onChange={(e) => setF({ ...f, related_to: e.target.value })}
            className="border rounded px-2 py-1 text-sm bg-white font-semibold" style={{ borderColor: BORDER }}>
            <option value="strategic">Strategic Action</option>
            <option value="rock">Quarterly Rock</option>
            <option value="audit">Audit</option>
            <option value="goal">Goal</option>
          </select>
        </div>
        {err && <div className="text-xs font-bold mb-2" style={{ color: RED }}>{err}</div>}
        <div className="flex gap-2">
          <button onClick={save} disabled={busy} className="flex-1 rounded py-1.5 text-sm font-bold text-white" style={{ background: busy ? "#B9BEC4" : ORANGE }}>
            {busy ? "Saving…" : "💾 Save"}
          </button>
          <button onClick={onClose} className="rounded px-3 text-sm" style={{ color: MUTED }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

/** A task, peeked — done/reopen here; full editing stays in the main Tasking. */
function TaskPeek({ t, onClose, onChanged, today }: { t: KTask; onClose: () => void; onChanged: () => void; today: string }) {
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    await fetch("/api/tasks", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "toggle", id: t.id, kind: t.kind, done: !t.done }),
    });
    onChanged();
  };
  const late = !t.done && t.due && t.due < today;
  return (
    <div onClick={onClose} className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)", zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg p-4 w-full" style={{ maxWidth: 440 }}>
        <div className="font-bold text-sm mb-1" style={{ color: INK }}>{t.title}</div>
        <div className="text-xs mb-2" style={{ color: MUTED }}>
          {t.who || "unassigned"} · due {t.due ? `${t.due.slice(8, 10)}/${t.due.slice(5, 7)}` : "—"}
          {late && <b style={{ color: RED }}> · late</b>}
          {t.job && <> · {t.job}</>}
          {t.esc !== "None" && <b style={{ color: RED }}> · esc {t.esc}</b>}
        </div>
        <div className="flex gap-2">
          <button onClick={toggle} disabled={busy}
            className="flex-1 rounded py-1.5 text-sm font-bold text-white" style={{ background: t.done ? "#5A6672" : GREEN }}>
            {t.done ? "Reopen" : "✓ Done"}
          </button>
          <button onClick={onClose} className="rounded px-3 text-sm" style={{ color: MUTED }}>Close</button>
        </div>
        <div className="text-xs mt-2" style={{ color: MUTED }}>Full editing — details, dates, escalation — lives in the main Genie&apos;s Tasking.</div>
      </div>
    </div>
  );
}
