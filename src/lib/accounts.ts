import type { SupabaseClient } from "@supabase/supabase-js";

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
