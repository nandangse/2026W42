import { NextResponse } from "next/server";
import { assertAiOn } from "@/lib/ai-gate";
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
- Amounts are in rupees; lakh and crore are fine.
- DATES ARE WRITTEN DD-MMM, e.g. 31-Aug, or 31-Aug-2026 when the year is not
  obvious from the sentence. NEVER write a date as 2026-08-31. Nobody at this
  company reads dates that way and it is the one thing that makes this panel
  look like machine output.`;

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

/**
 * The cache lives in Postgres (job_hint, migration 0026), NOT in this module.
 *
 * It used to be `new Map()` in module scope. On Vercel every serverless
 * instance holds its own copy, so the second person to open a job landed on a
 * different instance and paid for a whole fresh generation, and any cold start
 * threw the lot away. That is precisely why it read as "somebody has to click
 * it again for each person". One row per job is one cache for everybody.
 */
const MODEL = "claude-opus-5";

/**
 * A brief goes stale when the JOB changes, not when a clock runs out. The
 * morning upload stamps jobs.updated_at, so a hint written before that stamp
 * is describing yesterday's job and is rebuilt; one written after it is still
 * true however old it is. The 24-hour floor is only there to catch the things
 * that move without touching the job row — a task closed, a material received.
 */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function isStale(builtAt: string | null, jobUpdatedAt: string | null): boolean {
  if (!builtAt) return true;
  const built = Date.parse(builtAt);
  if (!Number.isFinite(built)) return true;
  if (Date.now() - built > MAX_AGE_MS) return true;
  if (jobUpdatedAt && Date.parse(jobUpdatedAt) > built) return true;
  return false;
}

/**
 * May this caller have a brief generated for them without asking?
 *
 * The owner, and anyone reporting directly to the owner. Generation costs a
 * model call per job, so it is not turned on for the whole company by clicking
 * around — but for the people who open twenty jobs in a morning, waiting for a
 * button is the difference between the panel being used and being ignored.
 *
 * Everyone else still gets any brief that already exists, free and instantly.
 */
/**
 * PAUSED (Dr Raghu, 28 Aug 2026): Genie never writes a job read on its own —
 * the API credits are spent only when a named hand presses Generate. The
 * old auto-brief for the owner's direct reports is kept here as history,
 * switched off in one place.
 */
async function mayAutoBrief(): Promise<boolean> {
  return false;
}

/** Who may press Generate at all: the owner, Stratcom and MC (Management). */
async function mayGenerate(userId: string, isOwner: boolean): Promise<boolean> {
  if (isOwner) return true;
  const admin = adminClient();
  const { data: me } = await admin
    .from("profiles").select("stratcom, management").eq("id", userId).maybeSingle();
  return !!me?.stratcom || !!me?.management;
}

const fmtINR = (n: number) =>
  n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(1)} L` : `₹${Math.round(n)}`;

const days = (a: string | null, b: string | null) =>
  a && b ? Math.round((Date.parse(b) - Date.parse(a)) / 86400000) : null;

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * 31-Aug-2026, never 2026-08-31.
 *
 * The model echoes back whatever shape the facts arrive in, so telling it the
 * rule is only half the job — the payload has to be written that way too, or
 * it copies the ISO date straight out of the brief it was handed.
 */
const d = (iso: string | null | undefined): string => {
  const v = String(iso || "").slice(0, 10);
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}-${MON[Number(m[2]) - 1]}-${m[1]}` : "not set";
};

/**
 * GET /api/genie-hint?job_id=… — read the shared cache, and NEVER generate.
 *
 * This is what lets the panel fill itself in the moment a job is opened: it
 * costs one indexed row read, so it can run for everybody on every job. If
 * nothing is cached it says so, and whether this caller is allowed to have one
 * built automatically.
 */
export async function GET(req: Request) {
  try {
    const user = await requireReader();
    const jobId = String(new URL(req.url).searchParams.get("job_id") || "");
    if (!jobId) throw new HttpError(400, "job_id is required");

    const admin = adminClient();
    const [hintRes, jobRes] = await Promise.all([
      admin.from("job_hint").select("hint, built_at, built_by, model").eq("job_id", jobId).maybeSingle(),
      admin.from("jobs").select("updated_at").eq("id", jobId).maybeSingle(),
    ]);

    const row = hintRes.data;
    const stale = !row || isStale(row.built_at, jobRes.data?.updated_at ?? null) || row.model !== MODEL;
    const auto = await mayAutoBrief();

    return NextResponse.json({
      hint: row?.hint ?? null,
      builtAt: row?.built_at ?? null,
      builtBy: row?.built_by ?? null,
      stale,
      auto,
      may: await mayGenerate(user.id, user.isOwner),
      configured: !!process.env.ANTHROPIC_API_KEY,
    });
  } catch (e) {
    // The panel is a companion to a page that works without it. A cache read
    // that fails must never take the Job Plan down with it.
    const msg = e instanceof Error ? e.message : String(e);
    if (/job_hint|does not exist|schema cache/i.test(msg))
      return NextResponse.json({ hint: null, stale: true, auto: false, notInstalled: true });
    return errJson(e);
  }
}

export async function POST(req: Request) {
  try {
    await assertAiOn();
    const user = await requireReader();
    // The cache below is free to read for anyone; GENERATING is what costs,
    // and generating is MC and Stratcom's alone while Genie is paused.
    if (!(await mayGenerate(user.id, user.isOwner)))
      throw new HttpError(403, "Genie is paused — MC and Stratcom generate the job reads for now.");
    const body = await req.json();
    const jobId = String(body.job_id || "");
    if (!jobId) throw new HttpError(400, "job_id is required");
    const admin = adminClient();

    // The shared cache, read before anything is spent. `refresh` is the ↻
    // button — one person deciding the read is out of date on everyone's
    // behalf, which is the right way round for a cache everybody shares.
    if (!body.refresh) {
      try {
        const [hintRes, jobRes] = await Promise.all([
          admin.from("job_hint").select("hint, built_at, built_by, model").eq("job_id", jobId).maybeSingle(),
          admin.from("jobs").select("updated_at").eq("id", jobId).maybeSingle(),
        ]);
        const row = hintRes.data;
        if (row && row.model === MODEL && !isStale(row.built_at, jobRes.data?.updated_at ?? null))
          return NextResponse.json({ ...(row.hint as object), cached: true, builtBy: row.built_by, builtAt: row.built_at });
      } catch {
        /* migration 0026 not run yet — fall through and generate */
      }
    }

    if (!process.env.ANTHROPIC_API_KEY)
      return NextResponse.json(
        {
          error:
            "Genie hint is not switched on: the server has no ANTHROPIC_API_KEY. " +
            "Add it to the Vercel project's Environment Variables and redeploy — nothing else about this job is affected.",
          config: true,
        },
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
Today is ${d(T)}.

DATES
Target Delivery (ERP): ${d(job.tdd)}
OTD date (ERP): ${d(job.otd)}${job.otd && job.tdd && job.otd > job.tdd ? ` — ${days(job.tdd, job.otd)} days beyond target` : ""}
Management target: ${d(job.mgmt)}
Plan starts: ${d(start)}
Plan ends: ${ends ? d(ends) : "no plan saved"}${overrunVsTdd !== null ? ` — that is ${overrunVsTdd > 0 ? overrunVsTdd + " days AFTER" : Math.abs(overrunVsTdd) + " days before"} the Target Delivery` : ""}
Baseline saved: ${planRes.data?.baseline_on ? `${d(planRes.data.baseline_on)}, ending ${d(planRes.data.baseline_end)}` : "none"}

MILESTONE PLAN (${doneCount} of ${sched.length} done)
${sched.length
        ? sched
            .map(
              (m) =>
                `M${m.idx} ${m.name}: ${d(m.start)} → ${d(m.end)}, ${m.days}d, ${manDays(m)} man-days, ${
                  m.done ? "DONE" + (m.done_on ? " " + d(m.done_on) : "") : m.end < T ? "NOT DONE and past its end date" : "pending"
                }`,
            )
            .join("\n")
        : "No milestone plan has been saved for this job."}
Next milestone due: ${nextUp ? `M${nextUp.idx} ${nextUp.name}, ends ${d(nextUp.end)}` : "none pending"}

MATERIALS
Kitting: ${job.kit ?? 0}% · ${received} of ${mats.length} checklist items received
Still pending: ${pendingMats.length ? pendingMats.join(", ") : mats.length ? "nothing — all received" : "no checklist created yet"}

TASKS (${openTasks.length} open of ${tasks.length})
${openTasks.length
        ? openTasks
            .map(
              (t) =>
                `- "${t.title}" · ${t.who ? nameFor(String(t.who)) : "UNASSIGNED"} · due ${t.due ? d(t.due) : "no date"}${
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
      model: MODEL,
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

    // Banked for everybody. A write that fails must not lose the brief the
    // caller just paid for, so it is returned either way.
    const builtBy = user.displayName || user.initials || user.email.split("@")[0];
    try {
      await admin
        .from("job_hint")
        .upsert({ job_id: jobId, hint, built_at: new Date().toISOString(), built_by: builtBy, model: MODEL }, { onConflict: "job_id" });
    } catch {
      /* the cache is an optimisation, never the answer */
    }
    return NextResponse.json({ ...hint, cached: false, builtBy, builtAt: hint.at });
  } catch (e) {
    if (e instanceof HttpError) return errJson(e);
    console.error("Genie hint failed", e);
    const err = e as { error?: { error?: { message?: string } }; message?: string };
    return NextResponse.json({ error: err?.error?.error?.message || err?.message || "Server error" }, { status: 500 });
  }
}
