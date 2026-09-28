// Server-side auth helpers for route handlers. Every /api route resolves the
// caller here first, so authorization is enforced server-side (not just hidden
// in the UI).
import { NextResponse } from "next/server";
import { supabaseServer } from "./supabase/server";
import { adminClient } from "./supabase/admin";
import type { Role } from "./types";

export interface AuthedUser {
  id: string;
  email: string;
  role: Role;
  disabled: boolean;
  initials: string | null;
  displayName: string | null;
  erpOwner: string | null;
  /** The single account above the admin tier — governs the other admins. */
  isOwner: boolean;
  /** Which room they are in. See src/lib/groups.ts — these are not roles. */
  lc: boolean;
  stratcom: boolean;
  management: boolean;
  /** Their only door is the training library. See currentUser() for why it
   *  is written as a restriction rather than as eight permissions. */
  lmsOnly: boolean;
}

/** Tiers, mirroring the SQL helpers in migration 0008. */
const READER_ROLES: Role[] = ["admin", "planner", "project_owner", "user", "sales", "viewer"];
/** May write the planning layer (plans, milestones, materials, priority). */
const EDITOR_ROLES: Role[] = ["admin", "planner", "project_owner"];
/** May write tasks & comments — editors plus rank-and-file users. */
const TASKER_ROLES: Role[] = ["admin", "planner", "project_owner", "user", "sales"];

export const RAGHU_EMAIL = (
  process.env.RAGHU_EMAIL || "raghu@nandan.co.in"
).toLowerCase();

/** Resolve the current session's user + role, or null if unauthenticated. */
export async function currentUser(): Promise<AuthedUser | null> {
  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  /**
   * Read the role with the service client so a strict profiles RLS never
   * hides the caller's own role from this lookup.
   *
   * THE COLUMNS THIS ASKS FOR MUST ALL EXIST, ALWAYS.
   *
   * 28 Sep 2026: lms_only was added to this list before migration 0170 had
   * been run. PostgREST rejects the WHOLE select when one column is unknown,
   * so `profile` came back null for everybody — and the line below reads a
   * null profile as role "planner" with no initials and no name. Every
   * person in the company silently lost their role, and the Admin menu with
   * it, because of a column that did not exist yet.
   *
   * So the identity read is split. These columns have always been there and
   * this query cannot fail; anything newer is asked for separately, below,
   * where its absence costs only that one field. A login must never depend
   * on a migration having been run.
   */
  const admin = adminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role, disabled, email, initials, display_name, erp_owner, lc, stratcom, management")
    .eq("id", user.id)
    .maybeSingle();
  /* Newer than the line above, and asked for on its own so that a database
     without it loses the flag rather than the person's whole identity. */
  let lmsOnly = false;
  {
    const { data } = await admin.from("profiles").select("lms_only").eq("id", user.id).maybeSingle();
    lmsOnly = !!data?.lms_only;
  }
  const role = (profile?.role as Role) ?? "planner";
  const email = (profile?.email || user.email || "").toLowerCase();
  return {
    id: user.id,
    email,
    role,
    disabled: !!profile?.disabled,
    initials: profile?.initials ?? null,
    displayName: profile?.display_name ?? null,
    erpOwner: profile?.erp_owner ?? null,
    isOwner: email === RAGHU_EMAIL,
    lc: !!profile?.lc,
    stratcom: !!profile?.stratcom,
    management: !!profile?.management,
    /**
     * A LEARNER AND NOTHING ELSE (Dr Raghu, 27 Sep 2026).
     *
     * Someone given a Genie login only for the training library — a
     * consultant, a contractor. Written as a restriction on the PERSON, not
     * as a permission on each module, because a permission has to be
     * withheld eight times and correctly every time, while a restriction has
     * to be applied once. Undefined until migration 0170, which reads as
     * false: an existing user does not become a learner by our forgetting.
     */
    lmsOnly,
  };
}

/** Require the owner account. */
export async function requireOwner(): Promise<AuthedUser> {
  const u = await requireUser();
  if (!u.isOwner) throw new HttpError(403, `Only ${RAGHU_EMAIL} may do this`);
  return u;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Require a signed-in, non-disabled user. Throws HttpError otherwise. */
export async function requireUser(): Promise<AuthedUser> {
  const u = await currentUser();
  if (!u) throw new HttpError(401, "Not signed in");
  if (u.disabled) throw new HttpError(403, "Account disabled");
  return u;
}

async function requireRole(...roles: Role[]): Promise<AuthedUser> {
  const u = await requireUser();
  if (!roles.includes(u.role)) throw new HttpError(403, "Forbidden");
  return u;
}

/** May read the boards. */
export const requireReader = () => requireRole(...READER_ROLES);
/** May write the planning layer (plans, milestones, materials, priority). */
export const requirePlanner = () => requireRole(...EDITOR_ROLES);
/** May write tasks & comments — editors plus rank-and-file users. */
export const requireTasker = () => requireRole(...TASKER_ROLES);
/** admin only. */
export const requireAdmin = () => requireRole("admin");
/**
 * The Leadership Circle — the Delivered Jobs workspace.
 *
 * Hiding the tab is not a gate. Somebody with the URL, an old history entry or
 * a terminal reaches the route regardless, and the figures behind it are the
 * ones being restricted.
 */
export async function requireLC(): Promise<AuthedUser> {
  const u = await requireUser();
  if (!(u.isOwner || u.lc || u.stratcom))
    throw new HttpError(403, "Delivered Jobs is for the Leadership Circle.");
  return u;
}

/**
 * Stratcom — the forward-looking figures, and the On Floor flag.
 *
 * The owner counts as Stratcom without being stored as one (see
 * src/lib/groups.ts).
 */
export async function requireStratcom(): Promise<AuthedUser> {
  const u = await requireUser();
  if (!(u.isOwner || u.stratcom))
    throw new HttpError(403, "Only Stratcom may change this.");
  return u;
}

/**
 * HRMS — the people records, at /hrms.
 *
 * Granted per person and to nobody by default (migration 0047). Not a role:
 * the three people who hold it today are an owner, a director and an HR
 * manager, and no role in this app describes that set.
 *
 * The check is here and on every /api/hrms route, not only on the page. A
 * hidden link is not a gate.
 */
export async function requireHrms(): Promise<AuthedUser> {
  const u = await requireUser();
  const { resolveHrmsAccess } = await import("./hrms");
  if (!(await resolveHrmsAccess(adminClient(), u.email, u.isOwner)))
    throw new HttpError(403, "HRMS holds people records. Ask Dr Raghu for access.");
  return u;
}

/** uploader or admin — the upload door. */
export const requireUploader = () => requireRole("uploader", "admin");

/** Wrap a handler so thrown HttpErrors become JSON responses. */
export function errJson(e: unknown): NextResponse {
  if (e instanceof HttpError)
    return NextResponse.json({ error: e.message }, { status: e.status });
  const msg = e instanceof Error ? e.message : "Internal error";
  return NextResponse.json({ error: msg }, { status: 500 });
}
