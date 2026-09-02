import type { SupabaseClient } from "@supabase/supabase-js";
import { currentUser, HttpError, type AuthedUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";

/**
 * Saamaan — the materials module's door (Dr Raghu, 2 Sep 2026: "lets make
 * another App now inside Genie. It will be called Saamaan").
 *
 * सामान — the goods, the stuff, the material a works runs on. Same
 * arrangement as every module door: a grant per email held in
 * material_access, the owner implicit, "no" for everyone else until
 * migration 0117 exists. Every table the module owns is prefixed
 * `material_` — that prefix is the distinction Dr Raghu asked for between
 * Saamaan's rows and the rest of Genie's, inside the one database.
 */
export async function resolveSaamaanAccess(
  admin: SupabaseClient,
  email: string,
  isOwner: boolean,
): Promise<boolean> {
  if (isOwner) return true;
  const e = String(email || "").trim().toLowerCase();
  if (!e) return false;
  try {
    const { data } = await admin
      .from("material_access")
      .select("email")
      .eq("email", e)
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

/** The one door check every /api/saamaan route uses. */
export async function requireSaamaan(): Promise<AuthedUser> {
  const u = await currentUser();
  if (!u || u.disabled) throw new HttpError(401, "Sign in first.");
  if (!(await resolveSaamaanAccess(adminClient(), u.email, u.isOwner)))
    throw new HttpError(403, "Saamaan is granted per person — the tick on Admin → module access.");
  return u;
}
