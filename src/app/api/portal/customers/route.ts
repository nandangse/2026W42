import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { errJson, HttpError } from "@/lib/auth";
import { requirePortalStaff } from "@/lib/portal/auth";
import { loadJobs, norm, type Scope } from "@/lib/portal/data";

export const dynamic = "force-dynamic";

/**
 * THE CUSTOMER PORTAL, FOR NANDAN'S OWN PEOPLE (Dr Raghu, 15 Oct 2026: "keep
 * Customer portal — that's where the customers are seen. In that we should
 * have the Jobmaster").
 *
 *   GET                 every customer Genie knows from the jobmaster, with its
 *                       open and delivered counts and whether it has a portal door
 *   GET ?name=<cust>    that customer's Jobmaster — open and delivered jobs, the
 *                       portal's own shape, the sidecar included
 */
const S = (v: unknown) => String(v ?? "").trim();

export async function GET(req: Request) {
  try {
    const u = await requirePortalStaff();
    const admin = adminClient();
    const name = S(new URL(req.url).searchParams.get("name"));
    const { data: orgs } = await admin.from("portal_org").select("slug,name,kind,match_names,intro,logo_path,active").eq("kind", "customer");
    const orgOf = (cust: string) => (orgs || []).find((o) => ((o.match_names as string[] | null) || []).map(norm).includes(norm(cust))) || null;

    if (name) {
      const org = orgOf(name);
      /* a customer without a door still has a jobmaster — scope it on its own name */
      const scope: Scope = { kind: "org", org: org ? { slug: S(org.slug), name: S(org.name), kind: "customer", match_names: (org.match_names as string[]) || [], intro: S(org.intro), logo_path: org.logo_path ? S(org.logo_path) : null, active: org.active !== false } : { slug: "", name, kind: "customer", match_names: [name], intro: "", logo_path: null, active: false }, locations: [], commercials: !!(u as { sees_commercials?: boolean }).sees_commercials || true, staff: true };
      const [open, delivered] = await Promise.all([loadJobs(scope, "open"), loadJobs(scope, "delivered")]);
      return NextResponse.json({ name, org: org ? { slug: org.slug, name: org.name, active: org.active !== false } : null, open, delivered });
    }

    const [{ data: jobs, error }, { data: users }] = await Promise.all([
      admin.from("jobs").select("cust, delivered, active, val").limit(20000),
      admin.from("portal_user").select("org_slug, active, last_login_at").eq("active", true),
    ]);
    if (error) throw new HttpError(500, error.message);
    const by = new Map<string, { name: string; open: number; delivered: number; open_value: number }>();
    for (const j of jobs || []) {
      const c = S(j.cust); if (!c) continue;
      const x = by.get(norm(c)) || { name: c, open: 0, delivered: 0, open_value: 0 };
      if (j.delivered) x.delivered++; else if (j.active) { x.open++; x.open_value += Number(j.val) || 0; }
      by.set(norm(c), x);
    }
    const customers = [...by.values()].map((c) => {
      const org = orgOf(c.name); const people = org ? (users || []).filter((p) => p.org_slug === org.slug) : [];
      return { ...c, slug: org ? S(org.slug) : null, org_name: org ? S(org.name) : null, door: org ? (org.active !== false ? (people.length ? "live" : "no people") : "inactive") : "none", people: people.length, last_login: people.map((p) => S(p.last_login_at)).filter(Boolean).sort().pop() || null };
    }).sort((a, b) => b.open - a.open || b.delivered - a.delivered || a.name.localeCompare(b.name));
    return NextResponse.json({ customers });
  } catch (e) { return errJson(e); }
}
