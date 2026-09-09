import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireSeva } from "@/lib/seva";
import { adminClient } from "@/lib/supabase/admin";
import { crmDb, crmConfigured } from "@/crm/db";
import { readBody } from "@/lib/validate";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/seva/erp-tickets — the support tickets, off nandanerp
 * (Dr Raghu, 9 Sep 2026: "Issues import — call it Support Tickets ... get in
 * all the fields including the attachments. Also the issue details to be in
 * rich text.")
 *
 * ELEVEN THOUSAND NINE HUNDRED AND FORTY-NINE, back to 2016. Pulled a page at
 * a time with a cursor on `modified`, so the run can be stopped, resumed, or
 * repeated without re-reading what it already holds.
 *
 * THE DESCRIPTION IS KEPT AS IT CAME. The ERP writes it as Quill HTML —
 * paragraphs, lists, the occasional table — and flattening that to text loses
 * the shape a man used to explain a fault. It goes into `description_html`
 * whole, with a plain copy beside it so the table can be searched without
 * parsing markup on every keystroke.
 *
 * ATTACHMENTS ARE INDEXED, NOT COPIED. 18,051 files hang off the issues and
 * 5,916 off the contracts, and every one is PRIVATE in the ERP — the bytes
 * need its own authentication. What lands here is the name, the size, the
 * date and the path: enough to list them, count them, and open them there.
 * Copying twenty-four thousand private files into Genie is a decision about
 * storage and confidentiality that nobody has taken, and an importer is not
 * the place to take it quietly.
 *
 * READS ONLY. Nothing on the ERP is ever written.
 */
type Doc = Record<string, unknown>;
const S = (v: unknown) => String(v ?? "").trim();
const N = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v) || 0);
const D = (v: unknown) => { const s = S(v); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null; };
const B = (v: unknown) => v === 1 || v === "1" || v === true;

/** Quill HTML in, words out — for the search copy only; the markup is kept. */
const flat = (v: unknown) => String(v ?? "")
  .replace(/<\/(p|div|li|br|tr)>/gi, "\n").replace(/<[^>]*>/g, "")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/\n{3,}/g, "\n\n").trim();

async function erpConfig() {
  if (!crmConfigured())
    throw new HttpError(503, "The ERP token lives in the CRM's Integrations, and that database is not connected here.");
  const { data } = await crmDb().from("integration_setting").select("config").eq("key", "erpnext").maybeSingle();
  const cfg = (data?.config || {}) as Record<string, string>;
  if (!cfg.url || !cfg.api_key || !cfg.api_secret)
    throw new HttpError(400, "Save the ERPNext URL, key and secret in CRM → Integrations first.");
  return { base: cfg.url.replace(/\/+$/, ""), H: { authorization: `token ${cfg.api_key}:${cfg.api_secret}` } };
}

const FIELDS = [
  "name", "issue_date", "opening_date", "subject", "customer", "raised_by", "location",
  "equipment", "attended_by", "handled_by", "type_of_support", "problem_type",
  "nandan_job_number", "job_numbers", "status", "description", "agreement_status",
  "reading", "finally_showed_to", "resolution_summary", "custom_closure_ratings",
  "custom_raised_as_nc", "via_customer_portal", "amount_billed", "cost_spent",
  "costing_details", "mandays_invested", "frf_no", "frf_date", "checklist_used",
  "pending_action_status", "lead", "modified",
];

const row = (t: Doc) => ({
  erp_name: S(t.name),
  title: S(t.subject) || S(t.name),
  subject: S(t.subject) || null,
  customer: S(t.customer),
  machine: S(t.equipment),
  equipment: S(t.equipment) || null,
  serial_no: "",
  category: S(t.problem_type),
  problem_type: S(t.problem_type) || null,
  reported_via: B(t.via_customer_portal) ? "Customer portal" : S(t.raised_by) ? "Raised by" : "",
  status: S(t.status) || "Open",
  owner: S(t.handled_by) || S(t.attended_by) || "",
  issue_date: D(t.issue_date) || D(t.opening_date),
  opening_date: D(t.opening_date),
  raised_by: S(t.raised_by) || null,
  location: S(t.location) || null,
  attended_by: S(t.attended_by) || null,
  handled_by: S(t.handled_by) || null,
  type_of_support: S(t.type_of_support) || null,
  job_number: S(t.nandan_job_number) || null,
  job_numbers: S(t.job_numbers) || null,
  agreement_status: S(t.agreement_status) || null,
  reading: S(t.reading) || null,
  finally_showed_to: S(t.finally_showed_to) || null,
  resolution_summary: flat(t.resolution_summary) || null,
  resolution: flat(t.resolution_summary) || "",
  closure_rating: S(t.custom_closure_ratings) || null,
  raised_as_nc: B(t.custom_raised_as_nc),
  via_portal: B(t.via_customer_portal),
  amount_billed: N(t.amount_billed),
  cost_spent: N(t.cost_spent),
  costing_details: flat(t.costing_details) || null,
  mandays_invested: N(t.mandays_invested),
  frf_no: S(t.frf_no) || null,
  frf_date: D(t.frf_date),
  checklist_used: S(t.checklist_used) || null,
  pending_action_status: S(t.pending_action_status) || null,
  lead: S(t.lead) || null,
  description_html: S(t.description) || null,   // as it came — rich
  description: flat(t.description),             // and flat, for the search
  erp_modified: S(t.modified),
  pulled_at: new Date().toISOString(),
});

export async function POST(req: Request) {
  try {
    const me = await requireSeva();
    if (!me.isOwner) throw new HttpError(403, "The ERP door is Raghu's to use, for now.");
    const body = await readBody(req, {}).catch(() => ({} as Doc));
    const action = S(body.action) || "tickets";
    const { base, H } = await erpConfig();
    const admin = adminClient();
    const start = Math.max(0, Number(body.start) || 0);

    /* ── the tickets ── */
    if (action === "tickets") {
      let read = 0, written = 0, pages = 0;
      for (let s = start; pages < 12; s += 500, pages++) {
        const u = `${base}/api/resource/Issue?fields=${encodeURIComponent(JSON.stringify(FIELDS))}`
          + `&limit_start=${s}&limit_page_length=500&order_by=${encodeURIComponent("modified asc")}`;
        const r = await fetch(u, { headers: H });
        if (!r.ok) throw new HttpError(502, `The ERP answered ${r.status} for Issue.`);
        const rows = ((await r.json()) as { data?: Doc[] }).data ?? [];
        read += rows.length;
        if (!rows.length) return NextResponse.json({ ok: true, action, read, written, done: true });
        const { error } = await admin.from("seva_issue")
          .upsert(rows.map(row), { onConflict: "erp_name" });
        if (error) {
          if (/does not exist|schema cache/i.test(error.message))
            throw new HttpError(503, "Run migration 0166 first — the tickets have nowhere to live yet.");
          throw new Error(error.message);
        }
        written += rows.length;
        if (rows.length < 500) return NextResponse.json({ ok: true, action, read, written, done: true });
      }
      return NextResponse.json({ ok: true, action, read, written, next_start: start + pages * 500, done: false });
    }

    /* ── what is attached, to a ticket or a contract ── */
    if (action === "attachments") {
      const parent = S(body.parent) === "amc" ? "Annual Maintenance Contract" : "Issue";
      let read = 0, written = 0, pages = 0;
      for (let s = start; pages < 12; s += 500, pages++) {
        const u = `${base}/api/resource/File?fields=${encodeURIComponent(JSON.stringify(
          ["name", "file_name", "file_url", "file_size", "is_private", "attached_to_doctype", "attached_to_name", "creation"]))}`
          + `&filters=${encodeURIComponent(JSON.stringify([["attached_to_doctype", "=", parent]]))}`
          + `&limit_start=${s}&limit_page_length=500&order_by=${encodeURIComponent("creation asc")}`;
        const r = await fetch(u, { headers: H });
        if (!r.ok) throw new HttpError(502, `The ERP answered ${r.status} for File.`);
        const rows = ((await r.json()) as { data?: Doc[] }).data ?? [];
        read += rows.length;
        if (!rows.length) return NextResponse.json({ ok: true, action, parent, read, written, done: true });
        const up = rows.filter((f) => S(f.name) && S(f.attached_to_name)).map((f) => ({
          id: S(f.name), parent_type: S(f.attached_to_doctype), parent_name: S(f.attached_to_name),
          file_name: S(f.file_name) || null, file_url: S(f.file_url) || null,
          file_size: N(f.file_size), is_private: B(f.is_private),
          uploaded_at: S(f.creation) ? new Date(S(f.creation).replace(" ", "T") + "+05:30").toISOString() : null,
          pulled_at: new Date().toISOString(),
        }));
        if (up.length) {
          const { error } = await admin.from("seva_attachment").upsert(up, { onConflict: "id" });
          if (error) {
            if (/does not exist|schema cache/i.test(error.message))
              throw new HttpError(503, "Run migration 0166 first — attachments have nowhere to live yet.");
            throw new Error(error.message);
          }
          written += up.length;
        }
        if (rows.length < 500) return NextResponse.json({ ok: true, action, parent, read, written, done: true });
      }
      return NextResponse.json({ ok: true, action, parent, read, written, next_start: start + pages * 500, done: false });
    }

    throw new HttpError(400, "unknown action");
  } catch (e) { return errJson(e); }
}
