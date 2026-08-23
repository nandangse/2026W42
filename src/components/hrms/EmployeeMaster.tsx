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
import { api } from "@/lib/api";
import { fmtFull } from "@/lib/schedule";
import { SHEET_FIELDS, GENIE_FIELDS, ALL_FIELDS, tenure, type FieldSpec, type HrmsEmployee } from "@/lib/hrms";
import DataTable, { toCsv, type Column } from "./DataTable";
import { Pane } from "./Pane";

export type MasterView = "active" | "past" | "left";

/** FY 2025-26 closed on this date. */
const FY2526_END = "2026-03-31";

interface HistoryRow {
  id: string; employee_id: string; field: string; label: string;
  old_value: string | null; new_value: string | null; edited_by: string | null; edited_at: string;
}

const C = { ink: "#22303C", dim: "#5A6672", faint: "#8A94A0", line: "#E2E0DA", orange: "#E8600A", green: "#0D7A3F", red: "#B3261E" };

const val = (e: HrmsEmployee, k: string) => e.value[k] ?? "";
const isActive = (e: HrmsEmployee) => val(e, "active") !== "no";

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

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return inView.filter((e) => {
      if (dept && val(e, "department") !== dept) return false;
      if (!needle) return true;
      return [e.id, val(e, "name"), val(e, "email"), val(e, "department"), val(e, "designation"), val(e, "location"), val(e, "phone")]
        .join(" ").toLowerCase().includes(needle);
    });
  }, [inView, q, dept]);

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
    { key: "id", label: "Code", width: 110, value: (e) => e.id },
    { key: "department", label: "Department", width: 150, value: (e) => val(e, "department") },
    { key: "designation", label: "Designation", width: 200, value: (e) => val(e, "designation") },
    { key: "email", label: "Work email", width: 210, value: (e) => val(e, "email") },
    { key: "location", label: "Location", width: 120, value: (e) => val(e, "location") },
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
      key: "status", label: "Status", width: 120,
      value: (e) => (isActive(e) ? "on the roll" : "left"),
      render: (e) => (
        <span className="rounded px-1.5 py-0.5 font-semibold"
          style={isActive(e) ? { background: "#E6F4EA", color: C.green } : { background: "#F1EFE9", color: C.faint }}>
          {isActive(e) ? "on the roll" : "left"}
        </span>
      ),
    },
  ], []);

  const patch = (id: string, field: string, value: string | null, edited: boolean, by: string) => {
    setLocal((prev) => (prev || []).map((e) => {
      if (e.id !== id) return e;
      const next: HrmsEmployee = { ...e, value: { ...e.value, [field]: value }, sheet: { ...e.sheet }, edited: { ...e.edited } };
      if (edited) {
        if (!(field in next.sheet) && ALL_FIELDS.find((f) => f.key === field)?.sheet) next.sheet[field] = e.value[field] ?? null;
        next.edited[field] = { by, at: new Date().toISOString() };
      } else {
        delete next.sheet[field];
        delete next.edited[field];
      }
      return next;
    }));
  };
  const save = async (id: string, field: string, value: string | null) => {
    const r = await api.post("/api/hrms/employees", { action: "edit", id, field, value });
    patch(id, field, r.value ?? null, true, who);
  };
  const clear = async (id: string, field: string) => {
    const r = await api.post("/api/hrms/employees", { action: "clear", id, field });
    patch(id, field, r.value ?? null, false, who);
  };

  const exportCsv = () => {
    const cols: Column<HrmsEmployee>[] = [
      { key: "id", label: "Employee code", width: 0, value: (e) => e.id },
      ...ALL_FIELDS.map((f) => ({ key: f.key, label: f.label, width: 0, value: (e: HrmsEmployee) => val(e, f.key) })),
    ];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([toCsv(cols, filtered)], { type: "text/csv" }));
    a.download = `Nandan_employees_${view}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const TITLE: Record<MasterView, string> = {
    active: "Active Employees",
    past: "Past Employeemaster 2025-26",
    left: "Left Employees",
  };
  const BLURB: Record<MasterView, string> = {
    active: "Everybody on the roll today.",
    past: `Everybody who joined on or before ${fmtFull(FY2526_END)} — the FY 2025-26 roll, including those who have since left. Derived from joining dates rather than a stored snapshot; upload the 2025-26 master as its own file and this becomes exact.`,
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
            <button onClick={exportCsv} className="text-xs font-bold rounded px-2.5 py-1.5" style={{ background: "#DCE8F5", color: "#1B3A5C" }} title="Download exactly what is on screen">⬇ CSV</button>
            {view === "active" && (
              <button onClick={() => setAdding((v) => !v)} className="text-xs font-bold rounded px-2.5 py-1.5" style={{ background: C.orange, color: "#fff" }} title="Somebody who has joined but is not on the HR sheet yet">+ Add person</button>
            )}
          </>
        }
      >
        {err && <div className="rounded p-2 mb-3 text-xs font-semibold" style={{ background: "#FBEDEA", color: C.red }}>{err}</div>}

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
          <span className="text-xs" style={{ color: C.faint }}>
            {all === null ? "loading…" : `${filtered.length} shown`} · click a header to sort, 📌 to freeze columns
          </span>
        </div>

        {adding && view === "active" && <AddPerson onDone={() => { setAdding(false); reload(); }} />}

        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(e) => e.id}
          onRowClick={(e) => setOpenId(e.id)}
          activeKey={openId}
          initialFrozen={1}
          empty={all === null ? "Loading the master…" : "Nobody matches that."}
        />
      </Pane>

      {open && <PersonCard e={open} who={who} onClose={() => setOpenId(null)} onSave={save} onClear={clear} />}
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

/* ────────────────────────────── the person ────────────────────────────── */

function PersonCard({
  e, who, onClose, onSave, onClear,
}: {
  e: HrmsEmployee; who: string; onClose: () => void;
  onSave: (id: string, field: string, value: string | null) => Promise<void>;
  onClear: (id: string, field: string) => Promise<void>;
}) {
  const [tab, setTab] = useState<"record" | "sheet" | "history">("record");
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => { setTab("record"); setHistory(null); setMsg(""); }, [e.id]);
  useEffect(() => {
    if (tab !== "history" || history) return;
    api.get(`/api/hrms/history?id=${encodeURIComponent(e.id)}`).then((r) => setHistory(r.history)).catch(() => setHistory([]));
  }, [tab, history, e.id]);

  const run = async (fn: () => Promise<void>) => {
    setMsg("");
    try { await fn(); setMsg("Saved ✓"); } catch (x) { setMsg(x instanceof Error ? x.message : String(x)); }
  };
  const extras = Object.entries(e.extra || {});

  return (
    <div className="fixed inset-0 flex justify-end no-print" style={{ background: "rgba(13,22,31,0.35)", zIndex: 60 }} onClick={onClose}>
      <div className="h-full overflow-y-auto" style={{ background: "#F1EFE9", width: "min(560px, 100%)", boxShadow: "-8px 0 24px rgba(0,0,0,0.18)" }} onClick={(ev) => ev.stopPropagation()}>
        <div className="px-4 py-3 sticky top-0" style={{ background: "#16232F", color: "#fff", zIndex: 2 }}>
          <div className="flex items-start gap-2">
            <div>
              <div className="font-bold">{val(e, "name") || e.id}</div>
              <div style={{ fontSize: 11, color: "#8FA1B3" }}>
                {[val(e, "designation"), val(e, "department")].filter(Boolean).join(" · ") || "no designation recorded"}
              </div>
            </div>
            <button onClick={onClose} className="ml-auto text-sm font-bold rounded px-2 py-1" style={{ background: "#22303C", color: "#8FA1B3" }}>✕</button>
          </div>
          <div className="flex gap-1 mt-2">
            {([["record", "Record"], ["sheet", `From the sheet${extras.length ? ` (${extras.length})` : ""}`], ["history", "History"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} className="text-xs font-bold rounded px-2.5 py-1"
                style={tab === k ? { background: C.orange, color: "#fff" } : { color: "#8FA1B3" }}>{l}</button>
            ))}
          </div>
        </div>

        <div className="p-4">
          {msg && <div className="text-xs font-semibold mb-2" style={{ color: msg.includes("✓") ? C.green : C.red }}>{msg}</div>}

          {tab === "record" && (
            <>
              <Section title="From the HR sheet" note="Editing one of these keeps the sheet's own value and shows it underneath. The next upload cannot undo your change." />
              {SHEET_FIELDS.map((f) => (
                <Field key={f.key} f={f} e={e} onSave={(v) => run(() => onSave(e.id, f.key, v))} onClear={() => run(() => onClear(e.id, f.key))} />
              ))}
              <Section title="Recorded in Genie" note="The sheet has never carried these, so nothing overwrites them." />
              {GENIE_FIELDS.map((f) => (
                <Field key={f.key} f={f} e={e} onSave={(v) => run(() => onSave(e.id, f.key, v))} onClear={() => run(() => onClear(e.id, f.key))} />
              ))}
              <div className="text-xs mt-3" style={{ color: C.faint }}>
                Employee code <b>{e.id}</b> · first seen {e.firstSeen ? fmtFull(String(e.firstSeen).slice(0, 10)) : "—"}
                {" · "}sheet last touched {e.updatedAt ? fmtFull(String(e.updatedAt).slice(0, 10)) : "—"}
              </div>
            </>
          )}

          {tab === "sheet" && (
            <>
              <Section title="Everything else the HR sheet carried" note="Kept verbatim, column name and all — the master has 115 columns and Genie names eight of them. The rest are here." />
              {extras.length === 0 && <div className="text-xs" style={{ color: C.faint }}>Nothing beyond the named columns.</div>}
              <div className="bg-white rounded-lg border" style={{ borderColor: C.line }}>
                {extras.map(([k, v], i) => (
                  <div key={k} className="px-3 py-1.5 flex gap-3" style={{ borderTop: i ? "1px solid #EEECE6" : undefined }}>
                    <div className="text-xs font-semibold" style={{ color: C.dim, minWidth: 170 }}>{k}</div>
                    <div className="text-xs" style={{ wordBreak: "break-word" }}>{v}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === "history" && (
            <>
              <Section title="Every change made here" note="Append-only. Nothing on this list can be edited or removed." />
              {history === null && <div className="text-xs" style={{ color: C.faint }}>loading…</div>}
              {history?.length === 0 && <div className="text-xs" style={{ color: C.faint }}>Nothing has been changed on this record.</div>}
              <div className="bg-white rounded-lg border" style={{ borderColor: C.line }}>
                {(history || []).map((h, i) => (
                  <div key={h.id} className="px-3 py-2" style={{ borderTop: i ? "1px solid #EEECE6" : undefined }}>
                    <div className="text-xs">
                      <b>{h.label}</b>{" "}
                      <span style={{ color: C.faint, textDecoration: "line-through" }}>{h.old_value || "—"}</span>{" → "}
                      <span style={{ color: C.green }}>{h.new_value || "—"}</span>
                    </div>
                    <div style={{ fontSize: 11, color: C.faint }}>{h.edited_by || "—"} · {fmtFull(String(h.edited_at).slice(0, 10))}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, note }: { title: string; note?: string }) {
  return (
    <div className="mb-2 mt-3 first:mt-0">
      <div className="font-bold text-xs" style={{ color: C.ink }}>{title}</div>
      {note && <div style={{ fontSize: 11, color: C.faint, lineHeight: 1.5 }}>{note}</div>}
    </div>
  );
}

function Field({ f, e, onSave, onClear }: { f: FieldSpec; e: HrmsEmployee; onSave: (v: string | null) => void; onClear: () => void }) {
  const current = e.value[f.key] ?? "";
  const overridden = f.key in e.edited;
  const sheetSays = e.sheet[f.key];

  return (
    <div className="bg-white rounded-lg border px-3 py-2 mb-1.5" style={{ borderColor: overridden ? "#F5C89F" : C.line }}>
      <div className="flex items-center gap-2">
        <div className="text-xs font-semibold" style={{ color: C.dim, minWidth: 130 }}>{f.label}</div>
        {f.kind === "bool" ? (
          <select value={current === "no" ? "no" : "yes"} onChange={(ev) => onSave(ev.target.value)}
            className="text-xs rounded px-2 py-1 bg-white" style={{ border: `1px solid ${C.line}` }}>
            <option value="yes">on the roll</option>
            <option value="no">no longer here</option>
          </select>
        ) : f.kind === "long" ? (
          <textarea defaultValue={current} key={f.key + current} rows={2}
            onBlur={(ev) => { if (ev.target.value !== current) onSave(ev.target.value); }}
            className="text-xs rounded px-2 py-1 flex-1" style={{ border: `1px solid ${C.line}` }} />
        ) : (
          <input defaultValue={current} key={f.key + current} placeholder="—"
            type={f.kind === "date" ? "date" : f.kind === "tel" ? "tel" : f.kind === "email" ? "email" : "text"}
            onBlur={(ev) => { if (ev.target.value !== current) onSave(ev.target.value); }}
            className="text-xs rounded px-2 py-1 flex-1" style={{ border: `1px solid ${C.line}` }} />
        )}
      </div>
      {(f.hint || overridden) && (
        <div className="mt-1" style={{ fontSize: 11, color: overridden ? "#8A5B00" : C.faint, lineHeight: 1.5 }}>
          {overridden && (
            <>
              Edited by {e.edited[f.key].by || "somebody"} on {fmtFull(String(e.edited[f.key].at).slice(0, 10))}
              {f.sheet && <> — the sheet still says <b>{sheetSays || "nothing"}</b></>}{" "}
              <button onClick={onClear} className="font-bold rounded px-1.5" style={{ background: "#F4F2EC", color: C.dim }}>
                {f.sheet ? "use the sheet's value" : "clear"}
              </button>
              {f.hint && <br />}
            </>
          )}
          {f.hint}
        </div>
      )}
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
