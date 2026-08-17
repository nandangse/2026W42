"use client";
// The Goals section.
//
// Six tabs over one goal table (see src/lib/goals-v2.ts for why):
//   Company Goals · Quarterly Rocks · Departmental Goals · My Goals ·
//   My Key Result Areas · KPIs Relevant to me
//
// Every goal cascades into sub-goals and initiatives as a tree, to any depth,
// with expand-all and collapse-all across the whole tab. And the percentage is
// arithmetic, not opinion: where a goal carries a start, current and goal
// metric, its completion is computed and cannot be typed over. The Completion
// panel in the editor shows that working out loud.
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  TABS, STATUS_META, STATUS_ORDER, KIND_LABEL, SCOPE_LABEL, CHILD_KINDS, QUARTERS,
  completionOf, rollupOf, metricPct, hasMetrics, kpiPct, branchIds, descendants,
  countBelow, isLate, assigneeLabel, editModeFor,
  type TabKey, type GoalItem, type ItemMap, type Kind, type Scope, type GoalStatus, type EditMode,
  type Kpi, type Kra, type Rock, type Person, type Department,
} from "@/lib/goals-v2";
import type { GoalsPayload } from "@/lib/goals-v2-tree";
import { today, fmt, fmtFull } from "@/lib/schedule";

const TODAY = today();

const C = {
  ink: "#16232F", body: "#22303C", sub: "#5A6672", mute: "#8A94A0", faint: "#B8B5AC",
  line: "#E2E0DA", panel: "#F4F2EC", shell: "#EFEDE7", accent: "#E8600A",
  navy: "#1B3A5C", green: "#0D7A3F", amber: "#D97706", red: "#B3261E",
};

// ===========================================================================
// Small shared pieces
// ===========================================================================
function Chip({ children, color = C.sub, bg = C.panel, title }: {
  children: React.ReactNode; color?: string; bg?: string; title?: string;
}) {
  return (
    <span title={title} className="rounded px-1.5 py-0.5 font-bold whitespace-nowrap"
      style={{ background: bg, color, fontSize: 10, letterSpacing: 0.4, textTransform: "uppercase" }}>
      {children}
    </span>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-bold mb-1 mt-2" style={{ color: C.mute, letterSpacing: 1.1, textTransform: "uppercase" }}>
      {children}
    </div>
  );
}

/** Horizontal completion bar. The one place a percentage becomes a picture. */
function Bar({ pct, color = C.accent, h = 6, ghost }: { pct: number; color?: string; h?: number; ghost?: number | null }) {
  return (
    <div className="relative w-full rounded" style={{ height: h, background: "#E2E0DA", overflow: "hidden" }}>
      <div className="absolute left-0 top-0 rounded" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: h, background: color }} />
      {ghost != null && (
        // where the work below has got to, when it disagrees with the reading
        <div className="absolute top-0" title={`Items below average ${Math.round(ghost)}%`}
          style={{ left: `calc(${Math.max(0, Math.min(100, ghost))}% - 1px)`, width: 2, height: h, background: C.ink, opacity: 0.55 }} />
      )}
    </div>
  );
}

/** Segmented ring-ish gauge for headline numbers. */
function Gauge({ pct, color, seg = 20, w = 4, h = 10 }: { pct: number; color: string; seg?: number; w?: number; h?: number }) {
  const on = Math.round((pct / 100) * seg);
  return (
    <div className="flex items-end" style={{ gap: 2 }}>
      {Array.from({ length: seg }).map((_, i) => (
        <div key={i} style={{ width: w, height: h, background: i < on ? color : "#E2E0DA", borderRadius: 1 }} />
      ))}
    </div>
  );
}

function Avatar({ text, size = 20, bg = "#DCE8F5", color = C.navy }: { text: string; size?: number; bg?: string; color?: string }) {
  return (
    <div title={text} className="flex items-center justify-center font-bold flex-shrink-0"
      style={{ width: size, height: size, borderRadius: size, background: bg, color, fontSize: size * 0.42 }}>
      {text.slice(0, 2).toUpperCase()}
    </div>
  );
}

const bandColor: Record<string, string> = {
  management: "#1B3A5C", stratcom: "#7C3AED", lc: "#0D9488", all: "#8A94A0",
};

function BandChips({ bands, all }: { bands: string[]; all: { code: string; label: string }[] }) {
  if (!bands.length || (bands.length === 1 && bands[0] === "all"))
    return <Chip color={C.mute} title="Visible to everyone with Goals access">All</Chip>;
  return (
    <>
      {bands.map((b) => (
        <Chip key={b} color={bandColor[b] || C.sub} bg={(bandColor[b] || C.sub) + "1A"}
          title={`Only ${all.find((x) => x.code === b)?.label ?? b} and the people it is assigned to see this`}>
          {all.find((x) => x.code === b)?.label ?? b}
        </Chip>
      ))}
    </>
  );
}

// ===========================================================================
// Root
// ===========================================================================
export default function GoalsWorkspace() {
  const [data, setData] = useState<GoalsPayload | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "denied" | "not_installed" | "error">("loading");
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<TabKey>("company");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [deptFilter, setDeptFilter] = useState<string>("");
  const [quarter, setQuarter] = useState<string>("");
  const [period, setPeriod] = useState<string>("");

  const load = useCallback(async (p?: string) => {
    try {
      const r: GoalsPayload = await api.get(`/api/goals-v2${p ? `?period=${encodeURIComponent(p)}` : ""}`);
      setData(r);
      setPeriod(r.period);
      setState("ok");
      // open every root on first paint — a collapsed tree looks empty
      setExpanded((prev) =>
        prev.size ? prev : new Set(Object.values(r.items).filter((i) => !i.parent_id).map((i) => i.id)),
      );
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (/no_goal_access|not been shared/i.test(m)) setState("denied");
      else if (/not_installed|goal_item|departments|does not exist|schema cache/i.test(m)) setState("not_installed");
      else { setErr(m); setState("error"); }
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const post = useCallback(async (body: Record<string, unknown>) => {
    await api.post("/api/goals-v2", body);
    await load(period || undefined);
  }, [load, period]);

  if (state === "loading") return <div className="p-8 text-sm" style={{ color: C.mute }}>Loading the Goals section…</div>;
  if (state === "not_installed") return <NotInstalled />;
  if (state === "denied") return <Denied />;
  if (state === "error") return <div className="p-8 text-sm" style={{ color: C.red }}>{err}</div>;
  if (!data) return null;

  const { items, me, departments, people, bands } = data;
  const peopleById = new Map(people.map((p) => [p.id, p]));
  const deptById = new Map(departments.map((d) => [d.id, d]));

  // ---- which roots belong to which tab ------------------------------------
  const rootsOf = (scope: Scope, filter?: (i: GoalItem) => boolean) =>
    Object.values(items)
      .filter((i) => !i.parent_id && i.scope === scope && (!filter || filter(i)))
      .sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title))
      .map((i) => i.id);

  const companyRoots = rootsOf("company");
  const deptRoots = rootsOf("department", (i) => !deptFilter || i.dept_id === deptFilter);
  // A goal or sub-goal ASSIGNED to a department belongs on this tab whatever
  // scope it was created under — otherwise a company goal handed to Production
  // is invisible to Production, which is the opposite of the point. Roots of
  // scope 'department' are already above, so they are not repeated here.
  const deptAssigned = Object.values(items)
    .filter(
      (i) =>
        i.assignee_type === "department" &&
        i.dept_id &&
        (!deptFilter || i.dept_id === deptFilter) &&
        !(i.scope === "department" && !i.parent_id),
    )
    .sort((a, b) => (a.due_date || "9999").localeCompare(b.due_date || "9999"))
    .map((i) => i.id);
  const personalRoots = rootsOf("personal", (i) => i.assignee_id === me.id);
  // Anything from the OTHER tabs that landed on me — my list should be my
  // whole list. Personal-scope items are excluded outright: they already
  // appear in the tree above, nested under the goal they belong to, and
  // listing them twice reads as duplicated work rather than as one goal.
  const assignedElsewhere = Object.values(items)
    .filter((i) => i.assignee_id === me.id && i.scope !== "personal")
    .sort((a, b) => (a.due_date || "9999").localeCompare(b.due_date || "9999"))
    .map((i) => i.id);

  const visibleRoots =
    tab === "company" ? companyRoots
    : tab === "department" ? deptRoots
    : tab === "mine" ? personalRoots
    : tab === "rocks" ? Object.values(items).filter((i) => !i.parent_id && i.scope === "rock").map((i) => i.id)
    : [];

  const expandAll = () => setExpanded(new Set(branchIds(items, visibleRoots)));
  const collapseAll = () => setExpanded(new Set());
  const toggle = (id: string) =>
    setExpanded((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const ctx: Ctx = {
    data, items, peopleById, deptById, expanded, toggle,
    onEdit: setEditing, post, reload: () => load(period || undefined),
    modeFor: (scope: Scope, item?: GoalItem) =>
      item
        ? editModeFor(item, { id: me.id, department_id: me.department_id, isAdmin: me.isAdmin, canEdit: me.canEdit })
        : scope === "company"
          ? me.isAdmin ? "full" : "none"
          : scope === "personal"
            ? "full"
            : me.isAdmin || me.canEdit ? "full" : "none",
  };

  return (
    <div className="p-4">
      {/* ===== header ===== */}
      <div className="flex items-center gap-3 flex-wrap mb-3">
        <div>
          <div className="text-xs font-bold" style={{ color: C.mute, letterSpacing: 1.4 }}>GOALS · {data.period}</div>
          <div className="text-lg font-bold" style={{ color: C.ink, lineHeight: 1.2 }}>
            What the company is trying to do, and who is doing it
          </div>
        </div>
        <div className="flex-1" style={{ minWidth: 20 }} />
        {data.periods.length > 1 && (
          <select value={period} onChange={(e) => { setPeriod(e.target.value); load(e.target.value); }}
            className="text-xs font-bold border rounded px-2 py-1.5 bg-white" style={{ borderColor: C.line, color: C.sub }}>
            {data.periods.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
        {me.isAdmin && (
          <button onClick={() => setSetupOpen(true)} className="text-xs font-bold rounded px-3 py-1.5"
            style={{ background: "#fff", border: `1px solid ${C.line}`, color: C.sub }}>
            ⚙ Setup
          </button>
        )}
      </div>

      {/* ===== the six tabs, cascading below the header ===== */}
      <div className="flex gap-1 rounded p-1 mb-1 overflow-x-auto" style={{ background: "#fff", border: `1px solid ${C.line}` }}>
        {TABS.map((t) => {
          const on = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="px-3 py-1.5 rounded text-xs font-bold whitespace-nowrap flex-shrink-0"
              style={on ? { background: C.body, color: "#fff" } : { color: C.sub }}>
              <span style={{ marginRight: 5 }}>{t.icon}</span>{t.label}
            </button>
          );
        })}
      </div>
      <div className="text-xs mb-3" style={{ color: C.mute }}>{TAB_NOTE[tab]}</div>

      {/* ===== per-tab toolbar ===== */}
      {["company", "rocks", "department", "mine"].includes(tab) && (
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <button onClick={expandAll} className="text-xs font-bold rounded px-2.5 py-1"
            style={{ background: "#fff", border: `1px solid ${C.line}`, color: C.sub }}>⊞ Expand all</button>
          <button onClick={collapseAll} className="text-xs font-bold rounded px-2.5 py-1"
            style={{ background: "#fff", border: `1px solid ${C.line}`, color: C.sub }}>⊟ Collapse all</button>

          {tab === "department" && (
            <>
              <span style={{ width: 6 }} />
              <button onClick={() => setDeptFilter("")} className="text-xs font-bold rounded px-2 py-1"
                style={!deptFilter ? { background: C.body, color: "#fff" } : { background: "#fff", border: `1px solid ${C.line}`, color: C.sub }}>
                All departments
              </button>
              {departments.map((d) => (
                <button key={d.id} onClick={() => setDeptFilter(d.id)} className="text-xs font-bold rounded px-2 py-1"
                  style={deptFilter === d.id
                    ? { background: d.color, color: "#fff" }
                    : { background: d.color + "1A", color: d.color }}>
                  {d.name}
                </button>
              ))}
            </>
          )}

          {tab === "rocks" && (
            <>
              <span style={{ width: 6 }} />
              <button onClick={() => setQuarter("")} className="text-xs font-bold rounded px-2 py-1"
                style={!quarter ? { background: C.body, color: "#fff" } : { background: "#fff", border: `1px solid ${C.line}`, color: C.sub }}>
                All quarters
              </button>
              {QUARTERS.map((q) => (
                <button key={q} onClick={() => setQuarter(q)} className="text-xs font-bold rounded px-2 py-1"
                  style={quarter === q ? { background: C.accent, color: "#fff" } : { background: "#fff", border: `1px solid ${C.line}`, color: C.sub }}>
                  {q}
                </button>
              ))}
            </>
          )}

          <div className="flex-1" />
          {tab === "company" && (
            me.isAdmin ? (
              <button onClick={() => setEditing({ mode: "new", scope: "company", kind: "goal" })}
                className="text-xs font-bold rounded px-3 py-1.5" style={{ background: C.accent, color: "#fff" }}>
                + New company goal
              </button>
            ) : (
              <Chip color={C.navy} bg="#DCE8F5" title="Company goals are set by an admin. You can read them and work what is assigned to you.">
                🔒 Read only — set by admin
              </Chip>
            )
          )}
          {tab === "department" && ctx.modeFor("department") === "full" && (
            <button onClick={() => setEditing({ mode: "new", scope: "department", kind: "goal", dept_id: deptFilter || null })}
              className="text-xs font-bold rounded px-3 py-1.5" style={{ background: C.accent, color: "#fff" }}>
              + New departmental goal
            </button>
          )}
          {tab === "mine" && (
            <button onClick={() => setEditing({ mode: "new", scope: "personal", kind: "goal", assignee_id: me.id })}
              className="text-xs font-bold rounded px-3 py-1.5" style={{ background: C.accent, color: "#fff" }}>
              + New goal for myself
            </button>
          )}
          {tab === "rocks" && me.isAdmin && (
            <button onClick={() => setEditing({ mode: "rock" })}
              className="text-xs font-bold rounded px-3 py-1.5" style={{ background: C.accent, color: "#fff" }}>
              + New quarterly rock
            </button>
          )}
        </div>
      )}

      {/* ===== tab bodies ===== */}
      {tab === "company" && (
        <TreeList ctx={ctx} roots={companyRoots}
          empty="No company goals for this period yet. An admin sets these — everything else in the section hangs off them." />
      )}

      {tab === "rocks" && (
        <RocksTab ctx={ctx} quarter={quarter} onNewRock={() => setEditing({ mode: "rock" })} />
      )}

      {tab === "department" && (
        <>
          <TreeList ctx={ctx} roots={deptRoots}
            empty={deptFilter ? "No goals were created directly for this department." : "No departmental goals yet."} />
          {deptAssigned.length > 0 && (
            <>
              <div className="text-xs font-bold mt-5 mb-1.5" style={{ color: C.mute, letterSpacing: 1.1 }}>
                ASSIGNED TO A DEPARTMENT FROM ELSEWHERE
              </div>
              <div className="rounded-lg border bg-white" style={{ borderColor: C.line, overflow: "hidden" }}>
                <TreeHead />
                {deptAssigned.map((id, i) => {
                  const n = ctx.items[id];
                  return (
                    <div key={id}>
                      <div className="px-3 pt-1.5" style={{ borderTop: i === 0 ? "none" : `1px solid ${C.line}` }}>
                        <Chip color={C.navy} bg="#DCE8F5">{SCOPE_LABEL[n.scope]}</Chip>
                        <span style={{ marginLeft: 6 }}>
                          <Chip color={ctx.deptById.get(n.dept_id || "")?.color || C.navy}
                            bg={(ctx.deptById.get(n.dept_id || "")?.color || C.navy) + "1A"}>
                            {ctx.deptById.get(n.dept_id || "")?.name}
                          </Chip>
                        </span>
                      </div>
                      <Row ctx={ctx} id={id} depth={0} first />
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {tab === "mine" && (
        <MyGoalsTab ctx={ctx} roots={personalRoots} assigned={assignedElsewhere} />
      )}

      {tab === "kra" && <KraTab ctx={ctx} onEdit={setEditing} />}
      {tab === "kpi" && <KpiTab ctx={ctx} onEdit={setEditing} />}

      {editing && <Editor ctx={ctx} target={editing} onClose={() => setEditing(null)} />}
      {setupOpen && <Setup ctx={ctx} onClose={() => setSetupOpen(false)} />}
    </div>
  );
}

const TAB_NOTE: Record<TabKey, string> = {
  company: "Set by an admin. Everyone else reads them — and works whatever is assigned to them below.",
  rocks: "The named projects for the quarter. Each rock carries its own goals, and those cascade like any other.",
  department: "Goals owned by a department rather than a person. The department's head can edit its own.",
  mine: "Goals you set for yourself, plus everything from anywhere else that carries your name.",
  kra: "The standing areas your role is answerable for. Assigned by an admin; the goals you hold against each one show underneath.",
  kpi: "Measures that reach you — ones you own, your department's, ones you watch, and any measuring a goal of yours.",
};

// ===========================================================================
// Shared context passed down the tree
// ===========================================================================
interface EditTarget {
  mode: "new" | "edit" | "rock" | "rock-edit" | "kra" | "kra-edit" | "kpi" | "kpi-edit";
  id?: string;
  scope?: Scope;
  kind?: Kind;
  parent_id?: string | null;
  rock_id?: string | null;
  dept_id?: string | null;
  assignee_id?: string | null;
  kra_id?: string | null;
}

interface Ctx {
  data: GoalsPayload;
  items: ItemMap;
  peopleById: Map<string, Person>;
  deptById: Map<string, Department>;
  expanded: Set<string>;
  toggle: (id: string) => void;
  onEdit: (t: EditTarget | null) => void;
  /** POST an action, then re-read the whole payload. */
  post: (body: Record<string, unknown>) => Promise<void>;
  /** Re-read without writing — for flows that post more than one action. */
  reload: () => Promise<void>;
  /** How much of an item this viewer may write — see editModeFor(). */
  modeFor: (scope: Scope, item?: GoalItem) => EditMode;
}

// ===========================================================================
// The tree
// ===========================================================================
function TreeList({ ctx, roots, empty }: { ctx: Ctx; roots: string[]; empty: string }) {
  if (!roots.length)
    return (
      <div className="rounded-lg border bg-white p-8 text-center text-sm" style={{ borderColor: C.line, color: C.mute }}>
        {empty}
      </div>
    );
  return (
    <div className="rounded-lg border bg-white" style={{ borderColor: C.line, overflow: "hidden" }}>
      <TreeHead />
      {roots.map((id, i) => <Row key={id} ctx={ctx} id={id} depth={0} first={i === 0} />)}
    </div>
  );
}

function TreeHead() {
  const cell = { fontSize: 10, color: C.mute, fontWeight: 700, letterSpacing: 1 } as const;
  return (
    <div className="flex items-center gap-2 px-3 py-1.5" style={{ background: C.panel, borderBottom: `1px solid ${C.line}` }}>
      <div style={{ ...cell, flex: 1 }}>GOAL · SUB GOAL · INITIATIVE</div>
      <div style={{ ...cell, width: 132 }} className="hidden md:block">ASSIGNED TO</div>
      <div style={{ ...cell, width: 74 }} className="hidden md:block">DUE</div>
      <div style={{ ...cell, width: 150 }} className="hidden lg:block">START → CURRENT → GOAL</div>
      <div style={{ ...cell, width: 116 }}>COMPLETION</div>
      <div style={{ width: 54 }} />
    </div>
  );
}

function Row({ ctx, id, depth, first }: { ctx: Ctx; id: string; depth: number; first?: boolean }) {
  const n = ctx.items[id];
  if (!n) return null;
  const kids = n.kids;
  const open = ctx.expanded.has(id);
  const comp = completionOf(ctx.items, id);
  const roll = rollupOf(ctx.items, id);
  const st = STATUS_META[n.status];
  const late = isLate(n, TODAY);
  const who = assigneeLabel(n, ctx.peopleById, ctx.deptById);
  const mayEdit = ctx.modeFor(n.scope, n) === "full";
  const barColor = comp.model === "done" ? C.green : late ? C.red : st.color === C.mute ? C.navy : st.color;

  return (
    <>
      <div className="flex items-center gap-2 px-3 py-2 group"
        style={{ borderTop: first && depth === 0 ? "none" : `1px solid ${C.line}`, background: depth === 0 ? "#fff" : depth === 1 ? "#FCFBF8" : "#FAF8F4" }}>
        {/* name + caret, indented by depth */}
        <div className="flex items-center gap-1.5 min-w-0" style={{ flex: 1, paddingLeft: depth * 18 }}>
          {kids.length > 0 ? (
            <button onClick={() => ctx.toggle(id)} title={open ? "Collapse" : "Expand"}
              className="rounded flex items-center justify-center flex-shrink-0"
              style={{ width: 16, height: 16, border: `1px solid ${C.line}`, color: C.sub, fontSize: 10, background: "#fff" }}>
              {open ? "−" : "+"}
            </button>
          ) : (
            <span className="flex-shrink-0" style={{ width: 16, textAlign: "center", color: C.faint, fontSize: 10 }}>
              {depth > 0 ? "•" : "·"}
            </span>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <button onClick={() => ctx.onEdit({ mode: "edit", id })}
                className="text-sm font-semibold text-left truncate"
                style={{
                  color: C.ink, maxWidth: 460,
                  textDecoration: n.status === "done" ? "line-through" : "none",
                  opacity: n.status === "done" ? 0.6 : 1,
                }}>
                {n.title || "Untitled"}
              </button>
              {depth > 0 && <Chip color={n.kind === "initiative" ? "#7C3AED" : C.navy} bg={n.kind === "initiative" ? "#F3EDFF" : "#DCE8F5"}>{KIND_LABEL[n.kind]}</Chip>}
              <Chip color={st.color} bg={st.bg}>{st.label}</Chip>
              <BandChips bands={n.bands} all={ctx.data.bands} />
              {n.kpiName && <Chip color={C.green} bg="#E6F4EA" title="Measured by a KPI">📈 {n.kpiName}</Chip>}
              {kids.length > 0 && !open && (() => {
                const c = countBelow(ctx.items, id);
                return <Chip title="Hidden below — expand to see">{c.subgoals} sub · {c.initiatives} init</Chip>;
              })()}
            </div>
            {n.detail && open && (
              <div className="text-xs mt-0.5" style={{ color: C.sub, lineHeight: 1.4, maxWidth: 620 }}>{n.detail}</div>
            )}
          </div>
        </div>

        {/* assignee */}
        <div className="hidden md:flex items-center gap-1.5" style={{ width: 132 }}>
          {n.assignee_type === "department" ? (
            <>
              <Avatar text={ctx.deptById.get(n.dept_id || "")?.code || "DP"} size={20}
                bg={(ctx.deptById.get(n.dept_id || "")?.color || C.navy) + "22"}
                color={ctx.deptById.get(n.dept_id || "")?.color || C.navy} />
              <span className="text-xs truncate" style={{ color: C.sub }}>{who}</span>
            </>
          ) : (
            <>
              <Avatar text={ctx.peopleById.get(n.assignee_id || "")?.initials || who} size={20} />
              <span className="text-xs truncate" style={{ color: C.sub }}>{who}</span>
            </>
          )}
        </div>

        {/* due */}
        <div className="hidden md:block text-xs tnum" style={{ width: 74, color: late ? C.red : C.sub }}>
          {n.due_date ? fmt(n.due_date) : "—"}
        </div>

        {/* the three numbers */}
        <div className="hidden lg:block text-xs tnum" style={{ width: 150, color: C.sub }}>
          {hasMetrics(n) ? (
            <span>
              {n.start_metric} <span style={{ color: C.faint }}>→</span>{" "}
              <b style={{ color: C.accent }}>{n.current_metric}</b> <span style={{ color: C.faint }}>→</span>{" "}
              {n.goal_metric} <span style={{ color: C.mute }}>{n.metric_unit}</span>
            </span>
          ) : (
            <span style={{ color: C.faint }}>{comp.model === "rolled" ? "from below" : "no metric"}</span>
          )}
        </div>

        {/* completion */}
        <div style={{ width: 116 }}>
          <div className="flex items-center gap-1.5">
            <span className="tnum font-bold" style={{ fontSize: 12, color: barColor, width: 34, textAlign: "right" }}>
              {Math.round(comp.pct)}%
            </span>
            <div style={{ flex: 1 }}>
              <Bar pct={comp.pct} color={barColor} ghost={comp.model === "metric" && roll != null ? roll : null} />
            </div>
          </div>
          <div style={{ fontSize: 9, color: C.faint, marginTop: 2 }}>
            {comp.model === "metric" ? "from metrics" : comp.model === "rolled" ? "rolled up" : comp.model === "done" ? "done" : "manual"}
          </div>
        </div>

        {/* actions */}
        <div className="flex items-center gap-1" style={{ width: 54 }}>
          {mayEdit && (
            <button onClick={() => ctx.onEdit({ mode: "new", scope: n.scope, parent_id: id, kind: CHILD_KINDS[n.kind][0], rock_id: n.rock_id })}
              title={`Add a ${KIND_LABEL[CHILD_KINDS[n.kind][0]].toLowerCase()} under this`}
              className="rounded" style={{ width: 22, height: 22, border: `1px solid ${C.line}`, color: C.sub, fontSize: 12, background: "#fff" }}>+</button>
          )}
          <button onClick={() => ctx.onEdit({ mode: "edit", id })} title="Open"
            className="rounded" style={{ width: 22, height: 22, border: `1px solid ${C.line}`, color: C.sub, fontSize: 11, background: "#fff" }}>⋯</button>
        </div>
      </div>

      {open && kids.map((k) => <Row key={k} ctx={ctx} id={k} depth={depth + 1} />)}
    </>
  );
}

// ===========================================================================
// Quarterly Rocks
// ===========================================================================
function RocksTab({ ctx, quarter, onNewRock }: { ctx: Ctx; quarter: string; onNewRock: () => void }) {
  const rocks = ctx.data.rocks.filter((r) => !quarter || r.quarter === quarter);
  if (!rocks.length)
    return (
      <div className="rounded-lg border bg-white p-8 text-center" style={{ borderColor: C.line }}>
        <div className="text-sm mb-2" style={{ color: C.mute }}>
          No rocks for {quarter || "this period"} yet. A rock is a named project for the quarter — the goals under it are what
          make it move.
        </div>
        {ctx.data.me.isAdmin && (
          <button onClick={onNewRock} className="text-xs font-bold rounded px-3 py-1.5" style={{ background: C.accent, color: "#fff" }}>
            + New quarterly rock
          </button>
        )}
      </div>
    );

  return (
    <div className="flex flex-col gap-3">
      {rocks.map((r) => <RockCard key={r.id} ctx={ctx} rock={r} />)}
    </div>
  );
}

function RockCard({ ctx, rock }: { ctx: Ctx; rock: Rock }) {
  const goals = Object.values(ctx.items)
    .filter((i) => i.rock_id === rock.id && !i.parent_id)
    .sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title))
    .map((i) => i.id);

  // A rock is only as far along as the goals under it — computed the same way
  // a goal rolls up its sub-goals.
  const pct = goals.length
    ? goals.reduce((s, g) => s + completionOf(ctx.items, g).pct, 0) / goals.length
    : 0;
  const owner = rock.owner_id ? ctx.peopleById.get(rock.owner_id) : null;
  const dept = rock.dept_id ? ctx.deptById.get(rock.dept_id) : null;
  const st = STATUS_META[rock.status];
  const canEdit = ctx.data.me.isAdmin;

  return (
    <div className="rounded-lg border bg-white" style={{ borderColor: C.line, borderLeft: `4px solid ${rock.color}` }}>
      <div className="flex items-start gap-3 p-3 flex-wrap">
        <div style={{ flex: 1, minWidth: 240 }}>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <Chip color="#fff" bg={rock.color}>{rock.quarter}</Chip>
            <span className="font-bold text-base" style={{ color: C.ink }}>{rock.name}</span>
            <Chip color={st.color} bg={st.bg}>{st.label}</Chip>
            <BandChips bands={rock.bands} all={ctx.data.bands} />
          </div>
          {rock.detail && <div className="text-xs mb-1" style={{ color: C.sub, lineHeight: 1.5, maxWidth: 720 }}>{rock.detail}</div>}
          <div className="flex items-center gap-3 flex-wrap text-xs" style={{ color: C.mute }}>
            {owner && <span className="flex items-center gap-1"><Avatar text={owner.initials || owner.email} size={18} /> {owner.name || owner.email}</span>}
            {dept && <span style={{ color: dept.color }}>● {dept.name}</span>}
            {rock.due_date && <span className="tnum">due {fmtFull(rock.due_date)}</span>}
            <span>{goals.length} goal{goals.length === 1 ? "" : "s"}</span>
          </div>
        </div>
        <div style={{ width: 190 }}>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="tnum font-bold" style={{ fontSize: 22, color: rock.color }}>{Math.round(pct)}%</span>
            <span className="text-xs" style={{ color: C.mute }}>of its goals</span>
          </div>
          <Gauge pct={pct} color={rock.color} seg={18} w={5} h={9} />
        </div>
        <div className="flex gap-1">
          {canEdit && (
            <>
              <button onClick={() => ctx.onEdit({ mode: "new", scope: "rock", kind: "goal", rock_id: rock.id })}
                className="text-xs font-bold rounded px-2 py-1" style={{ background: C.accent, color: "#fff" }}>+ Goal</button>
              <button onClick={() => ctx.onEdit({ mode: "rock-edit", id: rock.id })}
                className="text-xs font-bold rounded px-2 py-1" style={{ background: "#fff", border: `1px solid ${C.line}`, color: C.sub }}>Edit</button>
            </>
          )}
        </div>
      </div>

      {goals.length > 0 && (
        <div style={{ borderTop: `1px solid ${C.line}` }}>
          <TreeHead />
          {goals.map((id, i) => <Row key={id} ctx={ctx} id={id} depth={0} first={i === 0} />)}
        </div>
      )}
      {goals.length === 0 && (
        <div className="px-3 pb-3 text-xs" style={{ color: C.faint }}>
          No goals on this rock yet — a rock with no goals is just a name.
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// My Goals
// ===========================================================================
function MyGoalsTab({ ctx, roots, assigned }: { ctx: Ctx; roots: string[]; assigned: string[] }) {
  const mine = [...roots, ...assigned];
  const overall = mine.length ? mine.reduce((s, id) => s + completionOf(ctx.items, id).pct, 0) / mine.length : 0;
  const overdue = mine.filter((id) => isLate(ctx.items[id], TODAY)).length;

  return (
    <>
      <div className="flex gap-2 flex-wrap mb-3">
        <Stat label="On my name" value={String(mine.length)} note="goals, sub-goals and initiatives" />
        <Stat label="Average completion" value={`${Math.round(overall)}%`} note="across everything assigned to me" color={C.accent} />
        <Stat label="Past their date" value={String(overdue)} note="measured against the first date promised" color={overdue ? C.red : C.green} />
      </div>

      <div className="text-xs font-bold mb-1.5" style={{ color: C.mute, letterSpacing: 1.1 }}>GOALS I SET FOR MYSELF</div>
      <TreeList ctx={ctx} roots={roots} empty="Nothing yet. A personal goal is yours alone — set one and cascade it." />

      <div className="text-xs font-bold mt-5 mb-1.5" style={{ color: C.mute, letterSpacing: 1.1 }}>
        ASSIGNED TO ME FROM ELSEWHERE
      </div>
      {assigned.length === 0 ? (
        <div className="rounded-lg border bg-white p-6 text-center text-sm" style={{ borderColor: C.line, color: C.mute }}>
          Nothing from the company, rock or departmental goals carries your name yet.
        </div>
      ) : (
        <div className="rounded-lg border bg-white" style={{ borderColor: C.line, overflow: "hidden" }}>
          <TreeHead />
          {assigned.map((id, i) => {
            const n = ctx.items[id];
            return (
              <div key={id}>
                <div className="px-3 pt-1.5" style={{ borderTop: i === 0 ? "none" : `1px solid ${C.line}` }}>
                  <Chip color={C.navy} bg="#DCE8F5">{SCOPE_LABEL[n.scope]}</Chip>
                </div>
                <Row ctx={ctx} id={id} depth={0} first />
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function Stat({ label, value, note, color = C.ink }: { label: string; value: string; note: string; color?: string }) {
  return (
    <div className="rounded-lg border bg-white p-3" style={{ borderColor: C.line, flex: "1 1 0", minWidth: 180 }}>
      <div className="text-xs font-bold" style={{ color: C.mute, letterSpacing: 1.1, textTransform: "uppercase" }}>{label}</div>
      <div className="tnum font-bold" style={{ fontSize: 26, color, lineHeight: 1.2 }}>{value}</div>
      <div className="text-xs" style={{ color: C.faint }}>{note}</div>
    </div>
  );
}

// ===========================================================================
// My Key Result Areas
// ===========================================================================
function KraTab({ ctx, onEdit }: { ctx: Ctx; onEdit: (t: EditTarget) => void }) {
  const me = ctx.data.me;
  const [who, setWho] = useState<string>(me.id);
  const canManage = me.isAdmin;
  const list = ctx.data.kras.filter((k) => k.person_id === who).sort((a, b) => a.sort_order - b.sort_order);
  const totalWeight = list.reduce((s, k) => s + (k.weight || 1), 0);

  // A KRA reads whatever the goals filed under it read — that is the point of
  // linking them.
  const goalsFor = (kra: Kra) =>
    Object.values(ctx.items).filter((i) => i.kra_id === kra.id).map((i) => i.id);
  const pctFor = (kra: Kra) => {
    const g = goalsFor(kra);
    if (!g.length) return null;
    return g.reduce((s, id) => s + completionOf(ctx.items, id).pct, 0) / g.length;
  };
  const weighted = list.reduce((s, k) => {
    const p = pctFor(k);
    return s + (p ?? 0) * (k.weight || 1);
  }, 0) / (totalWeight || 1);

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        {canManage && (
          <>
            <span className="text-xs font-bold" style={{ color: C.mute }}>SHOWING</span>
            <select value={who} onChange={(e) => setWho(e.target.value)}
              className="text-xs border rounded px-2 py-1 bg-white font-bold" style={{ borderColor: C.line, color: C.body }}>
              {ctx.data.people.map((p) => (
                <option key={p.id} value={p.id}>{p.name || p.email}{p.id === me.id ? " (me)" : ""}</option>
              ))}
            </select>
          </>
        )}
        <div className="flex-1" />
        {canManage && (
          <button onClick={() => onEdit({ mode: "kra", assignee_id: who })}
            className="text-xs font-bold rounded px-3 py-1.5" style={{ background: C.accent, color: "#fff" }}>
            + New key result area
          </button>
        )}
      </div>

      {list.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-3">
          <Stat label="Key result areas" value={String(list.length)} note="the standing shape of the role" />
          <Stat label="Weighted completion" value={`${Math.round(weighted)}%`} color={C.accent}
            note="each area counted by its weight" />
        </div>
      )}

      {list.length === 0 ? (
        <div className="rounded-lg border bg-white p-8 text-center text-sm" style={{ borderColor: C.line, color: C.mute }}>
          {who === me.id
            ? "No key result areas have been set for you yet. These are assigned by an admin — they describe what your role is answerable for, whether or not there is a goal against them this quarter."
            : "Nothing set for this person yet."}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {list.map((k) => {
            const goals = goalsFor(k);
            const pct = pctFor(k);
            const share = totalWeight ? ((k.weight || 1) / totalWeight) * 100 : 0;
            return (
              <div key={k.id} className="rounded-lg border bg-white p-3" style={{ borderColor: C.line }}>
                <div className="flex items-start gap-3 flex-wrap">
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm" style={{ color: C.ink }}>{k.title}</span>
                      {k.dept_id && (
                        <Chip color={ctx.deptById.get(k.dept_id)?.color || C.navy}
                          bg={(ctx.deptById.get(k.dept_id)?.color || C.navy) + "1A"}>
                          {ctx.deptById.get(k.dept_id)?.name}
                        </Chip>
                      )}
                      <Chip title="This area's share of the role">{Math.round(share)}% of the role</Chip>
                    </div>
                    {k.detail && <div className="text-xs mt-1" style={{ color: C.sub, lineHeight: 1.5 }}>{k.detail}</div>}
                  </div>
                  <div style={{ width: 200 }}>
                    {pct == null ? (
                      <div className="text-xs" style={{ color: C.faint }}>No goals filed under this yet</div>
                    ) : (
                      <>
                        <div className="flex items-baseline gap-2">
                          <span className="tnum font-bold" style={{ fontSize: 20, color: C.accent }}>{Math.round(pct)}%</span>
                          <span className="text-xs" style={{ color: C.mute }}>over {goals.length} goal{goals.length === 1 ? "" : "s"}</span>
                        </div>
                        <Bar pct={pct} color={C.accent} h={7} />
                      </>
                    )}
                  </div>
                  {canManage && (
                    <button onClick={() => onEdit({ mode: "kra-edit", id: k.id })}
                      className="text-xs font-bold rounded px-2 py-1" style={{ background: "#fff", border: `1px solid ${C.line}`, color: C.sub }}>
                      Edit
                    </button>
                  )}
                </div>
                {goals.length > 0 && (
                  <div className="mt-2" style={{ borderTop: `1px solid ${C.line}` }}>
                    {goals.map((id) => <Row key={id} ctx={ctx} id={id} depth={0} first />)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ===========================================================================
// KPIs relevant to me
// ===========================================================================
function KpiTab({ ctx, onEdit }: { ctx: Ctx; onEdit: (t: EditTarget) => void }) {
  const me = ctx.data.me;
  const [showAll, setShowAll] = useState(false);
  const relevant = ctx.data.kpis.filter((k) => showAll || k.why !== "Open to everyone");

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <button onClick={() => setShowAll(!showAll)} className="text-xs font-bold rounded px-2.5 py-1"
          style={showAll ? { background: C.body, color: "#fff" } : { background: "#fff", border: `1px solid ${C.line}`, color: C.sub }}>
          {showAll ? "Showing every KPI I can see" : "Showing only KPIs tied to me"}
        </button>
        <div className="flex-1" />
        {me.isAdmin && (
          <button onClick={() => onEdit({ mode: "kpi" })} className="text-xs font-bold rounded px-3 py-1.5"
            style={{ background: C.accent, color: "#fff" }}>+ New KPI</button>
        )}
      </div>

      {relevant.length === 0 ? (
        <div className="rounded-lg border bg-white p-8 text-center text-sm" style={{ borderColor: C.line, color: C.mute }}>
          No KPIs reach you yet. A KPI reaches you when you own it, when it belongs to your department, when you have been
          added as a watcher, or when it measures a goal assigned to you.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {relevant.map((k) => <KpiCard key={k.id} ctx={ctx} kpi={k} onEdit={onEdit} />)}
        </div>
      )}
    </>
  );
}

function KpiCard({ ctx, kpi, onEdit }: { ctx: Ctx; kpi: Kpi; onEdit: (t: EditTarget) => void }) {
  const me = ctx.data.me;
  const pct = kpiPct(kpi);
  const owner = kpi.owner_id ? ctx.peopleById.get(kpi.owner_id) : null;
  const dept = kpi.dept_id ? ctx.deptById.get(kpi.dept_id) : null;
  const isOwner = kpi.owner_id === me.id;
  const reducing = kpi.start_value != null && kpi.target_value != null && Number(kpi.target_value) < Number(kpi.start_value);
  const linked = Object.values(ctx.items).filter((i) => i.kpi_id === kpi.id);

  const [val, setVal] = useState<string>(kpi.current_value == null ? "" : String(kpi.current_value));
  const [busy, setBusy] = useState(false);
  const dirty = val !== (kpi.current_value == null ? "" : String(kpi.current_value));

  const save = async () => {
    setBusy(true);
    try { await ctx.post({ action: "kpi.update", id: kpi.id, current_value: val === "" ? null : Number(val) }); }
    catch (e) { alert(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="rounded-lg border bg-white p-3" style={{ borderColor: C.line }}>
      <div className="flex items-start gap-3 flex-wrap">
        <div style={{ flex: 1, minWidth: 240 }}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-sm" style={{ color: C.ink }}>{kpi.name}</span>
            <Chip color={C.navy} bg="#DCE8F5" title="Why this KPI appears in your list">{kpi.why}</Chip>
            {kpi.metric_source && <Chip color={C.green} bg="#E6F4EA" title={kpi.liveNote || "Read from the planning data"}>live</Chip>}
            {reducing && <Chip color={C.amber} bg="#FFF7E6" title="The target is below the start — lower is better">reduction</Chip>}
            <BandChips bands={kpi.bands} all={ctx.data.bands} />
          </div>
          {kpi.detail && <div className="text-xs mt-1" style={{ color: C.sub, lineHeight: 1.5 }}>{kpi.detail}</div>}
          <div className="flex items-center gap-3 flex-wrap text-xs mt-1" style={{ color: C.mute }}>
            {owner && <span>owned by {owner.name || owner.email}</span>}
            {dept && <span style={{ color: dept.color }}>● {dept.name}</span>}
            <span>{kpi.cadence}</span>
            {linked.length > 0 && <span>{linked.length} goal{linked.length === 1 ? "" : "s"} measured by it</span>}
            {kpi.liveNote && <span style={{ color: C.green }}>{kpi.liveNote}</span>}
          </div>
        </div>

        <div style={{ width: 260 }}>
          <div className="flex items-end gap-3 mb-1">
            {([["Start", kpi.start_value], ["Current", kpi.current_value], ["Target", kpi.target_value]] as const).map(([l, v], i) => (
              <div key={l}>
                <div style={{ fontSize: 10, color: C.mute }}>{l}</div>
                <div className="tnum font-bold" style={{ fontSize: i === 1 ? 20 : 13, color: i === 1 ? C.accent : C.sub }}>
                  {v == null ? "—" : v}
                </div>
              </div>
            ))}
            <div className="text-xs pb-1" style={{ color: C.mute }}>{kpi.unit}</div>
            <div className="ml-auto tnum font-bold" style={{ fontSize: 18, color: pct == null ? C.faint : C.green }}>
              {pct == null ? "—" : `${Math.round(pct)}%`}
            </div>
          </div>
          <Bar pct={pct ?? 0} color={pct == null ? C.faint : C.green} h={8} />
          {pct == null && <div style={{ fontSize: 10, color: C.faint, marginTop: 3 }}>Needs a start, current and target to compute</div>}
        </div>

        <div className="flex flex-col gap-1" style={{ width: 128 }}>
          {(isOwner || me.isAdmin) && !kpi.metric_source && (
            <div className="flex gap-1">
              <input value={val} onChange={(e) => setVal(e.target.value)} type="number" placeholder="current"
                className="text-xs border rounded px-1.5 py-1 tnum" style={{ borderColor: C.line, width: 74 }} />
              <button onClick={save} disabled={!dirty || busy}
                className="text-xs font-bold rounded px-2"
                style={{ background: dirty ? C.accent : C.panel, color: dirty ? "#fff" : C.faint }}>
                {busy ? "…" : "Log"}
              </button>
            </div>
          )}
          {kpi.metric_source && (
            <div className="text-xs rounded p-1.5" style={{ background: "#E6F4EA", color: C.green, lineHeight: 1.4 }}>
              Read from the planning data. Nobody types this.
            </div>
          )}
          {me.isAdmin && (
            <button onClick={() => onEdit({ mode: "kpi-edit", id: kpi.id })}
              className="text-xs font-bold rounded px-2 py-1" style={{ background: "#fff", border: `1px solid ${C.line}`, color: C.sub }}>
              Edit KPI
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// The editor drawer — goals, rocks, KRAs and KPIs
// ===========================================================================
function Drawer({ title, onClose, children, width = 520 }: {
  title: React.ReactNode; onClose: () => void; children: React.ReactNode; width?: number;
}) {
  return (
    <>
      <div onClick={onClose} className="fixed inset-0" style={{ background: "rgba(13,22,31,0.45)", zIndex: 59 }} />
      <aside className="fixed top-0 right-0 bottom-0 flex flex-col"
        style={{ width: `min(${width}px, 96vw)`, background: "#fff", borderLeft: `1px solid ${C.line}`, zIndex: 60, boxShadow: "-20px 0 50px rgba(0,0,0,.25)" }}>
        <div className="flex items-center gap-2 px-4 py-3 flex-wrap" style={{ borderBottom: `1px solid ${C.line}` }}>
          <div className="flex items-center gap-2 flex-wrap" style={{ flex: 1 }}>{title}</div>
          <button onClick={onClose} className="rounded" style={{ border: `1px solid ${C.line}`, width: 26, height: 26, color: C.mute }}>✕</button>
        </div>
        <div className="overflow-y-auto p-4" style={{ flex: 1 }}>{children}</div>
      </aside>
    </>
  );
}

function Editor({ ctx, target, onClose }: { ctx: Ctx; target: EditTarget; onClose: () => void }) {
  if (target.mode === "rock" || target.mode === "rock-edit") return <RockEditor ctx={ctx} target={target} onClose={onClose} />;
  if (target.mode === "kra" || target.mode === "kra-edit") return <KraEditor ctx={ctx} target={target} onClose={onClose} />;
  if (target.mode === "kpi" || target.mode === "kpi-edit") return <KpiEditor ctx={ctx} target={target} onClose={onClose} />;
  return <GoalEditor ctx={ctx} target={target} onClose={onClose} />;
}

const inputCls = "w-full text-sm border rounded px-2 py-1.5";
const inputStyle = { borderColor: C.line } as const;

function GoalEditor({ ctx, target, onClose }: { ctx: Ctx; target: EditTarget; onClose: () => void }) {
  const isNew = target.mode === "new";
  const existing = target.id ? ctx.items[target.id] : null;
  const parent = target.parent_id ? ctx.items[target.parent_id] : null;
  const scope: Scope = (existing?.scope || target.scope || parent?.scope || "company") as Scope;
  const kind: Kind = (existing?.kind || target.kind || "goal") as Kind;
  const me = ctx.data.me;

  // full = define it · progress = report the number and status · none = read
  const mode = isNew ? ctx.modeFor(scope) : ctx.modeFor(scope, existing || undefined);
  const mayEdit = mode === "full";
  const mayReport = mode !== "none";
  const mayBand = mayEdit && (me.canEdit || me.isAdmin);

  const [f, setF] = useState(() => ({
    title: existing?.title ?? "",
    detail: existing?.detail ?? "",
    assignee_type: existing?.assignee_type ?? (scope === "department" ? "department" : "person"),
    assignee_id: existing?.assignee_id ?? target.assignee_id ?? (scope === "personal" ? me.id : ""),
    dept_id: existing?.dept_id ?? target.dept_id ?? (scope === "department" ? me.department_id ?? "" : ""),
    start_date: existing?.start_date ?? "",
    due_date: existing?.due_date ?? "",
    start_metric: existing?.start_metric ?? "",
    current_metric: existing?.current_metric ?? "",
    goal_metric: existing?.goal_metric ?? "",
    metric_unit: existing?.metric_unit ?? "",
    manual_pct: existing?.manual_pct ?? 0,
    weight: existing?.weight ?? 1,
    status: (existing?.status ?? "not_started") as GoalStatus,
    bands: existing?.bands ?? parent?.bands ?? ["all"],
    kpi_id: existing?.kpi_id ?? "",
    kra_id: existing?.kra_id ?? target.kra_id ?? "",
  }));
  const [busy, setBusy] = useState(false);
  const [comments, setComments] = useState<{ by: string; at: string; body: string }[]>([]);
  const [cmt, setCmt] = useState("");

  useEffect(() => {
    if (!existing) return;
    api.get(`/api/goals-v2/comments?item_id=${existing.id}`).then((r) => setComments(r.comments)).catch(() => {});
  }, [existing]);

  const set = (k: string, v: unknown) => setF((p) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!f.title.trim()) { alert("Give it a name first."); return; }
    setBusy(true);
    try {
      // Progress-only: send only what may move. The API discards the rest
      // anyway, but posting the whole record and relying on that is how a
      // "why did my target change" bug gets written.
      if (!mayEdit && existing) {
        await ctx.post({
          action: "item.update", id: existing.id,
          current_metric: f.current_metric, status: f.status, manual_pct: Number(f.manual_pct) || 0,
        });
        onClose();
        return;
      }
      const payload: Record<string, unknown> = {
        title: f.title, detail: f.detail,
        assignee_type: f.assignee_type,
        assignee_id: f.assignee_type === "person" ? f.assignee_id || null : null,
        dept_id: f.dept_id || null,
        start_date: f.start_date || null, due_date: f.due_date || null,
        start_metric: f.start_metric, current_metric: f.current_metric, goal_metric: f.goal_metric,
        metric_unit: f.metric_unit, manual_pct: Number(f.manual_pct) || 0, weight: Number(f.weight) || 1,
        status: f.status,
        kpi_id: f.kpi_id || null, kra_id: f.kra_id || null,
      };
      if (mayBand) payload.bands = f.bands;
      if (isNew) {
        await ctx.post({
          ...payload, action: "item.create", scope, kind,
          parent_id: target.parent_id || null, rock_id: target.rock_id || null,
          period: ctx.data.period,
        });
      } else {
        await ctx.post({ ...payload, action: "item.update", id: existing!.id });
      }
      onClose();
    } catch (e) { alert(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    if (!existing) return;
    const below = descendants(ctx.items, existing.id).length;
    if (!window.confirm(`Delete "${existing.title}"?${below ? `\n\n${below} item${below === 1 ? "" : "s"} below it go too.` : ""}\n\nThis cannot be undone.`)) return;
    await ctx.post({ action: "item.delete", id: existing.id });
    onClose();
  };

  const postComment = async () => {
    if (!cmt.trim() || !existing) return;
    await api.post("/api/goals-v2", { action: "comment.add", id: existing.id, body: cmt.trim() });
    setCmt("");
    const r = await api.get(`/api/goals-v2/comments?item_id=${existing.id}`);
    setComments(r.comments);
  };

  return (
    <Drawer width={560} onClose={onClose} title={
      <>
        <Chip color={C.accent} bg="#FFF3E8">{KIND_LABEL[kind]}</Chip>
        <Chip color={C.navy} bg="#DCE8F5">{SCOPE_LABEL[scope]}</Chip>
        {parent && <span className="text-xs truncate" style={{ color: C.mute, maxWidth: 220 }}>under “{parent.title}”</span>}
        {mode === "none" && <Chip color={C.navy} bg="#DCE8F5">🔒 read only</Chip>}
        {mode === "progress" && <Chip color={C.amber} bg="#FFF7E6">✎ progress only</Chip>}
      </>
    }>
      {mode === "progress" && (
        <div className="text-xs rounded p-2 mb-3" style={{ background: "#FFF7E6", color: C.amber, lineHeight: 1.5 }}>
          This is a <b>company goal</b> — an admin sets what it is, what it is worth and who it belongs to. It is on your
          name, so the two things you can move are the <b>current metric</b> and the <b>status</b>. Everything else is
          locked, and a comment is the place to say why the number is where it is.
        </div>
      )}
      {mode === "none" && (
        <div className="text-xs rounded p-2 mb-3" style={{ background: "#DCE8F5", color: C.navy, lineHeight: 1.5 }}>
          {scope === "company"
            ? "Company goals are set by an admin. You can read this one, and work whatever sits under it with your name on."
            : "This one isn't yours to change."}
        </div>
      )}

      <Label>Name</Label>
      <input value={f.title} onChange={(e) => set("title", e.target.value)} disabled={!mayEdit}
        className={inputCls} style={inputStyle} placeholder={`What is the ${KIND_LABEL[kind].toLowerCase()}?`} />

      <Label>Detail</Label>
      <textarea value={f.detail} onChange={(e) => set("detail", e.target.value)} rows={3} disabled={!mayEdit}
        className="w-full text-xs border rounded px-2 py-1.5" style={inputStyle} placeholder="How it gets done, and what it depends on." />

      {/* ---- assigned to: the radio button ---- */}
      <Label>Assigned to</Label>
      <div className="flex gap-4 mb-1.5">
        {(["person", "department"] as const).map((t) => (
          <label key={t} className="flex items-center gap-1.5 text-sm cursor-pointer" style={{ color: C.body }}>
            <input type="radio" name="assignee_type" checked={f.assignee_type === t} disabled={!mayEdit}
              onChange={() => set("assignee_type", t)} />
            {t === "person" ? "A person" : "A department"}
          </label>
        ))}
      </div>
      {f.assignee_type === "person" ? (
        <select value={f.assignee_id} onChange={(e) => set("assignee_id", e.target.value)} disabled={!mayEdit}
          className={inputCls + " bg-white"} style={inputStyle}>
          <option value="">— nobody yet —</option>
          {ctx.data.people.map((p) => (
            <option key={p.id} value={p.id}>{p.name || p.email}{p.id === me.id ? " (me)" : ""}</option>
          ))}
        </select>
      ) : (
        <select value={f.dept_id} onChange={(e) => set("dept_id", e.target.value)} disabled={!mayEdit}
          className={inputCls + " bg-white"} style={inputStyle}>
          <option value="">— no department yet —</option>
          {ctx.data.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      )}

      <div className="flex gap-2">
        <div style={{ flex: 1 }}>
          <Label>Start date</Label>
          <input type="date" value={f.start_date || ""} onChange={(e) => set("start_date", e.target.value)} disabled={!mayEdit}
            className="w-full text-xs border rounded px-2 py-1.5" style={inputStyle} />
        </div>
        <div style={{ flex: 1 }}>
          <Label>Due date</Label>
          <input type="date" value={f.due_date || ""} onChange={(e) => set("due_date", e.target.value)} disabled={!mayEdit}
            className="w-full text-xs border rounded px-2 py-1.5" style={inputStyle} />
        </div>
      </div>
      {existing?.original_due && existing.due_date && existing.original_due !== existing.due_date && (
        <div className="text-xs mt-1" style={{ color: C.amber }}>
          First promised {fmtFull(existing.original_due)} · moved {existing.push_count} time{existing.push_count === 1 ? "" : "s"}
        </div>
      )}

      {/* ---- the metrics, and what they decide ---- */}
      <MetricPanel
        ctx={ctx} f={f} set={set} disabled={!mayEdit} currentEditable={mayReport}
        existing={existing} kind={kind}
      />

      <div className="flex gap-2">
        <div style={{ flex: 1 }}>
          <Label>Status</Label>
          <select value={f.status} onChange={(e) => set("status", e.target.value as GoalStatus)} disabled={!mayReport}
            className="w-full text-xs border rounded px-2 py-1.5 bg-white" style={inputStyle}>
            {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
          </select>
        </div>
        <div style={{ width: 110 }}>
          <Label>Weight</Label>
          <input type="number" step="0.5" min="0" value={f.weight} onChange={(e) => set("weight", e.target.value)} disabled={!mayEdit}
            className="w-full text-xs border rounded px-2 py-1.5 tnum" style={inputStyle} title="How much this counts in its parent's roll-up" />
        </div>
      </div>

      {/* ---- visibility bands ---- */}
      <Label>Visible to</Label>
      <div className="flex gap-1.5 flex-wrap">
        {ctx.data.bands.map((b) => {
          const on = f.bands.includes(b.code);
          return (
            <button key={b.code} disabled={!mayBand} title={b.note || undefined}
              onClick={() => set("bands", on ? f.bands.filter((x: string) => x !== b.code) : [...f.bands, b.code])}
              className="text-xs font-bold rounded px-2.5 py-1"
              style={on
                ? { background: bandColor[b.code] || C.body, color: "#fff" }
                : { background: "#fff", border: `1px solid ${C.line}`, color: C.mute, opacity: mayBand ? 1 : 0.6 }}>
              {b.label}
            </button>
          );
        })}
      </div>
      <div className="text-xs mt-1" style={{ color: C.mute, lineHeight: 1.5 }}>
        {f.bands.includes("all")
          ? "Open — everyone with Goals access sees this."
          : `Hidden from everyone except ${f.bands.map((b: string) => ctx.data.bands.find((x) => x.code === b)?.label ?? b).join(", ")}, the person it is assigned to, and admins. Anything below it is hidden too.`}
      </div>

      {/* ---- links ---- */}
      <Label>Measured by a KPI (optional)</Label>
      <select value={f.kpi_id} onChange={(e) => set("kpi_id", e.target.value)} disabled={!mayEdit}
        className="w-full text-xs border rounded px-2 py-1.5 bg-white" style={inputStyle}>
        <option value="">— not tied to a KPI —</option>
        {ctx.data.kpis.map((k) => <option key={k.id} value={k.id}>{k.name}{k.unit ? ` (${k.unit})` : ""}</option>)}
      </select>

      {ctx.data.kras.length > 0 && (
        <>
          <Label>Files under a key result area (optional)</Label>
          <select value={f.kra_id} onChange={(e) => set("kra_id", e.target.value)} disabled={!mayEdit}
            className="w-full text-xs border rounded px-2 py-1.5 bg-white" style={inputStyle}>
            <option value="">— not filed —</option>
            {ctx.data.kras
              .filter((k) => !f.assignee_id || k.person_id === f.assignee_id)
              .map((k) => <option key={k.id} value={k.id}>{k.title}</option>)}
          </select>
        </>
      )}

      {mayReport && (
        <div className="flex gap-2 pt-4">
          <button onClick={save} disabled={busy} className="text-sm font-bold rounded py-2"
            style={{ background: C.accent, color: "#fff", flex: 1, opacity: busy ? 0.6 : 1 }}>
            {busy ? "Saving…" : isNew ? `Create ${KIND_LABEL[kind].toLowerCase()}` : mayEdit ? "Save" : "Save progress"}
          </button>
          {!isNew && mayEdit && (
            <button onClick={remove} className="text-sm font-bold rounded px-3" style={{ background: "#FBEDEA", color: C.red }}>
              Delete
            </button>
          )}
        </div>
      )}

      {/* ---- cascade + comments, on an existing node ---- */}
      {existing && (
        <>
          {mayEdit && (
            <div className="flex gap-2 mt-5">
              {CHILD_KINDS[existing.kind].map((k) => (
                <button key={k}
                  onClick={() => ctx.onEdit({ mode: "new", scope: existing.scope, parent_id: existing.id, kind: k, rock_id: existing.rock_id })}
                  className="text-xs font-bold rounded py-2" style={{ flex: 1, border: `1px dashed #D9D6CD`, color: C.sub }}>
                  + Add {KIND_LABEL[k].toLowerCase()}
                </button>
              ))}
            </div>
          )}

          <Label>Comments · {comments.length}</Label>
          {comments.length === 0 && (
            <div className="text-xs mb-2" style={{ color: C.faint, lineHeight: 1.5 }}>
              Nothing recorded yet. Comments stay readable after this closes — they are how the number moved.
            </div>
          )}
          {comments.map((c, i) => (
            <div key={i} className="flex gap-2 mb-2">
              <Avatar text={c.by} size={20} />
              <div>
                <div className="text-xs tnum" style={{ color: C.mute }}>
                  {new Date(c.at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} · {c.by}
                </div>
                <div className="text-xs" style={{ color: C.sub, lineHeight: 1.45 }}>{c.body}</div>
              </div>
            </div>
          ))}
          <div className="flex gap-1 mt-2">
            <input value={cmt} onChange={(e) => setCmt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && postComment()}
              placeholder="Add a comment" className="flex-1 text-xs border rounded px-2 py-1.5" style={inputStyle} />
            <button onClick={postComment} className="text-xs font-bold rounded px-3" style={{ background: C.accent, color: "#fff" }}>Post</button>
          </div>
        </>
      )}
    </Drawer>
  );
}

// ===========================================================================
// THE ADD-ON: completion decided by the metrics
// ===========================================================================
/**
 * The three numbers, and what they produce — live, as they are typed.
 *
 * Everything here is one formula: (current − start) ÷ (goal − start). The panel
 * exists because that formula quietly answers three questions people usually
 * argue about — is a reduction goal progressing, is "80% done" the work or the
 * number, and does a parent agree with its children.
 */
function MetricPanel({ ctx, f, set, disabled, currentEditable, existing, kind }: {
  ctx: Ctx;
  f: Record<string, any>;
  set: (k: string, v: unknown) => void;
  /** true when the DEFINITION is locked — start and goal metric, the unit. */
  disabled: boolean;
  /** true when this caller may at least report where the number has got to. */
  currentEditable: boolean;
  existing: GoalItem | null;
  kind: Kind;
}) {
  const s = f.start_metric === "" || f.start_metric == null ? null : Number(f.start_metric);
  const c = f.current_metric === "" || f.current_metric == null ? null : Number(f.current_metric);
  const g = f.goal_metric === "" || f.goal_metric == null ? null : Number(f.goal_metric);
  const complete = s != null && c != null && g != null && g !== s;
  const pct = complete ? metricPct(s, c, g) : null;
  const reducing = complete && g < s;

  // what the items below say, when there are any — shown alongside so a
  // measured parent and its unfinished children can be seen to disagree
  const roll = existing ? rollupOf(ctx.items, existing.id) : null;
  const kidCount = existing ? existing.kids.length : 0;

  // "what if" — drag the current number without saving anything
  const [probe, setProbe] = useState<number | null>(null);
  useEffect(() => { setProbe(null); }, [f.start_metric, f.goal_metric]);
  const probePct = complete && probe != null ? metricPct(s!, probe, g!) : null;

  const model = complete ? "metric" : kidCount ? "rolled" : "manual";

  return (
    <div className="rounded-lg p-3 mt-3" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="text-xs font-bold" style={{ color: C.mute, letterSpacing: 1.1 }}>COMPLETION</div>
        <Chip color={model === "metric" ? C.green : model === "rolled" ? C.navy : C.mute}
          bg={model === "metric" ? "#E6F4EA" : model === "rolled" ? "#DCE8F5" : "#fff"}>
          {model === "metric" ? "decided by the metrics" : model === "rolled" ? "rolled up from below" : "entered by hand"}
        </Chip>
        {reducing && <Chip color={C.amber} bg="#FFF7E6" title="The goal is below the start — lower is better">reduction goal</Chip>}
      </div>

      {/* the three numbers */}
      <div className="flex gap-2 mt-2">
        {([
          ["start_metric", "Start metric", "where it was"],
          ["current_metric", "Current metric", "where it is"],
          ["goal_metric", "Goal metric", "where it must get to"],
        ] as const).map(([k, l, hint]) => (
          <div key={k} style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: C.mute, fontWeight: 700 }}>{l.toUpperCase()}</div>
            <input type="number" value={f[k]}
              disabled={k === "current_metric" ? !currentEditable : disabled}
              onChange={(e) => set(k, e.target.value)}
              className="w-full text-sm border rounded px-2 py-1.5 tnum bg-white"
              style={{ borderColor: k === "current_metric" ? C.accent : C.line, fontWeight: k === "current_metric" ? 700 : 400 }} />
            <div style={{ fontSize: 10, color: C.faint }}>{hint}</div>
          </div>
        ))}
        <div style={{ width: 66 }}>
          <div style={{ fontSize: 10, color: C.mute, fontWeight: 700 }}>UNIT</div>
          <input value={f.metric_unit} disabled={disabled} onChange={(e) => set("metric_unit", e.target.value)}
            placeholder="%, ₹ Cr" className="w-full text-sm border rounded px-2 py-1.5 bg-white" style={inputStyle} />
        </div>
      </div>

      {/* the result */}
      {complete ? (
        <>
          <div className="flex items-baseline gap-2 mt-3">
            <span className="tnum font-bold" style={{ fontSize: 30, lineHeight: 1, color: C.accent }}>{Math.round(pct!)}%</span>
            <span className="text-xs tnum" style={{ color: C.sub }}>
              ({fmtN(c!)} − {fmtN(s!)}) ÷ ({fmtN(g!)} − {fmtN(s!)})
            </span>
          </div>
          <div className="mt-1.5"><Bar pct={pct!} color={C.accent} h={10} ghost={roll} /></div>
          <div className="text-xs mt-1.5" style={{ color: C.sub, lineHeight: 1.5 }}>
            {reducing
              ? `A reduction: down from ${fmtN(s!)}${f.metric_unit ? " " + f.metric_unit : ""} towards ${fmtN(g!)}. Both differences are negative, so the same formula reads it correctly — there is no direction to set.`
              : `Up from ${fmtN(s!)}${f.metric_unit ? " " + f.metric_unit : ""} towards ${fmtN(g!)}.`}
          </div>
          <div className="text-xs mt-1" style={{ color: C.mute, lineHeight: 1.5 }}>
            This percentage is computed. Nobody can type it, and it moves the moment the current metric does — including
            everything above this in the tree.
          </div>

          {/* what-if */}
          {currentEditable && (
            <div className="mt-2.5 rounded p-2" style={{ background: "#fff", border: `1px solid ${C.line}` }}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold" style={{ color: C.mute, letterSpacing: 1 }}>WHAT IF</span>
                <span className="text-xs tnum" style={{ color: C.sub }}>
                  at <b style={{ color: C.navy }}>{fmtN(probe ?? c!)}</b>{f.metric_unit ? ` ${f.metric_unit}` : ""} → <b style={{ color: C.navy }}>{Math.round(probePct ?? pct!)}%</b>
                </span>
              </div>
              <input type="range" className="w-full" min={Math.min(s!, g!)} max={Math.max(s!, g!)}
                step={(Math.abs(g! - s!) || 1) / 100} value={probe ?? c!}
                onChange={(e) => setProbe(Number(e.target.value))} />
              <div className="flex justify-between" style={{ fontSize: 10, color: C.faint }}>
                <span>{fmtN(Math.min(s!, g!))}</span>
                <span>drag to see what a reading would score — nothing is saved</span>
                <span>{fmtN(Math.max(s!, g!))}</span>
              </div>
              {probe != null && (
                <button onClick={() => { set("current_metric", String(probe)); setProbe(null); }}
                  className="text-xs font-bold rounded px-2 py-1 mt-1" style={{ background: C.navy, color: "#fff" }}>
                  Use {fmtN(probe)} as the current metric
                </button>
              )}
            </div>
          )}

          {kidCount > 0 && roll != null && (
            <div className="text-xs mt-2 rounded p-2" style={{ background: "#DCE8F5", color: C.navy, lineHeight: 1.5 }}>
              The {kidCount} item{kidCount === 1 ? "" : "s"} below average <b>{Math.round(roll)}%</b> — marked on the bar.
              The metric still wins: the items below are how the number moves, the number is whether it moved.
              {Math.abs(roll - pct!) > 20 && <> That gap is worth a comment.</>}
            </div>
          )}
        </>
      ) : kidCount > 0 ? (
        <div className="mt-2">
          <div className="flex items-baseline gap-2">
            <span className="tnum font-bold" style={{ fontSize: 26, color: C.navy }}>{Math.round(roll ?? 0)}%</span>
            <span className="text-xs" style={{ color: C.sub }}>
              weighted average of the {kidCount} item{kidCount === 1 ? "" : "s"} below
            </span>
          </div>
          <div className="mt-1"><Bar pct={roll ?? 0} color={C.navy} h={9} /></div>
          <div className="text-xs mt-1.5" style={{ color: C.mute, lineHeight: 1.5 }}>
            Fill in all three metrics and this {KIND_LABEL[kind].toLowerCase()} starts reading its own number instead of
            its children&apos;s.
          </div>
        </div>
      ) : (
        <div className="mt-2">
          <div className="flex items-center gap-2">
            <input type="number" min={0} max={100} value={f.manual_pct} disabled={!currentEditable}
              onChange={(e) => set("manual_pct", e.target.value)}
              className="text-sm border rounded px-2 py-1.5 tnum bg-white" style={{ ...inputStyle, width: 90 }} />
            <span className="text-xs" style={{ color: C.mute }}>% — entered by hand, because there is nothing to compute from</span>
          </div>
          <div className="mt-1.5"><Bar pct={Number(f.manual_pct) || 0} color={C.mute} h={9} /></div>
          <div className="text-xs mt-1.5" style={{ color: C.mute, lineHeight: 1.5 }}>
            A typed percentage is a guess. Give it a start, a current and a goal number — or add sub-goals underneath —
            and it computes itself from then on.
          </div>
        </div>
      )}
    </div>
  );
}

const fmtN = (v: number) => (Number.isInteger(v) ? String(v) : String(Number(v.toFixed(2))));

// ===========================================================================
// Rock / KRA / KPI editors
// ===========================================================================
function BandPicker({ bands, value, onChange, disabled }: {
  bands: { code: string; label: string; note: string | null }[];
  value: string[]; onChange: (v: string[]) => void; disabled?: boolean;
}) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {bands.map((b) => {
        const on = value.includes(b.code);
        return (
          <button key={b.code} disabled={disabled} title={b.note || undefined}
            onClick={() => onChange(on ? value.filter((x) => x !== b.code) : [...value, b.code])}
            className="text-xs font-bold rounded px-2.5 py-1"
            style={on ? { background: bandColor[b.code] || C.body, color: "#fff" } : { background: "#fff", border: `1px solid ${C.line}`, color: C.mute }}>
            {b.label}
          </button>
        );
      })}
    </div>
  );
}

function RockEditor({ ctx, target, onClose }: { ctx: Ctx; target: EditTarget; onClose: () => void }) {
  const r = target.id ? ctx.data.rocks.find((x) => x.id === target.id) : null;
  const [f, setF] = useState({
    name: r?.name ?? "", detail: r?.detail ?? "", quarter: r?.quarter ?? "Q1",
    owner_id: r?.owner_id ?? "", dept_id: r?.dept_id ?? "",
    start_date: r?.start_date ?? "", due_date: r?.due_date ?? "",
    status: (r?.status ?? "not_started") as GoalStatus,
    bands: r?.bands ?? ["all"], color: r?.color ?? "#E8600A",
  });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: unknown) => setF((p) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!f.name.trim()) { alert("Name the rock first."); return; }
    setBusy(true);
    try {
      await ctx.post({ ...f, action: r ? "rock.update" : "rock.create", id: r?.id, period: ctx.data.period });
      onClose();
    } catch (e) { alert(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <Drawer onClose={onClose} title={<Chip color={C.accent} bg="#FFF3E8">{r ? "Edit rock" : "New quarterly rock"}</Chip>}>
      <div className="text-xs mb-3" style={{ color: C.sub, lineHeight: 1.5 }}>
        A rock is a named project for the quarter. It has no metric of its own — it reads whatever the goals under it read.
      </div>

      <Label>Name</Label>
      <input value={f.name} onChange={(e) => set("name", e.target.value)} className={inputCls} style={inputStyle}
        placeholder="e.g. Single-piece flow on the tow tractor line" />

      <Label>What it is</Label>
      <textarea value={f.detail} onChange={(e) => set("detail", e.target.value)} rows={3}
        className="w-full text-xs border rounded px-2 py-1.5" style={inputStyle} />

      <div className="flex gap-2">
        <div style={{ width: 90 }}>
          <Label>Quarter</Label>
          <select value={f.quarter} onChange={(e) => set("quarter", e.target.value)} className="w-full text-xs border rounded px-2 py-1.5 bg-white" style={inputStyle}>
            {QUARTERS.map((q) => <option key={q} value={q}>{q}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <Label>Owner</Label>
          <select value={f.owner_id} onChange={(e) => set("owner_id", e.target.value)} className="w-full text-xs border rounded px-2 py-1.5 bg-white" style={inputStyle}>
            <option value="">— nobody yet —</option>
            {ctx.data.people.map((p) => <option key={p.id} value={p.id}>{p.name || p.email}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <Label>Department</Label>
          <select value={f.dept_id} onChange={(e) => set("dept_id", e.target.value)} className="w-full text-xs border rounded px-2 py-1.5 bg-white" style={inputStyle}>
            <option value="">— none —</option>
            {ctx.data.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
      </div>

      <div className="flex gap-2">
        <div style={{ flex: 1 }}><Label>Starts</Label>
          <input type="date" value={f.start_date || ""} onChange={(e) => set("start_date", e.target.value)} className="w-full text-xs border rounded px-2 py-1.5" style={inputStyle} /></div>
        <div style={{ flex: 1 }}><Label>Due</Label>
          <input type="date" value={f.due_date || ""} onChange={(e) => set("due_date", e.target.value)} className="w-full text-xs border rounded px-2 py-1.5" style={inputStyle} /></div>
        <div style={{ width: 130 }}><Label>Status</Label>
          <select value={f.status} onChange={(e) => set("status", e.target.value as GoalStatus)} className="w-full text-xs border rounded px-2 py-1.5 bg-white" style={inputStyle}>
            {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
          </select></div>
      </div>

      <Label>Visible to</Label>
      <BandPicker bands={ctx.data.bands} value={f.bands} onChange={(v) => set("bands", v)} />

      <Label>Colour</Label>
      <input type="color" value={f.color} onChange={(e) => set("color", e.target.value)}
        style={{ width: 56, height: 30, border: `1px solid ${C.line}`, borderRadius: 4, background: "#fff" }} />

      <div className="flex gap-2 pt-4">
        <button onClick={save} disabled={busy} className="text-sm font-bold rounded py-2" style={{ background: C.accent, color: "#fff", flex: 1 }}>
          {busy ? "Saving…" : r ? "Save rock" : "Create rock"}
        </button>
        {r && (
          <button onClick={async () => {
            if (!window.confirm(`Delete the rock "${r.name}"?\n\nEvery goal under it goes too.`)) return;
            await ctx.post({ action: "rock.delete", id: r.id });
            onClose();
          }} className="text-sm font-bold rounded px-3" style={{ background: "#FBEDEA", color: C.red }}>Delete</button>
        )}
      </div>
    </Drawer>
  );
}

function KraEditor({ ctx, target, onClose }: { ctx: Ctx; target: EditTarget; onClose: () => void }) {
  const k = target.id ? ctx.data.kras.find((x) => x.id === target.id) : null;
  const [f, setF] = useState({
    person_id: k?.person_id ?? target.assignee_id ?? ctx.data.me.id,
    dept_id: k?.dept_id ?? "", title: k?.title ?? "", detail: k?.detail ?? "", weight: k?.weight ?? 1,
  });
  const [busy, setBusy] = useState(false);
  const set = (key: string, v: unknown) => setF((p) => ({ ...p, [key]: v }));

  const save = async () => {
    if (!f.title.trim()) { alert("Name the area first."); return; }
    setBusy(true);
    try { await ctx.post({ ...f, action: k ? "kra.update" : "kra.create", id: k?.id }); onClose(); }
    catch (e) { alert(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <Drawer onClose={onClose} title={<Chip color={C.accent} bg="#FFF3E8">{k ? "Edit key result area" : "New key result area"}</Chip>}>
      <div className="text-xs mb-3" style={{ color: C.sub, lineHeight: 1.5 }}>
        A key result area is what a role is permanently answerable for — it outlives any one quarter&apos;s goals. Goals get
        filed under one, and the area then reads whatever they read.
      </div>

      <Label>Whose area</Label>
      <select value={f.person_id} onChange={(e) => set("person_id", e.target.value)} className={inputCls + " bg-white"} style={inputStyle}>
        {ctx.data.people.map((p) => <option key={p.id} value={p.id}>{p.name || p.email}</option>)}
      </select>

      <Label>Area</Label>
      <input value={f.title} onChange={(e) => set("title", e.target.value)} className={inputCls} style={inputStyle}
        placeholder="e.g. On-time delivery of the tow tractor line" />

      <Label>What it covers</Label>
      <textarea value={f.detail} onChange={(e) => set("detail", e.target.value)} rows={3}
        className="w-full text-xs border rounded px-2 py-1.5" style={inputStyle} />

      <div className="flex gap-2">
        <div style={{ flex: 1 }}>
          <Label>Department</Label>
          <select value={f.dept_id} onChange={(e) => set("dept_id", e.target.value)} className="w-full text-xs border rounded px-2 py-1.5 bg-white" style={inputStyle}>
            <option value="">— none —</option>
            {ctx.data.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div style={{ width: 130 }}>
          <Label>Weight</Label>
          <input type="number" step="0.5" min="0" value={f.weight} onChange={(e) => set("weight", e.target.value)}
            className="w-full text-xs border rounded px-2 py-1.5 tnum" style={inputStyle} title="Share of the role" />
        </div>
      </div>

      <div className="flex gap-2 pt-4">
        <button onClick={save} disabled={busy} className="text-sm font-bold rounded py-2" style={{ background: C.accent, color: "#fff", flex: 1 }}>
          {busy ? "Saving…" : k ? "Save area" : "Create area"}
        </button>
        {k && (
          <button onClick={async () => {
            if (!window.confirm(`Delete "${k.title}"?\n\nGoals filed under it stay, but stop being filed.`)) return;
            await ctx.post({ action: "kra.delete", id: k.id });
            onClose();
          }} className="text-sm font-bold rounded px-3" style={{ background: "#FBEDEA", color: C.red }}>Delete</button>
        )}
      </div>
    </Drawer>
  );
}

function KpiEditor({ ctx, target, onClose }: { ctx: Ctx; target: EditTarget; onClose: () => void }) {
  const k = target.id ? ctx.data.kpis.find((x) => x.id === target.id) : null;
  const [f, setF] = useState({
    name: k?.name ?? "", detail: k?.detail ?? "", unit: k?.unit ?? "",
    owner_id: k?.owner_id ?? "", dept_id: k?.dept_id ?? "",
    start_value: k?.start_value ?? "", current_value: k?.current_value ?? "", target_value: k?.target_value ?? "",
    metric_source: k?.metric_source ?? "", cadence: k?.cadence ?? "monthly",
    bands: k?.bands ?? ["all"],
  });
  const [watchers, setWatchers] = useState<string[]>(k?.watchers ?? []);
  const [busy, setBusy] = useState(false);
  const set = (key: string, v: unknown) => setF((p) => ({ ...p, [key]: v }));

  const s = f.start_value === "" ? null : Number(f.start_value);
  const c = f.current_value === "" ? null : Number(f.current_value);
  const g = f.target_value === "" ? null : Number(f.target_value);
  const pct = s != null && c != null && g != null && g !== s ? metricPct(s, c, g) : null;

  const save = async () => {
    if (!f.name.trim()) { alert("Name the KPI first."); return; }
    setBusy(true);
    try {
      // two writes, one reload — the KPI itself, then who else it reaches
      const r = await api.post("/api/goals-v2", { ...f, action: k ? "kpi.update" : "kpi.create", id: k?.id });
      const id = k?.id || r?.id;
      if (id) await api.post("/api/goals-v2", { action: "kpi.watchers", id, person_ids: watchers });
      await ctx.reload();
      onClose();
    } catch (e) { alert(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <Drawer onClose={onClose} title={<Chip color={C.accent} bg="#FFF3E8">{k ? "Edit KPI" : "New KPI"}</Chip>}>
      <Label>Name</Label>
      <input value={f.name} onChange={(e) => set("name", e.target.value)} className={inputCls} style={inputStyle}
        placeholder="e.g. On-time delivery" />

      <Label>What it measures</Label>
      <textarea value={f.detail} onChange={(e) => set("detail", e.target.value)} rows={2}
        className="w-full text-xs border rounded px-2 py-1.5" style={inputStyle} />

      <div className="flex gap-2">
        <div style={{ flex: 1 }}><Label>Owner</Label>
          <select value={f.owner_id} onChange={(e) => set("owner_id", e.target.value)} className="w-full text-xs border rounded px-2 py-1.5 bg-white" style={inputStyle}>
            <option value="">— none —</option>
            {ctx.data.people.map((p) => <option key={p.id} value={p.id}>{p.name || p.email}</option>)}
          </select></div>
        <div style={{ flex: 1 }}><Label>Department</Label>
          <select value={f.dept_id} onChange={(e) => set("dept_id", e.target.value)} className="w-full text-xs border rounded px-2 py-1.5 bg-white" style={inputStyle}>
            <option value="">— none —</option>
            {ctx.data.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select></div>
      </div>

      <Label>The numbers</Label>
      <div className="flex gap-2">
        {([["start_value", "Start"], ["current_value", "Current"], ["target_value", "Target"]] as const).map(([key, l]) => (
          <div key={key} style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: C.mute }}>{l}</div>
            <input type="number" value={f[key] as any} onChange={(e) => set(key, e.target.value)}
              disabled={key === "current_value" && !!f.metric_source}
              className="w-full text-sm border rounded px-2 py-1.5 tnum" style={inputStyle} />
          </div>
        ))}
        <div style={{ width: 70 }}>
          <div style={{ fontSize: 10, color: C.mute }}>Unit</div>
          <input value={f.unit} onChange={(e) => set("unit", e.target.value)} className="w-full text-sm border rounded px-2 py-1.5" style={inputStyle} />
        </div>
      </div>
      {pct != null && (
        <div className="mt-2 rounded p-2" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
          <div className="flex items-baseline gap-2">
            <span className="tnum font-bold" style={{ fontSize: 22, color: C.green }}>{Math.round(pct)}%</span>
            <span className="text-xs tnum" style={{ color: C.sub }}>({fmtN(c!)} − {fmtN(s!)}) ÷ ({fmtN(g!)} − {fmtN(s!)})</span>
          </div>
          <Bar pct={pct} color={C.green} h={8} />
        </div>
      )}

      <Label>Read the current value from the planning data (optional)</Label>
      <select value={f.metric_source} onChange={(e) => set("metric_source", e.target.value)} className="w-full text-xs border rounded px-2 py-1.5 bg-white" style={inputStyle}>
        <option value="">Not fed — someone logs the number</option>
        {ctx.data.metrics.map((m) => <option key={m.key} value={m.key}>{m.label} ({m.unitHint})</option>)}
      </select>
      {f.metric_source && (
        <div className="text-xs rounded p-2 mt-1" style={{ background: "#E6F4EA", color: C.green, lineHeight: 1.5 }}>
          {ctx.data.metrics.find((m) => m.key === f.metric_source)?.describe} Nobody types this number — it is read from
          the live planning data every time the page loads.
        </div>
      )}

      <div className="flex gap-2">
        <div style={{ flex: 1 }}><Label>Cadence</Label>
          <select value={f.cadence} onChange={(e) => set("cadence", e.target.value)} className="w-full text-xs border rounded px-2 py-1.5 bg-white" style={inputStyle}>
            {["daily", "weekly", "monthly", "quarterly", "annual"].map((x) => <option key={x} value={x}>{x}</option>)}
          </select></div>
      </div>

      <Label>Visible to</Label>
      <BandPicker bands={ctx.data.bands} value={f.bands} onChange={(v) => set("bands", v)} />

      <Label>Also relevant to</Label>
      <div className="flex gap-1 flex-wrap">
        {ctx.data.people.map((p) => {
          const on = watchers.includes(p.id);
          return (
            <button key={p.id} onClick={() => setWatchers(on ? watchers.filter((x) => x !== p.id) : [...watchers, p.id])}
              className="text-xs font-bold rounded px-2 py-1"
              style={on ? { background: C.navy, color: "#fff" } : { background: "#fff", border: `1px solid ${C.line}`, color: C.mute }}>
              {p.initials || p.name || p.email.split("@")[0]}
            </button>
          );
        })}
      </div>
      <div className="text-xs mt-1" style={{ color: C.mute }}>
        These people see it under “KPIs Relevant to me” even though they neither own it nor sit in its department.
      </div>

      <div className="flex gap-2 pt-4">
        <button onClick={save} disabled={busy} className="text-sm font-bold rounded py-2" style={{ background: C.accent, color: "#fff", flex: 1 }}>
          {busy ? "Saving…" : k ? "Save KPI" : "Create KPI"}
        </button>
        {k && (
          <button onClick={async () => {
            if (!window.confirm(`Delete the KPI "${k.name}"?`)) return;
            await ctx.post({ action: "kpi.delete", id: k.id });
            onClose();
          }} className="text-sm font-bold rounded px-3" style={{ background: "#FBEDEA", color: C.red }}>Delete</button>
        )}
      </div>
    </Drawer>
  );
}

// ===========================================================================
// Setup — departments, and who sits in which band
// ===========================================================================
function Setup({ ctx, onClose }: { ctx: Ctx; onClose: () => void }) {
  const [busy, setBusy] = useState("");
  const [newDept, setNewDept] = useState("");

  const setPerson = async (personId: string, patch: Record<string, unknown>) => {
    setBusy(personId);
    try { await ctx.post({ action: "person.set", person_id: personId, ...patch }); }
    catch (e) { alert(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(""); }
  };

  return (
    <Drawer width={620} onClose={onClose} title={<span className="font-bold text-sm" style={{ color: C.ink }}>⚙ Goals setup</span>}>
      <div className="text-xs mb-3" style={{ color: C.sub, lineHeight: 1.5 }}>
        Two things decide who sees what: the <b>department</b> a person sits in, and the <b>bands</b> they belong to. A goal
        marked Management is invisible to anyone outside Management — except the person it is assigned to, and admins.
      </div>

      <Label>Departments</Label>
      <div className="flex flex-col gap-1 mb-2">
        {ctx.data.departments.map((d) => (
          <div key={d.id} className="flex items-center gap-2 rounded px-2 py-1.5" style={{ background: C.panel }}>
            <span style={{ width: 10, height: 10, borderRadius: 10, background: d.color, flexShrink: 0 }} />
            <span className="text-sm font-semibold" style={{ color: C.ink, flex: 1 }}>{d.name}</span>
            <select value={d.head_person_id || ""} title="Department head — may edit this department's goals"
              onChange={(e) => ctx.post({ action: "dept.update", id: d.id, name: d.name, code: d.code, color: d.color, sort_order: d.sort_order, head_person_id: e.target.value || null })}
              className="text-xs border rounded px-1 py-0.5 bg-white" style={{ borderColor: C.line, maxWidth: 170 }}>
              <option value="">no head</option>
              {ctx.data.people.map((p) => <option key={p.id} value={p.id}>{p.name || p.email}</option>)}
            </select>
            <button onClick={async () => {
              if (!window.confirm(`Remove the department "${d.name}"?\n\nGoals keep their history but lose the link.`)) return;
              await ctx.post({ action: "dept.delete", id: d.id });
            }} className="text-xs rounded px-1.5" style={{ color: C.red, border: `1px solid ${C.line}` }}>✕</button>
          </div>
        ))}
      </div>
      <div className="flex gap-1 mb-4">
        <input value={newDept} onChange={(e) => setNewDept(e.target.value)} placeholder="Add a department"
          className="flex-1 text-xs border rounded px-2 py-1.5" style={inputStyle} />
        <button onClick={async () => {
          if (!newDept.trim()) return;
          await ctx.post({ action: "dept.create", name: newDept.trim(), sort_order: ctx.data.departments.length + 1 });
          setNewDept("");
        }} className="text-xs font-bold rounded px-3" style={{ background: C.navy, color: "#fff" }}>Add</button>
      </div>

      <Label>People — department and bands</Label>
      <div className="flex flex-col gap-1">
        {ctx.data.people.map((p) => (
          <div key={p.id} className="rounded px-2 py-2" style={{ background: C.panel, opacity: busy === p.id ? 0.5 : 1 }}>
            <div className="flex items-center gap-2 flex-wrap">
              <Avatar text={p.initials || p.email} size={22} />
              <span className="text-sm font-semibold" style={{ color: C.ink, flex: 1, minWidth: 110 }}>{p.name || p.email}</span>
              <select value={p.department_id || ""} onChange={(e) => setPerson(p.id, { department_id: e.target.value || null })}
                className="text-xs border rounded px-1 py-0.5 bg-white" style={{ borderColor: C.line }}>
                <option value="">no department</option>
                {ctx.data.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className="flex gap-1 flex-wrap mt-1.5" style={{ paddingLeft: 30 }}>
              {ctx.data.bands.filter((b) => b.code !== "all").map((b) => {
                const on = p.bands.includes(b.code);
                return (
                  <button key={b.code} onClick={() => setPerson(p.id, { bands: on ? p.bands.filter((x) => x !== b.code) : [...p.bands, b.code] })}
                    className="text-xs font-bold rounded px-2 py-0.5"
                    style={on ? { background: bandColor[b.code], color: "#fff" } : { background: "#fff", border: `1px solid ${C.line}`, color: C.faint }}>
                    {b.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Drawer>
  );
}

// ===========================================================================
// Empty / blocked states
// ===========================================================================
function NotInstalled() {
  return (
    <div className="p-8" style={{ maxWidth: 640 }}>
      <div className="text-lg font-bold mb-2" style={{ color: C.ink }}>The Goals section isn&apos;t installed yet</div>
      <p className="text-sm mb-3" style={{ color: C.sub, lineHeight: 1.6 }}>
        Its tables haven&apos;t been created in this database. Run{" "}
        <code style={{ background: C.panel, padding: "1px 5px", borderRadius: 3 }}>
          supabase/migrations/0019_goals_v2.sql
        </code>{" "}
        in the Supabase SQL editor, then reload this page.
      </p>
      <p className="text-xs" style={{ color: C.mute, lineHeight: 1.6 }}>
        The migration only adds new tables — nothing already running depends on it, and the old goal tree is left exactly
        where it is.
      </p>
    </div>
  );
}

function Denied() {
  return (
    <div className="p-8" style={{ maxWidth: 640 }}>
      <div className="text-lg font-bold mb-2" style={{ color: C.ink }}>Goals hasn&apos;t been shared with you</div>
      <p className="text-sm mb-3" style={{ color: C.sub, lineHeight: 1.6 }}>
        Access is granted per person in Admin → Goals access, rather than following your planning role. Work assigned to
        you still reaches you — it&apos;s all on <b>My Week</b>.
      </p>
    </div>
  );
}
