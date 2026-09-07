import { NextResponse } from "next/server";
import { requireHrms, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import type { Muster, MusterRow } from "@/lib/muster";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * ONE PERSON'S ATTENDANCE, MONTH BY MONTH (Dr Raghu, 7 Sep 2026).
 *
 * "Show the month. Make a button by day or by week. If it is by day, it will
 * show 1 to 31 and all their attendance for that ... If it is by week, it
 * will total up how many are present in that week ... Make it proper calendar
 * weeks. A week/month can have a maximum of 5 weeks. Total should be shown on
 * the left next to the month: present, absent, late, and comp off."
 *
 * The roster already exists: every payroll run carries the month's muster,
 * one mark per day per person, exactly as Vishwas keeps it. This reads those
 * — it does not hold a second copy, and a month whose muster was never
 * uploaded says so rather than showing an empty roster as if it were absence.
 *
 * NEVER THE WORD OT. "We should not use the word OT anywhere. Just write ET,
 * which means extra time" — the muster's own column is read, the label is his.
 */

/** Sunday-start calendar weeks, clipped to the month. */
export interface Week { n: number; from: number; to: number; present: number; absent: number; marks: string[] }

const PRESENT = /^(p|hd|h\/d|pl?|present)$/i;
const ABSENT = /^(a|abs|absent|lwp)$/i;

/**
 * The month's days grouped into calendar weeks running Sunday to Saturday.
 * A month can straddle six such weeks; his rule is five, so a final stub of
 * a day or two joins the fifth rather than standing as a week of its own.
 */
export function weeksOf(year: number, month: number, days: string[]): Week[] {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const out: Week[] = [];
  let from = 1;
  while (from <= last) {
    const dow = new Date(Date.UTC(year, month - 1, from)).getUTCDay();  // 0 = Sunday
    const to = Math.min(last, from + (6 - dow));
    out.push({ n: out.length + 1, from, to, present: 0, absent: 0, marks: [] });
    from = to + 1;
  }
  while (out.length > 5) {
    const stub = out.pop()!;
    out[out.length - 1].to = stub.to;
  }
  for (const w of out) {
    w.marks = days.slice(w.from - 1, w.to);
    w.present = w.marks.filter((m) => PRESENT.test(String(m || "").trim())).length;
    w.absent = w.marks.filter((m) => ABSENT.test(String(m || "").trim())).length;
  }
  return out;
}

export async function GET(req: Request) {
  try {
    await requireHrms();
    const id = new URL(req.url).searchParams.get("person");
    if (!id) throw new HttpError(400, "person required");
    const admin = adminClient();

    const { data, error } = await admin
      .from("hrms_salary_sheet").select("id, month, year, status, muster")
      .order("year", { ascending: false }).order("month", { ascending: false }).limit(36);
    if (error) throw new Error(error.message);

    const months: {
      id: string; month: number; year: number; status: string; hasMuster: boolean;
      days: string[]; weeks: Week[];
      present: number | null; absent: number | null; late: number | null; compoff: number | null;
      /** His word for it. The muster's column is called OT; the screen never is. */
      et: number | null; payDays: number | null; attendancePct: number | null;
    }[] = [];

    for (const s of data || []) {
      const m = (s.muster || null) as Muster | null;
      const row = (m?.rows || []).find((r: MusterRow) => String(r.employee_id) === id) || null;
      const year = Number(s.year), month = Number(s.month);
      const days = row?.days || [];
      const workedDays = days.length ? days.length : 0;
      const present = row ? Number(row.present || 0) : null;
      months.push({
        id: String(s.id), month, year, status: String(s.status),
        hasMuster: !!(m && (m.rows || []).length),
        days, weeks: row ? weeksOf(year, month, days) : [],
        present, absent: row ? Number(row.absent || 0) : null,
        late: row?.late ?? null, compoff: row?.compoff ?? null, et: row?.ot ?? null,
        payDays: row ? Number(row.pay_days || 0) : null,
        attendancePct: present != null && workedDays ? Math.round((present / workedDays) * 1000) / 10 : null,
      });
    }

    const withRow = months.filter((x) => x.present != null);
    const avg = (pick: (x: typeof months[number]) => number | null) => {
      const ns = withRow.map(pick).filter((n): n is number => n != null);
      return ns.length ? Math.round((ns.reduce((a, b) => a + b, 0) / ns.length) * 10) / 10 : null;
    };

    return NextResponse.json({
      months,
      /** The months a run exists for but no muster was ever uploaded — named
       *  plainly, because an empty roster must never read as absence. */
      missing: months.filter((x) => !x.hasMuster).map((x) => ({ month: x.month, year: x.year, status: x.status })),
      averages: {
        attendancePct: avg((x) => x.attendancePct),
        latePerMonth: avg((x) => x.late),
        monthsCounted: withRow.length,
      },
    });
  } catch (e) {
    return errJson(e);
  }
}
