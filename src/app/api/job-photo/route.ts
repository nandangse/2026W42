import { NextResponse } from "next/server";
import { requireReader, requireTasker, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUCKET = "job-photos";
const LINK_TTL = 60 * 60 * 4;
const MAX_BYTES = 12 * 1024 * 1024;

/** GET ?job_id=… — one job's photos, newest first. Omit for every job. */
export async function GET(req: Request) {
  try {
    await requireReader();
    const admin = adminClient();
    const jobId = new URL(req.url).searchParams.get("job_id");

    let q = admin
      .from("job_photo")
      .select("id, job_id, path, caption, pct, taken_on, by, at")
      .order("taken_on", { ascending: false })
      .order("at", { ascending: false });
    if (jobId) q = q.eq("job_id", jobId);

    const { data, error } = await q.limit(500);
    if (error) {
      if (/job_photo|schema cache|does not exist/i.test(error.message))
        return NextResponse.json({ installed: false, photos: [] });
      throw new Error(error.message);
    }
    const photos = await Promise.all(
      (data || []).map(async (p) => {
        const { data: s } = await admin.storage.from(BUCKET).createSignedUrl(p.path, LINK_TTL);
        return { ...p, url: s?.signedUrl ?? null };
      }),
    );
    return NextResponse.json({ installed: true, photos });
  } catch (e) {
    return errJson(e);
  }
}

/**
 * POST (multipart) — file, job_id, caption?, pct?, taken_on?
 *
 * `pct` is stored as given rather than read from the job. The number on a job
 * moves; the photograph does not, and "70% on 12 August" is what makes the
 * pair worth keeping. Reading it live would silently rewrite the past every
 * time production advanced.
 */
export async function POST(req: Request) {
  try {
    const user = await requireTasker();
    const admin = adminClient();
    const form = await req.formData();

    const jobId = String(form.get("job_id") || "");
    if (!jobId) throw new HttpError(400, "job_id required");
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) throw new HttpError(400, "No photo was chosen.");
    if (!/^image\//.test(file.type || "")) throw new HttpError(400, "That is not an image.");
    if (file.size > MAX_BYTES)
      throw new HttpError(413, "That photo is over 12 MB — a phone photo is usually well under it.");

    const ext = (file.type.split("/")[1] || "jpg").split("+")[0];
    const path = `${jobId}/${Date.now()}.${ext}`;
    const { error: ue } = await admin.storage
      .from(BUCKET)
      .upload(path, await file.arrayBuffer(), { contentType: file.type });
    if (ue) {
      if (/bucket|not found/i.test(ue.message))
        throw new HttpError(503, "Run migration 0042 first — the job-photos bucket does not exist yet.");
      throw new Error(ue.message);
    }

    const pctRaw = form.get("pct");
    const pct = pctRaw == null || pctRaw === "" ? null : Math.max(0, Math.min(100, Number(pctRaw)));
    const takenOn = String(form.get("taken_on") || "").slice(0, 10) || undefined;

    const { error } = await admin.from("job_photo").insert({
      job_id: jobId,
      path,
      caption: String(form.get("caption") || "").trim().slice(0, 300),
      pct: Number.isFinite(pct as number) ? pct : null,
      mime: file.type,
      bytes: file.size,
      ...(takenOn ? { taken_on: takenOn } : {}),
      by: user.email,
    });
    if (error) {
      // The row failed, so the object is an orphan nothing will ever list.
      await admin.storage.from(BUCKET).remove([path]);
      if (/job_photo|schema cache|does not exist/i.test(error.message))
        throw new HttpError(503, "Run migration 0042 first — photos have nowhere to be recorded yet.");
      throw new Error(error.message);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errJson(e);
  }
}

/** DELETE ?id=… — removes the row and the file together. */
export async function DELETE(req: Request) {
  try {
    await requireTasker();
    const admin = adminClient();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new HttpError(400, "id required");
    const { data: row } = await admin.from("job_photo").select("path").eq("id", id).maybeSingle();
    if (row?.path) await admin.storage.from(BUCKET).remove([row.path]);
    const { error } = await admin.from("job_photo").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errJson(e);
  }
}
