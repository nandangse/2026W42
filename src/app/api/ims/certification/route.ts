import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { errJson, HttpError } from "@/lib/auth";
import { isHead, requireIms, requireImsAdmin } from "@/ims/auth";
import { imsDb, notInstalled } from "@/ims/db";
import { log, need, ok, pick } from "@/ims/api";

export const dynamic = "force-dynamic";

/**
 * The Certification Journey — what we hold, what is underway, what we are
 * aiming at. Scheme-agnostic: ZED, a customer audit and a future defence
 * scheme are the same shape as ISO 9001, so none of them needs code.
 *
 * A 'target' carries an implementation path, and a path step can spawn a task
 * — which is how an aim on a wall becomes work somebody owns by a date.
 */
const CERT_FIELDS = ["scheme", "body", "status", "target_date", "achieved_date", "owner_id", "certificate_id", "notes"];
const STEP_FIELDS = ["seq", "title", "description", "owner_id", "due_date", "status"];

export async function GET() {
  try {
    await requireIms();
    const db = imsDb();
    const { data, error } = await db
      .from("ims_certification")
      .select("*, steps:ims_certification_path_step(*)")
      .order("sort_order");
    if (error) {
      if (notInstalled(error.message)) return NextResponse.json({ installed: false, rows: [] });
      throw new Error(error.message);
    }
    const rows = (data ?? []).map((c: Record<string, unknown>) => ({
      ...c,
      steps: ((c.steps as Record<string, unknown>[]) ?? []).sort(
        (a, b) => Number(a.seq ?? 0) - Number(b.seq ?? 0),
      ),
    }));
    return NextResponse.json({ installed: true, rows });
  } catch (e) {
    return errJson(e);
  }
}

/**
 * POST { action, id?, row? }
 *   add | update | delete            — the certification itself
 *   step_add | step_update | step_delete
 *   spawn_task                       — turn a path step into a core_task
 */
export async function POST(req: Request) {
  try {
    const me = await requireIms();
    const body = await readBody(req, {});
    const action = String(body.action || "");
    const db = imsDb();

    if (action === "delete" || action === "step_delete") {
      await requireImsAdmin();
      need(body.id, "id required");
      const table = action === "delete" ? "ims_certification" : "ims_certification_path_step";
      const { error } = await db.from(table).delete().eq("id", body.id);
      if (error) throw new Error(error.message);
      await log(me, table, String(body.id), "delete");
      return ok();
    }

    if (!isHead(me)) throw new HttpError(403, "Only the MR or a department head may change the journey.");

    if (action === "add") {
      const row = pick(body.row ?? {}, CERT_FIELDS);
      need(String(row.scheme || "").trim(), "A certification needs a scheme name.");
      const { data, error } = await db
        .from("ims_certification")
        .insert({ ...row, created_by: me.email })
        .select("id")
        .maybeSingle();
      if (error) throw new Error(error.message);
      await log(me, "ims_certification", data?.id ?? null, "add", { scheme: row.scheme });
      return ok({ id: data?.id });
    }

    if (action === "update") {
      need(body.id, "id required");
      const row = pick(body.row ?? {}, CERT_FIELDS);
      const { error } = await db.from("ims_certification").update(row).eq("id", body.id);
      if (error) throw new Error(error.message);
      await log(me, "ims_certification", String(body.id), "update", row);
      return ok();
    }

    if (action === "step_add") {
      need(body.certification_id, "certification_id required");
      const row = pick(body.row ?? {}, STEP_FIELDS);
      need(String(row.title || "").trim(), "A step needs a title.");
      const { data, error } = await db
        .from("ims_certification_path_step")
        .insert({ ...row, certification_id: body.certification_id })
        .select("id")
        .maybeSingle();
      if (error) throw new Error(error.message);
      await log(me, "ims_certification_path_step", data?.id ?? null, "add", { title: row.title });
      return ok({ id: data?.id });
    }

    if (action === "step_update") {
      need(body.id, "id required");
      const row = pick(body.row ?? {}, STEP_FIELDS);
      const { error } = await db.from("ims_certification_path_step").update(row).eq("id", body.id);
      if (error) throw new Error(error.message);
      await log(me, "ims_certification_path_step", String(body.id), "update", row);
      return ok();
    }

    /**
     * spawn_task — the step becomes a row in core_task, and the step keeps the
     * task's id. Idempotent: a step that already has a task returns the same
     * one rather than raising a second.
     */
    if (action === "spawn_task") {
      need(body.id, "id required");
      const { data: step, error: se } = await db
        .from("ims_certification_path_step")
        .select("id, title, description, owner_id, due_date, task_id, certification_id")
        .eq("id", body.id)
        .maybeSingle();
      if (se) throw new Error(se.message);
      if (!step) throw new HttpError(404, "No such step.");
      if (step.task_id) return ok({ taskId: step.task_id, already: true });

      const { data: cert } = await db
        .from("ims_certification").select("scheme").eq("id", step.certification_id).maybeSingle();

      const { data: task, error: te } = await db
        .from("core_task")
        .insert({
          module: "IMS",
          title: `${cert?.scheme ? cert.scheme + " — " : ""}${step.title}`,
          description: step.description ?? "",
          source_type: "cert_path",
          source_id: step.id,
          source_key: "step",
          owner_id: step.owner_id ?? me.profileId,
          due_date: step.due_date,
          created_by: me.email,
        })
        .select("id")
        .maybeSingle();
      if (te) throw new Error(te.message);

      await db.from("ims_certification_path_step").update({ task_id: task?.id }).eq("id", step.id);
      await log(me, "ims_certification_path_step", String(step.id), "spawn_task", { taskId: task?.id });
      return ok({ taskId: task?.id });
    }

    throw new HttpError(400, "Unknown action.");
  } catch (e) {
    return errJson(e);
  }
}
