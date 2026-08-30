import type { SupabaseClient } from "@supabase/supabase-js";
import { currentUser, HttpError, type AuthedUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";

/**
 * Seva — the customer-service module's door (Dr Raghu, 30 Aug 2026).
 * Service as an act of care, which is what the word means; here, the module
 * where every delivered machine and every customer issue is looked after.
 * Same arrangement as every module door: a grant per email, owner implicit,
 * "no" for everyone else until migration 0107 exists.
 */
export async function resolveSevaAccess(
  admin: SupabaseClient,
  email: string,
  isOwner: boolean,
): Promise<boolean> {
  if (isOwner) return true;
  const e = String(email || "").trim().toLowerCase();
  if (!e) return false;
  try {
    const { data } = await admin
      .from("seva_access")
      .select("email")
      .eq("email", e)
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

/** The one door check every /api/seva route uses. */
export async function requireSeva(): Promise<AuthedUser> {
  const u = await currentUser();
  if (!u || u.disabled) throw new HttpError(401, "Sign in first.");
  if (!(await resolveSevaAccess(adminClient(), u.email, u.isOwner)))
    throw new HttpError(403, "Seva is granted per person — the tick on Admin → module access.");
  return u;
}
