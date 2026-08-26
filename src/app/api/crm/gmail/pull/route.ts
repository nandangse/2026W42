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
    const db = crmDb();
    let email = String(b.email ?? "").trim().toLowerCase();
    // The record's own window: from seven days BEFORE the enquiry arrived,
    // then everything since (Dr Raghu, 26 Aug 2026). Without an enquiry
    // date, the last six months.
    let after = "newer_than:180d";
    if (b.opportunity_id) {
      const { data: o } = await db.from("opportunity")
        .select("opportunity_on, point_of_contact_id, company_id").eq("id", b.opportunity_id).maybeSingle();
      if (o) {
        if (!email && o.point_of_contact_id) {
          const { data: per } = await db.from("person").select("primary_email").eq("id", o.point_of_contact_id).maybeSingle();
          if (per?.primary_email) email = String(per.primary_email).toLowerCase();
        }
        if (o.opportunity_on) {
          const d0 = new Date(String(o.opportunity_on) + "T00:00:00Z");
          d0.setUTCDate(d0.getUTCDate() - 7);
          after = `after:${d0.getUTCFullYear()}/${d0.getUTCMonth() + 1}/${d0.getUTCDate()}`;
        }
        if (!b.company_id && o.company_id) b.company_id = o.company_id;
      }
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Which address? The record carries no email.");

    const token = await accessTokenFor(String(mb.id));
    const q = encodeURIComponent(`(from:${email} OR to:${email}) ${after}`);
    const list = await gmailGet(token, `messages?q=${q}&maxResults=50`);
    const ids = ((list.messages as { id: string }[] | undefined) ?? []).map((m) => m.id);
    // the actual words, not the snippet — a reply quotes them
    type Part = { mimeType?: string; body?: { data?: string }; parts?: Part[] };
    const textOf = (part: Part | undefined): string => {
      if (!part) return "";
      if (part.mimeType === "text/plain" && part.body?.data)
        return Buffer.from(part.body.data, "base64url").toString("utf8");
      for (const sub of part.parts ?? []) { const t = textOf(sub); if (t) return t; }
      return "";
    };
    let pulled = 0;
    for (const id of ids) {
      const m = await gmailGet(token, `messages/${id}?format=full`);
      const headers = ((m.payload as { headers?: { name: string; value: string }[] })?.headers) ?? [];
      const h = (n: string) => headers.find((x) => x.name.toLowerCase() === n.toLowerCase())?.value ?? null;
      const from = h("From") ?? "";
      const inbound = from.toLowerCase().includes(email);
      const bodyText = textOf(m.payload as Part).trim() || String(m.snippet ?? "");
      const { error } = await db.from("message").upsert([{
        channel: "email", direction: inbound ? "inbound" : "outbound",
        external_id: String(m.id), thread_key: String(m.threadId ?? ""),
        raw_payload: { rfc_message_id: h("Message-ID") },
        subject: h("Subject"), body_text: bodyText.slice(0, 20000),
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
