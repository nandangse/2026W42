import { NextResponse } from "next/server";
import { requireReader, requireTasker, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Photos and files on a task (Dr Raghu, 28 Aug 2026) — the same arrangement
 * as /api/job-photo: object in a private bucket, row in a table, signed URLs
 * on the way out. The rows also feed the Drive sync on the Mac, which mirrors
 * every attachment into the "Photos from Genie" / "Files from Genie" folders
 * and stamps drive_synced_at when it has.
 */
const BUCKET = "task-files";
const LINK_TTL = 60 * 60 * 4;
const MAX_BYTES = 12 * 1024 * 1024;

/** GET ?task_id=…&kind=manual|erp — one task's attachments, newest first. */
export async function GET(req: Request) {
  try {
    await requireReader();
    const admin = adminClient();
    const url = new URL(req.url);
    const taskId = url.searchParams.get("task_id");
    const kind = url.searchParams.get("kind");
    if (!taskId || !kind) throw new HttpError(400, "task_id and kind required");

    const { data, error } = await admin
      .from("task_file")
      .select("id, name, path, mime, bytes, is_photo, by, at")
      .eq("task_id", taskId)
      .eq("task_kind", kind)
      .order("at", { ascending: false })
      .limit(100);
    if (error) {
      if (/task_file|schema cache|does not exist/i.test(error.message))
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

/** POST (multipart) — file, task_id, kind. Any file type; photos are flagged. */
export async function POST(req: Request) {
  try {
    const user = await requireTasker();
    const admin = adminClient();
    const form = await req.formData();

    const taskId = String(form.get("task_id") || "");
    const kind = String(form.get("kind") || "");
    if (!taskId || !["manual", "erp"].includes(kind)) throw new HttpError(400, "task_id and kind required");
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) throw new HttpError(400, "No file was chosen.");
    if (file.size > MAX_BYTES)
      throw new HttpError(413, "That file is over 12 MB — attach something smaller, or put it on Drive and paste the link in a comment.");

    const clean = (file.name || "file").replace(/[^\w.\-()+ ]+/g, "_").slice(0, 120);
    const path = `${kind}/${taskId}/${Date.now()}-${clean}`;
    const { error: ue } = await admin.storage
      .from(BUCKET)
      .upload(path, await file.arrayBuffer(), { contentType: file.type || "application/octet-stream" });
    if (ue) {
      if (/bucket|not found/i.test(ue.message))
        throw new HttpError(503, "Run migration 0074 first — the task-files bucket does not exist yet.");
      throw new Error(ue.message);
    }

    const { error } = await admin.from("task_file").insert({
      task_id: taskId,
      task_kind: kind,
      name: clean,
      path,
      mime: file.type || null,
      bytes: file.size,
      is_photo: /^image\//.test(file.type || ""),
      by: user.email,
    });
    if (error) {
      // The row failed, so the object is an orphan nothing will ever list.
      await admin.storage.from(BUCKET).remove([path]);
      if (/task_file|schema cache|does not exist/i.test(error.message))
        throw new HttpError(503, "Run migration 0074 first — attachments have nowhere to be recorded yet.");
      throw new Error(error.message);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errJson(e);
  }
}

/** DELETE ?id=… — the row and the object together. Whoever attached it, or an admin. */
export async function DELETE(req: Request) {
  try {
    const user = await requireTasker();
    const admin = adminClient();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new HttpError(400, "id required");

    const { data: row } = await admin.from("task_file").select("id, path, by").eq("id", id).maybeSingle();
    if (!row) throw new HttpError(404, "No such attachment");
    if (row.by !== user.email && user.role !== "admin" && !user.isOwner)
      throw new HttpError(403, "Only whoever attached it, or an admin, may remove it.");

    await admin.storage.from(BUCKET).remove([row.path]);
    const { error } = await admin.from("task_file").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errJson(e);
  }
}
