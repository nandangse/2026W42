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

    // who is already in — never touched again. A Genie-born enquiry pushed
    // INTO the ERP carries its ERP name on erp_opportunity_name, so the pull
    // must not bring it back as a twin.
    const names = rows.map((x) => String(x.name));
    const [{ data: have }, { data: pushed }] = await Promise.all([
      db.from("opportunity").select("opportunity_no").in("opportunity_no", names),
      db.from("opportunity").select("erp_opportunity_name").in("erp_opportunity_name", names),
    ]);
    const haveSet = new Set([
      ...(have || []).map((x) => String(x.opportunity_no)),
      ...(pushed || []).map((x) => String(x.erp_opportunity_name)),
    ]);

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

    // ---- PHASE 2 (Dr Raghu, 30 Aug 2026): the DELIVERED LEDGER syncs from
    // the ERP — every Jobmaster changed since the last walk rewrites its
    // delivered row's fields, mapped from the ERP's own names (read from a
    // live document, never guessed). The ledger's dates and money then say
    // what the ERP says, hourly.
    let djSynced = 0;
    let jmCursorNew = String(cfg.jm_cursor || "2026-08-30 00:00:00");
    try {
      const { adminClient } = await import("@/lib/supabase/admin");
      const gdb = adminClient();
      const jmCursor = jmCursorNew;
      const JM_FIELDS = ["name", "modified", "customer_tag", "product_family", "customer", "value",
        "actual_delivery_date", "custom_otd_date", "target_delivery_date_current", "job_start_date",
        "status", "planning_owner", "throughput", "throughput_expected_pc",
        "kitting_percentage", "custom_production_completion_pc", "project"];
      const u3 = `${base}/api/resource/Jobmaster?fields=${encodeURIComponent(JSON.stringify(JM_FIELDS))}` +
        `&filters=${encodeURIComponent(JSON.stringify([["modified", ">", jmCursor]]))}` +
        `&order_by=${encodeURIComponent("modified asc")}&limit_page_length=200`;
      const r2 = await fetch(u3, { headers: EH });
      if (r2.ok) {
        const jm = ((await r2.json()) as { data?: Record<string, unknown>[] }).data ?? [];
        for (const j of jm) {
          const mod = String(j.modified || "");
          if (mod > jmCursorNew) jmCursorNew = mod;
          const patch: Record<string, unknown> = {
            tag: j.customer_tag ?? null, fam: j.product_family ?? null, cust: j.customer ?? null,
            val: Number(j.value) || 0,
            delivered_on: String(j.actual_delivery_date || "").slice(0, 10) || null,
            otd: String(j.custom_otd_date || "").slice(0, 10) || null,
            tdd: String(j.target_delivery_date_current || "").slice(0, 10) || null,
            start_date: String(j.job_start_date || "").slice(0, 10) || null,
            stat: j.status ?? null, own: j.planning_owner ?? null,
            tp: Number(j.throughput) || 0, tpp: Number(j.throughput_expected_pc) || 0,
            kit: Number(j.kitting_percentage) || 0, pct: Number(j.custom_production_completion_pc) || 0,
            ...(j.project ? { proj: j.project } : {}),
          };
          const { data: upd, error: ue2 } = await gdb.from("delivered_jobs").update(patch).eq("id", String(j.name)).select("id");
          if (!ue2 && upd?.length) djSynced++;
        }
      }
    } catch { /* the ledger sync is best-effort — the pull above still stands */ }

    // move both cursors only past what we actually walked
    await db.from("integration_setting").update({ config: { ...cfg, last_pull: maxCreation, jm_cursor: jmCursorNew } }).eq("key", "erpnext");
    await db.from("crm_audit").insert({
      entity: "opportunity", entity_id: null, action: "erp_pull",
      after: { pulled, skippedExisting, noCompany, cursor: maxCreation }, by_user: null,
    }).then(() => null, () => null);
    return NextResponse.json({ ok: true, pulled, skippedExisting, noCompany, deliveredSynced: djSynced, cursor: maxCreation, jmCursor: jmCursorNew, more: rows.length === 300 });
  } catch (e) {
    return errJson(e);
  }
}
