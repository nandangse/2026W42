/**
 * MESSAGE VARIABLES — {{name}}, {{qtn_no}}, {{next_monday}} — resolved
 * against a record and the calendar. Server-side only (uses the CRM's
 * service client). Every messaging surface the comms build brings renders
 * through this one resolver, so a variable can never mean two things.
 *
 * Unknown variables are left standing as {{key}} in the output — a template
 * that asks for something we cannot fill should show its gap, not hide it.
 */
import { crmDb } from "./db";

export type VariableContext = {
  personId?: string | null;
  companyId?: string | null;
  opportunityId?: string | null;
  quotationId?: string | null;
};

const pad = (n: number) => String(n).padStart(2, "0");
const dmy = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;

/** The coming occurrence of a weekday, strictly after today (IST). */
function nextWeekday(dow: number): string {
  const now = new Date(Date.now() + 5.5 * 3600 * 1000);
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  let delta = (dow - d.getUTCDay() + 7) % 7;
  if (delta === 0) delta = 7;
  d.setUTCDate(d.getUTCDate() + delta);
  return dmy(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Every variable's current value for a context — builtins computed, statics
 *  read from the master. */
/**
 * THE CATALOGUE — every variable this file can produce, in one list.
 *
 * "please put these variables in the settings so that I know. Also in the
 * templates page showcase this" (Dr Raghu, 31 Aug 2026), after typing
 * {{user_name}} — which does not exist and would have printed as braces on
 * a customer's WhatsApp.
 *
 * The list is exported rather than retyped on each screen so it cannot drift
 * from what the code above actually fills. WHAT IT NEEDS matters as much as
 * the name: {{name}} is empty unless the message is tied to a person, and a
 * variable that quietly renders empty is the same trap as one that does not
 * exist. Both settings and the template editors read this.
 */
export const VARIABLE_CATALOGUE: { key: string; what: string; needs: string }[] = [
  { key: "name", what: "The person's full name", needs: "a contact" },
  { key: "small_name", what: "Their first name alone", needs: "a contact" },
  { key: "company_name", what: "The customer's company", needs: "a contact, company or deal" },
  { key: "qtn_no", what: "The quotation number", needs: "a quotation" },
  { key: "qtn_subject", what: "What the deal is for", needs: "a deal or quotation" },
  { key: "enq_no", what: "The enquiry (opportunity) number", needs: "a deal or quotation" },
  { key: "today", what: "Today's date, 31/08/2026", needs: "nothing" },
  { key: "next_monday", what: "The coming Monday's date", needs: "nothing" },
  { key: "next_tuesday", what: "The coming Tuesday's date", needs: "nothing" },
  { key: "next_wednesday", what: "The coming Wednesday's date", needs: "nothing" },
  { key: "next_thursday", what: "The coming Thursday's date", needs: "nothing" },
  { key: "next_friday", what: "The coming Friday's date", needs: "nothing" },
  { key: "next_saturday", what: "The coming Saturday's date", needs: "nothing" },
];

export async function variableValues(ctx: VariableContext): Promise<Record<string, string>> {
  const db = crmDb();
  const out: Record<string, string> = {};

  const { data: statics } = await db.from("message_variable")
    .select("key, kind, value");
  for (const r of statics ?? []) {
    if (r.kind === "static") out[String(r.key)] = String(r.value ?? "");
  }

  const today = new Date(Date.now() + 5.5 * 3600 * 1000);
  out.today = dmy(new Date(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  out.next_monday = nextWeekday(1);
  out.next_tuesday = nextWeekday(2);
  out.next_wednesday = nextWeekday(3);
  out.next_thursday = nextWeekday(4);
  out.next_friday = nextWeekday(5);
  out.next_saturday = nextWeekday(6);

  let companyId = ctx.companyId ?? null;
  let opportunityId = ctx.opportunityId ?? null;

  if (ctx.quotationId) {
    const { data: q } = await db.from("quotation")
      .select("quote_no, opportunity_id, company_id, contact_id").eq("id", ctx.quotationId).maybeSingle();
    if (q) {
      out.qtn_no = String(q.quote_no ?? "");
      opportunityId = opportunityId ?? (q.opportunity_id as string | null);
      companyId = companyId ?? (q.company_id as string | null);
      if (!ctx.personId && q.contact_id) ctx = { ...ctx, personId: String(q.contact_id) };
    }
  }
  if (opportunityId) {
    const { data: o } = await db.from("opportunity")
      .select("opportunity_no, name, company_id").eq("id", opportunityId).maybeSingle();
    if (o) {
      out.enq_no = String(o.opportunity_no ?? "");
      out.qtn_subject = String(o.name ?? "");
      companyId = companyId ?? (o.company_id as string | null);
    }
  }
  if (ctx.personId) {
    const { data: p } = await db.from("person")
      .select("full_name, first_name, company_id").eq("id", ctx.personId).maybeSingle();
    if (p) {
      const full = String(p.full_name ?? p.first_name ?? "").trim();
      out.name = full;
      out.small_name = full.split(/\s+/)[0] ?? "";
      companyId = companyId ?? (p.company_id as string | null);
    }
  }
  if (companyId) {
    const { data: c } = await db.from("company").select("name").eq("id", companyId).maybeSingle();
    if (c) out.company_name = String(c.name ?? "");
  }
  // outstanding_amount: wires in when the receivables land — until then the
  // gap stays visible rather than pretending to be zero.
  return out;
}

/** Render a template. Unknown {{keys}} stay visible. */
export function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (whole, key: string) => {
    const v = values[key.toLowerCase()];
    return v !== undefined && v !== "" ? v : whole;
  });
}
