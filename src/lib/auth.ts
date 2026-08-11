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
}

/** Tiers, mirroring the SQL helpers in migration 0008. */
export const READER_ROLES: Role[] = ["admin", "planner", "project_owner", "user", "sales", "viewer"];
/** May write the planning layer (plans, milestones, materials, priority). */
export const EDITOR_ROLES: Role[] = ["admin", "planner", "project_owner"];
/** May write tasks & comments — editors plus rank-and-file users. */
export const TASKER_ROLES: Role[] = ["admin", "planner", "project_owner", "user", "sales"];

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
  // Read the role with the service client so a strict profiles RLS never hides
  // the caller's own role from this lookup.
  const { data: profile } = await adminClient()
    .from("profiles")
    .select("role, disabled, email, initials, display_name, erp_owner")
    .eq("id", user.id)
    .maybeSingle();
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

export async function requireRole(...roles: Role[]): Promise<AuthedUser> {
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
/** uploader or admin — the upload door. */
export const requireUploader = () => requireRole("uploader", "admin");

/** Wrap a handler so thrown HttpErrors become JSON responses. */
export function errJson(e: unknown): NextResponse {
  if (e instanceof HttpError)
    return NextResponse.json({ error: e.message }, { status: e.status });
  const msg = e instanceof Error ? e.message : "Internal error";
  return NextResponse.json({ error: msg }, { status: 500 });
}
