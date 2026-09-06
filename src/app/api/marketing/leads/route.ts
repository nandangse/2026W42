import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireMarketing, mineFilter } from "@/lib/marketing";
import { crmDb } from "@/crm/db";
import { readBody } from "@/lib/validate";

export const dynamic = "force-dynamic";

/**
 * GET /api/marketing/leads?kind=person|company&q=&mine=1&page=
 * The people and companies Marketing works: everything for the owner,
 * sales and managers; only what they made or were assigned for members.
 */
export async function GET(req: Request) {
  try {
    const u = await requireMarketing();
    const url = new URL(req.url);
    const kind = url.searchParams.get("kind") === "company" ? "company" : "person";
    const q = (url.searchParams.get("q") || "").trim();
    const page = Math.max(0, Number(url.searchParams.get("page") || 0));
    const onlyMine = url.searchParams.get("mine") === "1";
    const db = crmDb();
    const PAGE = 200;
    let qy = kind === "person"
      ? db.from("person").select("id, first_name, last_name, full_name, job_title, primary_email, primary_phone, linkedin_url, city, country, company_id, source, assigned_to, created_by_email, created_at, company:company_id(name)", { count: "exact" }).is("deleted_at", null)
      : db.from("company").select("id, name, domain_name, website, city, country, industry_id, source, is_lead, is_customer, assigned_to, created_by_email, created_at", { count: "exact" }).is("deleted_at", null);
    const mine = mineFilter(u) || (onlyMine ? `created_by_email.eq.${u.email.toLowerCase()},assigned_to.eq.${u.email.toLowerCase()}` : null);
    if (mine) qy = qy.or(mine);
    if (q) {
      const like = `%${q.replace(/[%_]/g, "\\$&")}%`;
      qy = kind === "person" ? qy.or(`first_name.ilike.${like},last_name.ilike.${like},primary_email.ilike.${like},job_title.ilike.${like}`) : qy.or(`name.ilike.${like},domain_name.ilike.${like},city.ilike.${like}`);
    }
    const { data, error, count } = await qy.order("created_at", { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) {
      if (/source|assigned_to|created_by_email|schema cache/i.test(error.message)) return NextResponse.json({ installed: false, rows: [], total: 0, scope: u.scope });
      throw new Error(error.message);
    }
    return NextResponse.json({ installed: true, rows: data ?? [], total: count ?? 0, scope: u.scope, role: u.marketingRole, me: u.email });
  } catch (e) {
    return errJson(e);
  }
}

/**
 * POST — { action: "mark_lead", company_id, lead } · { action: "assign", kind, id, to }
 *      · { action: "create", kind, ...fields }
 */
export async function POST(req: Request) {
  try {
    const u = await requireMarketing();
    const b = await readBody(req, { action: "string" });
    const db = crmDb();
    const me = u.email.toLowerCase();
    if (b.action === "mark_lead") {
      const { error } = await db.from("company").update({ is_lead: !!b.lead }).eq("id", String(b.company_id));
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }
    if (b.action === "assign") {
      if (u.scope !== "all") throw new HttpError(403, "Only sales and managers assign records.");
      const table = b.kind === "company" ? "company" : "person";
      const { error } = await db.from(table).update({ assigned_to: String(b.to || "").toLowerCase() || null }).eq("id", String(b.id));
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }
    if (b.action === "create") {
      if (b.kind === "company") {
        const { data, error } = await db.from("company").insert({ name: String(b.name || "").trim(), domain_name: b.domain_name || null, website: b.website || null, city: b.city || null, country: b.country || null, source: "crm", is_lead: true, created_by_email: me, assigned_to: me }).select("id").single();
        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true, id: data.id });
      }
      const { data, error } = await db.from("person").insert({ first_name: b.first_name || null, last_name: b.last_name || null, job_title: b.job_title || null, primary_email: String(b.primary_email || "").toLowerCase() || null, primary_phone: b.primary_phone || null, linkedin_url: b.linkedin_url || null, city: b.city || null, country: b.country || null, company_id: b.company_id || null, source: "crm", created_by_email: me, assigned_to: me }).select("id").single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, id: data.id });
    }
    throw new HttpError(400, "unknown action");
  } catch (e) {
    return errJson(e);
  }
}
