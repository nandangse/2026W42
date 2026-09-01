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

interface PlanJob { id: string; tag: string | null; cust: string | null; fam: string | null; val: number; tp: number; tpv: number; tdd: string | null; kit: number; pct: number; pod: number | null; stat: string | null; own: string | null; proj: string | null; otd: string | null }
interface Entry { job_id: string; comment: string | null; belief_pct: number; best_estimate: string | null }
interface Totals { nos: number; value: number; throughput: number }
interface Payload {
  installed: boolean; today?: string;
  window: { from: string; end: string; key: string; label: string };
  jobs: PlanJob[]; done: Totals; doneFy: Totals;
  entries: Entry[];
  signoff: { signed_at: string; jobs: number; value: number; throughput: number; realistic_jobs: number | null; realistic_value: number | null; realistic_throughput: number | null; emailed: string | null; is_draft?: boolean } | null;
  /** Everyone's latest word on this period — draft or signature. */
  room?: { by_email: string; is_draft: boolean; signed_at: string; jobs: number; value: number; throughput: number }[];
}
const tpOf = (j: { tp: number; tpv: number }) => (Number(j.tpv) || 0) > 0 ? Number(j.tpv) : Number(j.tp) || 0;

/**
 * THE JOB BOX (Dr Raghu, 1 Sep 2026: "Above the mouseover of the jobs show
 * the same box as normal! In that also we can change it").
 *
 * The same facts the boards show about a job, opened from the plan without
 * leaving it — and the two numbers a delivery belief actually rests on,
 * kitting and production, editable right here. Believing a date is one
 * judgement; believing it beside a job that is 20% kitted is another, and
 * this is where a planner corrects whichever of the two is wrong.
 *
 * It writes through /api/job-field, the same door the boards use, so an edit
 * made here is queued for the ERP exactly as an edit made anywhere else.
 */
function JobBox({ job, V, onClose, onSaved }: {
  job: PlanJob; V: (n: number) => string; onClose: () => void; onSaved: () => void;
}) {
  const [kit, setKit] = useState(String(job.kit ?? 0));
  const [pct, setPct] = useState(String(job.pct ?? 0));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");

  const dirty = String(job.kit ?? 0) !== kit || String(job.pct ?? 0) !== pct;

  const save = async () => {
    setBusy(true); setErr(""); setDone("");
    try {
      if (String(job.kit ?? 0) !== kit)
        await api.post("/api/job-field", { job_id: job.id, field: "kit", value: Number(kit) || 0 });
      if (String(job.pct ?? 0) !== pct)
        await api.post("/api/job-field", { job_id: job.id, field: "pct", value: Number(pct) || 0 });
      setDone("Saved — and queued for the ERP.");
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div className="flex justify-between gap-3 py-1" style={{ borderBottom: "1px solid #F1EFE9" }}>
      <span className="text-xs" style={{ color: C.mute }}>{k}</span>
      <span className="text-xs font-semibold text-right" style={{ color: C.ink }}>{v}</span>
    </div>
  );

  return (
    <div onClick={onClose} className="fixed inset-0 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)", zIndex: 80 }}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg w-full"
        style={{ maxWidth: 460, maxHeight: "90vh", overflow: "auto" }}>
        <div className="flex items-start justify-between px-4 py-2.5" style={{ background: C.navy, borderRadius: "6px 6px 0 0" }}>
          <div>
            <div className="text-white font-bold text-sm">{jobNo(job.id)} · {job.tag || ""}</div>
            <div className="text-xs" style={{ color: "#B9C7D6" }}>{job.cust || "—"}</div>
          </div>
          <button onClick={onClose} className="text-white font-bold px-2">✕</button>
        </div>
        <div className="p-4">
          <Row k="Project" v={job.proj || "—"} />
          <Row k="Product family" v={job.fam || "—"} />
          <Row k="Status" v={job.stat || "—"} />
          <Row k="Planning owner" v={(job.own || "—").split("@")[0]} />
          <Row k="Value" v={V(job.val)} />
          <Row k="Throughput" v={<span style={{ color: C.green }}>{V(tpOf(job))}</span>} />
          <Row k="Amount receivable on delivery" v={job.pod == null ? <span style={{ color: C.faint }}>not recorded</span> : <b style={{ color: C.navy }}>{V(job.pod)}</b>} />
          <Row k="Target delivery" v={<span className="tnum">{fmtFull(job.tdd)}</span>} />
          <Row k="Customer commitment (OTD)" v={<span className="tnum">{fmtFull(job.otd)}</span>} />

          <div className="mt-3 rounded p-3" style={{ background: "#F7F6F2", border: `1px solid ${C.line}` }}>
            <div className="text-xs font-bold mb-2" style={{ color: C.ink }}>
              What the date rests on — change either and it saves to the job
            </div>
            <div className="flex gap-4 flex-wrap items-end">
              <label className="text-xs font-bold" style={{ color: C.sub }}>
                Kitting %
                <input value={kit} inputMode="numeric"
                  onChange={(e) => setKit(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
                  className="block w-20 text-center rounded border px-2 py-1 text-sm font-bold mt-0.5"
                  style={{ borderColor: C.line, color: C.ink }} />
              </label>
              <label className="text-xs font-bold" style={{ color: C.sub }}>
                Production %
                <input value={pct} inputMode="numeric"
                  onChange={(e) => setPct(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
                  className="block w-20 text-center rounded border px-2 py-1 text-sm font-bold mt-0.5"
                  style={{ borderColor: C.line, color: C.ink }} />
              </label>
              <button onClick={() => void save()} disabled={busy || !dirty}
                className="rounded px-3 py-1.5 text-xs font-bold text-white"
                style={{ background: busy || !dirty ? "#B9BEC4" : C.green }}>
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
            {err && <div className="text-xs font-bold mt-1" style={{ color: C.red }}>{err}</div>}
            {done && <div className="text-xs font-bold mt-1" style={{ color: C.green }}>{done}</div>}
            <div className="text-xs mt-2" style={{ color: C.mute, lineHeight: 1.6 }}>
              Both are the ERP&apos;s own numbers, so a correction here is queued for it like any other —
              it does not stay a private Genie opinion.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MonthQuarterPlan({ V }: { V: (rupees: number) => string }) {
  const [kind, setKind] = useState<"mtd" | "qtd">("mtd");
  const [d, setD] = useState<Payload | null>(null);
  /** The job whose box is open — the same facts the boards show, editable. */
  const [openJob, setOpenJob] = useState<PlanJob | null>(null);
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

  /**
   * SAVE AS DRAFT / SIGN (Dr Raghu, 1 Sep 2026: "keep a button for Save as
   * draft, and then the final one will only be once they are all ready").
   *
   * The beliefs themselves have always saved as they were typed; what the
   * draft adds is the difference between working and finished. Only the
   * signature asks twice, and only the signature mails — a draft is a person
   * saying "this is my read so far", which is nobody's business but the
   * room's.
   */
  const sign = async (draft = false) => {
    if (!d) return;
    if (!draft && !window.confirm(`This is my Plan for the ${d.window.label} — ${totals.jobs} jobs more, worth ${V(totals.value)} with ${V(totals.throughput)} throughput.\n\nIs this your final Plan?`)) return;
    setBusy(true); setMsg("");
    try {
      const r = await api.post("/api/month-plan", { action: draft ? "draft" : "sign", kind });
      if (!draft) setSigned({ plan: r.plan, realistic: r.realistic, mailed: String(r.mailed || "") });
      setMsg(draft ? "Draft saved ✓ — not mailed, and you can keep changing it" : "Signed ✓");
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
          {/* The cash the month collects if the plan holds — counted only
              where a job actually carries the figure, and it says how many
              do, because a total that quietly omits half the jobs is worse
              than no total (Dr Raghu, 1 Sep 2026). */}
          {(() => {
            const withPod = (d.jobs || []).filter((j) => j.pod != null);
            const sum = withPod.reduce((n, j) => n + (Number(j.pod) || 0), 0);
            return (
              <div className="text-xs mt-1" style={{ color: C.navy, fontWeight: 700 }}>
                {V(sum)} receivable on delivery
                <span style={{ color: C.mute, fontWeight: 400 }}>
                  {" "}· on {withPod.length} of {(d.jobs || []).length} job{(d.jobs || []).length === 1 ? "" : "s"} that carry the figure
                </span>
              </div>
            );
          })()}
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
      {/* FROZEN HEADING (Dr Raghu, 1 Sep 2026: "freeze the header in this as
          floating") — fifty jobs is a long scroll, and a plan being frozen
          today is read column by column. The box scrolls, the heading stays.
          separate borders, because a collapsed border does not travel with a
          sticky row and the heading would lose its edge on the way down. */}
      <div className="rounded-lg border bg-white mb-3" style={{ borderColor: C.line, overflow: "auto", maxHeight: "68vh" }}>
        <table className="w-full text-xs" style={{ borderCollapse: "separate", borderSpacing: 0, minWidth: 1100 }}>
          <thead>
            <tr style={{ background: "#22303C", color: "#fff", position: "sticky", top: 0, zIndex: 2 }}>
              <th className="px-2 py-2 text-left" style={{ position: "sticky", top: 0, background: "#22303C" }}>Job</th>
              <th className="px-2 py-2 text-left" style={{ position: "sticky", top: 0, background: "#22303C" }}>Customer</th>
              <th className="px-2 py-2 text-right" style={{ position: "sticky", top: 0, background: "#22303C" }}>Value</th>
              <th className="px-2 py-2 text-right" style={{ position: "sticky", top: 0, background: "#22303C" }}>TP</th>
              <th className="px-2 py-2 text-right" style={{ position: "sticky", top: 0, background: "#22303C" }} title="Falls due when this job is delivered — the cash the month actually brings in">Receivable</th>
              <th className="px-2 py-2 text-center" style={{ position: "sticky", top: 0, background: "#22303C" }}>TDD</th>
              <th className="px-2 py-2 text-center" style={{ position: "sticky", top: 0, background: "#22303C" }} title="Kitting — how much of the material is in">Kit %</th>
              <th className="px-2 py-2 text-center" style={{ position: "sticky", top: 0, background: "#22303C" }} title="Production completion">Prod %</th>
              <th className="px-2 py-2 text-center" style={{ position: "sticky", top: 0, background: "#22303C" }}>My best estimate</th>
              <th className="px-2 py-2 text-center" style={{ position: "sticky", top: 0, background: "#22303C" }}>My belief</th>
              <th className="px-2 py-2 text-left" style={{ position: "sticky", top: 0, background: "#22303C" }}>My comments</th>
            </tr>
          </thead>
          <tbody>
            {(d.jobs || []).map((j) => {
              const r = rows[j.id] || { comment: "", belief: 100, est: j.tdd || "" };
              const late = j.tdd && d.today && j.tdd < d.today;
              return (
                <tr key={j.id} style={{ background: r.belief === 0 ? "#FBEDEA" : undefined, boxShadow: "inset 0 1px 0 #EFEDE7" }}>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <button onClick={() => setOpenJob(j)} className="text-left"
                      title={`${jobNo(j.id)} · ${j.tag || ""}\n${j.cust || ""}\n\nStatus: ${j.stat || "—"}\nKitting ${j.kit}% · Production ${j.pct}%\nTDD ${fmtFull(j.tdd)} · OTD ${fmtFull(j.otd)}\n\nClick to open — kitting and production can be changed there.`}>
                      <b className="tnum" style={{ color: C.navy, textDecoration: "underline", textUnderlineOffset: 2 }}>{jobNo(j.id)}</b>{" "}
                      <span style={{ color: C.sub }}>{j.tag || ""}</span>
                    </button>
                  </td>
                  <td className="px-2 py-1.5" style={{ color: C.sub, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={j.cust || ""}>{j.cust || "—"}</td>
                  <td className="px-2 py-1.5 text-right tnum">{V(j.val)}</td>
                  <td className="px-2 py-1.5 text-right tnum" style={{ color: C.green }}>{V(tpOf(j))}</td>
                  {/* AMOUNT RECEIVABLE (Dr Raghu, 1 Sep 2026) — what the
                      delivery actually collects. A plan of jobs is a plan of
                      cash, and the two are not the same number. */}
                  <td className="px-2 py-1.5 text-right tnum"
                    style={{ color: j.pod == null ? C.faint : C.navy, fontWeight: j.pod ? 700 : 400 }}
                    title={j.pod == null ? "Not recorded on the job" : "Falls due when this job is delivered"}>
                    {j.pod == null ? "—" : V(j.pod)}
                  </td>
                  <td className="px-2 py-1.5 text-center tnum font-bold" style={{ color: late ? C.red : C.ink }} title={late ? "already past — still counted in the window" : ""}>{fmt(j.tdd)}</td>
                  {/* Kitting and production (Dr Raghu, 1 Sep 2026). Believing
                      a date is easier than believing it beside a job that is
                      20% kitted, which is the point of putting them here. */}
                  <td className="px-2 py-1.5 text-center tnum font-bold"
                    style={{ color: j.kit >= 90 ? C.green : j.kit >= 50 ? "#D97706" : C.red }}>{j.kit}%</td>
                  <td className="px-2 py-1.5 text-center tnum font-bold"
                    style={{ color: j.pct >= 90 ? C.green : j.pct >= 50 ? "#D97706" : C.red }}>{j.pct}%</td>
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
              <tr><td colSpan={11} className="px-3 py-6 text-center" style={{ color: C.mute }}>No jobs carry a target date inside this window.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {openJob && (
        <JobBox job={openJob} V={V} onClose={() => setOpenJob(null)} onSaved={() => { setOpenJob(null); void load(); }} />
      )}

      {/* WHO IS READY (Dr Raghu, 1 Sep 2026: "the final one will only be
          once they are all ready for it"). Waiting for people is only
          possible if you can see who you are waiting for. */}
      {(d.room || []).length > 0 && (
        <div className="rounded-lg border bg-white p-3 mb-2" style={{ borderColor: C.line }}>
          <div className="text-xs font-bold mb-1.5" style={{ color: C.mute, letterSpacing: 1.1 }}>
            THE ROOM · {d.window.label} ({d.window.key})
          </div>
          <div className="flex gap-2 flex-wrap">
            {(d.room || [])
              .slice()
              .sort((a, b) => Number(a.is_draft) - Number(b.is_draft) || String(a.by_email).localeCompare(String(b.by_email)))
              .map((r) => (
                <span key={r.by_email} className="rounded px-2 py-1 text-xs"
                  style={{
                    background: r.is_draft ? "#F4F2EC" : "#E8F3EC",
                    border: `1px solid ${r.is_draft ? C.line : "#B7DFC8"}`,
                    color: r.is_draft ? C.sub : C.green,
                  }}
                  title={`${r.jobs} jobs · ${V(Number(r.value) || 0)} · ${new Date(r.signed_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`}>
                  {r.is_draft ? "✎" : "✍"} <b>{String(r.by_email).split("@")[0]}</b>
                  <span style={{ color: C.mute }}> · {r.is_draft ? "draft" : "signed"}</span>
                </span>
              ))}
          </div>
          <div className="text-xs mt-1.5" style={{ color: C.faint }}>
            {(d.room || []).filter((r) => !r.is_draft).length} signed ·{" "}
            {(d.room || []).filter((r) => r.is_draft).length} still in draft — hover a name for their numbers.
          </div>
        </div>
      )}

      {/* the signature */}
      <div className="rounded-lg border bg-white p-3 flex items-center gap-3 flex-wrap" style={{ borderColor: C.line }}>
        <div className="text-sm" style={{ color: C.ink }}>
          <b>{totals.jobs} jobs more</b> worth <b style={{ color: C.accent }}>{V(totals.value)}</b> and with <b style={{ color: C.green }}>{V(totals.throughput)}</b> throughput
          <span className="text-xs" style={{ color: C.mute }}> · {d.window.label} ({d.window.key}) · YTD so far {d.doneFy.nos} nos, {V(d.doneFy.value)}</span>
        </div>
        <div className="flex-1" style={{ minWidth: 10 }} />
        <button onClick={() => void sign(true)} disabled={busy}
          className="rounded px-4 py-2 text-sm font-bold border"
          style={{ borderColor: C.navy, color: C.navy, background: "#fff" }}
          title="Keep your read without finishing it — nothing is mailed, and you can change it as often as you like">
          {busy ? "Saving…" : "💾 Save as draft"}
        </button>
        <button onClick={() => void sign(false)} disabled={busy}
          className="rounded px-4 py-2 text-sm font-bold text-white" style={{ background: busy ? "#B9BEC4" : C.violet }}>
          {busy ? "Signing…" : `✍ This is my Plan for the ${d.window.label}`}
        </button>
      </div>
      <div className="text-xs mt-2" style={{ color: C.faint }}>
        <b>Save as draft</b> keeps your read and mails nothing — change it as often as you like.
        <b> Signing</b> freezes the plan and mails it to you, cc {`stratcom@nandan.co.in`}; the realistic,
        belief-weighted read appears only after the signature.
      </div>
      <div className="text-xs mt-1" style={{ color: C.faint }}>
        Every belief is already saved the moment it is typed — the buttons are about what it MEANS, not whether it is kept.
      </div>
    </div>
  );
}
