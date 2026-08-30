import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { resolveSevaAccess } from "@/lib/seva";
import Seva from "@/components/Seva";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Nandan Seva Genie" };

/**
 * genie.nandan.co.in/seva — the customer-service module's door (Dr Raghu,
 * 30 Aug 2026). Same login as Genie; the grant is the Seva tick on
 * Admin → module access (seva_access, keyed by email, owner implicit).
 */
export default async function SevaPage() {
  const user = await currentUser();
  if (!user || user.disabled) redirect("/login");
  if (!(await resolveSevaAccess(adminClient(), user.email, user.isOwner))) redirect("/");

  return (
    <Seva
      email={user.email}
      displayName={user.displayName}
      initials={user.initials ?? null}
      role={user.role ?? "user"}
    />
  );
}
