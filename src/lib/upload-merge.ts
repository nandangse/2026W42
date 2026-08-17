// Upload pipeline — the ONLY door for data (spec §4). Parses a workbook with
// the ported parseUpload, auto-detects which file it is, applies the exact
// merge semantics via the atomic RPC functions, and records the import_batch.
// Order of the three files must not matter; re-uploading the same file is a
// no-op (idempotent upserts).
import * as XLSX from "xlsx";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseUpload, linkTasks } from "./parse-upload";
import type {
  ParseResult,
  ParsedJob,
  ParsedDeliveredJob,
  UploadKind,
  ParsedProject,
} from "./types";

export class UploadError extends Error {}

export function detectKind(p: ParseResult): UploadKind {
  // delivered first: it is the one Jobmaster-shaped file that must never reach
  // apply_jobs (see parse-upload's isDeliveredSheet). The parser never sets
  // both, so this is order-of-preference, not a tie-break.
  if (p.deliveredJobs) return "delivered";
  if (p.jobs && p.fromPRE) return "pre";
  if (p.jobs) return "jobs";
  if (p.projMap && !p.jobs) return "projects";
  if (p.rawTasks) return "tasks";
  throw new UploadError("Workbook not recognised");
}

/**
 * Refuse a jobs upload that would archive most of the live board.
 *
 * A normal morning file replaces the board nearly one-for-one — a handful of
 * jobs drop out. A file that would retire half of it is not a morning file: it
 * is the wrong export (there are now four Jobmaster-shaped downloads on the
 * Morning Update page) or a truncated download. Archiving is reversible in
 * principle, but only by someone who notices, so this fails closed.
 */
const MAX_ARCHIVE_SHARE = 0.4;

async function guardMassArchive(admin: SupabaseClient, jobs: ParsedJob[]) {
  const { data, error } = await admin.from("jobs").select("id").eq("active", true);
  if (error) throw new UploadError("could not read jobs: " + error.message);
  const live = (data || []).map((r) => r.id as string);
  if (live.length < 20) return; // a near-empty board (fresh install) has nothing to protect
  const incoming = new Set(jobs.map((j) => j.id));
  const wouldArchive = live.filter((id) => !incoming.has(id)).length;
  if (wouldArchive / live.length > MAX_ARCHIVE_SHARE) {
    throw new UploadError(
      `Refused: this file has ${jobs.length} jobs and would archive ${wouldArchive} of the ${live.length} live jobs. ` +
        `That is not a normal morning update — it usually means the wrong export was uploaded ` +
        `(check it is "Job in progress - Jobs", not Delivered Jobs or a filtered view). ` +
        `Nothing was changed.`,
    );
  }
}

/** projMap (keyed by project id) → the jsonb array apply_projects expects. */
function projectsArray(projMap: Record<string, ParsedProject>) {
  return Object.entries(projMap).map(([id, p]) => ({
    id,
    mgr: p.mgr,
    committed: p.committed,
    expEnd: p.expEnd,
    so: p.so,
    stage: p.stage,
  }));
}

export interface UploadSummary {
  kind: UploadKind;
  filename: string;
  sheetNames: string[];
  jobCount: number | null;
  taskCount: number | null;
  projectCount: number | null;
  sourcesCaptured: number;
  fromPRE: boolean;
  fromDAJobs: boolean;
  lines: string[]; // the human "Loaded ✓" bullet lines V1.9 shows
}

export async function applyUpload(
  admin: SupabaseClient,
  fileBuf: ArrayBuffer,
  filename: string,
  uploadedBy: string,
): Promise<UploadSummary> {
  let wb: XLSX.WorkBook;
  try {
    // normalise to a byte array so both ArrayBuffer (route handler) and
    // Uint8Array (acceptance test) inputs read identically.
    wb = XLSX.read(new Uint8Array(fileBuf), { type: "array" });
  } catch (e) {
    throw new UploadError(
      "Could not read the file: " + (e instanceof Error ? e.message : String(e)),
    );
  }
  const parsed = parseUpload(wb);
  const kind = detectKind(parsed); // throws UploadError if unrecognised

  // one import_batch per upload (kept forever — morning snapshot history)
  const batchId = crypto.randomUUID();

  const lines: string[] = [];
  let jobCount: number | null = null;
  let taskCount: number | null = null;
  let projectCount: number | null = null;

  if (kind === "jobs" || kind === "pre") {
    const jobs = parsed.jobs!;
    jobCount = jobs.length;
    await guardMassArchive(admin, jobs);
    const { error } = await admin.rpc("apply_jobs", {
      p_jobs: jobs,
      p_batch: batchId,
    });
    if (error) throw new UploadError("apply_jobs failed: " + error.message);
    lines.push(
      `· ${jobs.length} jobs from ` +
        (parsed.fromDAJobs
          ? "PRE > Data Analysis > 'Job in progress - Jobs' link data"
          : parsed.fromPRE
            ? "PRE Milestones for Delivery (fallback)"
            : "Jobmaster sheet"),
    );
    if (kind === "pre" && parsed.projMap) {
      projectCount = Object.keys(parsed.projMap).length;
      const { error: pe } = await admin.rpc("apply_projects", {
        p_projects: projectsArray(parsed.projMap),
      });
      if (pe) throw new UploadError("apply_projects failed: " + pe.message);
      lines.push(`· ${projectCount} projects upserted (owners/dates blank-filled)`);
    }
  } else if (kind === "projects") {
    projectCount = Object.keys(parsed.projMap!).length;
    const { error } = await admin.rpc("apply_projects", {
      p_projects: projectsArray(parsed.projMap!),
    });
    if (error) throw new UploadError("apply_projects failed: " + error.message);
    lines.push(`· ${projectCount} projects · owners/committed/expected dates blank-filled`);
    if (parsed.owners && Object.keys(parsed.owners).length) {
      const { error: oe } = await admin.rpc("apply_owners", {
        p_owners: parsed.owners,
      });
      if (oe) throw new UploadError("apply_owners failed: " + oe.message);
      lines.push(`· ${Object.keys(parsed.owners).length} job owners merged`);
    }
  } else if (kind === "delivered") {
    // Dedupe by id first: a history export can repeat a job (one line per
    // despatch), and ON CONFLICT DO UPDATE refuses to touch the same row twice
    // in one statement. Last occurrence wins — the report is ordered oldest
    // first, so that is the most recent state of the job.
    const byId = new Map<string, ParsedDeliveredJob>();
    for (const d of parsed.deliveredJobs!) byId.set(d.id, d);
    const del = [...byId.values()];
    const dupes = parsed.deliveredJobs!.length - del.length;
    if (dupes > 0) lines.push(`· ${dupes} duplicate job rows collapsed (kept the latest of each)`);
    jobCount = del.length;
    const { error } = await admin.rpc("apply_delivered", {
      p_jobs: del,
      p_batch: batchId,
    });
    if (error) throw new UploadError("apply_delivered failed: " + error.message);

    // Delivery dates are the entire point of this file, so say plainly how many
    // landed and which column they came from. A mis-matched header must be
    // obvious on the first upload, not discovered later in a wrong chart.
    const dated = del.filter((d) => d.delivered);
    const col = dated[0]?.dateSource;
    lines.push(`· ${del.length} delivered jobs banked (never archived — this file is a ledger)`);
    if (dated.length) {
      lines.push(`· ${dated.length} carry a delivery date, read from the "${col}" column`);
      const ds = dated.map((d) => d.delivered!).sort();
      lines.push(`· delivery dates span ${ds[0]} → ${ds[ds.length - 1]}`);
    }
    if (dated.length < del.length) {
      lines.push(
        `· ⚠ ${del.length - dated.length} rows have NO delivery date. ` +
          (col
            ? `Their "${col}" cell was empty.`
            : `No delivery-date column was recognised. Columns in this file: ` +
              (parsed.deliveredHeaders || []).join(" | ")),
      );
    }
  } else if (kind === "tasks") {
    // link raw ToDo rows against the current active jobs in the DB
    const { data: jobRows, error: je } = await admin
      .from("jobs")
      .select("id, proj")
      .eq("active", true);
    if (je) throw new UploadError("could not read jobs: " + je.message);
    const linked = linkTasks(
      parsed.rawTasks!,
      (jobRows || []) as unknown as ParsedJob[],
    );
    taskCount = linked.length;
    const { error } = await admin.rpc("apply_tasks", {
      p_tasks: linked,
      p_batch: batchId,
    });
    if (error) throw new UploadError("apply_tasks failed: " + error.message);
    lines.push(`· ${linked.length} ERP tasks merged (manual tasks, ✓ & comments preserved)`);
  }

  const sourcesCaptured = parsed.sources?.length ?? 0;
  if (sourcesCaptured) lines.push(`· ${sourcesCaptured} morning refresh links captured`);

  const summary: UploadSummary = {
    kind,
    filename,
    sheetNames: wb.SheetNames,
    jobCount,
    taskCount,
    projectCount,
    sourcesCaptured,
    fromPRE: !!parsed.fromPRE,
    fromDAJobs: !!parsed.fromDAJobs,
    lines,
  };

  const rowCount = jobCount ?? taskCount ?? projectCount ?? 0;
  const { error: be } = await admin.from("import_batches").insert({
    id: batchId,
    kind,
    filename,
    uploaded_by: uploadedBy,
    row_count: rowCount,
    summary,
  });
  if (be) throw new UploadError("could not record import_batch: " + be.message);

  return summary;
}
