"use client";
/**
 * The offer letter, laid out for paper.
 *
 * Everything Dr Raghu asked for on 24 Aug 2026 has to appear on EVERY page,
 * not just the first: the logo at the head, the DRAFT watermark behind the
 * text while it is still a draft, the validity line and the page number at
 * the foot.
 *
 * `position: fixed` is the mechanism — in print, a fixed element is painted
 * once per sheet, which is exactly the running header/footer behaviour that
 * CSS's own @page margin boxes would give if any browser implemented them.
 *
 * The page COUNT is the one thing that cannot be done in CSS at all, so it
 * is measured after layout: content height divided by the printable height
 * of an A4 page, and a numbered label is placed at each boundary.
 */
import { useEffect, useRef, useState } from "react";
import { LOGO } from "@/lib/logo";

/** A4 at 96dpi, less the margins below. */
const PAGE_H = 1122;
const MARGIN_TOP = 96;
const MARGIN_BOTTOM = 84;
const CONTENT_H = PAGE_H - MARGIN_TOP - MARGIN_BOTTOM;

export default function OfferPrint({ html, status, validDays, name, offerNo }: {
  html: string; status: string; validDays: number; name: string; offerNo: string;
}) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [pages, setPages] = useState(1);
  const isDraft = status === "Draft";

  useEffect(() => {
    const measure = () => {
      const h = bodyRef.current?.scrollHeight || 0;
      setPages(Math.max(1, Math.ceil(h / CONTENT_H)));
    };
    measure();
    // images and fonts change the height after first paint
    const t = window.setTimeout(measure, 400);
    window.addEventListener("resize", measure);
    return () => { window.clearTimeout(t); window.removeEventListener("resize", measure); };
  }, [html]);

  const validity = `Valid only when responded to by e-mail within ${validDays} days of the date above.`;

  return (
    <>
      <style>{`
        @page { size: A4; margin: ${MARGIN_TOP}px 56px ${MARGIN_BOTTOM}px 56px; }
        html, body { background: #F1EFE9; margin: 0; }
        @media print {
          html, body { background: #fff; }
          .no-print { display: none !important; }
          .sheet { box-shadow: none !important; margin: 0 !important; width: auto !important; padding: 0 !important; }
          .runner { position: fixed; }
        }
        @media screen {
          .sheet { width: 794px; margin: 74px auto 40px; background: #fff; padding: 48px 56px;
                   box-shadow: 0 2px 18px rgba(20,30,40,.14); }
        }
        .letter table { width: 100%; border-collapse: collapse; }
        .letter td, .letter th { page-break-inside: avoid; }
        .letter p, .letter li { orphans: 3; widows: 3; }
        .letter h3, .letter h4, .letter b { page-break-after: avoid; }
      `}</style>

      {/* the bar that is not part of the letter */}
      <div className="no-print" style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, background: "#16232F", color: "#fff",
        padding: "10px 16px", display: "flex", gap: 12, alignItems: "center", fontFamily: "system-ui, sans-serif", fontSize: 13,
      }}>
        <b>{name}</b>
        <span style={{ opacity: .7 }}>{offerNo}</span>
        <span style={{
          background: isDraft ? "#8A5B00" : "#0D7A3F", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700,
        }}>{isDraft ? "DRAFT" : status.toUpperCase()}</span>
        <span style={{ flex: 1 }} />
        <span style={{ opacity: .65, fontSize: 12 }}>{pages} page{pages === 1 ? "" : "s"}</span>
        <button onClick={() => window.print()} style={{
          background: "#E8600A", color: "#fff", border: "none", borderRadius: 5, padding: "6px 14px", fontWeight: 700, cursor: "pointer",
        }}>Save as PDF / Print</button>
      </div>

      {/* running header — painted once per sheet */}
      <div className="runner" style={{
        position: "fixed", top: 0, left: 0, right: 0, height: MARGIN_TOP,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "18px 56px 0", boxSizing: "border-box",
      }}>
        <img src={LOGO} alt="Nandan GSE" style={{ height: 26 }} />
        <div style={{ textAlign: "right", fontFamily: "Georgia, serif", fontSize: 10.5, color: "#8B8F87" }}>
          <div style={{ fontWeight: "bold", color: "#16232F", letterSpacing: ".06em" }}>
            {isDraft ? "DRAFT OFFER LETTER" : "OFFER LETTER"}
          </div>
          <div>{offerNo}</div>
        </div>
      </div>

      {/* the watermark, behind everything, while it is still a draft */}
      {isDraft && (
        <div className="runner" aria-hidden style={{
          position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
          pointerEvents: "none", zIndex: 0,
        }}>
          <div style={{
            transform: "rotate(-38deg)", fontFamily: "Georgia, serif", fontSize: 130, fontWeight: "bold",
            letterSpacing: ".08em", color: "#B3392E", opacity: 0.09, whiteSpace: "nowrap",
            WebkitPrintColorAdjust: "exact", printColorAdjust: "exact",
          }}>DRAFT</div>
        </div>
      )}

      {/* running footer */}
      <div className="runner" style={{
        position: "fixed", bottom: 0, left: 0, right: 0, height: MARGIN_BOTTOM,
        padding: "0 56px 16px", boxSizing: "border-box",
        display: "flex", alignItems: "flex-end", justifyContent: "space-between",
        fontFamily: "Georgia, serif", fontSize: 10, color: "#8B8F87",
        borderTop: "1px solid #DCD8CC", paddingTop: 8,
      }}>
        <span style={{ maxWidth: "72%" }}>{validity}</span>
        <span>Nandan GSE Private Limited</span>
      </div>

      {/* the letter, with a page number pinned at each sheet boundary */}
      <div className="sheet" style={{ position: "relative", zIndex: 1 }}>
        <div ref={bodyRef} className="letter" dangerouslySetInnerHTML={{ __html: html }} />
        {Array.from({ length: pages }, (_, i) => (
          <div key={i} aria-hidden style={{
            position: "absolute", left: 0, right: 0,
            top: (i + 1) * CONTENT_H - 20,
            textAlign: "center", fontFamily: "Georgia, serif", fontSize: 10, color: "#8B8F87",
          }}>
            Page {i + 1} of {pages}
          </div>
        ))}
      </div>
    </>
  );
}
