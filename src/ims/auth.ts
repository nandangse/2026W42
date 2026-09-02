/**
 * Who may open the IMS, and as what.
 *
 * TWO GATES, and they are different questions.
 *
 *   1. THE DOOR — may this account open /ims at all? A row in `ims_access` in
 *      GENIE's database, keyed by email, owner implicit. The same grant every
 *      module uses, made by the same tick on Admin -> module access. It lives
 *      in Genie's database because that is where the Admin screen and the
 *      login are; the IMS's own database cannot see it.
 *
 *   2. THE ROLE — what may they do once inside? A row in `ims_profile` in the
 *      IMS's OWN database: ims_admin (the Management Representative),
 *      dept_head, auditor, member. Anybody admitted through the door who has
 *      no profile row yet is created as a `member`, which is the least they
 *      could be.
 *
 * Every check is SERVER-SIDE, on every route. A hidden button is not a gate:
 * somebody with the URL, an old history entry or a terminal reaches the route
 * regardless, and a member who could POST to the documents route could publish
 * a procedure nobody approved.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { currentUser, HttpError, type AuthedUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { imsDb, imsConfigured } from "./db";

export type ImsRole = "ims_admin" | "dept_head" | "auditor" | "member";

/**
 * The door. The owner always; everybody else by an explicit row in
 * ims_access, keyed by email so a grant can be made before the account
 * exists. A missing table reads as "nobody but the owner" — which is the
 * right way for a gate to fail.
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
   * The IMS database's OWN id for this person, or null before their profile
   * row exists. Every IMS column that names a user takes THIS id — the Genie
   * auth id on `id` means nothing in the IMS project and must never be
   * written there (docs/DATABASE-SPLIT.md).
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

  if (!(await resolveImsAccess(adminClient(), u.email, u.isOwner)))
    throw new HttpError(403, "The IMS is granted per person — the tick on Admin → module access.");

  let imsRole: ImsRole = u.isOwner ? "ims_admin" : "member";
  let department: string | null = null;
  let profileId: string | null = null;

  if (imsConfigured()) {
    // Keep the mirror row current. Matched on EMAIL, never on id — the
    // profile's uuid is this database's own and Genie's auth id means nothing
    // here. The two must never be conflated (docs/DATABASE-SPLIT.md).
    const db = imsDb();
    try {
      const { data } = await db
        .from("ims_profile")
        .select("id, role, department")
        .eq("email", u.email)
        .maybeSingle();
      if (data) {
        imsRole = data.role as ImsRole;
        department = data.department ?? null;
        profileId = data.id;
        await db
          .from("ims_profile")
          .update({
            full_name: u.displayName || u.email.split("@")[0],
            initials: u.initials,
            last_seen_at: new Date().toISOString(),
          })
          .eq("email", u.email);
      } else {
        // Admitted through the door but no profile yet: create the LEAST they
        // could be. A door grant is not a role.
        const { data: made } = await db
          .from("ims_profile")
          .insert({
            email: u.email,
            full_name: u.displayName || u.email.split("@")[0],
            initials: u.initials,
            role: u.isOwner ? "ims_admin" : "member",
          })
          .select("id, role, department")
          .maybeSingle();
        if (made) {
          imsRole = made.role as ImsRole;
          department = made.department ?? null;
          profileId = made.id;
        }
      }
    } catch {
      // Before the migrations run there is no profile table. The door still
      // works; the screens say which migration is missing.
    }
  }
  return { ...u, imsRole, department, profileId };
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
/** Admin or the head of a department — the two who may review and approve. */
export function isHead(u: ImsUser): boolean {
  return u.imsRole === "ims_admin" || u.imsRole === "dept_head";
}

/** Require the MR. */
export async function requireImsAdmin(): Promise<ImsUser> {
  const u = await requireIms();
  if (!isAdmin(u))
    throw new HttpError(403, "Only the IMS Admin (MR) may do this.");
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
