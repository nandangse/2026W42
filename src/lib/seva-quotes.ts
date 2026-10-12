import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "@/lib/auth";
import { erpAuth } from "@/lib/saamaan-stock";
import { serviceQuoters } from "@/lib/seva-team";
import { accessTokenFor, gmailSendMixed, mailboxByAddress } from "@/crm/gmail";

/**
 * THE SERVICE TEAM'S QUOTATIONS, OFF THE ERP (Dr Raghu, 12 Oct 2026: "Can we
 * pull quotations from erp and see where its sent by Sarita, Yash, Aakash or
 * the service team and pull here. Updates also made here. Make a sub module
 * called quotation").
 *
 * The CRM's hourly copy of ERP quotations carries no owner and no contact
 * and never updates a quote it already holds, so Seva reads the ERP itself:
 * every Quotation whose owner is one of the service hands, by `modified`, so
 * a status change on the ERP arrives the next hour. Genie's own follow-up
 * (status, next action, notes) lives beside it and is never written back.
 */
type Doc = Record<string, unknown>;
const S = (v: unknown) => String(v ?? "").trim();
const N = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v) || 0);
const D = (v: unknown) => { const s = S(v); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null; };
/** the ERP's clock is IST without a zone */
const ist = (v: unknown) => { const s = S(v); return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s) ? `${s.slice(0, 19).replace(" ", "T")}+05:30` : null; };
const toErpClock = (iso: string) => new Date(iso).toLocaleString("sv-SE", { timeZone: "Asia/Kolkata" });

const FIELDS = ["name", "owner", "sales_person", "customer_name", "party_name", "transaction_date", "valid_till", "validity_till", "target_date_of_order",
  "grand_total", "base_grand_total", "currency", "status", "docstatus", "contact_person", "contact_display", "contact_email", "subject", "last_status",
  "importance_closure", "product_group", "assigned_to", "modified", "modified_by", "submitted_by", "order_type", "territory", "sector", "type_of_quote", "your_reference", "lost_reasons"];

export interface PullOut { read: number; written: number; done: boolean; since: string }

export async function pullServiceQuotes(admin: SupabaseClient, opts: { since?: string | null; maxPages?: number } = {}): Promise<PullOut> {
  const a = await erpAuth();
  if (!a) throw new HttpError(503, "The ERP's URL and token are not saved — CRM → Integrations.");
  const owners = await serviceQuoters(admin);
  let since: string | null = opts.since ?? null;
  if (since === null) {
    const { data, error } = await admin.from("seva_quotation").select("erp_modified").order("erp_modified", { ascending: false, nullsFirst: false }).limit(1);
    if (error) { if (/does not exist|schema cache/i.test(error.message)) throw new HttpError(503, "Run migration 0225 first — the quotations have nowhere to live yet."); throw new Error(error.message); }
    since = data?.[0]?.erp_modified ? toErpClock(String(data[0].erp_modified)) : "2024-04-01 00:00:00";
  }
  const maxPages = opts.maxPages || 8;
  let read = 0, written = 0;
  for (let p = 0; p < maxPages; p++) {
    const filters: unknown[] = [["owner", "in", owners], ["modified", ">", since]];
    const u: string = `${a.base}/api/resource/Quotation?fields=${encodeURIComponent(JSON.stringify(FIELDS))}&filters=${encodeURIComponent(JSON.stringify(filters))}&order_by=${encodeURIComponent("modified asc")}&limit_page_length=500`;
    const r: Response = await fetch(u, { headers: a.H, signal: AbortSignal.timeout(60000) });
    if (!r.ok) throw new HttpError(502, `The ERP answered ${r.status} for Quotation.`);
    const rows: Doc[] = ((await r.json()) as { data?: Doc[] }).data ?? [];
    read += rows.length;
    if (!rows.length) return { read, written, done: true, since: since || "" };
    const up = rows.map((q) => ({
      erp_name: S(q.name), owner: S(q.owner).toLowerCase() || null, sales_person: S(q.sales_person) || null,
      customer: S(q.customer_name) || S(q.party_name) || null, quoted_on: D(q.transaction_date),
      valid_till: D(q.validity_till) || D(q.valid_till), target_order_on: D(q.target_date_of_order),
      grand_total: N(q.grand_total), base_grand_total: N(q.base_grand_total), currency: S(q.currency) || null,
      status: S(q.status) || null, docstatus: N(q.docstatus), contact_person: S(q.contact_display) || S(q.contact_person) || null,
      contact_email: S(q.contact_email).toLowerCase() || null, subject: S(q.subject) || null, last_status: S(q.last_status) || null,
      importance: S(q.importance_closure) || null, product_group: S(q.product_group) || null, assigned_to: S(q.assigned_to) || null,
      erp_modified: ist(q.modified), erp: q, pulled_at: new Date().toISOString(),
    })).filter((x) => x.erp_name);
    const { error } = await admin.from("seva_quotation").upsert(up, { onConflict: "erp_name" });
    if (error) throw new Error(error.message);
    written += up.length;
    since = S(rows[rows.length - 1].modified).slice(0, 26);
    if (rows.length < 500) return { read, written, done: true, since: since || "" };
  }
  return { read, written, done: false, since: since || "" };
}

/** The ERP's own PDF of the quotation, in the print format asked for (the ERP's default when none). */
export async function quotePdf(name: string, format?: string | null): Promise<{ bytes: Buffer; file: string }> {
  const a = await erpAuth();
  if (!a) throw new HttpError(503, "The ERP's URL and token are not saved — CRM → Integrations.");
  const u = `${a.base}/api/method/frappe.utils.print_format.download_pdf?doctype=Quotation&name=${encodeURIComponent(name)}${format ? `&format=${encodeURIComponent(format)}` : ""}&no_letterhead=0`;
  const r = await fetch(u, { headers: a.H, signal: AbortSignal.timeout(90000) });
  if (!r.ok || !/pdf/i.test(r.headers.get("content-type") || "")) throw new HttpError(502, `The ERP did not give the PDF (${r.status}).`);
  return { bytes: Buffer.from(await r.arrayBuffer()), file: `${name.replace(/[\\/]+/g, "-")}.pdf` };
}

/**
 * SEND IT (12 Oct 2026). From the asker's own connected Gmail when there is
 * one; otherwise from sales@ with a Reply-To and a CC to the asker, so the
 * customer's answer still reaches the person who made the quote.
 */
export async function sendQuoteMail(row: { erp_name: string; mail_to: string[]; mail_cc: string[]; mail_bcc: string[]; subject: string; body_html: string; print_format: string | null; asked_by: string }, askerName: string | null): Promise<{ from: string; gmailId: string }> {
  const own = await mailboxByAddress(row.asked_by);
  const ownOk = own && own.status === "active";
  const box = ownOk ? own : await mailboxByAddress("sales@nandan.co.in");
  if (!box || box.status !== "active") throw new HttpError(503, "No mailbox to send from — connect your Gmail on the CRM's Integrations, or sales@ has to be reconnected.");
  const token = await accessTokenFor(String(box.id));
  const pdf = await quotePdf(row.erp_name, row.print_format);
  const cc = [...row.mail_cc, ...(ownOk ? [] : [row.asked_by])].filter((x, i, a) => x && a.indexOf(x) === i);
  const gmailId = await gmailSendMixed(token, String(box.email_address), row.mail_to.join(", "), row.subject, row.body_html,
    [{ name: pdf.file, mime: "application/pdf", base64: pdf.bytes.toString("base64") }],
    cc.join(", ") || undefined, row.mail_bcc.join(", ") || undefined, askerName ? `${askerName} — Nandan GSE` : "Nandan GSE", ownOk ? null : row.asked_by);
  return { from: String(box.email_address), gmailId };
}
