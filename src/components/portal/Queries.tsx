"use client";
import { useEffect, useState } from "react";
import { api, btn, Card, dmy, Err, H1, input, label, Loading, P, pill, PrintButton, statusPill, useGet, type Boot, type Query, type Reply } from "./shared";

/**
 * THE QUERY SOLVER. A question from their side or a note from ours, on a
 * job or in general; the thread under it; open → answered → closed. Nandan's
 * people may leave an internal note the customer never sees.
 */
export default function Queries({ boot, arg, go }: { boot: Boot; arg: string | null; go: (t: string, a?: string | null) => void }) {
  const slug = boot.scope.slug;
  const r = useGet<{ queries: Query[]; replies: Reply[] }>(`/api/portal/queries?slug=${encodeURIComponent(slug)}`);
  const [open, setOpen] = useState<string | null>(arg && !arg.startsWith("new") ? arg : null);
  const [asking, setAsking] = useState(!!arg?.startsWith("new"));
  const [filter, setFilter] = useState<"open" | "all">("open");
  useEffect(() => { if (arg?.startsWith("new")) setAsking(true); else if (arg) setOpen(arg); }, [arg]);
  const qs = (r.data?.queries || []).filter((q) => filter === "all" || q.status !== "closed");
  const replies = r.data?.replies || [];
  const cur = qs.find((q) => q.id === open) || (r.data?.queries || []).find((q) => q.id === open) || null;
  const canAsk = !!boot.org;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <H1 sub={boot.org ? `Ask Nandan anything about your orders; every question and its answer stays here.` : "Every organisation's open questions, for Nandan to answer."}>Query solver</H1>
        <div style={{ display: "flex", gap: 8 }} className="no-print">
          {canAsk && <button onClick={() => { setAsking(true); setOpen(null); }} style={btn("primary")}>+ New query</button>}
          <PrintButton />
        </div>
      </div>
      {r.error && <Err e={r.error} />}
      {asking && canAsk && <NewQuery boot={boot} jobArg={arg?.startsWith("new-") ? arg.slice(4) : null} onDone={(id) => { setAsking(false); r.reload(); if (id) { setOpen(id); go("queries", id); } }} onCancel={() => { setAsking(false); if (arg) go("queries"); }} />}
      <div style={{ display: "grid", gridTemplateColumns: cur ? "minmax(260px, 1fr) minmax(320px, 1.4fr)" : "1fr", gap: 16 }} className="portal-split">
        <Card title={r.data ? `${qs.length} ${filter === "open" ? "open" : "in all"}` : "Queries"} right={
          <span className="no-print" style={{ display: "flex", gap: 4 }}>
            {(["open", "all"] as const).map((f) => <button key={f} onClick={() => setFilter(f)} style={btn("ghost", { padding: "2px 8px", fontSize: 11, background: filter === f ? P.navy : "#fff", color: filter === f ? "#fff" : P.ink })}>{f}</button>)}
          </span>}>
          {r.loading ? <Loading /> : qs.length === 0 ? <div style={{ color: P.muted, fontSize: 13, padding: 8 }}>{filter === "open" ? "Nothing open." : "No queries yet."}</div> : (
            <div style={{ display: "grid", gap: 6 }}>
              {qs.map((q) => {
                const n = replies.filter((x) => x.query_id === q.id).length;
                const on = cur?.id === q.id;
                return (
                  <button key={q.id} onClick={() => { setOpen(q.id); go("queries", q.id); }} style={{ textAlign: "left", background: on ? P.soft : "#fff", border: `1px solid ${on ? P.accent : P.line}`, borderRadius: 10, padding: "10px 12px", cursor: "pointer" }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <b style={{ fontSize: 13, flex: 1 }}>{q.subject}</b>{statusPill(q.status)}
                    </div>
                    <div style={{ fontSize: 12, color: P.muted, marginTop: 3 }}>
                      {!boot.org && <span style={{ ...pill(P.blue), marginRight: 6 }}>{q.org_slug}</span>}
                      {q.job_id ? `Job ${q.job_id} · ` : ""}{q.by_name} · {dmy(q.updated_at)}{n ? ` · ${n} ${n === 1 ? "reply" : "replies"}` : ""}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Card>
        {cur && <Thread boot={boot} q={cur} replies={replies.filter((x) => x.query_id === cur.id)} reload={r.reload} close={() => { setOpen(null); go("queries"); }} />}
      </div>
      <style>{`@media (max-width: 900px) { .portal-split { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}

function NewQuery({ boot, jobArg, onDone, onCancel }: { boot: Boot; jobArg: string | null; onDone: (id: string | null) => void; onCancel: () => void }) {
  const [subject, setSubject] = useState(jobArg ? `About job ${jobArg}` : "");
  const [body, setBody] = useState("");
  const [job, setJob] = useState(jobArg || "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true); setErr(null);
    try { const r = await api<{ id: string }>("/api/portal/queries", { action: "ask", slug: boot.scope.slug, job_id: job, subject, body }); onDone(r.id); }
    catch (e) { setErr(String((e as Error).message || e)); setBusy(false); }
  };
  return (
    <Card title="A new query" right={<button onClick={onCancel} style={btn("ghost", { padding: "3px 9px", fontSize: 12 })}>Cancel</button>}>
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 180px", gap: 10 }}>
          <div><label style={label}>Subject</label><input style={input} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="What is it about?" /></div>
          <div><label style={label}>Job number (optional)</label><input style={input} value={job} onChange={(e) => setJob(e.target.value)} /></div>
        </div>
        <div><label style={label}>The question, in your words</label><textarea style={{ ...input, minHeight: 100 }} value={body} onChange={(e) => setBody(e.target.value)} /></div>
        {err && <div style={{ color: P.red, fontSize: 13 }}>{err}</div>}
        <div><button onClick={send} disabled={busy} style={btn("primary")}>{busy ? "Sending…" : "Send to Nandan"}</button></div>
      </div>
    </Card>
  );
}

function Thread({ boot, q, replies, reload, close }: { boot: Boot; q: Query; replies: Reply[]; reload: () => void; close: () => void }) {
  const [text, setText] = useState("");
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const post = async () => {
    if (!text.trim()) return;
    setBusy(true); setErr(null);
    try { await api("/api/portal/queries", { action: "reply", id: q.id, body: text, internal }); setText(""); reload(); }
    catch (e) { setErr(String((e as Error).message || e)); }
    setBusy(false);
  };
  const setStatus = async (status: string) => { try { await api("/api/portal/queries", { action: "status", id: q.id, status }); reload(); } catch (e) { setErr(String((e as Error).message || e)); } };
  const bubble = (side: string, who: string, when: string, body: string, isInternal = false, key?: string) => (
    <div key={key} style={{ display: "flex", justifyContent: side === "us" ? "flex-start" : "flex-end" }}>
      <div style={{ maxWidth: "85%", background: isInternal ? "#fff7e6" : side === "us" ? P.soft : P.navy, color: side === "us" || isInternal ? P.ink : "#fff", borderRadius: 12, padding: "8px 12px", border: isInternal ? `1px dashed ${P.amber}` : "none" }}>
        <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 2 }}>{isInternal ? "Internal note · " : ""}{who} · {dmy(when)}</div>
        <div style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{body}</div>
      </div>
    </div>
  );
  return (
    <Card title={q.subject} right={<span style={{ display: "flex", gap: 6, alignItems: "center" }}>{statusPill(q.status)}<button onClick={close} className="no-print" style={btn("ghost", { padding: "2px 8px", fontSize: 12 })}>✕</button></span>}>
      <div style={{ fontSize: 12, color: P.muted, marginBottom: 10 }}>{q.job_id ? `Job ${q.job_id} · ` : ""}raised by {q.by_name} on {dmy(q.at)}{!boot.org ? ` · ${q.org_slug}` : ""}</div>
      <div style={{ display: "grid", gap: 8 }}>
        {bubble(q.by_side, q.by_name, q.at, q.body || "(no details)")}
        {replies.map((r) => bubble(r.by_side, r.by_name, r.at, r.body, r.internal, r.id))}
      </div>
      {q.id.startsWith("task:") && <div style={{ fontSize: 12, color: P.muted, marginTop: 8 }}>Raised by Nandan and tracked in Genie&apos;s Query Solver — it is answered there, and closes here when it closes there.</div>}
      {q.status !== "closed" && !q.id.startsWith("task:") && (
        <div className="no-print" style={{ marginTop: 14, display: "grid", gap: 8 }}>
          <textarea style={{ ...input, minHeight: 70 }} value={text} onChange={(e) => setText(e.target.value)} placeholder={boot.me.staff ? "Answer, or an internal note…" : "Write back…"} />
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={post} disabled={busy} style={btn("primary")}>{busy ? "Posting…" : "Post"}</button>
            {boot.me.staff && <label style={{ fontSize: 12, color: P.dim, display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> internal note (not shown to the customer)</label>}
            <span style={{ flex: 1 }} />
            {boot.me.staff && q.status === "open" && <button onClick={() => setStatus("answered")} style={btn("ghost")}>Mark answered</button>}
            <button onClick={() => setStatus("closed")} style={btn("ghost")}>Close</button>
          </div>
        </div>
      )}
      {q.status === "closed" && boot.me.staff && <div className="no-print" style={{ marginTop: 10 }}><button onClick={() => setStatus("open")} style={btn("ghost")}>Reopen</button></div>}
      {err && <div style={{ color: P.red, fontSize: 13, marginTop: 8 }}>{err}</div>}
    </Card>
  );
}
