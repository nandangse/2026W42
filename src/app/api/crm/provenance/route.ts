import { NextResponse } from "next/server";
import { crmDb } from "@/crm/db";
import { requireCrm } from "@/crm/auth";
import { errJson, HttpError } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * WHERE THIS RECORD CAME FROM, AND WHEN.
 *
 * Dr Raghu, 16 Sep 2026, looking at a contact: "this also doesn't tell me
 * where it was added from and when! show all that in notes."
 *
 * He is right, and it was all already written down — just never shown. A
 * person carries the day they were made and who made them; every list they
 * are on carries the FILE that put them there and the day it did. Four
 * hundred exhibitor books went in this week, and without this a name is a
 * name with no history, which is exactly the state the whole import was
 * meant to rescue them from.
 *
 * Nothing here is computed or guessed. It is the record's own history, read
 * back and put in one place.
 */
const S = (v: unknown) => String(v ?? "").trim();

export async function GET(req: Request) {
  try {
    await requireCrm();
    const db = crmDb();
    const u = new URL(req.url);
    const id = S(u.searchParams.get("id"));
    const type = S(u.searchParams.get("type")) || "person";
    if (!id) throw new HttpError(400, "Which record?");

    const table = type === "company" ? "company" : "person";
    const { data: row } = await db.from(table)
      .select("id, created_at, created_by_email, source, notes").eq("id", id).maybeSingle();
    if (!row) throw new HttpError(404, "No such record.");

    /* Every list it is on, and the file that put it there. */
    let lists: { list: string; source: string | null; added_at: string; by: string | null }[] = [];
    if (table === "person") {
      const { data: mem } = await db.from("mk_list_member")
        .select("list_id, source, added_at, added_by_email").eq("person_id", id).order("added_at", { ascending: true });
      const ids = [...new Set((mem || []).map((m) => String(m.list_id)))];
      const names = new Map<string, string>();
      if (ids.length) {
        const { data: ls } = await db.from("mk_list").select("id, name").in("id", ids);
        for (const l of (ls || []) as { id: string; name: string }[]) names.set(String(l.id), l.name);
      }
      lists = ((mem || []) as { list_id: string; source: string | null; added_at: string; added_by_email: string | null }[])
        .map((m) => ({ list: names.get(String(m.list_id)) ?? "(a list since deleted)", source: m.source, added_at: m.added_at, by: m.added_by_email }));
    }

    /* A scanned card, and a meeting, are provenance too. */
    let cards: { at: string; by: string }[] = [];
    let met: { at: string; event: string | null; context: string | null }[] = [];
    if (table === "person") {
      const { data: cd } = await db.from("visiting_card").select("added_at, added_by").eq("person_id", id).order("added_at");
      cards = ((cd || []) as { added_at: string; added_by: string }[]).map((c) => ({ at: c.added_at, by: c.added_by }));
      const { data: mp } = await db.from("met_person").select("met_on, event, context").eq("person_id", id).order("met_on");
      met = ((mp || []) as { met_on: string; event: string | null; context: string | null }[]).map((m) => ({ at: m.met_on, event: m.event, context: m.context }));
    }

    return NextResponse.json({
      ok: true,
      created_at: row.created_at, created_by: S(row.created_by_email) || null, source: S(row.source) || null,
      notes: S(row.notes) || null,
      lists, cards, met,
    });
  } catch (e) { return errJson(e); }
}
