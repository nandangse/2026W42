import { NextResponse } from "next/server";
import { swallow } from "@/lib/swallow";
import { requireHrms, errJson } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import type { SheetRow } from "@/lib/salary-sheet";

export const dynamic = "force-dynamic";

/**
 * GET /api/hrms/slips — the Salary Slips table: one row per person per
 * FROZEN month, with the acknowledgement dates from self-service. Draft
 * months are not listed — a slip that can still change is not a slip
 * anybody should be acknowledging.
 */
export async function GET() {
  try {
    await requireHrms();
    const admin = adminClient();

    const { data: sheets, error } = await admin
      .from("hrms_salary_sheet")
      .select("id, month, year, status, frozen_at, rows")
      .eq("status", "Frozen")
      .order("year", { ascending: false }).order("month", { ascending: false })
      .limit(24);
    if (error) {
      if (/hrms_salary_sheet|schema cache/i.test(error.message))
        return NextResponse.json({ rows: [], needsMigration: true });
      throw new Error(error.message);
    }

    let acks: { sheet_id: string; employee_id: string; first_at: string; last_at: string; opens: number }[] = [];
    try {
      const { data: a } = await admin.from("hrms_slip_ack").select("sheet_id, employee_id, first_at, last_at, opens");
      acks = (a || []) as typeof acks;
    } catch (e) { swallow("hrms/slips", e); /* pre-0072 */ }
    const ackBy = new Map(acks.map((a) => [`${a.sheet_id}:${a.employee_id}`, a]));

    const rows = (sheets || []).flatMap((s) =>
      ((s.rows || []) as SheetRow[]).map((r) => {
        const ack = r.employee_id ? ackBy.get(`${s.id}:${r.employee_id}`) : undefined;
        return {
          sheet_id: s.id, month: s.month, year: s.year,
          employee_id: r.employee_id, name: r.name, hold: !!r.hold,
          earned: r.earned || 0, paid: r.net || 0,
          first_at: ack?.first_at ?? null, last_at: ack?.last_at ?? null, opens: ack?.opens ?? 0,
        };
      }),
    );
    return NextResponse.json({ rows, frozenMonths: (sheets || []).length });
  } catch (e) {
    return errJson(e);
  }
}
