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

/**
 * A MATERIAL HAND: a planner by role, or anyone on Saamaan's grant.
 *
 * Dr Raghu, 3 Oct 2026: "The people who are in the Saamaan app need to also
 * have access to fill in the dates in the material requirement mapping.
 * They can put in a date and a remark." The store and purchase people hold
 * the Saamaan tick, not the planner role — and it is they who know when the
 * material is coming. So the kitting checklist's date, remark and status
 * open to them; adding and removing lines stays with the planners.
 */
export async function requireMaterialHand(): Promise<AuthedUser> {
  const u = await currentUser();
  if (!u || u.disabled) throw new HttpError(401, "Sign in first.");
  if (u.lmsOnly) throw new HttpError(403, "This login opens the training library only.");
  if (["admin", "planner", "project_owner"].includes(u.role)) return u;
  if (await hasGrant(adminClient(), "material_access", u.email, u.isOwner)) return u;
  throw new HttpError(403, "Material dates and remarks are for planners and Saamaan members — the tick on Admin → module access.");
}
