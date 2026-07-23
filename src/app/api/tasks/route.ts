import { NextResponse } from "next/server";
import { requirePlanner, errJson } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// POST /api/tasks — manual task create, or close/reopen either kind. planner/admin.
//   { action: "create", job_id, title, detail?, who?, due?, cat?, esc? }
//   { action: "toggle", id, kind: "erp"|"manual", done }
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

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return errJson(e);
  }
}
