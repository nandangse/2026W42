import { NextResponse } from "next/server";
import { requirePlanner, errJson } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// POST /api/priority — set the manual priority order. planner/admin.
// Body: { order: string[] }  (job ids, in priority sequence)
export async function POST(req: Request) {
  try {
    await requirePlanner();
    const supabase = supabaseServer();
    const body = await req.json();
    const order: string[] = Array.isArray(body.order) ? body.order : [];
    const { error } = await supabase
      .from("settings")
      .upsert({ id: 1, priority_order: order }, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errJson(e);
  }
}
