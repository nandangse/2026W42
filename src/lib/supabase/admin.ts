// Service-role Supabase client. SERVER-ONLY. Bypasses RLS. Used exclusively by:
//   - POST /api/upload (the merge pipeline; must archive/close rows no user role could)
//   - admin user management (create/list/role/disable)
//   - scripts/seed.ts and scripts/acceptance-test.ts
// NEVER import this into a client component.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { noStoreFetch } from "@/lib/no-store-fetch";

let cached: SupabaseClient | null = null;

export function adminClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (server env).",
    );
  }
  cached = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    /* Never a cached read — see src/lib/no-store-fetch.ts. The marketing
       cron was served a stale empty array for six passes; this client runs
       the ERP sync and the playbook crons, which could go the same way. */
    global: { fetch: noStoreFetch },
  });
  return cached;
}
