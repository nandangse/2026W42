import { NextResponse } from "next/server";
import { swallow } from "@/lib/swallow";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { crmDb, crmConfigured, CrmNotConfigured } from "@/crm/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Opportunity attachments (Dr Raghu, 30 Aug 2026: "in the enquiry info show
 * Add Attachment").
 *
 * POST multipart { opportunity_id, file } — the file lands in the cards
 * bucket under opp/<id>/, and the caller gets back a LINK it can weave into
 * the enquiry's rich text.
 *
 * GET ?path= — a login-gated door: answers with a fresh signed URL redirect,
 * so the link in the text never goes stale and never works without a Genie
 * login. Only paths under opp/ are served.
 */
export async function POST(req: Request) {
  try {
    await requireCrm();
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    const db = crmDb();
    const form = await req.formData();
    const oppId = String(form.get("opportunity_id") || "");
    const tType = String(form.get("target_type") || "").replace(/[^a-z_]/g, "");
    const tId = String(form.get("target_id") || "").replace(/[^A-Za-z0-9-]/g, "");
    const file = form.get("file");
    if ((!oppId && !(tType && tId)) || !(file instanceof File)) throw new HttpError(400, "A record and a file, please.");
    if (file.size > 25 * 1024 * 1024) throw new HttpError(413, "25 MB is the ceiling for an attachment.");
    const clean = file.name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80) || "file";
    const path = oppId ? `opp/${oppId}/${Date.now()}-${clean}` : `note/${tType}/${tId}/${Date.now()}-${clean}`;
    const buf = Buffer.from(await file.arrayBuffer());
    const { error } = await db.storage.from("cards").upload(path, buf, { contentType: file.type || "application/octet-stream" });
    if (error) {
      if (/bucket/i.test(error.message)) throw new HttpError(503, "Run CRM migration 0018 first — the storage bucket does not exist yet.");
      throw new HttpError(500, error.message);
    }
    // EVERY attachment also lands in the Drive archive (Dr Raghu, 30 Aug
    // 2026: "all attachments go to the drive folder — make as many
    // subfolders as needed") — FY / 10 CRM Attachments / month, fire and
    // forget: the record's own copy never waits on Google.
    try {
      const { driveConfig, archiveUpload } = await import("@/lib/drive");
      const dCfg = driveConfig();
      if (dCfg) void archiveUpload(dCfg, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, file.name, "crm").catch(() => null);
    } catch (e) { swallow("crm/opp-attach", e); /* the archive is a mirror, never the master */ }
    return NextResponse.json({ ok: true, name: file.name, url: `/api/crm/opp-attach?path=${encodeURIComponent(path)}` });
  } catch (e) {
    return errJson(e);
  }
}

export async function GET(req: Request) {
  try {
    await requireCrm();
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    const path = String(new URL(req.url).searchParams.get("path") || "");
    if (!path.startsWith("opp/") && !path.startsWith("note/")) throw new HttpError(400, "Not a Genie attachment path.");
    const { data, error } = await crmDb().storage.from("cards").createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) throw new HttpError(404, "That attachment is not on record.");
    return NextResponse.redirect(data.signedUrl, 302);
  } catch (e) {
    return errJson(e);
  }
}
