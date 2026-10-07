/**
 * THE LATEST SALARY STRUCTURE IS THE RATE (Dr Raghu, 7 Oct 2026: "it has to
 * take from latest salary structure" — "sanju is 23400!!!"; and "Whenever
 * there is an approval that is done in the salary rate list, it has to get
 * backflushed into the HRIS so that it maintains the correct record, and
 * that's where the payroll has to pull from").
 *
 * The Live Salary Structure — the list he freezes and signs — is the one
 * authority on what a person is paid. It backflushes into the HRIS record's
 * Pay fields (Basic and DA, HRA, Fixed, Conveyance, Medical, Gross, Per day
 * rate) as approved edits, every movement logged old → new, and into the
 * financial year's salary history. Payroll reads the Live list. An appraisal
 * approval is a proposal until it is on that list — for one afternoon the
 * approvals wrote over the list on their own, and Sanju's signed 23,400
 * became 24,000; that road is closed.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { payDaysFor } from "@/lib/salary";
import { hrmsTables } from "@/lib/hrms";

const N = (v: unknown) => Number(v) || 0;
export const fyOfDate = (iso: string | null | undefined): string => {
  const d = iso ? new Date(iso) : new Date();
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
  return m >= 4 ? `${y}-${String(y + 1).slice(2)}` : `${y - 1}-${String(y).slice(2)}`;
};

export async function backflushStructure(admin: SupabaseClient, structureId: string, stamp: string, onlyIds?: string[]): Promise<{ records: number; history: number; changed: number; fy: string; title: string }> {
  const { data: st, error: se } = await admin.from("hrms_salary_structure").select("id, title, effective_from, status, frozen_at, signed_as").eq("id", structureId).single();
  if (se || !st) throw new Error(se?.message || "No such structure.");
  let q = admin.from("hrms_salary_rate").select("employee_id, basic_da, hra, fixed_allowance, conveyance, medical_allowance, gross, type").eq("structure_id", structureId);
  if (onlyIds?.length) q = q.in("employee_id", onlyIds);
  const { data: rows, error } = await q;
  if (error) throw new Error(error.message);
  const list = (rows || []) as { employee_id: string; basic_da: number; hra: number; fixed_allowance: number; conveyance: number; medical_allowance: number; gross: number; type: string | null }[];
  const fy = fyOfDate(st.effective_from as string | null);
  if (!list.length) return { records: 0, history: 0, changed: 0, fy, title: String(st.title) };
  const T = await hrmsTables(admin);
  const { data: cur } = await admin.from(T.edits).select("employee_id, field, value").in("employee_id", list.map((r) => String(r.employee_id)));
  const curVal = new Map((cur || []).map((e) => [`${e.employee_id}|${e.field}`, e.value == null ? null : String(e.value)]));
  const now = new Date().toISOString();
  const why = `${stamp} — ${st.title}${st.frozen_at ? ` (signed ${st.signed_as || ""})` : ""} backflushed to the record`;
  const edits: Record<string, unknown>[] = [], log: Record<string, unknown>[] = [], hist: Record<string, unknown>[] = [];
  for (const r of list) {
    const id = String(r.employee_id), gross = N(r.gross);
    const want: Record<string, number> = {
      basic_da: N(r.basic_da), hra: N(r.hra), fixed_allowance: N(r.fixed_allowance), conveyance: N(r.conveyance), medical_allowance: N(r.medical_allowance),
      gross, per_day_rate: Math.round(gross / payDaysFor(r.type)),
    };
    for (const [field, v] of Object.entries(want)) {
      const value = String(Math.round(v));
      const old = curVal.get(`${id}|${field}`);
      edits.push({ employee_id: id, field, value, edited_by: stamp, edited_at: now, approved_at: now, approved_by: stamp });
      if (old !== value) log.push({ employee_id: id, field, old_value: old ?? null, new_value: value, edited_by: why, edited_at: now });
    }
    hist.push({ employee_id: id, fy, gross: Math.round(gross), by: stamp, at: now });
  }
  for (let i = 0; i < edits.length; i += 300) { const { error: e } = await admin.from(T.edits).upsert(edits.slice(i, i + 300), { onConflict: "employee_id,field" }); if (e) throw new Error(e.message); }
  for (let i = 0; i < log.length; i += 300) { const { error: e } = await admin.from("hrms_employee_edit_log").insert(log.slice(i, i + 300)); if (e) throw new Error(e.message); }
  for (let i = 0; i < hist.length; i += 300) { const { error: e } = await admin.from("hrms_salary_history").upsert(hist.slice(i, i + 300), { onConflict: "employee_id,fy" }); if (e) throw new Error(e.message); }
  return { records: list.length, history: hist.length, changed: log.length, fy, title: String(st.title) };
}
