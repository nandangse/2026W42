import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { resolveMarketing } from "@/lib/marketing";
import MarketingApp from "@/components/marketing/MarketingApp";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nandan Marketing" };

/** genie.nandan.co.in/marketing — the ninth door (Dr Raghu, 6 Sep 2026). */
export default async function MarketingPage({ params }: { params: { section?: string[] } }) {
  const user = await currentUser();
  if (!user || user.disabled) redirect("/login");
  const r = await resolveMarketing(user.email, user.isOwner);
  if (!r.ok) redirect("/");
  return (
    <MarketingApp
      email={user.email} displayName={user.displayName} initials={user.initials} role={user.role}
      marketingRole={r.role} initialSection={params.section?.[0] || "leads"}
    />
  );
}
