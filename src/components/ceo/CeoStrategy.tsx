"use client";
/**
 * STRATEGY — THE STRATEGIC ACTION (Dr Raghu, 14 Oct 2026: "this strategy
 * doesn't need this kind of numbers, it needs the strategic action. As a world
 * class coach what would you put on this page?").
 *
 * A coach's one page, from top to bottom: where we are going (Breakthrough
 * 2027, word for word); are we on pace for this year; the ten conditions of
 * the Management System, each with one owner, a colour and this week's note —
 * the weekly review in one table; the ten Critical Success Factors the same
 * way; this quarter's rocks — each leader's 99-day plan; the decisions the
 * council still owes; what the council backs to start, stop and continue; and
 * the rhythm of review. Every line can be changed by the three who see it.
 */
import { useEffect, useState } from "react";
import { C } from "@/components/ceo/ui";
import { cr } from "@/components/ceo/Drill";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Cond = { id: string; kind: "nms" | "csf"; title: string; owner_email: string | null; status: "green" | "amber" | "red" | "grey"; note: string; reviewed_at: string | null; reviewed_by: string | null };
const RAG: Record<string, { bg: string; fg: string; label: string }> = { green: { bg: "#ECFDF3", fg: C.green, label: "On track" }, amber: { bg: "#FFFAEB", fg: C.amber, label: "At risk" }, red: { bg: "#FEF3F2", fg: C.red, label: "Off track" }, grey: { bg: "#F2F4F7", fg: C.muted, label: "Not reviewed" } };
const dmy = (d?: string | null) => (d ? new Date(String(d).slice(0, 10) + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" }) : "—");
const box: React.CSSProperties = { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, boxShadow: "0 1px 3px rgba(16,24,40,.06)" };
async function post(body: unknown) { const r = await fetch("/api/ceo/strategy", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "Failed"); return j; }

function Line({ k, v, label, onSaved, big }: { k: string; v: string; label: string; onSaved: () => void; big?: boolean }) {
  const [edit, setEdit] = useState(false); const [x, setX] = useState(v);
  useEffect(() => setX(v), [v]);
  return (
    <div>
      <div className="text-xs font-semibold" style={{ color: "rgba(255,255,255,.65)", letterSpacing: 0.6 }}>{label}</div>
      {edit ? (
        <div className="flex gap-1 mt-1"><input autoFocus value={x} onChange={(e) => setX(e.target.value)} onKeyDown={async (e) => { if (e.key === "Enter") { await post({ action: "set", key: k, value: x }); setEdit(false); onSaved(); } if (e.key === "Escape") setEdit(false); }} style={{ flex: 1, borderRadius: 6, padding: "4px 8px", color: C.ink, fontSize: 14 }} /></div>
      ) : (
        <div onClick={() => setEdit(true)} title="Click to change" style={{ cursor: "text", fontWeight: 700, fontSize: big ? 22 : 15, lineHeight: 1.3, color: "#fff" }}>{v || <span style={{ opacity: 0.5 }}>write it</span>}</div>
      )}
    </div>
  );
}

function Bar({ label, actual, target, expected, fmt, good = "up", sub }: { label: string; actual: number | null; target: number; expected?: number; fmt: (n: number) => string; good?: "up" | "down"; sub?: string }) {
  const has = actual !== null && Number.isFinite(actual);
  const pct = has && target ? Math.min(100, (Number(actual) / target) * 100) : 0;
  const mark = expected && target ? Math.min(100, (expected / target) * 100) : null;
  const okNow = !has ? null : expected !== undefined ? (good === "up" ? Number(actual) >= expected : Number(actual) <= expected) : (good === "up" ? Number(actual) >= target : Number(actual) <= target);
  const tone = okNow === null ? C.muted : okNow ? C.green : Number(actual) >= (expected ?? target) * 0.85 && good === "up" ? C.amber : C.red;
  return (
    <div style={{ ...box, padding: 16 }}>
      <div className="flex items-baseline gap-2"><div className="text-sm font-semibold" style={{ color: C.ink }}>{label}</div><span className="ml-auto text-xs font-bold rounded-full px-2 py-0.5" style={{ background: `${tone}18`, color: tone }}>{okNow === null ? "not measured" : okNow ? "on pace" : "behind"}</span></div>
      <div className="flex items-baseline gap-2 mt-1"><span className="font-bold tnum" style={{ fontSize: 20, color: C.ink, whiteSpace: "nowrap" }}>{has ? fmt(Number(actual)) : "—"}</span><span className="text-xs" style={{ color: C.muted }}>of {fmt(target)}</span></div>
      <div style={{ position: "relative", height: 8, background: C.bg, borderRadius: 4, marginTop: 8 }}>
        <div style={{ width: `${pct}%`, height: 8, background: tone, borderRadius: 4 }} />
        {mark !== null && <div title="where we should be today" style={{ position: "absolute", left: `${mark}%`, top: -3, width: 2, height: 14, background: C.ink }} />}
      </div>
      {sub && <div className="text-xs mt-1.5" style={{ color: C.muted }}>{sub}</div>}
    </div>
  );
}

function Conditions({ title, hint, rows, members, onChange }: { title: string; hint: string; rows: Cond[]; members: { email: string; name: string }[]; onChange: () => void }) {
  const [add, setAdd] = useState("");
  const counts = { green: rows.filter((r) => r.status === "green").length, amber: rows.filter((r) => r.status === "amber").length, red: rows.filter((r) => r.status === "red").length, grey: rows.filter((r) => r.status === "grey").length };
  const save = async (id: string, patch: Record<string, unknown>) => { try { await post({ action: "condition", id, ...patch }); onChange(); } catch (e) { alert(String((e as Error).message)); } };
  return (
    <div className="mb-6">
      <div className="flex items-baseline gap-2 mb-2 flex-wrap">
        <div className="text-sm font-semibold" style={{ color: C.ink }}>{title}</div><div className="text-xs" style={{ color: C.muted }}>{hint}</div>
        <span className="ml-auto" />
        {(["green", "amber", "red", "grey"] as const).map((k) => <span key={k} className="text-xs font-semibold rounded-full px-2 py-0.5" style={{ background: RAG[k].bg, color: RAG[k].fg }}>{counts[k]} {RAG[k].label.toLowerCase()}</span>)}
      </div>
      <div style={{ ...box, overflow: "auto" }}>
        <table className="genie-table" style={{ width: "100%", minWidth: 900 }}>
          <thead><tr><th style={{ width: 34 }}>#</th><th>Condition</th><th style={{ width: 190 }}>Owner</th><th style={{ width: 150 }}>Status</th><th>This week</th><th style={{ width: 110 }}>Reviewed</th></tr></thead>
          <tbody>{rows.map((r, i) => (
            <tr key={r.id}>
              <td className="tnum text-xs" style={{ color: C.muted }}>{i + 1}</td>
              <td className="font-semibold text-sm" style={{ color: C.ink }}>{r.title}</td>
              <td><select value={r.owner_email || ""} onChange={(e) => save(r.id, { owner_email: e.target.value })} style={{ border: `1px solid ${r.owner_email ? C.line : C.red}`, borderRadius: 6, padding: "3px 6px", fontSize: 12, width: "100%", background: "#fff", color: r.owner_email ? C.ink : C.red }}><option value="">— one owner —</option>{members.map((m) => <option key={m.email} value={m.email}>{m.name}</option>)}</select></td>
              <td><div className="flex gap-1">{(["green", "amber", "red"] as const).map((k) => <button key={k} onClick={() => save(r.id, { status: k })} title={RAG[k].label} style={{ width: 22, height: 22, borderRadius: 11, border: r.status === k ? `2px solid ${C.ink}` : `1px solid ${C.line}`, background: RAG[k].fg, opacity: r.status === k ? 1 : 0.35 }} />)}<span className="text-xs ml-1" style={{ color: RAG[r.status].fg, alignSelf: "center" }}>{RAG[r.status].label}</span></div></td>
              <td><input defaultValue={r.note} key={`${r.id}|${r.note}`} placeholder="what moved, what is stuck, what is next" onBlur={(e) => { if (e.target.value !== r.note) void save(r.id, { note: e.target.value }); }} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} style={{ width: "100%", border: `1px solid ${C.line}`, borderRadius: 6, padding: "3px 8px", fontSize: 12 }} /></td>
              <td className="text-xs tnum" style={{ color: r.reviewed_at && Date.now() - Date.parse(r.reviewed_at) > 8 * 864e5 ? C.red : C.muted }}>{dmy(r.reviewed_at)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="flex gap-1 mt-1.5"><input value={add} onChange={(e) => setAdd(e.target.value)} placeholder="+ add one" style={{ border: `1px solid ${C.line}`, borderRadius: 6, padding: "3px 8px", fontSize: 12, width: 280 }} onKeyDown={async (e) => { if (e.key === "Enter" && add.trim()) { await post({ action: "add", kind: rows[0]?.kind || "nms", title: add }); setAdd(""); onChange(); } }} /><span className="text-xs self-center" style={{ color: C.muted }}>A date older than a week turns red — the review is weekly.</span></div>
    </div>
  );
}

export function StrategyRoom() {
  const [d, setD] = useState<any>(null); const [err, setErr] = useState<string | null>(null);
  const load = () => fetch("/api/ceo/strategy", { cache: "no-store" }).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setD(j); }).catch((e) => setErr(String(e.message || e)));
  useEffect(() => { load(); }, []);
  if (err) return <div className="pt-5 text-sm font-bold" style={{ color: C.red }}>{err}</div>;
  if (!d) return <div className="pt-5 text-sm" style={{ color: C.muted }}>Reading the strategy…</div>;
  if (!d.installed) return <div className="pt-5 text-sm font-bold" style={{ color: C.red }}>Run migration 0232 first — the strategy page has nowhere to live yet.</div>;
  const kv = d.kv as Record<string, string>; const p = d.pace;
  const nms = (d.conditions as Cond[]).filter((c) => c.kind === "nms"), csf = (d.conditions as Cond[]).filter((c) => c.kind === "csf");
  return (
    <div className="pt-5">
      {/* WHERE WE ARE GOING */}
      <div className="rounded-2xl p-5 mb-5" style={{ background: `linear-gradient(135deg, ${C.navy} 0%, #26407A 100%)`, color: "#fff" }}>
        <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
          <Line k="north_star" v={kv.north_star} label="NORTH STAR" onSaved={load} big />
          <Line k="year_goal" v={kv.year_goal} label="THIS YEAR" onSaved={load} />
          <Line k="themes" v={kv.themes} label="THE YEAR'S THEMES" onSaved={load} big />
        </div>
        <div className="grid gap-5 mt-4 pt-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", borderTop: "1px solid rgba(255,255,255,.15)" }}>
          <Line k="motto" v={kv.motto} label="WHAT WE STAND FOR" onSaved={load} />
          <Line k="pillars" v={kv.pillars} label="EVERY DECISION IS FILTERED BY" onSaved={load} />
          <Line k="culture" v={kv.culture} label="THE ONE LINE OF THE CULTURE" onSaved={load} />
        </div>
      </div>

      {/* ARE WE ON PACE? */}
      <div className="flex items-baseline gap-2 mb-2"><div className="text-sm font-semibold" style={{ color: C.ink }}>Are we on pace for the year?</div><div className="text-xs" style={{ color: C.muted }}>{p ? `the books to ${dmy(p.books_to)} — ${Math.round(p.year_fraction * 100)}% of the year gone; the black tick is where we should be today` : ""}</div></div>
      {p && (
        <div className="grid gap-3 mb-6" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
          <Bar label="Sales" actual={p.sales} target={p.sales_target} expected={p.sales_expected} fmt={cr} sub={`at this pace the year ends at ${cr(p.sales_projected)}`} />
          <Bar label="PBT %" actual={p.pbt_pct} target={p.pbt_pct_target} fmt={(n) => `${n.toFixed(1)}%`} sub={`${cr(p.pbt)} profit before tax so far`} />
          <Bar label="Exports" actual={p.exports} target={p.exports_target} expected={p.exports_expected} fmt={cr} sub={p.exports ? "the Export Sales and Deemed Exports ledgers in Tally" : "no sales booked to an export ledger yet"} />
          <Bar label="On-time delivery" actual={p.otd_pct} target={p.otd_target} fmt={(n) => `${Math.round(n)}%`} sub={p.otd_jobs ? `${p.otd_on_time} of ${p.otd_jobs} delivered by their OTD date (else target date) this year` : "no dated delivery yet"} />
          <div style={{ ...box, padding: 16 }}>
            <div className="text-sm font-semibold" style={{ color: C.ink }}>Founder time on operations</div>
            <div className="flex items-baseline gap-2 mt-1"><input defaultValue={kv.founder_hours} key={kv.founder_hours} placeholder="hrs" onBlur={async (e) => { if (e.target.value !== kv.founder_hours) { await post({ action: "set", key: "founder_hours", value: e.target.value }); load(); } }} style={{ width: 70, border: `1px solid ${C.line}`, borderRadius: 6, padding: "2px 6px", fontSize: 18, fontWeight: 700 }} /><span className="text-xs" style={{ color: C.muted }}>hours a day, against under {kv.target_founder_hours}</span></div>
            <div className="text-xs mt-2" style={{ color: p.founder_hours === null ? C.muted : p.founder_hours <= p.founder_target ? C.green : C.red }}>{p.founder_hours === null ? "write this week's average" : p.founder_hours <= p.founder_target ? "within the target" : "over the target"}</div>
          </div>
        </div>
      )}

      <Conditions title="The ten of the Management System" hint="the operating conditions — each with one owner and a weekly review" rows={nms} members={d.members} onChange={load} />
      <Conditions title="The ten Critical Success Factors" hint="the company-wide conditions" rows={csf} members={d.members} onChange={load} />

      {/* THIS QUARTER'S ROCKS */}
      <div className="flex items-baseline gap-2 mb-2"><div className="text-sm font-semibold" style={{ color: C.ink }}>This quarter&apos;s rocks</div><div className="text-xs" style={{ color: C.muted }}>each leader&apos;s plan for the next 99 days, from the Leaders Check-in</div></div>
      <div className="grid gap-3 mb-6" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
        {d.rocks.map((r: any) => (
          <a key={r.email} href={`/lc#meetings/${r.meeting_id}`} target="_blank" rel="noreferrer" style={{ ...box, padding: 14, textDecoration: "none", color: C.ink }}>
            <div className="flex items-baseline"><b>{r.name}</b><span className="ml-auto text-xs" style={{ color: C.muted }}>{dmy(r.on_date)} ↗</span></div>
            <div className="text-xs mt-1.5" style={{ whiteSpace: "pre-wrap", lineHeight: 1.5, color: "#344054" }}>{String(r.plan_99).slice(0, 600)}</div>
          </a>
        ))}
        {d.rocks.length === 0 && <div className="text-sm" style={{ color: C.muted }}>No leader has written a 99-day plan yet.</div>}
      </div>

      <div className="grid gap-4 mb-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))" }}>
        {/* THE DECISIONS WAITING */}
        <div>
          <div className="flex items-baseline gap-2 mb-2"><div className="text-sm font-semibold" style={{ color: C.ink }}>Decisions the council owes</div><div className="text-xs" style={{ color: C.muted }}>the Solution Board — blocked first, then the oldest</div></div>
          <div style={{ ...box, overflow: "hidden" }}>
            {d.decisions.map((x: any) => (
              <a key={x.id} href={`/lc#solutions/${x.id}`} target="_blank" rel="noreferrer" className="flex items-start gap-2 px-3 py-2" style={{ borderBottom: `1px solid ${C.line}`, textDecoration: "none", color: C.ink }}>
                <span className="text-xs font-bold rounded-full px-2 py-0.5 flex-shrink-0" style={{ background: x.status === "needs_deep_dive" ? "#FEF3F2" : "#F2F4F7", color: x.status === "needs_deep_dive" ? C.red : C.muted }}>{x.status === "needs_deep_dive" ? "blocked" : x.status === "new" ? "new" : "in hand"}</span>
                <span className="text-sm flex-1">{x.title}</span>
                <span className="text-xs tnum flex-shrink-0" style={{ color: x.overdue ? C.red : C.muted }}>{x.age} d{x.overdue ? " · overdue" : ""} ↗</span>
              </a>
            ))}
            {d.decisions.length === 0 && <div className="text-sm p-3" style={{ color: C.muted }}>Nothing waiting.</div>}
          </div>
        </div>
        {/* START · STOP · CONTINUE */}
        <div>
          <div className="flex items-baseline gap-2 mb-2"><div className="text-sm font-semibold" style={{ color: C.ink }}>What the council backs</div><div className="text-xs" style={{ color: C.muted }}>start · stop · continue — the most supported</div></div>
          <div className="grid gap-2">
            {(["start", "stop", "continue"] as const).map((k) => (
              <div key={k} style={{ ...box, padding: 12 }}>
                <div className="text-xs font-bold mb-1" style={{ color: k === "start" ? C.green : k === "stop" ? C.red : C.brand, letterSpacing: 0.6 }}>{k.toUpperCase()}</div>
                {(d.backed[k] || []).map((x: any) => <a key={x.id} href="/lc#ssc" target="_blank" rel="noreferrer" className="flex gap-2 text-sm py-0.5 hover:underline" style={{ color: C.ink, textDecoration: "none" }}><span className="flex-1">{x.title}</span><span className="text-xs tnum" style={{ color: C.muted }}>👍 {x.score}</span></a>)}
                {(d.backed[k] || []).length === 0 && <div className="text-xs" style={{ color: C.muted }}>none yet</div>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* THE RHYTHM */}
      <div style={{ ...box, padding: 14 }} className="flex gap-6 flex-wrap text-sm">
        <div><span style={{ color: C.muted }}>Last council meeting </span><b>{d.rhythm.last ? dmy(d.rhythm.last.held_on) : "—"}</b></div>
        <div><span style={{ color: C.muted }}>Next </span><b style={{ color: d.rhythm.next ? C.ink : C.red }}>{d.rhythm.next ? dmy(d.rhythm.next.held_on) : "not set — fix the date"}</b></div>
        <div><span style={{ color: C.muted }}>Conditions last reviewed </span><b>{dmy(d.rhythm.last_review)}</b></div>
        <a href="/lc#philosophy" target="_blank" rel="noreferrer" className="ml-auto font-semibold" style={{ color: C.brand }}>The philosophy pages ↗</a>
      </div>
    </div>
  );
}
