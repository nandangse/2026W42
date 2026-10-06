/**
 * THE PLAN PDF CANNOT BE PRINTED (Dr Raghu, 6 Oct 2026: "make this pdf non
 * printable. lock the printing. Only Raghu or pankaj can print. Add password
 * to print as NGSEwins26*").
 *
 * The file opens for anyone it reaches, with no password. Printing, copying
 * text out and editing are switched off by the PDF's own permissions, and the
 * owner password lifts them. Raghu and Pankaj are given the file without the
 * lock at all — they are the two who print it.
 *
 * WHAT THIS IS AND IS NOT. Acrobat, Chrome's viewer and Preview honour the
 * permissions; a determined person with free tools can strip them. It keeps
 * an honest reader from pressing Print — it is a lock on a door, not a safe.
 * Screenshots cannot be stopped by any document (the operating system takes
 * them), which is why every page also carries the reader's name: see
 * `watermark` in plan-pdf.ts.
 *
 * The password belongs in the Vercel environment as PLAN_PDF_PRINT_PASSWORD;
 * the value below is the one he gave, kept so the lock holds from the first
 * deploy.
 */
export const PRINT_HANDS = ["raghu@nandan.co.in", "pankajs@nandan.co.in"];
export const mayPrintPlan = (email: string | null | undefined) => PRINT_HANDS.includes(String(email || "").trim().toLowerCase());

const printPassword = () => String(process.env.PLAN_PDF_PRINT_PASSWORD || "NGSEwins26*");

export async function lockPdf(pdf: Buffer | Uint8Array): Promise<Buffer> {
  const { PDFDocument } = await import("@cantoo/pdf-lib");
  const doc = await PDFDocument.load(pdf);
  doc.encrypt({
    ownerPassword: printPassword(),
    userPassword: "",
    permissions: { printing: false, modifying: false, copying: false, annotating: false, fillingForms: false, contentAccessibility: true, documentAssembly: false },
  });
  return Buffer.from(await doc.save());
}
