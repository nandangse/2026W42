import type { Slip } from "./salary-slip";
import { MONTHS } from "./salary-sheet";
import { inr } from "./fmt";
import { LOGO } from "./logo";
import { wordsOf } from "./slip-words";

/**
 * ONE PAYSLIP AS STANDALONE HTML, for the PDF that is e-mailed to a person
 * (Dr Raghu, 7 Sep 2026: "a separate mail to send to attach individual
 * salary slips to the mail to their personal mail id").
 *
 * The same A5 landscape sheet the print screen draws — same order, same
 * rules: no per-day rate, NET PAID at the foot with the amount in words, the
 * stamp where a seal belongs, and nothing hidden by an overflow.
 */
const dash = (v: string | null | undefined) => (v && v !== "N/A" ? v : "—");
const esc = (v: unknown) => String(v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));

export function slipHtml(s: Slip, month: number, year: number, opts: { draft?: boolean; stampUrl?: string } = {}): string {
  const period = `${MONTHS[month - 1]} ${year}`;
  const money = (label: string, rate: number | null | undefined, earned: number | null | undefined, ded: string, dv: number | null | undefined) =>
    `<tr><td>${label}</td>
     <td class="r">${rate == null ? "" : inr(rate)}</td>
     <td class="r">${earned == null ? "—" : inr(earned)}</td>
     <td>${ded}</td>
     <td class="r">${ded ? (dv == null ? "—" : inr(dv)) : ""}</td></tr>`;

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(period)} - ${esc(s.id)} - ${esc(s.name)}</title><style>
@page { size: 210mm 148mm; margin: 0; }
html,body { margin:0; font-family: Arial, Helvetica, sans-serif; color:#16232F; }
.slip { width:210mm; height:148mm; box-sizing:border-box; padding:4mm 5mm; font-size:7.6px; line-height:1.3;
        display:flex; flex-direction:column; position:relative; }
table { width:100%; border-collapse:collapse; }
td,th { border:1px solid #C9C6BD; padding:1.4px 4px; }
.r { text-align:right; font-variant-numeric: tabular-nums; }
.head { display:flex; align-items:center; justify-content:space-between; border-bottom:1.5px solid #16232F; padding-bottom:2px; margin-bottom:3px; }
.grow { flex:1 1 auto; min-height:0; }
.hd { background:#F4F2EC; font-weight:700; }
.net { background:#FFF9C4; }
.draft { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; pointer-events:none; }
.draft span { transform:rotate(-32deg); font-family:Georgia,serif; font-size:34px; font-weight:bold; color:#B3392E; opacity:.12; }
</style></head><body><div class="slip">
${opts.draft ? '<div class="draft"><span>DRAFT SALARY SLIP</span></div>' : ""}
<div class="head"><img src="${LOGO}" alt="Nandan GSE" style="height:14px"><b style="font-size:10px">Salary Statement for the Month of ${esc(period)}</b></div>

<table style="margin-bottom:3px"><tbody>
<tr><td style="width:34%"><b>Name:</b> ${esc(s.name)}</td><td style="width:22%"><b>Employee ID:</b> ${esc(s.id)}</td><td style="width:44%"><b>Designation:</b> ${esc(dash(s.designation))}</td></tr>
<tr><td><b>Category – Dept.:</b> ${esc(dash(s.category))} – ${esc(dash(s.department))}</td><td colspan="2"><b>UAN / PF No.:</b> ${esc(dash(s.uan))}${s.pf_no ? ` / ${esc(s.pf_no)}` : ""}</td></tr>
<tr><td><b>PAN:</b> ${esc(dash(s.pan))}</td><td><b>ESIC / MLWF:</b> ${esc(dash(s.esic_no))}${s.mlwf ? ` / ${esc(s.mlwf)}` : ""}</td><td><b>Aadhaar:</b> ${esc(dash(s.aadhaar))}</td></tr>
<tr><td><b>Pay Days:</b> ${inr(s.days_in_month)}</td><td><b>Present Days:</b> ${inr(s.attendance)}</td><td><b>Payment Days:</b> ${inr(s.paid_days)} · <b>Gross:</b> ${inr(s.gross_rate)}</td></tr>
</tbody></table>

<table style="margin-bottom:3px">
<thead><tr class="hd"><td style="width:26%">Earnings</td><td class="r" style="width:12%">Rate</td><td class="r" style="width:12%">Earned</td><td style="width:26%">Deductions</td><td class="r" style="width:12%">Deducted</td></tr></thead>
<tbody>
${money("Basic And DA", s.basic_rate, s.basic, "Provident Fund", s.pf)}
${money("HRA", null, s.hra, "Professional Tax", s.pt)}
${money("Conveyance", s.conv_rate, s.conveyance, "ESIC", s.esi)}
${money("Fixed Allowance", s.fixed_rate, s.fixed, "Advance", s.advance)}
${money("Medical Allowance", s.med_rate, s.medical, "Loan EMI", s.loan_ded)}
${money("Leave Encashment", null, s.leave_encash, "TDS Deduction", s.tds)}
${money("Site Allowance", null, s.site, "Other Deductions", s.other_ded)}
${money("Interim Bonus", null, s.bonus, "Lunch", s.lunch)}
${money("Arrears", null, s.arrears, "", null)}
<tr class="hd"><td>Total Earned</td><td></td><td class="r">${inr(s.total_earned)}</td><td>Total Deduction</td><td class="r">${inr(s.total_ded)}</td></tr>
</tbody></table>

<table><tbody>
<tr><td style="width:16%"><b>Leave Details</b></td><td>OB: ${s.leave_ob ?? "—"} + Earned: ${s.leave_added ?? "—"} − Used: ${s.leave_used ?? "—"} − Encashed: ${s.leave_encashed ?? "—"} = <b>Closing: ${s.leave_cb ?? "—"}</b></td></tr>
<tr><td><b>Loan Details</b></td><td>OB: ${inr(s.loan_ob)} + Added: ${inr(s.loan_added)} − Deducted: ${inr(s.loan_ded)} = <b>Closing: ${inr(s.loan_cb)}</b></td></tr>
<tr><td><b>Payment Mode</b></td><td>Bank – ${esc(dash(s.bank))} · A/c – ${esc(dash(s.account))} · IFSC – ${esc(dash(s.ifsc))}</td></tr>
</tbody></table>

<div class="grow"></div>

<table style="margin-top:3px"><tbody><tr class="net">
<td style="width:30%;font-weight:800;font-size:11px;padding:3px 6px">NET PAID ₹${inr(s.net)}</td>
<td style="font-size:7.6px"><b>Rupees ${esc(s.in_words || wordsOf(s.net))} only</b></td>
</tr></tbody></table>

<div style="display:flex;gap:8px;align-items:flex-end;margin-top:3px">
  <div style="font-size:6.6px;color:#5A6572;line-height:1.45;flex:1">
    Note: Leave of one year will be kept in balance (8 nos for Labour and 15 nos for Staff). Please note this.<br>
    Any issues please contact the HR Department or mail hr@nandan.co.in.<br>
    <b>This is a computer generated document and needs no signature when it reaches you from a Nandan GSE mail ID.</b>
  </div>
  ${opts.stampUrl ? `<img src="${opts.stampUrl}" alt="" style="height:46px;width:46px;object-fit:contain;opacity:.9">` : ""}
</div>
</div></body></html>`;
}
