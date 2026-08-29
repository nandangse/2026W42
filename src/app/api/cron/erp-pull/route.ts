import { NextResponse } from "next/server";
import { currentUser, errJson, HttpError } from "@/lib/auth";
import { crmDb, crmConfigured } from "@/crm/db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/erp-pull — every hour, from vercel.json (Dr Raghu,
 * 29 Aug 2026: "this pull from ERPNext is not happening?" — the big import
 * was a one-time carry; this keeps the door open after it).
 *
 * NEW opportunities born in the ERP since the last pull come in with the
 * same 1:1 links the import kept — the ERP's own customer and contact.
 * Existing rows are NEVER overwritten: Genie-side edits win, and the
 * sales-side stays PULL-ONLY (nothing is written back to the ERP).
 *
 * Vercel signs its cron calls with CRON_SECRET; a signed-in hand may also
 * fire it by hand.
 */
export async function GET(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    const header = req.headers.get("authorization") || "";
    const fromCron = !!secret && header === `Bearer ${secret}`;
    if (!fromCron) {
      const u = await currentUser();
      if (!u || u.disabled) throw new HttpError(401, "The hourly cron, or a signed-in hand.");
    }
    if (!crmConfigured()) return NextResponse.json({ ok: false, note: "CRM not configured." });
    const db = crmDb();

    const { data: cfgRow } = await db.from("integration_setting").select("config").eq("key", "erpnext").maybeSingle();
    const cfg = (cfgRow?.config || {}) as Record<string, string>;
    if (!cfg.url || !cfg.api_key || !cfg.api_secret)
      return NextResponse.json({ ok: false, note: "ERPNext keys not saved in Integrations." });
    const base = cfg.url.replace(/\/+$/, "");
    const EH = { authorization: `token ${cfg.api_key}:${cfg.api_secret}` };
    // the cursor starts where the big import ended
    const cursor = String(cfg.last_pull || "2026-08-29 04:00:00");

    const infoField = String(cfg.opp_info_field || "").trim();
    const fields = ["name", "creation", "transaction_date", "customer_name", "contact_person", "title",
      "sales_stage", "sector", "product_group", "utm_source", "opportunity_type", "owner",
      "custom_product_suitable_to_be_made_by_us", ...(infoField ? [infoField] : [])];
    const u2 = `${base}/api/resource/Opportunity?fields=${encodeURIComponent(JSON.stringify(fields))}` +
      `&filters=${encodeURIComponent(JSON.stringify([["creation", ">", cursor]]))}` +
      `&order_by=${encodeURIComponent("creation asc")}&limit_page_length=300`;
    const r = await fetch(u2, { headers: EH });
    if (!r.ok) throw new HttpError(502, `The ERP answered ${r.status} on the pull.`);
    const rows = ((await r.json()) as { data?: Record<string, unknown>[] }).data ?? [];
    if (!rows.length) return NextResponse.json({ ok: true, pulled: 0, cursor });

    // the ERP's HTML becomes the markdown our reader renders (same law as
    // the import — bold, links, bullets, never raw angle brackets)
    const htmlToRich = (h: string) => h
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/(p|div|tr|h[1-6])>/gi, "\n")
      .replace(/<li[^>]*>/gi, "\n- ")
      .replace(/<img[^>]*src="([^"]+)"[^>]*>/gi, " [🖼 image]($1) ")
      .replace(/<a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, (_m, u3, t) => ` [${String(t).replace(/<[^>]+>/g, "").trim() || "link"}](${u3}) `)
      .replace(/<(b|strong)>(.*?)<\/\1>/gi, "**$2**")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, "\"")
      .replace(/\n{3,}/g, "\n\n").trim();

    // who is already in — never touched again
    const names = rows.map((x) => String(x.name));
    const { data: have } = await db.from("opportunity").select("opportunity_no").in("opportunity_no", names);
    const haveSet = new Set((have || []).map((x) => String(x.opportunity_no)));

    // the lookup tables, once per run
    const [{ data: stages }, { data: sectors }] = await Promise.all([
      db.from("stage").select("id, name").eq("entity", "opportunity"),
      db.from("sector").select("id, name"),
    ]);
    const stageByName = new Map((stages || []).map((s) => [String(s.name).toLowerCase(), s.id]));
    const stageOf = (s: string) => {
      const k = s.toLowerCase();
      if (k === "prospecting") return stageByName.get("suspect") ?? stageByName.get("new") ?? null;
      return stageByName.get(k) ?? stageByName.get("new") ?? null;
    };
    const sectorByName = new Map((sectors || []).map((s) => [String(s.name).toLowerCase(), s.id]));
    const { data: profiles } = await db.from("profile").select("id, email, full_name");
    const profByEmail = new Map((profiles || []).map((p) => [String(p.email).toLowerCase(), p.id]));

    let pulled = 0, skippedExisting = 0, noCompany = 0;
    let maxCreation = cursor;
    for (const o of rows) {
      const no = String(o.name);
      const created = String(o.creation || "");
      if (created > maxCreation) maxCreation = created;
      if (haveSet.has(no)) { skippedExisting++; continue; }

      // the ERP's own customer and contact — the 1:1 the import kept
      let company_id: string | null = null;
      const custName = String(o.customer_name || "").trim();
      if (custName) {
        const { data: co } = await db.from("company").select("id")
          .or(`name.ilike."${custName.replace(/[",]/g, "")}",erp_name.ilike."${custName.replace(/[",]/g, "")}"`)
          .limit(1);
        company_id = co?.[0]?.id ?? null;
        if (!company_id) noCompany++;
      }
      let contact_id: string | null = null;
      const cp = String(o.contact_person || "").trim();
      if (cp) {
        const { data: p } = await db.from("person").select("id").eq("erp_name", cp).limit(1);
        contact_id = p?.[0]?.id ?? null;
      }
      const suitability = Number(String(o.custom_product_suitable_to_be_made_by_us || "").replace(/[^0-9]/g, "")) || null;
      const txn = String(o.transaction_date || "").slice(0, 10) || null;
      const close = txn ? new Date(new Date(txn + "T00:00:00Z").getTime() + 30 * 86400000).toISOString().slice(0, 10) : null;
      const { error } = await db.from("opportunity").insert({
        opportunity_no: no, erp_opportunity_name: no,
        name: custName || String(o.title || no).slice(0, 200),
        pipeline: "capital",
        stage_id: stageOf(String(o.sales_stage || "")),
        sector_id: sectorByName.get(String(o.sector || "").toLowerCase()) ?? null,
        product_family: String(o.product_group || "").trim() || null,
        source: String(o.utm_source || "").trim() || null,
        company_id, contact_id,
        owner_id: profByEmail.get(String(o.owner || "").toLowerCase()) ?? null,
        opportunity_on: txn, expected_close_on: close,
        currency: "INR", priority: "Standard",
        is_tender: /tender/i.test(String(o.opportunity_type || "")),
        product_suitability_pct: suitability,
        enquiry_info: infoField && o[infoField] ? htmlToRich(String(o[infoField])) : null,
      });
      if (!error) pulled++;
    }

    // move the cursor only past what we actually walked
    await db.from("integration_setting").update({ config: { ...cfg, last_pull: maxCreation } }).eq("key", "erpnext");
    await db.from("crm_audit").insert({
      entity: "opportunity", entity_id: null, action: "erp_pull",
      after: { pulled, skippedExisting, noCompany, cursor: maxCreation }, by_user: null,
    }).then(() => null, () => null);
    return NextResponse.json({ ok: true, pulled, skippedExisting, noCompany, cursor: maxCreation, more: rows.length === 300 });
  } catch (e) {
    return errJson(e);
  }
}
