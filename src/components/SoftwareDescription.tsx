"use client";

/**
 * ADMIN → SOFTWARE DESCRIPTION
 *
 * What Genie is, made auditable.
 *
 * This page exists for two readers who are not the same person. The first is
 * whoever picks Genie up next -- a developer, or a Claude session six months
 * from now -- and needs the shape of the thing before they touch it. The
 * second is an ISO 27001 auditor, who does not care how it works and cares
 * enormously about who can reach what, where the data physically sits, and how
 * a change gets from somebody's head into production.
 *
 * THE STRUCTURE IS REPEATABLE, and that is the point of MODULES below. Every
 * module is described with the SAME eight fields -- space, purpose, who, gate,
 * screens, data, api, ai. A new module is a new row, not a new format. When
 * the CRM lands it slots in beside the rest and the document stays true
 * without being rewritten.
 *
 * WHAT IS LIVE AND WHAT IS WRITTEN DOWN. The version, the release count and
 * the effort figures are read from src/lib/changelog.ts, so they cannot drift.
 * Everything else is prose and must be maintained by hand -- so it is dated,
 * and every claim that could go stale is written as a statement somebody can
 * check rather than a reassurance.
 *
 * NOTHING SECRET GOES ON THIS PAGE. No keys, no connection strings, no
 * account names beyond the ones already visible in the app. It names WHERE a
 * secret lives, never what it is.
 */

import { APP_VERSION, UPDATES, EFFORT } from "@/lib/changelog";

/** Last hand-revision of the prose on this page. Bump it when you edit. */
const DOC_REVISED = "3 September 2026";

const NAVY = "#16232F";
const INK = "#22303C";
const MUTED = "#8A94A0";
const BORDER = "#E2E0DA";
const ORANGE = "#E8600A";
const AMBER = "#F5B32B";
const RED = "#C0392B";

/* ══════════════════════ measured facts about the codebase ══════════════════
   Counted, not remembered. Re-count with the commands in the comment beside
   each one; if a figure here disagrees with the command, the command is right
   and this block is stale.                                                 */
const SIZE = {
  /** find src/app/api -name route.ts | wc -l */
  apiRoutes: 52,
  /** ls supabase/migrations/*.sql | wc -l */
  migrations: 46,
  /** create-table statements across every migration, de-duplicated */
  tables: 69,
  /** ls src/components/*.tsx | wc -l */
  components: 16,
  /** storage.buckets rows inserted by the migrations */
  buckets: 4,
  /** git log --oneline | wc -l */
  commits: 131,
};

/* ═══════════════════════════ the repeatable unit ═══════════════════════════ */

interface ModuleSpec {
  /** What it is called on screen. */
  name: string;
  /** Which Space it lives in — see SPACES. */
  space: string;
  /** Introduced at this version. */
  since: string;
  /** One sentence: the question this module answers. */
  purpose: string;
  /** Who can open it, in plain words. */
  who: string;
  /** The server-side check that enforces it. UI hiding is never the gate. */
  gate: string;
  /** The main screens or tabs inside it. */
  screens: string[];
  /** Postgres tables it reads or writes. */
  data: string[];
  /** The API routes behind it. */
  api: string[];
  /** What, if anything, a language model does here. */
  ai: string;
}

const MODULES: ModuleSpec[] = [
  {
    name: "My Week",
    space: "Planning Suite",
    since: "3.2.0.0",
    purpose: "The landing page: what one person has to deal with this week, before they go looking for it.",
    who: "Everyone signed in, except the uploader.",
    gate: "requireUser()",
    screens: ["My numbers", "My open tasks", "Deliveries this week", "My learning", "My participation", "How's my day", "Quote of the day"],
    data: ["manual_tasks", "erp_tasks", "jobs", "lms_progress", "day_mood", "image_quote"],
    api: ["/api/my-week", "/api/today", "/api/image-quote"],
    ai: "None.",
  },
  {
    name: "Jobs in Progress",
    space: "Planning Suite",
    since: "3.2.0.0",
    purpose: "Every live job and every live project, with the money and the dates on the same row.",
    who: "Every reader. The forward-looking money cards are Stratcom only.",
    gate: "requireReader(); requireStratcom() for the run-rate cards",
    screens: ["Jobs in Progress", "Projects in Progress", "Required run rate", "New sales needed"],
    data: ["jobs", "projects", "fy_targets", "delivered_jobs"],
    api: ["/api/board", "/api/run-rate"],
    ai: "None.",
  },
  {
    name: "Job Delivery Board",
    space: "Planning Suite",
    since: "2.x",
    purpose: "When each job is due, how late it is, and what the plan says about it.",
    who: "Every reader; editors may change the plan.",
    gate: "requireReader() to read, requirePlanner() to write",
    screens: ["Board", "Calendar", "Delivery outlook"],
    data: ["jobs", "plans", "milestones", "baseline_milestones"],
    api: ["/api/board", "/api/plan", "/api/milestone/toggle", "/api/baseline"],
    ai: "None.",
  },
  {
    name: "Pending Material",
    space: "Planning Suite",
    since: "3.8.0.0",
    purpose: "Every kitting line still short, across every job, in one table — what is holding up the next month.",
    who: "Every reader; editors may update a line.",
    gate: "requireReader() / requirePlanner()",
    screens: ["Pending material"],
    data: ["materials", "material_comment", "jobs"],
    api: ["/api/materials"],
    ai: "None.",
  },
  {
    name: "Escalations",
    space: "Planning Suite",
    since: "3.8.0.0",
    purpose: "Every open escalation with its reason, its date history, and the note on what would prevent it next time.",
    who: "Every reader.",
    gate: "requireReader()",
    screens: ["Escalations", "Close-out notes"],
    data: ["manual_tasks", "task_closeout", "task_date_log"],
    api: ["/api/tasks", "/api/closeouts", "/api/task-dates"],
    ai: "None.",
  },
  {
    name: "Load Board",
    space: "Planning Suite",
    since: "2.x",
    purpose: "How much work sits on each person and each department, over time.",
    who: "Every reader.",
    gate: "requireReader()",
    screens: ["Load board"],
    data: ["jobs", "manual_tasks", "erp_tasks", "profiles", "departments"],
    api: ["/api/board"],
    ai: "None.",
  },
  {
    name: "Job Plan",
    space: "Planning Suite",
    since: "2.x",
    purpose: "One job, end to end: milestone plan, material kitting, shop updates, photos, tasks, comments and the written brief.",
    who: "Every reader; editors may plan. Management Target Date is the owner's field alone.",
    gate: "requireReader() / requirePlanner(); mgmt guarded in /api/job-field and by a DB trigger",
    screens: ["Milestone Plan", "Material Kitting", "Shop Updates", "Photos", "Tasks", "Genie Hint"],
    data: ["jobs", "plans", "milestones", "materials", "job_voice_note", "job_photo", "manual_tasks", "task_comments", "job_hint", "erp_update"],
    api: ["/api/plan", "/api/materials", "/api/job-field", "/api/job-photo", "/api/voice-note", "/api/genie-hint", "/api/comments"],
    ai: "Genie Hint — Claude writes the brief from the assembled facts; the result is cached in job_hint against the model that wrote it.",
  },
  {
    name: "On Floor",
    space: "Planning Suite",
    since: "3.11.0.0",
    purpose: "Every job being worked on right now, what the shop said about it today, and who to ring when it goes wrong.",
    who: "Every reader. Only Stratcom may set the on-floor flag.",
    gate: "requireReader(); requireStratcom() to flag a job",
    screens: ["Shop updates today", "The read on this job", "Five owners", "Voice notes", "Photos", "Suggested tasks"],
    data: ["jobs", "job_voice_note", "job_photo", "task_proposal", "floor summary fields on jobs"],
    api: ["/api/on-floor", "/api/voice-note", "/api/job-photo", "/api/task-proposal"],
    ai: "Voice notes are transcribed and read by Claude, which writes the job's read and proposes tasks. Nothing is created until a person presses Add.",
  },
  {
    name: "Delivered Jobs",
    space: "Delivered Jobs",
    since: "2.8.0.0",
    purpose: "What has actually gone out — value, throughput, on-time delivery, by month, family and customer.",
    who: "The Leadership Circle only.",
    gate: "requireLC()",
    screens: ["Delivered feed", "Analysis", "OTD", "Anticipated FY"],
    data: ["delivered_jobs", "fy_targets", "jobs"],
    api: ["/api/delivered", "/api/delivered/recent", "/api/run-rate"],
    ai: "None.",
  },
  {
    name: "Goals",
    space: "Goals",
    since: "2.7.0.0",
    purpose: "The OPSP cascade — company goals, quarterly rocks, departmental goals, KRAs and KPIs — with live-fed key results.",
    who: "Explicit grant only. Not a role.",
    gate: "goal_access grant, checked server-side; owner implicit",
    screens: ["Company Goals", "Quarterly Rocks", "Departmental Goals", "My Goals", "My KRAs", "KPIs relevant to me", "Swimlane kanban"],
    data: ["goal_node", "goal_item", "goal_band", "goal_csf_link", "csf", "kra", "kpi", "kpi_watcher", "rock_project", "opsp_section", "person_band", "swimlanes", "goal_access", "goal_node_comment", "goal_item_comment"],
    api: ["/api/goals", "/api/goals-v2", "/api/goals/access", "/api/admin/goal-access", "/api/admin/swimlanes"],
    ai: "None.",
  },
  {
    name: "Nandan Tasking",
    space: "Nandan Tasking",
    since: "2.x",
    purpose: "Tasks per job and per person, on a board and an ISO-week calendar, plus a private Brain Dump pad.",
    who: "Every reader; taskers may write.",
    gate: "requireReader() / requireTasker(); brain_dump is per-person under RLS",
    screens: ["Board", "Calendar", "By Projects", "Brain Dump"],
    data: ["manual_tasks", "erp_tasks", "task_comments", "task_date_log", "task_closeout", "brain_dump"],
    api: ["/api/tasks", "/api/comments", "/api/task-dates", "/api/brain-dump"],
    ai: "None.",
  },
  {
    name: "Sales Genie",
    space: "Sales Genie",
    since: "2.x",
    purpose: "My Sales Plan (pipeline, companies, industries, people, locations, products, process) and the Sales Regrow playbook.",
    who: "Explicit grant only. Not a role.",
    gate: "sales_access grant, checked server-side; owner implicit",
    screens: ["My Sales Plan", "Playbook"],
    data: ["sp_companies", "sp_deals", "sp_industries", "sp_people", "sp_products", "sp_settings", "sp_support", "sp_todos", "sales_access", "sales_content"],
    api: ["/api/sales/plan", "/api/sales/html", "/api/sales/access", "/api/sales/plan/session", "/api/sales/plan/notify", "/api/eva/research", "/api/deals/score"],
    ai: "EVA company research and AI deal scoring, both Claude. Both fail cleanly with a stated reason when the key is absent.",
  },
  {
    name: "LMS",
    space: "LMS",
    since: "3.1.0.0",
    purpose: "Books, sections and lessons, with per-person progress and a generated learning plan.",
    who: "Every reader.",
    gate: "requireReader()",
    screens: ["Books", "Sections", "Lessons", "My plan", "Progress"],
    data: ["lms_book", "lms_section", "lms_lesson", "lms_lesson_book", "lms_progress", "lms_plan", "lms_extra"],
    api: ["/api/lms", "/api/lms/plan"],
    ai: "The learning plan is written by Claude from what the person has already read.",
  },
  {
    name: "Consult Raghu",
    space: "Consult Raghu",
    since: "3.10.0.0",
    purpose: "Ask a question and get an answer grounded in today's actual board, not in general advice.",
    who: "Every reader.",
    gate: "requireReader()",
    screens: ["Ask"],
    data: ["reads the board; stores nothing"],
    api: ["/api/consult"],
    ai: "Claude, with the live figures sent alongside the question. The conversation is not persisted.",
  },
  {
    name: "Principles",
    space: "Principles",
    since: "3.10.0.0",
    purpose: "How decisions here are meant to be reached — the written principles, their source documents and files.",
    who: "Every reader; the owner curates.",
    gate: "requireReader(); requireOwner() to change",
    screens: ["Principles", "Source document", "Files"],
    data: ["principles", "principle_doc", "principle_file"],
    api: ["/api/principles", "/api/principles/files"],
    ai: "Claude groups and drafts principles from the source document; a person accepts them.",
  },
  {
    name: "Morning Update",
    space: "Account menu",
    since: "2.x",
    purpose: "The one door data comes in by: the morning Excel from the ERP, parsed and merged.",
    who: "The uploader account and admins.",
    gate: "requireUploader()",
    screens: ["Upload", "Batch history", "Merge result"],
    data: ["jobs", "projects", "erp_tasks", "import_batches", "hrms_employees", "units", "departments"],
    api: ["/api/upload", "/api/upload-status"],
    ai: "None.",
  },
  {
    name: "Update to ERP",
    space: "Account menu",
    since: "3.4.0.0",
    purpose: "The queue of corrections made in Genie that still have to be typed back into the ERP.",
    who: "Editors.",
    gate: "requirePlanner()",
    screens: ["Pending", "History"],
    data: ["erp_update"],
    api: ["/api/erp-update", "/api/job-field"],
    ai: "None.",
  },
  {
    name: "Feature Requests",
    space: "Account menu",
    since: "3.15.0.0",
    purpose: "Anyone may ask for something in Genie, with attachments and a stated priority. Everyone can read the whole list.",
    who: "Everyone signed in. Only the owner sets a status.",
    gate: "requireUser(); requireOwner() to set status",
    screens: ["Raise a request", "The list"],
    data: ["feature_request", "feature_file"],
    api: ["/api/feature"],
    ai: "None.",
  },
  {
    name: "Admin",
    space: "Account menu",
    since: "2.x",
    purpose: "Users, org chart, milestone templates, settings, the review report, the release log and this page.",
    who: "Admins. Anything touching another admin is the owner's alone.",
    gate: "requireAdmin(); requireOwner() for admin-on-admin changes, enforced again by a DB trigger",
    screens: ["Users", "Org Chart", "Milestones", "Settings", "Report", "Updates", "Software description"],
    data: ["profiles", "departments", "family_templates", "app_settings", "settings", "image_quote", "goal_access", "sales_access", "hrms_access"],
    api: ["/api/admin/users", "/api/admin/goal-access", "/api/app-settings", "/api/templates", "/api/deck", "/api/me"],
    ai: "None.",
  },
  {
    name: "CRM — the funnel, at /crm",
    space: "CRM",
    since: "3.22.0.0",
    purpose: "Suspect to Order Received: companies, contacts (1.3 lakh), the full opportunity book since 2015 (22k+), quotations in five statuses, the invoice history (₹354 Cr), the Deal Board, mail and WhatsApp sent from each person's OWN accounts and logged, templates, and EVA's company briefs.",
    who: "Everyone Genie's crm_access grant admits. Money masks by the same rule as Genie.",
    gate: "requireCrm() — the Genie session crosses on EMAIL, never id. The CRM is a SECOND Supabase project; RLS is enabled AND forced with NO policies, so the service key behind requireCrm() is the only way in. Gmail refresh tokens live in Supabase Vault.",
    screens: ["Leads", "Opportunities", "Quotations", "Sales Orders", "Deal Board", "Companies", "Contacts", "Sales Invoices", "Communication (the mail queue)", "Settings — Users, Stages, Sectors, Message Variables, Email Templates, WhatsApp Templates"],
    data: ["company", "person", "person_phone", "address", "lead", "opportunity", "quotation", "quotation_line", "sales_order", "sales_invoice", "interaction", "message", "mailbox", "stage", "sector", "industry", "product", "profile", "email_template", "whatsapp_template", "message_variable", "crm_audit — all in the CRM's own project"],
    api: ["/api/crm/[doctype]", "/api/crm/board", "/api/crm/comms", "/api/crm/gmail/*", "/api/crm/wa/*", "/api/crm/mailq", "/api/crm/eva-brief", "/api/crm/project-field"],
    ai: "EVA writes the company brief — web research woven with the CRM's own warmth and industry track record. {{variables}} render on every mail and WhatsApp send.",
  },
  {
    name: "HRMS — Employee master & directory",
    space: "HRMS",
    since: "3.19.0.0",
    purpose: "Who works here: the record, the contact details, the next of kin, and what changed on any of it.",
    who: "The owner, Tushar Giri and HR. Nobody by default; the owner alone grants it.",
    gate: "requireHrms() on the page and on every route; RLS denies the browser outright",
    screens: ["Directory", "Person record", "From the sheet", "History", "Add person"],
    data: ["hrms_employees", "hrms_employee_edits", "hrms_employee_edit_log", "hrms_access"],
    api: ["/api/hrms/employees", "/api/hrms/history", "/api/hrms/access"],
    ai: "None.",
  },
  {
    name: "Saamaan — Items, the ERP mirror",
    space: "Saamaan",
    since: "4.4.0.0",
    purpose: "Every RM item as the ERP holds it — the whole document, child tables, drawings and attachments, the rich description — with closing stock live from the ERP, ERP's count and Genie's (Stock warehouses only) side by side.",
    who: "Granted individuals only; the owner implicit.",
    gate: "requireSaamaan() on the page and every route; material_access, ticked on Admin → module access; RLS on with no policies",
    screens: ["Items", "Item — ERP Data", "Item — Stock Register (live ledger)", "Item — Intelligence (to build)", "Projects", "Masters — warehouses & routing", "ERP pull (7 phases)"],
    data: ["material_access", "material_item", "material_item_file", "material_project", "material_bom", "material_warehouse", "material_setting", "material_pull"],
    api: ["/api/saamaan/items", "/api/saamaan/stock", "/api/saamaan/erp-items", "/api/saamaan/warehouse"],
    ai: "None. Reads only — nothing in Saamaan writes to the ERP.",
  },
  {
    name: "Saamaan — BOM, the Real BOM and WIP",
    space: "Saamaan",
    since: "4.4.0.4",
    purpose: "The latest submitted BOM per live project, and Genie's own copy of it — the RBOM, revision 100, Released lines plus what later drafts added as Draft — and one WIP warehouse per live job on the board.",
    who: "Granted individuals only.",
    gate: "requireSaamaan(); a live project is one with a job on the board, never the project's status field",
    screens: ["BOM front", "Bill in a lightbox", "Build RBOM / ERP moved on", "WIP — one row per live job"],
    data: ["material_bom", "material_bom_item", "material_rbom", "material_rbom_item", "material_wip"],
    api: ["/api/saamaan/items?mode=bom", "/api/saamaan/rbom", "/api/saamaan/wip"],
    ai: "None.",
  },
  {
    name: "Saamaan — MRP, kitting and issue slips",
    space: "Saamaan",
    since: "4.4.1.9",
    purpose: "A run picks its jobs once; GENERATE sums their RBOMs into items by jobs; a tick issues an item into the job's WIP; the planning block says stock, required, kitted, needed, in order, blocked, balance, to order, and what to order; Submit to store raises an issue slip, Submit to purchase a requisition; a slip left open climbs a ladder a day at a time.",
    who: "Granted individuals only; editing needs a planner role; the ERP pull and the Build are the owner's.",
    gate: "requireSaamaan(); the escalation cron by CRON_SECRET or a signed-in hand",
    screens: ["MRP list", "Run — Jobs", "Run — MRP plan", "Run — Kitted items", "Run — Store issue items", "Run — Items released", "Kitting register", "Issue slips (A5 print, a project a sheet)"],
    data: ["material_mrp", "material_mrp_job", "material_mrp_plan", "material_issue", "material_slip", "material_slip_line", "manual_tasks (escalations)"],
    api: ["/api/saamaan/mrp", "/api/saamaan/slip", "/api/cron/saamaan-escalate"],
    ai: "None. Stock is not yet reduced by an issue — the stated next step.",
  },
  {
    name: "Notifications",
    space: "Cross-cutting",
    since: "2.x",
    purpose: "Tells somebody they have been given something. In-app only, polled every 60 seconds.",
    who: "Everyone signed in, for their own.",
    gate: "requireUser(); RLS scopes rows to the recipient",
    screens: ["The bell"],
    data: ["notifications"],
    api: ["/api/notifications"],
    ai: "None.",
  },
];

/* ═══════════════════════════════ the Spaces ════════════════════════════════ */

interface SpaceSpec {
  icon: string;
  name: string;
  what: string;
  who: string;
  how: string;
}

const SPACES: SpaceSpec[] = [
  { icon: "🧭", name: "Planning Suite", what: "The day's work: My Week, On Floor, Jobs in Progress, Live Projects (with the project GANTT), Job Delivery Board, Pending Material, Escalations, Load Board, Job Plan.", who: "Everyone except the uploader.", how: "Role — any reader." },
  { icon: "✅", name: "Delivered Jobs", what: "What has gone out, and what it was worth. Value, throughput and on-time delivery.", who: "The Leadership Circle.", how: "Group flag — lc or stratcom, owner implicit." },
  { icon: "🎯", name: "Goals", what: "The OPSP cascade and its swimlane kanban.", who: "Granted individuals only.", how: "Explicit grant — goal_access." },
  { icon: "📋", name: "Nandan Tasking", what: "Tasks by job and by person, board and calendar, plus a private pad.", who: "Everyone except the uploader.", how: "Role — any reader." },
  { icon: "💼", name: "Sales Genie", what: "My Sales Plan and the Sales Regrow playbook.", who: "Granted individuals only.", how: "Explicit grant — sales_access." },
  { icon: "📚", name: "LMS", what: "Books, lessons, progress and a generated learning plan.", who: "Everyone except the uploader.", how: "Role — any reader." },
  { icon: "🧭", name: "Consult Raghu", what: "A question, answered against today's board.", who: "Everyone except the uploader.", how: "Role — any reader." },
  { icon: "📜", name: "Principles", what: "How decisions are meant to be reached, and the documents behind that.", who: "Everyone except the uploader.", how: "Role — any reader." },
  { icon: "👤", name: "HRMS", what: "The employee master and directory, at its own URL: records, contact details, next of kin, and the history of every change.", who: "Three named accounts — the owner, one director, HR.", how: "Explicit grant — hrms_access, ticked by the owner alone." },
  { icon: "🤝", name: "CRM", what: "The funnel at its own URL: the whole opportunity book since 2015, quotations, the Deal Board, mail and WhatsApp from each person's own accounts, EVA company briefs. A second database entirely.", who: "Everyone the grant admits.", how: "Explicit grant — crm_access; one Genie login, bridged on email." },
  { icon: "📦", name: "Saamaan", what: "Materials, at its own URL: the ERP's Item master mirrored with live stock, projects and BOMs, the Real BOM, a WIP per live job, MRP runs with planning, kitting into WIP, issue slips to the store and requisitions to purchase with a daily escalation ladder. Every table wears the material_ prefix; every ERP call is a read.", who: "Everyone the grant admits; the owner implicit.", how: "Explicit grant — material_access, ticked by the owner alone." },
  { icon: "👤", name: "Account menu", what: "The tools for the few: Morning Update, Update to ERP, Feature Request, Admin.", who: "Each gated on its own right.", how: "Role or grant, per tool." },
];

/* ══════════════════════════ data, grouped by domain ════════════════════════ */

const DATA_DOMAINS: [string, string, string[]][] = [
  ["Identity & access", "Who exists, what they may do, and the grants that are not roles.", ["profiles", "goal_access", "sales_access", "hrms_access", "departments", "units"]],
  ["ERP-fed (upload only)", "Written by the morning upload and by nothing else. Archived, never deleted.", ["jobs", "projects", "erp_tasks", "import_batches"]],
  ["Planning layer (app-owned)", "Genie's own work. Must survive every upload — the zero-data-loss contract. project_plans/project_milestones are literal twins of plans/milestones: planning is moving up to project level, so the shapes match on purpose.", ["plans", "milestones", "baseline_milestones", "materials", "material_comment", "family_templates", "project_plans", "project_milestones", "job_manpower", "labour_rate"]],
  ["Tasks", "Manual tasks, their comments, their date history and their close-outs.", ["manual_tasks", "task_comments", "task_date_log", "task_closeout", "task_proposal", "brain_dump"]],
  ["Shop floor", "What was said and photographed at the machine.", ["job_voice_note", "job_photo", "job_hint"]],
  ["Goals / OPSP", "The cascade, its bands, its links and its comments.", ["goal_node", "goal_item", "goal_band", "goal_csf_link", "goal_node_comment", "goal_item_comment", "csf", "kra", "kpi", "kpi_watcher", "rock_project", "opsp_section", "person_band", "swimlanes"]],
  ["Delivery & money", "Delivered history and the year's targets.", ["delivered_jobs", "fy_targets", "erp_update"]],
  ["Sales", "My Sales Plan's entity tables and the playbook content.", ["sp_companies", "sp_deals", "sp_industries", "sp_people", "sp_products", "sp_settings", "sp_support", "sp_todos", "sales_content"]],
  ["Learning", "Books, sections, lessons, progress, plans.", ["lms_book", "lms_section", "lms_lesson", "lms_lesson_book", "lms_progress", "lms_plan", "lms_extra"]],
  ["Company voice", "Principles, quotes, moods, requests and notifications.", ["principles", "principle_doc", "principle_file", "image_quote", "day_mood", "feature_request", "feature_file", "notifications"]],
  ["HR (isolated)", "Personnel data. Every table carries the hrms_ prefix, RLS is on with NO policies and anon/authenticated hold no grants — the service role is the only way in, and only behind requireHrms(). See migration 0048.", ["hrms_employees", "hrms_employee_edits", "hrms_employee_edit_log", "hrms_access"]],
  ["CRM (a second database)", "The funnel lives in its OWN Supabase project — not these tables at all. RLS enabled and forced with no policies; the service key behind requireCrm() is the only door; Gmail credentials sit in Vault; sixteen migrations of its own under supabase-crm/. One profile row per Genie account, bridged on email.", ["company", "person", "opportunity (22k+)", "quotation", "sales_order", "sales_invoice (6.8k)", "interaction (74k)", "message", "mailbox", "email_template", "whatsapp_template", "stage", "crm_audit", "…"]],
  ["Materials (material_)", "Saamaan's tables, every one prefixed material_ so a glance down the list says whose row it is. The mirrors (items, files, projects, BOMs, BOM lines, warehouses) are the ERP's word, refreshed by the seven-phase pull and never hand-edited; the rest (the RBOM and its lines, WIP, MRP runs, plans, issues, slips, settings) are Genie's own. RLS on with no policies; the service role behind requireSaamaan() is the only door. Migrations 0118–0128.", ["material_access", "material_item", "material_item_file", "material_project", "material_bom", "material_bom_item", "material_warehouse", "material_rbom", "material_rbom_item", "material_wip", "material_mrp", "material_mrp_job", "material_mrp_plan", "material_issue", "material_slip", "material_slip_line", "material_setting", "material_pull"]],
  ["Configuration", "App identity and the settings singleton.", ["app_settings", "settings"]],
];

const BUCKETS: [string, string, string][] = [
  ["voice-notes", "Shop-floor audio from On Floor.", "Private. Served by URLs signed at the moment the page opens."],
  ["job-photos", "Photographs against a job.", "Private. Signed links. Row keeps bucket and path, so the store can be changed without re-modelling."],
  ["principle-docs", "Source documents behind the Principles.", "Private. Signed links."],
  ["feature-files", "Attachments and screenshots on a feature request. 15 MB ceiling.", "Private. Signed links."],
];

/* ═════════════════════════ ISO 27001 Annex A pointers ══════════════════════ */

interface ControlRow {
  ref: string;
  control: string;
  /** What Genie actually does. Written so an auditor can go and check it. */
  evidence: string;
  state: "in place" | "partial" | "gap";
}

const CONTROLS: ControlRow[] = [
  { ref: "A.5.15", control: "Access control", evidence: "Six roles plus an owner tier, two explicit grants and three group flags. Every /api route resolves the caller through src/lib/auth.ts before doing anything; hiding a tab is never the gate.", state: "in place" },
  { ref: "A.5.16", control: "Identity management", evidence: "One identity per person in Supabase Auth, mirrored in profiles with a unique two-letter initials key. No shared logins except the single uploader account, which is a named person.", state: "in place" },
  { ref: "A.5.17", control: "Authentication information", evidence: "Passwords are held and verified by Supabase Auth; Genie never stores or sees one. Password reset is an admin action, and admin-on-admin changes are the owner's alone.", state: "in place" },
  { ref: "A.5.18", control: "Access rights — review and removal", evidence: "Grants and disabling are managed in Admin → Users, and the owner account cannot be demoted, disabled or deleted (API check plus DB trigger). There is no scheduled review cycle.", state: "partial" },
  { ref: "A.5.23", control: "Cloud services", evidence: "Four suppliers, named below with what each holds: Vercel, Supabase, Google Drive, Anthropic. None is under a documented supplier assessment yet.", state: "partial" },
  { ref: "A.8.2", control: "Privileged access rights", evidence: "The service-role key is server-only and never prefixed NEXT_PUBLIC_. The owner tier is a single email, set by environment variable, above the admin role.", state: "in place" },
  { ref: "A.8.3", control: "Information access restriction", evidence: "Row Level Security on the tables that carry personal or restricted data; per-person scoping on brain_dump and notifications; the two grant tables gate whole Spaces.", state: "in place" },
  { ref: "A.8.4", control: "Access to source code", evidence: "Private GitHub repository, single main branch, no secrets in git (.gitignore excludes .env.local).", state: "in place" },
  { ref: "A.8.9", control: "Configuration management", evidence: "Security headers are declared in next.config.js: frame-ancestors none, nosniff, strict referrer policy, HSTS for a year, and a Permissions-Policy that opens the microphone to this origin alone.", state: "in place" },
  { ref: "A.8.12", control: "Data leakage prevention", evidence: "Object storage buckets are all private and served through time-limited signed URLs; no public bucket exists. Feature-request HTML is allow-listed before it is stored.", state: "in place" },
  { ref: "A.8.13", control: "Information backup", evidence: "Supabase's own backups apply. There is no documented restore test, and no stated retention period for the buckets or the Drive archive.", state: "gap" },
  { ref: "A.8.15", control: "Logging", evidence: "Business-level history is kept: import_batches records who uploaded and when, task_date_log every date move, erp_update every field correction, job_hint the model that wrote each brief. There is no access log of who READ what.", state: "partial" },
  { ref: "A.8.16", control: "Monitoring", evidence: "Vercel and Supabase platform monitoring only. No alerting is configured against Genie's own signals.", state: "gap" },
  { ref: "A.8.24", control: "Use of cryptography", evidence: "TLS end to end, HSTS pinned for a year. The Drive service account signs its own RS256 JWT in node rather than pulling in a large dependency. Secrets live in Vercel environment variables.", state: "in place" },
  { ref: "A.8.25", control: "Secure development lifecycle", evidence: "Numbered, idempotent, additive migrations; server-side gates on every route; one aggregated GET per surface. Conventions are written down in HANDOVER.md and in the header comment of every file.", state: "in place" },
  { ref: "A.8.28", control: "Secure coding", evidence: "TypeScript throughout, typecheck in the build, no dynamic SQL from user input (PostgREST and RPC only), and the parser for the morning workbook is a fixed, tested port that is extended rather than rewritten.", state: "in place" },
  { ref: "A.8.31", control: "Separation of environments", evidence: "One Supabase project serves development and production. The destructive acceptance test is documented as scratch-database-only, which is a convention rather than a technical separation.", state: "gap" },
  { ref: "A.8.32", control: "Change management", evidence: "Every shipped change is a numbered release in src/lib/changelog.ts, which is also what the header badge reads — the log and the running version cannot disagree. " + UPDATES.length + " releases across " + SIZE.commits + " commits.", state: "in place" },
  { ref: "A.5.34", control: "Privacy and protection of PII", evidence: "Personal data held: name, work email, initials, department, designation, role, last login, learning progress, daily mood, voice recordings and photographs from the shop floor. No customer personal data beyond business contact records in Sales Genie.", state: "partial" },
  { ref: "A.5.31", control: "Legal and regulatory requirements", evidence: "Application compute currently executes in Vercel's US-East region while every user and data subject is in India. This is a decision to take, not a defect — it is recorded here so it is taken deliberately.", state: "gap" },
];

/* ════════════════════════════════ presentation ═════════════════════════════ */

function Card({ children, pad = true }: { children: React.ReactNode; pad?: boolean }) {
  return (
    <div className="bg-white rounded-lg border" style={{ borderColor: BORDER, padding: pad ? 14 : 0 }}>
      {children}
    </div>
  );
}

function Sec({ n, title, lead, children }: { n: string; title: string; lead?: string; children: React.ReactNode }) {
  return (
    <section style={{ breakInside: "avoid" }}>
      <Card>
        <div className="flex items-baseline gap-2 mb-1">
          <span className="tnum font-bold text-xs" style={{ color: ORANGE, letterSpacing: 1 }}>{n}</span>
          <h3 className="font-bold" style={{ fontSize: 15, color: INK }}>{title}</h3>
        </div>
        {lead && (
          <p className="text-xs mb-3" style={{ color: "#5A6672", lineHeight: 1.6, maxWidth: "88ch" }}>{lead}</p>
        )}
        {children}
      </Card>
    </section>
  );
}

/** A label/value pair. The workhorse of the whole page. */
function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 10, padding: "5px 0", borderBottom: "1px solid #F0EEE8" }}>
      <div className="text-xs font-semibold" style={{ color: MUTED, minWidth: 168, flexShrink: 0 }}>{k}</div>
      <div className="text-xs" style={{ color: INK, lineHeight: 1.6 }}>{v}</div>
    </div>
  );
}

function Tags({ items, tone = "slate" }: { items: string[]; tone?: "slate" | "orange" }) {
  const bg = tone === "orange" ? "#FDF1E7" : "#F4F3EF";
  const fg = tone === "orange" ? "#A5450A" : "#5A6672";
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((t) => (
        <span key={t} className="text-xs" style={{ background: bg, color: fg, borderRadius: 3, padding: "1px 6px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 11 }}>
          {t}
        </span>
      ))}
    </div>
  );
}

function StateChip({ s }: { s: ControlRow["state"] }) {
  const map = {
    "in place": { bg: "#E7F3EC", fg: "#1E6B3E", label: "IN PLACE" },
    partial: { bg: "#FDF6E3", fg: "#8A6A00", label: "PARTIAL" },
    gap: { bg: "#FBEAE8", fg: RED, label: "GAP" },
  } as const;
  const m = map[s];
  return (
    <span className="text-xs font-bold" style={{ background: m.bg, color: m.fg, borderRadius: 3, padding: "1px 6px", letterSpacing: 0.6, fontSize: 10, whiteSpace: "nowrap" }}>
      {m.label}
    </span>
  );
}

const TH: React.CSSProperties = {
  textAlign: "left",
  padding: "6px 8px",
  fontSize: 11,
  letterSpacing: 0.6,
  color: MUTED,
  borderBottom: "2px solid " + BORDER,
  whiteSpace: "nowrap",
};
const TD: React.CSSProperties = {
  padding: "7px 8px",
  fontSize: 12,
  color: INK,
  borderBottom: "1px solid #F0EEE8",
  verticalAlign: "top",
  lineHeight: 1.55,
};

/* ════════════════════════════════ the page ═════════════════════════════════ */

export default function SoftwareDescription() {
  const gaps = CONTROLS.filter((c) => c.state === "gap").length;
  const partial = CONTROLS.filter((c) => c.state === "partial").length;

  return (
    <div className="space-y-3" style={{ maxWidth: 1180 }}>
      {/* ── document header ── */}
      <div className="rounded-lg px-4 py-3" style={{ background: NAVY, color: "#fff" }}>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs font-bold" style={{ letterSpacing: 1.4, color: "#8FA1B3" }}>
              SOFTWARE DESCRIPTION · NANDAN GSE
            </div>
            <h2 className="font-bold text-white" style={{ fontSize: 22, lineHeight: 1.2, marginTop: 2 }}>
              Genie — architecture, modules and controls
            </h2>
            <div className="text-xs mt-1" style={{ color: "#9FB0C0" }}>
              Running version <b style={{ color: AMBER }}>{APP_VERSION}</b> · {UPDATES.length} releases logged · prose last revised {DOC_REVISED}
            </div>
          </div>
          <button
            onClick={() => window.print()}
            className="px-3 py-1.5 rounded text-xs font-semibold"
            style={{ background: ORANGE, color: "#fff" }}
          >
            🖨 Print / save as PDF
          </button>
        </div>
        <p className="text-xs mt-3" style={{ color: "#6B7C8C", lineHeight: 1.6, maxWidth: "92ch" }}>
          Written for two readers. The first is whoever takes Genie on next and needs its shape before touching it.
          The second is an auditor, who does not care how it works and cares a great deal about who can reach what,
          where the data physically sits, and how a change gets from somebody&apos;s head into production. Where a
          control is not in place this page says so — a description that only lists strengths is not evidence of anything.
        </p>
      </div>

      {/* ── 1. what it is ── */}
      <Sec
        n="1"
        title="What Genie is"
        lead="A single web application, behind one login, that plans and reports the works. It is deliberately NOT wired into the ERP: apart from one archive folder in Google Drive and the language model it calls, the only inflow is a morning Excel export somebody uploads. That rule comes from the original standalone specification and it is what makes the whole security model tractable — there is exactly one door data comes in by."
      >
        <div style={{ maxWidth: "92ch" }}>
          <KV k="Product name" v="Genie" />
          <KV k="Owner" v="Dr Raghunandan Jagdish. The owner account sits above the admin role and is protected by both an API check and a database trigger." />
          <KV k="Production address" v={<><b>genie.nandan.co.in</b> — verified serving. The Vercel project address remains reachable as a fallback.</>} />
          <KV k="Users" v="Nandan GSE staff only. No customer, supplier or public access of any kind." />
          <KV k="Size" v={`${SIZE.apiRoutes} API routes · ${SIZE.tables} tables · ${SIZE.migrations} migrations · ${SIZE.components} React components · ${SIZE.buckets} object-storage buckets`} />
          <KV k="Build effort" v={`${EFFORT.raghuLow}–${EFFORT.raghuHigh} hours of Dr Raghu's own time specifying and reviewing; a ${EFFORT.windowHours}-hour build window across ${EFFORT.days} days; ${EFFORT.commits} commits, measured to ${EFFORT.measuredTo}.`} />
          <KV k="Ownership of the code" v="Private GitHub repository. Single main branch. Secrets are never committed." />
        </div>
      </Sec>

      {/* ── 2. spaces ── */}
      <Sec
        n="2"
        title="The Spaces"
        lead="Genie is divided into Spaces, not pages. A Space is a whole area of the application with its own sub-navigation and its own admission test, and the test is enforced on the server every time — a Space you cannot open is a Space whose data you cannot fetch either. Three admission mechanisms are in use, and they are deliberately different things: a ROLE is what you are, a GROUP FLAG is which room you sit in, and a GRANT is a decision somebody made about you by name."
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
            <thead>
              <tr>
                <th style={TH}>Space</th>
                <th style={TH}>What is in it</th>
                <th style={TH}>Who sees it</th>
                <th style={TH}>Admission</th>
              </tr>
            </thead>
            <tbody>
              {SPACES.map((s) => (
                <tr key={s.name}>
                  <td style={{ ...TD, fontWeight: 700, whiteSpace: "nowrap" }}>{s.icon} {s.name}</td>
                  <td style={{ ...TD, maxWidth: 380 }}>{s.what}</td>
                  <td style={TD}>{s.who}</td>
                  <td style={{ ...TD, color: "#5A6672" }}>{s.how}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Sec>

      {/* ── 3. architecture ── */}
      <Sec
        n="3"
        title="Architecture"
        lead="One Next.js application. The browser holds no privilege of its own: every screen asks a route, the route resolves who is asking before it does anything, and the database refuses the request a second time under Row Level Security if the route were ever wrong. Nothing is enforced by hiding a button."
      >
        <div className="rounded p-3 mb-3" style={{ background: "#F7F6F2", border: "1px solid " + BORDER }}>
          <div className="text-xs font-bold mb-2" style={{ color: MUTED, letterSpacing: 1 }}>THE PATH OF ONE REQUEST</div>
          <div className="text-xs" style={{ color: INK, lineHeight: 2, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 11.5 }}>
            browser (React, one component per surface)<br />
            &nbsp;&nbsp;↓ one aggregated GET per screen, small POSTs for actions<br />
            route handler in /src/app/api/…<br />
            &nbsp;&nbsp;↓ <b style={{ color: ORANGE }}>requireUser / requireReader / requirePlanner / requireAdmin / requireOwner / requireLC / requireStratcom / requireUploader</b><br />
            &nbsp;&nbsp;↓ grant check where the Space needs one (goal_access, sales_access)<br />
            domain library in /src/lib/… — the figures are worked out here, never in the component<br />
            &nbsp;&nbsp;↓ PostgREST or an RPC<br />
            Postgres, with Row Level Security as the second refusal
          </div>
        </div>
        <div style={{ maxWidth: "92ch" }}>
          <KV k="Rendering" v="Next.js 14 App Router. Data routes are force-dynamic — nothing about a live board is cacheable at the edge." />
          <KV k="Shape of every surface" v="One aggregated GET returns the whole payload for a screen; actions are small POSTs. This is why a board with a hundred jobs is one request, not a hundred." />
          <KV k="Where logic lives" v="In /src/lib. A component renders; it does not compute. buildBoard(), the goal tree, the delivered analysis and the run rate are all libraries, callable and testable without a browser." />
          <KV k="The big component" v="PlanningSuite.tsx carries the suite UI in one file. It is large by intent — the workspaces share state — and is the first candidate for splitting when it next needs surgery." />
          <KV k="Failure style" v="A missing migration or a missing key returns a stated reason (503 with the migration number, or a named missing key), never a blank screen or a 500." />
        </div>
      </Sec>

      {/* ── 4. technology ── */}
      <Sec n="4" title="Technology" lead="Deliberately small. Everything here is either the framework, the database client, the spreadsheet parser or the model SDK; there is no UI library, no state library and no ORM to learn.">
        <div style={{ maxWidth: "92ch" }}>
          <KV k="Language" v="TypeScript 5.6, strict. Type-checking runs as part of the build." />
          <KV k="Framework" v="Next.js 14.2 (App Router), React 18.3. Node 20 or later." />
          <KV k="Styling" v="Tailwind 3.4 with a fixed house palette: paper #F1EFE9, navy #16232F, orange #E8600A." />
          <KV k="Database client" v="@supabase/supabase-js with @supabase/ssr. Two clients: a user-scoped one that inherits RLS, and a service client used only where a route has already proved the caller's right." />
          <KV k="Spreadsheets" v="SheetJS (xlsx), kept external to the server bundle." />
          <KV k="Language model" v="@anthropic-ai/sdk. Claude Opus 5 for research, scoring, the learning plan and the Job Plan brief; Claude Sonnet 4.5 for voice notes, principles and Consult Raghu." />
          <KV k="Google Drive" v="No SDK. A service account signs its own RS256 JWT in node — about sixty lines instead of a forty-megabyte dependency." />
          <KV k="Dependencies" v="Seven runtime packages in total. A small dependency tree is a small attack surface and a short upgrade list." />
        </div>
      </Sec>

      {/* ── 5. where it runs ── */}
      <Sec
        n="5"
        title="Where it runs — location and data residency"
        lead="The question an auditor asks first, and the one that is easiest to answer wrongly. These are observed facts, not assumptions: the region codes below were read from the live response headers."
      >
        <div style={{ maxWidth: "92ch" }}>
          <KV k="Application hosting" v="Vercel. The domain is served from the Mumbai edge (bom1)." />
          <KV
            k="Where code executes"
            v={<><b style={{ color: RED }}>US-East (iad1)</b> — Vercel&apos;s default function region. Requests reach Mumbai and are executed in the United States. Every user and data subject is in India. This is a setting, not a defect: it is changeable on the Vercel plan, and it is written here so the decision is taken deliberately rather than inherited.</>}
          />
          <KV k="Database" v="Supabase — managed Postgres, project kpcwgsgqzhfajjhapvlf, fronted by Cloudflare. The storage region must be read from the Supabase dashboard and recorded here; it is not visible from the outside." />
          <KV k="Object storage" v="Supabase Storage, same project, four private buckets." />
          <KV k="File archive" v="Google Drive — the morning workbook is filed there after every upload, in a Shared Drive folder. Archiving never fails an upload: by the time it runs the rows are already in." />
          <KV k="Language model" v="Anthropic API. Prompts carry job figures, task text and shop-floor transcripts. No credentials and no bulk personal data are sent." />
          <KV k="Source code" v="GitHub, private repository." />
          <KV k="Secrets" v="Vercel environment variables and a local .env.local that is git-ignored: Supabase URL and anon key (public by design), the service-role key (server-only), the owner email, the Anthropic key, and the Drive service-account credentials. Nothing is in the repository." />
        </div>
      </Sec>

      {/* ── 6. data ── */}
      <Sec
        n="6"
        title="Data"
        lead={`One Postgres database, ${SIZE.tables} tables, grouped below by what they are for rather than by when they were built. The division that matters is the third row: four tables are written by the morning upload and by nothing else, and everything else is Genie's own and must survive every upload untouched.`}
      >
        <div className="space-y-2">
          {DATA_DOMAINS.map(([name, why, tables]) => (
            <div key={name} className="rounded p-2.5" style={{ background: "#F7F6F2", border: "1px solid " + BORDER }}>
              <div className="flex items-baseline gap-2 flex-wrap">
                <div className="font-bold text-xs" style={{ color: INK }}>{name}</div>
                <div className="text-xs" style={{ color: MUTED }}>{why}</div>
              </div>
              <div className="mt-1.5">
                <Tags items={tables} />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 rounded p-3" style={{ background: "#FDF1E7", border: "1px solid #F3D9C2" }}>
          <div className="font-bold text-xs mb-1" style={{ color: "#A5450A", letterSpacing: 0.6 }}>THE ZERO-DATA-LOSS CONTRACT</div>
          <p className="text-xs" style={{ color: "#7A3D12", lineHeight: 1.65, maxWidth: "88ch" }}>
            An upload may touch <b>jobs, projects, erp_tasks and import_batches</b> and nothing else. Plans, milestones,
            baselines, manual tasks, comments, materials, priority, templates and grants are Genie&apos;s own and are never
            reached by an import. Jobs are <b>archived, never deleted</b>. This was verified end to end against live data
            and is the single rule most likely to be broken by a well-meaning change to the parser.
          </p>
        </div>

        <div className="mt-3">
          <div className="font-bold text-xs mb-1.5" style={{ color: INK }}>Object storage — {SIZE.buckets} buckets, all private</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
              <thead>
                <tr>
                  <th style={TH}>Bucket</th>
                  <th style={TH}>Holds</th>
                  <th style={TH}>How it is served</th>
                </tr>
              </thead>
              <tbody>
                {BUCKETS.map(([b, holds, how]) => (
                  <tr key={b}>
                    <td style={{ ...TD, fontFamily: "ui-monospace, monospace", fontSize: 11.5, whiteSpace: "nowrap" }}>{b}</td>
                    <td style={TD}>{holds}</td>
                    <td style={{ ...TD, color: "#5A6672" }}>{how}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs mt-2" style={{ color: MUTED, lineHeight: 1.6, maxWidth: "88ch" }}>
            No file is in the database and no bucket is public. Each row keeps a bucket and a path, so moving the
            store later is a copy and one column rather than a re-modelling. A public bucket would put internal
            documents on a URL that works for anyone who has it, forever, including after somebody leaves.
          </p>
        </div>
      </Sec>

      {/* ── 7. security ── */}
      <Sec
        n="7"
        title="Access control and security"
        lead="Three separate mechanisms, kept separate on purpose. Collapsing them into one list of roles is the change that would quietly break the model."
      >
        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
          <div className="rounded p-2.5" style={{ background: "#F7F6F2", border: "1px solid " + BORDER }}>
            <div className="font-bold text-xs mb-1">Roles — what you are</div>
            <Tags items={["admin", "planner", "project_owner", "user", "sales", "viewer", "uploader"]} tone="orange" />
            <p className="text-xs mt-1.5" style={{ color: "#5A6672", lineHeight: 1.55 }}>
              Editors (admin, planner, project_owner) may change plans. A user works tasks only. A viewer reads.
              The uploader sees the upload page and nothing else.
            </p>
          </div>
          <div className="rounded p-2.5" style={{ background: "#F7F6F2", border: "1px solid " + BORDER }}>
            <div className="font-bold text-xs mb-1">Group flags — which room you are in</div>
            <Tags items={["lc", "stratcom", "management"]} tone="orange" />
            <p className="text-xs mt-1.5" style={{ color: "#5A6672", lineHeight: 1.55 }}>
              Not roles. The Leadership Circle sees Delivered Jobs; Stratcom sees the forward money and may flag a
              job as on the floor. The owner is in all three without anything being stored against him.
            </p>
          </div>
          <div className="rounded p-2.5" style={{ background: "#F7F6F2", border: "1px solid " + BORDER }}>
            <div className="font-bold text-xs mb-1">Grants — a decision about you by name</div>
            <Tags items={["goal_access", "sales_access"]} tone="orange" />
            <p className="text-xs mt-1.5" style={{ color: "#5A6672", lineHeight: 1.55 }}>
              Default is no, for everyone, including admins. Two tables, each gating a whole Space, revocable in
              Admin. The owner is implicit in both.
            </p>
          </div>
        </div>

        <div className="mt-3" style={{ maxWidth: "92ch" }}>
          <KV k="The owner tier" v="One email address, set by environment variable, above the admin role. Only the owner may change another admin — role, password, disabling, deletion or grants — or mint a new one. The owner account cannot be demoted, disabled or deleted; this is enforced by an API check AND a database trigger, so it survives a bug in the route." />
          <KV k="Field-level restriction" v="Management Target Date on a job is editable by the owner alone, enforced in /api/job-field and again by a trigger." />
          <KV k="Row Level Security" v="On the tables carrying personal or restricted data. Private pads and notifications are scoped to the person; the sales tables are gated on the sales grant; company deletion is admin-only." />
          <KV k="Two database clients" v="A user-scoped client that inherits RLS, used where the caller's own rights should apply; and a service client used only after a route has proved the caller's right. The distinction is what stops a bug in one file leaking another person's data." />
          <KV k="Browser headers" v={<>Set in next.config.js: <b>X-Frame-Options DENY</b> and <b>frame-ancestors &apos;none&apos;</b> everywhere except the two Sales Genie documents, which are framed by our own workspace and set SAMEORIGIN themselves; <b>nosniff</b>; <b>strict-origin-when-cross-origin</b>; <b>HSTS</b> for a year; and a Permissions-Policy that closes the camera and geolocation and opens the microphone to this origin only, because shop-floor voice notes are recorded at the machine.</>} />
          <KV k="Input handling" v="No dynamic SQL is built from user input — PostgREST and RPCs only. Rich text on a feature request is filtered against an allow-list of tags before it is stored." />
          <KV k="What is never logged or sent" v="No password reaches Genie's code. No key appears in the browser bundle except the two that are public by design. No document URL is public." />
        </div>
      </Sec>

      {/* ── 8. the one door ── */}
      <Sec
        n="8"
        title="How data gets in — the morning upload"
        lead="The single inflow, and therefore the single point at which the company's operating picture can be corrupted. It is worth understanding in full."
      >
        <div style={{ maxWidth: "92ch" }}>
          <KV k="Who" v="One named uploader account, plus admins. Nobody else can reach the route." />
          <KV k="What" v="Three sheets exported from the ERP — Jobs, Projects, ToDo — or the full PRE workbook in one file." />
          <KV k="Parse" v="A fixed, battle-tested parser. It is extended, never rewritten: the sheets are an ERP export whose quirks are known and encoded." />
          <KV k="Merge" v="Through database functions, so the merge is one transaction rather than a sequence of writes that can half-succeed. Rows are matched, updated, inserted or archived — never deleted." />
          <KV k="Record" v="Every upload writes an import_batches row: who ran it, when, and what came of it." />
          <KV k="Archive" v="The workbook itself is filed to Google Drive, so 'what did Monday's Jobmaster actually say' is answerable. Failure to archive never fails the upload." />
          <KV k="Push back" v="Corrections made in Genie do not reach the ERP automatically. They queue in erp_update — job, field, the ERP's own label for it, the old value and the new — for somebody to apply. A one-way sync that silently loses an argument between two systems would be worse than the queue." />
        </div>
      </Sec>

      {/* ── 9. AI ── */}
      <Sec
        n="9"
        title="Where a language model is used, and where it is not"
        lead="Nine places, all of them assistive and none of them authoritative. The rule throughout is that Genie proposes and a person accepts — nothing a model produces becomes a fact in the system without somebody pressing a button."
      >
        <div style={{ maxWidth: "92ch" }}>
          <KV k="Job Plan brief" v="Claude writes the written brief from facts Genie assembles — dates, plan, milestones, materials, tasks, people. Cached against the model that wrote it." />
          <KV k="On Floor — the read" v="Given the job as well as the recordings: target date, kitted against built, value, throughput, the escalation, the money needed and every open task. Told to say where the notes and the board disagree, and to invent nothing." />
          <KV k="On Floor — suggested tasks" v="Anything in a note that somebody must act on comes back as a proposal. NOTHING IS CREATED until a person presses Add. Rejections are kept, not deleted, because the same suggestion turned down twice is a prompt worth changing." />
          <KV k="Voice notes" v="Transcribed and attributed to the speaker by initials." />
          <KV k="Consult Raghu" v="A question answered with today's live figures sent alongside it. Not persisted." />
          <KV k="Principles" v="Groups and drafts principles from the source document; a person accepts them." />
          <KV k="LMS plan" v="A learning plan from what the person has already read." />
          <KV k="Sales — EVA research" v="Company research, on demand." />
          <KV k="Sales — deal scoring" v="A percentage chance against a stated bucket." />
          <KV k="Without the key" v="Every one of these returns a clear, named 'missing key' message and the rest of Genie works normally. No feature silently degrades." />
        </div>
      </Sec>

      {/* ── 10. performance ── */}
      <Sec n="10" title="Performance" lead="The figures Genie shows are computed over the whole live book, so the design decisions that keep it quick are worth stating rather than leaving to be rediscovered.">
        <div style={{ maxWidth: "92ch" }}>
          <KV k="One request per screen" v="Each surface is a single aggregated GET assembled server-side. A board of a hundred jobs is one round trip, not one per job." />
          <KV k="Computation server-side" v="Boards, trees, run rates and delivered analysis are worked out in /src/lib and arrive ready to render. The browser is not asked to do arithmetic over the book." />
          <KV k="Expensive answers are cached" v="The Job Plan brief is stored in job_hint against the model and the moment it was built, so opening a job does not call a model." />
          <KV k="Files are not in the database" v="Audio, photographs and documents are in object storage and served through signed links, which is what has kept the database small." />
          <KV k="Workspaces stay alive" v="Once a Space has been opened its component is kept mounted, so switching back does not refetch and re-render from nothing." />
          <KV k="Model calls are bounded" v="Routes that call a model carry an explicit maximum duration — 60 seconds, 120 for the principles pass — so a slow answer fails visibly instead of hanging." />
          <KV k="Notifications poll" v="Every 60 seconds, in-app only. Deliberately not a socket: the cost of a persistent connection per user buys nothing at this scale." />
          <KV k="Known cost" v="PlanningSuite.tsx is a single large component. It is the first thing to split when the suite next needs structural work." />
        </div>
      </Sec>

      {/* ── 11. change control ── */}
      <Sec
        n="11"
        title="Change control"
        lead="An auditor will ask how a change reaches production and whether it can be traced afterwards. Both answers are in the repository rather than in anybody's memory."
      >
        <div style={{ maxWidth: "92ch" }}>
          <KV k="Versioning" v={<>MAJOR.MINOR.BATCH.PATCH, counted from the right. The last digit is today; the second-last is a new day; the third-last is a new week or a new module; the first moves only on the owner&apos;s instruction. Currently <b style={{ color: ORANGE }}>{APP_VERSION}</b>.</>} />
          <KV k="The release log" v={`Every shipped change is an entry in src/lib/changelog.ts, in the words of somebody who has to use it. The header badge and Admin → Updates both read that list, so the running version and the log cannot drift apart. ${UPDATES.length} releases are logged.`} />
          <KV k="Deployment" v="Push to main; the host builds and deploys in a minute or two. There is no manual step and therefore no undocumented one." />
          <KV k="Rollback" v="Migrations are numbered, idempotent and additive — which is precisely what makes a rollback a code revert with no database change." />
          <KV k="History kept in the data" v="import_batches records who uploaded and when; task_date_log every date move and where it moved from; erp_update every field correction with its old and new value; task_closeout why something was escalated and what would prevent it." />
          <KV k="Backlog" v="Feature Requests — anyone may raise one with a stated priority, everyone can read the list, and only the owner sets a status." />
        </div>
      </Sec>

      {/* ── 12. module register ── */}
      <Sec
        n="12"
        title="Module register"
        lead="The repeatable part. Every module is described with the same eight fields, so a new one is a new entry rather than a new format — and so an auditor comparing two modules is comparing like with like. When a new module ships, add it here in the same shape."
      >
        <div className="text-xs mb-2" style={{ color: MUTED }}>
          {MODULES.length} modules registered.
        </div>
        <div className="space-y-2">
          {MODULES.map((m) => (
            <div key={m.name} className="rounded border" style={{ borderColor: BORDER, breakInside: "avoid" }}>
              <div className="flex items-baseline gap-2 flex-wrap px-3 py-2" style={{ background: "#F7F6F2", borderBottom: "1px solid " + BORDER }}>
                <div className="font-bold text-sm" style={{ color: INK }}>{m.name}</div>
                <span className="text-xs" style={{ background: "#E9E7E0", color: "#5A6672", borderRadius: 3, padding: "1px 6px" }}>{m.space}</span>
                <span className="text-xs tnum" style={{ color: MUTED }}>since v{m.since}</span>
              </div>
              <div className="px-3 py-1.5">
                <KV k="Purpose" v={m.purpose} />
                <KV k="Who" v={m.who} />
                <KV k="Server gate" v={<code style={{ fontFamily: "ui-monospace, monospace", fontSize: 11.5, color: "#A5450A" }}>{m.gate}</code>} />
                <KV k="Screens" v={m.screens.join(" · ")} />
                <KV k="Data" v={<Tags items={m.data} />} />
                <KV k="API" v={<Tags items={m.api} />} />
                <KV k="Language model" v={m.ai} />
              </div>
            </div>
          ))}
        </div>
      </Sec>

      {/* ── 13. ISO 27001 ── */}
      <Sec
        n="13"
        title="ISO 27001:2022 — Annex A pointers"
        lead="Not a certification claim and not a statement of applicability. It is the map an auditor needs: for each control that touches this application, what Genie actually does and where to go and look. Where nothing is in place it says GAP, because a description that only lists strengths is worth nothing to the person reading it."
      >
        <div className="flex gap-2 flex-wrap mb-2 text-xs">
          <span style={{ color: MUTED }}>{CONTROLS.length} controls mapped —</span>
          <span style={{ color: "#1E6B3E", fontWeight: 700 }}>{CONTROLS.length - gaps - partial} in place</span>
          <span style={{ color: "#8A6A00", fontWeight: 700 }}>{partial} partial</span>
          <span style={{ color: RED, fontWeight: 700 }}>{gaps} gaps</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
            <thead>
              <tr>
                <th style={TH}>Ref</th>
                <th style={TH}>Control</th>
                <th style={TH}>What Genie does — and where to look</th>
                <th style={TH}>State</th>
              </tr>
            </thead>
            <tbody>
              {CONTROLS.map((c) => (
                <tr key={c.ref} style={{ breakInside: "avoid" }}>
                  <td style={{ ...TD, fontFamily: "ui-monospace, monospace", fontSize: 11.5, whiteSpace: "nowrap", fontWeight: 700 }}>{c.ref}</td>
                  <td style={{ ...TD, whiteSpace: "nowrap", fontWeight: 600 }}>{c.control}</td>
                  <td style={{ ...TD, maxWidth: 560 }}>{c.evidence}</td>
                  <td style={TD}><StateChip s={c.state} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Sec>

      {/* ── 14. gaps ── */}
      <Sec
        n="14"
        title="What is not in place"
        lead="Collected from the table above so it can be worked through as a list. None of these is difficult; all of them are decisions somebody has to take."
      >
        <ol className="text-xs space-y-2" style={{ color: INK, lineHeight: 1.65, paddingLeft: 18, maxWidth: "88ch", listStyle: "decimal" }}>
          <li><b>Compute region.</b> The application executes in US-East while every user is in India. A deliberate decision is needed either way, and it should be recorded.</li>
          <li><b>Supabase region.</b> Must be read from the dashboard and written into section 5. An audit cannot proceed on &quot;probably&quot;.</li>
          <li><b>One environment.</b> Development and production share a database. The rule that destructive tests only run against a scratch project is a convention, not a control.</li>
          <li><b>Backup and restore.</b> The platform takes backups; nobody has tested a restore, and no retention period is stated for the buckets or the Drive archive.</li>
          <li><b>Read access is not logged.</b> Every write leaves a trail; nothing records who looked at what. For a system carrying the company&apos;s money figures this is worth a decision.</li>
          <li><b>No access review cycle.</b> Grants are revocable and visible, but nobody re-reads the list on a schedule.</li>
          <li><b>Supplier assessment.</b> Four suppliers hold company data — Vercel, Supabase, Google, Anthropic. None has a documented assessment on file.</li>
          <li><b>No alerting.</b> A failed upload, a stalled queue or a spike of errors is noticed by somebody looking, not by something telling them.</li>
        </ol>
      </Sec>

      {/* ── how to keep this true ── */}
      <div className="rounded-lg px-4 py-3" style={{ background: "#F7F6F2", border: "1px solid " + BORDER }}>
        <div className="font-bold text-xs mb-1" style={{ color: INK, letterSpacing: 0.6 }}>KEEPING THIS PAGE TRUE</div>
        <p className="text-xs" style={{ color: "#5A6672", lineHeight: 1.65, maxWidth: "92ch" }}>
          The version, the release count and the effort figures are read live from the release log and cannot go stale.
          Everything else is prose in <code style={{ fontFamily: "ui-monospace, monospace", fontSize: 11 }}>src/components/SoftwareDescription.tsx</code> and
          is only as true as its last revision, dated at the top. A new module is one entry in the module register, in the
          same eight fields as every other. A new supplier, a new bucket or a new region changes section 5. A control
          moving from GAP to IN PLACE changes section 13, and the item leaves section 14 with it — a gap list that is
          never shortened stops being read.
        </p>
      </div>
    </div>
  );
}
