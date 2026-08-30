import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { crmDb, crmConfigured, CrmNotConfigured } from "@/crm/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/crm/erp-create-enquiry { opportunity_id }
 *
 * A Genie-born enquiry WALKS INTO THE ERP (Dr Raghu, 30 Aug 2026: "push the
 * enquiry to erp also and make a new enquiry there — if needed make a new
 * customer and new contact too"). This AMENDS the pull-only law for exactly
 * one case: CREATING a new enquiry (with its customer and contact when the
 * ERP lacks them). Edits still never flow out; the hourly pull knows the
 * created name and will not bring it back as a duplicate.
 */
export async function POST(req: Request) {
  try {
    const me = await requireCrm();
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    const db = crmDb();
    const oppId = String((await req.json()).opportunity_id ?? "");
    if (!oppId) throw new HttpError(400, "Which opportunity?");

    const { data: cfgRow } = await db.from("integration_setting").select("config").eq("key", "erpnext").maybeSingle();
    const cfg = (cfgRow?.config || {}) as Record<string, string>;
    if (!cfg.url || !cfg.api_key || !cfg.api_secret)
      throw new HttpError(503, "ERPNext is not connected — the keys live in Settings → Integrations.");
    const base = cfg.url.replace(/\/+$/, "");
    const H = { "content-type": "application/json", authorization: `token ${cfg.api_key}:${cfg.api_secret}` };

    const { data: opp } = await db.from("opportunity")
      .select("id, name, opportunity_no, erp_opportunity_name, enquiry_info, opportunity_on, company_id, contact_id")
      .eq("id", oppId).maybeSingle();
    if (!opp) throw new HttpError(404, "That opportunity no longer exists.");
    if (opp.erp_opportunity_name || /^ENQ-/.test(String(opp.opportunity_no || "")))
      throw new HttpError(409, `This enquiry already lives in the ERP as ${opp.erp_opportunity_name || opp.opportunity_no}.`);

    let companyName = "", contactName = "", contactEmail = "", contactPhone = "";
    if (opp.company_id) {
      const { data: co } = await db.from("company").select("name").eq("id", String(opp.company_id)).maybeSingle();
      companyName = String(co?.name || "").trim();
    }
    if (!companyName) throw new HttpError(400, "Put a company on the enquiry first — the ERP needs a party.");
    if (opp.contact_id) {
      const { data: p } = await db.from("person").select("full_name, primary_email, primary_phone").eq("id", String(opp.contact_id)).maybeSingle();
      contactName = String(p?.full_name || "").trim();
      contactEmail = String(p?.primary_email || "").trim();
      contactPhone = String(p?.primary_phone || "").trim();
    }

    const find = async (doctype: string, filters: unknown[][]) => {
      const r = await fetch(`${base}/api/resource/${encodeURIComponent(doctype)}?filters=${encodeURIComponent(JSON.stringify(filters))}&limit_page_length=1`, { headers: H });
      if (!r.ok) return null;
      return (((await r.json()) as { data?: { name?: string }[] }).data ?? [])[0]?.name ?? null;
    };
    const create = async (doctype: string, doc: Record<string, unknown>) => {
      const r = await fetch(`${base}/api/resource/${encodeURIComponent(doctype)}`, { method: "POST", headers: H, body: JSON.stringify(doc) });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new HttpError(502, `The ERP refused the ${doctype}: ${(JSON.stringify(j) || "").slice(0, 220)}`);
      return String((j as { data?: { name?: string } })?.data?.name ?? "");
    };

    // the customer — found by name, or born
    let customer = await find("Customer", [["customer_name", "=", companyName]]);
    let madeCustomer = false;
    if (!customer) {
      customer = await create("Customer", {
        customer_name: companyName, customer_type: "Company",
        customer_group: "All Customer Groups", territory: "All Territories",
      });
      madeCustomer = true;
    }

    // the contact — found by name against this customer, or born and linked
    let contact: string | null = null, madeContact = false;
    if (contactName) {
      contact = contactEmail ? await find("Contact", [["email_id", "=", contactEmail]]) : null;
      if (!contact) contact = await find("Contact", [["first_name", "=", contactName]]);
      if (!contact) {
        contact = await create("Contact", {
          first_name: contactName,
          ...(contactEmail ? { email_ids: [{ email_id: contactEmail, is_primary: 1 }] } : {}),
          ...(contactPhone ? { phone_nos: [{ phone: contactPhone, is_primary_mobile_no: 1 }] } : {}),
          links: [{ link_doctype: "Customer", link_name: customer }],
        });
        madeContact = true;
      }
    }

    // the enquiry itself — the ERP stamps its own ENQ number
    const infoField = String(cfg.opp_info_field || "").trim();
    const erpName = await create("Opportunity", {
      opportunity_from: "Customer",
      party_name: customer,
      status: "Open",
      opportunity_type: "Sales",
      title: String(opp.name || companyName).slice(0, 140),
      transaction_date: String(opp.opportunity_on || "").slice(0, 10) || undefined,
      ...(contact ? { contact_person: contact } : {}),
      ...(infoField && opp.enquiry_info ? { [infoField]: String(opp.enquiry_info).replace(/\n/g, "<br>") } : {}),
    });

    await db.from("opportunity").update({ erp_opportunity_name: erpName }).eq("id", oppId);
    await db.from("crm_audit").insert({
      entity: "opportunity", entity_id: oppId, action: "erp_create",
      after: { erp_name: erpName, customer, made_customer: madeCustomer, contact, made_contact: madeContact },
      by_user: me.profileId,
    }).then(() => null, () => null);
    return NextResponse.json({ ok: true, erp_name: erpName, customer, made_customer: madeCustomer, contact, made_contact: madeContact });
  } catch (e) {
    return errJson(e);
  }
}
