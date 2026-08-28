import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { requireKuber } from "@/lib/accounts";

export const dynamic = "force-dynamic";

/**
 * Kuber's Tasking week (Dr Raghu, 28 Aug 2026): the MAIN GENIE's tasks,
 * served to the people authorised to Kuber, cut into his five swimlanes —
 * Jobs · Goals · Quarterly Rocks · Audit · Strategic Actions — for the week
 * calendar. A task with a job lands in Jobs; the rest follow their
 * RELATED TO tag (0082); the untagged sit honestly in Other.
 *
 * GET ?from=<monday> — that week's tasks plus everything already overdue.
 */
export async function GET(req: Request) {
  try {
    await requireKuber();
    const admin = adminClient();
    const u = new URL(req.url);
    const from = String(u.searchParams.get("from") || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) throw new HttpError(400, "from must be the week's Monday");
    const to = new Date(from + "T00:00:00Z");
    to.setUTCDate(to.getUTCDate() + 6);
    const end = to.toISOString().slice(0, 10);

    const [manual, erp, jobs] = await Promise.all([
      admin.from("manual_tasks").select("id, job_id, title, who, due, cat, esc, done, related_to, created_by").or(`due.lte.${end},due.is.null`),
      admin.from("erp_tasks").select("id, job_id, title, who, due, cat, esc, done").or(`due.lte.${end},due.is.null`),
      admin.from("jobs").select("id, tag").eq("active", true),
    ]);
    if (manual.error) {
      if (/related_to|schema cache/i.test(manual.error.message))
        return NextResponse.json({ needsMigration: true, tasks: [], assignees: [] });
      throw new Error(manual.error.message);
    }
    const tagOf = new Map((jobs.data || []).map((j) => [String(j.id), String(j.tag || "")]));

    type T = { id: string; kind: string; title: string; who: string; due: string | null; cat: string; esc: string; done: boolean; lane: string; job: string | null };
    const laneOf = (job_id: unknown, related: unknown) => {
      const r = String(related || "");
      if (["goal", "rock", "audit", "strategic"].includes(r)) return r;
      if (job_id || r === "job") return "job";
      return "other";
    };
    const tasks: T[] = [];
    for (const t of manual.data || []) {
      if (t.done && (!t.due || String(t.due) < from)) continue; // done and out of the week — gone
      tasks.push({
        id: String(t.id), kind: "manual", title: String(t.title || ""), who: String(t.who || ""),
        due: (t.due as string) ?? null, cat: String(t.cat || ""), esc: String(t.esc || "None"), done: !!t.done,
        lane: laneOf(t.job_id, t.related_to), job: t.job_id ? `${String(t.job_id).slice(-4)} · ${tagOf.get(String(t.job_id)) || ""}` : null,
      });
    }
    for (const t of erp.data || []) {
      if (t.done && (!t.due || String(t.due) < from)) continue;
      tasks.push({
        id: String(t.id), kind: "erp", title: String(t.title || ""), who: String(t.who || ""),
        due: (t.due as string) ?? null, cat: String(t.cat || ""), esc: String(t.esc || "None"), done: !!t.done,
        lane: "job", job: t.job_id ? `${String(t.job_id).slice(-4)} · ${tagOf.get(String(t.job_id)) || ""}` : null,
      });
    }
    const assignees = [...new Set(tasks.map((t) => t.who).filter(Boolean))].sort();
    return NextResponse.json({ tasks, assignees, from, end });
  } catch (e) {
    return errJson(e);
  }
}
