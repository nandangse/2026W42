/**
 * ONE COLOUR PER MONTH, used everywhere.
 *
 * Dr Raghu, 30 Sep 2026: "make a colour code for the 12 months and use them
 * consistently. All the solid colours with white text."
 *
 * WHY IT IS WORTH FIXING ONCE. A delivery date is the thing every screen and
 * every printed board is really about, and twelve stable colours let a month
 * be recognised before it is read — a wall of October boards looks like
 * October from across the floor.
 *
 * EVERY ONE IS DARK ENOUGH FOR WHITE TEXT. That is the constraint that
 * chooses them: they walk the hue wheel from January's blue round to
 * December's indigo, but none is allowed to get light enough to make white
 * type struggle. A palette that looks handsome and cannot be read is a
 * palette that will be replaced by black within a month.
 *
 * APRIL IS DELIBERATELY GREEN — the financial year starts there, and the
 * year reading as a progression from green is worth more here than starting
 * the wheel at January.
 */
export const MONTH_COLOUR: string[] = [
  "#1F4E79", // Jan  deep blue
  "#256E7E", // Feb  teal blue
  "#18705A", // Mar  sea green
  "#2E7D32", // Apr  green — the financial year opens here
  "#5E8A1E", // May  olive
  "#8A7A16", // Jun  bronze
  "#B45309", // Jul  amber
  "#B23B12", // Aug  burnt orange
  "#A62A2A", // Sep  red
  "#8E2C5E", // Oct  magenta
  "#6B2E8F", // Nov  violet
  "#3B3F9E", // Dec  indigo
];

export const MONTH_NAME = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** The colour for an ISO date, a yyyy-mm, or a month number 1-12. */
export function monthColour(v: string | number | null | undefined): string {
  if (v == null || v === "") return "#16232F";
  const m = typeof v === "number" ? v : Number(String(v).slice(5, 7));
  return MONTH_COLOUR[(m - 1 + 12) % 12] || "#16232F";
}

export function monthLabel(v: string | null | undefined): string {
  if (!v) return "";
  const m = Number(String(v).slice(5, 7));
  return MONTH_NAME[(m - 1 + 12) % 12] || "";
}
