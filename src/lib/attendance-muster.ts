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

export interface MusterMonth { id: string; month: number; year: number; status: string; people: number; days: number; source: "payroll" | "sheet" | "salary"; tab?: string }
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
  const { data, error } = await admin.from("hrms_salary_sheet").select("id, month, year, status, muster, rows").order("year", { ascending: false }).order("month", { ascending: false }).limit(60);
  if (error) throw new Error(error.message);
  const months: MusterMonth[] = []; const raw = new Map<string, Muster>(); const have = new Set<string>();
  for (const s of data || []) {
    const m = (s.muster || null) as Muster | null; if (!m || !(m.rows || []).length) continue;
    const id = String(s.id); raw.set(id, m); have.add(`${s.year}-${s.month}`);
    months.push({ id, month: Number(s.month), year: Number(s.year), status: String(s.status), people: m.rows.length, days: Number(m.days) || new Date(Date.UTC(Number(s.year), Number(s.month), 0)).getUTCDate(), source: "payroll" });
  }
  // the months pulled from the HR sheet (0241) fill in where no run carries one
  try {
    const { data: imp } = await admin.from("hrms_muster_import").select("id, month, year, tab, people, days, muster");
    for (const s of imp || []) {
      if (have.has(`${s.year}-${s.month}`)) continue;
      const m = (s.muster || null) as Muster | null; if (!m || !(m.rows || []).length) continue;
      const id = `imp:${s.id}`; raw.set(id, m); have.add(`${s.year}-${s.month}`);
      months.push({ id, month: Number(s.month), year: Number(s.year), status: "From HR sheet", people: m.rows.length, days: Number(s.days) || m.rows[0]?.days?.length || 0, source: "sheet", tab: String(s.tab) });
    }
  } catch { /* pre-0241 */ }
  /* THE UPLOADED SALARY SHEETS (Dr Raghu, 16 Oct 2026: "it's there from Jan
     2024! All data is available"). Every uploaded month carries each person's
     Attendance (days present) and Paid Days. Where no muster and no pulled
     tab exists for the month, a muster is built from them: present = the
     sheet's attendance, days paid = its paid days, absent = days in the month
     minus days paid (paid days carry the week-offs and holidays, as the
     musters show), week-offs + holidays = paid minus present, undivided. No
     day marks and no late figure — the sheet does not carry them. */
  try {
    const { data: dept } = await admin.from("hrms_employees").select("id, department, designation, location");
    const who = new Map<string, { department: string | null; designation: string | null; location: string | null }>();
    for (const e of (dept || []) as { id: string; department: string | null; designation: string | null; location: string | null }[]) who.set(String(e.id), e);
    for (const s of data || []) {
      const key = `${s.year}-${s.month}`; if (have.has(key)) continue;
      const rows = (Array.isArray(s.rows) ? s.rows : []) as { employee_id?: string | null; name?: string | null; type?: string | null; attendance?: number | null; paid_days?: number | null }[];
      const usable = rows.filter((r) => r.employee_id && (r.attendance != null || r.paid_days != null)); if (!usable.length) continue;
      const year = Number(s.year), month = Number(s.month); const dim = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const m: Muster = { month, year, days: dim, headerRow: 0, columns: {}, unmapped: [], warnings: ["Built from the uploaded salary sheet: present = Attendance, days paid = Paid Days, absent = days in month − paid days; no day marks."],
        rows: usable.map((r) => { const id = String(r.employee_id); const w = who.get(id); const present = Number(r.attendance) || 0, pay = Number(r.paid_days) || 0; return {
          employee_id: id, name: String(r.name || ""), status: "", category: String(r.type || "—"), days: [], present, absent: Math.max(0, dim - pay), wo: Math.max(0, pay - present), mo_st: 0, pay_days: pay,
          attendance: present, compoff: null, ot: null, late: null, lunch: null, loan_taken: null, advance: null, site_allowance: null, leave_encash: null, loan_ded: null, arrears: null, tds: null, other_ded: null,
          location: w?.location ?? null, designation: w?.designation ?? null, department: w?.department ?? null, mobile: null } as MusterRow; }) };
      const id = `sal:${s.id}`; raw.set(id, m); have.add(key);
      months.push({ id, month, year, status: "Salary sheet", people: m.rows.length, days: dim, source: "salary" });
    }
  } catch { /* fine — the two real sources still stand */ }
  months.sort((a, b) => b.year - a.year || b.month - a.month);
  return { months, raw };
}

export interface PersonMonth { month: MusterMonth; sundays: number[]; line: MusterLine }
export interface PersonView { person: { employee_id: string; name: string; department: string | null; designation: string | null; category: string; location: string | null } | null; months: PersonMonth[]; averages: { attendance_pct: number | null; late_pct: number | null; present: number; absent: number; pay_days: number; months: number } }

/** One person across every month Genie holds a muster for. */
export async function personView(admin: SupabaseClient, employeeId: string): Promise<PersonView> {
  const { months, raw } = await musterMonths(admin);
  const id = String(employeeId).trim();
  const out: PersonMonth[] = []; let person: PersonView["person"] = null;
  for (const mo of months) {
    const r = (raw.get(mo.id)?.rows || []).find((x) => String(x.employee_id).trim() === id); if (!r) continue;
    const line = lineOf(r);
    if (!person) person = { employee_id: line.employee_id, name: line.name, department: line.department, designation: line.designation, category: line.category, location: line.location };
    const sundays: number[] = []; for (let d = 1; d <= mo.days; d++) if (new Date(Date.UTC(mo.year, mo.month - 1, d)).getUTCDay() === 0) sundays.push(d);
    out.push({ month: mo, sundays, line });
  }
  const t = out.reduce((a, x) => ({ present: a.present + x.line.present, absent: a.absent + x.line.absent, pay_days: a.pay_days + x.line.pay_days, late: a.late + (x.line.late || 0) }), { present: 0, absent: 0, pay_days: 0, late: 0 });
  return { person, months: out, averages: { attendance_pct: pct(t.present, t.present + t.absent), late_pct: pct(t.late, t.present), present: t.present, absent: t.absent, pay_days: t.pay_days, months: out.length } };
}

/** Everyone who appears in any muster — for the person picker. */
export async function musterPeople(admin: SupabaseClient): Promise<{ employee_id: string; name: string; department: string | null; category: string; months: number; last: string }[]> {
  const { months, raw } = await musterMonths(admin);
  const m = new Map<string, { employee_id: string; name: string; department: string | null; category: string; months: number; last: string }>();
  for (const mo of months) for (const r of raw.get(mo.id)?.rows || []) {
    const k = String(r.employee_id).trim(); const cur = m.get(k);
    if (cur) cur.months += 1; else m.set(k, { employee_id: k, name: String(r.name || ""), department: r.department ?? null, category: String(r.category || "—"), months: 1, last: `${mo.year}-${String(mo.month).padStart(2, "0")}` });
  }
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
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
