/**
 * PLANNING IS ITS OWN WORLD (Dr Raghu, 10 Oct 2026: "The planning module
 * also is an own-world module. It is only applicable to those people who
 * are applied to the planning … Please stop that. Make a plain vanilla
 * front page for them").
 *
 * The grant is planning_access (migration 0161, narrowed by 0214) — the
 * Planning tick on a login. The owner always holds it. If the TABLE is
 * missing the answer is yes, because an empty answer must never read as
 * "nobody may come in" on the page the whole company lands on.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export async function mayUsePlanning(admin: SupabaseClient, email: string, isOwner: boolean): Promise<boolean> {
  if (isOwner) return true;
  try {
    const { data, error } = await admin.from("planning_access").select("email").eq("email", String(email || "").toLowerCase()).maybeSingle();
    if (error) return true; // pre-0161: Planning is open, as it always was
    return !!data;
  } catch { return true; }
}
