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

const CYCLE = "2026-27";
const N = (v: unknown) => Number(v) || 0;

export async function syncApprovedToMaster(admin: SupabaseClient, ids: string[] | null, stamp: string): Promise<{ rates: number; history: number; skipped: string[]; frozen: boolean }> {
  let q = admin.from("hrms_appraisal").select("employee_id, new_gross, structure, approved_at, approved_by").eq("cycle", CYCLE).not("approved_at", "is", null).not("new_gross", "is", null);
  if (ids?.length) q = q.in("employee_id", ids);
  const { data: aps, error } = await q;
  if (error) throw new Error(error.message);
  const list = (aps || []) as { employee_id: string; new_gross: number; structure: { components?: Record<string, unknown> } | null; approved_at: string; approved_by: string | null }[];
  if (!list.length) return { rates: 0, history: 0, skipped: [], frozen: false };
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
  }
  if (live && !live.frozen_at && rates) await admin.from("hrms_salary_structure").update({ updated_at: now }).eq("id", live.id);
  return { rates, history, skipped, frozen: !!live?.frozen_at };
}
