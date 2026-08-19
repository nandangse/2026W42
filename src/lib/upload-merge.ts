// Upload pipeline — the ONLY door for data (spec §4). Parses a workbook with
// the ported parseUpload, auto-detects which file it is, applies the exact
// merge semantics via the atomic RPC functions, and records the import_batch.
// Order of the three files must not matter; re-uploading the same file is a
// no-op (idempotent upserts).
import * as XLSX from "xlsx";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseUpload, linkTasks, dateFixes } from "./parse-upload";
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
  if (p.employees) return "employees";
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

/**
 * Refuse a delivered upload that is mostly the LIVE board.
 *
 * The mirror of guardMassArchive, and it exists because the slot fix opened a
 * hole: declaring the slot forces the delivered branch, so detectKind agrees
 * with the slot and the slot/kind mismatch check can never fire. Drop the
 * in-progress export on the Delivered card and all 105 live jobs would be
 * banked as delivered — and, worse than the archive case, silently: their
 * plans, baselines and materials all turn read-only with nothing to notice.
 *
 * A genuine delivered export barely intersects the live board. The real one
 * (2,728 rows, Aug 2026) overlapped it on ZERO of 105. Some overlap is normal
 * — a job at Installation Stage is delivered and still live — so this only
 * fails when most of what is being banked is currently in progress.
 */
const MAX_LIVE_OVERLAP = 0.4;

async function guardDeliveredOverlap(admin: SupabaseClient, del: ParsedDeliveredJob[]) {
  const { data, error } = await admin.from("jobs").select("id").eq("active", true);
  if (error) throw new UploadError("could not read jobs: " + error.message);
  const live = new Set((data || []).map((r) => r.id as string));
  if (live.size < 20) return; // fresh install — nothing to protect
  const overlap = del.filter((d) => live.has(d.id)).length;
  if (overlap / del.length > MAX_LIVE_OVERLAP) {
    throw new UploadError(
      `Refused: ${overlap} of these ${del.length} rows are jobs currently live on the board. ` +
        `A delivered-jobs file barely overlaps the live board, so this is almost certainly the ` +
        `"Job in progress - Jobs" export on the wrong card. Banking it would mark those jobs ` +
        `delivered and make their plans read-only. Nothing was changed.`,
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
    // Blank when the export has no such column. apply_projects treats blank as
    // "not supplied" and keeps whatever is already stored, so uploading the
    // older export does not wipe the names the newer one brought in.
    name: p.name || "",
    cust: p.cust || "",
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

/** Morning Update card key -> the kind that card is allowed to produce. */
const SLOT_KIND: Record<string, UploadKind[]> = {
  jobs: ["jobs", "pre"],
  projects: ["projects", "pre"],
  tasks: ["tasks"],
  delivered: ["delivered"],
  employees: ["employees"],
};

const SLOT_NAME: Record<string, string> = {
  jobs: "Job in progress - Jobs",
  projects: "Order in Progress - projects",
  tasks: "To Do Dashboard All",
  delivered: "Delivered Jobs",
  employees: "Employee Master",
};

/**
 * Is this a delimited text file rather than a workbook?
 *
 * The extension first, because that is what the person meant. Then the bytes,
 * because a file renamed to .xlsx is still a CSV and refusing it on a
 * technicality helps nobody: every real spreadsheet format this app accepts is
 * a ZIP (xlsx, "PK") or an OLE compound file (xls), and neither can begin with
 * printable text.
 */
function isTextTable(filename: string, bytes: Uint8Array): boolean {
  if (/\.(csv|tsv|txt)$/i.test(filename)) return true;
  if (!bytes.length) return false;
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b; // "PK" — xlsx
  const ole = bytes[0] === 0xd0 && bytes[1] === 0xcf; // xls
  return !zip && !ole;
}

/** The four money fields, in the order they matter on the board. */
const MONEY_LABELS: [string, string][] = [
  ["own", "Planning Owner"],
  ["stat", "Job status"],
  ["tdd", "Target delivery date"],
  ["payOnDelivery", "Pending payment on delivery"],
  ["escalation", "Current project escalation"],
  ["amtNeeded", "Amount needed"],
  ["cashflow", "Cash flow details"],
  ["clientUpdate", "Client update"],
];

/**
 * What the upload found, and — more usefully — what it did not.
 *
 * These four columns are matched by meaning, so the summary has to name the
 * header each one bound to. When nothing matches, the whole header list is
 * printed: that is exactly how the real delivery-date column was confirmed on
 * the Delivered Jobs export, and it is the only way to tell "the ERP does not
 * export this" apart from "the pattern is wrong".
 */
function moneyReport(
  matched: Record<string, string> | undefined,
  headers: string[] | undefined,
  jobs: ParsedJob[],
): string[] {
  const hit = matched || {};
  const out: string[] = [];
  const found = MONEY_LABELS.filter(([k]) => hit[k]);
  const missing = MONEY_LABELS.filter(([k]) => !hit[k]);

  for (const [k, label] of found) {
    // how many rows actually carry a value — a bound column that is blank on
    // every row is a match worth doubting
    const filled = jobs.filter((j) => {
      const v = (j as unknown as Record<string, unknown>)[k];
      return v != null && v !== "";
    }).length;
    out.push(`· ${label} ← "${hit[k]}" · ${filled} of ${jobs.length} rows carry a value`);
  }
  if (missing.length) {
    out.push(
      `· ⚠ no column matched: ${missing.map(([, l]) => l).join(", ")}. ` +
        `Left as they were rather than blanked.`,
    );
    // Print the sheet's own headers whenever something IMPORTANT is missing,
    // not only when everything is. Planning Owner going unmatched is what
    // empties the owner column, the owner filter, the kanban and My Week, and
    // it is worth thirty columns of noise to see why.
    const critical = missing.some(([k]) => k === "own" || k === "stat" || k === "tdd");
    if ((critical || !found.length) && headers?.length)
      out.push(`· The sheet's columns are: ${headers.join(" | ")}`);
  }
  return out;
}

export async function applyUpload(
  admin: SupabaseClient,
  fileBuf: ArrayBuffer,
  filename: string,
  uploadedBy: string,
  /** The card the file was dropped on, when the page sent one. */
  slot?: string,
): Promise<UploadSummary> {
  let wb: XLSX.WorkBook;
  try {
    const bytes = new Uint8Array(fileBuf);
    if (isTextTable(filename, bytes)) {
      // CSV / TSV. Decoded and read as text rather than handed to the binary
      // reader: sniffing bytes gets a comma-separated file wrong often enough
      // to matter, and the HR master arrives as a CSV as often as a workbook.
      // The BOM Excel writes on "CSV UTF-8" export would otherwise become part
      // of the first header name, so the first column silently stops matching.
      const text = new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "");
      // raw: true keeps every cell as the text the file actually holds.
      //
      // Without it the CSV reader converts anything date-shaped ITSELF, in
      // American month-first order: "08/07/1948" comes back as 7 August, and
      // "01/04/1990" as 4 January. This whole suite reads dd-mm-yyyy — that is
      // the rule 3.0.1.1 settled — so the dates have to reach ser2iso as the
      // strings they were written as, and be read there, once, day first.
      wb = XLSX.read(text, { type: "string", raw: true });
    } else {
      // normalise to a byte array so both ArrayBuffer (route handler) and
      // Uint8Array (acceptance test) inputs read identically.
      wb = XLSX.read(bytes, { type: "array" });
    }
  } catch (e) {
    throw new UploadError(
      "Could not read the file: " + (e instanceof Error ? e.message : String(e)),
    );
  }
  const parsed = parseUpload(wb, slot);
  const kind = detectKind(parsed); // throws UploadError if unrecognised

  // The slot said one thing and the file is another. Refuse rather than do
  // the wrong merge quietly: dropping the live jobs export on the Delivered
  // card would bank 105 live jobs as delivered and lock every one of their
  // plans read-only, and that is not something a person would notice today.
  const allowed = slot ? SLOT_KIND[slot] : undefined;
  if (allowed && !allowed.includes(kind)) {
    throw new UploadError(
      `Refused: this was uploaded on the "${SLOT_NAME[slot!] ?? slot}" card, but the file reads as ` +
        `${kind === "pre" ? "the full PRE workbook" : "the " + kind + " export"}. ` +
        `Nothing was changed — upload it on the right card, or check the download is the report you meant.`,
    );
  }

  // one import_batch per upload (kept forever — morning snapshot history)
  const batchId = crypto.randomUUID();

  // Impossible dates the ERP produced, corrected to the last real day of the
  // month. Reported at the top of the summary, because a silently moved date
  // is exactly the kind of thing that turns up months later in a wrong chart.
  const fixes = [...dateFixes];

  const lines: string[] = [];
  if (fixes.length) {
    const shown = fixes.slice(0, 5).map((f) => `${f.raw} → ${f.fixed}`).join(", ");
    lines.push(
      `· ⚠ ${fixes.length} impossible date${fixes.length === 1 ? "" : "s"} corrected to the last day of that month: ` +
        shown + (fixes.length > 5 ? `, and ${fixes.length - 5} more` : ""),
    );
  }
  let jobCount: number | null = null;
  let taskCount: number | null = null;
  let projectCount: number | null = null;

  if (kind === "jobs" || kind === "pre") {
    const jobs = parsed.jobs!;
    jobCount = jobs.length;
    await guardMassArchive(admin, jobs);
    const moneyFields = Object.keys(parsed.jobFieldHeaders || {});
    let { error } = await admin.rpc("apply_jobs", {
      p_jobs: jobs,
      p_batch: batchId,
      p_money_fields: moneyFields,
    });
    // Code deploys and migrations are run by hand, minutes or hours apart. If
    // 0026 has not been pasted yet the three-argument function does not exist,
    // and the morning upload must NOT be the thing that discovers it. Fall back
    // to the old signature and say the money columns were skipped.
    if (error && /apply_jobs|function|does not exist|schema cache/i.test(error.message)) {
      const retry = await admin.rpc("apply_jobs", { p_jobs: jobs, p_batch: batchId });
      error = retry.error;
      if (!error && moneyFields.length)
        lines.push(
          "· ⚠ The money columns were read from the file but not stored — run " +
            "supabase/migrations/0026_job_money_and_hint_cache.sql, then upload again.",
        );
    }
    if (error) throw new UploadError("apply_jobs failed: " + error.message);
    lines.push(
      `· ${jobs.length} jobs from ` +
        (parsed.fromDAJobs
          ? "PRE > Data Analysis > 'Job in progress - Jobs' link data"
          : parsed.fromPRE
            ? "PRE Milestones for Delivery (fallback)"
            : "Jobmaster sheet"),
    );
    // Say which header each money field was read from. A match reported is a
    // match that can be corrected; a match assumed is a column that quietly
    // stops arriving the day the ERP renames it.
    lines.push(...moneyReport(parsed.jobFieldHeaders, parsed.jobHeaders, jobs));
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
    await guardDeliveredOverlap(admin, del);
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
  } else if (kind === "employees") {
    const emp = parsed.employees!;
    jobCount = emp.length;
    const { error } = await admin.from("employees").upsert(
      emp.map((e) => ({ ...e, updated_at: new Date().toISOString() })),
      { onConflict: "id" },
    );
    if (error) throw new UploadError("employee master failed: " + error.message);
    const withDob = emp.filter((e) => e.dob).length;
    const active = emp.filter((e) => e.active).length;
    lines.push(`· ${emp.length} employees loaded — ${active} active`);
    lines.push(
      withDob
        ? `· ${withDob} carry a date of birth, so the birthday list can be built`
        : `· ⚠ NO date of birth was read. Columns in this sheet: ` + (parsed.employeeHeaders || []).join(" | "),
    );
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
  /**
   * A batch stamp that will not write is a WARNING, not a failure.
   *
   * By this line every row is already applied. Throwing here told somebody
   * their Employee Master upload had failed while 364 employees sat in the
   * database — which is worse than a missing timestamp in every direction: the
   * upload gets repeated, and nobody trusts the page afterwards.
   *
   * The cause that made this obvious: kind = 'employees' was not in the
   * import_batches check constraint. 0033 adds it.
   */
  if (be)
    lines.push(
      `· ⚠ The data is loaded, but the upload could not be stamped in the history: ${be.message}. ` +
        `Nothing was lost — only the "last loaded" time for this file will be missing.`,
    );

  return summary;
}
