"use client";
/**
 * Approvals → RJ Approval - Salary Queries.
 *
 * Where HR puts a question to Dr Raghu and the two of them settle it. Not a
 * ticket queue: a question, a discussion, and an answer that is KEPT — because
 * six months later what gets asked is never "what did we decide" on its own,
 * it is "what did we decide, and why".
 *
 * HR raises and may reply. Only the owner answers, because the answer is
 * what closes it.
 */
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { fmtFull } from "@/lib/schedule";
import { Pane } from "./Pane";
import { C } from "./RecordFields";

interface Row {
  id: string; employee_id: string | null; person: string | null;
  subject: string; question: string; topic: string; status: string;
  thread: { by: string; at: string; text: string }[];
  answer: string | null;
  raised_by: string | null; raised_at: string;
  answered_by: string | null; answered_at: string | null;
}

const day = (iso: string | null) => (iso ? fmtFull(String(iso).slice(0, 10)) : "—");
const who = (s: string | null) => String(s || "—").split("·")[0].trim();
const TOPICS = ["Salary", "Increment", "Deduction", "Statutory", "Policy", "Other"];

export default function ApprovalQueries({ who: me, isOwner }: { who: string; isOwner: boolean }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [needs, setNeeds] = useState(false);
  const [tab, setTab] = useState<"open" | "answered">("open");
  const [msg, setMsg] = useState("");
  const [raise, setRaise] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { const j = await api.get("/api/hrms/queries"); setRows(j.rows || []); setNeeds(!!j.needsMigration); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); setRows([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = (rows || []).filter((r) => (tab === "open" ? r.status === "Open" : r.status !== "Open"));
  const openN = (rows || []).filter((r) => r.status === "Open").length;

  return (
    <Pane title="RJ Approval - Salary Queries" who={me} print
      blurb="Where HR raises a question for discussion and a decision. Raised, talked through, answered, and closed on the record.">
      {msg && <div className="text-xs font-semibold mb-2" style={{ color: msg.includes("✓") ? C.green : C.red }}>{msg}</div>}
      {needs && <div className="rounded p-2 mb-2" style={{ background: "#FFF7E6", border: "1px solid #F5D9A8", fontSize: 12.5, color: "#8A5B00" }}>Run migration 0065 — a query has nowhere to live yet.</div>}

      <div className="flex gap-1.5 mb-3 no-print flex-wrap">
        {(["open", "answered"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className="rounded px-3 py-1.5 font-bold"
            style={{ fontSize: 12.5, background: tab === t ? C.orange : "#fff", color: tab === t ? "#fff" : C.dim, border: `1px solid ${tab === t ? C.orange : C.line}` }}>
            {t === "open" ? `Open${openN ? ` (${openN})` : ""}` : `Answered (${(rows || []).length - openN})`}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={() => setRaise((v) => !v)} className="rounded px-3 py-1.5 font-bold"
          style={{ fontSize: 12.5, background: raise ? "#fff" : C.green, color: raise ? C.dim : "#fff", border: `1px solid ${raise ? C.line : C.green}` }}>
          {raise ? "✕ Close" : "+ Raise a query"}
        </button>
      </div>

      {raise && <RaiseQuery onDone={() => { setRaise(false); load(); }} />}

      {rows === null ? <div className="text-sm py-6 text-center" style={{ color: C.faint }}>loading…</div>
        : !shown.length ? (
          <div className="bg-white rounded-lg border p-4" style={{ borderColor: C.line }}>
            <div className="font-bold" style={{ color: C.green }}>{tab === "open" ? "Nothing waiting." : "Nothing answered yet."}</div>
            <div style={{ fontSize: 13, color: C.dim, marginTop: 4 }}>
              {tab === "open" ? "Every question HR has raised has been answered. The moment one is raised, it appears here." : "Answered questions are kept here with the discussion that led to them."}
            </div>
          </div>
        ) : shown.map((r) => (
          <QueryCard key={r.id} r={r} isOwner={isOwner} expanded={open === r.id}
            onToggle={() => setOpen(open === r.id ? null : r.id)} onChanged={load} />
        ))}
    </Pane>
  );
}

function QueryCard({ r, isOwner, expanded, onToggle, onChanged }: { r: Row; isOwner: boolean; expanded: boolean; onToggle: () => void; onChanged: () => void }) {
  const [reply, setReply] = useState("");
  const [answer, setAnswer] = useState(r.answer || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const send = async (body: Record<string, unknown>) => {
    setBusy(true); setErr("");
    try { await api.post("/api/hrms/queries", { ...body, id: r.id }); setReply(""); onChanged(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };
  const answered = r.status !== "Open";
  return (
    <div className="bg-white rounded-lg border mb-2" style={{ borderColor: C.line, borderLeft: `4px solid ${answered ? "#0D7A3F" : "#E8600A"}` }}>
      <button onClick={onToggle} className="w-full text-left px-3 py-2.5">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="rounded px-1.5 py-0.5 font-bold" style={{ fontSize: 10, background: "#F4F2EC", color: C.dim }}>{r.topic}</span>
          <span className="font-bold" style={{ fontSize: 13.5 }}>{r.subject}</span>
          {r.person && <span style={{ fontSize: 12, color: C.faint }}>· {r.employee_id} {r.person}</span>}
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: C.faint }}>asked {day(r.raised_at)} by {who(r.raised_by)}</span>
          {answered
            ? <span className="rounded px-1.5 py-0.5 font-bold" style={{ fontSize: 10, background: "#E6F4EA", color: "#0D7A3F" }}>answered {day(r.answered_at)}</span>
            : <span className="rounded px-1.5 py-0.5 font-bold" style={{ fontSize: 10, background: "#FFF3E8", color: "#8A5B00" }}>open</span>}
          <span style={{ color: C.faint, fontSize: 12 }}>{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3">
          <div style={{ fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.6, borderTop: `1px solid ${C.line}`, paddingTop: 8 }}>{r.question}</div>

          {r.thread.map((t, i) => (
            <div key={i} className="rounded p-2 mt-2" style={{ background: "#F7F6F2", fontSize: 12.5 }}>
              <b>{who(t.by)}</b> <span style={{ color: C.faint, fontSize: 11 }}>· {day(t.at)}</span>
              <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, marginTop: 2 }}>{t.text}</div>
            </div>
          ))}

          {r.answer && (
            <div className="rounded p-2.5 mt-2" style={{ background: "#E6F4EA", border: "1px solid #BFE3CB" }}>
              <div className="font-bold" style={{ fontSize: 12, color: "#0D7A3F" }}>The decision — {who(r.answered_by)}, {day(r.answered_at)}</div>
              <div style={{ fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.6, marginTop: 3 }}>{r.answer}</div>
            </div>
          )}

          <div className="mt-2 no-print">
            <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} placeholder="Add to the discussion…"
              className="w-full rounded px-2 py-1.5" style={{ border: `1px solid ${C.line}`, fontSize: 13 }} />
            <button onClick={() => send({ action: "reply", text: reply })} disabled={busy || !reply.trim()}
              className="rounded px-3 py-1.5 font-bold mt-1" style={{ background: reply.trim() ? "#1B3A5C" : "#E2E0DA", color: reply.trim() ? "#fff" : "#8A94A0", fontSize: 12.5 }}>
              Reply
            </button>
          </div>

          {isOwner && !answered && (
            <div className="mt-2 rounded p-2.5 no-print" style={{ background: "#FBFAF7", border: `1px solid ${C.line}` }}>
              <div className="font-bold" style={{ fontSize: 12 }}>Answer and close it</div>
              <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={3} placeholder="The decision, in your words…"
                className="w-full rounded px-2 py-1.5 mt-1" style={{ border: `1px solid ${C.line}`, fontSize: 13 }} />
              <button onClick={() => send({ action: "answer", answer })} disabled={busy || !answer.trim()}
                className="rounded px-3 py-1.5 font-bold mt-1" style={{ background: answer.trim() ? C.green : "#E2E0DA", color: answer.trim() ? "#fff" : "#8A94A0", fontSize: 12.5 }}>
                ✓ Answer and close
              </button>
            </div>
          )}
          {isOwner && answered && (
            <button onClick={() => send({ action: "reopen" })} disabled={busy}
              className="rounded px-3 py-1.5 font-bold mt-2 no-print" style={{ background: "#fff", color: "#8A5B00", border: `1px solid ${C.line}`, fontSize: 12 }}>
              Reopen — the answer did not settle it
            </button>
          )}
          {err && <div className="text-xs font-semibold mt-2" style={{ color: C.red }}>{err}</div>}
        </div>
      )}
    </div>
  );
}

function RaiseQuery({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ subject: "", question: "", topic: "Salary", employee_id: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const go = async () => {
    setBusy(true); setErr("");
    try { await api.post("/api/hrms/queries", { action: "raise", ...f }); onDone(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };
  return (
    <div className="rounded-lg border p-3 mb-3" style={{ borderColor: C.line, background: "#FBFAF7" }}>
      <div className="font-bold mb-2" style={{ fontSize: 13 }}>Raise a query for RJ</div>
      <div className="flex gap-2 flex-wrap items-end mb-2">
        <label style={{ fontSize: 11.5, color: C.faint }}>Topic
          <select value={f.topic} onChange={(e) => setF((x) => ({ ...x, topic: e.target.value }))}
            className="rounded px-2 py-1.5 block bg-white" style={{ border: `1px solid ${C.line}`, fontSize: 13, color: C.ink }}>
            {TOPICS.map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 11.5, color: C.faint }}>About whom (optional)
          <input value={f.employee_id} placeholder="EmployeeID" onChange={(e) => setF((x) => ({ ...x, employee_id: e.target.value }))}
            className="rounded px-2 py-1.5 block" style={{ border: `1px solid ${C.line}`, width: 110, fontSize: 13 }} />
        </label>
        <label style={{ fontSize: 11.5, color: C.faint, flex: 1, minWidth: 240 }}>Subject
          <input value={f.subject} placeholder="The line that gets read first" onChange={(e) => setF((x) => ({ ...x, subject: e.target.value }))}
            className="rounded px-2 py-1.5 block w-full" style={{ border: `1px solid ${C.line}`, fontSize: 13 }} />
        </label>
      </div>
      <textarea value={f.question} rows={3} placeholder="The question, with whatever RJ needs to decide it…"
        onChange={(e) => setF((x) => ({ ...x, question: e.target.value }))}
        className="w-full rounded px-2 py-1.5" style={{ border: `1px solid ${C.line}`, fontSize: 13 }} />
      <button onClick={go} disabled={busy} className="rounded px-3 py-1.5 font-bold mt-1"
        style={{ background: C.green, color: "#fff", fontSize: 12.5 }}>{busy ? "Sending…" : "Send to RJ"}</button>
      {err && <div className="text-xs font-semibold mt-2" style={{ color: C.red }}>{err}</div>}
    </div>
  );
}
