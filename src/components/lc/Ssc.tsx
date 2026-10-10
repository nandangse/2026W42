"use client";
/**
 * Start · Stop · Continue (Dr Raghu, 10 Oct 2026): "breaking the page into
 * three parts … a box with a plus icon on the top … a light box, 'What do
 * you want to start?' … two or three sentences … details about it and how
 * it impacts the company … added by name, date, liked by … by default the
 * view page … thumbs up or thumbs down … a Kanban board … colour-code the
 * box with the Leaders Council … Print PDF only by Raghu."
 */
import { useEffect, useState } from "react";
import { api, btn, Card, Empty, Err, Eye, input, label, Lightbox, MUTED, NAVY, Names, Rich, RichField, Thumbs, Who, dmy, leaderOf, type Boot } from "./shared";

export interface SscCard { id: string; kind: "start" | "stop" | "continue"; title: string; details: string | null; added_by: string; created_at: string; updated_at: string; up: string[]; down: string[]; mine: string | null; viewed: string[] }
export const KINDS: { key: SscCard["kind"]; label: string; ask: string; colour: string; bg: string }[] = [
  { key: "start", label: "Start", ask: "What do you want us to start?", colour: "var(--green)", bg: "#E3F3E8" },
  { key: "stop", label: "Stop", ask: "What do you want us to stop?", colour: "var(--red)", bg: "#FDECEA" },
  { key: "continue", label: "Continue", ask: "What do you want us to continue?", colour: "var(--blue)", bg: "#E6EEF6" },
];

export default function Ssc({ boot, isOwner }: { boot: Boot | null; isOwner: boolean }) {
  const [cards, setCards] = useState<SscCard[] | null>(null);
  const [add, setAdd] = useState<SscCard["kind"] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const load = () => api<{ cards: SscCard[] }>("/api/lc/ssc").then((r) => setCards(r.cards)).catch(() => setCards([]));
  useEffect(() => { load(); }, []);
  const react = async (id: string, value: string) => { await api("/api/lc/ssc", { action: "react", id, value }); load(); };
  const current = cards?.find((c) => c.id === open) || null;
  const openCard = (id: string) => { setOpen(id); api("/api/lc/ssc", { action: "view", id }).then(load).catch(() => {}); };
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm" style={{ color: "var(--dim)" }}>Every leader's own colour. 👍 and 👎 tally; the view opens on a click.</span>
        <span className="ml-auto" />
        {isOwner && <a href="/lc/print" target="_blank" rel="noreferrer" style={{ ...btn("soft"), textDecoration: "none" }} title="Start, Stop and Continue, a page each — yours alone to print">🖨 Print PDF</a>}
      </div>
      {cards === null && <Empty>Opening…</Empty>}
      <div className="grid gap-3 lc-kanban" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
        {KINDS.map((k) => {
          const mine = (cards || []).filter((c) => c.kind === k.key).sort((a, b) => (b.up.length - b.down.length) - (a.up.length - a.down.length) || b.created_at.localeCompare(a.created_at));
          return (
            <div key={k.key} className="rounded-lg" style={{ background: k.bg, border: `1px solid var(--line)`, minHeight: 320 }}>
              <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: `2px solid ${k.colour}` }}>
                <span className="font-bold" style={{ fontSize: 16, color: k.colour }}>{k.label}</span>
                <span className="text-xs tnum" style={{ color: MUTED }}>{mine.length}</span>
                <button onClick={() => setAdd(k.key)} className="ml-auto rounded-full font-bold" style={{ width: 30, height: 30, background: k.colour, color: "#fff", fontSize: 18, lineHeight: 1 }} title={k.ask}>+</button>
              </div>
              <div className="p-2 grid gap-2">
                {mine.map((c) => {
                  const l = leaderOf(boot, c.added_by);
                  return (
                    <div key={c.id} role="button" tabIndex={0} onClick={() => openCard(c.id)} onKeyDown={(e) => { if (e.key === "Enter") openCard(c.id); }} className="text-left rounded-lg bg-white p-2.5 cursor-pointer" style={{ border: "1px solid var(--line)", borderLeft: `6px solid ${l.colour}`, boxShadow: "0 1px 2px rgba(0,0,0,.05)" }}>
                      <div className="font-semibold" style={{ fontSize: 13.5, color: NAVY, lineHeight: 1.35 }}>{c.title}</div>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <Who boot={boot} email={c.added_by} size={20} />
                        <span className="text-xs tnum" style={{ color: MUTED }}>{dmy(c.created_at)}</span>
                        <span className="ml-auto inline-flex items-center gap-1.5"><Eye boot={boot} viewed={c.viewed || []} /><Thumbs up={c.up.length} down={c.down.length} mine={c.mine} onReact={(v) => react(c.id, v)} size={12} /></span>
                      </div>
                    </div>
                  );
                })}
                {mine.length === 0 && <div className="text-xs text-center py-6" style={{ color: MUTED }}>Nothing yet — press +.</div>}
              </div>
            </div>
          );
        })}
      </div>
      {add && <Form boot={boot} kind={add} onDone={() => { setAdd(null); load(); }} />}
      {current && <View boot={boot} c={current} isOwner={isOwner} onClose={() => setOpen(null)} reload={load} />}
      <style>{`@media (max-width: 900px){ .lc-kanban { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}

function Form({ boot, kind, c, onDone }: { boot: Boot | null; kind: SscCard["kind"]; c?: SscCard; onDone: () => void }) {
  const k = KINDS.find((x) => x.key === (c?.kind || kind))!;
  const [title, setTitle] = useState(c?.title || ""); const [details, setDetails] = useState(c?.details || ""); const [kk, setKk] = useState<SscCard["kind"]>(c?.kind || kind);
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const save = async () => { setErr(null); setBusy(true); try { await api("/api/lc/ssc", c ? { action: "edit", id: c.id, title, details, kind: kk } : { action: "create", kind: kk, title, details }); onDone(); } catch (e) { setErr(String((e as Error).message)); } setBusy(false); };
  return (
    <Lightbox title={<span style={{ color: k.colour }}>{c ? `Edit — ${k.label}` : k.ask}</span>} onClose={onDone}>
      {c && <div className="mb-3"><label style={label}>Column</label><select style={input} value={kk} onChange={(e) => setKk(e.target.value as SscCard["kind"])}>{KINDS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select></div>}
      <label style={label}>In two or three sentences</label>
      <textarea style={{ ...input, minHeight: 80 }} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={k.ask} autoFocus />
      <label style={{ ...label, marginTop: 12 }}>The detail — and how it impacts the company</label>
      <RichField value={details} onChange={setDetails} minHeight={180} placeholder="What exactly, who it touches, what changes for the company if we do it…" />
      <div className="text-xs mt-2 flex items-center gap-1" style={{ color: MUTED }}>Added by <Who boot={boot} email={c?.added_by || boot?.me.email} size={18} /> · {dmy(c?.created_at || new Date().toISOString())}</div>
      <Err e={err} />
      <div className="flex gap-2 mt-3"><button onClick={save} disabled={busy} style={btn("primary")}>{busy ? "Saving…" : "Save"}</button><button onClick={onDone} style={btn("ghost")}>Cancel</button></div>
    </Lightbox>
  );
}

function View({ boot, c, isOwner, onClose, reload }: { boot: Boot | null; c: SscCard; isOwner: boolean; onClose: () => void; reload: () => void }) {
  const [edit, setEdit] = useState(false);
  const k = KINDS.find((x) => x.key === c.kind)!;
  const may = isOwner || c.added_by.toLowerCase() === boot?.me.email.toLowerCase();
  const react = async (value: string) => { await api("/api/lc/ssc", { action: "react", id: c.id, value }); reload(); };
  const remove = async () => { if (!confirm("Remove this card?")) return; await api("/api/lc/ssc", { action: "remove", id: c.id }); onClose(); reload(); };
  if (edit) return <Form boot={boot} kind={c.kind} c={c} onDone={() => { setEdit(false); reload(); }} />;
  return (
    <Lightbox title={<span style={{ color: k.colour }}>{k.label}</span>} onClose={onClose} wide>
      <div className="flex items-start gap-2 flex-wrap mb-3">
        <div className="font-bold flex-1" style={{ fontSize: 17, color: NAVY, lineHeight: 1.35, minWidth: 240 }}>{c.title}</div>
        {may && <div className="flex gap-1.5"><button onClick={() => setEdit(true)} style={btn("soft", { padding: "5px 12px", fontSize: 12 })}>Edit</button><button onClick={remove} style={btn("ghost", { padding: "5px 10px", fontSize: 12, color: MUTED })}>Remove</button></div>}
      </div>
      <Card accent={leaderOf(boot, c.added_by).colour} style={{ padding: 12 }}>
        {c.details ? <Rich html={c.details} /> : <span className="text-sm" style={{ color: MUTED }}>No detail written.</span>}
      </Card>
      <div className="flex items-center gap-3 mt-3 flex-wrap">
        <span className="flex items-center gap-1 text-xs" style={{ color: MUTED }}>Added by <Who boot={boot} email={c.added_by} size={20} /> · {dmy(c.created_at)}</span>
        <span className="ml-auto flex items-center gap-2">
          <Thumbs up={c.up.length} down={c.down.length} mine={c.mine} onReact={react} />
        </span>
      </div>
      <div className="mt-2 text-xs grid gap-0.5" style={{ color: MUTED }}>
        {c.up.length > 0 && <div>👍 <Names boot={boot} emails={c.up} /></div>}
        {c.down.length > 0 && <div>👎 <Names boot={boot} emails={c.down} /></div>}
        <div><Eye boot={boot} viewed={c.viewed || []} voted={[...c.up, ...c.down]} withList /></div>
      </div>
    </Lightbox>
  );
}
