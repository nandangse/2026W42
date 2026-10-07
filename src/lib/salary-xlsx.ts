/**
 * THE FINALISED SALARY SHEET AS EXCEL (Dr Raghu, 7 Oct 2026: "Once I click
 * on the approve button here, it should then just generate the finalised
 * salary sheets. In that, the salary sheet, an Excel sheet, should be
 * generated automatically and populated, so that in future we don't have
 * to create it from the main document.")
 *
 * The layout is the Google Sheet's own Salary tab — "Nandan GSE Salary Sheet
 * 2026-27 - September 2026" — column for column, in its order, with its
 * banner row under the header and the header repeated as the third row, so
 * HR can lay it beside last month's tab and run the two in parallel until
 * the sheet is retired. Money is written as numbers, not as text with
 * commas. A column Genie does not keep (daily reporting, the WhatsApp
 * message text, the verifier) is left blank, never guessed.
 */
import * as XLSX from "xlsx";
import type { RegisterRow } from "@/lib/muster";
import { MONTHS } from "@/lib/salary-sheet";
import { inWords } from "@/lib/salary-slip";

type Rec = Record<string, string | null>;
export interface XlsxPerson { id: string; name: string; type: string; department: string | null; value: Rec }

export const SALARY_TAB_COLUMNS = [
  "Id", "Name", "Category", "Status", "Type", "Department", "Designation",
  "Basic & DA Rate", "Fix Allowance Rate", "Conveyance Rate", "Medical Allowance Rate", "Gross Salary Rate", "Per Day", "",
  "Attendance", "Daily Reporting_m", "OT_m", "Comp Of_m", "Late Coming_m", "Loan taken_m", "Advance_m", "Site Allow", "Days Leave Encashed", "Loan Deducted",
  "Pay  Days", "Payment Days Due", "Payment Days", "Leave Utilized",
  "Final Basic And DA Rate", "Earned Basic And DA", "HRA", "Fixed Allowance", "Conveyance", "Site Allowance", "Comp. Off Amt.", "Leave Encashment Amount", "Medical Allowance", "Interim Bonus", "Total Earnings",
  "PF", "PT", "ESI", "Lunch", "Advance", "Loan Deduction", "TDS Deduction", "Late Deduction", "Other Deductions", "Total Deductions", "Net payment",
  "Gender", "Loan OB", "Loan Added", "Loan Deducted", "Loan CB", "Leave OB", "Leave Added", "Leave Used", "Leave Encashed", "Leave CB",
  "Round Up", "To be paid Salary", "In words",
  "UAN No.", "PF No.", "ESIC No.", "Adhaar No.", "Mediclaim ID", "PAN No.", "PAN Link Status", "MLWF", "Name in Bank", "Bank Name", "Account NO", "Account No. 15 Digit", "Branch", "IFSC Code", "Personal Maild",
  "To Send", "Earned", "Deducted", "Paid", "Mobile No", "Whatapp Message", "Verified By", "Active", "Filename", "Arrears Payable", "Arrears to be paid later", "Three Months Attendance", "Reporting Manager",
] as const;

const n = (v: unknown): number | "" => (v == null || v === "" ? "" : Number(v) || 0);
const s = (v: unknown): string => (v == null ? "" : String(v));
const num = (v: unknown): number => Number(String(v ?? "").replace(/[₹,\s]/g, "")) || 0;

export function buildSalaryXlsx(rows: RegisterRow[], people: XlsxPerson[], month: number, year: number, fy: string): Buffer {
  const who = new Map(people.map((p) => [p.id, p]));
  const label = `${MONTHS[month - 1]} ${year}`;
  const days = new Date(year, month, 0).getDate();
  const dd = (d: number) => `${String(d).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
  const header = [...SALARY_TAB_COLUMNS] as string[];
  const data = rows.map((r) => {
    const p = who.get(r.employee_id);
    const v = (k: string) => s(p?.value[k]);
    const hold = r.hold && r.present > 0;
    const toPay = Number(r.to_pay) || 0;
    const roundUp = toPay > 0 ? Math.round((toPay - r.net) * 100) / 100 : 0;
    const gross = Number(r.gross) || 0;
    const rate = { basic: num(v("basic_da")), fixed: num(v("fixed_allowance")), conv: num(v("conveyance")), med: num(v("medical_allowance")) };
    const grossRate = gross || rate.basic + num(v("hra")) + rate.fixed + rate.conv + rate.med;
    const line: Record<string, unknown> = {
      "Id": r.employee_id, "Name": r.name, "Category": s(r.type), "Status": hold ? "HOLD" : "No", "Type": /f ?& ?f|resign|terminat/i.test(s((r as unknown as { status?: string }).status)) ? "F&F Due" : "Active",
      "Department": s(p?.department), "Designation": v("designation"),
      "Basic & DA Rate": rate.basic || "", "Fix Allowance Rate": rate.fixed || "", "Conveyance Rate": rate.conv || "", "Medical Allowance Rate": rate.med || "",
      "Gross Salary Rate": grossRate || "", "Per Day": n(r.per_day), "": "",
      "Attendance": n(r.attendance ?? r.present), "Daily Reporting_m": "", "OT_m": n(r.ot), "Comp Of_m": n(r.compoff_days), "Late Coming_m": "",
      "Loan taken_m": n(r.loan_taken), "Advance_m": n(r.advance), "Site Allow": "", "Days Leave Encashed": n(r.leave_encashed), "Loan Deducted": n(r.loan),
      "Pay  Days": n(r.pay_days), "Payment Days Due": n(r.days_due), "Payment Days": n(r.paid_days), "Leave Utilized": n(r.leave_used),
      "Final Basic And DA Rate": rate.basic || "", "Earned Basic And DA": n(r.basic_da), "HRA": n(r.hra), "Fixed Allowance": n(r.fixed_allowance), "Conveyance": n(r.conveyance),
      "Site Allowance": n(r.site_allowance), "Comp. Off Amt.": n(r.compoff_amt), "Leave Encashment Amount": n(r.encash_amt), "Medical Allowance": n(r.medical), "Interim Bonus": "",
      "Total Earnings": n(r.earned),
      "PF": n(r.pf), "PT": n(r.pt), "ESI": "", "Lunch": n(r.lunch), "Advance": n(r.advance), "Loan Deduction": n(r.loan), "TDS Deduction": n(r.tds), "Late Deduction": n(r.late_ded), "Other Deductions": n(r.other_ded),
      "Total Deductions": n(r.deductions), "Net payment": n(r.net),
      "Gender": v("gender"), "Loan OB": n(r.loan_ob), "Loan Added": n(r.loan_taken), "Loan CB": n(r.loan_cb),
      "Leave OB": n(r.leave_ob), "Leave Added": n(r.leave_earned), "Leave Used": n(r.leave_used), "Leave Encashed": n(r.leave_encashed), "Leave CB": n(r.leave_cb),
      "Round Up": roundUp, "To be paid Salary": toPay, "In words": toPay > 0 ? `Rupees ${inWords(toPay)} Only` : "",
      "UAN No.": v("uan_no"), "PF No.": v("pf_no"), "ESIC No.": v("esic_no"), "Adhaar No.": v("aadhaar"), "Mediclaim ID": v("mediclaim_id"), "PAN No.": v("pan"), "PAN Link Status": "", "MLWF": v("mlwf"),
      "Name in Bank": v("name_in_bank") || r.name, "Bank Name": v("bank_name"), "Account NO": v("account_no"), "Account No. 15 Digit": v("account_15") || v("account_no"), "Branch": v("branch"), "IFSC Code": v("ifsc"),
      "Personal Maild": v("personal_email"),
      "To Send": "", "Earned": n(r.earned), "Deducted": n(r.deductions), "Paid": toPay, "Mobile No": s(r.mobile || v("phone")), "Whatapp Message": "", "Verified By": "", "Active": hold ? "" : "Active",
      "Filename": "", "Arrears Payable": n(r.arrears), "Arrears to be paid later": "", "Three Months Attendance": "", "Reporting Manager": v("reporting_manager"),
    };
    // the second "Loan Deducted" column (the ledger's) carries the same figure as the deduction
    return header.map((h, i) => (h === "Loan Deducted" && i > 40 ? n(r.loan) : (line[h] ?? "")));
  });
  const col = (h: string) => header.indexOf(h);
  const sum = (h: string) => data.reduce((a, row) => a + (Number(row[col(h)]) || 0), 0);
  const banner: unknown[] = header.map(() => "");
  banner[col("Id")] = rows.length; banner[col("Name")] = label; banner[col("Status")] = rows.filter((r) => r.hold && r.present > 0).length;
  banner[col("Type")] = "Days in Month - >"; banner[col("Designation")] = days; banner[col("Basic & DA Rate")] = dd(1); banner[col("Fix Allowance Rate")] = dd(days);
  for (const h of ["Attendance", "OT_m", "Comp Of_m", "Loan taken_m", "Advance_m", "Days Leave Encashed", "Loan Deducted", "Pay  Days", "Payment Days Due", "Payment Days", "Leave Utilized",
    "Earned Basic And DA", "HRA", "Fixed Allowance", "Conveyance", "Site Allowance", "Comp. Off Amt.", "Leave Encashment Amount", "Medical Allowance", "Total Earnings",
    "PF", "PT", "Lunch", "Advance", "Loan Deduction", "TDS Deduction", "Late Deduction", "Other Deductions", "Total Deductions", "Net payment",
    "Loan OB", "Loan Added", "Loan CB", "Leave OB", "Leave Added", "Leave Used", "Leave Encashed", "Leave CB", "Round Up", "To be paid Salary", "Earned", "Deducted", "Paid", "Arrears Payable"]) banner[col(h)] = sum(h);
  banner[col("Gross Salary Rate")] = sum("Gross Salary Rate");
  banner[col("Active")] = rows.filter((r) => !(r.hold && r.present > 0)).length;
  const aoa: unknown[][] = [header, banner, header, ...data];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = header.map((h) => ({ wch: Math.min(28, Math.max(8, h.length + 2)) }));
  ws["!freeze"] = { xSplit: 2, ySplit: 3 };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, label.slice(0, 31));
  const notes = XLSX.utils.aoa_to_sheet([
    ["Nandan GSE Salary Sheet", fy, label],
    ["Made by Genie from the approved payroll run; every figure is the register's. Columns Genie does not keep are blank, never guessed."],
    ["Round Up = To be paid Salary − Net payment: the net is rounded UP to the next rupee; a salary on hold or with no attendance shows nought to pay."],
    ["Category is the register's type; Status says HOLD where the salary is held; Type says Active or F&F Due."],
  ]);
  XLSX.utils.book_append_sheet(wb, notes, "Notes");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer);
}

export const salaryXlsxName = (month: number, year: number, fy: string) => `Nandan GSE Salary Sheet ${fy} - ${MONTHS[month - 1]} ${year}.xlsx`;
export const fyOf = (month: number, year: number) => (month >= 4 ? `${year}-${String(year + 1).slice(2)}` : `${year - 1}-${String(year).slice(2)}`);
