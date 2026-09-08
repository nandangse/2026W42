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
 * SIX DOCTYPES (Dr Raghu, 8 Sep 2026: "quotation i need to have the sync /
 * Customer / Contact / Interaction Master / Opportunity / Quotation / Sales
 * Order").
 *
 * THE FIFTH HAD A NAME AFTER ALL. I had left interactions out and said so,
 * because stock ERPNext keeps no Interaction doctype and its nearest
 * relation, Communication, is 526,320 rows of mostly e-mail against the
 * 73,990 calls and visits here. He named INTERACTION MASTER — a doctype of
 * this house's own making, 74,142 rows against the CRM's 73,990, keyed
 * NGSE-IM-26-09-00069. That is not a near relation; that is the same trail,
 * a hundred and fifty rows ahead of us. Guessing would have poured the wrong
 * table in, which is why it waited.
 *
 * SALES ORDER he added on the same breath: 891 there, 890 here.
 *
 * FOREIGN KEYS ARE LEFT NULL, as they are for the other four. The ERP names
 * the customer as a string; stitching that to a company_id by matching text
 * is how wrong parents get attached to right rows. The keys are carried in
 * `erp_ref_doctype`/`erp_ref_name` so the joining can be done deliberately.
 *
 * PEOPLE, THOUGH, ARE RESOLVED: the ERP files responsibility as an e-mail and
 * the CRM as a profile id, so the map is exact — and when there is no such
 * profile the field stays null rather than guessing.
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
  row: (r: Record<string, unknown>, who: Map<string, string>) => Record<string, unknown>;
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
  {
    /* the house's own doctype — the CRM's calls and visits, at their source */
    doctype: "Interaction Master", table: "interaction", key: "erp_name", cursorKey: "sync_interaction",
    fields: ["name", "organization", "date", "type_of_call", "result", "person_interacted_with",
      "remark", "responsible", "next_action_by", "next_action_date", "interaction_type",
      "reference_doctype", "reference_name", "owner", "modified"],
    row: (r, who) => ({
      erp_name: S(r.name),
      kind: S(r.interaction_type) || S(r.type_of_call) || null,
      call_type: S(r.type_of_call) || null,
      result: S(r.result) || null,
      happened_at: S(r.date) || null,
      person_name: S(r.person_interacted_with) || null,
      remark: unhtml(r.remark) || null,
      next_action_on: S(r.next_action_date) || null,
      next_action_by: who.get(S(r.next_action_by).toLowerCase()) ?? null,
      by_id: who.get(S(r.responsible).toLowerCase()) ?? who.get(S(r.owner).toLowerCase()) ?? null,
      erp_ref_doctype: S(r.reference_doctype) || null,
      erp_ref_name: S(r.reference_name) || null,
    }),
  },
  {
    doctype: "Sales Order", table: "sales_order", key: "erpnext_so_no", cursorKey: "sync_sales_order",
    fields: ["name", "customer_name", "transaction_date", "delivery_date", "total_sales_order_value",
      "grand_total", "sales_order_status", "order_aquisition_source", "po_no", "po_date", "modified"],
    row: (r) => ({
      so_no: S(r.name), erpnext_so_no: S(r.name), currency: "INR",
      ordered_on: S(r.transaction_date) || null,
      delivery_on: S(r.delivery_date) || null,
      amount: Number(r.grand_total) || null,
      taxable_value: Number(r.total_sales_order_value) || null,
      erp_status: S(r.sales_order_status) || null,
      acquisition_source: S(r.order_aquisition_source) || null,
      po_no: S(r.po_no) || null,
      po_date: S(r.po_date) || null,
    }),
  },
];

/* the ERP keeps its remarks as Quill HTML; the CRM keeps them as words */
const unhtml = (v: unknown) => String(v ?? "")
  .replace(/<\/(p|div|br)>/gi, "\n").replace(/<[^>]*>/g, "")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/\n{3,}/g, "\n\n").trim();

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

    /* e-mail → profile id, read once. The ERP files responsibility as an
       address; the CRM as an id. Anyone without a profile stays null. */
    const who = new Map<string, string>();
    {
      const { data: people } = await db.from("profile").select("id, email").limit(500);
      for (const p of people ?? []) {
        const e = S((p as { email?: unknown }).email).toLowerCase();
        if (e) who.set(e, String((p as { id: unknown }).id));
      }
    }

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
          const { error } = await db.from(job.table).insert(fresh.map((x) => job.row(x, who)));
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
    return NextResponse.json({ ok: true, report });
  } catch (e) { return errJson(e); }
}
