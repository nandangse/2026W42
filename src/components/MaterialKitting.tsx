"use client";
// Material Kitting — the kit list for one job.
//
// A line here carries a receivable date, so it is already a task in every
// sense that matters: something owed, by somebody, by a date. Dr Raghu asked
// whether it could BE a task rather than be copied into one. It can, and the
// answer is a link rather than a merge:
//
//   THE MATERIAL ROW IS THE RECORD. Date, owner, status and note live on it.
//   A ROW IS PROMOTED to a task only when somebody has to chase it — eight
//   lines on a hundred and five jobs would otherwise turn Tasking into a bill
//   of materials nobody reads.
//   ONCE LINKED THEY ARE HELD IN STEP, both ways: receiving the material
//   closes the task, closing the task receives the material.
//
// Two records that look alike are not the problem. Two that drift are, and the
// mirror is what stops it.
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { fmtFull, today } from "@/lib/schedule";

const C = {
  ink: "#16232F", body: "#22303C", sub: "#5A6672", mute: "#8A94A0", faint: "#B8B5AC",
  line: "#E2E0DA", panel: "#F4F2EC", accent: "#E8600A", navy: "#1B3A5C",
  green: "#0D7A3F", amber: "#D97706", red: "#B3261E", violet: "#7C3AED",
};

export type MatStatus = "Yet to receive" | "Received" | "QC Defective";

export const STATUS_META: Record<MatStatus, { label: string; color: string; bg: string }> = {
  "Yet to receive": { label: "⏳ Yet to receive", color: "#B3261E", bg: "#FBEDEA" },
  Received: { label: "✓ Received", color: "#0D7A3F", bg: "#E6F4EA" },
  // Amber, not green: it is on site and cannot be used, which for the job is
  // the same position as not having it.
  "QC Defective": { label: "⚠ QC Defective", color: "#8A5A00", bg: "#FFF7E6" },
};
const ORDER: MatStatus[] = ["Yet to receive", "Received", "QC Defective"];

export interface Mat {
  id: string;
  item: string;
  qty: string;
  status: string;
  custom: boolean;
  due?: string | null;
  who?: string | null;
  note?: string | null;
  task_id?: string | null;
}

const norm = (s: string): MatStatus =>
  (ORDER as string[]).includes(s) ? (s as MatStatus) : "Yet to receive";

export default function MaterialKitting({
  jobId, mats, canEdit, people, onChanged,
}: {
  jobId: string;
  mats: Mat[];
  canEdit: boolean;
  people: { value: string; label: string }[];
  onChanged: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState({ item: "", qty: "" });

  const setStatus = async (id: string, status: MatStatus) => {
    await api.post("/api/materials", { action: "status", id, status });
    await onChanged();
  };
  const add = async () => {
    if (!form.item.trim()) return;
    await api.post("/api/materials", { action: "add", job_id: jobId, item: form.item, qty: form.qty || "as BOM", custom: true });
    setForm({ item: "", qty: "" });
    await onChanged();
  };
  const del = async (id: string, item: string) => {
    if (!window.confirm(`Remove "${item}" from the kit list?`)) return;
    await api.post("/api/materials", { action: "delete", id });
    await onChanged();
  };

  const T = today();
  const picked = mats.find((m) => m.id === open) || null;

  return (
    <>
      <div className="bg-white rounded-lg border" style={{ borderColor: C.line, overflowX: "auto" }}>
        <table className="w-full text-sm" style={{ minWidth: 760 }}>
          <thead>
            <tr style={{ background: "#22303C", color: "#fff" }} className="text-xs">
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">Material / kit item</th>
              <th className="px-3 py-2 text-left">Qty</th>
              <th className="px-3 py-2 text-center">Receivable date</th>
              <th className="px-3 py-2 text-left">Update</th>
              <th className="px-3 py-2 text-center">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {mats.map((m, i) => {
              const st = norm(m.status);
              const meta = STATUS_META[st];
              const late = m.due && m.due < T && st !== "Received";
              return (
                <tr key={m.id} className="border-t" style={{ borderColor: "#EFEDE7", background: i % 2 ? "#FAF9F5" : "#fff" }}>
                  <td className="px-3 py-1.5" style={{ color: C.mute }}>{i + 1}</td>
                  <td className="px-3 py-1.5 font-medium">
                    <button onClick={() => setOpen(m.id)} className="text-left" style={{ color: C.ink }} title="Open this line">
                      {m.item}
                    </button>
                    {/* the pencil is the way in — a line has a date, an owner,
                        a note and a conversation behind it now */}
                    <button onClick={() => setOpen(m.id)} className="ml-1" style={{ color: C.accent }} title="Edit, comment, raise a task">✎</button>
                    {m.task_id && (
                      <span className="ml-1 text-xs rounded px-1" style={{ background: "#F3EEFB", color: C.violet }} title="This line is also a task in Tasking — the two are kept in step">
                        task
                      </span>
                    )}
                    {m.custom && <span title="Custom item added here" style={{ color: C.faint }}> ·</span>}
                  </td>
                  <td className="px-3 py-1.5" style={{ color: C.sub }}>{m.qty}</td>
                  <td className="px-3 py-1.5 text-center tnum" style={{ color: late ? C.red : m.due ? C.body : C.faint, fontWeight: late ? 700 : 400 }}>
                    {m.due ? fmtFull(m.due) : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-xs truncate" style={{ color: m.note ? C.sub : C.faint, maxWidth: 260 }} title={m.note || ""}>
                    {m.note || "—"}
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    {canEdit ? (
                      <select value={st} onChange={(e) => setStatus(m.id, e.target.value as MatStatus)}
                        className="text-xs font-bold rounded px-1.5 py-0.5"
                        style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.color}33` }}>
                        {ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                      </select>
                    ) : (
                      <span className="text-xs font-bold rounded px-2 py-0.5" style={{ background: meta.bg, color: meta.color }}>{meta.label}</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {canEdit && <button onClick={() => del(m.id, m.item)} title="Remove line" className="text-xs" style={{ color: C.red }}>✕</button>}
                  </td>
                </tr>
              );
            })}
            {mats.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-sm" style={{ color: C.mute }}>No kit list on this job yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <div className="flex gap-1 mt-2 items-center flex-wrap">
          <input placeholder="Custom material / bought-out item…" value={form.item} onChange={(e) => setForm({ ...form, item: e.target.value })}
            className="text-xs border rounded px-2 py-1.5" style={{ borderColor: C.line, minWidth: 240 }} />
          <input placeholder="Qty" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })}
            className="text-xs border rounded px-2 py-1.5 w-24" style={{ borderColor: C.line }} />
          <button onClick={add} className="text-xs font-bold rounded px-3 py-1.5" style={{ background: C.accent, color: "#fff" }}>+ Add material</button>
        </div>
      )}

      {picked && (
        <MatBox jobId={jobId} mat={picked} canEdit={canEdit} people={people}
          onClose={() => setOpen(null)} onChanged={onChanged} />
      )}
    </>
  );
}

// ===========================================================================
function MatBox({
  jobId, mat, canEdit, people, onClose, onChanged,
}: {
  jobId: string; mat: Mat; canEdit: boolean; people: { value: string; label: string }[];
  onClose: () => void; onChanged: () => Promise<unknown>;
}) {
  const [f, setF] = useState({ item: mat.item, qty: mat.qty || "", due: mat.due || "", who: mat.who || "", note: mat.note || "" });
  const [comments, setComments] = useState<{ id: string; by: string | null; at: string; body: string }[]>([]);
  const [task, setTask] = useState<{ id: string; title: string; due: string | null; who: string | null; done: boolean } | null>(null);
  const [say, setSay] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await api.get(`/api/materials?job_id=${encodeURIComponent(jobId)}`);
      setComments((r.comments || []).filter((c: { material_id: string }) => c.material_id === mat.id));
      const row = (r.materials || []).find((m: { id: string }) => m.id === mat.id);
      setTask(row?.task_id ? (r.tasks || []).find((t: { id: string }) => t.id === row.task_id) ?? null : null);
    } catch { /* the box still edits without its history */ }
  }, [jobId, mat.id]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setBusy(true); setMsg("");
    try {
      await api.post("/api/materials", { action: "update", id: mat.id, ...f });
      await onChanged();
      setMsg("Saved ✓");
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const comment = async () => {
    if (!say.trim()) return;
    await api.post("/api/materials", { action: "comment", id: mat.id, body: say });
    setSay("");
    await load();
  };

  const raise = async () => {
    if (!f.due) { setMsg("Give it a receivable date first — that is the task's due date."); return; }
    setBusy(true); setMsg("");
    try {
      // save the date and owner first, so the task is created from what is on
      // screen rather than from what was last written
      await api.post("/api/materials", { action: "update", id: mat.id, ...f });
      const r = await api.post("/api/materials", { action: "task", id: mat.id, due: f.due, who: f.who });
      await onChanged();
      await load();
      setMsg(r.existing ? "That line already has a task." : "Task raised ✓ — it is on their list in Tasking.");
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(22,35,47,0.55)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg"
        style={{ width: "min(660px, 100%)", maxHeight: "88vh", overflowY: "auto" }}>
        <div className="px-4 py-3 flex items-start gap-3" style={{ background: C.ink, position: "sticky", top: 0, zIndex: 2 }}>
          <div style={{ flex: 1 }}>
            <div className="text-xs font-bold" style={{ color: "#8FA1B3", letterSpacing: 1.2 }}>MATERIAL KITTING</div>
            <div className="font-bold text-white" style={{ fontSize: 16, lineHeight: 1.25 }}>{mat.item}</div>
          </div>
          <button onClick={onClose} className="font-bold" style={{ color: "#8FA1B3", fontSize: 20, lineHeight: 1 }}>✕</button>
        </div>

        <div className="p-4">
          <fieldset disabled={!canEdit} style={{ border: "none", margin: 0, padding: 0, opacity: canEdit ? 1 : 0.7 }}>
            <div className="flex gap-2 flex-wrap items-end mb-2">
              <div style={{ flex: "2 1 220px" }}>
                <L>Material / kit item</L>
                <input value={f.item} onChange={(e) => setF({ ...f, item: e.target.value })} className="w-full text-sm border rounded px-2 py-1.5" style={{ borderColor: C.line }} />
              </div>
              <div style={{ width: 96 }}>
                <L>Qty</L>
                <input value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} className="w-full text-sm border rounded px-2 py-1.5" style={{ borderColor: C.line }} />
              </div>
              <div>
                <L>Receivable date</L>
                <input type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} className="text-sm border rounded px-2 py-1.5" style={{ borderColor: C.line }} />
              </div>
              <div style={{ flex: "1 1 150px" }}>
                <L>Who is chasing it</L>
                <select value={f.who} onChange={(e) => setF({ ...f, who: e.target.value })} className="w-full text-sm border rounded px-2 py-1.5 bg-white" style={{ borderColor: C.line }}>
                  <option value="">— nobody yet —</option>
                  {people.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
            </div>

            <L>Update</L>
            <textarea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} rows={2}
              placeholder="Where it has got to — the line the table shows"
              className="w-full text-sm border rounded p-2 mb-2" style={{ borderColor: C.line, resize: "vertical" }} />

            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={save} disabled={busy} className="text-sm font-bold rounded px-4 py-1.5" style={{ background: C.accent, color: "#fff", opacity: busy ? 0.5 : 1 }}>
                {busy ? "Saving…" : "Save"}
              </button>
              {task ? (
                <span className="text-xs rounded px-2 py-1" style={{ background: "#F3EEFB", color: C.violet }}>
                  {task.done ? "✓ its task is closed" : "task open"}
                  {task.who ? ` · ${task.who}` : ""}{task.due ? ` · due ${fmtFull(task.due)}` : ""}
                </span>
              ) : (
                <button onClick={raise} disabled={busy} className="text-sm font-bold rounded px-3 py-1.5"
                  style={{ background: "#fff", border: `1px solid ${C.violet}`, color: C.violet }}
                  title="Put this on somebody's list in Tasking, with the receivable date as its due date">
                  + Raise a task for this
                </button>
              )}
              {msg && <span className="text-xs font-semibold" style={{ color: msg.includes("✓") ? C.green : C.red }}>{msg}</span>}
            </div>

            {/* The whole answer to "can it be a task and a material", said on
                the screen where somebody is about to press the button. */}
            <div className="text-xs mt-1.5" style={{ color: C.faint, lineHeight: 1.5 }}>
              A task raised here is not a copy — it is this line, on somebody&apos;s list. Receiving the material closes the
              task, and closing the task receives the material, so the two can never disagree.
            </div>
          </fieldset>

          {/* ---- comments ---- */}
          <div className="mt-4">
            <L>Comments · {comments.length}</L>
            <div style={{ maxHeight: 190, overflowY: "auto" }}>
              {comments.length === 0 && <div className="text-xs" style={{ color: C.faint }}>Nothing said about this line yet.</div>}
              {comments.map((c) => (
                <div key={c.id} className="rounded p-2 mb-1" style={{ background: C.panel }}>
                  <div className="text-xs font-bold" style={{ color: C.navy }}>
                    {c.by || "someone"} <span className="font-normal" style={{ color: C.faint }}>{fmtFull(String(c.at).slice(0, 10))}</span>
                  </div>
                  <div className="text-xs" style={{ color: C.body, lineHeight: 1.5 }}>{c.body}</div>
                </div>
              ))}
            </div>
            {canEdit && (
              <div className="flex gap-1 mt-1">
                <input value={say} onChange={(e) => setSay(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") comment(); }}
                  placeholder="Why it is late, who was chased, what was promised…"
                  className="flex-1 text-xs border rounded px-2 py-1.5" style={{ borderColor: C.line }} />
                <button onClick={comment} className="text-xs font-bold rounded px-3" style={{ background: C.body, color: "#fff" }}>Post</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const L = ({ children }: { children: React.ReactNode }) => (
  <div className="text-xs font-bold mb-0.5" style={{ color: C.mute, letterSpacing: 0.6 }}>{String(children).toUpperCase()}</div>
);
