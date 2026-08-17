"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { LOGO } from "@/lib/logo";
import { APP_VERSION, UPDATES } from "@/lib/changelog";
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
  manDays,
  isoWeek,
  otdColor,
  otdDelay,
  dueStyle,
  parseISO,
  toISO,
  TASK_CATS,
  ESC_LEVELS,
  type Plan,
  type PlanMilestone,
} from "@/lib/schedule";
import QuoteOfDay from "./QuoteOfDay";
import GoalsBoard from "./GoalsBoard";
import MorningUpload from "./MorningUpload";
import SalesGenie from "./SalesGenie";

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

type Role = "admin" | "planner" | "project_owner" | "user" | "viewer" | "sales";
const TODAY = today();

interface Person {
  id: string;
  email: string;
  role: string;
  initials: string | null;
  name: string | null;
  erpOwner: string | null;
}

/** Label for a person: "RK · Ravi Kumar" style, falling back sensibly. */
const personLabel = (p: Person) =>
  `${p.initials ? p.initials + " · " : ""}${p.name || p.email.split("@")[0]}`;

/** Every string a task's `who` might hold for this person. */
function myHandles(me: { initials: string | null; displayName: string | null; erpOwner: string | null; email: string }) {
  return new Set(
    [me.initials, me.displayName, me.erpOwner, me.email, me.email.split("@")[0]]
      .filter(Boolean)
      .map((s) => String(s).toLowerCase()),
  );
}

/**
 * People a task can be assigned to: EVERY account that exists, whatever its
 * role — never raw Jobmaster text. (Job ownership is separate and restricted to
 * Project Owners.) Initials are the stored value; accounts without initials yet
 * fall back to their email handle so a new user is still assignable.
 */
const ROLE_GROUP: Record<string, string> = {
  user: "Users",
  project_owner: "Project Owners",
  planner: "Planners",
  admin: "Admins",
  sales: "Sales team",
  viewer: "Viewers",
  uploader: "Uploaders",
};
const GROUP_ORDER = ["Users", "Project Owners", "Planners", "Admins", "Sales team", "Viewers", "Uploaders"];

function assignees(board: Board): { value: string; label: string; group: string }[] {
  return (board.assignableUsers || [])
    .map((p) => {
      const handle = p.initials || p.email.split("@")[0];
      const name = p.name || p.email.split("@")[0];
      return {
        value: handle,
        label: p.initials ? `${p.initials} · ${name}` : `${name} (no initials)`,
        group: ROLE_GROUP[p.role] || "Others",
        _sort: (p.initials || name).toLowerCase(),
      };
    })
    .sort(
      (a, b) =>
        GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) ||
        (a._sort < b._sort ? -1 : 1),
    )
    .map(({ _sort, ...rest }) => rest);
}

/** Date+time stamp for "last updated". */
const stamp = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", {
        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
      })
    : "—";

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
  updated_at: string | null;
  ownerInitials: string | null;
  ownerName: string | null;
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
  people: Person[];
  projectOwners: Person[];
  assignableUsers: Person[];
  unlinkedOwners: string[];
  lastUpdated: string | null;
  batches: Record<string, { uploaded_at: string; filename: string } | undefined>;
  aggregates: { kittingPct: number; materialValueSum: number; kittedValueSum: number; activeJobCount: number };
}

interface AdminUser {
  id: string;
  email: string;
  role: string;
  disabled: boolean;
  initials: string | null;
  display_name: string | null;
  erp_owner: string | null;
  sales_access: boolean;
  sales_implicit: boolean; // the owner — always yes, not toggleable
}

const ROLE_OPTIONS: { value: string; label: string; hint: string }[] = [
  { value: "admin", label: "Admin", hint: "Everything, plus the Admin page" },
  { value: "planner", label: "Planner", hint: "All boards and editing" },
  { value: "project_owner", label: "Project Owner", hint: "Owns jobs — the boards filter by these people" },
  { value: "user", label: "User", hint: "Works tasks assigned to them" },
  { value: "sales", label: "Sales team", hint: "Sales Genie by default, plus the boards" },
  { value: "viewer", label: "Viewer", hint: "Read-only" },
  { value: "uploader", label: "Uploader", hint: "Morning Update page only" },
];

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

/** The single account above the admin tier. Mirrors RAGHU_EMAIL on the server. */
const OWNER_EMAIL = "raghu@nandan.co.in";

// Default milestone plan for a product family: admin-saved DB templates first
// (exact name, then partial match), then the "Default" template, then the
// built-in V1.9 fallback. This is what makes admin-added products work.
function templateMilestones(fam: string, templates: Record<string, any>): PlanMilestone[] {
  const keys = Object.keys(templates || {});
  const f = (fam || "").toLowerCase();
  const hit =
    keys.find((k) => k.toLowerCase() === f) ||
    keys.find(
      (k) =>
        k !== "Default" &&
        (f.includes(k.toLowerCase()) || k.toLowerCase().includes(f)) &&
        f !== "",
    );
  const src = hit ? templates[hit] : templates["Default"];
  if (Array.isArray(src) && src.length) {
    return src.map((m: any, i: number) => ({
      name: String(m.name || `Milestone ${i + 1}`),
      days: Math.max(1, Number(m.days) || 1),
      preds: Array.isArray(m.preds)
        ? m.preds.filter((p: number) => p > 0 && p <= i)
        : m.pred
          ? [m.pred]
          : [],
      crew: { ...zeroCrew(), ...(m.crew || {}) },
      shift: m.shift || "D",
      offset: Number(m.offset) || 0,
    }));
  }
  return templateFor(fam).map((m) => ({
    name: m.name,
    days: m.days,
    preds: m.pred ? [m.pred] : [],
    crew: { ...m.crew },
    shift: "D",
    offset: m.offset,
  }));
}

export default function PlanningSuite({
  email,
  role,
  initials,
  displayName,
  erpOwner,
  isRaghu,
}: {
  email: string;
  role: Role;
  initials: string | null;
  displayName: string | null;
  erpOwner: string | null;
  isRaghu: boolean;
}) {
  const router = useRouter();
  const isAdmin = role === "admin";
  const canEdit = role === "admin" || role === "planner" || role === "project_owner";
  const me = useMemo(
    () => ({ email, initials, displayName, erpOwner, role }),
    [email, initials, displayName, erpOwner, role],
  );
  const [board, setBoard] = useState<Board | null>(null);
  const [err, setErr] = useState("");

  // Three top-level workspaces (per-access, see below), each with its own
  // sticky sub-nav. "tab" is only meaningful inside the Planning Suite
  // workspace now — Goals and Tasking are whole workspaces, not sub-tabs.
  // Sales-team members live in Sales Genie — land them there directly.
  const [workspace, setWorkspace] = useState<"suite" | "goals" | "tasking" | "sales">(
    role === "sales" ? "sales" : "suite",
  );
  // land on "My Week" within the suite, not the delivery board
  const [tab, setTab] = useState<"home" | "delivery" | "load" | "plan" | "erp" | "upload" | "admin">("home");

  // ---- browser back/forward navigates within the app, not out of it ----
  // Every workspace/tab change pushes a history entry; popstate restores it.
  // Without this the whole app is one history entry and Back exits to the
  // login redirect — the complaint that prompted this.
  const popNav = useRef(false);   // true while applying a popstate, so we don't re-push it
  const navMounted = useRef(false); // skip the push on first render (replaceState seeds it)
  useEffect(() => {
    window.history.replaceState({ genie: true, workspace, tab }, "");
    const onPop = (e: PopStateEvent) => {
      if (e.state?.genie) {
        popNav.current = true;
        setWorkspace(e.state.workspace);
        setTab(e.state.tab ?? "home");
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!navMounted.current) { navMounted.current = true; return; }
    if (popNav.current) { popNav.current = false; return; }
    window.history.pushState({ genie: true, workspace, tab }, "");
  }, [workspace, tab]);
  const [showVal, setShowVal] = useState(true);
  // account menu behind the initials avatar — Profile / Change password / Logout
  const [userOpen, setUserOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [erpLog, setErpLog] = useState<ErpLogEntry[]>([]);
  const [quoteTrigger, setQuoteTrigger] = useState(0);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Goals is gated by an explicit grant (spec §9), not by role — fetch just
  // enough to decide whether its tab appears. null while loading so the tab
  // doesn't flash in and out; the heavier /api/goals call happens only once
  // that workspace is actually opened.
  const [goalsAccess, setGoalsAccess] = useState<boolean | null>(null);
  useEffect(() => {
    api.get("/api/goals/access").then((r) => setGoalsAccess(!!r.see)).catch(() => setGoalsAccess(false));
  }, []);
  // once the Goals workspace has been opened, keep its component alive
  const [goalsVisited, setGoalsVisited] = useState(false);
  useEffect(() => {
    if (workspace === "goals") setGoalsVisited(true);
  }, [workspace]);

  // Sales Genie is granted per person (default nobody) — the tab only renders
  // once the check says yes. Same lazy keep-alive pattern as Goals so the
  // iframe isn't reloaded on every workspace switch.
  const [salesAccess, setSalesAccess] = useState(false);
  useEffect(() => {
    api.get("/api/sales/access").then((r) => setSalesAccess(!!r.see)).catch(() => setSalesAccess(false));
  }, []);
  const [salesVisited, setSalesVisited] = useState(false);
  useEffect(() => {
    if (workspace === "sales") setSalesVisited(true);
  }, [workspace]);

  // App identity — name + theme line under the logo, admin-editable so a new
  // theme doesn't need a deploy. Defaults match the migration's, so the
  // header never flashes empty while this loads.
  const [appSettings, setAppSettings] = useState({ app_name: "Genie", theme_name: "Nandan Breakthrough 2026-27" });
  const loadAppSettings = useCallback(() => {
    api.get("/api/app-settings").then((r) => setAppSettings({ app_name: r.app_name, theme_name: r.theme_name })).catch(() => {});
  }, []);
  useEffect(() => { loadAppSettings(); }, [loadAppSettings]);

  // ---- notification bell: new assignments land here, polled once a minute ----
  interface Notif { id: string; kind: string; title: string; body: string; created_by: string | null; read_at: string | null; created_at: string }
  const [notifs, setNotifs] = useState<{ installed: boolean; items: Notif[]; unread: number } | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const loadNotifs = useCallback(() => {
    api.get("/api/notifications").then(setNotifs).catch(() => {});
  }, []);
  useEffect(() => {
    loadNotifs();
    const t = setInterval(loadNotifs, 60_000);
    return () => clearInterval(t);
  }, [loadNotifs]);
  const markAllRead = async () => {
    try { await api.post("/api/notifications", { action: "read_all" }); loadNotifs(); } catch { /* bell is best-effort */ }
  };
  const markRead = async (id: string) => {
    try { await api.post("/api/notifications", { action: "read", ids: [id] }); loadNotifs(); } catch { /* ditto */ }
  };

  // Opening a job's plan can be triggered from Tasking or Goals, both of which
  // are now separate workspaces from Job Plan — so jumping there must also
  // switch back to the Planning Suite workspace, not just change the sub-tab.
  const openJobPlan = (id: string) => {
    setActiveId(id);
    setWorkspace("suite");
    setTab("plan");
  };

  // Admin users live here, not inside <Admin>, so switching tabs doesn't unmount
  // the list and refetch it — that empty-then-populate cycle was the flicker.
  // null = never loaded yet (show a skeleton); [] = loaded and genuinely empty.
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const loadUsers = useCallback(async () => {
    try {
      const r = await api.get("/api/admin/users");
      setUsers(r.users || []);
    } catch {
      setUsers([]);
    }
  }, []);
  // prefetch for admins so the tab is already populated when first opened
  useEffect(() => {
    if (isAdmin) loadUsers();
  }, [isAdmin, loadUsers]);

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
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: "#16232F" }}>
        <div className="rounded bg-white px-3 py-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO} alt="Nandan GSE" style={{ height: 40 }} />
        </div>
        {err ? (
          <>
            <div className="text-sm font-bold" style={{ color: "#B3261E" }}>{err}</div>
            <button onClick={() => reload()} className="text-xs font-bold rounded px-3 py-1.5" style={{ background: "#E8600A", color: "#fff" }}>↻ Retry</button>
          </>
        ) : (
          <>
            <div className="animate-spin rounded-full" style={{ width: 36, height: 36, border: "3px solid #22303C", borderTopColor: "#E8600A" }} />
            <div className="text-sm font-semibold" style={{ color: "#F5B32B" }}>Loading the works planning boards…</div>
          </>
        )}
      </div>
    );
  }

  const queued = erpLog.length;
  const loadedCount = ["jobs", "projects", "tasks"].filter((k) => {
    const b = board.batches[k] || board.batches["pre"];
    return b && b.uploaded_at.slice(0, 10) === TODAY;
  }).length;

  // The three workspaces. Goals only appears once its access check resolves
  // true — never shown while loading or when access is absent, matching the
  // spec's "granted, not default" rule.
  const WORKSPACE_DEFS: [typeof workspace, string][] = [
    ["suite", "🧭 Planning Suite"],
    ...(goalsAccess ? ([["goals", "🎯 Goals"]] as [typeof workspace, string][]) : []),
    ["tasking", "📋 Nandan Tasking"],
    ...(salesAccess ? ([["sales", "💼 Sales Genie"]] as [typeof workspace, string][]) : []),
  ];
  // Sub-nav inside the Planning Suite workspace only.
  const SUITE_TAB_DEFS: [typeof tab, string][] = [
    ["home", "🏠 My Week"],
    ["delivery", "Job Delivery Board"],
    ["load", "Load Board"],
    ["plan", "Job Plan"],
    ["erp", `Update to ERP${queued ? " (" + queued + ")" : ""}`],
    // admins get the uploader's page too, so they can load the morning files
    ...(isAdmin ? ([["upload", "🌅 Morning Update"], ["admin", "Admin ⚙"]] as [typeof tab, string][]) : []),
  ];

  return (
    <div className="min-h-screen" style={{ background: "#F1EFE9", color: "#22303C" }}>
      {/* ===== frozen header ===== */}
      <div
        className="px-4 py-2.5"
        style={{ background: "#16232F", position: "sticky", top: 0, zIndex: 45 }}
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="rounded bg-white px-2 py-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={LOGO} alt="Nandan GSE" style={{ height: 34 }} />
            </div>
            <div>
              <div className="text-xs tracking-widest font-bold" style={{ color: "#E8600A" }}>
                {appSettings.app_name.toUpperCase()}
                <span style={{ background: "#E8600A", color: "#fff", borderRadius: 3, padding: "1px 5px", marginLeft: 6 }} title="See Admin → Updates for what changed">
                  V {APP_VERSION}
                </span>
              </div>
              <h1 className="text-lg font-bold text-white leading-tight">
                {appSettings.theme_name}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={(e) => onFile(e.target.files?.[0] || null)} />
            {isAdmin && (
              <button onClick={() => fileRef.current?.click()} className="text-xs rounded px-3 py-1.5 font-bold" style={{ background: "#E8600A", color: "#fff" }}>
                ⬆ Upload Excel
              </button>
            )}
            {role === "viewer" && (
              <span className="text-xs rounded px-2 py-1.5 font-bold" style={{ background: "#0D161F", color: "#8FA1B3", border: "1px solid #22303C" }} title="Your account is read-only">
                👁 Read-only
              </span>
            )}
            <span className="text-xs rounded px-2 py-1.5 font-bold" style={{ background: "#0D161F", color: loadedCount === 3 ? "#7BC67E" : "#8FA1B3", border: "1px solid #22303C" }}>
              🌅 Morning update {loadedCount}/3
            </span>
            {/* bell renders only once the notifications table exists */}
            {notifs?.installed && (
              <span className="relative">
                <button
                  onClick={() => setNotifOpen((o) => !o)}
                  className="text-xs rounded px-2 py-1.5 font-bold"
                  style={{ background: "#0D161F", color: notifs.unread ? "#F5B32B" : "#8FA1B3", border: "1px solid #22303C" }}
                  title="Notifications"
                >
                  🔔{notifs.unread > 0 && (
                    <span className="ml-1 rounded-full px-1.5 font-bold tnum" style={{ background: "#B3261E", color: "#fff", fontSize: 10 }}>
                      {notifs.unread}
                    </span>
                  )}
                </button>
                {notifOpen && (
                  <>
                    <div className="fixed inset-0" style={{ zIndex: 58 }} onClick={() => setNotifOpen(false)} />
                    <div className="absolute rounded-lg border bg-white" style={{ top: "calc(100% + 6px)", right: 0, width: 330, maxHeight: 420, overflowY: "auto", borderColor: "#E2E0DA", boxShadow: "0 12px 30px rgba(0,0,0,.25)", zIndex: 59 }}>
                      <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: "1px solid #EEECE6" }}>
                        <span className="text-xs font-bold" style={{ color: "#16232F" }}>Notifications</span>
                        {notifs.unread > 0 && (
                          <button onClick={markAllRead} className="text-xs font-bold" style={{ color: "#E8600A" }}>Mark all read</button>
                        )}
                      </div>
                      {notifs.items.length === 0 && (
                        <div className="text-xs text-center py-6" style={{ color: "#8A94A0" }}>Nothing yet — you&apos;ll hear when a task is assigned to you.</div>
                      )}
                      {notifs.items.map((n) => (
                        <div
                          key={n.id}
                          onClick={() => { if (!n.read_at) markRead(n.id); }}
                          className="px-3 py-2 cursor-pointer"
                          style={{ borderBottom: "1px solid #F4F2EC", background: n.read_at ? "#fff" : "#FFF7E6" }}
                          title={n.read_at ? undefined : "Click to mark read"}
                        >
                          <div className="flex items-start gap-2">
                            {!n.read_at && <span className="rounded-full flex-shrink-0" style={{ width: 7, height: 7, background: "#E8600A", marginTop: 5 }} />}
                            <div className="min-w-0">
                              <div className="text-xs font-bold" style={{ color: "#16232F" }}>{n.title}</div>
                              {n.body && <div className="text-xs truncate" style={{ color: "#5A6672" }}>{n.body}</div>}
                              <div className="tnum" style={{ fontSize: 10, color: "#8A94A0" }}>{stamp(n.created_at)}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </span>
            )}
            <button
              onClick={() => setQuoteTrigger((n) => n + 1)}
              className="text-xs rounded px-2 py-1.5 font-bold"
              style={{ background: "#0D161F", color: "#F5B32B", border: "1px solid #22303C" }}
              title="Show today's quote"
            >
              ☀ Quote
            </button>
            <select
              value={showVal ? "with" : "without"}
              onChange={(e) => setShowVal(e.target.value === "with")}
              className="text-xs rounded px-2 py-1.5 font-semibold"
              style={{ background: "#0D161F", color: "#F5B32B", border: "1px solid #22303C" }}
            >
              <option value="with">With value ₹</option>
              <option value="without">Without value</option>
            </select>
            {/* account: initials only, everything else behind the dropdown */}
            <span className="relative">
              <button
                onClick={() => setUserOpen((o) => !o)}
                className="flex items-center gap-1 rounded px-1.5 py-1"
                style={{ background: "#0D161F", border: "1px solid #22303C" }}
                title={`${displayName || email} · ${role.replace("_", " ")}`}
                aria-haspopup="menu"
                aria-expanded={userOpen}
              >
                <span
                  className="rounded-full font-bold flex items-center justify-center"
                  style={{
                    width: 26,
                    height: 26,
                    fontSize: 11,
                    letterSpacing: 0.3,
                    background: initials ? "#E8600A" : "#B3261E",
                    color: "#fff",
                  }}
                >
                  {initials || "??"}
                </span>
                <span style={{ color: "#8FA1B3", fontSize: 9 }}>▼</span>
              </button>
              {userOpen && (
                <>
                  <div className="fixed inset-0" style={{ zIndex: 58 }} onClick={() => setUserOpen(false)} />
                  <div
                    className="absolute rounded-lg border bg-white"
                    style={{ top: "calc(100% + 6px)", right: 0, width: 232, borderColor: "#E2E0DA", boxShadow: "0 12px 30px rgba(0,0,0,.25)", zIndex: 59 }}
                  >
                    <div className="px-3 py-2.5" style={{ borderBottom: "1px solid #EEECE6" }}>
                      <div className="text-sm font-bold truncate" style={{ color: "#16232F" }}>{displayName || email.split("@")[0]}</div>
                      <div className="text-xs truncate" style={{ color: "#8A94A0" }}>{email}</div>
                      <div className="text-xs mt-1 font-semibold" style={{ color: "#5A6672" }}>
                        {role.replace("_", " ")}
                        {!initials && <span style={{ color: "#B3261E" }}> · no initials set</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => { setUserOpen(false); setProfileOpen(true); }}
                      className="w-full text-left px-3 py-2 text-sm font-semibold hover:bg-gray-50"
                      style={{ color: "#16232F" }}
                    >
                      👤 Profile
                    </button>
                    <button
                      onClick={() => { setUserOpen(false); setPwOpen(true); }}
                      className="w-full text-left px-3 py-2 text-sm font-semibold hover:bg-gray-50"
                      style={{ color: "#16232F" }}
                    >
                      🔑 Change Password
                    </button>
                    <button
                      onClick={() => { setUserOpen(false); logout(); }}
                      className="w-full text-left px-3 py-2 text-sm font-bold hover:bg-gray-50"
                      style={{ color: "#E8600A", borderTop: "1px solid #EEECE6" }}
                    >
                      ⎋ Logout
                    </button>
                  </div>
                </>
              )}
            </span>
          </div>
        </div>

        {/* Workspace row always occupies its own line, at every width, so the
            header never reflows between one and two lines. On narrow screens
            it scrolls sideways rather than wrapping, keeping the header
            height fixed within a workspace. */}
        <div
          className="flex gap-1 rounded p-1 mt-2"
          style={{ background: "#0D161F", overflowX: "auto", scrollbarWidth: "thin" }}
        >
          <button
            onClick={() => { setWorkspace("suite"); setTab("home"); }}
            className="px-3 py-1.5 rounded text-sm font-semibold flex-shrink-0"
            style={{ color: "#8FA1B3" }}
            title="Home — My Week"
          >
            🏠
          </button>
          {WORKSPACE_DEFS.map(([k, l]) => (
            <button
              key={k}
              onClick={() => setWorkspace(k)}
              className="px-3 py-1.5 rounded text-sm font-semibold whitespace-nowrap flex-shrink-0"
              style={workspace === k ? { background: "#E8600A", color: "#fff" } : { color: "#8FA1B3" }}
            >
              {l}
            </button>
          ))}
        </div>

        {/* Sub-nav for the Planning Suite workspace only — Goals and Tasking
            are whole workspaces with their own internal navigation. */}
        {workspace === "suite" && (
          <div
            className="flex gap-1 rounded p-1 mt-1.5"
            style={{ background: "#0D161F", overflowX: "auto", scrollbarWidth: "thin" }}
          >
            {SUITE_TAB_DEFS.map(([k, l]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className="px-2.5 py-1 rounded text-xs font-semibold whitespace-nowrap flex-shrink-0"
                style={tab === k ? { background: "#1B3A5C", color: "#fff" } : { color: "#5C6B7A" }}
              >
                {l}
              </button>
            ))}
          </div>
        )}

        <div className="text-xs mt-1 flex gap-3 flex-wrap" style={{ color: "#3A4A5A" }}>
          <span>🔒 Restricted — visible only to authorised planning users</span>
          <span style={{ color: "#F5B32B" }}>
            Data: {board.jobs.length} active jobs · kitting {board.aggregates.kittingPct.toFixed(1)}%
          </span>
          <span style={{ color: "#8FA1B3" }} title="When the morning files were last uploaded">🕒 Files as of {stamp(board.lastUpdated)}</span>
        </div>
      </div>

      <QuoteOfDay trigger={quoteTrigger} />

      {workspace === "suite" && tab === "home" && <MyWeek board={board} me={me} V={V} onOpen={openJobPlan} reload={reload} goTasks={() => setWorkspace("tasking")} goGoals={() => setWorkspace("goals")} goalsAccess={!!goalsAccess} />}
      {/* Kept MOUNTED and merely hidden, so its filters, search, sort and view
          survive a round-trip through Job Plan — unmounting was wiping them. */}
      <div style={{ display: workspace === "suite" && tab === "delivery" ? undefined : "none" }}>
        <DeliveryBoard board={board} V={V} onOpen={openJobPlan} reload={reload} pushERP={pushERP} />
      </div>
      {workspace === "suite" && tab === "load" && <LoadBoard board={board} byTDD={byTDD} />}
      {workspace === "suite" && tab === "plan" && <JobPlan board={board} activeId={activeId} setActiveId={setActiveId} V={V} reload={reload} isRaghu={isRaghu} canEdit={canEdit} pushERP={pushERP} />}
      {workspace === "suite" && tab === "erp" && <UpdateToErp erpLog={erpLog} />}
      {workspace === "suite" && tab === "upload" && isAdmin && <MorningUpload email={email} embedded />}
      {workspace === "suite" && tab === "admin" && isAdmin && <Admin board={board} reload={reload} users={users} loadUsers={loadUsers} isOwner={isRaghu} appSettings={appSettings} loadAppSettings={loadAppSettings} />}
      {/* Mounted on first visit and then kept (hidden) — the tree is a slow
          payload (auth + 10 queries + live metrics), so re-fetching it on
          every workspace switch made Goals feel sluggish. Its own load()
          still refreshes after each edit. */}
      {goalsVisited && (
        <div style={{ display: workspace === "goals" ? undefined : "none" }}>
          <GoalsBoard canEditPlanning={canEdit} />
        </div>
      )}
      {workspace === "tasking" && <Tasking board={board} onOpen={openJobPlan} reload={reload} />}
      {/* same keep-alive pattern as Goals — the playbook iframe loads once */}
      {salesVisited && salesAccess && (
        <div style={{ display: workspace === "sales" ? undefined : "none" }}>
          <SalesGenie email={email} isAdmin={isAdmin} />
        </div>
      )}

      {profileOpen && (
        <ProfileModal me={{ email, initials, displayName, erpOwner, role }} onClose={() => setProfileOpen(false)} onChangePassword={() => { setProfileOpen(false); setPwOpen(true); }} />
      )}
      {pwOpen && <ChangePasswordModal email={email} onClose={() => setPwOpen(false)} />}
    </div>
  );
}

// ============================ account modals ============================
function ProfileRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2" style={{ borderBottom: "1px solid #F4F2EC" }}>
      <div className="text-xs font-semibold flex-shrink-0" style={{ color: "#8A94A0" }}>{label}</div>
      <div className="text-sm text-right" style={{ color: "#16232F" }}>
        <div className="font-semibold break-words">{value}</div>
        {hint && <div className="text-xs" style={{ color: "#8A94A0" }}>{hint}</div>}
      </div>
    </div>
  );
}

function ProfileModal({
  me,
  onClose,
  onChangePassword,
}: {
  me: { email: string; initials: string | null; displayName: string | null; erpOwner: string | null; role: Role };
  onClose: () => void;
  onChangePassword: () => void;
}) {
  return (
    <div onClick={onClose} className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(13,22,31,0.75)", zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg w-full" style={{ maxWidth: 400, borderTop: "5px solid #E8600A" }}>
        <div className="flex items-center gap-3 p-5 pb-4">
          <span
            className="rounded-full font-bold flex items-center justify-center flex-shrink-0"
            style={{ width: 46, height: 46, fontSize: 17, background: me.initials ? "#E8600A" : "#B3261E", color: "#fff" }}
          >
            {me.initials || "??"}
          </span>
          <div className="min-w-0">
            <div className="text-lg font-bold leading-tight truncate" style={{ color: "#16232F" }}>{me.displayName || me.email.split("@")[0]}</div>
            <div className="text-xs truncate" style={{ color: "#8A94A0" }}>{me.email}</div>
          </div>
        </div>
        <div className="px-5">
          <ProfileRow label="Role" value={me.role.replace("_", " ")} />
          <ProfileRow
            label="Initials"
            value={me.initials || "not set"}
            hint={me.initials ? "the key your tasks are matched on" : "ask an admin to assign yours"}
          />
          <ProfileRow label="ERP owner name" value={me.erpOwner || "—"} hint={me.erpOwner ? undefined : "used to match ERP-owned jobs"} />
        </div>
        <div className="text-xs px-5 pt-3" style={{ color: "#8A94A0" }}>
          Name, initials, role and ERP owner are set by an admin in Admin → User management.
        </div>
        <div className="flex gap-2 p-5 pt-4">
          <button onClick={onChangePassword} className="flex-1 py-2 rounded font-bold text-sm" style={{ background: "#F4F2EC", color: "#16232F" }}>
            🔑 Change Password
          </button>
          <button onClick={onClose} className="flex-1 py-2 rounded font-bold text-sm" style={{ background: "#22303C", color: "#fff" }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Self-service password change. The current password is verified first (a
 * re-sign-in with the same account), so a walked-away-from session can't be
 * used to lock the real owner out.
 */
function ChangePasswordModal({ email, onClose }: { email: string; onClose: () => void }) {
  const [cur, setCur] = useState("");
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (pw1.length < 8) return setErr("New password must be at least 8 characters");
    if (pw1 !== pw2) return setErr("The two new passwords don't match");
    if (pw1 === cur) return setErr("New password must be different from the current one");
    setBusy(true);
    const supabase = supabaseBrowser();
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password: cur });
    if (signInErr) {
      setBusy(false);
      return setErr("Current password is incorrect");
    }
    const { error } = await supabase.auth.updateUser({ password: pw1 });
    setBusy(false);
    if (error) return setErr(error.message || "Could not change the password");
    setDone(true);
  };

  const field = (label: string, value: string, set: (v: string) => void, autoComplete: string) => (
    <>
      <label className="block text-xs font-semibold mb-1" style={{ color: "#5A6672" }}>{label}</label>
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => set(e.target.value)}
        className="w-full border rounded px-2 py-2 mb-3 text-sm"
        style={{ borderColor: "#D9D6CD" }}
        autoComplete={autoComplete}
      />
    </>
  );

  return (
    <div onClick={onClose} className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(13,22,31,0.75)", zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg p-5 w-full" style={{ maxWidth: 380, borderTop: "5px solid #E8600A" }}>
        <div className="text-xs font-bold tracking-widest" style={{ color: "#E8600A" }}>CHANGE PASSWORD</div>
        <div className="text-xs mb-4 mt-1" style={{ color: "#8A94A0" }}>{email}</div>
        {done ? (
          <>
            <div className="text-sm font-semibold" style={{ color: "#2E7D32" }}>✓ Password changed. Use the new one next time you sign in.</div>
            <button onClick={onClose} className="w-full mt-4 py-2 rounded font-bold text-sm" style={{ background: "#22303C", color: "#fff" }}>Done</button>
          </>
        ) : (
          <form onSubmit={submit}>
            {field("Current password", cur, setCur, "current-password")}
            {field("New password", pw1, setPw1, "new-password")}
            {field("Confirm new password", pw2, setPw2, "new-password")}
            <label className="flex items-center gap-2 text-xs mb-3" style={{ color: "#5A6672" }}>
              <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
              Show passwords
            </label>
            {err && <div className="text-xs mb-3 font-semibold" style={{ color: "#B3261E" }}>{err}</div>}
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="flex-1 py-2 rounded font-bold text-sm" style={{ background: "#F4F2EC", color: "#16232F" }}>Cancel</button>
              <button type="submit" disabled={busy} className="flex-1 py-2 rounded font-bold text-sm" style={{ background: "#E8600A", color: "#fff", opacity: busy ? 0.6 : 1 }}>
                {busy ? "Saving…" : "Change password"}
              </button>
            </div>
          </form>
        )}
      </div>
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

// ============================ My Week (landing) ============================
interface TodayItem {
  source: "goal" | "task";
  id: string;
  kind: string;
  title: string;
  job_id: string | null;
  due: string | null;
  originalDue: string | null;
  pushCount: number;
  carriedDays: number;
  cat: string;
  esc: string | null;
  late: boolean;
}

function MyWeek({
  board,
  me,
  V,
  onOpen,
  reload,
  goTasks,
  goGoals,
  goalsAccess,
}: {
  board: Board;
  me: { email: string; initials: string | null; displayName: string | null; erpOwner: string | null; role: string };
  V: (v: number) => string;
  onOpen: (id: string) => void;
  reload: () => Promise<Board | null>;
  goTasks: () => void;
  goGoals: () => void;
  goalsAccess: boolean;
}) {
  const weekEnd = addDays(TODAY, 7);
  const handles = useMemo(() => myHandles(me), [me]);

  // Goal work owed today, merged in from the goals layer — but ONLY for people
  // who hold a goals grant. Showing goal items to someone whose Goals tab is
  // hidden read as an inconsistency ("why can I see this but not open it"), so
  // the whole card follows the same grant as the workspace. Trade-off, made
  // deliberately: a person with tactics assigned but no grant won't see them
  // anywhere — if someone is expected to work goal tactics, give them View.
  const [goalItems, setGoalItems] = useState<TodayItem[]>([]);
  useEffect(() => {
    if (!goalsAccess) { setGoalItems([]); return; }
    api.get("/api/today")
      .then((r) => setGoalItems((r.items || []).filter((i: TodayItem) => i.source === "goal")))
      .catch(() => setGoalItems([]));
  }, [goalsAccess]);

  // my open tasks: overdue, or due within the next seven days
  const myTasks = useMemo(() => {
    const mine = board.tasks.filter((t) => !t.done && handles.has(String(t.who || "").toLowerCase()));
    return mine
      .filter((t) => !t.due || t.due <= weekEnd)
      .sort((a, b) => ((a.due || "9999") < (b.due || "9999") ? -1 : 1));
  }, [board.tasks, handles, weekEnd]);
  const overdue = myTasks.filter((t) => t.due && t.due < TODAY);
  const dueToday = myTasks.filter((t) => t.due === TODAY);
  const laterThisWeek = myTasks.filter((t) => !t.due || t.due > TODAY);

  // jobs I own — matched on the resolved Project Owner account
  const myJobs = useMemo(
    () => board.jobs.filter((j) => j.ownerInitials && j.ownerInitials === me.initials),
    [board.jobs, me.initials],
  );

  // delivery expected in the next seven days — shop-wide
  const dueJobs = useMemo(
    () =>
      board.jobs
        .filter((j) => j.tdd && j.tdd <= weekEnd)
        .sort((a, b) => ((a.tdd || "9999") < (b.tdd || "9999") ? -1 : 1)),
    [board.jobs, weekEnd],
  );

  // milestones of mine landing this week
  const myMilestones = useMemo(() => {
    const out: { job: Job; idx: number; name: string; end: string }[] = [];
    for (const j of myJobs) {
      const plan = board.plans[j.id];
      if (!plan?.milestones?.length) continue;
      for (const m of computeSchedule({ start: plan.start || TODAY, milestones: plan.milestones })) {
        if (!m.done && m.end >= TODAY && m.end <= weekEnd && manDays(m) > 0)
          out.push({ job: j, idx: m.idx, name: m.name, end: m.end });
      }
    }
    return out.sort((a, b) => (a.end < b.end ? -1 : 1));
  }, [myJobs, board.plans, weekEnd]);

  const [lightbox, setLightbox] = useState<Task | null>(null);
  const who = me.displayName || me.email.split("@")[0];

  const Card = ({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) => (
    <div className="bg-white rounded-lg border px-3 py-2" style={{ borderColor: "#E2E0DA", borderTop: `3px solid ${color}` }}>
      <div className="text-xs font-bold" style={{ color: "#8A94A0" }}>{label}</div>
      <div className="text-xl font-bold tnum" style={{ color }}>{value}</div>
      {sub && <div className="text-xs" style={{ color: "#8A94A0" }}>{sub}</div>}
    </div>
  );

  return (
    <div className="p-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-3">
        <h2 className="text-xl font-bold" style={{ color: "#16232F" }}>
          Good day, {who}
          {me.initials && <span className="ml-2 rounded px-1.5 py-0.5 text-sm font-bold" style={{ background: "#E8600A", color: "#fff" }}>{me.initials}</span>}
        </h2>
        <span className="text-xs" style={{ color: "#8A94A0" }}>
          Week of {fmtFull(TODAY)} → {fmtFull(weekEnd)} · 🕒 files as of {stamp(board.lastUpdated)}
        </span>
      </div>

      {!me.initials && (
        <div className="text-xs font-bold rounded px-2 py-1.5 mb-3" style={{ background: "#FFF3E8", color: "#B3261E", border: "1px solid #E8600A" }}>
          ⚠ You have no initials assigned yet, so tasks can&apos;t be matched to you. An admin can set them in Admin → User management.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
        <Card label="MY OPEN TASKS" value={myTasks.length} sub="this week" color="#16232F" />
        <Card label="OVERDUE" value={overdue.length} sub={overdue.length ? "needs attention" : "all clear"} color={overdue.length ? "#B3261E" : "#0D7A3F"} />
        <Card label="DUE TODAY" value={dueToday.length} color="#E8600A" />
        <Card label="MY JOBS" value={myJobs.length} sub={V(myJobs.reduce((s, j) => s + j.val, 0))} color="#1B3A5C" />
        <Card label="DELIVERIES THIS WEEK" value={dueJobs.length} sub="shop-wide" color="#7C3AED" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* my tasks */}
        <div className="bg-white rounded-lg border p-3" style={{ borderColor: "#E2E0DA" }}>
          <div className="flex items-center justify-between mb-2">
            <div className="font-bold text-sm">My tasks this week</div>
            <button onClick={goTasks} className="text-xs font-bold" style={{ color: "#E8600A" }}>Open Tasking →</button>
          </div>
          {myTasks.length === 0 ? (
            <div className="text-sm py-4 text-center" style={{ color: "#8A94A0" }}>
              {me.initials ? "Nothing assigned to you this week ✓" : "Assign initials to see your tasks here."}
            </div>
          ) : (
            <>
              {overdue.length > 0 && (
                <div className="text-xs font-bold rounded px-2 py-1 mb-2 inline-block" style={{ background: "#B3261E", color: "#fff" }}>
                  ⚠ {overdue.length} overdue
                </div>
              )}
              {[...overdue, ...dueToday, ...laterThisWeek].map((t) => {
                const job = board.jobs.find((j) => j.id === t.j);
                return (
                  <div key={t.id} onClick={() => setLightbox(t)} className="rounded p-2 mb-1.5 cursor-pointer border relative" style={{ ...dueStyle(t.due), borderColor: "rgba(0,0,0,0.08)" }}>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        const warn = t.kind === "erp" ? "\n\n⚠ From the ERP ToDo list — the next upload will bring it back unless it is closed in the ERP." : "";
                        if (!window.confirm(`Delete "${t.t}"?${warn}\n\nThis cannot be undone.`)) return;
                        try { await api.post("/api/tasks", { action: "delete", id: t.id, kind: t.kind }); await reload(); }
                        catch (err) { alert(err instanceof Error ? err.message : String(err)); }
                      }}
                      className="absolute rounded font-bold"
                      style={{ top: 2, right: 3, width: 16, height: 16, lineHeight: "14px", fontSize: 11, background: "rgba(0,0,0,0.10)", color: "#B3261E" }}
                      title="Delete this task"
                    >✕</button>
                    <div className="text-xs font-semibold" style={{ paddingRight: 16 }}>{t.t}</div>
                    <div className="flex items-center justify-between mt-1 text-xs gap-2" style={{ opacity: 0.85 }}>
                      {/* the customer tag says which machine this is; the bare job number didn't */}
                      <span className="font-bold truncate" style={{ maxWidth: 150 }} title={job ? `${job.tag} · JOB ${jobNo(t.j)}` : undefined}>
                        {job ? job.tag : "—"}
                      </span>
                      {t.esc && t.esc !== "None" && <span className="font-bold rounded px-1 flex-shrink-0" style={{ background: "#B3261E", color: "#fff", fontSize: 9 }}>⚠ {t.esc.slice(0, 2)}</span>}
                      <span className="flex-shrink-0" style={{ fontSize: 10 }}>{(t.cat || "").toLowerCase()}</span>
                      <span className="tnum flex-shrink-0">{fmt(t.due)}</span>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* goal work owed today — the merge of the two layers */}
        {goalItems.length > 0 && (
          <div className="bg-white rounded-lg border p-3" style={{ borderColor: "#E2E0DA" }}>
            <div className="flex items-center justify-between mb-2">
              <div className="font-bold text-sm">🎯 My goal work</div>
              <button onClick={goGoals} className="text-xs font-bold" style={{ color: "#E8600A" }}>Open Goals →</button>
            </div>
            {goalItems.map((g) => (
              <div key={g.id} className="rounded p-2 mb-1.5 border" style={{ background: g.late ? "#FBEDEA" : "#F4F2EC", borderColor: g.late ? "#B3261E" : "#E2E0DA", borderLeft: `3px solid ${g.late ? "#B3261E" : "#7C3AED"}` }}>
                <div className="text-xs font-semibold" style={{ color: "#16232F" }}>{g.title}</div>
                <div className="flex items-center gap-2 mt-1 text-xs flex-wrap" style={{ color: "#8A94A0" }}>
                  <span className="rounded px-1 font-bold" style={{ background: "#F3EEFB", color: "#7C3AED", fontSize: 9 }}>{g.cat.toUpperCase()}</span>
                  {g.carriedDays > 0 && <span className="tnum">carried {g.carriedDays}d</span>}
                  {g.pushCount > 0 && <span style={{ color: "#D97706" }}>pushed {g.pushCount}×</span>}
                  {g.late && <span className="font-bold" style={{ color: "#B3261E" }}>past {fmt(g.originalDue)}</span>}
                  <span className="ml-auto tnum">{fmt(g.due)}</span>
                </div>
              </div>
            ))}
            <div className="text-xs mt-1" style={{ color: "#8A94A0" }}>
              Carried days and pushes are counted against the date first committed, not the one on screen.
            </div>
          </div>
        )}

        {/* deliveries expected this week */}
        <div className="bg-white rounded-lg border p-3" style={{ borderColor: "#E2E0DA" }}>
          <div className="font-bold text-sm mb-2">Delivery expected in the next 7 days</div>
          {dueJobs.length === 0 ? (
            <div className="text-sm py-4 text-center" style={{ color: "#8A94A0" }}>No deliveries due this week.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ color: "#8A94A0" }}>
                    <th className="text-left py-1 font-semibold">Job</th>
                    <th className="text-left py-1 font-semibold">Customer tag</th>
                    <th className="text-left py-1 font-semibold">Owner</th>
                    <th className="text-center py-1 font-semibold">TDD</th>
                    <th className="text-center py-1 font-semibold">Prod %</th>
                  </tr>
                </thead>
                <tbody>
                  {dueJobs.map((j) => (
                    <tr key={j.id} className="border-t" style={{ borderColor: "#EFEDE7" }}>
                      <td className="py-1.5">
                        <button onClick={() => onOpen(j.id)} className="font-bold underline decoration-dotted" style={{ color: "#1B3A5C" }}>{jobNo(j.id)}</button>
                      </td>
                      <td className="py-1.5">{j.tag}</td>
                      <td className="py-1.5" style={{ color: "#5A6672" }}>{j.own || "—"}</td>
                      <td className="py-1.5 text-center font-bold tnum" style={{ color: j.tdd && j.tdd < TODAY ? "#B3261E" : "#22303C" }}>{fmtFull(j.tdd)}</td>
                      <td className="py-1.5 text-center tnum">{j.pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* my milestones this week */}
        <div className="bg-white rounded-lg border p-3" style={{ borderColor: "#E2E0DA" }}>
          <div className="font-bold text-sm mb-2">My milestones landing this week</div>
          {myMilestones.length === 0 ? (
            <div className="text-sm py-4 text-center" style={{ color: "#8A94A0" }}>No milestones due on your jobs this week.</div>
          ) : (
            myMilestones.map((m, i) => (
              <div key={i} onClick={() => onOpen(m.job.id)} className="rounded p-2 mb-1.5 cursor-pointer border" style={{ background: "#DDE6EE", borderColor: "#B9C7D4" }}>
                <div className="text-xs font-bold" style={{ color: "#1B3A5C" }}>⚑ M{m.idx} · {m.name}</div>
                <div className="text-xs flex justify-between mt-0.5" style={{ color: "#5A6672" }}>
                  <span>JOB {jobNo(m.job.id)} · {m.job.tag}</span>
                  <span className="tnum">{fmt(m.end)}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* my jobs */}
        <div className="bg-white rounded-lg border p-3" style={{ borderColor: "#E2E0DA" }}>
          <div className="font-bold text-sm mb-2">My jobs {myJobs.length > 0 && <span className="font-normal text-xs" style={{ color: "#8A94A0" }}>· {myJobs.length}</span>}</div>
          {myJobs.length === 0 ? (
            <div className="text-sm py-4 text-center" style={{ color: "#8A94A0" }}>
              No jobs list you as owner. Owner matching uses your initials or the ERP owner name on your profile.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <tbody>
                  {myJobs.slice(0, 12).map((j) => (
                    <tr key={j.id} className="border-t" style={{ borderColor: "#EFEDE7" }}>
                      <td className="py-1.5"><button onClick={() => onOpen(j.id)} className="font-bold underline decoration-dotted" style={{ color: "#1B3A5C" }}>{jobNo(j.id)}</button></td>
                      <td className="py-1.5">{j.tag}</td>
                      <td className="py-1.5 text-center font-bold tnum" style={{ color: j.tdd && j.tdd < TODAY ? "#B3261E" : "#22303C" }}>{fmtFull(j.tdd)}</td>
                      <td className="py-1.5 text-right" style={{ color: "#8A94A0" }}>{stamp(j.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {myJobs.length > 12 && <div className="text-xs mt-1" style={{ color: "#8A94A0" }}>+{myJobs.length - 12} more…</div>}
            </div>
          )}
        </div>
      </div>

      {lightbox && <TaskModal task={lightbox} owners={assignees(board)} onClose={() => setLightbox(null)} onToggle={async () => { await api.post("/api/tasks", { action: "toggle", id: lightbox.id, kind: lightbox.kind, done: !lightbox.done }); setLightbox(null); await reload(); }} reload={reload} />}
    </div>
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
  const calRef = useRef<HTMLDivElement | null>(null);
  const scrollCalToToday = () => {
    const c = calRef.current;
    const el = c?.querySelector('[data-today-row="1"]') as HTMLElement | null;
    if (c && el)
      c.scrollTop += el.getBoundingClientRect().top - c.getBoundingClientRect().top - c.clientHeight / 2;
  };
  useEffect(() => {
    if (subTab !== "cal") return;
    const t = setTimeout(scrollCalToToday, 60);
    return () => clearTimeout(t);
  }, [subTab]);

  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<string>("");
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  const allJobs = board.jobs;
  const prio = board.priority; // array or null

  // Only Project Owner ACCOUNTS are offered — never raw Jobmaster text. Jobs
  // carry a resolved ownerInitials (see resolveOwners on the server), so the
  // filter matches on that.
  const ownerOptions = useMemo(
    () => (board.projectOwners || []).map((p) => ({ value: p.initials!, label: personLabel(p) })),
    [board.projectOwners],
  );

  // Owner + search are applied ONCE here so every sub-view (priority list,
  // kanban, calendar, by-product, by-customer) and the KPI cards all honour them.
  const jobs = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return allJobs.filter((j) => {
      if (delOwn === "none" && j.ownerInitials) return false;
      if (delOwn !== "all" && delOwn !== "none" && j.ownerInitials !== delOwn) return false;
      if (!needle) return true;
      return (
        j.id.includes(needle) ||
        jobNo(j.id).includes(needle) ||
        j.tag.toLowerCase().includes(needle) ||
        j.cust.toLowerCase().includes(needle) ||
        j.fam.toLowerCase().includes(needle) ||
        j.stat.toLowerCase().includes(needle) ||
        String(j.own || "").toLowerCase().includes(needle) ||
        String(j.proj || "").toLowerCase().includes(needle)
      );
    });
  }, [allJobs, delOwn, q]);

  /** Column sorting for the priority table. Click a header to cycle asc/desc. */
  const sortJobs = (list: Job[]): Job[] => {
    if (!sortKey) return list;
    const val = (j: Job): string | number => {
      switch (sortKey) {
        case "job": return j.id;
        case "tag": return j.tag.toLowerCase();
        case "fam": return j.fam.toLowerCase();
        case "cust": return j.cust.toLowerCase();
        case "tdd": return j.tdd || "9999-12-31";
        case "otd": return j.otd || "9999-12-31";
        case "own": return String(j.own || "").toLowerCase();
        case "stat": return j.stat.toLowerCase();
        case "pct": return j.pct;
        case "val": return j.val;
        case "tpv": return j.tpv;
        case "tpp": return j.tpp;
        case "kit": return j.kit;
        case "upd": return j.updated_at || "";
        default: return 0;
      }
    };
    return [...list].sort((a, b) => {
      const x = val(a), y = val(b);
      if (x === y) return 0;
      return (x < y ? -1 : 1) * sortDir;
    });
  };
  const toggleSort = (k: string) => {
    if (sortKey === k) setSortDir((d) => (d === 1 ? -1 : 1));
    else { setSortKey(k); setSortDir(1); }
  };

  // Kanban columns are Project Owner accounts present on the filtered jobs,
  // plus one Unassigned column for jobs whose ERP owner matches no account.
  const kanbanOwners = useMemo(() => {
    const set = new Set(jobs.map((j) => j.ownerInitials).filter(Boolean) as string[]);
    const list = [...set].sort();
    return jobs.some((j) => !j.ownerInitials) ? [...list, "Unassigned"] : list;
  }, [jobs]);
  const ownerLabel = (init: string) =>
    init === "Unassigned"
      ? "Unassigned"
      : ownerOptions.find((o) => o.value === init)?.label || init;
  /** Sortable <th>. */
  const SortTh = ({ k, label, align = "left" }: { k: string; label: string; align?: "left" | "center" | "right" }) => (
    <th
      onClick={() => toggleSort(k)}
      className={`px-2 py-2 text-${align} cursor-pointer select-none whitespace-nowrap`}
      style={{ position: "sticky", top: 0, zIndex: 3, background: "#22303C", color: sortKey === k ? "#F5B32B" : "#fff" }}
      title={`Sort by ${label}`}
    >
      {label}{sortKey === k ? (sortDir === 1 ? " ▲" : " ▼") : " ⇅"}
    </th>
  );
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
        <select value={delOwn} onChange={(e) => setDelOwn(e.target.value)} className="px-2 py-1 rounded border text-sm ml-1 font-semibold" style={{ borderColor: delOwn === "all" ? "#D9D6CD" : "#E8600A", background: delOwn === "all" ? "#fff" : "#FFF3E8", color: delOwn === "all" ? "#22303C" : "#E8600A" }} title="Filter every view on this board by Project Owner">
          <option value="all">All project owners</option>
          {ownerOptions.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
          {ownerOptions.length === 0 && <option disabled>No Project Owner accounts yet</option>}
          <option value="none">— Unassigned jobs —</option>
        </select>
        <div className="relative">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="🔍 Search job no, tag, customer, product, status…"
            className="px-2 py-1 rounded border text-sm"
            style={{ borderColor: q ? "#E8600A" : "#D9D6CD", minWidth: 290 }}
          />
          {q && (
            <button onClick={() => setQ("")} className="absolute right-2 top-1 font-bold" style={{ color: "#E8600A" }} title="Clear search">✕</button>
          )}
        </div>
        {(delOwn !== "all" || q) && (
          <button onClick={() => { setDelOwn("all"); setQ(""); }} className="px-2 py-1 rounded text-xs font-bold" style={{ background: "#E8600A", color: "#fff" }} title="Clear filters">
            {jobs.length} of {allJobs.length} jobs · clear ✕
          </button>
        )}
      </div>

      {/* ---- Calendar (ISO weeks) — one continuous scroll through the months ---- */}
      {subTab === "cal" && (() => {
        const tdds = jobs.map((j) => j.tdd).filter(Boolean) as string[];
        const lo0 = tdds.length ? tdds.reduce((a, b) => (a < b ? a : b)) : TODAY;
        const hi0 = tdds.length ? tdds.reduce((a, b) => (a > b ? a : b)) : TODAY;
        const lo = lo0 < TODAY ? lo0 : TODAY;
        let hi = hi0 > TODAY ? hi0 : TODAY;
        if (diffDays(lo, hi) > 730) hi = addDays(lo, 730); // clamp to ~24 months of rows
        // full Mon–Sun weeks covering from the 1st of the earliest month to the end of the latest
        const start = parseISO(lo.slice(0, 7) + "-01");
        start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
        const hiD = parseISO(hi);
        const end = new Date(Date.UTC(hiD.getUTCFullYear(), hiD.getUTCMonth() + 1, 0));
        end.setUTCDate(end.getUTCDate() + (6 - ((end.getUTCDay() + 6) % 7)));
        const weeks: string[][] = [];
        for (let d = new Date(start); d <= end; ) {
          const wk: string[] = [];
          for (let k = 0; k < 7; k++) { wk.push(toISO(new Date(d))); d.setUTCDate(d.getUTCDate() + 1); }
          weeks.push(wk);
        }
        const byDay: Record<string, Job[]> = {};
        jobs.forEach((j) => { if (j.tdd) (byDay[j.tdd] = byDay[j.tdd] || []).push(j); });
        const monthOf = (iso: string) => parseISO(iso).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
        let lastMonth = "";
        return (
          <div className="bg-white rounded-lg border p-3" style={{ borderColor: "#E2E0DA" }}>
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <div className="font-bold" style={{ color: "#16232F" }}>Delivery calendar <span className="text-xs font-normal" style={{ color: "#8A94A0" }}>· continuous — scroll through the months · jobs on their Target Delivery Date · ISO weeks on the left</span></div>
              <button onClick={scrollCalToToday} className="px-2 py-1 rounded text-xs font-bold" style={{ background: "#E8600A", color: "#fff" }}>⤓ Jump to today</button>
            </div>
            <div ref={calRef} style={{ maxHeight: "70vh", overflowY: "auto" }}>
              <table className="w-full text-xs" style={{ borderCollapse: "collapse", tableLayout: "fixed" }}>
                <thead>
                  <tr>
                    <th className="px-1 py-1.5" style={{ width: 58, position: "sticky", top: 0, zIndex: 6, background: "#22303C", color: "#fff" }}>ISO Wk</th>
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                      <th key={d} className="px-1 py-1.5" style={{ position: "sticky", top: 0, zIndex: 6, background: "#22303C", color: "#fff" }}>{d}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {weeks.map((wk) => {
                    const rows: React.ReactNode[] = [];
                    const mLabel = monthOf(wk[3]); // the week's Thursday decides which month owns it (ISO convention)
                    if (mLabel !== lastMonth) {
                      lastMonth = mLabel;
                      rows.push(
                        <tr key={"m" + wk[0]}>
                          <td colSpan={8} className="px-2 py-1.5 font-bold" style={{ background: "#16232F", color: "#F5B32B", position: "sticky", top: 28, zIndex: 5 }}>{mLabel}</td>
                        </tr>,
                      );
                    }
                    const wkCount = wk.reduce((n, d2) => n + (byDay[d2] || []).length, 0);
                    const wkVal = wk.reduce((v, d2) => v + (byDay[d2] || []).reduce((x, j) => x + (j.val || 0), 0), 0);
                    const isTodayWk = wk[0] <= TODAY && TODAY <= wk[6];
                    rows.push(
                      <tr key={wk[0]} data-today-row={isTodayWk ? "1" : undefined} className="border-t align-top" style={{ borderColor: "#EFEDE7" }}>
                        <td className="px-1 py-1 font-bold text-center" style={{ background: isTodayWk ? "#FFF3E8" : "#F4F2EC", color: "#1B3A5C" }}>
                          W{isoWeek(wk[0])}
                          {wkCount > 0 && (<div className="font-normal" style={{ color: "#8A94A0", fontSize: 9 }}>{wkCount} job{wkCount === 1 ? "" : "s"}<br />{V(wkVal)}</div>)}
                        </td>
                        {wk.map((d2) => {
                          const list = byDay[d2] || [];
                          return (
                            <td key={d2} className="px-1 py-1 border-l" style={{ borderColor: "#EFEDE7", background: d2 === TODAY ? "#FFF3E8" : "#fff", height: 64 }}>
                              <div className="font-bold tnum" style={{ color: d2 === TODAY ? "#E8600A" : "#8A94A0" }}>
                                {parseInt(d2.slice(8), 10)}
                                {list.length > 1 && <span style={{ color: "#1B3A5C" }}> ({list.length})</span>}
                                {d2 === TODAY ? " · today" : ""}
                              </div>
                              {list.map((j) => (
                                <div key={j.id} onClick={() => onOpen(j.id)} title={j.tag + " · " + j.cust + " · " + (j.stat || "")} className="rounded px-1 py-0.5 mb-0.5 cursor-pointer font-semibold" style={{ background: j.tdd && j.tdd < TODAY ? "#B3261E" : "#DCE8F5", color: j.tdd && j.tdd < TODAY ? "#fff" : "#1B3A5C", fontSize: 9, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{jobNo(j.id)} {j.tag}</div>
                              ))}
                            </td>
                          );
                        })}
                      </tr>,
                    );
                    return rows;
                  })}
                </tbody>
              </table>
            </div>
            <div className="text-xs mt-2" style={{ color: "#8A94A0" }}>Scroll for more months · tap a job chip to open its milestone plan · red chip = TDD already past · (n) = jobs due that day · week cell shows count &amp; value due that ISO week</div>
          </div>
        );
      })()}

      {/* ---- Priority List (drag to reorder) ---- */}
      {subTab === "priority" && (() => {
        const base = prio
          ? prio.map((id) => byTDD.find((j) => j.id === id)).filter(Boolean).concat(byTDD.filter((j) => !prio.includes(j.id))) as Job[]
          : byTDD;
        const plist = sortJobs(base); // owner/search filtered upstream, then sorted
        // reordering writes the full priority list, so only allow it unfiltered
        const canDrag = delOwn === "all" && !q && !sortKey;
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
          <div className="bg-white rounded-lg border" style={{ borderColor: "#E2E0DA" }}>
            <div className="px-3 pt-2 pb-1 text-xs flex justify-between flex-wrap gap-2" style={{ color: "#8A94A0" }}>
              <span>
                {canDrag
                  ? "⠿ Drag any row to set manual priority"
                  : sortKey
                    ? "Sorted by column — clear the sort to drag-reorder"
                    : "Filter active — clear it to drag-reorder"}
                {prio ? " · manual order active" : " · sorted by Target Delivery Date"}
                {sortKey && <button onClick={() => setSortKey("")} className="ml-2 font-bold" style={{ color: "#E8600A" }}>↺ clear sort</button>}
              </span>
              {prio && <button onClick={() => setPrio(null)} className="font-bold" style={{ color: "#E8600A" }}>↺ Reset to TDD order</button>}
            </div>
            {/* the header sticks while the rows scroll */}
            <div className="overflow-auto" style={{ maxHeight: "68vh" }}>
            <table className="w-full text-xs" style={{ minWidth: 1040, borderCollapse: "separate", borderSpacing: 0 }}>
              <thead>
                <tr style={{ background: "#22303C", color: "#fff" }}>
                  <th className="px-2 py-2 text-left" style={{ position: "sticky", top: 0, zIndex: 3, background: "#22303C" }}>Pri</th>
                  <SortTh k="job" label="Job" />
                  <SortTh k="tag" label="Customer Tag" />
                  <SortTh k="fam" label="Product Family" />
                  <SortTh k="tdd" label="Target Delivery" align="center" />
                  <SortTh k="otd" label="OTD Date" align="center" />
                  <SortTh k="own" label="Owner" />
                  <SortTh k="stat" label="Job Status ✎" />
                  <SortTh k="pct" label="Prod %" align="center" />
                  <SortTh k="val" label="Value" align="center" />
                  <SortTh k="tpv" label="Throughput" align="center" />
                  <SortTh k="tpp" label="T%" align="center" />
                  <SortTh k="kit" label="Kit%" align="center" />
                  <SortTh k="upd" label="Last updated" align="center" />
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
                    <td className="px-2 py-1.5" style={{ color: j.ownerInitials ? "#1B3A5C" : "#B8B5AC" }} title={j.own ? `Jobmaster: ${j.own}` : "No owner in the Jobmaster"}>
                      {j.ownerInitials ? (
                        <><span className="font-bold rounded px-1 mr-1" style={{ background: "#DCE8F5" }}>{j.ownerInitials}</span>{j.ownerName}</>
                      ) : (j.own || "—")}
                    </td>
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
                    <td className="px-2 py-1.5 text-center whitespace-nowrap" style={{ color: "#8A94A0" }}>{stamp(j.updated_at)}</td>
                  </tr>
                ))}
                {plist.length === 0 && (
                  <tr><td colSpan={14} className="py-6 text-center" style={{ color: "#8A94A0" }}>No jobs match this filter.</td></tr>
                )}
              </tbody>
            </table>
            </div>
          </div>
        );
      })()}

      {/* ---- By Owner (Kanban) ---- */}
      {subTab === "okan" && (
        <div className="flex gap-3 overflow-x-auto pb-2 items-start">
          {(delOwn === "all" ? kanbanOwners : [delOwn]).map((o) => {
            const ojobs = byTDD.filter((j) => (o === "Unassigned" ? !j.ownerInitials : j.ownerInitials === o));
            if (!ojobs.length) return null;
            return (
              <div key={o} style={{ minWidth: 250, maxWidth: 270 }}>
                <div className="rounded-t-lg p-2" style={{ background: "#16232F", color: "#fff", borderBottom: "3px solid #E8600A" }}>
                  <div className="flex justify-between items-baseline">
                    <span className="font-bold text-sm" style={{ color: "#F5B32B" }}>{ownerLabel(o)}</span>
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
        : { start: j.start && j.start >= TODAY ? j.start : TODAY, milestones: templateMilestones(j.fam, board.templates) };
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
const MAT_ITEMS = [
  "Chassis / base frame steel", "Structural sections & plates", "Hydraulic powerpack",
  "Hydraulic cylinders & hoses", "Control panel & wiring loom", "Bought-out wheels / castors",
  "Paint & consumables", "Fasteners & hardware",
];

function JobPlan({
  board,
  activeId,
  setActiveId,
  V,
  reload,
  isRaghu,
  canEdit,
  pushERP,
}: {
  board: Board;
  activeId: string | null;
  setActiveId: (id: string) => void;
  V: (v: number) => string;
  reload: () => Promise<Board | null>;
  isRaghu: boolean;
  /** admin / planner / project_owner. Others see the plan read-only — the
   *  server already rejected their writes, but the UI let them type, which
   *  looked like "changes not saving" rather than "no permission". */
  canEdit: boolean;
  pushERP: (dt: string, id: string, f: string, v: string) => void;
}) {
  // re-sorted on every keystroke before — the job list only changes when the board does
  const byTDD = useMemo(
    () => [...board.jobs].sort((a, b) => ((a.tdd || "9999") < (b.tdd || "9999") ? -1 : 1)),
    [board.jobs],
  );

  // job-picker search + Project Owner filter (in addition to the dropdown)
  const [planQ, setPlanQ] = useState("");
  const [planPO, setPlanPO] = useState("all");
  const pickerJobs = useMemo(() => {
    const needle = planQ.trim().toLowerCase();
    return byTDD.filter((j) => {
      if (planPO !== "all" && j.ownerInitials !== planPO) return false;
      if (!needle) return true;
      return (
        j.id.includes(needle) ||
        jobNo(j.id).includes(needle) ||
        j.tag.toLowerCase().includes(needle) ||
        j.cust.toLowerCase().includes(needle) ||
        j.fam.toLowerCase().includes(needle)
      );
    });
  }, [byTDD, planQ, planPO]);
  const job = useMemo(
    () => board.jobs.find((j) => j.id === activeId) || (activeId ? board.archived[activeId] : undefined),
    [board.jobs, board.archived, activeId],
  );

  const [planView, setPlanView] = useState<"plan" | "mat">("plan");
  const [draft, setDraft] = useState<Plan | null>(null);
  const [applyTplName, setApplyTplName] = useState("");
  const templateNames = useMemo(() => Object.keys(board.templates).sort(), [board.templates]);
  const [dragMi, setDragMi] = useState<number | null>(null);
  const [warned, setWarned] = useState<Set<string>>(new Set());
  const [addingTask, setAddingTask] = useState<string | null>(null);
  const [form, setForm] = useState({ t: "", who: "", due: TODAY, cat: "Production", esc: "None" });
  const [msForm, setMsForm] = useState<{ open: boolean; name: string; days: number }>({ open: false, name: "", days: 3 });
  const [showPastMs, setShowPastMs] = useState(false);
  const [lightbox, setLightbox] = useState<Task | null>(null);
  const [matForm, setMatForm] = useState({ item: "", qty: "" });
  const dirty = useRef(false);
  const seededMat = useRef<string | null>(null);

  const baseFor = (j: Job): Plan => {
    const saved = board.plans[j.id];
    if (saved && saved.milestones.length)
      return { start: saved.start || j.start || TODAY, milestones: saved.milestones.map((m) => ({ ...m, crew: { ...m.crew }, preds: [...m.preds] })) };
    return { start: j.start && j.start >= TODAY ? j.start : TODAY, milestones: templateMilestones(j.fam, board.templates) };
  };
  useEffect(() => {
    if (!job) { setDraft(null); return; }
    dirty.current = false;
    setDraft(baseFor(job));
  }, [activeId, board]); // eslint-disable-line react-hooks/exhaustive-deps

  // debounced auto-save (only after an actual edit) — persists milestones incl. done flags
  useEffect(() => {
    if (!canEdit) return; // read-only roles never write, so never try
    if (!job || !draft || !dirty.current) return;
    const t = setTimeout(() => {
      api.post("/api/plan", { job_id: job.id, start: draft.start, milestones: draft.milestones }).catch(() => {});
    }, 800);
    return () => clearTimeout(t);
  }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps

  const sched = useMemo(() => (draft ? computeSchedule(draft) : []), [draft]);
  const ends = sched.length ? planEnd(sched) : TODAY;
  const successors = useMemo(() => {
    const map: Record<number, number[]> = {};
    sched.forEach((m) => (m.preds || []).forEach((p) => (map[p] = map[p] || []).push(m.idx)));
    return map;
  }, [sched]);
  const tradeTotals = useMemo(() => {
    const t = zeroCrew();
    sched.forEach((m) => TRADES.forEach((tr) => (t[tr.key] += (m.crew[tr.key] || 0) * Math.max(1, m.days))));
    return t;
  }, [sched]);
  const grandTotal = TRADES.reduce((s, t) => s + tradeTotals[t.key], 0);
  const savedPlan = job ? board.plans[job.id] : undefined;
  const baseline = job ? board.baselines[job.id] : undefined;
  const baselineEnd = savedPlan?.baseline_end || null;
  const msDone = sched.filter((m) => m.done).length;
  const allDone = sched.length > 0 && msDone === sched.length;
  const realEnd = allDone ? sched.reduce((mx, m) => (m.done_on && m.done_on > mx ? m.done_on : mx), "") : null;

  // tasks for the open job — memoised here, above the early return, so the hook
  // order stays constant (every hook must run on every render)
  const jobId = job?.id ?? null;
  const jobTasks = useMemo(
    () => (jobId ? board.tasks.filter((t) => t.j === jobId) : []),
    [board.tasks, jobId],
  );
  const jobCats = useMemo(() => [...new Set(jobTasks.map((t) => t.cat))], [jobTasks]);

  if (!job || !draft) return <div className="p-4 text-sm" style={{ color: "#8A94A0" }}>Pick a job.</div>;
  const dj = job;

  // Single chokepoint for every plan mutation. The permission guard lives here
  // so no drag-handler, checkbox or kanban shortcut can slip an edit past the
  // read-only rule — the disabled UI is cosmetics; this is the enforcement.
  const edit = (fn: (pl: Plan) => Plan) => {
    if (!canEdit) return;
    dirty.current = true;
    setDraft((pl) => (pl ? fn(pl) : pl));
  };
  const setMilestone = (mi: number, patch: Partial<PlanMilestone>) => edit((pl) => ({ ...pl, milestones: pl.milestones.map((m, i) => (i === mi ? { ...m, ...patch } : m)) }));
  const setCrewVal = (mi: number, key: keyof Crew, v: number) => edit((pl) => ({ ...pl, milestones: pl.milestones.map((m, i) => (i === mi ? { ...m, crew: { ...m.crew, [key]: v } } : m)) }));
  const togglePred = (mi: number, p: number) => edit((pl) => ({ ...pl, milestones: pl.milestones.map((m, i) => (i === mi ? { ...m, preds: m.preds.includes(p) ? m.preds.filter((x) => x !== p) : [...m.preds, p].sort((a, b) => a - b) } : m)) }));
  const toggleMsDone = (mi: number) => edit((pl) => ({ ...pl, milestones: pl.milestones.map((m, k) => (k === mi ? { ...m, done: !m.done, done_on: !m.done ? TODAY : null } : m)) }));
  const addMilestone = () => edit((pl) => (pl.milestones.length < 50 ? { ...pl, milestones: [...pl.milestones, { name: `Milestone ${pl.milestones.length + 1}`, days: 3, preds: pl.milestones.length ? [pl.milestones.length] : [], crew: zeroCrew(), shift: "D", offset: 0 }] } : pl));
  const addMilestoneNamed = (name: string, days: number) => edit((pl) => (pl.milestones.length < 50 ? { ...pl, milestones: [...pl.milestones, { name: (name || "").trim() || `Milestone ${pl.milestones.length + 1}`, days: Math.max(1, days || 1), preds: pl.milestones.length ? [pl.milestones.length] : [], crew: zeroCrew(), shift: "D", offset: 0 }] } : pl));
  const removeMilestone = (mi: number) => edit((pl) => ({ ...pl, milestones: pl.milestones.filter((_, i) => i !== mi).map((m) => ({ ...m, preds: m.preds.filter((p) => p !== mi + 1).map((p) => (p > mi + 1 ? p - 1 : p)) })) }));
  const moveMilestone = (mi: number, dir: number) => edit((pl) => {
    const j2 = mi + dir; if (j2 < 0 || j2 >= pl.milestones.length) return pl;
    const arr = [...pl.milestones]; [arr[mi], arr[j2]] = [arr[j2], arr[mi]];
    const p1 = mi + 1, p2 = j2 + 1;
    const remapped = arr.map((m) => ({ ...m, preds: m.preds.map((p) => (p === p1 ? p2 : p === p2 ? p1 : p)) }));
    return { ...pl, milestones: remapped.map((m, idx) => ({ ...m, preds: m.preds.filter((p) => p <= idx) })) };
  });
  const moveMilestoneTo = (from: number | null, to: number) => { if (from == null || from === to) return; edit((pl) => {
    const oldArr = pl.milestones; const arr = [...oldArr]; const [mv] = arr.splice(from, 1); arr.splice(to, 0, mv);
    const posMap: Record<number, number> = {}; oldArr.forEach((m, i) => { posMap[i + 1] = arr.indexOf(m) + 1; });
    const remapped = arr.map((m) => ({ ...m, preds: m.preds.map((p) => posMap[p]).filter(Boolean) }));
    return { ...pl, milestones: remapped.map((m, idx) => ({ ...m, preds: m.preds.filter((p) => p <= idx) })) };
  }); };
  const reloadDefault = () => { dirty.current = true; setDraft({ start: dj.start && dj.start >= TODAY ? dj.start : TODAY, milestones: templateMilestones(dj.fam, board.templates) }); };
  const applyTemplate = (name: string) => {
    if (!name) return;
    if (!window.confirm(`Replace this job's milestones with the "${name}" template? Any custom changes to the current plan will be lost.`)) { setApplyTplName(""); return; }
    dirty.current = true;
    setDraft((pl) => (pl ? { ...pl, milestones: templateMilestones(name, board.templates) } : pl));
    setApplyTplName("");
  };

  const savePlanNow = async () => { await api.post("/api/plan", { job_id: dj.id, start: draft.start, milestones: draft.milestones }); await reload(); };
  // ---- mark the job completed once every milestone is done ----
  // "Completed" here means the job's status is at or past Delivered in the
  // ERP's own status ladder; the button sets "D: Delivered".
  const COMPLETED_STATUSES = [
    "D: Delivered",
    "I: Installation Not Started due to Client",
    "I: Installation in progress",
    "I: Installation Completed",
    "C: Job Handed Over",
  ];
  const isCompleted = COMPLETED_STATUSES.includes(dj.stat);
  const markCompleted = async () => {
    if (!window.confirm(`Mark JOB ${jobNo(dj.id)} — ${dj.tag} as COMPLETED?\n\nAll ${sched.length} milestones are done. This sets the job status to "D: Delivered" in Genie.`)) return;
    try {
      await api.post("/api/job-field", { job_id: dj.id, field: "stat", value: "D: Delivered" });
      pushERP("Jobmaster", dj.id, "job_status", "D: Delivered (job completed)");
      await reload();
      // The warning the button exists for: Genie's status is overwritten by
      // tomorrow's file, so the ERP must be told by hand — immediately.
      window.alert(
        `✔ JOB ${jobNo(dj.id)} marked completed in Genie.\n\n` +
        `⚠ NOW UPDATE THE ERP — this change lives only here until you do.\n` +
        `Open the Jobmaster (link on this page and in the Update-to-ERP tab)\n` +
        `and set its Job Status there too. Tomorrow's morning file will\n` +
        `otherwise overwrite this back to the old status.`,
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  const saveBaseline = async () => {
    if (!sched.length) return;
    await api.post("/api/plan", { job_id: dj.id, start: draft.start, milestones: draft.milestones }); // ensure plan persisted first
    const payload = { job_id: dj.id, baseline_end: ends, milestones: sched.map((m) => ({ idx: m.idx, title: m.name, start: m.start, end: m.end })), force: false };
    try {
      const r = await api.post("/api/baseline", payload);
      pushERP("Job Plan Baseline", dj.id, "baseline_end", fmtFull(ends));
      await reload();
      alert("Baseline saved ✓ (" + r.baseline_on + ")");
    } catch (e) {
      if (e instanceof Error && /baseline_exists|409/.test(e.message)) {
        if (window.confirm("A baseline saved earlier already exists. Overwrite with today's planned timeline?")) {
          await api.post("/api/baseline", { ...payload, force: true }); await reload(); alert("Baseline overwritten ✓");
        }
      } else alert(e instanceof Error ? e.message : String(e));
    }
  };

  // ---- materials ----
  const mats = board.materials[dj.id] || [];
  const ensureMats = async () => {
    if (!canEdit) return; // seeding the default checklist is a write
    if (mats.length || seededMat.current === dj.id) return;
    seededMat.current = dj.id;
    const recv = Math.round((MAT_ITEMS.length * (dj.kit || 0)) / 100);
    // one request instead of eight sequential round trips
    await api.post("/api/materials", {
      action: "seed",
      job_id: dj.id,
      items: MAT_ITEMS.map((item, i) => ({ item, qty: "as BOM", status: i < recv ? "Received" : "Pending" })),
    });
    await reload();
  };
  const setMatStatus = async (id: string, status: string, item: string) => { await api.post("/api/materials", { action: "status", id, status }); pushERP("Job Material", dj.id, "status", item + " → " + status); await reload(); };
  const delMat = async (id: string) => { await api.post("/api/materials", { action: "delete", id }); await reload(); };
  const addMat = async () => { if (!matForm.item.trim()) return; await api.post("/api/materials", { action: "add", job_id: dj.id, item: matForm.item.trim(), qty: matForm.qty || "as BOM", custom: true }); setMatForm({ item: "", qty: "" }); await reload(); };

  // ---- tasks for this job (memoised above the guard — see jobTasks/jobCats) ----
  const submitTask = async () => { if (!form.t.trim()) return; await api.post("/api/tasks", { action: "create", job_id: dj.id, title: form.t.trim(), who: form.who, due: form.due, cat: form.cat, esc: form.esc }); setForm({ t: "", who: "", due: TODAY, cat: form.cat, esc: "None" }); setAddingTask(null); await reload(); };
  const deleteJobTask = async (t: Task) => {
    const warn = t.kind === "erp"
      ? "\n\n⚠ From the ERP ToDo list — the next upload will bring it back unless it is closed in the ERP."
      : "";
    if (!window.confirm(`Delete "${t.t}"?${warn}\n\nThis cannot be undone.`)) return;
    try { await api.post("/api/tasks", { action: "delete", id: t.id, kind: t.kind }); await reload(); }
    catch (e) { alert(e instanceof Error ? e.message : String(e)); }
  };

  const matVal = dj.val * (1 - (dj.tpp || 0) / 100);
  const recvN = mats.filter((m) => m.status === "Received").length;

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {/* search + Project Owner filter narrow the dropdown; the dropdown stays the picker */}
        <div className="relative">
          <input
            value={planQ}
            onChange={(e) => setPlanQ(e.target.value)}
            placeholder="🔍 Search job no, tag, customer…"
            className="px-2 py-1.5 rounded border text-sm"
            style={{ borderColor: planQ ? "#E8600A" : "#D9D6CD", minWidth: 220 }}
          />
          {planQ && <button onClick={() => setPlanQ("")} className="absolute right-2 top-1.5 font-bold" style={{ color: "#E8600A" }} title="Clear search">✕</button>}
        </div>
        <select value={planPO} onChange={(e) => setPlanPO(e.target.value)} className="px-2 py-1.5 rounded border text-sm font-semibold" style={{ borderColor: planPO === "all" ? "#D9D6CD" : "#E8600A", background: planPO === "all" ? "#fff" : "#FFF3E8", color: planPO === "all" ? "#22303C" : "#E8600A" }} title="Only this Project Owner's jobs in the dropdown">
          <option value="all">All project owners</option>
          {(board.projectOwners || []).map((p) => (<option key={p.initials!} value={p.initials!}>{personLabel(p)}</option>))}
        </select>
        <select value={dj.id} onChange={(e) => setActiveId(e.target.value)} className="px-2 py-1.5 rounded border bg-white text-sm font-semibold" style={{ borderColor: "#D9D6CD", maxWidth: 420 }}>
          {/* keep the open job selectable even when the filter excludes it, so the select never goes blank */}
          {!pickerJobs.some((j) => j.id === dj.id) && !board.archived[dj.id] && (
            <option value={dj.id}>{jobNo(dj.id)} · {dj.tag} (outside filter)</option>
          )}
          {pickerJobs.map((j) => (<option key={j.id} value={j.id}>{jobNo(j.id)} · {j.tag}</option>))}
          {Object.keys(board.archived).length > 0 && (
            <optgroup label="— delivered / no longer in the export (plans archived) —">
              {Object.values(board.archived).map((j) => (<option key={j.id} value={j.id}>✓ {jobNo(j.id)} · {j.tag}</option>))}
            </optgroup>
          )}
        </select>
        <span className="text-xs" style={{ color: "#8A94A0" }}>
          {(planQ || planPO !== "all") ? `${pickerJobs.length} of ${byTDD.length} jobs match · ` : ""}
          {Object.keys(board.plans).length} of {board.jobs.length} jobs planned{canEdit ? " · edits auto-save" : ""}
        </span>
        {!canEdit && (
          <span className="text-xs font-bold rounded px-2 py-1" style={{ background: "#F4F2EC", color: "#8A94A0", border: "1px solid #D9D6CD" }} title="Only admins, planners and project owners can change plans">
            👁 View only — plans are edited by admins, planners &amp; project owners
          </span>
        )}
      </div>

      {/* header card */}
      <div className="bg-white rounded-lg p-3 mb-3 border" style={{ borderColor: "#E2E0DA", borderLeft: "5px solid #E8600A" }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-2xl font-bold" style={{ color: "#16232F" }}>JOB {jobNo(dj.id)}</span>
              <a href={erpJobLink(dj.id)} target="_blank" rel="noreferrer" className="text-xs underline" style={{ color: "#8A94A0" }}>{dj.id} ↗</a>
            </div>
            <div className="text-sm font-semibold" style={{ color: "#1B3A5C" }}>{dj.tag}</div>
            <div className="text-xs mt-0.5" style={{ color: "#8A94A0" }}>{dj.cust} · {dj.fam} · {V(dj.val)} · {dj.stat}</div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Chip label="TARGET DELIVERY (ERP)" value={fmtFull(dj.tdd)} color="#B3261E" />
            <Chip label="OTD DATE (ERP)" value={fmtFull(dj.otd) + (otdDelay(dj) ? ` · +${otdDelay(dj)}d late` : "")} color={otdColor(dj.otd)} />
            <div className="rounded px-2 py-1" style={{ background: isRaghu ? "#F3EEFB" : "#F4F2EC" }}>
              <div className="text-xs" style={{ color: "#8A94A0" }}>MGMT TARGET {isRaghu ? "✎" : "🔒"}</div>
              {isRaghu ? (
                <input type="date" value={dj.mgmt || ""} onChange={async (e) => { await api.post("/api/job-field", { job_id: dj.id, field: "mgmt", value: e.target.value }); pushERP("Jobmaster", dj.id, "mgmt", fmtFull(e.target.value)); await reload(); }} className="text-sm font-bold bg-transparent" style={{ color: "#7C3AED", border: "none" }} />
              ) : (<div className="text-sm font-bold" style={{ color: "#7C3AED" }}>{fmtFull(dj.mgmt)}</div>)}
            </div>
            <Chip label="PLAN END" value={fmtFull(ends)} color={ends > (dj.tdd || "9999") ? "#B3261E" : "#0D7A3F"} />
            <Chip label="TOTAL MAN-DAYS" value={grandTotal + " md"} color="#E8600A" />
            <Chip label="MILESTONES DONE" value={msDone + " / " + sched.length} color={allDone ? "#0D7A3F" : "#22303C"} />
            {baseline && baselineEnd && (
              <div className="rounded px-2 py-1" style={{ background: "#EFF6EF", border: "1px dashed #0D7A3F" }}>
                <div className="text-xs" style={{ color: "#8A94A0" }}>📌 BASELINE ({fmt(savedPlan?.baseline_on || null)})</div>
                <div className="text-sm font-bold" style={{ color: "#0D7A3F" }}>ends {fmtFull(baselineEnd)}{(() => { const d = diffDays(baselineEnd, ends); return d ? <span style={{ color: d > 0 ? "#B3261E" : "#0D7A3F" }}> · {d > 0 ? "+" : ""}{d}d now</span> : null; })()}</div>
              </div>
            )}
            {baseline && baselineEnd && allDone && (
              <div className="rounded px-2 py-1" style={{ background: "#F3EEFB", border: "1px solid #7C3AED" }}>
                <div className="text-xs font-bold" style={{ color: "#7C3AED" }}>PROPOSED vs REAL</div>
                <div className="text-sm font-bold">{fmt(baselineEnd)} → {fmt(realEnd || TODAY)} {(() => { const d = diffDays(baselineEnd, realEnd || TODAY); return <span style={{ color: d > 0 ? "#B3261E" : "#0D7A3F" }}>({d > 0 ? "+" : ""}{d}d)</span>; })()}</div>
              </div>
            )}
            {canEdit && (
              <button onClick={saveBaseline} className="rounded px-2 py-1 text-xs font-bold self-start" style={baseline ? { background: "#F4F2EC", color: "#0D7A3F", border: "1px solid #0D7A3F" } : { background: "#0D7A3F", color: "#fff" }}>📌 {baseline ? "Re-save Baseline" : "Save as Baseline"}</button>
            )}
            {/* the finish line: only offered once every milestone is ticked */}
            {canEdit && allDone && !isCompleted && (
              <button onClick={markCompleted} className="rounded px-2 py-1 text-xs font-bold self-start" style={{ background: "#16232F", color: "#7BC67E", border: "1px solid #0D7A3F" }} title="All milestones are done — mark the whole job completed">
                ✔ Mark job completed
              </button>
            )}
            {isCompleted && (
              <div className="rounded px-2 py-1 self-start" style={{ background: "#E6F4EA", border: "1px solid #0D7A3F" }}>
                <div className="text-xs font-bold" style={{ color: "#0D7A3F" }}>✔ COMPLETED</div>
                <div style={{ fontSize: 10, color: "#5A6672" }}>confirm in ERP so tomorrow&apos;s file agrees</div>
              </div>
            )}
          </div>
        </div>
        {dj.tdd && ends > dj.tdd && (
          <div className="mt-2 text-xs font-bold rounded px-2 py-1 inline-block" style={{ background: "#B3261E", color: "#fff" }}>⚠ Plan ends {diffDays(dj.tdd, ends)} days after Target Delivery — compress durations or add crew</div>
        )}
      </div>

      {/* plan / materials sub-tabs */}
      <div className="flex gap-1 rounded p-1 bg-white border mb-3" style={{ borderColor: "#E2E0DA", width: "fit-content" }}>
        {(["plan", "mat"] as const).map((k) => (
          <button key={k} onClick={() => { if (k === "mat") ensureMats(); setPlanView(k); }} className="px-3 py-1 rounded text-sm font-semibold" style={planView === k ? { background: "#22303C", color: "#fff" } : { color: "#5A6672" }}>{k === "plan" ? "Milestone Plan" : "Materials"}</button>
        ))}
      </div>

      {planView === "mat" && (
        <div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
            <Chip label="KITTING %" value={(dj.kit || 0) + "%"} color="#0D9488" />
            <Chip label="MATERIAL VALUE = val × (1−T%)" value={V(matVal)} />
            <Chip label="KITTED VALUE = val × (1−T%) × Kit%" value={V((matVal * (dj.kit || 0)) / 100)} color="#0D7A3F" />
            <Chip label="YET TO RECEIVE" value={V(matVal * (1 - (dj.kit || 0) / 100))} color="#B3261E" />
          </div>
          <div className="bg-white rounded-lg border overflow-x-auto" style={{ borderColor: "#E2E0DA" }}>
            <table className="w-full text-sm">
              <thead><tr style={{ background: "#22303C", color: "#fff" }} className="text-xs"><th className="px-3 py-2 text-left">#</th><th className="px-3 py-2 text-left">Material / kit item</th><th className="px-3 py-2 text-left">Qty</th><th className="px-3 py-2">Status ✎</th></tr></thead>
              <tbody>
                {mats.map((m, i) => (
                  <tr key={m.id} className="border-t" style={{ borderColor: "#EFEDE7", background: i % 2 ? "#FAF9F5" : "#fff" }}>
                    <td className="px-3 py-1.5" style={{ color: "#8A94A0" }}>{i + 1}</td>
                    <td className="px-3 py-1.5 font-medium">{m.item}{m.custom && <span title="Custom item added by you" style={{ color: "#E8600A" }}> ✎</span>}</td>
                    <td className="px-3 py-1.5" style={{ color: "#5A6672" }}>{m.qty}</td>
                    <td className="px-3 py-1.5 text-center">
                      <button onClick={() => canEdit && setMatStatus(m.id, m.status === "Received" ? "Pending" : "Received", m.item)} disabled={!canEdit} className="text-xs font-bold rounded px-2 py-0.5" style={{ ...(m.status === "Received" ? { background: "#E6F4EA", color: "#0D7A3F" } : { background: "#FBEDEA", color: "#B3261E" }), cursor: canEdit ? "pointer" : "default" }}>{m.status === "Received" ? "✓ Received" : "⏳ Yet to receive"}</button>
                      {canEdit && <button onClick={() => delMat(m.id)} title="Remove line" className="ml-1 text-xs" style={{ color: "#B3261E" }}>✕</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canEdit && (
            <div className="flex gap-1 mt-2 items-center flex-wrap">
              <input placeholder="Custom material / bought-out item…" value={matForm.item} onChange={(e) => setMatForm({ ...matForm, item: e.target.value })} className="text-xs border rounded px-2 py-1.5" style={{ borderColor: "#E2E0DA", minWidth: 240 }} />
              <input placeholder="Qty" value={matForm.qty} onChange={(e) => setMatForm({ ...matForm, qty: e.target.value })} className="text-xs border rounded px-2 py-1.5 w-24" style={{ borderColor: "#E2E0DA" }} />
              <button onClick={addMat} className="text-xs font-bold rounded px-3 py-1.5" style={{ background: "#E8600A", color: "#fff" }}>+ Add material</button>
            </div>
          )}
          <div className="text-xs mt-2" style={{ color: "#8A94A0" }}>{recvN}/{mats.length} kit items received (checklist tracker only — the boards use Kitting % in Σ val × (1−T%) × Kit%). Rows marked ✎ are custom items you added.</div>
        </div>
      )}

      {planView === "plan" && (
        <>
          <div className="bg-white rounded-lg border overflow-x-auto" style={{ borderColor: "#E2E0DA" }}>
            {/* fieldset[disabled] greys every input, select, checkbox and button
                in the table at once for read-only roles; edit() is the actual
                enforcement, this is the honest UI for it */}
            <fieldset disabled={!canEdit} style={{ border: "none", margin: 0, padding: 0, opacity: canEdit ? 1 : 0.75 }}>
            <table className="w-full text-sm" style={{ minWidth: 1100 }}>
              <thead>
                <tr style={{ background: "#22303C", color: "#fff" }} className="text-xs">
                  <th className="px-2 py-2 text-center" title="Tick when done on the floor">✓</th>
                  <th className="px-2 py-2 text-left">#</th>
                  <th className="px-2 py-2 text-left" style={{ minWidth: 200 }}>{canEdit ? "Milestone (editable)" : "Milestone"}</th>
                  <th className="px-2 py-2">Pred(s)</th>
                  <th className="px-2 py-2">Succ</th>
                  <th className="px-2 py-2">Start</th>
                  <th className="px-2 py-2">Days</th>
                  <th className="px-2 py-2">End</th>
                  <th className="px-2 py-2">Shift</th>
                  {TRADES.map((t) => (<th key={t.key} className="px-1 py-2" title={t.label + " per day"}><span style={{ color: t.color, filter: "brightness(1.7)" }}>{t.tiny}</span></th>))}
                  <th className="px-2 py-2">MD</th>
                  <th className="px-1 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {sched.map((m, i) => (
                  <tr key={i} className="border-t" onDragOver={(e) => e.preventDefault()} onDrop={() => { moveMilestoneTo(dragMi, i); setDragMi(null); }} style={{ borderColor: "#EFEDE7", background: dragMi === i ? "#FFF3E8" : i % 2 ? "#FAF9F5" : "#fff" }}>
                    <td className="px-2 py-1 text-center"><input type="checkbox" checked={!!m.done} onChange={() => { toggleMsDone(i); pushERP("Job Plan", dj.id, "milestone_" + m.idx + "_done", !m.done ? "completed " + fmtFull(TODAY) : "re-opened"); }} title={m.done ? "Completed " + fmtFull(m.done_on || "") : "Mark milestone complete"} style={{ accentColor: "#0D7A3F", width: 15, height: 15, cursor: "pointer" }} /></td>
                    <td className="px-2 py-1 font-bold whitespace-nowrap" style={{ color: "#E8600A", textDecoration: m.done ? "line-through" : "none", opacity: m.done ? 0.6 : 1 }}><span draggable onDragStart={() => setDragMi(i)} title="Drag to reorder" style={{ cursor: "grab", color: "#B8B5AC" }}>⠿ </span>{m.idx}</td>
                    <td className="px-2 py-1"><input value={m.name} onChange={(e) => setMilestone(i, { name: e.target.value })} className="w-full px-1 py-0.5 rounded border bg-transparent" style={{ borderColor: "transparent" }} onFocus={(e) => (e.target.style.borderColor = "#E8600A")} onBlur={(e) => (e.target.style.borderColor = "transparent")} /></td>
                    <td className="px-1 py-1 text-center">
                      <div className="flex flex-wrap gap-0.5 justify-center items-center" style={{ maxWidth: 92 }}>
                        {(m.preds || []).map((p) => (<button key={p} onClick={() => togglePred(i, p)} title={`Remove predecessor ${p}`} className="text-xs rounded px-1 font-bold" style={{ background: "#DCE8F5", color: "#1B3A5C" }}>{p}×</button>))}
                        {i > 0 && (
                          <select value="" onChange={(e) => { const v = parseInt(e.target.value, 10); if (v) togglePred(i, v); }} className="rounded border bg-white text-xs" style={{ borderColor: "#E2E0DA", width: 30 }} title="Add predecessor">
                            <option value="">+</option>
                            {sched.slice(0, i).filter((p) => !(m.preds || []).includes(p.idx)).map((p) => (<option key={p.idx} value={p.idx}>{p.idx}</option>))}
                          </select>
                        )}
                      </div>
                    </td>
                    <td className="px-1 py-1 text-center text-xs" style={{ color: "#8A94A0" }}>{(successors[m.idx] || []).join(",") || "—"}</td>
                    <td className="px-1 py-1 text-center whitespace-nowrap tnum">{(m.preds || []).length > 0 ? (<span title="Auto: latest predecessor end + 1">{fmt(m.start)}</span>) : (<input type="date" value={m.start} onChange={(e) => setMilestone(i, { offset: diffDays(draft.start, e.target.value) })} className="text-xs border rounded px-1 bg-white" style={{ borderColor: "#E2E0DA" }} />)}</td>
                    <td className="px-1 py-1 text-center"><input type="number" min={1} value={m.days} onChange={(e) => setMilestone(i, { days: Math.max(1, parseInt(e.target.value || "1", 10)) })} className="w-12 text-center rounded border py-0.5 tnum" style={{ borderColor: "#E2E0DA" }} /></td>
                    <td className="px-1 py-1 text-center font-semibold whitespace-nowrap tnum" style={{ color: "#1B3A5C" }}>{fmt(m.end)}</td>
                    <td className="px-1 py-1 text-center"><select value={m.shift || "D"} onChange={(e) => setMilestone(i, { shift: e.target.value })} className="rounded border bg-white text-xs px-0.5 py-0.5" style={{ borderColor: "#E2E0DA" }} title="Which shift works this milestone"><option value="D">☀ Day</option><option value="N">☾ Night</option><option value="DN">☀+☾</option></select></td>
                    {TRADES.map((t) => (<td key={t.key} className="px-0.5 py-1 text-center"><CrewCell value={m.crew[t.key] || 0} color={t.color} onChange={(v) => setCrewVal(i, t.key as keyof Crew, v)} /></td>))}
                    <td className="px-2 py-1 text-center font-bold tnum">{manDays(m) || "—"}</td>
                    <td className="px-1 py-1 text-center whitespace-nowrap">
                      <button onClick={() => moveMilestone(i, -1)} title="Move up" className="text-xs px-0.5" style={{ color: i === 0 ? "#D5D2C9" : "#1B3A5C" }}>▲</button>
                      <button onClick={() => moveMilestone(i, 1)} title="Move down" className="text-xs px-0.5" style={{ color: i === sched.length - 1 ? "#D5D2C9" : "#1B3A5C" }}>▼</button>
                      <button onClick={() => removeMilestone(i)} className="text-xs px-0.5" style={{ color: "#B3261E" }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: "#F2EFE6", borderTop: "2px solid #22303C" }} className="font-bold text-sm">
                  <td colSpan={8} className="px-2 py-2 text-right">Total man-days by trade →</td>
                  {TRADES.map((t) => (<td key={t.key} className="text-center tnum" style={{ color: t.color }}>{tradeTotals[t.key]}</td>))}
                  <td className="text-center" style={{ color: "#E8600A" }}>{grandTotal}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
            </fieldset>
          </div>
          <div className="flex items-center justify-between mt-2 flex-wrap gap-2">
            {canEdit ? (
              <div className="flex gap-2">
                <button onClick={addMilestone} disabled={draft.milestones.length >= 50} className="px-3 py-1.5 rounded font-semibold text-sm" style={{ background: draft.milestones.length >= 50 ? "#D9D6CD" : "#22303C", color: "#fff" }}>+ Add milestone ({draft.milestones.length}/50)</button>
                <button onClick={reloadDefault} className="px-3 py-1.5 rounded font-semibold text-sm border" style={{ borderColor: "#22303C", color: "#22303C" }}>↺ Reload {dj.fam} default</button>
                <select
                  value={applyTplName}
                  onChange={(e) => { setApplyTplName(e.target.value); applyTemplate(e.target.value); }}
                  className="px-2 py-1.5 rounded font-semibold text-sm border bg-white"
                  style={{ borderColor: "#22303C", color: "#22303C" }}
                  title="Replace this job's milestones with a saved template, regardless of its product family"
                >
                  <option value="">⇄ Apply template…</option>
                  {templateNames.map((t) => (<option key={t} value={t}>{t}</option>))}
                </select>
                <button onClick={savePlanNow} className="px-3 py-1.5 rounded font-semibold text-sm" style={{ background: "#E8600A", color: "#fff" }}>💾 Save now</button>
              </div>
            ) : (
              <div className="text-xs font-semibold" style={{ color: "#8A94A0" }}>👁 View only — ask an admin, planner or project owner to change this plan</div>
            )}
            <div className="text-xs" style={{ color: "#8A94A0" }}>Crew = men per day · MD = crew × duration</div>
          </div>

          {/* mini gantt */}
          <div className="bg-white rounded-lg border mt-3 p-3 overflow-x-auto" style={{ borderColor: "#E2E0DA" }}>
            <div className="text-xs font-bold mb-1" style={{ color: "#8A94A0" }}>JOB GANTT <span className="font-normal">· week gridlines · red line = Target Delivery</span></div>
            {dj.tdd && draft.start > dj.tdd && (
              <div className="text-xs font-bold rounded px-2 py-1 mb-2 inline-block" style={{ background: "#B3261E", color: "#fff" }}>
                ⚠ Target Delivery {fmtFull(dj.tdd)} is before this plan starts ({fmtFull(draft.start)}) — the red line is pinned to the left edge
              </div>
            )}
            {(() => {
              const gEnd = dj.tdd && dj.tdd > ends ? dj.tdd : ends;
              const total = diffDays(draft.start, gEnd) + 1;
              // Raw position can fall outside 0–100 when the Target Delivery Date
              // is before the plan start (an already-late job). Clamp it to the
              // track, and flag it, so the marker can never escape into the labels.
              const tddRaw = dj.tdd ? (diffDays(draft.start, dj.tdd) / total) * 100 : null;
              const tddPos = tddRaw === null ? null : Math.max(0, Math.min(99.6, tddRaw));
              const tddBefore = tddRaw !== null && tddRaw < 0;
              const ticks: { pct: number; wk: number }[] = [];
              for (let d = 0; d < total; d++) { const iso = addDays(draft.start, d); if (parseISO(iso).getUTCDay() === 1) ticks.push({ pct: (d / total) * 100, wk: isoWeek(iso) }); }
              return (
                <div style={{ width: Math.max(620, total * 5), minWidth: 620 }}>
                  <div className="flex items-center gap-2 mb-1"><div style={{ width: 175 }} /><div className="flex-1 relative" style={{ height: 14 }}>{ticks.map((t, k) => (<span key={k} className="absolute text-xs font-bold" style={{ left: t.pct + "%", color: "#B8B5AC", fontSize: 9, transform: "translateX(2px)" }}>W{t.wk}</span>))}</div></div>
                  {sched.map((m, i) => {
                    const l = (diffDays(draft.start, m.start) / total) * 100;
                    const w = (Math.max(1, m.days) / total) * 100;
                    return (
                      <div key={i} className="flex items-center gap-2 mb-1">
                        <div className="text-xs truncate" style={{ width: 175, color: "#5A6672" }}>{m.idx}. {m.name}</div>
                        {/* overflow:hidden keeps every marker inside its own track */}
                        <div className="flex-1 h-4 rounded relative" style={{ background: "#F4F2EC", overflow: "hidden" }}>
                          {ticks.map((t, k) => (<div key={k} className="absolute h-4" style={{ left: t.pct + "%", width: 1, background: "#DDDACF" }} />))}
                          <div className="absolute h-4 rounded" title={`${fmt(m.start)} → ${fmt(m.end)}`} style={{ left: Math.max(0, l) + "%", width: Math.max(w, 0.8) + "%", background: manDays(m) ? "#1B3A5C" : "#A8B4C0" }} />
                          {tddPos !== null && (
                            <div
                              className="absolute h-4"
                              title={tddBefore ? `Target Delivery ${fmtFull(dj.tdd)} — before the plan even starts` : `Target Delivery ${fmtFull(dj.tdd)}`}
                              style={{ left: tddPos + "%", width: 2, background: "#B3261E", opacity: tddBefore ? 0.55 : 1 }}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* pending tasks & milestones kanban */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <h2 className="font-bold" style={{ color: "#16232F" }}>Pending Tasks &amp; Milestones — JOB {jobNo(dj.id)} <span className="font-normal text-xs" style={{ color: "#8A94A0" }}>ERP ToDo + open milestones · headed by Category</span></h2>
              <button onClick={() => { setAddingTask(dj.id); setForm((f) => ({ ...f, cat: jobCats[0] || "Production" })); }} className="px-3 py-1 rounded text-sm font-bold" style={{ background: "#E8600A", color: "#fff" }}>+ Task</button>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 items-start">
              {(() => {
                const open = sched.filter((m) => !m.done);
                const doneMs = sched.filter((m) => m.done);
                const card = (m: typeof sched[number]) => (
                  <TaskCard key={"ms" + m.idx} onOpen={() => {}} t={{ id: "ms" + m.idx, kind: "manual", done: !!m.done, j: dj.id, t: `M${m.idx} · ${m.name}`, d: `${fmt(m.start)} → ${fmt(m.end)} · ${manDays(m)} man-days`, who: dj.own || "plan", due: m.end, cat: "Milestone", esc: "None", comments: 0 }} />
                );
                return (
                  <div className="rounded-lg p-2" style={{ background: "#DDE6EE", minWidth: 230, maxWidth: 260, border: "1px solid #B9C7D4" }}>
                    <div className="text-xs font-bold px-1 pb-1.5 flex justify-between" style={{ color: "#1B3A5C" }}><span>⚑ MILESTONES</span><span style={{ color: "#8A94A0" }}>{open.length} pending · {doneMs.length} done</span></div>
                    {open.map((m) => card(m))}
                    {open.length === 0 && sched.length > 0 && (<div className="text-xs text-center rounded py-1 my-1 font-bold" style={{ background: "#E6F4EA", color: "#0D7A3F" }}>All milestones checked off ✓</div>)}
                    {doneMs.length > 0 && (<button onClick={() => setShowPastMs(!showPastMs)} className="w-full text-xs font-bold rounded border border-dashed py-1 my-1" style={{ borderColor: "#8FA1B3", color: "#0D7A3F" }}>{showPastMs ? "▴ hide" : "▾ show"} {doneMs.length} completed ✓</button>)}
                    {showPastMs && doneMs.map((m) => card(m))}
                    {canEdit && msForm.open && (
                      <div className="rounded border p-2 mt-1 bg-white" style={{ borderColor: "#1B3A5C" }}>
                        <input autoFocus placeholder="New milestone…" value={msForm.name} onChange={(e) => setMsForm({ ...msForm, name: e.target.value })} className="w-full text-xs border rounded px-1 py-1 mb-1" style={{ borderColor: "#E2E0DA" }} />
                        <div className="flex gap-1 items-center">
                          <input type="number" min={1} value={msForm.days} onChange={(e) => setMsForm({ ...msForm, days: parseInt(e.target.value || "1", 10) })} className="w-14 text-xs border rounded px-1 py-1" style={{ borderColor: "#E2E0DA" }} />
                          <span className="text-xs" style={{ color: "#8A94A0" }}>days</span>
                          <button onClick={() => { addMilestoneNamed(msForm.name, msForm.days); setMsForm({ open: false, name: "", days: 3 }); }} className="text-xs font-bold rounded px-2 py-1" style={{ background: "#1B3A5C", color: "#fff" }}>Add</button>
                          <button onClick={() => setMsForm({ open: false, name: "", days: 3 })} className="text-xs rounded px-1" style={{ color: "#8A94A0" }}>✕</button>
                        </div>
                      </div>
                    )}
                    {canEdit && !msForm.open && (<button onClick={() => setMsForm({ open: true, name: "", days: 3 })} className="w-full text-xs font-bold rounded py-1 mt-1" style={{ background: "#1B3A5C", color: "#fff" }}>+ Milestone</button>)}
                  </div>
                );
              })()}
              {(jobCats.length ? jobCats : addingTask === dj.id ? [form.cat] : []).map((cat) => (
                <div key={cat} className="rounded-lg p-2" style={{ background: "#E9E6DD", minWidth: 230, maxWidth: 260 }}>
                  <div className="text-xs font-bold px-1 pb-1.5 flex justify-between" style={{ color: "#16232F" }}><span>{cat.toUpperCase()}</span><span style={{ color: "#8A94A0" }}>{jobTasks.filter((t) => t.cat === cat && !t.done).length} open</span></div>
                  {jobTasks.filter((t) => t.cat === cat).sort((a, b) => ((a.due || "9999") < (b.due || "9999") ? -1 : 1)).map((t) => (<TaskCard key={t.id} onOpen={setLightbox} onDelete={deleteJobTask} t={t} />))}
                  {addingTask === dj.id && form.cat === cat && (<AddTaskForm owners={assignees(board)} form={form} setForm={setForm} onSubmit={submitTask} onCancel={() => setAddingTask(null)} />)}
                </div>
              ))}
              {addingTask === dj.id && jobCats.length > 0 && !jobCats.includes(form.cat) && (
                <div className="rounded-lg p-2" style={{ background: "#E9E6DD", minWidth: 230 }}>
                  <div className="text-xs font-bold px-1 pb-1.5">{form.cat.toUpperCase()}</div>
                  <AddTaskForm owners={assignees(board)} form={form} setForm={setForm} onSubmit={submitTask} onCancel={() => setAddingTask(null)} />
                </div>
              )}
            </div>
            {jobTasks.length === 0 && (<div className="text-xs mt-1" style={{ color: "#8A94A0" }}>No ERP ToDos linked yet — upload the ToDo Dashboard, or add a manual task with + Task.</div>)}
          </div>
        </>
      )}

      {lightbox && <TaskModal task={lightbox} owners={assignees(board)} onClose={() => setLightbox(null)} onToggle={async () => { await api.post("/api/tasks", { action: "toggle", id: lightbox.id, kind: lightbox.kind, done: !lightbox.done }); setLightbox(null); await reload(); }} reload={reload} />}

      {/* management date breach popup */}
      {dj.mgmt && ends > dj.mgmt && !warned.has(dj.id) && (
        <div className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(13,22,31,0.75)", zIndex: 60 }}>
          <div className="bg-white rounded-lg p-5 w-full" style={{ maxWidth: 460, borderTop: "5px solid #B3261E" }}>
            <div className="text-xs font-bold tracking-widest" style={{ color: "#B3261E" }}>⚠ MANAGEMENT TARGET BREACH</div>
            <div className="font-bold text-lg mt-1" style={{ color: "#16232F" }}>JOB {jobNo(dj.id)} · {dj.tag}</div>
            <div className="text-sm mt-2" style={{ color: "#5A6672" }}>The current milestone plan ends <b style={{ color: "#B3261E" }}>{fmtFull(ends)}</b> — that is <b>{diffDays(dj.mgmt, ends)} days beyond</b> the Management target of <b style={{ color: "#7C3AED" }}>{fmtFull(dj.mgmt)}</b>.</div>
            <div className="text-xs mt-2" style={{ color: "#8A94A0" }}>Compress durations, add crew, run parallel milestones — or escalate to raghu@nandan.co.in for a revised target.</div>
            <div className="flex gap-2 mt-4"><button onClick={() => setWarned((s) => new Set([...s, dj.id]))} className="flex-1 py-2 rounded font-bold text-sm" style={{ background: "#22303C", color: "#fff" }}>Acknowledge — I will re-plan</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

// task card used in the Job Plan kanban + Tasking board
function TaskCard({ t, onOpen, onDelete }: { t: Task; onOpen: (t: Task) => void; onDelete?: (t: Task) => void }) {
  return (
    <div onClick={() => onOpen(t)} className="rounded p-2 mb-1.5 cursor-pointer border relative group" style={{ ...dueStyle(t.done ? null : t.due), borderColor: "rgba(0,0,0,0.08)", opacity: t.done ? 0.45 : 1 }}>
      {onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(t); }}
          className="absolute rounded font-bold"
          style={{ top: 2, right: 3, width: 16, height: 16, lineHeight: "14px", fontSize: 11, background: "rgba(0,0,0,0.10)", color: "#B3261E" }}
          title="Delete this task"
        >
          ✕
        </button>
      )}
      <div className="text-xs font-semibold" style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden", textDecoration: t.done ? "line-through" : "none", paddingRight: onDelete ? 16 : 0 }}>{t.t}</div>
      <div className="flex items-center justify-between mt-1 text-xs" style={{ opacity: 0.85 }}>
        <span className="font-bold rounded px-1" style={{ background: "rgba(0,0,0,0.12)" }}>{t.who ? (t.who.length <= 3 ? t.who.toUpperCase() : initials(t.who)) : "—"}</span>
        {t.esc && t.esc !== "None" && (<span className="font-bold rounded px-1" style={{ background: "#B3261E", color: "#fff", fontSize: 9 }}>⚠ {t.esc.slice(0, 2)}</span>)}
        <span style={{ fontSize: 10 }}>{(t.cat || "").toLowerCase()}</span>
        <span className="tnum">{fmt(t.due)}</span>
      </div>
    </div>
  );
}

// ============================ Tasking ============================
function Tasking({ board, onOpen, reload }: { board: Board; onOpen: (id: string) => void; reload: () => Promise<Board | null> }) {
  const [filterCust, setFilterCust] = useState("all");
  const [filterFam, setFilterFam] = useState("all");
  const [filterOwn, setFilterOwn] = useState("all");
  const [taskAll, setTaskAll] = useState(false);
  const [taskView, setTaskView] = useState<"board" | "cal">("board");
  const [calMonth, setCalMonth] = useState(TODAY.slice(0, 7));
  const [adding, setAdding] = useState<string | null>(null);
  const [form, setForm] = useState({ t: "", who: "", due: TODAY, cat: "Production", esc: "None" });
  const [lightbox, setLightbox] = useState<Task | null>(null);

  const [dueUpTo, setDueUpTo] = useState("");

  const custs = useMemo(() => [...new Set(board.jobs.map((j) => j.cust))].sort(), [board]);
  const fams = useMemo(() => [...new Set(board.jobs.map((j) => j.fam))].sort(), [board]);
  const owners = board.owners;
  // "up to date" filter: only tasks due on/before the chosen date (blank = all)
  const filteredTasks = useMemo(
    () => board.tasks.filter((t) => !dueUpTo || ((t.due || "9999-12-31") <= dueUpTo)),
    [board, dueUpTo],
  );
  // group tasks by job once instead of scanning the whole task list per job
  const tasksByJob = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of filteredTasks) {
      const arr = m.get(t.j);
      if (arr) arr.push(t);
      else m.set(t.j, [t]);
    }
    // pre-sort each bucket by due date — the render used to sort on every pass
    for (const arr of m.values()) arr.sort((a, b) => ((a.due || "9999") < (b.due || "9999") ? -1 : 1));
    return m;
  }, [filteredTasks]);

  const taskingJobs = useMemo(() => {
    const withTasks = taskAll ? board.jobs : board.jobs.filter((j) => tasksByJob.has(j.id));
    return withTasks
      .filter((j) => (filterCust === "all" || j.cust === filterCust) && (filterFam === "all" || j.fam === filterFam) && (filterOwn === "all" || j.ownerInitials === filterOwn))
      .sort((a, b) => ((a.tdd || "9999") < (b.tdd || "9999") ? -1 : 1));
  }, [board.jobs, tasksByJob, filterCust, filterFam, filterOwn, taskAll]);

  // next upcoming crewed milestone per job — computeSchedule ran for every job
  // on every render (including every keystroke in a filter); now once per plan change
  const nextMilestone = useMemo(() => {
    const m = new Map<string, { idx: number; name: string; end: string }>();
    for (const [jobId, plan] of Object.entries(board.plans)) {
      if (!plan?.milestones?.length) continue;
      const nx = computeSchedule({ start: plan.start || TODAY, milestones: plan.milestones })
        .find((s) => s.end >= TODAY && manDays(s) > 0);
      if (nx) m.set(jobId, { idx: nx.idx, name: nx.name, end: nx.end });
    }
    return m;
  }, [board.plans]);

  const submit = async (jid: string) => {
    if (!form.t.trim()) return;
    await api.post("/api/tasks", { action: "create", job_id: jid, title: form.t.trim(), who: form.who, due: form.due, cat: form.cat, esc: form.esc });
    setForm({ t: "", who: "", due: TODAY, cat: form.cat, esc: "None" });
    setAdding(null);
    await reload();
  };
  const deleteTask = async (t: Task) => {
    const warn = t.kind === "erp"
      ? "\n\n⚠ From the ERP ToDo list — the next upload will bring it back unless it is closed in the ERP."
      : "";
    if (!window.confirm(`Delete "${t.t}"?${warn}\n\nThis cannot be undone.`)) return;
    try { await api.post("/api/tasks", { action: "delete", id: t.id, kind: t.kind }); await reload(); }
    catch (e) { alert(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select value={filterCust} onChange={(e) => setFilterCust(e.target.value)} className="px-2 py-1.5 rounded border bg-white text-sm" style={{ borderColor: "#D9D6CD", maxWidth: 240 }}>
          <option value="all">All customers</option>{custs.map((c) => (<option key={c}>{c}</option>))}
        </select>
        <select value={filterOwn} onChange={(e) => setFilterOwn(e.target.value)} className="px-2 py-1.5 rounded border bg-white text-sm" style={{ borderColor: "#D9D6CD" }} title="Filter by the job's Project Owner">
          <option value="all">All project owners</option>
          {(board.projectOwners || []).map((p) => (<option key={p.initials!} value={p.initials!}>{personLabel(p)}</option>))}
        </select>
        <select value={filterFam} onChange={(e) => setFilterFam(e.target.value)} className="px-2 py-1.5 rounded border bg-white text-sm" style={{ borderColor: "#D9D6CD" }}>
          <option value="all">All products</option>{fams.map((f) => (<option key={f}>{f}</option>))}
        </select>
        <label className="text-xs flex items-center gap-1 px-2 py-1.5 rounded border bg-white cursor-pointer" style={{ borderColor: "#D9D6CD", color: "#5A6672" }}>
          <input type="checkbox" checked={taskAll} onChange={(e) => setTaskAll(e.target.checked)} /> include jobs without tasks
        </label>
        <label className="text-xs flex items-center gap-1 px-2 py-1.5 rounded border bg-white" style={{ borderColor: "#D9D6CD", color: "#5A6672" }} title="Only show tasks due on or before this date">
          due up to
          <input type="date" value={dueUpTo} onChange={(e) => setDueUpTo(e.target.value)} className="text-xs border rounded px-1 py-0.5" style={{ borderColor: "#E2E0DA" }} />
          {dueUpTo && (<button onClick={() => setDueUpTo("")} className="font-bold" style={{ color: "#E8600A" }} title="Clear">✕</button>)}
        </label>
        <div className="flex gap-1 rounded p-1 bg-white border" style={{ borderColor: "#D9D6CD" }}>
          {(["board", "cal"] as const).map((k) => (<button key={k} onClick={() => setTaskView(k)} className="px-3 py-1 rounded text-sm font-semibold" style={taskView === k ? { background: "#22303C", color: "#fff" } : { color: "#5A6672" }}>{k === "board" ? "Board" : "📅 Calendar (ISO weeks)"}</button>))}
        </div>
      </div>

      {taskView === "board" && taskingJobs.length === 0 && (
        <div className="bg-white border rounded-lg p-6 text-center text-sm" style={{ borderColor: "#E2E0DA", color: "#8A94A0" }}>No jobs with open tasks match this filter — tick &quot;include jobs without tasks&quot; to board every job and add their first tasks here.</div>
      )}

      {taskView === "board" && (
        <div className="space-y-3">
          {taskingJobs.map((j) => {
            const jt = tasksByJob.get(j.id) ?? [];
            let open = 0;
            for (const t of jt) if (!t.done) open++;
            const nx = nextMilestone.get(j.id) ?? null;
            return (
              <div key={j.id} className="flex gap-2 items-stretch">
                {/* job card — fixed on the left */}
                <div className="rounded-lg p-2 flex-shrink-0" style={{ width: 250, background: "#16232F", color: "#fff", borderLeft: "4px solid #E8600A" }}>
                  {/* the customer tag is the identity people recognise; job no is the fine print */}
                  <div className="flex justify-between items-baseline gap-2">
                    <button onClick={() => onOpen(j.id)} className="font-bold text-sm underline decoration-dotted truncate text-left" style={{ color: "#F5B32B", maxWidth: 175 }} title={`${j.tag} · JOB ${jobNo(j.id)}`}>{j.tag}</button>
                    <span className="text-xs font-bold flex-shrink-0" style={{ color: open ? "#F5B32B" : "#7BC67E" }}>{open} open</span>
                  </div>
                  <div className="text-xs opacity-70">JOB {jobNo(j.id)} · TDD {fmt(j.tdd)}{j.own ? " · " + j.own : ""}</div>
                  <div className="text-xs opacity-70 truncate">{j.cust}</div>
                </div>
                {/* tasks — flow horizontally across the screen */}
                <div className="flex flex-wrap gap-1.5 flex-1 items-start rounded-lg p-2" style={{ background: "#E9E6DD" }}>
                  {nx && (
                    <div onClick={() => onOpen(j.id)} className="rounded p-2 cursor-pointer border" style={{ background: "#DDE6EE", borderColor: "#B9C7D4", width: 210 }}>
                      <div className="text-xs font-bold" style={{ color: "#1B3A5C" }}>⚑ Next milestone: M{nx.idx} {nx.name}</div>
                      <div className="text-xs flex justify-between mt-0.5" style={{ color: "#5A6672" }}><span>from the job plan</span><span className="tnum">{fmt(nx.end)}</span></div>
                    </div>
                  )}
                  {jt.map((t) => (<div key={t.id} style={{ width: 210 }}><TaskCard onOpen={setLightbox} onDelete={deleteTask} t={t} /></div>))}
                  {adding === j.id ? (
                    <div style={{ width: 240 }}><AddTaskForm form={form} setForm={setForm} owners={assignees(board)} onSubmit={() => submit(j.id)} onCancel={() => setAdding(null)} /></div>
                  ) : (
                    <button onClick={() => setAdding(j.id)} className="text-xs font-bold rounded border border-dashed px-3 self-stretch" style={{ borderColor: "#E8600A", color: "#E8600A", minHeight: 40 }}>+ Add task</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {taskView === "cal" && (() => {
        const [yy, mm] = calMonth.split("-").map(Number);
        const first = new Date(Date.UTC(yy, mm - 1, 1));
        const monStart = new Date(first); monStart.setUTCDate(monStart.getUTCDate() - ((monStart.getUTCDay() + 6) % 7));
        const lastD = new Date(Date.UTC(yy, mm, 0)); const sunEnd = new Date(lastD); sunEnd.setUTCDate(sunEnd.getUTCDate() + (6 - ((sunEnd.getUTCDay() + 6) % 7)));
        const days: string[] = []; for (let d = new Date(monStart); d <= sunEnd; d.setUTCDate(d.getUTCDate() + 1)) days.push(toISO(new Date(d)));
        const weeks: string[][] = []; for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
        const jset = new Set(taskingJobs.map((j) => j.id));
        const openT = filteredTasks.filter((t) => !t.done && t.due && jset.has(t.j));
        const byDay: Record<string, Task[]> = {}; openT.forEach((t) => (byDay[t.due!] = byDay[t.due!] || []).push(t));
        const overdue = openT.filter((t) => t.due! < TODAY);
        const monthLabel = first.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
        const shiftMonth = (d: number) => setCalMonth(toISO(new Date(Date.UTC(yy, mm - 1 + d, 1))).slice(0, 7));
        return (
          <div className="bg-white rounded-lg border p-3" style={{ borderColor: "#E2E0DA" }}>
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <button onClick={() => shiftMonth(-1)} className="px-3 py-1 rounded font-bold text-sm" style={{ background: "#F4F2EC", color: "#22303C" }}>◀</button>
              <div className="font-bold text-center" style={{ color: "#16232F" }}>{monthLabel} <span className="text-xs font-normal" style={{ color: "#8A94A0" }}>· open tasks on their due dates · respects the filters above</span></div>
              <div className="flex gap-1"><button onClick={() => setCalMonth(TODAY.slice(0, 7))} className="px-2 py-1 rounded text-xs font-bold" style={{ background: "#E8600A", color: "#fff" }}>Today</button><button onClick={() => shiftMonth(1)} className="px-3 py-1 rounded font-bold text-sm" style={{ background: "#F4F2EC", color: "#22303C" }}>▶</button></div>
            </div>
            {overdue.length > 0 && (<div className="text-xs font-bold rounded px-2 py-1 mb-2 inline-block" style={{ background: "#B3261E", color: "#fff" }}>⚠ {overdue.length} overdue task{overdue.length === 1 ? "" : "s"} — red chips on their original due dates</div>)}
            <table className="w-full text-xs" style={{ borderCollapse: "collapse", tableLayout: "fixed" }}>
              <thead><tr style={{ background: "#22303C", color: "#fff" }}><th className="px-1 py-1.5" style={{ width: 58 }}>ISO Wk</th>{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (<th key={d} className="px-1 py-1.5">{d}</th>))}</tr></thead>
              <tbody>
                {weeks.map((wk) => {
                  const wkCount = wk.reduce((n, d) => n + (byDay[d] || []).length, 0);
                  return (
                    <tr key={wk[0]} className="border-t align-top" style={{ borderColor: "#EFEDE7" }}>
                      <td className="px-1 py-1 font-bold text-center" style={{ background: wk[0] <= TODAY && TODAY <= wk[6] ? "#FFF3E8" : "#F4F2EC", color: "#1B3A5C" }}>W{isoWeek(wk[0])}{wkCount > 0 && (<div className="font-normal" style={{ color: "#8A94A0", fontSize: 9 }}>{wkCount} task{wkCount === 1 ? "" : "s"}</div>)}</td>
                      {wk.map((d) => {
                        const inM = d.slice(0, 7) === calMonth;
                        const list = byDay[d] || [];
                        return (
                          <td key={d} className="px-1 py-1 border-l" style={{ borderColor: "#EFEDE7", background: d === TODAY ? "#FFF3E8" : inM ? "#fff" : "#FAF9F5", opacity: inM ? 1 : 0.55, height: 64 }}>
                            <div className="font-bold tnum" style={{ color: d === TODAY ? "#E8600A" : "#8A94A0" }}>{parseInt(d.slice(8), 10)}{d === TODAY ? " · today" : ""}</div>
                            {list.map((t) => (
                              <div key={t.id} onClick={() => setLightbox(t)} title={"JOB " + jobNo(t.j) + " · " + t.t + " · " + (t.who || "unassigned")} className="rounded px-1 py-0.5 mb-0.5 cursor-pointer font-semibold" style={{ background: t.due! < TODAY ? "#B3261E" : t.due === TODAY ? "#fff" : "#DCE8F5", color: t.due! < TODAY ? "#fff" : "#1B3A5C", border: t.due === TODAY ? "1px solid #22303C" : "none", fontSize: 9, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{jobNo(t.j)} · {initials(t.who)} · {t.t}</div>
                            ))}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="text-xs mt-2" style={{ color: "#8A94A0" }}>Tap a chip to open the task (mark done, comment) · red = overdue · white outline = due today</div>
          </div>
        );
      })()}

      {lightbox && <TaskModal task={lightbox} owners={assignees(board)} onClose={() => setLightbox(null)} onToggle={async () => { await api.post("/api/tasks", { action: "toggle", id: lightbox.id, kind: lightbox.kind, done: !lightbox.done }); setLightbox(null); await reload(); }} reload={reload} />}
    </div>
  );
}

type Assignee = { value: string; label: string; group: string };

/** <option>s grouped by Users / Project Owners, plus the current value if it's
 *  an orphan (e.g. legacy ERP text on an imported task). */
function AssigneeOptions({ owners, current }: { owners: Assignee[]; current?: string }) {
  const orphan = current && !owners.some((o) => o.value === current);
  // keep the declared order, but never drop a group we don't know about
  const groups = [...new Set([...GROUP_ORDER, ...owners.map((o) => o.group)])];
  return (
    <>
      {orphan && <option value={current}>{current} (not a user)</option>}
      {groups.map((g) => {
        const items = owners.filter((o) => o.group === g);
        if (!items.length) return null;
        return (
          <optgroup key={g} label={g}>
            {items.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
          </optgroup>
        );
      })}
    </>
  );
}

function AddTaskForm({ form, setForm, owners, onSubmit, onCancel }: { form: any; setForm: (f: any) => void; owners: Assignee[]; onSubmit: () => void; onCancel: () => void }) {
  return (
    <div className="rounded border p-2 mt-1 bg-white" style={{ borderColor: "#E8600A" }}>
      <input autoFocus placeholder="Task…" value={form.t} onChange={(e) => setForm({ ...form, t: e.target.value })} className="w-full text-xs border rounded px-1 py-1 mb-1" style={{ borderColor: "#E2E0DA" }} />
      <div className="flex gap-1 mb-1">
        <select value={form.who} onChange={(e) => setForm({ ...form, who: e.target.value })} className="w-1/2 text-xs border rounded px-1 py-1 bg-white" style={{ borderColor: "#E2E0DA" }} title="Assign to a user — the list comes from created accounts">
          <option value="">Who?</option>
          <AssigneeOptions owners={owners} current={form.who} />
        </select>
        <input type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} className="w-1/2 text-xs border rounded px-1 py-1" style={{ borderColor: "#E2E0DA" }} />
      </div>
      <div className="mb-1">
        <div className="text-xs mb-0.5" style={{ color: "#8A94A0" }}>Escalation Log</div>
        <select value={form.esc} onChange={(e) => setForm({ ...form, esc: e.target.value })} className="w-full text-xs border rounded px-1 py-1 bg-white" style={{ borderColor: "#E2E0DA" }}>
          {ESC_LEVELS.map((c) => (<option key={c}>{c}</option>))}
        </select>
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

function TaskModal({ task, owners = [], onClose, onToggle, reload }: { task: Task; owners?: Assignee[]; onClose: () => void; onToggle: () => void; reload: () => Promise<Board | null> }) {
  const [comments, setComments] = useState<{ by: string; at: string; body: string }[]>([]);
  const [cmt, setCmt] = useState("");
  const [editing, setEditing] = useState(false);
  const [ef, setEf] = useState({ t: task.t || "", d: task.d || "", who: task.who || "", due: task.due || "", cat: task.cat || "Production", esc: task.esc || "None" });
  const isMs = String(task.id).startsWith("ms"); // milestone pseudo-card from the Job Plan kanban
  useEffect(() => {
    if (isMs) return;
    api.get(`/api/comments?task_id=${task.id}&task_kind=${task.kind}`).then((r) => setComments(r.comments)).catch(() => {});
  }, [task, isMs]);
  const add = async () => {
    if (!cmt.trim()) return;
    await api.post("/api/comments", { task_id: task.id, task_kind: task.kind, body: cmt.trim() });
    setCmt("");
    const r = await api.get(`/api/comments?task_id=${task.id}&task_kind=${task.kind}`);
    setComments(r.comments);
    await reload();
  };
  const saveEdit = async () => {
    if (!ef.t.trim()) return;
    await api.post("/api/tasks", { action: "update", id: task.id, kind: task.kind, title: ef.t.trim(), detail: ef.d, who: ef.who, due: ef.due || null, cat: ef.cat, esc: ef.esc });
    await reload();
    onClose();
  };
  const remove = async () => {
    const warn =
      task.kind === "erp"
        ? "\n\n⚠ This task came from the ERP ToDo list. Deleting it here removes it now, but the next ToDo upload will bring it back unless it is also closed in the ERP."
        : "";
    if (!window.confirm(`Delete this task?\n\n"${task.t}"${warn}\n\nIts comments are deleted too. This cannot be undone.`)) return;
    try {
      await api.post("/api/tasks", { action: "delete", id: task.id, kind: task.kind });
      await reload();
      onClose();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <div onClick={onClose} className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)", zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg p-4 w-full max-w-md" style={{ maxHeight: "80vh", overflow: "auto" }}>
        <div className="flex items-start justify-between gap-2">
          {editing ? (
            <input autoFocus value={ef.t} onChange={(e) => setEf({ ...ef, t: e.target.value })} className="flex-1 text-sm font-bold border rounded px-2 py-1" style={{ borderColor: "#E8600A" }} />
          ) : (
            <div className="font-bold text-sm">{task.t}</div>
          )}
          <button onClick={onClose} style={{ color: "#8A94A0" }}>✕</button>
        </div>

        {isMs ? (
          <>
            {task.d && <div className="text-xs mt-2" style={{ color: "#5A6672" }}>{task.d}</div>}
            <div className="text-xs mt-3 rounded p-2" style={{ background: "#DDE6EE", color: "#1B3A5C" }}>⚑ This is a plan milestone — edit its name, dates, crew or tick it done in the Milestone table above.</div>
          </>
        ) : editing ? (
          <div className="mt-2 space-y-1.5">
            <textarea value={ef.d} onChange={(e) => setEf({ ...ef, d: e.target.value })} placeholder="Details…" rows={2} className="w-full text-xs border rounded px-2 py-1" style={{ borderColor: "#E2E0DA" }} />
            <div className="flex gap-1">
              <select value={ef.who} onChange={(e) => setEf({ ...ef, who: e.target.value })} className="w-1/2 text-xs border rounded px-1 py-1 bg-white" style={{ borderColor: "#E2E0DA" }} title="Assign to a user — the list comes from created accounts">
                <option value="">Who?</option>
                <AssigneeOptions owners={owners} current={ef.who} />
              </select>
              <input type="date" value={ef.due} onChange={(e) => setEf({ ...ef, due: e.target.value })} className="w-1/2 text-xs border rounded px-1 py-1" style={{ borderColor: "#E2E0DA" }} />
            </div>
            <div className="flex gap-1">
              <select value={ef.cat} onChange={(e) => setEf({ ...ef, cat: e.target.value })} className="w-1/2 text-xs border rounded px-1 py-1 bg-white" style={{ borderColor: "#E2E0DA" }}>
                {!TASK_CATS.includes(ef.cat) && ef.cat && <option value={ef.cat}>{ef.cat}</option>}
                {TASK_CATS.map((c) => (<option key={c}>{c}</option>))}
              </select>
              <select value={ef.esc} onChange={(e) => setEf({ ...ef, esc: e.target.value })} className="w-1/2 text-xs border rounded px-1 py-1 bg-white" style={{ borderColor: "#E2E0DA" }} title="Escalation Log">
                {ESC_LEVELS.map((c) => (<option key={c}>{c}</option>))}
              </select>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={saveEdit} className="flex-1 text-xs font-bold rounded py-1.5" style={{ background: "#E8600A", color: "#fff" }}>💾 Save changes</button>
              <button onClick={() => setEditing(false)} className="text-xs rounded px-3" style={{ color: "#8A94A0" }}>Cancel</button>
            </div>
          </div>
        ) : (
          <>
            {task.d && <div className="text-xs mt-2" style={{ color: "#5A6672" }}>{task.d}</div>}
            {task.esc && task.esc !== "None" && (
              <div className="text-xs mt-2 font-bold rounded px-2 py-1 inline-block" style={{ background: "#B3261E", color: "#fff" }}>⚠ Escalation: {task.esc}</div>
            )}
            <div className="flex items-center gap-2 mt-2 text-xs" style={{ color: "#8A94A0" }}>
              <span>{initials(task.who)}</span><span>{task.cat}</span><span className="tnum">{fmt(task.due)}</span>
              <button onClick={() => setEditing(true)} className="ml-auto rounded px-2 py-1 font-bold" style={{ background: "#DCE8F5", color: "#1B3A5C" }}>✎ Edit</button>
              <button onClick={onToggle} className="rounded px-2 py-1 font-bold" style={{ background: task.done ? "#E7E4DC" : "#0D7A3F", color: task.done ? "#5A6672" : "#fff" }}>{task.done ? "Reopen" : "✓ Done"}</button>
              <button onClick={remove} className="rounded px-2 py-1 font-bold" style={{ background: "#FBEDEA", color: "#B3261E" }} title="Delete this task">🗑</button>
            </div>
          </>
        )}

        {!isMs && (
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
        )}
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
function AdminTabs({ tab, setTab }: { tab: "setup" | "updates"; setTab: (t: "setup" | "updates") => void }) {
  return (
    <div className="flex gap-1 rounded p-1 bg-white border" style={{ borderColor: "#E2E0DA", width: "fit-content" }}>
      {([["setup", "⚙ Settings & Users"], ["updates", "🗒 Updates"]] as const).map(([k, l]) => (
        <button
          key={k}
          onClick={() => setTab(k)}
          className="px-3 py-1 rounded text-sm font-semibold"
          style={tab === k ? { background: "#22303C", color: "#fff" } : { color: "#5A6672" }}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

/**
 * The release log. Reads src/lib/changelog.ts, so the version badge in the
 * header and this page can never disagree — they are the same list.
 */
function Updates() {
  return (
    <div className="bg-white rounded-lg border p-3" style={{ borderColor: "#E2E0DA" }}>
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-1">
        <div className="font-bold text-sm">What&apos;s changed in Genie</div>
        <div className="text-xs" style={{ color: "#8A94A0" }}>
          Running version <b style={{ color: "#E8600A" }}>{APP_VERSION}</b> · {UPDATES.length} release{UPDATES.length === 1 ? "" : "s"} logged
        </div>
      </div>
      <div className="rounded px-2 py-1.5 mb-3 text-xs" style={{ background: "#F4F2EC", color: "#5A6672" }}>
        <b>How the number works</b> — <span className="tnum">MAJOR.MINOR.BATCH.PATCH</span>. The last digit moves for
        every change inside one module; the third moves when several modules change together or on the first release of
        a new day; the second (2.6 → 2.7) marks a major change or a new week.
      </div>
      {UPDATES.map((u) => (
        <div key={u.v} className="py-2.5" style={{ borderTop: "1px solid #EFEDE7" }}>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-xs font-bold rounded px-1.5 py-0.5 tnum" style={{ background: "#E8600A", color: "#fff" }}>V {u.v}</span>
            <span className="text-sm font-bold" style={{ color: "#16232F" }}>{u.module}</span>
            <span className="text-xs tnum" style={{ color: "#8A94A0" }}>{fmtFull(u.date)}</span>
          </div>
          <ul className="mt-1" style={{ listStyle: "disc", paddingLeft: 20 }}>
            {u.items.map((it, i) => (
              <li key={i} className="text-sm" style={{ color: "#5A6672" }}>{it}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Admin({
  board, reload, users, loadUsers, isOwner, appSettings, loadAppSettings,
}: {
  board: Board; reload: () => Promise<Board | null>; users: AdminUser[] | null; loadUsers: () => Promise<void>; isOwner: boolean;
  appSettings: { app_name: string; theme_name: string }; loadAppSettings: () => void;
}) {
  /** Who this admin may act on: never the owner, and other admins only if owner. */
  const mayManage = (u: AdminUser) =>
    u.email.toLowerCase() !== OWNER_EMAIL && (isOwner || u.role !== "admin");

  // ---- app identity: logo (fixed), app name + theme name (editable) ----
  const [idForm, setIdForm] = useState({ app_name: appSettings.app_name, theme_name: appSettings.theme_name });
  useEffect(() => { setIdForm({ app_name: appSettings.app_name, theme_name: appSettings.theme_name }); }, [appSettings]);
  const [idMsg, setIdMsg] = useState("");
  const [idBusy, setIdBusy] = useState(false);
  const idDirty = idForm.app_name !== appSettings.app_name || idForm.theme_name !== appSettings.theme_name;
  const saveIdentity = async () => {
    if (!idForm.app_name.trim() || !idForm.theme_name.trim()) return;
    setIdBusy(true);
    setIdMsg("");
    try {
      await api.post("/api/app-settings", { app_name: idForm.app_name, theme_name: idForm.theme_name });
      loadAppSettings();
      setIdMsg("Saved ✓");
    } catch (e) { setIdMsg(e instanceof Error ? e.message : String(e)); }
    finally { setIdBusy(false); }
  };

  // ---- user management (list state lives in the parent so the tab doesn't flicker) ----
  const [uForm, setUForm] = useState({ email: "", pw: "", role: "planner", name: "", initials: "" });
  const [uMsg, setUMsg] = useState("");

  const createUser = async () => {
    if (!uForm.email || !uForm.pw) return;
    setUMsg("");
    try {
      const r = await api.post("/api/admin/users", {
        action: "create",
        email: uForm.email,
        password: uForm.pw,
        role: uForm.role,
        display_name: uForm.name,
        initials: uForm.initials,
      });
      setUForm({ email: "", pw: "", role: "planner", name: "", initials: "" });
      setUMsg(`User created ✓ — initials ${r.initials || "not set"}`);
      await loadUsers();
    } catch (e) { setUMsg(e instanceof Error ? e.message : String(e)); }
  };
  const saveProfile = async (id: string, patch: Record<string, string>) => {
    setUMsg("");
    try { await api.post("/api/admin/users", { action: "profile", id, ...patch }); await loadUsers(); }
    catch (e) { setUMsg(e instanceof Error ? e.message : String(e)); }
  };
  // Optimistic role change: the select shows the chosen value immediately and a
  // small pending mark while the server confirms. Without this it snapped back
  // to the old role for a beat, which read as "didn't take" and invited
  // repeated clicking.
  const [rolePending, setRolePending] = useState<Record<string, string>>({});
  const setRole = async (id: string, role: string) => {
    setUMsg("");
    setRolePending((p) => ({ ...p, [id]: role }));
    try {
      await api.post("/api/admin/users", { action: "role", id, role });
      await loadUsers();
    } catch (e) {
      setUMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setRolePending((p) => { const { [id]: _, ...rest } = p; return rest; });
    }
  };
  const setDisabled = async (id: string, disabled: boolean, email: string) => {
    // disabling blocks sign-in entirely — confirm it, since this is a one-click toggle
    if (disabled && !window.confirm(`Disable ${email}?\n\nThey will no longer be able to sign in until re-enabled.`)) return;
    setUMsg("");
    try { await api.post("/api/admin/users", { action: "disable", id, disabled }); await loadUsers(); }
    catch (e) { setUMsg(e instanceof Error ? e.message : String(e)); }
  };
  const resetPw = async (id: string, email: string) => {
    const pw = window.prompt(`New password for ${email} (min 8 characters):`);
    if (!pw) return;
    try { await api.post("/api/admin/users", { action: "password", id, password: pw }); setUMsg(`Password updated for ${email} ✓`); }
    catch (e) { setUMsg(e instanceof Error ? e.message : String(e)); }
  };
  const removeUser = async (id: string, email: string) => {
    if (!window.confirm(`Remove ${email}?\n\nThey will no longer be able to sign in. Their plans, comments and edits remain in the app.`)) return;
    try { await api.post("/api/admin/users", { action: "delete", id }); setUMsg(`${email} removed`); await loadUsers(); }
    catch (e) { setUMsg(e instanceof Error ? e.message : String(e)); }
  };

  // ---- goals access ----
  type GoalAccessRow = {
    id: string; email: string; initials: string | null; name: string | null;
    role: string; disabled: boolean; level: "none" | "view" | "edit";
    implicit: boolean; isOwner: boolean; locked: boolean; ownsNodes: number;
  };
  const [gaRows, setGaRows] = useState<GoalAccessRow[] | null>(null);
  const [gaMsg, setGaMsg] = useState("");
  const loadAccess = useCallback(() => {
    api.get("/api/admin/goal-access").then((r) => setGaRows(r.users)).catch(() => setGaRows([]));
  }, []);
  useEffect(() => { loadAccess(); }, [loadAccess]);
  const setAccess = async (id: string, level: string, who: string) => {
    setGaMsg("");
    try {
      await api.post("/api/admin/goal-access", { person_id: id, level });
      setGaMsg(`${who} → ${level === "none" ? "no goals access" : level === "view" ? "can view the goal tree" : "can edit the goal tree"} ✓`);
      loadAccess();
    } catch (e) { setGaMsg(e instanceof Error ? e.message : String(e)); }
  };

  // ---- goal categories (swimlanes) — any admin may manage these ----
  type Swimlane = { id: string; name: string; color: string; sort_order: number; nodeCount: number };
  const [lanes, setLanes] = useState<Swimlane[] | null>(null);
  const [laneMsg, setLaneMsg] = useState("");
  const [newLaneName, setNewLaneName] = useState("");
  const loadLanes = useCallback(() => {
    api.get("/api/admin/swimlanes").then((r) => setLanes(r.swimlanes)).catch(() => setLanes([]));
  }, []);
  useEffect(() => { loadLanes(); }, [loadLanes]);
  const addLane = async () => {
    const name = newLaneName.trim();
    if (!name) return;
    setLaneMsg("");
    try { await api.post("/api/admin/swimlanes", { action: "create", name }); setNewLaneName(""); loadLanes(); }
    catch (e) { setLaneMsg(e instanceof Error ? e.message : String(e)); }
  };
  const saveLane = async (id: string, patch: { name?: string; color?: string }) => {
    setLaneMsg("");
    try { await api.post("/api/admin/swimlanes", { action: "update", id, ...patch }); loadLanes(); }
    catch (e) { setLaneMsg(e instanceof Error ? e.message : String(e)); }
  };
  const removeLane = async (l: Swimlane) => {
    if (l.nodeCount) { alert(`"${l.name}" is used by ${l.nodeCount} goal item${l.nodeCount === 1 ? "" : "s"} — move them to another category first.`); return; }
    if (!window.confirm(`Delete the "${l.name}" category?`)) return;
    setLaneMsg("");
    try { await api.post("/api/admin/swimlanes", { action: "delete", id: l.id }); loadLanes(); }
    catch (e) { setLaneMsg(e instanceof Error ? e.message : String(e)); }
  };

  // ---- family milestone template editor ----
  type TRow = { name: string; days: number; preds: number[]; crew: Crew; shift: string; offset: number };
  const famList = useMemo(() => Object.keys(board.templates).sort(), [board.templates]);
  const [fam, setFam] = useState<string>("");
  const [rows, setRows] = useState<TRow[] | null>(null);
  const [newFam, setNewFam] = useState("");
  const [tMsg, setTMsg] = useState("");
  const loadFam = (f: string) => { setFam(f); setRows(templateMilestones(f, board.templates) as TRow[]); setTMsg(""); };
  useEffect(() => {
    if (fam || !famList.length) return;
    const f = famList[0];
    setFam(f);
    setRows(templateMilestones(f, board.templates) as TRow[]);
  }, [fam, famList, board.templates]);


  const setRow = (i: number, patch: Partial<TRow>) => setRows((rs) => rs!.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const setRowCrew = (i: number, key: keyof Crew, v: number) => setRows((rs) => rs!.map((r, k) => (k === i ? { ...r, crew: { ...r.crew, [key]: v } } : r)));
  const addRow = () => setRows((rs) => [...(rs || []), { name: `Milestone ${(rs?.length || 0) + 1}`, days: 3, preds: rs && rs.length ? [rs.length] : [], crew: zeroCrew(), shift: "D", offset: 0 }]);
  const delRow = (i: number) => setRows((rs) => rs!.filter((_, k) => k !== i).map((r) => ({ ...r, preds: r.preds.filter((p) => p !== i + 1).map((p) => (p > i + 1 ? p - 1 : p)) })));
  const parsePreds = (s: string, i: number) => s.split(/[ ,]+/).map((n) => parseInt(n, 10)).filter((n) => n > 0 && n <= i);
  const createFam = () => {
    const f = newFam.trim();
    if (!f) return;
    setFam(f);
    setRows(templateMilestones(f, board.templates) as TRow[]);
    setNewFam("");
    setTMsg(`New product family "${f}" — adjust the milestones below, then Save template.`);
  };
  const saveTemplate = async () => {
    if (!rows || !fam.trim()) return;
    const clean = rows.map((r, i) => ({ name: r.name.trim() || `Milestone ${i + 1}`, days: Math.max(1, Number(r.days) || 1), preds: r.preds.filter((p) => p > 0 && p <= i), crew: r.crew, shift: r.shift || "D", offset: Number(r.offset) || 0 }));
    try {
      await api.post("/api/templates", { family: fam.trim(), milestones: clean });
      await reload();
      setTMsg(`Saved ✓ — every "${fam}" job without a saved plan now defaults to these milestones.`);
    } catch (e) { setTMsg(e instanceof Error ? e.message : String(e)); }
  };

  // ---- admin sub-tabs: the setup pages, and the release log ----
  const [adminTab, setAdminTab] = useState<"setup" | "updates">("setup");

  if (adminTab === "updates") {
    return (
      <div className="p-4 space-y-4">
        <AdminTabs tab={adminTab} setTab={setAdminTab} />
        <Updates />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <AdminTabs tab={adminTab} setTab={setAdminTab} />
      {/* ---- app identity ---- */}
      <div className="bg-white rounded-lg border p-3" style={{ borderColor: "#E2E0DA" }}>
        <div className="font-bold text-sm mb-2">App identity <span className="font-normal text-xs" style={{ color: "#8A94A0" }}>— the name and theme line shown next to the logo, header-wide</span></div>
        <div className="flex gap-4 flex-wrap items-end">
          <div>
            <div className="text-xs font-semibold mb-1" style={{ color: "#8A94A0" }}>Logo</div>
            <div className="rounded px-2 py-1 inline-block" style={{ background: "#16232F" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={LOGO} alt="Nandan GSE" style={{ height: 28 }} />
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold mb-1" style={{ color: "#8A94A0" }}>Name of app</div>
            <input value={idForm.app_name} onChange={(e) => setIdForm({ ...idForm, app_name: e.target.value })} className="text-xs border rounded px-2 py-1.5" style={{ borderColor: "#E2E0DA", width: 160 }} />
          </div>
          <div>
            <div className="text-xs font-semibold mb-1" style={{ color: "#8A94A0" }}>Theme name</div>
            <input value={idForm.theme_name} onChange={(e) => setIdForm({ ...idForm, theme_name: e.target.value })} className="text-xs border rounded px-2 py-1.5" style={{ borderColor: "#E2E0DA", width: 260 }} />
          </div>
          <button onClick={saveIdentity} disabled={!idDirty || idBusy} className="text-xs font-bold rounded px-3 py-1.5" style={{ background: "#E8600A", color: "#fff", opacity: !idDirty || idBusy ? 0.5 : 1 }}>
            {idBusy ? "Saving…" : "Save"}
          </button>
          {idMsg && <span className="text-xs font-semibold" style={{ color: idMsg.includes("✓") ? "#0D7A3F" : "#B3261E" }}>{idMsg}</span>}
        </div>
      </div>

      {/* ---- users ---- */}
      <div className="bg-white rounded-lg border p-3" style={{ borderColor: "#E2E0DA" }}>
        <div className="font-bold text-sm mb-2">User management <span className="font-normal text-xs" style={{ color: "#8A94A0" }}>— initials are the key used to assign tasks and filter the boards</span></div>
        <div className="flex gap-1 mb-2 flex-wrap items-center">
          <input placeholder="email" value={uForm.email} onChange={(e) => setUForm({ ...uForm, email: e.target.value })} className="text-xs border rounded px-2 py-1 flex-1" style={{ borderColor: "#E2E0DA", minWidth: 170 }} />
          <input placeholder="full name" value={uForm.name} onChange={(e) => setUForm({ ...uForm, name: e.target.value })} className="text-xs border rounded px-2 py-1" style={{ borderColor: "#E2E0DA", width: 130 }} />
          <input placeholder="AB" maxLength={2} value={uForm.initials} onChange={(e) => setUForm({ ...uForm, initials: e.target.value.toUpperCase() })} className="text-xs border rounded px-2 py-1 text-center font-bold" style={{ borderColor: "#E2E0DA", width: 52 }} title="Two-letter initials — leave blank to auto-generate" />
          <input placeholder="password (min 8)" value={uForm.pw} onChange={(e) => setUForm({ ...uForm, pw: e.target.value })} className="text-xs border rounded px-2 py-1" style={{ borderColor: "#E2E0DA", width: 130 }} />
          <select value={uForm.role} onChange={(e) => setUForm({ ...uForm, role: e.target.value })} className="text-xs border rounded px-1 py-1 bg-white" style={{ borderColor: "#E2E0DA" }}>
            {ROLE_OPTIONS.map((r) => (<option key={r.value} value={r.value}>{r.label}</option>))}
          </select>
          <button onClick={createUser} className="text-xs font-bold rounded px-2 py-1" style={{ background: "#E8600A", color: "#fff" }}>+ Add user</button>
        </div>
        {uMsg && <div className="text-xs font-semibold mb-2" style={{ color: uMsg.includes("✓") || uMsg.includes("removed") ? "#0D7A3F" : "#B3261E" }}>{uMsg}</div>}
        <div className="overflow-x-auto">
        <table className="text-xs w-full" style={{ minWidth: 720 }}>
          <thead>
            <tr style={{ color: "#8A94A0" }}>
              <th className="text-left py-1 font-semibold">Initials</th>
              <th className="text-left py-1 font-semibold">Name</th>
              <th className="text-left py-1 font-semibold">Email</th>
              <th className="text-left py-1 font-semibold" title="The Project Owner text as it appears in the Jobmaster — links this login to its jobs">ERP owner name</th>
              <th className="text-left py-1 font-semibold" title="Sales Genie access comes with the role now: Sales team, Admins and the owner">Role</th>
              <th className="text-left py-1 font-semibold">Status</th>
              <th className="text-right py-1 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users === null && (
              // skeleton rows — keeps the table height stable while loading
              [0, 1, 2].map((i) => (
                <tr key={"sk" + i} style={{ borderTop: "1px solid #EEECE6" }}>
                  <td className="py-2" colSpan={8}>
                    <div className="rounded" style={{ height: 12, width: `${60 - i * 10}%`, background: "#EFEDE7" }} />
                  </td>
                </tr>
              ))
            )}
            {users?.length === 0 && (
              <tr><td className="py-3" colSpan={8} style={{ color: "#8A94A0" }}>No users found.</td></tr>
            )}
            {(users ?? []).map((u) => (
              <tr key={u.id} style={{ borderTop: "1px solid #EEECE6" }}>
                <td className="py-1.5">
                  <input
                    defaultValue={u.initials || ""}
                    maxLength={2}
                    placeholder="—"
                    onBlur={(e) => { const v = e.target.value.toUpperCase(); if (v !== (u.initials || "")) saveProfile(u.id, { initials: v }); }}
                    className="text-xs border rounded px-1 py-0.5 text-center font-bold w-12"
                    style={{ borderColor: u.initials ? "#E2E0DA" : "#E8600A", color: "#E8600A" }}
                    title="Two letters — press Tab to save"
                  />
                </td>
                <td className="py-1.5">
                  <input
                    defaultValue={u.display_name || ""}
                    placeholder="—"
                    onBlur={(e) => { if (e.target.value !== (u.display_name || "")) saveProfile(u.id, { display_name: e.target.value }); }}
                    className="text-xs border rounded px-1 py-0.5 w-28"
                    style={{ borderColor: "#E2E0DA" }}
                  />
                </td>
                <td className="py-1.5">
                  {u.email}
                  {u.email.toLowerCase() === OWNER_EMAIL && (
                    <span className="ml-1 rounded px-1 font-bold" style={{ background: "#FFF3E8", color: "#E8600A", fontSize: 9 }} title="Owner — governs the other admins and cannot be demoted, disabled or removed">
                      OWNER
                    </span>
                  )}
                </td>
                <td className="py-1.5">
                  <input
                    defaultValue={u.erp_owner || ""}
                    placeholder="e.g. ravi.k"
                    onBlur={(e) => { if (e.target.value !== (u.erp_owner || "")) saveProfile(u.id, { erp_owner: e.target.value }); }}
                    className="text-xs border rounded px-1 py-0.5 w-28"
                    style={{ borderColor: "#E2E0DA" }}
                    title="Must match the Project Owner value in the Jobmaster export"
                  />
                </td>
                <td className="py-1.5">
                  {rolePending[u.id] && <span className="mr-1" title="Saving…">⏳</span>}
                  <select value={rolePending[u.id] ?? u.role} onChange={(e) => setRole(u.id, e.target.value)} disabled={!mayManage(u) || !!rolePending[u.id]} className="text-xs border rounded px-1" style={{ borderColor: rolePending[u.id] ? "#E8600A" : "#E2E0DA", background: mayManage(u) ? "#fff" : "#F4F2EC", color: mayManage(u) ? "#22303C" : "#8A94A0", opacity: rolePending[u.id] ? 0.7 : 1 }} title={rolePending[u.id] ? "Saving…" : mayManage(u) ? ROLE_OPTIONS.find((r) => r.value === u.role)?.hint : `Only ${OWNER_EMAIL} may change this account`}>
                    {ROLE_OPTIONS.map((r) => (<option key={r.value} value={r.value}>{r.label}</option>))}
                  </select>
                </td>
                <td className="py-1.5">
                  <button onClick={() => setDisabled(u.id, !u.disabled, u.email)} disabled={!mayManage(u)} className="rounded px-2 py-0.5 font-semibold" style={{ background: u.disabled ? "#B3261E" : "#E6F4EA", color: u.disabled ? "#fff" : "#0D7A3F", opacity: mayManage(u) ? 1 : 0.5, cursor: mayManage(u) ? "pointer" : "not-allowed" }} title={mayManage(u) ? (u.disabled ? "Click to re-enable sign-in" : "Click to disable sign-in") : `Only ${OWNER_EMAIL} may change this account`}>{u.disabled ? "disabled" : "active"}</button>
                </td>
                <td className="py-1.5 text-right whitespace-nowrap">
                  {mayManage(u) ? (
                    <>
                      <button onClick={() => resetPw(u.id, u.email)} className="rounded px-2 py-0.5 font-semibold mr-1" style={{ background: "#DCE8F5", color: "#1B3A5C" }} title="Set a new password">🔑</button>
                      <button onClick={() => removeUser(u.id, u.email)} className="rounded px-2 py-0.5 font-semibold" style={{ background: "#FBEDEA", color: "#B3261E" }} title="Remove this account">✕</button>
                    </>
                  ) : (
                    <span style={{ color: "#B8B5AC" }} title={u.email.toLowerCase() === OWNER_EMAIL ? "The owner account is protected" : `Only ${OWNER_EMAIL} may change another admin`}>🔒</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <div className="text-xs mt-2" style={{ color: "#8A94A0" }}>
          Initials and names save when you click away from the field. Jobs are filtered by <b>Project Owners</b>; tasks are assigned to <b>Users</b> — both lists come only from accounts created here, never from raw spreadsheet text.
        </div>

        {/* the bridge between Jobmaster text and accounts */}
        {(board.unlinkedOwners || []).length > 0 && (
          <div className="mt-3 rounded p-2" style={{ background: "#FFF7E6", border: "1px solid #F5B32B" }}>
            <div className="text-xs font-bold mb-1" style={{ color: "#8A5B00" }}>
              ⚠ {board.unlinkedOwners.length} owner name{board.unlinkedOwners.length === 1 ? "" : "s"} in the Jobmaster match no account
            </div>
            <div className="flex gap-1 flex-wrap mb-1">
              {board.unlinkedOwners.map((o) => (
                <span key={o} className="rounded px-1.5 py-0.5 text-xs font-semibold" style={{ background: "#fff", border: "1px solid #E2E0DA" }}>{o}</span>
              ))}
            </div>
            <div className="text-xs" style={{ color: "#8A5B00" }}>
              Their jobs show as <b>Unassigned</b>. To link them, create a <b>Project Owner</b> account above and paste the exact name into its <b>ERP owner name</b> field.
            </div>
          </div>
        )}
      </div>

      {/* ---- goals access ---- */}
      <div className="bg-white rounded-lg border p-3" style={{ borderColor: "#E2E0DA" }}>
        <div className="font-bold text-sm mb-1">
          🎯 Goals access <span className="font-normal text-xs" style={{ color: "#8A94A0" }}>— who can open the goal tree</span>
        </div>
        <div className="text-xs mb-3 rounded p-2" style={{ background: "#F4F2EC", color: "#5A6672", lineHeight: 1.5 }}>
          Access is <b>granted, not automatic</b>. Someone with <b>no access</b> still sees the tactics assigned to
          them on <b>My Week</b> — seeing the tree and seeing your own work are separate checks, so removing access
          never hides a person&apos;s own to-do list.
        </div>
        {gaMsg && (
          <div className="text-xs font-semibold mb-2" style={{ color: gaMsg.includes("✓") ? "#0D7A3F" : "#B3261E" }}>{gaMsg}</div>
        )}
        <div className="overflow-x-auto">
          <table className="text-xs w-full" style={{ minWidth: 560 }}>
            <thead>
              <tr style={{ color: "#8A94A0" }}>
                <th className="text-left py-1 font-semibold">Person</th>
                <th className="text-left py-1 font-semibold">Role</th>
                <th className="text-center py-1 font-semibold" title="How many goal nodes they own">Owns</th>
                <th className="text-left py-1 font-semibold">Goals access</th>
              </tr>
            </thead>
            <tbody>
              {gaRows === null && [0, 1, 2].map((i) => (
                <tr key={"g" + i} style={{ borderTop: "1px solid #EEECE6" }}>
                  <td className="py-2" colSpan={4}><div className="rounded" style={{ height: 12, width: `${55 - i * 8}%`, background: "#EFEDE7" }} /></td>
                </tr>
              ))}
              {(gaRows ?? []).filter((u) => !u.disabled).map((u) => (
                <tr key={u.id} style={{ borderTop: "1px solid #EEECE6" }}>
                  <td className="py-1.5">
                    {u.initials && <span className="font-bold rounded px-1 mr-1" style={{ background: "#DCE8F5", color: "#1B3A5C" }}>{u.initials}</span>}
                    {u.name || u.email.split("@")[0]}
                  </td>
                  <td className="py-1.5" style={{ color: "#8A94A0" }}>{u.role.replace("_", " ")}</td>
                  <td className="py-1.5 text-center tnum" style={{ color: u.ownsNodes ? "#1B3A5C" : "#B8B5AC" }}>{u.ownsNodes || "—"}</td>
                  <td className="py-1.5">
                    {u.isOwner ? (
                      <span className="rounded px-2 py-0.5 font-semibold" style={{ background: "#FFF3E8", color: "#E8600A" }} title="The owner always has full access and cannot be restricted">
                        full · owner
                      </span>
                    ) : u.locked ? (
                      <span className="rounded px-2 py-0.5 font-semibold" style={{ background: "#F4F2EC", color: "#8A94A0" }} title={`Only ${OWNER_EMAIL} may change another admin's goals access`}>
                        {u.level === "none" ? "No access" : u.level === "view" ? "View" : "Edit"} 🔒
                      </span>
                    ) : (
                      <div className="flex gap-1">
                        {([["none", "No access"], ["view", "View"], ["edit", "Edit"]] as const).map(([lv, label]) => (
                          <button key={lv} onClick={() => setAccess(u.id, lv, u.name || u.email.split("@")[0])}
                            className="rounded px-2 py-0.5 font-semibold"
                            style={u.level === lv
                              ? { background: lv === "none" ? "#E7E4DC" : lv === "view" ? "#DCE8F5" : "#E8600A", color: lv === "edit" ? "#fff" : lv === "view" ? "#1B3A5C" : "#5A6672" }
                              : { background: "#F4F2EC", color: "#B8B5AC" }}>
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="text-xs mt-2" style={{ color: "#8A94A0" }}>
          <b>View</b> opens the tree read-only. <b>Edit</b> also allows adding, changing and reassigning nodes.
          Owners can always update their own node&apos;s numbers and comment on it, whatever is set here.
        </div>
      </div>

      {/* ---- goal categories (swimlanes) ---- */}
      <div className="bg-white rounded-lg border p-3" style={{ borderColor: "#E2E0DA" }}>
        <div className="font-bold text-sm mb-1">
          🏷 Goal categories <span className="font-normal text-xs" style={{ color: "#8A94A0" }}>— the fields goals and tactics are filed under (Growth, Operations, People, …)</span>
        </div>
        <div className="text-xs mb-3 rounded p-2" style={{ background: "#F4F2EC", color: "#5A6672", lineHeight: 1.5 }}>
          Any admin may add or edit categories here — this is separate from goals access, since organising the
          categories isn&apos;t the same as being allowed into the tree. The Swimlanes view on the Goals tab lays
          work out one column per category.
        </div>
        <div className="flex gap-1 mb-2">
          <input value={newLaneName} onChange={(e) => setNewLaneName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addLane()} placeholder="New category…" className="text-xs border rounded px-2 py-1 flex-1" style={{ borderColor: "#E2E0DA" }} />
          <button onClick={addLane} className="text-xs font-bold rounded px-3 py-1" style={{ background: "#E8600A", color: "#fff" }}>+ Add</button>
        </div>
        {laneMsg && <div className="text-xs font-semibold mb-2" style={{ color: "#B3261E" }}>{laneMsg}</div>}
        <div className="space-y-1">
          {lanes === null && [0, 1, 2].map((i) => (
            <div key={"ln" + i} className="rounded" style={{ height: 30, width: `${60 - i * 8}%`, background: "#F4F2EC" }} />
          ))}
          {lanes?.length === 0 && <div className="text-xs" style={{ color: "#8A94A0" }}>No categories yet.</div>}
          {(lanes ?? []).map((l) => (
            <div key={l.id} className="flex items-center gap-2 rounded p-1.5" style={{ background: "#F4F2EC" }}>
              <input type="color" defaultValue={l.color} onBlur={(e) => { if (e.target.value !== l.color) saveLane(l.id, { color: e.target.value }); }} style={{ width: 26, height: 26, border: "none", background: "none", padding: 0, cursor: "pointer" }} title="Category colour" />
              <input defaultValue={l.name} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== l.name) saveLane(l.id, { name: v }); }} className="text-xs border rounded px-2 py-1 flex-1" style={{ borderColor: "#E2E0DA" }} />
              <span className="text-xs tnum" style={{ color: l.nodeCount ? "#1B3A5C" : "#B8B5AC" }}>{l.nodeCount} item{l.nodeCount === 1 ? "" : "s"}</span>
              <button onClick={() => removeLane(l)} className="rounded px-2 py-0.5 text-xs font-bold" style={{ background: "#FBEDEA", color: "#B3261E" }} title="Delete — only while unused">✕</button>
            </div>
          ))}
        </div>
        <div className="text-xs mt-2" style={{ color: "#8A94A0" }}>
          Name and colour save when you click away. A category can only be deleted while no goal item still uses it.
        </div>
      </div>

      {/* ---- family milestone templates ---- */}
      <div className="bg-white rounded-lg border p-3" style={{ borderColor: "#E2E0DA" }}>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
          <div className="font-bold text-sm">Family milestone templates <span className="font-normal text-xs" style={{ color: "#8A94A0" }}>— every new job of a product family starts with these milestones</span></div>
          <div className="flex gap-1 items-center">
            <input placeholder="New product family…" value={newFam} onChange={(e) => setNewFam(e.target.value)} className="text-xs border rounded px-2 py-1" style={{ borderColor: "#E2E0DA", minWidth: 170 }} />
            <button onClick={createFam} className="text-xs font-bold rounded px-2 py-1" style={{ background: "#1B3A5C", color: "#fff" }}>+ New product</button>
          </div>
        </div>
        <div className="flex gap-1 mb-2 flex-wrap items-center">
          {famList.map((f) => (
            <button key={f} onClick={() => loadFam(f)} className="px-2 py-1 rounded text-xs font-semibold" style={fam === f ? { background: "#22303C", color: "#fff" } : { background: "#F4F2EC", color: "#5A6672" }}>{f}</button>
          ))}
          {fam && !famList.includes(fam) && (
            <span className="px-2 py-1 rounded text-xs font-bold" style={{ background: "#E8600A", color: "#fff" }}>{fam} (unsaved)</span>
          )}
        </div>
        {rows && (
          <>
            <div className="overflow-x-auto">
              <table className="text-xs" style={{ borderCollapse: "collapse", minWidth: 760 }}>
                <thead>
                  <tr style={{ background: "#F4F2EC", color: "#5A6672" }}>
                    <th className="px-2 py-1 text-left">#</th>
                    <th className="px-2 py-1 text-left" style={{ minWidth: 220 }}>Milestone</th>
                    <th className="px-2 py-1">Days</th>
                    <th className="px-2 py-1" title="Predecessor milestone numbers, comma-separated">Preds</th>
                    {TRADES.map((t) => (<th key={t.key} className="px-1 py-1" style={{ color: t.color }} title={t.label}>{t.tiny}</th>))}
                    <th className="px-1 py-1"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} style={{ borderTop: "1px solid #EEECE6" }}>
                      <td className="px-2 py-1 font-bold" style={{ color: "#E8600A" }}>{i + 1}</td>
                      <td className="px-2 py-1"><input value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} className="w-full text-xs border rounded px-1 py-0.5" style={{ borderColor: "#E2E0DA" }} /></td>
                      <td className="px-2 py-1 text-center"><input type="number" min={1} value={r.days} onChange={(e) => setRow(i, { days: Math.max(1, parseInt(e.target.value || "1", 10)) })} className="w-12 text-center border rounded px-1 py-0.5 tnum" style={{ borderColor: "#E2E0DA" }} /></td>
                      <td className="px-2 py-1 text-center"><input value={r.preds.join(",")} onChange={(e) => setRow(i, { preds: parsePreds(e.target.value, i) })} placeholder="—" className="w-16 text-center border rounded px-1 py-0.5 tnum" style={{ borderColor: "#E2E0DA" }} title="Earlier milestone numbers this one waits for (comma-separated)" /></td>
                      {TRADES.map((t) => (<td key={t.key} className="px-0.5 py-1 text-center"><CrewCell value={r.crew[t.key] || 0} color={t.color} onChange={(v) => setRowCrew(i, t.key as keyof Crew, v)} /></td>))}
                      <td className="px-1 py-1 text-center"><button onClick={() => delRow(i)} style={{ color: "#B3261E" }}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <button onClick={addRow} className="text-xs font-bold rounded px-3 py-1.5" style={{ background: "#22303C", color: "#fff" }}>+ Add milestone</button>
              <button onClick={saveTemplate} className="text-xs font-bold rounded px-3 py-1.5" style={{ background: "#E8600A", color: "#fff" }}>💾 Save template</button>
              {tMsg && <span className="text-xs font-semibold" style={{ color: tMsg.includes("✓") ? "#0D7A3F" : "#1B3A5C" }}>{tMsg}</span>}
            </div>
            <div className="text-xs mt-2" style={{ color: "#8A94A0" }}>Matching: a job&apos;s Product Family is matched to a template by exact name first, then partial (e.g. template &quot;Hi Lift&quot; covers &quot;Hi Lift 12m&quot;). Changing a template affects jobs that don&apos;t yet have a saved plan; saved plans are never touched.</div>
          </>
        )}
      </div>

    </div>
  );
}
