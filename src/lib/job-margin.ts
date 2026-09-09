import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * WHAT A JOB ACTUALLY EARNS (Dr Raghu, 9 Sep 2026).
 *
 *   value  −  RM (from the RBOM)  −  labour  −  transport  −  overheads
 *          −  claims and other costs against the job or its project
 *   =  gross margin, and the percentage of value it represents.
 *
 * THE ONE RULE THIS FILE EXISTS TO ENFORCE: a margin never pretends to be
 * complete. Three of the four cost lines are empty across the whole board
 * today — `wip_labour` on nought jobs of 114, transport and overheads not
 * existing until an hour ago — and a margin worked out from one cost reports
 * a magnificent profit. That is exactly the fault I found in the ERP's own
 * gross_margin, which reads minus-the-purchase-cost on 110 projects. Inverting
 * a bad number is not fixing it.
 *
 * So every line carries `known: false` when nothing has been entered, `have`
 * counts how many of the five are real, and `complete` is true only when all
 * of them are. A screen may show the figure; it must show the count beside it.
 * NULL IS NOT ZERO — a job with no labour recorded has not been built by
 * nobody.
 *
 * RAW MATERIAL IS THE ONE REAL SOURCE. The RBOM carries 4,459 priced lines.
 * A job reaches its RBOM through material_wip.rbom_no, and the sum of that
 * RBOM's line amounts is the material in the job. Where a job has no RBOM yet
 * — most of them — RM is unknown, and says so.
 *
 * A PROJECT-LEVEL COST IS SPREAD BY VALUE, not equally: a claim against an
 * order of two machines, one worth twice the other, did not fall equally on
 * them. Where the project's jobs carry no value at all it splits evenly,
 * because an equal split of a known cost beats discarding it.
 */
export interface CostLine { amount: number | null; known: boolean; from: string }
export interface JobMargin {
  job_id: string;
  value: number | null;
  rm: CostLine;
  labour: CostLine;
  transport: CostLine;
  overheads: CostLine;
  other: CostLine;
  cost: number;            // the sum of what IS known
  margin: number | null;   // value − cost, or null when value is unknown
  pct: number | null;
  have: number;            // how many of the five cost lines are real
  complete: boolean;
  missing: string[];
}

const N = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Work out the margin for a set of jobs in one pass.
 * `jobIds` empty means every active job.
 */
export async function marginsFor(
  db: SupabaseClient, jobIds: string[],
): Promise<JobMargin[]> {
  if (!jobIds.length) return [];

  const { data: jobs } = await db.from("jobs")
    .select("id, val, proj, wip_labour, transport, overheads")
    .in("id", jobIds);
  const rows = jobs ?? [];
  if (!rows.length) return [];

  /* ── raw material: job → rbom → the sum of its priced lines ── */
  const { data: wip } = await db.from("material_wip")
    .select("job_no, rbom_no").in("job_no", jobIds);
  const rbomOf = new Map<string, string>();
  for (const w of wip ?? []) {
    const r = String(w.rbom_no ?? "").trim();
    if (r) rbomOf.set(String(w.job_no), r);
  }
  const rbomIds = [...new Set([...rbomOf.values()])];
  const rmOf = new Map<string, number>();
  for (let i = 0; i < rbomIds.length; i += 50) {
    const { data: items } = await db.from("material_rbom_item")
      .select("rbom_id, amount").in("rbom_id", rbomIds.slice(i, i + 50));
    for (const it of items ?? []) {
      const k = String(it.rbom_id);
      rmOf.set(k, (rmOf.get(k) ?? 0) + (N(it.amount) ?? 0));
    }
  }

  /* ── claims and other costs, against the job or against its project ── */
  const projIds = [...new Set(rows.map((j) => String(j.proj ?? "")).filter(Boolean))];
  const jobCost = new Map<string, number>();
  const projCost = new Map<string, number>();
  try {
    const { data: own } = await db.from("job_cost_entry").select("job_id, amount").in("job_id", jobIds);
    for (const e of own ?? []) if (e.job_id) jobCost.set(String(e.job_id), (jobCost.get(String(e.job_id)) ?? 0) + (N(e.amount) ?? 0));
    if (projIds.length) {
      const { data: shared } = await db.from("job_cost_entry")
        .select("project_id, amount").is("job_id", null).in("project_id", projIds);
      for (const e of shared ?? []) if (e.project_id) projCost.set(String(e.project_id), (projCost.get(String(e.project_id)) ?? 0) + (N(e.amount) ?? 0));
    }
  } catch { /* 0165 not run yet — claims are simply unknown */ }

  /* a project's shared cost falls on its jobs by value */
  const projValue = new Map<string, number>();
  if (projCost.size) {
    const { data: sib } = await db.from("jobs")
      .select("id, proj, val").in("proj", [...projCost.keys()]).eq("active", true);
    for (const s of sib ?? []) {
      const p = String(s.proj ?? "");
      if (p) projValue.set(p, (projValue.get(p) ?? 0) + (N(s.val) ?? 0));
    }
  }
  const projCount = new Map<string, number>();
  if (projCost.size) {
    const { data: sib } = await db.from("jobs").select("id, proj").in("proj", [...projCost.keys()]).eq("active", true);
    for (const s of sib ?? []) {
      const p = String(s.proj ?? "");
      if (p) projCount.set(p, (projCount.get(p) ?? 0) + 1);
    }
  }

  return rows.map((j) => {
    const id = String(j.id);
    const value = N(j.val);
    const rbom = rbomOf.get(id);
    const rmAmt = rbom ? rmOf.get(rbom) ?? null : null;

    const proj = String(j.proj ?? "");
    const shared = projCost.get(proj) ?? 0;
    let share = 0;
    if (shared) {
      const totV = projValue.get(proj) ?? 0;
      share = totV > 0
        ? shared * ((value ?? 0) / totV)
        : shared / Math.max(1, projCount.get(proj) ?? 1);
    }
    const ownCost = jobCost.get(id) ?? 0;
    const otherAmt = ownCost || share ? Math.round(ownCost + share) : null;

    const line = (amount: number | null, from: string): CostLine =>
      ({ amount, known: amount !== null, from });

    const rm = line(rmAmt, rbom ? `RBOM ${rbom}` : "no RBOM built for this job yet");
    const labour = line(N(j.wip_labour), "the job's labour figure");
    const transport = line(N(j.transport), "the job");
    const overheads = line(N(j.overheads), "the job");
    const other = line(otherAmt, shared && !ownCost ? "a share of the project's claims" : "claims against this job");

    const lines = [rm, labour, transport, overheads, other];
    const cost = lines.reduce((s, l) => s + (l.amount ?? 0), 0);
    const have = lines.filter((l) => l.known).length;
    const margin = value === null ? null : value - cost;

    return {
      job_id: id, value, rm, labour, transport, overheads, other,
      cost, margin,
      pct: margin === null || !value ? null : Math.round((margin / value) * 1000) / 10,
      have, complete: have === lines.length,
      missing: [
        !rm.known ? "raw material" : "", !labour.known ? "labour" : "",
        !transport.known ? "transport" : "", !overheads.known ? "overheads" : "",
        !other.known ? "claims" : "",
      ].filter(Boolean),
    };
  });
}
