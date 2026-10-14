import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { mayUseCeo } from "@/lib/ceo/auth";
import CeoCockpit from "@/components/ceo/CeoCockpit";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nandan CEO" };

/**
 * genie.nandan.co.in/ceo — the CEO's own page (Dr Raghu, 14 Oct 2026). Three
 * names in code (lib/ceo/auth.ts); anyone else is sent home, and /api/ceo
 * checks the same list, so a typed address opens nothing.
 */
export default async function CeoPage() {
  const user = await currentUser();
  if (!user || user.disabled) redirect("/login");
  if (!mayUseCeo(user)) redirect("/");
  return <CeoCockpit email={user.email} displayName={user.displayName} initials={user.initials ?? null} role={user.role ?? "user"} />;
}
