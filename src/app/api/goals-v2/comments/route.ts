import { NextResponse } from "next/server";
import { requireUser, errJson } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { resolveGoalAccess } from "@/lib/goal-access";

export const dynamic = "force-dynamic";

// GET /api/goals-v2/comments?item_id= — how the number moved.
// Comments stay readable after the goal closes; that is the point of them.
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const admin = adminClient();
    const access = await resolveGoalAccess(admin, user.id, user.isOwner);
    if (!access.see) return NextResponse.json({ error: "no_goal_access" }, { status: 403 });

    const itemId = new URL(req.url).searchParams.get("item_id");
    if (!itemId) return NextResponse.json({ error: "item_id required" }, { status: 400 });

    const { data, error } = await admin
      .from("goal_item_comment")
      .select("id, by, at, body")
      .eq("item_id", itemId)
      .order("at", { ascending: true });
    if (error) throw new Error(error.message);
    return NextResponse.json({ comments: data || [] });
  } catch (e) {
    return errJson(e);
  }
}
