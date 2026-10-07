import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { swallow } from "@/lib/swallow";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { crmDb, crmConfigured, CrmNotConfigured } from "@/crm/db";
import { myMailbox, accessTokenFor, gmailSendMixed } from "@/crm/gmail";
import { quoteVars, fillQuoteVars } from "@/crm/quote-vars";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/crm/quote-submit (Dr Raghu, 30 Aug 2026)
 *
 *   { quotation_id, mode: "review" | "client", to[], cc[], bcc[],
 *     subject, body_html, attach_paths[] }
 *
 * The quote goes out as a REAL PDF (Chromium renders the same pages Review
 * Quote shows — the DRAFT watermark stays for a review, leaves for the
 * client), through the sender's own Gmail, with any ticked attachments.
 * A client submission stamps the quote SUBMITTED (stage → Sent) and Edit
 * becomes Amend. Everything logs into Communication.
 */
export async function POST(req: Request) {
  try {
    const me = await requireCrm();
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    const db = crmDb();
    const body = await readBody(req, {});
    const qid = String(body.quotation_id ?? "");
    const mode = body.mode === "review" ? "review" : "client";
    if (!qid) throw new HttpError(400, "Which quotation?");

    const { data: q } = await db.from("quotation").select("*").eq("id", qid).maybeSingle();
    if (!q) throw new HttpError(404, "That quotation no longer exists.");

    const toList = (Array.isArray(body.to) ? body.to : []).map(String).filter(Boolean);
    const ccList = (Array.isArray(body.cc) ? body.cc : []).map(String).filter(Boolean);
    const bccList = (Array.isArray(body.bcc) ? body.bcc : []).map(String).filter(Boolean);
    if (!ccList.includes("sales@nandan.co.in")) ccList.push("sales@nandan.co.in");
    if (mode === "client" && !toList.length) throw new HttpError(400, "Nobody on To: — add the client's contact in the box above (their people come up as one press), or type the address by hand. Nothing has been sent.");
    const to = mode === "review" ? "raghu@nandan.co.in" : toList.join(", ");
    const subject = String(body.subject || `Submission of Qtn ${q.quote_no} : Dt ${String(q.quoted_on || "").slice(0, 10).split("-").reverse().join("/")}`).slice(0, 300);
    /**
     * THE LETTER'S VARIABLES — filled HERE too (Dr Raghu, 31 Aug 2026).
     *
     * They were not, and a quotation went to a client signed
     * "Warm regards, {{sales_person}}". The PDF filled them because the
     * substitution lived inside the PDF renderer; this route sends the same
     * covering letter as the email body and never passed it through anything.
     * Both now use the one implementation in @/crm/quote-vars.
     *
     * No escaping: the letter is already HTML the sender wrote, and escaping
     * a name into it a second time would print &amp; where an ampersand was.
     */
    const vars = await quoteVars(db, q as Record<string, unknown>);
    const bodyHtml = fillQuoteVars(
      String(body.body_html || q.letter_text || "<p>Please find our quotation enclosed.</p>"),
      vars,
    );

    // the sender's own Gmail — the road every CRM mail takes
    const mailbox = await myMailbox(me.profileId!);
    if (!mailbox) throw new HttpError(400, "Connect your Gmail first — CRM → Email → Connect. The quote sends from YOUR mailbox.");
    const token = await accessTokenFor(String(mailbox.id));

    // ---- the PDF: Chromium renders the same pages Review Quote shows ----
    const secret = req.headers.get("cookie") || "";
    /* the press lays the pages (7 Oct 2026) — the same flowing document the download uses */
    const docUrl = new URL(`/api/crm/quote-doc?id=${encodeURIComponent(qid)}&press=1${mode === "client" ? "&final=1" : ""}`, req.url);
    const htmlRes = await fetch(docUrl, { headers: { cookie: secret } });
    if (!htmlRes.ok) throw new HttpError(502, "Could not render the quote document.");
    const html = await htmlRes.text();

    let pdfB64: string;
    try {
      const { pressPdf } = await import("@/lib/pdf-press");
      const { LOGO } = await import("@/lib/logo");
      const dIN = (v: unknown) => (v ? String(v).slice(0, 10).split("-").reverse().join("/") : "");
      const escH = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
      pdfB64 = (await pressPdf(html, {
        headerHtml: `<div style="box-sizing:border-box;width:100%;height:18mm;margin:0 14mm;padding:5mm 0 0;font-size:0;line-height:0"><div style="box-sizing:border-box;height:13mm;border-bottom:2px solid #1B3A5C;padding-bottom:1.5mm"><img src="${LOGO}" style="height:11mm;object-fit:contain;display:block" /></div></div>`,
        footerHtml: `<div style="width:100%;margin:0 14mm;padding-top:1.5mm;border-top:1px solid #1B3A5C;display:flex;justify-content:space-between;font-family:Georgia,'Times New Roman',serif;font-size:8pt;color:#444"><span>Quotation No: ${escH(String(q.quote_no || ""))} &nbsp;·&nbsp; Date: ${escH(dIN(q.quoted_on))}</span><span>Private and Confidential</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
        marginTop: "26mm", marginBottom: "14mm",
      })).toString("base64");
    } catch (e) {
      throw new HttpError(502, `The PDF press jammed: ${e instanceof Error ? e.message : e}. On a Mac dev box set CHROME_PATH to a Chrome binary; on Vercel this works out of the box.`);
    }

    /* the PDF carries the document's own name — NGSE-QTN-26-27-40712 - Customer - Product.pdf — and
       rides only if the checklist says so (ticked by default) */
    const docTitle = (html.match(/<title>([^<]*)<\/title>/)?.[1] || String(q.quote_no)).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    const pdfName = `${docTitle.replace(/\//g, "-").replace(/[\\:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 150)}${mode === "review" ? " DRAFT" : ""}.pdf`;
    const attachPdf = body.attach_pdf !== false;
    const attachments: { name: string; mime: string; base64: string }[] = attachPdf ? [{ name: pdfName, mime: "application/pdf", base64: pdfB64 }] : [];
    // ticked extras — storage paths under the cards bucket
    const paths = (Array.isArray(body.attach_paths) ? body.attach_paths : []).map(String).filter(Boolean).slice(0, 12);
    for (const p of paths) {
      if (!/^(opp|note|library)\//.test(p)) continue;
      const { data: dl } = await db.storage.from("cards").download(p);
      if (!dl) continue;
      const buf = Buffer.from(await dl.arrayBuffer());
      if (buf.byteLength > 20 * 1024 * 1024) continue;
      attachments.push({ name: p.split("/").pop() || "file", mime: dl.type || "application/octet-stream", base64: buf.toString("base64") });
    }

    const gmailId = await gmailSendMixed(
      token, String(mailbox.email_address), to, subject, bodyHtml, attachments,
      mode === "client" ? ccList.join(", ") : undefined,
      mode === "client" && bccList.length ? bccList.join(", ") : undefined,
      me.displayName || undefined,
    );

    // ---- the record: quotation stamps + Communication ----
    const now = new Date().toISOString();
    if (mode === "client") {
      const { data: sent } = await db.from("stage").select("id").eq("code", "sent").maybeSingle();
      await db.from("quotation").update({
        status: "submitted", submitted_at: now, submitted_by: me.email,
        subject, ...(sent ? { stage_id: sent.id } : {}),
      }).eq("id", qid).then((r) => {
        // pre-0041 the enum lacks 'submitted' — the stamps still land
        if (r.error) return db.from("quotation").update({ submitted_at: now, submitted_by: me.email, subject, ...(sent ? { stage_id: sent.id } : {}) }).eq("id", qid);
      });
    } else {
      await db.from("quotation").update({ review_requested_at: now, subject }).eq("id", qid).then(() => null, () => null);
    }
    /**
     * WHAT WAS ACTUALLY SENT (Dr Raghu, 31 Aug 2026, reading the feed after
     * his first real submission: "this should show what was sent right?").
     *
     * It did not. The feed carried a one-line summary — subject, recipients,
     * a count of attachments — and the letter itself was nowhere: the body
     * went to Gmail and was forgotten, and the PDF was pressed, attached and
     * thrown away. Six months on, "what did we actually quote them?" had no
     * answer here, only in somebody's Sent folder.
     *
     * So the letter is kept whole, and the PDF is kept as a file. The
     * Communication row holds the real body; the interaction line remains as
     * the ledger entry it always was.
     *
     * Neither is allowed to break the send. The email has already gone by
     * this point — failing the request now would tell him it did not.
     */
    let pdfLink: { name: string; url: string } | null = null;
    try {
      const stamp = now.replace(/[:.]/g, "-");
      const safeNo = String(q.quote_no).replace(/[/\\]/g, "_");
      const path = `note/quotation/${qid}/${stamp}-${safeNo}${mode === "review" ? "-DRAFT" : ""}.pdf`;
      const { error: upErr } = await db.storage.from("cards")
        .upload(path, Buffer.from(pdfB64, "base64"), { contentType: "application/pdf" });
      if (!upErr) pdfLink = { name: `${safeNo}.pdf`, url: `/api/crm/opp-attach?path=${encodeURIComponent(path)}` };
    } catch (e) { swallow("crm/quote-submit", e); /* the copy is a convenience; the send already happened */ }

    try {
      await db.from("message").insert({
        channel: "email",
        direction: "outbound",
        external_id: gmailId ? String(gmailId) : null,
        subject,
        body_html: bodyHtml,
        body_text: String(bodyHtml).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 8000),
        from_handle: String(mailbox.email_address),
        to_handles: [...to.split(",").map((s: string) => s.trim()).filter(Boolean), ...(mode === "client" ? ccList : [])],
        attachments: pdfLink ? [pdfLink] : [],
        occurred_at: now,
        company_id: q.company_id, person_id: q.contact_id ?? null,
        opportunity_id: q.opportunity_id,
      });
    } catch (e) { swallow("crm/quote-submit", e); /* never let the ledger break a send that already went */ }

    await db.from("interaction").insert({
      kind: "Email", happened_at: now,
      company_id: q.company_id, opportunity_id: q.opportunity_id, quotation_id: qid,
      by_id: me.profileId,
      remark: mode === "client"
        ? `Quotation SUBMITTED to client — "${subject}" → ${to}${ccList.length ? ` · cc ${ccList.join(", ")}` : ""} · ${attachPdf ? "PDF + " : ""}${attachments.length - (attachPdf ? 1 : 0)} attachment${attachments.length - (attachPdf ? 1 : 0) === 1 ? "" : "s"}`
        : `Quotation sent to Dr Raghu for REVIEW — "${subject}" (DRAFT PDF)`,
    }).then(() => null, () => null);
    await db.from("crm_audit").insert({
      entity: "quotation", entity_id: qid, action: mode === "client" ? "submit_client" : "submit_review",
      after: { to, cc: ccList, subject, attachments: attachments.length, gmail_id: gmailId },
      by_user: me.profileId,
    }).then(() => null, () => null);

    return NextResponse.json({ ok: true, mode, to, attachments: attachments.length });
  } catch (e) {
    return errJson(e);
  }
}
