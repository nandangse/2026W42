import { NextResponse } from "next/server";
import { requireUser, errJson, HttpError, type AuthedUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * THE BELIEVABLE PLAN (Dr Raghu, 30 Aug 2026).
 *
 * GET ?kind=mtd|qtd — the window's DONE (from the delivered ledger), the
 * MORE (active jobs whose TDD lands by the period's natural end, overdue
 * included — they are still deliverable), the caller's own beliefs, and
 * their latest signoff for this period.
 *
 * POST { action: "entry", job_id, comment, belief_pct, best_estimate }
 * POST { action: "sign", kind } — freezes the plan, computes the REALISTIC
 * read (belief-weighted, best-estimate-dated), mails it to the signer with
 * stratcom@nandan.co.in in cc, and returns both. The signature never
 * depends on the mail: a failed send is reported, not fatal.
 */
const BELIEFS = new Set([0, 10, 25, 50, 75, 90, 100]);
const STRATCOM_CC = "stratcom@nandan.co.in";

const istToday = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
const cr = (n: number) => `₹${(n / 1e7).toFixed(2)} Cr`;

/**
 * YTD joins MTD and QTD (Dr Raghu, 1 Sep 2026: "also in that make a button
 * for YTD so all are seen"). The financial year entire — April to March — so
 * the plan desk can hold every job the year carries rather than only the ones
 * whose date happens to fall inside this month or quarter.
 */
function windowOf(kind: "mtd" | "qtd" | "ytd") {
  const T = istToday();
  const d = new Date(T + "T00:00:00Z");
  if (kind === "mtd") {
    const from = T.slice(0, 8) + "01";
    const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    return { from, end, key: T.slice(0, 7), label: "MTD" };
  }
  if (kind === "ytd") {
    const fy = fyWindow();
    const y = Number(fy.from.slice(0, 4));
    return { from: fy.from, end: fy.end, key: `FY${String(y).slice(2)}-${String(y + 1).slice(2)}`, label: "YTD" };
  }
  const m = d.getUTCMonth();
  const qs = m >= 9 ? 9 : m >= 6 ? 6 : m >= 3 ? 3 : 0;
  const from = `${d.getUTCFullYear()}-${String(qs + 1).padStart(2, "0")}-01`;
  const end = new Date(Date.UTC(d.getUTCFullYear(), qs + 3, 0)).toISOString().slice(0, 10);
  const fq = qs === 3 ? "Q1" : qs === 6 ? "Q2" : qs === 9 ? "Q3" : "Q4";
  return { from, end, key: `${d.getUTCFullYear()}-${fq}`, label: "QTD" };
}
const fyWindow = () => {
  const T = istToday();
  const d = new Date(T + "T00:00:00Z");
  const y = d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return { from: `${y}-04-01`, end: `${y + 1}-03-31` };
};

const mayPlan = (u: AuthedUser) =>
  u.isOwner || u.stratcom || ["admin", "planner", "project_owner"].includes(String(u.role));

// kit and pct ride along (Dr Raghu, 1 Sep 2026: "In this also show kitting%
// and production %"). A belief about a delivery date is worth more when the
// two numbers behind it are on the same row: 100% believed on a job that is
// 20% kitted is a sentence that should be hard to write.
type JobRow = { id: string; tag: string | null; cust: string | null; fam: string | null; val: number; tp: number; tpv: number; tdd: string | null; kit: number; pct: number; pod: number | null; tpp: number; note: string; escalation: string | null; amtNeeded: number | null; stat: string | null; own: string | null; proj: string | null; otd: string | null };
const tpOf = (j: { tp: number; tpv: number }) => (Number(j.tpv) || 0) > 0 ? Number(j.tpv) : Number(j.tp) || 0;

async function moreJobs(admin: ReturnType<typeof adminClient>, end: string): Promise<JobRow[]> {
  const { data } = await admin.from("jobs")
    .select("id, tag, cust, fam, val, tp, tpv, tdd, kit, pct, stat, own, proj, otd, pay_on_delivery, tpp, note, escalation, amt_needed")
    .eq("active", true)
    .or("delivered.is.null,delivered.eq.false")
    .not("tdd", "is", null)
    .lte("tdd", end)
    .order("tdd");
  return (data || []).map((j) => ({ ...j, val: Number(j.val) || 0, tp: Number(j.tp) || 0, tpv: Number(j.tpv) || 0, kit: Number(j.kit) || 0, pct: Number(j.pct) || 0, pod: j.pay_on_delivery == null ? null : Number(j.pay_on_delivery),
    tpp: Number(j.tpp) || 0, note: j.note ?? "", escalation: j.escalation ?? null,
    amtNeeded: j.amt_needed == null ? null : Number(j.amt_needed) })) as JobRow[];
}

async function doneTotals(admin: ReturnType<typeof adminClient>, from: string, to: string) {
  const { data } = await admin.from("delivered_jobs")
    .select("val, tp, tpv, delivered_on").gte("delivered_on", from).lte("delivered_on", to).limit(5000);
  const rows = data || [];
  return {
    nos: rows.length,
    value: rows.reduce((s, r) => s + (Number(r.val) || 0), 0),
    throughput: rows.reduce((s, r) => s + tpOf({ tp: Number(r.tp) || 0, tpv: Number(r.tpv) || 0 }), 0),
  };
}

export async function GET(req: Request) {
  try {
    const u = await requireUser();
    if (!mayPlan(u)) throw new HttpError(403, "The plan desk is for planners, project owners, admins and Stratcom.");
    const admin = adminClient();
    const kq = new URL(req.url).searchParams.get("kind");
    const kind = kq === "qtd" ? "qtd" : kq === "ytd" ? "ytd" : "mtd";
    const w = windowOf(kind);
    const fy = fyWindow();
    const T = istToday();

    const [jobs, done, doneFy] = await Promise.all([
      moreJobs(admin, w.end),
      doneTotals(admin, w.from, T),
      doneTotals(admin, fy.from, T),
    ]);
    let entries: Record<string, unknown>[] = [];
    let signoff: Record<string, unknown> | null = null;
    try {
      const { data: e } = await admin.from("plan_belief").select("*").eq("by_email", u.email.toLowerCase());
      entries = e || [];
      const { data: s } = await admin.from("plan_signoff").select("*")
        .eq("by_email", u.email.toLowerCase()).eq("period_kind", kind).eq("period_key", w.key)
        .order("signed_at", { ascending: false }).limit(1);
      signoff = s?.[0] ?? null;
    } catch { return NextResponse.json({ installed: false, window: w, jobs: [], done, doneFy, entries: [], signoff: null, room: [] }); }

    /**
     * WHO IS READY (Dr Raghu, 1 Sep 2026: "the final one will only be once
     * they are all ready for it").
     *
     * The signature is his to give, but it should not be given blind — so
     * the desk shows the room: everyone who has saved a draft or signed for
     * this period, latest word each, with the numbers they stood behind.
     * Waiting for people is only possible if you can see who you are waiting
     * for.
     */
    let room: Record<string, unknown>[] = [];
    try {
      const { data: all } = await admin.from("plan_signoff")
        .select("by_email, is_draft, signed_at, jobs, value, throughput, realistic_jobs, realistic_value, realistic_throughput")
        .eq("period_kind", kind).eq("period_key", w.key)
        .order("signed_at", { ascending: false }).limit(400);
      const latest = new Map<string, Record<string, unknown>>();
      for (const r of all || []) {
        const who = String(r.by_email || "").toLowerCase();
        if (!who || latest.has(who)) continue;   // ordered desc, so the first is the latest
        latest.set(who, r as Record<string, unknown>);
      }
      room = [...latest.values()];
    } catch { room = []; }

    return NextResponse.json({ installed: true, window: w, today: T, jobs, done, doneFy, entries, signoff, room });
  } catch (e) {
    return errJson(e);
  }
}

export async function POST(req: Request) {
  try {
    const u = await requireUser();
    if (!mayPlan(u)) throw new HttpError(403, "The plan desk is for planners, project owners, admins and Stratcom.");
    const admin = adminClient();
    const body = await req.json();
    const action = String(body.action || "");
    const me = u.email.toLowerCase();

    if (action === "entry") {
      const job_id = String(body.job_id || "");
      if (!job_id) throw new HttpError(400, "Which job?");
      const belief = Number(body.belief_pct);
      if (!BELIEFS.has(belief)) throw new HttpError(400, "Belief must be one of 0 · 10 · 25 · 50 · 75 · 90 · 100.");
      const { error } = await admin.from("plan_belief").upsert({
        job_id, by_email: me,
        comment: String(body.comment || "").slice(0, 600) || null,
        belief_pct: belief,
        best_estimate: String(body.best_estimate || "").slice(0, 10) || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "job_id,by_email" });
      if (error) {
        if (/plan_belief|does not exist|schema cache/i.test(error.message))
          throw new HttpError(503, "Run migration 0103 first — the plan desk has nowhere to write yet.");
        throw new Error(error.message);
      }
      return NextResponse.json({ ok: true });
    }

    /**
     * SAVE AS DRAFT / SIGN (Dr Raghu, 1 Sep 2026: "keep a button for Save as
     * draft, and then the final one will only be once they are all ready").
     *
     * The same arithmetic either way — the difference is what it MEANS. A
     * draft says "this is my read so far" and stays in the building; the
     * signature says "this is my Plan" and goes out by mail. Anything else
     * would make a half-finished read look like a commitment.
     */
    if (action === "sign" || action === "draft") {
      const isDraft = action === "draft";
      const kind = body.kind === "qtd" ? "qtd" : body.kind === "ytd" ? "ytd" : "mtd";
      const w = windowOf(kind);
      const T = istToday();
      const jobs = await moreJobs(admin, w.end);
      const { data: eRows } = await admin.from("plan_belief").select("*").eq("by_email", me);
      const eBy = new Map((eRows || []).map((e) => [String(e.job_id), e]));

      // the PLAN as stated: every job the window holds
      const plan = { jobs: jobs.length, value: 0, throughput: 0 };
      // the REALISTIC read: my best-estimate dates decide membership, my
      // belief weights the money, and a dead belief (0) leaves the plan
      const real = { jobs: 0, value: 0, throughput: 0 };
      const snapshot: Record<string, unknown>[] = [];
      for (const j of jobs) {
        plan.value += j.val; plan.throughput += tpOf(j);
        const e = eBy.get(String(j.id));
        const belief = e ? Number(e.belief_pct) : 100;
        const est = String(e?.best_estimate || j.tdd || "").slice(0, 10);
        const inWindow = est >= w.from && est <= w.end;
        if (inWindow && belief > 0) {
          real.jobs += belief >= 50 ? 1 : 0;
          real.value += (j.val * belief) / 100;
          real.throughput += (tpOf(j) * belief) / 100;
        }
        snapshot.push({ id: j.id, tag: j.tag, val: j.val, tp: tpOf(j), tdd: j.tdd, belief, best_estimate: est || null, comment: e?.comment ?? null });
      }
      const done = await doneTotals(admin, w.from, T);

      // freeze it
      const { data: signed, error: se } = await admin.from("plan_signoff").insert({
        by_email: me, period_kind: kind, period_key: w.key,
        jobs: plan.jobs, value: plan.value, throughput: plan.throughput,
        realistic_jobs: real.jobs, realistic_value: Math.round(real.value), realistic_throughput: Math.round(real.throughput),
        snapshot, emailed: null, is_draft: isDraft,
      }).select("id").single();
      if (se) {
        if (/is_draft/i.test(se.message))
          throw new HttpError(503, "Run migration 0109 first — a draft has nowhere to be told apart from a signature yet.");
        if (/plan_signoff|does not exist|schema cache/i.test(se.message))
          throw new HttpError(503, "Run migration 0103 first — the signature has nowhere to live yet.");
        throw new Error(se.message);
      }

      // the mail — attempted, never load-bearing, and NEVER for a draft:
      // a mail is what makes a number other people's business.
      let mailed = "";
      const key = isDraft ? "" : process.env.RESEND_API_KEY;
      if (key) {
        const html = `
<p><b>${u.displayName || u.email}</b> signed the ${w.label} plan (${w.key}) on ${T} (IST).</p>
<table border="1" cellpadding="6" style="border-collapse:collapse">
<tr><th></th><th>Jobs</th><th>Value</th><th>Throughput</th></tr>
<tr><td><b>Done so far</b></td><td>${done.nos}</td><td>${cr(done.value)}</td><td>${cr(done.throughput)}</td></tr>
<tr><td><b>The plan (all jobs due by ${w.end})</b></td><td>${plan.jobs}</td><td>${cr(plan.value)}</td><td>${cr(plan.throughput)}</td></tr>
<tr><td><b>The realistic plan (my dates, my belief)</b></td><td>${real.jobs} at ≥50% belief</td><td>${cr(real.value)}</td><td>${cr(real.throughput)}</td></tr>
</table>
<p style="color:#777">Belief-weighted, on my best-estimate dates. Signed in Genie — the job-by-job working is on the Month &amp; Quarter Plan desk.</p>`;
        try {
          const r = await fetch("https://api.resend.com/emails", {
            method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
            body: JSON.stringify({
              from: "Genie <hr@nandan.co.in>",
              to: [u.email], cc: [STRATCOM_CC],
              subject: `${w.label} plan · ${w.key} · signed by ${u.displayName || u.email}`,
              html,
            }),
          });
          mailed = r.ok ? `${u.email} · cc ${STRATCOM_CC}` : `send failed (${r.status})`;
        } catch { mailed = "send failed (network)"; }
      } else mailed = "RESEND_API_KEY not set";
      if (signed?.id)
        await admin.from("plan_signoff").update({ emailed: mailed }).eq("id", signed.id).then(() => null, () => null);

      return NextResponse.json({ ok: true, window: w, done, plan, realistic: real, mailed });
    }

    throw new HttpError(400, `Unknown action "${action}"`);
  } catch (e) {
    return errJson(e);
  }
}
