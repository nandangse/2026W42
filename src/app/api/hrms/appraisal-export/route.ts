import { requireHrms, errJson } from "@/lib/auth";
import { readBody } from "@/lib/validate";
import { buildAppraisalWorkbook, type ExportRow } from "@/lib/appraisal-xlsx";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * THE APPRAISAL SHEET, COLOURED, FROM THE BUTTON (Dr Raghu, 7 Sep 2026:
 * "give it to me as an Excel with colour, properly done, so that I can then
 * copy-paste it directly into the employee master sheet" — and, when I sent
 * him one by hand, "from the button").
 *
 * Built here rather than in the browser: a styled workbook needs ExcelJS,
 * and ExcelJS wants Node's streams. The rows come from the screen exactly as
 * they are filtered and sorted there, so what downloads is what he is
 * looking at — not a second query that might disagree with it.
 */
export async function POST(req: Request) {
  try {
    await requireHrms();
    const b = await readBody(req, { rows: "array" });
    const rows = (b.rows || []) as ExportRow[];
    const buf = await buildAppraisalWorkbook(rows, String(b.title || "Appraisal"));
    const name = `Employee master - old from Genie, new from the appraisal - ${new Date().toISOString().slice(0, 10)}.xlsx`;
    return new Response(new Uint8Array(buf), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${name}"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return errJson(e);
  }
}
