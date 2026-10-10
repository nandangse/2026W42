import { NextResponse } from "next/server";
import { errJson, RAGHU_EMAIL } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { lcMembers, requireLeader } from "@/lib/lc/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/lc/members — the council: every login marked LC, the owner first,
 * each with the colour that follows them across the boards; and who I am.
 */
export async function GET() {
  try {
    const u = await requireLeader();
    const members = await lcMembers(adminClient(), RAGHU_EMAIL);
    const { data: setting } = await adminClient().from("lc_setting").select("key,value").in("key", ["drive_folder", "mom_template"]);
    const settings: Record<string, string> = {};
    for (const s of setting || []) settings[s.key] = s.value || "";
    return NextResponse.json({
      members,
      me: { email: u.email, displayName: u.displayName, initials: u.initials, role: u.role, isOwner: u.isOwner },
      settings,
    });
  } catch (e) { return errJson(e); }
}
