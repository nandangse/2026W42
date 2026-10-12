import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireSeva } from "@/lib/seva";
import { adminClient } from "@/lib/supabase/admin";
import { pullJobInfo } from "@/lib/seva-job-info";
import { sevaMail } from "@/lib/seva-orders";
import { paged } from "@/lib/seva-jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * /api/seva/crm — SEVA → CRM (Dr Raghu, 12 Oct 2026): what is under warranty
 * today and till when; which customers, at which sites, have machines out of
 * warranty with no AMC — and the calls, mails and quotes made to them.
 *
 * WARRANTY: from the installation's completion (else the delivery) for the
 * job's warranty months — 12 unless set (24 extends it). COVERED: a valid AMC
 * names the job (the contract's job_1), or — failing a named job — the
 * customer holds a valid AMC, shown as such.
 *
 *   GET                         the jobs, the customers, contacts, the last touches
 *   POST pull | warranty | touch | contacts | email
 */
const S = (v: unknown) => String(v ?? "").trim();
const istDay = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const addMonths = (iso: string, m: number) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCMonth(d.getUTCMonth() + m); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };
const mails = (v: unknown) => (Array.isArray(v) ? v : S(v).split(/[,;\s]+/)).map((x) => S(x).toLowerCase()).filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const KINDS = ["Call", "E-mail", "Visit", "Quotation", "WhatsApp", "Note"];

async function build(admin: ReturnType<typeof adminClient>) {
  const today = istDay();
  const soon = addMonths(today, 2);
  const jobs = await paged<Record<string, unknown>>((a, b) => admin.from("seva_job_info").select("*").in("status", ["Delivered", "Installation Stage"]).range(a, b));
  const [{ data: amcs }, { data: contacts }, quotes, touches] = await Promise.all([
    admin.from("seva_amc").select("erp_name, customer, status, end_date, job_details").eq("status", "AMC valid paid"),
    admin.from("seva_customer_contact").select("*"),
    paged<Record<string, unknown>>((a, b) => admin.from("seva_quotation").select("customer, contact_email, contact_person, quoted_on").not("contact_email", "is", null).order("quoted_on", { ascending: false }).range(a, b)),
    paged<Record<string, unknown>>((a, b) => admin.from("seva_crm_touch").select("*").order("at", { ascending: false }).range(a, b)),
  ]);
  const amcByJob = new Map((amcs || []).filter((x) => S(x.job_details)).map((x) => [S(x.job_details), x]));
  const amcCustomers = new Map<string, string[]>();
  for (const x of amcs || []) amcCustomers.set(S(x.customer).toLowerCase(), [...(amcCustomers.get(S(x.customer).toLowerCase()) || []), S(x.erp_name)]);
  const rows = jobs.map((j) => {
    const from = S(j.installed_on) || S(j.delivered_on) || null;
    const months = Number(j.warranty_months) || 12;
    const till = from ? addMonths(from, months) : null;
    const amc = amcByJob.get(S(j.job_id));
    const custAmc = amcCustomers.get(S(j.customer).toLowerCase()) || [];
    const state = amc ? "amc" : !till ? "no date" : till >= today ? (till <= soon ? "ending" : "warranty") : custAmc.length ? "customer amc" : "prospect";
    return { job_id: S(j.job_id), customer: S(j.customer), site: S(j.delivery_location) && !/^unknown$/i.test(S(j.delivery_location)) ? S(j.delivery_location) : "", tag: S(j.tag), fam: S(j.fam), status: S(j.status), delivered_on: j.delivered_on || null, installed_on: j.installed_on || null, from, months, till, warranty_note: j.warranty_note || null, amc: amc ? S(amc.erp_name) : null, customer_amcs: custAmc, state };
  });
  /* the contacts: what was saved for the customer, else the last quotation's contact */
  const contactOf = new Map<string, { to: string[]; cc: string[]; from: string }>();
  for (const q of quotes) { const k = S(q.customer).toLowerCase(); if (!contactOf.has(k) && S(q.contact_email)) contactOf.set(k, { to: [S(q.contact_email)], cc: [], from: `last quotation (${S(q.contact_person) || S(q.contact_email)})` }); }
  for (const c of contacts || []) contactOf.set(S(c.customer).toLowerCase(), { to: c.mail_to || [], cc: c.mail_cc || [], from: "saved" });
  const lastTouch = new Map<string, Record<string, unknown>>(); const nTouch = new Map<string, number>();
  for (const t of touches) { const k = S(t.customer).toLowerCase(); if (!lastTouch.has(k)) lastTouch.set(k, t); nTouch.set(k, (nTouch.get(k) || 0) + 1); }
  const customers = [...new Set(rows.map((r) => r.customer).filter(Boolean))].map((c) => {
    const k = c.toLowerCase(); const mine = rows.filter((r) => r.customer === c);
    return { customer: c, jobs: mine.length, prospects: mine.filter((r) => r.state === "prospect").length, ending: mine.filter((r) => r.state === "ending").length, warranty: mine.filter((r) => r.state === "warranty" || r.state === "ending").length, amc: mine.filter((r) => r.state === "amc").length, sites: [...new Set(mine.map((r) => r.site).filter(Boolean))], contact: contactOf.get(k) || null, last: lastTouch.get(k) || null, touches: nTouch.get(k) || 0, customer_amcs: amcCustomers.get(k) || [] };
  });
  return { today, rows, customers, kinds: KINDS };
}

export async function GET(req: Request) {
  try {
    await requireSeva();
    const admin = adminClient();
    const cust = new URL(req.url).searchParams.get("touches");
    if (cust) {
      const { data } = await admin.from("seva_crm_touch").select("*").eq("customer", cust).order("at", { ascending: false });
      return NextResponse.json({ touches: data || [] });
    }
    try { return NextResponse.json({ installed: true, ...(await build(admin)) }); }
    catch (e) { if (/seva_job_info|seva_crm_touch|does not exist|schema cache/i.test(String((e as Error).message))) return NextResponse.json({ installed: false, rows: [], customers: [] }); throw e; }
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const me = await requireSeva();
    const admin = adminClient();
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = S(b.action);
    if (action === "pull") return NextResponse.json({ ok: true, ...(await pullJobInfo(admin)) });
    if (action === "warranty") {
      const months = Math.round(Number(b.months)); if (!(months >= 0 && months <= 120)) throw new HttpError(400, "Months, 0 to 120.");
      const { error } = await admin.from("seva_job_info").update({ warranty_months: months, warranty_note: S(b.note) || null, warranty_by: me.email, warranty_at: new Date().toISOString() }).eq("job_id", S(b.job_id));
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (action === "touch") {
      const customer = S(b.customer); if (!customer) throw new HttpError(400, "Which customer?");
      const kind = KINDS.includes(S(b.kind)) ? S(b.kind) : "Note";
      const { error } = await admin.from("seva_crm_touch").insert({ customer, kind, note: S(b.note), outcome: S(b.outcome) || null, next_on: /^\d{4}-\d{2}-\d{2}$/.test(S(b.next_on)) ? S(b.next_on) : null, job_ids: Array.isArray(b.job_ids) ? b.job_ids.map(S) : [], by: me.email });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (action === "contacts") {
      const customer = S(b.customer); if (!customer) throw new HttpError(400, "Which customer?");
      const { error } = await admin.from("seva_customer_contact").upsert({ customer, mail_to: mails(b.to), mail_cc: mails(b.cc), mail_bcc: mails(b.bcc), updated_by: me.email, updated_at: new Date().toISOString() }, { onConflict: "customer" });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    /* ONE MAIL PER CUSTOMER — their own machines listed in it — to the saved contact, else the last quotation's */
    if (action === "email") {
      const list: string[] = (Array.isArray(b.customers) ? b.customers : []).map(S).filter(Boolean);
      if (!list.length) throw new HttpError(400, "Tick the customers first.");
      if (list.length > 40) throw new HttpError(400, "Forty at a time — the mailbox has a daily limit.");
      const subject = S(b.subject); const body = S(b.body_html);
      if (!subject || !body) throw new HttpError(400, "Write the subject and the letter.");
      const d = await build(admin);
      const { data: who } = await admin.from("profiles").select("display_name").ilike("email", me.email).maybeSingle();
      const out: { customer: string; ok: boolean; why?: string }[] = [];
      for (const c of list) {
        const cu = d.customers.find((x) => x.customer === c);
        const to = cu?.contact?.to || []; const cc = cu?.contact?.cc || [];
        if (!to.length) { out.push({ customer: c, ok: false, why: "no e-mail on record" }); continue; }
        const jobs = d.rows.filter((r) => r.customer === c && (r.state === "prospect" || r.state === "ending" || r.state === "warranty"));
        const table = `<table cellpadding="5" style="border-collapse:collapse;font-size:13px"><tr style="background:#1B2A41;color:#fff"><th align="left">Job</th><th align="left">Machine</th><th align="left">Site</th><th align="left">Warranty till</th></tr>${jobs.map((r) => `<tr style="border-bottom:1px solid #ddd"><td>${esc(r.job_id)}</td><td>${esc(r.tag || r.fam)}</td><td>${esc(r.site || "—")}</td><td>${r.till ? esc(r.till) : "—"}</td></tr>`).join("")}</table>`;
        const html = body.replace(/\{customer\}/g, esc(c)).replace(/\{machines\}/g, table).replace(/\{sites\}/g, esc((cu?.sites || []).join(", ")));
        try {
          const sent = await sevaMail(me.email, (who?.display_name as string) || null, to, cc, subject.replace(/\{customer\}/g, c), html, []);
          await admin.from("seva_crm_touch").insert({ customer: c, kind: "E-mail", note: `${subject.replace(/\{customer\}/g, c)} — to ${to.join(", ")} from ${sent.from}`, job_ids: jobs.map((r) => r.job_id), by: me.email });
          out.push({ customer: c, ok: true });
        } catch (e) { out.push({ customer: c, ok: false, why: String((e as Error).message).slice(0, 120) }); }
      }
      return NextResponse.json({ ok: true, sent: out.filter((x) => x.ok).length, failed: out.filter((x) => !x.ok) });
    }
    throw new HttpError(400, "Unknown action.");
  } catch (e) { return errJson(e); }
}
