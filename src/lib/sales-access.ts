// Sales Genie access — granted per person, default NOBODY (spec: the product
// and pricing material is the most commercially sensitive data in Nandan).
// The owner is implicit, mirroring the goals-access pattern.
import type { SupabaseClient } from "@supabase/supabase-js";

export async function resolveSalesAccess(
  admin: SupabaseClient,
  personId: string,
  isOwner: boolean,
): Promise<boolean> {
  if (isOwner) return true;
  try {
    const { data } = await admin
      .from("sales_access")
      .select("person_id")
      .eq("person_id", personId)
      .maybeSingle();
    return !!data;
  } catch {
    return false; // table missing (pre-0013) reads as "no access"
  }
}
