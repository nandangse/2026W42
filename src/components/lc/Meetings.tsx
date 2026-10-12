"use client";
/**
 * Meetings (Dr Raghu, 10 Oct 2026): the council's minutes — date, from–to
 * with the hours worked out, the place, the attendees, and the minutes as
 * rich text with pictures and documents. The genie button formats what is
 * written into the standard Minutes of Meeting; press it again after
 * adding more.
 *
 * Later the same day: "this should have it from writing employees first,
 * then mention non-employees. This then can become the standard MoM in
 * system!!! Also put in template. It will come from template." So the
 * attendees are picked from the HRMS rolls (the council pre-ticked), the
 * guests are a line of their own, and new minutes open on the template —
 * Dr Raghu's to edit, kept once in lc_setting.
 */
import { useEffect, useMemo, useState } from "react";
import { CheckinForm, CheckinRound, type Checkin } from "./Checkin";
import { api, btn, Card, Empty, Err, Eye, FileDrop, Files, input, label, Lightbox, MUTED, NAVY, ORANGE, Rich, RichField, Who, dmy, dmyt, istToday, leaderOf, type Boot, type LcFile } from "./shared";
import { MOM_TEMPLATE } from "@/lib/lc/mom-template";

interface M { id: string; held_on: string; from_time: string | null; to_time: string | null; location: string | null; attendees: string[]; guests?: string[]; agenda?: string | null; reading?: string | null; minutes?: string | null; hours: number | null; created_by: string | null; created_at: string; updated_at: string; files?: number; viewed?: string[] }
interface C { id: string; body: string; added_by: string; created_at: string }
interface Person { name: string; designation: string | null; department: string | null; email: string | null }

const hhmm = (t?: string | null) => t ? t.slice(0, 5) : "";
const hoursOf = (a: string, b: string) => { if (!a || !b) return null; const m = (t: string) => { const [h, mi] = t.split(":").map(Number); return h * 60 + (mi || 0); }; const d = m(b) - m(a); return d > 0 ? Math.round((d / 60) * 100) / 100 : null; };

function usePeople(): Person[] {
  const [p, setP] = useState<Person[]>([]);
  useEffect(() => { api<{ people: Person[] }>("/api/lc/people").then((r) => setP(r.people)).catch(() => setP([])); }, []);
  return p;
}

export default function Meetings({ boot, arg, go }: { boot: Boot | null; arg: string | null; go: (k: string, a?: string | null) => void }) {
  const [list, setList] = useState<M[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [tpl, setTpl] = useState(false); const [ck, setCk] = useState(false);
  const load = () => api<{ meetings: M[] }>("/api/lc/meetings").then((r) => setList(r.meetings)).catch(() => setList([]));
  useEffect(() => { load(); }, []);
  if (arg) return <View boot={boot} id={arg} back={() => { go("meetings"); load(); }} go={go} />;
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setCk(true)} style={btn("primary", { background: "var(--green)", borderColor: "var(--green)" })} title="T1, T2, B1, the burning issue, goals and results, the 99-day plan, learning">✅ Leaders Check in</button>
        <button onClick={() => setAdding(true)} style={btn("soft")}>+ New minutes</button>
        {boot?.me.isOwner && <button onClick={() => setTpl(true)} style={btn("soft")} title="The standard Minutes of Meeting every new set opens on">✎ MoM template</button>}
        <span className="text-xs" style={{ color: MUTED }}>{list ? `${list.length} meeting${list.length === 1 ? "" : "s"} on record` : ""}</span>
      </div>
      {list === null && <Empty>Opening…</Empty>}
      {list && list.length === 0 && <Empty>No minutes yet. Write the first — the template is already laid out; Genie tidies the notes.</Empty>}
      {list && list.length > 0 && (
        <div className="genie-scroll rounded-lg bg-white" style={{ border: "1px solid var(--line)", overflowX: "auto" }}>
          <table className="genie-table">
            <thead><tr><th>Date</th><th>From – to</th><th className="tnum">Hours</th><th>Location</th><th>Attendees</th><th>Guests</th><th>By</th><th>Files</th></tr></thead>
            <tbody>
              {list.map((m) => (
                <tr key={m.id} onClick={() => go("meetings", m.id)} style={{ cursor: "pointer" }}>
                  <td className="font-bold tnum" style={{ color: NAVY, whiteSpace: "nowrap" }}>{dmy(m.held_on)}</td>
                  <td className="tnum" style={{ whiteSpace: "nowrap" }}>{hhmm(m.from_time)}{m.to_time ? ` – ${hhmm(m.to_time)}` : ""}</td>
                  <td className="tnum">{m.hours ?? "—"}</td>
                  <td>{m.location || "—"}</td>
                  <td style={{ maxWidth: 360 }}>{m.attendees.join(", ") || "—"}</td>
                  <td style={{ maxWidth: 220 }}>{(m.guests || []).join(", ") || "—"}</td>
                  <td><Who boot={boot} email={m.created_by} size={20} /></td>
                  <td className="tnum">{m.files || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {adding && <Form boot={boot} onDone={(id) => { setAdding(false); load(); if (id) go("meetings", id); }} />}
      {tpl && <TemplateEditor boot={boot} onDone={() => setTpl(false)} />}
      {ck && <CheckinForm boot={boot} meetings={list || []} onDone={(r) => { setCk(false); if (r) go("meetings", r.meetingId); }} />}
    </div>
  );
}

/** EMPLOYEES FIRST: a search box over the HRMS rolls, the chosen as chips; the council pre-ticked on a new set. */
function Attendees({ value, onChange, people, boot }: { value: string[]; onChange: (v: string[]) => void; people: Person[]; boot: Boot | null }) {
  const [q, setQ] = useState("");
  const pool = useMemo(() => {
    const names = new Map<string, Person>();
    for (const p of people) names.set(p.name.toLowerCase(), p);
    for (const m of boot?.members || []) if (!names.has(m.name.toLowerCase())) names.set(m.name.toLowerCase(), { name: m.name, designation: "Leaders Council", department: null, email: m.email });
    return [...names.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [people, boot]);
  const needle = q.trim().toLowerCase();
  const hits = needle ? pool.filter((p) => !value.includes(p.name) && (p.name.toLowerCase().includes(needle) || (p.designation || "").toLowerCase().includes(needle) || (p.department || "").toLowerCase().includes(needle))).slice(0, 8) : [];
  const add = (n: string) => { if (!value.includes(n)) onChange([...value, n]); setQ(""); };
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-1.5">
        {value.map((n) => { const l = boot?.members.find((m) => m.name === n); return (
          <span key={n} className="inline-flex items-center gap-1 rounded-full pl-1 pr-2 font-semibold" style={{ fontSize: 12, background: l ? l.colour : "var(--paper)", color: l ? "#fff" : NAVY, border: l ? "none" : "1px solid var(--line)", height: 24 }}>
            <span className="rounded-full inline-flex items-center justify-center" style={{ width: 18, height: 18, fontSize: 9, background: "rgba(255,255,255,.25)" }}>{(l?.initials || n.slice(0, 2)).toUpperCase()}</span>{n}
            <button onClick={() => onChange(value.filter((x) => x !== n))} style={{ opacity: .8 }} aria-label={`Remove ${n}`}>×</button>
          </span>
        ); })}
        {value.length === 0 && <span className="text-xs" style={{ color: MUTED }}>Nobody picked yet.</span>}
      </div>
      <div className="relative">
        <input style={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Type a name to add — ${pool.length} on the rolls`} onKeyDown={(e) => { if (e.key === "Enter" && hits[0]) { e.preventDefault(); add(hits[0].name); } }} />
        {hits.length > 0 && (
          <div className="absolute left-0 right-0 rounded-lg bg-white" style={{ top: "calc(100% + 4px)", border: "1px solid var(--line)", boxShadow: "0 8px 24px rgba(0,0,0,.15)", zIndex: 5 }}>
            {hits.map((p) => <button key={p.name} onClick={() => add(p.name)} className="w-full text-left px-3 py-1.5 hover:bg-gray-50" style={{ fontSize: 13, color: NAVY }}><b>{p.name}</b> <span style={{ color: MUTED, fontSize: 11 }}>{[p.designation, p.department].filter(Boolean).join(" · ")}</span></button>)}
          </div>
        )}
      </div>
    </div>
  );
}

function Form({ boot, m, onDone }: { boot: Boot | null; m?: M; onDone: (id?: string) => void }) {
  const people = usePeople();
  const template = boot?.settings.mom_template || MOM_TEMPLATE;
  const [f, setF] = useState({ held_on: m?.held_on || istToday(), from_time: hhmm(m?.from_time), to_time: hhmm(m?.to_time), location: m?.location || "Nandan House, Turbhe", guests: (m?.guests || []).join(", "), agenda: m?.agenda || "", reading: m?.reading || "", minutes: m?.minutes || template });
  /* THE TOP SLOT (Dr Raghu, 10 Oct 2026: "a top slot split into two — left all
     the content, right the agenda. Once written can be collapsed. Below, the
     minutes full"). Open on a new set; folded on an edit, where the top is
     already written and the minutes are the work. */
  const [top, setTop] = useState(!m);
  const [attendees, setAttendees] = useState<string[]>(m ? m.attendees : (boot?.members.map((x) => x.name) || []));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hrs = hoursOf(f.from_time, f.to_time);
  const save = async () => {
    setErr(null); setBusy(true);
    try { const r = await api<{ id?: string }>("/api/lc/meetings", { action: m ? "edit" : "create", id: m?.id, ...f, attendees, guests: f.guests.split(/[,\n]/).map((s) => s.trim()).filter(Boolean) }); onDone(r.id || m?.id); }
    catch (e) { setErr(String((e as Error).message)); }
    setBusy(false);
  };
  return (
    <Lightbox title={m ? `Edit — ${dmy(m.held_on)}` : "New minutes"} onClose={() => onDone()} wide>
      <button onClick={() => setTop((t) => !t)} className="w-full text-left flex items-center gap-2 rounded px-3 py-2 mb-2" style={{ background: "var(--paper)", color: NAVY, fontWeight: 700, fontSize: 13 }}>
        <span style={{ fontSize: 11 }}>{top ? "▼" : "▶"}</span> The meeting — when, where, who, what to read · and the agenda
        {!top && <span className="font-normal truncate" style={{ color: MUTED, fontSize: 12 }}>· {dmy(f.held_on)}{f.from_time ? ` ${f.from_time}` : ""}{f.location ? ` · ${f.location}` : ""} · {attendees.length} attending</span>}
      </button>
      {top && (
        <div className="grid gap-4 lc-two" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)" }}>
          <div>
            <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
              <div style={{ gridColumn: "span 3" }}><label style={label}>Date</label><input type="date" style={input} value={f.held_on} onChange={(e) => setF({ ...f, held_on: e.target.value })} /></div>
              <div><label style={label}>From</label><input type="time" style={input} value={f.from_time} onChange={(e) => setF({ ...f, from_time: e.target.value })} /></div>
              <div><label style={label}>To</label><input type="time" style={input} value={f.to_time} onChange={(e) => setF({ ...f, to_time: e.target.value })} /></div>
              <div><label style={label}>Hours</label><div style={{ ...input, background: "var(--paper)" }} className="tnum">{hrs ?? "—"}</div></div>
              <div style={{ gridColumn: "span 3" }}><label style={label}>Location</label><input style={input} value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></div>
            </div>
            <label style={{ ...label, marginTop: 10 }}>Attendees — employees, from the rolls</label>
            <Attendees value={attendees} onChange={setAttendees} people={people} boot={boot} />
            <label style={{ ...label, marginTop: 10 }}>Guests — not on the rolls; names, comma-separated</label>
            <input style={input} value={f.guests} onChange={(e) => setF({ ...f, guests: e.target.value })} placeholder="A customer, a consultant, a visitor…" />
            <label style={{ ...label, marginTop: 10 }}>Pre-reading — links, references, what to read before</label>
            <RichField value={f.reading} onChange={(h) => setF({ ...f, reading: h })} minHeight={110} placeholder="A YouTube link, a note, a document…" />
          </div>
          <div>
            <label style={label}>Agenda</label>
            <RichField value={f.agenda} onChange={(h) => setF({ ...f, agenda: h })} minHeight={360} placeholder="1. … 2. … — what the meeting is for" />
          </div>
        </div>
      )}
      <label style={{ ...label, marginTop: 14 }}>Minutes — the standard MoM, full width; write under the headings, 🧞 Format with Genie tidies it after saving</label>
      <RichField value={f.minutes} onChange={(h) => setF({ ...f, minutes: h })} minHeight={360} />
      <style>{`@media (max-width: 900px){ .lc-two { grid-template-columns: 1fr !important; } }`}</style>
      <Err e={err} />
      <div className="flex gap-2 mt-3"><button onClick={save} disabled={busy} style={btn("primary")}>{busy ? "Saving…" : m ? "Save" : "Save — then attach files"}</button><button onClick={() => onDone()} style={btn("ghost")}>Cancel</button></div>
    </Lightbox>
  );
}

/** The owner's template: edited once, every new set of minutes opens on it. */
function TemplateEditor({ boot, onDone }: { boot: Boot | null; onDone: () => void }) {
  const [html, setHtml] = useState(boot?.settings.mom_template || MOM_TEMPLATE);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => { setErr(null); try { await api("/api/lc/settings", { key: "mom_template", value: html }); if (boot) boot.settings.mom_template = html; onDone(); } catch (e) { setErr(String((e as Error).message)); } };
  return (
    <Lightbox title="The standard Minutes of Meeting — the template" onClose={onDone} wide>
      <div className="text-sm mb-2" style={{ color: "var(--dim)" }}>Every new set of minutes opens on this. Genie formats into these headings, so keep them as headings. Minutes already written are not touched.</div>
      <RichField value={html} onChange={setHtml} minHeight={360} />
      <Err e={err} />
      <div className="flex gap-2 mt-3"><button onClick={save} style={btn("primary")}>Save the template</button><button onClick={() => setHtml(MOM_TEMPLATE)} style={btn("soft")}>Back to Genie&apos;s default</button><button onClick={onDone} style={btn("ghost")}>Cancel</button></div>
    </Lightbox>
  );
}

function View({ boot, id, back, go }: { boot: Boot | null; id: string; back: () => void; go: (k: string, a?: string | null) => void }) {
  const [d, setD] = useState<{ meeting: M; files: LcFile[]; comments: C[]; checkins: Checkin[] } | null>(null);
  const [edit, setEdit] = useState(false); const [text, setText] = useState(""); const [genie, setGenie] = useState(false);
  const [top, setTop] = useState(true); const [ck, setCk] = useState(false);
  const load = () => api<{ meeting: M; files: LcFile[]; comments: C[]; checkins: Checkin[] }>(`/api/lc/meetings?id=${id}`).then(setD).catch((e) => alert(String(e.message || e)));
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return <Empty>Opening…</Empty>;
  const m = d.meeting;
  const may = !!boot && (boot.me.isOwner || m.created_by?.toLowerCase() === boot.me.email.toLowerCase());
  const format = async () => { setGenie(true); try { await api("/api/lc/genie", { action: "format_minutes", id }); load(); } catch (e) { alert(String((e as Error).message)); } setGenie(false); };
  const comment = async () => { if (!text.trim()) return; await api("/api/lc/meetings", { action: "comment", id, body: text }); setText(""); load(); };
  const remove = async () => { if (!confirm("Remove these minutes, their files and talk?")) return; await api("/api/lc/meetings", { action: "remove", id }); back(); };
  return (
    <div className="grid gap-3">
      <button onClick={back} className="text-left font-bold" style={{ color: ORANGE, fontSize: 13 }}>← Meetings</button>
      <Card accent="var(--navy)">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="font-bold" style={{ fontSize: 20, color: NAVY }}>Leaders Council — {dmy(m.held_on)}</div>
            <div className="text-sm" style={{ color: "var(--dim)" }}>
              {hhmm(m.from_time)}{m.to_time ? ` – ${hhmm(m.to_time)}` : ""}{m.hours ? ` · ${m.hours} h` : ""}{m.location ? ` · ${m.location}` : ""}
            </div>
            <div className="text-xs mt-1 flex items-center gap-1 flex-wrap" style={{ color: MUTED }}>Minutes by <Who boot={boot} email={m.created_by} size={18} /> · {dmyt(m.created_at)}{m.updated_at !== m.created_at ? ` · edited ${dmyt(m.updated_at)}` : ""} · <Eye boot={boot} viewed={m.viewed || []} withList /></div>
          </div>
          {may && (
            <div className="flex gap-1.5 flex-wrap">
              <button onClick={format} disabled={genie} style={btn("primary", { padding: "6px 12px", fontSize: 12 })} title="Genie formats the minutes into the standard MoM — press again after adding more">{genie ? "🧞 Formatting…" : "🧞 Format with Genie"}</button>
              <FileDrop refKind="meeting" refId={id} onDone={load} label="📎 Pictures & documents" />
              <button onClick={() => setEdit(true)} style={btn("soft", { padding: "6px 12px", fontSize: 12 })}>Edit</button>
              <button onClick={remove} style={btn("ghost", { padding: "6px 10px", fontSize: 12, color: MUTED })}>Remove</button>
            </div>
          )}
        </div>
      </Card>
      <button onClick={() => setTop((t) => !t)} className="w-full text-left flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "#fff", border: "1px solid var(--line)", color: NAVY, fontWeight: 700, fontSize: 13 }}>
        <span style={{ fontSize: 11 }}>{top ? "▼" : "▶"}</span> Who was there, what was read · the agenda
        {!top && <span className="font-normal truncate" style={{ color: MUTED, fontSize: 12 }}>· {m.attendees.length} attended{(m.guests || []).length ? ` · ${(m.guests || []).length} guest${(m.guests || []).length === 1 ? "" : "s"}` : ""}</span>}
      </button>
      {top && (
        <div className="grid gap-3 lc-two" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)" }}>
          <Card title="The meeting" style={{ alignSelf: "start" }}>
            <div className="text-sm"><b>Attendees:</b> {m.attendees.join(", ") || "—"}</div>
            {(m.guests || []).length > 0 && <div className="text-sm mt-1"><b>Guests:</b> {(m.guests || []).join(", ")}</div>}
            {m.reading && <div className="mt-3"><div className="text-xs font-bold mb-1" style={{ color: MUTED, letterSpacing: 0.4 }}>PRE-READING</div><Rich html={m.reading} small /></div>}
            {d.files.length > 0 && <div className="mt-3"><div className="text-xs font-bold mb-1" style={{ color: MUTED, letterSpacing: 0.4 }}>PICTURES & DOCUMENTS</div><Files files={d.files} boot={boot} mayRemove={may} onChange={load} compact /></div>}
          </Card>
          <Card title="Agenda" accent="var(--accent)" style={{ alignSelf: "start" }}>
            {m.agenda ? <Rich html={m.agenda} /> : <span className="text-sm" style={{ color: MUTED }}>No agenda written{may ? " — Edit to write it" : ""}.</span>}
          </Card>
        </div>
      )}
      <CheckinRound boot={boot} checkins={d.checkins || []} go={go} onCheckin={() => setCk(true)} onChange={load} />
      <Card title="Minutes">
        {m.minutes ? <Rich html={m.minutes} /> : <span className="text-sm" style={{ color: MUTED }}>Nothing written yet{may ? " — Edit to write them" : ""}.</span>}
      </Card>
      <style>{`@media (max-width: 900px){ .lc-two { grid-template-columns: 1fr !important; } }`}</style>
      <Card title="Talk" right={<span className="text-xs" style={{ color: MUTED }}>{d.comments.length}</span>}>
        <div className="grid gap-2">
          {d.comments.map((c) => (
            <div key={c.id} className="flex gap-2 items-start">
              <Who boot={boot} email={c.added_by} size={24} withName={false} />
              <div className="flex-1 text-sm"><div className="text-xs" style={{ color: MUTED }}><b style={{ color: NAVY }}>{leaderOf(boot, c.added_by).name}</b> · {dmyt(c.created_at)}</div><div style={{ whiteSpace: "pre-wrap" }}>{c.body}</div></div>
            </div>
          ))}
          {d.comments.length === 0 && <span className="text-sm" style={{ color: MUTED }}>Nothing said yet.</span>}
        </div>
        <textarea style={{ ...input, minHeight: 60, marginTop: 10 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="A correction, a follow-up…" onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") comment(); }} />
        <div className="mt-2"><button onClick={comment} disabled={!text.trim()} style={btn("primary")}>Say it</button></div>
      </Card>
      {edit && <Form boot={boot} m={m} onDone={() => { setEdit(false); load(); }} />}
      {ck && <CheckinForm boot={boot} meetings={[{ id: m.id, held_on: m.held_on }]} meetingId={m.id} onDone={() => { setCk(false); load(); }} />}
    </div>
  );
}
