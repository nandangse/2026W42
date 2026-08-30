import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { crmDb, crmConfigured, CrmNotConfigured } from "@/crm/db";
import { myMailbox, accessTokenFor, gmailSendMixed } from "@/crm/gmail";

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
    const body = await req.json();
    const qid = String(body.quotation_id ?? "");
    const mode = body.mode === "review" ? "review" : "client";
    if (!qid) throw new HttpError(400, "Which quotation?");

    const { data: q } = await db.from("quotation").select("*").eq("id", qid).maybeSingle();
    if (!q) throw new HttpError(404, "That quotation no longer exists.");

    const toList = (Array.isArray(body.to) ? body.to : []).map(String).filter(Boolean);
    const ccList = (Array.isArray(body.cc) ? body.cc : []).map(String).filter(Boolean);
    const bccList = (Array.isArray(body.bcc) ? body.bcc : []).map(String).filter(Boolean);
    if (!ccList.includes("sales@nandan.co.in")) ccList.push("sales@nandan.co.in");
    if (mode === "client" && !toList.length) throw new HttpError(400, "Who does it go To?");
    const to = mode === "review" ? "raghu@nandan.co.in" : toList.join(", ");
    const subject = String(body.subject || `Submission of Qtn ${q.quote_no} : Dt ${String(q.quoted_on || "").slice(0, 10).split("-").reverse().join("/")}`).slice(0, 300);
    const bodyHtml = String(body.body_html || q.letter_text || "<p>Please find our quotation enclosed.</p>");

    // the sender's own Gmail — the road every CRM mail takes
    const mailbox = await myMailbox(me.profileId!);
    if (!mailbox) throw new HttpError(400, "Connect your Gmail first — CRM → Email → Connect. The quote sends from YOUR mailbox.");
    const token = await accessTokenFor(String(mailbox.id));

    // ---- the PDF: Chromium renders the same pages Review Quote shows ----
    const secret = req.headers.get("cookie") || "";
    const docUrl = new URL(`/api/crm/quote-doc?id=${encodeURIComponent(qid)}${mode === "client" ? "&final=1" : ""}`, req.url);
    const htmlRes = await fetch(docUrl, { headers: { cookie: secret } });
    if (!htmlRes.ok) throw new HttpError(502, "Could not render the quote document.");
    const html = await htmlRes.text();

    let pdfB64: string;
    try {
      const { pressPdf } = await import("@/lib/pdf-press");
      pdfB64 = (await pressPdf(html)).toString("base64");
    } catch (e) {
      throw new HttpError(502, `The PDF press jammed: ${e instanceof Error ? e.message : e}. On a Mac dev box set CHROME_PATH to a Chrome binary; on Vercel this works out of the box.`);
    }

    const attachments: { name: string; mime: string; base64: string }[] = [
      { name: `${String(q.quote_no).replace(/[/\\]/g, "_")}${mode === "review" ? " DRAFT" : ""}.pdf`, mime: "application/pdf", base64: pdfB64 },
    ];
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
    await db.from("interaction").insert({
      kind: "Email", happened_at: now,
      company_id: q.company_id, opportunity_id: q.opportunity_id, quotation_id: qid,
      by_id: me.profileId,
      remark: mode === "client"
        ? `Quotation SUBMITTED to client — "${subject}" → ${to}${ccList.length ? ` · cc ${ccList.join(", ")}` : ""} · PDF + ${attachments.length - 1} attachment${attachments.length === 2 ? "" : "s"}`
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
