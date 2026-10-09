import { NextResponse } from "next/server";
import { requirePlanning, errJson } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { buildBoard } from "@/lib/board";

export const dynamic = "force-dynamic";

// GET /api/board — the one payload the boards read from. Readers who hold
// the Planning tick (audit S1, 9 Oct 2026).
export async function GET() {
  try {
    await requirePlanning();
    const board = await buildBoard(supabaseServer());
    return NextResponse.json(board);
  } catch (e) {
    return errJson(e);
  }
}
