/**
 * WHAT COMES DOWN FROM THE ERP EVERY HOUR — the list, in one place.
 *
 * Dr Raghu, 16 Sep 2026, naming them one after another: jobs, delivered
 * jobs, opportunity, quote, contact, company, sales order, project, BOM,
 * item, purchase order, GRN. Until now the answer to "does this refresh?"
 * lived in three crons across two databases and could only be had by reading
 * the source. It is a list now, and the screen shows it.
 *
 * WHO CARRIES EACH ONE is part of the list, because it is the first thing
 * anybody asks when one of them goes stale:
 *
 *   erp-sync   the planning side, in Genie's own database
 *   crm-sync   the sales side, in the CRM's
 *   saamaan    the materials side — pulled BY HAND today, and the only
 *              honest thing to do is say so rather than draw a tick that
 *              does nothing
 *
 * LATER ONE WINS on every one of them ("also in all these decisions the
 * later one wins!!!"), which is not a detail: it is what makes a pull safe
 * over an unpushed Genie edit, and therefore what lets the pull stop waiting
 * on a push that has been failing for a day.
 */
export type ErpDoc = {
  key: string;
  label: string;
  /** The ERP's own name for it, so the screen and the ERP agree. */
  doctype: string;
  carrier: "erp-sync" | "crm-sync" | "saamaan";
  /** Where it lands. */
  where: string;
  /** False where nothing pulls it on the hour yet — a tick would be a lie. */
  hourly: boolean;
  /**
   * Documents that come down in ONE pull and cannot be separated.
   *
   * Jobs, delivered jobs and projects are read, compared and archived in a
   * single interleaved pass — a job knows its project, and an archive
   * decision needs all three lists in hand. Pretending they were three
   * independent ticks would let somebody turn off the half that the other
   * half depends on, so they share a tick and the screen says they travel
   * together.
   */
  group?: string;
};

export const ERP_DOCS: ErpDoc[] = [
  { key: "jobs",           label: "Jobs",            doctype: "Jobmaster",        carrier: "erp-sync", group: "planning", where: "Genie · the board",        hourly: true },
  { key: "delivered",      label: "Delivered jobs",  doctype: "Jobmaster",        carrier: "erp-sync", group: "planning", where: "Genie · Delivered",        hourly: true },
  { key: "projects",       label: "Projects",        doctype: "Project",          carrier: "erp-sync", group: "planning", where: "Genie · Projects",         hourly: true },
  { key: "opportunity",    label: "Opportunities",   doctype: "Opportunity",      carrier: "crm-sync", where: "CRM · Opportunities",      hourly: true },
  { key: "quotation",      label: "Quotations",      doctype: "Quotation",        carrier: "crm-sync", where: "CRM · Quotations",         hourly: true },
  { key: "sales_order",    label: "Sales orders",    doctype: "Sales Order",      carrier: "crm-sync", where: "CRM · Sales orders",       hourly: true },
  { key: "contact",        label: "Contacts",        doctype: "Contact",          carrier: "crm-sync", where: "CRM · People",             hourly: true },
  { key: "customer",       label: "Companies",       doctype: "Customer",         carrier: "crm-sync", where: "CRM · Companies",          hourly: true },
  { key: "item",           label: "Items",           doctype: "Item",             carrier: "saamaan",  where: "Saamaan · Items",          hourly: false },
  { key: "bom",            label: "BOMs",            doctype: "BOM",              carrier: "saamaan",  where: "Saamaan · BOM",            hourly: false },
  { key: "purchase_order", label: "Purchase orders", doctype: "Purchase Order",   carrier: "saamaan",  where: "Saamaan · Purchase orders", hourly: false },
  { key: "grn",            label: "GRNs",            doctype: "Purchase Receipt", carrier: "saamaan",  where: "Saamaan · GRN",            hourly: false },
];

/** Everything that can refresh on the hour is on unless it has been turned off. */
export function isOn(settings: Record<string, unknown> | null | undefined, key: string): boolean {
  const doc = ERP_DOCS.find((d) => d.key === key);
  if (!doc || !doc.hourly) return false;
  const v = (settings || {})[key];
  return v === undefined || v === null ? true : v !== false;
}
