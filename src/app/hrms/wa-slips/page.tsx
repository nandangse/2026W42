import type { Metadata } from "next";
import { currentUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { resolveHrmsAccess } from "@/lib/hrms";
import WaSlips from "@/components/hrms/WaSlips";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nandan HRMS Genie — payslips on WhatsApp" };

/** /hrms/wa-slips?sheet=<id> — payslips on WhatsApp Web, one by one, from Vinay's own number (7 Oct 2026) */
export default async function Page({ searchParams }: { searchParams: { sheet?: string; mode?: string } }) {
  const user = await currentUser();
  const allowed = !!user && !user.disabled && (await resolveHrmsAccess(adminClient(), user.email, user.isOwner));
  if (!allowed) return <div style={{ padding: 40, fontFamily: "system-ui, sans-serif" }}><h1 style={{ fontSize: 20 }}>You are not authorized to view this Page - Login at the right page</h1></div>;
  if (!searchParams.sheet) return <div style={{ padding: 40, fontFamily: "system-ui, sans-serif" }}>Which month? Open it from Salary Sheets → 💬 WhatsApp slips.</div>;
  return <WaSlips sheetId={searchParams.sheet} mode={searchParams.mode === "message" ? "message" : "slip"} />;
}
