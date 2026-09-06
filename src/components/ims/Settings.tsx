"use client";

import { useState } from "react";
import {
  Btn, Chip, Empty, Label, Note, Screen, Select, TableBox, Td, Text, Th,
  post, useLoad, BORDER, INK, MUTED, NAVY_SOFT,
} from "./ui";
import { isAdmin, type Boot } from "./types";

/**
 * IMS → Settings — the approval mode, and who is what.
 *
 * TWO DIFFERENT GRANTS, and keeping them apart is deliberate.
 *
 * Admin → module access answers *may this person open the IMS at all*. That
 * is the owner's tick, the same as every other module, and it lets somebody
 * in as a **member** — the least they could be.
 *
 * This screen answers *what are they inside it*: which of them is the MR,
 * which head owns which department, who audits. That is a question about the
 * management system, and the MR is the person who knows the answer.
 */
const ROLES = [
  { value: "ims_admin", label: "IMS Admin (MR) — everything" },
  { value: "dept_head", label: "Department head — approves their own department" },
  { value: "auditor", label: "Auditor — reads everything, plans audits" },
  { value: "member", label: "Member — approved documents, own tasks" },
];

interface Grant { email: string; role: string; department: string | null }

export default function Settings({ boot }: { boot: Boot }) {
  const [d, busy, reload, err] = useLoad<{ installed: boolean; approvalMode: string; grants: Grant[]; ownerEmail: string }>(
    "/api/ims/settings",
  );
  const [msg, setMsg] = useState("");
  const [dept, setDept] = useState<Record<string, string>>({});

  const may = isAdmin(boot.role);
  const grants = d?.grants ?? [];

  const act = async (body: Record<string, unknown>) => {
    const r = await post("/api/ims/settings", body);
    if (!r.ok) { setMsg(r.error || "Could not save."); return; }
    setMsg(""); reload();
  };

  return (
    <Screen
      title="Settings"
      blurb="How documents are approved, and who is what inside the management system."
    >
      {err && <Note kind="error">{err}</Note>}
      {msg && <Note kind="error">{msg}</Note>}
      {!may && <Note>Only the IMS Admin (MR) can change these. You are seeing them as they stand.</Note>}

      {/* ------------------------------------------------- the approval mode */}
      <div className="rounded-lg border p-3 mb-4" style={{ borderColor: BORDER, background: "#fff" }}>
        <div className="text-sm font-bold mb-1" style={{ color: INK }}>Document approval</div>
        <div className="text-xs mb-3" style={{ color: MUTED, lineHeight: 1.6 }}>
          Two-step is what auditors prefer: the department head reviews, then the MR approves.
          In either mode the <b>MR signs</b> — a head who reviewed and approved their own department&apos;s
          procedure is one signature wearing two hats, which is the first thing an auditor tests.
        </div>
        <div className="flex gap-2 flex-wrap">
          {[
            { v: "two_step", label: "Two-step — head reviews, MR approves" },
            { v: "single", label: "Single — the MR alone" },
          ].map((o) => (
            <button key={o.v} disabled={!may} onClick={() => act({ action: "approval_mode", mode: o.v })}
              className="rounded border px-3 py-2 text-sm font-bold disabled:opacity-60"
              style={{
                borderColor: d?.approvalMode === o.v ? "#F04E23" : BORDER,
                background: d?.approvalMode === o.v ? NAVY_SOFT : "#fff",
                color: INK,
              }}>
              {d?.approvalMode === o.v ? "● " : "○ "}{o.label}
            </button>
          ))}
        </div>
      </div>

      {/* -------------------------------------------------------- the people */}
      <div className="text-sm font-bold mb-2" style={{ color: INK }}>Who is what</div>
      {busy ? <Empty>Reading…</Empty> : (
        <>
          <div className="rounded-lg border p-2.5 mb-2" style={{ borderColor: BORDER, background: NAVY_SOFT }}>
            <div className="text-sm font-bold" style={{ color: INK }}>
              {d?.ownerEmail} <Chip text="IMS Admin (MR)" colour="#1B2D6B" />
            </div>
            <div className="text-xs mt-0.5" style={{ color: MUTED }}>
              The owner is the MR implicitly and has no row — a row that could be edited is a row that
              could lock the module&apos;s only administrator out of it.
            </div>
          </div>

          {grants.length === 0 ? (
            <Empty>Nobody else has been let in yet. Tick <b>IMS</b> for them on Admin → module access, then set their role here.</Empty>
          ) : (
            <TableBox min={620}>
              <thead><tr><Th>Email</Th><Th>Role</Th><Th>Department</Th>{may && <Th />}</tr></thead>
              <tbody>
                {grants.map((g) => (
                  <tr key={g.email}>
                    <Td>{g.email}</Td>
                    <Td>
                      {may ? (
                        <div style={{ minWidth: 200 }}>
                          <Select value={g.role} options={ROLES} blank="Member"
                            onChange={(v) => act({ action: "set_role", email: g.email, role: v, department: g.department ?? "" })} />
                        </div>
                      ) : (
                        <Chip text={ROLES.find((r) => r.value === g.role)?.label.split(" — ")[0] ?? g.role} colour="#1B2D6B" />
                      )}
                    </Td>
                    <Td>
                      {may ? (
                        <div className="flex gap-1.5 items-center" style={{ minWidth: 210 }}>
                          <Text value={dept[g.email] ?? (g.department ?? "")} onChange={(v) => setDept({ ...dept, [g.email]: v })} />
                          <Btn onClick={() => act({ action: "set_role", email: g.email, role: g.role, department: dept[g.email] ?? (g.department ?? "") })}>
                            Set
                          </Btn>
                        </div>
                      ) : (g.department || "—")}
                    </Td>
                    {may && (
                      <Td>
                        {g.role === "dept_head" && !g.department
                          ? <span className="text-xs font-bold" style={{ color: "var(--red)" }}>Needs a department</span>
                          : null}
                      </Td>
                    )}
                  </tr>
                ))}
              </tbody>
            </TableBox>
          )}
          <div className="text-xs mt-2" style={{ color: MUTED, lineHeight: 1.6 }}>
            A department head with no department set can approve <b>nothing</b> — the route matches their
            department against the document&apos;s, and an empty one matches nothing rather than everything.
          </div>
        </>
      )}

      <div className="mt-4">
        <Label>Where this lives</Label>
        <div className="text-xs" style={{ color: MUTED, lineHeight: 1.6, maxWidth: 720 }}>
          The IMS is in Genie&apos;s own database — migrations <b>0111</b> (the door and these roles),
          <b> 0112</b> (the tables) and <b>0113</b> (the standards, clauses and registers). Every IMS table
          has RLS on and forced with no policies, so nothing reaches them except <code>/api/ims/*</code>,
          which checks the role first.
        </div>
      </div>
    </Screen>
  );
}
