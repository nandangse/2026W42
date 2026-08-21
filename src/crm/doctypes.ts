/**
 * THE DOCTYPE REGISTRY.
 *
 * Dr Raghu's instruction: "in every doctype there has to be a facility to add
 * records". The way to keep that true is to make it impossible to add a
 * doctype WITHOUT one -- so a doctype is declared once, here, and the list
 * screen, the add form, the validation and the API all read this. There is no
 * per-doctype screen to forget to build.
 *
 * Adding a doctype is one entry in DOCTYPES. It gets a list, an Add button, a
 * form with the right controls, link dropdowns and server-side validation the
 * moment it appears.
 */

export type FieldType =
  | "text" | "textarea" | "number" | "money" | "date" | "bool" | "select" | "link" | "readonly";

export interface Field {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  /** For select. */
  options?: string[];
  /** For link — the doctype this points at. */
  link?: string;
  /** Show in the list table. Keep it to the few columns worth scanning. */
  inList?: boolean;
  help?: string;
  /** Sensible starting value on the add form. */
  default?: string | number | boolean;
}

export interface Doctype {
  /** URL slug and API path. */
  name: string;
  label: string;
  plural: string;
  /** The Postgres table. */
  table: string;
  /** Which column names a row, for link dropdowns and the list's first column. */
  titleField: string;
  /** Grouping in the sidebar. */
  group: string;
  icon: string;
  fields: Field[];
  orderBy?: { column: string; ascending: boolean };
  /** A number_series code — filled by the database on insert. */
  autoNumber?: { field: string; series: string };
  /** One line, shown above the list. Say what the doctype is FOR. */
  blurb?: string;
}

export const DOCTYPES: Doctype[] = [
  // ------------------------------------------------------------ masters
  {
    name: "sector", label: "Sector", plural: "Sectors", table: "sector",
    titleField: "name", group: "Masters", icon: "◆",
    orderBy: { column: "sort_order", ascending: true },
    blurb: "What Nandan makes. Six codes, read from 2,500 live opportunity rows. The names are still the codes — they need your expansions.",
    fields: [
      { name: "code", label: "Code", type: "text", required: true, inList: true },
      { name: "name", label: "Name", type: "text", required: true, inList: true },
      { name: "sort_order", label: "Order", type: "number", inList: true, default: 0 },
      { name: "active", label: "Active", type: "bool", inList: true, default: true },
    ],
  },
  {
    name: "industry", label: "Industry", plural: "Industries", table: "industry",
    titleField: "name", group: "Masters", icon: "◈",
    orderBy: { column: "name", ascending: true },
    blurb: "What the customer does — and who is going after it. Your 253 industries already carry a sector, a priority, an owner and a qualification.",
    fields: [
      { name: "name", label: "Industry", type: "text", required: true, inList: true },
      { name: "sector_id", label: "Sector", type: "link", link: "sector", inList: true },
      { name: "priority", label: "Priority", type: "select", options: ["Low", "Medium", "High", "Highest"], inList: true },
      { name: "goal_qualification", label: "Qualification", type: "select", options: ["FOCUS", "REGULAR", "Customer B10"], inList: true },
      { name: "owner_user_id", label: "Owner", type: "link", link: "crm_user", inList: true },
      { name: "erp_name", label: "ERP name", type: "text", help: "The ERPNext key, so the link survives a rename on either side." },
      { name: "active", label: "Active", type: "bool", default: true },
    ],
  },
  {
    name: "stage", label: "Stage", plural: "Stages", table: "stage",
    titleField: "name", group: "Masters", icon: "▰",
    orderBy: { column: "sort_order", ascending: true },
    blurb: "The fourteen rungs, as rows. Reordering is a change to a number here — never a migration. This order is still my guess.",
    fields: [
      { name: "name", label: "Stage", type: "text", required: true, inList: true },
      { name: "code", label: "Code", type: "text", required: true },
      { name: "sort_order", label: "Order", type: "number", required: true, inList: true, default: 0 },
      { name: "weight_pct", label: "Weight %", type: "number", inList: true, help: "How likely a deal parked here is to convert. Drives the forecast." },
      { name: "colour", label: "Colour", type: "text", default: "#5E86A8" },
      { name: "is_terminal", label: "Terminal", type: "bool", inList: true, help: "A dead end. Sits outside the ladder on the board." },
      { name: "is_won", label: "Won", type: "bool", inList: true },
      { name: "active", label: "Active", type: "bool", default: true },
    ],
  },
  {
    name: "crm_user", label: "User", plural: "Users", table: "crm_user",
    titleField: "display_name", group: "Masters", icon: "●",
    orderBy: { column: "display_name", ascending: true },
    blurb: "A mirror of the Genie account, not a second user list. A row existing here IS access to the CRM.",
    fields: [
      { name: "display_name", label: "Name", type: "text", required: true, inList: true },
      { name: "email", label: "Email", type: "text", required: true, inList: true },
      { name: "initials", label: "Initials", type: "text", inList: true },
      { name: "crm_role", label: "Role", type: "select", options: ["sales_head", "salesperson", "sales_admin", "viewer"], inList: true, default: "salesperson" },
      { name: "reports_to", label: "Reports to", type: "link", link: "crm_user" },
      { name: "active", label: "Active", type: "bool", inList: true, default: true },
    ],
  },

  // ------------------------------------------------- accounts and people
  {
    name: "customer", label: "Customer", plural: "Customers", table: "customer",
    titleField: "name", group: "Accounts", icon: "■",
    orderBy: { column: "created_at", ascending: false },
    blurb: "The account. One row per company you sell to.",
    fields: [
      { name: "name", label: "Customer", type: "text", required: true, inList: true },
      { name: "industry_id", label: "Industry", type: "link", link: "industry", inList: true },
      { name: "owner_user_id", label: "Owner", type: "link", link: "crm_user", inList: true },
      { name: "gstin", label: "GSTIN", type: "text", inList: true },
      { name: "country", label: "Country", type: "text", default: "India" },
      { name: "is_export", label: "Export customer", type: "bool", inList: true, help: "Decides which terms and which price book a quote starts with." },
      { name: "website", label: "Website", type: "text" },
      { name: "erp_name", label: "ERP name", type: "text" },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },
  {
    name: "address", label: "Address", plural: "Addresses", table: "address",
    titleField: "label", group: "Accounts", icon: "▫",
    orderBy: { column: "created_at", ascending: false },
    blurb: "Several per customer. A quotation names one of these, so it has to be a row rather than free text on the quote.",
    fields: [
      { name: "customer_id", label: "Customer", type: "link", link: "customer", required: true, inList: true },
      { name: "label", label: "Label", type: "select", options: ["Billing", "Shipping", "Works", "Office"], inList: true, default: "Billing" },
      { name: "line1", label: "Address line 1", type: "text", inList: true },
      { name: "line2", label: "Address line 2", type: "text" },
      { name: "city", label: "City", type: "text", inList: true },
      { name: "state", label: "State", type: "text", inList: true },
      { name: "state_code", label: "GST state code", type: "text", inList: true, help: "This is what decides IGST against CGST plus SGST. Every ERP address currently says 00 — Pune should be 27." },
      { name: "pincode", label: "PIN", type: "text" },
      { name: "country", label: "Country", type: "text", default: "India" },
      { name: "is_primary", label: "Primary", type: "bool" },
    ],
  },
  {
    name: "contact", label: "Contact", plural: "Contacts", table: "contact",
    titleField: "full_name", group: "Accounts", icon: "○",
    orderBy: { column: "created_at", ascending: false },
    blurb: "The person. 63% of the ones in your ERP are attached to no company at all.",
    fields: [
      { name: "first_name", label: "First name", type: "text", required: true, inList: true },
      { name: "last_name", label: "Last name", type: "text", inList: true },
      { name: "customer_id", label: "Customer", type: "link", link: "customer", inList: true },
      { name: "designation", label: "Designation", type: "text", inList: true },
      { name: "email", label: "Email", type: "text", inList: true },
      { name: "salutation", label: "Salutation", type: "select", options: ["Mr", "Ms", "Dr", "Capt", "Cdr", "Lt Cdr", "Col"] },
      { name: "is_primary", label: "Primary contact", type: "bool" },
      { name: "active", label: "Active", type: "bool", default: true },
    ],
  },
  {
    name: "contact_phone", label: "Phone number", plural: "Phone numbers", table: "contact_phone",
    titleField: "number_e164", group: "Accounts", icon: "✆",
    orderBy: { column: "created_at", ascending: false },
    blurb: "Its own doctype because a call arrives as a NUMBER with nobody attached, so the lookup runs backwards.",
    fields: [
      { name: "contact_id", label: "Contact", type: "link", link: "contact", required: true, inList: true },
      { name: "number_e164", label: "Number", type: "text", required: true, inList: true, help: "Stored as +919820012345. A number typed four ways is four numbers." },
      { name: "kind", label: "Kind", type: "select", options: ["mobile", "landline", "whatsapp"], inList: true, default: "mobile" },
      { name: "is_primary", label: "Primary", type: "bool", inList: true },
    ],
  },

  // ------------------------------------------------------------- funnel
  {
    name: "deal", label: "Deal", plural: "Deals", table: "deal",
    titleField: "title", group: "Funnel", icon: "▶",
    orderBy: { column: "created_at", ascending: false },
    autoNumber: { field: "deal_no", series: "deal" },
    blurb: "The thing that moves, from Suspect to Order Received. Every stage change is timed automatically.",
    fields: [
      { name: "title", label: "Deal", type: "text", required: true, inList: true, help: "What is being sold, in words." },
      { name: "customer_id", label: "Customer", type: "link", link: "customer", inList: true },
      { name: "stage_id", label: "Stage", type: "link", link: "stage", required: true, inList: true },
      { name: "sector_id", label: "Sector", type: "link", link: "sector", inList: true },
      { name: "owner_user_id", label: "Salesperson", type: "link", link: "crm_user", inList: true },
      { name: "value_estimate", label: "Value", type: "money", inList: true },
      { name: "expected_close_date", label: "Expected close", type: "date", inList: true },
      { name: "primary_contact_id", label: "Contact", type: "link", link: "contact" },
      { name: "priority", label: "Priority", type: "select", options: ["Standard", "Red Hot Lead", "Very Important", "Long Term"], default: "Standard" },
      { name: "source", label: "Source", type: "select", options: ["Email", "Indiamart", "Google Ad", "Nandan Website", "GEM Tender", "Referral", "Inbound", "WhatsApp"], help: "95.6% blank in the ERP — which is why you cannot tell an automatic deal from a typed one." },
      { name: "is_tender", label: "Tender", type: "bool" },
      { name: "budget_pct", label: "Budget %", type: "number" },
      { name: "authority_pct", label: "Authority %", type: "number" },
      { name: "need_pct", label: "Need %", type: "number" },
      { name: "timing_pct", label: "Timing %", type: "number" },
      { name: "competitiveness_pct", label: "Competitiveness %", type: "number" },
      { name: "technically_qualified_pct", label: "Technically qualified %", type: "number" },
    ],
  },
];

export function doctypeBySlug(slug: string): Doctype | undefined {
  return DOCTYPES.find((d) => d.name === slug);
}

/** Every doctype a link field points at, so the API knows what to preload. */
export function linkTargets(d: Doctype): string[] {
  return Array.from(new Set(d.fields.filter((f) => f.type === "link" && f.link).map((f) => f.link as string)));
}

export const DOCTYPE_GROUPS = ["Funnel", "Accounts", "Masters"] as const;
