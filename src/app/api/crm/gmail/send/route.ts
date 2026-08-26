import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { crmDb } from "@/crm/db";
import { accessTokenFor, gmailSend, myMailbox } from "@/crm/gmail";
import { variableValues, renderTemplate } from "@/crm/variables";

export const dynamic = "force-dynamic";

/**
 * POST /api/crm/gmail/send
 *   { to, subject, body, person_id?, company_id?, opportunity_id?, quotation_id?, sales_order_id? }
 *
 * Sends as the signed-in person's own connected mailbox, renders {{variables}}
 * against the record first, and logs the mail into the unified message table
 * so the Communication feed carries it at once.
 */
export async function POST(req: Request) {
  try {
    const user = await requireCrm();
    const mb = user.profileId ? await myMailbox(user.profileId) : null;
    if (!mb || mb.status !== "active")
      throw new HttpError(400, "Connect your Gmail first — Profile → Gmail connection.");
    const b = await req.json();
    const to = String(b.to ?? "").trim();
    const cc = String(b.cc ?? "").trim();
    const bcc = String(b.bcc ?? "").trim();
    const attachments = Array.isArray(b.attachments)
      ? (b.attachments as { name?: unknown; link?: unknown }[])
          .filter((a) => a && a.link)
          .map((a) => ({ name: String(a.name ?? "attachment"), link: String(a.link) }))
      : [];
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new HttpError(400, `${to || "(empty)"} is not an email address.`);
    const rawSubject = String(b.subject ?? "").trim();
    const rawBody = String(b.body ?? "").trim();
    if (!rawSubject || !rawBody) throw new HttpError(400, "A mail needs a subject and words.");

    const values = await variableValues({
      personId: b.person_id ?? null, companyId: b.company_id ?? null,
      opportunityId: b.opportunity_id ?? null, quotationId: b.quotation_id ?? null,
    });
    const subject = renderTemplate(rawSubject, values);
    let body = renderTemplate(rawBody, values);
    if (attachments.length) {
      body += "\n\n— Attachments (Google Drive) —\n"
        + attachments.map((a) => `${a.name}: ${a.link}`).join("\n");
    }

    const token = await accessTokenFor(String(mb.id));
    const gmailId = await gmailSend(token, String(mb.email_address), to, subject, body, cc || undefined, bcc || undefined, user.displayName || undefined);

    const db = crmDb();
    await db.from("message").upsert([{
      channel: "email", direction: "outbound", external_id: gmailId,
      subject, body_text: body, from_handle: mb.email_address,
      to_handles: [to, ...(cc ? [cc] : []), ...(bcc ? [bcc] : [])],
      attachments: attachments,
      occurred_at: new Date().toISOString(),
      person_id: b.person_id ?? null, company_id: b.company_id ?? null,
      lead_id: b.lead_id ?? null, opportunity_id: b.opportunity_id ?? null,
      agent_profile_id: user.profileId,
    }], { onConflict: "channel,external_id", ignoreDuplicates: true });

    return NextResponse.json({ ok: true, id: gmailId, subject });
  } catch (e) {
    return errJson(e);
  }
}
