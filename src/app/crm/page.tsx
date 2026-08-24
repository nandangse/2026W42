import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { mayUseCrm } from "@/crm/auth";
import { UPDATES } from "@/lib/changelog";
import CrmApp from "@/components/crm/CrmApp";

export const dynamic = "force-dynamic";

/**
 * The CRM is its own app at its own URL, so it carries its own name in the tab
 * rather than the planning suite's.
 */
export const metadata: Metadata = { title: "Nandan CRM Genie" };

/**
 * genie.nandan.co.in/crm
 *
 * Same login as Genie -- the session cookie is readable here because it is the
 * same origin. Open to Dr Raghu alone for now; the check is in src/crm/auth.ts
 * so there is one place to widen it when the sales team comes in.
 */
export default async function CrmPage() {
  const user = await currentUser();
  if (!user || user.disabled) redirect("/login");
  if (!(await mayUseCrm())) redirect("/");

  // One Genie version number across every module -- the badge reads the same
  // changelog the main header does, so the two can never disagree.
  return <CrmApp email={user.email} displayName={user.displayName} version={UPDATES[0].v} />;
}
