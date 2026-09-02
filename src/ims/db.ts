/**
 * The IMS's tables — in GENIE'S OWN DATABASE.
 *
 * Dr Raghu, 2 Sep 2026: "no need to create supabase. Put it in the genie."
 * So there is no second project, no second set of keys and no second
 * migration folder. `imsDb()` is Genie's service-role client, named for the
 * module so that every IMS route reads the same way and so that the one place
 * to change, if the IMS ever does move out, is this file.
 *
 * WHY THE SERVICE KEY AND NOT THE USER'S SESSION. Every IMS table has RLS on
 * and FORCED with no policies at all (migration 0112), so a browser holding a
 * Genie session sees nothing — which is the point: a signed-in fitter must
 * not be able to read draft procedures straight out of PostgREST. Access is
 * through /api/ims/*, which establishes the caller's IMS role in
 * src/ims/auth.ts first and only then reads. The gate lives in code that can
 * be read.
 *
 * NEVER import this into a client component.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "@/lib/supabase/admin";

export function imsDb(): SupabaseClient {
  return adminClient();
}

/**
 * True when the environment can reach the database at all.
 *
 * Kept as a function rather than deleted: the screens ask it, and the IMS
 * living in Genie's project today is a decision, not a law of nature.
 */
export function imsConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * True when the error is "that table isn't there yet" rather than a real
 * failure. Every screen answers `installed: false` on this instead of a red
 * 500, so an IMS on a deploy that has not run 0112 says which migration to
 * run rather than showing a broken page.
 */
export function notInstalled(message: unknown): boolean {
  return /does not exist|schema cache|relation .* does not exist/i.test(String(message ?? ""));
}
