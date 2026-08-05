import { NextResponse } from "next/server";
import { requireUser, errJson } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { resolveGoalAccess } from "@/lib/goal-access";

export const dynamic = "force-dynamic";

// GET /api/goals/access — cheap check for whether the Goals workspace tab
// should appear in the nav at all, without pulling the whole tree.
export async function GET() {
  try {
    const user = await requireUser();
    const access = await resolveGoalAccess(adminClient(), user.id, user.isOwner);
    return NextResponse.json(access);
  } catch (e) {
    return errJson(e);
  }
}
