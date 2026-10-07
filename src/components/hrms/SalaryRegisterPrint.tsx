"use client";
/**
 * The month's salary register, laid out for paper — see the page.tsx beside
 * the route for the ground rules. Landscape, because nineteen columns is a
 * ledger and a ledger lies on its side.
 *
 * Page 1 is the MIS: the headline totals, the earnings and deductions drawn
 * as bars, and the net-pay spread. Everything on it is summed from the
 * sheet's own lines — a column the sheet did not carry is named as absent,
 * not padded with zeroes that would read as "nothing was deducted".
 */
import { useMemo } from "react";
import { LOGO } from "@/lib/logo";
import { LEDGER_COLUMNS, MONTHS, REGISTER_COLUMNS, otOf, type SheetRow } from "@/lib/salary-sheet";
import { inr } from "@/lib/fmt";
import SalaryMis from "./SalaryMis";
import type { Mis } from "@/lib/salary-mis";

interface Sheet {
  id: string; month: number; year: number; status: string;
  file_name: string | null; uploaded_by: string | null; uploaded_at: string | null;
  staff_count: number | null; staff_value: number | null;
  labour_count: number | null; labour_value: number | null;
  total_count: number | null; total_salary: number | null;
  earned_pay: number | null; deductions: number | null; net_payable: number | null;
  paid_to_bank: number | null; frozen_by: string | null; frozen_at: string | null;
  rows: SheetRow[];
  mapping: { columns: Record<string, string>; warnings: string[] } | null;
}


const lakh = (n: number) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(2)} L` : `₹${inr(n)}`);
const who = (s: string | null) => String(s || "—").split("·")[0].trim();

/** Sum of one register column; null when the sheet never carried it. */
function colSum(rows: SheetRow[], key: keyof SheetRow): number | null {
  let any = false, sum = 0;
  for (const r of rows) {
    const v = r[key];
    if (v == null || typeof v === "string") continue;
    any = true; sum += Number(v) || 0;
  }
  return any ? Math.round(sum) : null;
}

export default function SalaryRegisterPrint({ sheet, mis }: { sheet: Sheet; mis?: Mis | null }) {
  const rows = sheet.rows || [];
  const title = `${MONTHS[sheet.month - 1]} ${sheet.year}`;

  // which register columns this sheet actually carried
  const present = useMemo(
    () => REGISTER_COLUMNS.filter((c) => rows.some((r) => r[c.key] != null)),
    [rows],
  );
  const absent = REGISTER_COLUMNS.filter((c) => !present.includes(c));

  const held = rows.filter((r) => r.hold);
  const ot = otOf(rows);

  /** The month by type, straight off the sheet's own Category column. */
  const byType = useMemo(() => {
    const m = new Map<string, { n: number; hold: number; earned: number; ded: number; net: number }>();
    for (const r of rows) {
      const t = r.type || "(no type)";
      const c = m.get(t) || { n: 0, hold: 0, earned: 0, ded: 0, net: 0 };
      c.n++; if (r.hold) c.hold++;
      c.earned += r.earned; c.ded += r.deductions; c.net += r.net;
      m.set(t, c);
    }
    return [...m.entries()].sort((a, b) => b[1].net - a[1].net);
  }, [rows]);

  const sums = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const c of REGISTER_COLUMNS) m.set(c.key as string, colSum(rows, c.key));
    return m;
  }, [rows]);

  const EARN_PARTS: [string, string][] = [
    ["basic_da", "Basic & DA"], ["hra", "HRA"], ["fixed_allowance", "Fixed"],
    ["conveyance", "Conveyance"], ["medical", "Medical"], ["site_allowance", "Site"], ["arrears", "Arrears"],
  ];
  const DED_PARTS: [string, string][] = [
    ["pf", "PF"], ["pt", "PT"], ["loan", "Loan"], ["advance", "Advance"], ["tds", "TDS"], ["other_ded", "Other"],
  ];
  const PART_COLORS = ["var(--blue)", "#3E6A96", "#7FA3C5", "#0D6E39", "#7FB89A", "#8A5B00"];
  const DED_COLORS = ["#B3392E", "#D9838B", "#8A5B00", "#C79A3B", "#5B3FA8", "#8B8F87"];

  // net-pay spread, in the sheet's own numbers
  const nets = rows.map((r) => r.net).filter((n) => n > 0).sort((a, b) => a - b);
  const buckets = useMemo(() => {
    if (nets.length < 3) return [];
    const max = nets[nets.length - 1];
    const step = Math.max(5000, Math.ceil(max / 8 / 5000) * 5000);
    const out: { lo: number; n: number }[] = [];
    for (let lo = 0; lo < max + step; lo += step) out.push({ lo, n: nets.filter((v) => v >= lo && v < lo + step).length });
    while (out.length && out[out.length - 1].n === 0) out.pop();
    return { list: out, step, maxN: Math.max(...out.map((b) => b.n), 1) } as unknown as { list: { lo: number; n: number }[]; step: number; maxN: number };
  }, [nets]) as { list: { lo: number; n: number }[]; step: number; maxN: number } | [];

  const Bars = ({ parts, colors, total }: { parts: [string, string][]; colors: string[]; total: number | null }) => {
    const vals = parts.map(([k]) => sums.get(k)).filter((v): v is number => v != null && v > 0);
    const denom = vals.reduce((a, b) => a + b, 0) || 1;
    return (
      <div>
        <div style={{ display: "flex", height: 22, borderRadius: 4, overflow: "hidden", border: "1px solid #DCD8CC" }}>
          {parts.map(([k, label], i) => {
            const v = sums.get(k);
            if (v == null || v <= 0) return null;
            return <div key={k} title={`${label} ${lakh(v)}`} style={{ width: `${(v / denom) * 100}%`, background: colors[i % colors.length] }} />;
          })}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 5, fontSize: 10 }}>
          {parts.map(([k, label], i) => {
            const v = sums.get(k);
            return (
              <span key={k} style={{ color: v == null ? "#C9C6BD" : "#46545F" }}>
                <span style={{ display: "inline-block", width: 8, height: 8, background: v == null ? "#EEECE6" : colors[i % colors.length], borderRadius: 2, marginRight: 3 }} />
                {label} <b>{v == null ? "not in sheet" : lakh(v)}</b>
              </span>
            );
          })}
          {total != null && <b style={{ marginLeft: "auto", fontSize: 11 }}>Total {lakh(total)}</b>}
        </div>
      </div>
    );
  };

  return (
    <>
      <style>{`
        /* A4 LANDSCAPE, AND THE WHOLE WIDTH ON THE PAGE (Dr Raghu, 7 Sep
           2026: "the right is all cut off"). A4 landscape is 297mm; less
           8mm of margin each side that is 281mm — about 1,060px — and the
           paper was 1,150px wide, so the last columns walked off the sheet.
           In print the paper takes the page's own width and the table is
           FIXED-LAYOUT, so the columns share what there is instead of each
           taking what it likes. */
        @page { size: A4 landscape; margin: 8mm; }
        html, body { margin: 0; background: #EFEDE7; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #16232F; }
        .paper { max-width: 1150px; margin: 0 auto; background: #fff; padding: 22px 26px; }
        /* On SCREEN the table keeps its natural widths and the paper scrolls
           sideways if it must — squeezing twenty columns into 1,150px turned
           every heading into "Gros…" and broke names across four lines.
           Fixed layout is for the PAGE, where the width really is finite. */
        table.reg { width: 100%; border-collapse: collapse; }
        .regwrap { overflow-x: auto; }
        .reg td.nm { white-space: nowrap; }
        .reg thead { display: table-header-group; }
        .reg thead th { page-break-inside: avoid; }
        .reg td, .reg th { border: 1px solid #DCD8CC; padding: 2.5px 4px; }
        @media screen { .paper { margin: 16px auto; box-shadow: 0 2px 14px rgba(20,30,40,.12); } }
        @media print {
          html, body { background: #fff; }
          .no-print { display: none !important; }
          /* THE PAPER IS THE PAGE, IN MILLIMETRES.
             width:100% is 100% OF THE BODY, and the body stretches to the
             widest thing on it — the charts above the register among them —
             so the register inherited a width larger than the sheet.
             A4 landscape is 297mm; less the 8mm margins, 281mm. Stated
             outright, nothing else on the page can stretch it.
             CONFIRMED CORRECT IN PRINT VIEW by Dr Raghu, 7 Sep 2026. The
             screenshots that looked cut off were the ON-SCREEN table, which
             scrolls sideways inside .regwrap by design. Do not "fix" this
             again on the strength of a screen capture. */
          .paper { width: 281mm !important; max-width: 281mm !important; margin: 0; padding: 0; box-shadow: none; overflow: hidden; }
          body { width: 281mm; }
          .paper table { max-width: 100% !important; }
          .paper svg { max-width: 100% !important; }
          .regwrap { overflow: visible; }
          /* small enough that twenty columns and a name still fit across A4
             landscape, and fixed so the columns share the width rather than
             each taking what it likes */
          table.reg { table-layout: fixed; }
          .reg { font-size: 6.4px !important; }
          .reg td, .reg th { padding: 1px 2px !important; overflow: hidden; }
          .reg td.nm { white-space: normal; word-break: break-word; }
          .reg tr { break-inside: avoid; }
          .pagebreak { break-after: page; page-break-after: always; }
        }
      `}</style>

      <div className="no-print" style={{ background: "var(--navy)", color: "#fff", padding: "10px 16px", display: "flex", gap: 12, alignItems: "center", fontSize: 13, position: "sticky", top: 0, zIndex: 10 }}>
        <b>Salary Register — {title}</b>
        <span style={{ opacity: .7 }}>{rows.length} lines · {sheet.status}</span>
        {absent.length > 0 && <span style={{ fontSize: 11, color: "var(--amber)" }}>{absent.length} column{absent.length === 1 ? "" : "s"} not in this sheet</span>}
        <span style={{ flex: 1 }} />
        <button onClick={() => window.print()} style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: 5, padding: "6px 14px", fontWeight: 700, cursor: "pointer" }}>
          Save as PDF / Print
        </button>
      </div>

      <div className="paper">
        {/* ═══ page 1 · the MIS ═══ */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "2px solid #16232F", paddingBottom: 8, marginBottom: 14 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO} alt="Nandan GSE" style={{ height: 26 }} />
          <div style={{ textAlign: "right" }}>
            <b style={{ fontSize: 16 }}>SALARY REGISTER — {title.toUpperCase()}</b>
            <div style={{ fontSize: 10.5, color: "#8B8F87" }}>
              {sheet.file_name} · uploaded by {who(sheet.uploaded_by)}
              {sheet.frozen_at ? ` · FROZEN by ${who(sheet.frozen_by)}` : " · draft, not yet frozen"}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "nowrap" }}>
          {([
            ["EMPLOYEES", String(sheet.total_count ?? rows.length), `${sheet.staff_count ?? "—"} staff · ${sheet.labour_count ?? "—"} labour`, "var(--blue)"],
            ["EARNED PAY", lakh(sheet.earned_pay || 0), "as the sheet gives it", "#0D6E39"],
            ["TOTAL DEDUCTIONS", lakh(sheet.deductions || 0), "", "#B3392E"],
            ["NET PAYABLE", lakh(sheet.net_payable || 0), "", "var(--navy)"],
            ["SALARIES ON HOLD", String(held.length),
              held.length ? `${lakh(held.reduce((a, r) => a + (r.net || r.earned || 0), 0))} withheld` : "none held", held.length ? "var(--red)" : "#0D6E39"],
            ["PAID TO BANK", sheet.paid_to_bank == null ? "—" : lakh(sheet.paid_to_bank),
              sheet.paid_to_bank != null && sheet.net_payable != null && Math.abs(sheet.paid_to_bank - sheet.net_payable) >= 1
                ? `${sheet.paid_to_bank > sheet.net_payable ? "+" : "−"}₹${inr(Math.abs(sheet.paid_to_bank - sheet.net_payable))} vs net`
                : "", "var(--accent)"],
          ] as const).map(([l, v, sub, c]) => (
            <div key={l} style={{ border: "1px solid #DCD8CC", borderTop: `3px solid ${c}`, borderRadius: 6, padding: "6px 10px", flex: "1 1 0", minWidth: 0 }}>
              <div style={{ fontSize: 8.5, letterSpacing: ".05em", color: "#8B8F87", fontWeight: 700 }}>{l}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: c, fontVariantNumeric: "tabular-nums" }}>{v}</div>
              {sub && <div style={{ fontSize: 9, color: "#8B8F87" }}>{sub}</div>}
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 14 }}>
          <div>
            <b style={{ fontSize: 12 }}>WHERE THE EARNINGS SIT</b>
            <div style={{ marginTop: 6 }}><Bars parts={EARN_PARTS} colors={PART_COLORS} total={sums.get("earned") ?? sheet.earned_pay} /></div>
          </div>
          <div>
            <b style={{ fontSize: 12 }}>WHERE THE DEDUCTIONS GO</b>
            <div style={{ marginTop: 6 }}><Bars parts={DED_PARTS} colors={DED_COLORS} total={sums.get("deductions") ?? sheet.deductions} /></div>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <b style={{ fontSize: 12 }}>BY TYPE — nos, earned, deductions, net paid</b>
          <table className="genie-table" style={{ borderCollapse: "collapse", fontSize: 10.5, marginTop: 5, minWidth: 560 }}>
            <thead><tr style={{ background: "#F4F2EC" }}>
              {["Type", "Nos", "On hold", "Earned", "Deductions", "Net Paid"].map((h, i) => (
                <th key={h} style={{ border: "1px solid #DCD8CC", padding: "2.5px 8px", textAlign: i ? "right" : "left" }}>{h}</th>))}
            </tr></thead>
            <tbody>
              {byType.map(([t, c]) => (
                <tr key={t}>
                  <td style={{ border: "1px solid #DCD8CC", padding: "2.5px 8px", fontWeight: 600 }}>{t}</td>
                  <td style={{ border: "1px solid #DCD8CC", padding: "2.5px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{c.n}</td>
                  <td style={{ border: "1px solid #DCD8CC", padding: "2.5px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: c.hold ? "var(--red)" : "#C9C6BD", fontWeight: c.hold ? 700 : 400 }}>{c.hold || "—"}</td>
                  <td style={{ border: "1px solid #DCD8CC", padding: "2.5px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{inr(c.earned)}</td>
                  <td style={{ border: "1px solid #DCD8CC", padding: "2.5px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{inr(c.ded)}</td>
                  <td style={{ border: "1px solid #DCD8CC", padding: "2.5px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{inr(c.net)}</td>
                </tr>
              ))}
              <tr style={{ background: "#FFF9C4", fontWeight: 700 }}>
                <td style={{ border: "1px solid #DCD8CC", padding: "2.5px 8px" }}>TOTAL</td>
                <td style={{ border: "1px solid #DCD8CC", padding: "2.5px 8px", textAlign: "right" }}>{rows.length}</td>
                <td style={{ border: "1px solid #DCD8CC", padding: "2.5px 8px", textAlign: "right", color: held.length ? "var(--red)" : undefined }}>{held.length || "—"}</td>
                <td style={{ border: "1px solid #DCD8CC", padding: "2.5px 8px", textAlign: "right" }}>{inr(byType.reduce((a, [, c]) => a + c.earned, 0))}</td>
                <td style={{ border: "1px solid #DCD8CC", padding: "2.5px 8px", textAlign: "right" }}>{inr(byType.reduce((a, [, c]) => a + c.ded, 0))}</td>
                <td style={{ border: "1px solid #DCD8CC", padding: "2.5px 8px", textAlign: "right" }}>{inr(byType.reduce((a, [, c]) => a + c.net, 0))}</td>
              </tr>
            </tbody>
          </table>
          {ot > 0 && (
            <div style={{ fontSize: 11, marginTop: 6 }}>
              <b>OT — booked as Site Allowance + HRA of Labour and Labour-Contract: {lakh(ot)}</b>
            </div>
          )}
        </div>

        {!Array.isArray(buckets) && buckets.list.length > 1 && (
          <div style={{ marginBottom: 10 }}>
            <b style={{ fontSize: 12 }}>NET PAY SPREAD</b>
            <svg viewBox={`0 0 700 120`} style={{ width: "100%", maxWidth: 760, display: "block", marginTop: 4 }}>
              {buckets.list.map((b, i) => {
                const bw = (700 - 20) / buckets.list.length;
                const h = (b.n / buckets.maxN) * 84;
                return (
                  <g key={i}>
                    <rect x={10 + i * bw + 2} y={100 - h} width={bw - 4} height={h} rx={2} fill="var(--blue)" opacity={0.85} />
                    {b.n > 0 && <text x={10 + i * bw + bw / 2} y={96 - h} textAnchor="middle" fontSize="9" fill="#46545F">{b.n}</text>}
                    <text x={10 + i * bw + bw / 2} y={113} textAnchor="middle" fontSize="8" fill="#8B8F87">
                      {b.lo >= 100000 ? `${(b.lo / 100000).toFixed(0)}L` : `${b.lo / 1000}k`}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        )}

        {absent.length > 0 && (
          <div style={{ fontSize: 10, color: "#8A5B00", background: "#FFF7E6", border: "1px solid #F5D9A8", borderRadius: 4, padding: "5px 8px" }}>
            Not carried by this sheet, so printed as a dash: {absent.map((c) => c.label).join(", ")}. For the past months the sheet is the only truth.
          </div>
        )}

        {/* ═══ the Salary MIS — three months, every head, beside the deliveries (7 Oct 2026) ═══ */}
        {mis && mis.months.length > 0 && <SalaryMis mis={mis} />}

        <div className="pagebreak" />

        {/* ═══ the register ═══ */}
        <div className="regwrap">
        <table className="reg genie-table" style={{ fontSize: 8.6 }}>
          <thead>
            <tr>
              <th colSpan={2 + REGISTER_COLUMNS.length} style={{ background: "var(--navy)", color: "#fff", textAlign: "left", padding: "4px 6px", fontSize: 10 }}>
                SALARY REGISTER — {title.toUpperCase()} · Nandan GSE Private Limited · {rows.length} employees
              </th>
            </tr>
            <tr style={{ background: "#F4F2EC" }}>
              <th style={{ textAlign: "left", width: "4%" }}>Emp ID</th>
              <th style={{ textAlign: "left", width: "13%", minWidth: 110 }}>Name</th>
              {REGISTER_COLUMNS.map((c) => (
                <th key={c.key as string} style={{ textAlign: "right", fontSize: 8, whiteSpace: "nowrap" }}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ background: r.hold ? "#FBEAE8" : i % 2 ? "#FBFAF6" : "#fff" }}>
                <td style={{ fontWeight: 700, whiteSpace: "nowrap", color: r.hold ? "var(--red)" : undefined }}>{r.employee_id || "—"}</td>
                <td className="nm" style={{ color: r.hold ? "var(--red)" : undefined }}>{r.name || "—"}{r.hold ? <b style={{ fontSize: 7.5 }}> · HOLD</b> : ""}</td>
                {REGISTER_COLUMNS.map((c) => {
                  const v = r[c.key];
                  return (
                    <td key={c.key as string} style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: v == null ? "#C9C6BD" : undefined, fontWeight: c.key === "net" || c.key === "earned" ? 700 : 400 }}>
                      {v == null ? "—" : typeof v === "string" ? v : inr(v as number)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: "#FFF9C4", fontWeight: 700 }}>
              <td colSpan={2}>TOTAL — {rows.length} employees</td>
              {REGISTER_COLUMNS.map((c) => {
                const v = sums.get(c.key as string);
                const isDays = c.key === "attendance" || c.key === "paid_days";
                return <td key={c.key as string} style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{v == null ? "—" : isDays ? "" : inr(v)}</td>;
              })}
            </tr>
          </tfoot>
        </table>
        </div>

        {/* THE LEAVE AND LOAN STATEMENT, its own sheet (Dr Raghu, 7 Sep 2026:
            "pdf is breaking"). Nine more columns on the money register made
            twenty-nine across A4 landscape, which no size can carry. These
            are a statement, not the month's arithmetic, so they follow with
            the ID and name repeated. */}
        <div className="pagebreak" />
        <div className="regwrap" style={{ marginTop: 10 }}>
        <table className="reg genie-table" style={{ fontSize: 8.6 }}>
          <thead>
            <tr>
              <th colSpan={2 + LEDGER_COLUMNS.length} style={{ background: "var(--navy)", color: "#fff", textAlign: "left", padding: "4px 6px", fontSize: 10 }}>
                LEAVE &amp; LOAN STATEMENT — {title.toUpperCase()} · Nandan GSE Private Limited · {rows.length} employees
              </th>
            </tr>
            <tr style={{ background: "#F4F2EC" }}>
              <th style={{ textAlign: "left", width: "6%" }}>Emp ID</th>
              <th style={{ textAlign: "left", width: "20%", minWidth: 110 }}>Name</th>
              {LEDGER_COLUMNS.map((c) => (
                <th key={c.key as string} style={{ textAlign: "right", fontSize: 8, whiteSpace: "nowrap" }}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ background: i % 2 ? "#FBFAF6" : "#fff" }}>
                <td style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{r.employee_id || "—"}</td>
                <td className="nm">{r.name || "—"}</td>
                {LEDGER_COLUMNS.map((c) => {
                  const v = r[c.key];
                  return (
                    <td key={c.key as string} style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: v == null ? "#C9C6BD" : undefined, fontWeight: String(c.key).endsWith("_cb") ? 700 : 400 }}>
                      {v == null ? "—" : typeof v === "string" ? v : inr(v as number)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        {/* the sign-off block — this page is printed, signed and kept, so the
            space above each name is for a pen, and the block never splits
            across a page break */}
        <div style={{ marginTop: 26, pageBreakInside: "avoid", breakInside: "avoid" }}>
          <div style={{ fontWeight: 800, fontSize: 12, letterSpacing: ".04em", borderTop: "2px solid #16232F", paddingTop: 10, marginBottom: 34 }}>
            APPROVED BY
          </div>
          <div style={{ display: "flex", gap: 24, justifyContent: "space-between" }}>
            {["COO", "CEO", "Accounts Head", "HR", "Operations Head"].map((who2) => (
              <div key={who2} style={{ flex: "1 1 0", textAlign: "center" }}>
                <div style={{ borderTop: "1px solid #16232F", paddingTop: 6, fontSize: 11, fontWeight: 700 }}>{who2}</div>
                <div style={{ fontSize: 9, color: "#8B8F87", marginTop: 2 }}>Signature &amp; date</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 9.5, color: "#8B8F87", marginTop: 14 }}>
            Salary Register — {title} · {rows.length} employees · Net payable ₹{inr(sheet.net_payable)} · verified against the register above.
          </div>
        </div>

        <div style={{ marginTop: 12, fontSize: 9, color: "#8B8F87", display: "flex", justifyContent: "space-between" }}>
          <span>Every figure from the uploaded sheet itself · dash = column not in that sheet</span>
          <span>Nandan GSE Private Limited</span>
        </div>
      </div>
    </>
  );
}
