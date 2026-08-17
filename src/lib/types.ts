// Shared domain types for the Nandan Works Planning Suite.
// The ERP-derived shapes mirror the V1.9 parser output verbatim so the ported
// parseUpload module stays byte-compatible with the battle-tested logic.

/**
 * admin         — everything, plus the Admin page
 * planner       — all boards and editing
 * project_owner — all boards and editing; jobs are filtered by these people
 * user          — reads the boards, works its own tasks (assign/close/comment)
 * viewer        — read-only
 * uploader      — the Morning Update page only
 */
export type Role =
  | "admin"
  | "planner"
  | "project_owner"
  | "user"
  | "sales"
  | "viewer"
  | "uploader";

/** A parsed job row exactly as V1.9's parseUpload emits it. */
export interface ParsedJob {
  id: string;
  tag: string;
  fam: string;
  cust: string;
  val: number;
  tdd: string | null;
  otd: string | null;
  start: string | null;
  proj: string;
  stat: string;
  pct: number;
  note: string;
  own: string;
  mgmt: string | null;
  tp?: number;
  tpv: number;
  tpp: number;
  kit: number;
}

/**
 * A row from the "Delivered Jobs for Analysis" report. Same Jobmaster shape as
 * ParsedJob plus the one thing no other export carries: the date the job was
 * actually delivered, and which column that date was read from.
 */
export interface ParsedDeliveredJob extends ParsedJob {
  /** Actual delivery date, ISO. Null when no delivery-date column was matched. */
  delivered: string | null;
  /** The header `delivered` came from — surfaced so a mis-match is never silent. */
  dateSource: string | null;
}

export interface ParsedRawTask {
  ref: string;
  refn: string;
  t: string;
  d: string;
  who: string;
  due: string | null;
  cat: string;
}

export interface ParsedProject {
  stage: string;
  qty: number;
  committed: string | null;
  expEnd: string | null;
  so: string;
  mgr: string;
}

export interface ParsedSourceLink {
  nm: string;
  erp: string;
  gs: string;
  stamp: string;
}

export interface OwnerInfo {
  own?: string;
  mgmt?: string | null;
}

/** The full return of parseUpload(). All fields optional — presence signals which file was uploaded. */
export interface ParseResult {
  jobs?: ParsedJob[];
  rawTasks?: ParsedRawTask[];
  owners?: Record<string, OwnerInfo>;
  preJobs?: ParsedJob[];
  projMap?: Record<string, ParsedProject>;
  sources?: ParsedSourceLink[];
  daJobs?: ParsedJob[];
  statMap?: Record<string, { stat: string; kit: number }>;
  fromPRE?: boolean;
  fromDAJobs?: boolean;
  /** Rows from the Delivered Jobs report. Never merged into `jobs`. */
  deliveredJobs?: ParsedDeliveredJob[];
  /** Every header seen on the delivered sheet — the diagnostic when no date matched. */
  deliveredHeaders?: string[];
}

/** A task after linkTasks() merges raw ToDo rows against the job list. */
export interface LinkedTask {
  j: string; // job_id
  t: string; // title
  d: string; // detail
  who: string;
  due: string | null;
  cat: string;
}

/** What kind of workbook a POST /api/upload was detected as. */
export type UploadKind = "jobs" | "projects" | "tasks" | "pre" | "delivered";
