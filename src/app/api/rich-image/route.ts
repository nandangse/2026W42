import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { errJson, HttpError, requireUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/rich-image — a picture pasted or chosen in ANY rich-text box
 * becomes a public link (Dr Raghu, 7 Oct 2026: "a provision in all the rich
 * text fields where I can paste an image. Every time, I cannot upload it
 * from a URL. Once I paste it, it can save it on the server as a public
 * link, no problem.")
 *
 * It lands in the marketing-public bucket (public by design since 0147,
 * images only, 20 MB) under rich/<month>/<random>-<name>, so a quote
 * template, a letter, an About page or a mail body can carry it anywhere
 * the document goes. Any signed-in Genie user; the path is random, the
 * picture is one the sender meant to publish in a document.
 */
const BUCKET = "marketing-public";
const MAX = 20 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    const me = await requireUser();
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) throw new HttpError(400, "No picture came through.");
    if (!/^image\/(png|jpe?g|gif|webp|svg\+xml)$/i.test(file.type)) throw new HttpError(400, "Pictures only — PNG, JPEG, GIF, WebP or SVG.");
    if (file.size > MAX) throw new HttpError(400, "That picture is over 20 MB — shrink it first.");
    const ext = file.type === "image/svg+xml" ? "svg" : file.type.replace(/^image\//, "").replace("jpeg", "jpg");
    const base = (file.name || "picture").replace(/\.[^.]+$/, "").replace(/[^\w\-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "picture";
    const month = new Date().toISOString().slice(0, 7);
    const path = `rich/${month}/${randomBytes(6).toString("hex")}-${base}.${ext}`;
    const admin = adminClient();
    const { error } = await admin.storage.from(BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false, cacheControl: "31536000" });
    if (error) throw new HttpError(502, `Could not keep the picture: ${error.message}`);
    const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
    return NextResponse.json({ ok: true, url: data.publicUrl, path, by: me.email });
  } catch (e) {
    return errJson(e);
  }
}
