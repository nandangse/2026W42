import { NextResponse } from "next/server";
import { currentUser, errJson, HttpError, RAGHU_EMAIL } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/saamaan-escalate — the issue-slip ladder (Dr Raghu, 3 Sep
 * 2026: "if it doesn't get done by then it will get escalated to the
 * project manager, and the next day after that to the COO, and the next
 * day after that to Raghu — all these escalations automatically, there
 * will be a task put in saying escalation, and it will move forward
 * saying issue not done").
 *
 * Daily, at 08:00 IST (vercel.json). For every OPEN slip: the number of
 * whole days since it was raised is its level, capped at three — 1 the
 * project manager (the job's planning owner on the board), 2 the COO
 * (Masters → routing), 3 Raghu. Each step that has not been taken yet
 * raises ONE task to that person, marks the slip "issue not done" with
 * the level, and moves on. A slip released in full closes itself and
 * leaves the ladder.
 *
 * The cron's secret, or a signed-in hand — the same rule as every Genie cron.
 */

const S = (v: unknown) => (v === null || v === undefined ? "" : String(v)).trim();
const DAY = 86400000;

export async function GET(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    const header = req.headers.get("authorization") || "";
    const fromCron = !!secret && header === `Bearer ${secret}`;
    if (!fromCron) {
      const u = await currentUser();
      if (!u || u.disabled) throw new HttpError(401, "The daily cron, or a signed-in hand.");
    }
    const admin = adminClient();
    const { data: open, error } = await admin.from("material_slip").select("*").eq("status", "open").limit(1000);
    if (error) {
      if (/does not exist|schema cache/i.test(error.message)) return NextResponse.json({ ok: true, note: "no slip table yet" });
      throw new Error(error.message);
    }
    const { data: settings } = await admin.from("material_setting").select("key, value");
    const set: Record<string, string> = {};
    for (const s of settings ?? []) set[S(s.key)] = S(s.value);
    const { data: people } = await admin.from("profiles").select("email, initials, display_name");
    const byEmail = new Map((people ?? []).map((p) => [S(p.email).toLowerCase(), p]));
    const byInitials = new Map((people ?? []).map((p) => [S(p.initials).toUpperCase(), p]));

    const raised: string[] = [];
    const now = Date.now();
    for (const slip of open ?? []) {
      const days = Math.floor((now - new Date(String(slip.created_at)).getTime()) / DAY);
      const level = Math.min(3, days);
      if (level <= Number(slip.escalation_level)) continue;
      // Who, at this level.
      let to: { email: string; initials: string; label: string } | null = null;
      if (level === 1) {
        const { data: line } = await admin.from("material_slip_line").select("job_no").eq("slip_id", String(slip.id)).limit(1).maybeSingle();
        const { data: job } = line?.job_no ? await admin.from("jobs").select("own").eq("id", String(line.job_no)).maybeSingle() : { data: null };
        const p = job?.own ? byInitials.get(S(job.own).toUpperCase()) : null;
        if (p) to = { email: S(p.email), initials: S(p.initials), label: "project manager" };
      } else if (level === 2) {
        const p = byEmail.get(set.coo_email?.toLowerCase());
        if (p) to = { email: S(p.email), initials: S(p.initials), label: "COO" };
      } else {
        const p = byEmail.get(RAGHU_EMAIL.toLowerCase());
        to = { email: RAGHU_EMAIL, initials: S(p?.initials) || "RJ", label: "Raghu" };
      }
      const note = `issue not done — escalated to ${to ? `${to.label} (${to.email.split("@")[0]})` : `level ${level}, nobody set`}`;
      if (to) {
        const { data: line } = await admin.from("material_slip_line").select("job_no").eq("slip_id", String(slip.id)).limit(1).maybeSingle();
        await admin.from("manual_tasks").insert({
          job_id: line?.job_no ? String(line.job_no) : null,
          title: `Escalation ${level}: ${slip.slip_no} not done — ${slip.kind === "purchase" ? "purchase" : "issue"} slip to ${S(slip.to_email).split("@")[0]}`,
          detail: `Raised ${new Date(String(slip.created_at)).toLocaleDateString("en-IN")} by ${S(slip.from_email).split("@")[0]}, still open after ${days} day${days === 1 ? "" : "s"}. Open Saamaan → Issue slips.`,
          who: to.initials,
          due: new Date().toISOString().slice(0, 10),
          cat: "Production",
          created_by: "saamaan-escalate",
        });
      }
      await admin.from("material_slip").update({ escalation_level: level, escalated_at: new Date().toISOString(), escalation_note: note }).eq("id", String(slip.id));
      raised.push(`${slip.slip_no} → ${note}`);
    }
    return NextResponse.json({ ok: true, open: (open ?? []).length, raised });
  } catch (e) {
    return errJson(e);
  }
}
