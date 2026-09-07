import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

/**
 * A SESSION FOR PEOPLE WHO HAVE NO GENIE LOGIN (Dr Raghu, 7 Sep 2026).
 *
 * The 130-odd workers have no Google account and no Supabase user; they sign
 * in to /idp with their PERSONAL e-mail and the password HR issues. That
 * cannot ride on Supabase Auth, so this is its own cookie: the employee id,
 * an expiry, and an HMAC over both. It proves who somebody is and nothing
 * else — it carries no role, opens no other door, and is checked separately
 * everywhere it is honoured.
 *
 * Signed with the service key, which never leaves the server. Fourteen days,
 * because a man on the floor should not be signing in every morning.
 */
const COOKIE = "idp_who";
const DAYS = 14;

const secret = () => String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXTAUTH_SECRET || "genie");
const sign = (body: string) => createHmac("sha256", secret()).update(body).digest("base64url");

export function makeIdpCookie(employeeId: string): { name: string; value: string; maxAge: number } {
  const until = Date.now() + DAYS * 864e5;
  const body = `${employeeId}.${until}`;
  return { name: COOKIE, value: `${body}.${sign(body)}`, maxAge: DAYS * 24 * 3600 };
}

/** The employee this browser has proved it is, or null. Never throws. */
export async function idpSession(): Promise<string | null> {
  try {
    const raw = (await cookies()).get(COOKIE)?.value;
    if (!raw) return null;
    const i = raw.lastIndexOf(".");
    if (i < 0) return null;
    const body = raw.slice(0, i), mac = raw.slice(i + 1);
    const want = Buffer.from(sign(body));
    const got = Buffer.from(mac);
    if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
    const [id, until] = body.split(".");
    if (!id || !until || Number(until) < Date.now()) return null;
    return id;
  } catch {
    return null;
  }
}

export const IDP_COOKIE = COOKIE;
