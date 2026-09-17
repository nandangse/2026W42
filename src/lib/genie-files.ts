import { driveConfig, uploadToFolder } from "@/lib/drive";

/**
 * WHERE GENIE'S PICTURES LIVE.
 *
 * Dr Raghu, 17 Sep 2026: "the job photos can easily be in the drive. It's
 * much better, the supabase can bloat quickly, so best is maintain the link.
 * The selfies and the cards also, same way."
 *
 * He is right about the bloat. Measured the same morning: 150 job photos at
 * 517 MB, because nothing shrinks them; 336 voice notes at 214 MB; 768 MB in
 * all, against a database project whose storage is a paid, finite thing.
 * Drive on a shared drive is not finite in any way that matters here.
 *
 * NO NEW COLUMNS, DELIBERATELY. A Drive file is written into the SAME column
 * that held the bucket path, as "drive:<id>". Everything already stored keeps
 * resolving exactly as it did, new pictures go to Drive, and there is no
 * migration to run and no day on which half the photographs are in one place
 * and half in another with nothing to tell them apart.
 *
 * THE ONE COST, stated plainly: a browser cannot show a private Drive file
 * directly. Supabase handed out signed URLs; Drive needs Genie to fetch the
 * bytes and pass them on. That is /api/file/<id> — one more hop, and the
 * reason the alternative was never on offer: the alternative is making the
 * folder public, and these are visiting cards and photographs of a customer's
 * plant.
 */
export const DRIVE_PREFIX = "drive:";
export const isDriveRef = (p: string | null | undefined) => !!p && String(p).startsWith(DRIVE_PREFIX);
export const driveIdOf = (p: string) => String(p).slice(DRIVE_PREFIX.length);

/** Where each kind of picture is filed inside the Drive folder. */
export const FOLDERS = {
  card: "Visiting cards",
  selfie: "Selfies",
  job: "Job photos",
} as const;
export type FileKind = keyof typeof FOLDERS;

/** The Drive folder pictures go into — its own, or the one Genie already uses. */
export function filesRoot(): string | null {
  return (process.env.DRIVE_FILES_FOLDER_ID || process.env.DRIVE_UPLOAD_FOLDER_ID || "").trim() || null;
}

export function driveReady(): boolean {
  return !!driveConfig() && !!filesRoot();
}

/**
 * Put a picture in Drive and hand back what to store.
 *
 * Returns null when Drive is not configured, so a caller can fall back to the
 * bucket rather than losing somebody's photograph — a picture taken at a
 * stand must never be refused because a setting is missing.
 */
export async function putFile(
  kind: FileKind, filename: string, bytes: Buffer, mime: string,
): Promise<{ ref: string; link: string | null } | null> {
  const cfg = driveConfig();
  const root = filesRoot();
  if (!cfg || !root) return null;
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const up = await uploadToFolder(cfg, root, FOLDERS[kind], body, filename, mime || "image/jpeg");
  return { ref: DRIVE_PREFIX + up.id, link: up.link };
}

/**
 * The address a browser can use for whatever is stored.
 *
 * A Drive reference becomes Genie's own proxy; a bucket path is signed as it
 * always was. One function so no screen has to know which it is looking at.
 */
export async function fileUrl(
  stored: string | null | undefined,
  signBucketPath: (p: string) => Promise<string | null>,
): Promise<string | null> {
  const p = String(stored || "");
  if (!p) return null;
  if (isDriveRef(p)) return `/api/file/${driveIdOf(p)}`;
  return signBucketPath(p);
}
