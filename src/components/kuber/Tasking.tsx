"use client";

/**
 * Kuber's Tasking — ONLY what is tagged for Kuber, in a week calendar of
 * swimlanes (Dr Raghu, 28 Aug 2026, view rebuilt on his word the same day):
 * Jobs · Goals · Quarterly Rocks · Audit · Strategic Actions. People are a
 * DROPDOWN, nobody shown by default beyond Suresh, Sandeep and RJ; the
 * choice is remembered. The general task flood stays in the main Tasking —
 * "this is not the place to see this."
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

type Range = "day" | "week" | "month";
type Col = { key: string; label: string; sub: string; from: string; to: string };

export default function KuberTasking() {
  const today = istToday();
  const [range, setRange] = useState<Range>("week");
  const [anchor, setAnchor] = useState(today);
  // the span and its columns, by range: a day is one box, a week is seven,
  // a month is its weeks (Dr Raghu, 28 Aug 2026)
  const span = (() => {
    if (range === "day") return { from: anchor, to: anchor };
    if (range === "week") { const m = mondayOf(anchor); return { from: m, to: addDays(m, 6) }; }
    const first = anchor.slice(0, 8) + "01";
    const nm = new Date(first + "T00:00:00Z"); nm.setUTCMonth(nm.getUTCMonth() + 1); nm.setUTCDate(0);
    return { from: first, to: nm.toISOString().slice(0, 10) };
  })();
  const cols: Col[] = (() => {
    if (range === "day") return [{ key: anchor, label: DAYS[(new Date(anchor + "T00:00:00Z").getUTCDay() + 6) % 7], sub: dmy(anchor), from: anchor, to: anchor }];
    if (range === "week") {
      const m = mondayOf(anchor);
      return Array.from({ length: 7 }, (_, i) => {
        const d = addDays(m, i);
        return { key: d, label: DAYS[i], sub: dmy(d), from: d, to: d };
      });
    }
    const out: Col[] = [];
    let wstart = mondayOf(span.from) < span.from ? span.from : mondayOf(span.from);
    let w = 1;
    while (wstart <= span.to) {
      const wend0 = addDays(mondayOf(wstart), 6);
      const wend = wend0 > span.to ? span.to : wend0;
      out.push({ key: wstart, label: `Week ${w}`, sub: `${dmy(wstart)}–${dmy(wend)}`, from: wstart, to: wend });
      wstart = addDays(wend, 1); w++;
    }
    return out;
  })();
  const monday = span.from;
  const [tasks, setTasks] = useState<KTask[] | null>(null);
  const [assignees, setAssignees] = useState<string[]>([]);
  const [people, setPeople] = useState<Set<string> | null>(null); // the chosen few
  const [pickerOpen, setPickerOpen] = useState(false);
  const [needs, setNeeds] = useState(false);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<KTask | null>(null);

  const load = useCallback(() => {
    setTasks(null);
    fetch(`/api/kuber/tasking?from=${span.from}&to=${span.to}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { setTasks(j.tasks || []); setAssignees(j.assignees || []); setNeeds(!!j.needsMigration); })
      .catch(() => setTasks([]));
  }, [span.from, span.to]);
  useEffect(() => { load(); }, [load]);

  // WHO SHOWS: nobody by default except the named few — Suresh (SL),
  // Sandeep (SU) and RJ (Dr Raghu, 28 Aug 2026) — then remembered as chosen.
  useEffect(() => {
    if (people !== null || assignees.length === 0) return;
    try {
      const saved = localStorage.getItem("kuber.tasking.people");
      if (saved) {
        const arr = (JSON.parse(saved) as string[]).filter((w) => assignees.includes(w));
        setPeople(new Set(arr));
        return;
      }
    } catch { /* fine */ }
    const DEFAULTS = /suresh|sandeep|raghu|^s\.?l\.?$|^s\.?u\.?$|^r\.?j\.?$/i;
    setPeople(new Set(assignees.filter((a) => DEFAULTS.test(a) || DEFAULTS.test(a.split(" ")[0] || ""))));
  }, [assignees, people]);
  const chosen = people ?? new Set<string>();
  const togglePerson = (w: string) => {
    setPeople((c) => {
      const next = new Set(c ?? []);
      if (next.has(w)) next.delete(w); else next.add(w);
      try { localStorage.setItem("kuber.tasking.people", JSON.stringify([...next])); } catch { /* fine */ }
      return next;
    });
  };

  const spanHasToday = span.from <= today && today <= span.to;
  const shown = (tasks || []).filter((t) => chosen.has(t.who));
  const cell = (lane: string, c: Col) => shown.filter((t) => t.lane === lane && t.due && t.due >= c.from && t.due <= c.to);
  const overdue = (lane: string) =>
    spanHasToday ? shown.filter((t) => t.lane === lane && !t.done && t.due && t.due < span.from) : [];
  const undated = (lane: string) => shown.filter((t) => t.lane === lane && !t.done && !t.due);
  const laneCount = (lane: string) => shown.filter((t) => t.lane === lane && !t.done).length;
  const step = (dirn: 1 | -1) => {
    if (range === "day") setAnchor(addDays(anchor, dirn));
    else if (range === "week") setAnchor(addDays(anchor, 7 * dirn));
    else { const d = new Date(anchor.slice(0, 8) + "01T00:00:00Z"); d.setUTCMonth(d.getUTCMonth() + dirn); setAnchor(d.toISOString().slice(0, 10)); }
  };
  const spanLabel = range === "day" ? dmy(anchor)
    : range === "week" ? `${dmy(span.from)} – ${dmy(span.to)}`
    : new Date(span.from + "T00:00:00Z").toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

  const Chip = ({ t, colour }: { t: KTask; colour: string }) => (
    <button onClick={() => setOpen(t)}
      className="block w-full text-left rounded mb-1 px-2 py-1.5"
      style={{
        background: t.done ? "#F4F2EC" : "#fff",
        borderLeft: `3px solid ${t.done ? "#C9C5BA" : colour}`,
        boxShadow: t.done ? "none" : "0 1px 3px rgba(22,35,47,.08)",
      }}
      title={`${t.title}${t.job ? `\n${t.job}` : ""}\n${t.who}`}>
      <span className="block text-xs font-semibold" style={{
        color: t.done ? MUTED : INK, textDecoration: t.done ? "line-through" : "none",
        overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
      }}>
        {t.esc !== "None" && <span style={{ color: RED }}>⚠ </span>}{t.title}
      </span>
      <span className="block" style={{ color: MUTED, fontSize: 10, marginTop: 2 }}>{t.who.split(" ")[0]}</span>
    </button>
  );

  return (
    <div>
      {/* ── the toolbar ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="text-lg font-bold" style={{ color: INK }}>Tasking</div>
        <span className="text-xs" style={{ color: MUTED }}>only what is tagged for Kuber — the rest lives in the main Tasking</span>
        <span className="ml-auto" />

        {/* the people, as a dropdown — nobody extra by default */}
        <div className="relative">
          <button onClick={() => setPickerOpen((v) => !v)}
            className="rounded border px-3 py-1.5 text-sm font-bold bg-white"
            style={{ borderColor: chosen.size ? "#1B3A5C" : BORDER, color: "#1B3A5C" }}>
            👤 People ({chosen.size}) ▾
          </button>
          {pickerOpen && (
            <>
              <div className="fixed inset-0" style={{ zIndex: 48 }} onClick={() => setPickerOpen(false)} />
              <div className="absolute rounded-lg border bg-white p-1" style={{ top: "calc(100% + 4px)", right: 0, zIndex: 49, borderColor: BORDER, boxShadow: "0 10px 28px rgba(0,0,0,.18)", minWidth: 220, maxHeight: 300, overflow: "auto" }}>
                {assignees.length === 0 && <div className="px-3 py-2 text-xs" style={{ color: MUTED }}>Nobody holds a tagged task yet.</div>}
                {assignees.map((w) => (
                  <label key={w} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 rounded" style={{ cursor: "pointer", color: INK }}>
                    <input type="checkbox" checked={chosen.has(w)} onChange={() => togglePerson(w)} style={{ accentColor: "#1B3A5C" }} />
                    {w}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex gap-0.5 rounded p-0.5" style={{ background: "#fff", border: `1px solid ${BORDER}` }}>
          {(["day", "week", "month"] as Range[]).map((r) => (
            <button key={r} onClick={() => setRange(r)} className="rounded px-2.5 py-1 text-xs font-bold"
              style={range === r ? { background: "#22303C", color: "#fff" } : { color: MUTED }}>
              {r[0].toUpperCase() + r.slice(1)}
            </button>
          ))}
        </div>
        <button onClick={() => step(-1)} className="rounded border px-2.5 py-1.5 text-sm font-bold bg-white" style={{ borderColor: BORDER, color: "#1B3A5C" }}>‹</button>
        <span className="text-sm font-bold tnum" style={{ color: INK }}>{spanLabel}</span>
        <button onClick={() => step(1)} className="rounded border px-2.5 py-1.5 text-sm font-bold bg-white" style={{ borderColor: BORDER, color: "#1B3A5C" }}>›</button>
        {!spanHasToday && <button onClick={() => setAnchor(today)} className="text-xs font-bold" style={{ color: ORANGE }}>today</button>}
        <button onClick={() => setAdding(true)} className="rounded px-3.5 py-1.5 text-sm font-bold text-white" style={{ background: ORANGE }}>+ Add New</button>
      </div>

      {needs && (
        <div className="rounded p-3 text-sm font-semibold mb-2" style={{ background: "#FCF6E8", color: "#8A6D1A" }}>
          Run migration 0082 first — the Related To tag has nowhere to live yet.
        </div>
      )}
      {chosen.size === 0 && tasks !== null && (
        <div className="rounded p-3 text-sm mb-2" style={{ background: "#EEF1FA", color: "#1B3A5C" }}>
          Nobody is selected — open 👤 People and tick who to watch.
        </div>
      )}

      {/* ── the week, lane by lane ──────────────────────────────────── */}
      <div className="rounded-lg overflow-auto" style={{ border: `1px solid ${BORDER}`, background: "#fff", maxHeight: "74vh" }}>
        <table style={{ minWidth: 1200, borderCollapse: "separate", borderSpacing: 0, width: "100%" }}>
          <thead>
            <tr>
              <th className="px-3 py-2.5 text-left text-xs font-bold" style={{ position: "sticky", left: 0, top: 0, background: "#16232F", color: "#fff", minWidth: 170, zIndex: 4, letterSpacing: 0.6 }}>SWIMLANE</th>
              {spanHasToday && (
                <th className="px-2 py-2.5 text-left text-xs font-bold" style={{ position: "sticky", top: 0, background: "#5B2320", color: "#F5C9C4", minWidth: 140 }}>OVERDUE</th>
              )}
              {cols.map((c) => {
                const isNow = c.from <= today && today <= c.to;
                return (
                  <th key={c.key} className="px-2 py-2.5 text-left text-xs" style={{
                    position: "sticky", top: 0, minWidth: range === "day" ? 320 : 140,
                    background: isNow ? "#1B3A5C" : "#16232F",
                    color: isNow ? "#fff" : "#C7D0DA",
                  }}>
                    <b>{c.label}</b> <span style={{ fontWeight: 400, opacity: 0.75 }}>{c.sub}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {tasks === null && (<tr><td colSpan={9} className="px-3 py-5 text-sm" style={{ color: MUTED }}>Loading the week…</td></tr>)}
            {tasks !== null && LANES.filter((l) => l.key !== "other").map((l, li) => (
              <tr key={l.key} className="align-top" style={{ background: li % 2 ? "#FAF9F5" : "#fff" }}>
                <td className="px-3 py-3" style={{ position: "sticky", left: 0, background: li % 2 ? "#FAF9F5" : "#fff", zIndex: 2, borderTop: `1px solid #EFEDE7`, borderLeft: `4px solid ${l.colour}` }}>
                  <div className="text-sm font-bold" style={{ color: l.colour }}>{l.label}</div>
                  <div className="text-xs" style={{ color: MUTED }}>{laneCount(l.key)} open</div>
                  {undated(l.key).length > 0 && (
                    <div className="mt-2">
                      <div className="text-xs font-bold mb-1" style={{ color: MUTED }}>undated</div>
                      {undated(l.key).map((t) => (<Chip key={t.kind + t.id} t={t} colour={l.colour} />))}
                    </div>
                  )}
                </td>
                {spanHasToday && (
                  <td className="px-1.5 py-2" style={{ background: "#FBF3F2", borderTop: "1px solid #EFEDE7", minHeight: 74 }}>
                    {overdue(l.key).map((t) => (<Chip key={t.kind + t.id} t={t} colour={l.colour} />))}
                  </td>
                )}
                {cols.map((c) => (
                  <td key={c.key} className="px-1.5 py-2" style={{
                    borderTop: "1px solid #EFEDE7", borderLeft: "1px solid #F4F2EC",
                    background: c.from <= today && today <= c.to ? "#F0F5FB" : undefined, height: 74,
                  }}>
                    {cell(l.key, c).map((t) => (<Chip key={t.kind + t.id} t={t} colour={l.colour} />))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
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
