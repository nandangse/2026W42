import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { crmDb, crmConfigured, CrmNotConfigured } from "@/crm/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The LIBRARY (Dr Raghu, 30 Aug 2026): brochures and standard enclosures a
 * quote submission can tick on. Lives in the cards bucket under library/.
 *
 *   GET               — the library files, plus ?quote=<id> lists that
 *                       quote's own attachments too
 *   POST multipart    — add a file to the library
 */
export async function GET(req: Request) {
  try {
    await requireCrm();
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    const db = crmDb();
    const u = new URL(req.url);
    const { data: lib } = await db.storage.from("cards").list("library", { limit: 100, sortBy: { column: "name", order: "asc" } });
    const library = (lib ?? []).filter((f) => f.name && !f.name.startsWith(".")).map((f) => ({
      name: f.name, path: `library/${f.name}`,
      size: (f.metadata as { size?: number } | null)?.size ?? null,
    }));
    let quoteFiles: { name: string; path: string; size: number | null }[] = [];
    const qid = String(u.searchParams.get("quote") || "").replace(/[^A-Za-z0-9-]/g, "");
    if (qid) {
      const { data: qf } = await db.storage.from("cards").list(`note/quotation/${qid}`, { limit: 100 });
      quoteFiles = (qf ?? []).filter((f) => f.name).map((f) => ({
        name: f.name.replace(/^\d+-/, ""), path: `note/quotation/${qid}/${f.name}`,
        size: (f.metadata as { size?: number } | null)?.size ?? null,
      }));
    }
    return NextResponse.json({ library, quoteFiles });
  } catch (e) {
    return errJson(e);
  }
}

export async function POST(req: Request) {
  try {
    await requireCrm();
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    const db = crmDb();
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "A file, please.");
    if (file.size > 25 * 1024 * 1024) throw new HttpError(413, "25 MB is the ceiling.");
    const clean = file.name.replace(/[^A-Za-z0-9._ -]+/g, "_").slice(-80) || "file";
    const { error } = await db.storage.from("cards").upload(`library/${clean}`, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type || "application/octet-stream", upsert: true,
    });
    if (error) throw new HttpError(500, error.message);
    return NextResponse.json({ ok: true, path: `library/${clean}`, name: clean });
  } catch (e) {
    return errJson(e);
  }
}
