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
import { fmt, jobNo, parseISO, addDays } from "@/lib/schedule";

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
  advance?: number | null; invested?: number | null; wipLabour?: number | null;
  payPctOn?: number | null; payPct30?: number | null; payPct60?: number | null; payPct90?: number | null;
};

const cr = (n: number) =>
  n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(1)} L` : `₹${Math.round(n).toLocaleString("en-IN")}`;

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
      const adv = j.advance == null ? null : Number(j.advance);
      // The board's own pending figure wins; value-less-advance is the
      // fallback, and both may be genuinely unknown.
      const balance = j.payOnDelivery != null ? Number(j.payOnDelivery)
        : adv != null ? Math.max(0, Number(j.val || 0) - adv)
        : null;
      const cash: Record<string, number> = {};
      if (balance != null && j.tdd) {
        for (const b of BUCKETS) {
          const pctv = j[b.key];
          if (pctv == null || Number(pctv) === 0) continue;
          const when = monthKey(addDays(String(j.tdd).slice(0, 10), b.days));
          cash[when] = (cash[when] || 0) + (balance * Number(pctv)) / 100;
        }
      }
      const termsPct = BUCKETS.reduce((a, b) => a + Number(j[b.key] ?? 0), 0);
      return { j, adv, balance, cash, termsPct };
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
              {["Job", "Customer tag", "Product type", "Value", "T %", "Throughput", "Kit %", "Prod %",
                "Advance", "Balance due", "TDD", "Manager", "Invested", "WIP labour"].map((h) => (
                <th key={h} className="px-2 py-2 text-left whitespace-nowrap" style={{ position: "sticky", top: 0 }}>{h}</th>
              ))}
              {BUCKETS.map((b) => (
                <th key={b.col} className="px-2 py-2 text-center whitespace-nowrap" style={{ background: "#16232F" }}>
                  {b.label}<div style={{ fontSize: 9, opacity: .7, fontWeight: 400 }}>TDD +{b.days}d</div>
                </th>
              ))}
              {months.map((m) => (
                <th key={m} className="px-2 py-2 text-center whitespace-nowrap" style={{ background: "#0D3B24" }}>{monthLabel(m)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ j, adv, balance, cash, termsPct }, i) => (
              <tr key={j.id} style={{ borderTop: "1px solid #EFEDE7", background: i % 2 ? "#FAF9F5" : "#fff" }}>
                <td className="px-2 py-1 font-bold tnum whitespace-nowrap" style={{ color: C.navy }}>{jobNo(j.id)}</td>
                <td className="px-2 py-1" style={{ color: C.ink, maxWidth: 240 }}>{j.tag}</td>
                <td className="px-2 py-1 whitespace-nowrap" style={{ color: C.sub }}>{j.fam}</td>
                <td className="px-2 py-1 whitespace-nowrap tnum" style={{ color: C.accent }}>{cr(Number(j.val || 0))}</td>
                <td className="px-2 py-1 text-center tnum" style={{ color: C.sub }}>{j.tpp == null ? "·" : `${Math.round(Number(j.tpp))}%`}</td>
                <td className="px-2 py-1 whitespace-nowrap tnum" style={{ color: C.green }}>{cr(Number(j.tpv || 0))}</td>
                <td className="px-2 py-1 text-center tnum">{j.kit == null ? "·" : `${Math.round(Number(j.kit))}%`}</td>
                <td className="px-2 py-1 text-center tnum">{j.pct == null ? "·" : `${Math.round(Number(j.pct))}%`}</td>
                <Money v={adv} canEdit={canEdit} busy={busy === j.id + "advance"} onSave={(v) => save(j.id, "advance", v)} />
                <td className="px-2 py-1 whitespace-nowrap tnum font-semibold" style={{ color: balance == null ? "#D5D2C9" : C.ink }}>
                  {balance == null ? "—" : cr(balance)}
                </td>
                <td className="px-2 py-1 whitespace-nowrap tnum" style={{ color: j.tdd && j.tdd < today ? C.red : C.ink }}>{fmt(j.tdd)}</td>
                <td className="px-2 py-1 whitespace-nowrap" style={{ color: C.sub }}>{j.ownerName || j.ownerInitials || "—"}</td>
                <Money v={j.invested ?? null} canEdit={canEdit} busy={busy === j.id + "invested"} onSave={(v) => save(j.id, "invested", v)} />
                <Money v={j.wipLabour ?? null} canEdit={canEdit} busy={busy === j.id + "wip_labour"} onSave={(v) => save(j.id, "wip_labour", v)} />
                {BUCKETS.map((b) => (
                  <Pct key={b.col} v={j[b.key] ?? null} canEdit={canEdit}
                    busy={busy === j.id + b.col}
                    warn={termsPct > 100}
                    onSave={(v) => save(j.id, b.col, v)} />
                ))}
                {months.map((m) => (
                  <td key={m} className="px-2 py-1 text-center whitespace-nowrap tnum"
                    style={{ background: cash[m] ? "#E8F3E9" : "transparent", color: cash[m] ? C.green : "#D5D2C9", fontWeight: cash[m] ? 700 : 400 }}>
                    {cash[m] ? cr(cash[m]) : "·"}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={24} className="px-3 py-6 text-center" style={{ color: C.sub }}>No job matches.</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr style={{ background: "#16232F", color: "#F5B32B" }} className="font-bold">
              <td className="px-2 py-2" colSpan={3}>TOTAL · {rows.length} jobs</td>
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

      <div className="text-xs mt-2" style={{ color: C.sub }}>
        This is a plan, not a ledger: it says what the order book <b>should</b> throw off if every job
        delivers on its date and every term is honoured. Test it against the bank statement — never
        instead of it.
      </div>
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
