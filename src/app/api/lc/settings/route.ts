import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { readBody } from "@/lib/validate";
import { requireCouncilOwner } from "@/lib/lc/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/lc/settings { key, value } — the owner's switches for the
 * council. Today one: drive_folder, the Google Drive folder every council
 * file is pushed into once it is in the bucket. A pasted share link is
 * taken as it comes — the bare id, the id with its "?usp=" tail, or the whole
 * URL — because a setting a person pastes should take what a person pastes.
 */
const KEYS = new Set(["drive_folder"]);

const folderIdFrom = (v: string) => {
  const s = String(v || "").trim();
  const m = /folders\/([\w-]{10,})/.exec(s) || /[?&]id=([\w-]{10,})/.exec(s);
  return (m ? m[1] : s.split(/[?#]/)[0]).trim();
};

export async function POST(req: Request) {
  try {
    const u = await requireCouncilOwner();
    const b = await readBody(req, { key: "string", value: "string?" });
    if (!KEYS.has(b.key)) throw new HttpError(400, "Not a setting.");
    const value = b.key === "drive_folder" ? folderIdFrom(b.value || "") : (b.value || "").trim();
    const { error } = await adminClient().from("lc_setting").upsert({ key: b.key, value: value || null, updated_by: u.email, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) throw error;
    return NextResponse.json({ ok: true, value });
  } catch (e) { return errJson(e); }
}
