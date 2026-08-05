// Goals layer — domain types and the progress mathematics.
// Roll-up is computed in TypeScript on read rather than in triggers: the tree is
// a few hundred nodes, and recursive triggers on every edit are a whole class of
// drift bugs we don't need.

export type NodeType = "goal" | "project" | "objective" | "key_result" | "tactic";
export type GoalStatus = "not_started" | "on_track" | "at_risk" | "blocked" | "done";

/** Child level for the "+ Add" affordance. Tactics nest into tactics (subtasks). */
export const CHILD_OF: Record<NodeType, NodeType> = {
  goal: "project",
  project: "objective",
  objective: "key_result",
  key_result: "tactic",
  tactic: "tactic",
};

export const LEVEL_LABEL: Record<NodeType, string> = {
  goal: "Goal",
  project: "Project",
  objective: "Objective",
  key_result: "Key result",
  tactic: "Tactic",
};

/** Column headings for the cascade, indexed by depth BELOW a goal. */
export const LEVEL_COLUMNS = ["Projects", "Objectives", "Key results", "Tactics", "Subtasks"];

/** Levels top-down — orders the swimlane board and its filter chips. */
export const LEVEL_ORDER: NodeType[] = ["goal", "project", "objective", "key_result", "tactic"];

/** Plural label per level, for the swimlane filter chips. */
export const LEVEL_PLURAL: Record<NodeType, string> = {
  goal: "Goals",
  project: "Projects",
  objective: "Objectives",
  key_result: "Key results",
  tactic: "Tactics",
};

export const STATUS_META: Record<GoalStatus, { label: string; color: string }> = {
  not_started: { label: "Not started", color: "#8A94A0" },
  on_track: { label: "On track", color: "#0D7A3F" },
  at_risk: { label: "At risk", color: "#D97706" },
  blocked: { label: "Blocked", color: "#B3261E" },
  done: { label: "Done", color: "#0D7A3F" },
};

export interface GoalNode {
  id: string;
  node_type: NodeType;
  parent_id: string | null;
  goal_id: string | null;
  sort_order: number;
  goal_num: number | null;

  what: string;
  how: string;

  swimlane_id: string | null;
  swimlane: string | null;
  period: string;
  start_date: string | null;
  end_date: string | null;
  original_end: string | null;
  push_count: number;
  carry_count: number;

  completion_pct: number;
  start_no: number | null;
  current_no: number | null;
  target_no: number | null;
  unit_id: string | null;
  unit: string | null;
  weight: number;
  metric_source: string | null;

  status: GoalStatus;
  unaligned: boolean;

  owners: string[];        // initials
  ownerIds: string[];
  comments: number;
  kids: string[];

  /** Set when metric_source resolved — shows where the number came from. */
  metricNote?: string | null;
}

export type NodeMap = Record<string, GoalNode>;

const clamp = (n: number) => Math.max(0, Math.min(100, n));

/** True when this node's number is measured from live data rather than reported. */
const isMeasured = (n: GoalNode) =>
  !!n.metric_source &&
  n.target_no != null &&
  n.start_no != null &&
  n.current_no != null &&
  n.target_no !== n.start_no;

/**
 * A node's completion:
 *   1. MEASURED  → a live-fed node uses its own reading, even when it has
 *      children. The tactics are how you move the number; the number itself is
 *      the fact. Averaging the tactics instead would let a key result read 48%
 *      while the thing it measures sits at 6%.
 *   2. children  → weighted average of their completion (roll-up)
 *   3. numbers   → (current − start) ÷ (target − start), never typed
 *   4. otherwise → the manually entered percentage
 * `done` always reads 100.
 */
export function progressOf(nodes: NodeMap, id: string, seen = new Set<string>()): number {
  const n = nodes[id];
  if (!n) return 0;
  if (n.status === "done") return 100;
  if (seen.has(id)) return 0; // defensive: a cycle should never happen, but never hang
  seen.add(id);

  if (isMeasured(n)) {
    return clamp(((n.current_no! - n.start_no!) / (n.target_no! - n.start_no!)) * 100);
  }

  const kids = (n.kids || []).filter((k) => nodes[k]);
  if (kids.length) {
    let num = 0;
    let den = 0;
    for (const k of kids) {
      const w = Math.max(0, nodes[k].weight ?? 1);
      num += progressOf(nodes, k, seen) * w;
      den += w;
    }
    return den > 0 ? clamp(num / den) : 0;
  }

  if (
    n.target_no != null &&
    n.start_no != null &&
    n.current_no != null &&
    n.target_no !== n.start_no
  ) {
    return clamp(((n.current_no - n.start_no) / (n.target_no - n.start_no)) * 100);
  }
  return clamp(Number(n.completion_pct) || 0);
}

/** How this node's percentage is arrived at — shown in the inspector. */
export function progressBasis(nodes: NodeMap, id: string): "measured" | "rolled" | "derived" | "manual" {
  const n = nodes[id];
  if (!n) return "manual";
  if (isMeasured(n)) return "measured";
  if ((n.kids || []).filter((k) => nodes[k]).length) return "rolled";
  if (n.target_no != null && n.start_no != null && n.target_no !== n.start_no) return "derived";
  return "manual";
}

export function descendants(nodes: NodeMap, id: string, out: string[] = []): string[] {
  for (const k of nodes[id]?.kids || []) {
    out.push(k);
    descendants(nodes, k, out);
  }
  return out;
}

/** Ordered children of a node. */
export const childrenOf = (nodes: NodeMap, id: string): string[] =>
  (nodes[id]?.kids || []).filter((k) => nodes[k]);

/** Past its ORIGINAL commitment — the only thing that earns red. */
export function isLate(n: GoalNode, today: string): boolean {
  if (n.status === "done") return false;
  const d = n.original_end || n.end_date;
  return !!d && d < today;
}

/** Days an item has been carried since it became live. */
export function carriedDays(n: GoalNode, today: string): number {
  if (!n.start_date) return 0;
  const ms = Date.parse(today + "T00:00:00Z") - Date.parse(n.start_date + "T00:00:00Z");
  return Math.max(0, Math.round(ms / 86400000));
}

/**
 * The To-Do rule: a node is live once its start date has arrived and it is not
 * closed. It keeps presenting as today's item — the original date is what
 * carries the memory of the commitment, not the display.
 */
export function isLive(n: GoalNode, today: string): boolean {
  if (n.status === "done") return false;
  if (n.node_type !== "tactic" && n.node_type !== "key_result") return false;
  return !!n.start_date && n.start_date <= today;
}
