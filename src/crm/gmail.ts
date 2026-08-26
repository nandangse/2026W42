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
  // Mail attachments live in Dr Raghu's Drive folder, not in Supabase —
  // the app writes them there and links them (26 Aug 2026).
  "https://www.googleapis.com/auth/drive",
].join(" ");

/** The mail-attachment home in Drive; monthly subfolders grow inside it. */
export const DRIVE_MAIL_ROOT = process.env.DRIVE_MAIL_ROOT || "1DpDWUFqWtsLMBdD4tNXFayKoknmd3Hsj";

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
export async function gmailSend(
  token: string, fromEmail: string, to: string, subject: string, body: string,
  cc?: string, bcc?: string, fromName?: string,
  reply?: { threadId?: string | null; inReplyTo?: string | null },
): Promise<string> {
  // The sender reads as the PERSON, not the address — RFC 2047-encoded so
  // any script in the name survives the wire.
  const from = fromName
    ? `=?UTF-8?B?${Buffer.from(fromName).toString("base64")}?= <${fromEmail}>`
    : fromEmail;
  const mime = [
    `From: ${from}`,
    `To: ${to}`,
    ...(cc ? [`Cc: ${cc}`] : []),
    ...(bcc ? [`Bcc: ${bcc}`] : []),
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
    ...(reply?.inReplyTo ? [`In-Reply-To: ${reply.inReplyTo}`, `References: ${reply.inReplyTo}`] : []),
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(body).toString("base64"),
  ].join("\r\n");
  const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ raw: Buffer.from(mime).toString("base64url"), ...(reply?.threadId ? { threadId: reply.threadId } : {}) }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error((j.error as { message?: string })?.message || "Gmail refused the send");
  return String(j.id);
}

async function driveFetch(token: string, url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) } });
  const j = await r.json();
  if (!r.ok) throw new Error((j.error as { message?: string })?.message || "Drive said no");
  return j;
}

/** This month's folder inside the mail root — found or made. */
async function monthFolder(token: string): Promise<string> {
  const name = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 7);
  const q = encodeURIComponent(`name='${name}' and '${DRIVE_MAIL_ROOT}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const found = await driveFetch(token, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`);
  const hit = (found.files as { id: string }[] | undefined)?.[0];
  if (hit) return hit.id;
  const made = await driveFetch(token, "https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [DRIVE_MAIL_ROOT] }),
  });
  return String(made.id);
}

/** Upload one attachment to the Drive mail folder, share it anyone-with-link,
 *  hand back the link. The file never touches Supabase. */
export async function driveUploadAttachment(
  token: string, name: string, mimeType: string, data: Buffer,
): Promise<{ id: string; name: string; link: string }> {
  const folder = await monthFolder(token);
  const boundary = "genie" + Date.now().toString(36);
  const meta = JSON.stringify({ name, parents: [folder] });
  const bodyParts = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${mimeType || "application/octet-stream"}\r\n\r\n`),
    data,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const up = await driveFetch(token,
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink&supportsAllDrives=true", {
      method: "POST",
      headers: { "content-type": `multipart/related; boundary=${boundary}` },
      body: bodyParts as unknown as BodyInit,
    });
  // anyone with the link may read — Dr Raghu's default for mail attachments
  await driveFetch(token, `https://www.googleapis.com/drive/v3/files/${up.id}/permissions?supportsAllDrives=true`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });
  return { id: String(up.id), name: String(up.name), link: String(up.webViewLink) };
}
