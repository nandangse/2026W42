/**
 * OPERATING EXPENSES, IN THE ELEVEN HEADS HE READS BY.
 *
 * Dr Raghu, 30 Sep 2026: "Operating expenses show the heads as below: Labour
 * Salaries / Staff Salaries / Consultant Salaries / Consultancies / Finance
 * Costs / Bank Charges / Utilities / Rent & Others / Marketing Expenses /
 * Sales Promotion / Other OE — ensure that you put the right ledgers in this
 * and all are in the same."
 *
 * Tally's own chart gives thirty-six groups under the indirect and finance
 * roots, ordered by nothing in particular. That is a bookkeeper's list. These
 * eleven are a managing director's, and the last one is a catch — so the
 * eleven always add back to the OE total exactly, whatever new ledger
 * accounts get opened next month. Nothing is dropped and nothing is counted
 * twice: every ledger falls through this ladder until one rung takes it.
 *
 * The rungs are tested in order, so the narrow tests come before the wide
 * ones — "Consultancy Charges Full Time" is a consultant's pay, not a
 * consultancy fee, and it is matched by its group before the broader
 * professional-charges rung is reached.
 */
export const OE_HEADS = [
  "Labour Salaries", "Staff Salaries", "Consultant Salaries", "Consultancies",
  "Finance Costs", "Bank Charges", "Utilities", "Rent & Others",
  "Marketing Expenses", "Sales Promotion", "Other OE",
] as const;

export function oeHead(group: string, ledger: string): string {
  const g = String(group || "").toLowerCase();
  const l = String(ledger || "").toLowerCase();

  // --- people ---------------------------------------------------------
  // the chart tags each pay ledger Direct or Indirect: direct is the shop
  // floor, indirect is the office. That tag is the only thing in the books
  // that knows which, so it is what the split stands on.
  const isPay = /salar|allowance|bonus|exgratia|gratuity|contribution to funds|welfare|site allowance|payment & provision to employee|wages/.test(g);
  if (isPay) {
    if (/\(direct\)|-\s*direct\b|\bdirect\b/.test(l) || /\(direct\)/.test(g)) return "Labour Salaries";
    return "Staff Salaries";
  }
  // full-time consultants are paid like staff, month on month — his own
  // distinction between "Consultant Salaries" and "Consultancies"
  if (/full time professional|consultancy charges full time/.test(g + " " + l)) return "Consultant Salaries";
  if (/professional|consultanc/.test(g)) return "Consultancies";

  // --- money ----------------------------------------------------------
  if (/interest/.test(g) || /penal interest|interest on/.test(l)) return "Finance Costs";
  if (/bank charg|other charges/.test(g) || /bank charg|bank guarantee|loan processing|loan foreclosure|stamp duty/.test(l)) return "Bank Charges";

  // --- the premises ----------------------------------------------------
  if (/communication|water charg|electric|power|fuel|telephone|internet/.test(g) || /electricity|water charges|telephone|internet/.test(l)) return "Utilities";
  if (/rent|rates|taxes & insurance|insurance|rental|security guard|repairs and maintenance/.test(g)) return "Rent & Others";

  // --- winning the work -------------------------------------------------
  if (/membership & subscription|advertis/.test(g) || /advertis|publicity|exhibition|membership|subscription/.test(l)) return "Marketing Expenses";
  if (/business promotion|selling & distribution/.test(g) || /business expenses|entertainment|tender expenses/.test(l)) return "Sales Promotion";

  // --- everything else, named so, never hidden --------------------------
  return "Other OE";
}
