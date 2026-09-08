import { NextResponse } from "next/server";
import { currentUser, errJson, HttpError } from "@/lib/auth";
import { crmDb, crmConfigured } from "@/crm/db";
import { beat } from "@/lib/cron-beat";
import { swallow } from "@/lib/swallow";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/crm-sync — hourly through the working day (Dr Raghu, 8 Sep
 * 2026: "make an hourly cron job during working hours, that is from 8am to
 * 8pm, that pulls in all the ERP companies, contacts, interactions,
 * quotations and opportunities. These need to be synchronised with my Genie
 * CRM").
 *
 * 8am to 8pm IST is `30 2-14 * * *` in UTC — thirteen runs, on the hour, IST.
 * Nothing runs through the night because nothing is entered through the night.
 *
 * FOUR DOCTYPES, NOT FIVE. Customer, Contact, Opportunity and Quotation map
 * one to one onto company, person, opportunity and quotation. The fifth he
 * named — interactions — has no counterpart: ERPNext keeps no Interaction,
 * and its nearest relation, Communication, holds 526,320 rows of mostly
 * e-mail against 73,990 calls and visits here. Pouring one into the other
 * would bury the CRM's own trail, so it waits on his word about what an
 * interaction means over there.
 *
 * ADDITIVE ONLY, exactly as the opportunity pull has been since 29 Aug: a row
 * the ERP already gave us is left alone. Genie-side edits win, always. The
 * sales side stays pull-only — nothing is ever written back to the ERP.
 *
 * Each doctype keeps its own cursor on `modified`, so a slow doctype cannot
 * hold up a fast one and a failure resumes where it stopped.
 */
const S = (v: unknown) => String(v ?? "").trim();

interface Job {
  doctype: string;          // in the ERP
  table: string;            // in the CRM
  key: string;              // the CRM column carrying the ERP's name
  cursorKey: string;        // where this doctype's high-water mark is kept
  fields: string[];
  row: (r: Record<string, unknown>) => Record<string, unknown>;
}

const JOBS: Job[] = [
  {
    doctype: "Customer", table: "company", key: "erp_name", cursorKey: "sync_customer",
    fields: ["name", "customer_name", "customer_group", "territory", "industry", "website", "modified"],
    row: (r) => ({ erp_name: S(r.name), name: S(r.customer_name) || S(r.name), website: S(r.website) || null }),
  },
  {
    doctype: "Contact", table: "person", key: "erp_name", cursorKey: "sync_contact",
    fields: ["name", "first_name", "last_name", "designation", "email_id", "mobile_no", "phone", "company_name", "modified"],
    row: (r) => ({
      erp_name: S(r.name), first_name: S(r.first_name) || S(r.name), last_name: S(r.last_name) || null,
      designation: S(r.designation) || null, primary_email: S(r.email_id) || null,
      mobile: S(r.mobile_no) || S(r.phone) || null,
    }),
  },
  {
    doctype: "Opportunity", table: "opportunity", key: "erp_opportunity_name", cursorKey: "sync_opportunity",
    fields: ["name", "customer_name", "title", "transaction_date", "sales_stage", "modified"],
    row: (r) => ({ erp_opportunity_name: S(r.name), name: S(r.title) || S(r.customer_name) || S(r.name) }),
  },
  {
    doctype: "Quotation", table: "quotation", key: "quote_no", cursorKey: "sync_quotation",
    fields: ["name", "customer_name", "transaction_date", "grand_total", "status", "modified"],
    row: (r) => ({ quote_no: S(r.name), grand_total: Number(r.grand_total) || 0 }),
  },
];

export async function GET(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    const header = req.headers.get("authorization") || "";
    const fromCron = !!secret && header === `Bearer ${secret}`;
    if (!fromCron && req.headers.get("user-agent")?.includes("vercel-cron"))
      await beat("crm-sync", "failed", { error: secret ? "cron call did not carry the CRON_SECRET" : "CRON_SECRET is not set on Vercel" });
    if (!fromCron) {
      const u = await currentUser();
      if (!u || u.disabled) throw new HttpError(401, "The hourly cron, or a signed-in hand.");
    }
    await beat("crm-sync", "fired", { fromCron });
    if (!crmConfigured()) return NextResponse.json({ ok: false, note: "CRM not configured." });
    const db = crmDb();

    const { data: cfgRow } = await db.from("integration_setting").select("config").eq("key", "erpnext").maybeSingle();
    const cfg = (cfgRow?.config || {}) as Record<string, string>;
    if (!cfg.url || !cfg.api_key || !cfg.api_secret)
      return NextResponse.json({ ok: false, note: "ERPNext keys not saved in Integrations." });
    const base = cfg.url.replace(/\/+$/, "");
    const EH = { authorization: `token ${cfg.api_key}:${cfg.api_secret}` };

    const report: Record<string, { read: number; added: number; had: number; upto: string }> = {};
    const nextCfg: Record<string, string> = { ...cfg };

    for (const job of JOBS) {
      const cursor = S(cfg[job.cursorKey]) || "2026-09-08 00:00:00";
      let read = 0, added = 0, had = 0, upto = cursor;
      try {
        const u = `${base}/api/resource/${encodeURIComponent(job.doctype)}`
          + `?fields=${encodeURIComponent(JSON.stringify(job.fields))}`
          + `&filters=${encodeURIComponent(JSON.stringify([["modified", ">", cursor]]))}`
          + `&order_by=${encodeURIComponent("modified asc")}&limit_page_length=300`;
        const r = await fetch(u, { headers: EH });
        if (!r.ok) throw new Error(`${job.doctype}: the ERP answered ${r.status}`);
        const rows = ((await r.json()) as { data?: Record<string, unknown>[] }).data ?? [];
        read = rows.length;

        /* which of these we already hold — one question, not one per row */
        const names = rows.map((x) => S(x.name)).filter(Boolean);
        const seen = new Set<string>();
        for (let i = 0; i < names.length; i += 100) {
          const { data: have } = await db.from(job.table).select(job.key).in(job.key, names.slice(i, i + 100));
          for (const h of have ?? []) seen.add(S((h as unknown as Record<string, unknown>)[job.key]));
        }

        const fresh = rows.filter((x) => S(x.name) && !seen.has(S(x.name)));
        had = rows.length - fresh.length;
        /* A ROW THE ERP ALREADY GAVE US IS LEFT ALONE. Genie-side edits win. */
        if (fresh.length) {
          const { error } = await db.from(job.table).insert(fresh.map(job.row));
          if (error) throw new Error(`${job.table}: ${error.message}`);
          added = fresh.length;
        }
        for (const x of rows) if (S(x.modified) > upto) upto = S(x.modified);
        nextCfg[job.cursorKey] = upto;
      } catch (e) {
        swallow("cron/crm-sync", e);
        report[job.doctype] = { read, added, had, upto: `stopped: ${e instanceof Error ? e.message : String(e)}` };
        continue;
      }
      report[job.doctype] = { read, added, had, upto };
    }

    await db.from("integration_setting").update({ config: nextCfg }).eq("key", "erpnext");
    await beat("crm-sync", "done", report);
    return NextResponse.json({ ok: true, report,
      note: "Interactions are not synced: ERPNext keeps no Interaction doctype, and its Communication table is 526,320 rows of mostly e-mail against 73,990 calls and visits here." });
  } catch (e) { return errJson(e); }
}
