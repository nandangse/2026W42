import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireMailboxOwner } from "@/crm/auth";
import { adminClient } from "@/lib/supabase/admin";
import { crmDb } from "@/crm/db";
import { exchangeCode, gmailGet, verifyState, stateBack } from "@/crm/gmail";

export const dynamic = "force-dynamic";

/** GET /api/crm/gmail/callback — Google returns; the refresh token goes to
 *  the Vault, the mailbox row keeps the uuid, the profile remembers when. */
export async function GET(req: Request) {
  try {
    const user = await requireMailboxOwner();   // any Genie account, 8 Oct 2026
    const u = new URL(req.url);
    if (u.searchParams.get("error"))
      return NextResponse.redirect(`${u.origin}/crm?gmail=${encodeURIComponent(u.searchParams.get("error") as string)}`);
    const code = u.searchParams.get("code");
    const state = u.searchParams.get("state");
    const stateProfile = state ? verifyState(state) : null;
    if (!code || !stateProfile || stateProfile !== user.profileId)
      throw new HttpError(400, "The connect flow did not come back the way it left. Start again from your Profile.");

    const tok = await exchangeCode(u.origin, code);
    if (!tok.refresh_token)
      throw new HttpError(400, "Google returned no refresh token — remove the app's access at myaccount.google.com/permissions and connect again.");

    const gp = await gmailGet(tok.access_token, "profile");
    const email = String(gp.emailAddress ?? "").toLowerCase();
    const db = crmDb();
    /* COMPANY MAIL ONLY — unless the address is a configured Sending Channel (Dr Raghu, 8 Oct
       2026: "Put a button next to this only to connect to Gmail" on nimesh@fabrometals.com).
       A channel somebody has deliberately added to Marketing is spoken for; a random personal
       Gmail still is not. */
    if (!email.endsWith("@nandan.co.in")) {
      const { data: ch } = await db.from("mk_channel").select("id").eq("kind", "gmail").ilike("email", email).maybeSingle();
      if (!ch) throw new HttpError(400, `${email} is not an @nandan.co.in mailbox, nor a Sending Channel set up in Marketing. Company mail only.`);
    }
    const { data: existing } = await db.from("mailbox").select("id").eq("email_address", email).maybeSingle();
    if (existing) {
      const { error } = await db.rpc("rotate_mailbox_credential", { p_mailbox_id: existing.id, p_secret: tok.refresh_token });
      if (error) throw new HttpError(500, error.message);
      await db.from("mailbox").update({
        profile_id: user.profileId, credential_kind: "oauth_refresh_token",
        status: "active", last_error: null, last_verified_at: new Date().toISOString(),
      }).eq("id", existing.id);
    } else {
      const { data: ref, error: verr } = await db.rpc("store_mailbox_credential", { p_email: email, p_secret: tok.refresh_token });
      if (verr) throw new HttpError(500, verr.message);
      const { error } = await db.from("mailbox").insert({
        profile_id: user.profileId, email_address: email, username: email,
        credential_ref: ref, credential_kind: "oauth_refresh_token",
        status: "active", last_verified_at: new Date().toISOString(),
      });
      if (error) throw new HttpError(500, error.message);
    }
    await adminClient().from("profiles").update({ oauth_connected_at: new Date().toISOString() }).eq("id", user.id);
    const back = state ? stateBack(state) : "";
    return NextResponse.redirect(`${u.origin}${back || "/crm?gmail=connected"}`);
  } catch (e) {
    return errJson(e);
  }
}
