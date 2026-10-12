import type { Metadata } from "next";
import { redirect } from "next/navigation";
import MyLedger from "@/components/MyLedger";
import { adminClient } from "@/lib/supabase/admin";
import { fieldPerson } from "@/lib/field-person";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My advances & expenses · Nandan GSE" };

/** genie.nandan.co.in/idp/ledger — the service person's own advances and expenses (Dr Raghu, 12 Oct 2026). */
export default async function LedgerPage() {
  if (!(await fieldPerson(adminClient()))) redirect("/idp/sign-in");
  return <MyLedger />;
}
