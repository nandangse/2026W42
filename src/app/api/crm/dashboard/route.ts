import { NextResponse } from "next/server";
import { swallow } from "@/lib/swallow";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { crmDb, crmConfigured, CrmNotConfigured } from "@/crm/db";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

/**
 * GET /api/crm/dashboard?from&to&scope=me|team
 *
 * The salesperson's cockpit. scope=me is anybody's own numbers; scope=team
 * is the whole desk and opens only to the CEO, the Sales Head and admin —
 * a salesperson's dashboard is a mirror, not a leaderboard.
 *
 * COLLECTIONS is the one honest compromise on this page: the CRM has no
 * receipts ledger, so it reads the invoices ERP marks Paid, and the box
 * says so. When a receipts feed arrives, this is the one line to change.
 */
const CALL_KINDS = ["Follow Up Call", "Cold call"];
const VISIT_KINDS = ["Follow Up Visit", "Cold Visit", "Existing Customer Visit"];
const OPEN_OPP_CODES = ["new", "waiting_for_data", "consultative_presentation"];
const TARGET_CODES = ["bucket_0", "bucket_a", "bucket_b", "this_month", "next_month"];

export async function GET(req: Request) {
  try {
    const me = await requireCrm();
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    const db = crmDb();
    const u = new URL(req.url);
    const from = u.searchParams.get("from") ?? "1900-01-01";
    const to = u.searchParams.get("to") ?? "2999-12-31";

    const allowedTeam = ["ceo", "sales_head", "admin"].includes(String(me.crmRole));
    const scope = u.searchParams.get("scope") === "team" && allowedTeam ? "team" : "me";
    const mine = scope === "me" ? me.profileId : null;
    if (scope === "me" && !mine)
      return NextResponse.json({ error: "Your login has no CRM profile row yet — add yourself under Settings → Users." }, { status: 409 });

    const weeks = Math.max(1, (new Date(to + "T00:00:00").getTime() - new Date(from + "T00:00:00").getTime()) / 6048e5);

    // ---- the stages, once ----
    const { data: stages } = await db.from("stage").select("id, code, name");
    const idOf = (code: string) => (stages || []).find((s) => s.code === code)?.id as number | undefined;
    const codeById = new Map((stages || []).map((s) => [Number(s.id), String(s.code)]));
    const openOppIds = OPEN_OPP_CODES.map(idOf).filter(Boolean) as number[];
    const targetIds = TARGET_CODES.map(idOf).filter(Boolean) as number[];

    // Each query written out plainly; scope=me adds the owner clause. A
    // clever generic here sent TypeScript into the weeds — plain wins.
    let soQ = db.from("sales_order").select("amount").gte("ordered_on", from).lte("ordered_on", to);
    if (mine) soQ = soQ.eq("owner_id", mine);
    let invQ = db.from("sales_invoice").select("amount, erp_status").gte("invoiced_on", from).lte("invoiced_on", to);
    if (mine) invQ = invQ.eq("owner_id", mine);
    let intQ = db.from("interaction").select("kind").gte("happened_at", from).lte("happened_at", to);
    if (mine) intQ = intQ.eq("by_id", mine);
    let qQ = db.from("quotation").select("grand_total, quoted_value").gte("created_at", from).lte("created_at", to + "T23:59:59");
    if (mine) qQ = qQ.eq("owner_id", mine);
    let tQ = db.from("task").select("id").in("status", ["todo", "in_progress", "blocked"]);
    if (mine) tQ = tQ.eq("assignee_id", mine);
    let ooQ = db.from("opportunity").select("id, name, amount, stage_id, company_id").in("stage_id", openOppIds).is("deleted_at", null);
    if (mine) ooQ = ooQ.eq("owner_id", mine);
    let tgQ = db.from("quotation").select("id, quote_no, grand_total, quoted_value, stage_id, company_id, opportunity_id").in("stage_id", targetIds);
    if (mine) tgQ = tgQ.eq("owner_id", mine);
    const histQ = db.from("opportunity_stage_history").select("opportunity_id").gte("entered_at", from).lte("entered_at", to + "T23:59:59");

    const [so, inv, calls, quotes, tasksOpen, openOpps, targetQ, oppsHandled] = await Promise.all([
      soQ, invQ, intQ, qQ, tQ, ooQ, tgQ, histQ,
    ]);

    for (const r of [so, inv, calls, quotes, tasksOpen, openOpps, targetQ])
      if (r.error) throw new HttpError(500, r.error.message);

    // opportunities handled: distinct opportunities whose stage moved in range;
    // when scoped to me, count only opportunities I own
    let handled = 0;
    {
      const hist = (oppsHandled.error ? [] : oppsHandled.data || []) as Row[];
      const ids = [...new Set(hist.map((h) => String(h.opportunity_id)))];
      if (!mine) handled = ids.length;
      else if (ids.length) {
        let n = 0;
        for (let i = 0; i < ids.length; i += 150) {
          const { data } = await db.from("opportunity").select("id").eq("owner_id", mine).in("id", ids.slice(i, i + 150));
          n += (data || []).length;
        }
        handled = n;
      }
    }

    const num = (v: unknown) => Number(v) || 0;
    const soRows = (so.data || []) as Row[];
    const invRows = (inv.data || []) as Row[];
    const callRows = (calls.data || []) as Row[];
    const qRows = (quotes.data || []) as Row[];

    const metrics = {
      booking: { n: soRows.length, value: soRows.reduce((a, r) => a + num(r.amount), 0) },
      billing: { n: invRows.length, value: invRows.reduce((a, r) => a + num(r.amount), 0) },
      collections: {
        n: invRows.filter((r) => /paid/i.test(String(r.erp_status || ""))).length,
        value: invRows.filter((r) => /paid/i.test(String(r.erp_status || ""))).reduce((a, r) => a + num(r.amount), 0),
      },
      calls: { n: callRows.filter((r) => CALL_KINDS.includes(String(r.kind))).length },
      visits: { n: callRows.filter((r) => VISIT_KINDS.includes(String(r.kind))).length },
      video_calls: { n: callRows.filter((r) => String(r.kind) === "Video Call").length },
      quotations: { n: qRows.length, value: qRows.reduce((a, r) => a + (num(r.grand_total) || num(r.quoted_value)), 0) },
      opportunities_handled: { n: handled },
      tasks_open: { n: ((tasksOpen.data || []) as Row[]).length },
    };

    // ---- names for the chips ----
    const companyIds = [...new Set([...(openOpps.data || []), ...(targetQ.data || [])].map((r) => (r as Row).company_id).filter(Boolean).map(String))];
    const companyName = new Map<string, string>();
    for (let i = 0; i < companyIds.length; i += 150) {
      const { data } = await db.from("company").select("id, name").in("id", companyIds.slice(i, i + 150));
      for (const c of data || []) companyName.set(String(c.id), String(c.name ?? ""));
    }
    const oppName = new Map<string, string>();
    {
      const ids = [...new Set(((targetQ.data || []) as Row[]).map((q) => q.opportunity_id).filter(Boolean).map(String))];
      for (let i = 0; i < ids.length; i += 150) {
        const { data } = await db.from("opportunity").select("id, name").in("id", ids.slice(i, i + 150));
        for (const o of data || []) oppName.set(String(o.id), String(o.name ?? ""));
      }
    }

    /**
     * The year the run-rate races against: April to March. Achieved-FYTD is
     * measured fresh here (not from the chosen range), and the weeks left
     * are to 31 March — the target does not care which filter is on screen.
     */
    const now = new Date();
    const fyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    const fyStart = `${fyStartYear}-04-01`;
    const fyEnd = `${fyStartYear + 1}-03-31`;
    const today = now.toISOString().slice(0, 10);
    const weeksLeft = Math.max(1, (new Date(fyEnd + "T00:00:00").getTime() - now.getTime()) / 6048e5);
    const weeksGone = Math.max(0.1, (now.getTime() - new Date(fyStart + "T00:00:00").getTime()) / 6048e5);

    let soF = db.from("sales_order").select("amount").gte("ordered_on", fyStart).lte("ordered_on", today);
    if (mine) soF = soF.eq("owner_id", mine);
    let invF = db.from("sales_invoice").select("amount, erp_status").gte("invoiced_on", fyStart).lte("invoiced_on", today);
    if (mine) invF = invF.eq("owner_id", mine);
    let intF = db.from("interaction").select("kind").gte("happened_at", fyStart).lte("happened_at", today);
    if (mine) intF = intF.eq("by_id", mine);
    let qF = db.from("quotation").select("grand_total, quoted_value").gte("created_at", fyStart).lte("created_at", today + "T23:59:59");
    if (mine) qF = qF.eq("owner_id", mine);
    const [soY, invY, intY, qY] = await Promise.all([soF, invF, intF, qF]);
    const yr = {
      booking: ((soY.data || []) as Row[]).reduce((a, r) => a + num(r.amount), 0),
      billing: ((invY.data || []) as Row[]).reduce((a, r) => a + num(r.amount), 0),
      collections: ((invY.data || []) as Row[]).filter((r) => /paid/i.test(String(r.erp_status || ""))).reduce((a, r) => a + num(r.amount), 0),
      calls: ((intY.data || []) as Row[]).filter((r) => CALL_KINDS.includes(String(r.kind))).length,
      visits: ((intY.data || []) as Row[]).filter((r) => VISIT_KINDS.includes(String(r.kind))).length,
      video_calls: ((intY.data || []) as Row[]).filter((r) => String(r.kind) === "Video Call").length,
      quotations_value: ((qY.data || []) as Row[]).reduce((a, r) => a + (num(r.grand_total) || num(r.quoted_value)), 0),
      quotations_nos: ((qY.data || []) as Row[]).length,
    };

    // the plan: mine, or every salesperson's summed for the team view
    const fy = `${fyStartYear}-${String(fyStartYear + 1).slice(2)}`;
    let targets: Record<string, number> = {};
    try {
      let pq = db.from("salesperson_plan").select("profile_id, targets").eq("fy", fy);
      if (mine) pq = pq.eq("profile_id", mine);
      const { data: plans } = await pq;
      for (const pRow of plans || []) {
        const t = (pRow.targets || {}) as Record<string, number>;
        for (const [k, v] of Object.entries(t)) targets[k] = (targets[k] || 0) + (Number(v) || 0);
      }
    } catch (e) { swallow("crm/dashboard", e); /* pre-0020 */ }

    return NextResponse.json({
      scope, allowedTeam, weeks: Math.round(weeks * 10) / 10, metrics,
      fy, fyEnd, weeksLeft: Math.round(weeksLeft * 10) / 10, weeksGone: Math.round(weeksGone * 10) / 10,
      fytd: yr, targets,
      openOpportunities: ((openOpps.data || []) as Row[]).map((o) => ({
        id: String(o.id), title: String(o.name ?? ""),
        company: o.company_id ? companyName.get(String(o.company_id)) ?? null : null,
        amount: num(o.amount),
        group: codeById.get(Number(o.stage_id)) === "new" ? "new" : "handled",
      })),
      targetQuotations: ((targetQ.data || []) as Row[]).map((q) => ({
        id: String(q.id),
        title: q.opportunity_id ? oppName.get(String(q.opportunity_id)) || String(q.quote_no ?? "") : String(q.quote_no ?? ""),
        company: q.company_id ? companyName.get(String(q.company_id)) ?? null : null,
        amount: num(q.grand_total) || num(q.quoted_value),
        bucket: codeById.get(Number(q.stage_id)) ?? "",
      })),
    });
  } catch (e) {
    return errJson(e);
  }
}
