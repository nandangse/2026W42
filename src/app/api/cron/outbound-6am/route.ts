import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { crmDb, crmConfigured } from "@/crm/db";
import { myMailbox, accessTokenFor, gmailSend } from "@/crm/gmail";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/outbound-6am — 6:00 AM IST from vercel.json.
 *
 * Sends every DUE, AUTO email in the outbound queue through its OWNER'S own
 * Gmail, logs each into Communication, and marks it sent — so the thank-you
 * queued at last night's exhibition greets the person before their day
 * starts (Dr Raghu, 28 Aug 2026).
 *
 * WhatsApp is never touched here: it goes from the salesperson's own phone,
 * by hand, from the queue. A failure on one mail is recorded on that row
 * and does not stop the rest; the row stays queued for tomorrow's run.
 */
export async function GET(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    const header = req.headers.get("authorization") || "";
    const fromCron = !!secret && header === `Bearer ${secret}`;
    if (!fromCron) {
      try { await requireCrm(); } catch { throw new HttpError(401, "The 6 AM cron or a signed-in CRM hand."); }
    }
    if (!crmConfigured()) return NextResponse.json({ ok: true, sent: 0, note: "CRM not configured" });
    const db = crmDb();

    const { data: due, error } = await db.from("outbound_queue").select("*")
      .eq("status", "queued").eq("channel", "email").eq("send_mode", "auto")
      .lte("due_at", new Date().toISOString()).limit(100);
    if (error) {
      if (/outbound_queue|schema cache/i.test(error.message)) return NextResponse.json({ ok: true, sent: 0, note: "pre-0022" });
      throw new HttpError(500, error.message);
    }

    let sent = 0, failed = 0;
    const mailboxByEmail = new Map<string, { id: string; email_address: string; name: string | null } | null>();
    for (const q of due || []) {
      const owner = String(q.added_by);
      try {
        if (!mailboxByEmail.has(owner)) {
          const { data: prof } = await db.from("profile").select("id, full_name").eq("email", owner).maybeSingle();
          const mb = prof ? await myMailbox(String(prof.id)) : null;
          mailboxByEmail.set(owner, mb && mb.status === "active"
            ? { id: String(mb.id), email_address: String(mb.email_address), name: prof?.full_name ? String(prof.full_name) : null }
            : null);
        }
        const mb = mailboxByEmail.get(owner);
        if (!mb) throw new Error("owner has no connected Gmail");
        const to = String(q.to_email || "");
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Error("no valid address on the row");

        const token = await accessTokenFor(mb.id);
        await gmailSend(token, mb.email_address, to, String(q.subject || "(no subject)"), String(q.body || ""), undefined, undefined, mb.name || undefined);
        const { data: prof2 } = await db.from("profile").select("id").eq("email", owner).maybeSingle();
        await db.from("message").insert({
          channel: "email", direction: "outbound",
          subject: q.subject, body_text: q.body,
          from_handle: mb.email_address, to_handles: [to],
          occurred_at: new Date().toISOString(),
          person_id: q.person_id, company_id: q.company_id,
          agent_profile_id: prof2 ? String(prof2.id) : null,
        });
        await db.from("outbound_queue").update({ status: "sent", sent_at: new Date().toISOString(), sent_note: "auto · 6am" }).eq("id", String(q.id));
        sent++;
      } catch (e) {
        failed++;
        await db.from("outbound_queue").update({ sent_note: `auto failed: ${e instanceof Error ? e.message : String(e)}` }).eq("id", String(q.id));
      }
    }
    return NextResponse.json({ ok: true, sent, failed, due: (due || []).length });
  } catch (e) {
    return errJson(e);
  }
}
