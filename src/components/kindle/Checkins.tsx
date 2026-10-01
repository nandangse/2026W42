"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, Avatar, btn, Card, dmy, input, K, label, monthYear, pill, serif, type Boot, type Member } from "./shared";

/**
 * CHECK-INS (Dr Raghu, 1 Oct 2026): "this month's check-in to be shown. Can
 * see one at a time. Show next, previous. Have a timer on the screen, feed
 * the time, start a countdown, a ringer when it is done. Then a subsection
 * by person: all his check-ins, one screen high with right scrolling."
 * Plus the form itself, so the Google Form can close.
 */
interface Checkin { id: string; member_id: string; period: string; meeting_id: string | null; submitted_at: string; prof_rating: number | null; pers_rating: number | null; prof_notes: string | null; pers_notes: string | null; learning: string | null; challenge: string | null; sounding: string | null; one_to_one: string | null; update_note: string | null; suggestions: string | null; new_goals: string | null; source: string }
interface Update { id: string; goal_id: string; checkin_id: string | null; member_id: string; period: string; note: string | null; status: string | null; progress: number | null }
interface Goal { id: string; set_id: string; member_id: string; kind: string; seq: number; title: string; measure?: string | null; actions?: string[]; status: string; progress: number }
interface GoalSet { id: string; member_id: string; year_label: string; created_at: string }
interface Data { checkins: Checkin[]; updates: Update[]; goals: Goal[]; sets: GoalSet[] }

const STATUS: Record<string, [string, string]> = { on_track: ["On track", K.green], behind: ["Behind", K.ember], done: ["Done", K.blue], dropped: ["Dropped", K.muted] };

export default function Checkins({ boot, arg, go }: { boot: Boot; arg: string | null; go: (k: string, a?: string | null) => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = () => api<Data>("/api/kindle/checkins").then(setData).catch((e) => setErr(String(e.message || e)));
  useEffect(() => { load(); }, []);
  const thisPeriod = useMemo(() => (boot.next?.meeting_on || boot.today).slice(0, 7) + "-01", [boot.next, boot.today]);
  const [period, setPeriod] = useState(thisPeriod);
  const [tab, setTab] = useState<"meeting" | "person" | "mine">(arg === "mine" ? "mine" : arg === "person" ? "person" : "meeting");
  const periods = useMemo(() => { const s = new Set<string>((data?.checkins || []).map((c) => c.period)); s.add(thisPeriod); return [...s].sort().reverse(); }, [data, thisPeriod]);
  if (err) return <Card><span style={{ color: K.red }}>{err}</span></Card>;
  if (!data) return <Card><span style={{ color: K.muted }}>Loading the check-ins…</span></Card>;
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ ...serif, fontSize: 26, margin: 0 }}>Check-ins</h1>
        <div style={{ display: "flex", border: `1px solid ${K.line}`, borderRadius: 10, overflow: "hidden" }}>
          {([["meeting", "This month"], ["person", "By person"], ["mine", "My check-in"]] as const).map(([k, l]) => <button key={k} onClick={() => { setTab(k); go("checkins", k === "meeting" ? null : k); }} style={{ border: "none", padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", background: tab === k ? K.charcoal : "#fff", color: tab === k ? "#fff" : K.ink }}>{l}</button>)}
        </div>
        {tab === "meeting" && <select value={period} onChange={(e) => setPeriod(e.target.value)} style={{ ...input, width: "auto", padding: "6px 10px", fontSize: 13 }}>{periods.map((p) => <option key={p} value={p}>{monthYear(p)}{p === thisPeriod ? " · this month" : ""}</option>)}</select>}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: K.muted }}>{data.checkins.length} check-ins since {monthYear(periods[periods.length - 1])}</span>
      </div>
      {tab === "meeting" && <MeetingView boot={boot} data={data} period={period} onWrite={() => setTab("mine")} />}
      {tab === "person" && <ByPerson boot={boot} data={data} />}
      {tab === "mine" && <MyForm boot={boot} data={data} period={thisPeriod} onSaved={() => { load(); }} />}
    </div>
  );
}

/* --------------------------------------------------------------- one card */
function CheckinCard({ c, data, boot, big = false }: { c: Checkin; data: Data; boot: Boot; big?: boolean }) {
  const m = boot.members.find((x) => x.id === c.member_id);
  const ups = data.updates.filter((u) => u.checkin_id === c.id);
  const goalOf = (id: string) => data.goals.find((g) => g.id === id);
  const fs = big ? 15 : 13;
  const Sec = ({ t, v }: { t: string; v: string | null }) => v ? <div style={{ marginTop: big ? 12 : 8 }}><div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, color: K.muted, fontWeight: 700 }}>{t}</div><div style={{ whiteSpace: "pre-wrap", fontSize: fs, lineHeight: 1.5 }}>{v}</div></div> : null;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {m && <Avatar m={m} size={big ? 48 : 34} />}
        <div style={{ flex: 1 }}>
          <div style={{ ...serif, fontSize: big ? 22 : 16 }}>{m?.name || "—"}</div>
          <div style={{ fontSize: 12, color: K.muted }}>{monthYear(c.period)} · filed {dmy(c.submitted_at)}{c.source !== "site" ? " · from the Google Form" : ""}</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {c.prof_rating != null && <Score n={c.prof_rating} l="Professional" big={big} />}
          {c.pers_rating != null && <Score n={c.pers_rating} l="Personal" big={big} />}
        </div>
      </div>
      <Sec t="Professional" v={c.prof_notes} />
      <Sec t="Personal" v={c.pers_notes} />
      {ups.length > 0 && (
        <div style={{ marginTop: big ? 12 : 8 }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, color: K.muted, fontWeight: 700 }}>Goals</div>
          <div style={{ display: "grid", gap: 6, marginTop: 4 }}>
            {ups.sort((a, b) => { const ga = goalOf(a.goal_id), gb = goalOf(b.goal_id); return (ga?.kind === "personal" ? 1 : 0) - (gb?.kind === "personal" ? 1 : 0) || (ga?.seq || 0) - (gb?.seq || 0); }).map((u) => { const g = goalOf(u.goal_id); return (
              <div key={u.id} style={{ background: K.soft, borderRadius: 8, padding: "6px 10px", fontSize: fs - 1 }}>
                <div style={{ color: K.dim, fontSize: 11 }}>{g ? `${g.kind === "personal" ? "Personal" : "Professional"} ${g.seq}: ${g.title}` : "Goal"}{g?.measure ? <span style={{ marginLeft: 6, color: K.emberDark, fontWeight: 700 }}>· {g.measure}</span> : ""}</div>
                <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}><span style={{ flex: 1, whiteSpace: "pre-wrap" }}>{u.note}</span>{u.status && <span style={pill(STATUS[u.status]?.[1] || K.muted)}>{STATUS[u.status]?.[0] || u.status}</span>}</div>
              </div>); })}
          </div>
        </div>
      )}
      <Sec t="Inspiration and learning" v={c.learning} />
      <Sec t="Leadership challenge" v={c.challenge} />
      <Sec t="Sounding board" v={c.sounding} />
      <Sec t="1-2-1" v={c.one_to_one} />
      <Sec t="New goals" v={c.new_goals} />
      <Sec t="For the group" v={c.suggestions} />
    </div>
  );
}
function Score({ n, l, big }: { n: number; l: string; big: boolean }) {
  const col = n >= 8 ? K.green : n >= 6 ? K.amber : K.red;
  return <div style={{ textAlign: "center", minWidth: big ? 64 : 48 }}><div style={{ ...serif, fontSize: big ? 28 : 20, color: col, lineHeight: 1 }}>{n}</div><div style={{ fontSize: 10, color: K.muted }}>{l}</div></div>;
}

/* ------------------------------------------ this month, one at a time + timer */
function MeetingView({ boot, data, period, onWrite }: { boot: Boot; data: Data; period: string; onWrite: () => void }) {
  const members = boot.members.filter((m) => m.active);
  const rows = useMemo(() => { const seen = new Set<string>(); return data.checkins.filter((c) => c.period === period).filter((c) => { if (seen.has(c.member_id)) return false; seen.add(c.member_id); return true; }).sort((a, b) => (members.findIndex((m) => m.id === a.member_id)) - (members.findIndex((m) => m.id === b.member_id))); }, [data, period, members]);
  const [i, setI] = useState(0);
  useEffect(() => setI(0), [period]);
  const missing = members.filter((m) => !rows.some((r) => r.member_id === m.id));
  const cur = rows[i];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return; if (e.key === "ArrowRight") setI((x) => Math.min(rows.length - 1, x + 1)); if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1)); };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [rows.length]);
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {rows.map((r, j) => { const m = members.find((x) => x.id === r.member_id); return <button key={r.id} onClick={() => setI(j)} title={m?.name} style={{ border: `2px solid ${j === i ? K.ember : "transparent"}`, borderRadius: 999, padding: 2, background: "none", cursor: "pointer" }}>{m && <Avatar m={m} size={34} />}</button>; })}
        {missing.length > 0 && <span style={{ fontSize: 12, color: K.muted, marginLeft: 6 }}>Not yet: {missing.map((m) => m.short_name || m.name).join(", ")}{missing.some((m) => m.id === boot.me.id) && <> · <button onClick={onWrite} style={{ background: "none", border: "none", color: K.emberDark, fontWeight: 700, cursor: "pointer", padding: 0, fontSize: 12 }}>write mine →</button></>}</span>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 260px", gap: 16 }} className="kindle-two">
        <Card style={{ minHeight: 420 }}>
          {cur ? <CheckinCard c={cur} data={data} boot={boot} big /> : <div style={{ color: K.muted }}>No check-in for {monthYear(period)} yet.</div>}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18, borderTop: `1px solid ${K.soft}`, paddingTop: 12 }}>
            <button onClick={() => setI(Math.max(0, i - 1))} disabled={i <= 0} style={btn("ghost")}>← Previous</button>
            <span style={{ fontSize: 13, color: K.muted }}>{rows.length ? `${i + 1} of ${rows.length}` : "—"} · ← → keys work</span>
            <button onClick={() => setI(Math.min(rows.length - 1, i + 1))} disabled={i >= rows.length - 1} style={btn("primary")}>Next →</button>
          </div>
        </Card>
        <Timer personKey={cur?.id || ""} />
      </div>
      <style>{`@media (max-width: 820px){ .kindle-two { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}

/* -------------------------------------------------------------- the timer */
function Timer({ personKey }: { personKey: string }) {
  const [mins, setMins] = useState(4); const [secs, setSecs] = useState(0);
  const [left, setLeft] = useState(240); const [running, setRunning] = useState(false); const [rang, setRang] = useState(false);
  const tick = useRef<number | null>(null); const endAt = useRef<number>(0); const ctx = useRef<AudioContext | null>(null);
  const total = mins * 60 + secs;
  const reset = () => { setRunning(false); setRang(false); setLeft(total); if (tick.current) window.clearInterval(tick.current); };
  useEffect(() => { reset(); }, [personKey, total]); // eslint-disable-line react-hooks/exhaustive-deps
  const ring = () => {
    setRang(true);
    try {
      ctx.current = ctx.current || new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const ac = ctx.current; const t0 = ac.currentTime;
      for (let n = 0; n < 6; n++) { const o = ac.createOscillator(); const gnode = ac.createGain(); o.type = "sine"; o.frequency.value = n % 2 ? 880 : 660; gnode.gain.setValueAtTime(0.0001, t0 + n * 0.5); gnode.gain.exponentialRampToValueAtTime(0.5, t0 + n * 0.5 + 0.02); gnode.gain.exponentialRampToValueAtTime(0.0001, t0 + n * 0.5 + 0.4); o.connect(gnode).connect(ac.destination); o.start(t0 + n * 0.5); o.stop(t0 + n * 0.5 + 0.45); }
    } catch { /* no audio — the screen still flashes */ }
    try { navigator.vibrate?.([300, 150, 300, 150, 600]); } catch { /* ignore */ }
  };
  const start = () => {
    if (left <= 0) setLeft(total);
    /* unlock audio on the user's gesture, so the ring is allowed later */
    try { ctx.current = ctx.current || new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)(); ctx.current.resume(); } catch { /* ignore */ }
    endAt.current = Date.now() + (left > 0 ? left : total) * 1000; setRunning(true); setRang(false);
    if (tick.current) window.clearInterval(tick.current);
    tick.current = window.setInterval(() => { const l = Math.max(0, Math.round((endAt.current - Date.now()) / 1000)); setLeft(l); if (l <= 0) { window.clearInterval(tick.current!); setRunning(false); ring(); } }, 250);
  };
  const pause = () => { setRunning(false); if (tick.current) window.clearInterval(tick.current); };
  useEffect(() => () => { if (tick.current) window.clearInterval(tick.current); }, []);
  const mm = String(Math.floor(left / 60)).padStart(2, "0"), ss = String(left % 60).padStart(2, "0");
  const warn = running && left <= 30;
  return (
    <Card style={{ background: rang ? K.red : warn ? "#fde7cf" : K.charcoal, color: rang || !warn ? "#fff7ea" : K.ink, textAlign: "center", border: "none", animation: rang ? "kindle-flash 0.6s infinite alternate" : undefined }}>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, opacity: 0.75 }}>Check-in timer</div>
      <div style={{ ...serif, fontSize: 64, lineHeight: 1.1, fontVariantNumeric: "tabular-nums", margin: "6px 0" }}>{mm}:{ss}</div>
      {rang && <div style={{ fontWeight: 700, marginBottom: 6 }}>Time. Thank you.</div>}
      <div style={{ display: "flex", gap: 6, justifyContent: "center", alignItems: "center", marginBottom: 10, fontSize: 13 }}>
        <input type="number" min={0} max={60} value={mins} disabled={running} onChange={(e) => setMins(Math.max(0, Number(e.target.value) | 0))} style={{ width: 52, borderRadius: 8, border: "none", padding: "5px 6px", textAlign: "center", fontSize: 14 }} /> min
        <input type="number" min={0} max={59} value={secs} disabled={running} onChange={(e) => setSecs(Math.max(0, Math.min(59, Number(e.target.value) | 0)))} style={{ width: 52, borderRadius: 8, border: "none", padding: "5px 6px", textAlign: "center", fontSize: 14 }} /> sec
      </div>
      <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
        {!running ? <button onClick={start} style={btn("primary", { padding: "9px 18px" })}>{left < total && left > 0 ? "Resume" : "Start"}</button> : <button onClick={pause} style={btn("ghost", { padding: "9px 18px" })}>Pause</button>}
        <button onClick={reset} style={btn("ghost", { padding: "9px 12px" })}>Reset</button>
        <button onClick={ring} title="test the ringer" style={btn("ghost", { padding: "9px 10px" })}>🔔</button>
      </div>
      <div style={{ fontSize: 11, opacity: 0.7, marginTop: 8 }}>Resets when you move to the next person. The constitution gives 4 + 3 minutes each.</div>
      <style>{`@keyframes kindle-flash { from { filter: brightness(1); } to { filter: brightness(1.35); } }`}</style>
    </Card>
  );
}

/* --------------------------------------------------- by person, sideways */
function ByPerson({ boot, data }: { boot: Boot; data: Data }) {
  const members = boot.members.filter((m) => m.active || data.checkins.some((c) => c.member_id === m.id));
  const [who, setWho] = useState<string>(boot.me.id);
  const rows = data.checkins.filter((c) => c.member_id === who);
  const scroller = useRef<HTMLDivElement>(null);
  const by = (dx: number) => scroller.current?.scrollBy({ left: dx, behavior: "smooth" });
  const m = members.find((x) => x.id === who) as Member | undefined;
  const avgP = rows.filter((r) => r.prof_rating != null).reduce((s, r, _, a) => s + (r.prof_rating || 0) / a.length, 0);
  const avgS = rows.filter((r) => r.pers_rating != null).reduce((s, r, _, a) => s + (r.pers_rating || 0) / a.length, 0);
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {members.map((x) => <button key={x.id} onClick={() => setWho(x.id)} style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${who === x.id ? K.ember : K.line}`, background: who === x.id ? "#fde7cf" : "#fff", borderRadius: 999, padding: "4px 12px 4px 4px", cursor: "pointer", fontSize: 13, fontWeight: who === x.id ? 700 : 500 }}><Avatar m={x} size={28} />{x.short_name || x.name}<span style={{ color: K.muted, fontSize: 11 }}>{data.checkins.filter((c) => c.member_id === x.id).length}</span></button>)}
      </div>
      {m && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ ...serif, margin: 0, fontSize: 20 }}>{m.name}</h2>
          <span style={{ fontSize: 13, color: K.dim }}>{rows.length} check-ins{rows.length ? ` · ${monthYear(rows[rows.length - 1].period)} to ${monthYear(rows[0].period)}` : ""}{avgP ? ` · average professional ${avgP.toFixed(1)}, personal ${avgS.toFixed(1)}` : ""}</span>
          <div style={{ flex: 1 }} />
          <button onClick={() => by(-760)} style={btn("ghost", { padding: "6px 12px" })}>←</button>
          <button onClick={() => by(760)} style={btn("ghost", { padding: "6px 12px" })}>→</button>
        </div>
      )}
      <div ref={scroller} style={{ display: "flex", gap: 12, overflowX: "auto", scrollSnapType: "x mandatory", paddingBottom: 8, height: "calc(100vh - 230px)", minHeight: 420 }}>
        {rows.length === 0 && <Card><span style={{ color: K.muted }}>No check-ins on record.</span></Card>}
        {rows.map((c) => (
          <div key={c.id} style={{ flex: "0 0 370px", scrollSnapAlign: "start", background: "#fff", border: `1px solid ${K.line}`, borderRadius: 14, padding: 14, overflowY: "auto" }}>
            <CheckinCard c={c} data={data} boot={boot} />
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: K.muted }}>Newest first; scroll sideways, or use the arrows. Each card scrolls on its own if it is long.</div>
    </div>
  );
}

/* ---------------------------------------------------------- my check-in */
function MyForm({ boot, data, period, onSaved }: { boot: Boot; data: Data; period: string; onSaved: () => void }) {
  const mySets = data.sets.filter((s) => s.member_id === boot.me.id).sort((a, b) => b.year_label.localeCompare(a.year_label));
  const set = mySets[0];
  const myGoals = set ? data.goals.filter((g) => g.set_id === set.id).sort((a, b) => (a.kind === "personal" ? 1 : 0) - (b.kind === "personal" ? 1 : 0) || a.seq - b.seq) : [];
  const existing = data.checkins.find((c) => c.member_id === boot.me.id && c.period === period && c.source === "site") || null;
  const existingUps = existing ? data.updates.filter((u) => u.checkin_id === existing.id) : [];
  const [f, setF] = useState({ prof_rating: existing?.prof_rating ?? 7, pers_rating: existing?.pers_rating ?? 7, prof_notes: existing?.prof_notes || "", pers_notes: existing?.pers_notes || "", learning: existing?.learning || "", challenge: existing?.challenge || "", sounding: existing?.sounding || "", one_to_one: existing?.one_to_one || "", suggestions: existing?.suggestions || "", new_goals: existing?.new_goals || "" });
  const [g, setG] = useState<Record<string, { note: string; status: string }>>(() => Object.fromEntries(myGoals.map((x) => { const u = existingUps.find((y) => y.goal_id === x.id); return [x.id, { note: u?.note || "", status: u?.status || x.status || "on_track" }]; })));
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null);
  const [with121, setWith121] = useState<string>("");
  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      const one = [with121 ? `1-2-1 with ${boot.members.find((m) => m.id === with121)?.short_name || ""}` : null, f.one_to_one.trim() || null].filter(Boolean).join(" — ");
      await api("/api/kindle/checkins", { action: "save", period, ...f, one_to_one: one || f.one_to_one, goals: myGoals.map((x) => ({ goal_id: x.id, ...g[x.id] })) });
      setMsg("Saved. The facilitator will see it on meeting day."); onSaved();
    } catch (e) { setMsg(String((e as Error).message || e)); }
    setBusy(false);
  };
  const T = ({ k, l, h, rows = 3 }: { k: keyof typeof f; l: string; h?: string; rows?: number }) => <div><label style={label}>{l}</label>{h && <div style={{ fontSize: 11, color: K.muted, marginBottom: 4 }}>{h}</div>}<textarea style={{ ...input, minHeight: rows * 24 }} value={String(f[k])} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>;
  return (
    <div style={{ display: "grid", gap: 14, maxWidth: 860 }}>
      <Card title={`My check-in for ${monthYear(period)}`} right={existing ? `last saved ${dmy(existing.submitted_at)}` : "due three days before the meeting (4.25)"}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Slider l="Professional performance last month" v={Number(f.prof_rating)} set={(v) => setF({ ...f, prof_rating: v })} lo="poor" hi="better than my goals" />
          <Slider l="Personal outlook" v={Number(f.pers_rating)} set={(v) => setF({ ...f, pers_rating: v })} lo="negative" hi="best it can be" />
        </div>
        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          <T k="prof_notes" l="Professional highlights" rows={4} />
          <T k="pers_notes" l="Personal highlights" rows={4} />
        </div>
      </Card>
      <Card title={`My goals${set ? ` · ${set.year_label}` : ""}`} right={myGoals.length ? "a line on each, and where it stands" : undefined}>
        {!myGoals.length ? <div style={{ color: K.muted, fontSize: 13 }}>No goals on record for you yet. Set them under Goals; they appear here from then on.</div> : (
          <div style={{ display: "grid", gap: 10 }}>
            {myGoals.map((x) => (
              <div key={x.id} style={{ background: K.soft, borderRadius: 10, padding: 10 }}>
                <div style={{ fontSize: 12, color: K.dim, marginBottom: 4, display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}><span><b>{x.kind === "personal" ? "Personal" : "Professional"} {x.seq}</b> · {x.title}</span>{x.measure && <span style={{ ...serif, fontSize: 16, color: K.emberDark }}>{x.measure}</span>}</div>
                {(x.actions || []).length > 0 && <div style={{ fontSize: 11, color: K.muted, marginBottom: 4 }}>{(x.actions || []).map((a, i) => `${i + 1}. ${a}`).join("  ·  ")}</div>}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: 8 }}>
                  <textarea style={{ ...input, minHeight: 48 }} value={g[x.id]?.note || ""} onChange={(e) => setG({ ...g, [x.id]: { ...g[x.id], note: e.target.value } })} placeholder="This month…" />
                  <select style={input} value={g[x.id]?.status || "on_track"} onChange={(e) => setG({ ...g, [x.id]: { ...g[x.id], status: e.target.value } })}>{Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card title="The rest">
        <div style={{ display: "grid", gap: 12 }}>
          <T k="learning" l="Inspiration and learning" h="A book, a person, a line that stayed with you." />
          <T k="challenge" l="Leadership challenge" />
          <T k="sounding" l="Sounding board — the one problem for the room" h="Becomes a burning-issue entry the group can take up." />
          <div>
            <label style={label}>1-2-1 this month</label>
            <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 8 }}>
              <select style={input} value={with121} onChange={(e) => setWith121(e.target.value)}><option value="">with…</option>{boot.members.filter((m) => m.active && m.id !== boot.me.id).map((m) => <option key={m.id} value={m.id}>{m.short_name || m.name}</option>)}</select>
              <textarea style={{ ...input, minHeight: 48 }} value={f.one_to_one} onChange={(e) => setF({ ...f, one_to_one: e.target.value })} placeholder="What did you commit? What did you gain?" />
            </div>
          </div>
          <T k="new_goals" l="New goals or changes to goals" rows={2} />
          <T k="suggestions" l="For Kindle — a suggestion for the group" rows={2} />
        </div>
        {msg && <div style={{ marginTop: 10, fontSize: 13, color: msg.startsWith("Saved") ? K.green : K.red }}>{msg}</div>}
        <div style={{ marginTop: 12 }}><button onClick={save} disabled={busy} style={btn("primary", { padding: "11px 18px", fontSize: 14 })}>{busy ? "Saving…" : existing ? "Update my check-in" : "File my check-in"}</button></div>
      </Card>
    </div>
  );
}
function Slider({ l, v, set, lo, hi }: { l: string; v: number; set: (v: number) => void; lo: string; hi: string }) {
  return <div><label style={label}>{l} · <b style={{ color: K.emberDark }}>{v}</b>/10</label><input type="range" min={1} max={10} value={v} onChange={(e) => set(Number(e.target.value))} style={{ width: "100%", accentColor: K.ember }} /><div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: K.muted }}><span>{lo}</span><span>{hi}</span></div></div>;
}
