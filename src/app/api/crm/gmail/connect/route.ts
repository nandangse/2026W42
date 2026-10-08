import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireMailboxOwner } from "@/crm/auth";
import { adminClient } from "@/lib/supabase/admin";
import { authUrl, oauthConfigured, signState } from "@/crm/gmail";

export const dynamic = "force-dynamic";

/** GET /api/crm/gmail/connect — the door. Open only where the admin has
 *  marked ✉ OAuth Available on the account. */
export async function GET(req: Request) {
  try {
    // ANY GENIE ACCOUNT (8 Oct 2026) — not a CRM gate; the profile row is made on the spot where missing
    const user = await requireMailboxOwner();
    if (!oauthConfigured())
      throw new HttpError(503, "Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in Vercel first — see the setup note.");
    const profileId = user.profileId;
    const { data: p } = await adminClient().from("profiles")
      .select("oauth_available").eq("id", user.id).maybeSingle();
    if (!p?.oauth_available)
      throw new HttpError(403, "Gmail connection is not enabled for you yet — an admin marks ✉ OAuth on your account first.");
    const u = new URL(req.url);
    // ?back=/marketing — the Sending Channels table's own connect button comes back to itself (8 Oct 2026)
    const back = String(u.searchParams.get("back") || "");
    return NextResponse.redirect(authUrl(u.origin, signState(profileId, /^\/[a-z0-9/_-]*(\?[^#]*)?(#.*)?$/i.test(back) ? back : "")));
  } catch (e) {
    return errJson(e);
  }
}
