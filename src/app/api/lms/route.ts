import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { swallow } from "@/lib/swallow";
import { requireUser, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { teamOf } from "@/lib/team";
import { MIN_LEARNING_WORDS, wordCount, maySeeBook, LMS_GROUPS, type LessonStatus } from "@/lib/lms";
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
      /* Asked for tolerantly: before 0170 these two columns do not exist, and
         PostgREST refuses the whole select when one is unknown — which would
         empty the roster, the team cascade and every name on the screen. */
      admin.from("profiles").select("id,email,display_name,initials,designation,department_id,reports_to,disabled,lms_groups,lms_only")
        .then(async (r) => (r.error && /lms_groups|lms_only/.test(r.error.message)
          ? admin.from("profiles").select("id,email,display_name,initials,designation,department_id,reports_to,disabled")
          : r)),
    ]);
    const firstErr = bookRes.error || secRes.error || lessonRes.error || shelfRes.error || profRes.error;
    if (firstErr) throw new Error(firstErr.message);

    /* The two 0170 columns may not exist yet, so they are read off a widened
       shape rather than assumed present. Absent reads as "no groups, not a
       learner-only login" — which is what an un-migrated database means. */
    type Person = {
      id: string; email: string; display_name: string | null; initials: string | null;
      designation: string | null; department_id: string | null; reports_to: string | null; disabled: boolean;
      lms_groups?: string[] | null; lms_only?: boolean | null;
    };
    const people = ((profRes.data || []) as unknown as Person[]).filter((p) => !p.disabled);
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

    /**
     * THE SHELF IS CUT TO THE PERSON (Dr Raghu, 27 Sep 2026).
     *
     * Cut HERE, on the server, and not hidden in the browser: a library a
     * person may not see must not travel to their machine at all. Hiding a
     * row that was already sent is a curtain, not a wall.
     *
     * A lesson shelved only in libraries they cannot see goes with them —
     * otherwise a closed library leaks its contents through the open one.
     */
    const myGroups: string[] = (people.find((p) => p.id === personId)?.lms_groups as string[] | null) || [];
    const allBooks = bookRes.data || [];
    const books = allBooks.filter((b) => maySeeBook(b, myGroups, isAdmin));
    const visibleBookIds = new Set(books.map((b) => String(b.id)));
    const lessons = (lessonRes.data || [])
      .map((l) => ({ ...l, shelves: (shelvesByLesson.get(l.id) || []).filter((sh) => visibleBookIds.has(String(sh.book_id))) }))
      .filter((l) => l.shelves.length > 0);

    return NextResponse.json({
      installed: true,
      me: {
        id: user.id, name: user.displayName || user.email.split("@")[0], isAdmin,
        groups: (people.find((p) => p.id === user.id)?.lms_groups as string[] | null) || [],
        lmsOnly: !!people.find((p) => p.id === user.id)?.lms_only,
      },
      person: personId,
      groupNames: LMS_GROUPS,
      books,
      sections: secRes.data || [],
      lessons,
      progress: progRes.data || [],
      extras: extraRes.data || [],
      plan: planRes.data ?? null,
      // the cascade, so a manager can look down their line at who has learned what
      team: team.map((m) => {
        const p = people.find((x) => x.id === m.id);
        return { id: m.id, depth: m.depth, name: p?.display_name || p?.email || m.id, designation: p?.designation ?? null };
      }),
      canAuthor: isAdmin,
      /* Who is in which group — only an admin is shown it, because only an
         admin can change it, and a list of everybody's training groups is
         nobody else's to read. */
      roster: isAdmin
        ? people.map((p) => ({
            id: p.id, email: p.email, name: p.display_name || p.email,
            groups: (p.lms_groups as string[] | null) || [], lmsOnly: !!p.lms_only,
          })).sort((a, b) => String(a.name).localeCompare(String(b.name)))
        : [],
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
    const body = await readBody(req, {});
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

      // every lesson wears a 4-DIGIT CODE — its URL, /lms/<code> (0101).
      // Random, checked against the taken set, stable once given.
      const freshCode = async (): Promise<string | null> => {
        try {
          const { data: taken } = await admin.from("lms_lesson").select("code").not("code", "is", null).limit(10000);
          const have = new Set((taken || []).map((x) => String(x.code)));
          for (let a = 0; a < 60; a++) {
            const c = String(1000 + Math.floor(Math.random() * 9000));
            if (!have.has(c)) return c;
          }
        } catch (e) { swallow("lms", e); /* pre-0101 — the column waits */ }
        return null;
      };

      let lessonId = id;
      if (id) {
        const { error } = await admin.from("lms_lesson").update(patch).eq("id", id);
        if (error) throw new Error(error.message);
        // an old lesson without a code earns one on its next save
        const { data: cur } = await admin.from("lms_lesson").select("code").eq("id", id).maybeSingle();
        if (cur && !cur.code) {
          const c = await freshCode();
          if (c) await admin.from("lms_lesson").update({ code: c }).eq("id", id);
        }
      } else {
        const code = await freshCode();
        const { data, error } = await admin
          .from("lms_lesson")
          .insert({ ...patch, ...(code ? { code } : {}), created_by: user.id })
          .select("id")
          .single();
        if (error) {
          if (/code/.test(error.message)) {
            const { data: d2, error: e2 } = await admin.from("lms_lesson")
              .insert({ ...patch, created_by: user.id }).select("id").single();
            if (e2) throw new Error(e2.message);
            lessonId = d2.id;
          } else throw new Error(error.message);
        } else lessonId = data.id;
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
      // needAuthor(), not requireAdmin(): the owner sits above the admin role
      // and a strict role check would lock him out of his own shelves.
      needAuthor();
      const name = str(body.name, 200).trim();
      // The id is a slug of the name for a new book, so nobody has to invent
      // one — but an id sent explicitly wins, because renaming a book must
      // never orphan the lessons shelved under its old id.
      const id = (str(body.id, 64).trim() || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")).slice(0, 64);
      if (!id) throw new HttpError(400, "A book needs a name");
      // the book's URL slug — two words max, dashed (0101): sent explicitly,
      // else derived from the last two significant words of the name
      const slugOf = (nm: string) => nm.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "").split(/\s+/)
        .filter((w) => w && !["the", "of", "and", "a", "an", "nandan", "trainings", "training"].includes(w))
        .slice(0, 2).join("-") || nm.toLowerCase().replace(/[^a-z0-9]+/g, "-").split("-").slice(0, 2).join("-");
      const slug = (str(body.slug, 60).trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "") || slugOf(name)).slice(0, 60) || null;
      const row: Record<string, unknown> = {
        id,
        name: str(body.name, 200).trim() || id,
        blurb: str(body.blurb, 600) || null,
        icon: str(body.icon, 8) || null,
        color: str(body.color, 20) || "#1B3A5C",
        sort_order: int(body.sort_order),
        active: body.active !== false,
        slug,
        /* Only names from the list get in. An audience holding a group that
           does not exist is a library nobody can open, and it would look
           exactly like one that is simply empty. */
        audience: Array.isArray(body.audience)
          ? (body.audience as unknown[]).map((g) => String(g)).filter((g) => (LMS_GROUPS as readonly string[]).includes(g))
          : [],
      };
      let { error } = await admin.from("lms_book").upsert(row);
      if (error && /slug/.test(error.message)) {
        delete row.slug;
        ({ error } = await admin.from("lms_book").upsert(row));
      }
      if (error && /audience/.test(error.message)) {
        delete row.audience;
        ({ error } = await admin.from("lms_book").upsert(row));
        if (!error) return NextResponse.json({ ok: true, warning: "Saved, but WITHOUT the audience — migration 0170 has not been run, so this library is still open to everybody." });
      }
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    /**
     * NOTES WHILE WATCHING (Dr Raghu, 27 Sep 2026: "Have a place to write
     * notes when seeing on mobile as well in laptop/tablet").
     *
     * Its own action and its own column, deliberately apart from the fifty
     * words. Notes are taken DURING, in fragments, and they are nobody's to
     * mark; the learning text is written AFTER, about what was taken, and it
     * is the thing the IDP is built from. Letting scribbles count towards the
     * floor would quietly end the only rule this module has.
     *
     * It never changes the lesson's status — writing a note is not progress.
     */
    if (action === "progress.notes") {
      const lessonId = str(body.lesson_id, 64);
      if (!lessonId) throw new HttpError(400, "lesson_id is required");
      const notes = str(body.notes, 20000);
      const { data: existing } = await admin.from("lms_progress")
        .select("lesson_id").eq("person_id", user.id).eq("lesson_id", lessonId).maybeSingle();
      const { error } = existing
        ? await admin.from("lms_progress").update({ notes }).eq("person_id", user.id).eq("lesson_id", lessonId)
        : await admin.from("lms_progress").insert({ person_id: user.id, lesson_id: lessonId, status: "in_progress", notes, learning: "", minutes: 0 });
      if (error) {
        if (/notes/.test(error.message)) throw new HttpError(503, "Notes need migration 0170 — it has not been run yet.");
        throw new Error(error.message);
      }
      return NextResponse.json({ ok: true });
    }

    /**
     * MOVE A LESSON FROM ONE LIBRARY TO ANOTHER (Dr Raghu, 27 Sep 2026:
     * "Move file from one library to other").
     *
     * A move, not a copy: the shelf row is repointed, so the lesson leaves
     * the old library as it joins the new one. Everybody's completions and
     * their fifty words hang off the LESSON, not off the shelf, so nothing
     * anybody has written is touched by moving where it sits.
     */
    if (action === "lesson.shelf") {
      needAuthor();
      const lessonId = str(body.lesson_id, 64);
      const from = str(body.from_book, 64);
      const to = str(body.to_book, 64);
      if (!lessonId || !from || !to) throw new HttpError(400, "lesson_id, from_book and to_book are required");
      if (from === to) return NextResponse.json({ ok: true, note: "It is already there." });
      /* Already shelved in the destination: drop the old row rather than
         inserting a duplicate that the shelf would show twice. */
      const { data: there } = await admin.from("lms_lesson_book")
        .select("lesson_id").eq("lesson_id", lessonId).eq("book_id", to).maybeSingle();
      if (there) {
        const { error } = await admin.from("lms_lesson_book").delete().eq("lesson_id", lessonId).eq("book_id", from);
        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true, note: "It was already in that library, so the old shelf was cleared." });
      }
      const { error } = await admin.from("lms_lesson_book")
        .update({ book_id: to, section_id: null }).eq("lesson_id", lessonId).eq("book_id", from);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    /**
     * WHICH GROUPS A PERSON IS IN, and whether the library is all they get.
     *
     * Dr Raghu, 27 Sep 2026: "can the LMS in the genie be given access to
     * other people as a standalone user."
     *
     * lms_only closes every other door rather than opening one. A consultant
     * given a login for the training library has no business seeing jobs,
     * salaries or the order book, and the safe way to write that is as a
     * restriction on the person, not as a permission on each module that
     * somebody has to remember to withhold.
     */
    if (action === "person.groups") {
      needAuthor();
      const id = str(body.person_id, 64);
      if (!id) throw new HttpError(400, "person_id is required");
      const groups = Array.isArray(body.groups)
        ? (body.groups as unknown[]).map((g) => String(g)).filter((g) => (LMS_GROUPS as readonly string[]).includes(g))
        : [];
      const patch: Record<string, unknown> = { lms_groups: groups };
      if (typeof body.lms_only === "boolean") {
        /* The owner cannot lock himself out of Genie by a mis-click. */
        if (body.lms_only && id === user.id) throw new HttpError(400, "That would close every other door on yourself.");
        patch.lms_only = body.lms_only;
      }
      const { error } = await admin.from("profiles").update(patch).eq("id", id);
      if (error) {
        if (/lms_groups|lms_only/.test(error.message)) throw new HttpError(503, "Groups need migration 0170 — it has not been run yet.");
        throw new Error(error.message);
      }
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
