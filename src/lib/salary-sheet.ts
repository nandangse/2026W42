/**
 * Reading a finalised salary sheet.
 *
 * HR's monthly sheet is a spreadsheet somebody built by hand, so the column
 * names move: "Net Pay", "Net Payable", "NET AMOUNT" and "Net" are the same
 * column in four months' files. Rather than demand one exact format, this
 * matches each column by what it MEANS and then reports what it understood —
 * so a mapping that goes wrong is visible on the screen instead of showing
 * up as a wrong total nobody can trace.
 *
 * It is deliberately separate from the route: the arithmetic that decides
 * what was paid to two hundred people should be testable without a database.
 */

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

/**
 * A parsed line: one person, one month.
 *
 * The register columns are OPTIONAL AND NULLABLE on purpose: null means the
 * uploaded sheet had no such column, which is different from 0 (the column
 * was there and said nothing was deducted). The register prints a dash for
 * null — for the past months the sheet is the only truth, and a figure the
 * sheet never carried must not be invented (Dr Raghu, 24 Aug 2026).
 */
export interface SheetRow {
  employee_id: string | null;
  name: string | null;
  type: string | null;
  earned: number;
  deductions: number;
  net: number;
  /* ── the register's own columns, as the sheet gives them ── */
  attendance?: number | null;
  paid_days?: number | null;
  gross?: number | null;
  basic_da?: number | null;
  hra?: number | null;
  fixed_allowance?: number | null;
  conveyance?: number | null;
  site_allowance?: number | null;
  pf?: number | null;
  pt?: number | null;
  other_ded?: number | null;
  loan?: number | null;
  advance?: number | null;
  tds?: number | null;
  arrears?: number | null;
  /** The sheet's own HOLD flag — a salary marked held, not paid this run. */
  hold?: boolean;
}

/** The register's printable columns, in the order the page shows them. */
export const REGISTER_COLUMNS: { key: keyof SheetRow; label: string }[] = [
  { key: "gross", label: "Gross Salary" },
  { key: "attendance", label: "Attend." },
  { key: "paid_days", label: "Paid Days" },
  { key: "basic_da", label: "Earned Basic & DA" },
  { key: "hra", label: "HRA" },
  { key: "fixed_allowance", label: "Fixed Allow." },
  { key: "conveyance", label: "Conveyance" },
  { key: "site_allowance", label: "Site Allow." },
  { key: "earned", label: "Earned Salary" },
  { key: "pf", label: "PF" },
  { key: "pt", label: "PT" },
  { key: "other_ded", label: "Other Ded." },
  { key: "loan", label: "Loan" },
  { key: "advance", label: "Advance" },
  { key: "tds", label: "TDS" },
  { key: "deductions", label: "Total Ded." },
  { key: "arrears", label: "Arrears" },
  { key: "net", label: "Net Pay" },
];

export interface SheetTotals {
  staff_count: number; staff_value: number;
  labour_count: number; labour_value: number;
  total_count: number; total_salary: number;
  earned_pay: number; deductions: number; net_payable: number;
}

export interface Mapping {
  headerRow: number;
  columns: Record<string, string>;
  unmapped: string[];
  warnings: string[];
}

/** The number a pay cell means. Blank, "-", "NIL" and "0.00" are all zero. */
export function money(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  let s = String(v).trim();
  if (!s || /^(-|nil|na|n\/a)$/i.test(s)) return 0;
  // (1,234) is how a spreadsheet writes a negative
  const bracketed = /^\(.*\)$/.test(s);
  if (bracketed) s = s.slice(1, -1);
  const neg = bracketed || s.trimStart().startsWith("-");
  const n = parseFloat(s.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n)) return 0;
  return neg ? -n : n;
}

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * What each column is, in order of confidence. First match wins, so the more
 * specific pattern has to come first: "netpayable" must be tested before
 * "pay", or every pay column becomes the net one.
 */
const COLUMN_RULES: { key: keyof SheetRow | "skip"; test: (h: string) => boolean }[] = [
  { key: "employee_id", test: (h) => /^(employeeid|empid|empcode|code|employeecode|ecode|id)$/.test(h) },
  { key: "name", test: (h) => /^(name|employeename|empname|nameofemployee)$/.test(h) },
  { key: "type", test: (h) => /^(type|category|employeetype|emptype|cadre)$/.test(h) },
  // ── the register columns. The payroll export carries RATE and EARNED
  //    pairs ("Basic & DA Rate" beside "Earned Basic And DA") and INPUT and
  //    DEDUCTED pairs ("Loan taken_m" beside "Loan Deducted"), so nearly
  //    every rule here is anchored: a loose /basic/ or /^loan/ was landing
  //    on the rate or the input, which is the wrong half of the pair ──
  { key: "hold", test: (h) => /^(status|hold|holdstatus|holdsalary)$/.test(h) },
  { key: "attendance", test: (h) => /^(attendance|attendancedays|presentdays|dayspresent|daysworked|present)$/.test(h) },
  { key: "paid_days", test: (h) => /^(paymentdays|paiddays|payabledays|totalpaiddays)$/.test(h) },
  { key: "basic_da", test: (h) => /^earned(final)?basic(and|&)?da$|^basic(and|&)?daearned$/.test(h) },
  { key: "hra", test: (h) => /^(hra|hraearned|earnedhra|houserentallowance)$/.test(h) },
  { key: "fixed_allowance", test: (h) => /^(fixedallowance|earnedfixedallowance|fixallowance)$/.test(h) },
  { key: "conveyance", test: (h) => /^(conveyance|earnedconveyance)$/.test(h) },
  { key: "site_allowance", test: (h) => /^(siteallowance|earnedsiteallowance)$/.test(h) },
  { key: "pf", test: (h) => /^(pf|epf|providentfund|pfamount|pfemployee)$/.test(h) },
  { key: "pt", test: (h) => /^(pt|proftax|professionaltax|ptax)$/.test(h) },
  { key: "tds", test: (h) => /^tds(deduction)?$|^taxdeducted/.test(h) },
  { key: "loan", test: (h) => /^loandeduct(ion|ed)?$|^loanrecovery$|^loanemi$/.test(h) },
  { key: "advance", test: (h) => /^advance(deduction|recovered|deducted)?$/.test(h) },
  { key: "other_ded", test: (h) => /otherded|othded|misc(ellaneous)?ded/.test(h) },
  { key: "arrears", test: (h) => /^arrears?(payable)?$/.test(h) },
  { key: "gross", test: (h) => /^(gross|grosssalary|grosssalaryrate|grosspay|monthlygross|fixedgross)$/.test(h) },
  { key: "net", test: (h) => /(netpayable|netsalary|netpayment|netpay|netamount|amountpayable|takehome)/.test(h) || h === "net" },
  { key: "deductions", test: (h) => /^(totaldeductions?|deductions?|lessdeductions?|recovery)$/.test(h) },
  { key: "earned", test: (h) => /^(totalearnings?|earnedgross|grossearned|earnedsalary|earnedpay|earnings?)$/.test(h) },
];

/** The register fields read per line when their column exists. */
const REGISTER_KEYS: (keyof SheetRow)[] = [
  "attendance", "paid_days", "gross", "basic_da", "hra", "fixed_allowance", "conveyance",
  "site_allowance", "pf", "pt", "other_ded", "loan", "advance", "tds", "arrears",
];

/** OT, as the company books it: Site Allowance + HRA of the labour types. */
export const otOf = (rows: SheetRow[]): number =>
  Math.round(rows.filter((r) => /labour/i.test(String(r.type || "")))
    .reduce((s, r) => s + (Number(r.site_allowance) || 0) + (Number(r.hra) || 0), 0));

/** Rows near the top of a hand-built sheet are banners; find the real header. */
export function findHeaderRow(grid: unknown[][]): number {
  let best = 0, bestScore = -1;
  for (let r = 0; r < Math.min(grid.length, 25); r++) {
    const cells = (grid[r] || []).map(norm).filter(Boolean);
    if (cells.length < 3) continue;
    let score = 0;
    for (const c of cells) for (const rule of COLUMN_RULES) if (rule.test(c)) { score += 2; break; }
    // a header row is words, not money
    const numeric = (grid[r] || []).filter((c) => typeof c === "number" || /^[\d,.\s]+$/.test(String(c ?? "").trim()) && String(c ?? "").trim()).length;
    score -= numeric;
    if (score > bestScore) { bestScore = score; best = r; }
  }
  return bestScore > 0 ? best : 0;
}

/** Read the grid into lines plus a statement of what was understood. */
export function parseSheet(grid: unknown[][]): { rows: SheetRow[]; mapping: Mapping } {
  const headerRow = findHeaderRow(grid);
  const headers = (grid[headerRow] || []).map((h) => String(h ?? "").trim());

  const colOf: Partial<Record<keyof SheetRow, number>> = {};
  const columns: Record<string, string> = {};
  const unmapped: string[] = [];
  const warnings: string[] = [];

  headers.forEach((h, i) => {
    const n = norm(h);
    if (!n) return;
    const hit = COLUMN_RULES.find((r) => r.test(n));
    if (hit && hit.key !== "skip" && colOf[hit.key] === undefined) {
      colOf[hit.key] = i;
      columns[hit.key] = h;
    } else if (!hit) unmapped.push(h);
  });

  if (colOf.net === undefined && colOf.earned === undefined)
    warnings.push("No pay column was recognised — check the file has a Gross/Earned or Net column.");
  if (colOf.employee_id === undefined)
    warnings.push("No EmployeeID column was found, so lines cannot be matched to the master; Staff and Labour cannot be split.");

  const rows: SheetRow[] = [];
  let dropped = 0;
  for (let r = headerRow + 1; r < grid.length; r++) {
    const line = grid[r] || [];
    const at = (k: keyof SheetRow) => (colOf[k] === undefined ? null : line[colOf[k] as number]);

    const id = String(at("employee_id") ?? "").trim();
    const name = String(at("name") ?? "").trim();
    const earned = money(at("earned"));
    const deductions = money(at("deductions"));
    const net = colOf.net === undefined ? earned - deductions : money(at("net"));

    // a total row at the foot carries money but no person — it is not a line
    const looksTotal = /^(total|grand ?total|sum)/i.test(name) || /^(total|grand)/i.test(id);
    if (looksTotal) continue;
    if (!id && !name) continue;
    // a HELD salary often carries no computed money at all — it is still a
    // line in the register, and the hold count must match the sheet's
    const held = colOf.hold !== undefined && /hold|^yes$|^y$/i.test(String(at("hold") ?? "").trim());
    if (!earned && !deductions && !net && !held) continue;
    // EMPLOYEES ARE ALL FOUR-DIGIT IDS (Dr Raghu, 27 Aug 2026). The payroll
    // export carries a company total row and a repeated header mid-file, and
    // both fail this test — a real person never does.
    if (!/^\d{4}$/.test(id)) { dropped++; continue; }

    const row: SheetRow = {
      employee_id: id || null,
      name: name || null,
      type: String(at("type") ?? "").trim() || null,
      earned, deductions, net,
    };
    // null when the sheet has no such column — the register prints a dash,
    // never a zero the sheet did not say
    for (const k of REGISTER_KEYS)
      (row as unknown as Record<string, unknown>)[k] = colOf[k] === undefined ? null : money(at(k));
    if (colOf.hold !== undefined) row.hold = held;
    rows.push(row);
  }

  if (!rows.length) warnings.push("No pay lines were read from the file.");
  if (dropped) warnings.push(`${dropped} line${dropped === 1 ? "" : "s"} without a four-digit EmployeeID left out (totals, repeated headers).`);
  return { rows, mapping: { headerRow: headerRow + 1, columns, unmapped, warnings } };
}

/** Labour is Labour, on the rolls or on a contract. Everyone else is Staff. */
export const isLabour = (type: string | null | undefined) => /labour/i.test(String(type || ""));

/**
 * The month's totals. `typeOf` resolves a person's type as it stands NOW,
 * at the moment of upload — after which the answer is frozen with the sheet,
 * because a person changing type in September must not restate April.
 */
export function totalsFor(rows: SheetRow[], typeOf: (id: string | null) => string | null): SheetTotals {
  let staff_count = 0, staff_value = 0, labour_count = 0, labour_value = 0;
  let earned_pay = 0, deductions = 0, net_payable = 0;

  for (const r of rows) {
    const type = r.type || typeOf(r.employee_id);
    // the value of a group is what it costs — the earned pay, before deductions
    const value = r.earned || r.net;
    if (isLabour(type)) { labour_count++; labour_value += value; }
    else { staff_count++; staff_value += value; }
    earned_pay += r.earned;
    deductions += r.deductions;
    net_payable += r.net;
  }

  const R = (n: number) => Math.round(n * 100) / 100;
  return {
    staff_count, staff_value: R(staff_value),
    labour_count, labour_value: R(labour_value),
    total_count: staff_count + labour_count,
    total_salary: R(staff_value + labour_value),
    earned_pay: R(earned_pay), deductions: R(deductions), net_payable: R(net_payable),
  };
}
