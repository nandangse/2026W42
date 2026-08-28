import type { SupabaseClient } from "@supabase/supabase-js";

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
