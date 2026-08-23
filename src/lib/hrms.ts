/**
 * HRMS — the shared vocabulary.
 *
 * One file, imported by the server routes and by the screen, so the list of
 * fields cannot drift between what can be saved and what can be typed.
 *
 * TWO KINDS OF FIELD, and the difference is the whole design:
 *
 *   SHEET fields are columns the HR master carries. `employees` is upserted
 *   wholesale by every Employee Master upload, so an edit written there is
 *   gone the next morning. Editing one of these stores an OVERRIDE in
 *   hrms_employee_edits; the sheet value stays where it is and HRMS shows both.
 *
 *   GENIE fields are ours — a telephone number, next of kin, a blood group.
 *   The sheet has never carried them and no upload can overwrite them. They
 *   use the same overlay table, so there is one mechanism rather than two.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type FieldKind = "text" | "date" | "email" | "tel" | "bool" | "long";

export interface FieldSpec {
  key: string;
  label: string;
  kind: FieldKind;
  /** true = the HR sheet owns it and an edit here is an override. */
  sheet: boolean;
  /** Shown under the input on the person card. */
  hint?: string;
}

/** Columns that come off the HR sheet, in the order they read on a record. */
export const SHEET_FIELDS: FieldSpec[] = [
  { key: "name", label: "Name", kind: "text", sheet: true },
  { key: "email", label: "Work email", kind: "email", sheet: true },
  { key: "department", label: "Department", kind: "text", sheet: true },
  { key: "designation", label: "Designation", kind: "text", sheet: true },
  { key: "location", label: "Location", kind: "text", sheet: true },
  { key: "doj", label: "Date of joining", kind: "date", sheet: true },
  { key: "dob", label: "Date of birth", kind: "date", sheet: true, hint: "Drives the birthday list on My Week." },
  { key: "active", label: "Currently employed", kind: "bool", sheet: true },
];

/** Ours. The sheet has never carried these and no upload can touch them. */
export const GENIE_FIELDS: FieldSpec[] = [
  { key: "phone", label: "Mobile", kind: "tel", sheet: false },
  { key: "personal_email", label: "Personal email", kind: "email", sheet: false, hint: "Where to write after somebody leaves." },
  { key: "emergency_name", label: "Emergency contact", kind: "text", sheet: false },
  { key: "emergency_phone", label: "Emergency number", kind: "tel", sheet: false },
  { key: "blood_group", label: "Blood group", kind: "text", sheet: false },
  { key: "address", label: "Address", kind: "long", sheet: false },
  { key: "notes", label: "HR notes", kind: "long", sheet: false, hint: "Read by whoever can open HRMS. Nobody else, including the person." },
];

export const ALL_FIELDS: FieldSpec[] = [...SHEET_FIELDS, ...GENIE_FIELDS];

const BY_KEY = new Map(ALL_FIELDS.map((f) => [f.key, f]));

/** The whitelist. An unknown field name is refused rather than stored. */
export const fieldSpec = (key: string): FieldSpec | undefined => BY_KEY.get(key);

/** One employee, sheet value and override merged, as the screen wants it. */
export interface HrmsEmployee {
  id: string;
  /** The merged value of every field — overrides applied. */
  value: Record<string, string | null>;
  /** Only the SHEET fields that an override is currently masking. */
  sheet: Record<string, string | null>;
  /** Which fields carry an override, and who set it. */
  edited: Record<string, { by: string | null; at: string }>;
  /** Whatever else the HR sheet's row carried, verbatim. */
  extra: Record<string, string>;
  firstSeen: string | null;
  updatedAt: string | null;
}

/**
 * May this person open HRMS?
 *
 * The owner always. Everybody else by an explicit row in hrms_access, keyed by
 * email — see migration 0047 for why it is email and not a profile id.
 *
 * A missing table reads as "nobody", which is the right way for a gate to fail.
 */
export async function resolveHrmsAccess(
  admin: SupabaseClient,
  email: string,
  isOwner: boolean,
): Promise<boolean> {
  if (isOwner) return true;
  const e = String(email || "").trim().toLowerCase();
  if (!e) return false;
  try {
    const { data } = await admin
      .from("hrms_access")
      .select("email")
      .eq("email", e)
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

/** Tenure in whole years and months, for a person card. */
export function tenure(doj: string | null | undefined, today = new Date()): string {
  if (!doj) return "—";
  const d = new Date(doj + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "—";
  let months =
    (today.getFullYear() - d.getFullYear()) * 12 + (today.getMonth() - d.getMonth());
  if (today.getDate() < d.getDate()) months -= 1;
  if (months < 0) return "—";
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (!y) return `${m} month${m === 1 ? "" : "s"}`;
  if (!m) return `${y} year${y === 1 ? "" : "s"}`;
  return `${y}y ${m}m`;
}

/**
 * WHICH TABLES ARE ACTUALLY THERE — the 0048 rename, survived safely.
 *
 * Migration 0048 renames employees -> hrms_employees (and the two beside it).
 * A migration and a deploy are two separate acts by two separate hands, and
 * whichever lands second, the minutes in between must not take the employee
 * master down or fail the morning upload. So nothing here hard-codes a name:
 * the new name is tried, and the old one is used until the rename has
 * happened.
 *
 * The answer is cached for a minute rather than for the life of the process,
 * so an installation picks the new names up on its own shortly after the
 * migration runs, with no redeploy and nobody having to remember.
 *
 * DELETE THIS once 0048 is run everywhere. It is a bridge, not a design.
 */
let tableCache: { at: number; names: HrmsTables } | null = null;
const TABLE_TTL_MS = 60_000;

export interface HrmsTables {
  employees: string;
  edits: string;
  log: string;
}

export async function hrmsTables(admin: SupabaseClient): Promise<HrmsTables> {
  if (tableCache && Date.now() - tableCache.at < TABLE_TTL_MS) return tableCache.names;
  const probe = async (renamed: string, original: string) => {
    try {
      const { error } = await admin.from(renamed).select("*", { head: true, count: "exact" }).limit(1);
      return error ? original : renamed;
    } catch {
      return original;
    }
  };
  const names: HrmsTables = {
    employees: await probe("hrms_employees", "employees"),
    edits: await probe("hrms_employee_edits", "employee_edits"),
    log: await probe("hrms_employee_edit_log", "employee_edit_log"),
  };
  tableCache = { at: Date.now(), names };
  return names;
}
