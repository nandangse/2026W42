import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { pressPdf } from "@/lib/pdf-press";

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
    const docUrl = new URL(`/api/crm/quote-doc?id=${encodeURIComponent(qid)}${u.searchParams.get("final") === "1" ? "&final=1" : ""}`, req.url);
    const htmlRes = await fetch(docUrl, { headers: { cookie: req.headers.get("cookie") || "" } });
    if (!htmlRes.ok) throw new HttpError(502, "Could not render the quote document.");
    const pdf = await pressPdf(await htmlRes.text());
    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="quotation-${qid.slice(0, 8)}.pdf"`,
      },
    });
  } catch (e) {
    return errJson(e);
  }
}
