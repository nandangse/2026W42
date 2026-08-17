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
  totalsOf, averagePerMonth, byMonth, byFamily, byCustomer, otdFor, coveredMonths, throughputOf,
  type DeliveredJob, type PeriodKey, type Totals, type Bucket,
} from "@/lib/delivered";
import { today, fmt, fmtFull, lakh } from "@/lib/schedule";

const TODAY = today();

/** Shown on hover over the OTD card — the formula, in words. */
const OTD_FORMULA = [
  "OTD % = jobs delivered on or before their promised date",
  "        ÷ jobs delivered in the period that carry a promised date",
  "",
  "The promise is the OTD Date given to the customer; where that is blank the",
  "Committed Delivery Date is used instead.",
  "",
  "A job with no promised date is NOT counted as late — it is excluded and",
  "reported separately, because a missing date is a record-keeping gap rather",
  "than a delivery failure.",
  "",
  "Only jobs DELIVERED inside the chosen period are counted, by their actual",
  "delivery date.",
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
  const undatedRows = useMemo(() => undated(rows), [rows]);

  const ytd = useMemo(
    () => averagePerMonth(rows, fyStart(TODAY), TODAY, earliest, coveredMonths(fyStart(TODAY), TODAY, null)),
    [rows, earliest],
  );
  const m12 = useMemo(() => {
    const r = rangeFor("m12", TODAY, earliest);
    return averagePerMonth(rows, r.from, r.to, earliest, 12);
  }, [rows, earliest]);

  const months = useMemo(() => byMonth(rows, from, to), [rows, from, to]);
  const families = useMemo(() => byFamily(rows, from, to), [rows, from, to]);
  const customers = useMemo(() => byCustomer(rows, from, to), [rows, from, to]);
  const otd = useMemo(() => otdFor(rows, from, to), [rows, from, to]);
  const famOptions = useMemo(() => byFamily(all, "0000-01-01", "9999-12-31"), [all]);

  if (state === "loading") return <div className="p-8 text-sm" style={{ color: C.mute }}>Loading the delivery ledger…</div>;
  if (state === "not_installed") return <NotInstalled />;
  if (state === "error") return <div className="p-8 text-sm" style={{ color: C.red }}>{err}</div>;
  if (!data) return null;

  if (!all.length) return <NoData lastUpload={data.lastUpload} />;

  // Months newest-first: the current month is what anyone opens this to see,
  // and scrolling to the bottom for it gets old immediately.
  const cuts = cut === "month" ? [...months].reverse() : cut === "family" ? families : customers;
  const cutMax = Math.max(1, ...cuts.map((b) => b.value));

  return (
    <div className="p-4">
      {/* ===== header ===== */}
      <div className="flex items-center gap-3 flex-wrap mb-3">
        <div>
          <div className="text-xs font-bold" style={{ color: C.mute, letterSpacing: 1.4 }}>
            DELIVERED JOBS · {fyLabel(TODAY)}
          </div>
          <div className="text-lg font-bold" style={{ color: C.ink, lineHeight: 1.2 }}>
            What actually went out of the door
          </div>
        </div>
        <div className="flex-1" style={{ minWidth: 20 }} />
        <div className="text-xs text-right" style={{ color: C.mute, lineHeight: 1.5 }}>
          {dated(all).length} dated · {undatedRows.length} undated · on record from{" "}
          <b style={{ color: C.sub }}>{earliest ? fmtFull(earliest) : "—"}</b> to{" "}
          <b style={{ color: C.sub }}>{latest ? fmtFull(latest) : "—"}</b>
          {data.lastUpload && (
            <div style={{ color: C.faint }}>
              report last loaded {fmtFull(String(data.lastUpload).slice(0, 10))}
            </div>
          )}
        </div>
      </div>

      {/* ===== period controls ===== */}
      <div className="rounded-lg border bg-white p-2.5 mb-3" style={{ borderColor: C.line }}>
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
        <div className="text-xs mt-1.5" style={{ color: C.faint }}>
          {period === "custom" ? "Custom range" : PERIODS.find((p) => p.key === period)?.note} ·{" "}
          {fmtFull(from)} → {fmtFull(to)}
          {period === "qtd" && ` · ${fqLabel(TODAY)}`}
          {fam && ` · ${fam} only`}
        </div>
      </div>

      {/* ===== the three headline numbers ===== */}
      <div className="flex gap-2 flex-wrap mb-3">
        <Headline label="Nos" value={String(totals.nos)} note={`job${totals.nos === 1 ? "" : "s"} delivered in the period`} color={C.navy} />
        <Headline label="Value" value={V(totals.value)} note="order value of those jobs" color={C.accent} />
        <Headline label="Throughput" value={V(totals.throughput)} note="Throughput Expected Value (Auto)" color={C.green} />
      </div>

      {/* ===== averages, and the honesty about them ===== */}
      <div className="flex gap-2 flex-wrap mb-3">
        <AverageCard title={`YTD monthly average · since 1 Apr`} avg={ytd} V={V} />
        <AverageCard title="12-month monthly average" avg={m12} V={V} />
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
                <span className="tnum font-bold" style={{ fontSize: 26, color: otd.pct >= 80 ? C.green : otd.pct >= 50 ? C.amber : C.red }}>
                  {Math.round(otd.pct)}%
                </span>
                <span className="text-xs tnum" style={{ color: C.mute }}>{otd.onTime}/{otd.measurable}</span>
              </div>
              <div className="mt-1" style={{ height: 7, background: "#EFEDE7", borderRadius: 2, overflow: "hidden" }}>
                <div style={{
                  width: `${Math.max(0, Math.min(100, otd.pct))}%`, height: 7,
                  background: otd.pct >= 80 ? C.green : otd.pct >= 50 ? C.amber : C.red,
                }} />
              </div>
              <div className="text-xs mt-1" style={{ color: C.sub, lineHeight: 1.45 }}>
                Delivered on or before the <b>OTD Date</b> promised to the customer.
                {otd.late > 0 && otd.avgDaysLate != null && (
                  <> The {otd.late} late {otd.late === 1 ? "one ran" : "ones ran"} <b>{otd.avgDaysLate} days</b> over on average.</>
                )}
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
      {undatedRows.length > 0 && (
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
      <div className="rounded-lg border bg-white mb-3" style={{ borderColor: C.line, overflow: "hidden" }}>
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
                <th className="text-left px-3 py-1.5 font-bold">{cut === "month" ? "MONTH" : cut === "family" ? "FAMILY" : "CUSTOMER"}</th>
                <th className="text-right px-2 py-1.5 font-bold">NOS</th>
                <th className="text-right px-2 py-1.5 font-bold">VALUE</th>
                <th className="text-right px-2 py-1.5 font-bold">THROUGHPUT</th>
                <th className="px-3 py-1.5" style={{ width: "34%" }} />
              </tr>
            </thead>
            <tbody>
              {cuts.map((b) => (
                <tr key={b.key} style={{ borderBottom: `1px solid ${C.line}` }}>
                  <td className="px-3 py-1.5 font-semibold" style={{ color: b.nos ? C.ink : C.faint }}>{b.label}</td>
                  <td className="text-right px-2 py-1.5 tnum" style={{ color: b.nos ? C.body : C.faint }}>{b.nos || "—"}</td>
                  <td className="text-right px-2 py-1.5 tnum" style={{ color: b.nos ? C.body : C.faint }}>{b.nos ? V(b.value) : "—"}</td>
                  <td className="text-right px-2 py-1.5 tnum" style={{ color: b.nos ? C.green : C.faint }}>{b.nos ? V(b.throughput) : "—"}</td>
                  <td className="px-3 py-1.5">
                    <div style={{ height: 8, background: "#EFEDE7", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ width: `${(b.value / cutMax) * 100}%`, height: 8, background: cut === "month" ? C.navy : C.violet }} />
                    </div>
                  </td>
                </tr>
              ))}
              {cuts.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-6 text-center" style={{ color: C.mute }}>Nothing delivered in this period.</td></tr>
              )}
            </tbody>
            {cuts.length > 0 && (
              <tfoot>
                <tr style={{ background: C.panel, fontWeight: 700 }}>
                  <td className="px-3 py-1.5" style={{ color: C.ink }}>Total</td>
                  <td className="text-right px-2 py-1.5 tnum" style={{ color: C.ink }}>{totals.nos}</td>
                  <td className="text-right px-2 py-1.5 tnum" style={{ color: C.ink }}>{V(totals.value)}</td>
                  <td className="text-right px-2 py-1.5 tnum" style={{ color: C.green }}>{V(totals.throughput)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* ===== the jobs themselves ===== */}
      <JobTable rows={inWindow} V={V} />
    </div>
  );
}

// ===========================================================================
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
function AverageCard({ title, avg, V }: { title: string; avg: ReturnType<typeof averagePerMonth>; V: (n: number) => string }) {
  return (
    <div className="rounded-lg border bg-white p-3" style={{ borderColor: C.line, flex: "1 1 0", minWidth: 250 }}>
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
              {["DELIVERED", "TAG", "CUSTOMER", "FAMILY", "TARGET", "VS TARGET", "VALUE", "THROUGHPUT"].map((h, i) => (
                <th key={h} className={`px-2 py-1.5 font-bold ${i >= 6 ? "text-right" : "text-left"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, limit).map((j) => {
              const slip = j.tdd && j.delivered_on
                ? Math.round((Date.parse(j.delivered_on) - Date.parse(j.tdd)) / 86400000)
                : null;
              return (
                <tr key={j.id} style={{ borderBottom: `1px solid ${C.line}` }}>
                  <td className="px-2 py-1.5 tnum font-semibold" style={{ color: C.ink }}>{fmt(j.delivered_on)}</td>
                  <td className="px-2 py-1.5" style={{ color: C.body }}>{j.tag || j.id}</td>
                  <td className="px-2 py-1.5 truncate" style={{ color: C.sub, maxWidth: 190 }}>{j.cust}</td>
                  <td className="px-2 py-1.5" style={{ color: C.sub }}>{j.fam || "—"}</td>
                  <td className="px-2 py-1.5 tnum" style={{ color: C.faint }}>{fmt(j.tdd)}</td>
                  <td className="px-2 py-1.5 tnum" style={{ color: slip == null ? C.faint : slip <= 0 ? C.green : C.red }}>
                    {slip == null ? "—" : slip === 0 ? "on the day" : slip < 0 ? `${-slip}d early` : `${slip}d late`}
                  </td>
                  <td className="px-2 py-1.5 tnum text-right" style={{ color: C.body }}>{V(j.val)}</td>
                  <td className="px-2 py-1.5 tnum text-right" style={{ color: C.green }}>{V(throughputOf(j))}</td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center" style={{ color: C.mute }}>Nothing delivered in this period.</td></tr>
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
          A delivered-jobs file was loaded on {fmtFull(String(lastUpload).slice(0, 10))} but produced no rows — worth
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
