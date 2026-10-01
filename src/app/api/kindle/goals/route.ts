import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { errJson, HttpError } from "@/lib/auth";
import { isKindleAdmin, kindleAudit, requireKindler } from "@/lib/kindle/auth";
import { AI, anthropicClient } from "@/lib/ai";
import { assertAiOn } from "@/lib/ai-gate";

export const dynamic = "force-dynamic";

/**
 * Goals (Dr Raghu, 1 Oct 2026: "a complete section on goals so that we can
 * set the goals, and then we can track it up"). A set per member per year:
 * three professional, three personal, the six reflection answers. The
 * check-in form carries the current set's goals as its sections.
 * POST save_set { year_label, professional[3], personal[3], reflections{} } — mine (or the facilitator's, with member_id)
 *      status   { goal_id, status, progress }                                — mine
 *      summarise { set_id }  — Genie reads the set and every month's word on each goal and writes a short
 *                              reading of where the member stands (Dr Raghu, 1 Oct 2026: "the Genie can be
 *                              built in to summarise it"); kept on the set; obeys the AI master switch.
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
    if (action === "summarise") {
      await assertAiOn();
      const set_id = String(b.set_id || "");
      const { data: set } = await admin.from("kindle_goal_set").select("id,member_id,year_label,failed_last,start_doing,stop_doing,one_thing,accountable_to,support_needed").eq("id", set_id).maybeSingle();
      if (!set) throw new HttpError(404, "No such goal set.");
      const [{ data: member }, { data: goals }, { data: ups }] = await Promise.all([
        admin.from("kindle_member").select("name,short_name").eq("id", set.member_id).maybeSingle(),
        admin.from("kindle_goal").select("id,kind,seq,title,status").eq("set_id", set_id).order("kind").order("seq"),
        admin.from("kindle_goal_update").select("goal_id,period,note,status").eq("member_id", set.member_id).order("period"),
      ]);
      const lines: string[] = [];
      for (const g of goals || []) {
        lines.push(`\n${g.kind === "personal" ? "PERSONAL" : "PROFESSIONAL"} GOAL ${g.seq}: ${g.title} (status now: ${g.status})`);
        for (const u of (ups || []).filter((u) => u.goal_id === g.id)) lines.push(`  ${String(u.period).slice(0, 7)}: ${u.note || ""}${u.status ? ` [${u.status}]` : ""}`);
      }
      const refl = [["Failed last year", set.failed_last], ["Start doing", set.start_doing], ["Stop doing", set.stop_doing], ["The one thing", set.one_thing], ["Accountable to", set.accountable_to], ["Support needed", set.support_needed]].filter(([, v]) => v).map(([k2, v]) => `${k2}: ${v}`).join("\n");
      const who = member?.short_name || member?.name || "the member";
      const prompt = `You are Genie, the quiet secretary of Kindle, a trust group of ten entrepreneurs in Mumbai. Below are ${who}'s goals for ${set.year_label} and the word he gave on each at every monthly check-in.\n\nWrite a short reading for the group, in plain English, 120 to 180 words, no headings, no bullet points, no flattery: where each goal stands and the direction of travel; which one has gone quiet; what he keeps saying he will do; the one question the room should ask him. Refer to him by first name. If the record is thin, say so in a sentence rather than inventing.\n\nREFLECTION\n${refl || "(none)"}\n\nGOALS AND MONTHLY UPDATES${lines.join("\n") || "\n(no updates yet)"}`;
      const ai = anthropicClient();
      const msg = await ai.messages.create({ model: AI.FRONT, max_tokens: 500, messages: [{ role: "user", content: prompt }] });
      const text = msg.content.map((c) => ("text" in c ? c.text : "")).join("").trim();
      if (!text) throw new HttpError(502, "Genie had nothing to say.");
      await admin.from("kindle_goal_set").update({ ai_summary: text, ai_summary_at: new Date().toISOString() }).eq("id", set_id);
      await kindleAudit(k, "goals_summarised", { set_id });
      return NextResponse.json({ ok: true, summary: text });
    }
    throw new HttpError(400, "Unknown action.");
  } catch (e) { return errJson(e); }
}
