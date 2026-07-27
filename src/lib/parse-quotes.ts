// Parser for the quotes workbook (Project_Time_Life_Quotes_600.xlsx shape).
// Any sheet with a "Quote" column is read; the "Read Me" tab is ignored.
//
// Attribution rule — the workbook separates two kinds of entry and we preserve
// that distinction rather than flattening it:
//   · Author/Attribution "Original collection" (or blank) → Dr Raghu's own
//     wording, credited to ORIGINAL_AUTHOR below.
//   · Anything else (Eisenhower, Plato, Drucker, …) → keep the stated author,
//     since those are other people's words quoted in the collection.
import * as XLSX from "xlsx";
import type { WorkBook } from "xlsx";

/** How the house-authored quotes are credited on screen. */
export const ORIGINAL_AUTHOR = "Dr Raghu";

export interface ParsedQuote {
  body: string;
  author: string;
  category: string;
  source: string;
  original: boolean;
}

const ORIGINAL_MARKERS = ["original collection", "original", "", "-", "—", "n/a"];

export function parseQuotes(wb: WorkBook): ParsedQuote[] {
  const out: ParsedQuote[] = [];
  const seen = new Set<string>();

  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], {
      header: 1,
      raw: true,
    });
    if (!rows.length) continue;

    // find the header row (usually row 0) and locate columns by name
    let hdrIdx = -1;
    let ix: Record<string, number> = {};
    for (let r = 0; r < Math.min(5, rows.length); r++) {
      const cells = Array.from(rows[r] || [], (h) => String(h ?? "").trim().toLowerCase());
      const q = cells.findIndex((c) => c === "quote" || c.startsWith("quote"));
      if (q >= 0) {
        hdrIdx = r;
        ix = {};
        cells.forEach((c, i) => {
          if (c.startsWith("quote")) ix.quote ??= i;
          else if (c.startsWith("author") || c.includes("attribution")) ix.author ??= i;
          else if (c.startsWith("category")) ix.category ??= i;
          else if (c.startsWith("source") || c.includes("work")) ix.source ??= i;
        });
        break;
      }
    }
    if (hdrIdx < 0 || ix.quote == null) continue; // not a quotes sheet (e.g. Read Me)

    for (const row of rows.slice(hdrIdx + 1)) {
      if (!row) continue;
      const body = String(row[ix.quote] ?? "").replace(/\s+/g, " ").trim();
      if (body.length < 4) continue;

      const key = body.toLowerCase();
      if (seen.has(key)) continue; // de-dupe within the upload
      seen.add(key);

      const rawAuthor = String(row[ix.author ?? -1] ?? "").trim();
      const isOriginal = ORIGINAL_MARKERS.includes(rawAuthor.toLowerCase());

      out.push({
        body,
        author: isOriginal ? ORIGINAL_AUTHOR : rawAuthor,
        category: String(row[ix.category ?? -1] ?? "").trim(),
        source: String(row[ix.source ?? -1] ?? "").trim(),
        original: isOriginal,
      });
    }
  }
  return out;
}
