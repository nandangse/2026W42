import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { errJson } from "@/lib/auth";
import { kindleAudit, requireKindleAdmin } from "@/lib/kindle/auth";

export const dynamic = "force-dynamic";

const KEYS = ["whatsapp_link", "drive_photos_folder", "meeting_venue", "meeting_day"];

/** POST { values: { key: value } } — the facilitator's small named values. */
export async function POST(req: Request) {
  try {
    const k = await requireKindleAdmin();
    const b = (await req.json().catch(() => ({}))) as { values?: Record<string, unknown> };
    const rows = Object.entries(b.values || {}).filter(([key]) => KEYS.includes(key)).map(([key, value]) => ({ key, value: value == null ? "" : String(value), updated_by: k.email, updated_at: new Date().toISOString() }));
    if (rows.length) { const { error } = await adminClient().from("kindle_setting").upsert(rows, { onConflict: "key" }); if (error) throw error; }
    await kindleAudit(k, "settings_saved", { keys: rows.map((r) => r.key) });
    return NextResponse.json({ ok: true });
  } catch (e) { return errJson(e); }
}
