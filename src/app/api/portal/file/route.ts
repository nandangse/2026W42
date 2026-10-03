import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { errJson, HttpError } from "@/lib/auth";
import { requirePortalUser } from "@/lib/portal/auth";

export const dynamic = "force-dynamic";

/** GET /api/portal/file?path=logos/veda.png — a signed, short-lived link into the private bucket, for portal logins only. */
export async function GET(req: Request) {
  try {
    await requirePortalUser();
    const path = new URL(req.url).searchParams.get("path") || "";
    if (!path || path.includes("..")) throw new HttpError(400, "Which file?");
    const { data, error } = await adminClient().storage.from("portal").createSignedUrl(path, 600);
    if (error || !data?.signedUrl) throw new HttpError(404, "No such file.");
    return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (e) { return errJson(e); }
}
