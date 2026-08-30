/**
 * Keeping the morning files, in Google Drive.
 *
 * Genie has never stored an uploaded file. It parses the sheet, writes the
 * rows and throws the bytes away — which is why the database has stayed small,
 * and also why "what did Monday's Jobmaster actually say" has never been
 * answerable. This puts the file itself in a Drive folder you can open, and
 * leaves the database exactly as it was.
 *
 * WHY NOT SUPABASE STORAGE: Dr Raghu's call. A file in Drive is a file people
 * can find, share and open on a phone without going through Genie at all — and
 * the morning files are already an ERP export somebody downloaded from a
 * browser. Putting them back where the rest of the company's documents live is
 * one fewer place to look.
 *
 * WHY NO googleapis PACKAGE: it is a large dependency for two calls. A service
 * account is a signed JWT exchanged for an access token, and node can sign
 * RS256 on its own — so this is ~60 lines instead of ~40 MB in the bundle.
 *
 * ARCHIVING NEVER FAILS AN UPLOAD. By the time this runs the rows are already
 * in and the boards have moved. Telling somebody their upload failed because a
 * copy could not be filed would be false, and would get the upload repeated.
 */
import { createSign } from "node:crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const SCOPE = "https://www.googleapis.com/auth/drive";

export interface DriveConfig {
  email: string;
  key: string;
  folderId: string;
}

/**
 * The three settings, or null if the archive is not configured.
 *
 * Null is a normal state, not an error: the app ran for months without it and
 * must keep running the moment a key is rotated or removed.
 */
export function driveConfig(): DriveConfig | null {
  const email = process.env.GOOGLE_SA_EMAIL?.trim();
  // Vercel stores newlines as the two characters \n; a PEM with literal
  // backslash-n in it fails to sign with an error that names neither.
  const key = process.env.GOOGLE_SA_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  const folderId = process.env.DRIVE_UPLOAD_FOLDER_ID?.trim();
  if (!email || !key || !folderId) return null;
  return { email, key, folderId };
}

const b64url = (b: Buffer | string) =>
  Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Access tokens last an hour; minting one per upload would be three round trips a day wasted. */
let cached: { token: string; expires: number } | null = null;

async function accessToken(cfg: DriveConfig): Promise<string> {
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: cfg.email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claim}`);
  const jwt = `${header}.${claim}.${b64url(signer.sign(cfg.key))}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  const j = await res.json();
  if (!res.ok || !j.access_token)
    throw new Error(`Google refused the service account: ${j.error_description || j.error || res.status}`);
  cached = { token: j.access_token as string, expires: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return cached.token;
}

/** Find a child folder by name, or create it. Shared Drives included. */
async function folder(token: string, parent: string, name: string): Promise<string> {
  const q = encodeURIComponent(
    `name='${name.replace(/'/g, "\\'")}' and '${parent}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
  );
  const common = "supportsAllDrives=true&includeItemsFromAllDrives=true";
  const hit = await fetch(`${DRIVE}/files?q=${q}&fields=files(id)&${common}`, {
    headers: { authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  if (hit.files?.[0]?.id) return hit.files[0].id as string;

  const made = await fetch(`${DRIVE}/files?fields=id&${common}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parent] }),
  }).then((r) => r.json());
  if (!made.id) throw new Error(`Could not create the folder "${name}": ${made.error?.message || "unknown"}`);
  return made.id as string;
}

/** The upload kinds, as folder names. Numbered so Drive sorts them in the order they are loaded. */
const FOLDERS: Record<string, string> = {
  jobs: "01 Jobmaster",
  projects: "02 Projects",
  tasks: "03 ToDo",
  delivered: "04 Delivered Jobs",
  employees: "05 Employee Master",
  pre: "06 PRE Workbook",
  crm: "10 CRM Attachments",
};

/** 1 April to 31 March, written the way the business writes it. */
function fyOf(iso: string): string {
  const y = Number(iso.slice(0, 4));
  const start = Number(iso.slice(5, 7)) >= 4 ? y : y - 1;
  return `FY${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/**
 * Where a file goes:
 *
 *   <root>/ FY2026-27 / 01 Jobmaster / 2026-08 / 2026-08-19 1801 Jobmaster….xlsx
 *
 * Financial year first because that is the unit the business closes on; kind
 * next because that is what somebody is looking for; month last so no single
 * folder ever holds more than about thirty files. The timestamp leads the
 * filename so Drive's own name sort is chronological, and so that uploading
 * the same export twice in a day cannot overwrite the first one.
 */
export function archivePath(kind: string, when: Date) {
  // the archive files by the IST calendar — a 00:30 IST upload belongs to
  // today's folder, not yesterday's UTC date
  const iso = new Date(when.getTime() + 330 * 60000).toISOString().slice(0, 10);
  return {
    fy: fyOf(iso),
    kind: FOLDERS[kind] || "09 Other",
    month: iso.slice(0, 7),
  };
}

const MIME: Record<string, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  csv: "text/csv",
};

export interface Archived {
  name: string;
  path: string;
  link: string | null;
}

/**
 * File one upload. Throws — the caller decides that a failure here is a
 * warning on the summary and never an error on the upload.
 */
export async function archiveUpload(
  cfg: DriveConfig,
  bytes: ArrayBuffer,
  filename: string,
  kind: string,
  when = new Date(),
): Promise<Archived> {
  const token = await accessToken(cfg);
  const p = archivePath(kind, when);

  let parent = cfg.folderId;
  for (const step of [p.fy, p.kind, p.month]) parent = await folder(token, parent, step);

  // "2026-08-19 1801 · Jobmaster - Planning Reporting (8).xlsx" — IST, the
  // clock the office lives by (Dr Raghu, 29 Aug 2026: every timing in IST)
  const ist = new Date(when.getTime() + 330 * 60000).toISOString();
  const stamp = `${ist.slice(0, 10)} ${ist.slice(11, 16).replace(":", "")}`;
  const name = `${stamp} · ${filename}`;
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const mime = MIME[ext] || "application/octet-stream";

  const boundary = "genie" + Math.random().toString(36).slice(2);
  const meta = JSON.stringify({ name, parents: [parent] });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`),
    Buffer.from(bytes),
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const res = await fetch(`${UPLOAD}?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": `multipart/related; boundary=${boundary}` },
    body,
  });
  const j = await res.json();
  if (!res.ok || !j.id) throw new Error(j.error?.message || `Drive refused the file (${res.status})`);

  return { name, path: `${p.fy}/${p.kind}/${p.month}`, link: j.webViewLink ?? null };
}
