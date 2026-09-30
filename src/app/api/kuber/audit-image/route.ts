import { NextResponse } from "next/server";
import { requireKuber } from "@/lib/accounts";
import { errJson, HttpError } from "@/lib/auth";
import { putFile } from "@/lib/genie-files";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * A SCREENSHOT PASTED INTO AN AUDIT QUERY'S DETAILS.
 *
 * Dr Raghu, 30 Sep 2026: "change to 'Details' and make it rich text to put
 * screenshots." The picture goes to the shared drive — "Audit queries",
 * beside the bills — and what the query keeps is Genie's own address for it,
 * so the folder is never handed out and the image is never inlined into the
 * row as a megabyte of base64.
 */
export async function POST(req: Request) {
  try {
    await requireKuber();
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "No image came through.");
    if (!/^image\//.test(file.type)) throw new HttpError(415, "Only an image can be pasted here.");
    if (file.size > 10 * 1024 * 1024) throw new HttpError(413, "That image is over 10 MB.");
    const ext = (file.type.split("/")[1] || "png").split("+")[0];
    const buf = Buffer.from(await file.arrayBuffer());
    const up = await putFile("audit", `aq-${Date.now()}.${ext}`, buf, file.type);
    if (!up.ok) throw new HttpError(503, `Drive would not take it: ${up.why}`);
    return NextResponse.json({ ok: true, url: `/api/file/${up.ref.replace(/^drive:/, "")}` });
  } catch (e) { return errJson(e); }
}
