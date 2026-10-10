"use client";
/**
 * Philosophy and Principles — the pages at the front. Sections in order,
 * each a title and rich text with pictures and files.
 *
 * Philosophy opens with Values, OPSP and Quarterly reports (seeded).
 * Principles is "the definitive one … what we do and what we don't do …
 * how decision-making is to be done" — numbered.
 *
 * Dr Raghu, 10 Oct 2026, later the same day: "next to each show approved
 * by and date. Inside each have comments and the edit by raghu or the one
 * who wrote." So: any leader writes a section; the author or Dr Raghu edits
 * it; Dr Raghu approves it and the approval sits beside the title; the
 * council talks under it. An edit after approval asks for approval again.
 * "Work it with Genie" (Dr Raghu alone) proposes the whole set in a logical
 * order — purpose, values as rules, how decisions are taken, accountability,
 * the domain principles, what we do not do, how the page changes — and
 * nothing is written until he applies it.
 */
import { useEffect, useState } from "react";
import { api, btn, Card, Empty, Err, FileDrop, Files, input, label, Lightbox, MUTED, NAVY, ORANGE, Rich, RichField, Who, dmy, dmyt, leaderOf, type Boot, type LcFile } from "./shared";

interface C { id: string; body: string; added_by: string; created_at: string }
interface Section { id: string; kind: string; title: string; body: string | null; sort: number; created_by: string | null; approved_by: string | null; approved_at: string | null; created_at: string; updated_at: string; files: LcFile[]; comments: C[] }

export default function Pages({ kind, boot, isOwner }: { kind: "philosophy" | "principles"; boot: Boot | null; isOwner: boolean }) {
  const [list, setList] = useState<Section[] | null>(null);
  const [edit, setEdit] = useState<Section | "new" | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [genie, setGenie] = useState<"idle" | "working" | { sections: { title: string; body: string }[] }>("idle");
  const load = () => api<{ sections: Section[] }>(`/api/lc/sections?kind=${kind}`).then((r) => setList(r.sections)).catch(() => setList([]));
  useEffect(() => { load(); }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const me = boot?.me.email.toLowerCase();
  const may = (s: Section) => isOwner || (s.created_by || "").toLowerCase() === me;
  const move = async (i: number, d: -1 | 1) => { if (!list) return; const ids = list.map((s) => s.id); const j = i + d; if (j < 0 || j >= ids.length) return; [ids[i], ids[j]] = [ids[j], ids[i]]; await api("/api/lc/sections", { action: "move", kind, ids }); load(); };
  const remove = async (s: Section) => { if (!confirm(`Remove "${s.title}", its files and comments?`)) return; await api("/api/lc/sections", { action: "remove", kind, id: s.id }); load(); };
  const approve = async (s: Section, on: boolean) => { await api("/api/lc/sections", { action: on ? "approve" : "unapprove", kind, id: s.id }); load(); };
  const work = async () => {
    setGenie("working");
    try { const r = await api<{ sections: { title: string; body: string }[] }>("/api/lc/genie", { action: "structure_principles" }); setGenie({ sections: r.sections }); }
    catch (e) { alert(String((e as Error).message)); setGenie("idle"); }
  };
  const apply = async (sections: { title: string; body: string }[]) => {
    const n = list?.length || 0;
    if (!confirm(`Apply Genie's ${sections.length} sections? Sections with the same title keep their files and comments; the other ${n ? "existing ones" : "ones"} are removed. Everything comes back unapproved for you to read and approve.`)) return;
    try { await api("/api/lc/sections", { action: "replace", kind, sections }); setGenie("idle"); load(); } catch (e) { alert(String((e as Error).message)); }
  };
  const pending = (list || []).filter((s) => !s.approved_by).length;

  return (
    <div className="grid gap-3">
      {kind === "principles" && (
        <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "var(--navy)", color: "#fff" }}>
          <b>The definitive page.</b> What we do and what we do not. When a decision is in doubt, it is decided here first. Anyone on the council may write a principle; it stands once Dr Raghu has approved it.
        </div>
      )}
      <div className="flex gap-2 flex-wrap items-center">
        <button onClick={() => setEdit("new")} style={btn("primary")}>+ Add a {kind === "principles" ? "principle" : "section"}</button>
        {isOwner && kind === "principles" && <button onClick={work} disabled={genie === "working"} style={btn("soft")} title="Genie reads what is written here and on Philosophy and proposes the whole set in a logical order — purpose, values as rules, decisions, accountability, the domains, what we do not do. You apply it or not.">{genie === "working" ? "🧞 Working it…" : "🧞 Work it with Genie"}</button>}
        {list && list.length > 0 && <span className="text-xs" style={{ color: MUTED }}>{list.length} section{list.length === 1 ? "" : "s"}{pending ? ` · ${pending} awaiting approval` : " · all approved"}</span>}
      </div>
      {list === null && <Empty>Opening…</Empty>}
      {list && list.length === 0 && <Empty>Nothing written yet — add the first{isOwner && kind === "principles" ? ", or let Genie propose the set" : ""}.</Empty>}
      {list?.map((s, i) => {
        const isOpen = open === s.id || list.length <= 3;
        return (
          <Card key={s.id} accent={s.approved_by ? "var(--green)" : kind === "principles" ? "var(--amber)" : "var(--navy)"}
            title={<button onClick={() => setOpen(isOpen && list.length > 3 ? null : s.id)} className="text-left" style={{ color: NAVY, fontSize: 16 }}>{kind === "principles" ? `${i + 1}. ` : ""}{s.title}</button>}
            right={<span className="flex items-center gap-1.5 flex-wrap">
              {s.approved_by
                ? <span className="inline-flex items-center gap-1 rounded px-2 font-bold" style={{ fontSize: 11, background: "#E3F3E8", color: "var(--green)" }} title={`Approved ${dmyt(s.approved_at)}`}>✓ Approved by {leaderOf(boot, s.approved_by).name} · {dmy(s.approved_at)}</span>
                : <span className="rounded px-2 font-bold" style={{ fontSize: 11, background: "#FFF7E6", color: "#B45309" }}>awaiting Dr Raghu&apos;s approval</span>}
              {isOwner && (s.approved_by
                ? <button onClick={() => approve(s, false)} style={btn("ghost", { padding: "4px 8px", fontSize: 11, color: MUTED })} title="Withdraw the approval">withdraw</button>
                : <button onClick={() => approve(s, true)} style={btn("primary", { padding: "4px 10px", fontSize: 12 })}>Approve</button>)}
              {may(s) && <>
                <FileDrop refKind="section" refId={s.id} onDone={load} label="📎" />
                <button onClick={() => setEdit(s)} style={btn("soft", { padding: "4px 10px", fontSize: 12 })}>Edit</button>
                <button onClick={() => remove(s)} style={btn("ghost", { padding: "4px 8px", fontSize: 12, color: MUTED })} title="Remove">✕</button>
              </>}
              {isOwner && <>
                <button onClick={() => move(i, -1)} style={btn("ghost", { padding: "4px 8px", fontSize: 12 })} title="Up">↑</button>
                <button onClick={() => move(i, 1)} style={btn("ghost", { padding: "4px 8px", fontSize: 12 })} title="Down">↓</button>
              </>}
            </span>}>
            <div className="text-xs mb-2 flex items-center gap-1 flex-wrap" style={{ color: MUTED }}>
              Written by <Who boot={boot} email={s.created_by} size={16} /> · {dmy(s.created_at)}{s.updated_at !== s.created_at ? ` · edited ${dmy(s.updated_at)}` : ""}
              {!isOpen && <span>· {s.comments.length} comment{s.comments.length === 1 ? "" : "s"} · click the title to open</span>}
            </div>
            {isOpen && (
              <>
                {s.body ? <Rich html={s.body} /> : <div className="text-sm" style={{ color: MUTED }}>Not written yet{may(s) ? " — Edit to write it." : "."}</div>}
                {s.files.length > 0 && <div className="mt-3"><Files files={s.files} boot={boot} mayRemove={may(s)} onChange={load} /></div>}
                <Comments s={s} boot={boot} kind={kind} onChange={load} />
              </>
            )}
          </Card>
        );
      })}
      {edit && <Form kind={kind} s={edit === "new" ? undefined : edit} onDone={() => { setEdit(null); load(); }} />}
      {typeof genie === "object" && (
        <Lightbox title="🧞 Genie's proposal — the Principles as one set" onClose={() => setGenie("idle")} wide>
          <div className="text-sm mb-3" style={{ color: "var(--dim)" }}>
            Everything already written is kept and reworded; what was missing is drafted and marked <i>(proposed)</i>. Read it, then apply or close. Applying replaces the list; sections with the same title keep their files and comments; everything comes back unapproved.
          </div>
          <div className="grid gap-2" style={{ maxHeight: "60vh", overflowY: "auto" }}>
            {genie.sections.map((x, i) => (
              <div key={i} className="rounded-lg p-3" style={{ border: "1px solid var(--line)" }}>
                <div className="font-bold mb-1" style={{ color: NAVY }}>{i + 1}. {x.title}</div>
                <Rich html={x.body} small />
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-3"><button onClick={() => apply(genie.sections)} style={btn("primary")}>Apply — replace the list</button><button onClick={work} style={btn("soft")}>Try again</button><button onClick={() => setGenie("idle")} style={btn("ghost")}>Close</button></div>
        </Lightbox>
      )}
    </div>
  );
}

function Comments({ s, boot, kind, onChange }: { s: Section; boot: Boot | null; kind: string; onChange: () => void }) {
  const [text, setText] = useState("");
  const me = boot?.me.email.toLowerCase();
  const say = async () => { if (!text.trim()) return; await api("/api/lc/sections", { action: "comment", kind, id: s.id, body: text }); setText(""); onChange(); };
  return (
    <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--line-soft)" }}>
      <div className="text-xs font-bold mb-1.5" style={{ color: MUTED, letterSpacing: 0.4 }}>COMMENTS · {s.comments.length}</div>
      <div className="grid gap-1.5">
        {s.comments.map((c) => (
          <div key={c.id} className="flex gap-2 items-start">
            <Who boot={boot} email={c.added_by} size={22} withName={false} />
            <div className="flex-1 text-sm"><div className="text-xs" style={{ color: MUTED }}><b style={{ color: NAVY }}>{leaderOf(boot, c.added_by).name}</b> · {dmyt(c.created_at)}{(boot?.me.isOwner || c.added_by.toLowerCase() === me) && <> · <button onClick={async () => { await api("/api/lc/sections", { action: "uncomment", kind, comment_id: c.id }); onChange(); }} style={{ color: MUTED }}>remove</button></>}</div><div style={{ whiteSpace: "pre-wrap" }}>{c.body}</div></div>
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-2 items-start">
        <textarea style={{ ...input, minHeight: 44, flex: 1 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="A question, a challenge, an example of this in practice…" onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") say(); }} />
        <button onClick={say} disabled={!text.trim()} style={btn("primary")}>Say it</button>
      </div>
    </div>
  );
}

function Form({ kind, s, onDone }: { kind: string; s?: Section; onDone: () => void }) {
  const [title, setTitle] = useState(s?.title || "");
  const [body, setBody] = useState(s?.body || "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setErr(null); setBusy(true);
    try { await api("/api/lc/sections", s ? { action: "edit", kind, id: s.id, title, body } : { action: "create", kind, title, body }); onDone(); }
    catch (e) { setErr(String((e as Error).message)); }
    setBusy(false);
  };
  return (
    <Lightbox title={s ? `Edit — ${s.title}` : `A new ${kind === "principles" ? "principle" : "section"}`} onClose={onDone} wide>
      <label style={label}>Title</label>
      <input style={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "principles" ? "We do not quote what we cannot deliver" : "Values"} autoFocus />
      <label style={{ ...label, marginTop: 12 }}>{kind === "principles" ? "What this means, how a decision is taken by it, and who is accountable" : "The text — pictures paste in"}</label>
      <RichField value={body} onChange={setBody} minHeight={260} />
      {s?.approved_by && <div className="text-xs mt-2" style={{ color: ORANGE }}>Saving an edit withdraws the approval; Dr Raghu approves the new text.</div>}
      <Err e={err} />
      <div className="flex gap-2 mt-3"><button onClick={save} disabled={busy} style={btn("primary")}>{busy ? "Saving…" : "Save"}</button><button onClick={onDone} style={btn("ghost")}>Cancel</button></div>
    </Lightbox>
  );
}
