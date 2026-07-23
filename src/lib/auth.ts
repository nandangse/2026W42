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
}

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
    .select("role, disabled, email")
    .eq("id", user.id)
    .maybeSingle();
  const role = (profile?.role as Role) ?? "planner";
  return {
    id: user.id,
    email: (profile?.email || user.email || "").toLowerCase(),
    role,
    disabled: !!profile?.disabled,
  };
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

/** planner or admin — the planning-layer write tier. */
export const requirePlanner = () => requireRole("planner", "admin");
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
