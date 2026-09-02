import { NextResponse } from "next/server";
import { requireUser, errJson, HttpError, type AuthedUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
/**
 * WHO SEES A SIGNED PLAN (Dr Raghu, 1 Sep 2026: "cc: raghu, tushar, pankaj").
 * The signer is the To — it is their plan and their commitment; these three
 * are the standing witnesses. Named here rather than typed at the send, so
 * changing the list is one edit and not a hunt.
 */
const PLAN_CC = ["raghu@nandan.co.in", "tushar@nandan.co.in", "pankajs@nandan.co.in"];

const istToday = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
const cr = (n: number) => `₹${(n / 1e7).toFixed(2)} Cr`;
/** 2026-09-01 → 01-09-2026, the way a plan is read aloud here. */
const esc = (x: unknown) => String(x ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const dmy = (iso: string) => {
  const s2 = String(iso || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s2) ? s2.split("-").reverse().join("-") : "—";
};

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

/**
 * THE DESK IS EVERYONE'S; THE JOB BOX IS NOT (Dr Raghu, 1 Sep 2026: "this
 * should be accessible for all. they all need to fill it up" — and earlier,
 * "this box and the edits are visible to planning and leaders only").
 *
 * Two different questions, and they were being answered by one gate:
 *
 *   WHO WRITES A BELIEF — anybody signed in. A plan crowdsourced from five
 *     planners is five opinions; crowdsourced from everyone who touches the
 *     work it is a reading of the company. That is the whole ask.
 *   WHO OPENS A JOB — planning and leaders. That box carries the value, the
 *     throughput and what is still owed on delivery, and it edits kitting and
 *     production straight into the ERP queue. Neither belongs to everyone who
 *     can hold an opinion about a date.
 *
 * So mayPlan no longer decides whether the desk opens. It decides `canEdit`,
 * and nothing else.
 */
/** Everybody's words on a set of jobs, over their initials. */
async function voicesFor(admin: ReturnType<typeof adminClient>, ids: string[]) {
  const out: Record<string, { initials: string; belief: number; comment: string }[]> = {};
  if (!ids.length) return out;
  try {
    const { data: all } = await admin.from("plan_belief")
      .select("job_id, by_email, belief_pct, comment").in("job_id", ids);
    const emails = [...new Set((all || []).map((r) => String(r.by_email).toLowerCase()))];
    const ini = new Map<string, string>();
    if (emails.length) {
      const { data: profs } = await admin.from("profiles").select("email, initials, display_name").in("email", emails);
      for (const pr of profs || []) {
        const e = String(pr.email || "").toLowerCase();
        ini.set(e, String(pr.initials || String(pr.display_name || e).split(/[@ ]/)[0]).toUpperCase().slice(0, 4));
      }
    }
    for (const r of all || []) {
      const c = String(r.comment || "").trim();
      if (!c) continue;
      (out[String(r.job_id)] = out[String(r.job_id)] || []).push({
        initials: ini.get(String(r.by_email).toLowerCase()) || String(r.by_email).split("@")[0].slice(0, 4).toUpperCase(),
        belief: Number(r.belief_pct) || 0, comment: c,
      });
    }
  } catch { /* the document still prints without them */ }
  return out;
}

const mayPlan = (u: AuthedUser) =>
  u.isOwner || u.stratcom || ["admin", "planner", "project_owner"].includes(String(u.role));

// kit and pct ride along (Dr Raghu, 1 Sep 2026: "In this also show kitting%
// and production %"). A belief about a delivery date is worth more when the
// two numbers behind it are on the same row: 100% believed on a job that is
// 20% kitted is a sentence that should be hard to write.
type JobRow = { id: string; tag: string | null; cust: string | null; fam: string | null; val: number; tp: number; tpv: number; tdd: string | null; kit: number; pct: number; pod: number | null; tpp: number; note: string; escalation: string | null; amtNeeded: number | null; stat: string | null; own: string | null; proj: string | null; otd: string | null };
const tpOf = (j: { tp: number; tpv: number }) => (Number(j.tpv) || 0) > 0 ? Number(j.tpv) : Number(j.tp) || 0;

const JOB_COLS = "id, tag, cust, fam, val, tp, tpv, tdd, kit, pct, stat, own, proj, otd, pay_on_delivery, tpp, note, escalation, amt_needed";
const mapJob = (j: Record<string, unknown>): JobRow => ({
  ...(j as object),
  val: Number(j.val) || 0, tp: Number(j.tp) || 0, tpv: Number(j.tpv) || 0,
  kit: Number(j.kit) || 0, pct: Number(j.pct) || 0,
  pod: j.pay_on_delivery == null ? null : Number(j.pay_on_delivery),
  tpp: Number(j.tpp) || 0, note: (j.note as string) ?? "", escalation: (j.escalation as string) ?? null,
  amtNeeded: j.amt_needed == null ? null : Number(j.amt_needed),
} as JobRow);

/**
 * THE JOBS THIS PERIOD HOLDS — including the ones PULLED IN
 * (Dr Raghu, 1 Sep 2026: "I changed the job of October to September. I need
 * to make sure that it comes into my quarter plan when I look at it").
 *
 * The board's own target date decides who is here by default. But the whole
 * point of "my best estimate" is that a planner may disagree with it, and
 * disagreement runs BOTH WAYS: pushing a job out was always visible, while
 * pulling one in was impossible — a job dated October never appeared on the
 * September desk at all, so there was no row on which to say "actually, this
 * lands in September".
 *
 * So the list is the union: every job the board dates inside the window, plus
 * every job THIS PLANNER has dated into it. A job pulled in arrives with its
 * real ERP date showing, so nobody mistakes the opinion for the record.
 */
async function moreJobs(
  admin: ReturnType<typeof adminClient>, end: string,
  pull?: { from: string; email: string },
): Promise<JobRow[]> {
  const { data } = await admin.from("jobs")
    .select(JOB_COLS)
    .eq("active", true)
    .or("delivered.is.null,delivered.eq.false")
    .not("tdd", "is", null)
    .lte("tdd", end)
    .order("tdd");
  const base = (data || []).map((j) => mapJob(j as Record<string, unknown>));
  if (!pull) return base;

  const have = new Set(base.map((j) => String(j.id)));
  const { data: mine } = await admin.from("plan_belief")
    .select("job_id, best_estimate")
    .eq("by_email", pull.email.toLowerCase())
    .gte("best_estimate", pull.from)
    .lte("best_estimate", end);
  const extra = [...new Set((mine || []).map((r) => String(r.job_id)))].filter((id) => !have.has(id));
  if (!extra.length) return base;

  const { data: more } = await admin.from("jobs")
    .select(JOB_COLS)
    .in("id", extra)
    .eq("active", true)
    .or("delivered.is.null,delivered.eq.false");
  const pulled = (more || []).map((j) => mapJob(j as Record<string, unknown>));
  return [...base, ...pulled].sort((a, b) => String(a.tdd || "9999").localeCompare(String(b.tdd || "9999")));
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
    /**
     * ?pdf=1 — the signed plan as a document (Dr Raghu, 1 Sep 2026: "let the
     * pdf be available on top after they submit the plan too … not in draft").
     *
     * Rebuilt from the SNAPSHOT the signature stored, never from today's
     * table: the point of a signed plan is that it says what was signed, and
     * a PDF that quietly re-rendered from live data would be a different
     * document wearing the same date. A draft has nothing to hand over.
     */
    const pu = new URL(req.url);
    if (pu.searchParams.get("pdf")) {
      const u0 = await requireUser();
      const kq0 = pu.searchParams.get("kind");
      const k0 = kq0 === "qtd" ? "qtd" : kq0 === "ytd" ? "ytd" : "mtd";
      const w0 = windowOf(k0);
      const admin0 = adminClient();
      const { data: sg } = await admin0.from("plan_signoff").select("*")
        .eq("by_email", u0.email.toLowerCase()).eq("period_kind", k0).eq("period_key", w0.key)
        .eq("is_draft", false).order("signed_at", { ascending: false }).limit(1);
      const row = sg?.[0];
      const { planPdfHtml } = await import("@/lib/plan-pdf");
      let html: string;
      if (row) {
        // the signed thing, exactly as it was signed
        html = planPdfHtml({
          title: `Plan of ${u0.displayName || u0.email.split("@")[0]} Dated ${dmy(String(row.signed_at).slice(0, 10))}`,
          window: w0,
          snapshot: (row.snapshot as Record<string, unknown>[]) || [],
          plan: { jobs: Number(row.jobs) || 0, value: Number(row.value) || 0, throughput: Number(row.throughput) || 0 },
          real: { jobs: Number(row.realistic_jobs) || 0, value: Number(row.realistic_value) || 0, throughput: Number(row.realistic_throughput) || 0 },
          signedOn: dmy(String(row.signed_at).slice(0, 10)),
          state: u0.isOwner ? "approved" : "frozen",
          voices: await voicesFor(admin0, ((row.snapshot as Record<string, unknown>[]) || []).map((r) => String(r.id))),
        });
      } else {
        /**
         * NOTHING SIGNED YET (Dr Raghu, 1 Sep 2026: "I should be able to see
         * the pdf regardless!"). Planning and leaders get the plan AS IT
         * STANDS — the one under discussion is exactly the one worth reading.
         * It is stamped UNSIGNED in the title so nobody can mistake a working
         * document for a commitment.
         */
        const T0 = istToday();
        const jobs0 = await moreJobs(admin0, w0.end, { from: w0.from, email: u0.email });
        const { data: e0 } = await admin0.from("plan_belief").select("*").eq("by_email", u0.email.toLowerCase());
        const by0 = new Map((e0 || []).map((e) => [String(e.job_id), e]));
        const plan0 = { jobs: jobs0.length, value: 0, throughput: 0 };
        const real0 = { jobs: 0, value: 0, throughput: 0 };
        const snap0: Record<string, unknown>[] = [];
        for (const j of jobs0) {
          plan0.value += j.val; plan0.throughput += tpOf(j);
          const e = by0.get(String(j.id));
          const belief = e ? Number(e.belief_pct) : 100;
          const est = String(e?.best_estimate || j.tdd || "").slice(0, 10);
          if (est >= w0.from && est <= w0.end && belief > 0) {
            real0.jobs += belief >= 50 ? 1 : 0;
            real0.value += (j.val * belief) / 100;
            real0.throughput += (tpOf(j) * belief) / 100;
          }
          snap0.push({ id: j.id, tag: j.tag, val: j.val, tp: tpOf(j), tdd: j.tdd, belief, best_estimate: est || null, comment: e?.comment ?? null });
        }
        html = planPdfHtml({
          title: `Plan of ${u0.displayName || u0.email.split("@")[0]} Dated ${dmy(T0)} — UNSIGNED, as it stands`,
          window: w0, snapshot: snap0, plan: plan0,
          real: { jobs: real0.jobs, value: Math.round(real0.value), throughput: Math.round(real0.throughput) },
          signedOn: dmy(T0),
          state: "draft",
          voices: await voicesFor(admin0, jobs0.map((j) => String(j.id))),
        });
      }
      const { pressPdf } = await import("@/lib/pdf-press");
      const pdf = await pressPdf(html);
      return new NextResponse(new Uint8Array(pdf), {
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `inline; filename="Plan ${w0.key} ${(u0.displayName || u0.email.split("@")[0]).replace(/[^A-Za-z0-9 ]/g, "")}.pdf"`,
        },
      });
    }

    const u = await requireUser();
    const admin = adminClient();
    const kq = new URL(req.url).searchParams.get("kind");
    const kind = kq === "qtd" ? "qtd" : kq === "ytd" ? "ytd" : "mtd";
    const w = windowOf(kind);
    const fy = fyWindow();
    const T = istToday();

    const [jobs, done, doneFy] = await Promise.all([
      moreJobs(admin, w.end, { from: w.from, email: u.email }),
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
    } catch { return NextResponse.json({ installed: false, window: w, jobs: [], done, doneFy, entries: [], signoff: null, room: [], voices: {}, canEdit: mayPlan(u), canSeeRoom: u.isOwner, me: { name: u.displayName || u.email.split("@")[0], email: u.email } }); }

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
    /**
     * EVERY VOICE ON EVERY JOB (Dr Raghu, 1 Sep 2026: "on right side show a
     * comments column with all the comments written by all verbatim one on
     * each line … Initials <>% : Comments").
     *
     * VERBATIM is the instruction and the point. A plan is crowdsourced so
     * that the room can disagree in public — planning saying 100% while the
     * floor says 40% is the most useful line on the page, and summarising it
     * away would destroy exactly what it was collected for. So each person's
     * words stand as typed, over their own initials and their own number.
     */
    /**
     * RAGHU ALONE (Dr Raghu, 1 Sep 2026: "the room says should not be seen
     * by others for now" → "only raghu see it!").
     *
     * Withheld at the SOURCE rather than hidden in the screen: a column the
     * browser is told about and merely does not draw is a column anybody can
     * read out of the network tab. And the reason is sound — a person about
     * to give their own belief should not first read everyone else's, or the
     * crowdsourcing collects one opinion wearing five names.
     */
    let voices: Record<string, { initials: string; belief: number; comment: string }[]> = {};
    try {
      if (!u.isOwner) throw new Error("not for this pair of eyes");
      const ids = jobs.map((j) => String(j.id));
      if (ids.length) {
        const { data: all } = await admin.from("plan_belief")
          .select("job_id, by_email, belief_pct, comment").in("job_id", ids);
        const emails = [...new Set((all || []).map((r) => String(r.by_email).toLowerCase()))];
        const ini = new Map<string, string>();
        if (emails.length) {
          const { data: profs } = await admin.from("profiles").select("email, initials, display_name").in("email", emails);
          for (const pr of profs || []) {
            const e = String(pr.email || "").toLowerCase();
            ini.set(e, String(pr.initials || String(pr.display_name || e).split(/[@ ]/)[0]).toUpperCase().slice(0, 4));
          }
        }
        const out: typeof voices = {};
        for (const r of all || []) {
          const c = String(r.comment || "").trim();
          if (!c) continue;                       // a blank says nothing worth a line
          const jid = String(r.job_id);
          (out[jid] = out[jid] || []).push({
            initials: ini.get(String(r.by_email).toLowerCase()) || String(r.by_email).split("@")[0].slice(0, 4).toUpperCase(),
            belief: Number(r.belief_pct) || 0,
            comment: c,
          });
        }
        voices = out;
      }
    } catch { voices = {}; }

    let room: Record<string, unknown>[] = [];
    try {
      /**
       * THE WHOLE ROOM, NOT THIS TAB'S SLICE (Dr Raghu, 2 Sep 2026: "even
       * yashavantha was showing in draft now its disappeared … even raghu had
       * pressed save as draft! what happened to that").
       *
       * Nothing had happened to it. The room was scoped to the period on
       * screen, and people draft under whichever tab they were on — his own
       * two drafts were under YTD, Yashavantha's under MTD, and looking at
       * QTD showed neither. Correct, and indistinguishable from data loss.
       *
       * So the room now shows EVERY person who has answered at all, with the
       * period each of them answered for. Their latest word for THIS period
       * decides the colour; where they have not answered this one, the card
       * says which they did. Nobody can silently vanish from a list they are
       * on, which is the only way "are they all ready?" can be trusted.
       */
      const { data: all } = await admin.from("plan_signoff")
        .select("by_email, is_draft, signed_at, jobs, value, throughput, period_kind, period_key")
        .order("signed_at", { ascending: false }).limit(2000);
      const latest = new Map<string, Record<string, unknown>>();
      for (const r of all || []) {
        const who = String(r.by_email || "").toLowerCase();
        if (!who) continue;
        const here = String(r.period_kind) === kind && String(r.period_key) === w.key;
        const seen = latest.get(who) as Record<string, unknown> | undefined;
        // This period's latest always wins; otherwise their most recent word
        // anywhere stands in, flagged as belonging to another period.
        if (!seen) latest.set(who, { ...r, this_period: here });
        else if (here && !seen.this_period) latest.set(who, { ...r, this_period: here });
      }
      room = [...latest.values()];
      // Real names, so a signature reads as a person rather than a login.
      try {
        const emails = room.map((r) => String(r.by_email).toLowerCase());
        if (emails.length) {
          const { data: profs } = await admin.from("profiles").select("email, display_name").in("email", emails);
          const nm = new Map((profs || []).map((pr) => [String(pr.email).toLowerCase(), String(pr.display_name || "")]));
          room = room.map((r) => ({ ...r, name: nm.get(String(r.by_email).toLowerCase()) || String(r.by_email).split("@")[0] }));
        }
      } catch { /* the initials still stand */ }
    } catch { room = []; }

    return NextResponse.json({ installed: true, window: w, today: T, jobs, done, doneFy, entries, signoff, room, voices, canEdit: mayPlan(u), canSeeRoom: u.isOwner, me: { name: u.displayName || u.email.split("@")[0], email: u.email } });
  } catch (e) {
    return errJson(e);
  }
}

export async function POST(req: Request) {
  try {
    const u = await requireUser();
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
      const jobs = await moreJobs(admin, w.end, { from: w.from, email: u.email });
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

      /**
       * THE PLAN AS A DOCUMENT (Dr Raghu, 1 Sep 2026: "Also attach the PDF").
       *
       * The mail used to carry three summary rows, which is a number without
       * its working. What a signer should be able to open in six months is
       * the plan they actually signed — every job, their date, their belief,
       * and what they said had to happen. So the PDF is the whole table, and
       * it is pressed from the same Chromium the quotations use.
       *
       * The header carries "Plan of <name> Dated <date>", which is the line
       * he asked to be kept: a signed plan that does not say whose it is, is
       * a plan nobody owns.
       */
      const planTitle = `Plan of ${u.displayName || u.email.split("@")[0]} Dated ${dmy(T)}`;
      const { planPdfHtml } = await import("@/lib/plan-pdf");
      const pdfHtml = planPdfHtml({
        title: planTitle, window: w, snapshot, plan, signedOn: dmy(T),
        // Raghu's signature APPROVES the plan; anyone else's FREEZES theirs.
        state: isDraft ? "draft" : (u.isOwner ? "approved" : "frozen"),
        voices: await voicesFor(admin, jobs.map((j) => String(j.id))),
        real: { jobs: real.jobs, value: Math.round(real.value), throughput: Math.round(real.throughput) },
        done: { nos: done.nos, value: done.value, throughput: done.throughput },
      });

      let pdfB64 = "";
      if (!isDraft) {
        try {
          const { pressPdf } = await import("@/lib/pdf-press");
          pdfB64 = (await pressPdf(pdfHtml)).toString("base64");
        } catch { pdfB64 = ""; }   // the mail still goes; it just goes bare
      }

      // the mail — attempted, never load-bearing, and NEVER for a draft:
      // a mail is what makes a number other people's business.
      let mailed = "";
      const key = isDraft ? "" : process.env.RESEND_API_KEY;
      if (key) {
        /**
         * HIS WORDS (Dr Raghu, 1 Sep 2026), tidied only for spelling — the
         * sentiment is the point and it is his: thanks, here it is, now go
         * and make it happen.
         */
        const who = u.displayName || u.email.split("@")[0];
        const html = `
<p>Dear ${esc(who)}</p>
<p>Thanks for submitting the plan. It's as attached!</p>
<p>Now do what it takes to make it happen!</p>
<p>Raghu</p>
<hr>
<p style="color:#777;font-size:12px">
${esc(planTitle)} · ${esc(w.label)} (${esc(w.key)})<br>
The plan as it stands: <b>${plan.jobs} jobs</b> · ${cr(plan.value)} · ${cr(plan.throughput)} throughput<br>
The realistic read, on your dates and your belief: <b>${real.jobs} at 50% or better</b> · ${cr(real.value)} · ${cr(real.throughput)} throughput
</p>`;
        try {
          const fileName = `${planTitle.replace(/[^A-Za-z0-9 .-]/g, "")}.pdf`;
          const r = await fetch("https://api.resend.com/emails", {
            method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
            body: JSON.stringify({
              from: "Raghunandan Jagdish <raghu@nandan.co.in>",
              reply_to: "raghu@nandan.co.in",
              to: [u.email],
              // the standing witnesses, minus the signer if they are one of
              // them — nobody needs their own name in their own cc
              cc: PLAN_CC.filter((a) => a.toLowerCase() !== u.email.toLowerCase()),
              subject: "Thanks for submitting your plan",
              html,
              ...(pdfB64 ? { attachments: [{ filename: fileName, content: pdfB64 }] } : {}),
            }),
          });
          mailed = r.ok
            ? `${u.email} · cc ${PLAN_CC.filter((a) => a.toLowerCase() !== u.email.toLowerCase()).join(", ")}${pdfB64 ? " · PDF attached" : " · PDF could not be pressed"}`
            : `send failed (${r.status})`;
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
