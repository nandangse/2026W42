import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { crmDb, crmConfigured, CrmNotConfigured } from "@/crm/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/comms?type=<doctype>&id=<uuid>
 *
 * ALL the communication on a record, together — calls, WhatsApp, email,
 * visits, video calls — one feed, newest first. Reads the 74k imported
 * interactions and the unified message table; when the channels phase wires
 * live mail and WhatsApp in, they land here without this route changing.
 */
const FK: Record<string, { interaction: string; message: string | null }> = {
  company: { interaction: "company_id", message: "company_id" },
  person: { interaction: "person_id", message: "person_id" },
  lead: { interaction: "lead_id", message: "lead_id" },
  opportunity: { interaction: "opportunity_id", message: "opportunity_id" },
  quotation: { interaction: "quotation_id", message: null },
  sales_order: { interaction: "sales_order_id", message: null },
};

export async function GET(req: Request) {
  try {
    await requireCrm();
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    const db = crmDb();
    const u = new URL(req.url);
    const type = u.searchParams.get("type") || "";
    const id = u.searchParams.get("id") || "";
    const fk = FK[type];
    if (!fk || !id) throw new HttpError(400, "Which record? comms needs type and id.");

    // THE TRANSFER (Dr Raghu, 29 Aug 2026): a quotation made from an
    // opportunity carries its communication — the quotation's feed is the
    // union of its own and its opportunity's.
    let oppId: string | null = null;
    if (type === "quotation") {
      const { data: q } = await db.from("quotation").select("opportunity_id").eq("id", id).maybeSingle();
      oppId = q?.opportunity_id ? String(q.opportunity_id) : null;
    }

    const { data: ints, error: ierr } = await db.from("interaction")
      .select("id, kind, call_type, result, happened_at, by_id, person_name, remark, next_action, next_action_on")
      .eq(fk.interaction, id)
      .order("happened_at", { ascending: false })
      .limit(300);
    if (ierr) throw new HttpError(500, ierr.message);
    const intsAll = [...(ints ?? [])];
    if (oppId) {
      const { data: oi } = await db.from("interaction")
        .select("id, kind, call_type, result, happened_at, by_id, person_name, remark, next_action, next_action_on")
        .eq("opportunity_id", oppId)
        .order("happened_at", { ascending: false })
        .limit(300);
      const have = new Set(intsAll.map((r) => String(r.id)));
      for (const r of oi ?? []) if (!have.has(String(r.id))) intsAll.push(r);
    }

    let msgs: Record<string, unknown>[] = [];
    if (fk.message || oppId) {
      let mq = db.from("message")
        .select("id, channel, direction, subject, body_text, from_handle, to_handles, occurred_at, thread_key, raw_payload")
        .order("occurred_at", { ascending: false })
        .limit(300);
      if (fk.message && oppId) mq = mq.or(`${fk.message}.eq.${id},opportunity_id.eq.${oppId}`);
      else if (fk.message) mq = mq.eq(fk.message, id);
      else mq = mq.eq("opportunity_id", oppId as string);
      const { data } = await mq;
      msgs = (data ?? []) as Record<string, unknown>[];
    }

    const profileIds = [...new Set(intsAll.map((r) => r.by_id).filter(Boolean).map(String))];
    const names = new Map<string, string>();
    if (profileIds.length) {
      const { data: profs } = await db.from("profile").select("id, full_name").in("id", profileIds);
      for (const p of profs ?? []) names.set(String(p.id), String(p.full_name));
    }

    const feed = [
      ...intsAll.map((r) => ({
        kind: "interaction" as const,
        at: r.happened_at,
        type: r.kind || r.call_type || "Interaction",
        by: r.by_id ? names.get(String(r.by_id)) ?? null : null,
        with: r.person_name,
        result: r.result,
        text: r.remark,
        next_action: r.next_action,
        next_action_on: r.next_action_on,
      })),
      ...msgs.map((m) => ({
        kind: "message" as const,
        at: m.occurred_at,
        type: `${m.channel} ${m.direction}`,
        channel: m.channel,
        direction: m.direction,
        by: m.from_handle ? String(m.from_handle) : null,
        with: null,
        result: null,
        text: String(m.body_text ?? "").slice(0, 4000),
        // everything a Reply needs to thread like Gmail does
        subject: m.subject ? String(m.subject) : null,
        from_handle: m.from_handle ? String(m.from_handle) : null,
        to_handles: (m.to_handles as string[] | null) ?? null,
        thread_key: m.thread_key ? String(m.thread_key) : null,
        rfc_message_id: (m.raw_payload as { rfc_message_id?: string } | null)?.rfc_message_id ?? null,
        next_action: null,
        next_action_on: null,
      })),
    ].sort((a, b) => String(b.at).localeCompare(String(a.at)));

    return NextResponse.json({ feed: feed.slice(0, 300), total: feed.length });
  } catch (e) {
    return errJson(e);
  }
}
