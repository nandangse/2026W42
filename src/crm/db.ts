/**
 * The CRM's OWN database.
 *
 * A DIFFERENT Supabase project from Genie's. Nothing in here can see a Genie
 * table and nothing in Genie can see a CRM one -- that separation is the whole
 * point and it is enforced by them being different databases, not by a naming
 * convention somebody could break in a hurry.
 *
 * SERVICE KEY, deliberately. The session that got the caller this far was
 * issued by GENIE's auth project, so this database cannot validate it -- it
 * never signed the token. Row Level Security is therefore on with no policies
 * at all: the anon key sees nothing, and the only way in is the service key,
 * used exclusively after src/crm/auth.ts has already established who is
 * asking. The gate lives in code that can be read rather than in a policy
 * that would have to trust a foreign signature.
 *
 * NEVER import this into a client component.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/** True when the CRM database has been pointed at. */
export function crmConfigured(): boolean {
  return !!(process.env.CRM_SUPABASE_URL && process.env.CRM_SUPABASE_SERVICE_KEY);
}

export class CrmNotConfigured extends Error {
  constructor() {
    super(
      "The CRM database is not connected yet. Set CRM_SUPABASE_URL and " +
        "CRM_SUPABASE_SERVICE_KEY, then run supabase-crm/migrations/0001_crm_foundation.sql.",
    );
  }
}

export function crmDb(): SupabaseClient {
  if (cached) return cached;
  if (!crmConfigured()) throw new CrmNotConfigured();
  cached = createClient(
    process.env.CRM_SUPABASE_URL as string,
    process.env.CRM_SUPABASE_SERVICE_KEY as string,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  return cached;
}
