/**
 * THE KEY THAT SIGNS THE SMALLER LOGINS (9 Oct 2026, audit item S15).
 *
 * The IDP sheet, Kindle, the Portal and the salary-slip link each sign their
 * own cookie or token. Until today each one read the service-role key, and
 * — when that was missing — the literal word "genie", which means a
 * build with no environment would mint cookies anybody could forge.
 *
 * Now: SESSION_SECRET if it is set, else the service-role key, else an
 * error. Setting SESSION_SECRET on Vercel for the first time signs everyone
 * on those four doors out once; nothing else changes.
 */
export function sessionSecret(): string {
  const s = process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error("SESSION_SECRET (or SUPABASE_SERVICE_ROLE_KEY) is not set — nothing can sign a login.");
  return String(s);
}
