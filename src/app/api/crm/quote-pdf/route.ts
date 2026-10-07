import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { pressPdf } from "@/lib/pdf-press";
import { LOGO } from "@/lib/logo";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/crm/quote-pdf?id=<quotation> — the quote as a REAL PDF, pressed
 * by Chromium from the same pages Review Quote shows. No print dialog, no
 * slicing, footers exactly where the law puts them (Dr Raghu, 30 Aug 2026).
 */
export async function GET(req: Request) {
  try {
    await requireCrm();
    const u = new URL(req.url);
    const qid = String(u.searchParams.get("id") || "");
    if (!qid) throw new HttpError(400, "Which quotation?");
    /* THE PRESS LAYS THE PAGES (Dr Raghu, 7 Oct 2026) — the document comes
       as one flowing block per section (?press=1); the logo rides in the
       press's own header on every page and the footer carries the number,
       the date, Private and Confidential, and Page x of y. */
    const docUrl = new URL(`/api/crm/quote-doc?id=${encodeURIComponent(qid)}&press=1${u.searchParams.get("final") === "1" ? "&final=1" : ""}`, req.url);
    const htmlRes = await fetch(docUrl, { headers: { cookie: req.headers.get("cookie") || "" } });
    if (!htmlRes.ok) throw new HttpError(502, "Could not render the quote document.");
    const html = await htmlRes.text();
    /* the document's own title is its name: NGSE/QTN/26-27/40712 - Customer - Product (-R1 on a revision) */
    const title = (html.match(/<title>([^<]*)<\/title>/)?.[1] || `Quotation ${qid.slice(0, 8)}`).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    const { crmDb } = await import("@/crm/db");
    const { data: q } = await crmDb().from("quotation").select("quote_no, quoted_on").eq("id", qid).maybeSingle();
    const dIN = (v: unknown) => (v ? String(v).slice(0, 10).split("-").reverse().join("/") : "");
    const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
    const pdf = await pressPdf(html, {
      headerHtml: `<div style="width:100%;margin:0 14mm;padding:7mm 0 1.5mm;border-bottom:2px solid #1B3A5C;font-size:0"><img src="${LOGO}" style="height:11mm;object-fit:contain" /></div>`,
      footerHtml: `<div style="width:100%;margin:0 14mm;padding-top:1.5mm;border-top:1px solid #1B3A5C;display:flex;justify-content:space-between;font-family:Georgia,'Times New Roman',serif;font-size:8pt;color:#444">
        <span>Quotation No: ${esc(String(q?.quote_no || ""))} &nbsp;·&nbsp; Date: ${esc(dIN(q?.quoted_on))}</span>
        <span>Private and Confidential</span>
        <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
      marginTop: "22mm", marginBottom: "14mm",
    });
    const fileName = `${title.replace(/\//g, "-").replace(/[\\:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 150)}.pdf`;
    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${fileName.replace(/[^\x20-\x7E]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
    });
  } catch (e) {
    return errJson(e);
  }
}
