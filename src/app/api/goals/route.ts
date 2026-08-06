import { NextResponse } from "next/server";
import { requireUser, errJson, HttpError } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { buildGoalTree } from "@/lib/goal-tree";
import { resolveGoalAccess } from "@/lib/goal-access";
import { CHILD_OF, LEVEL_LABEL, type NodeType } from "@/lib/goals";
import { METRICS } from "@/lib/goal-metrics";
import { notify } from "@/lib/notify";

/** Bell for each newly added goal-node owner (never the actor themselves). */
async function notifyGoalOwners(
  actor: { id: string; label: string },
  nodeId: string,
  personIds: string[],
) {
  const admin = adminClient();
  const fresh = personIds.filter((p) => p && p !== actor.id);
  if (!fresh.length) return;
  let what = "a goal item";
  try {
    const { data } = await admin.from("goal_node").select("what, node_type").eq("id", nodeId).maybeSingle();
    if (data) what = `${LEVEL_LABEL[data.node_type as NodeType].toLowerCase()} "${data.what}"`;
  } catch { /* description is decoration */ }
  for (const pid of fresh) {
    await notify(admin, {
      person_id: pid,
      kind: "goal_assigned",
      title: `${actor.label} made you owner of a goal item`,
      body: what,
      ref_kind: "goal",
      ref_id: nodeId,
      created_by: actor.label,
    });
  }
}

export const dynamic = "force-dynamic";

// GET /api/goals — the whole tree for the period, plus masters.
// Tree visibility and own-work visibility are different checks: someone without
// a grant still reaches their own nodes through /api/today.
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const period = new URL(req.url).searchParams.get("period") || undefined;
    // Run the access check and the tree build CONCURRENTLY: RLS on the
    // user-scoped client is the real gate on the data, so the check only
    // decides between 403 and 200 — no reason to serialise two Mumbai round
    // trips before nine more. If access is denied the built tree is discarded.
    const [access, tree] = await Promise.all([
      resolveGoalAccess(adminClient(), user.id, user.isOwner),
      buildGoalTree(supabaseServer(), { period, canEdit: false }),
    ]);
    if (!access.see)
      return NextResponse.json(
        { error: "no_goal_access", message: "The goal tree has not been shared with this account." },
        { status: 403 },
      );
    return NextResponse.json({
      ...tree,
      canEdit: access.edit,
      metrics: METRICS.map(({ key, label, unitHint, describe }) => ({ key, label, unitHint, describe })),
    });
  } catch (e) {
    return errJson(e);
  }
}

// POST /api/goals — create / update / delete a node, and comments.
//   { action: "create", parent_id?, node_type?, what, ... }
//   { action: "update", id, ...fields }
//   { action: "delete", id }
//   { action: "comment", id, body }
//   { action: "owners", id, person_ids: [] }
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const access = await resolveGoalAccess(adminClient(), user.id, user.isOwner);
    const db = supabaseServer();
    const body = await req.json();

    // owners may always act on their own node, even without a tree grant
    const ownsNode = async (id: string) => {
      const { data } = await adminClient()
        .from("goal_node_owner")
        .select("node_id")
        .eq("node_id", id)
        .eq("person_id", user.id)
        .maybeSingle();
      return !!data;
    };
    const mayTouch = async (id: string) => access.edit || (await ownsNode(id));

    if (body.action === "create") {
      if (!access.edit) throw new HttpError(403, "You may not add to the goal tree");
      const parentId: string | null = body.parent_id || null;
      let nodeType: NodeType = body.node_type;
      let goalId: string | null = null;

      if (parentId) {
        const { data: parent } = await db
          .from("goal_node")
          .select("id, node_type, goal_id")
          .eq("id", parentId)
          .maybeSingle();
        if (!parent) throw new HttpError(400, "Parent not found");
        nodeType = nodeType || CHILD_OF[parent.node_type as NodeType];
        goalId = parent.node_type === "goal" ? parent.id : parent.goal_id;
      } else {
        nodeType = nodeType || "goal";
      }

      const { data, error } = await db
        .from("goal_node")
        .insert({
          node_type: nodeType,
          parent_id: parentId,
          goal_id: goalId,
          goal_num: nodeType === "goal" ? body.goal_num ?? null : null,
          what: String(body.what || "New " + nodeType).slice(0, 400),
          how: body.how || "",
          swimlane_id: body.swimlane_id || null,
          period: body.period || "FY2026-27",
          start_date: body.start_date || null,
          end_date: body.end_date || null,
          unit_id: body.unit_id || null,
          start_no: body.start_no ?? null,
          current_no: body.current_no ?? null,
          target_no: body.target_no ?? null,
          metric_source: body.metric_source || null,
          status: body.status || "not_started",
          unaligned: nodeType === "project" && !goalId,
          sort_order: body.sort_order ?? 0,
          created_by: user.email,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      if (body.owner_ids?.length) {
        await db.from("goal_node_owner").insert(
          body.owner_ids.map((p: string) => ({ node_id: data.id, person_id: p })),
        );
        await notifyGoalOwners(
          { id: user.id, label: user.initials || user.email.split("@")[0] },
          data.id,
          body.owner_ids,
        );
      }
      return NextResponse.json({ ok: true, id: data.id });
    }

    if (body.action === "update") {
      if (!body.id) throw new HttpError(400, "id required");
      if (!(await mayTouch(body.id))) throw new HttpError(403, "Not your node");
      const allowed = [
        "what", "how", "swimlane_id", "start_date", "end_date", "unit_id",
        "start_no", "current_no", "target_no", "completion_pct", "status",
        "metric_source", "weight", "sort_order", "goal_num",
      ];
      const patch: Record<string, unknown> = {};
      for (const k of allowed) if (k in body) patch[k] = body[k];
      if (!Object.keys(patch).length) throw new HttpError(400, "nothing to update");
      const { error } = await db.from("goal_node").update(patch).eq("id", body.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "delete") {
      if (!access.edit) throw new HttpError(403, "You may not remove goal nodes");
      // children cascade via the FK; comments and owners go with them
      const { error } = await db.from("goal_node").delete().eq("id", body.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "comment") {
      if (!body.id || !String(body.body || "").trim()) throw new HttpError(400, "id and body required");
      if (!access.see && !(await ownsNode(body.id))) throw new HttpError(403, "Not visible to you");
      const { error } = await db.from("goal_node_comment").insert({
        node_id: body.id,
        by: user.initials || user.email,
        body: String(body.body).trim(),
      });
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "owners") {
      if (!access.edit) throw new HttpError(403, "You may not reassign goal nodes");
      // remember who already owned it, so only genuinely NEW owners get a bell
      const { data: prev } = await db.from("goal_node_owner").select("person_id").eq("node_id", body.id);
      const prevIds = new Set((prev || []).map((r) => r.person_id as string));
      await db.from("goal_node_owner").delete().eq("node_id", body.id);
      if (body.person_ids?.length) {
        const { error } = await db.from("goal_node_owner").insert(
          body.person_ids.map((p: string) => ({ node_id: body.id, person_id: p })),
        );
        if (error) throw new Error(error.message);
        await notifyGoalOwners(
          { id: user.id, label: user.initials || user.email.split("@")[0] },
          body.id,
          (body.person_ids as string[]).filter((p) => !prevIds.has(p)),
        );
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return errJson(e);
  }
}
