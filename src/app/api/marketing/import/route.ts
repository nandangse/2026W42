import { NextResponse } from "next/server";
import { errJson } from "@/lib/auth";
import { requireMarketing } from "@/lib/marketing";
import { crmDb } from "@/crm/db";
import { readBody } from "@/lib/validate";

export const dynamic = "force-dynamic";

/**
 * POST /api/marketing/import — rows from an Apollo people export, parsed in
 * the browser and sent 200 at a time. Companies are matched on domain, then
 * on name; new ones come in as source = apollo, is_lead = true, tagged Apollo
 * and Leads, so the CRM's Company list never sees them. People are matched
 * on e-mail; new ones come in as source = apollo, tagged Apollo. Optional
 * list_id puts every imported person on a list.
 */
type In = { first_name?: string; last_name?: string; title?: string; email?: string; phone?: string; linkedin?: string; city?: string; country?: string; company?: string; website?: string; domain?: string; industry?: string };

const domainOf = (s: string) => String(s || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].trim();

export async function POST(req: Request) {
  try {
    const u = await requireMarketing();
    const b = await readBody(req, { rows: "array", list_id: "uuid?" });
    const db = crmDb();
    const me = u.email.toLowerCase();
    const rows = (b.rows as In[]).slice(0, 500);
    const { data: tags } = await db.from("crm_tag").select("id, name").in("name", ["Apollo", "Leads"]).is("owner_id", null);
    const tagId = (n: string) => (tags || []).find((t) => t.name === n)?.id as string | undefined;
    const link = async (entity: "company" | "person", id: string, name: string) => { const t = tagId(name); if (t) await db.from("crm_tag_link").upsert({ tag_id: t, entity, entity_id: id }, { onConflict: "tag_id,entity,entity_id", ignoreDuplicates: true }); };

    let companiesNew = 0, companiesMatched = 0, peopleNew = 0, peopleMatched = 0, skipped = 0;
    const companyCache = new Map<string, string>();
    for (const r of rows) {
      const email = String(r.email || "").trim().toLowerCase();
      const cname = String(r.company || "").trim();
      const dom = domainOf(r.domain || r.website || (email.includes("@") ? email.split("@")[1] : ""));
      let companyId: string | null = null;
      if (cname || dom) {
        const key = (dom || cname).toLowerCase();
        if (companyCache.has(key)) companyId = companyCache.get(key)!;
        else {
          let found: { id: string } | null = null;
          if (dom) { const { data } = await db.from("company").select("id").ilike("domain_name", dom).is("deleted_at", null).limit(1).maybeSingle(); found = data; }
          if (!found && cname) { const { data } = await db.from("company").select("id").ilike("name", cname).is("deleted_at", null).limit(1).maybeSingle(); found = data; }
          if (found) { companyId = String(found.id); companiesMatched++; }
          else if (cname) {
            const { data: made, error } = await db.from("company").insert({ name: cname, domain_name: dom || null, website: r.website || null, city: r.city || null, country: r.country || null, source: "apollo", is_lead: true, created_by_email: me, assigned_to: me }).select("id").single();
            if (error) throw new Error(error.message);
            companyId = String(made.id); companiesNew++;
            await link("company", companyId, "Apollo"); await link("company", companyId, "Leads");
          }
          if (companyId) companyCache.set(key, companyId);
        }
      }
      if (!email && !(r.first_name || r.last_name)) { skipped++; continue; }
      let personId: string | null = null;
      if (email) { const { data } = await db.from("person").select("id").ilike("primary_email", email).is("deleted_at", null).limit(1).maybeSingle(); if (data) { personId = String(data.id); peopleMatched++; } }
      if (!personId) {
        const { data: made, error } = await db.from("person").insert({ first_name: r.first_name || null, last_name: r.last_name || null, job_title: r.title || null, primary_email: email || null, primary_phone: r.phone || null, linkedin_url: r.linkedin || null, city: r.city || null, country: r.country || null, company_id: companyId, source: "apollo", created_by_email: me, assigned_to: me }).select("id").single();
        if (error) throw new Error(error.message);
        personId = String(made.id); peopleNew++;
        await link("person", personId, "Apollo");
      }
      if (b.list_id && personId) await db.from("mk_list_member").upsert({ list_id: b.list_id, person_id: personId, added_by_email: me }, { onConflict: "list_id,person_id", ignoreDuplicates: true });
    }
    return NextResponse.json({ ok: true, companiesNew, companiesMatched, peopleNew, peopleMatched, skipped });
  } catch (e) {
    return errJson(e);
  }
}
