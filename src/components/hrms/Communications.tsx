"use client";
/**
 * Communications — everything HRMS has sent and everything that came back
 * (Dr Raghu, 4 Sep 2026: "kept in the communications tab which will be in
 * the side as well as with each employee and also with the payroll runs").
 *
 * One list across every person and every run: e-mail and WhatsApp out,
 * WhatsApp replies in. Filter by channel, direction, run, or a name.
 */
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { fmtFull } from "@/lib/schedule";
import { MONTHS } from "@/lib/hrms-template";
import { Pane } from "./Pane";
import { C } from "./RecordFields";

interface Row { id: string; employee_id: string; name: string; channel: string; direction: string; to_address: string | null; subject: string | null; body: string; status: string; error: string | null; sent_by: string | null; sent_at: string; run_id: string | null; run_label: string | null }

export default function Communications({ who }: { who: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");
  const [channel, setChannel] = useState("");
  const [dir, setDir] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { const j = await api.get("/api/hrms/communication?all=1"); setRows(j.rows || []); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); setRows([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = (rows || []).filter((r) => (!channel || r.channel === channel) && (!dir || r.direction === dir) && (!q || `${r.name} ${r.employee_id} ${r.subject || ""} ${r.body}`.toLowerCase().includes(q.toLowerCase())));
  const tone = (s: string) => (s === "delivered" || s === "received" ? C.green : s === "failed" ? C.red : s === "sent" ? "var(--blue)" : C.dim);
  const counts: Record<string, number> = {};
  for (const r of rows || []) { const k = r.direction === "in" ? "replies" : r.status; counts[k] = (counts[k] || 0) + 1; }

  return (
    <Pane title="Communications" who={who} print blurb="Everything HRMS has sent, and everything that came back — by person, by run, by channel. The same lines sit on each record's Communication tab and on each payroll run.">
      {msg && <div className="text-xs font-semibold mb-2" style={{ color: C.red }}>{msg}</div>}
      <div className="flex gap-1.5 mb-2 flex-wrap items-center text-xs">
        {Object.entries(counts).map(([k, v]) => <span key={k} className="rounded px-2 py-0.5 font-bold" style={{ background: "#F4F2EC", color: tone(k === "replies" ? "received" : k) }}>{k} {v}</span>)}
        <span style={{ flex: 1 }} />
        <select value={channel} onChange={(e) => setChannel(e.target.value)} className="rounded px-2 py-1 bg-white" style={{ border: `1px solid ${C.line}` }}><option value="">all channels</option><option value="whatsapp">WhatsApp</option><option value="email">E-mail</option><option value="note">Logged</option></select>
        <select value={dir} onChange={(e) => setDir(e.target.value)} className="rounded px-2 py-1 bg-white" style={{ border: `1px solid ${C.line}` }}><option value="">out and in</option><option value="out">sent</option><option value="in">replies</option></select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="name, id, words…" className="rounded px-2 py-1" style={{ border: `1px solid ${C.line}`, width: 200 }} />
        <button onClick={load} className="rounded border px-2 py-1 bg-white" style={{ borderColor: C.line, color: C.dim }}>↻</button>
      </div>
      <div className="bg-white rounded-lg border" style={{ borderColor: C.line }}>
        {rows === null && <div className="p-3 text-xs" style={{ color: C.faint }}>loading…</div>}
        {rows && !shown.length && <div className="p-3 text-xs" style={{ color: C.faint }}>Nothing here.</div>}
        {shown.map((r, i) => (
          <div key={r.id} className="px-3 py-2" style={{ borderTop: i ? "1px solid #EEECE6" : undefined }}>
            <button onClick={() => setOpen(open === r.id ? null : r.id)} className="w-full text-left text-xs flex gap-2 items-baseline flex-wrap">
              <span className="rounded px-1.5 py-0.5 font-bold" style={{ background: r.direction === "in" ? "#E6F4EA" : "#F4F2EC", color: tone(r.status), fontSize: 10 }}>{r.direction === "in" ? "↩ reply" : r.status}</span>
              <span className="font-semibold">{r.name}</span>
              <span style={{ color: C.faint }}>{r.channel === "whatsapp" ? "💬" : r.channel === "email" ? "✉" : "📝"} {r.to_address || ""}{r.subject && r.channel === "email" ? ` · ${r.subject}` : ""}</span>
              {r.run_label && <span className="rounded px-1.5 py-0.5" style={{ background: "#DCE8F5", color: "var(--blue)", fontSize: 10 }}>run {r.run_label}</span>}
              <span style={{ flex: 1 }} />
              <span style={{ color: C.faint }}>{fmtFull(String(r.sent_at))} · {String(r.sent_by || "").split("·")[0].trim()}</span>
              {r.error && <span style={{ color: C.red }} title={r.error}>!</span>}
            </button>
            {open === r.id && <div className="mt-1" style={{ fontSize: 12.5, whiteSpace: "pre-wrap", lineHeight: 1.5, color: r.direction === "in" ? C.green : C.ink }}>{r.body}</div>}
          </div>
        ))}
      </div>
      <div className="text-xs mt-2" style={{ color: C.faint }}>{MONTHS.length ? "" : ""}Replies are pulled from WhatsApp on each run&apos;s Communications tab (Pull replies).</div>
    </Pane>
  );
}
