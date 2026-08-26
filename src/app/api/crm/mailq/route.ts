import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { crmDb, crmConfigured, CrmNotConfigured } from "@/crm/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/mailq?sender=&limit= — the email queue.
 * Admin eyes (admin / ceo / sales_head) see every sender, one by one or all;
 * everyone else sees only what they sent. Enforced here, not in the screen.
 */
export async function GET(req: Request) {
  try {
    const user = await requireCrm();
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    const db = crmDb();
    const u = new URL(req.url);
    const isBoss = ["admin", "ceo", "sales_head"].includes(user.crmRole);
    const senderParam = u.searchParams.get("sender");
    const sender = isBoss ? (senderParam || null) : user.profileId;

    let qy = db.from("message")
      .select("id, direction, subject, body_text, from_handle, to_handles, occurred_at, attachments, agent_profile_id, company_id, person_id, opportunity_id, lead_id", { count: "exact" })
      .eq("channel", "email")
      .order("occurred_at", { ascending: false })
      .limit(Math.min(500, Number(u.searchParams.get("limit")) || 100));
    if (sender) qy = qy.eq("agent_profile_id", sender);
    const { data, error, count } = await qy;
    if (error) throw new HttpError(500, error.message);

    const rows = data ?? [];
    const pids = [...new Set(rows.map((r) => r.agent_profile_id).filter(Boolean).map(String))];
    const names = new Map<string, string>();
    if (pids.length) {
      const { data: profs } = await db.from("profile").select("id, full_name").in("id", pids);
      for (const p of profs ?? []) names.set(String(p.id), String(p.full_name));
    }
    const { data: senders } = isBoss
      ? await db.from("mailbox").select("profile_id, email_address").eq("credential_kind", "oauth_refresh_token")
      : { data: [] };
    const senderNames = new Map<string, string>();
    if (senders?.length) {
      const ids = senders.map((s) => String(s.profile_id));
      const { data: profs } = await db.from("profile").select("id, full_name").in("id", ids);
      for (const p of profs ?? []) senderNames.set(String(p.id), String(p.full_name));
    }

    return NextResponse.json({
      isBoss,
      total: count ?? rows.length,
      rows: rows.map((r) => ({ ...r, sender_name: r.agent_profile_id ? names.get(String(r.agent_profile_id)) ?? null : null })),
      senders: (senders ?? []).map((s) => ({ id: String(s.profile_id), label: senderNames.get(String(s.profile_id)) ?? String(s.email_address) })),
    });
  } catch (e) {
    return errJson(e);
  }
}
