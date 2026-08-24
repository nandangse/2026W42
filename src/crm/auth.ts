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
import { adminClient } from "@/lib/supabase/admin";
import { crmDb, crmConfigured } from "./db";

/**
 * Who may open the CRM.
 *
 * The owner always; everybody else by an explicit row in crm_access (0055),
 * keyed by email so a grant can be made before the account exists. Kept in
 * GENIE'S database rather than the CRM's: the CRM has its own and cannot read
 * this one, but the admin screen that grants it and the login it grants both
 * live here.
 *
 * A missing table reads as "nobody but the owner", which is the right way for
 * a gate to fail.
 */
async function granted(email: string): Promise<boolean> {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return false;
  if (e === RAGHU_EMAIL) return true;
  try {
    const { data } = await adminClient().from("crm_access").select("email").eq("email", e).maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

export interface CrmUser extends AuthedUser {
  crmRole: string;
  /**
   * The CRM database's OWN id for this person, or null before their profile
   * row exists. Every CRM column that names a user takes THIS id -- the Genie
   * auth id on `id` means nothing in the CRM project and must never be
   * written there (docs/DATABASE-SPLIT.md).
   */
  profileId: string | null;
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

  if (!(await granted(u.email)))
    throw new HttpError(403, "The CRM is not open to this account.");

  let crmRole = "sales_head";
  let profileId: string | null = null;
  if (crmConfigured()) {
    // Keep the mirror row current. Matched on EMAIL, never on id -- the
    // profile's uuid is this database's own and Genie's auth id means nothing
    // here. The two must never be conflated (docs/DATABASE-SPLIT.md).
    const db = crmDb();
    const { data } = await db
      .from("profile")
      .select("id, role")
      .eq("email", u.email)
      .maybeSingle();
    if (data) {
      crmRole = data.role;
      profileId = data.id;
      await db
        .from("profile")
        .update({ full_name: u.displayName, initials: u.initials, last_seen_at: new Date().toISOString() })
        .eq("email", u.email);
    }
  }
  return { ...u, crmRole, profileId };
}

/** True without throwing — for the page, which redirects rather than errors. */
export async function mayUseCrm(): Promise<boolean> {
  const u = await currentUser();
  return !!u && !u.disabled && (await granted(u.email));
}
