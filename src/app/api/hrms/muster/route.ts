import { NextResponse } from "next/server";
import { requireHrms, errJson } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { musterView } from "@/lib/attendance-muster";

export const dynamic = "force-dynamic";

/** GET /api/hrms/muster?sheet=<id> — the month's attendance muster laid out per person (HRMS door). */
export async function GET(req: Request) {
  try {
    await requireHrms();
    const sheet = new URL(req.url).searchParams.get("sheet");
    return NextResponse.json(await musterView(adminClient(), sheet));
  } catch (e) { return errJson(e); }
}
