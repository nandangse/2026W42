/**
 * INTERNAL KUBER — the rules, in one place (Dr Raghu, 14 Oct 2026: "make
 * another module, Internal Kuber — all the places where we are going to
 * generate from accruals as well as from saving wastage; we will show places
 * where it is getting wasted").
 *
 * WASTAGE is read from the books, a ledger at a time, by what the ledger says
 * it is (its name and its group in Tally) — never from sales. Each bucket has
 * the words that put a ledger in it and the lever that saves it. The page and
 * its lightboxes both use this list, so a card and its lines always agree.
 */
export type WasteRule = { key: string; label: string; test: RegExp; lever: string };

export const WASTE: WasteRule[] = [
  { key: "interest", label: "Interest on borrowing", test: /interest/i, lever: "every rupee collected early is a rupee not borrowed — the costliest loans (the finance companies) go first" },
  { key: "bank", label: "Bank and loan charges", test: /bank charg|stamp duty|processing charg|foreclosure|bank guarantee charg|bg charg|commission/i, lever: "fewer, larger facilities; negotiate the stamp duty and processing at renewal" },
  { key: "freight", label: "Freight, loading and handling", test: /freight|transport|crane|cartage|loading|unloading|courier|hamali|\btempo\b/i, lever: "consolidate loads, rate contracts with transporters, plan deliveries a week ahead" },
  { key: "forex", label: "Foreign exchange loss", test: /exchange|forex/i, lever: "forward cover on export receivables and import payments" },
  { key: "penal", label: "Penalties, late fees and penal interest", test: /penal|late fee|late payment|interest on late|penalt|\bfine\b|demurrage|detention/i, lever: "a compliance calendar — every one of these is a date missed" },
  { key: "writeoff", label: "Bad debts and write-offs", test: /bad debt|written off|write off|w\/off/i, lever: "credit limits and advance terms for the customers who pay late" },
  { key: "rework", label: "Rework, rejection and scrap", test: /rework|rejection|scrap/i, lever: "first-time-right — the cost of not doing it right the first time" },
];

/** which bucket a ledger line falls in, or null */
export function wasteOf(ledger: string, group: string): WasteRule | null {
  const hay = `${ledger} ${group}`;
  /* interest that is a late fee or penal is a penalty, not the cost of borrowing */
  const penal = WASTE.find((w) => w.key === "penal")!;
  if (penal.test.test(hay)) return penal;
  for (const w of WASTE) if (w.test.test(hay)) return w;
  return null;
}

/** what money stuck in waiting costs a year, unless set otherwise */
export const CARRY_RATE = 0.12;
/** a sensible stock: this many days of TVC */
export const STOCK_DAYS_TARGET = 60;
