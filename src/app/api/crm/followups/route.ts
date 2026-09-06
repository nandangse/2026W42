import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { crmDb, crmConfigured, CrmNotConfigured } from "@/crm/db";

export const dynamic = "force-dynamic";

/**
 * The courtesy queue — see supabase-crm/migrations/0021.
 *
 * GET returns MY open follow-ups with the message ALREADY WRITTEN: the
 * template from the masters when one is named "Card Thank You", the built-in
 * words otherwise, {name} and {company} filled in. One tap opens WhatsApp or
 * the mail draft; Done records that the courtesy went.
 */
const FALLBACK_EMAIL = {
  subject: "Great meeting you",
  body: "Dear {name},\n\nIt was a pleasure meeting you. Thank you for your time — I look forward to staying in touch and to being useful to {company} whenever the need arises.\n\nWarm regards",
};
const FALLBACK_WA = "Dear {name}, it was a pleasure meeting you today. Looking forward to staying in touch! — {me}";

const fill = (t: string, vars: Record<string, string>) =>
  t.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");

export async function GET() {
  try {
    const me = await requireCrm();
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    const db = crmDb();

    const { data: items, error } = await db.from("card_followup")
      .select("id, person_id, company_id, channel, due_at, status, added_at")
      .eq("added_by", me.email.toLowerCase()).eq("status", "open")
      .order("due_at", { ascending: true }).limit(100);
    if (error) {
      if (/card_followup|schema cache|does not exist/i.test(error.message))
        return NextResponse.json({ items: [], needsMigration: true });
      throw new HttpError(500, error.message);
    }

    const personIds = [...new Set((items || []).map((i) => String(i.person_id)))];
    const people = new Map<string, Record<string, unknown>>();
    for (let i = 0; i < personIds.length; i += 150) {
      const { data } = await db.from("person").select("id, first_name, primary_email, primary_phone, whatsapp_number, company_id").in("id", personIds.slice(i, i + 150));
      for (const p of data || []) people.set(String(p.id), p as Record<string, unknown>);
    }
    const companyIds = [...new Set([...people.values()].map((p) => p.company_id).filter(Boolean).map(String))];
    const companies = new Map<string, string>();
    for (let i = 0; i < companyIds.length; i += 150) {
      const { data } = await db.from("company").select("id, name").in("id", companyIds.slice(i, i + 150));
      for (const c of data || []) companies.set(String(c.id), String(c.name ?? ""));
    }

    // the words: the master template when one is named for this, else built-in
    const { data: et } = await db.from("email_template").select("subject, body").ilike("name", "%card thank you%").limit(1).maybeSingle();
    const { data: wt } = await db.from("whatsapp_template").select("body").ilike("name", "%card thank you%").limit(1).maybeSingle();

    const meName = me.displayName || me.email.split("@")[0];
    const out = (items || []).map((i) => {
      const p = people.get(String(i.person_id)) || {};
      const company = p.company_id ? companies.get(String(p.company_id)) ?? "" : "";
      const vars = { name: String(p.first_name ?? ""), company: company || "your company", me: String(meName) };
      const phone = String(p.whatsapp_number || p.primary_phone || "").replace(/[^+0-9]/g, "");
      return {
        id: String(i.id), channel: String(i.channel), due_at: i.due_at,
        person_id: String(i.person_id), person: String(p.first_name ?? "—"),
        company: company || null,
        email: String(p.primary_email ?? "") || null,
        phone: phone || null,
        subject: fill(String(et?.subject || FALLBACK_EMAIL.subject), vars),
        body: fill(String(i.channel === "email" ? (et?.body || FALLBACK_EMAIL.body) : (wt?.body || FALLBACK_WA)), vars),
        overdue: String(i.due_at) < new Date().toISOString(),
      };
    });
    return NextResponse.json({ items: out });
  } catch (e) {
    return errJson(e);
  }
}

export async function POST(req: Request) {
  try {
    const me = await requireCrm();
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    const db = crmDb();
    const body = await readBody(req, {});
    const action = String(body.action || "");
    const mine = me.email.toLowerCase();

    if (action === "add") {
      const personId = String(body.person_id || "");
      if (!personId) throw new HttpError(400, "Whom to thank?");
      const channels = (Array.isArray(body.channels) ? body.channels : []).filter((c: string) => ["email", "whatsapp"].includes(c));
      if (!channels.length) throw new HttpError(400, "Email, WhatsApp, or both.");
      // due within a day: tomorrow morning, so it greets them at the desk
      const due = new Date(); due.setDate(due.getDate() + 1); due.setHours(9, 30, 0, 0);
      const rows = channels.map((channel: string) => ({
        person_id: personId, company_id: String(body.company_id || "").trim() || null,
        card_id: String(body.card_id || "").trim() || null,
        channel, due_at: due.toISOString(), added_by: mine,
      }));
      const { error } = await db.from("card_followup").insert(rows);
      if (error) {
        if (/card_followup|schema cache|does not exist/i.test(error.message))
          throw new HttpError(503, "Run CRM migration 0021 first — the follow-ups have nowhere to live yet.");
        throw new HttpError(500, error.message);
      }
      return NextResponse.json({ ok: true, queued: rows.length });
    }

    if (action === "done" || action === "skip") {
      const { error } = await db.from("card_followup")
        .update({ status: action === "done" ? "done" : "skipped", done_at: new Date().toISOString() })
        .eq("id", String(body.id || "")).eq("added_by", mine);
      if (error) throw new HttpError(500, error.message);
      return NextResponse.json({ ok: true });
    }

    throw new HttpError(400, "unknown action");
  } catch (e) {
    return errJson(e);
  }
}
