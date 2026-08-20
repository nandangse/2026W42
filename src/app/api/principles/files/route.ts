import { NextResponse } from "next/server";
import { requireReader, requireOwner, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUCKET = "principle-docs";
/** Long enough to read a PDF without the tab going stale mid-scroll. */
const LINK_TTL = 60 * 60 * 4;
const MAX_BYTES = 25 * 1024 * 1024;

/**
 * GET /api/principles/files — the documents, for everybody signed in.
 *
 * Links are signed per read rather than stored. A stored URL either expires in
 * the row or never expires at all, and neither is what a private bucket is for.
 */
export async function GET() {
  try {
    await requireReader();
    const admin = adminClient();
    const { data, error } = await admin
      .from("principle_file")
      .select("id, name, note, path, mime, bytes, by, at")
      .order("ord", { ascending: true })
      .order("at", { ascending: false });
    if (error) {
      if (/principle_file|schema cache|does not exist/i.test(error.message))
        return NextResponse.json({ installed: false, files: [] });
      throw new Error(error.message);
    }
    const files = await Promise.all(
      (data || []).map(async (f) => {
        const { data: s } = await admin.storage.from(BUCKET).createSignedUrl(f.path, LINK_TTL);
        return { ...f, url: s?.signedUrl ?? null };
      }),
    );
    return NextResponse.json({ installed: true, files });
  } catch (e) {
    return errJson(e);
  }
}

/** POST (multipart) — file, note? — owner only. */
export async function POST(req: Request) {
  try {
    const user = await requireOwner();
    const admin = adminClient();
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) throw new HttpError(400, "No file was chosen.");
    if (file.size > MAX_BYTES)
      throw new HttpError(413, "That file is over 25 MB. Link to it instead, or export a lighter copy.");

    // The name is kept for the reader; the PATH is made safe, because a
    // filename with a slash or a quote in it breaks the object key.
    const safe = file.name.replace(/[^A-Za-z0-9._ -]/g, "_").slice(-80);
    const path = `${Date.now()}-${safe}`;

    const { error: ue } = await admin.storage
      .from(BUCKET)
      .upload(path, await file.arrayBuffer(), { contentType: file.type || "application/octet-stream" });
    if (ue) {
      if (/bucket|not found/i.test(ue.message))
        throw new HttpError(503, "Run migration 0041 first — the principle-docs bucket does not exist yet.");
      throw new Error(ue.message);
    }

    const { error } = await admin.from("principle_file").insert({
      name: file.name,
      note: String(form.get("note") || "").trim().slice(0, 300),
      path,
      mime: file.type || null,
      bytes: file.size,
      by: user.email,
    });
    if (error) {
      // The row failed, so the object is an orphan. Remove it rather than
      // leaving the bucket holding a file nothing lists.
      await admin.storage.from(BUCKET).remove([path]);
      if (/principle_file|schema cache|does not exist/i.test(error.message))
        throw new HttpError(503, "Run migration 0041 first — there is nowhere to record the document yet.");
      throw new Error(error.message);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errJson(e);
  }
}

/** DELETE ?id=… — owner only. Removes the row AND the object. */
export async function DELETE(req: Request) {
  try {
    await requireOwner();
    const admin = adminClient();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new HttpError(400, "id required");

    const { data: row } = await admin.from("principle_file").select("path").eq("id", id).maybeSingle();
    if (row?.path) await admin.storage.from(BUCKET).remove([row.path]);
    const { error } = await admin.from("principle_file").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errJson(e);
  }
}
