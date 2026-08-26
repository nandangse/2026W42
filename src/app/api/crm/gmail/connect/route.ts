import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { adminClient } from "@/lib/supabase/admin";
import { authUrl, oauthConfigured, signState } from "@/crm/gmail";

export const dynamic = "force-dynamic";

/** GET /api/crm/gmail/connect — the door. Open only where the admin has
 *  marked ✉ OAuth Available on the account. */
export async function GET(req: Request) {
  try {
    const user = await requireCrm();
    if (!oauthConfigured())
      throw new HttpError(503, "Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in Vercel first — see the setup note.");
    if (!user.profileId) throw new HttpError(403, "No CRM profile for this account yet.");
    const { data: p } = await adminClient().from("profiles")
      .select("oauth_available").eq("id", user.id).maybeSingle();
    if (!p?.oauth_available)
      throw new HttpError(403, "Gmail connection is not enabled for you yet — an admin marks ✉ OAuth on your account first.");
    const origin = new URL(req.url).origin;
    return NextResponse.redirect(authUrl(origin, signState(user.profileId)));
  } catch (e) {
    return errJson(e);
  }
}
