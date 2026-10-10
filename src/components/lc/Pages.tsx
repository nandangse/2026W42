"use client";
/**
 * Philosophy and Principles — the pages at the front. Sections in order,
 * each a title and rich text with pictures and files. The owner writes;
 * the council reads.
 *
 * Philosophy opens with Values, OPSP and Quarterly reports (seeded).
 * Principles is "the definitive one … what we do and what we don't do …
 * how decision-making is to be done" — the same shape, numbered.
 */
import { useEffect, useState } from "react";
import { api, btn, Card, Empty, Err, FileDrop, Files, input, label, Lightbox, MUTED, NAVY, Rich, RichField, dmy, type Boot, type LcFile } from "./shared";

interface Section { id: string; kind: string; title: string; body: string | null; sort: number; updated_at: string; files: LcFile[] }

export default function Pages({ kind, boot, isOwner }: { kind: "philosophy" | "principles"; boot: Boot | null; isOwner: boolean }) {
  const [list, setList] = useState<Section[] | null>(null);
  const [edit, setEdit] = useState<Section | "new" | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const load = () => api<{ sections: Section[] }>(`/api/lc/sections?kind=${kind}`).then((r) => setList(r.sections)).catch(() => setList([]));
  useEffect(() => { load(); }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const move = async (i: number, d: -1 | 1) => { if (!list) return; const ids = list.map((s) => s.id); const j = i + d; if (j < 0 || j >= ids.length) return; [ids[i], ids[j]] = [ids[j], ids[i]]; await api("/api/lc/sections", { action: "move", kind, ids }); load(); };
  const remove = async (s: Section) => { if (!confirm(`Remove "${s.title}" and its files?`)) return; await api("/api/lc/sections", { action: "remove", kind, id: s.id }); load(); };

  return (
    <div className="grid gap-3">
      {kind === "principles" && (
        <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "var(--navy)", color: "#fff" }}>
          <b>The definitive page.</b> What we do and what we do not. When a decision is in doubt, it is decided here first.
        </div>
      )}
      {isOwner && <div className="flex gap-2"><button onClick={() => setEdit("new")} style={btn("primary")}>+ Add a section</button></div>}
      {list === null && <Empty>Opening…</Empty>}
      {list && list.length === 0 && <Empty>Nothing written yet{isOwner ? " — add the first section." : "."}</Empty>}
      {list?.map((s, i) => {
        const isOpen = open === s.id || list.length <= 3;
        return (
          <Card key={s.id} accent={kind === "principles" ? "var(--accent)" : "var(--navy)"}
            title={<button onClick={() => setOpen(isOpen && list.length > 3 ? null : s.id)} className="text-left" style={{ color: NAVY, fontSize: 16 }}>{kind === "principles" ? `${i + 1}. ` : ""}{s.title}</button>}
            right={<span className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs" style={{ color: MUTED }}>{dmy(s.updated_at)}</span>
              {isOwner && <>
                <FileDrop refKind="section" refId={s.id} onDone={load} label="📎" />
                <button onClick={() => setEdit(s)} style={btn("soft", { padding: "4px 10px", fontSize: 12 })}>Edit</button>
                <button onClick={() => move(i, -1)} style={btn("ghost", { padding: "4px 8px", fontSize: 12 })} title="Up">↑</button>
                <button onClick={() => move(i, 1)} style={btn("ghost", { padding: "4px 8px", fontSize: 12 })} title="Down">↓</button>
                <button onClick={() => remove(s)} style={btn("ghost", { padding: "4px 8px", fontSize: 12, color: MUTED })} title="Remove">✕</button>
              </>}
            </span>}>
            {isOpen ? (
              <>
                {s.body ? <Rich html={s.body} /> : <div className="text-sm" style={{ color: MUTED }}>Not written yet{isOwner ? " — Edit to write it." : "."}</div>}
                {s.files.length > 0 && <div className="mt-3"><Files files={s.files} boot={boot} mayRemove={isOwner} onChange={load} /></div>}
              </>
            ) : <div className="text-xs" style={{ color: MUTED }}>Click the title to open.</div>}
          </Card>
        );
      })}
      {edit && <Form kind={kind} s={edit === "new" ? undefined : edit} onDone={() => { setEdit(null); load(); }} />}
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
      <label style={{ ...label, marginTop: 12 }}>{kind === "principles" ? "What this means, and how a decision is taken by it" : "The text — pictures paste in"}</label>
      <RichField value={body} onChange={setBody} minHeight={260} />
      <Err e={err} />
      <div className="flex gap-2 mt-3"><button onClick={save} disabled={busy} style={btn("primary")}>{busy ? "Saving…" : "Save"}</button><button onClick={onDone} style={btn("ghost")}>Cancel</button></div>
    </Lightbox>
  );
}
