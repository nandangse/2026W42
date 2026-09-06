"use client";
/**
 * Employee Master — the spine of HRMS. Every other module keys off a person
 * in here.
 *
 * Three views over one master, which is what Dr Raghu asked for:
 *   · Active Employees            — on the roll today. The default.
 *   · Past Employeemaster 2025-26 — everybody who was on the roll during FY
 *                                   2025-26, whether or not they still are.
 *                                   A DERIVED view, not a stored snapshot —
 *                                   see the note under the title. When the
 *                                   2025-26 sheet is uploaded as its own
 *                                   thing this becomes exact instead.
 *   · Left Employees              — no longer here. Kept, never deleted.
 *
 * The edit model is the one from 3.19.0.0 and has not changed: sheet-carried
 * fields are overridden rather than overwritten, Genie-only fields are ours,
 * and every change is on the record's own History tab.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { swallow } from "@/lib/swallow";
import { api } from "@/lib/api";
import { fmtFull } from "@/lib/schedule";
import { FIELD_GROUPS, ALL_FIELDS, onRoll, tenure, splitMulti, type HrmsEmployee } from "@/lib/hrms";
import { ReadField, C as CC } from "./RecordFields";
import DataTable, { type Column } from "./DataTable";
import { Pane } from "./Pane";

export type MasterView = "active" | "past" | "left";

/** Always on the table, so they are not offered as something to add. */
const ALWAYS = ["id", "name", "department", "role", "designation", "email", "location", "type", "status", "doj", "active"];

/** FY 2025-26 closed on this date. */
const FY2526_END = "2026-03-31";

interface HistoryRow {
  id: string; employee_id: string; field: string; label: string;
  old_value: string | null; new_value: string | null;
  by_initials: string | null; by_email: string | null; edited_at: string;
}

const C = { ink: "#22303C", dim: "#5A6672", faint: "#8A94A0", line: "#E2E0DA", orange: "#E8600A", green: "#0D7A3F", red: "#B3261E" };

const val = (e: HrmsEmployee, k: string) => e.value[k] ?? "";
const isActive = (e: HrmsEmployee) => onRoll(e.value);

export default function EmployeeMaster({
  view, rows, reload, who, err,
}: {
  view: MasterView;
  rows: HrmsEmployee[] | null;
  reload: () => void;
  who: string;
  err: string;
}) {
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");
  const [role, setRole] = useState("");
  const [type, setType] = useState("");
  /**
   * ADD COLUMN. The record carries about ninety fields and a table cannot
   * show ninety; these nine are what a directory is usually read for, and the
   * rest are one tick away. The choice is remembered on this browser, because
   * whoever works the payroll wants the pay columns every time and whoever
   * works joiners never does.
   */
  const [extraCols, setExtraCols] = useState<string[]>([]);
  const [colsOpen, setColsOpen] = useState(false);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("hrms.master.columns");
      if (saved) setExtraCols(JSON.parse(saved));
    } catch (e) { swallow("hrms/EmployeeMaster", e); /* a browser that refuses storage simply forgets */ }
  }, []);
  const toggleCol = (key: string) => {
    setExtraCols((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      try { window.localStorage.setItem("hrms.master.columns", JSON.stringify(next)); } catch (e) { swallow("hrms/EmployeeMaster", e); /* as above */ }
      return next;
    });
  };
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [local, setLocal] = useState<HrmsEmployee[] | null>(null);

  // The shell owns the fetch; edits are applied here and locally so a save
  // does not cost a round trip through the whole master.
  useEffect(() => { setLocal(rows); }, [rows]);
  useEffect(() => { setOpenId(null); }, [view]);
  const all = local;

  const departments = useMemo(() => {
    const s = new Set<string>();
    for (const e of all || []) if (val(e, "department")) s.add(val(e, "department"));
    return [...s].sort();
  }, [all]);

  const inView = useMemo(() => {
    const list = all || [];
    if (view === "active") return list.filter(isActive);
    if (view === "left") return list.filter((e) => !isActive(e));
    return list.filter((e) => {
      const doj = val(e, "doj");
      return !!doj && doj <= FY2526_END;
    });
  }, [all, view]);

  const roles = useMemo(() => {
    const s = new Set<string>();
    for (const e of inView) for (const r of splitMulti(val(e, "role"))) s.add(r);
    return [...s].sort();
  }, [inView]);
  const types = useMemo(() => {
    const s = new Set<string>();
    for (const e of inView) if (val(e, "type")) s.add(val(e, "type"));
    return [...s].sort();
  }, [inView]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return inView.filter((e) => {
      if (dept && val(e, "department") !== dept) return false;
      if (role && !splitMulti(val(e, "role")).includes(role)) return false;
      if (type && val(e, "type") !== type) return false;
      if (!needle) return true;
      return [e.id, val(e, "name"), val(e, "email"), val(e, "department"), val(e, "designation"), val(e, "location"), val(e, "phone")]
        .join(" ").toLowerCase().includes(needle);
    });
  }, [inView, q, dept, role, type]);

  const stats = useMemo(() => {
    const active = inView.filter(isActive);
    const cutoff = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
    const withDoj = active.filter((e) => val(e, "doj"));
    const months = withDoj.reduce((s, e) => {
      const d = new Date(val(e, "doj") + "T00:00:00");
      if (Number.isNaN(d.getTime())) return s;
      const n = new Date();
      return s + (n.getFullYear() - d.getFullYear()) * 12 + (n.getMonth() - d.getMonth());
    }, 0);
    return {
      shown: inView.length,
      depts: new Set(inView.map((e) => val(e, "department")).filter(Boolean)).size,
      joined: active.filter((e) => (val(e, "doj") || "") >= cutoff).length,
      avg: withDoj.length ? months / withDoj.length / 12 : 0,
      missing: active.filter((e) => !val(e, "doj") || !val(e, "department")).length,
    };
  }, [inView]);

  const columns: Column<HrmsEmployee>[] = useMemo(() => [
    /**
     * EMPLOYEEID IS THE FIRST COLUMN IN EVERY VIEW (Dr Raghu, 23 Aug 2026).
     * It is the key every HRIS record hangs off, every upload is filed by and
     * every Drive folder is named with — so it reads first, and it is the
     * column frozen by default when the table is scrolled sideways.
     */
    { key: "id", label: "EmployeeID", width: 110, value: (e) => e.id,
      render: (e) => <span className="font-bold tnum">{e.id}</span>,
      title: "The key every HRIS record hangs off" },
    {
      key: "name", label: "Name", width: 210,
      value: (e) => val(e, "name"),
      render: (e) => (
        <span className="font-semibold">
          {val(e, "name") || "—"}
          {Object.keys(e.edited).length > 0 && <span title="Edited in HRMS" style={{ color: C.orange, marginLeft: 5 }}>•</span>}
        </span>
      ),
    },
    { key: "department", label: "Department", width: 150, value: (e) => val(e, "department") },
    { key: "role", label: "Roles", width: 220,
      value: (e) => splitMulti(val(e, "role")).join(" · "),
      render: (e) => {
        const rs = splitMulti(val(e, "role"));
        if (!rs.length) return null;
        return (
          <span className="flex gap-1 flex-wrap">
            {rs.map((r) => (
              <span key={r} className="rounded px-1.5" style={{ background: "#FFF3E8", fontSize: 11 }}>{r}</span>
            ))}
          </span>
        );
      },
      title: "The enforceable ones — defined in IDP → Roles, JD, KRA, KPI. Somebody can hold more than one." },
    { key: "designation", label: "Designation", width: 200, value: (e) => val(e, "designation"),
      title: "What goes on the visiting card. The Role beside it is the accountable one." },
    { key: "email", label: "Work email", width: 210, value: (e) => val(e, "email") },
    { key: "location", label: "Location", width: 120, value: (e) => val(e, "location") },
    { key: "type", label: "Type", width: 130, value: (e) => val(e, "type"),
      title: "Decides payroll — employed types carry PF/ESIC/MLWF, contract types carry 2% TDS" },
    {
      key: "doj", label: "Joined", width: 110,
      value: (e) => val(e, "doj"),
      render: (e) => (val(e, "doj") ? fmtFull(val(e, "doj")) : null),
    },
    {
      key: "tenure", label: "Tenure", width: 100, align: "right",
      numeric: true,
      value: (e) => {
        const d = val(e, "doj");
        if (!d) return null;
        const t = new Date(d + "T00:00:00").getTime();
        return Number.isNaN(t) ? null : Math.round((Date.now() - t) / 864e5);
      },
      render: (e) => <span style={{ color: C.dim }}>{tenure(val(e, "doj"))}</span>,
      title: "Sorted by days served, shown in years and months",
    },
    {
      key: "status", label: "Status", width: 140,
      value: (e) => val(e, "status") || (isActive(e) ? "Active" : "Left"),
      render: (e) => {
        const st = val(e, "status");
        const on = isActive(e);
        return (
          <span className="rounded px-1.5 py-0.5 font-semibold"
            style={on ? { background: "#E6F4EA", color: C.green } : { background: "#FBEDEA", color: C.red }}>
            {st || (on ? "Active" : "Left")}
          </span>
        );
      },
      title: "The master's own six: Active, Resigned, Terminated, Doubtful, Notice Period, F&F Due",
    },
    ...extraCols
      .map((k) => ALL_FIELDS.find((f) => f.key === k))
      .filter(Boolean)
      .map((f) => ({
        key: f!.key,
        label: f!.label,
        width: f!.kind === "long" ? 260 : f!.kind === "money" || f!.kind === "number" ? 120 : 170,
        align: (f!.kind === "money" || f!.kind === "number" ? "right" : "left") as "left" | "right",
        numeric: f!.kind === "money" || f!.kind === "number",
        value: (e: HrmsEmployee) => {
          if (f!.derived) return f!.derived(e.value);
          return val(e, f!.key);
        },
        title: f!.hint,
      })),
  ], [extraCols]);

  // Editing moved to the record's own page (3.19.2.0) — the directory only reads.

  // Export — Dr Raghu's own wording, and his two options. Built on the
  // server so the file is assembled from the record rather than from what the
  // page happens to be holding.
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState("");
  const runExport = async (scope: "filtered" | "all") => {
    setExporting(scope);
    try {
      const res = await fetch("/api/hrms/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(scope === "all" ? { scope } : { scope, ids: filtered.map((e) => e.id) }),
      });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || "Export failed");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `Nandan_HRMS_${scope}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
      setExportOpen(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting("");
    }
  };

  const TITLE: Record<MasterView, string> = {
    active: "Active Employees",
    past: "Past Employeemaster 2025-26",
    left: "Left Employees",
  };
  const BLURB: Record<MasterView, string> = {
    active: "Everybody on the roll today.",
    past: `FROZEN — the roll as it stood at the close of FY 2025-26: everybody who had joined on or before ${fmtFull(FY2526_END)}, whether or not they are still here. Read only. This is the record a payroll run and a timestamp are checked against, so nothing is edited from this view.`,
    left: "No longer on the roll. Records are kept, never deleted.",
  };

  const open = (all || []).find((e) => e.id === openId) || null;

  return (
    <>
      <Pane
        title={TITLE[view]}
        blurb={BLURB[view]}
        who={who}
        tools={
          <>
            <button onClick={() => setExportOpen((v) => !v)} className="text-xs font-bold rounded px-2.5 py-1.5" style={{ background: "#DCE8F5", color: "#1B3A5C" }} title="Download the master as an Excel workbook">⬇ Download Excel</button>
            {view === "active" && (
              <button onClick={() => setAdding((v) => !v)} className="text-xs font-bold rounded px-2.5 py-1.5" style={{ background: C.orange, color: "#fff" }} title="Somebody who has joined but is not on the HR sheet yet">+ Add person</button>
            )}
          </>
        }
      >
        {err && <div className="rounded p-2 mb-3 text-xs font-semibold" style={{ background: "#FBEDEA", color: C.red }}>{err}</div>}

        {view === "past" && (
          <div className="rounded p-2 mb-3" style={{ background: "#EDEAF6", border: "1px solid #B9AEDD" }}>
            <div className="text-xs font-bold" style={{ color: "#4A3B7A" }}>🔒 Frozen record — FY 2025-26</div>
            <div className="text-xs mt-1" style={{ color: C.dim, lineHeight: 1.6 }}>
              Nothing is edited from this view. It exists to be <b>checked against</b> — a payroll run, a headcount at a
              date, a question about who was on the roll last year. Opening somebody here shows their record and no more;
              to change anything, work from <b>Active Employees</b>.
              <br />
              <span style={{ color: C.faint }}>
                One honest limit: this is derived from joining dates against today&apos;s data, not a copy taken on 31 March
                2026. A person&apos;s department or salary reads as it is NOW, not as it was then. A true snapshot means
                storing one — say the word and the close of a financial year starts writing itself into a frozen table.
              </span>
            </div>
          </div>
        )}

        <div className="flex gap-2 flex-wrap mb-3">
          <Stat n={stats.shown} l={view === "left" ? "Have left" : "On this list"} />
          <Stat n={stats.depts} l="Departments" />
          {view !== "left" && <Stat n={stats.joined} l="Joined, 90 days" hint="Joining date within the last 90 days" />}
          {view !== "left" && <Stat n={stats.avg ? stats.avg.toFixed(1) : "—"} l="Avg tenure, yrs" />}
          {stats.missing > 0 && view !== "left" && <Stat n={stats.missing} l="Incomplete" warn hint="On the roll with no department or no joining date" />}
        </div>

        <div className="flex gap-1.5 flex-wrap items-center mb-2 no-print">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, code, email, designation…"
            className="text-xs rounded px-2.5 py-1.5" style={{ border: `1px solid ${C.line}`, background: "#fff", width: 280 }} />
          <select value={dept} onChange={(e) => setDept(e.target.value)} className="text-xs rounded px-2 py-1.5 bg-white" style={{ border: `1px solid ${C.line}` }}>
            <option value="">All departments</option>
            {departments.map((d) => (<option key={d} value={d}>{d}</option>))}
          </select>
          <select value={role} onChange={(e) => setRole(e.target.value)} className="text-xs rounded px-2 py-1.5 bg-white"
            style={{ border: `1px solid ${C.line}`, maxWidth: 210 }} title="The enforceable one, from the role register">
            <option value="">All roles</option>
            {roles.map((d) => (<option key={d} value={d}>{d}</option>))}
          </select>
          <select value={type} onChange={(e) => setType(e.target.value)} className="text-xs rounded px-2 py-1.5 bg-white"
            style={{ border: `1px solid ${C.line}` }} title="Decides payroll — employed types carry PF/ESIC/MLWF, contract types carry 2% TDS">
            <option value="">All types</option>
            {types.map((d) => (<option key={d} value={d}>{d}</option>))}
          </select>
          <button onClick={() => setColsOpen((v) => !v)} className="text-xs font-bold rounded px-2.5 py-1.5"
            style={{ background: extraCols.length ? "#16232F" : "#fff", color: extraCols.length ? "#fff" : C.dim, border: `1px solid ${C.line}` }}
            title="Choose which of the record's fields appear as columns">
            + Add column{extraCols.length ? ` (${extraCols.length})` : ""}
          </button>
          <span className="text-xs" style={{ color: C.faint }}>
            {all === null ? "loading…" : `${filtered.length} shown`} · click a header to sort, 📌 to freeze columns
          </span>
        </div>

        {colsOpen && (
          <div className="bg-white rounded-lg border p-3 mb-2 no-print" style={{ borderColor: C.line }}>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <div className="font-bold text-xs">Columns on this table</div>
              <div style={{ fontSize: 11, color: C.faint }}>
                Tick to add, untick to remove. Remembered on this browser.
              </div>
              {extraCols.length > 0 && (
                <button onClick={() => { setExtraCols([]); try { window.localStorage.removeItem("hrms.master.columns"); } catch (e) { swallow("hrms/EmployeeMaster", e); } }}
                  className="text-xs font-bold rounded px-2 py-0.5 ml-auto" style={{ background: "#F4F2EC", color: C.dim }}>
                  clear all {extraCols.length}
                </button>
              )}
            </div>
            {FIELD_GROUPS.map((g) => {
              const fields = g.fields.filter((f) => !ALWAYS.includes(f.key));
              if (!fields.length) return null;
              return (
                <div key={g.key} className="mb-1.5">
                  <div style={{ fontSize: 10.5, color: C.faint, textTransform: "uppercase", letterSpacing: 0.3 }}>
                    {g.label}
                    {g.confidential && <span style={{ color: C.red, marginLeft: 4 }}>confidential</span>}
                  </div>
                  <div className="flex gap-x-3 gap-y-0.5 flex-wrap">
                    {fields.map((f) => (
                      <label key={f.key} className="flex items-center gap-1 text-xs" style={{ cursor: "pointer", color: C.dim }}>
                        <input type="checkbox" checked={extraCols.includes(f.key)} onChange={() => toggleCol(f.key)}
                          style={{ accentColor: "#E8600A", width: 13, height: 13 }} />
                        {f.label}
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {exportOpen && (
          <div className="bg-white rounded-lg border p-3 mb-2 no-print" style={{ borderColor: "#F5B32B" }}>
            <div className="text-xs font-bold mb-2" style={{ color: "#8A5B00", lineHeight: 1.6 }}>
              Please note the export will be as per chosen options. Dont leave the data here and there
            </div>
            <div className="flex gap-1.5 flex-wrap items-center">
              <button onClick={() => runExport("filtered")} disabled={!!exporting}
                className="text-xs font-bold rounded px-3 py-1.5" style={{ background: "#1B3A5C", color: "#fff", opacity: exporting ? 0.6 : 1 }}>
                {exporting === "filtered" ? "Building…" : `Export filtered report (${filtered.length})`}
              </button>
              <button onClick={() => runExport("all")} disabled={!!exporting}
                className="text-xs font-bold rounded px-3 py-1.5" style={{ background: "#E8600A", color: "#fff", opacity: exporting ? 0.6 : 1 }}>
                {exporting === "all" ? "Building…" : "Export All"}
              </button>
              <span className="text-xs" style={{ color: C.faint }}>
                .xlsx · every column, pay and statutory numbers included · the file records who exported it and when
              </span>
            </div>
          </div>
        )}

        {adding && view === "active" && <AddPerson onDone={() => { setAdding(false); reload(); }} />}

        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(e) => e.id}
          onRowClick={(e) => setOpenId(e.id)}
          activeKey={openId}
          initialFrozen={2}
          empty={all === null ? "Loading the master…" : "Nobody matches that."}
        />
      </Pane>

      {open && <PersonCard e={open} frozen={view === "past"} onClose={() => setOpenId(null)} />}
    </>
  );
}

function Stat({ n, l, hint, warn }: { n: number | string; l: string; hint?: string; warn?: boolean }) {
  return (
    <div className="bg-white rounded-lg border px-3 py-2" style={{ borderColor: warn ? "#F5B32B" : C.line, minWidth: 118 }} title={hint}>
      <div className="font-bold tnum" style={{ fontSize: 21, lineHeight: 1.1, color: warn ? "#8A5B00" : C.ink }}>{n}</div>
      <div style={{ fontSize: 11, color: C.faint }}>{l}</div>
    </div>
  );
}

/* ────────────────────────── the person, read only ────────────────────────── */

/**
 * The lightbox is VIEW ONLY (Dr Raghu, 23 Aug 2026).
 *
 * Clicking a name in the directory shows the record; it does not put you in
 * it. Editing happens on the record's own page, opened in a new tab by the
 * button below — which means the directory you were working through is still
 * there when you come back, and nobody edits a personnel record by accident
 * while scrolling a list.
 */
function PersonCard({ e, frozen, onClose }: { e: HrmsEmployee; frozen?: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<string>(FIELD_GROUPS[0].key);
  const [history, setHistory] = useState<HistoryRow[] | null>(null);

  useEffect(() => { setTab(FIELD_GROUPS[0].key); setHistory(null); }, [e.id]);
  useEffect(() => {
    if (tab !== "history" || history) return;
    api.get(`/api/hrms/history?id=${encodeURIComponent(e.id)}`)
      .then((r) => setHistory(r.history)).catch(() => setHistory([]));
  }, [tab, history, e.id]);

  const group = FIELD_GROUPS.find((g) => g.key === tab);
  const edit = () => window.open(`/hrms/employee/${encodeURIComponent(e.id)}`, "_blank", "noopener");

  return (
    <div className="fixed inset-0 flex justify-end no-print" style={{ background: "rgba(13,22,31,0.35)", zIndex: 60 }} role="button" tabIndex={0} onClick={onClose}>
      <div className="h-full overflow-y-auto" style={{ background: "#F1EFE9", width: "min(620px, 100%)", boxShadow: "-8px 0 24px rgba(0,0,0,0.18)" }} role="button" tabIndex={0} onClick={(ev) => ev.stopPropagation()}>
        <div className="px-4 py-3 sticky top-0" style={{ background: "#16232F", color: "#fff", zIndex: 2 }}>
          <div className="flex items-start gap-2">
            <div style={{ minWidth: 0 }}>
              <div className="font-bold">{val(e, "name") || e.id}</div>
              <div style={{ fontSize: 11, color: "#8FA1B3" }}>
                Employee ID {e.id}
                {val(e, "initials") && <> · {val(e, "initials")}</>}
                {val(e, "type") && <> · {val(e, "type")}</>}
              </div>
              <div style={{ fontSize: 11, color: "#8FA1B3" }}>
                {[val(e, "designation"), val(e, "department")].filter(Boolean).join(" · ") || "no designation recorded"}
              </div>
            </div>
            <button onClick={onClose} className="ml-auto text-sm font-bold rounded px-2 py-1" style={{ background: "#22303C", color: "#8FA1B3" }}>✕</button>
          </div>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="rounded px-1.5 py-0.5 font-bold" style={{ fontSize: 10, background: frozen ? "#4A3B7A" : "#22303C", color: frozen ? "#fff" : "#8FA1B3" }}>
              {frozen ? "🔒 FROZEN — FY 2025-26" : "VIEW ONLY"}
            </span>
            {frozen ? (
              <span style={{ fontSize: 11, color: "#8FA1B3" }}>
                Frozen record — edit from Active Employees, not from here.
              </span>
            ) : (
              <button onClick={edit} className="text-xs font-bold rounded px-3 py-1.5" style={{ background: "#E8600A", color: "#fff" }}
                title="Opens this record in its own tab, where it can be changed. Every change is logged.">
                ✎ Edit Record ↗
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-1 flex-wrap px-3 py-1.5" style={{ background: "#EAE7DF", borderBottom: "1px solid #DCD9D1" }}>
          {FIELD_GROUPS.map((g) => (
            <button key={g.key} onClick={() => setTab(g.key)} className="text-xs font-bold rounded px-2 py-1"
              style={tab === g.key ? { background: "#16232F", color: "#fff" } : { color: "#5B6B7A" }}>
              {g.label}
            </button>
          ))}
          <button onClick={() => setTab("history")} className="text-xs font-bold rounded px-2 py-1"
            style={tab === "history" ? { background: "#16232F", color: "#fff" } : { color: "#5B6B7A" }}>
            History
          </button>
        </div>

        <div className="p-3">
          {group && (
            <>
              {group.note && (
                <div className="rounded p-2 mb-2" style={{ background: "#F4F2EC", fontSize: 11, color: CC.dim, lineHeight: 1.6 }}>
                  {group.note}
                </div>
              )}
              <div className="bg-white rounded-lg border" style={{ borderColor: CC.line }}>
                {group.fields.map((f) => (<ReadField key={f.key} f={f} e={e} />))}
              </div>
            </>
          )}

          {tab === "history" && (
            <>
              {history === null && <div className="text-xs" style={{ color: CC.faint }}>loading…</div>}
              {history?.length === 0 && <div className="text-xs" style={{ color: CC.faint }}>Nothing has been changed on this record.</div>}
              <div className="bg-white rounded-lg border" style={{ borderColor: CC.line }}>
                {(history || []).map((h, i) => (
                  <div key={h.id} className="px-3 py-2" style={{ borderTop: i ? "1px solid #EEECE6" : undefined }}>
                    <div className="text-xs" style={{ lineHeight: 1.6 }}>
                      <span className="rounded px-1.5 py-0.5 font-bold" style={{ background: "#E8600A", color: "#fff", fontSize: 10 }}>
                        {h.by_initials || "—"}
                      </span>{" "}
                      <span style={{ color: CC.faint }}>
                        on {fmtFull(String(h.edited_at))} at{" "}
                        {new Date(h.edited_at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })}
                      </span>{" "}
                      changed <b>{h.label}</b>{" "}
                      <span style={{ color: CC.faint, textDecoration: "line-through" }}>{h.old_value || "—"}</span>{" → "}
                      <span style={{ color: CC.green }}>{h.new_value || "—"}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {Object.keys(e.extra || {}).length > 0 && (
            <div className="rounded p-2 mt-3" style={{ background: "#FFF7E6", border: "1px solid #F5B32B", fontSize: 11, color: "#8A5B00", lineHeight: 1.6 }}>
              <b>{Object.keys(e.extra).length} column(s) arrived in an import that the record does not name yet:</b>{" "}
              {Object.keys(e.extra).join(", ")}. Tell me and they get proper fields.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AddPerson({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ name: "", id: "", email: "", department: "", designation: "", doj: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const submit = async () => {
    if (!f.name.trim()) { setMsg("A name is required"); return; }
    setBusy(true); setMsg("");
    try { await api.post("/api/hrms/employees", { action: "create", ...f }); onDone(); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const inp = (k: keyof typeof f, ph: string, w = 150) => (
    <input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} placeholder={ph}
      className="text-xs rounded px-2 py-1.5" style={{ border: `1px solid ${C.line}`, width: w }} />
  );

  return (
    <div className="bg-white rounded-lg border p-3 mb-2 no-print" style={{ borderColor: C.line }}>
      <div className="font-bold text-xs mb-1">Somebody the HR sheet has not caught up with</div>
      <div style={{ fontSize: 11, color: C.faint, lineHeight: 1.5 }} className="mb-2">
        Give the <b>employee code</b> if HR has already issued one — the next Employee Master upload then updates this
        person instead of creating a second record for them.
      </div>
      <div className="flex gap-1.5 flex-wrap items-center">
        {inp("name", "full name", 190)}
        {inp("id", "employee code (optional)", 170)}
        {inp("email", "work email", 170)}
        {inp("department", "department")}
        {inp("designation", "designation")}
        <input type="date" value={f.doj} onChange={(e) => setF({ ...f, doj: e.target.value })} className="text-xs rounded px-2 py-1.5" style={{ border: `1px solid ${C.line}` }} title="Date of joining" />
        <button onClick={submit} disabled={busy} className="text-xs font-bold rounded px-3 py-1.5" style={{ background: C.orange, color: "#fff", opacity: busy ? 0.6 : 1 }}>
          {busy ? "Adding…" : "Add"}
        </button>
        {msg && <span className="text-xs font-semibold" style={{ color: C.red }}>{msg}</span>}
      </div>
    </div>
  );
}
