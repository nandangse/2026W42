import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireSeva } from "@/lib/seva";
import { adminClient } from "@/lib/supabase/admin";
import { readBody } from "@/lib/validate";
import { pullIssues, pullIssueFiles, copyFrfToDrive } from "@/lib/seva-issues";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * /api/seva/erp-tickets — the support tickets, off nandanerp.
 *
 *   POST { action: "tickets", start? }               the whole walk, a dozen pages a call, resumable
 *   POST { action: "attachments", parent?, start? }  the files hanging off Issues (or contracts), indexed
 *   POST { action: "frf", limit? }                   copy FRF forms off the ERP into the Drive, a batch a call
 *   GET  ?name=ISS-…                                 one ticket's attachments, for the box
 *
 * The walk itself lives in lib/seva-issues, where the hourly cron runs the
 * same code from a cursor (3 Oct 2026). fields=["*"] — every field the ERP
 * holds lands in `erp`. The button is the owner's; the hour is nobody's.
 */
type Doc = Record<string, unknown>;
const S = (v: unknown) => String(v ?? "").trim();

export async function GET(req: Request) {
  try {
    await requireSeva();
    const name = S(new URL(req.url).searchParams.get("name"));
    if (!name) throw new HttpError(400, "name required");
    const { data } = await adminClient().from("seva_attachment").select("id, file_name, file_url, file_size, is_private, uploaded_at, drive_url, drive_at").eq("parent_name", name).order("uploaded_at");
    return NextResponse.json({ ok: true, rows: data ?? [] });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const me = await requireSeva();
    if (!me.isOwner) throw new HttpError(403, "The ERP door is Raghu's to use, for now — the hour pulls for everyone.");
    const body = await readBody(req, {}).catch(() => ({} as Doc));
    const action = S(body.action) || "tickets";
    const admin = adminClient();
    const start = Math.max(0, Number(body.start) || 0);
    if (action === "tickets") {
      const out = await pullIssues(admin, { start, maxPages: 12 });
      return NextResponse.json({ ok: true, action, ...out });
    }
    if (action === "attachments") {
      const parent = S(body.parent) === "amc" ? "Annual Maintenance Contract" : "Issue";
      const out = await pullIssueFiles(admin, { parent, start, maxPages: 12 });
      return NextResponse.json({ ok: true, action, parent, ...out });
    }
    if (action === "frf") {
      const out = await copyFrfToDrive(admin, { limit: Math.min(200, Math.max(1, Number(body.limit) || 40)), by: me.email });
      return NextResponse.json({ ok: true, action, ...out });
    }
    throw new HttpError(400, "unknown action");
  } catch (e) { return errJson(e); }
}
