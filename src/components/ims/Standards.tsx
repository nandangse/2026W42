"use client";

import { useEffect, useState } from "react";
import {
  Area, Btn, Chip, Empty, Label, Modal, Note, Screen, Select, Text,
  useLoad, post, BORDER, INK, MUTED, NAVY_SOFT, GREEN, AMBER, RED,
} from "./ui";
import { isHead, openFile, uploadFile, type Boot, type StandardRow } from "./types";
import MergedClauses from "./MergedClauses";

interface Clause { id: string; clause_no: string; title: string; parent_clause: string | null }
interface Link { title: string; url: string }
interface NoteRow {
  clause_id: string; requirement: string; evidence: string; compliance: string;
  links: Link[]; ai_draft?: string; ai_drafted_at?: string | null; updated_by?: string; updated_at?: string;
}
interface Loaded {
  installed: boolean; rows: StandardRow[]; clauses: Clause[]; notes: NoteRow[];
  openTasks: Record<string, number>; docs: Record<string, number>; mayDownloadCopy: boolean; mayWrite: boolean;
}

/**
 * The Standards Library, the clause browser, and behind every clause the
 * evidence document (Dr Raghu, 5 Sep 2026): editable, with "Make it better",
 * a compliance mark — Fully compliant / WIP / Pending / Risk — and a "+" that
 * raises a task in a lightbox.
 *
 * The clause TREE is open to everybody admitted; the purchased COPY is not
 * (a copyrighted document — signed link, MR and heads only, and the server
 * refuses regardless). The evidence is written by the MR and the heads and
 * read by all.
 */
export const COMPLIANCE = ["Fully compliant", "WIP", "Pending", "Risk"];
const COMP_COLOUR: Record<string, string> = { "Fully compliant": GREEN, WIP: "#1B6B93", Pending: AMBER, Risk: RED };

export default function Standards({ boot }: { boot: Boot }) {
  const [sel, setSel] = useState<string | null>(null);
  const [d, busy, reload, err] = useLoad<Loaded>(`/api/ims/standard${sel ? `?id=${sel}` : ""}`);
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState<Clause | null>(null);
  const [filter, setFilter] = useState("");
  const [taskFor, setTaskFor] = useState<Clause | null>(null);
  /* TWO TABS ON TOP (Dr Raghu, 10 Oct 2026): the standards one by one, and the clauses merged across them */
  const [tab, setTab] = useState<"standards" | "merged">("standards");

  const rows = d?.rows ?? [];
  const chosen = rows.find((r) => r.id === sel);
  const mayCopy = !!d?.mayDownloadCopy;
  const mayWrite = !!d?.mayWrite;
  const noteOf = (id: string) => (d?.notes ?? []).find((n) => n.clause_id === id);

  const attach = async (file: File, id: string) => {
    setMsg("");
    const up = await uploadFile("ims-standards", file);
    if (up.error) { setMsg(up.error); return; }
    const r = await post("/api/ims/standard", { action: "set_copy", id, path: up.path });
    if (!r.ok) { setMsg(r.error || "Could not file the copy."); return; }
    reload();
  };

  const view = async (path: string) => {
    try { window.open(await openFile("ims-standards", path), "_blank", "noopener"); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Could not open."); }
  };

  const clauses = d?.clauses ?? [];
  const tree = clauses.filter((c) => !c.parent_clause);
  const kids = (no: string) => clauses.filter((c) => c.parent_clause === no);
  const counts = COMPLIANCE.map((k) => [k, (d?.notes ?? []).filter((n) => n.compliance === k).length] as const);
  const unmarked = clauses.length - (d?.notes ?? []).length;
  const show = (c: Clause) => !filter || noteOf(c.id)?.compliance === filter || (filter === "Unmarked" && !noteOf(c.id));

  const ClauseRow = ({ c, depth }: { c: Clause; depth: number }) => {
    const n = noteOf(c.id);
    const tasks = d?.openTasks?.[c.id] ?? 0;
    const docs = d?.docs?.[c.id] ?? 0;
    if (!show(c) && !kids(c.clause_no).some((k) => show(k) || kids(k.clause_no).some(show))) return null;
    return (
      <div style={{ borderTop: depth === 0 ? `1px solid ${BORDER}` : undefined }}>
        <div
          className="px-3 flex items-center gap-2"
          style={{
            paddingLeft: 12 + depth * 22, paddingTop: depth === 0 ? 8 : 5, paddingBottom: depth === 0 ? 8 : 5,
            background: depth === 0 ? NAVY_SOFT : undefined, cursor: "pointer",
            fontSize: depth === 2 ? 12 : 13, color: depth === 2 ? MUTED : INK, fontWeight: depth === 0 ? 700 : 400,
          }}
          role="button" tabIndex={0} onClick={() => setOpen(c)}
          title="Open the evidence for this clause"
        >
          <span style={{ display: "inline-block", minWidth: 60, fontWeight: 700, color: depth === 0 ? INK : MUTED }}>{c.clause_no}</span>
          <span className="flex-1">{c.title}</span>
          {docs > 0 && <span className="text-xs" style={{ color: MUTED }} title="Documents mapped to this clause">📘 {docs}</span>}
          {tasks > 0 && <span className="text-xs" style={{ color: AMBER }} title="Open tasks on this clause">✓ {tasks}</span>}
          {n?.evidence ? <span className="text-xs" style={{ color: MUTED }} title="Evidence written">✎</span> : null}
          <Chip text={n?.compliance ?? "—"} colour={COMP_COLOUR[n?.compliance ?? ""] ?? "#9CA3AF"} />
          {mayWrite && (
            <button
              onClick={(e) => { e.stopPropagation(); setTaskFor(c); }}
              className="text-sm font-bold rounded px-1.5" style={{ color: INK, border: `1px solid ${BORDER}`, background: "#fff", lineHeight: 1.3 }}
              title="Raise a task on this clause"
            >+</button>
          )}
        </div>
        {kids(c.clause_no).map((k) => <ClauseRow key={k.id} c={k} depth={depth + 1} />)}
      </div>
    );
  };

  return (
    <Screen
      title="Standards"
      blurb="The standards, their clause trees, and behind every clause the evidence: what shows it is met, marked Fully compliant, WIP, Pending or Risk. The clause numbers are open to everybody; the purchased copies are restricted — they are copyrighted documents."
    >
      {err && <Note kind="error">{err}</Note>}
      {msg && <Note kind="error">{msg}</Note>}
      {d && !d.installed && <Note kind="warn">Run the IMS migrations first.</Note>}

      <div className="flex gap-1 mb-3" style={{ borderBottom: `1px solid ${BORDER}` }}>
        {([["standards", "Standards"], ["merged", "Clauses & evidence"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className="px-3 py-2 text-sm font-bold" style={{ color: tab === k ? INK : MUTED, borderBottom: `3px solid ${tab === k ? "#F04E23" : "transparent"}`, marginBottom: -1 }}>{l}</button>
        ))}
      </div>
      {tab === "merged" && <MergedClauses />}

      {tab === "standards" && <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        {busy && rows.length === 0 ? <Empty>Reading…</Empty> : rows.map((s) => (
          <div key={s.id} className="bg-white rounded-lg border p-3" style={{ borderColor: sel === s.id ? INK : BORDER }}>
            <div className="flex items-start justify-between gap-2">
              <div className="text-sm font-bold" style={{ color: INK }}>{s.name}</div>
              <Chip text={s.sys} colour="#1B2D6B" />
            </div>
            <div className="flex gap-2 mt-2 flex-wrap">
              <Btn onClick={() => { setSel(sel === s.id ? null : s.id); setFilter(""); }}>
                {sel === s.id ? "Hide clauses" : "Clauses & evidence"}
              </Btn>
              {s.standard_copy_path ? (
                mayCopy
                  ? <Btn onClick={() => view(s.standard_copy_path!)}>Open copy</Btn>
                  : <span className="text-xs font-bold self-center" style={{ color: MUTED }}>Copy filed — restricted to the MR and department heads</span>
              ) : isHead(boot.role) ? (
                <label className="text-xs font-bold self-center" style={{ color: INK, cursor: "pointer" }}>
                  Attach copy
                  <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && attach(e.target.files[0], s.id)} />
                </label>
              ) : (
                <span className="text-xs self-center" style={{ color: MUTED }}>No copy filed</span>
              )}
            </div>
          </div>
        ))}
      </div>}

      {tab === "standards" && chosen && (
        <div className="mt-4">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <div className="text-sm font-bold" style={{ color: INK }}>{chosen.name} — clauses</div>
            <div className="flex gap-1.5 flex-wrap items-center">
              {counts.map(([k, n]) => (
                <button key={k} onClick={() => setFilter(filter === k ? "" : k)} className="rounded-full px-2 py-0.5 text-xs font-bold"
                  style={{ background: filter === k ? COMP_COLOUR[k] : "#fff", color: filter === k ? "#fff" : COMP_COLOUR[k], border: `1px solid ${COMP_COLOUR[k]}` }}>
                  {k} {n}
                </button>
              ))}
              <button onClick={() => setFilter(filter === "Unmarked" ? "" : "Unmarked")} className="rounded-full px-2 py-0.5 text-xs font-bold"
                style={{ background: filter === "Unmarked" ? MUTED : "#fff", color: filter === "Unmarked" ? "#fff" : MUTED, border: `1px solid ${MUTED}` }}>
                Unmarked {unmarked}
              </button>
            </div>
          </div>
          {clauses.length === 0 ? (
            <Empty>No clauses seeded for this standard. AWS D1.1 and EN 1090-2 ship without a clause tree in this pass — the ISO four and AS 9100D have theirs.</Empty>
          ) : (
            <div className="bg-white rounded-lg border overflow-auto" style={{ borderColor: BORDER, maxHeight: "65vh" }}>
              {tree.map((c) => <ClauseRow key={c.id} c={c} depth={0} />)}
            </div>
          )}
          <div className="text-xs mt-2" style={{ color: MUTED }}>Click a clause for its evidence. {mayWrite ? "The + raises a task on it." : ""}</div>
        </div>
      )}

      {open && (
        <ClauseBox
          clause={open} standard={chosen?.name ?? ""} note={noteOf(open.id)} boot={boot} mayWrite={mayWrite}
          openTasks={d?.openTasks?.[open.id] ?? 0} docs={d?.docs?.[open.id] ?? 0}
          onClose={() => setOpen(null)} onSaved={() => { reload(); }} onTask={() => setTaskFor(open)}
        />
      )}
      {taskFor && (
        <TaskBox clause={taskFor} boot={boot} onClose={() => { setTaskFor(null); }} onDone={() => { setTaskFor(null); reload(); }} />
      )}
    </Screen>
  );
}

// ------------------------------------------------------ the evidence lightbox

function ClauseBox({ clause, standard, note, boot, mayWrite, openTasks, docs, onClose, onSaved, onTask }: {
  clause: Clause; standard: string; note?: NoteRow; boot: Boot; mayWrite: boolean; openTasks: number; docs: number;
  onClose: () => void; onSaved: () => void; onTask: () => void;
}) {
  const [requirement, setRequirement] = useState(note?.requirement ?? "");
  const [evidence, setEvidence] = useState(note?.evidence ?? "");
  const [compliance, setCompliance] = useState(note?.compliance ?? "Pending");
  const [links, setLinks] = useState<Link[]>(note?.links ?? []);
  const [newLink, setNewLink] = useState<Link>({ title: "", url: "" });
  const [draft, setDraft] = useState(note?.ai_draft ?? "");
  const [thinking, setThinking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [saved, setSaved] = useState("");
  useEffect(() => { setSaved(""); }, [evidence, compliance, requirement, links]);

  const save = async () => {
    setSaving(true); setMsg("");
    const r = await post("/api/ims/standard", { action: "note_save", clause_id: clause.id, requirement, evidence, compliance, links });
    setSaving(false);
    if (!r.ok) { setMsg(r.error || "Could not save."); return; }
    setSaved("Saved."); onSaved();
  };

  const improve = async () => {
    setThinking(true); setMsg("");
    // What is on the screen is what the model improves — save first so the
    // draft is built on the current words, not last week's.
    if (mayWrite) await post("/api/ims/standard", { action: "note_save", clause_id: clause.id, requirement, evidence, compliance, links });
    const r = await post("/api/ims/standard", { action: "improve", clause_id: clause.id });
    setThinking(false);
    if (!r.ok) { setMsg(r.error || "Genie could not draft this."); return; }
    setDraft(String(r.draft ?? ""));
  };

  const useDraft = () => {
    const m = draft.match(/Suggested compliance:\s*(Fully compliant|WIP|Pending|Risk)/i);
    setEvidence(draft.replace(/\n?Suggested compliance:.*$/i, "").trim());
    if (m) setCompliance(m[1].replace(/^wip$/i, "WIP"));
    setDraft("");
  };

  const who = note?.updated_by ? `${note.updated_by}${note.updated_at ? `, ${new Date(note.updated_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}` : ""}` : "";

  return (
    <Modal onClose={onClose} title={`${clause.clause_no} ${clause.title}`} width={860}>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <span className="text-xs" style={{ color: MUTED }}>{standard}</span>
        <Chip text={compliance} colour={COMP_COLOUR[compliance] ?? MUTED} />
        {docs > 0 && <span className="text-xs" style={{ color: MUTED }}>📘 {docs} document{docs === 1 ? "" : "s"} mapped</span>}
        {openTasks > 0 && <span className="text-xs" style={{ color: AMBER }}>✓ {openTasks} open task{openTasks === 1 ? "" : "s"}</span>}
        {who && <span className="text-xs" style={{ color: MUTED }}>· last written by {who}</span>}
        <span className="flex-1" />
        {mayWrite && <Btn onClick={onTask}>+ Task</Btn>}
      </div>
      {msg && <Note kind="error">{msg}</Note>}

      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 220px" }}>
        <div>
          <Label>Requirement — what the clause asks, in our words</Label>
          {mayWrite ? <Area rows={3} value={requirement} onChange={setRequirement} placeholder="The organisation shall…" />
            : <div className="text-sm whitespace-pre-wrap" style={{ color: INK }}>{requirement || "—"}</div>}

          <div className="mt-3 flex items-center gap-2">
            <Label>Evidence — the document an auditor reads</Label>
            <span className="flex-1" />
            {mayWrite && (
              <Btn kind="primary" onClick={improve} disabled={thinking} title="Genie rewrites the evidence from the documents, registers and certificates it holds — you decide whether to keep it">
                {thinking ? "Drafting…" : "✨ Make it better"}
              </Btn>
            )}
          </div>
          {mayWrite ? <Area rows={12} value={evidence} onChange={setEvidence} placeholder="How the requirement is met, and which documents and records show it." />
            : <div className="text-sm whitespace-pre-wrap rounded border p-2" style={{ color: INK, borderColor: BORDER, minHeight: 80 }}>{evidence || "Nothing written yet."}</div>}

          {draft && (
            <div className="rounded border p-3 mt-3" style={{ borderColor: "#1B6B93", background: "#F0F6FA" }}>
              <div className="flex items-center gap-2 mb-1">
                <div className="text-xs font-bold" style={{ color: "#1B6B93" }}>Genie&apos;s draft{note?.ai_drafted_at ? ` · ${new Date(note.ai_drafted_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}` : ""}</div>
                <span className="flex-1" />
                {mayWrite && <Btn kind="primary" onClick={useDraft}>Use this</Btn>}
                <Btn onClick={() => setDraft("")}>Keep mine</Btn>
              </div>
              <div className="text-sm whitespace-pre-wrap" style={{ color: INK, lineHeight: 1.55 }}>{draft}</div>
              <div className="text-xs mt-2" style={{ color: MUTED }}>Cites only what Genie holds; where it says Gaps, that is a gap, not a guess. Use this puts it in the evidence box — nothing is saved until you press Save.</div>
            </div>
          )}
        </div>

        <div>
          <Label>Compliance</Label>
          {mayWrite ? <Select value={compliance} onChange={setCompliance} blank="Pending" options={COMPLIANCE} />
            : <Chip text={compliance} colour={COMP_COLOUR[compliance] ?? MUTED} />}
          <div className="text-xs mt-1" style={{ color: MUTED, lineHeight: 1.5 }}>
            Fully compliant — evidence in place and current. WIP — being built. Pending — not started. Risk — a finding waiting to happen.
          </div>

          <div className="mt-3"><Label>Links — the documents and records</Label></div>
          {links.length === 0 && <div className="text-xs" style={{ color: MUTED }}>None yet.</div>}
          {links.map((l, i) => (
            <div key={i} className="flex items-start gap-1 text-xs mb-1">
              <a href={l.url} target="_blank" rel="noreferrer" className="hover:underline flex-1" style={{ color: "#1B2D6B", wordBreak: "break-all" }}>{l.title || l.url} ↗</a>
              {mayWrite && <button onClick={() => setLinks(links.filter((_, j) => j !== i))} className="font-bold" style={{ color: RED }} title="Remove">×</button>}
            </div>
          ))}
          {mayWrite && (
            <div className="mt-1">
              <Text value={newLink.title} onChange={(v) => setNewLink({ ...newLink, title: v })} placeholder="Title" />
              <div className="mt-1"><Text value={newLink.url} onChange={(v) => setNewLink({ ...newLink, url: v })} placeholder="https://…" /></div>
              <div className="mt-1"><Btn onClick={() => { if (newLink.url.trim()) { setLinks([...links, { title: newLink.title.trim(), url: newLink.url.trim() }]); setNewLink({ title: "", url: "" }); } }}>+ Link</Btn></div>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2 mt-4 items-center flex-wrap">
        {mayWrite && <Btn kind="primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Btn>}
        <Btn onClick={onClose}>Close</Btn>
        {saved && <span className="text-xs font-bold" style={{ color: GREEN }}>{saved}</span>}
        {!mayWrite && <span className="text-xs" style={{ color: MUTED }}>The MR and department heads write the evidence; you are reading it.</span>}
      </div>
    </Modal>
  );
}

// ----------------------------------------------------------- the task lightbox

function TaskBox({ clause, boot, onClose, onDone }: { clause: Clause; boot: Boot; onClose: () => void; onDone: () => void }) {
  const [row, setRow] = useState({ title: `${clause.clause_no} ${clause.title}: `, description: "", owner_id: boot.profileId ?? "", due_date: "", priority: "normal" });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setRow({ ...row, [k]: v });
  const add = async () => {
    setBusy(true); setMsg("");
    const r = await post("/api/ims/standard", { action: "task_add", clause_id: clause.id, ...row });
    setBusy(false);
    if (!r.ok) { setMsg(r.error || "Could not raise the task."); return; }
    onDone();
  };
  return (
    <Modal onClose={onClose} title={`Task on clause ${clause.clause_no}`} width={560}>
      {msg && <Note kind="error">{msg}</Note>}
      <Note>The task lands in Tasks, tied to this clause, and the clause shows it open until it is done.</Note>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <div style={{ gridColumn: "1/-1" }}><Label>Title</Label><Text value={row.title} onChange={(v) => set("title", v)} /></div>
        <div style={{ gridColumn: "1/-1" }}><Label>What is to be done</Label><Area rows={3} value={row.description} onChange={(v) => set("description", v)} /></div>
        <div><Label>Owner</Label><Select value={row.owner_id} onChange={(v) => set("owner_id", v)} options={boot.people.map((p) => ({ value: p.id, label: p.full_name }))} /></div>
        <div><Label>Due</Label><Text type="date" value={row.due_date} onChange={(v) => set("due_date", v)} /></div>
        <div><Label>Priority</Label><Select value={row.priority} onChange={(v) => set("priority", v)} blank="normal" options={["low", "normal", "high", "urgent"]} /></div>
      </div>
      <div className="flex gap-2 mt-4"><Btn kind="primary" onClick={add} disabled={busy}>Raise task</Btn><Btn onClick={onClose}>Cancel</Btn></div>
    </Modal>
  );
}
