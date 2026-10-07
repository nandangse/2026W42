/**
 * Full and Final Settlement — the arithmetic and the six documents.
 *
 * Pure: no database, no React. The route stores what HR typed; this turns a
 * row into the statement and the letters, so the screen, the print page and
 * the letter that goes out all read from the same numbers.
 *
 * THE RULES, as the compensation sheet has them (src/lib/salary.ts):
 *   · a day of pay is gross / 26 (the sheet's own per-day rate)
 *   · leave is encashed at that per-day rate, on the balance HR enters
 *   · gratuity is 15/26 of Basic & DA per completed year, five years and up
 *   · bonus (Staff and Labour) is 10% of Basic & DA, for the months of the
 *     financial year served
 *   · notice shortfall is recovered at the per-day rate for the days short
 *   · PF is 12% of Basic & DA (capped at 1,800) pro-rata to the days paid; PT
 *     by the Maharashtra slab — neither for Management or the contract types
 * Every computed line can be overridden by HR on the row; the statement
 * prints the number used and says "as entered" where it was.
 */
import { LOGO } from "@/lib/logo";
import { NO_STATUTORY, CONTRACT_TYPES_SET, NO_HRA_NO_MEDICAL } from "@/lib/salary";
import { esc } from "@/lib/fmt";

export const FNF_STATUS = ["Open", "Calculated", "Letters issued", "Paid", "Closed"] as const;
export type FnfStatus = (typeof FNF_STATUS)[number];

export const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  Open: { bg: "#F4F2EC", fg: "#5A6672" },
  Calculated: { bg: "#DCE8F5", fg: "#1B3A5C" },
  "Letters issued": { bg: "#FFF3E8", fg: "#E8600A" },
  Paid: { bg: "#E6F4EA", fg: "#0D7A3F" },
  Closed: { bg: "#16232F", fg: "#fff" },
};

export interface Line { label: string; amount: number }
export interface CheckItem { item: string; done: boolean; remarks: string; by?: string | null; at?: string | null }

export const CHECKLIST_DEFAULT: string[] = [
  "Resignation received in writing and dated",
  "Resignation accepted; last working day agreed",
  "Handover of work, files and passwords to the reporting manager",
  "Knowledge transfer / replacement briefed",
  "Company laptop / desktop returned",
  "Company mobile handset and SIM returned",
  "ID card, keys, access cards returned",
  "Uniform, shoes and safety gear returned",
  "Tools, instruments and drawings returned to Stores",
  "No-dues from Stores",
  "No-dues from Accounts (advances, imprest, expense claims)",
  "No-dues from IT (mail, ERP, Genie, Drive access revoked)",
  "Attendance for the last month verified",
  "Leave balance verified",
  "Loan balance confirmed and recovery agreed",
  "PF exit filed (UAN date of exit) / ESIC exit",
  "Gratuity worked out (five years and up) and nomination on file",
  "TDS of the year worked out; Form 16 to follow",
  "Exit interview done",
  "Relieving letter and experience letter issued",
  "Drive folder renamed to Inactive - <id> - <name>",
  "Personal e-mail and mobile confirmed for future contact",
  "Full and final paid and payment reference recorded",
];

export interface FnfRow {
  id: string; fnf_no: string | null; employee_id: string; name: string;
  designation: string | null; department: string | null; emp_type: string | null; doj: string | null;
  done_on: string | null; resignation_date: string | null; exit_date: string | null; fnf_call_date: string | null;
  notice_days: number; reason: string | null;
  loan_closing: number; pending_expenses: number; tds_year: number; advance_paid: number; advance_to_pay: number;
  last_gross: number; basic_da: number; paid_days: number | null; month_days: number | null;
  leave_balance: number; gratuity_years: number;
  overrides: Record<string, number | null>; other_earn: Line[]; other_ded: Line[];
  checklist: CheckItem[]; remarks: string | null;
  resignation_text: string | null; acceptance_text: string | null; relieving_text: string | null;
  status: string; payment_mode: string | null; payment_ref: string | null; payment_date: string | null; paid_amount: number | null;
  created_by: string | null; created_at: string; updated_by?: string | null; updated_at: string;
}

export const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
export const rupees = (n: number | null | undefined) => (n == null ? "—" : Math.round(n).toLocaleString("en-IN"));
export const inr = (n: number | null | undefined) => (n == null ? "—" : `₹${rupees(n)}`);

export const dmy = (s: string | null | undefined) => {
  if (!s) return "—";
  const d = new Date(String(s).slice(0, 10) + "T00:00:00");
  return Number.isNaN(d.getTime()) ? String(s) : d.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
};
const daysBetween = (a: string | null, b: string | null) => {
  if (!a || !b) return null;
  const x = new Date(a.slice(0, 10) + "T00:00:00").getTime(), y = new Date(b.slice(0, 10) + "T00:00:00").getTime();
  if (Number.isNaN(x) || Number.isNaN(y)) return null;
  return Math.round((y - x) / 86400000);
};
export const daysInMonth = (iso: string | null) => {
  if (!iso) return 30;
  const d = new Date(iso.slice(0, 10) + "T00:00:00");
  return Number.isNaN(d.getTime()) ? 30 : new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
};
/** Financial-year months served up to the exit date (April = 1). */
const fyMonthsServed = (doj: string | null, exit: string | null) => {
  if (!exit) return 0;
  const e = new Date(exit.slice(0, 10) + "T00:00:00");
  const fyStart = new Date(e.getMonth() >= 3 ? e.getFullYear() : e.getFullYear() - 1, 3, 1);
  const from = doj && new Date(doj.slice(0, 10) + "T00:00:00") > fyStart ? new Date(doj.slice(0, 10) + "T00:00:00") : fyStart;
  const months = (e.getFullYear() - from.getFullYear()) * 12 + (e.getMonth() - from.getMonth()) + (e.getDate() >= 15 ? 1 : 0);
  return Math.max(0, Math.min(12, months));
};
export const yearsOfService = (doj: string | null, exit: string | null) => {
  const d = daysBetween(doj, exit);
  return d == null ? 0 : d / 365.25;
};

export interface StatementLine { label: string; amount: number; basis: string; key?: string; overridden?: boolean }
export interface Statement {
  earnings: StatementLine[]; deductions: StatementLine[];
  totalEarn: number; totalDed: number; net: number;
  perDay: number; noticeServed: number | null; noticeShort: number; years: number;
}

export function computeFnf(r: FnfRow): Statement {
  const t = String(r.emp_type || "").trim();
  const exempt = NO_STATUTORY.has(t);
  const contract = CONTRACT_TYPES_SET.has(t);
  const gross = num(r.last_gross), basic = num(r.basic_da);
  const monthDays = r.month_days || daysInMonth(r.exit_date);
  // per day: 26 for workers, the calendar days of the exit month for everybody else (Dr Raghu, 7 Oct 2026 — never a fixed divisor)
  const payDays = NO_HRA_NO_MEDICAL.has(t) ? 26 : monthDays || 30;
  const perDay = gross / payDays;
  const paidDays = r.paid_days == null ? (r.exit_date ? Number(r.exit_date.slice(8, 10)) : 0) : num(r.paid_days);
  const ov = r.overrides || {};
  const use = (key: string, computed: number) => {
    const o = ov[key];
    return { amount: o == null ? Math.round(computed) : Math.round(num(o)), overridden: o != null };
  };

  const E: StatementLine[] = [];
  const D: StatementLine[] = [];

  // salary for the days worked in the exit month
  const sal = use("salary", gross * (monthDays ? paidDays / monthDays : 0));
  E.push({ key: "salary", label: `Salary for ${paidDays} of ${monthDays} days`, amount: sal.amount, basis: `gross ${inr(gross)} × ${paidDays}/${monthDays}`, overridden: sal.overridden });

  const leave = use("leave_encash", perDay * num(r.leave_balance));
  E.push({ key: "leave_encash", label: `Leave encashment — ${num(r.leave_balance)} days`, amount: leave.amount, basis: `${num(r.leave_balance)} days × ${inr(perDay)} per day (gross / ${payDays})`, overridden: leave.overridden });

  const years = num(r.gratuity_years) || yearsOfService(r.doj, r.exit_date);
  const gratComputed = !contract && years >= 5 ? (15 / 26) * basic * Math.floor(years + 0.5) : 0;
  const grat = use("gratuity", gratComputed);
  if (grat.amount || years >= 4.5)
    E.push({ key: "gratuity", label: `Gratuity — ${years.toFixed(1)} years`, amount: grat.amount, basis: years >= 5 ? `15/26 × Basic & DA ${inr(basic)} × ${Math.floor(years + 0.5)} years` : "under five years — not payable", overridden: grat.overridden });

  const fyM = fyMonthsServed(r.doj, r.exit_date);
  const bonusComputed = (t === "Staff" || t === "Labour") ? basic * 0.10 * fyM : 0;
  const bonus = use("bonus", bonusComputed);
  if (bonus.amount || bonusComputed)
    E.push({ key: "bonus", label: `Bonus for ${fyM} months of the year`, amount: bonus.amount, basis: `10% of Basic & DA ${inr(basic)} × ${fyM} months`, overridden: bonus.overridden });

  if (num(r.pending_expenses)) E.push({ label: "Pending expenses / reimbursements", amount: Math.round(num(r.pending_expenses)), basis: "as entered" });
  if (num(r.advance_to_pay)) E.push({ label: "Advance to be paid", amount: Math.round(num(r.advance_to_pay)), basis: "as entered" });
  for (const l of r.other_earn || []) if (num(l.amount)) E.push({ label: l.label || "Other", amount: Math.round(num(l.amount)), basis: "as entered" });

  // deductions
  if (num(r.loan_closing)) D.push({ label: "Loan closing balance", amount: Math.round(num(r.loan_closing)), basis: "as entered" });
  if (num(r.advance_paid)) D.push({ label: "Advance already paid", amount: Math.round(num(r.advance_paid)), basis: "as entered" });

  const served = daysBetween(r.resignation_date, r.exit_date);
  const short = served == null ? 0 : Math.max(0, num(r.notice_days) - served);
  const notice = use("notice_recovery", perDay * short);
  if (notice.amount || short)
    D.push({ key: "notice_recovery", label: `Notice shortfall — ${short} days`, amount: notice.amount, basis: `${num(r.notice_days)} days' notice, ${served ?? 0} served; ${short} × ${inr(perDay)}`, overridden: notice.overridden });

  if (!exempt) {
    const pfFull = Math.min(Math.round(basic * 0.12), 1800);
    const pf = use("pf", pfFull * (monthDays ? paidDays / monthDays : 0));
    D.push({ key: "pf", label: "Provident Fund (employee)", amount: pf.amount, basis: `12% of Basic & DA, capped 1,800, × ${paidDays}/${monthDays}`, overridden: pf.overridden });
    const ptFull = gross > 10000 ? 200 : gross >= 7500 ? 175 : 0;
    const pt = use("pt", ptFull);
    D.push({ key: "pt", label: "Professional Tax", amount: pt.amount, basis: "Maharashtra slab for the month", overridden: pt.overridden });
  }
  if (num(r.tds_year)) D.push({ label: "TDS for the year", amount: Math.round(num(r.tds_year)), basis: "as entered" });
  for (const l of r.other_ded || []) if (num(l.amount)) D.push({ label: l.label || "Other", amount: Math.round(num(l.amount)), basis: "as entered" });

  const totalEarn = E.reduce((a, l) => a + l.amount, 0);
  const totalDed = D.reduce((a, l) => a + l.amount, 0);
  return { earnings: E, deductions: D, totalEarn, totalDed, net: totalEarn - totalDed, perDay, noticeServed: served, noticeShort: short, years };
}

/* ───────────────────────── the documents ───────────────────────── */

export const DOCS = [
  { key: "resignation", label: "Resignation", n: 1 },
  { key: "acceptance", label: "Resignation acceptance", n: 2 },
  { key: "relieving", label: "Relieving letter", n: 3 },
  { key: "checklist", label: "Closing checklist", n: 4 },
  { key: "calculation", label: "F&F calculation", n: 5 },
  { key: "letter", label: "F&F letter", n: 6 },
] as const;
export type DocKey = (typeof DOCS)[number]["key"];

const first = (name: string) => String(name || "").trim().split(/\s+/)[0] || "";

/** Default wording for the three letters — HR edits the text on the row. */
export function defaultTexts(r: FnfRow): { resignation: string; acceptance: string; relieving: string } {
  return {
    resignation:
`To,
The Managing Director,
Nandan GSE Pvt. Ltd.

Subject: Resignation from the post of ${r.designation || "—"}

Dear Sir,

I hereby tender my resignation from the post of ${r.designation || "—"} in the ${r.department || "—"} department with effect from ${dmy(r.resignation_date)}. I request that I be relieved on ${dmy(r.exit_date)} after serving the notice period.

I thank the company for the opportunity and the support during my time here, and I will complete the handover of my work before I leave.

Yours faithfully,

${r.name}
Employee ID ${r.employee_id}`,
    acceptance:
`Dear ${first(r.name)},

This is to acknowledge and accept your resignation dated ${dmy(r.resignation_date)} from the post of ${r.designation || "—"}.

Your last working day with Nandan GSE Pvt. Ltd. will be ${dmy(r.exit_date)}. You are requested to hand over your work, documents and company property to your reporting manager, and to complete the closing checklist with HR before that date. Your full and final settlement will be worked out and paid after the closing formalities, and you will be called for it on ${dmy(r.fnf_call_date)}.

We thank you for your service and wish you well.

For Nandan GSE Pvt. Ltd.`,
    relieving:
`TO WHOMSOEVER IT MAY CONCERN

This is to certify that ${r.name} (Employee ID ${r.employee_id}) was employed with Nandan GSE Pvt. Ltd. from ${dmy(r.doj)} to ${dmy(r.exit_date)}, last holding the post of ${r.designation || "—"} in the ${r.department || "—"} department.

${first(r.name)} has been relieved of all duties with effect from the close of business on ${dmy(r.exit_date)}, having completed the handover and the closing formalities.

We wish ${first(r.name)} success in all future endeavours.

For Nandan GSE Pvt. Ltd.`,
  };
}

const S = {
  body: "font-family:Georgia,'Times New Roman',serif;font-size:14px;line-height:1.7;color:#16232F;max-width:680px",
  h: "font-weight:bold;font-size:15px;margin:18px 0 6px",
  td: "border:1px solid #DCD8CC;padding:5px 7px;vertical-align:top",
  right: "border:1px solid #DCD8CC;padding:5px 7px;text-align:right;white-space:nowrap",
  small: "font-size:11.5px;color:#46545F",
};
const textToHtml = (t: string) => String(t || "").split(/\n{2,}/).map((p) => `<p style="margin:0 0 12px">${esc(p).replace(/\n/g, "<br>")}</p>`).join("");

function head(r: FnfRow, title: string, date: string | null, ref?: string) {
  return `<table width="100%" style="margin-bottom:14px;border-bottom:2px solid #16232F;padding-bottom:8px"><tr>
  <td><img src="${LOGO}" alt="Nandan GSE" style="height:30px;display:block"></td>
  <td align="right" style="font-family:Georgia,serif;font-size:10.5px;color:#8B8F87;line-height:1.5">Nandan GSE Private Limited<br>Khalapur, Maharashtra &middot; CBD Belapur, Navi Mumbai</td>
</tr></table>
<table width="100%" style="font-size:12px;color:#46545F;margin-bottom:8px"><tr><td>Ref: ${esc(ref || r.fnf_no || "")}</td><td align="right">Date: ${dmy(date)}</td></tr></table>
<div style="text-align:center;font-weight:bold;font-size:17px;letter-spacing:.04em;margin-bottom:14px">${esc(title)}</div>`;
}
const sign = (who = "Dr. Raghunandan Jagdish", role = "Founder, Managing Director &amp; CEO") =>
  `<p style="margin-top:34px"><b>${who}</b><br><span style="${S.small}">${role}</span></p>`;

export function fnfDocHtml(r: FnfRow, doc: DocKey, byName?: string): string {
  const t = defaultTexts(r);
  const st = computeFnf(r);
  switch (doc) {
    case "resignation":
      return `<div style="${S.body}">${head(r, "RESIGNATION LETTER", r.resignation_date, `Received ${dmy(r.resignation_date)}`)}${textToHtml(r.resignation_text || t.resignation)}
<p style="${S.small};margin-top:26px">Received by HR on ${dmy(r.resignation_date)} · Signature: ______________________</p></div>`;
    case "acceptance":
      return `<div style="${S.body}">${head(r, "ACCEPTANCE OF RESIGNATION", r.done_on || r.resignation_date)}
<div><b>${esc(r.name)}</b><br><span style="${S.small}">Employee ID ${esc(r.employee_id)} · ${esc(r.designation || "")} · ${esc(r.department || "")}</span></div>
${textToHtml(r.acceptance_text || t.acceptance)}${sign()}</div>`;
    case "relieving":
      return `<div style="${S.body}">${head(r, "RELIEVING LETTER", r.exit_date)}${textToHtml(r.relieving_text || t.relieving)}${sign()}</div>`;
    case "checklist": {
      const rows = (r.checklist || []).map((c, i) =>
        `<tr><td style="${S.right}">${i + 1}</td><td style="${S.td}">${esc(c.item)}</td><td style="${S.td};text-align:center;font-size:16px">${c.done ? "&#10003;" : "&#9744;"}</td><td style="${S.td}">${esc(c.remarks || "")}</td><td style="${S.td};${S.small}">${esc(c.by ? String(c.by).split("·")[0].trim() : "")}${c.at ? `<br>${dmy(c.at)}` : ""}</td></tr>`).join("");
      const done = (r.checklist || []).filter((c) => c.done).length;
      return `<div style="${S.body}">${head(r, "CLOSING CHECKLIST", r.done_on || r.exit_date)}
<div><b>${esc(r.name)}</b> · Employee ID ${esc(r.employee_id)} · ${esc(r.designation || "")} · ${esc(r.department || "")}<br><span style="${S.small}">Resigned ${dmy(r.resignation_date)} · Exit ${dmy(r.exit_date)} · ${done} of ${(r.checklist || []).length} done</span></div>
<table width="100%" style="border-collapse:collapse;font-size:12.5px;margin-top:12px">
<tr style="font-weight:bold;background:#F4F2EC"><td style="${S.right}">#</td><td style="${S.td}">Closing activity</td><td style="${S.td};text-align:center">Done</td><td style="${S.td}">Remarks</td><td style="${S.td}">By</td></tr>${rows}</table>
${r.remarks ? `<div style="${S.h}">Remarks</div>${textToHtml(r.remarks)}` : ""}
<p style="margin-top:28px;${S.small}">HR: ______________________ &nbsp;&nbsp; Reporting manager: ______________________ &nbsp;&nbsp; Employee: ______________________</p></div>`;
    }
    case "calculation":
    case "letter": {
      const line = (l: StatementLine) => `<tr><td style="${S.td}">${esc(l.label)}${l.overridden ? ` <span style="${S.small}">(as entered)</span>` : ""}<br><span style="${S.small}">${esc(l.basis)}</span></td><td style="${S.right}">${rupees(l.amount)}</td></tr>`;
      const table = `<table width="100%" style="border-collapse:collapse;font-size:13px">
<tr style="font-weight:bold;background:#F4F2EC"><td style="${S.td}">Earnings</td><td style="${S.right}">Rs.</td></tr>${st.earnings.map(line).join("")}
<tr style="font-weight:bold"><td style="${S.td}">Total earnings (A)</td><td style="${S.right}">${rupees(st.totalEarn)}</td></tr>
<tr style="font-weight:bold;background:#F4F2EC"><td style="${S.td}">Deductions</td><td style="${S.right}">Rs.</td></tr>${st.deductions.map(line).join("") || `<tr><td style="${S.td}" colspan="2">None</td></tr>`}
<tr style="font-weight:bold"><td style="${S.td}">Total deductions (B)</td><td style="${S.right}">${rupees(st.totalDed)}</td></tr>
<tr style="font-weight:bold;background:#FFF9C4;font-size:14px"><td style="${S.td}">Net ${st.net >= 0 ? "payable to" : "recoverable from"} ${esc(first(r.name))} (A − B)</td><td style="${S.right}">${rupees(Math.abs(st.net))}</td></tr></table>`;
      const facts = `<table width="100%" style="font-size:12.5px;margin:6px 0 12px"><tr>
<td>Employee ID <b>${esc(r.employee_id)}</b></td><td>Joined <b>${dmy(r.doj)}</b></td><td>Resigned <b>${dmy(r.resignation_date)}</b></td><td>Exit <b>${dmy(r.exit_date)}</b></td></tr><tr>
<td>Type <b>${esc(r.emp_type || "—")}</b></td><td>Last gross <b>${inr(r.last_gross)}</b>/month</td><td>Basic &amp; DA <b>${inr(r.basic_da)}</b></td><td>Notice ${esc(r.notice_days)} days · served ${st.noticeServed ?? "—"}</td></tr></table>`;
      if (doc === "calculation")
        return `<div style="${S.body}">${head(r, "FULL AND FINAL SETTLEMENT — STATEMENT", r.done_on)}
<div><b>${esc(r.name)}</b> · ${esc(r.designation || "")} · ${esc(r.department || "")}</div>${facts}${table}
<p style="${S.small};margin-top:10px">Per-day rate is gross ÷ 26. Lines marked "as entered" were set by HR over the computed figure. TDS is as worked out for the year; Form 16 follows.</p>
<p style="margin-top:26px;${S.small}">Prepared by: ${esc(byName || "HR")} &nbsp;&nbsp; Checked: ______________________ &nbsp;&nbsp; Approved: ______________________</p></div>`;
      const pay = r.payment_date || r.payment_ref
        ? `<p>The amount of <b>Rs. ${rupees(Math.abs(st.net))}/-</b> has been ${st.net >= 0 ? "paid to you" : "received from you"} by <b>${esc(r.payment_mode || "bank transfer")}</b>${r.payment_ref ? `, reference <b>${esc(r.payment_ref)}</b>` : ""}${r.payment_date ? ` on <b>${dmy(r.payment_date)}</b>` : ""}.</p>`
        : `<p>The net amount of <b>Rs. ${rupees(Math.abs(st.net))}/-</b> ${st.net >= 0 ? "will be paid to your bank account on record" : "is recoverable from you and may be paid to the company's account"} on or before <b>${dmy(r.fnf_call_date)}</b>.</p>`;
      return `<div style="${S.body}">${head(r, "FULL AND FINAL SETTLEMENT", r.done_on)}
<div><b>${esc(r.name)}</b><br><span style="${S.small}">Employee ID ${esc(r.employee_id)} · ${esc(r.designation || "")} · ${esc(r.department || "")}</span></div>
<p style="margin-top:14px">Dear ${esc(first(r.name))},</p>
<p>Further to your resignation dated ${dmy(r.resignation_date)} and your relieving on ${dmy(r.exit_date)}, your full and final settlement has been worked out as below.</p>
${facts}${table}${pay}
<p>This settles all dues between you and Nandan GSE Pvt. Ltd. Please sign the copy of this letter in acknowledgement. We thank you for your service and wish you well.</p>
${sign()}
<div style="border-top:1px solid #DCD8CC;margin-top:20px;padding-top:12px"><b>Acknowledgement</b><div>I, ${esc(r.name)}, have received my full and final settlement as set out above and have no further claim on the company.</div>
<div style="margin-top:20px;color:#8B8F87">Signature: ______________________ &nbsp; Date: ____________</div></div></div>`;
    }
  }
}

export const fnfNumber = (seq: number, d = new Date()) => {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `NGSE/FNF/${y}-${String(y + 1).slice(2)}/${String(seq).padStart(3, "0")}`;
};
