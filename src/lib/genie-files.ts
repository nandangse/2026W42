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
  /* Dr Raghu, 30 Sep 2026: "The saving of all my files will be in the drive.
     make the relevant folders for it." A scanned bill is the single source of
     truth for an audit \u2014 it belongs where the rest of his files are, in a
     folder somebody can open without Genie. */
  sales_bill: "Bills \u2014 Sales",
  purchase_bill: "Bills \u2014 Purchase",
  /* screenshots pasted into an audit query's Details (30 Sep 2026) */
  audit: "Audit queries",
  /* the Field Report Forms off the ERP's Issues (Dr Raghu, 3 Oct 2026: "Pull the FRF forms also and put them in to the google drive") */
  seva_frf: "Seva \u2014 FRF forms",
} as const;
export type FileKind = keyof typeof FOLDERS;

/** The Drive folder pictures go into — its own, or the one Genie already uses. */
export function filesRoot(): string | null {
  return driveId(process.env.DRIVE_FILES_FOLDER_ID) || driveId(process.env.DRIVE_UPLOAD_FOLDER_ID) || null;
}

/**
 * THE ID, WHATEVER FORM IT WAS PASTED IN.
 *
 * 30 Sep 2026, first audit screenshot of the night: "Could not create the
 * folder 'Audit queries': File not found: 1WMeh…CRq?usp=drive_link". The
 * folder id had been pasted into the environment straight from the browser's
 * share button, with the link's tail still on it, and Drive was being asked
 * for a folder whose name ended in a question mark. Every Drive upload of the
 * day had quietly fallen back to the bucket or failed.
 *
 * A setting a person pastes should take what a person pastes: the bare id,
 * the id with a query string, or the whole folder URL.
 */
export function driveId(raw: string | undefined | null): string | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  const m = s.match(/\/folders\/([A-Za-z0-9_-]{10,})/) || s.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  const id = (m ? m[1] : s.split(/[?#]/)[0]).trim();
  return /^[A-Za-z0-9_-]{10,}$/.test(id) ? id : null;
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
export type PutResult =
  | { ok: true; ref: string; link: string | null }
  | { ok: false; why: string };

export async function putFile(
  kind: FileKind, filename: string, bytes: Buffer, mime: string,
): Promise<PutResult> {
  /**
   * A FALLBACK MUST SAY WHY IT FELL BACK.
   *
   * The first version returned null on any failure and the caller quietly
   * used the bucket. It worked — the picture was never lost — but the first
   * selfie taken after the change went to Supabase and there was nothing
   * anywhere saying what Drive had objected to. That is the same silent
   * nought this codebase keeps having to be cured of: the safe behaviour is
   * right, and hiding the reason for it is not.
   */
  const cfg = driveConfig();
  if (!cfg) return { ok: false, why: "GOOGLE_SA_EMAIL / GOOGLE_SA_PRIVATE_KEY are not set on the deploy" };
  const root = filesRoot();
  if (!root) return { ok: false, why: "neither DRIVE_FILES_FOLDER_ID nor DRIVE_UPLOAD_FOLDER_ID is set" };
  try {
    const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const up = await uploadToFolder(cfg, root, FOLDERS[kind], body, filename, mime || "image/jpeg");
    if (!up?.id) return { ok: false, why: "Drive accepted the upload but returned no file id" };
    return { ok: true, ref: DRIVE_PREFIX + up.id, link: up.link };
  } catch (e) {
    return { ok: false, why: (e instanceof Error ? e.message : String(e)).slice(0, 300) };
  }
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
