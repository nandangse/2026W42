import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireMarketing } from "@/lib/marketing";
import { crmDb } from "@/crm/db";
import { readBody } from "@/lib/validate";

export const dynamic = "force-dynamic";

const MISSING = /mk_landing|schema cache|does not exist/i;
const SLUG = /^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/;
/** Addresses Genie already answers on — a page may not take one. */
const RESERVED = new Set(["api", "lp", "crm", "hrms", "kuber", "ims", "marketing", "saamaan", "seva", "vishwakarma", "idp", "lms", "login", "my", "project", "admin", "floor-report", "_next", "static", "assets", "robots", "sitemap", "favicon"]);
const FIELDS = new Set(["name", "email", "phone", "company", "message"]);

/** GET — every page; ?id= one page with what has been filled in on it. */
export async function GET(req: Request) {
  try {
    const u = await requireMarketing();
    const db = crmDb();
    const id = new URL(req.url).searchParams.get("id");
    if (id) {
      const { data: row, error } = await db.from("mk_landing").select("*").eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) throw new HttpError(404, "no such page");
      const { data: submits } = await db.from("mk_landing_submit").select("id, name, email, phone, company, message, person_id, at").eq("landing_id", id).order("at", { ascending: false }).limit(300);
      return NextResponse.json({ row, submits: submits ?? [] });
    }
    let q = db.from("mk_landing").select("id, slug, title, headline, published, indexable, views, submits, add_to_list_id, created_by_email, created_at, updated_at").order("created_at", { ascending: false });
    if (u.scope === "mine") q = q.eq("created_by_email", u.email.toLowerCase());
    const { data, error } = await q;
    if (error) {
      if (MISSING.test(error.message)) return NextResponse.json({ installed: false, pages: [] });
      throw new Error(error.message);
    }
    return NextResponse.json({ installed: true, pages: data ?? [] });
  } catch (e) {
    return errJson(e);
  }
}

/** POST — { action: "save" | "publish" | "delete", ... } */
export async function POST(req: Request) {
  try {
    const u = await requireMarketing();
    const b = await readBody(req, { action: "string", id: "uuid?" });
    const db = crmDb();
    const me = u.email.toLowerCase();
    const own = async (id: string) => {
      const { data } = await db.from("mk_landing").select("created_by_email").eq("id", id).maybeSingle();
      if (!data) throw new HttpError(404, "no such page");
      if (u.scope !== "all" && data.created_by_email !== me) throw new HttpError(403, "not your page");
    };

    if (b.action === "save") {
      const slug = String(b.slug || "").trim().toLowerCase();
      if (!SLUG.test(slug)) throw new HttpError(400, "The address may use small letters, numbers and hyphens — 3 to 60 characters, e.g. gse-loaders.");
      if (RESERVED.has(slug)) throw new HttpError(400, `${slug} is one of Genie's own addresses — pick another.`);
      const fields = (Array.isArray(b.form_fields) ? b.form_fields : ["name", "email", "phone", "company"]).map(String).filter((f) => FIELDS.has(f));
      const row = {
        slug, title: String(b.title || "").trim() || "Nandan GSE", headline: b.headline ?? null, subhead: b.subhead ?? null,
        body_html: b.body_html ?? null, hero_url: b.hero_url ?? null, logo: b.logo !== false,
        theme: ["navy", "white", "orange"].includes(String(b.theme)) ? String(b.theme) : "navy",
        form_fields: fields.length ? fields : ["name", "email"], cta_label: String(b.cta_label || "Send").slice(0, 40),
        thank_you: b.thank_you ?? null, add_to_list_id: b.add_to_list_id || null, tag_name: String(b.tag_name || "Landing page").slice(0, 60),
        indexable: !!b.indexable, updated_at: new Date().toISOString(),
      };
      if (b.id) {
        await own(b.id);
        const { error } = await db.from("mk_landing").update(row).eq("id", b.id);
        if (error) throw new Error(/duplicate|unique/i.test(error.message) ? `Another page already answers at /${slug}.` : error.message);
        return NextResponse.json({ ok: true, id: b.id });
      }
      const { data, error } = await db.from("mk_landing").insert({ ...row, created_by_email: me }).select("id").single();
      if (error) {
        if (MISSING.test(error.message)) throw new HttpError(400, "Run CRM migration 0056 first — landing pages have nowhere to live yet.");
        throw new Error(/duplicate|unique/i.test(error.message) ? `Another page already answers at /${slug}.` : error.message);
      }
      return NextResponse.json({ ok: true, id: data.id });
    }

    if (!b.id) throw new HttpError(400, "id required");
    await own(b.id);
    if (b.action === "publish") {
      const { error } = await db.from("mk_landing").update({ published: !!b.published, updated_at: new Date().toISOString() }).eq("id", b.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }
    if (b.action === "delete") {
      const { error } = await db.from("mk_landing").delete().eq("id", b.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }
    throw new HttpError(400, "unknown action");
  } catch (e) {
    return errJson(e);
  }
}
