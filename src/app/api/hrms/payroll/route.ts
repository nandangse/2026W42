import { NextResponse } from "next/server";
import { requireHrms, errJson, HttpError, RAGHU_EMAIL } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Run Monthly Payroll — the table of runs (Dr Raghu, 4 Sep 2026): "Month,
 * Year, Date run, run by, approved by. Approval is by Raghu."
 *
 * A run IS the month's salary sheet (Finalized Salary Sheets uploads it):
 * uploaded_by / uploaded_at are who ran it and when. Approval is a second
 * pair of columns, the owner's alone. A month can also be recorded here
 * before its sheet exists, so the table shows the run that happened even
 * when the file is still to come.
 */
export async function GET() {
  try {
    await requireHrms();
    const { data, error } = await adminClient().from("hrms_salary_sheet")
      .select("id, month, year, status, file_name, uploaded_by, uploaded_at, frozen_by, frozen_at, approved_by, approved_at, run_note, total_count, total_salary, net_payable, paid_to_bank, created_at")
      .order("year", { ascending: false }).order("month", { ascending: false });
    if (error) {
      if (/approved_by|run_note/i.test(error.message)) return NextResponse.json({ rows: [], needsMigration: true });
      if (/hrms_salary_sheet|schema cache|does not exist/i.test(error.message)) return NextResponse.json({ rows: [], needsMigration: true });
      throw new Error(error.message);
    }
    return NextResponse.json({ rows: data || [] });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const me = await requireHrms();
    const admin = adminClient();
    const body = await req.json();
    const action = String(body.action || "");
    const stamp = me.initials ? `${me.initials} · ${me.email}` : me.email;
    const now = new Date().toISOString();
    const owner = me.email.toLowerCase() === RAGHU_EMAIL;

    if (action === "record") {
      const month = Number(body.month), year = Number(body.year);
      if (!(month >= 1 && month <= 12) || !(year >= 2020 && year <= 2100)) throw new HttpError(400, "Month and year, please.");
      const { data: have } = await admin.from("hrms_salary_sheet").select("id").eq("month", month).eq("year", year).maybeSingle();
      if (have) throw new HttpError(400, "That month already has a run — it is in the table.");
      const { error } = await admin.from("hrms_salary_sheet").insert({ month, year, status: "Draft", uploaded_by: stamp, uploaded_at: now, run_note: String(body.note || "").slice(0, 500) || null, updated_at: now });
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "approve" || action === "unapprove") {
      if (!owner) throw new HttpError(403, `Approval is ${RAGHU_EMAIL}'s.`);
      const id = String(body.id || "");
      if (!id) throw new HttpError(400, "Which run?");
      const patch = action === "approve" ? { approved_by: stamp, approved_at: now, updated_at: now } : { approved_by: null, approved_at: null, updated_at: now };
      const { error } = await admin.from("hrms_salary_sheet").update(patch).eq("id", id);
      if (error) {
        if (/approved_by/i.test(error.message)) throw new HttpError(503, "Run migration 0132 first — approval has nowhere to be kept yet.");
        throw new Error(error.message);
      }
      return NextResponse.json({ ok: true });
    }

    if (action === "note") {
      const id = String(body.id || "");
      const { error } = await admin.from("hrms_salary_sheet").update({ run_note: String(body.note || "").slice(0, 500) || null, updated_at: now }).eq("id", id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    throw new HttpError(400, "unknown action");
  } catch (e) { return errJson(e); }
}
