"use client";
/**
 * SERVICE TEAM PLAN DEPLOYMENT (Dr Raghu, 12 Oct 2026): "This is like the
 * roster. Have a screen saying Service Team Plan Deployment. Should have
 * calendar — daily, weekly, monthly, quarterly view. Show the service
 * persons on top. AMC due should be seen also based on calendar. Aakash or
 * Yash can make this."
 *
 * The people are the HRMS Service roll. The AMC visits falling due are
 * worked out from each live contract — its dates and its number of visits —
 * and turn green once a plan line covers them. Contracts ending in the next
 * 30 days sit beside, for the renewal quotation.
 */
import { useEffect, useMemo, useRef, useState } from "react";

type Person = { id: string; name: string; designation: string | null; email: string | null };
type Plan = { id: string; on_date: string; employee_id: string; person_name: string; kind: string; customer: string; site: string; amc_id: string | null; issue: string | null; backup_id: string | null; notes: string; status: string };
type Due = { amc_id: string; on_date: string; due_on: string; window_to: string; visit_no: number; visits: number; customer: string; machine: string; location: string; territory: string; engineer: string; erp_name: string | null; covered_by: { id: string; on_date: string; person_name: string; status: string } | null };
type Amc = { id: string; customer: string; machine: string; location: string; end_date: string; visits_planned: number | null; erp_name: string | null };
type D = { installed?: boolean; from: string; to: string; today: string; team: Person[]; plans: Plan[]; due: Due[]; expiring: Amc[]; kinds: string[]; mayPlan: boolean };
type View = "day" | "week" | "month" | "quarter";

const NAVY = "var(--navy)", MUTED = "var(--muted)", LINE = "var(--line)", ORANGE = "var(--accent)", GREEN = "var(--green)", RED = "var(--red)";
const INKS = ["#1D4ED8", "#B91C1C", "#047857", "#7C3AED", "#C2410C", "#0E7490", "#A21CAF", "#4D7C0F", "#9F1239", "#1E40AF", "#92400E", "#0F766E", "#6D28D9", "#BE185D", "#15803D", "#B45309"];
const KIND_ICON: Record<string, string> = { "AMC visit": "🛠", Breakdown: "🚨", Installation: "🏗", Commissioning: "⚙", Training: "🎓", "Spares delivery": "📦", Office: "🏢", Leave: "🌴", Other: "•" };
const iso = (d: Date) => d.toISOString().slice(0, 10);
const at = (s: string) => new Date(s + "T00:00:00Z");
const add = (s: string, n: number) => { const d = at(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const todayIst = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const first = (n: string) => n.split(/\s+/)[0];
const ini = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const fmt = (s: string, o: Intl.DateTimeFormatOptions) => at(s).toLocaleDateString("en-IN", { timeZone: "UTC", ...o });
const btn = (k: "primary" | "soft" | "ghost" = "soft"): React.CSSProperties => ({ borderRadius: 7, padding: "5px 11px", fontSize: 12.5, fontWeight: 700, border: k === "ghost" ? "none" : `1px solid ${k === "primary" ? "var(--accent)" : LINE}`, background: k === "primary" ? "var(--accent)" : "#fff", color: k === "primary" ? "#fff" : NAVY });
const inp: React.CSSProperties = { width: "100%", border: `1px solid ${LINE}`, borderRadius: 7, padding: "6px 9px", fontSize: 13, background: "#fff" };
const lbl: React.CSSProperties = { display: "block", fontSize: 10.5, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--dim)", marginBottom: 3 };

function range(view: View, anchor: string): [string, string] {
  const d = at(anchor);
  if (view === "day") return [anchor, anchor];
  if (view === "week") { const dow = (d.getUTCDay() + 6) % 7; const mon = add(anchor, -dow); return [mon, add(mon, 6)]; }
  if (view === "month") { const f = iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))); const l = iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))); return [f, l]; }
  const q = Math.floor(d.getUTCMonth() / 3) * 3;
  return [iso(new Date(Date.UTC(d.getUTCFullYear(), q, 1))), iso(new Date(Date.UTC(d.getUTCFullYear(), q + 3, 0)))];
}
function step(view: View, anchor: string, n: number) {
  if (view === "day") return add(anchor, n);
  if (view === "week") return add(anchor, 7 * n);
  const d = at(anchor); const m = view === "month" ? 1 : 3;
  return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + m * n, 1)));
}
const daysOf = (a: string, b: string) => { const out: string[] = []; for (let x = a; x <= b && out.length < 100; x = add(x, 1)) out.push(x); return out; };

async function post(body: unknown) {
  const r = await fetch("/api/seva/plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Failed (${r.status})`);
  return j;
}

export default function SevaPlan() {
  const [view, setView] = useState<View>(() => { try { return (localStorage.getItem("seva.plan.view") as View) || "week"; } catch { return "week"; } });
  const [anchor, setAnchor] = useState(todayIst());
  const [d, setD] = useState<D | null>(null);
  const [who, setWho] = useState<string>("");
  const [showDue, setShowDue] = useState(true);
  const [form, setForm] = useState<Partial<Plan> & { employee_ids?: string[] } | null>(null);
  /* DRAG AND DROP (Dr Raghu, 12 Oct 2026): an AMC due dropped on a person's day plans it; a plan dropped elsewhere moves it */
  const drag = useRef<{ plan?: Plan; due?: Due } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [from, to] = range(view, anchor);
  const load = () => fetch(`/api/seva/plan?from=${from}&to=${to}`, { cache: "no-store" }).then((r) => r.json()).then(setD).catch(() => setD(null));
  useEffect(() => { setD(null); load(); }, [from, to]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { try { localStorage.setItem("seva.plan.view", view); } catch { /* fine */ } }, [view]);
  const ink = useMemo(() => { const m = new Map<string, string>(); (d?.team || []).forEach((p, i) => m.set(p.id, INKS[i % INKS.length])); return m; }, [d?.team]);
  const plans = (d?.plans || []).filter((p) => !who || p.employee_id === who || p.backup_id === who);
  const dues = showDue ? (d?.due || []) : [];
  const may = !!d?.mayPlan;
  const label = view === "day" ? fmt(from, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : view === "week" ? `${fmt(from, { day: "numeric", month: "short" })} – ${fmt(to, { day: "numeric", month: "short", year: "numeric" })}` : view === "month" ? fmt(from, { month: "long", year: "numeric" }) : `Q${Math.floor(at(from).getUTCMonth() / 3) + 1} · ${fmt(from, { month: "short" })} – ${fmt(to, { month: "short", year: "numeric" })}`;
  const dropAt = async (on_date: string, employee_id?: string) => {
    const g = drag.current; drag.current = null; setOver(null);
    if (!g || !may) return;
    try {
      if (g.plan) {
        if (g.plan.on_date === on_date && (!employee_id || g.plan.employee_id === employee_id)) return;
        await post({ action: "move", id: g.plan.id, on_date, employee_id: employee_id || undefined });
        setFlash(`Moved to ${fmt(on_date, { day: "numeric", month: "short" })}${employee_id ? ` · ${d?.team.find((t) => t.id === employee_id)?.name.split(" ")[0]}` : ""}`);
      } else if (g.due) {
        if (!employee_id) { newPlan(on_date, undefined, g.due); return; }
        const u = g.due;
        await post({ action: "save", on_date, employee_ids: [employee_id], kind: "AMC visit", customer: u.customer, site: u.location, amc_id: u.amc_id, notes: `AMC visit ${u.visit_no} of ${u.visits}${u.machine ? ` — ${u.machine}` : ""}` });
        setFlash(`${u.customer} planned for ${d?.team.find((t) => t.id === employee_id)?.name.split(" ")[0]} on ${fmt(on_date, { day: "numeric", month: "short" })}`);
      }
      load();
    } catch (e) { setFlash(String((e as Error).message)); }
    setTimeout(() => setFlash(null), 3500);
  };
  const dnd = (key: string, on_date: string, employee_id?: string) => may ? {
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); if (over !== key) setOver(key); },
    onDragLeave: () => setOver((o) => (o === key ? null : o)),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); void dropAt(on_date, employee_id); },
  } : {};
  const newPlan = (on_date: string, employee_id?: string, due?: Due) => may && setForm({ on_date, employee_ids: employee_id ? [employee_id] : [], kind: due ? "AMC visit" : "AMC visit", customer: due?.customer || "", site: due?.location || "", amc_id: due?.amc_id || null, notes: due ? `AMC visit ${due.visit_no} of ${due.visits}${due.machine ? ` — ${due.machine}` : ""}` : "" });

  const Chip = ({ p, small }: { p: Plan; small?: boolean }) => (
    <div draggable={may} onDragStart={(e) => { drag.current = { plan: p }; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", p.id); }} onDragEnd={() => setOver(null)}
      onClick={(e) => { e.stopPropagation(); if (may) setForm({ ...p, employee_ids: [p.employee_id] }); }} title={`${p.person_name} · ${p.kind}${p.customer ? ` · ${p.customer}` : ""}${p.site ? ` · ${p.site}` : ""}${p.notes ? `\n${p.notes}` : ""}`}
      className="rounded px-1.5 py-0.5 mb-0.5 truncate" style={{ fontSize: small ? 10.5 : 11.5, background: "#fff", border: `1px solid ${LINE}`, borderLeft: `3px solid ${ink.get(p.employee_id) || NAVY}`, cursor: may ? "grab" : "default", textDecoration: p.status === "cancelled" ? "line-through" : undefined, opacity: p.status === "cancelled" ? 0.5 : 1 }}>
      {p.status === "done" ? "✓ " : p.status === "missed" ? "✗ " : ""}{KIND_ICON[p.kind] || "•"} {small ? <b style={{ color: ink.get(p.employee_id) }}>{ini(p.person_name)} </b> : null}{p.customer || p.kind}
    </div>
  );
  const DueChip = ({ x }: { x: Due }) => (
    <div draggable={may && !x.covered_by} onDragStart={(e) => { drag.current = { due: x }; e.dataTransfer.effectAllowed = "copy"; e.dataTransfer.setData("text/plain", x.amc_id); }} onDragEnd={() => setOver(null)}
      onClick={(e) => { e.stopPropagation(); if (!x.covered_by) newPlan(x.on_date, undefined, x); }} title={`${x.customer} — AMC visit ${x.visit_no} of ${x.visits}, due ${fmt(x.due_on, { day: "numeric", month: "short" })} (window to ${fmt(x.window_to, { day: "numeric", month: "short" })})${x.covered_by ? `\nPlanned: ${x.covered_by.person_name} on ${fmt(x.covered_by.on_date, { day: "numeric", month: "short" })}` : may ? "\nDrag it on to a person's day, or click to plan it" : ""}`}
      className="rounded px-1.5 py-0.5 mb-0.5 truncate" style={{ fontSize: 10.5, fontWeight: 700, background: x.covered_by ? "#DCFCE7" : "#FFEDD5", color: x.covered_by ? GREEN : "#9A3412", cursor: !x.covered_by && may ? "pointer" : "default" }}>
      {x.covered_by ? "✓" : "⏰"} AMC · {x.customer} <span style={{ fontWeight: 600, opacity: 0.75 }}>· due {fmt(x.due_on, { day: "numeric", month: "short" })}{x.covered_by ? ` · ${first(x.covered_by.person_name)} ${fmt(x.covered_by.on_date, { day: "numeric", month: "short" })}` : ""}</span>
    </div>
  );

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <h2 className="font-bold" style={{ fontSize: 20, color: NAVY }}>Service Team Plan Deployment</h2>
        {d && !may && <span className="text-xs" style={{ color: MUTED }}>Aakash or Yash makes the plan — you see it.</span>}
        <span className="ml-auto" />
        {(["day", "week", "month", "quarter"] as View[]).map((v) => <button key={v} onClick={() => setView(v)} style={btn(view === v ? "primary" : "soft")}>{v === "day" ? "Daily" : v === "week" ? "Weekly" : v === "month" ? "Monthly" : "Quarterly"}</button>)}
      </div>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <button onClick={() => setAnchor(step(view, anchor, -1))} style={btn()}>◀</button>
        <button onClick={() => setAnchor(todayIst())} style={btn()}>Today</button>
        <button onClick={() => setAnchor(step(view, anchor, 1))} style={btn()}>▶</button>
        <b style={{ color: NAVY, fontSize: 15, marginLeft: 6 }}>{label}</b>
        <span className="ml-auto" />
        <label className="text-xs flex items-center gap-1" style={{ color: MUTED }}><input type="checkbox" checked={showDue} onChange={(e) => setShowDue(e.target.checked)} /> AMC due on the calendar</label>
        {flash && <span className="text-xs font-bold" style={{ color: GREEN }}>{flash}</span>}
        {may && <span className="text-xs" style={{ color: MUTED }}>drag an AMC due on to a person · drag a plan to move it</span>}
        {may && <button onClick={() => newPlan(view === "day" ? from : todayIst() >= from && todayIst() <= to ? todayIst() : from, who || undefined)} style={btn("primary")}>+ Plan</button>}
      </div>

      {/* THE SERVICE PEOPLE, ON TOP */}
      <div className="flex gap-1.5 flex-wrap mb-3">
        <button onClick={() => setWho("")} className="rounded-full px-3 py-1 text-xs font-bold" style={{ background: who === "" ? NAVY : "#fff", color: who === "" ? "#fff" : NAVY, border: `1px solid ${LINE}` }}>Everyone · {d?.team.length ?? "…"}</button>
        {(d?.team || []).map((p) => {
          const n = (d?.plans || []).filter((x) => x.employee_id === p.id && x.status !== "cancelled").length;
          return (
            <button key={p.id} onClick={() => setWho(who === p.id ? "" : p.id)} title={`${p.name} — ${p.designation || ""}`} className="rounded-full pl-1 pr-2.5 py-0.5 text-xs font-semibold flex items-center gap-1.5" style={{ background: who === p.id ? ink.get(p.id) : "#fff", color: who === p.id ? "#fff" : NAVY, border: `1px solid ${who === p.id ? ink.get(p.id) : LINE}` }}>
              <span className="rounded-full flex items-center justify-center font-bold" style={{ width: 22, height: 22, fontSize: 9.5, background: ink.get(p.id), color: "#fff" }}>{ini(p.name)}</span>
              {first(p.name)}{n ? <span style={{ opacity: 0.7 }}>· {n}</span> : null}
            </button>
          );
        })}
      </div>

      {!d && <div className="text-sm" style={{ color: MUTED }}>Reading…</div>}
      {d && d.installed === false && <div className="text-sm font-bold" style={{ color: RED }}>Run migration 0225 first — the plan has nowhere to live yet.</div>}
      {d && d.installed !== false && (
        <div className="grid gap-3" style={{ gridTemplateColumns: "minmax(0, 1fr) 280px" }}>
          <div style={{ minWidth: 0 }}>
            {(view === "day" || view === "week") && <Roster d={d} days={daysOf(from, to)} plans={plans} dues={dues} who={who} ink={ink} may={may} onAdd={newPlan} Chip={Chip} DueChip={DueChip} dnd={dnd} over={over} />}
            {view === "month" && <Month from={from} to={to} today={d.today} plans={plans} dues={dues} may={may} onDay={(x) => { setAnchor(x); setView("day"); }} onAdd={(x) => newPlan(x, who || undefined)} Chip={Chip} DueChip={DueChip} dnd={dnd} over={over} />}
            {view === "quarter" && <Quarter from={from} to={to} today={d.today} plans={plans} dues={dues} onDay={(x) => { setAnchor(x); setView("day"); }} />}
          </div>
          <Side d={d} dues={d.due} may={may} onPlan={(x) => newPlan(x.on_date, undefined, x)} />
        </div>
      )}
      <style>{`@media (max-width: 1000px){ .seva-plan-side { display: none } }`}</style>
      {form && d && <PlanForm d={d} f={form} onClose={(changed) => { setForm(null); if (changed) load(); }} />}
    </div>
  );
}

type ChipT = (p: { p: Plan; small?: boolean }) => React.JSX.Element;
type DueT = (p: { x: Due }) => React.JSX.Element;

/** THE ROSTER — people down the side, days across; the AMC dues in a row of their own on top */
type DndT = (key: string, on_date: string, employee_id?: string) => Record<string, unknown>;
function Roster({ d, days, plans, dues, who, ink, may, onAdd, Chip, DueChip, dnd, over }: { d: D; days: string[]; plans: Plan[]; dues: Due[]; who: string; ink: Map<string, string>; may: boolean; onAdd: (day: string, id?: string) => void; Chip: ChipT; DueChip: DueT; dnd: DndT; over: string | null }) {
  const people = d.team.filter((p) => !who || p.id === who);
  const wide = days.length === 1;
  /* the AMC row folds — a busy week would push the people off the screen */
  const [allDue, setAllDue] = useState(false);
  const CAP = wide ? 12 : 5;
  return (
    <div className="rounded-lg bg-white" style={{ border: `1px solid ${LINE}`, overflow: "auto", maxHeight: "70vh" }}>
      <table className="genie-table" style={{ minWidth: wide ? 520 : 980, tableLayout: "fixed" }}>
        <thead><tr>
          <th style={{ width: 170, position: "sticky", left: 0, top: 0, zIndex: 3 }}>Person</th>
          {days.map((x) => <th key={x} style={{ position: "sticky", top: 0, zIndex: 2, background: x === d.today ? "var(--accent)" : undefined }}>{fmt(x, { weekday: "short", day: "numeric", month: "short" })}</th>)}
        </tr></thead>
        <tbody>
          {dues.length > 0 && (
            <tr>
              <td style={{ position: "sticky", left: 0, background: "#FFFBF5", fontWeight: 800, color: "#9A3412", fontSize: 12 }}>AMC due</td>
              {days.map((x) => { const us = dues.filter((u) => u.on_date === x).sort((a, b) => Number(!!a.covered_by) - Number(!!b.covered_by)); return (
                <td key={x} style={{ verticalAlign: "top", background: "#FFFBF5" }}>
                  <div style={wide ? { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 2 } : undefined}>{(allDue ? us : us.slice(0, CAP)).map((u) => <DueChip key={u.amc_id + u.visit_no} x={u} />)}</div>
                  {us.length > CAP && <button onClick={() => setAllDue((v) => !v)} style={{ fontSize: 10.5, fontWeight: 700, color: "#9A3412" }}>{allDue ? "fold" : `+${us.length - CAP} more`}</button>}
                </td>); })}
            </tr>
          )}
          {people.map((p) => (
            <tr key={p.id}>
              <td style={{ position: "sticky", left: 0, background: "#fff", borderLeft: `4px solid ${ink.get(p.id)}` }}><b style={{ fontSize: 12.5 }}>{p.name}</b><div style={{ fontSize: 10.5, color: MUTED }}>{p.designation}</div></td>
              {days.map((x) => {
                const ps = plans.filter((q) => q.on_date === x && q.employee_id === p.id);
                const backs = plans.filter((q) => q.on_date === x && q.backup_id === p.id);
                return (
                  <td key={x} onClick={() => may && onAdd(x, p.id)} {...dnd(`${p.id}|${x}`, x, p.id)} style={{ verticalAlign: "top", cursor: may ? "copy" : "default", background: over === `${p.id}|${x}` ? "#DBEAFE" : x === d.today ? "#FFFBF5" : undefined, outline: over === `${p.id}|${x}` ? "2px dashed #1D4ED8" : undefined, height: 44 }}>
                    {ps.map((q) => wide ? <div key={q.id}><Chip p={q} />{(q.site || q.notes) && <div style={{ fontSize: 11, color: MUTED, margin: "0 0 4px 6px" }}>{[q.site, q.notes].filter(Boolean).join(" · ")}</div>}</div> : <Chip key={q.id} p={q} />)}
                    {backs.map((q) => <div key={q.id + "b"} className="truncate" style={{ fontSize: 10.5, color: MUTED }}>backup · {q.customer || q.kind}</div>)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Month({ from, to, today, plans, dues, may, onDay, onAdd, Chip, DueChip, dnd, over }: { from: string; to: string; today: string; plans: Plan[]; dues: Due[]; may: boolean; onDay: (d: string) => void; onAdd: (d: string) => void; Chip: ChipT; DueChip: DueT; dnd: DndT; over: string | null }) {
  const lead = (at(from).getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [...Array(lead).fill(null), ...daysOf(from, to)];
  while (cells.length % 7) cells.push(null);
  return (
    <div className="rounded-lg bg-white" style={{ border: `1px solid ${LINE}` }}>
      <div className="grid" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((w) => <div key={w} className="text-xs font-bold px-2 py-1" style={{ color: MUTED, borderBottom: `1px solid ${LINE}` }}>{w}</div>)}
        {cells.map((x, i) => {
          if (!x) return <div key={i} style={{ minHeight: 110, borderRight: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}`, background: "#FAFAF8" }} />;
          const ps = plans.filter((p) => p.on_date === x); const us = dues.filter((u) => u.on_date === x);
          return (
            <div key={x} {...dnd(`m|${x}`, x)} style={{ minHeight: 110, borderRight: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}`, padding: 4, background: over === `m|${x}` ? "#DBEAFE" : x === today ? "#FFF7ED" : undefined, outline: over === `m|${x}` ? "2px dashed #1D4ED8" : undefined }}>
              <div className="flex items-center mb-0.5">
                <button onClick={() => onDay(x)} className="font-bold text-xs hover:underline" style={{ color: x === today ? ORANGE : NAVY }}>{Number(x.slice(8))}</button>
                {may && <button onClick={() => onAdd(x)} className="ml-auto text-xs font-bold" style={{ color: MUTED }} title="Plan on this day">+</button>}
              </div>
              {us.slice(0, 2).map((u) => <DueChip key={u.amc_id + u.visit_no} x={u} />)}
              {us.length > 2 && <div style={{ fontSize: 10, color: "#9A3412", fontWeight: 700 }}>+{us.length - 2} more AMC due</div>}
              {ps.slice(0, 4).map((p) => <Chip key={p.id} p={p} small />)}
              {ps.length > 4 && <button onClick={() => onDay(x)} style={{ fontSize: 10.5, color: MUTED }}>+{ps.length - 4} more</button>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Quarter({ from, to, today, plans, dues, onDay }: { from: string; to: string; today: string; plans: Plan[]; dues: Due[]; onDay: (d: string) => void }) {
  const months: string[] = []; for (let m = from; m <= to; m = iso(new Date(Date.UTC(at(m).getUTCFullYear(), at(m).getUTCMonth() + 1, 1)))) months.push(m);
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
      {months.map((m) => {
        const last = iso(new Date(Date.UTC(at(m).getUTCFullYear(), at(m).getUTCMonth() + 1, 0)));
        const lead = (at(m).getUTCDay() + 6) % 7; const cells: (string | null)[] = [...Array(lead).fill(null), ...daysOf(m, last)];
        const mp = plans.filter((p) => p.on_date >= m && p.on_date <= last && p.status !== "cancelled"); const md = dues.filter((u) => u.on_date >= m && u.on_date <= last);
        return (
          <div key={m} className="rounded-lg bg-white p-2" style={{ border: `1px solid ${LINE}` }}>
            <div className="flex items-baseline mb-1"><b style={{ color: NAVY }}>{fmt(m, { month: "long" })}</b><span className="ml-auto text-xs" style={{ color: MUTED }}>{mp.length} planned · <span style={{ color: "#9A3412" }}>{md.filter((u) => !u.covered_by).length} AMC open</span></span></div>
            <div className="grid" style={{ gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
              {["M", "T", "W", "T", "F", "S", "S"].map((w, i) => <div key={i} className="text-center" style={{ fontSize: 10, color: MUTED }}>{w}</div>)}
              {cells.map((x, i) => {
                if (!x) return <div key={i} />;
                const n = mp.filter((p) => p.on_date === x).length; const u = md.filter((q) => q.on_date === x && !q.covered_by).length;
                return (
                  <button key={x} onClick={() => onDay(x)} title={`${n} planned${u ? ` · ${u} AMC due, not planned` : ""}`} className="rounded text-center" style={{ fontSize: 11, padding: "3px 0", background: n ? `rgba(29,78,216,${Math.min(0.15 + n * 0.12, 0.85)})` : "#F5F5F2", color: n > 3 ? "#fff" : NAVY, outline: x === today ? `2px solid ${ORANGE}` : undefined, position: "relative" }}>
                    {Number(x.slice(8))}{u ? <span style={{ position: "absolute", top: 1, right: 2, width: 6, height: 6, borderRadius: 6, background: ORANGE }} /> : null}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Side({ d, dues, may, onPlan }: { d: D; dues: Due[]; may: boolean; onPlan: (x: Due) => void }) {
  const open = dues.filter((u) => !u.covered_by);
  return (
    <div className="seva-plan-side grid gap-3" style={{ alignSelf: "start" }}>
      <div className="rounded-lg bg-white p-3" style={{ border: `1px solid ${LINE}` }}>
        <div className="font-bold text-sm" style={{ color: "#9A3412" }}>AMC due in this view · {open.length} to plan</div>
        <div className="text-xs mb-1" style={{ color: MUTED }}>{dues.length - open.length} of {dues.length} planned</div>
        <div style={{ maxHeight: 300, overflowY: "auto" }}>
          {open.map((u) => (
            <div key={u.amc_id + u.visit_no} className="text-xs py-1" style={{ borderBottom: `1px dotted ${LINE}` }}>
              <b>{u.customer}</b> <span style={{ color: MUTED }}>· visit {u.visit_no}/{u.visits} · due {fmt(u.due_on, { day: "numeric", month: "short" })}{u.location ? ` · ${u.location}` : ""}</span>
              {may && <button onClick={() => onPlan(u)} className="ml-1 font-bold" style={{ color: ORANGE }}>Plan →</button>}
            </div>
          ))}
          {open.length === 0 && <div className="text-xs" style={{ color: GREEN }}>Every AMC visit due here is planned.</div>}
        </div>
      </div>
      <div className="rounded-lg bg-white p-3" style={{ border: `1px solid ${LINE}` }}>
        <div className="font-bold text-sm" style={{ color: RED }}>AMC ending in 30 days · {d.expiring.length}</div>
        <div className="text-xs mb-1" style={{ color: MUTED }}>Time for the renewal quotation.</div>
        {d.expiring.map((a) => <div key={a.id} className="text-xs py-1" style={{ borderBottom: `1px dotted ${LINE}` }}><b>{a.customer}</b> <span style={{ color: MUTED }}>· ends {fmt(a.end_date, { day: "numeric", month: "short" })}{a.erp_name ? ` · ${a.erp_name}` : ""}</span></div>)}
        {d.expiring.length === 0 && <div className="text-xs" style={{ color: MUTED }}>None.</div>}
      </div>
    </div>
  );
}

function PlanForm({ d, f, onClose }: { d: D; f: Partial<Plan> & { employee_ids?: string[] }; onClose: (changed: boolean) => void }) {
  const [x, setX] = useState({ on_date: f.on_date || d.today, employee_ids: f.employee_ids || [], kind: f.kind || "AMC visit", customer: f.customer || "", site: f.site || "", amc_id: f.amc_id || "", issue: f.issue || "", backup_id: f.backup_id || "", notes: f.notes || "", status: f.status || "planned" });
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const toggle = (id: string) => setX({ ...x, employee_ids: f.id ? [id] : x.employee_ids.includes(id) ? x.employee_ids.filter((i) => i !== id) : [...x.employee_ids, id] });
  const save = async () => { setErr(null); setBusy(true); try { await post({ action: "save", id: f.id, ...x }); onClose(true); } catch (e) { setErr(String((e as Error).message)); } setBusy(false); };
  const remove = async () => { if (!f.id || !confirm("Take this off the plan?")) return; await post({ action: "remove", id: f.id }); onClose(true); };
  const customers = [...new Set(d.due.map((u) => u.customer))].sort();
  return (
    <div onClick={() => onClose(false)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="rounded-xl" style={{ width: "min(720px, 100%)", maxHeight: "92vh", overflowY: "auto", background: "var(--paper)", padding: 18 }}>
        <div className="flex items-center mb-3"><b style={{ fontSize: 17, color: NAVY }}>{f.id ? "Change the plan" : "Plan"}</b><button onClick={() => onClose(false)} className="ml-auto" style={btn("ghost")}>✕</button></div>
        <div className="grid gap-2" style={{ gridTemplateColumns: "160px 1fr" }}>
          <div><label style={lbl}>Day</label><input type="date" style={inp} value={x.on_date} onChange={(e) => setX({ ...x, on_date: e.target.value })} /></div>
          <div><label style={lbl}>What</label><select style={inp} value={x.kind} onChange={(e) => setX({ ...x, kind: e.target.value })}>{d.kinds.map((k) => <option key={k}>{k}</option>)}</select></div>
        </div>
        <label style={{ ...lbl, marginTop: 10 }}>Who goes{f.id ? "" : " — pick one or more"}</label>
        <div className="flex gap-1 flex-wrap">
          {d.team.map((p) => <button key={p.id} onClick={() => toggle(p.id)} className="rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: x.employee_ids.includes(p.id) ? NAVY : "#fff", color: x.employee_ids.includes(p.id) ? "#fff" : NAVY, border: `1px solid ${LINE}` }}>{p.name}</button>)}
        </div>
        <div className="grid gap-2 mt-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div><label style={lbl}>Customer</label><input list="seva-plan-customers" style={inp} value={x.customer} onChange={(e) => setX({ ...x, customer: e.target.value })} /><datalist id="seva-plan-customers">{customers.map((c) => <option key={c} value={c} />)}</datalist></div>
          <div><label style={lbl}>Site</label><input style={inp} value={x.site} onChange={(e) => setX({ ...x, site: e.target.value })} placeholder="Navi Mumbai, Rabale MIDC" /></div>
          <div><label style={lbl}>AMC</label><select style={inp} value={x.amc_id} onChange={(e) => { const u = d.due.find((q) => q.amc_id === e.target.value); setX({ ...x, amc_id: e.target.value, customer: x.customer || u?.customer || "", site: x.site || u?.location || "" }); }}><option value="">— not an AMC visit —</option>{[...new Map(d.due.map((u) => [u.amc_id, u])).values()].map((u) => <option key={u.amc_id} value={u.amc_id}>{u.customer}{u.erp_name ? ` · ${u.erp_name}` : ""}</option>)}</select></div>
          <div><label style={lbl}>Ticket (ISS-…)</label><input style={inp} value={x.issue} onChange={(e) => setX({ ...x, issue: e.target.value })} /></div>
          <div><label style={lbl}>Backup technician</label><select style={inp} value={x.backup_id} onChange={(e) => setX({ ...x, backup_id: e.target.value })}><option value="">—</option>{d.team.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          {f.id && <div><label style={lbl}>Status</label><select style={inp} value={x.status} onChange={(e) => setX({ ...x, status: e.target.value })}>{["planned", "done", "missed", "cancelled"].map((s) => <option key={s}>{s}</option>)}</select></div>}
        </div>
        <label style={{ ...lbl, marginTop: 10 }}>Notes</label>
        <textarea style={{ ...inp, minHeight: 60 }} value={x.notes} onChange={(e) => setX({ ...x, notes: e.target.value })} />
        {err && <div className="text-sm font-bold mt-2" style={{ color: RED }}>{err}</div>}
        <div className="flex gap-2 mt-3">
          <button onClick={save} disabled={busy} style={btn("primary")}>{busy ? "Saving…" : f.id ? "Save" : `Put on the plan${x.employee_ids.length > 1 ? ` (${x.employee_ids.length} people)` : ""}`}</button>
          <button onClick={() => onClose(false)} style={btn("ghost")}>Cancel</button>
          {f.id && <button onClick={remove} className="ml-auto" style={{ ...btn("ghost"), color: RED }}>Remove</button>}
        </div>
      </div>
    </div>
  );
}
