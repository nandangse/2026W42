import { requireUser, errJson } from "@/lib/auth";
import { driveConfig, driveToken } from "@/lib/drive";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * A DRIVE VIDEO, SERVED THROUGH GENIE.
 *
 * Dr Raghu, 27 Sep 2026: "Google drive vide should be able to be seen only
 * here and not on new page" and "Able to see the video in 1x upto 1.5x".
 *
 * WHY A PROXY RATHER THAN GOOGLE'S EMBED. Drive's /preview is an iframe from
 * another origin, which means two things we cannot argue with: its player
 * carries a pop-out button that takes the lesson into a new Drive tab, and
 * nothing outside the frame can set its speed. Both of his asks are refused
 * by the same fact.
 *
 * Read the bytes ourselves and the video is an ordinary <video> element on
 * our own page: no pop-out, because there is no Drive player; and speed is
 * just a property, because the element is ours.
 *
 * RANGE REQUESTS ARE THE WHOLE JOB. A browser scrubbing a video asks for a
 * slice, and a server that answers every such ask with the entire file makes
 * seeking unusable and the bill large. The Range header is passed straight
 * through and Drive's 206 is passed straight back.
 *
 * IT IS SIGNED IN. The service account reads the file; the person must be a
 * Genie login. A training video is not public because it happens to be
 * reachable.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireUser();
    const cfg = driveConfig();
    if (!cfg) {
      return new Response("Drive is not configured — GOOGLE_SA_EMAIL, GOOGLE_SA_PRIVATE_KEY and DRIVE_UPLOAD_FOLDER_ID.", { status: 503 });
    }
    const id = String(params.id || "").replace(/[^\w-]/g, "");
    if (!id) return new Response("No file.", { status: 400 });

    const token = await driveToken(cfg);
    const range = req.headers.get("range");
    const upstream = await fetch(
      `https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`,
      { headers: { authorization: `Bearer ${token}`, ...(range ? { range } : {}) }, cache: "no-store" },
    );

    if (!upstream.ok && upstream.status !== 206) {
      /* Say which refusal it was. "Could not play" covers a file that is not
         shared with the service account and a file that does not exist, and
         those have completely different fixes. */
      const why = upstream.status === 404
        ? "Drive does not have that file, or it is not shared with Genie's service account."
        : upstream.status === 403
          ? "Drive refused: the file is not shared with Genie's service account."
          : `Drive answered ${upstream.status}.`;
      return new Response(why, { status: upstream.status === 404 ? 404 : 403 });
    }

    const h = new Headers();
    for (const k of ["content-type", "content-length", "content-range", "accept-ranges"]) {
      const v = upstream.headers.get(k);
      if (v) h.set(k, v);
    }
    if (!h.has("accept-ranges")) h.set("accept-ranges", "bytes");
    if (!h.has("content-type")) h.set("content-type", "video/mp4");
    /* Private: it is one person's signed-in read, not something a shared
       cache may keep and hand to the next person who asks. */
    h.set("cache-control", "private, max-age=3600");
    h.set("content-disposition", "inline");
    return new Response(upstream.body, { status: upstream.status, headers: h });
  } catch (e) {
    return errJson(e);
  }
}
