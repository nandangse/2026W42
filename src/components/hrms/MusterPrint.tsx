"use client";
/**
 * THE ATTENDANCE MUSTER, ON PAPER (Dr Raghu, 7 Sep 2026: "once you give me
 * the muster and the salary register for print, I can print it, sign it, and
 * then freeze it").
 *
 * The register had a print; the muster never did — and the muster is the one
 * that has to be signed, because it is the record of who was actually here.
 *
 * A4 landscape: thirty-one day columns cannot go portrait, and each cell is
 * one or two characters, so they cost little width. Sundays are shaded so the
 * week reads at a glance. The heading row repeats on every page and the
 * sign-off strip stands at the end.
 */
import { LOGO } from "@/lib/logo";
import { MONTHS } from "@/lib/salary-sheet";

export interface MRow {
  employee_id: string; name: string; status: string; category: string;
  days: string[]; present: number; absent: number; wo: number; mo_st: number; pay_days: number;
}

const MARK: Record<string, { bg: string; fg: string }> = {
  P: { bg: "", fg: "#16232F" },
  A: { bg: "#FBEDEA", fg: "#B3392E" },
  WO: { bg: "#F1F0EC", fg: "#8B8F87" },
  MO: { bg: "#F1F0EC", fg: "#8B8F87" },
};

export default function MusterPrint({ month, year, days, rows, status, sundays }: {
  month: number; year: number; days: number; rows: MRow[]; status: string; sundays: number[];
}) {
  const title = `${MONTHS[month - 1]} ${year}`;
  const sun = new Set(sundays);
  const T = rows.reduce((a, r) => ({
    present: a.present + (r.present || 0), absent: a.absent + (r.absent || 0), pay: a.pay + (r.pay_days || 0),
  }), { present: 0, absent: 0, pay: 0 });

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 8mm; }
          html, body { background: #fff; }
          .noprint { display: none !important; }
          .paper { width: auto !important; max-width: 100% !important; margin: 0 !important; padding: 0 !important; box-shadow: none !important; }
          .mu { font-size: 5.6px !important; }
          .mu thead { display: table-header-group; }
          .mu tr { break-inside: avoid; }
        }
        .paper { background:#fff; width: 281mm; margin: 0 auto 14px; padding: 8mm; box-shadow: 0 1px 4px rgba(0,0,0,.14); }
        .mu { width: 100%; border-collapse: collapse; font-size: 7px; table-layout: fixed; }
        .mu th, .mu td { border: 1px solid #C9C6BD; padding: 1px 2px; }
        .mu th { background: #16232F; color: #fff; font-weight: 700; }
        .mu td.c, .mu th.c { text-align: center; }
        .mu td.r, .mu th.r { text-align: right; font-variant-numeric: tabular-nums; }
        .mu tr:nth-child(even) td { background: #FAF9F6; }
      `}</style>

      <div className="noprint" style={{ textAlign: "center", padding: "10px 0", fontFamily: "system-ui, sans-serif" }}>
        <button onClick={() => window.print()} style={{ background: "var(--blue,#1D4E7E)", color: "#fff", border: 0, borderRadius: 6, padding: "7px 16px", fontWeight: 700, cursor: "pointer" }}>
          Print / Save as PDF
        </button>
        <div style={{ fontSize: 11.5, color: "#5A6572", marginTop: 5 }}>A4 <b>landscape</b> · {rows.length} people · {days} days</div>
      </div>

      <div className="paper" style={{ fontFamily: "system-ui, -apple-system, sans-serif", color: "#16232F" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, borderBottom: "2px solid #16232F", paddingBottom: 5, marginBottom: 7 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO} alt="Nandan GSE" style={{ height: 26 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800 }}>Nandan GSE Pvt Ltd — Attendance Muster</div>
            <div style={{ fontSize: 8.5, color: "#5A6572" }}>{title} · {rows.length} people · P present · A absent · WO week off · MO monthly off</div>
          </div>
          <div style={{ textAlign: "right", fontSize: 8, fontWeight: 700 }}>
            {status}{status !== "Frozen" && <div style={{ color: "#8A5B00" }}>DRAFT — not frozen</div>}
          </div>
        </div>

        <table className="mu">
          <colgroup>
            <col style={{ width: "3.4%" }} /><col style={{ width: "13%" }} />
            {Array.from({ length: days }, (_, i) => <col key={i} style={{ width: `${64 / days}%` }} />)}
            <col style={{ width: "3.2%" }} /><col style={{ width: "3.2%" }} /><col style={{ width: "3.2%" }} />
            <col style={{ width: "3.2%" }} /><col style={{ width: "3.6%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>ID</th><th>Name</th>
              {Array.from({ length: days }, (_, i) => (
                <th key={i} className="c" style={sun.has(i + 1) ? { background: "#4A3A26" } : undefined}>{i + 1}</th>
              ))}
              <th className="r">P</th><th className="r">A</th><th className="r">WO</th><th className="r">MO</th><th className="r">Pay</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.employee_id}>
                <td>{r.employee_id}</td>
                <td style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</td>
                {Array.from({ length: days }, (_, i) => {
                  const m = String(r.days?.[i] ?? "").trim().toUpperCase();
                  const k = MARK[m] || MARK[m.slice(0, 2)] || null;
                  return (
                    <td key={i} className="c" style={{ background: k?.bg || (sun.has(i + 1) ? "#F6F4EF" : undefined), color: k?.fg }}>{m}</td>
                  );
                })}
                <td className="r">{r.present}</td><td className="r">{r.absent}</td>
                <td className="r">{r.wo}</td><td className="r">{r.mo_st}</td><td className="r"><b>{r.pay_days}</b></td>
              </tr>
            ))}
            <tr style={{ background: "#EEECE6", fontWeight: 800 }}>
              <td colSpan={2 + days}>{rows.length} people</td>
              <td className="r">{T.present}</td><td className="r">{T.absent}</td>
              <td /><td /><td className="r">{T.pay}</td>
            </tr>
          </tbody>
        </table>

        {/* The strip that makes it a record: checked, stamped, signed. */}
        <div style={{ marginTop: 10, display: "flex", gap: 14, alignItems: "flex-end", breakInside: "avoid" }}>
          {["Prepared by", "Checked by", "Approved by"].map((r) => (
            <div key={r} style={{ flex: 1 }}>
              <div style={{ borderBottom: "1px solid #16232F", height: 26 }} />
              <div style={{ fontSize: 7.5, color: "#5A6572", marginTop: 2 }}>{r}</div>
            </div>
          ))}
          <div style={{ width: 120, textAlign: "right" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/nandan-stamp.png" alt="Nandan GSE Pvt Ltd" style={{ height: 56, maxWidth: 120, objectFit: "contain" }}
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
            <div style={{ fontSize: 7, color: "#5A6572" }}>Attendance Muster · {title}</div>
          </div>
        </div>
      </div>
    </>
  );
}
