import type { Metadata } from "next";
import { currentUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { resolveHrmsAccess } from "@/lib/hrms";
import SalaryRegisterPrint from "@/components/hrms/SalaryRegisterPrint";
import { buildMis, type MisDelivery } from "@/lib/salary-mis";
import type { SheetRow } from "@/lib/salary-sheet";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nandan HRMS Genie" };

/**
 * /hrms/salary-register/<id>/print — the month's salary register on paper.
 *
 * Page 1 is the month's summary, then the three-month Salary MIS, then the
 * register in landscape. Every figure
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

  /* THE SALARY MIS (Dr Raghu, 7 Oct 2026): this month and the two before it,
     every head beside what the factory delivered in the same months */
  const admin = adminClient();
  const { data: runs } = await admin.from("hrms_salary_sheet").select("month, year, status, rows, generated_at")
    .or(`year.lt.${sheet.year},and(year.eq.${sheet.year},month.lte.${sheet.month})`).order("year", { ascending: false }).order("month", { ascending: false }).limit(3);
  const three = (runs ?? []).map((r) => ({ month: Number(r.month), year: Number(r.year), status: String(r.status), rows: (r.rows ?? []) as SheetRow[], generated_at: r.generated_at as string | null }));
  const first = three[three.length - 1];
  const from = first ? `${first.year}-${String(first.month).padStart(2, "0")}-01` : `${sheet.year}-${String(sheet.month).padStart(2, "0")}-01`;
  const to = new Date(sheet.year, sheet.month, 0).toISOString().slice(0, 10);
  const agg = new Map<string, MisDelivery>();
  for (let a = 0; ; a += 1000) {
    const { data, error } = await admin.from("delivered_jobs").select("delivered_on, val, tp, tpv").gte("delivered_on", from).lte("delivered_on", to).order("delivered_on").range(a, a + 999);
    if (error || !data) break;
    for (const d of data) {
      const ym = String(d.delivered_on).slice(0, 7);
      const o = agg.get(ym) ?? { ym, n: 0, value: 0, tp: 0 };
      o.n++; o.value += Number(d.val) || 0; o.tp += Number(d.tp) || Number(d.tpv) || 0; agg.set(ym, o);
    }
    if (data.length < 1000) break;
  }
  const mis = buildMis(three, [...agg.values()]);
  return <SalaryRegisterPrint sheet={sheet} mis={mis} />;
}
