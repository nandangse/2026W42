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
import { hasGrant } from "@/lib/grant";

export type FieldKind =
  | "text" | "date" | "email" | "tel" | "bool" | "long" | "money" | "number"
  /** A link, opened in a new tab. Never a file — see the Documents group. */
  | "url"
  /** One of `options`. */
  | "select"
  /** Picked from Genie's own user list; writes the account's email. */
  | "user"
  /**
   * SEVERAL of something. Stored as one value per line, because the thing
   * being listed is role names and two of them already contain a comma
   * ("Head, Purchase") — a comma-separated list would have split them in
   * half the first time anybody used it.
   */
  | "multi";

export interface FieldSpec {
  key: string;
  label: string;
  kind: FieldKind;
  /** The named column on hrms_employees, where there is one. */
  column?: string;
  /**
   * The HR sheet's own header for this value, as it appears in `extra`.
   * Verbatim, typos included — "Sikll Level" is what the sheet says, and a
   * corrected spelling here would simply fail to find the data.
   */
  sheetHeader?: string;
  /** true where the value came from the sheet — an edit is an override. */
  sheet: boolean;
  /** For kind "select" with a fixed list. */
  options?: string[];
  /**
   * For kind "select" backed by a MASTER — the options come from
   * hrms_master for this kind, and are managed in Module Masters rather than
   * typed into a record. See migration 0049.
   */
  master?: string;
  /** Shown under the field once that option is chosen. */
  optionNotes?: Record<string, string>;
  /** No two employees may hold the same value. Enforced server-side. */
  unique?: boolean;
  /**
   * Worked out rather than stored. THIS MATTERS NOW: the sheet recalculated
   * Age, Experience and the rest every time it was opened. Once HRMS is the
   * master and the sheet stops, a stored 42.3 would sit there being wrong for
   * the rest of the person's service. So these are computed on read and
   * cannot be typed into.
   */
  derived?: (v: Record<string, string | null>) => string | null;
  hint?: string;
}

export interface FieldGroup {
  key: string;
  label: string;
  note?: string;
  /** Pay, bank and statutory identity. Kept out of the CSV unless asked for. */
  confidential?: boolean;
  fields: FieldSpec[];
}

/* ── status ─────────────────────────────────────────────────────────────── */

/**
 * The HR sheet's own six, in its own order and its own words.
 *
 * This replaces the yes/no "currently employed" tick. A boolean could not tell
 * a resignation from a dismissal, and could not hold the two states that are
 * neither — somebody serving notice is still on the roll, and so is a doubtful
 * case, but neither is simply "active".
 */
const STATUS_OPTIONS = [
  "Active",
  "Resigned",
  "Terminated",
  "Doubtful",
  "Notice Period",
  "F&F Due",
] as const;

/** Which of the six count as still employed. */
const ON_ROLL = new Set<string>(["Active", "Doubtful", "Notice Period"]);

/**
 * Is this person on the roll?
 *
 * Status decides it where there is one. Where there is not — and today there
 * mostly is not, because the parser folded the sheet's Status column into a
 * boolean and threw the word away — the boolean is all there is to go on.
 */
export function onRoll(value: Record<string, string | null>): boolean {
  const st = (value.status || "").trim();
  if (st) return ON_ROLL.has(st);
  return value.active !== "no";
}

/* ── the masters ─────────────────────────────────────────────────────────── */

/**
 * Every dropdown in HRIS and what it is called on screen.
 *
 * Order is the order Dr Raghu gave them. `fixed` marks the two whose values
 * are policy rather than history — a status or a type may be renamed, but the
 * set of them is not something to add to casually, because payroll and the
 * statutory filings both read it.
 */
export const MASTERS: { kind: string; label: string; note?: string; fixed?: boolean; special?: "competency" }[] = [
  { kind: "competency", label: "Competencies", special: "competency",
    note: "What somebody must be ABLE TO DO. Each carries a definition as well as a name — the name alone is a word people would each read differently, which is the thing a master exists to prevent. Roles point at these and set the level they need." },
  { kind: "department", label: "Department" },
  { kind: "grade", label: "Grade", note: "Empty until the Goalbook's grades are brought in — deliberately not guessed at." },
  { kind: "status", label: "Status", fixed: true, note: "Decides who is on the roll." },
  { kind: "type", label: "Type", fixed: true, note: "Decides payroll: employed types carry PF/ESIC/MLWF, contract types carry 2% TDS." },
  { kind: "location", label: "Job Location" },
  { kind: "qualification", label: "Qualification", note: "Seeded from what the master says today. Meant to be pruned to five or six." },
  { kind: "shirt_size", label: "Shirt Size" },
  { kind: "pant_size", label: "Pant Size" },
  { kind: "shoe_size", label: "Shoe Size" },
  { kind: "blood_group", label: "Blood Group" },
  { kind: "religion", label: "Religion" },
  { kind: "marital_status", label: "Marital Status" },
  { kind: "gender", label: "Gender" },
  { kind: "shift", label: "Shift" },
];

/* ── type ───────────────────────────────────────────────────────────────── */

/**
 * TYPE DECIDES PAYROLL. It is not a description of somebody, it is the rule
 * for how they are paid and what is deducted, so it is a fixed list of seven
 * and not a box to type in (Dr Raghu, 23 Aug 2026).
 *
 * The distinction that matters most is EMPLOYED vs ON A CONTRACT. An employee
 * of the company — Staff, Labour, Management — carries PF, ESIC, MLWF and the
 * rest. Somebody on a contract does not: 2% TDS comes off instead. Getting
 * this wrong is not a display error, it is a wrong salary and a statutory
 * filing that does not reconcile.
 */
export const TYPE_OPTIONS = [
  "Management",
  "Staff",
  "Labour",
  "Contractor",
  "Labour - Contract",
  "Trainee",
  "Staff - Contract",
] as const;

const TYPE_NOTES: Record<string, string> = {
  Management: "Employed by the company. Full statutory deductions.",
  Staff: "Company staff, permanent. PF, ESIC, MLWF and the rest apply.",
  Labour:
    "A FULL-TIME EMPLOYEE of the company, not an outsider — own PF, ESIC, MLWF, Medicare and every other formality.",
  Contractor: "Engaged rather than employed. No company statutory cover.",
  "Labour - Contract":
    "On a labour contract, not on the company's rolls. 2% TDS is deducted instead of the statutory set.",
  "Staff - Contract":
    "Staff engaged on a contract. 2% TDS is deducted instead of the statutory set.",
  Trainee: "An intern or trainee.",
};

/* ── helpers for the derived fields ─────────────────────────────────────── */

const monthsBetween = (iso: string | null | undefined, to = new Date()): number | null => {
  if (!iso) return null;
  const d = new Date(String(iso).slice(0, 10) + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  let m = (to.getFullYear() - d.getFullYear()) * 12 + (to.getMonth() - d.getMonth());
  if (to.getDate() < d.getDate()) m -= 1;
  return m < 0 ? null : m;
};

/** Years to one decimal — the form the HR sheet has always used. */
const yearsTo1 = (iso: string | null | undefined): string | null => {
  const m = monthsBetween(iso);
  return m === null ? null : (m / 12).toFixed(1);
};

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

/** The sheet's own five-year age bands. */
function ageBand(iso: string | null | undefined): string | null {
  const m = monthsBetween(iso);
  if (m === null) return null;
  const a = Math.floor(m / 12);
  if (a < 20) return "Under 20";
  if (a >= 60) return "60+";
  const lo = Math.floor(a / 5) * 5;
  return `${lo} - ${lo + 4}`;
}

/* ── the record, group by group ─────────────────────────────────────────── */

const t = (key: string, label: string, sheetHeader: string, kind: FieldKind = "text", hint?: string): FieldSpec =>
  ({ key, label, kind, sheetHeader, sheet: true, hint });

export const FIELD_GROUPS: FieldGroup[] = [
  {
    key: "identity",
    label: "Identity & role",
    fields: [
      { key: "name", label: "Name", kind: "text", column: "name", sheet: true },
      { key: "initials", label: "Initials", kind: "text", sheet: true, unique: true,
        hint: "Two or three letters, unique across everybody. The edit log signs itself with these." },
      { key: "user_email", label: "Genie user", kind: "user", sheet: true,
        hint: "The Genie login this person uses, if they have one. Chosen from the user list — it is how HRIS knows who actually uses Genie." },
      t("casual_name", "Known as", "Casual Name"),
      { key: "type", label: "Type", kind: "select", sheet: true, sheetHeader: "Type",
        options: [...TYPE_OPTIONS], master: "type", optionNotes: TYPE_NOTES,
        hint: "Decides how this person is paid and what is deducted. Employed types carry PF, ESIC and MLWF; contract types carry 2% TDS instead." },
      { key: "status", label: "Status", kind: "select", sheet: true, sheetHeader: "Status",
        options: [...STATUS_OPTIONS], master: "status",
        hint: "The master's own six. Active, Doubtful and Notice Period count as on the roll." },
      { key: "active", label: "On the roll", kind: "bool", column: "active", sheet: true,
        derived: (v) => (onRoll(v) ? "yes" : "no"),
        hint: "Follows the Status above — Active, Doubtful and Notice Period are on the roll." },
      { key: "doj", label: "Date of joining", kind: "date", column: "doj", sheet: true },
      { key: "department", label: "Department", kind: "select", column: "department", sheet: true, master: "department" },
      { key: "grade", label: "Grade", kind: "select", sheet: true, master: "grade" },
      { key: "role", label: "Roles", kind: "multi", sheet: true, master: "__roles__",
        hint: "ENFORCEABLE, and there can be MORE THAN ONE. Chosen from the role register — IDP → Roles, JD, KRA, KPI — where each role carries its job description, its deliverable and how it is measured. Somebody who holds two roles is accountable for both, and their IDP shows both." },
      { key: "designation", label: "Designation", kind: "text", column: "designation", sheet: true,
        hint: "What goes on the visiting card. Defaults to the Role and may be overwritten — it is vanity, and harmless as long as it is not mistaken for the role." },
      t("reporting_manager", "Reporting manager", "Reporting Manager"),
      { key: "location", label: "Job Location", kind: "select", column: "location", sheet: true, master: "location" },
      { key: "shift", label: "Shift", kind: "select", sheetHeader: "Shift", sheet: true, master: "shift" },
      t("skill_level", "Skill level", "Sikll Level"),
      t("in_lc", "In LC", "In LC"),
      t("coming_from", "Travels from", "Coming From"),
      t("bus_status", "Bus", "Bus Status"),
      t("khalapur_status", "Khalapur", "Khalapur Status"),
      { key: "experience_in_nandan", label: "Experience in Nandan", kind: "text", sheet: true,
        sheetHeader: "Experience in Nandan",
        derived: (v) => yearsTo1(v.doj),
        hint: "Years since joining. Worked out from the joining date every time this page opens." },
      { key: "total_months", label: "Total months here", kind: "number", sheet: true,
        sheetHeader: "Total Months in Nandan",
        derived: (v) => { const m = monthsBetween(v.doj); return m === null ? null : String(m); } },
    ],
  },
  {
    key: "contact",
    label: "Contact",
    fields: [
      { key: "email", label: "Work email", kind: "email", column: "email", sheet: true,
        hint: "Also the nandanerp login." },
      t("company_mobile", "Company mobile", "Company Mobile No", "tel"),
      { key: "phone", label: "Personal mobile", kind: "tel", sheetHeader: "PERSONAL Mobile No", sheet: true },
      t("personal_mobile_2", "Personal mobile 2", "PERSONAL Mobile No 2", "tel"),
      { key: "personal_email", label: "Personal email", kind: "email", sheetHeader: "Personal Mail ID", sheet: true,
        hint: "Where to write after somebody leaves." },
      t("whatsapp", "WhatsApp", "Whatsapp", "url"),
      t("company_handset", "Company handset", "Company Mobile Handset"),
      { key: "address", label: "Current address", kind: "long", sheetHeader: "Current Address", sheet: true },
      t("permanent_address", "Permanent address", "Permanent Address", "long"),
    ],
  },
  {
    key: "personal",
    label: "Personal",
    fields: [
      { key: "dob", label: "Date of birth", kind: "date", column: "dob", sheet: true,
        hint: "Drives the birthday list on My Week — which now reads this record, not the sheet." },
      { key: "age", label: "Age", kind: "text", sheet: true, sheetHeader: "Age",
        derived: (v) => yearsTo1(v.dob), hint: "Worked out from the date of birth." },
      { key: "age_group", label: "Age group", kind: "text", sheet: true, sheetHeader: "Age Group",
        derived: (v) => ageBand(v.dob) },
      { key: "birthday_month", label: "Birthday month", kind: "text", sheet: true, sheetHeader: "Month of Birthday",
        derived: (v) => { const d = v.dob; if (!d) return null; const m = Number(String(d).slice(5, 7)); return MONTHS[m - 1] ?? null; } },
      { key: "gender", label: "Gender", kind: "select", sheetHeader: "Gender", sheet: true, master: "gender" },
      { key: "marital", label: "Marital status", kind: "select", sheetHeader: "Marital Status", sheet: true, master: "marital_status" },
      { key: "religion", label: "Religion", kind: "select", sheetHeader: "Religion", sheet: true, master: "religion" },
      { key: "blood_group", label: "Blood group", kind: "select", sheetHeader: "Blood Group", sheet: true, master: "blood_group" },
      { key: "qualification", label: "Qualification", kind: "select", sheetHeader: "Qualification", sheet: true, master: "qualification" },
      t("exp_before", "Experience before Nandan", "Experience BEFORE Nandan", "text", "Years."),
      { key: "shirt_size", label: "Shirt size", kind: "select", sheetHeader: "Shirt Size", sheet: true, master: "shirt_size" },
      { key: "pant_size", label: "Pant size", kind: "select", sheetHeader: "Pant Size", sheet: true, master: "pant_size" },
      { key: "shoe_size", label: "Shoe size", kind: "select", sheetHeader: "Shoe Size", sheet: true, master: "shoe_size" },
      t("vaccine_1", "Vaccine 1", "Vaccine 1 Date", "date"),
      t("vaccine_2", "Vaccine 2", "Vaccine 2 Date", "date"),
    ],
  },
  {
    key: "family",
    label: "Family & next of kin",
    fields: [
      { key: "emergency_name", label: "Next of kin", kind: "text", sheetHeader: "Next of Kin (NOK)", sheet: true },
      t("nok_relation", "Relationship", "NOK Relation"),
      { key: "emergency_phone", label: "Next of kin contact", kind: "tel", sheetHeader: "Next Of Kin Contact", sheet: true },
      t("spouse", "Spouse", "Spouse"),
      t("child_1", "1st child", "1st Child"),
      t("child_2", "2nd child", "2nd Child"),
      t("child_3", "3rd child", "Child 3"),
      t("anniversary", "Wedding anniversary", "Wedding Anniversary", "date"),
      t("family_updated", "Family details updated", "Family Details update as on", "date"),
    ],
  },
  {
    key: "statutory",
    label: "Statutory",
    confidential: true,
    note: "Government identity numbers. Never leaves this page except in a CSV you deliberately ask to include them in.",
    fields: [
      t("pf_no", "PF No", "PF No"),
      t("uan_no", "UAN No", "UAN No"),
      t("uan_name", "UAN name", "UAN Name"),
      t("aadhaar", "Aadhaar No", "AADHAR No"),
      t("pan", "PAN No", "PAN No"),
      t("esic_eligible", "ESIC eligible", "ESIC Eligible"),
      t("esic_no", "ESIC No", "ESIC No"),
      t("mlwf", "MLWF LIN No", "MLWF LIN No"),
      t("income_tax", "Income tax applicable", "Income Tax Applicable in 2024-25"),
    ],
  },
  {
    key: "pay",
    label: "Pay",
    confidential: true,
    fields: [
      t("days_paid", "Days paid", "Days Paid", "number"),
      t("basic_da", "Basic and DA", "Basic and DA", "money"),
      t("hra", "HRA", "HRA", "money"),
      t("fixed_allowance", "Fixed allowance", "Fixed Allowance", "money"),
      t("conveyance", "Conveyance", "Conveyance", "money"),
      t("medical_allowance", "Medical allowance", "Medical Allowance", "money"),
      t("site_allowance", "Site allowance", "Site Allowance", "money"),
      t("gross", "Gross salary", "Gross Salary", "money"),
      t("per_day_rate", "Per day rate", "Per Day Rate", "money"),
      t("gross_2024_26", "Gross 2024-26", "Gross Salary 2024-26", "money"),
      t("gross_2024_25", "Gross 2024-25", "Gross Salary 2024-25", "money"),
      t("gross_2023_24", "Gross 2023-24", "Gross Salary 2023-24", "money"),
      t("gross_2022_23", "Gross 2022-23", "Gross Salary 2022-23", "money"),
      t("gross_2021_22", "Gross 2021-22", "Gross Sal 2021-22", "money"),
      t("gross_2020_21", "Gross 2020-21", "Gross Sal 2020-21", "money"),
    ],
  },
  {
    key: "bank",
    label: "Bank",
    confidential: true,
    fields: [
      t("name_in_bank", "Name in bank", "Name in bank"),
      t("bank_name", "Bank", "Bank Name"),
      t("account_no", "Account No", "Account No"),
      t("account_15", "Account No (15 digit)", "Account No.15 Digit"),
      t("branch", "Branch", "Branch"),
      t("ifsc", "IFSC", "IFSC Code"),
    ],
  },
  {
    key: "benefits",
    label: "Benefits, loan & leave",
    confidential: true,
    fields: [
      t("mediclaim_premium", "Mediclaim premium", "Mediclaim Premium", "money"),
      t("mediclaim_id", "Mediclaim ID", "Mediclaim ID"),
      t("lic_policy", "LIC policy", "LIC Policy Number"),
      t("lic_premium", "LIC premium", "LIC Premium", "money"),
      t("lic_sum", "LIC sum assured", "LIC Sum Assuared", "money"),
      t("loan_as_on", "Loan outstanding", "Loan as on 31st June 2026", "money"),
      t("leave_as_on", "Leave balance", "Leave as on 31st june 2026", "number"),
      t("referral", "Referred by", "Referal Employee"),
      t("cheque_ubi", "UBI cheque no. / dated", "Cheque no.    of Union Bank of India dtd."),
    ],
  },
  {
    key: "documents",
    label: "Documents",
    note:
      "LINKS ONLY. No document is ever stored in the database — every one of them lives in the employee's own folder on Drive, and what is kept here is the address. That way there is one copy, it is where the rest of HR's paper already is, and Genie holds nothing it would have to be trusted with.",
    fields: [
      { key: "drive_folder_name", label: "Drive Folder name", kind: "text", sheet: false,
        hint: "What the folder is CALLED in Drive — “Active - 6001 - Jagdishchandra Kumar”. The name is how it is found at a glance; it has no bearing on the link, which never changes. When somebody leaves, this must become “Inactive - …” before their file can be closed." },
      { key: "drive_folder", label: "Drive Folder", kind: "url", sheet: false,
        hint: "The person's own folder on Drive — salary slips, continuity letters, IDP, contracts, everything. Named “Active - <EmployeeID> - <Name>”, or “Inactive - …” once they have left. The NAME and the LINK have nothing to do with each other: the link never changes, the name is what makes the folder findable in Drive at a glance." },
      { key: "doc_photo", label: "Passport photograph", kind: "url", sheet: true, sheetHeader: "Passport Photo" },
      { key: "doc_aadhaar", label: "Aadhaar card", kind: "url", sheet: false },
      { key: "doc_pan", label: "PAN card", kind: "url", sheet: false },
      { key: "doc_bank", label: "Bank proof / cancelled cheque", kind: "url", sheet: false },
      { key: "doc_education", label: "Education certificates", kind: "url", sheet: false },
      { key: "doc_offer", label: "Offer / appointment letter", kind: "url", sheet: false },
      { key: "doc_other", label: "Other documents", kind: "url", sheet: false },
    ],
  },
  {
    key: "performance",
    label: "Performance",
    fields: [
      t("evaluation", "Evaluation", "Evaluation"),
      t("idp_link", "IDP link in ERP", "IDP Link inERP", "url"),
      t("idp_pdf", "Latest IDP PDF", "Latest IDP PDF", "url"),
      t("latest_work_resp", "Latest work responsibility", "Latest Work Responsibility", "long"),
      t("attendance_pct", "Attendance %", "Attendance %"),
      t("late_pct", "Late coming %", "Late Coming %"),
    ],
  },
  {
    key: "exit",
    label: "Leaving",
    note: "Filled only when somebody goes. “Active” in these columns is the sheet's way of saying not applicable.",
    fields: [
      t("leaving_date", "Leaving date", "Leaving Date"),
      t("left_date", "Left date", "Left Date"),
      t("leaving_reason", "Reason", "Leaving Reason", "long"),
      t("gratuity_years", "Years for gratuity", "Years (Application on Gratuity", "number"),
      t("gratuity_amount", "Gratuity liability", "Risk ( Gratiuty Amount)", "money"),
    ],
  },
  {
    key: "hr",
    label: "HR notes",
    note: "Genie's own. The sheet never carried these.",
    fields: [
      { key: "notes", label: "HR notes", kind: "long", sheet: false,
        hint: "Read by whoever can open HRMS. Nobody else, including the person." },
      { key: "file_name", label: "File reference", kind: "text", sheetHeader: "File Name", sheet: true },
      t("last_update_date", "Master last updated", "Last Update Date"),
    ],
  },
];

export const ALL_FIELDS: FieldSpec[] = FIELD_GROUPS.flatMap((g) => g.fields);

/** A "multi" value is one entry per line. Empty lines are not entries. */
export const splitMulti = (v: string | null | undefined): string[] =>
  String(v || "").split("\n").map((x) => x.trim()).filter(Boolean);

export const joinMulti = (list: string[]): string | null =>
  list.map((x) => x.trim()).filter(Boolean).join("\n") || null;

const BY_KEY = new Map(ALL_FIELDS.map((f) => [f.key, f]));

/** The whitelist. An unknown field name is refused rather than stored. */
export const fieldSpec = (key: string): FieldSpec | undefined => BY_KEY.get(key);

/** Every sheet header the catalogue claims — the rest stay on the Sheet tab. */
export const CLAIMED_HEADERS = new Set(
  ALL_FIELDS.map((f) => f.sheetHeader).filter(Boolean) as string[],
);

/** The eight named columns on hrms_employees. */
export const NAMED_COLUMNS = ["name", "email", "dob", "doj", "department", "designation", "location", "active"] as const;

/** One employee, sheet value and override merged, as the screen wants it. */
export interface HrmsEmployee {
  id: string;
  /** The merged value of every catalogued field — overrides applied. */
  value: Record<string, string | null>;
  /** What lies underneath an override, for the fields that carry one. */
  sheet: Record<string, string | null>;
  /** Which fields carry an override, who set it, and whether it is agreed. */
  edited: Record<string, { by: string | null; at: string; pending?: boolean }>;
  /** Sheet columns the catalogue does NOT claim — nothing is hidden. */
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
export const resolveHrmsAccess = (admin: SupabaseClient, email: string, isOwner: boolean) =>
  hasGrant(admin, "hrms_access", email, isOwner);

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
