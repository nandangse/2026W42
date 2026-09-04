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
    // "for vinay its creating issue" (Dr Raghu, 4 Sep 2026): an HRMS-only
    // person had no mirror row in the CRM and the connect stopped dead. The
    // row is made here on the spot — email, name, initials from Genie, the
    // quietest CRM role — so a connected Gmail never waits on a CRM visit.
    let profileId = user.profileId;
    if (!profileId) {
      const { crmDb } = await import("@/crm/db");
      const { data: made, error } = await crmDb().from("profile")
        .upsert({ email: user.email, full_name: user.displayName || user.email.split("@")[0], initials: user.initials, role: "viewer", is_active: true }, { onConflict: "email" })
        .select("id").single();
      if (error || !made) throw new HttpError(503, `Could not make a CRM profile for ${user.email}: ${error?.message || "no row"}`);
      profileId = String(made.id);
    }
    const { data: p } = await adminClient().from("profiles")
      .select("oauth_available").eq("id", user.id).maybeSingle();
    if (!p?.oauth_available)
      throw new HttpError(403, "Gmail connection is not enabled for you yet — an admin marks ✉ OAuth on your account first.");
    const origin = new URL(req.url).origin;
    return NextResponse.redirect(authUrl(origin, signState(profileId)));
  } catch (e) {
    return errJson(e);
  }
}
