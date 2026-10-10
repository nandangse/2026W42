"use client";
/**
 * Meetings (Dr Raghu, 10 Oct 2026): the council's minutes — date, from–to
 * with the hours worked out, the place, the attendees typed in, and the
 * minutes as rich text with pictures and documents. The genie button
 * formats what is written into decisions, action points and discussion;
 * press it again after adding more.
 */
import { useEffect, useState } from "react";
import { api, btn, Card, Empty, Err, Eye, FileDrop, Files, input, label, Lightbox, MUTED, NAVY, ORANGE, Rich, RichField, Who, dmy, dmyt, istToday, leaderOf, type Boot, type LcFile } from "./shared";

interface M { id: string; held_on: string; from_time: string | null; to_time: string | null; location: string | null; attendees: string[]; minutes?: string | null; hours: number | null; created_by: string | null; created_at: string; updated_at: string; files?: number; viewed?: string[] }
interface C { id: string; body: string; added_by: string; created_at: string }

const hhmm = (t?: string | null) => t ? t.slice(0, 5) : "";
const hoursOf = (a: string, b: string) => { if (!a || !b) return null; const m = (t: string) => { const [h, mi] = t.split(":").map(Number); return h * 60 + (mi || 0); }; const d = m(b) - m(a); return d > 0 ? Math.round((d / 60) * 100) / 100 : null; };

export default function Meetings({ boot, arg, go }: { boot: Boot | null; arg: string | null; go: (k: string, a?: string | null) => void }) {
  const [list, setList] = useState<M[] | null>(null);
  const [adding, setAdding] = useState(false);
  const load = () => api<{ meetings: M[] }>("/api/lc/meetings").then((r) => setList(r.meetings)).catch(() => setList([]));
  useEffect(() => { load(); }, []);
  if (arg) return <View boot={boot} id={arg} back={() => { go("meetings"); load(); }} />;
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setAdding(true)} style={btn("primary")}>+ New minutes</button>
        <span className="text-xs" style={{ color: MUTED }}>{list ? `${list.length} meeting${list.length === 1 ? "" : "s"} on record` : ""}</span>
      </div>
      {list === null && <Empty>Opening…</Empty>}
      {list && list.length === 0 && <Empty>No minutes yet. Write the first — rough notes will do; Genie formats them.</Empty>}
      {list && list.length > 0 && (
        <div className="genie-scroll rounded-lg bg-white" style={{ border: "1px solid var(--line)", overflowX: "auto" }}>
          <table className="genie-table">
            <thead><tr><th>Date</th><th>From – to</th><th className="tnum">Hours</th><th>Location</th><th>Attendees</th><th>By</th><th>Files</th></tr></thead>
            <tbody>
              {list.map((m) => (
                <tr key={m.id} onClick={() => go("meetings", m.id)} style={{ cursor: "pointer" }}>
                  <td className="font-bold tnum" style={{ color: NAVY, whiteSpace: "nowrap" }}>{dmy(m.held_on)}</td>
                  <td className="tnum" style={{ whiteSpace: "nowrap" }}>{hhmm(m.from_time)}{m.to_time ? ` – ${hhmm(m.to_time)}` : ""}</td>
                  <td className="tnum">{m.hours ?? "—"}</td>
                  <td>{m.location || "—"}</td>
                  <td style={{ maxWidth: 360 }}>{m.attendees.join(", ") || "—"}</td>
                  <td><Who boot={boot} email={m.created_by} size={20} /></td>
                  <td className="tnum">{m.files || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {adding && <Form boot={boot} onDone={(id) => { setAdding(false); load(); if (id) go("meetings", id); }} />}
    </div>
  );
}

function Form({ boot, m, onDone }: { boot: Boot | null; m?: M; onDone: (id?: string) => void }) {
  const [f, setF] = useState({ held_on: m?.held_on || istToday(), from_time: hhmm(m?.from_time), to_time: hhmm(m?.to_time), location: m?.location || "Nandan House, Turbhe", attendees: m?.attendees.join(", ") || (boot?.members.map((x) => x.name).join(", ") || ""), minutes: m?.minutes || "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hrs = hoursOf(f.from_time, f.to_time);
  const save = async () => {
    setErr(null); setBusy(true);
    try { const r = await api<{ id?: string }>("/api/lc/meetings", { action: m ? "edit" : "create", id: m?.id, ...f, attendees: f.attendees.split(/[,\n]/).map((s) => s.trim()).filter(Boolean) }); onDone(r.id || m?.id); }
    catch (e) { setErr(String((e as Error).message)); }
    setBusy(false);
  };
  return (
    <Lightbox title={m ? `Edit — ${dmy(m.held_on)}` : "New minutes"} onClose={() => onDone()} wide>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        <div><label style={label}>Date</label><input type="date" style={input} value={f.held_on} onChange={(e) => setF({ ...f, held_on: e.target.value })} /></div>
        <div><label style={label}>From</label><input type="time" style={input} value={f.from_time} onChange={(e) => setF({ ...f, from_time: e.target.value })} /></div>
        <div><label style={label}>To</label><input type="time" style={input} value={f.to_time} onChange={(e) => setF({ ...f, to_time: e.target.value })} /></div>
        <div><label style={label}>Hours</label><div style={{ ...input, background: "var(--paper)" }} className="tnum">{hrs ?? "—"}</div></div>
        <div style={{ gridColumn: "span 2" }}><label style={label}>Location</label><input style={input} value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></div>
      </div>
      <label style={{ ...label, marginTop: 12 }}>Attendees — names, comma-separated; anyone, not only the council</label>
      <input style={input} value={f.attendees} onChange={(e) => setF({ ...f, attendees: e.target.value })} />
      <label style={{ ...label, marginTop: 12 }}>Minutes — rough notes are fine; 🧞 Format with Genie tidies them after saving</label>
      <RichField value={f.minutes} onChange={(h) => setF({ ...f, minutes: h })} minHeight={260} placeholder="Decisions, who does what by when, what was discussed…" />
      <Err e={err} />
      <div className="flex gap-2 mt-3"><button onClick={save} disabled={busy} style={btn("primary")}>{busy ? "Saving…" : m ? "Save" : "Save — then attach files"}</button><button onClick={() => onDone()} style={btn("ghost")}>Cancel</button></div>
    </Lightbox>
  );
}

function View({ boot, id, back }: { boot: Boot | null; id: string; back: () => void }) {
  const [d, setD] = useState<{ meeting: M; files: LcFile[]; comments: C[] } | null>(null);
  const [edit, setEdit] = useState(false); const [text, setText] = useState(""); const [genie, setGenie] = useState(false);
  const load = () => api<{ meeting: M; files: LcFile[]; comments: C[] }>(`/api/lc/meetings?id=${id}`).then(setD).catch((e) => alert(String(e.message || e)));
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
            <div className="text-sm mt-1"><b>Attendees:</b> {m.attendees.join(", ") || "—"}</div>
            <div className="text-xs mt-1 flex items-center gap-1 flex-wrap" style={{ color: MUTED }}>Minutes by <Who boot={boot} email={m.created_by} size={18} /> · {dmyt(m.created_at)}{m.updated_at !== m.created_at ? ` · edited ${dmyt(m.updated_at)}` : ""} · <Eye boot={boot} viewed={m.viewed || []} withList /></div>
          </div>
          {may && (
            <div className="flex gap-1.5 flex-wrap">
              <button onClick={format} disabled={genie} style={btn("primary", { padding: "6px 12px", fontSize: 12 })} title="Genie formats the minutes into decisions, action points and discussion — press again after adding more">{genie ? "🧞 Formatting…" : "🧞 Format with Genie"}</button>
              <FileDrop refKind="meeting" refId={id} onDone={load} label="📎 Pictures & documents" />
              <button onClick={() => setEdit(true)} style={btn("soft", { padding: "6px 12px", fontSize: 12 })}>Edit</button>
              <button onClick={remove} style={btn("ghost", { padding: "6px 10px", fontSize: 12, color: MUTED })}>Remove</button>
            </div>
          )}
        </div>
      </Card>
      <Card title="Minutes">
        {m.minutes ? <Rich html={m.minutes} /> : <span className="text-sm" style={{ color: MUTED }}>Nothing written yet{may ? " — Edit to write them" : ""}.</span>}
      </Card>
      {d.files.length > 0 && <Card title="Pictures & documents"><Files files={d.files} boot={boot} mayRemove={may} onChange={load} /></Card>}
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
    </div>
  );
}
