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
  /** THE SHEET'S OWN ANSWER (7 Oct 2026) — when the upload is the Salary tab,
      what the Google Sheet computed for this person, head by head, so the
      register can be laid beside it: Total Earnings, Total Deductions, Net
      payment, To be paid Salary and every earning and deduction column. */
  sheet?: Record<string, number> | null;
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
  [/^id$/, "employee_id"],                       // the Salary tab calls it Id
  [/^name$/, "name"],
  [/^status$/, "status"],
  [/total present|^present( days?)?$/, "present"],
  [/^absent/, "absent"],
  [/^wo$|week ?off/, "wo"],
  [/^mo ?(nd|and|&) ?st|monthly off|^mo$/, "mo_st"],
  [/total pay|pay(able)? days/, "pay_days"],
  [/^category$|^type$/, "category"],
  [/^attendance$/, "attendance"],
  [/comp ?off?/, "compoff"],                     // "Comp Of_m" on the Salary tab
  [/^ot$|^ot m$|^ot hours|overtime/, "ot"],      // "OT_m" on the Salary tab
  [/late ?m|^late coming/, "late"],
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
  [/^design?t|^designation/, "designation"],
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
  /* THE SALARY TAB AS A MUSTER (Dr Raghu, 7 Oct 2026: "for the moment can we
     take from uploaded file?"). September's upload was the sheet's Salary
     tab, not its Muster tab: Id, Name, Category, Status, Type … Attendance
     … Pay Days — no day-by-day marks. It carries what the register needs
     (attendance, pay days, OT, comp-off, late, loan, advance, site, leave
     encashed, lunch, TDS, other deductions, mobile), so it is read: present
     is Attendance, pay days is Pay Days, the month and its days come off the
     banner's dates, and the day marks stay empty. */
  let salaryTab = false;
  if (headerRow < 0) {
    for (let r = 0; r < Math.min(grid.length, 6); r++) {
      const cells = (grid[r] || []).map((c) => norm(c));
      if (cells.includes("id") && cells.includes("attendance") && cells.some((c) => /pay days/.test(c))) { headerRow = r; salaryTab = true; break; }
    }
  }
  if (headerRow < 0) return { month: null, year: null, days: 0, rows: [], headerRow: 0, columns: {}, unmapped: [], warnings: ["No header row with Emp. Id and day columns (1/7 …) was found — and this is not the Salary tab either. Export the Muster tab of the month's sheet."] };

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
  let month = dayCols.length ? dayCols[0].m : null;
  // the year: a banner cell like "July 2026" above the header, else null
  let year: number | null = null;
  for (let r = 0; r < headerRow; r++) for (const c of grid[r] || []) { const m = /(20\d\d)/.exec(String(c ?? "")); if (m) { year = Number(m[1]); break; } }
  /* the Salary tab's banner (the row under its header) carries the month's
     first and last day as dd/mm/yyyy, and "Days in Month" beside the count */
  let daysInMonth = dayCols.length;
  let typeCol: number | undefined;
  /* the Salary tab's computed columns, by their exact names; a name that
     appears twice (Advance, Loan Deducted) takes its LAST column — the
     deduction side, which is the one the register compares against */
  const SHEET_HEADS: Record<string, string> = {
    "total earnings": "earned", "total deductions": "deductions", "net payment": "net", "to be paid salary": "to_pay", "round up": "round_up",
    "earned basic and da": "basic_da", "hra": "hra", "fixed allowance": "fixed_allowance", "conveyance": "conveyance", "medical allowance": "medical",
    "site allowance": "site_allowance", "comp off amt": "compoff_amt", "leave encashment amount": "encash_amt", "arrears payable": "arrears",
    "pf": "pf", "pt": "pt", "esi": "esi", "lunch": "lunch", "advance": "advance", "loan deduction": "loan", "tds deduction": "tds", "late deduction": "late_ded", "other deductions": "other_ded",
    "payment days": "paid_days", "leave utilized": "leave_used", "leave cb": "leave_cb", "loan cb": "loan_cb",
  };
  const sheetCols: Record<string, number> = {};
  if (salaryTab) {
    headers.forEach((h, i) => { if (norm(h) === "type") typeCol = i; const k = SHEET_HEADS[norm(h)]; if (k) sheetCols[k] = i; });
    const scan = [grid[headerRow + 1] || [], ...grid.slice(0, headerRow)];
    for (const row of scan) {
      for (const c of row) {
        const d = /^(\d{1,2})\/(\d{1,2})\/(20\d\d)$/.exec(String(c ?? "").trim());
        if (d) { month = Number(d[2]); year = Number(d[3]); daysInMonth = new Date(Number(d[3]), Number(d[2]), 0).getDate(); break; }
      }
      if (month) break;
    }
    warnings.push("Read from the Salary tab: attendance and pay days as the sheet totals them; no day-by-day marks, so week-offs and holidays are not separated and the muster print has no day grid.");
  }
  if (colOf.employee_id === undefined) warnings.push("No Emp. Id column.");
  if (!dayCols.length && !salaryTab) warnings.push("No day columns (1/7 … 31/7) — present and absent cannot be counted.");

  const rows: MusterRow[] = [];
  let dropped = 0;
  for (let r = headerRow + 1; r < grid.length; r++) {
    const line = grid[r] || [];
    const at = (k: keyof MusterRow) => (colOf[k] === undefined ? null : line[colOf[k] as number]);
    const id = String(at("employee_id") ?? "").trim();
    if (!/^\d{4}$/.test(id)) { if (String(line[0] ?? "").trim()) dropped++; continue; }
    // the Salary tab repeats its header as the third row — not a person
    if (salaryTab && norm(line[colOf.employee_id as number]) === "id") continue;
    const days = dayCols.map((c) => String(line[c.i] ?? "").trim().toUpperCase());
    const count = (re: RegExp) => days.filter((d) => re.test(d)).length;
    let present = n(at("present")) ?? count(/^P/);
    let absent = n(at("absent")) ?? count(/^A/);
    let wo = n(at("wo")) ?? count(/^WO/);
    let mo_st = n(at("mo_st")) ?? count(/^(MO|ST|H)/);
    let pay_days = n(at("pay_days")) ?? present + wo + mo_st + count(/^S$/);
    if (salaryTab) {
      present = n(at("attendance")) ?? present;
      pay_days = n(at("pay_days")) ?? present;
      wo = Math.max(0, pay_days - present);       // paid days not worked — week-offs and holidays together
      mo_st = 0;
      absent = Math.max(0, daysInMonth - pay_days);
    }
    /* on the Salary tab, Status says HOLD (or No) and Type says Active or
       F&F Due — both matter to the register, so the hold word wins and the
       type follows it */
    const statusCell = String(at("status") ?? "").trim();
    const typeCell = salaryTab && typeCol !== undefined ? String(line[typeCol] ?? "").trim() : "";
    const statusRaw = salaryTab ? (/hold/i.test(statusCell) ? `HOLD${typeCell ? ` · ${typeCell}` : ""}` : typeCell || statusCell) : statusCell;
    rows.push({
      employee_id: id, name: String(at("name") ?? "").trim(), status: statusRaw, category: String(at("category") ?? "").trim(),
      days, present, absent, wo, mo_st, pay_days,
      attendance: n(at("attendance")), compoff: n(at("compoff")), ot: n(at("ot")), late: n(at("late")), lunch: n(at("lunch")),
      loan_taken: n(at("loan_taken")), advance: n(at("advance")), site_allowance: n(at("site_allowance")), leave_encash: n(at("leave_encash")),
      loan_ded: n(at("loan_ded")), arrears: n(at("arrears")), tds: n(at("tds")), other_ded: n(at("other_ded")),
      location: String(at("location") ?? "").trim() || null, designation: String(at("designation") ?? "").trim() || null,
      department: String(at("department") ?? "").trim() || null, mobile: String(at("mobile") ?? "").replace(/\D/g, "") || null,
      sheet: salaryTab ? Object.fromEntries(Object.entries(sheetCols).map(([k, i]) => [k, n(line[i]) ?? 0])) : null,
    });
  }
  if (!rows.length) warnings.push("No lines with a four-digit Emp. Id were read.");
  if (dropped) warnings.push(`${dropped} line${dropped === 1 ? "" : "s"} without a four-digit Emp. Id left out (banners, totals).`);
  return { month, year, days: daysInMonth, rows, headerRow: headerRow + 1, columns, unmapped, warnings };
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
 * THE RULES, as Dr Raghu gave them on 4 Sep 2026 after the August sheet was
 * read line by line:
 *
 *   · Pay days: the calendar month for Staff and Management, 26 for Labour
 *     and contract types. Days due = present + week offs + MO/ST (the muster).
 *   · Leave: earned this month = present ÷ 10 (Staff) or ÷ 20 (workers);
 *     none for Management and contract types. Comp off is ADDED to the leave
 *     balance first. A shortfall against pay days is filled from the balance
 *     (leave first, when the balance is at or above the 15 / 8 minimum, then
 *     comp off); what comp off is left is encashed at the per-day rate.
 *   · Per day = gross ÷ pay days: 26 for workers, the calendar days of the
 *     month for everybody else (superseding the 4 Sep "÷ 26 for everyone"
 *     on 7 Sep, and the fixed 31 on 7 Oct 2026). Leave encashment and comp
 *     off are paid at it.
 *   · Earned basic = rate × payment days ÷ pay days.
 *   · HRA = 20% of earned basic for Staff and for workers alike. For workers
 *     it is the first part of their OT: OT pay = hours × basic ÷ 208, always
 *     single; the balance above the HRA is Site Allowance (with any flat site
 *     amount the muster carries); a shortfall below it is an Other Deduction.
 *   · Fixed allowance in full at 7 or more days present, else pro rata.
 *     Conveyance = rate × present ÷ the company's working days that month
 *     (calendar days less Sundays and the third Saturday, or what HR set on
 *     the run) — so a day worked beyond them earns conveyance too (Dr Raghu,
 *     5 Sep 2026). Medical, like fixed: in full at 7 or more days present,
 *     else pro rata (Dr Raghu, 5 Sep 2026).
 *   · PF 12% of earned basic capped at 1,800; PT by the slab, and ₹300 in
 *     February for the top slab; none for women earning up to 25,000
 *     (Dr Raghu, 5 Sep 2026); ESI never
 *     deducted (the company bears it); advance, loan, TDS, lunch and the
 *     late deduction (late marks × per day) as the muster carries them.
 */
export interface Ledger { leave_ob: number; loan_ob: number }
export interface RegisterRow {
  employee_id: string; name: string; type: string | null;
  present: number; absent: number; wo: number; mo_st: number; days_due: number; pay_days: number; paid_days: number; attendance: number; ot: number | null;
  per_day: number; gross: number; basic_da: number; hra: number; fixed_allowance: number; conveyance: number; medical: number;
  ot_pay: number; site_allowance: number; compoff_amt: number; encash_amt: number; arrears: number; earned: number;
  pf: number; pt: number; loan: number; advance: number; tds: number; lunch: number; late_ded: number; other_ded: number; deductions: number; net: number; to_pay: number;
  /** to-pay less net: the net rounded UP to the next rupee, as a column (Dr Raghu, 7 Oct 2026) */
  round_up: number;
  leave_ob: number; leave_earned: number; compoff_days: number; leave_used: number; leave_encashed: number; leave_cb: number;
  loan_ob: number; loan_taken: number; loan_cb: number;
  hold: boolean; rate_from: "rates" | "record" | "none"; mobile: string | null;
}
const r2 = (n: number) => Math.round(n * 100) / 100;
/**
 * The company's working days in a month: the calendar days less the Sundays
 * and the third Saturday (the paid holiday). Statutory holidays are not known
 * here — HR sets the figure on the run when one falls in the month.
 */
export function workingDaysFor(month: number, year: number): number {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let sundays = 0, saturdays = 0, thirdSat = 0;
  for (let d = 1; d <= days; d++) {
    const w = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
    if (w === 0) sundays++;
    if (w === 6) { saturdays++; if (saturdays === 3) thirdSat = 1; }
  }
  return days - sundays - thirdSat;
}

export function generateRegister(
  muster: Muster, rates: Rates | null,
  record: (id: string) => { type: string | null; get: (k: string) => unknown; name: string | null } | null,
  daysInMonth: number, ledger: (id: string) => Ledger | null = () => null,
  workingDays: number = 26, month: number = 0,
): { rows: RegisterRow[]; warnings: string[] } {
  const rateOf = new Map((rates?.rows || []).map((r) => [r.employee_id, r]));
  const warnings: string[] = [];
  const siteClash: string[] = [];
  const zeroAttendance: string[] = [];
  const workersShort: string[] = [];
  let noRate = 0;
  const rows = muster.rows.map((m) => {
    const rec = record(m.employee_id);
    const type = m.category || rec?.type || null;
    const t = String(type || "");
    const worker = /labour/i.test(t);
    const contractish = /contract|management/i.test(t);
    const payDays = worker || /contract/i.test(t) ? 26 : daysInMonth;
    const rr = rateOf.get(m.employee_id);
    let basic = 0, fixed = 0, conv = 0, med = 0, from: RegisterRow["rate_from"] = "none";
    if (rr && (rr.gross || rr.basic_da || rr.per_day)) {
      from = "rates";
      basic = rr.basic_da ?? 0; fixed = rr.fixed ?? 0; conv = rr.conveyance ?? 0; med = rr.medical ?? 0;
      if (!basic && rr.gross) basic = rr.gross - (rr.hra ?? 0) - fixed - conv - med;
      if (rr.per_day && !basic) basic = rr.per_day * payDays;   // the rate list divides by 26 or 31 by type (7 Sep 2026)
    } else if (rec) {
      basic = num(rec.get("Basic and DA")); fixed = num(rec.get("Fixed Allowance")); conv = num(rec.get("Conveyance")); med = worker ? 0 : num(rec.get("Medical Allowance"));
      if (basic) from = "record";
    }
    if (from === "none") noRate++;
    const hraRate = contractish ? 0 : basic * 0.2;
    const gross = basic + (worker ? 0 : hraRate) + fixed + conv + med;      // the rate as the sheet states it
    /**
     * THE PER-DAY IS THE IDP'S (Dr Raghu, 7 Sep 2026: "the per-day rate as
     * done in the IDP is the right one — please use that, the latest one").
     *
     * That is the gross over the person's own pay days: 26 for workers, the
     * calendar days of THIS month for everybody else — 30 in September, 28 in
     * February (Dr Raghu, 7 Oct 2026: "the calculation is being done with a
     * hard-coded 31, which is wrong … Only for workers, it is hard-coded to
     * 26"). Until today it divided by a fixed 31 whatever the month. It
     * replaces the older rule here, which took basic + HRA + fixed + medical
     * over 26 for everyone and left conveyance out — so two screens quoted
     * two different per-days for the same person. This one number drives
     * comp-off encashment, leave encashment and the late deduction, which is
     * where it is actually spent.
     */
    const perDay = gross / payDays;

    // ── leave and payment days ──
    const led = ledger(m.employee_id);
    const leaveOb = led?.leave_ob ?? num(rec?.get("Leave as on 31st june 2026"));
    const loanOb = led?.loan_ob ?? num(rec?.get("Loan as on 31st June 2026"));
    const earnsLeave = !contractish;
    const leaveEarned = earnsLeave ? r2(m.present / (worker ? 20 : 10)) : 0;
    const compDays = m.compoff ?? 0;
    const minBal = worker ? 8 : 15;
    const due = m.pay_days;
    let shortfall = Math.max(0, payDays - due);
    const available = leaveOb + leaveEarned;
    /**
     * NOBODY PRESENT, NOBODY PAID (Dr Raghu, 7 Oct 2026: "check 6177 — his
     * earning is 0 but the payment is made. DO NOT use the leaves of 0
     * attendance employees … if someone has 0 attendance NO payments to be
     * made to them"). Until today a person with no attendance still drew a
     * salary: the shortfall in pay days was quietly filled from his leave
     * balance, and the filled days earned. Now a month with nothing present
     * earns nothing, uses no leave, and goes on hold.
     *
     * A WORKER'S LEAVE IS NOT SPENT WITHOUT APPROVAL ("The leave balance of
     * the workers should not be used without approval"). For Labour the
     * balance stays where it is; the short days stay unpaid, and the run
     * says how many were short so the approvals can be taken. Staff keep the
     * rule they had: leave fills the gap when the balance stays above 15.
     */
    const nobodyPresent = m.present <= 0;
    /* ON HOLD, NOTHING EXTRA (Dr Raghu, 7 Oct 2026: "check the field called
       hold. If that is mentioned, it is due to a particular reason. Do not
       give them any extra things"). A held person earns what the attendance
       earns and no more: no leave spent to fill the gap, no comp-off used or
       encashed, no leave encashment, no arrears. The payment itself waits. */
    const onHold = /hold/i.test(m.status) || /f ?& ?f|resign|terminat/i.test(m.status);
    const noExtras = nobodyPresent || onHold;
    let leaveUsed = 0;
    /* THE FLOOR STAYS (Dr Raghu, 7 Oct 2026: "while giving leave to anybody,
       make sure that you hold the minimum days of leave that have to be
       there in the register, that is, 15 and 8"). Only what sits above the
       floor can be spent — 15 for staff, 8 for a worker — never the floor. */
    const spendable = Math.max(0, available - minBal);
    if (shortfall > 0 && earnsLeave && !worker && !noExtras && spendable > 0) { leaveUsed = Math.min(shortfall, spendable); shortfall -= leaveUsed; }
    if (shortfall > 0 && worker && !noExtras && available > 0) workersShort.push(m.employee_id);
    let compUsed = 0;
    if (shortfall > 0 && compDays > 0 && !noExtras) { compUsed = Math.min(shortfall, compDays); shortfall -= compUsed; }
    const compEncash = noExtras ? 0 : compDays - compUsed;
    const encashDays = noExtras ? 0 : (m.leave_encash ?? 0) + compEncash;
    const paidDays = nobodyPresent ? 0 : Math.min(payDays, due + leaveUsed + compUsed);
    if (nobodyPresent) zeroAttendance.push(m.employee_id);
    const leaveCb = r2(leaveOb + leaveEarned + compDays - leaveUsed - compUsed - compEncash - (noExtras ? 0 : (m.leave_encash ?? 0)));

    // ── earnings ──
    const f = payDays > 0 ? paidDays / payDays : 0;
    const eBasic = Math.round(basic * f);
    const hra = contractish ? 0 : Math.round(eBasic * 0.2);
    const eFixed = m.present >= 7 ? fixed : Math.round(fixed * m.present / 26);
    const eConv = workingDays > 0 ? Math.round(conv * m.present / workingDays) : 0;   // extra days earn extra conveyance
    const eMed = m.present >= 7 ? med : Math.round(med * m.present / 26);   // like fixed: full from 7 days, else pro rata
    const otPay = worker ? Math.round((m.ot ?? 0) * basic / 208) : 0;

    /**
     * SITE ALLOWANCE IS A FIXED ALLOWANCE (Dr Raghu, 7 Sep 2026: "site
     * allowance is to be given as a fixed allowance when somebody is on the
     * site. If the attendance is more than 7, then they will get the site
     * allowance. If the attendance is less than 7, they will get it only pro
     * rata").
     *
     * So it earns exactly the way Fixed and Medical earn: whole from seven
     * days present, and below that in proportion. It was being paid flat
     * before — a man on site for two days drew the same as a man there all
     * month.
     *
     * TWO SOURCES, BOTH PAID (Dr Raghu, 7 Oct 2026: "The site allowance
     * that comes into this, which is filled in the muster, is the actual
     * site allowance, which could be added in addition to what is there in
     * the calculation. Please do not discard that. For the 11 people, what
     * you discarded is wrong."). The rate list's site figure is the
     * STRUCTURE's allowance and earns like Fixed: whole from seven days
     * present, pro rata below. The muster's figure is the ACTUAL amount
     * drawn that month — days on site, as HR counted them — and is added as
     * written, never pro-rated and never dropped. From 7 Sep to 7 Oct the
     * muster's figure was thrown away wherever the rate list also spoke;
     * that was wrong, and this is the correction.
     */
    const siteFromRate = rr?.site ?? 0;
    const siteFromMuster = m.site_allowance ?? 0;
    if (siteFromRate > 0 && siteFromMuster > 0) siteClash.push(m.employee_id);
    const eSiteRate = m.present >= 7 ? siteFromRate : Math.round(siteFromRate * m.present / 26);
    const eSite = eSiteRate + siteFromMuster;
    // a worker's OT above his HRA has been carried in site allowance since
    // 4 Sep; that is OT money and is not pro-rated by days on site
    const site = worker ? eSite + Math.max(0, otPay - hra) : eSite;
    const otShort = worker && otPay < hra ? hra - otPay : 0;
    const compAmt = Math.round(compEncash * perDay);
    const encashAmt = noExtras ? 0 : Math.round((m.leave_encash ?? 0) * perDay);
    const arrears = noExtras ? 0 : (m.arrears ?? 0);
    const earned = nobodyPresent ? 0 : eBasic + hra + eFixed + eConv + eMed + site + compAmt + encashAmt + arrears;

    // ── deductions ──
    const exempt = NO_STATUTORY.has(t);
    const pf = !exempt && eBasic > 0 ? Math.min(Math.round(eBasic * 0.12), 1800) : 0;
    const female = /^f/i.test(String(rec?.get("gender") ?? ""));
    const pt = exempt || (female && earned <= 25000) ? 0 : earned > 10000 ? (month === 2 ? 300 : 200) : earned >= 7500 ? 175 : 0;   // Maharashtra: 300 in February for the top slab; women up to 25,000 exempt
    const loan = m.loan_ded ?? 0, advance = m.advance ?? 0, tds = m.tds ?? 0, lunch = m.lunch ?? 0;
    const lateDed = Math.round((m.late ?? 0) * perDay);
    const other = (m.other_ded ?? 0) + otShort;
    // nothing earned, nothing deducted: a loan or advance waits for a month with pay
    const deductions = nobodyPresent ? 0 : pf + pt + loan + advance + tds + lunch + lateDed + other;
    const net = earned - deductions;
    /* ROUNDED UP, NEVER PAID IN PAISE (Dr Raghu, 7 Oct 2026: "Have you done
       the round-up to the next integer, because we cannot give salaries as
       decimals? … the round-up should be coming as a column"). To-pay is the
       net taken up to the next rupee; a salary on hold or with no attendance
       pays nought; the difference stands in its own column. */
    const toPay = onHold || nobodyPresent ? 0 : Math.ceil(net);
    const roundUp = toPay > 0 ? r2(toPay - net) : 0;
    return {
      employee_id: m.employee_id, name: m.name || rec?.name || m.employee_id, type,
      present: m.present, absent: m.absent, wo: m.wo, mo_st: m.mo_st, days_due: due, pay_days: payDays, paid_days: r2(paidDays), attendance: m.attendance ?? m.present, ot: m.ot,
      per_day: Math.round(perDay), gross: Math.round(gross), basic_da: eBasic, hra, fixed_allowance: eFixed, conveyance: eConv, medical: eMed,
      ot_pay: otPay, site_allowance: site, compoff_amt: compAmt, encash_amt: encashAmt, arrears, earned,
      pf, pt, loan, advance, tds, lunch, late_ded: lateDed, other_ded: other, deductions, net, to_pay: toPay, round_up: roundUp,
      leave_ob: r2(leaveOb), leave_earned: leaveEarned, compoff_days: compDays, leave_used: r2(leaveUsed + compUsed), leave_encashed: r2(encashDays), leave_cb: leaveCb, loan_ob: Math.round(loanOb), loan_taken: m.loan_taken ?? 0, loan_cb: Math.round(loanOb + (m.loan_taken ?? 0) - loan),
      hold: nobodyPresent || onHold, rate_from: from, mobile: m.mobile,
    };
  });
  if (siteClash.length)
    warnings.push(`${siteClash.length} ${siteClash.length === 1 ? "person" : "people"} drew an actual site allowance from the muster ON TOP of the structure's (${siteClash.slice(0, 8).join(", ")}${siteClash.length > 8 ? " …" : ""}) — both are paid, as Dr Raghu directed on 7 Oct 2026.`);
  const held = rows.filter((r) => r.hold && r.present > 0);
  if (held.length)
    warnings.push(`${held.length} on HOLD (${held.slice(0, 10).map((r) => r.employee_id).join(", ")}${held.length > 10 ? " …" : ""}): earnings from attendance only — no leave spent, no comp-off or leave encashed, no arrears — and to-pay shown as nought until the hold is lifted.`);
  if (zeroAttendance.length)
    warnings.push(`${zeroAttendance.length} ${zeroAttendance.length === 1 ? "person" : "people"} with no attendance at all (${zeroAttendance.slice(0, 10).join(", ")}${zeroAttendance.length > 10 ? " …" : ""}) earn nothing this month, use no leave, and stand on hold — Dr Raghu, 7 Oct 2026.`);
  if (workersShort.length)
    warnings.push(`${workersShort.length} worker${workersShort.length === 1 ? "" : "s"} short of pay days (${workersShort.slice(0, 10).join(", ")}${workersShort.length > 10 ? " …" : ""}) — the leave balance is NOT used without approval; the short days stay unpaid until HR approves the leave.`);
  if (noRate) warnings.push(`${noRate} line${noRate === 1 ? "" : "s"} have no rate — neither in the rate list nor on the record — so earn nothing until one is given.`);
  return { rows, warnings };
}

/** The muster's lines as template variables — the attendance message. */
export function musterVars(m: MusterRow | undefined, monthLabel: string): Record<string, string> {
  const s = (v: number | null | undefined) => (v == null ? "" : String(v));
  return {
    month: monthLabel,
    employee_id: m?.employee_id || "",
    category: m?.category || "", present_days: s(m?.present), absent_days: s(m?.absent), week_off: s(m?.wo), mo_st: s(m?.mo_st),
    paid_days: s(m?.pay_days), attendance_days: s(m?.present), compoff: s(m?.compoff), ot: s(m?.ot), late_marks: s(m?.late), lunch: s(m?.lunch),
    advance: s(m?.advance), leave_encash: s(m?.leave_encash), loan_deduction: s(m?.loan_ded), loan_taken: s(m?.loan_taken), site_allowance: s(m?.site_allowance),
  };
}

/** Lines the muster often leaves empty — blank in the message, not a missing variable. */
export const OPTIONAL_MUSTER_VARS = new Set(["compoff", "ot", "late_marks", "lunch", "advance", "leave_encash", "loan_deduction", "loan_taken", "site_allowance"]);

/** The rules Generate runs on, in the words the screen shows beside the register (Dr Raghu, 4 Sep 2026). */
export const PAYROLL_RULES: { head: string; lines: string[] }[] = [
  { head: "Days", lines: [
    "Pay days: the calendar month for Staff and Management; 26 for Labour and contract types.",
    "Days due = present + week offs + MO/ST, from the muster.",
    "Paid days = days due + leave used + comp off used, up to pay days.",
  ] },
  { head: "Leave", lines: [
    "Earned this month = present ÷ 10 for Staff, ÷ 20 for workers. None for Management and contract types.",
    "Comp off is added to the leave balance first.",
    "A shortfall against pay days is filled from leave, when the balance is at or above the minimum (15 Staff, 8 workers), then from comp off.",
    "Comp off not used is encashed at the per-day rate. Leave encashment likewise.",
    "Closing balance = opening + earned + comp off − used − encashed. Opening comes from last month's register, else the record.",
  ] },
  { head: "Per day", lines: [
    "Per day = (gross + allowances, without conveyance) ÷ 26, for everyone.",
  ] },
  { head: "Earnings", lines: [
    "Basic & DA = rate × paid days ÷ pay days.",
    "HRA = 20% of earned basic, Staff and workers alike; none for Management and contract types.",
    "Workers' OT = hours × basic ÷ 208, always single. The HRA is the first part of it; the balance is carried in Site Allowance. OT below the HRA is an Other Deduction.",
    "Site allowance, like fixed: in full at 7 or more days present, else pro rata. It is taken from the rate list where that carries one, otherwise from the muster — one source, never both added together.",
    "Fixed allowance in full at 7 or more days present, else pro rata.",
    "Conveyance = rate × present ÷ the company's working days that month (calendar days less Sundays and the third Saturday, or what HR set on the run). A day worked beyond them earns conveyance too.",
    "Medical, like fixed: in full at 7 or more days present, else pro rata.",
    "Arrears as the muster carries them.",
  ] },
  { head: "Deductions", lines: [
    "PF = 12% of earned basic, capped at ₹1,800. Not for Management and contract types.",
    "PT: ₹200 above ₹10,000 earnings (₹300 in February), ₹175 from ₹7,500. Not for the exempt types, and not for women earning up to ₹25,000.",
    "ESI is never deducted from workers; the company bears it.",
    "Advance, loan deduction, TDS and lunch as the muster carries them.",
    "Late deduction = late marks × per day.",
    "To pay = net, rounded up to the rupee.",
  ] },
];
