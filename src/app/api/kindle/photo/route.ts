import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { errJson, HttpError } from "@/lib/auth";
import { isKindleAdmin, kindleAudit, requireKindler } from "@/lib/kindle/auth";

export const dynamic = "force-dynamic";

/**
 * POST multipart /api/kindle/photo — a member's profile picture (or, for the
 * facilitator, any member's). Into the private 'kindle' bucket; served back
 * through /api/kindle/file, which checks the session before it signs.
 */
export async function POST(req: Request) {
  try {
    const k = await requireKindler();
    const form = await req.formData();
    const file = form.get("file");
    const forId = String(form.get("member_id") || k.id);
    if (forId !== k.id && !isKindleAdmin(k)) throw new HttpError(403, "Your own picture only.");
    if (!(file instanceof File)) throw new HttpError(400, "No file.");
    if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type)) throw new HttpError(400, "A JPEG, PNG or WebP picture.");
    if (file.size > 8 * 1024 * 1024) throw new HttpError(400, "Under 8 MB, please.");
    const ext = file.type.includes("png") ? "png" : file.type.includes("webp") ? "webp" : "jpg";
    const path = `members/${forId}-${Date.now()}.${ext}`;
    const admin = adminClient();
    const buf = Buffer.from(await file.arrayBuffer());
    const { error } = await admin.storage.from("kindle").upload(path, buf, { contentType: file.type, upsert: true });
    if (error) throw new HttpError(500, `Could not store the picture: ${error.message}`);
    await admin.from("kindle_member").update({ photo_path: path, updated_at: new Date().toISOString() }).eq("id", forId);
    await kindleAudit(k, "photo_set", { member: forId });
    return NextResponse.json({ ok: true, path });
  } catch (e) { return errJson(e); }
}
