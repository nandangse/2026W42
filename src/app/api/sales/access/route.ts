import { NextResponse } from "next/server";
import { requireUser, errJson } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { resolveSalesAccess } from "@/lib/sales-access";

export const dynamic = "force-dynamic";

// GET /api/sales/access — cheap check that decides whether the Sales Genie
// workspace tab appears in the nav at all.
export async function GET() {
  try {
    const user = await requireUser();
    const see = await resolveSalesAccess(adminClient(), user.id, user.isOwner);
    return NextResponse.json({ see });
  } catch (e) {
    return errJson(e);
  }
}
