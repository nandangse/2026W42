"use client";
/**
 * Roles, JD, KRA, KPI — the register a role is defined in.
 *
 * The employee master's Role points here, and that is the point of the
 * distinction: a DESIGNATION may be anything, a ROLE is accountable, and a
 * role is only accountable once somebody has written down what it delivers
 * and how that is measured.
 *
 * DRAFT until Dr Raghu marks it Final. Not ceremony — a job description
 * nobody has agreed is a suggestion, and an appraisal run against a
 * suggestion is not defensible.
 *
 * The management expectation note is spoken rather than typed, because that
 * is the part nobody writes. Kept three ways: the audio (tone carries what
 * words lose), the transcript (nobody scrubs audio for one sentence), and a
 * summary (spoken thought runs longer than the thought in it).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Pane } from "./Pane";
import DataTable, { type Column } from "./DataTable";
import { C } from "./RecordFields";
import RichText, { RichTextView } from "./RichText";
import VoiceNote from "./RoleVoiceNote";
import type { Role } from "./RoleRecord";
import { LEVEL_SHORT } from "@/lib/competency";


export default function RolesRegister({ who, isOwner }: { who: string; isOwner: boolean }) {
  const [roles, setRoles] = useState<Role[] | null>(null);
  const [unassigned, setUnassigned] = useState(0);
  const [activeTotal, setActiveTotal] = useState(0);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");
  const [stage, setStage] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  /**
   * THE TABLE COMES FIRST (Dr Raghu, 23 Aug 2026). The four wide columns are
   * COLLAPSED to begin with — a register of 134 roles with three paragraphs of
   * rich text in every row is not a table anybody can read. Open the ones you
   * want; the choice is remembered while you are on the page.
   */
  const [cols, setCols] = useState({ jd: false, deliverable: false, metric: false, people: false, comp: false });
  const [msg, setMsg] = useState("");
  const [adding, setAdding] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await api.get("/api/hrms/roles");
      setRoles(r.roles || []);
      setUnassigned(r.unassigned || 0);
      setActiveTotal(r.activeTotal || 0);
      setNeedsMigration(!!r.needsMigration);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
      setRoles([]);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const departments = useMemo(() => {
    const s = new Set<string>();
    for (const r of roles || []) if (r.department) s.add(r.department);
    return [...s].sort();
  }, [roles]);

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (roles || []).filter((r) => {
      if (dept && r.department !== dept) return false;
      if (stage && r.stage !== stage) return false;
      if (!n) return true;
      return [r.role, r.department, r.grade, r.reports_to, r.job_description, r.deliverable, r.metric, r.summary]
        .filter(Boolean).join(" ").toLowerCase().includes(n);
    });
  }, [roles, q, dept, stage]);

  const columns: Column<Role>[] = useMemo(() => {
    const out: Column<Role>[] = [
      {
        key: "role", label: "Role", width: 230, value: (r) => r.role,
        render: (r) => (
          <span className="font-semibold">
            {r.role}
            {r.summary && <span title="Has a management expectation note" style={{ marginLeft: 5 }}>🎙</span>}
          </span>
        ),
      },
      { key: "department", label: "Department", width: 150, value: (r) => r.department },
      { key: "grade", label: "Grade", width: 160, value: (r) => r.grade },
      {
        key: "activeCount", label: "Nos Active", width: 100, align: "right", numeric: true,
        value: (r) => r.activeCount,
        render: (r) => <span className="tnum" style={{ color: r.activeCount ? C.ink : "#C9C6BD", fontWeight: r.activeCount ? 700 : 400 }}>{r.activeCount}</span>,
        title: "Active employees holding this role",
      },
      {
        key: "ncomp", label: "Competencies", width: 120, align: "right", numeric: true,
        value: (r) => (r.competencies || []).length,
        render: (r) => {
          const n = (r.competencies || []).length;
          return <span className="tnum" style={{ color: n ? C.ink : "#C9C6BD" }}>{n || "—"}</span>;
        },
        title: "How many competencies this role needs",
      },
      {
        key: "stage", label: "Stage", width: 90, value: (r) => r.stage,
        render: (r) => (
          <span className="rounded px-1.5 py-0.5 font-bold" style={{
            fontSize: 10,
            background: r.stage === "Final" ? "#E6F4EA" : "#FFF3E8",
            color: r.stage === "Final" ? C.green : "#8A5B00",
          }}>{r.stage}</span>
        ),
      },
    ];
    // Sorting on rich text sorts on the WORDS, not on the markup — otherwise
    // every row beginning "<p>" sorts identically.
    const words = (h: string | null) => String(h || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    if (cols.jd) out.push({ key: "job_description", label: "Job Description", width: 340, value: (r) => words(r.job_description), render: (r) => <RichTextView html={r.job_description} /> });
    if (cols.deliverable) out.push({ key: "deliverable", label: "Deliverable", width: 300, value: (r) => words(r.deliverable), render: (r) => <RichTextView html={r.deliverable} /> });
    if (cols.metric) out.push({ key: "metric", label: "Measurement Metric", width: 300, value: (r) => words(r.metric), render: (r) => <RichTextView html={r.metric} /> });
    if (cols.comp) out.push({
      key: "competencies", label: "Competencies", width: 320,
      value: (r) => (r.competencies || []).map((c) => `${c.competency} ${c.level}`).join(", "),
      render: (r) => {
        const cs = r.competencies || [];
        if (!cs.length) return <span style={{ color: "#C9C6BD" }}>none</span>;
        return (
          <span className="flex gap-1 flex-wrap">
            {cs.map((c) => (
              <span key={c.competency} className="rounded px-1.5" style={{ background: "#EDEAF6", fontSize: 11 }}
                title={`${c.competency} — level ${c.level}, ${LEVEL_SHORT[c.level]}`}>
                {c.competency} <b>{c.level}</b>
              </span>
            ))}
          </span>
        );
      },
    });
    if (cols.people) out.push({
      key: "people", label: "People Active", width: 320,
      value: (r) => r.people.filter((p) => p.onRoll).map((p) => p.name).join(", "),
      render: (r) => {
        const on = r.people.filter((p) => p.onRoll);
        if (!on.length) return <span style={{ color: "#C9C6BD" }}>nobody</span>;
        return (
          <span className="flex gap-1 flex-wrap">
            {on.map((p) => (
              <a key={p.id} href={`/hrms/employee/${encodeURIComponent(p.id)}`} target="_blank" rel="noopener noreferrer"
                className="rounded px-1.5 py-0.5" style={{ background: "#F4F2EC", color: C.dim, fontSize: 11 }} title={p.id}>
                {p.name}
              </a>
            ))}
          </span>
        );
      },
    });
    return out;
  }, [cols]);

  const run = async (body: Record<string, unknown>, ok: string) => {
    setMsg("");
    try { await api.post("/api/hrms/roles", body); setMsg(`${ok} ✓`); await load(); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  };

  const current = (roles || []).find((r) => r.id === open) || null;

  return (
    <Pane title="Roles, JD, KRA, KPI" who={who}
      blurb="What each role is for, what it must deliver, and how that is measured. The employee master's Role points here."
      tools={
        <>
          <input value={adding} onChange={(e) => setAdding(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && adding.trim()) { run({ action: "create", role: adding.trim() }, `Added “${adding.trim()}”`); setAdding(""); } }}
            placeholder="New role…" className="text-xs rounded px-2 py-1.5" style={{ border: `1px solid ${C.line}`, width: 170 }} />
          <button onClick={() => { if (adding.trim()) { run({ action: "create", role: adding.trim() }, `Added “${adding.trim()}”`); setAdding(""); } }}
            className="text-xs font-bold rounded px-2.5 py-1.5" style={{ background: "#E8600A", color: "#fff" }}>+ Add role</button>
        </>
      }>
      {needsMigration && (
        <div className="rounded p-3 mb-3" style={{ background: "#FFF7E6", border: "1px solid #F5B32B", fontSize: 12, color: "#8A5B00" }}>
          <b>Run migration 0050 first.</b> The role register does not exist yet.
        </div>
      )}
      {msg && <div className="text-xs font-semibold mb-2" style={{ color: msg.includes("✓") ? C.green : C.red }}>{msg}</div>}

      {/* the three counts */}
      <div className="flex gap-2 flex-wrap mb-3">
        <Stat n={(roles || []).length} l="Roles" hint="Roles in the register" />
        <Stat n={activeTotal} l="Active employees" hint="Everybody on the roll" />
        <Stat n={unassigned} l="Unassigned" warn={unassigned > 0}
          hint="On the roll with no role set. Their designation is not a role — until somebody chooses one, nothing defines what they are accountable for." />
      </div>

      <div className="flex gap-1.5 flex-wrap items-center mb-2 no-print">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search roles, JD, deliverable, metric…"
          className="text-xs rounded px-2.5 py-1.5" style={{ border: `1px solid ${C.line}`, width: 300 }} />
        <select value={dept} onChange={(e) => setDept(e.target.value)} className="text-xs rounded px-2 py-1.5 bg-white" style={{ border: `1px solid ${C.line}` }}>
          <option value="">All departments</option>
          {departments.map((d) => (<option key={d} value={d}>{d}</option>))}
        </select>
        <select value={stage} onChange={(e) => setStage(e.target.value)} className="text-xs rounded px-2 py-1.5 bg-white" style={{ border: `1px solid ${C.line}` }}>
          <option value="">Draft and Final</option>
          <option value="Draft">Draft only</option>
          <option value="Final">Final only</option>
        </select>
        <span className="text-xs" style={{ color: C.faint }}>{roles === null ? "loading…" : `${shown.length} shown`}</span>
      </div>

      {/* which wide columns are open */}
      <div className="flex gap-1.5 flex-wrap items-center mb-2 no-print">
        <span className="text-xs" style={{ color: C.faint }}>Columns:</span>
        {([["jd", "Job Description"], ["deliverable", "Deliverable"], ["metric", "Measurement Metric"], ["comp", "Competencies"], ["people", "People Active"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setCols((c) => ({ ...c, [k]: !c[k] }))}
            className="text-xs font-semibold rounded px-2 py-1"
            style={cols[k] ? { background: "#16232F", color: "#fff" } : { background: "#fff", border: `1px solid ${C.line}`, color: C.dim }}
            title={cols[k] ? "Collapse this column" : "Show this column"}>
            {cols[k] ? "▾" : "▸"} {label}
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        rows={shown}
        rowKey={(r) => r.id}
        onRowClick={(r) => setOpen(open === r.id ? null : r.id)}
        activeKey={open}
        initialFrozen={1}
        empty={roles === null ? "Loading the register…" : "No role matches that."}
      />

      {current && (
        <div className="fixed inset-0 flex justify-end no-print" style={{ background: "rgba(13,22,31,0.35)", zIndex: 60 }} role="button" tabIndex={0} onClick={() => setOpen(null)}>
          <div className="h-full overflow-y-auto" style={{ background: "#F1EFE9", width: "min(1180px, 100%)", boxShadow: "-8px 0 24px rgba(0,0,0,0.18)" }} role="button" tabIndex={0} onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 sticky top-0 flex items-start gap-2" style={{ background: "#16232F", color: "#fff", zIndex: 2 }}>
              <div style={{ minWidth: 0 }}>
                <div className="font-bold">{current.role}</div>
                <div style={{ fontSize: 11, color: "#8FA1B3" }}>
                  {[current.department, current.grade].filter(Boolean).join(" · ") || "no department set"}
                  {" · "}{current.activeCount} active
                </div>
              </div>
              <span className="rounded px-1.5 py-0.5 font-bold" style={{
                fontSize: 10, marginLeft: "auto",
                background: current.stage === "Final" ? "#E6F4EA" : "#FFF3E8",
                color: current.stage === "Final" ? C.green : "#8A5B00",
              }}>{current.stage}</span>
              <button onClick={() => setOpen(null)} className="text-sm font-bold rounded px-2 py-1" style={{ background: "#22303C", color: "#8FA1B3" }}>✕</button>
            </div>
            <RoleView r={current} />
          </div>
        </div>
      )}
    </Pane>
  );
}

function Stat({ n, l, hint, warn }: { n: number; l: string; hint?: string; warn?: boolean }) {
  return (
    <div className="bg-white rounded-lg border px-3 py-2" style={{ borderColor: warn ? "#F5B32B" : C.line, minWidth: 130 }} title={hint}>
      <div className="font-bold tnum" style={{ fontSize: 21, lineHeight: 1.1, color: warn ? "#8A5B00" : C.ink }}>{n}</div>
      <div style={{ fontSize: 11, color: C.faint }}>{l}</div>
    </div>
  );
}

/**
 * The lightbox is READ ONLY (Dr Raghu, 23 Aug 2026) — everything the role
 * says, including the recording, and nothing you can type into. Editing opens
 * the role in its own tab, which is where a document of this weight belongs:
 * three rich-text boxes and a recorder do not fit in a panel over a list.
 */
function RoleView({ r }: { r: Role }) {
  const edit = () => window.open(`/hrms/role/${encodeURIComponent(r.id)}`, "_blank", "noopener");
  return (
    <div className="p-3">
      {/* Identity runs along ONE line rather than a stack of labelled rows.
          Six facts do not need six rows, and every row spent here is a row
          not spent on the job description underneath. */}
      <div className="bg-white rounded-lg border px-3 py-2 mb-3 flex items-center gap-x-4 gap-y-1 flex-wrap" style={{ borderColor: C.line }}>
        <Fact label="Role" value={r.role} strong />
        <Fact label="Department" value={r.department} />
        <Fact label="Grade" value={r.grade} />
        <Fact label="Reports To" value={r.reports_to} />
        <Fact label="Location" value={r.location} />
        <Fact label="Nos Active" value={String(r.activeCount)} />
        <span className="ml-auto flex items-center gap-2">
          <span className="rounded px-1.5 py-0.5 font-bold" style={{ fontSize: 10, background: "#22303C", color: "#8FA1B3" }}>
            VIEW ONLY
          </span>
          {r.pending_since && (
            <span className="rounded px-1.5 py-0.5 font-bold" style={{ fontSize: 10, background: "#F5B32B", color: "#4A3300" }}>
              awaiting RJ
            </span>
          )}
          <button onClick={edit} className="text-xs font-bold rounded px-3 py-1.5" style={{ background: "#E8600A", color: "#fff" }}
            title="Opens this role in its own tab, where it can be changed. Any change goes to Dr Raghu for approval.">
            ✎ Edit ↗
          </button>
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.5fr) minmax(0,1fr)", gap: 12, alignItems: "start" }}>
        {/* ── left: what is written ── */}
        <div style={{ minWidth: 0 }}>
          <Read label="Job Description" html={r.job_description} />
          <Read label="Deliverable" html={r.deliverable} />
          <Read label="Measurement Metric" html={r.metric} />
          <div className="bg-white rounded-lg border p-3 mb-3" style={{ borderColor: C.line }}>
            <div className="font-bold text-xs mb-1">Competencies — what it takes to hold this role</div>
            {(r.competencies || []).length === 0 && <div className="text-xs" style={{ color: C.faint }}>None set yet.</div>}
            {(r.competencies || []).map((c) => (
              <div key={c.competency} className="flex items-center gap-2 py-1" style={{ borderTop: "1px solid #EEECE6" }}>
                <div className="text-xs" style={{ flex: 1 }}>{c.competency}</div>
                <span className="rounded px-1.5 py-0.5 font-bold" style={{ background: "#EDEAF6", color: "#4A3B7A", fontSize: 11 }}>
                  {c.level} · {LEVEL_SHORT[c.level]}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── right: what was said, and who holds it ── */}
        <div style={{ minWidth: 0 }}>
          <div className="bg-white rounded-lg border p-3 mb-3" style={{ borderColor: C.line }}>
            <div className="font-bold text-xs mb-1">Management Expectation Note</div>
            {!r.summary && !r.url && <div className="text-xs" style={{ color: C.faint }}>Not recorded yet.</div>}
            {r.url && <audio controls controlsList="nodownload" src={r.url} style={{ height: 30, width: "100%" }} />}
            {r.summary ? (
              <div className="rounded p-2 mt-2" style={{ background: "#F4F2EC" }}>
                <div className="text-xs font-bold" style={{ color: C.dim }}>What it comes to — this is what goes into the IDP</div>
                <div className="text-xs" style={{ color: C.ink, whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{r.summary}</div>
              </div>
            ) : r.transcript ? (
              <div className="rounded p-2 mt-2" style={{ background: "#FFF7E6", border: "1px solid #F5B32B", fontSize: 11, color: "#8A5B00", lineHeight: 1.5 }}>
                The words were saved but no summary was written. Open <b>Edit</b> and press <b>Summarise again</b>.
              </div>
            ) : null}
            {r.transcript && (
              <details className="mt-2">
                <summary className="text-xs cursor-pointer" style={{ color: C.faint }}>the words as spoken</summary>
                <div className="text-xs mt-1" style={{ color: C.dim, lineHeight: 1.6 }}>{r.transcript}</div>
              </details>
            )}
          </div>

          <div className="bg-white rounded-lg border p-3" style={{ borderColor: C.line }}>
            <div className="font-bold text-xs mb-1">Who holds this role</div>
            {r.people.length === 0 && <div className="text-xs" style={{ color: C.faint }}>Nobody.</div>}
            <div className="flex gap-1 flex-wrap">
              {r.people.map((p) => (
                <a key={p.id} href={`/hrms/employee/${encodeURIComponent(p.id)}`} target="_blank" rel="noopener noreferrer"
                  className="rounded px-1.5 py-0.5 text-xs"
                  style={{ background: p.onRoll ? "#F4F2EC" : "#FBEDEA", color: p.onRoll ? C.dim : C.red }}
                  title={p.onRoll ? `${p.id} — on the roll` : `${p.id} — no longer on the roll`}>
                  {p.name}
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value, strong }: { label: string; value: string | null; strong?: boolean }) {
  return (
    <span className="flex items-baseline gap-1.5" style={{ whiteSpace: "nowrap" }}>
      <span style={{ fontSize: 10, color: C.faint, textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</span>
      <span className="text-xs" style={{ fontWeight: strong ? 700 : 500, color: value ? C.ink : "#C9C6BD" }}>
        {value || "—"}
      </span>
    </span>
  );
}

function Read({ label, html }: { label: string; html: string | null }) {
  return (
    <div className="bg-white rounded-lg border p-3 mb-3" style={{ borderColor: C.line }}>
      <div className="font-bold text-xs mb-1">{label}</div>
      <RichTextView html={html} />
    </div>
  );
}
