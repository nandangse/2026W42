// Assembles the whole goal tree in one payload, the same way buildBoard does
// for the planning side: a handful of parallel queries, joined in memory.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GoalNode, NodeMap } from "./goals";
import { resolveMetrics } from "./goal-metrics";

export interface GoalTree {
  nodes: NodeMap;
  goals: string[]; // the five, in goal_num order
  swimlanes: { id: string; name: string; color: string }[];
  units: { id: string; label: string }[];
  csfs: { id: string; label: string }[];
  goalCsf: Record<string, string[]>;
  opsp: { id: string; label: string; body: string }[];
  period: string;
  /** true when the caller may edit; false = read-only view of the tree */
  canEdit: boolean;
}

export async function buildGoalTree(
  db: SupabaseClient,
  opts: { period?: string; canEdit: boolean },
): Promise<GoalTree> {
  const period = opts.period || "FY2026-27";

  const [nodesRes, ownersRes, commentsRes, swimRes, unitRes, csfRes, linkRes, opspRes, peopleRes] =
    await Promise.all([
      db.from("goal_node").select("*").eq("period", period).order("sort_order"),
      db.from("goal_node_owner").select("node_id, person_id"),
      db.from("goal_node_comment").select("node_id"),
      db.from("swimlanes").select("id,name,color,sort_order").order("sort_order"),
      db.from("units").select("id,label,sort_order").order("sort_order"),
      db.from("csf").select("id,label").order("label"),
      db.from("goal_csf_link").select("goal_id,csf_id"),
      db.from("opsp_section").select("id,label,body,sort_order").eq("period", period).order("sort_order"),
      db.from("profiles").select("id,initials,display_name,email"),
    ]);

  const firstErr =
    nodesRes.error || ownersRes.error || commentsRes.error || swimRes.error ||
    unitRes.error || csfRes.error || linkRes.error || opspRes.error || peopleRes.error;
  if (firstErr) throw new Error(firstErr.message);

  const swimById = new Map((swimRes.data || []).map((s) => [s.id, s]));
  const unitById = new Map((unitRes.data || []).map((u) => [u.id, u]));
  const personById = new Map((peopleRes.data || []).map((p) => [p.id, p]));

  const ownersByNode = new Map<string, { ids: string[]; initials: string[] }>();
  for (const o of ownersRes.data || []) {
    const p = personById.get(o.person_id);
    const rec = ownersByNode.get(o.node_id) || { ids: [], initials: [] };
    rec.ids.push(o.person_id);
    rec.initials.push(p?.initials || p?.display_name || p?.email?.split("@")[0] || "??");
    ownersByNode.set(o.node_id, rec);
  }

  const commentCount = new Map<string, number>();
  for (const c of commentsRes.data || [])
    commentCount.set(c.node_id, (commentCount.get(c.node_id) || 0) + 1);

  // live readings for any node that declares a metric_source
  const metrics = await resolveMetrics(
    db,
    (nodesRes.data || []).map((n) => n.metric_source).filter(Boolean) as string[],
  );

  const nodes: NodeMap = {};
  for (const r of nodesRes.data || []) {
    const own = ownersByNode.get(r.id) || { ids: [], initials: [] };
    const m = r.metric_source ? metrics[r.metric_source] : undefined;
    nodes[r.id] = {
      id: r.id,
      node_type: r.node_type,
      parent_id: r.parent_id,
      goal_id: r.goal_id,
      sort_order: r.sort_order ?? 0,
      goal_num: r.goal_num,
      what: r.what || "",
      how: r.how || "",
      swimlane_id: r.swimlane_id,
      swimlane: r.swimlane_id ? swimById.get(r.swimlane_id)?.name ?? null : null,
      period: r.period,
      start_date: r.start_date,
      end_date: r.end_date,
      original_end: r.original_end,
      push_count: r.push_count ?? 0,
      carry_count: r.carry_count ?? 0,
      completion_pct: Number(r.completion_pct ?? 0),
      start_no: r.start_no == null ? null : Number(r.start_no),
      // a live metric wins over the stored value
      current_no: m ? m.current : r.current_no == null ? null : Number(r.current_no),
      target_no: r.target_no == null ? null : Number(r.target_no),
      unit_id: r.unit_id,
      unit: r.unit_id ? unitById.get(r.unit_id)?.label ?? null : null,
      weight: Number(r.weight ?? 1),
      metric_source: r.metric_source,
      metricNote: m?.note ?? null,
      status: r.status,
      unaligned: !!r.unaligned,
      owners: own.initials,
      ownerIds: own.ids,
      comments: commentCount.get(r.id) || 0,
      kids: [],
    };
  }

  // wire children in sort order
  for (const n of Object.values(nodes)) {
    if (n.parent_id && nodes[n.parent_id]) nodes[n.parent_id].kids.push(n.id);
  }
  for (const n of Object.values(nodes))
    n.kids.sort((a, b) => nodes[a].sort_order - nodes[b].sort_order);

  const goals = Object.values(nodes)
    .filter((n) => n.node_type === "goal")
    .sort((a, b) => (a.goal_num ?? 99) - (b.goal_num ?? 99))
    .map((n) => n.id);

  const goalCsf: Record<string, string[]> = {};
  for (const l of linkRes.data || []) (goalCsf[l.goal_id] ||= []).push(l.csf_id);

  return {
    nodes,
    goals,
    swimlanes: (swimRes.data || []).map((s) => ({ id: s.id, name: s.name, color: s.color })),
    units: (unitRes.data || []).map((u) => ({ id: u.id, label: u.label })),
    csfs: csfRes.data || [],
    goalCsf,
    opsp: (opspRes.data || []).map((o) => ({ id: o.id, label: o.label, body: o.body || "" })),
    period,
    canEdit: opts.canEdit,
  };
}
