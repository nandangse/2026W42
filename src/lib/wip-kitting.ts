/**
 * WIP KITTED VALUE — theory and actual, side by side (Dr Raghu, 6 Oct 2026):
 * "take the kitting percentage of the particular job… Do the total. Let us
 * decide that kitting percentage theory and … actual. Let us show two
 * numbers. For some time, the theory will be made up, and the actual will
 * start building up… within 1 or 2 months, they both will match."
 *
 *   THEORY  = the board's kitting % × the job's material value, where the
 *             material value is the board's own: value × (1 − throughput %).
 *             The same arithmetic the board's kitting % already uses.
 *   ACTUAL  = what has really gone into the job's WIP, item by item: each
 *             RBOM line's quantity issued (capped at the RBOM quantity) at
 *             the RBOM rate. Builds up as the store issues against the RBOM.
 *
 * One helper, so the WIP screen and the Inventory dashboard can never say
 * two different things.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type Doc = Record<string, unknown>;
const S = (v: unknown) => (v === null || v === undefined ? "" : String(v)).trim();
const N = (v: unknown) => Number(v) || 0;
const notInstalled = (m: string) => /does not exist|schema cache/i.test(m);

export interface ActualKitting { nos_kitted: number; value_kitted: number; nos_pending: number; value_pending: number; kitting_value_pct: number | null; rbom_value: number }

/** The board's theory for one job: kitting % of the material value. */
export function theoryKitted(j: { val?: unknown; tpp?: unknown; kit?: unknown }): number {
  const material = N(j.val) * (1 - N(j.tpp) / 100);
  return material * (N(j.kit) / 100);
}

/** The actual kitted value per job, from its RBOM and the issues made against it. */
export async function actualKitting(admin: SupabaseClient, rows: { job_no: string; rbom_no: string }[]): Promise<Map<string, ActualKitting>> {
  const out = new Map<string, ActualKitting>();
  try {
    const rbomIds = [...new Set(rows.map((r) => r.rbom_no))].filter(Boolean);
    const lines: Doc[] = [];
    for (let a = 0; rbomIds.length && a < 100000; a += 1000) {
      const { data, error } = await admin.from("material_rbom_item").select("rbom_id, item_code, qty, rate").in("rbom_id", rbomIds).order("id").range(a, a + 999);
      if (error) throw error;
      lines.push(...((data ?? []) as Doc[]));
      if (!data || data.length < 1000) break;
    }
    const jobIds = rows.map((r) => r.job_no);
    const issued: Doc[] = [];
    for (let a = 0; jobIds.length && a < 100000; a += 1000) {
      const { data, error } = await admin.from("material_issue").select("job_no, item_code, qty").in("job_no", jobIds).order("id").range(a, a + 999);
      if (error) throw error;
      issued.push(...((data ?? []) as Doc[]));
      if (!data || data.length < 1000) break;
    }
    const gone = new Map<string, number>();
    for (const i of issued) {
      const k = `${S(i.job_no)}|${S(i.item_code)}`;
      gone.set(k, (gone.get(k) ?? 0) + N(i.qty));
    }
    const byRbom = new Map<string, Doc[]>();
    for (const l of lines) (byRbom.get(S(l.rbom_id)) ?? byRbom.set(S(l.rbom_id), []).get(S(l.rbom_id))!).push(l);
    for (const r of rows) {
      const ls = byRbom.get(r.rbom_no) ?? [];
      if (!ls.length) continue;
      let nk = 0, vk = 0, np = 0, vp = 0, total = 0;
      for (const l of ls) {
        const q = N(l.qty), rate = N(l.rate);
        const gq = Math.min(q, gone.get(`${r.job_no}|${S(l.item_code)}`) ?? 0);
        total += q * rate; vk += gq * rate; vp += (q - gq) * rate;
        if (q > 0 && gq >= q) nk++; else np++;
      }
      out.set(r.job_no, { nos_kitted: nk, value_kitted: vk, nos_pending: np, value_pending: vp, kitting_value_pct: total > 0 ? (vk / total) * 100 : null, rbom_value: total });
    }
  } catch (e) {
    // Before the RBOM and issue tables exist there is nothing to derive from.
    if (!notInstalled(String((e as { message?: string })?.message || e))) throw e;
  }
  return out;
}

/** Every live job's theory and actual, summed — for the Inventory dashboard. */
export async function wipKittedTotals(admin: SupabaseClient) {
  const { data: jobs, error } = await admin.from("jobs").select("id, proj, val, tpp, kit")
    .eq("active", true).eq("delivered", false).is("archived_at", null).order("id").limit(5000);
  if (error) throw new Error(error.message);
  const live = (jobs ?? []) as Doc[];
  const projectIds = [...new Set(live.map((j) => S(j.proj)).filter(Boolean))];
  const { data: rboms } = projectIds.length
    ? await admin.from("material_rbom").select("rbom_id, project_id").in("project_id", projectIds).limit(5000)
    : { data: [] as Doc[] };
  const rbomOf = new Map(((rboms ?? []) as Doc[]).map((r) => [S(r.project_id), S(r.rbom_id)]));
  const actual = await actualKitting(admin, live.map((j) => ({ job_no: S(j.id), rbom_no: rbomOf.get(S(j.proj)) ?? "" })));
  let theory = 0, material = 0, act = 0, withRbom = 0;
  for (const j of live) {
    theory += theoryKitted(j);
    material += N(j.val) * (1 - N(j.tpp) / 100);
    const a = actual.get(S(j.id));
    if (a) { act += a.value_kitted; withRbom++; }
  }
  return { jobs: live.length, withRbom, material, theory, actual: act, theoryPct: material > 0 ? (theory / material) * 100 : 0 };
}
