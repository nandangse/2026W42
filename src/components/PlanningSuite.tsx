"use client";
import Backups from "./planning/Backups";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { swallow } from "@/lib/swallow";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import dynamic from "next/dynamic";
/** What a tab shows in the moment its code arrives (Genie 5.0.1.1: one file per tab, fetched when opened). */
const TabLoading = () => <div className="text-sm p-6" style={{ color: "var(--muted)" }}>Opening…</div>;

import { supabaseBrowser } from "@/lib/supabase/browser";
import GenieShell from "@/components/GenieShell";
import PlaybookScreen from "@/components/Playbook";
import { LOGO } from "@/lib/logo";

import { APP_VERSION } from "@/lib/version";

import JobCommercials from "./JobCommercials";

import { today, lakh, jobNo, initials } from "@/lib/schedule";
import { isStratcom } from "@/lib/groups";

import QuoteOfDay from "./QuoteOfDay";
import GoalsWorkspace from "./GoalsWorkspace";
import DeliveredJobs from "./DeliveredJobs";
import MorningUpload from "./MorningUpload";

import LMS from "./LMS";
import MonthQuarterPlan from "./MonthQuarterPlan";
import ErpProjects from "./ErpProjects";

import { AdminUser, Board, ErpLogEntry, setHideMoney, Role, TODAY, Task, UPLOADER_EMAIL, assignees, erpJobLink, mayDragTdd, stamp, taskJobRef } from "./planning/shared";
const MyWeek = dynamic(() => import("./planning/MyWeek").then((m) => m.MyWeek), { loading: () => <TabLoading /> });
const DeliveryBoard = dynamic(() => import("./planning/DeliveryBoard").then((m) => m.DeliveryBoard), { loading: () => <TabLoading /> });
const JobsInProgressTab = dynamic(() => import("./planning/InProgress").then((m) => m.JobsInProgressTab), { loading: () => <TabLoading /> });
const LiveProjects = dynamic(() => import("./planning/LiveProjects").then((m) => m.LiveProjects), { loading: () => <TabLoading /> });
const FeatureRequests = dynamic(() => import("./planning/Feature").then((m) => m.FeatureRequests), { loading: () => <TabLoading /> });
const OnFloor = dynamic(() => import("./planning/OnFloor").then((m) => m.OnFloor), { loading: () => <TabLoading /> });
const PendingMaterial = dynamic(() => import("./planning/Material").then((m) => m.PendingMaterial), { loading: () => <TabLoading /> });
const Escalations = dynamic(() => import("./planning/Material").then((m) => m.Escalations), { loading: () => <TabLoading /> });
const LoadBoard = dynamic(() => import("./planning/LoadBoard").then((m) => m.LoadBoard), { loading: () => <TabLoading /> });
const JobPlan = dynamic(() => import("./planning/JobPlan").then((m) => m.JobPlan), { loading: () => <TabLoading /> });
import { UpdateToErp } from "./planning/Admin";
import { ERP_HANDS } from "@/lib/erp-hands";
const Admin = dynamic(() => import("./planning/Admin").then((m) => m.Admin), { loading: () => <TabLoading /> });
const ConsultRaghu = dynamic(() => import("./planning/Consult").then((m) => m.ConsultRaghu), { loading: () => <TabLoading /> });
const Principles = dynamic(() => import("./planning/Consult").then((m) => m.Principles), { loading: () => <TabLoading /> });
import ManpowerPlan from "./planning/ManpowerPlan";
import { TaskModal } from "./planning/Tasking";
const Tasking = dynamic(() => import("./planning/Tasking").then((m) => m.Tasking), { loading: () => <TabLoading /> });
import { ChangePasswordModal, ProfileModal } from "./planning/Profile";

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
  saamaan = false,
}: {
  email: string;
  role: Role;
  saamaan?: boolean;
  initials: string | null;
  displayName: string | null;
  erpOwner: string | null;
  isRaghu: boolean;
  lc: boolean;
  stratcom: boolean;
  management: boolean;
}) {
  const router = useRouter();
  const RAGHU_EMAIL_LC = "raghu@nandan.co.in";
  const isAdmin = role === "admin";
  /**
   * Which room this person is in. Not a role — see src/lib/groups.ts.
   * The owner is in all three without anything being stored against him.
   */
  const groups = { lc, stratcom, management, isRaghu };
  // Delivered Jobs narrowed to STRATCOM (Dr Raghu, 30 Aug 2026)
  const canSeeDelivered = isStratcom(groups);
  const canSeeForward = isStratcom(groups);
  const canEdit = role === "admin" || role === "planner" || role === "project_owner";
  /* MATERIAL DATES AND REMARKS open to Saamaan members too (Dr Raghu, 3 Oct
     2026) — the store and purchase hands know when the material is coming.
     Adding and removing lines stays with the planners (canEdit). */
  const canFillMaterial = canEdit || saamaan;
  // Upload lives in the account menu now — admins and Shweta only.
  const canUpload = isAdmin || email.toLowerCase() === UPLOADER_EMAIL;
  /* Synchronize to ERP is the hands that actually do it — and not every
     admin. Dr Raghu, 8 Sep 2026: "which only pankaj and me can see"; then
     16 Sep 2026: "make this available to pankaj, mukesh and me". Named
     rather than roled, because it is three people and not a tier. */
  /* The same three hands as the route behind the button and as Saamaan's
     pull — lib/erp-hands, plus the uploader who brings the morning files. */
  const SYNC_HANDS = new Set([...ERP_HANDS, UPLOADER_EMAIL]);
  const canSync = SYNC_HANDS.has(email.toLowerCase());
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
  // The screen survives a reload: workspace and tab are remembered locally,
  // so Reload (and the browser's own refresh) come back HERE, not to the
  // front door (Dr Raghu, 28 Aug 2026).
  const [workspace, setWorkspace] = useState<"lms" | "suite" | "delivered" | "goals" | "tasking" | "sales" | "consult" | "principles">(() => {
    if (typeof window === "undefined") return "suite";
    try {
      const v = localStorage.getItem("genie.workspace");
      if (v && ["lms", "suite", "delivered", "goals", "tasking", "sales", "consult", "principles"].includes(v))
        return v as "suite";
    } catch (e) { swallow("PlanningSuite", e); /* fine */ }
    return "suite";
  });
  // Sales-team members' home is the CRM now — Sales Genie's panes moved there.
  /* PROFILE FROM ANOTHER APP (Dr Raghu, 8 Sep 2026: "show profile and admin
     also on every app"). Admin is a tab and ?tab=admin already reached it;
     Profile is a lightbox, so it needs its own word. The parameter is taken
     off the address afterwards, or a reload would keep reopening it. */
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      if (p.get("go") === "profile") {
        setProfileOpen(true);
        p.delete("go");
        const q = p.toString();
        window.history.replaceState({}, "", `${window.location.pathname}${q ? `?${q}` : ""}`);
      }
    } catch (e) { swallow("PlanningSuite profile link", e); }
  }, []);

  useEffect(() => {
    if (role === "sales") window.location.replace("/crm");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Back/forward can restore a workspace this account cannot open -- the tab
  // is hidden, but the history entry outlives the permission. Bounce rather
  // than render an empty board.
  useEffect(() => {
    if (workspace === "delivered" && !canSeeDelivered) setWorkspace("suite");
  }, [workspace, canSeeDelivered]);

  // land on "My Week" within the suite, not the delivery board
  const [tab, setTab] = useState<"home" | "wip" | "liveproj" | "delivery" | "load" | "plan" | "mplan" | "manpower" | "projects" | "jobcomm" | "floor" | "material" | "esc" | "erp" | "upload" | "admin" | "feature" | "opsbook" | "backups">(() => {
    if (typeof window === "undefined") return "home";
    /**
     * A LINK MAY NAME THE TAB. The back-arrow on a project page says
     * "the project book", and it landed on Home instead -- the tab was
     * restored from localStorage and nothing looked at the URL. Two of the
     * tabs were also missing from the list of what may be restored, so
     * Projects and the Month & Qtr Plan never came back at all: you were sent
     * Home every time, from wherever you had been.
     */
    const OK = ["home", "wip", "liveproj", "delivery", "load", "plan", "mplan",
      "projects", "jobcomm", "floor", "material", "esc", "manpower", "erp", "upload", "admin", "feature", "opsbook", "backups"];
    try {
      const asked = new URLSearchParams(window.location.search).get("tab");
      if (asked && OK.includes(asked)) return asked as "home";
      const v = localStorage.getItem("genie.tab");
      if (v && OK.includes(v)) return v as "home";
    } catch (e) { swallow("PlanningSuite", e); /* fine */ }
    return "home";
  });
  useEffect(() => {
    try {
      localStorage.setItem("genie.workspace", workspace);
      localStorage.setItem("genie.tab", tab);
    } catch (e) { swallow("PlanningSuite", e); /* fine */ }
  }, [workspace, tab]);

  /**
   * WHO MAY SEE JOB COMMERCIALS (Dr Raghu, 8 Sep 2026: "this should be with
   * stratcom access to edit and view").
   *
   * THIS LIVES UP HERE FOR A REASON, and 5.0.33.1 is the reason. The effect
   * below was first written next to the tab list, three hundred lines down —
   * which is BELOW this component's early return for a board that has not
   * loaded yet. So the first render ran one hook fewer than the second, and
   * React threw #310 across the whole Planning Suite the moment the board
   * arrived. A hook must be reached on every render or on none; "next to the
   * code it concerns" is not a thing React lets you have.
   */
  const mayCommercials = stratcom || isRaghu;
  useEffect(() => {
    if (tab === "jobcomm" && !mayCommercials) setTab("floor");
  }, [tab, mayCommercials]);

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
    try { await api.post("/api/notifications", { action: "read_all" }); loadNotifs(); } catch (e) { swallow("PlanningSuite", e); /* bell is best-effort */ }
  };
  const markRead = async (id: string) => {
    try { await api.post("/api/notifications", { action: "read", ids: [id] }); loadNotifs(); } catch (e) { swallow("PlanningSuite", e); /* ditto */ }
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
    } catch (e) { swallow("PlanningSuite", e); /* fall through to the honest answer */ }
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
  // who may change users on the Users app — the server's word (Raghu and Vishwas)
  const [usersMeta, setUsersMeta] = useState<{ mayEdit: boolean; editors: string[] }>({ mayEdit: false, editors: [] });
  const loadUsers = useCallback(async () => {
    try {
      const r = await api.get("/api/admin/users");
      setUsers(r.users || []);
      setDepartments(r.departments || []);
      setUsersMeta({ mayEdit: !!r.mayEdit, editors: (r.editors || []).map((e: string) => String(e).toLowerCase()) });
    } catch {
      setUsers([]);
    }
  }, []);
  // prefetch for admins so the tab is already populated when first opened
  useEffect(() => {
    if (isAdmin) loadUsers();
  }, [isAdmin, loadUsers]);

  /**
   * ONE FETCH AT A TIME (Genie 5.0.0.2). Thirty-nine places call reload()
   * after a save, and a burst of saves used to mean a burst of whole-board
   * fetches racing each other, the last to land winning. Now a reload in
   * flight is shared: callers that ask while it runs get the same promise,
   * and a call that lands during a fetch schedules exactly one more so the
   * board still ends on the latest state.
   */
  const inFlight = useRef<Promise<Board | null> | null>(null);
  const again = useRef(false);
  const reload = async (): Promise<Board | null> => {
    if (inFlight.current) { again.current = true; return inFlight.current; }
    const run = async (): Promise<Board | null> => {
      try {
        const b = (await api.board()) as Board;
        setBoard(b);
        setErr("");
        return b;
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
        return null;
      } finally {
        inFlight.current = null;
        if (again.current) { again.current = false; void reload(); }
      }
    };
    inFlight.current = run();
    return inFlight.current;
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
  setHideMoney(!(mayValue && showVal));
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
        time: new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" }),
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
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: "var(--navy)" }}>
        <div className="rounded bg-white px-3 py-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO} alt="Nandan GSE" style={{ height: 40 }} />
        </div>
        {err ? (
          <>
            <div className="text-sm font-bold" style={{ color: "var(--red)" }}>{err}</div>
            <button onClick={() => reload()} className="text-xs font-bold rounded px-3 py-1.5" style={{ background: "var(--accent)", color: "#fff" }}>↻ Retry</button>
          </>
        ) : (
          <>
            <div className="animate-spin rounded-full" style={{ width: 36, height: 36, border: "3px solid #22303C", borderTopColor: "var(--accent)" }} />
            <div className="text-sm font-semibold" style={{ color: "var(--amber)" }}>Loading the works planning boards…</div>
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
    // Sales Genie folded into the CRM (28 Aug 2026): its two panes live at
    // /crm → Sales Plan now, and the workspace icon is gone. One door.
    // Learning sits last: it is the section somebody goes to deliberately,
    // not one they pass through on the way to the day's work.
    ["lms", "📚 LMS"],
    // Ask, and read. One is a question about today's board; the other is how
    // the answers are meant to be reached in the first place.
    ["consult", "🧭 Consult Dr Raghu"],
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
    /* Dr Raghu, 28 Sep 2026: "in the Planning add a new module called
       Manpower Planning." Beside On Floor and Escalations, because it is a
       screen the production side opens every morning, not a report. */
    ["manpower", "Manpower Planning"],
    ["load", "Load Board"],
    ["plan", "Job Plan"],
    ["mplan", "Month & Qtr Plan"],
    ["projects", "Projects"],
  ];
  /**
   * JOB COMMERCIALS IS STRATCOM'S (Dr Raghu, 8 Sep 2026: "this should be with
   * stratcom access to edit and view"). The tab is not merely disabled for
   * everyone else — it is not in their list at all, because a greyed tab
   * still tells a man what he is not allowed to see, and the page it guards
   * is the order book's cash position.
   */
  if (mayCommercials) SUITE_TAB_DEFS.push(["jobcomm", "Job Commercials"]);

  return (
    <div className="min-h-screen" style={{ background: "var(--paper)", color: "var(--ink)" }}>
      {/* ===== frozen header ===== */}
      <div
        ref={hdrRef}
        className="pb-2"
        style={{ background: "var(--navy)", position: "sticky", top: 0, zIndex: 45 }}
      >
        <GenieShell module="main" title="Nandan Genie" tagline={appSettings.theme_name} user={{ email, displayName, initials, role }}
          onNotif={(n) => openNotif(n as unknown as Parameters<typeof openNotif>[0])}
          tools={
            <>
              {role === "viewer" && (
                <span className="genie-tagline text-xs rounded px-2 font-bold" style={{ height: 32, lineHeight: "30px", background: "#0D161F", color: "#8FA1B3", border: "1px solid #22303C" }} title="Your account is read-only">👁 Read-only</span>
              )}
              {/* THE FILE CLOCK IS GONE (Dr Raghu, 29 Sep 2026: "remove this
                  date"). It said when the Jobmaster EXPORT was last loaded —
                  a fact that stopped moving the day the hourly ERP sync took
                  over from the upload, so it had sat on "31 Aug" for a month
                  beside a board refreshed at five past every hour. A stale
                  clock on a live page is worse than no clock: it answers the
                  question "how old is this?" with the wrong number. */}
              <button onClick={() => setQuoteTrigger((n) => n + 1)} className="text-xs rounded px-2 font-bold" style={{ height: 32, background: "#0D161F", color: "var(--amber)", border: "1px solid #22303C" }} title="Show today's quote">☀</button>
              {mayValue && (
                <select value={showVal ? "with" : "without"} onChange={(e) => setShowVal(e.target.value === "with")} className="text-xs rounded px-1 font-semibold" style={{ height: 32, background: "#0D161F", color: "var(--amber)", border: "1px solid #22303C" }}>
                  <option value="with">With value ₹</option>
                  <option value="without">Without value</option>
                </select>
              )}
            </>
          }
          menu={(close) => (
            <>
              {/* ONE DOOR FOR THE ERP (Dr Raghu, 8 Sep 2026: "Update to ERP —
                  change it to Synchronize to ERP; merge the update to ERP as
                  well as Upload files which only pankaj and me can see").
                  They were two entries doing one job — the morning files come
                  in, the changed rows go back — and between them they showed
                  a queue count and a file count that meant nothing apart.
                  Now one entry, named for what it is, and only for the two
                  hands that do it. */}
              {/* THE FILE COUNT IS GONE (Dr Raghu, 16 Sep 2026: "remove the
                  file 0/3!!!"). It counted the morning's three spreadsheets,
                  which is a habit from before the ERP was read on the hour —
                  it sat there in orange saying 0/3 every day as if something
                  were missing when nothing was. What is worth showing is
                  work actually waiting: rows queued to go back out. */}
              {canSync && (
                <button onClick={() => { close(); setWorkspace("suite"); setTab("erp"); }}
                  className="w-full text-left px-3 py-2 text-sm font-semibold hover:bg-gray-50"
                  style={{ color: queued ? "var(--accent)" : "var(--navy)", fontWeight: queued ? 700 : 600 }}
                  title="What comes down from the ERP every hour, and the changed rows going back out">
                  ⇅ Synchronize to ERP{queued ? ` · ${queued} waiting` : ""}
                </button>
              )}
              <button onClick={() => { close(); setWorkspace("suite"); setTab("feature"); }} className="w-full text-left px-3 py-2 text-sm font-semibold hover:bg-gray-50" style={{ color: "var(--navy)" }} title="Ask for something in Genie">💡 Feature Request</button>
              {isAdmin && <button onClick={() => { close(); setWorkspace("suite"); setTab("admin"); }} className="w-full text-left px-3 py-2 text-sm font-semibold hover:bg-gray-50" style={{ color: "var(--navy)" }}>⚙ Admin</button>}
              {/* HIS ALONE (Dr Raghu, 17 Sep 2026: "ONLY raghu"). A backup
                  carries every row of every table out of the building —
                  that is not an admin permission. */}
              {email.toLowerCase() === RAGHU_EMAIL_LC && (
                <button onClick={() => { close(); setWorkspace("suite"); setTab("backups"); }}
                  className="w-full text-left px-3 py-2 text-sm font-semibold hover:bg-gray-50" style={{ color: "var(--navy)" }}
                  title="The code and the data, zipped into your own Drive — and what every run weighed">
                  💾 Backups
                </button>
              )}
              <button onClick={() => { close(); setProfileOpen(true); }} className="w-full text-left px-3 py-2 text-sm font-semibold hover:bg-gray-50" style={{ color: "var(--navy)" }}>👤 Profile{!initials && <span style={{ color: "var(--red)" }}> · no initials set</span>}</button>
              <button onClick={() => { close(); setPwOpen(true); }} className="w-full text-left px-3 py-2 text-sm font-semibold hover:bg-gray-50" style={{ color: "var(--navy)" }}>🔑 Change Password</button>
            </>
          )}
        />

        {/* Workspace row always occupies its own line, at every width, so the
            header never reflows between one and two lines. On narrow screens
            it scrolls sideways rather than wrapping, keeping the header
            height fixed within a workspace. */}
        <div
          className="flex gap-1 rounded p-1 mt-2 mx-3"
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
              // the LMS lives at its own URL now (Dr Raghu, 29 Aug 2026) —
              // /lms, /lms/<code>, /lms/<book-slug> — so the nav walks there
              onClick={() => { if (k === "lms") { window.location.href = "/lms"; return; } setWorkspace(k); if (k === "suite" && tab === "home") setTab("wip"); }}
              className="px-3 py-1.5 rounded text-sm font-semibold whitespace-nowrap flex-shrink-0"
              style={workspace === k ? { background: "var(--accent)", color: "#fff" } : { color: "#8FA1B3" }}
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
          {/* CRM — same shape as HRMS: its own page, its own gate at /crm. */}
          {salesAccess && (
            <a
              href="/crm"
              className="px-3 py-1.5 rounded text-sm font-semibold whitespace-nowrap flex-shrink-0"
              style={{ color: "#8FA1B3" }}
              title="CRM — companies, contacts, opportunities, quotations. Opens its own page."
            >
              🤝 CRM
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
                  style={tab === k ? { background: "var(--blue)", color: "#fff" } : { color: "#5C6B7A" }}
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

      <QuoteOfDay trigger={quoteTrigger} board={board} me={me} />

      {workspace === "suite" && tab === "home" && <MyWeek board={board} me={me} V={V} onOpen={openJobPlan} reload={reload} goTasks={() => setWorkspace("tasking")} goGoals={() => setWorkspace("goals")} goalsAccess={!!goalsAccess} goLms={() => setWorkspace("lms")} isAdmin={isAdmin} isStrat={canSeeForward} />}
      {/* Kept MOUNTED and merely hidden, so its filters, search, sort and view
          survive a round-trip through Job Plan — unmounting was wiping them. */}
      <div style={{ display: workspace === "suite" && tab === "delivery" ? undefined : "none" }}>
        <DeliveryBoard canDragTdd={mayDragTdd(me.email)} showForward={canSeeForward} canFloor={canSeeForward || role === "planner" || role === "admin"} board={board} V={V} onOpen={openJobPlan} reload={reload} pushERP={pushERP} />
      </div>
      {workspace === "suite" && tab === "wip" && <JobsInProgressTab board={board} V={V} onOpen={openJobPlan} canEdit={canEdit} reload={reload} />}
      {workspace === "suite" && tab === "liveproj" && <LiveProjects board={board} V={V} canEdit={canEdit} reload={reload} />}
      {workspace === "suite" && tab === "feature" && <FeatureRequests isOwner={isRaghu} />}
      {workspace === "suite" && tab === "opsbook" && (
        <div className="p-5"><PlaybookScreen kind="operations" email={me?.email || undefined} /></div>
      )}
      {workspace === "suite" && tab === "floor" && <OnFloor board={board} V={V} onOpen={openJobPlan} reload={reload} canEdit={canEdit} canTask={role !== "viewer"} isStrat={canSeeForward} myName={(displayName || email.split("@")[0]).split(" ")[0]} />}
      {workspace === "suite" && tab === "material" && <PendingMaterial board={board} onOpen={openJobPlan} reload={reload} canEdit={canFillMaterial} canAdd={canEdit} />}
      {workspace === "suite" && tab === "manpower" && (
        <ManpowerPlan board={board} canEdit={canEdit}
          onOpenJob={(j) => openJobPlan(j.id)} />
      )}
      {workspace === "suite" && tab === "esc" && <Escalations board={board} V={V} onOpen={openJobPlan} reload={reload} isAdmin={isAdmin} />}
      {workspace === "suite" && tab === "load" && <LoadBoard board={board} byTDD={byTDD} />}
      {workspace === "suite" && tab === "mplan" && <MonthQuarterPlan V={V} />}
      {workspace === "suite" && tab === "projects" && <ErpProjects />}
      {/*
        JOB COMMERCIALS (Dr Raghu, 2 Sep 2026) — after Projects, as asked.
        The cash the order book should throw off, month by month, for the
        13-week plan. Editing is planning's and the owners', because these
        are terms, not observations.
      */}
      {workspace === "suite" && tab === "jobcomm" && mayCommercials && (
        <JobCommercials
          jobs={byTDD}
          canEdit={canEdit}
          stratcom={stratcom || isRaghu}
          reload={reload}
          today={TODAY}
        />
      )}
      {workspace === "suite" && tab === "plan" && <JobPlan isAdmin={isAdmin} board={board} activeId={activeId} setActiveId={setActiveId} V={V} reload={reload} isRaghu={isRaghu} canEdit={canEdit} pushERP={pushERP} />}
      {workspace === "suite" && tab === "erp" && <UpdateToErp erpLog={erpLog} canPush={role === "admin" || role === "planner"} />}
      {workspace === "suite" && tab === "backups" && email.toLowerCase() === RAGHU_EMAIL_LC && <Backups />}
      {workspace === "suite" && tab === "upload" && canUpload && <MorningUpload email={email} embedded />}
      {workspace === "suite" && tab === "admin" && isAdmin && <Admin board={board} reload={reload} users={users} loadUsers={loadUsers} departments={departments} isOwner={isRaghu} meEmail={me.email} usersMeta={usersMeta} appSettings={appSettings} loadAppSettings={loadAppSettings} />}
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
          jobRef={taskJobRef(board, notifTask)}
          onOpenJob={(id) => { setNotifTask(null); openJobPlan(id); }}
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
            <div className="text-xs" style={{ color: "var(--dim)", lineHeight: 1.6 }}>
              <b>{notifGone}</b> — the task it points at has been deleted, or it came from the ERP ToDo
              list and was closed there. The notification stays so you know it happened.
            </div>
            <button onClick={() => setNotifGone(null)} className="mt-3 rounded px-3 py-1.5 text-xs font-bold text-white" style={{ background: "var(--ink)" }}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}