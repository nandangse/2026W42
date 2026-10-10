import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { resolveHrmsAccess } from "@/lib/hrms";
import { mayUseCrm } from "@/crm/auth";
import { resolveAccountsAccess } from "@/lib/accounts";
import { resolveVishwakarmaAccess } from "@/lib/vishwakarma";
import { resolveSevaAccess } from "@/lib/seva";
import { resolveImsAccess } from "@/ims/auth";
import { resolveSaamaanAccess } from "@/lib/saamaan";
import { mayUseMarketing } from "@/lib/marketing";
import { currentPortalUser, isStaff } from "@/lib/portal/auth";
import { mayUsePlanning } from "@/lib/planning-door";
import { mayUseLeadersCouncil } from "@/lib/lc/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/modules — which of Genie's doors open for this person.
 *
 * One answer for every account menu: Planning (main) is the planning_access
 * tick since 10 Oct 2026 — no longer everyone's; the rest are the Admin
 * page's ticks — crm_access, hrms_access, accounts_access,
 * vishwakarma_access, seva_access, ims_access, material_access (Saamaan),
 * each a grant held against the email, the owner implicit in all of them;
 * the Leaders Council is the LC mark on Admin → Groups. The menus draw what
 * this returns and nothing else, so the list a person sees IS the list they
 * can open.
 */
export async function GET() {
  const u = await currentUser();
  if (!u || u.disabled)
    return NextResponse.json({ main: false, crm: false, marketing: false, hrms: false, accounts: false, vishwakarma: false, seva: false, ims: false, saamaan: false, portal: false, lc: false });

  const admin = adminClient();
  const [main, crm, hrms, accounts, vishwakarma, seva, ims, saamaan, marketing, portalUser] = await Promise.all([
    mayUsePlanning(admin, u.email, u.isOwner),
    mayUseCrm(),
    resolveHrmsAccess(admin, u.email, u.isOwner),
    resolveAccountsAccess(admin, u.email, u.isOwner),
    resolveVishwakarmaAccess(admin, u.email, u.isOwner),
    resolveSevaAccess(admin, u.email, u.isOwner),
    resolveImsAccess(admin, u.email, u.isOwner),
    resolveSaamaanAccess(admin, u.email, u.isOwner),
    mayUseMarketing(u.email, u.isOwner),
    /* the Portal: the owner, a Genie admin, or a Genie login named as portal staff (6.0) */
    currentPortalUser(),
  ]);
  const portal = !!portalUser && isStaff(portalUser);
  return NextResponse.json({ main, crm, marketing, hrms, accounts, vishwakarma, seva, ims, saamaan, portal, lc: mayUseLeadersCouncil(u) });
}
