import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { resolveVishwakarmaAccess } from "@/lib/vishwakarma";
import Vishwakarma from "@/components/Vishwakarma";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Nandan Vishwakarma Genie" };

/**
 * genie.nandan.co.in/vishwakarma — the design module's door (Dr Raghu,
 * 28 Aug 2026). Same login as Genie; the grant is the Vishwakarma tick on
 * Admin → module access (vishwakarma_access, keyed by email, owner implicit).
 */
export default async function VishwakarmaPage() {
  const user = await currentUser();
  if (!user || user.disabled) redirect("/login");
  if (!(await resolveVishwakarmaAccess(adminClient(), user.email, user.isOwner))) redirect("/");

  return (
    <Vishwakarma
      email={user.email}
      displayName={user.displayName}
      initials={user.initials ?? null}
      role={user.role ?? "user"}
    />
  );
}
