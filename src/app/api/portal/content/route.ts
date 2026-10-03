import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { errJson, HttpError } from "@/lib/auth";
import { isPortalAdmin, portalAudit, requirePortalAdmin, requirePortalUser } from "@/lib/portal/auth";
import { resolveScope } from "@/lib/portal/data";

export const dynamic = "force-dynamic";

const KINDS = ["faq", "newsletter", "advisory"];

/**
 * FAQs, NEWSLETTERS, ADVISORIES — what Nandan puts up for its customers and
 * suppliers. A piece is for everyone, for one audience (customers or
 * suppliers), or for one organisation. Only published pieces are seen by
 * anyone but the admin.
 *
 * GET  /api/portal/content?kind=&slug=
 * POST { action: "save", id?, kind, title, body, org_slug?, audience?, published?, pinned?, published_on? }   admin
 *      { action: "delete", id }                                                                                admin
 */
export async function GET(req: Request) {
  try {
    const u = await requirePortalUser();
    const url = new URL(req.url);
    const kind = String(url.searchParams.get("kind") || "");
    if (!KINDS.includes(kind)) throw new HttpError(400, "faq, newsletter or advisory.");
    const scope = await resolveScope(u, url.searchParams.get("slug"));
    const admin = adminClient();
    let q = admin.from("portal_content").select("id,kind,title,body,org_slug,audience,published,pinned,published_on,by,at,updated_at").eq("kind", kind)
      .order("pinned", { ascending: false }).order("published_on", { ascending: false, nullsFirst: false }).order("at", { ascending: false });
    if (!isPortalAdmin(u)) q = q.eq("published", true);
    const { data, error } = await q;
    if (error) throw error;
    const orgKind = scope.org?.kind ?? null;
    const rows = (data || []).filter((r) => {
      if (isPortalAdmin(u) && !scope.org) return true;
      if (r.org_slug && r.org_slug !== scope.org?.slug) return false;
      if (r.audience !== "all" && orgKind && r.audience !== orgKind) return false;
      return true;
    });
    return NextResponse.json({ content: rows });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const u = await requirePortalAdmin();
    const admin = adminClient();
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(b.action || "");
    const now = new Date().toISOString();

    if (action === "save") {
      const kind = String(b.kind || "");
      if (!KINDS.includes(kind)) throw new HttpError(400, "faq, newsletter or advisory.");
      const title = String(b.title || "").trim().slice(0, 200);
      if (title.length < 3) throw new HttpError(400, "A title, please.");
      const audience = ["all", "customer", "supplier"].includes(String(b.audience)) ? String(b.audience) : "all";
      const row: Record<string, unknown> = {
        kind, title, body: String(b.body || "").slice(0, 50000), org_slug: String(b.org_slug || "").trim() || null, audience,
        published: !!b.published, pinned: !!b.pinned,
        published_on: /^\d{4}-\d{2}-\d{2}$/.test(String(b.published_on || "")) ? String(b.published_on) : (b.published ? now.slice(0, 10) : null),
        by: u.email, updated_at: now,
      };
      const id = String(b.id || "");
      const { data, error } = id
        ? await admin.from("portal_content").update(row).eq("id", id).select("id").single()
        : await admin.from("portal_content").insert({ ...row, at: now }).select("id").single();
      if (error) throw error;
      await portalAudit(u, "content_saved", { id: data.id, kind, title });
      return NextResponse.json({ ok: true, id: data.id });
    }

    if (action === "delete") {
      const id = String(b.id || "");
      if (!id) throw new HttpError(400, "Which piece?");
      const { error } = await admin.from("portal_content").delete().eq("id", id);
      if (error) throw error;
      await portalAudit(u, "content_deleted", { id });
      return NextResponse.json({ ok: true });
    }

    throw new HttpError(400, "Unknown action.");
  } catch (e) { return errJson(e); }
}
