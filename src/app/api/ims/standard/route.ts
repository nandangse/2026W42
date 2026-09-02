import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { isHead, requireIms, requireImsAdmin } from "@/ims/auth";
import { imsDb, notInstalled } from "@/ims/db";
import { log, need, ok } from "@/ims/api";

export const dynamic = "force-dynamic";

/**
 * The Standards Library and the clause browser.
 *
 * THE COPIES ARE COPYRIGHTED. A purchased PDF of ISO 9001 sitting on a public
 * bucket is a licence breach, not an inconvenience — so the bucket is private
 * (0001 §K), the download is a signed URL that expires, and only the MR and
 * department heads get one. The clause TREE is open to everybody admitted:
 * clause numbers and titles are not the standard, and the whole system hangs
 * off people being able to find 8.5.1.
 */
export async function GET(req: Request) {
  try {
    const me = await requireIms();
    const url = new URL(req.url);
    const standardId = url.searchParams.get("id");
    const db = imsDb();

    const { data: standards, error } = await db
      .from("ims_standard").select("*").order("sort_order");
    if (error) {
      if (notInstalled(error.message)) return NextResponse.json({ installed: false, rows: [] });
      throw new Error(error.message);
    }

    let clauses: unknown[] = [];
    if (standardId) {
      const { data } = await db
        .from("ims_standard_clause")
        .select("id, clause_no, title, parent_clause, sort_order")
        .eq("standard_id", standardId)
        .order("sort_order");
      clauses = data ?? [];
    }

    return NextResponse.json({
      installed: true,
      rows: standards ?? [],
      clauses,
      // Named here so the screen can say WHY the button is absent rather than
      // simply not drawing it.
      mayDownloadCopy: isHead(me),
    });
  } catch (e) {
    return errJson(e);
  }
}

/** POST { action: set_copy, id, path } — the MR files a purchased copy. */
export async function POST(req: Request) {
  try {
    const me = await requireImsAdmin();
    const body = await req.json();
    if (String(body.action || "") !== "set_copy") throw new HttpError(400, "Unknown action.");
    need(body.id, "id required");
    const { error } = await imsDb()
      .from("ims_standard")
      .update({ standard_copy_path: body.path || null })
      .eq("id", body.id);
    if (error) throw new Error(error.message);
    await log(me, "ims_standard", String(body.id), "set_copy", { path: body.path });
    return ok();
  } catch (e) {
    return errJson(e);
  }
}
