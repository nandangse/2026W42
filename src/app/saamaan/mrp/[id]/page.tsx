import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { resolveSaamaanAccess } from "@/lib/saamaan";
import SaamaanApp from "@/components/saamaan/SaamaanApp";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nandan Saamaan Genie" };

/**
 * genie.nandan.co.in/saamaan/mrp/<run> — one MRP run on its own page
 * (Dr Raghu, 3 Sep 2026: "keep this in MRP as a page where all MRP will be
 * listed; clicking on that will go to a fresh page").
 */
export default async function MrpRunPage({ params }: { params: { id: string } }) {
  const user = await currentUser();
  if (!user || user.disabled) redirect("/login");
  if (!(await resolveSaamaanAccess(adminClient(), user.email, user.isOwner))) redirect("/");
  return (
    <SaamaanApp
      section="mrp"
      mrpId={params.id}
      email={user.email}
      displayName={user.displayName}
      initials={user.initials ?? null}
      role={user.role ?? "user"}
      isOwner={user.isOwner}
    />
  );
}
