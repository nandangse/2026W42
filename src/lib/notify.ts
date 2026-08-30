// Assignment notifications. One rule above all: a notification failure must
// NEVER break the action that triggered it — every write here swallows its
// own errors (including "table not there yet" before migration 0012 runs).
import type { SupabaseClient } from "@supabase/supabase-js";

export interface PersonRow {
  id: string;
  email: string;
  initials: string | null;
  display_name: string | null;
  erp_owner: string | null;
}

/**
 * Resolve a task's `who` string to an account. Assignment stores initials in
 * the new flow, but legacy/ERP tasks carry free text — so match the same
 * handles My Week matches: initials, email, email handle, display name, ERP
 * owner string.
 */
export async function resolvePersonByHandle(
  admin: SupabaseClient,
  handle: unknown,
): Promise<PersonRow | null> {
  const h = String(handle ?? "").trim().toLowerCase();
  if (!h || h === "unassigned") return null;
  try {
    const { data } = await admin
      .from("profiles")
      .select("id,email,initials,display_name,erp_owner")
      .eq("disabled", false);
    return (
      (data || []).find(
        (p) =>
          p.initials?.toLowerCase() === h ||
          p.email.toLowerCase() === h ||
          p.email.split("@")[0].toLowerCase() === h ||
          p.display_name?.toLowerCase() === h ||
          p.erp_owner?.toLowerCase() === h,
      ) ?? null
    );
  } catch {
    return null;
  }
}

export async function notify(
  admin: SupabaseClient,
  n: {
    person_id: string;
    /** The kinds the bell rings for — matched by the table's own check
     *  constraint, so a new one is added in both places or neither. */
    kind: "task_assigned" | "task_reassigned" | "goal_assigned" | "seva_push";
    title: string;
    body?: string;
    ref_kind?: string;
    ref_id?: string;
    created_by?: string;
  },
): Promise<void> {
  try {
    await admin.from("notifications").insert({
      person_id: n.person_id,
      kind: n.kind,
      title: n.title.slice(0, 200),
      body: (n.body || "").slice(0, 400),
      ref_kind: n.ref_kind ?? null,
      ref_id: n.ref_id ?? null,
      created_by: n.created_by ?? null,
    });
  } catch {
    /* never let a notification break the assignment itself */
  }
}

/**
 * Notify the person a task was just assigned to — skipping self-assignment,
 * which needs no bell.
 */
export async function notifyTaskAssignment(
  admin: SupabaseClient,
  opts: {
    who: unknown;
    actorId: string;
    actorLabel: string;
    taskTitle: string;
    jobId?: string | null;
    kind: "task_assigned" | "task_reassigned";
    refKind: "manual" | "erp";
    refId: string;
  },
): Promise<void> {
  const person = await resolvePersonByHandle(admin, opts.who);
  if (!person || person.id === opts.actorId) return;

  let jobTag = "";
  if (opts.jobId) {
    try {
      const { data } = await admin.from("jobs").select("tag").eq("id", opts.jobId).maybeSingle();
      if (data?.tag) jobTag = ` · ${data.tag}`;
    } catch {
      /* tag is decoration */
    }
  }

  await notify(admin, {
    person_id: person.id,
    kind: opts.kind,
    title:
      opts.kind === "task_assigned"
        ? `${opts.actorLabel} assigned you a task`
        : `${opts.actorLabel} reassigned a task to you`,
    body: `"${opts.taskTitle}"${jobTag}`,
    ref_kind: opts.refKind,
    ref_id: opts.refId,
    created_by: opts.actorLabel,
  });
}
