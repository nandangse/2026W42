import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { swallow } from "@/lib/swallow";
import { requireUser, errJson, HttpError, type AuthedUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { resolveGoalAccess } from "@/lib/goal-access";
import { buildGoalsPayload, DEFAULT_PERIOD } from "@/lib/goals-v2-tree";
import { notify } from "@/lib/notify";
import { KIND_LABEL, PROGRESS_FIELDS, type Kind, type Scope } from "@/lib/goals-v2";

export const dynamic = "force-dynamic";

/** Set by the migration; a missing table means it has not been run yet. */
const NOT_INSTALLED = /goal_item|rock_project|goal_band|person_band|departments|kra|kpi|department_id|does not exist|schema cache/i;

interface Caller extends AuthedUser {
  isAdmin: boolean;
  canEdit: boolean;
  see: boolean;
  departmentId: string | null;
}

async function resolveCaller(): Promise<Caller> {
  const user = await requireUser();
  const admin = adminClient();
  const [access, prof] = await Promise.all([
    resolveGoalAccess(admin, user.id, user.isOwner),
    admin.from("profiles").select("department_id").eq("id", user.id).maybeSingle(),
  ]);
  const isAdmin = user.role === "admin" || user.isOwner;
  return {
    ...user,
    // The admin ROLE is the authority once you are inside — it is what makes
    // company goals settable, rocks creatable and Setup reachable.
    isAdmin,
    // The DOOR is still the explicit goals grant, exactly as the 0010 layer
    // decided: only the owner has it implicitly, admins included. Keeping that
    // rule means the Goals tab appears in the header for precisely the people
    // /api/goals/access says it should.
    canEdit: access.edit,
    see: access.see,
    departmentId: (prof.data?.department_id as string | null) ?? null,
  };
}

const label = (u: Caller) => u.initials || u.displayName || u.email.split("@")[0];

// GET /api/goals-v2?period= — everything the Goals section renders.
export async function GET(req: Request) {
  try {
    const user = await resolveCaller();
    if (!user.see)
      return NextResponse.json(
        { error: "no_goal_access", message: "The Goals section has not been shared with this account." },
        { status: 403 },
      );
    const period = new URL(req.url).searchParams.get("period") || DEFAULT_PERIOD;
    const payload = await buildGoalsPayload(adminClient(), {
      viewerId: user.id,
      isAdmin: user.isAdmin,
      canEdit: user.canEdit,
      period,
    });
    return NextResponse.json(payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (NOT_INSTALLED.test(msg))
      return NextResponse.json({ error: "not_installed", message: msg }, { status: 503 });
    return errJson(e);
  }
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------
const str = (v: unknown, max = 400) => String(v ?? "").slice(0, max);
const numOrNull = (v: unknown) => (v === "" || v == null ? null : Number(v));
const dateOrNull = (v: unknown) => (v ? String(v).slice(0, 10) : null);
const bandList = (v: unknown): string[] => {
  const list = Array.isArray(v) ? v.map((x) => String(x)) : [];
  return list.length ? [...new Set(list)] : ["all"];
};

/** Fields anyone allowed to touch an item may write. */
const ITEM_FIELDS = [
  "title", "detail", "assignee_type", "assignee_id", "dept_id", "start_date", "due_date",
  "start_metric", "current_metric", "goal_metric", "metric_unit", "manual_pct", "weight",
  "status", "sort_order", "kra_id", "kpi_id", "rock_id", "swimlane_id",
] as const;

/** Bell for a newly assigned owner — never for the person doing the assigning. */
async function notifyAssignee(actor: Caller, itemId: string, personId: string | null, title: string, kind: Kind) {
  if (!personId || personId === actor.id) return;
  try {
    await notify(adminClient(), {
      person_id: personId,
      kind: "goal_assigned",
      title: `${label(actor)} assigned you a ${KIND_LABEL[kind].toLowerCase()}`,
      body: title,
      ref_kind: "goal",
      ref_id: itemId,
      created_by: label(actor),
    });
  } catch (e) { swallow("goals-v2", e); /* a notification failure must never break the assignment */ }
}

export async function POST(req: Request) {
  try {
    const user = await resolveCaller();
    if (!user.see) throw new HttpError(403, "The Goals section has not been shared with this account.");
    const admin = adminClient();
    const body = await readBody(req, {});
    const action = String(body.action || "");

    const requireAdminHere = () => {
      if (!user.isAdmin) throw new HttpError(403, "Only an admin may do this");
    };

    // ---- who may write this item -------------------------------------------
    const loadItem = async (id: string) => {
      const { data, error } = await admin
        .from("goal_item")
        .select("id, scope, kind, parent_id, root_id, rock_id, assignee_id, dept_id, bands, period, title")
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new HttpError(404, "That goal no longer exists");
      return data;
    };
    const deptHeadOf = async (deptId: string | null) => {
      if (!deptId) return false;
      const { data } = await admin.from("departments").select("head_person_id").eq("id", deptId).maybeSingle();
      return data?.head_person_id === user.id;
    };
    /**
     * How much of an item this caller may write. Mirrors editModeFor() in
     * src/lib/goals-v2.ts — the UI greys the fields, this decides.
     *
     *   full     — define it
     *   progress — report the current metric, the status, a comment
     *   none     — read it
     *
     * Company goals are the admin's alone to define; their assignee still gets
     * `progress`, or the goal only ever moves when an admin types it.
     */
    const writeMode = async (item: {
      scope: Scope | string; assignee_id: string | null; dept_id: string | null;
    }): Promise<"full" | "progress" | "none"> => {
      if (user.isAdmin) return "full";
      const isAssignee = !!item.assignee_id && item.assignee_id === user.id;
      if (item.scope === "company") return isAssignee ? "progress" : "none";
      if (user.canEdit) return "full";
      if (isAssignee) return "full";
      if (item.scope === "department" && (await deptHeadOf(item.dept_id))) return "full";
      return "none";
    };
    const mayWrite = async (item: { scope: Scope | string; assignee_id: string | null; dept_id: string | null }) =>
      (await writeMode(item)) === "full";

    // ======================= goal items ====================================
    if (action === "item.create") {
      const parentId: string | null = body.parent_id || null;
      let scope: Scope = (body.scope || "company") as Scope;
      let kind: Kind = (body.kind || "goal") as Kind;
      let rockId: string | null = body.rock_id || null;
      let rootId: string | null = null;

      if (parentId) {
        const parent = await loadItem(parentId);
        // scope and rock are INHERITED — a sub-goal can never drift out of the
        // tab its goal lives on
        scope = parent.scope as Scope;
        rockId = parent.rock_id;
        rootId = parent.root_id || parent.id;
        kind = (body.kind || (parent.kind === "initiative" ? "initiative" : "subgoal")) as Kind;
      } else {
        kind = "goal";
        if (scope === "rock" && !rockId) throw new HttpError(400, "A rock goal needs a rock");
      }

      const target = { scope, assignee_id: body.assignee_id || null, dept_id: body.dept_id || null };
      if (!(await mayWrite(target)))
        throw new HttpError(403, scope === "company" ? "Only an admin may set company goals" : "You may not add here");

      const insert = {
        scope,
        kind,
        parent_id: parentId,
        root_id: rootId,
        rock_id: rockId,
        kra_id: body.kra_id || null,
        kpi_id: body.kpi_id || null,
        title: str(body.title || "Untitled"),
        detail: str(body.detail, 4000),
        assignee_type: body.assignee_type === "department" ? "department" : "person",
        assignee_id: body.assignee_type === "department" ? null : body.assignee_id || null,
        dept_id: body.assignee_type === "department" ? body.dept_id || null : body.dept_id || null,
        start_date: dateOrNull(body.start_date),
        due_date: dateOrNull(body.due_date),
        start_metric: numOrNull(body.start_metric),
        current_metric: numOrNull(body.current_metric),
        goal_metric: numOrNull(body.goal_metric),
        metric_unit: str(body.metric_unit, 24),
        manual_pct: Number(body.manual_pct ?? 0),
        weight: Number(body.weight ?? 1),
        status: body.status || "not_started",
        bands: bandList(body.bands),
        period: body.period || DEFAULT_PERIOD,
        sort_order: Number(body.sort_order ?? 0),
        created_by: user.email,
      };

      const { data, error } = await admin.from("goal_item").insert(insert).select("id").single();
      if (error) throw new Error(error.message);
      // a root goal is its own root, which keeps every descendant one hop away
      if (!rootId) await admin.from("goal_item").update({ root_id: data.id }).eq("id", data.id);
      await notifyAssignee(user, data.id, insert.assignee_id, insert.title, kind);
      return NextResponse.json({ ok: true, id: data.id });
    }

    if (action === "item.update") {
      if (!body.id) throw new HttpError(400, "id required");
      const item = await loadItem(body.id);
      const mode = await writeMode(item);
      if (mode === "none")
        throw new HttpError(403, item.scope === "company" ? "Company goals are set by an admin" : "Not yours to change");

      // `progress` may report the number and the status, and nothing else —
      // silently, so a stale form that posts the whole record cannot smuggle a
      // retarget through as a progress update.
      const writable: readonly string[] = mode === "full" ? ITEM_FIELDS : PROGRESS_FIELDS;

      const patch: Record<string, unknown> = {};
      for (const k of ITEM_FIELDS) {
        if (!(k in body) || !writable.includes(k)) continue;
        if (k === "start_metric" || k === "current_metric" || k === "goal_metric") patch[k] = numOrNull(body[k]);
        else if (k === "manual_pct" || k === "weight" || k === "sort_order") patch[k] = Number(body[k] ?? 0);
        else if (k === "start_date" || k === "due_date") patch[k] = dateOrNull(body[k]);
        else if (k === "title") patch[k] = str(body[k]);
        else if (k === "detail") patch[k] = str(body[k], 4000);
        else patch[k] = body[k] === "" ? null : body[k];
      }
      // the radio button: one side of the assignment is always cleared
      if ("assignee_type" in body && mode === "full") {
        if (body.assignee_type === "department") patch.assignee_id = null;
        else patch.dept_id = body.dept_id ?? null;
      }
      // bands are a marking, not a field anyone may set — an editor's call
      if ("bands" in body && mode === "full") {
        if (!user.canEdit && !user.isAdmin)
          throw new HttpError(403, "Only a goals editor may change who this is visible to");
        patch.bands = bandList(body.bands);
      }
      if (!Object.keys(patch).length) throw new HttpError(400, "nothing to update");

      const { error } = await admin.from("goal_item").update(patch).eq("id", body.id);
      if (error) throw new Error(error.message);

      if ("assignee_id" in patch && patch.assignee_id && patch.assignee_id !== item.assignee_id)
        await notifyAssignee(user, item.id, patch.assignee_id as string, String(patch.title ?? item.title), item.kind as Kind);
      return NextResponse.json({ ok: true });
    }

    if (action === "item.delete") {
      const item = await loadItem(body.id);
      if (!(await mayWrite(item))) throw new HttpError(403, "Not yours to delete");
      // children cascade through the FK, and their comments with them
      const { error } = await admin.from("goal_item").delete().eq("id", body.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "comment.add") {
      if (!body.id || !String(body.body || "").trim()) throw new HttpError(400, "id and body required");
      const { error } = await admin.from("goal_item_comment").insert({
        item_id: body.id,
        by: label(user),
        body: str(body.body, 2000),
      });
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    // ======================= quarterly rocks ================================
    if (action === "rock.create" || action === "rock.update") {
      requireAdminHere();
      const row = {
        name: str(body.name || "Untitled rock", 200),
        detail: str(body.detail, 4000),
        quarter: str(body.quarter || "Q1", 8),
        period: body.period || DEFAULT_PERIOD,
        owner_id: body.owner_id || null,
        dept_id: body.dept_id || null,
        start_date: dateOrNull(body.start_date),
        due_date: dateOrNull(body.due_date),
        status: body.status || "not_started",
        bands: bandList(body.bands),
        color: str(body.color || "#E8600A", 9),
        sort_order: Number(body.sort_order ?? 0),
      };
      if (action === "rock.create") {
        const { data, error } = await admin
          .from("rock_project")
          .insert({ ...row, created_by: user.email })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true, id: data.id });
      }
      const { error } = await admin.from("rock_project").update(row).eq("id", body.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "rock.delete") {
      requireAdminHere();
      // goals under the rock go with it — that is what the cascade FK is for
      const { error } = await admin.from("rock_project").delete().eq("id", body.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    // ======================= key result areas ===============================
    if (action === "kra.create" || action === "kra.update") {
      requireAdminHere();
      const row = {
        person_id: body.person_id,
        dept_id: body.dept_id || null,
        title: str(body.title || "Untitled area", 200),
        detail: str(body.detail, 4000),
        weight: Number(body.weight ?? 1),
        sort_order: Number(body.sort_order ?? 0),
        active: body.active !== false,
      };
      if (!row.person_id) throw new HttpError(400, "A key result area belongs to a person");
      if (action === "kra.create") {
        const { data, error } = await admin.from("kra").insert({ ...row, created_by: user.email }).select("id").single();
        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true, id: data.id });
      }
      const { error } = await admin.from("kra").update(row).eq("id", body.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "kra.delete") {
      requireAdminHere();
      const { error } = await admin.from("kra").delete().eq("id", body.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    // ======================= KPIs ===========================================
    if (action === "kpi.create") {
      requireAdminHere();
      const { data, error } = await admin
        .from("kpi")
        .insert({
          name: str(body.name || "Untitled KPI", 200),
          detail: str(body.detail, 4000),
          unit: str(body.unit, 24),
          owner_id: body.owner_id || null,
          dept_id: body.dept_id || null,
          start_value: numOrNull(body.start_value),
          current_value: numOrNull(body.current_value),
          target_value: numOrNull(body.target_value),
          metric_source: body.metric_source || null,
          cadence: str(body.cadence || "monthly", 24),
          period: body.period || DEFAULT_PERIOD,
          bands: bandList(body.bands),
          sort_order: Number(body.sort_order ?? 0),
          created_by: user.email,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, id: data.id });
    }

    if (action === "kpi.update") {
      const { data: kpi } = await admin.from("kpi").select("owner_id").eq("id", body.id).maybeSingle();
      if (!kpi) throw new HttpError(404, "That KPI no longer exists");
      const isOwner = kpi.owner_id === user.id;
      if (!user.isAdmin && !isOwner) throw new HttpError(403, "Only an admin or the KPI's owner may change it");

      // The owner reports the reading; the definition itself stays the admin's.
      const patch: Record<string, unknown> = {};
      if ("current_value" in body) patch.current_value = numOrNull(body.current_value);
      if (user.isAdmin) {
        for (const k of ["name", "detail", "unit", "cadence"]) if (k in body) patch[k] = str(body[k], 4000);
        for (const k of ["start_value", "target_value"]) if (k in body) patch[k] = numOrNull(body[k]);
        for (const k of ["owner_id", "dept_id", "metric_source"]) if (k in body) patch[k] = body[k] || null;
        if ("bands" in body) patch.bands = bandList(body.bands);
        if ("active" in body) patch.active = !!body.active;
        if ("sort_order" in body) patch.sort_order = Number(body.sort_order ?? 0);
      }
      if (!Object.keys(patch).length) throw new HttpError(400, "nothing to update");
      const { error } = await admin.from("kpi").update(patch).eq("id", body.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "kpi.delete") {
      requireAdminHere();
      const { error } = await admin.from("kpi").delete().eq("id", body.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "kpi.watchers") {
      requireAdminHere();
      await admin.from("kpi_watcher").delete().eq("kpi_id", body.id);
      const ids: string[] = Array.isArray(body.person_ids) ? body.person_ids : [];
      if (ids.length) {
        const { error } = await admin
          .from("kpi_watcher")
          .insert(ids.map((p) => ({ kpi_id: body.id, person_id: p })));
        if (error) throw new Error(error.message);
      }
      return NextResponse.json({ ok: true });
    }

    // ======================= setup: departments, bands ======================
    if (action === "dept.create" || action === "dept.update") {
      requireAdminHere();
      const row = {
        name: str(body.name || "Untitled", 120),
        code: str(body.code, 12) || null,
        color: str(body.color || "#1B3A5C", 9),
        head_person_id: body.head_person_id || null,
        sort_order: Number(body.sort_order ?? 0),
        active: body.active !== false,
      };
      if (action === "dept.create") {
        const { data, error } = await admin.from("departments").insert(row).select("id").single();
        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true, id: data.id });
      }
      const { error } = await admin.from("departments").update(row).eq("id", body.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "dept.delete") {
      requireAdminHere();
      // goals keep their history — the reference is nulled, not cascaded
      const { error } = await admin.from("departments").delete().eq("id", body.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "person.set") {
      requireAdminHere();
      if (!body.person_id) throw new HttpError(400, "person_id required");
      if ("department_id" in body) {
        const { error } = await admin
          .from("profiles")
          .update({ department_id: body.department_id || null })
          .eq("id", body.person_id);
        if (error) throw new Error(error.message);
      }
      if ("bands" in body) {
        await admin.from("person_band").delete().eq("person_id", body.person_id);
        const list: string[] = Array.isArray(body.bands)
          ? [...new Set((body.bands as unknown[]).map((b) => String(b)))]
          : [];
        if (list.length) {
          const { error } = await admin
            .from("person_band")
            .insert(list.map((b) => ({ person_id: body.person_id, band: b })));
          if (error) throw new Error(error.message);
        }
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: `unknown action "${action}"` }, { status: 400 });
  } catch (e) {
    return errJson(e);
  }
}
