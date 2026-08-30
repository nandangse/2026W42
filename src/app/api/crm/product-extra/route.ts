import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { crmDb, crmConfigured, CrmNotConfigured } from "@/crm/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Everything that hangs off a product record's tabs (Dr Raghu, 30 Aug 2026).
 *
 *   GET  ?id=<product uuid> — { quotes, prices, training, erp_url }
 *   POST { action: "price_add" | "price_del" | "training_save" | "erp_refresh", ... }
 *
 * The pricing ladder's approved row is THE price a quote line starts from;
 * marking a row approved retires the previous approval and (for INR) writes
 * product.approved_price_inr so lists and quote defaults agree.
 */

async function erpCfg(db: ReturnType<typeof crmDb>) {
  const { data } = await db.from("integration_setting").select("config").eq("key", "erpnext").maybeSingle();
  const cfg = (data?.config || {}) as Record<string, string>;
  if (!cfg.url || !cfg.api_key || !cfg.api_secret) return null;
  return { base: cfg.url.replace(/\/+$/, ""), H: { authorization: `token ${cfg.api_key}:${cfg.api_secret}` } };
}

export async function GET(req: Request) {
  try {
    await requireCrm();
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    const db = crmDb();
    const u = new URL(req.url);

    // ?search= — the quote grid's item type-ahead (Dr Raghu, 30 Aug 2026:
    // "search item name or item group or description"), throttled by ?group=
    const search = String(u.searchParams.get("search") || "").trim();
    if (search) {
      const q = search.replace(/[,%()]/g, " ").trim();
      if (q.length < 2) return NextResponse.json({ hits: [] });
      let qy = db.from("product")
        .select("id, name, sku, item_group, approved_price_inr, description")
        .is("deleted_at", null).eq("is_active", true)
        .or(`name.ilike.%${q}%,item_group.ilike.%${q}%,sku.ilike.%${q}%,description.ilike.%${q}%`)
        .limit(8);
      const group = String(u.searchParams.get("group") || "").trim();
      if (group) qy = qy.eq("item_group", group);
      const { data, error } = await qy;
      if (error) throw new HttpError(500, error.message);
      return NextResponse.json({
        hits: (data ?? []).map((p) => ({
          id: p.id, name: p.name, sku: p.sku, item_group: p.item_group,
          approved_price_inr: p.approved_price_inr,
          snippet: String(p.description || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 120),
        })),
      });
    }

    const id = String(u.searchParams.get("id") || "");
    if (!id) throw new HttpError(400, "Which product?");
    const { data: prod } = await db.from("product").select("id, item_group").eq("id", id).maybeSingle();
    if (!prod) throw new HttpError(404, "That product no longer exists.");

    const [{ data: quotes }, { data: prices }, { data: training }, cfg] = await Promise.all([
      db.from("product_quote").select("id, qtn_no, line_no, client, quoted_on, qty, rate, amount, currency, source")
        .eq("product_id", id).order("quoted_on", { ascending: false }).limit(400),
      db.from("product_price").select("id, priced_on, currency, amount, remarks, approved_by, is_approved")
        .eq("product_id", id).order("is_approved", { ascending: false }).order("priced_on", { ascending: false }).limit(200),
      prod.item_group
        ? db.from("product_family_training").select("content, updated_by, updated_at").eq("item_group", prod.item_group).maybeSingle()
        : Promise.resolve({ data: null }),
      erpCfg(db),
    ] as const);

    return NextResponse.json({
      quotes: quotes ?? [], prices: prices ?? [],
      training: training ?? null, erp_url: cfg?.base ?? null,
    });
  } catch (e) {
    return errJson(e);
  }
}

export async function POST(req: Request) {
  try {
    const me = await requireCrm();
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    const db = crmDb();
    const body = await req.json();
    const action = String(body.action || "");

    if (action === "price_add") {
      const pid = String(body.product_id || "");
      const amount = Number(body.amount);
      if (!pid || !(amount > 0)) throw new HttpError(400, "A product and an amount, please.");
      const currency = ["INR", "USD", "EUR"].includes(String(body.currency)) ? String(body.currency) : "INR";
      const isApproved = body.is_approved === true;
      if (isApproved)
        await db.from("product_price").update({ is_approved: false }).eq("product_id", pid).eq("is_approved", true);
      const { data: row, error } = await db.from("product_price").insert({
        product_id: pid,
        priced_on: String(body.priced_on || "").slice(0, 10) || undefined,
        currency, amount,
        remarks: String(body.remarks || "").slice(0, 500) || null,
        approved_by: String(body.approved_by || "").slice(0, 120) || null,
        is_approved: isApproved,
        created_by: me.profileId,
      }).select("id").single();
      if (error) throw new HttpError(500, error.message);
      // the approved INR row IS the catalogue price — lists and quote
      // defaults read approved_price_inr, so it follows the ladder's head
      if (isApproved && currency === "INR")
        await db.from("product").update({ approved_price_inr: amount }).eq("id", pid);
      if (isApproved && currency === "USD")
        await db.from("product").update({ alt_price_usd: amount }).eq("id", pid);
      return NextResponse.json({ ok: true, id: row.id });
    }

    if (action === "price_del") {
      const { error } = await db.from("product_price").delete().eq("id", String(body.id || "")).eq("is_approved", false);
      if (error) throw new HttpError(500, error.message);
      return NextResponse.json({ ok: true, note: "An approved row cannot be deleted — approve another first." });
    }

    if (action === "training_save") {
      const group = String(body.item_group || "").trim();
      if (!group) throw new HttpError(400, "Which product family?");
      const { error } = await db.from("product_family_training").upsert({
        item_group: group, content: String(body.content || ""),
        updated_by: me.email, updated_at: new Date().toISOString(),
      }, { onConflict: "item_group" });
      if (error) throw new HttpError(500, error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "erp_refresh") {
      const pid = String(body.product_id || "");
      const { data: prod } = await db.from("product").select("id, sku").eq("id", pid).maybeSingle();
      if (!prod) throw new HttpError(404, "That product no longer exists.");
      const cfg = await erpCfg(db);
      if (!cfg) throw new HttpError(503, "ERPNext is not connected — the keys live in Settings → Integrations.");
      const r = await fetch(`${cfg.base}/api/resource/Item/${encodeURIComponent(String(prod.sku))}`, { headers: cfg.H });
      if (!r.ok) throw new HttpError(502, `The ERP has no Item ${prod.sku} (${r.status}).`);
      const it = ((await r.json()) as { data: Record<string, unknown> }).data;
      const abs = (h: string) => h.replace(/(src|href)="\/(files|private\/files)\//g, `$1="${cfg.base}/$2/`);
      const desc = String(it.description || "");
      // the item's attached files ride along — pictures and PDFs both
      let attachments: { name: string; url: string }[] = [];
      try {
        const fr = await fetch(`${cfg.base}/api/resource/File?filters=${encodeURIComponent(JSON.stringify([["attached_to_doctype", "=", "Item"], ["attached_to_name", "=", prod.sku]]))}&fields=${encodeURIComponent('["file_name","file_url"]')}&limit_page_length=50`, { headers: cfg.H });
        if (fr.ok) attachments = (((await fr.json()) as { data?: { file_name?: string; file_url?: string }[] }).data ?? [])
          .filter((f) => f.file_url)
          .map((f) => ({ name: String(f.file_name || f.file_url), url: String(f.file_url).startsWith("/") ? cfg.base + String(f.file_url) : String(f.file_url) }));
      } catch { /* files are a bonus, never the blocker */ }
      const img = String(it.image || "") || attachments.find((a) => /\.(png|jpe?g|webp|gif)$/i.test(a.url))?.url || null;
      const patch: Record<string, unknown> = {
        name: String(it.item_name || prod.sku).slice(0, 300),
        item_group: it.item_group || null,
        description: /^\s*</.test(desc) ? abs(desc) : desc || null,
        image: img ? (img.startsWith("/") ? cfg.base + img : img) : null,
        erp_modified: it.modified ? new Date(String(it.modified).replace(" ", "T") + "+05:30").toISOString() : null,
        updated_at: new Date().toISOString(),
      };
      if (attachments.length) patch.attachments = attachments;
      const { error } = await db.from("product").update(patch).eq("id", pid);
      if (error) throw new HttpError(500, error.message);
      await db.from("crm_audit").insert({
        entity: "product", entity_id: pid, action: "erp_refresh",
        after: { sku: prod.sku, attachments: attachments.length }, by_user: me.profileId,
      }).then(() => null, () => null);
      return NextResponse.json({ ok: true, attachments: attachments.length, image: !!patch.image });
    }

    throw new HttpError(400, "Unknown action.");
  } catch (e) {
    return errJson(e);
  }
}
