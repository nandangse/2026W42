import type { SupabaseClient } from "@supabase/supabase-js";
import { hasGrant, moduleDoor } from "@/lib/module-door";
import { currentUser, HttpError, type AuthedUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";

/**
 * The Accounts module's door — the same shape as HRMS's (resolveHrmsAccess)
 * and the CRM's (granted), because the three doors should be indistinguishable
 * from the corridor. The grant is a row in accounts_access keyed by EMAIL;
 * the owner is implicit. Before migration 0073 the table does not exist and
 * the answer is simply "no" for everybody but the owner.
 */
export const resolveAccountsAccess = (admin: SupabaseClient, email: string, isOwner: boolean) =>
  hasGrant(admin, "accounts_access", email, isOwner);

/** The one door check every /api/kuber route uses. */
export const requireKuber = moduleDoor("accounts_access", "Kuber");

/**
 * THE SUPPLIER HAND'S SIDE DOOR (Dr Raghu, 3 Oct 2026: "In the Saamaan, also
 * make one section for suppliers … Supplier Report Card and Supplier
 * Outstanding … the supplier payment plan … the other purchasers will not
 * need to know that right now, but Mukesh needs to know that").
 *
 * Mukesh does not hold the Kuber tick, and should not — the P&L is not his
 * desk. So three of Kuber's views open to a NAMED hand who holds the Saamaan
 * tick: the supplier report card, the payables ageing and the payment plan,
 * read in Saamaan → Suppliers. Everything else behind Kuber's door stays
 * behind it. One name, here, so adding a second is one line.
 */
export const SUPPLIER_HANDS = new Set(["mukesh@nandan.co.in"]);
export const isSupplierHand = (u: AuthedUser) => u.isOwner || SUPPLIER_HANDS.has(u.email.toLowerCase());

/** Kuber's door, or — for what `sideDoor` says is a supplier's view — the Saamaan tick held by a supplier hand. */
export async function requireKuberOr(sideDoor: boolean): Promise<AuthedUser> {
  try {
    return await requireKuber();
  } catch (e) {
    if (!sideDoor || !(e instanceof HttpError) || e.status !== 403) throw e;
    const u = await currentUser();
    if (!u || u.disabled) throw e;
    if (!isSupplierHand(u)) throw e;
    if (!(await hasGrant(adminClient(), "material_access", u.email, u.isOwner))) throw e;
    return u;
  }
}
