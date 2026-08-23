import { NextResponse } from "next/server";
import { requireUser, errJson } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { resolveHrmsAccess } from "@/lib/hrms";

export const dynamic = "force-dynamic";

// GET /api/hrms/access — the cheap check that decides whether the HRMS link
// appears in Genie's nav at all. Says yes or no and nothing else.
export async function GET() {
  try {
    const user = await requireUser();
    const see = await resolveHrmsAccess(adminClient(), user.email, user.isOwner);
    return NextResponse.json({ see });
  } catch (e) {
    return errJson(e);
  }
}
