import { NextResponse } from "next/server";
import { requireReader, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { throughputOf } from "@/lib/delivered";
import { today, jobNo } from "@/lib/schedule";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/consult — ask a question and get an answer grounded in the board.
 *
 * The difference between this and any chat window is the second half of the
 * prompt: the live figures go with the question. An assistant that answers
 * "focus on your overdue jobs" is worth nothing; one that answers "2114 and
 * 2560 are the two overdue jobs carrying real throughput" is worth opening.
 *
 * It is told to say when the board does not answer the question. A confident
 * invention about a delivery date is worse than no answer at all, because it
 * will be repeated to a customer.
 */
const MODEL = "claude-sonnet-4-5-20250929";

export async function POST(req: Request) {
  try {
    await requireReader();
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key)
      throw new HttpError(503, "ANTHROPIC_API_KEY is not set, so Consult cannot answer yet.");

    const body = await req.json();
    const question = String(body.question || "").trim();
    if (question.length < 3) throw new HttpError(400, "Ask a question.");

    const admin = adminClient();
    const T = today();
    const [jobsRes, tasksRes, manRes] = await Promise.all([
      admin.from("jobs").select("id,tag,cust,fam,val,tp,tpv,kit,pct,tdd,escalation,on_floor").eq("active", true),
      admin.from("erp_tasks").select("job_id,title,who,due,cat,esc").eq("done", false),
      admin.from("manual_tasks").select("job_id,title,who,due,cat,esc").eq("done", false),
    ]);
    const jobs = jobsRes.data || [];
    const tasks = [...(tasksRes.data || []), ...(manRes.data || [])];
    const cr = (n: number) => (n / 1e7).toFixed(2);
    const tp = (j: { tp: number | null; tpv: number | null }) => throughputOf({ tp: Number(j.tp) || 0, tpv: Number(j.tpv) || 0 });

    // A compact board, not the whole database. The question is nearly always
    // about what is late, stuck or escalated -- so those go in full and the
    // rest goes in as totals.
    const late = jobs.filter((j) => j.tdd && j.tdd < T);
    const stuck = jobs.filter((j) => Number(j.kit) >= 60 && Number(j.pct) < 40);
    const esc = tasks.filter((t) => t.esc && t.esc !== "None");
    const line = (j: typeof jobs[number]) =>
      `${jobNo(String(j.id))} | ${j.tag} | ${j.cust} | ${j.fam} | TDD ${j.tdd || "none"} | kit ${j.kit}% built ${j.pct}% | ${cr(Number(j.val) || 0)} Cr | tp ${cr(tp(j))} Cr${j.on_floor ? " | ON FLOOR" : ""}${(j.escalation || "").trim() ? ` | ESC: ${String(j.escalation).slice(0, 160)}` : ""}`;

    const board = [
      `TODAY: ${T}`,
      `${jobs.length} live jobs · ${cr(jobs.reduce((s, j) => s + (Number(j.val) || 0), 0))} Cr value · ${cr(jobs.reduce((s, j) => s + tp(j), 0))} Cr throughput`,
      `${jobs.filter((j) => j.on_floor).length} on the floor · ${late.length} past their target date · ${stuck.length} kitted but under 40% built · ${esc.length} escalated tasks open`,
      "",
      "PAST TARGET DATE:",
      ...late.slice(0, 40).map(line),
      "",
      "KITTED BUT NOT MOVING:",
      ...stuck.slice(0, 30).map(line),
      "",
      "ESCALATED TASKS:",
      ...esc.slice(0, 40).map((t) => `${jobNo(String(t.job_id || ""))} | ${t.esc} | ${t.who || "unassigned"} | due ${t.due || "none"} | ${t.cat} | ${t.title}`),
    ].join("\n");

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 900,
        system:
          "You are Genie, answering on behalf of Dr Raghu Nandan for the planning team at Nandan GSE, a maker of ground support equipment in India.\n\n" +
          "Answer from the board below and nothing else. Name the job numbers. Use rupees in crore as the board does.\n\n" +
          "House rules, which matter more than being helpful:\n" +
          "- If the board does not answer the question, say so plainly. Never invent a date, a value or a name — it will be repeated to a customer.\n" +
          "- Never let a missing value read as zero. A job with no target date is undated, not overdue.\n" +
          "- Lateness is measured against the date first promised, not the date currently showing.\n" +
          "- Prefer the specific to the general. 'Chase 2114 and 2560' beats 'follow up on overdue jobs'.\n" +
          "- Be short. Four sentences unless the question genuinely needs more.\n\n" +
          "THE BOARD:\n" + board,
        messages: [{ role: "user", content: question }],
      }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j?.error?.message || `Anthropic returned ${res.status}`);
    const answer = (j.content || []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("\n").trim();
    return NextResponse.json({ answer: answer || "No answer came back.", jobs: jobs.length });
  } catch (e) {
    return errJson(e);
  }
}
