import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { resolveHrmsAccess } from "@/lib/hrms";
import { mayUseCrm } from "@/crm/auth";
import { resolveAccountsAccess } from "@/lib/accounts";
import { resolveVishwakarmaAccess } from "@/lib/vishwakarma";
import { resolveSevaAccess } from "@/lib/seva";

export const dynamic = "force-dynamic";

/**
 * GET /api/modules — which of Genie's doors open for this person.
 *
 * One answer for every account menu: Main Genie is everyone's (it is where the
 * login lands), the rest are the Admin page's ticks — crm_access, hrms_access,
 * accounts_access, vishwakarma_access, seva_access, each a grant held against
 * the email, the owner implicit in all of them. The menus draw what this
 * returns and nothing else, so the list a person sees IS the list they can
 * open.
 */
export async function GET() {
  const u = await currentUser();
  if (!u || u.disabled)
    return NextResponse.json({ main: false, crm: false, hrms: false, accounts: false, vishwakarma: false, seva: false });

  const admin = adminClient();
  const [crm, hrms, accounts, vishwakarma, seva] = await Promise.all([
    mayUseCrm(),
    resolveHrmsAccess(admin, u.email, u.isOwner),
    resolveAccountsAccess(admin, u.email, u.isOwner),
    resolveVishwakarmaAccess(admin, u.email, u.isOwner),
    resolveSevaAccess(admin, u.email, u.isOwner),
  ]);
  return NextResponse.json({ main: true, crm, hrms, accounts, vishwakarma, seva });
}
