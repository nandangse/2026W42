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
  return SAMPLE_BANDS.map((b) => {
    const pool = slips.filter((s) =>
      (b.kind === "worker" ? isWorker(s) : isStaff(s)) &&
      !s.hold && (s.net || 0) > 0 &&
      (s.gross_rate || 0) >= b.lo && (s.gross_rate || 0) < b.hi);
    // the middle of the band reads more typical than its edges
    pool.sort((a, c) => (a.gross_rate || 0) - (c.gross_rate || 0));
    return { label: b.label, slip: pool[Math.floor(pool.length / 2)] || null };
  });
}
