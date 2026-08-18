import { NextResponse } from "next/server";
import { requireReader, errJson } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** GET /api/task-dates?task_id=&task_kind= — every time this task's date moved. */
export async function GET(req: Request) {
  try {
    await requireReader();
    const u = new URL(req.url);
    const id = u.searchParams.get("task_id");
    const kind = u.searchParams.get("task_kind") === "manual" ? "manual" : "erp";
    if (!id) return NextResponse.json({ error: "task_id required" }, { status: 400 });

    const { data, error } = await adminClient()
      .from("task_date_log")
      .select("id, old_due, new_due, by, at")
      .eq("task_id", id)
      .eq("task_kind", kind)
      .order("at", { ascending: true });
    if (error) throw new Error(error.message);
    return NextResponse.json({ moves: data || [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // 0032 not run yet, or an id that is not a uuid (the milestone pseudo-cards
    // on the Job Plan kanban). Neither is worth an error on a task panel.
    if (/task_date_log|invalid input syntax|does not exist|schema cache/i.test(msg))
      return NextResponse.json({ moves: [] });
    return errJson(e);
  }
}
