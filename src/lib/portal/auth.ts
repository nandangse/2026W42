import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { adminClient } from "@/lib/supabase/admin";
import { currentUser, HttpError } from "@/lib/auth";

/**
 * THE PORTAL'S OWN LOGIN (Dr Raghu, 3 Oct 2026).
 *
 * "This will have a login ID and password separately for portal customer as
 * well as portal supplier." A customer's purchase manager and a supplier's
 * despatch clerk are not Nandan people and must never become Genie users, so
 * the portal is a realm of its own on the /kindle pattern: a row in
 * portal_user with a scrypt hash, and a signed cookie naming the user, an
 * expiry and the password version — change the password and every other
 * browser is out. The cookie proves who somebody is; every /api/portal route
 * then reads the role and the organisation off the row.
 *
 * Nandan's own people may also hold portal rows (admin, national manager,
 * location manager, location technician). And the Genie owner or a Genie
 * admin walks in on their Genie session as a portal admin, so the people who
 * run Genie are never locked out of the portal they asked for.
 */
export const PORTAL_COOKIE = "portal_who";
const DAYS = 30;

export type PortalRole = "customer" | "supplier" | "admin" | "national_manager" | "location_manager" | "location_technician";
export const PORTAL_ROLES: PortalRole[] = ["customer", "supplier", "admin", "national_manager", "location_manager", "location_technician"];
export const ROLE_LABEL: Record<PortalRole, string> = {
  customer: "Customer", supplier: "Supplier", admin: "Admin", national_manager: "National manager",
  location_manager: "Location manager", location_technician: "Location technician",
};
export const STAFF_ROLES: PortalRole[] = ["admin", "national_manager", "location_manager", "location_technician"];

export interface PortalUser {
  id: string;
  email: string;
  name: string;
  role: PortalRole;
  org_slug: string | null;
  locations: string[];
  sees_commercials: boolean;
  active: boolean;
  must_change: boolean;
  /** how this browser got in */
  via: "portal" | "genie";
}

export const isStaff = (u: Pick<PortalUser, "role">) => STAFF_ROLES.includes(u.role);
export const isPortalAdmin = (u: Pick<PortalUser, "role">) => u.role === "admin";
/** Everything, not bound to locations. */
export const seesAll = (u: Pick<PortalUser, "role">) => u.role === "admin" || u.role === "national_manager";
export const isLocationBound = (u: Pick<PortalUser, "role">) => u.role === "location_manager" || u.role === "location_technician";
/** Commercials: the admin, and whoever has been given the tick. */
export const seesCommercials = (u: Pick<PortalUser, "role" | "sees_commercials">) => u.role === "admin" || !!u.sees_commercials;

/* ----------------------------------------------------------- passwords */
const secret = () => String(process.env.SUPABASE_SERVICE_ROLE_KEY || "genie");
export const newSalt = () => randomBytes(16).toString("hex");
export function hashPassword(pw: string, salt: string): string {
  return scryptSync(pw.normalize("NFKC"), salt, 32).toString("hex");
}
export function passwordMatches(pw: string, salt: string | null, hash: string | null): boolean {
  if (!salt || !hash) return false;
  const a = Buffer.from(hashPassword(pw, salt), "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
export function passwordProblem(pw: string, email: string): string | null {
  if (!pw || pw.length < 10) return "At least ten characters.";
  if (pw.toLowerCase().includes(email.split("@")[0].toLowerCase())) return "Not your e-mail name.";
  if (/^(.)\1+$/.test(pw)) return "Not one character repeated.";
  return null;
}
export const newInviteToken = () => randomBytes(24).toString("base64url");

/* -------------------------------------------------------------- cookie */
const sign = (body: string) => createHmac("sha256", secret()).update(`portal:${body}`).digest("base64url");

export function makePortalCookie(userId: string, pwVersion: number): { name: string; value: string; maxAge: number } {
  const until = Date.now() + DAYS * 864e5;
  const body = `${userId}.${until}.${pwVersion}`;
  return { name: PORTAL_COOKIE, value: `${body}.${sign(body)}`, maxAge: DAYS * 24 * 3600 };
}

async function cookieClaims(): Promise<{ id: string; v: number } | null> {
  try {
    const raw = (await cookies()).get(PORTAL_COOKIE)?.value;
    if (!raw) return null;
    const i = raw.lastIndexOf(".");
    if (i < 0) return null;
    const body = raw.slice(0, i), mac = raw.slice(i + 1);
    const want = Buffer.from(sign(body)), got = Buffer.from(mac);
    if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
    const [id, until, v] = body.split(".");
    if (!id || !until || Number(until) < Date.now()) return null;
    return { id, v: Number(v || 1) };
  } catch { return null; }
}

const COLS = "id,email,name,role,org_slug,locations,sees_commercials,active,must_change,pw_version";

/** The portal user this browser has proved it is, or null. Never throws. */
export async function currentPortalUser(): Promise<PortalUser | null> {
  const admin = adminClient();
  try {
    const c = await cookieClaims();
    if (c) {
      const { data } = await admin.from("portal_user").select(COLS).eq("id", c.id).maybeSingle();
      if (data && data.active && Number(data.pw_version) === c.v) return shape(data, "portal");
    }
    /* a Genie login: their own portal row if they have one, else the owner
       and the Genie admins come in as portal admins */
    const u = await currentUser().catch(() => null);
    if (u && !u.disabled && !u.lmsOnly) {
      const { data } = await admin.from("portal_user").select(COLS).eq("email", u.email.toLowerCase()).maybeSingle();
      if (data && data.active) return shape({ ...data, must_change: false }, "genie");
      if (u.isOwner || u.role === "admin")
        return { id: `genie:${u.id}`, email: u.email.toLowerCase(), name: u.displayName || u.email, role: "admin", org_slug: null, locations: [], sees_commercials: true, active: true, must_change: false, via: "genie" };
    }
  } catch { /* a missing table reads as nobody */ }
  return null;
}

function shape(d: Record<string, unknown>, via: PortalUser["via"]): PortalUser {
  const role = PORTAL_ROLES.includes(d.role as PortalRole) ? (d.role as PortalRole) : "customer";
  return {
    id: String(d.id), email: String(d.email), name: String(d.name), role,
    org_slug: (d.org_slug as string) ?? null,
    locations: Array.isArray(d.locations) ? (d.locations as string[]) : [],
    sees_commercials: !!d.sees_commercials, active: !!d.active, must_change: !!d.must_change, via,
  };
}

/** Every /api/portal route starts here. */
export async function requirePortalUser(): Promise<PortalUser> {
  const u = await currentPortalUser();
  if (!u) throw new HttpError(401, "Sign in to the portal first.");
  if (u.must_change) throw new HttpError(403, "Set your password first.");
  return u;
}
export async function requirePortalStaff(): Promise<PortalUser> {
  const u = await requirePortalUser();
  if (!isStaff(u)) throw new HttpError(403, "That is for Nandan's own people.");
  return u;
}
export async function requirePortalAdmin(): Promise<PortalUser> {
  const u = await requirePortalUser();
  if (!isPortalAdmin(u)) throw new HttpError(403, "That is for the portal admin.");
  return u;
}

/** Best-effort trail of who did what. */
export async function portalAudit(u: Pick<PortalUser, "id" | "email"> | null, action: string, detail?: Record<string, unknown>): Promise<void> {
  try {
    const user_id = u && /^[0-9a-f-]{36}$/.test(u.id) ? u.id : null;
    await adminClient().from("portal_audit").insert({ user_id, email: u?.email ?? null, action, detail: detail ?? null });
  } catch { /* never the reason */ }
}

/** Five wrong tries in fifteen minutes locks the address (the /idp rule). */
export async function tooManyTries(email: string): Promise<boolean> {
  try {
    const since = new Date(Date.now() - 15 * 60e3).toISOString();
    const { count } = await adminClient().from("portal_audit").select("id", { count: "exact", head: true })
      .eq("email", email).eq("action", "login_failed").gte("at", since);
    return Number(count || 0) >= 5;
  } catch { return false; }
}

/** Postgres "relation does not exist" — the migration has not been run yet. */
export const notInstalled = (e: unknown): boolean => /relation .* does not exist|42P01|schema cache/i.test(String((e as { message?: string })?.message || e));
