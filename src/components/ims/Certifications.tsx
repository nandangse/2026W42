"use client";

import { useState } from "react";
import {
  Area, Btn, Chip, Empty, Label, Modal, Note, Screen, Select, Text,
  fmtD, post, statusColour, useLoad, BORDER, INK, MUTED, NAVY_SOFT,
} from "./ui";
import { isHead, type Boot, type Row } from "./types";

/**
 * The Certification Journey — the wall of aims.
 *
 * Three columns: what we hold, what is underway, what we are aiming at.
 * Scheme-agnostic on purpose: ZED, a customer audit and a future defence
 * scheme are the same shape as ISO 9001, so none of them needs code.
 *
 * A target carries an implementation path — gap assessment, documentation,
 * implementation, internal audit, management review, certification audit —
 * and any step can be pushed onto somebody as a task. That is the whole
 * difference between an aim on a wall and work with a name and a date on it.
 */
const COLUMNS: { key: string; label: string; blurb: string }[] = [
  { key: "achieved", label: "Achieved", blurb: "Held today. The certificate lives in the Vault; surveillance dates are watched." },
  { key: "in_progress", label: "In progress", blurb: "Being driven now." },
  { key: "target", label: "Target", blurb: "Aimed at. Each has an implementation path." },
];

const BLANK = { scheme: "", body: "", status: "target", target_date: "", achieved_date: "", owner_id: "", notes: "" };

export default function Certifications({ boot }: { boot: Boot }) {
  const [data, busy, reload, err] = useLoad<{ installed: boolean; rows: Row[] }>("/api/ims/certification");
  const [open, setOpen] = useState<Row | null>(null);
  const [edit, setEdit] = useState<Record<string, string> | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  const mayWrite = isHead(boot.role);
  const rows = data?.rows ?? [];

  const openEdit = (r?: Row) => {
    setMsg("");
    if (!r) { setEdit({ ...BLANK }); setEditId(null); return; }
    setEditId(r.id);
    setEdit(Object.fromEntries(Object.keys(BLANK).map((k) => [k, String(r[k] ?? "")])) as Record<string, string>);
  };

  const save = async () => {
    if (!edit) return;
    const r = await post("/api/ims/certification", { action: editId ? "update" : "add", id: editId, row: edit });
    if (!r.ok) { setMsg(r.error || "Could not save."); return; }
    setEdit(null); setOpen(null); reload();
  };

  const stepAction = async (body: Record<string, unknown>) => {
    const r = await post("/api/ims/certification", body);
    if (!r.ok) { setMsg(r.error || "Could not save."); return; }
    setMsg("");
    reload();
    setOpen(null);
  };

  return (
    <Screen
      title="Certification journey"
      blurb="What we hold, what is underway, what we are aiming at — ISO and non-ISO alike, including ZED and customer audits."
      action={mayWrite ? <Btn kind="primary" onClick={() => openEdit()}>+ Add certification</Btn> : undefined}
    >
      {err && <Note kind="error">{err}</Note>}
      {data && !data.installed && <Note kind="warn">Run the IMS migrations first.</Note>}

      {busy ? <Empty>Reading…</Empty> : rows.length === 0 ? (
        <Empty>Nothing on the journey yet.</Empty>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
          {COLUMNS.map((col) => {
            const mine = rows.filter((r) => String(r.status) === col.key);
            return (
              <div key={col.key} className="rounded-lg border p-2" style={{ borderColor: BORDER, background: "#fff" }}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="text-sm font-bold" style={{ color: INK }}>{col.label}</div>
                  <Chip text={String(mine.length)} colour={statusColour(col.key)} />
                </div>
                <div className="text-xs mb-2" style={{ color: MUTED, lineHeight: 1.5 }}>{col.blurb}</div>
                {mine.length === 0 && <div className="text-xs py-3 text-center" style={{ color: MUTED }}>None</div>}
                {mine.map((c) => {
                  const steps = (c.steps as Row[]) ?? [];
                  const done = steps.filter((s) => String(s.status) === "done").length;
                  return (
                    <button key={c.id} onClick={() => { setOpen(c); setMsg(""); }}
                      className="w-full text-left rounded border p-2 mb-2"
                      style={{ borderColor: BORDER, background: NAVY_SOFT }}>
                      <div className="text-sm font-bold" style={{ color: INK }}>{String(c.scheme ?? "")}</div>
                      <div className="text-xs mt-0.5" style={{ color: MUTED }}>
                        {String(c.body || "Body not named")}
                        {c.target_date ? ` · target ${fmtD(c.target_date)}` : ""}
                        {c.achieved_date ? ` · achieved ${fmtD(c.achieved_date)}` : ""}
                      </div>
                      {steps.length > 0 && (
                        <div className="text-xs mt-1 font-bold" style={{ color: done === steps.length ? "#1A7F4E" : MUTED }}>
                          {done} of {steps.length} path steps done
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* ------------------------------------------------------ the detail */}
      {open && (
        <Modal onClose={() => setOpen(null)} title={String(open.scheme ?? "")} width={720}>
          {msg && <Note kind="error">{msg}</Note>}
          <div className="flex gap-2 items-center flex-wrap mb-3">
            <Chip text={String(open.status).replace("_", " ")} colour={statusColour(String(open.status))} />
            {open.body ? <span className="text-sm" style={{ color: MUTED }}>{String(open.body)}</span> : null}
            {mayWrite && <Btn onClick={() => { openEdit(open); }}>Edit</Btn>}
          </div>
          {open.notes ? <div className="text-sm mb-3" style={{ color: INK, lineHeight: 1.6 }}>{String(open.notes)}</div> : null}

          <div className="text-sm font-bold mb-2" style={{ color: INK }}>Implementation path</div>
          {((open.steps as Row[]) ?? []).length === 0 ? (
            <Empty>No path steps.</Empty>
          ) : (
            <div className="rounded border" style={{ borderColor: BORDER }}>
              {((open.steps as Row[]) ?? []).map((s, i) => (
                <div key={s.id} className="p-2 flex items-start gap-2 flex-wrap"
                  style={{ borderTop: i ? `1px solid ${BORDER}` : "none" }}>
                  <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                    <div className="text-sm font-bold" style={{ color: INK }}>{String(s.title ?? "")}</div>
                    <div className="text-xs" style={{ color: MUTED, lineHeight: 1.5 }}>{String(s.description ?? "")}</div>
                    {s.due_date ? <div className="text-xs mt-0.5" style={{ color: MUTED }}>Due {fmtD(s.due_date)}</div> : null}
                  </div>
                  <div className="flex gap-1.5 items-center flex-wrap">
                    <Chip text={String(s.status).replace("_", " ")} colour={statusColour(String(s.status))} />
                    {mayWrite && String(s.status) !== "done" && (
                      <Btn onClick={() => stepAction({ action: "step_update", id: s.id, row: { status: "done" } })}>Done</Btn>
                    )}
                    {mayWrite && (
                      s.task_id
                        ? <span className="text-xs font-bold" style={{ color: "#1A7F4E" }}>Task raised</span>
                        : <Btn onClick={() => stepAction({ action: "spawn_task", id: s.id })} title="Raise this step as a task somebody owns">
                            Make a task
                          </Btn>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {/* --------------------------------------------------------- the form */}
      {edit && (
        <Modal onClose={() => setEdit(null)} title={editId ? "Edit certification" : "Add certification"}>
          {msg && <Note kind="error">{msg}</Note>}
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            <div style={{ gridColumn: "1/-1" }}>
              <Label>Scheme</Label>
              <Text value={edit.scheme} onChange={(v) => setEdit({ ...edit, scheme: v })}
                placeholder="ISO 9001:2015 · ZED Gold · Customer Audit — HAL" />
            </div>
            <div><Label>Certification body</Label><Text value={edit.body} onChange={(v) => setEdit({ ...edit, body: v })} /></div>
            <div>
              <Label>Status</Label>
              <Select value={edit.status} onChange={(v) => setEdit({ ...edit, status: v })} blank="Target"
                options={COLUMNS.map((c) => ({ value: c.key, label: c.label }))} />
            </div>
            <div><Label>Target date</Label><Text type="date" value={edit.target_date} onChange={(v) => setEdit({ ...edit, target_date: v })} /></div>
            <div><Label>Achieved date</Label><Text type="date" value={edit.achieved_date} onChange={(v) => setEdit({ ...edit, achieved_date: v })} /></div>
            <div>
              <Label>Owner</Label>
              <Select value={edit.owner_id} onChange={(v) => setEdit({ ...edit, owner_id: v })}
                options={boot.people.map((p) => ({ value: p.id, label: p.full_name }))} />
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <Label>Notes</Label>
              <Area value={edit.notes} onChange={(v) => setEdit({ ...edit, notes: v })} />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <Btn kind="primary" onClick={save}>{editId ? "Save" : "Add"}</Btn>
            <Btn onClick={() => setEdit(null)}>Cancel</Btn>
          </div>
        </Modal>
      )}
    </Screen>
  );
}
