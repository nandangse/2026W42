import { NextResponse } from "next/server";
import { requireHrms, errJson } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { musterView, personView, musterPeople } from "@/lib/attendance-muster";

export const dynamic = "force-dynamic";

/**
 * GET /api/hrms/muster            — the latest month (or ?sheet=<id>) per person
 * GET /api/hrms/muster?person=ID  — one person across every month
 * GET /api/hrms/muster?people=1   — everyone who appears in any muster
 */
export async function GET(req: Request) {
  try {
    await requireHrms();
    const u = new URL(req.url); const admin = adminClient();
    if (u.searchParams.get("people")) return NextResponse.json({ people: await musterPeople(admin) });
    const person = u.searchParams.get("person");
    if (person) return NextResponse.json(await personView(admin, person));
    return NextResponse.json(await musterView(admin, u.searchParams.get("sheet")));
  } catch (e) { return errJson(e); }
}
