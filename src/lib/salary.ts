/**
 * The compensation arithmetic, in one place.
 *
 * It began inside the IDP route; the Appraisal card needs the identical table
 * at a PROPOSED gross, and two copies of pay arithmetic is how two screens
 * end up telling somebody two different CTCs. The layout and the rules are
 * Dr Raghu's compensation sheet, unchanged.
 */

export const num = (v: unknown) => {
  const n = parseFloat(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** HRA, PF and PT do not apply to Management and the contract types. */
export const NO_STATUTORY = new Set(["Management", "Contractor", "Labour - Contract", "Staff - Contract"]);

/** The whole Benefits block does not apply to Management (Dr Raghu, 23 Aug 2026). */
export const NO_BENEFITS = new Set(["Management"]);

/** Contract engagements are taxed flat at source; employees by the slab. */
const CONTRACT_TDS = new Set(["Contractor", "Labour - Contract", "Staff - Contract"]);
/** Contract engagements (Dr Raghu, 29 Aug 2026): ALL benefits zero — their
 *  CTC is the Basic & DA alone. */
export const CONTRACT_TYPES_SET = CONTRACT_TDS;
/**
 * WORKERS GET NEITHER HRA NOR MEDICAL ALLOWANCE (Dr Raghu, 2 Sep 2026: "HR
 * medical allowance is not there for workers. Please note. No HRA either").
 *
 * Caught on a Prod - Fitter's appraisal card, which was offering a Medical
 * Allowance of Rs 1,250 marked "always" and carrying an HRA line. Labour is
 * the biggest group on the roll -- 116 of the 200 -- so this was not an edge
 * case: it was the majority of the company being shown a structure they are
 * not on, and every increment split against it would have put money in two
 * heads that do not exist for them.
 *
 * Labour - Contract is here too. It is already contract-exempt on other
 * grounds, but the rule is about being a WORKER, not about the contract, and
 * a rule that only works by accident stops working when the accident does.
 */
export const NO_HRA_NO_MEDICAL = new Set(["Labour", "Labour - Contract"]);

/**
 * PAY DAYS IN A MONTH, and so the per-day rate (Dr Raghu, 7 Sep 2026):
 * "per day = gross/26 for labour and labour - contract, for rest 31."
 */
export const payDaysFor = (type: string | null | undefined): 26 | 31 =>
  NO_HRA_NO_MEDICAL.has(String(type || "")) ? 26 : 31;

/** The per-day rate on a gross, by his rule. */
export const perDayOf = (gross: number | null | undefined, type: string | null | undefined): number | null =>
  gross == null || !Number.isFinite(Number(gross)) ? null : Number(gross) / payDaysFor(type);

/** The annual bonus belongs to Staff and Labour alone (same day). */
const BONUS_TYPES = new Set(["Staff", "Labour"]);

/**
 * Approximate TDS on the gross — INDICATIVE ONLY, printed with that word.
 * Contract types: the flat 2% the company deducts at source. Employees: the
 * new-regime slabs on annual gross less the standard deduction, the 87A
 * rebate up to 12L, and 4% cess. No declarations, no other income — a
 * ballpark so the conversation is not innumerate, never a computation of tax.
 */
export function approxTds(grossMonthly: number, type: string | null): { monthly: number; yearly: number } {
  const t = String(type || "").trim();
  const annual = grossMonthly * 12;
  if (CONTRACT_TDS.has(t)) {
    const y = Math.round(annual * 0.02);
    return { monthly: Math.round(y / 12), yearly: y };
  }
  const taxable = Math.max(0, annual - 75000);
  if (taxable <= 1200000) return { monthly: 0, yearly: 0 };
  const SLABS: [number, number][] = [
    [400000, 0], [800000, 0.05], [1200000, 0.10], [1600000, 0.15], [2000000, 0.20], [2400000, 0.25], [Infinity, 0.30],
  ];
  let tax = 0, lo = 0;
  for (const [hi, rate] of SLABS) {
    if (taxable > lo) tax += (Math.min(taxable, hi) - lo) * rate;
    lo = hi;
  }
  // Marginal relief: just past the rebate line the tax cannot exceed the
  // income above it. Without this, ₹1.05L a month shows nil and ₹1.10L shows
  // ₹69,000 — a cliff that is not what anybody would actually pay.
  tax = Math.min(tax, taxable - 1200000);
  const y = Math.round(tax * 1.04);
  return { monthly: Math.round(y / 12), yearly: y };
}

/** An extra line the company invests beyond pay — LIC, training, leader development. */
export interface ExtraRow { label: string; monthly: number }

export interface SalaryRow { label: string; monthly: number | null; yearly: number | null; kind: "head" | "row" | "total" | "note" }

export function salaryTable(get: (k: string) => unknown, type: string | null, extras?: ExtraRow[]): { rows: SalaryRow[]; ctcLakhs: string; exempt: boolean; gross: number } | null {
  const t = String(type || "").trim();
  const exempt = NO_STATUTORY.has(t);
  const noBenefits = NO_BENEFITS.has(t);
  const worker = NO_HRA_NO_MEDICAL.has(t);
  const isContract = CONTRACT_TDS.has(t);
  const basic = num(get("Basic and DA"));
  // a contract engagement is Basic & DA ALONE (Dr Raghu, 29 Aug 2026) —
  // no HRA, no allowances, no statutory, no benefits; CTC = the basic.
  const hra = exempt || worker ? 0 : num(get("HRA"));
  const fixed = isContract ? 0 : num(get("Fixed Allowance"));
  const conv = isContract ? 0 : num(get("Conveyance"));
  const med = isContract || worker ? 0 : num(get("Medical Allowance"));
  const gross = basic + hra + fixed + conv + med;
  if (!gross) return null;

  // PF: 12% of Basic & DA or ₹1,800, whichever is lower (the 15,000 wage
  // ceiling says the same thing). PT: the Maharashtra slab — 175 between
  // 7,500 and 10,000, 200 above (300 in February, hence 2,500 a year).
  const pf = !exempt && basic > 0 ? Math.min(Math.round(basic * 0.12), 1800) : 0;
  const pt = exempt ? 0 : gross > 10000 ? 200 : gross >= 7500 ? 175 : 0;
  const dedM = pf + pt, dedY = pf * 12 + (pt === 200 ? 2500 : pt === 175 ? 2100 : 0);
  const netM = gross - dedM, netY = gross * 12 - dedY;

  const mediclaim = 5000 / 12, shoes = 2000 / 12;
  const bonus = BONUS_TYPES.has(t) ? basic * 0.10 : 0;
  const perDay = gross / 26;
  const leaves = (perDay * 20) / 12;
  // twelve a year — the third Saturday of each month, not every Saturday
  const thirdSat = (perDay * THIRD_SATURDAYS_A_YEAR) / 12;
  const benM = noBenefits || isContract ? 0 : pf + mediclaim + shoes + bonus + leaves + thirdSat;
  const inv = (extras || []).filter((e) => e.monthly > 0);
  const invM = inv.reduce((a, e) => a + e.monthly, 0);
  // contract CTC is the basic alone — the agreed payout, nothing added
  const ctcY = isContract ? basic * 12 : netY + benM * 12 + invM * 12;
  const tds = approxTds(gross, type);

  const R = (label: string, m: number | null, kind: SalaryRow["kind"] = "row"): SalaryRow =>
    ({ label, monthly: m === null ? null : Math.round(m), yearly: m === null ? null : Math.round(m * 12), kind });

  const rows: SalaryRow[] = [
    { label: "Gross Salary", monthly: null, yearly: null, kind: "head" },
    R("Basic & DA", basic),
    ...(exempt || worker ? [] : [R("HRA", hra)]),
    R("Fixed Allowance", fixed),
    R("Conveyance", conv),
    ...(worker ? [] : [R("Medical Allowance", med)]),
    R("Total Gross Salary (A)", gross, "total"),
    { label: "Approx Tax Deducted at Source (TDS) on Gross — indicative", monthly: tds.monthly, yearly: tds.yearly, kind: "row" },
    { label: "TDS is an estimate only; the actual depends on declarations and other income", monthly: null, yearly: null, kind: "note" },
    { label: "Deductions", monthly: null, yearly: null, kind: "head" },
    ...(exempt
      ? [{ label: "HRA, PF and PT are not applicable for this type of employment", monthly: null, yearly: null, kind: "note" as const }]
      : [
          R("Provident Fund", pf),
          { label: "Professional Tax (Feb 300 will be deducted)", monthly: pt, yearly: pt ? 2500 : 0, kind: "row" as const },
        ]),
    { label: "Total Deductions (B)", monthly: dedM, yearly: dedY, kind: "total" },
    { label: "Net Salary (C = A - B)", monthly: netM, yearly: netY, kind: "total" },
    { label: "Benefits", monthly: null, yearly: null, kind: "head" },
    ...(noBenefits || isContract
      ? [{ label: isContract ? "A contract engagement — no benefits; the CTC is the Basic & DA alone" : "Benefits are not applicable for Management", monthly: null, yearly: null, kind: "note" as const }]
      : [
          ...(exempt ? [] : [R("Provident Fund Employer", pf)]),
          R("Mediclaim of 2 lakhs", mediclaim),
          R("Shoes & Uniform Allowance", shoes),
          ...(bonus > 0 ? [R("Annual Bonus Approx @10%", bonus)] : []),
          R("Annual Paid Leaves Approx 20 days", leaves), R(`Third Saturday Paid ${THIRD_SATURDAYS_A_YEAR} days`, thirdSat),
        ]),
    { label: "Total Benefits (D)", monthly: Math.round(benM), yearly: Math.round(benM * 12), kind: "total" },
    ...(inv.length
      ? [
          { label: "Company Investment in You", monthly: null, yearly: null, kind: "head" as const },
          ...inv.map((e) => R(e.label, e.monthly)),
          { label: "Total Investment (E)", monthly: Math.round(invM), yearly: Math.round(invM * 12), kind: "total" as const },
          { label: `Total Cost To Company (CTC) (C + D + E)`, monthly: Math.round(netM + benM + invM), yearly: Math.round(ctcY), kind: "total" as const },
        ]
      : [{ label: "Total Cost To Company (CTC) (C + D)", monthly: Math.round(netM + benM), yearly: Math.round(ctcY), kind: "total" as const }]),
  ];
  return { rows, ctcLakhs: (ctcY / 100000).toFixed(1), exempt, gross };
}

/**
 * The same person at a DIFFERENT gross: every component keeps its share of
 * today's gross, so the structure moves with the number instead of being
 * retyped line by line.
 */
export function scaledGetter(get: (k: string) => unknown, newGross: number): (k: string) => unknown {
  const parts = ["Basic and DA", "HRA", "Fixed Allowance", "Conveyance", "Medical Allowance"];
  const current = parts.reduce((s, k) => s + num(get(k)), 0);
  if (!current || !newGross) return get;
  const f = newGross / current;
  return (k: string) => (parts.includes(k) ? num(get(k)) * f : get(k));
}


/* ─────────────────────────────────────────────────────────────────────────
 * Splitting a gross into its components.
 *
 * Two numbers drive it — the GROSS and the BASIC as a percentage of it —
 * and the rest follows, exactly as the letters in use do it:
 *
 *   Basic & DA   = gross x basic%          (58% in the letters)
 *   HRA          = 40% of basic            (20% for a company at a non-metro)
 *   Conveyance   = 5,000 capped
 *   Medical      = 1,250 flat
 *   Fixed        = whatever is left        <- the balancer, so the five
 *                                            components always sum to the
 *                                            gross that was agreed
 *
 * Checked against the March 2026 letter: 48,650 gross at 58.07% gives basic
 * 28,250, HRA 5,650, conveyance 5,000, medical 1,250 and fixed 8,500 —
 * the printed letter to the rupee.
 *
 * Any component can then be overridden by hand; `fixed` absorbs the
 * difference so the gross never silently changes underneath the agreement.
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * The third Saturday of every month is a paid holiday, and anyone who works
 * it takes a compensatory day — so it is a real cost the company carries.
 * TWELVE a year (Dr Raghu, 24 Aug 2026). It was carried as 52 from the first
 * draft, which counted every Saturday and overstated every CTC in Genie.
 */
export const THIRD_SATURDAYS_A_YEAR = 12;

export const SPLIT_DEFAULTS = { basicPct: 58, hraOfBasic: 20, conveyance: 5000, medical: 1250 };

export interface Components { basic_da: number; hra: number; fixed_allowance: number; conveyance: number; medical_allowance: number }

export function splitGross(gross: number, basicPct = SPLIT_DEFAULTS.basicPct, type?: string | null): Components {
  const g = Math.max(0, Math.round(num(gross)));
  if (!g) return { basic_da: 0, hra: 0, fixed_allowance: 0, conveyance: 0, medical_allowance: 0 };
  // contract: the whole engagement IS the basic (29 Aug 2026)
  if (CONTRACT_TDS.has(String(type || "").trim()))
    return { basic_da: g, hra: 0, fixed_allowance: 0, conveyance: 0, medical_allowance: 0 };
  const exempt = NO_STATUTORY.has(String(type || "").trim());
  // Dr Raghu, 2 Sep 2026: workers have neither head, so the split must not
  // create one -- the Fixed Allowance takes what HRA and Medical would have.
  const worker = NO_HRA_NO_MEDICAL.has(String(type || "").trim());
  const pct = Math.min(100, Math.max(1, num(basicPct) || SPLIT_DEFAULTS.basicPct));

  const basic = Math.round((g * pct) / 100);
  // HRA is not paid to the types that do not get it — the balance goes to Fixed
  const hra = exempt || worker ? 0 : Math.round((basic * SPLIT_DEFAULTS.hraOfBasic) / 100);
  const conveyance = Math.min(SPLIT_DEFAULTS.conveyance, Math.max(0, g - basic - hra));
  const medical = worker ? 0 : Math.min(SPLIT_DEFAULTS.medical, Math.max(0, g - basic - hra - conveyance));
  const fixed = Math.max(0, g - basic - hra - conveyance - medical);

  return { basic_da: basic, hra, fixed_allowance: fixed, conveyance, medical_allowance: medical };
}

/** A getter over an explicit set of components, for salaryTable(). */
export function getterFor(c: Components): (k: string) => number {
  const map: Record<string, number> = {
    "Basic and DA": c.basic_da, "HRA": c.hra, "Fixed Allowance": c.fixed_allowance,
    "Conveyance": c.conveyance, "Medical Allowance": c.medical_allowance,
  };
  return (k: string) => map[k] ?? 0;
}

export const componentsTotal = (c: Components) =>
  c.basic_da + c.hra + c.fixed_allowance + c.conveyance + c.medical_allowance;
