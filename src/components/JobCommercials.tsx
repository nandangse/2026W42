"use client";
/**
 * JOB COMMERCIALS (Dr Raghu, 2 Sep 2026) — the cash a job throws off, and
 * when: "this will help me to get a little evaluation of the cash flows that
 * can be expected from order execution. This is what we'll use for our
 * 13-week cash flow plan."
 *
 * THE ARITHMETIC, stated once so the screen cannot argue with itself.
 *
 *   Throughput = Value x T%
 *   Material   = Value x (1 - T%)
 *   Invested   = Material x Kitting%
 *   Invoice    = Value x (1 + GST%)
 *   Balance    = Invoice - Advance
 *
 *   THE BALANCE IS GST-INCLUSIVE, AND THAT IS THE POINT (Dr Raghu, 2 Sep
 *   2026: "the 60.2 is basic. It will be 60.2*1.18 where 18% is GST, hence
 *   the balance will have the GST to also add in"). Proved on the board: the
 *   two 8 BRD - TMC - Chennai jobs carry a pending figure of exactly 1.180
 *   times their value. So a balance LARGER than the bare value is normal, not
 *   a fault -- with 18% GST and nothing received it is 1.18x by definition.
 *   An earlier warning flagged exactly that as an error; it was removed
 *   before anyone saw it, because left in it would have reddened nearly every
 *   row on the page, and a warning that fires on everything is decoration.
 *
 *   With NO GST rate the invoice is the bare value and the cell is AMBER. A
 *   guessed 18% on an exempt job is a wrong number stated confidently, and
 *   this screen feeds the 13-week plan.
 *
 *   The four percentages are OF THE BALANCE, not of the value. They land on
 *   TDD + 3 days, + 30, + 60 and + 90 -- the three days being the gap between
 *   a lorry leaving and the paperwork clearing. Each lands in whichever month
 *   holds that date, which is why a job dated late in a month pays in the
 *   next one.
 *
 * WHAT THIS IS NOT: it is not a receivables ledger. It says what the ORDER
 * BOOK should throw off if it delivers on its dates and the terms are honoured
 * -- a plan to test against the bank statement, never a substitute for it.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { fmt, fmtFull, jobNo, parseISO, addDays } from "@/lib/schedule";
import { JobLightbox, type WipJob } from "./JobsInProgress";
import { monthKey, monthLabel } from "@/lib/fmt";

const C = { navy: "var(--blue)", ink: "var(--navy)", sub: "var(--muted)", line: "var(--line)", green: "var(--green)", accent: "var(--accent)", amber: "#B26A00", red: "var(--red)" };

/** The last day of the month `iso` falls in — day 0 of the next month. */
const monthEnd = (iso: string): string => {
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
};

/** The four collection buckets, and how long after the TDD each one lands. */
const BUCKETS: { key: "payPctOn" | "payPct30" | "payPct60" | "payPct90"; col: string; days: number; label: string }[] = [
  { key: "payPctOn", col: "pay_pct_on", days: 3,  label: "On delivery" },
  { key: "payPct30", col: "pay_pct_30", days: 30, label: "30 days" },
  { key: "payPct60", col: "pay_pct_60", days: 60, label: "60 days" },
  { key: "payPct90", col: "pay_pct_90", days: 90, label: "90 days" },
];

const MONTHS = 6;

export type CommJob = {
  id: string; tag: string | null; cust: string | null; fam: string | null;
  val: number; tpv: number | null; tpp: number | null;
  kit: number | null; pct: number | null; tdd: string | null;
  ownerName?: string | null; ownerInitials?: string | null;
  payOnDelivery: number | null;
  otd?: string | null; stat?: string | null; note?: string | null;
  escalation?: string | null; amtNeeded?: number | null; mandays?: string | null;
  advance?: number | null; invested?: number | null; wipLabour?: number | null; gst?: number | null;
  payPctOn?: number | null; payPct30?: number | null; payPct60?: number | null; payPct90?: number | null;
};

const cr = (n: number) =>
  n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(1)} L` : `₹${Math.round(n).toLocaleString("en-IN")}`;

/**
 * A local mapper, deliberately. Importing PlanningSuite's would be circular —
 * it imports this file — and a circular import is a blank screen in
 * production long after it built fine.
 */
const toWip = (j: CommJob): WipJob => ({
  id: j.id,
  tag: j.tag || "", cust: j.cust || "", fam: j.fam || "",
  tdd: j.tdd, otd: j.otd ?? null, stat: j.stat || "",
  val: Number(j.val) || 0, tpv: Number(j.tpv) || 0, tpp: Number(j.tpp) || 0,
  kit: Number(j.kit) || 0, pct: Number(j.pct) || 0,
  note: j.note || "", escalation: j.escalation ?? null,
  amtNeeded: j.amtNeeded ?? null, payOnDelivery: j.payOnDelivery ?? null,
  mandays: j.mandays ?? null,
  ownerInitials: j.ownerInitials ?? null,
  ownerName: j.ownerName ?? null,
});




export default function JobCommercials({
  jobs, canEdit, stratcom, reload, today,
}: {
  jobs: CommJob[]; canEdit: boolean; stratcom?: boolean; reload: () => Promise<unknown>; today: string;
}) {
  const [q, setQ] = useState("");
  /**
   * THE TDD WINDOW (Dr Raghu, 9 Sep 2026: "make a filter TDD from and to.
   * From will be default to start of month and end will be the last day").
   *
   * It opens on THIS MONTH, because that is the question this screen is
   * usually open to answer — what should be collected against what is going
   * out now. Clearing both dates puts the whole book back.
   *
   * A job with no target date cannot be inside any window and cannot be
   * outside one either. Rather than dropping it silently it is left out and
   * COUNTED under the table, because "no date" and "not due" are different
   * facts and this screen feeds a cash plan.
   */
  const [from, setFrom] = useState(() => today.slice(0, 8) + "01");
  const [to, setTo] = useState(() => monthEnd(today));
  const [busy, setBusy] = useState("");
  /**
   * ONE ROW AT A TIME (Dr Raghu, 2 Sep 2026: "keep the edit at the next of
   * the job so these data can be edited").
   *
   * Click-per-cell was fine for correcting one number; it is wrong for the
   * job this screen exists to do, which is entering a job's TERMS -- advance,
   * invested, labour and four percentages belong together, and hunting seven
   * separate cells across a wide table is how three of them get missed.
   */
  const [editing, setEditing] = useState<string | null>(null);
  /* THE TERMS LIGHTBOX (Dr Raghu, 8 Sep 2026). Stratcom's alone — the pencil
     is hidden from everyone else and /api/job-commercials refuses them too,
     because hiding a button while its endpoint stays open is not access. */
  const [terms, setTerms] = useState<CommJob | null>(null);
  const [picked, setPicked] = useState<CommJob | null>(null);

  const save = useCallback(async (id: string, field: string, value: string) => {
    setBusy(id + field);
    const r = await api.post("/api/job-field", { job_id: id, field, value });
    setBusy("");
    if (!r.ok) { window.alert(r.error || "Could not save."); return; }
    await reload();
  }, [reload]);

  // Six months from this one — the horizon he asked for, and roughly the
  // 13-week plan plus the quarter behind it.
  const months = useMemo(() => {
    const d = parseISO(today.slice(0, 8) + "01");
    return Array.from({ length: MONTHS }, (_, i) =>
      new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + i, 1)).toISOString().slice(0, 7));
  }, [today]);

  /** Jobs with no target date, so the count under the table is honest. */
  const undated = useMemo(
    () => ((from || to) ? jobs.filter((j) => !j.tdd).length : 0),
    [jobs, from, to],
  );

  const rows = useMemo(() => {
    const k = q.trim().toLowerCase();
    let list = k
      ? jobs.filter((j) => [j.id, j.tag, j.cust, j.fam, j.ownerName].some((v) => String(v ?? "").toLowerCase().includes(k)))
      : jobs;
    if (from || to) {
      list = list.filter((j) => {
        if (!j.tdd) return false;
        const d = String(j.tdd).slice(0, 10);
        return (!from || d >= from) && (!to || d <= to);
      });
    }
    return list.map((j) => {
      /**
       * THE ARITHMETIC, AS DR RAGHU SET IT OUT (2 Sep 2026):
       *
       *   Throughput = Value x T%
       *   Material   = Value x (1 - T%)
       *   Invested   = Material x Kitting%      <- DERIVED now, not typed
       *   Balance    = invoice value - Advance
       *
       * INVESTED STOPPED BEING A BOX. It was one; it is a consequence of two
       * numbers the board already keeps, and a typed copy of a derived figure
       * is a figure that goes stale the first time kitting moves.
       */
      const val = Number(j.val || 0);
      const tpc = Number(j.tpp ?? 0) / 100;
      const throughput = j.tpv != null ? Number(j.tpv) : val * tpc;
      const material = val * (1 - tpc);
      const invested = material * (Number(j.kit ?? 0) / 100);
      const adv = j.advance == null ? null : Number(j.advance);

      /**
       * BALANCE DUE. He wrote "Value * GST - Advance". Taken literally that
       * is the tax alone, so it is read as the INVOICE value -- value plus
       * GST -- less whatever has come in, which is the number a cash forecast
       * needs. He flagged it himself: "(will rewrite)". Say the word and this
       * one line changes.
       *
       * With no GST rate recorded the invoice is the value as it stands: a
       * guessed 18% on a job that is exempt is a wrong number stated
       * confidently, and this screen feeds the 13-week plan.
       */
      const gst = j.gst == null ? null : Number(j.gst);
      const invoice = val * (1 + (gst ?? 0) / 100);
      const balance = invoice - (adv ?? 0);

      const cash: Record<string, number> = {};
      if (balance > 0 && j.tdd) {
        for (const b of BUCKETS) {
          const pctv = j[b.key];
          if (pctv == null || Number(pctv) === 0) continue;
          const when = monthKey(addDays(String(j.tdd).slice(0, 10), b.days));
          cash[when] = (cash[when] || 0) + (balance * Number(pctv)) / 100;
        }
      }
      const termsPct = BUCKETS.reduce((a, b) => a + Number(j[b.key] ?? 0), 0);
      return { j, adv, gst, throughput, material, invested, invoice, balance, cash, termsPct };
    });
  }, [jobs, q, from, to]);

  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    for (const r of rows) for (const [m, v] of Object.entries(r.cash)) t[m] = (t[m] || 0) + v;
    return t;
  }, [rows]);

  const sum = (pick: (r: typeof rows[number]) => number | null) =>
    rows.reduce((a, r) => a + (pick(r) ?? 0), 0);

  return (
    <div>
      {/*
        THE TOTALS ON TOP (Dr Raghu, 2 Sep 2026: "also show the total on the
        top of the heading of all / Show number of jobs"). They follow the
        SEARCH, not the whole book: a filtered table whose totals ignore the
        filter answers a question nobody asked.
      */}
      <div className="rounded-lg border bg-white p-3 mb-3" style={{ borderColor: C.line }}>
        <div className="text-xs font-bold" style={{ color: C.sub, letterSpacing: 1.1 }}>
          {q.trim() ? `MATCHING "${q.trim().toUpperCase()}"` : "THE WHOLE ORDER BOOK"}
        </div>
        <div className="flex gap-4 flex-wrap mt-1 items-baseline">
          <Big n={`${rows.length}`} l={`job${rows.length === 1 ? "" : "s"}`} c={C.ink} />
          <Big n={cr(sum((r) => Number(r.j.val || 0)))} l="value" c={C.accent} />
          <Big n={cr(sum((r) => r.throughput))} l="throughput" c={C.green} />
          <Big n={cr(sum((r) => r.material))} l="material" c={C.sub} />
          <Big n={cr(sum((r) => r.invested))} l="invested" c={C.navy} />
          <Big n={cr(sum((r) => r.j.wipLabour ?? null))} l="WIP labour" c={C.navy} />
          <Big n={cr(sum((r) => r.adv))} l="advance in" c={C.green} />
          <Big n={cr(sum((r) => r.balance))} l="balance due" c={C.ink} />
        </div>
        <div className="flex gap-3 flex-wrap mt-2 pt-2" style={{ borderTop: `1px solid ${C.line}` }}>
          {months.map((m) => (
            <div key={m} className="text-xs">
              <span style={{ color: C.sub }}>{monthLabel(m)} </span>
              <b className="tnum" style={{ color: totals[m] ? C.green : "#D5D2C9" }}>{totals[m] ? cr(totals[m]) : "·"}</b>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-2">
        <div>
          <div className="text-xs font-bold" style={{ color: C.sub, letterSpacing: 1.1 }}>JOB COMMERCIALS</div>
          <div className="font-bold" style={{ color: C.ink, fontSize: 18 }}>
            What the order book should pay, and when
          </div>
        </div>
        <div className="ml-auto flex items-end gap-2 flex-wrap">
          {/* THE TDD WINDOW. Two dates and a way back to the whole book. */}
          <label className="text-xs" style={{ color: C.sub }}>
            <div className="font-bold" style={{ letterSpacing: .5 }}>TDD FROM</div>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="rounded border px-2 py-1 text-sm" style={{ borderColor: from ? C.accent : C.line }} />
          </label>
          <label className="text-xs" style={{ color: C.sub }}>
            <div className="font-bold" style={{ letterSpacing: .5 }}>TO</div>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="rounded border px-2 py-1 text-sm" style={{ borderColor: to ? C.accent : C.line }} />
          </label>
          <button
            onClick={() => { setFrom(today.slice(0, 8) + "01"); setTo(monthEnd(today)); }}
            className="rounded px-2 py-1 text-xs font-bold" style={{ border: `1px solid ${C.line}`, color: C.sub, background: "#fff" }}
            title="Back to this month — the 1st to the last day">This month</button>
          <button
            onClick={() => { setFrom(""); setTo(""); }}
            className="rounded px-2 py-1 text-xs font-bold" style={{ border: `1px solid ${C.line}`, color: C.sub, background: "#fff" }}
            title="Every job on the book, dated or not">All dates</button>
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search job, tag, customer, family, manager…"
            className="rounded border px-2 py-1 text-sm" style={{ borderColor: C.line, minWidth: 260 }} />
        </div>
      </div>

      {(from || to) && (
        <div className="text-xs mb-2" style={{ color: C.sub }}>
          Showing <b>{rows.length}</b> of {jobs.length} jobs — target delivery date
          {from ? <> from <b>{fmtFull(from)}</b></> : <> up to</>}
          {to ? <> to <b>{fmtFull(to)}</b></> : from ? <> onwards</> : null}.
          {undated > 0 && <> <b>{undated}</b> job{undated === 1 ? " carries" : "s carry"} no target date and cannot sit in any window — left out rather than dropped in. Press <b>All dates</b> to see them.</>}
        </div>
      )}

      <div className="text-xs mb-2" style={{ color: C.sub }}>
        The four percentages are <b>of the balance due</b>, not of the value, and land on the target delivery
        date plus 3, 30, 60 and 90 days. A job with no balance recorded, no date, or no terms contributes
        nothing to the months — it is shown as a dash rather than a zero, because
        <b> &ldquo;not known&rdquo; and &ldquo;nothing owed&rdquo; are different facts</b>.
      </div>

      {/* THE TOP ROW STAYS (Dr Raghu, 8 Sep 2026: "in job commercials freeze
          the top row"). The header cells already said `position: sticky` and
          had said so all along — but a sticky cell pins inside its nearest
          SCROLLING box, and this box only scrolled sideways. Vertically the
          page moved, so the header went up with it and there was nothing to
          hold it. Bounding the box is what gives it something to stick to,
          which is the same thing GenieTable does for every other frozen table
          in Genie. Twenty-nine columns still scroll sideways inside it. */}
      <div className="bg-white rounded-lg border" style={{ borderColor: C.line, overflow: "auto", maxHeight: "calc(100vh - 230px)" }}>
        <table className="text-xs genie-table" style={{ minWidth: 1900, borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr style={{ background: "var(--ink)", color: "#fff" }}>
              {/* TDD leads now rather than sitting nineteen columns to the
                  right: it is the column the table is filtered on, and a
                  filter whose column is off the edge of the screen is a
                  filter nobody trusts. */}
              {["Job", "", "TDD", "Customer tag", "Product type", "Value", "T %", "Throughput", "Material",
                "Kit %", "Invested", "WIP labour", "Prod %", "GST %", "Advance", "Balance due",
                "Manager"].map((h) => (
                <th key={h} className="px-2 py-2 text-left whitespace-nowrap" style={{ position: "sticky", top: 0 }}>{h}</th>
              ))}
              {BUCKETS.map((b) => (
                <th key={b.col} className="px-2 py-2 text-center whitespace-nowrap" style={{ background: "var(--navy)" }}>
                  {b.label}<div style={{ fontSize: 9, opacity: .7, fontWeight: 400 }}>TDD +{b.days}d</div>
                </th>
              ))}
              {/* Dr Raghu, 2 Sep 2026: "should total 100%". A job whose terms
                  do not is a job whose cash is either invented or lost. */}
              <th className="px-2 py-2 text-center whitespace-nowrap" style={{ background: "var(--navy)" }}>Σ</th>
              {months.map((m) => (
                <th key={m} className="px-2 py-2 text-center whitespace-nowrap" style={{ background: "#0D3B24" }}>{monthLabel(m)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ j, adv, gst, throughput, material, invested, invoice, balance, cash, termsPct }, i) => (
              <tr key={j.id} style={{ borderTop: "1px solid #EFEDE7", background: i % 2 ? "#FAF9F5" : "#fff" }}>
                {/* The number opens the job's read; the pencil opens this row. */}
                <td className="px-2 py-1 font-bold tnum whitespace-nowrap">
                  <button onClick={() => setPicked(j)} className="underline decoration-dotted" style={{ color: C.navy }}
                    title={`${j.tag || ""}${j.cust ? " · " + j.cust : ""}${j.tdd ? " · TDD " + fmtFull(j.tdd) : ""} — click for the job's read`}>
                    {jobNo(j.id)}
                  </button>
                </td>
                <td className="px-1 py-1 whitespace-nowrap">
                  {stratcom && (
                    <button onClick={() => setTerms(j)}
                      title="Enter this job's terms — value, tax, advance and how the balance comes in"
                      className="rounded px-1.5 py-0.5 text-xs font-bold"
                      style={{ color: C.navy, border: `1px solid ${C.line}`, background: "#fff" }}>
                      ✎
                    </button>
                  )}
                </td>
                <td className="px-2 py-1 whitespace-nowrap tnum" style={{ color: j.tdd && j.tdd < today ? C.red : C.ink }}>{fmt(j.tdd)}</td>
                <td className="px-2 py-1" style={{ color: C.ink, maxWidth: 240 }}>{j.tag}</td>
                <td className="px-2 py-1 whitespace-nowrap" style={{ color: C.sub }}>{j.fam}</td>
                <td className="px-2 py-1 whitespace-nowrap tnum" style={{ color: C.accent }}>{cr(Number(j.val || 0))}</td>
                <td className="px-2 py-1 text-center tnum" style={{ color: C.sub }}>{j.tpp == null ? "·" : `${Math.round(Number(j.tpp))}%`}</td>
                <td className="px-2 py-1 whitespace-nowrap tnum" style={{ color: C.green }}>{cr(throughput)}</td>
                {/* Material and Invested are DERIVED — see the note above. */}
                <td className="px-2 py-1 whitespace-nowrap tnum" style={{ color: C.sub }}
                  title="Value × (1 − T%)">{cr(material)}</td>
                <td className="px-2 py-1 text-center tnum">{j.kit == null ? "·" : `${Math.round(Number(j.kit))}%`}</td>
                <td className="px-2 py-1 whitespace-nowrap tnum" style={{ color: C.ink }}
                  title="Material × Kitting %">{cr(invested)}</td>
                <Money v={j.wipLabour ?? null} canEdit={canEdit && editing === j.id} busy={busy === j.id + "wip_labour"} onSave={(v) => save(j.id, "wip_labour", v)} />
                <td className="px-2 py-1 text-center tnum">{j.pct == null ? "·" : `${Math.round(Number(j.pct))}%`}</td>
                <Pct v={gst} canEdit={canEdit && editing === j.id} busy={busy === j.id + "gst"}
                  warn={false} onSave={(v) => save(j.id, "gst", v)} />
                <Money v={adv} canEdit={canEdit && editing === j.id} busy={busy === j.id + "advance"} onSave={(v) => save(j.id, "advance", v)} />
                <td className="px-2 py-1 whitespace-nowrap tnum font-semibold"
                  title={`Invoice ${cr(invoice)}${gst == null ? " \u2014 NO GST rate recorded, so this is the bare value" : ` = value + ${gst}% GST`}${adv ? `, less ${cr(adv)} advance` : ", nothing received yet"}`}
                  style={{ color: gst == null ? C.amber : C.ink }}>
                  {cr(balance)}{gst == null && <span title="No GST rate on this job — the invoice is the bare value"> ⚠</span>}
                </td>
                <td className="px-2 py-1 whitespace-nowrap" style={{ color: C.sub }}>{j.ownerName || j.ownerInitials || "—"}</td>
                {BUCKETS.map((b) => (
                  <Pct key={b.col} v={j[b.key] ?? null} canEdit={canEdit && editing === j.id}
                    busy={busy === j.id + b.col}
                    warn={termsPct !== 100}
                    onSave={(v) => save(j.id, b.col, v)} />
                ))}
                <td className="px-2 py-1 text-center tnum font-bold"
                  title={termsPct === 100 ? "The terms account for the whole balance"
                    : termsPct === 0 ? "No collection terms on this job — it contributes nothing to the months"
                    : `The four terms come to ${termsPct}%, not 100% — the cash is ${termsPct > 100 ? "overstated" : "understated"}`}
                  style={{ color: termsPct === 100 ? C.green : termsPct === 0 ? "#D5D2C9" : C.red }}>
                  {termsPct ? `${termsPct}%` : "·"}
                </td>
                {months.map((m) => (
                  <td key={m} className="px-2 py-1 text-center whitespace-nowrap tnum"
                    style={{ background: cash[m] ? "#E8F3E9" : "transparent", color: cash[m] ? C.green : "#D5D2C9", fontWeight: cash[m] ? 700 : 400 }}>
                    {cash[m] ? cr(cash[m]) : "·"}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={25} className="px-3 py-6 text-center" style={{ color: C.sub }}>No job matches.</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr style={{ background: "var(--navy)", color: "var(--amber)" }} className="font-bold">
              <td className="px-2 py-2" colSpan={4}>TOTAL · {rows.length} jobs</td>
              <td className="px-2 py-2 whitespace-nowrap tnum">{cr(sum((r) => Number(r.j.val || 0)))}</td>
              <td />
              <td className="px-2 py-2 whitespace-nowrap tnum">{cr(sum((r) => Number(r.j.tpv || 0)))}</td>
              <td colSpan={2} />
              <td className="px-2 py-2 whitespace-nowrap tnum">{cr(sum((r) => r.adv))}</td>
              <td className="px-2 py-2 whitespace-nowrap tnum">{cr(sum((r) => r.balance))}</td>
              <td colSpan={2} />
              <td className="px-2 py-2 whitespace-nowrap tnum">{cr(sum((r) => r.j.invested ?? null))}</td>
              <td className="px-2 py-2 whitespace-nowrap tnum">{cr(sum((r) => r.j.wipLabour ?? null))}</td>
              <td colSpan={BUCKETS.length} />
              {months.map((m) => (
                <td key={m} className="px-2 py-2 text-center whitespace-nowrap tnum" style={{ background: "#0D3B24", color: "#9BE8B8" }}>
                  {totals[m] ? cr(totals[m]) : "·"}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      {picked && (
        <JobLightbox
          job={toWip(picked)}
          V={(n: number) => cr(n)}
          colour={C.navy}
          canEdit={canEdit}
          onClose={() => setPicked(null)}
          onOpenPlan={() => { const id = picked.id; setPicked(null); window.open(`/?job=${encodeURIComponent(id)}`, "_blank"); }}
          onSaved={async () => { await reload(); }}
        />
      )}

      {terms && (
        <TermsLightbox job={terms} today={today}
          onClose={() => setTerms(null)}
          onSaved={async () => { await reload(); }} />
      )}

      <div className="text-xs mt-2" style={{ color: C.sub }}>
        This is a plan, not a ledger: it says what the order book <b>should</b> throw off if every job
        delivers on its date and every term is honoured. Test it against the bank statement — never
        instead of it.
      </div>
    </div>
  );
}

function Big({ n, l, c }: { n: string; l: string; c: string }) {
  return (
    <div>
      <div className="tnum" style={{ fontSize: 19, fontWeight: 800, color: c, lineHeight: 1.1 }}>{n}</div>
      <div className="text-xs" style={{ color: "var(--muted)" }}>{l}</div>
    </div>
  );
}

/** A money cell that becomes an input on click. Blank stays blank. */
function Money({ v, canEdit, busy, onSave }: {
  v: number | null; canEdit: boolean; busy: boolean; onSave: (val: string) => void | Promise<unknown>;
}) {
  const [edit, setEdit] = useState(false);
  const [t, setT] = useState(v == null ? "" : String(v));
  useEffect(() => { setT(v == null ? "" : String(v)); }, [v]);
  if (!canEdit) return <td className="px-2 py-1 whitespace-nowrap tnum" style={{ color: v == null ? "#D5D2C9" : "var(--navy)" }}>{v == null ? "—" : cr(v)}</td>;
  return (
    <td className="px-2 py-1 whitespace-nowrap tnum" style={{ color: v == null ? "#D5D2C9" : "var(--navy)", opacity: busy ? .5 : 1 }}>
      {edit ? (
        <input autoFocus type="number" value={t} onChange={(e) => setT(e.target.value)}
          onBlur={() => { setEdit(false); if (t !== (v == null ? "" : String(v))) void onSave(t); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setT(v == null ? "" : String(v)); setEdit(false); } }}
          className="w-24 rounded border px-1 py-0.5 text-xs" style={{ borderColor: "var(--line)" }} />
      ) : (
        <span onClick={() => setEdit(true)} className="cursor-text" title="Click to change">{v == null ? "—" : cr(v)}</span>
      )}
    </td>
  );
}

/** A percentage cell. Warns when a job's four terms do not add to 100. */
function Pct({ v, canEdit, busy, warn, onSave }: {
  v: number | null; canEdit: boolean; busy: boolean; warn: boolean; onSave: (val: string) => void | Promise<unknown>;
}) {
  const [edit, setEdit] = useState(false);
  const [t, setT] = useState(v == null ? "" : String(v));
  useEffect(() => { setT(v == null ? "" : String(v)); }, [v]);
  const shown = v == null ? "·" : `${Number(v)}%`;
  const col = warn ? "var(--red)" : v ? "var(--blue)" : "#D5D2C9";
  if (!canEdit) return <td className="px-2 py-1 text-center tnum" style={{ color: col }}>{shown}</td>;
  return (
    <td className="px-2 py-1 text-center tnum" style={{ color: col, opacity: busy ? .5 : 1 }}
      title={warn ? "This job's four terms add to more than 100% of the balance" : undefined}>
      {edit ? (
        <input autoFocus type="number" value={t} onChange={(e) => setT(e.target.value)}
          onBlur={() => { setEdit(false); if (t !== (v == null ? "" : String(v))) void onSave(t); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setT(v == null ? "" : String(v)); setEdit(false); } }}
          className="w-14 rounded border px-1 py-0.5 text-xs text-center" style={{ borderColor: "var(--line)" }} />
      ) : (
        <span onClick={() => setEdit(true)} className="cursor-text" title="Click to change">{shown}</span>
      )}
    </td>
  );
}

/**
 * ONE JOB'S TERMS, AS A DOCUMENT (Dr Raghu, 8 Sep 2026: "this edit is not
 * working! Show a lightbox to edit for each job ... its a one time exercise
 * ... this will be done by suresh. Access only to STRATCOM").
 *
 * The arithmetic runs down the page in the order he dictated it — value, tax,
 * amount, advance received, balance due — and then the balance is broken into
 * the four terms. Amount and Balance are never typed: they are Value x (1+GST)
 * and that less the advance, and a screen that lets a man type a total which
 * disagrees with its own parts is a screen that will be wrong quietly.
 *
 * EACH TERM SHOWS ITS RUPEES AND ITS DATE, because "40%" means nothing to the
 * man building a 13-week plan and "₹18.2 L on 12 Oct" is the whole point.
 */
/* Row and In live OUT HERE deliberately. Declared inside TermsLightbox they
   would be new component types on every render, so React would unmount and
   remount each input on every keystroke and the caret would jump out after a
   single character — an edit box that fights the man typing in it. */
function Row({ label, children, strong }: { label: string; children: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2" style={{ borderBottom: `1px solid ${C.line}` }}>
      <div className="text-xs" style={{ color: strong ? C.ink : C.sub, fontWeight: strong ? 700 : 600 }}>{label}</div>
      <div className="tnum" style={{ fontWeight: strong ? 800 : 600, fontSize: strong ? 15 : 13 }}>{children}</div>
    </div>
  );
}

function In({ v, set, w = 130, suffix }: { v: string; set: (s: string) => void; w?: number; suffix?: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <input type="number" value={v} onChange={(e) => set(e.target.value)} placeholder="—"
        className="rounded border px-2 py-1 text-xs text-right tnum"
        style={{ borderColor: C.line, width: w }} />
      {suffix && <span className="text-xs" style={{ color: C.sub }}>{suffix}</span>}
    </span>
  );
}

/** What /api/job-commercials answers with — see src/lib/job-margin.ts. */
type CostLine = { amount: number | null; known: boolean; from: string };
type Margin = {
  job_id: string; value: number | null;
  rm: CostLine; labour: CostLine; transport: CostLine; overheads: CostLine; other: CostLine;
  cost: number; margin: number | null; pct: number | null;
  have: number; complete: boolean; missing: string[];
};

function TermsLightbox({ job, today, onClose, onSaved }: {
  job: CommJob; today: string; onClose: () => void; onSaved: () => Promise<unknown>;
}) {
  const S = (v: unknown) => (v == null ? "" : String(v));
  const [val, setVal] = useState(S(job.val));
  const [gst, setGst] = useState(S(job.gst));
  const [adv, setAdv] = useState(S(job.advance));
  const [p, setP] = useState<Record<string, string>>({
    pay_pct_on: S(job.payPctOn), pay_pct_30: S(job.payPct30),
    pay_pct_60: S(job.payPct60), pay_pct_90: S(job.payPct90),
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  /* WHAT IT COST, AND WHAT IT THEREFORE EARNED (Dr Raghu, 9 Sep 2026). RM
     comes from the RBOM and cannot be typed; the other three are his to
     enter, which is what "we need to set this for the jobs" means. */
  const [labour, setLabour] = useState(S(job.wipLabour));
  const [transport, setTransport] = useState(S((job as unknown as Record<string, unknown>).transport));
  const [overheads, setOverheads] = useState(S((job as unknown as Record<string, unknown>).overheads));
  const [margin, setMargin] = useState<Margin | null>(null);
  useEffect(() => {
    fetch(`/api/job-commercials?id=${encodeURIComponent(job.id)}`, { cache: "no-store" })
      .then((r) => r.json()).then((j) => setMargin(j.margin ?? null)).catch(() => {});
  }, [job.id]);

  const nv = Number(val) || 0;
  const ng = gst === "" ? null : Number(gst);
  const tax = ng == null ? 0 : (nv * ng) / 100;
  const amount = nv + tax;
  const na = Number(adv) || 0;
  const balance = amount - na;
  const sum = BUCKETS.reduce((s, b) => s + (Number(p[b.col]) || 0), 0);
  const anyPct = BUCKETS.some((b) => p[b.col] !== "");

  /**
   * SAVE, AND SAY SO WHEN IT DOES NOT (Suresh, 9 Sep 2026: "taking too much to
   * save ... not saved yet").
   *
   * This had no try/catch, and `api.post` THROWS on any non-2xx — it never
   * returns { ok: false }. So a refused save skipped setBusy(false) entirely
   * and the button read "Saving..." until the page was reloaded, with the
   * reason on the floor. The `if (!r.ok)` branch below it was dead code that
   * could never run: on success there is no error, and on failure the throw
   * had already left the function.
   *
   * A button that lies about what it is doing is worse than one that fails,
   * because the man keeps waiting instead of telling somebody.
   */
  const save = async () => {
    setBusy(true); setErr("");
    try {
      const body: Record<string, unknown> = {
        job_id: job.id, val, gst, advance: adv,
        wip_labour: labour, transport, overheads,
        ...Object.fromEntries(BUCKETS.map((b) => [b.col, p[b.col]])),
      };
      const out = await api.post("/api/job-commercials", body) as { margin?: Margin };
      if (out?.margin) setMargin(out.margin);
      await onSaved();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(22,35,47,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="rounded-lg bg-white"
        style={{ width: "min(620px, 100%)", maxHeight: "calc(100vh - 40px)", display: "flex", flexDirection: "column", boxShadow: "0 12px 40px rgba(27,45,107,.35)" }}>
        <div className="flex items-center justify-between px-4 py-2.5" style={{ background: "var(--navy)", borderRadius: "8px 8px 0 0" }}>
          <div className="text-white font-bold text-sm">
            {jobNo(job.id)} · terms
            <span style={{ fontWeight: 400, opacity: .8 }}> — {job.tag || job.cust || ""}</span>
          </div>
          <button onClick={onClose} className="text-white font-bold px-2">✕</button>
        </div>

        <div className="px-4 py-3" style={{ overflowY: "auto" }}>
          {err && <div className="rounded p-2 mb-2 text-xs" style={{ background: "#FBEAE8", color: "#8E2C20" }}>{err}</div>}

          <Row label="Value"><In v={val} set={setVal} /></Row>
          <Row label="Tax"><In v={gst} set={setGst} w={64} suffix="%" /> <span style={{ marginLeft: 8, color: C.sub }}>{ng == null ? "no rate on this job" : cr(tax)}</span></Row>
          <Row label="Amount" strong>{cr(amount)}</Row>
          <Row label="Advance received"><In v={adv} set={setAdv} /></Row>
          <Row label="Balance due" strong>{cr(balance)}</Row>

          {/* ── WHAT IT COST, AND WHAT IT EARNED ──────────────────────────
              RM is read from the RBOM and cannot be typed here: the BOM is
              where that number is decided, and a second copy typed on this
              screen would be the one that goes stale. */}
          <div className="text-xs font-bold mt-3 mb-1" style={{ color: C.sub, letterSpacing: .6 }}>
            WHAT IT COST
          </div>
          <div className="flex items-center justify-between gap-3 py-2" style={{ borderBottom: `1px solid ${C.line}` }}>
            <div className="text-xs" style={{ color: C.sub, fontWeight: 600 }}>
              Raw material <span style={{ color: "#B9B5AA" }}>· from the RBOM, not typed</span>
            </div>
            <div className="tnum" style={{ fontWeight: 600 }}>
              {margin?.rm.known
                ? <span>{cr(margin.rm.amount ?? 0)} <span style={{ color: C.sub, fontWeight: 400, fontSize: 11 }}>{margin.rm.from}</span></span>
                : <span style={{ color: "#B26A00", fontSize: 12, fontWeight: 600 }}>{margin?.rm.from ?? "…"}</span>}
            </div>
          </div>
          <Row label="Labour"><In v={labour} set={setLabour} /></Row>
          <Row label="Transport"><In v={transport} set={setTransport} /></Row>
          <Row label="Overheads"><In v={overheads} set={setOverheads} /></Row>
          <div className="flex items-center justify-between gap-3 py-2" style={{ borderBottom: `1px solid ${C.line}` }}>
            <div className="text-xs" style={{ color: C.sub, fontWeight: 600 }}>Claims &amp; other</div>
            <div className="tnum" style={{ fontWeight: 600 }}>
              {margin?.other.known
                ? <span>{cr(margin.other.amount ?? 0)} <span style={{ color: C.sub, fontWeight: 400, fontSize: 11 }}>{margin.other.from}</span></span>
                : <span style={{ color: C.sub, fontSize: 12 }}>none recorded</span>}
            </div>
          </div>

          {margin && (
            <div className="rounded p-2 mt-2" style={{
              background: margin.complete ? "#EAF5EC" : "#FDF0E7",
              border: `1px solid ${margin.complete ? "#BFDCC6" : "#F0C9A8"}`,
            }}>
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold" style={{ color: margin.complete ? C.green : "#8A4520" }}>
                  GROSS MARGIN
                </div>
                <div className="tnum" style={{ fontWeight: 800, fontSize: 17, color: margin.complete ? C.green : "#8A4520" }}>
                  {margin.margin == null ? "—" : cr(margin.margin)}
                  {margin.pct != null && <span style={{ fontSize: 13, fontWeight: 700 }}> · {margin.pct}%</span>}
                </div>
              </div>
              {/* THE COUNT BESIDE THE NUMBER. A margin worked out from one of
                  five costs reports a magnificent profit — which is the exact
                  fault found in the ERP's own gross_margin. It is not hidden
                  and it is not rounded away. */}
              <div className="text-xs mt-1" style={{ color: margin.complete ? C.green : "#8A4520" }}>
                {margin.complete
                  ? "All five costs are in — this figure is complete."
                  : <><b>{margin.have} of 5 costs are in.</b> Not yet counted: {margin.missing.join(", ")}. Until they are, this reads higher than the truth.</>}
              </div>
            </div>
          )}

          <div className="text-xs font-bold mt-3 mb-1" style={{ color: C.sub, letterSpacing: .6 }}>
            HOW THE BALANCE COMES IN — as a % of {cr(balance)}
          </div>
          {BUCKETS.map((b) => {
            const pct = Number(p[b.col]) || 0;
            const when = job.tdd ? addDays(job.tdd, b.days) : null;
            return (
              <div key={b.col} className="flex items-center justify-between gap-3 py-1.5" style={{ borderBottom: `1px solid ${C.line}` }}>
                <div className="text-xs" style={{ color: C.sub, fontWeight: 600 }}>
                  {b.label}
                  <span style={{ color: "#B9B5AA" }}> · TDD +{b.days}d{when ? ` · ${fmt(when)}` : " · no target date"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="tnum text-xs" style={{ color: pct ? C.green : "#D5D2C9", minWidth: 78, textAlign: "right" }}>
                    {pct ? cr((balance * pct) / 100) : "—"}
                  </span>
                  <In v={p[b.col]} set={(s) => setP((x) => ({ ...x, [b.col]: s }))} w={64} suffix="%" />
                </div>
              </div>
            );
          })}
          <div className="flex items-center justify-between py-2 text-xs font-bold">
            <span style={{ color: C.sub }}>Total</span>
            <span className="tnum" style={{ color: !anyPct ? C.sub : Math.round(sum) === 100 ? C.green : C.red }}>
              {!anyPct ? "not entered yet" : `${Math.round(sum)}%${Math.round(sum) === 100 ? "" : " — must be 100"}`}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-2.5" style={{ borderTop: `1px solid ${C.line}` }}>
          <button onClick={onClose} className="rounded px-3 py-1.5 text-sm font-bold" style={{ background: "var(--line-soft)", color: "var(--dim)" }}>Cancel</button>
          <button onClick={() => void save()} disabled={busy || (anyPct && Math.round(sum) !== 100)}
            className="rounded px-4 py-1.5 text-sm font-bold text-white"
            style={{ background: busy || (anyPct && Math.round(sum) !== 100) ? "#9AA3B2" : "var(--green)" }}>
            {busy ? "Saving…" : "Save terms"}
          </button>
        </div>
      </div>
    </div>
  );
}
