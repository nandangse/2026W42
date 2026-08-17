import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireUser, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/lms/plan — Genie writes this person's Learning Plan, and puts the
 * lessons it recommends onto their plan as Planned.
 *
 * What it is given: who they are, what the library holds, and what they have
 * already done. What it may do: write a plan in plain words and choose lessons
 * BY ID from the list it was given. It cannot invent a lesson — the ids are
 * checked against the library before anything is written, so a hallucinated
 * course can never appear on somebody's plan.
 *
 * Needs ANTHROPIC_API_KEY, the same key as Genie Hint and Eva. Without it the
 * route says exactly that and changes nothing.
 */

const SYSTEM = `You write the Individual Learning Plan for an employee of NANDAN GSE, an Indian
manufacturer of ground support equipment for aviation, material handling and defence.

You are writing to the person, not about them. Second person, Indian business English,
plain and direct. No flattery, no filler, no headings inside the text.

Rules:
- Use ONLY the facts given: their role, their department, what they have already completed,
  and the lessons in the library list. Never invent a course, a book or a skill they have.
- The plan is 3 short paragraphs at most. Say what this person should be building towards
  this year and WHY, given their role — then what to start with.
- Recommend between 4 and 10 lessons, chosen from the library list by id. Never repeat a
  lesson they have already completed. Prefer lessons that suit their role and department;
  where the library is thin for their role, say so plainly rather than padding the list.
- Safety and the employee handbook come first for anybody who has not done them.
- The rationale is one sentence per recommended lesson, saying why THAT lesson for THIS
  person. Never generic.`;

const SCHEMA = {
  type: "object",
  properties: {
    plan: {
      type: "string",
      description: "The learning plan, written to the person. At most 3 short paragraphs.",
    },
    lesson_ids: {
      type: "array",
      items: { type: "string" },
      description: "4-10 lesson ids taken from the library list. Never one they have completed.",
    },
    rationale: {
      type: "string",
      description: "One sentence per recommended lesson, saying why that lesson for this person.",
    },
  },
  required: ["plan", "lesson_ids", "rationale"],
  additionalProperties: false,
};

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const admin = adminClient();
    const body = await req.json().catch(() => ({}));

    // A plan is written for yourself. A manager wanting one for somebody else
    // is a different feature with a different conversation attached to it.
    if (body.person && body.person !== user.id)
      throw new HttpError(403, "A learning plan is written for yourself");

    if (!process.env.ANTHROPIC_API_KEY)
      return NextResponse.json(
        {
          error:
            "The learning plan needs an ANTHROPIC_API_KEY on the server. Add it to the Vercel " +
            "project's Environment Variables and redeploy — every other part of Learning works without it.",
          config: true,
        },
        { status: 503 },
      );

    const [profRes, deptRes, bookRes, lessonRes, shelfRes, progRes, kraRes] = await Promise.all([
      admin.from("profiles").select("display_name,email,designation,department_id,role").eq("id", user.id).maybeSingle(),
      admin.from("departments").select("id,name"),
      admin.from("lms_book").select("id,name,blurb").eq("active", true).order("sort_order"),
      admin.from("lms_lesson").select("id,title,description,minutes").eq("active", true),
      admin.from("lms_lesson_book").select("lesson_id,book_id"),
      admin.from("lms_progress").select("lesson_id,status,learning").eq("person_id", user.id),
      admin.from("kra").select("title").eq("person_id", user.id).eq("active", true),
    ]);

    const prof = profRes.data;
    const deptName = (deptRes.data || []).find((d) => d.id === prof?.department_id)?.name || "not recorded";
    const lessons = lessonRes.data || [];
    if (!lessons.length)
      return NextResponse.json(
        { error: "There are no lessons in the library yet, so there is nothing to plan. Add some first." },
        { status: 400 },
      );

    const booksOf = new Map<string, string[]>();
    for (const s of shelfRes.data || []) {
      const list = booksOf.get(s.lesson_id) || [];
      list.push(s.book_id);
      booksOf.set(s.lesson_id, list);
    }
    const bookName = new Map((bookRes.data || []).map((b) => [b.id, b.name]));

    const done = new Set((progRes.data || []).filter((p) => p.status === "completed").map((p) => p.lesson_id));
    const started = new Set((progRes.data || []).filter((p) => p.status !== "completed").map((p) => p.lesson_id));

    const library = lessons
      .map(
        (l) =>
          `${l.id} | ${l.title} | ${(booksOf.get(l.id) || []).map((b) => bookName.get(b) || b).join(", ") || "not shelved"} | ${l.minutes || "?"} min | ${
            done.has(l.id) ? "ALREADY COMPLETED" : started.has(l.id) ? "already on their plan" : "not started"
          }${l.description ? ` | ${String(l.description).replace(/\s+/g, " ").slice(0, 160)}` : ""}`,
      )
      .join("\n");

    const facts = `THE PERSON
Name: ${prof?.display_name || prof?.email || "not recorded"}
Designation: ${prof?.designation || "not recorded"}
Department: ${deptName}
Key result areas: ${(kraRes.data || []).map((k) => k.title).join("; ") || "none recorded"}

WHAT THEY HAVE ALREADY DONE
Completed: ${done.size} lesson${done.size === 1 ? "" : "s"}
${
  (progRes.data || [])
    .filter((p) => p.status === "completed")
    .map((p) => `- ${lessons.find((l) => l.id === p.lesson_id)?.title || p.lesson_id}`)
    .join("\n") || "- nothing yet"
}

THE BOOKS
${(bookRes.data || []).map((b) => `- ${b.name}${b.blurb ? `: ${b.blurb}` : ""}`).join("\n")}

THE LIBRARY (id | title | books | length | their state | description)
${library}`;

    const anthropic = new Anthropic();
    const response = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 4000,
      system: SYSTEM,
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: `Write this person's learning plan.\n\n${facts}` }],
    });

    if (response.stop_reason === "refusal")
      return NextResponse.json({ error: "The plan was declined — pick lessons from the books yourself." }, { status: 422 });

    const text = response.content.find((b) => b.type === "text")?.text || "";
    let out: { plan?: string; lesson_ids?: unknown; rationale?: string };
    try {
      out = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "Could not read the plan that came back — try again." }, { status: 502 });
    }

    // Every id checked against the real library, and anything already finished
    // dropped. A plan is allowed to be wrong about what suits somebody; it is
    // not allowed to put a lesson that does not exist on their record.
    const real = new Set(lessons.map((l) => l.id));
    const picked = (Array.isArray(out.lesson_ids) ? out.lesson_ids : [])
      .map((x) => String(x))
      .filter((id) => real.has(id) && !done.has(id))
      .slice(0, 12);

    const plan = String(out.plan || "").trim();
    const rationale = String(out.rationale || "").trim();

    await admin.from("lms_plan").upsert({
      person_id: user.id,
      plan,
      rationale,
      generated_at: new Date().toISOString(),
      generated_by: "Genie",
    });

    if (picked.length) {
      await admin.from("lms_progress").upsert(
        picked.map((id) => ({
          person_id: user.id, lesson_id: id, status: "planned" as const,
          planned_by: "Genie", updated_at: new Date().toISOString(),
        })),
        // never knock a lesson already under way back to planned
        { onConflict: "person_id,lesson_id", ignoreDuplicates: true },
      );
    }

    return NextResponse.json({
      ok: true,
      plan,
      rationale,
      planned: picked.length,
      // said out loud, because a model naming lessons that do not exist is the
      // failure this route is built to make visible
      dropped: (Array.isArray(out.lesson_ids) ? out.lesson_ids.length : 0) - picked.length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/lms_/.test(msg) && /does not exist|schema cache/i.test(msg))
      return NextResponse.json({ error: "The Learning section is not installed — run migration 0027." }, { status: 503 });
    console.error("Learning plan failed", e);
    return errJson(e);
  }
}
