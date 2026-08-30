"use client";
/**
 * THE BELIEVABLE PLAN (Dr Raghu, 30 Aug 2026) — the Month & Quarter Plan desk.
 *
 * DONE so far on the left of the ledger; the MORE list below it — every
 * active job whose TDD lands by the period's natural end. Against each job
 * the signed-in planner writes THEIR OWN read: a comment, a belief
 * (0 · 10 · 25 · 50 · 75 · 90 · 100), and "my best estimate" of the delivery
 * date, born as the TDD. Then the signature: "This is my Plan" → "Is this
 * your final Plan?" → signed, mailed to the signer with Stratcom in cc —
 * and only then does the REALISTIC plan show itself: belief-weighted, on
 * the planner's own dates.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { fmt, fmtFull, jobNo } from "@/lib/schedule";

const C = {
  ink: "#16232F", sub: "#5A6672", mute: "#8A94A0", faint: "#B8B5AC", line: "#E2E0DA",
  panel: "#F4F2EC", accent: "#E8600A", navy: "#1B3A5C", green: "#0D7A3F", red: "#B3261E", violet: "#7C3AED",
};
const BELIEFS = [0, 10, 25, 50, 75, 90, 100];

interface PlanJob { id: string; tag: string | null; cust: string | null; fam: string | null; val: number; tp: number; tpv: number; tdd: string | null }
interface Entry { job_id: string; comment: string | null; belief_pct: number; best_estimate: string | null }
interface Totals { nos: number; value: number; throughput: number }
interface Payload {
  installed: boolean; today?: string;
  window: { from: string; end: string; key: string; label: string };
  jobs: PlanJob[]; done: Totals; doneFy: Totals;
  entries: Entry[];
  signoff: { signed_at: string; jobs: number; value: number; throughput: number; realistic_jobs: number | null; realistic_value: number | null; realistic_throughput: number | null; emailed: string | null } | null;
}
const tpOf = (j: { tp: number; tpv: number }) => (Number(j.tpv) || 0) > 0 ? Number(j.tpv) : Number(j.tp) || 0;

export default function MonthQuarterPlan({ V }: { V: (rupees: number) => string }) {
  const [kind, setKind] = useState<"mtd" | "qtd">("mtd");
  const [d, setD] = useState<Payload | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [signed, setSigned] = useState<{ plan: Totals & { jobs?: number }; realistic: { jobs: number; value: number; throughput: number }; mailed: string } | null>(null);
  // local edits, saved per row with a small debounce
  const [rows, setRows] = useState<Record<string, { comment: string; belief: number; est: string }>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const load = useCallback(() => {
    setD(null); setSigned(null);
    api.get(`/api/month-plan?kind=${kind}`).then((r: Payload) => {
      setD(r);
      const map: Record<string, { comment: string; belief: number; est: string }> = {};
      const eBy = new Map((r.entries || []).map((e) => [e.job_id, e]));
      for (const j of r.jobs || []) {
        const e = eBy.get(j.id);
        map[j.id] = {
          comment: String(e?.comment ?? ""),
          belief: e ? Number(e.belief_pct) : 100,
          est: String(e?.best_estimate || j.tdd || ""),
        };
      }
      setRows(map);
    }).catch((e) => setMsg(e instanceof Error ? e.message : String(e)));
  }, [kind]);
  useEffect(() => { load(); }, [load]);

  const saveRow = (jobId: string, next: { comment: string; belief: number; est: string }) => {
    setRows((r) => ({ ...r, [jobId]: next }));
    if (timers.current[jobId]) clearTimeout(timers.current[jobId]);
    timers.current[jobId] = setTimeout(() => {
      api.post("/api/month-plan", { action: "entry", job_id: jobId, comment: next.comment, belief_pct: next.belief, best_estimate: next.est })
        .catch((e) => setMsg(e instanceof Error ? e.message : String(e)));
    }, 600);
  };

  const totals = useMemo(() => {
    const t = { jobs: 0, value: 0, throughput: 0 };
    for (const j of d?.jobs || []) { t.jobs++; t.value += j.val; t.throughput += tpOf(j); }
    return t;
  }, [d]);

  const sign = async () => {
    if (!d) return;
    if (!window.confirm(`This is my Plan for the ${d.window.label} — ${totals.jobs} jobs more, worth ${V(totals.value)} with ${V(totals.throughput)} throughput.\n\nIs this your final Plan?`)) return;
    setBusy(true); setMsg("");
    try {
      const r = await api.post("/api/month-plan", { action: "sign", kind });
      setSigned({ plan: r.plan, realistic: r.realistic, mailed: String(r.mailed || "") });
      setMsg("Signed ✓");
      load();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };

  if (!d) return <div className="p-6 text-sm" style={{ color: C.mute }}>{msg || "Laying the plan table…"}</div>;
  if (!d.installed) return (
    <div className="p-6">
      <div className="rounded p-3 text-sm" style={{ background: "#FFF7E6", border: "1px solid #F0D9A8", color: "#8A5A00" }}>
        Run <code>supabase/migrations/0103_month_plan.sql</code> and the plan desk opens.
      </div>
    </div>
  );

  const so = d.signoff;
  return (
    <div className="p-4" style={{ maxWidth: 1200 }}>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <div>
          <div className="text-xs font-bold" style={{ color: C.mute, letterSpacing: 1.4 }}>THE BELIEVABLE PLAN</div>
          <div className="text-lg font-bold" style={{ color: C.ink, lineHeight: 1.2 }}>Month &amp; Quarter Plan</div>
        </div>
        <div className="flex gap-1 ml-2">
          {(["mtd", "qtd"] as const).map((k) => (
            <button key={k} onClick={() => setKind(k)} className="rounded-full border px-3 py-1 text-xs font-bold"
              style={kind === k ? { background: "#22303C", color: "#fff", borderColor: "#22303C" } : { color: C.mute, borderColor: C.line, background: "#fff" }}>
              {k === "mtd" ? "Months Plan" : "Quarter Plan"}
            </button>
          ))}
        </div>
        <span className="text-xs" style={{ color: C.mute }}>{fmtFull(d.window.from)} → {fmtFull(d.window.end)} · {d.window.key}</span>
        <div className="flex-1" style={{ minWidth: 10 }} />
        {msg && <span className="text-xs font-bold" style={{ color: msg.includes("✓") ? C.green : C.red }}>{msg}</span>}
      </div>

      {/* DONE · MORE — the two honest halves */}
      <div className="flex gap-2 flex-wrap mb-3">
        <div className="rounded-lg border bg-white p-3" style={{ borderColor: C.line, borderTop: `3px solid ${C.green}`, flex: "1 1 260px" }}>
          <div className="text-xs font-bold" style={{ color: C.mute, letterSpacing: 1.1 }}>DONE · {d.window.label} SO FAR</div>
          <div className="tnum mt-1" style={{ fontSize: 18, fontWeight: 800, color: C.ink }}>
            {d.done.nos} nos <span style={{ color: C.accent }}>· {V(d.done.value)}</span> <span style={{ color: C.green }}>· {V(d.done.throughput)}</span>
          </div>
          <div className="text-xs mt-0.5" style={{ color: C.mute }}>YTD: {d.doneFy.nos} nos · {V(d.doneFy.value)} · {V(d.doneFy.throughput)}</div>
        </div>
        <div className="rounded-lg border bg-white p-3" style={{ borderColor: C.line, borderTop: `3px solid ${C.navy}`, flex: "1 1 260px" }}>
          <div className="text-xs font-bold" style={{ color: C.mute, letterSpacing: 1.1 }}>MORE · DUE BY {fmtFull(d.window.end)}</div>
          <div className="tnum mt-1" style={{ fontSize: 18, fontWeight: 800, color: C.ink }}>
            {totals.jobs} jobs <span style={{ color: C.accent }}>· {V(totals.value)}</span> <span style={{ color: C.green }}>· {V(totals.throughput)}</span>
          </div>
          <div className="text-xs mt-0.5" style={{ color: C.mute }}>on the target delivery dates the board carries · overdue included</div>
        </div>
      </div>

      {/* the REALISTIC plan — shown only after a signature stands */}
      {(so || signed) && (
        <div className="rounded-lg border p-3 mb-3" style={{ borderColor: "#D9CFF2", background: "#FBFAFE", borderLeft: `4px solid ${C.violet}` }}>
          <div className="text-xs font-bold" style={{ color: C.violet, letterSpacing: 1.1 }}>
            THE REALISTIC PLAN — my dates, my belief{so?.signed_at ? ` · signed ${new Date(so.signed_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} IST` : ""}
          </div>
          <div className="tnum mt-1" style={{ fontSize: 20, fontWeight: 800, color: C.ink }}>
            {(signed?.realistic.jobs ?? so?.realistic_jobs ?? 0)} jobs at ≥50% belief
            <span style={{ color: C.accent }}> · {V(signed?.realistic.value ?? Number(so?.realistic_value) ?? 0)}</span>
            <span style={{ color: C.green }}> · {V(signed?.realistic.throughput ?? Number(so?.realistic_throughput) ?? 0)}</span>
          </div>
          <div className="text-xs mt-0.5" style={{ color: C.sub }}>
            money weighted by belief, membership by my best-estimate dates
            {(signed?.mailed || so?.emailed) && <> · 📧 {signed?.mailed || so?.emailed}</>}
          </div>
        </div>
      )}

      {/* the job-by-job working */}
      <div className="rounded-lg border bg-white overflow-x-auto mb-3" style={{ borderColor: C.line }}>
        <table className="w-full text-xs" style={{ borderCollapse: "collapse", minWidth: 980 }}>
          <thead>
            <tr style={{ background: "#22303C", color: "#fff" }}>
              <th className="px-2 py-2 text-left">Job</th>
              <th className="px-2 py-2 text-left">Customer</th>
              <th className="px-2 py-2 text-right">Value</th>
              <th className="px-2 py-2 text-right">TP</th>
              <th className="px-2 py-2 text-center">TDD</th>
              <th className="px-2 py-2 text-center">My best estimate</th>
              <th className="px-2 py-2 text-center">My belief</th>
              <th className="px-2 py-2 text-left">My comments</th>
            </tr>
          </thead>
          <tbody>
            {(d.jobs || []).map((j) => {
              const r = rows[j.id] || { comment: "", belief: 100, est: j.tdd || "" };
              const late = j.tdd && d.today && j.tdd < d.today;
              return (
                <tr key={j.id} style={{ borderTop: `1px solid #EFEDE7`, background: r.belief === 0 ? "#FBEDEA" : undefined }}>
                  <td className="px-2 py-1.5 whitespace-nowrap"><b className="tnum" style={{ color: C.navy }}>{jobNo(j.id)}</b> <span style={{ color: C.sub }}>{j.tag || ""}</span></td>
                  <td className="px-2 py-1.5" style={{ color: C.sub, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={j.cust || ""}>{j.cust || "—"}</td>
                  <td className="px-2 py-1.5 text-right tnum">{V(j.val)}</td>
                  <td className="px-2 py-1.5 text-right tnum" style={{ color: C.green }}>{V(tpOf(j))}</td>
                  <td className="px-2 py-1.5 text-center tnum font-bold" style={{ color: late ? C.red : C.ink }} title={late ? "already past — still counted in the window" : ""}>{fmt(j.tdd)}</td>
                  <td className="px-2 py-1.5 text-center">
                    <input type="date" value={r.est} onChange={(e) => saveRow(j.id, { ...r, est: e.target.value })}
                      className="text-xs border rounded px-1 py-0.5 tnum" style={{ borderColor: r.est && j.tdd && r.est !== j.tdd ? C.violet : C.line }} />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <select value={r.belief} onChange={(e) => saveRow(j.id, { ...r, belief: Number(e.target.value) })}
                      className="text-xs border rounded px-1 py-0.5 font-bold"
                      style={{ borderColor: C.line, color: r.belief >= 75 ? C.green : r.belief >= 50 ? "#D97706" : C.red, background: "#fff" }}>
                      {BELIEFS.map((b) => <option key={b} value={b}>{b}%</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <input value={r.comment} onChange={(e) => saveRow(j.id, { ...r, comment: e.target.value })}
                      placeholder="why I believe it — or don't"
                      className="w-full text-xs border rounded px-2 py-1" style={{ borderColor: C.line, minWidth: 200 }} />
                  </td>
                </tr>
              );
            })}
            {(d.jobs || []).length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center" style={{ color: C.mute }}>No jobs carry a target date inside this window.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* the signature */}
      <div className="rounded-lg border bg-white p-3 flex items-center gap-3 flex-wrap" style={{ borderColor: C.line }}>
        <div className="text-sm" style={{ color: C.ink }}>
          <b>{totals.jobs} jobs more</b> worth <b style={{ color: C.accent }}>{V(totals.value)}</b> and with <b style={{ color: C.green }}>{V(totals.throughput)}</b> throughput
          <span className="text-xs" style={{ color: C.mute }}> · {d.window.label} ({d.window.key}) · YTD so far {d.doneFy.nos} nos, {V(d.doneFy.value)}</span>
        </div>
        <div className="flex-1" style={{ minWidth: 10 }} />
        <button onClick={() => void sign()} disabled={busy}
          className="rounded px-4 py-2 text-sm font-bold text-white" style={{ background: busy ? "#B9BEC4" : C.violet }}>
          {busy ? "Signing…" : `✍ This is my Plan for the ${d.window.label}`}
        </button>
      </div>
      <div className="text-xs mt-2" style={{ color: C.faint }}>
        Signing freezes the plan and mails it to you, cc {`stratcom@nandan.co.in`} — the realistic, belief-weighted read appears only after the signature.
      </div>
    </div>
  );
}
