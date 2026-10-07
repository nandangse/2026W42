/**
 * Salary slips, read from the month's uploaded sheet — see salary-sheet.ts
 * for the ground rule: for the past months the sheet is the only truth.
 *
 * The slip needs far more of the sheet than the register does — rates beside
 * earned figures, loan and leave balances, the bank account, the amount in
 * words — so it reads the file directly by this export's own headers rather
 * than stretching SheetRow to hold everything. A header that is absent
 * yields null, and the slip prints a dash.
 *
 * NOT SHOWN, by instruction (Dr Raghu, 27 Aug 2026): OT, Comp Off, Late
 * Mark, Late Deduction. They are inputs to the computation, not statements
 * on a payslip.
 */
import { findHeaderRow, money } from "./salary-sheet";

export interface Slip {
  id: string; name: string; category: string | null; hold: boolean;
  department: string | null; designation: string | null;
  // rates
  basic_rate: number | null; fixed_rate: number | null; conv_rate: number | null;
  med_rate: number | null; gross_rate: number | null;
  // the month
  days_in_month: number | null; attendance: number | null; paid_days: number | null;
  // earned
  basic: number | null; hra: number | null; fixed: number | null; conveyance: number | null;
  site: number | null; medical: number | null; leave_encash: number | null;
  bonus: number | null; arrears: number | null; total_earned: number | null;
  // deducted
  pf: number | null; pt: number | null; esi: number | null; lunch: number | null;
  advance: number | null; loan_ded: number | null; tds: number | null;
  other_ded: number | null; total_ded: number | null;
  // the answer
  net: number | null; in_words: string | null;
  // balances
  loan_ob: number | null; loan_cb: number | null;
  leave_ob: number | null; leave_added: number | null; leave_used: number | null; leave_cb: number | null;
  // identity & bank
  uan: string | null; pf_no: string | null; esic_no: string | null; pan: string | null;
  aadhaar: string | null; mlwf: string | null;
  bank: string | null; account: string | null; ifsc: string | null;
  per_day: number | null; round_up: number | null;
  leave_encashed: number | null; loan_added: number | null;
  /** the payroll run's comp off — absent on slips read off an uploaded file */
  compoff_days?: number | null; compoff_encashed_days?: number | null; compoff_amt?: number | null; leave_encash_amt?: number | null; ot_pay?: number | null;
}

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** header → Slip field. Exact on the normalised header, first hit wins. */
const HEADERS: [keyof Slip, string[]][] = [
  ["id", ["id", "employeeid", "empid", "empcode", "code"]],
  ["name", ["name", "employeename"]],
  ["category", ["category"]],
  ["hold", ["status", "hold"]],
  ["department", ["department"]],
  ["designation", ["designation"]],
  ["basic_rate", ["basicdarate"]],
  ["fixed_rate", ["fixallowancerate", "fixedallowancerate"]],
  ["conv_rate", ["conveyancerate"]],
  ["med_rate", ["medicalallowancerate"]],
  ["gross_rate", ["grosssalaryrate", "grosssalary"]],
  ["days_in_month", ["paydays"]],
  ["attendance", ["attendance"]],
  ["paid_days", ["paymentdays"]],
  ["basic", ["earnedbasicandda", "earnedbasicda"]],
  ["hra", ["hra"]],
  ["fixed", ["fixedallowance"]],
  ["conveyance", ["conveyance"]],
  ["site", ["siteallowance"]],
  ["medical", ["medicalallowance"]],
  ["leave_encash", ["leaveencashmentamount"]],
  ["bonus", ["interimbonus"]],
  ["arrears", ["arrearspayable"]],
  ["total_earned", ["totalearnings", "totalearning"]],
  ["pf", ["pf"]],
  ["pt", ["pt"]],
  ["esi", ["esi"]],
  ["lunch", ["lunch"]],
  ["advance", ["advance"]],
  ["loan_ded", ["loandeduction", "loandeducted"]],
  ["tds", ["tdsdeduction", "tds"]],
  ["other_ded", ["otherdeductions", "otherdeduction"]],
  ["total_ded", ["totaldeductions", "totaldeduction"]],
  ["net", ["netpayment", "netpay", "tobepaidsalary"]],
  ["in_words", ["inwords"]],
  ["loan_ob", ["loanob"]],
  ["loan_cb", ["loancb"]],
  ["leave_ob", ["leaveob"]],
  ["leave_added", ["leaveadded"]],
  ["leave_used", ["leaveused", "leaveutilized"]],
  ["leave_cb", ["leavecb"]],
  ["uan", ["uanno", "uan"]],
  ["pf_no", ["pfno"]],
  ["esic_no", ["esicno"]],
  ["pan", ["panno", "pan"]],
  ["bank", ["bankname"]],
  ["account", ["accountno", "accountno15digit"]],
  ["ifsc", ["ifsccode", "ifsc"]],
  ["aadhaar", ["adhaarno", "aadhaarno", "aadharno"]],
  ["mlwf", ["mlwf", "mlwfno"]],
  ["per_day", ["perday"]],
  ["round_up", ["roundup", "roundoff"]],
  ["leave_encashed", ["leaveencashed"]],
  ["loan_added", ["loanadded"]],
  // the sheet's comp off: days given (Comp Of_m) and the amount paid (Comp. Off Amt.)
  ["compoff_days", ["compofm", "compoff", "compoffdays"]],
  ["compoff_amt", ["compoffamt", "compoffamount"]],
];

const TEXT_FIELDS = new Set<keyof Slip>([
  "id", "name", "category", "department", "designation", "in_words",
  "uan", "pf_no", "esic_no", "pan", "bank", "account", "ifsc", "aadhaar", "mlwf",
]);

export function extractSlips(grid: unknown[][]): Slip[] {
  const headerRow = findHeaderRow(grid);
  const headers = (grid[headerRow] || []).map(norm);
  const col = new Map<keyof Slip, number>();
  for (const [field, names] of HEADERS) {
    for (const n of names) {
      const i = headers.indexOf(n);
      if (i >= 0) { col.set(field, i); break; }
    }
  }

  const out: Slip[] = [];
  for (let r = headerRow + 1; r < grid.length; r++) {
    const line = grid[r] || [];
    const raw = (f: keyof Slip) => (col.has(f) ? line[col.get(f)!] : undefined);
    const id = String(raw("id") ?? "").trim();
    if (!/^\d{4}$/.test(id)) continue; // employees are all four-digit ids

    const slip = { id } as Slip;
    for (const [field] of HEADERS) {
      if (field === "id" || field === "hold") continue;
      const v = raw(field);
      if (TEXT_FIELDS.has(field)) (slip as unknown as Record<string, unknown>)[field] = v == null || String(v).trim() === "" ? null : String(v).trim();
      else (slip as unknown as Record<string, unknown>)[field] = v == null || String(v).trim() === "" ? null : money(v);
    }
    slip.hold = /hold|^yes$|^y$/i.test(String(raw("hold") ?? "").trim());
    slip.name = slip.name || id;
    // COMP OFF ON THE SLIP (Dr Raghu, 5 Sep 2026): the sheet pays comp off as
    // its own amount and the total carries it, but the slip showed Leave
    // Encashment without it and the leave line without the days. Comp off is
    // added to leave and taken out again when encashed, at the per-day rate —
    // so it appears in both places, and the closing balance is unchanged.
    // "Leave encashment = actual leave encashment applied + comp off earned"
    // (Dr Raghu, 5 Sep 2026). The sheet's slip export carries the comp-off
    // DAYS but not always the amount column; comp off is paid at the per-day
    // rate, so days × per day is the amount when the column is absent.
    // per day: the sheet's own, else gross over its pay days — 26 for workers, the sheet's Pay Days for
    // everybody else; with neither known the amount is left uncomputed rather than guessed from a fixed
    // divisor (Dr Raghu, 7 Oct 2026: "the number of days that are there in that month")
    const payDays0 = slip.days_in_month || (SIX_AND_TWENTY.test(String(slip.category || "")) ? 26 : 0);
    const perDay0 = slip.per_day || (slip.gross_rate && payDays0 ? slip.gross_rate / payDays0 : 0);
    if ((slip.compoff_amt == null || slip.compoff_amt === 0) && (slip.compoff_days ?? 0) > 0 && perDay0)
      slip.compoff_amt = Math.round((slip.compoff_days ?? 0) * perDay0);
    const compAmt = slip.compoff_amt ?? 0;
    if (compAmt || slip.compoff_days) {
      slip.leave_encash_amt = slip.leave_encash ?? 0;
      slip.leave_encash = (slip.leave_encash ?? 0) + compAmt;
      const perDay = perDay0;
      slip.compoff_encashed_days = perDay ? Math.round((compAmt / perDay) * 100) / 100 : (slip.compoff_days ?? 0);
      slip.leave_encashed = (slip.leave_encashed ?? 0) + (slip.compoff_encashed_days ?? 0);
    }
    out.push(slip);
  }
  return out;
}

/** The nine sample bands: a worker and a staff slip per gross band. */
export const SAMPLE_BANDS: { label: string; kind: "worker" | "staff"; lo: number; hi: number }[] = [
  { label: "Worker · ₹10–15k", kind: "worker", lo: 10000, hi: 15000 },
  { label: "Worker · ₹15–20k", kind: "worker", lo: 15000, hi: 20000 },
  { label: "Worker · ₹20–25k", kind: "worker", lo: 20000, hi: 25000 },
  { label: "Worker · ₹25–30k", kind: "worker", lo: 25000, hi: 30000 },
  { label: "Staff · ₹20–35k", kind: "staff", lo: 20000, hi: 35000 },
  { label: "Staff · ₹35–50k", kind: "staff", lo: 35000, hi: 50000 },
  { label: "Staff · ₹50k–1L", kind: "staff", lo: 50000, hi: 100000 },
  { label: "Staff · ₹1–1.5L", kind: "staff", lo: 100000, hi: 150000 },
  { label: "Staff · ₹1.5L+", kind: "staff", lo: 150000, hi: Infinity },
];

export function pickSamples(slips: Slip[]): { label: string; slip: Slip | null }[] {
  const isWorker = (s: Slip) => /labour/i.test(String(s.category || ""));
  const isStaff = (s: Slip) => /^staff$/i.test(String(s.category || ""));
  const out = SAMPLE_BANDS.map((b) => {
    const pool = slips.filter((s) =>
      (b.kind === "worker" ? isWorker(s) : isStaff(s)) &&
      !s.hold && (s.net || 0) > 0 &&
      (s.gross_rate || 0) >= b.lo && (s.gross_rate || 0) < b.hi);
    // the middle of the band reads more typical than its edges
    pool.sort((a, c) => (a.gross_rate || 0) - (c.gross_rate || 0));
    return { label: b.label, slip: pool[Math.floor(pool.length / 2)] || null };
  });

  /**
   * THE CASES THAT LOOK DIFFERENT (Dr Raghu, 7 Sep 2026: "in sample also show
   * someone who has loan payment, someone who has advance payment, Labour
   * contract, Contractor").
   *
   * The bands sample by MONEY, so they can miss the shapes that go wrong —
   * a deduction line nobody checked, or an engagement type whose slip is
   * built by a different rule. These four are chosen by SHAPE instead: the
   * biggest of each, since a large one shows an error most plainly.
   *
   * A person already shown in a band is not repeated; where nobody in the
   * month fits, the line says so rather than quietly showing eight samples
   * where nine were asked for.
   */
  const taken = new Set(out.map((x) => x.slip?.id).filter(Boolean));
  const pick = (label: string, ok: (s: Slip) => boolean, by: (s: Slip) => number) => {
    const hit = slips
      .filter((s) => !s.hold && (s.net || 0) > 0 && !taken.has(s.id) && ok(s))
      .sort((a, c) => by(c) - by(a))[0] || null;
    if (hit) taken.add(hit.id);
    out.push({ label, slip: hit });
  };
  pick("With a loan deduction", (s) => (s.loan_ded || 0) > 0, (s) => s.loan_ded || 0);
  pick("With an advance deducted", (s) => (s.advance || 0) > 0, (s) => s.advance || 0);
  /**
   * Comp off EARNED and comp off PAID are two different things, and the slip
   * shows them in two places — the leave line and the encashment row (Dr
   * Raghu, 7 Sep 2026: "also show one which is having a comp off and paid
   * also"). One sample must carry both, or neither line is ever checked.
   */
  pick("Comp off — earned and paid",
    (s) => (s.compoff_days || 0) > 0 && ((s.compoff_amt || 0) > 0 || (s.leave_encash || 0) > 0),
    (s) => s.compoff_amt || s.leave_encash || 0);
  pick("Comp off earned", (s) => (s.compoff_days || 0) > 0, (s) => s.compoff_days || 0);
  pick("Labour - Contract", (s) => /labour\s*-\s*contract/i.test(String(s.category || "")), (s) => s.gross_rate || 0);
  pick("Contractor", (s) => /^contractor$/i.test(String(s.category || "").trim()), (s) => s.gross_rate || 0);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// SLIPS OFF THE GENERATED REGISTER (Dr Raghu, 5 Sep 2026): "In the pay slip
// comp off also should be there [in] the leave ledger and also should be
// shown in leave encashment too ... The total is right, but the amount that
// is ... visibly seen is wrong."
//
// When a month was generated by the payroll run, the slip reads the run's
// rows, not the uploaded file. Comp off appears in the leave line — OB +
// earned + comp off − used − encashed = closing — and Leave Encashment is
// leave AND comp off encashed, at the per-day rate, which is what the total
// already carried.
// ─────────────────────────────────────────────────────────────────────────

/** A register row as the payroll run stores it (src/lib/muster.ts RegisterRow, loosely). */
export type RegisterLike = Record<string, unknown> & { employee_id: string };

/** Indian number words: 1,71,379 → One Lakh Seventy One Thousand Three Hundred and Seventy Nine. */
export function inWords(n: number): string {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const two = (x: number) => (x < 20 ? ones[x] : `${tens[Math.floor(x / 10)]}${x % 10 ? " " + ones[x % 10] : ""}`);
  const three = (x: number) => (x >= 100 ? `${ones[Math.floor(x / 100)]} Hundred${x % 100 ? " and " + two(x % 100) : ""}` : two(x));
  let v = Math.round(Math.abs(n));
  if (v === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(v / 10000000); v %= 10000000;
  const lakh = Math.floor(v / 100000); v %= 100000;
  const thousand = Math.floor(v / 1000); v %= 1000;
  if (crore) parts.push(`${two(crore)} Crore`);
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (thousand) parts.push(`${two(thousand)} Thousand`);
  if (v) parts.push(three(v));
  return parts.join(" ");
}

const N = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/**
 * PAY DAYS AS THE SLIP SHOULD SAY THEM (Dr Raghu, 7 Sep 2026: "the paydays
 * for labour contractors are 26 days and not 31 — only talking about the
 * payslip, the rest of the things are right").
 *
 * A month on the labour and contract side is a 26-day month, and the slip
 * was printing 31 because the register does not always carry a Pay Days
 * column and the fallback was simply the length of the calendar month.
 *
 * DISPLAY ONLY. Nothing here touches what anybody is paid: the earnings, the
 * per-day rate and the net are computed elsewhere and are unchanged. This is
 * the figure printed in the header beside Present Days.
 */
const SIX_AND_TWENTY = /labour|contract/i;
const slipPayDays = (type: string | null, fromSheet: number | null, daysInMonth: number): number | null =>
  fromSheet ?? (SIX_AND_TWENTY.test(String(type || "")) ? 26 : daysInMonth);
const T = (v: unknown): string | null => (v === null || v === undefined || String(v).trim() === "" ? null : String(v).trim());

/**
 * Build the slips from the run's rows. `record(id)` answers the employee's
 * record values by key (uan_no, pan, bank_name …) — the slip's identity block
 * is the record's, never the sheet's.
 */
export function slipsFromRegister(
  rows: RegisterLike[],
  record: (id: string) => Record<string, unknown> | null,
  daysInMonth: number,
): Slip[] {
  return rows.map((r) => {
    const rec = record(String(r.employee_id)) || {};
    const g = (k: string) => rec[k];
    const encashLeave = N(r.encash_amt) ?? 0;
    const compDays = N(r.compoff_days) ?? N(r.compoff) ?? 0;
    /**
     * COMP OFF IS PAID BUT NEVER ITEMISED (Dr Raghu, 7 Sep 2026: "the comp
     * was 1742, and the leave encashment was 6968 — the total is correct").
     *
     * The sheet carries comp off as DAYS ("Comp Of_m") and has no comp-off
     * amount column at all, so compoff_amt is null for all 205. Total
     * Earnings includes the money regardless: 6390's parts add to 42,908
     * against a total of 44,650, and the 1,742 missing is exactly his 1.5
     * days at his 1,161 per day. The slip was therefore printing earnings
     * that did not add up to its own total.
     *
     * Comp off is paid at the per-day rate, so days × per day IS the amount
     * whenever the column is absent — the same fallback the uploaded-sheet
     * path has had since 5 Sep. This path never got it.
     */
    const perDayOf = N(r.per_day) ?? (N(r.gross) ? (N(r.gross) as number) / (slipPayDays(T(r.type) || T(g("type")), N(r.pay_days), daysInMonth) || 26) : 0);
    const encashComp = N(r.compoff_amt) ?? (compDays > 0 && perDayOf ? Math.round(compDays * perDayOf) : 0) ?? 0;
    const encashedDays = N(r.leave_encashed) ?? 0;   // the sheet's own Leave Encashed
    const net = N(r.net) ?? 0;
    const s: Slip = {
      id: String(r.employee_id), name: T(r.name) || String(r.employee_id),
      category: T(r.type) || T(g("type")), hold: !!r.hold,
      department: T(g("department")), designation: T(g("designation")),
      basic_rate: N(g("basic_da")), fixed_rate: N(g("fixed_allowance")), conv_rate: N(g("conveyance")),
      med_rate: N(g("medical_allowance")), gross_rate: N(r.gross) ?? N(g("gross_salary")),
      days_in_month: slipPayDays(T(r.type) || T(g("type")), N(r.pay_days), daysInMonth),
      attendance: N(r.present) ?? N(r.attendance), paid_days: N(r.paid_days),
      basic: N(r.basic_da), hra: N(r.hra), fixed: N(r.fixed_allowance), conveyance: N(r.conveyance),
      site: N(r.site_allowance), medical: N(r.medical),
      leave_encash: encashLeave + encashComp,
      bonus: null, arrears: N(r.arrears), total_earned: N(r.earned),
      pf: N(r.pf), pt: N(r.pt), esi: 0, lunch: N(r.lunch),
      advance: N(r.advance), loan_ded: N(r.loan) ?? N(r.loan_ded), tds: N(r.tds),
      other_ded: (N(r.other_ded) ?? 0) + (N(r.late_ded) ?? 0), total_ded: N(r.deductions),
      net, in_words: `Rupees ${inWords(net)} Only`,
      loan_ob: N(r.loan_ob), loan_cb: N(r.loan_cb),
      /* the generator calls it leave_earned, the uploaded sheet Leave Added —
         one slip reads either (7 Sep 2026) */
      leave_ob: N(r.leave_ob), leave_added: N(r.leave_earned) ?? N(r.leave_added), leave_used: N(r.leave_used), leave_cb: N(r.leave_cb),
      uan: T(g("uan_no")), pf_no: T(g("pf_no")), esic_no: T(g("esic_no")), pan: T(g("pan")),
      aadhaar: T(g("aadhaar")), mlwf: T(g("mlwf")),
      bank: T(g("bank_name")), account: T(g("account_no")) || T(g("account_15")), ifsc: T(g("ifsc")),
      per_day: N(r.per_day), round_up: null,
      leave_encashed: encashedDays, loan_added: N(r.loan_taken) ?? N(r.loan_added),
      compoff_days: compDays,
      compoff_encashed_days: compDays > 0 && N(r.per_day) ? Math.round((encashComp / (N(r.per_day) as number)) * 100) / 100 : 0,
      compoff_amt: encashComp,
      leave_encash_amt: encashLeave,
      ot_pay: N(r.ot_pay),
    };
    return s;
  });
}
