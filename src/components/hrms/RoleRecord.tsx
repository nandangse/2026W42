"use client";
/**
 * One role, editable, in its own tab.
 *
 * TWO COLUMNS (Dr Raghu, 23 Aug 2026). On the left the written definition —
 * the five identifying boxes across the top, then Job Description,
 * Deliverable and Measurement Metric, each a large rich-text box. On the
 * right the Management Expectation Note, which is spoken rather than typed
 * and belongs beside the writing rather than under it.
 *
 * EVERY CHANGE PUTS THE ROLE IN FRONT OF DR RAGHU. The moment anything is
 * edited the role appears under Approvals -> RJ Approval - Records. It stays
 * a Draft either way: Draft/Final is whether the role is AGREED, pending is
 * whether the latest edit has been SEEN, and only he settles either.
 */
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { LOGO } from "@/lib/logo";
import { APP_VERSION } from "@/lib/changelog";
import { fmtFull } from "@/lib/schedule";
import RichText from "./RichText";
import VoiceNote from "./RoleVoiceNote";
import { C } from "./RecordFields";

export interface Role {
  id: string; role: string;
  department: string | null; grade: string | null; reports_to: string | null; location: string | null;
  job_description: string | null; deliverable: string | null; metric: string | null;
  stage: "Draft" | "Final";
  url: string | null; voice_seconds: number | null; transcript: string | null; summary: string | null;
  approved_by: string | null; approved_at: string | null;
  updated_by: string | null; updated_at: string | null;
  pending_since: string | null; pending_by: string | null;
  people: { id: string; name: string; onRoll: boolean }[];
  activeCount: number;
}

interface Change {
  id: string; field: string; old_value: string | null; new_value: string | null;
  oldUrl: string | null; changed_by: string | null; changed_at: string;
}

const LABEL: Record<string, string> = {
  role: "Role", department: "Department", grade: "Grade", reports_to: "Reports To",
  location: "Location", job_description: "Job Description", deliverable: "Deliverable",
  metric: "Measurement Metric", voice: "Management Expectation Note", "(approved)": "Approved",
};

export default function RoleRecord({
  id, email, initials, displayName, isOwner,
}: {
  id: string; email: string; initials: string | null; displayName: string | null; isOwner: boolean;
}) {
  const [r, setR] = useState<Role | null>(null);
  const [changes, setChanges] = useState<Change[] | null>(null);
  const [showChanges, setShowChanges] = useState(false);
  const [masters, setMasters] = useState<Record<string, { value: string }[]>>({});
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const j = await api.get("/api/hrms/roles");
      const found = (j.roles || []).find((x: Role) => x.id === id) || null;
      if (!found) setErr("That role is not in the register.");
      setR(found);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get("/api/hrms/masters").then((j) => setMasters(j.masters || {})).catch(() => {}); }, []);

  const loadChanges = useCallback(async () => {
    const j = await api.get(`/api/hrms/roles?changes=${encodeURIComponent(id)}`);
    setChanges(j.changes || []);
  }, [id]);
  useEffect(() => { if (showChanges && !changes) loadChanges().catch(() => setChanges([])); }, [showChanges, changes, loadChanges]);

  const save = async (field: string, value: string) => {
    if (!r) return;
    if (String((r as unknown as Record<string, string | null>)[field] ?? "") === String(value ?? "")) return;
    setMsg("");
    try {
      const j = await api.post("/api/hrms/roles", { action: "save", id, [field]: value });
      setMsg(j.pending ? "Saved — sent to RJ Approval ✓" : "Saved ✓");
      setChanges(null);
      await load();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  };

  const act = async (body: Record<string, unknown>, ok: string) => {
    setMsg("");
    try { await api.post("/api/hrms/roles", { ...body, id }); setMsg(`${ok} ✓`); setChanges(null); await load(); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  };

  const who = displayName || email;

  if (err) return <Shell who={who} initials={initials}><div className="p-4 text-xs font-semibold" style={{ color: C.red }}>{err}</div></Shell>;
  if (!r) return <Shell who={who} initials={initials}><div className="p-4 text-xs" style={{ color: C.faint }}>Loading the role…</div></Shell>;

  const pending = !!r.pending_since;
  const opts = (kind: string) => (masters[kind] || []).map((m) => m.value);

  return (
    <Shell who={who} initials={initials} title={r.role}
      sub={[r.department, r.grade, r.location].filter(Boolean).join(" · ")}
      stage={r.stage} pending={pending}>

      <div className="px-3 md:px-4 py-2 flex items-center gap-2 flex-wrap no-print"
        style={{ background: pending ? "#FFF7E6" : "#EAE7DF", borderBottom: `1px solid ${pending ? "#F5B32B" : "#DCD9D1"}` }}>
        {pending ? (
          <span className="text-xs" style={{ color: "#8A5B00" }}>
            <b>Waiting on Dr Raghu.</b> Changed by {String(r.pending_by || "").split("·")[0].trim() || "somebody"} on{" "}
            {fmtFull(String(r.pending_since).slice(0, 10))} — it is in <b>Approvals → RJ Approval - Records</b>.
          </span>
        ) : (
          <span className="text-xs" style={{ color: C.dim }}>
            No unseen changes. {r.approved_at && <>Last approved {fmtFull(String(r.approved_at).slice(0, 10))}.</>}
          </span>
        )}
        {isOwner && pending && (
          <button onClick={() => act({ action: "approve" }, "Approved")}
            className="text-xs font-bold rounded px-3 py-1.5" style={{ background: "#0D7A3F", color: "#fff" }}>
            ✓ Approve these changes
          </button>
        )}
        {isOwner && r.stage === "Draft" && (
          <button onClick={() => act({ action: "stage", stage: "Final" }, "Marked Final")}
            className="text-xs font-bold rounded px-3 py-1.5" style={{ background: "#16232F", color: "#fff" }}>
            ✓ Mark the role Final
          </button>
        )}
        {isOwner && r.stage === "Final" && (
          <button onClick={() => act({ action: "stage", stage: "Draft" }, "Back to draft")}
            className="text-xs font-bold rounded px-2 py-1" style={{ background: "#fff", border: `1px solid ${C.line}`, color: C.dim }}>
            ↩ Back to draft
          </button>
        )}
        <span className="text-xs ml-auto" style={{ color: msg.includes("✓") ? C.green : msg ? C.red : C.faint }}>
          {msg || "Every box saves when you click away."}
        </span>
      </div>

      {/* ═══ two columns ═══ */}
      <div className="p-3 md:p-4" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.55fr) minmax(0,1fr)", gap: 16, alignItems: "start" }}>

        {/* ── left: the written definition ── */}
        <div style={{ minWidth: 0 }}>
          <div className="bg-white rounded-lg border p-3 mb-3" style={{ borderColor: C.line }}>
            <div className="flex gap-2 flex-wrap">
              <Box label="Role" value={r.role} onSave={(v) => save("role", v)} width={230} />
              <Pick label="Department" value={r.department || ""} options={opts("department")} onSave={(v) => save("department", v)} />
              <Pick label="Grade" value={r.grade || ""} options={opts("grade")} onSave={(v) => save("grade", v)} width={190} />
              <Box label="Reports To" value={r.reports_to || ""} onSave={(v) => save("reports_to", v)} width={200} />
              <Pick label="Location" value={r.location || ""} options={opts("location")} onSave={(v) => save("location", v)} width={150} />
            </div>
          </div>

          <Written label="Job Description" hint="What this role exists to do. Keep the A. B. C. lettering — it is how these are referred to."
            value={r.job_description} rows={12} onSave={(v) => save("job_description", v)} />
          <Written label="Deliverable" hint="What the role must produce. An outcome, not a list of activities."
            value={r.deliverable} rows={9} onSave={(v) => save("deliverable", v)} />
          <Written label="Measurement Metric" hint="How the deliverable is measured. A number, a date, or a rate."
            value={r.metric} rows={9} onSave={(v) => save("metric", v)} />
        </div>

        {/* ── right: the expectation note, and the history ── */}
        <div style={{ minWidth: 0 }}>
          <VoiceNote r={r} reload={load} onSaved={() => setChanges(null)} />

          <div className="bg-white rounded-lg border p-3 mt-3" style={{ borderColor: C.line }}>
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

          <div className="bg-white rounded-lg border mt-3" style={{ borderColor: C.line }}>
            <button onClick={() => setShowChanges((v) => !v)} className="w-full text-left px-3 py-2 font-bold text-xs">
              {showChanges ? "▾" : "▸"} Changes
              <span className="font-normal" style={{ color: C.faint }}> — everything this role used to say</span>
            </button>
            {showChanges && (
              <div className="px-3 pb-3">
                {changes === null && <div className="text-xs" style={{ color: C.faint }}>loading…</div>}
                {changes?.length === 0 && <div className="text-xs" style={{ color: C.faint }}>Nothing has been changed yet.</div>}
                {(changes || []).map((c) => (
                  <div key={c.id} className="py-2" style={{ borderTop: "1px solid #EEECE6" }}>
                    <div className="text-xs" style={{ lineHeight: 1.6 }}>
                      <span className="rounded px-1.5 py-0.5 font-bold" style={{ background: "#E8600A", color: "#fff", fontSize: 10 }}>
                        {String(c.changed_by || "—").split("·")[0].trim()}
                      </span>{" "}
                      <span style={{ color: C.faint }}>
                        {fmtFull(String(c.changed_at).slice(0, 10))} at{" "}
                        {new Date(c.changed_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                      </span>{" "}
                      · <b>{LABEL[c.field] || c.field}</b>
                    </div>
                    {c.old_value && (
                      <div className="text-xs mt-1" style={{ color: C.faint }}>
                        was: <span dangerouslySetInnerHTML={{ __html: String(c.old_value).slice(0, 600) }} />
                      </div>
                    )}
                    {c.oldUrl && (
                      <div className="mt-1">
                        <div style={{ fontSize: 10.5, color: C.faint }}>the recording it replaced</div>
                        <audio controls src={c.oldUrl} style={{ height: 26, maxWidth: "100%" }} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}

function Shell({
  children, who, initials, title, sub, stage, pending,
}: {
  children: React.ReactNode; who: string; initials: string | null;
  title?: string; sub?: string; stage?: string; pending?: boolean;
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
              HRIS · ROLE
              <span style={{ background: "#E8600A", color: "#fff", borderRadius: 3, padding: "1px 5px", marginLeft: 6, letterSpacing: 0 }}>
                V {APP_VERSION}
              </span>
            </div>
            <div className="font-bold text-white leading-tight truncate" style={{ fontSize: 14 }}>{title || "Role"}</div>
            {sub && <div style={{ fontSize: 11, color: "#8FA1B3" }}>{sub}</div>}
          </div>
          {stage && (
            <span className="rounded px-1.5 py-0.5 font-bold flex-shrink-0" style={{
              fontSize: 10, background: stage === "Final" ? "#E6F4EA" : "#FFF3E8",
              color: stage === "Final" ? C.green : "#8A5B00",
            }}>{stage}</span>
          )}
          {pending && (
            <span className="rounded px-1.5 py-0.5 font-bold flex-shrink-0" style={{ fontSize: 10, background: "#F5B32B", color: "#4A3300" }}>
              awaiting RJ
            </span>
          )}
          <a href="/hrms#idp.roles" className="ml-auto text-xs font-semibold rounded px-2.5 py-1.5 flex-shrink-0"
            style={{ background: "#22303C", color: "#8FA1B3" }}>← Roles</a>
          <span className="rounded-full font-bold flex items-center justify-center flex-shrink-0"
            style={{ width: 26, height: 26, fontSize: 11, background: initials ? "#E8600A" : "#B3261E", color: "#fff" }}
            title={who}>{initials || "??"}</span>
        </div>
      </div>
      {children}
    </div>
  );
}

function Box({ label, value, onSave, width = 170 }: { label: string; value: string; onSave: (v: string) => void; width?: number }) {
  return (
    <div>
      <div className="text-xs font-semibold" style={{ color: C.dim }}>{label}</div>
      <input defaultValue={value} onBlur={(e) => onSave(e.target.value)}
        className="text-xs rounded px-2 py-1.5 mt-1" style={{ border: `1px solid ${C.line}`, width }} />
    </div>
  );
}

/** A master-backed picker that still accepts a value the master has not got. */
function Pick({ label, value, options, onSave, width = 170 }: { label: string; value: string; options: string[]; onSave: (v: string) => void; width?: number }) {
  const orphan = value && !options.includes(value);
  return (
    <div>
      <div className="text-xs font-semibold" style={{ color: C.dim }}>{label}</div>
      <select value={value} onChange={(e) => onSave(e.target.value)}
        className="text-xs rounded px-2 py-1.5 mt-1 bg-white"
        style={{ border: `1px solid ${orphan ? "#F5B32B" : C.line}`, width }}>
        <option value="">— not set —</option>
        {orphan && <option value={value}>{value} (not on the list)</option>}
        {options.map((o) => (<option key={o} value={o}>{o}</option>))}
      </select>
    </div>
  );
}

function Written({
  label, hint, value, rows, onSave,
}: { label: string; hint: string; value: string | null; rows: number; onSave: (v: string) => void }) {
  return (
    <div className="bg-white rounded-lg border p-3 mb-3" style={{ borderColor: C.line }}>
      <div className="font-bold text-xs" style={{ color: C.ink }}>{label}</div>
      <div style={{ fontSize: 11, color: C.faint, lineHeight: 1.5, marginBottom: 6 }}>{hint}</div>
      <RichText value={value || ""} rows={rows} onSave={onSave} placeholder={`${label}…`} />
    </div>
  );
}
