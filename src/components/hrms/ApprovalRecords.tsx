"use client";
/**
 * Approvals → RJ Approval - Records.
 *
 * Everything HR has changed and Dr Raghu has not yet seen — changes to a
 * PERSON'S RECORD and changes to a ROLE DEFINITION, in one place, because
 * two queues would mean one of them goes unread.
 *
 * BUILT FOR CLEARING IN ONE SITTING. Tick, tick, tick, Approve — or Select
 * all and one press. Each row already says who changed what, so opening the
 * record is a choice rather than a step: the button is there when the change
 * deserves a proper look, and the summary is there when it does not.
 *
 * Approving alters no value. The change was in the record from the moment it
 * was saved; what approval changes is its standing — proposed becomes agreed.
 * Nothing can be lost by pressing it.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { fmtFull } from "@/lib/schedule";
import { Pane } from "./Pane";
import { C } from "./RecordFields";

interface PersonPending {
  id: string; name: string; count: number; last: string | null; by: string | null;
  changes: { field: string; label: string; value: string | null; by: string | null; at: string }[];
}
interface RolePending { id: string; role: string; department: string | null; by: string | null; since: string | null }

const initialsOf = (s: string | null) => String(s || "—").split("·")[0].trim();

export default function ApprovalRecords({ who, isOwner }: { who: string; isOwner: boolean }) {
  const [people, setPeople] = useState<PersonPending[] | null>(null);
  const [roles, setRoles] = useState<RolePending[]>([]);
  const [pick, setPick] = useState<Record<string, boolean>>({});
  const [rolePick, setRolePick] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const j = await api.get("/api/hrms/approvals");
      setPeople(j.people || []);
      setRoles(j.roles || []);
      setPick({}); setRolePick({});
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); setPeople([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const chosen = useMemo(() => Object.keys(pick).filter((k) => pick[k]), [pick]);
  const chosenRoles = useMemo(() => Object.keys(rolePick).filter((k) => rolePick[k]), [rolePick]);
  const total = (people?.length || 0) + roles.length;
  const picked = chosen.length + chosenRoles.length;

  const approve = async (body: Record<string, unknown>, label: string) => {
    setBusy(true); setMsg("");
    try {
      const j = await api.post("/api/hrms/approvals", body);
      setMsg(`${label} — ${j.people} field change${j.people === 1 ? "" : "s"}${j.roles ? ` and ${j.roles} role definition${j.roles === 1 ? "" : "s"}` : ""} approved ✓`);
      await load();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };

  const allOn = (people?.length || 0) > 0 && chosen.length === people?.length && chosenRoles.length === roles.length;
  const toggleAll = () => {
    if (allOn) { setPick({}); setRolePick({}); return; }
    setPick(Object.fromEntries((people || []).map((p) => [p.id, true])));
    setRolePick(Object.fromEntries(roles.map((r) => [r.id, true])));
  };

  return (
    <Pane title="RJ Approval - Records" who={who}
      blurb="Everything HR has changed that you have not yet seen. Approving does not alter a value — it agrees the change that is already there.">
      {msg && <div className="text-xs font-semibold mb-2" style={{ color: msg.includes("✓") ? C.green : C.red }}>{msg}</div>}

      {!isOwner && (
        <div className="rounded p-2 mb-3" style={{ background: "#F4F2EC", fontSize: 11, color: C.dim, lineHeight: 1.5 }}>
          You can see what is waiting; approving is Dr Raghu&apos;s. Write the change and it appears here.
        </div>
      )}

      {people === null && <div className="text-xs" style={{ color: C.faint }}>loading…</div>}

      {people !== null && total === 0 && (
        <div className="bg-white rounded-lg border p-5" style={{ borderColor: C.line, maxWidth: 640 }}>
          <div className="font-bold text-sm" style={{ color: C.green }}>Nothing waiting.</div>
          <div className="text-xs mt-1" style={{ color: C.dim, lineHeight: 1.6 }}>
            Every change to a record and every role definition has been seen since it was last touched. The moment HR
            edits anything, it appears here.
          </div>
        </div>
      )}

      {total > 0 && (
        <>
          <div className="flex items-center gap-2 flex-wrap mb-2 no-print">
            <label className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: C.dim, cursor: "pointer" }}>
              <input type="checkbox" checked={allOn} onChange={toggleAll} style={{ accentColor: "#E8600A", width: 14, height: 14 }} />
              Select all ({total})
            </label>
            <button onClick={() => approve({ employeeIds: chosen, roleIds: chosenRoles }, "Approved")}
              disabled={!isOwner || busy || !picked}
              className="text-xs font-bold rounded px-3 py-1.5"
              style={{ background: isOwner && picked ? "#0D7A3F" : "#E2E0DA", color: isOwner && picked ? "#fff" : "#8A94A0", cursor: isOwner && picked ? "pointer" : "not-allowed" }}>
              ✓ Approve selected{picked ? ` (${picked})` : ""}
            </button>
            <button onClick={() => { if (window.confirm(`Approve everything waiting — ${total} record${total === 1 ? "" : "s"}?`)) approve({ all: true }, "Approved everything"); }}
              disabled={!isOwner || busy}
              className="text-xs font-bold rounded px-3 py-1.5"
              style={{ background: "#fff", border: `1px solid ${C.line}`, color: isOwner ? C.dim : "#B8B5AC", cursor: isOwner ? "pointer" : "not-allowed" }}>
              ✓✓ Approve all
            </button>
            <span className="text-xs" style={{ color: C.faint }}>
              {people?.length || 0} record{(people?.length || 0) === 1 ? "" : "s"} · {roles.length} role definition{roles.length === 1 ? "" : "s"}
            </span>
          </div>

          {/* ── people ── */}
          {(people?.length || 0) > 0 && (
            <>
              <div className="font-bold text-xs mb-1 mt-3" style={{ color: C.ink }}>Employee records</div>
              <div className="bg-white rounded-lg border" style={{ borderColor: C.line }}>
                {(people || []).map((p, i) => (
                  <div key={p.id} style={{ borderTop: i ? "1px solid #EEECE6" : undefined }}>
                    <div className="px-3 py-2 flex items-center gap-2 flex-wrap">
                      <input type="checkbox" checked={!!pick[p.id]} onChange={(e) => setPick((s) => ({ ...s, [p.id]: e.target.checked }))}
                        style={{ accentColor: "#E8600A", width: 14, height: 14 }} />
                      <span className="text-xs tnum font-bold" style={{ minWidth: 64 }}>{p.id}</span>
                      <span className="text-xs font-semibold" style={{ minWidth: 180, flex: 1 }}>{p.name}</span>
                      <button onClick={() => setOpenId(openId === p.id ? null : p.id)}
                        className="text-xs rounded px-2 py-0.5" style={{ background: "#F4F2EC", color: C.dim }}
                        title="What changed">
                        {openId === p.id ? "▾" : "▸"} {p.count} change{p.count === 1 ? "" : "s"}
                      </button>
                      <span className="text-xs" style={{ color: C.dim, minWidth: 190 }}>
                        {p.changes.slice(0, 2).map((c) => c.label).join(", ")}
                        {p.count > 2 && ` and ${p.count - 2} more`}
                      </span>
                      <span className="text-xs" style={{ color: C.faint, minWidth: 150 }}>
                        {initialsOf(p.by)} · {p.last ? fmtFull(String(p.last).slice(0, 10)) : ""}
                      </span>
                      <a href={`/hrms/employee/${encodeURIComponent(p.id)}`} target="_blank" rel="noopener noreferrer"
                        className="text-xs font-bold rounded px-2 py-0.5" style={{ background: "#DCE8F5", color: "#1B3A5C" }}
                        title="Open the record in a new tab">open ↗</a>
                      {isOwner && (
                        <button onClick={() => approve({ employeeIds: [p.id] }, `${p.name} approved`)} disabled={busy}
                          className="text-xs font-bold rounded px-2.5 py-1" style={{ background: "#0D7A3F", color: "#fff" }}>
                          ✓
                        </button>
                      )}
                    </div>
                    {openId === p.id && (
                      <div className="px-3 pb-2" style={{ paddingLeft: 34 }}>
                        {p.changes.map((c, k) => (
                          <div key={k} className="text-xs py-0.5" style={{ color: C.dim, lineHeight: 1.6 }}>
                            <b>{c.label}</b> → <span style={{ color: C.green }}>{c.value || "—"}</span>
                            <span style={{ color: C.faint }}>
                              {"  "}({initialsOf(c.by)}, {fmtFull(String(c.at).slice(0, 10))})
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── roles ── */}
          {roles.length > 0 && (
            <>
              <div className="font-bold text-xs mb-1 mt-4" style={{ color: C.ink }}>Role definitions</div>
              <div className="bg-white rounded-lg border" style={{ borderColor: C.line }}>
                {roles.map((r, i) => (
                  <div key={r.id} className="px-3 py-2 flex items-center gap-2 flex-wrap" style={{ borderTop: i ? "1px solid #EEECE6" : undefined }}>
                    <input type="checkbox" checked={!!rolePick[r.id]} onChange={(e) => setRolePick((s) => ({ ...s, [r.id]: e.target.checked }))}
                      style={{ accentColor: "#E8600A", width: 14, height: 14 }} />
                    <span className="text-xs font-semibold" style={{ minWidth: 220, flex: 1 }}>{r.role}</span>
                    <span className="text-xs" style={{ color: C.dim, minWidth: 140 }}>{r.department || "—"}</span>
                    <span className="text-xs" style={{ color: C.faint, minWidth: 150 }}>
                      {initialsOf(r.by)} · {r.since ? fmtFull(String(r.since).slice(0, 10)) : ""}
                    </span>
                    <a href={`/hrms/role/${encodeURIComponent(r.id)}`} target="_blank" rel="noopener noreferrer"
                      className="text-xs font-bold rounded px-2 py-0.5" style={{ background: "#DCE8F5", color: "#1B3A5C" }}>open ↗</a>
                    {isOwner && (
                      <button onClick={() => approve({ roleIds: [r.id] }, `${r.role} approved`)} disabled={busy}
                        className="text-xs font-bold rounded px-2.5 py-1" style={{ background: "#0D7A3F", color: "#fff" }}>✓</button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </Pane>
  );
}
