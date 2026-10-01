"use client";
import { useEffect, useMemo, useState } from "react";
import { api, Avatar, btn, Card, dmy, input, K, label, monthYear, pill, serif, type Boot } from "./shared";

interface Goal { id: string; set_id: string; member_id: string; kind: string; seq: number; title: string; status: string; progress: number }
interface GoalSet { id: string; member_id: string; year_label: string; created_at: string; failed_last?: string | null; start_doing?: string | null; stop_doing?: string | null; one_thing?: string | null; accountable_to?: string | null; support_needed?: string | null }
interface Update { id: string; goal_id: string; checkin_id: string | null; member_id: string; period: string; note: string | null; status: string | null }
interface Data { goals: Goal[]; sets: GoalSet[]; updates: Update[] }
const STATUS: Record<string, [string, string]> = { on_track: ["On track", K.green], behind: ["Behind", K.ember], done: ["Done", K.blue], dropped: ["Dropped", K.muted] };
const thisYear = () => { const d = new Date(); const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; return `${y}-${String((y + 1) % 100).padStart(2, "0")}`; };

/** Goals: each member's set for the year, the monthly word on each goal from the check-ins, and the form to set them. */
export default function Goals({ boot, arg, go }: { boot: Boot; arg: string | null; go: (k: string, a?: string | null) => void }) {
  const [d, setD] = useState<Data | null>(null);
  const [who, setWho] = useState(arg || boot.me.id);
  const [year, setYear] = useState(thisYear());
  const [editing, setEditing] = useState(false);
  const load = () => api<{ goals: Goal[]; sets: (GoalSet & Record<string, unknown>)[]; updates: Update[] }>("/api/kindle/checkins").then((r) => setD({ goals: r.goals, sets: r.sets as GoalSet[], updates: r.updates })).catch(() => setD({ goals: [], sets: [], updates: [] }));
  useEffect(() => { load(); }, []);
  const years = useMemo(() => { const s = new Set<string>((d?.sets || []).map((x) => x.year_label)); s.add(thisYear()); return [...s].sort().reverse(); }, [d]);
  const set = d?.sets.find((s) => s.member_id === who && s.year_label === year) || null;
  const goals = set ? d!.goals.filter((g) => g.set_id === set.id).sort((a, b) => (a.kind === "personal" ? 1 : 0) - (b.kind === "personal" ? 1 : 0) || a.seq - b.seq) : [];
  const m = boot.members.find((x) => x.id === who);
  const mayEdit = who === boot.me.id || boot.me.admin;
  if (!d) return <Card><span style={{ color: K.muted }}>Loading…</span></Card>;
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ ...serif, fontSize: 26, margin: 0 }}>Goals</h1>
        <select value={year} onChange={(e) => { setYear(e.target.value); setEditing(false); }} style={{ ...input, width: "auto", padding: "6px 10px", fontSize: 13 }}>{years.map((y) => <option key={y}>{y}</option>)}</select>
        <div style={{ flex: 1 }} />
        {mayEdit && !editing && <button onClick={() => setEditing(true)} style={btn(set ? "ghost" : "primary")}>{set ? "Edit goals" : `Set ${year} goals`}</button>}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {boot.members.filter((x) => x.active).map((x) => { const has = d.sets.some((s) => s.member_id === x.id && s.year_label === year); return <button key={x.id} onClick={() => { setWho(x.id); setEditing(false); go("goals", x.id); }} style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${who === x.id ? K.ember : K.line}`, background: who === x.id ? "#fde7cf" : "#fff", borderRadius: 999, padding: "4px 12px 4px 4px", cursor: "pointer", fontSize: 13, fontWeight: who === x.id ? 700 : 500, opacity: has ? 1 : 0.6 }}><Avatar m={x} size={28} />{x.short_name || x.name}{!has && <span style={{ fontSize: 10, color: K.muted }}>no goals</span>}</button>; })}
      </div>
      {editing ? <SetForm boot={boot} who={who} year={year} set={set} goals={goals} onDone={() => { setEditing(false); load(); }} /> : (
        <>
          {!set && <Card><span style={{ color: K.muted }}>{m?.short_name || "—"} has no goals on record for {year}.{mayEdit ? " Set them above; they then appear in every check-in." : ""}</span></Card>}
          {set && (
            <div style={{ display: "grid", gap: 12 }}>
              {(["professional", "personal"] as const).map((kind) => (
                <Card key={kind} title={kind === "professional" ? "Professional" : "Personal"}>
                  <div style={{ display: "grid", gap: 10 }}>
                    {goals.filter((g) => g.kind === kind).map((g) => <GoalRow key={g.id} g={g} d={d} boot={boot} mine={mayEdit} reload={load} />)}
                    {!goals.some((g) => g.kind === kind) && <span style={{ color: K.muted, fontSize: 13 }}>None set.</span>}
                  </div>
                </Card>
              ))}
              {(set.failed_last || set.start_doing || set.stop_doing || set.one_thing || set.accountable_to || set.support_needed) && (
                <Card title="The reflection" right={`set ${dmy(set.created_at)}`}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, fontSize: 13 }}>
                    {[["What big goal did I fail at last year, and why?", set.failed_last], ["What will I START doing?", set.start_doing], ["What will I STOP doing?", set.stop_doing], ["The ONE thing that makes it the greatest year", set.one_thing], ["Who holds me accountable besides Kindle?", set.accountable_to], ["What support do I need from Kindle?", set.support_needed]].map(([q, a]) => a ? <div key={q as string}><div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: K.muted, fontWeight: 700 }}>{q}</div><div style={{ whiteSpace: "pre-wrap" }}>{a}</div></div> : null)}
                  </div>
                </Card>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function GoalRow({ g, d, boot, mine, reload }: { g: Goal; d: Data; boot: Boot; mine: boolean; reload: () => void }) {
  const ups = d.updates.filter((u) => u.goal_id === g.id).sort((a, b) => b.period.localeCompare(a.period));
  const [open, setOpen] = useState(false);
  const setStatus = async (status: string) => { await api("/api/kindle/goals", { action: "status", goal_id: g.id, status }); reload(); };
  const st = STATUS[g.status] || STATUS.on_track;
  return (
    <div style={{ background: K.soft, borderRadius: 10, padding: 10 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <span style={{ ...serif, fontSize: 20, color: K.muted, width: 22 }}>{g.seq}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15 }}>{g.title}</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
            {mine ? <select value={g.status} onChange={(e) => setStatus(e.target.value)} style={{ ...input, width: "auto", padding: "3px 8px", fontSize: 12 }}>{Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select> : <span style={pill(st[1])}>{st[0]}</span>}
            <span style={{ fontSize: 12, color: K.muted }}>{ups.length} update{ups.length === 1 ? "" : "s"}{ups[0] ? ` · last ${monthYear(ups[0].period)}` : ""}</span>
            {ups.length > 0 && <button onClick={() => setOpen(!open)} style={{ background: "none", border: "none", color: K.emberDark, fontWeight: 700, fontSize: 12, cursor: "pointer", padding: 0 }}>{open ? "hide" : "show the months"}</button>}
          </div>
          {open && <div style={{ marginTop: 8, display: "grid", gap: 4 }}>{ups.map((u) => <div key={u.id} style={{ fontSize: 13, display: "flex", gap: 8 }}><span style={{ color: K.muted, width: 70, flex: "none" }}>{monthYear(u.period)}</span><span style={{ flex: 1, whiteSpace: "pre-wrap" }}>{u.note}</span>{u.status && <span style={pill(STATUS[u.status]?.[1] || K.muted)}>{STATUS[u.status]?.[0]}</span>}</div>)}</div>}
        </div>
      </div>
    </div>
  );
}

function SetForm({ boot, who, year, set, goals, onDone }: { boot: Boot; who: string; year: string; set: GoalSet | null; goals: Goal[]; onDone: () => void }) {
  const g = (kind: string, i: number) => goals.find((x) => x.kind === kind && x.seq === i + 1)?.title || "";
  const [prof, setProf] = useState([g("professional", 0), g("professional", 1), g("professional", 2)]);
  const [pers, setPers] = useState([g("personal", 0), g("personal", 1), g("personal", 2)]);
  const [r, setR] = useState({ failed_last: set?.failed_last || "", start_doing: set?.start_doing || "", stop_doing: set?.stop_doing || "", one_thing: set?.one_thing || "", accountable_to: set?.accountable_to || "", support_needed: set?.support_needed || "" });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const save = async () => { setBusy(true); setErr(null); try { await api("/api/kindle/goals", { action: "save_set", member_id: who, year_label: year, professional: prof, personal: pers, reflections: r }); onDone(); } catch (e) { setErr(String((e as Error).message || e)); } setBusy(false); };
  const m = boot.members.find((x) => x.id === who);
  return (
    <Card title={`${m?.short_name || "—"} · goals for ${year}`} right="accountable to Kindle">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        <div><label style={label}>Three professional goals</label>{prof.map((v, i) => <textarea key={i} style={{ ...input, minHeight: 56, marginBottom: 6 }} value={v} placeholder={`Professional ${i + 1}`} onChange={(e) => setProf(prof.map((x, j) => j === i ? e.target.value : x))} />)}</div>
        <div><label style={label}>Three personal goals</label>{pers.map((v, i) => <textarea key={i} style={{ ...input, minHeight: 56, marginBottom: 6 }} value={v} placeholder={`Personal ${i + 1}`} onChange={(e) => setPers(pers.map((x, j) => j === i ? e.target.value : x))} />)}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 10, marginTop: 12 }}>
        {([["failed_last", "What big goal did you set LAST year that you failed at, and why?"], ["start_doing", "What will you START doing professionally to accomplish these?"], ["stop_doing", "What will you STOP doing?"], ["one_thing", "The ONE thing that, if it happens, makes this the greatest year"], ["accountable_to", "Who will hold you accountable besides this group?"], ["support_needed", "What support do you need from Kindle to stay on track?"]] as const).map(([k, l]) => <div key={k}><label style={label}>{l}</label><textarea style={{ ...input, minHeight: 56 }} value={r[k]} onChange={(e) => setR({ ...r, [k]: e.target.value })} /></div>)}
      </div>
      {err && <div style={{ color: K.red, fontSize: 13, marginTop: 8 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}><button onClick={save} disabled={busy} style={btn("primary")}>{busy ? "Saving…" : "Save goals"}</button><button onClick={onDone} style={btn("ghost")}>Cancel</button></div>
    </Card>
  );
}
