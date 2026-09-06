import type { SupabaseClient } from "@supabase/supabase-js";
import { hasGrant, moduleDoor } from "@/lib/module-door";
import { currentUser, HttpError, type AuthedUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";

/**
 * Vishwakarma — the design module's door. The divine engineer who built the
 * city Kuber ruled; here, the module where Nandan's machines are designed.
 * Same arrangement as every module door: a grant per email, owner implicit,
 * "no" for everyone else until migration 0076 exists.
 */
export const resolveVishwakarmaAccess = (admin: SupabaseClient, email: string, isOwner: boolean) =>
  hasGrant(admin, "vishwakarma_access", email, isOwner);

/** The one door check every /api/vishwakarma route uses. */
export const requireVishwakarma = moduleDoor("vishwakarma_access", "Vishwakarma");
