import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * PERISKOPE — the WhatsApp Business door (Dr Raghu, 31 Aug 2026).
 *
 * Written against their published API rather than guessed at:
 *   POST {base}/message/send      { chat_id, message }
 *     headers: Authorization: Bearer <api_key> · x-phone: <sending number>
 *     answers { status:"queued", unique_id, queue_id, … }
 *   GET  {base}/message/{unique_id}/status
 *     answers { status, ack, delivered_count, read_count, timeline{…} }
 *
 * Note what "queued" means on their side: accepting a message is NOT
 * delivering it. That is exactly why the row here does not go to Communication
 * until their status says so — see markDelivered's caller.
 */

export const PERISKOPE_BASE = "https://api.periskope.app/v1";

/** His ceilings, and the numbers used when the boxes are left empty. */
export const THROTTLE_DEFAULTS = { per_hour: 100, per_day: 500, gap_seconds: 10 };

/** "ok the whatsapp is restricted now!" (Dr Raghu, 5 Sep 2026) — one switch on the card that stops every send, cron or hand. */
export const isPaused = (cfg: { paused?: string | boolean | null }) => /^(yes|true|1|on)$/i.test(String(cfg.paused ?? "").trim());

export interface PeriskopeCfg {
  paused?: string;
  base: string;
  apiKey: string;
  phone: string;
  perHour: number;
  perDay: number;
  gapSeconds: number;
}

/** Read the saved settings, or say plainly what is missing. */
export async function periskopeConfig(db: SupabaseClient): Promise<PeriskopeCfg | { error: string }> {
  const { data } = await db.from("integration_setting").select("config").eq("key", "periskope").maybeSingle();
  const cfg = (data?.config || {}) as Record<string, string>;
  if (!cfg.api_key) return { error: "Paste the Periskope API key in Settings → Integrations first." };
  if (!cfg.phone) return { error: "Periskope needs the sending WhatsApp number (Settings → Integrations → Periskope → phone). It travels as the x-phone header, so nothing sends without it." };

  /**
   * THE COUNTRY CODE (Dr Raghu, 31 Aug 2026, having saved 9653671322).
   *
   * Periskope reads x-phone as the number WITH its country code — their own
   * example is 919876512340. A bare ten-digit Indian mobile is refused at
   * their end, and the refusal comes back looking like a bad key rather than
   * a bad number, which is a long hour of debugging the wrong thing. Better
   * to say it here, in words, before anything is sent.
   */
  const digits = String(cfg.phone).replace(/\D/g, "");
  if (digits.length <= 10) {
    return { error: `The Periskope number reads ${digits} — that is missing its country code. Periskope wants it as 91${digits}, with the code and no symbols. Settings → Integrations → Periskope → phone.` };
  }
  const num = (v: unknown, fallback: number) => {
    const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
    return n > 0 ? n : fallback;
  };
  return {
    paused: String(cfg.paused ?? ""),
    base: String(cfg.base_url || PERISKOPE_BASE).replace(/\/+$/, ""),
    apiKey: String(cfg.api_key),
    phone: String(cfg.phone).replace(/\D/g, ""),
    perHour: num(cfg.per_hour, THROTTLE_DEFAULTS.per_hour),
    perDay: num(cfg.per_day, THROTTLE_DEFAULTS.per_day),
    gapSeconds: num(cfg.gap_seconds, THROTTLE_DEFAULTS.gap_seconds),
  };
}

export interface ThrottleState {
  sentLastHour: number;
  sentToday: number;
  secondsSinceLast: number | null;
  perHour: number;
  perDay: number;
  gapSeconds: number;
  /** Null when clear to send; otherwise the reason, in words. */
  blocked: string | null;
  /** How long to wait, when the block is only a matter of time. */
  waitSeconds: number;
}

/**
 * THE THROTTLE, counted off the queue's own history.
 *
 * Deliberately measured against the TABLE rather than a counter in memory: a
 * serverless function is not one process, and a limit held in a variable is a
 * limit that resets whenever the platform feels like it. The day is IST,
 * because that is the day the person sending them lives in.
 */
/**
 * The three ceilings, whoever set them. AiSensy and Periskope both carry
 * perHour / perDay / gapSeconds and nothing else here is read, so the
 * throttle is written against the SHAPE rather than against one provider —
 * a queue that could only count Periskope's messages would stop counting on
 * the day the road changed (Dr Raghu, 9 Sep 2026: "ignore Periskope for
 * now, it has been delinked").
 */
export interface Ceilings { perHour: number; perDay: number; gapSeconds: number }

export async function throttleState(db: SupabaseClient, cfg: Ceilings): Promise<ThrottleState> {
  const now = Date.now();
  const hourAgo = new Date(now - 3600_000).toISOString();
  // Midnight IST, expressed as an instant.
  const istNow = new Date(now + 5.5 * 3600_000);
  const istMidnight = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate()) - 5.5 * 3600_000;

  const counted = ["sent", "delivered"];
  const [{ count: hourCount }, { count: dayCount }, { data: last }] = await Promise.all([
    db.from("wa_queue").select("*", { count: "exact", head: true }).in("status", counted).gte("sent_at", hourAgo),
    db.from("wa_queue").select("*", { count: "exact", head: true }).in("status", counted).gte("sent_at", new Date(istMidnight).toISOString()),
    db.from("wa_queue").select("sent_at").in("status", counted).not("sent_at", "is", null).order("sent_at", { ascending: false }).limit(1),
  ]);

  const sentLastHour = hourCount ?? 0;
  const sentToday = dayCount ?? 0;
  const lastAt = last?.[0]?.sent_at ? new Date(String(last[0].sent_at)).getTime() : null;
  const secondsSinceLast = lastAt === null ? null : Math.floor((now - lastAt) / 1000);

  let blocked: string | null = null;
  let waitSeconds = 0;
  if (sentToday >= cfg.perDay) {
    blocked = `The day's ceiling is reached — ${sentToday} of ${cfg.perDay} sent since midnight. The rest waits for tomorrow.`;
  } else if (sentLastHour >= cfg.perHour) {
    blocked = `The hour's ceiling is reached — ${sentLastHour} of ${cfg.perHour} sent in the last hour.`;
    waitSeconds = 60;
  } else if (secondsSinceLast !== null && secondsSinceLast < cfg.gapSeconds) {
    waitSeconds = cfg.gapSeconds - secondsSinceLast;
    blocked = `${waitSeconds}s to go — messages stand at least ${cfg.gapSeconds}s apart.`;
  }
  return { sentLastHour, sentToday, secondsSinceLast, perHour: cfg.perHour, perDay: cfg.perDay, gapSeconds: cfg.gapSeconds, blocked, waitSeconds };
}

/** A phone as Periskope wants it for a one-to-one chat. */
export const chatId = (phone: string) => `${String(phone).replace(/\D/g, "")}@c.us`;

export interface WaMessage { at: string; from_me: boolean; text: string; status: string | null; id: string }

/**
 * The WhatsApp thread with one number, newest first — what HRMS reads when
 * F&F asks to "pull all communication with HR" (4 Sep 2026). Periskope's
 * route is GET /chats/{chat_id}/messages; the two guessed paths before it
 * answered "Invalid route". ack: 1 sent · 2 delivered · 3 read.
 */
export async function periskopeMessages(cfg: PeriskopeCfg, phone: string, limit = 200): Promise<{ messages: WaMessage[]; error?: string }> {
  const digits = String(phone).replace(/\D/g, "");
  const full = digits.length <= 10 ? `91${digits}` : digits;
  try {
    const r = await fetch(`${cfg.base}/chats/${encodeURIComponent(chatId(full))}/messages?limit=${limit}`, {
      headers: { authorization: `Bearer ${cfg.apiKey}`, "x-phone": cfg.phone },
    });
    const j = await r.json().catch(() => null) as { messages?: Record<string, unknown>[]; message?: string } | null;
    if (!r.ok) return { messages: [], error: `Periskope answered ${r.status}${j?.message ? `: ${j.message}` : ""}` };
    const ACK: Record<string, string> = { "0": "pending", "1": "sent", "2": "delivered", "3": "read", "4": "played" };
    const messages = (j?.messages || []).map((m) => ({
      id: String(m.message_id || m.id || ""),
      at: String(m.timestamp || ""),
      from_me: !!m.from_me,
      text: String(m.body || (m.has_media ? `[${String(m.message_type || "media")}]` : "")),
      status: m.ack != null ? ACK[String(m.ack)] || String(m.ack) : null,
    })).filter((m) => m.text);
    return { messages };
  } catch (e) {
    return { messages: [], error: e instanceof Error ? e.message : String(e) };
  }
}

export interface SendResult { ok: boolean; uniqueId?: string; error?: string }

/** Hand one message to Periskope. Their "queued" means accepted, not arrived. */
export async function periskopeSend(cfg: PeriskopeCfg, phone: string, message: string): Promise<SendResult> {
  try {
    const r = await fetch(`${cfg.base}/message/send`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${cfg.apiKey}`,
        "x-phone": cfg.phone,
        "content-type": "application/json",
      },
      body: JSON.stringify({ chat_id: chatId(phone), message }),
    });
    const j = await r.json().catch(() => null) as { unique_id?: string; message?: string; error?: string } | null;
    if (!r.ok) return { ok: false, error: j?.message || j?.error || `Periskope answered ${r.status}` };
    const uniqueId = j?.unique_id ? String(j.unique_id) : undefined;
    if (!uniqueId) return { ok: false, error: "Periskope accepted it but named no unique_id, so it could never be traced to delivery." };
    return { ok: true, uniqueId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface StatusResult { status: string; delivered: boolean; failed: boolean; error?: string }

/** Ask Periskope what became of one message. */
export async function periskopeStatus(cfg: PeriskopeCfg, uniqueId: string): Promise<StatusResult> {
  try {
    const r = await fetch(`${cfg.base}/message/${encodeURIComponent(uniqueId)}/status`, {
      headers: { authorization: `Bearer ${cfg.apiKey}`, "x-phone": cfg.phone },
    });
    const j = await r.json().catch(() => null) as { status?: string; ack?: number; delivered_count?: number; read_count?: number } | null;
    if (!r.ok) return { status: "unknown", delivered: false, failed: false, error: `Periskope answered ${r.status}` };
    const status = String(j?.status || "unknown").toLowerCase();
    // Delivered OR read both mean it reached the person; WhatsApp's own ack
    // is 2 for delivered and 3/4 for read, and the counts say the same thing
    // a different way. Any of them is enough.
    const delivered = /deliver|read/.test(status)
      || Number(j?.ack) >= 2
      || Number(j?.delivered_count) > 0
      || Number(j?.read_count) > 0;
    const failed = /fail|error|undeliver/.test(status);
    return { status, delivered, failed };
  } catch (e) {
    return { status: "unknown", delivered: false, failed: false, error: e instanceof Error ? e.message : String(e) };
  }
}
