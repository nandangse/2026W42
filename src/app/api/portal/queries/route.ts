import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { errJson, HttpError } from "@/lib/auth";
import { isStaff, portalAudit, requirePortalUser } from "@/lib/portal/auth";
import { resolveScope } from "@/lib/portal/data";

export const dynamic = "force-dynamic";

/**
 * THE QUERY SOLVER (Dr Raghu, 3 Oct 2026: "Query solver, where all the
 * queries and everything regarding this will be showcased").
 *
 * GET  /api/portal/queries?slug=            → the organisation's threads (all organisations for Nandan's own people at "all")
 * POST { action: "ask",    slug, job_id?, subject, body }
 *      { action: "reply",  id, body, internal? }     internal = a note between Nandan's people, never shown to the customer
 *      { action: "status", id, status }              open | answered | closed — Nandan's people set it
 */
const side = (staff: boolean) => (staff ? "us" : "them");

export async function GET(req: Request) {
  try {
    const u = await requirePortalUser();
    const scope = await resolveScope(u, new URL(req.url).searchParams.get("slug"));
    const admin = adminClient();
    let q = admin.from("portal_query").select("id,org_slug,job_id,subject,body,status,by_name,by_side,at,updated_at").order("updated_at", { ascending: false }).limit(500);
    if (scope.org) q = q.eq("org_slug", scope.org.slug);
    const { data: qs, error } = await q;
    if (error) throw error;
    const ids = (qs || []).map((x) => x.id);
    let replies: Record<string, unknown>[] = [];
    if (ids.length) {
      let r = admin.from("portal_query_reply").select("id,query_id,body,by_name,by_side,internal,at").in("query_id", ids).order("at");
      if (!isStaff(u)) r = r.eq("internal", false);
      const { data } = await r;
      replies = (data || []) as Record<string, unknown>[];
    }
    return NextResponse.json({ queries: qs || [], replies });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const u = await requirePortalUser();
    const admin = adminClient();
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(b.action || "");
    const now = new Date().toISOString();

    if (action === "ask") {
      const scope = await resolveScope(u, String(b.slug || "") || null);
      if (!scope.org) throw new HttpError(400, "Open an organisation's page to raise a query for it.");
      const subject = String(b.subject || "").trim().slice(0, 200);
      const body = String(b.body || "").trim().slice(0, 5000);
      if (subject.length < 3) throw new HttpError(400, "A subject, please.");
      const { data, error } = await admin.from("portal_query").insert({
        org_slug: scope.org.slug, job_id: String(b.job_id || "").trim() || null, subject, body,
        by_user: /^[0-9a-f-]{36}$/.test(u.id) ? u.id : null, by_name: u.name, by_side: side(isStaff(u)), at: now, updated_at: now,
      }).select("id").single();
      if (error) throw error;
      await portalAudit(u, "query_asked", { id: data.id, org: scope.org.slug });
      return NextResponse.json({ ok: true, id: data.id });
    }

    const id = String(b.id || "");
    if (!id) throw new HttpError(400, "Which query?");
    const { data: q, error: qe } = await admin.from("portal_query").select("id,org_slug,status").eq("id", id).maybeSingle();
    if (qe) throw qe;
    if (!q) throw new HttpError(404, "No such query.");
    /* the customer may only touch their own organisation's threads */
    await resolveScope(u, q.org_slug);

    if (action === "reply") {
      const body = String(b.body || "").trim().slice(0, 5000);
      if (!body) throw new HttpError(400, "An empty reply says nothing.");
      const internal = isStaff(u) && !!b.internal;
      const { error } = await admin.from("portal_query_reply").insert({
        query_id: id, body, by_user: /^[0-9a-f-]{36}$/.test(u.id) ? u.id : null, by_name: u.name, by_side: side(isStaff(u)), internal, at: now,
      });
      if (error) throw error;
      const patch: Record<string, unknown> = { updated_at: now };
      /* Nandan answering an open query marks it answered; the customer writing back reopens it */
      if (isStaff(u) && !internal && q.status === "open") patch.status = "answered";
      if (!isStaff(u) && q.status === "answered") patch.status = "open";
      await admin.from("portal_query").update(patch).eq("id", id);
      await portalAudit(u, "query_replied", { id, internal });
      return NextResponse.json({ ok: true });
    }

    if (action === "status") {
      const status = String(b.status || "");
      if (!["open", "answered", "closed"].includes(status)) throw new HttpError(400, "open, answered or closed.");
      if (!isStaff(u) && status !== "closed") throw new HttpError(403, "You may close your own query; Nandan sets the rest.");
      const { error } = await admin.from("portal_query").update({ status, updated_at: now }).eq("id", id);
      if (error) throw error;
      await portalAudit(u, "query_status", { id, status });
      return NextResponse.json({ ok: true });
    }

    throw new HttpError(400, "Unknown action.");
  } catch (e) { return errJson(e); }
}
