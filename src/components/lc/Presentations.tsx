"use client";
/**
 * Presentations (Dr Raghu, 10 Oct 2026): "New Presentation — who's adding
 * it, who's presenting, the link to the file, upload the file, Genie
 * summarise, Topic. Genie will also automatically put in the topic."
 */
import { useEffect, useRef, useState } from "react";
import { api, btn, Card, Empty, Err, FileDrop, Files, input, label, Lightbox, MUTED, NAVY, ORANGE, Rich, RichField, Who, dmy, istToday, leaderOf, type Boot, type LcFile } from "./shared";

interface P { id: string; topic: string | null; presenter: string | null; file_url: string | null; summary: string | null; notes: string | null; presented_on: string | null; added_by: string | null; created_at: string; files: LcFile[] }

function embed(url: string): string | null {
  const yt = /(?:youtube\.com\/(?:watch\?v=|live\/|shorts\/)|youtu\.be\/)([\w-]{6,})/.exec(url); if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const dr = /drive\.google\.com\/file\/d\/([\w-]+)/.exec(url); if (dr) return `https://drive.google.com/file/d/${dr[1]}/preview`;
  const ds = /docs\.google\.com\/presentation\/d\/([\w-]+)/.exec(url); if (ds) return `https://docs.google.com/presentation/d/${ds[1]}/embed`;
  const lo = /loom\.com\/share\/([\w-]+)/.exec(url); if (lo) return `https://www.loom.com/embed/${lo[1]}`;
  return null;
}

export default function Presentations({ boot, arg, go }: { boot: Boot | null; arg: string | null; go: (k: string, a?: string | null) => void }) {
  const [list, setList] = useState<P[] | null>(null);
  const [adding, setAdding] = useState(false);
  const load = () => api<{ presentations: P[] }>("/api/lc/presentations").then((r) => setList(r.presentations)).catch(() => setList([]));
  useEffect(() => { load(); }, []);
  if (arg) { const p = list?.find((x) => x.id === arg); return <View boot={boot} p={p || null} id={arg} reload={load} back={() => go("presentations")} />; }
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2"><button onClick={() => setAdding(true)} style={btn("primary")}>+ New presentation</button><span className="text-xs" style={{ color: MUTED }}>{list ? `${list.length} on record` : ""}</span></div>
      {list === null && <Empty>Opening…</Empty>}
      {list && list.length === 0 && <Empty>None yet. Add the deck from the last council.</Empty>}
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
        {list?.map((p) => (
          <button key={p.id} onClick={() => go("presentations", p.id)} className="text-left rounded-lg bg-white p-3" style={{ border: "1px solid var(--line)", borderLeft: `5px solid ${leaderOf(boot, p.added_by).colour}` }}>
            <div className="font-bold" style={{ fontSize: 15, color: NAVY }}>{p.topic || <span style={{ color: MUTED }}>Topic to come</span>}</div>
            <div className="text-xs mt-0.5" style={{ color: "var(--dim)" }}>{p.presenter ? `Presented by ${p.presenter}` : "Presenter not named"}{p.presented_on ? ` · ${dmy(p.presented_on)}` : ""}</div>
            <div className="flex gap-1.5 mt-2 flex-wrap items-center">
              {p.file_url && <span className="rounded px-1.5 font-bold" style={{ fontSize: 10, background: "var(--paper)", color: NAVY }}>🔗 link</span>}
              {p.files.map((f) => <span key={f.id} className="rounded px-1.5 font-bold" style={{ fontSize: 10, background: "var(--paper)", color: NAVY }}>{/pdf/i.test(f.name) ? "PDF" : /ppt/i.test(f.name) ? "Deck" : "File"}</span>)}
              {p.summary && <span className="rounded px-1.5 font-bold" style={{ fontSize: 10, background: "#E3F3E8", color: "var(--green)" }}>🧞 summarised</span>}
              <span className="ml-auto"><Who boot={boot} email={p.added_by} size={20} withName={false} /></span>
            </div>
          </button>
        ))}
      </div>
      {adding && <Form boot={boot} onDone={(id) => { setAdding(false); load(); if (id) go("presentations", id); }} />}
    </div>
  );
}

function Form({ boot, p, onDone }: { boot: Boot | null; p?: P; onDone: (id?: string) => void }) {
  const [f, setF] = useState({ topic: p?.topic || "", presenter: p?.presenter || (boot ? leaderOf(boot, boot.me.email).name : ""), file_url: p?.file_url || "", presented_on: p?.presented_on || istToday(), notes: p?.notes || "" });
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const save = async () => {
    setErr(null); setBusy(true);
    try { const r = await api<{ id?: string }>("/api/lc/presentations", { action: p ? "edit" : "create", id: p?.id, ...f }); onDone(r.id || p?.id); }
    catch (e) { setErr(String((e as Error).message)); }
    setBusy(false);
  };
  return (
    <Lightbox title={p ? "Edit the presentation" : "New presentation"} onClose={() => onDone()} wide>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <div><label style={label}>Adding it</label><div style={{ ...input, background: "var(--paper)" }}>{boot ? leaderOf(boot, p?.added_by || boot.me.email).name : "…"}</div></div>
        <div><label style={label}>Presenting</label><input style={input} list="lc-presenters" value={f.presenter} onChange={(e) => setF({ ...f, presenter: e.target.value })} /><datalist id="lc-presenters">{boot?.members.map((m) => <option key={m.email} value={m.name} />)}</datalist></div>
        <div><label style={label}>Presented on</label><input type="date" style={input} value={f.presented_on} onChange={(e) => setF({ ...f, presented_on: e.target.value })} /></div>
      </div>
      <label style={{ ...label, marginTop: 12 }}>Topic — leave blank and Genie names it when it summarises</label>
      <input style={input} value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} placeholder="e.g. Why our OTD slipped in Q2 and the three fixes" />
      <label style={{ ...label, marginTop: 12 }}>Link to the file — Drive, Slides, YouTube, Loom (optional; or upload after saving)</label>
      <input style={input} value={f.file_url} onChange={(e) => setF({ ...f, file_url: e.target.value })} placeholder="https://…" />
      <label style={{ ...label, marginTop: 12 }}>Notes — the presenter's own, or what the room said</label>
      <RichField value={f.notes} onChange={(h) => setF({ ...f, notes: h })} minHeight={140} />
      <Err e={err} />
      <div className="flex gap-2 mt-3"><button onClick={save} disabled={busy} style={btn("primary")}>{busy ? "Saving…" : p ? "Save" : "Save — then upload the file"}</button><button onClick={() => onDone()} style={btn("ghost")}>Cancel</button></div>
    </Lightbox>
  );
}

function View({ boot, p, id, reload, back }: { boot: Boot | null; p: P | null; id: string; reload: () => Promise<void>; back: () => void }) {
  const [edit, setEdit] = useState(false); const [genie, setGenie] = useState(false);
  const tried = useRef(false);
  useEffect(() => { if (!p && !tried.current) { tried.current = true; reload(); } }, [p, reload]);
  if (!p) return <Empty>Opening…</Empty>;
  const may = !!boot && (boot.me.isOwner || p.added_by?.toLowerCase() === boot.me.email.toLowerCase());
  const emb = p.file_url ? embed(p.file_url) : null;
  const pdf = p.files.find((f) => /pdf/i.test(f.mime || f.name));
  const summarise = async () => { setGenie(true); try { await api("/api/lc/genie", { action: "summarise_presentation", id }); await reload(); } catch (e) { alert(String((e as Error).message)); } setGenie(false); };
  const remove = async () => { if (!confirm("Remove this presentation and its files?")) return; await api("/api/lc/presentations", { action: "remove", id }); back(); };
  return (
    <div className="grid gap-3">
      <button onClick={back} className="text-left font-bold" style={{ color: ORANGE, fontSize: 13 }}>← Presentations</button>
      <Card accent={leaderOf(boot, p.added_by).colour}>
        <div className="flex items-start gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="font-bold" style={{ fontSize: 20, color: NAVY }}>{p.topic || <span style={{ color: MUTED }}>Topic to come — Genie names it on summarising</span>}</div>
            <div className="text-sm" style={{ color: "var(--dim)" }}>{p.presenter ? `Presented by ${p.presenter}` : "Presenter not named"}{p.presented_on ? ` · ${dmy(p.presented_on)}` : ""}</div>
            <div className="text-xs mt-1 flex items-center gap-1" style={{ color: MUTED }}>Added by <Who boot={boot} email={p.added_by} size={18} /> · {dmy(p.created_at)}</div>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {may && <button onClick={summarise} disabled={genie} style={btn("primary", { padding: "6px 12px", fontSize: 12 })} title="Genie reads the notes, the PDF and the link, writes the summary and names the topic">{genie ? "🧞 Reading…" : p.summary ? "🧞 Summarise again" : "🧞 Genie summarise"}</button>}
            {may && <FileDrop refKind="presentation" refId={id} onDone={() => { reload(); }} label="📎 Upload the file" accept=".pdf,.ppt,.pptx,.key,.doc,.docx,.xls,.xlsx,.txt,.md,image/*" />}
            {may && <button onClick={() => setEdit(true)} style={btn("soft", { padding: "6px 12px", fontSize: 12 })}>Edit</button>}
            {may && <button onClick={remove} style={btn("ghost", { padding: "6px 10px", fontSize: 12, color: MUTED })}>Remove</button>}
          </div>
        </div>
      </Card>
      <div className="grid gap-3 lc-two" style={{ gridTemplateColumns: "minmax(0, 1.4fr) minmax(300px, 1fr)" }}>
        <div className="grid gap-3" style={{ alignContent: "start" }}>
          <Card title="Genie's summary">{p.summary ? <Rich html={p.summary} /> : <span className="text-sm" style={{ color: MUTED }}>Not summarised yet{may ? " — add the notes or the file, then press Genie summarise." : "."}</span>}</Card>
          {p.notes && <Card title="Notes"><Rich html={p.notes} /></Card>}
        </div>
        <div className="grid gap-3" style={{ alignContent: "start" }}>
          <Card title="The file" right={p.file_url ? <a href={p.file_url} target="_blank" rel="noreferrer" className="text-xs font-bold" style={{ color: ORANGE }}>open the link ↗</a> : undefined}>
            {emb && <div style={{ position: "relative", paddingTop: "62%", background: "#000", borderRadius: 8, overflow: "hidden", marginBottom: 10 }}><iframe src={emb} title="deck" allow="autoplay; fullscreen" allowFullScreen style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }} /></div>}
            {p.file_url && !emb && <a href={p.file_url} target="_blank" rel="noreferrer" className="block text-sm mb-2" style={{ color: ORANGE, wordBreak: "break-all" }}>{p.file_url}</a>}
            <Files files={p.files} boot={boot} mayRemove={may} onChange={() => { reload(); }} compact />
            {!p.file_url && p.files.length === 0 && <span className="text-sm" style={{ color: MUTED }}>No link or file yet.</span>}
          </Card>
          {pdf && <iframe src={`/api/lc/file?path=${encodeURIComponent(pdf.path)}`} title={pdf.name} style={{ width: "100%", height: 480, border: "1px solid var(--line)", borderRadius: 8, background: "#fff" }} />}
        </div>
      </div>
      {edit && <Form boot={boot} p={p} onDone={() => { setEdit(false); reload(); }} />}
      <style>{`@media (max-width: 900px){ .lc-two { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
