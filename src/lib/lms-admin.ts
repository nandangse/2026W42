import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthedUser } from "@/lib/auth";

/**
 * WHO KEEPS THE LIBRARY (Dr Raghu, 15 Oct 2026: "Shweta and Raghu are LMS
 * admins for now"). An LMS admin writes the lessons, sets who sees which
 * library, and reads everybody's learning record. The list is lms_admin
 * (0234), kept on the LMS Admin page; Dr Raghu is always one. Before 0234
 * runs, Genie's own admins keep the library as they did.
 */
export async function isLmsAdmin(admin: SupabaseClient, u: Pick<AuthedUser, "email" | "isOwner" | "role">): Promise<boolean> {
  if (u.isOwner) return true;
  const { data, error } = await admin.from("lms_admin").select("email").eq("email", String(u.email).toLowerCase()).maybeSingle();
  if (error) return /lms_admin|does not exist|schema cache/i.test(error.message) ? u.role === "admin" : false;
  return !!data;
}
