import { NextResponse } from "next/server";
import { errJson } from "@/lib/auth";
import { requireSeva } from "@/lib/seva";
import { adminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/seva/analytics — the support tickets, made sense of (Dr Raghu,
 * 3 Oct 2026: "make an analytics page for this. Show graphs and tables that
 * make sense of what's happening. We should also be able to drill it down").
 *
 * One call, one answer: the filtered set's headline numbers, its month by
 * month, its breakdowns on every tag the ERP keeps (type, problem, customer,
 * machine, site, engineer, agreement, status, closure rating, job), the
 * ageing of what is still open, and the first few hundred tickets behind
 * the figures. Every filter is a query parameter, so a click on a bar is a
 * filter and the whole page re-answers — that is the drill.
 *
 * DAYS TO RESOLVE is resolved_at − issue_date; a ticket still open is aged
 * to today instead and never counted as resolved. Costs and billing are the
 * ERP's own cost_spent and amount_billed, summed as they stand.
 */
type Doc = Record<string, unknown>;
const S = (v: unknown) => String(v ?? "").trim();
const N = (v: unknown) => Number(v) || 0;
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const days = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);

const COLS = "id, erp_name, title, customer, machine, equipment, location, job_number, job_numbers, type_of_support, problem_type, status, owner, attended_by, handled_by, agreement_status, closure_rating, pending_action_status, raised_as_nc, via_portal, amount_billed, cost_spent, mandays_invested, issue_date, opening_date, resolved_at, due, at, frf_no, erp->user_resolution_time, erp->final_resolution_date";
/** The engineer is who ATTENDED (an e-mail on the ERP); handled_by is the coordinator's initials — AG on three in four. */
const who = (v: unknown) => S(v).split("@")[0];
/** A warranty ticket is a Warranty Call by type, or one whose agreement says so. */
const isWarranty = (r: Doc) => /warrant/i.test(S(r.type_of_support)) || /warrant/i.test(S(r.agreement_status));
/**
 * DAYS TO RESOLVE, from the ERP's own clock only: its final_resolution_date
 * against the issue date, else its user_resolution_time (seconds, hold time
 * out). A closed ticket with neither is not given a number — most were
 * closed in bulk long after the visit, and `modified` would lie.
 */
const resolveDays = (r: Doc, dateOf: (r: Doc) => string): number | null => {
  const f = S(r.final_resolution_date).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(f) && dateOf(r)) return Math.max(0, days(dateOf(r), f));
  const secs = Number(r.user_resolution_time) || 0;
  if (secs > 0) return Math.round((secs / 86400) * 10) / 10;
  return null;
};

const DIMS: Record<string, (r: Doc) => string> = {
  type: (r) => S(r.type_of_support) || "(no type)",
  problem: (r) => S(r.problem_type) || "(no problem type)",
  customer: (r) => S(r.customer) || "(no customer)",
  machine: (r) => S(r.equipment) || S(r.machine) || "(no machine)",
  location: (r) => S(r.location) || "(no site)",
  engineer: (r) => who(r.attended_by) || "(nobody attended)",
  coordinator: (r) => S(r.handled_by) || "(nobody)",
  agreement: (r) => S(r.agreement_status) || "(not said)",
  status: (r) => S(r.status) || "(no status)",
  rating: (r) => S(r.closure_rating) || "(not rated)",
  job: (r) => S(r.job_number) || S(r.job_numbers) || "(no job)",
  pending: (r) => S(r.pending_action_status) || "(none)",
};

export async function GET(req: Request) {
  try {
    await requireSeva();
    const admin = adminClient();
    const url = new URL(req.url);
    const p = (k: string) => S(url.searchParams.get(k));
    const t = today();
    const from = /^\d{4}-\d{2}-\d{2}$/.test(p("from")) ? p("from") : "";
    const to = /^\d{4}-\d{2}-\d{2}$/.test(p("to")) ? p("to") : "";
    const q = p("q").toLowerCase();

    const rows: Doc[] = [];
    for (let a = 0; ; a += 1000) {
      const { data, error } = await admin.from("seva_issue").select(COLS).range(a, a + 999);
      if (error) { if (/does not exist|schema cache/i.test(error.message)) break; throw new Error(error.message); }
      rows.push(...((data ?? []) as unknown as Doc[]));
      if (!data || data.length < 1000) break;
    }
    const dateOf = (r: Doc) => (S(r.issue_date) || S(r.opening_date) || S(r.at)).slice(0, 10);
    const closed = (r: Doc) => /closed|resolved/i.test(S(r.status));

    /* the filters — every dimension, the dates, free words */
    let set = rows;
    for (const [k, f] of Object.entries(DIMS)) { const v = p(k); if (v) set = set.filter((r) => f(r) === v); }
    if (from) set = set.filter((r) => dateOf(r) >= from);
    if (to) set = set.filter((r) => dateOf(r) <= to);
    if (p("open") === "1") set = set.filter((r) => !closed(r));
    if (p("warranty") === "1") set = set.filter(isWarranty);
    if (p("nc") === "1") set = set.filter((r) => r.raised_as_nc === true);
    if (q) set = set.filter((r) => `${S(r.erp_name)} ${S(r.title)} ${S(r.customer)} ${S(r.equipment)} ${S(r.location)} ${S(r.job_number)}`.toLowerCase().includes(q));

    /* headline */
    const open = set.filter((r) => !closed(r));
    const resolvedDays = set.filter(closed).map((r) => resolveDays(r, dateOf)).filter((d): d is number => d !== null);
    const closedN = set.filter(closed).length;
    const sorted = [...resolvedDays].sort((a, b) => a - b);
    const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
    const avg = sorted.length ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length) : null;
    const within7 = sorted.length ? Math.round((sorted.filter((d) => d <= 7).length / sorted.length) * 100) : null;
    const cost = set.reduce((a, r) => a + N(r.cost_spent), 0);
    const billed = set.reduce((a, r) => a + N(r.amount_billed), 0);
    const mandays = set.reduce((a, r) => a + N(r.mandays_invested), 0);
    const warranty = set.filter(isWarranty);
    const nc = set.filter((r) => r.raised_as_nc === true);

    /* month by month — opened, closed (by resolved_at), cost */
    const months = new Map<string, { opened: number; closed: number; cost: number; billed: number }>();
    const bump = (m: string) => { if (!/^\d{4}-\d{2}$/.test(m)) return null; const o = months.get(m) ?? { opened: 0, closed: 0, cost: 0, billed: 0 }; months.set(m, o); return o; };
    for (const r of set) {
      const o = bump(dateOf(r).slice(0, 7)); if (o) { o.opened++; o.cost += N(r.cost_spent); o.billed += N(r.amount_billed); }
      if (closed(r) && S(r.resolved_at)) { const c = bump(S(r.resolved_at).slice(0, 7)); if (c) c.closed++; }
    }
    const monthly = [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, ...v }));

    /* breakdowns, each with count · open · avg days · cost · billed */
    const breakdown = (f: (r: Doc) => string, limit = 20) => {
      const m = new Map<string, { key: string; n: number; open: number; days: number[]; cost: number; billed: number; warranty: number }>();
      for (const r of set) {
        const k = f(r);
        const o = m.get(k) ?? { key: k, n: 0, open: 0, days: [], cost: 0, billed: 0, warranty: 0 };
        o.n++; if (!closed(r)) o.open++;
        if (closed(r)) { const d = resolveDays(r, dateOf); if (d !== null) o.days.push(d); }
        o.cost += N(r.cost_spent); o.billed += N(r.amount_billed); if (isWarranty(r)) o.warranty++;
        m.set(k, o);
      }
      const all = [...m.values()].sort((a, b) => b.n - a.n);
      const top = all.slice(0, limit).map((o) => ({ key: o.key, n: o.n, open: o.open, avg_days: o.days.length ? Math.round(o.days.reduce((a, b) => a + b, 0) / o.days.length) : null, cost: o.cost, billed: o.billed, warranty: o.warranty }));
      return { rows: top, more: Math.max(0, all.length - limit), distinct: all.length };
    };
    const by: Record<string, ReturnType<typeof breakdown>> = {};
    for (const [k, f] of Object.entries(DIMS)) by[k] = breakdown(f, k === "customer" || k === "machine" || k === "location" || k === "job" ? 25 : 15);

    /* ageing of what is still open */
    const age = (r: Doc) => Math.max(0, days(dateOf(r) || t, t));
    const bands = [["0–7 days", 0, 7], ["8–30 days", 8, 30], ["31–90 days", 31, 90], ["91–365 days", 91, 365], ["over a year", 366, 1e9]] as const;
    const ageing = bands.map(([label, lo, hi]) => ({ label, n: open.filter((r) => { const d = age(r); return d >= lo && d <= hi; }).length, cost: open.filter((r) => { const d = age(r); return d >= lo && d <= hi; }).reduce((a, r) => a + N(r.cost_spent), 0) }));

    /* the tickets behind the figures — newest first, a page */
    const list = [...set].sort((a, b) => dateOf(b).localeCompare(dateOf(a))).slice(0, 300).map((r) => ({
      id: S(r.id), erp_name: S(r.erp_name), title: S(r.title), customer: S(r.customer), machine: S(r.equipment) || S(r.machine), location: S(r.location),
      job: S(r.job_number) || S(r.job_numbers), type: S(r.type_of_support), problem: S(r.problem_type), status: S(r.status),
      engineer: who(r.attended_by) || S(r.handled_by), agreement: S(r.agreement_status), opened: dateOf(r), resolved: S(r.resolved_at).slice(0, 10) || null,
      days: closed(r) ? resolveDays(r, dateOf) : age(r), cost: N(r.cost_spent), billed: N(r.amount_billed),
    }));

    return NextResponse.json({
      ok: true, today: t, total_all: rows.length,
      head: { n: set.length, open: open.length, closed: closedN, resolved: sorted.length, avg_days: avg, median_days: median, within_7_pct: within7, cost, billed, mandays, warranty: warranty.length, warranty_cost: warranty.reduce((a, r) => a + N(r.cost_spent), 0), nc: nc.length },
      monthly, by, ageing, list, list_total: set.length,
    });
  } catch (e) {
    return errJson(e);
  }
}
