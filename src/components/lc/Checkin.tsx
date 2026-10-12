"use client";
/**
 * THE LEADERS CHECK-IN (Dr Raghu, 10 Oct 2026): "On top add a button saying
 * Leaders Check in. In that: date, leader's name, Top 1 (T1), Top 2 (T2),
 * Bottom 1 (B1), Burning issue / Sounding Board for the meeting (will go to
 * the Solution Board — a problem that needs to be solved, non-transactional),
 * My goals from the last quarter audit: goal – results, add more; My plan for
 * the next 99 days for the department and myself; Any learning done."
 *
 * One check-in per leader per meeting. The goals carry over from the leader's
 * last check-in so the results get written against them. The burning issue
 * raises a problem on the Solution Board the first time; a later edit changes
 * the words, never raises a second. Dr Raghu may fill one for a leader.
 */
import { useEffect, useState } from "react";
import { RELATED_TO } from "@/lib/lc/related";
import { api, btn, Card, Err, input, label, Lightbox, MUTED, NAVY, ORANGE, Who, dmy, dmyt, istToday, leaderOf, type Boot } from "./shared";

export interface Checkin { id: string; meeting_id: string; email: string; on_date: string; t1: string | null; t2: string | null; b1: string | null; burning: string | null; burning_related_to: string | null; burning_problem_id: string | null; goals: Goal[]; plan_99: string | null; learning: string | null; updated_at: string; up?: string[]; heart?: string[]; mine?: string | null; comments?: { id: string; body: string; added_by: string; created_at: string }[] }
interface Goal { goal: string; result: string }
interface MeetingLite { id: string; held_on: string }

const area: React.CSSProperties = { ...input, minHeight: 58, resize: "vertical", lineHeight: 1.4 };

export function CheckinForm({ boot, meetings, meetingId, onDone }: { boot: Boot | null; meetings: MeetingLite[]; meetingId?: string; onDone: (saved?: { meetingId: string; problemId: string | null }) => void }) {
  const today = istToday();
  const [mid, setMid] = useState(meetingId || meetings.find((m) => m.held_on === today)?.id || meetings[0]?.id || "");
  const [forEmail, setForEmail] = useState(boot?.me.email || "");
  const [f, setF] = useState({ on_date: today, t1: "", t2: "", b1: "", burning: "", burning_related_to: "", goals: [{ goal: "", result: "" }] as Goal[], plan_99: "", learning: "" });
  const [prevOn, setPrevOn] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [loaded, setLoaded] = useState(false);
  const m = meetings.find((x) => x.id === mid);
  useEffect(() => {
    if (!mid) { setLoaded(true); return; }
    setLoaded(false);
    api<{ mine: Checkin | null; previous: { goals: Goal[]; on_date: string } | null }>(`/api/lc/meetings?checkin=${mid}&for=${encodeURIComponent(forEmail)}`).then((r) => {
      if (r.mine) {
        setF({ on_date: r.mine.on_date, t1: r.mine.t1 || "", t2: r.mine.t2 || "", b1: r.mine.b1 || "", burning: r.mine.burning || "", burning_related_to: r.mine.burning_related_to || "", goals: r.mine.goals?.length ? r.mine.goals : [{ goal: "", result: "" }], plan_99: r.mine.plan_99 || "", learning: r.mine.learning || "" });
        setPrevOn(null);
      } else {
        /* the goals from the last check-in come forward, results blank — write what came of them */
        const carried = (r.previous?.goals || []).filter((g) => g.goal).map((g) => ({ goal: g.goal, result: "" }));
        setF({ on_date: m?.held_on || today, t1: "", t2: "", b1: "", burning: "", burning_related_to: "", goals: carried.length ? carried : [{ goal: "", result: "" }], plan_99: "", learning: "" });
        setPrevOn(carried.length && r.previous ? r.previous.on_date : null);
      }
      setLoaded(true);
    }).catch((e) => { setErr(String((e as Error).message)); setLoaded(true); });
  }, [mid, forEmail]); // eslint-disable-line react-hooks/exhaustive-deps
  const setGoal = (i: number, k: keyof Goal, v: string) => setF({ ...f, goals: f.goals.map((g, j) => (j === i ? { ...g, [k]: v } : g)) });
  const save = async () => {
    if (!mid) { setErr("Pick the meeting — or write New minutes first."); return; }
    if (!f.t1.trim() && !f.t2.trim() && !f.b1.trim() && !f.burning.trim() && !f.plan_99.trim() && !f.learning.trim() && !f.goals.some((g) => g.goal.trim() || g.result.trim())) { setErr("Write at least one thing."); return; }
    setErr(null); setBusy(true);
    try {
      const r = await api<{ burning_problem_id: string | null }>("/api/lc/meetings", { action: "checkin_save", id: mid, for_email: boot?.me.isOwner ? forEmail : undefined, ...f });
      onDone({ meetingId: mid, problemId: r.burning_problem_id });
    } catch (e) { setErr(String((e as Error).message)); }
    setBusy(false);
  };
  const who = leaderOf(boot, forEmail);
  return (
    <Lightbox title="Leaders Check in" onClose={() => onDone()} wide>
      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
        <div>
          <label style={label}>Meeting</label>
          {meetings.length ? (
            <select style={input} value={mid} onChange={(e) => setMid(e.target.value)} disabled={!!meetingId}>
              {meetings.map((x) => <option key={x.id} value={x.id}>{dmy(x.held_on)}{x.held_on === today ? " — today" : ""}</option>)}
            </select>
          ) : <div className="text-sm" style={{ color: "var(--red)" }}>No meeting on record — write New minutes first.</div>}
        </div>
        <div>
          <label style={label}>Date</label>
          <input type="date" style={input} value={f.on_date} onChange={(e) => setF({ ...f, on_date: e.target.value })} />
        </div>
        <div>
          <label style={label}>Leader&apos;s name</label>
          {boot?.me.isOwner ? (
            <select style={input} value={forEmail} onChange={(e) => setForEmail(e.target.value)}>
              {(boot?.members || []).map((l) => <option key={l.email} value={l.email}>{l.name}</option>)}
            </select>
          ) : <div className="flex items-center gap-2" style={{ ...input, background: "var(--soft)" }}><Who boot={boot} email={forEmail} size={20} /></div>}
        </div>
      </div>
      {!loaded && <div className="text-xs mt-2" style={{ color: MUTED }}>Opening…</div>}
      <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
        <div><label style={{ ...label, color: "var(--green)" }}>Top 1 (T1)</label><textarea style={area} value={f.t1} onChange={(e) => setF({ ...f, t1: e.target.value })} placeholder="The best thing since we last met" /></div>
        <div><label style={{ ...label, color: "var(--green)" }}>Top 2 (T2)</label><textarea style={area} value={f.t2} onChange={(e) => setF({ ...f, t2: e.target.value })} placeholder="The second" /></div>
        <div><label style={{ ...label, color: "var(--red)" }}>Bottom 1 (B1)</label><textarea style={area} value={f.b1} onChange={(e) => setF({ ...f, b1: e.target.value })} placeholder="The one that hurt" /></div>
      </div>
      <div className="rounded-lg mt-3 px-3 py-2" style={{ background: "#fff7ed", border: "1px solid #fed7aa" }}>
        <label style={{ ...label, color: ORANGE }}>🔥 Burning issue / Sounding Board for the meeting</label>
        <div className="grid gap-2" style={{ gridTemplateColumns: "minmax(0, 1fr) 220px" }}>
          <textarea style={area} value={f.burning} onChange={(e) => setF({ ...f, burning: e.target.value })} placeholder="A problem that needs to be solved — non-transactional. First line becomes the title on the Solution Board." />
          <div>
            <select style={input} value={f.burning_related_to} onChange={(e) => setF({ ...f, burning_related_to: e.target.value })}>
              <option value="">Related to…</option>
              {RELATED_TO.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <div className="text-xs mt-1" style={{ color: MUTED }}>Goes to the Solution Board as a problem in {who.name.split(" ")[0]}&apos;s name.</div>
          </div>
        </div>
      </div>
      <div className="mt-3">
        <label style={label}>My goals from the last quarter audit — goal, result{prevOn ? <span className="normal-case font-normal" style={{ color: ORANGE }}> · carried from {dmy(prevOn)}</span> : null}</label>
        <div className="grid gap-1.5">
          {f.goals.map((g, i) => (
            <div key={i} className="grid gap-2" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) 28px" }}>
              <input style={input} value={g.goal} onChange={(e) => setGoal(i, "goal", e.target.value)} placeholder={`Goal ${i + 1}`} />
              <input style={input} value={g.result} onChange={(e) => setGoal(i, "result", e.target.value)} placeholder="Result" />
              <button onClick={() => setF({ ...f, goals: f.goals.length > 1 ? f.goals.filter((_, j) => j !== i) : [{ goal: "", result: "" }] })} style={btn("ghost", { padding: 0, color: MUTED })} title="Remove">✕</button>
            </div>
          ))}
        </div>
        <button onClick={() => setF({ ...f, goals: [...f.goals, { goal: "", result: "" }] })} style={btn("soft", { padding: "4px 10px", fontSize: 12, marginTop: 6 })}>+ Add more</button>
      </div>
      <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div><label style={label}>My plan for the next 99 days — for the department and myself</label><textarea style={{ ...area, minHeight: 90 }} value={f.plan_99} onChange={(e) => setF({ ...f, plan_99: e.target.value })} placeholder={"Department: …\nMyself: …"} /></div>
        <div><label style={label}>Any learning done</label><textarea style={{ ...area, minHeight: 90 }} value={f.learning} onChange={(e) => setF({ ...f, learning: e.target.value })} placeholder="A book, a course, a mistake, a visit…" /></div>
      </div>
      <Err e={err} />
      <div className="flex gap-2 mt-3 items-center">
        <button onClick={save} disabled={busy || !loaded} style={btn("primary")}>{busy ? "Saving…" : "Check in"}</button>
        <button onClick={() => onDone()} style={btn("ghost")}>Cancel</button>
        <span className="text-xs ml-auto" style={{ color: MUTED }}>One per leader per meeting — come back to it, it keeps your words.</span>
      </div>
      <style>{`@media (max-width: 760px){ .lc-ck [style*="grid-template-columns: 1fr 1fr"] { grid-template-columns: 1fr !important; } }`}</style>
    </Lightbox>
  );
}

/** THE ROUND, ON THE MEETING: every leader's check-in as a card; Genie folds them in to the minutes as the T2B1 table. */
export function CheckinRound({ boot, checkins, go, onCheckin, onChange }: { boot: Boot | null; checkins: Checkin[]; go: (k: string, a?: string | null) => void; onCheckin: () => void; onChange: () => void }) {
  const mine = checkins.find((c) => c.email === boot?.me.email);
  const notYet = (boot?.members || []).filter((l) => !checkins.some((c) => c.email === l.email));
  return (
    <Card title="Leaders check-in (T2B1)" accent="var(--green)" right={<button onClick={onCheckin} style={btn("primary", { padding: "5px 10px", fontSize: 12 })}>{mine ? "✎ My check-in" : "✅ Leaders Check in"}</button>}>
      {checkins.length === 0 && <div className="text-sm" style={{ color: MUTED }}>No one has checked in yet — T1, T2, B1, the burning issue, goals and the 99-day plan.</div>}
      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
        {checkins.map((c) => (
          <div key={c.id} className="rounded-lg px-3 py-2" style={{ border: "1px solid var(--line)", borderLeft: `4px solid ${leaderOf(boot, c.email).colour}` }}>
            <div className="flex items-center gap-2 text-xs" style={{ color: MUTED }}><Who boot={boot} email={c.email} size={22} /><span className="ml-auto">{dmy(c.on_date)}</span></div>
            <div className="text-sm mt-1.5 grid gap-0.5">
              <div><b style={{ color: "var(--green)" }}>T1</b> {c.t1 || <span style={{ color: MUTED }}>—</span>}</div>
              <div><b style={{ color: "var(--green)" }}>T2</b> {c.t2 || <span style={{ color: MUTED }}>—</span>}</div>
              <div><b style={{ color: "var(--red)" }}>B1</b> {c.b1 || <span style={{ color: MUTED }}>—</span>}</div>
              {c.burning && <div className="rounded px-2 py-1 mt-1" style={{ background: "#fff7ed" }}><b style={{ color: ORANGE }}>🔥</b> {c.burning}{c.burning_related_to && <span className="rounded px-1.5 ml-1" style={{ background: "#fff", fontSize: 10.5, fontWeight: 600, color: NAVY }}>{c.burning_related_to}</span>}{c.burning_problem_id && <button onClick={() => go("solutions", c.burning_problem_id)} className="ml-1 font-semibold" style={{ color: ORANGE, fontSize: 12 }}>→ Solution Board</button>}</div>}
              {c.goals?.length > 0 && <div className="mt-1"><div className="text-xs font-bold" style={{ color: MUTED }}>GOALS · RESULTS</div>{c.goals.map((g, i) => <div key={i} className="text-xs">🎯 {g.goal}{g.result ? <span> → <b>{g.result}</b></span> : null}</div>)}</div>}
              {c.plan_99 && <div className="mt-1"><div className="text-xs font-bold" style={{ color: MUTED }}>NEXT 99 DAYS</div><div className="text-xs" style={{ whiteSpace: "pre-wrap" }}>{c.plan_99}</div></div>}
              {c.learning && <div className="mt-1"><div className="text-xs font-bold" style={{ color: MUTED }}>LEARNING</div><div className="text-xs" style={{ whiteSpace: "pre-wrap" }}>{c.learning}</div></div>}
            </div>
            <CheckinTalk boot={boot} c={c} onChange={onChange} />
          </div>
        ))}
      </div>
      {notYet.length > 0 && checkins.length > 0 && <div className="text-xs mt-2" style={{ color: MUTED }}>Not yet: {notYet.map((l) => l.name.split(" ")[0]).join(", ")}</div>}
    </Card>
  );
}

/**
 * A THUMBS UP, A HEART, AND THE TALK (Dr Raghu, 12 Oct 2026: "in the checkins
 * also give a place to react to it with a thumbs up or heart. also comment").
 * One reaction per leader — the same again takes it back; hover shows who.
 */
function CheckinTalk({ boot, c, onChange }: { boot: Boot | null; c: Checkin; onChange: () => void }) {
  const [open, setOpen] = useState(false); const [text, setText] = useState(""); const [busy, setBusy] = useState(false);
  const up = c.up || [], heart = c.heart || [], talk = c.comments || [];
  const names = (es: string[]) => es.map((e) => leaderOf(boot, e).name).join(", ") || "No one yet";
  const react = async (value: "up" | "heart") => { try { await api("/api/lc/meetings", { action: "checkin_react", id: c.id, value }); onChange(); } catch (e) { alert(String((e as Error).message)); } };
  const say = async () => { if (!text.trim()) return; setBusy(true); try { await api("/api/lc/meetings", { action: "checkin_comment", id: c.id, body: text }); setText(""); onChange(); } catch (e) { alert(String((e as Error).message)); } setBusy(false); };
  const unsay = async (id: string) => { if (!confirm("Remove this comment?")) return; await api("/api/lc/meetings", { action: "uncomment", comment_id: id }); onChange(); };
  const pill = (on: boolean): React.CSSProperties => ({ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 9px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, border: `1px solid ${on ? "var(--accent)" : "var(--line)"}`, background: on ? "#fff7ed" : "#fff", color: NAVY });
  return (
    <div className="mt-2 pt-2" style={{ borderTop: "1px dashed var(--line)" }}>
      <div className="flex items-center gap-1.5 flex-wrap">
        <button onClick={() => react("up")} style={pill(c.mine === "up")} title={names(up)}>👍 {up.length}</button>
        <button onClick={() => react("heart")} style={pill(c.mine === "heart")} title={names(heart)}>❤️ {heart.length}</button>
        <button onClick={() => setOpen((o) => !o)} style={pill(open)} title="Comments">💬 {talk.length}</button>
        {!open && talk.length > 0 && <span className="text-xs truncate" style={{ color: MUTED, maxWidth: 200 }}>{leaderOf(boot, talk[talk.length - 1].added_by).name.split(" ")[0]}: {talk[talk.length - 1].body}</span>}
      </div>
      {open && (
        <div className="mt-2 grid gap-1.5">
          {talk.map((x) => (
            <div key={x.id} className="flex gap-2 items-start text-xs">
              <Who boot={boot} email={x.added_by} size={18} withName={false} />
              <div className="flex-1 min-w-0"><b style={{ color: NAVY }}>{leaderOf(boot, x.added_by).name}</b> <span style={{ color: MUTED }}>· {dmyt(x.created_at)}</span><div style={{ whiteSpace: "pre-wrap" }}>{x.body}</div></div>
              {(boot?.me.isOwner || x.added_by === boot?.me.email) && <button onClick={() => unsay(x.id)} style={{ color: MUTED, fontSize: 11 }} title="Remove">✕</button>}
            </div>
          ))}
          <div className="flex gap-1.5">
            <input style={{ ...input, padding: "5px 8px", fontSize: 13 }} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); say(); } }} placeholder={`Say something to ${leaderOf(boot, c.email).name.split(" ")[0]}…`} />
            <button onClick={say} disabled={busy || !text.trim()} style={btn("primary", { padding: "5px 10px", fontSize: 12 })}>Say</button>
          </div>
        </div>
      )}
    </div>
  );
}
