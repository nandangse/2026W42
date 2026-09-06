import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { hrmsTables } from "@/lib/hrms";
import { MONTHS, type SheetRow } from "@/lib/salary-sheet";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My Salary Slips" };

/**
 * /my/salary-slips — self-service: YOUR slips, nobody else's.
 *
 * The login's email is matched to exactly one employee record, the same
 * bridge the IDP uses — matched lowercase-exact in code, never with a
 * pattern, because a wildcard once filed a slip against the wrong person's
 * record. Only FROZEN months appear.
 */
async function myEmployeeId(email: string): Promise<{ id: string; name: string } | null> {
  const admin = adminClient();
  const T = await hrmsTables(admin);
  const e = email.trim().toLowerCase();
  const { data: eds } = await admin.from(T.edits).select("employee_id, value").eq("field", "user_email");
  const hitEdit = (eds || []).find((x) => String(x.value || "").trim().toLowerCase() === e);
  const { data: emps } = await admin.from(T.employees).select("id, name, email");
  if (hitEdit) {
    const emp = (emps || []).find((x) => String(x.id) === String(hitEdit.employee_id));
    return emp ? { id: String(emp.id), name: String(emp.name || emp.id) } : null;
  }
  const hit = (emps || []).find((x) => String(x.email || "").trim().toLowerCase() === e);
  return hit ? { id: String(hit.id), name: String(hit.name || hit.id) } : null;
}

export default async function MySlipsPage() {
  const user = await currentUser();
  if (!user || user.disabled) redirect("/login");

  const me = await myEmployeeId(user.email);
  if (!me) {
    return (
      <div style={{ padding: 40, fontFamily: "system-ui, sans-serif", maxWidth: 560 }}>
        <h1 style={{ fontSize: 20 }}>My Salary Slips</h1>
        <p style={{ color: "var(--dim)", lineHeight: 1.7 }}>
          Your login is not linked to an employee record yet. Ask HR to set your Genie user on your
          record in the Employee Master, and your slips appear here.
        </p>
      </div>
    );
  }

  const admin = adminClient();
  const { data: sheets } = await admin
    .from("hrms_salary_sheet").select("id, month, year, status, rows")
    .eq("status", "Frozen")
    .order("year", { ascending: false }).order("month", { ascending: false }).limit(24);

  const mine = (sheets || [])
    .map((s) => ({ s, row: ((s.rows || []) as SheetRow[]).find((r) => r.employee_id === me.id) }))
    .filter((x) => x.row);

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)", fontFamily: "system-ui, sans-serif", color: "var(--navy)" }}>
      <div style={{ background: "var(--navy)", color: "#fff", padding: "12px 18px" }}>
        <b style={{ fontSize: 15 }}>My Salary Slips</b>
        <span style={{ opacity: .7, fontSize: 13 }}> — {me.name} · {me.id}</span>
      </div>
      <div style={{ maxWidth: 620, margin: "24px auto", padding: "0 16px" }}>
        {!mine.length && (
          <div style={{ background: "#fff", border: "1px solid #E2E0DA", borderRadius: 8, padding: 18, fontSize: 14, color: "var(--dim)", lineHeight: 1.7 }}>
            No slip is available yet. A month&apos;s slips appear here once HR closes and freezes that month.
          </div>
        )}
        {mine.map(({ s, row }) => (
          <Link key={s.id} href={`/my/salary-slips/${s.id}`}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              background: "#fff", border: "1px solid #E2E0DA", borderRadius: 8, padding: "14px 16px",
              marginBottom: 10, textDecoration: "none", color: "var(--navy)",
            }}>
            <b style={{ fontSize: 15 }}>🧾 {MONTHS[s.month - 1]} {s.year}</b>
            <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700, color: "#0D6E39" }}>
              ₹{Math.round(row!.net || 0).toLocaleString("en-IN")}
            </span>
          </Link>
        ))}
        <p style={{ fontSize: 12, color: "#8B8F87", lineHeight: 1.6 }}>
          Opening a slip records the date you first saw it — that is your acknowledgement to HR.
        </p>
      </div>
    </div>
  );
}
