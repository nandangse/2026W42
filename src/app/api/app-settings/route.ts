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
    // the run-rate targets ride along once 0102's column exists
    let delivered_targets: unknown = null;
    {
      const { data: t, error: te } = await adminClient()
        .from("app_settings").select("delivered_targets").eq("id", true).maybeSingle();
      if (!te) delivered_targets = t?.delivered_targets ?? null;
    }
    return NextResponse.json({
      app_name: data?.app_name || "Genie",
      theme_name: data?.theme_name || "Nandan Breakthrough 2026-27",
      logo_url: data?.logo_url || null,
      delivered_targets,
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
    // the delivered run-rate targets (Dr Raghu, 30 Aug 2026): Cr per month,
    // read by the Delivered Jobs fourth box (column arrives with 0102)
    if ("delivered_targets" in body) {
      const t = body.delivered_targets as { value_cr?: unknown; tp_cr?: unknown; nos?: unknown };
      const value_cr = Number(t?.value_cr), tp_cr = Number(t?.tp_cr);
      if (!Number.isFinite(value_cr) || !Number.isFinite(tp_cr) || value_cr <= 0 || tp_cr <= 0)
        return NextResponse.json({ error: "Targets must be positive numbers, in crores per month." }, { status: 400 });
      const nos = Number(t?.nos);
      patch.delivered_targets = { value_cr, tp_cr, ...(Number.isFinite(nos) && nos > 0 ? { nos } : {}) };
    }
    if (Object.keys(patch).length <= 2) return NextResponse.json({ error: "nothing to update" }, { status: 400 });

    const { error } = await adminClient().from("app_settings").update(patch).eq("id", true);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errJson(e);
  }
}
