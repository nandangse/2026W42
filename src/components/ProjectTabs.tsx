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

const C = { navy: "#1B3A5C", ink: "#16232F", sub: "#8A94A0", line: "#E2E0DA", green: "#0D7A3F", accent: "#E8600A", amber: "#B26A00" };

export type TabKey =
  | "product" | "tds" | "jobs" | "commercials" | "charter" | "rbom"
  | "issue" | "risk" | "pcd" | "milestone" | "checklist" | "design" | "aar";

export const TABS: { k: TabKey; label: string; kind: "doc" | "list" | "built-in"; note?: string }[] = [
  { k: "product",     label: "Product details",  kind: "doc" },
  { k: "tds",         label: "TDS",              kind: "doc",  note: "Technical data sheet" },
  { k: "jobs",        label: "Jobs",             kind: "built-in" },
  { k: "commercials", label: "Commercials",      kind: "built-in", note: "Project managers only" },
  { k: "charter",     label: "Project Charter",  kind: "doc" },
  { k: "rbom",        label: "RBOM",             kind: "list", note: "Real Bill of Materials" },
  { k: "issue",       label: "Real Issues Solving", kind: "list" },
  { k: "risk",        label: "Risk Statement",   kind: "doc" },
  { k: "pcd",         label: "PCD",              kind: "doc" },
  { k: "milestone",   label: "Milestones",       kind: "list" },
  { k: "checklist",   label: "Checklist",        kind: "list" },
  { k: "design",      label: "Design Section",   kind: "doc" },
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
  { k: "open",    label: "Open",    bg: "#F4F2EC", fg: "#5A6672" },
  { k: "doing",   label: "Doing",   bg: "#FFF3E8", fg: "#B26A00" },
  { k: "done",    label: "Done",    bg: "#E8F3E9", fg: "#0D7A3F" },
  { k: "dropped", label: "Dropped", bg: "#F7F5EF", fg: "#B8B5AC" },
];

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
  const [installed, setInstalled] = useState(true);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const r = await api.get(`/api/project-tab?id=${encodeURIComponent(projectId)}`) as
      { installed: boolean; docs: Doc[]; rows: Row[] };
    setInstalled(r.installed !== false);
    setDocs(r.docs || []);
    setRows(r.rows || []);
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
          const n = t.kind === "list" ? rows.filter((r) => r.section === t.k).length : 0;
          const has = t.kind === "doc" && !!docs.find((d) => d.section === t.k)?.body.trim();
          return (
            <button key={t.k} onClick={() => setTab(t.k)}
              title={t.note || t.label}
              className="px-3 py-1.5 rounded text-sm font-semibold"
              style={on ? { background: "#22303C", color: "#fff" } : { color: C.navy, background: "#fff", border: `1px solid ${C.line}` }}>
              {t.label}
              {n > 0 && <span className="tnum" style={{ opacity: .75 }}> · {n}</span>}
              {/* A section with something in it should be visible as such
                  from the tab strip — otherwise every tab looks equally
                  empty and nobody knows which ones are actually kept. */}
              {has && <span style={{ color: on ? "#F5B32B" : C.green }}> ●</span>}
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
              style={{ background: dirty ? "#0D7A3F" : "#E2E0DA", color: dirty ? "#fff" : "#8A94A0" }}>
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
        <table className="w-full text-xs" style={{ minWidth: 900 }}>
          <thead>
            <tr style={{ background: "#22303C", color: "#fff" }}>
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
                      title="Remove this line" style={{ color: "#B3261E", fontWeight: 700 }}>×</button>
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
            style={{ background: String(draft.label ?? "").trim() ? "#0D7A3F" : "#E2E0DA", color: String(draft.label ?? "").trim() ? "#fff" : "#8A94A0" }}>
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
