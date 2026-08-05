import { NextResponse } from "next/server";
import { requireAdmin, errJson } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export type AccessLevel = "none" | "view" | "edit";

// GET /api/admin/goal-access — every account with its goals access level, plus
// how much of the tree they own (so you can see who is already involved before
// deciding what to grant).
export async function GET() {
  try {
    await requireAdmin();
    const admin = adminClient();

    const [people, grants, owned] = await Promise.all([
      admin
        .from("profiles")
        .select("id, email, initials, display_name, role, disabled")
        .order("created_at"),
      admin.from("goal_access").select("person_id, can_edit"),
      admin.from("goal_node_owner").select("person_id"),
    ]);
    if (people.error) throw new Error(people.error.message);

    const grantBy = new Map((grants.data || []).map((g) => [g.person_id, g.can_edit]));
    const ownCount = new Map<string, number>();
    for (const o of owned.data || [])
      ownCount.set(o.person_id, (ownCount.get(o.person_id) || 0) + 1);

    const users = (people.data || []).map((p) => {
      const isAdmin = p.role === "admin";
      const g = grantBy.get(p.id);
      // admins always reach the tree — has_goals_access() short-circuits on role
      const level: AccessLevel = isAdmin ? "edit" : g === undefined ? "none" : g ? "edit" : "view";
      return {
        id: p.id,
        email: p.email,
        initials: p.initials,
        name: p.display_name,
        role: p.role,
        disabled: p.disabled,
        level,
        implicit: isAdmin, // granted by being an admin, not by a row
        ownsNodes: ownCount.get(p.id) || 0,
      };
    });

    return NextResponse.json({ users });
  } catch (e) {
    return errJson(e);
  }
}

// POST /api/admin/goal-access — { person_id, level: "none" | "view" | "edit" }
export async function POST(req: Request) {
  try {
    await requireAdmin();
    const admin = adminClient();
    const { person_id, level } = await req.json();
    if (!person_id || !["none", "view", "edit"].includes(level))
      return NextResponse.json({ error: "person_id and a valid level required" }, { status: 400 });

    const { data: who } = await admin.from("profiles").select("role").eq("id", person_id).maybeSingle();
    if (who?.role === "admin")
      return NextResponse.json(
        { error: "Admins always have goals access. Change their role first if you need to remove it." },
        { status: 400 },
      );

    if (level === "none") {
      const { error } = await admin.from("goal_access").delete().eq("person_id", person_id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await admin
        .from("goal_access")
        .upsert({ person_id, can_edit: level === "edit" }, { onConflict: "person_id" });
      if (error) throw new Error(error.message);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errJson(e);
  }
}
