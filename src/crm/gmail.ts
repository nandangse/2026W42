/**
 * GMAIL, THROUGH THE FRONT DOOR — per-user OAuth (Dr Raghu, 26 Aug 2026).
 *
 * The person connects their own @nandan.co.in mailbox from their Profile
 * (only where the admin has marked ✉ OAuth Available). The refresh token
 * goes straight into Supabase Vault via 0002's store_mailbox_credential;
 * the mailbox row keeps only the Vault uuid. Reading and sending happen
 * server-side with a short-lived access token minted per request.
 *
 * Needs in Vercel env:  GOOGLE_OAUTH_CLIENT_ID · GOOGLE_OAUTH_CLIENT_SECRET
 * Google console:      OAuth client (Web), redirect
 *                      https://genie.nandan.co.in/api/crm/gmail/callback,
 *                      consent screen INTERNAL (skips restricted-scope audit).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { crmDb } from "./db";

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
].join(" ");

export const REDIRECT_PATH = "/api/crm/gmail/callback";

export function oauthConfigured(): boolean {
  return !!(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
}

const stateSecret = () => process.env.CRM_SUPABASE_SERVICE_KEY || "no-secret";

/** A signed, expiring state so the callback trusts only our own launches. */
export function signState(profileId: string): string {
  const exp = Date.now() + 10 * 60 * 1000;
  const body = `${profileId}|${exp}`;
  const sig = createHmac("sha256", stateSecret()).update(body).digest("hex");
  return Buffer.from(`${body}|${sig}`).toString("base64url");
}
export function verifyState(state: string): string | null {
  try {
    const [profileId, exp, sig] = Buffer.from(state, "base64url").toString().split("|");
    if (Number(exp) < Date.now()) return null;
    const want = createHmac("sha256", stateSecret()).update(`${profileId}|${exp}`).digest("hex");
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
    return profileId;
  } catch { return null; }
}

export function authUrl(origin: string, state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID as string,
    redirect_uri: origin + REDIRECT_PATH,
    response_type: "code",
    scope: GMAIL_SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export async function exchangeCode(origin: string, code: string): Promise<{ refresh_token?: string; access_token: string }> {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID as string,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET as string,
      redirect_uri: origin + REDIRECT_PATH,
      grant_type: "authorization_code",
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description || j.error || "Google refused the code");
  return j;
}

/** The signed-in person's connected mailbox row, if any. */
export async function myMailbox(profileId: string) {
  const { data } = await crmDb().from("mailbox")
    .select("id, email_address, status, credential_kind, last_error")
    .eq("profile_id", profileId)
    .eq("credential_kind", "oauth_refresh_token")
    .maybeSingle();
  return data ?? null;
}

/** A fresh access token for a mailbox — refresh token stays in the Vault. */
export async function accessTokenFor(mailboxId: string): Promise<string> {
  const db = crmDb();
  const { data: secret, error } = await db.rpc("mailbox_secret", { p_mailbox: mailboxId });
  if (error || !secret) throw new Error("The mailbox's credential is missing — reconnect Gmail.");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: String(secret),
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID as string,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET as string,
      grant_type: "refresh_token",
    }),
  });
  const j = await r.json();
  if (!r.ok) {
    await db.from("mailbox").update({ status: "auth_failed", last_error: String(j.error ?? "refresh failed") }).eq("id", mailboxId);
    throw new Error("Gmail auth failed — reconnect from your Profile.");
  }
  return j.access_token as string;
}

export async function gmailGet(token: string, path: string): Promise<Record<string, unknown>> {
  const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j = await r.json();
  if (!r.ok) throw new Error((j.error as { message?: string })?.message || "Gmail said no");
  return j;
}

/** Send: a simple RFC822 message, UTF-8, base64url. */
export async function gmailSend(token: string, fromEmail: string, to: string, subject: string, body: string): Promise<string> {
  const mime = [
    `From: ${fromEmail}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(body).toString("base64"),
  ].join("\r\n");
  const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ raw: Buffer.from(mime).toString("base64url") }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error((j.error as { message?: string })?.message || "Gmail refused the send");
  return String(j.id);
}
