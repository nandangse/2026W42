import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireSeva } from "@/lib/seva";
import { adminClient } from "@/lib/supabase/admin";
import { readBody } from "@/lib/validate";
import { erpAuth } from "@/lib/saamaan-stock";
import { pullServiceQuotes, quotePdf, sendQuoteMail } from "@/lib/seva-quotes";
import { mayApproveQuote, QUOTE_APPROVERS } from "@/lib/seva-team";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * /api/seva/quotes — Seva → Quotation (Dr Raghu, 12 Oct 2026).
 *
 *   GET                         the service quotations, the owners' tally, what waits for approval
 *   GET ?name=NGSE/QTN/…        one: the ERP's fields, the updates, the sends, the customer's contacts
 *   GET ?pdf=NGSE/QTN/…&format= the ERP's PDF of it
 *   POST pull                   read the ERP now (the hour does it anyway)
 *   POST note                   an update — follow-up status, next action and date, a remark
 *   POST send_request           To / CC / BCC / subject / letter / print format → to the Service Manager
 *   POST approve | reject       the Service Manager's word; approve sends it
 */
type Doc = Record<string, unknown>;
const S = (v: unknown) => String(v ?? "").trim();
const FORMATS = ["QUOTE FOR SPARES", "Quotation Standard", "Nandan Quote Format", "Custom Quote", "New custom quote", "Detailed Proposal 2024", "Detailed Proposal 1", "Quotation with Item Image", "Proposal For Tech Approval"];
const FOLLOW = ["Awaiting PO", "Follow-up due", "Negotiating", "Revised quote needed", "PO received", "On hold", "Lost"];
const mails = (v: unknown) => (Array.isArray(v) ? v : S(v).split(/[,;\s]+/)).map((x) => S(x).toLowerCase()).filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)).filter((x, i, a) => a.indexOf(x) === i);
const istDay = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

async function all<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < 20000; i += 1000) {
    const { data, error } = await q(i, i + 999);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function GET(req: Request) {
  try {
    const me = await requireSeva();
    const admin = adminClient();
    const sp = new URL(req.url).searchParams;
    const pdf = sp.get("pdf");
    if (pdf) {
      const f = await quotePdf(pdf, sp.get("format") || null);
      return new NextResponse(new Uint8Array(f.bytes), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${f.file}"` } });
    }
    const a = await erpAuth().catch(() => null);
    const erp_base = a?.base ?? null;
    const name = sp.get("name");
    if (name) {
      const { data: q, error } = await admin.from("seva_quotation").select("*").eq("erp_name", name).maybeSingle();
      if (error) throw error; if (!q) throw new HttpError(404, "No such quotation here.");
      const [{ data: notes }, { data: sends }, { data: contact }] = await Promise.all([
        admin.from("seva_quote_note").select("*").eq("erp_name", name).order("at", { ascending: false }),
        admin.from("seva_quote_send").select("*").eq("erp_name", name).order("asked_at", { ascending: false }),
        q.customer ? admin.from("seva_customer_contact").select("*").eq("customer", q.customer).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      return NextResponse.json({ quote: q, notes: notes || [], sends: sends || [], contact: contact || null, formats: FORMATS, follow: FOLLOW, erp_base, me: me.email, mayApprove: mayApproveQuote(me.email, me.isOwner), approvers: QUOTE_APPROVERS });
    }
    const cols = "erp_name, owner, sales_person, customer, quoted_on, valid_till, target_order_on, grand_total, base_grand_total, currency, status, docstatus, contact_person, contact_email, subject, last_status, importance, product_group, follow_status, next_action, next_on, updated_by, updated_at, erp_modified";
    let rows: Doc[];
    try {
      rows = await all<Doc>((f, t) => admin.from("seva_quotation").select(cols).order("quoted_on", { ascending: false }).range(f, t));
    } catch (e) {
      if (/does not exist|schema cache/i.test(String((e as Error).message))) return NextResponse.json({ installed: false, rows: [] });
      throw e;
    }
    const { data: sends } = await admin.from("seva_quote_send").select("id, erp_name, status, asked_by, asked_at, sent_at, mail_to").order("asked_at", { ascending: false }).limit(500);
    const today = istDay();
    /* WAITING ON A PO, BY OWNER — submitted and open on the ERP */
    const by = new Map<string, { owner: string; open: number; openValue: number; due: number; total: number }>();
    for (const r of rows) {
      const o = S(r.owner) || "—"; const x = by.get(o) || { owner: o, open: 0, openValue: 0, due: 0, total: 0 };
      x.total++;
      if (S(r.status) === "Open" && Number(r.docstatus) === 1) { x.open++; x.openValue += Number(r.base_grand_total) || 0; if (r.next_on && S(r.next_on) <= today) x.due++; }
      by.set(o, x);
    }
    return NextResponse.json({ installed: true, rows, owners: [...by.values()].sort((a, b) => b.open - a.open), sends: sends || [], today, erp_base, me: me.email, mayApprove: mayApproveQuote(me.email, me.isOwner) });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const me = await requireSeva();
    const admin = adminClient();
    const b = await readBody(req, { action: "string" });
    if (b.action === "pull") {
      const out = await pullServiceQuotes(admin, { maxPages: 6 });
      return NextResponse.json({ ok: true, ...out });
    }
    const name = S(b.name);
    const { data: q } = name ? await admin.from("seva_quotation").select("erp_name, customer, follow_status, next_on").eq("erp_name", name).maybeSingle() : { data: null };
    if (b.action === "note") {
      if (!q) throw new HttpError(404, "No such quotation here.");
      const body = S(b.body).replace(/\u0000/g, "");
      const follow_status = FOLLOW.includes(S(b.follow_status)) ? S(b.follow_status) : null;
      const next_on = /^\d{4}-\d{2}-\d{2}$/.test(S(b.next_on)) ? S(b.next_on) : null;
      const next_action = S(b.next_action) || null;
      if (!body && !follow_status && !next_on && !next_action) throw new HttpError(400, "Write the update.");
      const line = body || [follow_status && `Status: ${follow_status}`, next_action && `Next: ${next_action}`, next_on && `by ${next_on}`].filter(Boolean).join(" · ");
      const { error } = await admin.from("seva_quote_note").insert({ erp_name: name, body: line, follow_status, next_on, by: me.email });
      if (error) throw error;
      const patch: Doc = { updated_by: me.email, updated_at: new Date().toISOString() };
      if (follow_status) patch.follow_status = follow_status;
      if (next_on !== null || b.next_on === "") patch.next_on = next_on;
      if (next_action !== null) patch.next_action = next_action;
      await admin.from("seva_quotation").update(patch).eq("erp_name", name);
      return NextResponse.json({ ok: true });
    }
    if (b.action === "send_request") {
      if (!q) throw new HttpError(404, "No such quotation here.");
      const to = mails(b.to), cc = mails(b.cc), bcc = mails(b.bcc);
      if (!to.length) throw new HttpError(400, "Who does it go to? Put at least one address in To.");
      const subject = S(b.subject); if (!subject) throw new HttpError(400, "Write the subject.");
      const print_format = FORMATS.includes(S(b.print_format)) ? S(b.print_format) : null;
      const { data: pending } = await admin.from("seva_quote_send").select("id").eq("erp_name", name).eq("status", "awaiting_approval").limit(1);
      if (pending?.length) throw new HttpError(409, "This quotation is already waiting for approval.");
      const row = { erp_name: name, mail_to: to, mail_cc: cc, mail_bcc: bcc, subject, body_html: S(b.body_html), print_format, asked_by: me.email };
      /* the customer's master contacts, remembered for the next one */
      if (q.customer) await admin.from("seva_customer_contact").upsert({ customer: q.customer, mail_to: to, mail_cc: cc, mail_bcc: bcc, updated_by: me.email, updated_at: new Date().toISOString() }, { onConflict: "customer" });
      const { data: made, error } = await admin.from("seva_quote_send").insert(row).select("id").single();
      if (error) throw error;
      await admin.from("seva_quote_note").insert({ erp_name: name, body: `Asked for approval to send to ${to.join(", ")}${cc.length ? ` (cc ${cc.join(", ")})` : ""}.`, by: me.email });
      return NextResponse.json({ ok: true, id: made.id, status: "awaiting_approval" });
    }
    if (b.action === "approve" || b.action === "reject") {
      if (!mayApproveQuote(me.email, me.isOwner)) throw new HttpError(403, "The Service Manager approves.");
      const { data: s } = await admin.from("seva_quote_send").select("*").eq("id", S(b.id)).maybeSingle();
      if (!s) throw new HttpError(404, "No such request.");
      if (s.status !== "awaiting_approval" && !(b.action === "approve" && s.status === "failed")) throw new HttpError(409, `This one is already ${s.status}.`);
      const now = new Date().toISOString();
      if (b.action === "reject") {
        await admin.from("seva_quote_send").update({ status: "rejected", decided_by: me.email, decided_at: now, reject_note: S(b.note) || null }).eq("id", s.id);
        await admin.from("seva_quote_note").insert({ erp_name: s.erp_name, body: `Not approved${S(b.note) ? `: ${S(b.note)}` : "."}`, by: me.email });
        return NextResponse.json({ ok: true, status: "rejected" });
      }
      await admin.from("seva_quote_send").update({ status: "approved", decided_by: me.email, decided_at: now }).eq("id", s.id);
      try {
        const { data: asker } = await admin.from("profiles").select("display_name").ilike("email", s.asked_by).maybeSingle();
        const sent = await sendQuoteMail(s, (asker?.display_name as string) || null);
        await admin.from("seva_quote_send").update({ status: "sent", sent_from: sent.from, sent_at: new Date().toISOString(), gmail_id: sent.gmailId, error: null }).eq("id", s.id);
        await admin.from("seva_quote_note").insert({ erp_name: s.erp_name, body: `Approved and sent to ${s.mail_to.join(", ")} from ${sent.from}.`, follow_status: "Awaiting PO", by: me.email });
        await admin.from("seva_quotation").update({ follow_status: "Awaiting PO", updated_by: me.email, updated_at: new Date().toISOString() }).eq("erp_name", s.erp_name);
        return NextResponse.json({ ok: true, status: "sent", from: sent.from });
      } catch (e) {
        const why = String((e as Error).message || e).slice(0, 300);
        await admin.from("seva_quote_send").update({ status: "failed", error: why }).eq("id", s.id);
        throw new HttpError(502, `Approved, but the mail did not go: ${why}`);
      }
    }
    if (b.action === "withdraw") {
      const { data: s } = await admin.from("seva_quote_send").select("id, asked_by, status").eq("id", S(b.id)).maybeSingle();
      if (!s || (s.asked_by !== me.email && !me.isOwner)) throw new HttpError(403, "Your own request.");
      if (s.status !== "awaiting_approval" && s.status !== "failed") throw new HttpError(409, "Only one still waiting can be withdrawn.");
      await admin.from("seva_quote_send").delete().eq("id", s.id);
      return NextResponse.json({ ok: true });
    }
    throw new HttpError(400, "Unknown action.");
  } catch (e) { return errJson(e); }
}
