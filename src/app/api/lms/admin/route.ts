import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { requireUser, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { isLmsAdmin } from "@/lib/lms-admin";
import { audienceLabel } from "@/lib/lms";

export const dynamic = "force-dynamic";

/**
 * THE LMS ADMIN PAGE (Dr Raghu, 15 Oct 2026: "in LMS make an admin page.
 * Shweta and Raghu are LMS admins for now").
 *
 *   GET                                  the admins, and how each library is being used
 *   POST { action: "admin.add", email }  Dr Raghu names an LMS admin
 *   POST { action: "admin.remove", email }
 *
 * The admins are read by every LMS admin and changed only by Dr Raghu, who is
 * always one.
 */
type R = Record<string, unknown>;
async function all(q: (a: number, b: number) => PromiseLike<{ data: R[] | null; error: { message: string } | null }>) {
  const out: R[] = [];
  for (let a = 0; ; a += 1000) { const { data, error } = await q(a, a + 999); if (error) throw new Error(error.message); out.push(...(data || [])); if (!data || data.length < 1000) break; }
  return out;
}

export async function GET() {
  try {
    const user = await requireUser();
    const admin = adminClient();
    if (!(await isLmsAdmin(admin, user))) throw new HttpError(403, "The LMS admin page is for the LMS admins.");
    const [adm, profs, books, lessons, shelves, progress] = await Promise.all([
      admin.from("lms_admin").select("email, added_by, added_at").order("added_at"),
      all((a, b) => admin.from("profiles").select("id,email,display_name,disabled").order("id").range(a, b)),
      admin.from("lms_book").select("id,name,icon,audience,active,sort_order").order("sort_order"),
      all((a, b) => admin.from("lms_lesson").select("id,title,code,active").order("id").range(a, b)),
      all((a, b) => admin.from("lms_lesson_book").select("lesson_id,book_id").order("lesson_id").order("book_id").range(a, b)),
      all((a, b) => admin.from("lms_progress").select("person_id,lesson_id,status,completed_on").order("person_id").order("lesson_id").range(a, b)),
    ]);
    const nameOf = (email: string) => String(profs.find((p) => String(p.email).toLowerCase() === email.toLowerCase())?.display_name || email);
    const installed = !adm.error;
    const admins = installed
      ? (adm.data || []).map((a) => ({ email: String(a.email), name: nameOf(String(a.email)), added_by: a.added_by, added_at: a.added_at }))
      : [{ email: "raghu@nandan.co.in", name: nameOf("raghu@nandan.co.in"), added_by: null, added_at: null }];
    const active = new Set(lessons.filter((l) => l.active !== false).map((l) => String(l.id)));
    const d30 = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    const libs = (books.data || []).map((b) => {
      const ids = new Set(shelves.filter((s) => s.book_id === b.id && active.has(String(s.lesson_id))).map((s) => String(s.lesson_id)));
      const rows = progress.filter((p) => ids.has(String(p.lesson_id)));
      const done = rows.filter((p) => p.status === "completed");
      return {
        id: b.id, name: b.name, icon: b.icon, active: b.active !== false, audience: audienceLabel((b.audience as string[] | null) ?? null),
        lessons: ids.size, completions: done.length, learners: new Set(done.map((p) => p.person_id)).size,
        last30: done.filter((p) => String(p.completed_on || "") >= d30).length,
        planned: rows.filter((p) => p.status !== "completed").length,
      };
    });
    const doneBy = new Map<string, number>();
    for (const p of progress) if (p.status === "completed") doneBy.set(String(p.lesson_id), (doneBy.get(String(p.lesson_id)) || 0) + 1);
    const untouched = lessons.filter((l) => l.active !== false && !doneBy.get(String(l.id))).map((l) => ({ id: l.id, title: l.title, code: l.code }));
    const top = lessons.filter((l) => doneBy.get(String(l.id))).map((l) => ({ id: l.id, title: l.title, code: l.code, completions: doneBy.get(String(l.id)) || 0 })).sort((a, b) => b.completions - a.completions).slice(0, 10);
    return NextResponse.json({ installed, mayChangeAdmins: user.isOwner, admins, libraries: libs, untouched, top });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (!user.isOwner) throw new HttpError(403, "Dr Raghu names the LMS admins.");
    const b = await readBody(req, {});
    const email = String(b.email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, "Give the person's e-mail.");
    const admin = adminClient();
    if (b.action === "admin.add") {
      const { data: p } = await admin.from("profiles").select("id").ilike("email", email).maybeSingle();
      if (!p) throw new HttpError(400, `${email} has no Genie login yet.`);
      const { error } = await admin.from("lms_admin").upsert({ email, added_by: user.email }, { onConflict: "email" });
      if (error) throw new Error(/lms_admin|does not exist|schema cache/i.test(error.message) ? "Run migration 0234 first." : error.message);
      return NextResponse.json({ ok: true });
    }
    if (b.action === "admin.remove") {
      if (email === user.email.toLowerCase()) throw new HttpError(400, "Dr Raghu is always an LMS admin.");
      await admin.from("lms_admin").delete().eq("email", email);
      return NextResponse.json({ ok: true });
    }
    throw new HttpError(400, "Unknown action.");
  } catch (e) { return errJson(e); }
}
