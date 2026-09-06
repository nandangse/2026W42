/**
 * Is this e-mail on a module's grant table? The owner always is.
 *
 * Kept apart from module-door.ts on purpose: this file imports nothing
 * server-only, so a library a browser component also reads (hrms.ts,
 * ims/auth.ts) can use it without dragging next/headers into the bundle.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export async function hasGrant(
  admin: SupabaseClient,
  table: string,
  email: string,
  isOwner: boolean,
): Promise<boolean> {
  if (isOwner) return true;
  const e = String(email || "").trim().toLowerCase();
  if (!e) return false;
  try {
    const { data } = await admin.from(table).select("email").eq("email", e).maybeSingle();
    return !!data;
  } catch {
    return false; // the table is not there yet: nobody but the owner
  }
}
