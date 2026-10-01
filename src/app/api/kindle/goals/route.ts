import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { errJson, HttpError } from "@/lib/auth";
import { isKindleAdmin, kindleAudit, requireKindler } from "@/lib/kindle/auth";

export const dynamic = "force-dynamic";

/**
 * Goals (Dr Raghu, 1 Oct 2026: "a complete section on goals so that we can
 * set the goals, and then we can track it up"). A set per member per year:
 * three professional, three personal, the six reflection answers. The
 * check-in form carries the current set's goals as its sections.
 * POST save_set { year_label, professional[3], personal[3], reflections{} } — mine (or the facilitator's, with member_id)
 *      status   { goal_id, status, progress }                                — mine
 */
export async function POST(req: Request) {
  try {
    const k = await requireKindler();
    const admin = adminClient();
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(b.action || "");
    if (action === "save_set") {
      const member_id = b.member_id && isKindleAdmin(k) ? String(b.member_id) : k.id;
      const year_label = String(b.year_label || "").trim();
      if (!/^\d{4}-\d{2}$/.test(year_label)) throw new HttpError(400, "A year like 2026-27.");
      const prof = (Array.isArray(b.professional) ? b.professional : []).map((x) => String(x || "").trim());
      const pers = (Array.isArray(b.personal) ? b.personal : []).map((x) => String(x || "").trim());
      if (!prof.some(Boolean) && !pers.some(Boolean)) throw new HttpError(400, "At least one goal.");
      const r = (b.reflections || {}) as Record<string, unknown>;
      const txt = (key: string) => { const s = String(r[key] ?? "").trim(); return s || null; };
      const { data: set, error } = await admin.from("kindle_goal_set").upsert({ member_id, year_label, failed_last: txt("failed_last"), start_doing: txt("start_doing"), stop_doing: txt("stop_doing"), one_thing: txt("one_thing"), accountable_to: txt("accountable_to"), support_needed: txt("support_needed"), notes: txt("notes"), updated_at: new Date().toISOString() }, { onConflict: "member_id,year_label" }).select("id").single();
      if (error) throw error;
      const { data: existing } = await admin.from("kindle_goal").select("id,kind,seq").eq("set_id", set.id);
      for (const [kind, list] of [["professional", prof], ["personal", pers]] as const) {
        for (let i = 0; i < Math.max(3, list.length); i++) {
          const title = list[i] || "";
          const have = (existing || []).find((g) => g.kind === kind && g.seq === i + 1);
          if (have && title) await admin.from("kindle_goal").update({ title, updated_at: new Date().toISOString() }).eq("id", have.id);
          else if (have && !title) { const { count } = await admin.from("kindle_goal_update").select("id", { count: "exact", head: true }).eq("goal_id", have.id); if (!count) await admin.from("kindle_goal").delete().eq("id", have.id); else await admin.from("kindle_goal").update({ status: "dropped" }).eq("id", have.id); }
          else if (!have && title) await admin.from("kindle_goal").insert({ set_id: set.id, member_id, kind, seq: i + 1, title });
        }
      }
      await kindleAudit(k, "goals_saved", { member_id, year_label });
      return NextResponse.json({ ok: true, id: set.id });
    }
    if (action === "status") {
      const goal_id = String(b.goal_id || "");
      const { data: g } = await admin.from("kindle_goal").select("member_id").eq("id", goal_id).maybeSingle();
      if (!g || (g.member_id !== k.id && !isKindleAdmin(k))) throw new HttpError(403, "Your own goal.");
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (["on_track", "behind", "done", "dropped"].includes(String(b.status))) patch.status = String(b.status);
      if (Number.isFinite(Number(b.progress))) patch.progress = Math.max(0, Math.min(100, Number(b.progress)));
      await admin.from("kindle_goal").update(patch).eq("id", goal_id);
      return NextResponse.json({ ok: true });
    }
    throw new HttpError(400, "Unknown action.");
  } catch (e) { return errJson(e); }
}
