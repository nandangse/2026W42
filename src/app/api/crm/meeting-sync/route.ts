import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { crmDb, crmConfigured, CrmNotConfigured } from "@/crm/db";
import { meetingFromInteraction, MEETING_KINDS } from "@/lib/zoom";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/crm/meeting-sync — every interaction already logged as a Video
 * Call or Zoom Meeting becomes a meeting row (Dr Raghu, 4 Sep 2026: "i want
 * to sync all the interactions in the meetings here where its Video call or
 * meeting"). From here on the save itself does it; this is the walk back
 * over what was logged before there was a Meetings section.
 */
export async function POST() {
  try {
    const me = await requireCrm();
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    if (!(me.isOwner || ["admin", "ceo", "sales_head"].includes(String(me.crmRole))))
      throw new HttpError(403, "The sync is run by the Sales Head, the CEO or admin.");
    const db = crmDb();
    const rows: Record<string, unknown>[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from("interaction").select("*").in("kind", MEETING_KINDS).order("happened_at", { ascending: false }).range(from, from + 999);
      if (error) throw new HttpError(500, error.message);
      rows.push(...((data ?? []) as Record<string, unknown>[]));
      if ((data ?? []).length < 1000) break;
    }
    const { data: have } = await db.from("meeting").select("interaction_id").not("interaction_id", "is", null);
    const done = new Set((have ?? []).map((m) => String(m.interaction_id)));
    let made = 0, updated = 0; const failed: string[] = [];
    for (const ix of rows) {
      try {
        const existed = done.has(String(ix.id));
        const id = await meetingFromInteraction(db, ix);
        if (id) { if (existed) updated++; else made++; }
      } catch (e) { failed.push(`${ix.id}: ${e instanceof Error ? e.message : e}`); }
    }
    return NextResponse.json({ ok: true, interactions: rows.length, made, updated, failed });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/relation "meeting"|meeting.*does not exist|schema cache/i.test(msg))
      return NextResponse.json({ error: "Run CRM migration 0052 first — the meeting table is not there yet." }, { status: 503 });
    return errJson(e);
  }
}
