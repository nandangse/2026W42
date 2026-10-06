"use client";

/**
 * The Playbook screen (Dr Raghu, 28 Aug 2026) — one per module, under Tools:
 * "I will add many documents, it will then make a playbook like a Wiki
 * through the claude… You will act as a categoriser."
 *
 * ADD INTELLIGENCE takes a document: it goes browser → the book's Drive
 * folder (the Kuber upload pattern — popup asked inside the click), its text
 * is taken (read directly for .txt/.md, through Claude's document door for
 * PDFs ≤3 MB, or written as a gist by the person for the rest), and it lands
 * in the register PENDING. A compile — the button now, the midnight cron
 * otherwise — weaves everything pending into the one living wiki, and the
 * book's version steps the Genie way.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { driveToken, uploadToDriveFolder } from "@/lib/drive-browser";

const INK = "var(--navy)", MUTED = "var(--muted)", BORDER = "var(--line)", ORANGE = "var(--accent)", GREEN = "var(--green)", RED = "var(--red)";

interface Book { kind: string; title: string; folder_id: string; version: string; content: string; compiled_at: string | null; by: string | null }
interface Doc { id: string; title: string; category: string; link: string; status: string; by: string | null; at: string; hasExtract: boolean }

/** Markdown, worn simply: ##/### headings, bullets, **bold**, [links], tables as preformatted. */
function Md({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let k = 0;
  const inline = (s: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = [];
    const re = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;
    let last = 0; let m: RegExpExecArray | null;
    while ((m = re.exec(s)) !== null) {
      if (m.index > last) parts.push(s.slice(last, m.index));
      if (m[2]) parts.push(<a key={k++} href={m[2]} target="_blank" rel="noreferrer" style={{ color: "#2C5B82", fontWeight: 600, textDecoration: "underline" }}>{m[1]}</a>);
      else if (m[3]) parts.push(<b key={k++}>{m[3]}</b>);
      last = m.index + m[0].length;
    }
    if (last < s.length) parts.push(s.slice(last));
    return parts;
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^###\s/.test(l)) out.push(<div key={k++} className="font-bold mt-3 mb-1" style={{ color: INK, fontSize: 14 }}>{inline(l.slice(4))}</div>);
    else if (/^##\s/.test(l)) out.push(<div key={k++} className="font-bold mt-4 mb-1 pb-1" style={{ color: INK, fontSize: 16, borderBottom: `2px solid ${BORDER}` }}>{inline(l.slice(3))}</div>);
    else if (/^#\s/.test(l)) out.push(<div key={k++} className="font-bold mt-4 mb-1" style={{ color: INK, fontSize: 17 }}>{inline(l.slice(2))}</div>);
    else if (/^\s*[-*]\s/.test(l)) out.push(<div key={k++} className="flex gap-2 text-sm" style={{ paddingLeft: 8, lineHeight: 1.6 }}><span>•</span><span>{inline(l.replace(/^\s*[-*]\s/, ""))}</span></div>);
    else if (/^\|/.test(l)) {
      const rows: string[] = [];
      while (i < lines.length && /^\|/.test(lines[i])) { rows.push(lines[i]); i++; }
      i--;
      out.push(<pre key={k++} className="text-xs rounded border p-2 my-1" style={{ borderColor: BORDER, overflowX: "auto", background: "#FAF9F5" }}>{rows.join("\n")}</pre>);
    } else if (l.trim() === "") out.push(<div key={k++} style={{ height: 6 }} />);
    else out.push(<div key={k++} className="text-sm" style={{ lineHeight: 1.65 }}>{inline(l)}</div>);
  }
  return <>{out}</>;
}

export default function PlaybookScreen({ kind, email }: { kind: string; email?: string }) {
  const [data, setData] = useState<{ installed: boolean; book?: Book; docs?: Doc[]; canEdit?: boolean } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [tab, setTab] = useState<"book" | "docs">("book");
  const [adding, setAdding] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    fetch(`/api/playbook?kind=${kind}`, { cache: "no-store" })
      .then((r) => r.json()).then(setData).catch(() => setData(null));
  }, [kind]);
  useEffect(() => { load(); }, [load]);

  const compile = async () => {
    setCompiling(true); setMsg("");
    try {
      const r = await fetch("/api/playbook", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "compile", kind }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "The compile failed");
      setMsg(j.compiled ? `Compiled — now v ${j.version}.` : j.reason || "Nothing new to compile.");
      load();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setCompiling(false); }
  };

  if (!data) return <div className="text-sm" style={{ color: MUTED }}>loading…</div>;
  if (!data.installed) return (
    <div className="rounded p-3 text-sm font-semibold" style={{ background: "#FCF6E8", color: "#8A6D1A", maxWidth: 560 }}>
      Run migration 0086 first — the playbooks have nowhere to live yet.
    </div>
  );
  const book = data.book!;
  const docs = data.docs || [];
  const pending = docs.filter((d) => d.status === "pending").length;

  return (
    <div style={{ maxWidth: 900 }}>
      <div className="flex items-start justify-between gap-3 mb-1 flex-wrap">
        <div>
          <div className="text-lg font-bold" style={{ color: INK }}>
            {book.title} <span className="rounded px-2 py-0.5 text-xs font-bold align-middle" style={{ background: "var(--ink)", color: "#fff" }}>v {book.version}</span>
          </div>
          <div className="text-xs" style={{ color: MUTED }}>
            {book.compiled_at
              ? `compiled ${new Date(book.compiled_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}${book.by ? ` · ${book.by}` : ""}`
              : "not compiled yet"}
            {" · "}the midnight cron weaves in whatever is pending
            {book.folder_id && (<>
              {" · "}
              <a href={`https://drive.google.com/drive/folders/${book.folder_id}`} target="_blank" rel="noreferrer" style={{ color: "#2C5B82", fontWeight: 600 }}>Drive folder ↗</a>
            </>)}
          </div>
        </div>
        <div className="flex gap-2">
          {data.canEdit && editing === null && (
            <button onClick={() => { setEditing(book.content); setTab("book"); }} className="rounded px-3 py-1.5 text-sm font-bold border" style={{ color: INK, borderColor: BORDER, background: "#fff" }}>✎ Edit the book</button>
          )}
          <button onClick={() => setAdding(true)} className="rounded px-3 py-1.5 text-sm font-bold text-white" style={{ background: ORANGE }}>
            ＋ Add Intelligence
          </button>
          <button onClick={compile} disabled={compiling || !pending}
            title={pending ? `${pending} pending — weave them in now instead of waiting for midnight` : "Nothing pending"}
            className="rounded px-3 py-1.5 text-sm font-bold border"
            style={{ color: pending ? "#7C3AED" : MUTED, borderColor: pending ? "#7C3AED" : BORDER, background: "#fff" }}>
            {compiling ? "Weaving…" : `⚙ Compile now${pending ? ` (${pending})` : ""}`}
          </button>
        </div>
      </div>
      {msg && <div className="text-xs font-semibold mb-1" style={{ color: /fail|error|beyond/i.test(msg) ? RED : GREEN }}>{msg}</div>}

      <div className="flex gap-1 my-2">
        {(["book", "docs"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className="rounded-full px-3 py-1 text-xs font-bold border"
            style={tab === t ? { background: "var(--ink)", color: "#fff", borderColor: "var(--ink)" } : { color: MUTED, borderColor: BORDER, background: "#fff" }}>
            {t === "book" ? "The book" : `Documents (${docs.length})`}
          </button>
        ))}
      </div>

      {tab === "book" && editing !== null && (
        <div className="bg-white rounded-lg border p-3" style={{ borderColor: ORANGE }}>
          <div className="text-xs mb-2" style={{ color: MUTED }}>Markdown — ## for a part, ### under it, - for a list, | for a table. Saving makes this the latest version; the next compile weaves new documents into it.</div>
          <textarea value={editing} onChange={(e) => setEditing(e.target.value)} rows={24} className="w-full border rounded px-2 py-1.5 text-sm" style={{ borderColor: BORDER, fontFamily: "ui-monospace, Menlo, monospace" }} />
          <div className="flex gap-2 mt-2">
            <button disabled={savingEdit} onClick={async () => {
              setSavingEdit(true); setMsg("");
              try {
                const r = await fetch("/api/playbook", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "save_content", kind, content: editing }) });
                const j = await r.json(); if (!r.ok) throw new Error(j.error || "Not saved");
                setMsg(`Saved — now v ${j.version}.`); setEditing(null); load();
              } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
              finally { setSavingEdit(false); }
            }} className="rounded px-3 py-1.5 text-sm font-bold text-white" style={{ background: ORANGE }}>{savingEdit ? "Saving…" : "Save as the latest version"}</button>
            <button onClick={() => setEditing(null)} className="rounded px-3 py-1.5 text-sm font-bold border" style={{ borderColor: BORDER, background: "#fff", color: INK }}>Cancel</button>
          </div>
        </div>
      )}
      {tab === "book" && editing === null && (
        <div className="bg-white rounded-lg border p-4" style={{ borderColor: BORDER, maxHeight: "68vh", overflowY: "auto" }}>
          {book.content
            ? <Md text={book.content} />
            : <div className="text-sm" style={{ color: MUTED }}>Empty — add intelligence, then compile (or let midnight do it). The first edition builds itself from whatever is pending.</div>}
        </div>
      )}
      {tab === "docs" && (
        <div className="bg-white rounded-lg border overflow-auto" style={{ borderColor: BORDER, maxHeight: "68vh" }}>
          <table className="w-full text-xs genie-table" style={{ minWidth: 640, borderCollapse: "separate", borderSpacing: 0 }}>
            <thead><tr style={{ background: "var(--ink)", color: "#fff" }}>
              {["Status", "Title", "Category", "Text taken", "Added by", "On", ""].map((h) => (
                <th key={h} className="px-2 py-2 text-left whitespace-nowrap" style={{ position: "sticky", top: 0, background: "var(--ink)" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {docs.length === 0 && (<tr><td colSpan={7} className="px-3 py-5 text-center" style={{ color: MUTED }}>No intelligence yet — the first document starts the book.</td></tr>)}
              {docs.map((d, i) => (
                <tr key={d.id} className="border-t" style={{ borderColor: "var(--line-soft)", background: i % 2 ? "#FAF9F5" : "#fff" }}>
                  <td className="px-2 py-1.5">
                    <span className="rounded px-2 py-0.5 font-bold text-white" style={{ background: d.status === "compiled" ? GREEN : ORANGE }}>{d.status}</span>
                  </td>
                  <td className="px-2 py-1.5 font-semibold">
                    {d.link ? <a href={d.link} target="_blank" rel="noreferrer" style={{ color: "#2C5B82", textDecoration: "underline" }}>{d.title}</a> : d.title}
                  </td>
                  <td className="px-2 py-1.5">{d.category || "—"}</td>
                  <td className="px-2 py-1.5">{d.hasExtract ? "✓" : <span style={{ color: MUTED }}>title only</span>}</td>
                  <td className="px-2 py-1.5">{d.by || "—"}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap" style={{ color: MUTED }}>{new Date(d.at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short" })}</td>
                  <td className="px-2 py-1.5">
                    {d.status === "pending" && (
                      <button onClick={async () => {
                        if (!window.confirm("Remove this pending document?")) return;
                        await fetch("/api/playbook", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "delete_doc", id: d.id }) });
                        load();
                      }} style={{ color: RED }}>🗑</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {adding && <AddIntelligence kind={kind} book={book} email={email} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} onFolderSet={load} />}
    </div>
  );
}

function AddIntelligence({ kind, book, email, onClose, onSaved, onFolderSet }: {
  kind: string; book: Book; email?: string; onClose: () => void; onSaved: () => void; onFolderSet: () => void;
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [link, setLink] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [folderDraft, setFolderDraft] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  const save = async () => {
    if (!title.trim() && !file) { setErr("A title, or a file that brings one."); return; }
    setBusy(true); setErr("");
    try {
      let docLink = link.trim();
      let extract = notes.trim();

      if (file) {
        // Drive first — the token is asked for INSIDE this click.
        if (book.folder_id) {
          setStage("Asking Google…");
          const cfg = await (await fetch("/api/playbook?config=1", { cache: "no-store" })).json();
          if (!cfg.clientId) throw new Error("GOOGLE_OAUTH_CLIENT_ID is not set on the server.");
          const tok = await driveToken(cfg.clientId, email);
          setStage("Uploading to Drive…");
          const up = await uploadToDriveFolder(tok, book.folder_id, file, (p) => setStage(`Uploading to Drive… ${Math.round(p * 100)}%`));
          if (up.link) docLink = up.link;
        }
        // then the text: read directly, or through Claude's document door
        if (/\.(txt|md|csv)$/i.test(file.name)) {
          setStage("Reading the text…");
          extract = [(await file.text()).slice(0, 190_000), extract].filter(Boolean).join("\n\n");
        } else if (/\.pdf$/i.test(file.name)) {
          if (file.size <= 3_000_000) {
            setStage("Claude is reading the PDF…");
            const buf = new Uint8Array(await file.arrayBuffer());
            let bin = "";
            for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
            const r = await fetch("/api/playbook", {
              method: "POST", headers: { "content-type": "application/json" },
              body: JSON.stringify({ action: "extract", data: btoa(bin) }),
            });
            const j = await r.json();
            if (!r.ok) throw new Error(j.error || "Could not read the PDF");
            extract = [j.extract, extract].filter(Boolean).join("\n\n");
          } else {
            setStage("");
            setErr("That PDF is over 3 MB — it went to Drive, but write its gist below so the book can carry it.");
          }
        }
      }

      setStage("Filing…");
      const r = await fetch("/api/playbook", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "add_doc", kind, title: title.trim() || file?.name || "untitled", category: category.trim(), link: docLink, extract }),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Could not file it");
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); setStage(""); }
  };

  return (
    <div onClick={onClose} className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.45)", zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg p-4 w-full" style={{ maxWidth: 560, maxHeight: "90vh", overflow: "auto" }}>
        <div className="flex items-center justify-between mb-2">
          <div className="font-bold text-sm" style={{ color: INK }}>＋ Add Intelligence — {book.title}</div>
          <button onClick={onClose} style={{ color: MUTED }}>✕</button>
        </div>
        {!book.folder_id && (
          <div className="rounded p-2 mb-2 text-xs" style={{ background: "#FCF6E8", color: "#8A6D1A" }}>
            This book has no Drive folder yet — paste its folder link:
            <div className="flex gap-1 mt-1">
              <input value={folderDraft} onChange={(e) => setFolderDraft(e.target.value)} placeholder="https://drive.google.com/drive/folders/…"
                className="flex-1 border rounded px-2 py-1" style={{ borderColor: BORDER }} />
              <button onClick={async () => {
                await fetch("/api/playbook", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "set_folder", kind, folder_id: folderDraft }) });
                onFolderSet();
              }} className="rounded px-2 font-bold text-white" style={{ background: ORANGE }}>Set</button>
            </div>
            Files still register without it — they just won&apos;t land in Drive from here.
          </div>
        )}
        <div className="space-y-2 text-sm">
          <div>
            <span className="block text-xs font-bold mb-0.5" style={{ color: MUTED }}>Document — goes to the book&apos;s Drive folder; .txt/.md read directly, PDFs ≤3 MB read by Claude</span>
            <input ref={fileRef} type="file" onChange={(e) => { const f = e.target.files?.[0] || null; setFile(f); if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, "")); }} />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <span className="block text-xs font-bold mb-0.5" style={{ color: MUTED }}>Title</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full border rounded px-2 py-1.5" style={{ borderColor: BORDER }} />
            </div>
            <div className="flex-1">
              <span className="block text-xs font-bold mb-0.5" style={{ color: MUTED }}>Category — your word; the categoriser refines it</span>
              <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="hydraulics · pricing · SOP…" className="w-full border rounded px-2 py-1.5" style={{ borderColor: BORDER }} />
            </div>
          </div>
          <div>
            <span className="block text-xs font-bold mb-0.5" style={{ color: MUTED }}>Link — filled by the Drive upload, or paste one</span>
            <input value={link} onChange={(e) => setLink(e.target.value)} className="w-full border rounded px-2 py-1.5" style={{ borderColor: BORDER }} />
          </div>
          <div>
            <span className="block text-xs font-bold mb-0.5" style={{ color: MUTED }}>Gist / notes — what the book should carry from it (required when the file can&apos;t be read)</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} className="w-full border rounded px-2 py-1.5" style={{ borderColor: BORDER }} />
          </div>
          {stage && <div className="text-xs font-bold" style={{ color: "#1B6B93" }}>{stage}</div>}
          {err && <div className="text-xs font-bold" style={{ color: RED }}>{err}</div>}
          <div className="flex gap-2 pt-1">
            <button onClick={save} disabled={busy} className="flex-1 rounded py-1.5 font-bold text-white" style={{ background: busy ? "#B9BEC4" : ORANGE }}>
              {busy ? stage || "Working…" : "💾 Add to the book"}
            </button>
            <button onClick={onClose} className="rounded px-3" style={{ color: MUTED }}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
