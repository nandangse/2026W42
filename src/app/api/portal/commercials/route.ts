import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { errJson, HttpError } from "@/lib/auth";
import { requirePortalUser } from "@/lib/portal/auth";
import { resolveScope } from "@/lib/portal/data";
import { commercials } from "@/lib/portal/commercials";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET /api/portal/commercials?slug=&from=&to= — the customer's money story for the period; outstanding always (see lib/portal/commercials.ts). */
export async function GET(req: Request) {
  try {
    const u = await requirePortalUser();
    const url = new URL(req.url);
    const scope = await resolveScope(u, url.searchParams.get("slug"));
    if (!scope.commercials) throw new HttpError(403, "Commercials are shown to the few who are ticked for it.");
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const d = (v: string | null, dflt: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : dflt);
    const to = d(url.searchParams.get("to"), today);
    const from = d(url.searchParams.get("from"), new Date(Date.parse(to) - 365 * 864e5).toISOString().slice(0, 10));
    return NextResponse.json(await commercials(adminClient(), scope, from, to, today));
  } catch (e) { return errJson(e); }
}
