import type { SupabaseClient } from "@supabase/supabase-js";
import { currentUser, HttpError, type AuthedUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";

/**
 * The Accounts module's door — the same shape as HRMS's (resolveHrmsAccess)
 * and the CRM's (granted), because the three doors should be indistinguishable
 * from the corridor. The grant is a row in accounts_access keyed by EMAIL;
 * the owner is implicit. Before migration 0073 the table does not exist and
 * the answer is simply "no" for everybody but the owner.
 */
export async function resolveAccountsAccess(
  admin: SupabaseClient,
  email: string,
  isOwner: boolean,
): Promise<boolean> {
  if (isOwner) return true;
  const e = String(email || "").trim().toLowerCase();
  if (!e) return false;
  try {
    const { data } = await admin
      .from("accounts_access")
      .select("email")
      .eq("email", e)
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

/** The one door check every /api/kuber route uses. */
export async function requireKuber(): Promise<AuthedUser> {
  const u = await currentUser();
  if (!u || u.disabled) throw new HttpError(401, "Sign in first.");
  if (!(await resolveAccountsAccess(adminClient(), u.email, u.isOwner)))
    throw new HttpError(403, "Kuber is granted per person — the tick on Admin → module access.");
  return u;
}
