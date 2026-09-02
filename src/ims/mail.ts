/**
 * The IMS's outbound mail — provider-agnostic on purpose.
 *
 * Today it is Resend, which is what every other Genie module uses. The point
 * of the wrapper is that the expiry scan never learns the provider's name:
 * when nandan.co.in's sending domain is fixed, or when the connected Gmail
 * becomes the sender here too, ONE function changes.
 *
 * IT NEVER THROWS. A certificate alert that failed to post is a bad day; an
 * expiry scan that aborted half way through because the mail server was down,
 * leaving half the renewal tasks unraised, is a worse one. The task is the
 * durable thing — the mail is the nudge — so mail failure is REPORTED, not
 * raised.
 */
export interface MailResult {
  sent: boolean;
  /** Why not, in words a person can act on. Empty when it went. */
  why: string;
}

export async function sendImsMail(opts: {
  to: string[];
  subject: string;
  text: string;
}): Promise<MailResult> {
  const to = opts.to.map((t) => String(t || "").trim().toLowerCase()).filter(Boolean);
  if (!to.length) return { sent: false, why: "Nobody to send it to — the renewal owner has no email." };

  const key = process.env.RESEND_API_KEY;
  if (!key)
    return { sent: false, why: "RESEND_API_KEY is not set on this deploy — the task was raised, the mail was not sent." };

  const from = process.env.IMS_MAIL_FROM || "ims@nandan.co.in";
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        from: `Nandan IMS <${from}>`,
        to,
        reply_to: from,
        subject: opts.subject,
        text: opts.text,
      }),
    });
    if (!r.ok) {
      const body = (await r.text()).slice(0, 200);
      return {
        sent: false,
        why:
          r.status === 401
            ? "The RESEND_API_KEY is wrong or revoked."
            : `Resend answered ${r.status}: ${body}`,
      };
    }
    return { sent: true, why: "" };
  } catch (e) {
    return { sent: false, why: e instanceof Error ? e.message : "Mail failed." };
  }
}
