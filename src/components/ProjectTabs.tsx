"use client";
/**
 * THE PROJECT'S THIRTEEN TABS (Dr Raghu, 2 Sep 2026).
 *
 * ONE ENGINE, MANY FACES — the call that made IMS thirty-nine tables instead
 * of a hundred. Thirteen tabs are not thirteen features. Three already have
 * their data (Product details and Commercials from the ERP's own record, Jobs
 * from the jobs table), and the other ten are TWO SHAPES wearing ten names:
 *
 *   A NARRATIVE — Charter, TDS, PCD, Risk Statement, Design, After Action.
 *                 One body of text per project per section.
 *   A LIST      — RBOM, Real Issues Solving, Milestones, Checklist. Rows with
 *                 a label, a number, a date, an owner and a state.
 *
 * Ten tables would have meant ten routes and ten screens that drift apart the
 * first time one is fixed. Two means a fourteenth tab later is a row in a
 * constant, not a deploy.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { fmtFull } from "@/lib/schedule";
import { supabaseBrowser } from "@/lib/supabase/browser";

const C = { navy: "var(--blue)", ink: "var(--navy)", sub: "var(--muted)", line: "var(--line)", green: "var(--green)", accent: "var(--accent)", amber: "#B26A00" };

export type TabKey =
  | "product" | "tds" | "jobs" | "commercials" | "charter" | "rbom"
  | "issue" | "risk" | "pcd" | "milestone" | "checklist" | "design" | "aar";

/* PCD FIRST (Dr Raghu, 14 Oct 2026: "move the PCD to the front before the
   TDS") — the project's documents, typed and filed in the Drive. The Design
   Section is Vishwakarma's: read here, written there. */
export const TABS: { k: TabKey; label: string; kind: "doc" | "list" | "built-in" | "files" | "design"; note?: string }[] = [
  { k: "product",     label: "Product details",  kind: "doc" },
  { k: "pcd",         label: "PCD",              kind: "files", note: "Project documents — filed in the Drive" },
  { k: "tds",         label: "TDS",              kind: "doc",  note: "Technical data sheet" },
  { k: "jobs",        label: "Jobs",             kind: "built-in" },
  { k: "commercials", label: "Commercials",      kind: "built-in", note: "Project managers only" },
  { k: "charter",     label: "Project Charter",  kind: "doc" },
  { k: "rbom",        label: "RBOM",             kind: "list", note: "Real Bill of Materials" },
  { k: "issue",       label: "Real Issues Solving", kind: "list" },
  { k: "risk",        label: "Risk Statement",   kind: "doc" },
  { k: "milestone",   label: "Milestones",       kind: "list" },
  { k: "checklist",   label: "Checklist",        kind: "list" },
  { k: "design",      label: "Design Section",   kind: "design", note: "From Vishwakarma — designers write it there" },
  { k: "aar",         label: "After Action Report", kind: "doc", note: "Project closure" },
];

/** What each list calls its own columns — one table, four vocabularies. */
const LIST_SHAPE: Record<string, { label: string; qty?: string; uom?: boolean; due?: string; owner?: string; detail: string }> = {
  rbom:      { label: "Item",      qty: "Qty", uom: true, due: "Needed by", owner: "Bought by", detail: "Specification / source" },
  issue:     { label: "The issue", due: "Fix by",  owner: "Owner", detail: "What is actually being done" },
  milestone: { label: "Milestone", due: "Date",    owner: "Owner", detail: "What proves it is reached" },
  checklist: { label: "Check",     due: "Due",     owner: "Owner", detail: "Notes" },
};

const STATES: { k: string; label: string; bg: string; fg: string }[] = [
  { k: "open",    label: "Open",    bg: "#F4F2EC", fg: "var(--dim)" },
  { k: "doing",   label: "Doing",   bg: "#FFF3E8", fg: "#B26A00" },
  { k: "done",    label: "Done",    bg: "#E8F3E9", fg: "var(--green)" },
  { k: "dropped", label: "Dropped", bg: "#F7F5EF", fg: "#B8B5AC" },
];

type Design = { project: { design_stage: string | null; design_owner: string | null; support_needed: string | null; bom_pct: number | null; manuf_pct: number | null; by: string | null; at: string } | null; plan: { idx: number; title: string; on_date: string | null; done: boolean; by: string | null; at: string }[] };
type Doc = { section: string; body: string; updated_by: string | null; updated_at: string };
type Row = {
  id: string; section: string; seq: number; label: string; detail: string;
  qty: number | null; uom: string | null; due: string | null; owner: string | null; state: string;
  updated_by: string | null; updated_at: string;
};

export default function ProjectTabs({
  projectId, canEdit, mayMoney, erp, jobsPane, commercialsPane,
}: {
  projectId: string;
  canEdit: boolean;
  mayMoney: boolean;
  erp: Record<string, unknown>;
  jobsPane: React.ReactNode;
  commercialsPane: React.ReactNode;
}) {
  const [tab, setTab] = useState<TabKey>("product");
  const [docs, setDocs] = useState<Doc[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [design, setDesign] = useState<Design>({ project: null, plan: [] });
  const [nFiles, setNFiles] = useState(0);
  const [installed, setInstalled] = useState(true);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const r = await api.get(`/api/project-tab?id=${encodeURIComponent(projectId)}`) as
      { installed: boolean; docs: Doc[]; rows: Row[]; design?: Design };
    setInstalled(r.installed !== false);
    setDocs(r.docs || []);
    setRows(r.rows || []);
    setDesign(r.design || { project: null, plan: [] });
  }, [projectId]);

  useEffect(() => { void load().catch(() => null); }, [load]);

  const meta = TABS.find((t) => t.k === tab)!;
  // A project manager's tab is not offered to eyes that may not read it.
  const shown = useMemo(() => TABS.filter((t) => t.k !== "commercials" || mayMoney), [mayMoney]);

  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-1.5">
        {shown.map((t) => {
          const on = t.k === tab;
          const n = t.kind === "list" ? rows.filter((r) => r.section === t.k).length : t.kind === "files" ? nFiles : 0;
          const has = (t.kind === "doc" || t.kind === "design") && !!docs.find((d) => d.section === t.k)?.body.trim();
          return (
            <button key={t.k} onClick={() => setTab(t.k)}
              title={t.note || t.label}
              className="px-3 py-1.5 rounded text-sm font-semibold"
              style={on ? { background: "var(--ink)", color: "#fff" } : { color: C.navy, background: "#fff", border: `1px solid ${C.line}` }}>
              {t.label}
              {n > 0 && <span className="tnum" style={{ opacity: .75 }}> · {n}</span>}
              {/* A section with something in it should be visible as such
                  from the tab strip — otherwise every tab looks equally
                  empty and nobody knows which ones are actually kept. */}
              {has && <span style={{ color: on ? "var(--amber)" : C.green }}> ●</span>}
            </button>
          );
        })}
      </div>

      {!installed && (
        <div className="rounded-lg border p-3 mt-3" style={{ borderColor: "#F0D9A8", background: "#FFF8EC", color: C.amber }}>
          The project&apos;s room has nowhere to live yet — run migration <b>0114_project_workspace.sql</b>.
          The tabs are here; what you type into them cannot be saved until then.
        </div>
      )}

      <div className="mt-3">
        {tab === "jobs" && jobsPane}
        {tab === "commercials" && (mayMoney ? commercialsPane : null)}
        {meta.kind === "doc" && (
          <DocPane
            projectId={projectId} section={tab} label={meta.label} note={meta.note}
            doc={docs.find((d) => d.section === tab) || null}
            seed={tab === "product" ? String(erp.short_summary_description ?? "") : ""}
            canEdit={canEdit && installed} busy={busy} setBusy={setBusy} reload={load}
          />
        )}
        {meta.kind === "files" && (
          <FilesPane projectId={projectId} title={String(erp.project_name ?? erp.name ?? "")} onCount={setNFiles} />
        )}
        {meta.kind === "design" && (
          <DesignPane design={design} doc={docs.find((d) => d.section === "design") || null} />
        )}
        {meta.kind === "list" && (
          <ListPane
            projectId={projectId} section={tab} label={meta.label} note={meta.note}
            rows={rows.filter((r) => r.section === tab)}
            canEdit={canEdit && installed} reload={load}
          />
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- narrative */

function DocPane({
  projectId, section, label, note, doc, seed, canEdit, busy, setBusy, reload,
}: {
  projectId: string; section: string; label: string; note?: string;
  doc: Doc | null; seed: string; canEdit: boolean;
  busy: string; setBusy: (s: string) => void; reload: () => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [dirty, setDirty] = useState(false);

  // The section's own words, or — where Genie has none yet — what the ERP
  // already says, offered as a starting point rather than saved silently.
  useEffect(() => { setText(doc?.body ?? ""); setDirty(false); }, [doc, section]);

  const save = async () => {
    setBusy(section);
    const r = await api.post("/api/project-tab", { action: "doc", project_id: projectId, section, body: text });
    setBusy("");
    if (!r.ok) { window.alert(r.error || "Could not save."); return; }
    setDirty(false);
    await reload();
  };

  return (
    <div className="rounded-lg border bg-white p-3" style={{ borderColor: C.line }}>
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <div>
          <span className="font-bold" style={{ color: C.ink }}>{label}</span>
          {note && <span className="text-xs ml-2" style={{ color: C.sub }}>{note}</span>}
        </div>
        <div className="text-xs" style={{ color: C.sub }}>
          {doc?.updated_at
            ? <>last written by <b>{doc.updated_by || "—"}</b> · {fmtFull(String(doc.updated_at).slice(0, 10))}</>
            : "nothing written yet"}
        </div>
      </div>

      {canEdit ? (
        <>
          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value); setDirty(true); }}
            rows={16}
            placeholder={`Write the ${label.toLowerCase()} here…`}
            className="w-full mt-2 rounded border p-2 text-sm"
            style={{ borderColor: C.line, color: C.ink, lineHeight: 1.55, fontFamily: "inherit" }}
          />
          <div className="flex items-center gap-2 mt-2">
            <button onClick={save} disabled={!dirty || busy === section}
              className="px-3 py-1.5 rounded text-sm font-bold"
              style={{ background: dirty ? "var(--green)" : "var(--line)", color: dirty ? "#fff" : "var(--muted)" }}>
              {busy === section ? "Saving…" : dirty ? "Save" : "Saved"}
            </button>
            {!!seed && !text.trim() && (
              <button onClick={() => { setText(seed); setDirty(true); }}
                className="px-3 py-1.5 rounded text-sm font-semibold border"
                style={{ color: C.navy, borderColor: C.line, background: "#fff" }}>
                Start from what the ERP says
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="mt-2" style={{ color: text.trim() ? C.ink : C.sub, whiteSpace: "pre-wrap", lineHeight: 1.55 }}>
          {text.trim() || seed || "Nothing written yet."}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------- lists */

function ListPane({
  projectId, section, label, note, rows, canEdit, reload,
}: {
  projectId: string; section: string; label: string; note?: string;
  rows: Row[]; canEdit: boolean; reload: () => Promise<void>;
}) {
  const shape = LIST_SHAPE[section];
  const [draft, setDraft] = useState<Partial<Row>>({});
  const [busy, setBusy] = useState(false);

  const write = async (body: Record<string, unknown>) => {
    setBusy(true);
    const r = await api.post("/api/project-tab", { project_id: projectId, section, ...body });
    setBusy(false);
    if (!r.ok) { window.alert(r.error || "Could not save."); return false; }
    await reload();
    return true;
  };

  const add = async () => {
    if (!String(draft.label ?? "").trim()) return;
    const ok = await write({ action: "row", ...draft, seq: (rows[rows.length - 1]?.seq ?? 0) + 10 });
    if (ok) setDraft({});
  };

  const done = rows.filter((r) => r.state === "done").length;

  return (
    <div className="rounded-lg border bg-white" style={{ borderColor: C.line }}>
      <div className="px-3 pt-2 flex items-baseline justify-between gap-2 flex-wrap">
        <div>
          <span className="font-bold" style={{ color: C.ink }}>{label}</span>
          {note && <span className="text-xs ml-2" style={{ color: C.sub }}>{note}</span>}
        </div>
        <div className="text-xs" style={{ color: C.sub }}>
          {rows.length} line{rows.length === 1 ? "" : "s"}
          {rows.length > 0 && <> · <b style={{ color: C.green }}>{done} done</b></>}
        </div>
      </div>

      <div className="overflow-x-auto mt-1">
        <table className="w-full text-xs genie-table" style={{ minWidth: 900 }}>
          <thead>
            <tr style={{ background: "var(--ink)", color: "#fff" }}>
              <th className="px-2 py-2 text-left">{shape.label}</th>
              {shape.qty && <th className="px-2 py-2 text-left" style={{ width: 90 }}>{shape.qty}</th>}
              {shape.uom && <th className="px-2 py-2 text-left" style={{ width: 80 }}>Unit</th>}
              <th className="px-2 py-2 text-left">{shape.detail}</th>
              {shape.due && <th className="px-2 py-2 text-left" style={{ width: 130 }}>{shape.due}</th>}
              {shape.owner && <th className="px-2 py-2 text-left" style={{ width: 130 }}>{shape.owner}</th>}
              <th className="px-2 py-2 text-left" style={{ width: 110 }}>State</th>
              {canEdit && <th className="px-2 py-2" style={{ width: 34 }} />}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} style={{ borderTop: "1px solid #EFEDE7", background: i % 2 ? "#FAF9F5" : "#fff", opacity: r.state === "dropped" ? .55 : 1 }}>
                <Cell v={r.label} bold onSave={canEdit ? (v) => write({ ...r, action: "row", label: v }) : undefined} />
                {shape.qty && <Cell v={r.qty ?? ""} num onSave={canEdit ? (v) => write({ ...r, action: "row", qty: v }) : undefined} />}
                {shape.uom && <Cell v={r.uom ?? ""} onSave={canEdit ? (v) => write({ ...r, action: "row", uom: v }) : undefined} />}
                <Cell v={r.detail} onSave={canEdit ? (v) => write({ ...r, action: "row", detail: v }) : undefined} />
                {shape.due && <Cell v={r.due ?? ""} date onSave={canEdit ? (v) => write({ ...r, action: "row", due: v }) : undefined} />}
                {shape.owner && <Cell v={r.owner ?? ""} onSave={canEdit ? (v) => write({ ...r, action: "row", owner: v }) : undefined} />}
                <td className="px-2 py-1">
                  {canEdit ? (
                    <select value={r.state} onChange={(e) => void write({ ...r, action: "row", state: e.target.value })}
                      className="rounded border px-1 py-0.5 text-xs" style={{ borderColor: C.line }}>
                      {STATES.map((s) => <option key={s.k} value={s.k}>{s.label}</option>)}
                    </select>
                  ) : <Chip state={r.state} />}
                </td>
                {canEdit && (
                  <td className="px-1 py-1 text-center">
                    <button
                      onClick={() => { if (window.confirm(`Remove "${r.label}"?`)) void write({ action: "drop", id: r.id }); }}
                      title="Remove this line" style={{ color: "var(--red)", fontWeight: 700 }}>×</button>
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-4 text-center" style={{ color: C.sub }}>Nothing on this list yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <div className="p-2 border-t flex flex-wrap gap-1.5 items-center" style={{ borderColor: C.line, background: "#FAF9F5" }}>
          <input value={String(draft.label ?? "")} onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            placeholder={shape.label} className="rounded border px-2 py-1 text-xs" style={{ borderColor: C.line, minWidth: 220 }} />
          {shape.qty && <input value={String(draft.qty ?? "")} onChange={(e) => setDraft({ ...draft, qty: e.target.value as unknown as number })}
            placeholder={shape.qty} className="rounded border px-2 py-1 text-xs" style={{ borderColor: C.line, width: 80 }} />}
          {shape.uom && <input value={String(draft.uom ?? "")} onChange={(e) => setDraft({ ...draft, uom: e.target.value })}
            placeholder="Unit" className="rounded border px-2 py-1 text-xs" style={{ borderColor: C.line, width: 80 }} />}
          <input value={String(draft.detail ?? "")} onChange={(e) => setDraft({ ...draft, detail: e.target.value })}
            placeholder={shape.detail} className="rounded border px-2 py-1 text-xs" style={{ borderColor: C.line, minWidth: 240, flex: 1 }} />
          {shape.due && <input type="date" value={String(draft.due ?? "")} onChange={(e) => setDraft({ ...draft, due: e.target.value })}
            className="rounded border px-2 py-1 text-xs" style={{ borderColor: C.line }} />}
          {shape.owner && <input value={String(draft.owner ?? "")} onChange={(e) => setDraft({ ...draft, owner: e.target.value })}
            placeholder={shape.owner} className="rounded border px-2 py-1 text-xs" style={{ borderColor: C.line, width: 130 }} />}
          <button onClick={add} disabled={busy || !String(draft.label ?? "").trim()}
            className="px-3 py-1 rounded text-xs font-bold"
            style={{ background: String(draft.label ?? "").trim() ? "var(--green)" : "var(--line)", color: String(draft.label ?? "").trim() ? "#fff" : "var(--muted)" }}>
            {busy ? "…" : "+ Add"}
          </button>
        </div>
      )}
    </div>
  );
}

function Chip({ state }: { state: string }) {
  const s = STATES.find((x) => x.k === state) || STATES[0];
  return <span className="rounded px-1.5 py-0.5 text-xs font-bold" style={{ background: s.bg, color: s.fg }}>{s.label}</span>;
}

/** A cell that becomes an input when you click it, and saves when you leave. */
function Cell({ v, onSave, bold, num, date }: {
  v: string | number; onSave?: (val: string) => void | Promise<unknown>;
  bold?: boolean; num?: boolean; date?: boolean;
}) {
  const [edit, setEdit] = useState(false);
  const [val, setVal] = useState(String(v ?? ""));
  useEffect(() => { setVal(String(v ?? "")); }, [v]);
  const shown = date && val ? fmtFull(val) : val;

  if (!onSave) return <td className="px-2 py-1" style={{ color: bold ? C.ink : C.sub, fontWeight: bold ? 600 : 400 }}>{shown || "·"}</td>;
  return (
    <td className="px-2 py-1" style={{ color: bold ? C.ink : C.sub, fontWeight: bold ? 600 : 400 }}>
      {edit ? (
        <input
          autoFocus value={val} type={date ? "date" : num ? "number" : "text"}
          onChange={(e) => setVal(e.target.value)}
          onBlur={() => { setEdit(false); if (String(v ?? "") !== val) void onSave(val); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setVal(String(v ?? "")); setEdit(false); } }}
          className="w-full rounded border px-1 py-0.5 text-xs" style={{ borderColor: C.line }}
        />
      ) : (
        <span onClick={() => setEdit(true)} className="cursor-text" title="Click to change">{shown || <span style={{ color: "#D5D2C9" }}>·</span>}</span>
      )}
    </td>
  );
}

/* ---------------------------------------------------------------- the PCD */

type PFile = { id: string; doc_type: string; name: string; mime: string | null; bytes: number | null; note: string | null; drive_url: string | null; drive_status: string; drive_error: string | null; uploaded_by: string; uploaded_name: string | null; uploaded_at: string };
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });
const size = (n: number | null) => (!n ? "" : n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/**
 * THE PROJECT'S DOCUMENTS (Dr Raghu, 14 Oct 2026). Choose the type — the list
 * is alphabetical and anyone who files may add a type — pick the file(s), and
 * it goes to the Drive under Projects / <project> / PCD / <type>. The list
 * below is the project's memory of every document: what, who, when, where.
 */
function FilesPane({ projectId, title, onCount }: { projectId: string; title: string; onCount: (n: number) => void }) {
  const [types, setTypes] = useState<string[]>([]);
  const [files, setFiles] = useState<PFile[]>([]);
  const [may, setMay] = useState(false);
  const [installed, setInstalled] = useState(true);
  const [type, setType] = useState("");
  const [note, setNote] = useState("");
  const [pick, setPick] = useState<File[]>([]);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [filter, setFilter] = useState("");
  const [inputKey, setInputKey] = useState(0);

  const load = useCallback(async () => {
    const r = await api.get(`/api/project-file?id=${encodeURIComponent(projectId)}`) as { installed: boolean; types: string[]; files: PFile[]; mayEdit: boolean };
    setInstalled(r.installed !== false); setTypes(r.types || []); setFiles(r.files || []); setMay(!!r.mayEdit);
    onCount((r.files || []).length);
  }, [projectId, onCount]);
  useEffect(() => { void load().catch((e) => setMsg(String(e.message || e))); }, [load]);

  const addType = async () => {
    const name = window.prompt("The new type of project document — e.g. “GA Drawing Revised”:");
    if (!name?.trim()) return;
    try { const r = await api.post("/api/project-file", { action: "type_add", name }) as { name: string }; await load(); setType(r.name); }
    catch (e) { setMsg(String((e as Error).message || e)); }
  };

  const upload = async () => {
    if (!type) { setMsg("Choose the type of document first."); return; }
    if (!pick.length) { setMsg("Choose the file to upload."); return; }
    setMsg("");
    for (const f of pick) {
      try {
        setBusy(`Uploading ${f.name}…`);
        const s = await api.post("/api/project-file", { action: "sign", project_id: projectId, name: f.name, bytes: f.size }) as { bucket: string; path: string; token: string };
        const { error } = await supabaseBrowser().storage.from(s.bucket).uploadToSignedUrl(s.path, s.token, f, { contentType: f.type || "application/octet-stream" });
        if (error) throw new Error(`${f.name} did not upload: ${error.message}`);
        setBusy(`Filing ${f.name} in the Drive…`);
        const r = await api.post("/api/project-file", { action: "register", project_id: projectId, title, path: s.path, name: f.name, mime: f.type, bytes: f.size, doc_type: type, note }) as { drive_status: string; drive_error: string | null };
        if (r.drive_status !== "done") setMsg(`${f.name} is saved on the project, but the Drive copy ${r.drive_status === "skipped" ? "was skipped" : "failed"}: ${r.drive_error || ""} — press Retry on its line.`);
      } catch (e) { setMsg(String((e as Error).message || e)); break; }
    }
    setBusy(""); setPick([]); setNote(""); setInputKey((k) => k + 1);
    await load();
  };

  const act = async (action: "retry" | "remove", f: PFile) => {
    if (action === "remove" && !window.confirm(`Take “${f.name}” off the project book? The copy in the Drive stays.`)) return;
    try { setBusy(action === "retry" ? `Filing ${f.name} in the Drive…` : ""); await api.post("/api/project-file", { action, id: f.id, title }); }
    catch (e) { setMsg(String((e as Error).message || e)); }
    setBusy(""); await load();
  };

  const shown = files.filter((f) => !filter || f.doc_type === filter);
  const usedTypes = [...new Set(files.map((f) => f.doc_type))].sort((a, b) => a.localeCompare(b));

  return (
    <div className="rounded-lg border bg-white p-3" style={{ borderColor: C.line }}>
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <div><span className="font-bold" style={{ color: C.ink }}>PCD</span><span className="text-xs ml-2" style={{ color: C.sub }}>the project&apos;s documents — each filed in the Drive under Projects / {projectId} / PCD / its type</span></div>
        <div className="text-xs" style={{ color: C.sub }}>{files.length} document{files.length === 1 ? "" : "s"}</div>
      </div>

      {!installed && (
        <div className="rounded border p-2 mt-2 text-sm" style={{ borderColor: "#F0D9A8", background: "#FFF8EC", color: C.amber }}>
          The documents have nowhere to live yet — run migration <b>0233_project_documents.sql</b>.
        </div>
      )}

      {may && installed && (
        <div className="mt-3 rounded border p-2 flex flex-wrap gap-2 items-center" style={{ borderColor: C.line, background: "#FAF9F5" }}>
          <select value={type} onChange={(e) => setType(e.target.value)} className="rounded border px-2 py-1.5 text-sm" style={{ borderColor: C.line, minWidth: 240 }}>
            <option value="">Type of project document…</option>
            {types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <button onClick={addType} className="px-2.5 py-1.5 rounded text-xs font-bold border" style={{ color: C.navy, borderColor: C.line, background: "#fff" }}>+ Add type</button>
          <input key={inputKey} type="file" multiple onChange={(e) => setPick(Array.from(e.target.files || []))} className="text-xs" />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional) — revision, reference no." className="rounded border px-2 py-1.5 text-xs" style={{ borderColor: C.line, minWidth: 220, flex: 1 }} />
          <button onClick={upload} disabled={!!busy || !type || !pick.length} className="px-3 py-1.5 rounded text-sm font-bold"
            style={{ background: type && pick.length && !busy ? "var(--green)" : "var(--line)", color: type && pick.length && !busy ? "#fff" : "var(--muted)" }}>
            {busy ? "Working…" : `Upload${pick.length > 1 ? ` ${pick.length}` : ""}`}
          </button>
        </div>
      )}
      {busy && <div className="text-xs mt-2" style={{ color: C.navy }}>{busy}</div>}
      {msg && <div className="text-xs mt-2" style={{ color: "var(--red)" }}>{msg}</div>}

      {usedTypes.length > 1 && (
        <div className="flex flex-wrap gap-1 mt-3">
          <button onClick={() => setFilter("")} className="px-2 py-0.5 rounded text-xs font-semibold border" style={!filter ? { background: "var(--ink)", color: "#fff", borderColor: "var(--ink)" } : { color: C.navy, borderColor: C.line, background: "#fff" }}>All · {files.length}</button>
          {usedTypes.map((t) => <button key={t} onClick={() => setFilter(t)} className="px-2 py-0.5 rounded text-xs font-semibold border" style={filter === t ? { background: "var(--ink)", color: "#fff", borderColor: "var(--ink)" } : { color: C.navy, borderColor: C.line, background: "#fff" }}>{t} · {files.filter((f) => f.doc_type === t).length}</button>)}
        </div>
      )}

      <div className="overflow-x-auto mt-2">
        <table className="w-full text-xs genie-table" style={{ minWidth: 820 }}>
          <thead>
            <tr style={{ background: "var(--ink)", color: "#fff" }}>
              <th className="px-2 py-2 text-left" style={{ width: 190 }}>Type</th>
              <th className="px-2 py-2 text-left">Document</th>
              <th className="px-2 py-2 text-left" style={{ width: 160 }}>Uploaded by</th>
              <th className="px-2 py-2 text-left" style={{ width: 150 }}>When</th>
              <th className="px-2 py-2 text-left" style={{ width: 90 }}>Drive</th>
              {may && <th className="px-2 py-2" style={{ width: 34 }} />}
            </tr>
          </thead>
          <tbody>
            {shown.map((f, i) => (
              <tr key={f.id} style={{ borderTop: "1px solid #EFEDE7", background: i % 2 ? "#FAF9F5" : "#fff" }}>
                <td className="px-2 py-1.5 font-semibold" style={{ color: C.ink }}>{f.doc_type}</td>
                <td className="px-2 py-1.5">
                  <a href={`/api/project-file?file=${f.id}`} target="_blank" rel="noreferrer" className="hover:underline font-semibold" style={{ color: C.navy }}>{f.name} ↗</a>
                  <span className="ml-1" style={{ color: C.sub }}>{size(f.bytes)}</span>
                  {f.note && <div style={{ color: C.sub }}>{f.note}</div>}
                </td>
                <td className="px-2 py-1.5" title={f.uploaded_by}>{f.uploaded_name || f.uploaded_by}</td>
                <td className="px-2 py-1.5 tnum">{when(f.uploaded_at)}</td>
                <td className="px-2 py-1.5">
                  {f.drive_status === "done" ? <span style={{ color: C.green, fontWeight: 700 }}>✓ filed</span>
                    : <span title={f.drive_error || ""} style={{ color: C.amber, fontWeight: 700 }}>{f.drive_status}{may && <button onClick={() => void act("retry", f)} className="ml-1 underline">retry</button>}</span>}
                </td>
                {may && <td className="px-1 py-1.5 text-center"><button onClick={() => void act("remove", f)} title="Take off the project book (the Drive copy stays)" style={{ color: "var(--red)", fontWeight: 700 }}>×</button></td>}
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-center" style={{ color: C.sub }}>No document filed yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------ the Design Section */

/**
 * VISHWAKARMA'S, SHOWN HERE (Dr Raghu, 14 Oct 2026: "Design Section is
 * detailed and should be linked to the Vishwakarma. Show all that here in view
 * mode. Designer can see it in edit. Will explain separately"). Read-only on
 * the project book; the designer writes it in Vishwakarma.
 */
function DesignPane({ design, doc }: { design: Design; doc: Doc | null }) {
  const p = design.project;
  const fact = (k: string, v: React.ReactNode) => (
    <div className="rounded border p-2" style={{ borderColor: C.line }}>
      <div className="text-[10px] font-bold" style={{ color: C.sub, letterSpacing: 1 }}>{k}</div>
      <div className="text-sm font-semibold" style={{ color: C.ink }}>{v || "—"}</div>
    </div>
  );
  return (
    <div className="rounded-lg border bg-white p-3" style={{ borderColor: C.line }}>
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <div><span className="font-bold" style={{ color: C.ink }}>Design Section</span><span className="text-xs ml-2" style={{ color: C.sub }}>view only — from Vishwakarma, where the designer writes it</span></div>
        <a href="/vishwakarma" target="_blank" rel="noreferrer" className="text-xs font-bold rounded px-2.5 py-1 border" style={{ color: C.navy, borderColor: C.line }}>Open in Vishwakarma ↗</a>
      </div>
      <div className="grid gap-2 mt-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))" }}>
        {fact("DESIGN STAGE", p?.design_stage)}
        {fact("DESIGN OWNER", p?.design_owner)}
        {fact("BOM", p?.bom_pct != null ? `${p.bom_pct}%` : null)}
        {fact("MANUFACTURING DRAWINGS", p?.manuf_pct != null ? `${p.manuf_pct}%` : null)}
        {fact("SUPPORT NEEDED", p?.support_needed)}
      </div>
      <div className="text-xs font-bold mt-4 mb-1" style={{ color: C.ink, letterSpacing: 1 }}>THE DESIGN PLAN</div>
      {design.plan.length ? (
        <table className="w-full text-xs genie-table">
          <thead><tr style={{ background: "var(--ink)", color: "#fff" }}><th className="px-2 py-1.5 text-left">Stage</th><th className="px-2 py-1.5 text-left" style={{ width: 130 }}>Date</th><th className="px-2 py-1.5 text-left" style={{ width: 90 }}>Done</th></tr></thead>
          <tbody>{design.plan.map((s) => <tr key={s.idx} style={{ borderTop: "1px solid #EFEDE7" }}><td className="px-2 py-1.5" style={{ color: C.ink }}>{s.title}</td><td className="px-2 py-1.5 tnum">{s.on_date ? fmtFull(s.on_date) : "—"}</td><td className="px-2 py-1.5" style={{ color: s.done ? C.green : C.sub, fontWeight: 700 }}>{s.done ? "✓ done" : "open"}</td></tr>)}</tbody>
        </table>
      ) : <div className="text-sm" style={{ color: C.sub }}>No design plan in Vishwakarma yet.</div>}
      {doc?.body?.trim() && (
        <>
          <div className="text-xs font-bold mt-4 mb-1" style={{ color: C.ink, letterSpacing: 1 }}>NOTES</div>
          <div className="text-sm" style={{ color: C.ink, whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{doc.body}</div>
        </>
      )}
      {!p && !design.plan.length && <div className="text-xs mt-3" style={{ color: C.sub }}>Nothing is kept for this project in Vishwakarma yet — the designer starts it there.</div>}
    </div>
  );
}
