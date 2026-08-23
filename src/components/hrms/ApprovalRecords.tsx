"use client";
/**
 * Approvals → RJ Approval - Records.
 *
 * Every change to a role lands here the moment it is made, and stays until
 * Dr Raghu has seen it. That is the whole mechanism: HR may write any part of
 * a role, and nothing HR writes is silently taken as agreed.
 *
 * Approving is not the same as marking a role Final. Final says the role is
 * AGREED; approving says the latest edit has been SEEN. A role can be Final
 * and still show up here the next time somebody changes a word of it.
 */
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { fmtFull } from "@/lib/schedule";
import { Pane } from "./Pane";
import { C } from "./RecordFields";
import type { Role } from "./RoleRecord";

export default function ApprovalRecords({ who, isOwner }: { who: string; isOwner: boolean }) {
  const [roles, setRoles] = useState<Role[] | null>(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const j = await api.get("/api/hrms/roles");
      setRoles((j.roles || []).filter((r: Role) => r.pending_since));
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); setRoles([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const approve = async (id: string, name: string) => {
    setMsg("");
    try { await api.post("/api/hrms/roles", { action: "approve", id }); setMsg(`“${name}” approved ✓`); await load(); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <Pane title="RJ Approval - Records" who={who}
      blurb="Role definitions changed since they were last seen. Nothing HR writes is taken as agreed until it has been read here.">
      {msg && <div className="text-xs font-semibold mb-2" style={{ color: msg.includes("✓") ? C.green : C.red }}>{msg}</div>}

      {roles === null && <div className="text-xs" style={{ color: C.faint }}>loading…</div>}
      {roles?.length === 0 && (
        <div className="bg-white rounded-lg border p-5" style={{ borderColor: C.line, maxWidth: 620 }}>
          <div className="font-bold text-sm" style={{ color: C.green }}>Nothing waiting.</div>
          <div className="text-xs mt-1" style={{ color: C.dim, lineHeight: 1.6 }}>
            Every role definition has been seen since it was last changed. The moment somebody edits one, it appears
            here — job description, deliverable, metric, or the expectation note.
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border" style={{ borderColor: C.line }}>
        {(roles || []).map((r, i) => (
          <div key={r.id} className="px-3 py-2 flex items-center gap-2 flex-wrap" style={{ borderTop: i ? "1px solid #EEECE6" : undefined }}>
            <div style={{ minWidth: 220, flex: 1 }}>
              <a href={`/hrms/role/${encodeURIComponent(r.id)}`} target="_blank" rel="noopener noreferrer"
                className="text-xs font-bold" style={{ color: C.ink }}>
                {r.role} ↗
              </a>
              <div style={{ fontSize: 11, color: C.faint }}>
                {[r.department, r.grade].filter(Boolean).join(" · ") || "no department"} · {r.activeCount} active
              </div>
            </div>
            <div className="text-xs" style={{ color: C.dim, minWidth: 210 }}>
              changed by <b>{String(r.pending_by || "").split("·")[0].trim() || "somebody"}</b>
              {r.pending_since && <> on {fmtFull(String(r.pending_since).slice(0, 10))}</>}
            </div>
            <span className="rounded px-1.5 py-0.5 font-bold" style={{
              fontSize: 10, background: r.stage === "Final" ? "#E6F4EA" : "#FFF3E8",
              color: r.stage === "Final" ? C.green : "#8A5B00",
            }}>{r.stage}</span>
            {isOwner ? (
              <button onClick={() => approve(r.id, r.role)} className="text-xs font-bold rounded px-3 py-1.5"
                style={{ background: "#0D7A3F", color: "#fff" }}>✓ Approve</button>
            ) : (
              <span className="text-xs" style={{ color: C.faint }}>waiting on Dr Raghu</span>
            )}
          </div>
        ))}
      </div>
    </Pane>
  );
}
