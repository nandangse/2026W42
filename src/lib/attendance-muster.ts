/**
 * THE ATTENDANCE MUSTER SCREEN (Dr Raghu, 16 Oct 2026: "build the attendance
 * muster here" — the nav promised "Days paid, attendance %, late coming %").
 *
 * No second copy of anything: every payroll run already carries the month's
 * muster as uploaded (hrms_salary_sheet.muster, parsed by src/lib/muster.ts).
 * This lays it out per person and per month, and adds the three figures the
 * menu promised:
 *   days paid      = the sheet's own Total Pay Days
 *   attendance %   = present ÷ (present + absent) — of the days the person
 *                    was expected; week-offs and holidays are neither
 *   late coming %  = the sheet's Late column (days deducted, in quarter days) ÷ present days
 * A month whose muster was never uploaded is listed as such, not as absence.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Muster, MusterRow } from "@/lib/muster";

export interface MusterMonth { id: string; month: number; year: number; status: string; people: number; days: number }
export interface MusterLine {
  employee_id: string; name: string; status: string; category: string; department: string | null; designation: string | null; location: string | null;
  days: string[]; present: number; absent: number; wo: number; mo_st: number; pay_days: number;
  late: number | null; compoff: number | null; et: number | null;
  attendance_pct: number | null; late_pct: number | null;
}
export interface MusterView {
  months: MusterMonth[];
  month: MusterMonth | null; sundays: number[]; rows: MusterLine[];
  totals: { people: number; present: number; absent: number; wo: number; mo_st: number; pay_days: number; late: number; attendance_pct: number | null; late_pct: number | null };
  byCategory: { category: string; people: number; present: number; absent: number; pay_days: number; late: number; attendance_pct: number | null; late_pct: number | null }[];
}

const N = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

export async function musterMonths(admin: SupabaseClient): Promise<{ months: MusterMonth[]; raw: Map<string, Muster> }> {
  const { data, error } = await admin.from("hrms_salary_sheet").select("id, month, year, status, muster").order("year", { ascending: false }).order("month", { ascending: false }).limit(60);
  if (error) throw new Error(error.message);
  const months: MusterMonth[] = []; const raw = new Map<string, Muster>();
  for (const s of data || []) {
    const m = (s.muster || null) as Muster | null; if (!m || !(m.rows || []).length) continue;
    const id = String(s.id); raw.set(id, m);
    months.push({ id, month: Number(s.month), year: Number(s.year), status: String(s.status), people: m.rows.length, days: Number(m.days) || new Date(Date.UTC(Number(s.year), Number(s.month), 0)).getUTCDate() });
  }
  return { months, raw };
}

export function lineOf(r: MusterRow): MusterLine {
  const present = N(r.present), absent = N(r.absent), late = r.late == null ? null : N(r.late);
  return {
    employee_id: String(r.employee_id), name: String(r.name || ""), status: String(r.status || ""), category: String(r.category || "—"),
    department: r.department ?? null, designation: r.designation ?? null, location: r.location ?? null,
    days: Array.isArray(r.days) ? r.days.map((d) => String(d ?? "")) : [],
    present, absent, wo: N(r.wo), mo_st: N(r.mo_st), pay_days: N(r.pay_days), late, compoff: r.compoff ?? null, et: r.ot ?? null,
    attendance_pct: pct(present, present + absent), late_pct: late == null ? null : pct(late, present),
  };
}

export async function musterView(admin: SupabaseClient, sheetId?: string | null): Promise<MusterView> {
  const { months, raw } = await musterMonths(admin);
  const month = (sheetId && months.find((m) => m.id === sheetId)) || months[0] || null;
  const empty = { people: 0, present: 0, absent: 0, wo: 0, mo_st: 0, pay_days: 0, late: 0, attendance_pct: null, late_pct: null };
  if (!month) return { months, month: null, sundays: [], rows: [], totals: empty, byCategory: [] };
  const rows = (raw.get(month.id)!.rows || []).map(lineOf).sort((a, b) => (Number(a.employee_id.replace(/\D/g, "")) || 0) - (Number(b.employee_id.replace(/\D/g, "")) || 0));
  const sundays: number[] = []; for (let d = 1; d <= month.days; d++) if (new Date(Date.UTC(month.year, month.month - 1, d)).getUTCDay() === 0) sundays.push(d);
  const sum = (list: MusterLine[]) => { const t = { people: list.length, present: 0, absent: 0, wo: 0, mo_st: 0, pay_days: 0, late: 0 }; for (const r of list) { t.present += r.present; t.absent += r.absent; t.wo += r.wo; t.mo_st += r.mo_st; t.pay_days += r.pay_days; t.late += r.late || 0; } return { ...t, attendance_pct: pct(t.present, t.present + t.absent), late_pct: pct(t.late, t.present) }; };
  const cats = [...new Set(rows.map((r) => r.category))].sort();
  return { months, month, sundays, rows, totals: sum(rows), byCategory: cats.map((c) => { const s = sum(rows.filter((r) => r.category === c)); return { category: c, people: s.people, present: s.present, absent: s.absent, pay_days: s.pay_days, late: s.late, attendance_pct: s.attendance_pct, late_pct: s.late_pct }; }) };
}
