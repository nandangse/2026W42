/**
 * What each role, room and door means, in English — and, more importantly,
 * what it still does NOT let a person do once given (Dr Raghu, 6 Sep 2026:
 * "describe in English the various access they have — more importantly the
 * limitations after access is given. This is important to understand").
 *
 * Read by the Users lightbox. Kept as text here, not in the database, so a
 * change of rule and a change of wording are the same commit.
 */

export const ROLE_TEXT: Record<string, { means: string; limits: string }> = {
  admin: {
    means: "Everything on the Planning boards, plus Admin: users, settings, uploads, the ERP push, labour rates, swimlanes.",
    limits: "An admin does not automatically hold any other door — CRM, HRMS, Kuber, Vishwakarma, Seva, IMS and Saamaan are each a separate tick. Only the owner may make another admin, change an admin's role, or touch the owner account. Admins other than Dr Raghu and Vishwas can see the Users page but not change it. Goals is a separate grant even for admins.",
  },
  planner: {
    means: "All Planning boards, and the right to write the planning layer: plans, milestones, materials, priority, tasks and comments.",
    limits: "No Admin page. No other door without its tick. Cannot change users. Sees rupee values, and may switch the screen to without value.",
  },
  project_owner: {
    means: "Planning Owner (the Jobmaster's Project Owner). The boards filter to their jobs; they write plans, milestones, materials, tasks and comments on them.",
    limits: "The same limits as a planner. The link to their jobs is the ERP owner text on their profile — if it does not match the Jobmaster exactly, their jobs show as Unassigned.",
  },
  user: {
    means: "Reads the boards, works the tasks assigned to them, comments, records shop updates on the floor, fills their own IDP.",
    limits: "Cannot change plans, milestones, materials or priority. Never sees a rupee figure — every value is masked. No Admin page.",
  },
  sales: {
    means: "The boards as a user, plus the CRM's Sales Plan and the sales playbook by right of role.",
    limits: "Rupee values on the Planning boards are masked. Cannot change plans or milestones. The CRM itself still needs its tick unless the role is admin or sales.",
  },
  viewer: {
    means: "Read-only: sees the boards and nothing else.",
    limits: "Cannot add a task or a comment. No values. No doors.",
  },
  uploader: {
    means: "The Morning Update page only — drops the Jobmaster export.",
    limits: "Sees no board at all. Lands on Morning Update and stays there.",
  },
};

export const ROOM_TEXT: Record<string, { means: string; limits: string }> = {
  lc: { means: "Leadership Circle: the Delivered Jobs analysis and its figures.", limits: "Does not open any door and does not change what they may edit; it only shows the delivered-jobs workspace." },
  stratcom: { means: "Stratcom: the forward-looking figures (Delivery Outlook, Anticipated FY), the On Floor flag, and Delivered Jobs.", limits: "Does not make them a planner; writing the plan still follows the role." },
  management: { means: "Management: kept off the IDP cycle — no IDP is due from them and no red box appears.", limits: "Nothing else changes; the boards and doors follow the role and the ticks." },
};

export const DOOR_TEXT: Record<string, { means: string; limits: string }> = {
  crm: {
    means: "The CRM at /crm: companies, contacts, enquiries, opportunities, quotations, sales orders, the sales plan, Gmail and WhatsApp from inside it.",
    limits: "The CRM keeps its own records and rows are visible to everyone with the door — there is no per-salesperson wall yet. Gmail sends only from a connected mailbox. Quotation submission presses a PDF the customer receives; there is no approval step in front of it.",
  },
  hrms: {
    means: "HRMS at /hrms: the employee master with every personal field, salary structures, payroll runs, pay slips, appraisals, offers, F&F, statutory returns, the handbook's editing side.",
    limits: "This is the door to dates of birth, home addresses, bank accounts and pay. Only Dr Raghu and Vishwas may grant it. Mail from HRMS goes from Vinay's connected Gmail whoever presses Send. A person's OWN sheet, slips and IDP are reached at /idp without this door.",
  },
  accounts: {
    means: "Kuber at /kuber: the books from Tally — ledgers, bills, bank, BGs, FDs, loans, insurance, compliance, MIS.",
    limits: "Read and reconcile; Tally stays the master and nothing here posts back to it. Figures show in ₹/Lakhs/Crores by the screen's own picker.",
  },
  vishwakarma: {
    means: "Vishwakarma at /vishwakarma: design projects, problems, ideas, references, reviews, the week's work.",
    limits: "No link into the ERP's drawings; what is here is what people wrote here.",
  },
  seva: {
    means: "Seva at /seva: every delivered machine, AMCs, customer issues and their pushes.",
    limits: "Reads the ERP's AMC and delivery data; does not write to the ERP.",
  },
  ims: {
    means: "IMS at /ims: standards and clauses, documents and revisions, registers (HIRA, aspect–impact, MoM), audits, CAPA, NCs, training, welding records, certificates.",
    limits: "Inside the IMS a second role applies: member, department head, auditor or IMS admin (MR). Approvals follow the department head; only the MR changes settings, number series and certification paths.",
  },
  saamaan: {
    means: "Saamaan at /saamaan: items, warehouses, RBOMs, MRPs, kitting, slips, purchase orders and suppliers pulled from the ERP.",
    limits: "The ERP stays the master for items, POs and suppliers — Saamaan pulls, it does not push. Issuing on a slip does not yet reduce stock.",
  },
  marketing: {
    means: "Marketing at /marketing: leads (people and companies, the Apollo imports included), lists, e-mail campaigns with templates and Genie on the message, sending channels, the unsubscribe list.",
    limits: "A member sees only the records they made or were assigned; sales people and managers see all. Opportunities, deals and Eva briefs are not in Marketing at all. Notes and sends are of self only. Channels are set by sales and managers; Apollo imports never appear in the CRM's own Company list.",
  },
  goals: {
    means: "The goal tree at Planning → Goals: see it (view) or shape it (edit).",
    limits: "Work assigned to a person reaches them on My Week whether or not they hold this; the grant only governs seeing the tree. Nobody but the owner holds it by default, admins included.",
  },
  lms: { means: "The LMS at /lms — every login has it.", limits: "Progress is their own; HR reads the roll-up." },
  idp: { means: "The person's own sheet at /idp — record, slips, leave and loan registers, IDP, learning goals, handbook, HR queries. Every login has it.", limits: "Their own and only their own; a manager sees reportees' IDPs through the reporting-staff box, not the sheet." },
};

/** The whole story for one person, as paragraphs. */
export function accessStory(u: {
  role: string; lc?: boolean; stratcom?: boolean; management?: boolean; goals_level?: string;
  crm_access?: boolean; marketing_access?: boolean; hrms_access?: boolean; accounts_access?: boolean; vishwakarma_access?: boolean; seva_access?: boolean; ims_access?: boolean; saamaan_access?: boolean;
  isOwner?: boolean;
}): { title: string; means: string; limits: string }[] {
  const out: { title: string; means: string; limits: string }[] = [];
  if (u.isOwner) out.push({ title: "Owner", means: "The one account above admin: every door, every room, Goals, the Users page, and the only hand that may make or change an admin.", limits: "Cannot be disabled, removed or demoted by anyone, itself included." });
  const r = ROLE_TEXT[u.role]; if (r) out.push({ title: `Role: ${u.role.replace("_", " ")}`, ...r });
  for (const k of ["lc", "stratcom", "management"] as const) if (u[k]) out.push({ title: `Room: ${k === "lc" ? "Leadership Circle" : k[0].toUpperCase() + k.slice(1)}`, ...ROOM_TEXT[k] });
  if (u.goals_level && u.goals_level !== "none") out.push({ title: `Goals: can ${u.goals_level}`, ...DOOR_TEXT.goals });
  for (const k of ["crm", "marketing", "hrms", "accounts", "vishwakarma", "seva", "ims", "saamaan"] as const)
    if (u[`${k}_access`] || u.isOwner) out.push({ title: `Door: ${k === "accounts" ? "Kuber" : k === "crm" || k === "ims" ? k.toUpperCase() : k[0].toUpperCase() + k.slice(1)}`, ...DOOR_TEXT[k] });
  out.push({ title: "Always: LMS and their own sheet", means: `${DOOR_TEXT.lms.means} ${DOOR_TEXT.idp.means}`, limits: `${DOOR_TEXT.lms.limits} ${DOOR_TEXT.idp.limits}` });
  return out;
}
