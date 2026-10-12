import type { Metadata } from "next";
import { redirect } from "next/navigation";
import FieldAttendance from "@/components/FieldAttendance";
import { adminClient } from "@/lib/supabase/admin";
import { fieldPerson } from "@/lib/field-person";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Attendance · Nandan GSE" };

/**
 * genie.nandan.co.in/idp/attendance — the outdoor service team's check in and
 * check out, with the GPS position and a photo (Dr Raghu, 12 Oct 2026).
 * Reached with a Genie login or the personal-e-mail login HR issues.
 */
export default async function AttendancePage() {
  const me = await fieldPerson(adminClient());
  if (!me) redirect("/idp/sign-in");
  return <FieldAttendance />;
}
