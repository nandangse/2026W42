/**
 * Who may open the CRM.
 *
 * One login, Genie's. The session cookie is readable at /crm because it is the
 * same origin, so nobody signs in twice and there is no second user list to
 * keep in step.
 *
 * RIGHT NOW: Dr Raghu alone. That is a single check in one place rather than a
 * role system nobody has designed yet -- when the sales team comes in, this
 * function grows a lookup against crm_user and nothing else changes.
 */
import { currentUser, HttpError, RAGHU_EMAIL, type AuthedUser } from "@/lib/auth";
import { crmDb, crmConfigured } from "./db";

export interface CrmUser extends AuthedUser {
  crmRole: string;
}

/**
 * Require a signed-in account that may use the CRM.
 *
 * Throws rather than returning null, so a route that forgets to check cannot
 * quietly serve data.
 */
export async function requireCrm(): Promise<CrmUser> {
  const u = await currentUser();
  if (!u) throw new HttpError(401, "Not signed in");
  if (u.disabled) throw new HttpError(403, "Account disabled");

  // The only door open today.
  if (u.email.toLowerCase() !== RAGHU_EMAIL)
    throw new HttpError(403, "The CRM is not open yet.");

  let crmRole = "sales_head";
  if (crmConfigured()) {
    // Keep the mirror row current, and stamp the real auth id the first time
    // he signs in -- the seed row carries a placeholder until then.
    const db = crmDb();
    const { data } = await db
      .from("crm_user")
      .select("id, crm_role")
      .eq("email", u.email)
      .maybeSingle();
    if (data) {
      crmRole = data.crm_role;
      await db
        .from("crm_user")
        .update({ id: u.id, display_name: u.displayName, initials: u.initials, last_seen_at: new Date().toISOString() })
        .eq("email", u.email);
    }
  }
  return { ...u, crmRole };
}

/** True without throwing — for the page, which redirects rather than errors. */
export async function mayUseCrm(): Promise<boolean> {
  const u = await currentUser();
  return !!u && !u.disabled && u.email.toLowerCase() === RAGHU_EMAIL;
}
