"use client";
/**
 * IDP → Individual IDP — the management side.
 *
 * The person wrote at /idp; this is where what they wrote is READ. Everything
 * they gave is here in full — the answers, the self-ratings, every recording
 * with its own words beside it, the attachments, the salary they asked for,
 * and the consent that makes reading it legitimate.
 *
 * An UNSUBMITTED attempt is listed but marked plainly: it is not an IDP yet
 * and is not to be acted on as one. It is listed at all because "who has
 * started and stalled" is itself something HR needs to see.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { fmtFull } from "@/lib/schedule";
import { IDP_SECTIONS, IDP_RATINGS } from "@/lib/idp";
import DataTable, { type Column } from "./DataTable";
import { Pane } from "./Pane";
import { C } from "./RecordFields";

interface Row {
  id: string; employee_id: string | null; name: string; email: string; cycle: string;
  role: string | null; started_at: string; submitted_at: string | null;
  answered: number; rated: number; recordings: number; attachments: number; askGross: string | null;
}
interface Full {
  id: string; person_email: string; person_name: string | null; employee_id: string | null;
  cycle: string; role_at_time: string | null; role_summary: string | null;
  consent_at: string | null; consent_text: string | null;
  started_at: string; submitted_at: string | null;
  answers: Record<string, string>; ratings: Record<string, number>;
  audioUrls: Record<string, { url: string | null; seconds: number | null; at: string; transcript: string | null }[]>;
  attachments: { name: string; size: number; url: string | null; at: string }[];
}

const inr = (v: string) => Number(v).toLocaleString("en-IN");

export default function IdpRecords({ who }: { who: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [full, setFull] = useState<Full | null>(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const j = await api.get("/api/hrms/idp");
      setRows(j.idps || []);
      setNeedsMigration(!!j.needsMigration);
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); setRows([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    setFull(null);
    if (!openId) return;
    api.get(`/api/hrms/idp?id=${encodeURIComponent(openId)}`).then((j) => setFull(j.idp)).catch(() => setFull(null));
  }, [openId]);

  const columns: Column<Row>[] = useMemo(() => [
    { key: "employee_id", label: "EmployeeID", width: 110, value: (r) => r.employee_id,
      render: (r) => <span className="font-bold tnum">{r.employee_id || "—"}</span> },
    { key: "name", label: "Name", width: 200, value: (r) => r.name,
      render: (r) => <span className="font-semibold">{r.name}</span> },
    { key: "role", label: "Role at the time", width: 190, value: (r) => r.role },
    {
      key: "status", label: "Status", width: 130,
      value: (r) => (r.submitted_at ? "Submitted" : "Not submitted"),
      render: (r) => r.submitted_at
        ? <span className="rounded px-1.5 py-0.5 font-bold" style={{ fontSize: 10, background: "#E6F4EA", color: C.green }}>SUBMITTED</span>
        : <span className="rounded px-1.5 py-0.5 font-bold" style={{ fontSize: 10, background: "#FFF3E8", color: "#8A5B00" }}>started, not finished</span>,
    },
    { key: "submitted_at", label: "Submitted", width: 110, value: (r) => r.submitted_at,
      render: (r) => (r.submitted_at ? fmtFull(String(r.submitted_at)) : null) },
    { key: "answered", label: "Answers", width: 90, align: "right", numeric: true, value: (r) => r.answered },
    { key: "recordings", label: "🎙", width: 60, align: "right", numeric: true, value: (r) => r.recordings,
      title: "Recordings" },
    { key: "attachments", label: "📎", width: 60, align: "right", numeric: true, value: (r) => r.attachments,
      title: "Attachments" },
    {
      key: "askGross", label: "Asked for (gross/mo)", width: 150, align: "right", numeric: true,
      value: (r) => (r.askGross ? Number(r.askGross) : null),
      render: (r) => (r.askGross ? <span className="tnum font-bold" style={{ color: C.orange }}>₹{inr(r.askGross)}</span> : null),
      title: "What Gross Monthly Salary should the company pay you? — their own answer",
    },
  ], []);

  return (
    <Pane title="Individual IDP" who={who}
      blurb="What each person wrote about themselves at genie.nandan.co.in/idp — answers, self-ratings, their recordings with the words beside them, and what they asked to be paid.">
      {needsMigration && (
        <div className="rounded p-3 mb-3" style={{ background: "#FFF7E6", border: "1px solid #F5B32B", fontSize: 12, color: "#8A5B00" }}>
          <b>Run migration 0053 first.</b>
        </div>
      )}
      {msg && <div className="text-xs font-semibold mb-2" style={{ color: C.red }}>{msg}</div>}

      <div className="flex gap-2 flex-wrap mb-3">
        <Stat n={(rows || []).filter((r) => r.submitted_at).length} l="Submitted" />
        <Stat n={(rows || []).filter((r) => !r.submitted_at).length} l="Started, not finished" warn />
        <Stat n={(rows || []).filter((r) => r.askGross).length} l="Named a salary" hint="Answered the optional gross-salary question" />
      </div>

      <DataTable columns={columns} rows={rows || []} rowKey={(r) => r.id}
        onRowClick={(r) => setOpenId(r.id)} activeKey={openId} initialFrozen={2}
        empty={rows === null ? "loading…" : "Nobody has started an IDP yet."} />

      {openId && (
        <div className="fixed inset-0 flex justify-end no-print" style={{ background: "rgba(13,22,31,0.35)", zIndex: 60 }} role="button" tabIndex={0} onClick={() => setOpenId(null)}>
          <div className="h-full overflow-y-auto" style={{ background: "var(--paper)", width: "min(860px, 100%)", boxShadow: "-8px 0 24px rgba(0,0,0,0.18)" }} role="button" tabIndex={0} onClick={(e) => e.stopPropagation()}>
            {!full ? (
              <div className="p-4 text-xs" style={{ color: C.faint }}>loading…</div>
            ) : (
              <IdpFullView f={full} onReopened={() => { setOpenId(null); load(); }} />
            )}
          </div>
        </div>
      )}
    </Pane>
  );
}

function Stat({ n, l, hint, warn }: { n: number; l: string; hint?: string; warn?: boolean }) {
  return (
    <div className="bg-white rounded-lg border px-3 py-2" style={{ borderColor: warn && n ? "var(--amber)" : C.line, minWidth: 130 }} title={hint}>
      <div className="font-bold tnum" style={{ fontSize: 21, lineHeight: 1.1 }}>{n}</div>
      <div style={{ fontSize: 11, color: C.faint }}>{l}</div>
    </div>
  );
}

function IdpFullView({ f, onReopened }: { f: Full; onReopened: () => void }) {
  const finalVoice = f.audioUrls["final_voice"] || [];
  const [busy, setBusy] = useState(false);
  const reopen = async () => {
    if (!window.confirm(`Reopen ${f.person_name || f.person_email}'s IDP?\n\nNothing they wrote is lost — the lock comes off and they can work on it again. It leaves this list until they submit again.`)) return;
    setBusy(true);
    try { await api.post("/api/hrms/idp", { action: "reopen", id: f.id }); onReopened(); }
    catch (e) { alert(e instanceof Error ? e.message : String(e)); setBusy(false); }
  };
  return (
    <>
      <div className="px-4 py-3 sticky top-0" style={{ background: "var(--navy)", color: "#fff", zIndex: 2 }}>
        <div className="font-bold">{f.person_name || f.person_email}</div>
        <div style={{ fontSize: 11, color: "#8FA1B3" }}>
          {f.employee_id && <>EmployeeID {f.employee_id} · </>}{f.role_at_time || "no role recorded"} · cycle {f.cycle}
        </div>
        <div style={{ fontSize: 11, color: "#8FA1B3", marginTop: 2 }}>
          {f.submitted_at
            ? <>Submitted {fmtFull(String(f.submitted_at))}</>
            : <b style={{ color: "var(--amber)" }}>Started {fmtFull(String(f.started_at))} and NOT submitted — this is not an IDP yet</b>}
        </div>
        {f.submitted_at && (
          <button onClick={reopen} disabled={busy}
            className="mt-2 text-xs font-bold rounded px-2.5 py-1"
            style={{ background: "#FFF3E8", color: "#8A5B00" }}
            title="Take the lock off so the person can work on it again. Nothing they wrote is lost.">
            {busy ? "Reopening…" : "↩ Reopen — let them do it again, properly"}
          </button>
        )}
      </div>

      <div className="p-4">
        {/* the closing voice note first — it is the answer to "what are you worth" */}
        {(finalVoice.length > 0 || f.answers["ask_gross"] || f.answers["final_voice"]) && (
          <div className="rounded-lg p-3 mb-4" style={{ background: "#fff", border: "2px solid #E8600A" }}>
            <div className="font-bold text-sm">The reply to Raghu — cost and value</div>
            {f.answers["ask_gross"] && (
              <div className="mt-1" style={{ fontSize: 14 }}>
                Asked for: <b style={{ color: C.orange }}>₹{inr(f.answers["ask_gross"])}</b> gross per month
              </div>
            )}
            {finalVoice.map((a, i) => (
              <div key={i} className="mt-2">
                {a.url && <audio controls controlsList="nodownload" src={a.url} style={{ width: "100%", maxWidth: 420 }} />}
                {a.transcript && (
                  <details className="mt-1">
                    <summary style={{ fontSize: 11, color: C.faint, cursor: "pointer" }}>the words as heard</summary>
                    <div style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.6 }}>{a.transcript}</div>
                  </details>
                )}
              </div>
            ))}
            {f.answers["final_voice"] && (
              <div className="mt-2" style={{ fontSize: 13.5, whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{f.answers["final_voice"]}</div>
            )}
          </div>
        )}

        {IDP_SECTIONS.map((sec) => {
          const has = sec.questions.some((q) => String(f.answers[q.id] || "").trim() || (f.audioUrls[q.id] || []).length);
          if (!has) return null;
          return (
            <div key={sec.key} className="mb-4">
              <div className="font-bold text-sm">{sec.title}</div>
              {sec.questions.map((q) => {
                const v = String(f.answers[q.id] || "").trim();
                const recs = f.audioUrls[q.id] || [];
                if (!v && !recs.length) return null;
                return (
                  <div key={q.id} className="bg-white rounded-lg border p-3 mt-2" style={{ borderColor: C.line }}>
                    <div className="font-semibold" style={{ fontSize: 13 }}>{q.label}</div>
                    {v && <div style={{ fontSize: 13.5, whiteSpace: "pre-wrap", lineHeight: 1.7, marginTop: 3 }}>{v}</div>}
                    {recs.map((a, i) => (
                      <div key={i} className="mt-2">
                        {a.url && <audio controls controlsList="nodownload" src={a.url} style={{ height: 28, maxWidth: 360 }} />}
                        {a.transcript && (
                          <details><summary style={{ fontSize: 11, color: C.faint, cursor: "pointer" }}>the words as heard</summary>
                            <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.6 }}>{a.transcript}</div></details>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          );
        })}

        <div className="mb-4">
          <div className="font-bold text-sm">How they rated themselves</div>
          <div className="bg-white rounded-lg border mt-2" style={{ borderColor: C.line }}>
            {IDP_RATINGS.map((d, i) => (
              <div key={d.key} className="px-3 py-1.5 flex items-center gap-3" style={{ borderTop: i ? "1px solid #EEECE6" : undefined }}>
                <div style={{ fontSize: 13, flex: 1 }}>{d.key}</div>
                <div className="tnum font-bold" style={{ fontSize: 16, color: f.ratings[d.key] ? C.orange : "#C9C6BD" }}>
                  {f.ratings[d.key] || "—"}<span style={{ fontSize: 11, color: C.faint, fontWeight: 400 }}> /10</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {f.attachments.length > 0 && (
          <div className="mb-4">
            <div className="font-bold text-sm">Attached</div>
            {f.attachments.map((a) => (
              <div key={a.name + a.at} className="flex items-center gap-2 py-1" style={{ fontSize: 13 }}>
                📄 {a.url ? <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--blue)", fontWeight: 600 }}>{a.name}</a> : a.name}
                <span style={{ fontSize: 11, color: C.faint }}>{Math.max(1, Math.round(a.size / 1024))} KB</span>
              </div>
            ))}
          </div>
        )}

        <div className="rounded p-2" style={{ background: "#F4F2EC", fontSize: 11.5, color: C.dim, lineHeight: 1.6 }}>
          <b>Consent:</b> {f.consent_text || "—"}
          {f.consent_at && <> — ticked {fmtFull(String(f.consent_at))}</>}
          {f.role_summary && (<><br /><b>The expectation they answered against:</b> <span style={{ whiteSpace: "pre-wrap" }}>{f.role_summary}</span></>)}
        </div>
      </div>
    </>
  );
}
