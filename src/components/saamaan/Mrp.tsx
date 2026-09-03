"use client";

/**
 * MRP — Material Resource Planning (Dr Raghu, 3 Sep 2026).
 *
 * "On top have MRP no, MRP run name, date, by. Below, Jobs to add — a
 * lightbox of all projects and the jobs in front of them, select all /
 * unselect all, or tick one by one; a one-time effort, saved for next
 * time. On choosing, the jobs as buttons, mouseover for two lines, click
 * for the lightbox. Then GENERATE: the summation of ALL the RBOMs of all
 * the jobs — item group collapsible on the left, items below it; across
 * the top the project, below it the job no, TDD, kitted, pending, kitting
 * % — collapsible to the job no alone. Each cell: qty and UOM per the
 * RBOM, and a tick. Ticked, it makes an entry in the WIP of that job on
 * that date by that person of that qty, turns green, the tick goes, the
 * date shows, mouseover shows the issue. On top, added, pending, % and
 * valuation move. Stock is NOT reduced — the next step."
 *
 * His rules: each job is one unit; kitted and pending by COUNT, % by
 * VALUE; Draft lines come too, marked; a number box beside the tick for a
 * partial issue, the tick alone meaning the full remaining quantity.
 */

import { useEffect, useMemo, useState } from "react";
import { Screen, Btn, Note, Modal, INK, MUTED, BORDER, NAVY, NAVY_SOFT, GREEN, AMBER, RED, S, fmtD, post } from "@/components/ims/ui";
import { JobLightbox, type WipJob } from "@/components/JobsInProgress";

interface Run { id: string; mrp_no: string; name: string; run_date: string; by: string | null; created_at: string; generated_at: string | null; jobs?: number }
interface BoardJob { job_no: string; tag: string; cust: string; fam: string; project_id: string; project_name: string; tdd: string | null; val: number | null; stat: string }
interface Col extends BoardJob { live: boolean; rbom_id: string }
interface Cell {
  qty: number; uom: string; rate: number | null; value: number | null; status: string; source: string;
  issued: number; issued_value: number; issues: number; last_by: string; last_at: string;
}
interface Item { item_code: string; item_name: string; item_group: string; cells: Record<string, Cell> }
interface Grid { run: Run; jobs: Col[]; items: Item[]; issues: number }

const CR = 1e7;
const cr = (n: number) => `₹${(n / CR).toFixed(2)} Cr`;
const money = (n: number | null) => (n === null ? "·" : `₹${Math.round(n).toLocaleString("en-IN")}`);
const qtyFmt = (n: number) => Number(n).toLocaleString("en-IN", { maximumFractionDigits: 3 });
const pct = (num: number, den: number) => (den > 0 ? `${Math.round((num / den) * 100)}%` : "·");
const who = (s: string | null) => (S(s).includes("@") ? S(s).split("@")[0] : S(s)) || "·";
const fmtAt = (s: string) => (s ? new Date(s).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).replace(",", "") : "");
const toWip = (j: Col): WipJob => ({
  id: j.job_no, tag: j.tag, cust: j.cust, fam: j.fam, tdd: j.tdd, otd: null, stat: j.stat, val: Number(j.val) || 0,
  tpv: 0, tpp: 0, kit: 0, pct: 0, note: "", escalation: null, amtNeeded: null, payOnDelivery: null, mandays: null, ownerInitials: null, ownerName: null,
});

export default function Mrp({ role, email }: { role: string; email: string }) {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [board, setBoard] = useState<BoardJob[]>([]);
  const [runId, setRunId] = useState("");
  const [grid, setGrid] = useState<Grid | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const [newName, setNewName] = useState("");
  const [picker, setPicker] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [openJob, setOpenJob] = useState<Col | null>(null);
  const [fullHead, setFullHead] = useState(true);
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const [boxes, setBoxes] = useState<Record<string, string>>({});
  const canEdit = ["admin", "planner", "project_owner"].includes(role);

  const loadList = async () => {
    setErr("");
    const r = await fetch("/api/saamaan/mrp?mode=list", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error || `The server answered ${r.status}.`); setRuns([]); return; }
    setRuns(j.runs || []); setBoard(j.board || []);
    // The last run opens by itself — "saved next time he logs in".
    if (!runId && j.runs?.length) setRunId(j.runs[0].id);
  };
  const loadRun = async (id: string) => {
    if (!id) { setGrid(null); return; }
    setErr("");
    const r = await fetch(`/api/saamaan/mrp?mode=run&id=${encodeURIComponent(id)}`, { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error || `The server answered ${r.status}.`); return; }
    setGrid(j);
    setPicked(new Set((j.jobs as Col[]).map((x) => x.job_no)));
  };
  useEffect(() => { loadList(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadRun(runId); }, [runId]); // eslint-disable-line react-hooks/exhaustive-deps

  const create = async () => {
    if (!newName.trim()) { setMsg("Give the run a name."); return; }
    setBusy("create"); setMsg("");
    const r = await post("/api/saamaan/mrp", { action: "create", name: newName.trim() });
    setBusy("");
    if (!r.ok) { setMsg(r.error || "Could not create."); return; }
    setNewName("");
    await loadList();
    setRunId(String((r.run as Run).id));
  };
  const saveJobs = async () => {
    setBusy("jobs"); setMsg("");
    const r = await post("/api/saamaan/mrp", { action: "jobs", id: runId, job_nos: [...picked] });
    setBusy("");
    if (!r.ok) { setMsg(r.error || "Could not save."); return; }
    setPicker(false);
    await loadRun(runId); await loadList();
  };
  const generate = async () => {
    setBusy("generate"); setMsg("");
    const r = await post("/api/saamaan/mrp", { action: "generate", id: runId });
    setBusy("");
    if (!r.ok) { setMsg(r.error || "Could not generate."); return; }
    setGrid(r as unknown as Grid);
    await loadList();
  };
  const issue = async (job_no: string, item_code: string, cell: Cell) => {
    const key = `${job_no}|${item_code}`;
    const typed = boxes[key];
    const qty = typed === undefined || typed === "" ? undefined : Number(typed);
    if (qty !== undefined && (!Number.isFinite(qty) || qty <= 0)) { setMsg("The quantity has to be a number above nothing."); return; }
    setBusy(key); setMsg("");
    const r = await post("/api/saamaan/mrp", { action: "issue", id: runId, job_no, item_code, qty });
    setBusy("");
    if (!r.ok) { setMsg(r.error || "Could not issue."); return; }
    setBoxes((b) => { const n = { ...b }; delete n[key]; return n; });
    await loadRun(runId);
    void cell;
  };

  // ------------------------------------------------------------ the sums
  const totals = useMemo(() => {
    let cells = 0, done = 0, value = 0, issued = 0;
    for (const it of grid?.items ?? []) for (const c of Object.values(it.cells)) {
      cells++; if (c.issued >= c.qty && c.qty > 0) done++;
      value += c.value ?? 0; issued += c.issued_value;
    }
    return { cells, done, pending: cells - done, value, issued };
  }, [grid]);
  const perJob = useMemo(() => {
    const m = new Map<string, { cells: number; done: number; value: number; issued: number }>();
    for (const j of grid?.jobs ?? []) m.set(j.job_no, { cells: 0, done: 0, value: 0, issued: 0 });
    for (const it of grid?.items ?? []) for (const [job, c] of Object.entries(it.cells)) {
      const o = m.get(job); if (!o) continue;
      o.cells++; if (c.issued >= c.qty && c.qty > 0) o.done++; o.value += c.value ?? 0; o.issued += c.issued_value;
    }
    return m;
  }, [grid]);
  const groups = useMemo(() => {
    const g = new Map<string, Item[]>();
    for (const it of grid?.items ?? []) (g.get(it.item_group) ?? g.set(it.item_group, []).get(it.item_group)!).push(it);
    return [...g.entries()];
  }, [grid]);
  const projectSpans = useMemo(() => {
    const out: { project_id: string; project_name: string; n: number }[] = [];
    for (const j of grid?.jobs ?? []) {
      const last = out[out.length - 1];
      if (last && last.project_id === j.project_id) last.n++; else out.push({ project_id: j.project_id, project_name: j.project_name, n: 1 });
    }
    return out;
  }, [grid]);
  const boardByProject = useMemo(() => {
    const g = new Map<string, BoardJob[]>();
    for (const j of board) (g.get(j.project_id) ?? g.set(j.project_id, []).get(j.project_id)!).push(j);
    return [...g.entries()].sort((a, b) => b[0].localeCompare(a[0], undefined, { numeric: true }));
  }, [board]);

  const run = grid?.run ?? runs?.find((r) => r.id === runId) ?? null;
  const toggleFold = (g: string) => setFolded((f) => { const n = new Set(f); if (n.has(g)) n.delete(g); else n.add(g); return n; });

  return (
    <Screen
      title="MRP — Material Resource Planning"
      blurb="A run picks its jobs once; GENERATE sums their Real BOMs into items by jobs; a tick issues an item into the job's WIP. Stock is not reduced yet."
      action={<>
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="new run — a name" onKeyDown={(e) => { if (e.key === "Enter") create(); }}
          className="rounded border px-2 py-2 text-sm" style={{ borderColor: BORDER, minWidth: 200 }} />
        <Btn kind="primary" onClick={create} disabled={busy === "create"}>+ New run</Btn>
      </>}>
      {err && <Note kind="error">{err}</Note>}
      {msg && <Note kind="warn">{msg}</Note>}

      {/* ------------------------------------------------------ the run head */}
      <div className="rounded-lg border p-3 mb-3 flex items-center gap-4 flex-wrap" style={{ borderColor: BORDER, background: "#fff" }}>
        <select value={runId} onChange={(e) => setRunId(e.target.value)} className="rounded border px-2 py-1.5 text-sm font-bold bg-white" style={{ borderColor: BORDER, minWidth: 260 }}>
          {!runs?.length && <option value="">— no run yet — make one on the right —</option>}
          {(runs ?? []).map((r) => <option key={r.id} value={r.id}>{r.mrp_no} · {r.name} ({r.jobs ?? 0} jobs)</option>)}
        </select>
        {run && (<>
          <span className="text-xs" style={{ color: MUTED }}>MRP no <b style={{ color: INK }}>{run.mrp_no}</b></span>
          <span className="text-xs" style={{ color: MUTED }}>Run <b style={{ color: INK }}>{run.name}</b></span>
          <span className="text-xs" style={{ color: MUTED }}>Date <b className="tnum" style={{ color: INK }}>{fmtD(run.run_date)}</b></span>
          <span className="text-xs" style={{ color: MUTED }}>By <b style={{ color: INK }}>{who(run.by) === "·" ? who(email) : who(run.by)}</b></span>
          {run.generated_at && <span className="text-xs" style={{ color: MUTED }}>generated <span className="tnum">{fmtAt(run.generated_at)}</span></span>}
        </>)}
      </div>

      {run && (<>
        {/* ---------------------------------------------------- the jobs */}
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <Btn onClick={() => setPicker(true)}>Jobs to add</Btn>
          {(grid?.jobs ?? []).map((j) => (
            <button key={j.job_no} onClick={() => setOpenJob(j)}
              className="rounded px-2 py-1 text-xs font-bold" style={{ background: j.rbom_id ? NAVY_SOFT : "#FEF3C7", color: j.rbom_id ? NAVY : "#92400E", border: `1px solid ${BORDER}` }}
              title={`${j.tag || "(no tag)"} · ${j.cust}\n${j.project_id.replace(/^NGSE-PROJ-/, "project ")} · TDD ${fmtD(j.tdd)} · ${j.val !== null ? cr(j.val) : "·"}${j.rbom_id ? ` · ${j.rbom_id}` : " · NO RBOM YET — build it on the BOM front"}`}>
              {j.job_no}
            </button>
          ))}
          {grid && grid.jobs.length > 0 && (
            <Btn kind="primary" onClick={generate} disabled={busy === "generate"}>{busy === "generate" ? "Generating…" : "GENERATE"}</Btn>
          )}
        </div>

        {/* ------------------------------------------------ the top strip */}
        {grid && grid.items.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
            {[
              ["Items added", String(totals.done), "cells fully issued"],
              ["Pending", String(totals.pending), "cells not yet, or partly"],
              ["Kitting %", pct(totals.issued, totals.value), "by value"],
              ["Valuation kitted", money(totals.issued), "what has gone into the WIPs"],
              ["Valuation total", money(totals.value), "the RBOMs of these jobs, summed"],
            ].map(([t, v, h]) => (
              <div key={t} className="bg-white rounded-lg border p-2.5" style={{ borderColor: BORDER }}>
                <div className="text-xs font-bold uppercase" style={{ color: MUTED, letterSpacing: 0.6 }}>{t}</div>
                <div className="tnum" style={{ fontSize: 20, fontWeight: 800, color: INK }}>{v}</div>
                <div className="text-xs" style={{ color: MUTED }}>{h}</div>
              </div>
            ))}
          </div>
        )}

        {/* ------------------------------------------------------ the grid */}
        {grid && grid.items.length > 0 && (<>
          <div className="flex items-center gap-3 mb-1 text-xs" style={{ color: MUTED }}>
            <label className="flex items-center gap-1"><input type="checkbox" checked={fullHead} onChange={(e) => setFullHead(e.target.checked)} /> full job headers (TDD, kitted, pending, %)</label>
            <button onClick={() => setFolded(new Set())} style={{ color: NAVY }}>expand all groups</button>
            <button onClick={() => setFolded(new Set(groups.map(([g]) => g)))} style={{ color: NAVY }}>fold all</button>
            <span className="ml-auto tnum">{grid.items.length} items · {grid.jobs.length} jobs · {grid.issues} issues so far</span>
          </div>
          <div className="rounded-lg border overflow-auto" style={{ borderColor: BORDER, background: "#fff", maxHeight: "70vh" }}>
            <table className="text-xs" style={{ borderCollapse: "separate", borderSpacing: 0, minWidth: 420 + grid.jobs.length * 150 }}>
              <thead>
                <tr style={{ background: "#14224F", color: "#fff" }}>
                  <th rowSpan={fullHead ? 5 : 2} className="px-2 py-1 text-left" style={{ position: "sticky", left: 0, top: 0, zIndex: 3, background: "#14224F", minWidth: 300, verticalAlign: "bottom" }}>Item</th>
                  {projectSpans.map((p) => (
                    <th key={p.project_id} colSpan={p.n} className="px-2 py-1 text-center" style={{ position: "sticky", top: 0, zIndex: 2, background: "#14224F", borderLeft: "1px solid #2B3A7A" }} title={p.project_name}>
                      {p.project_id.replace(/^NGSE-PROJ-/, "")} <span style={{ fontWeight: 500, opacity: 0.8 }}>{p.project_name.slice(0, 26)}{p.project_name.length > 26 ? "…" : ""}</span>
                    </th>
                  ))}
                </tr>
                <tr style={{ background: NAVY, color: "#fff" }}>
                  {grid.jobs.map((j) => <th key={j.job_no} className="px-2 py-1 text-center tnum" style={{ position: "sticky", top: 25, zIndex: 2, background: NAVY, borderLeft: "1px solid #2B3A7A" }}><button onClick={() => setOpenJob(j)} className="hover:underline">{j.job_no}</button></th>)}
                </tr>
                {fullHead && (<>
                  <tr style={{ background: NAVY_SOFT, color: INK }}>
                    {grid.jobs.map((j) => <th key={j.job_no} className="px-2 py-0.5 text-center font-semibold tnum" style={{ borderLeft: `1px solid ${BORDER}` }} title="TDD">{fmtD(j.tdd)}</th>)}
                  </tr>
                  <tr style={{ background: NAVY_SOFT, color: INK }}>
                    {grid.jobs.map((j) => { const o = perJob.get(j.job_no)!; return <th key={j.job_no} className="px-2 py-0.5 text-center font-semibold tnum" style={{ borderLeft: `1px solid ${BORDER}` }} title="kitted · pending (items)"><span style={{ color: GREEN }}>{o.done}</span> <span style={{ color: MUTED }}>·</span> <span style={{ color: o.cells - o.done ? AMBER : MUTED }}>{o.cells - o.done}</span></th>; })}
                  </tr>
                  <tr style={{ background: NAVY_SOFT, color: INK }}>
                    {grid.jobs.map((j) => { const o = perJob.get(j.job_no)!; return <th key={j.job_no} className="px-2 py-0.5 text-center font-bold tnum" style={{ borderLeft: `1px solid ${BORDER}` }} title="kitting %, by value">{pct(o.issued, o.value)}</th>; })}
                  </tr>
                </>)}
              </thead>
              <tbody>
                {groups.map(([g, items]) => (
                  <GroupRows key={g} group={g} items={items} jobs={grid.jobs} folded={folded.has(g)} onFold={() => toggleFold(g)}
                    boxes={boxes} setBoxes={setBoxes} busy={busy} canEdit={canEdit} onIssue={issue} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-xs mt-2" style={{ color: MUTED, lineHeight: 1.6 }}>
            A cell is the RBOM&apos;s quantity of that item for that job — each job one unit. Tick to issue it all into the job&apos;s WIP; type a smaller number first for a partial.
            Green is fully issued, with the date; hover for who and how much. <span style={{ color: AMBER }}>D</span> marks a Draft line. Kitted and pending are counts; % is by value. Stock is not reduced by an issue — that comes next.
          </div>
        </>)}
        {grid && grid.jobs.length > 0 && grid.items.length === 0 && (
          <Note kind="warn">The chosen jobs have no RBOM lines yet. Build the RBOMs on the BOM front, then GENERATE.</Note>
        )}
      </>)}

      {/* ---------------------------------------------------- the picker */}
      {picker && (
        <Modal onClose={() => setPicker(false)} title="Jobs to add — every project, and its live jobs" width={860}>
          <div className="flex gap-2 mb-2 text-xs">
            <Btn onClick={() => setPicked(new Set(board.map((j) => j.job_no)))}>Select all jobs</Btn>
            <Btn onClick={() => setPicked(new Set())}>Unselect all</Btn>
            <span className="ml-auto tnum self-center" style={{ color: MUTED }}>{picked.size} of {board.length} chosen</span>
          </div>
          <div style={{ maxHeight: "55vh", overflowY: "auto" }}>
            {boardByProject.map(([proj, jobs]) => {
              const all = jobs.every((j) => picked.has(j.job_no));
              return (
                <div key={proj} className="mb-2 rounded border" style={{ borderColor: BORDER }}>
                  <label className="flex items-center gap-2 px-2 py-1.5 text-sm font-bold cursor-pointer" style={{ background: NAVY_SOFT, color: INK }}>
                    <input type="checkbox" checked={all} onChange={(e) => setPicked((p) => { const n = new Set(p); for (const j of jobs) { if (e.target.checked) n.add(j.job_no); else n.delete(j.job_no); } return n; })} />
                    {proj.replace(/^NGSE-PROJ-/, "Project ")} <span style={{ color: MUTED, fontWeight: 500 }}>· {jobs[0].project_name}</span>
                  </label>
                  <div className="grid md:grid-cols-2">
                    {jobs.map((j) => (
                      <label key={j.job_no} className="flex items-center gap-2 px-3 py-1 text-xs cursor-pointer" style={{ borderTop: `1px solid ${BORDER}` }}>
                        <input type="checkbox" checked={picked.has(j.job_no)} onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(j.job_no); else n.delete(j.job_no); return n; })} />
                        <b className="tnum" style={{ color: NAVY }}>{j.job_no}</b>
                        <span className="truncate" style={{ color: INK }}>{j.tag}</span>
                        <span className="ml-auto tnum whitespace-nowrap" style={{ color: MUTED }}>{fmtD(j.tdd)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex gap-2 mt-3 justify-end">
            <Btn onClick={() => setPicker(false)}>Cancel</Btn>
            <Btn kind="primary" onClick={saveJobs} disabled={busy === "jobs"}>Save {picked.size} jobs to {run?.mrp_no}</Btn>
          </div>
        </Modal>
      )}

      {openJob && (
        <JobLightbox job={toWip(openJob)} V={(n: number) => `${(n / CR).toFixed(2)} Cr`} colour={NAVY} canEdit={canEdit}
          onClose={() => setOpenJob(null)} onOpenPlan={() => { const id = openJob.job_no; setOpenJob(null); window.open(`/?job=${encodeURIComponent(id)}`, "_blank"); }}
          onSaved={async () => { await loadRun(runId); }} />
      )}
    </Screen>
  );
}

// ============================================================ the rows
function GroupRows({ group, items, jobs, folded, onFold, boxes, setBoxes, busy, canEdit, onIssue }: {
  group: string; items: Item[]; jobs: Col[]; folded: boolean; onFold: () => void;
  boxes: Record<string, string>; setBoxes: (f: (b: Record<string, string>) => Record<string, string>) => void;
  busy: string; canEdit: boolean; onIssue: (job: string, item: string, cell: Cell) => void;
}) {
  return (
    <>
      <tr style={{ background: "#F1F3F9" }}>
        <td colSpan={1 + jobs.length} className="px-2 py-1 font-bold" style={{ color: INK, position: "sticky", left: 0, borderTop: `1px solid ${BORDER}` }}>
          <button onClick={onFold} className="flex items-center gap-2">
            <span style={{ width: 12, display: "inline-block" }}>{folded ? "▸" : "▾"}</span>{group.replace(/^RM - /, "")} <span style={{ color: MUTED, fontWeight: 500 }}>· {items.length} item{items.length === 1 ? "" : "s"}</span>
          </button>
        </td>
      </tr>
      {!folded && items.map((it, i) => (
        <tr key={it.item_code} style={{ background: i % 2 ? "#FAF9F5" : "#fff" }}>
          <td className="px-2 py-1" style={{ position: "sticky", left: 0, background: i % 2 ? "#FAF9F5" : "#fff", borderBottom: `1px solid ${BORDER}`, zIndex: 1 }}>
            <b style={{ color: INK }}>{it.item_code}</b> <span style={{ color: MUTED, whiteSpace: "normal" }}>{it.item_name}</span>
          </td>
          {jobs.map((j) => {
            const c = it.cells[j.job_no];
            if (!c) return <td key={j.job_no} className="px-2 py-1 text-center" style={{ borderBottom: `1px solid ${BORDER}`, borderLeft: `1px solid ${BORDER}`, color: "#D1D5DB" }}>–</td>;
            const key = `${j.job_no}|${it.item_code}`;
            const full = c.qty > 0 && c.issued >= c.qty;
            const remaining = Math.max(0, c.qty - c.issued);
            return (
              <td key={j.job_no} className="px-1 py-1 text-center" style={{ borderBottom: `1px solid ${BORDER}`, borderLeft: `1px solid ${BORDER}`, background: full ? "#E6F4EC" : c.issued > 0 ? "#FEF3C7" : undefined }}
                title={`${qtyFmt(c.qty)} ${c.uom} per the RBOM${c.rate !== null ? ` @ ₹${c.rate.toLocaleString("en-IN")}` : ""}${c.status === "Draft" ? ` · DRAFT line from ${c.source}` : ""}${c.issued ? `\nissued ${qtyFmt(c.issued)} ${c.uom} in ${c.issues} entr${c.issues === 1 ? "y" : "ies"} · last ${fmtAt(c.last_at)} by ${who(c.last_by)}` : ""}`}>
                <div className="flex items-center justify-center gap-1">
                  <span className="tnum" style={{ color: full ? GREEN : INK, fontWeight: 700 }}>{qtyFmt(c.qty)} <span style={{ color: MUTED, fontWeight: 500 }}>{c.uom}</span></span>
                  {c.status === "Draft" && <span className="text-xs font-bold" style={{ color: AMBER }}>D</span>}
                </div>
                {full ? (
                  <div className="text-xs tnum" style={{ color: GREEN }}>✓ {fmtD(c.last_at.slice(0, 10))}</div>
                ) : canEdit ? (
                  <div className="flex items-center justify-center gap-1 mt-0.5">
                    <input value={boxes[key] ?? ""} placeholder={qtyFmt(remaining)} inputMode="decimal"
                      onChange={(e) => setBoxes((b) => ({ ...b, [key]: e.target.value }))}
                      className="rounded border px-1 py-0.5 text-xs tnum text-right" style={{ width: 56, borderColor: BORDER }} title="the quantity to issue — blank means all that remains" />
                    <button onClick={() => onIssue(j.job_no, it.item_code, c)} disabled={busy === key}
                      className="rounded px-1.5 py-0.5 text-xs font-bold" style={{ background: busy === key ? MUTED : GREEN, color: "#fff" }} title={`issue into WIP_${j.job_no}`}>✓</button>
                    {c.issued > 0 && <span className="text-xs tnum" style={{ color: "#92400E" }}>{qtyFmt(c.issued)} gone</span>}
                  </div>
                ) : c.issued > 0 ? <div className="text-xs tnum" style={{ color: "#92400E" }}>{qtyFmt(c.issued)} of {qtyFmt(c.qty)}</div> : null}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
void RED;
