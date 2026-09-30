import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * WHO "RNN" IS.
 *
 * The ERP writes a job's four owners two different ways. The planning owner
 * is an e-mail — pankajs@nandan.co.in — because that field is a link to a
 * User. The kitting, production and design owners are the two- and
 * three-letter codes the floor actually says out loud: RNN, UD, SA, NY.
 *
 * Both were being chopped into initials at the point of display, which is a
 * guess wearing a function's clothes. It turned pankajs@nandan.co.in into
 * PANK, and it could say nothing at all about RNN.
 *
 * There is no need to guess. `profiles` already carries the register —
 * `initials` is the code and `display_name` is the person — and it is the
 * same register the rest of Genie assigns work by. Reading it here means the
 * printed board, the phone page and every screen inside name the same man
 * the same way.
 *
 * Dr Raghu, 30 Sep 2026: "it should be seen as AF: Alpesh / UD: Ullhas /
 * RNN: Rajesh / SS: Saurabh shirke."
 *
 * WHAT IT WILL NOT DO is invent. A code that nobody has entered against a
 * profile prints as the bare code — because a name made up here would be
 * read as a fact by whoever picks the sheet off the machine.
 */
export interface Owner { code: string | null; name: string | null }

export type OwnerLookup = (v: unknown) => Owner;

export async function ownerRegister(admin: SupabaseClient): Promise<OwnerLookup> {
  const { data } = await admin.from("profiles").select("email, initials, display_name");
  const byCode = new Map<string, Owner>();
  const byEmail = new Map<string, Owner>();
  for (const p of data || []) {
    const code = String(p.initials || "").trim().toUpperCase() || null;
    const name = String(p.display_name || "").trim() || null;
    const rec: Owner = { code, name };
    if (code) byCode.set(code, rec);
    if (p.email) byEmail.set(String(p.email).trim().toLowerCase(), rec);
  }
  return (v: unknown): Owner => {
    const s = String(v || "").trim();
    if (!s) return { code: null, name: null };
    const hit = s.includes("@") ? byEmail.get(s.toLowerCase()) : byCode.get(s.toUpperCase());
    if (hit) return hit;
    return s.includes("@")
      ? { code: null, name: s.split("@")[0] }
      : { code: s.toUpperCase(), name: null };
  };
}

/** "AF: Alpesh", or just the code, or just the name — whatever is known. */
export const ownerLabel = (o: Owner): string =>
  o.code && o.name ? `${o.code}: ${o.name}` : o.code || o.name || "—";
