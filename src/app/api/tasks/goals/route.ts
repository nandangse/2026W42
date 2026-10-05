import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { errJson, requireReader } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/tasks/goals — the goals a task may be filed under (0199): every
 * goal and sub goal not yet done, with the root goal's name, for the My
 * Tasks lightbox and its By Goals grouping. Titles only; the tree itself
 * stays behind the Goals workspace's own grant, as /api/today's names do.
 */
export async function GET() {
  try {
    await requireReader();
    const admin = adminClient();
    const { data, error } = await admin.from("goal_item")
      .select("id,title,kind,scope,root_id,parent_id,status,period")
      .neq("status", "done").in("kind", ["goal", "subgoal"]).order("scope").order("sort_order").order("title").limit(2000);
    if (error) {
      if (/does not exist|schema cache/i.test(error.message)) return NextResponse.json({ goals: [] });
      throw new Error(error.message);
    }
    const byId = new Map((data || []).map((g) => [String(g.id), g]));
    const goals = (data || []).map((g) => {
      const root = g.root_id ? byId.get(String(g.root_id)) : null;
      return { id: String(g.id), title: String(g.title || "").trim() || "(untitled)", kind: String(g.kind), scope: String(g.scope), root: root && root.id !== g.id ? String(root.title || "").trim() : "" };
    }).filter((g) => g.title !== "(untitled)");
    return NextResponse.json({ goals });
  } catch (e) { return errJson(e); }
}
