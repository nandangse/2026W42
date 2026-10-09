import { NextResponse } from "next/server";
import { syncWatch } from "@/lib/sync-watch";
import { currentUser, errJson, HttpError } from "@/lib/auth";
import { cronCaller } from "@/lib/cron-auth";
import { crmDb, crmConfigured } from "@/crm/db";
import { beat } from "@/lib/cron-beat";
import { isOn } from "@/lib/erp-hourly";
import { adminClient } from "@/lib/supabase/admin";
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
  /* THE WAY IN IS SOMEBODY ELSE'S (7 Oct 2026). The hourly erp-pull brings
     opportunities in whole — number, date, company, sector, owner, the
     enquiry text. From 16 Sep, when this stream's inserts stopped failing,
     it got there first every hour with a thin row (name and stage only),
     and erp-pull then skipped the "already known" row: 124 opportunities
     landed with no date and vanished from the year-to-date list. So this
     stream no longer pulls a doctype marked inbound:false; its way back
     (the push) still runs. */
  inbound?: boolean;
  /* WHOLE OR NOT AT ALL (7 Oct 2026): the columns a built row must carry.
     A row missing one is not inserted thin and forgotten; it is counted
     and named in the report, so the hour it happens is the hour it shows. */
  must?: string[];
  fields: string[];
  /* THE LOOKUPS A WHOLE ROW NEEDS (7 Oct 2026): the CRM ids behind the ERP's
     names — a company for a customer name, an opportunity for an enquiry
     number — gathered once per batch, not once per row, and handed to the
     row builder as `look` ("company:<name>" → id, "opp:<name>" → id). */
  lookups?: (rows: Record<string, unknown>[], db: ReturnType<typeof crmDb>) => Promise<Map<string, string>>;
  row: (r: Record<string, unknown>, who: Map<string, string>, look: Map<string, string>) => Record<string, unknown>;
  /* THE WAY BACK (Dr Raghu, 8 Sep 2026: "make sure that all of them are
     coming in and going out both, so that any changes made in the genie are
     also in the erp"). Absent means this doctype is pull-only. */
  push?: {
    fields: (r: Record<string, unknown>) => Record<string, unknown>;
    /* submittable documents refuse edits once submitted; we try, and report
       the refusal rather than swallowing it */
    submittable?: boolean;
  };
}

/**
 * AN OPPORTUNITY NEEDS A STAGE, AND THE ERP DOES NOT SEND ONE WE KNOW.
 *
 * Found 16 Sep 2026 in the cron's own heartbeat: "Opportunity — read 47,
 * added 0, stopped: null value in column stage_id violates not-null
 * constraint". Forty-seven opportunities were read from the ERP every hour
 * and every one of them was refused, silently, for as long as the stream has
 * existed — the row builder never set a stage and the column will not take a
 * null.
 *
 * The ERP's own `sales_stage` is mapped where its wording matches a stage
 * here; where it does not, the opportunity lands on NEW, which is what a
 * freshly arrived enquiry is. Landing it somewhere true is better than
 * refusing it: an opportunity nobody can see cannot be moved to the right
 * stage by hand either.
 */
const OPP_STAGE = new Map<string, number>();
let OPP_FALLBACK = 0;

async function loadOppStages(db: ReturnType<typeof crmDb>) {
  OPP_STAGE.clear(); OPP_FALLBACK = 0;
  const { data } = await db.from("stage").select("id, code, name, sort_order, active").eq("entity", "opportunity");
  const rows = (data || []) as { id: number; code: string; name: string; sort_order: number; active: boolean }[];
  for (const st of rows) {
    OPP_STAGE.set(String(st.name).trim().toLowerCase(), st.id);
    OPP_STAGE.set(String(st.code).trim().toLowerCase(), st.id);
  }
  const live = rows.filter((x) => x.active).sort((a, b) => a.sort_order - b.sort_order);
  OPP_FALLBACK = OPP_STAGE.get("new") ?? (live[0]?.id ?? rows[0]?.id ?? 0);
}

const stageFor = (sales_stage: unknown) =>
  OPP_STAGE.get(String(sales_stage ?? "").trim().toLowerCase()) ?? OPP_FALLBACK;

/* the ERP's quotation status in the CRM's words — the same words the 29 Aug import used */
const quoteStatus = (st: string, docstatus: number): string => {
  if (docstatus === 2 || /cancel/i.test(st)) return "cancelled";
  if (/lost/i.test(st)) return "lost";
  if (/expired/i.test(st)) return "expired";
  if (/draft/i.test(st) || docstatus === 0) return "draft";
  return "live";   // Open, Replied, Ordered — it went out
};

/** companies by the ERP's customer name, opportunities by the ERP's enquiry number — one query each per batch */
async function quoteLookups(rows: Record<string, unknown>[], db: ReturnType<typeof crmDb>): Promise<Map<string, string>> {
  const look = new Map<string, string>();
  const custs = [...new Set(rows.map((r) => S(r.customer_name) || S(r.party_name)).filter(Boolean))];
  for (let i = 0; i < custs.length; i += 50) {
    const slice = custs.slice(i, i + 50);
    const quoted = slice.map((c) => `"${c.replace(/[",]/g, "")}"`).join(",");
    const { data } = await db.from("company").select("id, name, erp_name").or(`name.in.(${quoted}),erp_name.in.(${quoted})`).is("deleted_at", null);
    for (const c of data ?? []) { for (const k of [S(c.erp_name), S(c.name)]) if (k && !look.has(`company:${k}`)) look.set(`company:${k}`, String(c.id)); }
  }
  const opps = [...new Set(rows.map((r) => S(r.opportunity)).filter(Boolean))];
  for (let i = 0; i < opps.length; i += 100) {
    const slice = opps.slice(i, i + 100);
    const quoted = slice.map((c) => `"${c.replace(/[",]/g, "")}"`).join(",");
    const { data } = await db.from("opportunity").select("id, opportunity_no, erp_opportunity_name").or(`opportunity_no.in.(${quoted}),erp_opportunity_name.in.(${quoted})`).is("deleted_at", null);
    for (const o of data ?? []) { for (const k of [S(o.erp_opportunity_name), S(o.opportunity_no)]) if (k && !look.has(`opp:${k}`)) look.set(`opp:${k}`, String(o.id)); }
  }
  return look;
}

const JOBS: Job[] = [
  {
    doctype: "Customer", table: "company", key: "erp_name", cursorKey: "sync_customer", must: ["erp_name", "name"],
    fields: ["name", "customer_name", "customer_group", "territory", "industry", "website", "modified"],
    row: (r) => ({ erp_name: S(r.name), name: S(r.customer_name) || S(r.name), website: S(r.website) || null }),
    push: { fields: (c) => ({ customer_name: S(c.name), website: S(c.website) || undefined }) },
  },
  {
    doctype: "Contact", table: "person", key: "erp_name", cursorKey: "sync_contact", must: ["erp_name", "first_name"],
    fields: ["name", "first_name", "last_name", "designation", "email_id", "mobile_no", "phone", "company_name", "modified"],
    row: (r) => ({
      erp_name: S(r.name), first_name: S(r.first_name) || S(r.name), last_name: S(r.last_name) || null,
      /* job_title and primary_phone — NOT designation and mobile, which is
         what this said from 5.0.30.0 until the first real run of 8 Sep threw
         PGRST204 on every Contact batch. The route reported it faithfully
         each hour; nobody was reading the report. */
      job_title: S(r.designation) || null, primary_email: S(r.email_id) || null,
      primary_phone: S(r.mobile_no) || S(r.phone) || null,
    }),
    push: { fields: (c) => ({
      first_name: S(c.first_name), last_name: S(c.last_name) || undefined,
      designation: S(c.job_title) || undefined, mobile_no: S(c.primary_phone) || undefined,
    }) },
  },
  {
    doctype: "Opportunity", table: "opportunity", key: "erp_opportunity_name", cursorKey: "sync_opportunity",
    inbound: false,
    fields: ["name", "customer_name", "title", "transaction_date", "sales_stage", "modified"],
    row: (r) => ({
      erp_opportunity_name: S(r.name),
      name: S(r.title) || S(r.customer_name) || S(r.name),
      /* NOT NULL — see loadOppStages. Without this every row was refused. */
      stage_id: stageFor(r.sales_stage),
    }),
    push: { fields: (c) => ({ title: S(c.name) || undefined }) },
  },
  {
    /* WHOLE, NOT A NUMBER AND A TOTAL (Dr Raghu, 7 Oct 2026: "The code is
       also not synchronising. Please make the code pull in from there").
       From 8 Sep to 7 Oct, 84 quotations arrived as a number and a total:
       no date, no company, no opportunity, every one "draft" while the ERP
       said Open. Now: the ERP's date, its customer as the company, its
       enquiry as the opportunity, its status in the CRM's words, valid till. */
    doctype: "Quotation", table: "quotation", key: "quote_no", cursorKey: "sync_quotation", must: ["quote_no", "quoted_on"],
    fields: ["name", "customer_name", "party_name", "transaction_date", "valid_till", "grand_total", "status", "docstatus", "opportunity", "modified"],
    lookups: quoteLookups,
    row: (r, _who, look) => ({
      quote_no: S(r.name),
      quoted_on: S(r.transaction_date).slice(0, 10) || null,
      valid_until: S(r.valid_till).slice(0, 10) || null,
      grand_total: Number(r.grand_total) || 0,
      status: quoteStatus(S(r.status), Number(r.docstatus)),
      company_id: look.get(`company:${S(r.customer_name) || S(r.party_name)}`) ?? null,
      opportunity_id: look.get(`opp:${S(r.opportunity)}`) ?? null,
    }),
    push: { submittable: true, fields: () => ({}) },
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
    push: { fields: (c) => ({
      date: S(c.happened_at).slice(0, 10) || undefined,
      type_of_call: S(c.call_type) || undefined,
      result: S(c.result) || undefined,
      person_interacted_with: S(c.person_name) || undefined,
      remark: S(c.remark) || undefined,
      next_action_date: S(c.next_action_on) || undefined,
    }) },
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
    push: { submittable: true, fields: (c) => ({ po_no: S(c.po_no) || undefined, po_date: S(c.po_date) || undefined }) },
  },
];

/* the ERP keeps its remarks as Quill HTML; the CRM keeps them as words */
const unhtml = (v: unknown) => String(v ?? "")
  .replace(/<\/(p|div|br)>/gi, "\n").replace(/<[^>]*>/g, "")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/\n{3,}/g, "\n\n").trim();

export async function GET(req: Request) {
  try {
    /* the cron's secret, or the owner / Stratcom / the hands named (audit S12, 9 Oct 2026) */
    const { fromCron } = await cronCaller(req, "crm-sync");
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

    /* The stage map must exist before the first opportunity is built. */
    await loadOppStages(db).catch(() => { /* an unreadable stage table leaves the fallback at 0, and the insert will say so */ });

    const report: Record<string, { read: number; added: number; had: number; upto: string }> = {};
    const incomplete: Record<string, { count: number; names: string[] }> = {};
    const nextCfg: Record<string, string> = { ...cfg };

    /**
     * THE TICKS ON Synchronize to ERP DECIDE WHICH STREAMS RUN.
     *
     * Dr Raghu, 16 Sep 2026: "tick the documents which will refresh here."
     * These five are genuinely independent — each has its own cursor and its
     * own table — so unlike the planning pull they can be turned off one at a
     * time without leaving the others half-informed.
     *
     * The ticks live in Genie's app_settings, which is a different database
     * from the one this cron writes to; reading it is one small query an hour
     * and it is worth it to have one screen that tells the truth. A database
     * without 0168 answers nothing, and nothing means everything is on.
     */
    const BY_DOCTYPE: Record<string, string> = {
      "Customer": "customer", "Contact": "contact", "Opportunity": "opportunity",
      "Quotation": "quotation", "Sales Order": "sales_order",
    };
    let ticks: Record<string, unknown> = {};
    try {
      const st = await adminClient().from("app_settings").select("erp_hourly").eq("id", true).maybeSingle();
      if (!st.error) ticks = (st.data?.erp_hourly ?? {}) as Record<string, unknown>;
    } catch { /* unreadable settings must not stop the sync */ }
    const skipped: string[] = [];

    for (const job of JOBS) {
      if (job.inbound === false) { report[job.doctype] = { read: 0, added: 0, had: 0, upto: "inbound is the hourly erp-pull's; only the way back runs here" }; continue; }
      const tick = BY_DOCTYPE[job.doctype];
      if (tick && !isOn(ticks, tick)) { skipped.push(job.doctype); continue; }
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
          const look = job.lookups ? await job.lookups(fresh, db) : new Map<string, string>();
          const built = fresh.map((x) => ({ x, row: job.row(x, who, look) }));
          const whole = built.filter((b) => !(job.must ?? []).some((m) => !S(b.row[m])));
          const thin = built.length - whole.length;
          if (thin) incomplete[job.doctype] = { count: thin, names: built.filter((b) => (job.must ?? []).some((m) => !S(b.row[m]))).slice(0, 5).map((b) => S(b.x.name)) };
          if (whole.length) {
            const { error } = await db.from(job.table).insert(whole.map((b) => b.row));
            if (error) throw new Error(`${job.table}: ${error.message}`);
            added = whole.length;
          }
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

    /* ───────────────────────── THE WAY BACK ─────────────────────────
     * "Make sure that all of them are coming in and going out both, so that
     * any changes made in the genie are also in the erp" (Dr Raghu, 8 Sep
     * 2026).
     *
     * WHAT IT WILL NOT DO, AND WHY. Read plainly, "push everything Genie has
     * that the ERP lacks" means creating 30,904 opportunities, 6,531 people
     * and 2,698 companies over there — some forty thousand documents, into a
     * live ERP of 54,681 customers, in one run, with no undo. That backlog is
     * not "changes made in Genie": it is years of imports, merges and Apollo
     * rows that were never the ERP's. So it is counted and reported, never
     * sent.
     *
     * WHAT IT DOES. From the moment this is switched on: a row the ERP
     * already knows and Genie has since edited is UPDATED there; a row born
     * in Genie after that moment is CREATED there and its new ERP name
     * written back, so it is never created twice. Everything older is left
     * alone until he says otherwise about the backlog.
     *
     * IT IS OFF UNTIL HE ARMS IT. `push_on` in the same config row. While it
     * is off the run still does the whole calculation and reports exactly
     * what it WOULD send — which is the only honest way to show a man what a
     * switch will do to his ERP before he throws it.
     *
     * A CAP OF 200 WRITES A RUN. Not because 200 is meaningful, but because a
     * mistake that can only touch 200 documents is a mistake one can undo by
     * hand, and a mistake that can touch 40,000 is not.
     */
    const armed = String(cfg.push_on || "") === "yes";
    const CAP = 200;
    const out: Record<string, { updated: number; created: number; skipped_backlog: number; refused: string[] }> = {};
    let budget = CAP;

    for (const job of JOBS) {
      if (!job.push) continue;
      const since = S(cfg[`push_${job.cursorKey}`]) || S(cfg.push_from) || new Date().toISOString();
      const o = { updated: 0, created: 0, skipped_backlog: 0, refused: [] as string[] };
      try {
        const { data: rows, error } = await db.from(job.table)
          .select("*").gt("updated_at", since).order("updated_at").limit(CAP);
        if (error) throw new Error(error.message);

        for (const r of rows ?? []) {
          if (budget <= 0) { o.refused.push("the run's 200-write cap was reached — the rest follow next hour"); break; }
          const erpName = S((r as Record<string, unknown>)[job.key]);

          /* no ERP name and older than the switch — that is the backlog */
          if (!erpName) {
            if (S(r.created_at) <= since) { o.skipped_backlog++; continue; }
            if (!armed) { o.created++; budget--; continue; }
            const body = job.push.fields(r as Record<string, unknown>);
            const cr = await fetch(`${base}/api/resource/${encodeURIComponent(job.doctype)}`, {
              method: "POST", headers: { ...EH, "content-type": "application/json" }, body: JSON.stringify(body),
            });
            if (!cr.ok) { o.refused.push(`create: the ERP answered ${cr.status}`); continue; }
            const made = S(((await cr.json()) as { data?: { name?: unknown } }).data?.name);
            if (made) await db.from(job.table).update({ [job.key]: made }).eq("id", r.id);
            o.created++; budget--;
            continue;
          }

          /* the ERP knows it — send what changed */
          const body = job.push.fields(r as Record<string, unknown>);
          if (!Object.keys(body).length) continue;
          if (!armed) { o.updated++; budget--; continue; }
          const ur = await fetch(`${base}/api/resource/${encodeURIComponent(job.doctype)}/${encodeURIComponent(erpName)}`, {
            method: "PUT", headers: { ...EH, "content-type": "application/json" }, body: JSON.stringify(body),
          });
          if (!ur.ok) {
            const why = job.push.submittable && ur.status === 417
              ? `${erpName} is submitted in the ERP — it cannot be edited from here`
              : `${erpName}: the ERP answered ${ur.status}`;
            o.refused.push(why);
            continue;
          }
          o.updated++; budget--;
        }
        if (rows?.length) nextCfg[`push_${job.cursorKey}`] = S(rows[rows.length - 1].updated_at) || since;
        else nextCfg[`push_${job.cursorKey}`] = since;
      } catch (e) {
        swallow("cron/crm-sync push", e);
        o.refused.push(e instanceof Error ? e.message : String(e));
      }
      o.refused = o.refused.slice(0, 5);
      out[job.doctype] = o;
    }
    if (!cfg.push_from) nextCfg.push_from = new Date().toISOString();

    await db.from("integration_setting").update({ config: nextCfg }).eq("key", "erpnext");
    /* THE WATCH — from the ERP's side: is everything it changed lately here, and whole? */
    const watch = await syncWatch(db, base, EH).catch((e) => ({ at: new Date().toISOString(), window: "", ok: false, lines: [], error: String(e instanceof Error ? e.message : e) }));
    await beat("crm-sync", "done", { in: report, out, watch, ...(Object.keys(incomplete).length ? { incomplete } : {}), ...(skipped.length ? { unticked: skipped } : {}) });
    return NextResponse.json({ ok: true, in: report, out, watch, incomplete,
      push: armed ? "ARMED — the counts above were really sent to the ERP."
        : "NOT ARMED — the counts above are what WOULD be sent. Set push_on to \"yes\" in the erpnext integration config to arm it." });
  } catch (e) { return errJson(e); }
}
