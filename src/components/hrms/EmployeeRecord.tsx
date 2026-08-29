"use client";
/**
 * The HRIS record — one employee, editable, in its own tab.
 *
 * Reached only from the lightbox's "Edit Record" button, and deliberately at
 * its own URL: editing a personnel record is not something to do in a panel
 * over a list you might click away from. Opening it in a new tab means the
 * directory stays where it was.
 *
 * TABS ACROSS THE TOP, one per group of the record, plus the history. The
 * record has around a hundred fields and a single scroll is not a form
 * anybody can fill.
 *
 * Every change is written the moment the field is left, and every change is
 * logged with the initials of whoever made it. There is no Save button on
 * purpose — a Save button on a hundred-field form is a promise to lose
 * somebody's work.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { LOGO } from "@/lib/logo";
import { APP_VERSION } from "@/lib/changelog";
import { fmtFull } from "@/lib/schedule";
import { FIELD_GROUPS, ALL_FIELDS, onRoll, tenure, splitMulti, joinMulti, type FieldSpec, type HrmsEmployee } from "@/lib/hrms";
import { C, type GenieUser } from "./RecordFields";
import { RoleClarity, PersonCompetency } from "./PersonRoleAndCompetency";

interface HistoryRow {
  id: string; field: string; label: string;
  old_value: string | null; new_value: string | null;
  by_initials: string | null; by_email: string | null; edited_at: string;
}

export default function EmployeeRecord({
  id, email, initials, displayName, isOwner,
}: {
  id: string; email: string; initials: string | null; displayName: string | null; isOwner: boolean;
}) {
  const [e, setE] = useState<HrmsEmployee | null>(null);
  const [users, setUsers] = useState<GenieUser[]>([]);
  const [masters, setMasters] = useState<Record<string, { value: string }[]>>({});
  const [tab, setTab] = useState<string>(FIELD_GROUPS[0].key);
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await api.get(`/api/hrms/employees?id=${encodeURIComponent(id)}`);
      setE((r.employees || [])[0] ?? null);
      setUsers(r.users || []);
      setErr("");
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    /**
     * BOTH LISTS MERGE INTO THE SAME MAP, and both must MERGE rather than
     * replace. They did not: whichever request finished second overwrote the
     * first, and because the masters call is the quicker of the two it
     * usually landed last and wiped the roles — so every role on every record
     * displayed as "(not on the list)" while being perfectly well saved. The
     * value was right and the dropdown was lying about it.
     */
    api.get("/api/hrms/masters")
      .then((r) => setMasters((m) => ({ ...m, ...(r.masters || {}) })))
      .catch(() => {});
    // Roles are not a Module Master — they are a register with a JD and a
    // metric behind each one. Same dropdown, different source of truth.
    api.get("/api/hrms/roles")
      .then((r) => setMasters((m) => ({
        ...m,
        __roles__: (r.roles || []).map((x: { role: string }) => ({ value: x.role })),
      })))
      .catch(() => {});
  }, []);

  const loadHistory = useCallback(async () => {
    const r = await api.get(`/api/hrms/history?id=${encodeURIComponent(id)}`);
    setHistory(r.history);
  }, [id]);
  useEffect(() => { if (tab === "history" && !history) loadHistory().catch(() => setHistory([])); }, [tab, history, loadHistory]);

  const save = async (field: string, value: string | null) => {
    setMsg("");
    try {
      const r = await api.post("/api/hrms/employees", { action: "edit", id, field, value });
      setE((prev) => {
        if (!prev) return prev;
        const next: HrmsEmployee = { ...prev, value: { ...prev.value, [field]: r.value ?? null }, sheet: { ...prev.sheet }, edited: { ...prev.edited } };
        if (!(field in next.sheet)) next.sheet[field] = prev.value[field] ?? null;
        next.edited[field] = { by: initials ? `${initials} · ${email}` : email, at: new Date().toISOString() };
        return next;
      });
      setMsg(`Saved ✓  ${new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })}`);
      setHistory(null); // the log has moved on
    } catch (x) {
      setMsg(x instanceof Error ? x.message : String(x));
    }
  };

  const clear = async (field: string) => {
    setMsg("");
    try {
      const r = await api.post("/api/hrms/employees", { action: "clear", id, field });
      setE((prev) => {
        if (!prev) return prev;
        const next: HrmsEmployee = { ...prev, value: { ...prev.value, [field]: r.value ?? null }, sheet: { ...prev.sheet }, edited: { ...prev.edited } };
        delete next.sheet[field];
        delete next.edited[field];
        return next;
      });
      setMsg("Reverted ✓");
      setHistory(null);
    } catch (x) {
      setMsg(x instanceof Error ? x.message : String(x));
    }
  };

  const group = useMemo(() => FIELD_GROUPS.find((g) => g.key === tab), [tab]);
  const who = displayName || email;
  /**
   * HR writes; the owner agrees. Anything changed and not yet approved is a
   * PROPOSED change — it is in the record, and it is not yet agreed. Both
   * facts are shown, because hiding either one is a way of lying about the
   * state of somebody's file.
   */
  const pending = e ? Object.entries(e.edited).filter(([, v]) => v.pending) : [];

  const approveAll = async () => {
    setMsg("");
    try {
      await api.post("/api/hrms/approvals", { employeeIds: [id] });
      setMsg("Approved ✓");
      await load();
    } catch (x) { setMsg(x instanceof Error ? x.message : String(x)); }
  };

  if (err) return <Shell who={who} initials={initials}><div className="p-4 text-xs font-semibold" style={{ color: C.red }}>{err}</div></Shell>;
  if (!e) return <Shell who={who} initials={initials}><div className="p-4 text-xs" style={{ color: C.faint }}>Loading the record…</div></Shell>;

  return (
    <Shell
      who={who}
      initials={initials}
      title={e.value.name || id}
      sub={[e.value.designation, e.value.department].filter(Boolean).join(" · ")}
      idLine={`Employee ID ${id}${e.value.initials ? ` · ${e.value.initials}` : ""}`}
    >
      {e && pending.length > 0 && (
        <div className="px-3 md:px-4 py-2 flex items-center gap-2 flex-wrap no-print"
          style={{ background: "#FFF7E6", borderBottom: "1px solid #F5B32B" }}>
          <span className="text-xs" style={{ color: "#8A5B00", lineHeight: 1.5 }}>
            <b>{pending.length} change{pending.length === 1 ? "" : "s"} waiting on Dr Raghu</b> —{" "}
            {pending.slice(0, 4).map(([k]) => ALL_FIELDS.find((f) => f.key === k)?.label || k).join(", ")}
            {pending.length > 4 && ` and ${pending.length - 4} more`}. They are in the record already; approving agrees them.
          </span>
          {isOwner ? (
            <button onClick={approveAll} className="text-xs font-bold rounded px-3 py-1.5 ml-auto"
              style={{ background: "#0D7A3F", color: "#fff" }}>
              ✓ Approve
            </button>
          ) : (
            <span className="text-xs ml-auto" style={{ color: "#8A5B00" }}>
              Also listed under Approvals → RJ Approval - Records.
            </span>
          )}
        </div>
      )}

      {/* ── the tabs ── */}
      <div className="flex gap-1 flex-wrap px-3 pt-2 pb-1" style={{ background: "#EAE7DF", borderBottom: "1px solid #DCD9D1" }}>
        {FIELD_GROUPS.map((g) => (
          <button key={g.key} onClick={() => setTab(g.key)}
            className="text-xs font-bold rounded px-2.5 py-1.5"
            style={tab === g.key ? { background: "#16232F", color: "#fff" } : { color: "#5B6B7A" }}>
            {g.label}
            {g.confidential && <span style={{ marginLeft: 4, color: tab === g.key ? "#F5B32B" : "#B3261E" }}>•</span>}
          </button>
        ))}
        <button onClick={() => setTab("__clarity__")}
          className="text-xs font-bold rounded px-2.5 py-1.5"
          style={tab === "__clarity__" ? { background: "#16232F", color: "#fff" } : { color: "#5B6B7A" }}>
          Role Clarity Document
        </button>
        <button onClick={() => setTab("__competency__")}
          className="text-xs font-bold rounded px-2.5 py-1.5"
          style={tab === "__competency__" ? { background: "#16232F", color: "#fff" } : { color: "#5B6B7A" }}>
          Competency
        </button>
        <button onClick={() => setTab("history")}
          className="text-xs font-bold rounded px-2.5 py-1.5"
          style={tab === "history" ? { background: "#16232F", color: "#fff" } : { color: "#5B6B7A" }}>
          History
        </button>
        <span className="text-xs ml-auto self-center" style={{ color: msg.includes("✓") ? C.green : msg ? C.red : C.faint }}>
          {msg || "Every field saves when you leave it — there is no Save button."}
        </span>
      </div>

      <div className="p-3 md:p-4" style={{ maxWidth: 860 }}>
        {group?.key === "documents" && !onRoll(e.value) &&
          /^\s*active\s*-/i.test(String(e.value.drive_folder_name || "")) && (
          <div className="rounded p-3 mb-2" style={{ background: "#FBEDEA", border: "1px solid #B3261E" }}>
            <div className="text-xs font-bold" style={{ color: C.red }}>
              CHECKLIST — this file cannot be closed yet
            </div>
            <div className="text-xs mt-1" style={{ color: C.dim, lineHeight: 1.6 }}>
              {e.value.name} is <b>{e.value.status || "no longer on the roll"}</b>, but the Drive folder is still called{" "}
              <b>{e.value.drive_folder_name}</b>. Rename it in Drive to start with <b>Inactive -</b>, then correct it here.
              The link does not change; only the name does, and the name is what makes it findable.
            </div>
          </div>
        )}
        {group && (
          <>
            {group.note && (
              <div className="rounded p-2 mb-2" style={{ background: "#F4F2EC", fontSize: 11, color: C.dim, lineHeight: 1.6 }}>
                {group.note}
              </div>
            )}
            {group.fields.map((f) => (
              <EditField key={f.key} f={f} e={e} users={users} masters={masters}
                onSave={(v) => save(f.key, v)} onClear={() => clear(f.key)} />
            ))}
          </>
        )}

        {tab === "__clarity__" && e && (
          <RoleClarity employeeId={id} roles={splitMulti(e.value.role)} />
        )}

        {tab === "__competency__" && <PersonCompetency employeeId={id} />}

        {tab === "history" && (
          <>
            <div className="rounded p-2 mb-2" style={{ background: "#F4F2EC", fontSize: 11, color: C.dim, lineHeight: 1.6 }}>
              Every change ever made to this record — who, what, from, to, and when. Append-only: nothing on this
              list can be edited or removed.
            </div>
            {history === null && <div className="text-xs" style={{ color: C.faint }}>loading…</div>}
            {history?.length === 0 && <div className="text-xs" style={{ color: C.faint }}>Nothing has been changed on this record yet.</div>}
            <div className="bg-white rounded-lg border" style={{ borderColor: C.line }}>
              {(history || []).map((h, i) => (
                <div key={h.id} className="px-3 py-2" style={{ borderTop: i ? "1px solid #EEECE6" : undefined }}>
                  <div className="text-xs" style={{ lineHeight: 1.6 }}>
                    <span className="rounded px-1.5 py-0.5 font-bold" style={{ background: "#E8600A", color: "#fff", fontSize: 10 }}>
                      {h.by_initials || "—"}
                    </span>{" "}
                    <span style={{ color: C.faint }}>
                      on {fmtFull(String(h.edited_at))} at{" "}
                      {new Date(h.edited_at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })}
                    </span>{" "}
                    changed <b>{h.label}</b>{" "}
                    <span style={{ color: C.faint, textDecoration: "line-through" }}>{h.old_value || "—"}</span>{" → "}
                    <span style={{ color: C.green }}>{h.new_value || "—"}</span>
                  </div>
                  {h.by_email && <div style={{ fontSize: 10.5, color: "#B8B5AC" }}>{h.by_email}</div>}
                </div>
              ))}
            </div>
          </>
        )}

        <div className="text-xs mt-4" style={{ color: C.faint, lineHeight: 1.6 }}>
          Employee ID <b>{id}</b> · {onRoll(e.value) ? "on the roll" : "not on the roll"}
          {e.value.doj && <> · {tenure(e.value.doj)} of service</>}
          {" · "}first seen {e.firstSeen ? fmtFull(String(e.firstSeen)) : "—"}
        </div>
      </div>
    </Shell>
  );
}

function Shell({
  children, who, initials, title, sub, idLine,
}: {
  children: React.ReactNode; who: string; initials: string | null;
  title?: string; sub?: string; idLine?: string;
}) {
  return (
    <div className="min-h-screen" style={{ background: "#F1EFE9", color: C.ink }}>
      <div style={{ background: "#16232F", color: "#fff" }}>
        <div className="px-3 py-2 flex items-center gap-2.5">
          <div className="rounded bg-white px-1.5 py-1 flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO} alt="Nandan GSE" style={{ height: 22, display: "block" }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="text-xs tracking-widest font-bold" style={{ color: "#E8600A" }}>
              HRIS
              <span style={{ background: "#E8600A", color: "#fff", borderRadius: 3, padding: "1px 5px", marginLeft: 6, letterSpacing: 0 }}>
                V {APP_VERSION}
              </span>
            </div>
            <div className="font-bold text-white leading-tight truncate" style={{ fontSize: 14 }}>
              {title || "Employee record"}
            </div>
            {sub && <div style={{ fontSize: 11, color: "#8FA1B3" }}>{sub}</div>}
          </div>
          {idLine && <span className="hidden md:block" style={{ fontSize: 11, color: "#8FA1B3" }}>{idLine}</span>}
          <a href="/hrms" className="ml-auto text-xs font-semibold rounded px-2.5 py-1.5 flex-shrink-0"
            style={{ background: "#22303C", color: "#8FA1B3" }}>← HRMS</a>
          <span className="rounded-full font-bold flex items-center justify-center flex-shrink-0"
            style={{ width: 26, height: 26, fontSize: 11, background: initials ? "#E8600A" : "#B3261E", color: "#fff" }}
            title={who}>
            {initials || "??"}
          </span>
        </div>
      </div>
      {children}
    </div>
  );
}

function EditField({
  f, e, users, masters, onSave, onClear,
}: {
  f: FieldSpec; e: HrmsEmployee; users: GenieUser[];
  masters: Record<string, { value: string }[]>;
  onSave: (v: string | null) => void; onClear: () => void;
}) {
  if (f.derived) {
    const v = f.derived(e.value);
    return (
      <div className="rounded px-3 py-1.5 mb-1.5 flex items-center gap-2" style={{ background: "#F4F2EC" }}>
        <div className="text-xs font-semibold" style={{ color: C.faint, minWidth: 150 }}>{f.label}</div>
        <div className="text-xs tnum" style={{ color: C.dim }}>{v ?? "—"}</div>
        <div style={{ fontSize: 10.5, color: "#B8B5AC", marginLeft: "auto", textAlign: "right", maxWidth: 320 }}>
          {f.hint || "worked out, not typed"}
        </div>
      </div>
    );
  }

  const current = e.value[f.key] ?? "";
  const overridden = f.key in e.edited;
  const was = e.sheet[f.key];
  const inputType = f.kind === "date" ? "date" : f.kind === "tel" ? "tel" : f.kind === "email" ? "email"
    : f.kind === "url" ? "url" : "text";

  return (
    <div className="bg-white rounded-lg border px-3 py-2 mb-1.5" style={{ borderColor: overridden ? "#F5C89F" : C.line }}>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="text-xs font-semibold" style={{ color: C.dim, minWidth: 150 }}>{f.label}</div>

        {f.kind === "multi" ? (
          (() => {
            /**
             * SEVERAL ROLES, because people here hold more than one — a
             * supervisor who is also the safety officer is accountable for
             * both, and one box could only ever record half of that. Each is
             * added from the register and removed with its own ×; the IDP
             * then briefs them on all of them.
             */
            const chosen = splitMulti(current);
            const all = f.master ? (masters[f.master] || []).map((m) => m.value) : [];
            const left = all.filter((o) => !chosen.includes(o));
            return (
              <div style={{ flex: 1, minWidth: 240 }}>
                <div className="flex gap-1 flex-wrap">
                  {chosen.map((r, i) => (
                    <span key={r} className="rounded px-2 py-0.5 flex items-center gap-1"
                      style={{ background: "#FFF3E8", border: "1px solid #F5C89F", fontSize: 12 }}>
                      {i === 0 && <span title="Listed first — the main one" style={{ color: C.orange, fontWeight: 700 }}>★</span>}
                      {r}
                      <button onClick={() => onSave(joinMulti(chosen.filter((x) => x !== r)))}
                        style={{ color: C.red, fontWeight: 700 }} title={`Remove ${r}`}>×</button>
                    </span>
                  ))}
                  {chosen.length === 0 && <span style={{ fontSize: 12, color: "#C9C6BD" }}>no role yet</span>}
                </div>
                <select value="" onChange={(ev) => { if (ev.target.value) onSave(joinMulti([...chosen, ev.target.value])); }}
                  className="text-xs rounded px-2 py-1 bg-white mt-1.5" style={{ border: `1px solid ${C.line}`, maxWidth: 320 }}>
                  <option value="">+ add a role…</option>
                  {left.map((o) => (<option key={o} value={o}>{o}</option>))}
                </select>
              </div>
            );
          })()
        ) : f.kind === "select" ? (
          (() => {
            // The master is the list. f.options is only the fallback for the
            // two lists that are policy (Status, Type) before 0049 is run.
            const fromMaster = f.master ? (masters[f.master] || []).map((m) => m.value) : [];
            const opts = fromMaster.length ? fromMaster : f.options || [];
            // A list that has not arrived yet is not evidence that the value
            // is wrong. Only say "not on the list" once there IS a list.
            const orphan = current && opts.length > 0 && !opts.includes(current);
            return (
              <>
                <select value={current} onChange={(ev) => onSave(ev.target.value)}
                  className="text-xs rounded px-2 py-1 bg-white"
                  style={{ border: `1px solid ${orphan ? "#F5B32B" : C.line}`, minWidth: 170 }}>
                  <option value="">— not set —</option>
                  {/* what it says today, even if the master no longer offers it */}
                  {orphan && <option value={current}>{current} (not on the list)</option>}
                  {opts.map((o) => (<option key={o} value={o}>{o}</option>))}
                </select>
                {f.master && (
                  <a href="/hrms#masters" target="_blank" rel="noopener noreferrer"
                     className="text-xs" style={{ color: C.faint }} title="Manage this list in Module Masters">
                    list ↗
                  </a>
                )}
              </>
            );
          })()
        ) : f.kind === "user" ? (
          <select value={current} onChange={(ev) => onSave(ev.target.value)}
            className="text-xs rounded px-2 py-1 bg-white" style={{ border: `1px solid ${C.line}`, minWidth: 230 }}>
            <option value="">— not a Genie user —</option>
            {users.map((u) => (
              <option key={u.email} value={u.email}>
                {u.name || u.email}{u.initials ? ` (${u.initials})` : ""} — {u.role.replace("_", " ")}
              </option>
            ))}
          </select>
        ) : f.kind === "bool" ? (
          <select value={current === "no" ? "no" : "yes"} onChange={(ev) => onSave(ev.target.value)}
            className="text-xs rounded px-2 py-1 bg-white" style={{ border: `1px solid ${C.line}` }}>
            <option value="yes">yes</option>
            <option value="no">no</option>
          </select>
        ) : f.kind === "long" ? (
          <textarea defaultValue={current} key={f.key + current} rows={3}
            onBlur={(ev) => { if (ev.target.value !== current) onSave(ev.target.value); }}
            className="text-xs rounded px-2 py-1 flex-1" style={{ border: `1px solid ${C.line}`, minWidth: 240 }} />
        ) : (
          <input defaultValue={current} key={f.key + current} placeholder="—" type={inputType}
            onBlur={(ev) => {
              const v = f.unique ? ev.target.value.toUpperCase() : ev.target.value;
              if (v !== current) onSave(v);
            }}
            className={`text-xs rounded px-2 py-1 flex-1 ${f.kind === "money" || f.kind === "number" ? "tnum" : ""}`}
            style={{
              border: `1px solid ${C.line}`, minWidth: 200,
              textAlign: f.kind === "money" || f.kind === "number" ? "right" : undefined,
              textTransform: f.unique ? "uppercase" : undefined,
            }} />
        )}

        {f.kind === "url" && current && /^https?:\/\//i.test(current) && (
          <a href={current} target="_blank" rel="noopener noreferrer" className="text-xs font-bold" style={{ color: "#1B3A5C" }}>open ↗</a>
        )}
      </div>
      {f.optionNotes && current && f.optionNotes[current] && (
        <div className="mt-1 rounded px-2 py-1" style={{ background: "#F4F2EC", fontSize: 11, color: C.dim, lineHeight: 1.5 }}>
          {f.optionNotes[current]}
        </div>
      )}
      {(f.hint || overridden) && (
        <div className="mt-1" style={{ fontSize: 11, color: overridden ? "#8A5B00" : C.faint, lineHeight: 1.5 }}>
          {overridden && (
            <>
              {e.edited[f.key].pending && (
                <span className="rounded px-1 font-bold" style={{ background: "#F5B32B", color: "#4A3300", fontSize: 10, marginRight: 4 }}>
                  awaiting approval
                </span>
              )}
              Changed by {e.edited[f.key].by || "somebody"} on {fmtFull(String(e.edited[f.key].at))}
              {was != null && was !== "" && <> — it said <b>{was}</b></>}{" "}
              <button onClick={onClear} className="font-bold rounded px-1.5" style={{ background: "#F4F2EC", color: C.dim }}>
                {was != null && was !== "" ? "put it back" : "clear"}
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
