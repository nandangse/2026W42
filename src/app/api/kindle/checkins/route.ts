import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { errJson, HttpError } from "@/lib/auth";
import { kindleAudit, requireKindler } from "@/lib/kindle/auth";

export const dynamic = "force-dynamic";

const COLS = "id,member_id,period,meeting_id,submitted_at,prof_rating,pers_rating,prof_notes,pers_notes,learning,challenge,sounding,one_to_one,update_note,suggestions,new_goals,source";

/**
 * GET /api/kindle/checkins — every check-in since January 2023 with its goal
 * updates, and every goal, so the screen can show this month one at a time,
 * a member's whole history sideways, and my own form.
 * POST { action: "save", period, …fields, goals: [{goal_id, note, status, progress}] }
 *   — my check-in for a month, written in the site (source "site"); one per month, edited in place.
 */
export async function GET() {
  try {
    await requireKindler();
    const admin = adminClient();
    const [ck, gu, g, gs] = await Promise.all([
      admin.from("kindle_checkin").select(COLS).order("period", { ascending: false }).order("submitted_at", { ascending: false }).limit(2000),
      admin.from("kindle_goal_update").select("id,goal_id,checkin_id,member_id,period,note,status,progress").limit(5000),
      admin.from("kindle_goal").select("id,set_id,member_id,kind,seq,title,status,progress"),
      admin.from("kindle_goal_set").select("id,member_id,year_label,created_at"),
    ]);
    const err = [ck, gu, g, gs].find((r) => r.error)?.error; if (err) throw err;
    return NextResponse.json({ checkins: ck.data || [], updates: gu.data || [], goals: g.data || [], sets: gs.data || [] });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const k = await requireKindler();
    const admin = adminClient();
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (b.action !== "save") throw new HttpError(400, "Unknown action.");
    const period = String(b.period || "");
    if (!/^\d{4}-\d{2}-01$/.test(period)) throw new HttpError(400, "Which month?");
    const txt = (key: string) => { const v = b[key]; const s = v == null ? "" : String(v).trim(); return s || null; };
    const rate = (key: string) => { const n = Number(b[key]); return Number.isInteger(n) && n >= 0 && n <= 10 ? n : null; };
    const fields = {
      prof_rating: rate("prof_rating"), pers_rating: rate("pers_rating"), prof_notes: txt("prof_notes"), pers_notes: txt("pers_notes"),
      learning: txt("learning"), challenge: txt("challenge"), sounding: txt("sounding"), one_to_one: txt("one_to_one"), suggestions: txt("suggestions"), new_goals: txt("new_goals"),
    };
    const { data: mt } = await admin.from("kindle_meeting").select("id").eq("kind", "monthly").gte("meeting_on", period).lt("meeting_on", nextMonth(period)).maybeSingle();
    const { data: ex } = await admin.from("kindle_checkin").select("id").eq("member_id", k.id).eq("period", period).eq("source", "site").maybeSingle();
    let id = ex?.id as string | undefined;
    if (id) { const { error } = await admin.from("kindle_checkin").update({ ...fields, meeting_id: mt?.id || null, submitted_at: new Date().toISOString() }).eq("id", id); if (error) throw error; }
    else { const { data, error } = await admin.from("kindle_checkin").insert({ member_id: k.id, period, meeting_id: mt?.id || null, source: "site", ...fields }).select("id").single(); if (error) throw error; id = data.id; }
    /* goal updates: replaced whole for this check-in */
    await admin.from("kindle_goal_update").delete().eq("checkin_id", id);
    const goals = (Array.isArray(b.goals) ? b.goals : []) as Record<string, unknown>[];
    const rows = goals.filter((x) => x.goal_id && (String(x.note || "").trim() || x.status)).map((x) => ({
      goal_id: String(x.goal_id), member_id: k.id, checkin_id: id, period, note: String(x.note || "").trim() || null,
      status: ["on_track", "behind", "done", "dropped"].includes(String(x.status)) ? String(x.status) : null,
      progress: Number.isFinite(Number(x.progress)) ? Math.max(0, Math.min(100, Number(x.progress))) : null,
    }));
    if (rows.length) {
      const { error } = await admin.from("kindle_goal_update").insert(rows); if (error) throw error;
      /* the goal carries its latest status */
      for (const r of rows) if (r.status) await admin.from("kindle_goal").update({ status: r.status, progress: r.progress ?? undefined, updated_at: new Date().toISOString() }).eq("id", r.goal_id).eq("member_id", k.id);
    }
    /* learning feed */
    await admin.from("kindle_learning").delete().eq("checkin_id", id);
    if (fields.learning) await admin.from("kindle_learning").insert({ member_id: k.id, noted_on: new Date().toISOString().slice(0, 10), body: fields.learning, checkin_id: id });
    await kindleAudit(k, "checkin_saved", { period, goals: rows.length });
    return NextResponse.json({ ok: true, id });
  } catch (e) { return errJson(e); }
}
const nextMonth = (p: string) => { const [y, m] = p.split("-").map(Number); const d = new Date(Date.UTC(y, m, 1)); return d.toISOString().slice(0, 10); };
