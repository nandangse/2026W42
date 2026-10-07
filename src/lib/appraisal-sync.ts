/**
 * AN APPROVED APPRAISAL REACHES THE RATE LIST AND THE HISTORY (Dr Raghu,
 * 7 Oct 2026: "6981 Sanju's approval was done by me from 20,800 to 24,000
 * as the gross salary. Even then … in the HRIS, it is showing the same
 * thing. Just check what is happening").
 *
 * What was happening: his approval wrote the appraisal row, and the payroll
 * read the appraisal — so the register was right. But HRIS → Salary Rate
 * List was a one-time import made twenty minutes before that approval, and
 * the salary history was written at the proposal, not the approval. Neither
 * ever heard about it. Now every approval — his own save on the card, or a
 * tick in the queue — writes through to the Live rate list and the FY's
 * history, and the rate list can be brought level from the approvals in one
 * press. The type is the HRIS's; per day follows his rule.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { payDaysFor } from "@/lib/salary";
import { people } from "@/lib/hrms-wa";
import { hrmsTables } from "@/lib/hrms";

const CYCLE = "2026-27";
const N = (v: unknown) => Number(v) || 0;

/**
 * … AND THE HRIS RECORD (Dr Raghu, 7 Oct 2026: "Whenever there is an approval
 * that is done in the salary rate list, it has to get backflushed into the
 * HRIS so that it maintains the correct record, and that's where the payroll
 * has to pull from"). The record's Pay fields — Basic and DA, HRA, Fixed,
 * Conveyance, Medical, Gross, Per day rate — are written as approved edits,
 * every change logged old → new, the way migration 0153 did it once on 7 Sep.
 */
export async function syncApprovedToMaster(admin: SupabaseClient, ids: string[] | null, stamp: string): Promise<{ rates: number; history: number; records: number; skipped: string[]; frozen: boolean }> {
  let q = admin.from("hrms_appraisal").select("employee_id, new_gross, structure, approved_at, approved_by").eq("cycle", CYCLE).not("approved_at", "is", null).not("new_gross", "is", null);
  if (ids?.length) q = q.in("employee_id", ids);
  const { data: aps, error } = await q;
  if (error) throw new Error(error.message);
  const list = (aps || []) as { employee_id: string; new_gross: number; structure: { components?: Record<string, unknown> } | null; approved_at: string; approved_by: string | null }[];
  if (!list.length) return { rates: 0, history: 0, records: 0, skipped: [], frozen: false };
  const T = await hrmsTables(admin);
  const { data: cur } = await admin.from(T.edits).select("employee_id, field, value").in("employee_id", list.map((a) => String(a.employee_id)));
  const curVal = new Map((cur || []).map((e) => [`${e.employee_id}|${e.field}`, e.value == null ? null : String(e.value)]));
  const edits: Record<string, unknown>[] = [], log: Record<string, unknown>[] = [];
  let records = 0;
  const { data: live } = await admin.from("hrms_salary_structure").select("id, frozen_at").eq("status", "Live").maybeSingle();
  const who = await people(admin, list.map((a) => String(a.employee_id)));
  const byId = new Map(who.map((p) => [p.id, p]));
  const now = new Date().toISOString();
  const skipped: string[] = [];
  let rates = 0, history = 0;
  for (const a of list) {
    const id = String(a.employee_id), p = byId.get(id);
    const c = a.structure?.components ?? {};
    const parts = {
      basic_da: N(c.basic_da), hra: N(c.hra),
      fixed_allowance: N(c.fixed_allowance ?? c.fixed), conveyance: N(c.conveyance),
      medical_allowance: N(c.medical_allowance ?? c.medical),
    };
    const gross = N(a.new_gross);
    const sum = parts.basic_da + parts.hra + parts.fixed_allowance + parts.conveyance + parts.medical_allowance;
    // parts that do not add up to the approved gross are not a split — the gross is the figure, the parts are left as they are
    if (Math.abs(sum - gross) >= 1 && sum > 0) skipped.push(`${id} parts ${sum} ≠ gross ${gross}`);
    const type = p?.type || null;
    const note = `from the approved appraisal of ${String(a.approved_at).slice(0, 10)} by ${String(a.approved_by || "").split("·")[0].trim() || "—"}`;
    if (live && !live.frozen_at) {
      const row = { structure_id: live.id, employee_id: id, name: p?.name ?? null, type, ...parts, gross, per_day: Math.round(gross / payDaysFor(type)), note, updated_by: stamp, updated_at: now };
      const { error: re } = await admin.from("hrms_salary_rate").upsert(row, { onConflict: "structure_id,employee_id" });
      if (re) throw new Error(re.message);
      rates++;
    }
    const { error: he } = await admin.from("hrms_salary_history").upsert({ employee_id: id, fy: CYCLE, gross, by: stamp, at: now }, { onConflict: "employee_id,fy" });
    if (he) throw new Error(he.message);
    history++;
    // the HRIS record's Pay fields, as approved edits — logged where the value moves
    const want: Record<string, number> = { basic_da: parts.basic_da, hra: parts.hra, fixed_allowance: parts.fixed_allowance, conveyance: parts.conveyance, medical_allowance: parts.medical_allowance, gross, per_day_rate: Math.round(gross / payDaysFor(type)) };
    for (const [field, v] of Object.entries(want)) {
      const value = String(Math.round(v));
      const old = curVal.get(`${id}|${field}`);
      edits.push({ employee_id: id, field, value, edited_by: stamp, edited_at: now, approved_at: now, approved_by: stamp });
      if (old !== value) log.push({ employee_id: id, field, old_value: old ?? null, new_value: value, edited_by: `${stamp} — approved appraisal written through to the record`, edited_at: now });
    }
    records++;
  }
  for (let i = 0; i < edits.length; i += 300) {
    const { error: ee } = await admin.from(T.edits).upsert(edits.slice(i, i + 300), { onConflict: "employee_id,field" });
    if (ee) throw new Error(ee.message);
  }
  for (let i = 0; i < log.length; i += 300) {
    const { error: le } = await admin.from("hrms_employee_edit_log").insert(log.slice(i, i + 300));
    if (le) throw new Error(le.message);
  }
  if (live && !live.frozen_at && rates) await admin.from("hrms_salary_structure").update({ updated_at: now }).eq("id", live.id);
  return { rates, history, records, skipped, frozen: !!live?.frozen_at };
}
