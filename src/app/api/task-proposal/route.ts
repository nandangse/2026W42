import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { swallow } from "@/lib/swallow";
import { requireReader, requireTasker, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { notifyTaskAssignment } from "@/lib/notify";

export const dynamic = "force-dynamic";

/** GET ?job_id=… — proposals still waiting. Omit job_id for all of them. */
export async function GET(req: Request) {
  try {
    await requireReader();
    const admin = adminClient();
    const url = new URL(req.url);
    const jobId = url.searchParams.get("job_id");

    let q = admin
      .from("task_proposal")
      .select("id, job_id, title, detail, cat, due, status, at")
      .eq("status", "proposed")
      .order("at", { ascending: false });
    if (jobId) q = q.eq("job_id", jobId);

    const { data, error } = await q.limit(400);
    if (error) {
      if (/task_proposal|schema cache|does not exist/i.test(error.message))
        return NextResponse.json({ installed: false, proposals: [] });
      throw new Error(error.message);
    }
    return NextResponse.json({ installed: true, proposals: data || [] });
  } catch (e) {
    return errJson(e);
  }
}

/**
 * POST — { action: "accept" | "dismiss", id, reason?, who? }
 *
 * Accepting creates an ORDINARY task. Once it exists there is nothing to
 * distinguish it from one somebody typed, which is the point: a task that
 * behaves differently because of where it came from is a task people have to
 * think about before trusting.
 *
 * It lands on the PLANNING OWNER, who reassigns if it belongs elsewhere. Dr
 * Raghu's call, and the right one — the owner is the person who knows who
 * should have it, and a task assigned to nobody is a task nobody picks up.
 */
export async function POST(req: Request) {
  try {
    const user = await requireTasker();
    const admin = adminClient();
    const body = await readBody(req, {});
    const id = String(body.id || "");
    if (!id) throw new HttpError(400, "id required");

    const { data: p, error: pe } = await admin
      .from("task_proposal")
      .select("id, job_id, title, detail, cat, due, status")
      .eq("id", id)
      .maybeSingle();
    if (pe) {
      if (/task_proposal|schema cache|does not exist/i.test(pe.message))
        throw new HttpError(503, "Run migration 0044 first — proposals have nowhere to live yet.");
      throw new Error(pe.message);
    }
    if (!p) throw new HttpError(404, "That suggestion is no longer there.");
    if (p.status !== "proposed") throw new HttpError(409, "That one has already been dealt with.");

    if (body.action === "dismiss") {
      const { error } = await admin
        .from("task_proposal")
        .update({
          status: "dismissed",
          reason: String(body.reason || "").slice(0, 300),
          acted_by: user.email,
          acted_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw new Error(error.message);
      // Kept rather than deleted: the same suggestion turned down twice for the
      // same reason is a prompt worth changing, and only visible if it is kept.
      return NextResponse.json({ ok: true });
    }

    if (body.action !== "accept") throw new HttpError(400, "Unknown action");

    /**
     * Who it goes to: the job's Planning Owner, matched the way the boards
     * match one — the Jobmaster writes an email and accounts are found by
     * initials, name or erp_owner, so both sides drop anything after the @.
     */
    const norm = (v: unknown) => String(v ?? "").trim().toLowerCase().split("@")[0].trim();
    const { data: job } = await admin.from("jobs").select("own").eq("id", p.job_id).maybeSingle();
    let who = String(body.who || "").trim();
    if (!who) {
      const { data: people } = await admin
        .from("profiles")
        .select("initials, email, display_name, erp_owner")
        .eq("disabled", false);
      const key = norm(job?.own);
      const hit = (people || []).find(
        (x) => key && [x.erp_owner, x.email, x.initials, x.display_name].some((v) => norm(v) === key),
      );
      who = hit?.initials || "";
    }

    const { data: made, error } = await admin
      .from("manual_tasks")
      .insert({
        job_id: p.job_id,
        title: p.title,
        detail: p.detail,
        who: who || null,
        due: p.due,
        cat: p.cat || "Production",
        esc: "None",
        done: false,
        created_by: user.email,
        original_due: p.due,
        push_count: 0,
      })
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);

    await admin
      .from("task_proposal")
      .update({ status: "accepted", task_id: made?.id ?? null, acted_by: user.email, acted_at: new Date().toISOString() })
      .eq("id", id);

    // The owner finds out the same way they would for any other assignment.
    if (who && made?.id) {
      try {
        await notifyTaskAssignment(admin, {
          who,
          actorId: user.id,
          actorLabel: user.initials || user.email.split("@")[0],
          taskTitle: p.title,
          jobId: p.job_id,
          kind: "task_assigned",
          refKind: "manual",
          refId: String(made.id),
        });
      } catch (e) { swallow("task-proposal", e); /* the task exists; the bell is a courtesy */ }
    }

    return NextResponse.json({ ok: true, task_id: made?.id ?? null, who: who || null });
  } catch (e) {
    return errJson(e);
  }
}
