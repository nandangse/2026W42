import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { requireUser, errJson, HttpError } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * The Brain Dump pad behind Nandan Tasking's last tab.
 *
 * Lines are private to the person who wrote them (RLS on brain_dump enforces
 * it; the user-scoped client here means a bug in this file still can't leak
 * someone else's pad). A line ends one of two ways: ticked DONE, or promoted
 * onto the Tasking board as a real manual_task — never both, and never twice.
 */

/** Rows are missing entirely until migration 0018 is applied. Say so plainly. */
function notInstalled(e: { message?: string }) {
  return /brain_dump|schema cache|does not exist/i.test(String(e?.message || ""));
}

// GET /api/brain-dump — this person's pad, newest first.
export async function GET() {
  try {
    await requireUser();
    const { data, error } = await supabaseServer()
      .from("brain_dump")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      if (notInstalled(error)) return NextResponse.json({ installed: false, items: [] });
      throw new Error(error.message);
    }
    return NextResponse.json({ installed: true, items: data || [] });
  } catch (e) {
    return errJson(e);
  }
}

// POST /api/brain-dump
//   { action: "create", title, detail?, who?, due?, cat?, esc?, job_id?, project?, goal_id? }
//   { action: "done",   id, done }
//   { action: "delete", id }
//   { action: "promote", id }   — becomes a manual_task on the Tasking board
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const db = supabaseServer();
    const body = await readBody(req, {});

    if (body.action === "create") {
      const title = String(body.title || "").trim();
      if (!title) throw new HttpError(400, "Write the task first — everything else is optional");
      const { data, error } = await db
        .from("brain_dump")
        .insert({
          user_id: user.id,
          title,
          detail: String(body.detail || "").trim() || null,
          who: String(body.who || "").trim() || null,
          due: body.due || null,
          cat: String(body.cat || "").trim() || "Production",
          esc: String(body.esc || "None"),
          job_id: body.job_id || null,
          project: String(body.project || "").trim() || null,
          goal_id: body.goal_id || null,
        })
        .select("*")
        .single();
      if (error) {
        if (notInstalled(error)) throw new HttpError(400, "Run migration 0018 first — the brain_dump table doesn't exist yet");
        throw new Error(error.message);
      }
      return NextResponse.json({ ok: true, item: data });
    }

    if (!body.id) throw new HttpError(400, "id required");

    if (body.action === "done") {
      const done = !!body.done;
      const { error } = await db
        .from("brain_dump")
        .update({ done, done_at: done ? new Date().toISOString() : null })
        .eq("id", body.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "delete") {
      const { error } = await db.from("brain_dump").delete().eq("id", body.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "promote") {
      const { data: row, error: readErr } = await db
        .from("brain_dump")
        .select("*")
        .eq("id", body.id)
        .maybeSingle();
      if (readErr) throw new Error(readErr.message);
      if (!row) throw new HttpError(404, "That line is gone");
      if (row.promoted_task_id) throw new HttpError(409, "Already on the board");
      /* A job is no longer required (Dr Raghu, 5 Oct 2026: "why isnt it
         showing add to board?"). A task with no job is a general task, as
         Tasking's own New task box has allowed since August; its goal and
         project travel with it (0199). */
      const base = {
        job_id: row.job_id || null,
        title: row.title,
        detail: row.detail,
        who: row.who,
        due: row.due,
        cat: row.cat,
        esc: row.esc || "None",
        done: false,
        created_by: user.email,
      };
      let ins = await db.from("manual_tasks").insert({ ...base, goal_id: row.goal_id || null, project: row.project || null }).select("id").single();
      /* 0199 not run yet: the task still goes on the board, without the two new columns */
      if (ins.error && /goal_id|project|schema cache/i.test(ins.error.message)) ins = await db.from("manual_tasks").insert(base).select("id").single();
      const { data: task, error: insErr } = ins;
      if (insErr || !task) throw new Error(insErr?.message || "Could not add it to the board");

      const { error: markErr } = await db
        .from("brain_dump")
        .update({ promoted_task_id: task.id, promoted_at: new Date().toISOString() })
        .eq("id", body.id);
      if (markErr) throw new Error(markErr.message);

      return NextResponse.json({ ok: true, task_id: task.id });
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return errJson(e);
  }
}
