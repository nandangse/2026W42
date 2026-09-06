import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireMarketing } from "@/lib/marketing";
import { adminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUCKET = "marketing-public";
const MAX = 20 * 1024 * 1024;
const OK = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml", "application/pdf"]);

/**
 * POST /api/marketing/asset — a picture or a PDF, hosted publicly by Genie
 * (Dr Raghu, 6 Sep 2026: "it has to be hosted in a public place through the
 * Genie itself!").
 *
 * Gmail, Outlook and every other reader fetch a mail's pictures without
 * signing in, so this is the one public bucket in Genie. What comes back is
 * a plain address anybody can open — put marketing pictures here and nothing
 * else. The path carries a random folder, so the address cannot be guessed
 * from the file's name.
 */
export async function POST(req: Request) {
  try {
    const u = await requireMarketing();
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "no file");
    if (file.size > MAX) throw new HttpError(400, `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 20 MB.`);
    const type = file.type || "application/octet-stream";
    if (!OK.has(type)) throw new HttpError(400, `${type} is not allowed here — pictures and PDFs only.`);

    const ext = (file.name.match(/\.[a-z0-9]{1,5}$/i)?.[0] || "").toLowerCase() || (type === "application/pdf" ? ".pdf" : ".png");
    const safe = file.name.replace(/\.[^.]*$/, "").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 60) || "file";
    const path = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}/${safe}${ext}`;

    const admin = adminClient();
    const { error } = await admin.storage.from(BUCKET).upload(path, await file.arrayBuffer(), { contentType: type, cacheControl: "31536000", upsert: false });
    if (error) {
      if (/bucket|not found/i.test(error.message)) throw new HttpError(503, "Run migration 0147 first — the public bucket does not exist yet.");
      throw new Error(error.message);
    }
    const url = `${env("NEXT_PUBLIC_SUPABASE_URL")}/storage/v1/object/public/${BUCKET}/${path}`;
    return NextResponse.json({ ok: true, url, by: u.email });
  } catch (e) {
    return errJson(e);
  }
}
