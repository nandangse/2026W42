// Sales Genie access — role-based since the "Sales team" role landed:
// the owner, admins and sales-team members get in; everyone else does not.
// A legacy per-person sales_access grant (0013) is still honoured so nothing
// that was shared before the role existed silently disappears.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Role } from "./types";

export async function resolveSalesAccess(
  admin: SupabaseClient,
  personId: string,
  isOwner: boolean,
  role?: Role,
): Promise<boolean> {
  if (isOwner) return true;
  if (role === "admin" || role === "sales") return true;
  try {
    const { data } = await admin
      .from("sales_access")
      .select("person_id")
      .eq("person_id", personId)
      .maybeSingle();
    return !!data;
  } catch {
    return false; // table missing reads as "no access"
  }
}
