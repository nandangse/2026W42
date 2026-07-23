"use client";
import { useEffect, useMemo, useRef, useState } from "react";
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
  TASK_CATS,
  type Plan,
  type PlanMilestone,
} from "@/lib/schedule";

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

      {tab === "delivery" && <DeliveryBoard board={board} V={V} onOpen={(id) => { setActiveId(id); setTab("plan"); }} reload={reload} isRaghu={isRaghu} pushERP={pushERP} />}
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
  isRaghu,
  pushERP,
}: {
  board: Board;
  V: (v: number) => string;
  onOpen: (id: string) => void;
  reload: () => Promise<Board | null>;
  isRaghu: boolean;
  pushERP: (dt: string, id: string, f: string, v: string) => void;
}) {
  // priority order: stored order first, then remaining jobs by TDD (appended at read time)
  const order = useMemo(() => {
    const byId = new Map(board.jobs.map((j) => [j.id, j]));
    const seen = new Set<string>();
    const out: Job[] = [];
    for (const id of board.priority || []) {
      const j = byId.get(id);
      if (j) { out.push(j); seen.add(id); }
    }
    board.jobs
      .filter((j) => !seen.has(j.id))
      .sort((a, b) => ((a.tdd || "9999") < (b.tdd || "9999") ? -1 : 1))
      .forEach((j) => out.push(j));
    return out;
  }, [board]);

  const [drag, setDrag] = useState<number | null>(null);
  const move = async (from: number, to: number) => {
    if (from === to) return;
    const ids = order.map((j) => j.id);
    const [m] = ids.splice(from, 1);
    ids.splice(to, 0, m);
    await api.post("/api/priority", { order: ids });
    await reload();
  };

  const editField = async (job: Job, field: "tdd" | "stat" | "mgmt", value: string) => {
    try {
      await api.post("/api/job-field", { job_id: job.id, field, value });
      pushERP("Jobmaster", job.id, field, field === "stat" ? value : fmtFull(value));
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="p-4">
      <div className="mb-3 text-sm font-semibold" style={{ color: "#5A6672" }}>
        Priority order — drag to reorder. New jobs append by target delivery date.
      </div>
      <div className="space-y-2">
        {order.map((j, i) => {
          const delay = otdDelay(j);
          return (
            <div
              key={j.id}
              draggable
              onDragStart={() => setDrag(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (drag != null) move(drag, i); setDrag(null); }}
              className="bg-white rounded-lg p-3 border flex flex-wrap items-center gap-3"
              style={{ borderColor: "#E2E0DA", borderLeft: "5px solid #E8600A" }}
            >
              <span className="text-lg font-bold tnum" style={{ color: "#8A94A0", width: 28 }}>{i + 1}</span>
              <button onClick={() => onOpen(j.id)} className="font-bold underline decoration-dotted" style={{ color: "#1B3A5C" }}>
                JOB {jobNo(j.id)}
              </button>
              <a href={erpJobLink(j.id)} target="_blank" rel="noreferrer" className="text-xs" style={{ color: "#8A94A0" }} title="Open in ERP">↗</a>
              <div className="flex-1 min-w-[160px]">
                <div className="text-sm font-semibold" style={{ color: "#16232F" }}>{j.tag}</div>
                <div className="text-xs" style={{ color: "#8A94A0" }}>{j.cust} · {j.fam} · {V(j.val)}</div>
              </div>
              <select
                value={j.stat}
                onChange={(e) => editField(j, "stat", e.target.value)}
                className="text-xs border rounded px-1 py-1 bg-white max-w-[190px]"
                style={{ borderColor: "#E2E0DA" }}
                title="Job status (note of intent — applied in ERP by hand)"
              >
                <option value={j.stat}>{j.stat || "—"}</option>
              </select>
              <Chip label="TDD (ERP)" value={fmtFull(j.tdd)} color="#B3261E" />
              <Chip label="OTD (ERP)" value={fmtFull(j.otd) + (delay ? ` · +${delay}d` : "")} color={otdColor(j.otd)} />
              <div className="rounded px-2 py-1" style={{ background: isRaghu ? "#F3EEFB" : "#F4F2EC" }} title={isRaghu ? "Editable — you are raghu" : "Editable only by raghu@nandan.co.in"}>
                <div className="text-xs" style={{ color: "#8A94A0" }}>MGMT {isRaghu ? "✎" : "🔒"}</div>
                {isRaghu ? (
                  <input type="date" value={j.mgmt || ""} onChange={(e) => editField(j, "mgmt", e.target.value)} className="text-sm font-bold bg-transparent" style={{ color: "#7C3AED", border: "none" }} />
                ) : (
                  <div className="text-sm font-bold" style={{ color: "#7C3AED" }}>{fmtFull(j.mgmt)}</div>
                )}
              </div>
              <Chip label="PROD %" value={j.pct + "%"} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================ Load board ============================
function LoadBoard({ board, byTDD }: { board: Board; byTDD: Job[] }) {
  const [bucket, setBucket] = useState<"weekly" | "daily">("weekly");
  const data = useMemo(() => {
    // build a plan per job (saved plan or default template) and sum crew per day
    const perJob = byTDD.map((j) => {
      const saved = board.plans[j.id];
      const pl: Plan = saved
        ? { start: saved.start || (j.start && j.start >= TODAY ? j.start : TODAY), milestones: saved.milestones }
        : { start: j.start && j.start >= TODAY ? j.start : TODAY, milestones: templateFor(j.fam).map((m) => ({ name: m.name, days: m.days, preds: m.pred ? [m.pred] : [], crew: { ...m.crew }, shift: "D", offset: m.offset })) };
      return { job: j, sched: computeSchedule(pl) };
    });
    let min: string | null = null, max: string | null = null;
    perJob.forEach(({ sched }) => sched.forEach((m) => { if (!min || m.start < min) min = m.start; if (!max || m.end > max) max = m.end; }));
    if (!min || !max) return null;
    const totalDays = diffDays(min, max) + 1;
    const dayLoad = perJob.map(({ sched }) => {
      const byTrade: Record<string, number[]> = {};
      TRADES.forEach((t) => (byTrade[t.key] = new Array(totalDays).fill(0)));
      sched.forEach((m) => {
        const a = diffDays(min!, m.start), b = diffDays(min!, m.end);
        TRADES.forEach((t) => { const n = m.crew[t.key] || 0; if (!n) return; for (let d = a; d <= b; d++) byTrade[t.key][d] += n; });
      });
      return byTrade;
    });
    const buckets: { a: number; b: number; label: string; today: boolean }[] = [];
    const hasToday = (a: number, b: number) => addDays(min!, a) <= TODAY && TODAY <= addDays(min!, b);
    if (bucket === "weekly") {
      for (let d = 0; d < totalDays; d += 7) {
        const e = Math.min(d + 6, totalDays - 1);
        buckets.push({ a: d, b: e, label: "W" + isoWeek(addDays(min!, d)), today: hasToday(d, e) });
      }
    } else {
      for (let d = 0; d < totalDays; d++) buckets.push({ a: d, b: d, label: fmt(addDays(min!, d)), today: addDays(min!, d) === TODAY });
    }
    const cellVal = (arr: number[], a: number, b: number) => { let s = 0; for (let d = a; d <= b; d++) s += arr[d]; return s; };
    const rows = perJob.map((pj, ji) => ({
      job: pj.job,
      trades: TRADES.map((t) => ({ trade: t, cells: buckets.map(({ a, b }) => cellVal(dayLoad[ji][t.key], a, b)) })),
    }));
    const shopTrades = TRADES.map((t, ti) => ({ trade: t, cells: buckets.map((_, bi) => rows.reduce((s, r) => s + r.trades[ti].cells[bi], 0)) }));
    const peak = Math.max(1, ...shopTrades.flatMap((tr) => tr.cells));
    return { buckets, shopTrades, peak };
  }, [board, byTDD, bucket]);

  const heat = (v: number, peak: number) => {
    if (!v) return { background: "#FFFFFF", color: "#D5D2C9" };
    const r = Math.min(1, v / peak);
    if (r > 0.85) return { background: "#B3261E", color: "#fff" };
    if (r > 0.65) return { background: "#E8600A", color: "#fff" };
    if (r > 0.4) return { background: "#F5B32B", color: "#3B2A00" };
    return { background: "#DCE8F5", color: "#1B3A5C" };
  };

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-bold">Shop-wide trade load</span>
        <div className="flex gap-1 rounded p-1" style={{ background: "#E7E4DC" }}>
          {(["weekly", "daily"] as const).map((b) => (
            <button key={b} onClick={() => setBucket(b)} className="px-2 py-1 rounded text-xs font-semibold" style={tab2(bucket === b)}>{b}</button>
          ))}
        </div>
      </div>
      {!data ? (
        <div className="text-sm" style={{ color: "#8A94A0" }}>No milestone plans yet — open jobs in Job Plan to populate the load.</div>
      ) : (
        <div className="overflow-x-auto bg-white rounded-lg border" style={{ borderColor: "#E2E0DA" }}>
          <table className="text-xs tnum" style={{ borderCollapse: "collapse", minWidth: 640 }}>
            <thead>
              <tr>
                <th className="text-left px-2 py-1 sticky left-0 bg-white" style={{ minWidth: 90 }}>Trade</th>
                {data.buckets.map((b, i) => (
                  <th key={i} className="px-2 py-1 text-center" style={{ background: b.today ? "#FFF7E6" : undefined, color: "#5A6672" }} data-today={b.today ? "1" : undefined}>{b.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.shopTrades.map((tr) => (
                <tr key={tr.trade.key}>
                  <td className="px-2 py-1 font-bold sticky left-0 bg-white" style={{ color: tr.trade.color }}>{tr.trade.short}</td>
                  {tr.cells.map((v, i) => (
                    <td key={i} className="px-2 py-1 text-center font-semibold" style={heat(v, data.peak)}>{v || ""}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
function tab2(active: boolean) {
  return active ? { background: "#E8600A", color: "#fff" } : { color: "#5A6672" };
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
