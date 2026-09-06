import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { crmDb } from "@/crm/db";
import { variableValues, renderTemplate } from "@/crm/variables";
import { advanceNewToHandled } from "@/crm/stageflow";

export const dynamic = "force-dynamic";

/**
 * POST /api/crm/wa/send
 *   { phone, body, person_id?, company_id?, opportunity_id?, quotation_id?, lead_id? }
 *
 * The WhatsApp send goes from the salesperson's OWN WhatsApp — this route
 * renders the {{variables}}, LOGS the message into communication, and hands
 * back the wa.me link the browser opens. What actually gets typed in
 * WhatsApp afterwards is the salesperson's; what we formed here is on the
 * record (Dr Raghu, 26 Aug 2026).
 */
export async function POST(req: Request) {
  try {
    const user = await requireCrm();
    const b = await readBody(req, {});
    const digits = String(b.phone ?? "").replace(/\D/g, "");
    if (digits.length < 8) throw new HttpError(400, `${b.phone || "(empty)"} is not a phone number.`);
    const rawBody = String(b.body ?? "").trim();
    if (!rawBody) throw new HttpError(400, "A message needs words.");

    const values = await variableValues({
      personId: b.person_id ?? null, companyId: b.company_id ?? null,
      opportunityId: b.opportunity_id ?? null, quotationId: b.quotation_id ?? null,
    });
    // the sender signs as themselves
    values.sales_person = user.displayName || user.email;
    const body = renderTemplate(rawBody, values);

    const db = crmDb();
    await db.from("message").insert({
      channel: "whatsapp", direction: "outbound",
      body_text: body, from_handle: user.email, to_handles: [`+${digits}`],
      occurred_at: new Date().toISOString(),
      person_id: b.person_id ?? null, company_id: b.company_id ?? null,
      lead_id: b.lead_id ?? null, opportunity_id: b.opportunity_id ?? null,
      agent_profile_id: user.profileId,
    });
    if (b.opportunity_id) await advanceNewToHandled(db, String(b.opportunity_id));

    return NextResponse.json({
      url: `https://wa.me/${digits}?text=${encodeURIComponent(body)}`,
      rendered: body,
    });
  } catch (e) {
    return errJson(e);
  }
}
