import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * EVERY JOB GENIE KNOWS (12 Oct 2026): the live ones on `jobs` and the
 * delivered history on `delivered_jobs` (back to 2013), one row per job
 * number — the live row wins where both carry it.
 */
export interface SevaJob { id: string; tag: string; fam: string; cust: string; own: string; stat: string; status: string; delivered_on: string | null; tdd: string | null; live: boolean }
const S = (v: unknown) => String(v ?? "").trim();

async function paged<T>(q: (a: number, b: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let a = 0; a < 50000; a += 1000) {
    const { data, error } = await q(a, a + 999);
    if (error) { if (/does not exist|schema cache/i.test(error.message)) return out; throw new Error(error.message); }
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function allJobs(admin: SupabaseClient): Promise<Map<string, SevaJob>> {
  const [live, past] = await Promise.all([
    paged<Record<string, unknown>>((a, b) => admin.from("jobs").select("id, tag, fam, cust, own, stat, status, delivered, delivered_on, tdd, archived_at").range(a, b)),
    paged<Record<string, unknown>>((a, b) => admin.from("delivered_jobs").select("id, tag, fam, cust, own, stat, status, delivered_on, tdd").range(a, b)),
  ]);
  const m = new Map<string, SevaJob>();
  for (const j of past) m.set(S(j.id), { id: S(j.id), tag: S(j.tag), fam: S(j.fam), cust: S(j.cust), own: S(j.own), stat: S(j.stat), status: S(j.status), delivered_on: (j.delivered_on as string) || null, tdd: (j.tdd as string) || null, live: false });
  for (const j of live) m.set(S(j.id), { id: S(j.id), tag: S(j.tag), fam: S(j.fam), cust: S(j.cust), own: S(j.own), stat: S(j.stat), status: S(j.status) || (j.delivered ? "Delivered" : "Jobs in Process"), delivered_on: (j.delivered_on as string) || m.get(S(j.id))?.delivered_on || null, tdd: (j.tdd as string) || null, live: !j.delivered });
  return m;
}

/** AT INSTALLATION: the ERP's classifier says so, or the stage is an installation one that is not yet complete. */
export const atInstallation = (j: SevaJob) => /installation stage/i.test(j.status) || /installation stage/i.test(j.stat) || /^I: Installation (in progress|Not Started)/i.test(j.stat);

/** the ticket's job numbers — job_number, and job_numbers when it names several */
export const jobsOfTicket = (r: { job_number?: unknown; job_numbers?: unknown }) => [...new Set([S(r.job_number), ...S(r.job_numbers).split(/[,;\s/]+/)].map((x) => x.trim()).filter((x) => /^\d{6,}$/.test(x)))];

export { paged };
