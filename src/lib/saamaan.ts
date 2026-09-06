import type { SupabaseClient } from "@supabase/supabase-js";
import { hasGrant, moduleDoor } from "@/lib/module-door";
import { currentUser, HttpError, type AuthedUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";

/**
 * Saamaan — the materials module's door (Dr Raghu, 2 Sep 2026: "lets make
 * another App now inside Genie. It will be called Saamaan").
 *
 * सामान — the goods, the stuff, the material a works runs on. Same
 * arrangement as every module door: a grant per email held in
 * material_access, the owner implicit, "no" for everyone else until
 * migration 0118 exists. Every table the module owns is prefixed
 * `material_` — that prefix is the distinction Dr Raghu asked for between
 * Saamaan's rows and the rest of Genie's, inside the one database.
 */
export const resolveSaamaanAccess = (admin: SupabaseClient, email: string, isOwner: boolean) =>
  hasGrant(admin, "material_access", email, isOwner);

/** The one door check every /api/saamaan route uses. */
export const requireSaamaan = moduleDoor("material_access", "Saamaan");
