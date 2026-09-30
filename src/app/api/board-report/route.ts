import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { requireKuber } from "@/lib/accounts";
import { boardData } from "@/lib/board-report-data";

/** Today in the only timezone this company works in. */
const IST_TODAY = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const NEEDS_0180 = "Run migration 0180 first — the board report archive has nowhere to live yet.";

/**
 * GET  — the archive, newest first.
 * POST — build one from today's books and keep it.
 *
 * The snapshot is stored because a management report is a statement of what
 * was known on a date. Recomputing October's report from December's books
 * would quietly change the figures the Board was given, and the one document
 * whose value is that it can be referred back to would be the one that cannot.
 */
export async function GET() {
  try {
    await requireKuber();
    const { data, error } = await adminClient()
      .from("board_report").select("id, on_date, fy, title, by, at").order("at", { ascending: false }).limit(60);
    if (error) {
      if (/does not exist|schema cache/i.test(error.message)) return NextResponse.json({ ok: true, installed: false, rows: [] });
      throw new Error(error.message);
    }
    return NextResponse.json({ ok: true, installed: true, rows: data || [] });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const user = await requireKuber();
    const body = await readBody(req, {});
    const admin = adminClient();

    if (body.action === "delete") {
      const id = String(body.id || "");
      if (!id) throw new HttpError(400, "id required");
      const { error } = await admin.from("board_report").delete().eq("id", id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    const on = IST_TODAY();
    const snapshot = await boardData(admin, on);
    if (!snapshot.vouchers) throw new HttpError(400, "There are no vouchers in the books yet — upload the Tally export first.");
    const title = `Management Report to the Board — ${new Date(`${on}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}`;
    const { data, error } = await admin.from("board_report")
      .insert({ on_date: on, fy: snapshot.fyLabel, title, snapshot, by: user.email })
      .select("id").single();
    if (error) {
      if (/does not exist|schema cache/i.test(error.message)) throw new HttpError(503, NEEDS_0180);
      throw new Error(error.message);
    }
    return NextResponse.json({ ok: true, id: data.id, title });
  } catch (e) { return errJson(e); }
}
