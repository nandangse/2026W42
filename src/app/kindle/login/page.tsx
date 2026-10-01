import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentKindler } from "@/lib/kindle/auth";
import KindleLogin from "@/components/kindle/KindleLogin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Kindle — sign in", robots: { index: false, follow: false } };

/** genie.nandan.co.in/kindle/login — the Kindlers' own door (Dr Raghu, 1 Oct 2026). */
export default async function KindleLoginPage({ searchParams }: { searchParams: { invite?: string } }) {
  const invite = searchParams?.invite;
  if (!invite) {
    const k = await currentKindler();
    if (k) redirect("/kindle");
  }
  return <KindleLogin invite={invite} />;
}
