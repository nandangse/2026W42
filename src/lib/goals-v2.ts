// The Goals section — domain types, the visibility rule, and the completion
// mathematics.
//
// Two ideas carry the whole module:
//
//   1. ONE goal table, six views. Company goals, quarterly rocks, departmental
//      goals and personal goals are the same record with a different `scope`.
//      Sub-goals and initiatives are the same record with a different `kind`,
//      hanging off a parent. That is what makes the tree cascade to any depth
//      without a new table per level.
//
//   2. THE NUMBERS DECIDE THE PERCENTAGE. Start metric, current metric and
//      goal metric are not decoration — where all three are present the
//      completion is computed from them and cannot be typed over. See
//      `completionOf` for the full precedence.

export type Scope = "company" | "rock" | "department" | "personal";
export type Kind = "goal" | "subgoal" | "initiative";
export type GoalStatus = "not_started" | "on_track" | "at_risk" | "blocked" | "done";
export type AssigneeType = "person" | "department";

/**
 * The tabs, in the order they cascade below the Goals header: from what the
 * company is trying to do, down to what lands on you, then out to the people
 * under you.
 *
 * The last two appear only for someone with a team — see hasTeam() in
 * src/lib/team.ts. A "Team Goals" tab on an account with no reports is an
 * empty page that reads as a fault.
 */
export const TABS = [
  { key: "company", label: "Company Goals", icon: "🏛" },
  { key: "rocks", label: "Quarterly Rocks", icon: "🪨" },
  { key: "department", label: "Departmental Goals", icon: "🏢" },
  { key: "mine", label: "My Goals", icon: "🎯" },
  { key: "kra", label: "My Key Result Areas", icon: "🗝" },
  { key: "kpi", label: "KPIs Relevant to me", icon: "📈" },
  { key: "idp", label: "My IDP", icon: "🌱" },
  { key: "team", label: "Team Goals", icon: "👥" },
  { key: "teamkpi", label: "Team KPIs", icon: "📊" },
] as const;
export type TabKey = (typeof TABS)[number]["key"];

/** Hidden from anyone with nobody reporting up to them. */
export const TEAM_TABS: TabKey[] = ["team", "teamkpi"];

export const SCOPE_LABEL: Record<Scope, string> = {
  company: "Company goal",
  rock: "Rock goal",
  department: "Departmental goal",
  personal: "Personal goal",
};

export const KIND_LABEL: Record<Kind, string> = {
  goal: "Goal",
  subgoal: "Sub goal",
  initiative: "Initiative",
};

/**
 * What "+ Add" offers below a node. A goal and a sub-goal both branch into
 * further sub-goals or initiatives; an initiative branches into initiatives.
 * Depth is unlimited on purpose — the tree is what the cascade is for.
 */
export const CHILD_KINDS: Record<Kind, Kind[]> = {
  goal: ["subgoal", "initiative"],
  subgoal: ["subgoal", "initiative"],
  initiative: ["initiative"],
};

export const STATUS_META: Record<GoalStatus, { label: string; color: string; bg: string }> = {
  not_started: { label: "Not started", color: "#8A94A0", bg: "#F4F2EC" },
  on_track: { label: "On track", color: "#0D7A3F", bg: "#E6F4EA" },
  at_risk: { label: "At risk", color: "#D97706", bg: "#FFF7E6" },
  blocked: { label: "Blocked", color: "#B3261E", bg: "#FBEDEA" },
  done: { label: "Done", color: "#0D7A3F", bg: "#E6F4EA" },
};

export const STATUS_ORDER: GoalStatus[] = ["not_started", "on_track", "at_risk", "blocked", "done"];

export const QUARTERS = ["Q1", "Q2", "Q3", "Q4"] as const;

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------
export interface Band {
  code: string;
  label: string;
  note: string | null;
}

/** A goal category — the swimlanes table, managed from Admin since 0010. */
export interface Swimlane {
  id: string;
  name: string;
  color: string;
  sort_order: number;
}

export interface Department {
  id: string;
  name: string;
  code: string | null;
  color: string;
  head_person_id: string | null;
  sort_order: number;
}

export interface Person {
  id: string;
  email: string;
  initials: string | null;
  name: string | null;
  department_id: string | null;
  /** Their manager. The whole org chart is this one column — see src/lib/team.ts. */
  reports_to: string | null;
  designation: string | null;
  bands: string[];
}

export interface GoalItem {
  id: string;
  scope: Scope;
  kind: Kind;
  parent_id: string | null;
  root_id: string | null;
  rock_id: string | null;
  kra_id: string | null;
  kpi_id: string | null;
  /**
   * Goal Category. Points at the swimlanes list Admin already manages, so the
   * categories a goal can carry and the lanes a board groups by are ONE list
   * rather than two that drift. Free text would have become fifteen spellings
   * of "Operations" inside a month.
   */
  swimlane_id: string | null;

  title: string;
  detail: string;

  assignee_type: AssigneeType;
  assignee_id: string | null;
  dept_id: string | null;

  start_date: string | null;
  due_date: string | null;
  original_due: string | null;
  push_count: number;

  start_metric: number | null;
  current_metric: number | null;
  goal_metric: number | null;
  metric_unit: string;
  manual_pct: number;
  weight: number;

  status: GoalStatus;
  bands: string[];
  period: string;
  sort_order: number;

  /** Wired up on read — ordered child ids. */
  kids: string[];
  comments: number;
  /** Set when kpi_id resolves — the KPI's live reading feeds the numbers. */
  kpiName?: string | null;
}

export type ItemMap = Record<string, GoalItem>;

export interface Rock {
  id: string;
  name: string;
  detail: string;
  quarter: string;
  period: string;
  owner_id: string | null;
  dept_id: string | null;
  start_date: string | null;
  due_date: string | null;
  status: GoalStatus;
  bands: string[];
  color: string;
  sort_order: number;
}

export interface Kra {
  id: string;
  person_id: string;
  dept_id: string | null;
  title: string;
  detail: string;
  weight: number;
  sort_order: number;
  active: boolean;
}

export interface Kpi {
  id: string;
  name: string;
  detail: string;
  unit: string;
  owner_id: string | null;
  dept_id: string | null;
  start_value: number | null;
  current_value: number | null;
  target_value: number | null;
  metric_source: string | null;
  cadence: string;
  period: string;
  bands: string[];
  sort_order: number;
  active: boolean;
  watchers: string[];
  /** Filled in on read when metric_source resolved — where the number came from. */
  liveNote?: string | null;
  /** Why this KPI reaches the caller: "you own it", "your department", … */
  why?: string;
}

// ---------------------------------------------------------------------------
// Visibility — the Management / Stratcom / LC / All marking
// ---------------------------------------------------------------------------
/**
 * A row is visible when it is open to all, when the viewer sits in one of its
 * bands, when it is the viewer's own work, or when it belongs to somebody who
 * reports up to the viewer. Admins see everything: the bands hide work from the
 * wider company, not from the people running it.
 *
 * THE TEAM CLAUSE IS A DELIBERATE WIDENING (3.0.1.8). Until Team Goals existed,
 * a band-restricted goal on a direct report was invisible to their manager, and
 * a Team tab built on that rule would have shown a manager less than their team
 * actually holds — while looking complete. Silently under-showing is the one
 * failure this section cannot afford, so managing somebody now carries the
 * right to see what they are accountable for. It does not carry the right to
 * edit it: that is still editModeFor().
 *
 * `team` is the RECURSIVE cascade below the viewer, not their direct reports —
 * see teamOf() in src/lib/team.ts.
 *
 * Mirrors public.band_visible() in migration 0019. The API is the enforcing
 * copy — it reads with the service client — so if these two ever drift, this
 * one is what the app actually obeys.
 */
export function bandVisible(
  bands: string[] | null | undefined,
  viewer: { id: string; department_id: string | null; bands: string[]; isAdmin: boolean; team?: string[] },
  row: { assignee_id?: string | null; dept_id?: string | null; owner_id?: string | null; person_id?: string | null },
): boolean {
  if (viewer.isAdmin) return true;
  const b = bands && bands.length ? bands : ["all"];
  if (b.includes("all")) return true;
  if (b.some((x) => viewer.bands.includes(x))) return true;
  if (row.assignee_id && row.assignee_id === viewer.id) return true;
  if (row.owner_id && row.owner_id === viewer.id) return true;
  if (row.person_id && row.person_id === viewer.id) return true;
  if (row.dept_id && viewer.department_id && row.dept_id === viewer.department_id) return true;
  const team = viewer.team;
  if (team && team.length) {
    if (row.assignee_id && team.includes(row.assignee_id)) return true;
    if (row.owner_id && team.includes(row.owner_id)) return true;
    if (row.person_id && team.includes(row.person_id)) return true;
  }
  return false;
}

/**
 * Three levels, not two:
 *
 *   full     — define it: name, targets, dates, who it belongs to, what hangs
 *              under it
 *   progress — report on it: the current metric, the status, a comment. Nothing
 *              else moves.
 *   none     — read it
 *
 * Company goals are the admin's to SET, and only the admin's. But the person a
 * company goal lands on still has to be able to say where the number got to,
 * or the goal only ever moves when an admin sits down and types it — which is
 * how goal trees die. So an assignee gets `progress`, never `full`.
 *
 * The department-head case is decided server-side, where the head is known.
 */
export type EditMode = "full" | "progress" | "none";

export function editModeFor(
  item: Pick<GoalItem, "scope" | "assignee_id" | "dept_id">,
  viewer: { id: string; department_id: string | null; isAdmin: boolean; canEdit: boolean },
): EditMode {
  if (viewer.isAdmin) return "full";
  const isAssignee = !!item.assignee_id && item.assignee_id === viewer.id;
  if (item.scope === "company") return isAssignee ? "progress" : "none";
  if (viewer.canEdit) return "full";
  if (isAssignee) return "full";
  return "none";
}

/** Fields `progress` may write. Mirrored by the API — see /api/goals-v2. */
export const PROGRESS_FIELDS = ["current_metric", "status", "manual_pct"] as const;

// ---------------------------------------------------------------------------
// Completion — the numbers decide the percentage
// ---------------------------------------------------------------------------
const clamp = (n: number) => Math.max(0, Math.min(100, n));

export type CompletionModel = "metric" | "rolled" | "manual" | "done";

export interface Completion {
  pct: number;
  model: CompletionModel;
  /** The arithmetic, written out — shown in the completion panel. */
  formula: string;
  note: string;
  /** True when the goal is a reduction (goal metric below the start metric). */
  reducing: boolean;
}

/** Are all three numbers present and does the goal actually move? */
export function hasMetrics(n: Pick<GoalItem, "start_metric" | "current_metric" | "goal_metric">): boolean {
  return (
    n.start_metric != null &&
    n.current_metric != null &&
    n.goal_metric != null &&
    Number(n.goal_metric) !== Number(n.start_metric)
  );
}

/**
 * (current − start) ÷ (goal − start).
 *
 * One formula covers both directions. Raise on-time delivery 60 → 90 and being
 * at 75 reads 50%. Cut rework 100 → 50 and being at 75 also reads 50%, because
 * both differences are negative and the signs cancel. That is why there is no
 * "direction" field to get wrong.
 */
export function metricPct(start: number, current: number, goal: number): number {
  if (goal === start) return 0;
  return clamp(((current - start) / (goal - start)) * 100);
}

const num = (v: number | null | undefined) => (v == null ? 0 : Number(v));
const fmtNum = (v: number | null | undefined) =>
  v == null ? "—" : Number.isInteger(Number(v)) ? String(Number(v)) : String(Number(Number(v).toFixed(2)));

/**
 * A node's completion, in strict precedence:
 *
 *   1. done       → 100, whatever the numbers say
 *   2. METRICS    → computed from start/current/goal, even when the node has
 *                   children. The initiatives are how you move the number; the
 *                   number is the fact. Averaging the children instead would
 *                   let a goal read 60% while the thing it measures sits at 5%.
 *   3. children   → weight-weighted average of their completion
 *   4. otherwise  → the manually entered percentage
 */
export function completionOf(items: ItemMap, id: string, seen = new Set<string>()): Completion {
  const n = items[id];
  if (!n) return { pct: 0, model: "manual", formula: "", note: "", reducing: false };

  const reducing = hasMetrics(n) && num(n.goal_metric) < num(n.start_metric);

  if (n.status === "done")
    return { pct: 100, model: "done", formula: "Marked done", note: "Closed by hand, so it reads 100%.", reducing };

  // defensive: a cycle should be impossible, but never hang the page over it
  if (seen.has(id)) return { pct: 0, model: "manual", formula: "", note: "", reducing };
  seen.add(id);

  if (hasMetrics(n)) {
    const s = num(n.start_metric);
    const c = num(n.current_metric);
    const g = num(n.goal_metric);
    const pct = metricPct(s, c, g);
    const u = n.metric_unit ? ` ${n.metric_unit}` : "";
    return {
      pct,
      model: "metric",
      formula: `(${fmtNum(c)} − ${fmtNum(s)}) ÷ (${fmtNum(g)} − ${fmtNum(s)}) = ${Math.round(pct)}%`,
      note: reducing
        ? `A reduction goal — down from ${fmtNum(s)}${u} towards ${fmtNum(g)}${u}.`
        : `Up from ${fmtNum(s)}${u} towards ${fmtNum(g)}${u}.`,
      reducing,
    };
  }

  const kids = (n.kids || []).filter((k) => items[k]);
  if (kids.length) {
    let top = 0;
    let bottom = 0;
    for (const k of kids) {
      const w = Math.max(0, items[k].weight ?? 1);
      top += completionOf(items, k, seen).pct * w;
      bottom += w;
    }
    const pct = bottom > 0 ? clamp(top / bottom) : 0;
    const weighted = kids.some((k) => (items[k].weight ?? 1) !== 1);
    return {
      pct,
      model: "rolled",
      formula: `${weighted ? "Weighted average" : "Average"} of ${kids.length} item${kids.length === 1 ? "" : "s"} below = ${Math.round(pct)}%`,
      note: "No numbers on this one, so it reads whatever the items below it read. Move one and this moves.",
      reducing,
    };
  }

  const pct = clamp(Number(n.manual_pct) || 0);
  return {
    pct,
    model: "manual",
    formula: `${Math.round(pct)}% entered by hand`,
    note: "Give it a start, current and goal metric and this percentage starts computing itself.",
    reducing,
  };
}

/**
 * What the children roll up to, regardless of what the node itself reads.
 * The completion panel shows this ALONGSIDE a measured number so the gap
 * between "the work below is done" and "the number moved" is visible.
 */
export function rollupOf(items: ItemMap, id: string): number | null {
  const kids = (items[id]?.kids || []).filter((k) => items[k]);
  if (!kids.length) return null;
  let top = 0;
  let bottom = 0;
  for (const k of kids) {
    const w = Math.max(0, items[k].weight ?? 1);
    top += completionOf(items, k).pct * w;
    bottom += w;
  }
  return bottom > 0 ? clamp(top / bottom) : 0;
}

/** A KPI's own completion, on the same formula as a goal's. */
export function kpiPct(k: Kpi): number | null {
  if (k.start_value == null || k.current_value == null || k.target_value == null) return null;
  if (Number(k.target_value) === Number(k.start_value)) return null;
  return metricPct(Number(k.start_value), Number(k.current_value), Number(k.target_value));
}

// ---------------------------------------------------------------------------
// Tree helpers
// ---------------------------------------------------------------------------
export function descendants(items: ItemMap, id: string, out: string[] = []): string[] {
  for (const k of items[id]?.kids || []) {
    out.push(k);
    descendants(items, k, out);
  }
  return out;
}

/** Every id in a set of roots that has children — the "expand all" target. */
export function branchIds(items: ItemMap, roots: string[]): string[] {
  const out: string[] = [];
  const walk = (id: string) => {
    const kids = items[id]?.kids || [];
    if (kids.length) out.push(id);
    kids.forEach(walk);
  };
  roots.forEach(walk);
  return out;
}

export function countBelow(items: ItemMap, id: string): { subgoals: number; initiatives: number } {
  let subgoals = 0;
  let initiatives = 0;
  for (const d of descendants(items, id)) {
    if (items[d].kind === "subgoal") subgoals++;
    else if (items[d].kind === "initiative") initiatives++;
  }
  return { subgoals, initiatives };
}

/** Past its ORIGINAL promise — the only thing that earns red. */
export function isLate(n: Pick<GoalItem, "status" | "due_date" | "original_due">, today: string): boolean {
  if (n.status === "done") return false;
  const d = n.original_due || n.due_date;
  return !!d && d < today;
}

/** Whose name goes on it — a person's initials, or the department. */
export function assigneeLabel(
  n: Pick<GoalItem, "assignee_type" | "assignee_id" | "dept_id">,
  people: Map<string, Person>,
  depts: Map<string, Department>,
): string {
  if (n.assignee_type === "department")
    return n.dept_id ? depts.get(n.dept_id)?.name ?? "Unknown department" : "Unassigned";
  if (!n.assignee_id) return "Unassigned";
  const p = people.get(n.assignee_id);
  return p?.name || p?.initials || p?.email?.split("@")[0] || "Unknown";
}
