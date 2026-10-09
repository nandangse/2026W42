import { NextResponse } from "next/server";
import { swallow } from "@/lib/swallow";
import { currentUser, errJson, HttpError } from "@/lib/auth";
import { cronCaller } from "@/lib/cron-auth";
import { crmDb, crmConfigured } from "@/crm/db";
import { beat } from "@/lib/cron-beat";
import { adminClient } from "@/lib/supabase/admin";
import { pullIssues, pullIssueFiles, copyFrfToDrive } from "@/lib/seva-issues";
import { pullServiceQuotes } from "@/lib/seva-quotes";
import { pullAmcs } from "@/lib/seva-amc";
import { pullJobInfo } from "@/lib/seva-job-info";
import { ceoFigures, keepSnapshot, istDay, fyStartOf } from "@/lib/ceo/figures";

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
    /* the cron's secret, or the owner / Stratcom / the hands named (audit S12, 9 Oct 2026) */
    const { fromCron } = await cronCaller(req, "erp-pull");
    await beat("erp-pull", "fired", { fromCron });
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
    // a quiet hour still walks phase 2 and still leaves its footprint —
    // an early return here once skipped the delivered sync entirely

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
    // an empty in.() is a PostgREST error, not an empty answer
    const [{ data: have }, { data: pushed }] = names.length ? await Promise.all([
      db.from("opportunity").select("opportunity_no").in("opportunity_no", names),
      db.from("opportunity").select("erp_opportunity_name").in("erp_opportunity_name", names),
    ]) : [{ data: [] }, { data: [] }];
    const haveSet = new Set([
      ...(have || []).map((x) => String(x.opportunity_no)),
      ...(pushed || []).map((x) => String(x.erp_opportunity_name)),
    ]);
    /* A KNOWN ROW WITH NO DATE IS HEALED, NOT SKIPPED (7 Oct 2026). If any
       other path ever lands an opportunity thin again, the next hour fills
       its number, date, company and the rest from the ERP — never touching
       a field somebody has already filled. */
    const thinRows = new Map<string, Record<string, unknown>>();
    if (names.length) {
      const { data: th } = await db.from("opportunity").select("id, erp_opportunity_name, opportunity_no, opportunity_on, company_id, contact_id, owner_id, sector_id, product_family, source, enquiry_info, expected_close_on")
        .in("erp_opportunity_name", names).or("opportunity_on.is.null,opportunity_no.is.null");
      for (const t of th || []) thinRows.set(String(t.erp_opportunity_name), t as Record<string, unknown>);
    }

    // the lookup tables, once per run
    const [{ data: stages }, { data: sectors }] = await Promise.all([
      db.from("stage").select("id, name").eq("entity", "opportunity"),
      db.from("sector").select("id, name, code"),
    ]);
    const stageByName = new Map((stages || []).map((s) => [String(s.name).toLowerCase(), s.id]));
    const stageOf = (s: string) => {
      const k = s.toLowerCase();
      if (k === "prospecting") return stageByName.get("suspect") ?? stageByName.get("new") ?? null;
      return stageByName.get(k) ?? stageByName.get("new") ?? null;
    };
    /* THE ERP SAYS "MHE", THE CRM SAID "Material Handling Equipment" (found
       7 Oct 2026): matched by name alone, no pulled opportunity ever got a
       sector — 31,044 were blank. By code and by name now, and when the
       ERP has no sector, the product family's prefix (AGSE → GSE, MHE, CAR,
       DEF) says it. */
    const sectorByName = new Map<string, unknown>();
    for (const se of sectors || []) { sectorByName.set(String(se.name).toLowerCase(), se.id); if (se.code) sectorByName.set(String(se.code).toLowerCase(), se.id); }
    const PREFIX: [RegExp, string][] = [[/^(agse|gse|aae)\b/i, "gse"], [/^mhe\b/i, "mhe"], [/^car\b/i, "car"], [/^def\b/i, "def"], [/^(ser|service)\b/i, "ser"], [/^(cm|contract)\b/i, "cm"], [/^ent\b/i, "ent"]];
    const sectorOf = (sector: unknown, family: unknown) => {
      const s = String(sector || "").trim().toLowerCase();
      if (s && sectorByName.has(s)) return sectorByName.get(s) ?? null;
      const f = String(family || "").trim();
      const hit = PREFIX.find(([re]) => re.test(f));
      return hit ? sectorByName.get(hit[1]) ?? null : null;
    };
    const { data: profiles } = await db.from("profile").select("id, email, full_name");
    const profByEmail = new Map((profiles || []).map((p) => [String(p.email).toLowerCase(), p.id]));

    /* THE SOURCE IS AN ENUM HERE AND FREE TEXT THERE (found 7 Oct 2026).
       The ERP says "Email", "Google Ad", "Nandan Website", "GEM Tender",
       "Indiamart"; the CRM's lead_source knows 'email', 'google_ads',
       'website', 'tender', 'indiamart'. Written straight across, Postgres
       refused the row — and the refusal was swallowed below while the
       cursor moved on, so sixteen enquiries since 29 Aug never arrived.
       Mapped by name now; a value with no match is left empty, never
       refused. */
    const SOURCE: [RegExp, string][] = [
      [/indiamart/i, "indiamart"], [/whatsapp/i, "whatsapp"], [/e-?mail/i, "email"], [/google/i, "google_ads"],
      [/linkedin/i, "linkedin"], [/phone|call/i, "phone"], [/exhibition|expo|fair/i, "exhibition"], [/website|web/i, "website"],
      [/referral|reference/i, "referral"], [/field|visit/i, "field_visit"], [/tender|gem/i, "tender"],
    ];
    const sourceOf = (v: unknown) => { const t = String(v || "").trim(); if (!t) return null; return SOURCE.find(([re]) => re.test(t))?.[1] ?? null; };
    let pulled = 0, skippedExisting = 0, noCompany = 0, failed = 0, healed = 0, firstError = "";
    let maxCreation = cursor;
    for (const o of rows) {
      const no = String(o.name);
      const created = String(o.creation || "");
      if (created > maxCreation) maxCreation = created;
      if (haveSet.has(no) && !thinRows.has(no)) { skippedExisting++; continue; }
      const thin = thinRows.get(no);

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
      if (thin) {
        const fill: Record<string, unknown> = { opportunity_no: no, opportunity_on: txn };
        if (!thin.expected_close_on) fill.expected_close_on = close;
        if (!thin.company_id && company_id) fill.company_id = company_id;
        if (!thin.contact_id && contact_id) fill.contact_id = contact_id;
        if (!thin.owner_id) { const ow = profByEmail.get(String(o.owner || "").toLowerCase()); if (ow) fill.owner_id = ow; }
        if (!thin.sector_id) { const se = sectorOf(o.sector, o.product_group); if (se) fill.sector_id = se; }
        if (!thin.product_family && String(o.product_group || "").trim()) fill.product_family = String(o.product_group).trim();
        if (!thin.source) { const so = sourceOf(o.utm_source); if (so) fill.source = so; }
        if (!thin.enquiry_info && infoField && o[infoField]) fill.enquiry_info = htmlToRich(String(o[infoField]));
        const { error: hErr } = await db.from("opportunity").update(fill).eq("id", String(thin.id));
        if (!hErr) healed++; else { failed++; if (!firstError) firstError = `${no} (heal): ${hErr.message}`.slice(0, 300); }
        continue;
      }
      const { error } = await db.from("opportunity").insert({
        opportunity_no: no, erp_opportunity_name: no,
        name: custName || String(o.title || no).slice(0, 200),
        pipeline: "capital",
        stage_id: stageOf(String(o.sales_stage || "")),
        sector_id: sectorOf(o.sector, o.product_group),
        product_family: String(o.product_group || "").trim() || null,
        source: sourceOf(o.utm_source),
        company_id, contact_id,
        owner_id: profByEmail.get(String(o.owner || "").toLowerCase()) ?? null,
        opportunity_on: txn, expected_close_on: close,
        currency: "INR", priority: "Standard",
        is_tender: /tender/i.test(String(o.opportunity_type || "")),
        product_suitability_pct: suitability,
        enquiry_info: infoField && o[infoField] ? htmlToRich(String(o[infoField])) : null,
      });
      if (!error) pulled++;
      else { failed++; if (!firstError) firstError = `${no}: ${error.message}`.slice(0, 300); }
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
    } catch (e) { swallow("cron/erp-pull", e); /* the ledger sync is best-effort — the pull above still stands */ }

    // ---- PHASE 3 (Dr Raghu, 3 Oct 2026: "support tickets are Issues. Pull
    // all of them … add this also to the hourly erp pull"): the ERP's Issues
    // into Seva, every field, from a cursor on `modified`; the files hanging
    // off them from a cursor on `creation`; and a batch of FRF forms copied
    // into the Drive. The first hours walk the whole history a dozen pages
    // at a time; after that an hour brings only what changed.
    let issueCursor = String(cfg.issue_cursor || ""), issueStart = Number(cfg.issue_start || 0);
    let fileCursor = String(cfg.issue_file_cursor || ""), fileStart = Number(cfg.issue_file_start || 0);
    const seva: Record<string, unknown> = {};
    try {
      const gadmin = adminClient();
      const t = await pullIssues(gadmin, { since: issueCursor, start: issueStart, maxPages: 10 });
      seva.tickets = { read: t.read, written: t.written, done: t.done };
      if (t.done) { issueCursor = t.maxModified || issueCursor; issueStart = 0; } else { issueStart = t.next_start; }
      const f = await pullIssueFiles(gadmin, { parent: "Issue", since: fileCursor, start: fileStart, maxPages: 4 });
      seva.files = { read: f.read, written: f.written, done: f.done };
      if (f.done) { fileCursor = f.maxModified || fileCursor; fileStart = 0; } else { fileStart = f.next_start; }
      const d = await copyFrfToDrive(gadmin, { limit: 25, by: "cron@genie" });
      seva.frf = { copied: d.copied, failed: d.failed, left: d.left };
      /* every job's site, dates and installation cost (12 Oct 2026) */
      try { const jp = await pullJobInfo(gadmin); seva.jobs = { found: jp.found }; }
      catch (e) { seva.jobs = { error: (e instanceof Error ? e.message : String(e)).slice(0, 120) }; }
      /* the AMC register, by the contract's own dates — one list call (12 Oct 2026) */
      try { const ap = await pullAmcs(gadmin, "cron@genie"); seva.amc = { found: ap.found, updated: ap.updated, valid: ap.valid }; }
      catch (e) { seva.amc = { error: (e instanceof Error ? e.message : String(e)).slice(0, 120) }; }
      /* the service team's quotations, by modified, so an ERP status change arrives within the hour (12 Oct 2026) */
      try { const qp = await pullServiceQuotes(gadmin, { maxPages: 2 }); seva.quotes = { read: qp.read, written: qp.written, done: qp.done }; }
      catch (e) { seva.quotes = { error: (e instanceof Error ? e.message : String(e)).slice(0, 120) }; }
    } catch (e) { seva.error = (e instanceof Error ? e.message : String(e)).slice(0, 200); swallow("cron/erp-pull/seva", e); }

    /* THE CEO'S DAILY SNAPSHOT (14 Oct 2026) — once a day, the financial year to date, so the week-on-week triangles have a week back even on a day nobody opened the page */
    try {
      const sadmin = adminClient(); const { count } = await sadmin.from("ceo_snapshot").select("*", { count: "exact", head: true }).eq("day", istDay());
      if (!count) { const t = istDay(); const f = await ceoFigures(sadmin, fyStartOf(t), t); await keepSnapshot(sadmin, f.snap); }
    } catch (e) { swallow("cron/erp-pull/ceo-snapshot", e); }

    // move the cursors only past what we actually walked
    await db.from("integration_setting").update({ config: { ...cfg, last_pull: maxCreation, jm_cursor: jmCursorNew, issue_cursor: issueCursor, issue_start: issueStart, issue_file_cursor: fileCursor, issue_file_start: fileStart } }).eq("key", "erpnext");
    await beat("erp-pull", "done", { last_pull: maxCreation, pulled, healed, failed, ...(firstError ? { firstError } : {}), seva });
    await db.from("crm_audit").insert({
      entity: "opportunity", entity_id: null, action: "erp_pull",
      after: { pulled, skippedExisting, noCompany, healed, failed, ...(firstError ? { firstError } : {}), cursor: maxCreation }, by_user: null,
    }).then(() => null, () => null);
    return NextResponse.json({ ok: true, pulled, skippedExisting, noCompany, healed, failed, firstError: firstError || null, deliveredSynced: djSynced, cursor: maxCreation, jmCursor: jmCursorNew, more: rows.length === 300 });
  } catch (e) {
    await beat("erp-pull", "failed", { error: String(e instanceof Error ? e.message : e).slice(0, 300) });
    return errJson(e);
  }
}
