import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { crmDb } from "@/crm/db";

export const dynamic = "force-dynamic";

/**
 * Tags (Dr Raghu, 28 Aug 2026): each salesperson's own, type-along, on
 * companies, contacts and opportunities. THE VISIBILITY RULES, exactly as
 * given:
 *  - a salesperson SEES ONLY THEIR OWN tags (on records and in suggestions);
 *  - typing a tag name that ALREADY EXISTS — exactly — shows every record
 *    carrying that name, whoever owns it;
 *  - Raghu and the Sales Head see everyone's, with the owner named.
 *
 *   GET ?entity=&id=      — the tags standing on one record (rules applied)
 *   GET ?pick=q           — tag-name suggestions (mine; managers: all)
 *   GET ?records=NAME&entity= — record ids carrying that EXACT name (all owners)
 *   POST { action: "add" | "remove", ... }
 */
const ENTITIES = new Set(["company", "person", "opportunity", "quotation", "sales_order", "lead"]);
const MANAGE = new Set(["admin", "ceo", "sales_head"]);

export async function GET(req: Request) {
  try {
    const me = await requireCrm();
    const db = crmDb();
    const url = new URL(req.url);
    const manager = MANAGE.has(me.crmRole);

    const pick = url.searchParams.get("pick");
    if (pick !== null) {
      let qy = db.from("crm_tag").select("id, name, owner_id").order("name").limit(400);
      if (!manager) qy = qy.eq("owner_id", me.profileId ?? "00000000-0000-0000-0000-000000000000");
      if (pick.trim()) qy = qy.ilike("name", `%${pick.trim()}%`);
      const { data, error } = await qy;
      if (error) {
        if (/does not exist|schema cache/i.test(error.message)) return NextResponse.json({ installed: false, names: [] });
        throw new Error(error.message);
      }
      return NextResponse.json({ installed: true, names: [...new Set((data || []).map((t) => String(t.name)))] });
    }

    const recordsName = url.searchParams.get("records");
    if (recordsName !== null) {
      const entity = String(url.searchParams.get("entity") || "");
      if (!ENTITIES.has(entity)) throw new HttpError(400, "entity must be company, person or opportunity");
      // the exact-name rule: whoever owns it, the name opens the records
      const { data: tags, error } = await db.from("crm_tag").select("id").ilike("name", recordsName.trim());
      if (error) {
        if (/does not exist|schema cache/i.test(error.message)) return NextResponse.json({ installed: false, ids: [] });
        throw new Error(error.message);
      }
      if (!tags?.length) return NextResponse.json({ installed: true, ids: [] });
      const ids: string[] = [];
      for (let a = 0; ; a += 1000) {
        const { data: links } = await db.from("crm_tag_link").select("entity_id")
          .in("tag_id", tags.map((t) => t.id)).eq("entity", entity).order("id").range(a, a + 999);
        ids.push(...(links || []).map((l) => String(l.entity_id)));
        if (!links || links.length < 1000) break;
      }
      return NextResponse.json({ installed: true, ids: [...new Set(ids)] });
    }

    const entity = String(url.searchParams.get("entity") || "");
    const id = String(url.searchParams.get("id") || "");
    if (!ENTITIES.has(entity) || !id) throw new HttpError(400, "entity and id required");
    const { data: links, error } = await db.from("crm_tag_link")
      .select("id, tag_id, crm_tag(id, name, owner_id)")
      .eq("entity", entity).eq("entity_id", id).limit(500);
    if (error) {
      if (/does not exist|schema cache/i.test(error.message)) return NextResponse.json({ installed: false, tags: [] });
      throw new Error(error.message);
    }
    type LinkRow = { id: string; crm_tag: { id: string; name: string; owner_id: string | null } | null };
    let rows = ((links || []) as unknown as LinkRow[])
      .filter((l) => l.crm_tag)
      .map((l) => ({ link_id: String(l.id), tag_id: String(l.crm_tag!.id), name: String(l.crm_tag!.name), owner_id: l.crm_tag!.owner_id ? String(l.crm_tag!.owner_id) : null }));
    let owners: Record<string, string> = {};
    if (manager) {
      const ids2 = [...new Set(rows.map((r) => r.owner_id).filter(Boolean))] as string[];
      if (ids2.length) {
        const { data: profs } = await db.from("profile").select("id, full_name").in("id", ids2);
        owners = Object.fromEntries((profs || []).map((p) => [String(p.id), String(p.full_name || "")]));
      }
    } else {
      rows = rows.filter((r) => r.owner_id === me.profileId);
    }
    return NextResponse.json({ installed: true, manager, tags: rows.map((r) => ({ ...r, owner: r.owner_id ? owners[r.owner_id] || null : null })) });
  } catch (e) {
    return errJson(e);
  }
}

export async function POST(req: Request) {
  try {
    const me = await requireCrm();
    const db = crmDb();
    const body = await readBody(req, {});
    const action = String(body.action || "");
    const entity = String(body.entity || "");
    const id = String(body.id || "");
    if (!ENTITIES.has(entity) || !id) throw new HttpError(400, "entity and id required");

    if (action === "add") {
      const name = String(body.name || "").trim();
      if (!name) throw new HttpError(400, "Say the tag.");
      if (!me.profileId) throw new HttpError(403, "Your CRM profile is not linked yet.");
      // find-or-create MY tag of this name
      let tagId: string;
      const { data: mine, error: e1 } = await db.from("crm_tag").select("id")
        .eq("owner_id", me.profileId).ilike("name", name).maybeSingle();
      if (e1 && /does not exist|schema cache/i.test(e1.message))
        throw new HttpError(503, "Run migration 0025 first — the tags have nowhere to live yet.");
      if (mine) tagId = String(mine.id);
      else {
        const { data: made, error: e2 } = await db.from("crm_tag")
          .insert({ name, owner_id: me.profileId }).select("id").single();
        if (e2) throw new Error(e2.message);
        tagId = String(made.id);
      }
      const { error: e3 } = await db.from("crm_tag_link")
        .upsert({ tag_id: tagId, entity, entity_id: id }, { onConflict: "tag_id,entity,entity_id", ignoreDuplicates: true });
      if (e3) throw new Error(e3.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "remove") {
      const linkId = String(body.link_id || "");
      if (!linkId) throw new HttpError(400, "link_id required");
      // only the owner takes their tag off — or a manager
      const { data: link } = await db.from("crm_tag_link").select("id, crm_tag(owner_id)").eq("id", linkId).maybeSingle();
      const ownerId = (link as unknown as { crm_tag: { owner_id: string | null } | null } | null)?.crm_tag?.owner_id ?? null;
      if (!MANAGE.has(me.crmRole) && ownerId !== me.profileId)
        throw new HttpError(403, "That tag is someone else's.");
      const { error } = await db.from("crm_tag_link").delete().eq("id", linkId);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    throw new HttpError(400, "Unknown action.");
  } catch (e) {
    return errJson(e);
  }
}
