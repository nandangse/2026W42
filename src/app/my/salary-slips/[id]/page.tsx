import type { Metadata } from "next";
import { redirect } from "next/navigation";
import * as XLSX from "xlsx";
import { currentUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { hrmsTables } from "@/lib/hrms";
import { extractSlips } from "@/lib/salary-slip";
import SalarySlipsPrint from "@/components/hrms/SalarySlipsPrint";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My Salary Slip" };

/**
 * /my/salary-slips/<sheetId> — ONE person's slip, their own.
 *
 * Opening it writes the acknowledgement: first_at once and never again,
 * last_at every visit. The write happens before the render on purpose —
 * "I opened it but it did not count" must not be possible.
 */
export default async function MySlipPage({ params }: { params: { id: string } }) {
  const user = await currentUser();
  if (!user || user.disabled) redirect("/login");

  const admin = adminClient();
  const T = await hrmsTables(admin);
  const e = user.email.trim().toLowerCase();
  const { data: eds } = await admin.from(T.edits).select("employee_id, value").eq("field", "user_email");
  const hitEdit = (eds || []).find((x) => String(x.value || "").trim().toLowerCase() === e);
  let myId: string | null = hitEdit ? String(hitEdit.employee_id) : null;
  if (!myId) {
    const { data: emps } = await admin.from(T.employees).select("id, email");
    const hit = (emps || []).find((x) => String(x.email || "").trim().toLowerCase() === e);
    myId = hit ? String(hit.id) : null;
  }
  if (!myId) redirect("/my/salary-slips");

  const { data: sheet } = await admin
    .from("hrms_salary_sheet").select("id, month, year, status, file_path").eq("id", params.id).maybeSingle();
  if (!sheet || sheet.status !== "Frozen") redirect("/my/salary-slips");

  const { data: blob, error } = await admin.storage.from("voice-notes").download(String(sheet.file_path));
  if (error || !blob) redirect("/my/salary-slips");
  const wb = XLSX.read(Buffer.from(await blob.arrayBuffer()), { type: "buffer", raw: false });
  const grid = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", blankrows: false }) as unknown[][];
  const slip = extractSlips(grid).find((s) => s.id === myId);
  if (!slip) redirect("/my/salary-slips");

  // the acknowledgement — before the render, so seeing it always counts
  try {
    const { data: prev } = await admin
      .from("hrms_slip_ack").select("opens").eq("sheet_id", sheet.id).eq("employee_id", myId).maybeSingle();
    await admin.from("hrms_slip_ack").upsert({
      sheet_id: sheet.id, employee_id: myId, email: user.email,
      last_at: new Date().toISOString(), opens: (prev?.opens || 0) + 1,
      ...(prev ? {} : { first_at: new Date().toISOString() }),
    }, { onConflict: "sheet_id,employee_id" });
  } catch { /* pre-0072 — the slip still shows; the stamp waits for the table */ }

  return <SalarySlipsPrint month={sheet.month} year={sheet.year} picked={[{ label: null, slip }]} total={1} />;
}
