import { NextResponse } from "next/server";
import { requirePlanner, errJson } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// POST /api/project-field — the project's own written fields. planner/admin.
// Via the admin client because projects carries a read-only policy: the table
// belongs to the morning import, and Genie's own columns (description) are
// the one exception, guarded here by requirePlanner instead.
export async function POST(req: Request) {
  try {
    await requirePlanner();
    const body = await req.json();
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const { error } = await adminClient()
      .from("projects")
      .update({ description: String(body.description ?? "") })
      .eq("id", id);
    if (error) {
      throw new Error(
        /description/.test(error.message)
          ? "The description column is missing — run migration 0074 first."
          : error.message,
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errJson(e);
  }
}
