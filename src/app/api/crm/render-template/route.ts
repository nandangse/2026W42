import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { crmConfigured, CrmNotConfigured } from "@/crm/db";
import { variableValues, renderTemplate } from "@/crm/variables";

export const dynamic = "force-dynamic";

/**
 * POST /api/crm/render-template
 *   { template, person_id?, company_id?, opportunity_id?, quotation_id? }
 * → { rendered, values } — the one resolver every messaging surface uses.
 */
export async function POST(req: Request) {
  try {
    await requireCrm();
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    const body = await readBody(req, {});
    const template = String(body.template ?? "");
    const values = await variableValues({
      personId: body.person_id ?? null,
      companyId: body.company_id ?? null,
      opportunityId: body.opportunity_id ?? null,
      quotationId: body.quotation_id ?? null,
    });
    return NextResponse.json({ rendered: renderTemplate(template, values), values });
  } catch (e) {
    return errJson(e);
  }
}
