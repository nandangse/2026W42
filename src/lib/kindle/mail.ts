import { adminClient } from "@/lib/supabase/admin";

/**
 * KINDLE'S MAIL goes from Dr Raghu's own connected Gmail (raghu@nandan.co.in)
 * — the welcome mails, later the birthday wishes and reminders. Every send
 * is logged in kindle_mail with a (kind, to, ref) key, so a job that runs
 * twice cannot mail twice.
 */
export const KINDLE_FROM = "raghu@nandan.co.in";
export const KINDLE_FROM_NAME = "Raghu · Kindle";

export async function kindleSender(): Promise<{ token: string; fromEmail: string; fromName: string }> {
  const { mailboxByAddress, accessTokenFor } = await import("@/crm/gmail");
  const box = await mailboxByAddress(KINDLE_FROM);
  if (!box) throw new Error(`Kindle mail goes from ${KINDLE_FROM}, and that Gmail is not connected in Genie — Profile → Connect Gmail once, then press again.`);
  /* 4 Oct 2026: all ten welcome mails failed with "Gmail auth failed" — his
     refresh token had been revoked (invalid_grant). Say exactly what to do. */
  if (box.status === "auth_failed") throw new Error(`Your Gmail (${KINDLE_FROM}) needs reconnecting in Genie — Profile → ✉ Connect Gmail, sign in once — then press Send again. Nothing was sent.`);
  try { return { token: await accessTokenFor(String(box.id)), fromEmail: String(box.email_address), fromName: KINDLE_FROM_NAME }; }
  catch (e) { throw new Error(`Your Gmail (${KINDLE_FROM}) refused the send (${e instanceof Error ? e.message : String(e)}). Reconnect it in Genie — Profile → ✉ Connect Gmail — then press Send again.`); }
}

/** Send once per (kind, to, ref). Returns "sent", "already" or the error text. */
export async function sendKindleMail(kind: string, to: string, subject: string, html: string, ref: string): Promise<string> {
  const admin = adminClient();
  const { data: dup } = await admin.from("kindle_mail").select("id").eq("kind", kind).eq("to_email", to).eq("ref", ref).eq("ok", true).maybeSingle();
  if (dup) return "already";
  try {
    const { gmailSend } = await import("@/crm/gmail");
    const s = await kindleSender();
    await gmailSend(s.token, s.fromEmail, to, subject, html, undefined, undefined, s.fromName, undefined, null, KINDLE_FROM);
    await admin.from("kindle_mail").upsert({ kind, to_email: to, ref, subject, ok: true, error: null, sent_at: new Date().toISOString() }, { onConflict: "kind,to_email,ref" });
    return "sent";
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await admin.from("kindle_mail").upsert({ kind, to_email: to, ref, subject, ok: false, error: msg.slice(0, 500), sent_at: new Date().toISOString() }, { onConflict: "kind,to_email,ref" });
    return msg;
  }
}

export function welcomeHtml(name: string, link: string, loginEmail: string): string {
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
  return `<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#2a2420">
  <div style="font-size:22px;font-weight:700;margin-bottom:2px">Kindle</div>
  <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#b3331a;margin-bottom:18px">Keeping the fire alive</div>
  <p>Dear ${esc(name.split(" ")[0])},</p>
  <p>Kindle now has a home of its own: a private site for the ten of us, with the constitution, the directory, every check-in since January 2023, our meetings and attendance, polls, and the feedback form for each meeting. Nothing on it is visible to anyone outside the group.</p>
  <p style="margin:22px 0"><a href="${link}" style="background:#f26b1d;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:700;font-family:system-ui,sans-serif">Open Kindle and set my password</a></p>
  <p style="font-size:14px;color:#5c5248">This link opens once and is good for 72 hours. It will ask you for a password of your own (ten characters or more), then a two-minute profile: your picture, how to reach you, and your family's birthdays so the group can wish them.</p>
  <p style="font-size:14px;color:#5c5248">After that, sign in at <a href="https://genie.nandan.co.in/kindle/login">genie.nandan.co.in/kindle/login</a> with <b>${esc(loginEmail)}</b> and your password. If the link has expired, use "Forgotten your password?" on that page or ask me for a fresh one.</p>
  <p>Your check-in for this month is already on it — the Google Form can retire.</p>
  <p>Warmly,<br>Raghu</p>
  <p style="font-size:11px;color:#8a7f72;margin-top:24px">What is said in the room stays in the room. Please do not forward this mail.</p>
</div>`;
}
