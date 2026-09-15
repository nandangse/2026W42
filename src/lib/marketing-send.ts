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
import { pageAll } from "@/lib/page-all";

export const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://genie.nandan.co.in";

export type Channel = { id: string; email: string; label: string | null; kind: "gmail" | "resend" | "mailercloud"; api_key: string | null; reply_to?: string | null; daily_limit: number; hourly_limit: number; active: boolean; sent_on: string | null; sent_today: number; sent_this_hour: number; hour_mark: string | null };
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

/**
 * A FAILURE THAT MAY PASS, AND ONE THAT NEVER WILL.
 *
 * Dr Raghu, before a thousand go out: "so that tomorrow while sending
 * thousand this should not have a problem." Today every failure is final,
 * which is right for a dead address and wrong for a 429 or a timeout. A
 * thirty-second wobble at Resend would bury eighty good addresses as
 * permanently failed, and nothing would ever pick them up again.
 */
class SendError extends Error {
  retryable: boolean;
  constructor(message: string, retryable: boolean) { super(message); this.retryable = retryable; }
}

/** 429 and 5xx pass; a network error passes; a 4xx refusal does not. */
const transient = (status: number) => status === 408 || status === 425 || status === 429 || status >= 500;

/**
 * WHERE AN ANSWER GOES (Dr Raghu, 14 Sep 2026).
 *
 * The send used to set a From header and nothing else, so a reply went back
 * to the sending address. For the Resend channel that is raghu@nandangse.com
 * — a domain whose MX points at Zoho, not at the Google Workspace mailbox
 * anybody reads. Replies were landing in a room with nobody in it, and a
 * campaign that cannot be answered is a leaflet, not a letter.
 *
 * So the mail goes out branded from the domain Resend is verified for, and
 * the answer comes back to a mailbox that is read. Per channel, because the
 * right answer will differ once there are more mailboxes; sales@ until then.
 */
const REPLY_TO_FALLBACK = "sales@nandan.co.in";
const answersTo = (ch: Channel) => (ch.reply_to || "").trim() || REPLY_TO_FALLBACK;

/** Resend's own limit is a couple a second; a fast pass must not outrun it. */
const PACE_MS = Number(process.env.MARKETING_PACE_MS || 550);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * THE HEADERS THAT LET A READER LEAVE WITHOUT COMPLAINING (RFC 8058).
 *
 * The mail client draws its own Unsubscribe button beside the sender's name
 * and POSTs to the first URI; the reader never opens the message. Google has
 * required this of anybody sending over 5,000 a day to Gmail since 2024, and
 * at 5–10,000 a day it is the difference between arriving and not.
 *
 * It is also the cheapest deliverability there is. The alternative button,
 * the one right next to it, says "report spam" — and a complaint is counted
 * against the sending domain by every provider watching, where an opt-out
 * only costs one name.
 */
const unsubHeaders = (token: string) => ({
  "List-Unsubscribe": `<${SITE}/api/marketing/u/${token}>`,
  "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
});

async function viaResend(ch: Channel, to: string, subject: string, html: string, token?: string): Promise<void> {
  const key = ch.api_key || process.env.RESEND_API_KEY;
  if (!key) throw new Error("no Resend key on the channel or the deploy");
  let r: Response;
  try {
    r = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ from: `${ch.label || "Nandan GSE"} <${ch.email}>`, to: [to], subject, html, reply_to: answersTo(ch), ...(token ? { headers: unsubHeaders(token) } : {}) }),
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    /* A network fault or a timeout says nothing about the address. */
    throw new SendError(`Resend unreachable: ${e instanceof Error ? e.message : String(e)}`, true);
  }
  if (!r.ok) throw new SendError(`Resend ${r.status}: ${(await r.text()).slice(0, 160)}`, transient(r.status));
}

/** Mailercloud's Email API (apidoc.mailercloud.com): POST https://email-api.mailercloud.com/email, the key bare in Authorization. */
async function viaMailercloud(ch: Channel, to: string, subject: string, html: string, name?: string | null, messageId?: string, token?: string): Promise<void> {
  if (!ch.api_key) throw new Error("no Mailercloud API key on the channel");
  const r = await fetch("https://email-api.mailercloud.com/email", {
    method: "POST", headers: { "content-type": "application/json", authorization: ch.api_key },
    body: JSON.stringify({ version: "1.0", email: { from: ch.email, fromName: ch.label || "Nandan GSE", replyTo: [answersTo(ch)], subject, html, text: html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(), recipients: { to: [{ email: to, ...(name ? { name } : {}) }] }, ...(token ? { headers: unsubHeaders(token) } : {}) }, metadata: { campaignType: "marketing", ...(messageId ? { messageId } : {}) } }) });
  if (!r.ok) throw new Error(`Mailercloud ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const j = await r.json().catch(() => null) as { status?: string; message?: string } | null;
  if (j && j.status && j.status !== "SUCCESS") throw new Error(`Mailercloud: ${j.message || j.status}`);
}

async function viaGmail(db: SupabaseClient, ch: Channel, to: string, subject: string, html: string, token?: string): Promise<void> {
  const { data: mb } = await db.from("mailbox").select("id, email_address, display_name").eq("email_address", ch.email).maybeSingle();
  if (!mb) throw new Error(`${ch.email} has no connected Gmail in CRM → Integrations`);
  const tok = await accessTokenFor(String(mb.id));
  await gmailSend(tok, String(mb.email_address), to, subject, html, undefined, undefined, ch.label || String(mb.display_name || "") || undefined, undefined, null, answersTo(ch), undefined, token ? unsubHeaders(token) : undefined);
}

/**
 * One pass: for every sending campaign, send up to `speed_per_hour / 6`
 * queued rows (a tenth of an hour, six passes an hour), round-robin over
 * its ticked channels, skipping unsubscribed addresses. Returns counts.
 */
/** Three attempts on a temporary fault, then it is a real failure. */
const MAX_TRIES = 3;

export async function drain(db: SupabaseClient, opts: { campaignId?: string; max?: number } = {}): Promise<Record<string, number | string>> {
  const out: Record<string, number | string> = { sent: 0, failed: 0, skipped: 0, campaigns: 0, retrying: 0 };
  /**
   * THE ERROR WAS BEING SWALLOWED (14 Sep 2026).
   *
   * Three cron passes in a row reported "campaigns: 0" while a campaign sat
   * plainly at status = sending, and there was no way to tell whether the
   * query had found nothing or failed — because only `data` was read and
   * `error` was thrown away. A silent nought and a silent failure looked
   * identical from the outside, which is why the queue stalled for half an
   * hour without anybody being able to say why.
   *
   * AND A PENDING MIGRATION MUST NOT STOP THE POST (15 Sep 2026). Naming a
   * column that does not exist yet fails the WHOLE query, so asking for
   * `show_unsub_link` before 0068 has run would have halted every campaign
   * in the same silent way — which is precisely how the channels came to
   * look deleted an hour ago. The newest column is dropped and the send
   * carries on, with the link drawn, which is the safe default.
   */
  const BASE = "id, name, subject, body_html, channel_ids, speed_per_hour, status";
  type Camp = {
    id: string; name: string; subject: string | null; body_html: string | null;
    channel_ids: string[]; speed_per_hour: number; status: string; show_unsub_link?: boolean;
  };
  const ask = async (cols: string) => {
    let q = db.from("mk_campaign").select(cols).eq("status", "sending");
    if (opts.campaignId) q = q.eq("id", opts.campaignId);
    const r = await q;
    return { data: r.data as unknown as Camp[] | null, error: r.error };
  };
  let { data: camps, error: campErr } = await ask(BASE + ", show_unsub_link");
  if (campErr && /show_unsub_link/i.test(campErr.message)) {
    out.note = "0068 not run — the unsubscribe link is always drawn";
    ({ data: camps, error: campErr } = await ask(BASE));
  }
  if (campErr) { out.error = String(campErr.message).slice(0, 200); return out; }
  if (!camps?.length) return out;
  const { data: statics } = await db.from("message_variable").select("key, value").eq("kind", "static");
  const S: Record<string, string> = Object.fromEntries((statics || []).map((r) => [String(r.key), String(r.value ?? "")]));
  /**
   * WHO IS QUIET, AND UNTIL WHEN (0068).
   *
   * `until` null means gone for good; a date means they asked for three
   * months' quiet and become mailable again on their own afterwards. Until
   * the migration runs the column is not there, and the fallback treats
   * every row as permanent — the safe direction to be wrong in, since it
   * sends nobody a mail they asked not to have.
   */
  let U = new Set<string>();
  {
    const now = Date.now();
    /* PAGED. Read as one call it stops at 1,000 and Genie starts mailing
       people who asked it not to — see src/lib/page-all.ts. */
    type Row = { email: string; until?: string | null };
    let rows: Row[];
    try {
      rows = await pageAll<Row>((f, t) => db.from("mk_unsubscribe").select("email, until").range(f, t), "the unsubscribe list");
    } catch (e) {
      if (!/until/i.test(e instanceof Error ? e.message : "")) throw e;
      rows = await pageAll<Row>((f, t) => db.from("mk_unsubscribe").select("email").range(f, t), "the unsubscribe list");
    }
    U = new Set(rows
      .filter((x) => !x.until || new Date(x.until).getTime() > now)
      .map((x) => String(x.email).toLowerCase()));
  }

  for (const c of camps) {
    out.campaigns = (Number(out.campaigns) || 0) + 1;
    const perPass = Math.max(1, Math.min(opts.max ?? 500, Math.ceil(Number(c.speed_per_hour || 50) / 6)));
    const { data: chans } = await db.from("mk_channel").select("*").in("id", (c.channel_ids as string[]) || []);
    const channels = ((chans || []) as Channel[]).map((ch) => room(ch)).filter((r) => r.ok).map((r) => r.ch);
    if (!channels.length) continue;
    /* A row that failed seconds ago is given a pass to cool off, so a
       transient fault is not retried inside the same minute. */
    const cool = new Date(Date.now() - 5 * 60_000).toISOString();
    const { data: rows } = await db.from("mk_send")
      .select("id, person_id, email, token, tries, last_try_at")
      .eq("campaign_id", c.id).eq("status", "queued")
      .or(`last_try_at.is.null,last_try_at.lt.${cool}`)
      .order("tries", { ascending: true })
      .limit(perPass);
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
      if (U.has(to)) { await db.from("mk_send").update({ status: "skipped", error: "unsubscribed" }).eq("id", r.id); out.skipped = (Number(out.skipped) || 0) + 1; continue; }
      const ch = channels[i++ % channels.length];
      const rm = room(ch);
      if (!rm.ok) { out.skipped = (Number(out.skipped) || 0) + 1; continue; }
      const p = r.person_id ? P.get(String(r.person_id)) ?? null : null;
      const subject = render(String(c.subject || ""), p, p?.company_id ? C.get(String(p.company_id)) ?? null : null, S);
      /**
       * THE VISIBLE LINK is a separate obligation from the header. Google
       * wants List-Unsubscribe; CAN-SPAM wants an opt-out a reader can see
       * and use inside the message. A campaign may turn the visible one off,
       * and the header still goes — but it should not, and the wizard says
       * so where the tick-box lives.
       */
      const showLink = (c as { show_unsub_link?: boolean }).show_unsub_link !== false;
      const bodyHtml = render(String(c.body_html || ""), p, p?.company_id ? C.get(String(p.company_id)) ?? null : null, S)
        + (showLink
          ? `<div style="margin-top:24px;font-size:11px;color:#8A94A0">Nandan GSE · <a href="${SITE}/api/marketing/u/${r.token}" style="color:#8A94A0">unsubscribe or pause</a></div>`
          : "")
        + `<img src="${SITE}/api/marketing/t/${r.token}" width="1" height="1" alt="" />`;
      try {
        if (ch.kind === "resend") await viaResend(ch, to, subject, bodyHtml, String(r.token));
        else if (ch.kind === "mailercloud") await viaMailercloud(ch, to, subject, bodyHtml, p?.full_name || null, `genie-${r.token}`, String(r.token));
        else await viaGmail(db, ch, to, subject, bodyHtml, String(r.token));
        await db.from("mk_send").update({ status: "sent", sent_at: new Date().toISOString(), channel_id: ch.id, error: null }).eq("id", r.id);
        rm.ch.sent_today += 1; rm.ch.sent_this_hour += 1;
        Object.assign(ch, rm.ch);
        await db.from("mk_channel").update({ sent_on: ch.sent_on, sent_today: ch.sent_today, sent_this_hour: ch.sent_this_hour, hour_mark: ch.hour_mark }).eq("id", ch.id);
        out.sent = (Number(out.sent) || 0) + 1;
        /* Keep under the provider's rate limit. Gmail is not an API key
           being counted, so it does not need the gap. */
        if (ch.kind !== "gmail" && PACE_MS > 0) await sleep(PACE_MS);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const mayPass = e instanceof SendError && e.retryable;
        const tries = Number((r as { tries?: number }).tries || 0) + 1;
        swallow("marketing/send", e);
        if (mayPass && tries < MAX_TRIES) {
          /* Back to the queue — the next pass will try again. */
          await db.from("mk_send").update({ status: "queued", tries, last_try_at: new Date().toISOString(), error: `attempt ${tries}: ${msg.slice(0, 240)}` }).eq("id", r.id);
          out.retrying = (Number(out.retrying) || 0) + 1;
          /* A rate limit is about the CHANNEL, not this message: stop the
             pass rather than spending the rest of it collecting 429s. */
          if (/\b429\b/.test(msg)) { out.ratelimited = 1; break; }
        } else {
          await db.from("mk_send").update({ status: "failed", tries, last_try_at: new Date().toISOString(), error: msg.slice(0, 300), channel_id: ch.id }).eq("id", r.id);
          out.failed = (Number(out.failed) || 0) + 1;
        }
      }
    }
  }
  return out;
}
