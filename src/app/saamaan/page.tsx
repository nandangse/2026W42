import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { resolveSaamaanAccess } from "@/lib/saamaan";
import SaamaanApp from "@/components/saamaan/SaamaanApp";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nandan Saamaan Genie" };

/**
 * genie.nandan.co.in/saamaan — the materials module's door (Dr Raghu,
 * 2 Sep 2026). Same login as Genie; the grant is the Saamaan tick on
 * Admin → module access (material_access, keyed by email, owner implicit).
 */
export default async function SaamaanPage() {
  const user = await currentUser();
  if (!user || user.disabled) redirect("/login");
  if (!(await resolveSaamaanAccess(adminClient(), user.email, user.isOwner))) redirect("/");

  return (
    <SaamaanApp
      section="dashboard"
      email={user.email}
      displayName={user.displayName}
      initials={user.initials ?? null}
      role={user.role ?? "user"}
    />
  );
}
