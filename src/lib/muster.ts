/**
 * The attendance MUSTER and the SALARY RATE LIST, read from what HR uploads
 * (Dr Raghu, 4 Sep 2026: "upload the Muster, the salary rate list here.
 * Press Generate").
 *
 * The muster is the sheet's own tab exported as CSV: a banner row or two,
 * then a header — Emp. Id, Name, Status, one column per day (1/7 … 31/7),
 * then the totals (Total Present Days, Absent, WO, MO nd ST, Total Pay
 * Days), the category, and the money lines the month carries (OT, advance,
 * loan deduction, TDS …). Headers are matched by rule, not position, and
 * the sheet's own spellings ("Leve Encashment", "Site Allownce", "Loction")
 * are matched as they are. Day marks: P present, A absent, WO week off,
 * MO monthly off / statutory holiday, S sick or special (counted paid).
 *
 * Pure: no database, no React.
 */
import { salaryTable, NO_STATUTORY, num } from "@/lib/salary";

export interface MusterRow {
  employee_id: string; name: string; status: string; category: string;
  days: string[];            // one mark per day column, in day order
  present: number; absent: number; wo: number; mo_st: number; pay_days: number;
  attendance: number | null; compoff: number | null; ot: number | null; late: number | null; lunch: number | null;
  loan_taken: number | null; advance: number | null; site_allowance: number | null; leave_encash: number | null;
  loan_ded: number | null; arrears: number | null; tds: number | null; other_ded: number | null;
  location: string | null; designation: string | null; department: string | null; mobile: string | null;
}
export interface Muster {
  month: number | null; year: number | null; days: number;
  rows: MusterRow[]; headerRow: number; columns: Record<string, string>; unmapped: string[]; warnings: string[];
}

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const n = (v: unknown): number | null => { const s = String(v ?? "").replace(/[₹,\s]/g, ""); if (!s) return null; const x = Number(s); return Number.isFinite(x) ? x : null; };

/** header → key. Order matters: the first rule that matches wins. */
const RULES: [RegExp, keyof MusterRow | "skip"][] = [
  [/^emp(loyee)?\.? ?(id|no|code)?$/, "employee_id"],
  [/^name$/, "name"],
  [/^status$/, "status"],
  [/total present|^present( days?)?$/, "present"],
  [/^absent/, "absent"],
  [/^wo$|week ?off/, "wo"],
  [/^mo ?(nd|and|&) ?st|monthly off|^mo$/, "mo_st"],
  [/total pay|pay(able)? days/, "pay_days"],
  [/^category$|^type$/, "category"],
  [/^attendance$/, "attendance"],
  [/comp ?off/, "compoff"],
  [/^ot$|^ot hours|overtime/, "ot"],
  [/late ?m/, "late"],
  [/^lunch/, "lunch"],
  [/loan taken/, "loan_taken"],
  [/advance/, "advance"],
  [/site allow/, "site_allowance"],
  [/lea?ve? encash/, "leave_encash"],
  [/loan ded/, "loan_ded"],
  [/arrear/, "arrears"],
  [/^tds/, "tds"],
  [/other ded/, "other_ded"],
  [/^loc(a)?tion$/, "location"],
  [/^design?t/, "designation"],
  [/^department$/, "department"],
  [/mobile/, "mobile"],
  [/message|wa link|^email$|^address$|pick up/, "skip"],
];
const DAY = /^(\d{1,2})\/(\d{1,2})$/;

export function parseMuster(grid: unknown[][]): Muster {
  // the header is the row with an Emp. Id cell and the most day columns
  let headerRow = -1, best = 0;
  for (let r = 0; r < Math.min(grid.length, 15); r++) {
    const cells = (grid[r] || []).map((c) => String(c ?? "").trim());
    const dayN = cells.filter((c) => DAY.test(c)).length;
    const hasId = cells.some((c) => /^emp/i.test(c));
    if (hasId && dayN > best) { best = dayN; headerRow = r; }
  }
  const warnings: string[] = [];
  if (headerRow < 0) return { month: null, year: null, days: 0, rows: [], headerRow: 0, columns: {}, unmapped: [], warnings: ["No header row with Emp. Id and day columns (1/7 …) was found."] };

  const headers = (grid[headerRow] || []).map((h) => String(h ?? "").trim());
  const dayCols: { i: number; d: number; m: number }[] = [];
  const colOf: Partial<Record<keyof MusterRow, number>> = {};
  const columns: Record<string, string> = {};
  const unmapped: string[] = [];
  headers.forEach((h, i) => {
    const dm = DAY.exec(h);
    if (dm) { dayCols.push({ i, d: Number(dm[1]), m: Number(dm[2]) }); return; }
    const k = norm(h); if (!k) return;
    const hit = RULES.find(([re]) => re.test(k));
    if (!hit) { unmapped.push(h); return; }
    if (hit[1] === "skip") return;
    if (colOf[hit[1]] === undefined) { colOf[hit[1]] = i; columns[hit[1]] = h; }
  });
  dayCols.sort((a, b) => a.d - b.d);
  const month = dayCols.length ? dayCols[0].m : null;
  // the year: a banner cell like "July 2026" above the header, else null
  let year: number | null = null;
  for (let r = 0; r < headerRow; r++) for (const c of grid[r] || []) { const m = /(20\d\d)/.exec(String(c ?? "")); if (m) { year = Number(m[1]); break; } }
  if (colOf.employee_id === undefined) warnings.push("No Emp. Id column.");
  if (!dayCols.length) warnings.push("No day columns (1/7 … 31/7) — present and absent cannot be counted.");

  const rows: MusterRow[] = [];
  let dropped = 0;
  for (let r = headerRow + 1; r < grid.length; r++) {
    const line = grid[r] || [];
    const at = (k: keyof MusterRow) => (colOf[k] === undefined ? null : line[colOf[k] as number]);
    const id = String(at("employee_id") ?? "").trim();
    if (!/^\d{4}$/.test(id)) { if (String(line[0] ?? "").trim()) dropped++; continue; }
    const days = dayCols.map((c) => String(line[c.i] ?? "").trim().toUpperCase());
    const count = (re: RegExp) => days.filter((d) => re.test(d)).length;
    const present = n(at("present")) ?? count(/^P/);
    const absent = n(at("absent")) ?? count(/^A/);
    const wo = n(at("wo")) ?? count(/^WO/);
    const mo_st = n(at("mo_st")) ?? count(/^(MO|ST|H)/);
    const pay_days = n(at("pay_days")) ?? present + wo + mo_st + count(/^S$/);
    rows.push({
      employee_id: id, name: String(at("name") ?? "").trim(), status: String(at("status") ?? "").trim(), category: String(at("category") ?? "").trim(),
      days, present, absent, wo, mo_st, pay_days,
      attendance: n(at("attendance")), compoff: n(at("compoff")), ot: n(at("ot")), late: n(at("late")), lunch: n(at("lunch")),
      loan_taken: n(at("loan_taken")), advance: n(at("advance")), site_allowance: n(at("site_allowance")), leave_encash: n(at("leave_encash")),
      loan_ded: n(at("loan_ded")), arrears: n(at("arrears")), tds: n(at("tds")), other_ded: n(at("other_ded")),
      location: String(at("location") ?? "").trim() || null, designation: String(at("designation") ?? "").trim() || null,
      department: String(at("department") ?? "").trim() || null, mobile: String(at("mobile") ?? "").replace(/\D/g, "") || null,
    });
  }
  if (!rows.length) warnings.push("No lines with a four-digit Emp. Id were read.");
  if (dropped) warnings.push(`${dropped} line${dropped === 1 ? "" : "s"} without a four-digit Emp. Id left out (banners, totals).`);
  return { month, year, days: dayCols.length, rows, headerRow: headerRow + 1, columns, unmapped, warnings };
}

/** The rate list: one line per employee, the monthly rate under whatever the column is called. */
export interface RateRow { employee_id: string; name: string | null; type: string | null; gross: number | null; basic_da: number | null; hra: number | null; fixed: number | null; conveyance: number | null; medical: number | null; site: number | null; per_day: number | null }
export interface Rates { rows: RateRow[]; columns: Record<string, string>; warnings: string[] }

const RATE_RULES: [RegExp, keyof RateRow][] = [
  [/^emp(loyee)?\.? ?(id|no|code)?$/, "employee_id"], [/^name$/, "name"], [/^category$|^type$/, "type"],
  [/gross/, "gross"], [/basic/, "basic_da"], [/^hra/, "hra"], [/fixed/, "fixed"], [/conve/, "conveyance"], [/medic/, "medical"], [/site/, "site"], [/per ?day|day rate|daily/, "per_day"],
];
export function parseRates(grid: unknown[][]): Rates {
  let headerRow = 0, best = -1;
  for (let r = 0; r < Math.min(grid.length, 15); r++) {
    const cells = (grid[r] || []).map(norm).filter(Boolean);
    const score = cells.filter((c) => RATE_RULES.some(([re]) => re.test(c))).length;
    if (score > best) { best = score; headerRow = r; }
  }
  const headers = (grid[headerRow] || []).map((h) => String(h ?? "").trim());
  const colOf: Partial<Record<keyof RateRow, number>> = {};
  const columns: Record<string, string> = {};
  headers.forEach((h, i) => { const k = norm(h); const hit = RATE_RULES.find(([re]) => re.test(k)); if (hit && colOf[hit[1]] === undefined) { colOf[hit[1]] = i; columns[hit[1]] = h; } });
  const warnings: string[] = [];
  if (colOf.employee_id === undefined) warnings.push("No Emp. Id column in the rate list.");
  if (colOf.gross === undefined && colOf.basic_da === undefined && colOf.per_day === undefined) warnings.push("No Gross, Basic or Per-day column in the rate list.");
  const rows: RateRow[] = [];
  for (let r = headerRow + 1; r < grid.length; r++) {
    const line = grid[r] || [];
    const at = (k: keyof RateRow) => (colOf[k] === undefined ? null : line[colOf[k] as number]);
    const id = String(at("employee_id") ?? "").trim();
    if (!/^\d{4}$/.test(id)) continue;
    rows.push({ employee_id: id, name: String(at("name") ?? "").trim() || null, type: String(at("type") ?? "").trim() || null,
      gross: n(at("gross")), basic_da: n(at("basic_da")), hra: n(at("hra")), fixed: n(at("fixed")), conveyance: n(at("conveyance")), medical: n(at("medical")), site: n(at("site")), per_day: n(at("per_day")) });
  }
  return { rows, columns, warnings };
}

/**
 * GENERATE: muster × rates → the month's register, one line per person.
 *
 * Earned = the monthly rate × payable days ÷ days in the month, component
 * by component (Basic & DA, HRA, fixed, conveyance, medical). Rates come
 * from the rate list where uploaded, else from the person's record (the
 * same fields the Appraisal card reads). Statutory deductions follow
 * src/lib/salary.ts — PF 12% of earned Basic capped at 1,800, PT by the
 * Maharashtra slab, neither for the exempt types. The muster's own money
 * lines (OT amount as site allowance, advance, loan deduction, arrears,
 * TDS, other deductions) ride through as the sheet carries them.
 */
export interface RegisterRow {
  employee_id: string; name: string; type: string | null;
  present: number; absent: number; wo: number; mo_st: number; paid_days: number; attendance: number; ot: number | null;
  gross: number; basic_da: number; hra: number; fixed_allowance: number; conveyance: number; medical: number;
  site_allowance: number; arrears: number; earned: number;
  pf: number; pt: number; loan: number; advance: number; tds: number; other_ded: number; deductions: number; net: number;
  hold: boolean; rate_from: "rates" | "record" | "none"; mobile: string | null;
}
export function generateRegister(
  muster: Muster, rates: Rates | null, record: (id: string) => { type: string | null; get: (k: string) => unknown; name: string | null } | null, daysInMonth: number,
): { rows: RegisterRow[]; warnings: string[] } {
  const rateOf = new Map((rates?.rows || []).map((r) => [r.employee_id, r]));
  const warnings: string[] = [];
  let noRate = 0;
  const rows = muster.rows.map((m) => {
    const rec = record(m.employee_id);
    const type = m.category || rec?.type || null;
    const rr = rateOf.get(m.employee_id);
    let basic = 0, hra = 0, fixed = 0, conv = 0, med = 0, gross = 0, from: RegisterRow["rate_from"] = "none";
    if (rr && (rr.gross || rr.basic_da || rr.per_day)) {
      from = "rates";
      basic = rr.basic_da ?? 0; hra = rr.hra ?? 0; fixed = rr.fixed ?? 0; conv = rr.conveyance ?? 0; med = rr.medical ?? 0;
      gross = rr.gross ?? (basic + hra + fixed + conv + med);
      if (!basic && gross) basic = gross - hra - fixed - conv - med;
      if (rr.per_day && !gross) { gross = rr.per_day * daysInMonth; basic = gross; }
    } else if (rec) {
      const t = salaryTable(rec.get, type);
      if (t) {
        from = "record";
        basic = num(rec.get("Basic and DA")); hra = NO_STATUTORY.has(String(type)) || /labour/i.test(String(type)) ? 0 : num(rec.get("HRA"));
        fixed = num(rec.get("Fixed Allowance")); conv = num(rec.get("Conveyance")); med = /labour/i.test(String(type)) ? 0 : num(rec.get("Medical Allowance"));
        gross = t.gross;
      }
    }
    if (from === "none") noRate++;
    const f = daysInMonth > 0 ? Math.max(0, m.pay_days) / daysInMonth : 0;
    const E = (v: number) => Math.round(v * f);
    const eBasic = E(basic), eHra = E(hra), eFixed = E(fixed), eConv = E(conv), eMed = E(med);
    const site = m.site_allowance ?? 0, arrears = m.arrears ?? 0;
    const earned = eBasic + eHra + eFixed + eConv + eMed + site + arrears;
    const exempt = NO_STATUTORY.has(String(type || ""));
    const pf = !exempt && eBasic > 0 ? Math.min(Math.round(eBasic * 0.12), 1800) : 0;
    const eGross = eBasic + eHra + eFixed + eConv + eMed;
    const pt = exempt ? 0 : eGross > 10000 ? 200 : eGross >= 7500 ? 175 : 0;
    const loan = m.loan_ded ?? 0, advance = m.advance ?? 0, tds = m.tds ?? 0, other = m.other_ded ?? 0;
    const deductions = pf + pt + loan + advance + tds + other;
    return {
      employee_id: m.employee_id, name: m.name || rec?.name || m.employee_id, type,
      present: m.present, absent: m.absent, wo: m.wo, mo_st: m.mo_st, paid_days: m.pay_days, attendance: m.attendance ?? m.present, ot: m.ot,
      gross, basic_da: eBasic, hra: eHra, fixed_allowance: eFixed, conveyance: eConv, medical: eMed,
      site_allowance: site, arrears, earned,
      pf, pt, loan, advance, tds, other_ded: other, deductions, net: earned - deductions,
      hold: /hold/i.test(m.status) || /f ?& ?f|resign|terminat/i.test(m.status), rate_from: from, mobile: m.mobile,
    };
  });
  if (noRate) warnings.push(`${noRate} line${noRate === 1 ? "" : "s"} have no rate — neither in the rate list nor on the record — so earn nothing until one is given.`);
  return { rows, warnings };
}

/** The muster's lines as template variables — the attendance message. */
export function musterVars(m: MusterRow | undefined, monthLabel: string): Record<string, string> {
  const s = (v: number | null | undefined) => (v == null ? "" : String(v));
  return {
    month: monthLabel,
    category: m?.category || "", present_days: s(m?.present), absent_days: s(m?.absent), week_off: s(m?.wo), mo_st: s(m?.mo_st),
    paid_days: s(m?.pay_days), attendance_days: s(m?.present), compoff: s(m?.compoff), ot: s(m?.ot), late_marks: s(m?.late), lunch: s(m?.lunch),
    advance: s(m?.advance), leave_encash: s(m?.leave_encash), loan_deduction: s(m?.loan_ded), loan_taken: s(m?.loan_taken), site_allowance: s(m?.site_allowance),
  };
}

/** Lines the muster often leaves empty — blank in the message, not a missing variable. */
export const OPTIONAL_MUSTER_VARS = new Set(["compoff", "ot", "late_marks", "lunch", "advance", "leave_encash", "loan_deduction", "loan_taken", "site_allowance"]);
