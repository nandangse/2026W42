import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { mayUseCrm } from "@/crm/auth";
import CrmApp from "@/components/crm/CrmApp";

export const dynamic = "force-dynamic";

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

  return <CrmApp email={user.email} displayName={user.displayName} />;
}
