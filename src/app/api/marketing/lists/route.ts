import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireMarketing } from "@/lib/marketing";
import { crmDb } from "@/crm/db";
import { readBody } from "@/lib/validate";

export const dynamic = "force-dynamic";

/** GET /api/marketing/lists — every list with its count; ?id= gives one list's members. */
export async function GET(req: Request) {
  try {
    const u = await requireMarketing();
    const db = crmDb();
    const id = new URL(req.url).searchParams.get("id");
    if (id) {
      const { data, error } = await db.from("mk_list_member").select("person_id, added_at, person:person_id(id, first_name, last_name, full_name, job_title, primary_email, city, company:company_id(name))").eq("list_id", id).order("added_at", { ascending: false }).limit(5000);
      if (error) throw new Error(error.message);
      return NextResponse.json({ members: data ?? [] });
    }
    let q = db.from("mk_list").select("id, name, description, created_by_email, created_at").order("created_at", { ascending: false });
    if (u.scope === "mine") q = q.eq("created_by_email", u.email.toLowerCase());
    const { data, error } = await q;
    if (error) {
      if (/mk_list|schema cache/i.test(error.message)) return NextResponse.json({ installed: false, lists: [] });
      throw new Error(error.message);
    }
    const ids = (data || []).map((l) => l.id);
    const counts = new Map<string, number>();
    if (ids.length) {
      const { data: m } = await db.from("mk_list_member").select("list_id").in("list_id", ids).limit(50000);
      for (const r of m || []) counts.set(String(r.list_id), (counts.get(String(r.list_id)) || 0) + 1);
    }
    return NextResponse.json({ installed: true, lists: (data || []).map((l) => ({ ...l, count: counts.get(String(l.id)) || 0 })) });
  } catch (e) {
    return errJson(e);
  }
}

/** POST — { action: "create", name, description } · { action: "add", list_id, person_ids } · { action: "remove", list_id, person_ids } · { action: "delete", list_id } */
export async function POST(req: Request) {
  try {
    const u = await requireMarketing();
    const b = await readBody(req, { action: "string" });
    const db = crmDb();
    const me = u.email.toLowerCase();
    if (b.action === "create") {
      const { data, error } = await db.from("mk_list").insert({ name: String(b.name || "").trim(), description: b.description || null, created_by_email: me }).select("id").single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, id: data.id });
    }
    if (b.action === "add" || b.action === "remove") {
      const ids = (Array.isArray(b.person_ids) ? b.person_ids : []).map(String).slice(0, 5000);
      if (!ids.length) throw new HttpError(400, "nobody chosen");
      if (b.action === "add") {
        const { error } = await db.from("mk_list_member").upsert(ids.map((p) => ({ list_id: String(b.list_id), person_id: p, added_by_email: me })), { onConflict: "list_id,person_id", ignoreDuplicates: true });
        if (error) throw new Error(error.message);
      } else {
        const { error } = await db.from("mk_list_member").delete().eq("list_id", String(b.list_id)).in("person_id", ids);
        if (error) throw new Error(error.message);
      }
      return NextResponse.json({ ok: true, n: ids.length });
    }
    if (b.action === "delete") {
      const { data: l } = await db.from("mk_list").select("created_by_email").eq("id", String(b.list_id)).maybeSingle();
      if (!l) throw new HttpError(404, "no such list");
      if (u.scope !== "all" && l.created_by_email !== me) throw new HttpError(403, "not your list");
      const { error } = await db.from("mk_list").delete().eq("id", String(b.list_id));
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }
    throw new HttpError(400, "unknown action");
  } catch (e) {
    return errJson(e);
  }
}
