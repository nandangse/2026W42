import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { crmDb, crmConfigured, CrmNotConfigured } from "@/crm/db";
import { variableValues, renderTemplate } from "@/crm/variables";
import { periskopeConfig, throttleState, periskopeSend, periskopeStatus } from "@/crm/periskope";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * THE WHATSAPP BUSINESS QUEUE (Dr Raghu, 31 Aug 2026):
 * "While creating it put into queue and when clicked and sent send it. After
 *  sending and its delivered put it into communication as Whatsapp Biz
 *  message."
 *
 * So the life of a message is three separate acts, and each is a different
 * call here — never one button that does all three:
 *
 *   create  → the personalised text is rendered and PARKED as 'queued'
 *   send    → a human releases it; the throttle is checked at THIS moment
 *   check   → Periskope is asked what became of it; only DELIVERED writes
 *             the Communication row, as a WhatsApp Biz message
 *
 * Delivery is not assumed from a successful send. Periskope answers "queued"
 * when it accepts a message, which says nothing about whether a phone ever
 * lit up — writing Communication then would be recording a conversation that
 * may not have happened.
 */

const missing = (m: string) => /wa_queue|does not exist|schema cache/i.test(m);
const BOSS = ["admin", "ceo", "sales_head"];

/** GET — the queue, and where the three ceilings currently stand. */
export async function GET(req: Request) {
  try {
    const me = await requireCrm();
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    const db = crmDb();
    const u = new URL(req.url);
    const status = String(u.searchParams.get("status") || "");

    let qy = db.from("wa_queue")
      .select("id, phone, person_id, company_id, opportunity_id, template_name, body, status, error, external_id, batch_id, queued_by, queued_at, sent_at, delivered_at")
      .order("queued_at", { ascending: false }).limit(500);
    if (status && status !== "all") qy = qy.eq("status", status);
    // Everyone sees their own; the bosses see the whole queue.
    if (!BOSS.includes(String(me.crmRole))) qy = qy.eq("queued_by", me.profileId);

    const { data, error } = await qy;
    if (error) {
      if (missing(error.message)) return NextResponse.json({ installed: false, rows: [], throttle: null });
      throw new HttpError(500, error.message);
    }

    // Names, so the queue reads as people rather than uuids.
    const rows = data ?? [];
    const pids = [...new Set(rows.map((r) => r.person_id).filter(Boolean).map(String))];
    const names = new Map<string, string>();
    if (pids.length) {
      const { data: ppl } = await db.from("person").select("id, full_name").in("id", pids);
      for (const p of ppl ?? []) names.set(String(p.id), String(p.full_name || ""));
    }

    const cfg = await periskopeConfig(db);
    const throttle = "error" in cfg ? null : await throttleState(db, cfg);
    return NextResponse.json({
      installed: true,
      configured: !("error" in cfg),
      configError: "error" in cfg ? cfg.error : null,
      throttle,
      rows: rows.map((r) => ({ ...r, person_name: r.person_id ? names.get(String(r.person_id)) ?? null : null })),
    });
  } catch (e) {
    return errJson(e);
  }
}

export async function POST(req: Request) {
  try {
    const me = await requireCrm();
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    const db = crmDb();
    const body = await req.json();
    const action = String(body.action || "");

    /**
     * CREATE — personalise and park. Nothing leaves the building here.
     *
     * { action: "create", template?, body, recipients: [{ phone, person_id?,
     *   company_id?, opportunity_id? }] }
     *
     * The {{variables}} are rendered PER RECIPIENT and the finished text is
     * stored, so what was reviewed in the queue is exactly what goes out —
     * not a template that might render differently an hour later.
     */
    if (action === "create") {
      const raw = String(body.body || "").trim();
      if (!raw) throw new HttpError(400, "A message, please.");
      const list = Array.isArray(body.recipients) ? body.recipients : [];
      if (!list.length) throw new HttpError(400, "Nobody to send it to.");
      if (list.length > 500) throw new HttpError(400, "500 at a time is the most this queue will take in one go.");

      const batch = crypto.randomUUID();
      const rows: Record<string, unknown>[] = [];
      const skipped: string[] = [];
      for (const r of list) {
        const phone = String(r.phone ?? "").replace(/\D/g, "");
        if (phone.length < 8) { skipped.push(String(r.phone ?? "(blank)")); continue; }
        let text = raw;
        try {
          const vals = await variableValues({
            personId: r.person_id ?? null, companyId: r.company_id ?? null,
            opportunityId: r.opportunity_id ?? null, quotationId: r.quotation_id ?? null,
          });
          text = renderTemplate(raw, vals);
        } catch { /* an unresolvable variable must not lose the message */ }
        rows.push({
          phone, body: text,
          template_name: String(body.template || "").slice(0, 120),
          person_id: r.person_id ?? null, company_id: r.company_id ?? null,
          opportunity_id: r.opportunity_id ?? null, quotation_id: r.quotation_id ?? null,
          lead_id: r.lead_id ?? null,
          batch_id: batch, queued_by: me.profileId, status: "queued",
        });
      }
      if (!rows.length) throw new HttpError(400, "No usable phone number among them.");
      const { error } = await db.from("wa_queue").insert(rows);
      if (error) {
        if (missing(error.message)) throw new HttpError(503, "Run CRM migration 0049 first — the WhatsApp queue has nowhere to live yet.");
        throw new HttpError(500, error.message);
      }
      return NextResponse.json({ ok: true, queued: rows.length, skipped, batch_id: batch });
    }

    /**
     * SEND — one message, released by a hand. The ceilings are checked HERE,
     * against the table, because a limit checked in the screen is a limit a
     * second tab walks through.
     */
    if (action === "send") {
      const id = String(body.id || "");
      if (!id) throw new HttpError(400, "Which message?");
      const cfg = await periskopeConfig(db);
      if ("error" in cfg) throw new HttpError(400, cfg.error);

      const t = await throttleState(db, cfg);
      if (t.blocked) return NextResponse.json({ ok: false, throttled: true, reason: t.blocked, throttle: t }, { status: 429 });

      const { data: row } = await db.from("wa_queue").select("*").eq("id", id).maybeSingle();
      if (!row) throw new HttpError(404, "That message is not in the queue.");
      if (row.status !== "queued") throw new HttpError(400, `That message is already ${row.status}.`);
      if (!BOSS.includes(String(me.crmRole)) && String(row.queued_by) !== String(me.profileId))
        throw new HttpError(403, "That one is somebody else's to send.");

      // Claimed first, so two clicks cannot send it twice.
      const { data: claimed } = await db.from("wa_queue")
        .update({ status: "sending" }).eq("id", id).eq("status", "queued").select("id").maybeSingle();
      if (!claimed) throw new HttpError(409, "Someone just sent that one.");

      const res = await periskopeSend(cfg, String(row.phone), String(row.body));
      if (!res.ok) {
        await db.from("wa_queue").update({ status: "failed", error: String(res.error || "").slice(0, 500) }).eq("id", id);
        return NextResponse.json({ ok: false, error: res.error }, { status: 502 });
      }
      await db.from("wa_queue").update({
        status: "sent", external_id: res.uniqueId ?? null, sent_at: new Date().toISOString(), error: "",
      }).eq("id", id);
      const after = await throttleState(db, cfg);
      return NextResponse.json({ ok: true, unique_id: res.uniqueId, throttle: after });
    }

    /**
     * CHECK — ask Periskope what became of the sent ones, and write the
     * delivered ones into Communication as a WhatsApp Biz message. Exactly
     * once: the queue row keeps the message id it wrote.
     */
    if (action === "check") {
      const cfg = await periskopeConfig(db);
      if ("error" in cfg) throw new HttpError(400, cfg.error);
      const ids: string[] = Array.isArray(body.ids) ? body.ids.map(String) : [];
      let qy = db.from("wa_queue").select("*").eq("status", "sent").not("external_id", "is", null).limit(100);
      if (ids.length) qy = db.from("wa_queue").select("*").in("id", ids).eq("status", "sent").not("external_id", "is", null);
      const { data: pending } = await qy;

      let delivered = 0, failed = 0, waiting = 0;
      for (const row of pending ?? []) {
        const st = await periskopeStatus(cfg, String(row.external_id));
        if (st.failed) {
          await db.from("wa_queue").update({ status: "failed", error: `Periskope: ${st.status}` }).eq("id", row.id);
          failed++;
          continue;
        }
        if (!st.delivered) { waiting++; continue; }

        // IT ARRIVED — now, and only now, it becomes Communication.
        const at = new Date().toISOString();
        let messageId: string | null = row.message_id ? String(row.message_id) : null;
        if (!messageId) {
          const { data: msg } = await db.from("message").insert({
            channel: "whatsapp",
            direction: "outbound",
            external_id: String(row.external_id),
            subject: "WhatsApp Biz message",
            body_text: String(row.body),
            to_handles: [String(row.phone)],
            occurred_at: at,
            company_id: row.company_id, person_id: row.person_id,
            opportunity_id: row.opportunity_id, lead_id: row.lead_id,
          }).select("id").maybeSingle();
          messageId = msg?.id ? String(msg.id) : null;
        }
        // And on the record's own ledger, in the words he asked for.
        await db.from("interaction").insert({
          kind: "SMS or Whatsapp", happened_at: at, by_id: row.queued_by,
          remark: `WhatsApp Biz message delivered — ${String(row.body).slice(0, 300)}`,
          company_id: row.company_id, person_id: row.person_id,
          opportunity_id: row.opportunity_id, quotation_id: row.quotation_id, lead_id: row.lead_id,
        }).then(() => null, () => null);

        await db.from("wa_queue").update({ status: "delivered", delivered_at: at, message_id: messageId }).eq("id", row.id);
        delivered++;
      }
      return NextResponse.json({ ok: true, delivered, failed, waiting, checked: (pending ?? []).length });
    }

    /** CANCEL — a queued message that should never go. */
    if (action === "cancel") {
      const id = String(body.id || "");
      if (!id) throw new HttpError(400, "Which message?");
      const { error } = await db.from("wa_queue").update({ status: "cancelled" }).eq("id", id).eq("status", "queued");
      if (error) throw new HttpError(500, error.message);
      return NextResponse.json({ ok: true });
    }

    throw new HttpError(400, "Unknown action.");
  } catch (e) {
    return errJson(e);
  }
}
