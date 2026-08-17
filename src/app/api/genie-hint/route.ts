import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireReader, errJson, HttpError } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { computeSchedule, planEnd, today as todayISO, manDays } from "@/lib/schedule";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/genie-hint — the written brief on the right of the Job Plan header.
 *
 * Genie assembles the facts (dates, plan, milestones, materials, tasks, people)
 * and Claude turns them into a read: how the job is being handled, what would
 * actually move the delivery date, and who is on it. The model never touches
 * the ERP and is never asked to invent a number — everything it can say comes
 * from the payload below.
 *
 * Requires ANTHROPIC_API_KEY in the server env vars (same key as Eva and deal
 * scoring). Cached for 30 minutes per job so re-opening a job is free.
 */

const SYSTEM = `You brief the delivery team at NANDAN GSE, an Indian manufacturer of ground
support equipment for aviation, material handling equipment, and defence/aerospace ground
equipment. Jobs are built to order in one works: fabrication, hydraulics, electricals,
paint, assembly, testing, dispatch.

You are writing the panel a project owner reads when they open a job. Write for someone who
already knows the job exists and wants to know where it actually stands.

Rules:
- Use ONLY the facts given. Never invent dates, values, names, or causes. If something is
  not in the data, say it is not recorded rather than guessing.
- Lead with the truth about the schedule. If the plan ends after the target date, say so and
  by how much, in the first line.
- "What would move it" must be specific to THIS job's data — the milestone that is late, the
  material that is short, the task that is overdue. Never generic advice like "monitor
  progress" or "communicate with stakeholders".
- Indian business English. Plain, direct, no filler, no flattery, no headings inside the text.
- Amounts are in rupees; lakh and crore are fine.`;

const SCHEMA = {
  type: "object",
  properties: {
    headline: {
      type: "string",
      description: "One sentence, max 20 words: where this job actually stands right now.",
    },
    status: {
      type: "string",
      enum: ["on_track", "at_risk", "late", "done", "unknown"],
      description: "Blunt read of the delivery position.",
    },
    story: {
      type: "string",
      description:
        "2-4 sentences on how the job has been handled so far: what is planned, what is done, what has slipped, what the materials position is.",
    },
    actions: {
      type: "array",
      items: { type: "string" },
      description:
        "2-4 specific things that would move THIS job's delivery date, each naming the milestone, material, task or person involved.",
    },
    watch: {
      type: "string",
      description: "The single thing most likely to hurt this job next, in one sentence. Empty string if nothing stands out.",
    },
  },
  required: ["headline", "status", "story", "actions", "watch"],
  additionalProperties: false,
};

/** job_id → { at, hint }. Re-opening a job inside the window costs nothing. */
const cache = new Map<string, { at: number; hint: unknown }>();
const TTL_MS = 30 * 60 * 1000;

const fmtINR = (n: number) =>
  n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(1)} L` : `₹${Math.round(n)}`;

const days = (a: string | null, b: string | null) =>
  a && b ? Math.round((Date.parse(b) - Date.parse(a)) / 86400000) : null;

export async function POST(req: Request) {
  try {
    await requireReader();
    const body = await req.json();
    const jobId = String(body.job_id || "");
    if (!jobId) throw new HttpError(400, "job_id is required");

    if (!body.refresh) {
      const hit = cache.get(jobId);
      if (hit && Date.now() - hit.at < TTL_MS)
        return NextResponse.json({ ...(hit.hint as object), cached: true });
    }

    if (!process.env.ANTHROPIC_API_KEY)
      return NextResponse.json(
        { error: "Server is missing ANTHROPIC_API_KEY — add it in the Vercel project env vars" },
        { status: 503 },
      );

    const db = supabaseServer();
    const T = todayISO();

    const [jobRes, planRes, msRes, matRes, erpRes, manRes, projRes] = await Promise.all([
      db.from("jobs").select("*").eq("id", jobId).maybeSingle(),
      db.from("plans").select("*").eq("job_id", jobId).maybeSingle(),
      db.from("milestones").select("*").eq("job_id", jobId).order("idx", { ascending: true }),
      db.from("materials").select("item, qty, status").eq("job_id", jobId),
      db.from("erp_tasks").select("title, who, due, cat, esc, done").eq("job_id", jobId),
      db.from("manual_tasks").select("title, who, due, cat, esc, done, created_by").eq("job_id", jobId),
      db.from("projects").select("*").eq("job_id", jobId).maybeSingle(),
    ]);

    const job = jobRes.data;
    if (!job) throw new HttpError(404, "No such job");

    // ---- plan schedule, computed exactly as the board computes it ----
    const milestones = (msRes.data || []).map((m) => ({
      name: m.title,
      days: m.days,
      preds: m.preds || [],
      crew: m.crew || {},
      shift: m.shift || "D",
      offset: m.offset_days || 0,
      done: !!m.done,
      done_on: m.done_on,
    }));
    const start = planRes.data?.start_date || job.start_date || T;
    const sched = milestones.length ? computeSchedule({ start, milestones }) : [];
    const ends = sched.length ? planEnd(sched) : null;
    const doneCount = sched.filter((m) => m.done).length;
    const nextUp = sched.find((m) => !m.done && manDays(m) > 0) || sched.find((m) => !m.done) || null;
    const overrunVsTdd = days(job.tdd, ends);

    const tasks = [
      ...(erpRes.data || []).map((t) => ({ ...t, src: "ERP ToDo" })),
      ...(manRes.data || []).map((t) => ({ ...t, src: "raised in Genie" })),
    ];
    const openTasks = tasks.filter((t) => !t.done);
    const overdue = openTasks.filter((t) => t.due && t.due < T);
    const escalated = openTasks.filter((t) => t.esc && t.esc !== "None");

    // ---- people: the owner, then everyone carrying a task ----
    const assignees = [...new Set(openTasks.map((t) => String(t.who || "").trim()).filter(Boolean))];
    const { data: profiles } = await adminClient()
      .from("profiles")
      .select("email, display_name, initials, erp_owner, role, designation")
      .eq("disabled", false);
    const nameFor = (handle: string) => {
      const h = handle.toLowerCase();
      const p = (profiles || []).find((x) =>
        [x.initials, x.display_name, x.erp_owner, x.email, String(x.email || "").split("@")[0]]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase() === h),
      );
      return p ? `${p.display_name || p.email.split("@")[0]}${p.designation ? " (" + p.designation + ")" : ""}` : handle;
    };

    const mats = matRes.data || [];
    const received = mats.filter((m) => m.status === "Received").length;
    const pendingMats = mats.filter((m) => m.status !== "Received").map((m) => m.item);

    const facts = `JOB ${jobId} — ${job.tag || "(no tag)"}
Customer: ${job.cust || "not recorded"}
Product family: ${job.fam || "not recorded"}
Order value: ${fmtINR(Number(job.val || 0))}
ERP job status: ${job.stat || "not recorded"}
Production complete: ${job.pct ?? 0}%
Today is ${T}.

DATES
Target Delivery (ERP): ${job.tdd || "not set"}
OTD date (ERP): ${job.otd || "not set"}${job.otd && job.tdd && job.otd > job.tdd ? ` — ${days(job.tdd, job.otd)} days beyond target` : ""}
Management target: ${job.mgmt || "not set"}
Plan starts: ${start}
Plan ends: ${ends || "no plan saved"}${overrunVsTdd !== null ? ` — that is ${overrunVsTdd > 0 ? overrunVsTdd + " days AFTER" : Math.abs(overrunVsTdd) + " days before"} the Target Delivery` : ""}
Baseline saved: ${planRes.data?.baseline_on ? `${planRes.data.baseline_on}, ending ${planRes.data.baseline_end}` : "none"}

MILESTONE PLAN (${doneCount} of ${sched.length} done)
${sched.length
        ? sched
            .map(
              (m) =>
                `M${m.idx} ${m.name}: ${m.start} → ${m.end}, ${m.days}d, ${manDays(m)} man-days, ${
                  m.done ? "DONE" + (m.done_on ? " " + m.done_on : "") : m.end < T ? "NOT DONE and past its end date" : "pending"
                }`,
            )
            .join("\n")
        : "No milestone plan has been saved for this job."}
Next milestone due: ${nextUp ? `M${nextUp.idx} ${nextUp.name}, ends ${nextUp.end}` : "none pending"}

MATERIALS
Kitting: ${job.kit ?? 0}% · ${received} of ${mats.length} checklist items received
Still pending: ${pendingMats.length ? pendingMats.join(", ") : mats.length ? "nothing — all received" : "no checklist created yet"}

TASKS (${openTasks.length} open of ${tasks.length})
${openTasks.length
        ? openTasks
            .map(
              (t) =>
                `- "${t.title}" · ${t.who ? nameFor(String(t.who)) : "UNASSIGNED"} · due ${t.due || "no date"}${
                  t.due && t.due < T ? " (OVERDUE)" : ""
                } · ${t.cat || "uncategorised"}${t.esc && t.esc !== "None" ? ` · ESCALATED ${t.esc}` : ""} · ${t.src}`,
            )
            .join("\n")
        : "No open tasks are recorded against this job."}
Overdue: ${overdue.length} · Escalated: ${escalated.length}

PEOPLE
Job owner (ERP Project Owner): ${job.own ? nameFor(String(job.own)) : "not recorded"}
Project manager (ERP): ${projRes.data?.mgr ? nameFor(String(projRes.data.mgr)) : "not recorded"}
Carrying open tasks: ${assignees.length ? assignees.map(nameFor).join(", ") : "nobody"}`;

    const anthropic = new Anthropic();
    const response = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 6000,
      system: SYSTEM,
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: `Brief me on this job.\n\n${facts}` }],
    });

    if (response.stop_reason === "refusal")
      return NextResponse.json({ error: "The brief was declined — read the plan below instead." }, { status: 422 });

    const text = response.content.find((b) => b.type === "text")?.text || "";
    let out: Record<string, unknown>;
    try {
      out = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "Could not read the brief that came back — try again." }, { status: 502 });
    }

    const hint = {
      headline: String(out.headline || "").trim(),
      status: String(out.status || "unknown"),
      story: String(out.story || "").trim(),
      actions: Array.isArray(out.actions) ? out.actions.map(String).filter(Boolean) : [],
      watch: String(out.watch || "").trim(),
      // the facts panel below the prose — computed, never model-authored
      people: {
        owner: job.own ? nameFor(String(job.own)) : null,
        manager: projRes.data?.mgr ? nameFor(String(projRes.data.mgr)) : null,
        assignees: assignees.map((a) => ({ handle: a, name: nameFor(a), open: openTasks.filter((t) => t.who === a).length })),
      },
      at: new Date().toISOString(),
    };
    cache.set(jobId, { at: Date.now(), hint });
    return NextResponse.json({ ...hint, cached: false });
  } catch (e) {
    if (e instanceof HttpError) return errJson(e);
    console.error("Genie hint failed", e);
    const err = e as { error?: { error?: { message?: string } }; message?: string };
    return NextResponse.json({ error: err?.error?.error?.message || err?.message || "Server error" }, { status: 500 });
  }
}
