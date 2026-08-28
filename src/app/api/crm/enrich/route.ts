import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { crmDb, crmConfigured, CrmNotConfigured } from "@/crm/db";

export const dynamic = "force-dynamic";

/**
 * Enrich a contact from Apollo.io.
 *
 * Two steps, deliberately: LOOKUP shows what Apollo claims, APPLY writes
 * only the fields the human ticked. Enrichment data is a claim by an
 * outside service, not a fact — it goes through the same hands as a
 * visiting card.
 */
export async function POST(req: Request) {
  try {
    const me = await requireCrm();
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    const db = crmDb();
    const body = await req.json();
    const action = String(body.action || "lookup");
    const personId = String(body.person_id || "");
    if (!personId) throw new HttpError(400, "Which contact?");

    if (action === "apply") {
      const ALLOWED = ["job_title", "department", "primary_phone", "primary_email", "whatsapp_number"];
      const patch: Record<string, string> = {};
      for (const k of ALLOWED) {
        const v = String((body.fields || {})[k] ?? "").trim();
        if (v) patch[k] = v;
      }
      if (!Object.keys(patch).length) throw new HttpError(400, "Nothing ticked to apply.");
      const { error } = await db.from("person").update(patch).eq("id", personId);
      if (error) throw new HttpError(500, error.message);
      return NextResponse.json({ ok: true, applied: Object.keys(patch) });
    }

    // ---- lookup ----
    const { data: cfgRow } = await db.from("integration_setting").select("config").eq("key", "apollo").maybeSingle();
    const apiKey = String(((cfgRow?.config || {}) as Record<string, string>).api_key || "");
    if (!apiKey)
      throw new HttpError(503, "Apollo is not connected — paste its API key in Settings → Integrations first.");

    const { data: person } = await db.from("person")
      .select("id, first_name, primary_email, company_id").eq("id", personId).maybeSingle();
    if (!person) throw new HttpError(404, "No such contact.");
    let companyName = "";
    if (person.company_id) {
      const { data: c } = await db.from("company").select("name").eq("id", String(person.company_id)).maybeSingle();
      companyName = String(c?.name || "");
    }
    if (!person.primary_email && !companyName)
      throw new HttpError(409, "Apollo needs at least an email or a company name to match on — this contact has neither.");

    const r = await fetch("https://api.apollo.io/api/v1/people/match", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({
        name: String(person.first_name || "") || undefined,
        email: String(person.primary_email || "") || undefined,
        organization_name: companyName || undefined,
        reveal_personal_emails: false,
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      throw new HttpError(502,
        r.status === 401 || r.status === 403 ? "Apollo refused the key — check it in Settings → Integrations."
        : r.status === 429 ? "Apollo's rate limit — try again in a minute."
        : `Apollo answered ${r.status}: ${t.slice(0, 160)}`);
    }
    const j = await r.json();
    const p = j?.person;
    if (!p) return NextResponse.json({ found: false });

    return NextResponse.json({
      found: true,
      suggestion: {
        name: p.name ?? null,
        job_title: p.title ?? null,
        department: Array.isArray(p.departments) && p.departments.length ? String(p.departments[0]) : null,
        primary_email: p.email && !/not_unlocked|domain\.com/i.test(String(p.email)) ? String(p.email) : null,
        primary_phone: p.organization?.phone ?? p.phone_numbers?.[0]?.sanitized_number ?? null,
        linkedin: p.linkedin_url ?? null,
        city: [p.city, p.state, p.country].filter(Boolean).join(", ") || null,
        company: p.organization?.name ?? null,
        seniority: p.seniority ?? null,
        photo: p.photo_url ?? null,
      },
    });
  } catch (e) {
    return errJson(e);
  }
}
