"use client";
// split out of CrmApp.tsx (Genie 5.0.1.1) — one file per tab, loaded when opened

import { type Doctype } from "@/crm/doctypes";

// Sales Genie's palette (src/sales-plan/styles.css), moved here on Dr Raghu's
// word 24 Aug 2026 — one look for the whole of sales.
export const PAPER = "#F7F8FC";
        // the page ground; cards sit white on it
export const NAVY = "#1B2D6B";

export const NAVY_DARK = "#14224F";

export const NAVY_SOFT = "#EEF1FA";

export const INK = "#22283A";

export const MUTED = "#6B7280";

export const BORDER = "#E5E8F0";

export const ORANGE = "#F04E23";

export const PINNED_W = 180;
 // pinned columns take a fixed width so sticky offsets add up

export type Row = Record<string, unknown>;

export type Links = Record<string, { id: string; label: string }[]>;

/** Set once when CrmApp mounts — one user per page, so module scope is safe. */
export let MY_PROFILE_ID: string | null = null;
export const setMyProfileId = (v: typeof MY_PROFILE_ID) => { MY_PROFILE_ID = v; };

export let MY_EMAIL = "";
export const setMyEmail = (v: typeof MY_EMAIL) => { MY_EMAIL = v; };

/** What the lightbox is showing: possibly another doctype than the page. */
export type ViewState = { dt: Doctype; row: Row; links: Links; mode: "view" | "edit" };

/** Sections that are pages of their own rather than doctypes. Deals is real —
 *  the pipeline flow. The others' screens are coming; the URLs already answer. */
export const SPECIAL_SECTIONS = [
  { name: "dashboard", label: "Dashboard", icon: "◧", blurb: "The CEO cockpit — owner concentration, the funnel, the response clock. Being built next." },
  { name: "analytics", label: "Analytics", icon: "◫", blurb: "Win rates, stage velocity, source economics — read from the stage histories. Being built." },
  { name: "salespersonplan", label: "SalesPerson Plan", icon: "◐", blurb: "" },
  { name: "salesplan", label: "Sales Plan", icon: "◩", blurb: "" },
  { name: "deals", label: "Deals", icon: "◆", blurb: "" },
  { name: "visitingcard", label: "Add Visiting Card", icon: "🪪", blurb: "" },
  /* The context nobody else writes down, and the follow-up it produces. */
  /* Shweta's screen: what is wrong in the data, and a button beside each. */
  { name: "cleandb", label: "Clean Database", icon: "🧹", blurb: "Duplicate companies and contacts, the Pvt Ltd spellings, and every mobile written the way WhatsApp wants it. Every row is a proposal — nothing changes until you press it." },
  { name: "peopleimet", label: "People I Met", icon: "🤝", blurb: "Everybody you met at a show, with what was actually said — and the personal e-mail and WhatsApp it writes from that." },
  { name: "integrations", label: "Integrations", icon: "🔌", blurb: "" },
  { name: "emailqueue", label: "Email", icon: "📮", blurb: "" },
  { name: "playbook", label: "Sales Playbook", icon: "📖", blurb: "" },
  { name: "waqueue", label: "WhatsApp Queue", icon: "💬", blurb: "" },
  { name: "communication", label: "Communication", icon: "✉", blurb: "Emails — automated, inbound and outbound, per user's own mailbox. Arrives with the channels phase." },
] as const;

/** The URL each doctype answers at — Dr Raghu's spellings. */
export const URL_OF: Record<string, string> = {
  lead: "lead", company: "company", person: "contact", quotation: "quotation",
  quotation_line: "quoteline", opportunity: "opportunity", sales_order: "salesorder",
  interaction: "interactions", task: "task", address: "address", person_phone: "phone",
  product: "product", sales_invoice: "salesinvoice", message_variable: "variables",
  email_template: "emailtemplates", whatsapp_template: "whatsapptemplates",
  sector: "sector", industry: "industry", stage: "stage", profile: "users",
  quote_template: "quotetemplates", payment_term: "paymentterms", tax_master: "taxes",
};

/** The sidebar, in Dr Raghu's order (24 Aug 2026). `dt` names a doctype,
 *  `sp` a screen of its own, `href` a door to elsewhere in Genie. */
export const NAV: { header?: string; collapsible?: boolean; items: ({ dt: string } | { sp: string } | { href: string; label: string; icon: string })[] }[] = [
  {
    items: [
      { sp: "dashboard" }, { sp: "analytics" }, { sp: "salespersonplan" }, { sp: "salesplan" },
    ],
  },
  { header: "TOOLS", collapsible: true, items: [{ sp: "visitingcard" }, { sp: "peopleimet" }, { sp: "cleandb" }, { sp: "emailqueue" }, { sp: "waqueue" }, { sp: "playbook" }] },
  { header: "PIPELINE", items: [{ dt: "lead" }, { dt: "opportunity" }, { dt: "quotation" }, { dt: "sales_order" }] },
  { items: [{ sp: "deals" }] },
  {
    header: "ACCOUNTS",
    items: [{ dt: "company" }, { dt: "person" }, { dt: "address" }, { dt: "person_phone" }, { dt: "industry" }, { dt: "product" }, { dt: "sales_invoice" }],
  },
  { header: "MORE", items: [{ dt: "meeting" }, { dt: "interaction" }, { dt: "task" }, { dt: "quotation_line" }, { sp: "communication" }] },
  { header: "SETTINGS", collapsible: true, items: [{ sp: "integrations" }, { dt: "sector" }, { dt: "stage" }, { dt: "profile" }, { dt: "message_variable" }, { dt: "email_template" }, { dt: "whatsapp_template" },
    // the quote's masters live in Settings, where Dr Raghu first asked for
    // them (30 Aug 2026: "templates should be here right?")
    { dt: "quote_template" }, { dt: "payment_term" }, { dt: "tax_master" }] },
];