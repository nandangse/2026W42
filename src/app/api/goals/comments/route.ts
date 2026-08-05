import { NextResponse } from "next/server";
import { requireUser, errJson } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// GET /api/goals/comments?node_id= — the audit trail of how the number moved.
// Comments stay visible after a node closes; that is the point of them.
export async function GET(req: Request) {
  try {
    await requireUser();
    const nodeId = new URL(req.url).searchParams.get("node_id");
    if (!nodeId) return NextResponse.json({ error: "node_id required" }, { status: 400 });
    const { data, error } = await supabaseServer()
      .from("goal_node_comment")
      .select("id, by, at, body")
      .eq("node_id", nodeId)
      .order("at", { ascending: true });
    if (error) throw new Error(error.message);
    return NextResponse.json({ comments: data || [] });
  } catch (e) {
    return errJson(e);
  }
}
