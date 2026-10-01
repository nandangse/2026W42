import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { errJson, HttpError } from "@/lib/auth";
import { isKindleAdmin, kindleAudit, requireKindler } from "@/lib/kindle/auth";

export const dynamic = "force-dynamic";

/**
 * Feedback on a meeting (Dr Raghu, 1 Oct 2026: "also take feedback. We will
 * ensure this is done once meeting is complete.") — the constitution's
 * meeting quality check, written instead of said.
 * GET ?meeting_id → everyone's feedback (names hidden where anonymous, except to the writer), the average, who has not yet written.
 * POST { meeting_id, rating, went_well, improve, takeaway, next_topic, anonymous } — mine, replaced if written again.
 */
export async function GET(req: Request) {
  try {
    const k = await requireKindler();
    const meeting_id = new URL(req.url).searchParams.get("meeting_id") || "";
    if (!meeting_id) throw new HttpError(400, "Which meeting?");
    const admin = adminClient();
    const { data, error } = await admin.from("kindle_meeting_feedback").select("member_id,rating,went_well,improve,takeaway,next_topic,anonymous,submitted_at").eq("meeting_id", meeting_id).order("submitted_at");
    if (error) throw error;
    const rows = (data || []).map((r) => ({ ...r, member_id: r.anonymous && r.member_id !== k.id && !isKindleAdmin(k) ? null : r.member_id }));
    const avg = rows.length ? Math.round((rows.reduce((s, r) => s + Number(r.rating), 0) / rows.length) * 10) / 10 : null;
    return NextResponse.json({ rows, avg, mine: (data || []).find((r) => r.member_id === k.id) || null });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const k = await requireKindler();
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const meeting_id = String(b.meeting_id || "");
    const rating = Number(b.rating);
    if (!meeting_id || !(rating >= 1 && rating <= 10)) throw new HttpError(400, "A meeting and a rating from 1 to 10.");
    const row = { meeting_id, member_id: k.id, rating, went_well: b.went_well ? String(b.went_well) : null, improve: b.improve ? String(b.improve) : null, takeaway: b.takeaway ? String(b.takeaway) : null, next_topic: b.next_topic ? String(b.next_topic) : null, anonymous: !!b.anonymous, submitted_at: new Date().toISOString() };
    const { error } = await adminClient().from("kindle_meeting_feedback").upsert(row, { onConflict: "meeting_id,member_id" });
    if (error) throw error;
    await kindleAudit(k, "feedback_given", { meeting_id, rating });
    return NextResponse.json({ ok: true });
  } catch (e) { return errJson(e); }
}
