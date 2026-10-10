"use client";
/**
 * Knowledge (Dr Raghu, 10 Oct 2026): "a submodule called Knowledge, which
 * only I can add … I'll also put in a lot of Google Drive folders … The
 * files are listed and shown that they are there. Once the pass-through is
 * done, it is pushed to the Google Drive folder where it is safely kept."
 *
 * An entry is a title, a note, a reference link (a Drive folder, a sheet),
 * and files. Every file shows its Drive mark. The owner sets the Drive
 * folder at the top; nobody else sees that control.
 */
import { useEffect, useState } from "react";
import { api, btn, Card, Empty, Err, FileDrop, Files, input, label, Lightbox, MUTED, NAVY, ORANGE, Rich, RichField, dmy, type Boot, type LcFile } from "./shared";

interface K { id: string; title: string; note: string | null; url: string | null; created_by: string | null; created_at: string; updated_at: string; files: LcFile[] }

const isDrive = (u?: string | null) => /drive\.google\.com|docs\.google\.com/.test(u || "");

export default function Knowledge({ boot, isOwner }: { boot: Boot | null; isOwner: boolean }) {
  const [list, setList] = useState<K[] | null>(null);
  const [edit, setEdit] = useState<K | "new" | null>(null);
  const [q, setQ] = useState("");
  const [folder, setFolder] = useState<string | null>(null);
  const [pushing, setPushing] = useState(false);
  const load = () => api<{ items: K[] }>("/api/lc/knowledge").then((r) => setList(r.items)).catch(() => setList([]));
  useEffect(() => { load(); }, []);
  useEffect(() => { if (boot && folder === null) setFolder(boot.settings.drive_folder || ""); }, [boot, folder]);
  const saveFolder = async () => { try { const r = await api<{ value: string }>("/api/lc/settings", { key: "drive_folder", value: folder || "" }); setFolder(r.value); alert(r.value ? "Drive folder set. Files already here can be pushed with 'Push the rest'." : "Drive folder cleared."); } catch (e) { alert(String((e as Error).message)); } };
  const pushAll = async () => { setPushing(true); try { const r = await api<{ pushed: number }>("/api/lc/file", { action: "retry_all" }); alert(`${r.pushed} file${r.pushed === 1 ? "" : "s"} tried.`); } catch (e) { alert(String((e as Error).message)); } setPushing(false); load(); };
  const remove = async (k: K) => { if (!confirm(`Remove "${k.title}" from Genie? Copies already in Drive stay.`)) return; await api("/api/lc/knowledge", { action: "remove", id: k.id }); load(); };

  const needle = q.trim().toLowerCase();
  const shown = (list || []).filter((k) => !needle || [k.title, k.note, k.url, ...k.files.map((f) => f.name)].join(" ").toLowerCase().includes(needle));
  const pending = (list || []).reduce((n, k) => n + k.files.filter((f) => f.drive_status !== "done").length, 0);

  return (
    <div className="grid gap-3">
      {isOwner && (
        <Card title="The Drive folder" right={<span className="text-xs" style={{ color: MUTED }}>only you see this</span>}>
          <div className="flex gap-2 flex-wrap items-end">
            <div style={{ flex: 1, minWidth: 260 }}>
              <label style={label}>Folder id or share link — every council file is pushed here, in a subfolder per room</label>
              <input style={input} value={folder || ""} onChange={(e) => setFolder(e.target.value)} placeholder="https://drive.google.com/drive/folders/… (share it with the Genie service account as Editor)" />
            </div>
            <button onClick={saveFolder} style={btn("primary")}>Save</button>
            {pending > 0 && <button onClick={pushAll} disabled={pushing} style={btn("soft")}>{pushing ? "Pushing…" : `Push the rest (${pending})`}</button>}
          </div>
        </Card>
      )}
      <div className="flex gap-2 flex-wrap items-center">
        {isOwner && <button onClick={() => setEdit("new")} style={btn("primary")}>+ Add to Knowledge</button>}
        <input style={{ ...input, width: 260 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find — a title, a file name…" />
        <span className="text-xs" style={{ color: MUTED }}>{list ? `${list.length} entr${list.length === 1 ? "y" : "ies"}` : ""}</span>
      </div>
      {list === null && <Empty>Opening…</Empty>}
      {list && list.length === 0 && <Empty>Nothing here yet{isOwner ? " — add the first reference or file." : ". Dr Raghu adds here."}</Empty>}
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
        {shown.map((k) => (
          <Card key={k.id} title={k.title} right={isOwner ? <span className="flex gap-1"><FileDrop refKind="knowledge" refId={k.id} onDone={load} label="📎 Add files" /><button onClick={() => setEdit(k)} style={btn("soft", { padding: "4px 10px", fontSize: 12 })}>Edit</button><button onClick={() => remove(k)} style={btn("ghost", { padding: "4px 8px", fontSize: 12, color: MUTED })}>✕</button></span> : undefined}>
            {k.url && <a href={k.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold mb-2" style={{ fontSize: 13, color: ORANGE, textDecoration: "none" }}>{isDrive(k.url) ? "▲ Open in Google Drive" : "🔗 Open the reference"} ↗</a>}
            {k.note && <Rich html={k.note} small />}
            {k.files.length > 0 && <div className="mt-2"><Files files={k.files} boot={boot} mayRemove={isOwner} onChange={load} compact /></div>}
            <div className="text-xs mt-2" style={{ color: MUTED }}>{dmy(k.created_at)}</div>
          </Card>
        ))}
      </div>
      {edit && <Form k={edit === "new" ? undefined : edit} onDone={() => { setEdit(null); load(); }} />}
    </div>
  );
}

function Form({ k, onDone }: { k?: K; onDone: () => void }) {
  const [f, setF] = useState({ title: k?.title || "", url: k?.url || "", note: k?.note || "" });
  const [err, setErr] = useState<string | null>(null);
  const [id, setId] = useState<string | null>(k?.id || null);
  const [files, setFiles] = useState<LcFile[]>(k?.files || []);
  const save = async () => {
    setErr(null);
    try {
      if (id) await api("/api/lc/knowledge", { action: "edit", id, ...f });
      else { const r = await api<{ id: string }>("/api/lc/knowledge", { action: "create", ...f }); setId(r.id); return; }
      onDone();
    } catch (e) { setErr(String((e as Error).message)); }
  };
  const refresh = () => api<{ items: K[] }>("/api/lc/knowledge").then((r) => setFiles(r.items.find((x) => x.id === id)?.files || [])).catch(() => {});
  return (
    <Lightbox title={k ? `Edit — ${k.title}` : "Add to Knowledge"} onClose={onDone} wide>
      <label style={label}>Title</label>
      <input style={input} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Rockefeller Habits — the ten, explained" autoFocus />
      <label style={{ ...label, marginTop: 12 }}>Reference link — a Drive folder, a Google Sheet, a page (optional)</label>
      <input style={input} value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://drive.google.com/drive/folders/…" />
      <label style={{ ...label, marginTop: 12 }}>A note — what this is, why it matters</label>
      <RichField value={f.note} onChange={(h) => setF({ ...f, note: h })} minHeight={140} />
      <Err e={err} />
      {!id ? (
        <div className="flex gap-2 mt-3 items-center"><button onClick={save} style={btn("primary")}>Save — then attach files</button><button onClick={onDone} style={btn("ghost")}>Cancel</button></div>
      ) : (
        <>
          <div className="mt-4 flex items-center gap-2"><span style={{ ...label, marginBottom: 0 }}>Files</span><FileDrop refKind="knowledge" refId={id} onDone={refresh} /><span className="text-xs" style={{ color: MUTED }}>each one is pushed to the Drive folder as it lands</span></div>
          <div className="mt-2"><Files files={files} boot={null} mayRemove onChange={refresh} compact /></div>
          <div className="flex gap-2 mt-4"><button onClick={save} style={btn("primary")}>Done</button></div>
        </>
      )}
      <style>{`.lc-hint{color:${NAVY}}`}</style>
    </Lightbox>
  );
}
