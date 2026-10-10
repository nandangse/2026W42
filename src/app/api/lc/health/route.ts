import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { readBody } from "@/lib/validate";
import { requireCouncilOwner, requireLeader } from "@/lib/lc/auth";
import { MIN_ANSWERS, ROCKEFELLER, TICKS } from "@/lib/lc/rockefeller";

export const dynamic = "force-dynamic";

/**
 * Health Check — the Rockefeller Habits Checklist, answered anonymously
 * (Dr Raghu, 10 Oct 2026: "let them fill it out … we will reach a certain
 * score. The answers will be anonymous. Be very clear on that.")
 *
 * HOW IT IS ANONYMOUS: an answer row is the round and forty ticks, nothing
 * else. Who has answered is a separate table that holds no answer. Nothing
 * joins the two. A round's result is shown only once MIN_ANSWERS have
 * answered — to the owner as well — and is only ever an average.
 *
 *   GET      → rounds, the open round, whether I have answered it, the
 *              results per round (when there are enough answers)
 *   POST open { label }  · close { id }  — the owner
 *        answer { round_id, ticks: boolean[40] }  — any leader, once a round
 */
export async function GET() {
  try {
    const u = await requireLeader();
    const admin = adminClient();
    const [{ data: rounds, error }, { data: answers }, { data: done }] = await Promise.all([
      admin.from("lc_health_round").select("*").order("opened_on", { ascending: false }),
      admin.from("lc_health_answer").select("round_id,ticks"),
      admin.from("lc_health_done").select("round_id,email"),
    ]);
    if (error) throw error;
    const me = u.email.toLowerCase();
    const out = (rounds || []).map((r) => {
      const as = (answers || []).filter((a) => a.round_id === r.id);
      const n = as.length;
      let result: null | { overall: number; habits: { n: number; score: number; items: number[] }[] } = null;
      if (n >= MIN_ANSWERS) {
        let k = 0;
        const habits = ROCKEFELLER.map((h) => {
          const items = h.items.map(() => { const i = k++; return Math.round((as.filter((a) => a.ticks[i]).length / n) * 100); });
          return { n: h.n, score: Math.round(items.reduce((s, x) => s + x, 0) / items.length), items };
        });
        const overall = Math.round(as.reduce((s, a) => s + a.ticks.filter(Boolean).length, 0) / (n * TICKS) * 100);
        result = { overall, habits };
      }
      return { ...r, answered: n, answeredBy: (done || []).filter((d) => d.round_id === r.id).length, mine: (done || []).some((d) => d.round_id === r.id && d.email === me), result };
    });
    return NextResponse.json({ rounds: out, minAnswers: MIN_ANSWERS, ticks: TICKS });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const b = await readBody(req, { action: "string" });
    const admin = adminClient();
    if (b.action === "open") {
      const u = await requireCouncilOwner();
      const label = String(b.label || "").trim(); if (!label) throw new HttpError(400, "Name the round — the quarter.");
      await admin.from("lc_health_round").update({ closed_on: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) }).is("closed_on", null);
      const { data, error } = await admin.from("lc_health_round").insert({ label, created_by: u.email }).select("id").single();
      if (error) throw error;
      return NextResponse.json({ ok: true, id: data.id });
    }
    if (b.action === "close") {
      await requireCouncilOwner();
      await admin.from("lc_health_round").update({ closed_on: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) }).eq("id", String(b.id || ""));
      return NextResponse.json({ ok: true });
    }
    if (b.action === "answer") {
      const u = await requireLeader();
      const round_id = String(b.round_id || "");
      const { data: r } = await admin.from("lc_health_round").select("id,closed_on").eq("id", round_id).maybeSingle();
      if (!r) throw new HttpError(404, "No such round."); if (r.closed_on) throw new HttpError(400, "This round is closed.");
      const ticks = Array.isArray(b.ticks) ? b.ticks.map((x: unknown) => x === true) : [];
      if (ticks.length !== TICKS) throw new HttpError(400, `Forty answers — got ${ticks.length}.`);
      /* once per person per round: the "done" mark is written FIRST and its
         primary key refuses a second; only then is the nameless answer stored */
      const { error: dErr } = await admin.from("lc_health_done").insert({ round_id, email: u.email });
      if (dErr) throw new HttpError(409, "You have already answered this round. Thank you.");
      const { error } = await admin.from("lc_health_answer").insert({ round_id, ticks });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    throw new HttpError(400, "Unknown action.");
  } catch (e) { return errJson(e); }
}
