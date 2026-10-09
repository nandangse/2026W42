import { sessionSecret } from "@/lib/session-secret";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { adminClient } from "@/lib/supabase/admin";
import { currentUser, HttpError } from "@/lib/auth";

/**
 * KINDLE'S OWN LOGIN (Dr Raghu, 1 Oct 2026).
 *
 * "This has to have a login page where only 10 of us can log in with the
 * official mail ID that is given in the directory… They have to change the
 * password on the first login itself."
 *
 * The ten Kindlers are not Nandan people and must never become Genie users,
 * so this is a second realm inside the one app, on the /idp pattern: a row
 * in kindle_member with a scrypt hash, and a signed cookie that names the
 * member, an expiry and the password version — change the password and
 * every other browser is out. The cookie proves who somebody is and nothing
 * else; every /api/kindle route checks it, and the Kindle role on the row.
 *
 * One exception, for the one person who is both: a Genie login whose e-mail
 * is in kindle_member opens Kindle too, so Dr Raghu is never locked out of
 * the site he asked for.
 */
export const KINDLE_COOKIE = "kindle_who";
const DAYS = 30;

export interface Kindler {
  id: string;
  email: string;
  name: string;
  short_name: string | null;
  roles: string[];
  is_admin: boolean;
  active: boolean;
  must_change: boolean;
  photo_path: string | null;
  /** how this browser got in */
  via: "kindle" | "genie";
}

export const KINDLE_ROLES = ["facilitator", "co_facilitator", "treasurer", "scribe", "timekeeper"] as const;
export const ROLE_LABEL: Record<string, string> = {
  facilitator: "Facilitator", co_facilitator: "Co-facilitator", treasurer: "Treasurer", scribe: "Scribe", timekeeper: "Time keeper",
};

/** The settings gear: facilitator, co-facilitator, or the admin flag. */
export const isKindleAdmin = (k: Pick<Kindler, "roles" | "is_admin">) =>
  k.is_admin || k.roles.includes("facilitator") || k.roles.includes("co_facilitator");
/** Money: treasurer or admin. */
export const isKindleTreasurer = (k: Pick<Kindler, "roles" | "is_admin">) => isKindleAdmin(k) || k.roles.includes("treasurer");

/* ----------------------------------------------------------- passwords */
const secret = () => sessionSecret();
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
/** Ten characters, not the e-mail, not all one character. */
export function passwordProblem(pw: string, email: string): string | null {
  if (!pw || pw.length < 10) return "At least ten characters.";
  if (pw.toLowerCase().includes(email.split("@")[0].toLowerCase())) return "Not your e-mail name.";
  if (/^(.)\1+$/.test(pw)) return "Not one character repeated.";
  return null;
}
export const newInviteToken = () => randomBytes(24).toString("base64url");

/* -------------------------------------------------------------- cookie */
const sign = (body: string) => createHmac("sha256", secret()).update(`kindle:${body}`).digest("base64url");

export function makeKindleCookie(memberId: string, pwVersion: number): { name: string; value: string; maxAge: number } {
  const until = Date.now() + DAYS * 864e5;
  const body = `${memberId}.${until}.${pwVersion}`;
  return { name: KINDLE_COOKIE, value: `${body}.${sign(body)}`, maxAge: DAYS * 24 * 3600 };
}

async function cookieClaims(): Promise<{ id: string; v: number } | null> {
  try {
    const raw = (await cookies()).get(KINDLE_COOKIE)?.value;
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

const COLS = "id,email,name,short_name,roles,is_admin,active,must_change,photo_path,pw_version";

/** The Kindler this browser has proved it is, or null. Never throws. */
export async function currentKindler(): Promise<Kindler | null> {
  const admin = adminClient();
  try {
    const c = await cookieClaims();
    if (c) {
      const { data } = await admin.from("kindle_member").select(COLS).eq("id", c.id).maybeSingle();
      if (data && data.active && Number(data.pw_version) === c.v) return shape(data, "kindle");
    }
    /* the Genie owner, or any Genie user who is also a Kindler */
    const u = await currentUser().catch(() => null);
    if (u && !u.disabled) {
      const { data } = await admin.from("kindle_member").select(COLS).eq("email", u.email).maybeSingle();
      if (data && data.active) return shape({ ...data, must_change: false }, "genie");
    }
  } catch { /* a missing table reads as nobody */ }
  return null;
}

function shape(d: Record<string, unknown>, via: Kindler["via"]): Kindler {
  return {
    id: String(d.id), email: String(d.email), name: String(d.name), short_name: (d.short_name as string) ?? null,
    roles: Array.isArray(d.roles) ? (d.roles as string[]) : [], is_admin: !!d.is_admin, active: !!d.active,
    must_change: !!d.must_change, photo_path: (d.photo_path as string) ?? null, via,
  };
}

/** Every /api/kindle route starts here. */
export async function requireKindler(): Promise<Kindler> {
  const k = await currentKindler();
  if (!k) throw new HttpError(401, "Sign in to Kindle first.");
  if (k.must_change) throw new HttpError(403, "Set your password first.");
  return k;
}
export async function requireKindleAdmin(): Promise<Kindler> {
  const k = await requireKindler();
  if (!isKindleAdmin(k)) throw new HttpError(403, "That is for the facilitator.");
  return k;
}

/** Best-effort trail of who did what inside Kindle. */
export async function kindleAudit(k: Kindler | null, action: string, detail?: Record<string, unknown>): Promise<void> {
  try { await adminClient().from("kindle_audit").insert({ member_id: k?.id ?? null, email: k?.email ?? null, action, detail: detail ?? null }); } catch { /* never the reason */ }
}

/** Postgres "relation does not exist" — the migration has not been run yet. */
export const notInstalled = (e: unknown): boolean => /relation .* does not exist|42P01|schema cache/i.test(String((e as { message?: string })?.message || e));
