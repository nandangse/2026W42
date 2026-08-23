"use client";
/**
 * HRMS — the people side of Genie, at its own URL.
 *
 * v1 is the EMPLOYEE MASTER AND DIRECTORY, and only that. The master has been
 * in the database since migration 0024, uploaded every so often from the HR
 * sheet, and until now it had no screen at all: 364 people whose only visible
 * output was the birthday line on My Week.
 *
 * Two things it must get right, because everything HR is ever built on top of
 * inherits them:
 *
 *   1. AN EDIT MUST SURVIVE THE NEXT UPLOAD. The upload upserts `employees`
 *      wholesale, so a value typed into a sheet-carried column would vanish
 *      the next morning. Edits therefore go to an overlay (hrms_employee_edits)
 *      and are applied on read. Where an override masks a sheet value, the
 *      card says so and offers to put the sheet's value back.
 *
 *   2. EVERY CHANGE IS RECORDED. Who, what, from, to, when — visible on the
 *      person, and across everybody.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { LOGO } from "@/lib/logo";
import { fmtFull } from "@/lib/schedule";
import {
  SHEET_FIELDS,
  GENIE_FIELDS,
  ALL_FIELDS,
  tenure,
  type FieldSpec,
  type HrmsEmployee,
} from "@/lib/hrms";

interface HistoryRow {
  id: string;
  employee_id: string;
  field: string;
  label: string;
  old_value: string | null;
  new_value: string | null;
  edited_by: string | null;
  edited_at: string;
}

const C = {
  page: "#F1EFE9",
  ink: "#22303C",
  dim: "#5A6672",
  faint: "#8A94A0",
  line: "#E2E0DA",
  dark: "#16232F",
  orange: "#E8600A",
  green: "#0D7A3F",
  red: "#B3261E",
};

const val = (e: HrmsEmployee, k: string) => e.value[k] ?? "";
const isActive = (e: HrmsEmployee) => val(e, "active") !== "no";

export default function Hrms({ email, isOwner }: { email: string; isOwner: boolean }) {
  const [rows, setRows] = useState<HrmsEmployee[] | null>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");
  const [status, setStatus] = useState<"active" | "left" | "all">("active");
  const [sort, setSort] = useState<"name" | "doj" | "dept">("name");
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get("/api/hrms/employees");
      setRows(r.employees as HrmsEmployee[]);
      setErr("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setRows([]);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const departments = useMemo(() => {
    const s = new Set<string>();
    for (const e of rows || []) if (val(e, "department")) s.add(val(e, "department"));
    return [...s].sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = (rows || []).filter((e) => {
      if (status === "active" && !isActive(e)) return false;
      if (status === "left" && isActive(e)) return false;
      if (dept && val(e, "department") !== dept) return false;
      if (!needle) return true;
      return [
        e.id, val(e, "name"), val(e, "email"), val(e, "department"),
        val(e, "designation"), val(e, "location"), val(e, "phone"),
      ].join(" ").toLowerCase().includes(needle);
    });
    out.sort((a, b) => {
      if (sort === "doj") return (val(b, "doj") || "").localeCompare(val(a, "doj") || "");
      if (sort === "dept")
        return (val(a, "department") || "zz").localeCompare(val(b, "department") || "zz")
          || val(a, "name").localeCompare(val(b, "name"));
      return val(a, "name").localeCompare(val(b, "name"));
    });
    return out;
  }, [rows, q, dept, status, sort]);

  // Headcount, and the two figures anybody actually asks for after it.
  const stats = useMemo(() => {
    const all = rows || [];
    const active = all.filter(isActive);
    const cutoff = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
    const joined = active.filter((e) => (val(e, "doj") || "") >= cutoff).length;
    const withDoj = active.filter((e) => val(e, "doj"));
    const months = withDoj.reduce((s, e) => {
      const d = new Date(val(e, "doj") + "T00:00:00");
      if (Number.isNaN(d.getTime())) return s;
      const now = new Date();
      return s + (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
    }, 0);
    const avg = withDoj.length ? months / withDoj.length / 12 : 0;
    const missing = active.filter((e) => !val(e, "doj") || !val(e, "department")).length;
    return {
      active: active.length,
      left: all.length - active.length,
      depts: new Set(active.map((e) => val(e, "department")).filter(Boolean)).size,
      joined,
      avg,
      missing,
    };
  }, [rows]);

  const open = (rows || []).find((e) => e.id === openId) || null;

  const patch = (id: string, field: string, value: string | null, edited: boolean, by: string) => {
    setRows((prev) =>
      (prev || []).map((e) => {
        if (e.id !== id) return e;
        const next: HrmsEmployee = {
          ...e,
          value: { ...e.value, [field]: value },
          sheet: { ...e.sheet },
          edited: { ...e.edited },
        };
        if (edited) {
          // remember what the sheet held, the first time it is masked
          if (!(field in next.sheet) && ALL_FIELDS.find((f) => f.key === field)?.sheet)
            next.sheet[field] = e.value[field] ?? null;
          next.edited[field] = { by, at: new Date().toISOString() };
        } else {
          delete next.sheet[field];
          delete next.edited[field];
        }
        return next;
      }),
    );
  };

  const save = async (id: string, field: string, value: string | null) => {
    const r = await api.post("/api/hrms/employees", { action: "edit", id, field, value });
    patch(id, field, r.value ?? null, true, email);
  };
  const clear = async (id: string, field: string) => {
    const r = await api.post("/api/hrms/employees", { action: "clear", id, field });
    patch(id, field, r.value ?? null, false, email);
  };

  const exportCsv = () => {
    const cols = ["Employee code", ...ALL_FIELDS.map((f) => f.label)];
    const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const lines = [cols.join(",")];
    for (const e of filtered)
      lines.push([e.id, ...ALL_FIELDS.map((f) => val(e, f.key))].map((s) => esc(String(s))).join(","));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    a.download = `Nandan_employees_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="min-h-screen" style={{ background: C.page, color: C.ink }}>
      {/* ===== header ===== */}
      <div style={{ background: C.dark, color: "#fff" }}>
        <div className="mx-auto px-4 py-2.5 flex items-center gap-3" style={{ maxWidth: 1400 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO} alt="Nandan GSE" style={{ height: 26 }} />
          <div>
            <div className="font-bold text-sm leading-tight">HRMS</div>
            <div style={{ fontSize: 11, color: "#8FA1B3" }}>Employee master &amp; directory</div>
          </div>
          <a
            href="/"
            className="ml-auto text-xs font-semibold rounded px-2.5 py-1.5"
            style={{ background: "#22303C", color: "#8FA1B3" }}
            title="Back to Genie"
          >
            ← Genie
          </a>
          <span className="text-xs" style={{ color: "#8FA1B3" }}>{email}</span>
        </div>
      </div>

      <div className="mx-auto px-4 py-3" style={{ maxWidth: 1400 }}>
        {err && (
          <div className="rounded p-2 mb-3 text-xs font-semibold" style={{ background: "#FBEDEA", color: C.red }}>
            {err}
          </div>
        )}

        {/* ===== the five figures ===== */}
        <div className="flex gap-2 flex-wrap mb-3">
          <Stat n={stats.active} l="On the roll" hint="Active employees on the master" />
          <Stat n={stats.depts} l="Departments" />
          <Stat n={stats.joined} l="Joined, 90 days" hint="Date of joining within the last 90 days" />
          <Stat n={stats.avg ? stats.avg.toFixed(1) : "—"} l="Avg tenure, yrs" hint="Mean, over active people with a joining date" />
          <Stat n={stats.left} l="No longer here" dim />
          {stats.missing > 0 && (
            <Stat n={stats.missing} l="Incomplete" warn hint="Active people with no department or no joining date" />
          )}
        </div>

        {/* ===== filters ===== */}
        <div className="flex gap-1.5 flex-wrap items-center mb-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, code, email, designation…"
            className="text-xs rounded px-2.5 py-1.5"
            style={{ border: `1px solid ${C.line}`, background: "#fff", width: 280 }}
          />
          <select value={dept} onChange={(e) => setDept(e.target.value)} className="text-xs rounded px-2 py-1.5 bg-white" style={{ border: `1px solid ${C.line}` }}>
            <option value="">All departments</option>
            {departments.map((d) => (<option key={d} value={d}>{d}</option>))}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="text-xs rounded px-2 py-1.5 bg-white" style={{ border: `1px solid ${C.line}` }}>
            <option value="active">On the roll</option>
            <option value="left">No longer here</option>
            <option value="all">Everyone ever</option>
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="text-xs rounded px-2 py-1.5 bg-white" style={{ border: `1px solid ${C.line}` }}>
            <option value="name">Sort: name</option>
            <option value="doj">Sort: newest joiner</option>
            <option value="dept">Sort: department</option>
          </select>
          <span className="text-xs" style={{ color: C.faint }}>
            {rows === null ? "loading…" : `${filtered.length} shown`}
          </span>
          <button onClick={exportCsv} className="text-xs font-bold rounded px-2.5 py-1.5 ml-auto" style={{ background: "#DCE8F5", color: "#1B3A5C" }} title="Download exactly what is on screen, overrides applied">
            ⬇ CSV
          </button>
          <button onClick={() => setAdding((v) => !v)} className="text-xs font-bold rounded px-2.5 py-1.5" style={{ background: C.orange, color: "#fff" }} title="For somebody who has joined but is not on the HR sheet yet">
            + Add person
          </button>
        </div>

        {adding && <AddPerson onDone={() => { setAdding(false); load(); }} />}

        {/* ===== the directory ===== */}
        <div className="bg-white rounded-lg border overflow-x-auto" style={{ borderColor: C.line }}>
          <table className="text-xs w-full" style={{ minWidth: 860 }}>
            <thead>
              <tr style={{ color: C.faint, borderBottom: `1px solid ${C.line}` }}>
                <th className="text-left px-3 py-2 font-semibold">Name</th>
                <th className="text-left px-2 py-2 font-semibold">Code</th>
                <th className="text-left px-2 py-2 font-semibold">Department</th>
                <th className="text-left px-2 py-2 font-semibold">Designation</th>
                <th className="text-left px-2 py-2 font-semibold">Work email</th>
                <th className="text-left px-2 py-2 font-semibold">Joined</th>
                <th className="text-left px-2 py-2 font-semibold">Tenure</th>
                <th className="text-left px-2 py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows === null && [0, 1, 2, 3, 4].map((i) => (
                <tr key={"sk" + i} style={{ borderTop: `1px solid #EEECE6` }}>
                  <td className="px-3 py-2.5" colSpan={8}>
                    <div className="rounded" style={{ height: 11, width: `${70 - i * 8}%`, background: "#EFEDE7" }} />
                  </td>
                </tr>
              ))}
              {rows !== null && filtered.length === 0 && (
                <tr><td className="px-3 py-4" colSpan={8} style={{ color: C.faint }}>Nobody matches that.</td></tr>
              )}
              {filtered.map((e) => (
                <tr
                  key={e.id}
                  onClick={() => setOpenId(e.id)}
                  className="cursor-pointer"
                  style={{ borderTop: "1px solid #EEECE6", background: openId === e.id ? "#FFF7F0" : undefined }}
                >
                  <td className="px-3 py-1.5 font-semibold">
                    {val(e, "name") || "—"}
                    {Object.keys(e.edited).length > 0 && (
                      <span title="Edited in HRMS" style={{ color: C.orange, marginLeft: 5 }}>•</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5" style={{ color: C.faint }}>{e.id}</td>
                  <td className="px-2 py-1.5">{val(e, "department") || <Gap />}</td>
                  <td className="px-2 py-1.5" style={{ color: C.dim }}>{val(e, "designation") || <Gap />}</td>
                  <td className="px-2 py-1.5" style={{ color: C.dim }}>{val(e, "email") || <Gap />}</td>
                  <td className="px-2 py-1.5 tnum">{val(e, "doj") ? fmtFull(val(e, "doj")) : <Gap />}</td>
                  <td className="px-2 py-1.5 tnum" style={{ color: C.dim }}>{tenure(val(e, "doj"))}</td>
                  <td className="px-2 py-1.5">
                    <span className="rounded px-1.5 py-0.5 font-semibold" style={isActive(e) ? { background: "#E6F4EA", color: C.green } : { background: "#F1EFE9", color: C.faint }}>
                      {isActive(e) ? "on the roll" : "left"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="text-xs mt-2" style={{ color: C.faint, lineHeight: 1.6 }}>
          The master is fed by the <b>Employee Master</b> upload on Morning Update. Anything edited here is kept
          separately and <b>survives the next upload</b> — the card shows what the sheet still says, and puts it back on request.
          {isOwner && <> Access is granted in <b>Admin → Users</b>.</>}
        </div>
      </div>

      {open && (
        <PersonCard
          e={open}
          onClose={() => setOpenId(null)}
          onSave={save}
          onClear={clear}
        />
      )}
    </div>
  );
}

const Gap = () => <span style={{ color: "#C9C6BD" }}>—</span>;

function Stat({ n, l, hint, dim, warn }: { n: number | string; l: string; hint?: string; dim?: boolean; warn?: boolean }) {
  return (
    <div className="bg-white rounded-lg border px-3 py-2" style={{ borderColor: warn ? "#F5B32B" : C.line, minWidth: 120 }} title={hint}>
      <div className="font-bold tnum" style={{ fontSize: 22, lineHeight: 1.1, color: warn ? "#8A5B00" : dim ? C.faint : C.ink }}>{n}</div>
      <div style={{ fontSize: 11, color: C.faint }}>{l}</div>
    </div>
  );
}

/* ────────────────────────────── the person ────────────────────────────── */

function PersonCard({
  e, onClose, onSave, onClear,
}: {
  e: HrmsEmployee;
  onClose: () => void;
  onSave: (id: string, field: string, value: string | null) => Promise<void>;
  onClear: (id: string, field: string) => Promise<void>;
}) {
  const [tab, setTab] = useState<"record" | "sheet" | "history">("record");
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => { setTab("record"); setHistory(null); setMsg(""); }, [e.id]);
  useEffect(() => {
    if (tab !== "history" || history) return;
    api.get(`/api/hrms/history?id=${encodeURIComponent(e.id)}`)
      .then((r) => setHistory(r.history))
      .catch(() => setHistory([]));
  }, [tab, history, e.id]);

  const run = async (fn: () => Promise<void>) => {
    setMsg("");
    try { await fn(); setMsg("Saved ✓"); } catch (x) { setMsg(x instanceof Error ? x.message : String(x)); }
  };

  const extras = Object.entries(e.extra || {});

  return (
    <div
      className="fixed inset-0 flex justify-end"
      style={{ background: "rgba(13,22,31,0.35)", zIndex: 60 }}
      onClick={onClose}
    >
      <div
        className="h-full overflow-y-auto"
        style={{ background: C.page, width: "min(560px, 100%)", boxShadow: "-8px 0 24px rgba(0,0,0,0.18)" }}
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="px-4 py-3 sticky top-0" style={{ background: C.dark, color: "#fff" }}>
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
              <button
                key={k}
                onClick={() => setTab(k)}
                className="text-xs font-bold rounded px-2.5 py-1"
                style={tab === k ? { background: C.orange, color: "#fff" } : { color: "#8FA1B3" }}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4">
          {msg && (
            <div className="text-xs font-semibold mb-2" style={{ color: msg.includes("✓") ? C.green : C.red }}>{msg}</div>
          )}

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
              <Section title="Everything else the HR sheet carried" note="Kept verbatim, column name and all, so a column HR adds is not lost waiting for somebody to build a field for it." />
              {extras.length === 0 && <div className="text-xs" style={{ color: C.faint }}>Nothing beyond the named columns.</div>}
              <div className="bg-white rounded-lg border" style={{ borderColor: C.line }}>
                {extras.map(([k, v], i) => (
                  <div key={k} className="px-3 py-1.5 flex gap-3" style={{ borderTop: i ? "1px solid #EEECE6" : undefined }}>
                    <div className="text-xs font-semibold" style={{ color: C.dim, minWidth: 160 }}>{k}</div>
                    <div className="text-xs">{v}</div>
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
                    <div style={{ fontSize: 11, color: C.faint }}>
                      {h.edited_by || "—"} · {fmtFull(String(h.edited_at).slice(0, 10))}
                    </div>
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

function Field({
  f, e, onSave, onClear,
}: {
  f: FieldSpec;
  e: HrmsEmployee;
  onSave: (v: string | null) => void;
  onClear: () => void;
}) {
  const current = e.value[f.key] ?? "";
  const overridden = f.key in e.edited;
  const sheetSays = e.sheet[f.key];

  return (
    <div className="bg-white rounded-lg border px-3 py-2 mb-1.5" style={{ borderColor: overridden ? "#F5C89F" : C.line }}>
      <div className="flex items-center gap-2">
        <div className="text-xs font-semibold" style={{ color: C.dim, minWidth: 130 }}>{f.label}</div>
        {f.kind === "bool" ? (
          <select
            value={current === "no" ? "no" : "yes"}
            onChange={(ev) => onSave(ev.target.value)}
            className="text-xs rounded px-2 py-1 bg-white"
            style={{ border: `1px solid ${C.line}` }}
          >
            <option value="yes">on the roll</option>
            <option value="no">no longer here</option>
          </select>
        ) : f.kind === "long" ? (
          <textarea
            defaultValue={current}
            key={f.key + current}
            onBlur={(ev) => { if (ev.target.value !== current) onSave(ev.target.value); }}
            rows={2}
            className="text-xs rounded px-2 py-1 flex-1"
            style={{ border: `1px solid ${C.line}` }}
          />
        ) : (
          <input
            defaultValue={current}
            key={f.key + current}
            type={f.kind === "date" ? "date" : f.kind === "tel" ? "tel" : f.kind === "email" ? "email" : "text"}
            placeholder="—"
            onBlur={(ev) => { if (ev.target.value !== current) onSave(ev.target.value); }}
            className="text-xs rounded px-2 py-1 flex-1"
            style={{ border: `1px solid ${C.line}` }}
          />
        )}
      </div>
      {(f.hint || overridden) && (
        <div className="mt-1" style={{ fontSize: 11, color: overridden ? "#8A5B00" : C.faint, lineHeight: 1.5 }}>
          {overridden && (
            <>
              Edited by {e.edited[f.key].by || "somebody"} on {fmtFull(String(e.edited[f.key].at).slice(0, 10))}
              {f.sheet && <> — the sheet still says <b>{sheetSays || "nothing"}</b></>}
              {" "}
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

/* ────────────────────────────── new joiner ────────────────────────────── */

function AddPerson({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ name: "", id: "", email: "", department: "", designation: "", doj: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const submit = async () => {
    if (!f.name.trim()) { setMsg("A name is required"); return; }
    setBusy(true);
    setMsg("");
    try {
      await api.post("/api/hrms/employees", { action: "create", ...f });
      onDone();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const inp = (k: keyof typeof f, ph: string, w = 150) => (
    <input
      value={f[k]}
      onChange={(e) => setF({ ...f, [k]: e.target.value })}
      placeholder={ph}
      className="text-xs rounded px-2 py-1.5"
      style={{ border: `1px solid ${C.line}`, width: w }}
    />
  );

  return (
    <div className="bg-white rounded-lg border p-3 mb-2" style={{ borderColor: C.line }}>
      <div className="font-bold text-xs mb-1">Somebody the HR sheet has not caught up with</div>
      <div style={{ fontSize: 11, color: C.faint, lineHeight: 1.5 }} className="mb-2">
        Give the <b>employee code</b> if HR has already issued one — the next Employee Master upload then updates this
        person instead of creating a second record for them. Without a code, one is made from the name.
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
