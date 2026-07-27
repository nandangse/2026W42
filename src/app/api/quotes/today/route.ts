import { NextResponse } from "next/server";
import { requireUser, errJson } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { today, parseISO, DAY } from "@/lib/schedule";

export const dynamic = "force-dynamic";

// GET /api/quotes/today — the day's quote. Any signed-in user (uploader too).
// Deterministic: everyone sees the same quote on a given day, and the whole
// collection cycles before anything repeats. Two tiny queries, no full scan.
export async function GET() {
  try {
    await requireUser();
    const admin = adminClient();

    const { count, error: ce } = await admin
      .from("quotes")
      .select("id", { count: "exact", head: true });
    if (ce) throw new Error(ce.message);
    if (!count) return NextResponse.json({ quote: null });

    const dayNo = Math.floor(parseISO(today()).getTime() / DAY);
    const offset = ((dayNo % count) + count) % count;

    const { data, error } = await admin
      .from("quotes")
      .select("body, author, category, original")
      .order("seq", { ascending: true })
      .order("created_at", { ascending: true })
      .range(offset, offset);
    if (error) throw new Error(error.message);

    return NextResponse.json({ quote: data?.[0] ?? null, total: count });
  } catch (e) {
    return errJson(e);
  }
}
