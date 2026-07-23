import { NextResponse } from "next/server";
import { requirePlanner, errJson } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// POST /api/comments — add a comment to a task. planner/admin.
// Body: { task_id, task_kind: "erp"|"manual", body }
// GET  /api/comments?task_id=&task_kind= — list comments for a task.
export async function POST(req: Request) {
  try {
    const user = await requirePlanner();
    const supabase = supabaseServer();
    const body = await req.json();
    if (!body.task_id || !body.body)
      return NextResponse.json({ error: "task_id and body required" }, { status: 400 });
    const { data, error } = await supabase
      .from("task_comments")
      .insert({
        task_id: body.task_id,
        task_kind: body.task_kind === "manual" ? "manual" : "erp",
        by: user.email,
        body: body.body,
      })
      .select("id, at")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, id: data.id, at: data.at });
  } catch (e) {
    return errJson(e);
  }
}

export async function GET(req: Request) {
  try {
    await requirePlanner();
    const supabase = supabaseServer();
    const url = new URL(req.url);
    const taskId = url.searchParams.get("task_id");
    const taskKind = url.searchParams.get("task_kind") || "erp";
    if (!taskId) return NextResponse.json({ error: "task_id required" }, { status: 400 });
    const { data, error } = await supabase
      .from("task_comments")
      .select("id, by, at, body")
      .eq("task_id", taskId)
      .eq("task_kind", taskKind)
      .order("at", { ascending: true });
    if (error) throw new Error(error.message);
    return NextResponse.json({ comments: data || [] });
  } catch (e) {
    return errJson(e);
  }
}
