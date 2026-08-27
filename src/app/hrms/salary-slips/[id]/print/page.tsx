import type { Metadata } from "next";
import * as XLSX from "xlsx";
import { currentUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { resolveHrmsAccess } from "@/lib/hrms";
import { extractSlips, pickSamples } from "@/lib/salary-slip";
import SalarySlipsPrint from "@/components/hrms/SalarySlipsPrint";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nandan HRMS Genie" };

/**
 * /hrms/salary-slips/<sheetId>/print — A5 salary slips off the month's file.
 *
 *   ?samples=1   — the nine band samples (worker 10–30k, staff 20k–1.5L+)
 *   ?emp=6972    — one person's slip
 *   (neither)    — every slip in the file, one A5 page each
 *
 * The layout follows the July 2026 Word slip verbatim, minus the line
 * Dr Raghu ordered off it (OT / Comp Off / Late Mark / Late Deduction).
 * Every figure is read from the uploaded sheet itself.
 */
export default async function SalarySlipsPage({ params, searchParams }: {
  params: { id: string };
  searchParams: { samples?: string; emp?: string };
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

  const admin = adminClient();
  const { data: sheet } = await admin
    .from("hrms_salary_sheet").select("id, month, year, file_path, file_name, status").eq("id", params.id).maybeSingle();
  if (!sheet) return <div style={{ padding: 40, fontFamily: "system-ui" }}>No such salary sheet.</div>;
  if (!sheet.file_path) return <div style={{ padding: 40, fontFamily: "system-ui" }}>No stored file for this month.</div>;

  const { data: blob, error } = await admin.storage.from("voice-notes").download(String(sheet.file_path));
  if (error || !blob) return <div style={{ padding: 40, fontFamily: "system-ui" }}>Could not fetch the stored file: {error?.message}</div>;

  const wb = XLSX.read(Buffer.from(await blob.arrayBuffer()), { type: "buffer", raw: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", blankrows: false }) as unknown[][];
  const slips = extractSlips(grid);

  let picked: { label: string | null; slip: NonNullable<ReturnType<typeof extractSlips>>[number] }[];
  if (searchParams.samples) {
    picked = pickSamples(slips)
      .filter((x): x is { label: string; slip: NonNullable<(typeof x)["slip"]> } => !!x.slip)
      .map((x) => ({ label: x.label, slip: x.slip }));
  } else if (searchParams.emp) {
    picked = slips.filter((s) => s.id === String(searchParams.emp)).map((s) => ({ label: null, slip: s }));
  } else {
    picked = slips.map((s) => ({ label: null, slip: s }));
  }

  return <SalarySlipsPrint month={sheet.month} year={sheet.year} picked={picked} total={slips.length} />;
}
