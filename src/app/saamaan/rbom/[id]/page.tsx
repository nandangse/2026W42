import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { resolveSaamaanAccess } from "@/lib/saamaan";
import RbomPage from "@/components/saamaan/RbomPage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nandan Saamaan Genie" };

/**
 * genie.nandan.co.in/saamaan/rbom/<no> — one Real BOM, with an address
 * (Dr Raghu, 8 Sep 2026: "RBOM needs a link of its own ... this link will
 * make it useful").
 *
 * An RBOM lived only inside a lightbox: you could read it, but you could not
 * send anybody to it. A thing that cannot be linked to cannot be discussed,
 * and a Real BOM is precisely the thing a project argues about.
 */
export default async function RbomStandalone({ params }: { params: { id: string } }) {
  const user = await currentUser();
  if (!user || user.disabled) redirect("/login");
  if (!(await resolveSaamaanAccess(adminClient(), user.email, user.isOwner))) redirect("/");

  return (
    <RbomPage
      id={decodeURIComponent(params.id)}
      email={user.email}
      displayName={user.displayName}
      initials={user.initials ?? null}
      role={user.role ?? "user"}
      isOwner={user.isOwner}
    />
  );
}
