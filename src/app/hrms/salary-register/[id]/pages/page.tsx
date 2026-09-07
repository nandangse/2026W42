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
    // the record's own headers, matched loosely — "Account No", "Account No.
    // 15 Digit", "IFSC Code", "Bank Name" have all been seen on these sheets
    const pick = (v: Record<string, unknown>, re: RegExp) => {
      for (const k of Object.keys(v)) if (re.test(k) && String(v[k] ?? "").trim()) return String(v[k]).trim();
      return "";
    };
    for (const p of ppl) {
      const v = (p.value || {}) as Record<string, unknown>;
      banks[String(p.id)] = {
        acct: pick(v, /account\s*no/i),
        ifsc: pick(v, /ifsc/i),
        bank: pick(v, /bank\s*name/i),
      };
    }
  }

  return <SalaryRegisterPages sheet={sheet} banks={banks} />;
}
