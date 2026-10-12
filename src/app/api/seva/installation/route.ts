import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireSeva } from "@/lib/seva";
import { adminClient } from "@/lib/supabase/admin";
import { readBody } from "@/lib/validate";
import { allJobs, atInstallation } from "@/lib/seva-jobs";
import { mayPlan, serviceTeam } from "@/lib/seva-team";

export const dynamic = "force-dynamic";

/**
 * /api/seva/installation — SEVA → INSTALLATION (Dr Raghu, 12 Oct 2026: "make a
 * sub module called Installation. Show jobs in installation. Deploy people
 * there.")
 *
 *   GET                      the jobs at installation, who is deployed on each (past and coming), the team
 *   POST deploy { job_id, employee_ids[], from, to, site, notes }
 *                            one plan line per person per day, kind Installation — the same lines the roster shows
 *   POST done { job_id }     marks today's and earlier lines on the job done
 * Aakash, Yash and the owner deploy (the plan's writers).
 */
const S = (v: unknown) => String(v ?? "").trim();
const isD = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const istDay = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

export async function GET() {
  try {
    const me = await requireSeva();
    const admin = adminClient();
    const [jobs, team] = await Promise.all([allJobs(admin), serviceTeam(admin)]);
    const list = [...jobs.values()].filter(atInstallation);
    const ids = list.map((j) => j.id);
    const { data: plans, error } = ids.length ? await admin.from("seva_plan").select("id, on_date, employee_id, person_name, status, site, notes, job_id").in("job_id", ids).order("on_date") : { data: [], error: null };
    if (error) { if (/job_id|does not exist|schema cache/i.test(error.message)) return NextResponse.json({ installed: false, jobs: list, plans: [], team, mayPlan: mayPlan(me.email, me.isOwner), today: istDay() }); throw error; }
    /* tickets on these jobs, for the column */
    const { data: tix } = ids.length ? await admin.from("seva_issue").select("erp_name, status, job_number").in("job_number", ids) : { data: [] };
    return NextResponse.json({ installed: true, today: istDay(), jobs: list.map((j) => ({ ...j, tickets: (tix || []).filter((t) => t.job_number === j.id).length, open: (tix || []).filter((t) => t.job_number === j.id && !/closed|resolved/i.test(String(t.status))).length })), plans: plans || [], team, mayPlan: mayPlan(me.email, me.isOwner) });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const me = await requireSeva();
    if (!mayPlan(me.email, me.isOwner)) throw new HttpError(403, "Aakash or Yash deploys the team.");
    const admin = adminClient();
    const b = await readBody(req, { action: "string" });
    const job_id = S(b.job_id); if (!job_id) throw new HttpError(400, "Which job?");
    if (b.action === "deploy") {
      const from = S(b.from), to = S(b.to) || S(b.from);
      if (!isD(from) || !isD(to) || to < from) throw new HttpError(400, "From and to — to on or after from.");
      const ids: string[] = (Array.isArray(b.employee_ids) ? b.employee_ids : []).map(S).filter(Boolean);
      if (!ids.length) throw new HttpError(400, "Who goes?");
      const days: string[] = [];
      for (let d = new Date(from + "T00:00:00Z"); d.toISOString().slice(0, 10) <= to && days.length < 62; d.setUTCDate(d.getUTCDate() + 1)) days.push(d.toISOString().slice(0, 10));
      const [jobs, team] = await Promise.all([allJobs(admin), serviceTeam(admin)]);
      const j = jobs.get(job_id);
      const rows = ids.flatMap((id) => days.map((on_date) => ({
        on_date, employee_id: id, person_name: team.find((t) => t.id === id)?.name || "", kind: "Installation",
        customer: j?.cust || "", site: S(b.site), job_id, notes: S(b.notes) || `Installation — job ${job_id}${j?.tag ? ` · ${j.tag}` : ""}`, created_by: me.email,
      })));
      const { error } = await admin.from("seva_plan").insert(rows);
      if (error) throw error;
      return NextResponse.json({ ok: true, made: rows.length });
    }
    if (b.action === "done") {
      const { error } = await admin.from("seva_plan").update({ status: "done", updated_at: new Date().toISOString() }).eq("job_id", job_id).lte("on_date", istDay()).eq("status", "planned");
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    throw new HttpError(400, "Unknown action.");
  } catch (e) { return errJson(e); }
}
