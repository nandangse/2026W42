"use client";
import { useEffect, useState } from "react";
import { api, Avatar, btn, Card, dayName, dmy, input, K, label, Markdown, pill, serif, type Boot, type Meeting } from "./shared";
import Feedback from "./Feedback";

/**
 * Meetings: the calendar since 2023; one meeting's page with agenda,
 * attendance (the scribe marks it; late minutes strike the fine), minutes
 * and the Knowledge Guru. The facilitator adds and edits meetings.
 */
export default function Meetings({ boot, arg, go, reload }: { boot: Boot; arg: string | null; go: (k: string, a?: string | null) => void; reload: () => void }) {
  const open = arg ? boot.meetings.find((m) => m.id === arg) : null;
  const [adding, setAdding] = useState(false);
  if (open) return <MeetingPage boot={boot} m={open} back={() => go("meetings")} reload={reload} />;
  const upcoming = boot.meetings.filter((m) => m.meeting_on >= boot.today && m.status !== "cancelled");
  const past = boot.meetings.filter((m) => m.meeting_on < boot.today).reverse();
  const presentCount = (id: string) => boot.attendance.filter((a) => a.meeting_id === id && a.status !== "absent" && a.status !== "excused").length;
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <h1 style={{ ...serif, fontSize: 26, margin: 0 }}>TG Meetings</h1>
        <span style={{ color: K.muted, fontSize: 13 }}>{boot.settings.meeting_day || "First Thursday, 3 pm to 7 pm"}</span>
        <div style={{ flex: 1 }} />
        {boot.me.admin && <button onClick={() => setAdding(!adding)} style={btn("ghost")}>{adding ? "Close" : "+ Add a meeting"}</button>}
      </div>
      {adding && <MeetingForm boot={boot} onSaved={() => { setAdding(false); reload(); }} />}
      <Card title="Coming up">
        {upcoming.length ? upcoming.map((m) => <Row key={m.id} m={m} n={null} onOpen={() => go("meetings", m.id)} today={boot.today} />) : <div style={{ color: K.muted }}>Nothing planned.</div>}
      </Card>
      <Card title="Held" right={`${past.length} meetings since ${dmy(boot.meetings[0]?.meeting_on)}`}>
        {past.map((m) => <Row key={m.id} m={m} n={presentCount(m.id)} onOpen={() => go("meetings", m.id)} today={boot.today} />)}
      </Card>
    </div>
  );
}

function Row({ m, n, onOpen, today }: { m: Meeting; n: number | null; onOpen: () => void; today: string }) {
  return (
    <button onClick={onOpen} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", background: m.meeting_on === today ? "#fde7cf" : "transparent", border: "none", borderTop: `1px solid ${K.soft}`, padding: "10px 6px", cursor: "pointer" }}>
      <div style={{ width: 54, textAlign: "center", lineHeight: 1 }}>
        <div style={{ ...serif, fontSize: 22 }}>{Number(m.meeting_on.slice(8))}</div>
        <div style={{ fontSize: 10, color: K.muted, textTransform: "uppercase" }}>{dmy(m.meeting_on).split(" ")[1]} {m.meeting_on.slice(0, 4)}</div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{m.title || (m.kind === "monthly" ? "Monthly meeting" : m.kind)} <span style={{ color: K.muted, fontWeight: 400, fontSize: 12 }}>· {dayName(m.meeting_on)}{!m.date_exact ? " · date from the rule" : ""}</span></div>
        <div style={{ fontSize: 12, color: K.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{[m.venue, m.guru ? `Guru: ${m.guru}` : null, m.minutes ? "minutes written" : m.minutes_url ? "minutes linked" : null].filter(Boolean).join(" · ") || "—"}</div>
      </div>
      {m.status === "cancelled" ? <span style={pill(K.soft, K.muted)}>cancelled</span> : n != null && <span style={pill(n ? K.soft : "#fbe3e1", n ? K.dim : K.red)}>{n ? `${n} present` : "no record"}</span>}
    </button>
  );
}

function MeetingForm({ boot, m, onSaved }: { boot: Boot; m?: Meeting; onSaved: () => void }) {
  const [f, setF] = useState({ meeting_on: m?.meeting_on || "", kind: m?.kind || "monthly", title: m?.title || "", venue: m?.venue || boot.settings.meeting_venue || "", starts_at: (m?.starts_at || "15:00").slice(0, 5), ends_at: (m?.ends_at || "19:00").slice(0, 5), guru: m?.guru || "", minutes_url: m?.minutes_url || "", status: m?.status || "planned" });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => { setBusy(true); setErr(null); try { await api("/api/kindle/meetings", { action: "save", id: m?.id, ...f }); onSaved(); } catch (e) { setErr(String((e as Error).message || e)); } setBusy(false); };
  return (
    <Card title={m ? "Edit the meeting" : "A new meeting"}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
        <div><label style={label}>Date</label><input style={input} type="date" value={f.meeting_on} onChange={(e) => set("meeting_on", e.target.value)} /></div>
        <div><label style={label}>Kind</label><select style={input} value={f.kind} onChange={(e) => set("kind", e.target.value)}>{["monthly", "outbound", "dinner", "zoom", "special"].map((k) => <option key={k}>{k}</option>)}</select></div>
        <div><label style={label}>Title</label><input style={input} value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="Monthly meeting" /></div>
        <div><label style={label}>Venue</label><input style={input} value={f.venue} onChange={(e) => set("venue", e.target.value)} /></div>
        <div><label style={label}>From</label><input style={input} type="time" value={f.starts_at} onChange={(e) => set("starts_at", e.target.value)} /></div>
        <div><label style={label}>To</label><input style={input} type="time" value={f.ends_at} onChange={(e) => set("ends_at", e.target.value)} /></div>
        <div><label style={label}>Knowledge Guru</label><input style={input} value={f.guru} onChange={(e) => set("guru", e.target.value)} /></div>
        <div><label style={label}>Minutes link (old)</label><input style={input} value={f.minutes_url} onChange={(e) => set("minutes_url", e.target.value)} placeholder="https://…" /></div>
        <div><label style={label}>Status</label><select style={input} value={f.status} onChange={(e) => set("status", e.target.value)}>{["planned", "held", "cancelled"].map((k) => <option key={k}>{k}</option>)}</select></div>
      </div>
      {err && <div style={{ color: K.red, fontSize: 13, marginTop: 8 }}>{err}</div>}
      <div style={{ marginTop: 10 }}><button onClick={save} disabled={busy} style={btn("primary")}>{busy ? "Saving…" : "Save"}</button></div>
    </Card>
  );
}

function MeetingPage({ boot, m, back, reload }: { boot: Boot; m: Meeting; back: () => void; reload: () => void }) {
  const me = boot.me;
  const mayMark = me.admin || me.roles.includes("scribe");
  const [edit, setEdit] = useState(false);
  const [tab, setTab] = useState<"agenda" | "minutes">(m.meeting_on <= boot.today ? "minutes" : "agenda");
  const [text, setText] = useState(""); const [editing, setEditing] = useState(false); const [busy, setBusy] = useState(false);
  useEffect(() => { setText((tab === "agenda" ? m.agenda : m.minutes) || ""); setEditing(false); }, [tab, m.agenda, m.minutes]);
  const members = boot.members.filter((x) => x.active || boot.attendance.some((a) => a.meeting_id === m.id && a.member_id === x.id));
  const att = new Map(boot.attendance.filter((a) => a.meeting_id === m.id).map((a) => [a.member_id, a]));
  const saveText = async () => { setBusy(true); try { await api("/api/kindle/meetings", { action: "save", id: m.id, [tab]: text }); setEditing(false); reload(); } catch (e) { alert(String((e as Error).message || e)); } setBusy(false); };
  const mark = async (member_id: string, status: string, late_min?: number, early_min?: number) => {
    const cur = att.get(member_id);
    try { await api("/api/kindle/meetings", { action: "mark", meeting_id: m.id, member_id, status, late_min: late_min ?? cur?.late_min ?? 0, early_min: early_min ?? cur?.early_min ?? 0, note: cur?.note || null }); reload(); } catch (e) { alert(String((e as Error).message || e)); }
  };
  const present = [...att.values()].filter((a) => a.status !== "absent" && a.status !== "excused").length;
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <button onClick={back} style={{ background: "none", border: "none", color: K.emberDark, fontWeight: 700, cursor: "pointer", textAlign: "left", padding: 0, fontSize: 13 }}>← TG Meetings</button>
      <Card>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <h1 style={{ ...serif, fontSize: 26, margin: 0 }}>{m.title || (m.kind === "monthly" ? "Monthly meeting" : m.kind)}</h1>
          <span style={{ color: K.dim }}>{dayName(m.meeting_on)}, {dmy(m.meeting_on)} · {(m.starts_at || "15:00").slice(0, 5)}–{(m.ends_at || "19:00").slice(0, 5)}{m.venue ? ` · ${m.venue}` : ""}</span>
          <div style={{ flex: 1 }} />
          {m.status === "cancelled" && <span style={pill(K.soft, K.muted)}>cancelled</span>}
          {boot.me.admin && <button onClick={() => setEdit(!edit)} style={btn("ghost")}>{edit ? "Close" : "Edit"}</button>}
        </div>
        <div style={{ fontSize: 13, color: K.muted, marginTop: 4 }}>{m.guru ? `Knowledge Guru: ${m.guru} · ` : ""}{present} present{!m.date_exact ? " · the date is the calendar rule's; the sheet had only the month" : ""}{m.minutes_url ? <> · <a href={m.minutes_url} target="_blank" rel="noreferrer" style={{ color: K.blue }}>old minutes</a></> : ""}</div>
      </Card>
      {edit && <MeetingForm boot={boot} m={m} onSaved={() => { setEdit(false); reload(); }} />}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(280px, 1fr)", gap: 16 }} className="kindle-two">
        <Card title={<span><button onClick={() => setTab("agenda")} style={tabBtn(tab === "agenda")}>Agenda</button><button onClick={() => setTab("minutes")} style={tabBtn(tab === "minutes")}>Minutes</button></span>} right={boot.me.admin && !editing ? <button onClick={() => setEditing(true)} style={{ ...btn("ghost", { padding: "4px 10px" }) }}>Write</button> : undefined}>
          {editing ? (<>
            <textarea style={{ ...input, minHeight: 320, fontSize: 14 }} value={text} onChange={(e) => setText(e.target.value)} placeholder={tab === "agenda" ? "## Check-ins\n## Main presentation — …\n## Burning issue\n" : "Who presented, what was decided, what carries to next month…"} />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}><button onClick={saveText} disabled={busy} style={btn("primary")}>{busy ? "Saving…" : `Save ${tab}`}</button><button onClick={() => setEditing(false)} style={btn("ghost")}>Cancel</button></div>
          </>) : (tab === "agenda" ? m.agenda : m.minutes) ? <Markdown text={(tab === "agenda" ? m.agenda : m.minutes) || ""} small /> : (
            <div style={{ color: K.muted, fontSize: 13 }}>{tab === "agenda" ? "No agenda written. The standard agenda is in the constitution, section 6." : m.minutes_url ? "The minutes of this meeting are in the linked document above." : "Minutes not written in the site. Placeholder until the scribe writes them here."}</div>
          )}
        </Card>
        <Card title="Attendance" right={mayMark ? "tap to mark; minutes late strike the fine" : undefined}>
          <div style={{ display: "grid", gap: 6 }}>
            {members.map((x) => { const a = att.get(x.id); const s = a?.status; return (
              <div key={x.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", borderTop: `1px solid ${K.soft}` }}>
                <Avatar m={x} size={28} />
                <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{x.short_name || x.name}{a?.late_min ? <span style={{ color: K.ember, fontWeight: 400 }}> · {a.late_min} min late</span> : ""}{a?.early_min ? <span style={{ color: K.ember, fontWeight: 400 }}> · left {a.early_min} min early</span> : ""}</div>
                {mayMark ? (
                  <div style={{ display: "flex", gap: 3 }}>
                    {(["present", "zoom", "absent", "excused"] as const).map((st) => <button key={st} onClick={() => mark(x.id, st)} title={st} style={{ border: `1px solid ${K.line}`, background: s === st ? (st === "present" ? K.green : st === "zoom" ? K.blue : st === "absent" ? K.red : K.muted) : "#fff", color: s === st ? "#fff" : K.dim, borderRadius: 6, width: 26, height: 26, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{st[0].toUpperCase()}</button>)}
                    {(s === "present" || s === "zoom") && <input type="number" min={0} max={240} defaultValue={a?.late_min || 0} onBlur={(e) => Number(e.target.value) !== (a?.late_min || 0) && mark(x.id, s, Number(e.target.value))} title="minutes late" style={{ width: 48, border: `1px solid ${K.line}`, borderRadius: 6, padding: "2px 4px", fontSize: 12 }} />}
                  </div>
                ) : <span style={pill(s === "present" || s === "zoom" ? K.green : s === "absent" ? K.red : s === "excused" ? K.muted : K.soft, s ? "#fff" : K.muted)}>{s || "—"}</span>}
              </div>
            ); })}
          </div>
        </Card>
      </div>
      <Feedback boot={boot} meetingId={m.id} meetingOn={m.meeting_on} />
      <style>{`@media (max-width: 820px){ .kindle-two { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
const tabBtn = (on: boolean): React.CSSProperties => ({ background: "none", border: "none", borderBottom: `2px solid ${on ? K.ember : "transparent"}`, padding: "0 2px 4px", marginRight: 14, cursor: "pointer", fontSize: 17, fontFamily: "Georgia, serif", color: on ? K.ink : K.muted });
