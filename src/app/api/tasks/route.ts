import { NextResponse } from "next/server";
import { requireTasker, errJson, EDITOR_ROLES } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

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
          done: false,
          created_by: user.email,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, id: data.id });
    }

    if (body.action === "toggle") {
      const table = body.kind === "manual" ? "manual_tasks" : "erp_tasks";
      const { error } = await supabase
        .from(table)
        .update({ done: !!body.done })
        .eq("id", body.id);
      if (error) throw new Error(error.message);
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
      if (!Object.keys(patch).length)
        return NextResponse.json({ error: "nothing to update" }, { status: 400 });
      const { error } = await supabase.from(table).update(patch).eq("id", body.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "delete") {
      if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const manual = body.kind === "manual";
      const table = manual ? "manual_tasks" : "erp_tasks";

      // A plain "user" may only remove their own work; editors may remove any.
      if (!EDITOR_ROLES.includes(user.role)) {
        const { data: t } = await supabase
          .from(table)
          .select(manual ? "who, created_by" : "who")
          .eq("id", body.id)
          .maybeSingle();
        const mine =
          t &&
          [(t as any).who, (t as any).created_by]
            .filter(Boolean)
            .some(
              (v: string) =>
                v.toLowerCase() === user.email.toLowerCase() ||
                (!!user.initials && v.toUpperCase() === user.initials),
            );
        if (!mine)
          return NextResponse.json(
            { error: "You can only delete tasks assigned to you or created by you" },
            { status: 403 },
          );
      }

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
