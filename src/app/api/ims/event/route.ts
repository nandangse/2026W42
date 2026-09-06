import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { errJson, HttpError } from "@/lib/auth";
import { isHead, requireIms } from "@/ims/auth";
import { imsDb, notInstalled } from "@/ims/db";
import { log, need, ok, pick } from "@/ims/api";

export const dynamic = "force-dynamic";

/**
 * core_event — one calendar for the whole org (design §6b.2).
 *
 * The audit programme, the training calendar, management reviews, customer
 * visits. Every module writes here with its own `module` tag, so the answer to
 * "what is coming" is one query rather than six.
 */
const FIELDS = [
  "module", "event_type", "title", "description",
  "starts_at", "ends_at", "all_day", "location", "department", "owner_id",
];

export async function GET(req: Request) {
  try {
    await requireIms();
    const url = new URL(req.url);
    // ?month=YYYY-MM — the month view, plus a fortnight either side so the
    // grid's leading and trailing days are not mysteriously empty.
    const month = url.searchParams.get("month") || new Date().toISOString().slice(0, 7);
    const from = new Date(`${month}-01T00:00:00Z`);
    const start = new Date(from.getTime() - 14 * 86400000).toISOString();
    const end = new Date(from.getTime() + 60 * 86400000).toISOString();

    const { data, error } = await imsDb()
      .from("core_event")
      .select("*")
      .gte("starts_at", start)
      .lte("starts_at", end)
      .order("starts_at")
      .limit(1000);
    if (error) {
      if (notInstalled(error.message)) return NextResponse.json({ installed: false, rows: [] });
      throw new Error(error.message);
    }
    return NextResponse.json({ installed: true, rows: data ?? [], month });
  } catch (e) {
    return errJson(e);
  }
}

/** POST { action: add | update | delete, id?, row? } */
export async function POST(req: Request) {
  try {
    const me = await requireIms();
    const body = await readBody(req, {});
    const action = String(body.action || "");
    const db = imsDb();

    if (action === "delete") {
      if (!isHead(me)) throw new HttpError(403, "Only the MR or a department head may remove a calendar entry.");
      need(body.id, "id required");
      const { error } = await db.from("core_event").delete().eq("id", body.id);
      if (error) throw new Error(error.message);
      await log(me, "core_event", String(body.id), "delete");
      return ok();
    }

    const row = pick(body.row ?? {}, FIELDS);
    need(String(row.title || "").trim(), "An event needs a title.");
    need(row.starts_at, "An event needs a date.");

    if (action === "add") {
      const { data, error } = await db
        .from("core_event")
        .insert({ ...row, module: row.module || "IMS", created_by: me.email })
        .select("id")
        .maybeSingle();
      if (error) throw new Error(error.message);
      await log(me, "core_event", data?.id ?? null, "add", { title: row.title });
      return ok({ id: data?.id });
    }

    if (action === "update") {
      need(body.id, "id required");
      const { error } = await db.from("core_event").update(row).eq("id", body.id);
      if (error) throw new Error(error.message);
      await log(me, "core_event", String(body.id), "update");
      return ok();
    }

    throw new HttpError(400, "Unknown action.");
  } catch (e) {
    return errJson(e);
  }
}
