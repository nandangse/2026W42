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
import GenieTable from "@/components/GenieTable";
import Slips from "./Slips";
import Kitting from "./Kitting";

interface Run { id: string; mrp_no: string; name: string; run_date: string; by: string | null; created_at: string; generated_at: string | null; jobs?: number; value?: number; kitted_value?: number }
interface BoardJob { job_no: string; tag: string; cust: string; fam: string; project_id: string; project_name: string; tdd: string | null; val: number | null; stat: string }
interface Col extends BoardJob { live: boolean; rbom_id: string }
interface Cell {
  qty: number; uom: string; rate: number | null; value: number | null; status: string; source: string;
  issued: number; issued_value: number; issues: number; last_by: string; last_at: string;
}
interface Item { item_code: string; item_name: string; item_group: string; cells: Record<string, Cell>; stock: number | null; ordered: number | null; order_qty: number | null }
interface Grid { run: Run; jobs: Col[]; items: Item[]; issues: number; stockLive: boolean }
interface Person { email: string; display_name: string | null; initials: string | null }

/**
 * The planning numbers for one item across the chosen jobs (Dr Raghu,
 * 3 Sep 2026: "current stock, required, kitted, needed, in order, sign,
 * to order — and a final box"). Required is the RBOM quantity summed over
 * the jobs; kitted what has gone into their WIPs; needed the difference;
 * stock and in-order live from the ERP; the balance is stock plus on
 * order less needed, signed; to order is the shortfall, never below zero.
 */
function plan(it: Item) {
  let required = 0, kitted = 0, rate: number | null = null;
  for (const c of Object.values(it.cells)) { required += c.qty; kitted += Math.min(c.qty, c.issued); if (rate === null && c.rate !== null) rate = c.rate; }
  const needed = required - kitted;
  const balance = it.stock === null || it.ordered === null ? null : it.stock + it.ordered - needed;
  const toOrder = balance === null ? null : Math.max(0, -balance);
  return { required, kitted, needed, balance, toOrder, rate };
}

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

// ================================================================ the list
/**
 * MRP — every run on one page (Dr Raghu, 3 Sep 2026: "keep this in MRP as
 * a page where all MRP will be listed; clicking on that will go to a fresh
 * page"). A new run is made here and opens on its own page at once.
 */
export default function Mrp() {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => {
    const r = await fetch("/api/saamaan/mrp?mode=list", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error || `The server answered ${r.status}.`); setRuns([]); return; }
    setRuns(j.runs || []);
  };
  useEffect(() => { load(); }, []);
  const create = async () => {
    if (!newName.trim()) { setMsg("Give the run a name."); return; }
    setBusy(true); setMsg("");
    const r = await post("/api/saamaan/mrp", { action: "create", name: newName.trim() });
    setBusy(false);
    if (!r.ok) { setMsg(r.error || "Could not create."); return; }
    window.location.href = `/saamaan/mrp/${(r.run as Run).id}`;
  };
  const open = (id: string) => { window.location.href = `/saamaan/mrp/${id}`; };
  return (
    <Screen title="MRP — Material Resource Planning" blurb="Every run. Click one to open it on its own page: its jobs, the plan, what is kitted, what the store is to issue, what has been released."
      action={<>
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="new run — a name" onKeyDown={(e) => { if (e.key === "Enter") create(); }}
          className="rounded border px-2 py-2 text-sm" style={{ borderColor: BORDER, minWidth: 200 }} />
        <Btn kind="primary" onClick={create} disabled={busy}>+ New run</Btn>
      </>}>
      {err && <Note kind="error">{err}</Note>}
      {msg && <Note kind="warn">{msg}</Note>}
      <GenieTable<Run>
        rows={runs}
        minWidth={900}
        search={(r, q) => [r.mrp_no, r.name, r.by].join(" ").toLowerCase().includes(q)}
        searchPlaceholder="🔍 run, name, who"
        empty="No run yet — name one on the right."
        columns={[
          { key: "no", label: "MRP No", align: "left", sort: (r) => r.mrp_no, render: (r) => <button onClick={() => open(r.id)} className="font-bold hover:underline" style={{ color: NAVY }}>{r.mrp_no}</button> },
          { key: "name", label: "Run", align: "left", sort: (r) => r.name, render: (r) => <button onClick={() => open(r.id)} className="font-semibold text-left" style={{ color: INK }}>{r.name}</button> },
          { key: "date", label: "Date", align: "left", sort: (r) => r.run_date, render: (r) => <span className="tnum">{fmtD(r.run_date)}</span> },
          { key: "by", label: "By", align: "left", sort: (r) => who(r.by), render: (r) => who(r.by) },
          { key: "jobs", label: "Jobs", align: "right", sort: (r) => r.jobs ?? 0, render: (r) => <span className="tnum">{r.jobs ?? 0}</span> },
          { key: "value", label: "Value of run", align: "right", sort: (r) => r.value ?? 0, render: (r) => <span className="tnum">{money(r.value ?? 0)}</span> },
          { key: "kitted", label: "Kitted value", align: "right", sort: (r) => r.kitted_value ?? 0, render: (r) => <span className="tnum" style={{ color: r.kitted_value ? GREEN : MUTED }}>{money(r.kitted_value ?? 0)}</span> },
          { key: "gen", label: "Generated", align: "right", sort: (r) => S(r.generated_at), render: (r) => <span className="tnum" style={{ color: MUTED }}>{r.generated_at ? fmtAt(r.generated_at) : "·"}</span> },
        ]}
      />
    </Screen>
  );
}

// ================================================================ one run
const TABS: { key: string; label: string }[] = [
  { key: "jobs", label: "Jobs" },
  { key: "plan", label: "MRP plan" },
  { key: "kitted", label: "Kitted items" },
  { key: "store", label: "Store issue items" },
  { key: "released", label: "Items released" },
];

export function MrpRun({ id, role, email }: { id: string; role: string; email: string }) {
  const runId = id;
  const [board, setBoard] = useState<BoardJob[]>([]);
  const [tab, setTab] = useState("jobs");
  const [grid, setGrid] = useState<Grid | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const [picker, setPicker] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [openJob, setOpenJob] = useState<Col | null>(null);
  const [fullHead, setFullHead] = useState(true);
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const [boxes, setBoxes] = useState<Record<string, string>>({});
  const [showPlan, setShowPlan] = useState(true);
  const [orderBox, setOrderBox] = useState<Record<string, string>>({});
  const [people, setPeople] = useState<Person[]>([]);
  const [routing, setRouting] = useState<Record<string, string>>({});
  const [toStore, setToStore] = useState("");
  const [toPurchase, setToPurchase] = useState("");
  const canEdit = ["admin", "planner", "project_owner"].includes(role);

  useEffect(() => {
    fetch("/api/saamaan/slip?mode=people", { cache: "no-store" }).then((r) => r.json()).then((j) => {
      setPeople(j.people || []); setRouting(j.settings || {});
      setToStore((t) => t || j.settings?.store_email || ""); setToPurchase((t) => t || j.settings?.purchase_email || "");
    }).catch(() => {});
  }, []);

  /** The order boxes keep themselves — "no save button, always live". */
  const keepPlan = async (rows: { item_code: string; order_qty: number | null }[]) => {
    if (!rows.length) return;
    const r = await post("/api/saamaan/mrp", { action: "plan", id: runId, rows });
    if (!r.ok) setMsg(r.error || "Could not keep the order quantity.");
  };
  const fillFromCalc = async () => {
    if (!grid) return;
    const rows = grid.items.map((it) => ({ item_code: it.item_code, order_qty: plan(it).toOrder })).filter((r) => r.order_qty !== null);
    setOrderBox({});
    await keepPlan(rows);
    await loadRun(runId);
  };
  const submit = async (kind: "store" | "purchase") => {
    const to = kind === "store" ? toStore : toPurchase;
    setBusy(kind); setMsg("");
    const r = await post("/api/saamaan/mrp", { action: kind === "store" ? "submit_store" : "submit_purchase", id: runId, to_email: to });
    setBusy("");
    if (!r.ok) { setMsg(r.error || "Could not submit."); return; }
    const slip = r.slip as { slip_no: string };
    setMsg(`${slip.slip_no} raised to ${to.split("@")[0]} — ${r.lines} line${r.lines === 1 ? "" : "s"}. See Issue slips.`);
    await loadRun(runId);
  };

  const loadList = async () => {
    const r = await fetch("/api/saamaan/mrp?mode=list", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (r.ok) setBoard(j.board || []);
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
    let cells = 0, done = 0, value = 0, issued = 0, runValue = 0, toOrderValue = 0;
    for (const it of grid?.items ?? []) {
      for (const c of Object.values(it.cells)) {
        cells++; if (c.issued >= c.qty && c.qty > 0) done++;
        value += c.value ?? 0; issued += c.issued_value;
      }
      const pl = plan(it);
      if (pl.rate !== null) {
        if (it.order_qty) runValue += it.order_qty * pl.rate;
        if (pl.toOrder) toOrderValue += pl.toOrder * pl.rate;
      }
    }
    return { cells, done, pending: cells - done, value, issued, runValue, toOrderValue };
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

  const run = grid?.run ?? null;
  const toggleFold = (g: string) => setFolded((f) => { const n = new Set(f); if (n.has(g)) n.delete(g); else n.add(g); return n; });

  return (
    <div style={{ maxWidth: "100%" }}>
      {/* ---------------------------------- the run head and the tabs, frozen */}
      <div style={{ position: "sticky", top: 43, zIndex: 30, background: "#F7F8FC", margin: "-12px -12px 12px", padding: "12px 12px 0" }}>
        <div className="flex items-center gap-4 flex-wrap px-3 py-2 rounded-lg border" style={{ borderColor: BORDER, background: "#fff" }}>
          <a href="/saamaan/mrp" className="text-xs font-bold" style={{ color: NAVY }}>← MRP</a>
          {run ? (<>
            <span className="font-bold" style={{ color: INK, fontSize: 16 }}>{run.mrp_no}</span>
            <span className="font-semibold" style={{ color: INK }}>{run.name}</span>
            <span className="text-xs" style={{ color: MUTED }}>Date <b className="tnum" style={{ color: INK }}>{fmtD(run.run_date)}</b></span>
            <span className="text-xs" style={{ color: MUTED }}>By <b style={{ color: INK }}>{who(run.by) === "·" ? who(email) : who(run.by)}</b></span>
            <span className="text-xs" style={{ color: MUTED }}>Jobs <b className="tnum" style={{ color: INK }}>{grid?.jobs.length ?? 0}</b></span>
            <span className="text-xs" style={{ color: MUTED }}>Valuation <b className="tnum" style={{ color: INK }}>{money(totals.value)}</b></span>
            <span className="text-xs" style={{ color: MUTED }}>Kitted <b className="tnum" style={{ color: totals.issued ? GREEN : INK }}>{money(totals.issued)}</b> · {pct(totals.issued, totals.value)}</span>
            <span className="text-xs" style={{ color: MUTED }}>Value of run <b className="tnum" style={{ color: INK }}>{money(totals.runValue)}</b></span>
            {run.generated_at && <span className="text-xs" style={{ color: MUTED }}>generated <span className="tnum">{fmtAt(run.generated_at)}</span></span>}
          </>) : <span className="text-sm" style={{ color: MUTED }}>Reading the run…</span>}
        </div>
        <div className="flex gap-1 mt-2" style={{ borderBottom: `1px solid ${BORDER}` }}>
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className="px-3 py-2 text-sm font-bold"
              style={{ color: tab === t.key ? NAVY : INK, borderBottom: `3px solid ${tab === t.key ? NAVY : "transparent"}`, marginBottom: -1 }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {err && <Note kind="error">{err}</Note>}
      {msg && <Note kind="warn">{msg}</Note>}

      {run && tab === "kitted" && <Kitting mrp={runId} />}
      {run && tab === "store" && <Slips mrp={runId} />}
      {run && tab === "released" && <Released mrp={runId} />}

      {run && tab === "jobs" && (<>
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
            <Btn kind="primary" onClick={async () => { await generate(); setTab("plan"); }} disabled={busy === "generate"}>{busy === "generate" ? "Generating…" : "GENERATE"}</Btn>
          )}
        </div>
        {grid && grid.jobs.length === 0 && <Note kind="info">Add jobs to the run, then GENERATE.</Note>}
      </>)}

      {run && tab === "plan" && (<>
        {/* ------------------------------------------------ the top strip */}
        {grid && grid.items.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 mb-3">
            {[
              ["Items added", String(totals.done), "cells fully issued"],
              ["Pending", String(totals.pending), "cells not yet, or partly"],
              ["Kitting %", pct(totals.issued, totals.value), "by value"],
              ["Valuation kitted", money(totals.issued), "what has gone into the WIPs"],
              ["Valuation total", money(totals.value), "the RBOMs of these jobs, summed"],
              ["Value of MRP run", money(totals.runValue), `the order boxes at the RBOM rates${totals.toOrderValue ? ` · calculated ${money(totals.toOrderValue)}` : ""}`],
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
          {/* -------------------------------------- planning: the + and the buttons */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Btn onClick={() => setShowPlan((v) => !v)} title="Stock, required, kitted, needed, in order, balance, to order, the order box and its value">{showPlan ? "− Planning" : "+ Planning"}</Btn>
            {showPlan && canEdit && <Btn onClick={fillFromCalc} title="Copy the calculated To order into every order box">Fill order boxes from To order</Btn>}
            {grid && !grid.stockLive && <span className="text-xs" style={{ color: AMBER }}>the ERP could not be read — stock and in-order show dots</span>}
            {canEdit && (
              <span className="ml-auto flex items-center gap-1 flex-wrap">
                <select value={toStore} onChange={(e) => setToStore(e.target.value)} className="rounded border px-1.5 py-1 text-xs bg-white" style={{ borderColor: BORDER, maxWidth: 170 }} title="the store keeper — set the default in Masters">
                  <option value="">store → who?</option>
                  {people.map((p) => <option key={p.email} value={p.email}>{p.display_name || p.email.split("@")[0]}</option>)}
                </select>
                <Btn kind="primary" onClick={() => submit("store")} disabled={busy === "store" || !toStore} title="Every tick on these jobs not yet on a slip becomes one issue slip">Submit to store →</Btn>
                <select value={toPurchase} onChange={(e) => setToPurchase(e.target.value)} className="rounded border px-1.5 py-1 text-xs bg-white" style={{ borderColor: BORDER, maxWidth: 170 }} title="purchase — set the default in Masters">
                  <option value="">purchase → who?</option>
                  {people.map((p) => <option key={p.email} value={p.email}>{p.display_name || p.email.split("@")[0]}</option>)}
                </select>
                <Btn kind="primary" onClick={() => submit("purchase")} disabled={busy === "purchase" || !toPurchase} title="The order boxes become one purchase slip">Submit to purchase →</Btn>
              </span>
            )}
          </div>
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
                  <th rowSpan={fullHead ? 5 : 2} className="px-2 py-1 text-left" style={{ position: "sticky", left: 0, top: 0, zIndex: 3, background: "#14224F", width: 200, minWidth: 200, maxWidth: 200, verticalAlign: "bottom" }}>Item</th>
                  {showPlan && PLAN_COLS.map((c) => (
                    <th key={c.key} rowSpan={fullHead ? 5 : 2} className="px-1.5 py-1 text-right" style={{ position: "sticky", top: 0, zIndex: 2, background: "#0F766E", verticalAlign: "bottom", minWidth: c.w }} title={c.hint}>{c.label}</th>
                  ))}
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
                    boxes={boxes} setBoxes={setBoxes} busy={busy} canEdit={canEdit} onIssue={issue}
                    showPlan={showPlan} orderBox={orderBox} setOrderBox={setOrderBox} onKeep={(code, q) => keepPlan([{ item_code: code, order_qty: q }])} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-xs mt-2" style={{ color: MUTED, lineHeight: 1.6 }}>
            Planning: stock is the Stock warehouses only, live from the ERP; in order is what is on purchase orders; balance is stock + in order − needed, signed; to order is the shortfall. The order box keeps itself as you leave it.
            A cell is the RBOM&apos;s quantity of that item for that job — each job one unit. Tick to issue it all into the job&apos;s WIP; type a smaller number first for a partial.
            Green is fully issued, with the date; hover for who and how much. <span style={{ color: AMBER }}>D</span> marks a Draft line. Kitted and pending are counts; % is by value. Stock is not reduced by an issue — that comes next.
          </div>
        </>)}
        {grid && grid.jobs.length > 0 && grid.items.length === 0 && (
          <Note kind="warn">The chosen jobs have no RBOM lines yet. Build the RBOMs on the BOM front, then GENERATE on the Jobs tab.</Note>
        )}
        {grid && grid.jobs.length === 0 && <Note kind="info">No jobs on this run yet — the Jobs tab.</Note>}
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
    </div>
  );
}

// ======================================================= items released
interface ReleasedLine {
  id: string; slip_no: string; slip_kind: string; released_to: string; project_id: string; job_no: string; item_group: string; item_code: string; item_name: string;
  qty: number; uom: string; released_qty: number; released_at: string | null; released_by: string | null; amount: number | null;
}
function Released({ mrp }: { mrp: string }) {
  const [data, setData] = useState<{ rows: ReleasedLine[] } | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    fetch(`/api/saamaan/slip?mode=released&mrp=${encodeURIComponent(mrp)}`, { cache: "no-store" })
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `The server answered ${r.status}.`); return j; })
      .then(setData).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [mrp]);
  return (
    <div>
      {err && <Note kind="error">{err}</Note>}
      <GenieTable<ReleasedLine>
        rows={data ? data.rows : null}
        minWidth={1000}
        search={(r, q) => [r.slip_no, r.job_no, r.item_code, r.item_name, r.released_by].join(" ").toLowerCase().includes(q)}
        searchPlaceholder="🔍 slip, job, item, who"
        empty="Nothing released yet — the store releases against a slip on Store issue items."
        columns={[
          { key: "at", label: "Released", align: "left", sort: (r) => S(r.released_at), render: (r) => <span className="tnum">{r.released_at ? fmtAt(r.released_at) : "·"}</span> },
          { key: "slip", label: "Slip", align: "left", sort: (r) => r.slip_no, render: (r) => <b style={{ color: NAVY }}>{r.slip_no}</b> },
          { key: "job", label: "Job", align: "left", sort: (r) => r.job_no, render: (r) => <span className="tnum">{r.job_no || "·"}</span> },
          { key: "item", label: "Item", align: "left", sort: (r) => r.item_code, render: (r) => <span><b style={{ color: INK }}>{r.item_code}</b> <span style={{ color: MUTED }}>{r.item_name}</span></span> },
          { key: "q", label: "Released", align: "right", sort: (r) => Number(r.released_qty), render: (r) => <span className="tnum font-bold" style={{ color: GREEN }}>{qtyFmt(Number(r.released_qty))} <span style={{ color: MUTED, fontWeight: 500 }}>{r.uom}</span></span> },
          { key: "of", label: "Of", align: "right", sort: (r) => Number(r.qty), render: (r) => <span className="tnum" style={{ color: MUTED }}>{qtyFmt(Number(r.qty))}</span> },
          { key: "by", label: "By", align: "left", sort: (r) => who(r.released_by), render: (r) => who(r.released_by) },
          { key: "to", label: "Slip to", align: "left", render: (r) => <span style={{ color: MUTED }}>{who(r.released_to)}</span> },
        ]}
      />
    </div>
  );
}

const PLAN_COLS: { key: string; label: string; hint: string; w: number }[] = [
  { key: "stock", label: "Stock", hint: "current stock in the Stock warehouses, live from the ERP", w: 64 },
  { key: "required", label: "Required", hint: "the RBOM quantity, summed over the chosen jobs", w: 64 },
  { key: "kitted", label: "Kitted", hint: "what has gone into the jobs' WIPs", w: 60 },
  { key: "needed", label: "Needed", hint: "required less kitted", w: 60 },
  { key: "ordered", label: "In order", hint: "on purchase orders, not yet received — every warehouse", w: 64 },
  { key: "balance", label: "Balance", hint: "stock + in order − needed; negative is short", w: 64 },
  { key: "toorder", label: "To order", hint: "the shortfall, never below nothing", w: 64 },
  { key: "box", label: "Order qty", hint: "yours to type — filled from To order by the button; keeps itself", w: 80 },
  { key: "value", label: "Value", hint: "the order quantity at the RBOM rate", w: 84 },
];

// ============================================================ the rows
function GroupRows({ group, items, jobs, folded, onFold, boxes, setBoxes, busy, canEdit, onIssue, showPlan, orderBox, setOrderBox, onKeep }: {
  group: string; items: Item[]; jobs: Col[]; folded: boolean; onFold: () => void;
  boxes: Record<string, string>; setBoxes: (f: (b: Record<string, string>) => Record<string, string>) => void;
  busy: string; canEdit: boolean; onIssue: (job: string, item: string, cell: Cell) => void;
  showPlan: boolean; orderBox: Record<string, string>; setOrderBox: (f: (b: Record<string, string>) => Record<string, string>) => void; onKeep: (code: string, q: number | null) => void;
}) {
  const num = (n: number | null) => (n === null ? "·" : qtyFmt(n));
  return (
    <>
      <tr style={{ background: "#F1F3F9" }}>
        <td colSpan={1 + (showPlan ? PLAN_COLS.length : 0) + jobs.length} className="px-2 py-1 font-bold" style={{ color: INK, borderTop: `1px solid ${BORDER}` }}>
          <button onClick={onFold} className="flex items-center gap-2">
            <span style={{ width: 12, display: "inline-block" }}>{folded ? "▸" : "▾"}</span>{group.replace(/^RM - /, "")} <span style={{ color: MUTED, fontWeight: 500 }}>· {items.length} item{items.length === 1 ? "" : "s"}</span>
          </button>
        </td>
      </tr>
      {!folded && items.map((it, i) => (
        <tr key={it.item_code} style={{ background: i % 2 ? "#FAF9F5" : "#fff" }}>
          {/* 200px, frozen on the left (Dr Raghu, 3 Sep 2026: "make it narrow and frozen — approx 200 px"); the name wraps to two lines, whole on hover. */}
          <td className="px-2 py-1" title={`${it.item_code} — ${it.item_name}`}
            style={{ position: "sticky", left: 0, background: i % 2 ? "#FAF9F5" : "#fff", borderBottom: `1px solid ${BORDER}`, borderRight: `2px solid ${BORDER}`, zIndex: 1, width: 200, minWidth: 200, maxWidth: 200 }}>
            <b style={{ color: INK }}>{it.item_code}</b>
            <div style={{ color: MUTED, whiteSpace: "normal", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", lineHeight: 1.25, fontSize: 11 }}>{it.item_name}</div>
          </td>
          {showPlan && (() => {
            const pl = plan(it);
            const typed = orderBox[it.item_code];
            const shown = typed !== undefined ? typed : it.order_qty === null ? "" : String(it.order_qty);
            const q = shown === "" ? null : Number(shown);
            const val = q !== null && Number.isFinite(q) && pl.rate !== null ? q * pl.rate : null;
            const cellCss = { borderBottom: `1px solid ${BORDER}`, borderLeft: `1px solid ${BORDER}`, background: "#F0FAF7" } as const;
            return (<>
              <td className="px-1.5 py-1 text-right tnum" style={cellCss}>{num(it.stock)}</td>
              <td className="px-1.5 py-1 text-right tnum font-bold" style={cellCss}>{qtyFmt(pl.required)}</td>
              <td className="px-1.5 py-1 text-right tnum" style={{ ...cellCss, color: pl.kitted ? GREEN : MUTED }}>{qtyFmt(pl.kitted)}</td>
              <td className="px-1.5 py-1 text-right tnum" style={cellCss}>{qtyFmt(pl.needed)}</td>
              <td className="px-1.5 py-1 text-right tnum" style={cellCss}>{num(it.ordered)}</td>
              <td className="px-1.5 py-1 text-right tnum font-bold" style={{ ...cellCss, color: pl.balance === null ? MUTED : pl.balance < 0 ? RED : GREEN }}>{pl.balance === null ? "·" : `${pl.balance > 0 ? "+" : ""}${qtyFmt(pl.balance)}`}</td>
              <td className="px-1.5 py-1 text-right tnum font-bold" style={{ ...cellCss, color: pl.toOrder ? RED : MUTED }}>{num(pl.toOrder)}</td>
              <td className="px-1 py-1 text-right" style={cellCss}>
                {canEdit ? (
                  <input value={shown} inputMode="decimal" placeholder="·"
                    onChange={(e) => setOrderBox((b) => ({ ...b, [it.item_code]: e.target.value }))}
                    onBlur={(e) => { const v = e.target.value.trim(); const n = v === "" ? null : Number(v); if (v === "" || Number.isFinite(n)) onKeep(it.item_code, n); }}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                    className="rounded border px-1 py-0.5 text-xs tnum text-right" style={{ width: 70, borderColor: q && pl.toOrder !== null && q !== pl.toOrder ? AMBER : BORDER }} />
                ) : <span className="tnum">{shown || "·"}</span>}
              </td>
              <td className="px-1.5 py-1 text-right tnum" style={{ ...cellCss, color: val ? INK : MUTED }}>{val === null ? "·" : money(val)}</td>
            </>);
          })()}
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
