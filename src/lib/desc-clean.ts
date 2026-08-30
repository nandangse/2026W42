/**
 * THE ERP'S PLACEHOLDER, SWEPT OUT (Dr Raghu, 30 Aug 2026: "In item
 * description remove this _place_holder; from everywhere. keep a space
 * before and after the : too").
 *
 * The old ERP wrote item specifications as "Capacity : _place_holder;750 kgs"
 * — a marker for a field it never filled. It means nothing to a reader and it
 * printed on quotations, so it is stripped wherever a description is shown or
 * printed rather than rewritten row by row: the marker turns up in product
 * masters, in quote lines, and in every copy taken of either, and a cleaner
 * that runs at the point of reading catches all three including whatever
 * imports tomorrow.
 *
 * The colon keeps a space on each side, which is what makes the list read as
 * a list — "Capacity : 750 kgs" rather than "Capacity:750 kgs".
 */

/** The marker itself, with or without its semicolon, in any case. */
const MARKER = /_place_?holder\s*;?/gi;

export function cleanDesc(s: unknown): string {
  const text = String(s ?? "");
  if (!text) return "";
  return text
    .replace(MARKER, "")
    // The label's colon, spaced on both sides. Only a colon that separates a
    // label from its value is touched: a time (10:30), a ratio (1:2) and the
    // "::" of a group path have no spaces around them and keep none, and a
    // URL's "https://" is left alone.
    .replace(/(^|<[^>]*>|[^\s:/])\s*:\s*(?=[^\s:/=])/g, (m, before: string) =>
      /^https?$|^\d$/i.test(before) ? m : `${before} : `)
    // The gap the marker leaves behind, without eating the newlines that
    // separate one specification from the next.
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+(\n|<br\s*\/?>)/gi, "$1");
}
