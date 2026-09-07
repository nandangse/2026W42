import type { Metadata } from "next";
import { currentUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { resolveHrmsAccess } from "@/lib/hrms";
import { people } from "@/lib/hrms-wa";
import SalaryRegisterPages, { type Bank } from "@/components/hrms/SalaryRegisterPages";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nandan HRMS Genie" };

/**
 * /hrms/salary-register/<id>/pages — the SIGNING copy of the register
 * (Dr Raghu, 7 Sep 2026: "this will help us to print it, stamp it, sign it,
 * and keep it on record").
 *
 * A4 portrait, one group of people per page, eight columns. The landscape
 * ledger at .../print is untouched and remains the full nineteen-column
 * record; this is the short form meant to be signed.
 *
 * The bank account, IFSC and bank name are read from the HRIS record rather
 * than the salary sheet, because the sheet carries them only when the file
 * happened to include those columns and the record always has them.
 */
export default async function SalaryRegisterPagesRoute({ params }: { params: { id: string } }) {
  const user = await currentUser();
  const admin = adminClient();
  const allowed =
    !!user && !user.disabled && (await resolveHrmsAccess(admin, user.email, user.isOwner));
  if (!allowed) {
    return (
      <div style={{ padding: 40, fontFamily: "system-ui, sans-serif" }}>
        <h1 style={{ fontSize: 20 }}>You are not authorized to view this Page - Login at the right page</h1>
      </div>
    );
  }

  const { data: sheet } = await admin
    .from("hrms_salary_sheet").select("*").eq("id", params.id).maybeSingle();
  if (!sheet) return <div style={{ padding: 40, fontFamily: "system-ui, sans-serif" }}>No such salary sheet.</div>;

  const rows = (sheet.rows || []) as { employee_id: string }[];
  const banks: Record<string, Bank> = {};
  if (rows.length) {
    const ppl = await people(admin, rows.map((r) => String(r.employee_id)));
    /**
     * BY THE KEY, NOT BY A GUESS AT IT (Dr Raghu, 7 Sep 2026: "in the salary
     * register the account number is not put up — it says no bank account on
     * record, but in the payslip you have put it up anyway").
     *
     * I matched the record's keys with /account\s*no/, and the key is
     * `account_no` — an UNDERSCORE, which \s does not match. So it found
     * nothing for anybody and 201 men were reported as having no bank
     * account while their own payslip printed it. The slip reads the keys
     * outright; so does this now, and the two cannot disagree again.
     */
    const val = (v: Record<string, unknown>, ...keys: string[]) => {
      for (const k of keys) { const x = String(v[k] ?? "").trim(); if (x) return x; }
      return "";
    };
    for (const p of ppl) {
      const v = (p.value || {}) as Record<string, unknown>;
      banks[String(p.id)] = {
        acct: val(v, "account_no", "account_15"),
        ifsc: val(v, "ifsc"),
        bank: val(v, "bank_name"),
      };
    }
  }

  return <SalaryRegisterPages sheet={sheet} banks={banks} />;
}
