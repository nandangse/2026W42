import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * WHO VIEWED (Dr Raghu, 10 Oct 2026: "show viewed with the eye icon. the
 * ones who didn't vote are only viewed!"). One row per person per thing;
 * recorded the moment it is opened, counted on every open after.
 */
export async function recordView(admin: SupabaseClient, kind: string, id: string, email: string): Promise<void> {
  try {
    const { data } = await admin.from("lc_view").select("opens").eq("ref_kind", kind).eq("ref_id", id).eq("email", email).maybeSingle();
    if (data) await admin.from("lc_view").update({ last_at: new Date().toISOString(), opens: Number(data.opens) + 1 }).eq("ref_kind", kind).eq("ref_id", id).eq("email", email);
    else await admin.from("lc_view").insert({ ref_kind: kind, ref_id: id, email });
  } catch { /* pre-0216: no eye yet */ }
}

export async function viewsOf(admin: SupabaseClient, kind: string, ids: string[]): Promise<{ ref_id: string; email: string; first_at: string }[]> {
  if (!ids.length) return [];
  try {
    const { data } = await admin.from("lc_view").select("ref_id,email,first_at").eq("ref_kind", kind).in("ref_id", ids);
    return (data || []) as { ref_id: string; email: string; first_at: string }[];
  } catch { return []; }
}
