import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { errJson, HttpError } from "@/lib/auth";
import { isHead, requireIms, type ImsUser } from "@/ims/auth";
import { imsDb } from "@/ims/db";
import { log, need, ok } from "@/ims/api";

export const dynamic = "force-dynamic";

/**
 * Files — four PRIVATE buckets, and never a public link.
 *
 * Every URL this route hands out is signed and short-lived. Nothing is served
 * by path; a path on its own opens nothing.
 *
 * `ims-standards` is the one that matters most: it holds PURCHASED COPIES of
 * copyrighted standards. Only the MR and department heads may download one,
 * and that check is here — on the server, before the URL exists — not in the
 * browser after the link has already been minted.
 */
const BUCKETS = ["ims-standards", "ims-certificates", "ims-documents", "ims-evidence"] as const;
type Bucket = (typeof BUCKETS)[number];

/** Ten minutes: long enough to open a PDF, short enough that a pasted link dies. */
const TTL = 600;

function gate(me: ImsUser, bucket: Bucket, write: boolean): void {
  if (bucket === "ims-standards" && !isHead(me))
    throw new HttpError(
      403,
      "The purchased standard copies are restricted to the MR and department heads — they are copyrighted documents.",
    );
  if (write && !isHead(me))
    throw new HttpError(403, "Only the MR or a department head may upload here.");
}

function bucketOf(v: unknown): Bucket {
  const b = String(v ?? "");
  if (!(BUCKETS as readonly string[]).includes(b)) throw new HttpError(400, "Unknown bucket.");
  return b as Bucket;
}

/** GET ?bucket=&path= — a signed URL to READ one file. */
export async function GET(req: Request) {
  try {
    const me = await requireIms();
    const url = new URL(req.url);
    const bucket = bucketOf(url.searchParams.get("bucket"));
    const path = String(url.searchParams.get("path") || "");
    need(path, "path required");
    gate(me, bucket, false);

    const { data, error } = await imsDb().storage.from(bucket).createSignedUrl(path, TTL);
    if (error) throw new HttpError(404, `That file is not in ${bucket}.`);
    await log(me, "storage", path, "read", { bucket });
    return NextResponse.json({ url: data.signedUrl, expiresIn: TTL });
  } catch (e) {
    return errJson(e);
  }
}

/**
 * POST { bucket, path } — a signed URL to UPLOAD one file.
 *
 * The browser PUTs straight to storage with this token, so a 40MB manual
 * never travels through a serverless function with a 4.5MB body limit.
 */
export async function POST(req: Request) {
  try {
    const me = await requireIms();
    const body = await readBody(req, {});
    const bucket = bucketOf(body.bucket);
    gate(me, bucket, true);

    const name = String(body.path || "").replace(/[^A-Za-z0-9._/-]/g, "_");
    need(name, "path required");
    // Stamped so two uploads of "certificate.pdf" are two files, not one
    // overwriting the other.
    const path = `${Date.now()}-${name}`;

    const { data, error } = await imsDb().storage.from(bucket).createSignedUploadUrl(path);
    if (error) throw new Error(error.message);
    await log(me, "storage", path, "upload", { bucket });
    return ok({ path: data.path, token: data.token, signedUrl: data.signedUrl });
  } catch (e) {
    return errJson(e);
  }
}
