import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { requireCeo } from "@/lib/ceo/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/ceo/room?name=people|strategy|execution|cash|reviews|exceptions —
 * the CEO's rooms (Dr Raghu, 14 Oct 2026: "show on the left side Menu —
 * Dashboard, People, Strategy, Execution, Cash, Reviews, Exceptions"). Each
 * room reads what Genie already holds for it; nothing is typed here.
 */
type R = Record<string, unknown>;
const S = (v: unknown) => String(v ?? "").trim();
const N = (v: unknown) => Number(v) || 0;
const istDay = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const addDays = (d: string, n: number) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
async function all(q: (a: number, b: number) => PromiseLike<{ data: R[] | null; error: { message: string } | null }>): Promise<R[]> {
  const out: R[] = [];
  for (let a = 0; a < 200000; a += 1000) { const { data, error } = await q(a, a + 999); if (error) throw new Error(error.message); out.push(...(data || [])); if (!data || data.length < 1000) break; }
  return out;
}
/** the open bills by party — receivable (positive) or payable (negative, turned positive) — with the part over 180 days */
async function byParty(admin: ReturnType<typeof adminClient>, kind: "receivable" | "payable", today: string) {
  const bills = await all((a, b) => admin.from("kuber_bill").select("party, amount, bill_date").eq("kind", kind).order("id").range(a, b));
  const old = addDays(today, -180); const m = new Map<string, { party: string; open: number; over180: number; bills: number; oldest: string }>();
  for (const b of bills) {
    const amt = kind === "receivable" ? N(b.amount) : -N(b.amount); if (amt <= 0) continue;
    const x = m.get(S(b.party)) || { party: S(b.party), open: 0, over180: 0, bills: 0, oldest: "9999" };
    x.open += amt; x.bills++; if (S(b.bill_date) && S(b.bill_date) < old) x.over180 += amt; if (S(b.bill_date) && S(b.bill_date) < x.oldest) x.oldest = S(b.bill_date);
    m.set(x.party, x);
  }
  return [...m.values()].map((x) => ({ ...x, open: Math.round(x.open), over180: Math.round(x.over180), oldest: x.oldest === "9999" ? null : x.oldest }));
}

export async function GET(req: Request) {
  try {
    await requireCeo();
    const admin = adminClient();
    const name = S(new URL(req.url).searchParams.get("name"));
    const today = istDay();

    if (name === "people") {
      const emps = await all((a, b) => admin.from("hrms_employees").select("id, name, department, designation, doj, active, location").order("id").range(a, b));
      const act = emps.filter((e) => e.active !== false);
      const dep: Record<string, number> = {}; for (const e of act) dep[S(e.department) || "—"] = (dep[S(e.department) || "—"] || 0) + 1;
      const joiners = act.filter((e) => S(e.doj) >= addDays(today, -90)).sort((a, b) => S(b.doj).localeCompare(S(a.doj))).map((e) => ({ name: S(e.name), department: S(e.department), designation: S(e.designation), doj: S(e.doj) }));
      const tenure = act.map((e) => (S(e.doj) ? days(S(e.doj), today) / 365 : null)).filter((x): x is number => x !== null);
      const band = { "under 1 year": 0, "1–3 years": 0, "3–5 years": 0, "5–10 years": 0, "10 years and more": 0 } as Record<string, number>;
      for (const y of tenure) band[y < 1 ? "under 1 year" : y < 3 ? "1–3 years" : y < 5 ? "3–5 years" : y < 10 ? "5–10 years" : "10 years and more"]++;
      return NextResponse.json({ headcount: act.length, left_on_roll: emps.length - act.length, by_department: dep, joiners, tenure: band });
    }

    if (name === "strategy") {
      const [{ data: sections }, { data: kpis }, values] = await Promise.all([
        admin.from("lc_section").select("id, kind, title, approved_at, updated_at").order("sort", { ascending: true }),
        admin.from("lc_kpi").select("id, name, group, type, formula, sort, visibility").eq("active", true).order("sort"),
        all((a, b) => admin.from("lc_kpi_value").select("kpi_id, month, value").order("month", { ascending: false }).range(a, b)),
      ]);
      const months = [...new Set(values.map((v) => S(v.month).slice(0, 7)))].sort().reverse().slice(0, 6);
      return NextResponse.json({
        philosophy: (sections || []).filter((s) => s.kind === "philosophy"), principles: (sections || []).filter((s) => s.kind === "principles").length,
        months, kpis: (kpis || []).map((k) => ({ ...k, values: Object.fromEntries(values.filter((v) => v.kpi_id === k.id).map((v) => [S(v.month).slice(0, 7), N(v.value)])) })),
      });
    }

    if (name === "execution") {
      const [{ data: jobs }, dj, { data: so }, { data: plans }] = await Promise.all([
        admin.from("jobs").select("id, cust, tag, tdd, own, stat, val, pct").eq("delivered", false).eq("active", true).order("tdd"),
        all((a, b) => admin.from("delivered_jobs").select("id, cust, tag, val, delivered_on").gte("delivered_on", addDays(today, -90)).order("id").range(a, b)),
        admin.from("seva_service_order").select("so_no, customer, status, spares_amount, service_amount, manager_name, so_date").not("status", "in", "(Closed,Cancelled,Invoiced)").order("so_date", { ascending: false }),
        admin.from("seva_plan").select("on_date, person_name, kind, customer, status").gte("on_date", today).lte("on_date", addDays(today, 7)).order("on_date"),
      ]);
      const live = (jobs || []).map((j) => ({ id: S(j.id), cust: S(j.cust), tag: S(j.tag), tdd: S(j.tdd) || null, own: S(j.own).split("@")[0], stat: S(j.stat), val: N(j.val), late: S(j.tdd) && S(j.tdd) < today ? days(S(j.tdd), today) : 0 }));
      const byMonth: Record<string, { n: number; val: number }> = {}; for (const d of dj) { const m = S(d.delivered_on).slice(0, 7); byMonth[m] = { n: (byMonth[m]?.n || 0) + 1, val: (byMonth[m]?.val || 0) + N(d.val) }; }
      return NextResponse.json({ live, delivered90: byMonth, service_orders: so || [], next7: plans || [] });
    }

    if (name === "cash") {
      const [rec, pay, { data: plan }] = await Promise.all([
        byParty(admin, "receivable", today), byParty(admin, "payable", today),
        admin.from("kuber_payment_plan").select("plan_date, party, amount, purpose, status").in("status", ["planned", "approved"]).order("plan_date"),
      ]);
      const sum = (xs: { open: number; over180: number }[]) => ({ open: xs.reduce((s, x) => s + x.open, 0), over180: xs.reduce((s, x) => s + x.over180, 0), parties: xs.length });
      return NextResponse.json({
        receivable: sum(rec), payable: sum(pay),
        top_receivable: rec.sort((a, b) => b.open - a.open).slice(0, 15), top_payable: pay.sort((a, b) => b.open - a.open).slice(0, 15),
        plan: { planned: (plan || []).filter((p) => p.status === "planned").reduce((s, p) => s + N(p.amount), 0), approved: (plan || []).filter((p) => p.status === "approved").reduce((s, p) => s + N(p.amount), 0), rows: (plan || []).slice(0, 25) },
      });
    }

    if (name === "reviews") {
      const [{ data: meetings }, { data: checkins }, { data: audits }, { data: ncs }] = await Promise.all([
        admin.from("lc_meeting").select("id, held_on, location, attendees, minutes").order("held_on", { ascending: false }).limit(12),
        admin.from("lc_checkin").select("meeting_id"),
        admin.from("ims_internal_audit").select("id, audit_no, status, date_start, target_end, departments").order("date_start", { ascending: false }).limit(10),
        admin.from("ims_nonconformity").select("audit_id, status"),
      ]);
      return NextResponse.json({
        meetings: (meetings || []).map((m) => ({ id: m.id, held_on: m.held_on, location: m.location, attendees: (m.attendees || []).length, minutes: !!S(m.minutes), checkins: (checkins || []).filter((c) => c.meeting_id === m.id).length })),
        audits: (audits || []).map((a) => ({ ...a, ncs: (ncs || []).filter((n) => n.audit_id === a.id).length, open_ncs: (ncs || []).filter((n) => n.audit_id === a.id && !/closed/i.test(S(n.status))).length })),
      });
    }

    if (name === "exceptions") {
      const [{ data: jobs }, rec, issues, { data: amcs }, { data: probs }, { data: sends }] = await Promise.all([
        admin.from("jobs").select("id, cust, tag, tdd, own, val").eq("delivered", false).eq("active", true).lt("tdd", today).order("tdd"),
        byParty(admin, "receivable", today),
        all((a, b) => admin.from("seva_issue").select("erp_name, title, customer, status, issue_date, at").not("status", "ilike", "%closed%").not("status", "ilike", "%resolved%").order("id").range(a, b)),
        admin.from("seva_amc").select("erp_name, customer, end_date, value").eq("status", "AMC valid paid").lt("end_date", today),
        admin.from("lc_problem").select("id, title, status, tentative_on").in("status", ["needs_deep_dive", "new", "under_process"]),
        admin.from("seva_quote_send").select("erp_name, asked_by, asked_at").eq("status", "awaiting_approval"),
      ]);
      const oldTickets = issues.map((i) => ({ erp_name: S(i.erp_name), title: S(i.title), customer: S(i.customer), status: S(i.status), age: days(S(i.issue_date || i.at).slice(0, 10), today) })).filter((i) => i.age > 90).sort((a, b) => b.age - a.age);
      return NextResponse.json({
        late_jobs: (jobs || []).map((j) => ({ id: S(j.id), cust: S(j.cust), tag: S(j.tag), tdd: S(j.tdd), own: S(j.own).split("@")[0], val: N(j.val), late: days(S(j.tdd), today) })),
        debt_180: rec.filter((r) => r.over180 > 0).sort((a, b) => b.over180 - a.over180).slice(0, 20),
        old_tickets: { count: oldTickets.length, rows: oldTickets.slice(0, 20).map((i) => ({ erp_name: i.erp_name, title: i.title, customer: i.customer, status: i.status, age: i.age })) },
        amc_lapsed: amcs || [],
        problems: { blocked: (probs || []).filter((p) => p.status === "needs_deep_dive"), overdue: (probs || []).filter((p) => S(p.tentative_on) && S(p.tentative_on) < today && p.status !== "needs_deep_dive") },
        quotes_waiting: sends || [],
      });
    }
    throw new HttpError(400, "Which room?");
  } catch (e) { return errJson(e); }
}
