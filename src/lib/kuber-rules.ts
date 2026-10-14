/**
 * HOW THE BOOKS ARE READ — every rule, in one place, in the order they fire.
 *
 * Dr Raghu, 30 Sep 2026: "why is this confusing. cant u make the rules and
 * keep it properly? if needed make all the rules. in a page."
 *
 * He is right, and the reason is worth writing down. Until today these rules
 * lived as regular expressions inline in the middle of a 1,600-line route
 * file. They worked, mostly — but nobody could READ them, so nobody could
 * see that "Indirect Expenses" contains the substring "direct expense", and
 * Rs 6.41 Cr of salaries and rent sat above the gross profit line for weeks.
 * A rule you cannot read is a rule you cannot check.
 *
 * So: this file is the only place a ledger is classified. The statement
 * imports it, and the "How the books are read" page renders the SAME array
 * with live counts and amounts beside each rule. The page cannot go stale,
 * because it is not a description of the rules — it IS the rules.
 *
 * TWO LADDERS AND A SET OF STANDING RULES:
 *   PNL_RULES   which line of the P&L a ledger lands on
 *   OE_RULES    which of his eleven operating-expense heads it lands in
 *   BOOK_RULES  the rules that are not about ledgers at all — what the
 *               statement excludes, which figures are signed which way, and
 *               where stock comes from
 *
 * Both ladders are ORDERED and FIRST MATCH WINS. Narrow tests come before
 * wide ones. Nothing falls through: the last rung of each ladder catches
 * everything left, so the parts always add back to the whole.
 */

export type Bucket =
  | "sales" | "purchases" | "otherIncome" | "manuf"
  | "depreciation" | "finance" | "tax" | "indirect" | "balance";

/** what the statement calls each bucket */
export const BUCKET_LABEL: Record<Bucket, string> = {
  sales: "Sales",
  purchases: "Purchases during the Period",
  otherIncome: "Other Income",
  manuf: "Manufacturing Expenses",
  depreciation: "Depreciation",
  finance: "Finance Charges",
  tax: "Tax Expense",
  indirect: "Indirect Expenses",
  balance: "Balance Sheet — not the P&L",
};

export interface LedgerCtx {
  /** the ledger's own name */
  ledger: string;
  /** the group it sits in */
  group: string;
  /** the top of its group chain, as Tally spells it */
  root: string;
  /** the same root with Tally's leading code stripped: "11.Indirect Expenses" → "Indirect Expenses" */
  rootN: string;
}

export interface Rule {
  id: string;
  /** where a ledger caught by this rule lands */
  lands: string;
  /** the rule, in a sentence */
  says: string;
  /** credit positive is the parser's convention; a cost is flipped to read positive on the statement */
  sign: 1 | -1;
  /** why it is written this way — only where there is a trap worth knowing */
  why?: string;
  test: (c: LedgerCtx) => boolean;
}

/* ------------------------------------------------------------------ *
 *  LADDER ONE — which line of the P&L
 * ------------------------------------------------------------------ */

/** Tally's "Misc. Expenses (ASSET)" is a balance-sheet head despite its name */
const isPnlRoot = (root: string) =>
  /income|expense|^\S*\.?\s*sales|purchase|manufacturing/i.test(root) && !/asset/i.test(root);

export const PNL_RULES: Rule[] = [
  {
    id: "balance",
    lands: "Balance Sheet — not the P&L",
    says: "A ledger whose root is not an income, expense, sales, purchase or manufacturing head is a balance-sheet ledger and never reaches the P&L.",
    why: "Tally names one asset head “Misc. Expenses (ASSET)”. It is not an expense, so anything with (ASSET) in the root is excluded before the word “expense” is looked for.",
    sign: 1,
    test: (c) => !isPnlRoot(c.root),
  },
  {
    id: "sales",
    lands: "Sales",
    says: "A root naming sales or direct income is revenue — unless it also says purchase or indirect.",
    why: "“Indirect Income” CONTAINS “direct income”. Without the guard, every other-income ledger would be booked as sales.",
    sign: 1,
    test: (c) => /sales|direct income/i.test(c.rootN) && !/purchase|indirect/i.test(c.rootN),
  },
  {
    id: "purchases",
    lands: "Purchases during the Period",
    says: "A root naming purchase is a purchase, and goes into the cost of goods with opening and closing stock.",
    sign: -1,
    test: (c) => /purchase/i.test(c.rootN),
  },
  {
    id: "otherIncome",
    lands: "Other Income",
    says: "A root naming indirect income is other income — below the operating result, not part of revenue.",
    sign: 1,
    test: (c) => /indirect income/i.test(c.rootN),
  },
  {
    id: "manuf",
    lands: "Manufacturing Expenses",
    says: "A root naming manufacturing, or a root that IS exactly “direct expenses”, is a cost of making the product — above the gross profit line.",
    why: "“Indirect Expenses” contains “direct expense”. This is the mistake that put Rs 6.41 Cr of salaries and rent above the gross profit line and left the Indirect line reading zero — and it survived because EBITDA still came out right. “Direct expenses” is now anchored at both ends so it can only match a root that IS direct expenses, and the indirect rung is tested before it could ever matter.",
    sign: -1,
    test: (c) => /manufacturing/i.test(c.rootN) || /^direct expenses?$/i.test(c.rootN.trim()),
  },
  {
    id: "depreciation",
    lands: "Depreciation",
    says: "Inside the expense roots, anything whose group or name mentions depreciation steps out on its own — it is not a cost of running the place.",
    sign: -1,
    test: (c) => isExpenseRoot(c) && /deprecia/.test(hay(c)),
  },
  {
    id: "finance",
    lands: "Finance Charges",
    says: "Inside the expense roots, interest, finance and bank charges step out so EBITDA can be struck without them.",
    sign: -1,
    test: (c) => isExpenseRoot(c) && /finance|interest|bank charg/.test(hay(c)),
  },
  {
    id: "tax",
    lands: "Tax Expense",
    says: "Inside the expense roots, current, deferred and income tax step out — tax is struck after profit, not inside it.",
    sign: -1,
    test: (c) => isExpenseRoot(c) && /current tax|deferred tax|income tax/.test(hay(c)),
  },
  {
    id: "indirect",
    lands: "Indirect Expenses",
    says: "Everything else under an expense root is an indirect expense — the cost of running the company, below gross profit.",
    sign: -1,
    test: (c) => isExpenseRoot(c),
  },
  {
    id: "unmatched",
    lands: "Balance Sheet — not the P&L",
    says: "A P&L root that matched none of the above is left out rather than guessed at. This rung should always be empty; if it is not, a new root has been opened in Tally and the ladder needs a rung.",
    sign: 1,
    test: () => true,
  },
];

const isExpenseRoot = (c: LedgerCtx) => /indirect expense|expense/i.test(c.rootN);
const hay = (c: LedgerCtx) => (c.group + " " + c.ledger).toLowerCase();

/** walk the ladder; first match wins, and one always does */
export function classifyLedger(c: LedgerCtx): { bucket: Bucket; rule: Rule } {
  for (const r of PNL_RULES) {
    if (r.test(c)) {
      const bucket = (r.id === "unmatched" ? "balance" : r.id) as Bucket;
      return { bucket, rule: r };
    }
  }
  return { bucket: "balance", rule: PNL_RULES[PNL_RULES.length - 1] };
}

/* ------------------------------------------------------------------ *
 *  LADDER TWO — which of the twelve operating-expense heads
 * ------------------------------------------------------------------ */

/**
 * Dr Raghu, 30 Sep 2026: "Operating expenses show the heads as below ...
 * ensure that you put the right ledgers in this and all are in the same."
 *
 * Tally's chart gives thirty-six groups under the indirect and finance roots,
 * ordered by nothing in particular. That is a bookkeeper's list. These are a
 * managing director's, and the last one is a catch — so they always add back
 * to the operating-expense total exactly, whatever new ledgers get opened
 * next month.
 *
 * It began as eleven. Directors' remuneration joined the same day (30 Sep
 * 2026, "yes directors remunerations also needs to add in OE") because the
 * catch-all had become the hiding place for the one line a board asks about
 * first. That is the test for a new rung: not how big it is, but whether
 * somebody would ask about it by name.
 */
export const OE_HEADS = [
  "Labour Salaries", "Staff Salaries", "Consultant Salaries", "Directors' Remuneration", "Consultancies",
  "Finance Costs", "Bank Charges", "Utilities", "Rent & Others",
  "Marketing Expenses", "Sales Promotion", "Other OE",
] as const;
export type OeHead = typeof OE_HEADS[number];

export interface OeRule { id: string; head: OeHead; says: string; why?: string; test: (g: string, l: string) => boolean }

/** Is this group a pay group? Exported (14 Oct 2026) so the CEO's Salaries line reads pay by the same test the OE heads use. */
export const isPay = (g: string) => /salar|allowance|bonus|exgratia|gratuity|contribution to funds|welfare|site allowance|payment & provision to employee|wages/.test(g);

export const OE_RULES: OeRule[] = [
  {
    id: "directors",
    head: "Directors' Remuneration",
    says: "What the directors are paid.",
    why: "Dr Raghu, 30 Sep 2026: \"yes directors remunerations also needs to add in OE.\" It was falling into Other OE for want of a head, which made it the largest single thing hidden inside a catch-all \u2014 and what the owners draw is exactly the line a board asks about first. It is now its own rung, tested before every other, so no broader test can reach it.",
    test: (g, l) => /directors?\s*remun/.test(g) || /directors?\s*remun/.test(l),
  },
  {
    id: "labour",
    head: "Labour Salaries",
    says: "Pay, allowances and benefits whose ledger or group is tagged Direct.",
    why: "The chart tags every pay ledger Direct or Indirect — direct is the shop floor, indirect is the office. That tag is the only thing in the books that knows which, so it is what the split stands on. Most direct wages sit above the gross profit line already, so this head is small by design.",
    test: (g, l) => isPay(g) && (/\(direct\)|-\s*direct\b|\bdirect\b/.test(l) || /\(direct\)/.test(g)),
  },
  {
    id: "staff",
    head: "Staff Salaries",
    says: "All other pay: basic, HRA, allowances, bonus, gratuity, PF and ESIC, staff welfare.",
    test: (g) => isPay(g),
  },
  {
    id: "consultant_pay",
    head: "Consultant Salaries",
    says: "Full-time consultants — paid month on month like staff.",
    test: (g, l) => /full time professional|consultancy charges full time/.test(g + " " + l),
  },
  {
    id: "consultancies",
    head: "Consultancies",
    says: "Professional and consultancy fees taken by the job — legal, audit, design, software, HR.",
    test: (g) => /professional|consultanc/.test(g),
  },
  {
    id: "finance_costs",
    head: "Finance Costs",
    says: "Interest of every kind — cash credit, secured, unsecured, penal.",
    test: (g, l) => /interest/.test(g) || /penal interest|interest on/.test(l),
  },
  {
    id: "bank_charges",
    head: "Bank Charges",
    says: "What the bank takes that is not interest — charges, guarantee commission, stamp duty, processing and foreclosure.",
    test: (g, l) => /bank charg|other charges/.test(g) || /bank charg|bank guarantee|loan processing|loan foreclosure|stamp duty/.test(l),
  },
  {
    id: "utilities",
    head: "Utilities",
    says: "Electricity, water, fuel, telephone, internet and courier.",
    why: "Factory power sits under Manufacturing Expenses, above the gross profit line, so it does not appear here.",
    test: (g, l) => /communication|water charg|electric|power|fuel|telephone|internet/.test(g) || /electricity|water charges|telephone|internet/.test(l),
  },
  {
    id: "rent",
    head: "Rent & Others",
    says: "The cost of having premises — rent, rates, taxes, insurance, equipment rentals, security and repairs.",
    test: (g) => /rent|rates|taxes & insurance|insurance|rental|security guard|repairs and maintenance/.test(g),
  },
  {
    id: "marketing",
    head: "Marketing Expenses",
    says: "Building the name — advertising, publicity, exhibitions, memberships and subscriptions.",
    test: (g, l) => /membership & subscription|advertis/.test(g) || /advertis|publicity|exhibition|membership|subscription/.test(l),
  },
  {
    id: "promotion",
    head: "Sales Promotion",
    says: "Winning the order — business promotion, entertainment, tenders, and selling and distribution.",
    why: "Equipment delivery and crane hire sit in Tally's Selling & Distribution group. They are a cost of delivering rather than of promoting; there is no distribution head among the eleven, so they land here. Say the word and they move.",
    test: (g, l) => /business promotion|selling & distribution/.test(g) || /business expenses|entertainment|tender expenses/.test(l),
  },
  {
    id: "other_oe",
    head: "Other OE",
    says: "Everything left — named so rather than hidden. Travelling, motor car, printing, exchange differences and sundries.",
    why: "A catch-all earns its place only if it stays small and stays openable. Directors' remuneration used to sit here and no longer does; if anything else in this head grows large enough to be asked about, it deserves a rung of its own too.",
    test: () => true,
  },
];

export function oeHead(group: string, ledger: string): OeHead {
  const g = String(group || "").toLowerCase();
  const l = String(ledger || "").toLowerCase();
  for (const r of OE_RULES) if (r.test(g, l)) return r.head;
  return "Other OE";
}
export function oeRuleOf(group: string, ledger: string): OeRule {
  const g = String(group || "").toLowerCase();
  const l = String(ledger || "").toLowerCase();
  for (const r of OE_RULES) if (r.test(g, l)) return r;
  return OE_RULES[OE_RULES.length - 1];
}

/* ------------------------------------------------------------------ *
 *  THE STANDING RULES — not about any one ledger
 * ------------------------------------------------------------------ */

export interface BookRule { id: string; title: string; says: string; why: string }

export const BOOK_RULES: BookRule[] = [
  {
    id: "proforma",
    title: "Proforma invoices are not sales",
    says: "Any voucher typed “Proforma Invoice”, and any voucher numbered PI-something, is excluded from every statement — sales, receivables, ageing, all of it.",
    why: "They arrive twice over: as their own voucher type AND as PI-numbered GST Sales. June 2026 alone carried Rs 7.5 Cr of the second kind, which is how the dashboard's billing once ran Rs 9 Cr above the review sheet.",
  },
  {
    id: "newest_fy",
    title: "One ledger, one row — the newest year wins",
    says: "The masters are stored per financial year. Where the same ledger appears in two years' masters, only the newest year's row is read.",
    why: "Loading 2025-26 beside 2026-27 wrote a second row for each of 3,620 ledgers. Every statement walks the ledger list asking what that NAME moved, so a ledger listed twice was answered twice and the whole P&L read exactly double — sales Rs 63.98 Cr against Rs 31.99 Cr. Two years' masters describe one chart of accounts, not two.",
  },
  {
    id: "signs",
    title: "Credit positive, debit negative",
    says: "That is the parser's convention throughout. A cost is a debit, so it arrives negative and is flipped once, at its rule, to read positive on the statement.",
    why: "Flipping in two places is how a figure ends up right in the total and wrong on the line — so each rule declares its own sign and nothing flips it again.",
  },
  {
    id: "stock",
    title: "Stock is read from the dated register, never typed into the statement",
    says: "Opening is the last valuation before the period starts; closing is the last valuation on or before it ends. The statement names both dates, and says so when the closing one is older than the period.",
    why: "A gross profit struck against a stock figure four months stale is a fiction nobody can see unless the statement says so. Tally's XML carries no stock at all — the valuations are entered in the Stock register.",
  },
  {
    id: "period_end",
    title: "The period ends on last month's last day",
    says: "That is the default, and the pickers choose months rather than days.",
    why: "A management statement drawn to the 17th compares against nothing. A part month reads like a collapse in sales and a holiday in costs.",
  },
  {
    id: "netting",
    title: "A party is netted against itself, and never against another",
    says: "Where a customer holds both an open bill and an advance, the two are set off within that customer before anything is totalled. One customer's debit is never netted against another customer's credit.",
    why: "Dr Raghu, 30 Sep 2026: “If a customer has an outstanding and an advance same name it is wrong — it has to internally deduct.” Netting across parties describes a settlement that will never happen.",
  },
  {
    id: "overdraft",
    title: "An overdraft is not cash",
    says: "Cash-in-hand and bank balances are cash; a cash-credit or overdraft account is borrowing, and is reported on its own.",
    why: "The Union Bank CC was being counted as cash, which is how Bank & Cash once read Rs 5.44 Cr when Rs 5.39 Cr of it was money owed to the bank.",
  },
  {
    id: "bills",
    title: "The bill-wise list is the position, not an opening",
    says: "The outstanding bills exported with the masters ARE the position as at that export. Nothing is added to them; the newest year's list is the one that counts.",
    why: "Treating that list as an opening balance and adding the year's allocations to it doubled the receivables — twice, on two different days.",
  },
];
