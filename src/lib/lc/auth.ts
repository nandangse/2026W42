/**
 * LEADERS COUNCIL — the door (Dr Raghu, 10 Oct 2026: "only accessible to
 * those who are marked in the LC … make sure that nobody else can get into
 * this LC module").
 *
 * The mark is profiles.lc — the Leadership Circle room on Admin → Groups,
 * which currentUser() already reads. No grant table of its own: the people
 * he has marked are the people who may come in, the owner implicit, and a
 * learner-only login never. Unlike requireLC() in auth.ts (the Delivered Jobs
 * workspace, which Stratcom also sees), THIS door is LC alone.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { currentUser, HttpError, type AuthedUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";

export const mayUseLeadersCouncil = (u: AuthedUser | null) => !!u && !u.disabled && !u.lmsOnly && (u.isOwner || u.lc);

/** The one door check every /api/lc route uses. */
export async function requireLeader(): Promise<AuthedUser> {
  const u = await currentUser();
  if (!u || u.disabled) throw new HttpError(401, "Sign in first.");
  if (u.lmsOnly) throw new HttpError(403, "This login opens the training library only.");
  if (!(u.isOwner || u.lc)) throw new HttpError(403, "The Leaders Council is for those marked LC on Admin → Groups.");
  return u;
}

/** Owner-only rooms inside the council: Philosophy, Principles, Knowledge, the Print PDF. */
export async function requireCouncilOwner(): Promise<AuthedUser> {
  const u = await requireLeader();
  if (!u.isOwner) throw new HttpError(403, "Only Dr Raghu may change this.");
  return u;
}

/** The author or the owner may edit a thing; everyone else reads and reacts. */
export function mayEdit(u: AuthedUser, addedBy: string | null | undefined): boolean {
  return u.isOwner || (!!addedBy && addedBy.toLowerCase() === u.email.toLowerCase());
}

export interface Leader { email: string; name: string; initials: string; colour: string; isOwner: boolean }

/**
 * ONE COLOUR PER LEADER (Dr Raghu: "each LC member will have one colour, so
 * it becomes a colourful board"). Twelve distinct inks, dealt in the order
 * the council is listed — owner first, then by name — so a colour is stable
 * from one open to the next and the same on every board.
 */
export const LEADER_COLOURS = ["#1B2D6B", "#B3261E", "#0F766E", "#7C3AED", "#B45309", "#0369A1", "#BE185D", "#15803D", "#C2410C", "#4338CA", "#A16207", "#0E7490"];

export async function lcMembers(admin: SupabaseClient, ownerEmail: string): Promise<Leader[]> {
  const { data } = await admin.from("profiles").select("email, display_name, initials, lc, disabled").eq("disabled", false);
  const rows = (data || []).filter((p) => p.lc || String(p.email || "").toLowerCase() === ownerEmail);
  const name = (p: { email: string; display_name: string | null }) => p.display_name || p.email.split("@")[0];
  rows.sort((a, b) => (String(a.email).toLowerCase() === ownerEmail ? -1 : String(b.email).toLowerCase() === ownerEmail ? 1 : name(a).localeCompare(name(b))));
  return rows.map((p, i) => ({
    email: String(p.email).toLowerCase(),
    name: name(p),
    initials: p.initials || name(p).slice(0, 2).toUpperCase(),
    colour: LEADER_COLOURS[i % LEADER_COLOURS.length],
    isOwner: String(p.email).toLowerCase() === ownerEmail,
  }));
}

export const lcAdmin = () => adminClient();
