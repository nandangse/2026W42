import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { crmDb, crmConfigured, CrmNotConfigured } from "@/crm/db";
import { variableValues, renderTemplate } from "@/crm/variables";
import { myMailbox, accessTokenFor, gmailSend } from "@/crm/gmail";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Row = Record<string, unknown>;

const FALLBACK = {
  email_subject: "Great meeting you",
  email_body: "Dear {name},\n\nIt was a pleasure meeting you. Thank you for your time — I look forward to staying in touch and to being useful to {company} whenever the need arises.\n\nWarm regards,\n{me}",
  wa_body: "Dear {name}, it was a pleasure meeting you today. Looking forward to staying in touch! — {me}",
};
const fill = (t: string, vars: Record<string, string>) => t.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");

/**
 * The outbound queues — see supabase-crm/migrations/0022.
 *
 * GET ?channel=&tab=queue|sent|auto (bosses may add &all=1) · ?due=1 for the
 * Dashboard's due list · ?bootstrap=1 for the template names.
 * POST add | update | cancel | send. A message is rendered WHOLE at queue
 * time — what the system wrote is what the record holds.
 */
export async function GET(req: Request) {
  try {
    const me = await requireCrm();
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    const db = crmDb();
    const u = new URL(req.url);
    const isBoss = ["admin", "ceo", "sales_head"].includes(String(me.crmRole));
    const mineOnly = !(isBoss && u.searchParams.get("all"));

    if (u.searchParams.get("bootstrap")) {
      const [{ data: et }, { data: wt }] = await Promise.all([
        db.from("email_template").select("name").order("name"),
        db.from("whatsapp_template").select("name").order("name"),
      ]);
      return NextResponse.json({
        emailTemplates: (et || []).map((t) => String(t.name)),
        waTemplates: (wt || []).map((t) => String(t.name)),
      });
    }

    if (u.searchParams.get("due")) {
      let q = db.from("outbound_queue").select("*").eq("status", "queued")
        .lte("due_at", new Date().toISOString()).order("due_at", { ascending: true }).limit(60);
      if (mineOnly) q = q.eq("added_by", me.email.toLowerCase());
      const { data, error } = await q;
      if (error) {
        if (/outbound_queue|schema cache|does not exist/i.test(error.message))
          return NextResponse.json({ items: [], needsMigration: true });
        throw new HttpError(500, error.message);
      }
      return NextResponse.json({ items: await enrich(db, (data || []) as Row[]) });
    }

    const channel = u.searchParams.get("channel") === "whatsapp" ? "whatsapp" : "email";
    const tab = String(u.searchParams.get("tab") || "queue");

    if (tab === "tracking" && channel === "email") {
      // the tracked sends and what the pixel heard (0023)
      let q = db.from("message")
        .select("id, subject, to_handles, occurred_at, opened_at, open_count, agent_profile_id")
        .eq("channel", "email").eq("direction", "outbound").not("track_token", "is", null)
        .order("occurred_at", { ascending: false }).limit(150);
      if (mineOnly && me.profileId) q = q.eq("agent_profile_id", me.profileId);
      const { data, error } = await q;
      if (error) {
        if (/track_token|schema cache|does not exist/i.test(error.message))
          return NextResponse.json({ rows: [], needsMigration: true });
        throw new HttpError(500, error.message);
      }
      return NextResponse.json({ rows: data || [] });
    }

    if (tab === "sent" && channel === "email") {
      // every mail Genie sent — the message log is the truth of what went
      let q = db.from("message")
        .select("id, subject, body_text, to_handles, occurred_at, agent_profile_id")
        .eq("channel", "email").eq("direction", "outbound")
        .order("occurred_at", { ascending: false }).limit(150);
      if (mineOnly && me.profileId) q = q.eq("agent_profile_id", me.profileId);
      const { data, error } = await q;
      if (error) throw new HttpError(500, error.message);
      return NextResponse.json({ rows: data || [] });
    }

    let q = db.from("outbound_queue").select("*").eq("channel", channel)
      .order("added_at", { ascending: false }).limit(200);
    if (tab === "auto") q = q.eq("status", "sent").eq("send_mode", "auto");
    else if (tab === "sent") q = q.eq("status", "sent");
    else q = q.eq("status", "queued");
    if (mineOnly) q = q.eq("added_by", me.email.toLowerCase());
    const { data, error } = await q;
    if (error) {
      if (/outbound_queue|schema cache|does not exist/i.test(error.message))
        return NextResponse.json({ items: [], needsMigration: true });
      throw new HttpError(500, error.message);
    }
    return NextResponse.json({ items: await enrich(db, (data || []) as Row[]) });
  } catch (e) {
    return errJson(e);
  }
}

async function enrich(db: ReturnType<typeof crmDb>, rows: Row[]) {
  const pids = [...new Set(rows.map((r) => r.person_id).filter(Boolean).map(String))];
  const people = new Map<string, Row>();
  for (let i = 0; i < pids.length; i += 150) {
    const { data } = await db.from("person").select("id, first_name, company_id").in("id", pids.slice(i, i + 150));
    for (const p of data || []) people.set(String(p.id), p as Row);
  }
  const cids = [...new Set([...rows.map((r) => r.company_id), ...[...people.values()].map((p) => p.company_id)].filter(Boolean).map(String))];
  const companies = new Map<string, string>();
  for (let i = 0; i < cids.length; i += 150) {
    const { data } = await db.from("company").select("id, name").in("id", cids.slice(i, i + 150));
    for (const c of data || []) companies.set(String(c.id), String(c.name ?? ""));
  }
  return rows.map((r) => {
    const p = r.person_id ? people.get(String(r.person_id)) : undefined;
    const cid = (r.company_id || p?.company_id) ? String(r.company_id || p?.company_id) : null;
    return { ...r, person: p ? String(p.first_name ?? "") : null, company: cid ? companies.get(cid) ?? null : null };
  });
}

export async function POST(req: Request) {
  try {
    const me = await requireCrm();
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    const db = crmDb();
    const body = await req.json();
    const action = String(body.action || "");
    const mine = me.email.toLowerCase();

    if (action === "add") {
      const personId = String(body.person_id || "") || null;
      const channels: string[] = (Array.isArray(body.channels) ? body.channels : [body.channel]).filter((c: string) => ["email", "whatsapp"].includes(c));
      if (!channels.length) throw new HttpError(400, "Email, WhatsApp, or both.");

      // the person's coordinates and the words, rendered NOW and kept whole
      let person: Row | null = null;
      if (personId) {
        const { data } = await db.from("person").select("id, first_name, primary_email, primary_phone, whatsapp_number, company_id").eq("id", personId).maybeSingle();
        person = (data as Row) || null;
      }
      const companyId = String(body.company_id || person?.company_id || "") || null;
      let companyName = "";
      if (companyId) {
        const { data: c } = await db.from("company").select("name").eq("id", companyId).maybeSingle();
        companyName = String(c?.name || "");
      }
      const vars = {
        name: String(person?.first_name ?? body.name ?? ""),
        company: companyName || "your company",
        me: me.displayName || me.email.split("@")[0],
      };

      // 6 AM tomorrow, IST — so it greets them before the day starts
      const due = new Date(Date.now() + 24 * 3600 * 1000);
      const istMidnight = new Date(due.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) + "T06:00:00+05:30");
      const dueAt = String(body.due_at || istMidnight.toISOString());

      const rows: Row[] = [];
      for (const channel of channels) {
        let subject: string | null = null, text = "";
        if (channel === "email") {
          const tn = String(body.email_template || "").trim();
          const { data: t } = tn
            ? await db.from("email_template").select("subject, body").eq("name", tn).limit(1).maybeSingle()
            : await db.from("email_template").select("subject, body").ilike("name", "%card thank you%").limit(1).maybeSingle();
          subject = renderTemplate(fill(String(t?.subject || FALLBACK.email_subject), vars), vars);
          text = renderTemplate(fill(String(t?.body || FALLBACK.email_body), vars), vars);
        } else {
          const tn = String(body.wa_template || "").trim();
          const { data: t } = tn
            ? await db.from("whatsapp_template").select("body").eq("name", tn).limit(1).maybeSingle()
            : await db.from("whatsapp_template").select("body").ilike("name", "%card thank you%").limit(1).maybeSingle();
          text = renderTemplate(fill(String(t?.body || FALLBACK.wa_body), vars), vars);
        }
        rows.push({
          channel, person_id: personId, company_id: companyId, card_id: String(body.card_id || "") || null,
          to_email: channel === "email" ? String(body.to_email || person?.primary_email || "") || null : null,
          to_phone: channel === "whatsapp" ? String(body.to_phone || person?.whatsapp_number || person?.primary_phone || "") || null : null,
          subject, body: text,
          template_name: channel === "email" ? String(body.email_template || "") || null : String(body.wa_template || "") || null,
          send_mode: channel === "email" && body.auto !== false ? "auto" : "manual",
          due_at: dueAt, added_by: mine,
        });
      }
      const { error } = await db.from("outbound_queue").insert(rows);
      if (error) {
        if (/outbound_queue|schema cache|does not exist/i.test(error.message))
          throw new HttpError(503, "Run CRM migration 0022 first — the queues have nowhere to live yet.");
        throw new HttpError(500, error.message);
      }
      return NextResponse.json({ ok: true, queued: rows.length });
    }

    const id = String(body.id || "");
    if (!id) throw new HttpError(400, "Which message?");

    if (action === "update") {
      const patch: Row = {};
      for (const k of ["subject", "body", "to_email", "to_phone"]) if (k in body) patch[k] = String(body[k] ?? "").trim() || null;
      if ("send_mode" in body) patch.send_mode = body.send_mode === "auto" ? "auto" : "manual";
      const { error } = await db.from("outbound_queue").update(patch).eq("id", id).eq("added_by", mine).eq("status", "queued");
      if (error) throw new HttpError(500, error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "cancel") {
      const { error } = await db.from("outbound_queue").update({ status: "cancelled" }).eq("id", id).eq("added_by", mine).eq("status", "queued");
      if (error) throw new HttpError(500, error.message);
      return NextResponse.json({ ok: true });
    }

    /**
     * send — the human's hand on the queue.
     * Email goes through THEIR Gmail now; WhatsApp opens with the words
     * ready, and this is the moment it enters Communication.
     */
    if (action === "send") {
      const { data: q } = await db.from("outbound_queue").select("*").eq("id", id).eq("status", "queued").maybeSingle();
      if (!q) throw new HttpError(404, "Not in the queue — sent or cancelled already.");
      if (String(q.added_by) !== mine && !["admin", "ceo", "sales_head"].includes(String(me.crmRole)))
        throw new HttpError(403, "Another salesperson's message.");

      if (q.channel === "email") {
        const to = String(q.to_email || "");
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new HttpError(400, "The queue entry has no valid address — edit it first.");
        const mb = me.profileId ? await myMailbox(me.profileId) : null;
        if (!mb || mb.status !== "active") throw new HttpError(400, "Connect your Gmail first — Profile → Gmail connection.");
        const token = await accessTokenFor(String(mb.id));
        await gmailSend(token, String(mb.email_address), to, String(q.subject || "(no subject)"), String(q.body || ""), undefined, undefined, me.displayName || undefined);
        await db.from("message").insert({
          channel: "email", direction: "outbound",
          subject: q.subject, body_text: q.body,
          from_handle: String(mb.email_address), to_handles: [to],
          occurred_at: new Date().toISOString(),
          person_id: q.person_id, company_id: q.company_id,
          agent_profile_id: me.profileId,
        });
        await db.from("outbound_queue").update({ status: "sent", sent_at: new Date().toISOString(), sent_note: "by hand" }).eq("id", id);
        return NextResponse.json({ ok: true, sent: "email" });
      }

      const digits = String(q.to_phone || "").replace(/\D/g, "");
      if (digits.length < 8) throw new HttpError(400, "The queue entry has no valid number — edit it first.");
      await db.from("message").insert({
        channel: "whatsapp", direction: "outbound",
        body_text: q.body, from_handle: me.email, to_handles: [`+${digits}`],
        occurred_at: new Date().toISOString(),
        person_id: q.person_id, company_id: q.company_id,
        agent_profile_id: me.profileId,
      });
      await db.from("outbound_queue").update({ status: "sent", sent_at: new Date().toISOString(), sent_note: "by hand" }).eq("id", id);
      return NextResponse.json({ ok: true, sent: "whatsapp", url: `https://wa.me/${digits}?text=${encodeURIComponent(String(q.body || ""))}` });
    }

    throw new HttpError(400, "unknown action");
  } catch (e) {
    return errJson(e);
  }
}
