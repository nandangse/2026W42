import { NextResponse } from "next/server";
import { crmDb, crmConfigured } from "@/crm/db";
import { swallow } from "@/lib/swallow";

export const dynamic = "force-dynamic";

/**
 * POST /api/marketing/lp — what a visitor filled in on a landing page.
 *
 * PUBLIC: no login, because the whole point is a stranger writing to us.
 * Guarded by the honeypot field, by needing a real e-mail or phone, and by
 * only ever writing a lead — it can reach nothing else in Genie.
 */
export async function POST(req: Request) {
  try {
    if (!crmConfigured()) return NextResponse.json({ ok: false, error: "not configured" }, { status: 503 });
    const b = (await req.json().catch(() => ({}))) as Record<string, string>;
    if (String(b.website_url || "").trim()) return NextResponse.json({ ok: true }); // the honeypot: a bot filled it
    const slug = String(b.slug || "").trim().toLowerCase();
    const email = String(b.email || "").trim().toLowerCase();
    const phone = String(b.phone || "").trim();
    const name = String(b.name || "").trim().slice(0, 120);
    const companyName = String(b.company || "").trim().slice(0, 160);
    const message = String(b.message || "").trim().slice(0, 4000);
    if (!slug) return NextResponse.json({ error: "no page" }, { status: 400 });
    const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
    if (!emailOk && phone.replace(/\D/g, "").length < 8) return NextResponse.json({ error: "Please leave an e-mail or a phone number we can reach you on." }, { status: 400 });

    const db = crmDb();
    const { data: page } = await db.from("mk_landing").select("id, add_to_list_id, tag_name, thank_you").eq("slug", slug).eq("published", true).maybeSingle();
    if (!page) return NextResponse.json({ error: "That page is not open." }, { status: 404 });

    // the company, matched on name; then the person, matched on e-mail
    let companyId: string | null = null;
    if (companyName) {
      const { data: c } = await db.from("company").select("id").ilike("name", companyName).is("deleted_at", null).limit(1).maybeSingle();
      if (c) companyId = String(c.id);
      else {
        const { data: made } = await db.from("company").insert({ name: companyName, source: "crm", is_lead: true, created_by_email: "landing-page" }).select("id").single();
        companyId = made ? String(made.id) : null;
      }
    }
    let personId: string | null = null;
    if (emailOk) {
      const { data: p } = await db.from("person").select("id").ilike("primary_email", email).is("deleted_at", null).limit(1).maybeSingle();
      if (p) personId = String(p.id);
    }
    if (!personId) {
      const [first, ...rest] = name.split(/\s+/);
      const { data: made } = await db.from("person")
        .insert({ first_name: first || null, last_name: rest.join(" ") || null, primary_email: emailOk ? email : null, primary_phone: phone || null, company_id: companyId, source: "crm", created_by_email: "landing-page" })
        .select("id").single();
      personId = made ? String(made.id) : null;
    } else if (companyId) {
      await db.from("person").update({ company_id: companyId }).eq("id", personId).is("company_id", null);
    }

    // the tag, so every landing lead is findable as one
    const tag = String(page.tag_name || "Landing page");
    try {
      let { data: t } = await db.from("crm_tag").select("id").ilike("name", tag).is("owner_id", null).maybeSingle();
      if (!t) { const { data: made } = await db.from("crm_tag").insert({ name: tag, owner_id: null }).select("id").single(); t = made; }
      if (t && personId) await db.from("crm_tag_link").upsert({ tag_id: t.id, entity: "person", entity_id: personId }, { onConflict: "tag_id,entity,entity_id", ignoreDuplicates: true });
      if (t && companyId) await db.from("crm_tag_link").upsert({ tag_id: t.id, entity: "company", entity_id: companyId }, { onConflict: "tag_id,entity,entity_id", ignoreDuplicates: true });
    } catch (e) { swallow("marketing/lp tag", e); }

    if (page.add_to_list_id && personId) {
      await db.from("mk_list_member").upsert({ list_id: page.add_to_list_id, person_id: personId, added_by_email: "landing-page" }, { onConflict: "list_id,person_id", ignoreDuplicates: true });
    }
    await db.from("mk_landing_submit").insert({ landing_id: page.id, person_id: personId, company_id: companyId, name, email: emailOk ? email : null, phone: phone || null, company: companyName || null, message: message || null });
    const { data: cur } = await db.from("mk_landing").select("submits").eq("id", page.id).maybeSingle();
    await db.from("mk_landing").update({ submits: (Number(cur?.submits) || 0) + 1 }).eq("id", page.id);

    return NextResponse.json({ ok: true, thank_you: page.thank_you || "Thank you — we have it, and somebody from Nandan GSE will be in touch." });
  } catch (e) {
    swallow("marketing/lp", e);
    return NextResponse.json({ error: "Something went wrong at our end. Please write to sales@nandan.co.in." }, { status: 500 });
  }
}
