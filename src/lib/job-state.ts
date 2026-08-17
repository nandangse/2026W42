// Where a job sits in its life, and what that permits.
//
// A job is LIVE, DELIVERED, or in INSTALLATION (delivered, but still being put
// up on site). Planning is a thing you do to work that is still ahead of you,
// so once a job is delivered its plan stops being editable — but NOTHING is
// removed. Every milestone, baseline, material line, task and comment written
// against that job stays exactly where it was and stays readable forever. The
// job becomes a record instead of a plan.
//
// Enforced here, server-side, because UI hiding is presentation and never
// enforcement (spec §8). Every route that writes the planning layer calls
// assertJobEditable() before touching anything.
import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "./auth";

export type JobState = "live" | "delivered" | "installation";

/** The ERP statuses that mean the machine is with the customer. */
const INSTALLATION_STATUSES = new Set([
  "I: Installation Not Started due to Client",
  "I: Installation in progress",
  "I: Installation Completed",
]);

export function jobState(job: { delivered?: boolean | null; stat?: string | null }): JobState {
  const stat = String(job.stat || "").trim();
  if (INSTALLATION_STATUSES.has(stat)) return "installation";
  if (job.delivered) return "delivered";
  return "live";
}

/**
 * 423 Locked if this job has been delivered.
 *
 * Silent on an unknown job id: whether a missing job is an error depends on the
 * caller (tasks may be raised with no job at all), so that judgement stays with
 * the route rather than being pre-empted here.
 */
export async function assertJobEditable(
  supabase: SupabaseClient,
  jobId: string | null | undefined,
): Promise<void> {
  if (!jobId) return;
  const { data, error } = await supabase
    .from("jobs")
    .select("id, delivered, delivered_on, stat")
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || !data.delivered) return;

  const when = data.delivered_on ? ` on ${data.delivered_on}` : "";
  throw new HttpError(
    423,
    `Job ${jobId} was delivered${when} — its plan is now a record and can't be edited. ` +
      `Everything already on it stays readable.`,
  );
}
