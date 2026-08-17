import { NextResponse } from "next/server";
import { requireUser, requireAdmin, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { teamOf } from "@/lib/team";
import { MIN_LEARNING_WORDS, wordCount, type LessonStatus } from "@/lib/lms";
import { today } from "@/lib/schedule";

export const dynamic = "force-dynamic";

/** 0027 has not been pasted yet — the section says so rather than erroring. */
const NOT_INSTALLED = /lms_book|lms_lesson|lms_progress|lms_plan|lms_extra|does not exist|schema cache/i;

const VALID_STATUS: LessonStatus[] = ["planned", "in_progress", "completed"];

/**
 * GET /api/lms[?person=<id>] — the whole section in one payload.
 *
 * The library is small and shared by everybody, so it comes down whole and
 * every view of it is computed in memory. `person` lets a manager read one of
 * their own team's records; it is checked against the recursive reports_to
 * walk, never taken on trust from the query string.
 */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const admin = adminClient();
    const asked = new URL(req.url).searchParams.get("person");

    const [bookRes, secRes, lessonRes, shelfRes, profRes] = await Promise.all([
      admin.from("lms_book").select("*").eq("active", true).order("sort_order"),
      admin.from("lms_section").select("*").order("sort_order"),
      admin.from("lms_lesson").select("*").eq("active", true).order("title"),
      admin.from("lms_lesson_book").select("*"),
      admin.from("profiles").select("id,email,display_name,initials,designation,department_id,reports_to,disabled"),
    ]);
    const firstErr = bookRes.error || secRes.error || lessonRes.error || shelfRes.error || profRes.error;
    if (firstErr) throw new Error(firstErr.message);

    const people = (profRes.data || []).filter((p) => !p.disabled);
    const team = teamOf(people, user.id);
    const teamIds = new Set(team.map((m) => m.id));
    const isAdmin = user.role === "admin" || user.isOwner;

    // Whose record is being read. Yours always; your team's if they are under
    // you; anybody's if you are an admin. Anything else is a 403 rather than a
    // quiet fallback to your own — a page that silently shows the wrong
    // person's training record is worse than one that refuses.
    let personId = user.id;
    if (asked && asked !== user.id) {
      if (!isAdmin && !teamIds.has(asked)) throw new HttpError(403, "That is not your record to read");
      personId = asked;
    }

    const [progRes, extraRes, planRes] = await Promise.all([
      admin.from("lms_progress").select("*").eq("person_id", personId),
      admin.from("lms_extra").select("*").eq("person_id", personId).order("on_date", { ascending: false }),
      admin.from("lms_plan").select("*").eq("person_id", personId).maybeSingle(),
    ]);
    if (progRes.error || extraRes.error) throw new Error((progRes.error || extraRes.error)!.message);

    const shelvesByLesson = new Map<string, { book_id: string; section_id: string | null; sort_order: number }[]>();
    for (const s of shelfRes.data || []) {
      const list = shelvesByLesson.get(s.lesson_id) || [];
      list.push({ book_id: s.book_id, section_id: s.section_id, sort_order: s.sort_order ?? 0 });
      shelvesByLesson.set(s.lesson_id, list);
    }

    return NextResponse.json({
      installed: true,
      me: { id: user.id, name: user.displayName || user.email.split("@")[0], isAdmin },
      person: personId,
      books: bookRes.data || [],
      sections: secRes.data || [],
      lessons: (lessonRes.data || []).map((l) => ({ ...l, shelves: shelvesByLesson.get(l.id) || [] })),
      progress: progRes.data || [],
      extras: extraRes.data || [],
      plan: planRes.data ?? null,
      // the cascade, so a manager can look down their line at who has learned what
      team: team.map((m) => {
        const p = people.find((x) => x.id === m.id);
        return { id: m.id, depth: m.depth, name: p?.display_name || p?.email || m.id, designation: p?.designation ?? null };
      }),
      canAuthor: isAdmin,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (NOT_INSTALLED.test(msg)) return NextResponse.json({ installed: false, message: msg });
    return errJson(e);
  }
}

const str = (v: unknown, max = 20000) => String(v ?? "").slice(0, max);
const int = (v: unknown) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const admin = adminClient();
    const body = await req.json();
    const action = String(body.action || "");
    const isAdmin = user.role === "admin" || user.isOwner;
    const needAuthor = () => {
      if (!isAdmin) throw new HttpError(403, "Only an admin may change the library");
    };

    // ===================== a person's own record =========================
    if (action === "progress.save") {
      const lessonId = str(body.lesson_id, 64);
      if (!lessonId) throw new HttpError(400, "lesson_id is required");
      const status = String(body.status || "planned") as LessonStatus;
      if (!VALID_STATUS.includes(status)) throw new HttpError(400, "Unknown status");
      const learning = str(body.learning, 20000);

      /**
       * The fifty words, enforced here rather than only in the browser.
       *
       * This is the one rule the whole section rests on: a completion with
       * nothing written is a tick, and a tick is not learning. The message
       * says how far short they are, because "invalid" would just be annoying.
       */
      if (status === "completed") {
        const n = wordCount(learning);
        if (n < MIN_LEARNING_WORDS)
          throw new HttpError(
            400,
            `Write what you took from this lesson before marking it complete — at least ${MIN_LEARNING_WORDS} words, and you have ${n}.`,
          );
      }

      const row = {
        person_id: user.id,
        lesson_id: lessonId,
        status,
        learning,
        minutes: int(body.minutes),
        // The date is stamped when it is finished and cleared when it is
        // re-opened, so it can never claim a completion that was undone.
        completed_on: status === "completed" ? str(body.completed_on, 10) || today() : null,
        planned_by: str(body.planned_by, 60) || "self",
        updated_at: new Date().toISOString(),
      };
      const { error } = await admin.from("lms_progress").upsert(row, { onConflict: "person_id,lesson_id" });
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "progress.plan") {
      // put a lesson (or several) on my own plan
      const ids: string[] = Array.isArray(body.lesson_ids) ? body.lesson_ids.map((x: unknown) => str(x, 64)) : [];
      if (!ids.length) throw new HttpError(400, "Nothing to plan");
      const { error } = await admin.from("lms_progress").upsert(
        ids.map((id) => ({
          person_id: user.id, lesson_id: id, status: "planned" as const,
          planned_by: str(body.planned_by, 60) || "self", updated_at: new Date().toISOString(),
        })),
        // ignoreDuplicates: a lesson already started must not be knocked back
        // to planned by somebody adding it to a list again
        { onConflict: "person_id,lesson_id", ignoreDuplicates: true },
      );
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, planned: ids.length });
    }

    if (action === "progress.remove") {
      const lessonId = str(body.lesson_id, 64);
      const { error } = await admin.from("lms_progress").delete().eq("person_id", user.id).eq("lesson_id", lessonId);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "extra.add") {
      const title = str(body.title, 300).trim();
      if (!title) throw new HttpError(400, "What was the training called?");
      const { error } = await admin.from("lms_extra").insert({
        person_id: user.id,
        title,
        provider: str(body.provider, 200) || null,
        on_date: str(body.on_date, 10) || null,
        minutes: int(body.minutes),
        learning: str(body.learning, 20000),
      });
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "extra.delete") {
      // scoped to the caller: nobody deletes somebody else's record
      const { error } = await admin.from("lms_extra").delete().eq("id", str(body.id, 64)).eq("person_id", user.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    // ===================== the library (admins) ==========================
    if (action === "lesson.save") {
      needAuthor();
      const id = str(body.id, 64) || null;
      const patch = {
        title: str(body.title, 300).trim(),
        content: str(body.content),
        description: str(body.description),
        pdf_url: str(body.pdf_url, 2000) || null,
        video_url: str(body.video_url, 2000) || null,
        minutes: int(body.minutes),
        updated_at: new Date().toISOString(),
      };
      if (!patch.title) throw new HttpError(400, "A lesson needs a title");

      let lessonId = id;
      if (id) {
        const { error } = await admin.from("lms_lesson").update(patch).eq("id", id);
        if (error) throw new Error(error.message);
      } else {
        const { data, error } = await admin
          .from("lms_lesson")
          .insert({ ...patch, created_by: user.id })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        lessonId = data.id;
      }

      // Shelves are replaced wholesale — the editor sends the full set, and a
      // lesson removed from a book must actually leave it.
      if (Array.isArray(body.shelves)) {
        await admin.from("lms_lesson_book").delete().eq("lesson_id", lessonId);
        const rows = (body.shelves as { book_id: string; section_id?: string | null }[])
          .filter((s) => s && s.book_id)
          .map((s, i) => ({
            lesson_id: lessonId,
            book_id: str(s.book_id, 64),
            section_id: s.section_id ? str(s.section_id, 64) : null,
            sort_order: i,
          }));
        if (rows.length) {
          const { error } = await admin.from("lms_lesson_book").insert(rows);
          if (error) throw new Error(error.message);
        }
      }
      return NextResponse.json({ ok: true, id: lessonId });
    }

    if (action === "lesson.move") {
      // move a lesson into a section of a book it is already shelved in
      needAuthor();
      const { error } = await admin
        .from("lms_lesson_book")
        .update({ section_id: str(body.section_id, 64) || null })
        .eq("lesson_id", str(body.lesson_id, 64))
        .eq("book_id", str(body.book_id, 64));
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "lesson.retire") {
      // never deleted: somebody's completion and their fifty words hang off it
      needAuthor();
      const { error } = await admin.from("lms_lesson").update({ active: false }).eq("id", str(body.id, 64));
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "section.save") {
      needAuthor();
      const name = str(body.name, 200).trim();
      if (!name) throw new HttpError(400, "A section needs a name");
      if (body.id) {
        const { error } = await admin.from("lms_section").update({ name, sort_order: int(body.sort_order) }).eq("id", str(body.id, 64));
        if (error) throw new Error(error.message);
      } else {
        const { error } = await admin.from("lms_section").insert({ book_id: str(body.book_id, 64), name, sort_order: int(body.sort_order) });
        if (error) throw new Error(error.message);
      }
      return NextResponse.json({ ok: true });
    }

    if (action === "section.delete") {
      needAuthor();
      // the lessons stay in the book; they simply fall loose, which is a real
      // state rather than a loss
      const { error } = await admin.from("lms_section").delete().eq("id", str(body.id, 64));
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "book.save") {
      await requireAdmin();
      const id = str(body.id, 64).trim();
      if (!id) throw new HttpError(400, "A book needs an id");
      const { error } = await admin.from("lms_book").upsert({
        id,
        name: str(body.name, 200).trim() || id,
        blurb: str(body.blurb, 600) || null,
        icon: str(body.icon, 8) || null,
        color: str(body.color, 20) || "#1B3A5C",
        sort_order: int(body.sort_order),
        active: body.active !== false,
      });
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    throw new HttpError(400, `Unknown action "${action}"`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (NOT_INSTALLED.test(msg))
      return NextResponse.json({ error: "The Learning section is not installed — run migration 0027." }, { status: 503 });
    return errJson(e);
  }
}
