"use client";
import { useEffect, useRef, useState } from "react";
import { api, Avatar, btn, Card, dmy, input, K, label, Markdown, pill, serif, type Boot } from "./shared";

interface P { id: string; title: string; presenter_id: string | null; meeting_id: string | null; presented_on: string | null; video_url: string | null; notes?: string | null; created_by: string | null; created_at: string; files?: { name: string; mime: string | null }[]; comments?: number; watched?: number; seen?: boolean }
interface F { id: string; path: string; name: string; mime: string | null; bytes: number | null; uploaded_by: string | null }
interface C { id: string; member_id: string | null; body: string; created_at: string }
interface V { member_id: string; first_at: string; last_at: string; opens: number }
const fileHref = (path: string) => `/api/kindle/file?path=${encodeURIComponent(path)}`;

/** The video, in the page, for the links people actually paste: YouTube, Vimeo, Google Drive, Loom; anything else as a link. */
function embed(url: string): string | null {
  const yt = /(?:youtube\.com\/(?:watch\?v=|live\/|shorts\/)|youtu\.be\/)([\w-]{6,})/.exec(url); if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vm = /vimeo\.com\/(\d+)/.exec(url); if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  const dr = /drive\.google\.com\/file\/d\/([\w-]+)/.exec(url); if (dr) return `https://drive.google.com/file/d/${dr[1]}/preview`;
  const lo = /loom\.com\/share\/([\w-]+)/.exec(url); if (lo) return `https://www.loom.com/embed/${lo[1]}`;
  return null;
}

/** Presentations: the deck a member gave the TG — video, PPT/PDF, notes, the room's comments, and who has watched. */
export default function Presentations({ boot, arg, go }: { boot: Boot; arg: string | null; go: (k: string, a?: string | null) => void }) {
  const [list, setList] = useState<P[] | null>(null);
  const [adding, setAdding] = useState(false);
  const load = () => api<{ presentations: P[] }>("/api/kindle/presentations").then((r) => setList(r.presentations)).catch(() => setList([]));
  useEffect(() => { load(); }, []);
  const name = (id: string | null) => boot.members.find((m) => m.id === id)?.short_name || "—";
  if (arg) return <View boot={boot} id={arg} back={() => { go("presentations"); load(); }} name={name} />;
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h1 style={{ ...serif, fontSize: 26, margin: 0 }}>Presentations</h1>
        <span style={{ color: K.muted, fontSize: 13 }}>{list ? `${list.length} on record` : ""}</span>
        <div style={{ flex: 1 }} />
        <button onClick={() => setAdding(!adding)} style={btn(adding ? "ghost" : "primary")}>{adding ? "Close" : "+ Add a presentation"}</button>
      </div>
      {adding && <Form boot={boot} onDone={(id) => { setAdding(false); load(); if (id) go("presentations", id); }} />}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
        {list?.map((p) => { const m = boot.members.find((x) => x.id === p.presenter_id); return (
          <button key={p.id} onClick={() => go("presentations", p.id)} style={{ textAlign: "left", background: "#fff", border: `1px solid ${p.seen ? K.line : K.ember}`, borderRadius: 14, padding: 14, cursor: "pointer" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {m && <Avatar m={m} size={40} />}
              <div style={{ minWidth: 0, flex: 1 }}><div style={{ ...serif, fontSize: 17 }}>{p.title}</div><div style={{ fontSize: 12, color: K.muted }}>{name(p.presenter_id)}{p.presented_on ? ` · ${dmy(p.presented_on)}` : ""}</div></div>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
              {p.video_url && <span style={pill(K.soft, K.dim)}>▶ video</span>}
              {(p.files || []).map((f, i) => <span key={i} style={pill(K.soft, K.dim)}>{/pdf/i.test(f.name) ? "PDF" : /ppt|key/i.test(f.name) ? "Deck" : "File"}</span>)}
              <span style={pill(K.soft, K.dim)}>{p.comments} comment{p.comments === 1 ? "" : "s"}</span>
              <span style={pill(p.watched ? "#e3f3e8" : K.soft, p.watched ? K.green : K.muted)}>{p.watched} of {boot.members.filter((x) => x.active).length} watched</span>
              {!p.seen && <span style={pill(K.ember)}>new for you</span>}
            </div>
          </button>
        ); })}
        {list && list.length === 0 && <Card><span style={{ color: K.muted }}>None yet. Add the deck from the last meeting: the video link, the PPT or PDF, and the presenter's notes.</span></Card>}
      </div>
    </div>
  );
}

function Form({ boot, p, onDone }: { boot: Boot; p?: P; onDone: (id?: string) => void }) {
  const [f, setF] = useState({ title: p?.title || "", presenter_id: p?.presenter_id || boot.me.id, meeting_id: p?.meeting_id || "", presented_on: p?.presented_on || boot.today, video_url: p?.video_url || "", notes: p?.notes || "" });
  const [err, setErr] = useState<string | null>(null);
  const save = async () => { setErr(null); try { const r = await api<{ id?: string }>("/api/kindle/presentations", { action: p ? "edit" : "create", id: p?.id, ...f }); onDone(r.id || p?.id); } catch (e) { setErr(String((e as Error).message || e)); } };
  return (
    <Card title={p ? "Edit" : "A new presentation"}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
        <div style={{ gridColumn: "span 2" }}><label style={label}>Title</label><input style={input} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div><label style={label}>Presenter</label><select style={input} value={f.presenter_id} onChange={(e) => setF({ ...f, presenter_id: e.target.value })}>{boot.members.map((m) => <option key={m.id} value={m.id}>{m.short_name || m.name}</option>)}</select></div>
        <div><label style={label}>Meeting</label><select style={input} value={f.meeting_id} onChange={(e) => { const m = boot.meetings.find((x) => x.id === e.target.value); setF({ ...f, meeting_id: e.target.value, presented_on: m ? m.meeting_on : f.presented_on }); }}><option value="">—</option>{[...boot.meetings].reverse().slice(0, 36).map((m) => <option key={m.id} value={m.id}>{dmy(m.meeting_on)}</option>)}</select></div>
        <div><label style={label}>Presented on</label><input style={input} type="date" value={f.presented_on} onChange={(e) => setF({ ...f, presented_on: e.target.value })} /></div>
        <div style={{ gridColumn: "span 2" }}><label style={label}>Video link</label><input style={input} value={f.video_url} onChange={(e) => setF({ ...f, video_url: e.target.value })} placeholder="YouTube, Drive, Zoom or Loom link" /></div>
      </div>
      <label style={{ ...label, marginTop: 10 }}>Notes — the presenter's own, or the scribe's</label>
      <textarea style={{ ...input, minHeight: 120 }} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="What the deck argued, what the room said, what was asked of the group…" />
      {err && <div style={{ color: K.red, fontSize: 13, marginTop: 8 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}><button onClick={save} style={btn("primary")}>{p ? "Save" : "Add — then attach the deck"}</button><button onClick={() => onDone()} style={btn("ghost")}>Cancel</button></div>
    </Card>
  );
}

function View({ boot, id, back, name }: { boot: Boot; id: string; back: () => void; name: (id: string | null) => string }) {
  const [d, setD] = useState<{ presentation: P; files: F[]; comments: C[]; views: V[] } | null>(null);
  const [edit, setEdit] = useState(false); const [text, setText] = useState(""); const [busy, setBusy] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const load = () => api<{ presentation: P; files: F[]; comments: C[]; views: V[] }>(`/api/kindle/presentations?id=${id}`).then(setD).catch((e) => alert(String(e.message || e)));
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return <Card><span style={{ color: K.muted }}>Opening…</span></Card>;
  const p = d.presentation; const presenter = boot.members.find((m) => m.id === p.presenter_id);
  const may = p.presenter_id === boot.me.id || p.created_by === boot.me.id || boot.me.admin;
  const emb = p.video_url ? embed(p.video_url) : null;
  const upload = async (fl: FileList) => { const fd = new FormData(); fd.append("id", id); [...fl].forEach((x) => fd.append("file", x)); setBusy("Uploading…"); try { const r = await fetch("/api/kindle/presentations", { method: "POST", body: fd }); const j = await r.json(); if (!r.ok) throw new Error(j.error); load(); } catch (e) { alert(String((e as Error).message || e)); } setBusy(null); };
  const comment = async () => { if (!text.trim()) return; await api("/api/kindle/presentations", { action: "comment", id, body: text }); setText(""); load(); };
  const members = boot.members.filter((m) => m.active);
  const watched = d.views.filter((v) => members.some((m) => m.id === v.member_id));
  const notYet = members.filter((m) => !d.views.some((v) => v.member_id === m.id));
  const pdf = d.files.find((f) => /pdf/i.test(f.name));
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <button onClick={back} style={{ background: "none", border: "none", color: K.emberDark, fontWeight: 700, cursor: "pointer", textAlign: "left", padding: 0, fontSize: 13 }}>← Presentations</button>
      {edit ? <Form boot={boot} p={p} onDone={() => { setEdit(false); load(); }} /> : (
        <Card>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            {presenter && <Avatar m={presenter} size={48} />}
            <div style={{ flex: 1, minWidth: 220 }}><h1 style={{ ...serif, fontSize: 24, margin: 0 }}>{p.title}</h1><div style={{ fontSize: 13, color: K.muted }}>{name(p.presenter_id)}{p.presented_on ? ` · ${dmy(p.presented_on)}` : ""}{p.meeting_id ? " · TG meeting" : ""}</div></div>
            {may && <div style={{ display: "flex", gap: 6 }}><button onClick={() => setEdit(true)} style={btn("ghost", { padding: "5px 10px", fontSize: 12 })}>Edit</button><button onClick={async () => { if (confirm("Remove this presentation, its files and comments?")) { await api("/api/kindle/presentations", { action: "remove", id }); back(); } }} style={btn("ghost", { padding: "5px 10px", fontSize: 12 })}>Remove</button></div>}
          </div>
        </Card>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.5fr) minmax(280px, 1fr)", gap: 12 }} className="kindle-two">
        <div style={{ display: "grid", gap: 12 }}>
          <Card title="Video" right={p.video_url ? <a href={p.video_url} target="_blank" rel="noreferrer" style={{ color: K.blue }}>open in a new tab</a> : undefined}>
            {emb ? <div style={{ position: "relative", paddingTop: "56.25%", background: "#000", borderRadius: 10, overflow: "hidden" }}><iframe src={emb} title={p.title} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }} /></div>
              : p.video_url ? <a href={p.video_url} target="_blank" rel="noreferrer" style={{ color: K.blue, fontSize: 14 }}>{p.video_url}</a>
              : <span style={{ color: K.muted, fontSize: 13 }}>No recording linked{may ? " — Edit to add the link" : ""}.</span>}
          </Card>
          <Card title="Deck" right={may ? <><input ref={file} type="file" accept=".pdf,.ppt,.pptx,.key,.doc,.docx" multiple hidden onChange={(e) => e.target.files?.length && upload(e.target.files)} /><button onClick={() => file.current?.click()} disabled={!!busy} style={btn("ghost", { padding: "4px 10px" })}>{busy || "+ PPT / PDF"}</button></> : undefined}>
            {d.files.length === 0 ? <span style={{ color: K.muted, fontSize: 13 }}>No file yet.</span> : (
              <div style={{ display: "grid", gap: 8 }}>
                {d.files.map((f) => (
                  <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 10, background: K.soft, borderRadius: 10, padding: "8px 12px" }}>
                    <span style={{ fontSize: 22 }}>{/pdf/i.test(f.name) ? "📄" : "📊"}</span>
                    <div style={{ flex: 1, minWidth: 0 }}><a href={fileHref(f.path)} target="_blank" rel="noreferrer" style={{ color: K.ink, fontWeight: 700, fontSize: 14, textDecoration: "none" }}>{f.name}</a><div style={{ fontSize: 11, color: K.muted }}>{f.bytes ? `${(f.bytes / 1048576).toFixed(1)} MB · ` : ""}by {name(f.uploaded_by)}</div></div>
                    <a href={fileHref(f.path)} target="_blank" rel="noreferrer" style={{ ...btn("ghost", { padding: "4px 10px", fontSize: 12 }), textDecoration: "none" }}>Open</a>
                    {may && <button onClick={async () => { if (confirm(`Remove ${f.name}?`)) { await api("/api/kindle/presentations", { action: "remove_file", file_id: f.id }); load(); } }} style={btn("ghost", { padding: "4px 8px", fontSize: 12 })}>✕</button>}
                  </div>
                ))}
                {pdf && <iframe src={fileHref(pdf.path)} title="deck" style={{ width: "100%", height: 520, border: `1px solid ${K.line}`, borderRadius: 10 }} />}
              </div>
            )}
          </Card>
          <Card title="Notes">{p.notes ? <Markdown text={p.notes} /> : <span style={{ color: K.muted, fontSize: 13 }}>No notes yet{may ? " — Edit to write them" : ""}.</span>}</Card>
        </div>
        <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
          <Card title="Who watched" right={`${watched.length} of ${members.length}`}>
            <div style={{ display: "grid", gap: 6 }}>
              {watched.sort((a, b) => a.first_at.localeCompare(b.first_at)).map((v) => { const m = members.find((x) => x.id === v.member_id)!; return <div key={v.member_id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}><Avatar m={m} size={26} /><b>{m.short_name || m.name}</b><span style={{ color: K.muted, fontSize: 11 }}>first {dmy(v.first_at)} · {v.opens}×</span></div>; })}
              {notYet.length > 0 && <div style={{ fontSize: 12, color: K.muted, marginTop: 4 }}>Not yet: {notYet.map((m) => m.short_name || m.name).join(", ")}</div>}
            </div>
          </Card>
          <Card title="Comments" right={`${d.comments.length}`}>
            <div style={{ display: "grid", gap: 8 }}>
              {d.comments.map((c) => <div key={c.id} style={{ display: "flex", gap: 8 }}><Avatar m={boot.members.find((m) => m.id === c.member_id) || { name: "?", photo_path: null }} size={26} /><div style={{ flex: 1, fontSize: 13 }}><div style={{ fontSize: 11, color: K.muted }}><b style={{ color: K.ink }}>{name(c.member_id)}</b> · {dmy(c.created_at)}{(c.member_id === boot.me.id || boot.me.admin) && <> · <button onClick={async () => { await api("/api/kindle/presentations", { action: "uncomment", comment_id: c.id }); load(); }} style={{ background: "none", border: "none", color: K.muted, cursor: "pointer", padding: 0, fontSize: 11 }}>remove</button></>}</div><div style={{ whiteSpace: "pre-wrap" }}>{c.body}</div></div></div>)}
              {d.comments.length === 0 && <span style={{ color: K.muted, fontSize: 13 }}>Be the first.</span>}
            </div>
            <textarea style={{ ...input, minHeight: 64, marginTop: 10 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="A question, a thank-you, what you took from it…" onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") comment(); }} />
            <div style={{ marginTop: 6 }}><button onClick={comment} disabled={!text.trim()} style={btn("primary")}>Comment</button></div>
          </Card>
        </div>
      </div>
      <style>{`@media (max-width: 820px){ .kindle-two { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
