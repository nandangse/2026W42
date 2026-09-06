/**
 * THE MODULE DOOR — written once (6 Sep 2026).
 *
 * Eight modules had the same forty lines each: a grant table keyed by
 * e-mail, the owner implicit, "no" for everyone else, and a require* that
 * turns "no" into a 403 naming the tick on Admin → module access. Saamaan,
 * Seva, Vishwakarma, Kuber, HRMS and IMS now call this; their exported
 * names (resolveSaamaanAccess, requireSaamaan, …) are kept so no route
 * changes.
 */
import { hasGrant } from "@/lib/grant";
import { currentUser, HttpError, type AuthedUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";

export { hasGrant };

/** Build a module's door: `const requireX = moduleDoor("x_access", "X")`. */
export function moduleDoor(table: string, moduleName: string) {
  return async function require(): Promise<AuthedUser> {
    const u = await currentUser();
    if (!u || u.disabled) throw new HttpError(401, "Sign in first.");
    if (!(await hasGrant(adminClient(), table, u.email, u.isOwner)))
      throw new HttpError(403, `${moduleName} is granted per person — the tick on Admin → module access.`);
    return u;
  };
}
