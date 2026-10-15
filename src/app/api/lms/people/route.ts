import { NextResponse } from "next/server";
import { requireUser, errJson } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { teamOf } from "@/lib/team";
import { wordCount } from "@/lib/lms";
import { isLmsAdmin } from "@/lib/lms-admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/lms/people — EVERYBODY'S LEARNING, ONE LINE EACH (Dr Raghu, 15 Oct
 * 2026: "show all in this also to me … as a table"). An LMS admin gets every
 * active person; anybody else, the people in their line. Counted the way the
 * person's own page counts: only completed lessons (and training taken
 * elsewhere) add time; planned is not time.
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
    const isAdmin = await isLmsAdmin(admin, user);
    const [profs, depts, lessons, progress, extras, plans] = await Promise.all([
      all((a, b) => admin.from("profiles").select("id,email,display_name,designation,department_id,reports_to,disabled,lms_groups").order("id").range(a, b)),
      admin.from("departments").select("id,name").then((r) => r.data || [], () => []),
      all((a, b) => admin.from("lms_lesson").select("id,minutes").order("id").range(a, b)),
      all((a, b) => admin.from("lms_progress").select("person_id,lesson_id,status,completed_on,learning,minutes").order("person_id").order("lesson_id").range(a, b)),
      all((a, b) => admin.from("lms_extra").select("person_id,minutes,learning,on_date").order("id").range(a, b)),
      all((a, b) => admin.from("lms_plan").select("person_id,generated_at").order("person_id").range(a, b)),
    ]);
    const people = profs.filter((p) => !p.disabled) as unknown as { id: string; email: string; display_name: string | null; designation: string | null; department_id: string | null; reports_to: string | null; lms_groups: string[] | null }[];
    const scope = isAdmin ? people.map((p) => ({ id: p.id, depth: 1 })) : teamOf(people, user.id);
    const dept = new Map((depts as R[]).map((d) => [String(d.id), String(d.name)]));
    const lessonMin = new Map(lessons.map((l) => [String(l.id), Number(l.minutes) || 0]));
    const rows = scope.map((m) => {
      const p = people.find((x) => x.id === m.id)!;
      let completed = 0, inProgress = 0, planned = 0, minutes = 0, words = 0; let last: string | null = null;
      for (const g of progress) {
        if (g.person_id !== m.id) continue;
        if (g.status === "completed") { completed++; minutes += Number(g.minutes) || lessonMin.get(String(g.lesson_id)) || 0; words += wordCount(String(g.learning || "")); const c = g.completed_on ? String(g.completed_on) : null; if (c && (!last || c > last)) last = c; }
        else if (g.status === "in_progress") inProgress++; else planned++;
      }
      let extra = 0;
      for (const e of extras) { if (e.person_id !== m.id) continue; extra++; minutes += Number(e.minutes) || 0; words += wordCount(String(e.learning || "")); const c = e.on_date ? String(e.on_date) : null; if (c && (!last || c > last)) last = c; }
      const plan = plans.find((x) => x.person_id === m.id);
      return {
        id: m.id, depth: m.depth, name: p.display_name || p.email, email: p.email, designation: p.designation, department: p.department_id ? dept.get(String(p.department_id)) || null : null,
        groups: p.lms_groups || [], completed, in_progress: inProgress, planned, extra, minutes, words, last_completed: last, plan_at: plan ? String(plan.generated_at || "") || null : null,
      };
    });
    return NextResponse.json({ isAdmin, rows });
  } catch (e) { return errJson(e); }
}
