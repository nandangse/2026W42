import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { isHead, requireIms } from "@/ims/auth";
import { imsDb, notInstalled } from "@/ims/db";
import { log, need, ok, pick } from "@/ims/api";

export const dynamic = "force-dynamic";

/**
 * core_task — the unified task table (design §6b.1).
 *
 * IMS's todos, CAPA actions, certificate renewals and certification path
 * steps all land here, tagged by module, so that one day every Genie module
 * reads one "my tasks" list instead of five poor ones. IMS starts on it from
 * day one; CRM's action stream migrates later.
 */
const FIELDS = ["title", "description", "owner_id", "due_date", "priority", "status", "module"];

export async function GET(req: Request) {
  try {
    const me = await requireIms();
    const url = new URL(req.url);
    const scope = url.searchParams.get("scope") || "mine";
    const db = imsDb();

    let q = db.from("core_task").select("*").order("due_date", { nullsFirst: false }).limit(1000);
    // "Everyone's" is for the MR and heads — they are the ones chasing.
    if (scope === "mine" && me.profileId) q = q.eq("owner_id", me.profileId);
    else if (scope === "all" && !isHead(me) && me.profileId) q = q.eq("owner_id", me.profileId);

    const { data, error } = await q;
    if (error) {
      if (notInstalled(error.message)) return NextResponse.json({ installed: false, rows: [] });
      throw new Error(error.message);
    }
    return NextResponse.json({
      installed: true,
      rows: data ?? [],
      profileId: me.profileId,
      maySeeAll: isHead(me),
      today: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
    });
  } catch (e) {
    return errJson(e);
  }
}

/** POST { action: add | update | complete | reopen | delete, id?, row? } */
export async function POST(req: Request) {
  try {
    const me = await requireIms();
    const body = await req.json();
    const action = String(body.action || "");
    const db = imsDb();

    if (action === "add") {
      const row = pick(body.row ?? {}, FIELDS);
      need(String(row.title || "").trim(), "A task needs a title.");
      const { data, error } = await db
        .from("core_task")
        .insert({
          ...row,
          module: row.module || "IMS",
          source_type: "manual",
          owner_id: row.owner_id || me.profileId,
          created_by: me.email,
        })
        .select("id")
        .maybeSingle();
      if (error) throw new Error(error.message);
      await log(me, "core_task", data?.id ?? null, "add", { title: row.title });
      return ok({ id: data?.id });
    }

    need(body.id, "id required");
    const { data: task } = await db.from("core_task").select("owner_id, status").eq("id", body.id).maybeSingle();
    if (!task) throw new HttpError(404, "No such task.");
    // Your own tasks, or anybody's if you are the MR or a head. Somebody
    // closing a task assigned to another person, from another department, is
    // exactly the audit finding this prevents.
    const mine = me.profileId && task.owner_id === me.profileId;
    if (!mine && !isHead(me)) throw new HttpError(403, "That task belongs to somebody else.");

    if (action === "complete" || action === "reopen") {
      const done = action === "complete";
      const { error } = await db
        .from("core_task")
        .update({ status: done ? "done" : "open", completed_at: done ? new Date().toISOString() : null })
        .eq("id", body.id);
      if (error) throw new Error(error.message);
      await log(me, "core_task", String(body.id), action);
      return ok();
    }

    if (action === "update") {
      const { error } = await db.from("core_task").update(pick(body.row ?? {}, FIELDS)).eq("id", body.id);
      if (error) throw new Error(error.message);
      await log(me, "core_task", String(body.id), "update");
      return ok();
    }

    if (action === "delete") {
      if (!isHead(me)) throw new HttpError(403, "Only the MR or a department head may delete a task.");
      const { error } = await db.from("core_task").delete().eq("id", body.id);
      if (error) throw new Error(error.message);
      await log(me, "core_task", String(body.id), "delete");
      return ok();
    }

    throw new HttpError(400, "Unknown action.");
  } catch (e) {
    return errJson(e);
  }
}
