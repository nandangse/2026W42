import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { requireKuber } from "@/lib/accounts";
import { cfoReportData } from "@/lib/cfo-report-data";

const IST_TODAY = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const NEEDS_0186 = "Run migration 0186 first — the CFO report archive has nowhere to live yet.";

/**
 * THE CFO MONTHLY REPORT (Dr Raghu, 30 Sep 2026: "a tab on the top called
 * CFO Monthly Report. On clicking have For Month, then make the statement
 * like this for that month").
 *
 * GET              the archive, newest first
 * POST {month}     build one for that month from the books as they stand,
 *                  and keep it — same rule as the board report: the DATA is
 *                  frozen, the layout is not, so reopening May's in December
 *                  shows what was said in May
 * POST delete      owner's, and only a row made by mistake
 */
export async function GET() {
  try {
    await requireKuber();
    const { data, error } = await adminClient()
      .from("cfo_report").select("id, month, fy, title, by, at").order("at", { ascending: false }).limit(60);
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
      if (!user.isOwner) throw new HttpError(403, "Removing an archived report is Raghu's.");
      const id = String(body.id || "");
      if (!id) throw new HttpError(400, "id required");
      const { error } = await admin.from("cfo_report").delete().eq("id", id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    const today = IST_TODAY();
    const month = String(body.month || today.slice(0, 7)).slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) throw new HttpError(400, "Which month? (YYYY-MM)");
    if (month > today.slice(0, 7)) throw new HttpError(400, "That month has not happened yet.");
    const snapshot = await cfoReportData(admin, month, today);
    if (!snapshot.vouchers) throw new HttpError(400, "There are no vouchers in the books yet — upload the Tally export first.");
    const title = `CFO Monthly Report — ${snapshot.monthLabel}`;
    const { data, error } = await admin.from("cfo_report")
      .insert({ month, fy: snapshot.fy, title, snapshot, by: user.email })
      .select("id").single();
    if (error) {
      if (/does not exist|schema cache/i.test(error.message)) throw new HttpError(503, NEEDS_0186);
      throw new Error(error.message);
    }
    return NextResponse.json({ ok: true, id: data.id, title });
  } catch (e) { return errJson(e); }
}
