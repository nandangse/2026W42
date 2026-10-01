import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { errJson, HttpError } from "@/lib/auth";
import { isKindleAdmin, kindleAudit, requireKindler } from "@/lib/kindle/auth";

export const dynamic = "force-dynamic";

/**
 * Polls (Dr Raghu, 1 Oct 2026: "Have a poll from all people").
 * GET  → every poll with its options, the counts, and my own vote.
 * POST create { question, options[], multi?, anonymous?, closes_at? }  — any member
 *      vote   { poll_id, choices[] }                                    — one vote per member, changeable until close
 *      close  { poll_id }                                               — the asker or the facilitator
 *      remove { poll_id }                                               — the asker (no votes yet) or the facilitator
 */
export async function GET() {
  try {
    const k = await requireKindler();
    const admin = adminClient();
    const [{ data: polls, error }, { data: votes }] = await Promise.all([
      admin.from("kindle_poll").select("id,question,options,multi,anonymous,closes_at,created_by,created_at").order("created_at", { ascending: false }),
      admin.from("kindle_poll_vote").select("poll_id,member_id,choices,voted_at"),
    ]);
    if (error) throw error;
    const now = Date.now();
    const out = (polls || []).map((p) => {
      const vs = (votes || []).filter((v) => v.poll_id === p.id);
      const counts = (p.options as string[]).map(() => 0);
      for (const v of vs) for (const c of v.choices || []) if (counts[c] != null) counts[c] += 1;
      const mine = vs.find((v) => v.member_id === k.id);
      const closed = !!p.closes_at && new Date(String(p.closes_at)).getTime() < now;
      return { ...p, counts, voters: vs.length, mine: mine?.choices ?? null, closed,
        /* who voted what: only when the poll is not anonymous, and only once it is closed or I have voted */
        by: !p.anonymous && (closed || mine) ? vs.map((v) => ({ member_id: v.member_id, choices: v.choices })) : null };
    });
    return NextResponse.json({ polls: out });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const k = await requireKindler();
    const admin = adminClient();
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(b.action || "");
    if (action === "create") {
      const question = String(b.question || "").trim();
      const options = (Array.isArray(b.options) ? b.options : []).map((o) => String(o).trim()).filter(Boolean);
      if (question.length < 5 || options.length < 2) throw new HttpError(400, "A question and at least two options.");
      const { data, error } = await admin.from("kindle_poll").insert({ question, options, multi: !!b.multi, anonymous: !!b.anonymous, closes_at: b.closes_at ? String(b.closes_at) : null, created_by: k.id }).select("id").single();
      if (error) throw error;
      await kindleAudit(k, "poll_created", { id: data.id });
      return NextResponse.json({ ok: true, id: data.id });
    }
    const poll_id = String(b.poll_id || "");
    const { data: p } = await admin.from("kindle_poll").select("id,options,multi,closes_at,created_by").eq("id", poll_id).maybeSingle();
    if (!p) throw new HttpError(404, "No such poll.");
    const mayManage = isKindleAdmin(k) || p.created_by === k.id;
    if (action === "vote") {
      if (p.closes_at && new Date(String(p.closes_at)).getTime() < Date.now()) throw new HttpError(409, "This poll has closed.");
      const choices = [...new Set((Array.isArray(b.choices) ? b.choices : []).map((c) => Number(c)).filter((c) => Number.isInteger(c) && c >= 0 && c < (p.options as string[]).length))];
      if (!choices.length) throw new HttpError(400, "Pick an option.");
      if (!p.multi && choices.length > 1) throw new HttpError(400, "One option on this poll.");
      const { error } = await admin.from("kindle_poll_vote").upsert({ poll_id, member_id: k.id, choices, voted_at: new Date().toISOString() }, { onConflict: "poll_id,member_id" });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (action === "close") {
      if (!mayManage) throw new HttpError(403, "The asker or the facilitator closes a poll.");
      await admin.from("kindle_poll").update({ closes_at: new Date().toISOString() }).eq("id", poll_id);
      await kindleAudit(k, "poll_closed", { id: poll_id });
      return NextResponse.json({ ok: true });
    }
    if (action === "remove") {
      if (!mayManage) throw new HttpError(403, "The asker or the facilitator removes a poll.");
      const { count } = await admin.from("kindle_poll_vote").select("member_id", { count: "exact", head: true }).eq("poll_id", poll_id);
      if (count && !isKindleAdmin(k)) throw new HttpError(409, "Votes are in; close it instead.");
      await admin.from("kindle_poll").delete().eq("id", poll_id);
      await kindleAudit(k, "poll_removed", { id: poll_id });
      return NextResponse.json({ ok: true });
    }
    throw new HttpError(400, "Unknown action.");
  } catch (e) { return errJson(e); }
}
