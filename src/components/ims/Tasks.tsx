"use client";

import { useState } from "react";
import {
  Btn, Chip, Empty, Label, Modal, Note, Screen, Select, Text, Area,
  fmtD, post, useLoad, BORDER, INK, MUTED, RED, AMBER, GREEN,
} from "./ui";
import { isHead, type Boot, type Row } from "./types";

/**
 * My Tasks — core_task, the one task table Genie will eventually share.
 *
 * Grouped the way somebody actually triages: what is already late, what is due
 * today, what is due this week, and everything else. A single flat list sorted
 * by date makes you do that grouping in your head every morning.
 */
const BLANK = { title: "", description: "", owner_id: "", due_date: "", priority: "normal" };

export default function Tasks({ boot }: { boot: Boot }) {
  const [scope, setScope] = useState("mine");
  const [d, busy, reload, err] = useLoad<{ installed: boolean; rows: Row[]; today: string; maySeeAll: boolean; profileId: string | null }>(
    `/api/ims/task?scope=${scope}`,
  );
  const [edit, setEdit] = useState<Record<string, string> | null>(null);
  const [msg, setMsg] = useState("");
  const [showDone, setShowDone] = useState(false);

  const today = d?.today ?? new Date().toISOString().slice(0, 10);
  const rows = (d?.rows ?? []).filter((t) => showDone || (t.status !== "done" && t.status !== "cancelled"));

  const bucket = (t: Row): string => {
    if (t.status === "done") return "Done";
    const due = String(t.due_date ?? "").slice(0, 10);
    if (!due) return "No date";
    if (due < today) return "Overdue";
    if (due === today) return "Today";
    const week = new Date(new Date(`${today}T00:00:00Z`).getTime() + 7 * 86400000).toISOString().slice(0, 10);
    return due <= week ? "This week" : "Later";
  };
  const ORDER = ["Overdue", "Today", "This week", "Later", "No date", "Done"];
  const COLOUR: Record<string, string> = {
    Overdue: RED, Today: AMBER, "This week": "#1B6B93", Later: MUTED, "No date": MUTED, Done: GREEN,
  };

  const act = async (body: Record<string, unknown>) => {
    const r = await post("/api/ims/task", body);
    if (!r.ok) { setMsg(r.error || "Could not save."); return; }
    setMsg(""); setEdit(null); reload();
  };

  return (
    <Screen
      title="My tasks"
      blurb="Certificate renewals, certification path steps and anything raised by hand — one list, grouped by what is actually late."
      action={
        <>
          {d?.maySeeAll && (
            <div style={{ minWidth: 150 }}>
              <Select value={scope} onChange={setScope} blank="Mine"
                options={[{ value: "mine", label: "Mine" }, { value: "all", label: "Everyone's" }]} />
            </div>
          )}
          <Btn onClick={() => setShowDone(!showDone)}>{showDone ? "Hide done" : "Show done"}</Btn>
          <Btn kind="primary" onClick={() => { setEdit({ ...BLANK }); setMsg(""); }}>+ Task</Btn>
        </>
      }
    >
      {err && <Note kind="error">{err}</Note>}
      {msg && <Note kind="error">{msg}</Note>}
      {d && !d.installed && <Note kind="warn">Run the IMS migrations first.</Note>}

      {busy ? <Empty>Reading…</Empty> : rows.length === 0 ? (
        <Empty>Nothing open. The daily expiry scan raises renewal tasks here on its own.</Empty>
      ) : (
        ORDER.map((g) => {
          const mine = rows.filter((t) => bucket(t) === g);
          if (!mine.length) return null;
          return (
            <div key={g} className="mb-4">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-sm font-bold" style={{ color: INK }}>{g}</span>
                <Chip text={String(mine.length)} colour={COLOUR[g]} />
              </div>
              <div className="bg-white rounded-lg border" style={{ borderColor: BORDER }}>
                {mine.map((t, i) => (
                  <div key={t.id} className="p-2.5 flex items-start gap-2 flex-wrap"
                    style={{ borderTop: i ? `1px solid ${BORDER}` : "none" }}>
                    <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                      <div className="text-sm font-bold" style={{ color: INK, textDecoration: t.status === "done" ? "line-through" : "none" }}>
                        {String(t.title ?? "")}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: MUTED, lineHeight: 1.5 }}>
                        {String(t.source_type || "manual").replace(/_/g, " ")}
                        {t.due_date ? ` · due ${fmtD(t.due_date)}` : ""}
                        {t.owner_id && scope === "all" ? ` · ${boot.people.find((p) => p.id === t.owner_id)?.full_name ?? "unassigned"}` : ""}
                      </div>
                      {t.description ? <div className="text-xs mt-1" style={{ color: MUTED }}>{String(t.description)}</div> : null}
                    </div>
                    <div className="flex gap-1.5 items-center">
                      {String(t.priority) !== "normal" && <Chip text={String(t.priority)} colour={String(t.priority) === "urgent" ? RED : AMBER} />}
                      {t.status === "done"
                        ? <Btn onClick={() => act({ action: "reopen", id: t.id })}>Reopen</Btn>
                        : <Btn kind="primary" onClick={() => act({ action: "complete", id: t.id })}>Done</Btn>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}

      {edit && (
        <Modal onClose={() => setEdit(null)} title="New task">
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            <div style={{ gridColumn: "1/-1" }}><Label>Title</Label><Text value={edit.title} onChange={(v) => setEdit({ ...edit, title: v })} /></div>
            <div style={{ gridColumn: "1/-1" }}><Label>Description</Label><Area rows={2} value={edit.description} onChange={(v) => setEdit({ ...edit, description: v })} /></div>
            <div><Label>Due</Label><Text type="date" value={edit.due_date} onChange={(v) => setEdit({ ...edit, due_date: v })} /></div>
            <div>
              <Label>Priority</Label>
              <Select value={edit.priority} onChange={(v) => setEdit({ ...edit, priority: v })} blank="Normal" options={["low", "normal", "high", "urgent"]} />
            </div>
            <div>
              <Label>Owner</Label>
              <Select value={edit.owner_id} onChange={(v) => setEdit({ ...edit, owner_id: v })} blank="Me"
                options={isHead(boot.role) ? boot.people.map((p) => ({ value: p.id, label: p.full_name })) : []} />
            </div>
          </div>
          <div className="flex gap-2 mt-4"><Btn kind="primary" onClick={() => act({ action: "add", row: edit })}>Add</Btn><Btn onClick={() => setEdit(null)}>Cancel</Btn></div>
        </Modal>
      )}
    </Screen>
  );
}
