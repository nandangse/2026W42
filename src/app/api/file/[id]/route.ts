import { NextResponse } from "next/server";
import { driveConfig, downloadFile } from "@/lib/drive";
import { requireUser, errJson, HttpError } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * A PRIVATE PICTURE, PASSED THROUGH.
 *
 * Drive holds Genie's photographs now, and a browser cannot fetch a private
 * Drive file on its own. So Genie fetches it and hands it on, behind the same
 * sign-in as everything else.
 *
 * THE FOLDER IS NOT PUBLIC AND WILL NOT BE. These are visiting cards, selfies
 * with customers, and photographs inside a customer's plant. A public link is
 * a link that outlives the reason it was made.
 *
 * Cached hard in the browser, because a picture at a given Drive id never
 * changes — a new photograph is a new id.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireUser();
    const id = String(params.id || "").replace(/[^A-Za-z0-9_-]/g, "");
    if (!id) throw new HttpError(400, "no file");
    const cfg = driveConfig();
    if (!cfg) throw new HttpError(503, "Google Drive is not configured on this deploy.");
    const buf = await downloadFile(cfg, id);
    /* Drive does not give the type back on a download and these are all
       photographs, so JPEG is the honest default and PNG is sniffed. */
    const png = buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50;
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "content-type": png ? "image/png" : "image/jpeg",
        "cache-control": "private, max-age=86400, immutable",
        "content-length": String(buf.length),
      },
    });
  } catch (e) { return errJson(e); }
}
