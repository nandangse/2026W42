// Browser Supabase client (anon key). Used by the client components for auth
// (sign-in / sign-out / session). All data access still goes through /api
// routes; this client only manages the Supabase Auth session cookie.
"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function supabaseBrowser(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set — sign-in cannot work.");
  cached = createBrowserClient(
    // literal access on purpose: Next inlines NEXT_PUBLIC_* into the browser
    // bundle only when written out like this, never through a lookup
    url,
    anon,
  );
  return cached;
}
