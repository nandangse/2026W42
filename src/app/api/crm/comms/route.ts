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

    const { data: ints, error: ierr } = await db.from("interaction")
      .select("id, kind, call_type, result, happened_at, by_id, person_name, remark, next_action, next_action_on")
      .eq(fk.interaction, id)
      .order("happened_at", { ascending: false })
      .limit(300);
    if (ierr) throw new HttpError(500, ierr.message);

    let msgs: Record<string, unknown>[] = [];
    if (fk.message) {
      const { data } = await db.from("message")
        .select("id, channel, direction, subject, body_text, from_handle, occurred_at")
        .eq(fk.message, id)
        .order("occurred_at", { ascending: false })
        .limit(300);
      msgs = (data ?? []) as Record<string, unknown>[];
    }

    const profileIds = [...new Set((ints ?? []).map((r) => r.by_id).filter(Boolean).map(String))];
    const names = new Map<string, string>();
    if (profileIds.length) {
      const { data: profs } = await db.from("profile").select("id, full_name").in("id", profileIds);
      for (const p of profs ?? []) names.set(String(p.id), String(p.full_name));
    }

    const feed = [
      ...(ints ?? []).map((r) => ({
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
        text: m.subject ? `${m.subject}${m.body_text ? " — " + String(m.body_text).slice(0, 300) : ""}` : String(m.body_text ?? "").slice(0, 300),
        next_action: null,
        next_action_on: null,
      })),
    ].sort((a, b) => String(b.at).localeCompare(String(a.at)));

    return NextResponse.json({ feed: feed.slice(0, 300), total: feed.length });
  } catch (e) {
    return errJson(e);
  }
}
