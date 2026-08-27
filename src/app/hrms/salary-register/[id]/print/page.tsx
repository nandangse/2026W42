import type { Metadata } from "next";
import { currentUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { resolveHrmsAccess } from "@/lib/hrms";
import SalaryRegisterPrint from "@/components/hrms/SalaryRegisterPrint";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nandan HRMS Genie" };

/**
 * /hrms/salary-register/<id>/print — the month's salary register on paper.
 *
 * Page 1 is the MIS summary; the register follows in landscape. Every figure
 * comes from the uploaded sheet's own columns — for the past months the
 * sheet is the only truth, and a figure it never carried prints as a dash,
 * not as a computed guess (Dr Raghu, 24 Aug 2026). The format changes from
 * August; this page prints whatever the file said.
 */
export default async function SalaryRegisterPage({ params }: { params: { id: string } }) {
  const user = await currentUser();
  const allowed =
    !!user && !user.disabled && (await resolveHrmsAccess(adminClient(), user.email, user.isOwner));
  if (!allowed) {
    return (
      <div style={{ padding: 40, fontFamily: "system-ui, sans-serif" }}>
        <h1 style={{ fontSize: 20 }}>You are not authorized to view this Page - Login at the right page</h1>
      </div>
    );
  }

  const { data: sheet } = await adminClient()
    .from("hrms_salary_sheet").select("*").eq("id", params.id).maybeSingle();
  if (!sheet) return <div style={{ padding: 40, fontFamily: "system-ui, sans-serif" }}>No such salary sheet.</div>;

  return <SalaryRegisterPrint sheet={sheet} />;
}
