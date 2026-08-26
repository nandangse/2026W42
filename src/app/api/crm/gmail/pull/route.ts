import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { crmDb } from "@/crm/db";
import { accessTokenFor, gmailGet, myMailbox } from "@/crm/gmail";

export const dynamic = "force-dynamic";

/**
 * POST /api/crm/gmail/pull { email, person_id?, company_id?, opportunity_id? }
 *
 * On-demand, per record: fetch the signed-in person's recent Gmail traffic
 * with that address (six months, 25 threads' worth) and land it in the
 * unified message table — idempotent on the Gmail id, so pulling twice
 * never duplicates. No background sync, no silent inbox scraping: the rep
 * asks, the record fills.
 */
export async function POST(req: Request) {
  try {
    const user = await requireCrm();
    const mb = user.profileId ? await myMailbox(user.profileId) : null;
    if (!mb || mb.status !== "active")
      throw new HttpError(400, "Connect your Gmail first — Profile → Gmail connection.");
    const b = await req.json();
    const email = String(b.email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Which address? The record carries no email.");

    const token = await accessTokenFor(String(mb.id));
    const q = encodeURIComponent(`(from:${email} OR to:${email}) newer_than:180d`);
    const list = await gmailGet(token, `messages?q=${q}&maxResults=25`);
    const ids = ((list.messages as { id: string }[] | undefined) ?? []).map((m) => m.id);

    const db = crmDb();
    let pulled = 0;
    for (const id of ids) {
      const m = await gmailGet(token, `messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`);
      const headers = ((m.payload as { headers?: { name: string; value: string }[] })?.headers) ?? [];
      const h = (n: string) => headers.find((x) => x.name.toLowerCase() === n.toLowerCase())?.value ?? null;
      const from = h("From") ?? "";
      const inbound = from.toLowerCase().includes(email);
      const { error } = await db.from("message").upsert([{
        channel: "email", direction: inbound ? "inbound" : "outbound",
        external_id: String(m.id), thread_key: String(m.threadId ?? ""),
        subject: h("Subject"), body_text: String(m.snippet ?? ""),
        from_handle: from, to_handles: h("To") ? [h("To") as string] : [],
        occurred_at: m.internalDate ? new Date(Number(m.internalDate)).toISOString() : new Date().toISOString(),
        person_id: b.person_id ?? null, company_id: b.company_id ?? null,
        opportunity_id: b.opportunity_id ?? null, agent_profile_id: user.profileId,
      }], { onConflict: "channel,external_id", ignoreDuplicates: true });
      if (!error) pulled++;
    }
    return NextResponse.json({ ok: true, found: ids.length, pulled });
  } catch (e) {
    return errJson(e);
  }
}
