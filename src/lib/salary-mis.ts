/**
 * THE SALARY MIS (Dr Raghu, 7 Oct 2026: "Generate a document just like this
 * next to the salary register, which will showcase, for 3 months, what all
 * the heads were … correlated with the deliveries done in those months:
 * number of deliveries, value of the deliveries, throughput generated …
 * Act like the world's best CHRO … It will also be part of the salary
 * register that is going to be printed and kept on record.")
 *
 * Pure: three months of register rows in, one picture out — every head by
 * month, the people behind the money, what the factory delivered in the
 * same months, and the ratios a CHRO reads first: salary as a share of the
 * value delivered, salary per delivery, throughput earned per rupee of
 * salary, cost per head and per attendance day. Then the commentary, in
 * plain sentences built from the numbers themselves. A head a month's sheet
 * never carried prints as a dash, not as a nought.
 */
import type { SheetRow } from "@/lib/salary-sheet";
import { isLabour, MONTHS } from "@/lib/salary-sheet";

export interface MisRun { month: number; year: number; status: string; rows: SheetRow[]; generated_at?: string | null }
export interface MisDelivery { ym: string; n: number; value: number; tp: number }

export interface MisHead { key: string; label: string; group: "people" | "attendance" | "earning" | "deduction" | "net" | "delivery" | "ratio"; values: (number | null)[]; money: boolean; decimals?: number; pct?: boolean }
export interface Mis {
  months: { ym: string; label: string; status: string }[];
  heads: MisHead[];
  commentary: string[];
  earnParts: { key: string; label: string; values: (number | null)[] }[];
}

const r0 = (n: number) => Math.round(n);
const ym = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;
const sumOf = (rows: SheetRow[], key: string): number | null => {
  let any = false, s = 0;
  for (const r of rows) {
    const v = (r as unknown as Record<string, unknown>)[key];
    if (v == null || typeof v === "string") continue;
    any = true; s += Number(v) || 0;
  }
  return any ? s : null;
};
const lakh = (n: number) => (Math.abs(n) >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : Math.abs(n) >= 1e5 ? `₹${(n / 1e5).toFixed(2)} L` : `₹${Math.round(n).toLocaleString("en-IN")}`);
const pct = (a: number | null, b: number | null) => (a == null || b == null || !b ? null : (a / b) * 100);
const delta = (cur: number | null, prev: number | null) => (cur == null || prev == null || !prev ? null : ((cur - prev) / Math.abs(prev)) * 100);

export const EARN_HEADS: [string, string][] = [
  ["basic_da", "Basic & DA"], ["hra", "HRA"], ["fixed_allowance", "Fixed allowance"], ["conveyance", "Conveyance"], ["medical", "Medical"],
  ["ot_pay", "Overtime"], ["site_allowance", "Site allowance"], ["compoff_amt", "Comp-off"], ["encash_amt", "Leave encashment"], ["arrears", "Arrears"],
];
export const DED_HEADS: [string, string][] = [
  ["pf", "PF"], ["pt", "PT"], ["esi", "ESI"], ["loan", "Loan"], ["advance", "Advance"], ["tds", "TDS"], ["lunch", "Lunch"], ["late_ded", "Late"], ["other_ded", "Other"],
];

export function buildMis(runs: MisRun[], deliveries: MisDelivery[]): Mis {
  const ordered = [...runs].sort((a, b) => a.year - b.year || a.month - b.month).slice(-3);
  const months = ordered.map((r) => ({ ym: ym(r.year, r.month), label: `${MONTHS[r.month - 1].slice(0, 3)} ${r.year}`, status: r.status }));
  const byYm = new Map(deliveries.map((d) => [d.ym, d]));
  const cols = ordered.map((run) => {
    const rows = run.rows || [];
    const staff = rows.filter((r) => !isLabour(r.type));
    const labour = rows.filter((r) => isLabour(r.type));
    const held = rows.filter((r) => r.hold);
    const earned = sumOf(rows, "earned"), ded = sumOf(rows, "deductions"), net = sumOf(rows, "net");
    const attendance = sumOf(rows, "attendance") ?? sumOf(rows, "present");
    const paidDays = sumOf(rows, "paid_days");
    const d = byYm.get(ym(run.year, run.month));
    return { rows, staff, labour, held, earned, ded, net, attendance, paidDays, d,
      zero: rows.filter((r) => Number((r as unknown as Record<string, unknown>).attendance ?? (r as unknown as Record<string, unknown>).present ?? 1) === 0).length };
  });
  const head = (key: string, label: string, group: MisHead["group"], values: (number | null)[], money = true, extra: Partial<MisHead> = {}): MisHead => ({ key, label, group, values, money, ...extra });
  const heads: MisHead[] = [
    head("people", "People on the register", "people", cols.map((c) => c.rows.length), false),
    head("staff", "— staff", "people", cols.map((c) => c.staff.length), false),
    head("labour", "— labour", "people", cols.map((c) => c.labour.length), false),
    head("held", "— on hold", "people", cols.map((c) => c.held.length), false),
    head("zero", "— with no attendance", "people", cols.map((c) => c.zero), false),
    head("attendance", "Attendance days", "attendance", cols.map((c) => c.attendance), false),
    head("paid_days", "Paid days", "attendance", cols.map((c) => c.paidDays), false, { decimals: 1 }),
    head("att_per_head", "Attendance days per head", "attendance", cols.map((c) => (c.attendance == null || !c.rows.length ? null : c.attendance / c.rows.length)), false, { decimals: 1 }),
    ...EARN_HEADS.map(([k, l]) => head(k, l, "earning", cols.map((c) => sumOf(c.rows, k)))),
    head("earned", "TOTAL EARNED", "earning", cols.map((c) => c.earned)),
    ...DED_HEADS.map(([k, l]) => head(k, l, "deduction", cols.map((c) => sumOf(c.rows, k)))),
    head("deductions", "TOTAL DEDUCTIONS", "deduction", cols.map((c) => c.ded)),
    head("net", "NET PAYABLE", "net", cols.map((c) => c.net)),
    head("withheld", "— of which withheld (on hold)", "net", cols.map((c) => c.held.reduce((a, r) => a + (r.net || 0), 0))),
    head("per_head", "Earned per head", "net", cols.map((c) => (c.earned == null || !c.rows.length ? null : c.earned / c.rows.length))),
    head("per_day", "Earned per attendance day", "net", cols.map((c) => (c.earned == null || !c.attendance ? null : c.earned / c.attendance))),
    head("staff_cost", "Staff earned", "net", cols.map((c) => sumOf(c.staff, "earned"))),
    head("labour_cost", "Labour earned", "net", cols.map((c) => sumOf(c.labour, "earned"))),
    head("deliveries", "Deliveries made", "delivery", cols.map((c) => c.d?.n ?? 0), false),
    head("deliv_value", "Value delivered", "delivery", cols.map((c) => c.d?.value ?? 0)),
    head("throughput", "Throughput generated", "delivery", cols.map((c) => c.d?.tp ?? 0)),
    head("salary_pct_value", "Salary as % of value delivered", "ratio", cols.map((c) => pct(c.earned, c.d?.value ?? 0)), false, { pct: true, decimals: 1 }),
    head("salary_pct_tp", "Salary as % of throughput", "ratio", cols.map((c) => pct(c.earned, c.d?.tp ?? 0)), false, { pct: true, decimals: 1 }),
    head("salary_per_delivery", "Salary per delivery", "ratio", cols.map((c) => (c.earned == null || !c.d?.n ? null : c.earned / c.d.n))),
    head("value_per_head", "Value delivered per head", "ratio", cols.map((c) => (!c.rows.length ? null : (c.d?.value ?? 0) / c.rows.length))),
    head("tp_per_rupee", "Throughput per ₹ of salary", "ratio", cols.map((c) => (c.earned ? (c.d?.tp ?? 0) / c.earned : null)), false, { decimals: 2 }),
  ];
  const earnParts = EARN_HEADS.map(([k, l]) => ({ key: k, label: l, values: cols.map((c) => sumOf(c.rows, k)) }));

  // ---- the commentary: what a CHRO would say first, from these numbers alone
  const commentary: string[] = [];
  const n = cols.length, cur = cols[n - 1], prev = n > 1 ? cols[n - 2] : null, first = cols[0];
  const L = months[n - 1]?.label, Lp = months[n - 2]?.label, L0 = months[0]?.label;
  if (cur) {
    if (cur.earned != null) {
      const dE = prev ? delta(cur.earned, prev.earned) : null;
      commentary.push(`${L}: the register carries ${cur.rows.length} people earning ${lakh(cur.earned)} before deductions${cur.net != null ? `, ${lakh(cur.net)} net` : ""}${dE != null ? ` — ${dE >= 0 ? "up" : "down"} ${Math.abs(dE).toFixed(1)}% on ${Lp}` : ""}${prev && cur.rows.length !== prev.rows.length ? ` with ${Math.abs(cur.rows.length - prev.rows.length)} ${cur.rows.length > prev.rows.length ? "more" : "fewer"} people` : ""}.`);
    }
    if (n >= 3 && first.earned != null && cur.earned != null) {
      const d3 = delta(cur.earned, first.earned);
      if (d3 != null) commentary.push(`Over the three months the salary bill moved ${d3 >= 0 ? "up" : "down"} ${Math.abs(d3).toFixed(1)}% (${lakh(first.earned)} in ${L0} to ${lakh(cur.earned)} in ${L}); headcount went ${first.rows.length} → ${cur.rows.length}.`);
    }
    const perHead = cur.earned != null && cur.rows.length ? cur.earned / cur.rows.length : null;
    const perHeadPrev = prev && prev.earned != null && prev.rows.length ? prev.earned / prev.rows.length : null;
    if (perHead != null) commentary.push(`Cost per head is ${lakh(perHead)} a month${perHeadPrev != null ? ` (${Lp}: ${lakh(perHeadPrev)})` : ""}${cur.attendance ? `; the company bought ${cur.attendance.toLocaleString("en-IN")} attendance days at ${lakh(cur.earned! / cur.attendance)} a day` : ""}.`);
    const sc = sumOf(cur.staff, "earned"), lc = sumOf(cur.labour, "earned");
    if (sc != null && lc != null && cur.earned) commentary.push(`Staff take ${((sc / cur.earned) * 100).toFixed(0)}% of the bill (${cur.staff.length} people), labour ${((lc / cur.earned) * 100).toFixed(0)}% (${cur.labour.length} people).`);
    const ot = sumOf(cur.rows, "ot_pay"), otPrev = prev ? sumOf(prev.rows, "ot_pay") : null;
    if (ot != null && ot > 0) commentary.push(`Overtime cost ${lakh(ot)}${otPrev != null && otPrev > 0 ? ` against ${lakh(otPrev)} in ${Lp}` : ""} — ${cur.earned ? ((ot / cur.earned) * 100).toFixed(1) : "?"}% of the bill. Overtime above a tenth of the bill usually says the shop is short of hands, not long on work.`);
    if (cur.d && cur.d.n) {
      const share = cur.earned != null ? pct(cur.earned, cur.d.value) : null;
      commentary.push(`The factory delivered ${cur.d.n} job${cur.d.n === 1 ? "" : "s"} worth ${lakh(cur.d.value)} in ${L}${cur.d.tp ? ` with ${lakh(cur.d.tp)} of throughput` : ""}; the salary bill was ${share != null ? `${share.toFixed(1)}% of the value delivered` : "not comparable"}${cur.earned != null ? `, ${lakh(cur.earned / cur.d.n)} per delivery` : ""}.`);
      if (prev && prev.d && prev.d.n && prev.earned != null && cur.earned != null) {
        const sPrev = pct(prev.earned, prev.d.value), sCur = pct(cur.earned, cur.d.value);
        if (sPrev != null && sCur != null) commentary.push(`${sCur < sPrev ? "Better" : "Worse"} than ${Lp}, when salary was ${sPrev.toFixed(1)}% of value delivered on ${prev.d.n} deliveries. A falling share with steady headcount means the same team shipped more.`);
      }
    } else commentary.push(`No deliveries are recorded for ${L} in the delivered ledger, so the salary bill stands without the value it produced beside it.`);
    if (cur.held.length) commentary.push(`${cur.held.length} ${cur.held.length === 1 ? "salary is" : "salaries are"} on hold (${lakh(cur.held.reduce((a, r) => a + (r.net || 0), 0))}), earning attendance only, nothing extra. Each hold is there for a reason and should be lifted or acted on before the next run.`);
    if (cur.zero) commentary.push(`${cur.zero} ${cur.zero === 1 ? "person" : "people"} had no attendance at all and ${cur.zero === 1 ? "is" : "are"} paid nothing; if they have left, the F&F should be raised so the register stops carrying them.`);
    const missing = EARN_HEADS.filter(([k]) => cols.some((c) => sumOf(c.rows, k) == null)).map(([, l]) => l);
    if (missing.length) commentary.push(`Earlier months' sheets did not carry every head (${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "…" : ""}); a dash in the table means the month's file never had the column, not that it was nought.`);
  }
  return { months, heads, commentary, earnParts };
}
