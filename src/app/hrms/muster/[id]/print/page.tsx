import type { Metadata } from "next";
import { currentUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { resolveHrmsAccess } from "@/lib/hrms";
import MusterPrint, { type MRow } from "@/components/hrms/MusterPrint";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nandan HRMS Genie" };

/**
 * /hrms/muster/<sheetId>/print — the month's ATTENDANCE MUSTER on paper
 * (Dr Raghu, 7 Sep 2026: "once you give me the muster and the salary
 * register for print, I can print it, sign it, and then freeze it").
 *
 * The register had a print and the muster never did, though the muster is
 * the one that most needs signing: it is the record of who was actually
 * here. It reads the run's own uploaded muster file — the parsed rows, not
 * the sheet — so what is signed is what the payroll was computed from.
 */
export default async function MusterPrintPage({ params }: { params: { id: string } }) {
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
    .from("hrms_salary_sheet").select("id, month, year, status").eq("id", params.id).maybeSingle();
  if (!sheet) return <div style={{ padding: 40, fontFamily: "system-ui" }}>No such month.</div>;

  const { data: files } = await admin
    .from("hrms_payroll_file").select("id, kind, name, parsed").eq("sheet_id", params.id);
  const f = (files || []).find((x) => /muster/i.test(String(x.kind)) || /muster/i.test(String(x.name || "")));
  if (!f?.parsed) {
    return (
      <div style={{ padding: 40, fontFamily: "system-ui, sans-serif" }}>
        No attendance muster has been uploaded for this month yet — upload it on the run&apos;s Uploads tab, then print.
      </div>
    );
  }
  const parsed = f.parsed as { rows?: MRow[]; days?: number } | MRow[];
  const rows = (Array.isArray(parsed) ? parsed : parsed.rows || []) as MRow[];
  const days = (Array.isArray(parsed) ? 0 : parsed.days || 0)
    || new Date(Date.UTC(Number(sheet.year), Number(sheet.month), 0)).getUTCDate();

  // Sundays of the month, so the week reads at a glance on the sheet
  const sundays: number[] = [];
  for (let d = 1; d <= days; d++)
    if (new Date(Date.UTC(Number(sheet.year), Number(sheet.month) - 1, d)).getUTCDay() === 0) sundays.push(d);

  const sorted = [...rows].sort((a, b) => {
    const x = Number(String(a.employee_id).replace(/\D/g, "")) || 0;
    const y = Number(String(b.employee_id).replace(/\D/g, "")) || 0;
    return x - y;
  });

  return <MusterPrint month={Number(sheet.month)} year={Number(sheet.year)} days={days}
    rows={sorted} status={String(sheet.status)} sundays={sundays} />;
}
