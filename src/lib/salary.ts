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

export interface SalaryRow { label: string; monthly: number | null; yearly: number | null; kind: "head" | "row" | "total" | "note" }

export function salaryTable(get: (k: string) => unknown, type: string | null): { rows: SalaryRow[]; ctcLakhs: string; exempt: boolean; gross: number } | null {
  const exempt = NO_STATUTORY.has(String(type || "").trim());
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
  const benM = pf + mediclaim + shoes + bonus + leaves + thirdSat;
  const ctcY = netY + benM * 12;

  const R = (label: string, m: number | null, kind: SalaryRow["kind"] = "row"): SalaryRow =>
    ({ label, monthly: m === null ? null : Math.round(m), yearly: m === null ? null : Math.round(m * 12), kind });

  const rows: SalaryRow[] = [
    { label: "Gross Salary", monthly: null, yearly: null, kind: "head" },
    R("Basic & DA", basic),
    ...(exempt ? [] : [R("HRA", hra)]),
    R("Fixed Allowance", fixed),
    R("Conveyance", conv), R("Medical Allowance", med),
    R("Total Gross Salary (A)", gross, "total"),
    { label: "Deductions", monthly: null, yearly: null, kind: "head" },
    ...(exempt
      ? [{ label: "HRA, PF and PT are not applicable for this type of employment", monthly: null, yearly: null, kind: "note" as const }]
      : [
          R("Provident Fund", pf),
          { label: "Professional Tax (Feb 300 will be deducted)", monthly: pt, yearly: pt ? 2500 : 0, kind: "row" as const },
        ]),
    { label: "Total Deductions (B)", monthly: dedM, yearly: dedY, kind: "total" },
    { label: "Net Salary (C = A - B)", monthly: netM, yearly: netY, kind: "total" },
    { label: "Note : TDS will be deducted if applicable on Gross Salary", monthly: null, yearly: null, kind: "note" },
    { label: "Benefits", monthly: null, yearly: null, kind: "head" },
    ...(exempt ? [] : [R("Provident Fund Employer", pf)]),
    R("Mediclaim of 2 lakhs", mediclaim),
    R("Shoes & Uniform Allowance", shoes), R("Annual Bonus Approx @10%", bonus),
    R("Annual Paid Leaves Approx 20 days", leaves), R("Third Saturday Paid 52 days", thirdSat),
    R("Total Benefits (D)", benM, "total"),
    { label: "Total Cost To Company (CTC) (C + D)", monthly: Math.round(netM + benM), yearly: Math.round(ctcY), kind: "total" },
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
