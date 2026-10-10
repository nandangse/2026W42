/**
 * RELATED TO (Dr Raghu, 10 Oct 2026: "have a related to dropdown also"):
 * the part of the company a problem on the Solution Board belongs to. One
 * list, used by the board, its filter, and the burning issue on the check-in.
 */
export const RELATED_TO = [
  "Customers", "Sales & marketing", "Design & engineering", "Purchase & suppliers", "Production", "Quality", "Service & spares",
  "Stores & logistics", "Projects & delivery", "People & HR", "Finance & cash", "IT & systems", "Safety & compliance", "Leadership & culture", "Other",
] as const;
export type RelatedTo = (typeof RELATED_TO)[number];
export const relatedTo = (v: unknown): RelatedTo | null => (RELATED_TO as readonly string[]).includes(String(v || "")) ? (String(v) as RelatedTo) : null;
