import { NextResponse } from "next/server";
import { requireUser, requireAdmin, errJson } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// GET /api/app-settings — the app's own name/theme, read by every signed-in
// role (it drives the header). Falls back to the migration's defaults if the
// singleton row is somehow missing.
export async function GET() {
  try {
    await requireUser();
    const { data, error } = await adminClient()
      .from("app_settings")
      .select("app_name,theme_name,logo_url")
      .eq("id", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return NextResponse.json({
      app_name: data?.app_name || "Genie",
      theme_name: data?.theme_name || "Nandan Breakthrough 2026-27",
      logo_url: data?.logo_url || null,
    });
  } catch (e) {
    return errJson(e);
  }
}

// POST /api/app-settings — admin-only. { app_name?, theme_name? }
export async function POST(req: Request) {
  try {
    const user = await requireAdmin();
    const body = await req.json();
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: user.id };
    if ("app_name" in body) {
      const v = String(body.app_name || "").trim();
      if (!v) return NextResponse.json({ error: "App name can't be empty" }, { status: 400 });
      patch.app_name = v;
    }
    if ("theme_name" in body) {
      const v = String(body.theme_name || "").trim();
      if (!v) return NextResponse.json({ error: "Theme name can't be empty" }, { status: 400 });
      patch.theme_name = v;
    }
    if (Object.keys(patch).length <= 2) return NextResponse.json({ error: "nothing to update" }, { status: 400 });

    const { error } = await adminClient().from("app_settings").update(patch).eq("id", true);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errJson(e);
  }
}
