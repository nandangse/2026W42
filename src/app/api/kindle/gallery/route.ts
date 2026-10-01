import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { errJson, HttpError } from "@/lib/auth";
import { isKindleAdmin, kindleAudit, requireKindler } from "@/lib/kindle/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The gallery (Dr Raghu, 1 Oct 2026: "a photo gallery which should capture
 * photos from all the times that we've been doing"). Albums, usually one
 * per meeting or off-site; photos in the private 'kindle' bucket, served by
 * signed link through /api/kindle/file.
 * GET → albums with counts and a cover; ?album=id → its photos.
 * POST JSON  { action: "album", title, taken_on, meeting_id }   — any member
 *            { action: "caption", photo_id, caption }           — uploader or facilitator
 *            { action: "remove", photo_id } | { action: "remove_album", album_id }
 * POST multipart album_id + file(s)                             — upload, any member
 */
export async function GET(req: Request) {
  try {
    await requireKindler();
    const admin = adminClient();
    const album = new URL(req.url).searchParams.get("album");
    if (album) {
      const { data, error } = await admin.from("kindle_photo").select("id,album_id,path,caption,uploaded_by,created_at").eq("album_id", album).order("created_at");
      if (error) throw error;
      return NextResponse.json({ photos: data || [] });
    }
    const [{ data: albums, error }, { data: photos }] = await Promise.all([
      admin.from("kindle_album").select("id,title,taken_on,meeting_id,created_by,created_at").order("taken_on", { ascending: false, nullsFirst: false }),
      admin.from("kindle_photo").select("album_id,path,created_at").order("created_at"),
    ]);
    if (error) throw error;
    const out = (albums || []).map((a) => { const ps = (photos || []).filter((p) => p.album_id === a.id); return { ...a, count: ps.length, cover: ps[0]?.path || null }; });
    return NextResponse.json({ albums: out });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const k = await requireKindler();
    const admin = adminClient();
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const album_id = String(form.get("album_id") || "");
      if (!album_id) throw new HttpError(400, "Which album?");
      const files = form.getAll("file").filter((f): f is File => f instanceof File);
      if (!files.length) throw new HttpError(400, "No pictures.");
      const saved: string[] = [];
      for (const file of files) {
        if (!/^image\/(jpeg|png|webp|heic|heif|gif)$/i.test(file.type)) continue;
        if (file.size > 15 * 1024 * 1024) continue;
        const ext = file.type.includes("png") ? "png" : file.type.includes("webp") ? "webp" : file.type.includes("gif") ? "gif" : "jpg";
        const path = `albums/${album_id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error } = await admin.storage.from("kindle").upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
        if (error) throw new HttpError(500, `Could not store ${file.name}: ${error.message}`);
        await admin.from("kindle_photo").insert({ album_id, path, uploaded_by: k.id, bytes: file.size });
        saved.push(path);
      }
      await kindleAudit(k, "photos_added", { album_id, n: saved.length });
      return NextResponse.json({ ok: true, saved: saved.length });
    }
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(b.action || "");
    if (action === "album") {
      const title = String(b.title || "").trim();
      if (!title) throw new HttpError(400, "A title for the album.");
      const { data, error } = await admin.from("kindle_album").insert({ title, taken_on: b.taken_on ? String(b.taken_on) : null, meeting_id: b.meeting_id ? String(b.meeting_id) : null, created_by: k.id }).select("id").single();
      if (error) throw error;
      return NextResponse.json({ ok: true, id: data.id });
    }
    if (action === "caption") {
      const { data: p } = await admin.from("kindle_photo").select("uploaded_by").eq("id", String(b.photo_id)).maybeSingle();
      if (!p || (p.uploaded_by !== k.id && !isKindleAdmin(k))) throw new HttpError(403, "The uploader or the facilitator.");
      await admin.from("kindle_photo").update({ caption: String(b.caption || "").trim() || null }).eq("id", String(b.photo_id));
      return NextResponse.json({ ok: true });
    }
    if (action === "remove") {
      const { data: p } = await admin.from("kindle_photo").select("uploaded_by,path").eq("id", String(b.photo_id)).maybeSingle();
      if (!p || (p.uploaded_by !== k.id && !isKindleAdmin(k))) throw new HttpError(403, "The uploader or the facilitator.");
      await admin.storage.from("kindle").remove([String(p.path)]);
      await admin.from("kindle_photo").delete().eq("id", String(b.photo_id));
      return NextResponse.json({ ok: true });
    }
    if (action === "remove_album") {
      if (!isKindleAdmin(k)) throw new HttpError(403, "The facilitator removes albums.");
      const { data: ps } = await admin.from("kindle_photo").select("path").eq("album_id", String(b.album_id));
      if (ps?.length) await admin.storage.from("kindle").remove(ps.map((p) => String(p.path)));
      await admin.from("kindle_album").delete().eq("id", String(b.album_id));
      return NextResponse.json({ ok: true });
    }
    throw new HttpError(400, "Unknown action.");
  } catch (e) { return errJson(e); }
}
