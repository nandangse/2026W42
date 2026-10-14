import { currentUser, HttpError, type AuthedUser } from "@/lib/auth";

/**
 * THE CEO'S DOOR (Dr Raghu, 14 Oct 2026: "make a module genie.nandan.co.in/ceo.
 * This is only for me and no one else now. It will also need JCK and Tushar").
 *
 * THREE NAMES, IN CODE — like Kindle's ten, and for the same reason: no tick
 * on Admin, no group, no role can open it to a fourth person by accident. A
 * name is added here, in a commit, or not at all. The owner is implicit.
 *   J C Kumar  — Chairman            (jckumar@nandan.co.in)
 *   Tushar Giri — Chief Operations Officer (tushar@nandan.co.in, not tusharpatil@)
 */
export const CEO_PEOPLE = ["raghu@nandan.co.in", "jckumar@nandan.co.in", "tushar@nandan.co.in"] as const;

export const mayUseCeo = (u: AuthedUser | null | undefined) =>
  !!u && !u.disabled && !u.lmsOnly && (u.isOwner || (CEO_PEOPLE as readonly string[]).includes(u.email.toLowerCase()));

export async function requireCeo(): Promise<AuthedUser> {
  const u = await currentUser();
  if (!u || u.disabled) throw new HttpError(401, "Sign in first.");
  if (!mayUseCeo(u)) throw new HttpError(403, "Not open to this login.");
  return u;
}
