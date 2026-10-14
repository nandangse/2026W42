import { NextResponse } from "next/server";
import { errJson, HttpError, RAGHU_EMAIL } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { requireCeo } from "@/lib/ceo/auth";
import { pnlOf } from "@/lib/kuber-oe";
import { lcMembers } from "@/lib/lc/auth";
import { istDay, fyStartOf, lastMonthEnd } from "@/lib/ceo/figures";
import { swallow } from "@/lib/swallow";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * /api/ceo/strategy — THE STRATEGY ROOM AS STRATEGIC ACTION (Dr Raghu, 14 Oct
 * 2026: "this strategy doesn't need this kind of numbers, it needs the
 * strategic action. As a world class coach what would you put on this page?").
 *
 *   GET   the direction (Breakthrough 2027), the pace against the year's
 *         targets, the twenty conditions with owners and status, the leaders'
 *         99-day rocks, the decisions waiting, the council's start/stop/continue
 *         with the most support, and the rhythm of review
 *   POST  set {key,value} | condition {id, owner_email?, status?, note?} | add {kind,title} | remove {id}
 */
type R = Record<string, unknown>;
const S = (v: unknown) => String(v ?? "").trim();
const N = (v: unknown) => Number(v) || 0;

export async function GET() {
  try {
    await requireCeo();
    const admin = adminClient();
    const today = istDay(); const fy = fyStartOf(today);
    const [{ data: kvRows, error: kvErr }, { data: conds }, members] = await Promise.all([
      admin.from("ceo_strategy").select("key, value, updated_by, updated_at"),
      admin.from("ceo_condition").select("*").order("kind").order("sort"),
      lcMembers(admin, RAGHU_EMAIL).catch(() => []),
    ]);
    if (kvErr && /does not exist|schema cache/i.test(kvErr.message)) return NextResponse.json({ installed: false });
    const kv: Record<string, string> = Object.fromEntries((kvRows || []).map((r) => [S(r.key), S(r.value)]));

    /* ON PACE? — the year's targets against the books (as fresh as Tally) and the floor */
    let pace: R | null = null;
    try {
      /* to the last month-end — the closing stock is counted only there, so PBT % struck mid-month would be wrong */
      const pnlTo = lastMonthEnd(today);
      const p = pnlTo >= fy ? await pnlOf(admin, fy, pnlTo) : null;
      const booksTo = pnlTo;
      const frac = Math.max(0.01, (Date.parse(booksTo) - Date.parse(fy) + 864e5) / (365 * 864e5));
      const sales = p?.sales || 0;
      const exports = (p?.g.lines || []).filter((l) => l.kind === "sales" && /export/i.test(`${l.ledger} ${l.group}`)).reduce((s, l) => s + l.amount, 0);
      const { data: dj } = await admin.from("delivered_jobs").select("delivered_on, otd, tdd").gte("delivered_on", fy).lte("delivered_on", today);
      const dated = (dj || []).filter((j) => S(j.otd) || S(j.tdd));
      const onTime = dated.filter((j) => S(j.delivered_on) <= (S(j.otd) || S(j.tdd))).length;
      pace = {
        books_to: booksTo, year_fraction: frac,
        sales, sales_target: N(kv.target_sales), sales_expected: N(kv.target_sales) * frac, sales_projected: sales / frac,
        pbt: p?.pbt || 0, pbt_pct: sales ? ((p?.pbt || 0) / sales) * 100 : 0, pbt_pct_target: N(kv.target_pbt_pct),
        exports, exports_target: N(kv.target_exports), exports_expected: N(kv.target_exports) * frac,
        otd_pct: dated.length ? (onTime / dated.length) * 100 : null, otd_jobs: dated.length, otd_on_time: onTime, otd_target: N(kv.target_otd_pct),
        founder_hours: kv.founder_hours ? N(kv.founder_hours) : null, founder_target: N(kv.target_founder_hours),
      };
    } catch (e) { swallow("ceo/strategy/pace", e); }

    /* THE ROCKS — each leader's latest 99-day plan from the check-ins */
    const { data: cks } = await admin.from("lc_checkin").select("email, plan_99, goals, on_date, meeting_id").order("on_date", { ascending: false });
    const seen = new Set<string>(); const rocks: R[] = [];
    for (const c of cks || []) { if (seen.has(S(c.email)) || !S(c.plan_99)) continue; seen.add(S(c.email)); rocks.push({ email: c.email, name: members.find((m) => m.email === S(c.email))?.name || S(c.email).split("@")[0], plan_99: c.plan_99, on_date: c.on_date, meeting_id: c.meeting_id }); }

    /* THE DECISIONS WAITING — the Solution Board's open problems, blocked first, then the oldest */
    const { data: probs } = await admin.from("lc_problem").select("id, title, status, tentative_on, created_at, added_by").in("status", ["needs_deep_dive", "new", "under_process"]);
    const order = { needs_deep_dive: 0, new: 1, under_process: 2 } as Record<string, number>;
    const decisions = (probs || []).sort((a, b) => (order[S(a.status)] - order[S(b.status)]) || S(a.created_at).localeCompare(S(b.created_at))).slice(0, 10)
      .map((p) => ({ ...p, age: Math.round((Date.parse(today) - Date.parse(S(p.created_at).slice(0, 10))) / 864e5), overdue: !!S(p.tentative_on) && S(p.tentative_on) < today }));

    /* START · STOP · CONTINUE — what the council backs most */
    const [{ data: ssc }, { data: reacts }] = await Promise.all([
      admin.from("lc_ssc").select("id, kind, title, added_by, created_at"),
      admin.from("lc_reaction").select("ref_id, value").eq("ref_kind", "ssc"),
    ]);
    const score = (id: string) => (reacts || []).filter((r) => r.ref_id === id && r.value === "up").length - (reacts || []).filter((r) => r.ref_id === id && r.value === "down").length;
    const backed: Record<string, R[]> = { start: [], stop: [], continue: [] };
    for (const k of ["start", "stop", "continue"]) backed[k] = (ssc || []).filter((x) => x.kind === k).map((x) => ({ ...x, score: score(S(x.id)) })).sort((a, b) => N(b.score) - N(a.score)).slice(0, 3);

    /* THE RHYTHM */
    const { data: meets } = await admin.from("lc_meeting").select("id, held_on, location").order("held_on", { ascending: false }).limit(20);
    const last = (meets || []).find((m) => S(m.held_on) <= today) || null;
    const next = [...(meets || [])].reverse().find((m) => S(m.held_on) > today) || null;
    const lastReview = (conds || []).map((c) => S(c.reviewed_at)).filter(Boolean).sort().pop() || null;

    return NextResponse.json({ installed: true, today, kv, conditions: conds || [], members: members.map((m) => ({ email: m.email, name: m.name })), pace, rocks, decisions, backed, rhythm: { last, next, last_review: lastReview } });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const me = await requireCeo();
    const admin = adminClient();
    const b = (await req.json().catch(() => ({}))) as R;
    const now = new Date().toISOString();
    if (b.action === "set") {
      const key = S(b.key); if (!/^[a-z_]{2,40}$/.test(key)) throw new HttpError(400, "Which line?");
      const { error } = await admin.from("ceo_strategy").upsert({ key, value: S(b.value).slice(0, 2000), updated_by: me.email, updated_at: now }, { onConflict: "key" });
      if (error) throw error; return NextResponse.json({ ok: true });
    }
    if (b.action === "condition") {
      const patch: R = { reviewed_at: now, reviewed_by: me.email };
      if (b.owner_email !== undefined) patch.owner_email = S(b.owner_email) || null;
      if (b.status !== undefined) { if (!["green", "amber", "red", "grey"].includes(S(b.status))) throw new HttpError(400, "Not a status."); patch.status = S(b.status); }
      if (b.note !== undefined) patch.note = S(b.note).slice(0, 1000);
      const { error } = await admin.from("ceo_condition").update(patch).eq("id", S(b.id));
      if (error) throw error; return NextResponse.json({ ok: true });
    }
    if (b.action === "add") {
      const kind = S(b.kind) === "csf" ? "csf" : "nms"; const title = S(b.title); if (!title) throw new HttpError(400, "Name it.");
      const { count } = await admin.from("ceo_condition").select("*", { count: "exact", head: true }).eq("kind", kind);
      const { error } = await admin.from("ceo_condition").insert({ kind, title, sort: (count || 0) + 1 });
      if (error) throw error; return NextResponse.json({ ok: true });
    }
    if (b.action === "remove") {
      const { error } = await admin.from("ceo_condition").delete().eq("id", S(b.id));
      if (error) throw error; return NextResponse.json({ ok: true });
    }
    throw new HttpError(400, "Unknown action.");
  } catch (e) { return errJson(e); }
}
