"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Owner } from "@/lib/owner-register";

/**
 * THE JOB, ON A PHONE, AS SOMETHING YOU CAN CHANGE.
 *
 * Dr Raghu, 30 Sep 2026: "Show the kitting % and production % from the main
 * job. Make it editable like the jobmaster lightbox with only planning and
 * admin having the rights. Current update also make it editable. Whenever
 * edited add the data into the previous updates. Show status as a single row
 * also make it editable. Show the button to add photo. Show the button to add
 * recording. Show the owners. Below the tiles show Pending tasks - button for
 * add tasks - then list of tasks."
 *
 * WHY IT MATTERS THAT IT IS THIS PAGE. The man who knows the production is
 * sixty per cent is standing at the machine with the QR he has just scanned.
 * Every minute between his knowing it and its being in Genie is a minute the
 * board is wrong, and the walk back to a desk is where most of those minutes
 * went. A page that can only be read sends him to find somebody; a page that
 * can be written closes the loop where the work is.
 *
 * IT DOES NOT INVENT A SECOND WAY IN. Every save here posts to the same
 * /api/job-field the lightbox uses, so the permission, the ERP queue and now
 * the history are one code path. A phone screen with its own write path is
 * how two systems start disagreeing about the same job.
 */

const C = {
  ink: "#16232F", sub: "#46545F", faint: "#8B8F87", line: "#DCD8CC",
  card: "#fff", accent: "#E4610F", green: "#0D7A3F", amber: "#B45309", red: "#B3392E",
};
const PCT = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

export interface LiveTask {
  id: string; kind: "erp" | "manual"; title: string; who: string | null; due: string | null;
}
export interface PastUpdate { at: string; by: string | null; old: string | null; now: string | null }

export interface JobLiveProps {
  jobId: string;
  kit: number;
  pct: number;
  stat: string;
  note: string;
  statuses: string[];
  mayEdit: boolean;
  delivered: boolean;
  owners: { label: string; o: Owner }[];
  tasks: LiveTask[];
  updates: PastUpdate[];
}

const dmy = (s: string | null | undefined) =>
  s ? `${s.slice(8, 10)}-${s.slice(5, 7)}-${s.slice(0, 4)}` : "";
const when = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export default function JobLive(p: JobLiveProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");

  /** One save path for every field on this page. */
  const save = async (field: string, value: string | number, label: string) => {
    setBusy(field); setMsg("");
    try {
      const r = await api.post("/api/job-field", { job_id: p.jobId, field, value });
      setMsg(r?.changed === false ? `${label} — no change` : `${label} saved ✓`);
      startTransition(() => router.refresh());
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally { setBusy(""); }
  };

  return (
    <>
      {/* ---- the two percentages, from the job itself ---- */}
      <Pct label="KITTING" value={p.kit} colour={C.amber} canEdit={p.mayEdit && !p.delivered}
        busy={busy === "kit"} onSave={(v) => save("kit", v, "Kitting")} />
      <Pct label="PRODUCTION" value={p.pct} colour={C.green} canEdit={p.mayEdit && !p.delivered}
        busy={busy === "pct"} onSave={(v) => save("pct", v, "Production")} />

      {/* ---- status: one row, his shape ---- */}
      <StatusRow value={p.stat} options={p.statuses} canEdit={p.mayEdit && !p.delivered}
        busy={busy === "stat"} onSave={(v) => save("stat", v, "Status")} />

      {/* ---- the current update, and everything it used to say ---- */}
      <UpdateBox value={p.note} canEdit={p.mayEdit} busy={busy === "note"}
        updates={p.updates} onSave={(v) => save("note", v, "Current update")} />

      {!!msg && (
        <div style={{ fontSize: 12.5, fontWeight: 700, margin: "2px 2px 10px", color: msg.includes("✓") ? C.green : msg.includes("no change") ? C.faint : C.red }}>
          {msg}
        </div>
      )}

      {/* ---- who is carrying it ---- */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, margin: "12px 0" }}>
        {p.owners.map((o) => (
          <div key={o.label} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 8, padding: "6px 4px", textAlign: "center" }}>
            <div style={{ fontSize: 8.5, letterSpacing: .5, color: C.faint }}>{o.label}</div>
            <b style={{ fontSize: 14 }}>{o.o.code || (o.o.name ? "" : "—")}</b>
            {!!o.o.name && <div style={{ fontSize: 10.5, color: C.sub, lineHeight: 1.2, marginTop: 1 }}>{o.o.name}</div>}
          </div>
        ))}
      </div>

      {/* ---- the two things a man at the machine can add ---- */}
      <Capture jobId={p.jobId} onDone={(m) => { setMsg(m); startTransition(() => router.refresh()); }} />
    </>
  );
}

/**
 * A PERCENTAGE IS TAPPED, NOT TYPED.
 *
 * The ten marks are the same ten on the printed board, and on a phone they
 * are the fastest possible input: the man taps the block he has reached.
 * There is a box for a figure that is not a round ten, because some are not.
 */
function Pct({ label, value, colour, canEdit, busy, onSave }: {
  label: string; value: number; colour: string; canEdit: boolean; busy: boolean; onSave: (v: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState(String(value));
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "baseline" }}>
        <b style={{ fontSize: 11, letterSpacing: .6, color: C.faint }}>{label}</b>
        <span style={{ flex: 1 }} />
        {canEdit && (
          <button onClick={() => { setTyped(String(value)); setOpen((o) => !o); }}
            style={{ background: "none", border: "none", color: C.accent, fontWeight: 700, fontSize: 12, padding: "0 8px" }}>
            {open ? "cancel" : "✎ edit"}
          </button>
        )}
        <b style={{ fontSize: 20, color: colour }}>{value}%</b>
      </div>
      <div style={{ display: "flex", gap: 3, marginTop: 6 }}>
        {PCT.map((n) => (
          <button key={n} disabled={!open || busy} onClick={() => onSave(n)}
            style={{
              flex: 1, height: open ? 26 : 14, borderRadius: 3, padding: 0,
              background: value >= n ? colour : "#F0EEE8",
              border: `1px solid ${value >= n ? colour : C.line}`,
              color: value >= n ? "#fff" : C.faint, fontSize: 10, fontWeight: 700,
            }}>
            {open ? n : ""}
          </button>
        ))}
      </div>
      {open && (
        <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
          <input inputMode="numeric" value={typed} onChange={(e) => setTyped(e.target.value)}
            style={{ width: 72, border: `1px solid ${C.line}`, borderRadius: 6, padding: "6px 8px", fontSize: 15 }} />
          <button disabled={busy} onClick={() => onSave(Math.max(0, Math.min(100, Number(typed) || 0)))}
            style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 6, padding: "7px 14px", fontWeight: 700, fontSize: 13 }}>
            {busy ? "saving…" : "Save"}
          </button>
          <span style={{ fontSize: 11.5, color: C.faint }}>or tap a block</span>
        </div>
      )}
    </div>
  );
}

/**
 * STATUS, ON ONE ROW (his instruction).
 *
 * The choices are the board's own vocabulary — every status actually in use —
 * rather than a list typed here, so it cannot drift from what the ERP sends.
 */
function StatusRow({ value, options, canEdit, busy, onSave }: {
  value: string; options: string[]; canEdit: boolean; busy: boolean; onSave: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <b style={{ fontSize: 11, letterSpacing: .6, color: C.faint }}>STATUS</b>
        <span style={{ fontSize: 14, fontWeight: 600, flex: 1, minWidth: 0 }}>{value || "—"}</span>
        {canEdit && (
          <button onClick={() => setOpen((o) => !o)}
            style={{ background: "none", border: "none", color: C.accent, fontWeight: 700, fontSize: 12 }}>
            {open ? "cancel" : "✎ edit"}
          </button>
        )}
      </div>
      {open && (
        <select defaultValue={value} disabled={busy} onChange={(e) => { if (e.target.value !== value) onSave(e.target.value); }}
          style={{ width: "100%", marginTop: 8, border: `1px solid ${C.line}`, borderRadius: 6, padding: "9px 8px", fontSize: 15, background: "#fff" }}>
          <option value="">—</option>
          {options.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      )}
    </div>
  );
}

/**
 * THE CURRENT UPDATE, AND EVERYTHING IT USED TO SAY.
 *
 * The line is prose — "W30 : Ord rcd", "W36 : panels at paint" — and the
 * prose is the record. Overwriting it used to lose the only account of how
 * the job actually went, so each edit now pushes the old line onto the list
 * below (0176), newest first, exactly as he asked.
 */
function UpdateBox({ value, canEdit, busy, updates, onSave }: {
  value: string; canEdit: boolean; busy: boolean; updates: PastUpdate[]; onSave: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [txt, setTxt] = useState(value);
  const [showAll, setShowAll] = useState(false);
  const list = showAll ? updates : updates.slice(0, 3);
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <b style={{ fontSize: 11, letterSpacing: .6, color: C.faint }}>CURRENT UPDATE</b>
        <span style={{ flex: 1 }} />
        {canEdit && (
          <button onClick={() => { setTxt(value); setOpen((o) => !o); }}
            style={{ background: "none", border: "none", color: C.accent, fontWeight: 700, fontSize: 12 }}>
            {open ? "cancel" : "✎ edit"}
          </button>
        )}
      </div>
      {open ? (
        <>
          <textarea value={txt} onChange={(e) => setTxt(e.target.value)} rows={3}
            style={{ width: "100%", marginTop: 6, border: `1px solid ${C.line}`, borderRadius: 6, padding: "8px", fontSize: 15, lineHeight: 1.4, fontFamily: "inherit" }} />
          <button disabled={busy} onClick={() => { onSave(txt); setOpen(false); }}
            style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 6, padding: "8px 16px", fontWeight: 700, fontSize: 13, marginTop: 6 }}>
            {busy ? "saving…" : "Save update"}
          </button>
        </>
      ) : (
        <div style={{ fontSize: 14, lineHeight: 1.45, marginTop: 2 }}>{value || <span style={{ color: C.faint }}>nothing recorded</span>}</div>
      )}

      {!!updates.length && (
        <div style={{ marginTop: 10, borderTop: `1px solid #F0EEE8`, paddingTop: 8 }}>
          <b style={{ fontSize: 10.5, letterSpacing: .5, color: C.faint }}>PAST UPDATES</b>
          {list.map((u, i) => (
            <div key={i} style={{ fontSize: 12.5, lineHeight: 1.4, marginTop: 5, color: C.sub }}>
              <span style={{ color: C.faint }}>{when(u.at)}{u.by ? ` · ${u.by}` : ""}</span>
              <div>{u.old || <i style={{ color: C.faint }}>(was empty)</i>}</div>
            </div>
          ))}
          {updates.length > 3 && (
            <button onClick={() => setShowAll((s) => !s)}
              style={{ background: "none", border: "none", color: C.accent, fontWeight: 700, fontSize: 11.5, padding: "6px 0 0" }}>
              {showAll ? "show fewer" : `show all ${updates.length}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * A PHOTOGRAPH AND A SPOKEN NOTE, from the phone already in his hand.
 *
 * `capture` on the file input opens the camera straight away rather than the
 * gallery — the point is the machine in front of him, not something he took
 * last week.
 */
function Capture({ jobId, onDone }: { jobId: string; onDone: (msg: string) => void }) {
  const photo = useRef<HTMLInputElement>(null);
  const audio = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState("");

  const send = async (kind: "photo" | "audio", file: File) => {
    setBusy(kind);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("job_id", jobId);
      const r = await fetch(kind === "photo" ? "/api/job-photo" : "/api/voice-note", { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || `That did not save (${r.status}).`);
      onDone(kind === "photo" ? "Photo added ✓" : "Recording added ✓");
    } catch (e) {
      onDone(e instanceof Error ? e.message : String(e));
    } finally { setBusy(""); }
  };

  const btn: React.CSSProperties = {
    flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
    background: C.card, border: `1px solid ${C.line}`, borderRadius: 10,
    padding: "14px 10px", fontWeight: 700, fontSize: 13.5, color: C.ink,
  };
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
      <input ref={photo} type="file" accept="image/*" capture="environment" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) send("photo", f); e.target.value = ""; }} />
      <input ref={audio} type="file" accept="audio/*" capture hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) send("audio", f); e.target.value = ""; }} />
      <button style={btn} disabled={!!busy} onClick={() => photo.current?.click()}>
        <b style={{ color: C.accent, fontSize: 16 }}>📷</b>{busy === "photo" ? "sending…" : "Add photo"}
      </button>
      <button style={btn} disabled={!!busy} onClick={() => audio.current?.click()}>
        <b style={{ color: C.accent, fontSize: 16 }}>🎙</b>{busy === "audio" ? "sending…" : "Add recording"}
      </button>
    </div>
  );
}

/**
 * PENDING TASKS, under the tiles (his order).
 *
 * The list is what is OPEN — a done task is history and belongs on the desk
 * screen, not on the phone of the man being asked what is left.
 */
export function JobTasks({ jobId, tasks }: { jobId: string; tasks: LiveTask[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const add = async () => {
    if (!title.trim()) return;
    setBusy(true); setMsg("");
    try {
      await api.post("/api/tasks", { action: "create", job_id: jobId, title: title.trim(), due: due || null });
      setTitle(""); setDue(""); setOpen(false); setMsg("Task added ✓");
      startTransition(() => router.refresh());
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <b style={{ fontSize: 14 }}>Pending tasks</b>
        <span style={{ fontSize: 12.5, color: C.faint }}>{tasks.length || "none"}</span>
        <span style={{ flex: 1 }} />
        <button onClick={() => setOpen((o) => !o)}
          style={{ background: open ? "#fff" : C.accent, color: open ? C.sub : "#fff", border: open ? `1px solid ${C.line}` : "none", borderRadius: 8, padding: "7px 14px", fontWeight: 700, fontSize: 12.5 }}>
          {open ? "cancel" : "+ Add task"}
        </button>
      </div>

      {open && (
        <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: 10, marginTop: 8 }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What has to be done"
            style={{ width: "100%", border: `1px solid ${C.line}`, borderRadius: 6, padding: "9px 8px", fontSize: 15 }} />
          <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)}
              style={{ border: `1px solid ${C.line}`, borderRadius: 6, padding: "8px", fontSize: 14, flex: 1 }} />
            <button disabled={busy || !title.trim()} onClick={add}
              style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 6, padding: "9px 18px", fontWeight: 700, fontSize: 13 }}>
              {busy ? "adding…" : "Add"}
            </button>
          </div>
        </div>
      )}
      {!!msg && <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 6, color: msg.includes("✓") ? C.green : C.red }}>{msg}</div>}

      <div style={{ marginTop: 8 }}>
        {tasks.length === 0 && (
          <div style={{ fontSize: 13, color: C.faint, padding: "8px 2px" }}>Nothing open on this job.</div>
        )}
        {tasks.map((t) => (
          <div key={`${t.kind}:${t.id}`} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 8, padding: "9px 11px", marginBottom: 6 }}>
            <div style={{ fontSize: 13.5, lineHeight: 1.35 }}>{t.title}</div>
            <div style={{ fontSize: 11.5, color: C.faint, marginTop: 3, display: "flex", gap: 10 }}>
              {!!t.who && <span>{t.who}</span>}
              {!!t.due && <span style={{ color: t.due < new Date().toISOString().slice(0, 10) ? C.red : C.faint }}>due {dmy(t.due)}</span>}
              <span style={{ marginLeft: "auto", opacity: .7 }}>{t.kind === "erp" ? "ERP" : "Genie"}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
