import { NextResponse } from "next/server";
import { requireUploader, errJson } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { applyUpload, UploadError } from "@/lib/upload-merge";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/upload (multipart) — the only door for data. uploader or admin.
// The merge itself runs under the service role (it archives/closes rows no
// user role could), but the caller is authenticated & authorised first.
export async function POST(req: Request) {
  try {
    const user = await requireUploader();
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    // 25 MB cap — the real morning exports are <5 MB; this blocks memory-DoS uploads
    if (file.size > 25 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File too large (max 25 MB). The morning exports are well under this." },
        { status: 413 },
      );
    }
    // Which card it was dropped on, when the page sent one. Advisory: the
    // merge still verifies the content matches, and still refuses a jobs
    // upload that would retire the board.
    const slotRaw = form.get("slot");
    const slot = typeof slotRaw === "string" ? slotRaw : undefined;

    const buf = await file.arrayBuffer();
    const summary = await applyUpload(
      adminClient(),
      buf,
      file.name,
      user.email,
      slot,
    );
    return NextResponse.json({ ok: true, summary });
  } catch (e) {
    if (e instanceof UploadError) {
      return NextResponse.json({ error: e.message }, { status: 422 });
    }
    return errJson(e);
  }
}
