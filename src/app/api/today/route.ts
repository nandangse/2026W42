import { NextResponse } from "next/server";
import { requireUser, errJson } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { today as todayISO } from "@/lib/schedule";

export const dynamic = "force-dynamic";

/** Prefix on the grouping name, so "By Goals" says which list a goal came from. */
const SCOPE_TAG: Record<string, string> = {
  company: "🏛 ", rock: "🪨 ", department: "🏢 ", personal: "🎯 ",
};
/** Shown in the Category column of My Week. */
const KIND_CAT: Record<string, string> = {
  goal: "Goal", subgoal: "Sub goal", initiative: "Initiative",
};

/**
 * GET /api/today — one list of what a person owes today, drawn from BOTH layers:
 *   · goal work assigned to them whose start date has arrived   (source: "goal")
 *   · ERP and manual tasks assigned to them                     (source: "task")
 *
 * This is deliberately available to everyone, with no goal grant required:
 * seeing the goal tree and seeing your own work are separate checks, so a
 * person always reaches their own work even when the tree is hidden from them.
 * That is also why the band marking is not applied here — a goal hidden from
 * your band but ASSIGNED TO YOU is still yours to do.
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

    // The goals layer is optional: if migration 0019 has not been applied, the
    // task side of this list must still work rather than 500 the landing page.
    const goalsPromise = (async () => {
      try {
        const { data, error } = await admin
          .from("goal_item")
          .select("id, title, kind, status, start_date, due_date, original_due, push_count, root_id")
          .eq("assignee_id", user.id)
          .neq("status", "done")
          .lte("start_date", T);
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

    // Name of the goal each item hangs off — Tasking's "By Goals" view groups
    // on it, and a bare uuid is no use to anyone reading a board.
    const goalNames: Record<string, string> = {};
    const rootIds = [...new Set(goalData.map((g: any) => g.root_id).filter(Boolean))] as string[];
    if (rootIds.length) {
      try {
        const { data } = await admin.from("goal_item").select("id, title, scope").in("id", rootIds);
        for (const g of data || [])
          goalNames[g.id as string] = `${SCOPE_TAG[g.scope as string] ?? ""}${g.title || "Goal"}`;
      } catch { /* pre-0019: no goals layer, names stay empty */ }
    }

    if (erpRows.error) throw new Error(erpRows.error.message);
    if (manualRows.error) throw new Error(manualRows.error.message);

    const mine = (who: unknown) => handles.has(String(who ?? "").toLowerCase());

    const items = [
      ...goalData.map((g: any) => ({
        source: "goal" as const,
        id: g.id,
        kind: g.kind,
        title: g.title,
        job_id: null as string | null,
        due: g.due_date,
        originalDue: g.original_due,
        pushCount: g.push_count ?? 0,
        carriedDays: g.start_date
          ? Math.max(0, Math.round((Date.parse(T) - Date.parse(g.start_date)) / 86400000))
          : 0,
        cat: KIND_CAT[g.kind as string] ?? "Goal",
        goalId: (g.root_id ?? null) as string | null,
        goalName: (g.root_id && goalNames[g.root_id]) || "Unlinked goal work",
        esc: null as string | null,
        late: !!(g.original_due || g.due_date) && (g.original_due || g.due_date)! < T,
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
          goalId: null as string | null,
          goalName: "",
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
