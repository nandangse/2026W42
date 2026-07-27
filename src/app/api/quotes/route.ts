import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireAdmin, errJson } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { parseQuotes } from "@/lib/parse-quotes";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/quotes — collection stats for the Admin page. admin only.
export async function GET() {
  try {
    await requireAdmin();
    const admin = adminClient();
    const [all, orig] = await Promise.all([
      admin.from("quotes").select("id", { count: "exact", head: true }),
      admin.from("quotes").select("id", { count: "exact", head: true }).eq("original", true),
    ]);
    if (all.error) throw new Error(all.error.message);
    return NextResponse.json({
      total: all.count ?? 0,
      original: orig.count ?? 0,
      attributed: (all.count ?? 0) - (orig.count ?? 0),
    });
  } catch (e) {
    return errJson(e);
  }
}

// POST /api/quotes (multipart) — upload another quotes workbook. admin only.
// Idempotent: quotes already present (same text) are skipped, so re-uploading
// the same sheet adds nothing.
export async function POST(req: Request) {
  try {
    await requireAdmin();
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File))
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    if (file.size > 25 * 1024 * 1024)
      return NextResponse.json({ error: "File too large (max 25 MB)" }, { status: 413 });

    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array" });
    } catch (e) {
      return NextResponse.json(
        { error: "Could not read the file: " + (e instanceof Error ? e.message : String(e)) },
        { status: 422 },
      );
    }

    const parsed = parseQuotes(wb);
    if (!parsed.length)
      return NextResponse.json(
        { error: "No quotes found. The sheet needs a 'Quote' column (plus optional Category / Author / Source)." },
        { status: 422 },
      );

    const admin = adminClient();
    const { count: before } = await admin
      .from("quotes")
      .select("id", { count: "exact", head: true });

    // seq continues after the existing collection so the daily cycle stays stable
    const base = before ?? 0;
    const rows = parsed.map((q, i) => ({ ...q, seq: base + i }));

    // ignoreDuplicates makes this a true no-op for quotes we already hold
    const { error } = await admin
      .from("quotes")
      .upsert(rows, { onConflict: "md5(body)", ignoreDuplicates: true });
    if (error) throw new Error(error.message);

    const { count: after } = await admin
      .from("quotes")
      .select("id", { count: "exact", head: true });

    return NextResponse.json({
      ok: true,
      parsed: parsed.length,
      added: (after ?? 0) - base,
      skipped: parsed.length - ((after ?? 0) - base),
      total: after ?? 0,
    });
  } catch (e) {
    return errJson(e);
  }
}
