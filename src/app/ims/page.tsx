import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { mayUseIms } from "@/ims/auth";
import ImsApp from "@/components/ims/ImsApp";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nandan IMS Genie" };

/**
 * genie.nandan.co.in/ims — the Integrated Management System's door (Dr Raghu,
 * 2 Sep 2026). Same login as Genie; the grant is the IMS tick on
 * Admin → module access (ims_access, keyed by email, owner implicit).
 */
export default async function ImsPage() {
  const user = await currentUser();
  if (!user || user.disabled) redirect("/login");
  if (!(await mayUseIms())) redirect("/");

  return (
    <ImsApp
      section="dashboard"
      email={user.email}
      displayName={user.displayName}
      initials={user.initials ?? null}
      role={user.role ?? "user"}
    />
  );
}
