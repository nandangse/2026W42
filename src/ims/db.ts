/**
 * The IMS's OWN database.
 *
 * A DIFFERENT Supabase project from Genie's, and a different one again from
 * the CRM's (Dr Raghu, 2 Sep 2026: "IMS separate fork"). Nothing in here can
 * see a Genie table and nothing in Genie can see an IMS one -- that separation
 * is the whole point and it is enforced by them being different databases,
 * not by a naming convention somebody could break in a hurry.
 *
 * SERVICE KEY, deliberately. The session that got the caller this far was
 * issued by GENIE's auth project, so this database cannot validate it -- it
 * never signed the token. Row Level Security is therefore on and FORCED with
 * no policies at all: the anon key sees nothing, and the only way in is the
 * service key, used exclusively after src/ims/auth.ts has already established
 * who is asking and what their IMS role is. The gate lives in code that can be
 * read rather than in a policy that would have to trust a foreign signature.
 *
 * NEVER import this into a client component.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/** True when the IMS database has been pointed at. */
export function imsConfigured(): boolean {
  return !!(process.env.IMS_SUPABASE_URL && process.env.IMS_SUPABASE_SERVICE_KEY);
}

export class ImsNotConfigured extends Error {
  constructor() {
    super(
      "The IMS database is not connected yet. Set IMS_SUPABASE_URL and " +
        "IMS_SUPABASE_SERVICE_KEY, then run the supabase-ims/migrations/ files in order.",
    );
  }
}

export function imsDb(): SupabaseClient {
  if (cached) return cached;
  if (!imsConfigured()) throw new ImsNotConfigured();
  cached = createClient(
    process.env.IMS_SUPABASE_URL as string,
    process.env.IMS_SUPABASE_SERVICE_KEY as string,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  return cached;
}

/**
 * True when the error is "that table isn't there yet" rather than a real
 * failure. Every screen answers `installed: false` on this instead of a red
 * 500, so an IMS pointed at an empty project says which migration to run.
 */
export function notInstalled(message: unknown): boolean {
  return /does not exist|schema cache|relation .* does not exist/i.test(String(message ?? ""));
}
