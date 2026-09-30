/**
 * AUDIT QUERIES — reading the sheet's own handwriting.
 *
 * The Accounts Management Review has been kept by hand since April 2021 and
 * its columns hold what hands put in them: dates written four ways, amounts
 * written in words, a status column with six values where there are four.
 *
 * NOTHING HERE GUESSES. Where a cell reads as a date it becomes one; where it
 * does not, the text is kept and the date is left empty. An audit trail that
 * quietly invents a date is worse than one with a gap, because the gap can be
 * seen and asked about.
 */

/** The four states the sheet actually uses, plus the two it also uses. */
export const AUDIT_STATUS = ["Pending", "Done for Review", "Done", "Closed", "Doubt"] as const;
export type AuditStatus = (typeof AUDIT_STATUS)[number];

export const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  Pending: { bg: "#FBEAE8", fg: "#B3392E" },
  "Done for Review": { bg: "#FFF3E8", fg: "#8A5B00" },
  Done: { bg: "#E6F4EA", fg: "#0D7A3F" },
  Closed: { bg: "#EDF2F7", fg: "#46545F" },
  Doubt: { bg: "#EDE9FE", fg: "#5B21B6" },
};

/** Whatever was typed, tidied to one of the known states — or left as it was. */
export function tidyStatus(raw: string): string {
  const s = String(raw || "").trim();
  if (!s) return "Pending";
  const l = s.toLowerCase();
  if (l === "done") return "Done";
  if (l.startsWith("done for")) return "Done for Review";
  if (l === "closed") return "Closed";
  if (l === "pending") return "Pending";
  if (l === "doubt") return "Doubt";
  return s;                      // an answer we do not know is still an answer
}

/**
 * A date, only if it really is one.
 *
 * dd/mm/yyyy, dd-mm-yyyy, dd.mm.yy — the forms actually in the sheet. A bare
 * number ("8"), or a sentence ("Immediately on priority"), returns null and
 * keeps its text.
 */
export function readDate(raw: string): string | null {
  const s = String(raw || "").trim();
  if (!s || /^\d{1,2}$/.test(s)) return null;
  const m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);
  if (!m) {
    /* yyyy-mm-dd, which a spreadsheet sometimes writes on its own */
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return iso ? s : null;
  }
  const d = +m[1], mo = +m[2];
  let y = +m[3];
  if (y < 100) y += 2000;
  if (d < 1 || d > 31 || mo < 1 || mo > 12 || y < 2015 || y > 2100) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Rupees, only where the words say plainly what they mean.
 *
 * "Cr" IN THIS COLUMN MEANS CREDIT, NOT CRORE — and that is not a guess, it
 * is counted: of 1,302 amounts in the sheet, 58 end in "Dr" and 25 in "Cr",
 * which is accountants writing which side of the ledger a figure sits on.
 * Exactly ONE cell means ten million, and it says so in words: "16.17 crore".
 *
 * Reading those 25 as crores multiplied rupee figures by ten million and
 * produced a total of three hundred million crore — which is the useful kind
 * of wrong, because it is too absurd to survive being looked at. A misread
 * that merely doubled the figure would have gone out.
 *
 * So: a trailing Dr or Cr is a SIDE and the number is plain rupees; only
 * "lakh", "lac" and "crore" written as words scale it. The marker stays
 * visible in the text beside the figure, because which side it sits on is
 * half of what the row is saying.
 *
 * Anything else — a range ("37730+62000"), a paragraph, a question — keeps
 * its text and contributes nothing to a total. A total built partly on
 * guesses is a total nobody can defend in front of an auditor.
 */
export function readAmount(raw: string): number | null {
  const s = String(raw || "").trim().replace(/[,\u20b9]/g, "").replace(/^rs\.?\s*/i, "").replace(/\/-\s*$/, "");
  if (!s) return null;
  /* The side marker first, so it is never mistaken for a scale. */
  const side = s.match(/^([\d.]+)\s*(?:dr|cr)\.?$/i);
  if (side) { const n = Number(side[1]); return isFinite(n) ? n : null; }
  const m = s.match(/^([\d.]+)\s*(lakhs?|lacs?|crores?|k)?\.?$/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!isFinite(n)) return null;
  const unit = (m[2] || "").toLowerCase();
  if (!unit) return n;
  if (unit.startsWith("lakh") || unit.startsWith("lac")) return n * 1e5;
  if (unit.startsWith("crore")) return n * 1e7;
  if (unit === "k") return n * 1e3;
  return n;
}

/** Names arrive as vidya / Vidya / VIDYA — one person, three spellings. */
export const samePerson = (a: string, b: string) =>
  String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

export const properName = (s: string) => {
  const t = String(s || "").trim();
  if (!t) return "";
  /* Initials stay as they are: AKA, UDS, SL are not names to title-case. */
  if (t.length <= 4 && t === t.toUpperCase()) return t;
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
};

export interface AuditRow {
  id: string;
  assigned_text: string | null; assigned_on: string | null;
  instructed_by: string | null; assigned_to: string | null;
  related_to: string | null; instruction: string | null;
  target_text: string | null; target_on: string | null;
  amount_text: string | null; amount: number | null;
  status: string; remarks: string | null;
  verified_text: string | null; verified_on: string | null;
  source: string; sheet_row: number | null;
  updated_at: string | null; updated_by: string | null;
  /** Genie's reading of the query — kept so everyone sees the same one (0182) */
  ai_note?: string | null; ai_at?: string | null; ai_by?: string | null;
  answered_at?: string | null; closed_at?: string | null;
}

/** One entry in a query's thread — append-only (0182). */
export interface AuditEvent {
  id: string; query_id: string;
  kind: "status" | "comment" | "ai";
  from_status: string | null; to_status: string | null;
  body: string | null; by_email: string | null; at: string;
}

/**
 * WHO RAISES AND WHO ANSWERS (Dr Raghu, 30 Sep 2026: "people giving \u2014
 * Jyoti, UDS, Sandeep. People closing \u2014 Suresh, Sandesh").
 *
 * Typed free-hand, the same person arrives as "Jyoti", "jyoti" and "Jyoti
 * mam" and the by-person filter splits three ways. These are the two lists
 * the screen offers; anything already in the sheet is still accepted, because
 * five years of history is not going to be re-keyed to suit a dropdown.
 */
export const AUDIT_RAISERS = ["Jyoti", "UDS", "Sandeep"] as const;
export const AUDIT_CLOSERS = ["Suresh", "Sandesh"] as const;

/** Older than seven days and still not done — the sheet's own headline. */
export function overdue(rows: AuditRow[], today: string): AuditRow[] {
  const cut = new Date(`${today}T00:00:00Z`).getTime() - 7 * 86400000;
  return rows.filter((r) => {
    if (r.status === "Done" || r.status === "Closed") return false;
    if (!r.assigned_on) return false;      // no date is not "old"; it is unknown
    return new Date(`${r.assigned_on}T00:00:00Z`).getTime() < cut;
  });
}

/**
 * THE ONE LINE OF GENIE'S READING THAT FITS IN A ROW.
 *
 * Dr Raghu, 30 Sep 2026: "show summary in this" \u2014 a sparkle saying a
 * reading EXISTS is not the same as being able to see what it said. Genie is
 * asked to open with a SUMMARY: line for exactly this; anything written
 * before that instruction, or any answer that ignores it, falls back to its
 * own first sentence, which is never worse than showing nothing.
 */
export function aiSummary(note: string | null | undefined): string {
  const t = String(note || "").trim();
  if (!t) return "";
  /* markdown comes off first \u2014 a heading wearing ** is still a heading */
  const plain = (l: string) => l.replace(/[*_`#]+/g, "").trim();
  const m = t.match(/^\s*[*_#\s]*SUMMARY\s*:\s*(.+)$/im);
  if (m) return plain(m[1]).slice(0, 220);
  const isHeading = (l: string) => !l || (l.length < 60 && l === l.toUpperCase() && /[A-Z]/.test(l));
  const first = t.split("\n").map(plain).find((l) => !isHeading(l)) || "";
  /* a sentence if there is one inside a readable length; otherwise a clean cut */
  const stop = first.match(/^(.{20,180}?[.!?])(\s|$)/);
  if (stop) return stop[1];
  return first.length > 150 ? first.slice(0, 150).replace(/\s+\S*$/, "") + "\u2026" : first;
}
