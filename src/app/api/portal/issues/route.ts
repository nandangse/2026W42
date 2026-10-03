import { NextResponse } from "next/server";
import { errJson } from "@/lib/auth";
import { requirePortalUser } from "@/lib/portal/auth";
import { loadIssues, resolveScope } from "@/lib/portal/data";

export const dynamic = "force-dynamic";

/** GET /api/portal/issues?slug= — Seva's tickets on this organisation's machines (or at these locations). */
export async function GET(req: Request) {
  try {
    const u = await requirePortalUser();
    const scope = await resolveScope(u, new URL(req.url).searchParams.get("slug"));
    return NextResponse.json({ issues: await loadIssues(scope) });
  } catch (e) { return errJson(e); }
}
