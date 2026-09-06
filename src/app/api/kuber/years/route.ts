import { NextResponse } from "next/server";
import { requireKuber } from "@/lib/accounts";
import { errJson, HttpError, RAGHU_EMAIL } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { readBody } from "@/lib/validate";

export const dynamic = "force-dynamic";

/** Who may put a year's files in (Dr Raghu, 6 Sep 2026: "Suresh and me can upload"). */
const YEAR_UPLOADERS = new Set([RAGHU_EMAIL, "suresh@nandan.co.in"]);
const KINDS = new Set(["masters", "transactions", "audited", "gst"]);
const FY = /^\d{4}-\d{2}$/;

/** GET /api/kuber/years — every registered file, newest first, and whether the caller may upload. */
export async function GET() {
  try {
    const u = await requireKuber();
    const { data, error } = await adminClient()
      .from("kuber_year_file")
      .select("id, fy, month, kind, name, bytes, drive_link, note, by_email, initials, at")
      .order("at", { ascending: false })
      .limit(2000);
    if (error) {
      if (/kuber_year_file|schema cache|does not exist/i.test(error.message)) return NextResponse.json({ installed: false, files: [], mayUpload: false });
      throw new Error(error.message);
    }
    return NextResponse.json({ installed: true, files: data ?? [], mayUpload: u.isOwner || YEAR_UPLOADERS.has(u.email) });
  } catch (e) {
    return errJson(e);
  }
}

/** POST /api/kuber/years — register a file that the browser has put on Drive. */
export async function POST(req: Request) {
  try {
    const u = await requireKuber();
    if (!(u.isOwner || YEAR_UPLOADERS.has(u.email))) throw new HttpError(403, "Only Dr Raghu and Suresh put the year files in.");
    const b = await readBody(req, { fy: "string", kind: "string", name: "string", bytes: "number?", month: "number?", drive_id: "string?", drive_link: "string?", note: "string?" });
    if (!FY.test(b.fy)) throw new HttpError(400, "fy must look like 2025-26");
    if (!KINDS.has(b.kind)) throw new HttpError(400, "kind must be masters, transactions, audited or gst");
    if (b.month !== undefined && (b.month < 1 || b.month > 12)) throw new HttpError(400, "month must be 1–12");
    const { data, error } = await adminClient().from("kuber_year_file").insert({
      fy: b.fy, kind: b.kind, month: b.month ?? null, name: b.name, bytes: b.bytes ?? null,
      drive_id: b.drive_id || null, drive_link: b.drive_link || null, note: b.note || null,
      by_email: u.email, initials: u.initials,
    }).select("id").single();
    if (error) {
      if (/kuber_year_file|schema cache|does not exist/i.test(error.message)) throw new HttpError(400, "Run migration 0145 first — the year register does not exist yet.");
      throw new Error(error.message);
    }
    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    return errJson(e);
  }
}

/** DELETE /api/kuber/years?id= — the owner takes a wrong entry off the register (the Drive file stays). */
export async function DELETE(req: Request) {
  try {
    const u = await requireKuber();
    if (!u.isOwner) throw new HttpError(403, "Only the owner removes a year file from the register.");
    const id = new URL(req.url).searchParams.get("id") || "";
    if (!id) throw new HttpError(400, "id required");
    const { error } = await adminClient().from("kuber_year_file").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errJson(e);
  }
}
