import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentPortalUser } from "@/lib/portal/auth";
import PortalApp from "@/components/portal/PortalApp";
import PortalLogin from "@/components/portal/PortalLogin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nandan GSE Portal", robots: { index: false, follow: false } };

/**
 * genie.nandan.co.in/portal — the customers' and suppliers' own door
 * (Dr Raghu, 3 Oct 2026). /portal/veda is Veda's page, /portal/taj is
 * Taj's; /portal/login is the door; /portal/all is where Nandan's own
 * people stand to see everything. Its own login realm: a portal cookie, or
 * a Genie login that is the owner, an admin, or named in portal_user.
 */
export default async function PortalPage({ params, searchParams }: { params: { path?: string[] }; searchParams: { invite?: string; next?: string } }) {
  const segs = params.path || [];
  const u = await currentPortalUser();
  if (segs[0] === "login") {
    if (u && !searchParams?.invite) redirect("/portal");
    return <PortalLogin invite={searchParams?.invite} next={searchParams?.next} />;
  }
  if (!u) redirect(`/portal/login${segs.length ? `?next=${encodeURIComponent("/portal/" + segs.join("/"))}` : ""}`);
  /* a customer or supplier always lands on their own page */
  const own = u.org_slug && !["admin", "national_manager", "location_manager", "location_technician"].includes(u.role) ? u.org_slug : null;
  const slug = own || segs[0] || "all";
  if (own && segs[0] && segs[0] !== own) redirect(`/portal/${own}`);
  return <PortalApp initialSlug={slug} initialTab={segs[1] || "home"} initialArg={segs[2] || null} />;
}
