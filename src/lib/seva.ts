import type { SupabaseClient } from "@supabase/supabase-js";
import { hasGrant, moduleDoor } from "@/lib/module-door";
import { currentUser, HttpError, type AuthedUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";

/**
 * Seva — the customer-service module's door (Dr Raghu, 30 Aug 2026).
 * Service as an act of care, which is what the word means; here, the module
 * where every delivered machine and every customer issue is looked after.
 * Same arrangement as every module door: a grant per email, owner implicit,
 * "no" for everyone else until migration 0107 exists.
 */
export const resolveSevaAccess = (admin: SupabaseClient, email: string, isOwner: boolean) =>
  hasGrant(admin, "seva_access", email, isOwner);

/** The one door check every /api/seva route uses. */
export const requireSeva = moduleDoor("seva_access", "Seva");
