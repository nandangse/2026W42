import { NextResponse } from "next/server";
import { requireUser, errJson } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { today as todayISO } from "@/lib/schedule";

export const dynamic = "force-dynamic";

/**
 * GET /api/today — one list of what a person owes today, drawn from BOTH layers:
 *   · goal tactics / key results whose start date has arrived   (source: "goal")
 *   · ERP and manual tasks assigned to them                     (source: "task")
 *
 * This is deliberately available to everyone, with no goal grant required: tree
 * visibility and own-work visibility are separate checks, so a person always
 * reaches their own work even when the cascade is hidden from them.
 */
export async function GET() {
  try {
    const user = await requireUser();
    const T = todayISO();
    const db = supabaseServer();
    const admin = adminClient();

    // every string this person's work might be filed under
    const handles = new Set(
      [user.initials, user.displayName, user.erpOwner, user.email, user.email.split("@")[0]]
        .filter(Boolean)
        .map((s) => String(s).toLowerCase()),
    );

    // The goals layer is optional: if migration 0010 has not been applied, the
    // task side of this list must still work rather than 500 the landing page.
    const goalsPromise = (async () => {
      try {
        const ids = await ownedNodeIds(admin, user.id);
        const { data, error } = await admin
          .from("goal_node")
          .select("id, what, node_type, status, start_date, end_date, original_end, push_count, goal_id")
          .in("node_type", ["tactic", "key_result"])
          .neq("status", "done")
          .lte("start_date", T)
          .in("id", ids);
        if (error) return [];
        return data || [];
      } catch {
        return [];
      }
    })();

    const [goalData, erpRows, manualRows] = await Promise.all([
      goalsPromise,
      db.from("erp_tasks").select("id, job_id, title, who, due, cat, esc, done").eq("done", false),
      db.from("manual_tasks").select("id, job_id, title, who, due, cat, esc, done").eq("done", false),
    ]);

    if (erpRows.error) throw new Error(erpRows.error.message);
    if (manualRows.error) throw new Error(manualRows.error.message);

    const mine = (who: unknown) => handles.has(String(who ?? "").toLowerCase());

    const items = [
      ...goalData.map((g: any) => ({
        source: "goal" as const,
        id: g.id,
        kind: g.node_type,
        title: g.what,
        job_id: null as string | null,
        due: g.end_date,
        originalDue: g.original_end,
        pushCount: g.push_count ?? 0,
        carriedDays: g.start_date
          ? Math.max(0, Math.round((Date.parse(T) - Date.parse(g.start_date)) / 86400000))
          : 0,
        cat: g.node_type === "key_result" ? "Key result" : "Tactic",
        esc: null as string | null,
        late: !!(g.original_end || g.end_date) && (g.original_end || g.end_date)! < T,
      })),
      ...[...(erpRows.data || []).map((t) => ({ ...t, k: "erp" as const })),
          ...(manualRows.data || []).map((t) => ({ ...t, k: "manual" as const }))]
        .filter((t) => mine(t.who))
        .map((t) => ({
          source: "task" as const,
          id: t.id,
          kind: t.k,
          title: t.title,
          job_id: t.job_id,
          due: t.due,
          originalDue: t.due,
          pushCount: 0,
          carriedDays: 0,
          cat: t.cat,
          esc: t.esc,
          late: !!t.due && t.due < T,
        })),
    ].sort((a, b) => ((a.due || "9999") < (b.due || "9999") ? -1 : 1));

    return NextResponse.json({
      date: T,
      items,
      counts: {
        total: items.length,
        overdue: items.filter((i) => i.late).length,
        goal: items.filter((i) => i.source === "goal").length,
        task: items.filter((i) => i.source === "task").length,
      },
    });
  } catch (e) {
    return errJson(e);
  }
}

async function ownedNodeIds(admin: ReturnType<typeof adminClient>, personId: string) {
  const { data, error } = await admin.from("goal_node_owner").select("node_id").eq("person_id", personId);
  if (error) return ["00000000-0000-0000-0000-000000000000"];
  const ids = (data || []).map((r) => r.node_id as string);
  // .in() with an empty array matches nothing, which is the behaviour we want
  return ids.length ? ids : ["00000000-0000-0000-0000-000000000000"];
}
