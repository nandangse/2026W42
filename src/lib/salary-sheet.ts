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

/** A parsed line: one person, one month. */
export interface SheetRow {
  employee_id: string | null;
  name: string | null;
  type: string | null;
  earned: number;
  deductions: number;
  net: number;
}

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
  { key: "net", test: (h) => /(netpayable|netsalary|netpay|netamount|amountpayable|takehome)/.test(h) || h === "net" },
  { key: "deductions", test: (h) => /(totaldeduction|deduction|lessdeduction|recovery)/.test(h) },
  { key: "earned", test: (h) => /(earnedgross|grossearned|earnedsalary|totalearning|earning|earnedpay|earned|grosssalary|grosspay|gross)/.test(h) },
];

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
    if (!earned && !deductions && !net) continue;

    rows.push({
      employee_id: id || null,
      name: name || null,
      type: String(at("type") ?? "").trim() || null,
      earned, deductions, net,
    });
  }

  if (!rows.length) warnings.push("No pay lines were read from the file.");
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
