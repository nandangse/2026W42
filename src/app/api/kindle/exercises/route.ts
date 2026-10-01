import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { errJson, HttpError } from "@/lib/auth";
import { isKindleAdmin, kindleAudit, requireKindler } from "@/lib/kindle/auth";

export const dynamic = "force-dynamic";

/**
 * Exercises (Dr Raghu, 1 Oct 2026: "exercises that Valay can maybe create
 * and put in, and we can just go and say, take that exercise"). A member
 * writes the questions; the others answer; answers are per person, and a
 * member may keep his own private.
 * GET → exercises with answer counts and my answer
 * POST create { title, intro, questions:[{label, help}], due_on }   — any member
 *      edit   { id, …same, open }                                  — the author or facilitator
 *      answer { id, answers:{qid: text}, private }                  — mine
 *      remove { id }                                                — author or facilitator
 */
export async function GET(req: Request) {
  try {
    const k = await requireKindler();
    const admin = adminClient();
    const one = new URL(req.url).searchParams.get("id");
    if (one) {
      const { data: ex } = await admin.from("kindle_exercise").select("id,title,intro,questions,created_by,open,due_on,created_at").eq("id", one).maybeSingle();
      if (!ex) throw new HttpError(404, "No such exercise.");
      const { data: ans } = await admin.from("kindle_exercise_answer").select("member_id,answers,private,submitted_at").eq("exercise_id", one);
      const rows = (ans || []).filter((a) => !a.private || a.member_id === k.id || isKindleAdmin(k) || ex.created_by === k.id);
      return NextResponse.json({ exercise: ex, answers: rows, mine: (ans || []).find((a) => a.member_id === k.id) || null });
    }
    const [{ data: exs, error }, { data: ans }] = await Promise.all([
      admin.from("kindle_exercise").select("id,title,intro,questions,created_by,open,due_on,created_at").order("created_at", { ascending: false }),
      admin.from("kindle_exercise_answer").select("exercise_id,member_id"),
    ]);
    if (error) throw error;
    return NextResponse.json({ exercises: (exs || []).map((e) => ({ ...e, answered: (ans || []).filter((a) => a.exercise_id === e.id).length, mine: (ans || []).some((a) => a.exercise_id === e.id && a.member_id === k.id) })) });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const k = await requireKindler();
    const admin = adminClient();
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(b.action || "");
    const qs = () => (Array.isArray(b.questions) ? b.questions : []).map((q, i) => { const o = q as Record<string, unknown>; return { id: String(o.id || `q${i + 1}`), label: String(o.label || "").trim(), help: String(o.help || "").trim() || null, rows: Number(o.rows) || 4 }; }).filter((q) => q.label);
    if (action === "create") {
      const title = String(b.title || "").trim(); const questions = qs();
      if (!title || !questions.length) throw new HttpError(400, "A title and at least one question.");
      const { data, error } = await admin.from("kindle_exercise").insert({ title, intro: String(b.intro || "").trim() || null, questions, created_by: k.id, due_on: b.due_on ? String(b.due_on) : null }).select("id").single();
      if (error) throw error;
      await kindleAudit(k, "exercise_created", { id: data.id });
      return NextResponse.json({ ok: true, id: data.id });
    }
    const id = String(b.id || "");
    const { data: ex } = await admin.from("kindle_exercise").select("id,created_by,open").eq("id", id).maybeSingle();
    if (!ex) throw new HttpError(404, "No such exercise.");
    const owner = ex.created_by === k.id || isKindleAdmin(k);
    if (action === "edit") {
      if (!owner) throw new HttpError(403, "The author or the facilitator.");
      const patch: Record<string, unknown> = {};
      if ("title" in b) patch.title = String(b.title || "").trim();
      if ("intro" in b) patch.intro = String(b.intro || "").trim() || null;
      if ("questions" in b) patch.questions = qs();
      if ("open" in b) patch.open = !!b.open;
      if ("due_on" in b) patch.due_on = b.due_on ? String(b.due_on) : null;
      await admin.from("kindle_exercise").update(patch).eq("id", id);
      return NextResponse.json({ ok: true });
    }
    if (action === "answer") {
      if (!ex.open) throw new HttpError(409, "This exercise is closed.");
      const answers = (b.answers && typeof b.answers === "object" ? b.answers : {}) as Record<string, unknown>;
      const clean: Record<string, string> = {}; for (const [q, v] of Object.entries(answers)) if (String(v || "").trim()) clean[q] = String(v).trim();
      const { error } = await admin.from("kindle_exercise_answer").upsert({ exercise_id: id, member_id: k.id, answers: clean, private: !!b.private, submitted_at: new Date().toISOString() }, { onConflict: "exercise_id,member_id" });
      if (error) throw error;
      await kindleAudit(k, "exercise_answered", { id });
      return NextResponse.json({ ok: true });
    }
    if (action === "remove") {
      if (!owner) throw new HttpError(403, "The author or the facilitator.");
      await admin.from("kindle_exercise").delete().eq("id", id);
      return NextResponse.json({ ok: true });
    }
    throw new HttpError(400, "Unknown action.");
  } catch (e) { return errJson(e); }
}
