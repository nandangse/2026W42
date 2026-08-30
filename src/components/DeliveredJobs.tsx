"use client";
// Delivered Jobs — the analysis workspace.
//
// The one thing Genie could never answer: what did we actually deliver, and
// when. `jobs` is a live snapshot, so a delivered job used to simply vanish
// from the morning export. `delivered_jobs` is an accumulating ledger, and
// this page is the read of it.
//
// Every number here is either a count, a sum, or an average over a stated
// window. The averages are where a page like this quietly lies, so the rule
// throughout is: never divide by months that hold no data, and never fold an
// undated delivery into a period it might not belong to. Both cases are shown
// on the page rather than smoothed away.
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import {
  PERIODS, rangeFor, fyLabel, fqLabel, fyStart, span, within, dated, undated,
  totalsOf, averagePerMonth, byMonth, byFamily, byCustomer, otdAggregate, coveredMonths, throughputOf,
  dayCount, median, delayDays, rowOtdPct,
  type DeliveredJob, type PeriodKey, type Totals, type Bucket,
} from "@/lib/delivered";
import { today, fmt, fmtFull, lakh } from "@/lib/schedule";
import RunRate from "./RunRate";
import AnticipatedFY, { type Anticipated } from "./AnticipatedFY";

const TODAY = today();

/**
 * Table type scale. 12px for every figure in a table — this gets shown on a
 * screen in a room, and 10px does not survive that. Chart annotations and
 * captions may stay smaller; data may not.
 */
const TD = { fontSize: 12 } as const;
const TH = { fontSize: 11, fontWeight: 700, letterSpacing: 0.6, color: "#8A94A0" } as const;

/** Per-row OTD %, on hover over the column header. */
const OTD_ROW_FORMULA = [
  "OTD % = (1 − Delay Days ÷ (OTD Date − Actual Start Date)) × 100",
  "",
  "Delay Days = Actual Delivery Date − OTD Date.",
  "",
  "The slip is charged against the lead time that was undertaken, so 30 days",
  "late on a 60-day job scores far worse than 30 days late on a 600-day job.",
  "",
  "100% = delivered exactly on the promised date. Over 100% = early.",
  "Negative = the job overran its whole promised lead time.",
  "Blank = no promised date, no start date, or the promise predates the start.",
].join("\n");

/** Shown on hover over the OTD card — the formula, in words. */
const OTD_FORMULA = [
  "Per job:",
  "  OTD % = (1 − Delay Days ÷ (OTD Date − Actual Start Date)) × 100",
  "  Delay Days = Actual Delivery Date − OTD Date",
  "",
  "For the period: the MEAN of that across every job delivered in the window",
  "that can be measured.",
  "",
  "This measures how far off we ran, not how often we hit the date. Two jobs",
  "a day late and two a year late score the same under a count, and very",
  "differently here.",
  "",
  "100% = delivered exactly on the promised date. Over 100% = early.",
  "Negative = the job overran its whole promised lead time.",
  "",
  "The median is shown beside the mean, because one job 592 days late moves",
  "the average several points on its own.",
  "",
  "The promise is the OTD Date; where blank, the Committed Delivery Date.",
  "A job with no promise or no start date is excluded, not scored zero.",
].join("\n");

const C = {
  ink: "#16232F", body: "#22303C", sub: "#5A6672", mute: "#8A94A0", faint: "#B8B5AC",
  line: "#E2E0DA", panel: "#F4F2EC", accent: "#E8600A", navy: "#1B3A5C",
  green: "#0D7A3F", amber: "#D97706", red: "#B3261E", violet: "#7C3AED",
};

interface Payload {
  jobs: DeliveredJob[];
  lastUpload: string | null;
  dateSources: string[];
  truncated: boolean;
  /** Active, undelivered jobs — what the period could still produce. */
  pipeline?: { id: string; tag: string | null; fam: string | null; val: number; tp: number; tpv: number; tdd: string | null }[];
  /** Delivered from the factory, standing at site. */
  installation?: { id: string; tag: string | null; cust: string | null; delivered_on: string | null; proj: string | null; val: number; pending: number | null; billed: number | null; status: string | null }[];
  /** The monthly target the run-rate box measures against (0102 / defaults). */
  targets?: { value_cr: number; tp_cr: number; nos?: number | null };
}

export default function DeliveredJobs({ V }: { V: (rupees: number) => string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "not_installed" | "error">("loading");
  const [err, setErr] = useState("");

  const [period, setPeriod] = useState<PeriodKey>("ytd");
  const [from, setFrom] = useState(fyStart(TODAY));
  const [to, setTo] = useState(TODAY);
  const [fam, setFam] = useState("");
  const [cut, setCut] = useState<"month" | "family" | "customer">("month");
  // the submodules: Delivered Jobs · Installation Jobs · Analytics
  const [sub, setSub] = useState<"jobs" | "install" | "analytics">("jobs");

  /**
   * The run-rate payload, read here as well as inside <RunRate/>.
   *
   * Two reads of the same route rather than threading it through: the route is
   * force-dynamic and cheap, and the alternative is lifting all of RunRate's
   * state into this page to serve one button in the header.
   */
  const [rr, setRr] = useState<{
    fy: string; end: string; hasTarget: boolean;
    targets: { sales: number; throughput: number };
    actuals: { sales: number; throughput: number };
    anticipated: Anticipated;
  } | null>(null);
  useEffect(() => {
    api.get("/api/run-rate").then((r) => { if (r?.installed && r.anticipated) setRr(r); }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    try {
      const r: Payload = await api.get("/api/delivered");
      setData(r);
      setState("ok");
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (/not_installed|delivered_jobs|does not exist|schema cache/i.test(m)) setState("not_installed");
      else { setErr(m); setState("error"); }
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const all = useMemo(() => data?.jobs ?? [], [data]);
  const { earliest, latest } = useMemo(() => span(all), [all]);

  // the family filter applies to every number on the page, so it is applied
  // once, here, rather than remembered separately by each panel
  const rows = useMemo(() => (fam ? all.filter((j) => (j.fam?.trim() || "Unclassified") === fam) : all), [all, fam]);

  const pick = (k: PeriodKey) => {
    setPeriod(k);
    const r = rangeFor(k, TODAY, earliest);
    setFrom(r.from);
    setTo(r.to);
  };

  const inWindow = useMemo(() => within(rows, from, to), [rows, from, to]);
  const totals = useMemo(() => totalsOf(inWindow), [inWindow]);

  // WHAT MORE THE PERIOD CAN STILL PRODUCE (Dr Raghu, 29 Aug 2026): active
  // undelivered jobs whose target date lands inside the period — measured to
  // the period's NATURAL end (month end for MTD, quarter end, FY end for
  // YTD), not merely to today, because "more" is about the road ahead.
  const periodEnd = useMemo(() => {
    const d = new Date(TODAY + "T00:00:00Z");
    if (period === "mtd") return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    if (period === "qtd") { const m = d.getUTCMonth(); const qs = m >= 9 ? 9 : m >= 6 ? 6 : m >= 3 ? 3 : 0; return new Date(Date.UTC(d.getUTCFullYear(), qs + 3, 0)).toISOString().slice(0, 10); }
    if (period === "ytd") { const y = d.getUTCMonth() >= 3 ? d.getUTCFullYear() + 1 : d.getUTCFullYear(); return `${y}-03-31`; }
    return to;
  }, [period, to]);
  const pipe = useMemo(() => {
    const src = (data?.pipeline ?? []).filter((j) =>
      (!fam || (j.fam?.trim() || "Unclassified") === fam) && j.tdd && j.tdd >= from && j.tdd <= periodEnd);
    const t = { nos: src.length, val: 0, tp: 0 };
    const byFam = new Map<string, number>();
    for (const j of src) {
      t.val += j.val; t.tp += throughputOf(j);
      const f = j.fam?.trim() || "Unclassified";
      byFam.set(f, (byFam.get(f) || 0) + 1);
    }
    return { ...t, fams: [...byFam.entries()].sort((a, b) => b[1] - a[1]) };
  }, [data, fam, from, periodEnd]);
  const undatedRows = useMemo(() => undated(rows), [rows]);

  const ytd = useMemo(
    () => averagePerMonth(rows, fyStart(TODAY), TODAY, earliest, coveredMonths(fyStart(TODAY), TODAY, null)),
    [rows, earliest],
  );
  /** What actually went out the gate in the last N days — nos, value,
   *  throughput — shown under the averages (Dr Raghu, 25 Aug 2026). */
  const deliveredSince = (days: number) => {
    const cut = new Date(new Date(TODAY + "T00:00:00").getTime() - days * 86400000)
      .toISOString().slice(0, 10);
    const js = rows.filter((j) => j.delivered_on && j.delivered_on >= cut && j.delivered_on <= TODAY);
    return {
      n: js.length,
      val: js.reduce((s, j) => s + (Number(j.val) || 0), 0),
      tp: js.reduce((s, j) => s + throughputOf(j), 0),
    };
  };
  const d7 = useMemo(() => deliveredSince(7), [rows]);   // eslint-disable-line react-hooks/exhaustive-deps
  const d30 = useMemo(() => deliveredSince(30), [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  const m12 = useMemo(() => {
    const r = rangeFor("m12", TODAY, earliest);
    return averagePerMonth(rows, r.from, r.to, earliest, 12);
  }, [rows, earliest]);

  const months = useMemo(() => byMonth(rows, from, to), [rows, from, to]);
  const families = useMemo(() => byFamily(rows, from, to), [rows, from, to]);
  const customers = useMemo(() => byCustomer(rows, from, to), [rows, from, to]);
  const otd = useMemo(() => otdAggregate(rows, from, to), [rows, from, to]);
  const famOptions = useMemo(() => byFamily(all, "0000-01-01", "9999-12-31"), [all]);

  if (state === "loading") return <div className="p-8 text-sm" style={{ color: C.mute }}>Loading the delivery ledger…</div>;
  if (state === "not_installed") return <NotInstalled />;
  if (state === "error") return <div className="p-8 text-sm" style={{ color: C.red }}>{err}</div>;
  if (!data) return null;

  if (!all.length) return <NoData lastUpload={data.lastUpload} />;

  // Months newest-first: the current month is what anyone opens this to see,
  // and scrolling to the bottom for it gets old immediately.
  const cuts = cut === "month" ? [...months].reverse() : cut === "family" ? families : customers;
  // Scale and midpoint per column. Rows with nothing in them are left out of
  // the median: a month with no deliveries is not a low month, it is no month,
  // and letting it drag the middle down would flatter every real one.
  const live = cuts.filter((b) => b.nos > 0);
  const scale = {
    nos: { max: Math.max(1, ...cuts.map((b) => b.nos)), mid: median(live.map((b) => b.nos)) },
    value: { max: Math.max(1, ...cuts.map((b) => b.value)), mid: median(live.map((b) => b.value)) },
    throughput: { max: Math.max(1, ...cuts.map((b) => b.throughput)), mid: median(live.map((b) => b.throughput)) },
  };

  return (
    <div className="p-4">
      {/* ===== header: three boxes, one line =====
          What the page is, what the year comes to, and how much ledger is
          behind it. They were a title, a floating dark card and a right-aligned
          paragraph, which collided at every width. Three boxes of equal height
          in one grid cannot. */}
      <div className="grid gap-2 mb-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))" }}>
        <div className="rounded-lg border bg-white px-3 py-2 flex flex-col justify-center" style={{ borderColor: C.line, borderTop: `3px solid ${C.accent}` }}>
          <div className="text-xs font-bold" style={{ color: C.mute, letterSpacing: 1.4 }}>
            DELIVERED JOBS · {fyLabel(TODAY)}
          </div>
          <div className="text-lg font-bold" style={{ color: C.ink, lineHeight: 1.2 }}>
            What actually went out of the door
          </div>
        </div>

        {rr ? (
          <AnticipatedFY
            fy={rr.fy} end={rr.end} anticipated={rr.anticipated} actuals={rr.actuals}
            targets={rr.targets} hasTarget={rr.hasTarget} V={V}
          />
        ) : (
          <div className="rounded-lg border bg-white" style={{ borderColor: C.line }} />
        )}

        <div className="rounded-lg border bg-white px-3 py-2 flex flex-col justify-center" style={{ borderColor: C.line }}>
          <div className="text-xs font-bold" style={{ color: C.mute, letterSpacing: 1.1 }}>THE LEDGER</div>
          <div className="text-xs" style={{ color: C.sub, lineHeight: 1.55 }}>
            <b className="tnum" style={{ color: C.ink }}>{dated(all).length}</b> dated ·{" "}
            <b className="tnum" style={{ color: C.ink }}>{undatedRows.length}</b> undated
            <div style={{ color: C.faint }}>
              on record {earliest ? fmtFull(earliest) : "—"} → {latest ? fmtFull(latest) : "—"}
            </div>
            {data.lastUpload && (
              <div style={{ color: C.faint }}>
                loaded {fmtFull(String(data.lastUpload))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===== the submodules (Dr Raghu, 30 Aug 2026): Delivered Jobs ·
          Installation Jobs · Delivered Jobs Analytics ===== */}
      <div className="flex gap-1 rounded p-1 bg-white border mb-3" style={{ borderColor: C.line, width: "fit-content" }}>
        {([["jobs", "Delivered Jobs"], ["install", "Installation Jobs"], ["analytics", "Delivered Jobs Analytics"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setSub(k)} className="px-3 py-1 rounded text-sm font-semibold"
            style={sub === k ? { background: "#22303C", color: "#fff" } : { color: C.sub }}>
            {l}
          </button>
        ))}
      </div>

      {/* ===== the year against its target =====
          Sits ABOVE the period controls on purpose: it is always the whole
          financial year, and putting it under the MTD/QTD chips would suggest
          it follows them. It ignores the family filter too — the target is
          for the company, not for a product line. */}
      <div style={{ display: sub === "analytics" ? undefined : "none" }}>
        <RunRate V={V} />
      </div>

      {/* ===== the installation submodule: out of the factory, at site ===== */}
      {sub === "install" && <InstallationTable rows={data?.installation ?? []} V={V} />}

      {/* ===== period controls ===== */}
      <div className="rounded-lg border bg-white p-2.5 mb-3" style={{ borderColor: C.line, display: sub === "install" ? "none" : undefined }}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold" style={{ color: C.mute, letterSpacing: 1.1 }}>PERIOD</span>
          {PERIODS.map((p) => (
            <button key={p.key} onClick={() => pick(p.key)} title={p.note}
              className="text-xs font-bold rounded px-2.5 py-1"
              style={period === p.key
                ? { background: C.accent, color: "#fff" }
                : { background: "#fff", border: `1px solid ${C.line}`, color: C.sub }}>
              {p.label}
            </button>
          ))}
          <span style={{ width: 8 }} />
          <span className="text-xs" style={{ color: C.mute }}>From</span>
          <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPeriod("custom"); }}
            className="text-xs border rounded px-2 py-1" style={{ borderColor: C.line }} />
          <span className="text-xs" style={{ color: C.mute }}>to</span>
          <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPeriod("custom"); }}
            className="text-xs border rounded px-2 py-1" style={{ borderColor: C.line }} />

          <div className="flex-1" style={{ minWidth: 10 }} />
          <span className="text-xs font-bold" style={{ color: C.mute, letterSpacing: 1.1 }}>FAMILY</span>
          <select value={fam} onChange={(e) => setFam(e.target.value)}
            className="text-xs border rounded px-2 py-1 bg-white font-semibold" style={{ borderColor: C.line, color: C.body }}>
            <option value="">All families</option>
            {famOptions.map((f) => <option key={f.key} value={f.key}>{f.label} ({f.nos})</option>)}
          </select>
        </div>
        <div style={{ fontSize: 12, marginTop: 6, color: C.sub }}>
          {period === "custom" ? "Custom range" : PERIODS.find((p) => p.key === period)?.note} ·{" "}
          {fmtFull(from)} → {fmtFull(to)}{" "}
          <b style={{ color: C.body }}>({dayCount(from, to).toLocaleString("en-IN")} days)</b>
          {period === "qtd" && ` · ${fqLabel(TODAY)}`}
          {fam && ` · ${fam} only`}
        </div>
      </div>

      {/* ===== the three headline numbers ===== */}
      <div className="flex gap-2 flex-wrap mb-3" style={{ display: sub === "jobs" ? undefined : "none" }}>
        <Headline label="Nos" value={String(totals.nos)} note={`job${totals.nos === 1 ? "" : "s"} delivered in the period`} color={C.navy} />
        <Headline label="Value" value={V(totals.value)} note="order value of those jobs" color={C.accent} />
        <Headline label="Throughput" value={V(totals.throughput)} note="Throughput Expected Value (Auto)" color={C.green} />

        {/* RUN RATE vs TARGET vs REQUIRED (Dr Raghu, 30 Aug 2026) — the
            month's pace, the settings' target, and what the rest of the
            period demands to close the gap */}
        {(() => {
          const tgt = data?.targets ?? { value_cr: 10, tp_cr: 4 };
          const days = (a: string, b: string) => Math.max(0, Math.round((new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) / 86400000) + 1);
          const elapsedM = Math.max(0.25, days(from, TODAY < periodEnd ? TODAY : periodEnd) / 30.44);
          const periodM = Math.max(elapsedM, days(from, periodEnd) / 30.44);
          const leftM = periodM - elapsedM;
          const rr = { nos: totals.nos / elapsedM, val: totals.value / elapsedM, tp: totals.throughput / elapsedM };
          const req = (targetMo: number, done: number) => (leftM > 0.1 ? Math.max(0, targetMo * periodM - done) / leftM : null);
          const reqVal = req(tgt.value_cr * 1e7, totals.value);
          const reqTp = req(tgt.tp_cr * 1e7, totals.throughput);
          // the QUANTITY target derives itself (Dr Raghu, 30 Aug 2026): the
          // value target over the last 12 months' average value per job —
          // a hand-typed nos in the masters outranks the derivation
          const avgJob = m12.perMonth && m12.perMonth.nos > 0 ? m12.perMonth.value / m12.perMonth.nos : 0;
          const nosTarget = tgt.nos || (avgJob > 0 ? (tgt.value_cr * 1e7) / avgJob : null);
          const reqNos = nosTarget ? req(nosTarget, totals.nos) : null;
          const Rw = ({ l, a, t, r, money }: { l: string; a: number; t: number | null; r: number | null; money?: boolean }) => (
            <tr>
              <td className="pr-2 py-0.5 font-bold" style={{ color: C.mute, fontSize: 10.5 }}>{l}</td>
              <td className="text-right px-1 py-0.5 tnum font-bold" style={{ color: C.ink }}>{money ? V(a) : a.toFixed(1)}</td>
              <td className="text-right px-1 py-0.5 tnum" style={{ color: C.navy }}>{t != null ? (money ? V(t) : String(Math.ceil(t))) : "—"}</td>
              <td className="text-right pl-1 py-0.5 tnum font-bold" style={{ color: r == null ? C.faint : t != null && r > t ? "#B3261E" : C.green }}>
                {r != null ? (money ? V(r) : String(Math.ceil(r))) : "—"}
              </td>
            </tr>
          );
          return (
            <div className="rounded-lg border bg-white p-3" style={{ borderColor: C.line, borderTop: `3px solid #7C3AED`, flex: "1 1 0", minWidth: 250 }}>
              <div className="text-xs font-bold" style={{ color: C.mute, letterSpacing: 1.1 }}>RUN RATE / MONTH · TARGET · REQUIRED</div>
              <table className="mt-1" style={{ fontSize: 12.5, width: "100%" }}>
                <thead>
                  <tr style={{ fontSize: 9.5, color: C.faint }}>
                    <td /><td className="text-right px-1">RUN RATE</td><td className="text-right px-1">TARGET</td><td className="text-right pl-1">REQUIRED</td>
                  </tr>
                </thead>
                <tbody>
                  <Rw l="NOS" a={rr.nos} t={nosTarget} r={reqNos} />
                  <Rw l="VALUE" a={rr.val} t={tgt.value_cr * 1e7} r={reqVal} money />
                  <Rw l="THROUGHPUT" a={rr.tp} t={tgt.tp_cr * 1e7} r={reqTp} money />
                </tbody>
              </table>
              <div className="text-xs mt-0.5" style={{ color: C.faint, fontSize: 9.5 }}>
                required = what each remaining month must deliver to end the period on target ({tgt.value_cr} Cr / {tgt.tp_cr} Cr a month, from the masters{avgJob > 0 && !tgt.nos ? ` · nos target = value target ÷ avg job value (${lakh(avgJob)}, last 12 months)` : ""})
              </div>
            </div>
          );
        })()}
      </div>

      {/* what a "delivery" means here — said once, in the company's own navy */}
      <div className="rounded-lg px-3 py-2 mb-3 text-sm font-semibold" style={{ background: "#1B3A5C", color: "#fff", lineHeight: 1.5, display: sub === "jobs" ? undefined : "none" }}>
        These deliveries are based on ERP dates — NOT invoice dates. ERP dates are the actual delivery from the factory.
        <span style={{ color: "#B9C7D4", fontWeight: 500 }}> · Note: Delivered = Delivered and Installation Stage.</span>
      </div>

      {/* ===== what the period can STILL produce (Dr Raghu, 29 Aug 2026):
          active jobs whose target date lands inside it, to its natural end ===== */}
      {sub === "jobs" && pipe.nos > 0 && (() => {
        const pl = period === "mtd" ? "MTD" : period === "qtd" ? "QTD" : period === "ytd" ? "YTD" : "this period";
        return (
          <div className="flex gap-2 flex-wrap mb-3">
            {/* LEFT — what still stands on the boards for the period */}
            <div className="rounded-lg border p-3" style={{ flex: "1 1 420px", minWidth: 320, borderColor: "#B9C7D4", background: "#F2F7FB", borderLeft: "4px solid #1B3A5C" }}>
              <div className="text-sm" style={{ color: "#16232F" }}>
                <b>More additional jobs planned for {pl}</b>
                {" — "}<b className="tnum">{pipe.nos}</b> nos + <b className="tnum" style={{ color: C.accent }}>{V(pipe.val)}</b> value + <b className="tnum" style={{ color: C.green }}>{V(pipe.tp)}</b> throughput
                <span className="text-xs" style={{ color: "#5A6672" }}> · target dates up to {fmtFull(periodEnd)} · on the boards, not yet delivered</span>
              </div>
              {pipe.fams.length > 0 && (
                <div className="flex gap-1.5 flex-wrap mt-2">
                  {pipe.fams.map(([f, n]) => (
                    <span key={f} className="text-xs font-bold rounded px-2 py-0.5" style={{ background: "#fff", border: "1px solid #B9C7D4", color: "#1B3A5C" }}>
                      {n} × {f}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {/* RIGHT — the prize, if every one of them goes out the gate */}
            <div className="rounded-lg border p-3" style={{ flex: "1 1 360px", minWidth: 300, borderColor: "#BFE3CB", background: "#F2FAF4", borderLeft: "4px solid #0D7A3F" }}>
              <div className="text-xs font-bold" style={{ color: "#0D7A3F", letterSpacing: 0.8 }}>IF COMPLETED AND DELIVERED — the {pl} report will read</div>
              <div className="mt-1 tnum" style={{ fontSize: 20, fontWeight: 800, color: "#16232F" }}>
                {totals.nos + pipe.nos} nos
                <span style={{ color: C.accent }}> · {V(totals.value + pipe.val)}</span>
                <span style={{ color: C.green }}> · {V(totals.throughput + pipe.tp)}</span>
              </div>
              <div className="text-xs mt-1" style={{ color: "#5A6672" }}>
                {totals.nos} already out the gate + {pipe.nos} on the boards
              </div>
              <div className="mt-1.5 font-bold" style={{ color: "#0D7A3F", fontSize: 13 }}>
                Come on — LET&apos;S DO IT AND SHOW THIS SUCCESS! 🚀
              </div>
            </div>
          </div>
        );
      })()}

      {/* ===== averages, and the honesty about them ===== */}
      <div className="flex gap-2 flex-wrap mb-3" style={{ display: sub === "analytics" ? undefined : "none" }}>
        <AverageCard title={`YTD monthly average · since 1 Apr`} avg={ytd} V={V}
          recent={{ label: "Delivered · last 7 days", ...d7 }} />
        <AverageCard title="12-month monthly average" avg={m12} V={V}
          recent={{ label: "Delivered · last 30 days", ...d30 }} />
        <div className="rounded-lg border bg-white p-3" style={{ borderColor: C.line, flex: "1 1 0", minWidth: 232 }} title={OTD_FORMULA}>
          <div className="text-xs font-bold" style={{ color: C.mute, letterSpacing: 1.1 }}>
            OTD % <span style={{ cursor: "help", color: C.navy }} title={OTD_FORMULA}>ⓘ</span>
          </div>
          {otd.pct == null ? (
            <>
              <div className="tnum font-bold" style={{ fontSize: 22, color: C.faint }}>—</div>
              <div className="text-xs" style={{ color: C.faint, lineHeight: 1.45 }}>
                Nothing delivered in this period carries a promised date, so there is nothing to measure against.
                {otd.unjudgeable > 0 && <> All {otd.unjudgeable} are unjudgeable rather than late.</>}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-baseline gap-2">
                <span className="tnum font-bold" style={{ fontSize: 26, color: otd.pct >= 90 ? C.green : otd.pct >= 50 ? C.amber : C.red }}>
                  {Math.round(otd.pct)}%
                </span>
                <span style={{ fontSize: 12, color: C.mute }}>mean of {otd.measurable}</span>
              </div>
              <div className="mt-1" style={{ height: 7, background: "#EFEDE7", borderRadius: 2, overflow: "hidden" }}>
                <div style={{
                  width: `${Math.max(0, Math.min(100, otd.pct))}%`, height: 7,
                  background: otd.pct >= 90 ? C.green : otd.pct >= 50 ? C.amber : C.red,
                }} />
              </div>
              <div style={{ fontSize: 12, marginTop: 4, color: C.sub, lineHeight: 1.45 }}>
                <b>(1 − Delay ÷ (OTD − Start))</b> averaged over the period. 100% is dead on the promised date.
              </div>
              <div style={{ fontSize: 12, marginTop: 2, color: C.mute, lineHeight: 1.45 }}>
                Median <b className="tnum" style={{ color: C.body }}>{Math.round(otd.median ?? 0)}%</b> ·{" "}
                <b className="tnum" style={{ color: C.green }}>{otd.onTimeOrBetter}</b> on time or early ·
                worst <b className="tnum" style={{ color: C.red }}>{Math.round(otd.worst ?? 0)}%</b>
              </div>
              {otd.unjudgeable > 0 && (
                <div className="text-xs mt-1" style={{ color: C.amber, lineHeight: 1.45 }}>
                  {otd.unjudgeable} of the {totals.nos} delivered carry no promised date. They are excluded, not counted late —
                  a missing date is a record-keeping gap, not a delivery failure.
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ===== undated warning ===== */}
      {sub === "analytics" && undatedRows.length > 0 && (
        <div className="rounded-lg p-3 mb-3" style={{ background: "#FFF7E6", border: `1px solid #F0D9A8` }}>
          <div className="text-sm font-bold mb-0.5" style={{ color: C.amber }}>
            {undatedRows.length} deliver{undatedRows.length === 1 ? "y is" : "ies are"} banked without a date
          </div>
          <div className="text-xs" style={{ color: C.sub, lineHeight: 1.5 }}>
            They are real deliveries and their value is on record, but they cannot be placed in a period, so they are
            excluded from every number above. That happens when the report&apos;s delivery-date column was renamed, or the
            job was delivered before the column existed.
            {data.dateSources.length > 0 && (
              <> Dates so far have been read from <b>{data.dateSources.join(", ")}</b>.</>
            )}
          </div>
          <div className="text-xs mt-1" style={{ color: C.faint }}>
            {V(undatedRows.reduce((s, r) => s + r.val, 0))} of value sits in this group.
          </div>
        </div>
      )}

      {/* ===== the cuts ===== */}
      <div className="rounded-lg border bg-white mb-3" style={{ borderColor: C.line, overflow: "hidden", display: sub === "analytics" ? undefined : "none" }}>
        <div className="flex items-center gap-2 px-3 py-2" style={{ background: C.panel, borderBottom: `1px solid ${C.line}` }}>
          <span className="text-xs font-bold" style={{ color: C.mute, letterSpacing: 1.1 }}>BREAK IT DOWN BY</span>
          {([["month", "Month"], ["family", "Product family"], ["customer", "Customer"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setCut(k)} className="text-xs font-bold rounded px-2.5 py-1"
              style={cut === k ? { background: C.body, color: "#fff" } : { background: "#fff", border: `1px solid ${C.line}`, color: C.sub }}>
              {l}
            </button>
          ))}
          <span className="ml-auto text-xs" style={{ color: C.mute }}>{cuts.length} rows</span>
        </div>


        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: C.mute, borderBottom: `1px solid ${C.line}` }}>
                <th className="text-left px-3 py-2" style={TH}>{cut === "month" ? "MONTH" : cut === "family" ? "FAMILY" : "CUSTOMER"}</th>
                <th className="text-right px-2 py-2" style={TH}>NOS</th>
                <th className="px-2 py-2" style={{ ...TH, width: "16%" }} />
                <th className="text-right px-2 py-2" style={TH}>VALUE</th>
                <th className="px-2 py-2" style={{ ...TH, width: "16%" }} />
                <th className="text-right px-2 py-2" style={TH}>THROUGHPUT</th>
                <th className="px-2 py-2" style={{ ...TH, width: "16%" }} />
              </tr>
            </thead>
            <tbody>
              {cuts.map((b) => (
                <tr key={b.key} style={{ borderBottom: `1px solid ${C.line}` }}>
                  <td className="px-3 py-1.5 font-semibold" style={{ ...TD, color: b.nos ? C.ink : C.faint }}>{b.label}</td>
                  <td className="text-right px-2 py-1.5 tnum" style={{ ...TD, color: b.nos ? C.body : C.faint }}>{b.nos || "—"}</td>
                  <td className="px-2 py-1.5"><MiniBar v={b.nos} max={scale.nos.max} mid={scale.nos.mid} color={C.navy} /></td>
                  <td className="text-right px-2 py-1.5 tnum" style={{ ...TD, color: b.nos ? C.body : C.faint }}>{b.nos ? V(b.value) : "—"}</td>
                  <td className="px-2 py-1.5"><MiniBar v={b.value} max={scale.value.max} mid={scale.value.mid} color={C.accent} /></td>
                  <td className="text-right px-2 py-1.5 tnum" style={{ ...TD, color: b.nos ? C.green : C.faint }}>{b.nos ? V(b.throughput) : "—"}</td>
                  <td className="px-2 py-1.5"><MiniBar v={b.throughput} max={scale.throughput.max} mid={scale.throughput.mid} color={C.green} /></td>
                </tr>
              ))}
              {cuts.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center" style={{ ...TD, color: C.mute }}>Nothing delivered in this period.</td></tr>
              )}
            </tbody>
            {cuts.length > 0 && (
              <tfoot>
                <tr style={{ background: C.panel, fontWeight: 700 }}>
                  <td className="px-3 py-2" style={{ ...TD, color: C.ink }}>Total</td>
                  <td className="text-right px-2 py-2 tnum" style={{ ...TD, color: C.ink }}>{totals.nos}</td>
                  <td />
                  <td className="text-right px-2 py-2 tnum" style={{ ...TD, color: C.ink }}>{V(totals.value)}</td>
                  <td />
                  <td className="text-right px-2 py-2 tnum" style={{ ...TD, color: C.green }}>{V(totals.throughput)}</td>
                  <td className="px-2" style={{ fontSize: 10, color: C.faint }}>
                    ▏ marks the median of the {live.length} {cut === "month" ? "months" : "rows"} with deliveries
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

      </div>

      {/* ===== the jobs themselves ===== */}
      {sub === "jobs" && <JobTable rows={inWindow} V={V} />}
    </div>
  );
}

// ===========================================================================
/**
 * A bar with the median marked. The median is the point of it: a column of
 * bars says which month was biggest, the tick says whether a month was
 * actually above or below a normal one.
 */
function MiniBar({ v, max, mid, color }: { v: number; max: number; mid: number; color: string }) {
  if (!v) return <div style={{ height: 9 }} />;
  const w = Math.max(2, (v / max) * 100);
  const m = mid > 0 ? (mid / max) * 100 : null;
  return (
    <div className="relative" style={{ height: 9, background: "#EFEDE7", borderRadius: 2 }}>
      <div style={{ width: `${w}%`, height: 9, background: color, borderRadius: 2 }} />
      {m != null && (
        <div title={`median ${Math.round(mid).toLocaleString("en-IN")}`}
          style={{ position: "absolute", left: `calc(${m}% - 1px)`, top: -2, width: 2, height: 13, background: C.ink, opacity: 0.75 }} />
      )}
    </div>
  );
}

function Headline({ label, value, note, color }: { label: string; value: string; note: string; color: string }) {
  return (
    <div className="rounded-lg border bg-white p-3" style={{ borderColor: C.line, flex: "1 1 0", minWidth: 190, borderTop: `3px solid ${color}` }}>
      <div className="text-xs font-bold" style={{ color: C.mute, letterSpacing: 1.2 }}>{label.toUpperCase()}</div>
      <div className="tnum font-bold" style={{ fontSize: 30, color, lineHeight: 1.15 }}>{value}</div>
      <div className="text-xs" style={{ color: C.faint, lineHeight: 1.4 }}>{note}</div>
    </div>
  );
}

/**
 * An average, with its denominator on show.
 *
 * The reason this component exists rather than a bare number: Genie has held
 * delivery data only since 23 Jul 2026. A "12-month average" computed over
 * four weeks would read as a catastrophic drop in output when nothing has
 * dropped at all. So when the data doesn't span the window, the number is
 * withheld and the span is stated instead.
 */
function AverageCard({ title, avg, V, recent }: {
  title: string; avg: ReturnType<typeof averagePerMonth>; V: (n: number) => string;
  /** The card's lower half: what went out the gate in the last N days. */
  recent?: { label: string; n: number; val: number; tp: number };
}) {
  return (
    <div className="rounded-lg border bg-white p-3" style={{ borderColor: C.line, flex: "1 1 0", minWidth: 250, display: "flex", flexDirection: "column" }}>
      <div className="text-xs font-bold" style={{ color: C.mute, letterSpacing: 1.1, textTransform: "uppercase" }}>{title}</div>
      {avg.insufficient || !avg.perMonth ? (
        <>
          <div className="tnum font-bold" style={{ fontSize: 20, color: C.amber, lineHeight: 1.25 }}>Insufficient history</div>
          <div className="text-xs" style={{ color: C.sub, lineHeight: 1.45 }}>
            {avg.months <= 0
              ? "No delivery data falls inside this window yet."
              : <>Only <b>{avg.months} month{avg.months === 1 ? "" : "s"}</b> of delivery data exists against a {avg.asked}-month window. Dividing by {avg.asked} would report a fall in output that never happened.</>}
          </div>
          {avg.perMonth && avg.months > 0 && (
            <div className="text-xs mt-1.5 rounded p-1.5" style={{ background: C.panel, color: C.sub, lineHeight: 1.45 }}>
              Over the {avg.months} month{avg.months === 1 ? "" : "s"} actually held:{" "}
              <b className="tnum">{avg.perMonth.nos.toFixed(1)}</b> jobs ·{" "}
              <b className="tnum">{V(avg.perMonth.value)}</b> ·{" "}
              <b className="tnum">{V(avg.perMonth.throughput)}</b> throughput per month.
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="tnum font-bold" style={{ fontSize: 26, color: C.accent }}>{avg.perMonth.nos.toFixed(1)}</span>
            <span className="text-xs" style={{ color: C.mute }}>jobs / month</span>
          </div>
          <div className="text-xs tnum" style={{ color: C.sub, lineHeight: 1.5 }}>
            {V(avg.perMonth.value)} value · <span style={{ color: C.green }}>{V(avg.perMonth.throughput)} throughput</span>
          </div>
          <div className="text-xs" style={{ color: C.faint }}>over {avg.months} month{avg.months === 1 ? "" : "s"} of data</div>
        </>
      )}
      {recent && (
        <div className="mt-auto pt-2" style={{ borderTop: `1px dashed ${C.line}`, marginTop: 10 }}>
          <div className="text-xs font-bold" style={{ color: C.mute, letterSpacing: 1.1 }}>{recent.label.toUpperCase()}</div>
          <div className="flex items-baseline gap-2">
            <span className="tnum font-bold" style={{ fontSize: 22, color: recent.n ? C.navy : C.faint }}>{recent.n}</span>
            <span className="text-xs" style={{ color: C.mute }}>job{recent.n === 1 ? "" : "s"} out the gate</span>
          </div>
          <div className="text-xs tnum" style={{ color: C.sub, lineHeight: 1.5 }}>
            {recent.n
              ? <>{V(recent.val)} value · <span style={{ color: C.green }}>{V(recent.tp)} throughput</span></>
              : "nothing went out"}
          </div>
        </div>
      )}
    </div>
  );
}

function JobTable({ rows, V }: { rows: DeliveredJob[]; V: (n: number) => string }) {
  const [sort, setSort] = useState<"date" | "val">("date");
  const sorted = [...rows].sort((a, b) =>
    sort === "val" ? b.val - a.val : (b.delivered_on || "").localeCompare(a.delivered_on || ""),
  );
  const [limit, setLimit] = useState(40);

  return (
    <div className="rounded-lg border bg-white" style={{ borderColor: C.line, overflow: "hidden" }}>
      <div className="flex items-center gap-2 px-3 py-2" style={{ background: C.panel, borderBottom: `1px solid ${C.line}` }}>
        <span className="text-xs font-bold" style={{ color: C.mute, letterSpacing: 1.1 }}>THE JOBS · {rows.length}</span>
        <div className="flex-1" />
        <span className="text-xs" style={{ color: C.mute }}>sort</span>
        {([["date", "Delivery date"], ["val", "Value"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setSort(k)} className="text-xs font-bold rounded px-2 py-0.5"
            style={sort === k ? { background: C.body, color: "#fff" } : { background: "#fff", border: `1px solid ${C.line}`, color: C.sub }}>
            {l}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ color: C.mute, borderBottom: `1px solid ${C.line}` }}>
              {[
                ["DELIVERED", ""], ["JOB NO", "The ERP job number"], ["TAG", ""], ["CUSTOMER", ""], ["FAMILY", ""],
                ["STARTED", "Actual start date — the denominator of OTD %"],
                ["OTD DATE", "The date promised to the customer"],
                ["DELAY DAYS", "Actual Delivery Date − OTD Date. Negative is early."],
                ["OTD %", OTD_ROW_FORMULA],
                ["VALUE", ""], ["THROUGHPUT", ""],
              ].map(([h, tip], i) => (
                <th key={h} title={tip || undefined}
                  className={`px-2 py-2 ${i >= 7 ? "text-right" : "text-left"}`}
                  style={{ ...TH, cursor: tip ? "help" : undefined }}>
                  {h}{tip ? " ⓘ" : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, limit).map((j) => {
              const delay = delayDays(j);
              const pct = rowOtdPct(j);
              const promise = j.otd || j.tdd;
              return (
                <tr key={j.id} style={{ borderBottom: `1px solid ${C.line}` }}>
                  <td className="px-2 py-1.5 tnum font-semibold" style={{ ...TD, color: C.ink }}>{fmt(j.delivered_on)}</td>
                  <td className="px-2 py-1.5 tnum" style={{ ...TD, color: C.sub }}>{j.id}</td>
                  <td className="px-2 py-1.5" style={{ ...TD, color: C.body }}>{j.tag || "—"}</td>
                  <td className="px-2 py-1.5 truncate" style={{ ...TD, color: C.sub, maxWidth: 210 }}>{j.cust}</td>
                  <td className="px-2 py-1.5" style={{ ...TD, color: C.sub }}>{j.fam || "—"}</td>
                  <td className="px-2 py-1.5 tnum" style={{ ...TD, color: C.faint }}>{fmt(j.start_date)}</td>
                  <td className="px-2 py-1.5 tnum" style={{ ...TD, color: C.faint }}>{fmt(promise)}</td>
                  <td className="px-2 py-1.5 tnum text-right" style={{
                    ...TD, fontWeight: 600,
                    color: delay == null ? C.faint : delay > 0 ? C.red : C.green,
                  }}>
                    {delay == null ? "—" : delay > 0 ? `+${delay}` : String(delay)}
                  </td>
                  <td className="px-2 py-1.5 tnum text-right" style={{
                    ...TD, fontWeight: 700,
                    color: pct == null ? C.faint : pct >= 100 ? C.green : pct >= 0 ? C.amber : C.red,
                  }}>
                    {pct == null ? "—" : `${Math.round(pct)}%`}
                  </td>
                  <td className="px-2 py-1.5 tnum text-right" style={{ ...TD, color: C.body }}>{V(j.val)}</td>
                  <td className="px-2 py-1.5 tnum text-right" style={{ ...TD, color: C.green }}>{V(throughputOf(j))}</td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr><td colSpan={11} className="px-3 py-6 text-center" style={{ ...TD, color: C.mute }}>Nothing delivered in this period.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {sorted.length > limit && (
        <button onClick={() => setLimit((l) => l + 100)} className="w-full text-xs font-bold py-2"
          style={{ color: C.sub, borderTop: `1px solid ${C.line}` }}>
          Show more — {sorted.length - limit} left
        </button>
      )}
    </div>
  );
}

// ===========================================================================
function NotInstalled() {
  return (
    <div className="p-8" style={{ maxWidth: 640 }}>
      <div className="text-lg font-bold mb-2" style={{ color: C.ink }}>The delivery ledger isn&apos;t installed yet</div>
      <p className="text-sm mb-3" style={{ color: C.sub, lineHeight: 1.6 }}>
        Run{" "}
        <code style={{ background: C.panel, padding: "1px 5px", borderRadius: 3 }}>
          supabase/migrations/0020_delivered_jobs.sql
        </code>{" "}
        in the Supabase SQL editor, then reload this page.
      </p>
      <p className="text-xs" style={{ color: C.mute, lineHeight: 1.6 }}>
        It creates the <code>delivered_jobs</code> table the Delivered Jobs report feeds. Purely additive — nothing
        already running depends on it.
      </p>
    </div>
  );
}

function NoData({ lastUpload }: { lastUpload: string | null }) {
  return (
    <div className="p-8" style={{ maxWidth: 660 }}>
      <div className="text-lg font-bold mb-2" style={{ color: C.ink }}>No deliveries on record yet</div>
      <p className="text-sm mb-3" style={{ color: C.sub, lineHeight: 1.6 }}>
        The ledger is installed but empty. Load the ERP&apos;s <b>Delivered Jobs for Analysis</b> report from{" "}
        <b>🌅 Morning Update</b> — it&apos;s the fourth card, marked <i>when it changes</i> rather than daily.
      </p>
      <p className="text-sm mb-3" style={{ color: C.sub, lineHeight: 1.6 }}>
        The first upload matters: its summary names the column it read the delivery date from, and if it can&apos;t find one
        it lists every column in the file. That is how the real header gets confirmed.
      </p>
      {lastUpload && (
        <p className="text-xs" style={{ color: C.amber, lineHeight: 1.6 }}>
          A delivered-jobs file was loaded on {fmtFull(String(lastUpload))} but produced no rows — worth
          re-checking that the right report was uploaded.
        </p>
      )}
      <p className="text-xs mt-3" style={{ color: C.mute, lineHeight: 1.6 }}>
        Until then this page has nothing to read. Genie has never recorded a delivery — a delivered job simply stops
        appearing in the morning export, which is the gap this report closes.
      </p>
    </div>
  );
}

/** INSTALLATION JOBS (Dr Raghu, 30 Aug 2026): out of the factory, standing
 *  at site — project, job, customer, the money billed and pending, and the
 *  current status from the live board. */
function InstallationTable({ rows, V }: { rows: NonNullable<Payload["installation"]>; V: (rupees: number) => string }) {
  return (
    <div className="rounded-lg border bg-white mb-3" style={{ borderColor: C.line, overflow: "hidden" }}>
      <div className="px-3 py-2 text-xs font-bold" style={{ background: C.panel, borderBottom: `1px solid ${C.line}`, color: C.mute, letterSpacing: 1.1 }}>
        INSTALLATION JOBS — delivered from the factory, standing at site
      </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ color: C.mute, borderBottom: `1px solid ${C.line}` }}>
                  <th className="text-left px-3 py-2" style={TH}>PROJECT</th>
                  <th className="text-left px-2 py-2" style={TH}>JOB</th>
                  <th className="text-left px-2 py-2" style={TH}>CUSTOMER</th>
                  <th className="text-right px-2 py-2" style={TH}>DELIVERED</th>
                  <th className="text-right px-2 py-2" style={TH}>VALUE</th>
                  <th className="text-right px-2 py-2" style={TH}>BILLED</th>
                  <th className="text-right px-2 py-2" style={TH}>PENDING TO RECEIVE</th>
                  <th className="text-left px-2 py-2" style={TH}>CURRENT STATUS</th>
                </tr>
              </thead>
              <tbody>
                {(rows).map((r) => (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${C.line}` }}>
                    <td className="px-3 py-1.5 font-semibold" style={{ ...TD, color: C.navy }}>{r.proj || "—"}</td>
                    <td className="px-2 py-1.5" style={TD}><b className="tnum">{String(r.id).slice(-4)}</b> <span style={{ color: C.sub }} title={String(r.id)}>{r.tag || ""}</span></td>
                    <td className="px-2 py-1.5" style={{ ...TD, color: C.sub }}>{r.cust || "—"}</td>
                    <td className="text-right px-2 py-1.5 tnum" style={TD}>{r.delivered_on ? fmtFull(r.delivered_on) : "—"}</td>
                    <td className="text-right px-2 py-1.5 tnum" style={{ ...TD, color: C.ink }}>{r.val > 1 ? V(r.val) : "—"}</td>
                    <td className="text-right px-2 py-1.5 tnum" style={{ ...TD, color: C.green }}>{r.billed != null ? V(r.billed) : "—"}</td>
                    <td className="text-right px-2 py-1.5 tnum font-bold" style={{ ...TD, color: r.pending ? "#B3261E" : C.faint }}>{r.pending != null ? V(r.pending) : "—"}</td>
                    <td className="px-2 py-1.5" style={{ ...TD, color: C.sub, maxWidth: 340 }} title={r.status || ""}>{r.status ? r.status.slice(0, 120) + (r.status.length > 120 ? "…" : "") : "—"}</td>
                  </tr>
                ))}
                {(rows).length === 0 && (
                  <tr><td colSpan={8} className="px-3 py-6 text-center" style={{ ...TD, color: C.mute }}>Nothing stands at installation — everything delivered is handed over.</td></tr>
                )}
              </tbody>
              {(rows).length > 0 && (
                <tfoot>
                  <tr style={{ background: C.panel, fontWeight: 700 }}>
                    <td className="px-3 py-2" colSpan={4} style={{ ...TD, color: C.ink }}>Total · {(rows).length} at site</td>
                    <td className="text-right px-2 py-2 tnum" style={{ ...TD, color: C.ink }}>{V((rows).reduce((s, r) => s + (r.val > 1 ? r.val : 0), 0))}</td>
                    <td className="text-right px-2 py-2 tnum" style={{ ...TD, color: C.green }}>{V((rows).reduce((s, r) => s + (r.billed ?? 0), 0))}</td>
                    <td className="text-right px-2 py-2 tnum" style={{ ...TD, color: "#B3261E" }}>{V((rows).reduce((s, r) => s + (r.pending ?? 0), 0))}</td>
                    <td className="px-2" style={{ fontSize: 10, color: C.faint }}>billed = value − pending, where the live board still knows the money</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
    </div>
  );
}
