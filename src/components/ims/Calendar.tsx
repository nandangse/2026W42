"use client";

import { useState } from "react";
import {
  Area, Btn, Chip, Empty, Label, Modal, Note, Screen, Select, Text,
  fmtD, post, useLoad, BORDER, INK, MUTED, NAVY_SOFT, ORANGE,
} from "./ui";
import { isHead, type Boot, type Row } from "./types";

/**
 * The calendar — core_event, org-wide from day one.
 *
 * Audits, trainings, management reviews and customer visits. Every Genie
 * module will write here with its own tag, so "what is coming" is one query
 * rather than six calendars nobody reconciles.
 *
 * A month grid is unreadable at 380px, so the phone gets an AGENDA instead —
 * the same data, listed by date. Not a cut-down version: a different shape
 * for a different screen.
 */
const TYPES = [
  { value: "audit", label: "Audit" },
  { value: "training", label: "Training" },
  { value: "management_review", label: "Management review" },
  { value: "customer_visit", label: "Customer visit" },
  { value: "other", label: "Other" },
];
const TYPE_COLOUR: Record<string, string> = {
  audit: "#1B2D6B", training: "#0F766E", management_review: "#7C3AED",
  customer_visit: "#B45309", other: "#6B7280",
};

const monthShift = (m: string, by: number) => {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + by, 1));
  return d.toISOString().slice(0, 7);
};
const monthName = (m: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

export default function Calendar({ boot }: { boot: Boot }) {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [type, setType] = useState("");
  const [view, setView] = useState<"grid" | "agenda">(
    typeof window !== "undefined" && window.innerWidth < 700 ? "agenda" : "grid",
  );
  const [d, busy, reload, err] = useLoad<{ installed: boolean; rows: Row[] }>(`/api/ims/event?month=${month}`);
  const [edit, setEdit] = useState<Record<string, string> | null>(null);
  const [msg, setMsg] = useState("");

  const rows = (d?.rows ?? []).filter((e) => !type || e.event_type === type);
  const inMonth = rows.filter((e) => String(e.starts_at ?? "").slice(0, 7) === month);

  // The grid, Monday first.
  const first = new Date(`${month}-01T00:00:00Z`);
  const lead = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array(lead).fill(null),
    ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ];
  const onDay = (day: string) => rows.filter((e) => String(e.starts_at ?? "").slice(0, 10) === day);

  const save = async () => {
    if (!edit) return;
    const r = await post("/api/ims/event", {
      action: "add",
      row: { ...edit, starts_at: `${edit.starts_at}T00:00:00Z`, all_day: true },
    });
    if (!r.ok) { setMsg(r.error || "Could not save."); return; }
    setEdit(null); reload();
  };

  return (
    <Screen
      title="Calendar"
      blurb="Audits, trainings, management reviews and customer visits — one calendar for the whole organisation."
      action={
        <>
          <Btn onClick={() => setMonth(monthShift(month, -1))}>‹</Btn>
          <span className="text-sm font-bold self-center" style={{ color: INK, minWidth: 130, textAlign: "center" }}>
            {monthName(month)}
          </span>
          <Btn onClick={() => setMonth(monthShift(month, 1))}>›</Btn>
          <div style={{ minWidth: 150 }}>
            <Select value={type} onChange={setType} blank="Every kind" options={TYPES} />
          </div>
          <Btn onClick={() => setView(view === "grid" ? "agenda" : "grid")}>{view === "grid" ? "List" : "Grid"}</Btn>
          {isHead(boot.role) && (
            <Btn kind="primary" onClick={() => { setEdit({ title: "", event_type: "audit", starts_at: `${month}-01`, department: "", location: "", description: "" }); setMsg(""); }}>
              + Event
            </Btn>
          )}
        </>
      }
    >
      {err && <Note kind="error">{err}</Note>}
      {msg && <Note kind="error">{msg}</Note>}
      {d && !d.installed && <Note kind="warn">Run the IMS migrations first.</Note>}

      {busy ? <Empty>Reading…</Empty> : view === "agenda" ? (
        inMonth.length === 0 ? <Empty>Nothing in {monthName(month)}.</Empty> : (
          <div className="bg-white rounded-lg border" style={{ borderColor: BORDER }}>
            {inMonth.map((e, i) => (
              <div key={e.id} className="p-2.5" style={{ borderTop: i ? `1px solid ${BORDER}` : "none" }}>
                <div className="flex items-center gap-2 flex-wrap">
                  <Chip text={TYPES.find((t) => t.value === e.event_type)?.label ?? String(e.event_type)}
                    colour={TYPE_COLOUR[String(e.event_type)] ?? MUTED} />
                  <span className="text-sm font-bold" style={{ color: INK }}>{String(e.title ?? "")}</span>
                </div>
                <div className="text-xs mt-1" style={{ color: MUTED }}>
                  {fmtD(String(e.starts_at ?? "").slice(0, 10))}
                  {e.department ? ` · ${String(e.department)}` : ""}{e.location ? ` · ${String(e.location)}` : ""}
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="bg-white rounded-lg border overflow-auto" style={{ borderColor: BORDER }}>
          <div className="grid" style={{ gridTemplateColumns: "repeat(7, minmax(92px, 1fr))", minWidth: 660 }}>
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((h) => (
              <div key={h} className="px-2 py-1.5 text-xs font-bold" style={{ background: NAVY_SOFT, color: INK }}>{h}</div>
            ))}
            {cells.map((day, i) => (
              <div key={i} className="p-1" style={{ borderTop: `1px solid ${BORDER}`, borderLeft: i % 7 ? `1px solid ${BORDER}` : "none", minHeight: 84 }}>
                {day && (
                  <>
                    <div className="text-xs font-bold" style={{ color: day === new Date().toISOString().slice(0, 10) ? ORANGE : MUTED }}>
                      {Number(day.slice(8, 10))}
                    </div>
                    {onDay(day).map((e) => (
                      <div key={e.id} className="rounded px-1 py-0.5 mt-0.5 text-xs font-bold text-white"
                        style={{ background: TYPE_COLOUR[String(e.event_type)] ?? MUTED, overflow: "hidden", textOverflow: "ellipsis" }}
                        title={String(e.title ?? "")}>
                        {String(e.title ?? "")}
                      </div>
                    ))}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {edit && (
        <Modal onClose={() => setEdit(null)} title="New event">
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            <div style={{ gridColumn: "1/-1" }}><Label>Title</Label><Text value={edit.title} onChange={(v) => setEdit({ ...edit, title: v })} /></div>
            <div><Label>Kind</Label><Select value={edit.event_type} onChange={(v) => setEdit({ ...edit, event_type: v })} blank="Audit" options={TYPES} /></div>
            <div><Label>Date</Label><Text type="date" value={edit.starts_at} onChange={(v) => setEdit({ ...edit, starts_at: v })} /></div>
            <div><Label>Department</Label><Text value={edit.department} onChange={(v) => setEdit({ ...edit, department: v })} /></div>
            <div><Label>Location</Label><Text value={edit.location} onChange={(v) => setEdit({ ...edit, location: v })} /></div>
            <div style={{ gridColumn: "1/-1" }}><Label>Description</Label><Area rows={2} value={edit.description} onChange={(v) => setEdit({ ...edit, description: v })} /></div>
          </div>
          <div className="flex gap-2 mt-4"><Btn kind="primary" onClick={save}>Add</Btn><Btn onClick={() => setEdit(null)}>Cancel</Btn></div>
        </Modal>
      )}
    </Screen>
  );
}
