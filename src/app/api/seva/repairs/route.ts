import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireSeva } from "@/lib/seva";
import { adminClient } from "@/lib/supabase/admin";
import { mayPlan } from "@/lib/seva-team";
import { parseVideo } from "@/lib/lms";

export const dynamic = "force-dynamic";

/**
 * /api/seva/repairs — the LMS's Service Repairs library, inside Seva (Dr Raghu,
 * 12 Oct 2026: "This LMS library can be seen in our Seva also, so that all the
 * service people can see it there, and Yash can start adding small videos").
 * The same lms_book / lms_section / lms_lesson rows the LMS shows — one
 * library, two doors. Aakash, Yash and the owner add; everyone in Seva watches.
 */
const BOOK = "service-repairs";
const S = (v: unknown) => String(v ?? "").trim();

export async function GET() {
  try {
    const me = await requireSeva();
    const admin = adminClient();
    const [{ data: book }, { data: sections }, { data: shelf }] = await Promise.all([
      admin.from("lms_book").select("id, name, blurb, slug").eq("id", BOOK).maybeSingle(),
      admin.from("lms_section").select("id, name, sort_order").eq("book_id", BOOK).order("sort_order"),
      admin.from("lms_lesson_book").select("lesson_id, section_id, sort_order").eq("book_id", BOOK).order("sort_order"),
    ]);
    if (!book) return NextResponse.json({ installed: false, sections: [], lessons: [], mayAdd: mayPlan(me.email, me.isOwner) });
    const ids = (shelf || []).map((x) => x.lesson_id);
    const { data: lessons } = ids.length ? await admin.from("lms_lesson").select("id, title, description, video_url, minutes, code, created_at").in("id", ids).eq("active", true) : { data: [] };
    const list = (shelf || []).map((x) => ({ ...(lessons || []).find((l) => l.id === x.lesson_id), section_id: x.section_id, sort_order: x.sort_order })).filter((l) => (l as { id?: string }).id);
    return NextResponse.json({ installed: true, book, sections: sections || [], lessons: list, mayAdd: mayPlan(me.email, me.isOwner) });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const me = await requireSeva();
    if (!mayPlan(me.email, me.isOwner)) throw new HttpError(403, "Aakash or Yash adds to the library.");
    const admin = adminClient();
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (b.action === "section") {
      const name = S(b.name); if (!name) throw new HttpError(400, "Name the section.");
      if (b.id) { await admin.from("lms_section").update({ name }).eq("id", S(b.id)).eq("book_id", BOOK); return NextResponse.json({ ok: true }); }
      const { count } = await admin.from("lms_section").select("*", { count: "exact", head: true }).eq("book_id", BOOK);
      const { error } = await admin.from("lms_section").insert({ book_id: BOOK, name, sort_order: (count || 0) + 1 });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (b.action === "video") {
      const title = S(b.title); if (!title) throw new HttpError(400, "Give the video a title.");
      const video_url = S(b.video_url);
      if (!video_url || parseVideo(video_url).kind === "unknown") throw new HttpError(400, "Paste a Google Drive, YouTube or .mp4 link.");
      const row = { title, video_url, description: S(b.description), minutes: Math.max(0, Math.round(Number(b.minutes) || 0)), content: "", updated_at: new Date().toISOString() };
      let id = S(b.id);
      if (id) { const { error } = await admin.from("lms_lesson").update(row).eq("id", id); if (error) throw error; }
      else {
        let code: string | null = null;
        const { data: taken } = await admin.from("lms_lesson").select("code").not("code", "is", null).limit(10000);
        const have = new Set((taken || []).map((x) => String(x.code)));
        for (let a = 0; a < 60 && !code; a++) { const c = String(1000 + Math.floor(Math.random() * 9000)); if (!have.has(c)) code = c; }
        const { data, error } = await admin.from("lms_lesson").insert({ ...row, ...(code ? { code } : {}), created_by: me.id }).select("id").single();
        if (error) throw error;
        id = data.id;
      }
      const { count } = await admin.from("lms_lesson_book").select("*", { count: "exact", head: true }).eq("book_id", BOOK);
      await admin.from("lms_lesson_book").upsert({ lesson_id: id, book_id: BOOK, section_id: S(b.section_id) || null, sort_order: count || 0 }, { onConflict: "lesson_id,book_id" });
      return NextResponse.json({ ok: true, id });
    }
    if (b.action === "remove") {
      await admin.from("lms_lesson").update({ active: false }).eq("id", S(b.id));
      return NextResponse.json({ ok: true });
    }
    throw new HttpError(400, "Unknown action.");
  } catch (e) { return errJson(e); }
}
