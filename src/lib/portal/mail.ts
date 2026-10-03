import { adminClient } from "@/lib/supabase/admin";

/**
 * THE PORTAL'S MAIL goes from Dr Raghu's connected Gmail (raghu@nandan.co.in)
 * until a portal address of its own is connected — the invite mails for now.
 * Every send is logged in portal_mail with a (kind, to, ref) key, so a job
 * that runs twice cannot mail twice.
 */
export const PORTAL_FROM = "raghu@nandan.co.in";
export const PORTAL_FROM_NAME = "Nandan GSE Portal";

export async function portalSender(): Promise<{ token: string; fromEmail: string; fromName: string }> {
  const { mailboxByAddress, accessTokenFor } = await import("@/crm/gmail");
  const box = await mailboxByAddress(PORTAL_FROM);
  if (!box) throw new Error(`Portal mail goes from ${PORTAL_FROM}, and that Gmail is not connected in Genie — open the account menu → Connect Gmail once.`);
  return { token: await accessTokenFor(String(box.id)), fromEmail: String(box.email_address), fromName: PORTAL_FROM_NAME };
}

/** Send once per (kind, to, ref). Returns "sent", "already" or the error text. */
export async function sendPortalMail(kind: string, to: string, subject: string, html: string, ref: string): Promise<string> {
  const admin = adminClient();
  const { data: dup } = await admin.from("portal_mail").select("id").eq("kind", kind).eq("to_email", to).eq("ref", ref).eq("ok", true).maybeSingle();
  if (dup) return "already";
  try {
    const { gmailSend } = await import("@/crm/gmail");
    const s = await portalSender();
    await gmailSend(s.token, s.fromEmail, to, subject, html, undefined, undefined, s.fromName, undefined, null, PORTAL_FROM);
    await admin.from("portal_mail").upsert({ kind, to_email: to, ref, subject, ok: true, error: null, sent_at: new Date().toISOString() }, { onConflict: "kind,to_email,ref" });
    return "sent";
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await admin.from("portal_mail").upsert({ kind, to_email: to, ref, subject, ok: false, error: msg.slice(0, 500), sent_at: new Date().toISOString() }, { onConflict: "kind,to_email,ref" });
    return msg;
  }
}

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));

export function inviteHtml(name: string, orgName: string | null, link: string, loginEmail: string): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#22303c">
  <div style="font-size:20px;font-weight:700;margin-bottom:2px">Nandan GSE Portal</div>
  <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#e8600a;margin-bottom:18px">${orgName ? esc(orgName) : "Your window into Nandan"}</div>
  <p>Dear ${esc(name.split(" ")[0] || name)},</p>
  <p>Nandan GSE has opened a portal for ${orgName ? `<b>${esc(orgName)}</b>` : "you"}: the orders open with us, the jobs under delivery with their engine, chassis and model, what has been delivered, the service calls on your machines, and a place to raise a question and have it answered.</p>
  <p style="margin:22px 0"><a href="${link}" style="background:#e8600a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:700">Open the portal</a></p>
  <p style="font-size:14px;color:#5a6672">This link opens once and is good for 72 hours. It will ask you for a password of your own (ten characters or more).</p>
  <p style="font-size:14px;color:#5a6672">After that, sign in at <a href="https://genie.nandan.co.in/portal/login">genie.nandan.co.in/portal/login</a> with <b>${esc(loginEmail)}</b>.</p>
  <p>Warm regards,<br>Nandan GSE</p>
</div>`;
}
