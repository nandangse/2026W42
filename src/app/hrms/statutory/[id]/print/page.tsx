import type { Metadata } from "next";
import * as XLSX from "xlsx";
import { currentUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { resolveHrmsAccess } from "@/lib/hrms";
import { extractSlips, type Slip } from "@/lib/salary-slip";
import { MONTHS } from "@/lib/salary-sheet";
import StatutoryPrint from "@/components/hrms/StatutoryPrint";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nandan HRMS Genie" };

const RETURN_KINDS = ["pf", "pt", "mlwf", "esic", "tds"] as const;

/**
 * /hrms/statutory/<sheetId>/print?kind=pf|pt|mlwf|esic|tds
 *
 * A statutory return register off a FROZEN month — a draft month refuses,
 * because a return filed off numbers that can still move is a correction
 * waiting to be filed. Every figure from the sheet alone.
 */
export default async function StatutoryPage({ params, searchParams }: {
  params: { id: string }; searchParams: { kind?: string };
}) {
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

  const kind = (RETURN_KINDS as readonly string[]).includes(String(searchParams.kind)) ? String(searchParams.kind) : "pf";
  const admin = adminClient();
  const { data: sheet } = await admin
    .from("hrms_salary_sheet").select("id, month, year, status, file_path, frozen_by, frozen_at").eq("id", params.id).maybeSingle();
  if (!sheet) return <div style={{ padding: 40, fontFamily: "system-ui" }}>No such salary sheet.</div>;
  if (sheet.status !== "Frozen")
    return (
      <div style={{ padding: 40, fontFamily: "system-ui", maxWidth: 560 }}>
        <h2 style={{ fontSize: 18 }}>{MONTHS[sheet.month - 1]} {sheet.year} is not frozen.</h2>
        <p style={{ color: "var(--dim)" }}>A return filed off numbers that can still move is a correction waiting to be filed. Freeze the month in Salary Sheets first.</p>
      </div>
    );

  const { data: blob, error } = await admin.storage.from("voice-notes").download(String(sheet.file_path));
  if (error || !blob) return <div style={{ padding: 40, fontFamily: "system-ui" }}>Could not fetch the stored file.</div>;
  const wb = XLSX.read(Buffer.from(await blob.arrayBuffer()), { type: "buffer", raw: false });
  const grid = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", blankrows: false }) as unknown[][];
  const slips: Slip[] = extractSlips(grid);

  return <StatutoryPrint kind={kind} month={sheet.month} year={sheet.year} slips={slips} frozenBy={String(sheet.frozen_by || "")} />;
}
