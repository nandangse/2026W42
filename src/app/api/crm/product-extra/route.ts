import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { swallow } from "@/lib/swallow";
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
    const group = String(u.searchParams.get("group") || "").trim();
    if (search || group) {
      const q = search.replace(/[,%()*]/g, " ").trim();
      // a chosen group BROWSES on focus (Dr Raghu, 30 Aug 2026: "once the
      // item group is chosen the dropdown will come in") — typing narrows
      if (q.length < 2 && !group) return NextResponse.json({ hits: [] });
      let qy = db.from("product")
        .select("id, name, sku, item_group, approved_price_inr, alt_price_usd, last_quoted_price, avg_quoted_price_1y, description")
        .is("deleted_at", null).eq("is_active", true)
        .order("name").limit(10);
      if (q.length >= 2) qy = qy.or(`name.ilike.*${q}*,item_group.ilike.*${q}*,sku.ilike.*${q}*,description.ilike.*${q}*`);
      if (group) qy = qy.eq("item_group", group);
      const { data, error } = await qy;
      if (error) throw new HttpError(500, error.message);
      return NextResponse.json({
        hits: (data ?? []).map((p) => ({
          id: p.id, name: p.name, sku: p.sku, item_group: p.item_group,
          // the price that rides in: approved first, else last quoted, else
          // the year's average (Dr Raghu, 30 Aug 2026: "why isn't the price
          // being pulled?")
          approved_price_inr: p.approved_price_inr ?? p.last_quoted_price ?? p.avg_quoted_price_1y ?? null,
          /* the item's OWN dollar price, when the master carries one (Dr
             Raghu, 8 Sep 2026: "for every item that we choose, if it has got
             a USD or a euro amount, it will show that"). Null is not zero —
             null means convert the rupee price and say so. */
          alt_price_usd: p.alt_price_usd ?? null,
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
    const body = await readBody(req, {});
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
      } catch (e) { swallow("crm/product-extra", e); /* files are a bonus, never the blocker */ }
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

    /**
     * { action: "attach_add" | "attach_del", product_id, name?, url? }
     *
     * The product's own attachment list. The file itself is already in the
     * cards bucket (opp-attach put it there and mirrored it to Drive); this
     * only keeps the list on the record, because `attachments` is a jsonb
     * column rather than a declared field the generic PATCH would accept.
     */
    if (action === "attach_add" || action === "attach_del") {
      const pid = String(body.product_id || "");
      const { data: prod } = await db.from("product").select("id, attachments").eq("id", pid).maybeSingle();
      if (!prod) throw new HttpError(404, "That product no longer exists.");
      const list = Array.isArray(prod.attachments) ? (prod.attachments as { name?: string; url?: string }[]) : [];
      const url = String(body.url || "");
      let next: typeof list;
      if (action === "attach_add") {
        if (!url) throw new HttpError(400, "A file, please.");
        next = [...list, { name: String(body.name || url).slice(0, 200), url }].slice(-100);
      } else {
        next = list.filter((a) => String(a.url) !== url);
      }
      const { error } = await db.from("product").update({ attachments: next, updated_at: new Date().toISOString() }).eq("id", pid);
      if (error) throw new HttpError(500, error.message);
      return NextResponse.json({ ok: true, attachments: next });
    }

    /**
     * ⇧ PUSH TO ERP (Dr Raghu, 31 Aug 2026: "Can this be pushed back to erp?
     * along with the modification?").
     *
     * Yes — the stored token is his own ERP user, which holds write on Item,
     * Item Price and File. But a write into the master data of the ERP is not
     * a thing to do quietly, so this route is deliberately two-step:
     *
     *   { action: "erp_diff", product_id }  — reads both sides and says what
     *       differs. Writes NOTHING.
     *   { action: "erp_push", product_id, fields: ["description","image",
     *       "price","attachments"] } — pushes ONLY what is named, and only
     *       what actually differs.
     *
     * The price does not live on the Item: it is a row in the Standard
     * Selling price list, so it is updated there, or created if the item has
     * never carried one.
     */
    if (action === "erp_diff" || action === "erp_push") {
      const pid = String(body.product_id || "");
      const { data: prod } = await db.from("product")
        .select("id, sku, name, description, image, approved_price_inr, attachments").eq("id", pid).maybeSingle();
      if (!prod) throw new HttpError(404, "That product no longer exists.");
      const sku = String(prod.sku || "");
      if (!sku) throw new HttpError(400, "That product carries no ERP item code, so there is nothing to push to.");
      const cfg = await erpCfg(db);
      if (!cfg) throw new HttpError(503, "ERPNext is not connected — the keys live in Settings → Integrations.");

      const ir = await fetch(`${cfg.base}/api/resource/Item/${encodeURIComponent(sku)}`, { headers: cfg.H });
      if (!ir.ok) throw new HttpError(502, `The ERP has no Item ${sku} (${ir.status}).`);
      const it = ((await ir.json()) as { data: Record<string, unknown> }).data;

      // The Standard Selling row — the ERP's answer to "what does it cost".
      const pf = encodeURIComponent(JSON.stringify([["item_code", "=", sku], ["price_list", "=", "Standard Selling"]]));
      const pr = await fetch(`${cfg.base}/api/resource/Item Price?filters=${pf}&fields=${encodeURIComponent(JSON.stringify(["name", "price_list_rate", "currency"]))}`, { headers: cfg.H });
      const priceRow = (((await pr.json().catch(() => null)) as { data?: Record<string, unknown>[] })?.data ?? [])[0] || null;

      // Genie's description is stored with the ERP's own files made absolute;
      // they must go back relative or the ERP stores a link to itself.
      const rel = (h: string) => h.split(`${cfg.base}/files/`).join("/files/").split(`${cfg.base}/private/files/`).join("/private/files/");
      const genieDesc = rel(String(prod.description || ""));
      const erpDesc = String(it.description || "");
      const genieImg = String(prod.image || "");
      const erpImg = String(it.image || "");
      const geniePrice = prod.approved_price_inr == null ? null : Number(prod.approved_price_inr);
      const erpPrice = priceRow ? Number(priceRow.price_list_rate) : null;

      // An image Genie holds in its own bucket cannot be handed to the ERP as
      // a link — the ERP could not read it. It must be uploaded as a file.
      const imageIsOurs = /^\/api\/crm\/opp-attach/.test(genieImg);

      const diff = {
        description: { genie: genieDesc.slice(0, 400), erp: erpDesc.slice(0, 400), differs: genieDesc.trim() !== erpDesc.trim() && !!genieDesc.trim() },
        image: { genie: genieImg, erp: erpImg, differs: !!genieImg && genieImg !== erpImg, needsUpload: imageIsOurs },
        price: { genie: geniePrice, erp: erpPrice, differs: geniePrice != null && geniePrice !== erpPrice, hasRow: !!priceRow },
      };
      if (action === "erp_diff")
        return NextResponse.json({ ok: true, sku, erp_url: `${cfg.base}/app/item/${encodeURIComponent(sku)}`, diff, erp_modified: it.modified ?? null });

      // ---------------- the write ----------------
      const want: string[] = Array.isArray(body.fields) ? body.fields.map(String) : [];
      if (!want.length) throw new HttpError(400, "Name at least one thing to push.");
      const done: string[] = [];
      const failed: { field: string; why: string }[] = [];

      const itemPatch: Record<string, unknown> = {};
      if (want.includes("description") && diff.description.differs) itemPatch.description = genieDesc;

      // The image: uploaded to the ERP first where it is Genie's own, then
      // the Item is pointed at what the ERP itself now holds.
      if (want.includes("image") && diff.image.differs) {
        try {
          let erpUrl = genieImg;
          if (imageIsOurs) {
            const path = decodeURIComponent(new URL(genieImg, "http://x").searchParams.get("path") || "");
            const { data: dl, error: dErr } = await db.storage.from("cards").download(path);
            if (dErr || !dl) throw new Error("Genie could not read its own copy of the image.");
            const fd = new FormData();
            fd.append("file", new File([await dl.arrayBuffer()], path.split("/").pop() || "image.png", { type: dl.type || "image/png" }));
            fd.append("is_private", "0");
            fd.append("doctype", "Item");
            fd.append("docname", sku);
            const ur = await fetch(`${cfg.base}/api/method/upload_file`, { method: "POST", headers: cfg.H, body: fd });
            const uj = await ur.json().catch(() => null);
            if (!ur.ok) throw new Error(`The ERP refused the upload (${ur.status}).`);
            erpUrl = String((uj as { message?: { file_url?: string } })?.message?.file_url || "");
            if (!erpUrl) throw new Error("The ERP took the file but named no URL.");
          }
          itemPatch.image = erpUrl;
        } catch (e) {
          failed.push({ field: "image", why: e instanceof Error ? e.message : String(e) });
        }
      }

      if (Object.keys(itemPatch).length) {
        const w = await fetch(`${cfg.base}/api/resource/Item/${encodeURIComponent(sku)}`, {
          method: "PUT", headers: { ...cfg.H, "content-type": "application/json" }, body: JSON.stringify(itemPatch),
        });
        if (w.ok) done.push(...Object.keys(itemPatch));
        else {
          const t = await w.text().catch(() => "");
          for (const f of Object.keys(itemPatch)) failed.push({ field: f, why: `The ERP answered ${w.status}${/PermissionError/.test(t) ? " — no permission on Item" : ""}` });
        }
      }

      // The price is a row of its own, updated or created.
      if (want.includes("price") && diff.price.differs && geniePrice != null) {
        try {
          const res = priceRow
            ? await fetch(`${cfg.base}/api/resource/Item Price/${encodeURIComponent(String(priceRow.name))}`, {
                method: "PUT", headers: { ...cfg.H, "content-type": "application/json" },
                body: JSON.stringify({ price_list_rate: geniePrice }),
              })
            : await fetch(`${cfg.base}/api/resource/Item Price`, {
                method: "POST", headers: { ...cfg.H, "content-type": "application/json" },
                body: JSON.stringify({ item_code: sku, price_list: "Standard Selling", price_list_rate: geniePrice, currency: "INR", selling: 1 }),
              });
          if (res.ok) done.push("price");
          else failed.push({ field: "price", why: `The ERP answered ${res.status}` });
        } catch (e) {
          failed.push({ field: "price", why: e instanceof Error ? e.message : String(e) });
        }
      }

      // Attachments Genie holds go up as files against the Item.
      if (want.includes("attachments")) {
        const list = Array.isArray(prod.attachments) ? (prod.attachments as { name?: string; url?: string }[]) : [];
        const ours = list.filter((a) => /^\/api\/crm\/opp-attach/.test(String(a.url)));
        let sent = 0;
        for (const a of ours) {
          try {
            const path = decodeURIComponent(new URL(String(a.url), "http://x").searchParams.get("path") || "");
            const { data: dl } = await db.storage.from("cards").download(path);
            if (!dl) continue;
            const fd = new FormData();
            fd.append("file", new File([await dl.arrayBuffer()], String(a.name || "file"), { type: dl.type || "application/octet-stream" }));
            fd.append("is_private", "0");
            fd.append("doctype", "Item");
            fd.append("docname", sku);
            const ur = await fetch(`${cfg.base}/api/method/upload_file`, { method: "POST", headers: cfg.H, body: fd });
            if (ur.ok) sent++;
          } catch (e) { swallow("crm/product-extra", e); /* one file failing must not stop the rest */ }
        }
        if (sent) done.push(`${sent} attachment${sent === 1 ? "" : "s"}`);
        else if (ours.length) failed.push({ field: "attachments", why: "The ERP took none of them." });
      }

      await db.from("crm_audit").insert({
        entity: "product", entity_id: pid, action: "erp_push",
        after: { sku, pushed: done, failed }, by_user: me.profileId,
      }).then(() => null, () => null);

      return NextResponse.json({ ok: failed.length === 0, sku, pushed: done, failed });
    }

    throw new HttpError(400, "Unknown action.");
  } catch (e) {
    return errJson(e);
  }
}
