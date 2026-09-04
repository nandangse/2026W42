"use client";
/**
 * Any HRMS letter, laid out for paper — the offer letter's press, made
 * general. The letterhead and footer ride in THEAD/TFOOT so every printed
 * sheet carries them (the one mechanism browsers honour); the DRAFT mark
 * stays fixed. See OfferPrint for why.
 */
import { useEffect, useRef, useState } from "react";
import { LOGO } from "@/lib/logo";

export default function LetterPrint({ html, kind, name, ref: refNo, draft, footer }: {
  html: string; kind: string; name: string; ref: string; draft?: boolean; footer?: string;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const [sheets, setSheets] = useState(1);
  useEffect(() => {
    const measure = () => setSheets(Math.max(1, Math.ceil((box.current?.scrollHeight || 0) / 930)));
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
        .letter tr { page-break-inside: avoid; }
        .letter p, .letter li { orphans: 3; widows: 3; }
        @media print {
          html, body { background: #fff; }
          .no-print { display: none !important; }
          .paper { width: auto; margin: 0; padding: 0; box-shadow: none; }
          .lt > thead { display: table-header-group; }
          .lt > tfoot { display: table-footer-group; }
          .mark { position: fixed; }
        }
      `}</style>
      <div className="bar no-print" style={{ background: "#16232F", color: "#fff", padding: "10px 16px", display: "flex", gap: 12, alignItems: "center", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
        <b>{name}</b>
        <span style={{ opacity: .7 }}>{kind}</span>
        <span style={{ opacity: .5 }}>{refNo}</span>
        {draft && <span style={{ background: "#8A5B00", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700 }}>DRAFT</span>}
        <span style={{ flex: 1 }} />
        <span style={{ opacity: .65, fontSize: 12 }}>about {sheets} page{sheets === 1 ? "" : "s"}</span>
        <button onClick={() => window.print()} style={{ background: "#E8600A", color: "#fff", border: "none", borderRadius: 5, padding: "6px 14px", fontWeight: 700, cursor: "pointer" }}>Save as PDF / Print</button>
      </div>
      {draft && (
        <div className="mark" aria-hidden style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
          <div style={{ transform: "rotate(-38deg)", fontFamily: "Georgia, serif", fontSize: 140, fontWeight: "bold", letterSpacing: ".08em", color: "#B3392E", opacity: 0.08, whiteSpace: "nowrap", WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}>DRAFT</div>
        </div>
      )}
      <div className="paper" style={{ position: "relative", zIndex: 1 }}>
        <table className="lt">
          <thead><tr><th style={{ textAlign: "left" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={LOGO} alt="Nandan GSE" style={{ height: 28 }} />
              <div style={{ textAlign: "right", fontFamily: "Georgia, serif", fontSize: 10, color: "#8B8F87", fontWeight: 400, lineHeight: 1.5 }}>
                <div style={{ fontWeight: 700, color: "#16232F", letterSpacing: ".05em" }}>{kind.toUpperCase()}</div>
                <div>{refNo}</div>
              </div>
            </div>
          </th></tr></thead>
          <tfoot><tr><td>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontFamily: "Georgia, serif", fontSize: 9.5, color: "#8B8F87" }}>
              <span>{footer || "Private & Confidential"}</span>
              <span>Nandan GSE Private Limited</span>
            </div>
          </td></tr></tfoot>
          <tbody><tr><td>
            <div ref={box} className="letter" style={{ paddingTop: 14 }} dangerouslySetInnerHTML={{ __html: html }} />
          </td></tr></tbody>
        </table>
      </div>
    </>
  );
}
