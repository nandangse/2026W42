import { NextResponse } from "next/server";
import { requireRole, errJson } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { buildBoard } from "@/lib/board";

export const dynamic = "force-dynamic";

// GET /api/board — the one payload the boards read from. Readers only.
export async function GET() {
  try {
    await requireRole("admin", "planner");
    const board = await buildBoard(supabaseServer());
    return NextResponse.json(board);
  } catch (e) {
    return errJson(e);
  }
}
