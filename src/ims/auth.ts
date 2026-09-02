/**
 * Who may open the IMS, and as what.
 *
 * ONE ROW ANSWERS BOTH QUESTIONS. `ims_access` (migration 0111) is the door
 * and the role together, keyed by email like every other module's grant:
 *
 *   ims_admin  — the Management Representative. Everything.
 *   dept_head  — approves their OWN department's documents, writes registers.
 *   auditor    — reads everything including drafts (they must); plans audits.
 *   member     — reads APPROVED documents only; records; works their tasks.
 *
 * The owner is implicitly ims_admin and needs no row. The Admin page's tick
 * creates the row as a `member` — the least somebody could be — and the MR
 * promotes from inside IMS → Settings. A door grant is not a role.
 *
 * Two tables for one question is how they end up disagreeing, which is why
 * this is one table and not a grant plus a separate role list.
 *
 * Every check is SERVER-SIDE, on every route. A hidden button is not a gate:
 * somebody with the URL, an old history entry or a terminal reaches the route
 * regardless, and a member who could POST to the documents route could
 * publish a procedure nobody approved.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { currentUser, HttpError, type AuthedUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";

export type ImsRole = "ims_admin" | "dept_head" | "auditor" | "member";

/**
 * The door. The owner always; everybody else by an explicit row, keyed by
 * email so a grant can be made before the account exists. A missing table
 * reads as "nobody but the owner" — the right way for a gate to fail.
 */
export async function resolveImsAccess(
  admin: SupabaseClient,
  email: string,
  isOwner: boolean,
): Promise<boolean> {
  if (isOwner) return true;
  const e = String(email || "").trim().toLowerCase();
  if (!e) return false;
  try {
    const { data } = await admin.from("ims_access").select("email").eq("email", e).maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

export interface ImsUser extends AuthedUser {
  imsRole: ImsRole;
  department: string | null;
  /**
   * The person's id. This is GENIE'S auth id — the same one every other
   * module names somebody by — because the IMS lives in Genie's database.
   * There is no mirror table and no second uuid for the same person.
   */
  profileId: string | null;
}

/**
 * Require a signed-in account that may use the IMS, and resolve its role.
 *
 * Throws rather than returning null, so a route that forgets to check cannot
 * quietly serve data.
 */
export async function requireIms(): Promise<ImsUser> {
  const u = await currentUser();
  if (!u) throw new HttpError(401, "Not signed in");
  if (u.disabled) throw new HttpError(403, "Account disabled");

  let imsRole: ImsRole = u.isOwner ? "ims_admin" : "member";
  let department: string | null = null;
  let granted = u.isOwner;

  try {
    const { data } = await adminClient()
      .from("ims_access")
      .select("role, department")
      .eq("email", u.email)
      .maybeSingle();
    if (data) {
      granted = true;
      // The owner stays the MR whatever the row says — the row exists for
      // department, and demoting the owner by editing it would lock the
      // module's only administrator out of it.
      if (!u.isOwner) imsRole = (data.role as ImsRole) ?? "member";
      department = data.department ?? null;
    }
  } catch {
    // Before 0111 there is no table, and the answer is "nobody but the owner".
  }

  if (!granted)
    throw new HttpError(403, "The IMS is granted per person — the tick on Admin → module access.");

  return { ...u, imsRole, department, profileId: u.id };
}

/** True without throwing — for the page, which redirects rather than errors. */
export async function mayUseIms(): Promise<boolean> {
  const u = await currentUser();
  return !!u && !u.disabled && (await resolveImsAccess(adminClient(), u.email, u.isOwner));
}

// ---------------------------------------------------------------- the tiers

/** The Management Representative. Approves, defines, deletes. */
export function isAdmin(u: ImsUser): boolean {
  return u.imsRole === "ims_admin";
}
/** Admin or the head of a department — the two who may write. */
export function isHead(u: ImsUser): boolean {
  return u.imsRole === "ims_admin" || u.imsRole === "dept_head";
}

/** Require the MR. */
export async function requireImsAdmin(): Promise<ImsUser> {
  const u = await requireIms();
  if (!isAdmin(u)) throw new HttpError(403, "Only the IMS Admin (MR) may do this.");
  return u;
}

/**
 * Require somebody who may approve a document in `department`.
 *
 * The MR anywhere; a department head only in their OWN department. A head who
 * could approve another department's procedure is a head who could approve
 * their own work under a different heading.
 */
export async function requireApprover(department: string | null): Promise<ImsUser> {
  const u = await requireIms();
  if (isAdmin(u)) return u;
  if (
    u.imsRole === "dept_head" &&
    u.department &&
    String(department || "").toLowerCase() === u.department.toLowerCase()
  )
    return u;
  throw new HttpError(403, "Only the MR, or the head of that department, may do this.");
}
