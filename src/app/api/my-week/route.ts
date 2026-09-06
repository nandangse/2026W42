import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { requireUser, errJson, HttpError } from "@/lib/auth";
import { hrmsTables } from "@/lib/hrms";
import { adminClient } from "@/lib/supabase/admin";
import { today, addDays } from "@/lib/schedule";
import {
  PARTICIPATION_DAYS, LEARNING_DAYS, birthdaysWithin, pickAny, imageUrl,
  listDriveFolder, folderIdOf, type Mood,
} from "@/lib/my-week";

export const dynamic = "force-dynamic";

const VALID_MOODS: Mood[] = ["great", "good", "ok", "low", "rough"];

/**
 * When this instance last tried to read the Drive folder.
 *
 * Only consulted when the cache is EMPTY, so in normal running it is never
 * reached at all. It exists so that a folder which has been unshared does not
 * get scraped once per page load by every person in the works.
 */
let lastFolderTry = 0;
const FOLDER_RETRY_MS = 10 * 60 * 1000;

/** Every spelling of "me" a comment might have been signed with. */
function handlesOf(u: { initials: string | null; displayName: string | null; erpOwner: string | null; email: string }) {
  return new Set(
    [u.initials, u.displayName, u.erpOwner, u.email, u.email.split("@")[0]]
      .filter(Boolean)
      .map((v) => String(v).toLowerCase()),
  );
}

/**
 * GET /api/my-week — the parts of My Week that are not already on the board.
 *
 * Everything here is optional: any one query failing leaves its own card empty
 * rather than taking down the first page anybody sees in the morning. That is
 * why each block is caught separately instead of one try around the lot.
 */
export async function GET() {
  try {
    const user = await requireUser();
    const admin = adminClient();
    const T = today();
    const since = addDays(T, -PARTICIPATION_DAYS);
    const learnSince = addDays(T, -LEARNING_DAYS);

    const safe = async <T,>(fn: () => Promise<T>, fallback: T): Promise<T> => {
      try { return await fn(); } catch { return fallback; }
    };

    // ---- how's my day, and the run behind it ----
    const mood = await safe(async () => {
      const { data } = await admin
        .from("day_mood")
        .select("on_date, mood, note")
        .eq("person_id", user.id)
        .gte("on_date", since)
        .order("on_date", { ascending: false });
      const rows = data || [];
      return { today: rows.find((r) => r.on_date === T) ?? null, recent: rows };
    }, { today: null as { on_date: string; mood: string; note: string | null } | null, recent: [] as { on_date: string; mood: string; note: string | null }[] });

    // ---- learning, over ninety days ----
    const learning = await safe(async () => {
      const [{ data: prog }, { data: lessons }, { data: extras }] = await Promise.all([
        admin.from("lms_progress").select("lesson_id, status, completed_on, minutes").eq("person_id", user.id),
        admin.from("lms_lesson").select("id, title, minutes, video_url, pdf_url, description").eq("active", true),
        admin.from("lms_extra").select("minutes, on_date").eq("person_id", user.id).gte("on_date", learnSince),
      ]);
      const byId = new Map((lessons || []).map((l) => [l.id, l]));
      const done90 = (prog || []).filter((p) => p.status === "completed" && p.completed_on && p.completed_on >= learnSince);
      const minutes =
        done90.reduce((s, p) => s + (p.minutes || byId.get(p.lesson_id)?.minutes || 0), 0) +
        (extras || []).reduce((s, e) => s + (Number(e.minutes) || 0), 0);

      // the one lesson to put in front of them: whatever is already under way,
      // else whatever is planned, else nothing — never a lesson they finished
      const openRow =
        (prog || []).find((p) => p.status === "in_progress" && byId.has(p.lesson_id)) ||
        (prog || []).find((p) => p.status === "planned" && byId.has(p.lesson_id));
      const next = openRow ? byId.get(openRow.lesson_id) : null;

      return {
        minutes,
        completed: done90.length,
        extras: (extras || []).length,
        next: next ? { ...next, status: openRow?.status ?? "planned" } : null,
        installed: true,
      };
    }, { minutes: 0, completed: 0, extras: 0, next: null as Record<string, unknown> | null, installed: false });

    // ---- participation: days engaged, not actions counted ----
    const handles = handlesOf(user);
    const participation = await safe(async () => {
      const days = new Set<string>();
      const [moods, done, tc, gc, bd] = await Promise.all([
        admin.from("day_mood").select("on_date").eq("person_id", user.id).gte("on_date", since),
        admin.from("lms_progress").select("completed_on").eq("person_id", user.id).eq("status", "completed").gte("completed_on", since),
        admin.from("task_comments").select("by, at").gte("at", since),
        admin.from("goal_item_comment").select("by, at").gte("at", since),
        admin.from("brain_dump").select("created_at").eq("user_id", user.id).gte("created_at", since),
      ]);
      for (const r of moods.data || []) days.add(r.on_date);
      for (const r of done.data || []) if (r.completed_on) days.add(r.completed_on);
      for (const r of tc.data || []) if (handles.has(String(r.by || "").toLowerCase())) days.add(String(r.at).slice(0, 10));
      for (const r of gc.data || []) if (handles.has(String(r.by || "").toLowerCase())) days.add(String(r.at).slice(0, 10));
      for (const r of bd.data || []) days.add(String(r.created_at).slice(0, 10));
      return { days: days.size, of: PARTICIPATION_DAYS };
    }, { days: 0, of: PARTICIPATION_DAYS });

    // ---- birthdays, next seven days ----
    const birthdays = await safe(async () => {
      const { data } = await admin
        .from((await hrmsTables(admin)).employees)
        .select("id, name, dob, department")
        .eq("active", true)
        .not("dob", "is", null);
      return birthdaysWithin(
        (data || []).map((e) => ({ id: e.id, name: e.name, dob: e.dob, department: e.department })),
        T,
        7,
      );
    }, []);

    // ---- the image quote of the day ----
    const image = await safe(async () => {
      const read = async () =>
        (await admin.from("image_quote").select("id, url, caption").eq("active", true).order("sort_order").order("created_at")).data || [];

      let rows = await read();
      // Nothing cached yet: fill it from the configured folder rather than
      // showing an empty panel and expecting somebody to find the button in
      // Admin. Once. The throttle is there so an unreachable folder is not
      // re-fetched on every page load by every person in the works.
      if (!rows.length && Date.now() - lastFolderTry > FOLDER_RETRY_MS) {
        lastFolderTry = Date.now();
        const { data: st } = await admin.from("app_settings").select("quote_folder").eq("id", true).maybeSingle();
        const folder = folderIdOf(st?.quote_folder);
        if (folder) {
          const ids = await listDriveFolder(folder);
          if (ids.length) {
            await admin.from("image_quote").insert(
              ids.map((i, n) => ({ url: `https://drive.google.com/file/d/${i}/view`, sort_order: n })),
            );
            rows = await read();
          }
        }
      }
      // a different picture on every load, not one a day
      const i = pickAny(rows.length);
      if (i < 0) return null;
      // the row's own url is kept alongside, so Admin can show what was pasted
      return { ...rows[i], src: imageUrl(rows[i].url), of: rows.length };
    }, null as { id: string; url: string; caption: string | null; src: string | null; of: number } | null);

    return NextResponse.json({ today: T, mood, learning, participation, birthdays, image });
  } catch (e) {
    return errJson(e);
  }
}

/** POST /api/my-week — { action: "mood", mood, note? } */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await readBody(req, {});
    if (String(body.action || "") !== "mood") throw new HttpError(400, "Unknown action");
    const mood = String(body.mood || "") as Mood;
    if (!VALID_MOODS.includes(mood)) throw new HttpError(400, "That is not one of the five");

    const { error } = await adminClient().from("day_mood").upsert(
      {
        person_id: user.id,
        on_date: today(),
        mood,
        note: String(body.note ?? "").slice(0, 500) || null,
        updated_at: new Date().toISOString(),
      },
      // answering again the same day CHANGES the answer; a day has one mood
      { onConflict: "person_id,on_date" },
    );
    if (error) {
      if (/day_mood|does not exist|schema cache/i.test(error.message))
        return NextResponse.json({ error: "Run migration 0029 first — How's my day has nowhere to save yet." }, { status: 503 });
      throw new Error(error.message);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errJson(e);
  }
}
