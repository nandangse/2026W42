import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * AISENSY — WhatsApp through an official Meta BSP (Dr Raghu, 8 Sep 2026:
 * "AI sensy can we try to integrate").
 *
 * Periskope drives a phone; AiSensy goes through Meta's own Business API,
 * which is the durable route and the reason for moving. Two things follow
 * from that and shape everything here:
 *
 *   1. TEMPLATE ONLY. There is no free-text send. You name a CAMPAIGN — a
 *      Meta-approved template that has been set Live in AiSensy — and pass
 *      its variables in order. A body of prose cannot be sent at all, so a
 *      queue row bound for AiSensy must carry a campaign and its params, not
 *      a sentence.
 *
 *   2. MEDIA IS FETCHED, NOT UPLOADED. `media: {url, filename}` — their
 *      servers go and GET the file. A payslip therefore must never be given
 *      a permanent public link; it wants a SIGNED url with a short life, so
 *      the document stops being reachable soon after it is delivered.
 *
 * Their published API is the one endpoint. Replies and delivery receipts are
 * not documented, so nothing here pretends to read them: a send is recorded
 * as sent, and if AiSensy later gives us a webhook the status can improve.
 */
export const AISENSY_URL = "https://backend.aisensy.com/campaign/t1/api/v2";

export interface AisensyCfg {
  paused?: string;
  url: string;
  apiKey: string;
  /** campaign name → used when a queue row does not name its own */
  defaultCampaign: string;
  perHour: number;
  perDay: number;
  gapSeconds: number;
}

/** Read the saved settings, or say plainly what is missing. */
export async function aisensyConfig(db: SupabaseClient): Promise<AisensyCfg | { error: string }> {
  const { data } = await db.from("integration_setting").select("config").eq("key", "aisensy").maybeSingle();
  const cfg = (data?.config || {}) as Record<string, string>;
  if (!cfg.api_key)
    return { error: "Paste the AiSensy API key in Settings → Integrations → AiSensy. It is on their dashboard under Manage → API Key." };
  const num = (v: unknown, fallback: number) => {
    const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
    return n > 0 ? n : fallback;
  };
  return {
    paused: String(cfg.paused ?? ""),
    url: String(cfg.url || AISENSY_URL).replace(/\/+$/, ""),
    apiKey: String(cfg.api_key),
    defaultCampaign: String(cfg.campaign || ""),
    perHour: num(cfg.per_hour, 100),
    perDay: num(cfg.per_day, 500),
    gapSeconds: num(cfg.gap_seconds, 3),
  };
}

/**
 * The number as AiSensy wants it: digits, with the country code.
 *
 * A bare ten-digit Indian mobile is refused at their end, and the refusal
 * reads like a bad key rather than a bad number — an hour spent debugging
 * the wrong thing. So it is fixed here, where the mistake is visible.
 */
export function destinationOf(phone: string): string {
  const d = String(phone || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length === 10) return `91${d}`;
  return d.replace(/^0+/, "");
}

export interface AisensySend {
  campaign: string;
  phone: string;
  /** shown to them as the recipient's name; AiSensy requires it */
  userName: string;
  /** the template's variables, IN THE ORDER the template declares them */
  params?: (string | number | null | undefined)[];
  media?: { url: string; filename: string } | null;
  tags?: string[];
}

export interface SendResult { ok: boolean; id?: string; error?: string }

/** One template message. Nothing is retried here — the queue owns that. */
export async function aisensySend(cfg: AisensyCfg, msg: AisensySend): Promise<SendResult> {
  const destination = destinationOf(msg.phone);
  if (!destination) return { ok: false, error: "no phone number on the record" };
  if (!msg.campaign) return { ok: false, error: "no AiSensy campaign named — set one in Settings → Integrations, or on the message" };

  const body: Record<string, unknown> = {
    apiKey: cfg.apiKey,
    campaignName: msg.campaign,
    destination,
    userName: msg.userName || destination,
    source: "genie",
  };
  // every variable a string: a number sent as a number comes back as a 400
  if (msg.params?.length) body.templateParams = msg.params.map((p) => String(p ?? ""));
  if (msg.media?.url) body.media = { url: msg.media.url, filename: msg.media.filename || "document.pdf" };
  if (msg.tags?.length) body.tags = msg.tags;

  try {
    const r = await fetch(cfg.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    const text = await r.text();
    let j: Record<string, unknown> = {};
    try { j = JSON.parse(text) as Record<string, unknown>; } catch { /* they sometimes answer in plain text */ }
    if (!r.ok) {
      /* Their errors are the useful part of this integration, so they are
         passed through whole rather than flattened to "failed". A campaign
         that is not Live, and a template awaiting Meta's approval, both come
         back here in their own words. */
      const said = String(j.message || j.error || text || "").slice(0, 400);
      return { ok: false, error: `AiSensy ${r.status}: ${said || "no reason given"}` };
    }
    return { ok: true, id: String(j.messageId || j.id || j.submitted_message_id || "") || undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Is AiSensy switched on and unpaused? */
export const aisensyReady = (cfg: AisensyCfg | { error: string }): cfg is AisensyCfg =>
  !("error" in cfg) && !/^(yes|true|1|on)$/i.test(String(cfg.paused ?? "").trim());
