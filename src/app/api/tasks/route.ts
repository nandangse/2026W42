import { NextResponse } from "next/server";
import { requireTasker, errJson } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { notifyTaskAssignment } from "@/lib/notify";

export const dynamic = "force-dynamic";

// POST /api/tasks — manual task create, edit, or close/reopen either kind. planner/admin.
//   { action: "create", job_id, title, detail?, who?, due?, cat?, esc? }
//   { action: "toggle", id, kind: "erp"|"manual", done }
//   { action: "update", id, kind, title?, detail?, who?, due?, cat?, esc? }
//   { action: "delete", id, kind }  — removes the task and its comments
export async function POST(req: Request) {
  try {
    const user = await requireTasker();
    const supabase = supabaseServer();
    const body = await req.json();

    if (body.action === "create") {
      if (!body.title) return NextResponse.json({ error: "title required" }, { status: 400 });
      const { data, error } = await supabase
        .from("manual_tasks")
        .insert({
          job_id: body.job_id || null,
          title: body.title,
          detail: body.detail || "",
          who: body.who || "unassigned",
          due: body.due || null,
          cat: body.cat || "Production",
          esc: body.esc || "None",
          esc_why: String(body.esc_why || "").trim() || null,
          done: false,
          created_by: user.email,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      // ring the assignee's bell (self-assignment stays silent; failures never
      // break the create itself)
      await notifyTaskAssignment(adminClient(), {
        who: body.who,
        actorId: user.id,
        actorLabel: user.initials || user.displayName || user.email.split("@")[0],
        taskTitle: String(body.title),
        jobId: body.job_id || null,
        kind: "task_assigned",
        refKind: "manual",
        refId: data.id,
      });
      return NextResponse.json({ ok: true, id: data.id });
    }

    if (body.action === "toggle") {
      const table = body.kind === "manual" ? "manual_tasks" : "erp_tasks";
      const { error } = await supabase
        .from(table)
        .update({ done: !!body.done })
        .eq("id", body.id);
      if (error) throw new Error(error.message);

      /**
       * The mirror, half two: a task promoted from a kitting line.
       *
       * Closing it receives the material; re-opening it puts the material back
       * to Yet to receive. Without this the two records drift within a week —
       * somebody ticks the task, the board still shows the item outstanding,
       * and the kitting percentage is wrong on every screen that reads it.
       * A QC Defective line is left alone: it is not "not yet received", and
       * closing the chase must not quietly overwrite a QC call.
       */
      if (body.kind === "manual") {
        try {
          const { data: mat } = await supabase
            .from("materials")
            .select("id, status")
            .eq("task_id", body.id)
            .maybeSingle();
          if (mat && mat.status !== "QC Defective")
            await supabase
              .from("materials")
              .update({ status: body.done ? "Received" : "Yet to receive", updated_at: new Date().toISOString() })
              .eq("id", mat.id);
        } catch {
          /* migration 0030 not run yet — the task still toggles */
        }
      }
      return NextResponse.json({ ok: true });
    }

    if (body.action === "update") {
      if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const table = body.kind === "manual" ? "manual_tasks" : "erp_tasks";
      const patch: Record<string, unknown> = {};
      if ("title" in body) patch.title = String(body.title || "").trim();
      if ("detail" in body) patch.detail = String(body.detail || "");
      if ("who" in body) patch.who = String(body.who || "unassigned");
      if ("due" in body) patch.due = body.due || null;
      if ("cat" in body) patch.cat = String(body.cat || "General");
      if ("esc" in body) patch.esc = String(body.esc || "None");
      if ("esc_why" in body) patch.esc_why = String(body.esc_why || "").trim() || null;
      if (!Object.keys(patch).length)
        return NextResponse.json({ error: "nothing to update" }, { status: 400 });

      /**
       * A due date that moves is recorded, not just replaced.
       *
       * original_due is set from the date the task ALREADY had — that is the
       * first promise, and it never changes again. push_count and the log say
       * how far it has drifted since. Without this, dragging a chip forward
       * deletes the fact that it was ever late, which is the one thing a
       * delivery board must not let anybody do.
       */
      if ("due" in body) {
        try {
          const { data: was } = await supabase
            .from(table)
            .select("due, original_due, push_count")
            .eq("id", body.id)
            .maybeSingle();
          const oldDue = was?.due ?? null;
          const newDue = body.due || null;
          if (was && oldDue !== newDue) {
            // the first promise is whatever it was carrying before this move
            if (!was.original_due && oldDue) patch.original_due = oldDue;
            patch.push_count = (was.push_count ?? 0) + 1;
            await adminClient().from("task_date_log").insert({
              task_id: body.id,
              task_kind: body.kind === "manual" ? "manual" : "erp",
              old_due: oldDue,
              new_due: newDue,
              by: user.initials || user.displayName || user.email.split("@")[0],
            });
          }
        } catch {
          /* 0032 not run yet — the date still moves, it is just not recorded */
        }
      }

      // read the old assignee first, so a reassignment can be detected after
      const oldWho =
        "who" in body
          ? (await supabase.from(table).select("who, title").eq("id", body.id).maybeSingle()).data
          : null;

      const { error } = await supabase.from(table).update(patch).eq("id", body.id);
      if (error) throw new Error(error.message);

      if (
        oldWho &&
        String(patch.who ?? "").toLowerCase() !== String(oldWho.who ?? "").toLowerCase()
      ) {
        await notifyTaskAssignment(adminClient(), {
          who: patch.who,
          actorId: user.id,
          actorLabel: user.initials || user.displayName || user.email.split("@")[0],
          taskTitle: String(patch.title ?? oldWho.title ?? "task"),
          jobId: null,
          kind: "task_reassigned",
          refKind: body.kind === "manual" ? "manual" : "erp",
          refId: String(body.id),
        });
      }
      return NextResponse.json({ ok: true });
    }

    if (body.action === "delete") {
      if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const manual = body.kind === "manual";
      const table = manual ? "manual_tasks" : "erp_tasks";

      /**
       * ADMINS ONLY, set by Dr Raghu.
       *
       * It used to be "your own work, or anything if you are an editor", which
       * made deleting the ordinary way to make a task you did not want go
       * away. A deleted task takes its comments and its date history with it
       * and leaves nothing behind saying it existed -- so the record of who
       * was asked for what, and how often the date moved, disappears with it.
       *
       * Everyone else closes a task instead. Done keeps the trail.
       */
      if (user.role !== "admin")
        return NextResponse.json(
          { error: "Only an admin can delete a task. Mark it Done instead — that keeps its comments and date history." },
          { status: 403 },
        );

      // comments are polymorphic (no FK), so clear them explicitly
      const { error: ce } = await supabase
        .from("task_comments")
        .delete()
        .eq("task_id", body.id)
        .eq("task_kind", manual ? "manual" : "erp");
      if (ce) throw new Error(ce.message);

      const { error } = await supabase.from(table).delete().eq("id", body.id);
      if (error) throw new Error(error.message);

      // An ERP task is re-created by the next ToDo upload while it still exists
      // in the ERP — say so rather than letting it silently reappear.
      return NextResponse.json({
        ok: true,
        willReturn: !manual,
      });
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return errJson(e);
  }
}
