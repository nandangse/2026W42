import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { requireAdmin, errJson } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// POST /api/templates — create/update a family milestone template. admin only.
// Body: { family, milestones: [...] }
export async function POST(req: Request) {
  try {
    await requireAdmin();
    const supabase = supabaseServer();
    const body = await readBody(req, {});
    if (!body.family) return NextResponse.json({ error: "family required" }, { status: 400 });
    const { error } = await supabase
      .from("family_templates")
      .upsert(
        { family: body.family, milestones: body.milestones || [] },
        { onConflict: "family" },
      );
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errJson(e);
  }
}
