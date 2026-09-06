"use client";
/**
 * The offer letter, laid out for paper.
 *
 * WHY A TABLE. The letterhead and the footer have to appear on every sheet,
 * and the only mechanism browsers actually honour for that is a table's
 * THEAD and TFOOT, which are repeated on each printed page by definition.
 * The first version used `position: fixed` — which the specification allows
 * and Chrome renders as a blank page — so this is not stylistic preference,
 * it is the one approach that prints.
 *
 * The DRAFT watermark stays fixed: it is decoration, and if a browser paints
 * it once instead of five times the letter is still correct.
 */
import { useEffect, useRef, useState } from "react";
import { LOGO } from "@/lib/logo";

export default function OfferPrint({ html, status, validDays, name, offerNo }: {
  html: string; status: string; validDays: number; name: string; offerNo: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [sheets, setSheets] = useState(1);
  const isDraft = status === "Draft";
  const validity = `Valid only when responded to by e-mail within ${validDays} days of the date above.`;

  // for the on-screen count only — the printed page numbers come from the
  // browser's own footer, which is the only counter that can be trusted
  useEffect(() => {
    const measure = () => {
      const h = ref.current?.scrollHeight || 0;
      setSheets(Math.max(1, Math.ceil(h / 930)));
    };
    measure();
    const t = window.setTimeout(measure, 500);
    return () => window.clearTimeout(t);
  }, [html]);

  return (
    <>
      <style>{`
        @page { size: A4; margin: 14mm 12mm; }
        html, body { margin: 0; background: #EFEDE7; }
        .bar { position: sticky; top: 0; z-index: 40; }
        .paper { width: 210mm; margin: 0 auto; background: #fff; padding: 10mm 12mm; box-shadow: 0 2px 18px rgba(20,30,40,.14); }
        .lt { width: 100%; border-collapse: collapse; }
        .lt > thead > tr > th { padding: 0 0 8px; border-bottom: 2px solid #16232F; }
        .lt > tfoot > tr > td { padding: 8px 0 0; border-top: 1px solid #DCD8CC; }
        .letter table { width: 100%; border-collapse: collapse; }
        .letter td, .letter th { page-break-inside: avoid; }
        .letter p, .letter li { orphans: 3; widows: 3; }
        .letter b, .letter h3, .letter h4 { page-break-after: avoid; }
        @media print {
          html, body { background: #fff; }
          .no-print { display: none !important; }
          .paper { width: auto; margin: 0; padding: 0; box-shadow: none; }
          /* thead and tfoot repeat on every sheet — this is the whole trick */
          .lt > thead { display: table-header-group; }
          .lt > tfoot { display: table-footer-group; }
          .mark { position: fixed; }
        }
      `}</style>

      <div className="bar no-print" style={{
        background: "var(--navy)", color: "#fff", padding: "10px 16px",
        display: "flex", gap: 12, alignItems: "center", fontFamily: "system-ui, sans-serif", fontSize: 13,
      }}>
        <b>{name}</b>
        <span style={{ opacity: .7 }}>{offerNo}</span>
        <span style={{ background: isDraft ? "#8A5B00" : "var(--green)", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
          {isDraft ? "DRAFT" : status.toUpperCase()}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ opacity: .65, fontSize: 12 }}>about {sheets} page{sheets === 1 ? "" : "s"}</span>
        <span style={{ opacity: .55, fontSize: 11.5 }}>tick “Headers and footers” in the print box for page numbers</span>
        <button onClick={() => window.print()} style={{
          background: "var(--accent)", color: "#fff", border: "none", borderRadius: 5, padding: "6px 14px", fontWeight: 700, cursor: "pointer",
        }}>Save as PDF / Print</button>
      </div>

      {isDraft && (
        <div className="mark" aria-hidden style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
          pointerEvents: "none", zIndex: 0, overflow: "hidden",
        }}>
          <div style={{
            transform: "rotate(-38deg)", fontFamily: "Georgia, serif", fontSize: 140, fontWeight: "bold",
            letterSpacing: ".08em", color: "#B3392E", opacity: 0.08, whiteSpace: "nowrap",
            WebkitPrintColorAdjust: "exact", printColorAdjust: "exact",
          }}>DRAFT</div>
        </div>
      )}

      <div className="paper" style={{ position: "relative", zIndex: 1 }}>
        <table className="lt genie-table">
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={LOGO} alt="Nandan GSE" style={{ height: 28 }} />
                  <div style={{ textAlign: "right", fontFamily: "Georgia, serif", fontSize: 10, color: "#8B8F87", fontWeight: 400, lineHeight: 1.5 }}>
                    <div style={{ fontWeight: 700, color: "var(--navy)", letterSpacing: ".05em" }}>
                      {isDraft ? "DRAFT OFFER LETTER" : "OFFER LETTER"}
                    </div>
                    <div>{offerNo}</div>
                  </div>
                </div>
              </th>
            </tr>
          </thead>

          <tfoot>
            <tr>
              <td>
                <div style={{
                  display: "flex", justifyContent: "space-between", gap: 12,
                  fontFamily: "Georgia, serif", fontSize: 9.5, color: "#8B8F87",
                }}>
                  <span>{validity}</span>
                  <span>Nandan GSE Private Limited</span>
                </div>
              </td>
            </tr>
          </tfoot>

          <tbody>
            <tr>
              <td>
                <div ref={ref} className="letter" style={{ paddingTop: 14 }} dangerouslySetInnerHTML={{ __html: html }} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
