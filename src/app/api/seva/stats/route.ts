import { NextResponse } from "next/server";
import { errJson } from "@/lib/auth";
import { requireSeva } from "@/lib/seva";
import { adminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/seva/stats — the dashboard's numbers, counted on the server
 * (Dr Raghu, 3 Oct 2026: "in dashboard add AMC Valid Live - nos, AMC Valid
 * Live - Value, Issues Open, Pie chart of issue by type, Cost incurred in
 * Warranty (nos)"). Twelve thousand tickets are counted here, not in the
 * browser; the register's 2,000-row page would have counted the wrong ones.
 *
 * LIVE means today sits between the contract's start and end. Not the
 * status word — "AMC valid paid" on a contract that ended in March is still
 * an ended contract.
 *
 * WARRANTY is a ticket whose agreement status says so on the ERP; the cost
 * is the ERP's own cost_spent on those tickets, this financial year and all
 * time, so the number is the ERP's and not a guess.
 */
type Doc = Record<string, unknown>;
const S = (v: unknown) => String(v ?? "").trim();
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const fyStart = (d: string) => (d.slice(5, 7) >= "04" ? `${d.slice(0, 4)}-04-01` : `${Number(d.slice(0, 4)) - 1}-04-01`);

async function all(admin: ReturnType<typeof adminClient>, table: string, cols: string): Promise<Doc[]> {
  const out: Doc[] = [];
  for (let a = 0; ; a += 1000) {
    const { data, error } = await admin.from(table).select(cols).range(a, a + 999);
    if (error) { if (/does not exist|schema cache/i.test(error.message)) return out; throw new Error(error.message); }
    out.push(...((data ?? []) as unknown as Doc[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function GET() {
  try {
    await requireSeva();
    const admin = adminClient();
    const t = today(), fy = fyStart(t);
    const [amcs, issues] = await Promise.all([
      all(admin, "seva_amc", "status, start_date, end_date, value"),
      all(admin, "seva_issue", "status, type_of_support, agreement_status, cost_spent, amount_billed, issue_date, at, due, resolved_at"),
    ]);

    const live = amcs.filter((r) => { const s = S(r.start_date).slice(0, 10), e = S(r.end_date).slice(0, 10); return e >= t && (!s || s <= t); });
    const liveValue = live.reduce((a, r) => a + (Number(r.value) || 0), 0);

    const closed = (r: Doc) => /closed|resolved/i.test(S(r.status));
    const open = issues.filter((r) => !closed(r));
    const overdue = open.filter((r) => S(r.due) && S(r.due).slice(0, 10) < t);
    const dateOf = (r: Doc) => (S(r.issue_date) || S(r.at)).slice(0, 10);
    const thisFy = issues.filter((r) => dateOf(r) >= fy);

    /* by type: the open ones, and this financial year's — the pie reads whichever is asked */
    const count = (rows: Doc[]) => {
      const m = new Map<string, number>();
      for (const r of rows) { const k = S(r.type_of_support) || "(no type)"; m.set(k, (m.get(k) || 0) + 1); }
      return [...m.entries()].map(([type, n]) => ({ type, n })).sort((a, b) => b.n - a.n);
    };
    const warranty = (rows: Doc[]) => rows.filter((r) => /warrant/i.test(S(r.agreement_status)));
    const wAll = warranty(issues), wFy = warranty(thisFy), wOpen = warranty(open);
    const cost = (rows: Doc[]) => rows.reduce((a, r) => a + (Number(r.cost_spent) || 0), 0);

    return NextResponse.json({
      ok: true, today: t, fy_start: fy,
      amc: { total: amcs.length, live: live.length, live_value: liveValue },
      issues: {
        total: issues.length, open: open.length, overdue: overdue.length, this_fy: thisFy.length,
        by_type_open: count(open), by_type_fy: count(thisFy), by_type_all: count(issues),
      },
      warranty: { all: wAll.length, all_cost: cost(wAll), fy: wFy.length, fy_cost: cost(wFy), open: wOpen.length, open_cost: cost(wOpen) },
    });
  } catch (e) {
    return errJson(e);
  }
}
