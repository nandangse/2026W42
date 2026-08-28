import type { SupabaseClient } from "@supabase/supabase-js";
import { currentUser, HttpError, type AuthedUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";

/**
 * Vishwakarma — the design module's door. The divine engineer who built the
 * city Kuber ruled; here, the module where Nandan's machines are designed.
 * Same arrangement as every module door: a grant per email, owner implicit,
 * "no" for everyone else until migration 0076 exists.
 */
export async function resolveVishwakarmaAccess(
  admin: SupabaseClient,
  email: string,
  isOwner: boolean,
): Promise<boolean> {
  if (isOwner) return true;
  const e = String(email || "").trim().toLowerCase();
  if (!e) return false;
  try {
    const { data } = await admin
      .from("vishwakarma_access")
      .select("email")
      .eq("email", e)
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

/** The one door check every /api/vishwakarma route uses. */
export async function requireVishwakarma(): Promise<AuthedUser> {
  const u = await currentUser();
  if (!u || u.disabled) throw new HttpError(401, "Sign in first.");
  if (!(await resolveVishwakarmaAccess(adminClient(), u.email, u.isOwner)))
    throw new HttpError(403, "Vishwakarma is granted per person — the tick on Admin → module access.");
  return u;
}
