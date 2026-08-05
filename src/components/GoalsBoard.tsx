"use client";
// Goals tab — the five goals, the cascade, and the node inspector.
// Ported from the Goal Book draft but restyled onto the planning suite's own
// palette so genie reads as one product rather than two bolted together.
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import {
  progressOf, progressBasis, isLate, LEVEL_COLUMNS, LEVEL_LABEL, LEVEL_ORDER, LEVEL_PLURAL,
  STATUS_META, CHILD_OF,
  type GoalNode, type NodeMap, type GoalStatus, type NodeType,
} from "@/lib/goals";
import { today, fmt, fmtFull, diffDays } from "@/lib/schedule";

const TODAY = today();

interface Tree {
  nodes: NodeMap;
  goals: string[];
  swimlanes: { id: string; name: string; color: string }[];
  units: { id: string; label: string }[];
  csfs: { id: string; label: string }[];
  goalCsf: Record<string, string[]>;
  opsp: { id: string; label: string; body: string }[];
  period: string;
  canEdit: boolean;
  metrics: { key: string; label: string; unitHint: string; describe: string }[];
}

/** Segmented progress gauge — the one visual idea worth keeping from the draft. */
function Gauge({ pct, color, seg = 14, w = 4, h = 8 }: { pct: number; color: string; seg?: number; w?: number; h?: number }) {
  const on = Math.round((pct / 100) * seg);
  return (
    <div className="flex items-end" style={{ gap: 2 }}>
      {Array.from({ length: seg }).map((_, i) => (
        <div key={i} style={{ width: w, height: h, background: i < on ? color : "#E2E0DA" }} />
      ))}
    </div>
  );
}

function Who({ ids, size = 20 }: { ids: string[]; size?: number }) {
  return (
    <div className="flex" style={{ gap: 3 }}>
      {ids.length === 0 && <span className="text-xs" style={{ color: "#B8B5AC" }}>—</span>}
      {ids.map((i, k) => (
        <div key={i + k} title={i} className="flex items-center justify-center font-bold tnum"
          style={{ width: size, height: size, borderRadius: size, background: "#DCE8F5", color: "#1B3A5C", fontSize: size * 0.42 }}>
          {i}
        </div>
      ))}
    </div>
  );
}

/**
 * Swimlane colours come from the category itself (admin-managed in Admin →
 * Goal categories), not a fixed map — so a newly added category is styled
 * without a code change. Background is a light tint of the same colour; the
 * fallback covers a node whose category was since deleted.
 */
const HEX6 = /^#[0-9a-f]{6}$/i;
function makeSwimColorers(swimlanes: { name: string; color: string }[]) {
  const byName = new Map(swimlanes.map((s) => [s.name, HEX6.test(s.color) ? s.color : "#5A6672"]));
  const color = (name: string | null) => (name && byName.get(name)) || "#5A6672";
  const bg = (name: string | null) => color(name) + "1A"; // ~10% alpha tint
  return { color, bg };
}

function Chip({ children, color = "#5A6672", bg = "#F4F2EC" }: { children: React.ReactNode; color?: string; bg?: string }) {
  return (
    <span className="rounded px-1.5 py-0.5 font-bold whitespace-nowrap"
      style={{ background: bg, color, fontSize: 10, letterSpacing: 0.4, textTransform: "uppercase" }}>
      {children}
    </span>
  );
}

export default function GoalsBoard({ canEditPlanning }: { canEditPlanning: boolean }) {
  const [tree, setTree] = useState<Tree | null>(null);
  const [denied, setDenied] = useState(false);
  const [notInstalled, setNotInstalled] = useState(false);
  const [err, setErr] = useState("");
  const [goal, setGoal] = useState<string | null>(null);
  const [path, setPath] = useState<string[]>([]);
  const [inspect, setInspect] = useState<string | null>(null);
  const [view, setView] = useState<"cascade" | "swim">("cascade");
  const [levels, setLevels] = useState<NodeType[]>(["key_result", "tactic"]);

  const load = useCallback(async () => {
    try {
      const t = await api.get("/api/goals");
      setTree(t);
      setDenied(false);
      setErr("");
      setGoal((g) => g ?? t.goals[0] ?? null);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (/no_goal_access|not been shared/i.test(m)) setDenied(true);
      // the tables only exist once migration 0010 has been applied
      else if (/goal_node|swimlanes|does not exist|schema cache/i.test(m)) setNotInstalled(true);
      else setErr(m);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const nodes = tree?.nodes ?? {};

  // one column per level, opening to the right as you pick.
  // Browsing by category happens in the Swimlanes view, so the cascade shows
  // the tree whole rather than filtering it.
  const columns = useMemo(() => {
    if (!goal) return [] as { parent: string; kids: string[]; depth: number }[];
    const cols: { parent: string; kids: string[]; depth: number }[] = [];
    let parent = goal;
    for (let i = 0; i < 5; i++) {
      const kids = nodes[parent]?.kids || [];
      if (!kids.length) break;
      cols.push({ parent, kids, depth: i });
      if (!path[i] || !kids.includes(path[i])) break;
      parent = path[i];
    }
    return cols;
  }, [nodes, goal, path]);

  if (notInstalled) {
    return (
      <div className="p-8" style={{ maxWidth: 620 }}>
        <div className="text-lg font-bold mb-2" style={{ color: "#16232F" }}>Goals layer not installed yet</div>
        <p className="text-sm mb-3" style={{ color: "#5A6672", lineHeight: 1.6 }}>
          The goal tables haven&apos;t been created in this database. Run{" "}
          <code style={{ background: "#F4F2EC", padding: "1px 5px", borderRadius: 3 }}>
            supabase/migrations/0010_goals_layer.sql
          </code>{" "}
          in the Supabase SQL editor, then reload.
        </p>
        <p className="text-xs" style={{ color: "#8A94A0", lineHeight: 1.6 }}>
          Everything else in the suite works without it — the migration only adds new tables, so nothing already
          running depends on it.
        </p>
      </div>
    );
  }

  if (denied) {
    return (
      <div className="p-8" style={{ maxWidth: 620 }}>
        <div className="text-lg font-bold mb-2" style={{ color: "#16232F" }}>The goal tree hasn&apos;t been shared with you</div>
        <p className="text-sm mb-3" style={{ color: "#5A6672", lineHeight: 1.6 }}>
          Goals access is granted per person rather than following your planning role. Your own work still reaches you —
          it&apos;s all on <b>My Week</b>.
        </p>
        <p className="text-xs" style={{ color: "#8A94A0", lineHeight: 1.6 }}>
          Seeing the tree and seeing your own work are two separate checks. Keeping them apart is what lets the cascade
          extend below the leadership group later without breaking anyone&apos;s to-do list.
        </p>
      </div>
    );
  }
  if (err) return <div className="p-8 text-sm" style={{ color: "#B3261E" }}>{err}</div>;
  if (!tree) return <div className="p-8 text-sm" style={{ color: "#8A94A0" }}>Loading the goal tree…</div>;

  if (!tree.goals.length) {
    return (
      <div className="p-8" style={{ maxWidth: 620 }}>
        <div className="text-lg font-bold mb-2" style={{ color: "#16232F" }}>No goals for {tree.period} yet</div>
        <p className="text-sm mb-4" style={{ color: "#5A6672", lineHeight: 1.6 }}>
          Start with the five organisational goals. Everything else hangs off one of them.
        </p>
        {tree.canEdit && (
          <button
            onClick={async () => {
              for (let i = 1; i <= 5; i++)
                await api.post("/api/goals", { action: "create", node_type: "goal", goal_num: i, what: `Goal ${i} — name it`, period: tree.period });
              await load();
            }}
            className="text-sm font-bold rounded px-4 py-2"
            style={{ background: "#E8600A", color: "#fff" }}
          >
            + Create the five goals
          </button>
        )}
      </div>
    );
  }

  const { color: swimColor, bg: swimBg } = makeSwimColorers(tree.swimlanes);
  const visibleGoals = tree.goals;
  const crumbs = [goal, ...path.filter(Boolean)].filter(Boolean) as string[];

  const select = (depth: number, id: string) => {
    const next = path.slice(0, depth);
    next[depth] = path[depth] === id ? "" : id;
    setPath(next.filter((x, i) => i <= depth && !!x));
  };

  return (
    <div className="p-4">
      {/* ---- the five ---- */}
      <div className="flex items-center gap-3 mb-2 flex-wrap">
        <div className="text-xs font-bold" style={{ color: "#8A94A0", letterSpacing: 1.4 }}>
          THE FIVE · {tree.period}
        </div>
        <div className="flex-1" style={{ height: 1, background: "#E2E0DA", minWidth: 40 }} />
        <div className="flex gap-1 rounded p-1 border" style={{ background: "#fff", borderColor: "#E2E0DA" }}>
          {([["cascade", "Cascade"], ["swim", "Swimlanes"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setView(k)} className="px-3 py-1 rounded text-xs font-bold"
              style={view === k ? { background: "#22303C", color: "#fff" } : { color: "#5A6672" }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2 flex-wrap mb-4">
        {visibleGoals.map((g) => {
          const n = nodes[g];
          const pct = progressOf(nodes, g);
          const active = g === goal;
          const st = STATUS_META[n.status];
          return (
            <button key={g} onClick={() => { setGoal(g); setPath([]); }}
              className="text-left rounded-lg border p-3 flex flex-col gap-2"
              style={{
                flex: "1 1 0", minWidth: 200, background: "#fff",
                borderColor: active ? "#E8600A" : "#E2E0DA",
                borderTop: `3px solid ${active ? "#E8600A" : "#D9D6CD"}`,
              }}>
              <div className="flex items-baseline gap-2">
                <span className="font-bold tnum" style={{ fontSize: 26, lineHeight: 0.85, color: active ? "#E8600A" : "#D9D6CD" }}>
                  {String(n.goal_num ?? 0).padStart(2, "0")}
                </span>
                <span className="ml-auto"><Chip color={st.color}>{st.label}</Chip></span>
              </div>
              <div className="text-sm font-semibold" style={{ minHeight: 40, lineHeight: 1.35, color: "#16232F" }}>{n.what}</div>
              {n.swimlane && <div><Chip color={swimColor(n.swimlane)} bg={swimBg(n.swimlane)}>{n.swimlane}</Chip></div>}
              <div className="flex items-end justify-between gap-2">
                <div>
                  {n.target_no != null && (
                    <div className="tnum text-sm" style={{ color: "#22303C" }}>
                      {n.current_no ?? 0}<span style={{ color: "#8A94A0", fontSize: 11 }}> / {n.target_no} {n.unit ?? ""}</span>
                    </div>
                  )}
                  <div className="mt-1"><Gauge pct={pct} color={active ? "#E8600A" : "#8A94A0"} /></div>
                </div>
                <Who ids={n.owners} />
              </div>
            </button>
          );
        })}
      </div>

      {/* ---- swimlane kanban: one column per category ---- */}
      {view === "swim" && (() => {
        // Counts in the lane header always reflect EVERY level in that
        // category, regardless of the level filter — "how many tactics/
        // subfields live in this field" shouldn't disappear just because the
        // Tactics chip is toggled off. Only the cards actually rendered
        // respect the filter.
        const allNodes = Object.values(nodes);
        const shown = allNodes.filter((n) => levels.includes(n.node_type));
        const countsFor = (list: GoalNode[]) => LEVEL_ORDER.map((lv) => list.filter((n) => n.node_type === lv).length);

        const lanes = tree.swimlanes.map((s) => {
          const laneAll = allNodes.filter((n) => n.swimlane === s.name);
          return {
            ...s,
            total: laneAll.length,
            counts: countsFor(laneAll),
            items: shown
              .filter((n) => n.swimlane === s.name)
              .sort((a, b) => LEVEL_ORDER.indexOf(a.node_type) - LEVEL_ORDER.indexOf(b.node_type) || a.sort_order - b.sort_order),
          };
        });
        const unassignedAll = allNodes.filter((n) => !n.swimlane);
        const cols = [
          ...lanes,
          ...(unassignedAll.length
            ? [{
                id: "none", name: "No category", color: "#8A94A0",
                total: unassignedAll.length, counts: countsFor(unassignedAll),
                items: shown.filter((n) => !n.swimlane),
              }]
            : []),
        ];

        return (
          <>
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <span className="text-xs font-bold" style={{ color: "#8A94A0" }}>SHOW</span>
              {(LEVEL_ORDER as NodeType[]).map((lv) => {
                const on = levels.includes(lv);
                return (
                  <button key={lv}
                    onClick={() => setLevels((p) => (on ? p.filter((x) => x !== lv) : [...p, lv]))}
                    className="text-xs font-bold rounded px-2 py-1"
                    style={on ? { background: "#22303C", color: "#fff" } : { background: "#F4F2EC", color: "#8A94A0" }}>
                    {LEVEL_PLURAL[lv]}
                  </button>
                );
              })}
              <span className="text-xs ml-2" style={{ color: "#8A94A0" }}>
                {shown.length} shown across {cols.length} categories
              </span>
            </div>

            <div className="flex gap-3 overflow-x-auto items-start pb-4">
              {cols.map((lane) => {
                const done = lane.items.filter((n) => n.status === "done").length;
                const avg = lane.items.length
                  ? lane.items.reduce((s, n) => s + progressOf(nodes, n.id), 0) / lane.items.length
                  : 0;
                const breakdown = LEVEL_ORDER.map((lv, i) => (lane.counts[i] > 0 ? `${lane.counts[i]} ${LEVEL_LABEL[lv]}${lane.counts[i] === 1 ? "" : "s"}` : null)).filter(Boolean);
                return (
                  <div key={lane.id} className="flex-shrink-0" style={{ width: 268 }}>
                    <div className="rounded-t-lg p-2" style={{ background: swimBg(lane.name), borderBottom: `3px solid ${swimColor(lane.name)}` }}>
                      <div className="flex items-baseline justify-between">
                        <span className="font-bold text-sm" style={{ color: swimColor(lane.name) }}>{lane.name}</span>
                        <span className="text-xs tnum" style={{ color: "#5A6672" }}>{lane.total}</span>
                      </div>
                      {/* the number of tactics/subfields within this field, by level */}
                      <div className="text-xs mt-0.5" style={{ color: "#5A6672", lineHeight: 1.4 }}>
                        {breakdown.length ? breakdown.join(" · ") : "empty"}
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <Gauge pct={avg} color={swimColor(lane.name)} seg={12} w={4} h={6} />
                        <span className="text-xs tnum" style={{ color: "#5A6672" }}>{Math.round(avg)}%</span>
                        {done > 0 && <span className="text-xs ml-auto" style={{ color: "#0D7A3F" }}>{done} done</span>}
                      </div>
                    </div>
                    <div className="rounded-b-lg p-2" style={{ background: "#EFEDE7", minHeight: 90 }}>
                      {lane.items.length === 0 && (
                        <div className="text-xs text-center py-4" style={{ color: "#B8B5AC" }}>Nothing here</div>
                      )}
                      {lane.items.map((n) => {
                        const pct = progressOf(nodes, n.id);
                        const st = STATUS_META[n.status];
                        const late = isLate(n, TODAY);
                        const goalNum = n.goal_id ? nodes[n.goal_id]?.goal_num : n.goal_num;
                        return (
                          <div key={n.id} onClick={() => setInspect(n.id)}
                            className="rounded border mb-1.5 cursor-pointer p-2 bg-white"
                            style={{ borderColor: "#E2E0DA", borderLeft: `3px solid ${st.color}` }}>
                            <div className="flex items-center gap-1 mb-1">
                              <Chip color="#5A6672" bg="#F4F2EC">{LEVEL_LABEL[n.node_type]}</Chip>
                              {goalNum != null && <Chip color="#E8600A" bg="#FFF3E8">G{goalNum}</Chip>}
                              {n.metric_source && <Chip color="#0D7A3F" bg="#E6F4EA">live</Chip>}
                            </div>
                            <div className="text-xs font-semibold" style={{
                              lineHeight: 1.35, color: "#16232F",
                              textDecoration: n.status === "done" ? "line-through" : "none",
                              opacity: n.status === "done" ? 0.55 : 1,
                              display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
                            }}>{n.what}</div>
                            <div className="flex items-center gap-2 mt-1.5">
                              <Who ids={n.owners} size={17} />
                              <span className="tnum" style={{ fontSize: 10, color: late ? "#B3261E" : "#8A94A0" }}>{fmt(n.end_date)}</span>
                              <span className="ml-auto tnum" style={{ fontSize: 10, color: "#5A6672" }}>{Math.round(pct)}%</span>
                            </div>
                            <div className="mt-1"><Gauge pct={pct} color={st.color} seg={16} w={3} h={4} /></div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="text-xs" style={{ color: "#8A94A0" }}>
              Every node carries a category, so the same work appears here and in the cascade — this is the same tree
              sliced the other way. Tap any card to open it.
            </div>
          </>
        );
      })()}

      {/* ---- breadcrumb ---- */}
      {view === "cascade" && goal && (
        <div className="flex items-center gap-2 flex-wrap mb-2">
          {crumbs.map((id, i) => (
            <span key={id} className="flex items-center gap-2">
              {i > 0 && <span style={{ color: "#B8B5AC" }}>›</span>}
              <button onClick={() => setPath(path.slice(0, i))} className="text-xs truncate"
                style={{ maxWidth: 230, color: i === crumbs.length - 1 ? "#E8600A" : "#5A6672", fontWeight: i === crumbs.length - 1 ? 700 : 400 }}>
                {i === 0 ? "Goal " + (nodes[id]?.goal_num ?? "") : nodes[id]?.what}
              </button>
            </span>
          ))}
          {path.length > 0 && (
            <button onClick={() => setPath([])} className="text-xs font-bold rounded px-2 py-0.5 ml-2" style={{ background: "#F4F2EC", color: "#8A94A0" }}>
              Collapse all
            </button>
          )}
        </div>
      )}

      {/* ---- cascade ---- */}
      {view === "cascade" && (
      <div className="flex overflow-x-auto items-start pb-4" style={{ gap: 0 }}>
        {columns.map((col) => (
          <div key={col.depth} className="flex-shrink-0" style={{ width: 264, borderRight: "1px solid #E2E0DA", paddingRight: 12, marginRight: 12 }}>
            <div className="flex items-center gap-2 pb-1.5 mb-2" style={{ borderBottom: "1px solid #E2E0DA" }}>
              <span className="tnum font-bold" style={{ fontSize: 10, color: "#E8600A" }}>{String(col.depth + 1).padStart(2, "0")}</span>
              <span className="text-xs font-bold" style={{ color: "#5A6672", letterSpacing: 1.1 }}>{LEVEL_COLUMNS[col.depth]?.toUpperCase()}</span>
              <span className="ml-auto tnum text-xs" style={{ color: "#8A94A0" }}>{col.kids.length}</span>
            </div>
            {col.kids.map((k) => {
              const n = nodes[k];
              const pct = progressOf(nodes, k);
              const st = STATUS_META[n.status];
              const late = isLate(n, TODAY);
              const sel = path[col.depth] === k;
              return (
                <div key={k} onClick={() => select(col.depth, k)}
                  className="rounded border mb-1.5 cursor-pointer p-2"
                  style={{ background: sel ? "#FFF3E8" : "#fff", borderColor: sel ? "#E8600A" : "#E2E0DA", borderLeft: `3px solid ${st.color}` }}>
                  <div className="text-xs font-semibold" style={{
                    lineHeight: 1.35, color: "#16232F",
                    textDecoration: n.status === "done" ? "line-through" : "none",
                    opacity: n.status === "done" ? 0.55 : 1,
                    display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
                  }}>{n.what}</div>
                  <div className="flex items-center gap-2 mt-2">
                    <Who ids={n.owners} size={17} />
                    <span className="tnum" style={{ fontSize: 10, color: late ? "#B3261E" : "#8A94A0" }}>{fmt(n.end_date)}</span>
                    <span className="ml-auto tnum" style={{ fontSize: 10, color: "#5A6672" }}>{Math.round(pct)}%</span>
                    <button onClick={(e) => { e.stopPropagation(); setInspect(k); }} title="Open detail"
                      className="rounded" style={{ border: "1px solid #E2E0DA", width: 18, height: 18, fontSize: 11, lineHeight: 1, color: "#5A6672" }}>⋯</button>
                  </div>
                  <div className="mt-1.5"><Gauge pct={pct} color={st.color} seg={16} w={3} h={5} /></div>
                  <div className="mt-1.5 flex items-center gap-1 flex-wrap">
                    {n.swimlane && <Chip color={swimColor(n.swimlane)} bg={swimBg(n.swimlane)}>{n.swimlane}</Chip>}
                    {n.metric_source && <Chip color="#0D7A3F" bg="#E6F4EA">live</Chip>}
                    {n.kids.length > 0 && (
                      <>
                        <Chip>{n.kids.length} below</Chip>
                        <span style={{ color: sel ? "#E8600A" : "#B8B5AC", fontSize: 12 }}>›</span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            {tree.canEdit && (
              <button onClick={() => setInspect(col.parent)}
                className="w-full text-xs font-bold rounded py-1.5"
                style={{ border: "1px dashed #D9D6CD", color: "#8A94A0", background: "transparent" }}>
                + Add
              </button>
            )}
          </div>
        ))}
        {columns.length === 0 && goal && (
          <div className="text-sm p-4" style={{ color: "#8A94A0", maxWidth: 380 }}>
            Nothing under this goal yet. Open it with ⋯ on the card above and add the first project.
            <div className="mt-2">
              {tree.canEdit && (
                <button onClick={() => setInspect(goal)} className="text-xs font-bold rounded px-3 py-1.5" style={{ background: "#1B3A5C", color: "#fff" }}>
                  Open goal
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      )}

      {inspect && nodes[inspect] && (
        <Inspector tree={tree} id={inspect} onClose={() => setInspect(null)} reload={load} />
      )}
    </div>
  );
}

// ============================ inspector ============================
function Inspector({ tree, id, onClose, reload }: { tree: Tree; id: string; onClose: () => void; reload: () => Promise<void> }) {
  const nodes = tree.nodes;
  const n = nodes[id];
  const [cmt, setCmt] = useState("");
  const [comments, setComments] = useState<{ by: string; at: string; body: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"detail" | "edit">("detail");
  const [f, setF] = useState({
    what: n.what, how: n.how, status: n.status as GoalStatus,
    start_date: n.start_date || "", end_date: n.end_date || "",
    start_no: n.start_no ?? "", current_no: n.current_no ?? "", target_no: n.target_no ?? "",
    unit_id: n.unit_id || "", swimlane_id: n.swimlane_id || "",
    metric_source: n.metric_source || "", completion_pct: n.completion_pct ?? 0,
  });

  useEffect(() => {
    api.get(`/api/goals/comments?node_id=${id}`).then((r) => setComments(r.comments)).catch(() => {});
  }, [id]);

  const pct = progressOf(nodes, id);
  const basis = progressBasis(nodes, id);
  const late = isLate(n, TODAY);
  const st = STATUS_META[n.status];

  const save = async () => {
    setBusy(true);
    try {
      await api.post("/api/goals", {
        action: "update", id,
        what: f.what, how: f.how, status: f.status,
        start_date: f.start_date || null, end_date: f.end_date || null,
        start_no: f.start_no === "" ? null : Number(f.start_no),
        current_no: f.current_no === "" ? null : Number(f.current_no),
        target_no: f.target_no === "" ? null : Number(f.target_no),
        unit_id: f.unit_id || null, swimlane_id: f.swimlane_id || null,
        metric_source: f.metric_source || null,
        completion_pct: Number(f.completion_pct) || 0,
      });
      await reload();
      setTab("detail");
    } catch (e) { alert(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const addChild = async () => {
    const childType = CHILD_OF[n.node_type];
    await api.post("/api/goals", {
      action: "create", parent_id: id, node_type: childType,
      what: `New ${LEVEL_LABEL[childType].toLowerCase()} — name it`,
      period: n.period, swimlane_id: n.swimlane_id,
      start_date: TODAY, status: "not_started",
    });
    await reload();
  };

  const postComment = async () => {
    if (!cmt.trim()) return;
    await api.post("/api/goals", { action: "comment", id, body: cmt.trim() });
    setCmt("");
    const r = await api.get(`/api/goals/comments?node_id=${id}`);
    setComments(r.comments);
  };

  const remove = async () => {
    if (!window.confirm(`Delete "${n.what}"?\n\nEverything below it goes too. This cannot be undone.`)) return;
    await api.post("/api/goals", { action: "delete", id });
    await reload();
    onClose();
  };

  return (
    <>
      <div onClick={onClose} className="fixed inset-0" style={{ background: "rgba(13,22,31,0.45)", zIndex: 59 }} />
      <aside className="fixed top-0 right-0 bottom-0 flex flex-col"
        style={{ width: "min(430px, 94vw)", background: "#fff", borderLeft: "1px solid #E2E0DA", zIndex: 60, boxShadow: "-20px 0 50px rgba(0,0,0,.25)" }}>
        <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid #E2E0DA" }}>
          <Chip color="#E8600A" bg="#FFF3E8">{LEVEL_LABEL[n.node_type]}</Chip>
          {n.swimlane && <Chip>{n.swimlane}</Chip>}
          {n.unaligned && <Chip color="#D97706" bg="#FFF7E6">unaligned</Chip>}
          {tree.canEdit && (
            <div className="ml-auto flex gap-1">
              {(["detail", "edit"] as const).map((k) => (
                <button key={k} onClick={() => setTab(k)} className="text-xs font-bold rounded px-2 py-1"
                  style={tab === k ? { background: "#22303C", color: "#fff" } : { color: "#5A6672" }}>
                  {k === "detail" ? "Detail" : "Edit"}
                </button>
              ))}
            </div>
          )}
          <button onClick={onClose} className="rounded ml-1" style={{ border: "1px solid #E2E0DA", width: 24, height: 24, color: "#8A94A0" }}>✕</button>
        </div>

        <div className="overflow-y-auto p-4">
          {tab === "edit" ? (
            <div className="space-y-2">
              <Label>What</Label>
              <textarea value={f.what} onChange={(e) => setF({ ...f, what: e.target.value })} rows={2} className="w-full text-sm border rounded px-2 py-1" style={{ borderColor: "#E2E0DA" }} />
              <Label>How</Label>
              <textarea value={f.how} onChange={(e) => setF({ ...f, how: e.target.value })} rows={3} className="w-full text-xs border rounded px-2 py-1" style={{ borderColor: "#E2E0DA" }} />
              <div className="flex gap-2">
                <div className="flex-1"><Label>Status</Label>
                  <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as GoalStatus })} className="w-full text-xs border rounded px-1 py-1 bg-white" style={{ borderColor: "#E2E0DA" }}>
                    {Object.entries(STATUS_META).map(([k, v]) => (<option key={k} value={k}>{v.label}</option>))}
                  </select>
                </div>
                <div className="flex-1"><Label>Swimlane</Label>
                  <select value={f.swimlane_id} onChange={(e) => setF({ ...f, swimlane_id: e.target.value })} className="w-full text-xs border rounded px-1 py-1 bg-white" style={{ borderColor: "#E2E0DA" }}>
                    <option value="">—</option>
                    {tree.swimlanes.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <div className="flex-1"><Label>Start</Label><input type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} className="w-full text-xs border rounded px-1 py-1" style={{ borderColor: "#E2E0DA" }} /></div>
                <div className="flex-1"><Label>End</Label><input type="date" value={f.end_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} className="w-full text-xs border rounded px-1 py-1" style={{ borderColor: "#E2E0DA" }} /></div>
              </div>
              <Label>Numbers — leave blank to enter a percentage instead</Label>
              <div className="flex gap-2">
                {(["start_no", "current_no", "target_no"] as const).map((k) => (
                  <div key={k} className="flex-1">
                    <div className="text-xs mb-0.5" style={{ color: "#8A94A0" }}>{k.split("_")[0]}</div>
                    <input type="number" value={f[k] as any} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="w-full text-xs border rounded px-1 py-1 tnum" style={{ borderColor: "#E2E0DA" }} />
                  </div>
                ))}
                <div className="flex-1"><div className="text-xs mb-0.5" style={{ color: "#8A94A0" }}>unit</div>
                  <select value={f.unit_id} onChange={(e) => setF({ ...f, unit_id: e.target.value })} className="w-full text-xs border rounded px-1 py-1 bg-white" style={{ borderColor: "#E2E0DA" }}>
                    <option value="">—</option>
                    {tree.units.map((u) => (<option key={u.id} value={u.id}>{u.label}</option>))}
                  </select>
                </div>
              </div>
              <Label>Live feed — read the current number from the planning data</Label>
              <select value={f.metric_source} onChange={(e) => setF({ ...f, metric_source: e.target.value })} className="w-full text-xs border rounded px-1 py-1 bg-white" style={{ borderColor: "#E2E0DA" }}>
                <option value="">Not fed — the number is typed</option>
                {tree.metrics.map((m) => (<option key={m.key} value={m.key}>{m.label} ({m.unitHint})</option>))}
              </select>
              {f.metric_source && (
                <div className="text-xs rounded p-2" style={{ background: "#E6F4EA", color: "#0D7A3F" }}>
                  {tree.metrics.find((m) => m.key === f.metric_source)?.describe}
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <button onClick={save} disabled={busy} className="flex-1 text-sm font-bold rounded py-2" style={{ background: "#E8600A", color: "#fff", opacity: busy ? 0.6 : 1 }}>
                  {busy ? "Saving…" : "Save"}
                </button>
                <button onClick={remove} className="text-sm font-bold rounded px-3" style={{ background: "#FBEDEA", color: "#B3261E" }}>Delete</button>
              </div>
            </div>
          ) : (
            <>
              <div className="text-base font-bold mb-1" style={{ color: "#16232F", lineHeight: 1.3 }}>{n.what}</div>
              <Label>How</Label>
              <div className="text-sm mb-3" style={{ color: "#5A6672", lineHeight: 1.5 }}>
                {n.how || <span style={{ color: "#B8B5AC" }}>Not written yet.</span>}
              </div>

              <div className="flex gap-5 mb-3">
                <div><Label>Who</Label><Who ids={n.owners} /></div>
                <div><Label>Status</Label><Chip color={st.color}>{st.label}</Chip></div>
              </div>

              <Label>When</Label>
              <div className="text-sm tnum mb-1" style={{ color: "#22303C" }}>
                {fmt(n.start_date)} → <span style={{ color: late ? "#B3261E" : "#22303C" }}>{fmtFull(n.end_date)}</span>
              </div>
              {n.original_end && n.end_date && n.original_end !== n.end_date && (
                <div className="text-xs mb-3" style={{ color: "#D97706" }}>
                  pushed from {fmtFull(n.original_end)} · {diffDays(n.original_end, n.end_date)} days · {n.push_count} push{n.push_count === 1 ? "" : "es"}
                </div>
              )}

              <div className="rounded p-3 my-3" style={{ background: "#F4F2EC", border: "1px solid #E2E0DA" }}>
                <Label>
                  Measure {basis === "measured" ? "· measured live" : basis === "rolled" ? "· rolled up from below" : basis === "derived" ? "· derived from the numbers" : "· entered manually"}
                </Label>
                {(basis === "derived" || basis === "measured") && (
                  <>
                    <div className="flex items-end gap-4 mb-2">
                      {([["Start", n.start_no], ["Current", n.current_no], ["Target", n.target_no]] as const).map(([l, v], i) => (
                        <div key={l}>
                          <div className="text-xs" style={{ color: "#8A94A0" }}>{l}</div>
                          <div className="tnum font-bold" style={{ fontSize: i === 1 ? 20 : 14, color: i === 1 ? "#E8600A" : "#5A6672" }}>{v ?? "—"}</div>
                        </div>
                      ))}
                      <div className="text-xs pb-1" style={{ color: "#8A94A0" }}>{n.unit}</div>
                    </div>
                    <div className="text-xs tnum mb-2" style={{ color: "#8A94A0" }}>
                      ({n.current_no} − {n.start_no}) ÷ ({n.target_no} − {n.start_no}) = {Math.round(pct)}%
                    </div>
                  </>
                )}
                {basis === "manual" && <div className="tnum font-bold mb-2" style={{ fontSize: 20, color: "#E8600A" }}>{Math.round(pct)}%</div>}
                <Gauge pct={pct} color={st.color} seg={22} w={5} h={11} />
                {basis === "rolled" && (
                  <div className="text-xs mt-2" style={{ color: "#8A94A0" }}>
                    Weighted average of {n.kids.length} items below. Move a tactic and this moves — and so does the goal above it.
                  </div>
                )}
                {n.metric_source && (
                  <div className="text-xs mt-2 rounded p-2" style={{ background: "#E6F4EA", color: "#0D7A3F" }}>
                    <b>Live</b> — {n.metricNote || "read from the planning data"}. Nobody types this number.
                    {n.kids.length > 0 && (
                      <div className="mt-1" style={{ color: "#5A6672" }}>
                        The {n.kids.length} item{n.kids.length === 1 ? "" : "s"} below are how this moves, but the
                        measurement is what counts — so this percentage is the reading, not their average.
                      </div>
                    )}
                  </div>
                )}
              </div>

              <Label>Comments · {comments.length}</Label>
              {comments.length === 0 && (
                <div className="text-xs mb-2" style={{ color: "#B8B5AC" }}>
                  Nothing recorded yet. Comments stay visible after this closes — they are how the number moved.
                </div>
              )}
              {comments.map((c, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <Who ids={[c.by]} size={20} />
                  <div>
                    <div className="text-xs tnum" style={{ color: "#8A94A0" }}>{new Date(c.at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</div>
                    <div className="text-xs" style={{ color: "#5A6672", lineHeight: 1.45 }}>{c.body}</div>
                  </div>
                </div>
              ))}
              <div className="flex gap-1 mt-2">
                <input value={cmt} onChange={(e) => setCmt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && postComment()}
                  placeholder="Add a comment" className="flex-1 text-xs border rounded px-2 py-1" style={{ borderColor: "#E2E0DA" }} />
                <button onClick={postComment} className="text-xs font-bold rounded px-2" style={{ background: "#E8600A", color: "#fff" }}>Post</button>
              </div>

              {tree.canEdit && n.node_type !== "tactic" && (
                <button onClick={addChild} className="w-full text-xs font-bold rounded py-2 mt-4"
                  style={{ border: "1px dashed #D9D6CD", color: "#5A6672" }}>
                  + Add {LEVEL_LABEL[CHILD_OF[n.node_type]].toLowerCase()}
                </button>
              )}
              {tree.canEdit && n.node_type === "tactic" && (
                <button onClick={addChild} className="w-full text-xs font-bold rounded py-2 mt-4"
                  style={{ border: "1px dashed #D9D6CD", color: "#5A6672" }}>
                  + Add subtask
                </button>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-bold mb-1" style={{ color: "#8A94A0", letterSpacing: 1.1, textTransform: "uppercase" }}>{children}</div>;
}
