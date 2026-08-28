import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { resolveAccountsAccess } from "@/lib/accounts";
import Accounts from "@/components/Accounts";

export const dynamic = "force-dynamic";

/** Its own tab name, like the CRM and HRMS carry theirs. */
export const metadata: Metadata = { title: "Nandan Kuber Genie" };

/**
 * genie.nandan.co.in/kuber — the fourth module's door. KUBER is the accounts
 * module's name (Dr Raghu, 28 Aug 2026) — the keeper of wealth keeps the books.
 *
 * Same login as Genie; the grant is the Kuber tick on the Admin page
 * (accounts_access, keyed by email, owner implicit). Anybody not admitted is
 * sent to the front page, the way the CRM door answers.
 */
export default async function AccountsPage() {
  const user = await currentUser();
  if (!user || user.disabled) redirect("/login");
  if (!(await resolveAccountsAccess(adminClient(), user.email, user.isOwner))) redirect("/");

  return (
    <Accounts
      email={user.email}
      displayName={user.displayName}
      initials={user.initials ?? null}
      role={user.role ?? "user"}
    />
  );
}
