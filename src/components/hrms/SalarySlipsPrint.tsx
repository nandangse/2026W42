"use client";
/**
 * A5 salary slips — the July 2026 Word slip, redrawn to print one per page.
 *
 * The OT / Comp Off / Late Mark / Late Deduction line the Word slip carried
 * is deliberately absent (Dr Raghu, 27 Aug 2026): those are inputs to the
 * computation, not statements a payslip should make.
 *
 * Each slip's screen bar shows the exact filename its PDF carries into the
 * person's Drive folder — "July 2026 - 6972 - Name" — so the print and the
 * filing use one name.
 */
import { LOGO } from "@/lib/logo";
import { MONTHS } from "@/lib/salary-sheet";
import type { Slip } from "@/lib/salary-slip";
import { inr } from "@/lib/fmt";


const dashless = (v: string | null) => (v && v !== "N/A" ? v : "—");

export default function SalarySlipsPrint({ month, year, picked, total, draft = false }: {
  month: number; year: number;
  picked: { label: string | null; slip: Slip }[];
  total: number;
  /** Before the freeze every slip says so, across its face. */
  draft?: boolean;
}) {
  const period = `${MONTHS[month - 1]} ${year}`;
  return (
    <>
      <style>{`
        /* A5 LANDSCAPE, EXACT (Dr Raghu, 27 Aug 2026): the sheet is
           210 × 148 mm and the slip box IS the sheet — zero page margin,
           the breathing room lives inside the box as padding, and the
           height is fixed with overflow hidden so no slip can ever push
           onto a second sheet and shift every slip after it. */
        @page { size: 210mm 148mm; margin: 0; }
        html, body { margin: 0; background: #EFEDE7; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #16232F; }
        .slip { width: 210mm; height: 148mm; box-sizing: border-box; margin: 0 auto 14px; background: #fff;
                padding: 6mm 7mm; font-size: 9.5px; line-height: 1.4; overflow: hidden; }
        .slip table { width: 100%; border-collapse: collapse; }
        .slip td, .slip th { border: 1px solid #C9C6BD; padding: 2px 5px; }
        .bandbar { width: 210mm; margin: 18px auto 4px; font-weight: 800; font-size: 13px; color: #1B3A5C; }
        @media screen { .slip { box-shadow: 0 2px 12px rgba(20,30,40,.12); } }
        @media print {
          html, body { background: #fff; }
          .no-print, .bandbar { display: none !important; }
          .slip { box-shadow: none; margin: 0; page-break-after: always; break-after: page; }
          .slip:last-child { page-break-after: auto; }
        }
      `}</style>

      <div className="no-print" style={{ background: "var(--navy)", color: "#fff", padding: "10px 16px", display: "flex", gap: 12, alignItems: "center", fontSize: 13, position: "sticky", top: 0, zIndex: 10 }}>
        <b>Salary Slips — {period}</b>
        {draft && <span style={{ background: "#8A5B00", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700 }}>DRAFT — month not frozen</span>}
        <span style={{ opacity: .7 }}>{picked.length} of {total} · A5, one per page</span>
        <span style={{ flex: 1 }} />
        <button onClick={() => window.print()} style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: 5, padding: "6px 14px", fontWeight: 700, cursor: "pointer" }}>
          Save as PDF / Print
        </button>
      </div>

      {picked.map(({ label, slip: s }) => (
        <div key={s.id}>
          <div className="bandbar">
            {label ? `${label} — ` : ""}filed as: {period} - {s.id} - {s.name}
          </div>
          <div className="slip" style={{ position: "relative", overflow: "hidden" }}>
            {draft && (
              <div aria-hidden style={{
                position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
                pointerEvents: "none", zIndex: 0,
              }}>
                <div style={{
                  transform: "rotate(-32deg)", fontFamily: "Georgia, serif", fontSize: 34, fontWeight: "bold",
                  letterSpacing: ".06em", color: "#B3392E", opacity: 0.12, whiteSpace: "nowrap",
                  WebkitPrintColorAdjust: "exact", printColorAdjust: "exact",
                }}>DRAFT SALARY SLIP</div>
              </div>
            )}
            {/* head */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "2px solid #16232F", paddingBottom: 4, marginBottom: 6 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={LOGO} alt="Nandan GSE" style={{ height: 18 }} />
              <b style={{ fontSize: 11.5 }}>Salary Statement for the Month of {period}</b>
            </div>

            {/* identity */}
            <table className="genie-table" style={{ marginBottom: 5 }}>
              <tbody>
                <tr>
                  <td style={{ width: "34%" }}><b>Name:</b> {s.name}</td>
                  <td style={{ width: "22%" }}><b>Employee ID:</b> {s.id}{s.hold && <b style={{ color: "var(--red)" }}> · HOLD</b>}</td>
                  <td style={{ width: "44%" }}><b>Designation:</b> {dashless(s.designation)}</td>
                </tr>
                <tr>
                  <td><b>Category – Dept.:</b> {dashless(s.category)} – {dashless(s.department)}</td>
                  <td colSpan={2}><b>UAN / PF No.:</b> {dashless(s.uan)}{s.pf_no ? ` / ${s.pf_no}` : ""}</td>
                </tr>
                <tr>
                  <td><b>PAN:</b> {dashless(s.pan)}</td>
                  <td><b>ESIC / MLWF:</b> {dashless(s.esic_no)}{s.mlwf ? ` / ${s.mlwf}` : ""}</td>
                  <td><b>Aadhaar:</b> {dashless(s.aadhaar)}</td>
                </tr>
                <tr>
                  <td><b>Pay Days:</b> {inr(s.days_in_month)}</td>
                  <td><b>Present Days:</b> {inr(s.attendance)}</td>
                  <td><b>Payment Days:</b> {inr(s.paid_days)} · <b>Gross:</b> {inr(s.gross_rate)} · <b>Per Day:</b> {inr(s.per_day)}</td>
                </tr>
              </tbody>
            </table>

            {/* money */}
            <table className="genie-table" style={{ marginBottom: 5 }}>
              <thead>
                <tr style={{ background: "#F4F2EC", fontWeight: 700 }}>
                  <td style={{ width: "26%" }}>Earnings</td>
                  <td style={{ width: "12%", textAlign: "right" }}>Rate</td>
                  <td style={{ width: "12%", textAlign: "right" }}>Earned</td>
                  <td style={{ width: "26%" }}>Deductions</td>
                  <td style={{ width: "12%", textAlign: "right" }}>Deducted</td>
                </tr>
              </thead>
              <tbody>
                {([
                  ["Basic And DA", s.basic_rate, s.basic, "Provident Fund", s.pf],
                  ["HRA", null, s.hra, "Professional Tax", s.pt],
                  ["Conveyance", s.conv_rate, s.conveyance, "ESIC", s.esi],
                  ["Fixed Allowance", s.fixed_rate, s.fixed, "Advance", s.advance],
                  ["Medical Allowance", s.med_rate, s.medical, "Loan EMI", s.loan_ded],
                  [s.compoff_amt ? `Leave Encashment (leave ${inr(s.leave_encash_amt)} + comp off ${inr(s.compoff_amt)})` : "Leave Encashment", null, s.leave_encash, "TDS Deduction", s.tds],
                  ["Site Allowance", null, s.site, "Other Deductions", s.other_ded],
                  ["Interim Bonus", null, s.bonus, "Lunch", s.lunch],
                  ["Arrears", null, s.arrears, "", null],
                ] as [string, number | null, number | null, string, number | null][]).map(([e, rate, earned, d, ded], i) => (
                  <tr key={i}>
                    <td>{e}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: rate == null ? "#C9C6BD" : undefined }}>{rate == null ? "" : inr(rate)}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{earned == null ? "—" : inr(earned)}</td>
                    <td>{d}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{d ? (ded == null ? "—" : inr(ded)) : ""}</td>
                  </tr>
                ))}
                <tr style={{ background: "#F4F2EC", fontWeight: 700 }}>
                  <td>Total Earned</td>
                  <td></td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{inr(s.total_earned)}</td>
                  <td>Total Deduction</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{inr(s.total_ded)}</td>
                </tr>
              </tbody>
            </table>

            {/* the answer */}
            <table className="genie-table" style={{ marginBottom: 5 }}>
              <tbody>
                <tr style={{ background: "#FFF9C4" }}>
                  <td style={{ width: "22%", fontWeight: 800, fontSize: 11 }}>NET PAY ₹{inr(s.net)}</td>
                  <td style={{ fontSize: 9 }}>
                    {s.in_words || ""}
                    {s.round_up != null && s.round_up !== 0 ? ` · Round off ${s.round_up > 0 ? "(+)" : "(−)"}${Math.abs(s.round_up).toFixed(2)}` : ""}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* balances + bank */}
            <table className="genie-table">
              <tbody>
                <tr>
                  <td style={{ width: "18%" }}><b>Leave Details</b></td>
                  <td>
                    OB: {s.leave_ob ?? "—"} + Earned: {s.leave_added ?? "—"}{s.compoff_days != null ? <> + Comp off: {s.compoff_days}</> : null} − Used: {s.leave_used ?? "—"} − Encashed: {s.leave_encashed ?? "—"}{s.compoff_days != null && s.compoff_encashed_days ? <> (of which comp off {s.compoff_encashed_days})</> : null} = <b>Closing: {s.leave_cb ?? "—"}</b>
                  </td>
                </tr>
                <tr>
                  <td><b>Loan Details</b></td>
                  <td>
                    OB: {inr(s.loan_ob)} + Added: {inr(s.loan_added)} − Deducted: {inr(s.loan_ded)} = <b>Closing: {inr(s.loan_cb)}</b>
                  </td>
                </tr>
                <tr>
                  <td><b>Payment Mode</b></td>
                  <td>Bank – {dashless(s.bank)} · A/c – {dashless(s.account)} · IFSC – {dashless(s.ifsc)}</td>
                </tr>
              </tbody>
            </table>

            <div style={{ fontSize: 8, color: "#5A6572", marginTop: 5, lineHeight: 1.5 }}>
              Note: Leave of one year will be kept in balance (8 nos for Labour and 15 nos for Staff). Please note this.<br />
              Any issues please contact the HR Department or mail hr@nandan.co.in · This is a computer generated document and does not need a signature.
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
