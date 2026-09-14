// User-scoped Supabase client for route handlers & server components.
// Carries the logged-in user's session from cookies, so every query runs under
// that user's JWT and RLS policies apply. This is the client the board reads
// and the planning-layer writes go through.
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { env } from "@/lib/env";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { noStoreFetch } from "@/lib/no-store-fetch";

export function supabaseServer(): SupabaseClient {
  const cookieStore = cookies();
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const anon = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createServerClient(url, anon, {
    /* Never a cached read — see src/lib/no-store-fetch.ts. Closing the whole
       class rather than the one client it was caught on. */
    global: { fetch: noStoreFetch },
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // set() throws in a pure Server Component render; ignored — the
          // middleware/route-handler context is where cookies are writable.
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: "", ...options });
        } catch {
          /* see note above */
        }
      },
    },
  });
}
