import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { mayUseLeadersCouncil } from "@/lib/lc/auth";
import LeadersCouncil from "@/components/lc/LeadersCouncil";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Nandan Leaders Council" };

/**
 * genie.nandan.co.in/lc — the Leaders Council's door (Dr Raghu, 10 Oct
 * 2026). Same login as Genie; the key is the LC mark on Admin → Groups, the
 * owner implicit. Anyone else is sent home — the page AND every /api/lc
 * route check, so a bookmark or a typed address opens nothing.
 */
export default async function LeadersCouncilPage() {
  const user = await currentUser();
  if (!user || user.disabled) redirect("/login");
  if (!mayUseLeadersCouncil(user)) redirect("/");
  return (
    <LeadersCouncil
      email={user.email}
      displayName={user.displayName}
      initials={user.initials ?? null}
      role={user.role ?? "user"}
      isOwner={user.isOwner}
    />
  );
}
