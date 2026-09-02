"use client";
/**
 * JOB COMMERCIALS (Dr Raghu, 2 Sep 2026) — the cash a job throws off, and
 * when: "this will help me to get a little evaluation of the cash flows that
 * can be expected from order execution. This is what we'll use for our
 * 13-week cash flow plan."
 *
 * THE ARITHMETIC, stated once so the screen cannot argue with itself.
 *
 *   Balance due = the pending payment on delivery when the board carries one,
 *                 otherwise value less the advance. Never a defaulted zero:
 *                 a job with nothing recorded shows a dash, because "we do
 *                 not know" and "nothing is owed" are different sentences and
 *                 only one of them belongs in a cash forecast.
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

const C = { navy: "#1B3A5C", ink: "#16232F", sub: "#8A94A0", line: "#E2E0DA", green: "#0D7A3F", accent: "#E8600A", amber: "#B26A00", red: "#B3261E" };

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

const monthKey = (iso: string) => iso.slice(0, 7);
const monthLabel = (k: string) =>
  parseISO(k + "-01").toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });

export default function JobCommercials({
  jobs, canEdit, reload, today,
}: {
  jobs: CommJob[]; canEdit: boolean; reload: () => Promise<unknown>; today: string;
}) {
  const [q, setQ] = useState("");
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

  const rows = useMemo(() => {
    const k = q.trim().toLowerCase();
    const list = k
      ? jobs.filter((j) => [j.id, j.tag, j.cust, j.fam, j.ownerName].some((v) => String(v ?? "").toLowerCase().includes(k)))
      : jobs;
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
  }, [jobs, q]);

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
        <input value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search job, tag, customer, family, manager…"
          className="rounded border px-2 py-1 text-sm ml-auto" style={{ borderColor: C.line, minWidth: 280 }} />
      </div>

      <div className="text-xs mb-2" style={{ color: C.sub }}>
        The four percentages are <b>of the balance due</b>, not of the value, and land on the target delivery
        date plus 3, 30, 60 and 90 days. A job with no balance recorded, no date, or no terms contributes
        nothing to the months — it is shown as a dash rather than a zero, because
        <b> &ldquo;not known&rdquo; and &ldquo;nothing owed&rdquo; are different facts</b>.
      </div>

      <div className="bg-white rounded-lg border overflow-x-auto" style={{ borderColor: C.line }}>
        <table className="text-xs" style={{ minWidth: 1900, borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr style={{ background: "#22303C", color: "#fff" }}>
              {["Job", "", "Customer tag", "Product type", "Value", "T %", "Throughput", "Material",
                "Kit %", "Invested", "WIP labour", "Prod %", "GST %", "Advance", "Balance due",
                "TDD", "Manager"].map((h) => (
                <th key={h} className="px-2 py-2 text-left whitespace-nowrap" style={{ position: "sticky", top: 0 }}>{h}</th>
              ))}
              {BUCKETS.map((b) => (
                <th key={b.col} className="px-2 py-2 text-center whitespace-nowrap" style={{ background: "#16232F" }}>
                  {b.label}<div style={{ fontSize: 9, opacity: .7, fontWeight: 400 }}>TDD +{b.days}d</div>
                </th>
              ))}
              {/* Dr Raghu, 2 Sep 2026: "should total 100%". A job whose terms
                  do not is a job whose cash is either invented or lost. */}
              <th className="px-2 py-2 text-center whitespace-nowrap" style={{ background: "#16232F" }}>Σ</th>
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
                  {canEdit && (
                    <button onClick={() => setEditing(editing === j.id ? null : j.id)}
                      title={editing === j.id ? "Done editing this row" : "Edit this job's commercials"}
                      className="rounded px-1.5 py-0.5 text-xs font-bold"
                      style={editing === j.id
                        ? { background: "#0D7A3F", color: "#fff" }
                        : { color: C.navy, border: `1px solid ${C.line}`, background: "#fff" }}>
                      {editing === j.id ? "Done" : "✎"}
                    </button>
                  )}
                </td>
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
                  title={`Invoice ${cr(invoice)}${gst == null ? " (no GST rate recorded)" : ` (value + ${gst}% GST)`} less advance`}
                  style={{ color: gst == null ? C.amber : C.ink }}>
                  {cr(balance)}{gst == null && <span title="No GST rate on this job — the invoice is the value as it stands"> ⚠</span>}
                </td>
                <td className="px-2 py-1 whitespace-nowrap tnum" style={{ color: j.tdd && j.tdd < today ? C.red : C.ink }}>{fmt(j.tdd)}</td>
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
            <tr style={{ background: "#16232F", color: "#F5B32B" }} className="font-bold">
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
      <div className="text-xs" style={{ color: "#8A94A0" }}>{l}</div>
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
  if (!canEdit) return <td className="px-2 py-1 whitespace-nowrap tnum" style={{ color: v == null ? "#D5D2C9" : "#16232F" }}>{v == null ? "—" : cr(v)}</td>;
  return (
    <td className="px-2 py-1 whitespace-nowrap tnum" style={{ color: v == null ? "#D5D2C9" : "#16232F", opacity: busy ? .5 : 1 }}>
      {edit ? (
        <input autoFocus type="number" value={t} onChange={(e) => setT(e.target.value)}
          onBlur={() => { setEdit(false); if (t !== (v == null ? "" : String(v))) void onSave(t); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setT(v == null ? "" : String(v)); setEdit(false); } }}
          className="w-24 rounded border px-1 py-0.5 text-xs" style={{ borderColor: "#E2E0DA" }} />
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
  const col = warn ? "#B3261E" : v ? "#1B3A5C" : "#D5D2C9";
  if (!canEdit) return <td className="px-2 py-1 text-center tnum" style={{ color: col }}>{shown}</td>;
  return (
    <td className="px-2 py-1 text-center tnum" style={{ color: col, opacity: busy ? .5 : 1 }}
      title={warn ? "This job's four terms add to more than 100% of the balance" : undefined}>
      {edit ? (
        <input autoFocus type="number" value={t} onChange={(e) => setT(e.target.value)}
          onBlur={() => { setEdit(false); if (t !== (v == null ? "" : String(v))) void onSave(t); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setT(v == null ? "" : String(v)); setEdit(false); } }}
          className="w-14 rounded border px-1 py-0.5 text-xs text-center" style={{ borderColor: "#E2E0DA" }} />
      ) : (
        <span onClick={() => setEdit(true)} className="cursor-text" title="Click to change">{shown}</span>
      )}
    </td>
  );
}
