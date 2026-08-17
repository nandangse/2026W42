// Assembles the whole Goals payload in one round of parallel queries, the way
// buildBoard does for the planning side.
//
// Reads use the SERVICE client and every visibility rule is applied here in
// TypeScript. RLS on these tables (migration 0019) is a backstop for a direct
// connection — doing the filtering here instead means the band rule lives in
// one readable place and can explain itself to the UI, rather than silently
// returning fewer rows.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  bandVisible,
  type Band, type Department, type GoalItem, type ItemMap, type Kpi, type Kra,
  type Person, type Rock,
} from "./goals-v2";
import { resolveMetrics, METRICS } from "./goal-metrics";

export const DEFAULT_PERIOD = "FY2026-27";

export interface Viewer {
  id: string;
  isAdmin: boolean;
  canEdit: boolean;
  department_id: string | null;
  bands: string[];
  initials: string | null;
  name: string | null;
}

export interface GoalsPayload {
  me: Viewer;
  bands: Band[];
  departments: Department[];
  people: Person[];
  rocks: Rock[];
  items: ItemMap;
  kras: Kra[];
  kpis: Kpi[];
  period: string;
  periods: string[];
  /** Live metric feeds a KPI can be wired to. */
  metrics: { key: string; label: string; unitHint: string; describe: string }[];
}

/** Postgres returns numerics as strings; normalise once, at the boundary. */
const n = (v: unknown): number | null => (v == null || v === "" ? null : Number(v));
const arr = (v: unknown): string[] => (Array.isArray(v) && v.length ? (v as string[]) : ["all"]);

export async function buildGoalsPayload(
  admin: SupabaseClient,
  opts: { viewerId: string; isAdmin: boolean; canEdit: boolean; period?: string },
): Promise<GoalsPayload> {
  const period = opts.period || DEFAULT_PERIOD;

  const [
    profRes, bandRes, personBandRes, deptRes, rockRes, itemRes, commentRes,
    kraRes, kpiRes, watcherRes, periodRes,
  ] = await Promise.all([
    admin.from("profiles").select("id,email,initials,display_name,department_id,disabled").order("display_name"),
    admin.from("goal_band").select("code,label,note,sort_order").order("sort_order"),
    admin.from("person_band").select("person_id,band"),
    admin.from("departments").select("id,name,code,color,head_person_id,sort_order,active").order("sort_order"),
    admin.from("rock_project").select("*").eq("period", period).order("quarter").order("sort_order"),
    admin.from("goal_item").select("*").eq("period", period).order("sort_order"),
    admin.from("goal_item_comment").select("item_id"),
    admin.from("kra").select("*").eq("active", true).order("sort_order"),
    admin.from("kpi").select("*").eq("period", period).eq("active", true).order("sort_order"),
    admin.from("kpi_watcher").select("kpi_id,person_id"),
    admin.from("goal_item").select("period"),
  ]);

  const firstErr =
    profRes.error || bandRes.error || personBandRes.error || deptRes.error || rockRes.error ||
    itemRes.error || commentRes.error || kraRes.error || kpiRes.error || watcherRes.error;
  if (firstErr) throw new Error(firstErr.message);

  // ---- people, with their band memberships ----
  const bandsByPerson = new Map<string, string[]>();
  for (const r of personBandRes.data || []) {
    const list = bandsByPerson.get(r.person_id) || [];
    list.push(r.band);
    bandsByPerson.set(r.person_id, list);
  }
  const people: Person[] = (profRes.data || [])
    .filter((p) => !p.disabled)
    .map((p) => ({
      id: p.id,
      email: p.email,
      initials: p.initials,
      name: p.display_name,
      department_id: p.department_id ?? null,
      bands: bandsByPerson.get(p.id) || [],
    }));

  const meRow = (profRes.data || []).find((p) => p.id === opts.viewerId);
  const me: Viewer = {
    id: opts.viewerId,
    isAdmin: opts.isAdmin,
    canEdit: opts.canEdit,
    department_id: meRow?.department_id ?? null,
    bands: bandsByPerson.get(opts.viewerId) || [],
    initials: meRow?.initials ?? null,
    name: meRow?.display_name ?? null,
  };

  const departments: Department[] = (deptRes.data || [])
    .filter((d) => d.active !== false)
    .map((d) => ({
      id: d.id, name: d.name, code: d.code, color: d.color || "#1B3A5C",
      head_person_id: d.head_person_id, sort_order: d.sort_order ?? 0,
    }));

  // ---- KPIs, with live readings where a metric feed is wired up ----
  const liveKeys = (kpiRes.data || []).map((k) => k.metric_source).filter(Boolean) as string[];
  const live = liveKeys.length ? await resolveMetrics(admin, liveKeys) : {};

  const watchersByKpi = new Map<string, string[]>();
  for (const w of watcherRes.data || []) {
    const list = watchersByKpi.get(w.kpi_id) || [];
    list.push(w.person_id);
    watchersByKpi.set(w.kpi_id, list);
  }

  const allKpis: Kpi[] = (kpiRes.data || []).map((k) => {
    const m = k.metric_source ? live[k.metric_source] : undefined;
    return {
      id: k.id,
      name: k.name,
      detail: k.detail || "",
      unit: k.unit || "",
      owner_id: k.owner_id,
      dept_id: k.dept_id,
      start_value: n(k.start_value),
      current_value: m ? m.current : n(k.current_value),
      target_value: n(k.target_value),
      metric_source: k.metric_source,
      cadence: k.cadence || "monthly",
      period: k.period,
      bands: arr(k.bands),
      sort_order: k.sort_order ?? 0,
      active: k.active !== false,
      watchers: watchersByKpi.get(k.id) || [],
      liveNote: m?.note ?? null,
    };
  });

  // ---- the goal tree ----
  const commentCount = new Map<string, number>();
  for (const c of commentRes.data || [])
    commentCount.set(c.item_id, (commentCount.get(c.item_id) || 0) + 1);

  const kpiName = new Map(allKpis.map((k) => [k.id, k.name]));

  const raw: ItemMap = {};
  for (const r of itemRes.data || []) {
    raw[r.id] = {
      id: r.id,
      scope: r.scope,
      kind: r.kind,
      parent_id: r.parent_id,
      root_id: r.root_id,
      rock_id: r.rock_id,
      kra_id: r.kra_id,
      kpi_id: r.kpi_id,
      title: r.title || "",
      detail: r.detail || "",
      assignee_type: r.assignee_type || "person",
      assignee_id: r.assignee_id,
      dept_id: r.dept_id,
      start_date: r.start_date,
      due_date: r.due_date,
      original_due: r.original_due,
      push_count: r.push_count ?? 0,
      start_metric: n(r.start_metric),
      current_metric: n(r.current_metric),
      goal_metric: n(r.goal_metric),
      metric_unit: r.metric_unit || "",
      manual_pct: Number(r.manual_pct ?? 0),
      weight: Number(r.weight ?? 1),
      status: r.status,
      bands: arr(r.bands),
      period: r.period,
      sort_order: r.sort_order ?? 0,
      kids: [],
      comments: commentCount.get(r.id) || 0,
      kpiName: r.kpi_id ? kpiName.get(r.kpi_id) ?? null : null,
    };
  }

  // A hidden goal hides everything under it. Walking parent-first means a
  // sub-goal can never survive its parent and appear as an orphan — which is
  // exactly what marking a goal Management-only is supposed to prevent.
  const visible = new Map<string, boolean>();
  const isVisible = (id: string, guard = new Set<string>()): boolean => {
    if (visible.has(id)) return visible.get(id)!;
    if (guard.has(id)) return false;
    guard.add(id);
    const it = raw[id];
    if (!it) return false;
    const own = bandVisible(it.bands, me, { assignee_id: it.assignee_id, dept_id: it.dept_id });
    const ok = own && (!it.parent_id || !raw[it.parent_id] || isVisible(it.parent_id, guard));
    visible.set(id, ok);
    return ok;
  };

  const items: ItemMap = {};
  for (const id of Object.keys(raw)) if (isVisible(id)) items[id] = raw[id];
  for (const it of Object.values(items))
    if (it.parent_id && items[it.parent_id]) items[it.parent_id].kids.push(it.id);
  for (const it of Object.values(items))
    it.kids.sort((a, b) => items[a].sort_order - items[b].sort_order || items[a].title.localeCompare(items[b].title));

  // ---- rocks, KRAs and KPIs the caller may see ----
  const rocks: Rock[] = (rockRes.data || [])
    .filter((r) => bandVisible(arr(r.bands), me, { owner_id: r.owner_id, dept_id: r.dept_id }))
    .map((r) => ({
      id: r.id, name: r.name, detail: r.detail || "", quarter: r.quarter, period: r.period,
      owner_id: r.owner_id, dept_id: r.dept_id, start_date: r.start_date, due_date: r.due_date,
      status: r.status, bands: arr(r.bands), color: r.color || "#E8600A", sort_order: r.sort_order ?? 0,
    }));

  // KRAs are personal. Admins and goal editors get everyone's so they can be
  // assigned; everyone else gets only their own.
  const kras: Kra[] = (kraRes.data || [])
    .filter((k) => me.isAdmin || me.canEdit || k.person_id === me.id)
    .map((k) => ({
      id: k.id, person_id: k.person_id, dept_id: k.dept_id, title: k.title,
      detail: k.detail || "", weight: Number(k.weight ?? 1), sort_order: k.sort_order ?? 0,
      active: k.active !== false,
    }));

  // "Relevant to me" is four different reasons, and the tab says which one.
  const myGoalKpis = new Set(
    Object.values(items)
      .filter((i) => i.kpi_id && (i.assignee_id === me.id || (i.dept_id && i.dept_id === me.department_id)))
      .map((i) => i.kpi_id as string),
  );
  const kpis: Kpi[] = allKpis
    .filter((k) => bandVisible(k.bands, me, { owner_id: k.owner_id, dept_id: k.dept_id }))
    .map((k) => ({
      ...k,
      why:
        k.owner_id === me.id ? "You own this KPI"
        : k.watchers.includes(me.id) ? "You were added as a watcher"
        : k.dept_id && k.dept_id === me.department_id ? "Your department's KPI"
        : myGoalKpis.has(k.id) ? "A goal assigned to you is measured by it"
        : "Open to everyone",
    }));

  const periods = [...new Set([DEFAULT_PERIOD, period, ...((periodRes.data || []).map((r) => r.period as string))])]
    .filter(Boolean)
    .sort()
    .reverse();

  return {
    me,
    bands: (bandRes.data || []).map((b) => ({ code: b.code, label: b.label, note: b.note })),
    departments,
    people,
    rocks,
    items,
    kras,
    kpis,
    period,
    periods,
    metrics: METRICS.map(({ key, label, unitHint, describe }) => ({ key, label, unitHint, describe })),
  };
}
