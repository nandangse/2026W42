import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { accessTokenFor, driveUploadAttachment, myMailbox } from "@/crm/gmail";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/crm/gmail/attach — multipart form, field "file".
 * The file lands in Dr Raghu's Drive mail folder (monthly subfolder), gets
 * anyone-with-link, and only the LINK travels on — Supabase stays lean.
 */
export async function POST(req: Request) {
  try {
    const user = await requireCrm();
    const mb = user.profileId ? await myMailbox(user.profileId) : null;
    if (!mb || mb.status !== "active")
      throw new HttpError(400, "Connect your Gmail first — Profile → Gmail connection.");
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "No file arrived.");
    if (file.size > 4_400_000)
      throw new HttpError(400, `${file.name} is ${(file.size / 1e6).toFixed(1)} MB — this door takes ~4 MB. Put it in Drive yourself and paste the link.`);
    const token = await accessTokenFor(String(mb.id));
    const out = await driveUploadAttachment(token, file.name, file.type, Buffer.from(await file.arrayBuffer()));
    return NextResponse.json(out);
  } catch (e) {
    return errJson(e);
  }
}
