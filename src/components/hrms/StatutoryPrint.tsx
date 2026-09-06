"use client";
/**
 * A statutory return register — PF, PT, MLWF, ESIC or TDS — for one frozen
 * month, read from the sheet alone. Each return lists only the people it
 * concerns (a PF return does not carry the contract hands), totals at the
 * foot, and names anything the sheet could not give.
 */
import { LOGO } from "@/lib/logo";
import { MONTHS } from "@/lib/salary-sheet";
import type { Slip } from "@/lib/salary-slip";
import { inr } from "@/lib/fmt";



interface Col { label: string; get: (s: Slip) => string | number | null; money?: boolean }

const RETURNS: Record<string, { title: string; note: string; include: (s: Slip) => boolean; cols: Col[]; sum: (s: Slip) => number }> = {
  pf: {
    title: "PF Return", note: "Everyone with a PF deduction this month. Employer share is filed from the challan, not this sheet.",
    include: (s) => (s.pf || 0) > 0,
    cols: [
      { label: "UAN", get: (s) => s.uan }, { label: "PF No", get: (s) => s.pf_no },
      { label: "Paid Days", get: (s) => s.paid_days },
      { label: "Earned Basic & DA", get: (s) => s.basic, money: true },
      { label: "PF (Employee)", get: (s) => s.pf, money: true },
    ],
    sum: (s) => s.pf || 0,
  },
  pt: {
    title: "PT Return", note: "Everyone with Professional Tax deducted this month.",
    include: (s) => (s.pt || 0) > 0,
    cols: [
      { label: "Gross Earned", get: (s) => s.total_earned, money: true },
      { label: "PT", get: (s) => s.pt, money: true },
    ],
    sum: (s) => s.pt || 0,
  },
  mlwf: {
    title: "MLWF Return", note: "Everyone carrying an MLWF number. The contribution amount is per the board's slab; the sheet does not carry it, so it is not invented here.",
    include: (s) => !!s.mlwf,
    cols: [
      { label: "MLWF No", get: (s) => s.mlwf },
      { label: "Category", get: (s) => s.category },
      { label: "Gross Earned", get: (s) => s.total_earned, money: true },
    ],
    sum: () => 0,
  },
  esic: {
    title: "ESIC Return", note: "Everyone with an ESI deduction this month.",
    include: (s) => (s.esi || 0) > 0,
    cols: [
      { label: "ESIC No", get: (s) => s.esic_no },
      { label: "Paid Days", get: (s) => s.paid_days },
      { label: "Gross Earned", get: (s) => s.total_earned, money: true },
      { label: "ESI (Employee)", get: (s) => s.esi, money: true },
    ],
    sum: (s) => s.esi || 0,
  },
  tds: {
    title: "TDS Return", note: "Everyone with tax deducted at source this month.",
    include: (s) => (s.tds || 0) > 0,
    cols: [
      { label: "PAN", get: (s) => s.pan },
      { label: "Category", get: (s) => s.category },
      { label: "Gross Earned", get: (s) => s.total_earned, money: true },
      { label: "TDS", get: (s) => s.tds, money: true },
    ],
    sum: (s) => s.tds || 0,
  },
};

export default function StatutoryPrint({ kind, month, year, slips, frozenBy }: {
  kind: string; month: number; year: number; slips: Slip[]; frozenBy: string;
}) {
  const R = RETURNS[kind] || RETURNS.pf;
  const rows = slips.filter(R.include).sort((a, b) => a.id.localeCompare(b.id));
  const total = rows.reduce((a, s) => a + R.sum(s), 0);
  const period = `${MONTHS[month - 1]} ${year}`;

  return (
    <>
      <style>{`
        @page { size: A4 portrait; margin: 10mm; }
        html, body { margin: 0; background: #EFEDE7; font-family: system-ui, sans-serif; color: #16232F; }
        .paper { max-width: 820px; margin: 0 auto; background: #fff; padding: 22px 26px; }
        table { width: 100%; border-collapse: collapse; font-size: 10px; }
        thead { display: table-header-group; }
        td, th { border: 1px solid #DCD8CC; padding: 3px 6px; }
        @media screen { .paper { margin: 16px auto; box-shadow: 0 2px 14px rgba(20,30,40,.12); } }
        @media print { html, body { background: #fff; } .no-print { display: none !important; } .paper { max-width: none; margin: 0; padding: 0; box-shadow: none; } }
      `}</style>

      <div className="no-print" style={{ background: "#16232F", color: "#fff", padding: "10px 16px", display: "flex", gap: 12, alignItems: "center", fontSize: 13, position: "sticky", top: 0, zIndex: 10 }}>
        <b>{R.title} — {period}</b>
        <span style={{ opacity: .7 }}>{rows.length} people</span>
        <span style={{ flex: 1 }} />
        {Object.keys(RETURNS).map((k) => (
          <a key={k} href={`?kind=${k}`} style={{ color: k === kind ? "#fff" : "#8FA1B3", fontWeight: 700, fontSize: 12, textDecoration: k === kind ? "underline" : "none" }}>{k.toUpperCase()}</a>
        ))}
        <button onClick={() => window.print()} style={{ background: "#E8600A", color: "#fff", border: "none", borderRadius: 5, padding: "6px 14px", fontWeight: 700, cursor: "pointer" }}>
          Save as PDF / Print
        </button>
      </div>

      <div className="paper">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "2px solid #16232F", paddingBottom: 8, marginBottom: 10 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO} alt="Nandan GSE" style={{ height: 24 }} />
          <div style={{ textAlign: "right" }}>
            <b style={{ fontSize: 15 }}>{R.title.toUpperCase()} — {period.toUpperCase()}</b>
            <div style={{ fontSize: 10, color: "#8B8F87" }}>frozen month · {String(frozenBy).split("·")[0].trim()} · figures from the salary sheet alone</div>
          </div>
        </div>
        <div style={{ fontSize: 10.5, color: "#5A6672", marginBottom: 8 }}>{R.note}</div>

        <table>
          <thead>
            <tr style={{ background: "#F4F2EC", fontWeight: 700 }}>
              <th style={{ textAlign: "left" }}>Emp ID</th>
              <th style={{ textAlign: "left", minWidth: 140 }}>Name</th>
              {R.cols.map((c) => <th key={c.label} style={{ textAlign: c.money ? "right" : "left" }}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((s, i) => (
              <tr key={s.id} style={{ background: i % 2 ? "#FBFAF6" : "#fff" }}>
                <td style={{ fontWeight: 700 }}>{s.id}</td>
                <td>{s.name}</td>
                {R.cols.map((c) => {
                  const v = c.get(s);
                  return <td key={c.label} style={{ textAlign: c.money ? "right" : "left", fontVariantNumeric: "tabular-nums", color: v == null || v === "" ? "#C9C6BD" : undefined }}>
                    {v == null || v === "" ? "—" : c.money ? inr(Number(v)) : String(v)}
                  </td>;
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: "#FFF9C4", fontWeight: 700 }}>
              <td colSpan={2}>TOTAL — {rows.length} people</td>
              {R.cols.map((c, i) => (
                <td key={c.label} style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {i === R.cols.length - 1 && total > 0 ? inr(total) : ""}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>

        <div style={{ marginTop: 10, fontSize: 9, color: "#8B8F87", display: "flex", justifyContent: "space-between" }}>
          <span>Generated from the frozen {period} salary sheet · dash = the sheet does not carry it</span>
          <span>Nandan GSE Private Limited</span>
        </div>
      </div>
    </>
  );
}
