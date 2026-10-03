import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { errJson } from "@/lib/auth";
import { currentPortalUser, isPortalAdmin, isStaff, notInstalled, seesAll, seesCommercials } from "@/lib/portal/auth";
import { resolveScope } from "@/lib/portal/data";

export const dynamic = "force-dynamic";

/**
 * GET /api/portal/boot?slug= — everything the shell needs in one read: who I
 * am, which door I am standing at (the organisation, or "all" for Nandan's
 * own people), the doors a staff login may switch between, the locations
 * master, and which tabs this login gets.
 */
export async function GET(req: Request) {
  try {
    const u = await currentPortalUser();
    if (!u) return NextResponse.json({ error: "Sign in to the portal first." }, { status: 401 });
    const admin = adminClient();
    const slugParam = new URL(req.url).searchParams.get("slug");
    const slug = slugParam && slugParam !== "all" ? slugParam : isStaff(u) ? null : u.org_slug;

    let scope;
    try { scope = await resolveScope(u, slug); }
    catch (e) {
      if (notInstalled(e)) return NextResponse.json({ error: "The portal is not installed yet — run migration 0198.", notInstalled: true }, { status: 503 });
      throw e;
    }

    const [orgs, locs] = await Promise.all([
      isStaff(u) ? admin.from("portal_org").select("slug,name,kind,active").order("name") : Promise.resolve({ data: [] as unknown[], error: null }),
      admin.from("portal_location").select("name,sort_order,active").order("sort_order").order("name"),
    ]);
    if (orgs.error && notInstalled(orgs.error)) return NextResponse.json({ error: "The portal is not installed yet — run migration 0198.", notInstalled: true }, { status: 503 });

    const kind = scope.org?.kind ?? "customer";
    const tabs: string[] = kind === "supplier"
      ? ["home", "queries", "issues", "faq", "newsletter", "advisory"]
      : ["home", "queries", "previous", "issues", "faq", "newsletter", "advisory"];
    if (scope.commercials && kind !== "supplier") tabs.splice(2, 0, "commercials");
    if (isPortalAdmin(u)) tabs.push("settings");

    return NextResponse.json({
      me: { id: u.id, email: u.email, name: u.name, role: u.role, org_slug: u.org_slug, locations: u.locations, via: u.via, must_change: u.must_change,
            staff: isStaff(u), admin: isPortalAdmin(u), all: seesAll(u), commercials: seesCommercials(u) },
      scope: { kind: scope.kind, slug: scope.org?.slug ?? "all", locations: scope.locations },
      org: scope.org,
      orgs: orgs.data || [],
      locations: ((locs.data || []) as { name: string; active: boolean }[]).filter((l) => l.active),
      tabs,
      today: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
    });
  } catch (e) { return errJson(e); }
}
