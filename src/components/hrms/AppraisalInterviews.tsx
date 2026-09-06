"use client";
/**
 * Appraisal Interviews — the audit of the conversations themselves.
 *
 * One row per person on the roll, and each person owes the cycle TWO
 * discussions: their own (the Self IDP, spoken and written at /idp) and
 * their manager's (the review). The row answers the audit questions — was
 * it held, by whom, when, how much was actually said — and the click opens
 * everything that was said: every voice note with its transcript, both
 * sides, one lightbox.
 */
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { fmtFull } from "@/lib/schedule";
import { IDP_SECTIONS } from "@/lib/idp";
import DataTable, { type Column } from "./DataTable";
import { Pane } from "./Pane";
import { C } from "./RecordFields";

interface Held { started: string | null; submitted: string | null; voices: number; seconds: number }
interface Row {
  id: string; name: string; department: string | null;
  self: Held | null;
  reviews: (Held & { by: string })[];
}
interface Rec { url: string | null; seconds: number | null; transcript: string | null }
interface Detail {
  employee: { id: string; name: string; department: string | null; designation: string | null };
  idp: { submitted_at: string | null; audioUrls: Record<string, Rec[]> } | null;
  reviews: { reviewer_email: string; reviewer_name: string | null; submitted_at: string | null; notes: string | null; voice: Rec[] }[];
}

const mins = (s: number) => (s >= 60 ? `${Math.round(s / 60)} min` : s > 0 ? `${s} sec` : "");
const day = (iso: string | null | undefined) => (iso ? fmtFull(String(iso)) : "");

// every voice note lives against a question id; name them for the auditor
const Q_LABEL: Record<string, string> = Object.fromEntries(
  IDP_SECTIONS.flatMap((s) => s.questions).map((q) => [q.id, q.label]),
);
Q_LABEL["final_voice"] = "Final reply to Raghu";

function heldChip(h: { submitted: string | null; started?: string | null } | null | undefined) {
  if (!h) return <span className="rounded px-1.5 py-0.5 font-bold" style={{ fontSize: 10, background: "#F4F2EC", color: "#C9C6BD" }}>not held</span>;
  if (h.submitted) return <span className="rounded px-1.5 py-0.5 font-bold" style={{ fontSize: 10, background: "#E6F4EA", color: "var(--green)" }}>held · {day(h.submitted)}</span>;
  return <span className="rounded px-1.5 py-0.5 font-bold" style={{ fontSize: 10, background: "#FFF3E8", color: "#8A5B00" }}>in progress</span>;
}

export default function AppraisalInterviews({ who }: { who: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");
  const [only, setOnly] = useState("");
  const [open, setOpen] = useState<Row | null>(null);

  useEffect(() => {
    api.get("/api/hrms/idp?interviews=1").then((j) => setRows(j.rows || []))
      .catch((e) => { setMsg(e instanceof Error ? e.message : String(e)); setRows([]); });
  }, []);

  const depts = useMemo(() => [...new Set((rows || []).map((r) => r.department).filter(Boolean))].sort() as string[], [rows]);
  const state = (r: Row) => {
    const self = !!r.self?.submitted, mgr = r.reviews.some((v) => v.submitted);
    return self && mgr ? "Both held" : self ? "Self only" : mgr ? "Manager only" : r.self ? "Self in progress" : "Not held";
  };

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (rows || []).filter((r) => {
      if (dept && r.department !== dept) return false;
      if (only && state(r) !== only) return false;
      if (n && !`${r.id} ${r.name}`.toLowerCase().includes(n)) return false;
      return true;
    });
  }, [rows, q, dept, only]);

  const columns: Column<Row>[] = useMemo(() => [
    { key: "id", label: "EmployeeID", width: 105, value: (r) => r.id, render: (r) => <b>{r.id}</b> },
    { key: "name", label: "Name", width: 190, value: (r) => r.name, render: (r) => <span className="font-semibold" style={{ color: "var(--blue)", textDecoration: "underline", textUnderlineOffset: 2 }}>{r.name}</span> },
    { key: "department", label: "Department", width: 135, value: (r) => r.department },
    { key: "self", label: "Self discussion", width: 155, value: (r) => r.self?.submitted || (r.self ? "~" : ""), render: (r) => heldChip(r.self) },
    { key: "selfsaid", label: "Self said", width: 110, align: "right", value: (r) => r.self?.seconds ?? null, numeric: true, render: (r) => r.self?.voices ? <span style={{ fontSize: 11.5 }}>{r.self.voices} notes · {mins(r.self.seconds)}</span> : null },
    { key: "mgrby", label: "Manager", width: 160, value: (r) => r.reviews.map((v) => v.by).join(", ") },
    { key: "mgr", label: "Manager discussion", width: 165, value: (r) => r.reviews.find((v) => v.submitted)?.submitted || (r.reviews.length ? "~" : ""), render: (r) => heldChip(r.reviews.find((v) => v.submitted) || r.reviews[0] || null) },
    { key: "mgrsaid", label: "Manager said", width: 115, align: "right", numeric: true, value: (r) => r.reviews.reduce((a, v) => a + v.seconds, 0) || null, render: (r) => { const s = r.reviews.reduce((a, v) => a + v.seconds, 0); const n = r.reviews.reduce((a, v) => a + v.voices, 0); return n ? <span style={{ fontSize: 11.5 }}>{n} notes · {mins(s)}</span> : null; } },
    { key: "state", label: "Audit", width: 130, value: (r) => state(r), render: (r) => { const st = state(r); const ok = st === "Both held"; return <span className="rounded px-1.5 py-0.5 font-bold" style={{ fontSize: 10, background: ok ? "#E6F4EA" : st === "Not held" ? "#FBEAE8" : "#FFF3E8", color: ok ? "var(--green)" : st === "Not held" ? "#B3392E" : "#8A5B00" }}>{ok ? "✓ " : ""}{st}</span>; } },
  ], []);

  const both = (rows || []).filter((r) => state(r) === "Both held").length;
  const selfOnly = (rows || []).filter((r) => state(r) === "Self only").length;
  const none = (rows || []).filter((r) => state(r) === "Not held").length;

  return (
    <Pane title="Appraisal Interviews (Audit of each)" who={who} print
      blurb="Two conversations per person — their own IDP and their manager's review. Was each held, by whom, when, and how much was actually said. Click a row to hear it.">
      {msg && <div className="text-xs font-semibold mb-2" style={{ color: C.red }}>{msg}</div>}

      <div className="flex gap-2 flex-wrap mb-3">
        {[["On the roll", (rows || []).length, false], ["Both held", both, true], ["Self only", selfOnly, false], ["Not held", none, false]].map(([l, n, g]) => (
          <div key={String(l)} className="bg-white rounded-lg border px-3 py-2" style={{ borderColor: C.line, minWidth: 110 }}>
            <div className="font-bold tnum" style={{ fontSize: 21, lineHeight: 1.1, color: g && n ? C.green : C.ink }}>{String(n)}</div>
            <div style={{ fontSize: 11, color: C.faint }}>{String(l)}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-1.5 flex-wrap items-center mb-2 no-print">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ID or name…"
          className="text-xs rounded px-2.5 py-1.5" style={{ border: `1px solid ${C.line}`, width: 200 }} />
        <select value={dept} onChange={(e) => setDept(e.target.value)} className="text-xs rounded px-2 py-1.5 bg-white" style={{ border: `1px solid ${C.line}` }}>
          <option value="">All departments</option>
          {depts.map((t) => (<option key={t} value={t}>{t}</option>))}
        </select>
        <select value={only} onChange={(e) => setOnly(e.target.value)} className="text-xs rounded px-2 py-1.5 bg-white" style={{ border: `1px solid ${C.line}` }}>
          <option value="">All states</option>
          {["Both held", "Self only", "Manager only", "Self in progress", "Not held"].map((t) => (<option key={t} value={t}>{t}</option>))}
        </select>
        <span className="text-xs" style={{ color: C.faint }}>{rows === null ? "loading…" : `${shown.length} shown`}</span>
      </div>

      <DataTable columns={columns} rows={shown} rowKey={(r) => r.id} initialFrozen={2}
        onRowClick={(r) => setOpen(r)}
        empty={rows === null ? "loading…" : "Nobody matches those filters."} />

      {open && <DiscussionBox row={open} onClose={() => setOpen(null)} />}
    </Pane>
  );
}

/* ── the lightbox: everything that was said, both sides ── */
function DiscussionBox({ row, onClose }: { row: Row; onClose: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    api.get(`/api/hrms/idp?person=${encodeURIComponent(row.id)}`).then(setD)
      .catch((e) => setMsg(e instanceof Error ? e.message : String(e)));
  }, [row.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3" style={{ background: "rgba(15,23,32,.55)" }} role="button" tabIndex={0} onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl flex flex-col" style={{ width: "min(860px, 96vw)", maxHeight: "92vh" }} role="button" tabIndex={0} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${C.line}` }}>
          <div>
            <div className="font-bold" style={{ fontSize: 15 }}>{row.id} · {row.name}</div>
            <div style={{ fontSize: 11.5, color: C.faint }}>{row.department || ""} — the discussions, as spoken</div>
          </div>
          <button onClick={onClose} className="text-sm font-bold rounded px-2 py-1" style={{ color: C.faint }}>✕ Close</button>
        </div>
        <div className="overflow-y-auto px-4 py-3" style={{ flex: 1 }}>
          {msg && <div className="text-xs font-semibold" style={{ color: C.red }}>{msg}</div>}
          {!d && !msg && <div className="text-sm py-6 text-center" style={{ color: C.faint }}>loading the discussion…</div>}
          {d && (
            <>
              <SectionTitle t="1 · Self discussion — their own IDP" chip={heldChip(row.self)} />
              {!d.idp || !Object.keys(d.idp.audioUrls || {}).length
                ? <div className="text-sm mb-3" style={{ color: C.faint }}>No voice notes on the self side{d.idp ? "" : " — the IDP has not been started"}.</div>
                : Object.entries(d.idp.audioUrls).map(([qid, list]) => list.length ? (
                  <div key={qid} className="mb-3">
                    <div className="font-semibold" style={{ fontSize: 12.5, color: C.dim }}>{Q_LABEL[qid] || qid}</div>
                    {list.map((v, i) => (
                      <div key={i} className="mt-1.5">
                        {v.url && <audio controls controlsList="nodownload" src={v.url} style={{ height: 28, maxWidth: 400 }} />}
                        {v.transcript && <div style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.6, marginTop: 3, whiteSpace: "pre-wrap" }}>{v.transcript}</div>}
                      </div>
                    ))}
                  </div>
                ) : null)}

              <SectionTitle t="2 · Manager discussion — the review" chip={heldChip(row.reviews.find((v) => v.submitted) || row.reviews[0] || null)} />
              {!d.reviews.length
                ? <div className="text-sm" style={{ color: C.faint }}>No manager review yet.</div>
                : d.reviews.map((r) => (
                  <div key={r.reviewer_email} className="rounded-lg border p-3 mb-3" style={{ borderColor: C.line, background: "#FBFAF7" }}>
                    <div className="font-bold" style={{ fontSize: 13 }}>
                      {r.reviewer_name || r.reviewer_email}
                      <span className="font-normal" style={{ fontSize: 11, color: r.submitted_at ? C.green : "#8A5B00" }}>
                        {" "}· {r.submitted_at ? `submitted ${day(r.submitted_at)}` : "in progress"}
                      </span>
                    </div>
                    {r.voice.map((v, i) => (
                      <div key={i} className="mt-2">
                        {v.url && <audio controls controlsList="nodownload" src={v.url} style={{ height: 28, maxWidth: 400 }} />}
                        {v.transcript && <div style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.6, marginTop: 3, whiteSpace: "pre-wrap" }}>{v.transcript}</div>}
                      </div>
                    ))}
                    {r.notes && <div className="mt-2" style={{ fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{r.notes}</div>}
                    {!r.voice.length && !r.notes && <div className="text-xs mt-1" style={{ color: C.faint }}>Nothing spoken or written yet.</div>}
                  </div>
                ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ t, chip }: { t: string; chip: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mt-2 mb-2" style={{ borderTop: "2px solid #16232F", paddingTop: 8 }}>
      <div className="font-bold" style={{ fontSize: 13.5 }}>{t}</div>
      {chip}
    </div>
  );
}
