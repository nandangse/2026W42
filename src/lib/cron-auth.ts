/**
 * WHO MAY FIRE A CRON BY HAND (9 Oct 2026, audit item S12).
 *
 * Every cron route had the same twelve lines: accept the Vercel call when it
 * carries CRON_SECRET, otherwise accept any signed-in Genie account. "Any
 * signed-in account" included a labour login or a learner — a man with the
 * URL could start an ERP pull, a playbook compile or a round of mails.
 *
 * One helper now. The cron's bearer secret passes; otherwise the owner or a
 * Stratcom member, or the named hands a route passes in (the ERP minders,
 * for erp-sync). Everybody else is 403. The heartbeat on a secret-less
 * Vercel call stays, because that is how CRON_SECRET's absence was found.
 */
import { currentUser, HttpError, type AuthedUser } from "@/lib/auth";
import { beat } from "@/lib/cron-beat";

export async function cronCaller(
  req: Request,
  name: string,
  opts: { hands?: string[]; ownerOnly?: boolean } = {},
): Promise<{ fromCron: boolean; user: AuthedUser | null }> {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") || "";
  const fromCron = !!secret && header === `Bearer ${secret}`;
  if (fromCron) return { fromCron: true, user: null };
  if (req.headers.get("user-agent")?.includes("vercel-cron"))
    await beat(name, "failed", { error: secret ? "cron call did not carry the CRON_SECRET" : "CRON_SECRET is not set on Vercel" });
  const u = await currentUser();
  if (!u || u.disabled) throw new HttpError(401, "The cron, or a signed-in hand.");
  if (u.lmsOnly) throw new HttpError(403, "This login opens the training library only.");
  const hands = new Set((opts.hands || []).map((h) => h.toLowerCase()));
  const allowed = u.isOwner || (!opts.ownerOnly && (u.stratcom || hands.has(u.email.toLowerCase())));
  if (!allowed) throw new HttpError(403, opts.ownerOnly ? "The cron, or the owner." : "The cron, Stratcom, or the hands named for it.");
  return { fromCron: false, user: u };
}
