import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * THE QUOTE'S TEMPLATE VARIABLES — ONE IMPLEMENTATION, USED EVERYWHERE.
 *
 * This exists because of a real escape (Dr Raghu, 31 Aug 2026). The
 * substitution lived inside the PDF renderer, so the printed quotation filled
 * its {{variables}} correctly — and the COVERING LETTER, which is the same
 * text sent as the email body by a different route, never went through it at
 * all. A quotation reached a client signed:
 *
 *     Warm regards,
 *     {{sales_person}}
 *
 * Two routes, two ideas of what a variable is, and the customer read the one
 * that was wrong. So the map and the filling now live here, and both the PDF
 * and the email import them. A third caller gets it right for free.
 *
 * Whitespace inside the braces is ignored and the name is matched without
 * regard to case, because {{ sales_person }} is what a person actually types.
 * A name that is NOT a variable is left standing exactly as written: a typo
 * that silently vanishes is one nobody finds until a client reads it.
 */

export type QuoteRow = Record<string, unknown>;

const dIN = (v: unknown) => (v ? String(v).slice(0, 10).split("-").reverse().join("/") : "");

/** Build the map for one quotation, resolving the names it points at. */
export async function quoteVars(db: SupabaseClient, q: QuoteRow): Promise<Record<string, string>> {
  const [co, contact, owner] = await Promise.all([
    q.company_id ? db.from("company").select("name").eq("id", String(q.company_id)).maybeSingle() : Promise.resolve({ data: null }),
    q.contact_id ? db.from("person").select("full_name").eq("id", String(q.contact_id)).maybeSingle() : Promise.resolve({ data: null }),
    q.owner_id ? db.from("profile").select("full_name").eq("id", String(q.owner_id)).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const ownerName = String((owner.data as { full_name?: string } | null)?.full_name || "");
  return {
    customer: String((co.data as { name?: string } | null)?.name || ""),
    quote_no: String(q.quote_no ?? ""),
    quote_date: dIN(q.quoted_on),
    subject: String(q.subject || ""),
    valid_until: dIN(q.valid_until),
    delivery: String(q.delivery_weeks || ""),
    contact: String((contact.data as { full_name?: string } | null)?.full_name || ""),
    sales_person: ownerName,
    salesperson: ownerName,
    authorized_by: String(q.authorized_by || "Dr Raghunandan Jagdish, MD and CEO"),
    company: "Nandan GSE Pvt Ltd",
  };
}

/** The names a template may use, for the hint shown beside the editor. */
export const QUOTE_VAR_NAMES = [
  "quote_no", "quote_date", "customer", "contact", "sales_person",
  "authorized_by", "subject", "valid_until", "delivery", "company",
] as const;

/**
 * Replace {{name}} throughout. `esc` is passed in because the PDF escapes for
 * HTML while an email body already holds HTML the sender wrote — the same
 * value must not be escaped twice.
 */
export function fillQuoteVars(
  text: string,
  vars: Record<string, string>,
  esc: (s: string) => string = (s) => s,
): string {
  return String(text || "").replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (whole, key: string) => {
    const v = vars[String(key).toLowerCase()];
    return v === undefined ? whole : esc(v);
  });
}
