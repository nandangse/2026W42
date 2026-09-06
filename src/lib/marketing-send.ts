/**
 * The sending engine behind Marketing's campaigns: picks the next queued
 * recipients of every sending campaign, renders the message for each,
 * carries it by the ticked channel — the person's connected Gmail, or
 * Resend — with a tracking pixel and an unsubscribe link, and keeps the
 * channel's hourly and daily counts honest. Called by the cron every ten
 * minutes and by Send now.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { accessTokenFor, gmailSend } from "@/crm/gmail";
import { swallow } from "@/lib/swallow";

export const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://genie.nandan.co.in";

export type Channel = { id: string; email: string; label: string | null; kind: "gmail" | "resend" | "mailercloud"; api_key: string | null; daily_limit: number; hourly_limit: number; active: boolean; sent_on: string | null; sent_today: number; sent_this_hour: number; hour_mark: string | null };
type Person = { id: string; first_name: string | null; last_name: string | null; full_name: string | null; job_title: string | null; primary_email: string | null; city: string | null; country: string | null; company_id: string | null };

/** {{first_name}}, {{name}}, {{title}}, {{company}}, {{city}}, {{country}}, {{email}} — plus the CRM's static variables. */
export function render(tpl: string, p: Person | null, company: string | null, statics: Record<string, string>): string {
  const v: Record<string, string> = {
    ...statics,
    first_name: p?.first_name || (p?.full_name || "").split(" ")[0] || "there",
    last_name: p?.last_name || "",
    name: p?.full_name || p?.first_name || "",
    title: p?.job_title || "",
    company: company || "",
    city: p?.city || "",
    country: p?.country || "",
    email: p?.primary_email || "",
  };
  return String(tpl || "").replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, k) => v[String(k).toLowerCase()] ?? "");
}

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

/** Room left on a channel this hour and today, after resetting stale counters. */
export function room(ch: Channel): { ok: boolean; ch: Channel } {
  const c = { ...ch };
  if (c.sent_on !== today()) { c.sent_on = today(); c.sent_today = 0; }
  const mark = c.hour_mark ? new Date(c.hour_mark).getTime() : 0;
  if (Date.now() - mark > 3600_000) { c.hour_mark = new Date().toISOString(); c.sent_this_hour = 0; }
  return { ok: c.active && c.sent_today < c.daily_limit && c.sent_this_hour < c.hourly_limit, ch: c };
}

async function viaResend(ch: Channel, to: string, subject: string, html: string): Promise<void> {
  const key = ch.api_key || process.env.RESEND_API_KEY;
  if (!key) throw new Error("no Resend key on the channel or the deploy");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ from: `${ch.label || "Nandan GSE"} <${ch.email}>`, to: [to], subject, html }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 160)}`);
}

/** Mailercloud's Email API (apidoc.mailercloud.com): POST https://email-api.mailercloud.com/email, the key bare in Authorization. */
async function viaMailercloud(ch: Channel, to: string, subject: string, html: string): Promise<void> {
  if (!ch.api_key) throw new Error("no Mailercloud API key on the channel");
  const r = await fetch("https://email-api.mailercloud.com/email", {
    method: "POST", headers: { "content-type": "application/json", authorization: ch.api_key },
    body: JSON.stringify({ version: "1.0", email: { from: ch.email, fromName: ch.label || "Nandan GSE", replyTo: [ch.email], subject, html, text: html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(), recipients: { to: [{ email: to }] } }, metadata: { campaignType: "marketing" } }) });
  if (!r.ok) throw new Error(`Mailercloud ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const j = await r.json().catch(() => null) as { status?: string; message?: string } | null;
  if (j && j.status && j.status !== "SUCCESS") throw new Error(`Mailercloud: ${j.message || j.status}`);
}

async function viaGmail(db: SupabaseClient, ch: Channel, to: string, subject: string, html: string): Promise<void> {
  const { data: mb } = await db.from("mailbox").select("id, email_address, display_name").eq("email_address", ch.email).maybeSingle();
  if (!mb) throw new Error(`${ch.email} has no connected Gmail in CRM → Integrations`);
  const token = await accessTokenFor(String(mb.id));
  await gmailSend(token, String(mb.email_address), to, subject, html, undefined, undefined, ch.label || String(mb.display_name || "") || undefined);
}

/**
 * One pass: for every sending campaign, send up to `speed_per_hour / 6`
 * queued rows (a tenth of an hour, six passes an hour), round-robin over
 * its ticked channels, skipping unsubscribed addresses. Returns counts.
 */
export async function drain(db: SupabaseClient, opts: { campaignId?: string; max?: number } = {}): Promise<Record<string, number>> {
  const out: Record<string, number> = { sent: 0, failed: 0, skipped: 0, campaigns: 0 };
  let q = db.from("mk_campaign").select("id, name, subject, body_html, channel_ids, speed_per_hour, status").eq("status", "sending");
  if (opts.campaignId) q = q.eq("id", opts.campaignId);
  const { data: camps } = await q;
  if (!camps?.length) return out;
  const { data: statics } = await db.from("message_variable").select("key, value").eq("kind", "static");
  const S: Record<string, string> = Object.fromEntries((statics || []).map((r) => [String(r.key), String(r.value ?? "")]));
  const { data: unsub } = await db.from("mk_unsubscribe").select("email");
  const U = new Set((unsub || []).map((r) => String(r.email).toLowerCase()));

  for (const c of camps) {
    out.campaigns++;
    const perPass = Math.max(1, Math.min(opts.max ?? 500, Math.ceil(Number(c.speed_per_hour || 50) / 6)));
    const { data: chans } = await db.from("mk_channel").select("*").in("id", (c.channel_ids as string[]) || []);
    const channels = ((chans || []) as Channel[]).map((ch) => room(ch)).filter((r) => r.ok).map((r) => r.ch);
    if (!channels.length) continue;
    const { data: rows } = await db.from("mk_send").select("id, person_id, email, token").eq("campaign_id", c.id).eq("status", "queued").limit(perPass);
    if (!rows?.length) {
      const { count } = await db.from("mk_send").select("id", { count: "exact", head: true }).eq("campaign_id", c.id).eq("status", "queued");
      if (!count) await db.from("mk_campaign").update({ status: "done", done_at: new Date().toISOString() }).eq("id", c.id);
      continue;
    }
    const pids = rows.map((r) => r.person_id).filter(Boolean) as string[];
    const { data: people } = pids.length ? await db.from("person").select("id, first_name, last_name, full_name, job_title, primary_email, city, country, company_id").in("id", pids) : { data: [] };
    const P = new Map((people || []).map((p) => [String(p.id), p as Person]));
    const cids = [...new Set((people || []).map((p) => p.company_id).filter(Boolean))] as string[];
    const { data: comps } = cids.length ? await db.from("company").select("id, name").in("id", cids) : { data: [] };
    const C = new Map((comps || []).map((x) => [String(x.id), String(x.name)]));
    let i = 0;
    for (const r of rows) {
      const to = String(r.email).toLowerCase();
      if (U.has(to)) { await db.from("mk_send").update({ status: "skipped", error: "unsubscribed" }).eq("id", r.id); out.skipped++; continue; }
      const ch = channels[i++ % channels.length];
      const rm = room(ch);
      if (!rm.ok) { out.skipped++; continue; }
      const p = r.person_id ? P.get(String(r.person_id)) ?? null : null;
      const subject = render(String(c.subject || ""), p, p?.company_id ? C.get(String(p.company_id)) ?? null : null, S);
      const bodyHtml = render(String(c.body_html || ""), p, p?.company_id ? C.get(String(p.company_id)) ?? null : null, S)
        + `<div style="margin-top:24px;font-size:11px;color:#8A94A0">Nandan GSE · <a href="${SITE}/api/marketing/u/${r.token}" style="color:#8A94A0">unsubscribe</a></div>`
        + `<img src="${SITE}/api/marketing/t/${r.token}" width="1" height="1" alt="" />`;
      try {
        if (ch.kind === "resend") await viaResend(ch, to, subject, bodyHtml);
        else if (ch.kind === "mailercloud") await viaMailercloud(ch, to, subject, bodyHtml);
        else await viaGmail(db, ch, to, subject, bodyHtml);
        await db.from("mk_send").update({ status: "sent", sent_at: new Date().toISOString(), channel_id: ch.id, error: null }).eq("id", r.id);
        rm.ch.sent_today += 1; rm.ch.sent_this_hour += 1;
        Object.assign(ch, rm.ch);
        await db.from("mk_channel").update({ sent_on: ch.sent_on, sent_today: ch.sent_today, sent_this_hour: ch.sent_this_hour, hour_mark: ch.hour_mark }).eq("id", ch.id);
        out.sent++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        swallow("marketing/send", e);
        await db.from("mk_send").update({ status: "failed", error: msg.slice(0, 300), channel_id: ch.id }).eq("id", r.id);
        out.failed++;
      }
    }
  }
  return out;
}
