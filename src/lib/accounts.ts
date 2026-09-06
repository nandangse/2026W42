import type { SupabaseClient } from "@supabase/supabase-js";
import { hasGrant, moduleDoor } from "@/lib/module-door";
import { currentUser, HttpError, type AuthedUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";

/**
 * The Accounts module's door — the same shape as HRMS's (resolveHrmsAccess)
 * and the CRM's (granted), because the three doors should be indistinguishable
 * from the corridor. The grant is a row in accounts_access keyed by EMAIL;
 * the owner is implicit. Before migration 0073 the table does not exist and
 * the answer is simply "no" for everybody but the owner.
 */
export const resolveAccountsAccess = (admin: SupabaseClient, email: string, isOwner: boolean) =>
  hasGrant(admin, "accounts_access", email, isOwner);

/** The one door check every /api/kuber route uses. */
export const requireKuber = moduleDoor("accounts_access", "Kuber");
