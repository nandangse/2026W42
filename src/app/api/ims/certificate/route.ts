import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { errJson, HttpError } from "@/lib/auth";
import { isHead, requireIms, requireImsAdmin } from "@/ims/auth";
import { imsDb, notInstalled } from "@/ims/db";
import { log, need, ok, pick } from "@/ims/api";

export const dynamic = "force-dynamic";

/**
 * Certificates & Statutory — ONE table, two words for it.
 *
 * A Factory Licence is a certificate with a different `kind`, an expiry date
 * and a renewal owner. Building it a screen of its own is how the licence
 * expires in a register nobody opened while the ISO certificate three feet
 * away was watched daily.
 */
const FIELDS = [
  "kind", "title", "certificate_no", "scheme", "issuing_body",
  "issue_date", "expiry_date", "renewal_owner_id", "file_path", "remarks",
];

export async function GET(req: Request) {
  try {
    await requireIms();
    const kind = String(new URL(req.url).searchParams.get("kind") || "");
    let q = imsDb().from("ims_certificate").select("*").order("expiry_date", { nullsFirst: false });
    if (kind) q = q.eq("kind", kind);
    const { data, error } = await q.limit(2000);
    if (error) {
      if (notInstalled(error.message)) return NextResponse.json({ installed: false, rows: [] });
      throw new Error(error.message);
    }
    return NextResponse.json({ installed: true, rows: data ?? [] });
  } catch (e) {
    return errJson(e);
  }
}

/**
 * POST { action: add | update | delete, id?, row? }
 *
 * Heads and the MR write; a member may read the vault but not change what it
 * says a certificate's expiry is.
 */
export async function POST(req: Request) {
  try {
    const me = await requireIms();
    const body = await readBody(req, {});
    const action = String(body.action || "");
    const db = imsDb();

    if (action === "delete") {
      // Deleting a certificate deletes evidence. The MR alone.
      await requireImsAdmin();
      need(body.id, "id required");
      const { error } = await db.from("ims_certificate").delete().eq("id", body.id);
      if (error) throw new Error(error.message);
      await log(me, "ims_certificate", String(body.id), "delete");
      return ok();
    }

    if (!isHead(me)) throw new HttpError(403, "Only the MR or a department head may change the vault.");

    const row = pick(body.row ?? {}, FIELDS);
    if (action === "add") {
      need(String(row.title || "").trim(), "A certificate needs a title.");
      const { data, error } = await db
        .from("ims_certificate")
        .insert({ ...row, created_by: me.email })
        .select("id")
        .maybeSingle();
      if (error) throw new Error(error.message);
      await log(me, "ims_certificate", data?.id ?? null, "add", { title: row.title });
      return ok({ id: data?.id });
    }

    if (action === "update") {
      need(body.id, "id required");
      const { error } = await db.from("ims_certificate").update(row).eq("id", body.id);
      if (error) throw new Error(error.message);
      await log(me, "ims_certificate", String(body.id), "update", row);
      return ok();
    }

    throw new HttpError(400, "Unknown action.");
  } catch (e) {
    return errJson(e);
  }
}
