import { NextResponse } from "next/server";
import { errJson } from "@/lib/auth";
import { requirePortalUser } from "@/lib/portal/auth";
import { loadPos, resolveScope } from "@/lib/portal/data";

export const dynamic = "force-dynamic";

/** GET /api/portal/pos?slug=&which=open|done — the purchase orders Nandan has placed on this supplier. */
export async function GET(req: Request) {
  try {
    const u = await requirePortalUser();
    const url = new URL(req.url);
    const scope = await resolveScope(u, url.searchParams.get("slug"));
    const which = url.searchParams.get("which") === "done" ? "done" : "open";
    return NextResponse.json({ pos: await loadPos(scope, which) });
  } catch (e) { return errJson(e); }
}
