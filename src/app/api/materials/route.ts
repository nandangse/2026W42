import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { requirePlanner, errJson } from "@/lib/auth";
import { assertJobEditable } from "@/lib/job-state";
import { supabaseServer } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * The three states a kitting line can be in.
 *
 * "QC Defective" is not a kind of received. It arrived, it was looked at, and
 * it cannot be used — which for the job is the same position as not having it,
 * and must read that way on the board rather than counting towards kitting.
 */
const MATERIAL_STATUSES = ["Yet to receive", "Received", "QC Defective"] as const;
type MatStatus = (typeof MATERIAL_STATUSES)[number];

const normStatus = (v: unknown): MatStatus => {
  const s = String(v ?? "");
  // 'Pending' is the pre-0030 spelling and still arrives from older clients
  if (s === "Pending") return "Yet to receive";
  return (MATERIAL_STATUSES as readonly string[]).includes(s) ? (s as MatStatus) : "Yet to receive";
};

const str = (v: unknown, max = 300) => String(v ?? "").slice(0, max);
const dateOrNull = (v: unknown) => (v ? String(v).slice(0, 10) : null);

/**
 * GET /api/materials?job_id= — the kitting lines for one job, with comments.
 *
 * The board already carries the lines themselves; this is the read behind the
 * lightbox, where the comments and the linked task matter.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    // ?pending_counts=1 — how many lines are NOT received, per job, for the
    // On Floor chips. Counts carry no commercial detail, so anyone who can
    // read the board may read them.
    if (url.searchParams.get("pending_counts") !== null) {
      const { requireReader } = await import("@/lib/auth");
      await requireReader();
      const { data, error } = await adminClient()
        .from("materials").select("job_id, status").neq("status", "Received");
      if (error) {
        if (/materials|does not exist|schema cache/i.test(error.message))
          return NextResponse.json({ counts: {} });
        throw new Error(error.message);
      }
      const counts: Record<string, number> = {};
      for (const m of data || []) counts[String(m.job_id)] = (counts[String(m.job_id)] || 0) + 1;
      return NextResponse.json({ counts });
    }

    await requirePlanner();
    const jobId = url.searchParams.get("job_id");
    if (!jobId) return NextResponse.json({ error: "job_id required" }, { status: 400 });
    const admin = adminClient();

    const { data: mats, error } = await admin
      .from("materials")
      .select("*")
      .eq("job_id", jobId)
      .order("id");
    if (error) throw new Error(error.message);

    const ids = (mats || []).map((m) => m.id);
    const { data: comments } = ids.length
      ? await admin.from("material_comment").select("*").in("material_id", ids).order("at", { ascending: true })
      : { data: [] };

    // whether each promoted task is still open — the lightbox says so rather
    // than showing a link to something already closed
    const taskIds = (mats || []).map((m) => m.task_id).filter(Boolean);
    const { data: tasks } = taskIds.length
      ? await admin.from("manual_tasks").select("id, title, who, due, done").in("id", taskIds)
      : { data: [] };

    return NextResponse.json({
      materials: mats || [],
      comments: comments || [],
      tasks: tasks || [],
      statuses: MATERIAL_STATUSES,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/material_comment|column|does not exist|schema cache/i.test(msg))
      return NextResponse.json({ notInstalled: true, materials: [], comments: [], tasks: [], statuses: MATERIAL_STATUSES });
    return errJson(e);
  }
}

// POST /api/materials — planner/admin. The kitting checklist for a job.
export async function POST(req: Request) {
  try {
    const user = await requirePlanner();
    const supabase = supabaseServer();
    const admin = adminClient();
    const body = await readBody(req, {});

    // add/seed carry job_id; everything else identifies a row instead, so
    // resolve the job from the material itself — otherwise the delivered-job
    // lock would be sidestepped by editing its lines one at a time.
    let guardJob: string | null = body.job_id ?? null;
    let row: { id: string; job_id: string; item: string; task_id: string | null; due: string | null; who: string | null } | null = null;
    if (!guardJob && body.id) {
      const { data: mat } = await supabase
        .from("materials")
        .select("id, job_id, item, task_id, due, who")
        .eq("id", body.id)
        .maybeSingle();
      row = mat ?? null;
      guardJob = mat?.job_id ?? null;
    }
    await assertJobEditable(supabase, guardJob);

    const who = user.initials || user.displayName || user.email.split("@")[0];

    if (body.action === "add") {
      if (!body.job_id || !body.item)
        return NextResponse.json({ error: "job_id and item required" }, { status: 400 });
      const { data, error } = await supabase
        .from("materials")
        .insert({
          job_id: body.job_id,
          item: str(body.item, 200),
          qty: str(body.qty || "", 60),
          status: normStatus(body.status),
          due: dateOrNull(body.due),
          custom: !!body.custom,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, id: data.id });
    }

    if (body.action === "seed") {
      if (!body.job_id || !Array.isArray(body.items) || !body.items.length)
        return NextResponse.json({ error: "job_id and items required" }, { status: 400 });
      const { count } = await supabase
        .from("materials")
        .select("id", { count: "exact", head: true })
        .eq("job_id", body.job_id);
      if (count) return NextResponse.json({ ok: true, seeded: 0 });
      const rows = body.items.slice(0, 100).map((m: { item?: unknown; qty?: unknown; status?: unknown }) => ({
        job_id: body.job_id,
        item: str(m.item, 200),
        qty: String(m.qty ?? "as BOM"),
        status: normStatus(m.status),
        custom: false,
      }));
      const { error } = await supabase.from("materials").insert(rows);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, seeded: rows.length });
    }

    /** Item, qty, receivable date, owner, running note — the lightbox's Save. */
    if (body.action === "update") {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if ("item" in body) patch.item = str(body.item, 200);
      if ("qty" in body) patch.qty = str(body.qty, 60);
      if ("due" in body) patch.due = dateOrNull(body.due);
      if ("who" in body) patch.who = str(body.who, 60) || null;
      if ("note" in body) patch.note = str(body.note, 2000) || null;
      /**
       * THE STATUS DROPDOWN POSTS THIS ACTION, and until today this action
       * quietly dropped it (Dr Raghu, 7 Sep 2026: "the recieved should change
       * status"). It was not that the status failed to follow the receipt —
       * it was that changing the status itself did nothing at all.
       *
       * The receipt date is not typed: "when the status is changed to
       * recieved its the date the task is closed." So the clock is read here,
       * and cleared again if the line moves back to being short.
       */
      let becameReceived = false;
      if ("status" in body) {
        const st = normStatus(body.status);
        patch.status = st;
        patch.received_at = st === "Received" ? new Date().toISOString() : null;
        becameReceived = true;
      }
      let { error } = await admin.from("materials").update(patch).eq("id", body.id);
      if (error && /received_at|column|schema cache/i.test(error.message)) {
        // migration 0152 not run yet — the status must still land
        delete patch.received_at;
        ({ error } = await admin.from("materials").update(patch).eq("id", body.id));
      }
      if (error) throw new Error(error.message);

      // Received closes the linked task; anything else re-opens it — QC
      // Defective included, because the item is on site and useless.
      if (becameReceived && row?.task_id)
        await admin.from("manual_tasks").update({ done: normStatus(body.status) === "Received" }).eq("id", row.task_id);

      // a promoted line's task follows its date and owner, or the link is a lie
      if (row?.task_id && ("due" in body || "who" in body || "item" in body)) {
        const tp: Record<string, unknown> = {};
        if ("due" in body) tp.due = dateOrNull(body.due);
        if ("who" in body) tp.who = str(body.who, 60) || null;
        if ("item" in body) tp.title = `Material: ${str(body.item, 160)}`;
        if (Object.keys(tp).length) await admin.from("manual_tasks").update(tp).eq("id", row.task_id);
      }
      return NextResponse.json({ ok: true });
    }

    if (body.action === "status") {
      const status = normStatus(body.status);
      const { error } = await admin
        .from("materials")
        .update({ status, updated_at: new Date().toISOString(), received_at: status === "Received" ? new Date().toISOString() : null })
        .eq("id", body.id);
      if (error && /received_at|column|schema cache/i.test(error.message)) {
        const retry = await admin.from("materials").update({ status, updated_at: new Date().toISOString() }).eq("id", body.id);
        if (retry.error) throw new Error(retry.error.message);
      } else if (error) throw new Error(error.message);

      /**
       * The mirror, half one.
       *
       * Received closes the linked task; anything else re-opens it. QC
       * Defective deliberately RE-OPENS: the item is on site and useless, so
       * the chasing is not finished. Leaving the task closed there is exactly
       * the drift that made two records worth avoiding in the first place.
       */
      if (row?.task_id)
        await admin.from("manual_tasks").update({ done: status === "Received" }).eq("id", row.task_id);
      return NextResponse.json({ ok: true, status });
    }

    /**
     * Promote a kitting line to a task.
     *
     * Not a copy — a link. The material keeps being the record; the task is
     * how it reaches somebody's list, carries an escalation, and turns up in
     * Tasking under the Material category. Pressing it twice returns the task
     * that already exists rather than making a second one.
     */
    if (body.action === "task") {
      if (!row) return NextResponse.json({ error: "no such material" }, { status: 404 });
      if (row.task_id) return NextResponse.json({ ok: true, id: row.task_id, existing: true });

      const due = dateOrNull(body.due) ?? row.due;
      const assignee = str(body.who, 60) || row.who || "";
      const { data, error } = await admin
        .from("manual_tasks")
        .insert({
          job_id: row.job_id,
          title: `Material: ${row.item}`.slice(0, 200),
          detail: str(body.detail, 2000) || `Kitting line on job ${row.job_id}. Receivable ${due || "date not set"}.`,
          who: assignee || null,
          due,
          cat: "Material",
          esc: str(body.esc, 40) || "None",
          done: false,
          created_by: who,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);

      await admin
        .from("materials")
        .update({ task_id: data.id, due, who: assignee || null, updated_at: new Date().toISOString() })
        .eq("id", row.id);
      return NextResponse.json({ ok: true, id: data.id });
    }

    if (body.action === "comment") {
      const text = str(body.body, 4000).trim();
      if (!text) return NextResponse.json({ error: "nothing to say" }, { status: 400 });
      const { error } = await admin.from("material_comment").insert({ material_id: body.id, by: who, body: text });
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "delete") {
      // the promoted task is left alone: somebody may still be chasing it, and
      // silently closing another person's task is not this button's business
      const { error } = await supabase.from("materials").delete().eq("id", body.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return errJson(e);
  }
}
