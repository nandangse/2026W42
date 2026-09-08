import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { accessTokenFor, driveUploadAttachment, myMailbox } from "@/crm/gmail";
import { crmDb, crmConfigured } from "@/crm/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/crm/gmail/attach — two ways in, one way out.
 *
 *   multipart, field "file"   — a file off his machine
 *   JSON { path }             — one already in the LIBRARY (Dr Raghu, 8 Sep
 *                               2026: "this should also have from library")
 *
 * Either way the file lands in the Drive mail folder, gets anyone-with-link,
 * and only the LINK travels on — Supabase stays lean.
 *
 * THE LIBRARY FILE IS COPIED, NOT LINKED TO. A signed Supabase URL expires,
 * and a brochure sent today is opened next month; a link that has gone dead
 * by then is worse than no attachment, because the sender believes it went.
 * The copy behaves exactly like anything he attaches by hand, which is also
 * why both roads end at the same Drive folder rather than two.
 */
export async function POST(req: Request) {
  try {
    const user = await requireCrm();
    const mb = user.profileId ? await myMailbox(user.profileId) : null;
    if (!mb || mb.status !== "active")
      throw new HttpError(400, "Connect your Gmail first — Profile → Gmail connection.");
    const token0 = req.headers.get("content-type") || "";

    /* ── from the library: fetch it out of storage, then the same road ── */
    if (token0.includes("application/json")) {
      if (!crmConfigured()) throw new HttpError(503, "CRM not configured.");
      const body = (await req.json()) as { path?: unknown };
      const path = String(body.path ?? "").trim();
      if (!path || !path.startsWith("library/") || path.includes(".."))
        throw new HttpError(400, "That is not a library file.");
      const { data: blob, error } = await crmDb().storage.from("cards").download(path);
      if (error || !blob) throw new HttpError(404, `${path.replace(/^library\//, "")} is no longer in the library.`);
      const nameOnly = path.slice("library/".length);
      const token = await accessTokenFor(String(mb.id));
      const out = await driveUploadAttachment(
        token, nameOnly, blob.type || "application/octet-stream",
        Buffer.from(await blob.arrayBuffer()),
      );
      return NextResponse.json(out);
    }

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
