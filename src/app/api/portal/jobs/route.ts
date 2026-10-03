import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { errJson, HttpError } from "@/lib/auth";
import { portalAudit, requirePortalStaff, requirePortalUser, seesAll } from "@/lib/portal/auth";
import { loadJobs, resolveScope } from "@/lib/portal/data";

export const dynamic = "force-dynamic";

/** GET /api/portal/jobs?slug=&which=open|delivered — the rows this login may see. */
export async function GET(req: Request) {
  try {
    const u = await requirePortalUser();
    const url = new URL(req.url);
    const scope = await resolveScope(u, url.searchParams.get("slug"));
    const which = url.searchParams.get("which") === "delivered" ? "delivered" : "open";
    return NextResponse.json({ jobs: await loadJobs(scope, which) });
  } catch (e) { return errJson(e); }
}

const SIDE = ["po_no", "vehicle_no", "vehicle_type", "invoice_no", "location", "remarks"] as const;

/** POST { action: "sidecar", job_id, fields } — what the ERP cannot know, typed beside the job by Nandan's people. */
export async function POST(req: Request) {
  try {
    const u = await requirePortalStaff();
    if (!seesAll(u)) throw new HttpError(403, "The admin or the national manager writes beside a job.");
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (String(body.action) !== "sidecar") throw new HttpError(400, "Unknown action.");
    const job_id = String(body.job_id || "").trim();
    if (!job_id) throw new HttpError(400, "Which job?");
    const f = (body.fields || {}) as Record<string, unknown>;
    const row: Record<string, unknown> = { job_id, by: u.email, at: new Date().toISOString() };
    for (const k of SIDE) if (k in f) row[k] = String(f[k] ?? "").trim().slice(0, 500) || null;
    const { error } = await adminClient().from("portal_job").upsert(row, { onConflict: "job_id" });
    if (error) throw error;
    await portalAudit(u, "job_sidecar", { job_id, keys: Object.keys(row) });
    return NextResponse.json({ ok: true });
  } catch (e) { return errJson(e); }
}
