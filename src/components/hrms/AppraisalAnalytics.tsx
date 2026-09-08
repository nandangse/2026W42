"use client";
/**
 * Appraisal Summary Data Analytics — the CHRO's wall.
 *
 * Everything here is computed live from the same rows the Appraisal Table
 * shows; nothing is typed in. Where a decision is Final it uses the decided
 * gross; where only the manager has spoken it uses the manager's proposal
 * and says so — indicative, never presented as settled money.
 *
 * The PIP list is a SCREEN, not a verdict: it names the people whose
 * manager scores and increments both came out at the bottom, so the
 * conversation happens on purpose instead of by accident.
 */
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Pane } from "./Pane";
import { C } from "./RecordFields";
import { inr } from "@/lib/fmt";

interface Row {
  id: string; name: string; department: string | null; designation: string | null; type: string | null;
  age: number | null; exp: number | null;
  prevGross: number | null; newGross: number | null; inc: number | null; incPct: number | null;
  stage: string; selfAvg: number | null; mgrAvg: number | null; askGross: number | null; mgrProposed: number | null;
}


const lakh = (n: number) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(2)} L` : `₹${inr(n)}`);
const pct = (n: number | null | undefined, sign = true) => (n == null ? "—" : `${sign && n > 0 ? "+" : ""}${n.toFixed(1)}%`);

/** decided money first; the manager's proposal as the indicative fallback */
function eff(r: Row): { gross: number | null; pct: number | null; indicative: boolean } {
  if (r.newGross != null) return { gross: r.newGross, pct: r.incPct, indicative: false };
  if (r.mgrProposed != null && r.prevGross) {
    return { gross: r.mgrProposed, pct: Math.round(((r.mgrProposed - r.prevGross) / r.prevGross) * 1000) / 10, indicative: true };
  }
  return { gross: null, pct: null, indicative: false };
}

export default function AppraisalAnalytics({ who, onOpenPerson }: { who: string; onOpenPerson: (id: string) => void }) {
  const [rawRows, setRows] = useState<Row[] | null>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    api.get("/api/hrms/idp?table=1").then((j) => setRows(j.rows || []))
      .catch((e) => { setMsg(e instanceof Error ? e.message : String(e)); setRows([]); });
  }, []);

  /**
   * "have a drop down... show the types of the employees. I will of course
   * keep management off" (Dr Raghu, 4 Sep 2026). Every number on the wall is
   * computed from the ticked types only; all are ticked to begin with.
   */
  const allTypes = useMemo(() => [...new Set((rawRows || []).map((r) => r.type || "(no type)"))].sort(), [rawRows]);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [typesOpen, setTypesOpen] = useState(false);
  const rows = useMemo(() => rawRows === null ? null : rawRows.filter((r) => !off.has(r.type || "(no type)")), [rawRows, off]);
  const typeCount = (t: string) => (rawRows || []).filter((r) => (r.type || "(no type)") === t).length;
  const typeLabel = off.size === 0 ? "All employee types" : `${allTypes.length - off.size} of ${allTypes.length} types`;

  const P = ({ r, bold }: { r: Row; bold?: boolean }) => (
    <a href={`/hrms#appraisal.card:${encodeURIComponent(r.id)}`} target="_blank" rel="noopener noreferrer" className={`text-left ${bold ? "font-bold" : "font-semibold"}`}
      style={{ color: "var(--blue)", textDecoration: "underline", textUnderlineOffset: 2 }} title={`${r.id} · open the appraisal discussion in a new tab`}>
      {r.name}
    </a>
  );

  const S = useMemo(() => {
    const all = rows || [];
    const decided = all.filter((r) => r.newGross != null && r.prevGross != null);
    const spoken = all.map((r) => ({ r, e: eff(r) })).filter((x) => x.e.pct != null && x.r.prevGross != null);
    const payNow = all.reduce((a, r) => a + (r.prevGross || 0), 0);
    const payNew = all.reduce((a, r) => a + (eff(r).gross ?? r.prevGross ?? 0), 0);
    const pcts = spoken.map((x) => x.e.pct as number);
    const mean = pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : 0;
    const sd = pcts.length > 1 ? Math.sqrt(pcts.reduce((a, b) => a + (b - mean) ** 2, 0) / (pcts.length - 1)) : 0;
    const median = pcts.length ? [...pcts].sort((a, b) => a - b)[Math.floor(pcts.length / 2)] : 0;
    /**
     * THE SAME CURVE IN RUPEES (Dr Raghu, 7 Sep 2026: "show bell curve on the
     * % as well as the absolute").
     *
     * A percentage and an amount are two different pictures of one decision,
     * and they disagree in a way worth seeing: 18% to a man on 15,000 is
     * 2,700, and 18% to a man on 1,50,000 is 27,000. The percentage curve
     * says whether people were rated; the rupee curve says what it costs and
     * who actually gained.
     */
    /**
     * THE CURVES LEAVE MANAGEMENT OUT (Dr Raghu, 8 Sep 2026: "mention the
     * curve without the management. the management is skewing the chart").
     *
     * He is right, and the rupee curve showed it plainly: 198 people in the
     * first bucket and a single line out at 2.5 lakh, which is not a
     * distribution, it is one man and everybody else. Three managing salaries
     * among two hundred set the scale for all of them and the shape of the
     * other 199 disappeared.
     *
     * They are left out of the CURVES only. Every total, every department
     * figure and the pay bill itself still count everybody — what is being
     * asked here is whether people were really rated against one another, and
     * for that question the board is not a comparable population.
     */
    const rated = spoken.filter((x) => !/^management$/i.test(String(x.r.type || "").trim()));
    const mgmt = spoken.length - rated.length;
    const cPcts = rated.map((x) => x.e.pct as number);
    const cMean = cPcts.length ? cPcts.reduce((a, b) => a + b, 0) / cPcts.length : 0;
    const cSd = cPcts.length > 1 ? Math.sqrt(cPcts.reduce((a, b) => a + (b - cMean) ** 2, 0) / (cPcts.length - 1)) : 0;
    const amts = rated.map((x) => (x.e.gross ?? 0) - (x.r.prevGross ?? 0)).filter((v) => Number.isFinite(v));
    const aMean = amts.length ? amts.reduce((a, b) => a + b, 0) / amts.length : 0;
    const aSd = amts.length > 1 ? Math.sqrt(amts.reduce((a, b) => a + (b - aMean) ** 2, 0) / (amts.length - 1)) : 0;
    return { all, decided, spoken, payNow, payNew, pcts, mean, sd, median, amts, aMean, aSd, cPcts, cMean, cSd, mgmt };
  }, [rows]);

  const depts = useMemo(() => {
    const m = new Map<string, { n: number; now: number; next: number; rated: number[]; pcts: number[] }>();
    for (const r of S.all) {
      const k = r.department || "(no department)";
      if (!m.has(k)) m.set(k, { n: 0, now: 0, next: 0, rated: [], pcts: [] });
      const d = m.get(k)!;
      d.n++; d.now += r.prevGross || 0;
      const e = eff(r);
      d.next += e.gross ?? r.prevGross ?? 0;
      if (e.pct != null) d.pcts.push(e.pct);
      if (r.mgrAvg != null) d.rated.push(r.mgrAvg);
    }
    return [...m.entries()].map(([k, d]) => ({
      dept: k, n: d.n, now: d.now, next: d.next, cost: d.next - d.now,
      avgPct: d.pcts.length ? d.pcts.reduce((a, b) => a + b, 0) / d.pcts.length : null,
      avgRating: d.rated.length ? d.rated.reduce((a, b) => a + b, 0) / d.rated.length : null,
    })).sort((a, b) => b.cost - a.cost);
  }, [S]);

  const pip = useMemo(() => S.all
    .filter((r) => r.mgrAvg != null && (r.mgrAvg <= 4 || (r.mgrAvg <= 5 && (eff(r).pct ?? 99) <= 2)))
    .sort((a, b) => (a.mgrAvg ?? 9) - (b.mgrAvg ?? 9)), [S]);

  const gaps = useMemo(() => S.all
    .filter((r) => r.selfAvg != null && r.mgrAvg != null)
    .map((r) => ({ r, gap: (r.selfAvg as number) - (r.mgrAvg as number) }))
    .sort((a, b) => b.gap - a.gap), [S]);

  const asks = useMemo(() => S.all
    .filter((r) => r.askGross != null && r.prevGross)
    .map((r) => {
      const e = eff(r);
      return { r, askPct: ((r.askGross as number) - (r.prevGross as number)) / (r.prevGross as number) * 100, gotPct: e.pct, indicative: e.indicative };
    })
    .sort((a, b) => (b.askPct - (b.gotPct ?? 0)) - (a.askPct - (a.gotPct ?? 0))), [S]);

  const bands = useMemo(() => {
    const B: [string, (r: Row) => boolean][] = [
      ["< 2 yrs", (r) => (r.exp ?? -1) >= 0 && (r.exp as number) < 2],
      ["2 – 5 yrs", (r) => (r.exp ?? -1) >= 2 && (r.exp as number) < 5],
      ["5 – 10 yrs", (r) => (r.exp ?? -1) >= 5 && (r.exp as number) < 10],
      ["10 – 20 yrs", (r) => (r.exp ?? -1) >= 10 && (r.exp as number) < 20],
      ["20+ yrs", (r) => (r.exp ?? -1) >= 20],
    ];
    return B.map(([l, f]) => {
      const g = S.all.filter(f);
      const p = g.map((r) => eff(r).pct).filter((x): x is number => x != null);
      return { band: l, n: g.length, avg: p.length ? p.reduce((a, b) => a + b, 0) / p.length : null };
    });
  }, [S]);

  const indicativeN = S.spoken.filter((x) => x.e.indicative).length;

  return (
    <Pane title="Appraisal Summary Data Analytics" who={who} print
      blurb="The whole cycle on one wall: the money, the curve, the departments, the outliers — and the conversations that must not be skipped. Every name opens the Report Card.">
      {msg && <div className="text-xs font-semibold mb-2" style={{ color: C.red }}>{msg}</div>}
      {rows === null && <div className="text-sm py-6 text-center" style={{ color: C.faint }}>reading the cycle…</div>}
      {rows !== null && (
        <>
          {/* ── who is on the wall ── */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <div style={{ position: "relative" }}>
              <button onClick={() => setTypesOpen((v) => !v)} className="text-xs font-semibold rounded border px-2.5 py-1.5 bg-white"
                style={{ borderColor: off.size ? C.orange ?? "var(--accent)" : C.line, color: "var(--blue)" }} title="Tick the employee types the wall should count">
                👥 {typeLabel} {typesOpen ? "▴" : "▾"}
              </button>
              {typesOpen && (
                <div className="rounded border bg-white shadow-lg p-2" style={{ position: "absolute", top: "110%", left: 0, zIndex: 30, minWidth: 240, borderColor: C.line }}>
                  {allTypes.map((t) => (
                    <label key={t} className="flex items-center gap-2 text-xs py-1 px-1 rounded" style={{ cursor: "pointer" }}>
                      <input type="checkbox" checked={!off.has(t)} style={{ accentColor: "var(--blue)" }}
                        onChange={(e) => setOff((o) => { const n = new Set(o); if (e.target.checked) n.delete(t); else n.add(t); return n; })} />
                      <span className="flex-1" style={{ color: off.has(t) ? C.faint : "var(--navy)" }}>{t}</span>
                      <span className="tnum" style={{ color: C.faint }}>{typeCount(t)}</span>
                    </label>
                  ))}
                  <div className="flex gap-2 mt-1 pt-1" style={{ borderTop: `1px solid ${C.line}` }}>
                    <button onClick={() => setOff(new Set())} className="text-xs font-semibold" style={{ color: "var(--blue)" }}>All</button>
                    <button onClick={() => setOff(new Set(allTypes))} className="text-xs font-semibold" style={{ color: C.faint }}>None</button>
                  </div>
                </div>
              )}
            </div>
            {off.size > 0 && <span className="text-xs" style={{ color: C.faint }}>leaving out {[...off].join(", ")}</span>}
          </div>

          {/* ── the money, first ── */}
          <div className="flex gap-2 flex-wrap mb-3">
            <Big n={String(S.all.length)} l="On the roll" />
            <Big n={String(S.spoken.length)} l="Increments on the table" sub={indicativeN ? `${indicativeN} still manager-indicative` : "all Final"} />
            <Big n={lakh(S.payNow)} l="Payroll today / month" />
            <Big n={lakh(S.payNew)} l="Payroll after / month" green />
            <Big n={lakh(S.payNew - S.payNow)} l="Increase / month" sub={`${pct(S.payNow ? (S.payNew - S.payNow) / S.payNow * 100 : 0)} of today's payroll`} green />
            <Big n={lakh((S.payNew - S.payNow) * 12)} l="Cost of the cycle / year" />
            <Big n={pct(S.mean)} l="Average increase" sub={`median ${pct(S.median)} · 2026 was +13.25%`} green />
          </div>

          <BellCurve values={S.cPcts} mean={S.cMean} sd={S.cSd} step={2.5} unit="pct"
            title="The bell curve — increase %, Management left out"
            note={`n=${S.cPcts.length}${S.mgmt ? ` (${S.mgmt} in Management left out)` : ""} · mean ${pct(S.cMean)} · spread ±${S.cSd.toFixed(1)}. A healthy curve has a middle and two honest tails — everyone bunched at one number means nobody was really rated.`} />
          <BellCurve values={S.amts} mean={S.aMean} sd={S.aSd} unit="inr"
            title="The bell curve — increase in rupees a month, Management left out"
            note={`n=${S.amts.length}${S.mgmt ? ` (${S.mgmt} in Management left out)` : ""} · mean ₹${inr(Math.round(S.aMean))} a month · spread ±₹${inr(Math.round(S.aSd))}. The same decision in money: a percentage treats a man on 15,000 and a man on 1,50,000 alike, and this does not. Three managing salaries set the scale for two hundred and the shape of the rest disappeared, so they stand outside the curve — the totals still count everybody.`} />

          {/* ── departments ── */}
          <Card title="Department wise" note="Decided money where Final; the manager's proposal where not — that part can still move.">
            <table className="w-full genie-table" style={{ fontSize: 12.5, borderCollapse: "collapse" }}>
              <thead><tr style={{ color: C.faint, fontSize: 11 }}>
                {["Department", "People", "Payroll now", "Payroll after", "Cost / month", "Avg increase", "Avg manager rating", ""].map((h, i) => (
                  <th key={h + i} className="text-left px-1.5 py-1" style={{ borderBottom: `1px solid ${C.line}`, textAlign: i > 1 ? "right" : "left" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {depts.map((d) => (
                  <tr key={d.dept} style={{ borderBottom: "1px solid #F2F0EA" }}>
                    <td className="px-1.5 py-1 font-semibold">{d.dept}</td>
                    <td className="px-1.5 py-1 text-right tnum">{d.n}</td>
                    <td className="px-1.5 py-1 text-right tnum">{lakh(d.now)}</td>
                    <td className="px-1.5 py-1 text-right tnum">{lakh(d.next)}</td>
                    <td className="px-1.5 py-1 text-right tnum font-semibold" style={{ color: d.cost > 0 ? C.green : C.faint }}>{d.cost ? lakh(d.cost) : "—"}</td>
                    <td className="px-1.5 py-1 text-right tnum font-semibold">{pct(d.avgPct)}</td>
                    <td className="px-1.5 py-1 text-right tnum">{d.avgRating != null ? `${d.avgRating.toFixed(1)} / 10` : "—"}</td>
                    <td className="px-1.5 py-1" style={{ width: 130 }}>
                      {d.avgPct != null && <div style={{ height: 7, background: "#F2F0EA", borderRadius: 4 }}>
                        <div style={{ height: 7, width: `${Math.min(100, Math.max(2, d.avgPct * 4))}%`, background: "var(--green)", borderRadius: 4 }} />
                      </div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* ── leaderboards ── */}
          <div className="grid gap-3 mb-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))" }}>
            <Board title="Top increase (%)" rows={S.spoken.filter((x) => x.e.pct != null).sort((a, b) => (b.e.pct as number) - (a.e.pct as number)).slice(0, 8)}
              right={(x) => <b style={{ color: C.green }}>{pct(x.e.pct)}{x.e.indicative ? "*" : ""}</b>} P={P} />
            <Board title="Top absolute increase (₹/mo)" rows={S.spoken.filter((x) => x.e.gross != null && x.r.prevGross != null).sort((a, b) => ((b.e.gross as number) - (b.r.prevGross as number)) - ((a.e.gross as number) - (a.r.prevGross as number))).slice(0, 8)}
              right={(x) => <b style={{ color: C.green }}>+₹{inr((x.e.gross as number) - (x.r.prevGross as number))}{x.e.indicative ? "*" : ""}</b>} P={P} />
            <Board title="Highest salaries (gross/mo, after)" rows={[...S.all].map((r) => ({ r, e: eff(r) })).sort((a, b) => ((b.e.gross ?? b.r.prevGross ?? 0)) - ((a.e.gross ?? a.r.prevGross ?? 0))).slice(0, 8)}
              right={(x) => <b>₹{inr(x.e.gross ?? x.r.prevGross)}</b>} P={P} />
            <Board title="Least increase (of those decided)" rows={S.spoken.filter((x) => x.e.pct != null).sort((a, b) => (a.e.pct as number) - (b.e.pct as number)).slice(0, 8)}
              right={(x) => <b style={{ color: (x.e.pct as number) <= 0 ? C.red : C.ink }}>{pct(x.e.pct)}{x.e.indicative ? "*" : ""}</b>} P={P} />
          </div>
          <div className="text-xs mb-3" style={{ color: C.faint }}>* manager's proposal — not Final yet.</div>

          {/* ── the PIP screen ── */}
          <Card title={`People to sit down with — the PIP screen (${pip.length})`} tone="#B3392E"
            note="Screened, not sentenced: manager rating ≤ 4/10, or ≤ 5/10 with an increment of 2% or less. Each of these deserves a deliberate conversation — improvement plan, role change, or exit — decided in the room, not by this list.">
            {!pip.length ? <div className="text-sm" style={{ color: C.faint }}>Nobody screens in yet — the list fills as managers submit.</div> : (
              <table className="w-full genie-table" style={{ fontSize: 12.5, borderCollapse: "collapse" }}>
                <thead><tr style={{ color: C.faint, fontSize: 11 }}>
                  {["Name", "Department", "Manager rating", "Self rating", "Increase", "Why on this list"].map((h) => (
                    <th key={h} className="text-left px-1.5 py-1" style={{ borderBottom: `1px solid ${C.line}` }}>{h}</th>))}
                </tr></thead>
                <tbody>{pip.map((r) => {
                  const e = eff(r);
                  return (
                    <tr key={r.id} style={{ borderBottom: "1px solid #F2F0EA" }}>
                      <td className="px-1.5 py-1"><P r={r} bold /></td>
                      <td className="px-1.5 py-1">{r.department}</td>
                      <td className="px-1.5 py-1 tnum font-bold" style={{ color: C.red }}>{r.mgrAvg?.toFixed(1)} / 10</td>
                      <td className="px-1.5 py-1 tnum">{r.selfAvg != null ? `${r.selfAvg.toFixed(1)} / 10` : "—"}</td>
                      <td className="px-1.5 py-1 tnum">{pct(e.pct)}{e.indicative ? "*" : ""}</td>
                      <td className="px-1.5 py-1" style={{ color: C.dim, fontSize: 11.5 }}>
                        {(r.mgrAvg as number) <= 4 ? "manager scored at the bottom of the scale" : "low score and near-zero increment together"}
                      </td>
                    </tr>
                  );
                })}</tbody>
              </table>
            )}
          </Card>

          {/* ── perception gap ── */}
          <div className="grid gap-3 mb-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))" }}>
            <Card title="Sees themselves higher than the manager does" note="The biggest self-minus-manager gaps — where the appraisal conversation has the most explaining to do." flush>
              <MiniGap rows={gaps.filter((g) => g.gap >= 2).slice(0, 6)} P={P} color={C.orange} />
            </Card>
            <Card title="Rated higher by the manager than by themselves" note="Possible hidden gems — people underselling themselves. Worth telling them so." flush>
              <MiniGap rows={[...gaps].reverse().filter((g) => g.gap <= -1.5).slice(0, 6)} P={P} color={C.green} flip />
            </Card>
          </div>

          {/* ── ask vs give + tenure ── */}
          <div className="grid gap-3 mb-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))" }}>
            <Card title="Asked vs getting" note="What each person asked for on the green line, against where the company is landing. The biggest unmet asks are the retention conversations." flush>
              {!asks.length ? <div className="text-sm px-3 pb-3" style={{ color: C.faint }}>Nobody has asked yet.</div> : (
                <div className="px-3 pb-3">
                  {asks.slice(0, 6).map(({ r, askPct, gotPct, indicative }) => (
                    <div key={r.id} className="flex items-center justify-between py-1" style={{ borderBottom: "1px solid #F2F0EA", fontSize: 12.5 }}>
                      <P r={r} />
                      <span className="tnum">asked <b style={{ color: C.orange }}>{pct(askPct)}</b> · getting <b>{gotPct != null ? pct(gotPct) : "—"}{indicative ? "*" : ""}</b></span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
            <Card title="Increase by tenure" note="Are we rewarding the years or the work? A flat line here is a choice — make it consciously." flush>
              <div className="px-3 pb-3">
                {bands.map((b) => (
                  <div key={b.band} className="flex items-center gap-2 py-1" style={{ fontSize: 12.5 }}>
                    <span style={{ width: 84, color: C.dim }}>{b.band}</span>
                    <span className="tnum" style={{ width: 34, color: C.faint }}>{b.n}</span>
                    <div style={{ flex: 1, height: 8, background: "#F2F0EA", borderRadius: 4 }}>
                      {b.avg != null && <div style={{ height: 8, width: `${Math.min(100, Math.max(2, b.avg * 4))}%`, background: "var(--blue)", borderRadius: 4 }} />}
                    </div>
                    <b className="tnum" style={{ width: 52, textAlign: "right" }}>{pct(b.avg)}</b>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}
    </Pane>
  );
}

/* ── the bell curve ── */
function BellCurve({ values, mean, sd, title, note, unit, step }: {
  values: number[]; mean: number; sd: number; title: string; note: string; unit: "pct" | "inr"; step?: number;
}) {
  if (values.length < 3) {
    return <Card title={title} note="Appears once at least a few increments are on the table."><div className="text-sm" style={{ color: C.faint }}>{values.length} so far — too few to draw honestly.</div></Card>;
  }
  /* In rupees the range is not known in advance, so the bucket is chosen to
     give about twenty of them and then rounded to a figure a person would
     actually say out loud — 500, 1,000, 2,500, 5,000 — never 1,873. */
  const span = Math.max(...values) - Math.min(0, ...values);
  const nice = [250, 500, 1000, 2000, 2500, 5000, 10000, 25000, 50000];
  const st = step ?? (nice.find((v) => span / v <= 20) ?? 100000);
  const lo = Math.floor(Math.min(0, ...values) / st) * st;
  const hi = Math.ceil(Math.max(...values) / st) * st + st;
  const buckets: { x0: number; n: number }[] = [];
  for (let x = lo; x < hi; x += st) buckets.push({ x0: x, n: values.filter((p) => p >= x && p < x + st).length });
  const maxN = Math.max(...buckets.map((b) => b.n), 1);
  const W = 680, H = 190, padL = 26, padB = 24;
  const bw = (W - padL - 8) / buckets.length;
  const X = (v: number) => padL + ((v - lo) / (hi - lo)) * (W - padL - 8);
  // the ideal normal with this mean and spread, drawn over the real bars
  const curve = sd > 0 ? Array.from({ length: 81 }, (_, i) => {
    const v = lo + (i / 80) * (hi - lo);
    const y = Math.exp(-((v - mean) ** 2) / (2 * sd * sd));
    return `${i ? "L" : "M"}${X(v).toFixed(1)},${(H - padB - y * (H - padB - 14)).toFixed(1)}`;
  }).join(" ") : "";
  /* EVERY LABEL PRINTED IS EVERY LABEL UNREADABLE (7 Sep 2026): at 34
     buckets they ran into one another and the axis said nothing. One in
     every nth, chosen so they never touch. */
  const every = Math.max(1, Math.ceil(34 / bw));
  const lbl = (v: number) => (unit === "pct" ? `${v}%` : v >= 1000 ? `${Math.round(v / 1000)}k` : String(v));
  return (
    <Card title={title} note={note}>
      <div style={{ overflowX: "auto" }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", minWidth: 480, display: "block" }}>
          {buckets.map((b, i) => {
            const h = (b.n / maxN) * (H - padB - 14);
            return (
              <g key={i}>
                <rect x={X(b.x0) + 1.5} y={H - padB - h} width={bw - 3} height={h} rx={3}
                  fill={b.x0 < 0 ? "#D9838B" : b.x0 < mean - sd ? "#C9C6BD" : b.x0 > mean + sd ? "#7FB89A" : "var(--blue)"} opacity={0.85} />
                {b.n > 0 && <text x={X(b.x0) + bw / 2} y={H - padB - h - 4} textAnchor="middle" fontSize="9.5" fill="#5A6572">{b.n}</text>}
                {i % every === 0 && <text x={X(b.x0) + bw / 2} y={H - 8} textAnchor="middle" fontSize="9" fill="var(--muted)">{lbl(b.x0)}</text>}
              </g>
            );
          })}
          {curve && <path d={curve} fill="none" stroke="#B3392E" strokeWidth={1.7} strokeDasharray="5 3" opacity={0.8} />}
          <line x1={X(mean)} y1={12} x2={X(mean)} y2={H - padB} stroke="#B3392E" strokeWidth={1.3} />
          <text x={X(mean) + 4} y={20} fontSize="10" fontWeight="bold" fill="#B3392E">mean {unit === "pct" ? pct(mean) : `₹${inr(Math.round(mean))}`}</text>
        </svg>
      </div>
    </Card>
  );
}

/* ── small parts ── */
function Big({ n, l, sub, green }: { n: string; l: string; sub?: string; green?: boolean }) {
  return (
    <div className="bg-white rounded-lg border px-3 py-2" style={{ borderColor: C.line, minWidth: 140 }}>
      <div className="font-bold tnum" style={{ fontSize: 19, lineHeight: 1.15, color: green ? C.green : C.ink }}>{n}</div>
      <div style={{ fontSize: 11, color: C.faint }}>{l}</div>
      {sub && <div style={{ fontSize: 10, color: "#A8A395" }}>{sub}</div>}
    </div>
  );
}

function Card({ title, note, tone, flush, children }: { title: string; note?: string; tone?: string; flush?: boolean; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border mb-3" style={{ borderColor: C.line, borderTop: `3px solid ${tone || "var(--navy)"}` }}>
      <div className="px-3 pt-2.5 pb-1.5">
        <div className="font-bold" style={{ fontSize: 13.5, color: tone || C.ink }}>{title}</div>
        {note && <div style={{ fontSize: 11, color: C.faint, lineHeight: 1.5 }}>{note}</div>}
      </div>
      {flush ? children : <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

function Board({ title, rows, right, P }: {
  title: string;
  rows: { r: Row; e: { gross: number | null; pct: number | null; indicative: boolean } }[];
  right: (x: { r: Row; e: { gross: number | null; pct: number | null; indicative: boolean } }) => React.ReactNode;
  P: (p: { r: Row; bold?: boolean }) => React.ReactNode;
}) {
  return (
    <Card title={title} flush>
      <div className="px-3 pb-3">
        {!rows.length && <div className="text-sm" style={{ color: C.faint }}>Nothing yet.</div>}
        {rows.map((x, i) => (
          <div key={x.r.id} className="flex items-center justify-between py-1" style={{ borderBottom: "1px solid #F2F0EA", fontSize: 12.5 }}>
            <span className="flex items-center gap-1.5">
              <span className="tnum" style={{ width: 16, color: "#C9C6BD", fontSize: 10.5 }}>{i + 1}</span>
              {P({ r: x.r })}
              <span style={{ color: C.faint, fontSize: 10.5 }}>{x.r.department || ""}</span>
            </span>
            <span className="tnum">{right(x)}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function MiniGap({ rows, P, color, flip }: { rows: { r: Row; gap: number }[]; P: (p: { r: Row }) => React.ReactNode; color: string; flip?: boolean }) {
  if (!rows.length) return <div className="text-sm px-3 pb-3" style={{ color: C.faint }}>No wide gaps — self and manager broadly agree.</div>;
  return (
    <div className="px-3 pb-3">
      {rows.map(({ r, gap }) => (
        <div key={r.id} className="flex items-center justify-between py-1" style={{ borderBottom: "1px solid #F2F0EA", fontSize: 12.5 }}>
          {P({ r })}
          <span className="tnum">self <b>{r.selfAvg?.toFixed(1)}</b> · mgr <b>{r.mgrAvg?.toFixed(1)}</b> <b style={{ color }}>({flip ? "" : "+"}{gap.toFixed(1)})</b></span>
        </div>
      ))}
    </div>
  );
}
