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
 *
 * Rewired 24 Aug 2026 onto the handover model (0001_core.sql): company /
 * person / lead / opportunity / product / task, with Dr Raghu's own sector,
 * industry and fourteen-stage funnel carried across as rows.
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
  /** Narrow the link's dropdown — the two stage ladders share one table. */
  linkFilter?: { column: string; value: string };
  /** Show in the list table. Keep it to the few columns worth scanning. */
  inList?: boolean;
  help?: string;
  /** Sensible starting value on the add form. */
  default?: string | number | boolean;
  /** How a readonly value renders — the database computes it, we dress it. */
  format?: "money" | "pct";
  /** Not a real column — the route computes it (counts). Never sorted on,
   *  never written, never filtered. */
  virtual?: boolean;
  /** Keep this field out of the filter bar. */
  noFilter?: boolean;
  /** A textarea that deserves the whole row and real height. */
  big?: boolean;
  /** A textarea that edits in the common rich text box. */
  rich?: boolean;
  /** A text field whose distinct values make a filter dropdown — for a
   *  column like Item Group where the answers are finite but not declared. */
  filterDistinct?: boolean;
  /** Which lightbox tab the field lives on — absent means Details. */
  tab?: "enquiry" | "qual" | "eva";
  /** Shown only while Is Tender is ticked — the tender unfolds. */
  tenderOnly?: boolean;
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
  /** Only these emails may see or touch this doctype. Checked by the API,
   *  not just hidden by the sidebar. */
  onlyFor?: string[];
}

/** The three pipelines. NEVER merged into one funnel — a ₹4 Cr hi-lift and a
 *  ₹40,000 spares order must not share a conversion rate. */
export const PIPELINES = ["capital", "aftermarket", "spares"] as const;

/** Where a lead can come from — mirrors the lead_source enum in Postgres. */
export const LEAD_SOURCES = [
  "indiamart", "whatsapp", "email", "google_ads", "linkedin",
  "phone", "exhibition", "website", "referral", "field_visit", "tender", "other",
] as const;

export const DOCTYPES: Doctype[] = [
  // ---------------------------------------------------------- quotations
  // The main section: everything upstream exists so that one of these can
  // go out. Money on a quote is computed by Postgres (recalc_quotation) the
  // moment a line is saved — the totals here are read, never typed.
  {
    name: "quotation", label: "Quotation", plural: "Quotations", table: "quotation",
    titleField: "quote_no", group: "Quotations", icon: "📄",
    orderBy: { column: "updated_at", ascending: false },
    autoNumber: { field: "quote_no", series: "quotation" },
    blurb: "Where the funnel earns its keep. The totals fill themselves from the lines — the front end displays money, it never calculates it.",
    // LEANED to Dr Raghu's hand (30 Aug 2026): "quote value should not be
    // here… remove all the other things". Money is the lines' business —
    // the one Value shown is the computed grand total.
    fields: [
      { name: "quote_no", label: "Quote No", type: "readonly", inList: true, help: "NGSE/QTN/26-27/00001, issued by the database on save." },
      { name: "quoted_on", label: "Date of quote", type: "date", inList: true, default: "today", help: "The business date the quote went out." },
      // A QUOTE MAY STAND ALONE (Dr Raghu, 31 Aug 2026: "opportunity is not
      // compulsory. It can be made without opportunity too"). The database
      // has allowed it since CRM migration 0028 — and 16,764 of the 17,345
      // quotations on record already have no opportunity against them, the
      // ERP's own imports among them. Only this add-form still argued.
      { name: "opportunity_id", label: "Opportunity", type: "link", link: "opportunity", inList: true, noFilter: true,
        help: "Optional — a quote can be raised on its own. Linking one lets the deal, its stage and its forecast follow the quote." },
      { name: "company_id", label: "Company", type: "link", link: "company", inList: true },
      { name: "contact_id", label: "Contact", type: "link", link: "person", noFilter: true },
      { name: "owner_id", label: "Salesperson", type: "link", link: "profile", inList: true, default: "me" },
      { name: "stage_id", label: "Closure", type: "link", link: "stage", inList: true,
        linkFilter: { column: "entity", value: "quotation" },
        help: "Draft until it is SENT (Dr Raghu, 30 Aug 2026); then the closure ladder. A Lost or Not Target move needs a reason first." },
      { name: "status", label: "Status", type: "select", inList: true, default: "draft",
        options: ["draft", "live", "hotlist", "submitted", "cancelled", "lost", "expired"],
        help: "Draft until it goes out; Live once it is; Hotlist when it deserves the daily chase; Lost and Expired close it." },
      { name: "lost_reason", label: "Lost reason", type: "textarea", tab: "qual", help: "Required by the database before a move to Lost or Not Target." },
      { name: "lost_to_competitor", label: "Lost to", type: "text", tab: "qual" },
      { name: "address_id", label: "Address", type: "link", link: "address", noFilter: true,
        help: "The client's address on the quote — defaults to theirs the moment the company is set." },
      { name: "valid_until", label: "Valid until", type: "date", inList: true, default: "end_next_month",
        help: "The last date of next month unless said otherwise." },
      { name: "delivery_weeks", label: "Delivery", type: "text", default: "8-12 weeks" },
      { name: "payment_terms", label: "Payment terms", type: "link", link: "payment_term", noFilter: true,
        help: "From the Payment Terms master — add new terms there." },
      { name: "warranty_months", label: "Warranty (months)", type: "number", default: 12 },
      { name: "grand_total", label: "Value", type: "readonly", format: "money", inList: true, help: "The grand total, computed from the lines. Zero until lines exist." },
      { name: "scope_of_supply", label: "Scope of supply", type: "textarea" },
      { name: "exclusions", label: "Exclusions", type: "textarea" },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },

  // ------------------------------------------------------------- masters
  {
    name: "tax_master", label: "Tax", plural: "Taxes", table: "tax_master",
    titleField: "name", group: "Masters", icon: "🧾",
    orderBy: { column: "sort_order", ascending: true },
    blurb: "The Taxes master (Dr Raghu, 30 Aug 2026). A quote picks its scheme here — IGST outside Maharashtra, CGST + SGST within.",
    fields: [
      { name: "name", label: "Tax", type: "text", required: true, inList: true },
      { name: "total_pct", label: "Rate %", type: "number", required: true, inList: true },
      { name: "sort_order", label: "Order", type: "number", inList: true, default: 0 },
      { name: "is_default", label: "Default", type: "bool", inList: true, help: "Picked when a quote has no address to decide by." },
    ],
  },
  {
    name: "quote_template", label: "Quote Template", plural: "Quote Templates", table: "quote_template",
    titleField: "name", group: "Masters", icon: "📋",
    orderBy: { column: "sort_order", ascending: true },
    blurb: "The default texts a quotation starts from (Dr Raghu, 30 Aug 2026): Terms & Conditions sets and Covering Letter flavours. Edit here once, and every new quote picks it up.",
    fields: [
      { name: "kind", label: "Kind", type: "select", required: true, inList: true, options: ["terms", "letter"], help: "terms = Terms & Conditions; letter = Covering Letter." },
      { name: "name", label: "Name", type: "text", required: true, inList: true },
      { name: "sort_order", label: "Order", type: "number", inList: true, default: 0 },
      { name: "content", label: "Default text", type: "textarea", big: true, rich: true },
    ],
  },
  {
    name: "payment_term", label: "Payment Term", plural: "Payment Terms", table: "payment_term",
    titleField: "name", group: "Masters", icon: "💳",
    orderBy: { column: "sort_order", ascending: true },
    blurb: "The Payment Terms master (Dr Raghu, 30 Aug 2026). Every quotation picks from this list.",
    fields: [
      { name: "name", label: "Payment term", type: "text", required: true, inList: true },
      { name: "sort_order", label: "Order", type: "number", inList: true, default: 0 },
    ],
  },
  {
    name: "quotation_line", label: "Quote line", plural: "Quote lines", table: "quotation_line",
    titleField: "description", group: "Quotations", icon: "📃",
    orderBy: { column: "created_at", ascending: false },
    blurb: "One row per item on a quote. Saving a line recalculates its quotation's totals in the database, immediately.",
    fields: [
      { name: "quotation_id", label: "Quotation", type: "link", link: "quotation", required: true, inList: true },
      { name: "line_no", label: "Line", type: "number", required: true, inList: true, default: 1 },
      { name: "indent", label: "Indent", type: "number", default: 0, noFilter: true, help: "0 = a main line (1, 2, 3…); 1 = indented under the line above (1.1, 1.2…)." },
      { name: "item_group", label: "Item Group", type: "text", noFilter: true },
      { name: "product_id", label: "Product", type: "link", link: "product", inList: true },
      { name: "description", label: "Description", type: "text", required: true, inList: true },
      { name: "discountable", label: "Discount applies", type: "bool", default: true, help: "Unticked, the quote's header discount leaves this line alone." },
      { name: "quantity", label: "Qty", type: "number", inList: true, default: 1 },
      { name: "uom", label: "UOM", type: "text", default: "Nos" },
      { name: "unit_price", label: "Unit price", type: "money", inList: true },
      { name: "unit_cost", label: "Unit cost", type: "money", help: "What margin is measured against." },
      { name: "discount_pct", label: "Discount %", type: "number" },
      { name: "gst_rate", label: "GST %", type: "number", default: 18 },
      { name: "is_optional", label: "Optional line", type: "bool", help: "Shown on the quote, excluded from the totals." },
      { name: "line_total", label: "Line total", type: "readonly", format: "money", inList: true },
    ],
  },

  {
    name: "sales_order", label: "Sales Order", plural: "Sales Orders", table: "sales_order",
    titleField: "so_no", group: "Quotations", icon: "🧾",
    autoNumber: { field: "so_no", series: "sales_order" },
    orderBy: { column: "updated_at", ascending: false },
    blurb: "The pipeline's destination. ERPNext remains the system of record for the order's life — this row is the CRM's handle on it.",
    fields: [
      { name: "so_no", label: "SO No", type: "text", inList: true, help: "Issued by Genie on save (continues past the ERP's largest); imported rows keep their ERP number." },
      { name: "company_id", label: "Company", type: "link", link: "company", inList: true },
      { name: "amount", label: "Value", type: "money", inList: true },
      { name: "ordered_on", label: "Ordered", type: "date", inList: true },
      { name: "owner_id", label: "Salesperson", type: "link", link: "profile", inList: true },
      { name: "erp_status", label: "ERP status", type: "text", inList: true },
      { name: "delivery_on", label: "Delivery", type: "date" },
      { name: "sector_id", label: "Sector", type: "link", link: "sector" },
      { name: "quotation_id", label: "Quotation", type: "link", link: "quotation" },
      { name: "opportunity_id", label: "Opportunity", type: "link", link: "opportunity" },
      { name: "acquisition_source", label: "Acquisition source", type: "text" },
      { name: "notes", label: "Story of the acquisition", type: "textarea" },
    ],
  },

  // ------------------------------------------------------------- funnel
  {
    name: "lead", label: "Lead", plural: "Leads", table: "lead",
    titleField: "contact_name", group: "Funnel", icon: "📥",
    orderBy: { column: "updated_at", ascending: false },
    blurb: "Every inbound message becomes a row here — junk included, as 'spam'. The denominator is what tells you what portal traffic actually costs.",
    fields: [
      { name: "contact_name", label: "Name", type: "text", inList: true },
      { name: "company_name", label: "Company (as written)", type: "text", inList: true },
      { name: "source", label: "Source", type: "select", options: [...LEAD_SOURCES], required: true, inList: true },
      { name: "status", label: "Status", type: "select", inList: true, default: "new",
        options: ["new", "triaging", "mql", "sql", "converted", "nurture", "disqualified", "spam"] },
      { name: "pipeline", label: "Pipeline", type: "select", options: [...PIPELINES], inList: true },
      { name: "owner_id", label: "Owner", type: "link", link: "profile", inList: true },
      { name: "contact_email", label: "Email", type: "text" },
      { name: "contact_phone", label: "Phone", type: "text", help: "As received. Stored raw here; it becomes E.164 on the person record." },
      { name: "city", label: "City", type: "text" },
      { name: "country", label: "Country", type: "text" },
      { name: "product_interest", label: "Product interest", type: "text" },
      { name: "quantity_hint", label: "Quantity", type: "number" },
      { name: "raw_subject", label: "Subject", type: "text" },
      { name: "raw_body", label: "Message", type: "textarea" },
      { name: "company_id", label: "Matched company", type: "link", link: "company" },
      { name: "person_id", label: "Matched person", type: "link", link: "person" },
    ],
  },
  {
    name: "opportunity", label: "Opportunity", plural: "Opportunities", table: "opportunity",
    titleField: "name", group: "Funnel", icon: "🎯",
    // Date, newest first (Dr Raghu, 29 Aug 2026) — the long blurb is gone,
    // the one line that remains says how the list is sorted
    orderBy: { column: "opportunity_on", ascending: false },
    autoNumber: { field: "opportunity_no", series: "opportunity" },
    blurb: "Sorted by Date — newest first.",
    fields: [
      { name: "opportunity_no", label: "ENQ No", type: "readonly", inList: true, help: "Issued by the database on save. Imported rows keep their ERP number." },
      { name: "name", label: "Opportunity", type: "text", required: true, inList: true, help: "What is being sold, in words." },
      { name: "enquiry_info", label: "Enquiry Info", type: "textarea", big: true, tab: "enquiry",
        help: "The enquiry as it arrived — the customer's own words. 2,087 carried in from the ERP." },
      { name: "company_id", label: "Company", type: "link", link: "company", inList: true },
      { name: "contact_id", label: "Contact", type: "link", link: "person", help: "The one person this enquiry speaks to — 1:1 with the ERP's contact; the importer keeps it true." },
      { name: "opportunity_on", label: "Date", type: "date", inList: true, default: "today",
        help: "The business date the enquiry arrived — the ERP's Opportunity Date, distinct from when the row was written." },
      { name: "stage_id", label: "Stage", type: "link", link: "stage", required: true, inList: true,
        linkFilter: { column: "entity", value: "opportunity" },
        help: "New → Waiting for Data → Consultative Presentation. From there the deal lives on its quotation." },
      { name: "pipeline", label: "Pipeline", type: "select", options: [...PIPELINES], required: true, inList: true, default: "capital" },
      { name: "sector_id", label: "Sector", type: "link", link: "sector", inList: true },
      { name: "product_family", label: "Product family", type: "text", inList: true, help: "AGSE - Ambulift, MHE - Trollies… the ERP's Product Group, as text." },
      { name: "product_id", label: "Product", type: "link", link: "product", help: "The real catalogue SKU, once the catalogue is seeded." },
      { name: "company_industry", label: "Industry", type: "readonly", virtual: true, inList: true, help: "The customer's industry, read from the company." },
      { name: "banttc_score", label: "BANTTC", type: "readonly", virtual: true, inList: true, help: "Weighted: Budget ×2, Authority, Need ×2, Timing ×2, Tech. Qualified, Competitiveness." },
      { name: "owner_id", label: "Salesperson", type: "link", link: "profile", inList: true },
      { name: "amount", label: "Value", type: "money", inList: true },
      { name: "expected_close_on", label: "Expected close", type: "date", inList: true },
      // noFilter: a 133k-person dropdown filters nobody (Dr Raghu, 26 Aug 2026)
      { name: "point_of_contact_id", label: "Contact", type: "link", link: "person", noFilter: true },
      { name: "source", label: "Source", type: "select", options: [...LEAD_SOURCES] },
      { name: "is_tender", label: "Tender", type: "bool", help: "Tick it and the tender's own fields unfold below." },
      { name: "tender_reference", label: "Tender Reference", type: "text", tenderOnly: true },
      { name: "tender_source", label: "Tender source", type: "text", tenderOnly: true, noFilter: true },
      { name: "tender_source_link", label: "Tender Source Link", type: "text", tenderOnly: true },
      { name: "tender_issued_on", label: "Date issued", type: "date", tenderOnly: true },
      { name: "tender_due_on", label: "Due date of tender", type: "date", tenderOnly: true },
      { name: "tender_submission", label: "Tender submission", type: "text", tenderOnly: true },
      { name: "tender_doc_url", label: "Tender Doc (Drive)", type: "text", tenderOnly: true, help: "Paste the Drive link." },
      { name: "tender_prep_folder", label: "Tender Prep Folder (Drive)", type: "text", tenderOnly: true, help: "Paste the Drive folder link." },
      { name: "product_suitability_pct", label: "Product suitable to be made by us %", type: "number", default: 50, tenderOnly: true },
      { name: "tender_timeframe", label: "Time Frame of Tender Submission", type: "select", tenderOnly: true, noFilter: true,
        options: ["One Month", "Two Months", "Three Months", "Four Months", "Five Months", "Six Months", "Seven Months", "Eight Months", "Nine Months", "Ten Months", "Twelve Months", "More than Twelve Months"] },
      { name: "project_type", label: "Type of the Project", type: "select", tenderOnly: true, noFilter: true,
        options: ["Design Development", "Standard Project Tender", "Standard Product Tender", "Standard GSE Tender", "Build to Print", "Export", "Plain RFI or Budgetory", "Contract Manufacturing", "Sample Project with Volumens in Future"] },
      { name: "tender_involvement", label: "Tender Involvement", type: "text", tenderOnly: true, noFilter: true },
      { name: "project_value_band", label: "Value of the Project", type: "select", tenderOnly: true, noFilter: true,
        options: ["Less than 5 lakhs", "5 to 10 Lakhs", "10 to 50 Lakhs", "Above 50 lakhs"] },
      { name: "delivery_period", label: "Deliver Period", type: "select", tenderOnly: true, noFilter: true,
        options: ["One Month", "Two Months", "Three Months", "Four Months", "Five Months", "Six Months", "Seven Months", "Eight Months", "Nine Months", "Ten Months", "Twelve Months", "More than Twelve Months"] },
      { name: "tender_support", label: "Type of Support for Closing", type: "text", tenderOnly: true, noFilter: true },
      { name: "tender_details", label: "Tender details", type: "textarea", big: true, tenderOnly: true },
      { name: "budget_pct", label: "Budget %", type: "number", default: 50, tab: "enquiry" },
      { name: "authority_pct", label: "Authority %", type: "number", default: 50, tab: "enquiry" },
      { name: "need_pct", label: "Need %", type: "number", default: 50, tab: "enquiry" },
      { name: "timing_pct", label: "Timing %", type: "number", default: 50, tab: "enquiry" },
      { name: "competitiveness_pct", label: "Competitiveness %", type: "number", default: 50, tab: "enquiry" },
      { name: "technically_qualified_pct", label: "Technically qualified %", type: "number", default: 50, tab: "enquiry" },
      { name: "lost_reason", label: "Lost reason", type: "textarea", tab: "enquiry", help: "Required by the database before a move to Quote Lost or Not Target." },
      { name: "lost_to_competitor", label: "Lost to", type: "text", tab: "enquiry" },
    ],
  },
  {
    name: "task", label: "Task", plural: "Tasks", table: "task",
    titleField: "title", group: "Funnel", icon: "✅",
    orderBy: { column: "updated_at", ascending: false },
    blurb: "Follow-ups, by hand today and from call recordings and the AI later. The source column remembers which.",
    fields: [
      { name: "title", label: "Task", type: "text", required: true, inList: true },
      { name: "assignee_id", label: "Assignee", type: "link", link: "profile", inList: true },
      { name: "status", label: "Status", type: "select", inList: true, default: "todo",
        options: ["todo", "in_progress", "blocked", "done", "cancelled"] },
      { name: "priority", label: "Priority (1 high – 5 low)", type: "number", inList: true, default: 3 },
      { name: "due_at", label: "Due", type: "date", inList: true },
      { name: "body", label: "Detail", type: "textarea" },
    ],
  },

  {
    name: "interaction", label: "Interaction", plural: "Interactions", table: "interaction",
    titleField: "remark", group: "Funnel", icon: "🤝",
    orderBy: { column: "happened_at", ascending: false },
    blurb: "Phone calls and visits, logged against anything — a lead, a person, a company, a quote, a sales order. The Warmer/Colder read is the pulse of the deal.",
    fields: [
      { name: "kind", label: "Type", type: "select", inList: true, default: "Follow Up Call",
        options: ["Follow Up Call", "Cold call", "Follow Up Visit", "Cold Visit", "Existing Customer Visit", "Video Call", "Zoom Meeting", "SMS or Whatsapp", "Mail", "Internal"] },
      { name: "result", label: "Result", type: "select", inList: true,
        options: ["Warmer", "Colder", "Status Quo", "Closed Lost", "Closed Won"] },
      // logging a call starts on TODAY, BY the person logging it
      // (Dr Raghu, 29 Aug 2026) — both still changeable
      { name: "happened_at", label: "Date", type: "date", inList: true, default: "today" },
      { name: "by_id", label: "By", type: "link", link: "profile", inList: true, default: "me" },
      { name: "company_id", label: "Company", type: "link", link: "company", inList: true },
      { name: "person_name", label: "Spoke with", type: "text", inList: true },
      { name: "remark", label: "Remark", type: "textarea", required: true },
      { name: "next_action", label: "Next action", type: "text" },
      { name: "next_action_on", label: "Next action on", type: "date" },
      { name: "next_action_by", label: "Next action by", type: "link", link: "profile" },
      { name: "person_id", label: "Person", type: "link", link: "person" },
      { name: "lead_id", label: "Lead", type: "link", link: "lead" },
      { name: "opportunity_id", label: "Opportunity", type: "link", link: "opportunity" },
      { name: "quotation_id", label: "Quotation", type: "link", link: "quotation" },
      { name: "sales_order_id", label: "Sales Order", type: "link", link: "sales_order" },
    ],
  },

  /**
   * MEETINGS (Dr Raghu, 4 Sep 2026). Born from Zoom, never typed: the
   * webhook files the meeting, its people, Zoom's summary and the recording;
   * a person tags the deal and writes the MoM. Each one is also an
   * interaction of kind "Zoom Meeting" on the deal's timeline.
   */
  {
    name: "meeting", label: "Meeting", plural: "Meetings", table: "meeting",
    titleField: "topic", group: "Funnel", icon: "📹",
    orderBy: { column: "started_at", ascending: false },
    blurb: "Every Zoom call, as it happened: who was in the room, the date, Zoom's own summary, the recording — and the MoM in your hand. Tag it to the deal; it then sits on that deal's timeline as an interaction.",
    fields: [
      { name: "topic", label: "Meeting", type: "text", inList: true },
      { name: "started_at", label: "Date", type: "date", inList: true },
      { name: "attendee_names", label: "Attendees", type: "text", inList: true, help: "As Zoom saw them — matched to CRM contacts by email where it could." },
      { name: "duration_min", label: "Minutes", type: "number", inList: true },
      { name: "company_id", label: "Company", type: "link", link: "company", inList: true },
      { name: "opportunity_id", label: "Opportunity", type: "link", link: "opportunity", inList: true },
      { name: "quotation_id", label: "Quotation", type: "link", link: "quotation" },
      { name: "status", label: "Status", type: "select", inList: true, options: ["new", "tagged", "done"], help: "new = Genie could not tell the deal; tagged = it is on a deal; done = MoM written and circulated." },
      { name: "mom", label: "Minutes of meeting", type: "textarea", big: true, help: "Your hand. Zoom's summary sits below it, untouched." },
      { name: "summary", label: "Zoom AI summary", type: "textarea", big: true },
      { name: "recording_url", label: "Recording", type: "text", help: "Zoom's play link — opens in Zoom, with the account's passcode." },
      { name: "recording_drive_url", label: "Recording in Drive", type: "text" },
      { name: "host_email", label: "Host", type: "text" },
      { name: "zoom_meeting_id", label: "Zoom meeting id", type: "readonly" },
    ],
  },

  // ------------------------------------------------- accounts and people
  {
    name: "company", label: "Company", plural: "Companies", table: "company",
    titleField: "name", group: "Accounts", icon: "🏢",
    orderBy: { column: "updated_at", ascending: false },
    blurb: "The account. One row per company you sell to; is_customer flips by itself the first time an opportunity is won.",
    fields: [
      { name: "name", label: "Company", type: "text", required: true, inList: true },
      { name: "eva_brief", label: "EVA Brief", type: "textarea", big: true, tab: "eva",
        help: "The AI dossier — internet, LinkedIn, industry, news, our warmth and credibility. ✨ Generate writes it; edit freely after." },
      { name: "opp_count", label: "Opps", type: "readonly", virtual: true, inList: true, help: "Opportunities on this company." },
      { name: "contact_count", label: "Contacts", type: "readonly", virtual: true, inList: true },
      { name: "so_count", label: "Sales Orders", type: "readonly", virtual: true, inList: true, help: "Opportunities that reached Order Received." },
      { name: "industry_id", label: "Industry", type: "link", link: "industry", inList: true },
      { name: "account_owner_id", label: "Owner", type: "link", link: "profile", inList: true },
      { name: "gstin", label: "GSTIN", type: "text" },
      { name: "city", label: "City", type: "text", inList: true },
      { name: "country", label: "Country", type: "text", default: "India" },
      { name: "state", label: "State", type: "text" },
      { name: "is_export", label: "Export customer", type: "bool", inList: true, help: "Decides which terms and which price book a quote starts with." },
      { name: "is_customer", label: "Customer", type: "bool", inList: true, help: "Flips itself the first time an opportunity is won. Set by hand for history." },
      { name: "website", label: "Website", type: "text" },
      { name: "domain_name", label: "Email domain", type: "text", help: "nandan.co.in, not https://. Matches inbound mail to this account." },
      { name: "indiamart_glid", label: "IndiaMART GLID", type: "text" },
      { name: "cin", label: "CIN", type: "text", inList: true, help: "Corporate Identification Number — found by InstaFinancials, or read off the Drive report." },
      { name: "erp_name", label: "ERP name", type: "text", help: "The ERPNext key, so the link survives a rename on either side." },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },
  // Hidden from the sidebar (NAV lists doctypes by name): lives only as the
  // opportunity's "Deal contacts" tab — a person from ANY organization tied
  // to THIS deal (Dr Raghu, 28 Aug 2026: "if a contact is added which is
  // from other organization also its ok").
  {
    name: "opportunity_contact", label: "Deal Contact", plural: "Deal Contacts", table: "opportunity_contact",
    titleField: "note", group: "Funnel", icon: "🔗",
    blurb: "A person on this deal — from the customer, a consultant, a PMC, anyone. The person keeps their own company; this row records their part here.",
    fields: [
      { name: "opportunity_id", label: "Opportunity", type: "link", link: "opportunity", required: true },
      { name: "person_id", label: "Contact", type: "link", link: "person", required: true, inList: true, help: "Any organization's person. Type a name; if they don't exist yet, add them right there." },
      { name: "role", label: "Role in this deal", type: "select", inList: true, options: ["Decision maker", "Influencer", "User", "Consultant", "PMC", "Purchase", "Finance", "Other"] },
      { name: "note", label: "Note", type: "text", inList: true },
    ],
  },
  {
    name: "person", label: "Contact", plural: "Contacts", table: "person",
    titleField: "full_name", group: "Accounts", icon: "👥",
    orderBy: { column: "updated_at", ascending: false },
    blurb: "The person. 63% of the contacts in the ERP are attached to no company at all — attach them here.",
    fields: [
      { name: "first_name", label: "Name", type: "text", required: true, inList: true, help: "The whole name, as spoken. Nandan does not split names into first and last." },
      { name: "company_id", label: "Company", type: "link", link: "company", inList: true },
      { name: "job_title", label: "Designation", type: "text", inList: true },
      { name: "primary_email", label: "Email", type: "text", inList: true },
      { name: "primary_phone", label: "Phone", type: "text", inList: true, help: "Stored as +919820012345. A number typed four ways is four numbers." },
      { name: "birthday", label: "Birthday", type: "date", help: "A birthday wish opens doors (Dr Raghu, 30 Aug 2026) — filled by the InstaFinancials import where MCA knows it." },
      { name: "whatsapp_number", label: "WhatsApp", type: "text" },
      { name: "salutation", label: "Salutation", type: "select", options: ["Mr", "Ms", "Dr", "Capt", "Cdr", "Lt Cdr", "Col"] },
      { name: "department", label: "Department", type: "text" },
      { name: "owner_id", label: "Owner", type: "link", link: "profile" },
      { name: "is_decision_maker", label: "Decision maker", type: "bool" },
      { name: "is_primary", label: "Primary contact", type: "bool" },
      { name: "active", label: "Active", type: "bool", default: true },
    ],
  },
  {
    name: "address", label: "Address", plural: "Addresses", table: "address",
    titleField: "label", group: "Accounts", icon: "📍",
    orderBy: { column: "updated_at", ascending: false },
    blurb: "Several per company. A quotation names one of these, so it has to be a row rather than free text on the quote.",
    fields: [
      { name: "company_id", label: "Company", type: "link", link: "company", required: true, inList: true },
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
    name: "person_phone", label: "Phone number", plural: "Phone numbers", table: "person_phone",
    titleField: "number_e164", group: "Accounts", icon: "☎️",
    orderBy: { column: "created_at", ascending: false },
    blurb: "Its own doctype because a call arrives as a NUMBER with nobody attached, so the lookup runs backwards.",
    fields: [
      { name: "person_id", label: "Person", type: "link", link: "person", required: true, inList: true },
      { name: "number_e164", label: "Number", type: "text", required: true, inList: true, help: "Stored as +919820012345." },
      { name: "kind", label: "Kind", type: "select", options: ["mobile", "landline", "whatsapp"], inList: true, default: "mobile" },
      { name: "is_primary", label: "Primary", type: "bool", inList: true },
    ],
  },

  // ---------------------------------------------------------- catalogue
  {
    name: "product", label: "Product", plural: "Products", table: "product",
    titleField: "name", group: "Catalogue", icon: "📦",
    orderBy: { column: "sku", ascending: true },
    blurb: "The sellable catalogue, imported from the ERP Item table (Allow Sales = Yes, raw material excluded). For SALE only — Purchase Item is a pointer, never a purchase-side record.",
    fields: [
      { name: "item_group", label: "Item Group", type: "text", inList: true, filterDistinct: true,
        help: "The ERP's product family — filterable from the bar above the list." },
      { name: "name", label: "Item", type: "text", required: true, inList: true },
      { name: "sku", label: "Item ID", type: "text", required: true, inList: true, help: "The ERP item code. Unique — the database refuses a twin." },
      { name: "image", label: "Image", type: "text", inList: true, noFilter: true, help: "Shows small in the list and on the record; click to see it whole." },
      { name: "approved_price_inr", label: "Approved Price INR", type: "money", inList: true, help: "From the ERP's Standard Selling price list." },
      { name: "last_quoted_price", label: "Last Quoted Price", type: "money", inList: true, help: "The most recent ERP quotation line carrying this item." },
      { name: "last_quoted_on", label: "Last Quoted On", type: "date", noFilter: true },
      { name: "avg_quoted_price_1y", label: "Avg Quoted (1 yr)", type: "money", help: "Mean of every ERP quotation line for this item in the last twelve months." },
      { name: "alt_price_usd", label: "Alternate Price USD", type: "money", help: "From the ERP's US Dollar Selling price list." },
      { name: "delivery_period", label: "Delivery Period", type: "text" },
      { name: "throughput_pct", label: "Throughput %", type: "number" },
      { name: "purchase_item", label: "Purchase Item", type: "text", help: "The ERP purchase item this sale item is made from or bought as. A pointer only — Genie never imports the purchase side." },
      { name: "pipeline", label: "Pipeline", type: "select", options: [...PIPELINES], required: true, default: "capital" },
      { name: "description", label: "Description", type: "textarea", big: true, rich: true },
      { name: "optional_extras", label: "Optional Extras", type: "textarea", rich: true },
      { name: "notes", label: "Notes", type: "textarea", big: true, rich: true, help: "Everything else the ERP knew — UOM, brand, country, end of life…" },
      { name: "is_active", label: "Active", type: "bool", default: true },
    ],
  },

  {
    name: "sales_invoice", label: "Sales Invoice", plural: "Sales Invoices", table: "sales_invoice",
    titleField: "si_no", group: "Accounts", icon: "💰",
    orderBy: { column: "updated_at", ascending: false },
    onlyFor: ["raghu@nandan.co.in"],
    blurb: "The ONE source of truth of what we have accomplished. An order is a promise; the invoice is the fact. ERPNext raises them — this is the record.",
    fields: [
      { name: "si_no", label: "Invoice No", type: "text", required: true, inList: true, help: "As ERPNext issued it." },
      { name: "company_id", label: "Company", type: "link", link: "company", inList: true },
      { name: "amount", label: "Value", type: "money", inList: true },
      { name: "invoiced_on", label: "Invoiced", type: "date", inList: true },
      { name: "erp_status", label: "ERP status", type: "text", inList: true },
      { name: "owner_id", label: "Salesperson", type: "link", link: "profile", inList: true },
      { name: "due_on", label: "Due", type: "date" },
      { name: "sector_id", label: "Sector", type: "link", link: "sector" },
      { name: "sales_order_id", label: "Sales Order", type: "link", link: "sales_order", noFilter: true },
      { name: "opportunity_id", label: "Opportunity", type: "link", link: "opportunity", noFilter: true },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },

  {
    name: "message_variable", label: "Message Variable", plural: "Message Variables", table: "message_variable",
    titleField: "key", group: "Masters", icon: "🔤",
    orderBy: { column: "key", ascending: true },
    onlyFor: ["raghu@nandan.co.in"],
    blurb: "The {{variables}} every message can carry. Builtins compute themselves from the record and the calendar; statics say what the admin types here. A key can exist only once.",
    fields: [
      { name: "key", label: "Key", type: "text", required: true, inList: true, help: "Lowercase letters, digits, underscores — used as {{key}}." },
      { name: "kind", label: "Kind", type: "select", options: ["static", "builtin"], inList: true, default: "static",
        help: "Builtins compute live (name, dates, numbers). Statics hold the text below." },
      { name: "value", label: "Value", type: "textarea", big: true, inList: true, help: "For statics — the address, the terms, the line as it should read." },
      { name: "description", label: "What it is", type: "text", inList: true },
    ],
  },

  {
    name: "email_template", label: "Email Template", plural: "Email Templates", table: "email_template",
    titleField: "name", group: "Masters", icon: "📨",
    orderBy: { column: "module", ascending: true },
    onlyFor: ["raghu@nandan.co.in"],
    blurb: "The letters the company sends, written once. Each shows in the composer as Module - Name; its subject, cc, body and attachments are fixed on the template, and {{variables}} render on send.",
    fields: [
      { name: "module", label: "Module", type: "select", options: ["Enquiry", "Quotation"], required: true, inList: true, default: "Enquiry",
        help: "Where this letter belongs. It shows in the composer as Module - Name." },
      { name: "name", label: "Template name", type: "text", required: true, inList: true },
      { name: "subject", label: "Subject", type: "text", inList: true, help: "Fixed on the template — {{variables}} render on send." },
      { name: "cc", label: "CC", type: "text", help: "Fixed cc for every mail sent with this template. Comma-separate for more than one." },
      { name: "body", label: "Body", type: "textarea", big: true, rich: true, help: "Dear {{name}}, … — every message variable works here; write it as the letter should look." },
      { name: "attachments", label: "Attachments", type: "textarea",
        help: "One per line: Display Name | Drive link. Share each file anyone-with-link; only the link travels." },
    ],
  },

  {
    name: "whatsapp_template", label: "WhatsApp Template", plural: "WhatsApp Templates", table: "whatsapp_template",
    titleField: "name", group: "Masters", icon: "💬",
    orderBy: { column: "module", ascending: true },
    onlyFor: ["raghu@nandan.co.in"],
    blurb: "The WhatsApp messages the company sends, written once. Each shows as Module - Name; body and attachments are fixed on the template, and {{variables}} render on send.",
    fields: [
      { name: "module", label: "Module", type: "select", options: ["Enquiry", "Quotation"], required: true, inList: true, default: "Enquiry",
        help: "Where this message belongs. It shows as Module - Name." },
      { name: "name", label: "Template name", type: "text", required: true, inList: true },
      { name: "body", label: "Body", type: "textarea", big: true, inList: true, help: "Hi {{small_name}}, … — every message variable works here." },
      { name: "attachments", label: "Attachments", type: "textarea",
        help: "One per line: Display Name | Drive link. Share each file anyone-with-link; the link travels in the message." },
    ],
  },

  // ------------------------------------------------------------ masters
  {
    name: "sector", label: "Sector", plural: "Sectors", table: "sector",
    titleField: "code", group: "Masters", icon: "🗂️",
    orderBy: { column: "sort_order", ascending: true },
    blurb: "What Nandan makes. Seven codes, named by Dr Raghu on 21 Aug.",
    fields: [
      { name: "code", label: "Code", type: "text", required: true, inList: true },
      { name: "name", label: "Name", type: "text", required: true, inList: true },
      { name: "sort_order", label: "Order", type: "number", inList: true, default: 0 },
      { name: "active", label: "Active", type: "bool", inList: true, default: true },
    ],
  },
  {
    name: "industry", label: "Industry", plural: "Industries", table: "industry",
    titleField: "name", group: "Masters", icon: "🏭",
    orderBy: { column: "name", ascending: true },
    blurb: "What the customer does — and who is going after it. Your 253 industries already carry a sector, a priority, an owner and a qualification.",
    fields: [
      { name: "name", label: "Industry", type: "text", required: true, inList: true },
      { name: "sector_id", label: "Sector", type: "link", link: "sector", inList: true },
      { name: "priority", label: "Priority", type: "select", options: ["Low", "Medium", "High", "Highest"], inList: true },
      { name: "goal_qualification", label: "Qualification", type: "select", options: ["FOCUS", "REGULAR", "Customer B10"], inList: true },
      { name: "owner_id", label: "Owner", type: "link", link: "profile", inList: true },
      { name: "erp_name", label: "ERP name", type: "text", help: "The ERPNext key, so the link survives a rename on either side." },
      { name: "active", label: "Active", type: "bool", default: true },
    ],
  },
  {
    name: "stage", label: "Stage", plural: "Stages", table: "stage",
    titleField: "name", group: "Masters", icon: "🪜",
    orderBy: { column: "sort_order", ascending: true },
    blurb: "The fourteen rungs, as rows. Reordering is a change to a number here — never a migration.",
    fields: [
      { name: "name", label: "Stage", type: "text", required: true, inList: true },
      { name: "entity", label: "Ladder", type: "select", options: ["opportunity", "quotation"], required: true, inList: true, default: "opportunity",
        help: "Whose rung this is — the opportunity's short ladder, or the quotation's hotness." },
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
    name: "profile", label: "User", plural: "Users", table: "profile",
    titleField: "full_name", group: "Masters", icon: "👤",
    orderBy: { column: "full_name", ascending: true },
    blurb: "A mirror of the Genie account, matched on EMAIL — never on id, which is a different uuid in each database. Opening the CRM at all is Genie's crm_access grant.",
    fields: [
      { name: "full_name", label: "Name", type: "text", required: true, inList: true },
      { name: "email", label: "Email", type: "text", required: true, inList: true, help: "Lowercase @nandan.co.in. This is the bridge to the Genie account." },
      { name: "initials", label: "Initials", type: "text", inList: true },
      { name: "role", label: "Role", type: "select", inList: true, default: "sales",
        options: ["admin", "ceo", "sales_head", "sales", "service", "inside_sales", "viewer"] },
      { name: "phone", label: "Phone", type: "text" },
      { name: "reports_to", label: "Reports to", type: "link", link: "profile" },
      { name: "is_active", label: "Active", type: "bool", inList: true, default: true },
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

export const DOCTYPE_GROUPS = ["Quotations", "Funnel", "Accounts", "Catalogue", "Masters"] as const;
