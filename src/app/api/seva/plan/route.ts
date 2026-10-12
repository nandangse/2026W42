import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireSeva } from "@/lib/seva";
import { adminClient } from "@/lib/supabase/admin";
import { readBody } from "@/lib/validate";
import { mayPlan, serviceTeam, PLAN_WRITERS } from "@/lib/seva-team";

export const dynamic = "force-dynamic";

/**
 * /api/seva/plan — SERVICE TEAM PLAN DEPLOYMENT (Dr Raghu, 12 Oct 2026:
 * "This is like the roster. Have a screen saying Service Team Plan
 * Deployment. Should have calendar — daily, weekly, monthly, quarterly view.
 * Show the service persons on top. AMC due should be seen also based on
 * calendar. Aakash or Yash can make this.")
 *
 *   GET ?from&to   the team, the plan in the window, the AMC visits falling due
 *                  in it (from each live contract's dates and visit count),
 *                  and the contracts ending in the next 30 days
 *   POST save | remove | status   — Aakash, Yash, the owner
 */
const S = (v: unknown) => String(v ?? "").trim();
const KINDS = ["AMC visit", "Breakdown", "Installation", "Commissioning", "Training", "Spares delivery", "Office", "Leave", "Other"];
const LIVE = ["AMC valid paid", "Warranty", "Visit AMC Chargable"];
const day = (d: Date) => d.toISOString().slice(0, 10);
const istDay = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const isDate = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export async function GET(req: Request) {
  try {
    const me = await requireSeva();
    const admin = adminClient();
    const sp = new URL(req.url).searchParams;
    const from = isDate(sp.get("from")) ? String(sp.get("from")) : istDay();
    const to = isDate(sp.get("to")) ? String(sp.get("to")) : from;
    const today = istDay();
    const in30 = day(new Date(Date.parse(today + "T00:00:00Z") + 30 * 864e5));
    const [team, plansQ, amcQ] = await Promise.all([
      serviceTeam(admin),
      admin.from("seva_plan").select("*").gte("on_date", from).lte("on_date", to).order("on_date"),
      admin.from("seva_amc").select("id, customer, machine, location, territory, start_date, end_date, visits_planned, visits_done, engineer, status, erp_name").in("status", LIVE),
    ]);
    if (plansQ.error) { if (/does not exist|schema cache/i.test(plansQ.error.message)) return NextResponse.json({ installed: false, team, plans: [], due: [], expiring: [], kinds: KINDS }); throw plansQ.error; }
    const amcs = amcQ.data || [];
    /* the plans that cover an AMC, over the whole life of the contracts in view, so a visit planned a week early still counts */
    const amcIds = amcs.map((a) => a.id);
    const { data: amcPlans } = amcIds.length ? await admin.from("seva_plan").select("id, amc_id, on_date, employee_id, person_name, status").in("amc_id", amcIds).neq("status", "cancelled") : { data: [] };
    /* THE VISITS FALLING DUE: n visits spread evenly over the contract — the first on its start */
    const due: Record<string, unknown>[] = [];
    for (const a of amcs) {
      const n = Number(a.visits_planned) || 0;
      if (!a.start_date || !a.end_date || n <= 0) continue;
      const s = Date.parse(a.start_date + "T00:00:00Z"), e = Date.parse(a.end_date + "T00:00:00Z");
      if (!(e > s)) continue;
      const step = (e - s) / n;
      for (let i = 0; i < n; i++) {
        const at = day(new Date(s + i * step));
        const until = day(new Date(s + (i + 1) * step - 864e5));
        if (until < from || at > to) continue;
        const covered = (amcPlans || []).find((p) => p.amc_id === a.id && p.on_date >= at && p.on_date <= until);
        due.push({ amc_id: a.id, on_date: at < from ? from : at, due_on: at, window_to: until, visit_no: i + 1, visits: n, customer: a.customer, machine: a.machine, location: a.location, territory: a.territory, engineer: a.engineer, erp_name: a.erp_name, covered_by: covered ? { id: covered.id, on_date: covered.on_date, person_name: covered.person_name, status: covered.status } : null });
      }
    }
    /* "track live AMC expiration dates … 30 days prior to contract expiration … initiate the renewal quotation" */
    const expiring = amcs.filter((a) => a.end_date && a.end_date >= today && a.end_date <= in30).sort((x, y) => String(x.end_date).localeCompare(String(y.end_date)));
    return NextResponse.json({ installed: true, from, to, today, team, plans: plansQ.data || [], due, expiring, kinds: KINDS, mayPlan: mayPlan(me.email, me.isOwner), writers: PLAN_WRITERS });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const me = await requireSeva();
    if (!mayPlan(me.email, me.isOwner)) throw new HttpError(403, "Aakash or Yash makes the plan.");
    const admin = adminClient();
    const b = await readBody(req, { action: "string" });
    if (b.action === "save") {
      const on_date = S(b.on_date); if (!isDate(on_date)) throw new HttpError(400, "Which day?");
      const ids: string[] = (Array.isArray(b.employee_ids) ? b.employee_ids : [b.employee_id]).map(S).filter(Boolean);
      if (!ids.length) throw new HttpError(400, "Who goes?");
      const team = await serviceTeam(admin);
      const nameOf = (id: string) => team.find((t) => t.id === id)?.name || "";
      const kind = KINDS.includes(S(b.kind)) ? S(b.kind) : "Other";
      const base = { on_date, kind, customer: S(b.customer), site: S(b.site), amc_id: S(b.amc_id) || null, issue: S(b.issue) || null, backup_id: S(b.backup_id) || null, notes: S(b.notes), updated_at: new Date().toISOString() };
      if (b.id) {
        const { error } = await admin.from("seva_plan").update({ ...base, employee_id: ids[0], person_name: nameOf(ids[0]), status: ["planned", "done", "missed", "cancelled"].includes(S(b.status)) ? S(b.status) : "planned" }).eq("id", S(b.id));
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }
      /* one line per person — two technicians on the same visit are two lines on the roster */
      const { error } = await admin.from("seva_plan").insert(ids.map((id) => ({ ...base, employee_id: id, person_name: nameOf(id), created_by: me.email })));
      if (error) throw error;
      return NextResponse.json({ ok: true, made: ids.length });
    }
    if (b.action === "status") {
      const status = S(b.status); if (!["planned", "done", "missed", "cancelled"].includes(status)) throw new HttpError(400, "Not a status.");
      const { error } = await admin.from("seva_plan").update({ status, updated_at: new Date().toISOString() }).eq("id", S(b.id));
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (b.action === "move") {
      const on_date = S(b.on_date); if (!isDate(on_date)) throw new HttpError(400, "Which day?");
      const patch: Record<string, unknown> = { on_date, updated_at: new Date().toISOString() };
      if (S(b.employee_id)) { const team = await serviceTeam(admin); patch.employee_id = S(b.employee_id); patch.person_name = team.find((t) => t.id === S(b.employee_id))?.name || ""; }
      const { error } = await admin.from("seva_plan").update(patch).eq("id", S(b.id));
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (b.action === "remove") {
      const { error } = await admin.from("seva_plan").delete().eq("id", S(b.id));
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    throw new HttpError(400, "Unknown action.");
  } catch (e) { return errJson(e); }
}
