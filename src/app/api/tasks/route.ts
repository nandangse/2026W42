import { NextResponse } from "next/server";
import { requirePlanner, errJson } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// POST /api/tasks — manual task create, edit, or close/reopen either kind. planner/admin.
//   { action: "create", job_id, title, detail?, who?, due?, cat?, esc? }
//   { action: "toggle", id, kind: "erp"|"manual", done }
//   { action: "update", id, kind, title?, detail?, who?, due?, cat?, esc? }
export async function POST(req: Request) {
  try {
    const user = await requirePlanner();
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

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return errJson(e);
  }
}
