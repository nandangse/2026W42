import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * "From HRMS, all the mails will have to go from Vinay's mail ID. Please
 * note." (Dr Raghu, 5 Sep 2026). Every e-mail HRMS sends goes from Vinay
 * Mande's connected Gmail, whoever in HRMS pressed Send. If his mailbox is
 * not connected, the sender's own is used and the screen says so — a mail
 * that did not go is worse than one from the wrong name.
 */
export const HRMS_MAIL_FROM = "vinaym@nandan.co.in";
export const HRMS_MAIL_FROM_NAME = "Vinay Mande · Nandan GSE HR";

export async function hrmsSender(me: { email: string; displayName?: string | null }, _admin?: SupabaseClient): Promise<{ token: string; fromEmail: string; fromName: string; note: string | null }> {
  const { crmDb } = await import("@/crm/db");
  const { myMailbox, accessTokenFor } = await import("@/crm/gmail");
  const boxFor = async (email: string) => {
    const { data: rp } = await crmDb().from("profile").select("id").eq("email", email.toLowerCase()).maybeSingle();
    return rp?.id ? await myMailbox(String(rp.id)) : null;
  };
  const vinay = await boxFor(HRMS_MAIL_FROM);
  if (vinay) return { token: await accessTokenFor(String(vinay.id)), fromEmail: String(vinay.email_address), fromName: HRMS_MAIL_FROM_NAME, note: null };
  const own = me.email.toLowerCase() === HRMS_MAIL_FROM ? null : await boxFor(me.email);
  if (own) return { token: await accessTokenFor(String(own.id)), fromEmail: String(own.email_address), fromName: me.displayName || me.email.split("@")[0], note: `Vinay's Gmail (${HRMS_MAIL_FROM}) is not connected in Genie yet, so this went from your own. Ask Vinay to open the account menu → Connect Gmail once.` };
  throw new Error(`HRMS mail goes from ${HRMS_MAIL_FROM}, and that Gmail is not connected in Genie yet — Vinay opens the account menu → Connect Gmail once (an admin ticks ✉ OAuth on his account first).`);
}
