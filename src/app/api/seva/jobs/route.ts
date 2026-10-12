import { NextResponse } from "next/server";
import { errJson } from "@/lib/auth";
import { requireSeva } from "@/lib/seva";
import { adminClient } from "@/lib/supabase/admin";
import { allJobs, jobsOfTicket, paged } from "@/lib/seva-jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * /api/seva/jobs — SEVA → JOBS (Dr Raghu, 12 Oct 2026: "show jobs also on the
 * side so that all the jobs which are there can be seen, with the same filters
 * as normal. Only show the jobs with an issue ticket").
 *
 *   GET            every job that has at least one ticket, with its ticket count, open count, last ticket, cost
 *   GET ?job=ID    that job's tickets
 */
const S = (v: unknown) => String(v ?? "").trim();
const closed = (s: string) => /closed|resolved|cancel/i.test(s);

export async function GET(req: Request) {
  try {
    await requireSeva();
    const admin = adminClient();
    const job = new URL(req.url).searchParams.get("job");
    const cols: string = job ? "id, erp_name, title, status, type_of_support, issue_date, at, cost_spent, customer, location, attended_by, handled_by, pending_action_status, job_number, job_numbers, resolved_at" : "erp_name, status, issue_date, at, cost_spent, job_number, job_numbers";
    const tickets = await paged<Record<string, unknown>>((a, b) => admin.from("seva_issue")
      .select(cols)
      .or("job_number.not.is.null,job_numbers.not.is.null").range(a, b) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>);
    if (job) {
      const mine = tickets.filter((t) => jobsOfTicket(t).includes(job)).sort((x, y) => S(y.issue_date || y.at).localeCompare(S(x.issue_date || x.at)));
      return NextResponse.json({ ok: true, job, tickets: mine });
    }
    const jobs = await allJobs(admin);
    const agg = new Map<string, { n: number; open: number; last: string; cost: number }>();
    for (const t of tickets) for (const id of jobsOfTicket(t)) {
      const a = agg.get(id) || { n: 0, open: 0, last: "", cost: 0 };
      a.n++; if (!closed(S(t.status))) a.open++;
      const d = S(t.issue_date || t.at).slice(0, 10); if (d > a.last) a.last = d;
      a.cost += Number(t.cost_spent) || 0;
      agg.set(id, a);
    }
    const rows = [...agg.entries()].map(([id, a]) => {
      const j = jobs.get(id);
      return { id, tag: j?.tag || "", fam: j?.fam || "", cust: j?.cust || "", own: j?.own || "", stat: j?.stat || "", status: j?.status || (j ? "" : "Not on Genie's job list"), delivered_on: j?.delivered_on || null, live: !!j?.live, known: !!j, tickets: a.n, open: a.open, last: a.last || null, cost: Math.round(a.cost) };
    });
    return NextResponse.json({ ok: true, rows });
  } catch (e) { return errJson(e); }
}
