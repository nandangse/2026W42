/**
 * COLOUR IS THE PLANNING OWNER — one function, wherever a job is drawn
 * (My Week's board since September; the plan PDF's calendar from 6 Oct 2026,
 * Dr Raghu: "in the calendar view use the colour codes of the project
 * managers"). Derived from the name itself, so a person keeps their colour
 * everywhere without a table to maintain.
 */
export const OWNER_INK = ["#1B3A5C", "#B45309", "#0D7A3F", "#7C3AED", "#B3392E", "#0E7490", "#8A5B00", "#4338CA", "#9D174D", "#155E75"];

export function ownerColour(name: string): string {
  const n = String(name || "").trim().toLowerCase();
  if (!n) return "#8B8F87";
  let h = 0;
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
  return OWNER_INK[h % OWNER_INK.length];
}

/**
 * THE SECTOR A PRODUCT FAMILY BELONGS TO — GSE, MHE, DEF — read off the
 * prefix the family already carries ("AGSE - Hi Lift", "MHE - Goods Lift",
 * "DEF - Specialized Vehicles"). The colours are the job board's: GSE dark
 * blue, DEF maroon, MHE dark green; anything else is grey and says so.
 */
export const SECTORS = [
  { key: "GSE", label: "GSE", ink: "#12386B", tint: "#E7EEF8" },
  { key: "MHE", label: "MHE", ink: "#14532D", tint: "#E6F2EA" },
  { key: "DEF", label: "DEF", ink: "#6E1220", tint: "#F6E7EA" },
  { key: "OTH", label: "Other", ink: "#5A6672", tint: "#F1EFE9" },
] as const;
export function sectorOf(fam: string | null | undefined): (typeof SECTORS)[number] {
  const f = String(fam || "").trim().toUpperCase();
  if (f.startsWith("AGSE") || f.startsWith("AAE") || f.startsWith("GSE")) return SECTORS[0];
  if (f.startsWith("MHE")) return SECTORS[1];
  if (f.startsWith("DEF")) return SECTORS[2];
  return SECTORS[3];
}
