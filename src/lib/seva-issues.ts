import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "@/lib/auth";
import { erpAuth } from "@/lib/saamaan-stock";
import { putFile } from "@/lib/genie-files";

/**
 * THE SUPPORT TICKETS, OFF THE ERP — every Issue, every field (Dr Raghu,
 * 3 Oct 2026: "support tickets are Issues. Pull all of them please. Make all
 * the fields which are in erp … add this also to the hourly erp pull").
 *
 * One walk, two callers: the button on Seva → Support Tickets (the owner,
 * from the top) and the hourly cron (from a cursor on `modified`, so an hour
 * brings only what changed). fields=["*"]: the whole document lands in
 * `erp`, and the typed columns the screen reads are picked off it.
 *
 * THE DESCRIPTION IS KEPT AS IT CAME — Quill HTML, whole — with a plain copy
 * beside it for the search. ATTACHMENTS ARE INDEXED, NOT COPIED: name, size,
 * date and path; the bytes stay private on the ERP.
 *
 * "and then later on push!" — the write-back is not here yet; when it comes
 * it will be its own verb, like the Item master's.
 */
type Doc = Record<string, unknown>;
const S = (v: unknown) => String(v ?? "").trim();
const N = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v) || 0);
const D = (v: unknown) => { const s = S(v); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null; };
const B = (v: unknown) => v === 1 || v === "1" || v === true;
const flat = (v: unknown) => String(v ?? "")
  .replace(/<\/(p|div|li|br|tr)>/gi, "\n").replace(/<[^>]*>/g, "")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/\n{3,}/g, "\n\n").trim();
/** The ERP's "2026-09-02 15:04:26.988375" is site time — Asia/Kolkata. */
const T = (v: unknown) => { const m = S(v).match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/); return m ? `${m[1]}T${m[2]}+05:30` : null; };

export const issueRow = (t: Doc, pulledAt: string) => ({
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
  resolved_at: D(t.resolution_date) || (/closed|resolved/i.test(S(t.status)) ? D(t.modified) : null),
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
  description_html: S(t.description) || null,
  description: flat(t.description),
  erp_modified: S(t.modified),
  /* "Logged" on the screen is the day the ticket was opened on the ERP, not the day it was pulled */
  at: T(t.opening_date) || T(t.creation) || pulledAt,
  erp: t,
  pulled_at: pulledAt,
});

export interface PullOut { read: number; written: number; pages: number; done: boolean; next_start: number; maxModified: string }

/**
 * Issues, `modified asc`, from `since` (exclusive) and `start`, at most
 * `maxPages` of 500. Returns where to resume and the newest `modified` seen.
 */
export async function pullIssues(admin: SupabaseClient, opts: { since?: string; start?: number; maxPages?: number }): Promise<PullOut> {
  const a = await erpAuth();
  if (!a) throw new HttpError(503, "The ERP's URL and token are not saved — CRM → Integrations.");
  const { base, H } = a;
  const since = S(opts.since), start = Math.max(0, opts.start || 0), maxPages = opts.maxPages || 12;
  const pulledAt = new Date().toISOString();
  let read = 0, written = 0, pages = 0, maxModified = since;
  for (let s = start; pages < maxPages; s += 500, pages++) {
    const filters = since ? [["modified", ">", since]] : [];
    const u = `${base}/api/resource/Issue?fields=${encodeURIComponent(JSON.stringify(["*"]))}`
      + (filters.length ? `&filters=${encodeURIComponent(JSON.stringify(filters))}` : "")
      + `&limit_start=${s}&limit_page_length=500&order_by=${encodeURIComponent("modified asc")}`;
    const r = await fetch(u, { headers: H, signal: AbortSignal.timeout(60000) });
    if (!r.ok) throw new HttpError(502, `The ERP answered ${r.status} for Issue.`);
    const rows = ((await r.json()) as { data?: Doc[] }).data ?? [];
    read += rows.length;
    if (!rows.length) return { read, written, pages, done: true, next_start: s, maxModified };
    let up = rows.map((t) => issueRow(t, pulledAt));
    let { error } = await admin.from("seva_issue").upsert(up, { onConflict: "erp_name" });
    if (error && /erp\b|column|schema cache/i.test(error.message) && !/does not exist/i.test(error.message)) {
      /* pre-0195: the whole document has nowhere to go yet; the typed columns still land */
      up = up.map((x) => { const { erp: _erp, ...rest } = x; void _erp; return rest as typeof x; });
      ({ error } = await admin.from("seva_issue").upsert(up, { onConflict: "erp_name" }));
    }
    if (error) {
      if (/does not exist|schema cache/i.test(error.message)) throw new HttpError(503, "Run migration 0166 first — the tickets have nowhere to live yet.");
      throw new Error(error.message);
    }
    written += rows.length;
    for (const t of rows) { const m = S(t.modified); if (m > maxModified) maxModified = m; }
    if (rows.length < 500) return { read, written, pages: pages + 1, done: true, next_start: s + rows.length, maxModified };
  }
  return { read, written, pages, done: false, next_start: start + pages * 500, maxModified };
}

/** The files hanging off Issues (or contracts), `creation asc`, from a cursor. */
export async function pullIssueFiles(admin: SupabaseClient, opts: { parent?: "Issue" | "Annual Maintenance Contract"; since?: string; start?: number; maxPages?: number }): Promise<PullOut> {
  const a = await erpAuth();
  if (!a) throw new HttpError(503, "The ERP's URL and token are not saved — CRM → Integrations.");
  const { base, H } = a;
  const parent = opts.parent || "Issue";
  const since = S(opts.since), start = Math.max(0, opts.start || 0), maxPages = opts.maxPages || 12;
  const pulledAt = new Date().toISOString();
  let read = 0, written = 0, pages = 0, maxModified = since;
  for (let s = start; pages < maxPages; s += 500, pages++) {
    const filters: unknown[] = [["attached_to_doctype", "=", parent]];
    if (since) filters.push(["creation", ">", since]);
    const u = `${base}/api/resource/File?fields=${encodeURIComponent(JSON.stringify(["name", "file_name", "file_url", "file_size", "is_private", "attached_to_doctype", "attached_to_name", "attached_to_field", "creation"]))}`
      + `&filters=${encodeURIComponent(JSON.stringify(filters))}&limit_start=${s}&limit_page_length=500&order_by=${encodeURIComponent("creation asc")}`;
    const r = await fetch(u, { headers: H, signal: AbortSignal.timeout(60000) });
    if (!r.ok) throw new HttpError(502, `The ERP answered ${r.status} for File.`);
    const rows = ((await r.json()) as { data?: Doc[] }).data ?? [];
    read += rows.length;
    if (!rows.length) return { read, written, pages, done: true, next_start: s, maxModified };
    const up = rows.filter((f) => S(f.name) && S(f.attached_to_name)).map((f) => ({
      id: S(f.name), parent_type: S(f.attached_to_doctype), parent_name: S(f.attached_to_name),
      file_name: S(f.file_name) || null, file_url: S(f.file_url) || null,
      file_size: N(f.file_size), is_private: B(f.is_private),
      uploaded_at: T(f.creation), pulled_at: pulledAt,
    }));
    if (up.length) {
      const { error } = await admin.from("seva_attachment").upsert(up, { onConflict: "id" });
      if (error) {
        if (/does not exist|schema cache/i.test(error.message)) throw new HttpError(503, "Run migration 0166 first — attachments have nowhere to live yet.");
        throw new Error(error.message);
      }
      written += up.length;
    }
    for (const f of rows) { const c = S(f.creation); if (c > maxModified) maxModified = c; }
    if (rows.length < 500) return { read, written, pages: pages + 1, done: true, next_start: s + rows.length, maxModified };
  }
  return { read, written, pages, done: false, next_start: start + pages * 500, maxModified };
}

/**
 * THE FRF FORMS INTO THE DRIVE (Dr Raghu, 3 Oct 2026: "Pull the FRF forms
 * also and put them in to the google drive connected by raghu"). The Field
 * Report Form is what the engineer filled at the customer's; it hangs off
 * the Issue as a private file. A batch at a time — the files named FRF
 * first, then the rest of what is attached to Issues — each fetched off
 * the ERP with its token, put into Seva — FRF forms as "<ticket> — <name>",
 * and the Drive link kept on the attachment row. A file the ERP will not
 * give up is marked, not retried every hour forever.
 */
export async function copyFrfToDrive(admin: SupabaseClient, opts: { limit?: number; by?: string }): Promise<{ copied: number; failed: number; left: number | null; notes: string[] }> {
  const a = await erpAuth();
  if (!a) throw new HttpError(503, "The ERP's URL and token are not saved — CRM → Integrations.");
  const { base, H } = a;
  const limit = opts.limit || 40;
  const pick = async (frfOnly: boolean) => {
    let q = admin.from("seva_attachment").select("id, parent_name, file_name, file_url, file_size").eq("parent_type", "Issue").is("drive_at", null).eq("drive_error", "").not("file_url", "is", null).order("uploaded_at").limit(limit);
    if (frfOnly) q = q.ilike("file_name", "%frf%");
    const { data, error } = await q;
    if (error) { if (/drive_at|column|schema cache/i.test(error.message)) throw new HttpError(503, "Run migration 0195 first — the attachments cannot remember their Drive copy yet."); throw new Error(error.message); }
    return (data ?? []) as Doc[];
  };
  let rows = await pick(true);
  if (rows.length < limit) rows = rows.concat((await pick(false)).filter((r) => !rows.some((x) => x.id === r.id))).slice(0, limit);
  let copied = 0, failed = 0; const notes: string[] = [];
  for (const r of rows) {
    const url = S(r.file_url);
    const name = S(r.file_name) || url.split("/").pop() || S(r.id);
    try {
      if (Number(r.file_size) > 40 * 1024 * 1024) throw new Error("over 40 MB — left on the ERP");
      const f = await fetch(url.startsWith("http") ? url : `${base}${url}`, { headers: H, signal: AbortSignal.timeout(60000) });
      if (!f.ok) throw new Error(`the ERP answered ${f.status}`);
      const bytes = Buffer.from(await f.arrayBuffer());
      const mime = f.headers.get("content-type") || (/\.pdf$/i.test(name) ? "application/pdf" : /\.(jpe?g)$/i.test(name) ? "image/jpeg" : /\.png$/i.test(name) ? "image/png" : "application/octet-stream");
      const put = await putFile("seva_frf", `${S(r.parent_name)} \u2014 ${name}`, bytes, mime);
      if (!put.ok) throw new Error(put.why || "Drive refused");
      await admin.from("seva_attachment").update({ drive_ref: put.ref, drive_url: put.link ?? null, drive_at: new Date().toISOString() }).eq("id", S(r.id));
      copied++;
    } catch (e) {
      failed++;
      const why = (e instanceof Error ? e.message : String(e)).slice(0, 200);
      notes.push(`${S(r.parent_name)} ${name}: ${why}`);
      await admin.from("seva_attachment").update({ drive_error: why }).eq("id", S(r.id));
    }
  }
  const { count } = await admin.from("seva_attachment").select("*", { count: "exact", head: true }).eq("parent_type", "Issue").is("drive_at", null).eq("drive_error", "");
  return { copied, failed, left: count ?? null, notes: notes.slice(0, 10) };
}
