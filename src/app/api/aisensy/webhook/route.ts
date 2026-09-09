import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { crmDb, crmConfigured } from "@/crm/db";

export const dynamic = "force-dynamic";
/**
 * Their rule, quoted: "It is expected to receive 2xx response from Webhook
 * endpoint within 5s, otherwise it will be marked failed" — and "having more
 * than 100 failed delivery attempts in 20 minutes will cause temporary
 * disabling of the webhook". So this route is short on purpose. Nothing here
 * calls out to another service.
 */
export const maxDuration = 20;

/**
 * POST /api/aisensy/webhook — what happened to a WhatsApp message after we
 * sent it, and what came back (Dr Raghu sent the Project Webhook reference,
 * 9 Sep 2026).
 *
 * No login: the caller is AiSensy, and the proof is the X-AiSensy-Signature
 * header — HMAC-SHA256 of the raw body with the shared secret saved in
 * CRM → Integrations → AiSensy. A call that does not verify is answered 401
 * and dropped, never processed "just in case".
 *
 * THE FOUR RULES THEIR SPECIFICATION IMPOSES, each answered here:
 *
 *   "Notification will be delivered AT LEAST ONE TIME." So a repeat must be
 *   harmless. Every notification is written to wa_webhook_event by its own
 *   id first; a second arrival finds the row and stops.
 *
 *   "You may not always receive the webhooks IN THE ORDER they occur." So a
 *   `sent` can land after a `read`. Status only ever climbs the ladder —
 *   the timestamps are each written where they belong, but the status field
 *   is never walked backwards.
 *
 *   "Acknowledge its reception synchronously and immediately." Two writes,
 *   no outbound calls, and an unknown topic is acknowledged rather than
 *   argued with.
 *
 *   "Do not parse or cast the webhook request body" when signing. The raw
 *   text is what is verified — though their own Node example signs
 *   JSON.stringify(parsed), so both spellings are accepted. Refusing a
 *   genuine notification over a re-serialisation is worse than allowing a
 *   form of the same bytes.
 *
 * A 410 would make them disable the subscription permanently, so it is
 * never returned. Anything we cannot use is a 200.
 */

/** The ladder. A status never moves left. */
const RANK: Record<string, number> = {
  queued: 0, sending: 1, sent: 2, delivered: 3, read: 4, failed: 5, cancelled: 5,
};

const eq = (a: string, b: string) => {
  const x = Buffer.from(a || "", "utf8"), y = Buffer.from(b || "", "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Their timestamps are milliseconds; a zero is not a date. */
const at = (v: unknown): string | null => {
  const n = Number(v);
  if (!n || !Number.isFinite(n)) return null;
  return new Date(n < 1e12 ? n * 1000 : n).toISOString();
};

export async function POST(req: Request) {
  const raw = await req.text();

  if (!crmConfigured()) return NextResponse.json({ error: "CRM not configured" }, { status: 503 });
  const crm = crmDb();

  const { data: row } = await crm.from("integration_setting").select("config").eq("key", "aisensy").maybeSingle();
  const cfg = (row?.config || {}) as Record<string, string>;
  const secret = String(cfg.webhook_secret || "");
  if (!secret)
    return NextResponse.json({ error: "No webhook_secret saved — CRM → Settings → Integrations → AiSensy." }, { status: 503 });

  const sent = String(req.headers.get("x-aisensy-signature") || "");
  const mine = createHmac("sha256", secret).update(raw).digest("hex");
  let ok = eq(sent, mine);
  if (!ok) {
    // Their own example signs JSON.stringify(req.body). Same bytes, usually.
    try {
      const again = createHmac("sha256", secret).update(JSON.stringify(JSON.parse(raw))).digest("hex");
      ok = eq(sent, again);
    } catch { /* not json — then it was never going to verify */ }
  }
  if (!ok) return NextResponse.json({ error: "signature" }, { status: 401 });

  let body: Record<string, unknown> = {};
  try { body = JSON.parse(raw) as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: true, ignored: "not json" }); }

  const id = String(body.id || "");
  const topic = String(body.topic || "");
  const data = (body.data || {}) as Record<string, unknown>;

  // ---- at least once: the same notification twice must do nothing ---------
  if (id) {
    const { error } = await crm.from("wa_webhook_event").insert({
      id, topic,
      attempt: Number(body.delivery_attempt) || null,
      project_id: String(body.project_id || "") || null,
      payload: body,
    });
    // 23505 = we have seen this exact notification before. Acknowledge and stop.
    if (error && String(error.code) === "23505") return NextResponse.json({ ok: true, repeat: true });
    if (error && !/wa_webhook_event|does not exist|schema cache/i.test(error.message))
      return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const msg = (data.message || {}) as Record<string, unknown>;

  try {
    // ---- somebody wrote to us ------------------------------------------
    if (topic === "message.sender.user") {
      const contact = (data.contact || {}) as Record<string, unknown>;
      const content = (msg.message_content || {}) as Record<string, unknown>;
      await crm.from("wa_inbound").upsert({
        message_id: String(msg.messageId || msg.id || "") || null,
        phone: String(msg.phone_number || contact.phone_number || ""),
        contact_name: String(contact.name || "") || null,
        contact_id: String(msg.contact_id || contact.id || "") || null,
        // Their message_content shape varies by message_type, so the whole
        // payload is kept and only the obvious text is lifted out. A guess at
        // a nested field name would fail silently on every other type.
        body: String(content.text || content.body || content.caption || ""),
        message_type: String(msg.message_type || "") || null,
        campaign: String(((msg.campaign || {}) as Record<string, unknown>).name || "") || null,
        sent_at: at(msg.sent_at),
        raw: msg,
      }, { onConflict: "message_id" });
      return NextResponse.json({ ok: true, topic });
    }

    // ---- what happened to what we sent ----------------------------------
    const STATUS_TOPICS = new Set([
      "message.status.updated", "contact.campaign.sent",
      "contact.campaign.delivered", "contact.campaign.read",
    ]);
    if (STATUS_TOPICS.has(topic)) {
      const external = String(msg.messageId || msg.id || "");
      if (!external) return NextResponse.json({ ok: true, ignored: "no message id" });

      let { data: q } = await crm.from("wa_queue")
        .select("id, status").eq("external_id", external).maybeSingle();

      /**
       * THE SEND MAY NOT HAVE GIVEN US AN ID.
       *
       * Their send reference documents only "a status of 200" — no message
       * id is promised in the response, so external_id can legitimately be
       * null on a row we really did send. Matching solely on it would make
       * every receipt "unmatched" and the whole webhook decorative.
       *
       * So: fall back to the most recent AiSensy row for the same number
       * still sitting at 'sent', within a week, and STAMP the id onto it —
       * once. From then on the row matches directly, and the next receipt
       * for the same message finds it by id rather than by guesswork.
       *
       * Last ten digits, because what we queued and what they report are
       * not always written with the same country prefix.
       */
      if (!q) {
        const tail = String(msg.phone_number || "").replace(/\D/g, "").slice(-10);
        if (tail) {
          const week = new Date(Date.now() - 7 * 86400000).toISOString();
          const { data: cand } = await crm.from("wa_queue")
            .select("id, status, phone, external_id")
            .eq("provider", "aisensy").eq("status", "sent").is("external_id", null)
            .gte("sent_at", week).order("sent_at", { ascending: false }).limit(50);
          const hit = (cand || []).find((c) => String(c.phone || "").replace(/\D/g, "").endsWith(tail));
          if (hit) {
            await crm.from("wa_queue").update({ external_id: external }).eq("id", hit.id);
            q = { id: hit.id, status: hit.status };
          }
        }
      }

      // A status for a message Genie did not send — a broadcast from their
      // dashboard, say. Recorded in the event ledger above, nothing to update.
      if (!q) return NextResponse.json({ ok: true, unmatched: true });

      const said = String(msg.status || "").toLowerCase();
      const next =
        topic === "contact.campaign.read" || said === "read" ? "read"
        : topic === "contact.campaign.delivered" || said === "delivered" ? "delivered"
        : said === "failed" ? "failed"
        : "sent";

      const patch: Record<string, unknown> = {};
      const d = at(msg.delivered_at), r = at(msg.read_at), f = at(msg.failed_at), s = at(msg.sent_at);
      if (d) patch.delivered_at = d;
      if (r) patch.read_at = r;
      if (f) patch.failed_at = f;
      if (s) patch.sent_at = s;
      if (next === "failed") {
        const fr = (msg.failureResponse || {}) as Record<string, unknown>;
        patch.error = [fr.code, fr.reason].filter(Boolean).join(": ").slice(0, 400) || "AiSensy reported a failure";
        if (!patch.failed_at) patch.failed_at = new Date().toISOString();
      }
      // Out of order is expected. Never walk the ladder backwards.
      if ((RANK[next] ?? 0) > (RANK[String(q.status)] ?? 0)) patch.status = next;
      if (Object.keys(patch).length) await crm.from("wa_queue").update(patch).eq("id", q.id);
      return NextResponse.json({ ok: true, topic, status: patch.status ?? q.status });
    }
  } catch (e) {
    // A 5xx has them retry in five minutes, which is right for a genuine
    // fault — but the notification is already in the ledger, so the retry
    // will be recognised as a repeat and dropped. Say what broke instead.
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }

  // Contact and payment topics are acknowledged, not acted on. A 410 would
  // make AiSensy disable the subscription for good.
  return NextResponse.json({ ok: true, noted: topic });
}
