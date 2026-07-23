"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { LOGO } from "@/lib/logo";
import { TRADES, zeroCrew, templateFor, type Crew } from "@/lib/templates";
import {
  today,
  fmt,
  fmtFull,
  lakh,
  jobNo,
  initials,
  diffDays,
  addDays,
  computeSchedule,
  planEnd,
  isoWeek,
  otdColor,
  otdDelay,
  dueStyle,
  parseISO,
  toISO,
  TASK_CATS,
  type Plan,
  type PlanMilestone,
} from "@/lib/schedule";

// The 32 ERP job-status options (verbatim from V1.9), used by the editable
// Job Status dropdowns.
const STATUSES = [
  "S: Order Received", "S: Client Discussion", "PPC: Pre Kick Off", "PPC: Kick Off",
  "D: GA Approval", "D: Drawing 25%", "D: Drawing 50%", "D: Drawing 75%",
  "D: BOM: TBOM", "D: BOM 50%", "M: Material Kitting Not Started",
  "M: Material Kitting - 25%", "M: Material Kitting - 50%", "M: Material Kitting - 75%",
  "M: Material Recieved", "P: Production Started", "P: Subassembly Fabrication - 50%",
  "P: Subassembly Fabrication - 75%", "P: Assembly Fabrication - 25%",
  "P: Assembly Fabrication - 50%", "P: Assembly Fabrication - 75%",
  "P: Assembly Fabrication - 100%", "P: Hydraulics Stage", "P: Electrical Stage",
  "P: Painting Stage", "Q: Final Inspection", "S: Pending Client Delivery",
  "D: Delivered", "I: Installation Not Started due to Client",
  "I: Installation in progress", "I: Installation Completed", "C: Job Handed Over",
];

type Role = "admin" | "planner";
const TODAY = today();

interface Job {
  id: string;
  tag: string;
  fam: string;
  cust: string;
  val: number;
  tdd: string | null;
  otd: string | null;
  start: string | null;
  proj: string;
  stat: string;
  pct: number;
  note: string;
  own: string;
  mgmt: string | null;
  tp: number;
  tpv: number;
  tpp: number;
  kit: number;
  active: boolean;
  archived: boolean;
}
interface Task {
  id: string;
  kind: "erp" | "manual";
  j: string;
  t: string;
  d: string;
  who: string;
  due: string | null;
  cat: string;
  esc: string;
  done: boolean;
  comments: number;
}
interface Board {
  jobs: Job[];
  archived: Record<string, Job>;
  projects: any[];
  tasks: Task[];
  plans: Record<string, Plan & { baseline_on?: string | null; baseline_end?: string | null }>;
  baselines: Record<string, { idx: number; title: string; start: string; end: string }[]>;
  materials: Record<string, { id: string; item: string; qty: string; status: string; custom: boolean }[]>;
  priority: string[] | null;
  templates: Record<string, any>;
  owners: string[];
  batches: Record<string, { uploaded_at: string; filename: string } | undefined>;
  aggregates: { kittingPct: number; materialValueSum: number; kittedValueSum: number; activeJobCount: number };
}

interface ErpLogEntry {
  id: string;
  time: string;
  doctype: string;
  docname: string;
  field: string;
  value: string;
  link: string | null;
}

const erpJobLink = (id: string) => "https://nandanerp.in/app/jobmaster/" + id;

export default function PlanningSuite({
  email,
  role,
  isRaghu,
}: {
  email: string;
  role: Role;
  isRaghu: boolean;
}) {
  const router = useRouter();
  const isAdmin = role === "admin";
  const [board, setBoard] = useState<Board | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"delivery" | "load" | "plan" | "tasking" | "erp" | "admin">("delivery");
  const [showVal, setShowVal] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [erpLog, setErpLog] = useState<ErpLogEntry[]>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const reload = async () => {
    try {
      const b = await api.board();
      setBoard(b);
      setErr("");
      return b as Board;
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      return null;
    }
  };
  useEffect(() => {
    reload();
  }, []);

  const V = (rupees: number) => (showVal ? "₹" + lakh(rupees) : "₹ •••");

  const logout = async () => {
    await supabaseBrowser().auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  const onFile = async (f: File | null) => {
    if (!f) return;
    try {
      const res = await api.upload(f);
      alert("Loaded ✓ (" + res.summary.filename + ")\n" + (res.summary.lines || []).join("\n"));
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  const pushERP = (doctype: string, id: string, field: string, value: string) =>
    setErpLog((l) => [
      {
        id: String(Math.random()),
        time: new Date().toLocaleTimeString("en-IN"),
        doctype,
        docname: "JOB " + jobNo(id),
        field,
        value,
        link: erpJobLink(id),
      },
      ...l,
    ]);

  // ---- derived ----
  const jobs = board?.jobs ?? [];
  const byTDD = useMemo(
    () => [...jobs].sort((a, b) => ((a.tdd || "9999") < (b.tdd || "9999") ? -1 : 1)),
    [jobs],
  );
  useEffect(() => {
    if (!activeId && byTDD.length) setActiveId(byTDD[0].id);
  }, [byTDD, activeId]);

  if (!board) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ color: "#8A94A0" }}>
        {err ? <span style={{ color: "#B3261E" }}>{err}</span> : "Loading board…"}
      </div>
    );
  }

  const queued = erpLog.length;
  const loadedCount = ["jobs", "projects", "tasks"].filter((k) => {
    const b = board.batches[k] || board.batches["pre"];
    return b && b.uploaded_at.slice(0, 10) === TODAY;
  }).length;

  const TAB_DEFS: [typeof tab, string][] = [
    ["delivery", "Job Delivery Board"],
    ["load", "Load Board"],
    ["plan", "Job Plan"],
    ["tasking", "Nandan Tasking"],
    ["erp", `Update to ERP${queued ? " (" + queued + ")" : ""}`],
    ...(isAdmin ? ([["admin", "Admin ⚙"]] as [typeof tab, string][]) : []),
  ];

  return (
    <div className="min-h-screen" style={{ background: "#F1EFE9", color: "#22303C" }}>
      {/* ===== frozen header ===== */}
      <div
        className="px-4 py-2.5"
        style={{ background: "#16232F", borderBottom: "3px solid #E8600A", position: "sticky", top: 0, zIndex: 45 }}
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="rounded bg-white px-2 py-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={LOGO} alt="Nandan GSE" style={{ height: 34 }} />
            </div>
            <div>
              <div className="text-xs tracking-widest font-bold" style={{ color: "#E8600A" }}>
                WORKS PLANNING SUITE
                <span style={{ background: "#E8600A", color: "#fff", borderRadius: 3, padding: "1px 5px", marginLeft: 6 }}>
                  V 2.0
                </span>
              </div>
              <h1 className="text-lg font-bold text-white leading-tight">
                Milestones · Load · Tasking · Delivery
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={(e) => onFile(e.target.files?.[0] || null)} />
            <button onClick={() => fileRef.current?.click()} className="text-xs rounded px-3 py-1.5 font-bold" style={{ background: "#E8600A", color: "#fff" }}>
              ⬆ Upload Excel
            </button>
            <span className="text-xs rounded px-2 py-1.5 font-bold" style={{ background: "#0D161F", color: loadedCount === 3 ? "#7BC67E" : "#8FA1B3", border: "1px solid #22303C" }}>
              🌅 Morning update {loadedCount}/3
            </span>
            <select
              value={showVal ? "with" : "without"}
              onChange={(e) => setShowVal(e.target.value === "with")}
              className="text-xs rounded px-2 py-1.5 font-semibold"
              style={{ background: "#0D161F", color: "#F5B32B", border: "1px solid #22303C" }}
            >
              <option value="with">With value ₹</option>
              <option value="without">Without value</option>
            </select>
            <span className="text-xs rounded px-2 py-1.5" style={{ background: "#0D161F", color: "#8FA1B3", border: "1px solid #22303C" }}>
              👤 {email}
              <button onClick={logout} className="ml-1 font-bold" style={{ color: "#E8600A" }}>
                Logout
              </button>
            </span>
            <div className="flex gap-1 rounded p-1 flex-wrap" style={{ background: "#0D161F" }}>
              {TAB_DEFS.map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className="px-3 py-1.5 rounded text-sm font-semibold"
                  style={tab === k ? { background: "#E8600A", color: "#fff" } : { color: "#8FA1B3" }}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="text-xs mt-1 flex gap-3 flex-wrap" style={{ color: "#3A4A5A" }}>
          <span>🔒 Restricted — visible only to authorised planning users</span>
          <span style={{ color: "#F5B32B" }}>
            Data: {board.jobs.length} active jobs · kitting {board.aggregates.kittingPct.toFixed(1)}%
          </span>
        </div>
      </div>

      {tab === "delivery" && <DeliveryBoard board={board} V={V} onOpen={(id) => { setActiveId(id); setTab("plan"); }} reload={reload} pushERP={pushERP} />}
      {tab === "load" && <LoadBoard board={board} byTDD={byTDD} />}
      {tab === "plan" && <JobPlan board={board} activeId={activeId} setActiveId={setActiveId} V={V} reload={reload} isRaghu={isRaghu} pushERP={pushERP} />}
      {tab === "tasking" && <Tasking board={board} reload={reload} />}
      {tab === "erp" && <UpdateToErp erpLog={erpLog} />}
      {tab === "admin" && isAdmin && <Admin board={board} reload={reload} />}
    </div>
  );
}

// ============================ shared bits ============================
function Chip({ label, value, color = "#22303C" }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded px-2 py-1" style={{ background: "#F4F2EC" }}>
      <div className="text-xs" style={{ color: "#8A94A0" }}>{label}</div>
      <div className="text-sm font-bold" style={{ color }}>{value}</div>
    </div>
  );
}

function CrewCell({ value, onChange, color }: { value: number; onChange: (v: number) => void; color: string }) {
  return (
    <input
      type="number"
      min={0}
      max={99}
      value={value === 0 ? "" : value}
      placeholder="·"
      onChange={(e) => onChange(Math.max(0, parseInt(e.target.value || "0", 10)))}
      className="w-9 text-center text-xs py-1 rounded border bg-white focus:outline-none tnum"
      style={{ borderColor: "#E2E0DA", color: value > 0 ? color : "#B8B5AC", fontWeight: value > 0 ? 700 : 400 }}
    />
  );
}

// ============================ Delivery board ============================
function DeliveryBoard({
  board,
  V,
  onOpen,
  reload,
  pushERP,
}: {
  board: Board;
  V: (v: number) => string;
  onOpen: (id: string) => void;
  reload: () => Promise<Board | null>;
  pushERP: (dt: string, id: string, f: string, v: string) => void;
}) {
  const [subTab, setSubTab] = useState<"priority" | "okan" | "cal" | "fam" | "cust">("priority");
  const [delOwn, setDelOwn] = useState("all");
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [calMonth, setCalMonth] = useState(TODAY.slice(0, 7));

  const jobs = board.jobs;
  const owners = board.owners;
  const prio = board.priority; // array or null
  const byTDD = useMemo(
    () => [...jobs].sort((a, b) => ((a.tdd || "9999") < (b.tdd || "9999") ? -1 : 1)),
    [jobs],
  );

  const setPrio = async (ids: string[] | null) => {
    await api.post("/api/priority", { order: ids || [] });
    await reload();
  };
  const editStat = async (j: Job, value: string) => {
    try {
      await api.post("/api/job-field", { job_id: j.id, field: "stat", value });
      pushERP("Jobmaster", j.id, "job_status", value);
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };
  const groupBy = (key: "fam" | "cust"): [string, Job[]][] => {
    const g: Record<string, Job[]> = {};
    byTDD.forEach((j) => (g[j[key]] = g[j[key]] || []).push(j));
    return Object.entries(g).sort((a, b) =>
      (a[1][0].tdd || "9999") < (b[1][0].tdd || "9999") ? -1 : 1,
    );
  };

  const JobLink = ({ j }: { j: Job }) => (
    <button onClick={() => onOpen(j.id)} className="font-bold underline decoration-dotted" style={{ color: "#1B3A5C" }} title={"Open milestone plan for " + j.tag}>
      {jobNo(j.id)}
    </button>
  );

  // ---- KPI cards ----
  const totVal = jobs.reduce((s, j) => s + j.val, 0);
  const totTp = jobs.reduce((s, j) => s + (j.tpv || 0), 0);
  const matVal = jobs.reduce((s, j) => s + j.val * (1 - (j.tpp || 0) / 100), 0);
  const kitted = jobs.reduce((s, j) => s + j.val * (1 - (j.tpp || 0) / 100) * ((j.kit || 0) / 100), 0);
  const kitPct = matVal ? Math.round((kitted / matVal) * 100) : 0;
  const Card = ({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) => (
    <div className="bg-white rounded-lg border px-3 py-2" style={{ borderColor: "#E2E0DA", borderTop: `3px solid ${color}` }}>
      <div className="text-xs font-bold" style={{ color: "#8A94A0" }}>{label}</div>
      <div className="text-xl font-bold tnum" style={{ color }}>{value}</div>
      {sub && <div className="text-xs" style={{ color: "#8A94A0" }}>{sub}</div>}
    </div>
  );

  const SubBtn = ({ k, l }: { k: typeof subTab; l: string }) => (
    <button onClick={() => setSubTab(k)} className="px-3 py-1 rounded text-sm font-semibold" style={subTab === k ? { background: "#22303C", color: "#fff" } : { color: "#5A6672" }}>{l}</button>
  );

  return (
    <div className="p-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
        <Card label="PENDING JOBS" value={jobs.length} sub="from Jobmaster · live" color="#16232F" />
        <Card label="TOTAL VALUE" value={V(totVal)} color="#1B3A5C" />
        <Card label="TOTAL THROUGHPUT" value={V(totTp)} sub={totVal ? Math.round((totTp / totVal) * 100) + "% of value" : ""} color="#E8600A" />
        <Card label="KITTING %" value={kitPct + "%"} sub="Σ val × (1−T%) × Kit% ÷ Σ val × (1−T%)" color="#0D9488" />
        <Card label="KITTED MATERIAL VALUE" value={V(kitted)} sub="Σ value × (1 − T%) × Kitting%" color="#7C3AED" />
      </div>

      <div className="flex gap-1 rounded p-1 bg-white border mb-3 flex-wrap" style={{ borderColor: "#E2E0DA", width: "fit-content" }}>
        <SubBtn k="priority" l="Priority List (A60 → O)" />
        <SubBtn k="okan" l="By Owner (Kanban)" />
        <SubBtn k="cal" l="📅 Calendar (ISO weeks)" />
        <SubBtn k="fam" l="Schedule by Product" />
        <SubBtn k="cust" l="Schedule by Customer" />
        <select value={delOwn} onChange={(e) => setDelOwn(e.target.value)} className="px-2 py-1 rounded border bg-white text-sm ml-1" style={{ borderColor: "#D9D6CD" }}>
          <option value="all">All owners</option>
          {owners.map((o) => (<option key={o}>{o}</option>))}
        </select>
      </div>

      {/* ---- Calendar (ISO weeks) ---- */}
      {subTab === "cal" && (() => {
        const [yy, mm] = calMonth.split("-").map(Number);
        const first = new Date(Date.UTC(yy, mm - 1, 1));
        const monStart = new Date(first);
        monStart.setUTCDate(monStart.getUTCDate() - ((monStart.getUTCDay() + 6) % 7));
        const lastD = new Date(Date.UTC(yy, mm, 0));
        const sunEnd = new Date(lastD);
        sunEnd.setUTCDate(sunEnd.getUTCDate() + (6 - ((sunEnd.getUTCDay() + 6) % 7)));
        const days: string[] = [];
        for (let d = new Date(monStart); d <= sunEnd; d.setUTCDate(d.getUTCDate() + 1)) days.push(toISO(new Date(d)));
        const weeks: string[][] = [];
        for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
        const byDay: Record<string, Job[]> = {};
        jobs.forEach((j) => { if (j.tdd) (byDay[j.tdd] = byDay[j.tdd] || []).push(j); });
        const monthLabel = first.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
        const shiftMonth = (d: number) => setCalMonth(toISO(new Date(Date.UTC(yy, mm - 1 + d, 1))).slice(0, 7));
        return (
          <div className="bg-white rounded-lg border p-3" style={{ borderColor: "#E2E0DA" }}>
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <button onClick={() => shiftMonth(-1)} className="px-3 py-1 rounded font-bold text-sm" style={{ background: "#F4F2EC", color: "#22303C" }}>◀</button>
              <div className="font-bold text-center" style={{ color: "#16232F" }}>{monthLabel}<span className="text-xs font-normal" style={{ color: "#8A94A0" }}> · jobs on their Target Delivery Date · ISO week numbers on the left</span></div>
              <div className="flex gap-1">
                <button onClick={() => setCalMonth(TODAY.slice(0, 7))} className="px-2 py-1 rounded text-xs font-bold" style={{ background: "#E8600A", color: "#fff" }}>Today</button>
                <button onClick={() => shiftMonth(1)} className="px-3 py-1 rounded font-bold text-sm" style={{ background: "#F4F2EC", color: "#22303C" }}>▶</button>
              </div>
            </div>
            <table className="w-full text-xs" style={{ borderCollapse: "collapse", tableLayout: "fixed" }}>
              <thead>
                <tr style={{ background: "#22303C", color: "#fff" }}>
                  <th className="px-1 py-1.5" style={{ width: 58 }}>ISO Wk</th>
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (<th key={d} className="px-1 py-1.5">{d}</th>))}
                </tr>
              </thead>
              <tbody>
                {weeks.map((wk) => {
                  const wkCount = wk.reduce((n, d) => n + (byDay[d] || []).length, 0);
                  const wkVal = wk.reduce((v, d) => v + (byDay[d] || []).reduce((x, j) => x + (j.val || 0), 0), 0);
                  return (
                    <tr key={wk[0]} className="border-t align-top" style={{ borderColor: "#EFEDE7" }}>
                      <td className="px-1 py-1 font-bold text-center" style={{ background: wk[0] <= TODAY && TODAY <= wk[6] ? "#FFF3E8" : "#F4F2EC", color: "#1B3A5C" }}>
                        W{isoWeek(wk[0])}
                        {wkCount > 0 && (<div className="font-normal" style={{ color: "#8A94A0", fontSize: 9 }}>{wkCount} job{wkCount === 1 ? "" : "s"}<br />{V(wkVal)}</div>)}
                      </td>
                      {wk.map((d) => {
                        const inM = d.slice(0, 7) === calMonth;
                        const list = byDay[d] || [];
                        return (
                          <td key={d} className="px-1 py-1 border-l" style={{ borderColor: "#EFEDE7", background: d === TODAY ? "#FFF3E8" : inM ? "#fff" : "#FAF9F5", opacity: inM ? 1 : 0.55, height: 64 }}>
                            <div className="font-bold tnum" style={{ color: d === TODAY ? "#E8600A" : "#8A94A0" }}>{parseInt(d.slice(8), 10)}{d === TODAY ? " · today" : ""}</div>
                            {list.map((j) => (
                              <div key={j.id} onClick={() => onOpen(j.id)} title={j.tag + " · " + j.cust + " · " + (j.stat || "")} className="rounded px-1 py-0.5 mb-0.5 cursor-pointer font-semibold" style={{ background: j.tdd && j.tdd < TODAY ? "#B3261E" : "#DCE8F5", color: j.tdd && j.tdd < TODAY ? "#fff" : "#1B3A5C", fontSize: 9, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{jobNo(j.id)} {j.tag}</div>
                            ))}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="text-xs mt-2" style={{ color: "#8A94A0" }}>Tap a job chip to open its milestone plan · red chip = TDD already past · week cell shows count &amp; value due that ISO week</div>
          </div>
        );
      })()}

      {/* ---- Priority List (drag to reorder) ---- */}
      {subTab === "priority" && (() => {
        const base = prio
          ? prio.map((id) => byTDD.find((j) => j.id === id)).filter(Boolean).concat(byTDD.filter((j) => !prio.includes(j.id))) as Job[]
          : byTDD;
        const plist = base.filter((j) => delOwn === "all" || j.own === delOwn);
        const canDrag = delOwn === "all";
        const onDrop = (ti: number) => {
          if (dragIdx === null || dragIdx === ti) return;
          const ids = base.map((j) => j.id);
          const [moved] = ids.splice(dragIdx, 1);
          ids.splice(ti, 0, moved);
          setDragIdx(null);
          pushERP("Jobmaster", moved, "priority_rank", `position ${ti + 1}`);
          setPrio(ids);
        };
        return (
          <div className="bg-white rounded-lg border overflow-x-auto" style={{ borderColor: "#E2E0DA" }}>
            <div className="px-3 pt-2 pb-1 text-xs flex justify-between flex-wrap gap-2" style={{ color: "#8A94A0" }}>
              <span>{canDrag ? "⠿ Drag any row to set manual priority" : "Owner filter active — clear it to drag-reorder"}{prio ? " · manual order active" : " · sorted by Target Delivery Date"}</span>
              {prio && <button onClick={() => setPrio(null)} className="font-bold" style={{ color: "#E8600A" }}>↺ Reset to TDD order</button>}
            </div>
            <table className="w-full text-xs" style={{ minWidth: 900 }}>
              <thead>
                <tr style={{ background: "#22303C", color: "#fff" }}>
                  <th className="px-2 py-2 text-left">Pri</th><th className="px-2 py-2 text-left">Job</th><th className="px-2 py-2 text-left">Customer Tag</th><th className="px-2 py-2 text-left">Product Family</th><th className="px-2 py-2">Target Delivery</th><th className="px-2 py-2">OTD Date</th><th className="px-2 py-2 text-left">Owner</th><th className="px-2 py-2 text-left">Job Status ✎</th><th className="px-2 py-2">Prod %</th><th className="px-2 py-2">Value</th><th className="px-2 py-2">Throughput</th><th className="px-2 py-2">T%</th><th className="px-2 py-2">Kit%</th>
                </tr>
              </thead>
              <tbody>
                {plist.map((j, i) => (
                  <tr key={j.id} draggable={canDrag} onDragStart={() => setDragIdx(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => onDrop(i)} className="border-t" style={{ borderColor: "#EFEDE7", background: dragIdx === i ? "#FFF3E8" : i % 2 ? "#FAF9F5" : "#fff", cursor: canDrag ? "grab" : "default" }} title={j.note}>
                    <td className="px-2 py-1.5 whitespace-nowrap" style={{ color: "#8A94A0" }}>{canDrag && <span style={{ color: "#B8B5AC" }}>⠿ </span>}<b style={{ color: "#E8600A" }}>{i + 1}</b></td>
                    <td className="px-2 py-1.5"><JobLink j={j} /></td>
                    <td className="px-2 py-1.5 font-medium">{j.tag}</td>
                    <td className="px-2 py-1.5" style={{ color: "#5A6672" }}>{j.fam}</td>
                    <td className="px-2 py-1.5 text-center font-bold whitespace-nowrap tnum" style={{ color: j.tdd && j.tdd < TODAY ? "#B3261E" : "#22303C" }}>{fmtFull(j.tdd)}</td>
                    <td className="px-2 py-1.5 text-center font-bold whitespace-nowrap tnum" style={{ color: otdColor(j.otd) }}>{fmtFull(j.otd)}{otdDelay(j) && (<div style={{ fontSize: 10 }}>+{otdDelay(j)}d late</div>)}</td>
                    <td className="px-2 py-1.5" style={{ color: "#1B3A5C" }}>{j.own || "—"}</td>
                    <td className="px-2 py-1.5">
                      <select value={j.stat} onChange={(e) => editStat(j, e.target.value)} className="text-xs border rounded px-1 py-0.5 bg-white w-full" style={{ borderColor: "#E2E0DA", maxWidth: 190 }}>
                        {!STATUSES.includes(j.stat) && j.stat && <option value={j.stat}>{j.stat}</option>}
                        {STATUSES.map((s) => (<option key={s}>{s}</option>))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5 text-center tnum">{j.pct}%</td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap tnum">{V(j.val)}</td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap tnum" style={{ color: "#E8600A" }}>{V(j.tpv || 0)}</td>
                    <td className="px-2 py-1.5 text-center tnum">{j.tpp || 0}%</td>
                    <td className="px-2 py-1.5 text-center tnum" style={{ color: (j.kit || 0) >= 80 ? "#0D7A3F" : (j.kit || 0) >= 40 ? "#D97706" : "#B3261E" }}>{j.kit || 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })()}

      {/* ---- By Owner (Kanban) ---- */}
      {subTab === "okan" && (
        <div className="flex gap-3 overflow-x-auto pb-2 items-start">
          {(delOwn === "all" ? owners.concat(jobs.some((j) => !j.own) ? ["Unassigned"] : []) : [delOwn]).map((o) => {
            const ojobs = byTDD.filter((j) => (o === "Unassigned" ? !j.own : j.own === o));
            if (!ojobs.length) return null;
            return (
              <div key={o} style={{ minWidth: 250, maxWidth: 270 }}>
                <div className="rounded-t-lg p-2" style={{ background: "#16232F", color: "#fff", borderBottom: "3px solid #E8600A" }}>
                  <div className="flex justify-between items-baseline">
                    <span className="font-bold text-sm" style={{ color: "#F5B32B" }}>{o}</span>
                    <span className="text-xs">{ojobs.length} jobs · {V(ojobs.reduce((s, j) => s + j.val, 0))}</span>
                  </div>
                </div>
                <div className="rounded-b-lg p-2" style={{ background: "#E9E6DD" }}>
                  {ojobs.map((j) => (
                    <div key={j.id} onClick={() => onOpen(j.id)} className="rounded p-2 mb-1.5 cursor-pointer bg-white border" style={{ borderColor: "#E2E0DA", borderLeft: `4px solid ${otdColor(j.otd)}` }}>
                      <div className="flex justify-between items-baseline">
                        <span className="font-bold text-xs" style={{ color: "#1B3A5C" }}>JOB {jobNo(j.id)}</span>
                        <span className="text-xs font-bold" style={{ color: j.tdd && j.tdd < TODAY ? "#B3261E" : "#5A6672" }}>TDD {fmt(j.tdd)}</span>
                      </div>
                      <div className="text-xs truncate" title={j.tag}>{j.tag}</div>
                      <div className="text-xs flex justify-between mt-0.5" style={{ color: "#8A94A0" }}><span>{j.stat.slice(0, 22)}</span><span>{j.pct}%</span></div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ---- Schedule by Product / Customer: month-wise matrix ---- */}
      {(subTab === "fam" || subTab === "cust") && (() => {
        const key = subTab;
        const mset = [...new Set(byTDD.map((j) => (j.tdd || "").slice(0, 7)).filter(Boolean))].sort();
        const mlabel = (m: string) => parseISO(m + "-01").toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });
        const groups: Record<string, { total: { n: number; v: number }; m: Record<string, { n: number; v: number }> }> = {};
        byTDD.forEach((j) => {
          const g = (groups[j[key]] = groups[j[key]] || { total: { n: 0, v: 0 }, m: {} });
          g.total.n++; g.total.v += j.val;
          const mm = (j.tdd || "").slice(0, 7);
          if (mm) { const c = (g.m[mm] = g.m[mm] || { n: 0, v: 0 }); c.n++; c.v += j.val; }
        });
        const names = Object.keys(groups).sort();
        return (
          <div className="bg-white rounded-lg border overflow-x-auto mb-4" style={{ borderColor: "#E2E0DA" }}>
            <div className="px-3 pt-2 text-xs font-bold" style={{ color: "#8A94A0" }}>NANDAN GSE PRODUCTION SCHEDULE — month-wise by {key === "fam" ? "product family" : "customer"} (live from Target Delivery Dates)</div>
            <table className="text-xs w-full" style={{ minWidth: 720 }}>
              <thead>
                <tr style={{ background: "#22303C", color: "#fff" }}>
                  <th className="px-3 py-2 text-left">{key === "fam" ? "Product Family" : "Customer"}</th><th className="px-2 py-2">Jobs</th><th className="px-2 py-2">Value</th>
                  {mset.map((m) => (<th key={m} className="px-2 py-2 whitespace-nowrap">{mlabel(m)}</th>))}
                </tr>
              </thead>
              <tbody>
                {names.map((n, i) => (
                  <tr key={n} className="border-t" style={{ borderColor: "#EFEDE7", background: i % 2 ? "#FAF9F5" : "#fff" }}>
                    <td className="px-3 py-1.5 font-semibold">{n}</td>
                    <td className="px-2 py-1.5 text-center font-bold tnum">{groups[n].total.n}</td>
                    <td className="px-2 py-1.5 text-center whitespace-nowrap tnum">{V(groups[n].total.v)}</td>
                    {mset.map((m) => { const c = groups[n].m[m]; return (<td key={m} className="px-2 py-1.5 text-center whitespace-nowrap tnum" style={{ background: c ? "#DCE8F5" : "transparent", border: "1px solid #F1EFE9" }}>{c ? (<><b>{c.n}</b> · {V(c.v)}</>) : "·"}</td>); })}
                  </tr>
                ))}
                <tr style={{ background: "#16232F", color: "#F5B32B" }} className="font-bold">
                  <td className="px-3 py-2">TOTAL</td><td className="px-2 py-2 text-center">{byTDD.length}</td><td className="px-2 py-2 text-center whitespace-nowrap">{V(byTDD.reduce((s, j) => s + j.val, 0))}</td>
                  {mset.map((m) => { const list = byTDD.filter((j) => (j.tdd || "").slice(0, 7) === m); return (<td key={m} className="px-2 py-2 text-center whitespace-nowrap">{list.length ? (<>{list.length} · {V(list.reduce((s, j) => s + j.val, 0))}</>) : "·"}</td>); })}
                </tr>
              </tbody>
            </table>
          </div>
        );
      })()}

      {(subTab === "fam" || subTab === "cust") && groupBy(subTab).map(([g, list]) => (
        <div key={g} className="mb-4">
          <div className="flex items-baseline gap-2 mb-1">
            <h3 className="font-bold" style={{ color: "#16232F" }}>{g}</h3>
            <span className="text-xs" style={{ color: "#8A94A0" }}>{list.length} jobs · {V(list.reduce((s, j) => s + j.val, 0))} · earliest TDD {fmt(list[0].tdd)}</span>
          </div>
          <div className="bg-white rounded-lg border overflow-x-auto" style={{ borderColor: "#E2E0DA" }}>
            <table className="w-full text-xs" style={{ minWidth: 760 }}>
              <tbody>
                {list.map((j, i) => (
                  <tr key={j.id} className="border-t" style={{ borderColor: "#EFEDE7", background: i % 2 ? "#FAF9F5" : "#fff" }} title={j.note}>
                    <td className="px-2 py-1.5" style={{ width: 50 }}><JobLink j={j} /></td>
                    <td className="px-2 py-1.5 font-medium">{j.tag}</td>
                    <td className="px-2 py-1.5" style={{ color: "#5A6672" }}>{subTab === "fam" ? j.cust : j.fam}</td>
                    <td className="px-2 py-1.5 text-center font-bold whitespace-nowrap" style={{ color: j.tdd && j.tdd < TODAY ? "#B3261E" : "#22303C" }}>TDD {fmtFull(j.tdd)}</td>
                    <td className="px-2 py-1.5 text-center whitespace-nowrap font-bold" style={{ color: otdColor(j.otd) }}>OTD {fmtFull(j.otd)}{otdDelay(j) && (<span style={{ fontSize: 10 }}> +{otdDelay(j)}d</span>)}</td>
                    <td className="px-2 py-1.5" style={{ width: 170 }}>{j.stat}</td>
                    <td className="px-2 py-1.5 text-center" style={{ width: 46 }}>{j.pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================ Load board ============================
interface Bucket { a: number; b: number; label: string; sub?: string; wk?: number; wkStart?: boolean; today: boolean }
function LoadBoard({ board, byTDD }: { board: Board; byTDD: Job[] }) {
  const [bucket, setBucket] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(byTDD.map((j) => j.id)));
  const [shiftSplit, setShiftSplit] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const toggleCollapse = (id: string) =>
    setCollapsed((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const plannedJobs = useMemo(
    () => byTDD.map((j) => {
      const saved = board.plans[j.id];
      const pl: Plan = saved && saved.milestones.length
        ? { start: saved.start || (j.start && j.start >= TODAY ? j.start : TODAY), milestones: saved.milestones }
        : { start: j.start && j.start >= TODAY ? j.start : TODAY, milestones: templateFor(j.fam).map((m) => ({ name: m.name, days: m.days, preds: m.pred ? [m.pred] : [], crew: { ...m.crew }, shift: "D", offset: m.offset })) };
      return { job: j, plan: pl };
    }),
    [board, byTDD],
  );

  const load = useMemo(() => {
    const perJob = plannedJobs.map(({ job, plan }) => ({ job, sched: computeSchedule(plan) }));
    let min: string | null = null, max: string | null = null;
    perJob.forEach(({ sched }) => sched.forEach((m) => { if (!min || m.start < min) min = m.start; if (!max || m.end > max) max = m.end; }));
    if (!min || !max) return null;
    const lo = min, hi = max;
    const totalDays = diffDays(lo, hi) + 1;
    const dayLoad = perJob.map(({ sched }) => {
      const byTrade: Record<string, number[]> = {};
      TRADES.forEach((t) => (byTrade[t.key] = new Array(totalDays).fill(0)));
      sched.forEach((m) => {
        const a = diffDays(lo, m.start), b = diffDays(lo, m.end);
        TRADES.forEach((t) => { const n = m.crew[t.key] || 0; if (!n) return; for (let d = a; d <= b; d++) byTrade[t.key][d] += n; });
      });
      return byTrade;
    });
    const buckets: Bucket[] = [];
    const hasToday = (a: number, b: number) => addDays(lo, a) <= TODAY && TODAY <= addDays(lo, b);
    if (bucket === "daily") {
      for (let d = 0; d < totalDays; d++) {
        const iso = addDays(lo, d);
        buckets.push({ a: d, b: d, label: fmt(iso), wk: isoWeek(iso), wkStart: parseISO(iso).getUTCDay() === 1 || d === 0, today: iso === TODAY });
      }
    } else if (bucket === "weekly") {
      for (let d = 0; d < totalDays; d += 7) {
        const e = Math.min(d + 6, totalDays - 1);
        buckets.push({ a: d, b: e, label: "W" + isoWeek(addDays(lo, d)), sub: fmt(addDays(lo, d)) + "–" + fmt(addDays(lo, e)), wkStart: true, today: hasToday(d, e) });
      }
    } else {
      let d = 0;
      while (d < totalDays) {
        const dt = parseISO(addDays(lo, d));
        const label = dt.toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });
        const nm = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 1));
        const b = Math.min(diffDays(lo, toISO(nm)) - 1, totalDays - 1);
        buckets.push({ a: d, b, label, today: hasToday(d, b) });
        d = b + 1;
      }
    }
    const cellVal = (arr: number[], a: number, b: number) => { if (bucket === "daily") return arr[a]; let s = 0; for (let x = a; x <= b; x++) s += arr[x]; return s; };
    const rows = perJob.map((pj, ji) => {
      const trades = TRADES.map((t) => ({ trade: t, cells: buckets.map(({ a, b }) => cellVal(dayLoad[ji][t.key], a, b)) }));
      const totals = buckets.map((_, bi) => trades.reduce((s, tr) => s + tr.cells[bi], 0));
      return { job: pj.job, trades, totals };
    });
    const shopTrades = TRADES.map((t, ti) => ({ trade: t, cells: buckets.map((_, bi) => rows.reduce((s, r) => s + r.trades[ti].cells[bi], 0)) }));
    const shopTotal = buckets.map((_, bi) => shopTrades.reduce((s, tr) => s + tr.cells[bi], 0));
    const peak = Math.max(1, ...rows.flatMap((r) => r.trades.flatMap((tr) => tr.cells)));
    const totPeak = Math.max(1, ...rows.flatMap((r) => r.totals));
    return { buckets, rows, shopTrades, shopTotal, peak, totPeak };
  }, [plannedJobs, bucket]);

  // auto-scroll to today
  useEffect(() => {
    const t = setTimeout(() => {
      const c = scrollRef.current;
      const el = c?.querySelector('[data-today="1"]') as HTMLElement | null;
      if (c && el) c.scrollLeft = Math.max(0, el.offsetLeft - c.clientWidth / 2);
    }, 60);
    return () => clearTimeout(t);
  }, [bucket, load]);

  const heat = (v: number, peak: number): React.CSSProperties => {
    if (!v) return { background: "#FFFFFF", color: "#D5D2C9" };
    const r = Math.min(1, v / peak);
    if (r > 0.85) return { background: "#B3261E", color: "#fff" };
    if (r > 0.65) return { background: "#E8600A", color: "#fff" };
    if (r > 0.4) return { background: "#F5B32B", color: "#3B2A00" };
    return { background: "#DCE8F5", color: "#1B3A5C" };
  };
  const SPLIT = (v: number) => { const n = Math.round(v * 0.25); return { d: v - n, n }; };
  const cellTxt = (v: number) => (!v ? "·" : shiftSplit ? (<span>☀︎{SPLIT(v).d}<span style={{ opacity: 0.75 }}> ☾{SPLIT(v).n}</span></span>) : v);
  const colStyle = (b: Bucket): React.CSSProperties => ({ borderLeft: b.wkStart ? "1px solid #C9C6BD" : "1px solid #F1EFE9" });

  const toolBtn = (active: boolean): React.CSSProperties =>
    active ? { background: "#22303C", color: "#fff" } : { color: "#5A6672" };

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="flex gap-1 rounded p-1 bg-white border" style={{ borderColor: "#E2E0DA" }}>
          {(["daily", "weekly", "monthly"] as const).map((b) => (
            <button key={b} onClick={() => setBucket(b)} className="px-3 py-1 rounded text-sm font-semibold capitalize" style={toolBtn(bucket === b)}>{b}</button>
          ))}
        </div>
        <button onClick={() => setCollapsed(new Set())} className="px-3 py-1.5 rounded text-sm font-semibold border" style={{ background: "#fff", color: "#22303C", borderColor: "#E2E0DA" }}>▾ Expand all</button>
        <button onClick={() => setCollapsed(new Set(byTDD.map((j) => j.id)))} className="px-3 py-1.5 rounded text-sm font-semibold border" style={{ background: "#fff", color: "#22303C", borderColor: "#E2E0DA" }}>▸ Collapse all</button>
        <button onClick={() => setShiftSplit(!shiftSplit)} className="px-3 py-1.5 rounded text-sm font-semibold border" style={shiftSplit ? { background: "#16232F", color: "#F5B32B", borderColor: "#16232F" } : { background: "#fff", color: "#5A6672", borderColor: "#E2E0DA" }}>☀︎/☾ Shift split {shiftSplit ? "ON" : "OFF"}</button>
        <div className="text-xs" style={{ color: "#8A94A0" }}>All {plannedJobs.length} jobs · {bucket === "daily" ? "cells = men that day" : "cells = man-days in period"} · jobs without a saved plan use their family default · view auto-scrolls to today</div>
      </div>

      {!load ? (
        <div className="text-sm" style={{ color: "#8A94A0" }}>No jobs yet — upload the Jobs/PRE export to populate the load.</div>
      ) : (
        <div ref={scrollRef} className="bg-white rounded-lg border overflow-x-auto" style={{ borderColor: "#E2E0DA" }}>
          <table className="text-xs" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#22303C", color: "#fff" }}>
                <th className="px-3 py-2 text-left sticky left-0" style={{ background: "#22303C", width: 150, minWidth: 150, zIndex: 3 }}>Job</th>
                <th className="px-2 py-2 text-left sticky" style={{ background: "#22303C", left: 150, minWidth: 82, zIndex: 3 }}>Trade</th>
                {load.buckets.map((b, i) => (
                  <th key={i} data-today={b.today ? "1" : undefined} className="px-2 py-1 whitespace-nowrap font-medium" style={{ borderLeft: b.wkStart ? "1px solid #3D4E5E" : undefined, background: b.today ? "#E8600A" : undefined, color: b.today ? "#fff" : undefined }}>
                    {bucket === "daily" && b.wkStart && <div style={{ color: "#F5B32B", fontSize: 9 }}>W{b.wk}</div>}
                    {b.label}
                    {b.sub && <div style={{ fontSize: 9, opacity: 0.7 }}>{b.sub}</div>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {load.rows.map((r, ri) => {
                const isCollapsed = collapsed.has(r.job.id);
                const shownTrades = isCollapsed ? [] : r.trades;
                return (
                  <React.Fragment key={ri}>
                    {shownTrades.map((tr, ti) => (
                      <tr key={`${ri}-${ti}`} style={{ borderTop: ti === 0 ? "2px solid #22303C" : "1px solid #F1EFE9" }}>
                        {ti === 0 && (
                          <td rowSpan={r.trades.length + 1} onClick={() => toggleCollapse(r.job.id)} className="px-3 py-2 font-semibold sticky left-0 bg-white align-top cursor-pointer" style={{ color: "#22303C", borderRight: "1px solid #EFEDE7", width: 150, minWidth: 150, zIndex: 2 }}>
                            JOB {jobNo(r.job.id)}
                            <div className="font-normal" style={{ color: "#8A94A0", maxWidth: 140 }}>{r.job.tag.slice(0, 34)}</div>
                            <div className="mt-1" style={{ color: "#E8600A", fontSize: 10 }}>▾ collapse</div>
                          </td>
                        )}
                        <td className="px-2 py-1 font-bold whitespace-nowrap sticky" style={{ color: tr.trade.color, left: 150, background: "#fff", zIndex: 2, borderRight: "1px solid #EFEDE7" }}>{tr.trade.tiny} <span className="font-normal" style={{ color: "#8A94A0" }}>{tr.trade.label}</span></td>
                        {tr.cells.map((v, ci) => (
                          <td key={ci} className="text-center px-1 py-1 font-bold whitespace-nowrap tnum" style={{ ...heat(v, load.peak), minWidth: 44, ...colStyle(load.buckets[ci]) }} title={`${tr.trade.label}: ${v}`}>{cellTxt(v)}</td>
                        ))}
                      </tr>
                    ))}
                    <tr key={`${ri}-tot`} style={{ background: "#F2EFE6", borderTop: isCollapsed ? "2px solid #22303C" : "1px solid #D9D6CD" }} className="font-bold">
                      {isCollapsed && (
                        <td onClick={() => toggleCollapse(r.job.id)} className="px-3 py-2 sticky left-0 align-top cursor-pointer" style={{ background: "#F2EFE6", color: "#22303C", borderRight: "1px solid #EFEDE7", width: 150, minWidth: 150, zIndex: 2 }}>
                          JOB {jobNo(r.job.id)}
                          <div style={{ color: "#E8600A", fontSize: 10 }} className="font-normal">▸ expand trades</div>
                        </td>
                      )}
                      <td className="px-2 py-1 sticky" style={{ left: 150, background: "#F2EFE6", zIndex: 2, borderRight: "1px solid #E7E4DC" }}>TOTAL</td>
                      {r.totals.map((v, ci) => (
                        <td key={ci} className="text-center px-1 py-1 whitespace-nowrap tnum" style={{ ...heat(v, load.totPeak), ...colStyle(load.buckets[ci]) }}>{cellTxt(v)}</td>
                      ))}
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot>
              {load.shopTrades.map((tr, ti) => (
                <tr key={ti} style={{ background: "#16232F", color: "#fff", borderTop: ti === 0 ? "3px solid #E8600A" : "1px solid #22303C" }}>
                  {ti === 0 && (
                    <td rowSpan={load.shopTrades.length + 1} className="px-3 py-2 font-bold sticky left-0 align-top" style={{ background: "#16232F", width: 150, minWidth: 150, zIndex: 2 }}>SHOP TOTAL<div className="font-normal opacity-70" style={{ fontSize: 10 }}>all planned jobs</div></td>
                  )}
                  <td className="px-2 py-1 font-bold whitespace-nowrap sticky" style={{ color: "#F5B32B", left: 150, background: "#16232F", zIndex: 2 }}>{tr.trade.tiny} <span className="font-normal opacity-70">{tr.trade.label}</span></td>
                  {tr.cells.map((v, ci) => (
                    <td key={ci} className="text-center px-1 py-1 font-bold whitespace-nowrap tnum" style={{ color: v ? "#fff" : "#3A4A5A", borderLeft: "1px solid #22303C" }}>{cellTxt(v)}</td>
                  ))}
                </tr>
              ))}
              <tr style={{ background: "#0D161F", color: "#F5B32B" }} className="font-bold">
                <td className="px-2 py-2 sticky" style={{ left: 150, background: "#0D161F", zIndex: 2 }}>GRAND TOTAL</td>
                {load.shopTotal.map((v, ci) => (
                  <td key={ci} className="text-center px-1 py-2 whitespace-nowrap tnum" style={{ borderLeft: "1px solid #22303C" }}>{cellTxt(v)}</td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <div className="flex flex-wrap gap-3 mt-2 text-xs items-center" style={{ color: "#5A6672" }}>
        <span className="font-bold">Load key:</span>
        {([["#DCE8F5", "Light"], ["#F5B32B", "Moderate"], ["#E8600A", "Heavy"], ["#B3261E", "Peak — level or shift"]] as [string, string][]).map(([c, l]) => (
          <span key={l} className="flex items-center gap-1"><span className="w-4 h-4 rounded inline-block" style={{ background: c }} /> {l}</span>
        ))}
        <span className="ml-auto">F=Fitter · H=Helper · W=Welder · P=Painter · E=Electrician · Hd=Hydraulic</span>
      </div>
    </div>
  );
}

// ============================ Job Plan ============================
function JobPlan({
  board,
  activeId,
  setActiveId,
  V,
  reload,
  isRaghu,
  pushERP,
}: {
  board: Board;
  activeId: string | null;
  setActiveId: (id: string) => void;
  V: (v: number) => string;
  reload: () => Promise<Board | null>;
  isRaghu: boolean;
  pushERP: (dt: string, id: string, f: string, v: string) => void;
}) {
  const byTDD = [...board.jobs].sort((a, b) => ((a.tdd || "9999") < (b.tdd || "9999") ? -1 : 1));
  const job = board.jobs.find((j) => j.id === activeId) || (activeId ? board.archived[activeId] : undefined);

  // working copy of the plan (saved plan, or a fresh template for an unplanned job)
  const [draft, setDraft] = useState<Plan | null>(null);
  useEffect(() => {
    if (!job) { setDraft(null); return; }
    const saved = board.plans[job.id];
    if (saved) setDraft({ start: saved.start || job.start || TODAY, milestones: saved.milestones.map((m) => ({ ...m, crew: { ...m.crew }, preds: [...m.preds] })) });
    else setDraft({ start: job.start && job.start >= TODAY ? job.start : TODAY, milestones: templateFor(job.fam).map((m) => ({ name: m.name, days: m.days, preds: m.pred ? [m.pred] : [], crew: { ...m.crew }, shift: "D", offset: m.offset })) });
  }, [activeId, board]);

  const sched = useMemo(() => (draft ? computeSchedule(draft) : []), [draft]);
  const ends = sched.length ? planEnd(sched) : TODAY;
  const grandTotal = useMemo(() => sched.reduce((s, m) => s + TRADES.reduce((a, t) => a + (m.crew[t.key] || 0), 0) * Math.max(1, m.days), 0), [sched]);
  const savedPlan = job ? board.plans[job.id] : undefined;
  const baseline = job ? board.baselines[job.id] : undefined;
  const baselineEnd = savedPlan?.baseline_end || null;
  const msDone = sched.filter((m) => m.done).length;
  const allDone = sched.length > 0 && msDone === sched.length;
  const realEnd = allDone ? sched.reduce((mx, m) => (m.done_on && m.done_on > mx ? m.done_on : mx), "") : null;

  if (!job || !draft) return <div className="p-4 text-sm" style={{ color: "#8A94A0" }}>Pick a job.</div>;

  const setMilestone = (mi: number, patch: Partial<PlanMilestone>) =>
    setDraft((pl) => (pl ? { ...pl, milestones: pl.milestones.map((m, i) => (i === mi ? { ...m, ...patch } : m)) } : pl));
  const setCrew = (mi: number, key: keyof Crew, v: number) =>
    setDraft((pl) => (pl ? { ...pl, milestones: pl.milestones.map((m, i) => (i === mi ? { ...m, crew: { ...m.crew, [key]: v } } : m)) } : pl));
  const togglePred = (mi: number, p: number) =>
    setDraft((pl) => (pl ? { ...pl, milestones: pl.milestones.map((m, i) => (i === mi ? { ...m, preds: m.preds.includes(p) ? m.preds.filter((x) => x !== p) : [...m.preds, p].sort((a, b) => a - b) } : m)) } : pl));
  const addMilestone = () =>
    setDraft((pl) => (pl && pl.milestones.length < 50 ? { ...pl, milestones: [...pl.milestones, { name: `Milestone ${pl.milestones.length + 1}`, days: 3, preds: pl.milestones.length ? [pl.milestones.length] : [], crew: zeroCrew(), shift: "D", offset: 0 }] } : pl));
  const removeMilestone = (mi: number) =>
    setDraft((pl) => (pl ? { ...pl, milestones: pl.milestones.filter((_, i) => i !== mi).map((m) => ({ ...m, preds: m.preds.filter((p) => p !== mi + 1).map((p) => (p > mi + 1 ? p - 1 : p)) })) } : pl));

  const savePlan = async () => {
    await api.post("/api/plan", { job_id: job.id, start: draft.start, milestones: draft.milestones });
    await reload();
    alert("Plan saved ✓");
  };
  const saveBaseline = async () => {
    if (!sched.length) return;
    const payload = { job_id: job.id, baseline_end: ends, milestones: sched.map((m) => ({ idx: m.idx, title: m.name, start: m.start, end: m.end })), force: false };
    try {
      const r = await api.post("/api/baseline", payload);
      pushERP("Job Plan Baseline", job.id, "baseline_end", fmtFull(ends));
      await reload();
      alert("Baseline saved ✓ (" + r.baseline_on + ")");
    } catch (e) {
      if (e instanceof Error && /baseline_exists|409/.test(e.message)) {
        if (window.confirm("A baseline already exists. Overwrite with today's planned timeline?")) {
          await api.post("/api/baseline", { ...payload, force: true });
          await reload();
          alert("Baseline overwritten ✓");
        }
      } else alert(e instanceof Error ? e.message : String(e));
    }
  };
  const toggleDone = async (idx: number, done: boolean) => {
    // ensure the plan exists before toggling a milestone
    if (!savedPlan) await api.post("/api/plan", { job_id: job.id, start: draft.start, milestones: draft.milestones });
    await api.post("/api/milestone/toggle", { job_id: job.id, idx, done });
    await reload();
  };

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select value={job.id} onChange={(e) => setActiveId(e.target.value)} className="px-2 py-1.5 rounded border bg-white text-sm font-semibold" style={{ borderColor: "#D9D6CD", maxWidth: 420 }}>
          {byTDD.map((j) => (<option key={j.id} value={j.id}>{jobNo(j.id)} · {j.tag}</option>))}
          {Object.keys(board.archived).length > 0 && (
            <optgroup label="— delivered / no longer in the export (plans archived) —">
              {Object.values(board.archived).map((j) => (<option key={j.id} value={j.id}>✓ {jobNo(j.id)} · {j.tag}</option>))}
            </optgroup>
          )}
        </select>
        <span className="text-xs" style={{ color: "#8A94A0" }}>{Object.keys(board.plans).length} of {board.jobs.length} jobs planned</span>
      </div>

      {/* header card */}
      <div className="bg-white rounded-lg p-3 mb-3 border" style={{ borderColor: "#E2E0DA", borderLeft: "5px solid #E8600A" }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-2xl font-bold" style={{ color: "#16232F" }}>JOB {jobNo(job.id)}</span>
              <a href={erpJobLink(job.id)} target="_blank" rel="noreferrer" className="text-xs underline" style={{ color: "#8A94A0" }}>{job.id} ↗</a>
            </div>
            <div className="text-sm font-semibold" style={{ color: "#1B3A5C" }}>{job.tag}</div>
            <div className="text-xs mt-0.5" style={{ color: "#8A94A0" }}>{job.cust} · {job.fam} · {V(job.val)} · {job.stat}</div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Chip label="TARGET DELIVERY (ERP)" value={fmtFull(job.tdd)} color="#B3261E" />
            <Chip label="OTD DATE (ERP)" value={fmtFull(job.otd) + (otdDelay(job) ? ` · +${otdDelay(job)}d late` : "")} color={otdColor(job.otd)} />
            <div className="rounded px-2 py-1" style={{ background: isRaghu ? "#F3EEFB" : "#F4F2EC" }}>
              <div className="text-xs" style={{ color: "#8A94A0" }}>MGMT TARGET {isRaghu ? "✎" : "🔒"}</div>
              {isRaghu ? (
                <input type="date" value={job.mgmt || ""} onChange={async (e) => { await api.post("/api/job-field", { job_id: job.id, field: "mgmt", value: e.target.value }); pushERP("Jobmaster", job.id, "mgmt", fmtFull(e.target.value)); await reload(); }} className="text-sm font-bold bg-transparent" style={{ color: "#7C3AED", border: "none" }} />
              ) : (<div className="text-sm font-bold" style={{ color: "#7C3AED" }}>{fmtFull(job.mgmt)}</div>)}
            </div>
            <Chip label="PLAN END" value={fmtFull(ends)} color={ends > (job.tdd || "9999") ? "#B3261E" : "#0D7A3F"} />
            <Chip label="TOTAL MAN-DAYS" value={grandTotal + " md"} color="#E8600A" />
            <Chip label="MILESTONES DONE" value={msDone + " / " + sched.length} color={allDone ? "#0D7A3F" : "#22303C"} />
            {baseline && baselineEnd && (
              <div className="rounded px-2 py-1" style={{ background: "#EFF6EF", border: "1px dashed #0D7A3F" }}>
                <div className="text-xs" style={{ color: "#8A94A0" }}>📌 BASELINE ({fmt(savedPlan?.baseline_on || null)})</div>
                <div className="text-sm font-bold" style={{ color: "#0D7A3F" }}>
                  ends {fmtFull(baselineEnd)}
                  {(() => { const d = diffDays(baselineEnd, ends); return d ? <span style={{ color: d > 0 ? "#B3261E" : "#0D7A3F" }}> · {d > 0 ? "+" : ""}{d}d now</span> : null; })()}
                </div>
              </div>
            )}
            {baseline && baselineEnd && allDone && (
              <div className="rounded px-2 py-1" style={{ background: "#F3EEFB", border: "1px solid #7C3AED" }}>
                <div className="text-xs font-bold" style={{ color: "#7C3AED" }}>PROPOSED vs REAL</div>
                <div className="text-sm font-bold">{fmt(baselineEnd)} → {fmt(realEnd || TODAY)} {(() => { const d = diffDays(baselineEnd, realEnd || TODAY); return <span style={{ color: d > 0 ? "#B3261E" : "#0D7A3F" }}>({d > 0 ? "+" : ""}{d}d)</span>; })()}</div>
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2 mt-3 flex-wrap">
          <button onClick={savePlan} className="text-xs font-bold rounded px-3 py-1.5" style={{ background: "#E8600A", color: "#fff" }}>💾 Save plan</button>
          <button onClick={saveBaseline} className="text-xs font-bold rounded px-3 py-1.5" style={{ background: "#0D7A3F", color: "#fff" }}>📌 Save as Baseline</button>
          <button onClick={addMilestone} className="text-xs font-bold rounded px-3 py-1.5" style={{ background: "#1B3A5C", color: "#fff" }}>+ Milestone</button>
        </div>
      </div>

      {/* milestone table */}
      <div className="overflow-x-auto bg-white rounded-lg border" style={{ borderColor: "#E2E0DA" }}>
        <table className="text-xs tnum" style={{ borderCollapse: "collapse", minWidth: 820 }}>
          <thead>
            <tr style={{ background: "#F4F2EC", color: "#5A6672" }}>
              <th className="px-2 py-1 text-left">#</th>
              <th className="px-2 py-1 text-left" style={{ minWidth: 200 }}>Milestone</th>
              <th className="px-2 py-1">Days</th>
              <th className="px-2 py-1">Preds</th>
              <th className="px-2 py-1">Start</th>
              <th className="px-2 py-1">End</th>
              {TRADES.map((t) => (<th key={t.key} className="px-1 py-1" style={{ color: t.color }} title={t.label}>{t.tiny}</th>))}
              <th className="px-2 py-1">✓</th>
              <th className="px-2 py-1"></th>
            </tr>
          </thead>
          <tbody>
            {sched.map((m, i) => (
              <tr key={i} style={{ borderTop: "1px solid #EEECE6", opacity: m.done ? 0.6 : 1 }}>
                <td className="px-2 py-1" style={{ color: "#8A94A0" }}>{m.idx}</td>
                <td className="px-2 py-1">
                  <input value={m.name} onChange={(e) => setMilestone(i, { name: e.target.value })} className="w-full text-xs border rounded px-1 py-0.5" style={{ borderColor: "#E2E0DA" }} />
                </td>
                <td className="px-2 py-1 text-center">
                  <input type="number" min={1} value={m.days} onChange={(e) => setMilestone(i, { days: Math.max(1, parseInt(e.target.value || "1", 10)) })} className="w-12 text-center border rounded px-1 py-0.5" style={{ borderColor: "#E2E0DA" }} />
                </td>
                <td className="px-2 py-1 text-center" style={{ maxWidth: 120 }}>
                  <div className="flex flex-wrap gap-0.5 justify-center">
                    {sched.slice(0, i).map((_, k) => (
                      <button key={k} onClick={() => togglePred(i, k + 1)} className="rounded px-1" style={m.preds.includes(k + 1) ? { background: "#1B3A5C", color: "#fff" } : { background: "#E7E4DC", color: "#8A94A0" }}>{k + 1}</button>
                    ))}
                  </div>
                </td>
                <td className="px-2 py-1 text-center" style={{ color: "#5A6672" }}>{fmt(m.start)}</td>
                <td className="px-2 py-1 text-center" style={{ color: "#5A6672" }}>{fmt(m.end)}</td>
                {TRADES.map((t) => (<td key={t.key} className="px-1 py-1 text-center"><CrewCell value={m.crew[t.key] || 0} onChange={(v) => setCrew(i, t.key as keyof Crew, v)} color={t.color} /></td>))}
                <td className="px-2 py-1 text-center">
                  <input type="checkbox" checked={!!m.done} onChange={(e) => toggleDone(m.idx - 1, e.target.checked)} />
                </td>
                <td className="px-2 py-1 text-center">
                  <button onClick={() => removeMilestone(i)} style={{ color: "#B3261E" }}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================ Tasking ============================
function Tasking({ board, reload }: { board: Board; reload: () => Promise<Board | null> }) {
  const [filterCust, setFilterCust] = useState("all");
  const [filterFam, setFilterFam] = useState("all");
  const [adding, setAdding] = useState<string | null>(null);
  const [form, setForm] = useState({ t: "", who: "", due: TODAY, cat: "Production", esc: "None" });
  const [openTask, setOpenTask] = useState<Task | null>(null);

  const custs = useMemo(() => [...new Set(board.jobs.map((j) => j.cust))].sort(), [board]);
  const fams = useMemo(() => [...new Set(board.jobs.map((j) => j.fam))].sort(), [board]);
  const jobsWithTasks = board.jobs
    .filter((j) => (filterCust === "all" || j.cust === filterCust) && (filterFam === "all" || j.fam === filterFam))
    .filter((j) => board.tasks.some((t) => t.j === j.id))
    .sort((a, b) => ((a.tdd || "9999") < (b.tdd || "9999") ? -1 : 1));

  const toggle = async (t: Task) => { await api.post("/api/tasks", { action: "toggle", id: t.id, kind: t.kind, done: !t.done }); await reload(); };
  const submit = async (jid: string) => {
    if (!form.t.trim()) return;
    await api.post("/api/tasks", { action: "create", job_id: jid, title: form.t.trim(), who: form.who, due: form.due, cat: form.cat, esc: form.esc });
    setForm({ t: "", who: "", due: TODAY, cat: form.cat, esc: "None" });
    setAdding(null);
    await reload();
  };

  return (
    <div className="p-4">
      <div className="flex gap-2 mb-3 flex-wrap">
        <select value={filterCust} onChange={(e) => setFilterCust(e.target.value)} className="text-xs border rounded px-2 py-1 bg-white" style={{ borderColor: "#D9D6CD" }}>
          <option value="all">All customers</option>
          {custs.map((c) => (<option key={c}>{c}</option>))}
        </select>
        <select value={filterFam} onChange={(e) => setFilterFam(e.target.value)} className="text-xs border rounded px-2 py-1 bg-white" style={{ borderColor: "#D9D6CD" }}>
          <option value="all">All families</option>
          {fams.map((f) => (<option key={f}>{f}</option>))}
        </select>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {jobsWithTasks.map((j) => {
          const jt = board.tasks.filter((t) => t.j === j.id);
          return (
            <div key={j.id} className="rounded-lg border bg-white p-2 flex-shrink-0" style={{ width: 260, borderColor: "#E2E0DA" }}>
              <div className="flex items-center justify-between mb-2">
                <div className="font-bold text-sm" style={{ color: "#1B3A5C" }}>JOB {jobNo(j.id)}</div>
                <a href={erpJobLink(j.id)} target="_blank" rel="noreferrer" className="text-xs" style={{ color: "#8A94A0" }}>↗</a>
              </div>
              <div className="text-xs mb-2" style={{ color: "#8A94A0" }}>{j.tag}</div>
              {jt.map((t) => (
                <div key={t.id} onClick={() => setOpenTask(t)} className="rounded p-2 mb-1.5 cursor-pointer border" style={{ ...dueStyle(t.done ? null : t.due), borderColor: "rgba(0,0,0,0.08)", opacity: t.done ? 0.45 : 1 }}>
                  <div className="text-xs font-semibold" style={{ textDecoration: t.done ? "line-through" : "none" }}>{t.t}</div>
                  <div className="flex items-center justify-between mt-1 text-xs" style={{ opacity: 0.85 }}>
                    <span className="font-bold rounded px-1" style={{ background: "rgba(0,0,0,0.12)" }}>{initials(t.who)}</span>
                    {t.kind === "manual" && <span className="rounded px-1" style={{ background: "#E8600A", color: "#fff", fontSize: 9 }}>manual</span>}
                    <span style={{ fontSize: 10 }}>{(t.cat || "").toLowerCase()}</span>
                    <span className="tnum">{fmt(t.due)}</span>
                  </div>
                </div>
              ))}
              {adding === j.id ? (
                <AddTaskForm form={form} setForm={setForm} owners={board.owners} onSubmit={() => submit(j.id)} onCancel={() => setAdding(null)} />
              ) : (
                <button onClick={() => setAdding(j.id)} className="text-xs font-bold w-full rounded py-1 mt-1" style={{ background: "#F4F2EC", color: "#E8600A" }}>+ Add task</button>
              )}
            </div>
          );
        })}
        {jobsWithTasks.length === 0 && <div className="text-sm" style={{ color: "#8A94A0" }}>No tasks yet. Upload the ToDo Dashboard or add a manual task after opening a job.</div>}
      </div>

      {openTask && <TaskModal task={openTask} onClose={() => setOpenTask(null)} onToggle={() => toggle(openTask)} reload={reload} />}
    </div>
  );
}

function AddTaskForm({ form, setForm, owners, onSubmit, onCancel }: { form: any; setForm: (f: any) => void; owners: string[]; onSubmit: () => void; onCancel: () => void }) {
  return (
    <div className="rounded border p-2 mt-1 bg-white" style={{ borderColor: "#E8600A" }}>
      <input autoFocus placeholder="Task…" value={form.t} onChange={(e) => setForm({ ...form, t: e.target.value })} className="w-full text-xs border rounded px-1 py-1 mb-1" style={{ borderColor: "#E2E0DA" }} />
      <div className="flex gap-1 mb-1">
        <select value={form.who} onChange={(e) => setForm({ ...form, who: e.target.value })} className="w-1/2 text-xs border rounded px-1 py-1 bg-white" style={{ borderColor: "#E2E0DA" }}>
          <option value="">Who?</option>
          {owners.map((o) => (<option key={o} value={o}>{initials(o)} — {o}</option>))}
        </select>
        <input type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} className="w-1/2 text-xs border rounded px-1 py-1" style={{ borderColor: "#E2E0DA" }} />
      </div>
      <div className="flex gap-1">
        <select value={form.cat} onChange={(e) => setForm({ ...form, cat: e.target.value })} className="flex-1 text-xs border rounded px-1 py-1 bg-white" style={{ borderColor: "#E2E0DA" }}>
          {TASK_CATS.map((c) => (<option key={c}>{c}</option>))}
        </select>
        <button onClick={onSubmit} className="text-xs font-bold rounded px-2" style={{ background: "#E8600A", color: "#fff" }}>Add</button>
        <button onClick={onCancel} className="text-xs rounded px-1" style={{ color: "#8A94A0" }}>✕</button>
      </div>
    </div>
  );
}

function TaskModal({ task, onClose, onToggle, reload }: { task: Task; onClose: () => void; onToggle: () => void; reload: () => Promise<Board | null> }) {
  const [comments, setComments] = useState<{ by: string; at: string; body: string }[]>([]);
  const [cmt, setCmt] = useState("");
  useEffect(() => {
    api.get(`/api/comments?task_id=${task.id}&task_kind=${task.kind}`).then((r) => setComments(r.comments)).catch(() => {});
  }, [task]);
  const add = async () => {
    if (!cmt.trim()) return;
    await api.post("/api/comments", { task_id: task.id, task_kind: task.kind, body: cmt.trim() });
    setCmt("");
    const r = await api.get(`/api/comments?task_id=${task.id}&task_kind=${task.kind}`);
    setComments(r.comments);
    await reload();
  };
  return (
    <div onClick={onClose} className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)", zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg p-4 w-full max-w-md" style={{ maxHeight: "80vh", overflow: "auto" }}>
        <div className="flex items-start justify-between gap-2">
          <div className="font-bold text-sm">{task.t}</div>
          <button onClick={onClose} style={{ color: "#8A94A0" }}>✕</button>
        </div>
        {task.d && <div className="text-xs mt-2" style={{ color: "#5A6672" }}>{task.d}</div>}
        <div className="flex items-center gap-2 mt-2 text-xs" style={{ color: "#8A94A0" }}>
          <span>{initials(task.who)}</span><span>{task.cat}</span><span className="tnum">{fmt(task.due)}</span>
          <button onClick={onToggle} className="ml-auto rounded px-2 py-1 font-bold" style={{ background: task.done ? "#E7E4DC" : "#0D7A3F", color: task.done ? "#5A6672" : "#fff" }}>{task.done ? "Reopen" : "✓ Done"}</button>
        </div>
        <div className="mt-3 border-t pt-2" style={{ borderColor: "#EEECE6" }}>
          <div className="text-xs font-bold mb-1" style={{ color: "#5A6672" }}>Comments</div>
          {comments.map((c, i) => (
            <div key={i} className="text-xs mb-1"><span className="font-bold">{c.by}</span> <span style={{ color: "#8A94A0" }}>{new Date(c.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span><div>{c.body}</div></div>
          ))}
          <div className="flex gap-1 mt-2">
            <input value={cmt} onChange={(e) => setCmt(e.target.value)} placeholder="Add a comment…" className="flex-1 text-xs border rounded px-2 py-1" style={{ borderColor: "#E2E0DA" }} />
            <button onClick={add} className="text-xs font-bold rounded px-2" style={{ background: "#E8600A", color: "#fff" }}>Post</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================ Update to ERP ============================
function UpdateToErp({ erpLog }: { erpLog: ErpLogEntry[] }) {
  return (
    <div className="p-4">
      <div className="mb-3 text-sm font-semibold" style={{ color: "#5A6672" }}>
        Change log — app-local notes of intent. Apply each in ERP by hand via its link; tomorrow&apos;s upload is the confirmation.
      </div>
      {erpLog.length === 0 ? (
        <div className="text-sm" style={{ color: "#8A94A0" }}>No changes logged this session.</div>
      ) : (
        <div className="bg-white rounded-lg border overflow-x-auto" style={{ borderColor: "#E2E0DA" }}>
          <table className="text-xs w-full" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#F4F2EC", color: "#5A6672" }}>
                <th className="px-2 py-1 text-left">Time</th><th className="px-2 py-1 text-left">Doc</th><th className="px-2 py-1 text-left">Field</th><th className="px-2 py-1 text-left">Value</th><th className="px-2 py-1">ERP</th>
              </tr>
            </thead>
            <tbody>
              {erpLog.map((l) => (
                <tr key={l.id} style={{ borderTop: "1px solid #EEECE6" }}>
                  <td className="px-2 py-1" style={{ color: "#8A94A0" }}>{l.time}</td>
                  <td className="px-2 py-1 font-semibold">{l.docname}</td>
                  <td className="px-2 py-1">{l.field}</td>
                  <td className="px-2 py-1">{l.value}</td>
                  <td className="px-2 py-1 text-center">{l.link && <a href={l.link} target="_blank" rel="noreferrer" style={{ color: "#1B3A5C" }}>↗ open</a>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================ Admin ============================
function Admin({ board, reload }: { board: Board; reload: () => Promise<Board | null> }) {
  const [users, setUsers] = useState<{ id: string; email: string; role: string; disabled: boolean }[]>([]);
  const [uForm, setUForm] = useState({ email: "", pw: "", role: "planner" });
  const [fam, setFam] = useState<string>(Object.keys(board.templates)[0] || "Default");
  const loadUsers = () => api.get("/api/admin/users").then((r) => setUsers(r.users)).catch(() => {});
  useEffect(() => { loadUsers(); }, []);

  const createUser = async () => {
    if (!uForm.email || !uForm.pw) return;
    try {
      await api.post("/api/admin/users", { action: "create", email: uForm.email, password: uForm.pw, role: uForm.role });
      setUForm({ email: "", pw: "", role: "planner" });
      await loadUsers();
    } catch (e) { alert(e instanceof Error ? e.message : String(e)); }
  };
  const setRole = async (id: string, role: string) => { await api.post("/api/admin/users", { action: "role", id, role }); await loadUsers(); };
  const setDisabled = async (id: string, disabled: boolean) => { await api.post("/api/admin/users", { action: "disable", id, disabled }); await loadUsers(); };

  const famTemplate = board.templates[fam] || [];

  return (
    <div className="p-4 grid gap-4 md:grid-cols-2">
      <div className="bg-white rounded-lg border p-3" style={{ borderColor: "#E2E0DA" }}>
        <div className="font-bold text-sm mb-2">User management</div>
        <div className="flex gap-1 mb-2 flex-wrap">
          <input placeholder="email" value={uForm.email} onChange={(e) => setUForm({ ...uForm, email: e.target.value })} className="text-xs border rounded px-2 py-1 flex-1" style={{ borderColor: "#E2E0DA" }} />
          <input placeholder="password" value={uForm.pw} onChange={(e) => setUForm({ ...uForm, pw: e.target.value })} className="text-xs border rounded px-2 py-1" style={{ borderColor: "#E2E0DA" }} />
          <select value={uForm.role} onChange={(e) => setUForm({ ...uForm, role: e.target.value })} className="text-xs border rounded px-1 py-1 bg-white" style={{ borderColor: "#E2E0DA" }}>
            <option value="admin">admin</option><option value="planner">planner</option><option value="uploader">uploader</option>
          </select>
          <button onClick={createUser} className="text-xs font-bold rounded px-2" style={{ background: "#E8600A", color: "#fff" }}>Add</button>
        </div>
        <table className="text-xs w-full">
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ borderTop: "1px solid #EEECE6" }}>
                <td className="py-1">{u.email}</td>
                <td className="py-1">
                  <select value={u.role} onChange={(e) => setRole(u.id, e.target.value)} className="text-xs border rounded px-1 bg-white" style={{ borderColor: "#E2E0DA" }}>
                    <option value="admin">admin</option><option value="planner">planner</option><option value="uploader">uploader</option>
                  </select>
                </td>
                <td className="py-1 text-right">
                  <button onClick={() => setDisabled(u.id, !u.disabled)} className="rounded px-2 py-0.5 font-semibold" style={{ background: u.disabled ? "#B3261E" : "#E7E4DC", color: u.disabled ? "#fff" : "#5A6672" }}>{u.disabled ? "disabled" : "active"}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-lg border p-3" style={{ borderColor: "#E2E0DA" }}>
        <div className="font-bold text-sm mb-2">Family milestone templates</div>
        <select value={fam} onChange={(e) => setFam(e.target.value)} className="text-xs border rounded px-2 py-1 bg-white mb-2" style={{ borderColor: "#E2E0DA" }}>
          {Object.keys(board.templates).map((f) => (<option key={f}>{f}</option>))}
        </select>
        <ol className="text-xs list-decimal ml-4">
          {(famTemplate as any[]).map((m, i) => (<li key={i} className="py-0.5">{m.name} · {m.days}d</li>))}
        </ol>
        <div className="text-xs mt-2" style={{ color: "#8A94A0" }}>Templates seed a job&apos;s default plan. Edit via POST /api/templates (admin).</div>
      </div>
    </div>
  );
}
