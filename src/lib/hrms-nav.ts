/**
 * The HRMS navigation, exactly as Dr Raghu specified it on 22 Aug 2026.
 *
 * ONE DECLARATION, read by the left nav and by the router in Hrms.tsx, so a
 * module cannot exist in the menu and nowhere else, or the reverse.
 *
 * `built: false` is not a placeholder in the apologetic sense. Most of these
 * modules have real source material sitting in the HR sheets today (see
 * docs/HR-SOURCE-DOCUMENTS.md), and each empty pane says what will go there
 * and where it comes from. An empty module that explains itself is worth
 * more than one that is hidden until the day it is finished — it is how
 * somebody checks the plan against what they actually wanted.
 */

export interface NavItem {
  key: string;
  label: string;
  /** Shown in the pane header, under the title. */
  blurb?: string;
  /** false = the screen is not built yet and says so. */
  built?: boolean;
  /** Where the data lives today, for a module not yet built. */
  source?: string;
}

export interface NavSection {
  key: string;
  label: string;
  icon: string;
  /** A section with no children is itself the destination. */
  items?: NavItem[];
  blurb?: string;
  built?: boolean;
  source?: string;
}

export const NAV: NavSection[] = [
  {
    key: "playbook",
    label: "HR Playbook",
    icon: "📖",
    built: true,
    blurb: "Documents in, one living wiki out — Claude the categoriser, compiled at midnight or on the button.",
  },
  {
    key: "master",
    label: "HRIS · Employee Master",
    icon: "👥",
    items: [
      {
        key: "master.active",
        label: "Active Employees",
        blurb: "Everybody on the roll today. The default view.",
        built: true,
      },
      {
        key: "master.past",
        label: "Past Employeemaster 2025-26",
        blurb:
          "Everybody who was on the roll during FY 2025-26 — joined on or before 31 March 2026, whether or not they are still here.",
        built: true,
      },
      {
        key: "master.left",
        label: "Left Employees",
        blurb: "No longer on the roll. Kept, never deleted.",
        built: true,
      },
    ],
  },
  {
    key: "card",
    label: "Individual Report Card",
    icon: "🪪",
    blurb: "One person, one page — record, role, IDP, appraisal history, ready to print for the file.",
    built: false,
    source:
      "Employee Report Card (tab 7) in the Main Salary Sheet, and the Individual Report Card tab in the 2026 Appraisal workbook.",
  },
  {
    key: "idp",
    label: "IDP",
    icon: "🎯",
    items: [
      {
        key: "idp.roles",
        label: "Roles, JD, KRA, KPI",
        blurb: "What each role is for, what it must deliver, and how that is measured. The employee master's Role points here.",
        built: true,
      },
      {
        key: "idp.individual",
        label: "Individual IDP (current and past)",
        blurb: "What each person wrote at /idp — answers, self-ratings, recordings, attachments, and what they asked to be paid.",
        built: true,
      },
    ],
  },
  {
    key: "appraisal",
    label: "Appraisal",
    icon: "📈",
    items: [
      {
        key: "appraisal.table",
        label: "Appraisal Table",
        blurb: "Everybody on one row: previous gross, new gross, increase and %, and where each IDP stands. The click opens the Report Card.",
        built: true,
      },
      {
        key: "appraisal.card",
        label: "Individual Report Card for Appraisal and Edits",
        blurb: "The desk the appraisal discussion happens at — self IDP, manager's view, the finalised document, and the money.",
        built: true,
      },
      {
        key: "appraisal.summary",
        label: "Appraisal Summary Data Analytics",
        blurb: "The CHRO wall: the money, the bell curve, department costs, outliers, gaps, and the PIP screen.",
        built: true,
      },
      {
        key: "appraisal.interviews",
        label: "Appraisal Interviews (Audit of each)",
        blurb: "Two conversations per person — Self and Manager. Was each held, by whom, when, and what was said, voice notes included.",
        built: true,
      },
    ],
  },
  {
    key: "reports",
    label: "Regular Reports",
    icon: "🗓",
    items: [
      { key: "reports.intention", label: "Intention Statement", built: false, source: "Intension Statement (tab 21) — named in both sheets and empty in both. Nothing to migrate; it can be designed cleanly." },
      { key: "reports.daily", label: "Daily Reporting", built: false, source: "Daily Reporting (tab 19) — likewise empty today." },
      { key: "reports.weekly", label: "Weekly Reporting", built: false },
      { key: "reports.monthly", label: "Monthly Reporting", built: false },
      { key: "reports.quarterly", label: "Quarterly Reporting", built: false },
      { key: "reports.121", label: "1-2-1 Meetings", built: false, blurb: "Who met whom, when, and what was agreed." },
    ],
  },
  {
    key: "memos",
    label: "Memos",
    icon: "📝",
    blurb: "Letters and notices issued to a person, kept against their record.",
    built: false,
  },
  {
    key: "queries",
    label: "HR Queries",
    icon: "❓",
    blurb: "A question put to HR, and the answer it got. Raised by anybody, owned by somebody, closed with a reply — and once closed, worth publishing so the next person does not have to ask.",
    built: false,
    source: "HR Queries (tab 48) in the Main Salary Sheet. Answered ones become Policy → HR Queries Solved.",
  },
  {
    key: "payroll",
    label: "Run Monthly Payroll",
    icon: "▶️",
    blurb: "The month's run: days paid, the deductions each Type attracts, and the sheet that comes out of it. What Type says decides what is deducted — employed types carry PF, ESIC and MLWF; contract types carry 2% TDS.",
    built: false,
    source: "Salary Processing Checklist (tab 16) and the monthly Salary Sheets (tab 14). The pay and statutory fields on every record already hold what a run needs.",
  },
  {
    key: "salary",
    label: "Finalized Salary Sheets",
    icon: "💰",
    items: [
      {
        key: "salary.sheets", label: "Salary Sheets",
        blurb: "One row per month: the file, the split, the totals, and the date RJ froze it. The register, the slips and the returns all start here.",
        built: true,
      },
      {
        key: "salary.slips", label: "Salary Slips",
        blurb: "Every slip of every frozen month — who earned what, who was paid what, and the date each person first opened their own slip.",
        built: true,
      },
      {
        key: "salary.statutory", label: "Statutory Records",
        blurb: "PF, PT, MLWF, ESIC and TDS returns, month by month — available once the month is frozen, read from the sheet alone.",
        built: true,
      },
    ],
  },
  {
    key: "registers",
    label: "Registers",
    icon: "📚",
    items: [
      { key: "registers.leave", label: "Leave Ledger", blurb: "Opening balance, taken, accrued, closing — per person, per year.", built: false,
        source: "Leave Applications - Approved (tab 22) and “Leave as on” on the master." },
      { key: "registers.loan", label: "Loan Ledger", blurb: "Sanctioned, instalments recovered, outstanding.", built: false,
        source: "Loan Register April 2024 onwards (tab 8) and Loan Applications (tab 29); “Loan as on” sits on the master." },
      { key: "registers.changes", label: "Addition Deletion of Records", blurb: "Every joiner and every leaver, one line each. Who was added, who was removed, when, and by whom.", built: false,
        source: "HRIS already writes this — every change to a record is in hrms_employee_edit_log. This register is that log, read as a joiners-and-leavers list rather than a field history." },
    ],
  },
  {
    key: "approvals",
    label: "Approvals",
    icon: "✅",
    items: [
      { key: "approvals.commercial", label: "RJ Approval - Commercial", blurb: "Salary decisions and loan requests — waiting on one side, settled with both dates on the other.", built: true },
      { key: "approvals.records", label: "RJ Approval - Records", blurb: "Role definitions changed since they were last seen. Nothing HR writes is taken as agreed until it has been read here.", built: true },
      { key: "approvals.salary", label: "RJ Approval - Salary Queries", blurb: "Where HR raises a question for discussion and a decision — raised, talked through, answered, closed.", built: true },
    ],
  },
  {
    key: "offers",
    label: "Offer Letters",
    icon: "📨",
    blurb: "Six pages from the resume to the mail: the person, the role, the money, the terms, our notes, and the letter itself.",
    built: true,
  },
  {
    key: "fnf",
    label: "Full and Final Settlements",
    icon: "🧾",
    blurb: "The reckoning that ends one. Awaiting Dr Raghu's description before it is built.",
    built: false,
  },
  {
    key: "policy",
    label: "Policy",
    icon: "📗",
    items: [
      { key: "policy.handbook", label: "Employee Handbook", blurb: "Editable, versioned and acknowledged. The first module that needs a rich-text editor.", built: false,
        source: "Employee Handbook v 13.0 (tab 46)." },
      { key: "policy.faqs", label: "FAQs", blurb: "The questions that come up every month, answered once.", built: false,
        source: "FAQ (tab 13)." },
      { key: "policy.solved", label: "HR Queries Solved", blurb: "Closed queries, published. A query answered privately helps one person; the same answer here helps everyone who was going to ask it next.", built: false,
        source: "Fed by HR Queries above." },
    ],
  },
  {
    key: "muster",
    label: "Attendance Muster",
    icon: "📋",
    blurb: "Days paid, attendance %, late coming %.",
    built: false,
    source: "Attendance Muster (tab 15), one tab per month, plus the 2025 muster.",
  },
  {
    key: "punch",
    label: "Employee Punch Records",
    icon: "🕒",
    items: [
      { key: "punch.leave", label: "Leave Application", blurb: "Applied for, approved by, balance before and after.", built: false, source: "Leave Applications - Approved (tab 22) and “Leave as on” on the master." },
      { key: "punch.loan", label: "Loan Application", blurb: "Requested, sanctioned, and what is still outstanding.", built: false, source: "Loan Applications (tab 29) and Loan Register April 2024 onwards (tab 8); “Loan as on” sits on the master." },
      { key: "punch.expense", label: "Expense Claim", blurb: "Claimed, approved, paid.", built: false },
      { key: "punch.suggestions", label: "Suggestions", blurb: "Anybody may raise one; somebody must answer it.", built: false },
      { key: "punch.grievance", label: "Grievance", blurb: "Raised in confidence, tracked to a close.", built: false },
      { key: "punch.outdoor", label: "Outdoor Attendance Mark", blurb: "Marking a day worked away from the plant — site, customer, travel.", built: false },
      { key: "punch.regularize", label: "Regularization of Attendance", blurb: "Correcting a punch that the machine got wrong or nobody made.", built: false, source: "Attendance Muster (tab 15) is what a regularisation ultimately corrects." },
    ],
  },
  {
    key: "mis",
    label: "Salary MIS Report",
    icon: "📊",
    blurb: "Headcount and cost by type, department and month.",
    built: false,
    source: "Salary MIS 2025-26 (3), MIS of Current Demographic (2), Summary Data Analysis (42).",
  },
  {
    key: "todos",
    label: "HR Departmental ToDos",
    icon: "✅",
    blurb: "The HR department's own tasks — the same tasks as Nandan Tasking, shown here on their own.",
    built: false,
    source: "Genie's own manual_tasks and erp_tasks, filtered to HR & Admin. Not a second list — the same one, seen from here.",
  },
];

NAV.push({
  key: "masters",
  label: "Module Masters",
  icon: "🗃",
  blurb: "Every dropdown in HRIS — Role, Department, Grade, Status, Type, Job Location, Qualification, sizes, Blood Group, Religion, Marital Status, Gender and Shift.",
  built: true,
});

NAV.push({
  key: "texts",
  label: "Masters — Standard Texts",
  icon: "📜",
  blurb: "The paragraphs that go into letters: the terms of employment, and the covering note that carries an offer out. Written once here; each letter keeps the copy it used.",
  built: true,
});

/** Flattened, for the router. */
export const NAV_ITEMS: { key: string; label: string; section: string; item?: NavItem; sec: NavSection }[] =
  NAV.flatMap((s) =>
    s.items
      ? s.items.map((i) => ({ key: i.key, label: i.label, section: s.label, item: i, sec: s }))
      : [{ key: s.key, label: s.label, section: s.label, sec: s }],
  );

export const DEFAULT_KEY = "master.active";

export function findNav(key: string) {
  return NAV_ITEMS.find((n) => n.key === key) || NAV_ITEMS.find((n) => n.key === DEFAULT_KEY)!;
}
