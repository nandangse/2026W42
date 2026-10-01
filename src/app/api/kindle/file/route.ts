import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { errJson, HttpError } from "@/lib/auth";
import { requireKindler } from "@/lib/kindle/auth";

export const dynamic = "force-dynamic";

/** GET /api/kindle/file?path=members/x.jpg — a signed, short-lived link into the private bucket, for Kindlers only. */
export async function GET(req: Request) {
  try {
    await requireKindler();
    const path = new URL(req.url).searchParams.get("path") || "";
    if (!path || path.includes("..")) throw new HttpError(400, "Which file?");
    const { data, error } = await adminClient().storage.from("kindle").createSignedUrl(path, 600);
    if (error || !data?.signedUrl) throw new HttpError(404, "No such file.");
    return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (e) { return errJson(e); }
}
