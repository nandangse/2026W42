"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { LOGO } from "@/lib/logo";
import { APP_VERSION, UPDATES, EFFORT } from "@/lib/changelog";
import SoftwareDescription from "./SoftwareDescription";
import { TRADES, zeroCrew, templateFor, type Crew } from "@/lib/templates";
import {
  today,
  fmt,
  fmtFull,
  lakh,
  jobNo,
  initials,
  whoTag,
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
  catColour,
  ESC_LEVELS,
  escalated,
  greeting,
  type Plan,
  type PlanMilestone,
} from "@/lib/schedule";
import { GROUPS, normaliseGroups, isLC, isStratcom } from "@/lib/groups";
import RunRate, { useRunRatePayload, type Payload } from "./RunRate";
import { runRate } from "@/lib/run-rate";
import { deliveryReportHtml } from "@/lib/delivery-report";
import QuoteOfDay, { QuoteCard } from "./QuoteOfDay";
import GoalsWorkspace from "./GoalsWorkspace";
import DeliveredJobs from "./DeliveredJobs";
import MorningUpload from "./MorningUpload";
import SalesGenie from "./SalesGenie";
import DeliveryOutlook from "./DeliveryOutlook";
import LMS from "./LMS";
import JobsInProgress, { JobLightbox, type WipJob } from "./JobsInProgress";
import MaterialKitting, { MatBox, type Mat } from "./MaterialKitting";
import { useMyWeek, HowsMyDay, ImageQuote, Birthdays, MyLearningCard } from "./MyWeekPanels";
import { hhmm } from "@/lib/lms";

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
  /** Line manager (profiles.id), set in Admin → User management. */
  reportsTo: string | null;
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
  project_owner: "Planning Owners",
  planner: "Planners",
  admin: "Admins",
  sales: "Sales team",
  viewer: "Viewers",
  uploader: "Uploaders",
};
const GROUP_ORDER = ["Users", "Planning Owners", "Planners", "Admins", "Sales team", "Viewers", "Uploaders"];

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
  /** Physically being worked on now — Stratcom's call, not the ERP's. */
  onFloor?: boolean;
  onFloorAt?: string | null;
  qualityOwner?: string | null;
  productionOwner?: string | null;
  kittingOwner?: string | null;
  designOwner?: string | null;
  floorSummary?: string | null;
  floorSummaryAt?: string | null;
  active: boolean;
  archived: boolean;
  delivered?: boolean;
  updated_at: string | null;
  ownerInitials: string | null;
  ownerName: string | null;
  /** The money side. Null is NOT RECORDED, and never the same as zero. */
  clientUpdate: string | null;
  cashflow: string | null;
  escalation: string | null;
  amtNeeded: number | null;
  payOnDelivery: number | null;
}

/**
 * Money already sunk into a job: (1 − T%) × Kitting% × Value.
 *
 * (1 − T%) of the value is the material content — what is bought in rather
 * than earned — and the kitting percentage says how much of that has actually
 * been drawn. So this is what the job is holding in steel and parts on the
 * shop floor, and it is the number that says what finishing the job releases.
 * Same arithmetic as the KITTED MATERIAL VALUE card, kept in one place.
 */
/** Set each render by the main component; read by redactMoney below. */
let HIDE_MONEY = false;
/**
 * Rupee figures inside PROSE — Genie's job reads, floor summaries, client
 * updates. V() masks the numbers it prints, but a sentence like "₹15.2 L
 * pending on delivery" carries its figure in the words, so the words are
 * scrubbed by the same rule that masks the columns.
 */
const redactMoney = (t: string | null | undefined): string =>
  !t ? "" : HIDE_MONEY ? String(t).replace(/(₹|\bRs\.?)\s?[\d,]+(\.\d+)?\s*(Crores?|Cr|Lakhs?|L|k)?\b/gi, "₹ •••") : String(t);

const investedIn = (j: Pick<Job, "val" | "tpp" | "kit">): number =>
  j.val * (1 - (j.tpp || 0) / 100) * ((j.kit || 0) / 100);

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
  /** Why it was escalated, as typed when the level was set. */
  esc_why?: string | null;
  done: boolean;
  /** Email of whoever raised it. null for ERP ToDos — they have no Genie author. */
  by: string | null;
  comments: number;
  /**
   * The date FIRST promised, and how many times it has been moved since.
   * Lateness is judged on this, never on the date currently showing — a task
   * dragged forward must not stop being late by being dragged.
   */
  original_due?: string | null;
  push_count?: number;
}

/** Late against the date first committed, not the one on screen. */
const taskLate = (t: Pick<Task, "due" | "original_due" | "done">, on: string): boolean =>
  !t.done && !!(t.original_due || t.due) && (t.original_due || t.due)! < on;
interface Board {
  jobs: Job[];
  archived: Record<string, Job>;
  projects: any[];
  tasks: Task[];
  plans: Record<string, Plan & { baseline_on?: string | null; baseline_end?: string | null }>;
  baselines: Record<string, { idx: number; title: string; start: string; end: string }[]>;
  materials: Record<string, { id: string; item: string; qty: string; status: string; custom: boolean; due?: string | null; who?: string | null; note?: string | null; task_id?: string | null }[]>;
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
  reports_to: string | null;
  sales_access: boolean;
  sales_implicit: boolean; // the owner — always yes, not toggleable
  /** Job title and department, read by Goals. */
  designation: string | null;
  department_id: string | null;
  /** From auth.users — null when the account has never signed in. */
  last_sign_in_at: string | null;
  /** Goals access, merged in so a person is one row rather than two tables. */
  goals_level: "none" | "view" | "edit";
  /** HRMS — the people records at /hrms. Owner's grant, nobody by default. */
  hrms_access: boolean;
  hrms_implicit: boolean; // the owner — always yes, not toggleable
  /** The CRM at /crm. Same arrangement. */
  crm_access: boolean;
  crm_implicit: boolean;
}

const ROLE_OPTIONS: { value: string; label: string; hint: string }[] = [
  { value: "admin", label: "Admin", hint: "Everything, plus the Admin page" },
  { value: "planner", label: "Planner", hint: "All boards and editing" },
  { value: "project_owner", label: "Planning Owner", hint: "Owns jobs — the boards filter by these people. The Jobmaster calls this the Project Owner; it is the same person." },
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

/**
 * Who may push the morning Excel from inside the suite: admins, plus Shweta —
 * the one non-admin whose job it is. The server still enforces this (the
 * upload route requires the uploader or admin role); this only decides whether
 * the menu item is worth showing.
 */
const UPLOADER_EMAIL = "shweta@nandan.co.in";

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
  lc,
  stratcom,
  management,
}: {
  email: string;
  role: Role;
  initials: string | null;
  displayName: string | null;
  erpOwner: string | null;
  isRaghu: boolean;
  lc: boolean;
  stratcom: boolean;
  management: boolean;
}) {
  const router = useRouter();
  const isAdmin = role === "admin";
  /**
   * Which room this person is in. Not a role — see src/lib/groups.ts.
   * The owner is in all three without anything being stored against him.
   */
  const groups = { lc, stratcom, management, isRaghu };
  const canSeeDelivered = isLC(groups);
  const canSeeForward = isStratcom(groups);
  const canEdit = role === "admin" || role === "planner" || role === "project_owner";
  // Upload lives in the account menu now — admins and Shweta only.
  const canUpload = isAdmin || email.toLowerCase() === UPLOADER_EMAIL;
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
  const [workspace, setWorkspace] = useState<"lms" | "suite" | "delivered" | "goals" | "tasking" | "sales" | "consult" | "principles">(
    role === "sales" ? "sales" : "suite",
  );
  // Back/forward can restore a workspace this account cannot open -- the tab
  // is hidden, but the history entry outlives the permission. Bounce rather
  // than render an empty board.
  useEffect(() => {
    if (workspace === "delivered" && !canSeeDelivered) setWorkspace("suite");
  }, [workspace, canSeeDelivered]);

  // land on "My Week" within the suite, not the delivery board
  const [tab, setTab] = useState<"home" | "wip" | "liveproj" | "delivery" | "load" | "plan" | "floor" | "material" | "esc" | "erp" | "upload" | "admin" | "feature">("home");

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
  // same for Delivered Jobs — the whole ledger comes down in one payload and
  // every period cut is computed over it in memory
  const [deliveredVisited, setDeliveredVisited] = useState(false);
  useEffect(() => {
    if (workspace === "delivered") setDeliveredVisited(true);
  }, [workspace]);
  // Learning, same lazy keep-alive: the whole library comes down in one payload
  // and every view of it is computed in memory, so re-fetching on each
  // workspace switch would be pure waste.
  const [lmsVisited, setLmsVisited] = useState(false);
  useEffect(() => {
    if (workspace === "lms") setLmsVisited(true);
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

  // HRMS is not a workspace — it is its own page at /hrms, with its own shell.
  // All that is needed here is whether to put the door on the wall.
  const [hrmsAccess, setHrmsAccess] = useState(false);
  useEffect(() => {
    api.get("/api/hrms/access").then((r) => setHrmsAccess(!!r.see)).catch(() => setHrmsAccess(false));
  }, []);

  // App identity — name + theme line under the logo, admin-editable so a new
  // theme doesn't need a deploy. Defaults match the migration's, so the
  // header never flashes empty while this loads.
  const [appSettings, setAppSettings] = useState({ app_name: "Genie", theme_name: "Nandan Breakthrough 2026-27" });
  const loadAppSettings = useCallback(() => {
    api.get("/api/app-settings").then((r) => setAppSettings({ app_name: r.app_name, theme_name: r.theme_name })).catch(() => {});
  }, []);
  useEffect(() => { loadAppSettings(); }, [loadAppSettings]);

  // ---- notification bell: new assignments land here, polled once a minute ----
  interface Notif {
    id: string; kind: string; title: string; body: string;
    /** 'manual' | 'erp' | 'goal' — what ref_id points at. */
    ref_kind: string | null; ref_id: string | null;
    created_by: string | null; read_at: string | null; created_at: string;
  }
  const [notifs, setNotifs] = useState<{ installed: boolean; items: Notif[]; unread: number } | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  /**
   * The height of the frozen header, published as --hdr-h.
   *
   * Anything else that wants to stick UNDER it needs that number, and the
   * header changes height as the nav wraps at narrower widths -- so it is
   * measured rather than written down. A hard-coded offset is right at one
   * window size and wrong at every other.
   */
  const hdrRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = hdrRef.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty("--hdr-h", `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** The task a notification was followed to, shown in the lightbox. */
  const [notifTask, setNotifTask] = useState<Task | null>(null);
  /** Set when a notification points at a task that is no longer there. */
  const [notifGone, setNotifGone] = useState<string | null>(null);
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

  /**
   * Follow a notification to the thing it is about.
   *
   * A notification that can only be marked read makes you go and find the task
   * yourself, which is the moment most of them get ignored. Reading it and
   * opening it are the same click now.
   *
   * Opens the task in VIEW mode -- the modal's own default. Somebody arriving
   * from a bell is finding out what they have been given, not editing it; the
   * Edit button is right there once they have read it.
   */
  const openNotif = async (n: Notif) => {
    if (!n.read_at) markRead(n.id);
    setNotifOpen(false);
    // A goal assignment is not a task and has no task lightbox to open.
    if (n.ref_kind === "goal") { if (goalsAccess) setWorkspace("goals"); return; }
    if (!n.ref_id) return;
    const find = (rows: Task[]) => rows.find((x) => x.id === n.ref_id && x.kind === n.ref_kind);

    const known = find(board?.tasks || []);
    if (known) { setNotifTask(known); return; }

    // Not in the board we are holding. That is the NORMAL case for a fresh
    // notification: the bell polls every minute and the board does not, so a
    // task assigned two minutes ago is on the bell before it is on the board.
    // Fetch once before saying it is gone -- "that task is no longer here" for
    // a task created moments earlier would be the worst possible answer.
    try {
      const fresh = (await api.get("/api/board")) as Board;
      const t = find(fresh?.tasks || []);
      if (t) { setNotifTask(t); setBoard(fresh); return; }
    } catch { /* fall through to the honest answer */ }
    setNotifGone(n.title);
  };

  // Opening a job's plan can be triggered from Tasking or Goals, both of which
  // are now separate workspaces from Job Plan — so jumping there must also
  // switch back to the Planning Suite workspace, not just change the sub-tab.
  const openJobPlan = (id: string) => {
    setActiveId(id);
    setWorkspace("suite");
    setTab("plan");
  };
  // /?job=<id> lands straight on that job's plan — the door the Live Projects
  // lightbox opens in a NEW TAB, so the board someone was reading stays put.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("job");
    if (id) { setActiveId(id); setWorkspace("suite"); setTab("plan"); }
  }, []);

  // Admin users live here, not inside <Admin>, so switching tabs doesn't unmount
  // the list and refetch it — that empty-then-populate cycle was the flicker.
  // null = never loaded yet (show a skeleton); [] = loaded and genuinely empty.
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  // The department list rides along with the users payload — the picker in
  // Admin needs names, and it is the same query either way.
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const loadUsers = useCallback(async () => {
    try {
      const r = await api.get("/api/admin/users");
      setUsers(r.users || []);
      setDepartments(r.departments || []);
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

  /**
   * Money is a PERMISSION before it is a toggle. Planners and Stratcom may
   * flip "without value" for a screen-share; user, sales and viewer accounts
   * never see a rupee figure at all — V masks every number, and the free-text
   * fields Genie writes (which carry figures inside sentences) are redacted
   * by redactMoney(), reading the same flag.
   */
  const mayValue = canEdit || canSeeForward;
  HIDE_MONEY = !(mayValue && showVal);
  const V = (rupees: number) => (mayValue && showVal ? "₹" + lakh(rupees) : "₹ •••");

  const logout = async () => {
    await supabaseBrowser().auth.signOut();
    router.replace("/login");
    router.refresh();
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
    // Delivered Jobs is the LC's page. Hidden rather than shown-and-refused:
    // a tab that only ever says "not for you" is a tab that gets clicked once
    // a week by everyone who cannot use it.
    ...(canSeeDelivered ? ([["delivered", "✅ Delivered Jobs"]] as [typeof workspace, string][]) : []),
    ...(goalsAccess ? ([["goals", "🎯 Goals"]] as [typeof workspace, string][]) : []),
    ["tasking", "📋 Nandan Tasking"],
    ...(salesAccess ? ([["sales", "💼 Sales Genie"]] as [typeof workspace, string][]) : []),
    // Learning sits last: it is the section somebody goes to deliberately,
    // not one they pass through on the way to the day's work.
    ["lms", "📚 LMS"],
    // Ask, and read. One is a question about today's board; the other is how
    // the answers are meant to be reached in the first place.
    ["consult", "🧭 Consult Raghu"],
    ["principles", "📜 Principles"],
  ];
  // Sub-nav inside the Planning Suite workspace only.
  // Admin, Morning Update and Update to ERP have moved into the account menu
  // (top right, behind the initials). They are tools for the few rather than
  // places everyone visits, and each is gated on the right to use it.
  // My Week is NOT here. The 🏠 button on the workspace row above is exactly
  // that page, so listing it again cost a slot on every screen to say the same
  // thing twice. It is still where you land on sign-in, and still one click
  // away from anywhere.
  // On Floor first — it is where the day starts (Dr Raghu, 25 Aug 2026).
  const SUITE_TAB_DEFS: [typeof tab, string][] = [
    ["floor", "On Floor"],
    ["wip", "Jobs in Progress"],
    ["liveproj", "Live Projects"],
    ["delivery", "Job Delivery Board"],
    ["material", "Pending Material"],
    ["esc", "Escalations"],
    ["load", "Load Board"],
    ["plan", "Job Plan"],
  ];

  return (
    <div className="min-h-screen" style={{ background: "#F1EFE9", color: "#22303C" }}>
      {/* ===== frozen header ===== */}
      <div
        ref={hdrRef}
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
            {role === "viewer" && (
              <span className="text-xs rounded px-2 py-1.5 font-bold" style={{ background: "#0D161F", color: "#8FA1B3", border: "1px solid #22303C" }} title="Your account is read-only">
                👁 Read-only
              </span>
            )}
            {/* What matters at a glance is how fresh the data is, not how many
                files landed — the upload count belongs on Morning Update, which
                now lives in the account menu. */}
            <span className="text-xs rounded px-2 py-1.5 font-bold"
              style={{ background: "#0D161F", color: "#8FA1B3", border: "1px solid #22303C" }}
              title="When the Jobmaster export was last loaded into Genie">
              🕒 Last Updated {stamp(board.lastUpdated)}
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
                      {notifs.items.map((n) => {
                        // Which job this is about, resolved through the task it
                        // points at. The notification stores no job of its own,
                        // and deriving it beats copying it: a job retagged after
                        // the notification was written still reads correctly.
                        const nt = n.ref_id ? (board?.tasks || []).find((x) => x.id === n.ref_id && x.kind === n.ref_kind) : undefined;
                        const nj = nt ? (board?.jobs || []).find((j) => j.id === nt.j) : undefined;
                        return (
                          <div
                            key={n.id}
                            onClick={() => openNotif(n)}
                            className="px-3 py-2 cursor-pointer"
                            style={{ borderBottom: "1px solid #F4F2EC", background: n.read_at ? "#fff" : "#FFF7E6" }}
                            title={n.ref_kind === "goal" ? "Open Goals" : "Open the task"}
                          >
                            <div className="flex items-start gap-2">
                              {!n.read_at && <span className="rounded-full flex-shrink-0" style={{ width: 7, height: 7, background: "#E8600A", marginTop: 5 }} />}
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-bold" style={{ color: "#16232F" }}>{n.title}</div>
                                {n.body && <div className="text-xs truncate" style={{ color: "#5A6672" }}>{n.body}</div>}
                                {nj && (
                                  <div className="text-xs truncate" style={{ color: "#1B3A5C", fontWeight: 600 }} title={nj.tag || undefined}>
                                    JOB {jobNo(nj.id)}{nj.tag ? ` · ${nj.tag}` : ""}
                                  </div>
                                )}
                                <div className="tnum" style={{ fontSize: 10, color: "#8A94A0" }}>{stamp(n.created_at)}</div>
                              </div>
                              <span className="flex-shrink-0" style={{ color: "#B8B5AC", fontSize: 12, marginTop: 2 }}>›</span>
                            </div>
                          </div>
                        );
                      })}
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
            {mayValue && (
              <select
                value={showVal ? "with" : "without"}
                onChange={(e) => setShowVal(e.target.value === "with")}
                className="text-xs rounded px-2 py-1.5 font-semibold"
                style={{ background: "#0D161F", color: "#F5B32B", border: "1px solid #22303C" }}
              >
                <option value="with">With value ₹</option>
                <option value="without">Without value</option>
              </select>
            )}
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
                    {canEdit && (
                      <button
                        onClick={() => { setUserOpen(false); setWorkspace("suite"); setTab("erp"); }}
                        className="w-full text-left px-3 py-2 text-sm font-semibold hover:bg-gray-50"
                        style={{ color: "#16232F", borderBottom: "1px solid #EEECE6" }}
                        title="Changes waiting to be pushed back to the ERP"
                      >
                        ↗ Update to ERP{queued ? ` (${queued})` : ""}
                      </button>
                    )}
                    {canUpload && (
                      <button
                        onClick={() => { setUserOpen(false); setWorkspace("suite"); setTab("upload"); }}
                        className="w-full text-left px-3 py-2 text-sm font-bold hover:bg-gray-50"
                        style={{ color: "#E8600A" }}
                        title="Load the morning files — Jobs, Projects, ToDo, the Employee Master, or the full PRE workbook. Excel or CSV."
                      >
                        ⬆ Upload Files {loadedCount}/3
                      </button>
                    )}
                    <button
                      onClick={() => { setUserOpen(false); setWorkspace("suite"); setTab("feature"); }}
                      className="w-full text-left px-3 py-2 text-sm font-semibold hover:bg-gray-50"
                      style={{ color: "#16232F", borderBottom: "1px solid #EEECE6" }}
                      title="Ask for something in Genie — anyone can, and everyone can read the rest"
                    >
                      💡 Feature Request
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => { setUserOpen(false); setWorkspace("suite"); setTab("admin"); }}
                        className="w-full text-left px-3 py-2 text-sm font-semibold hover:bg-gray-50"
                        style={{ color: "#16232F", borderBottom: "1px solid #EEECE6" }}
                      >
                        ⚙ Admin
                      </button>
                    )}
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
              // Planning Suite lands on the Job Delivery Board. My Week has its
              // own 🏠 beside this row, so arriving here on My Week would leave
              // the sub-tab bar with nothing lit and look like a fault.
              onClick={() => { setWorkspace(k); if (k === "suite" && tab === "home") setTab("wip"); }}
              className="px-3 py-1.5 rounded text-sm font-semibold whitespace-nowrap flex-shrink-0"
              style={workspace === k ? { background: "#E8600A", color: "#fff" } : { color: "#8FA1B3" }}
            >
              {l}
            </button>
          ))}
          {/* HRMS is a LINK, not a workspace: it is a separate page at its own
              URL, and the three people who hold it are meant to be able to go
              straight there. Hidden from everyone else, like Sales Genie. */}
          {hrmsAccess && (
            <a
              href="/hrms"
              className="px-3 py-1.5 rounded text-sm font-semibold whitespace-nowrap flex-shrink-0"
              style={{ color: "#8FA1B3" }}
              title="HRMS — the employee master and directory. Opens its own page."
            >
              👤 HRMS
            </a>
          )}
        </div>

        {/* Sub-nav for the Planning Suite workspace only — Goals and Tasking
            are whole workspaces with their own internal navigation. */}
        {workspace === "suite" && (
          <div
            className="flex gap-1 rounded p-1 mt-1.5"
            style={{ background: "#0D161F", overflowX: "auto", scrollbarWidth: "thin" }}
          >
            {SUITE_TAB_DEFS.map(([k, l], i) => (
              <span key={k} className="flex items-center flex-shrink-0">
                {i > 0 && <span aria-hidden style={{ color: "#2E3F50", padding: "0 2px" }}>|</span>}
                <button
                  onClick={() => setTab(k)}
                  className="px-2.5 py-1 rounded text-xs font-semibold whitespace-nowrap"
                  style={tab === k ? { background: "#1B3A5C", color: "#fff" } : { color: "#5C6B7A" }}
                >
                  {l}
                </button>
              </span>
            ))}
          </div>
        )}

        {/* The "Restricted — authorised planning users only" line is gone: it
            was true, and it told nobody anything they could act on, while
            costing a whole line of a header that is on screen all day. */}
        {/* The "Data: n active jobs · kitting x%" line is gone too. Both
            figures are on the boards that use them, in context and next to
            what they mean — repeating them in the header cost a line on every
            screen to say something nobody was reading there. */}
      </div>

      <QuoteOfDay trigger={quoteTrigger} />

      {workspace === "suite" && tab === "home" && <MyWeek board={board} me={me} V={V} onOpen={openJobPlan} reload={reload} goTasks={() => setWorkspace("tasking")} goGoals={() => setWorkspace("goals")} goalsAccess={!!goalsAccess} goLms={() => setWorkspace("lms")} isAdmin={isAdmin} />}
      {/* Kept MOUNTED and merely hidden, so its filters, search, sort and view
          survive a round-trip through Job Plan — unmounting was wiping them. */}
      <div style={{ display: workspace === "suite" && tab === "delivery" ? undefined : "none" }}>
        <DeliveryBoard showForward={canSeeForward} board={board} V={V} onOpen={openJobPlan} reload={reload} pushERP={pushERP} />
      </div>
      {workspace === "suite" && tab === "wip" && <JobsInProgressTab board={board} V={V} onOpen={openJobPlan} canEdit={canEdit} reload={reload} />}
      {workspace === "suite" && tab === "liveproj" && <LiveProjects board={board} V={V} canEdit={canEdit} reload={reload} />}
      {workspace === "suite" && tab === "feature" && <FeatureRequests isOwner={isRaghu} />}
      {workspace === "suite" && tab === "floor" && <OnFloor board={board} V={V} onOpen={openJobPlan} reload={reload} canEdit={canEdit} canTask={role !== "viewer"} isStrat={canSeeForward} myName={(displayName || email.split("@")[0]).split(" ")[0]} />}
      {workspace === "suite" && tab === "material" && <PendingMaterial board={board} onOpen={openJobPlan} reload={reload} canEdit={canEdit} />}
      {workspace === "suite" && tab === "esc" && <Escalations board={board} V={V} onOpen={openJobPlan} reload={reload} isAdmin={isAdmin} />}
      {workspace === "suite" && tab === "load" && <LoadBoard board={board} byTDD={byTDD} />}
      {workspace === "suite" && tab === "plan" && <JobPlan isAdmin={isAdmin} board={board} activeId={activeId} setActiveId={setActiveId} V={V} reload={reload} isRaghu={isRaghu} canEdit={canEdit} pushERP={pushERP} />}
      {workspace === "suite" && tab === "erp" && <UpdateToErp erpLog={erpLog} />}
      {workspace === "suite" && tab === "upload" && canUpload && <MorningUpload email={email} embedded />}
      {workspace === "suite" && tab === "admin" && isAdmin && <Admin board={board} reload={reload} users={users} loadUsers={loadUsers} departments={departments} isOwner={isRaghu} appSettings={appSettings} loadAppSettings={loadAppSettings} />}
      {/* Mounted on first visit and then kept (hidden) — the tree is a slow
          payload (auth + 10 queries + live metrics), so re-fetching it on
          every workspace switch made Goals feel sluggish. Its own load()
          still refreshes after each edit. */}
      {goalsVisited && (
        <div style={{ display: workspace === "goals" ? undefined : "none" }}>
          <GoalsWorkspace />
        </div>
      )}
      {/* Kept mounted once visited, like Goals — the whole ledger comes down in
          one payload and every period cut is computed over it in memory, so
          re-fetching on each workspace switch would be pure waste. */}
      {deliveredVisited && (
        <div style={{ display: workspace === "delivered" ? undefined : "none" }}>
          <DeliveredJobs V={V} />
        </div>
      )}
      {lmsVisited && (
        <div style={{ display: workspace === "lms" ? undefined : "none" }}>
          <LMS />
        </div>
      )}
      {workspace === "consult" && <ConsultRaghu />}
      {workspace === "principles" && <Principles isOwner={isRaghu} />}
      {workspace === "tasking" && <Tasking board={board} onOpen={openJobPlan} reload={reload} me={me} people={board.people || []} />}
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

      {/* Followed from the bell. Lives at the top level because the bell does:
          every other TaskModal belongs to the board that owns the card. */}
      {notifTask && (
        <TaskModal
          canDelete={isAdmin}
          task={notifTask}
          owners={assignees(board)}
          onClose={() => setNotifTask(null)}
          onToggle={async (prevention) => {
            await api.post("/api/tasks", { action: "toggle", id: notifTask.id, kind: notifTask.kind, done: !notifTask.done, prevention });
            setNotifTask(null);
            await reload();
          }}
          reload={reload}
        />
      )}
      {notifGone && (
        <div onClick={() => setNotifGone(null)} className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)", zIndex: 61 }}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg p-4 w-full max-w-sm">
            <div className="font-bold text-sm mb-1">That task is no longer here</div>
            <div className="text-xs" style={{ color: "#5A6672", lineHeight: 1.6 }}>
              <b>{notifGone}</b> — the task it points at has been deleted, or it came from the ERP ToDo
              list and was closed there. The notification stays so you know it happened.
            </div>
            <button onClick={() => setNotifGone(null)} className="mt-3 rounded px-3 py-1.5 text-xs font-bold text-white" style={{ background: "#22303C" }}>Close</button>
          </div>
        </div>
      )}
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
        <ProfileSelf />
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
 * The part of the profile a person keeps current themselves: their WhatsApp
 * number — and, where the admin has marked OAuth Available, the door to the
 * Gmail connection (opened together with an administrator, in the comms
 * build). Everything else on the card stays admin-set.
 */
function ProfileSelf() {
  const [wa, setWa] = useState("");
  const [oauthOk, setOauthOk] = useState(false);
  const [connectedAt, setConnectedAt] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api.get("/api/me/profile")
      .then((r: { whatsapp_no?: string | null; oauth_available?: boolean; oauth_connected_at?: string | null }) => {
        setWa(r.whatsapp_no || "");
        setOauthOk(!!r.oauth_available);
        setConnectedAt(r.oauth_connected_at || null);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const save = async () => {
    setBusy(true); setMsg("");
    try {
      const r = await api.post("/api/me/profile", { whatsapp_no: wa });
      setWa((r as { whatsapp_no?: string | null }).whatsapp_no || "");
      setMsg("Saved.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  if (!loaded) return null;
  return (
    <div className="px-5 pt-3">
      <div className="text-xs font-bold mb-1" style={{ color: "#8A94A0", letterSpacing: ".04em" }}>WHATSAPP NUMBER</div>
      <div className="flex gap-2">
        <input
          value={wa}
          onChange={(e) => setWa(e.target.value)}
          placeholder="+91 98200 12345"
          className="flex-1 rounded border px-2 py-1.5 text-sm tnum"
          style={{ borderColor: "#E2E0DA" }}
        />
        <button onClick={save} disabled={busy}
          className="rounded px-3 py-1.5 text-xs font-bold"
          style={{ background: busy ? "#B8B5AC" : "#E8600A", color: "#fff" }}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
      {msg && <div className="text-xs mt-1 font-semibold" style={{ color: msg === "Saved." ? "#0D7A3F" : "#B3261E" }}>{msg}</div>}

      <div className="mt-3 rounded p-2.5" style={{ background: "#F4F2EC" }}>
        <div className="text-xs font-bold" style={{ color: "#16232F" }}>✉ Gmail connection</div>
        {connectedAt ? (
          <div className="text-xs mt-0.5" style={{ color: "#0D7A3F", fontWeight: 700 }}>Connected · {fmtFull(String(connectedAt).slice(0, 10))}</div>
        ) : oauthOk ? (
          <div className="mt-1">
            <a href="/api/crm/gmail/connect"
              className="inline-block rounded px-3 py-1.5 text-xs font-bold"
              style={{ background: "#E8600A", color: "#fff", textDecoration: "none" }}>
              ✉ Connect Gmail
            </a>
            <div className="text-xs mt-1" style={{ color: "#8A94A0", lineHeight: 1.45 }}>
              Google will ask you to allow reading and sending your @nandan.co.in mail.
              The token lives in the Vault; the CRM never sees your password.
            </div>
          </div>
        ) : (
          <div className="text-xs mt-0.5" style={{ color: "#8A94A0", lineHeight: 1.5 }}>
            Not enabled for you yet — an admin marks <b>OAuth Available</b> on your account first.
          </div>
        )}
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
  /** Goal items only — the root goal this hangs off, for Tasking's By Goals. */
  goalId?: string | null;
  goalName?: string;
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
  goLms,
  isAdmin,
}: {
  board: Board;
  me: { email: string; initials: string | null; displayName: string | null; erpOwner: string | null; role: string };
  V: (v: number) => string;
  onOpen: (id: string) => void;
  reload: () => Promise<Board | null>;
  goTasks: () => void;
  goGoals: () => void;
  goalsAccess: boolean;
  goLms: () => void;
  isAdmin: boolean;
}) {
  const isAdminHere = isAdmin;
  const weekEnd = addDays(TODAY, 7);
  // mood, learning, participation, birthdays and the image quote — one fetch
  const [mw, reloadMw] = useMyWeek();
  const handles = useMemo(() => myHandles(me), [me]);

  // Goal work owed today, merged in from the goals layer — but ONLY for people
  // who hold a goals grant. Showing goal items to someone whose Goals tab is
  // hidden read as an inconsistency ("why can I see this but not open it"), so
  // the whole card follows the same grant as the workspace. Trade-off, made
  // deliberately: a person with goal work assigned but no grant won't see it
  // anywhere — if someone is expected to work goals, give them View.
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
  // late against the date first promised — see taskLate()
  const overdue = myTasks.filter((t) => taskLate(t, TODAY));
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
          {greeting()}, {who}
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

      {/* ===== the top: one five-column band =====
          Four numbers and the birthdays across the top; the quote runs under
          the first three and How's My Day sits under the number it belongs
          with. The quote gets three columns' width because a line of prose set
          in a narrow card is a line nobody reads. */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 mb-4">
        <Card label="MY OPEN TASKS" value={myTasks.length} sub={overdue.length ? `${overdue.length} overdue` : "this week"} color={overdue.length ? "#B3261E" : "#16232F"} />
        <Card label="DELIVERIES THIS WEEK" value={dueJobs.length} sub="shop-wide" color="#7C3AED" />
        <Card label="MY LEARNING · 90 DAYS" value={mw ? hhmm(mw.learning.minutes) : "—"}
          sub={mw ? `${mw.learning.completed} lesson${mw.learning.completed === 1 ? "" : "s"} finished` : "loading"} color="#0D9488" />
        <Card label="MY PARTICIPATION" value={mw ? `${mw.participation.days}/${mw.participation.of}` : "—"}
          sub="days active in the last 30" color="#1B3A5C" />
        {/* birthdays hold the fifth column down both rows — a list of names
            needs the height, and it is the one card here that grows */}
        <div className="lg:row-span-2" style={{ minWidth: 0 }}>
          <Birthdays data={mw} />
        </div>
        <div className="col-span-2 lg:col-span-3" style={{ minWidth: 0 }}>
          <QuoteCard />
        </div>
        <HowsMyDay data={mw} onSaved={reloadMw} />
      </div>

      {/* ===== three columns ===== */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
        {/* LEFT — my tasks */}
        <div className="flex flex-col gap-4" style={{ minWidth: 0 }}>
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
        </div>

        {/* CENTRE — what is going out, and what I am driving */}
        <div className="flex flex-col gap-4" style={{ minWidth: 0 }}>
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
                    <th className="text-left py-1 font-semibold">Planning Owner</th>
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
                      {/* the login is what the Jobmaster carries; the person is
                          who anybody actually asks. Show the name and keep the
                          address on hover. */}
                      <td className="py-1.5" style={{ color: "#5A6672" }} title={j.own || undefined}>
                        {j.ownerName || j.ownerInitials || (j.own ? j.own.split("@")[0] : "—")}
                      </td>
                      {/* no year: the table is already headed "the next 7 days",
                          and 18-08-2026 wrapped onto two lines to say so twice */}
                      <td className="py-1.5 text-center font-bold tnum whitespace-nowrap" style={{ color: j.tdd && j.tdd < TODAY ? "#B3261E" : "#22303C" }} title={fmtFull(j.tdd)}>{fmt(j.tdd)}</td>
                      <td className="py-1.5 text-center tnum">{j.pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
        </div>

        {/* RIGHT — the picture, then my own work. Birthdays have moved up to
            the top band; the image quote takes their place here, where it has
            the width to be looked at rather than glanced past. */}
        <div className="flex flex-col gap-4" style={{ minWidth: 0 }}>
          <ImageQuote data={mw} isAdmin={isAdmin} />
          <MyLearningCard data={mw} onOpenLms={goLms} />
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
              No jobs list you as Planning Owner. Matching uses your initials or the ERP owner name on your profile.
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
      </div>


      {lightbox && <TaskModal canDelete={isAdminHere} task={lightbox} owners={assignees(board)} onClose={() => setLightbox(null)} onToggle={async (prevention) => { await api.post("/api/tasks", { action: "toggle", id: lightbox.id, kind: lightbox.kind, done: !lightbox.done, prevention }); setLightbox(null); await reload(); }} reload={reload} />}
    </div>
  );
}

// ============================ Delivery board ============================
/** Jobs in Progress — the pending book as three charts. See JobsInProgress.tsx. */
function JobsInProgressTab({ board, V, onOpen, canEdit, reload }: { board: Board; V: (n: number) => string; onOpen: (id: string) => void; canEdit: boolean; reload: () => Promise<Board | null> }) {
  const jobs: WipJob[] = board.jobs.map((j) => ({
    id: j.id, tag: j.tag, cust: j.cust, fam: j.fam || "Unassigned",
    tdd: j.tdd, otd: j.otd, stat: j.stat, val: j.val, tpv: j.tpv, tpp: j.tpp,
    kit: j.kit, pct: j.pct, note: j.note, escalation: j.escalation,
    amtNeeded: j.amtNeeded, payOnDelivery: j.payOnDelivery,
    ownerInitials: j.ownerInitials, ownerName: j.ownerName,
  }));
  return (
    <>
      <JobsInProgress jobs={jobs} today={TODAY} V={V} onOpenPlan={onOpen} canEdit={canEdit} onSaved={reload} />
      <ProjectsInProgress board={board} V={V} onOpen={onOpen} />
    </>
  );
}

/**
 * The book one level up: projects rather than jobs.
 *
 * A project is several jobs sold together, and it is how the customer thinks
 * about the order — six lifts on one PO is one conversation, not six. The jobs
 * are the unit of work; this is the unit of the promise.
 *
 * Every figure except the project's own name and dates is derived from the
 * jobs on it, because `projects.job_numbers` is empty on every row the ERP has
 * ever sent — the link that actually works is jobs.proj.
 */
function ProjectsInProgress({
  board,
  V,
  onOpen,
}: {
  board: Board;
  V: (n: number) => string;
  onOpen: (id: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo(() => {
    const byProj = new Map<string, Job[]>();
    for (const j of board.jobs) {
      const p = String(j.proj || "").trim();
      if (!p) continue;                       // a job with no project is just a job
      byProj.set(p, [...(byProj.get(p) || []), j]);
    }
    const meta = new Map<string, Record<string, unknown>>(
      (board.projects || []).map((p: Record<string, unknown>) => [String(p.id), p]),
    );
    return [...byProj.entries()]
      .map(([id, list]) => {
        const p = meta.get(id) || {};
        const tdds = list.map((j) => j.tdd).filter(Boolean).sort() as string[];
        return {
          id,
          // Blank until an upload supplies it (migration 0034) -- deliberately
          // never guessed from a job description.
          name: String(p.name || "").trim(),
          cust: String(p.cust || "").trim() || mode(list.map((j) => j.cust)),
          stage: String(p.stage || "").trim(),
          mgr: String(p.mgr || "").trim(),
          // The ERP's expected end, and what the jobs actually say. Both,
          // because they disagree on most projects and the gap is the point.
          expEnd: (p.exp_end as string) || null,
          lastTdd: tdds.length ? tdds[tdds.length - 1] : null,
          jobs: list.sort((a, b) => String(a.tdd || "9999").localeCompare(String(b.tdd || "9999"))),
          val: list.reduce((s, j) => s + (j.val || 0), 0),
          tp: list.reduce((s, j) => s + tpOf(j), 0),
        };
      })
      // Soonest last delivery first: the project closest to being finished.
      .sort((a, b) => String(a.lastTdd || "9999").localeCompare(String(b.lastTdd || "9999")));
  }, [board.jobs, board.projects]);

  if (!rows.length) return null;
  const noName = rows.filter((r) => !r.name).length;

  return (
    <div className="px-4 pb-6">
      <div className="flex items-baseline gap-2 mb-2 flex-wrap">
        <h2 className="font-bold text-lg" style={{ color: "#16232F" }}>Projects in Progress</h2>
        <span className="text-xs" style={{ color: "#8A94A0" }}>
          {rows.length} projects · {rows.reduce((s, r) => s + r.jobs.length, 0)} of the {board.jobs.length} live jobs sit on one
          {noName > 0 && ` · ${noName} carry no project name yet — the next Projects upload fills them`}
        </span>
      </div>

      <div className="bg-white rounded-lg border overflow-x-auto" style={{ borderColor: "#E2E0DA" }}>
        <table className="w-full text-xs" style={{ minWidth: 940 }}>
          <thead>
            <tr style={{ background: "#22303C", color: "#fff" }}>
              <th className="px-2 py-2 text-left">Project No</th>
              <th className="px-2 py-2 text-left">Project Name</th>
              <th className="px-2 py-2 text-left">Customer</th>
              <th className="px-2 py-2 text-center">Expected completion</th>
              <th className="px-2 py-2 text-center">Last job TDD</th>
              <th className="px-2 py-2 text-center">Jobs</th>
              <th className="px-2 py-2 text-center">Value</th>
              <th className="px-2 py-2 text-center">Throughput</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              // The ERP's expected end has passed on most of these. Saying so
              // is the whole reason the column is here.
              const stale = !!(r.expEnd && r.expEnd < TODAY);
              return (
                <React.Fragment key={r.id}>
                  <tr
                    className="border-t"
                    style={{ borderColor: "#EFEDE7", background: i % 2 ? "#FAF9F5" : "#fff", cursor: "pointer" }}
                    onClick={() => setOpen(open === r.id ? null : r.id)}
                    title="Show the jobs on this project"
                  >
                    <td className="px-2 py-1.5 font-bold whitespace-nowrap" style={{ color: "#1B3A5C" }}>
                      {open === r.id ? "▾ " : "▸ "}{r.id.replace(/^NGSE-PROJ-/, "")}
                    </td>
                    <td className="px-2 py-1.5" style={{ color: r.name ? "#22303C" : "#B8B5AC" }}>
                      {r.name || "— not in the export —"}
                      {r.stage && <div style={{ color: "#8A94A0" }}>{r.stage}</div>}
                    </td>
                    <td className="px-2 py-1.5">{r.cust || <span style={{ color: "#B8B5AC" }}>—</span>}</td>
                    <td className="px-2 py-1.5 text-center whitespace-nowrap" style={{ color: stale ? "#B3261E" : "#22303C", fontWeight: stale ? 700 : 400 }}>
                      {fmtFull(r.expEnd)}
                      {stale && <div style={{ fontSize: 10 }}>already passed</div>}
                    </td>
                    <td className="px-2 py-1.5 text-center whitespace-nowrap font-bold" style={{ color: r.lastTdd && r.lastTdd < TODAY ? "#B3261E" : "#22303C" }}>{fmtFull(r.lastTdd)}</td>
                    <td className="px-2 py-1.5 text-center font-bold tnum">{r.jobs.length}</td>
                    <td className="px-2 py-1.5 text-center whitespace-nowrap tnum">{V(r.val)}</td>
                    <td className="px-2 py-1.5 text-center whitespace-nowrap tnum font-semibold" style={{ color: "#0D7A3F" }}>{V(r.tp)}</td>
                  </tr>
                  {open === r.id && r.jobs.map((j) => (
                    <tr key={j.id} style={{ background: "#F4F7FB" }}>
                      <td className="px-2 py-1"></td>
                      <td className="px-2 py-1 font-bold" style={{ color: "#1B3A5C" }}>
                        <button onClick={() => onOpen(j.id)} style={{ textDecoration: "underline" }} title="Open this job's plan">{jobNo(j.id)}</button>
                      </td>
                      <td className="px-2 py-1" colSpan={2}>{j.tag}</td>
                      <td className="px-2 py-1 text-center whitespace-nowrap" style={{ color: j.tdd && j.tdd < TODAY ? "#B3261E" : "#5A6672" }}>{fmtFull(j.tdd)}</td>
                      <td className="px-2 py-1 text-center" style={{ color: "#8A94A0" }}>{j.pct}% built</td>
                      <td className="px-2 py-1 text-center whitespace-nowrap tnum">{V(j.val)}</td>
                      <td className="px-2 py-1 text-center whitespace-nowrap tnum" style={{ color: "#0D7A3F" }}>{V(tpOf(j))}</td>
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** The commonest non-empty value — used to name a project's customer from its jobs. */
function mode(vals: (string | null | undefined)[]): string {
  const c: Record<string, number> = {};
  for (const v of vals) { const k = String(v || "").trim(); if (k) c[k] = (c[k] || 0) + 1; }
  const top = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : "";
}

/**
 * What has to go out every month from here to reach the target.
 *
 * Straight from runRate(), the same function behind the card further down the
 * page -- not re-derived, so the number card and the card below it cannot
 * drift apart.
 */
function rrPerMonth(p: Payload) {
  const r = runRate(p.to, p.targets, p.actuals);
  return { sales: r.sales.perMonth ?? 0, tp: r.throughput.perMonth ?? 0, days: r.left };
}

/**
 * How much of the target has NO order behind it yet.
 *
 *   target  -  (delivered so far  +  every pending job dated inside this FY)
 *
 * This is deliberately a different question from the run rate. The run rate
 * asks what has to be BUILT from here; this asks what has to be SOLD, because
 * the book already on the floor cannot reach the target on its own. It is the
 * gap nobody in production can close, which is exactly why it is worth its own
 * card rather than being buried in the run rate.
 *
 * Never negative: a target already covered by the book is not a debt.
 */
function newNeeded(p: Payload) {
  const e = p.anticipated?.expected;
  // No anticipated block means the route is older than this card. Showing the
  // whole target as "new sales needed" would be badly wrong, so show nothing.
  if (!e) return { sales: 0, tp: 0 };
  return {
    sales: Math.max(0, p.targets.sales - e.sales),
    tp: Math.max(0, p.targets.throughput - e.throughput),
  };
}

/**
 * The delivery calendar as a printable A4 sheet.
 *
 * Written into a new window rather than printed from the page: the board's
 * calendar is a scrolling pane inside a scrolling app, and printing that gives
 * you whichever fortnight happened to be on screen. This lays every month out
 * in full, one after another, and prints landscape so a week fits across the
 * page without the job descriptions collapsing to nothing.
 *
 * It carries the date it was produced. A delivery calendar with no date on it
 * gets pinned to a wall and read for a month.
 */
/**
 * Open the delivery report in its own window and go to the print dialog.
 *
 * The document itself is built by deliveryReportHtml() in src/lib -- pure, so
 * it can be rendered and looked at without a browser session (see
 * scratchpad/report/). The last version of this shipped with a blank first
 * page precisely because it could not be checked.
 */
function printCalendar(
  byDay: Record<string, Job[]>,
  V: (n: number) => string,
  jobs: Job[],
  shipped: { id: string; tag: string; on: string }[],
  ytd: { n: number; sales: number; tp: number } | null,
) {
  if (!jobs.length) { alert("There are no live jobs to report on."); return; }
  const html = deliveryReportHtml({ today: TODAY, byDay, jobs, shipped, ytd, logo: LOGO, V });
  const w = window.open("", "_blank");
  if (!w) { alert("Your browser blocked the print window. Allow pop-ups for this site and press Give PDF again."); return; }
  w.document.write(html);
  w.document.close();
}

/** Throughput in rupees, the same field the TOTAL THROUGHPUT card sums. */
const tpOf = (j: Job) => j.tpv || 0;

function DeliveryBoard({
  board,
  V,
  onOpen,
  reload,
  pushERP,
  showForward,
}: {
  board: Board;
  V: (v: number) => string;
  onOpen: (id: string) => void;
  reload: () => Promise<Board | null>;
  pushERP: (dt: string, id: string, f: string, v: string) => void;
  /** Stratcom. The two forward-looking cards are theirs. */
  showForward: boolean;
}) {
  /**
   * The year's targets and what is already on the books against them.
   *
   * Read from the same endpoint as the Required Run Rate card further down
   * this page, so the two cannot say different things about one target.
   */
  const rr = useRunRatePayload();
  /**
   * On Floor — is this job actually being worked on right now?
   *
   * Nothing else on a job answers that. Kitting is what was bought, Production
   * is what was built, and a job sits at 40% built for six weeks with nobody
   * touching it. Stratcom says so; everyone else reads it.
   */
  const [floorBusy, setFloorBusy] = useState<string | null>(null);
  const setOnFloor = async (j: Job, on: boolean) => {
    setFloorBusy(j.id);
    try {
      await api.post("/api/on-floor", { job_id: j.id, on });
      await reload();
    } catch (e) { alert(e instanceof Error ? e.message : String(e)); }
    setFloorBusy(null);
  };
  /**
   * What actually went out in the last 30 days, for the calendar.
   *
   * Its own endpoint rather than /api/delivered, which is the LC's: that gate
   * protects the money, and what shipped last week is not a secret from the
   * people who built it. This carries the job, the tag and the day, and
   * nothing else.
   */
  const [shipped, setShipped] = useState<{ id: string; tag: string; on: string }[]>([]);
  /**
   * Delivered since 1 April, for the report's cover.
   *
   * From the run-rate payload rather than counted here: those totals are the
   * ones the board's own cards show, and a report that disagreed with the
   * screen it was printed from would be worse than one without the figure.
   */
  const ytd = rr
    ? { n: rr.deliveries, sales: rr.actuals.sales, tp: rr.actuals.throughput }
    : null;
  useEffect(() => {
    let live = true;
    api.get("/api/delivered/recent")
      .then((r: { jobs?: { id: string; tag: string; on: string }[] }) => { if (live) setShipped(r.jobs || []); })
      // The calendar works without it — green chips are a bonus, not the page.
      .catch(() => {});
    return () => { live = false; };
  }, []);
  const [subTab, setSubTab] = useState<"priority" | "okan" | "cal" | "fam" | "cust">("priority");
  /**
   * The figures above the tabs: open on the Priority List, folded away on the
   * rest.
   *
   * They are the header for the priority list -- that view is the whole book,
   * and the totals are its totals. On the calendar or a product schedule they
   * are half a screen of the same numbers pushing the thing you actually came
   * to look at below the fold.
   *
   * Following the tab rather than being remembered per person: the right
   * default is a property of the view, not of the reader. Anyone can open it
   * anywhere, and it stays open until they move to another tab.
   */
  const [cardsOpen, setCardsOpen] = useState(true);
  useEffect(() => { setCardsOpen(subTab === "priority"); }, [subTab]);
  const [outlook, setOutlook] = useState(false);
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
  /**
   * The board opens sorted by Target Delivery Date, soonest first.
   *
   * It used to open on whatever manual priority had last been dragged, which
   * is an order somebody set on a day that has since passed -- so the first
   * rows were not the next deliveries, and the list had to be re-read before
   * it could be used. The date is the one ordering that is right every morning
   * without anybody maintaining it.
   *
   * Manual priority is not lost: "clear sort" puts it straight back, and the
   * saved order is untouched in the meantime.
   */
  const [sortKey, setSortKey] = useState<string>("tdd");
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
        case "inv": return investedIn(j);
        // Not recorded sorts BELOW nothing-due rather than above it: a job with
        // no figure is not the biggest collection on the board.
        case "pod": return j.payOnDelivery == null ? -1 : j.payOnDelivery;
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
  /** Counted from the SAME filtered list as every other card on this row. */
  const onFloorJobs = jobs.filter((j) => j.onFloor);
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

  const OutlookCard = ({ label, value, sub, color, onClick, open }: { label: string; value: string | number; sub?: string; color: string; onClick: () => void; open: boolean }) => (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      className="bg-white rounded-lg border px-3 py-2"
      style={{ borderColor: open ? color : "#E2E0DA", borderTop: `3px solid ${color}`, cursor: "pointer", boxShadow: open ? `0 0 0 1px ${color}` : undefined }}
      title={open ? "Hide the delivery outlook" : "Open the delivery outlook — what is coming, month by month, and which jobs are worth finishing"}
    >
      <div className="text-xs font-bold flex justify-between" style={{ color: "#8A94A0" }}>
        <span>{label}</span><span style={{ color }}>{open ? "▲" : "▼"}</span>
      </div>
      <div className="text-xl font-bold tnum" style={{ color }}>{value}</div>
      {sub && <div className="text-xs" style={{ color: "#8A94A0" }}>{sub}</div>}
    </div>
  );

  const SubBtn = ({ k, l }: { k: typeof subTab; l: string }) => (
    <button onClick={() => setSubTab(k)} className="px-3 py-1 rounded text-sm font-semibold" style={subTab === k ? { background: "#22303C", color: "#fff" } : { color: "#5A6672" }}>{l}</button>
  );

  return (
    <div className="p-4">
      {!cardsOpen && (
        <div
          className="bg-white rounded-lg border px-3 py-1.5 mb-3 flex items-center gap-3 flex-wrap"
          style={{ borderColor: "#E2E0DA", cursor: "pointer" }}
          onClick={() => setCardsOpen(true)}
          title="Show the totals and the run rate"
        >
          <span className="text-xs font-bold" style={{ color: "#8A94A0" }}>THE BOOK</span>
          <span className="text-sm font-bold tnum" style={{ color: "#16232F" }}>{jobs.length} jobs</span>
          <span className="text-sm tnum" style={{ color: "#1B3A5C" }}>{V(totVal)}</span>
          <span className="text-sm tnum" style={{ color: "#E8600A" }}>{V(totTp)} throughput</span>
          <span className="text-sm tnum" style={{ color: "#0D9488" }}>{kitPct}% kitted</span>
          <span className="text-sm tnum" style={{ color: "#0D7A3F" }}>{onFloorJobs.length} on floor</span>
          <button
            onClick={(e) => { e.stopPropagation(); setCardsOpen(true); }}
            className="ml-auto rounded px-2 py-0.5 text-xs font-bold"
            style={{ background: "#F4F2EC", color: "#5A6672" }}
            title="Show the totals and the run rate"
          >
            ⌄ Show totals
          </button>
        </div>
      )}

      {cardsOpen && (<>
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-3">
        <OutlookCard label="PENDING JOBS" value={jobs.length} sub={outlook ? "hide the outlook" : "open the delivery outlook"} color="#16232F"
          open={outlook} onClick={() => setOutlook((o) => !o)} />
        <Card label="TOTAL VALUE" value={V(totVal)} color="#1B3A5C" />
        <Card label="TOTAL THROUGHPUT" value={V(totTp)} sub={totVal ? Math.round((totTp / totVal) * 100) + "% of value" : ""} color="#E8600A" />
        <Card label="KITTING %" value={kitPct + "%"} sub="Σ val × (1−T%) × Kit% ÷ Σ val × (1−T%)" color="#0D9488" />
        <Card label="KITTED MATERIAL VALUE" value={V(kitted)} sub="Σ value × (1 − T%) × Kitting%" color="#7C3AED" />
        <Card
          label="ON FLOOR"
          value={String(onFloorJobs.length)}
          sub={
            onFloorJobs.length
              // Value AND throughput: nineteen jobs on the floor is a different
              // sentence depending on whether they invoice ₹10 Cr or ₹1 Cr, and
              // what the company earns on them is a third number again.
              ? `${V(onFloorJobs.reduce((s2, j) => s2 + (j.val || 0), 0))} value · ${V(onFloorJobs.reduce((s2, j) => s2 + tpOf(j), 0))} throughput`
              : "nothing marked as being worked on"
          }
          color={onFloorJobs.length ? "#0D7A3F" : "#8A94A0"}
        />
      </div>

      {/*
        Two forward-looking cards, Stratcom only.

        The five above are the book as it stands. These two are the year: what
        has to go out every month from here, and how much of the target has no
        order behind it yet. The second is the one that cannot be fixed on the
        shop floor, which is why it is stated separately rather than folded
        into the run rate.
      */}
      {showForward && rr?.hasTarget && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
          <Card
            label="REQUIRED RUN RATE"
            value={`${V(rrPerMonth(rr).sales)} / month`}
            sub={`sales · with ${V(rrPerMonth(rr).tp)} / month throughput · ${rrPerMonth(rr).days} days left`}
            color="#B3261E"
          />
          <Card
            label="NEW SALES NEEDED — WITH DELIVERY INSIDE THIS YEAR"
            value={V(newNeeded(rr).sales)}
            sub={
              newNeeded(rr).sales > 0
                ? `sales · and ${V(newNeeded(rr).tp)} throughput · orders not yet on the book, to be WON AND DELIVERED before 31 March`
                : "the book already covers the target — nothing further has to be won to reach it"
            }
            color={newNeeded(rr).sales > 0 ? "#D97706" : "#0D7A3F"}
          />
        </div>
      )}

      {/* Opened from the PENDING JOBS card. It reads the SAME filtered list the
          rest of the board is showing, so the owner filter and the search box
          carry into it — an analytics panel that quietly ignores the filter
          above it is how two people end up quoting different numbers. */}
      {outlook && <DeliveryOutlook jobs={jobs} V={V} onOpen={onOpen} />}

      {/* The cards above are the live pending book — what is still to come.
          This is the year against its target — what has actually gone out. The
          two are deliberately adjacent: what is left to bill only means
          something beside what is left to build. */}
      <RunRate V={V} />

      {/* Collapsing is offered everywhere, including the Priority List --
          somebody who knows the totals should be able to put them away. */}
      <div className="flex justify-end -mt-1 mb-2">
        <button
          onClick={() => setCardsOpen(false)}
          className="rounded px-2 py-0.5 text-xs font-bold"
          style={{ background: "#F4F2EC", color: "#5A6672" }}
          title="Fold the totals away"
        >
          ⌃ Hide totals
        </button>
      </div>
      </>)}

      <div className="flex gap-1 rounded p-1 bg-white border mb-3 flex-wrap" style={{ borderColor: "#E2E0DA", width: "fit-content" }}>
        <SubBtn k="priority" l="Priority List (A60 → O)" />
        <SubBtn k="okan" l="By Planning Owner (Kanban)" />
        <SubBtn k="cal" l="📅 Calendar (ISO weeks)" />
        <SubBtn k="fam" l="Schedule by Product" />
        <SubBtn k="cust" l="Schedule by Customer" />
        <select value={delOwn} onChange={(e) => setDelOwn(e.target.value)} className="px-2 py-1 rounded border text-sm ml-1 font-semibold" style={{ borderColor: delOwn === "all" ? "#D9D6CD" : "#E8600A", background: delOwn === "all" ? "#fff" : "#FFF3E8", color: delOwn === "all" ? "#22303C" : "#E8600A" }} title="Filter every view on this board by Planning Owner">
          <option value="all">All planning owners</option>
          {ownerOptions.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
          {ownerOptions.length === 0 && <option disabled>No Planning Owner accounts yet</option>}
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
        // Delivered, keyed by the day it actually WENT — not the day it was
        // promised. A job that shipped late belongs on the day it shipped;
        // filing it under its old target date would draw a calendar of
        // intentions rather than of deliveries.
        const doneDay: Record<string, { id: string; tag: string; on: string }[]> = {};
        shipped.forEach((d) => { (doneDay[d.on] = doneDay[d.on] || []).push(d); });
        const monthOf = (iso: string) => parseISO(iso).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
        let lastMonth = "";
        return (
          <div className="bg-white rounded-lg border p-3" style={{ borderColor: "#E2E0DA" }}>
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <div className="font-bold" style={{ color: "#16232F" }}>Delivery calendar <span className="text-xs font-normal" style={{ color: "#8A94A0" }}>· continuous — scroll through the months · jobs on their Target Delivery Date · ISO weeks on the left</span></div>
              <div className="flex gap-2">
                <button onClick={() => printCalendar(byDay, V, jobs, shipped, ytd)} className="px-2 py-1 rounded text-xs font-bold" style={{ background: "#22303C", color: "#fff" }} title="Open a printable A4 landscape copy of this calendar, dated today, and go straight to Save as PDF">🖨 Give PDF</button>
                <button onClick={scrollCalToToday} className="px-2 py-1 rounded text-xs font-bold" style={{ background: "#E8600A", color: "#fff" }}>⤓ Jump to today</button>
              </div>
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
                            <td key={d2} className="px-1 py-1 border-l" style={{ borderColor: "#EFEDE7", background: d2 === TODAY ? "#FFF3E8" : "#fff", height: 78 }}>
                              <div className="font-bold tnum" style={{ color: d2 === TODAY ? "#E8600A" : "#8A94A0" }}>
                                {parseInt(d2.slice(8), 10)}
                                {list.length > 1 && <span style={{ color: "#1B3A5C" }}> ({list.length})</span>}
                                {d2 === TODAY ? " · today" : ""}
                              </div>
                              {list.map((j) => (
                                <div
                                  key={j.id}
                                  onClick={() => onOpen(j.id)}
                                  title={j.tag + " · " + j.cust + " · " + (j.stat || "")}
                                  className="rounded px-1 py-0.5 mb-0.5 cursor-pointer"
                                  style={{ background: j.tdd && j.tdd < TODAY ? "#B3261E" : "#DCE8F5", color: j.tdd && j.tdd < TODAY ? "#fff" : "#1B3A5C", fontSize: 9, overflow: "hidden" }}
                                >
                                  {/* Two lines: the job number always readable,
                                      the description given the room to be read.
                                      One truncated line meant every chip on a
                                      busy day said "Single Stage Scissor…". */}
                                  <div className="font-bold tnum">{jobNo(j.id)}</div>
                                  <div style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", lineHeight: 1.25 }}>{j.tag}</div>
                                </div>
                              ))}
                              {(doneDay[d2] || []).map((d) => (
                                <div
                                  key={"d" + d.id}
                                  title={`DELIVERED ${fmtFull(d.on)} · ${d.tag}`}
                                  className="rounded px-1 py-0.5 mb-0.5"
                                  style={{ background: "#0D7A3F", color: "#fff", fontSize: 9, overflow: "hidden" }}
                                >
                                  <div className="font-bold tnum">✓ {jobNo(d.id)}</div>
                                  <div style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", lineHeight: 1.25 }}>{d.tag}</div>
                                </div>
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
            <div className="text-xs mt-2" style={{ color: "#8A94A0" }}>Scroll for more months · tap a job chip to open its milestone plan · <b style={{ color: "#0D7A3F" }}>green = delivered</b>, on the day it actually went, last 30 days · red chip = TDD already past · (n) = jobs due that day · week cell shows count &amp; value due that ISO week</div>
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
                {sortKey
                  ? prio
                    ? " · manual order saved — clear the sort to see it"
                    : ""
                  : prio
                    ? " · manual order active"
                    : " · sorted by Target Delivery Date"}
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
                  <th className="px-2 py-2 text-center" style={{ position: "sticky", top: 0, zIndex: 3, background: "#22303C" }}
                      title={showForward ? "Tick the jobs actually being worked on right now. Stratcom only." : "The jobs actually being worked on right now. Stratcom set this."}>
                    On Floor
                  </th>
                  <SortTh k="tag" label="Customer Tag" />
                  <SortTh k="fam" label="Product Family" />
                  <SortTh k="tdd" label="Target Delivery" align="center" />
                  <SortTh k="otd" label="OTD Date" align="center" />
                  <SortTh k="own" label="Planning Owner" />
                  {/* Job Status is gone from this table — it is a 32-value
                      dropdown that ate 190px on every row to say what Prod %
                      says in three characters. Still editable on the Job Plan
                      page and still on the kanban card. */}
                  <SortTh k="pct" label="Prod %" align="center" />
                  <SortTh k="kit" label="Kit%" align="center" />
                  <SortTh k="val" label="Value" align="center" />
                  <SortTh k="tpv" label="Throughput" align="center" />
                  <SortTh k="tpp" label="T%" align="center" />
                  <SortTh k="inv" label="Invested" align="center" />
                  <SortTh k="pod" label="Pay on Delivery" align="center" />
                  <SortTh k="upd" label="Last updated" align="center" />
                </tr>
              </thead>
              <tbody>
                {plist.map((j, i) => (
                  <tr key={j.id} draggable={canDrag} onDragStart={() => setDragIdx(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => onDrop(i)} className="border-t" style={{ borderColor: "#EFEDE7", background: dragIdx === i ? "#FFF3E8" : i % 2 ? "#FAF9F5" : "#fff", cursor: canDrag ? "grab" : "default" }} title={j.note}>
                    <td className="px-2 py-1.5 whitespace-nowrap" style={{ color: "#8A94A0" }}>{canDrag && <span style={{ color: "#B8B5AC" }}>⠿ </span>}<b style={{ color: "#E8600A" }}>{i + 1}</b></td>
                    <td className="px-2 py-1.5"><JobLink j={j} /></td>
                    <td className="px-2 py-1.5 text-center">
                      <input
                        type="checkbox"
                        checked={!!j.onFloor}
                        disabled={!showForward || floorBusy === j.id}
                        onChange={(e) => setOnFloor(j, e.target.checked)}
                        style={{ accentColor: "#0D7A3F", width: 14, height: 14, cursor: showForward ? "pointer" : "default" }}
                        title={
                          showForward
                            ? j.onFloor ? "On the floor — untick when it comes off" : "Tick when work actually starts on it"
                            : j.onFloor ? "On the floor" : "Not on the floor"
                        }
                      />
                    </td>
                    <td className="px-2 py-1.5 font-medium">{j.tag}</td>
                    <td className="px-2 py-1.5" style={{ color: "#5A6672" }}>{j.fam}</td>
                    <td className="px-2 py-1.5 text-center font-bold whitespace-nowrap tnum" style={{ color: j.tdd && j.tdd < TODAY ? "#B3261E" : "#22303C" }}>{fmtFull(j.tdd)}</td>
                    <td className="px-2 py-1.5 text-center font-bold whitespace-nowrap tnum" style={{ color: otdColor(j.otd) }}>{fmtFull(j.otd)}{otdDelay(j) && (<div style={{ fontSize: 10 }}>+{otdDelay(j)}d late</div>)}</td>
                    <td className="px-2 py-1.5" style={{ color: j.ownerInitials ? "#1B3A5C" : "#B8B5AC" }} title={j.own ? `Jobmaster: ${j.own}` : "No owner in the Jobmaster"}>
                      {j.ownerInitials ? (
                        <><span className="font-bold rounded px-1 mr-1" style={{ background: "#DCE8F5" }}>{j.ownerInitials}</span>{j.ownerName}</>
                      ) : (j.own || "—")}
                    </td>
                    <td className="px-2 py-1.5 text-center tnum">{j.pct}%</td>
                    <td className="px-2 py-1.5 text-center tnum" style={{ color: (j.kit || 0) >= 80 ? "#0D7A3F" : (j.kit || 0) >= 40 ? "#D97706" : "#B3261E" }}>{j.kit || 0}%</td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap tnum">{V(j.val)}</td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap tnum" style={{ color: "#E8600A" }}>{V(j.tpv || 0)}</td>
                    <td className="px-2 py-1.5 text-center tnum">{j.tpp || 0}%</td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap tnum" style={{ color: "#7C3AED" }}
                      title={`Invested = (1 − ${j.tpp || 0}%) × ${j.kit || 0}% × ${V(j.val)}\nMaterial value already drawn against this job.`}>
                      {V(investedIn(j))}
                    </td>
                    {/* Null is "not recorded" and reads as a dash. Zero would be
                        "nothing to collect", and sorting must not treat a gap in
                        the export as a job with no money behind it. */}
                    <td className="px-2 py-1.5 text-right whitespace-nowrap tnum"
                      style={{ color: j.payOnDelivery == null ? "#B8B5AC" : "#0D7A3F", fontWeight: j.payOnDelivery ? 700 : 400 }}
                      title={j.payOnDelivery == null ? "Not recorded in the Jobmaster export" : "Falls due when this job is delivered"}>
                      {j.payOnDelivery == null ? "—" : V(j.payOnDelivery)}
                    </td>
                    <td className="px-2 py-1.5 text-center whitespace-nowrap" style={{ color: "#8A94A0" }}>{stamp(j.updated_at)}</td>
                  </tr>
                ))}
                {plist.length === 0 && (
                  <tr><td colSpan={15} className="py-6 text-center" style={{ color: "#8A94A0" }}>No jobs match this filter.</td></tr>
                )}
              </tbody>
            </table>
            </div>
          </div>
        );
      })()}

      {/* ---- By Planning Owner (Kanban) ---- */}
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
        // Value AND throughput per cell. Value is what the job invoices;
        // throughput is what the company actually earns on it, and the two
        // rank the families differently — a big-value family bought in as a
        // bought-out item can earn less than a small one made in-house.
        const groups: Record<string, { total: { n: number; v: number; t: number }; m: Record<string, { n: number; v: number; t: number }> }> = {};
        byTDD.forEach((j) => {
          const g = (groups[j[key]] = groups[j[key]] || { total: { n: 0, v: 0, t: 0 }, m: {} });
          g.total.n++; g.total.v += j.val; g.total.t += tpOf(j);
          const mm = (j.tdd || "").slice(0, 7);
          if (mm) { const c = (g.m[mm] = g.m[mm] || { n: 0, v: 0, t: 0 }); c.n++; c.v += j.val; c.t += tpOf(j); }
        });
        const names = Object.keys(groups).sort();
        return (
          <div className="bg-white rounded-lg border overflow-x-auto mb-4" style={{ borderColor: "#E2E0DA" }}>
            <div className="px-3 pt-2 text-xs font-bold" style={{ color: "#8A94A0" }}>NANDAN GSE PRODUCTION SCHEDULE — month-wise by {key === "fam" ? "product family" : "customer"} (live from Target Delivery Dates)</div>
            <table className="text-xs w-full" style={{ minWidth: 720 }}>
              <thead>
                <tr style={{ background: "#22303C", color: "#fff" }}>
                  <th className="px-3 py-2 text-left">{key === "fam" ? "Product Family" : "Customer"}</th><th className="px-2 py-2">Jobs</th><th className="px-2 py-2">Value</th><th className="px-2 py-2">Throughput</th>
                  {mset.map((m) => (<th key={m} className="px-2 py-2 whitespace-nowrap">{mlabel(m)}</th>))}
                </tr>
              </thead>
              <tbody>
                {names.map((n, i) => (
                  <tr key={n} className="border-t" style={{ borderColor: "#EFEDE7", background: i % 2 ? "#FAF9F5" : "#fff" }}>
                    <td className="px-3 py-1.5 font-semibold">{n}</td>
                    <td className="px-2 py-1.5 text-center font-bold tnum">{groups[n].total.n}</td>
                    <td className="px-2 py-1.5 text-center whitespace-nowrap tnum">{V(groups[n].total.v)}</td>
                    <td className="px-2 py-1.5 text-center whitespace-nowrap tnum font-semibold" style={{ color: "#0D7A3F" }}>{V(groups[n].total.t)}</td>
                    {mset.map((m) => { const c = groups[n].m[m]; return (<td key={m} className="px-2 py-1.5 text-center whitespace-nowrap tnum" style={{ background: c ? "#DCE8F5" : "transparent", border: "1px solid #F1EFE9" }}>{c ? (<><div><b>{c.n}</b> · {V(c.v)}</div><div style={{ color: "#0D7A3F", fontSize: 10.5 }}>T {V(c.t)}</div></>) : "·"}</td>); })}
                  </tr>
                ))}
                <tr style={{ background: "#16232F", color: "#F5B32B" }} className="font-bold">
                  <td className="px-3 py-2">TOTAL</td><td className="px-2 py-2 text-center">{byTDD.length}</td><td className="px-2 py-2 text-center whitespace-nowrap">{V(byTDD.reduce((s, j) => s + j.val, 0))}</td><td className="px-2 py-2 text-center whitespace-nowrap">{V(byTDD.reduce((s, j) => s + tpOf(j), 0))}</td>
                  {mset.map((m) => { const list = byTDD.filter((j) => (j.tdd || "").slice(0, 7) === m); return (<td key={m} className="px-2 py-2 text-center whitespace-nowrap">{list.length ? (<><div>{list.length} · {V(list.reduce((s, j) => s + j.val, 0))}</div><div style={{ fontSize: 10.5, opacity: .85 }}>T {V(list.reduce((s, j) => s + tpOf(j), 0))}</div></>) : "·"}</td>); })}
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

// ============================ Milestone details ============================
/**
 * The spanner beside every milestone name. Click it once and the full detail
 * opens; after that a hover is enough — the panel follows the mouse until it is
 * clicked shut again. Read-only: everything here is editable in the row itself,
 * this just puts the whole picture in one place without widening the table.
 */
function MilestoneSpanner({
  m, job, preds, succ,
}: {
  m: ScheduledRow;
  job: Job;
  preds: ScheduledRow[];
  succ: number[];
}) {
  const [pinned, setPinned] = useState(false);
  const [hover, setHover] = useState(false);
  // hover only reveals it once you've opened it at least once — otherwise the
  // table twitches at every mouse sweep
  const [primed, setPrimed] = useState(false);
  const shown = pinned || (primed && hover);

  const crewList = TRADES.filter((t) => (m.crew[t.key] || 0) > 0);
  const late = !m.done && m.end < TODAY;
  const slipVsTdd = job.tdd ? diffDays(job.tdd, m.end) : null;

  return (
    <span className="relative flex-shrink-0">
      <button
        onClick={() => { setPinned((p) => !p); setPrimed(true); }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className="rounded px-1"
        style={{ color: shown ? "#E8600A" : "#B8B5AC", fontSize: 12, lineHeight: 1 }}
        title={primed ? "Milestone details — hover to peek, click to pin" : "Milestone details"}
        aria-label="Milestone details"
      >
        🔧
      </button>
      {shown && (
        <>
          {pinned && <div className="fixed inset-0" style={{ zIndex: 58 }} onClick={() => setPinned(false)} />}
          <div
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            className="absolute rounded-lg border bg-white p-3 text-left"
            style={{ top: "calc(100% + 4px)", left: 0, width: 290, borderColor: "#E2E0DA", boxShadow: "0 12px 30px rgba(0,0,0,.22)", zIndex: 59 }}
          >
            <div className="flex items-baseline justify-between gap-2">
              <div className="font-bold text-sm" style={{ color: "#16232F" }}>M{m.idx} · {m.name}</div>
              {pinned && <button onClick={() => setPinned(false)} className="text-xs font-bold" style={{ color: "#8A94A0" }}>✕</button>}
            </div>
            <div className="text-xs mb-2" style={{ color: m.done ? "#0D7A3F" : late ? "#B3261E" : "#8A94A0" }}>
              {m.done ? `Completed${m.done_on ? " " + fmtFull(m.done_on) : ""}` : late ? `Not done — ${diffDays(m.end, TODAY)} days past its end date` : "Pending"}
            </div>

            <ProfileRow label="Runs" value={`${fmtFull(m.start)} → ${fmtFull(m.end)}`} hint={`${m.days} day${m.days === 1 ? "" : "s"}${m.shift === "N" ? " · night shift" : m.shift === "DN" ? " · day + night" : " · day shift"}`} />
            <ProfileRow
              label="Crew"
              value={crewList.length ? crewList.map((t) => `${m.crew[t.key]} ${t.label.toLowerCase()}`).join(", ") : "none assigned"}
              hint={`${manDays(m)} man-days`}
            />
            <ProfileRow
              label="Depends on"
              value={(m.preds || []).length ? (m.preds || []).map((p) => `M${p} ${preds.find((x) => x.idx === p)?.name ?? ""}`.trim()).join(", ") : "nothing — it can start on day one"}
            />
            <ProfileRow label="Unblocks" value={succ.length ? succ.map((s) => `M${s} ${preds.find((x) => x.idx === s)?.name ?? ""}`.trim()).join(", ") : "nothing downstream"} />
            {slipVsTdd !== null && (
              <ProfileRow
                label="vs Target Delivery"
                value={slipVsTdd > 0 ? `ends ${slipVsTdd} days after` : slipVsTdd === 0 ? "ends on the target date" : `ends ${Math.abs(slipVsTdd)} days before`}
                hint={`Target ${fmtFull(job.tdd)}`}
              />
            )}
            <div className="text-xs mt-2" style={{ color: "#8A94A0" }}>
              Change any of this in the row itself — this panel is a read-only summary.
            </div>
          </div>
        </>
      )}
    </span>
  );
}

/** The shape computeSchedule returns — named so the panel above can take one. */
type ScheduledRow = ReturnType<typeof computeSchedule>[number];

// ============================ Genie Hint ============================
interface Hint {
  headline: string;
  status: "on_track" | "at_risk" | "late" | "done" | "unknown";
  story: string;
  actions: string[];
  watch: string;
  people: {
    owner: string | null;
    manager: string | null;
    assignees: { handle: string; name: string; open: number }[];
  };
  at: string;
  cached?: boolean;
}

const HINT_STATUS: Record<Hint["status"], { label: string; bg: string; fg: string }> = {
  on_track: { label: "ON TRACK", bg: "#E6F4EA", fg: "#0D7A3F" },
  at_risk: { label: "AT RISK", bg: "#FFF4E0", fg: "#B26A00" },
  late: { label: "LATE", bg: "#FBEDEA", fg: "#B3261E" },
  done: { label: "DELIVERED", bg: "#E6F4EA", fg: "#0D7A3F" },
  unknown: { label: "NOT ENOUGH DATA", bg: "#F4F2EC", fg: "#8A94A0" },
};

/**
 * The written read on the right of the Job Plan header: how the job is being
 * handled, what would actually move it, and who is on it.
 *
 * Deliberately click-to-load. Opening a job should never wait on a model, and
 * plans are edited far more often than they are re-read — so the brief is
 * asked for, not pushed. The server caches each job's brief for 30 minutes.
 */
/**
 * Where the job stands in words and in money — the two things the milestone
 * plan below cannot tell you.
 *
 * Current Status and Client update are what somebody wrote; the three figures
 * are what the job is doing to the bank. They sit together because that is how
 * the decision is actually made: a job with ₹40 L invested and ₹1.2 Cr falling
 * due on delivery is a different job from one with the same dates and neither.
 *
 * Every field is read from the Jobmaster export. A field the export did not
 * carry is left out entirely rather than shown empty — a blank box invites
 * somebody to go looking for a way to fill it in, and there isn't one here.
 */
function JobStanding({ job, V }: { job: Job; V: (n: number) => string }) {
  const invested = investedIn(job);
  // Escalation first: what is holding a job up outranks what it is worth, and
  // burying it under two paragraphs of status would be the wrong order.
  const text: [string, string | null, string][] = [
    ["Current Project Escalation", job.escalation, "#B3261E"],
    ["Current Status", job.note || null, "#22303C"],
    ["Client Update Latest", redactMoney(job.clientUpdate) || job.clientUpdate, "#22303C"],
    ["Cash Flow Details", job.cashflow, "#22303C"],
  ];
  const shownText = text.filter(([, v]) => v && v.trim());
  // every one of the five absent = the export predates them
  const stale =
    !job.escalation && !job.clientUpdate && !job.cashflow && job.amtNeeded == null && job.payOnDelivery == null;
  const figures: [string, number | null, string, string][] = [
    ["Invested", invested, "#7C3AED", `(1 − ${job.tpp || 0}%) × ${job.kit || 0}% × ${V(job.val)} — material value already drawn`],
    ["Amount needed next month", job.amtNeeded, "#D97706", "What this job needs spent on it in the coming month"],
    ["Pending payment on delivery", job.payOnDelivery, "#0D7A3F", "Falls due the day this job goes out"],
  ];

  return (
    <div className="bg-white rounded-lg p-3 border" style={{ borderColor: "#E2E0DA", borderLeft: "5px solid #1B3A5C", flex: "1 1 320px", minWidth: 280, maxWidth: 520 }}>
      <div className="text-xs font-bold tracking-widest mb-1.5" style={{ color: "#1B3A5C" }}>WHERE IT STANDS</div>

      <div className="flex gap-2 flex-wrap mb-2">
        {figures.map(([label, v, color, tip]) => (
          <div key={label} className="rounded px-2 py-1" style={{ background: "#F4F2EC", flex: "1 1 0", minWidth: 96 }} title={tip}>
            <div style={{ fontSize: 10, color: "#8A94A0", letterSpacing: 0.4 }}>{label.toUpperCase()}</div>
            {/* null is "not in the export", and says so — it is not ₹0 */}
            <div className="tnum font-bold" style={{ fontSize: 15, color: v == null ? "#B8B5AC" : color }}>
              {v == null ? "—" : V(v)}
            </div>
          </div>
        ))}
      </div>

      {/* An empty field here is nearly always ONE thing: the Jobmaster has not
          been uploaded since these columns were added. Saying so is the
          difference between a page that looks broken and a page that tells you
          what to do about it. */}
      {stale && (
        <div className="rounded p-2 mb-2 text-xs" style={{ background: "#FFF7E6", border: "1px solid #F0D9A8", color: "#8A5A00", lineHeight: 1.5 }}>
          <b>Not loaded yet.</b> These five come from the Jobmaster export, and no jobs file has been uploaded since
          Genie learned to read them. Load <b>Job in progress - Jobs</b> on Morning Update and they fill — the summary
          names which column each one matched.
        </div>
      )}
      {shownText.length === 0 && !stale ? (
        <div className="text-xs" style={{ color: "#B8B5AC", lineHeight: 1.5 }}>
          No status or client note came across on this job in the last upload.
        </div>
      ) : (
        <div className="flex flex-col gap-1.5" style={{ maxHeight: 240, overflowY: "auto" }}>
          {shownText.map(([label, v, color]) => (
            <div key={label} style={color === "#B3261E" ? { background: "#FBEDEA", borderLeft: "3px solid #B3261E", padding: "4px 6px", borderRadius: 3 } : undefined}>
              <div style={{ fontSize: 10, color: color === "#B3261E" ? color : "#8A94A0", letterSpacing: 0.4, fontWeight: color === "#B3261E" ? 700 : 400 }}>
                {label.toUpperCase()}
              </div>
              <div className="text-xs" style={{ color: "#22303C", lineHeight: 1.5 }}>{v}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GenieHint({ jobId, jobLabel }: { jobId: string; jobLabel: string }) {
  const [hint, setHint] = useState<Hint | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [meta, setMeta] = useState<{ builtBy: string | null; builtAt: string | null; stale: boolean } | null>(null);

  const ask = useCallback(async (refresh = false) => {
    setBusy(true);
    setErr("");
    try {
      const r = await api.post("/api/genie-hint", { job_id: jobId, refresh });
      setHint(r);
      setMeta({ builtBy: r.builtBy ?? null, builtAt: r.builtAt ?? null, stale: false });
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }, [jobId]);

  /**
   * Opening a job now fills this panel by itself.
   *
   * The GET is a single row read of the SHARED cache and generates nothing, so
   * it can run for everyone on every job: whoever paid for the brief first,
   * everybody else reads it free. Only the owner and those reporting directly
   * to him have one BUILT automatically when none exists — that costs a model
   * call, and it is the people who open twenty jobs before lunch who need it
   * without a button.
   */
  useEffect(() => {
    let live = true;
    setHint(null);
    setErr("");
    setMeta(null);
    (async () => {
      try {
        const r = await api.get(`/api/genie-hint?job_id=${encodeURIComponent(jobId)}`);
        if (!live) return;
        if (r.hint) {
          setHint(r.hint);
          setMeta({ builtBy: r.builtBy ?? null, builtAt: r.builtAt ?? null, stale: !!r.stale });
        }
        // nothing cached (or what is cached is out of date) and this caller may
        // have one built — do it without being asked
        if (r.auto && r.stale && r.configured !== false) ask(!!r.hint);
      } catch {
        /* silent: the brief is a companion to the page, never a gate on it */
      }
    })();
    return () => { live = false; };
  }, [jobId, ask]);

  const st = hint ? HINT_STATUS[hint.status] ?? HINT_STATUS.unknown : null;

  return (
    <div
      className="bg-white rounded-lg p-3 border"
      style={{ borderColor: "#E2E0DA", borderLeft: "5px solid #7C3AED", flex: "1 1 340px", minWidth: 300, maxWidth: 520 }}
    >
      <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
        <div className="text-xs font-bold tracking-widest" style={{ color: "#7C3AED" }}>✨ GENIE HINT</div>
        <div className="flex items-center gap-2">
          {st && <span className="text-xs font-bold rounded px-1.5 py-0.5" style={{ background: st.bg, color: st.fg }}>{st.label}</span>}
          {hint && (
            <button onClick={() => ask(true)} disabled={busy} className="text-xs font-bold" style={{ color: "#7C3AED", opacity: busy ? 0.5 : 1 }}
              title={
                (meta?.builtBy ? `Read built by ${meta.builtBy}${meta.builtAt ? " on " + fmtFull(String(meta.builtAt).slice(0, 10)) : ""}. ` : "") +
                "Re-read the job from scratch — everyone sees the new one."
              }>
              ↻
            </button>
          )}
        </div>
      </div>

      {!hint && !busy && !err && (
        <>
          <div className="text-xs mb-2" style={{ color: "#5A6672" }}>
            A written read on <b>{jobLabel}</b> — how it has been handled, what would move the delivery date, and who is on it. Built from this job&apos;s own plan, materials and tasks.
          </div>
          <button onClick={() => ask()} className="rounded px-3 py-1.5 font-bold text-sm" style={{ background: "#7C3AED", color: "#fff" }}>
            Brief me on this job
          </button>
        </>
      )}

      {busy && (
        <div className="flex items-center gap-2 py-4">
          <div className="animate-spin rounded-full" style={{ width: 18, height: 18, border: "2px solid #EDE7F9", borderTopColor: "#7C3AED" }} />
          <span className="text-sm" style={{ color: "#5A6672" }}>Reading the plan, materials and tasks…</span>
        </div>
      )}

      {err && !busy && (
        <div className="text-xs" style={{ color: "#B3261E" }}>
          {err}
          <button onClick={() => ask()} className="ml-2 font-bold" style={{ color: "#7C3AED" }}>try again</button>
        </div>
      )}

      {hint && !busy && (
        <div style={{ maxHeight: 420, overflowY: "auto" }}>
          <div className="text-sm font-bold mb-1" style={{ color: "#16232F" }}>{redactMoney(hint.headline)}</div>
          <div className="text-sm" style={{ color: "#5A6672" }}>{redactMoney(hint.story)}</div>

          {hint.actions.length > 0 && (
            <>
              <div className="text-xs font-bold mt-2 mb-0.5" style={{ color: "#8A94A0" }}>TO DELIVER THIS JOB</div>
              <ul style={{ listStyle: "disc", paddingLeft: 18 }}>
                {hint.actions.map((a, i) => (<li key={i} className="text-sm" style={{ color: "#16232F" }}>{redactMoney(a)}</li>))}
              </ul>
            </>
          )}

          {hint.watch && (
            <div className="rounded px-2 py-1.5 mt-2 text-xs" style={{ background: "#FFF4E0", color: "#7A4A00" }}>
              <b>Watch:</b> {redactMoney(hint.watch)}
            </div>
          )}

          <div className="text-xs font-bold mt-2 mb-1" style={{ color: "#8A94A0" }}>WHO IS ON IT</div>
          <div className="text-xs" style={{ color: "#5A6672" }}>
            <div><b style={{ color: "#16232F" }}>Job owner:</b> {hint.people.owner || "not recorded"}</div>
            {hint.people.manager && <div><b style={{ color: "#16232F" }}>Project manager:</b> {hint.people.manager}</div>}
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            {hint.people.assignees.length === 0 && (
              <span className="text-xs" style={{ color: "#8A94A0" }}>Nobody is carrying an open task on this job.</span>
            )}
            {hint.people.assignees.map((a) => (
              <span key={a.handle} className="text-xs rounded px-1.5 py-0.5" style={{ background: "#F4F2EC", color: "#16232F" }} title={`${a.open} open task${a.open === 1 ? "" : "s"}`}>
                {a.name} <b style={{ color: "#E8600A" }}>{a.open}</b>
              </span>
            ))}
          </div>

          {/* The sign-off is an instruction, not a disclaimer. "Check before
              acting" told somebody to distrust the panel and stop; this tells
              them what the panel is FOR — move the plan, and escalate to the
              person who can actually clear it. */}
          <div className="text-xs mt-2" style={{ color: "#8A94A0", lineHeight: 1.5 }}>
            Written by Genie based on coaching by Raghu{hint.cached ? " · cached" : ""}
            <div style={{ color: "#B8B5AC" }}>
              Work on the plan, and escalate as needed — to the right person, at the right time.
            </div>
          </div>
        </div>
      )}
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
  isAdmin,
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
  /** Deleting a task is admin-only — everyone else closes it. */
  isAdmin: boolean;
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

  const [planView, setPlanView] = useState<"plan" | "mat" | "shop" | "pics" | "mp">("plan");
  const [draft, setDraft] = useState<Plan | null>(null);
  const [applyTplName, setApplyTplName] = useState("");
  const templateNames = useMemo(() => Object.keys(board.templates).sort(), [board.templates]);
  const [dragMi, setDragMi] = useState<number | null>(null);
  const [warned, setWarned] = useState<Set<string>>(new Set());
  const [addingTask, setAddingTask] = useState<string | null>(null);
  const [form, setForm] = useState({ t: "", who: "", due: TODAY, cat: "Production", esc: "None", esc_why: "" });
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

  /**
   * Has the header card scrolled out of view?
   *
   * Watched rather than measured against a scroll position: the card changes
   * height as its chips wrap, so any fixed threshold would be right at one
   * window width and wrong at the next.
   */
  const isAdminHere = isAdmin;
  const hdrCardRef = useRef<HTMLDivElement | null>(null);
  const [hdrGone, setHdrGone] = useState(false);
  /** The shop-update history, in a lightbox. */
  const [shopOpen, setShopOpen] = useState(false);
  useEffect(() => {
    const el = hdrCardRef.current;
    if (!el) return;
    // The sentinel sits directly above the pinned row. It leaving the top of
    // the viewport IS the row becoming stuck -- so the shadow appears exactly
    // when the row starts covering content, and not a pixel before.
    const io = new IntersectionObserver(([e]) => setHdrGone(!e.isIntersecting), {
      rootMargin: "-150px 0px 0px 0px",
      threshold: 0,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

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
  const submitTask = async () => {
    if (!form.t.trim()) return;
    if (escalated(form.esc) && !form.esc_why.trim()) { alert("Say why this is being escalated — whoever it lands on needs to know without ringing you."); return; }
    await api.post("/api/tasks", { action: "create", job_id: dj.id, title: form.t.trim(), who: form.who, due: form.due, cat: form.cat, esc: form.esc, esc_why: form.esc_why }); setForm({ t: "", who: "", due: TODAY, cat: form.cat, esc: "None", esc_why: "" }); setAddingTask(null); await reload(); };
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
      {/* The job picker freezes under the frozen header. Changing job is the
          one thing you do from anywhere on this page, and it used to mean
          scrolling to the top first. --hdr-h is measured by the header itself,
          so this stays right when the nav wraps at narrower widths. */}
      <div
        className="jobplan-picker flex flex-wrap items-center gap-2 mb-3 -mx-4 px-4 py-2"
        style={{ position: "sticky", top: "var(--hdr-h, 92px)", zIndex: 24, background: "#F1EFE9", borderBottom: "1px solid #E2E0DA" }}
      >
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
        <select value={planPO} onChange={(e) => setPlanPO(e.target.value)} className="px-2 py-1.5 rounded border text-sm font-semibold" style={{ borderColor: planPO === "all" ? "#D9D6CD" : "#E8600A", background: planPO === "all" ? "#fff" : "#FFF3E8", color: planPO === "all" ? "#22303C" : "#E8600A" }} title="Only this Planning Owner's jobs in the dropdown">
          <option value="all">All planning owners</option>
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
          <span className="text-xs font-bold rounded px-2 py-1" style={{ background: "#F4F2EC", color: "#8A94A0", border: "1px solid #D9D6CD" }} title="Only admins, planners and planning owners can change plans">
            👁 View only — plans are edited by admins, planners &amp; planning owners
          </span>
        )}
      </div>

      {/*
        Which job you are looking at, kept on screen.

        The header card scrolls away within a screen and everything below it --
        milestones, tasks, materials -- looks the same from job to job. This
        strip appears only once the card has gone, so nothing is said twice
        while both are visible, and it sits under the frozen header using the
        height that header measures for itself.
      */}
      {/* A 1px sentinel: once THIS leaves the top, the row above is pinned.
          The row cannot detect that itself -- a sticky element never leaves the
          viewport, so watching it would never fire. */}
      <div ref={hdrCardRef} style={{ height: 1 }} />

      {/* header card — facts on the left, Genie's read on the right.
          It follows you down the page: everything below it looks the same from
          job to job, and which job you are editing should not need a scroll
          back up. Capped at 42vh so that on a narrow screen, where the three
          cards stack, it scrolls inside itself instead of eating the page. */}
      {/* The band that follows you down. One line of the things you look up
          while working: which job, who it is for, what it is worth and how far
          in, what is owed, and what the floor last said. The detail card below
          scrolls away as normal. */}
      {/* ON A PHONE, ONLY THIS IS PINNED (Dr Raghu, 23 Aug 2026). The full
          card below wraps four rows deep on a narrow screen, and pinning it
          left a third of the viewport frozen. The phone keeps one thin line —
          which job, whose it is — and everything else scrolls like content.

          FIXED, NOT STICKY, and it appears only once the sentinel says the
          card itself has scrolled away. A sticky strip here kept sliding
          UNDER the frozen header on phones whenever the measured offset ran
          a few pixels short — pinned exactly where nobody could see it. A
          fixed overlay above the header cannot be hidden by it, and while
          the real card is still on screen the strip stays away entirely, so
          nothing is ever said twice. */}
      {hdrGone && (
        <div className="md:hidden flex items-baseline px-4 py-1.5"
          style={{ position: "fixed", top: "var(--hdr-h, 92px)", left: 0, right: 0, zIndex: 46, background: "#16232F", color: "#fff", minWidth: 0, boxShadow: "0 6px 12px -8px rgba(0,0,0,.5)" }}>
          <span className="font-bold tnum" style={{ fontSize: 14, flexShrink: 0 }}>JOB {jobNo(dj.id)}</span>
          <span className="truncate" style={{ fontSize: 12, color: "#B7C4D0", marginLeft: 8 }} title={dj.tag}>
            {dj.tag}
          </span>
        </div>
      )}

      <JobTopRow
        job={dj}
        V={V}
        sticky
        shadow={hdrGone}
        onShopUpdate={() => setShopOpen(true)}
      />

      <div className="flex gap-3 mb-3 items-stretch" style={{ flexWrap: "wrap" }}>
      <div className="bg-white rounded-lg p-3 border" style={{ borderColor: "#E2E0DA", borderLeft: "5px solid #E8600A", flex: "1 1 620px", minWidth: 320 }}>
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

      <JobStanding job={dj} V={V} />

      <GenieHint jobId={dj.id} jobLabel={`JOB ${jobNo(dj.id)} · ${dj.tag}`} />
      </div>

      <JobManpowerStrip jobId={dj.id} canEdit={canEdit} />

      {/* plan / materials sub-tabs */}
      <div className="flex gap-1 rounded p-1 bg-white border mb-3" style={{ borderColor: "#E2E0DA", width: "fit-content" }}>
        {(["plan", "mat", "shop", "pics", "mp"] as const).map((k) => (
          <button key={k} onClick={() => { if (k === "mat") ensureMats(); setPlanView(k); }} className="px-3 py-1 rounded text-sm font-semibold" style={planView === k ? { background: "#22303C", color: "#fff" } : { color: "#5A6672" }}>
            {k === "plan" ? "Milestone Plan" : k === "mat" ? "Material Kitting" : k === "shop" ? "Shop Updates" : k === "pics" ? "Photos" : "Manpower"}
          </button>
        ))}
      </div>

      {/* Shop Updates as a page rather than a lightbox: the same content, for
          somebody who came to READ the history rather than glance at it. */}
      {planView === "shop" && <ShopUpdatesPanel job={dj} />}

      {/* The day-wise work study as a ledger: every day a row, typed or
          carried by the 4 AM rollover, with the labour cost where the rates
          are set and the reader may see money. */}
      {planView === "mp" && <ManpowerLedger jobId={dj.id} V={V} />}

      {/* The build history in pictures, as a page. Same gallery the On Floor
          row opens — one component, so the two cannot disagree about what has
          been taken. */}
      {planView === "pics" && (
        <div className="bg-white rounded-lg border p-3 mb-4" style={{ borderColor: "#E2E0DA" }}>
          <div className="flex items-baseline gap-2 flex-wrap mb-2">
            <h2 className="font-bold" style={{ color: "#16232F" }}>Photos</h2>
            <span className="text-xs" style={{ color: "#8A94A0" }}>
              JOB {jobNo(dj.id)} as it was built — each one keeps the completion it had on the day
            </span>
          </div>
          <PhotoBody job={dj} canEdit={canEdit} />
        </div>
      )}

      {planView === "mat" && (
        <div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
            <Chip label="KITTING %" value={(dj.kit || 0) + "%"} color="#0D9488" />
            <Chip label="MATERIAL VALUE = val × (1−T%)" value={V(matVal)} />
            <Chip label="KITTED VALUE = val × (1−T%) × Kit%" value={V((matVal * (dj.kit || 0)) / 100)} color="#0D7A3F" />
            <Chip label="YET TO RECEIVE" value={V(matVal * (1 - (dj.kit || 0) / 100))} color="#B3261E" />
          </div>
          <MaterialKitting
            jobId={dj.id}
            mats={mats}
            canEdit={canEdit}
            people={assignees(board).map((a) => ({ value: a.value, label: a.label }))}
            onChanged={reload}
          />
          <div className="text-xs mt-2" style={{ color: "#8A94A0", lineHeight: 1.5 }}>
            {recvN}/{mats.length} kit items received — a checklist, while the boards read the ERP&apos;s own Kitting % in
            Σ val × (1−T%) × Kit%. A line marked <b>QC Defective</b> counts as not received: it is on site and cannot be
            used, which for the job is the same position as not having it.
          </div>
        </div>
      )}

      {planView === "plan" && (
        <>
          <div className="bg-white rounded-lg border" style={{ borderColor: "#E2E0DA", overflow: "auto", maxHeight: "calc(100vh - 210px)" }}>
            {/* fieldset[disabled] greys every input, select, checkbox and button
                in the table at once for read-only roles; edit() is the actual
                enforcement, this is the honest UI for it */}
            <fieldset disabled={!canEdit} style={{ border: "none", margin: 0, padding: 0, opacity: canEdit ? 1 : 0.75 }}>
            <table className="w-full text-sm" style={{ minWidth: 1100 }}>
              <thead style={{ position: "sticky", top: 0, zIndex: 30 }}>
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
                    <td className="px-2 py-1">
                      <div className="flex items-center gap-1">
                        <input value={m.name} onChange={(e) => setMilestone(i, { name: e.target.value })} className="flex-1 px-1 py-0.5 rounded border bg-transparent" style={{ borderColor: "transparent" }} onFocus={(e) => (e.target.style.borderColor = "#E8600A")} onBlur={(e) => (e.target.style.borderColor = "transparent")} />
                        <MilestoneSpanner m={m} job={dj} preds={sched} succ={successors[m.idx] || []} />
                      </div>
                    </td>
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
              <div className="text-xs font-semibold" style={{ color: "#8A94A0" }}>👁 View only — ask an admin, planner or planning owner to change this plan</div>
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
                  <TaskCard key={"ms" + m.idx} onOpen={() => {}} t={{ id: "ms" + m.idx, kind: "manual", done: !!m.done, j: dj.id, t: `M${m.idx} · ${m.name}`, d: `${fmt(m.start)} → ${fmt(m.end)} · ${manDays(m)} man-days`, who: dj.own || "plan", due: m.end, cat: "Milestone", esc: "None", by: null, comments: 0 }} />
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
                  {jobTasks.filter((t) => t.cat === cat).sort((a, b) => ((a.due || "9999") < (b.due || "9999") ? -1 : 1)).map((t) => (<TaskCard key={t.id} onOpen={setLightbox} onDelete={isAdminHere ? deleteJobTask : undefined} t={t} />))}
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

      {lightbox && <TaskModal canDelete={isAdminHere} task={lightbox} owners={assignees(board)} onClose={() => setLightbox(null)} onToggle={async (prevention) => { await api.post("/api/tasks", { action: "toggle", id: lightbox.id, kind: lightbox.kind, done: !lightbox.done, prevention }); setLightbox(null); await reload(); }} reload={reload} />}

      {shopOpen && <ShopUpdates job={dj} onClose={() => setShopOpen(false)} />}

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
/** The six ways of looking at the same task list. */
const TASKING_VIEWS = [
  ["jobs", "By Jobs"],
  ["projects", "By Projects"],
  ["dept", "By Department"],
  ["goals", "By Goals"],
  ["esc", "By Escalations"],
  ["dump", "🧠 Brain Dump"],
] as const;
type TaskingView = (typeof TASKING_VIEWS)[number][0];

function Tasking({
  board,
  onOpen,
  reload,
  me,
  people,
}: {
  board: Board;
  onOpen: (id: string) => void;
  reload: () => Promise<Board | null>;
  me: { email: string; initials: string | null; displayName: string | null; erpOwner: string | null; role: string };
  people: Person[];
}) {
  /** Deleting a task is admin-only; everyone else closes it. */
  const isAdminHere = me.role === "admin";
  const [view, setView] = useState<TaskingView>("jobs");
  const [filterCust, setFilterCust] = useState("all");
  const [filterFam, setFilterFam] = useState("all");
  const [filterOwn, setFilterOwn] = useState("all");
  const [taskAll, setTaskAll] = useState(false);
  const [taskView, setTaskView] = useState<"board" | "cal">("board");
  const [calMonth, setCalMonth] = useState(TODAY.slice(0, 7));
  /**
   * Dragging a chip to another day.
   *
   * The date is written straight away and the board re-read — no confirm. A
   * drag is already a deliberate act, and a dialog after every one would make
   * re-planning a week slower than typing the dates in, which is the thing
   * this replaces. Getting it wrong costs one drag back.
   */
  const [dragTask, setDragTask] = useState<Task | null>(null);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const moveTaskTo = async (day: string) => {
    const t = dragTask;
    setDragTask(null);
    if (!t || t.due === day) return;
    try {
      await api.post("/api/tasks", { action: "update", id: t.id, kind: t.kind, due: day });
      await reload();
    } catch (e) { alert(e instanceof Error ? e.message : String(e)); }
  };
  const [adding, setAdding] = useState<string | null>(null);
  const [form, setForm] = useState({ t: "", who: "", due: TODAY, cat: "Production", esc: "None", esc_why: "" });
  const [lightbox, setLightbox] = useState<Task | null>(null);

  const [dueUpTo, setDueUpTo] = useState("");

  // ---- whose tasks: all three on by default, so the board opens complete ----
  const [scope, setScope] = useState({ mine: true, byMe: true, reports: true });

  /** My own account row — the anchor for "who reports to me". */
  const myProfile = useMemo(
    () => people.find((p) => p.email.toLowerCase() === me.email.toLowerCase()) || null,
    [people, me.email],
  );
  /** Every string a direct report's task might be filed under. */
  const reportHandles = useMemo(() => {
    if (!myProfile) return new Set<string>();
    const s = new Set<string>();
    for (const p of people) {
      if (p.reportsTo !== myProfile.id) continue;
      for (const v of [p.initials, p.name, p.erpOwner, p.email, p.email.split("@")[0]])
        if (v) s.add(String(v).toLowerCase());
    }
    return s;
  }, [people, myProfile]);
  const reportCount = useMemo(
    () => (myProfile ? people.filter((p) => p.reportsTo === myProfile.id).length : 0),
    [people, myProfile],
  );
  const mineHandles = useMemo(() => myHandles(me), [me]);

  const anyScope = scope.mine || scope.byMe || scope.reports;
  const inScope = useCallback(
    (t: Task) => {
      if (!anyScope) return true; // nothing ticked reads as "show me everything"
      const who = String(t.who || "").toLowerCase();
      if (scope.mine && mineHandles.has(who)) return true;
      if (scope.byMe && t.by && t.by.toLowerCase() === me.email.toLowerCase()) return true;
      if (scope.reports && reportHandles.has(who)) return true;
      return false;
    },
    [anyScope, scope, mineHandles, reportHandles, me.email],
  );

  const custs = useMemo(() => [...new Set(board.jobs.map((j) => j.cust))].sort(), [board]);
  const fams = useMemo(() => [...new Set(board.jobs.map((j) => j.fam))].sort(), [board]);
  const owners = board.owners;
  // "up to date" filter: only tasks due on/before the chosen date (blank = all),
  // then the who-filter above it
  const filteredTasks = useMemo(
    () => board.tasks.filter((t) => (!dueUpTo || (t.due || "9999-12-31") <= dueUpTo) && inScope(t)),
    [board, dueUpTo, inScope],
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
    setForm({ t: "", who: "", due: TODAY, cat: form.cat, esc: "None", esc_why: "" });
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
      {/* ---- the six ways of reading the same list ---- */}
      <div className="flex gap-1 rounded p-1 bg-white border mb-2" style={{ borderColor: "#D9D6CD", width: "fit-content", overflowX: "auto" }}>
        {TASKING_VIEWS.map(([k, l]) => (
          <button
            key={k}
            onClick={() => setView(k)}
            className="px-3 py-1 rounded text-sm font-semibold whitespace-nowrap"
            style={view === k ? { background: "#E8600A", color: "#fff" } : { color: "#5A6672" }}
          >
            {l}
          </button>
        ))}
      </div>

      {/* ---- whose tasks: all three on by default ---- */}
      {view !== "dump" && (
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="text-xs font-bold" style={{ color: "#8A94A0" }}>SHOW</span>
          {([
            ["mine", "My tasks", "Tasks assigned to you"],
            ["byMe", "Tasks assigned by me", "Tasks you raised, whoever is carrying them"],
            ["reports", `Tasks of people reporting to me${reportCount ? ` (${reportCount})` : ""}`, reportCount ? "Direct reports, set in Admin → User management" : "Nobody reports to you yet — set it in Admin → User management"],
          ] as const).map(([k, label, hint]) => (
            <label
              key={k}
              className="text-xs flex items-center gap-1 px-2 py-1.5 rounded border cursor-pointer font-semibold"
              style={{
                borderColor: scope[k] ? "#E8600A" : "#D9D6CD",
                background: scope[k] ? "#FFF3E8" : "#fff",
                color: scope[k] ? "#E8600A" : "#8A94A0",
              }}
              title={hint}
            >
              <input type="checkbox" checked={scope[k]} onChange={(e) => setScope({ ...scope, [k]: e.target.checked })} />
              {label}
            </label>
          ))}
          {/* Everybody's tasks, in one click.
              It was always possible — clearing all three tick-boxes has always
              read as "show me everything" — but nobody could be expected to
              guess that, and "nothing ticked" looks like "nothing shown". This
              is the same state with a name on it. Pressing it again puts the
              three back, because the way out of a filter has to be as obvious
              as the way in. */}
          <button
            onClick={() => setScope(anyScope ? { mine: false, byMe: false, reports: false } : { mine: true, byMe: true, reports: true })}
            className="text-xs px-2 py-1.5 rounded border font-semibold"
            style={anyScope
              ? { borderColor: "#D9D6CD", background: "#fff", color: "#5A6672" }
              : { borderColor: "#22303C", background: "#22303C", color: "#fff" }}
            title={anyScope
              ? "Everybody's tasks, whoever they are assigned to and whoever raised them"
              : "Back to your own three views"}
          >
            {anyScope ? "All tasks" : "◉ All tasks"}
          </button>
          {!anyScope && (
            <span className="text-xs" style={{ color: "#8A94A0" }}>
              everybody&apos;s tasks — the three filters above are off
            </span>
          )}
        </div>
      )}

      {view === "dump" ? (
        <BrainDump board={board} reload={reload} />
      ) : (
      <>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select value={filterCust} onChange={(e) => setFilterCust(e.target.value)} className="px-2 py-1.5 rounded border bg-white text-sm" style={{ borderColor: "#D9D6CD", maxWidth: 240 }}>
          <option value="all">All customers</option>{custs.map((c) => (<option key={c}>{c}</option>))}
        </select>
        <select value={filterOwn} onChange={(e) => setFilterOwn(e.target.value)} className="px-2 py-1.5 rounded border bg-white text-sm" style={{ borderColor: "#D9D6CD" }} title="Filter by the job's Planning Owner">
          <option value="all">All planning owners</option>
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
        {view === "jobs" && (
          <div className="flex gap-1 rounded p-1 bg-white border" style={{ borderColor: "#D9D6CD" }}>
            {(["board", "cal"] as const).map((k) => (<button key={k} onClick={() => setTaskView(k)} className="px-3 py-1 rounded text-sm font-semibold" style={taskView === k ? { background: "#22303C", color: "#fff" } : { color: "#5A6672" }}>{k === "board" ? "Board" : "📅 Calendar (ISO weeks)"}</button>))}
          </div>
        )}
      </div>

      {view !== "jobs" && (
        <GroupedTasks
          view={view}
          board={board}
          reload={reload}
          jobs={taskingJobs}
          tasksByJob={tasksByJob}
          onOpen={onOpen}
          onOpenTask={setLightbox}
          onDelete={isAdminHere ? deleteTask : undefined}
        />
      )}

      {view === "jobs" && taskView === "board" && taskingJobs.length === 0 && (
        <div className="bg-white border rounded-lg p-6 text-center text-sm" style={{ borderColor: "#E2E0DA", color: "#8A94A0" }}>No jobs with open tasks match this filter — tick &quot;include jobs without tasks&quot; to board every job and add their first tasks here.</div>
      )}

      {view === "jobs" && taskView === "board" && (
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
                  {jt.map((t) => (<div key={t.id} style={{ width: 210 }}><TaskCard onOpen={setLightbox} onDelete={isAdminHere ? deleteTask : undefined} t={t} /></div>))}
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

      {view === "jobs" && taskView === "cal" && (() => {
        const [yy, mm] = calMonth.split("-").map(Number);
        const first = new Date(Date.UTC(yy, mm - 1, 1));
        const monStart = new Date(first); monStart.setUTCDate(monStart.getUTCDate() - ((monStart.getUTCDay() + 6) % 7));
        const lastD = new Date(Date.UTC(yy, mm, 0)); const sunEnd = new Date(lastD); sunEnd.setUTCDate(sunEnd.getUTCDate() + (6 - ((sunEnd.getUTCDay() + 6) % 7)));
        const days: string[] = []; for (let d = new Date(monStart); d <= sunEnd; d.setUTCDate(d.getUTCDate() + 1)) days.push(toISO(new Date(d)));
        const weeks: string[][] = []; for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
        const jset = new Set(taskingJobs.map((j) => j.id));
        const openT = filteredTasks.filter((t) => !t.done && t.due && jset.has(t.j));
        const byDay: Record<string, Task[]> = {}; openT.forEach((t) => (byDay[t.due!] = byDay[t.due!] || []).push(t));
        const overdue = openT.filter((t) => taskLate(t, TODAY));
        const monthLabel = first.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
        // the customer tag says which machine this is; the job number alone does not
        const tagOf = new Map(board.jobs.map((j) => [j.id, j.tag]));
        const jobTag = (id: string) => tagOf.get(id) || "";
        const shiftMonth = (d: number) => setCalMonth(toISO(new Date(Date.UTC(yy, mm - 1 + d, 1))).slice(0, 7));
        return (
          <div className="bg-white rounded-lg border p-3" style={{ borderColor: "#E2E0DA" }}>
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <button onClick={() => shiftMonth(-1)} className="px-3 py-1 rounded font-bold text-sm" style={{ background: "#F4F2EC", color: "#22303C" }}>◀</button>
              <div className="font-bold text-center" style={{ color: "#16232F" }}>{monthLabel} <span className="text-xs font-normal" style={{ color: "#8A94A0" }}>· open tasks on their due dates · respects the filters above</span></div>
              <div className="flex gap-1 items-center">
                <button onClick={() => makePdf(weeks, byDay, monthLabel, overdue.length, jobTag)} className="px-3 py-1 rounded text-xs font-bold"
                  style={{ background: "#fff", border: "1px solid #22303C", color: "#22303C" }}
                  title="A printable month — opens your browser's print dialog, where Save as PDF is the destination">
                  🖨 Make PDF
                </button>
                <button onClick={() => setNewTaskOpen(true)} className="px-3 py-1 rounded text-xs font-bold" style={{ background: "#22303C", color: "#fff" }} title="Raise a task without leaving the calendar">+ Add Task</button>
                <button onClick={() => setCalMonth(TODAY.slice(0, 7))} className="px-2 py-1 rounded text-xs font-bold" style={{ background: "#E8600A", color: "#fff" }}>Today</button>
                <button onClick={() => shiftMonth(1)} className="px-3 py-1 rounded font-bold text-sm" style={{ background: "#F4F2EC", color: "#22303C" }}>▶</button>
              </div>
            </div>
            {overdue.length > 0 && (<div className="text-xs font-bold rounded px-2 py-1 mb-2 inline-block" style={{ background: "#B3261E", color: "#fff" }}>⚠ {overdue.length} overdue task{overdue.length === 1 ? "" : "s"} — counted against the date FIRST promised, so moving one does not clear it</div>)}
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
                          <td
                            key={d}
                            onDragOver={(e) => { if (dragTask) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } }}
                            onDrop={(e) => { e.preventDefault(); moveTaskTo(d); }}
                            className="px-1 py-1 border-l"
                            style={{
                              borderColor: "#EFEDE7",
                              background: dragTask && dragTask.due !== d ? "#EFF6FF" : d === TODAY ? "#FFF3E8" : inM ? "#fff" : "#FAF9F5",
                              opacity: inM ? 1 : 0.55, height: 64,
                            }}
                          >
                            <div className="font-bold tnum" style={{ color: d === TODAY ? "#E8600A" : "#8A94A0" }}>{parseInt(d.slice(8), 10)}{d === TODAY ? " · today" : ""}</div>
                            {list.map((t) => {
                              const c = catColour(t.cat);
                              // red on the ORIGINAL promise: a chip dragged
                              // forward keeps saying it was late, because it was
                              const late = taskLate(t, TODAY);
                              const pushed = (t.push_count ?? 0) > 0;
                              return (
                                <div
                                  key={t.id}
                                  draggable
                                  onDragStart={(e) => { setDragTask(t); e.dataTransfer.effectAllowed = "move"; }}
                                  onDragEnd={() => setDragTask(null)}
                                  onClick={() => setLightbox(t)}
                                  title={`JOB ${jobNo(t.j)} · ${t.cat || "General"} · ${t.t}\n${t.who || "unassigned"} · due ${fmtFull(t.due)}${late ? " — OVERDUE" : ""}${pushed ? `\nFirst promised ${fmtFull(t.original_due!)} · moved ${t.push_count} time${t.push_count === 1 ? "" : "s"}` : ""}\nDrag to another day to move the date.`}
                                  className="rounded px-1 py-0.5 mb-0.5 cursor-grab"
                                  style={{
                                    background: c.bg, color: c.ink,
                                    border: `1px solid ${t.due === TODAY ? "#22303C" : c.edge}`,
                                    fontSize: 9, lineHeight: 1.25, overflow: "hidden",
                                  }}
                                >
                                  {/* line one: who it belongs to. The job number
                                      goes red when the date has gone — lateness is
                                      said HERE so the chip can keep saying what
                                      kind of work it is. */}
                                  {/* Job · who · escalation · customer tag.
                                      The CATEGORY is not written out: the chip
                                      is already coloured by it and the legend
                                      names the colours, so the word only ate
                                      the room the customer needed. */}
                                  <div className="flex items-baseline gap-1" style={{ whiteSpace: "nowrap" }}>
                                    <span className="font-bold" style={late ? { background: "#B3261E", color: "#fff", borderRadius: 2, padding: "0 3px" } : undefined}>
                                      {jobNo(t.j)}
                                    </span>
                                    <span className="font-bold">{whoTag(t.who)}</span>
                                    {t.esc && t.esc !== "None" && <span style={{ color: "#B3261E", fontWeight: 700 }} title={t.esc}>⚠</span>}
                                    {pushed && <span style={{ color: "#B3261E", fontWeight: 700 }} title={`Moved ${t.push_count} time${t.push_count === 1 ? "" : "s"} — first promised ${fmtFull(t.original_due!)}`}>↻{t.push_count}</span>}
                                    <span style={{ opacity: 0.7, overflow: "hidden", textOverflow: "ellipsis" }} title={jobTag(t.j)}>{jobTag(t.j)}</span>
                                  </div>
                                  {/* line two: what it actually is, wrapped to two
                                      lines rather than cut at the first word */}
                                  <div style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", fontWeight: 600 }}>
                                    {t.t}
                                  </div>
                                </div>
                              );
                            })}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex items-center gap-2 flex-wrap mt-2">
              <span className="text-xs" style={{ color: "#8A94A0" }}>Drag a chip to another day to move its due date · tap it to open the task</span>
              <div className="flex-1" />
              {TASK_CATS.map((c) => {
                const k = catColour(c);
                return (
                  <span key={c} className="text-xs rounded px-1.5" style={{ background: k.bg, color: k.ink, border: `1px solid ${k.edge}` }}>{c}</span>
                );
              })}
              <span className="text-xs rounded px-1.5 font-bold" style={{ background: "#B3261E", color: "#fff" }}>0000</span>
              <span className="text-xs" style={{ color: "#8A94A0" }}>= overdue</span>
            </div>
          </div>
        );
      })()}

      </>
      )}

      {newTaskOpen && (
        <NewTaskBox
          jobs={board.jobs}
          owners={assignees(board)}
          onClose={() => setNewTaskOpen(false)}
          reload={reload}
        />
      )}
      {lightbox && <TaskModal canDelete={isAdminHere} task={lightbox} owners={assignees(board)} onClose={() => setLightbox(null)} onToggle={async (prevention) => { await api.post("/api/tasks", { action: "toggle", id: lightbox.id, kind: lightbox.kind, done: !lightbox.done, prevention }); setLightbox(null); await reload(); }} reload={reload} />}
    </div>
  );
}

/**
 * The month as a printable page.
 *
 * A new window with its own stylesheet rather than print rules on the app:
 * printing the live page would carry the header, the nav and the filter bar
 * onto the paper, and a wall chart with a navigation menu across the top is
 * not a wall chart. Landscape, because a week is seven columns wide.
 *
 * Browsers offer "Save as PDF" as a print destination on every platform this
 * runs on, so this needs no library and produces a real PDF.
 */
function makePdf(
  weeks: string[][],
  byDay: Record<string, Task[]>,
  monthLabel: string,
  overdueCount: number,
  jobTag: (id: string) => string,
) {
  const esc = (v: unknown) =>
    String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

  const cell = (d: string) => {
    const list = byDay[d] || [];
    const chips = list
      .map((t) => {
        const c = catColour(t.cat);
        const late = taskLate(t, TODAY);
        return `<div class="chip" style="background:${c.bg};color:${c.ink};border-color:${c.edge}">
          <div class="l1">
            <b class="${late ? "late" : ""}">${esc(jobNo(t.j))}</b>
            <b>${esc(whoTag(t.who))}</b>
            ${t.esc && t.esc !== "None" ? '<span class="esc">&#9888;</span>' : ""}
            <span class="tag">${esc(jobTag(t.j))}</span>
          </div>
          <div class="l2">${esc(t.t)}</div>
        </div>`;
      })
      .join("");
    const day = parseInt(d.slice(8), 10);
    return `<td class="${d === TODAY ? "today" : ""}"><div class="dn">${day}</div>${chips}</td>`;
  };

  const body = weeks
    .map((wk) => `<tr><td class="wk">W${isoWeek(wk[0])}</td>${wk.map(cell).join("")}</tr>`)
    .join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(monthLabel)} — Nandan Tasking</title>
<style>
  @page { size: A3 landscape; margin: 10mm; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; color: #16232F; margin: 0; }
  h1 { font-size: 16pt; margin: 0 0 2mm; }
  .sub { font-size: 9pt; color: #5A6672; margin-bottom: 3mm; }
  .warn { display: inline-block; background: #B3261E; color: #fff; font-size: 8pt; font-weight: 700; padding: 1mm 2mm; border-radius: 2px; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th { background: #22303C; color: #fff; font-size: 8pt; padding: 1.5mm; }
  td { border: 0.4pt solid #E2E0DA; vertical-align: top; padding: 1mm; height: 34mm; }
  td.wk { width: 12mm; background: #F4F2EC; text-align: center; font-weight: 700; font-size: 8pt; color: #1B3A5C; }
  td.today { background: #FFF3E8; }
  .dn { font-size: 8pt; font-weight: 700; color: #8A94A0; margin-bottom: 0.8mm; }
  .chip { border: 0.4pt solid; border-radius: 2px; padding: 0.7mm 1.2mm; margin-bottom: 0.8mm; font-size: 6.5pt; line-height: 1.25; }
  .l1 { white-space: nowrap; overflow: hidden; }
  .l1 b { margin-right: 1mm; }
  .l1 .tag { opacity: .7; }
  .l1 .late { background: #B3261E; color: #fff; border-radius: 2px; padding: 0 1mm; }
  .l1 .esc { color: #B3261E; font-weight: 700; }
  .l2 { font-weight: 600; }
</style></head><body>
<h1>${esc(monthLabel)} &middot; Nandan Tasking</h1>
<div class="sub">Open tasks on their due dates &middot; printed ${esc(fmtFull(TODAY))}
${overdueCount > 0 ? ` &middot; <span class="warn">${overdueCount} overdue, against the date first promised</span>` : ""}</div>
<table><thead><tr><th>ISO</th>${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => `<th>${d}</th>`).join("")}</tr></thead>
<tbody>${body}</tbody></table>
</body></html>`;

  const w = window.open("", "_blank");
  if (!w) {
    alert("Your browser blocked the print window. Allow pop-ups for Genie and press Make PDF again.");
    return;
  }
  w.document.write(html);
  w.document.close();
  // let the styles land before the dialog opens, or the first page prints bare
  w.onload = () => setTimeout(() => w.print(), 120);
}

/**
 * Raise a task from the calendar.
 *
 * The same fields as everywhere else, plus the one the inline form never needs
 * and this one always does: WHICH JOB. Everywhere else the form is already
 * sitting inside a job; here it is sitting on a month.
 *
 * "Save and add another" keeps the job, the person, the date and the category
 * and clears only the text — because tasks are raised in runs, and re-picking
 * the same job six times is how somebody stops using the button and goes back
 * to a notebook.
 */
function NewTaskBox({
  jobs, owners, onClose, reload,
}: {
  jobs: Job[]; owners: Assignee[]; onClose: () => void; reload: () => Promise<Board | null>;
}) {
  const [form, setForm] = useState({ t: "", who: "", due: TODAY, cat: TASK_CATS[0] as string, esc: "None", esc_why: "" });
  const [jobId, setJobId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");

  const needle = q.trim().toLowerCase();
  const list = jobs
    .filter((j) => !needle || j.id.includes(needle) || j.tag.toLowerCase().includes(needle) || j.cust.toLowerCase().includes(needle))
    .slice(0, 400);

  const save = async (again: boolean) => {
    if (!form.t.trim()) { setMsg("What is the task?"); return; }
    if (escalated(form.esc) && !form.esc_why.trim()) { setMsg("Say why it is escalated — whoever it lands on needs to know without ringing you."); return; }
    setBusy(true); setMsg("");
    try {
      await api.post("/api/tasks", {
        action: "create", job_id: jobId || null, title: form.t.trim(),
        who: form.who, due: form.due, cat: form.cat, esc: form.esc, esc_why: form.esc_why,
      });
      await reload();
      if (again) {
        // job, person, date and category survive; only the words clear
        setForm((f) => ({ ...f, t: "", esc: "None", esc_why: "" }));
        setMsg("Added ✓ — next one");
      } else onClose();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(22,35,47,0.55)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg" style={{ width: "min(540px, 100%)", maxHeight: "88vh", overflowY: "auto" }}>
        <div className="px-4 py-3 flex items-center gap-3" style={{ background: "#16232F" }}>
          <div className="font-bold text-white" style={{ fontSize: 15 }}>New task</div>
          <div className="flex-1" />
          <button onClick={onClose} className="font-bold" style={{ color: "#8FA1B3", fontSize: 20, lineHeight: 1 }}>✕</button>
        </div>
        <div className="p-4">
          <div className="text-xs font-bold mb-0.5" style={{ color: "#8A94A0" }}>JOB</div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 filter by job no, tag or customer"
            className="w-full text-xs border rounded px-2 py-1.5 mb-1" style={{ borderColor: "#E2E0DA" }} />
          <select value={jobId} onChange={(e) => setJobId(e.target.value)}
            className="w-full text-sm border rounded px-2 py-1.5 bg-white mb-3" style={{ borderColor: jobId ? "#E2E0DA" : "#E8600A" }}>
            <option value="">— no job (a general task) —</option>
            {list.map((j) => <option key={j.id} value={j.id}>{jobNo(j.id)} · {j.tag} · {j.cust}</option>)}
          </select>

          <AddTaskForm form={form} setForm={setForm} owners={owners} onSubmit={() => save(false)} onCancel={onClose} hideActions />

          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <button onClick={() => save(false)} disabled={busy} className="text-sm font-bold rounded px-4 py-1.5" style={{ background: "#E8600A", color: "#fff", opacity: busy ? 0.5 : 1 }}>
              {busy ? "Saving…" : "Save"}
            </button>
            <button onClick={() => save(true)} disabled={busy} className="text-sm font-bold rounded px-3 py-1.5"
              style={{ background: "#fff", border: "1px solid #22303C", color: "#22303C", opacity: busy ? 0.5 : 1 }}
              title="Keeps the job, the person, the date and the category — clears only the words">
              Save &amp; add another
            </button>
            {msg && <span className="text-xs font-semibold" style={{ color: msg.includes("✓") ? "#0D7A3F" : "#B3261E" }}>{msg}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Projects / Department / Goals / Escalations all show the SAME tasks the Jobs
 * view shows — only the bucket changes. One renderer, one grouping function,
 * so a filter change can never mean four different answers.
 */
function GroupedTasks({
  view,
  board,
  reload,
  jobs,
  tasksByJob,
  onOpen,
  onOpenTask,
  onDelete,
}: {
  view: TaskingView;
  board: Board;
  reload: () => Promise<Board | null>;
  jobs: Job[];
  tasksByJob: Map<string, Task[]>;
  onOpen: (id: string) => void;
  onOpenTask: (t: Task) => void;
  /** Absent when the viewer is not an admin — the card then shows no ×. */
  onDelete?: (t: Task) => void;
}) {
  // ---- adding a task straight onto a project (By Projects only) ----
  const [addingProj, setAddingProj] = useState<string | null>(null);
  const [projForm, setProjForm] = useState({ job_id: "", t: "", who: "", due: TODAY, cat: "Production", esc: "None" });

  /**
   * Every job in a project, latest deliverable first. A task raised against a
   * project almost always concerns the work still ahead, so the job that
   * delivers LAST is the sensible default — the whole project list is right
   * there in the dropdown when it isn't.
   */
  const projectJobs = useCallback(
    (proj: string) =>
      board.jobs
        .filter((j) => ((j.proj || "").trim() || "No project on the job") === proj)
        .sort((a, b) => ((a.tdd || "0000") > (b.tdd || "0000") ? -1 : 1)),
    [board.jobs],
  );

  const openProjForm = (proj: string) => {
    const last = projectJobs(proj)[0];
    setProjForm({ job_id: last?.id ?? "", t: "", who: "", due: TODAY, cat: "Production", esc: "None" });
    setAddingProj(proj);
  };
  const submitProjTask = async () => {
    if (!projForm.t.trim() || !projForm.job_id) return;
    await api.post("/api/tasks", {
      action: "create",
      job_id: projForm.job_id,
      title: projForm.t.trim(),
      who: projForm.who,
      due: projForm.due,
      cat: projForm.cat,
      esc: projForm.esc,
    });
    setAddingProj(null);
    await reload();
  };

  const rows = useMemo(() => {
    const out: { t: Task; job: Job }[] = [];
    for (const j of jobs) for (const t of tasksByJob.get(j.id) ?? []) out.push({ t, job: j });
    return out;
  }, [jobs, tasksByJob]);

  // "By Goals" is the odd one out — the goals layer keeps its own to-do engine,
  // so its items come from /api/today rather than the task board.
  const [goalItems, setGoalItems] = useState<TodayItem[] | null>(null);
  useEffect(() => {
    if (view !== "goals") return;
    api.get("/api/today").then((r) => setGoalItems((r.items || []).filter((i: TodayItem) => i.source === "goal"))).catch(() => setGoalItems([]));
  }, [view]);

  if (view === "goals") {
    if (goalItems === null)
      return <div className="bg-white rounded-lg border p-6 text-center text-sm" style={{ borderColor: "#E2E0DA", color: "#8A94A0" }}>Loading your goal work…</div>;
    if (!goalItems.length)
      return (
        <div className="bg-white rounded-lg border p-6 text-center text-sm" style={{ borderColor: "#E2E0DA", color: "#8A94A0" }}>
          No open goal work is assigned to you. Goals, sub goals and initiatives with your name on appear here once their start date arrives — the tree itself lives in the Goals workspace.
        </div>
      );
    const byGoal = new Map<string, TodayItem[]>();
    for (const g of goalItems) {
      const k = g.goalName || "Unlinked goal work";
      (byGoal.get(k) ?? byGoal.set(k, []).get(k)!).push(g);
    }
    return (
      <div className="space-y-3">
        <div className="text-xs" style={{ color: "#8A94A0" }}>
          Your own goals, sub goals and initiatives, grouped by the goal they hang off. The Show filters above apply to jobs tasks — goal work is always your own.
        </div>
        {[...byGoal.entries()].map(([goal, items]) => (
          <GroupBlock key={goal} label={goal} count={items.length} color="#7C3AED">
            {items.map((g) => (
              <div key={g.id} className="rounded p-2 border" style={{ width: 230, background: g.late ? "#FBEDEA" : "#F3EEFB", borderColor: g.late ? "#B3261E" : "#D7CBF0" }}>
                <div className="text-xs font-semibold" style={{ color: "#16232F" }}>{g.title}</div>
                <div className="flex justify-between text-xs mt-1" style={{ color: "#5A6672" }}>
                  <span>{g.cat}</span>
                  <span className="tnum">{fmt(g.due)}{g.late ? " · late" : ""}</span>
                </div>
              </div>
            ))}
          </GroupBlock>
        ))}
      </div>
    );
  }

  // the grouping key for the other three views
  const keyOf = (r: { t: Task; job: Job }) =>
    view === "projects"
      ? (r.job.proj || "").trim() || "No project on the job"
      : view === "dept"
        ? (r.t.cat || "").trim() || "Uncategorised"
        : (r.t.esc || "None").trim();

  const visible = view === "esc" ? rows.filter((r) => (r.t.esc || "None") !== "None" && !r.t.done) : rows;
  const hiddenCount = view === "esc" ? rows.filter((r) => !r.t.done).length - visible.length : 0;

  const groups = new Map<string, { t: Task; job: Job }[]>();
  // A project with no tasks yet still deserves a row — otherwise there is
  // nowhere to add its first one. Only reachable with "include jobs without
  // tasks" ticked, which is exactly when someone is looking for that.
  if (view === "projects")
    for (const j of jobs) {
      const k = (j.proj || "").trim() || "No project on the job";
      if (!groups.has(k)) groups.set(k, []);
    }
  for (const r of visible) {
    const k = keyOf(r);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
  }
  // escalations read worst-first; the rest read alphabetically
  const ordered = [...groups.entries()].sort((a, b) =>
    view === "esc" ? (b[0] < a[0] ? -1 : 1) : a[0].localeCompare(b[0]),
  );

  if (!ordered.length)
    return (
      <div className="bg-white rounded-lg border p-6 text-center text-sm" style={{ borderColor: "#E2E0DA", color: "#8A94A0" }}>
        {view === "esc"
          ? "Nothing is escalated right now. Raise the escalation level on a task and it appears here."
          : "No tasks match the filters above."}
      </div>
    );

  return (
    <div className="space-y-3">
      {view === "esc" && hiddenCount > 0 && (
        <div className="text-xs" style={{ color: "#8A94A0" }}>{hiddenCount} open task{hiddenCount === 1 ? "" : "s"} with no escalation are hidden in this view.</div>
      )}
      {ordered.map(([label, items]) => (
        <GroupBlock
          key={label}
          label={label}
          count={items.length}
          color={view === "esc" ? "#B3261E" : view === "dept" ? "#0D9488" : "#1B3A5C"}
          openCount={items.filter((r) => !r.t.done).length}
        >
          {items.map(({ t, job }) => (
            <div key={t.kind + t.id} style={{ width: 220 }}>
              <button
                onClick={() => onOpen(job.id)}
                className="text-xs font-bold underline decoration-dotted truncate block text-left w-full"
                style={{ color: "#1B3A5C" }}
                title={`${job.tag} · JOB ${jobNo(job.id)} · ${job.cust}`}
              >
                {jobNo(job.id)} · {job.tag}
              </button>
              <TaskCard t={t} onOpen={onOpenTask} onDelete={onDelete} />
            </div>
          ))}
          {view === "projects" && (
            addingProj === label ? (
              <div style={{ width: 250 }}>
                <div className="rounded border px-2 pt-2 bg-white" style={{ borderColor: "#E8600A", borderBottom: "none" }}>
                  <div className="text-xs mb-0.5" style={{ color: "#8A94A0" }}>Job — defaults to the last one to deliver</div>
                  <select
                    value={projForm.job_id}
                    onChange={(e) => setProjForm({ ...projForm, job_id: e.target.value })}
                    className="w-full text-xs border rounded px-1 py-1 bg-white"
                    style={{ borderColor: "#E2E0DA" }}
                  >
                    {projectJobs(label).map((j) => (
                      <option key={j.id} value={j.id}>{jobNo(j.id)} · {j.tag} · TDD {fmt(j.tdd)}</option>
                    ))}
                  </select>
                </div>
                <AddTaskForm
                  form={projForm}
                  setForm={setProjForm}
                  owners={assignees(board)}
                  onSubmit={submitProjTask}
                  onCancel={() => setAddingProj(null)}
                />
              </div>
            ) : (
              <button
                onClick={() => openProjForm(label)}
                className="text-xs font-bold rounded border border-dashed px-3 self-stretch"
                style={{ borderColor: "#E8600A", color: "#E8600A", minHeight: 40 }}
                title={`Add a task on ${label} — it lands on the job that delivers last unless you pick another`}
              >
                + Add task
              </button>
            )
          )}
        </GroupBlock>
      ))}
    </div>
  );
}

// ============================ Brain Dump ============================
interface DumpRow {
  id: string;
  title: string;
  detail: string | null;
  who: string | null;
  due: string | null;
  cat: string;
  esc: string | null;
  job_id: string | null;
  project: string | null;
  goal_id: string | null;
  done: boolean;
  promoted_task_id: string | null;
  created_at: string;
}

const EMPTY_DUMP = { title: "", detail: "", who: "", due: "", cat: "Production", esc: "None", job_id: "", project: "", goal_id: "" };

/**
 * The capture pad. Type the thought at the top, add whatever context you have,
 * and it drops below the line into its category. From there each line is either
 * ticked DONE or pushed onto the Tasking board as a real task.
 *
 * Lines are private to you — nothing here is visible to anyone else until it is
 * added to the board.
 */
function BrainDump({ board, reload }: { board: Board; reload: () => Promise<Board | null> }) {
  const [rows, setRows] = useState<DumpRow[] | null>(null);
  const [installed, setInstalled] = useState(true);
  const [form, setForm] = useState({ ...EMPTY_DUMP });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get("/api/brain-dump");
      setInstalled(r.installed !== false);
      setRows(r.items || []);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
      setRows([]);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const jobsByTdd = useMemo(
    () => [...board.jobs].sort((a, b) => ((a.tdd || "9999") < (b.tdd || "9999") ? -1 : 1)),
    [board.jobs],
  );
  const projects = useMemo(
    () => [...new Set(board.jobs.map((j) => (j.proj || "").trim()).filter(Boolean))].sort(),
    [board.jobs],
  );

  const add = async () => {
    if (!form.title.trim()) return;
    setBusy(true);
    setMsg("");
    try {
      await api.post("/api/brain-dump", { action: "create", ...form, due: form.due || null, job_id: form.job_id || null });
      // keep the category — people dump in runs of the same kind of thing
      setForm({ ...EMPTY_DUMP, cat: form.cat });
      await load();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const act = async (body: Record<string, unknown>, after?: () => Promise<unknown>) => {
    setMsg("");
    try { await api.post("/api/brain-dump", body); await load(); if (after) await after(); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  };

  const open = (rows || []).filter((r) => !r.done && !r.promoted_task_id);
  const closed = (rows || []).filter((r) => r.done || r.promoted_task_id);
  const byCat = new Map<string, DumpRow[]>();
  for (const r of open) {
    const k = r.cat || "Uncategorised";
    (byCat.get(k) ?? byCat.set(k, []).get(k)!).push(r);
  }

  const field = "text-xs border rounded px-2 py-1.5 bg-white";
  const label = (t: string) => <div className="text-xs font-semibold mb-1" style={{ color: "#8A94A0" }}>{t}</div>;

  return (
    <div className="space-y-3">
      {!installed && (
        <div className="rounded px-3 py-2 text-xs font-semibold" style={{ background: "#FBEDEA", color: "#B3261E" }}>
          The brain_dump table doesn&apos;t exist yet — run migration 0018 in Supabase, then reload.
        </div>
      )}

      {/* ---- the dump box ---- */}
      <div className="bg-white rounded-lg border p-3" style={{ borderColor: "#E2E0DA", borderTop: "4px solid #E8600A" }}>
        <div className="font-bold text-sm mb-2">
          Dump it here
          <span className="font-normal text-xs ml-2" style={{ color: "#8A94A0" }}>
            — only the task is required. Everything else can wait until you come back to it. Private to you.
          </span>
        </div>
        <div className="mb-2">
          {label("Task — what")}
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) add(); }}
            placeholder="e.g. Chase the hydraulic powerpack delivery date"
            className="w-full border rounded px-2 py-2 text-sm"
            style={{ borderColor: form.title ? "#E8600A" : "#D9D6CD" }}
          />
        </div>
        <div className="flex flex-wrap gap-2 mb-2">
          <div>
            {label("Assignee")}
            <select value={form.who} onChange={(e) => setForm({ ...form, who: e.target.value })} className={field} style={{ borderColor: "#D9D6CD", width: 150 }}>
              <option value="">— nobody yet —</option>
              <AssigneeOptions owners={assignees(board)} current={form.who} />
            </select>
          </div>
          <div>
            {label("Due date")}
            <input type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} className={field} style={{ borderColor: "#D9D6CD" }} />
          </div>
          <div>
            {label("Category")}
            <select value={form.cat} onChange={(e) => setForm({ ...form, cat: e.target.value })} className={field} style={{ borderColor: "#D9D6CD" }}>
              {TASK_CATS.map((c) => (<option key={c}>{c}</option>))}
            </select>
          </div>
          <div>
            {label("Escalation")}
            <select value={form.esc} onChange={(e) => setForm({ ...form, esc: e.target.value })} className={field} style={{ borderColor: "#D9D6CD" }}>
              {ESC_LEVELS.map((c) => (<option key={c}>{c}</option>))}
            </select>
          </div>
          <div>
            {label("Project")}
            <input list="bd-projects" value={form.project} onChange={(e) => setForm({ ...form, project: e.target.value })} placeholder="—" className={field} style={{ borderColor: "#D9D6CD", width: 150 }} />
            <datalist id="bd-projects">{projects.map((p) => (<option key={p} value={p} />))}</datalist>
          </div>
          <div>
            {label("Job")}
            <select value={form.job_id} onChange={(e) => setForm({ ...form, job_id: e.target.value })} className={field} style={{ borderColor: "#D9D6CD", maxWidth: 240 }} title="Needed before a line can be added to the board — the board is organised by job">
              <option value="">— no job —</option>
              {jobsByTdd.map((j) => (<option key={j.id} value={j.id}>{jobNo(j.id)} · {j.tag}</option>))}
            </select>
          </div>
          <div>
            {label("Goal")}
            <input value={form.goal_id} onChange={(e) => setForm({ ...form, goal_id: e.target.value })} placeholder="— link later —" className={field} style={{ borderColor: "#D9D6CD", width: 130 }} title="Paste a goal node id to link this to the cascade" />
          </div>
        </div>
        <div className="mb-2">
          {label("Details — how")}
          <textarea
            value={form.detail}
            onChange={(e) => setForm({ ...form, detail: e.target.value })}
            rows={2}
            placeholder="How it should be handled, who to speak to, what good looks like…"
            className="w-full border rounded px-2 py-1.5 text-sm"
            style={{ borderColor: "#D9D6CD" }}
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={add} disabled={busy || !form.title.trim()} className="rounded px-4 py-1.5 font-bold text-sm" style={{ background: "#E8600A", color: "#fff", opacity: busy || !form.title.trim() ? 0.5 : 1 }}>
            {busy ? "Adding…" : "+ Add"}
          </button>
          <span className="text-xs" style={{ color: "#8A94A0" }}>⌘/Ctrl + Enter also adds it</span>
          {msg && <span className="text-xs font-semibold" style={{ color: "#B3261E" }}>{msg}</span>}
        </div>
      </div>

      {/* ---- below the line, grouped by category ---- */}
      {rows === null && <div className="text-sm" style={{ color: "#8A94A0" }}>Loading your pad…</div>}
      {rows !== null && open.length === 0 && (
        <div className="bg-white rounded-lg border p-6 text-center text-sm" style={{ borderColor: "#E2E0DA", color: "#8A94A0" }}>
          Nothing on the pad. Whatever you dump above lands here, grouped by category.
        </div>
      )}
      {[...byCat.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([cat, items]) => (
        <div key={cat} className="bg-white rounded-lg border" style={{ borderColor: "#E2E0DA" }}>
          <div className="px-3 py-1.5 font-bold text-sm flex justify-between" style={{ background: "#F4F2EC", color: "#16232F" }}>
            <span>{cat}</span>
            <span className="font-normal text-xs" style={{ color: "#8A94A0" }}>{items.length} line{items.length === 1 ? "" : "s"}</span>
          </div>
          {items.map((r) => {
            const job = board.jobs.find((j) => j.id === r.job_id);
            return (
              <div key={r.id} className="px-3 py-2 flex items-start justify-between gap-3" style={{ borderTop: "1px solid #F4F2EC" }}>
                <div className="min-w-0">
                  <div className="text-sm font-semibold" style={{ color: "#16232F" }}>{r.title}</div>
                  {r.detail && <div className="text-xs mt-0.5" style={{ color: "#5A6672", whiteSpace: "pre-wrap" }}>{r.detail}</div>}
                  <div className="text-xs mt-1 flex flex-wrap gap-2" style={{ color: "#8A94A0" }}>
                    {r.who && <span className="font-bold rounded px-1" style={{ background: "#E8600A", color: "#fff" }}>{r.who}</span>}
                    {r.due && <span className="tnum" style={{ color: r.due < TODAY ? "#B3261E" : "#8A94A0" }}>due {fmt(r.due)}</span>}
                    {job && <span>JOB {jobNo(job.id)} · {job.tag}</span>}
                    {r.project && <span>{r.project}</span>}
                    {r.esc && r.esc !== "None" && <span className="font-bold" style={{ color: "#B3261E" }}>⚠ {r.esc}</span>}
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    onClick={() => act({ action: "done", id: r.id, done: true })}
                    className="rounded px-2 py-1 text-xs font-bold"
                    style={{ background: "#E6F4EA", color: "#0D7A3F" }}
                    title="Handled — file it away"
                  >
                    ✓ Done
                  </button>
                  <button
                    onClick={() => act({ action: "promote", id: r.id }, reload)}
                    disabled={!r.job_id}
                    className="rounded px-2 py-1 text-xs font-bold"
                    style={{ background: r.job_id ? "#16232F" : "#F4F2EC", color: r.job_id ? "#fff" : "#B8B5AC", cursor: r.job_id ? "pointer" : "not-allowed" }}
                    title={r.job_id ? "Make this a real task on the Tasking board" : "Pick a job on this line first — the board is organised by job"}
                  >
                    ↗ Add to board
                  </button>
                  <button onClick={() => act({ action: "delete", id: r.id })} className="rounded px-2 py-1 text-xs font-bold" style={{ background: "#FBEDEA", color: "#B3261E" }} title="Delete this line">✕</button>
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {closed.length > 0 && (
        <div>
          <button onClick={() => setShowDone((s) => !s)} className="text-xs font-bold" style={{ color: "#E8600A" }}>
            {showDone ? "▾" : "▸"} {closed.length} line{closed.length === 1 ? "" : "s"} cleared
          </button>
          {showDone && (
            <div className="bg-white rounded-lg border mt-1" style={{ borderColor: "#E2E0DA" }}>
              {closed.map((r) => (
                <div key={r.id} className="px-3 py-1.5 flex items-center justify-between text-xs" style={{ borderTop: "1px solid #F4F2EC", color: "#8A94A0" }}>
                  <span style={{ textDecoration: r.done ? "line-through" : "none" }}>
                    {r.title}
                    <span className="ml-2 rounded px-1 font-bold" style={{ background: r.promoted_task_id ? "#DCE8F5" : "#E6F4EA", color: r.promoted_task_id ? "#1B3A5C" : "#0D7A3F" }}>
                      {r.promoted_task_id ? "on the board" : "done"}
                    </span>
                  </span>
                  <span className="flex gap-1">
                    {r.done && !r.promoted_task_id && (
                      <button onClick={() => act({ action: "done", id: r.id, done: false })} className="font-bold" style={{ color: "#E8600A" }}>reopen</button>
                    )}
                    <button onClick={() => act({ action: "delete", id: r.id })} className="font-bold" style={{ color: "#B3261E" }}>✕</button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** One labelled bucket of cards — the shared frame for every grouped view. */
function GroupBlock({
  label, count, color, openCount, children,
}: {
  label: string; count: number; color: string; openCount?: number; children: React.ReactNode;
}) {
  return (
    <div className="flex gap-2 items-stretch">
      <div className="rounded-lg p-2 flex-shrink-0" style={{ width: 210, background: "#16232F", color: "#fff", borderLeft: `4px solid ${color}` }}>
        <div className="font-bold text-sm break-words">{label}</div>
        <div className="text-xs opacity-70">
          {count} task{count === 1 ? "" : "s"}
          {openCount !== undefined && openCount !== count ? ` · ${openCount} open` : ""}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 flex-1 items-start rounded-lg p-2" style={{ background: "#E9E6DD" }}>
        {children}
      </div>
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

function AddTaskForm({ form, setForm, owners, onSubmit, onCancel, hideActions }: { form: any; setForm: (f: any) => void; owners: Assignee[]; onSubmit: () => void; onCancel: () => void; hideActions?: boolean }) {
  return (
    <div className="rounded border p-2 mt-1 bg-white" style={{ borderColor: "#E8600A" }}>
      <datalist id="who-options">
        <AssigneeOptions owners={owners} current={form.who} />
      </datalist>
      {/* two lines, not one: a task worth raising rarely fits in a single
          line of a narrow box, and typing blind past the right-hand edge is
          how tasks end up named "Chassis spares parts list costing pend" */}
      <textarea
        autoFocus
        rows={2}
        placeholder="Task…"
        value={form.t}
        onChange={(e) => setForm({ ...form, t: e.target.value })}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSubmit(); }}
        className="w-full text-xs border rounded px-1 py-1 mb-1"
        style={{ borderColor: "#E2E0DA", resize: "vertical", lineHeight: 1.45 }}
      />
      <div className="flex gap-1 mb-1">
        {/* Typeable as well as pickable. Scrolling a dropdown for a name you
            already know is the slowest part of raising a task, and the list
            only grows. The datalist keeps every account one keystroke away
            while still accepting free text for an ERP handle we don't hold. */}
        <input
          list="who-options"
          value={form.who}
          onChange={(e) => setForm({ ...form, who: e.target.value })}
          placeholder="Who? — type or pick"
          className="w-1/2 text-xs border rounded px-1 py-1"
          style={{ borderColor: "#E2E0DA" }}
          title="Type a name or initials, or pick from the list"
        />
        <input type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} className="w-1/2 text-xs border rounded px-1 py-1" style={{ borderColor: "#E2E0DA" }} />
      </div>
      <div className="mb-1">
        <div className="text-xs mb-0.5" style={{ color: "#8A94A0" }}>Escalation Log</div>
        <select value={form.esc} onChange={(e) => setForm({ ...form, esc: e.target.value })} className="w-full text-xs border rounded px-1 py-1 bg-white" style={{ borderColor: "#E2E0DA" }}>
          {ESC_LEVELS.map((c) => (<option key={c}>{c}</option>))}
        </select>
        {escalated(form.esc) && (
          <input
            autoFocus
            value={form.esc_why || ""}
            onChange={(e) => setForm({ ...form, esc_why: e.target.value })}
            placeholder="Why escalated? (required)"
            className="w-full text-xs border rounded px-1 py-1 mt-1"
            style={{ borderColor: (form.esc_why || "").trim() ? "#E2E0DA" : "#B3261E" }}
            title="Whoever this lands on needs to know why without having to ring you"
          />
        )}
      </div>
      <div className="flex gap-1">
        <select value={form.cat} onChange={(e) => setForm({ ...form, cat: e.target.value })} className="flex-1 text-xs border rounded px-1 py-1 bg-white" style={{ borderColor: "#E2E0DA" }}>
          {TASK_CATS.map((c) => (<option key={c}>{c}</option>))}
        </select>
        {/* the modal draws its own Save / Save & add another, so the inline
            pair would be a second Add button saying the same thing */}
        {!hideActions && <button onClick={onSubmit} className="text-xs font-bold rounded px-2" style={{ background: "#E8600A", color: "#fff" }}>Add</button>}
        {!hideActions && <button onClick={onCancel} className="text-xs rounded px-1" style={{ color: "#8A94A0" }}>✕</button>}
      </div>
    </div>
  );
}

function TaskModal({ task, owners = [], onClose, onToggle, reload, canDelete = false }: { task: Task; owners?: Assignee[]; onClose: () => void; onToggle: (prevention?: string) => Promise<void> | void; reload: () => Promise<Board | null>; canDelete?: boolean }) {
  const [comments, setComments] = useState<{ by: string; at: string; body: string }[]>([]);
  // every time this task's due date has moved
  const [dateLog, setDateLog] = useState<{ id: string; old_due: string | null; new_due: string | null; by: string | null; at: string }[]>([]);
  const [cmt, setCmt] = useState("");
  const [editing, setEditing] = useState(false);
  /**
   * Closing an ESCALATED task asks what stops it happening again -- every
   * level, set by Dr Raghu. The server refuses without it and so does the
   * table's own check; this is just the place it gets typed.
   */
  const [closing, setClosing] = useState(false);
  const [prevent, setPrevent] = useState("");
  const [closeErr, setCloseErr] = useState("");
  const [ef, setEf] = useState({ t: task.t || "", d: task.d || "", who: task.who || "", due: task.due || "", cat: task.cat || "Production", esc: task.esc || "None" });
  const isMs = String(task.id).startsWith("ms"); // milestone pseudo-card from the Job Plan kanban
  useEffect(() => {
    if (isMs) return;
    api.get(`/api/comments?task_id=${task.id}&task_kind=${task.kind}`).then((r) => setComments(r.comments)).catch(() => {});
    api.get(`/api/task-dates?task_id=${task.id}&task_kind=${task.kind}`)
      .then((r) => setDateLog(r.moves || []))
      .catch(() => setDateLog([]));
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
            /* Three lines, then an ellipsis. A pasted paragraph of a task
               title used to push the Escalation chip, the buttons and the
               comments off the bottom of the modal; the full text is on hover
               and in Edit. */
            <div
              className="font-bold text-sm"
              title={task.t}
              style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}
            >
              {task.t}
            </div>
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
              <button
                onClick={() => {
                  // Re-opening asks nothing. Only the way IN to done costs a sentence.
                  if (!task.done && escalated(task.esc)) { setCloseErr(""); setClosing(true); return; }
                  onToggle();
                }}
                className="rounded px-2 py-1 font-bold"
                style={{ background: task.done ? "#E7E4DC" : "#0D7A3F", color: task.done ? "#5A6672" : "#fff" }}
              >
                {task.done ? "Reopen" : escalated(task.esc) ? "✓ Done…" : "✓ Done"}
              </button>
              {/* Admins only. Everyone else closes it — Done keeps the comments
                  and the date history that deleting throws away. */}
              {canDelete && (
                <button onClick={remove} className="rounded px-2 py-1 font-bold" style={{ background: "#FBEDEA", color: "#B3261E" }} title="Delete this task (admin)">🗑</button>
              )}
            </div>
          </>
        )}

        {!isMs && (
          <div className="mt-3 border-t pt-2" style={{ borderColor: "#EEECE6" }}>
            {/* The date history sits ABOVE the comments and reads like one.
                A due date that has moved four times IS the story of the task,
                and burying it in a field somebody has to compare by memory is
                how a task quietly slips a month one week at a time. */}
            {(dateLog.length > 0 || (task.push_count ?? 0) > 0) && (
              <div className="rounded p-2 mb-2" style={{ background: "#FBEDEA", border: "1px solid #F0C9C4" }}>
                <div className="text-xs font-bold mb-1" style={{ color: "#B3261E" }}>
                  Date moved {task.push_count ?? dateLog.length} time{(task.push_count ?? dateLog.length) === 1 ? "" : "s"}
                  {task.original_due && <span className="font-normal" style={{ color: "#8A5A00" }}> · first promised {fmtFull(task.original_due)}</span>}
                </div>
                {dateLog.map((m) => (
                  <div key={m.id} className="text-xs" style={{ color: "#5A6672", lineHeight: 1.5 }}>
                    <b style={{ color: "#22303C" }}>{m.by || "someone"}</b> moved it{" "}
                    {m.old_due ? fmtFull(m.old_due) : "no date"} → <b style={{ color: "#B3261E" }}>{m.new_due ? fmtFull(m.new_due) : "no date"}</b>
                    <span style={{ color: "#B8B5AC" }}> · {String(m.at).slice(0, 10).split("-").reverse().join("-")}</span>
                  </div>
                ))}
                {dateLog.length === 0 && (
                  <div className="text-xs" style={{ color: "#8A94A0" }}>Moved before Genie started recording who moved it.</div>
                )}
              </div>
            )}
            {closing && (
              <div className="rounded p-2.5 mb-2" style={{ background: "#FBEDEA", border: "1px solid #B3261E" }}>
                <div className="text-xs font-bold mb-1" style={{ color: "#B3261E" }}>
                  ⚠ Closing an escalated task ({task.esc})
                </div>
                <div className="text-xs mb-1.5" style={{ color: "#5A6672", lineHeight: 1.5 }}>
                  What is being done so this does not happen again? Not what was done to fix this one —
                  what changes so the next job does not hit it.
                </div>
                <textarea
                  autoFocus
                  rows={3}
                  value={prevent}
                  onChange={(e) => { setPrevent(e.target.value); if (closeErr) setCloseErr(""); }}
                  placeholder="e.g. BOM now frozen before drawings release — added as a gate on the Design milestone"
                  className="w-full text-xs border rounded px-2 py-1"
                  style={{ borderColor: "#D9A9A2" }}
                />
                {closeErr && <div className="text-xs font-bold mt-1" style={{ color: "#B3261E" }}>{closeErr}</div>}
                <div className="flex items-center gap-2 mt-1.5">
                  <button
                    onClick={async () => {
                      const note = prevent.trim();
                      if (note.length < 15) { setCloseErr("A sentence, please — at least 15 characters."); return; }
                      try {
                        await onToggle(note);
                      } catch (e) {
                        setCloseErr(e instanceof Error ? e.message : String(e));
                      }
                    }}
                    className="rounded px-3 py-1 text-xs font-bold text-white"
                    style={{ background: "#0D7A3F" }}
                  >
                    ✓ Save and close the task
                  </button>
                  <button onClick={() => { setClosing(false); setPrevent(""); setCloseErr(""); }} className="text-xs font-semibold" style={{ color: "#8A94A0" }}>Cancel</button>
                  <span className="text-xs ml-auto tnum" style={{ color: prevent.trim().length < 15 ? "#B3261E" : "#0D7A3F" }}>
                    {prevent.trim().length}/15
                  </span>
                </div>
              </div>
            )}
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
/**
 * ERP Update — the corrections still to be put back into the ERP.
 *
 * Genie is downstream: tomorrow's Jobmaster redraws the board, so a value
 * corrected here undoes itself overnight unless somebody applies it upstream
 * too. This is that list, and it survives the browser tab — which the old
 * session-only change log did not, so a day's corrections died with it.
 *
 * The JOB ID leads every line, because the job of this page is to be pasted
 * over a spreadsheet and uploaded, not read.
 */
function UpdateToErp({ erpLog }: { erpLog: ErpLogEntry[] }) {
  const [rows, setRows] = useState<{ id: string; job_id: string; field: string; label: string; old_value: string | null; new_value: string | null; changed_by: string | null; changed_at: string }[] | null>(null);
  const [installed, setInstalled] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get("/api/erp-update")
      .then((r) => { setInstalled(r.installed !== false); setRows(r.rows || []); })
      .catch(() => setRows([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  /** One line per correction, job id first. Excel opens it, the ERP takes it. */
  const download = () => {
    if (!rows?.length) return;
    const esc = (v: unknown) => {
      const t = String(v ?? "");
      return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const csv = [
      ["Job ID", "Field", "New value", "Was", "Changed by", "Changed at"].join(","),
      ...rows.map((r) => [r.job_id, r.label, r.new_value, r.old_value, r.changed_by, String(r.changed_at).slice(0, 16).replace("T", " ")].map(esc).join(",")),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `erp-update-${TODAY}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const markDone = async () => {
    if (!window.confirm(`Mark all ${rows?.length} lines as applied in the ERP?\n\nThey leave this list. Nothing is deleted — the record of what was corrected stays.`)) return;
    setBusy(true);
    try { await api.post("/api/erp-update", { action: "exported" }); load(); }
    finally { setBusy(false); }
  };

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <div>
          <div className="text-xs font-bold" style={{ color: "#8A94A0", letterSpacing: 1.4 }}>UPDATE TO ERP</div>
          <div className="text-lg font-bold" style={{ color: "#16232F", lineHeight: 1.2 }}>
            Corrections waiting to go back
          </div>
        </div>
        <div className="flex-1" style={{ minWidth: 10 }} />
        {!!rows?.length && (
          <>
            <button onClick={download} className="text-xs font-bold rounded px-3 py-1.5" style={{ background: "#E8600A", color: "#fff" }}>
              ⬇ Download CSV · {rows.length}
            </button>
            <button onClick={markDone} disabled={busy} className="text-xs font-bold rounded px-3 py-1.5"
              style={{ background: "#fff", border: "1px solid #0D7A3F", color: "#0D7A3F", opacity: busy ? 0.5 : 1 }}>
              ✓ Mark all applied
            </button>
          </>
        )}
      </div>

      {!installed && (
        <div className="rounded p-3 mb-3 text-sm" style={{ background: "#FFF7E6", border: "1px solid #F0D9A8", color: "#8A5A00" }}>
          Run <code>supabase/migrations/0031_erp_update_queue.sql</code> and corrections will start collecting here.
        </div>
      )}

      <div className="text-xs mb-2" style={{ color: "#8A94A0", lineHeight: 1.5 }}>
        Everything corrected in Genie that the ERP does not know about yet. The job id leads each line so a row can be
        found and overwritten. One line per job and field — editing the same field twice before an export leaves the
        latest value, not two changes to apply in order.
      </div>

      {rows && rows.length === 0 ? (
        <div className="bg-white rounded-lg border p-8 text-center text-sm" style={{ borderColor: "#E2E0DA", color: "#8A94A0" }}>
          Nothing waiting. Everything corrected in Genie has been put back into the ERP.
        </div>
      ) : (
        <div className="bg-white rounded-lg border overflow-x-auto" style={{ borderColor: "#E2E0DA" }}>
          <table className="text-xs w-full" style={{ borderCollapse: "collapse", minWidth: 720 }}>
            <thead>
              <tr style={{ background: "#22303C", color: "#fff" }}>
                <th className="px-2 py-1.5 text-left">Job ID</th>
                <th className="px-2 py-1.5 text-left">Field</th>
                <th className="px-2 py-1.5 text-left">New value</th>
                <th className="px-2 py-1.5 text-left">Was</th>
                <th className="px-2 py-1.5 text-left">By</th>
                <th className="px-2 py-1.5 text-left">When</th>
              </tr>
            </thead>
            <tbody>
              {(rows || []).map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid #EEECE6" }}>
                  <td className="px-2 py-1 font-bold tnum" style={{ color: "#1B3A5C" }}>{r.job_id}</td>
                  <td className="px-2 py-1" style={{ color: "#5A6672" }}>{r.label}</td>
                  <td className="px-2 py-1 font-semibold" style={{ color: "#16232F", maxWidth: 280 }}>{r.new_value || <i style={{ color: "#B8B5AC" }}>(cleared)</i>}</td>
                  <td className="px-2 py-1" style={{ color: "#B8B5AC", maxWidth: 220 }}>{r.old_value || "—"}</td>
                  <td className="px-2 py-1" style={{ color: "#8A94A0" }}>{r.changed_by}</td>
                  <td className="px-2 py-1 tnum" style={{ color: "#8A94A0" }}>{String(r.changed_at).slice(0, 16).replace("T", " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {erpLog.length > 0 && (
        <div className="text-xs mt-3" style={{ color: "#B8B5AC" }}>
          {erpLog.length} change{erpLog.length === 1 ? "" : "s"} made in this browser session are included above.
        </div>
      )}
    </div>
  );
}

// ============================ Admin ============================
type AdminTab = "users" | "org" | "milestones" | "setup" | "report" | "updates" | "software";

/**
 * The Name column stays put while the rest scrolls. With department,
 * designation, last login and the access columns the table is now wider than
 * any screen, and a row of settings with no name attached is unreadable.
 */
const STICKY_NAME = {
  position: "sticky" as const,
  left: 0,
  background: "#fff",
  zIndex: 2,
  boxShadow: "1px 0 0 #EEECE6",
};

/**
 * The org chart, drawn from `reports_to` — nobody maintains it.
 *
 * That is the whole point: an org chart kept as a separate document is wrong
 * within a month, because the day somebody changes who they report to, nobody
 * remembers to redraw it. This one IS the reporting column, so it cannot
 * disagree with the thing the boards, Tasking and Team Goals already use.
 *
 * Two failures it shows rather than hides:
 *
 *   ORPHANS. Anybody with no manager set is listed at the top as a root. If
 *   that list is long, the chart is not a chart yet, and the page says so
 *   instead of drawing fifteen separate trees and looking finished.
 *
 *   CYCLES. A reports to B, B reports to A — a mis-click in the row above.
 *   Every person is drawn once, so a cycle stops rather than spinning, and the
 *   people caught in it are named.
 */
function OrgChart({ users, departments }: { users: AdminUser[] | null; departments: { id: string; name: string }[] }) {
  const [deptFilter, setDeptFilter] = useState("");
  if (!users) return <div className="p-4 text-sm" style={{ color: "#8A94A0" }}>Loading people…</div>;

  const live = users.filter((u) => !u.disabled);
  const byId = new Map(live.map((u) => [u.id, u]));
  const deptName = (id: string | null) => (id ? departments.find((d) => d.id === id)?.name ?? null : null);

  const kids = new Map<string, AdminUser[]>();
  const roots: AdminUser[] = [];
  for (const u of live) {
    const mgr = u.reports_to && byId.has(u.reports_to) && u.reports_to !== u.id ? u.reports_to : null;
    if (mgr) (kids.get(mgr) ?? kids.set(mgr, []).get(mgr)!).push(u);
    else roots.push(u);
  }
  for (const list of kids.values()) list.sort((a, b) => (a.display_name || a.email).localeCompare(b.display_name || b.email));
  roots.sort((a, b) => (a.display_name || a.email).localeCompare(b.display_name || b.email));

  // every person drawn once — a cycle terminates instead of recursing forever
  const drawn = new Set<string>();
  const countBelow = (id: string, seen = new Set<string>()): number => {
    if (seen.has(id)) return 0;
    seen.add(id);
    return (kids.get(id) || []).reduce((s, k) => s + 1 + countBelow(k.id, seen), 0);
  };

  const match = (u: AdminUser) => !deptFilter || u.department_id === deptFilter;

  const Node = ({ u, depth }: { u: AdminUser; depth: number }) => {
    if (drawn.has(u.id)) return null;
    drawn.add(u.id);
    const below = kids.get(u.id) || [];
    const dept = deptName(u.department_id);
    const dim = deptFilter && !match(u);
    return (
      <div style={{ marginLeft: depth ? 18 : 0, borderLeft: depth ? "1px solid #E2E0DA" : undefined, paddingLeft: depth ? 10 : 0 }}>
        <div className="flex items-center gap-2 flex-wrap py-1" style={{ opacity: dim ? 0.35 : 1 }}>
          <span className="font-bold rounded px-1.5 text-xs" style={{ background: "#DCE8F5", color: "#1B3A5C" }}>
            {u.initials || (u.display_name || u.email).slice(0, 2).toUpperCase()}
          </span>
          <span className="font-semibold text-sm" style={{ color: "#16232F" }}>{u.display_name || u.email.split("@")[0]}</span>
          {u.designation && <span className="text-xs" style={{ color: "#5A6672" }}>{u.designation}</span>}
          {dept && <span className="text-xs rounded px-1.5" style={{ background: "#F4F2EC", color: "#5A6672" }}>{dept}</span>}
          <span className="text-xs" style={{ color: "#B8B5AC" }}>{u.role}</span>
          {below.length > 0 && (
            <span className="text-xs tnum" style={{ color: "#8A94A0" }} title="Everyone below them, all the way down">
              {below.length} direct · {countBelow(u.id)} in all
            </span>
          )}
        </div>
        {below.map((k) => <Node key={k.id} u={k} depth={depth + 1} />)}
      </div>
    );
  };

  const realRoots = roots.filter((r) => (kids.get(r.id) || []).length > 0);
  const loose = roots.filter((r) => (kids.get(r.id) || []).length === 0);

  return (
    <div className="bg-white rounded-lg border p-3" style={{ borderColor: "#E2E0DA" }}>
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <div className="font-bold text-sm">
          Org chart{" "}
          <span className="font-normal text-xs" style={{ color: "#8A94A0" }}>
            — drawn from “Reports to” on the Users tab. Change it there and this redraws itself.
          </span>
        </div>
        <div className="flex-1" style={{ minWidth: 10 }} />
        <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}
          className="text-xs border rounded px-2 py-1 bg-white font-semibold" style={{ borderColor: "#E2E0DA" }}>
          <option value="">Highlight: all departments</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      {live.length === 0 && <div className="text-sm" style={{ color: "#8A94A0" }}>No active accounts.</div>}

      {realRoots.map((r) => (
        <div key={r.id} className="mb-2 pb-2" style={{ borderBottom: "1px solid #EFEDE7" }}>
          <Node u={r} depth={0} />
        </div>
      ))}

      {loose.length > 0 && (
        <div className="rounded p-2.5 mt-2" style={{ background: "#FFF7E6", border: "1px solid #F0D9A8" }}>
          <div className="text-xs font-bold mb-1" style={{ color: "#8A5A00" }}>
            {loose.length} account{loose.length === 1 ? "" : "s"} with nobody above and nobody below
          </div>
          <div className="text-xs" style={{ color: "#5A6672", lineHeight: 1.5 }}>
            {loose.map((u) => u.display_name || u.email.split("@")[0]).join(", ")}.
            {" "}Set <b>Reports to</b> on the Users tab and they join the chart. Until then the chart is a partial
            picture, which is worth knowing before anybody reads it as the whole one.
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The image quotes, read straight out of a Drive folder.
 *
 * Sync is a button rather than a schedule: the folder changes when somebody
 * adds a picture to it, which is not often, and a nightly job that silently
 * fails is worse than a button that says what it found.
 */
function ImageQuotesPanel() {
  const [d, setD] = useState<{ installed: boolean; folder: string | null; images: { id: string; url: string; src: string | null; active: boolean }[] } | null>(null);
  const [folder, setFolder] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    api.get("/api/image-quote").then((r) => { setD(r); setFolder(r.folder || ""); }).catch(() => setD(null));
  }, []);
  useEffect(() => { load(); }, [load]);

  const sync = async () => {
    setBusy(true); setMsg("");
    try {
      const r = await api.post("/api/image-quote", { action: "sync", folder: folder || undefined });
      setMsg(r.ok
        ? `Read ${r.found} file${r.found === 1 ? "" : "s"} · ${r.added} new · ${r.retired} no longer in the folder`
        : r.error || "Nothing came back");
      load();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  if (!d) return null;
  const live = d.images.filter((i) => i.active);

  return (
    <div className="bg-white rounded-lg border p-3" style={{ borderColor: "#E2E0DA" }}>
      <div className="font-bold text-sm mb-2">
        Image quotes{" "}
        <span className="font-normal text-xs" style={{ color: "#8A94A0" }}>
          — one shown on My Week each day, the same one for everybody
        </span>
      </div>
      {!d.installed ? (
        <div className="text-xs" style={{ color: "#D97706" }}>Run migration 0029 first.</div>
      ) : (
        <>
          <div className="flex gap-2 flex-wrap items-end">
            <div style={{ flex: "1 1 320px" }}>
              <div className="text-xs font-semibold mb-1" style={{ color: "#8A94A0" }}>Google Drive folder (link or id)</div>
              <input value={folder} onChange={(e) => setFolder(e.target.value)}
                className="w-full text-xs border rounded px-2 py-1.5" style={{ borderColor: "#E2E0DA" }}
                placeholder="https://drive.google.com/drive/folders/…" />
            </div>
            <button onClick={sync} disabled={busy} className="text-xs font-bold rounded px-3 py-1.5"
              style={{ background: "#E8600A", color: "#fff", opacity: busy ? 0.5 : 1 }}>
              {busy ? "Reading Drive…" : "↻ Sync from Drive"}
            </button>
            <span className="text-xs" style={{ color: "#8A94A0" }}>{live.length} live of {d.images.length}</span>
          </div>
          {msg && <div className="text-xs mt-1.5 font-semibold" style={{ color: msg.includes("Read") ? "#0D7A3F" : "#B3261E" }}>{msg}</div>}
          <div className="text-xs mt-1" style={{ color: "#B8B5AC", lineHeight: 1.5 }}>
            The folder must be shared <b>anyone with the link</b>. Genie caches what it finds, so a bad day at Google
            leaves yesterday&apos;s pictures working rather than an empty panel.
          </div>
          {live.length > 0 && (
            <div className="flex gap-1 flex-wrap mt-2" style={{ maxHeight: 150, overflowY: "auto" }}>
              {live.slice(0, 60).map((i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i.id} src={i.src || ""} alt="" style={{ width: 54, height: 40, objectFit: "cover", borderRadius: 3, border: "1px solid #E2E0DA" }} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * The review deck — eight pages, built from the boards at the moment it is
 * asked for.
 *
 * There is no stored copy and no "last generated" date on purpose. A deck kept
 * on a shelf goes stale silently, and a stale deck presented as current is
 * worse than none; this one is rebuilt on every press and carries the date it
 * was run on its first page.
 *
 * The PDF comes from the browser's own Save as PDF rather than a renderer on
 * the server. That is not a shortcut around a missing library — it is the only
 * way the page that is checked on screen and the page that comes out of the
 * printer are the same page.
 */
function ReportPanel() {
  const open = (print: boolean) =>
    window.open(`/api/deck${print ? "?print=1" : ""}`, "_blank", "noopener");

  const ON_IT = [
    ["The year", "anticipated sales and throughput against the FY target"],
    ["Since 1 April", "delivered month by month, under the run rate now required"],
    ["The order book", "every job by delivery month, and where the book stops"],
    ["By product", "the families, ordered by what they actually earn"],
    ["Kitting vs production", "what is nearly out, and what is bought and not moving"],
    ["Closest to going out", "the jobs at the line, and the tasks still open on them"],
    ["A closer look", "one family — Hi Lifts — job by job, with who is waiting"],
    ["Escalations", "how many, at what level, and what the jobs themselves say"],
  ];

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-lg border p-4" style={{ borderColor: "#E2E0DA" }}>
        <div className="font-bold text-sm">
          Review deck{" "}
          <span className="font-normal text-xs" style={{ color: "#8A94A0" }}>
            — eight pages, 16:9, built live from the boards
          </span>
        </div>
        <p className="text-xs mt-1 mb-3" style={{ color: "#5A6672", maxWidth: "44rem", lineHeight: 1.6 }}>
          Every figure on it is queried when you press the button — nothing is typed in and nothing is
          cached, so the deck cannot drift from the boards. It carries the date it was run on the first
          page. <b>Download PDF</b> opens the deck and goes straight to your browser&apos;s print dialog;
          choose <b>Save as PDF</b> and <b>Paper size: 13.33 × 7.5in</b> if it is offered, or leave the
          default — the page already sets it.
        </p>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => open(true)}
            className="px-4 py-2 rounded text-sm font-bold text-white"
            style={{ background: "#E8600A" }}
          >
            ⬇ Download PDF
          </button>
          <button
            onClick={() => open(false)}
            className="px-4 py-2 rounded text-sm font-semibold border"
            style={{ borderColor: "#E2E0DA", color: "#22303C" }}
          >
            👁 Open on screen
          </button>
          <a
            href="/api/deck?format=json"
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2 rounded text-sm font-semibold border"
            style={{ borderColor: "#E2E0DA", color: "#5A6672" }}
          >
            {"{ }"} The figures behind it
          </a>
        </div>
      </div>

      <div className="bg-white rounded-lg border p-4" style={{ borderColor: "#E2E0DA" }}>
        <div className="font-bold text-sm mb-2">What is on it</div>
        <div className="space-y-1">
          {ON_IT.map(([t, d]) => (
            <div key={t} className="text-xs flex gap-2" style={{ color: "#5A6672", lineHeight: 1.7 }}>
              <b style={{ color: "#22303C", width: "11rem", flexShrink: 0 }}>{t}</b>
              <span>{d}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * LC / Stratcom / Management, as three boxes in one cell.
 *
 * Read-only for everyone but the owner, and shown rather than hidden to the
 * rest: who is in the room is not a secret, and a column that appears only for
 * one person is a column nobody else can ask about.
 */
function GroupTicks({
  u,
  isOwner,
  onSet,
}: {
  u: { id: string; email: string; lc?: boolean; stratcom?: boolean; management?: boolean };
  isOwner: boolean;
  onSet: (id: string, next: { lc: boolean; stratcom: boolean; management: boolean }) => void;
}) {
  // The owner is in all three implicitly and has no stored row to tick.
  const owner = u.email.toLowerCase() === OWNER_EMAIL;
  const cur = { lc: !!u.lc, stratcom: !!u.stratcom, management: !!u.management };
  const on = (k: "lc" | "stratcom" | "management") => (owner ? true : cur[k]);

  return (
    <div className="flex gap-2 whitespace-nowrap">
      {GROUPS.map((g) => {
        const checked = on(g.key);
        // Un-ticking LC would silently drop Stratcom too, so say so on the box
        // rather than letting the other tick vanish without explanation.
        const willDrop = g.key === "lc" && checked && cur.stratcom;
        return (
          <label
            key={g.key}
            className="flex items-center gap-1"
            style={{ cursor: isOwner && !owner ? "pointer" : "default", opacity: owner ? 0.55 : 1 }}
            title={owner ? "The owner is in all three already" : willDrop ? `${g.title} — un-ticking this drops Stratcom as well` : g.title}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={!isOwner || owner}
              onChange={(e) => onSet(u.id, { ...cur, [g.key]: e.target.checked })}
              style={{ accentColor: "#1B3A5C", width: 13, height: 13, cursor: isOwner && !owner ? "pointer" : "default" }}
            />
            <span style={{ fontSize: 10.5, color: checked ? "#1B3A5C" : "#8A94A0", fontWeight: checked ? 700 : 400 }}>
              {g.label}
            </span>
          </label>
        );
      })}
    </div>
  );
}

function AdminTabs({ tab, setTab }: { tab: AdminTab; setTab: (t: AdminTab) => void }) {
  return (
    <div className="flex gap-1 rounded p-1 bg-white border" style={{ borderColor: "#E2E0DA", width: "fit-content" }}>
      {([["users", "👥 Users"], ["org", "🧬 Org Chart"], ["milestones", "🏁 Milestones"], ["setup", "⚙ Settings"], ["report", "📊 Report"], ["updates", "🗒 Updates"], ["software", "📘 Software description"]] as const).map(([k, l]) => (
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
      {/* What it has cost, in time. Measured from the commit history rather
          than remembered — and shown with its working, because a number like
          this gets repeated without it. */}
      <div className="rounded px-3 py-2.5 mb-2" style={{ background: "#16232F", color: "#fff" }}>
        <div className="text-xs font-bold" style={{ letterSpacing: 1.2, color: "#8FA1B3" }}>TIME INVESTED · TO {fmtFull(EFFORT.measuredTo).toUpperCase()}</div>
        <div className="flex gap-6 flex-wrap items-baseline mt-1">
          <div>
            <div className="tnum font-bold" style={{ fontSize: 26, color: "#F5B32B", lineHeight: 1.1 }}>{EFFORT.raghuLow}–{EFFORT.raghuHigh} h</div>
            <div className="text-xs" style={{ color: "#9FB0C0" }}>Dr Raghu — specifying and reviewing</div>
          </div>
          <div>
            <div className="tnum font-bold" style={{ fontSize: 20, color: "#fff", lineHeight: 1.2 }}>{EFFORT.windowHours} h</div>
            <div className="text-xs" style={{ color: "#9FB0C0" }}>build window across {EFFORT.days} days</div>
          </div>
          <div>
            <div className="tnum font-bold" style={{ fontSize: 20, color: "#fff", lineHeight: 1.2 }}>{EFFORT.commits}</div>
            <div className="text-xs" style={{ color: "#9FB0C0" }}>commits · {UPDATES.length} releases</div>
          </div>
        </div>
        <div className="text-xs mt-2" style={{ color: "#6B7C8C", lineHeight: 1.5, maxWidth: "72ch" }}>
          The window is the sum, over every day worked, of the span between that day&apos;s first and last commit.
          It over-counts where the middle of a day went elsewhere, and under-counts the thinking that happens
          before the first commit — so Dr Raghu&apos;s own time is given as a range rather than a figure that
          would look measured and would not be.
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
  board, reload, users, loadUsers, departments, isOwner, appSettings, loadAppSettings,
}: {
  departments: { id: string; name: string }[];
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

  // ---- FY targets: owner-only, the numbers the Required Run Rate is measured
  // against. Typed in crore because that is how they are set and spoken about;
  // stored in rupees like every other value in the suite, so nothing downstream
  // has to know about the unit.
  const CR = 10000000;
  const [tgt, setTgt] = useState<{ fy: string; sales: string; throughput: string; loaded: boolean; hasTarget: boolean; installed: boolean; updatedBy: string | null }>(
    { fy: "", sales: "", throughput: "", loaded: false, hasTarget: false, installed: true, updatedBy: null },
  );
  const [tgtMsg, setTgtMsg] = useState("");
  const [tBusy, setTBusy] = useState(false);
  const loadTargets = useCallback(async () => {
    try {
      const r = await api.get("/api/run-rate");
      setTgt({
        fy: r.fy || "",
        sales: r.installed && r.hasTarget ? String(r.targets.sales / CR) : "",
        throughput: r.installed && r.hasTarget ? String(r.targets.throughput / CR) : "",
        loaded: true,
        hasTarget: !!r.hasTarget,
        installed: !!r.installed,
        updatedBy: r.updatedBy ?? null,
      });
    } catch { setTgt((t) => ({ ...t, loaded: true, installed: false })); }
  }, []);
  useEffect(() => { loadTargets(); }, [loadTargets]);
  const saveTargets = async () => {
    const s = Number(tgt.sales), t = Number(tgt.throughput);
    if (!Number.isFinite(s) || !Number.isFinite(t) || s < 0 || t < 0) {
      setTgtMsg("Both targets must be a number of crore, zero or more.");
      return;
    }
    setTBusy(true); setTgtMsg("");
    try {
      await api.post("/api/run-rate", { fy: tgt.fy, sales_target: s * CR, throughput_target: t * CR });
      await loadTargets();
      setTgtMsg("Saved ✓ — the Required Run Rate on both boards now reads against this.");
    } catch (e) { setTgtMsg(e instanceof Error ? e.message : String(e)); }
    finally { setTBusy(false); }
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
  const saveProfile = async (id: string, patch: Record<string, string | null>) => {
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
  /**
   * The three group ticks. Owner only, and Stratcom drags LC with it.
   *
   * The whole row is sent every time rather than the one box that changed:
   * the rule that Stratcom implies LC means one tick can move two values, and
   * a PATCH of the single changed field would have the server and the screen
   * disagreeing about the other one until the next reload.
   */
  const setGroups = async (id: string, next: { lc: boolean; stratcom: boolean; management: boolean }) => {
    setGaMsg("");
    try {
      const g = normaliseGroups(next);
      await api.post("/api/admin/users", { action: "groups", id, ...g });
      loadUsers();
    } catch (e) { setGaMsg(e instanceof Error ? e.message : String(e)); }
  };

  /**
   * HRMS access, from the same row. Owner only, like the group ticks.
   *
   * The grant is stored against the EMAIL (migration 0047), so this tick and
   * a grant made before the account existed are the same row.
   */
  const setHrms = async (id: string, grant: boolean) => {
    setGaMsg("");
    try {
      await api.post("/api/admin/users", { action: "hrms_access", id, grant });
      loadUsers();
    } catch (e) { setGaMsg(e instanceof Error ? e.message : String(e)); }
  };

  /** The CRM grant, beside HRMS. Owner only, same as HRMS. */
  const setCrm = async (id: string, grant: boolean) => {
    setGaMsg("");
    try {
      await api.post("/api/admin/users", { action: "crm_access", id, grant });
      loadUsers();
    } catch (e) { setGaMsg(e instanceof Error ? e.message : String(e)); }
  };

  /** Goals access from inside the Users table. Reloads both lists. */
  const setGoalsLevel = async (id: string, level: string) => {
    const who = (users ?? []).find((x) => x.id === id);
    await setAccess(id, level, who?.display_name || who?.email || "user");
    loadUsers();
  };
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
  const [adminTab, setAdminTab] = useState<AdminTab>("users");
  // Goals access is folded away behind a toggle on the Users tab. It is the
  // only place a grant can be revoked, so it is hidden rather than removed —
  // a page nobody can reach is a permission nobody can take back.
  const [showGoalsAccess, setShowGoalsAccess] = useState(false);

  if (adminTab === "updates") {
    return (
      <div className="p-4 space-y-4">
        <AdminTabs tab={adminTab} setTab={setAdminTab} />
        <Updates />
      </div>
    );
  }

  // The software description is a document, not a settings panel — it returns
  // on its own for the same reason Updates does: the other tabs stack cards
  // into a shared column and this one owns the width.
  if (adminTab === "software") {
    return (
      <div className="p-4 space-y-4">
        <AdminTabs tab={adminTab} setTab={setAdminTab} />
        <SoftwareDescription />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <AdminTabs tab={adminTab} setTab={setAdminTab} />
      {adminTab === "setup" && <LabourRatesCard />}

      {adminTab === "setup" && <ImageQuotesPanel />}

      {adminTab === "setup" && (<>
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
      </>)}

      {adminTab === "setup" && (<>
      {/* ---- financial-year targets ----
          Shown to every admin, editable by the owner alone. A target the board
          can quietly edit is not a target; a target nobody can find is not one
          either, so the others see it and see who set it. */}
      {tgt.loaded && (
        <div className="bg-white rounded-lg border p-3" style={{ borderColor: "#E2E0DA" }}>
          <div className="font-bold text-sm mb-2">
            Targets{" "}
            <span className="font-normal text-xs" style={{ color: "#8A94A0" }}>
              — what the Required Run Rate on the Job Delivery Board and Delivered Jobs is measured against
            </span>
          </div>
          {/* The year first, then its numbers. A target with no year on it is
              the thing that gets carried forward by accident. */}
          <div className="rounded px-2.5 py-1.5 mb-2 inline-block" style={{ background: "#16232F" }}>
            <div style={{ fontSize: 10, color: "#8FA1B3", letterSpacing: 1.2 }}>FINANCIAL YEAR</div>
            <div className="font-bold tnum" style={{ fontSize: 17, color: "#F5B32B", lineHeight: 1.2 }}>
              {tgt.fy || "—"}
            </div>
          </div>
          {!tgt.installed ? (
            <div className="text-xs" style={{ color: "#D97706", lineHeight: 1.6 }}>
              Run <code style={{ background: "#F4F2EC", padding: "1px 5px", borderRadius: 3 }}>supabase/migrations/0025_fy_targets.sql</code>{" "}
              in the Supabase SQL editor, then reload. Until then the run-rate card stays hidden rather than showing a
              target of zero.
            </div>
          ) : (
            <>
              <div className="flex gap-4 flex-wrap items-end">
                <div>
                  <div className="text-xs font-semibold mb-1" style={{ color: "#8A94A0" }}>Sales target (₹ Cr)</div>
                  <input value={tgt.sales} onChange={(e) => setTgt({ ...tgt, sales: e.target.value })} disabled={!isOwner}
                    inputMode="decimal" className="text-xs border rounded px-2 py-1.5 tnum text-right"
                    style={{ borderColor: "#E2E0DA", width: 110, background: isOwner ? "#fff" : "#F4F2EC" }} />
                </div>
                <div>
                  <div className="text-xs font-semibold mb-1" style={{ color: "#8A94A0" }}>Throughput target (₹ Cr)</div>
                  <input value={tgt.throughput} onChange={(e) => setTgt({ ...tgt, throughput: e.target.value })} disabled={!isOwner}
                    inputMode="decimal" className="text-xs border rounded px-2 py-1.5 tnum text-right"
                    style={{ borderColor: "#E2E0DA", width: 110, background: isOwner ? "#fff" : "#F4F2EC" }} />
                </div>
                {isOwner && (
                  <button onClick={saveTargets} disabled={tBusy} className="text-xs font-bold rounded px-3 py-1.5"
                    style={{ background: "#E8600A", color: "#fff", opacity: tBusy ? 0.5 : 1 }}>
                    {tBusy ? "Saving…" : "Save targets"}
                  </button>
                )}
                {tgtMsg && <span className="text-xs font-semibold" style={{ color: tgtMsg.includes("✓") ? "#0D7A3F" : "#B3261E" }}>{tgtMsg}</span>}
              </div>
              <div className="text-xs mt-2" style={{ color: "#8A94A0", lineHeight: 1.55 }}>
                {!tgt.hasTarget
                  ? `No target is set for ${tgt.fy} yet. The run-rate card says so on both boards rather than carrying last year's number forward.`
                  : <>Whole-year targets, measured against what has actually been <b>delivered</b> since 1 April — a job counts on the day it goes out of the door, not the day it is promised.</>}
                {" "}
                {isOwner
                  ? "You are the only account that can change these."
                  : <>Only <b>{OWNER_EMAIL}</b> can change these{tgt.updatedBy ? <>; last set by <b>{tgt.updatedBy}</b></> : null}.</>}
              </div>
            </>
          )}
        </div>
      )}
      </>)}

      {adminTab === "users" && (<>
      {/* ---- users ---- */}
      <div className="bg-white rounded-lg border p-3" style={{ borderColor: "#E2E0DA" }}>
        <div className="font-bold text-sm mb-2">User management <span className="font-normal text-xs" style={{ color: "#8A94A0" }}>— initials are the key used to assign tasks and filter the boards</span></div>
        <div className="flex gap-1 mb-2 flex-wrap items-center">
          <input placeholder="email" value={uForm.email} onChange={(e) => setUForm({ ...uForm, email: e.target.value })} className="text-xs border rounded px-2 py-1 flex-1" style={{ borderColor: "#E2E0DA", minWidth: 170 }} />
          <input placeholder="full name" value={uForm.name} onChange={(e) => setUForm({ ...uForm, name: e.target.value })} className="text-xs border rounded px-2 py-1" style={{ borderColor: "#E2E0DA", width: 130 }} />
          <input placeholder="ABC" maxLength={3} value={uForm.initials} onChange={(e) => setUForm({ ...uForm, initials: e.target.value.toUpperCase() })} className="text-xs border rounded px-2 py-1 text-center font-bold" style={{ borderColor: "#E2E0DA", width: 52 }} title="Two or three letters — leave blank to auto-generate" />
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
              <th className="text-left py-1 font-semibold" style={STICKY_NAME}>Name</th>
              <th className="text-left py-1 font-semibold">Email</th>
              <th className="text-left py-1 font-semibold" title="The Planning Owner / Project Owner text as it appears in the Jobmaster — links this login to its jobs">ERP User</th>
              <th className="text-left py-1 font-semibold" title="Read by Goals — departmental goals, and who a department's head can edit">Department</th>
              <th className="text-left py-1 font-semibold" title="Job title, shown on Goals and the org view">Designation</th>
              <th className="text-left py-1 font-semibold" title="Their line manager — drives “tasks of people reporting to me” in Nandan Tasking">Reports to</th>
              <th className="text-left py-1 font-semibold" title="Sales Genie access comes with the role now: Sales team, Admins and the owner">Role</th>
              <th className="text-left py-1 font-semibold" title="Goals access is granted per person, not by role">Goals</th>
              <th className="text-left py-1 font-semibold" title="HRMS — the employee records at /hrms. Dates of birth, contact details and next of kin. Granted per person by the owner alone.">HRMS</th>
              <th className="text-left py-1 font-semibold" title="Which room they are in. Not a role — this does not change what they may do, only what they may see. Only the owner may tick these.">Groups</th>
              <th className="text-left py-1 font-semibold" title="When this account last signed in">Last seen</th>
              <th className="text-left py-1 font-semibold">Status</th>
              <th className="text-right py-1 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users === null && (
              // skeleton rows — keeps the table height stable while loading
              [0, 1, 2].map((i) => (
                <tr key={"sk" + i} style={{ borderTop: "1px solid #EEECE6" }}>
                  <td className="py-2" colSpan={9}>
                    <div className="rounded" style={{ height: 12, width: `${60 - i * 10}%`, background: "#EFEDE7" }} />
                  </td>
                </tr>
              ))
            )}
            {users?.length === 0 && (
              <tr><td className="py-3" colSpan={9} style={{ color: "#8A94A0" }}>No users found.</td></tr>
            )}
            {(users ?? []).map((u) => (
              <tr key={u.id} style={{ borderTop: "1px solid #EEECE6" }}>
                <td className="py-1.5">
                  <input
                    defaultValue={u.initials || ""}
                    maxLength={3}
                    placeholder="—"
                    onBlur={(e) => { const v = e.target.value.toUpperCase(); if (v !== (u.initials || "")) saveProfile(u.id, { initials: v }); }}
                    className="text-xs border rounded px-1 py-0.5 text-center font-bold w-12"
                    style={{ borderColor: u.initials ? "#E2E0DA" : "#E8600A", color: "#E8600A" }}
                    title="Two or three letters, unique across everyone — press Tab to save"
                  />
                </td>
                <td className="py-1.5" style={STICKY_NAME}>
                  <input
                    defaultValue={u.display_name || ""}
                    placeholder="—"
                    onBlur={(e) => { if (e.target.value !== (u.display_name || "")) saveProfile(u.id, { display_name: e.target.value }); }}
                    className="text-xs border rounded px-1 py-0.5 w-32"
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
                    title="Must match the Planning Owner / Project Owner value in the Jobmaster export"
                  />
                </td>
                <td className="py-1.5">
                  <select
                    value={u.department_id || ""}
                    onChange={(e) => saveProfile(u.id, { department_id: e.target.value || null })}
                    className="text-xs border rounded px-1 py-0.5 bg-white"
                    style={{ borderColor: "#E2E0DA", maxWidth: 130 }}
                    title="Read by Goals — departmental goals, and what a department head may edit"
                  >
                    <option value="">— none —</option>
                    {departments.map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}
                  </select>
                </td>
                <td className="py-1.5">
                  <input
                    defaultValue={u.designation || ""}
                    placeholder="—"
                    onBlur={(e) => { if (e.target.value !== (u.designation || "")) saveProfile(u.id, { designation: e.target.value }); }}
                    className="text-xs border rounded px-1 py-0.5 w-28"
                    style={{ borderColor: "#E2E0DA" }}
                    title="Job title, e.g. Head - Works"
                  />
                </td>
                <td className="py-1.5">
                  <select
                    value={u.reports_to || ""}
                    onChange={(e) => saveProfile(u.id, { reports_to: e.target.value })}
                    className="text-xs border rounded px-1 py-0.5 bg-white"
                    style={{ borderColor: "#E2E0DA", maxWidth: 130 }}
                    title="Their line manager. Tasking's “tasks of people reporting to me” reads this."
                  >
                    <option value="">— nobody —</option>
                    {(users ?? [])
                      .filter((p) => p.id !== u.id && !p.disabled)
                      .map((p) => (<option key={p.id} value={p.id}>{p.display_name || p.email.split("@")[0]}</option>))}
                  </select>
                </td>
                <td className="py-1.5">
                  {rolePending[u.id] && <span className="mr-1" title="Saving…">⏳</span>}
                  <select value={rolePending[u.id] ?? u.role} onChange={(e) => setRole(u.id, e.target.value)} disabled={!mayManage(u) || !!rolePending[u.id]} className="text-xs border rounded px-1" style={{ borderColor: rolePending[u.id] ? "#E8600A" : "#E2E0DA", background: mayManage(u) ? "#fff" : "#F4F2EC", color: mayManage(u) ? "#22303C" : "#8A94A0", opacity: rolePending[u.id] ? 0.7 : 1 }} title={rolePending[u.id] ? "Saving…" : mayManage(u) ? ROLE_OPTIONS.find((r) => r.value === u.role)?.hint : `Only ${OWNER_EMAIL} may change this account`}>
                    {ROLE_OPTIONS.map((r) => (<option key={r.value} value={r.value}>{r.label}</option>))}
                  </select>
                </td>
                <td className="py-1.5">
                  <select
                    value={u.goals_level || "none"}
                    onChange={(e) => setGoalsLevel(u.id, e.target.value)}
                    className="text-xs border rounded px-1 py-0.5 bg-white font-semibold"
                    style={{ borderColor: "#E2E0DA", color: u.goals_level === "edit" ? "#0D7A3F" : u.goals_level === "view" ? "#1B3A5C" : "#8A94A0" }}
                    disabled={u.email.toLowerCase() === OWNER_EMAIL || (u.role === "admin" && !isOwner)}
                    title="Seeing the goal tree is granted per person. Work assigned to someone reaches them on My Week either way."
                  >
                    <option value="none">no access</option>
                    <option value="view">can view</option>
                    <option value="edit">can edit</option>
                  </select>
                </td>
                <td className="py-1.5">
                  <input
                    type="checkbox"
                    checked={!!u.hrms_access}
                    disabled={!isOwner || u.hrms_implicit}
                    onChange={(e) => setHrms(u.id, e.target.checked)}
                    style={{ accentColor: "#E8600A", width: 13, height: 13, cursor: isOwner && !u.hrms_implicit ? "pointer" : "default" }}
                    title={u.hrms_implicit ? "The owner holds HRMS already" : isOwner ? "Open /hrms — the employee master, contact details and next of kin" : `Only ${OWNER_EMAIL} may grant HRMS`}
                  />
                </td>
                <td className="py-1.5">
                  <div className="flex items-center gap-2">
                    <GroupTicks u={u} isOwner={isOwner} onSet={setGroups} />
                    <label className="flex items-center gap-1 whitespace-nowrap text-xs"
                      title="Marks this person ready to connect Gmail — the connect itself happens with an administrator in tow"
                      style={{ cursor: "pointer", color: "#5A6672" }}>
                      <input
                        type="checkbox"
                        checked={!!(u as { oauth_available?: boolean }).oauth_available}
                        onChange={async (e) => {
                          try {
                            await api.post("/api/admin/users", { action: "profile", id: u.id, oauth_available: e.target.checked });
                            await loadUsers();
                          } catch (err) {
                            window.alert(err instanceof Error ? err.message : String(err));
                            await loadUsers();
                          }
                        }}
                      />
                      ✉ OAuth
                    </label>
                  </div>
                </td>
                <td className="py-1.5 tnum" style={{ color: "#8A94A0" }}>
                  {u.last_sign_in_at ? fmtFull(String(u.last_sign_in_at).slice(0, 10)) : "never"}
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
          Initials and names save when you click away from the field. Jobs are filtered by <b>Planning Owners</b>; tasks are assigned to <b>Users</b> — both lists come only from accounts created here, never from raw spreadsheet text.
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
      </>)}

      {/* ── who can open the two apps that are not Genie ── */}
      {adminTab === "users" && (
        <div className="bg-white rounded-lg border p-3" style={{ borderColor: "#E2E0DA" }}>
          <div className="font-bold text-sm mb-1">
            🗝 App access <span className="font-normal text-xs" style={{ color: "#8A94A0" }}>— the two applications that are not Genie</span>
          </div>
          <div className="text-xs mb-3 rounded p-2" style={{ background: "#F4F2EC", color: "#5A6672", lineHeight: 1.5 }}>
            <b>CRM</b> (genie.nandan.co.in/crm) and <b>HRMS</b> (genie.nandan.co.in/hrms) are separate applications
            reached with the same login. Both are granted per person and to <b>nobody by default</b>, and only{" "}
            {OWNER_EMAIL} may tick them — HRMS holds dates of birth, home addresses and next of kin, and the CRM holds
            the pipeline. Somebody with no tick simply never sees the door.
          </div>
          {gaMsg && <div className="text-xs font-semibold mb-2" style={{ color: gaMsg.includes("✓") ? "#0D7A3F" : "#B3261E" }}>{gaMsg}</div>}
          <div className="overflow-x-auto">
            <table className="text-xs w-full" style={{ minWidth: 520 }}>
              <thead>
                <tr style={{ color: "#8A94A0" }}>
                  <th className="text-left py-1 font-semibold">Person</th>
                  <th className="text-left py-1 font-semibold">Email</th>
                  <th className="text-center py-1 font-semibold" title="genie.nandan.co.in/crm">💼 CRM</th>
                  <th className="text-center py-1 font-semibold" title="genie.nandan.co.in/hrms — people records">👤 HRMS</th>
                </tr>
              </thead>
              <tbody>
                {(users ?? []).filter((u) => !u.disabled).map((u) => (
                  <tr key={u.id} style={{ borderTop: "1px solid #EEECE6" }}>
                    <td className="py-1.5">{u.display_name || u.email.split("@")[0]}</td>
                    <td className="py-1.5" style={{ color: "#8A94A0" }}>{u.email}</td>
                    <td className="py-1.5 text-center">
                      <input type="checkbox" checked={!!u.crm_access} disabled={!isOwner || u.crm_implicit}
                        onChange={(e) => setCrm(u.id, e.target.checked)}
                        style={{ accentColor: "#1B3A5C", width: 14, height: 14, cursor: isOwner && !u.crm_implicit ? "pointer" : "default" }}
                        title={u.crm_implicit ? "The owner holds it already" : isOwner ? "Open the CRM" : `Only ${OWNER_EMAIL} may grant this`} />
                    </td>
                    <td className="py-1.5 text-center">
                      <input type="checkbox" checked={!!u.hrms_access} disabled={!isOwner || u.hrms_implicit}
                        onChange={(e) => setHrms(u.id, e.target.checked)}
                        style={{ accentColor: "#E8600A", width: 14, height: 14, cursor: isOwner && !u.hrms_implicit ? "pointer" : "default" }}
                        title={u.hrms_implicit ? "The owner holds it already" : isOwner ? "Open HRMS — people records" : `Only ${OWNER_EMAIL} may grant this`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-xs mt-2" style={{ color: "#8A94A0", lineHeight: 1.6 }}>
            Both grants are held against the <b>email address</b>, so somebody can be granted before their Genie
            account exists — the grant waits for the account. Anyone granted here can edit as well as read.
          </div>
        </div>
      )}

      {adminTab === "users" && (
        <button onClick={() => setShowGoalsAccess((v) => !v)} className="text-xs font-bold rounded px-3 py-1.5"
          style={{ background: "#fff", border: "1px solid #E2E0DA", color: "#5A6672" }}>
          {showGoalsAccess ? "▲ Hide goals access" : "▼ Goals access — who can open the goal tree"}
        </button>
      )}
      {adminTab === "users" && showGoalsAccess && (<>
      {/* ---- goals access ---- */}
      <div className="bg-white rounded-lg border p-3" style={{ borderColor: "#E2E0DA" }}>
        <div className="font-bold text-sm mb-1">
          🎯 Goals access <span className="font-normal text-xs" style={{ color: "#8A94A0" }}>— who can open the goal tree</span>
        </div>
        <div className="text-xs mb-3 rounded p-2" style={{ background: "#F4F2EC", color: "#5A6672", lineHeight: 1.5 }}>
          Access is <b>granted, not automatic</b>. Someone with <b>no access</b> still sees the goal work assigned to
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
      </>)}

      {adminTab === "report" && <ReportPanel />}

      {adminTab === "org" && <OrgChart users={users} departments={departments} />}

      {adminTab === "milestones" && (<>
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
      </>)}

      {adminTab === "milestones" && (<>
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
      </>)}

    </div>
  );
}


// ============================ Live Projects ============================

/** The projects row a job's proj id points at, plus Genie's own description. */
type ProjMeta = { id: string; name?: string; mgr?: string; stage?: string; committed?: string; exp_end?: string; so?: string; cust?: string | null; description?: string | null };
type ProjGroup = {
  id: string; meta: ProjMeta | undefined; jobs: Job[]; firstTdd: string;
  /** The project's money: Original counts its past jobs too; invested and
   *  WIP are jobMoney() summed over what is still live. */
  money: { origVal: number; delVal: number; pendVal: number; invested: number; wip: number; kitPct: number };
  deliveredCount: number;
};

/**
 * Every project that still has a live job on the board, with what is open
 * against each job — the project-level answer to "where do we stand".
 * Projects sort by the TDD of their first job; a job opens its lightbox, the
 * PROJ number opens the project's own — description, combined GANTT, and the
 * project plan the planner keeps (Dr Raghu, 26 Aug 2026: planning moves up
 * to project level, so the plan uses the job schema exactly).
 */
function LiveProjects({
  board, V, canEdit, reload,
}: {
  board: Board;
  V: (n: number) => string;
  canEdit: boolean;
  reload: () => Promise<Board | null>;
}) {
  const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState<"tdd" | "value" | "kit" | "wip">("tdd");
  const [closed, setClosed] = useState<Set<string>>(new Set());
  /** Job rows whose On Floor-style detail is unfolded. */
  const [openJobs, setOpenJobs] = useState<Set<string>>(new Set());
  const [pickedJob, setPickedJob] = useState<Job | null>(null);
  const [openProj, setOpenProj] = useState<string | null>(null);

  // what is open against a job, counted the same way the other tabs count it:
  // materials — every kitting line not yet Received (QC Defective is pending);
  // design — open tasks in the Design category; tasks — every other open task.
  const openByJob = useMemo(() => {
    const m = new Map<string, { mat: number; design: number; tasks: number }>();
    const at = (id: string) => {
      let v = m.get(id);
      if (!v) { v = { mat: 0, design: 0, tasks: 0 }; m.set(id, v); }
      return v;
    };
    for (const [jobId, list] of Object.entries(board.materials || {})) {
      at(jobId).mat = list.filter((x) => String(x.status || "").toLowerCase() !== "received").length;
    }
    for (const t of board.tasks) {
      if (t.done) continue;
      if (t.cat === "Design") at(t.j).design += 1;
      else at(t.j).tasks += 1;
    }
    return m;
  }, [board.materials, board.tasks]);

  const projById = useMemo(
    () => new Map((board.projects as ProjMeta[]).map((p) => [String(p.id), p])),
    [board.projects],
  );

  // every project carrying a live job, soonest first — before any search
  const groupsAll = useMemo(() => {
    const byProj = new Map<string, Job[]>();
    for (const j of board.jobs) {
      const key = String(j.proj || "").trim();
      if (!key) continue; // a job with no project is not a project
      (byProj.get(key) || byProj.set(key, []).get(key)!).push(j);
    }
    // the project's past — delivered and archived jobs still count in Original
    const pastByProj = new Map<string, Job[]>();
    for (const a of Object.values(board.archived || {})) {
      const key = String(a.proj || "").trim();
      if (!key || !byProj.has(key)) continue;
      (pastByProj.get(key) || pastByProj.set(key, []).get(key)!).push(a);
    }
    const out: ProjGroup[] = [...byProj.entries()].map(([id, js]) => {
      const jobs = [...js].sort((a, b) => String(a.tdd || "9999").localeCompare(String(b.tdd || "9999")));
      const past = pastByProj.get(id) || [];
      const delivered = past.filter((x) => x.delivered);
      const pendVal = jobs.reduce((a, j) => a + (j.val || 0), 0);
      const delVal = delivered.reduce((a, j) => a + (j.val || 0), 0);
      const origVal = pendVal + past.reduce((a, j) => a + (j.val || 0), 0);
      let matSum = 0, kitSum = 0, wip = 0;
      for (const j of jobs) {
        const m = jobMoney(j);
        matSum += m.material; kitSum += m.kitted; wip += m.wip;
      }
      return {
        id, meta: projById.get(id), jobs, firstTdd: jobs[0].tdd || "9999",
        money: { origVal, delVal, pendVal, invested: kitSum, wip, kitPct: matSum > 0 ? (kitSum / matSum) * 100 : 0 },
        deliveredCount: delivered.length,
      };
    });
    // by the TDD of the first job within each project — the default order
    out.sort((a, b) => a.firstTdd.localeCompare(b.firstTdd));
    return out;
  }, [board.jobs, board.archived, projById]);

  const groups = useMemo(() => {
    const base = [...groupsAll];
    // Value and WIP: biggest first. Kitting: LEAST kitted first — that is the
    // project needing the chase, and a sort that buries it helps nobody.
    if (sortBy === "value") base.sort((a, b) => b.money.pendVal - a.money.pendVal);
    else if (sortBy === "wip") base.sort((a, b) => b.money.wip - a.money.wip);
    else if (sortBy === "kit") base.sort((a, b) => a.money.kitPct - b.money.kitPct);
    const needle = q.trim().toLowerCase();
    return needle
      ? base.filter((g) =>
          g.id.toLowerCase().includes(needle) ||
          String(g.meta?.name || "").toLowerCase().includes(needle) ||
          String(g.meta?.mgr || "").toLowerCase().includes(needle) ||
          g.jobs.some((j) => jobNo(j.id).includes(needle) || j.tag.toLowerCase().includes(needle) || j.cust.toLowerCase().includes(needle)))
      : base;
  }, [groupsAll, q, sortBy]);

  const tot = useMemo(() => {
    const t = { jobs: 0, mat: 0, design: 0, tasks: 0, val: 0, wip: 0 };
    for (const g of groups) {
      t.wip += g.money.wip;
      for (const j of g.jobs) {
        const o = openByJob.get(j.id);
        t.jobs += 1; t.val += j.val;
        if (o) { t.mat += o.mat; t.design += o.design; t.tasks += o.tasks; }
      }
    }
    return t;
  }, [groups, openByJob]);

  const num = (n: number, hot: string) => (
    <b className="tnum" style={{ color: n ? hot : "#C9C6BD", fontSize: 14 }}>{n || "—"}</b>
  );
  const toggle = (id: string) => setClosed((c) => {
    const n = new Set(c);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const toggleJob = (id: string) => setOpenJobs((c) => {
    const n = new Set(c);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const openGroup = openProj ? groupsAll.find((g) => g.id === openProj) : null;

  return (
    <div className="max-w-[1200px] mx-auto px-4 pb-4">
      {/* the top row floats under the frozen header, like the Job Plan's */}
      <div className="flex items-baseline gap-x-3 gap-y-1 flex-wrap py-2.5 mb-3"
        style={{ position: "sticky", top: "var(--hdr-h, 92px)", zIndex: 24, background: "#F1EFE9", borderBottom: "1px solid #E2E0DA" }}>
        <h2 className="text-lg font-bold" style={{ color: "#16232F" }}>Live Projects</h2>
        <span className="text-xs" style={{ color: "#8A94A0" }}>
          {groups.length} project{groups.length === 1 ? "" : "s"} · {tot.jobs} live job{tot.jobs === 1 ? "" : "s"} · {V(tot.val)} pending · {V(tot.wip)} WIP ·
          open: <b style={{ color: "#8A5A00" }}>{tot.mat}</b> material · <b style={{ color: "#7C3AED" }}>{tot.design}</b> design · <b style={{ color: "#1B3A5C" }}>{tot.tasks}</b> tasks
        </span>
        <span className="flex items-center gap-1.5 ml-auto flex-wrap">
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="text-xs font-bold border rounded px-2 py-1.5" style={{ borderColor: "#E2E0DA", background: "#fff", color: "#22303C" }}
            title="How the projects order themselves">
            <option value="tdd">Sort: First TDD</option>
            <option value="value">Sort: Pending value</option>
            <option value="kit">Sort: Kitting % (least first)</option>
            <option value="wip">Sort: WIP</option>
          </select>
          <button onClick={() => { setClosed(new Set(groupsAll.map((g) => g.id))); setOpenJobs(new Set()); }} className="text-xs font-bold rounded px-2 py-1.5 border" style={{ borderColor: "#E2E0DA", background: "#fff", color: "#5A6672" }}>Collapse all</button>
          <button onClick={() => setClosed(new Set())} className="text-xs font-bold rounded px-2 py-1.5 border" style={{ borderColor: "#E2E0DA", background: "#fff", color: "#5A6672" }}>Expand all</button>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search project / job / customer…"
            className="text-xs border rounded px-2 py-1.5"
            style={{ borderColor: "#E2E0DA", background: "#fff", minWidth: 200 }}
          />
        </span>
      </div>

      {groups.length === 0 && (
        <div className="bg-white rounded-lg border p-6 text-sm" style={{ borderColor: "#E2E0DA", color: "#8A94A0" }}>
          No project carries a live job{q ? " matching that search" : ""}.
        </div>
      )}

      {groups.map((g) => {
        const late = g.jobs.filter((j) => j.tdd && j.tdd < TODAY).length;
        const shut = closed.has(g.id);
        return (
          <div key={g.id} className="bg-white rounded-lg border mb-3 overflow-hidden" style={{ borderColor: "#E2E0DA" }}>
            {/* the project band — its details lead, its jobs fold beneath */}
            <div className="px-3 py-2" style={{ background: "#16232F" }}>
              <div className="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap">
                <button onClick={() => toggle(g.id)} className="font-bold" title={shut ? "Expand the jobs" : "Collapse the jobs"} style={{ color: "#8FA1B3", fontSize: 13, width: 16 }}>{shut ? "▸" : "▾"}</button>
                <b className="text-sm cursor-pointer" style={{ color: "#fff" }} onClick={() => toggle(g.id)}>{g.meta?.name || g.id}</b>
                <button onClick={() => setOpenProj(g.id)} className="text-xs font-bold rounded px-1.5 py-0.5" title="Open the project — description, combined GANTT, project plan" style={{ background: "#E8600A", color: "#fff" }}>
                  {g.id.replace(/^NGSE-PROJ-/, "PROJ ")}
                </button>
                {g.meta?.mgr && <span className="text-xs" style={{ color: "#8FA1B3" }}>PM <b style={{ color: "#D7DEE6" }}>{g.meta.mgr}</b></span>}
                {g.meta?.stage && <span className="text-xs" style={{ color: "#8FA1B3" }}>stage <b style={{ color: "#D7DEE6" }}>{g.meta.stage}</b></span>}
                {g.meta?.committed && <span className="text-xs" style={{ color: "#8FA1B3" }}>committed <b style={{ color: "#D7DEE6" }}>{fmt(g.meta.committed)}</b></span>}
                {g.meta?.so && <span className="text-xs" style={{ color: "#8FA1B3" }}>{g.meta.so}</span>}
                <span className="text-xs ml-auto" style={{ color: "#8FA1B3" }}>
                  {g.jobs.length} live job{g.jobs.length === 1 ? "" : "s"}
                  {g.deliveredCount > 0 && <> · {g.deliveredCount} delivered</>}
                  {late > 0 && <b style={{ color: "#F5B32B" }}> · {late} past TDD</b>}
                </span>
              </div>
              {/* the money line: what the project was, what has landed, what remains */}
              <div className="text-xs mt-1 flex gap-x-3.5 gap-y-0.5 flex-wrap tnum" style={{ paddingLeft: 22, color: "#8FA1B3" }}>
                <span>Value <b style={{ color: "#D7DEE6" }}>{V(g.money.origVal)}</b></span>
                <span>Delivered <b style={{ color: "#7BC98A" }}>{V(g.money.delVal)}</b></span>
                <span>Pending <b style={{ color: "#F5B32B" }}>{V(g.money.pendVal)}</b></span>
                <span title="Kitted material value across the live jobs — (1 − T%) × Kitting% × Value">Material invested <b style={{ color: "#D7DEE6" }}>{V(g.money.invested)}</b></span>
                <span title="Kitted material + throughput earned by production">WIP <b style={{ color: "#C9A9F0" }}>{V(g.money.wip)}</b></span>
                <span>Kitting <b style={{ color: "#D7DEE6" }}>{Math.round(g.money.kitPct)}%</b></span>
              </div>
              {g.meta?.description && (
                <div className="text-xs mt-1" style={{ color: "#B9C4CF", paddingLeft: 22, whiteSpace: "pre-wrap" }}>
                  {g.meta.description}
                </div>
              )}
            </div>
            {!shut && (
            <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr className="text-xs" style={{ color: "#8A94A0", background: "#F7F5F0" }}>
                  <th className="text-left px-3 py-1.5 font-bold">JOB</th>
                  <th className="text-left px-2 py-1.5 font-bold">OTD</th>
                  <th className="text-left px-2 py-1.5 font-bold" title="Target Delivery Date — the date the board runs on">TDD</th>
                  <th className="text-right px-2 py-1.5 font-bold" title="Kitting lines not yet Received">PENDING MATERIAL</th>
                  <th className="text-right px-2 py-1.5 font-bold" title="Open tasks in the Design category">PENDING DESIGN</th>
                  <th className="text-right px-3 py-1.5 font-bold" title="Every other open task on the job">PENDING TASKS</th>
                </tr>
              </thead>
              <tbody>
                {g.jobs.map((j) => {
                  const o = openByJob.get(j.id) || { mat: 0, design: 0, tasks: 0 };
                  const lateJob = j.tdd && j.tdd < TODAY;
                  const openJ = openJobs.has(j.id);
                  const m = jobMoney(j);
                  return (
                    <React.Fragment key={j.id}>
                    <tr onClick={() => setPickedJob(j)} className="cursor-pointer hover:bg-[#F7F5F0]" style={{ borderTop: "1px solid #F0EEE8" }} title="Open the job — ▸ unfolds its details">
                      <td className="px-3 py-1.5">
                        <button onClick={(e) => { e.stopPropagation(); toggleJob(j.id); }} className="font-bold mr-1" title={openJ ? "Fold the details" : "Unfold the details"} style={{ color: "#B8B5AC", fontSize: 12, width: 14 }}>{openJ ? "▾" : "▸"}</button>
                        <b className="tnum" style={{ color: "#1B3A5C" }}>{jobNo(j.id)}</b>{" "}
                        <span style={{ color: "#22303C" }}>{j.tag}</span>
                        {j.onFloor && <span className="text-xs font-bold ml-1" title="On Floor now" style={{ color: "#0D7A3F" }}>● floor</span>}
                        <span className="text-xs ml-1" style={{ color: "#8A94A0" }}>{j.cust}</span>
                      </td>
                      <td className="px-2 py-1.5 tnum text-xs" style={{ color: "#5A6672" }}>{fmt(j.otd)}</td>
                      <td className="px-2 py-1.5 tnum text-xs font-bold" style={{ color: lateJob ? "#B3261E" : "#22303C" }}>{fmt(j.tdd)}</td>
                      <td className="px-2 py-1.5 text-right">{num(o.mat, "#8A5A00")}</td>
                      <td className="px-2 py-1.5 text-right">{num(o.design, "#7C3AED")}</td>
                      <td className="px-3 py-1.5 text-right">{num(o.tasks, "#1B3A5C")}</td>
                    </tr>
                    {openJ && (
                      <tr>
                        <td colSpan={6} style={{ background: "#FBFAF7", borderTop: "1px dashed #E2E0DA", padding: "8px 14px 9px 32px" }}>
                          {/* the On Floor read of this job, folded under its row */}
                          <div className="flex gap-x-4 gap-y-1 flex-wrap text-xs" style={{ color: "#5A6672" }}>
                            <span>Status <b style={{ color: "#22303C" }}>{j.stat || "—"}</b></span>
                            <span>Production <b style={{ color: "#1B3A5C" }}>{j.pct || 0}%</b></span>
                            <span>Kitting <b style={{ color: (j.kit || 0) >= 80 ? "#0D7A3F" : (j.kit || 0) >= 40 ? "#8A5A00" : "#B3261E" }}>{j.kit || 0}%</b></span>
                            <span>Value <b style={{ color: "#22303C" }}>{V(j.val)}</b></span>
                            <span title="Kitted material value — money already in steel and parts">Material invested <b style={{ color: "#22303C" }}>{V(m.kitted)}</b></span>
                            <span title="Kitted material + throughput earned by production">WIP <b style={{ color: "#7C3AED" }}>{V(m.wip)}</b></span>
                            {j.start && <span>Started <b style={{ color: "#22303C" }}>{fmt(j.start)}</b></span>}
                            <span>Owner <b style={{ color: "#22303C" }}>{j.ownerInitials || j.own || "—"}</b></span>
                          </div>
                          <div className="flex gap-x-4 gap-y-1 flex-wrap text-xs mt-1" style={{ color: "#8A94A0" }}>
                            <span>Quality <b style={{ color: j.qualityOwner ? "#22303C" : "#B8B5AC" }}>{j.qualityOwner || "not set"}</b></span>
                            <span>Production <b style={{ color: j.productionOwner ? "#22303C" : "#B8B5AC" }}>{j.productionOwner || "not set"}</b></span>
                            <span>Kitting <b style={{ color: j.kittingOwner ? "#22303C" : "#B8B5AC" }}>{j.kittingOwner || "not set"}</b></span>
                            <span>Design <b style={{ color: j.designOwner ? "#22303C" : "#B8B5AC" }}>{j.designOwner || "not set"}</b></span>
                          </div>
                          {j.floorSummary && (
                            <div className="text-xs mt-1" style={{ color: "#22303C" }}>
                              <b style={{ color: "#8A94A0" }}>FROM THE FLOOR</b> {redactMoney(j.floorSummary)}
                              {j.floorSummaryAt && <span style={{ color: "#B8B5AC" }}> · {fmt(String(j.floorSummaryAt).slice(0, 10))}</span>}
                            </div>
                          )}
                          {j.note && (
                            <div className="text-xs mt-1" style={{ color: "#5A6672" }}>
                              <b style={{ color: "#8A94A0" }}>ERP STATUS</b> {redactMoney(j.note)}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
            )}
          </div>
        );
      })}

      {pickedJob && (
        <JobLightbox
          job={toWip(pickedJob)}
          V={V}
          colour="#1B3A5C"
          onClose={() => setPickedJob(null)}
          // Edit opens the plan in a NEW TAB — the project view stays put.
          onOpenPlan={() => window.open(`/?job=${encodeURIComponent(pickedJob.id)}`, "_blank")}
          canEdit={canEdit}
          onSaved={reload}
        />
      )}

      {openGroup && (
        <ProjectLightbox
          g={openGroup}
          board={board}
          V={V}
          canEdit={canEdit}
          reload={reload}
          onClose={() => setOpenProj(null)}
          onOpenJob={(j) => setPickedJob(j)}
        />
      )}
    </div>
  );
}

/**
 * The project's own lightbox: description, the details the band shows, the
 * COMBINED GANTT across its jobs, and the project plan — same schema as a
 * job plan, kept in project_plans/project_milestones (0074).
 */
function ProjectLightbox({
  g, board, V, canEdit, reload, onClose, onOpenJob,
}: {
  g: ProjGroup; board: Board; V: (n: number) => string; canEdit: boolean;
  reload: () => Promise<Board | null>; onClose: () => void; onOpenJob: (j: Job) => void;
}) {
  const plan = board.plans[g.id];
  const [desc, setDesc] = useState(String(g.meta?.description || ""));
  const [descOpen, setDescOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [editingPlan, setEditingPlan] = useState(false);

  const saveDesc = async () => {
    setMsg("");
    try {
      await api.post("/api/project-field", { id: g.id, description: desc });
      await reload();
      setMsg("Saved ✓"); setDescOpen(false);
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(22,35,47,0.55)", zIndex: 70, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "32px 16px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg" style={{ width: "min(1020px, 100%)", maxHeight: "90vh", overflowY: "auto" }}>
        <div className="px-4 py-3 flex items-start gap-3" style={{ background: "#16232F", position: "sticky", top: 0, zIndex: 2 }}>
          <div style={{ flex: 1 }}>
            <div className="text-xs font-bold" style={{ color: "#E8600A", letterSpacing: 1.2 }}>{g.id.replace(/^NGSE-PROJ-/, "PROJ ")}</div>
            <div className="font-bold text-white" style={{ fontSize: 16, lineHeight: 1.25 }}>{g.meta?.name || g.id}</div>
            <div className="text-xs" style={{ color: "#8FA1B3" }}>
              {g.meta?.mgr && <>PM <b style={{ color: "#D7DEE6" }}>{g.meta.mgr}</b> · </>}
              {g.meta?.stage && <>stage <b style={{ color: "#D7DEE6" }}>{g.meta.stage}</b> · </>}
              committed <b style={{ color: "#D7DEE6" }}>{fmtFull(g.meta?.committed || null)}</b> ·
              expected <b style={{ color: "#D7DEE6" }}>{fmtFull(g.meta?.exp_end || null)}</b>
              {g.meta?.so && <> · {g.meta.so}</>}
              {" · "}{g.jobs.length} job{g.jobs.length === 1 ? "" : "s"} · {V(g.jobs.reduce((a, j) => a + j.val, 0))}
            </div>
          </div>
          <button onClick={onClose} className="font-bold" style={{ color: "#8FA1B3", fontSize: 20, lineHeight: 1 }}>✕</button>
        </div>

        <div className="p-4">
          {/* description — the written read on what this project is */}
          <div className="rounded border p-2.5 mb-3" style={{ borderColor: "#E2E0DA", background: "#FBFAF7" }}>
            <div className="text-xs font-bold mb-1 flex items-center gap-2" style={{ color: "#8A94A0" }}>
              DESCRIPTION
              {canEdit && !descOpen && <button onClick={() => setDescOpen(true)} className="font-bold" style={{ color: "#1B3A5C" }}>✎ edit</button>}
              {msg && <span style={{ color: msg.startsWith("Saved") ? "#0D7A3F" : "#B3261E" }}>{msg}</span>}
            </div>
            {descOpen ? (
              <div>
                <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} autoFocus
                  placeholder="What this project is, in the words the next person needs…"
                  className="w-full text-sm border rounded px-2 py-1.5" style={{ borderColor: "#E2E0DA", background: "#fff" }} />
                <div className="flex gap-2 mt-1">
                  <button onClick={() => void saveDesc()} className="text-xs font-bold rounded px-3 py-1" style={{ background: "#E8600A", color: "#fff" }}>Save</button>
                  <button onClick={() => { setDescOpen(false); setDesc(String(g.meta?.description || "")); }} className="text-xs font-bold rounded px-3 py-1 border" style={{ borderColor: "#E2E0DA", color: "#5A6672" }}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="text-sm" style={{ color: g.meta?.description ? "#22303C" : "#B8B5AC", whiteSpace: "pre-wrap" }}>
                {g.meta?.description || "No description yet" + (canEdit ? " — write the read on this project." : ".")}
              </div>
            )}
          </div>

          {/* the combined GANTT — the project plan on top, every job beneath */}
          <div className="flex items-baseline gap-2 mb-1">
            <div className="text-xs font-bold" style={{ color: "#8A94A0" }}>PROJECT GANTT — combined across the jobs</div>
            {canEdit && (
              <button onClick={() => setEditingPlan((v) => !v)} className="text-xs font-bold rounded px-2 py-0.5" style={{ background: editingPlan ? "#F4F2EC" : "#DCE8F5", color: "#1B3A5C" }}>
                {editingPlan ? "✕ close the editor" : plan?.milestones?.length ? "✎ Edit the project plan" : "＋ Start the project plan"}
              </button>
            )}
          </div>
          {editingPlan && (
            <ProjectPlanEditor
              id={g.id}
              plan={plan}
              onDone={async () => { setEditingPlan(false); await reload(); }}
            />
          )}
          <ProjectGantt g={g} board={board} onOpenJob={onOpenJob} />
        </div>
      </div>
    </div>
  );
}

/**
 * One timeline for the whole project: the project's own milestones lead in
 * orange, then each job's scheduled milestones from its Job Plan. A job with
 * no plan yet shows as a single quiet span from its start to its TDD.
 */
function ProjectGantt({ g, board, onOpenJob }: { g: ProjGroup; board: Board; onOpenJob: (j: Job) => void }) {
  type BarRow = { label: string; start: string; end: string; colour: string; hollow?: boolean; header?: false } | { header: true; label: string; tdd: string | null; job: Job };
  const rows: BarRow[] = [];
  const dates: string[] = [];

  const projPlan = board.plans[g.id];
  if (projPlan?.milestones?.length) {
    for (const m of computeSchedule({ start: projPlan.start || TODAY, milestones: projPlan.milestones })) {
      rows.push({ label: `P · ${m.name}`, start: m.start, end: m.end, colour: m.done ? "#0D7A3F" : "#E8600A" });
      dates.push(m.start, m.end);
    }
  }
  for (const j of g.jobs) {
    rows.push({ header: true, label: `${jobNo(j.id)} · ${j.tag}`, tdd: j.tdd, job: j });
    if (j.tdd) dates.push(j.tdd);
    const jp = board.plans[j.id];
    if (jp?.milestones?.length) {
      for (const m of computeSchedule({ start: jp.start || j.start || TODAY, milestones: jp.milestones })) {
        rows.push({ label: m.name, start: m.start, end: m.end, colour: m.done ? "#0D7A3F" : "#1B3A5C" });
        dates.push(m.start, m.end);
      }
    } else {
      const a = j.start || TODAY;
      const b = j.tdd && j.tdd > a ? j.tdd : addDays(a, 7);
      rows.push({ label: "no plan yet — span to TDD", start: a, end: b, colour: "#8FA1B3", hollow: true });
      dates.push(a, b);
    }
  }

  if (!dates.length) return null;
  dates.push(TODAY);
  const min = addDays(dates.reduce((a, b) => (a < b ? a : b)), -3);
  const max = addDays(dates.reduce((a, b) => (a > b ? a : b)), 3);
  const span = Math.max(1, diffDays(min, max));
  const pct = (d: string) => (diffDays(min, d) / span) * 100;

  // month lines: every first-of-month inside the range
  const months: { at: string; label: string }[] = [];
  for (let d = min.slice(0, 7) + "-01"; d <= max; ) {
    if (d >= min) months.push({ at: d, label: new Date(d + "T00:00:00Z").toLocaleString("en-IN", { month: "short" }) });
    const [y, m] = d.split("-").map(Number);
    d = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`;
  }

  return (
    <div className="rounded border overflow-x-auto" style={{ borderColor: "#E2E0DA", background: "#fff" }}>
      <div style={{ minWidth: 640, padding: "8px 10px" }}>
        {/* month ruler */}
        <div className="relative" style={{ height: 16, marginLeft: 200 }}>
          {months.map((m) => (
            <span key={m.at} className="absolute text-xs font-bold" style={{ left: pct(m.at) + "%", color: "#B8B5AC" }}>{m.label}</span>
          ))}
        </div>
        {rows.map((r, i) =>
          "header" in r && r.header ? (
            <div key={i} className="flex items-center" style={{ height: 22, borderTop: "1px solid #F0EEE8" }}>
              <button onClick={() => onOpenJob(r.job)} className="text-left text-xs font-bold" title="Open the job" style={{ width: 200, flexShrink: 0, color: "#1B3A5C", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                {r.label}
              </button>
              <div className="relative" style={{ flex: 1, height: "100%" }}>
                {months.map((m) => <span key={m.at} className="absolute" style={{ left: m.at >= min ? pct(m.at) + "%" : 0, top: 0, bottom: 0, borderLeft: "1px solid #F0EEE8" }} />)}
                {TODAY >= min && TODAY <= max && <span className="absolute" style={{ left: pct(TODAY) + "%", top: 0, bottom: 0, borderLeft: "2px solid #B3261E" }} />}
                {r.tdd && r.tdd >= min && r.tdd <= max && (
                  <span className="absolute text-xs" title={`TDD ${fmtFull(r.tdd)}`} style={{ left: `calc(${pct(r.tdd)}% - 5px)`, top: 3, color: r.tdd < TODAY ? "#B3261E" : "#E8600A" }}>◆</span>
                )}
              </div>
            </div>
          ) : "header" in r ? null : (
            <div key={i} className="flex items-center" style={{ height: 20 }}>
              <span className="text-xs" title={`${r.label} · ${fmtFull(r.start)} → ${fmtFull(r.end)}`} style={{ width: 200, flexShrink: 0, paddingLeft: 10, color: "#5A6672", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                {r.label}
              </span>
              <div className="relative" style={{ flex: 1, height: "100%" }}>
                {months.map((m) => <span key={m.at} className="absolute" style={{ left: pct(m.at) + "%", top: 0, bottom: 0, borderLeft: "1px solid #F0EEE8" }} />)}
                {TODAY >= min && TODAY <= max && <span className="absolute" style={{ left: pct(TODAY) + "%", top: 0, bottom: 0, borderLeft: "2px solid #B3261E" }} />}
                <span
                  className="absolute rounded"
                  title={`${r.label} · ${fmtFull(r.start)} → ${fmtFull(r.end)}`}
                  style={{
                    left: pct(r.start) + "%",
                    width: Math.max(0.7, pct(addDays(r.end, 1)) - pct(r.start)) + "%",
                    top: 4, height: 11,
                    background: r.hollow ? "transparent" : r.colour,
                    border: r.hollow ? `1.5px dashed ${r.colour}` : "none",
                  }}
                />
              </div>
            </div>
          ),
        )}
        <div className="text-xs mt-1.5" style={{ color: "#B8B5AC" }}>
          <span style={{ color: "#E8600A" }}>■</span> project plan · <span style={{ color: "#1B3A5C" }}>■</span> job milestones · <span style={{ color: "#0D7A3F" }}>■</span> done · ◆ TDD · <span style={{ color: "#B3261E" }}>│</span> today
        </div>
      </div>
    </div>
  );
}

/**
 * The project plan, edited in place — the main items till delivery. The exact
 * job-plan payload goes to the exact same API; only the tables beneath differ.
 */
function ProjectPlanEditor({
  id, plan, onDone,
}: {
  id: string;
  plan?: (Plan & { baseline_on?: string | null; baseline_end?: string | null }) | undefined;
  onDone: () => Promise<void>;
}) {
  const seed: PlanMilestone[] = plan?.milestones?.length
    ? plan.milestones.map((m) => ({ ...m }))
    : [
        { name: "Design & GA approval", days: 7, preds: [], crew: {} as PlanMilestone["crew"], shift: "D", offset: 0 },
        { name: "Procurement & kitting", days: 14, preds: [1], crew: {} as PlanMilestone["crew"], shift: "D", offset: 0 },
        { name: "Fabrication", days: 21, preds: [2], crew: {} as PlanMilestone["crew"], shift: "D", offset: 0 },
        { name: "Assembly & trials", days: 10, preds: [3], crew: {} as PlanMilestone["crew"], shift: "D", offset: 0 },
        { name: "Dispatch & delivery", days: 3, preds: [4], crew: {} as PlanMilestone["crew"], shift: "D", offset: 0 },
      ];
  const [start, setStart] = useState(plan?.start || TODAY);
  const [rows, setRows] = useState<PlanMilestone[]>(seed);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const upd = (i: number, patch: Partial<PlanMilestone>) =>
    setRows((r) => r.map((m, x) => (x === i ? { ...m, ...patch } : m)));
  const sched = computeSchedule({ start, milestones: rows });
  const delivery = sched.length ? sched.reduce((a, m) => (m.end > a ? m.end : a), sched[0].end) : null;

  const save = async () => {
    setBusy(true); setMsg("");
    try {
      await api.post("/api/plan", { job_id: id, start, milestones: rows });
      await onDone();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); setBusy(false); }
  };

  return (
    <div className="rounded border p-2.5 mb-2" style={{ borderColor: "#E2E0DA", background: "#FBFAF7" }}>
      <div className="flex items-center gap-2 flex-wrap mb-1.5 text-xs">
        <span className="font-bold" style={{ color: "#8A94A0" }}>Start</span>
        <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="border rounded px-1.5 py-0.5" style={{ borderColor: "#E2E0DA", background: "#fff" }} />
        {delivery && <span style={{ color: "#5A6672" }}>→ delivery by <b style={{ color: "#0D7A3F" }}>{fmtFull(delivery)}</b></span>}
        {msg && <span style={{ color: "#B3261E" }}>{msg}</span>}
      </div>
      <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ color: "#8A94A0" }}>
            <th className="text-left px-1 py-0.5">#</th>
            <th className="text-left px-1 py-0.5">MAIN ITEM</th>
            <th className="text-left px-1 py-0.5" title="Working days">DAYS</th>
            <th className="text-left px-1 py-0.5" title="Runs after milestone number(s), e.g. 1,2">AFTER</th>
            <th className="text-left px-1 py-0.5">RUNS</th>
            <th className="text-left px-1 py-0.5" title="Done">✓</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((m, i) => {
            const sm = sched[i];
            return (
              <tr key={i} style={{ borderTop: "1px solid #F0EEE8" }}>
                <td className="px-1 py-0.5 tnum" style={{ color: "#8A94A0" }}>{i + 1}</td>
                <td className="px-1 py-0.5" style={{ minWidth: 180 }}>
                  <input value={m.name} onChange={(e) => upd(i, { name: e.target.value })} className="w-full border rounded px-1.5 py-0.5" style={{ borderColor: "#E2E0DA", background: "#fff" }} />
                </td>
                <td className="px-1 py-0.5">
                  <input type="number" min={1} value={m.days} onChange={(e) => upd(i, { days: Number(e.target.value) || 1 })} className="border rounded px-1.5 py-0.5 tnum" style={{ borderColor: "#E2E0DA", background: "#fff", width: 52 }} />
                </td>
                <td className="px-1 py-0.5">
                  <input value={(m.preds || []).join(",")} onChange={(e) => upd(i, { preds: e.target.value.split(",").map((x) => parseInt(x.trim(), 10)).filter((n) => n > 0) })} placeholder="—" className="border rounded px-1.5 py-0.5 tnum" style={{ borderColor: "#E2E0DA", background: "#fff", width: 56 }} />
                </td>
                <td className="px-1 py-0.5 tnum" style={{ color: "#5A6672", whiteSpace: "nowrap" }}>{sm ? `${fmt(sm.start)} → ${fmt(sm.end)}` : "—"}</td>
                <td className="px-1 py-0.5">
                  <input type="checkbox" checked={!!m.done} onChange={() => upd(i, { done: !m.done, done_on: !m.done ? TODAY : null })} style={{ accentColor: "#0D7A3F" }} />
                </td>
                <td className="px-1 py-0.5">
                  <button onClick={() => setRows((r) => r.filter((_, x) => x !== i))} title="Remove" style={{ color: "#B8B5AC" }}>✕</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex gap-2 mt-1.5">
        <button onClick={() => setRows((r) => [...r, { name: "", days: 5, preds: r.length ? [r.length] : [], crew: {} as PlanMilestone["crew"], shift: "D", offset: 0 }])} className="text-xs font-bold rounded px-2 py-1 border" style={{ borderColor: "#E2E0DA", color: "#1B3A5C", background: "#fff" }}>＋ main item</button>
        <button onClick={() => void save()} disabled={busy} className="text-xs font-bold rounded px-3 py-1" style={{ background: busy ? "#B9BEC4" : "#E8600A", color: "#fff" }}>{busy ? "Saving…" : "Save the project plan"}</button>
      </div>
    </div>
  );
}

// ============================ Pending Material ============================

/** The same number card the delivery board uses, shared by the new tabs. */
/**
 * Labour day-rates, one per trade — Admin -> Settings, keyed by Dr Raghu.
 * With the manpower ledger rolling every day, these turn headcount into
 * labour cost on the Job Plan's Manpower tab. Rates are money: the API
 * answers Stratcom only, and the cost columns mask like every other rupee.
 */
function LabourRatesCard() {
  const [rates, setRates] = useState<Record<string, string> | null>(null);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    api.get("/api/admin/labour-rates")
      .then((r: { rates?: Record<string, number> | null; needsMigration?: boolean }) => {
        if (r.needsMigration) { setNeedsMigration(true); setRates(Object.fromEntries(TRADES.map((t) => [t.key, "0"]))); return; }
        setRates(Object.fromEntries(TRADES.map((t) => [t.key, String(r.rates?.[t.key] ?? 0)])));
      })
      .catch(() => setRates(Object.fromEntries(TRADES.map((t) => [t.key, "0"]))));
  }, []);
  const save = async () => {
    if (!rates) return;
    setBusy(true); setMsg("");
    try {
      await api.post("/api/admin/labour-rates", {
        rates: Object.fromEntries(TRADES.map((t) => [t.key, Number(rates[t.key]) || 0])),
      });
      setMsg("Saved. The Manpower tab prices itself from these.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };
  return (
    <div className="bg-white rounded-lg border p-3 mb-3" style={{ borderColor: "#E2E0DA" }}>
      <div className="flex items-baseline gap-2 flex-wrap mb-2">
        <h3 className="font-bold" style={{ color: "#16232F" }}>Labour rates</h3>
        <span className="text-xs" style={{ color: "#8A94A0" }}>
          day-rate per trade · turns the manpower ledger into labour cost · masked like every other rupee
        </span>
      </div>
      {needsMigration && (
        <div className="text-xs rounded p-2 mb-2" style={{ background: "#FFF7E6", color: "#8A5A00" }}>
          Run migration 0072 — the rates have nowhere to live yet.
        </div>
      )}
      {rates && (
        <div className="flex gap-2 flex-wrap items-end">
          {TRADES.map((t) => (
            <label key={t.key} className="block">
              <div className="text-xs font-bold mb-0.5" style={{ color: t.color }}>{t.label}</div>
              <input
                type="number" min={0} value={rates[t.key]}
                onChange={(e) => setRates((r) => ({ ...(r || {}), [t.key]: e.target.value }))}
                className="rounded border px-2 py-1 text-sm tnum" style={{ borderColor: "#E2E0DA", width: 92 }}
              />
            </label>
          ))}
          <button onClick={save} disabled={busy || needsMigration}
            className="rounded px-3 py-1.5 text-xs font-bold"
            style={{ background: busy ? "#B8B5AC" : "#E8600A", color: "#fff" }}>
            {busy ? "Saving…" : "Save rates"}
          </button>
        </div>
      )}
      {msg && <div className="text-xs mt-2 font-semibold" style={{ color: msg.startsWith("Saved") ? "#0D7A3F" : "#B3261E" }}>{msg}</div>}
    </div>
  );
}

/**
 * The walk sheet's crew table, on screen: PLAN — the current stage's crew
 * from the milestone plan — over TODAY, what the floor recorded, in bold.
 * Below the job number on On Floor, exactly where the print puts it.
 */
function FloorCrewTable({ plan, today: rec }: { plan: Partial<Crew> | null; today: Crew | null }) {
  return (
    <CrewRowsTable rows={[
      { label: "plan", crew: plan },
      { label: "today", crew: rec && Object.values(rec).some((n) => Number(n) > 0) ? rec : null, bold: true },
    ]} />
  );
}

/** The crew table itself — any rows, walk-sheet styling. */
function CrewRowsTable({ rows }: { rows: { label: string; crew: Partial<Crew> | null; bold?: boolean }[] }) {
  const cell: React.CSSProperties = {
    border: "1px solid #E2E0DA", padding: "1px 6px", textAlign: "right", fontVariantNumeric: "tabular-nums",
  };
  return (
    <table style={{ borderCollapse: "collapse", fontSize: 11, display: "inline-table", background: "#fff" }}>
      <thead>
        <tr style={{ background: "#F4F2EC" }}>
          <th style={{ ...cell, textAlign: "left", fontSize: 9 }}></th>
          {TRADES.map((t) => (
            <th key={t.key} style={{ ...cell, color: t.color, fontSize: 10 }}>{t.tiny}</th>
          ))}
          <th style={{ ...cell, fontSize: 10 }}>Tot</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const tot = r.crew ? TRADES.reduce((n, t) => n + (Number(r.crew?.[t.key]) || 0), 0) : 0;
          return (
            <tr key={r.label} style={r.bold ? { fontWeight: 700 } : undefined}>
              <td style={{ ...cell, textAlign: "left", color: "#8A94A0", fontSize: 9 }}>{r.label}</td>
              {TRADES.map((t) => (
                <td key={t.key} style={{ ...cell, color: r.crew && Number(r.crew[t.key]) ? "#22303C" : "#C9C6BD" }}>
                  {r.crew ? Number(r.crew[t.key]) || 0 : "—"}
                </td>
              ))}
              <td style={cell}>{r.crew ? <b>{tot}</b> : "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function StatCard({ label, value, sub, color = "#22303C" }: { label: string; value: string; sub?: string; color?: string }) {
  // Slimmed 25 Aug 2026 — seven of these stand in one row on On Floor now.
  return (
    <div className="bg-white rounded-lg border px-2.5 py-1.5" style={{ borderColor: "#E2E0DA", borderTop: `3px solid ${color}` }}>
      <div className="font-bold" style={{ color: "#8A94A0", fontSize: 10, letterSpacing: ".03em" }}>{label}</div>
      <div className="text-lg font-bold tnum" style={{ color, lineHeight: 1.25 }}>{value}</div>
      {sub && <div style={{ color: "#8A94A0", fontSize: 10.5, lineHeight: 1.35 }}>{sub}</div>}
    </div>
  );
}

/**
 * Every kitting line still outstanding, across every job, in one table.
 *
 * The job page already shows a job's own material. This answers the other
 * question — "what is holding up the next month of deliveries" — which nobody
 * could ask without opening forty jobs one at a time.
 *
 * It opens on the next THIRTY DAYS rather than everything. The whole book is
 * 150 lines and most of it is not urgent; a list that opens with all of it is
 * a list that gets skimmed. The horizon is a dropdown, and "All" is in it.
 */
function PendingMaterial({
  board,
  onOpen,
  reload,
  canEdit,
}: {
  board: Board;
  onOpen: (id: string) => void;
  reload: () => Promise<Board | null>;
  canEdit: boolean;
}) {
  const HORIZONS: [string, string][] = [
    ["30", "Delivery within 30 days"],
    ["60", "Delivery within 60 days"],
    ["90", "Delivery within 90 days"],
    ["all", "All jobs"],
  ];
  const [horizon, setHorizon] = useState("30");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  /** The line whose own box is open. Same box the job page uses. */
  const [picked, setPicked] = useState<{ jobId: string; mat: Mat } | null>(null);

  const jobById = useMemo(() => new Map(board.jobs.map((j) => [j.id, j])), [board.jobs]);

  const rows = useMemo(() => {
    const cutoff = horizon === "all" ? null : addDays(TODAY, Number(horizon));
    const out: { job: Job; m: Board["materials"][string][number] }[] = [];
    for (const [jobId, list] of Object.entries(board.materials || {})) {
      const job = jobById.get(jobId);
      if (!job) continue;                       // delivered or archived
      if (cutoff && (!job.tdd || job.tdd > cutoff)) continue;
      for (const m of list) {
        // Received is not pending. QC Defective very much is.
        if (String(m.status || "").toLowerCase() === "received") continue;
        out.push({ job, m });
      }
    }
    const needle = q.trim().toLowerCase();
    const hit = needle
      ? out.filter((r) =>
          jobNo(r.job.id).includes(needle) ||
          r.job.tag.toLowerCase().includes(needle) ||
          String(r.m.item || "").toLowerCase().includes(needle))
      : out;
    // Soonest delivery first — this is a list you work down.
    return hit.sort((a, b) => String(a.job.tdd || "9999").localeCompare(String(b.job.tdd || "9999")));
  }, [board.materials, jobById, horizon, q]);

  const save = async (m: { id: string }, patch: Record<string, unknown>) => {
    setBusy(m.id); setMsg("");
    try {
      await api.post("/api/materials", { action: "update", id: m.id, ...patch });
      await reload();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    setBusy(null);
  };

  const late = rows.filter((r) => r.m.due && r.m.due < TODAY).length;
  const defective = rows.filter((r) => String(r.m.status || "").toLowerCase().includes("defect")).length;
  const jobsAffected = new Set(rows.map((r) => r.job.id)).size;

  return (
    <div className="p-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <StatCard label="LINES OUTSTANDING" value={String(rows.length)} color="#16232F" />
        <StatCard label="JOBS WAITING" value={String(jobsAffected)} sub="jobs with at least one line open" color="#1B3A5C" />
        <StatCard label="PAST THEIR RECEIVABLE DATE" value={String(late)} sub={late ? "already overdue from the supplier" : "none overdue"} color={late ? "#B3261E" : "#0D7A3F"} />
        <StatCard label="QC DEFECTIVE" value={String(defective)} sub={defective ? "received and rejected — still short" : "none rejected"} color={defective ? "#D97706" : "#0D7A3F"} />
      </div>

      <div className="flex gap-2 mb-3 flex-wrap items-center">
        <select
          value={horizon}
          onChange={(e) => setHorizon(e.target.value)}
          className="px-2 py-1 rounded border text-sm font-semibold"
          style={{ borderColor: horizon === "all" ? "#E8600A" : "#D9D6CD", background: horizon === "all" ? "#FFF3E8" : "#fff" }}
          title="Which jobs to show, by how soon they are due to be delivered"
        >
          {HORIZONS.map(([k, l]) => (<option key={k} value={k}>{l}</option>))}
        </select>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="🔍 Search job no, tag or material"
          className="px-2 py-1 rounded border text-sm"
          style={{ borderColor: "#D9D6CD", minWidth: 260 }}
        />
        <span className="text-xs" style={{ color: "#8A94A0" }}>
          Received lines are not shown — this is what is still short.
        </span>
        {msg && <span className="text-xs font-bold" style={{ color: "#B3261E" }}>{msg}</span>}
      </div>

      <div className="bg-white rounded-lg border overflow-x-auto" style={{ borderColor: "#E2E0DA" }}>
        <table className="w-full text-xs" style={{ minWidth: 1040 }}>
          <thead>
            <tr style={{ background: "#22303C", color: "#fff" }}>
              <th className="px-2 py-2 text-left">Job</th>
              <th className="px-2 py-2 text-center">TDD</th>
              <th className="px-2 py-2 text-left">Material / kit item</th>
              <th className="px-2 py-2 text-center">Qty</th>
              <th className="px-2 py-2 text-center">Receivable</th>
              <th className="px-2 py-2 text-center">Task</th>
              <th className="px-2 py-2 text-left">Update</th>
              <th className="px-2 py-2 text-center">Status</th>
              <th className="px-2 py-2 text-center">Open</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-6 text-center" style={{ color: "#8A94A0" }}>
                Nothing outstanding for jobs delivering in this window.
              </td></tr>
            )}
            {rows.map(({ job, m }, i) => {
              const overdue = !!(m.due && m.due < TODAY);
              const linked = m.task_id ? board.tasks.find((t) => t.id === m.task_id) : undefined;
              return (
                <tr key={m.id} className="border-t align-top" style={{ borderColor: "#EFEDE7", background: i % 2 ? "#FAF9F5" : "#fff" }}>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <button
                      onClick={() => onOpen(job.id)}
                      className="font-bold"
                      style={{ color: "#1B3A5C", textDecoration: "underline" }}
                      title="Open this job's board"
                    >
                      {jobNo(job.id)}
                    </button>
                    <div className="truncate" style={{ color: "#8A94A0", maxWidth: 190 }} title={job.tag}>{job.tag}</div>
                  </td>
                  <td className="px-2 py-1.5 text-center whitespace-nowrap font-bold" style={{ color: job.tdd && job.tdd < TODAY ? "#B3261E" : "#22303C" }}>{fmtFull(job.tdd)}</td>
                  <td className="px-2 py-1.5" style={{ minWidth: 190 }}>{m.item}</td>
                  <td className="px-2 py-1.5 text-center tnum">{m.qty || "—"}</td>
                  <td className="px-2 py-1.5 text-center whitespace-nowrap">
                    {canEdit ? (
                      <input
                        type="date"
                        value={m.due || ""}
                        onChange={(e) => save(m, { due: e.target.value || null })}
                        className="text-xs bg-transparent border rounded px-1"
                        style={{ borderColor: overdue ? "#B3261E" : "#E2E0DA", color: overdue ? "#B3261E" : "#22303C", fontWeight: overdue ? 700 : 400 }}
                        title={overdue ? "This date has passed and the material is still not in" : "When the supplier is due to deliver"}
                      />
                    ) : (
                      <span style={{ color: overdue ? "#B3261E" : "#22303C", fontWeight: overdue ? 700 : 400 }}>{fmtFull(m.due || null)}</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-center whitespace-nowrap">
                    {linked ? (
                      <span
                        className="rounded px-1.5 py-0.5 font-semibold"
                        style={{ background: linked.done ? "#E6F4EA" : "#DCE8F5", color: linked.done ? "#0D7A3F" : "#1B3A5C" }}
                        title={`${linked.t} · ${linked.who || "unassigned"}${linked.due ? " · due " + fmtFull(linked.due) : ""}`}
                      >
                        {linked.done ? "✓ task" : "task"} {linked.who ? whoTag(linked.who) : ""}
                      </span>
                    ) : (
                      <span style={{ color: "#B8B5AC" }}>—</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5" style={{ minWidth: 200 }}>
                    {canEdit ? (
                      <input
                        defaultValue={m.note || ""}
                        onBlur={(e) => { if (e.target.value !== (m.note || "")) save(m, { note: e.target.value }); }}
                        placeholder="latest word from the supplier…"
                        className="w-full text-xs border rounded px-1 py-0.5"
                        style={{ borderColor: "#E2E0DA" }}
                      />
                    ) : (m.note || <span style={{ color: "#B8B5AC" }}>—</span>)}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {canEdit ? (
                      <select
                        value={m.status || "Yet to receive"}
                        onChange={(e) => save(m, { status: e.target.value })}
                        disabled={busy === m.id}
                        className="text-xs border rounded px-1 py-0.5 font-semibold"
                        style={{ borderColor: "#E2E0DA", color: statusColour(m.status) }}
                      >
                        <option>Yet to receive</option>
                        <option>Received</option>
                        <option>QC Defective</option>
                      </select>
                    ) : (
                      <span className="font-semibold" style={{ color: statusColour(m.status) }}>{m.status || "Yet to receive"}</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <button
                      onClick={() => setPicked({ jobId: job.id, mat: m })}
                      className="rounded px-2 py-0.5 font-bold"
                      style={{ background: "#DCE8F5", color: "#1B3A5C" }}
                      title="Open this material line — edit it, raise a task, read the comments"
                    >
                      ✎
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {picked && (
        <MatBox
          jobId={picked.jobId}
          mat={picked.mat}
          canEdit={canEdit}
          people={assignees(board).map((a) => ({ value: a.value, label: a.label }))}
          onClose={() => setPicked(null)}
          onChanged={reload}
        />
      )}
    </div>
  );
}

/** Yet to receive / Received / QC Defective, in the colours used everywhere. */
function statusColour(s: string | null | undefined): string {
  const v = String(s || "").toLowerCase();
  if (v.includes("defect")) return "#D97706";
  if (v.includes("receiv") && !v.includes("yet")) return "#0D7A3F";
  return "#B3261E";
}

// ============================ Escalations ============================

/**
 * Every escalated task in the works, in one table.
 *
 * The point of this page is the last two columns. "Genie Solution" is a
 * suggestion asked for on demand; "Prevented by" is the answer somebody
 * actually gave when they closed one. Read down that column and the same
 * three causes appear over and over — which is the only way a pile of
 * escalations turns into a decision.
 *
 * Open ones first, because those are the ones somebody can still act on.
 */
function Escalations({
  board,
  onOpen,
  reload,
  isAdmin,
}: {
  board: Board;
  V: (v: number) => string;
  onOpen: (id: string) => void;
  reload: () => Promise<Board | null>;
  isAdmin: boolean;
}) {
  const [showDone, setShowDone] = useState(false);
  const [lvl, setLvl] = useState("all");
  const [lightbox, setLightbox] = useState<Task | null>(null);
  const [notes, setNotes] = useState<Record<string, { body: string; by: string | null; at: string }>>({});
  const [hint, setHint] = useState<Record<string, string>>({});
  const [hinting, setHinting] = useState<string | null>(null);

  const jobById = useMemo(() => new Map(board.jobs.map((j) => [j.id, j])), [board.jobs]);

  // The close-out notes. Keyed the way the table is: kind + id.
  const loadNotes = useCallback(() => {
    api.get("/api/closeouts")
      .then((r: { notes?: { task_id: string; task_kind: string; body: string; by: string | null; at: string }[] }) => {
        const m: Record<string, { body: string; by: string | null; at: string }> = {};
        for (const n of r.notes || []) m[`${n.task_kind}:${n.task_id}`] = { body: n.body, by: n.by, at: n.at };
        setNotes(m);
      })
      // Before 0036 there is nothing to read. The column shows empty.
      .catch(() => {});
  }, []);
  useEffect(() => { loadNotes(); }, [loadNotes]);

  const rows = useMemo(() => {
    const out = board.tasks
      .filter((t) => escalated(t.esc))
      .filter((t) => showDone || !t.done)
      .filter((t) => lvl === "all" || (t.esc || "").startsWith(lvl));
    // Open first, then oldest-due first — the order you would work them in.
    return out.sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return String(a.due || "9999").localeCompare(String(b.due || "9999"));
    });
  }, [board.tasks, showDone, lvl]);

  const counts = useMemo(() => {
    const open = board.tasks.filter((t) => escalated(t.esc) && !t.done);
    const c = { L1: 0, L2: 0, L3: 0 } as Record<"L1" | "L2" | "L3", number>;
    for (const t of open) {
      const k = (t.esc || "").slice(0, 2) as "L1" | "L2" | "L3";
      if (k in c) c[k]++;
    }
    return { open: open.length, L1: c.L1, L2: c.L2, L3: c.L3 };
  }, [board.tasks]);

  const askGenie = async (t: Task) => {
    const job = jobById.get(t.j);
    setHinting(t.id);
    try {
      const r = await api.post("/api/genie-hint", {
        job_id: t.j,
        job_label: job ? `JOB ${jobNo(job.id)} · ${job.tag}` : t.j,
        question:
          `An escalated task (${t.esc}) is open on this job: "${t.t}".` +
          (t.esc_why ? ` It was escalated because: "${t.esc_why}".` : "") +
          (t.due ? ` It was due ${fmtFull(t.due)}.` : "") +
          " In two or three sentences, suggest the most likely way to clear it and what would stop it recurring. Be specific to this job.",
      });
      setHint((h) => ({ ...h, [t.id]: String(r.hint || r.text || "").trim() || "No suggestion came back." }));
    } catch (e) {
      setHint((h) => ({ ...h, [t.id]: e instanceof Error ? e.message : String(e) }));
    }
    setHinting(null);
  };

  const LvlBtn = ({ k, l }: { k: string; l: string }) => (
    <button onClick={() => setLvl(k)} className="px-2.5 py-1 rounded text-xs font-bold"
      style={lvl === k ? { background: "#22303C", color: "#fff" } : { color: "#5A6672", background: "#F4F2EC" }}>{l}</button>
  );

  return (
    <div className="p-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <StatCard label="OPEN ESCALATIONS" value={String(counts.open)} color="#B3261E" />
        <StatCard label="L1 — SUPERVISOR" value={String(counts.L1)} color="#D97706" />
        <StatCard label="L2 — PRODUCTION / LEADERS" value={String(counts.L2)} color="#E8600A" />
        <StatCard label="L3 — MANAGEMENT" value={String(counts.L3)} sub={counts.L3 ? "these are yours" : "none at your level"} color="#B3261E" />
      </div>

      <div className="flex gap-2 mb-3 flex-wrap items-center">
        <LvlBtn k="all" l="All levels" /><LvlBtn k="L1" l="L1" /><LvlBtn k="L2" l="L2" /><LvlBtn k="L3" l="L3" />
        <label className="flex items-center gap-1 text-xs font-semibold ml-2" style={{ color: "#5A6672", cursor: "pointer" }}>
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} style={{ accentColor: "#0D7A3F" }} />
          Include closed — and what was done about them
        </label>
        <span className="text-xs ml-auto" style={{ color: "#8A94A0" }}>{rows.length} shown</span>
      </div>

      <div className="bg-white rounded-lg border overflow-x-auto" style={{ borderColor: "#E2E0DA" }}>
        <table className="w-full text-xs" style={{ minWidth: 1280 }}>
          <thead>
            <tr style={{ background: "#22303C", color: "#fff" }}>
              <th className="px-2 py-2 text-center">Level</th>
              <th className="px-2 py-2 text-left">Job</th>
              <th className="px-2 py-2 text-center">TDD</th>
              <th className="px-2 py-2 text-center">Task date</th>
              <th className="px-2 py-2 text-center">Assigned</th>
              <th className="px-2 py-2 text-left">Task</th>
              <th className="px-2 py-2 text-left">Why it was escalated</th>
              <th className="px-2 py-2 text-center">Dates moved</th>
              <th className="px-2 py-2 text-left">Genie solution · Prevented by</th>
              <th className="px-2 py-2 text-center">Edit</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={10} className="px-3 py-6 text-center" style={{ color: "#8A94A0" }}>
                Nothing escalated at this level. 🙂
              </td></tr>
            )}
            {rows.map((t, i) => {
              const job = jobById.get(t.j);
              const note = notes[`${t.kind}:${t.id}`];
              const moved = t.push_count || 0;
              return (
                <tr key={t.kind + t.id} className="border-t align-top" style={{ borderColor: "#EFEDE7", background: t.done ? "#F4F7F4" : i % 2 ? "#FAF9F5" : "#fff" }}>
                  <td className="px-2 py-1.5 text-center whitespace-nowrap">
                    <span className="rounded px-1.5 py-0.5 font-bold" style={{ background: t.done ? "#E7E4DC" : "#B3261E", color: t.done ? "#5A6672" : "#fff" }}>
                      {(t.esc || "").slice(0, 2)}
                    </span>
                    {t.done && <div style={{ color: "#0D7A3F", fontWeight: 700, fontSize: 10 }}>closed</div>}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <span className="font-bold" style={{ color: "#1B3A5C" }}>{job ? jobNo(job.id) : jobNo(t.j)}</span>
                    {job && <div className="truncate" style={{ color: "#8A94A0", maxWidth: 170 }} title={job.tag}>{job.tag}</div>}
                  </td>
                  <td className="px-2 py-1.5 text-center whitespace-nowrap font-bold" style={{ color: job?.tdd && job.tdd < TODAY ? "#B3261E" : "#22303C" }}>{fmtFull(job?.tdd || null)}</td>
                  <td className="px-2 py-1.5 text-center whitespace-nowrap" style={{ color: taskLate(t, TODAY) ? "#B3261E" : "#22303C", fontWeight: taskLate(t, TODAY) ? 700 : 400 }}>{fmtFull(t.due)}</td>
                  <td className="px-2 py-1.5 text-center whitespace-nowrap" title={t.who || "unassigned"}>{t.who ? whoTag(t.who) : "—"}</td>
                  <td className="px-2 py-1.5" style={{ minWidth: 200 }}>
                    <div style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }} title={t.t}>{t.t}</div>
                    <div style={{ color: "#8A94A0" }}>{t.cat}</div>
                  </td>
                  <td className="px-2 py-1.5" style={{ minWidth: 170, color: t.esc_why ? "#22303C" : "#B8B5AC" }}>
                    {t.esc_why || "— not given —"}
                  </td>
                  <td className="px-2 py-1.5 text-center whitespace-nowrap">
                    {moved > 0 ? (
                      <span title={t.original_due ? `First promised ${fmtFull(t.original_due)}` : undefined} style={{ color: "#B3261E", fontWeight: 700 }}>
                        {moved}×<div style={{ fontSize: 10, fontWeight: 400 }}>from {fmtFull(t.original_due || null)}</div>
                      </span>
                    ) : (<span style={{ color: "#B8B5AC" }}>never</span>)}
                  </td>
                  <td className="px-2 py-1.5" style={{ minWidth: 260 }}>
                    {note ? (
                      <div className="rounded p-1.5 mb-1" style={{ background: "#E6F4EA", border: "1px solid #0D7A3F" }}>
                        <div className="font-bold" style={{ color: "#0D7A3F", fontSize: 10 }}>PREVENTED BY — {note.by || "—"}</div>
                        <div style={{ color: "#22303C" }}>{note.body}</div>
                      </div>
                    ) : t.done ? (
                      <div style={{ color: "#B8B5AC" }}>closed before this was asked for</div>
                    ) : null}
                    {hint[t.id] ? (
                      <div className="rounded p-1.5" style={{ background: "#F3EEFB", border: "1px solid #7C3AED" }}>
                        <div className="font-bold" style={{ color: "#7C3AED", fontSize: 10 }}>GENIE</div>
                        <div style={{ color: "#22303C" }}>{hint[t.id]}</div>
                      </div>
                    ) : !t.done ? (
                      <button
                        onClick={() => askGenie(t)}
                        disabled={hinting === t.id}
                        className="rounded px-2 py-0.5 font-bold"
                        style={{ background: "#F3EEFB", color: "#7C3AED", opacity: hinting === t.id ? 0.6 : 1 }}
                        title="Ask Genie what would most likely clear this, and what would stop it recurring"
                      >
                        {hinting === t.id ? "thinking…" : "✨ Ask Genie"}
                      </button>
                    ) : null}
                  </td>
                  <td className="px-2 py-1.5 text-center whitespace-nowrap">
                    <button onClick={() => setLightbox(t)} className="rounded px-2 py-0.5 font-bold" style={{ background: "#DCE8F5", color: "#1B3A5C" }} title="Open the task">✎</button>
                    <button onClick={() => onOpen(t.j)} className="rounded px-2 py-0.5 font-bold ml-1" style={{ background: "#F4F2EC", color: "#5A6672" }} title="Open the job plan">JOB</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {lightbox && (
        <TaskModal
          canDelete={isAdmin}
          task={lightbox}
          owners={assignees(board)}
          onClose={() => setLightbox(null)}
          onToggle={async (prevention) => {
            await api.post("/api/tasks", { action: "toggle", id: lightbox.id, kind: lightbox.kind, done: !lightbox.done, prevention });
            setLightbox(null);
            await reload();
            loadNotes();   // the answer they just typed belongs in the table
          }}
          reload={reload}
        />
      )}
    </div>
  );
}

// ============================ Consult Raghu ============================

/**
 * Ask a question, get an answer grounded in today's board.
 *
 * The point is not that it is a chat window. It is that the live figures go
 * with every question, so the answer names job numbers instead of offering
 * advice — "chase 2114 and 2560" rather than "follow up on overdue jobs".
 *
 * Deliberately not persisted. A consultation is about the board as it stands
 * this morning; an answer kept for three weeks is an answer about a board that
 * no longer exists, and somebody would quote it.
 */
function ConsultRaghu() {
  const [q, setQ] = useState("");
  const [turns, setTurns] = useState<{ q: string; a: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const SUGGESTIONS = [
    "What should we finish this week to move the number most?",
    "Which jobs are stuck and who do I ring about each one?",
    "What is the single biggest risk to this month's delivery?",
    "Which escalations are actually the same problem?",
  ];

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || busy) return;
    setBusy(true); setErr(""); setQ("");
    try {
      const r = await api.post("/api/consult", { question: text });
      setTurns((t) => [{ q: text, a: String(r.answer || "") }, ...t]);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };

  return (
    <div className="p-4" style={{ maxWidth: 900 }}>
      <h2 className="font-bold text-lg" style={{ color: "#16232F" }}>Consult Raghu</h2>
      <p className="text-xs mb-3" style={{ color: "#5A6672", lineHeight: 1.6 }}>
        Ask about the work in front of you. Every question goes with today&apos;s live board — the jobs, what is
        late, what is kitted and not moving, and every open escalation — so the answer names jobs rather than
        offering advice. It will say when the board does not answer the question rather than inventing a date.
      </p>

      <div className="flex gap-2 mb-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") ask(q); }}
          placeholder="Ask anything about the board…"
          className="flex-1 px-3 py-2 rounded border text-sm"
          style={{ borderColor: "#D9D6CD" }}
        />
        <button
          onClick={() => ask(q)}
          disabled={busy || !q.trim()}
          className="px-4 py-2 rounded text-sm font-bold text-white"
          style={{ background: busy || !q.trim() ? "#B8B5AC" : "#E8600A" }}
        >
          {busy ? "thinking…" : "Ask"}
        </button>
      </div>

      {turns.length === 0 && !busy && (
        <div className="flex gap-1.5 flex-wrap mb-3">
          {SUGGESTIONS.map((sug) => (
            <button key={sug} onClick={() => ask(sug)} className="text-xs rounded px-2 py-1 border"
              style={{ borderColor: "#E2E0DA", color: "#5A6672", background: "#fff" }}>{sug}</button>
          ))}
        </div>
      )}

      {err && <div className="text-xs font-bold rounded p-2 mb-2" style={{ background: "#FBEDEA", color: "#B3261E" }}>{err}</div>}

      {turns.map((t, i) => (
        <div key={i} className="bg-white rounded-lg border p-3 mb-2" style={{ borderColor: "#E2E0DA" }}>
          <div className="text-xs font-bold mb-1" style={{ color: "#8A94A0" }}>{t.q}</div>
          <div className="text-sm" style={{ color: "#22303C", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{t.a}</div>
        </div>
      ))}
    </div>
  );
}

// ============================ Principles ============================

/**
 * How the company is run — Dr Raghu's thinking, organised.
 *
 * He types it roughly, in whatever order it arrives. Genie gives it a spine:
 * groups, a principle per thought, and a drill-down under each — why it
 * matters, what following it looks like on THIS shop floor, how it usually
 * gets broken, and a question to ask yourself in the moment.
 *
 * BOTH ARE KEPT. The structure is a rendering and can be regenerated; the
 * thinking cannot be recovered from the rendering, so his raw text is stored
 * beside it and shown to him whenever he comes back to add to it.
 *
 * Closed by default. A wall of open text is a page people scroll past — the
 * one-liner is what they read, and the detail is there for the day they want
 * to argue with it.
 */
interface PrincipleItem {
  title: string;
  one_liner?: string;
  why?: string;
  looks_like?: string[];
  not_this?: string[];
  ask_yourself?: string;
}
interface PrincipleGroup {
  name: string;
  icon?: string;
  summary?: string;
  principles?: PrincipleItem[];
}
interface PrincipleDoc {
  id: string;
  version: number;
  raw: string;
  created_at: string;
  structured: { title?: string; intro?: string; groups?: PrincipleGroup[] };
}

function Principles({ isOwner }: { isOwner: boolean }) {
  const [doc, setDoc] = useState<PrincipleDoc | null>(null);
  const [installed, setInstalled] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    api.get("/api/principles")
      .then((r: { installed?: boolean; doc?: PrincipleDoc | null }) => {
        setInstalled(r.installed !== false);
        setDoc(r.doc ?? null);
      })
      .catch(() => setInstalled(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const organise = async () => {
    if (raw.trim().length < 20) { setMsg("Write a little more — a line or two at least."); return; }
    setBusy(true); setMsg("");
    try {
      await api.post("/api/principles", { raw });
      setWriting(false);
      load();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };

  const S = doc?.structured || {};
  const groups = S.groups || [];
  const total = groups.reduce((n, g) => n + (g.principles?.length || 0), 0);
  // A soft palette per group, so the page reads as sections rather than a list.
  const TONE = [
    { bg: "#FFF3E8", line: "#E8600A" },
    { bg: "#EAF1F8", line: "#1B3A5C" },
    { bg: "#E9F5EE", line: "#0D7A3F" },
    { bg: "#F5EFFA", line: "#7C3AED" },
    { bg: "#FDF3E3", line: "#D97706" },
    { bg: "#E9F4F4", line: "#0D9488" },
  ];

  return (
    <div className="p-4" style={{ maxWidth: 1000, margin: "0 auto" }}>
      {!installed && (
        <div className="text-xs rounded p-2 mb-3" style={{ background: "#FFF7E6", color: "#8A5A00" }}>
          Run migration 0039 — principles have nowhere to save yet.
        </div>
      )}
      {msg && <div className="text-xs font-bold rounded p-2 mb-2" style={{ background: "#FBEDEA", color: "#B3261E" }}>{msg}</div>}

      {/* ---- the hero ---- */}
      <div className="rounded-lg p-5 mb-4" style={{ background: "#16232F", color: "#fff" }}>
        <div className="text-xs font-bold" style={{ letterSpacing: 2, color: "#F5B32B" }}>NANDAN GSE</div>
        <h1 className="font-bold" style={{ fontSize: 30, margin: "4px 0 6px" }}>
          {S.title || "Principles"}
        </h1>
        {S.intro ? (
          <p style={{ color: "#9FB0C0", fontSize: 14, lineHeight: 1.6, maxWidth: "60ch", margin: 0 }}>{S.intro}</p>
        ) : (
          <p style={{ color: "#9FB0C0", fontSize: 14, margin: 0 }}>
            {isOwner ? "Write the thinking below and Genie will organise it." : "Not written yet."}
          </p>
        )}
        {total > 0 && (
          <div className="flex gap-4 mt-4 flex-wrap" style={{ fontSize: 12, color: "#8FA1B3" }}>
            <span><b style={{ color: "#fff" }}>{groups.length}</b> themes</span>
            <span><b style={{ color: "#fff" }}>{total}</b> principles</span>
            <span>updated {fmtFull(String(doc?.created_at || "").slice(0, 10))}</span>
            <span style={{ opacity: .7 }}>v{doc?.version}</span>
          </div>
        )}
      </div>

      {/* ---- the groups ---- */}
      {groups.map((g, gi) => {
        const tone = TONE[gi % TONE.length];
        return (
          <div key={g.name + gi} className="mb-4">
            <div className="flex items-baseline gap-2 mb-2">
              <span style={{ fontSize: 20 }}>{g.icon || "◆"}</span>
              <h2 className="font-bold" style={{ color: "#16232F", fontSize: 18 }}>{g.name}</h2>
              {g.summary && <span className="text-xs" style={{ color: "#8A94A0" }}>{g.summary}</span>}
            </div>

            <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))" }}>
              {(g.principles || []).map((p, pi) => {
                const key = `${gi}:${pi}`;
                const isOpen = open === key;
                return (
                  <div
                    key={key}
                    onClick={() => setOpen(isOpen ? null : key)}
                    className="rounded-lg border"
                    style={{
                      borderColor: isOpen ? tone.line : "#E2E0DA",
                      borderLeft: `4px solid ${tone.line}`,
                      background: isOpen ? tone.bg : "#fff",
                      cursor: "pointer",
                      gridColumn: isOpen ? "1 / -1" : undefined,
                      transition: "background .15s",
                    }}
                  >
                    <div className="p-3">
                      <div className="flex items-start gap-2">
                        <div className="flex-1">
                          <div className="font-bold text-sm" style={{ color: "#16232F" }}>{p.title}</div>
                          {p.one_liner && (
                            <div className="text-xs mt-0.5" style={{ color: "#5A6672", lineHeight: 1.5 }}>{p.one_liner}</div>
                          )}
                        </div>
                        <span style={{ color: tone.line, fontWeight: 700, fontSize: 13 }}>{isOpen ? "−" : "+"}</span>
                      </div>

                      {isOpen && (
                        <div className="mt-3" style={{ borderTop: `1px solid ${tone.line}33`, paddingTop: 10 }}>
                          {p.why && (
                            <p className="text-xs" style={{ color: "#22303C", lineHeight: 1.65, margin: "0 0 10px" }}>{p.why}</p>
                          )}
                          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))" }}>
                            {!!p.looks_like?.length && (
                              <div>
                                <div className="text-xs font-bold mb-1" style={{ color: "#0D7A3F" }}>WHAT IT LOOKS LIKE</div>
                                {p.looks_like.map((l, i) => (
                                  <div key={i} className="text-xs" style={{ color: "#22303C", lineHeight: 1.6 }}>· {l}</div>
                                ))}
                              </div>
                            )}
                            {!!p.not_this?.length && (
                              <div>
                                <div className="text-xs font-bold mb-1" style={{ color: "#B3261E" }}>HOW IT GETS BROKEN</div>
                                {p.not_this.map((l, i) => (
                                  <div key={i} className="text-xs" style={{ color: "#22303C", lineHeight: 1.6 }}>· {l}</div>
                                ))}
                              </div>
                            )}
                          </div>
                          {p.ask_yourself && (
                            <div className="rounded mt-3 px-3 py-2 text-xs" style={{ background: "#fff", border: `1px dashed ${tone.line}`, color: "#22303C" }}>
                              <b style={{ color: tone.line }}>Ask yourself:</b> {p.ask_yourself}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {groups.length === 0 && installed && !isOwner && (
        <div className="text-sm rounded-lg border p-4" style={{ borderColor: "#E2E0DA", background: "#fff", color: "#8A94A0" }}>
          Dr Raghu has not written these yet.
        </div>
      )}

      <PrincipleFiles isOwner={isOwner} />

      {/* ---- the owner's door ---- */}
      {isOwner && installed && (
        <div className="mt-5">
          {writing ? (
            <div className="bg-white rounded-lg border p-3" style={{ borderColor: "#E8600A" }}>
              <div className="font-bold text-sm mb-1">Write the thinking</div>
              <p className="text-xs mb-2" style={{ color: "#5A6672", lineHeight: 1.6 }}>
                However it arrives — bullets, half sentences, out of order. Genie groups it, gives each thought a
                spine and writes the drill-down. It keeps your words and adds no principle you did not say.
                {doc && " What is below is the last version, so you can add to it rather than start again."}
              </p>
              <textarea
                autoFocus
                rows={14}
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                placeholder={"e.g.\nNever let a missing number read as zero.\nDecide at the lowest level that has the facts.\nA date once promised is the date we are judged on…"}
                className="w-full text-sm border rounded px-2 py-2"
                style={{ borderColor: "#E2E0DA", lineHeight: 1.6 }}
              />
              <div className="flex gap-2 mt-2 items-center">
                <button onClick={organise} disabled={busy}
                  className="rounded px-4 py-1.5 text-sm font-bold text-white"
                  style={{ background: busy ? "#B8B5AC" : "#E8600A" }}>
                  {busy ? "organising…" : "✨ Organise & publish"}
                </button>
                <button onClick={() => setWriting(false)} className="text-xs font-semibold" style={{ color: "#8A94A0" }}>Cancel</button>
                <span className="text-xs ml-auto" style={{ color: "#8A94A0" }}>
                  your text is saved even if the organising fails
                </span>
              </div>
            </div>
          ) : (
            <button
              onClick={() => { setRaw(doc?.raw || ""); setWriting(true); }}
              className="rounded px-4 py-2 text-sm font-bold text-white"
              style={{ background: "#E8600A" }}
            >
              {doc ? "✎ Add to the principles" : "✨ Write the principles"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ============================ On Floor ============================

/**
 * What is actually being worked on, and what the floor is saying about it.
 *
 * The rest of the suite is written down by people at desks. This page is for
 * the person standing at the machine: they will SAY what is happening, they
 * will not type it. So each job takes voice notes — kept as audio because tone
 * carries what a transcript loses, and as text because nobody scrubs through
 * ninety seconds to find out whether the part arrived.
 *
 * Three notes a job, oldest dropped. That is the point rather than a limit: an
 * unbounded log is a thing nobody listens to, and the last three are what is
 * happening now.
 */
/**
 * The Job Plan's line of truth for today: who is standing at this job now,
 * as recorded from On Floor. Editable here too — the plan is where the
 * planner already is, and a fact that can only be typed in one screen is a
 * fact that stops being typed.
 */
function JobManpowerStrip({ jobId, canEdit }: { jobId: string; canEdit: boolean }) {
  const [crew, setCrew] = useState<Crew | null>(null);
  const [open, setOpen] = useState(false);
  const load = useCallback(() => {
    api.get(`/api/on-floor/manpower?job_id=${encodeURIComponent(jobId)}&days=1`)
      .then((r: { rows?: { day: string; crew: Crew }[] }) => {
        const t = (r.rows || []).find((x) => String(x.day).slice(0, 10) === today());
        setCrew(t?.crew ?? null);
      })
      .catch(() => {});
  }, [jobId]);
  useEffect(() => { load(); }, [load]);
  const total = crew ? TRADES.reduce((n, t) => n + (Number(crew[t.key]) || 0), 0) : 0;
  return (
    <div className="rounded-lg border px-3 py-2 mb-3 bg-white" style={{ borderColor: "#E2E0DA" }}>
      <div className="flex items-center gap-2.5 flex-wrap">
        <b className="text-xs" style={{ color: "#8A94A0", letterSpacing: ".04em" }}>WORKING TODAY</b>
        {crew && total > 0 ? (
          <>
            {TRADES.map((t) => (
              <span key={t.key} className="text-sm font-bold" style={{ color: t.color, opacity: Number(crew[t.key]) ? 1 : 0.35 }}>
                {t.tiny} {Number(crew[t.key]) || 0}
              </span>
            ))}
            <b className="text-sm" style={{ color: "#22303C" }}>— {total} people</b>
          </>
        ) : (
          <span className="text-xs font-bold" style={{ color: "#E8600A" }}>no manpower recorded for today</span>
        )}
        {canEdit && (
          <button onClick={() => setOpen((v) => !v)} className="text-xs font-bold rounded px-2 py-0.5"
            style={{ background: open ? "#22303C" : "#F4F2EC", color: open ? "#fff" : "#22303C" }}>
            {open ? "✕ close" : "Manpower Allocation"}
          </button>
        )}
        <span className="text-xs" style={{ color: "#8A94A0" }}>kept per day as the work study · must match attendance</span>
      </div>
      {open && <ManpowerEditor jobId={jobId} value={crew ?? undefined} onSaved={() => { setOpen(false); load(); }} />}
    </div>
  );
}

/**
 * The Manpower tab: the job's day-wise ledger. Every day is a row — typed by
 * the floor, carried forward by the 4 AM rollover, or a holiday zero — and
 * where the rates are set (Admin → Settings) and the reader may see money,
 * each day prices itself: headcount × day-rate, summed at the bottom.
 */
function ManpowerLedger({ jobId, V }: { jobId: string; V: (n: number) => string }) {
  type LedgerRow = { day: string; crew: Record<string, number>; noted_by: string | null };
  const [rows, setRows] = useState<LedgerRow[] | null>(null);
  const [rates, setRates] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    api.get(`/api/on-floor/manpower?job_id=${encodeURIComponent(jobId)}&days=60`)
      .then((r: { rows?: LedgerRow[] }) => setRows(r.rows || []))
      .catch(() => setRows([]));
    // Rates answer Stratcom only — everyone else simply gets no cost column.
    api.get("/api/admin/labour-rates")
      .then((r: { rates?: Record<string, number> | null }) => {
        if (r.rates && Object.values(r.rates).some((n) => n > 0)) setRates(r.rates);
      })
      .catch(() => {});
  }, [jobId]);

  const isHoliday = (iso: string) => {
    const d = new Date(iso + "T00:00:00");
    return d.getDay() === 0 || (d.getDay() === 6 && d.getDate() >= 15 && d.getDate() <= 21);
  };
  const totalOf = (c: Record<string, number>) => TRADES.reduce((n, t) => n + (Number(c?.[t.key]) || 0), 0);
  const costOf = (c: Record<string, number>) =>
    rates ? TRADES.reduce((n, t) => n + (Number(c?.[t.key]) || 0) * (rates[t.key] || 0), 0) : 0;
  const srcOf = (r: LedgerRow) => {
    if (r.noted_by !== "rollover@genie") return r.noted_by ? `by ${String(r.noted_by).split("@")[0]}` : "recorded";
    return totalOf(r.crew) === 0 && isHoliday(r.day) ? "holiday" : "carried";
  };

  if (rows === null) return <div className="text-sm" style={{ color: "#8A94A0" }}>loading…</div>;
  if (!rows.length)
    return (
      <div className="bg-white rounded-lg border p-4 text-sm" style={{ borderColor: "#E2E0DA", color: "#8A94A0" }}>
        No manpower recorded on this job yet. Tick it On Floor and the ledger starts today.
      </div>
    );

  const manDays = rows.reduce((n, r) => n + totalOf(r.crew), 0);
  const totalCost = rows.reduce((n, r) => n + costOf(r.crew), 0);

  return (
    <div className="bg-white rounded-lg border mb-4" style={{ borderColor: "#E2E0DA", overflowX: "auto" }}>
      <div className="px-3 pt-2 pb-1 flex items-baseline gap-2 flex-wrap">
        <h2 className="font-bold" style={{ color: "#16232F" }}>Manpower — the work study</h2>
        <span className="text-xs" style={{ color: "#8A94A0" }}>
          one row per day · typed by the floor or carried at 4 AM · must match the attendance muster
        </span>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
        <thead>
          <tr>
            {["DATE", ...TRADES.map((t) => t.tiny), "TOTAL", "SOURCE", ...(rates ? ["COST"] : [])].map((h, i) => (
              <th key={h + i} style={{
                textAlign: i === 0 || h === "SOURCE" ? "left" : "right", padding: "6px 10px",
                fontSize: 10, letterSpacing: ".05em", color: "#8A94A0",
                borderBottom: "2px solid #E2E0DA", whiteSpace: "nowrap",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const carried = r.noted_by === "rollover@genie";
            const tot = totalOf(r.crew);
            return (
              <tr key={r.day} style={{ opacity: carried && tot === 0 ? 0.55 : 1 }}>
                <td className="tnum" style={{ padding: "5px 10px", fontSize: 12.5, borderBottom: "1px solid #F0EEE8", whiteSpace: "nowrap" }}>
                  {fmtFull(r.day)}{isHoliday(r.day) ? " ·" : ""}
                  {isHoliday(r.day) && <span style={{ color: "#8A94A0", fontSize: 10 }}> holiday</span>}
                </td>
                {TRADES.map((t) => (
                  <td key={t.key} className="tnum" style={{
                    textAlign: "right", padding: "5px 10px", fontSize: 12.5,
                    borderBottom: "1px solid #F0EEE8",
                    color: Number(r.crew?.[t.key]) ? t.color : "#C9C6BD",
                    fontWeight: Number(r.crew?.[t.key]) && !carried ? 700 : 400,
                  }}>
                    {Number(r.crew?.[t.key]) || 0}
                  </td>
                ))}
                <td className="tnum" style={{ textAlign: "right", padding: "5px 10px", fontSize: 12.5, fontWeight: 700, borderBottom: "1px solid #F0EEE8" }}>
                  {tot}
                </td>
                <td style={{ padding: "5px 10px", fontSize: 11, borderBottom: "1px solid #F0EEE8", color: carried ? "#8A94A0" : "#0D7A3F", whiteSpace: "nowrap" }}>
                  {srcOf(r)}
                </td>
                {rates && (
                  <td className="tnum" style={{ textAlign: "right", padding: "5px 10px", fontSize: 12.5, borderBottom: "1px solid #F0EEE8" }}>
                    {tot ? V(costOf(r.crew)) : "—"}
                  </td>
                )}
              </tr>
            );
          })}
          <tr>
            <td style={{ padding: "7px 10px", fontSize: 12, fontWeight: 800 }}>TOTAL · {rows.length} days</td>
            {TRADES.map((t) => (
              <td key={t.key} className="tnum" style={{ textAlign: "right", padding: "7px 10px", fontSize: 12, fontWeight: 800, color: t.color }}>
                {rows.reduce((n, r) => n + (Number(r.crew?.[t.key]) || 0), 0)}
              </td>
            ))}
            <td className="tnum" style={{ textAlign: "right", padding: "7px 10px", fontSize: 12, fontWeight: 800 }}>{manDays}</td>
            <td style={{ padding: "7px 10px", fontSize: 10.5, color: "#8A94A0" }}>man-days</td>
            {rates && (
              <td className="tnum" style={{ textAlign: "right", padding: "7px 10px", fontSize: 12, fontWeight: 800, color: "#16232F" }}>
                {V(totalCost)}
              </td>
            )}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** Six small boxes and a save — today's reality for one job. */
function ManpowerEditor({ jobId, value, onSaved }: { jobId: string; value?: Crew; onSaved: () => void }) {
  const [crew, setCrew] = useState<Record<string, string>>(
    () => Object.fromEntries(TRADES.map((t) => [t.key, String(Number(value?.[t.key]) || 0)])),
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const total = TRADES.reduce((n, t) => n + (Number(crew[t.key]) || 0), 0);
  const save = async () => {
    setBusy(true); setErr("");
    try {
      await api.post("/api/on-floor/manpower", { job_id: jobId, crew: Object.fromEntries(TRADES.map((t) => [t.key, Number(crew[t.key]) || 0])) });
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  };
  return (
    <div className="mt-1 rounded p-2" style={{ background: "#F7F6F2", border: "1px solid #E2E0DA" }}>
      <div className="flex gap-1.5 flex-wrap items-end">
        {TRADES.map((t) => (
          <label key={t.key} className="text-center" style={{ fontSize: 10, color: t.color, fontWeight: 700 }}>
            {t.tiny}
            <input value={crew[t.key]} inputMode="numeric"
              onChange={(e) => setCrew((c) => ({ ...c, [t.key]: e.target.value.replace(/[^0-9]/g, "").slice(0, 2) }))}
              className="block w-9 text-center rounded border px-1 py-0.5 text-sm font-bold"
              style={{ borderColor: "#E2E0DA", color: "#22303C" }} />
          </label>
        ))}
        <b className="text-sm" style={{ color: "#22303C" }}>= {total}</b>
        <button onClick={save} disabled={busy}
          className="rounded px-2.5 py-1 text-xs font-bold" style={{ background: "#0D7A3F", color: "#fff" }}>
          {busy ? "…" : "Save today"}
        </button>
      </div>
      {err && <div className="text-xs font-semibold mt-1" style={{ color: "#B3261E" }}>{err}</div>}
    </div>
  );
}

function OnFloor({
  board,
  V,
  onOpen,
  reload,
  canEdit,
  canTask,
  isStrat,
  myName,
}: {
  board: Board;
  V: (n: number) => string;
  onOpen: (id: string) => void;
  reload: () => Promise<Board | null>;
  canEdit: boolean;
  /** May add photos and record manpower — the floor's own hands, not just planners. */
  canTask: boolean;
  isStrat: boolean;
  /** Who to thank when they leave an update. */
  myName: string;
}) {
  interface Note { id: string; job_id: string; url: string | null; seconds: number | null; transcript: string; summary: string; by: string | null; at: string }
  const [notes, setNotes] = useState<Note[]>([]);
  const [installed, setInstalled] = useState(true);
  const [msg, setMsg] = useState("");
  /** The job whose own lightbox is open — the same one the scatter uses. */
  const [picked, setPicked] = useState<Job | null>(null);
  /** A job's open work, listed. "tasks" or "esc" decides which half. */
  const [work, setWork] = useState<{ job: Job; only: "tasks" | "esc" } | null>(null);
  /** A project, listed by its jobs. */
  const [proj, setProj] = useState<string | null>(null);
  /** The job whose photographs are open. */
  const [gallery, setGallery] = useState<Job | null>(null);

  // Open work per job, counted once for every row on the page.
  const workByJob = useMemo(() => {
    const m = new Map<string, { tasks: Task[]; esc: Task[] }>();
    for (const t of board.tasks) {
      if (t.done || !t.j) continue;
      const cur = m.get(t.j) || { tasks: [], esc: [] };
      cur.tasks.push(t);
      if (escalated(t.esc)) cur.esc.push(t);
      m.set(t.j, cur);
    }
    return m;
  }, [board.tasks]);

  const jobs = useMemo(
    () => board.jobs.filter((j) => j.onFloor).sort((a, b) => String(a.tdd || "9999").localeCompare(String(b.tdd || "9999"))),
    [board.jobs],
  );

  const load = useCallback(() => {
    api.get("/api/voice-note")
      .then((r: { installed?: boolean; notes?: Note[] }) => { setInstalled(r.installed !== false); setNotes(r.notes || []); })
      .catch(() => setInstalled(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const byJob = useMemo(() => {
    const m = new Map<string, Note[]>();
    for (const n of notes) m.set(n.job_id, [...(m.get(n.job_id) || []), n]);
    return m;
  }, [notes]);

  /**
   * Per FIELD, who is named most across the jobs on the floor — so the
   * dropdown offers "the usual people first". Somebody who owns production on
   * eleven jobs is the likely answer on the twelfth, and scrolling past forty
   * names to reach them every time is how the column stays empty.
   */
  const ownerRank = useMemo(() => {
    const fields: [string, (j: Job) => string | null | undefined][] = [
      ["quality_owner", (j) => j.qualityOwner],
      ["production_owner", (j) => j.productionOwner],
      ["kitting_owner", (j) => j.kittingOwner],
      ["design_owner", (j) => j.designOwner],
    ];
    const m = new Map<string, Map<string, number>>();
    for (const [field, get] of fields) {
      const counts = new Map<string, number>();
      for (const j of board.jobs) {
        const v = get(j);
        if (v) counts.set(v, (counts.get(v) || 0) + 1);
      }
      m.set(field, counts);
    }
    return m;
  }, [board.jobs]);

  const usersFor = (field: string): Person[] => {
    const counts = ownerRank.get(field) || new Map<string, number>();
    return [...(board.assignableUsers || [])].sort((a, b) => {
      const ca = counts.get(a.initials || "") || 0;
      const cb = counts.get(b.initials || "") || 0;
      if (cb !== ca) return cb - ca; // most-used first
      return String(personLabel(a)).localeCompare(String(personLabel(b)));
    });
  };

  const setOwner = async (j: Job, field: string, who: string) => {
    try {
      await api.post("/api/job-field", { job_id: j.id, field, value: who });
      await reload();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  };

  const totVal = jobs.reduce((s, j) => s + (j.val || 0), 0);
  const totTp = jobs.reduce((s, j) => s + tpOf(j), 0);
  // Late against OTD — the promise on the order — not the board's working
  // target (Dr Raghu, 25 Aug 2026). A job with no OTD falls back to its
  // target date rather than hiding from the count.
  const late = jobs.filter((j) => (j.otd || j.tdd) && String(j.otd || j.tdd) < TODAY);

  // What actually went out the gate, from the delivery record — the same
  // 7/30-day boxes the walk sheet prints, standing beside the floor's cards.
  const [deliv, setDeliv] = useState<{ on: string | null; val: number; tpv: number }[]>([]);
  useEffect(() => {
    api.get("/api/delivered/recent")
      .then((r: { jobs?: Record<string, unknown>[] }) => {
        setDeliv((r.jobs || []).map((j) => ({
          on: String(j.on ?? j.delivered_on ?? "").slice(0, 10) || null,
          val: Number(j.val) || 0,
          tpv: Number(j.tpv) || 0,
        })));
      })
      .catch(() => {});
  }, []);
  const deliveredSince = (days: number) => {
    const from = new Date(new Date(TODAY + "T00:00:00").getTime() - days * 86400000)
      .toISOString().slice(0, 10);
    const js = deliv.filter((j) => j.on && j.on >= from && j.on <= TODAY);
    return { n: js.length, val: js.reduce((s, j) => s + j.val, 0), tp: js.reduce((s, j) => s + j.tpv, 0) };
  };
  const d7 = deliveredSince(7);
  const d30 = deliveredSince(30);

  // Pending material per job, for the OPEN ON IT chip.
  const [matCounts, setMatCounts] = useState<Record<string, number>>({});
  const loadMatCounts = useCallback(() => {
    api.get("/api/materials?pending_counts=1")
      .then((r: { counts?: Record<string, number> }) => setMatCounts(r.counts || {}))
      .catch(() => {});
  }, []);
  useEffect(() => { loadMatCounts(); }, [loadMatCounts]);
  const [quickAdd, setQuickAdd] = useState<{ job: Job; kind: "task" | "material" } | null>(null);

  // The WHO list, most-assigned first — the hands that get the work sit at
  // the top of the type-ahead (Dr Raghu, 25 Aug 2026).
  const rankedPeople = useMemo(() => {
    const n = new Map<string, number>();
    for (const t of board.tasks) {
      const w = String(t.who || "").toUpperCase();
      if (w && w !== "UNASSIGNED") n.set(w, (n.get(w) || 0) + 1);
    }
    const of2 = (p: { initials?: string | null }) => n.get(String(p.initials || "").toUpperCase()) || 0;
    return [...(board.assignableUsers || [])].sort(
      (a, b) => of2(b) - of2(a) || String(a.initials || "").localeCompare(String(b.initials || "")),
    );
  }, [board.tasks, board.assignableUsers]);

  /**
   * What the floor has said TODAY.
   *
   * The count that matters is not how many recordings exist — it is whether
   * anybody spoke this morning. Two updates across sixty jobs on the floor is
   * the finding, and it is only visible if today is counted on its own.
   *
   * Compared on the local date rather than a 24-hour window: "today" to
   * somebody on the shop floor means since they came in, not since this time
   * yesterday.
   */
  const todayNotes = notes.filter((n) => String(n.at).slice(0, 10) === TODAY);
  const todayJobs = new Set(todayNotes.map((n) => n.job_id)).size;

  /**
   * The day-wise work study: who is actually standing at each job TODAY.
   * Recorded here, shown on the Job Plan and the walk sheet, kept per day —
   * and meant to be checked against the attendance muster, which is the
   * whole reason it is a ledger and not a scribble.
   */
  const [manpower, setManpower] = useState<Record<string, Crew>>({});
  const [mpOpen, setMpOpen] = useState<string | null>(null);
  const loadManpower = useCallback(() => {
    api.get("/api/on-floor/manpower")
      .then((r: { rows?: { job_id: string; crew: Crew }[] }) => {
        setManpower(Object.fromEntries((r.rows || []).map((x) => [x.job_id, x.crew])));
      })
      .catch(() => {});
  }, []);
  useEffect(() => { loadManpower(); }, [loadManpower]);

  const mpTotals = useMemo(() => {
    const tot: Record<string, number> = {};
    let people = 0, jobsWith = 0;
    for (const j of jobs) {
      const c = manpower[j.id];
      if (!c) continue;
      let any = false;
      for (const t of TRADES) {
        const n = Number(c[t.key]) || 0;
        tot[t.key] = (tot[t.key] || 0) + n;
        people += n;
        if (n) any = true;
      }
      if (any) jobsWith++;
    }
    return { tot, people, jobsWith };
  }, [jobs, manpower]);

  return (
    <div className="p-4">
      <div className="flex justify-end gap-2 mb-2 no-print">
        <a href="/floor-report" target="_blank" rel="noopener noreferrer"
          className="rounded px-3 py-1.5 font-bold text-xs"
          style={{ background: "#16232F", color: "#fff" }}>
          📄 Quick print — the walk sheet
        </a>
        {isStrat && (
          <a href="/floor-report?full=1" target="_blank" rel="noopener noreferrer"
            className="rounded px-3 py-1.5 font-bold text-xs"
            style={{ background: "#E8600A", color: "#fff" }}
            title="With the commercials and the pending-jobs pages — Stratcom's print">
            📄 PRE edition — with commercials
          </a>
        )}
      </div>
      <div className="rounded-lg border px-3 py-2 mb-2 flex items-center gap-3 flex-wrap" style={{ borderColor: "#E2E0DA", background: "#fff" }}>
        <b className="text-xs" style={{ color: "#8A94A0", letterSpacing: ".04em" }}>WORKING TODAY</b>
        <CrewRowsTable rows={[{ label: "today", crew: mpTotals.tot as Partial<Crew>, bold: true }]} />
        <span className="text-sm font-extrabold" style={{ color: "#22303C" }}>{mpTotals.people} people</span>
        <span className="text-xs" style={{ color: "#8A94A0" }}>
          on {mpTotals.jobsWith} of {jobs.length} jobs
          {mpTotals.jobsWith < jobs.length ? " · the rest have no allocation recorded today" : ""}
        </span>
        <span className="text-xs" style={{ color: "#B3261E" }}>must match the attendance muster</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2 mb-3">
        <StatCard label="ON FLOOR" value={String(jobs.length)} sub="jobs being worked on now" color="#0D7A3F" />
        <StatCard label="VALUE" value={V(totVal)} color="#1B3A5C" />
        <StatCard label="THROUGHPUT" value={V(totTp)} sub={totVal ? `${Math.round((totTp / totVal) * 100)}% of value` : ""} color="#E8600A" />
        <StatCard label="DELIVERED · 7 DAYS" value={String(d7.n)}
          sub={d7.n ? `${V(d7.val)} · TP ${V(d7.tp)}` : "nothing went out"} color="#1B3A5C" />
        <StatCard label="DELIVERED · 30 DAYS" value={String(d30.n)}
          sub={d30.n ? `${V(d30.val)} · TP ${V(d30.tp)}` : "nothing went out"} color="#1B3A5C" />
        <StatCard label="ALREADY LATE" value={String(late.length)} sub={late.length ? "past OTD" : "none past OTD"} color={late.length ? "#B3261E" : "#0D7A3F"} />
        <StatCard
          label="SHOP UPDATES TODAY"
          value={String(todayNotes.length)}
          sub={
            todayNotes.length
              ? `on ${todayJobs} of ${jobs.length} job${jobs.length === 1 ? "" : "s"} on the floor`
              : jobs.length
                ? "nobody has said anything yet today"
                : ""
          }
          color={todayNotes.length ? "#7C3AED" : "#8A94A0"}
        />
      </div>

      {!installed && (
        <div className="text-xs rounded p-2 mb-3" style={{ background: "#FFF7E6", color: "#8A5A00" }}>
          Run migration 0040 — voice notes have nowhere to save yet. The table below works regardless.
        </div>
      )}
      {msg && <div className="text-xs font-bold rounded p-2 mb-2" style={{ background: "#FBEDEA", color: "#B3261E" }}>{msg}</div>}

      {jobs.length === 0 && (
        <div className="text-sm rounded-lg border p-4" style={{ borderColor: "#E2E0DA", background: "#fff", color: "#8A94A0" }}>
          No job is ticked as being on the floor. {isStrat ? "Tick them on the Priority List." : "Stratcom tick these on the Priority List."}
        </div>
      )}

      <div className="space-y-2">
        {jobs.map((j) => {
          // Late against the date on the board — this page is about today.
          const delay = j.tdd ? diffDays(j.tdd, TODAY) : null;
          const mine = byJob.get(j.id) || [];
          return (
            <div key={j.id} className="bg-white rounded-lg border" style={{ borderColor: "#E2E0DA", borderLeft: `4px solid ${delay && delay > 0 ? "#B3261E" : "#0D7A3F"}` }}>
              {/* Stacks on a phone. This page is read at the machine far more
                  often than at a desk, so the narrow layout is the real one:
                  every column goes full width rather than being squeezed. */}
              <div className="flex flex-wrap gap-3 p-3 floor-row">
                {/* who and what */}
                <div className="floor-cell" style={{ flex: "1 1 260px", minWidth: 0 }}>
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <button onClick={() => setPicked(j)} className="font-bold" style={{ color: "#1B3A5C", textDecoration: "underline" }} title="Open this job">{jobNo(j.id)}</button>
                    <span className="text-xs" style={{ color: "#8A94A0" }}>{j.fam}</span>
                  </div>
                  <div className="text-sm font-semibold" style={{ color: "#22303C" }}>{j.tag}</div>
                  <div className="text-xs mt-0.5 flex gap-3 flex-wrap">
                    <span style={{ color: "#8A94A0" }}>TDD <b style={{ color: delay && delay > 0 ? "#B3261E" : "#22303C" }}>{fmtFull(j.tdd)}</b></span>
                    <span style={{ color: delay == null ? "#B8B5AC" : delay > 0 ? "#B3261E" : "#0D7A3F", fontWeight: 700 }}>
                      {delay == null ? "no date" : delay > 0 ? `${delay}d late` : delay === 0 ? "due today" : `${-delay}d to go`}
                    </span>
                    {j.proj ? (
                      <button onClick={() => setProj(j.proj)} style={{ color: "#7C3AED", fontWeight: 700, textDecoration: "underline" }} title="Every job on this project">
                        {String(j.proj).replace(/^NGSE-PROJ-/, "PROJ ")}
                      </button>
                    ) : (
                      <span style={{ color: "#B8B5AC" }}>no project</span>
                    )}
                  </div>

                  {/* the crew as the walk sheet prints it: PLAN (the stage's
                      crew from the milestone plan) over TODAY (recorded, bold) */}
                  <div className="mt-1.5">
                    <FloorCrewTable
                      plan={(() => {
                        const p = board.plans[j.id];
                        const stage = (p?.milestones || []).find((m) => !m.done);
                        return (stage as { crew?: Partial<Crew> } | undefined)?.crew ?? null;
                      })()}
                      today={manpower[j.id] ?? null}
                    />
                    <div className="mt-1">
                      {!(manpower[j.id] && Object.values(manpower[j.id]).some((n) => n)) && (
                        <div className="text-xs font-bold" style={{ color: "#E8600A" }}>no manpower recorded today</div>
                      )}
                      {canTask && (
                        <button onClick={() => setMpOpen(mpOpen === j.id ? null : j.id)}
                          className="text-xs font-bold rounded px-2 py-0.5 mt-0.5"
                          style={{ background: mpOpen === j.id ? "#22303C" : "#F4F2EC", color: mpOpen === j.id ? "#fff" : "#22303C" }}>
                          {mpOpen === j.id ? "✕ close" : "Manpower Allocation"}
                        </button>
                      )}
                      {mpOpen === j.id && (
                        <ManpowerEditor jobId={j.id} value={manpower[j.id]}
                          onSaved={() => { setMpOpen(null); loadManpower(); }} />
                      )}
                    </div>
                  </div>
                </div>

                {/* owners */}
                <div className="floor-cell" style={{ flex: "0 0 230px" }}>
                  <div className="text-xs font-bold mb-1" style={{ color: "#8A94A0" }}>OWNERS</div>
                  {/* The Planning Owner comes from the ERP and is read-only
                      here; the other four are Genie's own and are set from
                      this row. Four names, because "who do I ring about this"
                      has a different answer depending on what has gone wrong. */}
                  <div className="text-xs mb-1">
                    <span style={{ color: "#8A94A0" }}>Job </span>
                    <b style={{ color: "#22303C" }}>{j.ownerName || j.own || "—"}</b>
                  </div>
                  {([
                    ["Quality", "quality_owner", j.qualityOwner],
                    ["Production", "production_owner", j.productionOwner],
                    ["Kitting", "kitting_owner", j.kittingOwner],
                    ["Design", "design_owner", j.designOwner],
                  ] as const).map(([label, field, val]) => (
                    <div key={field} className="text-xs flex items-center gap-1 mb-0.5">
                      <span style={{ color: "#8A94A0", width: 58, flexShrink: 0 }}>{label}</span>
                      {canEdit ? (
                        <select
                          value={val || ""}
                          onChange={(e) => setOwner(j, field, e.target.value)}
                          className="text-xs border rounded px-1 py-0.5 bg-white font-semibold"
                          style={{ borderColor: val ? "#E2E0DA" : "#E8600A", color: val ? "#22303C" : "#E8600A", maxWidth: 150 }}
                        >
                          <option value="">— not set —</option>
                          {usersFor(field).map((p) => (
                            <option key={p.initials || p.email} value={p.initials || ""}>{personLabel(p)}</option>
                          ))}
                        </select>
                      ) : (
                        <b style={{ color: val ? "#22303C" : "#B8B5AC" }}>{val || "not set"}</b>
                      )}
                    </div>
                  ))}

                </div>

                {/* what is open on it */}
                <div className="floor-cell floor-work" style={{ flex: "0 0 150px" }}>
                  <div className="text-xs font-bold mb-1" style={{ color: "#8A94A0" }}>OPEN ON IT</div>
                  {(() => {
                    const w = workByJob.get(j.id) || { tasks: [], esc: [] };
                    return (
                      <div className="flex flex-col gap-1 floor-btns">
                        <div className="flex gap-1 items-stretch">
                          <button
                            onClick={() => w.tasks.length && setWork({ job: j, only: "tasks" })}
                            disabled={!w.tasks.length}
                            className="rounded px-2 py-1 text-left flex-1"
                            style={{ background: w.tasks.length ? "#DCE8F5" : "#F4F2EC", cursor: w.tasks.length ? "pointer" : "default" }}
                          >
                            <b className="tnum" style={{ color: w.tasks.length ? "#1B3A5C" : "#B8B5AC", fontSize: 15 }}>{w.tasks.length}</b>
                            <span className="text-xs" style={{ color: "#5A6672" }}> task{w.tasks.length === 1 ? "" : "s"} pending</span>
                          </button>
                          {canTask && (
                            <button
                              onClick={() => setQuickAdd({ job: j, kind: "task" })}
                              className="rounded px-1.5 font-bold"
                              style={{ background: "#1B3A5C", color: "#fff" }}
                              title="Add a task on this job"
                            >
                              +
                            </button>
                          )}
                        </div>
                        <div className="flex gap-1 items-stretch">
                          <button
                            onClick={() => onOpen(j.id)}
                            className="rounded px-2 py-1 text-left flex-1"
                            style={{ background: (matCounts[j.id] || 0) ? "#FDF3E1" : "#F4F2EC", cursor: "pointer" }}
                            title="Open the job's Material Kitting"
                          >
                            <b className="tnum" style={{ color: (matCounts[j.id] || 0) ? "#8A5A00" : "#B8B5AC", fontSize: 15 }}>{matCounts[j.id] || 0}</b>
                            <span className="text-xs" style={{ color: "#5A6672" }}> material pending</span>
                          </button>
                          {canEdit && (
                            <button
                              onClick={() => setQuickAdd({ job: j, kind: "material" })}
                              className="rounded px-1.5 font-bold"
                              style={{ background: "#8A5A00", color: "#fff" }}
                              title="Add a kitting line on this job"
                            >
                              +
                            </button>
                          )}
                        </div>
                        <button
                          onClick={() => w.esc.length && setWork({ job: j, only: "esc" })}
                          disabled={!w.esc.length}
                          className="rounded px-2 py-1 text-left"
                          style={{ background: w.esc.length ? "#FBEDEA" : "#F4F2EC", cursor: w.esc.length ? "pointer" : "default" }}
                        >
                          <b className="tnum" style={{ color: w.esc.length ? "#B3261E" : "#B8B5AC", fontSize: 15 }}>{w.esc.length}</b>
                          <span className="text-xs" style={{ color: "#5A6672" }}> escalation{w.esc.length === 1 ? "" : "s"}</span>
                        </button>
                        <button
                          onClick={() => setGallery(j)}
                          className="rounded px-2 py-1 text-left"
                          style={{ background: "#F3EEFB" }}
                          title="Photographs of this job as it is built"
                        >
                          <span className="text-xs font-bold" style={{ color: "#7C3AED" }}>📷 Photos</span>
                        </button>
                      </div>
                    );
                  })()}
                </div>

                {/* the floor's own words */}
                <div className="floor-cell" style={{ flex: "2 1 340px", minWidth: 0 }}>
                  <VoiceNotes jobId={j.id} notes={mine} installed={installed} onSaved={load}
                    floor={j.floorSummary} floorAt={j.floorSummaryAt}
                    thanksFor={{ name: myName, tdd: j.tdd, job: jobNo(j.id) }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {picked && (
        <JobLightbox
          job={toWip(picked)}
          V={V}
          colour="#0D7A3F"
          onClose={() => setPicked(null)}
          onOpenPlan={() => { const id = picked.id; setPicked(null); onOpen(id); }}
          canEdit={canEdit}
          onSaved={reload}
        />
      )}

      {work && (
        <WorkList
          job={work.job}
          tasks={(workByJob.get(work.job.id) || { tasks: [], esc: [] })[work.only]}
          only={work.only}
          canTask={canTask}
          people={rankedPeople}
          onChanged={() => { void reload(); }}
          onClose={() => setWork(null)}
        />
      )}

      {quickAdd && (
        <QuickAddOnFloor
          job={quickAdd.job}
          kind={quickAdd.kind}
          people={rankedPeople}
          onClose={() => setQuickAdd(null)}
          onDone={() => {
            setQuickAdd(null);
            if (quickAdd.kind === "material") loadMatCounts();
            else void reload();
          }}
        />
      )}

      {proj && (
        <ProjectJobs
          proj={proj}
          jobs={board.jobs.filter((x) => x.proj === proj)}
          V={V}
          onClose={() => setProj(null)}
          onOpen={(id) => { setProj(null); onOpen(id); }}
        />
      )}

      {gallery && <PhotoGallery job={gallery} canEdit={canTask} onClose={() => setGallery(null)} />}
    </div>
  );
}

/** A board Job in the shape the scatter's lightbox expects. */
function toWip(j: Job): WipJob {
  return {
    id: j.id, tag: j.tag, cust: j.cust, fam: j.fam || "Unassigned",
    tdd: j.tdd, otd: j.otd, stat: j.stat, val: j.val, tpv: j.tpv, tpp: j.tpp,
    kit: j.kit, pct: j.pct, note: j.note, escalation: j.escalation,
    clientUpdate: j.clientUpdate, cashflow: j.cashflow,
    amtNeeded: j.amtNeeded, payOnDelivery: j.payOnDelivery,
    ownerInitials: j.ownerInitials, ownerName: j.ownerName,
  } as WipJob;
}

/**
 * What is open on a job, listed.
 *
 * The job name is at the top because this opens from a count on a row: by the
 * time the box is up, the row that was clicked is behind it, and a list of
 * tasks with no job on it belongs to nothing.
 */
function WorkList({
  job, tasks, only, canTask, people, onChanged, onClose,
}: {
  job: Job; tasks: Task[]; only: "tasks" | "esc"; canTask: boolean;
  people: { initials?: string | null; name?: string | null }[];
  onChanged: () => void; onClose: () => void;
}) {
  const sorted = [...tasks].sort((a, b) => String(a.due || "9999").localeCompare(String(b.due || "9999")));
  // A row opens the task itself — the count was the door, not the room.
  const [editing, setEditing] = useState<Task | null>(null);
  return (
    <div onClick={onClose} className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.45)", zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg w-full" style={{ maxWidth: 620, maxHeight: "82vh", overflow: "auto" }}>
        <div className="px-4 py-3" style={{ background: "#16232F", color: "#fff", position: "sticky", top: 0 }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-bold" style={{ letterSpacing: 1.2, color: "#8FA1B3" }}>
                {only === "esc" ? "ESCALATIONS" : "TASKS PENDING"} · {sorted.length}
              </div>
              <div className="font-bold" style={{ fontSize: 17 }}>JOB {jobNo(job.id)} · {job.tag}</div>
            </div>
            <button onClick={onClose} style={{ color: "#8FA1B3", fontSize: 18 }}>✕</button>
          </div>
        </div>
        <div className="p-3">
          {sorted.length === 0 && <div className="text-sm" style={{ color: "#8A94A0" }}>Nothing open.</div>}
          {sorted.map((t) => (
            <div
              key={t.kind + t.id}
              onClick={() => canTask && setEditing(t)}
              className="rounded border p-2 mb-1.5"
              style={{
                borderColor: "#E2E0DA", borderLeft: `3px solid ${escalated(t.esc) ? "#B3261E" : "#1B3A5C"}`,
                cursor: canTask ? "pointer" : "default",
              }}
              title={canTask ? "Open this task" : undefined}
            >
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <div className="text-sm font-semibold" style={{ color: "#16232F" }}>{t.t}</div>
                  <div className="text-xs mt-0.5 flex gap-3 flex-wrap" style={{ color: "#8A94A0" }}>
                    <span>{t.cat}</span>
                    <span>{t.who ? whoTag(t.who) : "unassigned"}</span>
                    <span style={{ color: taskLate(t, TODAY) ? "#B3261E" : "#8A94A0", fontWeight: taskLate(t, TODAY) ? 700 : 400 }}>
                      due {fmtFull(t.due)}
                    </span>
                    {(t.push_count || 0) > 0 && <span style={{ color: "#B3261E" }}>moved {t.push_count}×</span>}
                  </div>
                </div>
                {escalated(t.esc) && (
                  <span className="rounded px-1.5 py-0.5 text-xs font-bold flex-shrink-0" style={{ background: "#B3261E", color: "#fff" }}>{(t.esc || "").slice(0, 2)}</span>
                )}
              </div>
              {t.esc_why && <div className="text-xs mt-1" style={{ color: "#5A6672" }}>{t.esc_why}</div>}
            </div>
          ))}
        </div>
      </div>
      {editing && (
        <TaskQuickEdit
          task={editing}
          people={people}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onChanged(); }}
        />
      )}
    </div>
  );
}

/**
 * Type-and-choose for a person — the dropdown was irritating (Dr Raghu,
 * 25 Aug 2026). Type initials or a name, pick from what matches; whatever
 * lands is ALWAYS CAPS, because that is how initials are written here.
 */
function WhoTypeAhead({
  value, people, onPick, width = 150,
}: {
  value: string;
  people: { initials?: string | null; name?: string | null }[];
  onPick: (v: string) => void;
  width?: number;
}) {
  const [text, setText] = useState(value === "unassigned" ? "" : value.toUpperCase());
  const [open, setOpen] = useState(false);
  useEffect(() => { setText(value === "unassigned" ? "" : value.toUpperCase()); }, [value]);
  const needle = text.trim().toLowerCase();
  const hits = people
    .filter((p) => p.initials)
    .filter((p) =>
      !needle
      || String(p.initials).toLowerCase().startsWith(needle)
      || String(p.name || "").toLowerCase().includes(needle))
    .slice(0, 8);
  return (
    <div style={{ position: "relative", width }}>
      <input
        value={text}
        placeholder="WHO?"
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        onChange={(e) => {
          const v = e.target.value.toUpperCase();
          setText(v); setOpen(true);
          onPick(v.trim() || "unassigned");
        }}
        className="w-full rounded border px-2 py-1.5 text-sm font-bold"
        style={{ borderColor: "#E2E0DA", textTransform: "uppercase" }}
      />
      {open && hits.length > 0 && (
        <div className="rounded border" style={{
          position: "absolute", top: "105%", left: 0, right: 0, zIndex: 80,
          background: "#fff", borderColor: "#E2E0DA", maxHeight: 200, overflowY: "auto",
          boxShadow: "0 8px 24px rgba(22,35,47,.2)",
        }}>
          {hits.map((p) => (
            <button
              key={p.initials as string}
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(String(p.initials).toUpperCase());
                setText(String(p.initials).toUpperCase());
                setOpen(false);
              }}
              className="w-full text-left px-2 py-1.5 text-sm"
            >
              <b>{String(p.initials).toUpperCase()}</b>
              <span className="text-xs" style={{ color: "#8A94A0" }}> · {p.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The task, opened from the pending/escalations list — title, owner, date,
 * escalation, done — enough to act without leaving the floor. Writes through
 * the same /api/tasks the Tasking screen uses, so the drift log (push_count,
 * original_due) keeps working here too.
 */
function TaskQuickEdit({
  task, people, onClose, onSaved,
}: {
  task: Task;
  people: { initials?: string | null; name?: string | null }[];
  onClose: () => void; onSaved: () => void;
}) {
  const [title, setTitle] = useState(task.t);
  const [who, setWho] = useState(task.who || "unassigned");
  const [due, setDue] = useState(task.due || "");
  const [esc, setEsc] = useState(task.esc || "None");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const save = async (alsoDone: boolean) => {
    setBusy(true); setErr("");
    try {
      await api.post("/api/tasks", {
        action: "update", id: task.id, kind: task.kind,
        title, who, due: due || null, esc,
      });
      if (alsoDone) await api.post("/api/tasks", { action: "toggle", id: task.id, kind: task.kind });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div onClick={onClose} className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.5)", zIndex: 70 }}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg w-full" style={{ maxWidth: 480 }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ background: "#16232F", color: "#fff" }}>
          <div className="text-xs font-bold" style={{ letterSpacing: 1.2, color: "#8FA1B3" }}>TASK</div>
          <button onClick={onClose} style={{ color: "#8FA1B3", fontSize: 18 }}>✕</button>
        </div>
        <div className="p-3 space-y-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded border px-2 py-1.5 text-sm" style={{ borderColor: "#E2E0DA" }} />
          <div className="flex gap-2 flex-wrap">
            <WhoTypeAhead value={who} people={people} onPick={setWho} />
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)}
              className="rounded border px-2 py-1.5 text-sm" style={{ borderColor: "#E2E0DA" }} />
            <select value={esc} onChange={(e) => setEsc(e.target.value)}
              className="rounded border px-2 py-1.5 text-sm" style={{ borderColor: "#E2E0DA" }}>
              {["None", "L1", "L2", "L3"].map((x) => <option key={x} value={x}>{x === "None" ? "no escalation" : x}</option>)}
            </select>
          </div>
          {err && <div className="text-xs font-bold rounded p-2" style={{ background: "#FBEDEA", color: "#B3261E" }}>{err}</div>}
          <div className="flex gap-2 justify-end pt-1">
            <button onClick={() => save(true)} disabled={busy}
              className="rounded px-3 py-1.5 text-xs font-bold" style={{ background: "#E6F4EA", color: "#0D7A3F" }}>
              ✔ Save &amp; mark done
            </button>
            <button onClick={() => save(false)} disabled={busy}
              className="rounded px-3 py-1.5 text-xs font-bold" style={{ background: "#16232F", color: "#fff" }}>
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The + beside the On Floor chips: a task or a kitting line, born on the job
 * where the need was noticed, without leaving the page.
 */
function QuickAddOnFloor({
  job, kind, people, onClose, onDone,
}: {
  job: Job; kind: "task" | "material";
  people: { initials?: string | null; name?: string | null }[];
  onClose: () => void; onDone: () => void;
}) {
  const [text, setText] = useState("");
  const [who, setWho] = useState("unassigned");
  const [due, setDue] = useState("");
  const [qty, setQty] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    if (!text.trim()) { setErr(kind === "task" ? "What is the task?" : "What is the material?"); return; }
    setBusy(true); setErr("");
    try {
      if (kind === "task") {
        await api.post("/api/tasks", {
          action: "create", job_id: job.id, title: text.trim(),
          who, due: due || null, cat: "Production",
        });
      } else {
        await api.post("/api/materials", {
          action: "add", job_id: job.id, item: text.trim(),
          qty, status: "Yet to receive", due: due || null,
        });
      }
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div onClick={onClose} className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.5)", zIndex: 70 }}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg w-full" style={{ maxWidth: 480 }}>
        <div className="px-4 py-3" style={{ background: "#16232F", color: "#fff" }}>
          <div className="text-xs font-bold" style={{ letterSpacing: 1.2, color: "#8FA1B3" }}>
            {kind === "task" ? "NEW TASK" : "NEW KITTING LINE"}
          </div>
          <div className="font-bold" style={{ fontSize: 15 }}>JOB {jobNo(job.id)} · {job.tag}</div>
        </div>
        <div className="p-3 space-y-2">
          <input
            autoFocus value={text} onChange={(e) => setText(e.target.value)}
            placeholder={kind === "task" ? "What needs doing?" : "What material is needed?"}
            className="w-full rounded border px-2 py-1.5 text-sm" style={{ borderColor: "#E2E0DA" }}
          />
          <div className="flex gap-2 flex-wrap">
            {kind === "task" ? (
              <WhoTypeAhead value={who} people={people} onPick={setWho} />
            ) : (
              <input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="qty"
                className="rounded border px-2 py-1.5 text-sm" style={{ borderColor: "#E2E0DA", width: 90 }} />
            )}
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)}
              className="rounded border px-2 py-1.5 text-sm" style={{ borderColor: "#E2E0DA" }}
              title={kind === "task" ? "due" : "needed by"} />
          </div>
          {err && <div className="text-xs font-bold rounded p-2" style={{ background: "#FBEDEA", color: "#B3261E" }}>{err}</div>}
          <div className="flex justify-end pt-1">
            <button onClick={save} disabled={busy}
              className="rounded px-3 py-1.5 text-xs font-bold" style={{ background: "#E8600A", color: "#fff" }}>
              {busy ? "Saving…" : kind === "task" ? "Add task" : "Add line"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Every job on one project. */
function ProjectJobs({
  proj, jobs, V, onClose, onOpen,
}: { proj: string; jobs: Job[]; V: (n: number) => string; onClose: () => void; onOpen: (id: string) => void }) {
  const sorted = [...jobs].sort((a, b) => String(a.tdd || "9999").localeCompare(String(b.tdd || "9999")));
  return (
    <div onClick={onClose} className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.45)", zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg w-full" style={{ maxWidth: 680, maxHeight: "82vh", overflow: "auto" }}>
        <div className="px-4 py-3" style={{ background: "#16232F", color: "#fff", position: "sticky", top: 0 }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-bold" style={{ letterSpacing: 1.2, color: "#8FA1B3" }}>PROJECT · {sorted.length} JOB{sorted.length === 1 ? "" : "S"}</div>
              <div className="font-bold" style={{ fontSize: 17 }}>{proj}</div>
            </div>
            <button onClick={onClose} style={{ color: "#8FA1B3", fontSize: 18 }}>✕</button>
          </div>
        </div>
        <div className="p-3">
          {sorted.map((j) => (
            <div key={j.id} className="flex items-baseline gap-2 rounded border p-2 mb-1.5" style={{ borderColor: "#E2E0DA" }}>
              <button onClick={() => onOpen(j.id)} className="font-bold" style={{ color: "#1B3A5C", textDecoration: "underline" }}>{jobNo(j.id)}</button>
              <span className="text-sm flex-1" style={{ color: "#22303C" }}>{j.tag}</span>
              <span className="text-xs tnum" style={{ color: j.tdd && j.tdd < TODAY ? "#B3261E" : "#8A94A0" }}>{fmtFull(j.tdd)}</span>
              <span className="text-xs tnum" style={{ color: "#5A6672" }}>{V(j.val)}</span>
              <span className="text-xs tnum" style={{ color: "#8A94A0" }}>{j.pct}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Record, transcribe, keep.
 *
 * Transcription happens IN THE BROWSER, through the Web Speech API, while the
 * recording is running. That is deliberate: it needs no second API key, costs
 * nothing per note, and the words appear as they are spoken so somebody can
 * see it heard them correctly before they stop. Where the browser has no
 * dictation the audio is still saved — a note you can play is better than no
 * note, and the summary falls back to whatever text there is.
 */
function VoiceNotes({
  jobId,
  notes,
  installed,
  onSaved,
  floor,
  floorAt,
  thanksFor,
}: {
  jobId: string;
  notes: { id: string; url: string | null; seconds: number | null; transcript: string; summary: string; by: string | null; at: string }[];
  installed: boolean;
  onSaved: () => void;
  /** Genie's read of the last three. Written when a note is recorded. */
  floor?: string | null;
  floorAt?: string | null;
  /** Enough to thank the person by name and tell them what they just moved. */
  thanksFor?: { name: string; tdd: string | null; job: string };
}) {
  /** Three in front of you; the rest a click away, never deleted. */
  const RECENT = 3;
  const [showAll, setShowAll] = useState(false);
  const [rec, setRec] = useState(false);
  const [live, setLive] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [openNote, setOpenNote] = useState<string | null>(null);
  /** Shown once, straight after a note is saved. */
  const [thanks, setThanks] = useState(false);
  /**
   * The read is the answer; the recordings are the evidence.
   *
   * Folded by default because on a page listing every job on the floor, three
   * players and two suggestions per row is a wall nobody scrolls past. Open it
   * when you want to hear it said or act on what was heard.
   */
  const [detail, setDetail] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const srRef = useRef<any>(null);
  const startedRef = useRef(0);
  const textRef = useRef("");

  const stop = () => {
    try { mediaRef.current?.stop(); } catch { /* already stopped */ }
    try { srRef.current?.stop(); } catch { /* dictation may not be running */ }
    setRec(false);
  };

  const start = async () => {
    setErr(""); setLive(""); textRef.current = "";
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        const seconds = Math.max(1, Math.round((Date.now() - startedRef.current) / 1000));
        const transcript = textRef.current.trim();
        if (!blob.size && !transcript) return;
        setBusy(true);
        try {
          const fd = new FormData();
          fd.append("job_id", jobId);
          fd.append("transcript", transcript);
          fd.append("seconds", String(seconds));
          if (blob.size) fd.append("file", new File([blob], "note.webm", { type: blob.type }));
          const r = await fetch("/api/voice-note", { method: "POST", body: fd });
          const j = await r.json();
          if (!r.ok) throw new Error(j.error || "Could not save the note");
          onSaved();
          setThanks(true);
        } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
        setBusy(false);
        setLive("");
      };
      mr.start();
      mediaRef.current = mr;
      startedRef.current = Date.now();
      setRec(true);

      // Dictation, where the browser has it. Absence is not an error.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SR) {
        const sr = new SR();
        sr.continuous = true;
        sr.interimResults = true;
        sr.lang = "en-IN";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sr.onresult = (ev: any) => {
          let done = "", interim = "";
          for (let i = 0; i < ev.results.length; i++) {
            const r0 = ev.results[i];
            if (r0.isFinal) done += r0[0].transcript + " ";
            else interim += r0[0].transcript;
          }
          textRef.current = done.trim();
          setLive((done + interim).trim());
        };
        sr.onerror = () => {};
        sr.start();
        srRef.current = sr;
      }
    } catch (e) {
      // The old message blamed the device for what was usually a refused
      // prompt. Name the actual cause, and say what to do about it.
      const name = (e as { name?: string })?.name || "";
      setErr(
        name === "NotAllowedError"
          ? "The browser blocked the microphone. Click the padlock in the address bar → Microphone → Allow, then press Record again."
          : name === "NotFoundError"
            ? "No microphone is connected to this machine."
            : name === "NotReadableError"
              ? "Something else is using the microphone — close it and press Record again."
              : "Could not open the microphone on this browser.",
      );
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <div className="text-xs font-bold" style={{ color: "#8A94A0" }}>FROM THE FLOOR</div>
        {installed && (
          rec ? (
            <button onClick={stop} className="rounded px-2 py-0.5 text-xs font-bold text-white" style={{ background: "#B3261E" }}>■ Stop</button>
          ) : (
            <button onClick={start} disabled={busy} className="rounded px-2 py-0.5 text-xs font-bold text-white" style={{ background: busy ? "#B8B5AC" : "#0D7A3F" }}>
              {busy ? "saving…" : "🎙 Record"}
            </button>
          )
        )}
        <span className="text-xs ml-auto" style={{ color: "#B8B5AC" }}>
          {notes.length} note{notes.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Genie's read of the last three. Three separate accounts of one job is
          not a position; this is. The recordings stay underneath for anyone
          who wants to hear it said. */}
      {floor && (
        <div className="rounded p-2 mb-1.5" style={{ background: "#F3EEFB", border: "1px solid #C9B6EA" }}>
          <div className="text-xs font-bold" style={{ color: "#7C3AED", letterSpacing: .6 }}>
            ✨ GENIE — THE READ ON THIS JOB
          </div>
          <div className="text-xs mt-0.5" style={{ color: "#22303C", lineHeight: 1.55 }}>{floor}</div>
          {floorAt && (
            <div style={{ fontSize: 10, color: "#8A94A0", marginTop: 3 }}>
              from the last {Math.min(notes.length, RECENT)} note{Math.min(notes.length, RECENT) === 1 ? "" : "s"} · {new Date(floorAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
            </div>
          )}
        </div>
      )}

      {rec && (
        <div className="rounded p-2 mb-1 text-xs" style={{ background: "#FBEDEA", border: "1px solid #B3261E", color: "#22303C" }}>
          <b style={{ color: "#B3261E" }}>● recording</b> {live || <span style={{ color: "#8A94A0" }}>speak — the words appear here as you go</span>}
        </div>
      )}
      {err && <div className="text-xs font-bold mb-1" style={{ color: "#B3261E" }}>{err}</div>}

      {(notes.length > 0 || floor) && (
        <button
          onClick={() => setDetail((v) => !v)}
          className="text-xs font-bold w-full text-left rounded px-2 py-1"
          style={{ background: detail ? "#F4F2EC" : "transparent", color: "#1B3A5C" }}
        >
          {detail ? "⌃ hide the recordings" : `⌄ ${notes.length} recording${notes.length === 1 ? "" : "s"} — and anything Genie heard to do`}
        </button>
      )}

      {detail && <TaskProposals jobId={jobId} />}

      {notes.length === 0 && !rec && (
        <div className="text-xs" style={{ color: "#B8B5AC" }}>Nothing recorded on this job yet.</div>
      )}

      {detail && (showAll ? notes : notes.slice(0, RECENT)).map((n) => (
        <div key={n.id} className="rounded mb-1 px-2 py-1.5" style={{ background: "#F4F2EC", border: "1px solid #E2E0DA" }}>
          <div className="text-xs" style={{ color: "#22303C", lineHeight: 1.5 }}>{n.summary || n.transcript || "(no words captured)"}</div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {n.url && <audio controls preload="none" src={n.url} style={{ height: 26, maxWidth: 210 }} />}
            <span style={{ fontSize: 10, color: "#8A94A0" }}>
              {whoTag(n.by)} · {new Date(n.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
              {n.seconds ? ` · ${n.seconds}s` : ""}
            </span>
            {n.transcript && n.transcript !== n.summary && (
              <button onClick={() => setOpenNote(openNote === n.id ? null : n.id)} className="font-bold" style={{ fontSize: 10, color: "#1B3A5C" }}>
                {openNote === n.id ? "hide what was said" : "what was said"}
              </button>
            )}
          </div>
          {openNote === n.id && (
            <div className="text-xs mt-1 pt-1" style={{ color: "#5A6672", borderTop: "1px solid #E2E0DA", lineHeight: 1.55 }}>{n.transcript}</div>
          )}
        </div>
      ))}

      {thanks && thanksFor && (
        <ThankYou who={thanksFor.name} tdd={thanksFor.tdd} job={thanksFor.job} onClose={() => setThanks(false)} />
      )}

      {detail && notes.length > RECENT && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="text-xs font-bold"
          style={{ color: "#1B3A5C" }}
        >
          {showAll ? `↑ show the latest ${RECENT}` : `↓ all ${notes.length} recordings — nothing is deleted`}
        </button>
      )}
    </div>
  );
}

/**
 * Documents that sit alongside the principles.
 *
 * Some of the thinking already exists as a document — Breakthrough 2027, a
 * manifesto, a one-pager somebody has to sign. Retyping those into the text
 * box would lose the formatting, the diagrams and the point, so they are
 * attached rather than transcribed.
 *
 * Owner uploads and removes; everybody else opens. The list is shown even when
 * empty for the owner, so the door is visible without hunting for it — and
 * hidden when empty for everyone else, because a heading over nothing reads
 * like something failed to load.
 */
function PrincipleFiles({ isOwner }: { isOwner: boolean }) {
  interface F { id: string; name: string; note: string; mime: string | null; bytes: number | null; by: string | null; at: string; url: string | null }
  const [files, setFiles] = useState<F[]>([]);
  const [installed, setInstalled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const pick = useRef<HTMLInputElement | null>(null);

  const load = useCallback(() => {
    api.get("/api/principles/files")
      .then((r: { installed?: boolean; files?: F[] }) => { setInstalled(r.installed !== false); setFiles(r.files || []); })
      .catch(() => setInstalled(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const upload = async (f: File | null) => {
    if (!f) return;
    setBusy(true); setErr("");
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("note", note);
      const r = await fetch("/api/principles/files", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not upload that");
      setNote("");
      load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
    if (pick.current) pick.current.value = "";
  };

  const remove = async (f: F) => {
    if (!window.confirm(`Remove "${f.name}"?\n\nThe file is deleted, not hidden.`)) return;
    try {
      const r = await fetch(`/api/principles/files?id=${encodeURIComponent(f.id)}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json()).error || "Could not remove it");
      load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };

  const size = (b: number | null) =>
    !b ? "" : b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`;
  const icon = (m: string | null, n: string) => {
    const t = `${m || ""} ${n}`.toLowerCase();
    if (t.includes("pdf")) return "📕";
    if (/sheet|excel|\.xlsx?|\.csv/.test(t)) return "📊";
    if (/presentation|powerpoint|\.pptx?/.test(t)) return "📽";
    if (/word|\.docx?/.test(t)) return "📄";
    if (/image|\.png|\.jpe?g/.test(t)) return "🖼";
    return "📎";
  };

  if (!installed && !isOwner) return null;
  if (!files.length && !isOwner) return null;

  return (
    <div className="mt-6">
      <h2 className="font-bold" style={{ color: "#16232F", fontSize: 18, marginBottom: 2 }}>Documents</h2>
      <p className="text-xs" style={{ color: "#8A94A0", marginBottom: 10 }}>
        The longer form — read them alongside the principles above.
      </p>

      {!installed && (
        <div className="text-xs rounded p-2 mb-2" style={{ background: "#FFF7E6", color: "#8A5A00" }}>
          Run migration 0041 — documents have nowhere to go yet.
        </div>
      )}
      {err && <div className="text-xs font-bold rounded p-2 mb-2" style={{ background: "#FBEDEA", color: "#B3261E" }}>{err}</div>}

      {files.length === 0 && installed && (
        <div className="text-xs rounded-lg border p-3 mb-2" style={{ borderColor: "#E2E0DA", background: "#fff", color: "#8A94A0" }}>
          Nothing attached yet.
        </div>
      )}

      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(290px,1fr))" }}>
        {files.map((f) => (
          <div key={f.id} className="rounded-lg border bg-white p-3 flex gap-3 items-start" style={{ borderColor: "#E2E0DA" }}>
            <span style={{ fontSize: 22, lineHeight: 1 }}>{icon(f.mime, f.name)}</span>
            <div className="min-w-0 flex-1">
              {f.url ? (
                <a href={f.url} target="_blank" rel="noreferrer" className="font-bold text-sm block truncate"
                   style={{ color: "#1B3A5C" }} title={f.name}>{f.name}</a>
              ) : (
                <span className="font-bold text-sm block truncate" style={{ color: "#8A94A0" }}>{f.name}</span>
              )}
              {f.note && <div className="text-xs mt-0.5" style={{ color: "#5A6672", lineHeight: 1.5 }}>{f.note}</div>}
              <div style={{ fontSize: 10.5, color: "#B8B5AC", marginTop: 3 }}>
                {size(f.bytes)}{f.bytes ? " · " : ""}{whoTag(f.by)} · {fmtFull(String(f.at).slice(0, 10))}
              </div>
            </div>
            {isOwner && (
              <button onClick={() => remove(f)} className="rounded px-1.5 py-0.5 text-xs font-bold flex-shrink-0"
                      style={{ background: "#FBEDEA", color: "#B3261E" }} title="Remove this document">✕</button>
            )}
          </div>
        ))}
      </div>

      {isOwner && installed && (
        <div className="mt-2 rounded-lg border bg-white p-3" style={{ borderColor: "#E2E0DA" }}>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="One line saying what it is (optional)"
            className="w-full text-xs border rounded px-2 py-1 mb-2"
            style={{ borderColor: "#E2E0DA" }}
          />
          <input
            ref={pick}
            type="file"
            onChange={(e) => upload(e.target.files?.[0] || null)}
            style={{ display: "none" }}
          />
          <button
            onClick={() => pick.current?.click()}
            disabled={busy}
            className="rounded px-4 py-1.5 text-sm font-bold text-white"
            style={{ background: busy ? "#B8B5AC" : "#1B3A5C" }}
          >
            {busy ? "uploading…" : "⬆ Attach a document"}
          </button>
          <span className="text-xs ml-2" style={{ color: "#8A94A0" }}>PDF, Word, slides, a sheet — up to 25 MB</span>
        </div>
      )}
    </div>
  );
}

/**
 * The build history of a job, in photographs.
 *
 * Production completion is a number somebody types. A photograph is not
 * arguable — and a row of them in date order is the only record in Genie of
 * what the machine actually looked like on the way.
 *
 * Each photo keeps the COMPLETION AS IT WAS on the day it was taken, not a
 * reading of whatever the job says now. The number on a job moves; the picture
 * does not, and "70% on 12 August" is what makes the pair worth keeping.
 */
function PhotoGallery({ job, canEdit, onClose }: { job: Job; canEdit: boolean; onClose: () => void }) {
  return (
    <div onClick={onClose} className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.5)", zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg w-full" style={{ maxWidth: 860, maxHeight: "88vh", overflow: "auto" }}>
        <div className="px-4 py-3" style={{ background: "#16232F", color: "#fff", position: "sticky", top: 0, zIndex: 2 }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-bold" style={{ letterSpacing: 1.2, color: "#8FA1B3" }}>PHOTOS</div>
              <div className="font-bold" style={{ fontSize: 17 }}>JOB {jobNo(job.id)} · {job.tag}</div>
            </div>
            <button onClick={onClose} style={{ color: "#8FA1B3", fontSize: 18 }}>✕</button>
          </div>
        </div>
        <div className="p-3"><PhotoBody job={job} canEdit={canEdit} /></div>
      </div>
    </div>
  );
}

/** The gallery itself, shared by the lightbox and the Photos tab. */
function PhotoBody({ job, canEdit }: { job: Job; canEdit: boolean }) {
  interface P { id: string; url: string | null; caption: string; pct: number | null; taken_on: string; by: string | null }
  const [photos, setPhotos] = useState<P[]>([]);
  const [installed, setInstalled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [big, setBig] = useState<P | null>(null);
  const [form, setForm] = useState({ caption: "", pct: String(job.pct ?? ""), taken_on: TODAY });
  /**
   * The photo waiting to be saved.
   *
   * It used to upload the instant a file was chosen, which meant you could not
   * see what you had picked, and the date, completion and caption you typed
   * were applied to whatever you selected NEXT. Choose, look, then Save.
   */
  const [chosen, setChosen] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  /**
   * Said out loud after a save.
   *
   * A photo appearing in a grid of photos is not obviously YOUR photo having
   * been saved, particularly on a phone where the grid is below the fold. It
   * clears itself — a confirmation that stays becomes furniture.
   */
  const [saved, setSaved] = useState(false);
  const pick = useRef<HTMLInputElement | null>(null);

  // Object URLs are held by the browser until told otherwise.
  useEffect(() => {
    if (!chosen) { setPreview(null); return; }
    const url = URL.createObjectURL(chosen);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [chosen]);

  const load = useCallback(() => {
    api.get(`/api/job-photo?job_id=${encodeURIComponent(job.id)}`)
      .then((r: { installed?: boolean; photos?: P[] }) => { setInstalled(r.installed !== false); setPhotos(r.photos || []); })
      .catch(() => setInstalled(false));
  }, [job.id]);
  useEffect(() => { load(); }, [load]);

  const upload = async () => {
    const f = chosen;
    if (!f) return;
    setBusy(true); setErr("");
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("job_id", job.id);
      fd.append("caption", form.caption);
      fd.append("pct", form.pct);
      fd.append("taken_on", form.taken_on);
      const r = await fetch("/api/job-photo", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not save that photo");
      setForm({ caption: "", pct: String(job.pct ?? ""), taken_on: TODAY });
      setChosen(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
      load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
    if (pick.current) pick.current.value = "";
  };

  const remove = async (p: P) => {
    if (!window.confirm("Remove this photo?\n\nThe file is deleted, not hidden.")) return;
    try {
      const r = await fetch(`/api/job-photo?id=${encodeURIComponent(p.id)}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json()).error || "Could not remove it");
      load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <>
          {!installed && (
            <div className="text-xs rounded p-2 mb-2" style={{ background: "#FFF7E6", color: "#8A5A00" }}>
              Run migration 0042 — photos have nowhere to go yet.
            </div>
          )}
          {err && <div className="text-xs font-bold rounded p-2 mb-2" style={{ background: "#FBEDEA", color: "#B3261E" }}>{err}</div>}

          {photos.length === 0 && installed && (
            <div className="text-sm mb-3" style={{ color: "#8A94A0" }}>No photographs of this job yet.</div>
          )}

          <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(190px,1fr))" }}>
            {photos.map((p) => (
              <div key={p.id} className="rounded-lg border overflow-hidden" style={{ borderColor: "#E2E0DA" }}>
                {p.url && (
                  <button onClick={() => setBig(p)} style={{ display: "block", width: "100%", padding: 0, border: 0, cursor: "zoom-in" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={p.caption || `Job ${jobNo(job.id)}`} style={{ width: "100%", height: 130, objectFit: "cover", display: "block" }} />
                  </button>
                )}
                <div className="p-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <b className="text-xs tnum" style={{ color: "#16232F" }}>
                      {fmtFull(p.taken_on)}
                      {saved && photos[0]?.id === p.id && (
                        <span className="ml-1 rounded px-1" style={{ background: "#E6F4EA", color: "#0D7A3F", fontSize: 9 }}>SAVED</span>
                      )}
                    </b>
                    {p.pct != null && (
                      <span className="rounded px-1.5 text-xs font-bold" style={{ background: "#E6F4EA", color: "#0D7A3F" }}>{p.pct}%</span>
                    )}
                  </div>
                  {p.caption && <div className="text-xs mt-0.5" style={{ color: "#5A6672", lineHeight: 1.45 }}>{p.caption}</div>}
                  <div className="flex items-center justify-between mt-1">
                    <span style={{ fontSize: 10, color: "#B8B5AC" }}>{whoTag(p.by)}</span>
                    {canEdit && (
                      <button onClick={() => remove(p)} className="font-bold" style={{ fontSize: 10, color: "#B3261E" }}>remove</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {canEdit && installed && (
            <div className="rounded-lg border p-3 mt-3" style={{ borderColor: "#E2E0DA", background: "#FAF9F5" }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold" style={{ color: "#8A94A0" }}>ADD A PHOTO</span>
                {saved && (
                  <span className="rounded px-2 py-0.5 text-xs font-bold" style={{ background: "#E6F4EA", color: "#0D7A3F" }}>
                    ✓ SAVED
                  </span>
                )}
              </div>
              <div className="flex gap-2 flex-wrap mb-2">
                <label className="text-xs" style={{ color: "#5A6672" }}>
                  Taken on<br />
                  <input type="date" value={form.taken_on} onChange={(e) => setForm({ ...form, taken_on: e.target.value })}
                    className="text-xs border rounded px-1 py-1" style={{ borderColor: "#E2E0DA" }} />
                </label>
                <label className="text-xs" style={{ color: "#5A6672" }}>
                  Completion %<br />
                  <input type="number" min={0} max={100} value={form.pct} onChange={(e) => setForm({ ...form, pct: e.target.value })}
                    className="text-xs border rounded px-1 py-1" style={{ borderColor: "#E2E0DA", width: 80 }} />
                </label>
                <label className="text-xs flex-1" style={{ color: "#5A6672", minWidth: 200 }}>
                  What it shows<br />
                  <input value={form.caption} onChange={(e) => setForm({ ...form, caption: e.target.value })}
                    placeholder="optional" className="w-full text-xs border rounded px-2 py-1" style={{ borderColor: "#E2E0DA" }} />
                </label>
              </div>
              <input ref={pick} type="file" accept="image/*" capture="environment"
                onChange={(e) => { setErr(""); setChosen(e.target.files?.[0] || null); }} style={{ display: "none" }} />

              {chosen && preview ? (
                <div className="flex gap-3 items-center flex-wrap">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt="" style={{ width: 84, height: 84, objectFit: "cover", borderRadius: 6, border: "1px solid #E2E0DA" }} />
                  <div style={{ minWidth: 0 }}>
                    <div className="text-xs font-semibold truncate" style={{ color: "#22303C", maxWidth: 220 }}>{chosen.name}</div>
                    <div style={{ fontSize: 11, color: "#8A94A0" }}>
                      {chosen.size > 1e6 ? `${(chosen.size / 1e6).toFixed(1)} MB` : `${Math.round(chosen.size / 1e3)} KB`}
                    </div>
                    <button onClick={() => pick.current?.click()} className="font-bold" style={{ fontSize: 11, color: "#1B3A5C" }}>
                      choose a different one
                    </button>
                  </div>
                  <button onClick={upload} disabled={busy}
                    className="rounded px-4 py-1.5 text-sm font-bold text-white"
                    style={{ background: busy ? "#B8B5AC" : "#0D7A3F" }}>
                    {busy ? "saving…" : "💾 Save photo"}
                  </button>
                  <button onClick={() => { setChosen(null); if (pick.current) pick.current.value = ""; }}
                    className="text-xs font-semibold" style={{ color: "#8A94A0" }}>Cancel</button>
                </div>
              ) : (
                <>
                  <button onClick={() => pick.current?.click()} disabled={busy}
                    className="rounded px-4 py-1.5 text-sm font-bold text-white" style={{ background: busy ? "#B8B5AC" : "#7C3AED" }}>
                    📷 Take or choose a photo
                  </button>
                  <span className="text-xs ml-2" style={{ color: "#8A94A0" }}>
                    the completion is stored as it is today, and does not move afterwards
                  </span>
                </>
              )}
            </div>
          )}
      {big?.url && (
        <div onClick={(e) => { e.stopPropagation(); setBig(null); }}
          className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.85)", zIndex: 61, cursor: "zoom-out" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={big.url} alt={big.caption || ""} style={{ maxWidth: "94vw", maxHeight: "88vh", objectFit: "contain" }} />
        </div>
      )}
    </>
  );
}

// ============================ Job top row ============================

/**
 * What a job is worth, and how much of it is real yet.
 *
 * THE FORMULAS. `tpp` is the throughput PERCENTAGE of a job — what the company
 * earns on it — so the rest of the value is bought-in material:
 *
 *   material   = value × (1 − tpp%)         what has to be purchased
 *   kitted     = material × kitting%        of that, what is in
 *   throughput = value × tpp%               what the company earns
 *   WIP        = kitted + throughput × production%
 *
 * WIP is the one worth explaining. Material is money spent the day it arrives,
 * so all of the kitted value is already in the job. Throughput is not: it is
 * earned by converting that material, so it accrues with production. Adding
 * them gives what is genuinely sunk into the job today — which is a different
 * and more useful number than "value × production %", the figure that treats a
 * job with all its steel on the floor and nothing built as worth nothing.
 */
export function jobMoney(j: Job) {
  const val = j.val || 0;
  const tpp = (j.tpp || 0) / 100;
  const material = val * (1 - tpp);
  const kitted = material * ((j.kit || 0) / 100);
  // tpv is the throughput in rupees where the export carries it; the
  // percentage is the fallback, never both.
  const throughput = j.tpv || val * tpp;
  const wip = kitted + throughput * ((j.pct || 0) / 100);
  // Advance is what has already been paid: the order value less whatever is
  // still due on delivery. Null when nobody has recorded the pending figure —
  // a job with no number is not a job that was paid in full.
  const pending = j.payOnDelivery;
  const advance = pending == null ? null : Math.max(0, val - pending);
  return { val, material, kitted, throughput, wip, pending, advance };
}

function JobTopRow({
  job, V, sticky, shadow, onShopUpdate,
}: {
  job: Job; V: (n: number) => string; sticky?: boolean; shadow?: boolean; onShopUpdate: () => void;
}) {
  const m = jobMoney(job);
  const Cell = ({ label, children, grow = "1 1 190px" }: { label: string; children: React.ReactNode; grow?: string }) => (
    <div style={{ flex: grow, minWidth: 0 }}>
      <div className="text-xs font-bold" style={{ color: "#8A94A0", letterSpacing: .8, marginBottom: 2 }}>{label}</div>
      {children}
    </div>
  );
  const Pair = ({ a, av, b, bv, ac, bc }: { a: string; av: string; b: string; bv: string; ac?: string; bc?: string }) => (
    <div className="flex gap-3 flex-wrap" style={{ fontSize: 12 }}>
      <span style={{ color: "#8A94A0" }}>{a} <b className="tnum" style={{ color: ac || "#22303C" }}>{av}</b></span>
      <span style={{ color: "#8A94A0" }}>{b} <b className="tnum" style={{ color: bc || "#22303C" }}>{bv}</b></span>
    </div>
  );

  return (
    <div
      className="rounded-lg border bg-white px-3 py-2 mb-2 job-top"
      style={{
        borderColor: "#E2E0DA",
        borderLeft: "5px solid #E8600A",
        ...(sticky
          ? { position: "sticky" as const, top: "calc(var(--hdr-h, 92px) + 46px)", zIndex: 21 }
          : {}),
        boxShadow: shadow ? "0 10px 18px -12px rgba(0,0,0,.35)" : undefined,
      }}
    >
      <div className="flex gap-4 flex-wrap items-start">
        {/* 1 — which job */}
        <div style={{ flex: "0 0 150px", minWidth: 0 }}>
          <div className="font-bold" style={{ color: "#16232F", fontSize: 24, lineHeight: 1.05 }}>JOB {jobNo(job.id)}</div>
          <a href={erpJobLink(job.id)} target="_blank" rel="noreferrer" className="underline" style={{ color: "#8A94A0", fontSize: 11 }}>
            {job.id} ↗
          </a>
        </div>

        {/* 2 — who it is for */}
        <Cell label="CUSTOMER TAG" grow="1 1 240px">
          <div className="text-sm font-semibold truncate" style={{ color: "#1B3A5C" }} title={job.tag}>{job.tag}</div>
          <div className="text-xs truncate" style={{ color: "#5A6672" }} title={`${job.cust} · ${job.fam}`}>
            {job.cust} <span style={{ color: "#B8B5AC" }}>|</span> {job.fam}
          </div>
        </Cell>

        {/* 3 — what it is worth, and how much of it is real */}
        <Cell label="VALUE &amp; PROGRESS" grow="1 1 250px">
          <Pair a="Value" av={V(m.val)} b="Throughput" bv={V(m.throughput)} bc="#0D7A3F" />
          <Pair a={`Kitting ${job.kit || 0}%`} av={V(m.kitted)} b="of material" bv={V(m.material)} ac="#0D9488" bc="#8A94A0" />
          <Pair a={`Built ${job.pct || 0}%`} av={V(m.wip)} b="WIP" bv="" ac="#7C3AED" />
        </Cell>

        {/* 4 — the money */}
        <Cell label="MONEY" grow="1 1 230px">
          <Pair
            a="Needed next month" av={job.amtNeeded == null ? "—" : V(job.amtNeeded)}
            b="Advance in" bv={m.advance == null ? "not known" : V(m.advance)}
            ac="#D97706" bc={m.advance == null ? "#B8B5AC" : "#0D7A3F"}
          />
          <div style={{ fontSize: 12, color: "#8A94A0" }}>
            Pending on delivery <b className="tnum" style={{ color: m.pending == null ? "#B8B5AC" : "#B3261E" }}>
              {m.pending == null ? "not recorded" : V(m.pending)}
            </b>
          </div>
          {m.advance != null && (
            <div style={{ fontSize: 10, color: "#B8B5AC" }}>advance = value − pending on delivery</div>
          )}
        </Cell>

        {/* 5 — what the floor last said */}
        <Cell label="SHOP UPDATE" grow="2 1 280px">
          {job.floorSummary ? (
            <>
              <div className="text-xs" style={{ color: "#22303C", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                {redactMoney(job.floorSummary)}
              </div>
              <button onClick={onShopUpdate} className="text-xs font-bold mt-0.5" style={{ color: "#7C3AED" }}>
                all updates ↗
              </button>
            </>
          ) : (
            <div className="text-xs" style={{ color: "#B8B5AC" }}>
              Nothing recorded from the floor yet.{" "}
              <button onClick={onShopUpdate} className="font-bold" style={{ color: "#7C3AED" }}>open</button>
            </div>
          )}
        </Cell>
      </div>
    </div>
  );
}

/**
 * Every shop update on a job, newest first — the summary, then what was said,
 * then the recording itself.
 *
 * All three because they answer different questions. The summary is what you
 * read; the transcript is what you search; the recording is what you fall back
 * to when the words on the page do not sound like what somebody meant.
 */
function ShopUpdates({ job, onClose }: { job: Job; onClose: () => void }) {
  return (
    <div onClick={onClose} className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.5)", zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg w-full" style={{ maxWidth: 720, maxHeight: "88vh", overflow: "auto" }}>
        <div className="px-4 py-3" style={{ background: "#16232F", color: "#fff", position: "sticky", top: 0, zIndex: 2 }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-bold" style={{ letterSpacing: 1.2, color: "#8FA1B3" }}>SHOP UPDATES</div>
              <div className="font-bold" style={{ fontSize: 17 }}>JOB {jobNo(job.id)} · {job.tag}</div>
            </div>
            <button onClick={onClose} style={{ color: "#8FA1B3", fontSize: 18 }}>✕</button>
          </div>
        </div>

        <div className="p-3">
          <ShopUpdatesBody job={job} />
        </div>
      </div>
    </div>
  );
}

/** The history itself, shared by the lightbox and the tab. */
function ShopUpdatesBody({ job }: { job: Job }) {
  interface N { id: string; url: string | null; seconds: number | null; transcript: string; summary: string; by: string | null; at: string }
  const [notes, setNotes] = useState<N[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/api/voice-note?job_id=${encodeURIComponent(job.id)}`)
      .then((r: { notes?: N[] }) => setNotes(r.notes || []))
      .catch(() => setNotes([]))
      .finally(() => setLoading(false));
  }, [job.id]);

  const todayN = notes.filter((n) => String(n.at).slice(0, 10) === TODAY).length;

  return (
    <>
          {/* Today first. "Nine updates on record" says nothing about whether
              anybody has looked at this job this morning; "2 today" does. */}
          {!loading && (
            <div className="flex items-baseline gap-3 flex-wrap mb-2">
              <span className="rounded px-2 py-1 text-sm font-bold"
                style={{ background: todayN ? "#F3EEFB" : "#F4F2EC", color: todayN ? "#7C3AED" : "#8A94A0" }}>
                {todayN} today
              </span>
              <span className="text-xs" style={{ color: "#8A94A0" }}>
                {notes.length} in total{notes.length ? ` · latest ${new Date(notes[0].at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}
              </span>
            </div>
          )}

          {job.floorSummary && (
            <div className="rounded p-3 mb-3" style={{ background: "#F3EEFB", border: "1px solid #C9B6EA" }}>
              <div className="text-xs font-bold" style={{ color: "#7C3AED", letterSpacing: .6 }}>✨ GENIE — THE READ ON THIS JOB</div>
              <div className="text-sm mt-1" style={{ color: "#22303C", lineHeight: 1.6 }}>{redactMoney(job.floorSummary)}</div>
              {job.floorSummaryAt && (
                <div style={{ fontSize: 10, color: "#8A94A0", marginTop: 4 }}>
                  from the latest notes · {new Date(job.floorSummaryAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </div>
              )}
            </div>
          )}

          {loading && <div className="text-sm" style={{ color: "#8A94A0" }}>Reading…</div>}
          {!loading && notes.length === 0 && (
            <div className="text-sm" style={{ color: "#8A94A0" }}>
              Nothing recorded on this job yet. Updates are recorded on the <b>On Floor</b> tab.
            </div>
          )}

          {notes.map((n) => (
            <div key={n.id} className="rounded border p-3 mb-2" style={{ borderColor: "#E2E0DA" }}>
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <b className="text-sm" style={{ color: "#16232F" }}>{n.summary || "(no summary)"}</b>
                <span style={{ fontSize: 11, color: "#8A94A0", whiteSpace: "nowrap" }}>
                  {whoTag(n.by)} · {new Date(n.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  {n.seconds ? ` · ${n.seconds}s` : ""}
                </span>
              </div>
              {n.transcript && (
                <div className="text-xs mt-1.5 rounded px-2 py-1.5" style={{ background: "#F4F2EC", color: "#5A6672", lineHeight: 1.55 }}>
                  {n.transcript}
                </div>
              )}
              {n.url && <audio controls preload="none" src={n.url} style={{ height: 30, width: "100%", marginTop: 6 }} />}
            </div>
          ))}
    </>
  );
}

/**
 * Shop Updates, as a page under the plan rather than a box over it.
 *
 * Same content as the lightbox, and deliberately the same component beneath —
 * the summary first, then every entry newest first with what was said and the
 * recording. Two renderings of one history is two places for them to disagree
 * about the order.
 */
function ShopUpdatesPanel({ job }: { job: Job }) {
  return (
    <div className="bg-white rounded-lg border p-3 mb-4" style={{ borderColor: "#E2E0DA" }}>
      <div className="flex items-baseline gap-2 flex-wrap mb-2">
        <h2 className="font-bold" style={{ color: "#16232F" }}>Shop Updates</h2>
        <span className="text-xs" style={{ color: "#8A94A0" }}>
          what the floor has said about JOB {jobNo(job.id)} — newest first · recorded on the On Floor tab
        </span>
      </div>
      <ShopUpdatesBody job={job} />
    </div>
  );
}

/**
 * What Genie heard somebody needs to do — offered, not created.
 *
 * A task list is only worth opening if everything on it was put there on
 * purpose. Things appearing that nobody asked for is how people stop reading
 * the list within a fortnight, so nothing reaches a task list until a person
 * presses Add.
 *
 * Accepting makes an ORDINARY task on the Planning Owner, who reassigns if it
 * belongs elsewhere. Once it exists nothing distinguishes it from a typed one:
 * a task that behaves differently because of where it came from is a task
 * people have to think about before trusting.
 */
function TaskProposals({ jobId }: { jobId: string }) {
  interface P { id: string; title: string; detail: string; cat: string | null; due: string | null }
  const [items, setItems] = useState<P[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    api.get(`/api/task-proposal?job_id=${encodeURIComponent(jobId)}`)
      .then((r: { proposals?: P[] }) => setItems(r.proposals || []))
      .catch(() => setItems([]));
  }, [jobId]);
  useEffect(() => { load(); }, [load]);

  const act = async (p: P, action: "accept" | "dismiss") => {
    setBusy(p.id); setErr("");
    try {
      const r = await api.post("/api/task-proposal", { action, id: p.id });
      if (action === "accept" && !r.who) {
        setErr("Added — but this job has no Planning Owner, so it is unassigned. Set one on the job, or assign it from Tasking.");
      }
      load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(null);
  };

  if (!items.length && !err) return null;

  return (
    <div className="rounded p-2 mb-1.5" style={{ background: "#FFF7E6", border: "1px solid #E0B25C" }}>
      {items.length > 0 && (
        <div className="text-xs font-bold mb-1" style={{ color: "#8A5A00", letterSpacing: .5 }}>
          ✨ GENIE HEARD {items.length} THING{items.length === 1 ? "" : "S"} TO DO
        </div>
      )}
      {err && <div className="text-xs font-bold mb-1" style={{ color: "#B3261E" }}>{err}</div>}
      {items.map((p) => (
        <div key={p.id} className="rounded bg-white px-2 py-1.5 mb-1" style={{ border: "1px solid #EFE3C8" }}>
          <div className="text-xs font-semibold" style={{ color: "#16232F", lineHeight: 1.45 }}>{p.title}</div>
          {p.detail && <div className="text-xs" style={{ color: "#8A94A0", lineHeight: 1.4 }}>{p.detail}</div>}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span style={{ fontSize: 10, color: "#8A94A0" }}>
              {p.cat || "Production"}{p.due ? ` · due ${fmtFull(p.due)}` : " · no date said"}
            </span>
            <button
              onClick={() => act(p, "accept")}
              disabled={busy === p.id}
              className="rounded px-2 py-0.5 font-bold text-white"
              style={{ background: busy === p.id ? "#B8B5AC" : "#0D7A3F", fontSize: 11 }}
              title="Create this task on the job's Planning Owner, who can reassign it"
            >
              + Add to the job
            </button>
            <button
              onClick={() => act(p, "dismiss")}
              disabled={busy === p.id}
              className="font-bold"
              style={{ color: "#8A94A0", fontSize: 11 }}
              title="Not a task — Genie keeps the rejection so a suggestion that keeps being wrong can be spotted"
            >
              not a task
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================ Feature Requests ============================

const WANTS: [string, string, string][] = [
  ["must", "Must have", "#B3261E"],
  ["good", "Good to have", "#D97706"],
  ["future", "Future potential", "#1B3A5C"],
];
const FR_STATUSES: [string, string, string][] = [
  ["open", "Open", "#5A6672"],
  ["planned", "Planned", "#7C3AED"],
  ["done", "Done", "#0D7A3F"],
  ["declined", "Not doing", "#8A94A0"],
];

/**
 * Asking for something in Genie, inside Genie.
 *
 * Requests arrive today as a sentence in a chat or a remark on a call, and the
 * ones not acted on the same day are gone. This gives them somewhere to sit
 * with what was actually meant: the words, a picture of the screen, and how
 * badly it is wanted.
 *
 * HOW BADLY is stated by the person asking, not inferred from how forcefully
 * they asked. Everything sounds urgent in the sentence it is written in;
 * almost nothing is, and the person asking knows which.
 */
function FeatureRequests({ isOwner }: { isOwner: boolean }) {
  interface F {
    id: string; title: string; body: string; want: string; status: string; note: string;
    by: string | null; at: string; acted_by: string | null; acted_at: string | null;
    files: { id: string; name: string; mime: string | null; url: string | null }[];
  }
  const [items, setItems] = useState<F[]>([]);
  const [installed, setInstalled] = useState(true);
  const [writing, setWriting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [title, setTitle] = useState("");
  const [want, setWant] = useState("good");
  const [files, setFiles] = useState<File[]>([]);
  const editor = useRef<HTMLDivElement | null>(null);
  const pick = useRef<HTMLInputElement | null>(null);

  const load = useCallback(() => {
    api.get("/api/feature")
      .then((r: { installed?: boolean; items?: F[] }) => { setInstalled(r.installed !== false); setItems(r.items || []); })
      .catch(() => setInstalled(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const cmd = (c: string) => {
    editor.current?.focus();
    document.execCommand(c);
  };

  const submit = async () => {
    if (title.trim().length < 3) { setErr("Give it a title."); return; }
    setBusy(true); setErr("");
    try {
      const fd = new FormData();
      fd.append("title", title);
      fd.append("body", editor.current?.innerHTML || "");
      fd.append("want", want);
      files.forEach((f) => fd.append("file", f));
      const r = await fetch("/api/feature", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not save that");
      setTitle(""); setWant("good"); setFiles([]);
      if (editor.current) editor.current.innerHTML = "";
      setWriting(false);
      load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };

  const setStatus = async (f: F, status: string) => {
    try {
      await fetch("/api/feature", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: f.id, status, note: f.note }),
      });
      load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };

  // The developer's margin: a note editable in place, kept with the request —
  // what was done, what was decided, what to know when it is picked up again.
  const [noteEdit, setNoteEdit] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const saveNote = async (f: F) => {
    try {
      await fetch("/api/feature", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: f.id, status: f.status, note: noteText.trim() }),
      });
      setNoteEdit(null);
      load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };

  const shown = items.filter((f) =>
    (filter === "all" || f.want === filter) && (statusFilter === "all" || f.status === statusFilter));
  const count = (k: string) => items.filter((f) => f.want === k && f.status === "open").length;
  // What actually got done, recently — acted_at is stamped when the status moves.
  const doneSince = (days: number) => {
    const cut = new Date(Date.now() - days * 86400000).toISOString();
    return items.filter((f) => f.status === "done" && f.acted_at && f.acted_at >= cut).length;
  };

  return (
    <div className="p-4" style={{ maxWidth: 980 }}>
      <div className="flex items-baseline gap-2 flex-wrap mb-1">
        <h2 className="font-bold text-lg" style={{ color: "#16232F" }}>Feature Requests</h2>
        <span className="text-xs" style={{ color: "#8A94A0" }}>
          ask for anything in Genie — everyone can raise one and read the rest
        </span>
      </div>

      {!installed && (
        <div className="text-xs rounded p-2 mb-2" style={{ background: "#FFF7E6", color: "#8A5A00" }}>
          Run migration 0045 — requests have nowhere to go yet.
        </div>
      )}
      {err && <div className="text-xs font-bold rounded p-2 mb-2" style={{ background: "#FBEDEA", color: "#B3261E" }}>{err}</div>}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2 mb-3">
        {WANTS.map(([k, label, c]) => (
          <StatCard key={k} label={`PENDING · ${label.toUpperCase()}`} value={String(count(k))} sub="still open" color={c} />
        ))}
        <StatCard label="DONE · 7 DAYS" value={String(doneSince(7))} sub="completed this week" color="#0D7A3F" />
        <StatCard label="DONE · 15 DAYS" value={String(doneSince(15))} sub="completed this fortnight" color="#0D7A3F" />
        <StatCard label="DONE · 30 DAYS" value={String(doneSince(30))} sub="completed this month" color="#0D7A3F" />
      </div>

      <div className="flex gap-2 mb-3 flex-wrap items-center">
        {!writing && installed && (
          <button onClick={() => setWriting(true)} className="rounded px-4 py-1.5 text-sm font-bold text-white" style={{ background: "#E8600A" }}>
            + Raise a request
          </button>
        )}
        <select value={filter} onChange={(e) => setFilter(e.target.value)}
          className="px-2 py-1 rounded border text-sm font-semibold" style={{ borderColor: "#D9D6CD" }}>
          <option value="all">Everything</option>
          {WANTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="px-2 py-1 rounded border text-sm font-semibold" style={{ borderColor: "#D9D6CD" }}>
          <option value="all">Any status</option>
          {FR_STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <span className="text-xs" style={{ color: "#8A94A0" }}>{shown.length} shown</span>
      </div>

      {writing && (
        <div className="bg-white rounded-lg border p-3 mb-3" style={{ borderColor: "#E8600A" }}>
          <input
            autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="What do you want, in one line?"
            className="w-full text-sm font-bold border rounded px-2 py-1.5 mb-2"
            style={{ borderColor: "#E2E0DA" }}
          />

          <div className="flex gap-1 mb-1">
            {([["bold", "B"], ["italic", "I"], ["insertUnorderedList", "• list"], ["insertOrderedList", "1. list"]] as const).map(([c, l]) => (
              <button key={c} onMouseDown={(e) => { e.preventDefault(); cmd(c); }}
                className="rounded px-2 py-0.5 text-xs font-bold" style={{ background: "#F4F2EC", color: "#22303C" }}>{l}</button>
            ))}
            <span className="text-xs ml-auto" style={{ color: "#B8B5AC" }}>write as much as you like</span>
          </div>
          <div
            ref={editor}
            contentEditable
            suppressContentEditableWarning
            className="w-full text-sm border rounded px-3 py-2"
            style={{ borderColor: "#E2E0DA", minHeight: 220, lineHeight: 1.6, outline: "none", background: "#fff" }}
          />

          <div className="flex gap-2 items-center flex-wrap mt-2">
            <label className="text-xs font-semibold" style={{ color: "#5A6672" }}>
              How badly{" "}
              <select value={want} onChange={(e) => setWant(e.target.value)}
                className="text-sm border rounded px-2 py-1 font-semibold"
                style={{ borderColor: "#E2E0DA", color: WANTS.find(([k]) => k === want)?.[2] }}>
                {WANTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </label>
            <input ref={pick} type="file" multiple style={{ display: "none" }}
              onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0, 5))} />
            <button onClick={() => pick.current?.click()} className="rounded px-3 py-1 text-xs font-bold" style={{ background: "#DCE8F5", color: "#1B3A5C" }}>
              📎 Attach {files.length ? `· ${files.length}` : ""}
            </button>
            {files.length > 0 && (
              <span className="text-xs truncate" style={{ color: "#8A94A0", maxWidth: 260 }}>{files.map((f) => f.name).join(", ")}</span>
            )}
            <button onClick={submit} disabled={busy} className="rounded px-4 py-1.5 text-sm font-bold text-white ml-auto"
              style={{ background: busy ? "#B8B5AC" : "#0D7A3F" }}>{busy ? "sending…" : "Send it"}</button>
            <button onClick={() => setWriting(false)} className="text-xs font-semibold" style={{ color: "#8A94A0" }}>Cancel</button>
          </div>
        </div>
      )}

      {shown.length === 0 && installed && !writing && (
        <div className="text-sm rounded-lg border p-4" style={{ borderColor: "#E2E0DA", background: "#fff", color: "#8A94A0" }}>
          Nothing here yet.
        </div>
      )}

      {shown.map((f) => {
        const w = WANTS.find(([k]) => k === f.want);
        const st = FR_STATUSES.find(([k]) => k === f.status);
        return (
          <div key={f.id} className="bg-white rounded-lg border p-3 mb-2" style={{ borderColor: "#E2E0DA", borderLeft: `4px solid ${w?.[2] || "#E2E0DA"}` }}>
            <div className="flex items-start gap-2 flex-wrap">
              <div className="flex-1" style={{ minWidth: 240 }}>
                <div className="font-bold text-sm" style={{ color: "#16232F" }}>{f.title}</div>
                <div className="text-xs" style={{ color: "#8A94A0" }}>
                  {whoTag(f.by)} · {fmtFull(String(f.at).slice(0, 10))}
                </div>
              </div>
              <span className="rounded px-2 py-0.5 text-xs font-bold" style={{ background: `${w?.[2]}18`, color: w?.[2] }}>{w?.[1]}</span>
              {isOwner ? (
                <select value={f.status} onChange={(e) => setStatus(f, e.target.value)}
                  className="text-xs border rounded px-1 py-0.5 font-bold bg-white"
                  style={{ borderColor: "#E2E0DA", color: st?.[2] }}>
                  {FR_STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              ) : (
                <span className="rounded px-2 py-0.5 text-xs font-bold" style={{ background: "#F4F2EC", color: st?.[2] }}>{st?.[1]}</span>
              )}
            </div>

            {f.body && (
              <div className="text-sm mt-2 feature-body" style={{ color: "#22303C", lineHeight: 1.6 }}
                dangerouslySetInnerHTML={{ __html: f.body }} />
            )}

            {f.files.length > 0 && (
              <div className="flex gap-2 flex-wrap mt-2">
                {f.files.map((a) => (
                  a.url && /^image\//.test(a.mime || "") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <a key={a.id} href={a.url} target="_blank" rel="noreferrer">
                      <img src={a.url} alt={a.name} style={{ height: 90, borderRadius: 4, border: "1px solid #E2E0DA" }} />
                    </a>
                  ) : (
                    <a key={a.id} href={a.url || "#"} target="_blank" rel="noreferrer"
                      className="text-xs rounded px-2 py-1" style={{ background: "#F4F2EC", color: "#1B3A5C" }}>📎 {a.name}</a>
                  )
                ))}
              </div>
            )}

            {isOwner && (
              <div className="mt-2">
                {noteEdit === f.id ? (
                  <div>
                    <textarea
                      value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={2}
                      placeholder="The developer's note — what was done, what to know."
                      className="w-full text-xs border rounded px-2 py-1.5" style={{ borderColor: "#E2E0DA" }}
                    />
                    <div className="flex gap-2 mt-1">
                      <button onClick={() => saveNote(f)} className="rounded px-2 py-0.5 text-xs font-bold text-white" style={{ background: "#0D7A3F" }}>Save note</button>
                      <button onClick={() => setNoteEdit(null)} className="rounded px-2 py-0.5 text-xs font-bold" style={{ background: "#F4F2EC", color: "#22303C" }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => { setNoteEdit(f.id); setNoteText(f.note || ""); }}
                    className="text-xs font-bold" style={{ color: "#1B3A5C" }}>
                    ✎ {f.note ? "Edit note" : "Add note"}
                  </button>
                )}
              </div>
            )}
            {f.note && noteEdit !== f.id && (
              <div className="text-xs mt-2 rounded px-2 py-1" style={{ background: "#F4F2EC", color: "#5A6672" }}>
                <b>{whoTag(f.acted_by)}:</b> {f.note}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * The thank-you, straight after a shop-floor update.
 *
 * Recording a note is a small act of generosity — somebody stopped work to
 * tell the rest of the company something. Saying so, by name, and showing what
 * it just moved, is the cheapest thing in this whole application and probably
 * the one that decides whether the second note ever gets recorded.
 *
 * The days figure is the point. "Thank you" alone is manners; "thank you, and
 * this job is eleven days overdue" is manners plus a reason to have bothered.
 *
 * The photograph is picked at random from public/coach so it is not the same
 * face every time, and hides itself if that number is not there — no manifest
 * to keep in step with the folder.
 */
function ThankYou({
  who, tdd, job, onClose,
}: { who: string; tdd: string | null; job: string; onClose: () => void }) {
  const COACH_MAX = 12;
  const [pic, setPic] = useState(() => 1 + Math.floor(Math.random() * COACH_MAX));
  const [ext, setExt] = useState("jpg");
  const [hide, setHide] = useState(false);

  // Closes itself: this is a thank-you, not a dialogue.
  useEffect(() => {
    const t = setTimeout(onClose, 7000);
    return () => clearTimeout(t);
  }, [onClose]);

  const days = tdd ? diffDays(TODAY, tdd) : null;
  const overdue = days != null && days < 0;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ background: "rgba(13,22,31,.55)", zIndex: 70 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="rounded-lg"
        style={{ background: "#fff", maxWidth: 470, width: "100%", overflow: "hidden", boxShadow: "0 24px 60px rgba(0,0,0,.35)" }}
      >
        <div style={{ background: "#16232F", padding: "16px 18px", display: "flex", gap: 14, alignItems: "center" }}>
          {!hide && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/coach/${pic}.${ext}`}
              alt=""
              onError={() => {
                // try png for the same number, then give up quietly
                if (ext === "jpg") setExt("png");
                else if (pic !== 1) { setPic(1); setExt("jpg"); }
                else setHide(true);
              }}
              style={{ width: 54, height: 54, borderRadius: "50%", objectFit: "cover", border: "2px solid #F5B32B", flexShrink: 0 }}
            />
          )}
          <div style={{ color: "#fff" }}>
            <div style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.2 }}>Thank you {who}!</div>
            <div style={{ fontSize: 12, color: "#8FA1B3" }}>your update is on JOB {job}</div>
          </div>
        </div>

        <div style={{ padding: "16px 18px" }}>
          <p style={{ margin: 0, fontSize: 14.5, color: "#22303C", lineHeight: 1.6 }}>
            This update will help move this job.
          </p>
          {tdd ? (
            <p style={{ margin: "8px 0 0", fontSize: 14.5, color: "#22303C", lineHeight: 1.6 }}>
              Target delivery is <b>{fmtFull(tdd)}</b>
              {days === 0 ? (
                <> — <b style={{ color: "#D97706" }}>that is today</b>.</>
              ) : overdue ? (
                <> — <b style={{ color: "#B3261E" }}>{Math.abs(days as number)} days overdue!</b></>
              ) : (
                <> — <b style={{ color: "#0D7A3F" }}>{days} days away</b>.</>
              )}
            </p>
          ) : (
            <p style={{ margin: "8px 0 0", fontSize: 13, color: "#8A94A0" }}>
              This job carries no target delivery date yet.
            </p>
          )}
          <button
            onClick={onClose}
            className="rounded px-4 py-1.5 text-sm font-bold text-white"
            style={{ background: "#E8600A", marginTop: 14 }}
          >
            Back to it
          </button>
        </div>
      </div>
    </div>
  );
}
