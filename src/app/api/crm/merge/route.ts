import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { crmDb, crmConfigured, CrmNotConfigured } from "@/crm/db";

export const dynamic = "force-dynamic";

/**
 * Merge for companies and contacts — the cure for Ramp360 existing twice
 * before 1.5 lakh contacts bring more twins.
 *
 *   GET  /api/crm/merge?type=company&id=<uuid>  — suggested duplicates:
 *        same match key / same email first, then close names.
 *   POST /api/crm/merge { type, keep_id, drop_id } — every reference on the
 *        duplicate moves to the keeper, then the duplicate is soft-deleted
 *        (companies also remember merged_into_id). Flows through ALL records.
 */
const COMPANY_REFS: [string, string][] = [
  ["person", "company_id"], ["address", "company_id"], ["lead", "company_id"],
  ["opportunity", "company_id"], ["quotation", "company_id"], ["sales_order", "company_id"],
  ["interaction", "company_id"], ["message", "company_id"], ["installed_unit", "company_id"],
  ["amc_contract", "company_id"], ["sales_invoice", "company_id"], ["call_log", "company_id"],
];
const PERSON_REFS: [string, string][] = [
  ["lead", "person_id"], ["interaction", "person_id"], ["message", "person_id"],
  ["call_log", "person_id"], ["person_phone", "person_id"],
  ["opportunity", "point_of_contact_id"], ["quotation", "contact_id"],
];
// products merge too (Dr Raghu, 30 Aug 2026: "keep the provision to merge
// products") — quote lines, quote history and the pricing ladder follow
const PRODUCT_REFS: [string, string][] = [
  ["quotation_line", "product_id"], ["product_quote", "product_id"],
  ["product_price", "product_id"], ["opportunity", "product_id"],
];

export async function GET(req: Request) {
  try {
    await requireCrm();
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    const db = crmDb();
    const u = new URL(req.url);
    const type = u.searchParams.get("type") || "";
    const id = u.searchParams.get("id") || "";
    if (!["company", "person", "product"].includes(type) || !id) throw new HttpError(400, "Which record?");

    const suggestions: { id: string; label: string; detail: string; why: string }[] = [];
    const seen = new Set<string>([id]);
    const push = (r: Record<string, unknown>, label: string, detail: string, why: string) => {
      const rid = String(r.id);
      if (seen.has(rid)) return;
      seen.add(rid);
      suggestions.push({ id: rid, label, detail, why });
    };

    if (type === "company") {
      const { data: me } = await db.from("company").select("id, name, match_key, city").eq("id", id).maybeSingle();
      if (!me) throw new HttpError(404, "That company no longer exists.");
      if (me.match_key) {
        const { data } = await db.from("company").select("id, name, city, erp_name")
          .eq("match_key", me.match_key).is("deleted_at", null).neq("id", id).limit(6);
        for (const r of data ?? []) push(r, String(r.name), [r.city, r.erp_name].filter(Boolean).join(" · "), "identical name");
      }
      const stem = String(me.name).slice(0, Math.max(5, Math.floor(String(me.name).length * 0.6)));
      const { data: close } = await db.from("company").select("id, name, city, erp_name")
        .ilike("name", `${stem.replace(/[%_]/g, "\\$&")}%`).is("deleted_at", null).neq("id", id).limit(8);
      for (const r of close ?? []) push(r, String(r.name), [r.city, r.erp_name].filter(Boolean).join(" · "), "name starts the same");
    } else if (type === "product") {
      const { data: me } = await db.from("product").select("id, name, sku, item_group").eq("id", id).maybeSingle();
      if (!me) throw new HttpError(404, "That product no longer exists.");
      const { data: same } = await db.from("product").select("id, name, sku, item_group")
        .ilike("name", String(me.name).replace(/[%_]/g, "\\$&")).is("deleted_at", null).neq("id", id).limit(6);
      for (const r of same ?? []) push(r, String(r.name), [r.sku, r.item_group].filter(Boolean).join(" · "), "identical name");
      const stem = String(me.name).slice(0, Math.max(6, Math.floor(String(me.name).length * 0.6)));
      const { data: close } = await db.from("product").select("id, name, sku, item_group")
        .ilike("name", `${stem.replace(/[%_]/g, "\\$&")}%`).is("deleted_at", null).neq("id", id).limit(8);
      for (const r of close ?? []) push(r, String(r.name), [r.sku, r.item_group].filter(Boolean).join(" · "), "name starts the same");
    } else {
      const { data: me } = await db.from("person").select("id, full_name, primary_email, primary_phone").eq("id", id).maybeSingle();
      if (!me) throw new HttpError(404, "That contact no longer exists.");
      if (me.primary_email) {
        const { data } = await db.from("person").select("id, full_name, primary_email, primary_phone")
          .ilike("primary_email", String(me.primary_email)).is("deleted_at", null).neq("id", id).limit(6);
        for (const r of data ?? []) push(r, String(r.full_name), String(r.primary_email ?? ""), "same email");
      }
      if (me.primary_phone) {
        const { data } = await db.from("person").select("id, full_name, primary_email, primary_phone")
          .eq("primary_phone", me.primary_phone).is("deleted_at", null).neq("id", id).limit(6);
        for (const r of data ?? []) push(r, String(r.full_name), String(r.primary_phone ?? ""), "same phone");
      }
      const nm = String(me.full_name ?? "").trim();
      if (nm.length >= 4) {
        const { data } = await db.from("person").select("id, full_name, primary_email, primary_phone")
          .ilike("first_name", `${nm.slice(0, Math.max(4, Math.floor(nm.length * 0.7))).replace(/[%_]/g, "\\$&")}%`)
          .is("deleted_at", null).neq("id", id).limit(8);
        for (const r of data ?? []) push(r, String(r.full_name), String(r.primary_email ?? r.primary_phone ?? ""), "name starts the same");
      }
    }

    return NextResponse.json({ suggestions: suggestions.slice(0, 10) });
  } catch (e) {
    return errJson(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireCrm();
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    const db = crmDb();
    const body = await readBody(req, {});
    const type = String(body.type || "");
    const keep = String(body.keep_id || "");
    const drop = String(body.drop_id || "");
    if (!["company", "person", "product"].includes(type) || !keep || !drop || keep === drop)
      throw new HttpError(400, "Merge needs a keeper and a duplicate.");

    const table = type;
    const { data: keeper } = await db.from(table).select("id").eq("id", keep).maybeSingle();
    const { data: dupe } = await db.from(table).select("*").eq("id", drop).maybeSingle();
    if (!keeper || !dupe) throw new HttpError(404, "One side of the merge no longer exists.");

    let moved = 0;
    for (const [t, col] of type === "company" ? COMPANY_REFS : type === "product" ? PRODUCT_REFS : PERSON_REFS) {
      const { data, error } = await db.from(t).update({ [col]: keep }).eq(col, drop).select("id");
      if (error && !/duplicate key/i.test(error.message)) throw new HttpError(500, `${t}: ${error.message}`);
      moved += data?.length ?? 0;
    }
    // record_link targets follow too
    const { data: rl } = await db.from("record_link")
      .update({ target_id: keep }).eq("target_type", type).eq("target_id", drop).select("id");
    moved += rl?.length ?? 0;

    const patch: Record<string, unknown> = { deleted_at: new Date().toISOString() };
    if (type === "company" || type === "product") patch.merged_into_id = keep;
    if (type === "product") patch.is_active = false;
    const { error: derr } = await db.from(table).update(patch).eq("id", drop);
    if (derr) throw new HttpError(500, derr.message);

    await db.from("crm_audit").insert({
      entity: table, entity_id: drop, action: "merge",
      before: dupe, after: { merged_into: keep, moved }, by_user: user.profileId,
    });

    return NextResponse.json({ ok: true, moved });
  } catch (e) {
    return errJson(e);
  }
}
