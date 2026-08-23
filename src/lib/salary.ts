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
  const exempt = NO_STATUTORY.has(String(type || "").trim());
  const noBenefits = NO_BENEFITS.has(String(type || "").trim());
  const basic = num(get("Basic and DA")), hra = exempt ? 0 : num(get("HRA")), fixed = num(get("Fixed Allowance"));
  const conv = num(get("Conveyance")), med = num(get("Medical Allowance"));
  const gross = basic + hra + fixed + conv + med;
  if (!gross) return null;

  const pf = !exempt && basic > 0 ? Math.round(Math.min(basic, 15000) * 0.12) : 0;
  const pt = !exempt && gross >= 10000 ? 200 : 0;
  const dedM = pf + pt, dedY = pf * 12 + (pt ? 2500 : 0);
  const netM = gross - dedM, netY = gross * 12 - dedY;

  const mediclaim = 5000 / 12, shoes = 2000 / 12;
  const bonus = basic * 0.10;
  const perDay = gross / 26;
  const leaves = (perDay * 20) / 12;
  const thirdSat = (perDay * 52) / 12;
  const benM = noBenefits ? 0 : pf + mediclaim + shoes + bonus + leaves + thirdSat;
  const inv = (extras || []).filter((e) => e.monthly > 0);
  const invM = inv.reduce((a, e) => a + e.monthly, 0);
  const ctcY = netY + benM * 12 + invM * 12;
  const tds = approxTds(gross, type);

  const R = (label: string, m: number | null, kind: SalaryRow["kind"] = "row"): SalaryRow =>
    ({ label, monthly: m === null ? null : Math.round(m), yearly: m === null ? null : Math.round(m * 12), kind });

  const rows: SalaryRow[] = [
    { label: "Gross Salary", monthly: null, yearly: null, kind: "head" },
    R("Basic & DA", basic),
    ...(exempt ? [] : [R("HRA", hra)]),
    R("Fixed Allowance", fixed),
    R("Conveyance", conv), R("Medical Allowance", med),
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
    ...(noBenefits
      ? [{ label: "Benefits are not applicable for Management", monthly: null, yearly: null, kind: "note" as const }]
      : [
          ...(exempt ? [] : [R("Provident Fund Employer", pf)]),
          R("Mediclaim of 2 lakhs", mediclaim),
          R("Shoes & Uniform Allowance", shoes), R("Annual Bonus Approx @10%", bonus),
          R("Annual Paid Leaves Approx 20 days", leaves), R("Third Saturday Paid 52 days", thirdSat),
        ]),
    { label: "Total Benefits (D)", monthly: Math.round(benM), yearly: Math.round(benM * 12), kind: "total" },
    ...(inv.length
      ? [
          { label: "Company Investment in You", monthly: null, yearly: null, kind: "head" as const },
          ...inv.map((e) => R(e.label, e.monthly)),
          { label: "Total Investment (E)", monthly: invM, yearly: invM * 12, kind: "total" as const },
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
