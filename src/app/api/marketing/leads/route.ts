import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireMarketing, mineFilter } from "@/lib/marketing";
import { crmDb } from "@/crm/db";
import { readBody } from "@/lib/validate";

export const dynamic = "force-dynamic";

const PERSON_COLS = "id, first_name, last_name, full_name, job_title, department, primary_email, primary_phone, whatsapp_number, linkedin_url, city, country, company_id, source, assigned_to, created_by_email, created_at, is_decision_maker, company:company_id(id, name)";
const COMPANY_COLS = "id, name, domain_name, website, linkedin_url, city, state, country, industry_id, employee_count, annual_revenue, gstin, notes, source, is_lead, is_customer, assigned_to, created_by_email, created_at, industry:industry_id(name)";
const PERSON_EDIT = new Set(["first_name", "last_name", "job_title", "department", "primary_email", "primary_phone", "whatsapp_number", "linkedin_url", "city", "country", "company_id", "is_decision_maker"]);
const COMPANY_EDIT = new Set(["name", "domain_name", "website", "linkedin_url", "city", "state", "country", "industry_id", "employee_count", "annual_revenue", "gstin", "notes", "is_lead"]);

async function tagsFor(db: ReturnType<typeof crmDb>, entity: "company" | "person", id: string) {
  const { data } = await db.from("crm_tag_link").select("id, tag_id, crm_tag(id, name)").eq("entity", entity).eq("entity_id", id);
  return (data || []).map((l) => ({ link_id: String(l.id), tag_id: String(l.tag_id), name: String((l.crm_tag as { name?: string } | null)?.name || "") })).filter((t) => t.name);
}

/**
 * GET /api/marketing/leads
 *   ?kind=person|company&q=&page=&mine=1&source=crm|apollo&lead=1&industry=&country=&city=&assigned=&has_email=1
 *   &ids=1   — only the ids of everything matching (select all, up to 5000)
 *   ?kind=&id= — one record in full: the row, its people (company), its tags, the tag list, the industries
 */
export async function GET(req: Request) {
  try {
    const u = await requireMarketing();
    const url = new URL(req.url);
    const P = (k: string) => (url.searchParams.get(k) || "").trim();
    const kind = P("kind") === "company" ? "company" : "person";
    const db = crmDb();
    const me = u.email.toLowerCase();

    if (P("id")) {
      const id = P("id");
      if (kind === "company") {
        const { data: row, error } = await db.from("company").select(COMPANY_COLS).eq("id", id).maybeSingle();
        if (error) throw new Error(error.message);
        if (!row) throw new HttpError(404, "no such company");
        const { data: people } = await db.from("person").select(PERSON_COLS).eq("company_id", id).is("deleted_at", null).order("full_name");
        const { data: inds } = await db.from("industry").select("id, name").eq("active", true).order("name");
        const { data: allTags } = await db.from("crm_tag").select("id, name").order("name").limit(300);
        return NextResponse.json({ row, people: people ?? [], tags: await tagsFor(db, "company", id), industries: inds ?? [], allTags: allTags ?? [] });
      }
      const { data: row, error } = await db.from("person").select(PERSON_COLS).eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) throw new HttpError(404, "no such person");
      const { data: allTags } = await db.from("crm_tag").select("id, name").order("name").limit(300);
      return NextResponse.json({ row, tags: await tagsFor(db, "person", id), allTags: allTags ?? [] });
    }

    const wantIds = P("ids") === "1";
    const page = Math.max(0, Number(P("page") || 0));
    const PAGE = wantIds ? 5000 : 200;
    let qy = kind === "person"
      ? db.from("person").select(wantIds ? "id" : PERSON_COLS, { count: "exact" }).is("deleted_at", null)
      : db.from("company").select(wantIds ? "id" : COMPANY_COLS, { count: "exact" }).is("deleted_at", null);
    const mine = mineFilter(u) || (P("mine") === "1" ? `created_by_email.eq.${me},assigned_to.eq.${me}` : null);
    if (mine) qy = qy.or(mine);
    if (P("q")) {
      const like = `%${P("q").replace(/[%_]/g, "\\$&")}%`;
      qy = kind === "person" ? qy.or(`first_name.ilike.${like},last_name.ilike.${like},primary_email.ilike.${like},job_title.ilike.${like}`) : qy.or(`name.ilike.${like},domain_name.ilike.${like},city.ilike.${like}`);
    }
    if (P("source") === "crm" || P("source") === "apollo") qy = qy.eq("source", P("source"));
    if (P("country")) qy = qy.ilike("country", `%${P("country")}%`);
    if (P("city")) qy = qy.ilike("city", `%${P("city")}%`);
    if (P("assigned")) qy = P("assigned") === "none" ? qy.is("assigned_to", null) : qy.eq("assigned_to", P("assigned").toLowerCase());
    if (kind === "company") {
      if (P("lead") === "1") qy = qy.eq("is_lead", true);
      if (P("customer") === "1") qy = qy.eq("is_customer", true);
      if (P("industry")) qy = qy.eq("industry_id", Number(P("industry")));
    } else {
      if (P("has_email") === "1") qy = qy.not("primary_email", "is", null);
      if (P("has_email") === "0") qy = qy.is("primary_email", null);
      if (P("company")) qy = qy.eq("company_id", P("company"));
    }
    const { data, error, count } = await qy.order("created_at", { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) {
      if (/source|assigned_to|created_by_email|schema cache/i.test(error.message)) return NextResponse.json({ installed: false, rows: [], total: 0, scope: u.scope });
      throw new Error(error.message);
    }
    if (wantIds) return NextResponse.json({ ids: (data || []).map((r) => String((r as unknown as { id: string }).id)), total: count ?? 0 });
    const { data: inds } = kind === "company" ? await db.from("industry").select("id, name").eq("active", true).order("name") : { data: [] };
    return NextResponse.json({ installed: true, rows: data ?? [], total: count ?? 0, scope: u.scope, role: u.marketingRole, me, industries: inds ?? [] });
  } catch (e) {
    return errJson(e);
  }
}

/**
 * POST — { action: "update", kind, id, fields } · { action: "mark_lead", company_id, lead } · { action: "assign", kind, id, to }
 *      · { action: "bulk", kind, ids, set: { assigned_to?, is_lead? } } · { action: "create", kind, ...fields }
 *      · { action: "tag_add", entity, id, name } · { action: "tag_remove", entity, id, tag_id }
 */
export async function POST(req: Request) {
  try {
    const u = await requireMarketing();
    const b = await readBody(req, { action: "string" });
    const db = crmDb();
    const me = u.email.toLowerCase();
    const mayTouch = async (kind: "company" | "person", id: string) => {
      if (u.scope === "all") return;
      const { data } = await db.from(kind).select("created_by_email, assigned_to").eq("id", id).maybeSingle();
      if (!data || (data.created_by_email !== me && data.assigned_to !== me)) throw new HttpError(403, "Not yours to change.");
    };
    if (b.action === "update") {
      const kind = b.kind === "company" ? "company" : "person";
      await mayTouch(kind, String(b.id));
      const allow = kind === "company" ? COMPANY_EDIT : PERSON_EDIT;
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries((b.fields || {}) as Record<string, unknown>)) {
        if (!allow.has(k)) continue;
        if (k === "industry_id" || k === "employee_count") patch[k] = v === "" || v == null ? null : Number(v);
        else if (k === "annual_revenue") patch[k] = v === "" || v == null ? null : Number(String(v).replace(/[₹,\s]/g, ""));
        else if (k === "is_lead" || k === "is_decision_maker") patch[k] = !!v;
        else if (k === "primary_email") patch[k] = String(v || "").trim().toLowerCase() || null;
        else patch[k] = typeof v === "string" ? v.trim() || null : v;
      }
      if (!Object.keys(patch).length) throw new HttpError(400, "nothing to change");
      const { error } = await db.from(kind).update(patch).eq("id", String(b.id));
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }
    if (b.action === "mark_lead") {
      const { error } = await db.from("company").update({ is_lead: !!b.lead }).eq("id", String(b.company_id));
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }
    if (b.action === "assign") {
      if (u.scope !== "all") throw new HttpError(403, "Only sales and managers assign records.");
      const { error } = await db.from(b.kind === "company" ? "company" : "person").update({ assigned_to: String(b.to || "").toLowerCase() || null }).eq("id", String(b.id));
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }
    if (b.action === "bulk") {
      const kind = b.kind === "company" ? "company" : "person";
      const ids = (Array.isArray(b.ids) ? b.ids : []).map(String).slice(0, 5000);
      if (!ids.length) throw new HttpError(400, "nobody chosen");
      const set: Record<string, unknown> = {};
      if ("assigned_to" in (b.set || {})) { if (u.scope !== "all") throw new HttpError(403, "Only sales and managers assign records."); set.assigned_to = String(b.set.assigned_to || "").toLowerCase() || null; }
      if ("is_lead" in (b.set || {}) && kind === "company") set.is_lead = !!b.set.is_lead;
      if (!Object.keys(set).length) throw new HttpError(400, "nothing to set");
      for (let i = 0; i < ids.length; i += 500) { const { error } = await db.from(kind).update(set).in("id", ids.slice(i, i + 500)); if (error) throw new Error(error.message); }
      return NextResponse.json({ ok: true, n: ids.length });
    }
    if (b.action === "create") {
      if (b.kind === "company") {
        const { data, error } = await db.from("company").insert({ name: String(b.name || "").trim(), domain_name: b.domain_name || null, website: b.website || null, city: b.city || null, state: b.state || null, country: b.country || null, industry_id: b.industry_id ? Number(b.industry_id) : null, source: "crm", is_lead: true, created_by_email: me, assigned_to: me }).select("id").single();
        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true, id: data.id });
      }
      const { data, error } = await db.from("person").insert({ first_name: b.first_name || null, last_name: b.last_name || null, job_title: b.job_title || null, department: b.department || null, primary_email: String(b.primary_email || "").toLowerCase() || null, primary_phone: b.primary_phone || null, linkedin_url: b.linkedin_url || null, city: b.city || null, country: b.country || null, company_id: b.company_id || null, source: "crm", created_by_email: me, assigned_to: me }).select("id").single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, id: data.id });
    }
    if (b.action === "tag_add") {
      const entity = b.entity === "company" ? "company" : "person";
      const name = String(b.name || "").trim();
      if (!name) throw new HttpError(400, "a tag needs a name");
      let { data: t } = await db.from("crm_tag").select("id").ilike("name", name).is("owner_id", null).maybeSingle();
      if (!t) { const { data: made, error } = await db.from("crm_tag").insert({ name, owner_id: null }).select("id").single(); if (error) throw new Error(error.message); t = made; }
      await db.from("crm_tag_link").upsert({ tag_id: t.id, entity, entity_id: String(b.id) }, { onConflict: "tag_id,entity,entity_id", ignoreDuplicates: true });
      return NextResponse.json({ ok: true, tags: await tagsFor(db, entity, String(b.id)) });
    }
    if (b.action === "tag_remove") {
      const entity = b.entity === "company" ? "company" : "person";
      await db.from("crm_tag_link").delete().eq("entity", entity).eq("entity_id", String(b.id)).eq("tag_id", String(b.tag_id));
      return NextResponse.json({ ok: true, tags: await tagsFor(db, entity, String(b.id)) });
    }
    throw new HttpError(400, "unknown action");
  } catch (e) {
    return errJson(e);
  }
}
